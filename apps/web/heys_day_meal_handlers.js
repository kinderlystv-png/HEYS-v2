// heys_day_meal_handlers.js — legacy shim (moved to day/_meals.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meal handlers moved to day/_meals.js'), {
      source: 'heys_day_meal_handlers.js',
      type: 'legacy_shim',
    });
  }
  return;
  /*
    
    /**
     * Sort meals by time (latest first)
     * @param {Array} meals - Array of meal objects
     * @returns {Array} Sorted meals
     */
  function sortMealsByTime(meals) {
    if (!meals || meals.length <= 1) return meals;

    return [...meals].sort((a, b) => {
      const timeA = timeToMinutes ? timeToMinutes(a.time) : null;
      const timeB = timeToMinutes ? timeToMinutes(b.time) : null;

      // Если оба без времени — сохраняем порядок
      if (timeA === null && timeB === null) return 0;
      // Без времени — в конец
      if (timeA === null) return 1;
      if (timeB === null) return -1;

      // Обратный порядок: последние наверху
      return timeB - timeA;
    });
  }

  /**
   * Create meal handlers
   * @param {Object} deps - Dependencies
   * @param {Function} deps.setDay - State updater for day
   * @param {Function} deps.expandOnlyMeal - Expand meal by index
   * @param {string} deps.date - Current date key (YYYY-MM-DD)
   * @param {Array} deps.products - Product database
   * @param {Object} deps.day - Current day data
   * @param {Object} deps.prof - User profile
   * @param {Object} deps.pIndex - Product index
   * @param {Function} deps.getProductFromItem - Get product from item
   * @param {boolean} deps.isMobile - Is mobile device
   * @param {Function} deps.openTimePickerForNewMeal - Legacy fallback
   * @param {Function} deps.scrollToDiaryHeading - Scroll helper
   * @param {React.Ref} deps.lastLoadedUpdatedAtRef - Sync protection ref
   * @param {React.Ref} deps.blockCloudUpdatesUntilRef - Cloud sync block ref
   * @param {React.Ref} deps.newItemIds - Track new items for animation
   * @param {Function} deps.setNewItemIds - Set new items state
   * @returns {Object} Meal handler functions
   */
  function createMealHandlers(deps) {
    const {
      setDay,
      expandOnlyMeal,
      date,
      products,
      day,
      prof,
      pIndex,
      getProductFromItem,
      isMobile,
      openTimePickerForNewMeal,
      scrollToDiaryHeading,
      lastLoadedUpdatedAtRef,
      blockCloudUpdatesUntilRef,
      newItemIds,
      setNewItemIds
    } = deps;

    /**
     * Add new meal
     */
    const addMeal = React.useCallback(async () => {
      // 🔒 Read-only gating: проверяем подписку через новый модуль
      if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
        HEYS.Paywall.showBlockedToast('Добавление приёма пищи недоступно');
        return;
      }

      if (isMobile && HEYS.MealStep) {
        // Новая модульная модалка с шагами
        HEYS.MealStep.showAddMeal({
          dateKey: date,
          meals: day.meals,
          pIndex,
          getProductFromItem,
          trainings: day.trainings || [],
          deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
          prof,
          dayData: day,
          onComplete: (newMeal) => {
            // Обновляем state и сохраняем ID нового приёма
            const newMealId = newMeal.id;
            const newUpdatedAt = Date.now();
            lastLoadedUpdatedAtRef.current = newUpdatedAt; // Защита от перезаписи cloud sync
            blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000; // Блокируем cloud sync на 3 сек

            // 🔒 КРИТИЧНО: Сохраняем СРАЗУ в localStorage СИНХРОННО!
            // flush() не работает т.к. использует day из closure который ещё не обновился React
            // Поэтому сохраняем напрямую с НОВЫМИ данными
            setDay(prevDay => {
              const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
              const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };

              // ✅ СИНХРОННОЕ сохранение в localStorage внутри setDay (имеем доступ к актуальным данным)
              const key = 'heys_dayv2_' + date;
              try {
                lsSet(key, newDayData);
              } catch (e) {
                console.error('[HEYS] 🍽 Failed to save meal:', e);
              }

              return newDayData;
            });

            if (window.HEYS && window.HEYS.analytics) {
              window.HEYS.analytics.trackDataOperation('meal-created');
            }
            // Success toast
            HEYS.Toast?.success('Приём создан');

            // Сразу открываем модалку добавления продукта
            // Используем setTimeout чтобы state успел обновиться
            setTimeout(() => {
              // Находим индекс нового приёма по ID после обновления state
              setDay(currentDay => {
                const meals = currentDay.meals || [];
                const mealIndex = meals.findIndex(m => m.id === newMealId);

                if (mealIndex >= 0) {
                  expandOnlyMeal(mealIndex);

                  // Открываем модалку добавления продукта
                  if (window.HEYS?.AddProductStep?.show) {
                    window.HEYS.AddProductStep.show({
                      mealIndex: mealIndex,
                      products: products,
                      dateKey: date,
                      onAdd: ({ product, grams, mealIndex: targetMealIndex }) => {
                        // 🔧 FIX: Auto-clone shared product to personal base (prevents orphans)
                        let finalProduct = product;
                        if (product?._fromShared || product?._source === 'shared' || product?.is_shared) {
                          const cloned = HEYS.products?.addFromShared?.(product);
                          if (cloned) {
                            finalProduct = cloned;
                            // 🔇 v4.7.0: Лог отключён
                          }
                        }

                        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
                        // TEF-aware kcal100: пересчитываем по формуле 3*protein + 4*carbs + 9*fat
                        const computeTEFKcal100 = (p) => {
                          const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
                          const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
                          return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
                        };
                        const newItem = {
                          id: uid('it_'),
                          product_id: finalProduct.id ?? finalProduct.product_id,
                          name: finalProduct.name,
                          grams: grams || 100,
                          // ✅ FIX: Spread нутриентов (было пропущено, вызывало пустые items)
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
                            gi: finalProduct.gi,
                            harm: HEYS.models?.normalizeHarm?.(finalProduct)  // Canonical harm field
                          })
                        };

                        // 🔒 Защита от перезаписи cloud sync
                        const newUpdatedAt = Date.now();
                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay((prevDay = {}) => {
                          const updatedMeals = (prevDay.meals || []).map((m, i) =>
                            i === targetMealIndex
                              ? { ...m, items: [...(m.items || []), newItem] }
                              : m
                          );
                          const newDayData = { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };

                          // ✅ СИНХРОННОЕ сохранение в localStorage внутри setDay
                          const key = 'heys_dayv2_' + date;
                          try {
                            lsSet(key, newDayData);
                          } catch (e) {
                            console.error('[HEYS] 🍽 Failed to save product:', e);
                          }

                          return newDayData;
                        });

                        try { navigator.vibrate?.(10); } catch (e) { }
                        window.dispatchEvent(new CustomEvent('heysProductAdded', { detail: { product, grams } }));
                        try {
                          lsSet(`heys_last_grams_${productId}`, grams);
                          // Сохраняем в grams_history
                          const history = lsGet('heys_grams_history', {});
                          if (!history[productId]) history[productId] = [];
                          history[productId].push(grams);
                          if (history[productId].length > 20) history[productId].shift();
                          lsSet('heys_grams_history', history);
                        } catch (e) { }
                        // Прокручиваем к дневнику после добавления продукта
                        if (scrollToDiaryHeading) scrollToDiaryHeading();
                      },
                      onNewProduct: () => {
                        if (window.HEYS?.products?.showAddModal) {
                          window.HEYS.products.showAddModal();
                        }
                      }
                    });
                  }
                }

                return currentDay; // Не меняем state, просто читаем
              });
            }, 50);
          }
        });
      } else if (isMobile) {
        // Fallback на старую модалку если MealStep не загружен
        if (openTimePickerForNewMeal) openTimePickerForNewMeal();
      } else {
        // Десктоп — старое поведение
        const newMealId = uid('m_');
        let newMealIndex = 0;
        setDay(prevDay => {
          const baseMeals = prevDay.meals || [];
          const newMeals = [...baseMeals, { id: newMealId, name: 'Приём', time: '', mood: '', wellbeing: '', stress: '', items: [] }];
          newMealIndex = newMeals.length - 1;
          return { ...prevDay, meals: newMeals, updatedAt: Date.now() };
        });
        expandOnlyMeal(newMealIndex);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('meal-created');
        }
        // Success toast
        HEYS.Toast?.success('Приём создан');
      }
    }, [date, expandOnlyMeal, isMobile, openTimePickerForNewMeal, products, setDay, day, prof, pIndex, getProductFromItem, scrollToDiaryHeading, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

    /**
     * Update meal time with auto-sort
     */
    const updateMealTime = React.useCallback((mealIndex, newTime) => {
      setDay(prevDay => {
        const updatedMeals = (prevDay.meals || []).map((m, i) =>
          i === mealIndex ? { ...m, time: newTime } : m
        );
        // Сортируем после обновления
        const sortedMeals = sortMealsByTime(updatedMeals);
        return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
      });
    }, [setDay]);

    /**
     * Remove meal with confirmation
     */
    const removeMeal = React.useCallback(async (i) => {
      const confirmed = await HEYS.ConfirmModal?.confirmDelete({
        icon: '🗑️',
        title: 'Удалить приём пищи?',
        text: 'Все продукты в этом приёме будут удалены. Это действие нельзя отменить.'
      });

      if (!confirmed) return;

      haptic('medium');
      setDay(prevDay => {
        const meals = (prevDay.meals || []).filter((_, idx) => idx !== i);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
    }, [haptic, setDay]);

    /**
     * Add product to meal
     */
    const addProductToMeal = React.useCallback((mi, p) => {
      // 🔒 Read-only gating
      if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
        HEYS.Paywall.showBlockedToast('Добавление продуктов недоступно');
        return;
      }

      haptic('light'); // Вибрация при добавлении

      // 🔧 FIX: Auto-clone shared product to personal base (prevents orphans)
      let finalProduct = p;
      if (p?._fromShared || p?._source === 'shared' || p?.is_shared) {
        const cloned = HEYS.products?.addFromShared?.(p);
        if (cloned) {
          finalProduct = cloned;
          // 🔇 v4.7.0: Лог отключён
        }
      }

      // Use centralized harm normalization
      const harmVal = HEYS.models?.normalizeHarm?.(finalProduct);

      // Сохраняем ключевые нутриенты inline чтобы не зависеть от базы продуктов
      const item = {
        id: uid('it_'),
        product_id: finalProduct.id ?? finalProduct.product_id,
        name: finalProduct.name,
        grams: finalProduct.grams || 100, // Поддержка кастомного веса из MealOptimizer
        // Inline данные — гарантируют корректный расчёт даже если продукт удалён из базы
        kcal100: finalProduct.kcal100,
        protein100: finalProduct.protein100,
        fat100: finalProduct.fat100,
        simple100: finalProduct.simple100,
        complex100: finalProduct.complex100,
        badFat100: finalProduct.badFat100,
        goodFat100: finalProduct.goodFat100,
        trans100: finalProduct.trans100,
        fiber100: finalProduct.fiber100,
        gi: finalProduct.gi ?? finalProduct.gi100,
        harm: harmVal  // Normalized harm (0-10)
      };

      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: [...(m.items || []), item] } : m);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });

      // Track new item for animation
      if (setNewItemIds) {
        setNewItemIds(prev => new Set([...prev, item.id]));
        // Remove from new items after animation completes
        setTimeout(() => {
          setNewItemIds(prev => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }, 500);
      }

      // Dispatch event для advice системы
      window.dispatchEvent(new CustomEvent('heysProductAdded'));
    }, [haptic, setDay, setNewItemIds, date]);

    /**
     * Set product grams
     */
    const setGrams = React.useCallback((mi, itId, g) => {
      const grams = +g || 0;
      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).map(it => it.id === itId ? { ...it, grams: grams } : it) } : m);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
    }, [setDay]);

    /**
     * Remove item from meal
     */
    const removeItem = React.useCallback((mi, itId) => {
      haptic('medium');
      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).filter(it => it.id !== itId) } : m);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
      // 🔄 Пересчитываем orphan-продукты после удаления item
      // (возможно этот item был единственным использованием orphan продукта)
      setTimeout(() => {
        if (window.HEYS?.orphanProducts?.recalculate) {
          window.HEYS.orphanProducts.recalculate();
        }
      }, 100);
    }, [haptic, setDay]);

    /**
     * Update meal field
     */
    const updateMealField = React.useCallback((mealIndex, field, value) => {
      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => i === mealIndex ? { ...m, [field]: value } : m);
        return { ...prevDay, meals, updatedAt: Date.now() };
      });
    }, [setDay]);

    /**
     * Change meal mood
     */
    const changeMealMood = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'mood', value), [updateMealField]);

    /**
     * Change meal wellbeing
     */
    const changeMealWellbeing = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'wellbeing', value), [updateMealField]);

    /**
     * Change meal stress
     */
    const changeMealStress = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'stress', value), [updateMealField]);

    /**
     * Change meal type
     */
    const changeMealType = React.useCallback((mealIndex, newType) => {
      const newUpdatedAt = Date.now();
      if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
      if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

      setDay(prevDay => {
        const meals = (prevDay.meals || []).map((m, i) => {
          if (i !== mealIndex) return m;
          // Обновляем mealType и name
          const newName = newType && MEAL_TYPES && MEAL_TYPES[newType]
            ? MEAL_TYPES[newType].name
            : m.name;
          return { ...m, mealType: newType, name: newName };
        });
        return { ...prevDay, meals, updatedAt: newUpdatedAt };
      });
      haptic('light');
    }, [setDay, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

    /**
     * Check if item is new (for animation)
     */
    const isNewItem = React.useCallback((itemId) => newItemIds && newItemIds.has(itemId), [newItemIds]);

    return {
      addMeal,
      updateMealTime,
      removeMeal,
      addProductToMeal,
      setGrams,
      removeItem,
      updateMealField,
      changeMealMood,
      changeMealWellbeing,
      changeMealStress,
      changeMealType,
      isNewItem,
      // Utility exports
      sortMealsByTime
    };
  }

  // Export module
  HEYS.dayMealHandlers = {
    createMealHandlers,
    sortMealsByTime
  };
  
*/
})(window);
