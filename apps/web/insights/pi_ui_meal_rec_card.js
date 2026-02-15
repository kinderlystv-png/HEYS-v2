/**
 * Meal Recommender Card — Compact UI for Day View
 * v2.9.0 — R2.6 Deep Insights Integration (profile parameter fix)
 * Рендерит карточку рекомендации следующего приёма пищи в дневнике
 * Позиция: между refeedCard и supplementsCard (выше витаминов)
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
 * v2.7 fixes:
 * - Added resolveLsGet() with localStorage fallback (like Product Picker)
 * - Fixes issue where global.U.lsGet was unavailable during useMemo execution
 * - Historical days now load successfully (was: count=0, now: 30)
 * 
 * v2.8 fixes:
 * - Fixed parameter order: recommend(context, profile, pIndex, days)
 * - Historical days now properly passed as 4th parameter (was: 2nd)
 * - R2.6 enhancement now active (was: daysCount=0, now: 30)
 * 
 * v2.9 fixes:
 * - Fixed profile/pIndex parameters: now passed from component props (was: undefined)
 * - Recommender validation now passes (was: "Missing context or profile")
 * - Card now renders successfully
 */
(function (global) {
    'use strict';

    const { React } = global;
    if (!React) return;

    const h = React.createElement;
    const { useState, useMemo } = React;
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
    function buildRecommendationContext(day, dayTot, normAbs, prof, optimum) {
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
            lastMeal: lastMeal ? { time: lastMeal.time } : null,
            dayTarget: {
                kcal: optimum || normAbs.kcal || 0,
                protein: normAbs.prot || 0,
                carbs: normAbs.carb || 0
            },
            dayEaten: {
                kcal: dayTot.kcal || 0,
                protein: dayTot.prot || 0,
                carbs: dayTot.carb || 0
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
            }
        };

        // Собираем рекомендацию
        const recommendation = useMemo(() => {
            console.info(`${LOG_PREFIX} 🎬 useMemo triggered`);

            if (!global.HEYS?.InsightsPI?.mealRecommender?.recommend) {
                console.warn(`${LOG_PREFIX} ❌ Backend not loaded`);
                return null;
            }

            console.info(`${LOG_PREFIX} ✅ Backend available`);

            const context = buildRecommendationContext(day, dayTot, normAbs, prof, optimum);
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

        // Если рекомендация недоступна — не рендерим карточку
        if (!recommendation) {
            console.warn(`${LOG_PREFIX} 🚫 Card NOT rendered (recommendation is null)`);
            return null;
        }

        console.info(`${LOG_PREFIX} 🎨 Rendering card UI...`);

        const { timing, macros, suggestions, reasoning, confidence, scenario, scenarioIcon, scenarioReason } = recommendation;

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

        // Compact header (collapsed state)
        const cardHeader = h('div', {
            className: 'meal-rec-card__header',
            onClick: () => setExpanded(!expanded)
        },
            h('div', { className: 'meal-rec-card__icon' }, displayIcon),
            h('div', { className: 'meal-rec-card__title' },
                h('div', { className: 'meal-rec-card__time' },
                    scenarioTitle,
                    !isGoalReached && timing?.ideal && h('span', { className: 'meal-rec-card__time-value' },
                        ` ~${timing.ideal}`
                    )
                ),
                h('div', { className: 'meal-rec-card__subtitle' },
                    scenarioReason || timing?.reason || 'Рекомендация на основе анализа дня'
                )
            ),
            h('div', { className: 'meal-rec-card__expand-icon' },
                expanded ? '▲' : '▼'
            )
        );

        // Макро-чипы (skip for GOAL_REACHED)
        const macroChips = !isGoalReached && h('div', { className: 'meal-rec-card__macros' },
            h('div', { className: 'meal-rec-card__macro-chip meal-rec-card__macro-chip--protein' },
                h('span', { className: 'meal-rec-card__macro-label' }, 'Б'),
                h('span', { className: 'meal-rec-card__macro-value' },
                    formatMacroRange(macros?.protein, macros?.proteinRange)
                ),
                h('span', { className: 'meal-rec-card__macro-unit' }, 'г')
            ),
            h('div', { className: 'meal-rec-card__macro-chip meal-rec-card__macro-chip--carbs' },
                h('span', { className: 'meal-rec-card__macro-label' }, 'У'),
                h('span', { className: 'meal-rec-card__macro-value' },
                    formatMacroRange(macros?.carbs, macros?.carbsRange)
                ),
                h('span', { className: 'meal-rec-card__macro-unit' }, 'г')
            ),
            h('div', { className: 'meal-rec-card__macro-chip meal-rec-card__macro-chip--kcal' },
                h('span', { className: 'meal-rec-card__macro-label' }, 'ккал'),
                h('span', { className: 'meal-rec-card__macro-value' },
                    formatMacroRange(macros?.kcal, macros?.kcalRange)
                )
            )
        );

        // Expanded details (suggestions + reasoning)
        const expandedDetails = expanded && h('div', { className: 'meal-rec-card__details' },
            // Suggestions section
            suggestions && suggestions.length > 0 && h('div', { className: 'meal-rec-card__suggestions' },
                h('div', { className: 'meal-rec-card__section-title' }, 'Варианты продуктов:'),
                ...suggestions.map((s, idx) =>
                    h('div', { className: 'meal-rec-card__suggestion', key: idx },
                        h('span', { className: 'meal-rec-card__suggestion-product' }, s.product),
                        h('span', { className: 'meal-rec-card__suggestion-grams' }, `${s.grams}г`),
                        s.reason && h('span', { className: 'meal-rec-card__suggestion-reason' },
                            ` — ${s.reason}`
                        )
                    )
                )
            ),

            // Reasoning section
            reasoning && reasoning.length > 0 && h('div', { className: 'meal-rec-card__reasoning' },
                h('div', { className: 'meal-rec-card__section-title' }, 'Почему:'),
                ...reasoning.map((r, idx) =>
                    h('div', { className: 'meal-rec-card__reason', key: idx }, r)
                )
            ),

            // Confidence badge
            confidence !== undefined && h('div', { className: 'meal-rec-card__confidence' },
                `Уверенность: ${Math.round(confidence * 100)}%`
            ),

            // Feedback buttons (R2.7)
            h('div', { className: 'meal-rec-card__feedback' },
                h('div', { className: 'meal-rec-card__feedback-title' }, 'Помогла рекомендация?'),
                h('div', { className: 'meal-rec-card__feedback-buttons' },
                    h('button', {
                        className: `meal-rec-card__feedback-btn ${userFeedback === 'positive' ? 'meal-rec-card__feedback-btn--selected' : ''}`,
                        onClick: (e) => {
                            e.stopPropagation(); // prevent card collapse
                            handleFeedback(1);
                        },
                        disabled: userFeedback !== null,
                        title: 'Да, помогла'
                    }, '👍'),
                    h('button', {
                        className: `meal-rec-card__feedback-btn ${userFeedback === 'negative' ? 'meal-rec-card__feedback-btn--selected' : ''}`,
                        onClick: (e) => {
                            e.stopPropagation(); // prevent card collapse
                            handleFeedback(-1);
                        },
                        disabled: userFeedback !== null,
                        title: 'Нет, не помогла'
                    }, '👎')
                ),
                userFeedback && h('div', { className: 'meal-rec-card__feedback-thanks' },
                    'Спасибо за отзыв! 💚'
                )
            )
        );

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

    console.info(`${LOG_PREFIX} 📦 Module loaded`);

})(window);
