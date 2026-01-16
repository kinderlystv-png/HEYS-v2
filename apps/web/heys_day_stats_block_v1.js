// heys_day_stats_block_v1.js — stats block builder (VM + actions + UI)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildStatsBlock(params) {
        const {
            React,
            HEYSRef,
            // actions deps
            openExclusivePopup,
            haptic,
            setDay,
            handlePeriodChange,
            setChartPeriod,
            setBalanceCardExpanded,
            setSparklinePopup,
            setWeekNormPopup,
            setWeekDeficitPopup,
            setBalanceDayPopup,
            setTdeePopup,
            setTefInfoPopup,
            setGoalPopup,
            setDebtSciencePopup,
            setMetricPopup,
            setMacroBadgePopup,
            setDate,
            setToastVisible,
            setAdviceTrigger,
            setMealChartHintShown,
            setShowConfetti,
            setInsulinExpanded,
            openWeightPicker,
            openDeficitPicker,
            setMealQualityPopup,
            r0,
            r1,

            // VM deps
            prof,
            day,
            dayTot,
            optimum,
            normAbs,
            weight,
            ndteData,
            tefData,
            chartPeriod,
            tdee,
            bmr,
            eatenKcal,
            stepsK,
            householdK,
            train1k,
            train2k,
            train3k,
            tefKcal,
            dayTargetDef,
            baseExpenditure,
            caloricDebt,
            sparklineData,
            sparklineRenderData,
            currentRatio,
            displayOptimum,
            displayRemainingKcal,
            balanceCardExpanded,
            showConfetti,
            shakeEaten,
            shakeOver,
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRatioStatus,
            weightSparklineData,
            weightTrend,
            kcalTrend,
            monthForecast,
            cycleHistoryAnalysis,
            weekHeatmapData,
            mealsChartData,
            currentDeficit,
            profileDeficit,
            date,
            isMobile,
            mobileSubTab,
            insulinWaveData,
            balanceViz,
            mealChartHintShown,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            sparklinePopup,
            weekNormPopup,
            weekDeficitPopup,
            balanceDayPopup,
            tdeePopup,
            tefInfoPopup,
            goalPopup,
            debtSciencePopup,
            metricPopup,
            macroBadgePopup,
            chartTransitioning,
            insulinExpanded,

            // stats data deps
            renderSparkline,
            renderWeightSparkline,
            U,
            M,
            pIndex,
            lsGet,
            PopupWithBackdrop,
            createSwipeHandlers,
            getSmartPopupPosition,
            ReactDOM
        } = params || {};

        if (!React) return { statsBlock: null, mealsChart: null, statsVm: null };

        const HEYSLocal = HEYSRef || HEYS;

        const statsActions = {
            openExclusivePopup,
            haptic,
            setDay,
            handlePeriodChange,
            setChartPeriod,
            setBalanceCardExpanded,
            setSparklinePopup,
            setWeekNormPopup,
            setWeekDeficitPopup,
            setBalanceDayPopup,
            setTdeePopup,
            setTefInfoPopup,
            setGoalPopup,
            setDebtSciencePopup,
            setMetricPopup,
            setMacroBadgePopup,
            setDate,
            setToastVisible,
            setAdviceTrigger,
            setMealChartHintShown,
            setShowConfetti,
            setInsulinExpanded,
            openWeightPicker,
            openDeficitPicker,
            setMealQualityPopup,
            r0,
            r1
        };

        const statsVm = HEYSLocal.dayStatsVm?.build?.({
            prof, day, dayTot, optimum, normAbs, weight,
            cycleDay: day?.cycleDay || null,
            ndteData, tefData, hrZones: [], chartPeriod,
            tdee, bmr, eatenKcal, stepsK, householdK, train1k, train2k, train3k,
            tefKcal, dayTargetDef, baseExpenditure, caloricDebt, sparklineData,
            sparklineRenderData,
            currentRatio, displayOptimum, displayRemainingKcal,
            balanceCardExpanded, showConfetti, shakeEaten, shakeOver,
            displayTdee, displayHeroOptimum, displayHeroEaten, displayHeroRemaining,
            displayRatioStatus,
            ratioZones: HEYSLocal.ratioZones,
            weightSparklineData,
            weightTrend,
            kcalTrend,
            monthForecast,
            cycleHistoryAnalysis,
            weekHeatmapData,
            mealsChartData,
            currentDeficit,
            profileDeficit,
            date,
            isMobile,
            mobileSubTab,
            insulinWaveData,
            balanceViz,
            mealChartHintShown,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            sparklinePopup,
            weekNormPopup,
            weekDeficitPopup,
            balanceDayPopup,
            tdeePopup,
            tefInfoPopup,
            goalPopup,
            debtSciencePopup,
            metricPopup,
            macroBadgePopup,
            chartTransitioning,
            insulinExpanded,
            metricPopupDeps: { U, M, pIndex },
            macroPopupDeps: { U, pIndex },
            mealsChartDeps: { U, pIndex },
            tefInfoDeps: { TEF: HEYSLocal.TEF }
        });

        const statsData = {
            helpers: {
                renderSparkline,
                renderWeightSparkline
            },
            deps: {
                U,
                pIndex,
                lsGet,
                PopupWithBackdrop,
                createSwipeHandlers,
                getSmartPopupPosition,
                ReactDOM,
                ratioZones: HEYSLocal.ratioZones,
                Refeed: HEYSLocal.Refeed,
                TEF: HEYSLocal.TEF,
                Day: HEYSLocal.Day,
                showCheckin: HEYSLocal.showCheckin,
                App: HEYSLocal.App,
                openProfileModal: HEYSLocal.openProfileModal
            }
        };

        const statsBlock = HEYSLocal.dayStats?.render?.({
            React,
            vm: statsVm,
            actions: statsActions,
            data: statsData
        }) || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Stats module not loaded');

        const mealsChart = HEYSLocal.dayMealsChartUI?.renderMealsChart?.({
            React,
            mealsChartData,
            statsVm,
            mealChartHintShown,
            setMealChartHintShown,
            setShowConfetti,
            setMealQualityPopup,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            U
        }) || null;

        return { statsBlock, mealsChart, statsVm };
    }

    HEYS.dayStatsBlock = {
        buildStatsBlock
    };
})(window);
