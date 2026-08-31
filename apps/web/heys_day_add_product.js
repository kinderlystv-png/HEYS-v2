// heys_day_add_product.js — MealAddProduct and ProductRow components for DayTab
// Extracted from heys_day_v12.js (Phase 2.3)
// Contains: MealAddProduct component, ProductRow component

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // Import utilities from dayUtils
  const U = HEYS.dayUtils || {};
  const uid = U.uid || ((prefix = 'id_') => prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const buildProductIndex = U.buildProductIndex || (() => ({}));
  const getProductFromItem = U.getProductFromItem || (() => null);
  const per100 = U.per100 || ((p) => ({ kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0 }));
  const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

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

  function computeTEFKcal100(p) {
    const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
    const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
    // NET Atwater: protein 3 kcal/g (TEF 25% built-in: 4x0.75=3), carbs 4 kcal/g, fat 9 kcal/g
    return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
  }

  function resolveProductForMealAdd(product) {
    if (!product?._oneTime && (product?._fromShared || product?._source === 'shared')) {
      const cloned = window.HEYS?.products?.addFromShared?.(product);
      if (cloned) return cloned;
    }
    return product || {};
  }

  function buildMealItemFromProduct(product, grams) {
    const finalProduct = resolveProductForMealAdd(product);
    const additivesList = Array.isArray(finalProduct?.additives) ? finalProduct.additives : undefined;
    const novaGroup = finalProduct?.nova_group ?? finalProduct?.novaGroup;
    const nutrientDensity = finalProduct?.nutrient_density ?? finalProduct?.nutrientDensity;
    const newItem = {
      id: uid('it_'),
      product_id: finalProduct?.id ?? finalProduct?.product_id,
      name: finalProduct?.name,
      brand: finalProduct.brand || null,
      brand_fingerprint: finalProduct.brand_fingerprint || finalProduct.brandFingerprint || null,
      fingerprint: finalProduct?.fingerprint,
      grams: grams || 100,
      portions: Array.isArray(finalProduct?.portions) ? finalProduct.portions.map(p => ({ ...p })) : undefined,
      ...(finalProduct?._oneTime && { _oneTime: true }),
      ...(finalProduct?.kcal100 !== undefined && {
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
    const recipeSnap = HEYS.models?.recipeSnapshotFields?.(finalProduct);
    if (recipeSnap) {
      newItem.recipe_yield = recipeSnap.recipe_yield;
      newItem.recipe_items = recipeSnap.recipe_items;
      newItem.recipe_rev = recipeSnap.recipe_rev;
    }

    return {
      finalProduct,
      productId: finalProduct?.id ?? finalProduct?.product_id ?? finalProduct?.name,
      newItem,
      itemHasNutrients: !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100)
    };
  }

  function appendItemsToMeal(day, mealIndex, itemsToAppend) {
    const mealsList = day?.meals || [];
    return mealsList.map((m, i) =>
      i === mealIndex
        ? { ...m, items: [...(m.items || []), ...(itemsToAppend || [])] }
        : m
    );
  }

  function resolveMealIndex(day, mealIndex, mealId) {
    const mealsList = Array.isArray(day?.meals) ? day.meals : [];
    if (mealId) {
      const byId = mealsList.findIndex((m) => m && m.id === mealId);
      if (byId >= 0) return byId;
    }
    return Number.isInteger(mealIndex) ? mealIndex : Number(mealIndex);
  }

  function appendItemsToMealTarget(day, mealIndex, mealId, itemsToAppend) {
    const targetIndex = resolveMealIndex(day, mealIndex, mealId);
    return {
      mealIndex: targetIndex,
      meals: appendItemsToMeal(day, targetIndex, itemsToAppend)
    };
  }

  function recordGramsForProduct(productId, grams, finalProduct) {
    if (!productId || finalProduct?._oneTime) return;
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(`heys_last_grams_${productId}`, grams);
      } else if (U.lsSet) {
        U.lsSet(`heys_last_grams_${productId}`, grams);
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
      }
    } catch (e) { }
  }

  function dispatchProductAdded(detail) {
    try {
      window.dispatchEvent(new CustomEvent('heysProductAdded', {
        detail: {
          source: 'day-add-product-modal',
          ...(detail || {})
        }
      }));
    } catch (_) { }
  }

  function dispatchMealFlowFinished(detail) {
    try {
      window.dispatchEvent(new CustomEvent('heys:meal-flow-finished', {
        detail: {
          source: 'day-add-product-single',
          ...(detail || {})
        }
      }));
    } catch (_) { }
  }

  const PHOTO_LIMIT_PER_MEAL = HEYS.dayGallery?.PHOTO_LIMIT_PER_MEAL || 10;

  // ✅ Общий helper: summary-модалка для multiProductMode (канвас v4 · экран 6)
  function MealSummaryV4Step({ context }) {
    const fileInputRef = React.useRef(null);
    const {
      mealItems,
      mealKcal,
      mealItemCount,
      remainingKcal,
      isGoalReached,
      onAddMore,
      onSavePreset,
      onPhoto,
      onDone,
      mealIndex,
      mealId,
      mealPhotos: initialMealPhotos,
      summaryTitle,
      dayKcal
    } = context || {};

    const [mealPhotos, setMealPhotos] = React.useState(() => Array.isArray(initialMealPhotos) ? initialMealPhotos : []);

    React.useEffect(() => {
      if (Array.isArray(initialMealPhotos)) {
        setMealPhotos(initialMealPhotos);
      }
    }, [initialMealPhotos]);

    const productWord = mealItemCount === 1
      ? 'продукт'
      : (mealItemCount >= 2 && mealItemCount <= 4 ? 'продукта' : 'продуктов');

    const photosAtLimit = mealPhotos.length >= PHOTO_LIMIT_PER_MEAL;

    const handlePhotoPick = () => {
      if (typeof onPhoto !== 'function' || photosAtLimit) return;
      fileInputRef.current?.click();
    };

    const handlePhotoFile = (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || typeof onPhoto !== 'function') return;
      const reader = new FileReader();
      reader.onload = () => {
        const payload = {
          mealIndex,
          mealId,
          photo: reader.result,
          filename: file.name,
          timestamp: Date.now()
        };
        onPhoto(payload);
        setMealPhotos((prev) => [...prev, {
          id: `local_${Date.now()}`,
          data: payload.photo,
          filename: payload.filename,
          timestamp: payload.timestamp,
          pending: true,
          uploading: true
        }]);
      };
      reader.readAsDataURL(file);
    };

    const openPhotoViewer = (photoIndex) => {
      if (!mealPhotos.length) return;
      if (typeof HEYS.showPhotoViewer === 'function') {
        // Кадр «Фото · просмотр»: в шапке имя приёма, внизу «Ещё снимок».
        HEYS.showPhotoViewer([...mealPhotos], photoIndex, null, {
          title: summaryTitle || '',
          onAddMore: photosAtLimit ? null : handlePhotoPick
        });
      } else {
        const src = mealPhotos[photoIndex]?.data || mealPhotos[photoIndex]?.url;
        if (src) window.open(src, '_blank');
      }
    };

    return React.createElement('div', { className: 'aps-v4-meal-summary' },
      typeof onPhoto === 'function' && React.createElement('input', {
        ref: fileInputRef,
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        style: { display: 'none' },
        onChange: handlePhotoFile
      }),
      React.createElement('div', { className: 'aps-v4-meal-summary__hero' },
        React.createElement('div', { className: 'aps-v4-meal-summary__hero-label' }, 'Итого за приём'),
        React.createElement('div', { className: 'aps-v4-meal-summary__hero-metrics' },
          React.createElement('span', { className: 'aps-v4-meal-summary__hero-kcal' }, String(mealKcal)),
          React.createElement('span', { className: 'aps-v4-meal-summary__hero-meta' },
            `ккал · ${mealItemCount} ${productWord}`)
        ),
        // Строка «число дня в блоке „В приёме"»: под калорийностью приёма идут
        // две величины — сколько всего за день и сколько осталось до нормы. В
        // переборе меняется только вторая половина, первая остаётся как есть.
        React.createElement('div', { className: 'aps-v4-meal-summary__hero-foot' },
          Number.isFinite(dayKcal) ? `Всего за день ${dayKcal} · ` : '',
          isGoalReached
            ? React.createElement('span', { className: 'aps-v4-meal-summary__hero-over' },
              `перебор ${Math.abs(Math.min(0, remainingKcal))}`)
            : `до нормы остаётся ${Math.max(0, remainingKcal)}`)
      ),
      React.createElement('div', { className: 'aps-v4-meal-summary__list' },
        (mealItems || []).map((item, index) =>
          React.createElement('div', {
            key: `${item.name}-${item.grams}-${index}`,
            className: 'aps-v4-meal-summary__row' + (index === mealItems.length - 1 ? ' is-last' : '')
          },
            React.createElement('span', { className: 'aps-v4-meal-summary__row-name' },
              item.name,
              ' ',
              React.createElement('span', { className: 'aps-v4-meal-summary__row-grams' }, `${item.grams} г`),
              item.recipeLine
                ? React.createElement('div', { className: 'aps-v4-meal-summary__row-recipe' }, item.recipeLine)
                : null
            ),
            React.createElement('span', { className: 'aps-v4-meal-summary__row-kcal' }, String(item.kcal))
          )
        )
      ),
      typeof onPhoto === 'function' && React.createElement('div', { className: 'aps-v4-meal-summary__photo-tier' }, 'Фото приёма'),
      typeof onPhoto === 'function' && React.createElement('div', { className: 'aps-v4-meal-summary__photo-grid' },
        mealPhotos.map((photo, photoIndex) => {
          const src = photo.data || photo.url;
          if (!src) return null;
          const timeStr = photo.timestamp
            ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            : null;
          const handleDeletePhoto = (event) => {
            event?.stopPropagation?.();
            event?.preventDefault?.();
            setMealPhotos((prev) => prev.filter((_, index) => index !== photoIndex));
          };
          return React.createElement('div', {
            key: photo.id || photoIndex,
            className: 'aps-v4-meal-summary__photo-thumb-wrap'
          },
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-meal-summary__photo-thumb',
              onClick: () => openPhotoViewer(photoIndex),
              'aria-label': 'Открыть фото приёма'
            },
              React.createElement('img', { src, alt: '' }),
              timeStr && React.createElement('span', { className: 'aps-v4-meal-summary__photo-time' }, timeStr)
            ),
            React.createElement('button', {
              type: 'button',
              className: 'aps-v4-meal-summary__photo-delete',
              onClick: handleDeletePhoto,
              'aria-label': 'Удалить фото'
            })
          );
        }),
        !photosAtLimit && React.createElement('button', {
          type: 'button',
          className: 'aps-v4-meal-summary__photo-add',
          onClick: handlePhotoPick,
          'aria-label': 'Снять фото приёма'
        },
          // Кадр «Приём собран · фото»: значок камеры 19 px тоном --ac и слово
          // «Снять». Стоял знак «+» 22 px и слово «Добавить» — по виду это была
          // ещё одна кнопка добавления рядом с «Добавить ещё».
          React.createElement('svg', {
            className: 'aps-v4-meal-summary__photo-add-icon',
            width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round',
            strokeLinejoin: 'round', 'aria-hidden': 'true'
          },
            React.createElement('path', { d: 'M4 8h3l2-2h6l2 2h3v11H4z' }),
            React.createElement('circle', { cx: 12, cy: 13, r: 3.5 })
          ),
          React.createElement('span', null, 'Снять')
        )
      ),
      typeof onPhoto === 'function' && React.createElement('div', { className: 'aps-v4-meal-summary__photo-note' },
        'Фото принадлежит приёму, не продукту. Снимков может быть несколько, тап открывает на весь экран.'
      ),
      React.createElement('div', { className: 'aps-v4-meal-summary__actions aps-v4-meal-summary__actions--row' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost aps-v4-meal-summary__btn aps-v4-btn-paper',
          onClick: onAddMore
        }, 'Добавить ещё'),
        typeof onSavePreset === 'function' && React.createElement('button', {
          type: 'button',
          className: 'aps-v4-btn-ghost aps-v4-meal-summary__btn aps-v4-btn-paper',
          onClick: onSavePreset
        }, 'Сохранить как набор')
      ),
      React.createElement('button', {
        type: 'button',
        className: 'aps-v4-btn-primary aps-v4-meal-summary__done',
        onClick: onDone
      }, 'Готово')
    );
  }

  async function showMultiProductSummary({
    day,
    mealIndex,
    pIndex,
    getProductFromItem,
    per100,
    scale,
    onAddMore,
    onAddLast,
    onPhoto,
    onSavePreset,
    mealId: requestedMealId
  }) {
    if (!HEYS.StepModal?.show) return;

    const currentDay = day || HEYS.Day?.getDay?.() || {};
    const resolvedMealIndex = resolveMealIndex(currentDay, mealIndex, requestedMealId);
    const currentMeal = currentDay?.meals?.[resolvedMealIndex];
    if (!currentMeal) return;

    const localPIndex = pIndex || HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {};
    const mealTotals = HEYS.models?.mealTotals?.(currentMeal, localPIndex) || {};
    const mealKcal = Math.round(mealTotals.kcal || 0);

    const profile = HEYS.utils?.lsGet?.('heys_profile', {}) || {};
    const optimumData = HEYS.TDEE?.resolveDailyTargets?.(profile, currentDay) || {};
    const optimum = Math.round(optimumData.kcal || 2000);

    const dayTotals = HEYS.dayCalculations?.calculateDayTotals?.(currentDay, localPIndex) || {};
    const eatenKcal = Math.round(dayTotals.kcal || 0);
    const remainingKcal = optimum - eatenKcal;
    const isGoalReached = remainingKcal <= 0;

    const localizeMealName = HEYS.dayUtils?.localizeMealName;
    const summaryTitle = [
      typeof localizeMealName === 'function'
        ? localizeMealName(currentMeal.name, 'Приём')
        : (currentMeal.name || 'Приём'),
      currentMeal.time
    ].filter(Boolean).join(' · ');

    const mealItems = (currentMeal.items || []).map((item) => {
      const product = getProductFromItem(item, localPIndex) || { name: item.name || '?' };
      const grams = +item.grams || 0;
      const p100 = per100(product);
      const itemKcal = Math.round(scale(p100.kcal100, grams));
      return {
        name: product.name || item.name || '?',
        grams,
        kcal: itemKcal,
        recipeLine: HEYS.models?.formatMealItemRecipeLine?.(item) || ''
      };
    });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const dispatchFinished = () => {
        try {
          window.dispatchEvent(new CustomEvent('heys:meal-flow-finished', {
            detail: {
              source: 'day-add-product-summary',
              dateKey: currentDay?.date || null,
              mealIndex: resolvedMealIndex,
              mealId: currentMeal.id || requestedMealId || null
            }
          }));
        } catch (_) {
          // ignore
        }
      };

      const closeSummary = (result, { scrollToDiary = false } = {}) => {
        HEYS.StepModal?.hide?.({ scrollToDiary });
        finish(result);
      };

      HEYS.StepModal.show({
        steps: [{
          id: 'meal-summary',
          title: summaryTitle,
          component: MealSummaryV4Step,
          hideHeaderNext: true
        }],
        modalClassName: 'aps-v4-meal-summary-modal',
        showGreeting: false,
        showStreak: false,
        showTip: false,
        showProgress: false,
        hidePrimaryOnFirst: true,
        context: {
          day: currentDay,
          mealIndex: resolvedMealIndex,
          mealId: currentMeal.id || requestedMealId || null,
          dateKey: currentDay?.date || null,
          mealItems,
          mealKcal,
          dayKcal: eatenKcal,
          mealItemCount: mealItems.length,
          // Не зажимаем в ноль: в переборе строка показывает, на сколько именно
          // норма пройдена, а Math.max терял знак и показывал «перебор 0».
          remainingKcal,
          isGoalReached,
          mealPhotos: currentMeal.photos || [],
          summaryTitle,
          onAddMore: () => {
            closeSummary('add-more', { scrollToDiary: false });
            onAddMore?.(currentDay);
          },
          onSavePreset: typeof onSavePreset === 'function'
            ? () => {
              closeSummary('save-preset', { scrollToDiary: false });
              onSavePreset(currentDay);
            }
            : null,
          onPhoto: typeof onPhoto === 'function' ? onPhoto : null,
          onDone: () => {
            dispatchFinished();
            if (isGoalReached && HEYS.Confetti?.fire) {
              HEYS.Confetti.fire();
            }
            closeSummary('finish', { scrollToDiary: true });
          }
        },
        onClose: () => {
          dispatchFinished();
          finish('finish');
        }
      });
    }).then((modalResult) => {
      if (modalResult === 'add-last' && onAddLast) {
        onAddLast(currentDay);
      }
      if (typeof modalResult === 'string' && /^add-(\d+)$/.test(modalResult) && onAddMore) {
        const repeatCount = parseInt(modalResult.slice(4), 10);
        if (Number.isFinite(repeatCount) && repeatCount > 1) {
          onAddMore(currentDay, repeatCount);
        }
      }
      return modalResult;
    });
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
    autoRepeatCount = 0, // 🆕 «Подряд N продуктов» — open AddProductStep с автоповтором без summary
    buttonText = 'Добавить еще продукт',
    buttonIcon = '🔍',
    buttonClassName = '',
    highlightCurrent = true,
    ariaLabel = 'Добавить продукт'
  }) {
    const getLatestProducts = React.useCallback(() => {
      const fromHeys = HEYS.products?.getAll?.() || [];
      if (fromHeys.length > 0) return fromHeys;
      return Array.isArray(products) ? products : [];
    }, [products]);

    const getLatestDay = React.useCallback(() => {
      return HEYS.Day?.getDay?.() || day || {};
    }, [day]);

    const handleOpenModal = React.useCallback(() => {
      // Открытие листа отклика не даёт — строка «вибрация · правило продукта».

      const handleAddPhoto = async ({ mealIndex, mealId: requestedMealId, photo, filename, timestamp }) => {
        const activeDay = getLatestDay();
        const resolvedMealIndex = resolveMealIndex(activeDay, mealIndex, requestedMealId);
        const activeMeal = activeDay?.meals?.[resolvedMealIndex];

        // Проверяем лимит фото (10 на приём)
        const currentPhotos = activeMeal?.photos?.length || 0;
        if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
          HEYS.Toast?.warning(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`) || alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
          return;
        }

        // Получаем данные для загрузки
        const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
        const mealId = activeMeal?.id || requestedMealId || uid('meal_');
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
          const targetIndex = resolveMealIndex(prevDay, mealIndex, mealId);
          const meals = (prevDay.meals || []).map((m, i) =>
            i === targetIndex
              ? {
                ...m,
                photos: [...(m.photos || []), photoData]
              }
              : m
          );
          return { ...prevDay, meals, updatedAt: Date.now() };
        });

        HEYS.feedback?.emit?.('meal.added');

        try {
          const mealName = activeMeal?.name || `meal${resolvedMealIndex}`;
          window.HEYS?.eventLog?.write(
            'meal-photo',
            `Photo добавлен в ${mealName} ${date || '?'}`,
            { dateKey: date, mealIndex: resolvedMealIndex, mealId, mealName },
            'handleAddPhoto'
          );
        } catch (_) { /* noop */ }

        // Асинхронно загружаем в облако
        if (HEYS.cloud?.uploadPhoto) {
          try {
            const result = await HEYS.cloud.uploadPhoto(photo, clientId, date, mealId);

            // Сигнал успешной загрузки — `path`, не `url`: сервер перестал
            // отдавать `url` в ответе `/photos/upload` (2026-08-11, публичная
            // ссылка на бакет закрыта). Проверка `result?.url` здесь никогда
            // не была бы true для новых фото, и `data`/`uploading` не
            // очищались бы после успешной загрузки.
            if (result?.uploaded && result?.path) {
              setDay((prevDay = {}) => {
                const targetIndex = resolveMealIndex(prevDay, mealIndex, mealId);
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== targetIndex || !m.photos) return m;
                  return {
                    ...m,
                    photos: m.photos.map(p =>
                      p.id === photoId
                        ? { ...p, path: result.path, data: undefined, pending: false, uploading: false, uploaded: true }
                        : p
                    )
                  };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
              });
            } else if (result?.pending) {
              setDay((prevDay = {}) => {
                const targetIndex = resolveMealIndex(prevDay, mealIndex, mealId);
                const meals = (prevDay.meals || []).map((m, i) => {
                  if (i !== targetIndex || !m.photos) return m;
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
              const targetIndex = resolveMealIndex(prevDay, mealIndex, mealId);
              const meals = (prevDay.meals || []).map((m, i) => {
                if (i !== targetIndex || !m.photos) return m;
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

      let activeMultiProductMode = multiProductMode;
      let activeAutoRepeatActive = (typeof autoRepeatCount === 'number' && autoRepeatCount > 1);
      // Tracks the day snapshot that was passed to the last openAddModal call.
      // handleAdd uses this as the base when building updatedDayForSummary so it
      // always includes all products added in previous iterations (the React-closure
      // 'day' prop may be stale across multiple sequential additions).
      let lastOpenedDay = null;

      const openAddModal = (override = {}) => {
        const latestDay = override.day || getLatestDay();
        const mealId = override.mealId || latestDay?.meals?.[mi]?.id || null;
        const resolvedMealIndex = resolveMealIndex(latestDay, mi, mealId);
        const latestMeal = latestDay?.meals?.[resolvedMealIndex] || {};
        const latestProducts = getLatestProducts();
        const nextMultiProductMode = typeof override.multiProductMode === 'boolean'
          ? override.multiProductMode
          : multiProductMode;

        activeMultiProductMode = nextMultiProductMode;
        lastOpenedDay = latestDay;

        const nextAutoRepeatCount = typeof override.autoRepeatCount === 'number'
          ? override.autoRepeatCount
          : autoRepeatCount;

        activeAutoRepeatActive = (typeof nextAutoRepeatCount === 'number' && nextAutoRepeatCount > 1);

        if (window.HEYS?.AddProductStep?.show) {
          window.HEYS.AddProductStep.show({
            mealIndex: resolvedMealIndex,
            mealId,
            mealPhotos: latestMeal.photos || [],
            products: latestProducts,
            day: latestDay,
            dateKey: date,
            multiProductMode: nextMultiProductMode,
            autoRepeatCount: nextAutoRepeatCount,
            onAdd: handleAdd,
            onAddMany: handleAddMany,
            onAddPhoto: handleAddPhoto,
            onNewProduct: handleNewProduct
          });
        } else {
          console.error('[HEYS] AddProductStep not loaded');
        }
      };

      const emitAddTrace = (event, payload = {}, level = 'info') => {
        const debug = HEYS?.debug;
        if (typeof debug?.pushAddTrace === 'function') {
          debug.pushAddTrace(event, payload, level);
          return;
        }
        const method = level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info');
        console[method](`[HEYS.addTrace] ${event}`, payload);
      };

      const scheduleFlush = (traceId, options = {}) => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            // 🔬 [HEYS.day-trace] 4b/8 requestFlush — about to call flush which writes day to LS.
            try {
              const _d = HEYS.Day?.getDay?.();
              const _meals = (_d && Array.isArray(_d.meals)) ? _d.meals : [];
              const _totalItems = _meals.reduce((acc, m) => acc + ((m.items || []).length), 0);
              logDayTrace('[HEYS.day-trace] 4b/8 requestFlush', {
                traceId,
                hasFlush: !!(HEYS.Day && HEYS.Day.requestFlush),
                dayDate: _d && _d.date,
                mealsCount: _meals.length,
                totalItems: _totalItems,
                dayUpdatedAt: _d && _d.updatedAt,
                bulk: !!options.bulk
              });
            } catch (_) { /* noop */ }
            if (HEYS.Day?.requestFlush) {
              HEYS.Day.requestFlush(options.force ? { force: true } : undefined);
            }
          }, 50);
        });
      };

	      const handleAddMany = async ({ entries, mealIndex: targetMealIndex = mi, mealId: targetMealId = null, _traceId, _origin, _presetName } = {}) => {
	        const items = Array.isArray(entries) ? entries : [];
	        const traceId = _traceId || `daybulk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	        const prepared = [];
	        for (const entry of items) {
	          const product = entry?.product || entry;
	          const grams = entry?.grams || product?.grams || 100;
	          if (!product) continue;
	          const ready = await HEYS.products?.ensureMealProductReady?.(product, {
	            source: 'day-add-product-bulk',
	            requireCommit: true
	          });
	          if (ready && !ready.ok) {
	            HEYS.Toast?.error?.('Продукт не сохранён в базу. Запись в дневник не добавлена, попробуйте ещё раз.');
	            console.warn('[HEYS.day] bulk product add blocked before day write', {
	              traceId,
	              reason: ready.reason,
	              productId: product?.id ?? product?.product_id ?? null,
	              productName: product?.name || null
	            });
	            return false;
	          }
	          const safeProduct = ready?.product || product;
	          prepared.push({ product: safeProduct, grams, ...buildMealItemFromProduct(safeProduct, grams) });
	        }

        if (prepared.length === 0) {
          emitAddTrace('⚠️ bulk add skipped — no valid items', {
            traceId,
            origin: _origin || 'unknown',
            mealIndex: targetMealIndex,
            presetName: _presetName || null
          }, 'warn');
          return;
        }

        const missingNutrients = prepared
          .filter((entry) => !entry.itemHasNutrients)
          .map((entry) => ({
            name: entry.newItem?.name,
            product_id: entry.newItem?.product_id,
            grams: entry.newItem?.grams
          }));
        if (missingNutrients.length > 0) {
          console.error('🚨 [DayTab] CRITICAL: bulk newItems have NO nutrients!', missingNutrients);
        }

        const currentDay = getLatestDay();
        const currentMeals = currentDay?.meals || [];
        const resolvedTargetIndex = resolveMealIndex(currentDay, targetMealIndex, targetMealId);
        if (!currentMeals[resolvedTargetIndex]) {
          console.warn('[HEYS.day] ❌ Meal index not found for bulk add — aborting', {
            traceId,
            mealIndex: targetMealIndex,
            mealId: targetMealId,
            resolvedMealIndex: resolvedTargetIndex,
            mealsCount: currentMeals.length,
            presetName: _presetName || null
          });
          if (HEYS.Toast?.error) HEYS.Toast.error('Не удалось добавить — приём не найден, попробуй ещё раз');
          return;
        }

        const newItems = prepared.map((entry) => entry.newItem);
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
        try {
          if (HEYS.Day?.markPendingMutation && date) {
            HEYS.Day.markPendingMutation(date);
          }
        } catch (_) { /* noop */ }

        setDay((prevDay = {}) => {
          const mealsList = prevDay.meals || [];
          const prevTargetIndex = resolveMealIndex(prevDay, targetMealIndex, targetMealId);
          const itemsBefore = mealsList?.[prevTargetIndex]?.items?.length || 0;
          if (!mealsList[prevTargetIndex]) {
            console.warn('[HEYS.day] ❌ Meal index not found for bulk add', {
              traceId,
              mealIndex: targetMealIndex,
              mealId: targetMealId,
              resolvedMealIndex: prevTargetIndex,
              mealsCount: mealsList.length,
              presetName: _presetName || null
            });
          }
          const { mealIndex: actualMealIndex, meals } = appendItemsToMealTarget(prevDay, targetMealIndex, targetMealId, newItems);
          const itemsAfter = meals?.[actualMealIndex]?.items?.length || 0;
          emitAddTrace('🧱 bulk setDay meal update', {
            traceId,
            origin: _origin || 'unknown',
            mealIndex: actualMealIndex,
            requestedMealIndex: targetMealIndex,
            mealId: targetMealId,
            itemsBefore,
            itemsAfter,
            expectedDelta: newItems.length,
            actualDelta: itemsAfter - itemsBefore,
            addedItemIds: newItems.map((item) => item.id),
            presetName: _presetName || null
          });
          // 🔬 [HEYS.day-trace] 4/8 setDay applied — items count change in target meal.
          try {
            const _totalItems = meals.reduce((acc, m) => acc + ((m.items || []).length), 0);
            logDayTrace('[HEYS.day-trace] 4/8 bulk setDay applied', {
              traceId,
              date: prevDay.date,
              mealIndex: actualMealIndex,
              requestedMealIndex: targetMealIndex,
              mealId: targetMealId,
              itemsBefore,
              itemsAfter,
              expectedDelta: newItems.length,
              actualDelta: itemsAfter - itemsBefore,
              totalItems: _totalItems,
              updatedAt: newUpdatedAt,
            });
          } catch (_) { /* noop */ }
          return { ...prevDay, meals, updatedAt: newUpdatedAt };
        });

        scheduleFlush(traceId, { force: true, bulk: true });

        requestAnimationFrame(() => {
          setTimeout(() => {
            const latestDay = HEYS.Day?.getDay?.();
            const actualMealIndex = resolveMealIndex(latestDay, targetMealIndex, targetMealId);
            const meal = latestDay?.meals?.[actualMealIndex];
            const mealItems = Array.isArray(meal?.items) ? meal.items : [];
            const persistedIds = new Set(mealItems.map((it) => it?.id));
            const missingIds = newItems.map((it) => it.id).filter((id) => !persistedIds.has(id));
            emitAddTrace(missingIds.length ? '❌ bulk post-add verify failed' : '🔎 bulk post-add verify', {
              traceId,
              mealIndex: actualMealIndex,
              requestedMealIndex: targetMealIndex,
              mealId: targetMealId,
              expectedAdded: newItems.length,
              missingIds,
              mealItemsCount: mealItems.length,
              date: latestDay?.date || date || null
            }, missingIds.length ? 'error' : 'info');
          }, 160);
        });

        HEYS.feedback?.emit?.('meal.added');

        prepared.forEach((entry) => {
          recordGramsForProduct(entry.productId, entry.grams, entry.finalProduct);
        });

        dispatchProductAdded({
          product: prepared[0]?.product,
          grams: prepared[0]?.grams,
          products: prepared.map((entry) => entry.product),
          items: newItems,
          count: newItems.length,
          origin: _origin || 'bulk',
          source: 'day-add-products-bulk'
        });
        dispatchMealFlowFinished({
          source: 'day-add-products-bulk',
          dateKey: currentDay?.date || date || null,
          mealIndex: targetMealIndex,
          mealId: targetMealId || null,
          count: newItems.length
        });
      };

	      const handleAdd = async ({ product, grams, mealIndex, mealId, productCommitVerified, _traceId, _origin, _presetBatch }) => {
	        const traceId = _traceId || `dayadd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        // 🔬 [HEYS.day-trace] 1/8 entry — modal-driven add (handleAdd in heys_day_add_product.js).
        try {
          logDayTrace('[HEYS.day-trace] 1/8 handleAdd entry', {
            traceId,
            origin: _origin || 'unknown',
            date,
            mealIndex,
            mealId,
            grams,
            productId: product?.id ?? product?.product_id ?? null,
            productName: product?.name || null,
            productKcal100: product?.kcal100,
            productSource: product?._source || (product?._fromShared ? 'shared' : 'personal'),
            isOneTime: !!product?._oneTime,
          });
        } catch (_) { /* noop */ }
        console.info('[HEYS.day] ➕ Add product to meal (modal)', {
          traceId,
          origin: _origin || 'unknown',
          mealIndex,
          mealId,
          grams,
          productId: product?.id ?? product?.product_id ?? null,
          productName: product?.name || null,
          source: product?._source || (product?._fromShared ? 'shared' : 'personal')
        });
	        const ready = productCommitVerified === true
	          ? { ok: true, product, reason: 'already_verified' }
	          : await HEYS.products?.ensureMealProductReady?.(product, {
	            source: 'day-add-product',
	            requireCommit: true
	          });
	        if (ready && !ready.ok) {
	          HEYS.Toast?.error?.('Продукт не сохранён в базу. Запись в дневник не добавлена, попробуйте ещё раз.');
	          console.warn('[HEYS.day] product add blocked before day write', {
	            traceId,
	            reason: ready.reason,
	            productId: product?.id ?? product?.product_id ?? null,
	            productName: product?.name || null
	          });
	          return false;
	        }
	        const safeProduct = ready?.product || product;
	        const built = buildMealItemFromProduct(safeProduct, grams);
	        const { finalProduct, productId, newItem, itemHasNutrients } = built;

        // 🔍 DEBUG: Подробный лог при добавлении продукта в meal
        const hasNutrients = !!(finalProduct?.kcal100 || finalProduct?.protein100 || finalProduct?.carbs100);
        if (!hasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', finalProduct);
        }

        if (!itemHasNutrients) {
          console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
            newItem,
            finalProduct,
            spreadCondition: finalProduct.kcal100 !== undefined
          });
        }

        const currentDay = getLatestDay();
        const currentMeals = currentDay?.meals || [];
        const resolvedTargetIndex = resolveMealIndex(currentDay, mealIndex, mealId);
        if (!currentMeals[resolvedTargetIndex]) {
          console.warn('[HEYS.day] ❌ Meal index not found for add — aborting', {
            traceId,
            mealIndex,
            mealId,
            resolvedMealIndex: resolvedTargetIndex,
            mealsCount: currentMeals.length,
            productName: finalProduct?.name || null
          });
          if (HEYS.Toast?.error) HEYS.Toast.error('Не удалось добавить — приём не найден, попробуй ещё раз');
          return;
        }

        // 🔬 [HEYS.day-trace] 3/8 item built — what's actually going into the meal.
        try {
          logDayTrace('[HEYS.day-trace] 3/8 item built', {
            traceId,
            itemId: newItem.id,
            product_id: newItem.product_id,
            name: newItem.name,
            grams: newItem.grams,
            kcal100: newItem.kcal100,
            iron: newItem.iron,
            hasInline: itemHasNutrients,
          });
        } catch (_) { /* noop */ }

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
        // 🛡️ Pending-mutation marker (incident 2026-06-08 curator add-item dropped):
        // живёт пока flush явно не подтвердит запись. Закрывает зазор когда block
        // window истёк (3s timeout или SKEW-clear), но flush ещё не отстрелял из-за
        // long-task / disabled-flap / debounce reset. Reconciler / hot-sync /
        // live-refresh должны уважать этот флаг и не затирать React состояние.
        try {
          if (HEYS.Day?.markPendingMutation && date) {
            HEYS.Day.markPendingMutation(date);
          }
        } catch (_) { /* noop */ }

        setDay((prevDay = {}) => {
          const mealsList = prevDay.meals || [];
          const prevTargetIndex = resolveMealIndex(prevDay, mealIndex, mealId);
          const itemsBefore = mealsList?.[prevTargetIndex]?.items?.length || 0;
          if (!mealsList[prevTargetIndex]) {
            console.warn('[HEYS.day] ❌ Meal index not found for add', {
              traceId,
              mealIndex,
              mealId,
              resolvedMealIndex: prevTargetIndex,
              mealsCount: mealsList.length,
              productName: finalProduct?.name || null
            });
          }
          const { mealIndex: actualMealIndex, meals } = appendItemsToMealTarget(prevDay, mealIndex, mealId, [newItem]);
          const itemsAfter = meals?.[actualMealIndex]?.items?.length || 0;
          emitAddTrace('🧱 setDay meal update', {
            traceId,
            mealIndex: actualMealIndex,
            requestedMealIndex: mealIndex,
            mealId,
            itemsBefore,
            itemsAfter,
            addedItemId: newItem.id,
            addedProductId: newItem.product_id ?? null,
            addedProductName: newItem.name || null
          });
          // 🔬 [HEYS.day-trace] 4/8 setDay applied — items count change in target meal.
          try {
            const _totalItems = meals.reduce((acc, m) => acc + ((m.items || []).length), 0);
            logDayTrace('[HEYS.day-trace] 4/8 setDay applied', {
              traceId,
              date: prevDay.date,
              mealIndex: actualMealIndex,
              requestedMealIndex: mealIndex,
              mealId,
              itemsBefore,
              itemsAfter,
              totalItems: _totalItems,
              updatedAt: newUpdatedAt,
            });
          } catch (_) { /* noop */ }
          return { ...prevDay, meals, updatedAt: newUpdatedAt };
        });

        scheduleFlush(traceId);

        requestAnimationFrame(() => {
          setTimeout(() => {
            const latestDay = HEYS.Day?.getDay?.();
            const actualMealIndex = resolveMealIndex(latestDay, mealIndex, mealId);
            const meal = latestDay?.meals?.[actualMealIndex];
            const mealItems = Array.isArray(meal?.items) ? meal.items : [];
            const wasPersisted = mealItems.some((it) => it?.id === newItem.id);
            emitAddTrace('🔎 post-add verify', {
              traceId,
              mealIndex: actualMealIndex,
              requestedMealIndex: mealIndex,
              mealId,
              addedItemId: newItem.id,
              persistedInDayRef: wasPersisted,
              mealItemsCount: mealItems.length,
              date: latestDay?.date || date || null
            });
          }, 160);
        });

        HEYS.feedback?.emit?.('meal.added');

	        dispatchProductAdded({ product: finalProduct || safeProduct, grams, origin: _origin || 'single' });

        // ⚡ Skip grams-tracking для разовых продуктов: их productId уникален и
        // никогда не повторится → запись в last_grams/grams_history засоряет LS
        // и cloud-sync без всякой пользы.
        recordGramsForProduct(productId, grams, finalProduct);

        // 🆕 autoRepeat: молчаливое повторение N раз — пропускаем summary, AddProductStep сам делает goToStep(0)
        if (activeAutoRepeatActive) {
          return;
        }

        // 🆕 R-INS-PRESET-AS-ONE (2026-05-14): preset items handled by handleAddAll —
        // оно само закрывает overlay/модалку, не нужно показывать summary N раз.
        if (_presetBatch) {
          const batchIndex = Number(_presetBatch?.index);
          const batchTotal = Number(_presetBatch?.total);
          if (Number.isFinite(batchIndex) && Number.isFinite(batchTotal) && batchIndex + 1 >= batchTotal) {
            setTimeout(() => {
              const latestDayForFinish = HEYS.Day?.getDay?.() || currentDay || {};
              dispatchMealFlowFinished({
                source: 'day-add-product-preset-fallback',
                dateKey: latestDayForFinish?.date || date || null,
                mealIndex,
                mealId,
                count: batchTotal
              });
            }, 160);
          }
          return;
        }

        if (!activeMultiProductMode) {
          setTimeout(() => {
            const latestDayForFinish = HEYS.Day?.getDay?.() || currentDay || {};
            dispatchMealFlowFinished({
              dateKey: latestDayForFinish?.date || date || null,
              mealIndex,
              mealId
            });
          }, 160);
        }

        if (activeMultiProductMode && HEYS.dayAddProductSummary?.show) {
          // Build updated day with the just-added item for the summary modal.
          // Multiple fallback sources: lastOpenedDay tracks what openAddModal
          // received, HEYS.Day.getDay() reads dayRef.current, getLatestDay()
          // reads the React prop (may be undefined if not passed).
          const latestDayForSummary = lastOpenedDay || HEYS.Day?.getDay?.() || getLatestDay();
          const srcMeals = latestDayForSummary.meals || [];
          const summaryMealIndex = resolveMealIndex(latestDayForSummary, mealIndex, mealId);
          const updatedMealsForSummary = srcMeals.map((m, i) =>
            i === summaryMealIndex
              ? { ...m, items: [...(m.items || []), newItem] }
              : m
          );
          // Safety: if the meal at mealIndex didn't exist in the snapshot
          // (race between React state commit and dayRef.current update),
          // create the meal entry so the summary can display the product.
          if (summaryMealIndex >= srcMeals.length) {
            while (updatedMealsForSummary.length < summaryMealIndex) {
              updatedMealsForSummary.push({ items: [] });
            }
            updatedMealsForSummary[summaryMealIndex] = { id: mealId || undefined, items: [newItem] };
          }
          const updatedDayForSummary = { ...latestDayForSummary, meals: updatedMealsForSummary, updatedAt: newUpdatedAt };

          // Close StepModal explicitly before showing ConfirmModal to avoid
          // a visual overlap where the user sees two modals stacked.
          if (HEYS.StepModal?.hide) {
            HEYS.StepModal.hide({ scrollToDiary: false });
          }

          requestAnimationFrame(() => {
            setTimeout(() => {
              HEYS.dayAddProductSummary.show({
                day: updatedDayForSummary,
                mealIndex: summaryMealIndex,
                mealId,
                pIndex: HEYS.dayUtils?.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {},
                getProductFromItem,
                per100,
                scale,
                onAddMore: (updatedDay, autoRepeatCount) => openAddModal({
                  day: updatedDay,
                  mealId,
                  autoRepeatCount: autoRepeatCount || 0
                }),
                onAddLast: (updatedDay) => openAddModal({ day: updatedDay, mealId, multiProductMode: false }),
                onPhoto: (payload) => handleAddPhoto({
                  ...payload,
                  mealIndex: summaryMealIndex,
                  mealId: payload?.mealId || mealId
                }),
                onSavePreset: () => {
                  const latestDay = HEYS.Day?.getDay?.() || updatedDayForSummary;
                  HEYS.AddProductStep?.show?.({
                    mealIndex: summaryMealIndex,
                    mealId,
                    day: latestDay,
                    dateKey: date,
                    openPresetsCreate: true,
                    onAdd: handleAdd
                  });
                }
              });
            }, 100);
          });
        }
      };

      openAddModal();
    }, [mi, date, day, setDay, getLatestDay, getLatestProducts, multiProductMode, autoRepeatCount]);

    return React.createElement('button', {
      className: 'aps-open-btn'
        + ((highlightCurrent && isCurrentMeal) ? ' aps-open-btn--current' : '')
        + (buttonClassName ? ` ${buttonClassName}` : ''),
      onClick: handleOpenModal,
      'aria-label': ariaLabel,
      // Стабильный якорь для внешних сценариев (кнопка «Заполнить» в баннере
      // пустых приёмов). Раньше её искали по aria-label «Добавить продукт» —
      // но все call-site передают свои подписи, и селектор не находил ничего.
      'data-add-product': autoRepeatCount > 0 ? 'repeat' : (multiProductMode ? 'multi' : 'single')
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
      React.createElement('td', { 'data-cell': 'name' },
        p.name,
        HEYS.models?.formatMealItemRecipeLine?.(item)
          ? React.createElement('div', { className: 'meal-recipe-line' }, HEYS.models.formatMealItemRecipeLine(item))
          : null
      ),
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
