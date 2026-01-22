// heys_day_guards_v1.js — DayTab guard screens (logout/loading)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    if (!HEYS.dayMealExpandState?.useMealExpandState) {
        HEYS.dayMealExpandState = {
            useMealExpandState: function useMealExpandStateFallback() {
                const React = global.React || {};
                const { useCallback, useState } = React;
                if (!useState || !useCallback) {
                    return {
                        isMealStale: () => false,
                        toggleMealExpand: () => { },
                        expandOnlyMeal: () => { },
                        isMealExpanded: () => false,
                    };
                }

                const [expandedMeals, setExpandedMeals] = useState({});

                const isMealStale = useCallback(() => false, []);

                const toggleMealExpand = useCallback((mealIndex) => {
                    setExpandedMeals((prev) => ({
                        ...prev,
                        [mealIndex]: !prev[mealIndex],
                    }));
                }, []);

                const expandOnlyMeal = useCallback((mealIndex) => {
                    setExpandedMeals({ [mealIndex]: true });
                }, []);

                const isMealExpanded = useCallback((mealIndex, totalMeals) => {
                    if (expandedMeals.hasOwnProperty(mealIndex)) {
                        return expandedMeals[mealIndex];
                    }
                    return mealIndex === totalMeals - 1;
                }, [expandedMeals]);

                return {
                    isMealStale,
                    toggleMealExpand,
                    expandOnlyMeal,
                    isMealExpanded,
                };
            },
        };
    }

    function renderGuardScreen({ React, message }) {
        return React.createElement('div', {
            className: 'flex items-center justify-center h-screen bg-[var(--bg-primary)]'
        }, message);
    }

    function getLogoutScreen({ React, HEYSRef }) {
        if (HEYSRef?._isLoggingOut) {
            return renderGuardScreen({ React, message: 'Выход...' });
        }
        return null;
    }

    function getPropsGuardScreen({ React, props }) {
        if (!props || props._isLoggingOut) {
            return renderGuardScreen({ React, message: 'Загрузка...' });
        }
        return null;
    }

    function getMissingDayScreen({ React, day }) {
        if (!day) {
            return renderGuardScreen({ React, message: 'Загрузка...' });
        }
        return null;
    }

    HEYS.dayGuards = {
        renderGuardScreen,
        getLogoutScreen,
        getPropsGuardScreen,
        getMissingDayScreen
    };
})(window);
