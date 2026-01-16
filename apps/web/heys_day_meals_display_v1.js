// heys_day_meals_display_v1.js — legacy shim (moved to day/_meals.js)
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    if (HEYS.analytics?.trackError) {
        HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meals display moved to day/_meals.js'), {
            source: 'heys_day_meals_display_v1.js',
            type: 'legacy_shim'
        });
    }
    return;
    /*
    
        function useMealsDisplay(params) {
            const {
                React,
                day,
                safeMeals,
                U,
                products,
                pIndex,
                date,
                setDay,
                isMobile,
                isMealExpanded,
                isMealStale,
                toggleMealExpand,
                changeMealType,
                updateMealTime,
                changeMealMood,
                changeMealWellbeing,
                changeMealStress,
                removeMeal,
                openEditGramsModal,
                openTimeEditor,
                openMoodEditor,
                setGrams,
                removeItem,
                isNewItem,
                optimum,
                setMealQualityPopup,
                addProductToMeal,
                prof,
                insulinWaveData
            } = params || {};
    
            if (!React) return { sortedMealsForDisplay: [], mealsUI: [] };
    
            const sortedMealsForDisplay = React.useMemo(() => {
                const meals = day?.meals || [];
                if (meals.length <= 1) return meals;
    
                return [...meals].sort((a, b) => {
                    const timeA = U?.timeToMinutes ? U.timeToMinutes(a.time) : null;
                    const timeB = U?.timeToMinutes ? U.timeToMinutes(b.time) : null;
    
                    if (timeA === null && timeB === null) return 0;
                    if (timeA === null) return 1;
                    if (timeB === null) return -1;
    
                    // Обратный порядок: последние (позже) наверху
                    return timeB - timeA;
                });
            }, [safeMeals]);
    
            const mealsUI = HEYS.dayMealsList?.renderMealsList?.({
                sortedMealsForDisplay,
                day,
                products,
                pIndex,
                date,
                setDay,
                isMobile,
                isMealExpanded,
                isMealStale,
                toggleMealExpand,
                changeMealType,
                updateMealTime,
                changeMealMood,
                changeMealWellbeing,
                changeMealStress,
                removeMeal,
                openEditGramsModal,
                openTimeEditor,
                openMoodEditor,
                setGrams,
                removeItem,
                isNewItem,
                optimum,
                setMealQualityPopup,
                addProductToMeal,
                prof,
                insulinWaveData
            }) || [];
    
            return { sortedMealsForDisplay, mealsUI };
        }
    
        HEYS.dayMealsDisplay = {
            useMealsDisplay
        };
    */
})(window);
