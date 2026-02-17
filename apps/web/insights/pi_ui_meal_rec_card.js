/**
 * Meal Recommender Card — Compact UI for Day View
 * v27.5 — Bulk add selected products
 * Рендерит карточку рекомендации следующего приёма пищи в дневнике
 * Позиция: между refeedCard и supplementsCard (выше витаминов)
 * 
 * v27.5 changes (17.02.2026):
 * - NEW: Bulk add button "Добавить выбранные" after grouped products
 * - STATES: Gray dashed border (no selection) → Blue solid bg+border (has selection)
 * - FUNCTION: handleAddSelectedProducts() — adds all checked products sequentially
 * - UI: Shows count "(3)" when products selected, disabled when none
 * - REASONING: Increased font size (12px), darker color, no background (transparent)
 * 
 * v27.4 changes (17.02.2026):
 * - SEPARATED: Product selection (card click) from adding to meal (+ button click)
 * - NEW: Round green + button on the right side of each product card
 * - Card click: Visual selection only (toggle green border/bg, no auto-add)
 * - Button click: Adds product to current meal via handleAddSuggestion
 * - Button style: 28px circle, green bg, hover scale 1.1, active scale 0.9
 * - CSS: .meal-rec-card__product-add-btn (consistent with __suggestion-add)
 * 
 * v27.3 changes (17.02.2026):
 * - REMOVED: Checkboxes (replaced with full-card click like vitamins)
 * - NEW: Clickable product cards with border + box-shadow when selected
 * - SELECTED state: Green border (#10b981) + light green bg + 2px shadow (light/dark theme)
 * - REDUCED: Gap between products (2px→6px for better click targets)
 * - IMPROVED: Hover states with border color change
 * - Toggle behavior: Click to select, click again to deselect (visual only, products remain in meal)
 * - CSS: .meal-rec-card__product-item, __product-item--selected (vitamin pattern)
 * 
 * v26.3 changes (17.02.2026):
 * - Fixed: pIndex now properly passed to buildRecommendationContext
 * - Fixed: lastMealTotals computed from items (was broken in v26.2)
 * 
 * v26.2 changes (17.02.2026):
 * - Fixed: lastMealTotals now computed from lastMeal.items using HEYS.models.mealTotals
 * - Fallback: manual calculation if mealTotals unavailable
 * - Now properly passes nutrient data to InsulinWave.calculate()
 * 
 * v26.1 changes:
 * - Fixed: lastMeal now includes items[] and totals{} (was only time)
 * - Fixed: dayTarget/dayEaten now include fat macros + aliases (prot/carb)
 * - Enhanced logging: shows lastMealItems, lastMealTotals in context
 * 
 * v26 features:
 * - Multi-meal timeline planning (via pi_meal_planner.js)
 * - Insulin wave-aware scheduling: meals after wave ends + 30min fat-burn window
 * - Pre-sleep buffer (3h): last meal before bedtime
 * - Budget distribution across N meals (ratios: 2=[60/40], 3=[45/35/20], 4=[35/30/20/15])
 * - Collapsed state: "2 приёма до сна · 18:30-22:30"
 * - Expanded state: Sub-cards for each meal with wave info + macros
 * - Only first meal actionable (shows [+] buttons), others show "(добавить можно позже)"
 * - Summary macros: shows totals across all meals
 * 
 * v25.9.2 (previous):
 * - UX: green card background, 'Рекомендуем' badge, friendlier copy
 * 
 * v2.4 features:
 * - Scenario-specific icons and titles
 * - Conditional rendering for GOAL_REACHED (water instead of macros)
 * - Adaptive header text based on detected scenario
 * 
 * v2.6 features (R2.6):
 * - Historical days loading (30d from localStorage)
 * - Deep Insights enhancement via pi_meal_rec_patterns.js
 * - Dynamic confidence display (0.5-1.0)
 * 
 * v2.7-2.9 fixes:
 * - Added resolveLsGet() with localStorage fallback
 * - Fixed parameter order: recommend(context, profile, pIndex, days)
 * - Fixed profile/pIndex parameters
 * 
 * v21-23 (deprecated):
 * - Custom meal picker modal with time + "Add new meal" button
 * - REMOVED: Users cannot add food to past meals, modal was unnecessary UX
 * 
 * v24 (deprecated):
 * - Smart active meal detection: use last meal if created < 30 min ago
 * - Removed modal entirely — caused flash before auto-selection
 * 
 * v25.0:
 * - Intentional modal with 2 buttons:
 *   1. Active meal (< 30 min): "🥗 Перекус • 13:55 • 2 продукта • 12 мин назад"
 *   2. Create new meal: "➕ Создать новый приём"
 * - If no active meal (> 30 min): show only "Create new meal" button
 * - Eliminates flash issue: modal shown deliberately, not as async side-effect
 * 
 * v25.1:
 * - Empty meal support: shows "пустой • X мин назад" instead of "0 продуктов"
 * - Active meal shown even if empty (no items added yet)
 * 
 * v25.2:
 * - FIX: New meal index calculation (was `length`, now `length - 1`)
 * - Products now correctly added to created meal
 * 
 * v25.3:
 * - FIX: Use `HEYS.day.meals.length` instead of closure `day` variable
 * - Closure `day` is stale after addMeal(), global object is fresh
 * 
 * v25.4:
 * - FIX: Read from localStorage with retry logic (3 attempts, 50-150ms)
 * - Handle async React state → localStorage sync delay
 * 
 * v25.5:
 * - FIX: Extended retry (5 attempts × 100-500ms = 1500ms max)
 * - Still insufficient: localStorage updates async via fetchDays
 * 
 * v25.6:
 * - FIX: Changed to setInterval polling (every 100ms up to 3000ms)
 * - Still failed: 30 attempts all returned mealsCount: 0
 * 
 * v25.7:
 * - FIX: Poll `HEYS.day.meals` directly instead of localStorage
 * - React state updates synchronously, localStorage updates async
 * - Faster polling: 50ms intervals, 2s max wait
 * - FAILED: `HEYS.day` doesn't exist (hasHEYSDay: false in all 37 attempts)
 * 
 * v25.8 (2026-02-17):
 * - FIX: Use `HEYS.MealStep.showAddMeal()` — reuse FAB button logic
 * - Same mechanism as working "+ Приём пищи" button
 * - No polling needed: onComplete callback provides mealIndex immediately
 * 
 * v25.8.1 (2026-02-17):
 * - CRITICAL FIX: Missing return after showAddMeal() in empty day case
 * - Caused "Cannot read property 'time' of undefined" → module crash
 * - Removed orphaned code that modified button style after modal removal
 * 
 * v25.8.2 (2026-02-17):
 * - FIX: Missing 'date' variable definition → showAddMeal received undefined dateKey
 * - Added detailed logging of all parameters before MealStep call
 * - Added try-catch for error handling in MealStep invocation
 * 
 * v25.8.3 (2026-02-17):
 * - FIX: Dispatch 'heys:day-updated' event after product added
 * - Meal created successfully but page didn't re-render → React state not updated
 * - Forces parent component to refresh and show new meal in diary
 * 
 * v25.8.4 (current - 2026-02-17):
 * - FIX: Add 300ms delay before dispatching event
 * - Event fired too early → MealStep hasn't saved to localStorage yet
 * - handleDayUpdated checks updatedAt timestamp before updating state
 */
(function (global) {
    'use strict';

    const { React } = global;
    if (!React) return;

    const h = React.createElement;
    const { useState, useMemo, useRef, useEffect } = React;
    const LOG_FILTER = 'MEALREC';
    const LOG_PREFIX = `[${LOG_FILTER}][HEYS.mealRec.card]`;

    /**
     * Fallback lsGet — прямое чтение из localStorage (если global.U недоступен)
     */
    function buildLocalStorageFallbackLsGet() {
        return function (key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null || raw === undefined) return fallback;
                return JSON.parse(raw);
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ localStorage fallback read failed:`, {
                    key,
                    message: err?.message,
                });
                return fallback;
            }
        };
    }

    /**
     * Resolve lsGet function (try global.U, then global.HEYS.utils, then fallback)
     */
    function resolveLsGet() {
        if (typeof global.U?.lsGet === 'function') return global.U.lsGet.bind(global.U);
        if (typeof global.HEYS?.utils?.lsGet === 'function') return global.HEYS.utils.lsGet.bind(global.HEYS.utils);
        return buildLocalStorageFallbackLsGet();
    }

    /**
     * Собрать контекст для recommend() из данных дня
     */
    function buildRecommendationContext(day, dayTot, normAbs, prof, optimum, pIndex) {
        console.info(`${LOG_PREFIX} 🔍 buildContext called:`, {
            hasDay: !!day,
            hasDayTot: !!dayTot,
            hasNormAbs: !!normAbs,
            hasProf: !!prof,
            mealsCount: day?.meals?.length || 0,
            trainingsCount: day?.trainings?.length || 0
        });

        if (!day || !dayTot || !normAbs) {
            console.warn(`${LOG_PREFIX} ❌ Missing required data:`, {
                hasDay: !!day,
                hasDayTot: !!dayTot,
                hasNormAbs: !!normAbs
            });
            return null;
        }

        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

        // Последний приём пищи
        const meals = day.meals || [];
        const lastMeal = meals.length > 0 ? meals[meals.length - 1] : null;

        // Вычислить totals для lastMeal (если есть items)
        let lastMealTotals = null;
        if (lastMeal && lastMeal.items && lastMeal.items.length > 0) {
            // Используем HEYS.models.mealTotals если доступно
            if (global.HEYS?.models?.mealTotals && pIndex) {
                lastMealTotals = global.HEYS.models.mealTotals(lastMeal, pIndex);
            } else {
                // Fallback: вычисляем вручную
                lastMealTotals = { kcal: 0, prot: 0, carbs: 0, carb: 0, fat: 0 };
                lastMeal.items.forEach(item => {
                    const product = pIndex[item.productId];
                    if (product) {
                        const factor = (item.grams || 0) / 100;
                        lastMealTotals.kcal += (product.kcal || 0) * factor;
                        lastMealTotals.prot += (product.prot || 0) * factor;
                        lastMealTotals.carbs += (product.carb || 0) * factor;
                        lastMealTotals.carb += (product.carb || 0) * factor;
                        lastMealTotals.fat += (product.fat || 0) * factor;
                    }
                });
            }
        }

        // Ближайшая тренировка
        const trainings = day.trainings || [];
        const training = trainings.length > 0 ? trainings[0] : null;

        // Целевое время сна
        const sleepTarget = prof?.sleepTarget || '23:00';

        const resolvedLsGet =
            (typeof global.U?.lsGet === 'function' && global.U.lsGet.bind(global.U)) ||
            (typeof global.HEYS?.utils?.lsGet === 'function' && global.HEYS.utils.lsGet.bind(global.HEYS.utils)) ||
            function (key, fallback = null) {
                try {
                    const raw = localStorage.getItem(key);
                    if (raw === null || raw === undefined) return fallback;
                    return JSON.parse(raw);
                } catch (err) {
                    console.warn(`${LOG_PREFIX} ⚠️ localStorage fallback read failed:`, { key, message: err?.message });
                    return fallback;
                }
            };

        const context = {
            currentTime: currentTimeStr,
            lastMeal: lastMeal ? {
                time: lastMeal.time,
                items: lastMeal.items || [],
                totals: lastMealTotals || {}
            } : null,
            dayTarget: {
                kcal: optimum || normAbs.kcal || 0,
                protein: normAbs.prot || 0,
                carbs: normAbs.carb || 0,
                fat: normAbs.fat || 0,
                // Aliases for planner
                prot: normAbs.prot || 0,
                carb: normAbs.carb || 0
            },
            dayEaten: {
                kcal: dayTot.kcal || 0,
                protein: dayTot.prot || 0,
                carbs: dayTot.carb || 0,
                fat: dayTot.fat || 0,
                // Aliases for planner
                prot: dayTot.prot || 0,
                carb: dayTot.carb || 0
            },
            training: training ? {
                time: training.time,
                type: training.type || 'general'
            } : null,
            sleepTarget,
            lsGet: resolvedLsGet,
            sharedProducts: global.HEYS?.products?.getAll?.() || []
        };

        console.info(`${LOG_PREFIX} ✅ Context built:`, {
            currentTime: currentTimeStr,
            lastMealTime: lastMeal?.time || 'none',
            lastMealItems: lastMeal?.items?.length || 0,
            lastMealTotals: lastMealTotals,
            mealsToday: meals.length,
            dayEaten: `${Math.round(dayTot.kcal)}ккал, ${Math.round(dayTot.prot)}г белка`,
            dayTarget: `${Math.round(optimum || normAbs.kcal)}ккал (optimum=${optimum || 'N/A'}, normAbs=${normAbs.kcal}), ${Math.round(normAbs.prot)}г белка`,
            hasTraining: !!training,
            trainingTime: training?.time || 'none',
            hasLsGet: typeof context.lsGet === 'function',
            sharedProductsCount: context.sharedProducts.length
        });

        return context;
    }

    /**
     * Форматирование времени для UI
     */
    function formatTime(timeStr) {
        if (!timeStr) return '—';
        return timeStr; // уже в формате HH:MM
    }

    /**
     * Форматирование диапазона макросов
     */
    function formatMacroRange(value, range) {
        if (!range) return `${Math.round(value)}`;
        return `${range}`;
    }

    /**
     * Компонент карточки рекомендации
     */
    function MealRecommenderCard({ React, day, prof, pIndex, dayTot, normAbs, optimum }) {
        const [expanded, setExpanded] = useState(false);
        const [userFeedback, setUserFeedback] = useState(null); // null | 'positive' | 'negative'
        const [checkedProducts, setCheckedProducts] = useState({}); // v27: { productId: boolean } for grouped mode

        // v25.8.2: Use U.getProductFromItem if not passed in props
        const getProductFromItem = global.U?.getProductFromItem || global.HEYS?.getProductFromItem || (() => null);

        // R2.7: Store recommendation ID for ML feedback loop
        const recIdRef = useRef(null);
        const followedRef = useRef(false);
        const prevRecommendationRef = useRef(null);

        // Stable primitive deps to prevent excessive re-renders (30+ → ~3)
        const mealsCount = day?.meals?.length || 0;
        const lastMealTime = day?.meals?.[mealsCount - 1]?.time || '';
        const eatenKcal = Math.round(dayTot?.kcal || 0);
        const eatenProt = Math.round(dayTot?.prot || 0);
        const targetKcal = Math.round(optimum || normAbs?.kcal || 0);
        const targetProt = Math.round(normAbs?.prot || 0);

        // Handler для feedback кнопок (R2.7)
        const handleFeedback = (rating) => {
            if (!global.HEYS?.InsightsPI?.mealRecFeedback) {
                console.warn(`${LOG_PREFIX} ⚠️ Feedback module not loaded`);
                return;
            }

            if (!recommendation) {
                console.warn(`${LOG_PREFIX} ⚠️ No recommendation to give feedback on`);
                return;
            }

            const feedbackData = {
                scenario: recommendation.scenario || 'UNKNOWN',
                rating: rating, // 1 for 👍, -1 for 👎
                products: (recommendation.suggestions || []).map(s => s.product),
                confidence: recommendation.confidence || 0,
                clientId: global.HEYS?.currentClientId, // Явно передаём clientId
                context: {
                    time: new Date().toISOString(),
                    mealsCount: mealsCount,
                    eatenKcal: eatenKcal,
                    targetKcal: targetKcal
                }
            };

            const success = global.HEYS.InsightsPI.mealRecFeedback.addFeedback(feedbackData);
            if (success) {
                setUserFeedback(rating === 1 ? 'positive' : 'negative');
                console.info(`${LOG_PREFIX} ✅ Feedback submitted:`, rating === 1 ? '👍' : '👎');

                // R2.7: best-effort cloud sync (non-blocking)
                if (typeof global.HEYS?.InsightsPI?.mealRecFeedback?.syncWithCloud === 'function') {
                    global.HEYS.InsightsPI.mealRecFeedback
                        .syncWithCloud({ reason: 'ui_feedback' })
                        .catch((err) => console.warn(`${LOG_PREFIX} ⚠️ Feedback cloud sync failed:`, err?.message));
                }

                // R2.7 Step 5: Submit quick feedback to feedbackLoop for ML weight updates
                if (recIdRef.current && global.HEYS?.InsightsPI?.feedbackLoop?.submitFeedback) {
                    try {
                        global.HEYS.InsightsPI.feedbackLoop.submitFeedback(
                            recIdRef.current,
                            { quickRating: rating },
                            prof
                        );
                        console.info(`${LOG_PREFIX} ✅ Quick feedback sent to ML loop:`, rating);
                    } catch (err) {
                        console.warn(`${LOG_PREFIX} ⚠️ feedbackLoop.submitFeedback failed:`, err?.message);
                    }
                }
            }
        };

        // R2.7 Step 3: Handler for adding suggestion to diary
        // v24: Smart active meal detection (< 30 min) — no modal needed
        const handleAddSuggestion = (suggestion) => {
            if (!suggestion) return;

            const { HEYS } = global;

            // Guard: Check AddProductStep availability
            if (!HEYS?.AddProductStep?.show) {
                console.error(`${LOG_PREFIX} ❌ AddProductStep not available`);
                return;
            }

            if (!pIndex) {
                console.warn(`${LOG_PREFIX} ⚠️ pIndex not available`);
                return;
            }

            // Find product in index (для передачи имени в модалку через initialSearch)
            let productForSearch = null;
            if (suggestion.productId && pIndex.byId) {
                productForSearch = pIndex.byId.get(String(suggestion.productId).toLowerCase());
            }
            if (!productForSearch && pIndex.byName) {
                const normalizedName = (suggestion.product || '').toLowerCase().trim();
                productForSearch = pIndex.byName.get(normalizedName);
            }

            const searchQuery = productForSearch?.name || suggestion.product || '';

            // Показать простую модалку: активный приём (< 30 мин) ИЛИ новый приём
            const showSmartMealPicker = (onMealSelected) => {
                // v25.8.2: Determine date from day.date or current date
                const date = day?.date || new Date().toISOString().slice(0, 10);

                if (!day?.meals || day.meals.length === 0) {
                    // Нет приёмов → создать первый через HEYS.MealStep (v25.8)
                    console.info(`${LOG_PREFIX} ➡️ No meals in day, using HEYS.MealStep.showAddMeal`);

                    if (!HEYS?.MealStep?.showAddMeal) {
                        console.error(`${LOG_PREFIX} ❌ HEYS.MealStep.showAddMeal not available`);
                        // Fallback: открываем AddProduct для meal 0
                        onMealSelected(0);
                        return;
                    }

                    // v25.8.2: Log all parameters before call
                    console.info(`${LOG_PREFIX} 📋 MealStep params:`, {
                        dateKey: date,
                        mealsLength: day.meals?.length || 0,
                        hasIndex: !!pIndex,
                        hasGetProductFromItem: typeof getProductFromItem === 'function',
                        trainingsCount: day.trainings?.length || 0,
                        deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
                        hasProf: !!prof,
                        hasDayData: !!day
                    });

                    // Используем тот же механизм, что и FAB кнопка
                    try {
                        HEYS.MealStep.showAddMeal({
                            dateKey: date,
                            meals: day.meals || [],
                            pIndex,
                            getProductFromItem,
                            trainings: day.trainings || [],
                            deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
                            prof,
                            dayData: day,
                            onComplete: (newMeal) => {
                                console.info(`[MEAL] ✅ Meal created (no meals case):`, newMeal.name, `id=${newMeal.id}`);

                                // v25.8.6.7: Use HEYS.Day.addMealDirect — direct setDay + lsSet
                                if (HEYS?.Day?.addMealDirect) {
                                    HEYS.Day.addMealDirect(newMeal);
                                    console.info(`[MEAL] ✅ addMealDirect succeeded (no meals case)`);
                                } else {
                                    // Fallback: save to localStorage manually + dispatch event
                                    console.warn(`[MEAL] ⚠️ addMealDirect not available, fallback to manual save`);
                                    const dateKey = day?.date || new Date().toISOString().slice(0, 10);
                                    const key = 'heys_dayv2_' + dateKey;
                                    const updatedMeals = [...(day.meals || []), newMeal];
                                    const nowTs = Date.now();
                                    const updatedDay = { ...(day || {}), date: dateKey, meals: updatedMeals, updatedAt: nowTs };
                                    try {
                                        if (HEYS?.utils?.lsSet) HEYS.utils.lsSet(key, updatedDay);
                                        else if (HEYS?.store?.set) HEYS.store.set(key, updatedDay);
                                        else localStorage.setItem(key, JSON.stringify(updatedDay));
                                    } catch (e) { console.error('[MEAL] ❌ Fallback save failed:', e); }
                                    if (HEYS?.Day?.setBlockCloudUpdates) HEYS.Day.setBlockCloudUpdates(nowTs + 3000);
                                    if (HEYS?.Day?.setLastLoadedUpdatedAt) HEYS.Day.setLastLoadedUpdatedAt(nowTs);
                                    window.dispatchEvent(new CustomEvent('heys:day-updated', {
                                        detail: { date: dateKey, source: 'meal-rec-card-local', forceReload: true }
                                    }));
                                }

                                // Найдём индекс нового приёма в списке
                                const updatedMeals = [...(day.meals || []), newMeal];
                                const mealIndex = updatedMeals.findIndex(m => m.id === newMeal.id);

                                if (mealIndex >= 0) {
                                    console.info(`${LOG_PREFIX} 📍 Found new meal at index ${mealIndex}`);
                                    onMealSelected(mealIndex);
                                } else {
                                    console.warn(`${LOG_PREFIX} ⚠️ Meal not found, using index 0`);
                                    onMealSelected(0);
                                }
                            }
                        });
                    } catch (err) {
                        console.error(`${LOG_PREFIX} ❌ MealStep.showAddMeal failed:`, err);
                        console.error(`${LOG_PREFIX} 📋 Error stack:`, err?.stack);
                        // Fallback: открываем AddProduct для meal 0
                        onMealSelected(0);
                    }
                    return; // ← v25.8.1 FIX: Stop execution, don't try to access lastMeal when day.meals is empty
                }

                // Есть приёмы → показать модалку с выбором
                const lastMeal = day.meals[day.meals.length - 1];
                const now = new Date();

                // Парсим время последнего приёма (формат HH:MM)
                let isActiveMeal = false;
                let minutesAgo = 0;

                if (lastMeal.time) {
                    const [hours, minutes] = lastMeal.time.split(':').map(Number);
                    const lastMealDate = new Date();
                    lastMealDate.setHours(hours, minutes, 0, 0);
                    minutesAgo = (now - lastMealDate) / 1000 / 60;
                    isActiveMeal = minutesAgo < 30 && minutesAgo >= 0;
                }

                console.info(`${LOG_PREFIX} 🍽️ Showing smart meal picker:`, {
                    hasActiveMeal: isActiveMeal,
                    minutesAgo: Math.round(minutesAgo),
                    lastMealTime: lastMeal.time,
                    lastMealName: lastMeal.name
                });

                // Inject CSS animations
                if (!document.getElementById('meal-picker-animations')) {
                    const style = document.createElement('style');
                    style.id = 'meal-picker-animations';
                    style.textContent = `
                        @keyframes fadeIn {
                            to { opacity: 1; }
                        }
                        @keyframes slideUp {
                            from { 
                                opacity: 0;
                                transform: translateY(20px); 
                            }
                            to { 
                                opacity: 1;
                                transform: translateY(0); 
                            }
                        }
                    `;
                    document.head.appendChild(style);
                }

                // Create modal overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    opacity: 0;
                    animation: fadeIn 0.3s ease-out forwards;
                `;

                const modal = document.createElement('div');
                modal.style.cssText = `
                    background: var(--bg-primary, #fff);
                    border-radius: 16px;
                    padding: 24px;
                    max-width: 320px;
                    width: 90%;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                    animation: slideUp 0.3s ease-out;
                `;

                const title = document.createElement('h3');
                title.textContent = 'Куда добавить?';
                title.style.cssText = `
                    margin: 0 0 16px 0;
                    font-size: 20px;
                    font-weight: 600;
                    color: var(--text-primary, #000);
                    text-align: center;
                `;

                const subtitle = document.createElement('p');
                subtitle.textContent = `"${suggestion.product}"`;
                subtitle.style.cssText = `
                    margin: 0 0 20px 0;
                    font-size: 14px;
                    color: var(--text-secondary, #666);
                    text-align: center;
                `;

                const buttonsContainer = document.createElement('div');
                buttonsContainer.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                `;

                // Кнопка 1: Активный приём (если < 30 мин)
                if (isActiveMeal) {
                    const emojis = ['🍳', '🥗', '🍲', '🍱', '🥤'];
                    const lastMealIndex = day.meals.length - 1;
                    const mealName = lastMeal.name || `Приём ${day.meals.length}`;
                    const itemsCount = lastMeal.items?.length || 0;
                    const emoji = emojis[lastMealIndex] || '🍽️';

                    // Текст статуса: "пустой" или "X продуктов"
                    let statusText;
                    if (itemsCount === 0) {
                        statusText = 'пустой';
                    } else if (itemsCount === 1) {
                        statusText = '1 продукт';
                    } else if (itemsCount > 1 && itemsCount < 5) {
                        statusText = `${itemsCount} продукта`;
                    } else {
                        statusText = `${itemsCount} продуктов`;
                    }

                    const activeBtn = document.createElement('button');
                    activeBtn.innerHTML = `
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span>${emoji} ${mealName}</span>
                            <span style="font-size: 13px; opacity: 0.7;">${lastMeal.time || '—'}</span>
                        </div>
                        <div style="font-size: 13px; opacity: 0.7; margin-top: 4px;">
                            ${statusText} • ${Math.round(minutesAgo)} мин назад
                        </div>
                    `;
                    activeBtn.style.cssText = `
                        padding: 14px 20px;
                        border: 2px solid var(--primary-color, #3b82f6);
                        border-radius: 12px;
                        background: var(--primary-bg, #eff6ff);
                        color: var(--text-primary, #000);
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        text-align: left;
                    `;

                    activeBtn.onclick = () => {
                        console.info(`${LOG_PREFIX} ✅ Active meal selected:`, {
                            mealIndex: lastMealIndex,
                            mealName,
                            minutesAgo: Math.round(minutesAgo)
                        });
                        document.body.removeChild(overlay);
                        onMealSelected(lastMealIndex);
                    };

                    activeBtn.onmouseover = () => {
                        activeBtn.style.transform = 'translateY(-2px)';
                        activeBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                    };

                    activeBtn.onmouseout = () => {
                        activeBtn.style.transform = 'translateY(0)';
                        activeBtn.style.boxShadow = 'none';
                    };

                    buttonsContainer.appendChild(activeBtn);
                }

                // Кнопка 2: Создать новый приём (всегда)
                const newBtn = document.createElement('button');
                newBtn.textContent = '➕ Создать новый приём';
                newBtn.style.cssText = `
                    padding: 14px 20px;
                    border: 2px dashed var(--border-color, #e5e7eb);
                    border-radius: 12px;
                    background: transparent;
                    color: var(--text-secondary, #666);
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                `;

                newBtn.onclick = () => {
                    document.body.removeChild(overlay);

                    if (!HEYS?.MealStep?.showAddMeal) {
                        console.error(`${LOG_PREFIX} ❌ HEYS.MealStep.showAddMeal not available`);
                        return;
                    }

                    console.info(`${LOG_PREFIX} ➡️ Creating new meal via MealStep`);
                    console.info(`${LOG_PREFIX} 📋 MealStep params (new meal btn):`, {
                        dateKey: date,
                        mealsLength: day.meals?.length || 0,
                        hasIndex: !!pIndex,
                        hasGetProductFromItem: typeof getProductFromItem === 'function'
                    });

                    // v25.8: Используем HEYS.MealStep.showAddMeal (тот же механизм, что и FAB)
                    try {
                        HEYS.MealStep.showAddMeal({
                            dateKey: date,
                            meals: day.meals || [],
                            pIndex,
                            getProductFromItem,
                            trainings: day.trainings || [],
                            deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
                            prof,
                            dayData: day,
                            onComplete: (newMeal) => {
                                console.info(`[MEAL] ✅ Meal created (new meal btn):`, newMeal.name, `id=${newMeal.id}`);

                                // v25.8.6.7: Use HEYS.Day.addMealDirect — direct setDay + lsSet
                                // This is the SAME pattern as the FAB's addMeal in heys_day_meal_handlers.js
                                if (HEYS?.Day?.addMealDirect) {
                                    HEYS.Day.addMealDirect(newMeal);
                                    console.info(`[MEAL] ✅ addMealDirect succeeded`);
                                } else {
                                    // Fallback: save to localStorage manually + dispatch event
                                    console.warn(`[MEAL] ⚠️ addMealDirect not available, fallback to manual save`);
                                    const dateKey = day?.date || new Date().toISOString().slice(0, 10);
                                    const key = 'heys_dayv2_' + dateKey;
                                    const updatedMeals = [...(day.meals || []), newMeal];
                                    const nowTs = Date.now();
                                    const updatedDay = { ...(day || {}), date: dateKey, meals: updatedMeals, updatedAt: nowTs };
                                    try {
                                        if (HEYS?.utils?.lsSet) HEYS.utils.lsSet(key, updatedDay);
                                        else if (HEYS?.store?.set) HEYS.store.set(key, updatedDay);
                                        else localStorage.setItem(key, JSON.stringify(updatedDay));
                                    } catch (e) { console.error('[MEAL] ❌ Fallback save failed:', e); }
                                    if (HEYS?.Day?.setBlockCloudUpdates) HEYS.Day.setBlockCloudUpdates(nowTs + 3000);
                                    if (HEYS?.Day?.setLastLoadedUpdatedAt) HEYS.Day.setLastLoadedUpdatedAt(nowTs);
                                    window.dispatchEvent(new CustomEvent('heys:day-updated', {
                                        detail: { date: dateKey, source: 'meal-rec-card-local', forceReload: true }
                                    }));
                                }

                                // Найдём индекс нового приёма (after state update)
                                const updatedMeals = [...(day.meals || []), newMeal];
                                const mealIndex = updatedMeals.findIndex(m => m.id === newMeal.id);

                                if (mealIndex >= 0) {
                                    console.info(`${LOG_PREFIX} 📍 Found new meal at index ${mealIndex}`);
                                    onMealSelected(mealIndex);
                                } else {
                                    console.warn(`${LOG_PREFIX} ⚠️ Meal not found, using last index`);
                                    onMealSelected(updatedMeals.length - 1);
                                }
                            }
                        });
                    } catch (err) {
                        console.error(`${LOG_PREFIX} ❌ MealStep.showAddMeal failed (new meal btn):`, err);
                        console.error(`${LOG_PREFIX} 📋 Error stack:`, err?.stack);
                    }
                };

                newBtn.onmouseout = () => {
                    newBtn.style.borderColor = 'var(--border-color, #e5e7eb)';
                    newBtn.style.color = 'var(--text-secondary, #666)';
                };

                buttonsContainer.appendChild(newBtn);

                // Кнопка отмены
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = 'Отмена';
                cancelBtn.style.cssText = `
                    margin-top: 8px;
                    padding: 12px 20px;
                    border: none;
                    border-radius: 12px;
                    background: transparent;
                    color: var(--text-secondary, #666);
                    font-size: 16px;
                    cursor: pointer;
                `;

                cancelBtn.onclick = () => {
                    document.body.removeChild(overlay);
                };

                modal.appendChild(title);
                modal.appendChild(subtitle);
                modal.appendChild(buttonsContainer);
                modal.appendChild(cancelBtn);
                overlay.appendChild(modal);

                // Закрытие по клику на фон
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                    }
                };

                document.body.appendChild(overlay);
            };

            // Показать модалку выбора приёма
            showSmartMealPicker((selectedMealIndex) => {
                // 🆕 v14: R6 (Sprint 1) — Smart Grams Pre-fill verification
                console.info(`${LOG_PREFIX} 📊 Opening AddProductStep:`, {
                    initialSearch: searchQuery,
                    initialGrams: suggestion.grams || 100,
                    suggestedGrams: suggestion.grams,
                    usingMLGrams: !!suggestion.grams,
                    mealIndex: selectedMealIndex
                });

                // Открыть AddProductStep с предзаполненным поиском (Блокер 1 исправлен)
                HEYS.AddProductStep.show({
                    mealIndex: selectedMealIndex,
                    multiProductMode: false,
                    products: HEYS?.products?.getAll?.() || [],
                    day: day,
                    dateKey: day?.date || new Date().toISOString().slice(0, 10),
                    initialSearch: searchQuery, // 🆕 Блокер 1: предзаполняем поиск
                    initialGrams: suggestion.grams || 100, // 🆕 v14: R6 (Sprint 1) — передаём рекомендованные ML граммы
                    onAdd: ({ product: addedProduct, grams, mealIndex }) => {
                        console.info(`[MEAL] ✅ Product selected:`, addedProduct.name, `(${grams}г) to meal ${mealIndex}`);

                        // v25.8.6.7: Use HEYS.Day.addProductToMeal — direct setDay + item creation
                        // This is the SAME handler used by the regular diary flow.
                        // It handles: shared product cloning, harm normalization, setDay, animation, heysProductAdded event
                        if (HEYS?.Day?.addProductToMeal) {
                            const success = HEYS.Day.addProductToMeal(mealIndex, addedProduct, grams);
                            if (success) {
                                console.info(`[MEAL] ✅ addProductToMeal succeeded for meal ${mealIndex}`);
                            } else {
                                console.error(`[MEAL] ❌ addProductToMeal returned false for meal ${mealIndex}`);
                            }
                        } else {
                            console.error(`[MEAL] ❌ HEYS.Day.addProductToMeal not available!`);
                        }

                        // Feedback: markFollowed
                        if (recIdRef.current && !followedRef.current && HEYS?.InsightsPI?.feedbackLoop?.markFollowed) {
                            HEYS.InsightsPI.feedbackLoop.markFollowed(recIdRef.current, true, prof);
                            followedRef.current = true;
                            console.info(`[MEAL] 🎯 Marked as followed: recId=${recIdRef.current}`);
                        }

                        // Haptic feedback
                        if (window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred) {
                            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                        }

                        // Toast
                        const mealName = day?.meals?.[mealIndex]?.name || `Приём ${mealIndex + 1}`;
                        if (HEYS?.Toast?.success) {
                            HEYS.Toast.success(`✅ ${addedProduct.name} (${grams}г) → ${mealName}`);
                        }
                    },
                    onClose: () => {
                        console.info(`[MEAL] ❌ AddProductStep cancelled (meal already created, product not added)`);
                        console.info(`${LOG_PREFIX} ❌ AddProductStep cancelled, markFollowed not called`);

                        // v25.8.6.3: Keep block active even on cancel (meal exists, needs protection)
                        const blockUntil = Date.now() + 3000;
                        if (HEYS?.Day?.setBlockCloudUpdates) {
                            HEYS.Day.setBlockCloudUpdates(blockUntil);
                            const blockTime = new Date(blockUntil).toLocaleTimeString('ru-RU', { hour12: false });
                            console.info(`[MEAL] 🔒 Refreshed block until ${blockTime} (cancelled)`);
                        }
                    }
                });
            });
        };

        /**
         * v27.4: Handle product selection (visual only, no auto-add)
         */
        const handleProductSelect = (product) => {
            const productKey = `${product.productId || product.product}`;
            const isCurrentlySelected = checkedProducts[productKey] || false;
            const newState = !isCurrentlySelected;

            // Update selection state (visual only)
            setCheckedProducts(prev => ({
                ...prev,
                [productKey]: newState
            }));

            console.info(
                `${LOG_PREFIX} [PRODUCT] ${newState ? '✅' : '⬜'} ${newState ? 'Selected' : 'Deselected'}:`,
                product.product
            );
        };

        /**
         * v27.5: Add all selected products at once
         */
        const handleAddSelectedProducts = (groups) => {
            if (!groups || groups.length === 0) return;

            const selectedProducts = [];

            // Collect all selected products from all groups
            groups.forEach(group => {
                if (group.products) {
                    group.products.forEach(product => {
                        const productKey = `${product.productId || product.product}`;
                        if (checkedProducts[productKey]) {
                            selectedProducts.push(product);
                        }
                    });
                }
            });

            if (selectedProducts.length === 0) {
                console.warn(`${LOG_PREFIX} [BULK ADD] ⚠️ No products selected`);
                return;
            }

            console.info(`${LOG_PREFIX} [BULK ADD] 🎁 Adding ${selectedProducts.length} selected products`);

            // Add each product sequentially (opens smart meal picker for each)
            selectedProducts.forEach((product, idx) => {
                setTimeout(() => {
                    handleAddSuggestion(product);
                }, idx * 100); // Небольшая задержка между добавлениями
            });

            // Clear selection after adding
            setCheckedProducts({});

            console.info(`${LOG_PREFIX} [BULK ADD] ✅ Cleared selection`);
        };

        /**
         * v27: Render grouped products (categories with checkboxes)
         */
        const renderGroupedProducts = (groups) => {
            if (!groups || groups.length === 0) return null;

            return groups.map((group, groupIdx) =>
                h('div', { className: 'meal-rec-card__product-group', key: groupIdx },
                    // Group header: emoji + categoryName
                    h('div', { className: 'meal-rec-card__group-header' },
                        h('span', { className: 'meal-rec-card__group-emoji' }, group.emoji),
                        h('span', { className: 'meal-rec-card__group-name' }, group.categoryName)
                    ),
                    // Products in this group
                    h('div', { className: 'meal-rec-card__group-products' },
                        ...group.products.map((product, pIdx) => {
                            const productKey = `${product.productId || product.product}`;
                            const isSelected = checkedProducts[productKey] || false;
                            const wrapperClass = isSelected
                                ? 'meal-rec-card__product-item meal-rec-card__product-item--selected'
                                : 'meal-rec-card__product-item';

                            return h('div', {
                                className: wrapperClass,
                                key: pIdx,
                                onClick: (e) => {
                                    // Only toggle selection if clicking on card itself (not button)
                                    if (e.target.tagName !== 'BUTTON') {
                                        e.stopPropagation();
                                        handleProductSelect(product);
                                    }
                                }
                            },
                                h('div', { className: 'meal-rec-card__product-content' },
                                    h('div', { className: 'meal-rec-card__product-main' },
                                        h('div', { className: 'meal-rec-card__product-name-wrapper' },
                                            h('span', { className: 'meal-rec-card__product-name' }, product.product),
                                            // Badge: 👤 (history) или 🌐 (general)
                                            h('span', {
                                                className: 'meal-rec-card__product-badge'
                                            }, product.source === 'history' ? '👤' : '🌐')
                                        ),
                                        h('span', { className: 'meal-rec-card__product-grams' }, `${product.grams} г`)
                                    )
                                ),
                                // Add button (like in flat suggestions mode)
                                h('button', {
                                    className: 'meal-rec-card__product-add-btn',
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        handleAddSuggestion(product);
                                    },
                                    title: 'Добавить в дневник'
                                }, '+')
                            );
                        })
                    )
                )
            );
        };

        // Собираем рекомендацию
        const recommendation = useMemo(() => {
            console.info(`${LOG_PREFIX} 🎬 useMemo triggered`);

            if (!global.HEYS?.InsightsPI?.mealRecommender?.recommend) {
                console.warn(`${LOG_PREFIX} ❌ Backend not loaded`);
                return null;
            }

            console.info(`${LOG_PREFIX} ✅ Backend available`);

            const context = buildRecommendationContext(day, dayTot, normAbs, prof, optimum, pIndex);
            if (!context) {
                console.warn(`${LOG_PREFIX} ⚠️ Insufficient data for context`);
                return null;
            }

            console.info(`${LOG_PREFIX} 🚀 Calling recommend()...`);

            try {
                // R2.6: Load historical days for Deep Insights enhancement
                const historicalDays = [];
                const today = new Date();

                // Resolve lsGet (with fallback to direct localStorage access)
                const safeLsGet = resolveLsGet();

                // Load last 30 days from localStorage (lsGet auto-scopes by HEYS.currentClientId)
                for (let i = 0; i < 30; i++) {
                    const date = new Date(today);
                    date.setDate(date.getDate() - i);
                    const dateStr = date.toISOString().split('T')[0];
                    const dayKey = `heys_dayv2_${dateStr}`;
                    const dayData = safeLsGet(dayKey); // lsGet auto-scopes by currentClientId
                    if (dayData && dayData.date) {
                        historicalDays.push(dayData);
                    }
                }

                console.info(`${LOG_PREFIX} 📊 Historical days loaded:`, {
                    count: historicalDays.length,
                    currentClientId: global.HEYS?.currentClientId || 'none'
                });

                // Call recommend with historical days for R2.6 enhancement
                // Signature: recommend(context, profile, pIndex, days)
                const result = global.HEYS.InsightsPI.mealRecommender.recommend(
                    context,
                    prof,           // profile (required for validation)
                    pIndex,         // product index (for smart suggestions)
                    historicalDays  // days for R2.6 Deep Insights enhancement
                );

                if (!result || !result.available) {
                    console.info(`${LOG_PREFIX} ⚠️ Hidden:`, {
                        reason: result?.error || 'Not available'
                    });
                    return null;
                }

                console.info(`${LOG_PREFIX} ✅ Rendered:`, {
                    idealTime: result.timing?.ideal || '—',
                    protein: result.macros?.protein || 0,
                    carbs: result.macros?.carbs || 0,
                    kcal: result.macros?.kcal || 0,
                    confidence: result.confidence || 0
                });

                return result;
            } catch (err) {
                console.error(`${LOG_PREFIX} ❌ Error:`, err);
                return null;
            }
        }, [mealsCount, lastMealTime, eatenKcal, eatenProt, targetKcal, targetProt, pIndex]);

        // R2.7 Step 2: Store recommendation in feedbackLoop when it's generated (new or changed)
        useEffect(() => {
            if (!recommendation || !recommendation.available) return;
            if (!global.HEYS?.InsightsPI?.feedbackLoop?.storeRecommendation) return;

            // Check if this is a new recommendation (not a re-render of the same one)
            const recKey = JSON.stringify({
                scenario: recommendation.scenario,
                time: recommendation.timing?.ideal,
                kcal: recommendation.macros?.kcal
            });

            if (prevRecommendationRef.current === recKey) return;

            try {
                const recId = global.HEYS.InsightsPI.feedbackLoop.storeRecommendation(
                    recommendation,
                    'meal',
                    prof
                );
                recIdRef.current = recId;
                followedRef.current = false;
                prevRecommendationRef.current = recKey;

                console.info(`${LOG_PREFIX} ✅ Recommendation stored, recId:`, recId);
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ Failed to store recommendation:`, err?.message);
            }
        }, [recommendation, prof]);

        // R2.7 Step 4: Auto-track when user adds a product matching recommendation
        useEffect(() => {
            if (!recommendation || !recommendation.suggestions) return;

            const handleProductAdded = (event) => {
                if (followedRef.current) return; // Already tracked
                if (!recIdRef.current) return;
                if (!event.detail?.product) return;

                const addedProduct = event.detail.product;
                const addedName = (addedProduct.name || addedProduct.title || '').toLowerCase().trim();

                // Check if added product matches any suggestion
                const matched = recommendation.suggestions.some((s) => {
                    const suggestionName = (s.product || '').toLowerCase().trim();
                    return suggestionName === addedName;
                });

                if (matched && global.HEYS?.InsightsPI?.feedbackLoop?.markFollowed) {
                    try {
                        global.HEYS.InsightsPI.feedbackLoop.markFollowed(recIdRef.current, true, prof);
                        followedRef.current = true;
                        console.info(`${LOG_PREFIX} ✅ Auto-tracked: user added recommended product:`, addedName);
                    } catch (err) {
                        console.warn(`${LOG_PREFIX} ⚠️ markFollowed failed:`, err?.message);
                    }
                }
            };

            window.addEventListener('heysProductAdded', handleProductAdded);
            return () => window.removeEventListener('heysProductAdded', handleProductAdded);
        }, [recommendation, prof]);

        // Если рекомендация недоступна — не рендерим карточку
        if (!recommendation) {
            console.warn(`${LOG_PREFIX} 🚫 Card NOT rendered (recommendation is null)`);
            return null;
        }

        console.info(`${LOG_PREFIX} 🎨 Rendering card UI...`);

        // v27: Extract mode and groups for grouped product selection
        const { timing, macros, suggestions, reasoning, confidence, scenario, scenarioIcon, scenarioReason, mealsPlan, mode, groups } = recommendation;

        // 🆕 v26: Multi-meal mode detection
        const isMultiMeal = mealsPlan && mealsPlan.available && mealsPlan.meals && mealsPlan.meals.length > 1;

        console.info(`${LOG_PREFIX} [CARD.mode] 🎨 Rendering mode:`, {
            isMultiMeal,
            mealsCount: mealsPlan?.meals?.length || 0,
            productMode: mode || 'legacy',
            hasSuggestions: suggestions?.length || 0,
            hasGroups: groups?.length || 0,
            scenario,
            timing,
            macros: isMultiMeal ? mealsPlan.summary?.totalMacros : macros
        });

        if (isMultiMeal) {
            console.info(`${LOG_PREFIX} [CARD.multi] 📋 Multi-meal plan:`, {
                totalMeals: mealsPlan.summary?.totalMeals,
                timeline: `${mealsPlan.summary?.timelineStart} → ${mealsPlan.summary?.timelineEnd}`,
                totalMacros: mealsPlan.summary?.totalMacros,
                sleepTarget: mealsPlan.summary?.sleepTarget,
                meals: mealsPlan.meals.map((m, i) => ({
                    index: i + 1,
                    time: m.timeStart,
                    macros: m.macros,
                    isActionable: m.isActionable
                }))
            });
        }

        console.info(`${LOG_PREFIX} 🎨 Rendering mode:`, {
            isMultiMeal,
            mealsCount: isMultiMeal ? mealsPlan.meals.length : 1
        });

        // Scenario-aware visibility (v2.4)
        // GOAL_REACHED: show water recommendation, hide macros
        // Other scenarios: show if has macros
        const isGoalReached = scenario === 'GOAL_REACHED';
        const remainingKcal = macros?.remainingKcal || 0;

        if (!isGoalReached && (remainingKcal < 50 || (macros?.protein <= 0 && macros?.carbs <= 0))) {
            console.info(`${LOG_PREFIX} ℹ️ Hiding card: insufficient remaining budget:`, {
                scenario,
                remainingKcal,
                protein: macros?.protein,
                carbs: macros?.carbs
            });
            return null;
        }

        // Scenario-aware header titles (v2.4)
        const SCENARIO_TITLES = {
            'GOAL_REACHED': 'Цель дня выполнена',
            'LIGHT_SNACK': 'Лёгкий перекус',
            'LATE_EVENING': 'Вечерний приём',
            'PRE_WORKOUT': 'Перед тренировкой',
            'POST_WORKOUT': 'После тренировки',
            'PROTEIN_DEFICIT': 'Добираем белок',
            'STRESS_EATING': 'Здоровый антистресс',
            'BALANCED': 'Следующий приём'
        };

        const scenarioTitle = SCENARIO_TITLES[scenario] || 'Следующий приём';
        const displayIcon = scenarioIcon || '🍽️';

        // 🆕 v26: Multi-meal header content
        let headerTitle, headerTimeRange, headerSubtitle;

        if (isMultiMeal) {
            const mealsCount = mealsPlan.meals.length;
            const pluralMeals = mealsCount === 2 ? 'приёма' : mealsCount >= 5 ? 'приёмов' : 'приёма';
            headerTitle = `${mealsCount} ${pluralMeals} до сна`;
            headerTimeRange = `${mealsPlan.summary.timelineStart}-${mealsPlan.summary.timelineEnd}`;
            headerSubtitle = scenarioReason || `План питания до ${mealsPlan.summary.sleepTarget}`;
        } else {
            headerTitle = scenarioTitle;
            headerTimeRange = !isGoalReached && timing?.ideal ? timing.ideal : null;
            headerSubtitle = scenarioReason || timing?.reason || 'На основе анализа вашего дня';
        }

        // Compact header (collapsed state)
        const cardHeader = h('div', {
            className: 'meal-rec-card__header',
            onClick: () => setExpanded(!expanded)
        },
            h('div', { className: 'meal-rec-card__icon' }, displayIcon),
            h('div', { className: 'meal-rec-card__title' },
                h('div', { className: 'meal-rec-card__badge' }, 'Рекомендуем'),
                h('div', { className: 'meal-rec-card__time' },
                    headerTitle,
                    headerTimeRange && h('span', { className: 'meal-rec-card__time-value' },
                        ` · ${headerTimeRange}`
                    )
                ),
                h('div', { className: 'meal-rec-card__subtitle' },
                    headerSubtitle
                )
            ),
            h('div', { className: 'meal-rec-card__expand-icon' },
                expanded ? '▲' : '▼'
            )
        );

        // Макро-чипы (skip for GOAL_REACHED)
        // 🆕 v26: В multi-meal режиме показываем суммарные макросы из плана
        let macroChips = null;
        if (!isGoalReached) {
            const displayMacros = isMultiMeal ? mealsPlan.summary.totalMacros : macros;

            macroChips = h('div', { className: 'meal-rec-card__macros' },
                h('div', { className: 'meal-rec-card__macro-chip meal-rec-card__macro-chip--protein' },
                    h('span', { className: 'meal-rec-card__macro-label' }, 'Б'),
                    h('span', { className: 'meal-rec-card__macro-value' },
                        isMultiMeal ? displayMacros.prot : formatMacroRange(displayMacros?.protein, displayMacros?.proteinRange)
                    ),
                    h('span', { className: 'meal-rec-card__macro-unit' }, 'г')
                ),
                h('div', { className: 'meal-rec-card__macro-chip meal-rec-card__macro-chip--carbs' },
                    h('span', { className: 'meal-rec-card__macro-label' }, 'У'),
                    h('span', { className: 'meal-rec-card__macro-value' },
                        isMultiMeal ? displayMacros.carbs : formatMacroRange(displayMacros?.carbs, displayMacros?.carbsRange)
                    ),
                    h('span', { className: 'meal-rec-card__macro-unit' }, 'г')
                ),
                h('div', { className: 'meal-rec-card__macro-chip meal-rec-card__macro-chip--kcal' },
                    h('span', { className: 'meal-rec-card__macro-label' }, 'ккал'),
                    h('span', { className: 'meal-rec-card__macro-value' },
                        isMultiMeal ? displayMacros.kcal : formatMacroRange(displayMacros?.kcal, displayMacros?.kcalRange)
                    )
                )
            );
        }

        // Expanded details — v26: multi-meal support или original compact layout
        let expandedDetails = null;
        if (expanded) {
            if (isMultiMeal) {
                // 🆕 Multi-meal mode: показываем sub-cards для каждого приёма
                const mealSubCards = mealsPlan.meals.map((meal, mealIdx) => {
                    const mealTitle = `Приём ${meal.index} • ${meal.timeStart}-${meal.timeEnd}`;
                    const scenarioText = HEYS.InsightsPI?.mealRecommender?.getScenarioTitle?.(meal.scenario) || 'Приём пищи';

                    // Wave info line: "Волна до ~21:30 · жиросж. 21:30-22:00"
                    const waveInfo = `Волна до ~${meal.estimatedWaveEnd} · жиросж. ${meal.fatBurnWindow.start}-${meal.fatBurnWindow.end}`;

                    return h('div', { className: 'meal-rec-card__meal-subcard', key: mealIdx },
                        // Divider with time
                        h('div', { className: 'meal-rec-card__meal-divider' }, `━━━ ${mealTitle} ━━━━━`),

                        // Scenario title
                        h('div', { className: 'meal-rec-card__meal-scenario' }, scenarioText),

                        // v27: Grouped products mode (multiple products per category with checkboxes)
                        meal.isActionable && meal.groups && meal.groups.length > 0 ?
                            h('div', { className: 'meal-rec-card__grouped-products' },
                                ...renderGroupedProducts(meal.groups)
                            )
                            :
                            // Legacy: Flat suggestions mode (single products with + buttons)
                            meal.isActionable && meal.suggestions && meal.suggestions.length > 0 && h('div', { className: 'meal-rec-card__suggestions' },
                                ...meal.suggestions.map((s, idx) =>
                                    h('div', { className: 'meal-rec-card__suggestion', key: idx },
                                        h('button', {
                                            className: 'meal-rec-card__suggestion-add',
                                            onClick: (e) => {
                                                e.stopPropagation();
                                                handleAddSuggestion(s);
                                            },
                                            title: 'Добавить в дневник'
                                        }, '+'),
                                        h('div', { className: 'meal-rec-card__suggestion-info' },
                                            h('div', { className: 'meal-rec-card__suggestion-main' },
                                                h('span', { className: 'meal-rec-card__suggestion-product' }, s.product),
                                                h('span', { className: 'meal-rec-card__suggestion-grams' }, `${s.grams} г`)
                                            ),
                                            s.reason && h('div', { className: 'meal-rec-card__suggestion-reason' }, s.reason)
                                        )
                                    )
                                )
                            ),

                        // Macros line: "Б 38г · У 8г · ккал 200"
                        h('div', { className: 'meal-rec-card__meal-macros' },
                            `Б ${Math.round(meal.macros.prot)}г · У ${Math.round(meal.macros.carbs)}г · ккал ${Math.round(meal.macros.kcal)}`
                        ),

                        // Wave info
                        h('div', { className: 'meal-rec-card__meal-wave' }, waveInfo),

                        // Для не-actionable приёмов: hint
                        !meal.isActionable && h('div', { className: 'meal-rec-card__meal-hint' }, '(добавить можно позже)')
                    );
                });

                expandedDetails = h('div', { className: 'meal-rec-card__details meal-rec-card__details--multi' },
                    ...mealSubCards,

                    // Footer с feedback
                    h('div', { className: 'meal-rec-card__footer' },
                        h('div', { className: 'meal-rec-card__feedback-inline' },
                            !userFeedback && h('span', { className: 'meal-rec-card__feedback-label' }, 'Полезно?'),
                            h('button', {
                                className: `meal-rec-card__feedback-btn ${userFeedback === 'positive' ? 'meal-rec-card__feedback-btn--selected' : ''}`,
                                onClick: (e) => {
                                    e.stopPropagation();
                                    handleFeedback(1);
                                },
                                disabled: userFeedback !== null,
                                title: 'Да, помогла'
                            }, '👍'),
                            h('button', {
                                className: `meal-rec-card__feedback-btn ${userFeedback === 'negative' ? 'meal-rec-card__feedback-btn--selected' : ''}`,
                                onClick: (e) => {
                                    e.stopPropagation();
                                    handleFeedback(-1);
                                },
                                disabled: userFeedback !== null,
                                title: 'Нет, не помогла'
                            }, '👎'),
                            userFeedback && h('span', { className: 'meal-rec-card__feedback-thanks' }, '💚')
                        )
                    )
                );
            } else {
                // Original single-meal layout (v25.9)
                expandedDetails = h('div', { className: 'meal-rec-card__details' },
                    // v27: Grouped products mode (multiple products per category with checkboxes)
                    mode === 'grouped' && groups && groups.length > 0 ?
                        h('div', { className: 'meal-rec-card__grouped-products' },
                            ...renderGroupedProducts(groups),
                            // v27.5: Bulk add button (appears after groups)
                            (() => {
                                const selectedCount = Object.values(checkedProducts).filter(Boolean).length;
                                const hasSelection = selectedCount > 0;
                                return h('button', {
                                    className: hasSelection
                                        ? 'meal-rec-card__add-selected-btn meal-rec-card__add-selected-btn--active'
                                        : 'meal-rec-card__add-selected-btn',
                                    disabled: !hasSelection,
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        handleAddSelectedProducts(groups);
                                    }
                                }, hasSelection
                                    ? `Добавить выбранные (${selectedCount})`
                                    : 'Выберите продукты для добавления'
                                );
                            })()
                        )
                        :
                        // Legacy: Flat suggestions mode (single products with + buttons)
                        suggestions && suggestions.length > 0 && h('div', { className: 'meal-rec-card__suggestions' },
                            ...suggestions.map((s, idx) =>
                                h('div', { className: 'meal-rec-card__suggestion', key: idx },
                                    h('button', {
                                        className: 'meal-rec-card__suggestion-add',
                                        onClick: (e) => {
                                            e.stopPropagation();
                                            handleAddSuggestion(s);
                                        },
                                        title: 'Добавить в дневник'
                                    }, '+'),
                                    h('div', { className: 'meal-rec-card__suggestion-info' },
                                        h('div', { className: 'meal-rec-card__suggestion-main' },
                                            h('span', { className: 'meal-rec-card__suggestion-product' }, s.product),
                                            h('span', { className: 'meal-rec-card__suggestion-grams' }, `${s.grams} г`)
                                        ),
                                        s.reason && h('div', { className: 'meal-rec-card__suggestion-reason' }, s.reason)
                                    )
                                )
                            )
                        ),

                    // Reasoning — compact tags
                    reasoning && reasoning.length > 0 && h('div', { className: 'meal-rec-card__reasoning' },
                        ...reasoning.map((r, idx) =>
                            h('span', { className: 'meal-rec-card__reason-tag', key: idx }, r)
                        )
                    ),

                    // Footer: confidence + feedback inline
                    h('div', { className: 'meal-rec-card__footer' },
                        confidence !== undefined && h('span', { className: 'meal-rec-card__confidence' },
                            `${Math.round(confidence * 100)}%`
                        ),
                        h('div', { className: 'meal-rec-card__feedback-inline' },
                            !userFeedback && h('span', { className: 'meal-rec-card__feedback-label' }, 'Полезно?'),
                            h('button', {
                                className: `meal-rec-card__feedback-btn ${userFeedback === 'positive' ? 'meal-rec-card__feedback-btn--selected' : ''}`,
                                onClick: (e) => {
                                    e.stopPropagation();
                                    handleFeedback(1);
                                },
                                disabled: userFeedback !== null,
                                title: 'Да, помогла'
                            }, '👍'),
                            h('button', {
                                className: `meal-rec-card__feedback-btn ${userFeedback === 'negative' ? 'meal-rec-card__feedback-btn--selected' : ''}`,
                                onClick: (e) => {
                                    e.stopPropagation();
                                    handleFeedback(-1);
                                },
                                disabled: userFeedback !== null,
                                title: 'Нет, не помогла'
                            }, '👎'),
                            userFeedback && h('span', { className: 'meal-rec-card__feedback-thanks' }, '💚')
                        )
                    )
                );
            }
        }

        // Main card container
        const cardElement = h('div', {
            className: `meal-rec-card ${expanded ? 'meal-rec-card--expanded' : ''}`,
            'data-testid': 'meal-rec-card'
        },
            cardHeader,
            macroChips,
            expandedDetails
        );

        console.info(`${LOG_PREFIX} ✅ Card element created successfully`);

        return cardElement;
    }

    // Memoized component — prevents 30+ re-renders per page load
    const MemoizedMealRecommenderCard = React.memo(MealRecommenderCard, (prev, next) => {
        // Return true = skip re-render (props are equal)
        // P2 Fix: Removed pIndex reference check — parent may create new object each render
        return (
            (prev.day?.meals?.length || 0) === (next.day?.meals?.length || 0) &&
            (prev.day?.meals?.[(prev.day?.meals?.length || 1) - 1]?.time || '') ===
            (next.day?.meals?.[(next.day?.meals?.length || 1) - 1]?.time || '') &&
            Math.round(prev.dayTot?.kcal || 0) === Math.round(next.dayTot?.kcal || 0) &&
            Math.round(prev.dayTot?.prot || 0) === Math.round(next.dayTot?.prot || 0) &&
            Math.round(prev.normAbs?.kcal || 0) === Math.round(next.normAbs?.kcal || 0) &&
            prev.optimum === next.optimum
        );
    });

    /**
     * Render function для интеграции в diary section
     */
    function renderCard(props) {
        if (!props || !props.React) {
            console.warn(`${LOG_PREFIX} ❌ renderCard: missing props or React`);
            return null;
        }

        return h(MemoizedMealRecommenderCard, props);
    }

    // Export to global
    global.HEYS = global.HEYS || {};
    global.HEYS.MealRecCard = {
        renderCard
    };

    console.info(`${LOG_PREFIX} 📦 Module loaded (v27.5: Bulk add selected products + improved reasoning tags)`);

})(window);
