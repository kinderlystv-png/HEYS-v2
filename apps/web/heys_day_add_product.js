// heys_day_add_product.js — MealAddProduct and ProductRow components for DayTab
// Extracted from heys_day_v12.js (Phase 2.3)
// Contains: MealAddProduct component, ProductRow component

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // Import utilities from dayUtils
  const U = HEYS.dayUtils || {};
  const uid = U.uid || (() => 'id_' + Date.now());
  const buildProductIndex = U.buildProductIndex || (() => ({}));
  const getProductFromItem = U.getProductFromItem || (() => null);
  const per100 = U.per100 || ((p) => ({ kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0 }));
  const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

  // ✅ Общий helper: summary-модалка для multiProductMode
  async function showMultiProductSummary({
    day,
    mealIndex,
    pIndex,
    getProductFromItem,
    per100,
    scale,
    onAddMore
  }) {
    if (!HEYS.ConfirmModal?.show) return;

    const currentDay = day || HEYS.Day?.getDay?.() || {};
    const currentMeal = currentDay?.meals?.[mealIndex];
    if (!currentMeal) return;

    const localPIndex = pIndex || HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {};
    const mealTotals = HEYS.models?.mealTotals?.(currentMeal, localPIndex) || {};
    const mealKcal = Math.round(mealTotals.kcal || 0);

    const optimumData = HEYS.dayUtils?.getOptimumForDay?.(currentDay) || {};
    const optimum = Math.round(optimumData.optimum || 2000);

    const dayTotals = HEYS.dayCalculations?.calculateDayTotals?.(currentDay, localPIndex) || {};
    const eatenKcal = Math.round(dayTotals.kcal || 0);
    const remainingKcal = optimum - eatenKcal;

    const mealScore = HEYS.mealScoring?.calcKcalScore?.(mealKcal, null, optimum, currentMeal.time, null);
    const mealQuality = HEYS.mealScoring?.getMealQualityScore?.(currentMeal, null, optimum, localPIndex, null);
    const mealKcalStatus = (() => {
      let status = 'good';
      if (mealScore?.ok === false) status = 'bad';
      else if ((mealScore?.issues || []).length > 0) status = 'warn';
      if (mealQuality?.score != null) {
        if (mealQuality.score < 50) status = 'bad';
        else if (mealQuality.score < 75 && status !== 'bad') status = 'warn';
      }
      return status;
    })();
    const mealKcalColor = mealKcalStatus === 'bad'
      ? '#ef4444'
      : mealKcalStatus === 'warn'
        ? '#eab308'
        : '#22c55e';

    const heroMetrics = HEYS.dayHeroMetrics?.computeHeroMetrics?.({
      day: currentDay,
      eatenKcal,
      optimum,
      dayTargetDef: currentDay?.deficitPct,
      factDefPct: currentDay?.deficitPct,
      r0: (v) => Math.round(v),
      ratioZones: HEYS.ratioZones
    });
    const remainingColor = heroMetrics?.remainCol?.text
      || (remainingKcal > 100 ? '#22c55e' : remainingKcal >= 0 ? '#eab308' : '#ef4444');

    const mealOverLimit = (mealScore?.issues || []).some((issue) =>
      String(issue).includes('переед') || String(issue).includes('много')
    ) || mealScore?.ok === false;

    const isGoalReached = remainingKcal <= 0;
    const mealName = currentMeal.name || `Приём ${mealIndex + 1}`;

    const mealItems = (currentMeal.items || []).map((item) => {
      const product = getProductFromItem(item, localPIndex) || { name: item.name || '?' };
      const grams = +item.grams || 0;
      const p100 = per100(product);
      const itemKcal = Math.round(scale(p100.kcal100, grams));
      let name = product.name || item.name || '?';
      if (name.length > 22) name = name.slice(0, 20) + '…';
      return { name, grams, kcal: itemKcal };
    });

    const ProductsList = mealItems.length > 0 ? React.createElement('div', {
      className: 'confirm-modal-products-list',
      style: {
        margin: '10px 0',
        padding: '8px 10px',
        background: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '8px',
        fontSize: '13px'
      }
    },
      React.createElement('div', {
        style: {
          fontSize: '11px',
          fontWeight: '600',
          color: '#64748b',
          marginBottom: '6px',
          textTransform: 'uppercase',
          letterSpacing: '0.3px'
        }
      }, 'В приёме:'),
      mealItems.slice(0, 6).map((item, idx) =>
        React.createElement('div', {
          key: idx,
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '3px 0',
            borderBottom: idx < Math.min(mealItems.length, 6) - 1 ? '1px dotted #e2e8f0' : 'none'
          }
        },
          React.createElement('span', { style: { color: '#334155' } },
            item.name,
            ' ',
            React.createElement('span', { style: { color: '#94a3b8', fontSize: '11px' } }, item.grams + 'г')
          ),
          React.createElement('span', {
            style: { fontWeight: '600', color: '#475569', minWidth: '45px', textAlign: 'right' }
          }, item.kcal)
        )
      ),
      mealItems.length > 6 && React.createElement('div', {
        style: { fontSize: '11px', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }
      }, '...и ещё ' + (mealItems.length - 6)),
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '6px',
          paddingTop: '6px',
          borderTop: '1px solid #cbd5e1',
          fontWeight: '700'
        }
      },
        React.createElement('span', { style: { color: '#334155' } }, 'Итого'),
        React.createElement('span', { style: { color: mealKcalColor } }, mealKcal + ' ккал')
      )
    ) : null;

    let modalResult = false;

    if (isGoalReached) {
      modalResult = await HEYS.ConfirmModal.show({
        icon: '🎉',
        title: 'Норма выполнена!',
        text: React.createElement('div', { className: 'confirm-modal-text-block' },
          React.createElement('div', null,
            'Отличная работа! В "',
            mealName,
            '" уже ',
            React.createElement('span', {
              className: 'confirm-modal-kcal',
              style: { color: mealKcalColor }
            }, mealKcal + ' ккал'),
            '.'
          ),
          ProductsList,
          React.createElement('div', { style: { marginTop: '8px' } },
            'Всего за день: ',
            React.createElement('span', {
              className: 'confirm-modal-kcal',
              style: { color: remainingColor }
            }, eatenKcal + ' ккал')
          )
        ),
        confirmText: 'Добавить ещё',
        cancelText: 'Завершить 🎊',
        confirmStyle: 'success',
        cancelStyle: 'primary',
        confirmVariant: 'fill',
        cancelVariant: 'fill'
      });

      if (!modalResult && HEYS.Confetti?.fire) {
        HEYS.Confetti.fire();
      }
    } else {
      modalResult = await HEYS.ConfirmModal.show({
        icon: '🍽️',
        title: `Добавить ещё в ${String(mealName).toLowerCase()}?`,
        text: React.createElement('div', { className: 'confirm-modal-text-block' },
          ProductsList,
          React.createElement('div', { style: { marginTop: ProductsList ? '8px' : '0' } },
            'До нормы сегодня осталось ',
            React.createElement('span', {
              className: 'confirm-modal-remaining',
              style: { color: remainingColor }
            }, Math.max(0, remainingKcal) + ' ккал'),
            '.'
          ),
          mealOverLimit && React.createElement('div', { className: 'confirm-modal-warning' },
            '⚠️ Похоже, приём уже тяжеловат.'
          )
        ),
        confirmText: 'Добавить ещё',
        cancelText: 'Завершить',
        confirmStyle: 'success',
        cancelStyle: 'primary',
        confirmVariant: 'fill',
        cancelVariant: 'fill'
      });
    }

    if (modalResult && onAddMore) {
      onAddMore(currentDay);
    }
  }

  HEYS.dayAddProductSummary = HEYS.dayAddProductSummary || {};
  HEYS.dayAddProductSummary.show = showMultiProductSummary;

  // === MealAddProduct Component (extracted for stable identity) ===
  const MealAddProduct = React.memo(function MealAddProduct({
    mi,
    products,
    date,
    day,
    setDay,
    isCurrentMeal = false,
    multiProductMode = false,
    buttonText = 'Добавить еще продукт',
    buttonIcon = '🔍',
    buttonClassName = '',
    highlightCurrent = true,
    ariaLabel = 'Добавить продукт'
  }) {
    const getLatestProducts = React.useCallback(() => {
      const fromHeys = HEYS.products?.getAll?.() || [];
      const fromStore = HEYS.store?.get?.('heys_products', []) || [];
      const fromLs = U.lsGet ? U.lsGet('heys_products', []) : [];

      if (fromHeys.length > 0) return fromHeys;
      if (fromStore.length > 0) return fromStore;
      if (fromLs.length > 0) return fromLs;
      return Array.isArray(products) ? products : [];
    }, [products]);

    const getLatestDay = React.useCallback(() => {
      return day || HEYS.Day?.getDay?.() || {};
    }, [day]);

    const handleOpenModal = React.useCallback(() => {
      try { navigator.vibrate?.(10); } catch (e) { }

      const handleAddPhoto = async ({ mealIndex, photo, filename, timestamp }) => {
        const activeDay = getLatestDay();
        const activeMeal = activeDay?.meals?.[mealIndex];

        // Проверяем лимит фото (10 на приём)
        const currentPhotos = activeMeal?.photos?.length || 0;
        if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
          HEYS.Toast?.warning(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`) || alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
          return;
        }

        // Получаем данные для загрузки
        const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
        const mealId = activeMeal?.id || uid('meal_');
        const photoId = uid('photo_');

        // Пытаемся загрузить в облако
        let photoData = {
          id: photoId,
          data: photo,
          filename,
          timestamp,
          pending: true,
          uploading: true,
          uploaded: false
        };

        // Сначала добавляем в UI (для мгновенного отображения)
        setDay((prevDay = {}) => {
          const meals = (prevDay.meals || []).map((m, i) =>
            i === mealIndex
              ? {
                ...m,
                photos: [...(m.photos || []), photoData]
              }
              : m
          );
          return { ...prevDay, meals, updatedAt: Date.now() };
        });

        try { navigator.vibrate?.(10); } catch (e) { }

        // Асинхронно загружаем в облако
        if (HEYS.cloud?.uploadPhoto) {
          try {
            const result = await HEYS.cloud.uploadPhoto(photo, clientId, date, mealId);

            if (result?.uploaded && result?.url) {
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, url: result.url, data: undefined, pending: false, uploading: false, uploaded: true }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            } else if (result?.pending) {
              setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== mealIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, uploading: false }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            }
          } catch (e) {
            setDay((prevDay = {}) => {
              const meals = (prevDay.meals || []).map((m, i) => {
                if (i !== mealIndex || !m.photos) return m;
                return {
                  ...m,
                  photos: m.photos.map(p =>
                    p.id === photoId
                      ? { ...p, uploading: false }
                      : p
                  )
                };
              });
              return { ...prevDay, meals, updatedAt: Date.now() };
            });
            console.warn('[HEYS] Photo upload failed, will retry later:', e);
          }
        }
      };

      const handleNewProduct = () => {
        if (window.HEYS?.products?.showAddModal) {
          window.HEYS.products.showAddModal();
        }
      };

      const openAddModal = (override = {}) => {
        const latestDay = override.day || getLatestDay();
        const latestMeal = latestDay?.meals?.[mi] || {};
        const latestProducts = getLatestProducts();

        if (window.HEYS?.AddProductStep?.show) {
          window.HEYS.AddProductStep.show({
            mealIndex: mi,
            mealPhotos: latestMeal.photos || [],
            products: latestProducts,
            day: latestDay,
            dateKey: date,
            multiProductMode,
            onAdd: handleAdd,
            onAddPhoto: handleAddPhoto,
            onNewProduct: handleNewProduct
          });
        } else {
          console.error('[HEYS] AddProductStep not loaded');
        }
      };

      const handleAdd = ({ product, grams, mealIndex }) => {
        console.info('[HEYS.day] ➕ Add product to meal (modal)', {
          mealIndex,
          grams,
          productId: product?.id ?? product?.product_id ?? null,
          productName: product?.name || null,
          source: product?._source || (product?._fromShared ? 'shared' : 'personal')
        });
        // 🌐 Если продукт из общей базы — автоматически клонируем в личную
        let finalProduct = product;
        if (product?._fromShared || product?._source === 'shared') {
          const cloned = window.HEYS?.products?.addFromShared?.(product);
          if (cloned) {
            finalProduct = cloned;
          }
        }

        // 🔍 DEBUG: Подробный лог при добавлении продукта в meal
        const hasNutrients = !!(finalProduct?.kcal100 || finalProduct?.protein100 || finalProduct?.carbs100);
        if (!hasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', finalProduct);
        }

        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
        const computeTEFKcal100 = (p) => {
          const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
          const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
          // NET Atwater: protein 3 kcal/g (TEF 25% built-in: 4×0.75=3), carbs 4 kcal/g, fat 9 kcal/g
          return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
        };
        const additivesList = Array.isArray(finalProduct.additives) ? finalProduct.additives : undefined;
        const novaGroup = finalProduct.nova_group ?? finalProduct.novaGroup;
        const nutrientDensity = finalProduct.nutrient_density ?? finalProduct.nutrientDensity;
        const newItem = {
          id: uid('it_'),
          product_id: finalProduct.id ?? finalProduct.product_id,
          name: finalProduct.name,
          fingerprint: finalProduct.fingerprint,
          grams: grams || 100,
          portions: Array.isArray(finalProduct.portions) ? finalProduct.portions : undefined,
          ...(finalProduct.kcal100 !== undefined && {
            kcal100: computeTEFKcal100(finalProduct),
            protein100: finalProduct.protein100,
            carbs100: finalProduct.carbs100,
            fat100: finalProduct.fat100,
            simple100: finalProduct.simple100,
            complex100: finalProduct.complex100,
            badFat100: finalProduct.badFat100,
            goodFat100: finalProduct.goodFat100,
            trans100: finalProduct.trans100,
            fiber100: finalProduct.fiber100,
            sodium100: finalProduct.sodium100,
            omega3_100: finalProduct.omega3_100,
            omega6_100: finalProduct.omega6_100,
            nova_group: novaGroup,
            additives: additivesList,
            nutrient_density: nutrientDensity,
            is_organic: finalProduct.is_organic,
            is_whole_grain: finalProduct.is_whole_grain,
            is_fermented: finalProduct.is_fermented,
            is_raw: finalProduct.is_raw,
            vitamin_a: finalProduct.vitamin_a,
            vitamin_c: finalProduct.vitamin_c,
            vitamin_d: finalProduct.vitamin_d,
            vitamin_e: finalProduct.vitamin_e,
            vitamin_k: finalProduct.vitamin_k,
            vitamin_b1: finalProduct.vitamin_b1,
            vitamin_b2: finalProduct.vitamin_b2,
            vitamin_b3: finalProduct.vitamin_b3,
            vitamin_b6: finalProduct.vitamin_b6,
            vitamin_b9: finalProduct.vitamin_b9,
            vitamin_b12: finalProduct.vitamin_b12,
            calcium: finalProduct.calcium,
            iron: finalProduct.iron,
            magnesium: finalProduct.magnesium,
            phosphorus: finalProduct.phosphorus,
            potassium: finalProduct.potassium,
            zinc: finalProduct.zinc,
            selenium: finalProduct.selenium,
            iodine: finalProduct.iodine,
            gi: finalProduct.gi,
            harm: HEYS.models?.normalizeHarm?.(finalProduct)
          })
        };

        const itemHasNutrients = !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100);
        if (!itemHasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
            newItem,
            finalProduct,
            spreadCondition: finalProduct.kcal100 !== undefined
          });
        }

        const newUpdatedAt = Date.now();
        if (HEYS.Day?.setBlockCloudUpdates) {
          HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
        } else {
          console.warn('[HEYS.day] ⚠️ setBlockCloudUpdates missing');
        }
        if (HEYS.Day?.setLastLoadedUpdatedAt) {
          HEYS.Day.setLastLoadedUpdatedAt(newUpdatedAt);
        } else {
          console.warn('[HEYS.day] ⚠️ setLastLoadedUpdatedAt missing');
        }

        setDay((prevDay = {}) => {
          const mealsList = prevDay.meals || [];
          if (!mealsList[mealIndex]) {
            console.warn('[HEYS.day] ❌ Meal index not found for add', {
              mealIndex,
              mealsCount: mealsList.length,
              productName: finalProduct?.name || null
            });
          }
          const meals = mealsList.map((m, i) =>
            i === mealIndex
              ? { ...m, items: [...(m.items || []), newItem] }
              : m
          );
          return { ...prevDay, meals, updatedAt: newUpdatedAt };
        });

        requestAnimationFrame(() => {
          setTimeout(() => {
            if (HEYS.Day?.requestFlush) {
              HEYS.Day.requestFlush();
            }
          }, 50);
        });

        try { navigator.vibrate?.(10); } catch (e) { }

        window.dispatchEvent(new CustomEvent('heysProductAdded', {
          detail: { product, grams }
        }));

        try {
          if (HEYS.store?.set) {
            HEYS.store.set(`heys_last_grams_${productId}`, grams);
          } else if (U.lsSet) {
            U.lsSet(`heys_last_grams_${productId}`, grams);
          } else {
            localStorage.setItem(`heys_last_grams_${productId}`, JSON.stringify(grams));
          }

          const history = HEYS.store?.get
            ? HEYS.store.get('heys_grams_history', {})
            : (U.lsGet ? U.lsGet('heys_grams_history', {}) : {});
          if (!history[productId]) history[productId] = [];
          history[productId].push(grams);
          if (history[productId].length > 20) history[productId].shift();

          if (HEYS.store?.set) {
            HEYS.store.set('heys_grams_history', history);
          } else if (U.lsSet) {
            U.lsSet('heys_grams_history', history);
          } else {
            localStorage.setItem('heys_grams_history', JSON.stringify(history));
          }
        } catch (e) { }

        if (multiProductMode && HEYS.dayAddProductSummary?.show) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              HEYS.dayAddProductSummary.show({
                day: HEYS.Day?.getDay?.() || day || {},
                mealIndex,
                pIndex: HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {},
                getProductFromItem,
                per100,
                scale,
                onAddMore: (updatedDay) => openAddModal({ day: updatedDay })
              });
            }, 100);
          });
        }
      };

      openAddModal();
    }, [mi, date, day, setDay, getLatestDay, getLatestProducts, multiProductMode]);

    return React.createElement('button', {
      className: 'aps-open-btn'
        + ((highlightCurrent && isCurrentMeal) ? ' aps-open-btn--current' : '')
        + (buttonClassName ? ` ${buttonClassName}` : ''),
      onClick: handleOpenModal,
      'aria-label': ariaLabel
    },
      React.createElement('span', { className: 'aps-open-icon' }, buttonIcon),
      React.createElement('span', { className: 'aps-open-text' }, buttonText)
    );
  }, (prev, next) => {
    if (prev.mi !== next.mi) return false;
    if (prev.products !== next.products) return false;

    const prevItems = prev.day?.meals?.[prev.mi]?.items;
    const nextItems = next.day?.meals?.[next.mi]?.items;
    if (prevItems !== nextItems) return false;

    return true;
  });

  const MEAL_HEADER_META = [
    { label: '' },
    { label: 'г' },
    { label: 'ккал<br>/100', per100: true },
    { label: 'У<br>/100', per100: true },
    { label: 'Прост<br>/100', per100: true },
    { label: 'Сл<br>/100', per100: true },
    { label: 'Б<br>/100', per100: true },
    { label: 'Ж<br>/100', per100: true },
    { label: 'ВрЖ<br>/100', per100: true },
    { label: 'ПолЖ<br>/100', per100: true },
    { label: 'СупЖ<br>/100', per100: true },
    { label: 'Клет<br>/100', per100: true },
    { label: 'ккал' },
    { label: 'У' },
    { label: 'Прост' },
    { label: 'Сл' },
    { label: 'Б' },
    { label: 'Ж' },
    { label: 'ВрЖ' },
    { label: 'ПолЖ' },
    { label: 'СупЖ' },
    { label: 'Клет' },
    { label: 'ГИ' },
    { label: 'Вред' },
    { label: '' }
  ];

  function fmtVal(key, v) {
    if (v == null || v === '') return '-';
    const num = +v || 0;
    if (key === 'harm') return Math.round(num * 10) / 10; // вредность с одной десятичной
    if (!num) return '-';
    return Math.round(num); // всё остальное до целых
  }

  const harmMissingLogged = new Set();
  function logMissingHarm(name, item, source) {
    if (!HEYS.analytics?.trackDataOperation) return;
    const key = `${source || 'meal-table'}:${(name || 'unknown').toLowerCase()}`;
    if (harmMissingLogged.has(key)) return;
    harmMissingLogged.add(key);
    HEYS.analytics.trackDataOperation('harm_missing_in_meal_card', {
      source: source || 'meal-table',
      name: name || null,
      productId: item?.product_id ?? item?.productId ?? item?.id ?? null,
      hasItemHarm: HEYS.models?.normalizeHarm?.(item) != null,
    });
  }

  const ProductRow = React.memo(function ProductRow({
    item,
    mealIndex,
    isNew,
    pIndex,
    setGrams,
    removeItem
  }) {
    const p = getProductFromItem(item, pIndex) || { name: item.name || '?' };
    const grams = +item.grams || 0;
    const per = per100(p);
    const row = {
      kcal: scale(per.kcal100, grams),
      carbs: scale(per.carbs100, grams),
      simple: scale(per.simple100, grams),
      complex: scale(per.complex100, grams),
      prot: scale(per.prot100, grams),
      fat: scale(per.fat100, grams),
      bad: scale(per.bad100, grams),
      good: scale(per.good100, grams),
      trans: scale(per.trans100, grams),
      fiber: scale(per.fiber100, grams)
    };
    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? item.gi;
    // Use centralized harm normalization with fallback to item
    const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(item);
    if (harmVal == null) {
      logMissingHarm(p.name, item, 'meal-table');
    }
    return React.createElement('tr', { 'data-new': isNew ? 'true' : 'false' },
      React.createElement('td', { 'data-cell': 'name' }, p.name),
      React.createElement('td', { 'data-cell': 'grams' }, React.createElement('input', {
        type: 'number',
        value: grams,
        'data-grams-input': true,
        'data-meal-index': mealIndex,
        'data-item-id': item.id,
        onChange: e => setGrams(mealIndex, item.id, e.target.value),
        onKeyDown: e => {
          if (e.key === 'Enter') {
            e.target.blur(); // Убрать фокус после подтверждения
          }
        },
        onFocus: e => e.target.select(), // Выделить текст при фокусе
        placeholder: 'грамм',
        style: { textAlign: 'center' }
      })),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('kcal100', per.kcal100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('carbs100', per.carbs100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('simple100', per.simple100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('complex100', per.complex100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('prot100', per.prot100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fat100', per.fat100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('bad', per.bad100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('good100', per.good100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('trans100', per.trans100)),
      React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fiber100', per.fiber100)),
      React.createElement('td', { 'data-cell': 'kcal' }, fmtVal('kcal', row.kcal)),
      React.createElement('td', { 'data-cell': 'carbs' }, fmtVal('carbs', row.carbs)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('simple', row.simple)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('complex', row.complex)),
      React.createElement('td', { 'data-cell': 'prot' }, fmtVal('prot', row.prot)),
      React.createElement('td', { 'data-cell': 'fat' }, fmtVal('fat', row.fat)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('bad', row.bad)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('good', row.good)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('trans', row.trans)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('fiber', row.fiber)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('gi', giVal)),
      React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('harm', harmVal)),
      React.createElement('td', { 'data-cell': 'delete' }, React.createElement('button', { className: 'btn secondary', onClick: () => removeItem(mealIndex, item.id) }, '×'))
    );
  });

  // Export to HEYS namespace
  HEYS.dayComponents = HEYS.dayComponents || {};
  HEYS.dayComponents.MealAddProduct = MealAddProduct;
  HEYS.dayComponents.ProductRow = ProductRow;

})(window);
