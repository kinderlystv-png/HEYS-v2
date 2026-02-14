/**
 * Meal Recommender Card — Compact UI for Day View
 * v2.4.0 — Scenario-aware UI
 * Рендерит карточку рекомендации следующего приёма пищи в дневнике
 * Позиция: между refeedCard и supplementsCard (выше витаминов)
 * 
 * v2.4 features:
 * - Scenario-specific icons and titles
 * - Conditional rendering for GOAL_REACHED (water instead of macros)
 * - Adaptive header text based on detected scenario
 */
(function (global) {
    'use strict';

    const { React } = global;
    if (!React) return;

    const h = React.createElement;
    const { useState, useMemo } = React;

    /**
     * Собрать контекст для recommend() из данных дня
     */
    function buildRecommendationContext(day, dayTot, normAbs, prof) {
        console.log('[HEYS.mealRec.card] 🔍 buildContext called:', {
            hasDay: !!day,
            hasDayTot: !!dayTot,
            hasNormAbs: !!normAbs,
            hasProf: !!prof,
            mealsCount: day?.meals?.length || 0,
            trainingsCount: day?.trainings?.length || 0
        });

        if (!day || !dayTot || !normAbs) {
            console.warn('[HEYS.mealRec.card] ❌ Missing required data:', {
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
                    console.warn('[HEYS.mealRec.card] ⚠️ localStorage fallback read failed:', { key, message: err?.message });
                    return fallback;
                }
            };

        const context = {
            currentTime: currentTimeStr,
            lastMeal: lastMeal ? { time: lastMeal.time } : null,
            dayTarget: {
                kcal: normAbs.kcal || 0,
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

        console.info('[HEYS.mealRec.card] ✅ Context built:', {
            currentTime: currentTimeStr,
            lastMealTime: lastMeal?.time || 'none',
            mealsToday: meals.length,
            dayEaten: `${Math.round(dayTot.kcal)}ккал, ${Math.round(dayTot.prot)}г белка`,
            dayTarget: `${Math.round(normAbs.kcal)}ккал, ${Math.round(normAbs.prot)}г белка`,
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
    function MealRecommenderCard({ React, day, prof, pIndex, dayTot, normAbs }) {
        const [expanded, setExpanded] = useState(false);

        // Собираем рекомендацию
        const recommendation = useMemo(() => {
            console.log('[HEYS.mealRec.card] 🎬 useMemo triggered');

            if (!global.HEYS?.InsightsPI?.mealRecommender?.recommend) {
                console.warn('[HEYS.mealRec.card] ❌ Backend not loaded');
                return null;
            }

            console.log('[HEYS.mealRec.card] ✅ Backend available');

            const context = buildRecommendationContext(day, dayTot, normAbs, prof);
            if (!context) {
                console.warn('[HEYS.mealRec.card] ⚠️ Insufficient data for context');
                return null;
            }

            console.log('[HEYS.mealRec.card] 🚀 Calling recommend()...');

            try {
                const result = global.HEYS.InsightsPI.mealRecommender.recommend(
                    context,
                    prof,
                    pIndex
                );

                if (!result || !result.available) {
                    console.info('[HEYS.mealRec.card] ⚠️ Hidden:', {
                        reason: result?.error || 'Not available'
                    });
                    return null;
                }

                console.info('[HEYS.mealRec.card] ✅ Rendered:', {
                    idealTime: result.timing?.ideal || '—',
                    protein: result.macros?.protein || 0,
                    carbs: result.macros?.carbs || 0,
                    kcal: result.macros?.kcal || 0,
                    confidence: result.confidence || 0
                });

                return result;
            } catch (err) {
                console.error('[HEYS.mealRec.card] ❌ Error:', err);
                return null;
            }
        }, [day, prof, pIndex, dayTot, normAbs]);

        // Если рекомендация недоступна — не рендерим карточку
        if (!recommendation) {
            console.warn('[HEYS.mealRec.card] 🚫 Card NOT rendered (recommendation is null)');
            return null;
        }

        console.log('[HEYS.mealRec.card] 🎨 Rendering card UI...');

        const { timing, macros, suggestions, reasoning, confidence, scenario, scenarioIcon, scenarioReason } = recommendation;

        // Scenario-aware visibility (v2.4)
        // GOAL_REACHED: show water recommendation, hide macros
        // Other scenarios: show if has macros
        const isGoalReached = scenario === 'GOAL_REACHED';
        const remainingKcal = macros?.remainingKcal || 0;

        if (!isGoalReached && (remainingKcal < 50 || (macros?.protein <= 0 && macros?.carbs <= 0))) {
            console.info('[HEYS.mealRec.card] ℹ️ Hiding card: insufficient remaining budget:', {
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

        console.info('[HEYS.mealRec.card] ✅ Card element created successfully');

        return cardElement;
    }

    /**
     * Render function для интеграции в diary section
     */
    function renderCard(props) {
        console.log('[HEYS.mealRec.card] 📞 renderCard called:', {
            hasProps: !!props,
            hasReact: !!props?.React,
            hasDay: !!props?.day,
            hasProf: !!props?.prof
        });

        if (!props || !props.React) {
            console.warn('[HEYS.mealRec.card] ❌ renderCard: missing props or React');
            return null;
        }

        return h(MealRecommenderCard, props);
    }

    // Export to global
    global.HEYS = global.HEYS || {};
    global.HEYS.MealRecCard = {
        renderCard
    };

    console.info('[HEYS.mealRec.card] 📦 Module loaded');

})(window);
