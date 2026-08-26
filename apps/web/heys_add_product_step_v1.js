// heys_add_product_step_v1.js — Шаг добавления продукта через StepModal
// Двухшаговый flow: поиск → граммы/порции
//
// MODULE MAP (agent navigation — jump by line; do not read whole file)
// Related docs: docs/reference/systems/PRODUCTS_AND_SEARCH.md
//                 apps/web/ARCHITECTURE.md (OverlayStore, commit gate)
//
//   ~4    IIFE entry — React hooks, daytrace helpers, meal-flow events
//  ~97    GLOBAL PRODUCTS VERSION — preset suggestion engine trigger
// ~128    UTILS — read/write stored values, barcode camera session
// ~318    BARCODE + BRAND — normalizeBarcode, brand extraction, merge rules
// ~660    OVERLAY UPSERT — upsertProductOverlayRow (TypeA/TypeB rows)
// ~714    LOCAL UPSERT — upsertLocalProduct (legacy + overlay bridge)
// ~755    COMMIT GATE — showProductCommitError, commitPersonalProduct
// ~1147   SHARED NORMALIZE — normalizeSharedProductForAddStep, merge barcode match
// ~1529   MEAL CASCADE — cascadeMealItemsOnProductUpdate (rename/nutrients → days)
// ~1691   BATCH CASCADE — cascadeBatchProductUpdates (cloud sync listener)
// ~1928   SHARED WRITE — updateSharedProduct, updateSharedProductPortions
// ~2261   SMART LIST — computeSmartProducts, computeRecentProducts
// ~2449   CATEGORY FILTER — CATEGORIES, matchCategory
// ~2471   MEAL PRESETS OVERLAY — MealPresetsOverlay, resolveContextMeal
// ~3253   STEP 1 SEARCH UI — BarcodeScannerModal, ProductBarcodeManager
// ~3989   ProductSearchStep — search/filter/select, barcode detect, smart list
// ~6091   CreateProductStep — AI-assisted new product wizard
// ~7062   ProductEditBasicStep — name, macros, brand (editor step 1)
// ~7660   ProductEditExtraStep — vitamins, additives (editor step 2)
// ~8003   PortionsStep — portion presets editor
// ~8427   PENDING MODERATION QUEUE — retry tail for «save local only»
// ~8602   MODERATION OUTCOMES — APS_MODERATION_OUTCOME_META, commit error views
// ~8996   HarmSelectStep — harm score picker (minimal UI)
// ~9535   GramsStep — grams/portions picker (add-to-meal step 2)
// ~10135  showEditProductModal — full 3-step product editor
// ~10674  showAddProductModal — main entry (search → grams flow)
// ~10982  showEditGramsModal — edit grams from meal card
// ~11053  HEYS.AddProductStep export — public API surface
// ~11075  GLOBAL LISTENERS — initializeGlobalProductListeners (edit flow events)

if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef, useContext } = React;
  // useDeferredValue (React 18+) — деферим heavy filter под печать.
  const useDeferredValue = React.useDeferredValue || ((v) => v);

  function isDayTraceDebugEnabled() {
    try {
      return global.__heysLogControl?.isEnabled?.('daytrace') === true
        || global.__heysLogControl?.isEnabled?.('day-trace') === true
        || global.localStorage?.getItem('heys_debug_daytrace') === '1';
    } catch (_) {
      return false;
    }
  }

  function logDayTrace(...args) {
    if (isDayTraceDebugEnabled()) console.info(...args);
  }

  function dispatchMealFlowFinishedFromContext(source, context, extra = {}) {
    try {
      window.dispatchEvent(new CustomEvent('heys:meal-flow-finished', {
        detail: {
          source,
          dateKey: context?.dateKey || HEYS.Day?.getDay?.()?.date || null,
          mealIndex: context?.mealIndex ?? null,
          mealId: context?.mealId ?? null,
          ...extra,
        },
      }));
    } catch (_) {
      // ignore
    }
  }

  function BarcodeScanIcon() {
    return React.createElement('svg', {
      className: 'aps-search-barcode-icon',
      viewBox: '0 0 32 32',
      'aria-hidden': 'true',
      focusable: 'false'
    },
      React.createElement('path', {
        d: 'M10.2 5.8H7.4a1.9 1.9 0 0 0-1.9 1.9v3M21.8 5.8h2.8a1.9 1.9 0 0 1 1.9 1.9v3M5.5 21.3v3a1.9 1.9 0 0 0 1.9 1.9h2.8M26.5 21.3v3a1.9 1.9 0 0 1-1.9 1.9h-2.8',
        fill: 'none',
        stroke: 'currentColor',
        strokeLinecap: 'round',
        strokeWidth: '1.8'
      }),
      React.createElement('path', {
        d: 'M10.25 11.1v9.8M13.1 11.8v8.4M16 10.5v11M18.9 11.8v8.4M21.75 11.1v9.8',
        fill: 'none',
        stroke: 'currentColor',
        strokeLinecap: 'round',
        strokeWidth: '2.15'
      })
    );
  }

  function BarcodeBarsIcon() {
    return React.createElement('svg', {
      className: 'aps-product-barcode-icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false'
    },
      React.createElement('path', {
        d: 'M6.6 6.8v10.4M9.2 7.6v8.8M12 6.3v11.4M14.8 7.6v8.8M17.4 6.8v10.4',
        fill: 'none',
        stroke: 'currentColor',
        strokeLinecap: 'round',
        strokeWidth: '2.05'
      })
    );
  }

  function PencilEditIcon() {
    return React.createElement('svg', {
      className: 'aps-product-edit-icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false'
    },
      React.createElement('path', {
        d: 'M12 20h9'
      }),
      React.createElement('path', {
        d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'
      })
    );
  }

  // === ГЛОБАЛЬНЫЙ СЧЁТЧИК ВЕРСИИ ПРОДУКТОВ ===
  // Должен быть доступен всем компонентам внутри модуля
  let globalProductsVersion = 0;
  let lastPresetSuggestionRunAt = 0;
  const PRESET_SUGGESTION_COOLDOWN_MS = 60 * 1000;

  function runPresetSuggestions({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastPresetSuggestionRunAt < PRESET_SUGGESTION_COOLDOWN_MS) {
      return HEYS.store?.getSuggestedPresets?.()?.length || 0;
    }
    const result = HEYS.store?.runPresetSuggestionEngine?.();
    if (result != null) lastPresetSuggestionRunAt = now;
    return result;
  }

  function getProductsWatchSignature(products) {
    if (!Array.isArray(products)) return 'not-array';
    return products.map((product) => {
      const id = product?.id ?? product?.product_id ?? product?.name ?? '';
      const updatedAt = product?.updatedAt ?? product?.updated_at ?? '';
      const barcodes = getProductBarcodes(product).join(',');
      return `${id}:${updatedAt}:${barcodes}`;
    }).join('|');
  }

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.warn('[HEYS] AddProductStep: StepModal not loaded yet');
  }

  // === Утилиты ===
  const U = () => HEYS.utils || {};
  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const readStoredValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  };

  const readGlobalValue = (key, fallback) => {
    try {
      if (HEYS.store?.get && /^heys_(clients|client_current)$/i.test(key)) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  };

  const writeRawValue = (key, value) => {
    try {
      if (HEYS.store?.set) { HEYS.store.set(key, value); return; }
      const utils = (HEYS.utils || {});
      if (utils.lsSet) { utils.lsSet(key, value); return; }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch { }
  };

  const BARCODE_CAMERA_AUTOSTART_KEY = 'heys_barcode_camera_autostart';

  const stopBarcodeCameraStream = (stream) => {
    try { stream?.getTracks?.().forEach((track) => track.stop()); } catch (_) { }
    try {
      const session = HEYS.__barcodeCameraSession;
      if (session?.stream === stream) {
        if (session.stopTimer) clearTimeout(session.stopTimer);
        HEYS.__barcodeCameraSession = null;
      }
    } catch (_) { }
  };

  const isBarcodeCameraStreamLive = (stream) => {
    try {
      const tracks = stream?.getVideoTracks?.() || [];
      return !!stream?.active && tracks.some((track) => track.readyState === 'live');
    } catch (_) {
      return false;
    }
  };

  const retainBarcodeCameraStream = (stream) => {
    if (!isBarcodeCameraStreamLive(stream)) return stream;
    const existing = HEYS.__barcodeCameraSession;
    if (existing?.stopTimer) clearTimeout(existing.stopTimer);
    if (existing?.stream && existing.stream !== stream) stopBarcodeCameraStream(existing.stream);
    HEYS.__barcodeCameraSession = {
      stream,
      retainedAt: Date.now(),
      stopTimer: null
    };
    return stream;
  };

  const scheduleBarcodeCameraRelease = (stream) => {
    stopBarcodeCameraStream(stream);
  };

  const requestBarcodeCameraStream = async (appendDebug = () => { }) => {
    const requestCamera = async (constraints) => navigator.mediaDevices.getUserMedia(constraints);
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      appendDebug('getUserMedia.primary.request', { constraints });
      const stream = await requestCamera(constraints);
      appendDebug('getUserMedia.primary.success');
      return stream;
    } catch (primaryError) {
      appendDebug('getUserMedia.primary.failed', {
        error: {
          name: primaryError?.name || null,
          message: primaryError?.message || String(primaryError)
        }
      });
      console.warn('[HEYS.barcode] primary camera constraints failed', {
        name: primaryError?.name,
        message: primaryError?.message
      });
      try {
        const constraints = {
          video: {
            facingMode: 'environment'
          },
          audio: false
        };
        appendDebug('getUserMedia.environment.request', { constraints });
        const stream = await requestCamera(constraints);
        appendDebug('getUserMedia.environment.success');
        return stream;
      } catch (secondaryError) {
        appendDebug('getUserMedia.environment.failed', {
          error: {
            name: secondaryError?.name || null,
            message: secondaryError?.message || String(secondaryError)
          }
        });
        console.warn('[HEYS.barcode] environment camera fallback failed', {
          name: secondaryError?.name,
          message: secondaryError?.message
        });
        appendDebug('getUserMedia.basic.request', { constraints: { video: true, audio: false } });
        const stream = await requestCamera({ video: true, audio: false });
        appendDebug('getUserMedia.basic.success');
        return stream;
      }
    }
  };

  const createBarcodeCameraStart = () => {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const events = [];
    const appendDebug = (stage, data = {}) => {
      events.push({ at: new Date().toISOString(), stage, data });
    };
    const streamPromise = requestBarcodeCameraStream(appendDebug)
      .then((stream) => {
        HEYS.__barcodeCameraAutoStart = true;
        writeRawValue(BARCODE_CAMERA_AUTOSTART_KEY, true);
        return retainBarcodeCameraStream(stream);
      })
      .catch((error) => {
        console.warn('[HEYS.barcode] prestarted camera request failed', {
          name: error?.name,
          message: error?.message
        });
        throw error;
      });
    return {
      requestedAt: Date.now(),
      reused: false,
      events,
      streamPromise
    };
  };

  const stopBarcodeCameraStart = (cameraStart) => {
    cameraStart?.streamPromise?.then(scheduleBarcodeCameraRelease).catch(() => { });
  };

  const isGarbageBarcode = (code) => {
    if (!code) return true;
    if (/^OBJECTOBJECT$/i.test(code)) return true;
    if (/^(UNDEFINED|NULL|NAN)$/i.test(code)) return true;
    if (/^(.+)\1+$/.test(code) && code.length >= 8) return true;
    return false;
  };

  const normalizeBarcode = (value) => {
    if (value == null) return '';
    const cleaned = String(value).trim().replace(/[\s-]+/g, '').toUpperCase();
    const alnum = cleaned.replace(/[^0-9A-Z]/g, '');
    if (isGarbageBarcode(alnum)) return '';
    return alnum.length >= 6 && alnum.length <= 32 ? alnum : '';
  };

  const getProductBarcodes = (product) => {
    if (!product) return [];
    const raw = [
      product.barcode,
      ...(Array.isArray(product.barcodes) ? product.barcodes : []),
      product.ean,
      product.upc,
      product.barcode_value
    ];
    const seen = new Set();
    const out = [];
    raw.forEach((value) => {
      const code = normalizeBarcode(value);
      if (!code || seen.has(code)) return;
      seen.add(code);
      out.push(code);
    });
    return out;
  };

  const getProductBarcode = (product) => getProductBarcodes(product)[0] || '';

  const normalizeProductBrand = (value) => {
    const brand = String(value || '').trim().replace(/\s+/g, ' ');
    return brand || '';
  };

  const getProductBrand = (product) => normalizeProductBrand(
    product?.brand ?? product?.overrides?.brand
  );

  const normalizeBrandCompare = (value) => String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const shouldDisplayProductBrand = (product) => {
    const brand = getProductBrand(product);
    if (!brand) return false;
    const nameNorm = normalizeBrandCompare(product?.name);
    const brandNorm = normalizeBrandCompare(brand);
    if (!nameNorm || !brandNorm) return true;
    return !(nameNorm === brandNorm || nameNorm.startsWith(brandNorm + ' ') || nameNorm.endsWith(' ' + brandNorm));
  };

  const KNOWN_BRAND_EXTRACTION_RULES = [
    'Nestlé Хрутка',
    'Nestle Хрутка',
    'Простоквашино',
    'Ясно Солнышко',
    'Хрутка',
    'Bombbar',
    'Levro',
    'Raffaello',
    'Savoiardi'
  ];

  const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const removeBrandFromProductName = (name, brand, options = {}) => {
    const rawName = String(name || '').trim().replace(/\s+/g, ' ');
    const rawBrand = normalizeProductBrand(brand);
    if (!rawName || !rawBrand) return rawName;
    const brandPattern = rawBrand.split(/\s+/).map(escapeRegExp).join('\\s+');
    const edgePattern = new RegExp(`(^|[\\s"«„“”'()\\[\\]{}.,;:–—-]+)(${brandPattern})(?=$|[\\s"»“”'()\\[\\]{}.,;:–—-]+)`, 'i');
    if (!options.allowMiddle) {
      const startPattern = new RegExp(`^\\s*(${brandPattern})(?=$|[\\s"»“”'()\\[\\]{}.,;:–—-]+)`, 'i');
      const endPattern = new RegExp(`(^|[\\s"«„“”'()\\[\\]{}.,;:–—-]+)(${brandPattern})\\s*$`, 'i');
      const startClean = rawName.replace(startPattern, '').trim().replace(/\s+/g, ' ');
      if (startClean !== rawName && startClean) return startClean;
      const endClean = rawName.replace(endPattern, ' ').trim().replace(/\s+/g, ' ');
      return endClean && endClean !== rawName ? endClean : rawName;
    }
    const cleaned = rawName.replace(edgePattern, ' ').trim().replace(/\s+/g, ' ');
    return cleaned || rawName;
  };

  const extractKnownBrandFromProductName = (name, options = {}) => {
    const rawName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!rawName) return null;
    for (const brand of KNOWN_BRAND_EXTRACTION_RULES) {
      const cleanName = removeBrandFromProductName(rawName, brand, options);
      if (cleanName && cleanName !== rawName) {
        return { brand, name: cleanName };
      }
    }
    return null;
  };

  const getProductSearchText = (product, normalizeFn) => {
    const normalize = normalizeFn || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));
    return normalize([product?.name, getProductBrand(product)].filter(Boolean).join(' '));
  };

  const hasProductBarcode = (product, barcode) => {
    const code = normalizeBarcode(barcode);
    return !!code && getProductBarcodes(product).includes(code);
  };

  const mergeProductBarcode = (product, barcode) => {
    const code = normalizeBarcode(barcode);
    const barcodes = getProductBarcodes(product);
    if (code && !barcodes.includes(code)) barcodes.unshift(code);
    return {
      ...product,
      barcode: barcodes[0] || null,
      barcodes
    };
  };

  const setProductBarcodes = (product, nextCodes) => {
    const seen = new Set();
    const barcodes = (Array.isArray(nextCodes) ? nextCodes : [])
      .map(normalizeBarcode)
      .filter((code) => {
        if (!code || seen.has(code)) return false;
        seen.add(code);
        return true;
      });
    const next = {
      ...product,
      barcode: barcodes[0] || null,
      barcodes
    };
    ['ean', 'upc', 'barcode_value'].forEach((key) => {
      if (!barcodes.includes(normalizeBarcode(next[key]))) next[key] = null;
    });
    return next;
  };

  const findProductByBarcode = (products, barcode) => {
    const code = normalizeBarcode(barcode);
    if (!code || !Array.isArray(products)) return null;
    return products.find((product) => hasProductBarcode(product, code)) || null;
  };

  const lsGet = (key, def) => {
    const utils = U();
    if (HEYS.store?.get) return HEYS.store.get(key, def);
    if (utils.lsGet) return utils.lsGet(key, def);
    return readStoredValue(key, def);
  };

  // Отклик — через единственную политику (HEYS.feedback, heys_audio_v1.js).
  // 'light' / 'medium' — обычные нажатия, они по контракту молчат; 'success'
  // (сохранение продукта) даёт 10 мс.
  const haptic = (style = 'light') => {
    const level = HEYS.feedback?.levelFor?.(style);
    if (level) HEYS.audio?.haptic?.(level);
  };

  const useEscapeToClose = (closeFn, enabled = true) => {
    useEffect(() => {
      if (!enabled) return;

      const handleKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeFn?.();
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeFn, enabled]);
  };

  const getAutoPortions = (productName) => {
    if (!productName) return [];
    return HEYS.models?.getAutoPortions?.(productName) || [];
  };

  // ── Похожие названия в личном списке ──────────────────────────────────────
  // Клиент создаёт «Торт Наполеон222» рядом с уже имеющимся «Торт Наполеон» —
  // и одна и та же еда попадает в приём дважды (случай из дня 2026-04-26,
  // 200 г торта двумя позициями). Существующая проверка дублей сравнивает
  // названия ТОЧНО, поэтому такие пары не ловит.
  //
  // Голое расстояние Левенштейна здесь не работает: «Творог 5%» и «Творог 9%»
  // различаются на 1 символ и это РАЗНЫЕ продукты, а «Наполеон» и
  // «Наполеон222» — на 3 и это дубль. Значение имеет не длина различия, а его
  // характер, поэтому правила два и оба узкие:
  //   1) одно название — начало другого, а «хвост» короткий и без пробела
  //      («наполеон» → «наполеон222»); пробел означает добавленное слово,
  //      то есть уточнение сорта: «хлеб белый» → «хлеб белый тостовый»;
  //   2) ровно одна опечатка внутри слова, но НЕ в цифре — числа несут смысл
  //      (жирность, процент, вес), их замена делает продукт другим.
  const SIMILAR_NAME_TAIL_MAX = 4;
  const SIMILAR_NAME_MIN_LENGTH = 6;

  const normalizeForSimilarity = (name) => {
    const viaModels = HEYS.models?.normalizeProductName?.(name);
    const base = typeof viaModels === 'string' && viaModels ? viaModels : String(name || '');
    return base.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  const hasDigitDifference = (a, b) => {
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i] !== b[i]) return /\d/.test(a[i] || '') || /\d/.test(b[i] || '');
    }
    return false;
  };

  const looksLikeSameProduct = (rawA, rawB) => {
    const a = normalizeForSimilarity(rawA);
    const b = normalizeForSimilarity(rawB);
    if (!a || !b || a === b) return false;

    // Правило 1: приписанный в конец короткий хвост без пробела.
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (longer.startsWith(shorter)) {
      const tail = longer.slice(shorter.length);
      if (tail.length <= SIMILAR_NAME_TAIL_MAX && !/\s/.test(tail)) return true;
    }

    // Правило 2: одна опечатка в слове, не затрагивающая цифру.
    if (Math.min(a.length, b.length) < SIMILAR_NAME_MIN_LENGTH) return false;
    if (hasDigitDifference(a, b)) return false;
    const distance = HEYS.SmartSearchWithTypos?.utils?.levenshteinDistance;
    if (typeof distance !== 'function') return false;
    return distance(a, b, 2) === 1;
  };

  // Кандидаты из личного списка клиента: только то, что реально видно в списке.
  const findSimilarPersonalProducts = (name, products, excludeId) => {
    if (!name || !Array.isArray(products)) return [];
    return products
      .filter((p) => p && p.name && String(p.id) !== String(excludeId) && p.in_my_list !== false)
      .filter((p) => looksLikeSameProduct(name, p.name))
      .slice(0, 3);
  };

  // Тот же продукт (или почти тот) уже лежит в приёме. Точное совпадение имени
  // важно отдельно от похожести: человек мог просто добавить продукт второй раз
  // вместо правки граммовки, и это тоже двойной учёт.
  const findMealDuplicate = (name, items) => {
    if (!name || !Array.isArray(items) || !items.length) return null;
    const target = normalizeForSimilarity(name);
    if (!target) return null;

    const same = items.find((it) => it && normalizeForSimilarity(it.name) === target);
    if (same) return { item: same, kind: 'same' };

    const similar = items.find((it) => it && looksLikeSameProduct(name, it.name));
    return similar ? { item: similar, kind: 'similar' } : null;
  };

  const normalizePortions = (list) => {
    if (!Array.isArray(list)) {
      console.warn('[HEYS.portions] ⚠️ normalizePortions: не массив', { input: list });
      return [];
    }
    const result = list
      .map((p) => ({
        name: String(p?.name || '').trim(),
        grams: Number(p?.grams || 0)
      }))
      .filter((p) => p.name && p.grams > 0);
    console.info('[HEYS.portions] 🔄 normalizePortions', {
      inputCount: list.length,
      outputCount: result.length,
      input: list.map(p => ({ name: p?.name, grams: p?.grams })),
      output: result
    });
    return result;
  };

	  const saveProductPortions = async (product, portions) => {
    console.info('[HEYS.portions] 📥 saveProductPortions ВЫЗВАН', {
      productId: product?.id ?? product?.product_id ?? product?.name,
      productName: product?.name,
      portionsInput: portions,
      isShared: isSharedProduct(product),
      shared_origin_id: product?.shared_origin_id
    });
    if (!product || !Array.isArray(portions)) {
      console.warn('[HEYS.portions] ⚠️ saveProductPortions: невалидные аргументы', { product: !!product, portions });
      return;
    }
    const U = HEYS.utils || {};
    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
    const pid = String(product.id ?? product.product_id ?? product.name);
    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);

	    if (idx === -1) {
	      console.warn('[HEYS.portions] ⚠️ Продукт не найден в базе, сохраняю через upsert', {
	        productId: pid
	      });
	      const commit = await commitPersonalProduct({ ...product, portions }, false, 'product-portions');
	      if (!commit.ok) {
	        showProductCommitError(commit.reason);
	        return null;
	      }
	      notifyPortionsUpdated(commit.product, portions);
	      return commit.product;
	    }

    const updated = {
      ...products[idx],
      portions
    };

		    const commit = await commitPersonalProduct(updated, false, 'product-portions');
	    if (!commit.ok) {
	      showProductCommitError(commit.reason);
	      return null;
	    }
	    const savedProduct = commit.product || updated;

    console.info('[HEYS.portions] 📣 Отправляем событие heys:local-product-updated', {
	      productId: savedProduct.id,
	      productName: savedProduct.name,
      portionsCount: portions.length,
      shared_origin_id: updated.shared_origin_id
    });
    window.dispatchEvent(new CustomEvent('heys:local-product-updated', {
      detail: {
	        productId: savedProduct.id ?? savedProduct.product_id ?? savedProduct.name,
	        product: savedProduct,
        portions,
        sharedId: updated.shared_origin_id
      }
    }));

    console.info('[HEYS.portions] 📣 Отправляем событие heys:product-portions-updated', {
	      productId: savedProduct.id ?? savedProduct.product_id ?? savedProduct.name,
	      productName: savedProduct.name,
      portionsCount: portions.length
    });
	    notifyPortionsUpdated(savedProduct, portions);
	    return savedProduct;
	  };

  const upsertProductOverlayRow = (product, isUserEdit = true) => {
    if (!product || !isOverlayProductsEnabledForAddStep()) return false;
    const Overlay = HEYS.OverlayStore;
    if (!Overlay || typeof Overlay.upsertRow !== 'function' || typeof Overlay.readRaw !== 'function') return false;

    const pid = product.id ?? product.product_id ?? product.name;
    if (pid == null) return false;

    const rows = Overlay.readRaw() || [];
    const sharedId = resolveSharedProductId(product);
    const existingRow = rows.find((row) => {
      if (!row) return false;
      if (String(row.id) === String(pid)) return true;
      return sharedId && row.shared_origin_id && String(row.shared_origin_id) === String(sharedId);
    });

    if (sharedId) {
      const overrides = {
        ...(existingRow?.overrides || {})
      };
      const barcodes = getProductBarcodes(product);
      const barcode = barcodes[0] || '';
      if (barcode) overrides.barcode = barcode;
      else delete overrides.barcode;
      if (barcodes.length) overrides.barcodes = barcodes;
      else delete overrides.barcodes;
      const brand = normalizeProductBrand(product.brand);
      if (brand) overrides.brand = brand;
      else delete overrides.brand;

      return Overlay.upsertRow({
        ...(existingRow || {}),
        id: existingRow?.id ?? pid,
        shared_origin_id: sharedId,
        fingerprint: product.fingerprint || existingRow?.fingerprint || null,
        overrides,
        in_my_list: true,
        user_modified: existingRow?.user_modified === true || product.user_modified === true || !!isUserEdit
      });
    }

    return Overlay.upsertRow({
      ...(existingRow || {}),
      ...product,
      id: pid,
      brand: normalizeProductBrand(product.brand) || null,
      barcode: getProductBarcode(product) || null,
      barcodes: getProductBarcodes(product),
      _custom: true,
      in_my_list: true,
      user_modified: existingRow?.user_modified === true || product.user_modified === true || !!isUserEdit
    });
  };

	  const upsertLocalProduct = (product, isUserEdit = true) => {
	    if (!product) return { product: null, overlaySaved: false };
    const U = HEYS.utils || {};
    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
    const pid = String(product.id ?? product.product_id ?? product.name);
    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);

    let nextProducts = [...products];

    if (idx === -1) {
      nextProducts.push({
        ...product,
        // 🆕 v4.8.6: Ensure new products have individual createdAt for sort order
        createdAt: product.createdAt || product.created_at || Date.now(),
        user_modified: isUserEdit ? true : product.user_modified
      });
    } else {
      const existing = products[idx];
      const shouldMarkModified = isUserEdit && hasNutrientChanges(existing, product);
      nextProducts[idx] = {
        ...existing,
        ...product,
        user_modified: existing.user_modified === true || shouldMarkModified
      };
    }

    if (HEYS.products?.setAll) {
      HEYS.products.setAll(nextProducts, { source: 'mark-user-modified' });
    } else if (HEYS.store?.set) {
      HEYS.store.set('heys_products', nextProducts);
    }

    if (idx !== -1) {
      cascadeMealItemsOnProductUpdate(products[idx], nextProducts[idx]);
    }

    const savedProduct = idx === -1 ? nextProducts[nextProducts.length - 1] : nextProducts[idx];
	    const overlaySaved = upsertProductOverlayRow(savedProduct, isUserEdit);
	    return { product: savedProduct, overlaySaved };
	  };

	  const showProductCommitError = (reason) => {
	    console.warn('[HEYS.products] personal product commit blocked', { reason });
	    HEYS.Toast?.error?.('Продукт не сохранён в базу. Запись в дневник не добавлена, попробуйте ещё раз.');
	  };

	  const commitPersonalProduct = async (product, isUserEdit = true, source = 'add-product-step') => {
	    if (!product) return { ok: false, product: null, reason: 'missing_product' };
	    if (product._oneTime) return { ok: true, product, reason: 'one_time' };
	    if (HEYS.products?.ensurePersonalProductCommitted) {
	      return HEYS.products.ensurePersonalProductCommitted(product, {
	        isUserEdit,
	        forceCloudAck: true,
	        source
	      });
	    }
	    const localSave = upsertLocalProduct(product, isUserEdit);
	    return {
	      ok: !isOverlayProductsEnabledForAddStep() || !!localSave.overlaySaved,
	      product: localSave.product || product,
	      reason: localSave.overlaySaved ? 'overlay_saved' : 'overlay_unavailable'
	    };
	  };

  const isCuratorUser = () => {
    const isCuratorSession = HEYS.auth?.isCuratorSession;
    if (typeof isCuratorSession === 'function') return !!isCuratorSession();
    return !!(HEYS.cloud?.getUser?.()
      || HEYS.YandexAPI?.getCuratorToken?.()
      || readGlobalValue('heys_curator_cookie_session_hint', null));
  };

  const isSharedProduct = (product) => {
    if (!product) return false;
    return !!(product._fromShared || product._source === 'shared' || product.is_shared);
  };

  const isUuidLike = (value) => {
    if (value == null) return false;
    const str = String(value).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const resolveSharedProductId = (product) => {
    if (!product) return null;
    if (product.shared_origin_id != null) return product.shared_origin_id;
    if (product.sharedId != null) return product.sharedId;
    if (product._sharedId != null) return product._sharedId;
    if (isSharedProduct(product)) {
      const sharedId = product.id ?? product.product_id ?? null;
      return isUuidLike(sharedId) ? sharedId : null;
    }
    return null;
  };

  const canEditProduct = (product) => {
    if (!product) return false;
    if (!isSharedProduct(product)) return true;
    return true;
  };

  const notifyPendingProductsUpdatedForAddStep = () => {
    try { window.dispatchEvent(new CustomEvent('heys:pending-product-created')); } catch (_) { /* noop */ }
    try { window.dispatchEvent(new CustomEvent('heys:pending-products-updated')); } catch (_) { /* noop */ }
    try {
      const bc = new BroadcastChannel('heys_pending_products');
      bc.postMessage({ type: 'pending-created', at: Date.now() });
      setTimeout(() => { try { bc.close(); } catch (_) { /* noop */ } }, 200);
    } catch (_) { /* noop */ }
  };

  const submitSharedProductChangeRequest = async (type, product, targetSharedId, meta = {}) => {
    if (!product || !targetSharedId) return { ok: false, error: 'missing_target' };
    const pendingProduct = {
      ...product,
      ...(type === 'variant_create' ? { variant_of: targetSharedId } : {}),
      _pendingRequest: {
        type,
        target_product_id: targetSharedId,
        summary: meta.summary || null
      }
    };
    const request = {
      type,
      targetProductId: targetSharedId,
      productData: pendingProduct,
      name: pendingProduct.name || product.name || ''
    };
    const result = HEYS.cloud?.createPendingSharedProductChange
      ? await HEYS.cloud.createPendingSharedProductChange(null, request)
      : await HEYS.YandexAPI?.createPendingSharedProductChange?.(request);
    const status = result?.status || result?.data?.status;
    if (status === 'pending' || status === 'pending_dup') {
      notifyPendingProductsUpdatedForAddStep();
      return { ok: true, status };
    }
    return {
      ok: false,
      error: result?.message || result?.error?.message || result?.error || 'pending_failed'
    };
  };

  const chooseSharedEditRequestType = (original, updated) => {
    const nameChanged = String(original?.name || '') !== String(updated?.name || '');
    const promptText = nameChanged
      ? 'Как отправить изменение в общую базу?\n1 — создать новый вариант/SKU на основе общего продукта\n2 — предложить исправление текущего общего продукта\nПусто или Отмена — оставить только у себя'
      : 'Предложить изменение куратору для общей базы?\n1 — да, исправить текущий общий продукт\nПусто или Отмена — оставить только у себя';
    const answer = window.prompt(promptText, nameChanged ? '1' : '1');
    if (answer === null || String(answer).trim() === '') return null;
    const normalized = String(answer).trim();
    if (nameChanged && normalized === '1') return 'variant_create';
    if (normalized === '1' || normalized === '2') return 'product_update';
    return null;
  };

  const makeLocalVariantCandidate = (product, originalProduct) => {
    const next = { ...product };
    if (isSharedProduct(originalProduct)) {
      next.id = uuid();
    }
    delete next.shared_origin_id;
    delete next.sharedId;
    delete next._sharedId;
    delete next._fromShared;
    delete next.is_shared;
    if (next._source === 'shared') delete next._source;
    next._custom = true;
    return next;
  };

  const notifyPortionsUpdated = (product, portions) => {
    if (!product) return;
    window.dispatchEvent(new CustomEvent('heys:product-portions-updated', {
      detail: {
        productId: product.id ?? product.product_id ?? product.name,
        product,
        portions: Array.isArray(portions) ? portions : []
      }
    }));
  };

  const notifySharedProductUpdated = (sharedId, portions, product = null) => {
    if (sharedId == null) return;
    const eventProduct = product ? { ...product, id: sharedId } : { id: sharedId, portions };
    window.dispatchEvent(new CustomEvent('heys:shared-product-updated', {
      detail: {
        productId: sharedId,
        product: eventProduct,
        portions: Array.isArray(portions) ? portions : []
      }
    }));
  };

  const updateSharedProductsCache = (sharedId, portions, product = null) => {
    if (sharedId == null) return;

    // 1. Обновляем через новый API (предпочтительно)
    if (HEYS.cloud?.updateCachedSharedProduct) {
      const updates = {
        ...(product || {}),
        portions: Array.isArray(portions) ? portions : undefined
      };
      HEYS.cloud.updateCachedSharedProduct(sharedId, updates);
    } else {
      // Fallback: обновляем напрямую
      const cache = HEYS.cloud?.getCachedSharedProducts?.();
      if (!Array.isArray(cache) || cache.length === 0) return;
      const idx = cache.findIndex((p) => String(p?.id) === String(sharedId));
      if (idx === -1) return;
      const merged = {
        ...cache[idx],
        ...(product || {}),
        id: sharedId,
        portions: Array.isArray(portions) ? portions : cache[idx]?.portions
      };
      cache[idx] = merged;
    }

    // 🔧 FIX: Синхронизируем с локальным heys_products (личная база)
    // Продукт мог быть клонирован туда ранее через addFromShared
    try {
      const U = HEYS.utils || {};
      let localProducts = [];
      if (HEYS.products?.getAll) localProducts = HEYS.products.getAll() || [];
      if (localProducts.length === 0 && HEYS.store?.get) {
        localProducts = HEYS.store.get('heys_products', []) || [];
      }
      if (localProducts.length === 0 && U.lsGet) {
        localProducts = U.lsGet('heys_products', []) || [];
      }
      if (localProducts.length === 0) {
        const rawProducts = readStoredValue('heys_products', []) || [];
        if (Array.isArray(rawProducts)) localProducts = rawProducts;
      }
      if (!Array.isArray(localProducts) || localProducts.length === 0) return;

      const normalizeName = HEYS.models?.normalizeProductName
        || ((name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е'));

      const sharedName = product?.name
        || (HEYS.cloud?.getCachedSharedProducts?.() || []).find(p => String(p?.id) === String(sharedId))?.name
        || null;

      const getSharedOriginId = (p) => p?.shared_origin_id ?? p?.sharedOriginId ?? p?.shared_id ?? p?.sharedId ?? null;

      const localIndices = localProducts
        .map((p, idx) => ({ idx, p }))
        .filter(({ p }) => String(getSharedOriginId(p)) === String(sharedId) || String(p?.id) === String(sharedId))
        .map((item) => item.idx);

      if (localIndices.length === 0 && sharedName) {
        const targetName = normalizeName(sharedName);
        localProducts.forEach((p, idx) => {
          if (normalizeName(p?.name) === targetName) {
            localIndices.push(idx);
          }
        });
      }

      if (localIndices.length > 0) {
        let updatedProducts = [...localProducts];
        const incomingPortions = Array.isArray(portions) ? portions : [];
        const hasIncomingPortions = incomingPortions.length > 0;

        localIndices.forEach((idx) => {
          const localProduct = updatedProducts[idx];
          const finalPortions = hasIncomingPortions ? incomingPortions : (localProduct?.portions || []);

          const updatedProduct = {
            ...localProduct,
            ...product,
            portions: finalPortions,
            id: localProduct?.id
          };

          if (!getSharedOriginId(localProduct)) {
            updatedProduct.shared_origin_id = sharedId;
          }

          updatedProducts[idx] = updatedProduct;

          window.dispatchEvent(new CustomEvent('heys:local-product-updated', {
            detail: {
              productId: localProduct?.id,
              sharedId: sharedId,
              product: updatedProduct,
              portions: finalPortions
            }
          }));
          window.dispatchEvent(new CustomEvent('heys:product-portions-updated', {
            detail: {
              productId: localProduct?.id,
              product: updatedProduct,
              portions: finalPortions
            }
          }));
        });

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(updatedProducts, { source: 'portions-sync-shared' });
        } else if (HEYS.store?.set) {
          HEYS.store.set('heys_products', updatedProducts);
        }
      } else {
        console.warn('[HEYS.portions] ⚠️ Не найден локальный продукт для синхронизации', { sharedId, sharedName });
      }
    } catch (e) {
      console.warn('[HEYS.portions] ⚠️ Не удалось синхронизировать с локальной базой', e?.message || e);
    }
  };

  // 🔄 Обновление порций через RPC (direct UPDATE, не INSERT ON CONFLICT)
  // Причина: REST upsert с partial data fails NOT NULL constraint на name/fingerprint
  const updateSharedProductPortions = async (productId, portions, product = null) => {
    // 🔧 Для кураторов используем JWT авторизацию (curator_id из cloud.getUser())
    // ПРИОРИТЕТ: curator mode если пользователь - куратор
    const curatorUser = (typeof HEYS !== 'undefined' && HEYS.cloud?.getUser?.());
    const curatorId = curatorUser?.id;
    const isCurator = curatorUser?.role === 'curator';

    // 🔧 Получаем session token для клиентов (PIN auth)
    const sessionToken = (typeof HEYS !== 'undefined' && HEYS.Auth?.getSessionToken?.())
      || localStorage.getItem('heys_session_token');

    // Кураторы используют curator функцию, клиенты - session функцию
    const isCuratorMode = isCurator && !!curatorId;

    if (!HEYS?.YandexAPI?.rpc) {
      HEYS.Toast?.warning('API недоступен для обновления') || alert('API недоступен для обновления');
      console.warn('[HEYS.portions] ⚠️ API недоступен для обновления порций', {
        productId,
        portionsCount: Array.isArray(portions) ? portions.length : 0
      });
      return { ok: false };
    }

    const resolvedSharedId = resolveSharedProductId(product) ?? productId;
    if (!isUuidLike(resolvedSharedId)) {
      console.warn('[HEYS.portions] ⚠️ Некорректный shared UUID для RPC порций', {
        productId,
        resolvedSharedId
      });
      return { ok: false };
    }

    try {
      // Выбираем функцию и параметры в зависимости от режима авторизации
      const rpcFn = isCuratorMode ? 'update_shared_product_portions_by_curator' : 'update_shared_product_portions';
      const rpcParams = isCuratorMode
        ? {
          p_curator_id: curatorId,
          p_product_id: resolvedSharedId,
          p_portions: Array.isArray(portions) ? portions : []
        }
        : {
          p_product_id: resolvedSharedId,
          p_portions: Array.isArray(portions) ? portions : []
        };
      if (!isCuratorMode && sessionToken) {
        rpcParams.p_session_token = sessionToken;
      }

      console.info(`[HEYS.portions] 📤 RPC ${rpcFn}`, {
        productId: resolvedSharedId,
        portionsCount: Array.isArray(portions) ? portions.length : 0,
        portionsData: portions,
        isCuratorMode,
        curatorId: isCuratorMode ? curatorId : undefined
      });

      const { data: rawData, error } = await HEYS.YandexAPI.rpc(rpcFn, rpcParams);

      if (error) {
        const errorMsg = error?.message || error;
        HEYS.Toast?.error('Ошибка обновления: ' + errorMsg) || alert('Ошибка обновления: ' + errorMsg);
        console.error('[HEYS.portions] ❌ RPC ошибка обновления порций', {
          productId,
          error
        });
        return { ok: false };
      }

      // 🔧 RPC возвращает { "[function_name]": { success: true/false, ... } }
      // Извлекаем результат из nested структуры
      const data = rawData?.[rpcFn] || rawData;

      console.info('[HEYS.portions] 📥 RPC response parsed', {
        rawDataKeys: rawData ? Object.keys(rawData) : [],
        success: data?.success,
        hasError: !!data?.error
      });

      if (data?.success === false) {
        const errorMsg = data?.message || data?.error || 'Ошибка сервера';
        HEYS.Toast?.error(errorMsg) || alert(errorMsg);
        console.error('[HEYS.portions] ❌ RPC вернул ошибку', {
          productId,
          data
        });
        return { ok: false };
      }

      HEYS.Toast?.success('Порции обновлены') || alert('Порции обновлены');
      console.info('[HEYS.portions] ✅ Порции обновлены через RPC', {
        productId: resolvedSharedId,
        portionsCount: Array.isArray(portions) ? portions.length : 0,
        portionsData: portions,
        serverResponse: data,
        isCuratorMode
      });

      // Обновляем кэш и уведомляем об изменениях
      updateSharedProductsCache(resolvedSharedId, portions, product);
      notifySharedProductUpdated(resolvedSharedId, portions, product);
      return { ok: true };
    } catch (e) {
      const msg = e?.message || 'Ошибка обновления';
      HEYS.Toast?.error(msg) || alert(msg);
      console.error('[HEYS.portions] ❌ Исключение при обновлении порций', {
        productId,
        error: e?.message || e
      });
      return { ok: false };
    }
  };

  const toNum = (value, fallback = 0) => {
    if (value == null || value === '') return fallback;
    const normalized = String(value).trim().replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalizeSharedProductForAddStep = (p) => {
    if (!p || typeof p !== 'object') return null;
    const protein100 = toNum(p.protein100, 0);
    const simple100 = toNum(p.simple100, 0);
    const complex100 = toNum(p.complex100, 0);
    const badFat100 = toNum(p.badfat100 ?? p.badFat100, 0);
    const goodFat100 = toNum(p.goodfat100 ?? p.goodFat100, 0);
    const trans100 = toNum(p.trans100, 0);
    const carbs100 = simple100 + complex100;
    const fat100 = badFat100 + goodFat100 + trans100;
    const kcal100 = Math.round(protein100 * 3 + carbs100 * 4 + fat100 * 9);

    return {
      ...p,
      brand: normalizeProductBrand(p.brand) || null,
      brand_fingerprint: p.brand_fingerprint || p.brandFingerprint || null,
      protein100,
      simple100,
      complex100,
      badFat100,
      goodFat100,
      trans100,
      fiber100: toNum(p.fiber100, 0),
      gi: toNum(p.gi, 0),
      harm: (HEYS.models?.normalizeHarm?.(p) ?? toNum(p.harm ?? p.harmScore ?? p.harmscore, 0)) || 0,
      kcal100,
      carbs100,
      fat100,
      updatedAt: p.updatedAt || (p.updated_at ? Date.parse(p.updated_at) : 0),
      createdAt: p.createdAt || (p.created_at ? Date.parse(p.created_at) : 0),
      _fromShared: true
    };
  };

  const isOverlayProductsEnabledForAddStep = () => {
    try {
      return HEYS.flags?.isEnabled?.('overlay_products_v2') === true;
    } catch (_) {
      return false;
    }
  };

  const readCurrentClientProductsForAddStep = () => {
    if (!isOverlayProductsEnabledForAddStep()) return null;
    const Overlay = HEYS.OverlayStore;
    if (!Overlay || typeof Overlay.readRaw !== 'function') return [];

    const rows = Overlay.readRaw();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    try {
      if (typeof Overlay.toMergedView === 'function') {
        const sharedById = HEYS.cloud?.getSharedIndex?.() || new Map();
        const merged = Overlay.toMergedView(sharedById);
        if (Array.isArray(merged)) return merged;
      }
    } catch (_) { /* noop */ }

    const rowIds = new Set(rows.map((r) => String(r?.id ?? '')).filter(Boolean));
    const globalView = HEYS.products?.getAll?.();
    if (Array.isArray(globalView) && rowIds.size > 0) {
      return globalView.filter((p) => rowIds.has(String(p?.id ?? p?.product_id ?? '')));
    }

    return rows.filter((r) => r && r._custom === true);
  };

  let sharedBarcodeNameIndexSource = null;
  let sharedBarcodeNameIndex = new Map();

  const invalidateSharedBarcodeNameIndex = () => {
    sharedBarcodeNameIndexSource = null;
    sharedBarcodeNameIndex = new Map();
  };

  const getSharedBarcodeNameIndex = (cachedSharedProducts) => {
    if (sharedBarcodeNameIndexSource === cachedSharedProducts) return sharedBarcodeNameIndex;

    const nextIndex = new Map();
    (cachedSharedProducts || []).forEach((shared) => {
      const name = normalizeName(shared?.name);
      if (!name) return;
      const current = nextIndex.get(name);
      if (current) {
        current.count += 1;
        current.match = null;
      } else {
        nextIndex.set(name, { count: 1, match: shared });
      }
    });

    sharedBarcodeNameIndexSource = cachedSharedProducts;
    sharedBarcodeNameIndex = nextIndex;
    return sharedBarcodeNameIndex;
  };

  const findSharedProductForBarcodeMerge = (product) => {
    if (!product) return null;
    const sharedId = resolveSharedProductId(product);
    const sharedById = HEYS.cloud?.getSharedIndex?.();
    if (sharedId && sharedById?.get) {
      const byId = sharedById.get(String(sharedId));
      if (getProductBarcodes(byId).length > 0) return byId;
    }

    const cached = HEYS.cloud?.getCachedSharedProducts?.();
    if (!Array.isArray(cached) || cached.length === 0) return null;
    const name = normalizeName(product.name);
    if (!name) return null;
    const indexed = getSharedBarcodeNameIndex(cached).get(name);
    const match = indexed?.count === 1 ? indexed.match : null;
    return match && getProductBarcodes(match).length > 0 ? match : null;
  };

  const mergeSharedBarcodeIntoProductForAddStep = (product) => {
    if (!product) return product;
    const productCodes = getProductBarcodes(product);
    const shared = findSharedProductForBarcodeMerge(product);
    const sharedCodes = getProductBarcodes(shared);
    if (sharedCodes.length === 0) return product;

    const mergedCodes = [];
    [...productCodes, ...sharedCodes].forEach((code) => {
      if (code && !mergedCodes.includes(code)) mergedCodes.push(code);
    });

    if (
      productCodes.length === mergedCodes.length
      && productCodes.every((code, index) => code === mergedCodes[index])
      && (product.shared_origin_id || !shared?.id)
    ) {
      return product;
    }

    return {
      ...product,
      shared_origin_id: product.shared_origin_id || shared?.id || product.shared_origin_id,
      barcode: mergedCodes[0] || null,
      barcodes: mergedCodes
    };
  };

  const barcodeProductSignature = (product, barcode) => {
    const code = normalizeBarcode(barcode);
    const name = normalizeName(product?.name);
    if (!code || !name) return '';

    const carbs100 = toNum(product?.carbs100, toNum(product?.simple100, 0) + toNum(product?.complex100, 0));
    const fat100 = toNum(product?.fat100,
      toNum(product?.badFat100 ?? product?.badfat100, 0)
      + toNum(product?.goodFat100 ?? product?.goodfat100, 0)
      + toNum(product?.trans100, 0)
    );

    return [
      code,
      name,
      Math.round(toNum(product?.kcal100, 0)),
      Math.round(toNum(product?.protein100, 0) * 10) / 10,
      Math.round(fat100 * 10) / 10,
      Math.round(carbs100 * 10) / 10
    ].join('|');
  };

  const barcodeProductKeys = (product, barcode) => {
    const keys = [];
    const id = product?.id ?? product?.product_id ?? null;
    const sharedId = resolveSharedProductId(product);
    const signature = barcodeProductSignature(product, barcode);

    if (id != null) keys.push(`id:${String(id)}`);
    if (sharedId != null) keys.push(`shared:${String(sharedId)}`);
    if (signature) keys.push(`sig:${signature}`);

    return keys;
  };

  const mergeBarcodeMatchProducts = (left, right, barcode) => {
    const primary = left?._source === 'personal' || right?._source !== 'personal' ? left : right;
    const secondary = primary === left ? right : left;
    const codes = [];
    [barcode, ...getProductBarcodes(primary), ...getProductBarcodes(secondary)].forEach((value) => {
      const code = normalizeBarcode(value);
      if (code && !codes.includes(code)) codes.push(code);
    });

    const sharedId = resolveSharedProductId(primary) || resolveSharedProductId(secondary);
    return {
      ...primary,
      shared_origin_id: primary?.shared_origin_id || sharedId || primary?.shared_origin_id,
      barcode: codes[0] || null,
      barcodes: codes,
      _barcodeMatch: true
    };
  };

  const dedupeBarcodeMatches = (matches, barcode) => {
    const out = [];
    const keyToIndex = new Map();

    (Array.isArray(matches) ? matches : []).forEach((product) => {
      const keys = barcodeProductKeys(product, barcode);
      const existingIndex = keys
        .map((key) => keyToIndex.get(key))
        .find((index) => index != null);

      if (existingIndex == null) {
        const nextIndex = out.length;
        out.push(product);
        keys.forEach((key) => keyToIndex.set(key, nextIndex));
        return;
      }

      const merged = mergeBarcodeMatchProducts(out[existingIndex], product, barcode);
      out[existingIndex] = merged;
      barcodeProductKeys(merged, barcode).forEach((key) => keyToIndex.set(key, existingIndex));
    });

    return out;
  };

  const resolveSharedBarcodeProductForAddStep = async (product) => {
    let next = mergeSharedBarcodeIntoProductForAddStep(product);
    if (getProductBarcodes(next).length > 0 || !HEYS.cloud?.getAllSharedProducts) return next;

    try {
      await HEYS.cloud.getAllSharedProducts({ limit: 1000, excludeBlocklist: true });
      next = mergeSharedBarcodeIntoProductForAddStep(product);
    } catch (err) {
      console.warn('[AddProductStep] shared barcode lookup failed', err);
    }

    return next;
  };

  const toInt = (value, fallback = null) => {
    if (value == null || value === '') return fallback;
    const n = Number(String(value).trim().replace(',', '.'));
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  };

  const normalizeAdditives = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) return value.length ? value : null;
    return String(value)
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const normalizeName = (name) => {
    if (HEYS.models?.normalizeProductName) return HEYS.models.normalizeProductName(name);
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/ё/g, 'е');
  };

  const normalizePickerDedupeName = (product) => {
    const rawName = String(product?.name || product?.title || '').trim();
    if (!rawName) return '';
    const brand = getProductBrand(product);
    const name = brand
      ? removeBrandFromProductName(rawName, brand, { allowMiddle: true })
      : rawName;
    return normalizeName(name)
      .replace(/[«»"“”„'`]/g, '')
      .replace(/[()[\]{}.,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getPickerDedupeKey = (product) => {
    if (!product) return '';
    const sharedId = product.shared_origin_id ?? product.sharedId ?? product._sharedId;
    if (sharedId != null && String(sharedId).trim()) return 'shared:' + String(sharedId).trim();

    const barcodes = getProductBarcodes(product);
    if (barcodes.length > 0) return 'barcode:' + barcodes.slice().sort()[0];

    const fingerprint = product.fingerprint ?? product.productFingerprint;
    if (fingerprint != null && String(fingerprint).trim()) return 'fingerprint:' + String(fingerprint).trim();

    const name = normalizePickerDedupeName(product);
    if (!name) return '';
    const brand = normalizeBrandCompare(getProductBrand(product));
    return 'name:' + (brand ? brand + '|' : '') + name;
  };

  const dedupeProductsForPicker = (products) => {
    if (!Array.isArray(products) || products.length === 0) return [];
    const seen = new Set();
    const out = [];
    products.forEach((product) => {
      const key = getPickerDedupeKey(product);
      const fallbackKey = key || 'id:' + String(product?.id ?? product?.product_id ?? product?.name ?? out.length);
      if (seen.has(fallbackKey)) return;
      seen.add(fallbackKey);
      out.push(product);
    });
    return out;
  };

  const notifyProductUpdated = (product) => {
    if (!product) return;
    window.dispatchEvent(new CustomEvent('heys:product-updated', {
      detail: {
        productId: product.id ?? product.product_id ?? product.name,
        product
      }
    }));
  };

  // Хелпер для проверки изменений нутриентов (для user_modified флага + cascade update)
  const hasNutrientChanges = (oldProduct, newProduct) => {
    const nutrientKeys = [
      'simple100', 'complex100', 'protein100',
      'badFat100', 'goodFat100', 'trans100',
      'fiber100', 'gi', 'harm',
      // 🆕 v5.0 Enrichment support: микронутриенты для cascade update
      'iron', 'magnesium', 'zinc', 'selenium', 'calcium', 'phosphorus', 'potassium', 'iodine',
      'vitamin_a', 'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
      'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
      'omega3_100', 'omega6_100', 'cholesterol',
      'is_fermented', 'is_raw', 'is_organic', 'is_whole_grain', 'nova_group'
    ];
    return nutrientKeys.some(key => {
      const oldVal = oldProduct?.[key];
      const newVal = newProduct?.[key];
      // Считаем изменённым если оба определены и различаются
      if (oldVal == null && newVal == null) return false;
      return oldVal !== newVal;
    });
  };

	  const saveLocalProduct = async (product, isUserEdit = true) => {
	    if (!product) return { ok: false, product: null, reason: 'missing_product' };
	    const U = HEYS.utils || {};
	    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
	    const pid = String(product.id ?? product.product_id ?? product.name);
	    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);
	    if (idx === -1) return commitPersonalProduct(product, isUserEdit, 'create-product-step');

    const existing = products[idx];
    const nextProducts = [...products];

    // Устанавливаем user_modified: true если пользователь изменил нутриенты
    const shouldMarkModified = isUserEdit && hasNutrientChanges(existing, product);
    nextProducts[idx] = {
      ...existing,
      ...product,
      // Сохраняем user_modified если уже был true, или ставим если сейчас изменили
      user_modified: existing.user_modified === true || shouldMarkModified
    };

	    const commit = await commitPersonalProduct(nextProducts[idx], isUserEdit, 'create-product-step');
	    if (!commit.ok) return commit;

    // 📝 Event log (plan Wave 5.3, F-EL Batch C): product-create or product-edit
    try {
      const eventKind = shouldMarkModified ? 'product-edit' : 'product-create';
      window.HEYS?.eventLog?.write(
        eventKind,
	        `${commit.product?.name || 'product'} ${shouldMarkModified ? 'updated' : 'created'}`,
	        { productId: commit.product?.id, name: commit.product?.name },
	        'create-product-step'
	      );
	    } catch (_) { /* noop */ }

	    // v4.8.0: Cascade update to MealItems in all days
	    cascadeMealItemsOnProductUpdate(existing, commit.product || nextProducts[idx]);
	    return commit;
	  };

  /**
   * v4.8.0: Cascade MealItem updates when product is renamed/edited
   * Updates item.name and inline nutrients in all days where product_id matches
   * @param {Object} oldProduct - Product before update (for comparison)
   * @param {Object} newProduct - Product after update
   */
  const __resolveCascadeClientId = function () {
    try {
      if (HEYS && HEYS.currentClientId && typeof HEYS.currentClientId === 'string') {
        return HEYS.currentClientId;
      }
    } catch (_) { /* noop */ }
    try {
      if (HEYS && HEYS.cloud && typeof HEYS.cloud.getCurrentClientId === 'function') {
        const cid = HEYS.cloud.getCurrentClientId();
        if (cid && typeof cid === 'string') return cid;
      }
    } catch (_) { /* noop */ }
    try {
      const raw = global.localStorage.getItem('heys_client_current');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object' && parsed.id) return String(parsed.id);
    } catch (_) { /* noop */ }
    return null;
  };

  /** dayv2-ключи текущего клиента + unscoped legacy; без foreign/pollution keys. */
  const __collectCascadeDayKeys = function () {
    if (typeof localStorage === 'undefined') return [];
    const dayKeysAll = Object.keys(localStorage).filter(function (k) { return k.includes('_dayv2_'); });
    const cascadeClientId = __resolveCascadeClientId();
    if (!cascadeClientId) {
      console.warn('[HEYS] Cascade: no current client id — skipping day scan');
      return [];
    }
    const isOwnDayKey = HEYS.dayUtils && typeof HEYS.dayUtils.isDayv2KeyForCurrentClient === 'function'
      ? HEYS.dayUtils.isDayv2KeyForCurrentClient
      : null;
    const dayKeys = dayKeysAll.filter(function (k) {
      if (isOwnDayKey) return isOwnDayKey(k, cascadeClientId);
      return k.startsWith('heys_' + cascadeClientId + '_dayv2_') || k.startsWith('heys_dayv2_');
    });
    const foreignIgnored = dayKeysAll.length - dayKeys.length;
    if (dayKeys.length === 0 && foreignIgnored > 0) {
      console.warn('[HEYS] Cascade: no scoped dayv2 keys for client', cascadeClientId.slice(0, 8), '— foreign keys ignored');
    }
    return dayKeys;
  };

  const cascadeMealItemsOnProductUpdate = (oldProduct, newProduct) => {
    if (!oldProduct || !newProduct) return;
    const pid = String(newProduct.id ?? newProduct.product_id ?? '');
    if (!pid) return;

    // Check if name changed (main reason for cascade)
    const nameChanged = oldProduct.name !== newProduct.name;
    const brandChanged = normalizeProductBrand(oldProduct.brand) !== normalizeProductBrand(newProduct.brand);
    const nutrientsChanged = hasNutrientChanges(oldProduct, newProduct);
    if (!nameChanged && !brandChanged && !nutrientsChanged) return;

    const U = HEYS.utils || {};
    const dayKeys = __collectCascadeDayKeys();
    if (!dayKeys.length) return;
    let updatedDays = 0;
    let updatedItems = 0;
    let skippedByPrefilter = 0;

    // PERF NEW-5: raw-string pre-filter — skip JSON.parse для дней без затронутого продукта.
    const _pidNeedles = ['"product_id":"' + pid + '"', '"productId":"' + pid + '"'];

    for (const key of dayKeys) {
      try {
        const rawCheck = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
        if (rawCheck && typeof rawCheck === 'string' && !rawCheck.startsWith('¤Z¤')) {
          if (rawCheck.indexOf(_pidNeedles[0]) === -1 && rawCheck.indexOf(_pidNeedles[1]) === -1) {
            skippedByPrefilter += 1;
            continue;
          }
        }
        const day = readStoredValue(key, null);
        if (!day || !Array.isArray(day.meals)) continue;

        let dayChanged = false;

        for (const meal of day.meals) {
          const mealItems = Array.isArray(meal?.items) ? meal.items : [];
          for (const item of mealItems) {
            // Match by product_id (primary key for cascade)
            const itemPid = String(item.product_id ?? item.productId ?? '');
            if (itemPid === pid) {
              // Update name if changed
              if (nameChanged) {
                item.name = newProduct.name;
              }
              if (brandChanged) {
                const nextBrand = normalizeProductBrand(newProduct.brand);
                if (nextBrand) item.brand = nextBrand;
                else delete item.brand;
              }
              // Update inline nutrients if changed
              if (nutrientsChanged) {
                // Macronutrients
                item.kcal100 = newProduct.kcal100;
                item.protein100 = newProduct.protein100;
                item.fat100 = newProduct.fat100;
                item.simple100 = newProduct.simple100;
                item.complex100 = newProduct.complex100;
                item.badFat100 = newProduct.badFat100;
                item.goodFat100 = newProduct.goodFat100;
                item.trans100 = newProduct.trans100;
                item.fiber100 = newProduct.fiber100;
                item.gi = newProduct.gi ?? newProduct.gi100;
                item.harm = HEYS.models?.normalizeHarm?.(newProduct) ?? newProduct.harm;

                // 🆕 v5.0 Enrichment: Micronutrients (cascade update)
                if (newProduct.iron != null) item.iron = newProduct.iron;
                if (newProduct.magnesium != null) item.magnesium = newProduct.magnesium;
                if (newProduct.zinc != null) item.zinc = newProduct.zinc;
                if (newProduct.selenium != null) item.selenium = newProduct.selenium;
                if (newProduct.calcium != null) item.calcium = newProduct.calcium;
                if (newProduct.phosphorus != null) item.phosphorus = newProduct.phosphorus;
                if (newProduct.potassium != null) item.potassium = newProduct.potassium;
                if (newProduct.iodine != null) item.iodine = newProduct.iodine;

                if (newProduct.vitamin_a != null) item.vitamin_a = newProduct.vitamin_a;
                if (newProduct.vitamin_b1 != null) item.vitamin_b1 = newProduct.vitamin_b1;
                if (newProduct.vitamin_b2 != null) item.vitamin_b2 = newProduct.vitamin_b2;
                if (newProduct.vitamin_b3 != null) item.vitamin_b3 = newProduct.vitamin_b3;
                if (newProduct.vitamin_b6 != null) item.vitamin_b6 = newProduct.vitamin_b6;
                if (newProduct.vitamin_b9 != null) item.vitamin_b9 = newProduct.vitamin_b9;
                if (newProduct.vitamin_b12 != null) item.vitamin_b12 = newProduct.vitamin_b12;
                if (newProduct.vitamin_c != null) item.vitamin_c = newProduct.vitamin_c;
                if (newProduct.vitamin_d != null) item.vitamin_d = newProduct.vitamin_d;
                if (newProduct.vitamin_e != null) item.vitamin_e = newProduct.vitamin_e;
                if (newProduct.vitamin_k != null) item.vitamin_k = newProduct.vitamin_k;

                if (newProduct.omega3_100 != null) item.omega3_100 = newProduct.omega3_100;
                if (newProduct.omega6_100 != null) item.omega6_100 = newProduct.omega6_100;
                if (newProduct.cholesterol != null) item.cholesterol = newProduct.cholesterol;

                if (newProduct.is_fermented != null) item.is_fermented = newProduct.is_fermented;
                if (newProduct.is_raw != null) item.is_raw = newProduct.is_raw;
                if (newProduct.is_organic != null) item.is_organic = newProduct.is_organic;
                if (newProduct.is_whole_grain != null) item.is_whole_grain = newProduct.is_whole_grain;
                if (newProduct.nova_group != null) item.nova_group = newProduct.nova_group;
              }
              dayChanged = true;
              updatedItems++;
            }
          }
        }

        if (dayChanged) {
          day.updatedAt = Date.now();
          writeRawValue(key, day);
          updatedDays++;
        }
      } catch (e) {
        console.warn('[HEYS] cascadeMealItems error for key:', key, e);
      }
    }

    if (updatedDays > 0) {
      console.log(`[HEYS] Cascade update: ${updatedItems} items in ${updatedDays} days (skipped ${skippedByPrefilter} via raw-string pre-filter)`);
      // Clear caches to reflect changes
      HEYS.models?.clearMealTotalsCache?.();
      window.dispatchEvent(new CustomEvent('heys:mealitems-cascaded', {
        detail: { productId: pid, updatedDays, updatedItems }
      }));
    }
  };

  // E2E / diagnostics: вызов production-каскада без UI-модалки (см. products-cascade-client-scope-smoke.spec.ts).
  try {
    const root = window.HEYS = window.HEYS || {};
    root.debug = root.debug || {};
    root.debug.cascadeMealItemsOnProductUpdate = cascadeMealItemsOnProductUpdate;
    root.debug.collectCascadeDayKeys = __collectCascadeDayKeys;
  } catch (_) { /* noop */ }

  /**
   * 🆕 v5.0: Batch cascade update — efficiently updates MealItems for multiple products
   * Called automatically when products sync from cloud (heysProductsUpdated event)
   * @param {Array<Object>} products - Products to potentially update (only those with nutrient changes will cascade)
   */
  /** Yield main thread between day chunks (curator switch + large merges stay responsive). */
  const __cascadeYieldToMain = function (budgetMs) {
    const ms = Number.isFinite(budgetMs) ? Math.max(0, budgetMs) : 48;
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(function () { resolve(); }, { timeout: Math.max(32, ms) });
      } else {
        setTimeout(resolve, 0);
      }
    });
  };

  const cascadeBatchProductUpdates = async function (products, previousProducts = null, { todayEventDelayMs = 80 } = {}) {
    if (!Array.isArray(products) || products.length === 0) return;

    const prevArr = Array.isArray(previousProducts) ? previousProducts : null;

    // Build map: product_id → oldProduct for O(1) lookup
    const prevById = new Map();
    if (prevArr) {
      for (const p of prevArr) {
        const pid = String(p?.id ?? p?.product_id ?? '');
        if (pid) prevById.set(pid, p);
      }
    }

    // Build map: product_id → { old, new } for products with changes
    const changesMap = new Map();

    for (const newProduct of products) {
      const pid = String(newProduct?.id ?? newProduct?.product_id ?? '');
      if (!pid) continue;

      const oldProduct = prevById.get(pid);
      if (!oldProduct) continue; // Skip new products (no history to update)

      const nameChanged = oldProduct.name !== newProduct.name;
      const brandChanged = normalizeProductBrand(oldProduct.brand) !== normalizeProductBrand(newProduct.brand);
      const nutrientsChanged = hasNutrientChanges(oldProduct, newProduct);

      if (nameChanged || brandChanged || nutrientsChanged) {
        changesMap.set(pid, { old: oldProduct, new: newProduct, nameChanged, brandChanged, nutrientsChanged });
      }
    }

    if (changesMap.size === 0) {
      console.log('[HEYS.sync] ✅ No nutrient changes detected in batch update');
      return;
    }

    console.log(`[HEYS.sync] 🔄 Cascade batch update: ${changesMap.size} products changed`);

    const dayKeys = __collectCascadeDayKeys();
    if (!dayKeys.length) {
      console.log('[HEYS.sync] Cascade batch: no scoped day keys for current client');
      return;
    }

    let updatedDays = 0;
    let updatedItems = 0;
    let skippedByPrefilter = 0;
    const CHUNK = 5;

    // PERF NEW-5: prebuild «product ID needles» один раз — для быстрого raw-string contains-check.
    // Любой из этих substrings в JSON дня означает «этот день потенциально содержит изменённый продукт».
    // Не идеально (false positive если pid случайно встретится в другом контексте — крайне редко
    // для UUID-like product_ids), зато избегаем JSON.parse + meal-loop для дней БЕЗ изменённых продуктов.
    const _changedPidNeedles = [];
    for (const pid of changesMap.keys()) {
      // покрываем оба формата: "product_id":"X" и "productId":"X"
      _changedPidNeedles.push('"product_id":"' + pid + '"');
      _changedPidNeedles.push('"productId":"' + pid + '"');
    }

    for (let offset = 0; offset < dayKeys.length; offset += CHUNK) {
      const slice = dayKeys.slice(offset, offset + CHUNK);
      for (let ki = 0; ki < slice.length; ki++) {
        const key = slice[ki];
        try {
          // PERF NEW-5: raw-string pre-filter перед JSON.parse.
          // Compressed values (¤Z¤ prefix) не покрываем — для них делаем full path как раньше.
          const rawCheck = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null;
          if (rawCheck && typeof rawCheck === 'string' && !rawCheck.startsWith('¤Z¤')) {
            let mightContain = false;
            for (let ni = 0; ni < _changedPidNeedles.length; ni++) {
              if (rawCheck.indexOf(_changedPidNeedles[ni]) !== -1) {
                mightContain = true;
                break;
              }
            }
            if (!mightContain) {
              skippedByPrefilter += 1;
              continue;
            }
          }

          const day = readStoredValue(key, null);
          if (!day || !Array.isArray(day.meals)) continue;

          let dayChanged = false;

          for (let mi = 0; mi < day.meals.length; mi++) {
            const meal = day.meals[mi];
            const mealItems = Array.isArray(meal?.items) ? meal.items : [];
            for (let ii = 0; ii < mealItems.length; ii++) {
              const item = mealItems[ii];
              const itemPid = String(item.product_id ?? item.productId ?? '');
              const change = changesMap.get(itemPid);

              if (change) {
                const newProduct = change.new;
                const nameChanged = change.nameChanged;
                const nutrientsChanged = change.nutrientsChanged;

                if (nameChanged) {
                  item.name = newProduct.name;
                }
                if (change.brandChanged) {
                  const nextBrand = normalizeProductBrand(newProduct.brand);
                  if (nextBrand) item.brand = nextBrand;
                  else delete item.brand;
                }

                if (nutrientsChanged) {
                  // Macronutrients
                  item.kcal100 = newProduct.kcal100;
                  item.protein100 = newProduct.protein100;
                  item.fat100 = newProduct.fat100;
                  item.simple100 = newProduct.simple100;
                  item.complex100 = newProduct.complex100;
                  item.badFat100 = newProduct.badFat100;
                  item.goodFat100 = newProduct.goodFat100;
                  item.trans100 = newProduct.trans100;
                  item.fiber100 = newProduct.fiber100;
                  item.gi = newProduct.gi ?? newProduct.gi100;
                  item.harm = HEYS.models?.normalizeHarm?.(newProduct) ?? newProduct.harm;

                  // 🆕 v5.0 Enrichment: Micronutrients (batch cascade)
                  if (newProduct.iron != null) item.iron = newProduct.iron;
                  if (newProduct.magnesium != null) item.magnesium = newProduct.magnesium;
                  if (newProduct.zinc != null) item.zinc = newProduct.zinc;
                  if (newProduct.selenium != null) item.selenium = newProduct.selenium;
                  if (newProduct.calcium != null) item.calcium = newProduct.calcium;
                  if (newProduct.phosphorus != null) item.phosphorus = newProduct.phosphorus;
                  if (newProduct.potassium != null) item.potassium = newProduct.potassium;
                  if (newProduct.iodine != null) item.iodine = newProduct.iodine;

                  if (newProduct.vitamin_a != null) item.vitamin_a = newProduct.vitamin_a;
                  if (newProduct.vitamin_b1 != null) item.vitamin_b1 = newProduct.vitamin_b1;
                  if (newProduct.vitamin_b2 != null) item.vitamin_b2 = newProduct.vitamin_b2;
                  if (newProduct.vitamin_b3 != null) item.vitamin_b3 = newProduct.vitamin_b3;
                  if (newProduct.vitamin_b6 != null) item.vitamin_b6 = newProduct.vitamin_b6;
                  if (newProduct.vitamin_b9 != null) item.vitamin_b9 = newProduct.vitamin_b9;
                  if (newProduct.vitamin_b12 != null) item.vitamin_b12 = newProduct.vitamin_b12;
                  if (newProduct.vitamin_c != null) item.vitamin_c = newProduct.vitamin_c;
                  if (newProduct.vitamin_d != null) item.vitamin_d = newProduct.vitamin_d;
                  if (newProduct.vitamin_e != null) item.vitamin_e = newProduct.vitamin_e;
                  if (newProduct.vitamin_k != null) item.vitamin_k = newProduct.vitamin_k;

                  if (newProduct.omega3_100 != null) item.omega3_100 = newProduct.omega3_100;
                  if (newProduct.omega6_100 != null) item.omega6_100 = newProduct.omega6_100;
                  if (newProduct.cholesterol != null) item.cholesterol = newProduct.cholesterol;

                  if (newProduct.is_fermented != null) item.is_fermented = newProduct.is_fermented;
                  if (newProduct.is_raw != null) item.is_raw = newProduct.is_raw;
                  if (newProduct.is_organic != null) item.is_organic = newProduct.is_organic;
                  if (newProduct.is_whole_grain != null) item.is_whole_grain = newProduct.is_whole_grain;
                  if (newProduct.nova_group != null) item.nova_group = newProduct.nova_group;
                }

                dayChanged = true;
                updatedItems++;
              }
            }
          }

          if (dayChanged) {
            day.updatedAt = Date.now();
            // После pull из облака каскад только синхронизирует meal items с каталогом — не зеркалим
            // каждый день в upload (interceptSetItem → saveClientKey), иначе десятки dayv2 в очереди и фризы.
            if (typeof HEYS.cloud?.writeLocalKvWithoutMirror === 'function') {
              HEYS.cloud.writeLocalKvWithoutMirror(key, day);
            } else {
              writeRawValue(key, day);
            }
            updatedDays++;
          }
        } catch (e) {
          console.warn('[HEYS] Batch cascade error for key:', key, e);
        }
      }
      if (offset + CHUNK < dayKeys.length) {
        await __cascadeYieldToMain(48);
      }
    }

    if (updatedDays > 0) {
      console.info(`[HEYS.sync] ✅ Batch cascade complete: ${updatedItems} items in ${updatedDays} days (skipped ${skippedByPrefilter} via raw-string pre-filter, local-only mirror skip)`);
      // Clear caches to reflect changes
      HEYS.models?.clearMealTotalsCache?.();

      // v5.0.2: Диспатчим heys:day-updated для СЕГОДНЯ, чтобы React state
      // подхватил обновлённые kcal100/protein100 в items (ранее состояние не обновлялось).
      // Задержка 80мс: даём clearMealTotalsCache завершиться и избегаем race с текущим рендером.
      const _cascadeTodayDate =
        (HEYS.models?.todayISO?.()) ||
        new Date().toISOString().slice(0, 10);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { source: 'cascade-batch', date: _cascadeTodayDate }
        }));
        console.info('[HEYS.sync] 📅 Dispatched heys:day-updated for today after cascade batch:', _cascadeTodayDate);
      }, todayEventDelayMs);

      window.dispatchEvent(new CustomEvent('heys:mealitems-cascaded', {
        detail: { batchSize: changesMap.size, updatedDays, updatedItems }
      }));
    } else {
      console.log('[HEYS.sync] ℹ️ No historical items affected by batch update');
    }
  };

  /**
   * 🆕 v5.0: Auto-cascade listener for cloud sync
   * Automatically updates historical MealItems when products sync from shared_products
   */
  if (typeof window !== 'undefined') {
    // Guard against duplicate listeners if this module is evaluated multiple times
    if (!window.__heysProductsCascadeListenerV1) {
      window.__heysProductsCascadeListenerV1 = true;
      window.addEventListener('heysProductsUpdated', (event) => {
        if (event?.detail?.source === 'cloud-sync' && Array.isArray(event.detail.products)) {
          console.log('[HEYS.sync] 🔄 Products synced from cloud, triggering cascade update...');
          const prev = event?.detail?.previousProducts;
          const prods = event.detail.products;
          void cascadeBatchProductUpdates(prods, prev, { todayEventDelayMs: 1200 }).catch(function (err) {
            console.warn('[HEYS.sync] ⚠️ Cascade batch failed:', err && err.message ? err.message : err);
          });
        }
      });
    }
  }

  const updateSharedProduct = async (product, sharedIdOverride = null) => {
    const targetId = sharedIdOverride ?? product?.id ?? null;
    if (!product || !targetId) return { ok: false };
    if (!HEYS?.YandexAPI?.rest) {
      HEYS.Toast?.warning('API недоступен для обновления') || alert('API недоступен для обновления');
      return { ok: false };
    }

    let fingerprint = product?.fingerprint || null;
    if (!fingerprint && HEYS.models?.computeProductFingerprint) {
      try {
        fingerprint = await HEYS.models.computeProductFingerprint(product);
      } catch (e) {
        console.warn('[HEYS.portions] ⚠️ Не удалось вычислить fingerprint', e?.message || e);
      }
    }

    if (!fingerprint) {
      console.warn('[HEYS.portions] ⚠️ Нет fingerprint для shared update', {
        productId: targetId,
        name: product?.name || null
      });
      return { ok: false };
    }

    const productBrand = normalizeProductBrand(product.brand);
    const brandFingerprint = productBrand && HEYS.models?.computeProductBrandFingerprint
      ? await HEYS.models.computeProductBrandFingerprint(product)
      : null;

    const payload = {
      id: targetId,
      name: product.name || null,
      brand: productBrand || null,
      brand_fingerprint: brandFingerprint || null,
      name_norm: normalizeName(product.name),
      fingerprint: fingerprint,
      simple100: toNum(product.simple100, 0),
      complex100: toNum(product.complex100, 0),
      protein100: toNum(product.protein100, 0),
      badfat100: toNum(product.badFat100 ?? product.badfat100, 0),
      goodfat100: toNum(product.goodFat100 ?? product.goodfat100, 0),
      trans100: toNum(product.trans100, 0),
      fiber100: toNum(product.fiber100, 0),
      gi: toNum(product.gi, null),
      harm: toNum(HEYS.models?.normalizeHarm?.(product) ?? product.harm, null),
      category: product.category || null,
      portions: Array.isArray(product.portions) ? product.portions : null,
      description: product.description || null,
      barcode: normalizeBarcode(product.barcode) || null,
    sodium100: toNum(product.sodium100, null),
    omega3_100: toNum(product.omega3_100, null),
      omega6_100: toNum(product.omega6_100, null),
      nova_group: toInt(product.nova_group ?? product.novaGroup, null),
      additives: normalizeAdditives(product.additives),
      nutrient_density: toNum(product.nutrient_density ?? product.nutrientDensity, null),
      is_organic: product.is_organic ?? false,
      is_whole_grain: product.is_whole_grain ?? false,
      is_fermented: product.is_fermented ?? false,
      is_raw: product.is_raw ?? false,
      vitamin_a: toNum(product.vitamin_a, null),
      vitamin_c: toNum(product.vitamin_c, null),
      vitamin_d: toNum(product.vitamin_d, null),
      vitamin_e: toNum(product.vitamin_e, null),
      vitamin_k: toNum(product.vitamin_k, null),
      vitamin_b1: toNum(product.vitamin_b1, null),
      vitamin_b2: toNum(product.vitamin_b2, null),
      vitamin_b3: toNum(product.vitamin_b3, null),
      vitamin_b6: toNum(product.vitamin_b6, null),
      vitamin_b9: toNum(product.vitamin_b9, null),
      vitamin_b12: toNum(product.vitamin_b12, null),
      calcium: toNum(product.calcium, null),
      iron: toNum(product.iron, null),
      magnesium: toNum(product.magnesium, null),
      phosphorus: toNum(product.phosphorus, null),
      potassium: toNum(product.potassium, null),
      zinc: toNum(product.zinc, null),
      selenium: toNum(product.selenium, null),
      iodine: toNum(product.iodine, null)
    };

    payload.barcodes = getProductBarcodes(product);

    const minimalPayload = {
      id: targetId,
      name: product.name || null,
      brand: productBrand || null,
      brand_fingerprint: brandFingerprint || null,
      name_norm: normalizeName(product.name),
      fingerprint: fingerprint,
      simple100: toNum(product.simple100, 0),
      complex100: toNum(product.complex100, 0),
      protein100: toNum(product.protein100, 0),
      badfat100: toNum(product.badFat100 ?? product.badfat100, 0),
      goodfat100: toNum(product.goodFat100 ?? product.goodfat100, 0),
      trans100: toNum(product.trans100, 0),
      fiber100: toNum(product.fiber100, 0),
      gi: toNum(product.gi, null),
      harm: toNum(HEYS.models?.normalizeHarm?.(product) ?? product.harm, null),
      category: product.category || null,
      portions: Array.isArray(product.portions) ? product.portions : null,
      description: product.description || null,
      barcode: getProductBarcode(product) || null,
      barcodes: getProductBarcodes(product)
    };

    try {
      const primary = await HEYS.YandexAPI.rest('shared_products', {
        method: 'POST',
        data: payload,
        upsert: true,
        onConflict: 'id',
        select: 'id,name,brand,brand_fingerprint'
      });

      if (primary?.error?.code === 500) {
        console.warn('[HEYS.portions] ⚠️ Full payload failed, retry minimal payload', {
          productId: targetId
        });
        const fallback = await HEYS.YandexAPI.rest('shared_products', {
          method: 'POST',
          data: minimalPayload,
          upsert: true,
          onConflict: 'id',
          select: 'id,name,brand,brand_fingerprint'
        });
        if (fallback.error) {
          HEYS.Toast?.error('Ошибка обновления: ' + fallback.error) || alert('Ошибка обновления: ' + fallback.error);
          return { ok: false };
        }
        HEYS.Toast?.success('Продукт обновлён') || alert('Продукт обновлён');
        return { ok: true, fallback: true };
      }

      if (primary.error) {
        HEYS.Toast?.error('Ошибка обновления: ' + primary.error) || alert('Ошибка обновления: ' + primary.error);
        return { ok: false };
      }

      HEYS.Toast?.success('Продукт обновлён') || alert('Продукт обновлён');
      return { ok: true };
    } catch (e) {
      const msg = e?.message || 'Ошибка обновления';
      HEYS.Toast?.error(msg) || alert(msg);
      return { ok: false };
    }
  };

  const updateSharedProductBarcodes = async (product, sharedIdOverride = null, options = {}) => {
    const targetId = sharedIdOverride ?? resolveSharedProductId(product) ?? product?.id ?? null;
    if (!product || !targetId) return { ok: false, error: 'missing_shared_id' };
    const mode = options?.mode || 'replace';
    const explicitBarcode = normalizeBarcode(options?.barcode);
    if (mode === 'add' && explicitBarcode && HEYS.cloud?.addSharedProductBarcode) {
      try {
        const result = await HEYS.cloud.addSharedProductBarcode(targetId, explicitBarcode);
        if (result?.error) {
          console.warn('[HEYS.barcode] shared barcode attach failed', {
            productId: targetId,
            error: result.error
          });
          return { ok: false, error: result.error, status: result.status, raw: result.raw };
        }
        const sharedProduct = {
          ...product,
          ...(result?.data || {}),
          id: targetId
        };
        notifySharedProductUpdated(targetId, product.portions, sharedProduct);
        return { ok: true, product: sharedProduct };
      } catch (e) {
        console.warn('[HEYS.barcode] shared barcode attach exception', {
          productId: targetId,
          error: e?.message || e
        });
        return { ok: false, error: e?.message || e };
      }
    }

    if (!HEYS?.YandexAPI?.rest) {
      HEYS.Toast?.warning('API недоступен для обновления штрихкодов') || alert('API недоступен для обновления штрихкодов');
      return { ok: false, error: 'api_unavailable' };
    }

    const barcodes = getProductBarcodes(product);
    const barcode = barcodes[0] || null;
    const payload = { id: targetId, barcode, barcodes };

    try {
      const result = await HEYS.YandexAPI.rest('shared_products', {
        method: 'POST',
        data: payload,
        upsert: true,
        onConflict: 'id',
        select: 'id,name,barcode,barcodes'
      });

      if (result?.error) {
        console.warn('[HEYS.barcode] shared barcode update failed', {
          productId: targetId,
          error: result.error
        });
        return { ok: false, error: result.error };
      }

      const sharedProduct = {
        ...product,
        id: targetId,
        barcode,
        barcodes
      };
      HEYS.cloud?.updateCachedSharedProduct?.(targetId, { barcode, barcodes });
      notifySharedProductUpdated(targetId, product.portions, sharedProduct);
      return { ok: true, product: sharedProduct };
    } catch (e) {
      console.warn('[HEYS.barcode] shared barcode update exception', {
        productId: targetId,
        error: e?.message || e
      });
      return { ok: false, error: e?.message || e };
    }
  };

  const openProductPortionsEditor = (product) => {
    console.log('[openProductPortionsEditor] called with product:', product);
    if (!product) {
      console.log('[openProductPortionsEditor] no product, returning');
      return;
    }
    if (!HEYS?.StepModal || !HEYS?.AddProductStep?.PortionsStep) {
      console.log('[openProductPortionsEditor] StepModal or PortionsStep missing');
      HEYS.Toast?.warning('Модалка порций недоступна') || alert('Модалка порций недоступна');
      return;
    }

    if (!canEditProduct(product)) {
      console.log('[openProductPortionsEditor] canEditProduct returned false');
      HEYS.Toast?.warning('Нет доступа к редактированию') || alert('Нет доступа к редактированию');
      return;
    }

    console.log('[openProductPortionsEditor] calling HEYS.StepModal.show');
    HEYS.StepModal.show({
      steps: [
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Настройте порции',
          icon: '🥣',
          component: HEYS.AddProductStep.PortionsStep,
          validate: () => true,
          hideHeaderNext: true,
          getInitialData: () => ({
            selectedProduct: product,
            portions: product.portions || []
          })
        }
      ],
      context: {
        isEditMode: true,
        editProduct: product,
        onFinish: async ({ portions }) => {
          console.info('[HEYS.portions] 🏁 onFinish shared/personal edit', {
            productId: product?.id,
            productName: product?.name,
            receivedPortions: portions,
            shared_origin_id: product?.shared_origin_id
          });
          const normalized = normalizePortions(portions || []);
          const updatedProduct = {
            ...product,
            ...(normalized.length > 0 ? { portions: normalized } : {})
          };

          const sharedId = resolveSharedProductId(product);
	          if (isCuratorUser() && sharedId) {
	            const result = await updateSharedProductPortions(sharedId, normalized, updatedProduct);
	            if (result.ok) {
	              const commit = await commitPersonalProduct(updatedProduct, false, 'product-portions-shared');
	              if (!commit.ok) {
	                showProductCommitError(commit.reason);
	                return;
	              }
	              notifyPortionsUpdated(commit.product || updatedProduct, normalized);
	            }
	            return;
	          }

          if (isSharedProduct(product)) {
            if (isCuratorUser()) {
              const resolvedSharedId = resolveSharedProductId(product);
              if (!resolvedSharedId) {
                console.warn('[HEYS.portions] ⚠️ Не удалось определить shared UUID для порций', {
                  productId: product?.id,
                  productName: product?.name,
                  shared_origin_id: product?.shared_origin_id
                });
                return;
              }
	              const result = await updateSharedProductPortions(resolvedSharedId, normalized, updatedProduct);
	              if (result.ok) {
	                const commit = await commitPersonalProduct(updatedProduct, false, 'product-portions-shared');
	                if (!commit.ok) {
	                  showProductCommitError(commit.reason);
	                  return;
	                }
	                notifyPortionsUpdated(commit.product || updatedProduct, normalized);
	              }
	              return;
	            }

	            const commit = await commitPersonalProduct(updatedProduct, true, 'product-portions');
	            if (!commit.ok) {
	              showProductCommitError(commit.reason);
	              return;
	            }
	            notifyPortionsUpdated(commit.product || updatedProduct, normalized);
	            return;
	          }

	          await saveProductPortions(updatedProduct, normalized);
        }
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: false,
      allowSwipe: false,
      hidePrimaryOnFirst: true,
      title: ''
    });
  };

  // === Умный список продуктов: частота + свежесть ===
  function computeSmartProducts(products, dateKey, options = {}) {
    if (!products || !products.length) return [];

    const usageStats = options.usageStats instanceof Map
      ? options.usageStats
      : new Map(Array.isArray(options.usageStats) ? options.usageStats : []);
    const lastUsedDay = new Map(); // Последний день использования (daysAgo)
    const today = new Date(dateKey || new Date().toISOString().slice(0, 10));
    const now = Date.now();
    const daysWindow = Math.max(1, Math.min(60, Number(options.daysWindow) || 21));
    const favoritesSet = options.favorites instanceof Set
      ? options.favorites
      : new Set(Array.isArray(options.favorites) ? options.favorites : []);
    const hiddenSet = options.hidden instanceof Set
      ? options.hidden
      : new Set(Array.isArray(options.hidden) ? options.hidden : []);

    // Комбинированный скор: частота × свежесть
    // Свежесть: 1.0 для сегодня, убывает экспоненциально
    // Формула: score = frequency * recencyWeight
    // recencyWeight = 1 / (1 + daysAgo * 0.15)
    //
    // PERF: usage sync stores id, raw name and normalized name keys, so direct
    // Map lookups cover canonical data. A previous substring fallback scanned the
    // entire stats map for every product and dominated modal render time.
    const _resolveUsageStatsCache = new Map();
    const resolveUsageStats = (pid, name) => {
      const cacheKey = (pid == null ? '' : String(pid)) + '|' + String(name || '');
      if (_resolveUsageStatsCache.has(cacheKey)) {
        return _resolveUsageStatsCache.get(cacheKey);
      }
      const rawName = String(name || '').trim();
      const normName = normalizeName(rawName);
      const searchNorm = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        ? HEYS.SmartSearchWithTypos.utils.normalizeText(rawName)
        : normName;

      const candidates = [];
      if (pid && usageStats.has(pid)) candidates.push(usageStats.get(pid));
      if (normName && usageStats.has(normName)) candidates.push(usageStats.get(normName));
      if (searchNorm && usageStats.has(searchNorm)) candidates.push(usageStats.get(searchNorm));
      if (rawName && usageStats.has(rawName)) candidates.push(usageStats.get(rawName));

      let result;
      if (!candidates.length) {
        result = null;
      } else {
        result = candidates.reduce((best, curr) => {
          if (!best) return curr;
          const bc = Number(best.count) || 0;
          const cc = Number(curr.count) || 0;
          if (cc !== bc) return cc > bc ? curr : best;
          const bl = Number(best.lastUsed) || 0;
          const cl = Number(curr.lastUsed) || 0;
          return cl > bl ? curr : best;
        }, null);
      }
      _resolveUsageStatsCache.set(cacheKey, result);
      return result;
    };

    const getFreq = (pid, name) => {
      const stats = resolveUsageStats(pid, name);
      if (!stats || !stats.lastUsed) return 0;
      const daysAgo = Math.floor((now - stats.lastUsed) / (1000 * 60 * 60 * 24));
      if (daysAgo > daysWindow) return 0;
      lastUsedDay.set(pid, daysAgo);
      return Number(stats.count) || 0;
    };

    const getScore = (pid, name) => {
      const freq = getFreq(pid, name);
      if (freq === 0) return 0;
      const daysAgo = lastUsedDay.get(pid) ?? daysWindow;
      const recencyWeight = 1 / (1 + daysAgo * 0.15);
      return freq * recencyWeight;
    };

    const getGroupRank = (pid, name) => {
      const freq = getFreq(pid, name);
      const isFav = favoritesSet.has(pid);
      if (isFav && freq > 0) return 0; // избранные + часто используемые
      if (freq > 0) return 1; // часто используемые
      if (isFav) return 2; // избранные, но без использования
      // v2.8.3: недавно добавленные НИЖЕ используемых
      return 3;
    };

    // Недавно созданные/обновлённые (48ч) — показываем вверху даже без истории
    const recentWindowMs = 48 * 60 * 60 * 1000;
    const isRecentlyTouched = (p) => {
      const ts = Number(p.updatedAt || p.createdAt || 0);
      return ts > 0 && (now - ts) < recentWindowMs;
    };

    // Сортируем по комбинированному скору
    // v2.8.3: используемые продукты ВСЕГДА выше недавно добавленных
    const sorted = [...products]
      .filter(p => {
        const pid = String(p.id || p.product_id || p.name || '');
        if (!pid) return false;
        if (hiddenSet.has(pid)) return false; // Скрытые не показываем
        const freq = getFreq(pid, p.name);
        const isFav = favoritesSet.has(pid);
        return isFav || freq > 0 || isRecentlyTouched(p); // Использованные, избранные или недавно добавленные
      })
      .sort((a, b) => {
        const aId = String(a.id || a.product_id || a.name || '');
        const bId = String(b.id || b.product_id || b.name || '');

        // v2.8.3: группы сортировки —
        // 0: избранные + часто используемые
        // 1: часто используемые
        // 2: избранные без использования
        // 3: недавно добавленные (48ч) без использования
        // 4: остальные (не должны пройти фильтр)
        const aGroup = getGroupRank(aId, a.name);
        const bGroup = getGroupRank(bId, b.name);
        if (aGroup !== bGroup) return aGroup - bGroup;

        // Среди недавно добавленных (группа 3) — самые свежие сначала
        if (aGroup === 3) {
          const aTs = Number(a.updatedAt || a.createdAt || 0);
          const bTs = Number(b.updatedAt || b.createdAt || 0);
          if (aTs !== bTs) return bTs - aTs;
        }

        const aScore = getScore(aId, a.name);
        const bScore = getScore(bId, b.name);
        if (aGroup <= 1 && aScore !== bScore) return bScore - aScore;

        if (aGroup <= 1) {
          const aLast = lastUsedDay.get(aId) ?? 999;
          const bLast = lastUsedDay.get(bId) ?? 999;
          if (aLast !== bLast) return aLast - bLast;
        }

        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      });

    return dedupeProductsForPicker(sorted).slice(0, 20);
  }

  // Продукты из приёмов за сегодня и два предыдущих календарных дня.
  function computeRecentProducts(products, options = {}) {
    if (!Array.isArray(products) || products.length === 0) return [];

    const usageStats = options.usageStats instanceof Map
      ? options.usageStats
      : new Map(Array.isArray(options.usageStats) ? options.usageStats : []);
    const hiddenSet = options.hidden instanceof Set
      ? options.hidden
      : new Set(Array.isArray(options.hidden) ? options.hidden : []);
    const now = Number(options.now) || Date.now();
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 2);
    const cutoffTs = cutoff.getTime();

    const getLastUsed = (product) => {
      const pid = String(product?.id || product?.product_id || product?.name || '');
      const rawName = String(product?.name || '').trim();
      const normalizedName = normalizeName(rawName);
      const searchName = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        ? HEYS.SmartSearchWithTypos.utils.normalizeText(rawName)
        : normalizedName;
      const candidates = [pid, normalizedName, searchName, rawName]
        .filter(Boolean)
        .map((key) => Number(usageStats.get(key)?.lastUsed) || 0);
      return candidates.length > 0 ? Math.max(...candidates) : 0;
    };

    const sorted = products
      .map((product) => ({ product, lastUsed: getLastUsed(product) }))
      .filter(({ product, lastUsed }) => {
        const pid = String(product?.id || product?.product_id || product?.name || '');
        return !!pid && !hiddenSet.has(pid) && lastUsed >= cutoffTs && lastUsed <= now;
      })
      .sort((a, b) => {
        if (a.lastUsed !== b.lastUsed) return b.lastUsed - a.lastUsed;
        return String(a.product?.name || '').localeCompare(String(b.product?.name || ''), 'ru');
      })
      .map(({ product }) => product);

    return dedupeProductsForPicker(sorted);
  }

  // === Категории для фильтрации ===
  const CATEGORIES = [
    { id: 'all', name: 'Все', icon: '📋' },
    { id: 'dairy', name: 'Молочные', icon: '🥛', match: ['молоч', 'сыр', 'творог', 'йогурт', 'кефир', 'молоко'] },
    { id: 'meat', name: 'Мясо', icon: '🍖', match: ['мяс', 'курин', 'говя', 'свин', 'индейк', 'птиц'] },
    { id: 'fish', name: 'Рыба', icon: '🐟', match: ['рыб', 'морепр', 'лосось', 'тунец', 'креветк'] },
    { id: 'veggies', name: 'Овощи', icon: '🥬', match: ['овощ', 'салат', 'огурец', 'помидор', 'капуст', 'морков'] },
    { id: 'fruits', name: 'Фрукты', icon: '🍎', match: ['фрукт', 'ягод', 'яблок', 'банан', 'апельс'] },
    { id: 'grains', name: 'Крупы', icon: '🌾', match: ['круп', 'каш', 'рис', 'гречк', 'овся', 'хлеб', 'макар'] },
    { id: 'sweets', name: 'Сладкое', icon: '🍬', match: ['сладк', 'конфет', 'шокол', 'торт', 'печень', 'десерт'] }
  ];

  // Проверка категории продукта
  function matchCategory(product, categoryId) {
    if (categoryId === 'all') return true;
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat || !cat.match) return true;
    const name = (product.name || '').toLowerCase();
    const pCat = (product.category || '').toLowerCase();
    return cat.match.some(m => name.includes(m) || pCat.includes(m));
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🍽️ ГОТОВЫЕ НАБОРЫ — Meal Presets Overlay
  // ═══════════════════════════════════════════════════════════════════
  function resolveContextMeal(context) {
    const meals = Array.isArray(context?.day?.meals) ? context.day.meals : [];
    if (context?.mealId) {
      const byId = meals.find((meal) => meal && meal.id === context.mealId);
      if (byId) return byId;
    }
    return meals[context?.mealIndex] || null;
  }

  function formatContextMealLabel(context, fallback = 'приём') {
    const meal = resolveContextMeal(context);
    if (!meal) return fallback;
    const localize = HEYS.dayUtils?.localizeMealName;
    const name = typeof localize === 'function'
      ? localize(meal.name, fallback)
      : (meal.name || fallback);
    return [meal.time, name].filter(Boolean).join(' ');
  }

  function MealPresetsOverlay({ context, onClose }) {
    const autoCreate = !!context?._openPresetsCreate;
    const contextMeal = resolveContextMeal(context);
    const contextMealItems = contextMeal?.items || [];
    const [view, setView] = useState(() => autoCreate ? 'create' : 'list');
    const [presets, setPresets] = useState(() => HEYS.store?.getMealPresets?.() || []);
    const [suggestedPresets, setSuggestedPresets] = useState(() => HEYS.store?.getSuggestedPresets?.() || []);
    const [selectedPreset, setSelectedPreset] = useState(null);
    const [previewItems, setPreviewItems] = useState([]);
    const [isApplyingPreset, setIsApplyingPreset] = useState(false);
    const [createName, setCreateName] = useState(() => {
      if (!autoCreate) return '';
      return contextMeal?.name || 'Набор';
    });
    const [editPreset, setEditPreset] = useState(() => {
      if (!autoCreate) return null;
      const mealItems = contextMealItems;
      const items = mealItems.map(item => ({
        product_id: item.product_id,
        name: item.name,
        grams: HEYS.models.normalizeItemGrams(item.grams, 100),
        kcal100: item.kcal100,
        protein100: item.protein100,
        fat100: item.fat100,
        simple100: item.simple100 || 0,
        complex100: item.complex100 || 0,
        badFat100: item.badFat100 || 0,
        goodFat100: item.goodFat100 || 0,
        trans100: item.trans100 || 0,
        fiber100: item.fiber100 || 0,
        gi: item.gi || 0,
        harm: item.harm || 0,
      }));
      return { id: null, items, createdAt: null };
    });
    const [createSearch, setCreateSearch] = useState('');
    const [deleteConfirmPreset, setDeleteConfirmPreset] = useState(null);
    const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
    const [listEditMode, setListEditMode] = useState(false);

    // Запускаем анализ истории при открытии оверлея
    useEffect(() => {
      const count = runPresetSuggestions({ force: true });
      if (count != null) {
        setSuggestedPresets(HEYS.store?.getSuggestedPresets?.() || []);
        console.info('[HEYS.presets] ✅ Suggestion engine run, suggestions:', count);
      }
    }, []);

    const refreshPresets = () => {
      setPresets(HEYS.store?.getMealPresets?.() || []);
      setSuggestedPresets(HEYS.store?.getSuggestedPresets?.() || []);
    };

    const handleConfirmSuggested = (preset) => {
      HEYS.store?.confirmSuggestedPreset?.(preset.id);
      refreshPresets();
      console.info('[HEYS.presets] ✅ Рекомендация подтверждена:', preset.name);
    };

    const handleDismissSuggested = (preset) => {
      HEYS.store?.dismissSuggestedPreset?.(preset.id);
      refreshPresets();
      console.info('[HEYS.presets] ✅ Рекомендация отклонена:', preset.name);
    };

    const handleCreateFromMeal = () => {
      const mealItems = contextMealItems;
      if (mealItems.length === 0) {
        console.warn('[HEYS.presets] ⚠️ No items in current meal');
        return;
      }
      const mealName = contextMeal?.name || 'Набор';
      const items = mealItems.map(item => ({
        product_id: item.product_id,
        name: item.name,
        grams: HEYS.models.normalizeItemGrams(item.grams, 100),
        kcal100: item.kcal100,
        protein100: item.protein100,
        fat100: item.fat100,
        simple100: item.simple100 || 0,
        complex100: item.complex100 || 0,
        badFat100: item.badFat100 || 0,
        goodFat100: item.goodFat100 || 0,
        trans100: item.trans100 || 0,
        fiber100: item.fiber100 || 0,
        gi: item.gi || 0,
        harm: item.harm || 0,
      }));
      setCreateName(mealName);
      setEditPreset({ id: null, items, createdAt: null });
      setView('create');
    };

    const handleCreateFromScratch = () => {
      setCreateName('');
      setCreateSearch('');
      setEditPreset({ id: null, items: [], createdAt: null });
      setView('create');
    };

    const addProductToCreate = (product) => {
      setCreateSearch('');
      setEditPreset(ep => {
        const exists = (ep?.items || []).findIndex(i => String(i.product_id) === String(product.id ?? product.product_id));
        if (exists >= 0) return ep; // уже добавлен
        const newItem = {
          product_id: product.id ?? product.product_id,
          name: product.name,
          grams: 100,
          kcal100: product.kcal100 || 0,
          protein100: product.protein100 || 0,
          fat100: product.fat100 || 0,
          simple100: product.simple100 || 0,
          complex100: product.complex100 || 0,
          badFat100: product.badFat100 || 0,
          goodFat100: product.goodFat100 || 0,
          trans100: product.trans100 || 0,
          fiber100: product.fiber100 || 0,
          gi: product.gi || 0,
          harm: product.harm || 0,
        };
        return { ...ep, items: [...(ep?.items || []), newItem] };
      });
    };

    const handleEditPreset = (preset) => {
      setCreateName(preset.name);
      setEditPreset({ ...preset });
      setView('create');
    };

    const handleApplyPreset = (preset) => {
      setSelectedPreset(preset);
      setPreviewItems((preset.items || []).map(item => ({ ...item })));
      setView('preview');
    };

    const handleDeletePreset = (preset) => {
      HEYS.store?.deleteMealPreset?.(preset.id);
      refreshPresets();
      console.info('[HEYS.presets] ✅ Preset deleted:', preset.name);
    };

    const requestDeletePreset = (preset, event) => {
      event?.stopPropagation?.();
      setDeleteConfirmPreset(preset);
    };

    const confirmDeletePreset = () => {
      if (deleteConfirmPreset) handleDeletePreset(deleteConfirmPreset);
      setDeleteConfirmPreset(null);
    };

    const handleSavePreset = () => {
      if (!createName.trim()) return;
      const preset = {
        id: editPreset?.id || undefined,
        name: createName.trim(),
        items: editPreset?.items || [],
        createdAt: editPreset?.createdAt || undefined,
      };
      HEYS.store?.saveMealPreset?.(preset);
      refreshPresets();
      setView('list');
      console.info('[HEYS.presets] ✅ Preset saved:', { name: preset.name, itemCount: preset.items.length });
      setSaveConfirmOpen(false);
    };

    const requestSavePreset = () => {
      if (!createName.trim()) return;
      setSaveConfirmOpen(true);
    };

    const handleAddAll = () => {
      const itemsToAdd = previewItems.filter(item => !item._excluded);
      if (itemsToAdd.length === 0 || isApplyingPreset) return;
      setIsApplyingPreset(true);
      setTimeout(async () => {
        try {
          const entries = itemsToAdd.map((item) => ({
            product: {
              id: item.product_id,
              product_id: item.product_id,
              name: item.name,
              grams: item.grams,
              kcal100: item.kcal100,
              protein100: item.protein100,
              fat100: item.fat100,
              simple100: item.simple100 || 0,
              complex100: item.complex100 || 0,
              badFat100: item.badFat100 || 0,
              goodFat100: item.goodFat100 || 0,
              trans100: item.trans100 || 0,
              fiber100: item.fiber100 || 0,
              gi: item.gi || 0,
              harm: item.harm || 0,
            },
            grams: item.grams
          }));
          const traceId = createAddTraceId('preset-bulk');
          if (typeof context?.onAddMany === 'function') {
            pushAddTrace('🧩 Preset bulk -> onAddMany', {
              traceId,
              mealIndex: context?.mealIndex ?? null,
              mealId: context?.mealId ?? null,
              count: entries.length,
              productIds: entries.map((entry) => entry.product.id ?? entry.product.product_id ?? null),
              productNames: entries.map((entry) => entry.product.name || null),
              presetName: selectedPreset?.name || null
            });
            const didAdd = await context.onAddMany({
              entries,
              mealIndex: context?.mealIndex,
              mealId: context?.mealId,
              _traceId: traceId,
              _origin: 'preset-apply-bulk',
              _presetName: selectedPreset?.name || null
            });
            if (didAdd === false) throw new Error('preset_bulk_add_blocked');
          } else {
            console.warn('[HEYS.presets] ⚠️ onAddMany missing, falling back to sequential onAdd');
            for (let idx = 0; idx < entries.length; idx += 1) {
              const entry = entries[idx];
              const itemTraceId = createAddTraceId(`preset-${idx + 1}`);
              pushAddTrace('🧩 Preset item -> onAdd (fallback)', {
                traceId: itemTraceId,
                mealIndex: context?.mealIndex ?? null,
                mealId: context?.mealId ?? null,
                grams: entry.grams,
                productId: entry.product.id ?? entry.product.product_id ?? null,
                productName: entry.product.name || null,
                _presetBatch: { index: idx, total: entries.length }
              });
              if (typeof context?.onAdd !== 'function') throw new Error('preset_onadd_missing');
              const didAdd = await context.onAdd({
                product: entry.product,
                grams: entry.grams,
                mealIndex: context?.mealIndex,
                mealId: context?.mealId,
                _traceId: itemTraceId,
                _origin: 'preset-apply',
                _presetBatch: { index: idx, total: entries.length }
              });
              if (didAdd === false) throw new Error('preset_item_add_blocked');
            }
          }
          const itemCount = itemsToAdd.length;
          const presetName = selectedPreset?.name;
          console.info('[HEYS.presets] ✅ Applied preset:', { name: presetName, count: itemCount });

        // 🆕 R-INS-PRESET-AS-ONE: набор считается за ОДИН выбор продукта,
        // а не за N (N = items в наборе). Юзер указал «добавить 3» и выбрал
        // набор из 3 продуктов — раньше счётчик падал до 0 после применения
        // набора и модалка закрывалась. Теперь:
        //   1. consumeAutoRepeatStep() вызывается 1 раз (минус 1 от целевого N)
        //   2. Если remaining > 0 — закрываем ТОЛЬКО overlay пресетов (onClose),
        //      модалка AddProductStep остаётся открытой → юзер выбирает ещё.
        //   3. Если remaining <= 0 — закрываем всю модалку.
        // Для multiProductMode без autoRepeat — тоже возвращаем юзера к выбору
        // (он сам решит когда закрыть через X).
          const hasAutoRepeat = !!context?.hasAutoRepeat;
          const isMultiMode = !!context?.multiProductMode;
          if (hasAutoRepeat && typeof context?.consumeAutoRepeatStep === 'function') {
            const remaining = context.consumeAutoRepeatStep();
            if (remaining > 0) {
              console.info('[HEYS.presets] 🔁 Preset = 1 step, remaining:', remaining);
              onClose?.(); // закрыть только overlay пресетов, AddProductStep остаётся
              return;
            }
          } else if (isMultiMode) {
            // multi mode без autoRepeat — после набора возвращаем к выбору продукта,
            // юзер сам закроет модал когда захочет.
            onClose?.();
            return;
          }

          // autoRepeat исчерпан ИЛИ обычный режим → закрываем всю модалку
          dispatchMealFlowFinishedFromContext('add-product-step-preset-complete', context, {
            count: itemCount,
            presetName: presetName || null,
          });
          if (HEYS.StepModal?.hide) {
            HEYS.StepModal.hide({ scrollToDiary: true });
          } else {
            onClose?.();
          }
        } catch (error) {
          setIsApplyingPreset(false);
          console.error('[HEYS.presets] ❌ Failed to apply preset:', error);
        }
      }, 0);
    };

    const updateItemGrams = (idx, delta) => {
      setPreviewItems(items => items.map((item, i) =>
        i !== idx ? item : { ...item, grams: Math.max(5, (item.grams || 100) + delta) }
      ));
    };

    const multiplyItemGrams = (idx, multiplier = 2) => {
      setPreviewItems((items) => items.map((item, i) => {
        if (i !== idx) return item;
        const currentGrams = Math.max(5, Number(item.grams) || 100);
        const nextGrams = Math.max(5, Math.round(currentGrams * multiplier));
        console.info('[HEYS.presets] ✖️ Preview item grams multiplied', {
          itemName: item.name,
          currentGrams,
          nextGrams,
          multiplier
        });
        return { ...item, grams: nextGrams };
      }));
    };

    const multiplyActivePreviewItems = (multiplier = 2) => {
      setPreviewItems((items) => items.map((item) => {
        if (item._excluded) return item;
        const currentGrams = Math.max(5, Number(item.grams) || 100);
        return { ...item, grams: Math.max(5, Math.round(currentGrams * multiplier)) };
      }));
    };

    const setItemGrams = (idx, val) => {
      const raw = String(val ?? '').trim();
      if (raw === '') {
        setPreviewItems(items => items.map((item, i) =>
          i !== idx ? item : { ...item, grams: '' }
        ));
        return;
      }
      const g = parseInt(raw, 10);
      setPreviewItems(items => items.map((item, i) =>
        i !== idx ? item : { ...item, grams: isNaN(g) ? item.grams : g }
      ));
    };

    const commitItemGrams = (idx) => {
      setPreviewItems(items => items.map((item, i) => {
        if (i !== idx) return item;
        const g = Number(item.grams);
        return { ...item, grams: Number.isFinite(g) && g > 0 ? Math.max(5, Math.round(g)) : 100 };
      }));
    };

    const toggleExclude = (idx) => {
      setPreviewItems(items => items.map((item, i) =>
        i !== idx ? item : { ...item, _excluded: !item._excluded }
      ));
    };

    const removeCreateItem = (idx) => {
      setEditPreset(ep => ({ ...ep, items: (ep?.items || []).filter((_, i) => i !== idx) }));
    };

    const updateCreateItemGrams = (idx, val) => {
      const raw = String(val ?? '').trim();
      if (raw === '') {
        setEditPreset(ep => ({
          ...ep,
          items: (ep?.items || []).map((item, i) =>
            i !== idx ? item : { ...item, grams: '' }
          )
        }));
        return;
      }
      const g = parseInt(raw, 10);
      setEditPreset(ep => ({
        ...ep,
        items: (ep?.items || []).map((item, i) =>
          i !== idx ? item : { ...item, grams: isNaN(g) ? item.grams : g }
        )
      }));
    };

    const commitCreateItemGrams = (idx) => {
      setEditPreset(ep => ({
        ...ep,
        items: (ep?.items || []).map((item, i) => {
          if (i !== idx) return item;
          const g = Number(item.grams);
          return { ...item, grams: Number.isFinite(g) && g > 0 ? Math.max(5, Math.round(g)) : 100 };
        })
      }));
    };

    const calcKcal = (item) =>
      item.kcal100 ? Math.round((item.kcal100 * HEYS.models.normalizeItemGrams(item.grams, 100)) / 100) : 0;

    const pluralProduct = (n) =>
      n === 1 ? 'продукт' : n <= 4 ? 'продукта' : 'продуктов';

    const handleMySetRowClick = (preset) => {
      if (!listEditMode) return;
      handleEditPreset(preset);
    };

    const handleMySetRowKeyDown = (event, preset) => {
      if (!listEditMode || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      handleEditPreset(preset);
    };

    // --- List view ---
    const renderList = () =>
      React.createElement('div', { className: 'mpr-list' },
        suggestedPresets.length > 0 && React.createElement('div', { className: 'mpr-suggested-section' },
          React.createElement('div', { className: 'mpr-tier' }, 'Замечено в истории'),
          suggestedPresets.map((preset) =>
            React.createElement('div', { key: preset.id, className: 'mpr-suggested-card' },
              React.createElement('div', { className: 'mpr-suggested-card__head' },
                React.createElement('div', { className: 'mpr-suggested-card__name' }, preset.name),
                React.createElement('div', { className: 'mpr-suggested-card__freq' },
                  `повторялось ${preset.frequency || 0}×`)
              ),
              React.createElement('div', { className: 'mpr-suggested-card__actions' },
                React.createElement('button', {
                  type: 'button',
                  className: 'mpr-btn mpr-btn--save-suggested',
                  onClick: () => handleConfirmSuggested(preset),
                  title: 'Сохранить в мои наборы'
                }, 'Сохранить как набор'),
                React.createElement('button', {
                  type: 'button',
                  className: 'mpr-btn mpr-btn--hide-suggested',
                  onClick: () => handleDismissSuggested(preset),
                  title: 'Скрыть рекомендацию'
                }, 'Скрыть')
              )
            )
          )
        ),
        presets.length > 0 && React.createElement('div', { className: 'mpr-my-sets-block' },
          React.createElement('div', { className: 'mpr-tier' }, 'Мои наборы'),
          React.createElement('div', { className: 'mpr-my-sets-list' },
            presets.map((preset) => {
              const presetKcal = (preset.items || []).reduce((sum, item) => sum + calcKcal(item), 0);
              const rowClass = 'mpr-my-set-row' + (listEditMode ? ' mpr-my-set-row--editable' : '');
              return React.createElement('div', {
                key: preset.id,
                className: rowClass,
                onClick: () => handleMySetRowClick(preset),
                onKeyDown: (event) => handleMySetRowKeyDown(event, preset),
                role: listEditMode ? 'button' : undefined,
                tabIndex: listEditMode ? 0 : undefined
              },
                React.createElement('div', { className: 'mpr-my-set-row__main' },
                  React.createElement('div', { className: 'mpr-my-set-row__name' }, preset.name),
                  React.createElement('div', { className: 'mpr-my-set-row__meta' },
                    `${preset.items.length} ${pluralProduct(preset.items.length)} · ${presetKcal} ккал`)
                ),
                !listEditMode && React.createElement('button', {
                  type: 'button',
                  className: 'mpr-btn mpr-btn--add-row',
                  onClick: (event) => {
                    event.stopPropagation();
                    handleApplyPreset(preset);
                  },
                  title: 'Добавить набор'
                }, 'Добавить')
              );
            })
          )
        ),
        presets.length === 0 && suggestedPresets.length === 0
          ? React.createElement('div', { className: 'mpr-empty' },
            React.createElement('div', { className: 'mpr-empty-text' }, 'Нет сохранённых наборов'),
            React.createElement('div', { className: 'mpr-empty-hint' }, 'Соберите набор из продуктов — добавится одним тапом')
          )
          : null,
        React.createElement('button', {
          type: 'button',
          className: 'mpr-assemble-btn',
          onClick: handleCreateFromScratch
        }, 'Собрать новый набор'),
        presets.length > 0 && React.createElement('div', { className: 'mpr-footnote' },
          'Правка и удаление — по тапу на строку, чтобы три иконки не висели у каждой. Долгое нажатие во флоу не используется нигде.')
      );

    // --- Preview view ---
    const renderPreview = () => {
      const active = previewItems.filter(i => !i._excluded);
      const totalKcal = active.reduce((s, i) => s + calcKcal(i), 0);
      return React.createElement('div', { className: 'mpr-preview' },
        React.createElement('div', { className: 'mpr-preview-set-tools' },
          React.createElement('div', { className: 'mpr-preview-set-tools__copy' },
            React.createElement('span', { className: 'mpr-preview-set-tools__label' }, 'Весь набор'),
            React.createElement('span', { className: 'mpr-preview-set-tools__hint' }, 'умножить все активные позиции')
          ),
          React.createElement('button', {
            className: 'mpr-preview-set-tools__double',
            onClick: () => multiplyActivePreviewItems(2),
            disabled: active.length === 0,
            title: 'Умножить граммы всех активных продуктов на 2'
          }, '×2')
        ),
        React.createElement('div', { className: 'mpr-preview-items' },
          previewItems.map((item, idx) =>
            React.createElement('div', {
              key: idx,
              className: 'mpr-preview-item' + (item._excluded ? ' mpr-preview-item--excluded' : '')
            },
              React.createElement('div', { className: 'mpr-preview-item-top' },
                React.createElement('div', { className: 'mpr-preview-item-name' }, item.name),
                React.createElement('button', {
                  className: 'mpr-preview-item-toggle',
                  onClick: () => toggleExclude(idx),
                  title: item._excluded ? 'Включить' : 'Убрать'
                }, item._excluded ? '✓' : '✕')
              ),
              React.createElement('div', { className: 'mpr-preview-item-bottom' },
                React.createElement('div', { className: 'mpr-preview-item-kcal' },
                  item._excluded ? 'убран' : `${calcKcal(item)} ккал`
                ),
                !item._excluded && React.createElement('div', { className: 'mpr-preview-item-grams' },
                  React.createElement('button', {
                    className: 'mpr-grams-btn',
                    onClick: () => updateItemGrams(idx, -10)
                  }, '−'),
                  React.createElement('input', {
                    className: 'mpr-grams-input',
                    type: 'number',
                    value: item.grams,
                    min: 5,
                    onChange: (e) => setItemGrams(idx, e.target.value),
                    onBlur: () => commitItemGrams(idx),
                    onFocus: (e) => e.target.select()
                  }),
                  React.createElement('span', { className: 'mpr-grams-unit' }, 'г'),
                  React.createElement('button', {
                    className: 'mpr-grams-btn',
                    onClick: () => updateItemGrams(idx, 10)
                  }, '+'),
                  React.createElement('button', {
                    className: 'mpr-grams-btn mpr-grams-btn--double',
                    onClick: () => multiplyItemGrams(idx, 2),
                    title: 'Умножить на 2'
                  }, '×2')
                )
              )
            )
          )
        ),
        React.createElement('div', { className: 'mpr-preview-total' },
          `Итого: ${totalKcal} ккал · ${active.length} ${pluralProduct(active.length)}`
        ),
        React.createElement('button', {
          className: 'mpr-add-all-btn',
          onClick: handleAddAll,
          disabled: active.length === 0 || isApplyingPreset
        },
          isApplyingPreset
            ? 'Добавляем...'
            : `Добавить ${active.length} ${pluralProduct(active.length)} · ${totalKcal} ккал`
        )
      );
    };

    // PERF NEW-2: deferred + memoized search results.
    // Вычисляем напрямую — 357 прод × 6 макс = <1ms, useMemo/useDeferredValue излишни.
    // HEYS.products.getAll() читается при каждом рендере: гарантирует актуальный каталог
    // независимо от context?.products (снимок может быть пустым при _openPresetsCreate).
    const _searchLc = (createSearch || '').toLowerCase().trim();
    const _searchResults = _searchLc.length < 1 ? [] : (() => {
      const allProducts = HEYS.products?.getAll?.() || context?.products || [];
      const out = [];
      for (let i = 0; i < allProducts.length && out.length < 8; i++) {
        const p = allProducts[i];
        if ((p.name || '').toLowerCase().includes(_searchLc)) out.push(p);
      }
      return out;
    })();

    // --- Create/Edit view ---
    const renderCreate = () => {
      const searchResults = _searchResults;
      return React.createElement('div', { className: 'mpr-create' },
        React.createElement('input', {
          className: 'mpr-create-name-input',
          type: 'text',
          placeholder: 'Название набора...',
          value: createName,
          maxLength: 40,
          autoFocus: !createSearch,
          onChange: (e) => setCreateName(e.target.value)
        }),
        // Поиск для добавления продуктов
        React.createElement('div', { className: 'mpr-search-wrap' },
          React.createElement('div', { className: 'mpr-search-row' },
            React.createElement('span', { className: 'mpr-search-icon' }, '🔍'),
            React.createElement('input', {
              className: 'mpr-search-input',
              type: 'text',
              placeholder: 'Добавить продукт в набор...',
              value: createSearch,
              onChange: (e) => setCreateSearch(e.target.value),
              autoComplete: 'off'
            }),
            createSearch && React.createElement('button', {
              className: 'mpr-search-clear',
              onClick: () => setCreateSearch('')
            }, '×')
          ),
          searchResults.length > 0 && React.createElement('div', { className: 'mpr-search-results' },
            searchResults.map(p =>
              React.createElement('button', {
                key: p.id ?? p.product_id,
                className: 'mpr-search-result-item',
                onClick: () => addProductToCreate(p)
              },
                React.createElement('div', { className: 'mpr-search-result-name' }, p.name),
                React.createElement('div', { className: 'mpr-search-result-meta' },
                  React.createElement('span', { className: 'mpr-search-result-kcal' }, `${Math.round(p.kcal100 || 0)} ккал`),
                  React.createElement('span', { className: 'mpr-search-result-macros' },
                    `Б${Math.round(p.protein100 || 0)} Ж${Math.round(p.fat100 || 0)} У${Math.round((p.simple100 || 0) + (p.complex100 || 0))}`
                  )
                )
              )
            )
          )
        ),
        // Список добавленных продуктов
        React.createElement('div', { className: 'mpr-create-items' },
          (editPreset?.items || []).length === 0
            ? React.createElement('div', { className: 'mpr-empty' },
              React.createElement('div', { className: 'mpr-empty-text' }, 'Добавьте продукты через поиск')
            )
            : (editPreset?.items || []).map((item, idx) =>
              React.createElement('div', { key: idx, className: 'mpr-create-item' },
                React.createElement('div', { className: 'mpr-create-item-top' },
                  React.createElement('div', { className: 'mpr-create-item-name' }, item.name),
                  React.createElement('button', {
                    className: 'mpr-btn mpr-btn--delete',
                    onClick: () => removeCreateItem(idx)
                  }, '✕')
                ),
                React.createElement('div', { className: 'mpr-create-item-bottom' },
                  React.createElement('div', { className: 'mpr-create-item-kcal' },
                    `${Math.round(((item.kcal100 || 0) * HEYS.models.normalizeItemGrams(item.grams, 100)) / 100)} ккал`
                  ),
                  React.createElement('div', { className: 'mpr-preview-item-grams' },
                    React.createElement('button', {
                      className: 'mpr-grams-btn',
                      onClick: () => updateCreateItemGrams(idx, Math.max(5, (Number(item.grams) || 100) - 10))
                    }, '−'),
                    React.createElement('input', {
                      className: 'mpr-grams-input',
                      type: 'number',
                      value: item.grams,
                      min: 5,
                      onChange: (e) => updateCreateItemGrams(idx, e.target.value),
                      onBlur: () => commitCreateItemGrams(idx),
                      onFocus: (e) => e.target.select()
                    }),
                    React.createElement('span', { className: 'mpr-grams-unit' }, 'г'),
                    React.createElement('button', {
                      className: 'mpr-grams-btn',
                      onClick: () => updateCreateItemGrams(idx, (Number(item.grams) || 100) + 10)
                    }, '+')
                  )
                )
              )
            )
        ),
        React.createElement('button', {
          className: 'mpr-save-btn',
          disabled: !createName.trim() || (editPreset?.items || []).length === 0,
          onClick: requestSavePreset
        }, 'Сохранить набор'),
        editPreset?.id && React.createElement('button', {
          type: 'button',
          className: 'mpr-delete-preset-btn',
          onClick: () => setDeleteConfirmPreset(editPreset)
        }, 'Удалить набор')
      );
    };

    const viewTitle = view === 'list' ? 'Наборы'
      : view === 'preview' ? (selectedPreset?.name || 'Просмотр набора')
        : (editPreset?.id ? 'Редактировать набор' : 'Создать набор');

    return React.createElement('div', { className: 'mpr-overlay' },
      React.createElement('div', { className: 'mpr-header' },
        React.createElement('button', {
          type: 'button',
          className: 'mpr-back-btn',
          onClick: () => {
            if (view !== 'list') {
              setView('list');
              return;
            }
            onClose?.();
          },
          'aria-label': view === 'list' ? 'Назад' : 'К списку наборов'
        }, '←'),
        React.createElement('div', { className: 'mpr-title' }, viewTitle),
        view === 'list'
          ? React.createElement('button', {
            type: 'button',
            className: 'mpr-header-edit-btn' + (listEditMode ? ' is-active' : ''),
            onClick: () => setListEditMode((active) => !active)
          }, listEditMode ? 'Готово' : 'Править')
          : React.createElement('div', { className: 'mpr-header-spacer' })
      ),
      React.createElement('div', { className: 'mpr-body' },
        view === 'list' ? renderList()
          : view === 'preview' ? renderPreview()
            : renderCreate()
      ),
      deleteConfirmPreset && React.createElement('div', { className: 'aps-v4-preset-confirm', role: 'dialog', 'aria-modal': 'true' },
        React.createElement('div', { className: 'aps-v4-preset-confirm__card' },
          React.createElement('div', { className: 'aps-v4-search-state__title', style: { color: 'var(--v4-sand-act-deep, #8a4a20)' } }, 'Удалить набор'),
          React.createElement('div', { style: { fontWeight: 700, fontSize: '16px', marginTop: '11px' } }, `«${deleteConfirmPreset.name}»`),
          React.createElement('div', { className: 'aps-v4-search-state__body' },
            'Набор исчезнет из списка. Уже добавленные приёмы останутся как есть — удаляется только заготовка.'),
          React.createElement('div', { className: 'aps-v4-search-state__actions' },
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-ghost aps-v4-btn-paper',
              onClick: () => setDeleteConfirmPreset(null)
            }, 'Отмена'),
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-attention',
              onClick: confirmDeletePreset
            }, 'Удалить'))
        )
      ),
      saveConfirmOpen && React.createElement('div', { className: 'aps-v4-preset-confirm', role: 'dialog', 'aria-modal': 'true' },
        React.createElement('div', { className: 'aps-v4-preset-confirm__card' },
          React.createElement('div', { style: { fontWeight: 700, fontSize: '16px' } }, 'Сохранить как набор'),
          React.createElement('div', { className: 'aps-v4-search-state__body' },
            `${(editPreset?.items || []).length || 0} ${((editPreset?.items || []).length === 1) ? 'продукт' : 'продукта'} с граммовкой. В следующий раз добавится одним тапом.`),
          React.createElement('div', { className: 'aps-v4-create-field', style: { marginTop: '16px' } },
            React.createElement('label', null, 'Название'),
            React.createElement('input', {
              type: 'text',
              value: createName,
              onChange: (e) => setCreateName(e.target.value)
            })),
          React.createElement('div', { className: 'aps-v4-search-state__tier', style: { marginTop: '14px' } }, 'Состав'),
          React.createElement('div', { className: 'aps-v4-search-state__tier-list' },
            (editPreset?.items || []).slice(0, 6).map((item, index) =>
              React.createElement('div', { key: index }, `${item.name} · ${item.grams} г`))),
          React.createElement('div', { className: 'aps-v4-search-state__actions' },
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-primary',
              onClick: handleSavePreset
            }, 'Сохранить'),
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-ghost aps-v4-btn-paper',
              onClick: () => setSaveConfirmOpen(false)
            }, 'Отмена'))
        )
      )
    );
  }

  // === Компонент поиска продукта (Шаг 1) ===
  const APS_PRODUCTS_SETTLE_FALLBACK_MS = 2200;

  function getAddProductInitialSyncState() {
    const cloud = HEYS?.cloud;
    const syncSettled = !!(
      window.HEYS?.initialSyncDone
      || window.HEYS?.syncCompletedAt
      || cloud?._syncCompletedAt
    );
    const syncInFlight = !!cloud?.isSyncing?.();
    return { syncSettled, syncInFlight };
  }

  function BarcodeScannerModal({ title, subtitle, initialValue = '', autoStart = false, cameraStart = null, onDetected, onClose, fullscreen = false }) {
    const [manualValue, setManualValue] = useState(initialValue);
    const [error, setError] = useState('');
    const [cameraState, setCameraState] = useState(() => (
      autoStart === true
      || !!cameraStart?.streamPromise
      || HEYS.__barcodeCameraAutoStart === true
      || readStoredValue(BARCODE_CAMERA_AUTOSTART_KEY, false) === true
        ? 'requesting'
        : 'idle'
    ));
    const [, setDebugCopyState] = useState('');
    const [, setDebugReportText] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scannerRef = useRef(null);
    const readyTimerRef = useRef(null);
    const debugRefreshTimerRef = useRef(null);
    const startRequestRef = useRef(false);
    const autoStartAttemptedRef = useRef(false);
    const cameraDebugRef = useRef([]);
    const cameraStateRef = useRef(cameraState);
    const errorRef = useRef(error);
    const manualValueRef = useRef(manualValue);
    const cameraStartRef = useRef(cameraStart);
    const isIOSCameraBrowser = () => {
      const ua = navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    };

    useEffect(() => {
      cameraStateRef.current = cameraState;
    }, [cameraState]);

    useEffect(() => {
      errorRef.current = error;
    }, [error]);

    useEffect(() => {
      manualValueRef.current = manualValue;
    }, [manualValue]);

    useEffect(() => {
      cameraStartRef.current = cameraStart;
    }, [cameraStart]);

    const appendCameraDebug = useCallback((stage, data = {}) => {
      try {
        cameraDebugRef.current.push({
          at: new Date().toISOString(),
          stage,
          data
        });
      } catch (_) { /* noop */ }
    }, []);

    const safeCameraError = (err) => {
      if (!err) return null;
      return {
        name: err.name || null,
        message: err.message || String(err),
        constraint: err.constraint || null,
        code: err.code || null
      };
    };

    const buildCameraDebugReport = useCallback((finalStage, extra = {}) => {
      const video = videoRef.current;
      const stream = streamRef.current;
      const tracks = (() => {
        try {
          return (stream?.getTracks?.() || []).map((track) => ({
            kind: track.kind,
            label: track.label || '',
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: typeof track.getSettings === 'function' ? track.getSettings() : null,
            constraints: typeof track.getConstraints === 'function' ? track.getConstraints() : null
          }));
        } catch (e) {
          return [{ error: safeCameraError(e) }];
        }
      })();
      const report = {
        label: 'HEYS BARCODE CAMERA DEBUG',
        finalStage,
        capturedAt: new Date().toISOString(),
        page: {
          href: location.href,
          protocol: location.protocol,
          host: location.host,
          isSecureContext: window.isSecureContext,
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus?.() ?? null
        },
        browser: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          vendor: navigator.vendor,
          language: navigator.language,
          maxTouchPoints: navigator.maxTouchPoints,
          standalone: navigator.standalone === true,
          displayModeStandalone: !!window.matchMedia?.('(display-mode: standalone)').matches,
          iosDetected: isIOSCameraBrowser()
        },
        capabilities: {
          mediaDevices: !!navigator.mediaDevices,
          getUserMedia: !!navigator.mediaDevices?.getUserMedia,
          enumerateDevices: !!navigator.mediaDevices?.enumerateDevices,
          permissionsApi: !!navigator.permissions?.query,
          barcodeDetector: 'BarcodeDetector' in window,
          barcodePolyfillLoaded: !!(window.barcodeDetectorPolyfill || HEYS.barcode?.getDebugState?.()?.hasGlobalPolyfill),
          barcodeDebug: HEYS.barcode?.getDebugState?.() || null,
          heysBarcodeReady: !!HEYS.barcode,
          heysBarcodeSupported: !!HEYS.barcode?.isSupported?.(),
          supportedConstraints: navigator.mediaDevices?.getSupportedConstraints?.() || null
        },
        state: {
          cameraState: cameraStateRef.current,
          error: errorRef.current,
          manualValueLength: String(manualValueRef.current || '').length,
          autoStartFlag: readStoredValue(BARCODE_CAMERA_AUTOSTART_KEY, null),
          globalAutoStart: HEYS.__barcodeCameraAutoStart === true,
          hasPrestartedCamera: !!cameraStartRef.current?.streamPromise,
          prestartedCameraReused: cameraStartRef.current?.reused === true,
          sessionCameraLive: isBarcodeCameraStreamLive(HEYS.__barcodeCameraSession?.stream)
        },
        video: video ? {
          readyState: video.readyState,
          paused: video.paused,
          ended: video.ended,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          muted: video.muted,
          playsInline: video.playsInline,
          hasSrcObject: !!video.srcObject
        } : null,
        stream: {
          active: !!stream?.active,
          tracks
        },
        events: cameraDebugRef.current.slice(-80),
        extra
      };
      return JSON.stringify(report, null, 2);
    }, []);

    const copyCameraDebugReport = useCallback(async (finalStage, extra = {}) => {
      const text = buildCameraDebugReport(finalStage, extra);
      setDebugReportText(text);
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          setDebugCopyState('Диагностика камеры скопирована');
          return true;
        }
      } catch (e) {
        appendCameraDebug('clipboard.writeText.failed', { error: safeCameraError(e) });
      }
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
        setDebugCopyState('Диагностика готова ниже. Зажмите поле и скопируйте вручную.');
        return false;
      }
      try {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'fixed';
        temp.style.left = '-9999px';
        temp.style.top = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(temp);
        setDebugCopyState(ok ? 'Диагностика камеры скопирована' : 'Диагностика готова ниже. Зажмите поле и скопируйте вручную.');
        return ok;
      } catch (e) {
        appendCameraDebug('clipboard.fallback.failed', { error: safeCameraError(e) });
        setDebugCopyState('Диагностика готова ниже. Зажмите поле и скопируйте вручную.');
        return false;
      }
    }, [appendCameraDebug, buildCameraDebugReport]);

    const shouldAutoStartCamera = useCallback(() => {
      if (autoStart === true) return true;
      if (HEYS.__barcodeCameraAutoStart === true) return true;
      return readStoredValue(BARCODE_CAMERA_AUTOSTART_KEY, false) === true;
    }, [autoStart]);

    const cleanupCamera = useCallback(() => {
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
      if (debugRefreshTimerRef.current) {
        clearTimeout(debugRefreshTimerRef.current);
        debugRefreshTimerRef.current = null;
      }
      try { scannerRef.current?.stop?.(); } catch (_) { }
      scannerRef.current = null;
      scheduleBarcodeCameraRelease(streamRef.current);
      streamRef.current = null;
      try {
        if (videoRef.current) videoRef.current.srcObject = null;
      } catch (_) { }
    }, []);

    const waitForVideo = useCallback((video) => new Promise((resolve) => {
      if (!video) return resolve(false);
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve(true);
      const done = () => {
        cleanup();
        resolve(true);
      };
      const timeout = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('playing', done);
        if (readyTimerRef.current) {
          clearTimeout(readyTimerRef.current);
          readyTimerRef.current = null;
        }
      };
      video.addEventListener('loadedmetadata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('playing', done, { once: true });
      readyTimerRef.current = setTimeout(timeout, 2500);
    }), []);

    const startCamera = useCallback(async (prestartedStreamPromise = null) => {
      if (startRequestRef.current) return;
      startRequestRef.current = true;
      cameraDebugRef.current = [];
      setDebugCopyState('Собираю диагностику камеры...');
      appendCameraDebug('start.tap', {
        cameraState: cameraStateRef.current,
        isSecureContext: window.isSecureContext,
        href: location.href,
        iosDetected: isIOSCameraBrowser()
      });
      setError('');
      cleanupCamera();
      appendCameraDebug('cleanup.done');

      if (!navigator.mediaDevices?.getUserMedia) {
        appendCameraDebug('mediaDevices.getUserMedia.missing');
        setError('Камера для сканирования недоступна. Можно ввести код вручную.');
        setCameraState('manual');
        await copyCameraDebugReport('getUserMedia-missing');
        startRequestRef.current = false;
        return;
      }

      try {
        setCameraState('requesting');
        appendCameraDebug('state.requesting');
        try {
          if (navigator.permissions?.query) {
            const permission = await navigator.permissions.query({ name: 'camera' });
            appendCameraDebug('permissions.camera', {
              state: permission?.state || null
            });
          } else {
            appendCameraDebug('permissions.camera.unavailable');
          }
        } catch (permissionError) {
          appendCameraDebug('permissions.camera.failed', { error: safeCameraError(permissionError) });
        }
        try {
          if (navigator.mediaDevices?.enumerateDevices) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            appendCameraDebug('devices.before', {
              count: devices.length,
              devices: devices.map((device) => ({
                kind: device.kind,
                label: device.label || '',
                deviceId: device.deviceId ? 'present' : '',
                groupId: device.groupId ? 'present' : ''
              }))
            });
          }
        } catch (devicesError) {
          appendCameraDebug('devices.before.failed', { error: safeCameraError(devicesError) });
        }
        let stream;
        if (prestartedStreamPromise) {
          appendCameraDebug('getUserMedia.prestarted.await', {
            requestedAt: cameraStartRef.current?.requestedAt || null,
            events: Array.isArray(cameraStartRef.current?.events) ? cameraStartRef.current.events : []
          });
          stream = await prestartedStreamPromise;
          appendCameraDebug('getUserMedia.prestarted.success');
        } else {
          stream = await requestBarcodeCameraStream((stage, data) => {
            appendCameraDebug(stage, data);
          });
        }
        stream = retainBarcodeCameraStream(stream);
        streamRef.current = stream;
        appendCameraDebug('stream.attached', {
          active: !!stream?.active,
          tracks: (stream?.getTracks?.() || []).map((track) => ({
            kind: track.kind,
            label: track.label || '',
            readyState: track.readyState,
            settings: typeof track.getSettings === 'function' ? track.getSettings() : null
          }))
        });
        HEYS.__barcodeCameraAutoStart = true;
        writeRawValue(BARCODE_CAMERA_AUTOSTART_KEY, true);

        const video = videoRef.current;
        if (!video) {
          appendCameraDebug('video.missing');
          await copyCameraDebugReport('video-missing');
          return;
        }
        video.srcObject = stream;
        setCameraState('starting');
        appendCameraDebug('video.srcObject.assigned');
        try {
          await video.play();
          appendCameraDebug('video.play.success');
        } catch (playError) {
          appendCameraDebug('video.play.failed', { error: safeCameraError(playError) });
          // Some mobile browsers resolve playback only after metadata/canplay.
        }
        const videoReady = await waitForVideo(video);
        appendCameraDebug('video.ready.wait.done', {
          videoReady,
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          paused: video.paused
        });
        setCameraState(videoReady ? 'ready' : 'starting');

        if (!HEYS.barcode?.isSupported?.()) {
          appendCameraDebug('barcodeDetector.unsupported');
          setError('На этом браузере автосканер недоступен. Камера включена, код можно ввести вручную.');
          await copyCameraDebugReport('barcode-detector-unsupported');
          return;
        }

        appendCameraDebug('scanner.start.request', {
          barcodeDebug: HEYS.barcode?.getDebugState?.() || null
        });
        const scanner = await HEYS.barcode.startScanning(video, (result) => {
          const code = normalizeBarcode(result?.value);
          if (code) {
            cleanupCamera();
            onDetected?.(code);
          }
        });
        scannerRef.current = scanner;
        appendCameraDebug('scanner.start.result', {
          success: !!scanner?.success,
          error: scanner?.error || null,
          barcodeDebug: HEYS.barcode?.getDebugState?.() || null
        });
        if (!scanner?.success) {
          setError('Не удалось запустить сканер. Можно ввести код вручную.');
        }
        await copyCameraDebugReport(scanner?.success ? 'scanner-started' : 'scanner-failed', {
          scanner: {
            success: !!scanner?.success,
            error: scanner?.error || null
          }
        });
        if (scanner?.success) {
          if (debugRefreshTimerRef.current) clearTimeout(debugRefreshTimerRef.current);
          debugRefreshTimerRef.current = setTimeout(() => {
            const barcodeDebug = HEYS.barcode?.getDebugState?.() || null;
            appendCameraDebug('scanner.debug.refresh', { barcodeDebug });
            setDebugReportText(buildCameraDebugReport('scanner-running', {
              scanner: { success: true, error: null },
              barcodeDebug
            }));
            setDebugCopyState('Диагностика обновлена ниже. Зажмите поле и скопируйте вручную.');
          }, 2200);
        }
      } catch (e) {
        appendCameraDebug('start.failed', { error: safeCameraError(e) });
        console.warn('[HEYS.barcode] camera start failed', {
          name: e?.name,
          message: e?.message
        });
        cleanupCamera();
        setError(isIOSCameraBrowser() && window.isSecureContext === false
          ? 'Камера на iPhone работает только через защищённое соединение. Можно ввести код вручную.'
          : 'Камера недоступна. Можно ввести код вручную.');
        setCameraState('manual');
        await copyCameraDebugReport('camera-start-failed', { error: safeCameraError(e) });
      } finally {
        startRequestRef.current = false;
      }
    }, [appendCameraDebug, cleanupCamera, copyCameraDebugReport, onDetected, waitForVideo]);

    useEffect(() => {
      return cleanupCamera;
    }, [cleanupCamera]);

    useEffect(() => {
      try { document.activeElement?.blur?.(); } catch (_) { /* noop */ }
    }, []);

    useEffect(() => {
      if (autoStartAttemptedRef.current) return undefined;
      if (cameraStart?.streamPromise) {
        autoStartAttemptedRef.current = true;
        startCamera(cameraStart.streamPromise);
        return undefined;
      }
      if (!shouldAutoStartCamera()) return undefined;
      autoStartAttemptedRef.current = true;
      const timer = setTimeout(() => startCamera(), 80);
      return () => clearTimeout(timer);
    }, [cameraStart, shouldAutoStartCamera, startCamera]);

    const submitManual = () => {
      const code = normalizeBarcode(manualValue);
      if (!code) {
        setError('Введите штрихкод: минимум 6 символов.');
        return;
      }
      onDetected?.(code);
    };

    const cameraHint = cameraState === 'idle'
      ? 'Нажмите «Включить камеру»'
      : cameraState === 'requesting'
        ? 'Подтвердите доступ к камере'
        : cameraState === 'starting'
        ? 'Запускаем камеру...'
        : cameraState === 'manual'
          ? (fullscreen ? 'Нет доступа к камере — введите код вручную' : 'Введите код вручную')
          : 'Наведите камеру на штрихкод';
    const willAutoStart = !!cameraStart?.streamPromise || shouldAutoStartCamera();
    const showStartButton = cameraState === 'manual' || (cameraState === 'idle' && !willAutoStart);

    return React.createElement('div', {
      className: 'aps-barcode-overlay' + (fullscreen ? ' aps-barcode-overlay--v4-fullscreen' : ''),
      onClick: onClose
    },
      React.createElement('div', {
        className: 'aps-barcode-modal' + (fullscreen ? ' aps-barcode-modal--v4-fullscreen' : ''),
        onClick: (e) => e.stopPropagation()
      },
        React.createElement('div', { className: 'aps-barcode-head' },
          React.createElement('div', null,
            React.createElement('div', { className: 'aps-barcode-title' }, title || 'Штрихкод'),
            subtitle && React.createElement('div', { className: 'aps-barcode-subtitle' }, subtitle)
          ),
          React.createElement('button', {
            type: 'button',
            className: 'aps-barcode-close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '×')
        ),
        React.createElement('div', { className: 'aps-barcode-camera' },
          fullscreen && React.createElement('div', { className: 'aps-barcode-finder-frame', 'aria-hidden': 'true' },
            React.createElement('span', { className: 'aps-barcode-finder-corner aps-barcode-finder-corner--tl' }),
            React.createElement('span', { className: 'aps-barcode-finder-corner aps-barcode-finder-corner--tr' }),
            React.createElement('span', { className: 'aps-barcode-finder-corner aps-barcode-finder-corner--bl' }),
            React.createElement('span', { className: 'aps-barcode-finder-corner aps-barcode-finder-corner--br' })
          ),
          React.createElement('video', {
            ref: videoRef,
            className: 'aps-barcode-video',
            autoPlay: true,
            muted: true,
            playsInline: true,
            'webkit-playsinline': 'true',
            onLoadedMetadata: () => setCameraState((state) => state === 'manual' ? state : 'ready'),
            onCanPlay: () => setCameraState((state) => state === 'manual' ? state : 'ready'),
            onPlaying: () => setCameraState((state) => state === 'manual' ? state : 'ready')
          }),
          React.createElement('div', {
            className: 'aps-barcode-camera-empty' + (cameraState === 'ready' ? ' is-ready' : '')
          },
            React.createElement('span', null, cameraHint),
            showStartButton && React.createElement('button', {
              type: 'button',
              className: 'aps-barcode-start',
              onClick: startCamera
            }, cameraState === 'manual' ? 'Повторить доступ' : 'Включить камеру')
          )
        ),
        React.createElement('div', { className: 'aps-barcode-manual' },
          React.createElement('input', {
            className: 'aps-barcode-input',
            value: manualValue,
            onChange: (e) => setManualValue(e.target.value),
            inputMode: 'text',
            autoComplete: 'off',
            placeholder: 'EAN / UPC'
          }),
          React.createElement('button', {
            type: 'button',
            className: 'aps-barcode-submit',
            onClick: submitManual
          }, 'OK')
        ),
        React.createElement('button', {
          type: 'button',
          className: 'aps-barcode-debug-dot',
          onClick: () => copyCameraDebugReport('manual-copy', { source: 'debug-dot' }),
          'aria-label': 'Скопировать диагностику камеры',
          title: 'Скопировать диагностику камеры'
        }),
        error && React.createElement('div', { className: 'aps-barcode-error' }, error)
      )
    );
  }

  function ProductBarcodeManagerModal({ product, onAdd, onRemove, onRemoveAll, onClose }) {
    const barcodes = getProductBarcodes(product);
    const productName = product?.name || 'Продукт';

    return React.createElement('div', { className: 'aps-barcode-overlay', onClick: onClose },
      React.createElement('div', {
        className: 'aps-barcode-modal aps-barcode-manager-modal',
        onClick: (e) => e.stopPropagation()
      },
        React.createElement('div', { className: 'aps-barcode-head' },
          React.createElement('div', null,
            React.createElement('div', { className: 'aps-barcode-title' }, 'Штрихкоды продукта'),
            React.createElement('div', { className: 'aps-barcode-subtitle' }, productName)
          ),
          React.createElement('button', {
            type: 'button',
            className: 'aps-barcode-close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '×')
        ),
        React.createElement('div', { className: 'aps-barcode-manager-list' },
          barcodes.length > 0
            ? barcodes.map((code) => React.createElement('div', {
              key: code,
              className: 'aps-barcode-manager-row'
            },
              React.createElement('span', { className: 'aps-barcode-manager-code' }, code),
              React.createElement('button', {
                type: 'button',
                className: 'aps-barcode-manager-remove',
                onClick: () => onRemove?.(code)
              }, 'Удалить')
            ))
            : React.createElement('div', { className: 'aps-barcode-manager-empty' }, 'Штрихкоды пока не добавлены')
        ),
        React.createElement('div', { className: 'aps-barcode-manager-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'aps-barcode-manager-add',
            onClick: onAdd
          }, 'Добавить'),
          barcodes.length > 0 && React.createElement('button', {
            type: 'button',
            className: 'aps-barcode-manager-remove-all',
            onClick: onRemoveAll
          }, 'Удалить все')
        )
      )
    );
  }

  function useMealPhotoAttachment(context) {
    const fileInputRef = useRef(null);
    const [showPhotoConfirm, setShowPhotoConfirm] = useState(false);
    const [pendingPhotoData, setPendingPhotoData] = useState(null);
    const currentPhotoCount = context?.mealPhotos?.length || 0;
    const photoLimit = 10;
    const canAddPhoto = currentPhotoCount < photoLimit;

    const handlePhotoSelect = useCallback((e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      haptic('medium');
      const MAX_SIZE = 800;
      const QUALITY = 0.7;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round(height * MAX_SIZE / width);
            width = MAX_SIZE;
          } else {
            width = Math.round(width * MAX_SIZE / height);
            height = MAX_SIZE;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedData = canvas.toDataURL('image/jpeg', QUALITY);
        setPendingPhotoData({
          compressedData,
          filename: file.name,
          originalSize: file.size
        });
        setShowPhotoConfirm(true);
      };
      img.onerror = () => {
        console.error('[AddProductStep] Failed to load image');
      };
      const reader = new FileReader();
      reader.onload = (event) => {
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }, []);

    const confirmPhoto = useCallback(() => {
      if (!pendingPhotoData || !context?.onAddPhoto) {
        setShowPhotoConfirm(false);
        return;
      }
      haptic('success');
      context.onAddPhoto({
        mealIndex: context.mealIndex,
        mealId: context.mealId,
        photo: pendingPhotoData.compressedData,
        filename: pendingPhotoData.filename,
        timestamp: Date.now()
      });
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
    }, [pendingPhotoData, context]);

    const cancelPhoto = useCallback(() => {
      haptic('light');
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
    }, []);

    const handlePhotoClick = useCallback(() => {
      haptic('medium');
      fileInputRef.current?.click();
    }, []);

    const renderPhotoConfirmModal = () => {
      if (!showPhotoConfirm || !pendingPhotoData) return null;
      return React.createElement('div', {
        className: 'photo-confirm-overlay',
        onClick: cancelPhoto
      },
        React.createElement('div', {
          className: 'photo-confirm-modal',
          onClick: (ev) => ev.stopPropagation()
        },
          React.createElement('div', { className: 'photo-confirm-header' }, 'Сохранить это фото?'),
          React.createElement('div', { className: 'photo-confirm-preview' },
            React.createElement('img', {
              src: pendingPhotoData.compressedData,
              alt: 'Превью фото'
            })
          ),
          React.createElement('div', { className: 'photo-confirm-info' },
            Math.round(pendingPhotoData.compressedData.length / 1024) + ' КБ'
          ),
          React.createElement('div', { className: 'photo-confirm-buttons' },
            React.createElement('button', {
              className: 'photo-confirm-btn cancel',
              onClick: cancelPhoto
            }, 'Отмена'),
            React.createElement('button', {
              className: 'photo-confirm-btn confirm',
              onClick: confirmPhoto
            }, 'Сохранить')
          )
        )
      );
    };

    return {
      fileInputRef,
      handlePhotoSelect,
      handlePhotoClick,
      currentPhotoCount,
      photoLimit,
      canAddPhoto,
      renderPhotoConfirmModal
    };
  }

  function ProductSearchStep({ data, onChange, context }) {
    const initialProductsSyncState = getAddProductInitialSyncState();
    const [searchInput, setSearchInput] = useState(data?.searchQuery || '');
    const [search, setSearch] = useState(data?.searchQuery || '');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [quickList, setQuickList] = useState('frequent');

    // Контракт pwa-update, «обновление во время записи»: шаг добавления еды
    // держит набранное прямо на экране, без открытой модалки, — счётчик
    // модалок его не видит. Признак снимается при уходе с шага.
    useEffect(() => window.HEYS?.PlatformAPIs?.holdUpdateForFormDraft?.('add-product-step'), []);

    // v25.8.6.7: Sync searchQuery from StepModal's getInitialData
    // useState initializer runs only once at mount, but stepData is set via useEffect
    // (after first render), so data?.searchQuery may be empty on mount.
    // This effect picks up the initial search query once StepModal provides it.
    const initialSearchAppliedRef = useRef(false);
    useEffect(() => {
      if (!initialSearchAppliedRef.current && data?.searchQuery && !searchInput) {
        setSearchInput(data.searchQuery);
        setSearch(data.searchQuery);
        initialSearchAppliedRef.current = true;
        console.info('[HEYS.addProduct] 🔍 Pre-filled search from initialSearch:', data.searchQuery);
      }
    }, [data?.searchQuery]);
    const [favorites, setFavorites] = useState(() =>
      HEYS.store?.getFavorites?.() || new Set()
    );
    const [hiddenProducts, setHiddenProducts] = useState(() =>
      HEYS.store?.getHiddenProducts?.() || new Set()
    );
    const [presetsOpen, setPresetsOpen] = useState(() => !!context?._openPresetsCreate); // 🍽️ Готовые наборы overlay
    const [suggestedPresetsCount, setSuggestedPresetsCount] = useState(
      () => (HEYS.store?.getSuggestedPresets?.() || []).length
    );
    const [pendingDeletedProductIds, setPendingDeletedProductIds] = useState(() => new Set());
    const [barcodeModal, setBarcodeModal] = useState(null);
    const [barcodeManager, setBarcodeManager] = useState(null);
    const [barcodeLookupBusy, setBarcodeLookupBusy] = useState(false);
    const [barcodeResults, setBarcodeResults] = useState([]);
    const [barcodeNotice, setBarcodeNotice] = useState(null);
    const [barcodeNotFoundCode, setBarcodeNotFoundCode] = useState(null);
    const [exitPromptOpen, setExitPromptOpen] = useState(false);
    const startWithBarcodeScannerRef = useRef(false);

    const inputRef = useRef(null);

    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData, stepData: modalStepData } = stepContext;

    const closeFlow = useCallback(() => {
      context?.onClose?.();
    }, [context]);

    const requestCloseModal = useCallback(() => {
      if (hasApsDraftToLose(modalStepData, data, context)) {
        setExitPromptOpen(true);
        return;
      }
      closeFlow();
    }, [closeFlow, modalStepData, data, context]);

    const confirmExitModal = useCallback(() => {
      setExitPromptOpen(false);
      closeFlow();
    }, [closeFlow]);

    const { dateKey = '', day: contextDay } = context || {};
    const usageWindowDays = 21;

    const openSearchBarcodeScanner = useCallback((cameraStart = null) => {
      setBarcodeNotice(null);
      setBarcodeModal({ mode: 'search', autoStart: true, cameraStart });
    }, []);

    // 🔧 FIX: Реактивное состояние для продуктов с подпиской на синхронизацию
    // Это решает проблему: при открытии модалки сразу после создания приёма
    // продукты ещё не загружены из облака, но после heysSyncCompleted они появятся
    const [productsVersion, setProductsVersion] = useState(globalProductsVersion);
    const productsWatchSignatureRef = useRef(null);
    const [isWaitingForProductsSettle, setIsWaitingForProductsSettle] = useState(
      () => initialProductsSyncState.syncInFlight && !initialProductsSyncState.syncSettled
    );

    // Preset suggestions depend on meal history, not product catalog versions.
    // Run once per modal mount; module-level cooldown covers repeat-add remounts.
    useEffect(() => {
      const timer = setTimeout(() => {
        try {
          runPresetSuggestions();
          const count = (HEYS.store?.getSuggestedPresets?.() || []).length;
          setSuggestedPresetsCount(count);
        } catch (e) {
          console.error('[AddProductStep] runPresetSuggestionEngine error', e);
        }
      }, 50);
      return () => clearTimeout(timer);
    }, []);
    const [usageStatsVersion, setUsageStatsVersion] = useState(0);

    useEffect(() => {
      if (startWithBarcodeScannerRef.current || !context?.startWithBarcodeScanner) return;
      startWithBarcodeScannerRef.current = true;
      setTimeout(() => {
        openSearchBarcodeScanner(context?.barcodeCameraStart || null);
      }, 0);
    }, [context?.barcodeCameraStart, context?.startWithBarcodeScanner, openSearchBarcodeScanner]);

    // Фиксируем состояние sync на момент открытия: если sync уже завершён,
    // можно рендерить сразу; если нет — ждём финальную версию списка.
    const initialSyncDoneRef = useRef(initialProductsSyncState.syncSettled);

    useEffect(() => {
      if (!isWaitingForProductsSettle) {
        return;
      }

      const settleNow = (reason) => {
        console.info('[HEYS.addProduct] ✅ Products settled for modal', {
          reason,
          productsVersion
        });
        initialSyncDoneRef.current = true;
        setIsWaitingForProductsSettle(false);
      };

      const maybeSettle = (reason) => {
        const state = getAddProductInitialSyncState();
        if (state.syncSettled || !state.syncInFlight) {
          settleNow(reason);
          return true;
        }
        return false;
      };

      if (maybeSettle('already-settled')) {
        return undefined;
      }

      const fallbackTimer = setTimeout(() => {
        console.info('[HEYS.addProduct] ⏱️ Products settle fallback', {
          waitMs: APS_PRODUCTS_SETTLE_FALLBACK_MS,
          productsVersion
        });
        settleNow('fallback-timeout');
      }, APS_PRODUCTS_SETTLE_FALLBACK_MS);

      const handleSettledEvent = (event) => {
        const reason = event?.type || 'sync-event';
        requestAnimationFrame(() => {
          if (!maybeSettle(reason)) {
            settleNow(reason + ':forced');
          }
        });
      };

      window.addEventListener('heysSyncCompleted', handleSettledEvent);
      window.addEventListener('heys:products-updated', handleSettledEvent);
      window.addEventListener('heysProductsUpdated', handleSettledEvent);
      window.addEventListener('heys:products-version-changed', handleSettledEvent);

      return () => {
        clearTimeout(fallbackTimer);
        window.removeEventListener('heysSyncCompleted', handleSettledEvent);
        window.removeEventListener('heys:products-updated', handleSettledEvent);
        window.removeEventListener('heysProductsUpdated', handleSettledEvent);
        window.removeEventListener('heys:products-version-changed', handleSettledEvent);
      };
    }, [isWaitingForProductsSettle, productsVersion]);

    // Подписка на обновление продуктов (heysSyncCompleted или watch)
    useEffect(() => {
      const clearSearchCache = () => {
        try {
          HEYS?.SmartSearchWithTypos?.clearCache?.();
        } catch (e) {
          // no-op
        }
      };

      const refreshUsageFromHistory = () => {
        try {
          const lsGet = typeof HEYS.store?.get === 'function'
            ? HEYS.store.get.bind(HEYS.store)
            : undefined;
          if (HEYS?.SmartSearchWithTypos?.loadUserStats) {
            HEYS.SmartSearchWithTypos.loadUserStats();
          }
          if (HEYS?.SmartSearchWithTypos?.ensureUsageStatsFresh) {
            const refreshed = HEYS.SmartSearchWithTypos.ensureUsageStatsFresh({
              maxHours: 6,
              daysWindow: usageWindowDays,
              dateKey: dateKey || new Date().toISOString().slice(0, 10),
              lsGet
            });
            if (refreshed) setUsageStatsVersion(v => v + 1);
            else if ((HEYS.SmartSearchWithTypos.getUsageStats?.() || new Map()).size > 0) {
              setUsageStatsVersion(v => v + 1);
            }
          }
        } catch (e) {
          // no-op
        }
      };

      const handleSyncComplete = (e) => {
        // Если модалка открылась до завершения sync — первый heysSyncCompleted
        // как раз и приносит финальную версию списка, его нельзя пропускать.
        if (e?.type === 'heysSyncCompleted') {
          if (!initialSyncDoneRef.current) {
            initialSyncDoneRef.current = true;
            setIsWaitingForProductsSettle(false);
          }
        }
        // console.log('[AddProductStep] 🔄 heysSyncCompleted → refreshing products');
        setProductsVersion(v => v + 1);
        clearSearchCache();
        refreshUsageFromHistory();
      };

      // 🆕 FIX v2: слушаем глобальное событие версии продуктов
      // Глобальные listeners регистрируются 1 раз при загрузке модуля
      // и dispatch'ат heys:products-version-changed для React компонентов
      const handleVersionChanged = (e) => {
        console.log('[AddProductStep] 🔄 handleVersionChanged fired', {
          event: e?.type,
          detail: e?.detail,
          prevVersion: productsVersion
        });
        initialSyncDoneRef.current = true;
        setIsWaitingForProductsSettle(false);
        setProductsVersion(v => {
          const next = v + 1;
          console.log('[AddProductStep] ✅ productsVersion updating', { prev: v, next });
          return next;
        });
        clearSearchCache();
      };

      const handleSharedProductsUpdated = () => {
        invalidateSharedBarcodeNameIndex();
        initialSyncDoneRef.current = true;
        setProductsVersion(v => v + 1);
        clearSearchCache();
      };

      window.addEventListener('heysSyncCompleted', handleSyncComplete);
      window.addEventListener('heys:products-version-changed', handleVersionChanged);
      window.addEventListener('heys:shared-products-updated', handleSharedProductsUpdated);

      // Также подписываемся через HEYS.products.watch если доступен
      let unwatchProducts = () => { };
      // Overlay v2 is canonical; HEYS.products.watch observes the legacy
      // heys_products mirror and can fire on mirror-only rewrites. Canonical
      // overlay changes already arrive through products-version/shared events.
      if (!isOverlayProductsEnabledForAddStep() && HEYS.products?.watch) {
        unwatchProducts = HEYS.products.watch((nextProducts) => {
          const nextSignature = getProductsWatchSignature(nextProducts);
          if (productsWatchSignatureRef.current === nextSignature) return;
          productsWatchSignatureRef.current = nextSignature;
          // console.log('[AddProductStep] 🔄 products.watch → refreshing products');
          initialSyncDoneRef.current = true;
          setIsWaitingForProductsSettle(false);
          setProductsVersion(v => v + 1);
          clearSearchCache();
        });
      }

      return () => {
        window.removeEventListener('heysSyncCompleted', handleSyncComplete);
        window.removeEventListener('heys:products-version-changed', handleVersionChanged);
        window.removeEventListener('heys:shared-products-updated', handleSharedProductsUpdated);
        unwatchProducts();
      };
    }, [dateKey, usageWindowDays]);

    useEffect(() => {
      if (!isOverlayProductsEnabledForAddStep() || !HEYS.cloud?.getAllSharedProducts) return undefined;
      let cancelled = false;
      const timer = setTimeout(() => {
        HEYS.cloud.getAllSharedProducts({ limit: 1000, excludeBlocklist: true })
          .then(() => {
            if (!cancelled) {
              invalidateSharedBarcodeNameIndex();
              setProductsVersion(v => v + 1);
            }
          })
          .catch((err) => {
            console.warn('[AddProductStep] shared products refresh failed', err);
          });
      }, 0);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, []);

    // Всегда берём актуальные продукты из глобального стора (если появились новые)
    // productsVersion в зависимостях заставляет пересчитать при синхронизации
    const latestProducts = useMemo(() => {
      // [verbose log removed — was firing hundreds of times per session, drowning trace channel]
      const base = Array.isArray(context?.products) ? context.products : [];
      const scopedProducts = readCurrentClientProductsForAddStep();
      const shouldTrustScopedProducts = Array.isArray(scopedProducts);

      // Пробуем получить из HEYS.products.getAll()
      let storeProducts = shouldTrustScopedProducts ? scopedProducts : [];
      if (!shouldTrustScopedProducts && HEYS.products?.getAll) {
        storeProducts = HEYS.products.getAll() || [];
      }

      // Fallback: напрямую из HEYS.store
      if (!shouldTrustScopedProducts && storeProducts.length === 0 && HEYS.store?.get) {
        storeProducts = HEYS.store.get('heys_products', []) || [];
      }

      // Fallback: из localStorage через U()
      if (!shouldTrustScopedProducts && storeProducts.length === 0) {
        const utils = U();
        if (utils.lsGet) {
          storeProducts = utils.lsGet('heys_products', []) || [];
        }
      }

      // Fallback: напрямую из localStorage
      if (!shouldTrustScopedProducts && storeProducts.length === 0) {
        const rawProducts = readStoredValue('heys_products', null);
        if (Array.isArray(rawProducts)) storeProducts = rawProducts;
      }

      storeProducts = Array.isArray(storeProducts) ? storeProducts : [];
      // Если store длиннее — используем его как основу
      const primary = shouldTrustScopedProducts || storeProducts.length >= base.length ? storeProducts : base;
      const secondary = primary === storeProducts ? (shouldTrustScopedProducts ? [] : base) : storeProducts;
      // Объединяем, убирая дубликаты по id/name
      const seen = new Set();
      const merged = [];
      const pushUnique = (p) => {
        if (!p) return;
        const pid = String(p.id ?? p.product_id ?? p.name);
        if (seen.has(pid)) return;
        seen.add(pid);
        merged.push(p);
      };
      primary.forEach(pushUnique);
      secondary.forEach(pushUnique);

      const filtered = pendingDeletedProductIds.size
        ? merged.filter((p) => !pendingDeletedProductIds.has(String(p?.id ?? p?.product_id ?? p?.name)))
        : merged;

      // [verbose log removed — useMemo DONE drowns the trace channel]
      return filtered.map(mergeSharedBarcodeIntoProductForAddStep);
    }, [context?.products, pendingDeletedProductIds, productsVersion]);

    // 🌐 Результаты из общей базы (асинхронный поиск)
    const [sharedResults, setSharedResults] = useState([]);
    const [sharedLoading, setSharedLoading] = useState(false);
    const [sharedCatalogPreview, setSharedCatalogPreview] = useState([]);
    const [sharedCatalogLoading, setSharedCatalogLoading] = useState(false);

    useEffect(() => {
      const handleSharedUpdated = (event) => {
        invalidateSharedBarcodeNameIndex();
        const detail = event?.detail || {};
        const updatedId = detail.productId ?? detail.product?.id;
        if (updatedId == null) return;
        setSharedResults((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((p) => {
            if (String(p?.id) !== String(updatedId)) return p;
            changed = true;
            return {
              ...p,
              ...(detail.product || {}),
              id: p.id,
              portions: Array.isArray(detail.portions) ? detail.portions : (detail.product?.portions || p.portions)
            };
          });
          return changed ? next : prev;
        });
      };

      window.addEventListener('heys:shared-product-updated', handleSharedUpdated);
      return () => window.removeEventListener('heys:shared-product-updated', handleSharedUpdated);
    }, []);

    useEffect(() => {
      if (quickList !== 'shared') {
        setSharedCatalogPreview([]);
        setSharedCatalogLoading(false);
        return undefined;
      }

      let cancelled = false;
      const readCachedPreview = () => {
        const cached = HEYS.cloud?.getCachedSharedProducts?.();
        return Array.isArray(cached)
          ? cached.map(normalizeSharedProductForAddStep).filter(Boolean).slice(0, 24)
          : [];
      };
      const applyCachedPreview = () => {
        const preview = readCachedPreview();
        if (preview.length && !cancelled) setSharedCatalogPreview(preview);
        return preview.length > 0;
      };

      const loadPreview = async () => {
        const hasCached = applyCachedPreview();
        if (hasCached) return;
        if (!HEYS.cloud?.getAllSharedProducts) return;

        setSharedCatalogLoading(true);
        try {
          const result = await HEYS.cloud.getAllSharedProducts({ limit: 60 });
          const list = Array.isArray(result) ? result : (result?.data || result?.products || []);
          if (!cancelled) {
            setSharedCatalogPreview(
              (Array.isArray(list) ? list : [])
                .map(normalizeSharedProductForAddStep)
                .filter(Boolean)
                .slice(0, 24)
            );
          }
        } catch (err) {
          console.error('[AddProductStep] Shared catalog preview error:', err);
        } finally {
          if (!cancelled) setSharedCatalogLoading(false);
        }
      };

      const handleSharedProductsUpdated = () => applyCachedPreview();
      window.addEventListener('heys:shared-products-updated', handleSharedProductsUpdated);
      loadPreview();

      return () => {
        cancelled = true;
        window.removeEventListener('heys:shared-products-updated', handleSharedProductsUpdated);
      };
    }, [quickList]);

    useApsCloseGuard(context?.apsCloseGuardRef, requestCloseModal);
    useEscapeToClose(requestCloseModal, true);

    // Debug: проверяем что products пришли
    // useEffect(() => {
    //   console.log('[AddProductStep] products count:', latestProducts?.length);
    // }, [latestProducts]);

    // Фокус на input при монтировании
    useEffect(() => {
      setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    useEffect(() => {
      try {
        const lsGet = typeof HEYS.store?.get === 'function'
          ? HEYS.store.get.bind(HEYS.store)
          : undefined;
        if (HEYS?.SmartSearchWithTypos?.loadUserStats) {
          HEYS.SmartSearchWithTypos.loadUserStats();
        }
        if (HEYS?.SmartSearchWithTypos?.ensureUsageStatsFresh) {
          HEYS.SmartSearchWithTypos.ensureUsageStatsFresh({
            maxHours: 6,
            daysWindow: usageWindowDays,
            dateKey: dateKey || new Date().toISOString().slice(0, 10),
            lsGet
          });
        }
        setUsageStatsVersion(v => v + 1);
      } catch (e) {
        console.error('[HEYS.search] ensureUsageStatsFresh error:', e);
      }
    }, [dateKey, usageWindowDays]);

    // Debounce локального поиска
    useEffect(() => {
      const timer = setTimeout(() => {
        setSearch(searchInput);
      }, 200);

      return () => clearTimeout(timer);
    }, [searchInput]);

    const normalizeSearch = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
      || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));
    const lc = normalizeSearch(search.trim());
    const showSearch = lc.length > 0;
    const effectiveSharedEnabled = quickList === 'shared' || showSearch;

    // 🌐 Асинхронный поиск по общей базе (debounced)
    useEffect(() => {
      const trimmed = search.trim();
      if (!effectiveSharedEnabled || trimmed.length < 2) {
        setSharedResults([]);
        setSharedLoading(false);
        return;
      }

      const timeoutId = setTimeout(async () => {
        setSharedLoading(true);
        console.log('[SharedSearch] Searching for:', trimmed);
        try {
          const result = await HEYS?.cloud?.searchSharedProducts?.(trimmed, { limit: 30 });
          console.log('[SharedSearch] Result:', result?.data?.length, 'products');
          if (result?.data) {
            // Преобразуем данные для совместимости с UI
            const normalized = result.data.map(normalizeSharedProductForAddStep).filter(Boolean);
            console.log('[SharedSearch] Normalized first:', normalized[0]?.name, 'kcal100:', normalized[0]?.kcal100);
            setSharedResults(normalized);
          }
        } catch (err) {
          console.error('[AddProductStep] Shared search error:', err);
        } finally {
          setSharedLoading(false);
        }
      }, 300);

      return () => clearTimeout(timeoutId);
    }, [search, effectiveSharedEnabled]);

    // Умный список: частота + свежесть (объединяет "часто" и "последние")
    const usageStats = useMemo(() =>
      HEYS?.SmartSearchWithTypos?.getUsageStats?.() || new Map(),
      [productsVersion, usageStatsVersion]
    );

    const sessionUsageStats = useMemo(() => {
      const map = new Map();
      const dayData = contextDay || null;
      const meals = dayData?.meals || [];
      if (!Array.isArray(meals) || meals.length === 0) return map;

      const dateStr = dayData?.date || dateKey || new Date().toISOString().slice(0, 10);
      const dayTs = Date.parse(dateStr + 'T12:00:00') || Date.now();

      const bump = (key) => {
        if (!key) return;
        const curr = map.get(key);
        if (curr) {
          curr.count += 1;
          curr.lastUsed = Math.max(curr.lastUsed || 0, dayTs);
        } else {
          map.set(key, { count: 1, lastUsed: dayTs });
        }
      };

      meals.forEach((meal) => {
        (meal?.items || []).forEach((item) => {
          if (item?.isEstimated || item?.virtualProduct || item?.skipOrphanTracking) return;
          const pid = String(item?.product_id ?? item?.productId ?? '').trim();
          if (pid.indexOf('estimated_') === 0 || pid.indexOf('oneoff_') === 0) return;
          const name = String(item?.name || '').trim();
          if (pid) bump(pid);
          if (name) {
            bump(normalizeName(name));
            bump(name);
          }
        });
      });

      return map;
    }, [contextDay, dateKey]);

    const effectiveUsageStats = useMemo(() => {
      const base = usageStats instanceof Map ? usageStats : new Map();
      const session = sessionUsageStats instanceof Map ? sessionUsageStats : new Map();
      if (base.size === 0 && session.size === 0) return base;

      const merged = new Map(base);
      if (session.size === 0) return merged;

      const dateStr = dateKey || new Date().toISOString().slice(0, 10);
      const dayStart = Date.parse(dateStr + 'T00:00:00') || 0;

      session.forEach((s, key) => {
        if (!key) return;
        const curr = merged.get(key);
        if (!curr) {
          merged.set(key, { ...s });
          return;
        }
        const currLast = Number(curr.lastUsed || 0) || 0;
        const sessLast = Number(s.lastUsed || 0) || 0;
        const currHasToday = currLast >= dayStart;
        if (!currHasToday) {
          merged.set(key, {
            count: (Number(curr.count) || 0) + (Number(s.count) || 0),
            lastUsed: Math.max(currLast, sessLast)
          });
        }
      });

      return merged;
    }, [usageStats, sessionUsageStats, dateKey]);

    useEffect(() => {
      try {
        HEYS._usageStatsDebug = {
          ...(HEYS._usageStatsDebug || {}),
          modal: {
            size: effectiveUsageStats.size,
            source: usageStats.size > 0 ? 'stored' : (sessionUsageStats.size > 0 ? 'session' : 'empty'),
            products: latestProducts.length,
            dateKey: dateKey || new Date().toISOString().slice(0, 10)
          }
        };
      } catch (e) { }

      if (HEYS?.DEBUG_MODE) {
        const payload = HEYS._usageStatsDebug?.modal || {
          size: effectiveUsageStats.size,
          source: usageStats.size > 0 ? 'stored' : (sessionUsageStats.size > 0 ? 'session' : 'empty'),
          products: latestProducts.length,
          dateKey: dateKey || new Date().toISOString().slice(0, 10)
        };
        console.log('🔎 [UsageStats] snapshot', payload);
        if (window.DEV?.log) {
          window.DEV.log('🔎 [UsageStats] snapshot', payload);
        }
      }
    }, [effectiveUsageStats, usageStats.size, sessionUsageStats.size, latestProducts.length, dateKey]);

    const getUsageCount = useCallback((productId, productName) => {
      if (!productId && !productName) return 0;

      const nameRaw = String(productName || '').trim();
      const nameNorm = normalizeName(nameRaw);
      const nameSearchNorm = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        ? HEYS.SmartSearchWithTypos.utils.normalizeText(nameRaw)
        : nameNorm;

      const directStats = effectiveUsageStats.get(productId)
        || effectiveUsageStats.get(nameNorm)
        || effectiveUsageStats.get(nameSearchNorm)
        || effectiveUsageStats.get(nameRaw);

      const resolveCount = (stats) => {
        if (!stats || !stats.lastUsed) return 0;
        const daysAgo = Math.floor((Date.now() - stats.lastUsed) / (1000 * 60 * 60 * 24));
        if (daysAgo > usageWindowDays) return 0;
        return Number(stats.count) || 0;
      };

      const directCount = resolveCount(directStats);

      return directCount;
    }, [effectiveUsageStats, usageWindowDays]);

    const smartProducts = useMemo(() =>
      computeSmartProducts(latestProducts, dateKey, {
        favorites,
        hidden: hiddenProducts,
        daysWindow: usageWindowDays,
        usageStats: effectiveUsageStats
      }),
      [latestProducts, dateKey, favorites, hiddenProducts, effectiveUsageStats, usageWindowDays]
    );

    const recentProducts = useMemo(() =>
      computeRecentProducts(latestProducts, {
        hidden: hiddenProducts,
        usageStats: effectiveUsageStats
      }),
      [latestProducts, hiddenProducts, effectiveUsageStats]
    );

    // Fallback для модалки: если нет частот/избранных, показываем рабочий список, а не пустой экран.
    const modalFallbackProducts = useMemo(() => {
      const hidden = hiddenProducts instanceof Set
        ? hiddenProducts
        : new Set(Array.isArray(hiddenProducts) ? hiddenProducts : []);
      const list = Array.isArray(latestProducts) ? latestProducts : [];
      const visible = list.filter((p) => {
        const pid = String(p?.id || p?.product_id || p?.name || '');
        return !!pid && !hidden.has(pid);
      });
      // Приоритет: избранные сверху, затем по свежести изменения/создания.
      const fav = favorites instanceof Set
        ? favorites
        : new Set(Array.isArray(favorites) ? favorites : []);
      const sorted = [...visible].sort((a, b) => {
        const aId = String(a?.id || a?.product_id || a?.name || '');
        const bId = String(b?.id || b?.product_id || b?.name || '');
        const aFav = fav.has(aId);
        const bFav = fav.has(bId);
        if (aFav !== bFav) return aFav ? -1 : 1;
        const aTs = Number(a?.updatedAt || a?.createdAt || 0);
        const bTs = Number(b?.updatedAt || b?.createdAt || 0);
        if (aTs !== bTs) return bTs - aTs;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'ru');
      });
      return dedupeProductsForPicker(sorted).slice(0, 24);
    }, [latestProducts, hiddenProducts, favorites]);

    useEffect(() => {
      try {
        const now = Date.now();
        if (!HEYS.__addProductPipeLogAt || now - HEYS.__addProductPipeLogAt > 4000) {
          HEYS.__addProductPipeLogAt = now;
          console.info('[HEYS.modal:PIPE]', {
            latestProducts: Array.isArray(latestProducts) ? latestProducts.length : -1,
            smartProducts: Array.isArray(smartProducts) ? smartProducts.length : -1,
            fallbackProducts: Array.isArray(modalFallbackProducts) ? modalFallbackProducts.length : -1,
            favorites: favorites instanceof Set ? favorites.size : 0,
            usageStats: effectiveUsageStats instanceof Map ? effectiveUsageStats.size : 0,
            hidden: hiddenProducts instanceof Set ? hiddenProducts.size : 0,
          });
        }
      } catch (_) { /* noop */ }
    }, [latestProducts, smartProducts, modalFallbackProducts, favorites, effectiveUsageStats, hiddenProducts]);

    // Поиск с фильтром категории (normalizeSearch/lc/showSearch — выше, до shared-search effect)
    const savedPresetsCount = useMemo(
      () => (HEYS.store?.getMealPresets?.() || []).length,
      [presetsOpen, suggestedPresetsCount, productsVersion]
    );
    const searchResults = useMemo(() => {
      let results = [];

      if (lc) {
        // Умный поиск если доступен
        if (HEYS.SmartSearchWithTypos) {
          try {
            const result = HEYS.SmartSearchWithTypos.search(lc, latestProducts, {
              enablePhonetic: true,
              enableSynonyms: true,
              enableTranslit: true, // 🆕 рафа → rafa → Raffaello
              // UI показывает ≤25 совпадений — не собираем/не сортируем лишние кандидаты из движка
              maxResults: 25,
              usageStats: effectiveUsageStats,   // 🆕 v2.8.2: персональный boost по истории
              usageWindowDays: usageWindowDays,  // 🆕 v2.8.2: окно релевантности
              favorites: favorites               // 🆕 v2.8.2: boost избранных в топ
            });
            if (result?.results?.length) results = result.results;
          } catch (e) {
            console.warn('[AddProductStep] Smart search error:', e);
          }
        }

        // Fallback с нормализацией ё→е (только если SmartSearch не дал результатов)
        if (!results.length) {
          results = latestProducts.filter(p =>
            getProductSearchText(p, normalizeSearch).includes(lc)
          );

          // Сортировка ТОЛЬКО для fallback — SmartSearch уже отсортирован по relevance!
          results.sort((a, b) => {
            const aName = getProductSearchText(a, normalizeSearch);
            const bName = getProductSearchText(b, normalizeSearch);
            const aStartsWith = aName.startsWith(lc) ? 0 : 1;
            const bStartsWith = bName.startsWith(lc) ? 0 : 1;
            if (aStartsWith !== bStartsWith) return aStartsWith - bStartsWith;
            // Затем по точному вхождению слова
            const aExact = aName.split(/\s+/).some(w => w === lc) ? 0 : 1;
            const bExact = bName.split(/\s+/).some(w => w === lc) ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            // Затем по длине названия (короткие = точнее)
            return aName.length - bName.length;
          });
        }
      }

      // Фильтр по категории
      if (selectedCategory !== 'all') {
        results = results.filter(p => matchCategory(p, selectedCategory));
      }

      return results.slice(0, 20);
    }, [lc, latestProducts, selectedCategory, effectiveUsageStats, usageWindowDays, favorites]);

    // 🌐 Объединённые результаты: личные + общая база (без дубликатов)
    const combinedResults = useMemo(() => {
      if (barcodeResults.length > 0) return barcodeResults;
      if (!lc) return [];

      // Фильтруем shared тоже по категории (иначе переключатель категории кажется «сломанный»)
      const visibleSharedResults = effectiveSharedEnabled ? sharedResults : [];
      const sharedFiltered = selectedCategory !== 'all'
        ? visibleSharedResults.filter(p => matchCategory(p, selectedCategory))
        : visibleSharedResults;

      // Собираем кандидатов и пересчитываем скор по «реальному» совпадению,
      // чтобы семантические/косвенные личные совпадения не утаптывали точные shared-матчи.
      const candidates = [];

      // Простая функция нечеткого сравнения (Jaro-Winkler like для коротких строк)
      const isFuzzyMatch = (word, query) => {
        if (!word || !query) return false;
        if (word.includes(query)) return true;

        // Допускаем 1 ошибку/опечатку для слов длиннее 4 букв
        if (query.length > 3 && Math.abs(word.length - query.length) <= 2) {
          let errors = 0;
          let i = 0, j = 0;
          while (i < word.length && j < query.length) {
            if (word[i] !== query[j]) {
              errors++;
              if (errors > 1) return false;
              // Пробуем пропустить символ в одном из слов (вставка/удаление)
              if (word.length > query.length) i++;
              else if (query.length > word.length) j++;
              else { i++; j++; } // Замена
            } else {
              i++; j++;
            }
          }
          return true;
        }
        return false;
      };

      const pushCandidate = (p, source) => {
        if (!p) return;
        // Используем имя как есть, если нормализация вернула пустоту (защита от агрессивной очистки)
        let nameNorm = getProductSearchText(p, normalizeSearch);
        if (!nameNorm && p.name) nameNorm = p.name.toLowerCase().trim();

        if (!nameNorm) return;

        const baseRel = Number.isFinite(p.relevance) ? p.relevance : 0;
        const hasSubstring = nameNorm.includes(lc);
        const startsWith = nameNorm.startsWith(lc);

        // Разбиваем имя на слова для более умного анализа
        const nameWords = nameNorm.split(/[\s,().]+/); // Разделители: пробел, запятая, скобки, точка
        const exactWord = nameWords.some(w => w === lc);
        // Проверяем fuzzy совпадение для каждого слова запроса
        const fuzzyMatch = nameWords.some(w => isFuzzyMatch(w, lc));
        // Проверяем совпадение начала слова (3+ буквы) — спасает "савая" -> "савоярди" (совпадает "сав")
        const prefix3Match = lc.length >= 3 && nameWords.some(w => w.startsWith(lc.slice(0, 3)));
        // Проверяем совпадение начала любого слова (для "ad" → "Admin" и т.п.)
        const wordStartsWith = nameWords.some(w => w.startsWith(lc));

        // Базовый скор: используем relevance если есть + поправки
        let score = baseRel;

        if (hasSubstring) score += 40;
        else if (fuzzyMatch) score += 30; // Почти как точное, если похоже
        else if (prefix3Match) score += 20; // Начало совпадает — это уже неплохо

        // 🔧 startsWith (имя начинается с запроса) — сильный сигнал, перебивает relevance
        if (startsWith) score += 70;
        else if (wordStartsWith) score += 20; // слово в имени начинается с запроса
        if (exactWord) score += 10;

        // 🆕 Буст недавно добавленных/обновлённых (48ч) — поднимаем вверх в поиске
        const recentTs = Number(p.updatedAt || p.createdAt || 0);
        const recentWindowMs = 48 * 60 * 60 * 1000;
        if (recentTs > 0 && (Date.now() - recentTs) < recentWindowMs) score += 25;

        // Если вообще нет подстрочного совпадения, fuzzy и даже префикса — сильно штрафуем
        if (!hasSubstring && !fuzzyMatch && !prefix3Match) score -= 35;

        // Лёгкий приоритет личным (при прочих равных)
        if (source === 'personal') score += 3;
        // Shared тоже важны, если они хорошо совпадают
        if (source === 'shared') score += 1;

        candidates.push({ ...p, _source: source, _score: score, _nameNorm: nameNorm });
      };

      searchResults.forEach(p => pushCandidate(p, 'personal'));
      sharedFiltered.forEach(p => pushCandidate(p, 'shared'));

      // Дедуп по нормализованному имени — оставляем лучший скор
      // 🔧 FIX: Приоритет продуктам с порциями (личные настройки пользователя)
      const bestByName = new Map();
      candidates.forEach(p => {
        const key = p._nameNorm;
        const prev = bestByName.get(key);
        if (!prev) {
          bestByName.set(key, p);
          return;
        }

        // Проверяем наличие порций
        const prevHasPortions = Array.isArray(prev.portions) && prev.portions.length > 0;
        const currHasPortions = Array.isArray(p.portions) && p.portions.length > 0;

        // Если у текущего есть порции, а у предыдущего нет — выбираем текущий
        if (currHasPortions && !prevHasPortions) {
          bestByName.set(key, p);
          return;
        }

        // Если у предыдущего есть порции, а у текущего нет — оставляем предыдущий
        if (prevHasPortions && !currHasPortions) {
          return;
        }

        // Иначе выбираем по score (как раньше)
        if ((p._score ?? 0) > (prev._score ?? 0)) {
          bestByName.set(key, p);
        }
      });

      const combined = Array.from(bestByName.values());

      combined.sort((a, b) => {
        const sa = a._score ?? 0;
        const sb = b._score ?? 0;
        if (sa !== sb) return sb - sa;
        // tie-break: personal выше shared
        if (a._source !== b._source) return a._source === 'personal' ? -1 : 1;
        // затем короче название выше
        return String(a.name || '').length - String(b.name || '').length;
      });

      return combined.slice(0, 25);
    }, [barcodeResults, searchResults, sharedResults, lc, normalizeSearch, selectedCategory, effectiveSharedEnabled]);

    const visibleSharedCatalogPreview = useMemo(() => {
      if (quickList !== 'shared' || showSearch) return [];
      const list = Array.isArray(sharedCatalogPreview) ? sharedCatalogPreview : [];
      const filtered = selectedCategory !== 'all'
        ? list.filter(p => matchCategory(p, selectedCategory))
        : list;
      return filtered.slice(0, 24);
    }, [sharedCatalogPreview, selectedCategory, showSearch, quickList]);

    // Toggle избранного
    const toggleFavorite = useCallback((e, productId) => {
      e.stopPropagation();
      if (HEYS.store?.toggleFavorite) {
        HEYS.store.toggleFavorite(productId);
        setFavorites(HEYS.store.getFavorites());
      }
    }, []);

    const toggleHidden = useCallback((e, productId, productName, isHiddenNow) => {
      e.stopPropagation();

      const name = productName || 'продукт';
      if (!isHiddenNow) {
        const confirmed = confirm(`Убрать "${name}" из быстрых продуктов?\n\nОн исчезнет из списка. Вернуть можно в профиле → Скрытые продукты.`);
        if (!confirmed) return;
      }

      if (HEYS.store?.toggleHiddenProduct) {
        HEYS.store.toggleHiddenProduct(productId);
        setHiddenProducts(HEYS.store.getHiddenProducts());
        setFavorites(HEYS.store.getFavorites());
      }
    }, []);

    // Выбор продукта — сразу переход на шаг граммов
    const selectProduct = useCallback((product) => {
      haptic('light');
      setBarcodeResults([]);
      setBarcodeNotice(null);

      const productId = product.id ?? product.product_id ?? product.name;
      const lastGrams = lsGet(`heys_last_grams_${productId}`, null);
      const mlGrams = data._mlGrams || null;
      const defaultGrams = mlGrams || lastGrams || 100;

      const nextSearch = {
        ...data,
        selectedProduct: product,
        grams: defaultGrams,
        _mlGrams: null,
        lastGrams: lastGrams
      };

      // SYNC: onChange must commit before goToStep. Wrapping onChange in startTransition
      // deferred stepData.search — GramsStep mounted with no selectedProduct ("Сначала выберите продукт").
      onChange(nextSearch);

      if (typeof updateStepData === 'function') {
        updateStepData('grams', {
          ...(modalStepData?.grams || {}),
          selectedProduct: product,
          grams: defaultGrams,
          lastGrams
        });
      }

      React.startTransition(() => {
        try {
          if (HEYS.store?.getHiddenProducts) {
            setHiddenProducts(HEYS.store.getHiddenProducts());
          }
        } catch (e) { /* no-op */ }
      });

      // Автопереход на шаг граммов (index 4: search → grams)
      if (goToStep) {
        requestAnimationFrame(() => goToStep(4, 'left'));
      }
    }, [data, onChange, goToStep, updateStepData, modalStepData]);

    // Кнопка "Новый продукт" — открытие внешней формы создания
    const handleNewProduct = useCallback((barcode = '') => {
      haptic('medium');
      const normalizedBarcode = normalizeBarcode(barcode);
      const nextSearchData = {
        ...data,
        searchQuery: search,
        ...(normalizedBarcode ? { scannedBarcode: normalizedBarcode } : {})
      };
      onChange(nextSearchData);
      if (normalizedBarcode && typeof updateStepData === 'function') {
        updateStepData('search', nextSearchData);
      }
      // Если есть внутренний шаг создания — перейти на него
      if (goToStep) {
        setTimeout(() => goToStep(1, 'left'), 10);
        return;
      }
      // Иначе, если передан onNewProduct из контекста — вызвать и закрыть модалку
      if (context?.onNewProduct) {
        context.onNewProduct();
        // Закрываем текущий StepModal, если возможно
        if (goToStep) {
          // StepModal не даёт явного close здесь — закроем через глобал
          HEYS.StepModal?.close?.();
        }
      }
    }, [context, goToStep, search, data, onChange, updateStepData]);

    const saveBarcodeForProduct = useCallback(async (product, rawBarcode) => {
      const barcode = normalizeBarcode(rawBarcode);
      if (!product || !barcode) return false;
      const productId = String(product.id ?? product.product_id ?? product.name ?? '');
      const sharedId = resolveSharedProductId(product);
      const localDuplicate = findProductByBarcode(latestProducts, barcode);
      const localDuplicateId = String(localDuplicate?.id ?? localDuplicate?.product_id ?? localDuplicate?.name ?? '');
      const localDuplicateSharedId = resolveSharedProductId(localDuplicate);
      const sameProduct = localDuplicateId === productId
        || (sharedId && localDuplicateSharedId && String(localDuplicateSharedId) === String(sharedId));
      if (localDuplicate && localDuplicateId && !sameProduct) {
        HEYS.Toast?.warning?.(`Этот штрихкод уже привязан к «${localDuplicate.name || 'другому продукту'}»`);
        return false;
      }

      if (HEYS.cloud?.searchSharedProducts) {
        try {
          const result = await HEYS.cloud.searchSharedProducts('', { barcode, limit: 1 });
          const sharedDuplicate = Array.isArray(result?.data) ? result.data[0] : null;
          const sharedDuplicateId = String(sharedDuplicate?.id ?? '');
          if (sharedDuplicate && sharedDuplicateId && sharedDuplicateId !== String(sharedId || '')) {
            HEYS.Toast?.warning?.(`Этот штрихкод уже есть в общей базе: «${sharedDuplicate.name || 'продукт'}»`);
            return false;
          }
        } catch (_) { }
      }

      const updatedProduct = {
        ...mergeProductBarcode(product, barcode),
        updatedAt: Date.now()
      };

	      if (sharedId && !isCuratorUser()) {
	        const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
	        if (!localSave.ok) {
	          showProductCommitError(localSave.reason);
	          return false;
	        }
	        const saved = localSave.product || updatedProduct;
        notifyProductUpdated(saved);
        setProductsVersion(v => v + 1);
        if (confirm('Штрихкод сохранён в личной базе. Предложить куратору добавить его в общую базу?')) {
          const pending = await submitSharedProductChangeRequest('barcode_update', saved, sharedId, {
            summary: `barcode ${barcode}`
          });
          if (pending.ok) {
            HEYS.Toast?.info?.('Штрихкод отправлен куратору на проверку');
          } else {
            HEYS.Toast?.warning?.('Лично сохранено, но заявку отправить не удалось: ' + pending.error);
          }
	        } else {
	          HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён только в личной базе`);
	        }
	        return true;
	      }

      if (sharedId) {
        const result = await updateSharedProductBarcodes(updatedProduct, sharedId, { mode: 'add', barcode });
        if (!result.ok) {
          if (isSharedProduct(product) && !isCuratorUser()) {
            HEYS.Toast?.warning?.('Не удалось сохранить штрихкод в общей базе');
            return false;
          }
	        } else {
	          const localSave = await commitPersonalProduct(updatedProduct, false, 'barcode-update-shared');
	          if (!localSave.ok) {
	            showProductCommitError(localSave.reason);
	            return false;
	          }
	          notifyProductUpdated(localSave.product || updatedProduct);
	          HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён в общей базе для «${product.name || 'продукта'}»`);
	          return true;
	        }
	      }

	      if (sharedId && isCuratorUser()) {
	        const result = await updateSharedProduct(updatedProduct, sharedId);
	        if (!result.ok) return false;
	        const localSave = await commitPersonalProduct(updatedProduct, false, 'barcode-update-shared');
	        if (!localSave.ok) {
	          showProductCommitError(localSave.reason);
	          return false;
	        }
	        notifyProductUpdated(localSave.product || updatedProduct);
	        HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён в общей базе для «${product.name || 'продукта'}»`);
	        return true;
	      }

      if (isSharedProduct(product) && !isCuratorUser()) {
        HEYS.Toast?.warning?.('Общий продукт может изменить только куратор');
        return false;
      }

	      const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
	      if (!localSave.ok) {
	        showProductCommitError(localSave.reason);
	        return false;
	      }
	      notifyProductUpdated(localSave.product || updatedProduct);
      if (HEYS.cloud?.createPendingProduct) {
        HEYS.cloud.createPendingProduct(null, localSave.product || updatedProduct)
          .then((result) => {
            const status = result?.status || result?.data?.status;
            if (status === 'pending') {
              HEYS.Toast?.info?.('Штрихкод отправлен на проверку для общей базы');
            }
          })
          .catch(() => { });
      }
	      HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён в личной базе для «${product.name || 'продукта'}» и синхронизируется`);
	      return true;
    }, [latestProducts]);

    const persistProductBarcodes = useCallback(async (product, nextCodes, toastMode = 'update') => {
      if (!product) return null;
      const updatedProduct = {
        ...setProductBarcodes(product, nextCodes),
        updatedAt: Date.now()
      };
      const sharedId = resolveSharedProductId(product);

	      if (sharedId && !isCuratorUser()) {
	        const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
	        if (!localSave.ok) {
	          showProductCommitError(localSave.reason);
	          return null;
	        }
	        const saved = localSave.product || updatedProduct;
        notifyProductUpdated(saved);
        setProductsVersion(v => v + 1);
        const actionText = toastMode === 'remove-all' ? 'удаление всех штрихкодов' : 'изменение штрихкодов';
        if (confirm(`Сохранено в личной базе. Предложить куратору ${actionText} в общей базе?`)) {
          const pending = await submitSharedProductChangeRequest('barcode_update', saved, sharedId, {
            summary: actionText
          });
          if (pending.ok) {
            HEYS.Toast?.info?.('Изменение штрихкодов отправлено куратору');
          } else {
            HEYS.Toast?.warning?.('Лично сохранено, но заявку отправить не удалось: ' + pending.error);
          }
        } else if (toastMode === 'remove-all') {
          HEYS.Toast?.success?.('Все штрихкоды удалены только в личной базе');
        } else if (toastMode === 'remove') {
          HEYS.Toast?.success?.('Штрихкод удалён только в личной базе');
        }
        return saved;
      }

      if (sharedId) {
        const result = await updateSharedProductBarcodes(updatedProduct, sharedId);
        if (!result.ok) {
          HEYS.Toast?.warning?.('Не удалось обновить штрихкоды в общей базе');
          return null;
        }
	        const localSave = await commitPersonalProduct(updatedProduct, false, 'barcode-update-shared');
	        if (!localSave.ok) {
	          showProductCommitError(localSave.reason);
	          return null;
	        }
	        const saved = localSave.product || updatedProduct;
        notifyProductUpdated(saved);
        setProductsVersion(v => v + 1);
        if (toastMode === 'remove-all') HEYS.Toast?.success?.('Все штрихкоды удалены');
        else if (toastMode === 'remove') HEYS.Toast?.success?.('Штрихкод удалён');
        return saved;
      }

      if (isSharedProduct(product) && !isCuratorUser()) {
        HEYS.Toast?.warning?.('Общий продукт может изменить только куратор');
        return null;
      }

	      const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
	      if (!localSave.ok) {
	        showProductCommitError(localSave.reason);
	        return null;
	      }
	      const saved = localSave.product || updatedProduct;
      notifyProductUpdated(saved);
      setProductsVersion(v => v + 1);
      if (toastMode === 'remove-all') HEYS.Toast?.success?.('Все штрихкоды удалены');
      else if (toastMode === 'remove') HEYS.Toast?.success?.('Штрихкод удалён');
      return saved;
    }, []);

    const openProductBarcodeControl = useCallback(async (e, product) => {
      e.stopPropagation();
      const cameraStart = getProductBarcodes(product).length ? null : createBarcodeCameraStart();
      const productWithSharedBarcode = await resolveSharedBarcodeProductForAddStep(product);
      if (!getProductBarcodes(productWithSharedBarcode).length) {
        setBarcodeModal({ mode: 'product', product: productWithSharedBarcode, autoStart: true, cameraStart });
        return;
      }
      stopBarcodeCameraStart(cameraStart);
      setBarcodeManager({ product: productWithSharedBarcode });
    }, []);

    const addBarcodeFromManager = useCallback(() => {
      if (!barcodeManager?.product) return;
      setBarcodeModal({
        mode: 'product',
        product: barcodeManager.product,
        returnToManager: true,
        autoStart: true,
        cameraStart: createBarcodeCameraStart()
      });
      setBarcodeManager(null);
    }, [barcodeManager]);

    const removeProductBarcode = useCallback(async (code) => {
      const product = barcodeManager?.product;
      const barcode = normalizeBarcode(code);
      if (!product || !barcode) return;
      const nextCodes = getProductBarcodes(product).filter((item) => item !== barcode);
      const saved = await persistProductBarcodes(product, nextCodes, 'remove');
      if (saved) setBarcodeManager({ product: saved });
    }, [barcodeManager, persistProductBarcodes]);

    const removeAllProductBarcodes = useCallback(async () => {
      const product = barcodeManager?.product;
      if (!product) return;
      if (!confirm(`Удалить все штрихкоды у «${product.name || 'продукта'}»?`)) return;
      const saved = await persistProductBarcodes(product, [], 'remove-all');
      if (saved) setBarcodeManager({ product: saved });
    }, [barcodeManager, persistProductBarcodes]);

    const resolveBarcodeScan = useCallback(async (rawBarcode, targetProduct = null, options = {}) => {
      const barcode = normalizeBarcode(rawBarcode);
      if (!barcode) {
        HEYS.Toast?.warning?.('Штрихкод не распознан');
        return;
      }

      setBarcodeModal(null);
      setBarcodeResults([]);
      setBarcodeNotice(null);
      setBarcodeNotFoundCode(null);

      if (targetProduct) {
        const saved = await saveBarcodeForProduct(targetProduct, barcode);
        if (saved) setProductsVersion(v => v + 1);
        if (options.returnToManager) {
          setBarcodeManager({
            product: saved
              ? { ...mergeProductBarcode(targetProduct, barcode), updatedAt: Date.now() }
              : targetProduct
          });
        }
        return;
      }

      setBarcodeLookupBusy(true);
      try {
        const localMatches = (Array.isArray(latestProducts) ? latestProducts : [])
          .filter((product) => hasProductBarcode(product, barcode))
          .map((product) => ({ ...product, _source: 'personal', _barcodeMatch: true }));

        let sharedMatches = [];
        if (HEYS.cloud?.searchSharedProducts) {
          const result = await HEYS.cloud.searchSharedProducts('', { barcode, limit: 12 });
          sharedMatches = (Array.isArray(result?.data) ? result.data : [])
            .map((product) => {
              const normalized = normalizeSharedProductForAddStep(product);
              return normalized && {
                ...mergeProductBarcode(normalized, barcode),
                _source: 'shared',
                _fromShared: true,
                _barcodeMatch: true
              };
            })
            .filter(Boolean);
        }

        const matches = dedupeBarcodeMatches([...localMatches, ...sharedMatches], barcode);

        if (matches.length === 1) {
          setBarcodeNotice({
            type: 'found',
            text: 'Найден по штрихкоду'
          });
          setBarcodeNotFoundCode(null);
          selectProduct(matches[0]);
          return;
        }

        if (matches.length > 1) {
          setSearchInput(barcode);
          setSearch(barcode);
          setBarcodeResults(matches);
          HEYS.Toast?.info?.(`По штрихкоду найдено ${matches.length} варианта. Выберите продукт из списка.`);
          return;
        }

        setSearchInput('');
        setSearch('');
        setBarcodeNotice(null);
        setBarcodeNotFoundCode(barcode);
        requestAnimationFrame(() => inputRef.current?.focus());
      } catch (e) {
        setSearchInput('');
        setSearch('');
        setBarcodeNotice({
          type: 'error',
          text: 'Не удалось проверить штрихкод. Попробуйте ещё раз или воспользуйтесь поиском по названию.'
        });
        requestAnimationFrame(() => inputRef.current?.focus());
      } finally {
        setBarcodeLookupBusy(false);
      }
    }, [latestProducts, selectProduct, saveBarcodeForProduct]);

    // Удаление продукта из базы
    const handleDeleteProduct = useCallback((e, product) => {
      e.stopPropagation();

      const name = product.name || 'продукт';
      const pid = String(product.id ?? product.product_id ?? product.name);
      const fpForUsage = product.fingerprint || null;
      const nameLowerForUsage = String(name || '').trim().toLowerCase();

      // 🪦 F12 (plan 2026-05-24): подсчёт использований в dayv2 перед confirm.
      // Пользователь должен понимать: удаление породит orphan-баннеры на N днях.
      // Скан scoped только под текущего клиента (паттерн как в autoRecoverOnLoad).
      let usageDays = 0;
      try {
        const _clientId = (HEYS.cloud && typeof HEYS.cloud.getCurrentClientId === 'function')
          ? HEYS.cloud.getCurrentClientId()
          : (typeof HEYS.utils?.getCurrentClientId === 'function' ? HEYS.utils.getCurrentClientId() : '');
        const scopedPrefix = _clientId ? `heys_${_clientId}_dayv2_` : '';
        const legacyPrefix = 'heys_dayv2_';
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          const isScopedMatch = scopedPrefix && k.startsWith(scopedPrefix);
          const isLegacyMatch = !scopedPrefix && k.startsWith(legacyPrefix);
          if (!isScopedMatch && !isLegacyMatch) continue;
          let raw = localStorage.getItem(k);
          if (!raw) continue;
          let day;
          try {
            if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
              raw = HEYS.store.decompress(raw);
            }
            day = JSON.parse(raw);
          } catch (_) { continue; }
          if (!day || !Array.isArray(day.meals)) continue;
          const hasUsage = day.meals.some((meal) =>
            Array.isArray(meal?.items) && meal.items.some((it) => {
              if (!it) return false;
              const itId = String(it.product_id ?? it.productId ?? '');
              if (itId && itId === pid) return true;
              if (fpForUsage && it.fingerprint === fpForUsage) return true;
              const itNameLower = String(it.name || '').trim().toLowerCase();
              if (nameLowerForUsage && itNameLower === nameLowerForUsage) return true;
              return false;
            })
          );
          if (hasUsage) usageDays++;
        }
      } catch (_) { /* defensive — счётчик не должен ронять удаление */ }

      const usageLine = usageDays > 0
        ? `\n\n⚠️ Продукт используется в ${usageDays} ${usageDays === 1 ? 'дне' : usageDays < 5 ? 'днях' : 'днях'}. На этих днях появится оранжевый баннер «продукт не найден в базе».`
        : '';
      const confirmMsg = `Удалить "${name}" из базы?${usageLine}\n\nПосле удаления появится кнопка отмены.`;
      if (!confirm(confirmMsg)) return;

      haptic('medium');

      const markPending = () => {
        setPendingDeletedProductIds((prev) => {
          const next = new Set(prev);
          next.add(pid);
          return next;
        });
      };

      const unmarkPending = () => {
        setPendingDeletedProductIds((prev) => {
          if (!prev.has(pid)) return prev;
          const next = new Set(prev);
          next.delete(pid);
          return next;
        });
      };

      const commitDelete = () => {
        const U = HEYS.utils || {};
        const allProducts = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
        const fingerprint = product.fingerprint || null;

        // 📝 Event log (plan Wave 5.3, F-EL Batch C): product-delete — критичный
        try {
          window.HEYS?.eventLog?.write(
            'product-delete',
            `${name} (${pid}) удалён, usedInDays=${usageDays}`,
            { productId: pid, name, fingerprint, count: usageDays },
            'handleDeleteProduct'
          );
        } catch (_) { /* noop */ }

        if (HEYS.deletedProducts?.add) {
          HEYS.deletedProducts.add(name, pid, fingerprint);
        }

        const filtered = allProducts.filter(p => {
          const id = String(p.id ?? p.product_id ?? p.name);
          return id !== pid;
        });

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(filtered, { source: 'delete-product', allowShrink: true });
        } else if (HEYS.store?.set) {
          HEYS.store.set('heys_products', filtered);
        }

        setProductsVersion(v => v + 1);
      };

      if (!HEYS.Undo?.runAction) {
        try {
          commitDelete();
        } catch (error) {
          console.error('[AddProductStep] ❌ delete fallback error:', error);
          HEYS.Toast?.error?.(error.message || 'Не удалось удалить продукт');
        }
        return;
      }

      HEYS.Undo.runAction({
        label: `Продукт «${name}» удалён`,
        errorMessage: 'Не удалось подготовить удаление продукта',
        apply: () => {
          markPending();
          return { pid, name };
        },
        undo: () => {
          unmarkPending();
        },
        onExpire: () => {
          try {
            commitDelete();
          } catch (error) {
            console.error('[AddProductStep] ❌ delete commit error:', error);
            HEYS.Toast?.error?.(error.message || 'Не удалось удалить продукт');
          } finally {
            unmarkPending();
          }
        }
      });
    }, [context]);

    const formatUsageTimes = (count) => {
      const n = Number(count) || 0;
      if (n <= 0) return '';
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return `${n} раз`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} раза`;
      return `${n} раз`;
    };

    const getHarmStripeColor = (harmVal) => {
      const h = Number(harmVal);
      if (!Number.isFinite(h)) return '#7a8a5e';
      if (h <= 4) return '#7a8a5e';
      if (h <= 6) return '#d99a63';
      return 'var(--v4-sand-act, #c67139)';
    };

    const buildV4ProductMeta = (product, { showUsage = false, showMacros = false } = {}) => {
      const kcal = Math.round(product.kcal100 || 0);
      const parts = [`${kcal} ккал`];
      if (showMacros) {
        const prot = Math.round(product.protein100 || 0);
        const carbs = Math.round((product.simple100 || 0) + (product.complex100 || 0));
        const fat = Math.round((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0));
        parts.push(`Б${prot} Ж${fat} У${carbs}`);
      }
      if (showUsage) {
        const pid = String(product.id ?? product.product_id ?? product.name);
        const usageCount = getUsageCount(pid, product.name);
        if (usageCount > 0) parts.push(formatUsageTimes(usageCount));
        else if (product._source === 'shared' || product._fromShared) parts.push('общая база');
      }
      const recipeLine = HEYS.models?.formatRecipeSummary?.(product.recipe);
      if (recipeLine) parts.push(recipeLine);
      return parts.join(' · ');
    };

    const renderV4ProductRow = (product, options = {}) => {
      product = mergeSharedBarcodeIntoProductForAddStep(product);
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isNutrientsPending = product._nutrientsPending === true || product._selectionDisabled === true;
      const harmVal = product.harm ?? product.harmScore ?? product.harm100;
      const highlightedName = lc && HEYS?.SmartSearchWithTypos?.renderHighlightedText
        ? HEYS.SmartSearchWithTypos.renderHighlightedText(product.name, search, React)
        : product.name;
      const meta = buildV4ProductMeta(product, options);

      return React.createElement('button', {
        key: pid,
        type: 'button',
        className: 'aps-v4-product-row' + (isNutrientsPending ? ' aps-v4-product-row--disabled' : ''),
        onClick: isNutrientsPending ? undefined : () => selectProduct(product),
        disabled: isNutrientsPending,
        'aria-disabled': isNutrientsPending ? 'true' : undefined
      },
        React.createElement('span', {
          className: 'aps-v4-product-row__stripe',
          style: { background: getHarmStripeColor(harmVal) },
          'aria-hidden': 'true'
        }),
        React.createElement('span', { className: 'aps-v4-product-row__main' },
          React.createElement('span', { className: 'aps-v4-product-row__name' }, highlightedName),
          meta && React.createElement('span', { className: 'aps-v4-product-row__meta' }, meta)
        ),
        React.createElement('span', { className: 'aps-v4-product-row__add', 'aria-hidden': 'true' },
          React.createElement('svg', {
            width: 15,
            height: 15,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2.75,
            strokeLinecap: 'round'
          }, React.createElement('path', { d: 'M12 5v14M5 12h14' }))
        )
      );
    };

    const handleBrowseTab = (tabId) => {
      if (tabId === 'presets') {
        setPresetsOpen(true);
        return;
      }
      setQuickList(tabId);
    };

    const browseLead = (() => {
      if (showSearch) {
        if (barcodeResults.length > 0) {
          return barcodeResults.length > 1
            ? `По штрихкоду ${barcodeResults.length} совпадения — выберите продукт`
            : `Найдено по штрихкоду: ${barcodeResults.length}`;
        }
        if (sharedLoading && combinedResults.length === 0) return 'Поиск…';
        if (combinedResults.length > 0) return `Найдено ${combinedResults.length}`;
        return null;
      }
      if (quickList === 'frequent') return `За ${usageWindowDays} день · чаще всего`;
      if (quickList === 'recent') return 'За последние 3 дня';
      if (quickList === 'shared') {
        if (sharedCatalogLoading && visibleSharedCatalogPreview.length === 0) return 'Общие продукты: загрузка…';
        return 'Общая база';
      }
      return null;
    })();

    // Рендер карточки продукта с подсветкой совпадений
    const renderProductCard = (product, showFavorite = true, showHide = true, showUsageCount = false, showEditAction = false) => {
      product = mergeSharedBarcodeIntoProductForAddStep(product);
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isNutrientsPending = product._nutrientsPending === true || product._selectionDisabled === true;
      const isFav = favorites.has(pid);
      const isHidden = hiddenProducts.has(pid);
      const usageCount = showUsageCount ? getUsageCount(pid, product.name) : 0;
      const kcal = Math.round(product.kcal100 || 0);
      const prot = Math.round(product.protein100 || 0);
      const carbs = Math.round((product.simple100 || 0) + (product.complex100 || 0));
      const fat = Math.round((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0));
      const harmVal = product.harm ?? product.harmScore ?? product.harm100;
      const harmToneStyle = getHarmToneStyle(harmVal, { surface: 'aps' });
      const barcode = getProductBarcode(product);
      const barcodeCount = getProductBarcodes(product).length;
      const productBrand = getProductBrand(product);
      const showProductBrand = shouldDisplayProductBrand(product);

      // Флаг: продукт из общей базы (не из личной)
      const isFromShared = product._source === 'shared' || product._fromShared;

      // Подсветка совпадений в названии
      const highlightedName = lc && HEYS?.SmartSearchWithTypos?.renderHighlightedText
        ? HEYS.SmartSearchWithTypos.renderHighlightedText(product.name, search, React)
        : product.name;
      const highlightedBrand = showProductBrand && lc && HEYS?.SmartSearchWithTypos?.renderHighlightedText
        ? HEYS.SmartSearchWithTypos.renderHighlightedText(productBrand, search, React)
        : productBrand;

      return React.createElement('div', {
        key: pid,
        className: 'aps-product-card' + (isNutrientsPending ? ' aps-product-card--disabled' : ''),
        style: harmToneStyle || undefined,
        onClick: isNutrientsPending ? undefined : () => selectProduct(product),
        'aria-disabled': isNutrientsPending ? 'true' : undefined
      },
        // Иконка категории
        product.category && React.createElement('span', {
          className: 'aps-product-icon'
        }, getCategoryIcon(product.category)),

        // Инфо
        React.createElement('div', { className: 'aps-product-info' },
          React.createElement('div', { className: 'aps-product-name' },
            highlightedName,
            // 🌐 Бейдж для продуктов из общей базы
            isFromShared && React.createElement('span', {
              className: 'aps-shared-badge'
            }, '🌐')
          ),
          showProductBrand && React.createElement('div', { className: 'aps-product-brand' }, highlightedBrand),
          React.createElement('div', { className: 'aps-product-meta' },
            isNutrientsPending
              ? React.createElement('span', { className: 'aps-meta-pending' }, 'Состав загружается')
              : React.createElement(React.Fragment, null,
                React.createElement('span', { className: 'aps-meta-kcal' }, kcal + ' ккал'),
                React.createElement('span', { className: 'aps-meta-sep' }, '·'),
                React.createElement('span', { className: 'aps-meta-macros' },
                  'Б ' + prot + ' | Ж ' + fat + ' | У ' + carbs
                ),
                showUsageCount && React.createElement(React.Fragment, null,
                  React.createElement('span', { className: 'aps-meta-sep' }, '·'),
                  React.createElement('span', { className: 'aps-product-usage' }, `Исп.: ${usageCount}×`)
                ),
                barcode && React.createElement(React.Fragment, null,
                  React.createElement('span', { className: 'aps-meta-sep' }, '·'),
                  React.createElement('span', { className: 'aps-product-barcode' },
                    barcode,
                    barcodeCount > 1 ? ` +${barcodeCount - 1}` : ''
                  )
                )
              )
          ),
          !isNutrientsPending && HEYS.models?.formatRecipeSummary?.(product.recipe)
            ? React.createElement('div', { className: 'aps-product-recipe' }, HEYS.models.formatRecipeSummary(product.recipe))
            : null
        ),

        React.createElement('div', { className: 'aps-product-actions' },
          // Кнопка избранного — только для личных (слева)
          showFavorite && !isFromShared && React.createElement('button', {
            className: 'aps-fav-btn' + (isFav ? ' active' : ''),
            onClick: (e) => toggleFavorite(e, pid)
          }, isFav ? '★' : '☆'),
          canEditProduct(product) && React.createElement('button', {
            className: 'aps-barcode-btn' + (barcode ? ' active' : ''),
            onClick: (e) => openProductBarcodeControl(e, product),
            'aria-label': barcode ? 'Управлять штрихкодами продукта' : 'Добавить штрихкод продукта',
            title: barcode ? 'Управлять штрихкодами' : 'Добавить штрихкод'
          }, React.createElement(BarcodeBarsIcon)),
          showEditAction && canEditProduct(product) && React.createElement('button', {
            type: 'button',
            className: 'aps-edit-product-btn',
            onClick: (e) => {
              e.stopPropagation();
              haptic('light');
              showEditProductModal(product);
            },
            'aria-label': 'Редактировать продукт',
            title: 'Редактировать продукт'
          }, React.createElement(PencilEditIcon)),
          !isFromShared && React.createElement('button', {
            className: 'aps-delete-btn',
            onClick: (e) => handleDeleteProduct(e, product),
            title: 'Удалить из базы'
          }, '🗑️'),
          // Скрыть из списка (справа)
          showHide && !isFromShared && React.createElement('button', {
            className: 'aps-hide-btn' + (isHidden ? ' aps-hide-btn--active' : ''),
            onClick: (e) => toggleHidden(e, pid, product.name, isHidden),
            title: isHidden ? 'Вернуть в список' : 'Скрыть из списка'
          }, '✕')
        )
      );
    };

    // Что показывать: результаты поиска или умный список
    const shouldRenderSettledProducts = !isWaitingForProductsSettle;
    const isOfflineBrowse = typeof navigator !== 'undefined' && navigator.onLine === false;
    const searchBrowseState = useMemo(() => {
      if (showSearch) return null;
      if (isOfflineBrowse) return 'offline';
      if (!shouldRenderSettledProducts) return null;
      const personalCount = Array.isArray(latestProducts) ? latestProducts.length : 0;
      const hasSmart = Array.isArray(smartProducts) && smartProducts.length > 0;
      const hasFallback = Array.isArray(modalFallbackProducts) && modalFallbackProducts.length > 0;
      if (personalCount === 0 && !hasSmart && !hasFallback) {
        if (sharedCatalogLoading) return null;
        if (quickList !== 'shared' && visibleSharedCatalogPreview.length === 0) {
          return initialProductsSyncState.syncSettled && !initialProductsSyncState.syncInFlight
            ? 'empty_base'
            : 'load_failed';
        }
      }
      return null;
    }, [
      showSearch,
      isOfflineBrowse,
      shouldRenderSettledProducts,
      latestProducts,
      smartProducts,
      modalFallbackProducts,
      sharedCatalogLoading,
      quickList,
      visibleSharedCatalogPreview.length,
      initialProductsSyncState.syncSettled,
      initialProductsSyncState.syncInFlight
    ]);

    const similarProducts = useMemo(() => {
      if (!showSearch || !search || combinedResults.length > 0) return [];
      return findSimilarPersonalProducts(search, latestProducts);
    }, [showSearch, search, combinedResults.length, latestProducts]);

    const searchFieldFocused = showSearch && !!search && combinedResults.length === 0 && !sharedLoading;

    // Счётчик фото в текущем приёме — на шаге граммов (канвас v4)

    return React.createElement('div', { className: 'aps-search-step aps-v4-flow' },
      exitPromptOpen && React.createElement(ApsExitDialog, {
        summary: (() => {
          const picked = data?.selectedProduct || modalStepData?.search?.selectedProduct;
          const grams = data?.grams || modalStepData?.grams?.grams;
          if (picked?.name && grams) return `${picked.name}, ${grams} г — ещё не добавлен в приём. Черновик не сохраняется.`;
          if (picked?.name) return `${picked.name} — ещё не добавлен в приём. Черновик не сохраняется.`;
          if (grams && +grams !== 100) return `${grams} г — ещё не добавлены в приём. Черновик не сохраняется.`;
          return 'Черновик не сохраняется.';
        })(),
        onStay: () => setExitPromptOpen(false),
        onLeave: confirmExitModal
      }),
      barcodeModal && React.createElement(BarcodeScannerModal, {
        title: barcodeModal.mode === 'product'
          ? (barcodeModal.returnToManager ? 'Добавить штрихкод' : 'Привязать штрихкод')
          : 'Штрихкод',
        subtitle: barcodeModal.mode === 'product'
          ? `К продукту: ${barcodeModal.product?.name || 'Продукт'}`
          : 'Наведите камеру на штрихкод упаковки',
        fullscreen: barcodeModal.mode !== 'product',
        initialValue: barcodeModal.mode === 'product' && !barcodeModal.returnToManager
          ? getProductBarcode(barcodeModal.product)
          : '',
        autoStart: barcodeModal.autoStart === true,
        cameraStart: barcodeModal.cameraStart || null,
        onDetected: (code) => resolveBarcodeScan(
          code,
          barcodeModal.mode === 'product' ? barcodeModal.product : null,
          { returnToManager: barcodeModal.returnToManager === true }
        ),
        onClose: () => {
          if (barcodeModal.returnToManager && barcodeModal.product) {
            setBarcodeManager({ product: barcodeModal.product });
          }
          setBarcodeModal(null);
        }
      }),
      barcodeManager && React.createElement(ProductBarcodeManagerModal, {
        product: barcodeManager.product,
        onAdd: addBarcodeFromManager,
        onRemove: removeProductBarcode,
        onRemoveAll: removeAllProductBarcodes,
        onClose: () => setBarcodeManager(null)
      }),
      // 🍽️ Overlay «Готовые наборы»
      presetsOpen && React.createElement(MealPresetsOverlay, {
        context,
        onClose: () => {
          setPresetsOpen(false);
          // Обновляем счётчик рекомендаций после закрытия оверлея
          setSuggestedPresetsCount((HEYS.store?.getSuggestedPresets?.() || []).length);
        }
      }),

      // === Фиксированная шапка: поиск + табы (канвас v4 #3) ===
      React.createElement('div', { className: 'aps-fixed-header' },
        React.createElement('div', { className: 'aps-search-container' },
          React.createElement('div', { className: 'aps-search-field' + (searchFieldFocused ? ' is-focused' : '') },
            React.createElement('span', { className: 'aps-search-icon', 'aria-hidden': 'true' }),
            React.createElement('input', {
              ref: inputRef,
              type: 'text',
              className: 'aps-search-input',
              placeholder: 'Поиск продукта',
              value: searchInput,
              onChange: (e) => {
                setSearchInput(e.target.value);
                setBarcodeResults([]);
                setBarcodeNotice(null);
                setBarcodeNotFoundCode(null);
              },
              autoComplete: 'off',
              autoCorrect: 'off',
              spellCheck: false
            }),
            search && React.createElement('button', {
              type: 'button',
              className: 'aps-search-clear',
              onClick: () => {
                setSearchInput('');
                setSearch('');
                setBarcodeResults([]);
                setBarcodeNotice(null);
              },
              'aria-label': 'Очистить поиск'
            }, '×'),
            React.createElement('button', {
              type: 'button',
              className: 'aps-search-barcode-btn' + (barcodeLookupBusy ? ' is-busy' : ''),
              onClick: () => openSearchBarcodeScanner(createBarcodeCameraStart()),
              disabled: barcodeLookupBusy,
              'aria-label': 'Сканировать штрихкод',
              title: 'Сканировать штрихкод'
            }, barcodeLookupBusy ? '…' : React.createElement(BarcodeScanIcon))
          )
        ),
        barcodeNotice && barcodeNotice.type === 'found' && React.createElement('div', {
          className: 'aps-barcode-notice',
          role: 'status',
          'aria-live': 'polite'
        },
          React.createElement('span', { className: 'aps-barcode-notice__icon', 'aria-hidden': 'true' }, '✓'),
          React.createElement('span', null, barcodeNotice.text)
        ),
        barcodeNotFoundCode && React.createElement('div', { className: 'aps-barcode-not-found-screen', role: 'status' },
          React.createElement('div', { className: 'aps-v4-search-state__title', style: { color: 'var(--v4-sand-act-deep, #8a4a20)' } },
            `Код ${barcodeNotFoundCode}`),
          React.createElement('div', { style: { fontWeight: 700, fontSize: '14px', marginTop: '10px' } }, 'Такого продукта нет в базе'),
          React.createElement('div', { className: 'aps-v4-search-state__body' },
            'Код прочитан, но совпадений нет. Создайте продукт — код подставится автоматически.'),
          React.createElement('div', { className: 'aps-v4-search-state__actions' },
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-primary',
              onClick: () => handleNewProduct(barcodeNotFoundCode)
            }, `Создать продукт с кодом ${barcodeNotFoundCode}`),
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-ghost aps-v4-btn-paper',
              onClick: () => {
                setBarcodeNotFoundCode(null);
                setBarcodeModal({ autoStart: true, cameraStart: createBarcodeCameraStart?.() || null });
              }
            }, 'Сканировать ещё'),
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-btn-ghost aps-v4-btn-paper',
              onClick: () => {
                setBarcodeNotFoundCode(null);
                setBarcodeResults([]);
                requestAnimationFrame(() => inputRef.current?.focus());
              }
            }, 'Искать по названию'))
        ),
        barcodeNotice && barcodeNotice.type === 'error' && React.createElement('div', {
          className: 'aps-barcode-notice is-error',
          role: 'status',
          'aria-live': 'polite'
        },
          React.createElement('span', { className: 'aps-barcode-notice__icon', 'aria-hidden': 'true' }, 'i'),
          React.createElement('span', null, barcodeNotice.text)
        ),
        !showSearch && React.createElement('div', {
          className: 'aps-v4-search-tabs',
          role: 'tablist',
          'aria-label': 'Подборка продуктов'
        },
          React.createElement('button', {
            type: 'button',
            role: 'tab',
            className: 'aps-v4-search-tab' + (quickList === 'frequent' ? ' is-active' : ''),
            onClick: () => handleBrowseTab('frequent'),
            'aria-selected': quickList === 'frequent'
          }, 'Частые'),
          React.createElement('button', {
            type: 'button',
            role: 'tab',
            className: 'aps-v4-search-tab' + (quickList === 'recent' ? ' is-active' : ''),
            onClick: () => handleBrowseTab('recent'),
            'aria-selected': quickList === 'recent'
          }, 'Недавние'),
          React.createElement('button', {
            type: 'button',
            role: 'tab',
            className: 'aps-v4-search-tab' + (presetsOpen ? ' is-active' : ''),
            onClick: () => handleBrowseTab('presets'),
            'aria-selected': presetsOpen
          }, 'Наборы', savedPresetsCount > 0
            ? React.createElement('span', { className: 'aps-v4-search-tab__badge' }, ` · ${savedPresetsCount}`)
            : null),
          React.createElement('button', {
            type: 'button',
            role: 'tab',
            className: 'aps-v4-search-tab' + (quickList === 'shared' ? ' is-active' : ''),
            onClick: () => handleBrowseTab('shared'),
            'aria-selected': quickList === 'shared'
          }, 'Общие')
        )
      ),

      // === Скроллируемый список продуктов ===
      React.createElement('div', { className: 'aps-products-scroll' },
        browseLead && React.createElement('div', { className: 'aps-v4-search-lead' }, browseLead),

        shouldRenderSettledProducts && showSearch && barcodeResults.length > 1 && React.createElement('div', { className: 'aps-v4-barcode-multi' },
          React.createElement('div', { className: 'aps-v4-search-state__title' }, 'Несколько совпадений по коду'),
          React.createElement('div', { className: 'aps-v4-search-state__body' },
            'У одного штрихкода может быть и личный, и общий продукт. Выберите нужный из списка ниже.')
        ),

        shouldRenderSettledProducts && showSearch && React.createElement('div', { className: 'aps-section' },
          combinedResults?.length > 0 && React.createElement('div', { className: 'aps-v4-browse-list' },
            combinedResults.map(p => renderV4ProductRow(p, { showUsage: true, showMacros: true }))
          ),
          combinedResults.length === 0 && !sharedLoading && renderApsSearchEmptyState('no_results', {
            onCreate: handleNewProduct,
            createLabel: search ? `+ Добавить «${search}»` : 'Создать продукт',
            similarProducts,
            onPickSimilar: selectProduct
          }),
          combinedResults.length === 0 && sharedLoading && React.createElement('div', { className: 'aps-v4-search-lead' }, 'Поиск…')
        ),

        shouldRenderSettledProducts && !showSearch && searchBrowseState && React.createElement('div', { className: 'aps-section' },
          renderApsSearchEmptyState(searchBrowseState, {
            onCreate: handleNewProduct,
            onSearchShared: () => {
              setPresetsOpen(false);
              setQuickList('shared');
            },
            onRetry: () => {
              setIsWaitingForProductsSettle(true);
              try { window.dispatchEvent(new CustomEvent('heys:products-updated')); } catch (_) { /* noop */ }
            },
            tierItems: searchBrowseState === 'empty_base'
              ? ['✓ Общая база', '✓ Создание продукта']
              : searchBrowseState === 'load_failed'
                ? ['✓ Личные продукты из кэша', '✗ Свежая общая база']
                : null
          })
        ),

        shouldRenderSettledProducts && !showSearch && quickList === 'frequent' && smartProducts?.length > 0 && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-v4-browse-list' },
            smartProducts.map(p => renderV4ProductRow(p, { showUsage: true }))
          )
        ),

        shouldRenderSettledProducts && !showSearch && quickList === 'recent' && React.createElement('div', { className: 'aps-section' },
          recentProducts.length > 0
            ? React.createElement('div', { className: 'aps-v4-browse-list' },
              recentProducts.map(p => renderV4ProductRow(p, { showUsage: true }))
            )
            : React.createElement('div', { className: 'aps-empty' },
              React.createElement('span', null, 'За последние 3 дня продуктов нет')
            )
        ),

        shouldRenderSettledProducts && !showSearch && quickList === 'shared' && React.createElement('div', { className: 'aps-section' },
          visibleSharedCatalogPreview.length > 0 && React.createElement('div', { className: 'aps-v4-browse-list' },
            visibleSharedCatalogPreview.map(p => renderV4ProductRow(p, { showUsage: false }))
          ),
          visibleSharedCatalogPreview.length === 0 && !sharedCatalogLoading && React.createElement('div', { className: 'aps-empty' },
            React.createElement('span', null, selectedCategory === 'all'
              ? 'Общая база пока не загрузилась'
              : 'В этой категории общих продуктов нет')
          )
        ),

        shouldRenderSettledProducts && !showSearch && quickList === 'frequent' && (!smartProducts || smartProducts.length === 0) && modalFallbackProducts?.length > 0 && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-v4-browse-list' },
            modalFallbackProducts.map(p => renderV4ProductRow(p, { showUsage: true }))
          )
        ),

        shouldRenderSettledProducts && !showSearch && quickList === 'frequent' && React.createElement('div', { className: 'aps-v4-search-footnote' },
          'Поиск и частые — сразу, без экрана-развилки. Сколько продуктов будет, решается по ходу.'
        )
      )
    );
  }

  const CREATE_PRODUCT_AI_PROMPT_FALLBACK = `Сделай одну текстовую строку в формате "Ключ: значение" (каждое поле с новой строки). Никакого JSON/кода. Все значения на 100г.

ОБЯЗАТЕЛЬНО:
Название: X
Ккал: X
Углеводы: X
Простые: X
Сложные: X
Белок: X
Жиры: X
Вредные жиры: X
Полезные жиры: X
Транс-жиры: X
Клетчатка: X
ГИ: X
Вред: X

ОПЦИОНАЛЬНО (если знаешь — добавь):
Бренд: X
Натрий: X
Холестерин: X
Омега-3: X
Омега-6: X
NOVA: 1-4
Добавки: E621, E330 (если нет — "нет")
Нутриентная плотность: X
Органик: 0/1
Цельнозерновой: 0/1
Ферментированный: 0/1
Сырой: 0/1
Витамин A: X
Витамин C: X
Витамин D: X
Витамин E: X
Витамин K: X
Витамин B1: X
Витамин B2: X
Витамин B3: X
Витамин B6: X
Витамин B9: X
Витамин B12: X
Кальций: X
Железо: X
Магний: X
Фосфор: X
Калий: X
Цинк: X
Селен: X
Йод: X

Если в исходном названии есть бренд/производитель, вынеси его в "Бренд", а в "Название" оставь чистое название продукта без бренда. Если бренд не очевиден, строку "Бренд" можно не добавлять.`;

  const CREATE_PRODUCT_AI_EXAMPLE = `Название: Перец болгарский свежий
Бренд:
Ккал: 31
Углеводы: 6
Простые: 4
Сложные: 2
Белок: 1
Жиры: 0.3
Вредные жиры: 0.1
Полезные жиры: 0.2
Транс-жиры: 0
Клетчатка: 2.1
ГИ: 15
Вред: 0
Натрий: 2
Холестерин: 0
Омега-3: 0
Омега-6: 0
NOVA: 1
Добавки: нет
Органик: 0
Цельнозерновой: 0
Ферментированный: 0
Сырой: 1
Витамин A: 17.4
Витамин C: 141.1
Витамин D: 0
Витамин E: 10.5
Витамин K: 4.1
Витамин B1: 4.5
Витамин B2: 6.5
Витамин B3: 6.1
Витамин B6: 17.1
Витамин B9: 11.5
Витамин B12: 0
Кальций: 0.7
Железо: 2.4
Магний: 3
Фосфор: 3.7
Калий: 6
Цинк: 2.3
Селен: 0.2
Йод: 0`;

  // === Компонент создания нового продукта (Шаг create) ===
  function CreateProductStep({ data, onChange, context, stepData }) {
    // Берём поисковый запрос для предзаполнения названия
    const searchQuery = stepData?.search?.searchQuery || '';
    const initialBarcode = normalizeBarcode(
      stepData?.create?.barcode
      || stepData?.search?.scannedBarcode
      || data?.barcode
      || data?.scannedBarcode
    );
    const [pasteText, setPasteText] = useState('');
    const [formName, setFormName] = useState(() => searchQuery || '');
    const [formProtein, setFormProtein] = useState('');
    const [formSimple, setFormSimple] = useState('');
    const [formComplex, setFormComplex] = useState('');
    const [formBadFat, setFormBadFat] = useState('');
    const [formGoodFat, setFormGoodFat] = useState('');
    const [formTrans, setFormTrans] = useState('');
    const [formFiber, setFormFiber] = useState('');
    const [formGi, setFormGi] = useState('');
    const [showAdvancedDetail, setShowAdvancedDetail] = useState(false);
    const [showCreateAdvanced, setShowCreateAdvanced] = useState(false);
    const [showPasteLayer, setShowPasteLayer] = useState(false);
    const [barcodeInput, setBarcodeInput] = useState(initialBarcode);
    const [brandInput, setBrandInput] = useState(() => normalizeProductBrand(stepData?.create?.brand || data?.brand));
    const [barcodeModal, setBarcodeModal] = useState(null);
    const [error, setError] = useState('');
    const [parsedPreview, setParsedPreview] = useState(null);
    const textareaRef = useRef(null);
    const effectiveBarcode = normalizeBarcode(barcodeInput);

    // 📥 Режим добавления: 'persist' (в базу — дефолт) | 'oneTime' (разово, без записи)
    const [createMode, setCreateMode] = useState(() => stepData?.create?.mode || 'persist');

    // 🌐 Публикация в общую базу (по умолчанию включено; для oneTime скрывается)
    const [publishToShared, setPublishToShared] = useState(true);

    // Определяем тип пользователя (куратор или клиент по PIN)
    const isCurator = isCuratorUser();

    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData, stepData: modalStepData } = stepContext;
    const [exitPromptOpen, setExitPromptOpen] = useState(false);

    const closeFlow = useCallback(() => {
      context?.onClose?.();
    }, [context]);

    const requestCloseModal = useCallback(() => {
      const hasCreateDraft = !!(
        pasteText?.trim()
        || parsedPreview
        || formName?.trim()
        || formProtein?.trim()
        || formSimple?.trim()
        || formComplex?.trim()
        || formBadFat?.trim()
        || formGoodFat?.trim()
        || formTrans?.trim()
        || formFiber?.trim()
        || formGi?.trim()
        || normalizeProductBrand(brandInput)
        || effectiveBarcode
      );
      if (hasCreateDraft || hasApsDraftToLose(modalStepData, data, context)) {
        setExitPromptOpen(true);
        return;
      }
      closeFlow();
    }, [closeFlow, modalStepData, data, context, pasteText, parsedPreview, formName, formProtein, formSimple, formComplex, formBadFat, formGoodFat, formTrans, formFiber, formGi, brandInput, effectiveBarcode]);

    const confirmExitModal = useCallback(() => {
      setExitPromptOpen(false);
      closeFlow();
    }, [closeFlow]);

    useApsCloseGuard(context?.apsCloseGuardRef, requestCloseModal);
    useEscapeToClose(requestCloseModal, true);

    useEffect(() => {
      if (!showPasteLayer) return undefined;
      const timer = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }, [showPasteLayer]);

    const draftKey = 'heys_product_draft';

    useEffect(() => {
      const utils = U();
      const draft = HEYS.store?.get?.(draftKey, null) ?? utils.lsGet?.(draftKey, null);
      if (!draft || pasteText) return;
      if (draft.pasteText != null) setPasteText(draft.pasteText);
      if (!barcodeInput && draft.barcode != null) {
        const code = normalizeBarcode(draft.barcode);
        if (code) setBarcodeInput(code);
      }
      if (!brandInput && draft.brand != null) setBrandInput(normalizeProductBrand(draft.brand));
      if (typeof draft.publishToShared === 'boolean') setPublishToShared(draft.publishToShared);
    }, []);

    useEffect(() => {
      if (!initialBarcode || barcodeInput) return;
      setBarcodeInput(initialBarcode);
    }, [initialBarcode, barcodeInput]);

    useEffect(() => {
      const utils = U();
      const timer = setTimeout(() => {
        const payload = {
          pasteText,
          barcode: effectiveBarcode,
          brand: normalizeProductBrand(brandInput),
          publishToShared
        };
        if (HEYS.store?.set) {
          HEYS.store.set(draftKey, payload);
          return;
        }
        if (utils.lsSet) {
          utils.lsSet(draftKey, payload);
        }
      }, 500);

      return () => clearTimeout(timer);
    }, [pasteText, effectiveBarcode, brandInput, publishToShared]);

    const MISSING_FIELD_LABELS = {
      kcal100: 'Ккал',
      carbs100: 'Углеводы',
      simple100: 'Простые',
      complex100: 'Сложные',
      protein100: 'Белок',
      fat100: 'Жиры',
      badFat100: 'Вредные жиры',
      goodFat100: 'Полезные жиры',
      trans100: 'Транс-жиры',
      fiber100: 'Клетчатка',
      gi: 'ГИ',
      harm: 'Вред'
    };

    const countExtendedFields = useCallback((product) => {
      if (!product) return 0;
      const fields = [
        'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
        'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
        'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
        'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
      ];

      return fields.reduce((count, field) => {
        const value = product[field];
        if (Array.isArray(value)) return value.length > 0 ? count + 1 : count;
        if (typeof value === 'boolean') return count + 1;
        return value != null ? count + 1 : count;
      }, 0);
    }, []);

    const formatMissingFields = useCallback((fields) => {
      return fields
        .map((field) => MISSING_FIELD_LABELS[field] || field)
        .join(', ');
    }, []);

    const PREVIEW_FIELDS = useMemo(() => ([
      { key: 'kcal100', label: 'Ккал (100г)', unit: 'ккал' },
      { key: 'carbs100', label: 'Углеводы (100г)', unit: 'г' },
      { key: 'simple100', label: 'Простые (100г)', unit: 'г' },
      { key: 'complex100', label: 'Сложные (100г)', unit: 'г' },
      { key: 'protein100', label: 'Белок (100г)', unit: 'г' },
      { key: 'fat100', label: 'Жиры (100г)', unit: 'г' },
      { key: 'badFat100', label: 'Вредные жиры (100г)', unit: 'г' },
      { key: 'goodFat100', label: 'Полезные жиры (100г)', unit: 'г' },
      { key: 'trans100', label: 'Транс-жиры (100г)', unit: 'г' },
      { key: 'fiber100', label: 'Клетчатка (100г)', unit: 'г' },
      { key: 'gi', label: 'ГИ' },
      { key: 'harm', label: 'Вред' },
      { key: 'sodium100', label: 'Натрий (100г)', unit: 'мг' },
      { key: 'cholesterol', label: 'Холестерин (100г)', unit: 'мг' },
      { key: 'omega3_100', label: 'Омега-3 (100г)', unit: 'г' },
      { key: 'omega6_100', label: 'Омега-6 (100г)', unit: 'г' },
      { key: 'nova_group', label: 'NOVA группа' },
      { key: 'additives', label: 'Добавки' },
      { key: 'nutrient_density', label: 'Нутр. плотность', unit: '%' },
      { key: 'is_organic', label: 'Органик', type: 'bool' },
      { key: 'is_whole_grain', label: 'Цельнозерн.', type: 'bool' },
      { key: 'is_fermented', label: 'Ферментир.', type: 'bool' },
      { key: 'is_raw', label: 'Сырой', type: 'bool' },
      { key: 'vitamin_a', label: 'Витамин A', unit: '%' },
      { key: 'vitamin_c', label: 'Витамин C', unit: '%' },
      { key: 'vitamin_d', label: 'Витамин D', unit: '%' },
      { key: 'vitamin_e', label: 'Витамин E', unit: '%' },
      { key: 'vitamin_k', label: 'Витамин K', unit: '%' },
      { key: 'vitamin_b1', label: 'Витамин B1', unit: '%' },
      { key: 'vitamin_b2', label: 'Витамин B2', unit: '%' },
      { key: 'vitamin_b3', label: 'Витамин B3', unit: '%' },
      { key: 'vitamin_b6', label: 'Витамин B6', unit: '%' },
      { key: 'vitamin_b9', label: 'Витамин B9', unit: '%' },
      { key: 'vitamin_b12', label: 'Витамин B12', unit: '%' },
      { key: 'calcium', label: 'Кальций', unit: '%' },
      { key: 'iron', label: 'Железо', unit: '%' },
      { key: 'magnesium', label: 'Магний', unit: '%' },
      { key: 'phosphorus', label: 'Фосфор', unit: '%' },
      { key: 'potassium', label: 'Калий', unit: '%' },
      { key: 'zinc', label: 'Цинк', unit: '%' },
      { key: 'selenium', label: 'Селен', unit: '%' },
      { key: 'iodine', label: 'Йод', unit: '%' }
    ]), []);

    const formatPreviewValue = useCallback((product, field) => {
      if (!product) return '—';
      const value = product[field.key];
      if (field.type === 'bool') {
        if (value === true) return 'да';
        if (value === false) return 'нет';
        return '—';
      }
      if (Array.isArray(value)) {
        return value.length ? value.join(', ') : '—';
      }
      if (value === null || value === undefined || value === '') return '—';
      // Неразрывный пробел U+00A0, а не обычный. Строка «формат чисел ·
      // правило продукта»: «единица отделена обычным неразрывным пробелом
      // и в перенос с числом не уходит; граммы и миллиграммы микро-БЖУ
      // склеивать нельзя, у них тот же неразрывный пробел».
      const suffix = field.unit ? ` ${field.unit}` : '';
      return `${value}${suffix}`;
    }, []);

    // Парсинг вставленного текста (копия логики из heys_core_v12.js)
    const parseProductLine = useCallback((text) => {
      if (!text || !text.trim()) return null;

      // Регулярки из heys_core_v12.js
      const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;
      const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;

      // Нормализация строки
      let clean = text.replace(INVIS, ' ');
      clean = clean.replace(/\u060C/g, ',').replace(/\u066B/g, ',').replace(/\u066C/g, ',').replace(/\u201A/g, ',');
      clean = clean.replace(/\u00B7/g, '.').replace(/[–—−]/g, '-').replace(/%/g, '');
      clean = clean.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();

      // Извлекаем числа
      const tokens = clean.match(NUM_RE) || [];
      if (!tokens.length) return null;

      // Берём последние 12 чисел
      let last = tokens.slice(-12);
      if (last.length < 12) {
        last = Array(12 - last.length).fill('0').concat(last);
      }

      // Находим позицию первого числа для извлечения названия
      const toNum = (x) => {
        if (x === undefined || x === null) return 0;
        const s = String(x).trim().replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };

      // Поиск позиции первого токена
      let start = 0;
      let firstPos = clean.length;
      for (const tok of last) {
        const idx = clean.indexOf(tok, start);
        if (idx !== -1 && idx < firstPos) {
          firstPos = idx;
          break;
        }
        if (idx !== -1) start = idx + tok.length;
      }

      const name = clean.slice(0, firstPos).trim() || 'Без названия';
      const nums = last.map(toNum);

      // Порядок: kcal, carbs (total), simple, complex, protein, fat (total), bad, good, trans, fiber, gi, harm
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = nums;

      // Вычисляем производные (приоритет totals из 12 полей)
      const derivedCarbs = (Number.isFinite(carbs) && carbs > 0) ? carbs : (simple + complex);
      const derivedFat = (Number.isFinite(fat) && fat > 0) ? fat : (bad + good + trans);
      // TEF-aware formula: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g (Atwater)
      const kcal100 = 3 * protein + 4 * derivedCarbs + 9 * derivedFat;

      return {
        id: Math.random().toString(36).slice(2, 10),
        name,
        simple100: simple,
        complex100: complex,
        protein100: protein,
        badFat100: bad,
        goodFat100: good,
        trans100: trans,
        fiber100: fiber,
        gi: gi,
        harm: harm,  // Canonical harm field
        carbs100: Math.round(derivedCarbs * 10) / 10,
        fat100: Math.round(derivedFat * 10) / 10,
        kcal100: Math.round(kcal100 * 10) / 10,
        createdAt: Date.now()
      };
    }, []);

    // Ref для onChange чтобы не вызывать лишние ререндеры
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Асинхронное вычисление fingerprint для локального продукта
    const ensureProductFingerprint = useCallback(async (product) => {
      if (!product) return product;
      const needsBrandFingerprint = !!normalizeProductBrand(product.brand)
        && !(product.brand_fingerprint || product.brandFingerprint);
      if (product.fingerprint && !needsBrandFingerprint) return product;
      if (!HEYS.models?.computeProductFingerprint) return product;
      try {
        const fingerprint = product.fingerprint || await HEYS.models.computeProductFingerprint(product);
        if (!fingerprint) return product;
        const brandFingerprint = needsBrandFingerprint && HEYS.models.computeProductBrandFingerprint
          ? await HEYS.models.computeProductBrandFingerprint(product)
          : (product.brand_fingerprint || product.brandFingerprint || null);
        return {
          ...product,
          fingerprint,
          brand_fingerprint: brandFingerprint || null
        };
      } catch {
        return product;
      }
    }, []);

    // При изменении текста — пытаемся распарсить (с debounce)
    useEffect(() => {
      if (!pasteText.trim()) {
        setParsedPreview(null);
        setError('');
        return;
      }

      // Debounce парсинга чтобы не тормозить при быстром вводе
      const timer = setTimeout(() => {
        const looksLikeAi = /[:=]/.test(pasteText) && /[а-яa-z]/i.test(pasteText);
        const aiParsed = HEYS.models?.parseAIProductString
          ? HEYS.models.parseAIProductString(pasteText, { defaultName: searchQuery || 'Без названия' })
          : null;

        if (looksLikeAi && aiParsed?.product) {
          if (aiParsed.missingFields?.length) {
            setParsedPreview(null);
            setError('Не хватает полей: ' + formatMissingFields(aiParsed.missingFields));
            return;
          }
          const productBase = effectiveBarcode ? mergeProductBarcode(aiParsed.product, effectiveBarcode) : aiParsed.product;
          const effectiveBrand = normalizeProductBrand(brandInput) || normalizeProductBrand(productBase.brand);
          if (!brandInput && effectiveBrand) setBrandInput(effectiveBrand);
          const product = { ...productBase, brand: effectiveBrand || null };
          setParsedPreview(product);
          setError('');
          onChangeRef.current?.(prev => ({ ...prev, newProduct: product }));
          return;
        }

        const parsed = parseProductLine(pasteText);
        if (parsed) {
          const productBase = effectiveBarcode ? mergeProductBarcode(parsed, effectiveBarcode) : parsed;
          const effectiveBrand = normalizeProductBrand(brandInput) || normalizeProductBrand(productBase.brand);
          if (!brandInput && effectiveBrand) setBrandInput(effectiveBrand);
          const product = { ...productBase, brand: effectiveBrand || null };
          setParsedPreview(product);
          setError('');
          onChangeRef.current?.(prev => ({ ...prev, newProduct: product }));
        } else if (looksLikeAi) {
          setParsedPreview(null);
          setError('Не удалось распознать AI-строку. Проверьте формат с ключами.');
        } else {
          setParsedPreview(null);
          setError('Не удалось распознать данные. Формат: Название + 12 чисел.');
        }
      }, 150);

      return () => clearTimeout(timer);
    }, [pasteText, parseProductLine, searchQuery, formatMissingFields, effectiveBarcode, brandInput]);

    useEffect(() => {
      if (!parsedPreview) return;
      const nextBrand = normalizeProductBrand(brandInput);
      if (normalizeProductBrand(parsedPreview.brand) === nextBrand) return;
      const next = { ...parsedPreview, brand: nextBrand || null };
      setParsedPreview(next);
      onChangeRef.current?.((prev) => ({ ...prev, newProduct: next }));
    }, [brandInput, parsedPreview?.brand]);

    const openCreateBarcodeScanner = useCallback(() => {
      haptic('light');
      setBarcodeModal({
        autoStart: true,
        cameraStart: createBarcodeCameraStart()
      });
    }, []);

    const handleCreateBarcodeDetected = useCallback((code) => {
      const barcode = normalizeBarcode(code);
      if (!barcode) {
        HEYS.Toast?.warning?.('Штрихкод не распознан');
        return;
      }
      setBarcodeInput(barcode);
      setBarcodeModal(null);
      HEYS.Toast?.success?.('Штрихкод добавлен к новому продукту');
    }, []);

    // Подготовить продукт и перейти на шаг порций (БЕЗ СОХРАНЕНИЯ В БАЗУ!)
    const continueWithProduct = useCallback(async (sourceProduct) => {
      if (!sourceProduct) return;

      haptic('medium');

      const productWithBarcode = effectiveBarcode ? mergeProductBarcode(sourceProduct, effectiveBarcode) : sourceProduct;
      const productWithBrand = {
        ...productWithBarcode,
        brand: normalizeProductBrand(brandInput) || null
      };
      const baseProduct = await ensureProductFingerprint(productWithBrand);
      const preparedProduct = createMode === 'oneTime'
        ? { ...baseProduct, _oneTime: true }
        : baseProduct;
      if (preparedProduct?.fingerprint && preparedProduct !== sourceProduct) {
        setParsedPreview(preparedProduct);
      }

      onChange({
        ...data,
        newProduct: preparedProduct,
        selectedProduct: preparedProduct,
        grams: 100,
        mode: createMode,
        barcode: effectiveBarcode,
        brand: normalizeProductBrand(brandInput)
      });

      const effectivePublishToShared = createMode === 'oneTime' ? false : !!publishToShared;
      if (updateStepData) {
        updateStepData('create', {
          ...data,
          newProduct: preparedProduct,
          selectedProduct: preparedProduct,
          grams: 100,
          mode: createMode,
          publishToShared: effectivePublishToShared,
          barcode: effectiveBarcode,
          brand: normalizeProductBrand(brandInput)
        });
        updateStepData('harm', {
          product: preparedProduct,
          mode: createMode
        });
        updateStepData('grams', {
          selectedProduct: preparedProduct,
          grams: 100,
          mode: createMode
        });
      }

      if (goToStep) {
        setTimeout(() => goToStep(2, 'left'), 150);
      }
    }, [data, onChange, goToStep, updateStepData, publishToShared, ensureProductFingerprint, createMode, effectiveBarcode, brandInput]);

    const handleCreate = useCallback(async () => {
      if (!parsedPreview) return;
      await continueWithProduct(parsedPreview);
    }, [parsedPreview, continueWithProduct]);

    const parseFormNumber = useCallback((value, fallback = 0) => {
      const n = Number(String(value ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : fallback;
    }, []);

    const autoMacros = useMemo(() => {
      const protein100 = parseFormNumber(formProtein, 0);
      const simple100 = parseFormNumber(formSimple, 0);
      const complex100 = parseFormNumber(formComplex, 0);
      const badFat100 = parseFormNumber(formBadFat, 0);
      const goodFat100 = parseFormNumber(formGoodFat, 0);
      const trans100 = parseFormNumber(formTrans, 0);
      const carbs100 = Math.round((simple100 + complex100) * 10) / 10;
      const fat100 = Math.round((badFat100 + goodFat100 + trans100) * 10) / 10;
      const kcal100 = Math.round((3 * protein100 + 4 * carbs100 + 9 * fat100) * 10) / 10;
      return {
        protein100,
        simple100,
        complex100,
        badFat100,
        goodFat100,
        trans100,
        fiber100: parseFormNumber(formFiber, 0),
        gi: parseFormNumber(formGi, 0),
        carbs100,
        fat100,
        kcal100
      };
    }, [formProtein, formSimple, formComplex, formBadFat, formGoodFat, formTrans, formFiber, formGi, parseFormNumber]);

    const handleFormContinue = useCallback(async () => {
      const name = (formName || searchQuery || '').trim();
      if (!name) {
        setError('Укажите название продукта');
        return;
      }
      if (autoMacros.kcal100 <= 0 && autoMacros.protein100 <= 0) {
        setError('Укажите белок или раскройте состав подробнее');
        return;
      }

      const product = {
        name,
        brand: normalizeProductBrand(brandInput) || null,
        kcal100: autoMacros.kcal100,
        protein100: autoMacros.protein100,
        fat100: autoMacros.fat100,
        carbs100: autoMacros.carbs100,
        simple100: autoMacros.simple100,
        complex100: autoMacros.complex100,
        badFat100: autoMacros.badFat100,
        goodFat100: autoMacros.goodFat100,
        trans100: autoMacros.trans100,
        fiber100: autoMacros.fiber100,
        gi: autoMacros.gi,
        harm: 0
      };

      setParsedPreview(product);
      setError('');
      await continueWithProduct(product);
    }, [formName, searchQuery, autoMacros, brandInput, continueWithProduct]);

    // Авто-добавление fingerprint для превью (после парсинга)
    useEffect(() => {
      let active = true;
      if (!parsedPreview || parsedPreview.fingerprint) return undefined;

      (async () => {
        const updated = await ensureProductFingerprint(parsedPreview);
        if (!active || !updated?.fingerprint || updated.fingerprint === parsedPreview.fingerprint) return;
        setParsedPreview(updated);
        onChangeRef.current?.((prev) => ({ ...prev, newProduct: updated }));
      })();

      return () => {
        active = false;
      };
    }, [parsedPreview, ensureProductFingerprint]);

    const aiPromptText = useMemo(() => {
      const name = searchQuery || 'Название';
      if (HEYS.models?.generateAIProductStringPrompt) {
        return HEYS.models.generateAIProductStringPrompt(name);
      }
      return CREATE_PRODUCT_AI_PROMPT_FALLBACK.replace('Название: X', `Название: ${name}`);
    }, [searchQuery]);

    const handleCopyPrompt = useCallback(async () => {
      haptic('light');
      const text = aiPromptText;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          HEYS.Toast?.success?.('Промпт скопирован');
          return;
        }
      } catch (e) {
        // fallback below
      }

      try {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        HEYS.Toast?.success?.('Промпт скопирован');
      } catch (e) {
        HEYS.Toast?.warning?.('Не удалось скопировать промпт');
      }
    }, [aiPromptText]);

    const createBrandSuggestion = useMemo(() => {
      if (normalizeProductBrand(brandInput)) return null;
      const sourceName = parsedPreview?.name || searchQuery;
      return extractKnownBrandFromProductName(sourceName, { allowMiddle: true });
    }, [brandInput, parsedPreview?.name, searchQuery]);

    const applyCreateBrandSuggestion = useCallback(() => {
      if (!createBrandSuggestion) return;
      haptic('light');
      setBrandInput(createBrandSuggestion.brand);
      if (parsedPreview) {
        const next = {
          ...parsedPreview,
          name: createBrandSuggestion.name,
          brand: createBrandSuggestion.brand
        };
        setParsedPreview(next);
        onChangeRef.current?.((prev) => ({ ...prev, newProduct: next }));
      }
    }, [createBrandSuggestion, parsedPreview]);

    return React.createElement('div', { className: 'aps-create-step aps-v4-flow' },
      exitPromptOpen && React.createElement(ApsExitDialog, {
        summary: 'Введённые данные продукта ещё не сохранены. Черновик не сохраняется.',
        onStay: () => setExitPromptOpen(false),
        onLeave: confirmExitModal
      }),
      barcodeModal && React.createElement(BarcodeScannerModal, {
        title: 'Сканировать штрихкод',
        subtitle: 'Код будет сохранён у нового продукта',
        initialValue: effectiveBarcode,
        autoStart: barcodeModal.autoStart === true,
        cameraStart: barcodeModal.cameraStart || null,
        onDetected: handleCreateBarcodeDetected,
        onClose: () => setBarcodeModal(null)
      }),
      React.createElement('div', { className: 'aps-v4-create-shell' },
        React.createElement('div', { className: 'aps-v4-create-shell__title' }, 'Название и состав'),
        renderApsCreateDots(0)
      ),

      searchQuery && React.createElement('div', { className: 'aps-create-search-hint' },
        'Вы искали: ',
        React.createElement('strong', null, searchQuery)
      ),

      !showPasteLayer && React.createElement('div', { className: 'aps-v4-create-form' },
        React.createElement('div', { className: 'aps-v4-create-field' },
          React.createElement('label', { htmlFor: 'aps-create-name' }, 'Название'),
          React.createElement('input', {
            id: 'aps-create-name',
            type: 'text',
            value: formName,
            onChange: (e) => setFormName(e.target.value),
            placeholder: searchQuery || 'Например: Гречка отварная'
          })
        ),
        React.createElement('div', { className: 'aps-v4-create-field' },
          React.createElement('label', { htmlFor: 'aps-create-brand' }, 'Бренд'),
          React.createElement('input', {
            id: 'aps-create-brand',
            type: 'text',
            autoComplete: 'organization',
            value: brandInput,
            onChange: (e) => setBrandInput(e.target.value),
            placeholder: 'Необязательно'
          }),
          createBrandSuggestion && React.createElement('button', {
            type: 'button',
            className: 'aps-brand-extract-btn',
            onClick: applyCreateBrandSuggestion
          }, `Вынести «${createBrandSuggestion.brand}» из названия`)
        ),
        React.createElement('div', { className: 'aps-v4-create-field' },
          React.createElement('label', { htmlFor: 'aps-create-protein' }, 'Белок / 100 г'),
          React.createElement('input', {
            id: 'aps-create-protein',
            type: 'text',
            inputMode: 'decimal',
            value: formProtein,
            onChange: (e) => setFormProtein(e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'aps-v4-create-macros aps-v4-create-macros--auto' },
          React.createElement('div', { className: 'aps-v4-create-auto-field' },
            React.createElement('span', { className: 'aps-v4-create-auto-field__label' }, 'Ккал / 100 г'),
            React.createElement('span', { className: 'aps-v4-create-auto-field__value' }, String(autoMacros.kcal100 || '—')),
            React.createElement('span', { className: 'aps-v4-create-auto-field__tag' }, 'авто')
          ),
          React.createElement('div', { className: 'aps-v4-create-auto-field' },
            React.createElement('span', { className: 'aps-v4-create-auto-field__label' }, 'Жиры / 100 г'),
            React.createElement('span', { className: 'aps-v4-create-auto-field__value' }, String(autoMacros.fat100 || '—')),
            React.createElement('span', { className: 'aps-v4-create-auto-field__tag' }, 'авто')
          ),
          React.createElement('div', { className: 'aps-v4-create-auto-field' },
            React.createElement('span', { className: 'aps-v4-create-auto-field__label' }, 'Углеводы / 100 г'),
            React.createElement('span', { className: 'aps-v4-create-auto-field__value' }, String(autoMacros.carbs100 || '—')),
            React.createElement('span', { className: 'aps-v4-create-auto-field__tag' }, 'авто')
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-create-advanced-toggle',
          onClick: () => { haptic('light'); setShowAdvancedDetail((prev) => !prev); }
        }, showAdvancedDetail ? 'Скрыть состав подробнее' : 'Состав подробнее'),
        showAdvancedDetail && React.createElement('div', { className: 'aps-v4-create-advanced-grid' },
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-simple' }, 'Простые углеводы'),
            React.createElement('input', {
              id: 'aps-create-simple',
              type: 'text',
              inputMode: 'decimal',
              value: formSimple,
              onChange: (e) => setFormSimple(e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-complex' }, 'Сложные углеводы'),
            React.createElement('input', {
              id: 'aps-create-complex',
              type: 'text',
              inputMode: 'decimal',
              value: formComplex,
              onChange: (e) => setFormComplex(e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-bad-fat' }, 'Вредные жиры'),
            React.createElement('input', {
              id: 'aps-create-bad-fat',
              type: 'text',
              inputMode: 'decimal',
              value: formBadFat,
              onChange: (e) => setFormBadFat(e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-good-fat' }, 'Полезные жиры'),
            React.createElement('input', {
              id: 'aps-create-good-fat',
              type: 'text',
              inputMode: 'decimal',
              value: formGoodFat,
              onChange: (e) => setFormGoodFat(e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-trans' }, 'Транс-жиры'),
            React.createElement('input', {
              id: 'aps-create-trans',
              type: 'text',
              inputMode: 'decimal',
              value: formTrans,
              onChange: (e) => setFormTrans(e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-fiber' }, 'Клетчатка'),
            React.createElement('input', {
              id: 'aps-create-fiber',
              type: 'text',
              inputMode: 'decimal',
              value: formFiber,
              onChange: (e) => setFormFiber(e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'aps-v4-create-field' },
            React.createElement('label', { htmlFor: 'aps-create-gi' }, 'ГИ'),
            React.createElement('input', {
              id: 'aps-create-gi',
              type: 'text',
              inputMode: 'decimal',
              value: formGi,
              onChange: (e) => setFormGi(e.target.value),
              placeholder: '0'
            })
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-create-advanced-toggle',
          onClick: () => { haptic('light'); setShowCreateAdvanced((prev) => !prev); }
        }, showCreateAdvanced ? 'Скрыть дополнительно' : 'Дополнительно'),
        showCreateAdvanced && React.createElement('div', { className: 'aps-v4-create-extra' },
          React.createElement('div', {
            className: 'aps-create-mode-selector',
            role: 'radiogroup',
            'aria-label': 'Режим добавления продукта'
          },
            React.createElement('button', {
              type: 'button',
              className: 'aps-create-mode-btn' + (createMode === 'persist' ? ' active' : ''),
              role: 'radio',
              'aria-checked': createMode === 'persist',
              onClick: () => { haptic('light'); setCreateMode('persist'); setPublishToShared(true); }
            },
              React.createElement('span', { className: 'aps-create-mode-label' }, 'Сохранить в базу'),
              React.createElement('span', { className: 'aps-create-mode-hint' }, 'Можно использовать снова')
            ),
            React.createElement('button', {
              type: 'button',
              className: 'aps-create-mode-btn' + (createMode === 'oneTime' ? ' active' : ''),
              role: 'radio',
              'aria-checked': createMode === 'oneTime',
              onClick: () => { haptic('light'); setCreateMode('oneTime'); setPublishToShared(false); }
            },
              React.createElement('span', { className: 'aps-create-mode-label' }, 'Разово в этот приём'),
              React.createElement('span', { className: 'aps-create-mode-hint' }, 'Не засорит базу')
            )
          ),
          React.createElement('div', { className: 'aps-create-barcode-field' },
            React.createElement('label', { className: 'aps-create-barcode-label' }, 'Штрихкод'),
            React.createElement('div', { className: 'aps-create-barcode-row' },
              React.createElement('input', {
                className: 'aps-create-barcode-input',
                type: 'text',
                inputMode: 'text',
                autoComplete: 'off',
                value: barcodeInput,
                onChange: (e) => setBarcodeInput(normalizeBarcode(e.target.value) || e.target.value),
                placeholder: 'EAN / UPC'
              }),
              barcodeInput && React.createElement('button', {
                type: 'button',
                className: 'aps-create-barcode-clear',
                onClick: () => setBarcodeInput(''),
                'aria-label': 'Очистить штрихкод',
                title: 'Очистить штрихкод'
              }, '×'),
              React.createElement('button', {
                type: 'button',
                className: 'aps-create-barcode-scan',
                onClick: openCreateBarcodeScanner
              },
                React.createElement('span', { className: 'aps-create-barcode-scan-icon', 'aria-hidden': 'true' }, '▦'),
                React.createElement('span', null, effectiveBarcode ? 'Сканировать заново' : 'Сканировать')
              )
            ),
            React.createElement('div', { className: 'aps-create-barcode-note' },
              effectiveBarcode ? 'Этот код сохранится у продукта в личной базе.' : 'Можно ввести вручную или считать камерой.'
            )
          )
        ),
        error && React.createElement('div', { className: 'aps-create-error' }, '⚠️ ' + error),
        React.createElement('div', { className: 'aps-v4-footer' },
          React.createElement('button', {
            type: 'button',
            className: 'aps-v4-btn-primary',
            onClick: handleFormContinue
          }, 'Далее'),
          React.createElement('button', {
            type: 'button',
            className: 'aps-v4-btn-ghost aps-v4-btn-paper',
            onClick: () => { haptic('light'); setShowPasteLayer(true); }
          }, 'Вставить строку с данными')
        )
      ),

      showPasteLayer && React.createElement('div', { className: 'aps-create-paste-layer' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost aps-v4-btn-paper',
          style: { marginBottom: '12px' },
          onClick: () => { haptic('light'); setShowPasteLayer(false); }
        }, '← К форме'),

      // Инструкция
      React.createElement('div', { className: 'aps-create-hint' },
        'Вставьте строку с данными продукта (12 обязательных + опциональные):',
        React.createElement('br'),
        React.createElement('span', { className: 'aps-create-format' },
          'Название: …\nБренд: … (опц)\nКкал: …\nУглеводы: …\nПростые: …\nСложные: …\nБелок: …\nЖиры: …\nВредные жиры: …\nПолезные жиры: …\nТранс-жиры: …\nКлетчатка: …\nГИ: …\nВред: …\n+ Холестерин, витамины, минералы (опц)'
        )
      ),

      React.createElement('div', { className: 'aps-create-prompt-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-create-prompt-btn',
          onClick: handleCopyPrompt
        }, '📋 Скопировать промпт для ИИ'),
        React.createElement('span', { className: 'aps-create-prompt-note' }, 'Под формат новой схемы')
      ),

      // Textarea для вставки
      React.createElement('textarea', {
        ref: textareaRef,
        className: 'aps-create-textarea',
        placeholder: searchQuery
          ? `Название: ${searchQuery}\nБренд: \nКкал: 120\nУглеводы: 22\nПростые: 2\nСложные: 20\nБелок: 4\nЖиры: 2\nВредные жиры: 0.5\nПолезные жиры: 1.5\nТранс-жиры: 0\nКлетчатка: 3\nГИ: 40\nВред: 0\nХолестерин: 0`
          : 'Название: Овсянка на воде\nБренд: \nКкал: 120\nУглеводы: 22\nПростые: 2\nСложные: 20\nБелок: 4\nЖиры: 2\nВредные жиры: 0.5\nПолезные жиры: 1.5\nТранс-жиры: 0\nКлетчатка: 3\nГИ: 40\nВред: 0\nХолестерин: 0',
        value: pasteText,
        onChange: (e) => setPasteText(e.target.value),
        rows: 8
      }),

      React.createElement('div', { className: 'aps-create-example-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-create-example-btn',
          onClick: async () => {
            setPasteText('');
            try {
              const text = await navigator.clipboard.readText();
              if (text) setPasteText(text);
            } catch (_) {}
          },
          disabled: false
        }, '📋 Вставить из буфера'),
        React.createElement('span', { className: 'aps-create-example-note' }, 'Формат для поля вставки')
      ),

      // Ошибка
      error && React.createElement('div', { className: 'aps-create-error' }, '⚠️ ' + error),

      // Превью распознанного продукта
      parsedPreview && React.createElement('div', { className: 'aps-create-preview' },
        React.createElement('div', { className: 'aps-preview-title' }, '✅ Распознано:'),
        React.createElement('div', { className: 'aps-preview-name' }, parsedPreview.name),
        shouldDisplayProductBrand(parsedPreview) && React.createElement('div', { className: 'aps-preview-brand' }, getProductBrand(parsedPreview)),
        React.createElement('div', { className: 'aps-preview-macros' },
          React.createElement('span', { className: 'aps-preview-kcal' }, parsedPreview.kcal100 + ' ккал'),
          React.createElement('span', null, 'Б ' + parsedPreview.protein100 + 'г'),
          React.createElement('span', null, 'Ж ' + parsedPreview.fat100 + 'г'),
          React.createElement('span', null, 'У ' + parsedPreview.carbs100 + 'г')
        ),
        React.createElement('div', { className: 'aps-preview-details' },
          PREVIEW_FIELDS.map((field) => React.createElement('div', { className: 'aps-preview-row', key: field.key },
            React.createElement('span', { className: 'aps-preview-label' }, field.label),
            React.createElement('span', { className: 'aps-preview-value' }, formatPreviewValue(parsedPreview, field))
          ))
        )
      ),

      parsedPreview && createMode === 'persist' && React.createElement('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          marginTop: '8px',
          background: 'var(--bg-secondary, #f3f4f6)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: publishToShared,
          onChange: (e) => setPublishToShared(e.target.checked),
          style: { width: '18px', height: '18px', accentColor: '#22c55e' }
        }),
        React.createElement('span', null, '🌐 Опубликовать в общую базу'),
        React.createElement('span', {
          style: { fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginLeft: 'auto' }
        }, isCurator ? 'сразу доступен всем' : 'на модерацию')
      ),

      React.createElement('button', {
        className: 'aps-create-btn' + (parsedPreview ? ' active' : ''),
        onClick: handleCreate,
        disabled: !parsedPreview
      },
        parsedPreview
          ? '✓ Добавить «' + parsedPreview.name.slice(0, 20) + (parsedPreview.name.length > 20 ? '...' : '') + '»'
          : 'Вставьте данные продукта'
      ),

      React.createElement('div', { className: 'aps-create-tip' },
        '💡 Скопируйте строку из таблицы Google Sheets или Excel. Поддерживаются запятые и точки.'
      )
      )
    );
  }

  // === Шаг 1: Редактор базовых полей продукта ===
  function ProductEditBasicStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;

    useEscapeToClose(() => context?.onClose?.(), true);

    const sourceProduct = context?.editProduct
      || stepData?.edit_extra?.product
      || stepData?.edit_basic?.product
      || stepData?.portions?.product
      || data?.product;

    const initialForm = useMemo(() => {
      const p = sourceProduct || {};
      const simple = toNum(p.simple100, 0);
      const complex = toNum(p.complex100, 0);
      const bad = toNum(p.badFat100 ?? p.badfat100, 0);
      const good = toNum(p.goodFat100 ?? p.goodfat100, 0);
      const trans = toNum(p.trans100, 0);
      const carbs = toNum(p.carbs100 ?? (simple + complex), 0);
      const fat = toNum(p.fat100 ?? (bad + good + trans), 0);
      const protein = toNum(p.protein100, 0);
      const kcal = toNum(p.kcal100 ?? (protein * 3 + carbs * 4 + fat * 9), 0); // NET Atwater
      const harmVal = HEYS.models?.normalizeHarm?.(p) ?? toNum(p.harm, 0);

      return {
        name: p.name || '',
        brand: getProductBrand(p),
        barcode: getProductBarcode(p),
        kcal100: kcal ? String(kcal) : '',
        carbs100: carbs ? String(carbs) : '',
        simple100: simple ? String(simple) : '',
        complex100: complex ? String(complex) : '',
        protein100: protein ? String(protein) : '',
        fat100: fat ? String(fat) : '',
        badFat100: bad ? String(bad) : '',
        goodFat100: good ? String(good) : '',
        trans100: trans ? String(trans) : '',
        fiber100: p.fiber100 ? String(p.fiber100) : '',
        gi: p.gi != null ? String(p.gi) : '',
        harm: harmVal != null ? String(harmVal) : ''
      };
    }, [sourceProduct]);

    const [form, setForm] = useState(initialForm);
    const barcodeInputRef = useRef(null);
    const [nutrientsExpanded, setNutrientsExpanded] = useState(false);
    const initialPortions = useMemo(() => {
      const list = Array.isArray(sourceProduct?.portions) ? sourceProduct.portions : [];
      return list.map((portion) => ({
        name: String(portion?.name || ''),
        grams: portion?.grams ?? ''
      }));
    }, [sourceProduct]);
    const [portionRows, setPortionRows] = useState(initialPortions);
    const [portionError, setPortionError] = useState('');
    const isCustomProduct = !!(sourceProduct && sourceProduct._custom);
    const initialRecipe = useMemo(() => {
      const recipe = sourceProduct?.recipe;
      const items = Array.isArray(recipe?.items) ? recipe.items : [];
      return {
        yieldGrams: recipe?.yield_grams != null ? String(recipe.yield_grams) : '',
        items: items.map((item) => ({
          product_id: item.product_id || '',
          name: item.name || '',
          grams: item.grams != null ? String(item.grams) : '',
        })),
        addQuery: '',
        addGrams: '',
        error: '',
      };
    }, [sourceProduct]);
    const [recipeForm, setRecipeForm] = useState(initialRecipe);
    const autoPortions = useMemo(() => getAutoPortions(form.name || sourceProduct?.name), [form.name, sourceProduct?.name]);
    const brandSuggestion = useMemo(() => {
      if (normalizeProductBrand(form.brand)) return null;
      return extractKnownBrandFromProductName(form.name, { allowMiddle: true });
    }, [form.name, form.brand]);
    const brandNameCleanup = useMemo(() => {
      const brand = normalizeProductBrand(form.brand);
      if (!brand) return null;
      const cleanName = removeBrandFromProductName(form.name, brand, { allowMiddle: true });
      return cleanName && cleanName !== form.name ? { brand, name: cleanName } : null;
    }, [form.name, form.brand]);

    useEffect(() => {
      setForm(initialForm);
    }, [initialForm]);

    useEffect(() => {
      setPortionRows(initialPortions);
      setPortionError('');
    }, [initialPortions]);

    useEffect(() => {
      setRecipeForm(initialRecipe);
    }, [initialRecipe]);

    useEffect(() => {
      if (context?.focusField !== 'barcode') return;
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus?.();
        barcodeInputRef.current?.select?.();
      }, 180);
      return () => clearTimeout(timer);
    }, [context?.focusField]);

    const updateField = useCallback((key, value) => {
      setForm((prev) => ({
        ...prev,
        [key]: value
      }));
    }, []);

    const applyBrandSuggestion = useCallback(() => {
      if (!brandSuggestion) return;
      haptic('light');
      setForm((prev) => ({
        ...prev,
        name: brandSuggestion.name,
        brand: brandSuggestion.brand
      }));
    }, [brandSuggestion]);

    const applyBrandNameCleanup = useCallback(() => {
      if (!brandNameCleanup) return;
      haptic('light');
      setForm((prev) => ({
        ...prev,
        name: brandNameCleanup.name
      }));
    }, [brandNameCleanup]);

    const addPortionRow = useCallback(() => {
      haptic('light');
      setPortionRows((prev) => [...prev, { name: '', grams: '' }]);
      setPortionError('');
    }, []);

    const applyAutoPortions = useCallback(() => {
      if (!autoPortions?.length) return;
      haptic('light');
      setPortionRows(autoPortions.map((portion) => ({
        name: String(portion?.name || ''),
        grams: portion?.grams ?? ''
      })));
      setPortionError('');
    }, [autoPortions]);

    const updatePortionRow = useCallback((index, field, value) => {
      setPortionRows((prev) => prev.map((portion, i) => (
        i === index ? { ...portion, [field]: value } : portion
      )));
      setPortionError('');
    }, []);

    const removePortionRow = useCallback((index) => {
      haptic('light');
      setPortionRows((prev) => prev.filter((_, i) => i !== index));
      setPortionError('');
    }, []);

    const updateRecipeItemGrams = useCallback((index, value) => {
      setRecipeForm((prev) => ({
        ...prev,
        error: '',
        items: prev.items.map((item, i) => (i === index ? { ...item, grams: value } : item)),
      }));
    }, []);

    const removeRecipeItem = useCallback((index) => {
      haptic('light');
      setRecipeForm((prev) => ({
        ...prev,
        error: '',
        items: prev.items.filter((_, i) => i !== index),
      }));
    }, []);

    const addRecipeItem = useCallback(() => {
      haptic('light');
      const query = String(recipeForm.addQuery || '').trim();
      const grams = Number(String(recipeForm.addGrams || '').replace(',', '.'));
      if (!query || !(grams > 0)) {
        setRecipeForm((prev) => ({ ...prev, error: 'Нужны название ингредиента и граммы' }));
        return;
      }
      const all = HEYS.products?.getAll?.() || [];
      const q = query.toLowerCase();
      const exact = all.filter((p) => String(p.name || '').toLowerCase() === q);
      const matches = exact.length ? exact : all.filter((p) => String(p.name || '').toLowerCase().includes(q));
      if (matches.length !== 1) {
        setRecipeForm((prev) => ({
          ...prev,
          error: matches.length ? 'Несколько продуктов с таким именем — уточни' : 'Ингредиент не найден',
        }));
        return;
      }
      const found = matches[0];
      setRecipeForm((prev) => ({
        ...prev,
        addQuery: '',
        addGrams: '',
        error: '',
        items: [...prev.items, {
          product_id: String(found.id ?? found.product_id ?? ''),
          name: found.name,
          grams: String(grams),
        }],
      }));
    }, [recipeForm.addQuery, recipeForm.addGrams]);

    const [reapplyState, setReapplyState] = useState({
      open: false, dateFrom: '', dateTo: '', recipeRev: '', preview: '', error: '', busy: false,
    });

    const validatePortions = useCallback(() => {
      const normalized = [];
      let hasInvalid = false;

      portionRows.forEach((portion) => {
        const name = String(portion?.name || '').trim();
        const rawGrams = String(portion?.grams ?? '').trim();
        if (!name && !rawGrams) return;

        const grams = Number(rawGrams.replace(',', '.'));
        if (!name || !Number.isFinite(grams) || grams <= 0) {
          hasInvalid = true;
          return;
        }

        normalized.push({ name, grams });
      });

      return {
        ok: !hasInvalid,
        portions: normalized
      };
    }, [portionRows]);

    const isInvalidNumber = useCallback((value) => {
      if (value == null || value === '') return false;
      const n = Number(String(value).trim().replace(',', '.'));
      return !Number.isFinite(n) || n < 0;
    }, []);

    const computed = useMemo(() => {
      const simple = toNum(form.simple100, 0);
      const complex = toNum(form.complex100, 0);
      const protein = toNum(form.protein100, 0);
      const bad = toNum(form.badFat100, 0);
      const good = toNum(form.goodFat100, 0);
      const trans = toNum(form.trans100, 0);
      const partsCarbs = simple + complex;
      const partsFat = bad + good + trans;
      const carbsTotalInput = toNum(form.carbs100, 0);
      const fatTotalInput = toNum(form.fat100, 0);
      const carbsTotal = carbsTotalInput || partsCarbs;
      const fatTotal = fatTotalInput || partsFat;
      const kcalCalc = Math.round((protein * 3 + carbsTotal * 4 + fatTotal * 9) * 10) / 10; // NET Atwater
      const kcalInput = toNum(form.kcal100, 0);

      const carbsDiff = carbsTotalInput > 0 ? Math.abs(carbsTotalInput - partsCarbs) : 0;
      const fatDiff = fatTotalInput > 0 ? Math.abs(fatTotalInput - partsFat) : 0;
      const kcalDiff = kcalInput > 0 ? Math.abs(kcalInput - kcalCalc) : 0;

      return {
        carbsTotal: Math.round(carbsTotal * 10) / 10,
        fatTotal: Math.round(fatTotal * 10) / 10,
        kcalCalc,
        partsCarbs: Math.round(partsCarbs * 10) / 10,
        partsFat: Math.round(partsFat * 10) / 10,
        carbsDiff,
        fatDiff,
        kcalDiff,
        hasCarbsConflict: carbsDiff > 0.5,
        hasFatConflict: fatDiff > 0.5,
        hasKcalConflict: kcalDiff > 20
      };
    }, [form]);

    const buildUpdatedProduct = useCallback((nextPortions = null) => {
      const base = sourceProduct || {};
      const name = String(form.name || base.name || '').trim() || 'Без названия';
      const brand = normalizeProductBrand(form.brand);
      const simple100 = toNum(form.simple100, 0);
      const complex100 = toNum(form.complex100, 0);
      const protein100 = toNum(form.protein100, 0);
      const badFat100 = toNum(form.badFat100, 0);
      const goodFat100 = toNum(form.goodFat100, 0);
      const trans100 = toNum(form.trans100, 0);
      const fiber100 = toNum(form.fiber100, 0);
      const gi = toNum(form.gi, null);
      const harmInput = form.harm === '' ? null : toNum(form.harm, null);

      const carbsTotal = toNum(form.carbs100, 0);
      const fatTotal = toNum(form.fat100, 0);

      let finalSimple = simple100;
      let finalComplex = complex100;
      if (carbsTotal > 0) {
        if (!finalSimple && !finalComplex) {
          finalSimple = 0;
          finalComplex = carbsTotal;
        } else if (!finalComplex && finalSimple && carbsTotal > finalSimple) {
          finalComplex = Math.max(0, carbsTotal - finalSimple);
        }
      }

      let finalBad = badFat100;
      let finalGood = goodFat100;
      let finalTrans = trans100;
      if (fatTotal > 0) {
        const partsSum = finalBad + finalGood + finalTrans;
        if (!partsSum) {
          finalBad = fatTotal;
          finalGood = 0;
          finalTrans = 0;
        }
      }

      const carbs100 = Math.round((finalSimple + finalComplex) * 10) / 10;
      const fat100 = Math.round((finalBad + finalGood + finalTrans) * 10) / 10;
      // TEF-aware formula: protein*3 + carbs*4 + fat*9 (синхронизировано с heys_core_v12.js:computeDerived)
      const kcalFromMacros = Math.round((protein100 * 3 + carbs100 * 4 + fat100 * 9) * 10) / 10;
      const kcal100 = form.kcal100 === '' ? kcalFromMacros : toNum(form.kcal100, kcalFromMacros);

      const harm = harmInput != null
        ? harmInput
        : (HEYS.models?.normalizeHarm?.(base) ?? base.harm ?? null);
      const formBarcode = normalizeBarcode(form.barcode);
      const preservedBarcodes = getProductBarcodes(base).filter((code) => code !== formBarcode);
      const barcodes = formBarcode ? [formBarcode, ...preservedBarcodes] : [];

      let recipe = base.recipe || null;
      let recipeNutrients = null;
      const recipeItems = (recipeForm.items || [])
        .map((item) => ({
          product_id: String(item.product_id || '').trim(),
          name: String(item.name || '').trim(),
          grams: Number(item.grams),
        }))
        .filter((item) => item.product_id && item.grams > 0);
      if (isCustomProduct && recipeItems.length && Number(recipeForm.yieldGrams) > 0) {
        try {
          const findProduct = (spec) => HEYS.products?.getById?.(spec.product_id) || null;
          const computedRecipe = HEYS.models.computeRecipeNutrients({
            yield_grams: Number(recipeForm.yieldGrams),
            items: recipeItems,
          }, findProduct);
          recipe = HEYS.models.normalizeRecipe({
            yield_grams: computedRecipe.yield_grams,
            items: computedRecipe.items,
          }, { nowMs: Date.now(), previousRev: Number(base.recipe && base.recipe.rev) || 0 });
          recipeNutrients = computedRecipe.nutrients;
        } catch (err) {
          recipe = {
            ...(base.recipe || {}),
            yield_grams: Number(recipeForm.yieldGrams),
            items: recipeItems,
          };
        }
      }

      const next = {
        ...base,
        name,
        brand: brand || null,
        barcode: barcodes[0] || null,
        barcodes,
        simple100: finalSimple,
        complex100: finalComplex,
        protein100,
        badFat100: finalBad,
        goodFat100: finalGood,
        trans100: finalTrans,
        fiber100,
        gi,
        harm,
        portions: Array.isArray(nextPortions) ? nextPortions : normalizePortions(portionRows),
        carbs100,
        fat100,
        kcal100
      };
      if (recipeNutrients) Object.assign(next, recipeNutrients);
      if (recipe) next.recipe = recipe;
      return next;
    }, [form, sourceProduct, portionRows, recipeForm, isCustomProduct]);

    const runRecipeReapply = useCallback((dryRun) => {
      const product = buildUpdatedProduct();
      if (!product?.recipe) {
        setReapplyState((prev) => ({ ...prev, error: 'Сначала сохрани состав рецепта' }));
        return;
      }
      const loadDay = (date) => HEYS.utils?.loadDay?.(date, true) || null;
      const saveDay = (date, nextDay) => {
        const cid = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
        const key = cid ? `heys_${cid}_dayv2_${date}` : `heys_dayv2_${date}`;
        HEYS.utils?.lsSet?.(key, nextDay);
        HEYS.utils?.invalidateDayCache?.(date);
      };
      setReapplyState((prev) => ({ ...prev, busy: true, error: '', preview: '' }));
      try {
        const result = HEYS.models.reapplyRecipeToPastMeals({
          product,
          dateFrom: reapplyState.dateFrom,
          dateTo: reapplyState.dateTo,
          recipeRev: reapplyState.recipeRev ? Number(reapplyState.recipeRev) : null,
          dryRun,
          nowMs: Date.now(),
          loadDay,
          saveDay,
        });
        const preview = result.preview || {};
        const revParts = Object.keys(preview.by_rev || {}).sort().map((key) => (
          key === 'none' ? `без версии: ${preview.by_rev[key]}` : `rev ${key}: ${preview.by_rev[key]}`
        ));
        const text = `${preview.days_count || 0} дн., ${preview.items_count || 0} записей, Δ ${preview.kcal_delta || 0} ккал${revParts.length ? `. ${revParts.join(', ')}` : ''}. Ингредиенты — по текущим карточкам.${preview.warning_norms ? ' Нормы дней заметно изменятся.' : ''}`;
        setReapplyState((prev) => ({
          ...prev,
          busy: false,
          preview: dryRun ? text : `Исправлено: ${(result.applied || []).length} дн. ${text}`,
        }));
        if (!dryRun) HEYS.Toast?.success?.('Записи в дневнике исправлены');
      } catch (err) {
        setReapplyState((prev) => ({ ...prev, busy: false, error: err.message || 'Не удалось пересчитать' }));
      }
    }, [buildUpdatedProduct, reapplyState.dateFrom, reapplyState.dateTo, reapplyState.recipeRev]);

    const handleNext = useCallback(() => {
      if (!sourceProduct) return;
      haptic('light');
      const portionsResult = validatePortions();
      if (!portionsResult.ok) {
        setPortionError('Заполните название и граммы порции');
        return;
      }
      if (isCustomProduct && recipeForm.items.some((item) => Number(item.grams) > 0) && !(Number(recipeForm.yieldGrams) > 0)) {
        setRecipeForm((prev) => ({ ...prev, error: 'Укажи выход готового блюда' }));
        return;
      }

      const updatedProduct = buildUpdatedProduct(portionsResult.portions);
      onChange({ ...data, product: updatedProduct, portions: portionsResult.portions });

      if (updateStepData) {
        updateStepData('edit_basic', { product: updatedProduct, portions: portionsResult.portions });
        updateStepData('edit_extra', { product: updatedProduct });
        updateStepData('portions', { product: updatedProduct, portions: portionsResult.portions });
      }

      setTimeout(() => goToStep?.(1, 'left'), 120);
    }, [sourceProduct, validatePortions, buildUpdatedProduct, onChange, data, updateStepData, goToStep, isCustomProduct, recipeForm]);

    if (!sourceProduct) {
      return React.createElement('div', { className: 'pe-empty' }, 'Нет продукта для редактирования');
    }

    return React.createElement('div', { className: 'pe-step' },
      React.createElement('div', { className: 'pe-step-header' },
        React.createElement('span', { className: 'pe-step-icon' }, '✏️'),
        React.createElement('span', { className: 'pe-step-title' }, 'Название и КБЖУ')
      ),

      React.createElement('div', { className: 'pe-field' },
        React.createElement('label', { className: 'pe-label' }, 'Название'),
        React.createElement('input', {
          className: 'pe-input',
          type: 'text',
          value: form.name,
          onChange: (e) => updateField('name', e.target.value),
          placeholder: 'Название продукта'
        })
      ),

      React.createElement('div', { className: 'pe-field' },
        React.createElement('label', { className: 'pe-label' }, 'Бренд'),
        React.createElement('input', {
          className: 'pe-input',
          type: 'text',
          value: form.brand,
          onChange: (e) => updateField('brand', e.target.value),
          placeholder: 'Например: Простоквашино'
        }),
        brandSuggestion && React.createElement('button', {
          type: 'button',
          className: 'pe-brand-tool',
          onClick: applyBrandSuggestion
        }, `Вынести «${brandSuggestion.brand}» из названия`),
        brandNameCleanup && React.createElement('button', {
          type: 'button',
          className: 'pe-brand-tool',
          onClick: applyBrandNameCleanup
        }, 'Убрать бренд из названия')
      ),

      React.createElement('div', { className: 'pe-field pe-field--barcode' },
        React.createElement('label', { className: 'pe-label' }, 'Штрихкод'),
        React.createElement('div', { className: 'pe-barcode-row' },
          React.createElement('input', {
            ref: barcodeInputRef,
            className: 'pe-input',
            type: 'text',
            value: form.barcode,
            onChange: (e) => updateField('barcode', normalizeBarcode(e.target.value) || e.target.value),
            placeholder: 'EAN / UPC'
          }),
          React.createElement('button', {
            type: 'button',
            className: 'pe-barcode-clear',
            onClick: () => updateField('barcode', '')
          }, '×')
        )
      ),

      React.createElement('div', { className: 'pe-grid' },
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Ккал (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.kcal100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.kcal100,
            onChange: (e) => updateField('kcal100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Белок (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.protein100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.protein100,
            onChange: (e) => updateField('protein100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.fat100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.fat100,
            onChange: (e) => updateField('fat100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Углеводы (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.carbs100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.carbs100,
            onChange: (e) => updateField('carbs100', e.target.value),
            placeholder: '0'
          })
        )
      ),

      React.createElement('div', {
        className: 'pe-section pe-section--accordion' + (nutrientsExpanded ? ' is-open' : '')
      },
        React.createElement('button', {
          type: 'button',
          className: 'pe-accordion-toggle',
          onClick: () => setNutrientsExpanded((value) => !value),
          'aria-expanded': nutrientsExpanded ? 'true' : 'false'
        },
          React.createElement('span', { className: 'pe-section-title' }, 'Нутриенты'),
          React.createElement('span', { className: 'pe-accordion-hint' }, 'детализация'),
          React.createElement('span', { className: 'pe-accordion-chevron', 'aria-hidden': 'true' }, nutrientsExpanded ? '⌃' : '⌄')
        ),
        nutrientsExpanded && React.createElement('div', { className: 'pe-grid pe-grid--nutrients' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Простые (100г)'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.simple100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.simple100,
              onChange: (e) => updateField('simple100', e.target.value),
              placeholder: '0'
            })
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Сложные (100г)'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.complex100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.complex100,
              onChange: (e) => updateField('complex100', e.target.value),
              placeholder: '0'
            })
          ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Вредные жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.badFat100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.badFat100,
            onChange: (e) => updateField('badFat100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Полезные жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.goodFat100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.goodFat100,
            onChange: (e) => updateField('goodFat100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Транс-жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.trans100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.trans100,
            onChange: (e) => updateField('trans100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Клетчатка (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.fiber100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.fiber100,
            onChange: (e) => updateField('fiber100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'ГИ'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.gi) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.gi,
            onChange: (e) => updateField('gi', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Вред'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.harm) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.harm,
            onChange: (e) => updateField('harm', e.target.value),
            placeholder: '0'
          })
        )
        )
      ),

      React.createElement('div', { className: 'pe-section pe-portions-block' },
        React.createElement('div', { className: 'pe-portions-head' },
          React.createElement('div', null,
            React.createElement('div', { className: 'pe-section-title' }, 'Порции'),
            React.createElement('div', { className: 'pe-portions-subtitle' }, 'Как продукт обычно добавляют в дневник')
          ),
          autoPortions?.length > 0 && React.createElement('button', {
            type: 'button',
            className: 'pe-portions-template-btn',
            onClick: applyAutoPortions
          }, 'Шаблон')
        ),
        React.createElement('div', { className: 'pe-portions-list' },
          portionRows.length === 0 && React.createElement('div', { className: 'pe-portions-empty' },
            'Порций пока нет'
          ),
          portionRows.map((portion, index) =>
            React.createElement('div', { className: 'pe-portions-row', key: index },
              React.createElement('input', {
                className: 'pe-input pe-portions-name',
                value: portion.name,
                onChange: (e) => updatePortionRow(index, 'name', e.target.value),
                placeholder: 'Например: 1 ложка'
              }),
              React.createElement('div', { className: 'pe-portions-grams' },
                React.createElement('input', {
                  className: 'pe-input pe-portions-grams-input',
                  type: 'text',
                  inputMode: 'numeric',
                  value: portion.grams,
                  onChange: (e) => updatePortionRow(index, 'grams', e.target.value),
                  placeholder: 'г'
                }),
                React.createElement('span', { className: 'pe-portions-grams-unit' }, 'г')
              ),
              React.createElement('button', {
                type: 'button',
                className: 'pe-portions-remove-btn',
                onClick: () => removePortionRow(index),
                'aria-label': 'Удалить порцию',
                title: 'Удалить порцию'
              }, '×')
            )
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'pe-portions-add-btn',
          onClick: addPortionRow
        }, '+ Добавить порцию'),
        portionError && React.createElement('div', { className: 'pe-portions-error' }, portionError)
      ),

      isCustomProduct && React.createElement('div', { className: 'pe-section pe-portions-block pe-recipe-block' },
        React.createElement('div', { className: 'pe-portions-head' },
          React.createElement('div', null,
            React.createElement('div', { className: 'pe-section-title' }, 'Состав рецепта'),
            React.createElement('div', { className: 'pe-portions-subtitle' }, 'КБЖУ посчитаются при сохранении. Прошлые дни не меняются.')
          )
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Выход готового, г'),
          React.createElement('input', {
            className: 'pe-input',
            type: 'text',
            inputMode: 'numeric',
            value: recipeForm.yieldGrams,
            onChange: (e) => setRecipeForm((prev) => ({ ...prev, yieldGrams: e.target.value, error: '' })),
            placeholder: 'Например 1000'
          })
        ),
        React.createElement('div', { className: 'pe-portions-list' },
          recipeForm.items.length === 0 && React.createElement('div', { className: 'pe-portions-empty' },
            'Ингредиентов пока нет'
          ),
          recipeForm.items.map((item, index) =>
            React.createElement('div', { className: 'pe-portions-row', key: item.product_id + '-' + index },
              React.createElement('div', { className: 'pe-portions-name', style: { padding: '8px 0' } }, item.name),
              React.createElement('div', { className: 'pe-portions-grams' },
                React.createElement('input', {
                  className: 'pe-input pe-portions-grams-input',
                  type: 'text',
                  inputMode: 'numeric',
                  value: item.grams,
                  onChange: (e) => updateRecipeItemGrams(index, e.target.value),
                  placeholder: 'г'
                }),
                React.createElement('span', { className: 'pe-portions-grams-unit' }, 'г')
              ),
              React.createElement('button', {
                type: 'button',
                className: 'pe-portions-remove-btn',
                onClick: () => removeRecipeItem(index),
                'aria-label': 'Удалить ингредиент'
              }, '×')
            )
          )
        ),
        React.createElement('div', { className: 'pe-portions-row' },
          React.createElement('input', {
            className: 'pe-input pe-portions-name',
            value: recipeForm.addQuery,
            onChange: (e) => setRecipeForm((prev) => ({ ...prev, addQuery: e.target.value, error: '' })),
            placeholder: 'Ингредиент'
          }),
          React.createElement('div', { className: 'pe-portions-grams' },
            React.createElement('input', {
              className: 'pe-input pe-portions-grams-input',
              type: 'text',
              inputMode: 'numeric',
              value: recipeForm.addGrams,
              onChange: (e) => setRecipeForm((prev) => ({ ...prev, addGrams: e.target.value, error: '' })),
              placeholder: 'г'
            }),
            React.createElement('span', { className: 'pe-portions-grams-unit' }, 'г')
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'pe-portions-add-btn',
          onClick: addRecipeItem
        }, '+ Добавить ингредиент'),
        recipeForm.error && React.createElement('div', { className: 'pe-portions-error' }, recipeForm.error),
        (sourceProduct?.recipe || recipeForm.items.length > 0) && React.createElement('button', {
          type: 'button',
          className: 'pe-portions-template-btn',
          onClick: () => {
            const today = HEYS.models?.todayISO?.() || new Date().toISOString().slice(0, 10);
            const [y, m, d] = today.split('-').map(Number);
            const shifted = new Date(Date.UTC(y, m - 1, d - 30));
            const from = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
            setReapplyState((prev) => ({
              ...prev,
              open: !prev.open,
              dateTo: prev.dateTo || today,
              dateFrom: prev.dateFrom || from,
            }));
          }
        }, 'Исправить записи в дневнике'),
        reapplyState.open && React.createElement('div', { className: 'pe-recipe-reapply' },
          React.createElement('div', { className: 'pe-portions-subtitle' },
            'Отдельное действие. Save рецепта прошлое не трогает. Ингредиенты — по текущим карточкам.'
          ),
          React.createElement('div', { className: 'pe-portions-row' },
            React.createElement('input', {
              className: 'pe-input',
              type: 'date',
              value: reapplyState.dateFrom,
              onChange: (e) => setReapplyState((prev) => ({ ...prev, dateFrom: e.target.value }))
            }),
            React.createElement('input', {
              className: 'pe-input',
              type: 'date',
              value: reapplyState.dateTo,
              onChange: (e) => setReapplyState((prev) => ({ ...prev, dateTo: e.target.value }))
            })
          ),
          React.createElement('input', {
            className: 'pe-input',
            type: 'text',
            inputMode: 'numeric',
            placeholder: 'Только rev (необязательно)',
            value: reapplyState.recipeRev,
            onChange: (e) => setReapplyState((prev) => ({ ...prev, recipeRev: e.target.value }))
          }),
          React.createElement('div', { className: 'pe-portions-row' },
            React.createElement('button', {
              type: 'button',
              className: 'pe-portions-template-btn',
              disabled: reapplyState.busy,
              onClick: () => runRecipeReapply(true)
            }, 'Превью'),
            React.createElement('button', {
              type: 'button',
              className: 'pe-portions-add-btn',
              disabled: reapplyState.busy,
              onClick: () => runRecipeReapply(false)
            }, 'Исправить')
          ),
          reapplyState.preview && React.createElement('div', { className: 'pe-portions-subtitle' }, reapplyState.preview),
          reapplyState.error && React.createElement('div', { className: 'pe-portions-error' }, reapplyState.error)
        )
      ),

      React.createElement('div', { className: 'pe-preview' },
        React.createElement('span', { className: 'pe-preview-label' }, 'Авто-расчёт:'),
        React.createElement('span', { className: 'pe-preview-value' },
          `У ${computed.carbsTotal} · Ж ${computed.fatTotal} · ${computed.kcalCalc} ккал`
        )
      ),

      (computed.hasCarbsConflict || computed.hasFatConflict || computed.hasKcalConflict) && React.createElement('div', {
        className: 'pe-warning'
      },
        React.createElement('div', { className: 'pe-warning__title' }, 'Проверьте несоответствия'),
        computed.hasCarbsConflict && React.createElement('div', { className: 'pe-warning__text' },
          `Углеводы: всего ${form.carbs100 || computed.carbsTotal} ≠ простые+сложные ${computed.partsCarbs}`
        ),
        computed.hasFatConflict && React.createElement('div', { className: 'pe-warning__text' },
          `Жиры: всего ${form.fat100 || computed.fatTotal} ≠ вредные+полезные+транс ${computed.partsFat}`
        ),
        computed.hasKcalConflict && React.createElement('div', { className: 'pe-warning__text' },
          `Ккал: введено ${form.kcal100 || computed.kcalCalc} ≠ расчёт ${computed.kcalCalc}`
        )
      ),

      React.createElement('button', {
        className: 'pe-next-btn',
        onClick: handleNext
      }, 'Далее')
    );
  }

  // === Шаг 2: Редактор расширенных полей ===
  function ProductEditExtraStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;

    useEscapeToClose(() => context?.onClose?.(), true);

    const sourceProduct = stepData?.edit_basic?.product
      || context?.editProduct
      || stepData?.edit_extra?.product
      || stepData?.portions?.product
      || data?.product;

    const initialForm = useMemo(() => {
      const p = sourceProduct || {};
      return {
        category: p.category || '',
        description: p.description || '',
        sodium100: p.sodium100 != null ? String(p.sodium100) : '',
        omega3_100: p.omega3_100 != null ? String(p.omega3_100) : '',
        omega6_100: p.omega6_100 != null ? String(p.omega6_100) : '',
        nova_group: p.nova_group ?? p.novaGroup ?? '',
        nutrient_density: p.nutrient_density ?? p.nutrientDensity ?? '',
        additives: Array.isArray(p.additives) ? p.additives.join(', ') : (p.additives || ''),
        is_organic: !!p.is_organic,
        is_whole_grain: !!p.is_whole_grain,
        is_fermented: !!p.is_fermented,
        is_raw: !!p.is_raw,
        vitamin_a: p.vitamin_a != null ? String(p.vitamin_a) : '',
        vitamin_c: p.vitamin_c != null ? String(p.vitamin_c) : '',
        vitamin_d: p.vitamin_d != null ? String(p.vitamin_d) : '',
        vitamin_e: p.vitamin_e != null ? String(p.vitamin_e) : '',
        vitamin_k: p.vitamin_k != null ? String(p.vitamin_k) : '',
        vitamin_b1: p.vitamin_b1 != null ? String(p.vitamin_b1) : '',
        vitamin_b2: p.vitamin_b2 != null ? String(p.vitamin_b2) : '',
        vitamin_b3: p.vitamin_b3 != null ? String(p.vitamin_b3) : '',
        vitamin_b6: p.vitamin_b6 != null ? String(p.vitamin_b6) : '',
        vitamin_b9: p.vitamin_b9 != null ? String(p.vitamin_b9) : '',
        vitamin_b12: p.vitamin_b12 != null ? String(p.vitamin_b12) : '',
        calcium: p.calcium != null ? String(p.calcium) : '',
        iron: p.iron != null ? String(p.iron) : '',
        magnesium: p.magnesium != null ? String(p.magnesium) : '',
        phosphorus: p.phosphorus != null ? String(p.phosphorus) : '',
        potassium: p.potassium != null ? String(p.potassium) : '',
        zinc: p.zinc != null ? String(p.zinc) : '',
        selenium: p.selenium != null ? String(p.selenium) : '',
        iodine: p.iodine != null ? String(p.iodine) : ''
      };
    }, [sourceProduct]);

    const [form, setForm] = useState(initialForm);

    useEffect(() => {
      setForm(initialForm);
    }, [initialForm]);

    const updateField = useCallback((key, value) => {
      setForm((prev) => ({
        ...prev,
        [key]: value
      }));
    }, []);

    const isInvalidNumber = useCallback((value) => {
      if (value == null || value === '') return false;
      const n = Number(String(value).trim().replace(',', '.'));
      return !Number.isFinite(n) || n < 0;
    }, []);

    const buildUpdatedProduct = useCallback(() => {
      const base = sourceProduct || {};
      return {
        ...base,
        category: String(form.category || '').trim() || base.category || '',
        description: String(form.description || '').trim() || base.description || '',
        sodium100: form.sodium100 === '' ? null : toNum(form.sodium100, null),
        omega3_100: form.omega3_100 === '' ? null : toNum(form.omega3_100, null),
        omega6_100: form.omega6_100 === '' ? null : toNum(form.omega6_100, null),
        nova_group: form.nova_group === '' ? null : toInt(form.nova_group, null),
        additives: normalizeAdditives(form.additives),
        nutrient_density: form.nutrient_density === '' ? null : toNum(form.nutrient_density, null),
        is_organic: !!form.is_organic,
        is_whole_grain: !!form.is_whole_grain,
        is_fermented: !!form.is_fermented,
        is_raw: !!form.is_raw,
        vitamin_a: form.vitamin_a === '' ? null : toNum(form.vitamin_a, null),
        vitamin_c: form.vitamin_c === '' ? null : toNum(form.vitamin_c, null),
        vitamin_d: form.vitamin_d === '' ? null : toNum(form.vitamin_d, null),
        vitamin_e: form.vitamin_e === '' ? null : toNum(form.vitamin_e, null),
        vitamin_k: form.vitamin_k === '' ? null : toNum(form.vitamin_k, null),
        vitamin_b1: form.vitamin_b1 === '' ? null : toNum(form.vitamin_b1, null),
        vitamin_b2: form.vitamin_b2 === '' ? null : toNum(form.vitamin_b2, null),
        vitamin_b3: form.vitamin_b3 === '' ? null : toNum(form.vitamin_b3, null),
        vitamin_b6: form.vitamin_b6 === '' ? null : toNum(form.vitamin_b6, null),
        vitamin_b9: form.vitamin_b9 === '' ? null : toNum(form.vitamin_b9, null),
        vitamin_b12: form.vitamin_b12 === '' ? null : toNum(form.vitamin_b12, null),
        calcium: form.calcium === '' ? null : toNum(form.calcium, null),
        iron: form.iron === '' ? null : toNum(form.iron, null),
        magnesium: form.magnesium === '' ? null : toNum(form.magnesium, null),
        phosphorus: form.phosphorus === '' ? null : toNum(form.phosphorus, null),
        potassium: form.potassium === '' ? null : toNum(form.potassium, null),
        zinc: form.zinc === '' ? null : toNum(form.zinc, null),
        selenium: form.selenium === '' ? null : toNum(form.selenium, null),
        iodine: form.iodine === '' ? null : toNum(form.iodine, null)
      };
    }, [form, sourceProduct]);

    const handleNext = useCallback(() => {
      if (!sourceProduct) return;
      haptic('light');
      const updatedProduct = buildUpdatedProduct();
      onChange({ ...data, product: updatedProduct });

      if (updateStepData) {
        updateStepData('edit_extra', { product: updatedProduct });
        updateStepData('portions', { product: updatedProduct });
      }

      setTimeout(() => goToStep?.(2, 'left'), 120);
    }, [sourceProduct, buildUpdatedProduct, onChange, data, updateStepData, goToStep]);

    if (!sourceProduct) {
      return React.createElement('div', { className: 'pe-empty' }, 'Нет продукта для редактирования');
    }

    return React.createElement('div', { className: 'pe-step' },
      React.createElement('div', { className: 'pe-step-header' },
        React.createElement('span', { className: 'pe-step-icon' }, '🧬'),
        React.createElement('span', { className: 'pe-step-title' }, 'Доп. данные')
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-grid' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Категория'),
            React.createElement('input', {
              className: 'pe-input',
              type: 'text',
              list: 'pe-category-list',
              value: form.category,
              onChange: (e) => updateField('category', e.target.value),
              placeholder: 'Категория'
            }),
            React.createElement('datalist', { id: 'pe-category-list' },
              CATEGORIES.filter(c => c.id !== 'all').map((c) =>
                React.createElement('option', { key: c.id, value: c.name })
              )
            )
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Описание'),
            React.createElement('input', {
              className: 'pe-input',
              value: form.description,
              onChange: (e) => updateField('description', e.target.value),
              placeholder: 'Опционально'
            })
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Качество'),
        React.createElement('div', { className: 'pe-grid' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Натрий, мг'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.sodium100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.sodium100,
              onChange: (e) => updateField('sodium100', e.target.value)
            })
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'NOVA'),
            React.createElement('div', { className: 'pe-segment' },
              [1, 2, 3, 4].map((val) =>
                React.createElement('button', {
                  key: val,
                  className: 'pe-segment-btn' + (String(form.nova_group) === String(val) ? ' active' : ''),
                  type: 'button',
                  onClick: () => updateField('nova_group', String(val))
                }, String(val))
              )
            )
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Плотность нутр.'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.nutrient_density) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.nutrient_density,
              onChange: (e) => updateField('nutrient_density', e.target.value)
            })
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Омега и добавки'),
        React.createElement('div', { className: 'pe-grid' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Ω-3, г'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.omega3_100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.omega3_100,
              onChange: (e) => updateField('omega3_100', e.target.value)
            })
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Ω-6, г'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.omega6_100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.omega6_100,
              onChange: (e) => updateField('omega6_100', e.target.value)
            })
          ),
          React.createElement('div', { className: 'pe-field', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'pe-label' }, 'E-добавки'),
            React.createElement('input', {
              className: 'pe-input',
              type: 'text',
              value: form.additives,
              onChange: (e) => updateField('additives', e.target.value),
              placeholder: 'E330, E621'
            })
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Флаги'),
        React.createElement('div', { className: 'pe-toggles pe-toggles--4col' },
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_organic,
              onChange: (e) => updateField('is_organic', e.target.checked)
            }),
            React.createElement('span', null, '🌿')
          ),
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_whole_grain,
              onChange: (e) => updateField('is_whole_grain', e.target.checked)
            }),
            React.createElement('span', null, '🌾')
          ),
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_fermented,
              onChange: (e) => updateField('is_fermented', e.target.checked)
            }),
            React.createElement('span', null, '🧬')
          ),
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_raw,
              onChange: (e) => updateField('is_raw', e.target.checked)
            }),
            React.createElement('span', null, '🥬')
          )
        ),
        React.createElement('div', { className: 'pe-toggles-legend' },
          '🌿 Органик · 🌾 Цельнозерн. · 🧬 Ферментир. · 🥬 Сырой'
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Витамины (%)'),
        React.createElement('div', { className: 'pe-grid pe-grid--vitamins' },
          [
            { key: 'vitamin_a', label: 'A' },
            { key: 'vitamin_c', label: 'C' },
            { key: 'vitamin_d', label: 'D' },
            { key: 'vitamin_e', label: 'E' },
            { key: 'vitamin_k', label: 'K' },
            { key: 'vitamin_b1', label: 'B1' },
            { key: 'vitamin_b2', label: 'B2' },
            { key: 'vitamin_b3', label: 'B3' },
            { key: 'vitamin_b6', label: 'B6' },
            { key: 'vitamin_b9', label: 'B9' },
            { key: 'vitamin_b12', label: 'B12' }
          ].map((item) =>
            React.createElement('div', { className: 'pe-field pe-field--inline', key: item.key },
              React.createElement('label', { className: 'pe-label' }, item.label),
              React.createElement('input', {
                className: 'pe-input' + (isInvalidNumber(form[item.key]) ? ' pe-input--error' : ''),
                type: 'text',
                inputMode: 'numeric',
                placeholder: '%',
                value: form[item.key],
                onChange: (e) => updateField(item.key, e.target.value)
              })
            )
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Минералы (%)'),
        React.createElement('div', { className: 'pe-grid pe-grid--minerals' },
          [
            { key: 'calcium', label: 'Ca' },
            { key: 'iron', label: 'Fe' },
            { key: 'magnesium', label: 'Mg' },
            { key: 'phosphorus', label: 'P' },
            { key: 'potassium', label: 'K' },
            { key: 'zinc', label: 'Zn' },
            { key: 'selenium', label: 'Se' },
            { key: 'iodine', label: 'I' }
          ].map((item) =>
            React.createElement('div', { className: 'pe-field pe-field--inline', key: item.key },
              React.createElement('label', { className: 'pe-label' }, item.label),
              React.createElement('input', {
                className: 'pe-input' + (isInvalidNumber(form[item.key]) ? ' pe-input--error' : ''),
                type: 'text',
                inputMode: 'numeric',
                placeholder: '%',
                value: form[item.key],
                onChange: (e) => updateField(item.key, e.target.value)
              })
            )
          )
        )
      ),

      React.createElement('button', {
        className: 'pe-next-btn',
        onClick: handleNext
      }, 'Далее к порциям')
    );
  }

  // === Компонент выбора порций (Шаг portions) ===
  function PortionsStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;
    const [exitPromptOpen, setExitPromptOpen] = useState(false);

    const closeFlow = useCallback(() => {
      context?.onClose?.();
    }, [context]);

    const requestCloseModal = useCallback(() => {
      if (hasApsDraftToLose(stepData, data, context)) {
        setExitPromptOpen(true);
        return;
      }
      closeFlow();
    }, [closeFlow, stepData, data, context]);

    const confirmExitModal = useCallback(() => {
      setExitPromptOpen(false);
      closeFlow();
    }, [closeFlow]);

    useApsCloseGuard(context?.apsCloseGuardRef, requestCloseModal);
    useEscapeToClose(requestCloseModal, true);

    // Ищем продукт из всех возможных источников
    const product = stepData?.edit_extra?.product
      || stepData?.edit_basic?.product
      || stepData?.portions?.product
      || context?.editProduct
      || stepData?.grams?.selectedProduct  // Продукт с шага граммов
      || stepData?.search?.selectedProduct // Продукт с шага поиска
      || stepData?.create?.newProduct
      || stepData?.create?.selectedProduct
      || data?.selectedProduct;

    const autoPortions = useMemo(() => getAutoPortions(product?.name), [product?.name]);
    const explicitPortions = Array.isArray(stepData?.portions?.portions) ? stepData.portions.portions : null;

    const toEditablePortions = useCallback((list) => {
      const base = Array.isArray(list) ? list : [];
      return base.map((p) => ({
        name: String(p?.name || ''),
        grams: p?.grams ?? ''
      }));
    }, []);

    const [portions, setPortions] = useState(() => {
      if (explicitPortions) return toEditablePortions(explicitPortions);
      if (product?.portions?.length) return toEditablePortions(product.portions);
      if (autoPortions?.length) return toEditablePortions(autoPortions);
      return [];
    });
    const [error, setError] = useState('');
    // Защита от ре-инициализации авто-порциями после ручного удаления.
    // Why: useEffect ниже срабатывает каждый раз когда portions.length становится 0,
    // из-за чего удаление единственной рекомендованной порции мгновенно её возвращает.
    const userTouchedRef = useRef(false);

    useEffect(() => {
      if (!product) return;
      if (userTouchedRef.current) return;
      if (portions.length > 0) return;

      if (explicitPortions) {
        setPortions(toEditablePortions(explicitPortions));
        return;
      }

      if (product?.portions?.length) {
        setPortions(toEditablePortions(product.portions));
        return;
      }

      if (autoPortions?.length) {
        setPortions(toEditablePortions(autoPortions));
      }
    }, [product, explicitPortions, autoPortions, portions.length, toEditablePortions]);

    const handleAddPortion = useCallback(() => {
      haptic('light');
      userTouchedRef.current = true;
      setPortions((prev) => {
        const next = [...prev, { name: '', grams: '' }];
        console.info('[HEYS.portions] ➕ Добавить порцию', {
          productId: product?.id ?? product?.product_id ?? null,
          prevCount: prev.length,
          nextCount: next.length
        });
        return next;
      });
    }, []);

    const handleRemovePortion = useCallback((index) => {
      haptic('light');
      userTouchedRef.current = true;
      console.info('[HEYS.portions] ➖ Удалить порцию', {
        productId: product?.id ?? product?.product_id ?? null,
        index
      });
      setPortions((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleUpdatePortion = useCallback((index, field, value) => {
      console.info('[HEYS.portions] ✏️ handleUpdatePortion', { index, field, value });
      userTouchedRef.current = true;
      setPortions((prev) => {
        const next = prev.map((p, i) => {
          if (i !== index) return p;
          return {
            ...p,
            [field]: value
          };
        });
        console.info('[HEYS.portions] ✏️ portions state updated', { prev, next });
        return next;
      });
    }, []);

    const handleApplyAuto = useCallback(() => {
      if (!autoPortions?.length) return;
      haptic('light');
      userTouchedRef.current = true;
      setPortions(toEditablePortions(autoPortions));
    }, [autoPortions, toEditablePortions]);

	    const handleContinue = useCallback(async () => {
      console.info('[HEYS.portions] 🔵 handleContinue START', {
        productId: product?.id ?? product?.product_id ?? null,
        productName: product?.name,
        productPortions: product?.portions,
        statePortions: portions,
        isEditMode: !!context?.isEditMode
      });
      if (!product) {
        console.warn('[HEYS.portions] ⚠️ Нет продукта при сохранении порций');
        return;
      }

      const normalized = normalizePortions(portions);
      if (portions.length > 0 && normalized.length === 0) {
        setError('Заполните название и граммы порции');
        console.warn('[HEYS.portions] ⚠️ Порции невалидны', {
          productId: product?.id ?? product?.product_id ?? null,
          rawCount: portions.length
        });
        return;
      }

      setError('');

      console.info('[HEYS.portions] 💾 Сохранение порций', {
        productId: product?.id ?? product?.product_id ?? null,
        productName: product?.name,
        rawPortions: portions,
        normalizedPortions: normalized,
        normalizedCount: normalized.length,
        isEditMode: !!context?.isEditMode,
        isShared: isSharedProduct(product),
        isCurator: isCuratorUser()
      });

      // Why: всегда применяем normalized (в т.ч. пустой массив), иначе spread `...product`
      // переносит старые portions при удалении всех порций в edit-mode.
      const updatedProduct = {
        ...product,
        portions: normalized
      };

      onChange({
        ...data,
        portions: normalized,
        selectedProduct: updatedProduct
      });

      if (updateStepData) {
        updateStepData('portions', {
          product: updatedProduct,
          portions: normalized
        });
        updateStepData('create', {
          ...stepData?.create,
          newProduct: updatedProduct,
          selectedProduct: updatedProduct
        });
        updateStepData('harm', {
          product: updatedProduct
        });
        updateStepData('grams', {
          selectedProduct: updatedProduct,
          grams: stepData?.create?.grams || 100
        });
      }

	      if (context?.isEditMode) {
	        // Why: сохраняем пустой массив тоже — это явное действие юзера «убрать все порции».
	        const saved = await saveProductPortions(updatedProduct, normalized);
	        if (!saved) return;
	      }

	      if (context?.onFinish) {
        console.info('[HEYS.portions] ✅ Завершение шага порций', {
          productId: product?.id ?? product?.product_id ?? null,
          normalizedCount: normalized.length
        });
	        const finishResult = context.onFinish({ product: updatedProduct, portions: normalized });
	        if (finishResult && typeof finishResult.then === 'function') {
	          await finishResult;
	        }
	        if (HEYS.StepModal?.hide) {
	          HEYS.StepModal.hide();
        }
        return;
      }

      const nextIndex = context?.isEditMode ? 1 : 3;
      setTimeout(() => goToStep?.(nextIndex, 'left'), 150);
    }, [product, portions, onChange, data, updateStepData, stepData, context?.isEditMode, context?.onFinish, goToStep]);

    const handleSkip = useCallback(() => {
      if (!product) return;
      haptic('light');

      if (updateStepData) {
        updateStepData('portions', {
          product,
          portions: []
        });
        updateStepData('harm', {
          product
        });
      }

      if (context?.onFinish) {
        context.onFinish({ product, portions: [] });
        if (HEYS.StepModal?.hide) {
          HEYS.StepModal.hide();
        }
        return;
      }

      const nextIndex = context?.isEditMode ? 1 : 3;
      setTimeout(() => goToStep?.(nextIndex, 'left'), 150);
    }, [product, updateStepData, context?.isEditMode, context?.onFinish, goToStep]);

    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала создайте продукт'
      );
    }

    return React.createElement('div', { className: 'aps-v4-portions-step aps-v4-flow' },
      exitPromptOpen && React.createElement(ApsExitDialog, {
        summary: product?.name
          ? `${product.name} — порции ещё не сохранены. Черновик не сохраняется.`
          : 'Черновик не сохраняется.',
        onStay: () => setExitPromptOpen(false),
        onLeave: confirmExitModal
      }),
      React.createElement('div', { className: 'aps-v4-create-shell' },
        React.createElement('div', { className: 'aps-v4-create-shell__title' }, 'Порции'),
        renderApsCreateDots(1)
      ),
      React.createElement('div', { className: 'aps-v4-portions-subtitle' },
        'Чтобы не считать граммы каждый раз. Можно пропустить — тогда останется ввод в граммах.'
      ),
      React.createElement('div', { className: 'aps-v4-portions-product' }, product.name),

      autoPortions?.length > 0 && portions.length === 0 && React.createElement('div', { className: 'aps-v4-portions-suggest' },
        React.createElement('div', { className: 'aps-v4-portions-suggest__title' }, 'Рекомендованные'),
        React.createElement('div', { className: 'aps-v4-portions-list' },
          autoPortions.map((p, i) =>
            React.createElement('div', { key: i, className: 'aps-v4-portions-row aps-v4-portions-row--readonly' },
              React.createElement('span', { className: 'aps-v4-portions-row__name' }, p.name),
              React.createElement('span', { className: 'aps-v4-portions-row__grams' }, `${p.grams} г`)
            )
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost aps-v4-btn-paper',
          onClick: handleApplyAuto
        }, 'Использовать шаблон')
      ),

      React.createElement('div', { className: 'aps-v4-portions-list' },
        portions.length === 0 && React.createElement('div', { className: 'aps-v4-portions-empty' },
          'Нет порций — добавьте свои или пропустите'
        ),
        portions.map((p, i) =>
          React.createElement('div', { key: i, className: 'aps-v4-portions-row' },
            React.createElement('input', {
              className: 'aps-v4-portions-row__input aps-v4-portions-row__input--name',
              placeholder: 'Например: 1 яблоко',
              value: p.name,
              onChange: (e) => handleUpdatePortion(i, 'name', e.target.value)
            }),
            React.createElement('div', { className: 'aps-v4-portions-row__grams-wrap' },
              React.createElement('input', {
                className: 'aps-v4-portions-row__input aps-v4-portions-row__input--grams',
                type: 'number',
                inputMode: 'numeric',
                placeholder: 'г',
                value: p.grams,
                onChange: (e) => handleUpdatePortion(i, 'grams', e.target.value)
              }),
              React.createElement('span', { className: 'aps-v4-portions-row__grams' }, 'г')
            ),
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-portions-row__remove',
              onClick: () => handleRemovePortion(i),
              'aria-label': 'Удалить порцию'
            }, '×')
          )
        )
      ),

      React.createElement('button', {
        type: 'button',
        className: 'aps-v4-btn-ghost aps-v4-btn-paper aps-v4-portions-add',
        onClick: handleAddPortion
      }, '+ Добавить порцию'),

      error && React.createElement('div', { className: 'aps-portions-error' }, '⚠️ ' + error),

      React.createElement('div', { className: 'aps-v4-footer aps-v4-footer--split' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost aps-v4-btn-paper',
          onClick: handleSkip
        }, 'Пропустить'),
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-btn-primary',
          onClick: handleContinue
        }, context?.isProductEditor ? 'Готово' : (context?.isEditMode ? 'Далее' : 'Далее'))
      )
    );
  }

  // Тон карточки по вредности: мягкий акцент слева + fade в базовый фон.
  function getHarmToneStyle(h, options = {}) {
    if (h == null) return null;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const strong = !!options.strong;
    const surface = options.surface || 'default';
    const premiumSurface = surface === 'aps' || surface === 'hero';

    let accent = '#60a5fa';
    let edge = isDark ? 'rgba(96, 165, 250, 0.18)' : 'rgba(59, 130, 246, 0.14)';
    let wash = isDark ? 'rgba(96, 165, 250, 0.07)' : 'rgba(59, 130, 246, 0.06)';
    let border = isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(59, 130, 246, 0.16)';

    if (h <= 2) {
      accent = isDark ? '#34d399' : '#10b981';
      edge = isDark ? 'rgba(52, 211, 153, 0.16)' : 'rgba(16, 185, 129, 0.11)';
      wash = isDark ? 'rgba(52, 211, 153, 0.05)' : 'rgba(16, 185, 129, 0.04)';
      border = isDark ? 'rgba(52, 211, 153, 0.18)' : 'rgba(16, 185, 129, 0.12)';
    } else if (h <= 4) {
      accent = isDark ? '#4ade80' : '#22c55e';
      edge = isDark ? 'rgba(74, 222, 128, 0.14)' : 'rgba(34, 197, 94, 0.09)';
      wash = isDark ? 'rgba(74, 222, 128, 0.045)' : 'rgba(34, 197, 94, 0.035)';
      border = isDark ? 'rgba(74, 222, 128, 0.16)' : 'rgba(34, 197, 94, 0.11)';
    } else if (h <= 6) {
      accent = isDark ? '#60a5fa' : '#3b82f6';
      edge = isDark ? 'rgba(96, 165, 250, 0.19)' : 'rgba(59, 130, 246, 0.13)';
      wash = isDark ? 'rgba(96, 165, 250, 0.07)' : 'rgba(59, 130, 246, 0.05)';
      border = isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(59, 130, 246, 0.15)';
    } else if (h <= 8) {
      accent = isDark ? '#fb7185' : '#ef4444';
      edge = isDark ? 'rgba(251, 113, 133, 0.18)' : 'rgba(239, 68, 68, 0.12)';
      wash = isDark ? 'rgba(251, 113, 133, 0.07)' : 'rgba(239, 68, 68, 0.05)';
      border = isDark ? 'rgba(251, 113, 133, 0.22)' : 'rgba(239, 68, 68, 0.15)';
    } else {
      accent = isDark ? '#f87171' : '#ef4444';
      edge = isDark ? 'rgba(248, 113, 113, 0.24)' : 'rgba(239, 68, 68, 0.17)';
      wash = isDark ? 'rgba(248, 113, 113, 0.10)' : 'rgba(239, 68, 68, 0.07)';
      border = isDark ? 'rgba(248, 113, 113, 0.26)' : 'rgba(239, 68, 68, 0.18)';
    }

    const boostAlpha = (rgbaValue, extra) => rgbaValue.replace(/0\.(\d+)/, (_, d) => `0.${Math.min(99, Number(d) + extra)}`);
    const toneEdge = strong ? boostAlpha(edge, 6) : edge;
    const toneWash = strong ? boostAlpha(wash, 4) : wash;
    const toneBorder = strong ? boostAlpha(border, 4) : border;
    const premiumBorder = premiumSurface ? boostAlpha(toneBorder, 2) : toneBorder;
    const topSheen = premiumSurface
      ? (isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.78)')
      : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.65)');
    const dangerGlow = h > 6
      ? `, radial-gradient(circle at 100% 0%, ${isDark ? (h > 8 ? 'rgba(248, 113, 113, 0.16)' : 'rgba(251, 113, 133, 0.12)') : (h > 8 ? 'rgba(239, 68, 68, 0.10)' : 'rgba(244, 63, 94, 0.08)')} 0%, rgba(255, 255, 255, 0) 56%)`
      : '';
    const outerShadow = premiumSurface
      ? (isDark ? '0 10px 24px rgba(15, 23, 42, 0.24)' : '0 8px 18px rgba(15, 23, 42, 0.08)')
      : 'none';

    return {
      backgroundColor: isDark ? 'var(--heys-bg-card)' : '#ffffff',
      backgroundImage: `linear-gradient(90deg, ${toneEdge} 0%, ${toneWash} 18%, rgba(255, 255, 255, 0) 42%)${dangerGlow}, linear-gradient(180deg, ${topSheen} 0%, rgba(255, 255, 255, 0) 72%)`,
      borderColor: premiumBorder,
      boxShadow: `inset 3px 0 0 ${accent}${premiumSurface ? `, ${outerShadow}` : ''}`,
    };
  }

  // Иконка категории (копия из heys_day_v12.js)
  function getCategoryIcon(cat) {
    if (!cat) return '🍽️';
    const c = cat.toLowerCase();
    if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
    if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
    if (c.includes('рыб') || c.includes('морепр')) return '🐟';
    if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
    if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
    if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
    if (c.includes('яйц')) return '🥚';
    if (c.includes('орех') || c.includes('семеч')) return '🥜';
    if (c.includes('масл')) return '🫒';
    if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
    if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
    if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
    return '🍽️';
  }

  // === Очередь повторной отправки заявки в общую базу («Сохранить только себе», хвост) ===
  // Продукт уже сохранён локально (upsertLocalProduct/commitPersonalProduct) —
  // очередь отвечает только за обогащение общей базы модерацией.
  // Решения зафиксированы в ADD_FOOD_FLOW_AUDIT_2026-08-09.md § «Два хвоста в
  // данных»: минимальный интервал между попытками (не расписание), 5 попыток,
  // идемпотентность по id продукта, exists/invalid_session — как при первой
  // попытке, продукт удалён локально — заявка выбрасывается молча.
  const PENDING_PRODUCT_QUEUE_KEY = 'heys_pending_product_retry_queue_v1';
  // 1мин / 5мин / 30мин / 2ч / 12ч — минимальный интервал перед следующей из
  // пяти попыток, отсчитывается от последней попытки.
  const PENDING_PRODUCT_RETRY_INTERVALS_MS = [60000, 300000, 1800000, 7200000, 43200000];
  const PENDING_PRODUCT_MAX_ATTEMPTS = PENDING_PRODUCT_RETRY_INTERVALS_MS.length;

  const readPendingProductQueue = () => {
    const raw = readGlobalValue(PENDING_PRODUCT_QUEUE_KEY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  };

  const writePendingProductQueue = (queue) => {
    writeRawValue(PENDING_PRODUCT_QUEUE_KEY, queue);
  };

  const pendingProductQueueListeners = new Set();
  const notifyPendingProductQueueChanged = () => {
    pendingProductQueueListeners.forEach((cb) => { try { cb(); } catch (_) { /* noop */ } });
    try { window.dispatchEvent(new CustomEvent('heys:pending-product-queue-changed')); } catch (_) { /* noop */ }
  };

  const isLocalProductStillPresent = (productId) => {
    try {
      const U = HEYS.utils || {};
      const list = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
      return Array.isArray(list) && list.some((p) => String(p?.id) === String(productId));
    } catch (_) {
      return true; // при неопределённости не выбрасываем заявку молча
    }
  };

  // Ставит заявку в очередь (или обновляет её, если уже там — идемпотентно по id).
  const enqueuePendingProductRetry = (clientId, product) => {
    if (!product?.id) return;
    const queue = readPendingProductQueue();
    const existing = queue[product.id];
    queue[product.id] = {
      id: product.id,
      clientId: clientId || existing?.clientId || null,
      product,
      attempts: existing?.attempts || 0,
      createdAt: existing?.createdAt || Date.now(),
      lastAttemptAt: existing?.lastAttemptAt || Date.now(),
      exhausted: false
    };
    writePendingProductQueue(queue);
    notifyPendingProductQueueChanged();
  };

  const getPendingProductRetryState = (productId) => {
    const entry = readPendingProductQueue()[productId];
    if (!entry) return null;
    return { exhausted: !!entry.exhausted, attempts: entry.attempts };
  };

  const CLIENT_ID_MISSING_MSG = 'clientId отсутствует';

  // Один сетевой заход по записи очереди. Возвращает 'ok' | 'exhausted' | 'kept'.
  const attemptPendingProductQueueEntry = async (queue, entry) => {
    if (!HEYS.cloud?.createPendingProduct) return 'kept';
    let result;
    try {
      result = await HEYS.cloud.createPendingProduct(entry.clientId, entry.product);
    } catch (err) {
      result = { status: 'error', error: err };
    }
    const status = result?.status;
    if (status === 'pending' || status === 'pending_dup') {
      delete queue[entry.id];
      try { window.dispatchEvent(new CustomEvent('heys:pending-product-created')); } catch (_) { /* noop */ }
      notifyPendingProductsUpdatedForAddStep();
      return 'ok';
    }
    if (status === 'exists') {
      // локальный продукт уже стоит в приёмах — не трогаем, заявка просто закрыта
      delete queue[entry.id];
      return 'ok';
    }
    const msg = result?.message || (typeof result?.error === 'string' ? result.error : (result?.error?.message || ''));
    if (status === 'invalid_session' || /invalid_session|No session token|Нет активной сессии/i.test(String(msg))) {
      delete queue[entry.id];
      try { HEYS.Auth?.requestPinReentry?.(); } catch (_) { /* noop */ }
      return 'exhausted';
    }
    if (String(msg).includes(CLIENT_ID_MISSING_MSG)) {
      // без clientId повтор бессмыслен так же, как и первая попытка — не копим
      delete queue[entry.id];
      return 'exhausted';
    }
    entry.attempts += 1;
    entry.lastAttemptAt = Date.now();
    if (entry.attempts >= PENDING_PRODUCT_MAX_ATTEMPTS) {
      entry.exhausted = true;
      queue[entry.id] = entry;
      return 'exhausted';
    }
    queue[entry.id] = entry;
    return 'kept';
  };

  let pendingProductQueueProcessing = false;
  // Повтор по сети/открытию приложения — не по таймеру (решение зафиксировано).
  const processPendingProductQueue = async () => {
    if (pendingProductQueueProcessing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    pendingProductQueueProcessing = true;
    try {
      const queue = readPendingProductQueue();
      const now = Date.now();
      let changed = false;
      for (const productId of Object.keys(queue)) {
        const entry = queue[productId];
        if (!entry || entry.exhausted) continue;
        if (!isLocalProductStillPresent(productId)) {
          delete queue[productId];
          changed = true;
          continue;
        }
        const minGap = PENDING_PRODUCT_RETRY_INTERVALS_MS[entry.attempts] ?? Infinity;
        const elapsed = now - (entry.lastAttemptAt || entry.createdAt || 0);
        if (elapsed < minGap) continue;
        await attemptPendingProductQueueEntry(queue, entry);
        changed = true;
      }
      if (changed) writePendingProductQueue(queue);
    } finally {
      pendingProductQueueProcessing = false;
      notifyPendingProductQueueChanged();
    }
  };

  // Ручной повтор из состояния «в общую базу не отправлено» — обходит паузу,
  // но саму попытку и её результат считает как обычную (может снова исчерпаться).
  const retryPendingProductNow = async (productId) => {
    const queue = readPendingProductQueue();
    const entry = queue[productId];
    if (!entry) return { ok: false, reason: 'not_found' };
    if (!isLocalProductStillPresent(productId)) {
      delete queue[productId];
      writePendingProductQueue(queue);
      notifyPendingProductQueueChanged();
      return { ok: false, reason: 'product_removed' };
    }
    entry.exhausted = false;
    const outcome = await attemptPendingProductQueueEntry(queue, entry);
    writePendingProductQueue(queue);
    notifyPendingProductQueueChanged();
    return { ok: outcome === 'ok', exhausted: outcome === 'exhausted' };
  };

  if (typeof window !== 'undefined' && !HEYS.__pendingProductQueueWired) {
    HEYS.__pendingProductQueueWired = true;
    window.addEventListener('online', () => { processPendingProductQueue(); });
    const kickoff = () => { processPendingProductQueue(); };
    if (document.readyState === 'complete') setTimeout(kickoff, 1500);
    else window.addEventListener('load', () => setTimeout(kickoff, 1500));
  }

  HEYS.pendingProductQueue = {
    getState: getPendingProductRetryState,
    retryNow: retryPendingProductNow,
    subscribe(cb) {
      if (typeof cb !== 'function') return () => { };
      pendingProductQueueListeners.add(cb);
      return () => pendingProductQueueListeners.delete(cb);
    }
  };

  // === Исходы модерации и отказ сохранения (prompt-food шаг 2) ===
  const APS_MODERATION_OUTCOME_META = {
    pending: { kind: 'ok', message: 'Продукт сохранён, заявка ушла куратору' },
    exists: { kind: 'ok', message: 'Такой продукт уже есть в общей базе — заявка не нужна' },
    pending_dup: { kind: 'neutral', message: 'Такая заявка уже на проверке' },
    offline: {
      kind: 'warn',
      title: 'Продукт сохранён, но заявка не ушла',
      message: 'Он уже ваш и работает. Заявку можно отправить позже — со шага вредности.'
    },
    invalid_session: {
      kind: 'warn',
      title: 'Нужно войти заново',
      message: 'Сессия истекла. Введите PIN — продукт и заявка сохранятся.',
      pinAction: true
    }
  };

  const renderApsOutcomeIcon = (kind) => {
    const stroke = kind === 'ok'
      ? 'var(--v4-sand-ok-fill, #7a8a5e)'
      : 'var(--v4-ink-3, rgba(0,0,0,.45))';
    if (kind === 'ok') {
      return React.createElement('svg', {
        className: 'aps-v4-outcome__icon',
        width: 17,
        height: 17,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke,
        strokeWidth: 3.2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true
      }, React.createElement('path', { d: 'M5 13l4 4L19 7' }));
    }
    return React.createElement('svg', {
      className: 'aps-v4-outcome__icon',
      width: 17,
      height: 17,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke,
      strokeWidth: 2.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true
    },
      React.createElement('circle', { cx: 12, cy: 12, r: 8.5 }),
      React.createElement('path', { d: 'M12 8v5M12 16h.01' })
    );
  };

  function ProductModerationOutcomeView({ outcomeKey, onContinue, onEnterPin, busy }) {
    const meta = APS_MODERATION_OUTCOME_META[outcomeKey];
    if (!meta) return null;
    const e = React.createElement;
    if (meta.kind === 'warn') {
      return e('div', { className: 'aps-v4-step', role: 'status', 'aria-live': 'polite' },
        e('div', { className: 'aps-v4-outcome aps-v4-outcome--warn' },
          e('div', { className: 'aps-v4-outcome__warn-title' }, meta.title),
          e('div', { className: 'aps-v4-outcome__warn-body' }, meta.message),
          meta.pinAction && e('button', {
            type: 'button',
            className: 'aps-v4-btn-pin',
            onClick: onEnterPin,
            disabled: !!busy
          }, 'Ввести PIN')
        ),
        !meta.pinAction && e('div', { className: 'aps-v4-footer' },
          e('button', {
            type: 'button',
            className: 'aps-v4-btn-primary',
            onClick: onContinue,
            disabled: !!busy
          }, 'Продолжить')
        )
      );
    }
    return e('div', { className: 'aps-v4-step', role: 'status', 'aria-live': 'polite' },
      e('div', { className: `aps-v4-outcome aps-v4-outcome--${meta.kind}` },
        renderApsOutcomeIcon(meta.kind),
        e('span', { className: 'aps-v4-outcome__text' }, meta.message)
      ),
      e('div', { className: 'aps-v4-footer' },
        e('button', {
          type: 'button',
          className: 'aps-v4-btn-primary',
          onClick: onContinue,
          disabled: !!busy
        }, 'Продолжить')
      )
    );
  }

  // Компактная плашка «в общую базу не отправлено» на самом продукте
  // (дневник/список продуктов) — после исчерпания 5 попыток очереди.
  // Живёт своей жизнью: сама подписывается на очередь, дневнику достаточно
  // отрендерить <HEYS.pendingProductQueue.NotSentChip productId={p.id} />.
  function PendingProductNotSentChip({ productId }) {
    if (!productId) return null;
    const e = React.createElement;
    const [state, setState] = useState(() => getPendingProductRetryState(productId));
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      setState(getPendingProductRetryState(productId));
      const unsubscribe = HEYS.pendingProductQueue.subscribe(() => {
        setState(getPendingProductRetryState(productId));
      });
      return unsubscribe;
    }, [productId]);
    if (!state?.exhausted) return null;
    const handleRetry = async () => {
      if (busy) return;
      setBusy(true);
      try { await retryPendingProductNow(productId); } finally { setBusy(false); }
    };
    return e('span', { className: 'aps-v4-notsent-chip' },
      'в общую базу не отправлено',
      e('button', {
        type: 'button',
        className: 'aps-v4-notsent-chip__retry',
        onClick: handleRetry,
        disabled: busy
      }, busy ? 'отправляю…' : 'отправить заявку')
    );
  }

  HEYS.pendingProductQueue.NotSentChip = PendingProductNotSentChip;

  function ProductCommitErrorView({ onRetry, onSaveLocalOnly, busy }) {
    const e = React.createElement;
    return e('div', { className: 'aps-v4-step', role: 'alert' },
      e('div', { className: 'aps-v4-error-hero' },
        e('div', { className: 'aps-v4-error-hero__title' }, 'Продукт не сохранён'),
        e('div', { className: 'aps-v4-error-hero__body' },
          'Нет связи с базой. Всё введённое на месте — заполнять заново ничего не нужно.')
      ),
      e('div', { className: 'aps-v4-tier' }, 'Что сохранено'),
      e('div', { className: 'aps-v4-card' },
        e('div', { className: 'aps-v4-card__row' },
          e('span', null, 'Название и бренд'),
          e('span', { className: 'aps-v4-card__value' }, 'на месте')
        ),
        e('div', { className: 'aps-v4-card__row' },
          e('span', null, 'Состав, 12 значений'),
          e('span', { className: 'aps-v4-card__value' }, 'на месте')
        ),
        e('div', { className: 'aps-v4-card__row' },
          e('span', null, 'Порции и вредность'),
          e('span', { className: 'aps-v4-card__value' }, 'на месте')
        )
      ),
      e('div', { className: 'aps-v4-footer' },
        e('button', {
          type: 'button',
          className: 'aps-v4-btn-primary',
          onClick: onRetry,
          disabled: !!busy
        }, 'Повторить'),
        e('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost',
          onClick: onSaveLocalOnly,
          disabled: !!busy
        }, 'Сохранить только себе')
      )
    );
  }

  function ApsExitDialog({ summary, onStay, onLeave }) {
    const e = React.createElement;
    return e(React.Fragment, null,
      e('div', { className: 'aps-v4-exit-backdrop', onClick: onStay }),
      e('div', { className: 'aps-v4-exit-dialog', role: 'dialog', 'aria-modal': 'true' },
        e('div', { className: 'aps-v4-exit-dialog__title' }, 'Выйти и потерять выбор?'),
        e('div', { className: 'aps-v4-exit-dialog__body' }, summary || 'Черновик не сохраняется.'),
        e('button', {
          type: 'button',
          className: 'aps-v4-btn-primary aps-v4-exit-dialog__stay',
          onClick: onStay
        }, 'Остаться'),
        e('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost aps-v4-exit-dialog__leave',
          onClick: onLeave
        }, 'Выйти без сохранения')
      )
    );
  }

  const hasApsDraftToLose = (stepData, data, context) => {
    const grams = data?.grams ?? stepData?.grams?.grams ?? stepData?.create?.grams ?? context?.editGrams;
    const hasGrams = Number.isFinite(+grams) && +grams > 0 && +grams !== 100;
    const hasProduct = !!(
      data?.selectedProduct
      || stepData?.search?.selectedProduct
      || stepData?.create?.selectedProduct
      || stepData?.create?.newProduct
      || stepData?.grams?.selectedProduct
      || context?.editProduct
    );
    return hasProduct || hasGrams;
  };

  function useApsCloseGuard(ref, requestCloseModal) {
    useEffect(() => {
      if (!ref) return undefined;
      ref.current = requestCloseModal;
      return () => {
        if (ref.current === requestCloseModal) ref.current = null;
      };
    }, [ref, requestCloseModal]);
  }

  function renderApsCreateDots(activeStep) {
    const e = React.createElement;
    return e('div', { className: 'aps-v4-create-dots', 'aria-hidden': 'true' },
      [0, 1, 2].map((stepIndex) => e('span', {
        key: stepIndex,
        className: 'aps-v4-create-dot' + (activeStep === stepIndex ? ' is-active' : '')
      }))
    );
  }

  function renderApsSearchEmptyState(state, handlers = {}) {
    const e = React.createElement;
    const tierBlock = handlers.tierItems?.length
      ? e('div', { className: 'aps-v4-search-state__tier' }, 'Доступно сейчас',
        e('div', { className: 'aps-v4-search-state__tier-list' },
          handlers.tierItems.map((line, index) => e('div', { key: index }, line))))
      : null;

    if (state === 'offline') {
      return e('div', { className: 'aps-v4-search-offline-card', role: 'status' },
        e('div', { className: 'aps-v4-search-offline-card__title' }, 'Нет сети'),
        e('div', { className: 'aps-v4-search-offline-card__body' },
          'Общая база недоступна. Личные продукты, наборы и уже загруженные позиции работают. Приём сохранится локально и уйдёт в облако, когда связь вернётся.'),
        e('div', { className: 'aps-v4-search-state__tier-list', style: { marginTop: '12px' } },
          e('div', null, '✓ Личные продукты и наборы'),
          e('div', null, '✓ Уже загруженные общие продукты'),
          e('div', null, '✗ Поиск по общей базе'))
      );
    }
    if (state === 'empty_base') {
      return e('div', { className: 'aps-v4-search-state' },
        e('div', { className: 'aps-v4-search-state__title' }, 'Личная база пока пуста'),
        e('div', { className: 'aps-v4-search-state__body' },
          'Создайте первый продукт или найдите его в общей базе — так быстрее добавлять еду в приём.'),
        e('div', { className: 'aps-v4-search-state__actions' },
          handlers.onSearchShared && e('button', {
            type: 'button',
            className: 'aps-v4-btn-primary',
            onClick: handlers.onSearchShared
          }, 'Искать в общей базе'),
          handlers.onCreate && e('button', {
            type: 'button',
            className: 'aps-v4-btn-ghost aps-v4-btn-paper',
            onClick: handlers.onCreate
          }, 'Создать продукт')),
        tierBlock || e('div', { className: 'aps-v4-search-state__tier-list', style: { marginTop: '14px' } },
          e('div', null, '✓ Общая база'),
          e('div', null, '✓ Создание продукта'))
      );
    }
    if (state === 'load_failed') {
      return e('div', { className: 'aps-v4-search-state aps-v4-search-state--warn' },
        e('div', { className: 'aps-v4-search-state__title' }, 'База не загрузилась'),
        e('div', { className: 'aps-v4-search-state__body' },
          'Проверьте сеть и попробуйте ещё раз. Пока можно искать только среди уже загруженных продуктов.'),
        e('div', { className: 'aps-v4-search-state__actions' },
          handlers.onRetry && e('button', {
            type: 'button',
            className: 'aps-v4-btn-primary',
            onClick: handlers.onRetry
          }, 'Повторить'),
          handlers.onCreate && e('button', {
            type: 'button',
            className: 'aps-v4-btn-ghost aps-v4-btn-paper',
            onClick: handlers.onCreate
          }, 'Создать продукт')),
        tierBlock || e('div', { className: 'aps-v4-search-state__tier-list', style: { marginTop: '14px' } },
          e('div', null, '✓ Личные продукты из кэша'),
          e('div', null, '✗ Свежая общая база'))
      );
    }
    if (state === 'no_results') {
      return e('div', { className: 'aps-v4-search-state' },
        e('div', { className: 'aps-v4-search-state__title' }, 'Ничего не найдено'),
        e('div', { className: 'aps-v4-search-state__body' },
          'Попробуйте другое название или создайте продукт вручную.'),
        Array.isArray(handlers.similarProducts) && handlers.similarProducts.length > 0 && e('div', { className: 'aps-v4-search-state__similar' },
          e('div', { className: 'aps-v4-search-state__similar-title' }, 'Близкое по названию'),
          e('div', { className: 'aps-v4-search-state__similar-list' },
            handlers.similarProducts.map((product) => e('button', {
              key: String(product.id ?? product.product_id ?? product.name),
              type: 'button',
              className: 'aps-v4-btn-ghost aps-v4-btn-paper',
              onClick: () => handlers.onPickSimilar?.(product)
            }, product.name)))),
        handlers.onCreate && e('button', {
          type: 'button',
          className: 'aps-v4-btn-primary',
          style: { marginTop: '12px' },
          onClick: handlers.onCreate
        }, handlers.createLabel || 'Создать продукт')
      );
    }
    return null;
  }

  async function publishProductModerationOutcome(updatedProduct, { publishToShared, isCurator } = {}) {
    if (!publishToShared || !updatedProduct) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enqueuePendingProductRetry(readGlobalValue('heys_client_current', null), updatedProduct);
      return 'offline';
    }

    let fingerprint = null;
    let brandFingerprint = null;
    if (HEYS.models?.computeProductFingerprint) {
      try { fingerprint = await HEYS.models.computeProductFingerprint(updatedProduct); } catch (_) { /* noop */ }
      try {
        if (normalizeProductBrand(updatedProduct.brand) && HEYS.models.computeProductBrandFingerprint) {
          brandFingerprint = await HEYS.models.computeProductBrandFingerprint(updatedProduct);
        }
      } catch (_) { /* noop */ }
      const barcode = getProductBarcode(updatedProduct);
      if (barcode && HEYS.cloud?.searchSharedProducts) {
        try {
          const existing = await HEYS.cloud.searchSharedProducts('', { barcode, limit: 1 });
          if (existing?.data?.length > 0) return 'exists';
        } catch (_) { /* barcode check best-effort */ }
      }
      const fingerprintQuery = brandFingerprint
        ? { brandFingerprint, limit: 1 }
        : (/^[a-f0-9]{64}$/i.test(String(fingerprint || '')) ? { fingerprint, limit: 1 } : null);
      if (fingerprintQuery && HEYS.cloud?.searchSharedProducts) {
        try {
          const existing = await HEYS.cloud.searchSharedProducts('', fingerprintQuery);
          if (existing?.data?.length > 0) {
            return 'exists';
          }
        } catch (_) { /* fingerprint check best-effort */ }
      }
    }

    if (isCurator && HEYS.cloud?.publishToShared) {
      const result = await HEYS.cloud.publishToShared(updatedProduct);
      if (result && result.status === 'exists') return 'exists';
      if (result && (result.error || result.status === 'error')) {
        const msg = result.message || (typeof result.error === 'string' ? result.error : (result.error?.message || 'неизвестная ошибка'));
        throw new Error(msg);
      }
      return null;
    }

    if (!HEYS.cloud?.createPendingProduct) return null;

    const clientId = readGlobalValue('heys_client_current', null);
    if (typeof clientId !== 'string' || !clientId.trim()) {
      throw new Error('clientId отсутствует');
    }

    const result = await HEYS.cloud.createPendingProduct(clientId, updatedProduct);
    const status = result?.status;
    if (status === 'pending') {
      try { window.dispatchEvent(new CustomEvent('heys:pending-product-created')); } catch (_) { /* noop */ }
      try {
        const bc = new BroadcastChannel('heys_pending_products');
        const _ownerCid = (HEYS.cloud && typeof HEYS.cloud.getCurrentClientId === 'function')
          ? HEYS.cloud.getCurrentClientId()
          : (window.HEYS && window.HEYS.currentClientId) || null;
        bc.postMessage({ type: 'pending-created', clientId: _ownerCid, at: Date.now() });
        setTimeout(() => { try { bc.close(); } catch (_) { /* noop */ } }, 200);
      } catch (_) { /* noop */ }
      notifyPendingProductsUpdatedForAddStep();
      return 'pending';
    }
    if (status === 'exists') return 'exists';
    if (status === 'pending_dup') return 'pending_dup';
    if (status === 'error' || result?.error) {
      const msg = result?.message || (typeof result?.error === 'string' ? result.error : (result?.error?.message || 'неизвестная ошибка'));
      if (/invalid_session|No session token|Нет активной сессии/i.test(String(msg))) {
        return 'invalid_session';
      }
      throw new Error(msg);
    }
    if (!status) {
      throw new Error(result?.message || 'Неизвестный ответ сервера при отправке заявки');
    }
    return null;
  }

  // === Компонент выбора Harm Score (Шаг harm) — минималистичный UI ===
  function HarmSelectStep({ data, onChange, context, stepData }) {
    const e = React.createElement;

    // Продукт из предыдущего шага create
    const product = stepData?.create?.newProduct
      || stepData?.portions?.product
      || stepData?.harm?.product
      || data?.newProduct
      || data?.product
      || data?.selectedProduct;

    // Вычисленный системой harm
    const calculatedBreakdown = useMemo(() => {
      if (!product) return null;
      if (HEYS.Harm?.getHarmBreakdown) {
        return HEYS.Harm.getHarmBreakdown(product);
      }
      return null;
    }, [product]);

    const calculatedHarm = calculatedBreakdown?.score ?? null;

    // Введённый вручную harm (из paste-данных)
    const manualHarmRef = useRef(null);
    if (manualHarmRef.current == null) {
      manualHarmRef.current = HEYS.models?.normalizeHarm?.(product)
        ?? Number(product?.harm ?? product?.harmScore ?? product?.harmscore ?? product?.harm100 ?? NaN);
    }
    const manualHarm = manualHarmRef.current;
    const hasManualHarm = Number.isFinite(manualHarm);

    // Текущий выбранный harm
    const [selectedHarm, setSelectedHarm] = useState(() => {
      const safeManual = Number.isFinite(manualHarm) ? manualHarm : null;
      // По умолчанию — вычисленный системой
      return calculatedHarm ?? safeManual ?? 5;
    });

    // Режим кастомного ввода
    const [showCustom, setShowCustom] = useState(false);

    // Показывать ли breakdown
    const [showBreakdown, setShowBreakdown] = useState(true);

    // 🛡 Anti-double-fire: блокирует повторный запуск публикации при двойном тапе.
    const isProcessingPublishRef = useRef(false);
    const [publishBusy, setPublishBusy] = useState(false);
    const [moderationOutcome, setModerationOutcome] = useState(null);
    const [commitError, setCommitError] = useState(null);
    const pendingHarmRef = useRef(null);

    // WheelPicker для кастомного значения
    const WheelPicker = HEYS.StepModal?.WheelPicker;

    // Категория для текущего выбора
    const selectedCategory = useMemo(() => {
      return HEYS.Harm?.getHarmCategory?.(selectedHarm) || { name: '—', color: '#6b7280', emoji: '❓' };
    }, [selectedHarm]);

    // Навигация
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;
    const [exitPromptOpen, setExitPromptOpen] = useState(false);

    const closeFlow = useCallback(() => {
      context?.onClose?.();
    }, [context]);

    const requestCloseModal = useCallback(() => {
      if (hasApsDraftToLose(stepData, data, context)) {
        setExitPromptOpen(true);
        return;
      }
      closeFlow();
    }, [closeFlow, stepData, data, context]);

    const confirmExitModal = useCallback(() => {
      setExitPromptOpen(false);
      closeFlow();
    }, [closeFlow]);

    useApsCloseGuard(context?.apsCloseGuardRef, requestCloseModal);

    const [harmSourceMode, setHarmSourceMode] = useState('system');
    const createMode = stepData?.create?.mode || 'persist';
    const publishToShared = stepData?.create?.publishToShared ?? true;
    const systemHarmValue = calculatedHarm ?? (hasManualHarm ? manualHarm : selectedHarm);
    const systemCategory = useMemo(() => {
      return HEYS.Harm?.getHarmCategory?.(systemHarmValue) || { name: '—', color: '#5c6a45', emoji: '' };
    }, [systemHarmValue]);

    const commitHarm = useMemo(() => {
      if (harmSourceMode === 'system') return systemHarmValue;
      if (showCustom) return selectedHarm;
      if (hasManualHarm) return manualHarm;
      return selectedHarm;
    }, [harmSourceMode, systemHarmValue, showCustom, selectedHarm, hasManualHarm, manualHarm]);

    // Похожие продукты в личном списке — мягкое предупреждение перед сохранением.
    // Только для новых продуктов: у разового и при редактировании существующего
    // дубль не появляется.
    const [similarDismissed, setSimilarDismissed] = useState(false);
    const similarProducts = useMemo(() => {
      if (!product || product._oneTime) return [];
      const list = HEYS.products?.getAll?.() || [];
      return findSimilarPersonalProducts(product.name, list, product.id);
    }, [product]);

    // Взять существующий продукт вместо создания нового: подставляем его в шаг
    // граммов и переходим туда — новый в базу не сохраняется.
    const useExistingProduct = useCallback((existing) => {
      haptic('light');
      updateStepData?.('grams', {
        selectedProduct: existing,
        grams: stepData?.create?.grams || 100
      });
      updateStepData?.('create', { ...stepData?.create, selectedProduct: existing });
      onChange?.({ ...(data || {}), selectedProduct: existing });
      setTimeout(() => goToStep?.(4, 'left'), 120);
    }, [updateStepData, stepData, onChange, data, goToStep]);

    // Обновляем данные при изменении выбора
    useEffect(() => {
      if (product && selectedHarm != null) {
        const updatedProduct = {
          ...product,
          harm: selectedHarm,
          harmManual: Number.isFinite(manualHarm) ? manualHarm : product?.harmManual
        };
        onChange({ ...data, selectedHarm, product: updatedProduct });

        // Также обновляем в create stepData
        if (updateStepData && stepData?.create) {
          updateStepData('create', {
            ...stepData.create,
            newProduct: updatedProduct
          });
        }
      }
    }, [selectedHarm]);

    // Выбрать вариант, СОХРАНИТЬ ПРОДУКТ и перейти дальше
	    const selectAndContinue = useCallback(async (harm, options = {}) => {
      const { retryLocalOnly = false } = options;
      haptic('light');
      setSelectedHarm(harm);
      pendingHarmRef.current = harm;
      setCommitError(null);
      setModerationOutcome(null);

      // Обновляем продукт с выбранным harm
      const updatedProduct = product ? {
        ...product,
        harm,
        harmManual: Number.isFinite(manualHarm) ? manualHarm : product?.harmManual
      } : null;

      if (updatedProduct && updateStepData) {
        updateStepData('create', {
          ...stepData?.create,
          newProduct: updatedProduct,
          selectedProduct: updatedProduct
        });
        updateStepData('grams', {
          selectedProduct: updatedProduct,
          grams: stepData?.create?.grams || 100
        });
      }

      const goToGramsStep = () => {
        setTimeout(() => goToStep?.(4, 'left'), 150);
      };

      // 🔐 СОХРАНЕНИЕ ПРОДУКТА В БАЗУ (перенесено из CreateProductStep)
      const isOneTime = !!(updatedProduct && updatedProduct._oneTime);
      if (updatedProduct && isOneTime && updatedProduct.id == null) {
        const uid = (HEYS.utils && HEYS.utils.uid) || ((prefix = 'oneoff_') => prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
        updatedProduct.id = uid('oneoff_');
        console.info('[HarmSelectStep] ⚡ One-time product (НЕ сохраняем в базу):', updatedProduct.name, 'id:', updatedProduct.id);
      }

      if (updatedProduct && !isOneTime) {
        if (publishBusy || isProcessingPublishRef.current) return;
        setPublishBusy(true);
        isProcessingPublishRef.current = true;

        try {
          const U = HEYS.utils || {};
          const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
          if (updatedProduct.id == null) {
            const uid = (HEYS.utils && HEYS.utils.uid) || ((prefix = 'p_') => prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
            updatedProduct.id = uid('p_');
          }

          const normName = (updatedProduct.name || '').trim().toLowerCase();
          const normBrand = normalizeProductBrand(updatedProduct.brand).toLowerCase();
          const existingPersonal = products.find(p =>
            (p.name || '').trim().toLowerCase() === normName
            && normalizeProductBrand(p.brand).toLowerCase() === normBrand
          );

          let commit;
          if (retryLocalOnly) {
            const localSave = upsertLocalProduct(updatedProduct, true);
            commit = {
              ok: !!localSave.product,
              product: localSave.product || updatedProduct,
              reason: localSave.overlaySaved ? 'overlay_saved' : 'local_only'
            };
            if (commit.ok) {
              Object.assign(updatedProduct, commit.product || {});
              if (updateStepData) {
                updateStepData('create', {
                  ...stepData?.create,
                  newProduct: updatedProduct,
                  selectedProduct: updatedProduct
                });
                updateStepData('grams', {
                  ...(stepData?.grams || {}),
                  selectedProduct: updatedProduct,
                  grams: stepData?.create?.grams || stepData?.grams?.grams || 100
                });
              }
              goToGramsStep();
              return;
            }
          } else if (!existingPersonal) {
            if (HEYS.deletedProducts?.remove) {
              HEYS.deletedProducts.remove(updatedProduct.name, updatedProduct.id);
            }
            commit = await commitPersonalProduct(updatedProduct, true, 'harm-select-add');
          } else {
            console.log('[HarmSelectStep] ⚠️ Продукт уже есть в базе:', existingPersonal.name);
            updatedProduct.id = existingPersonal.id;
            updatedProduct.updatedAt = Date.now();
            commit = await commitPersonalProduct(updatedProduct, true, 'harm-select-update');
          }

          if (!commit.ok) {
            setCommitError({ reason: commit.reason || 'product_save_failed', product: updatedProduct });
            try {
              window.HEYS?.eventLog?.write?.(
                'product-persist-blocked',
                `${updatedProduct.name || 'product'} blocked (${commit.reason || 'unknown'})`,
                { productId: updatedProduct.id, name: updatedProduct.name, reason: commit.reason },
                'harm-select'
              );
            } catch (_) { /* noop */ }
            return;
          }

          Object.assign(updatedProduct, commit.product || {});
          if (updateStepData) {
            updateStepData('create', {
              ...stepData?.create,
              newProduct: updatedProduct,
              selectedProduct: updatedProduct
            });
            updateStepData('grams', {
              ...(stepData?.grams || {}),
              selectedProduct: updatedProduct,
              grams: stepData?.create?.grams || stepData?.grams?.grams || 100
            });
          }
          console.info('[HarmSelectStep] ✅ Продукт сохранён в canonical overlay с cloud ack:', updatedProduct.name);
          try {
            window.HEYS?.eventLog?.write?.(
              'product-persist-ok',
              `${updatedProduct.name || 'product'} committed`,
              { productId: updatedProduct.id, name: updatedProduct.name },
              'harm-select'
            );
          } catch (_) { /* noop */ }

          if (HEYS.orphanProducts?.recalculate) {
            HEYS.orphanProducts.recalculate();
          }
          if (HEYS.orphanProducts?.remove && updatedProduct.name) {
            HEYS.orphanProducts.remove(updatedProduct.name);
          }

          const publishToShared = stepData?.create?.publishToShared ?? true;
          const isCurator = isCuratorUser();
          if (publishToShared) {
            try {
              const outcome = await publishProductModerationOutcome(updatedProduct, { publishToShared, isCurator });
              if (outcome) {
                setModerationOutcome(outcome);
                return;
              }
            } catch (publishErr) {
              console.error('[HarmSelectStep] ❌ Unexpected publish error:', publishErr);
              const msg = publishErr?.message || String(publishErr);
              if (/invalid_session|No session token|Нет активной сессии/i.test(msg)) {
                setModerationOutcome('invalid_session');
                return;
              }
              if (!msg.includes(CLIENT_ID_MISSING_MSG)) {
                enqueuePendingProductRetry(readGlobalValue('heys_client_current', null), updatedProduct);
              }
              setModerationOutcome('offline');
              return;
            }
          }
        } finally {
          setPublishBusy(false);
          isProcessingPublishRef.current = false;
        }
      }

      goToGramsStep();
    }, [product, stepData, updateStepData, goToStep, manualHarm, publishBusy]);

    // Значения для WheelPicker: 0, 0.5, 1, ... 10
    const wheelValues = useMemo(() => Array.from({ length: 21 }, (_, i) => i * 0.5), []);

    const continueAfterOutcome = useCallback(() => {
      haptic('light');
      setModerationOutcome(null);
      setTimeout(() => goToStep?.(4, 'left'), 120);
    }, [goToStep]);

    const handleEnterPin = useCallback(() => {
      haptic('light');
      try { HEYS.Auth?.requestPinReentry?.(); } catch (_) { /* noop */ }
    }, []);

    const handleCommitRetry = useCallback(() => {
      const harm = pendingHarmRef.current ?? selectedHarm;
      if (harm == null) return;
      selectAndContinue(harm);
    }, [selectAndContinue, selectedHarm]);

    const handleSaveLocalOnly = useCallback(() => {
      const harm = pendingHarmRef.current ?? selectedHarm;
      if (harm == null) return;
      selectAndContinue(harm, { retryLocalOnly: true });
    }, [selectAndContinue, selectedHarm]);

    if (!product) {
      return e('div', { className: 'flex items-center justify-center h-40 text-gray-400' },
        'Сначала создайте продукт'
      );
    }

    if (commitError) {
      return e(ProductCommitErrorView, {
        busy: publishBusy,
        onRetry: handleCommitRetry,
        onSaveLocalOnly: handleSaveLocalOnly
      });
    }

    if (moderationOutcome) {
      return e(ProductModerationOutcomeView, {
        outcomeKey: moderationOutcome,
        busy: publishBusy,
        onContinue: continueAfterOutcome,
        onEnterPin: handleEnterPin
      });
    }

    return e('div', { className: 'aps-v4-harm-step aps-v4-flow' },
      exitPromptOpen && e(ApsExitDialog, {
        summary: product?.name
          ? `${product.name} — продукт ещё не сохранён. Черновик не сохраняется.`
          : 'Черновик не сохраняется.',
        onStay: () => setExitPromptOpen(false),
        onLeave: confirmExitModal
      }),

      e('div', { className: 'aps-v4-create-shell' },
        e('div', { className: 'aps-v4-create-shell__title' }, 'Вредность'),
        renderApsCreateDots(2)
      ),

      e('div', { className: 'aps-v4-harm-product' }, product.name),

      similarProducts.length > 0 && !similarDismissed && e('div', { className: 'aps-similar-warn' },
        e('div', { className: 'aps-similar-warn__title' },
          similarProducts.length === 1 ? 'Похоже, такой продукт уже есть' : 'Похожие продукты уже есть'
        ),
        e('div', { className: 'aps-similar-warn__hint' },
          'Если это он — выберите его, чтобы одна и та же еда не считалась дважды.'
        ),
        e('div', { className: 'aps-similar-warn__list' },
          similarProducts.map((existing) => e('button', {
            key: existing.id,
            type: 'button',
            className: 'aps-similar-warn__item',
            onClick: () => useExistingProduct(existing)
          },
            e('span', { className: 'aps-similar-warn__name' }, existing.name),
            e('span', { className: 'aps-similar-warn__kcal' },
              Number.isFinite(+existing.kcal100) ? `${Math.round(+existing.kcal100)} ккал` : ''
            )
          ))
        ),
        e('button', {
          type: 'button',
          className: 'aps-similar-warn__dismiss',
          onClick: () => { haptic('light'); setSimilarDismissed(true); }
        }, 'Это другой продукт')
      ),

      calculatedHarm != null && e('div', { className: 'aps-v4-harm-calc-card' },
        e('div', { className: 'aps-v4-harm-calc-card__head' },
          e('span', { className: 'aps-v4-harm-calc-card__label' }, 'Расчёт системы'),
          e('span', { className: 'aps-v4-harm-calc-card__value' }, `${Number(systemHarmValue).toFixed(1)} из 10`)
        ),
        e('div', { className: 'aps-v4-harm-calc-card__category' }, systemCategory.name || '—')
      ),

      e('div', { className: 'aps-v4-harm-radio-group', role: 'radiogroup', 'aria-label': 'Выбор вредности' },
        e('label', { className: 'aps-v4-harm-radio' + (harmSourceMode === 'system' ? ' is-active' : '') },
          e('input', {
            type: 'radio',
            name: 'harmSourceMode',
            checked: harmSourceMode === 'system',
            onChange: () => { haptic('light'); setHarmSourceMode('system'); setShowCustom(false); }
          }),
          e('span', null, 'Оставить расчёт системы')
        ),
        e('label', { className: 'aps-v4-harm-radio' + (harmSourceMode === 'own' ? ' is-active' : '') },
          e('input', {
            type: 'radio',
            name: 'harmSourceMode',
            checked: harmSourceMode === 'own',
            onChange: () => {
              haptic('light');
              setHarmSourceMode('own');
              if (hasManualHarm) setSelectedHarm(manualHarm);
            }
          }),
          e('span', null, hasManualHarm ? 'Поставить свою оценку' : 'Указать своё значение')
        )
      ),

      harmSourceMode === 'own' && hasManualHarm && calculatedHarm != null
        && Math.abs(manualHarm - calculatedHarm) >= 0.5
        && e('div', { className: 'aps-v4-harm-diff' },
          Math.abs(manualHarm - calculatedHarm) >= 2
            ? `Разница ${Math.abs(manualHarm - calculatedHarm).toFixed(1)} — вставка и расчёт сильно расходятся`
            : `Разница ${Math.abs(manualHarm - calculatedHarm).toFixed(1)} между вставкой и расчётом`
        ),

      harmSourceMode === 'own' && e('button', {
        type: 'button',
        className: 'aps-v4-harm-custom-toggle',
        onClick: () => { setShowCustom(!showCustom); haptic('light'); }
      }, showCustom ? 'Скрыть шкалу' : 'Настроить на шкале'),

      harmSourceMode === 'own' && showCustom && WheelPicker && e('div', { className: 'aps-v4-harm-wheel' },
        e('div', { className: 'aps-v4-harm-wheel__picker' },
          e(WheelPicker, {
            values: wheelValues,
            value: selectedHarm,
            onChange: (v) => setSelectedHarm(v),
            height: 140,
            compact: true
          })
        ),
        e('div', { className: 'aps-v4-harm-wheel__value' },
          e('div', {
            className: 'aps-v4-harm-wheel__score',
            style: { color: selectedCategory.color }
          }, selectedHarm.toFixed(1)),
          e('div', {
            className: 'aps-v4-harm-wheel__label',
            style: { color: selectedCategory.color }
          }, selectedCategory.name)
        )
      ),

      calculatedBreakdown && e('button', {
        type: 'button',
        className: 'aps-v4-harm-breakdown-toggle',
        onClick: () => { setShowBreakdown(!showBreakdown); haptic('light'); }
      }, showBreakdown ? 'Скрыть расшифровку' : 'Как посчитано?'),

      showBreakdown && calculatedBreakdown && e('div', { className: 'aps-v4-harm-breakdown' },
        e('div', { className: 'aps-v4-harm-breakdown__formula' }, calculatedBreakdown.formula),
        e('div', { className: 'aps-v4-harm-breakdown__version' },
          `Формула v${calculatedBreakdown.version || '3.0'}`
        ),
        calculatedBreakdown.penalties.length > 0 && e('div', { className: 'aps-v4-harm-breakdown__section' },
          e('div', { className: 'aps-v4-harm-breakdown__section-title' }, 'Штрафы'),
          calculatedBreakdown.penalties.map((p, i) =>
            e('div', { key: i, className: 'aps-v4-harm-breakdown__row' },
              e('span', null, `${p.icon} ${p.label}`),
              e('span', null, `+${p.contribution.toFixed(2)}`)
            )
          )
        ),
        calculatedBreakdown.bonuses.length > 0 && e('div', { className: 'aps-v4-harm-breakdown__section' },
          e('div', { className: 'aps-v4-harm-breakdown__section-title' }, 'Бонусы'),
          calculatedBreakdown.bonuses.map((b, i) =>
            e('div', { key: i, className: 'aps-v4-harm-breakdown__row' },
              e('span', null, `${b.icon} ${b.label}`),
              e('span', null, `−${b.contribution.toFixed(2)}`)
            )
          )
        ),
        e('div', { className: 'aps-v4-harm-breakdown__nova' },
          `NOVA ${calculatedBreakdown.novaGroup}: ${calculatedBreakdown.novaGroup === 4 ? 'Ультрапереработанный' :
            calculatedBreakdown.novaGroup === 3 ? 'Переработанный' :
              calculatedBreakdown.novaGroup === 2 ? 'Ингредиент' : 'Необработанный'
          }`
        )
      ),

      createMode !== 'oneTime' && e('div', { className: 'aps-v4-search-state__tier' }, 'Куда попадёт продукт',
        e('div', { className: 'aps-v4-search-state__tier-list' },
          e('div', null, publishToShared ? '✓ Личная база и заявка в общую' : '✓ Только личная база'),
          e('div', null, publishToShared ? '○ После проверки куратором — в общей базе' : '✗ В общую базу не отправляем')
        )
      ),

      createMode === 'oneTime' && e('div', { className: 'aps-v4-search-state__tier' }, 'Куда попадёт продукт',
        e('div', { className: 'aps-v4-search-state__tier-list' },
          e('div', null, '✓ Только этот приём'),
          e('div', null, '✗ В личную базу не сохраняем')
        )
      ),

      e('div', { className: 'aps-v4-harm-scale-note' }, '0 = суперполезный · 10 = супервредный'),

      e('div', { className: 'aps-v4-footer' },
        e('button', {
          type: 'button',
          className: 'aps-v4-btn-primary',
          disabled: publishBusy,
          onClick: () => selectAndContinue(commitHarm)
        }, publishBusy ? 'Сохраняем…' : 'Сохранить продукт')
      )
    );
  }

  // === Компонент выбора граммов (Шаг 2) ===
  function GramsStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;
    const [exitPromptOpen, setExitPromptOpen] = useState(false);

    const closeFlow = useCallback(() => {
      context?.onClose?.();
    }, [context]);

    const requestCloseModal = useCallback(() => {
      if (hasApsDraftToLose(stepData, data, context)) {
        setExitPromptOpen(true);
        return;
      }
      closeFlow();
    }, [closeFlow, stepData, data, context]);

    const confirmExitModal = useCallback(() => {
      setExitPromptOpen(false);
      closeFlow();
    }, [closeFlow]);

    useApsCloseGuard(context?.apsCloseGuardRef, requestCloseModal);
    useEscapeToClose(requestCloseModal, true);
    // Продукт берём: 1) из context (для edit mode), 2) из своих данных, 3) из create (newProduct или selectedProduct), 4) из search
    // ВАЖНО: stepData?.create проверяется т.к. при создании нового продукта data.selectedProduct может не успеть обновиться
    const product = context?.editProduct
      || data.selectedProduct
      || stepData?.grams?.selectedProduct
      || stepData?.create?.newProduct
      || stepData?.create?.selectedProduct
      || stepData?.search?.selectedProduct;
    const lastGrams = stepData?.search?.lastGrams || stepData?.create?.lastGrams; // Последние использованные
    const grams = data.grams || context?.editGrams || stepData?.create?.grams || stepData?.search?.grams || 100;

    const gramsInputRef = useRef(null);

    // === ВСЕ ХУКИ ДОЛЖНЫ БЫТЬ ДО ЛЮБОГО RETURN ===
    const toNum = (v) => {
      if (v == null || v === '') return 0;
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const kcal100 = toNum(product?.kcal100);
    const protein100 = toNum(product?.protein100);
    const carbs100 = toNum(product?.simple100) + toNum(product?.complex100);
    const fat100 = toNum(product?.badFat100) + toNum(product?.goodFat100) + toNum(product?.trans100);
    const derivedKcal100 = kcal100 > 0
      ? kcal100
      : Math.round((3 * protein100 + 4 * carbs100 + 9 * fat100) * 10) / 10;

    // Расчёт на текущую порцию (safe with fallbacks)
    const currentKcal = Math.round(derivedKcal100 * grams / 100);
    const currentProt = Math.round(protein100 * grams / 100);
    const currentCarbs = Math.round(carbs100 * grams / 100);
    const currentFat = Math.round(fat100 * grams / 100);

    // === ВСЕ ХУКИ ДОЛЖНЫ БЫТЬ ДО ЛЮБОГО RETURN ===

    // Авто-порции продукта
    const defaultPortions = useMemo(() => {
      if (!product) return [{ name: '100г', grams: 100 }];
      if (product.portions && product.portions.length) {
        return product.portions;
      }
      // Авто-порции по названию (передаём строку, не объект!)
      return HEYS.models?.getAutoPortions?.(product.name) || [
        { name: '50г', grams: 50 },
        { name: '100г', grams: 100 },
        { name: '150г', grams: 150 },
        { name: '200г', grams: 200 }
      ];
    }, [product]);

    const [localPortions, setLocalPortions] = useState(defaultPortions);

    useEffect(() => {
      setLocalPortions(defaultPortions);
    }, [defaultPortions]);

    useEffect(() => {
      const handleProductUpdated = (event) => {
        const detail = event?.detail || {};
        const updatedProduct = detail.product;
        const updatedId = String(detail.productId ?? updatedProduct?.id ?? updatedProduct?.product_id ?? updatedProduct?.name);
        const updatedSharedId = String(detail.sharedId ?? updatedProduct?.shared_origin_id ?? updatedProduct?.sharedId ?? updatedProduct?._sharedId ?? '');

        const currentId = String(product?.id ?? product?.product_id ?? product?.name);
        const currentSharedId = String(resolveSharedProductId(product) ?? '');

        const isDirectMatch = !!updatedId && updatedId === currentId;
        const isSharedMatch = !!updatedSharedId && !!currentSharedId && updatedSharedId === currentSharedId;
        if (!isDirectMatch && !isSharedMatch) return;

        console.info('[HEYS.portions] 🔄 GramsStep update', {
          event: event?.type,
          match: isSharedMatch ? 'shared' : 'direct',
          updatedId,
          updatedSharedId: updatedSharedId || null,
          currentId,
          currentSharedId: currentSharedId || null
        });

        const nextPortions = Array.isArray(detail.portions)
          ? detail.portions
          : (updatedProduct?.portions || []);

        setLocalPortions(nextPortions);
        if (updatedProduct) {
          const mergedProduct = {
            ...product,
            ...updatedProduct,
            portions: nextPortions
          };

          if (isSharedMatch) {
            mergedProduct.shared_origin_id = resolveSharedProductId(product) || updatedProduct?.shared_origin_id || updatedProduct?.sharedId || mergedProduct.shared_origin_id;
            if (product?.id != null) {
              mergedProduct.id = product.id;
            }
          }

          onChange({ ...data, selectedProduct: mergedProduct });
        }
      };

      window.addEventListener('heys:product-portions-updated', handleProductUpdated);
      window.addEventListener('heys:product-updated', handleProductUpdated);
      return () => {
        window.removeEventListener('heys:product-portions-updated', handleProductUpdated);
        window.removeEventListener('heys:product-updated', handleProductUpdated);
      };
    }, [product, data, onChange]);

    // Обновление граммов
    const setGrams = useCallback((newGrams) => {
      const val = Math.max(1, Math.min(2000, Number(newGrams) || 100));
      // Debug: log only if value doesn't change as expected
      if (data?.grams && data.grams !== val && Math.abs(data.grams - val) > 1) {
        console.warn('[GramsStep] ⚠️ Unexpected grams change:', { from: data.grams, to: val, input: newGrams });
      }
      onChange({ ...data, grams: val });
    }, [data, onChange]);

    const handleSubmit = useCallback(() => {
      // 🔬 [HEYS.day-trace] 0/8 button click — green «✓ Добавить» pressed in GramsStep modal.
      try {
        logDayTrace('[HEYS.day-trace] 0/8 GramsStep button click', {
          hasProduct: !!product,
          grams,
          mealIndex: context?.mealIndex ?? null,
          mealId: context?.mealId ?? null,
          productId: product?.id ?? product?.product_id ?? null,
          productName: product?.name || null,
          isEditMode: !!context?.isEditMode,
          hasOnAdd: typeof context?.onAdd === 'function',
          hasOnSave: typeof context?.onSave === 'function',
        });
      } catch (_) { /* noop */ }
      if (!product || grams <= 0) {
        console.warn('[HEYS.addProduct] ⚠️ GramsStep submit blocked', {
          hasProduct: !!product,
          grams,
          mealIndex: context?.mealIndex ?? null,
          mealId: context?.mealId ?? null,
          productName: product?.name || null
        });
        return;
      }
      console.info('[HEYS.addProduct] 🟢 GramsStep submit', {
        grams,
        mealIndex: context?.mealIndex ?? null,
        mealId: context?.mealId ?? null,
        productId: product?.id ?? product?.product_id ?? null,
        productName: product?.name || null
      });
      // Режим редактирования — вызываем onSave
      if (context?.isEditMode && context?.onSave) {
        // 2026-05-28: dropped startTransition wrapper. В курaторской сессии React
        // deprioritizes/discards transition'ы → save не выполнялся. Sync вызов
        // возвращает ~200мс freeze (известная стоимость) но надёжен.
        // Структурный фикс: docs/REFACTOR_REACT_MEMO_DAY_TAB.md
        context.onSave({
          mealIndex: context.mealIndex,
          mealId: context.mealId,
          itemId: context.itemId,
          grams
        });
      }
      // Режим добавления — вызываем onAdd
      else if (context?.onAdd) {
        if (grams !== data?.grams && data?.grams && data.grams !== 100) {
          console.warn('[GramsStep] ⚠️ grams mismatch on submit:', { final: grams, dataGrams: data.grams });
        }
        const hasNutrients = !!(product?.kcal100 || product?.protein100 || product?.carbs100);
        if (!hasNutrients) {
          console.error('🚨 [GramsStep] CRITICAL: Sending product with NO nutrients!', {
            product,
            stepData,
            contextEditProduct: context?.editProduct,
            dataSelectedProduct: data?.selectedProduct
          });
        }

        const productForSubmit = (!product?.kcal100 && derivedKcal100 > 0)
          ? { ...product, kcal100: derivedKcal100 }
          : product;

        const traceId = createAddTraceId('grams-step');
        const payload = {
          product: productForSubmit,
          grams,
          mealIndex: context.mealIndex,
          mealId: context.mealId,
          _traceId: traceId,
          _origin: 'grams-step'
        };
        console.info('[HEYS.addProduct] ➕ GramsStep onAdd', {
          traceId,
          grams,
          mealIndex: context?.mealIndex ?? null,
          mealId: context?.mealId ?? null,
          productId: productForSubmit?.id ?? productForSubmit?.product_id ?? null,
          productName: productForSubmit?.name || null
        });
        // 2026-05-28: dropped startTransition wrapper. В курaторской сессии onAdd
        // discarded → продукт не добавлялся в приём. Sync вызов надёжен.
        // Структурный фикс: docs/REFACTOR_REACT_MEMO_DAY_TAB.md
        try {
          context.onAdd(payload);
          pushAddTrace('✅ context.onAdd called (GramsStep)', {
            traceId,
            mealIndex: context?.mealIndex ?? null,
            mealId: context?.mealId ?? null
          });
        } catch (error) {
          pushAddTrace('❌ context.onAdd failed (GramsStep)', {
            traceId,
            mealIndex: context?.mealIndex ?? null,
            mealId: context?.mealId ?? null,
            error: error?.message || error
          }, 'error');
        }

        // Звука у записи еды нет — строка «звук · правило продукта»: «Больше
        // звуков нет: ни у записи еды, ни у достижений, ни у ошибок». Три
        // звука по вредности продукта (reward / caution / alert) сняты; от
        // записи остаётся отклик 10 мс, строка nutrition-tab «на добавленный
        // приём».
        HEYS.feedback?.emit?.('meal.added');

        // Product-add events are emitted by the day mutation after a successful write.
      }

      if (HEYS.StepModal?.hide) {
        // 🆕 autoRepeatCount: молча повторить выбор продукта N раз и завершить без summary-модалки
        if (context?.hasAutoRepeat && typeof context?.consumeAutoRepeatStep === 'function') {
          const remaining = context.consumeAutoRepeatStep();
          if (remaining <= 0) {
            dispatchMealFlowFinishedFromContext('add-product-step-autorepeat-complete', context);
            HEYS.StepModal.hide({ scrollToDiary: true });
            return;
          }
          updateStepData?.('search', {
            ...stepData?.search,
            selectedProduct: null,
            grams,
            lastGrams: grams
          });
          updateStepData?.('grams', {
            ...stepData?.grams,
            selectedProduct: null,
            grams
          });
          setTimeout(() => {
            goToStep?.(0, 'right');
          }, 0);
          return;
        }

        if (!context?.multiProductMode) {
          HEYS.StepModal.hide({ scrollToDiary: true });
          return;
        }

        const continueAdding = () => {
          updateStepData?.('search', {
            ...stepData?.search,
            selectedProduct: null,
            grams,
            lastGrams: grams
          });
          updateStepData?.('grams', {
            ...stepData?.grams,
            selectedProduct: null,
            grams
          });
          setTimeout(() => {
            goToStep?.(0, 'right');
          }, 0);
        };

        const finishMeal = () => {
          try {
            window.dispatchEvent(new CustomEvent('heys:meal-flow-finished', {
              detail: {
                source: 'add-product-step',
                dateKey: context?.dateKey || null,
                mealIndex: context?.mealIndex ?? null,
                mealId: context?.mealId ?? null
              }
            }));
          } catch (_) {
            // ignore
          }
          HEYS.StepModal.hide({ scrollToDiary: true });
        };

        const addLastProduct = () => {
          const reopenSingleMode = () => {
            if (!HEYS.AddProductStep?.show) {
              finishMeal();
              return;
            }

            const latestDay = HEYS.Day?.getDay?.() || context?.day || {};
            const latestProducts = HEYS.products?.getAll?.()
              || HEYS.store?.get?.('heys_products', [])
              || HEYS.utils?.lsGet?.('heys_products', [])
              || context?.products
              || [];

            HEYS.AddProductStep.show({
              mealIndex: context?.mealIndex ?? 0,
              mealId: context?.mealId ?? null,
              products: latestProducts,
              day: latestDay,
              dateKey: context?.dateKey || new Date().toISOString().slice(0, 10),
              multiProductMode: false,
              onAdd: context?.onAdd,
              onAddPhoto: context?.onAddPhoto,
              onNewProduct: context?.onNewProduct,
            });
          };

          if (HEYS.StepModal?.hide) {
            HEYS.StepModal.hide({ scrollToDiary: false });
            setTimeout(reopenSingleMode, 80);
          } else {
            reopenSingleMode();
          }
        };

        // Для основного day flow внешний onAdd уже сам показывает summary-модалку
        // и управляет reopen логикой. Если запустить локальный summary ещё и здесь,
        // получаем двойной сценарий: первый клик по «Добавить последний» только
        // закрывает/переоткрывает модалку, а нужный single-product flow срабатывает
        // лишь на повторном клике.
        if (typeof context?.onAdd === 'function') {
          return;
        }

        // 🆕 Используем общий summary-хелпер если доступен
        const summaryShow = HEYS.dayAddProductSummary?.show;
        if (typeof summaryShow === 'function') {
          let flowHandled = false;
          const dayUtils = HEYS.dayUtils || {};
          const getProductFromItem = dayUtils.getProductFromItem || (() => null);
          const per100 = dayUtils.per100 || (() => ({
            kcal100: 0, carbs100: 0, prot100: 0, fat100: 0,
            simple100: 0, complex100: 0, bad100: 0, good100: 0,
            trans100: 0, fiber100: 0
          }));
          const scale = dayUtils.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);
          const currentDay = HEYS.Day?.getDay?.() || context?.day || {};
          const pIndex = dayUtils.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {};

          Promise.resolve(summaryShow({
            day: currentDay,
            mealIndex: context?.mealIndex ?? 0,
            pIndex,
            getProductFromItem,
            per100,
            scale,
            onAddMore: () => {
              flowHandled = true;
              continueAdding();
            },
            onAddLast: () => {
              flowHandled = true;
              addLastProduct();
            }
          })).then(() => {
            if (!flowHandled) finishMeal();
          });
          return;
        }

        // Fallback: старый ConfirmModal
        if (HEYS.ConfirmModal?.show) {
          const mealName = formatContextMealLabel(context, 'приём').toLowerCase();
          Promise.resolve(HEYS.ConfirmModal.show({
            icon: '🍽️',
            title: `Добавить ещё в ${mealName}?`,
            text: 'Можно продолжить добавлять продукты или завершить приём.',
            confirmText: 'Добавить ещё',
            cancelText: 'Завершить',
            confirmStyle: 'success',
            cancelStyle: 'primary',
            confirmVariant: 'fill',
            cancelVariant: 'fill'
          })).then((result) => {
            if (result) continueAdding();
            else finishMeal();
          });
        } else {
          continueAdding();
        }
      }
    }, [product, grams, context, data, stepData]);

    // Считаем сумму ккал за день
    const { dateKey, mealIndex } = context || {};

    // Второй слой защиты от двойного учёта: этот же продукт (или почти этот)
    // уже лежит в целевом приёме. Именно так появились 200 г торта двумя
    // позициями в приёме 24:40 — «Торт Наполеон» и «Торт Наполеон222».
    // Первый слой (предупреждение при создании) можно проигнорировать, этот
    // срабатывает в момент добавления и виден даже для продуктов из каталога.
    const mealDuplicate = useMemo(() => {
      if (!product?.name || context?.isEditMode) return null;
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
      const meals = Array.isArray(dayData.meals) ? dayData.meals : [];
      const meal =
        (context?.mealId && meals.find((m) => m && m.id === context.mealId)) ||
        meals[mealIndex] ||
        null;
      return findMealDuplicate(product.name, meal?.items);
    }, [product, dateKey, mealIndex, context?.mealId, context?.isEditMode]);
    const dayTotalKcal = useMemo(() => {
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
      let total = 0;
      (dayData.meals || []).forEach(m => {
        const items = Array.isArray(m?.items) ? m.items : [];
        items.forEach(it => {
          const g = HEYS.models.normalizeItemGrams(it.grams, 100);
          const pid = it.product_id || it.name;
          const prod = (context?.products || []).find(p => (p.id || p.name) === pid);
          if (prod) total += (prod.kcal100 || 0) * g / 100;
        });
      });
      return Math.round(total);
    }, [dateKey, context?.products]);

    // Норма ккал из профиля. profile.optimum/tdee не существуют
    // (DERIVED_FIELDS_AUDIT_2026-08-02.md) — считаем через TDEE.
    const dailyGoal = useMemo(() => {
      const profile = lsGet('heys_profile', {});
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
      return HEYS.TDEE?.resolveDailyTargets?.(profile, dayData)?.kcal || 1800;
    }, [dateKey]);

    // === ТЕПЕРЬ МОЖНО ДЕЛАТЬ EARLY RETURN ===
    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала выберите продукт'
      );
    }

    // Быстрые кнопки порций
    const quickPortions = [50, 100, 150, 200, 300];
    const namedPortions = (localPortions || []).filter((portion) => {
      const portionGrams = Number(portion?.grams) || 0;
      if (!portionGrams || quickPortions.includes(portionGrams)) return false;
      const portionName = String(portion?.name || '').trim();
      return portionName && !/^(\d+\s*г)$/i.test(portionName);
    });
    const dayAfterAddKcal = dayTotalKcal + currentKcal;
    const dayPct = dailyGoal > 0 ? Math.round(dayAfterAddKcal / dailyGoal * 100) : 0;
    const duplicateGrams = mealDuplicate
      ? HEYS.models.normalizeItemGrams(mealDuplicate.item.grams, 100)
      : 0;

    return React.createElement('div', { className: 'aps-grams-step aps-v4-flow' },
      exitPromptOpen && React.createElement(ApsExitDialog, {
        summary: (() => {
          if (product?.name && grams) return `${product.name}, ${grams} г — ещё не добавлен в приём. Черновик не сохраняется.`;
          if (product?.name) return `${product.name} — ещё не добавлен в приём. Черновик не сохраняется.`;
          if (grams && +grams !== 100) return `${grams} г — ещё не добавлены в приём. Черновик не сохраняется.`;
          return 'Черновик не сохраняется.';
        })(),
        onStay: () => setExitPromptOpen(false),
        onLeave: confirmExitModal
      }),

      React.createElement('div', { className: 'aps-v4-grams-hero' },
        React.createElement('div', { className: 'aps-v4-grams-hero__label' }, 'Сколько'),
        React.createElement('div', { className: 'aps-v4-grams-hero__controls' },
          React.createElement('button', {
            type: 'button',
            className: 'aps-v4-grams-hero__step',
            onClick: () => setGrams(grams - 10),
            'aria-label': 'Меньше на 10 г'
          }, '−'),
          React.createElement('div', { className: 'aps-v4-grams-hero__value' },
            React.createElement('input', {
              ref: gramsInputRef,
              type: 'number',
              className: 'aps-v4-grams-hero__input',
              value: grams,
              onChange: (e) => setGrams(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              },
              onFocus: (e) => e.target.select(),
              onClick: (e) => e.target.select(),
              inputMode: 'numeric',
              min: 1,
              max: 2000,
              'aria-label': 'Граммы'
            }),
            React.createElement('span', { className: 'aps-v4-grams-hero__unit' }, ' г')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'aps-v4-grams-hero__step',
            onClick: () => setGrams(grams + 10),
            'aria-label': 'Больше на 10 г'
          }, '+')
        ),
        React.createElement('div', { className: 'aps-v4-grams-chips' },
          quickPortions.map((g) =>
            React.createElement('button', {
              key: g,
              type: 'button',
              className: 'aps-v4-grams-chip' + (grams === g ? ' is-active' : ''),
              onClick: () => setGrams(g)
            }, String(g))
          )
        ),
        namedPortions.length > 0 && React.createElement('div', { className: 'aps-v4-grams-chips aps-v4-grams-chips--portions' },
          namedPortions.map((portion, index) =>
            React.createElement('button', {
              key: `${portion.name}-${portion.grams}-${index}`,
              type: 'button',
              className: 'aps-v4-grams-chip aps-v4-grams-chip--portion' + (grams === portion.grams ? ' is-active' : ''),
              onClick: () => setGrams(portion.grams)
            }, `${portion.name} · ${portion.grams} г`)
          )
        ),
        lastGrams && React.createElement('div', { className: 'aps-v4-grams-last' },
          `В прошлый раз было ${lastGrams} г`
        )
      ),

      React.createElement('div', { className: 'aps-v4-grams-impact' },
        React.createElement('div', { className: 'aps-v4-grams-impact__head' },
          React.createElement('span', { className: 'aps-v4-grams-impact__label' }, 'Добавится'),
          React.createElement('span', { className: 'aps-v4-grams-impact__kcal' }, `${currentKcal} ккал`)
        ),
        React.createElement('div', { className: 'aps-v4-grams-impact__macros' },
          React.createElement('span', null, `Б ${currentProt}`),
          React.createElement('span', null, `Ж ${currentFat}`),
          React.createElement('span', null, `У ${currentCarbs}`)
        ),
        React.createElement('div', { className: 'aps-v4-grams-impact__bar' },
          React.createElement('div', {
            className: 'aps-v4-grams-impact__bar-fill',
            style: { width: `${Math.min(100, Math.max(0, dayPct))}%` }
          })
        ),
        React.createElement('div', { className: 'aps-v4-grams-impact__foot' },
          `${dayAfterAddKcal} из ${dailyGoal} за день · ${dayPct} %`
        )
      ),

      mealDuplicate && React.createElement('div', { className: 'aps-v4-grams-duplicate' },
        mealDuplicate.kind === 'same'
          ? `Этот продукт уже есть в приёме — ${duplicateGrams} г. Добавите ещё, и еда посчитается дважды.`
          : `В приёме уже есть «${mealDuplicate.item.name}». Проверьте, не тот ли это продукт.`
      ),

      React.createElement('button', {
        type: 'button',
        className: 'aps-add-hero-btn aps-v4-btn-primary',
        onClick: handleSubmit
      }, context?.isEditMode ? 'Изменить' : 'Добавить')
    );
  }

  // === Полный редактор продукта (3 шага) ===
  function showEditProductModal(productOrOptions = {}, maybeOptions = {}) {
    let product = productOrOptions;
    let options = maybeOptions;

    if (productOrOptions && typeof productOrOptions === 'object' && productOrOptions.product) {
      options = productOrOptions;
      product = productOrOptions.product;
    }

    const { initialStep = 0, focusField = null, onSave, onClose } = options || {};

    if (!product) {
      HEYS.Toast?.warning('Продукт не найден') || alert('Продукт не найден');
      return;
    }

    if (!HEYS.StepModal?.show) {
      HEYS.Toast?.warning('Модалка недоступна') || alert('Модалка недоступна');
      return;
    }

    if (!canEditProduct(product)) {
      HEYS.Toast?.warning('Нет доступа к редактированию') || alert('Нет доступа к редактированию');
      return;
    }

    HEYS.StepModal.show({
      steps: [
        {
          id: 'edit_basic',
          title: 'Основные',
          hint: 'Название, КБЖУ и порции',
          icon: '✏️',
          component: ProductEditBasicStep,
          validate: () => true,
          hideHeaderNext: true,
          getInitialData: () => ({ product })
        },
        {
          id: 'edit_extra',
          title: 'Дополнительно',
          hint: 'Расширенные значения',
          icon: '🧬',
          component: ProductEditExtraStep,
          validate: () => true,
          hideHeaderNext: true
        },
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Настройте порции',
          icon: '🥣',
          component: PortionsStep,
          validate: () => true,
          hideHeaderNext: true
        }
      ],
      context: {
        isEditMode: true,
        isProductEditor: true,
        editProduct: product,
        focusField,
        onFinish: async ({ product: updatedProduct, portions }) => {
          const finalProduct = {
            ...product,
            ...(updatedProduct || {})
          };

          if (Array.isArray(portions)) {
            finalProduct.portions = portions;
          }

          // v4.8.0: Track if name changed for UX feedback
          const nameChanged = product.name !== finalProduct.name;
          const portionsChanged =
            JSON.stringify(normalizePortions(product.portions || [])) !==
            JSON.stringify(normalizePortions(finalProduct.portions || []));
          const otherChanged =
            nameChanged ||
            hasNutrientChanges(product, finalProduct) ||
            (product.category || '') !== (finalProduct.category || '') ||
            (product.description || '') !== (finalProduct.description || '') ||
            getProductBarcode(product) !== getProductBarcode(finalProduct);

          const sharedId = resolveSharedProductId(finalProduct);

	          if (isCuratorUser() && sharedId && portionsChanged && !otherChanged) {
	            const result = await updateSharedProductPortions(sharedId, finalProduct.portions || [], finalProduct);
	            if (result.ok) {
	              const commit = await commitPersonalProduct(finalProduct, false, 'edit-product-shared');
	              if (!commit.ok) {
	                showProductCommitError(commit.reason);
	                return;
	              }
	              notifyProductUpdated(commit.product || finalProduct);
              if (nameChanged) {
                HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                  console.log('[HEYS] Product renamed, cascaded to meals');
              }
            }
            onSave?.(finalProduct);
            return;
          }

          if (isSharedProduct(product)) {
	            if (isCuratorUser()) {
	              const result = await updateSharedProduct(finalProduct);
	              if (result.ok) {
	                const commit = await commitPersonalProduct(finalProduct, false, 'edit-product-shared');
	                if (!commit.ok) {
	                  showProductCommitError(commit.reason);
	                  return;
	                }
	                notifyProductUpdated(commit.product || finalProduct);
                // v4.8.0: Show cascade notification for shared products
                if (nameChanged) {
                  HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                    console.log('[HEYS] Product renamed, cascaded to meals');
                }
              }
            } else {
              const requestType = chooseSharedEditRequestType(product, finalProduct);
	              const localProduct = requestType === 'variant_create' || (!requestType && nameChanged)
	                ? makeLocalVariantCandidate(finalProduct, product)
	                : finalProduct;
	              const localSave = await commitPersonalProduct(localProduct, true, 'edit-product');
	              if (!localSave.ok) {
	                showProductCommitError(localSave.reason);
	                return;
	              }
	              const saved = localSave.product || finalProduct;
              notifyProductUpdated(saved);
              if (nameChanged) {
                HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                  console.log('[HEYS] Product renamed, cascaded to meals');
              }
              if (requestType) {
                const pending = await submitSharedProductChangeRequest(requestType, saved, sharedId, {
                  summary: requestType === 'variant_create' ? 'create variant' : 'product update'
                });
                if (pending.ok) {
                  HEYS.Toast?.info?.(
                    requestType === 'variant_create'
                      ? 'Вариант продукта отправлен куратору'
                      : 'Изменение общей базы отправлено куратору'
                  );
                } else {
                  HEYS.Toast?.warning?.('Лично сохранено, но заявку отправить не удалось: ' + pending.error);
                }
              } else {
                HEYS.Toast?.success?.('Изменение сохранено только в личной базе');
              }
	            }
	          } else {
	            const localSave = await saveLocalProduct(finalProduct);
	            if (!localSave?.ok) {
	              showProductCommitError(localSave?.reason || 'product_save_failed');
	              return;
	            }
	            notifyProductUpdated(localSave.product || finalProduct);
            // v4.8.0: Show cascade notification for local products
            if (nameChanged) {
              HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                console.log('[HEYS] Product renamed, cascaded to meals');
            }
            if (sharedId && !isCuratorUser()) {
              const requestType = chooseSharedEditRequestType(product, finalProduct);
              if (requestType) {
	                const requestProduct = requestType === 'variant_create'
	                  ? makeLocalVariantCandidate(finalProduct, product)
	                  : finalProduct;
	                if (requestProduct !== finalProduct) {
	                  const variantSave = await saveLocalProduct(requestProduct);
	                  if (!variantSave?.ok) {
	                    showProductCommitError(variantSave?.reason || 'product_save_failed');
	                    return;
	                  }
	                  notifyProductUpdated(variantSave.product || requestProduct);
	                }
                const pending = await submitSharedProductChangeRequest(requestType, requestProduct, sharedId, {
                  summary: requestType === 'variant_create' ? 'create variant' : 'product update'
                });
                if (pending.ok) {
                  HEYS.Toast?.info?.(
                    requestType === 'variant_create'
                      ? 'Вариант продукта отправлен куратору'
                      : 'Изменение общей базы отправлено куратору'
                  );
                } else {
                  HEYS.Toast?.warning?.('Лично сохранено, но заявку отправить не удалось: ' + pending.error);
                }
	              } else if (nameChanged) {
	                const localVariant = makeLocalVariantCandidate(finalProduct, product);
	                const variantSave = await saveLocalProduct(localVariant);
	                if (!variantSave?.ok) {
	                  showProductCommitError(variantSave?.reason || 'product_save_failed');
	                  return;
	                }
	                notifyProductUpdated(variantSave.product || localVariant);
	              }
            }
          }

          onSave?.(finalProduct);
        }
      },
      initialStep,
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
      allowSwipe: false,
      hidePrimaryOnFirst: true,
      finishLabel: 'Готово',
      title: '',
      onClose
    });
  }

  const getProductsForStandaloneBarcodeEditor = () => {
    const U = HEYS.utils || {};
    return HEYS.products?.getAll?.()
      || HEYS.store?.get?.('heys_products', [])
      || U.lsGet?.('heys_products', [])
      || [];
  };

  const saveStandaloneBarcodeForProduct = async (product, rawBarcode) => {
    const barcode = normalizeBarcode(rawBarcode);
    if (!product || !barcode) return null;
    const latestProducts = getProductsForStandaloneBarcodeEditor();
    const productId = String(product.id ?? product.product_id ?? product.name ?? '');
    const sharedId = resolveSharedProductId(product);
    const localDuplicate = findProductByBarcode(latestProducts, barcode);
    const localDuplicateId = String(localDuplicate?.id ?? localDuplicate?.product_id ?? localDuplicate?.name ?? '');
    const localDuplicateSharedId = resolveSharedProductId(localDuplicate);
    const sameProduct = localDuplicateId === productId
      || (sharedId && localDuplicateSharedId && String(localDuplicateSharedId) === String(sharedId));

    if (localDuplicate && localDuplicateId && !sameProduct) {
      HEYS.Toast?.warning?.(`Этот штрихкод уже привязан к «${localDuplicate.name || 'другому продукту'}»`);
      return null;
    }

    if (HEYS.cloud?.searchSharedProducts) {
      try {
        const result = await HEYS.cloud.searchSharedProducts('', { barcode, limit: 1 });
        const sharedDuplicate = Array.isArray(result?.data) ? result.data[0] : null;
        const sharedDuplicateId = String(sharedDuplicate?.id ?? '');
        if (sharedDuplicate && sharedDuplicateId && sharedDuplicateId !== String(sharedId || '')) {
          HEYS.Toast?.warning?.(`Этот штрихкод уже есть в общей базе: «${sharedDuplicate.name || 'продукт'}»`);
          return null;
        }
      } catch (_) { }
    }

    const updatedProduct = {
      ...mergeProductBarcode(product, barcode),
      updatedAt: Date.now()
    };

    if (sharedId && !isCuratorUser()) {
      const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
      if (!localSave.ok) {
        showProductCommitError(localSave.reason);
        return null;
      }
      const saved = localSave.product || updatedProduct;
      notifyProductUpdated(saved);
      if (confirm('Штрихкод сохранён в личной базе. Предложить куратору добавить его в общую базу?')) {
        const pending = await submitSharedProductChangeRequest('barcode_update', saved, sharedId, {
          summary: `barcode ${barcode}`
        });
        if (pending.ok) HEYS.Toast?.info?.('Штрихкод отправлен куратору на проверку');
        else HEYS.Toast?.warning?.('Лично сохранено, но заявку отправить не удалось: ' + pending.error);
      } else {
        HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён только в личной базе`);
      }
      return saved;
    }

    if (sharedId) {
      const result = await updateSharedProductBarcodes(updatedProduct, sharedId, { mode: 'add', barcode });
      if (!result.ok) {
        HEYS.Toast?.warning?.('Не удалось сохранить штрихкод в общей базе');
        return null;
      }
      const localSave = await commitPersonalProduct(updatedProduct, false, 'barcode-update-shared');
      if (!localSave.ok) {
        showProductCommitError(localSave.reason);
        return null;
      }
      const saved = localSave.product || updatedProduct;
      notifyProductUpdated(saved);
      HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён в общей базе для «${product.name || 'продукта'}»`);
      return saved;
    }

    if (isSharedProduct(product) && !isCuratorUser()) {
      HEYS.Toast?.warning?.('Общий продукт может изменить только куратор');
      return null;
    }

    const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
    if (!localSave.ok) {
      showProductCommitError(localSave.reason);
      return null;
    }
    const saved = localSave.product || updatedProduct;
    notifyProductUpdated(saved);
    if (HEYS.cloud?.createPendingProduct) {
      HEYS.cloud.createPendingProduct(null, saved).catch(() => { });
    }
    HEYS.Toast?.success?.(`Штрихкод ${barcode} сохранён в личной базе для «${product.name || 'продукта'}» и синхронизируется`);
    return saved;
  };

  const persistStandaloneProductBarcodes = async (product, nextCodes, toastMode = 'update') => {
    if (!product) return null;
    const updatedProduct = {
      ...setProductBarcodes(product, nextCodes),
      updatedAt: Date.now()
    };
    const sharedId = resolveSharedProductId(product);

    if (sharedId && !isCuratorUser()) {
      const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
      if (!localSave.ok) {
        showProductCommitError(localSave.reason);
        return null;
      }
      const saved = localSave.product || updatedProduct;
      notifyProductUpdated(saved);
      const actionText = toastMode === 'remove-all' ? 'удаление всех штрихкодов' : 'изменение штрихкодов';
      if (confirm(`Сохранено в личной базе. Предложить куратору ${actionText} в общей базе?`)) {
        const pending = await submitSharedProductChangeRequest('barcode_update', saved, sharedId, {
          summary: actionText
        });
        if (pending.ok) HEYS.Toast?.info?.('Изменение штрихкодов отправлено куратору');
        else HEYS.Toast?.warning?.('Лично сохранено, но заявку отправить не удалось: ' + pending.error);
      } else if (toastMode === 'remove-all') {
        HEYS.Toast?.success?.('Все штрихкоды удалены только в личной базе');
      } else if (toastMode === 'remove') {
        HEYS.Toast?.success?.('Штрихкод удалён только в личной базе');
      }
      return saved;
    }

    if (sharedId) {
      const result = await updateSharedProductBarcodes(updatedProduct, sharedId);
      if (!result.ok) {
        HEYS.Toast?.warning?.('Не удалось обновить штрихкоды в общей базе');
        return null;
      }
      const localSave = await commitPersonalProduct(updatedProduct, false, 'barcode-update-shared');
      if (!localSave.ok) {
        showProductCommitError(localSave.reason);
        return null;
      }
      const saved = localSave.product || updatedProduct;
      notifyProductUpdated(saved);
      if (toastMode === 'remove-all') HEYS.Toast?.success?.('Все штрихкоды удалены');
      else if (toastMode === 'remove') HEYS.Toast?.success?.('Штрихкод удалён');
      return saved;
    }

    if (isSharedProduct(product) && !isCuratorUser()) {
      HEYS.Toast?.warning?.('Общий продукт может изменить только куратор');
      return null;
    }

    const localSave = await commitPersonalProduct(updatedProduct, true, 'barcode-update');
    if (!localSave.ok) {
      showProductCommitError(localSave.reason);
      return null;
    }
    const saved = localSave.product || updatedProduct;
    notifyProductUpdated(saved);
    if (toastMode === 'remove-all') HEYS.Toast?.success?.('Все штрихкоды удалены');
    else if (toastMode === 'remove') HEYS.Toast?.success?.('Штрихкод удалён');
    return saved;
  };

  function StandaloneBarcodeEditor({ product, onClose }) {
    const [currentProduct, setCurrentProduct] = useState(product);
    const [scanner, setScanner] = useState(null);
    const [busy, setBusy] = useState(false);

    const openScanner = useCallback(() => {
      if (busy) return;
      setScanner({
        cameraStart: createBarcodeCameraStart()
      });
    }, [busy]);

    const closeScanner = useCallback(() => {
      if (scanner?.cameraStart) stopBarcodeCameraStart(scanner.cameraStart);
      setScanner(null);
    }, [scanner]);

    const handleDetected = useCallback(async (code) => {
      if (busy) return;
      setBusy(true);
      const saved = await saveStandaloneBarcodeForProduct(currentProduct, code);
      if (saved) {
        setCurrentProduct(saved);
        setScanner(null);
      }
      setBusy(false);
    }, [busy, currentProduct]);

    const removeBarcode = useCallback(async (code) => {
      if (busy) return;
      const barcode = normalizeBarcode(code);
      if (!barcode) return;
      setBusy(true);
      const nextCodes = getProductBarcodes(currentProduct).filter((item) => item !== barcode);
      const saved = await persistStandaloneProductBarcodes(currentProduct, nextCodes, 'remove');
      if (saved) setCurrentProduct(saved);
      setBusy(false);
    }, [busy, currentProduct]);

    const removeAll = useCallback(async () => {
      if (busy) return;
      if (!confirm(`Удалить все штрихкоды у «${currentProduct?.name || 'продукта'}»?`)) return;
      setBusy(true);
      const saved = await persistStandaloneProductBarcodes(currentProduct, [], 'remove-all');
      if (saved) setCurrentProduct(saved);
      setBusy(false);
    }, [busy, currentProduct]);

    if (scanner) {
      return React.createElement(BarcodeScannerModal, {
        title: 'Добавить штрихкод',
        subtitle: `К продукту: ${currentProduct?.name || 'Продукт'}`,
        initialValue: '',
        autoStart: true,
        cameraStart: scanner.cameraStart || null,
        onDetected: handleDetected,
        onClose: closeScanner
      });
    }

    return React.createElement(ProductBarcodeManagerModal, {
      product: currentProduct,
      onAdd: openScanner,
      onRemove: removeBarcode,
      onRemoveAll: removeAll,
      onClose
    });
  }

  function showEditBarcodeModal(productOrOptions = {}, maybeOptions = {}) {
    let product = productOrOptions;
    let options = maybeOptions;

    if (productOrOptions && typeof productOrOptions === 'object' && productOrOptions.product) {
      options = productOrOptions;
      product = productOrOptions.product;
    }

    if (!product) {
      HEYS.Toast?.warning?.('Продукт не найден');
      return null;
    }

    if (!global.document || !global.ReactDOM) {
      return showEditProductModal({
        ...(options || {}),
        product,
        initialStep: 0,
        focusField: 'barcode'
      });
    }

    const container = global.document.createElement('div');
    container.className = 'heys-standalone-barcode-editor-root';
    global.document.body.appendChild(container);
    let root = null;

    const close = () => {
      try {
        if (root?.unmount) root.unmount();
        else if (global.ReactDOM?.unmountComponentAtNode) global.ReactDOM.unmountComponentAtNode(container);
      } catch (_) { }
      if (container.parentNode) container.parentNode.removeChild(container);
      options?.onClose?.();
    };

    const element = React.createElement(StandaloneBarcodeEditor, {
      product,
      onClose: close
    });

    if (global.ReactDOM.createRoot) {
      root = global.ReactDOM.createRoot(container);
      root.render(element);
    } else if (global.ReactDOM.render) {
      global.ReactDOM.render(element, container);
    }

    return close;
  }

  function createAddTraceId(origin = 'unknown') {
    const rnd = Math.random().toString(36).slice(2, 7);
    return `add-${Date.now().toString(36)}-${rnd}-${origin}`;
  }

  function pushAddTrace(event, payload = {}, level = 'info') {
    try {
      const root = window.HEYS = window.HEYS || {};
      const debug = root.debug = root.debug || {};
      const buffer = Array.isArray(debug.addTraceBuffer) ? debug.addTraceBuffer : [];
      const entry = {
        ts: Date.now(),
        iso: new Date().toISOString(),
        level,
        event,
        ...payload
      };
      buffer.push(entry);
      if (buffer.length > 200) {
        buffer.splice(0, buffer.length - 200);
      }
      debug.addTraceBuffer = buffer;
      debug.pushAddTrace = pushAddTrace;
      debug.getAddTraceBuffer = () => (Array.isArray(debug.addTraceBuffer) ? debug.addTraceBuffer.slice() : []);
      debug.clearAddTraceBuffer = () => {
        debug.addTraceBuffer = [];
      };
      const method = level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info');
      console[method](`[HEYS.addTrace] ${event}`, entry);
    } catch (error) {
      console.warn('[HEYS.addTrace] pushAddTrace failed', error);
    }
  }

  // === Главная функция показа модалки ===
  const apsCloseGuardRef = { current: null };

  function showAddProductModal(options = {}) {
    const {
      mealIndex = 0,
      mealId = null,
      products: providedProducts,
      day,
      dateKey = new Date().toISOString().slice(0, 10),
      multiProductMode = false,
      autoRepeatCount = 0, // 🆕 «Подряд N продуктов» — молча повторяет выбор N раз без summary
      initialSearch = '', // 🆕 Предзаполнение поиска (MealRec UX fix)
      initialGrams = 100, // 🆕 v24: Smart Grams Pre-fill (R6, Sprint 1)
      startWithBarcodeScanner = false,
      barcodeCameraStart = null,
      openPresetsCreate = false, // Открыть сразу в режиме создания набора из текущего приёма
      onAdd,
      onAddMany,
      onAddPhoto, // Callback для добавления фото к приёму
      onNewProduct,
      onClose
    } = options;

    let autoRepeatRemaining = (typeof autoRepeatCount === 'number' && autoRepeatCount > 1)
      ? Math.floor(autoRepeatCount)
      : 0;

    // Всегда берём актуальные продукты из хранилища (providedProducts может быть устаревшим)
    const U = HEYS.utils || {};

    // Берём из первого непустого источника с fallback chain
    const fromHeysProducts = HEYS.products?.getAll?.() || [];
    const fromStore = HEYS.store?.get?.('heys_products', []) || [];
    const fromLsGet = U.lsGet?.('heys_products', []) || [];

    let products = [];
    if (fromHeysProducts.length > 0) {
      products = fromHeysProducts;
    } else if (fromStore.length > 0) {
      products = fromStore;
    } else if (fromLsGet.length > 0) {
      products = fromLsGet;
    }

    console.info('[HEYS.addProduct] 📦 Open modal', {
      mealIndex,
      mealId,
      dateKey,
      productsCount: products.length,
      hasProvidedProducts: Array.isArray(providedProducts) && providedProducts.length > 0,
      // 🆕 v24: Sprint 1 verification — show initialGrams from MealRec
      initialSearch: initialSearch || '(none)',
      initialGrams: initialGrams,
      usingMLGrams: initialGrams !== 100
    });

    const handleModalClose = () => {
      apsCloseGuardRef.current = null;
      onClose?.();
    };

    // Mutable ref для обновления продуктов после создания
    let currentProducts = [...products];

    if (!HEYS.StepModal) {
      console.error('[AddProductStep] StepModal not loaded');
      return;
    }

    const localizeMealName = HEYS.dayUtils?.localizeMealName;
    const flowMeal = Array.isArray(day?.meals) ? day.meals[mealIndex] : null;
    const searchStepTitle = flowMeal
      ? [
        typeof localizeMealName === 'function' ? localizeMealName(flowMeal.name, 'Приём') : (flowMeal.name || 'Приём'),
        flowMeal.time
      ].filter(Boolean).join(' · ')
      : 'Добавление';

    HEYS.StepModal.show({
      steps: [
        {
          id: 'search',
          title: searchStepTitle,
          hint: '',
          icon: '',
          component: ProductSearchStep,
          getInitialData: () => ({
            selectedProduct: null,
            grams: initialGrams,
            _mlGrams: initialGrams !== 100 ? initialGrams : null, // v25.3: separate ML grams flag
            searchQuery: initialSearch
          }),
          validate: (data) => !!data?.selectedProduct
        },
        {
          id: 'create',
          title: 'Новый продукт',
          hint: 'Вставьте строку с макросами',
          icon: '➕',
          component: CreateProductStep,
          validate: () => true,
          hidden: true, // Скрытый шаг — не отображается в progress dots
          hideHeaderNext: true // Скрываем "Далее" — есть своя кнопка "Добавить"
        },
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Добавьте удобные порции',
          icon: '🥣',
          component: PortionsStep,
          validate: () => true,
          hidden: true,
          hideHeaderNext: true
        },
        {
          id: 'harm',
          title: 'Вредность',
          hint: 'Проверьте или измените',
          icon: '🧪',
          component: HarmSelectStep,
          validate: () => true,
          hidden: true, // Скрытый шаг — показывается только при создании нового продукта
          hideHeaderNext: true // Есть своя кнопка выбора
        },
        {
          id: 'grams',
          title: '',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data, stepData) => (data?.grams || stepData?.search?.grams || 0) > 0,
          hideHeaderNext: true // Скрываем кнопку в хедере — есть большая зелёная кнопка внизу
        }
      ],
      context: {
        products: currentProducts,
        day,
        dateKey,
        mealIndex,
        mealId,
        apsCloseGuardRef,
        multiProductMode,
        startWithBarcodeScanner,
        barcodeCameraStart,
        _openPresetsCreate: openPresetsCreate,
        // 🆕 autoRepeat: closure-переменная не сериализуется → contextKey стабилен между шагами
        hasAutoRepeat: autoRepeatRemaining > 0,
        consumeAutoRepeatStep: () => {
          if (autoRepeatRemaining > 0) autoRepeatRemaining -= 1;
          return autoRepeatRemaining;
        },
        onNewProduct,
        onAdd, // Передаём callback для добавления в приём пищи
        onAddMany, // Callback для атомарного добавления готового набора
        onAddPhoto, // Callback для добавления фото к приёму
        resolveHeaderCenter: ({ stepData, currentConfig }) => {
          if (currentConfig?.id !== 'grams') return null;
          const gramsProduct = stepData?.grams?.selectedProduct
            || stepData?.create?.newProduct
            || stepData?.create?.selectedProduct
            || stepData?.search?.selectedProduct;
          if (!gramsProduct?.name) return null;
          return React.createElement('span', { className: 'mc-header-title' }, gramsProduct.name);
        },
        headerRight: ({ stepData, currentConfig, updateStepData }) => {
          if (currentConfig?.id === 'search') return null;
          const countLabel = `🗃️ ${currentProducts.length}`;
          if (currentConfig?.id !== 'grams') return countLabel;

          const product = stepData?.grams?.selectedProduct
            || stepData?.create?.newProduct
            || stepData?.create?.selectedProduct
            || stepData?.search?.selectedProduct;
          if (!product || isSharedProduct(product)) return null;

          const productId = String(product.id ?? product.product_id ?? product.name ?? '');
          const favorites = HEYS.store?.getFavorites?.() || new Set();
          const isFavorite = productId ? favorites.has(productId) : false;

          return React.createElement('button', {
            type: 'button',
            className: 'mc-header-btn mc-header-btn--fav' + (isFavorite ? ' is-active' : ''),
            onClick: (e) => {
              e.stopPropagation();
              if (!productId || !HEYS.store?.toggleFavorite) return;
              HEYS.store.toggleFavorite(productId);
              updateStepData?.('grams', {
                ...(stepData?.grams || {}),
                _favRev: Date.now()
              });
            },
            title: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное',
            'aria-label': isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'
          }, isFavorite ? '★' : '☆');
        }, // На grams — звёздочка избранного; на остальных — счётчик базы
        // Callback при создании продукта — обновляем список (не используется при 2 шагах, оставляем для совместимости)
        onProductCreated: (product) => {
          currentProducts = [...currentProducts, product];
        }
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
	      allowSwipe: false,
	      hidePrimaryOnFirst: true,
	      finishLabel: 'Добавить', // Кнопка на последнем шаге
	      title: '', // Убрали — и так очевидно
	      closeOnComplete: 'after',
	      onComplete: async (stepData) => {
        // console.log('[AddProductStep] onComplete stepData:', stepData);

        // Данные шагов
        const searchData = stepData.search || {};
        const gramsData = stepData.grams || {};
        const createData = stepData.create || {};

        // Приоритет: продукт из grams (последний шаг), затем create (новый продукт), затем search
        // ВАЖНО: create проверяется перед search, т.к. при создании нового продукта 
        // stepData.grams может не успеть обновиться из-за React batching
        // newProduct — это поле которое всегда устанавливается при создании
	        let selectedProduct = gramsData.selectedProduct
	          || createData.newProduct
	          || createData.selectedProduct
	          || searchData.selectedProduct;
	        const grams = gramsData.grams || createData.grams || searchData.grams || 100;

        // console.log('[AddProductStep] selectedProduct:', selectedProduct?.name, 'grams:', grams);

	        if (selectedProduct && grams) {
	          const ready = await HEYS.products?.ensureMealProductReady?.(selectedProduct, {
	            source: 'add-product-complete',
	            requireCommit: !!(createData.newProduct && !selectedProduct._oneTime)
	          });
	          if (ready && !ready.ok) {
	            showProductCommitError(ready.reason);
	            throw new Error('product_commit_failed');
	          }
	          if (ready?.product) selectedProduct = ready.product;
	          const traceId = createAddTraceId('stepmodal-complete');
	          const payload = {
            product: selectedProduct,
            grams: grams,
            mealIndex,
            mealId,
            productCommitVerified: ready?.ok === true,
            _traceId: traceId,
            _origin: 'stepmodal-complete'
          };
          console.info('[HEYS.addProduct] ✅ onComplete -> onAdd', {
            traceId,
            mealIndex,
            mealId,
            grams,
            productId: selectedProduct.id ?? selectedProduct.product_id ?? null,
            productName: selectedProduct.name || null,
            source: selectedProduct._source || (selectedProduct._fromShared ? 'shared' : 'personal')
	          });
	          try {
	            const addResult = onAdd?.(payload);
	            if (addResult && typeof addResult.then === 'function') {
	              await addResult;
	            }
	            pushAddTrace('✅ onAdd callback completed (onComplete)', {
              traceId,
              mealIndex,
              mealId
            });
            setTimeout(() => {
              dispatchMealFlowFinishedFromContext('add-product-step-complete', {
                ...context,
                mealIndex,
                mealId,
              });
            }, 160);
	          } catch (error) {
	            pushAddTrace('❌ onAdd callback failed (onComplete)', {
	              traceId,
	              mealIndex,
	              mealId,
	              error: error?.message || error
	            }, 'error');
	            throw error;
	          }

          // Product-add events are emitted by the day mutation after a successful write.
        } else {
          console.warn('[HEYS.addProduct] ⚠️ onComplete skipped (missing product or grams)', {
            mealIndex,
            mealId,
            grams,
            hasSelectedProduct: !!selectedProduct,
            selectedProductName: selectedProduct?.name || null
          });
        }
      },
      onClose: handleModalClose,
      onRequestClose: (proceed) => {
        if (typeof apsCloseGuardRef.current === 'function') {
          apsCloseGuardRef.current();
          return;
        }
        proceed();
      }
    });
  }

  // === Функция редактирования граммов (для карточки продукта) ===
  function showEditGramsModal(options = {}) {
    const {
      product,
      currentGrams = 100,
      mealIndex = 0,
      itemId,
      dateKey = new Date().toISOString().slice(0, 10),
      onSave,
      onClose
    } = options;

    if (!product) {
      console.error('[EditGramsModal] No product provided');
      return;
    }

    if (!HEYS.StepModal) {
      console.error('[EditGramsModal] StepModal not loaded');
      return;
    }

    HEYS.StepModal.show({
      steps: [
        {
          id: 'grams',
          title: product?.name || 'Граммы',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data) => (data?.grams || 0) > 0,
          hideHeaderNext: true, // Скрываем кнопку в хедере — используем большую кнопку внизу
          getInitialData: (ctx) => ({
            grams: ctx?.editGrams || currentGrams || 100,
            selectedProduct: ctx?.editProduct || product
          })
        }
      ],
      context: {
        products: HEYS.products?.getAll?.() || [],
        dateKey,
        mealIndex,
        itemId,
        isEditMode: true,
        editProduct: product,   // Продукт через context — доступен сразу
        editGrams: currentGrams, // Граммы через context
        onSave  // Callback для сохранения — используется большой кнопкой
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: false,
      allowSwipe: false,
      finishLabel: 'Сохранить', // Редактирование — "Сохранить"
      title: '',
      onComplete: (stepData) => {
        const gramsData = stepData.grams || {};
        const grams = gramsData.grams || currentGrams;

        if (grams > 0) {
          onSave?.({
            mealIndex,
            itemId,
            grams
          });
        }
      },
      onClose
    });
  }

  // === Экспорт ===
  HEYS.AddProductStep = {
    show: showAddProductModal,
    showEditGrams: showEditGramsModal,
    showEditProduct: showEditProductModal,
    showEditBarcode: showEditBarcodeModal,
    createBarcodeCameraStart,
    ProductSearchStep,
    GramsStep,
    PortionsStep,
    CreateProductStep,
    ProductEditBasicStep,
    ProductEditExtraStep,
    HarmSelectStep,
    BarcodeScanIcon,
    getCategoryIcon,
    computeSmartProducts,
    computeRecentProducts,
    updateSharedProduct,
    updateSharedProductPortions
  };

  // === ГЛОБАЛЬНЫЙ МЕХАНИЗМ СОБЫТИЙ ПРОДУКТОВ ===
  // Слушатели на уровне модуля — переживают монтирование/размонтирование компонентов
  // Решение для EDIT flow (showEditProductModal), где ProductSearchStep никогда не монтируется

  function initializeGlobalProductListeners() {
    const handleGlobalProductUpdate = (e) => {
      console.log('[AddProductStep GLOBAL] 🔄 Product event received', {
        event: e?.type,
        detail: e?.detail,
        currentVersion: globalProductsVersion,
        timestamp: new Date().toISOString()
      });

      globalProductsVersion++;

      console.log('[AddProductStep GLOBAL] ✅ Version incremented', {
        newVersion: globalProductsVersion
      });

      // Диспатчим событие для React компонентов
      window.dispatchEvent(new CustomEvent('heys:products-version-changed', {
        detail: {
          version: globalProductsVersion,
          sourceEvent: e?.type
        }
      }));

      console.log('[AddProductStep GLOBAL] 📢 Dispatched version-changed event', {
        version: globalProductsVersion
      });
    };

    // Регистрируем постоянные глобальные слушатели (никогда не удаляются)
    window.addEventListener('heys:local-product-updated', handleGlobalProductUpdate);
    window.addEventListener('heys:product-portions-updated', handleGlobalProductUpdate);
    window.addEventListener('heys:product-updated', handleGlobalProductUpdate);

    console.log('[AddProductStep GLOBAL] ✅ Global product listeners initialized', {
      initialVersion: globalProductsVersion
    });
  }

  // Инициализация при загрузке модуля
  initializeGlobalProductListeners();

  console.log('[HEYS] AddProductStep v1 loaded with global listeners');

})(typeof window !== 'undefined' ? window : global);
