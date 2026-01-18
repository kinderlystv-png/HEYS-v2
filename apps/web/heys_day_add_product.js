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

  // === MealAddProduct Component (extracted for stable identity) ===
  const MealAddProduct = React.memo(function MealAddProduct({
    mi,
    products,
    date,
    day,
    setDay,
    isCurrentMeal = false
  }) {
    const handleOpenModal = React.useCallback(() => {
      try { navigator.vibrate?.(10); } catch (e) { }

      const meal = day?.meals?.[mi] || {};

      if (window.HEYS?.AddProductStep?.show) {
        window.HEYS.AddProductStep.show({
          mealIndex: mi,
          mealPhotos: meal.photos || [], // Текущие фото для счётчика
          products,
          dateKey: date,
          onAdd: ({ product, grams, mealIndex }) => {
            // 🌐 Если продукт из общей базы — автоматически клонируем в личную
            let finalProduct = product;
            if (product?._fromShared || product?._source === 'shared') {
              // console.log('[DayTab] 🌐 Shared product detected, auto-cloning to local:', product.name);
              const cloned = window.HEYS?.products?.addFromShared?.(product);
              if (cloned) {
                finalProduct = cloned;
                // console.log('[DayTab] ✅ Cloned product id:', cloned.id);
              }
            }

            // 🔍 DEBUG: Подробный лог при добавлении продукта в meal
            const hasNutrients = !!(finalProduct?.kcal100 || finalProduct?.protein100 || finalProduct?.carbs100);
            // console.log('[DayTab] onAdd received:', finalProduct?.name, 'grams:', grams, {
            //   id: finalProduct?.id,
            //   hasNutrients,
            //   kcal100: finalProduct?.kcal100,
            //   protein100: finalProduct?.protein100,
            //   mealIndex,
            //   wasShared: product?._fromShared || product?._source === 'shared'
            // });
            if (!hasNutrients) {
              console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', finalProduct);
            }

            const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
            // TEF-aware kcal100: пересчитываем по формуле 3*protein + 4*carbs + 9*fat
            // чтобы snapshot совпадал с UI (computeDerivedProduct)
            const computeTEFKcal100 = (p) => {
              const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
              const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
              return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
            };
            const additivesList = Array.isArray(finalProduct.additives) ? finalProduct.additives : undefined;
            const novaGroup = finalProduct.nova_group ?? finalProduct.novaGroup;
            const nutrientDensity = finalProduct.nutrient_density ?? finalProduct.nutrientDensity;
            const newItem = {
              id: uid('it_'),
              product_id: finalProduct.id ?? finalProduct.product_id,
              name: finalProduct.name,
              grams: grams || 100,
              // Для новых продуктов сохраняем нутриенты напрямую (fallback если продукт не в индексе)
              ...(finalProduct.kcal100 !== undefined && {
                kcal100: computeTEFKcal100(finalProduct), // TEF-aware пересчёт
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
                harm: HEYS.models?.normalizeHarm?.(finalProduct)  // Canonical harm field
              })
            };

            // 🔍 DEBUG: Проверка финального newItem
            const itemHasNutrients = !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100);
            // console.log('[DayTab] newItem created:', newItem.name, {
            //   itemHasNutrients,
            //   kcal100: newItem.kcal100,
            //   protein100: newItem.protein100,
            //   productKcal100: finalProduct.kcal100,
            //   spreadCondition: finalProduct.kcal100 !== undefined
            // });
            if (!itemHasNutrients) {
              console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
                newItem,
                finalProduct,
                spreadCondition: finalProduct.kcal100 !== undefined
              });
            }

            // 🔒 КРИТИЧНО: Защита от перезаписи cloud sync при добавлении продукта
            // Используем глобальный API вместо ref (MealAddProduct - отдельный компонент)
            const newUpdatedAt = Date.now();
            if (HEYS.Day?.setBlockCloudUpdates) {
              HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
              // console.log('[MealAddProduct] 🔒 Blocking cloud updates until:', newUpdatedAt + 3000);
            }
            // 🔒 ВАЖНО: Обновляем lastLoadedUpdatedAt чтобы handleDayUpdated не перезаписал
            if (HEYS.Day?.setLastLoadedUpdatedAt) {
              HEYS.Day.setLastLoadedUpdatedAt(newUpdatedAt);
            }

            setDay((prevDay = {}) => {
              const meals = (prevDay.meals || []).map((m, i) =>
                i === mealIndex
                  ? { ...m, items: [...(m.items || []), newItem] }
                  : m
              );
              return { ...prevDay, meals, updatedAt: newUpdatedAt };
            });

            // 🔧 FIX: Сразу сохраняем день после добавления продукта
            // Без этого setDay() только ставит debounce 500ms, а гонка с облачным sync
            // может привести к тому что heys_grams_* сохранятся раньше чем day
            // requestAnimationFrame + setTimeout гарантирует выполнение после React re-render и useEffect
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (HEYS.Day?.requestFlush) {
                  HEYS.Day.requestFlush();
                  // console.log('[DayTab] 💾 Forced flush after product add');
                }
              }, 50);
            });

            try { navigator.vibrate?.(10); } catch (e) { }

            window.dispatchEvent(new CustomEvent('heysProductAdded', {
              detail: { product, grams }
            }));

            try {
              U.lsSet(`heys_last_grams_${productId}`, grams);
              const history = U.lsGet('heys_grams_history', {});
              if (!history[productId]) history[productId] = [];
              history[productId].push(grams);
              if (history[productId].length > 20) history[productId].shift();
              U.lsSet('heys_grams_history', history);
            } catch (e) { }
          },
          onAddPhoto: async ({ mealIndex, photo, filename, timestamp }) => {
            // Проверяем лимит фото (10 на приём)
            const meal = day?.meals?.[mealIndex];
            const currentPhotos = meal?.photos?.length || 0;
            if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
              HEYS.Toast?.warning(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`) || alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
              return;
            }

            // Получаем данные для загрузки
            const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
            const mealId = meal?.id || uid('meal_');
            const photoId = uid('photo_');

            // Пытаемся загрузить в облако
            let photoData = {
              id: photoId,
              data: photo, // Временно храним base64 для отображения
              filename,
              timestamp,
              pending: true,
              uploading: true, // Индикатор загрузки
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
                  // Успешно загружено — обновляем фото в состоянии
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
                  // Сохранено для загрузки позже (offline)
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
                // Убираем флаг uploading при ошибке
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
          },
          onNewProduct: () => {
            if (window.HEYS?.products?.showAddModal) {
              window.HEYS.products.showAddModal();
            }
          }
        });
      } else {
        console.error('[HEYS] AddProductStep not loaded');
      }
    }, [mi, products, date, day, setDay]);

    return React.createElement('button', {
      className: 'aps-open-btn' + (isCurrentMeal ? ' aps-open-btn--current' : ''),
      onClick: handleOpenModal,
      'aria-label': 'Добавить продукт'
    },
      React.createElement('span', { className: 'aps-open-icon' }, '🔍'),
      React.createElement('span', { className: 'aps-open-text' }, 'Добавить еще продукт')
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
