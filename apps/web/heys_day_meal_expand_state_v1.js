// heys_day_meal_expand_state_v1.js — legacy shim (moved to day/_meals.js)
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    if (HEYS.analytics?.trackError) {
        HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meal expand state moved to day/_meals.js'), {
            source: 'heys_day_meal_expand_state_v1.js',
            type: 'legacy_shim'
        });
    }
    return;
    /*
    
        function useMealExpandState(params) {
            const { React, date } = params || {};
            if (!React) return {};
    
            const expandedMealsKey = 'heys_expandedMeals_' + date;
    
            // Отдельный state для ручного разворачивания устаревших приёмов (не кешируется)
            const [manualExpandedStale, setManualExpandedStale] = React.useState({});
            const [expandedMeals, setExpandedMeals] = React.useState(() => {
                try {
                    const cached = sessionStorage.getItem(expandedMealsKey);
                    return cached ? JSON.parse(cached) : {};
                } catch (e) {
                    return {};
                }
            });
    
            // Сохраняем состояние при изменении
            React.useEffect(() => {
                try {
                    sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
                } catch (e) { }
            }, [expandedMeals, expandedMealsKey]);
    
            // Проверка: устарел ли приём (прошло больше 30 минут с времени приёма)
            const isMealStale = React.useCallback((meal) => {
                if (!meal || !meal.time) return false;
                const [hours, minutes] = meal.time.split(':').map(Number);
                if (isNaN(hours) || isNaN(minutes)) return false;
                const now = new Date();
                const mealDate = new Date();
                mealDate.setHours(hours, minutes, 0, 0);
                const diffMinutes = (now - mealDate) / (1000 * 60);
                return diffMinutes > 30;
            }, []);
    
            const toggleMealExpand = React.useCallback((mealIndex, meals) => {
                const meal = meals && meals[mealIndex];
                const isStale = meal && isMealStale(meal);
    
                if (isStale) {
                    // Для устаревших — отдельный state (не кешируется)
                    setManualExpandedStale(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                } else {
                    // Для актуальных — обычный state (кешируется)
                    setExpandedMeals(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                }
            }, [isMealStale]);
    
            // Функция для разворачивания нового приёма и сворачивания остальных
            const expandOnlyMeal = React.useCallback((mealIndex) => {
                const newState = {};
                newState[mealIndex] = true;
                setExpandedMeals(newState);
            }, []);
    
            // Проверка: развёрнут ли приём
            // - Устаревшие приёмы (>1 часа) автоматически свёрнуты
            // - Пользователь может вручную развернуть их кликом (не кешируется)
            // - Первый в отсортированном списке (последний по времени) развёрнут по умолчанию
            const isMealExpanded = React.useCallback((mealIndex, totalMeals, meals, displayIndex = null) => {
                const meal = meals && meals[mealIndex];
                const isStale = meal && isMealStale(meal);
    
                // Устаревшие приёмы (>1 часа) свёрнуты по умолчанию
                // Можно развернуть вручную (состояние не кешируется)
                if (isStale) {
                    return manualExpandedStale[mealIndex] === true;
                }
    
                // Для актуальных приёмов — стандартная логика
                if (expandedMeals.hasOwnProperty(mealIndex)) {
                    return expandedMeals[mealIndex];
                }
    
                // Первый в отсортированном списке (последний по времени) развёрнут по умолчанию
                // Если displayIndex передан — используем его, иначе fallback на старую логику
                if (displayIndex !== null) {
                    return displayIndex === 0;
                }
                return mealIndex === totalMeals - 1;
            }, [expandedMeals, manualExpandedStale, isMealStale]);
    
            return {
                isMealStale,
                toggleMealExpand,
                expandOnlyMeal,
                isMealExpanded
            };
        }
    
        HEYS.dayMealExpandState = {
            useMealExpandState
        };
    */
})(window);
