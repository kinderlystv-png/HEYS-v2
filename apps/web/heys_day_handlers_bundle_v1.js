// heys_day_handlers_bundle_v1.js — DayTab handlers + water anim/presets bundle

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    HEYS.dayHandlersBundle = HEYS.dayHandlersBundle || {};

    HEYS.dayHandlersBundle.useDayHandlersBundle = function useDayHandlersBundle(ctx) {
        const React = ctx.React || global.React;
        const heysRef = ctx.HEYS || HEYS;

        // Вспомогательная функция: моментальная прокрутка к заголовку дневника
        const scrollToDiaryHeading = React.useCallback(() => {
            setTimeout(() => {
                const heading = document.getElementById('diary-heading');
                if (heading) {
                    heading.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }, 50);
        }, []);

        // Track newly added items for fly-in animation
        const [newItemIds, setNewItemIds] = React.useState(new Set());

        // === Water Tracking Animation States ===
        const [waterAddedAnim, setWaterAddedAnim] = React.useState(null); // для анимации "+200"
        const [showWaterDrop, setShowWaterDrop] = React.useState(false); // анимация падающей капли

        // Быстрые пресеты воды
        const waterPresets = [
            { ml: 100, label: '100 мл', icon: '💧' },
            { ml: 200, label: 'Стакан', icon: '🥛' },
            { ml: 330, label: 'Бутылка', icon: '🧴' },
            { ml: 500, label: '0.5л', icon: '🍶' }
        ];

        // === Meal handlers (extracted) ===
        const mealHandlers = heysRef.dayMealHandlers.createMealHandlers({
            setDay: ctx.setDay,
            expandOnlyMeal: ctx.expandOnlyMeal,
            date: ctx.date,
            products: ctx.products,
            day: ctx.day,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            getProductFromItem: ctx.getProductFromItem,
            isMobile: ctx.isMobile,
            openTimePickerForNewMeal: ctx.openTimePickerForNewMeal,
            scrollToDiaryHeading,
            lastLoadedUpdatedAtRef: ctx.lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef: ctx.blockCloudUpdatesUntilRef,
            newItemIds,
            setNewItemIds
        });

        React.useEffect(() => {
            if (ctx.updateMealTimeRef) {
                ctx.updateMealTimeRef.current = mealHandlers.updateMealTime;
            }
        }, [ctx.updateMealTimeRef, mealHandlers.updateMealTime]);

        // === Day-level handlers (weight/steps/deficit/water/household/edit grams/training zones) ===
        if (!heysRef.dayDayHandlers?.createDayHandlers) {
            throw new Error('[heys_day_handlers_bundle_v1] HEYS.dayDayHandlers not loaded');
        }
        const dayHandlers = heysRef.dayDayHandlers.createDayHandlers({
            setDay: ctx.setDay,
            day: ctx.day,
            date: ctx.date,
            prof: ctx.prof,
            setShowWaterDrop,
            setWaterAddedAnim,
            showConfetti: ctx.showConfetti,
            setShowConfetti: ctx.setShowConfetti,
            waterGoal: ctx.waterGoal,
            setEditGramsTarget: ctx.setEditGramsTarget,
            setEditGramsValue: ctx.setEditGramsValue,
            setGrams: mealHandlers.setGrams
        });

        // === Training handlers (Phase 10) ===
        if (!heysRef.dayTrainingHandlers?.createTrainingHandlers) {
            throw new Error('[heys_day_handlers_bundle_v1] HEYS.dayTrainingHandlers not loaded');
        }
        const trainingHandlers = heysRef.dayTrainingHandlers.createTrainingHandlers({
            day: ctx.day,
            date: ctx.date,
            TR: ctx.TR,
            zoneMinutesValues: ctx.zoneMinutesValues,
            visibleTrainings: ctx.visibleTrainings,
            setVisibleTrainings: ctx.setVisibleTrainings,
            updateTraining: dayHandlers.updateTraining,
            lsGet: ctx.lsGet,
            haptic: ctx.haptic,
            getSmartPopupPosition: ctx.getSmartPopupPosition,
            setZonePickerTarget: ctx.setZonePickerTarget,
            zonePickerTarget: ctx.zonePickerTarget,
            pendingZoneMinutes: ctx.pendingZoneMinutes,
            setPendingZoneMinutes: ctx.setPendingZoneMinutes,
            setShowZonePicker: ctx.setShowZonePicker,
            setZoneFormulaPopup: ctx.setZoneFormulaPopup,
            setHouseholdFormulaPopup: ctx.setHouseholdFormulaPopup,
            setShowTrainingPicker: ctx.setShowTrainingPicker,
            setTrainingPickerStep: ctx.setTrainingPickerStep,
            setEditingTrainingIndex: ctx.setEditingTrainingIndex,
            setPendingTrainingTime: ctx.setPendingTrainingTime,
            setPendingTrainingType: ctx.setPendingTrainingType,
            setPendingTrainingZones: ctx.setPendingTrainingZones,
            setPendingTrainingQuality: ctx.setPendingTrainingQuality,
            setPendingTrainingFeelAfter: ctx.setPendingTrainingFeelAfter,
            setPendingTrainingComment: ctx.setPendingTrainingComment,
            setDay: ctx.setDay,
            trainingPickerStep: ctx.trainingPickerStep,
            pendingTrainingTime: ctx.pendingTrainingTime,
            pendingTrainingZones: ctx.pendingTrainingZones,
            pendingTrainingType: ctx.pendingTrainingType,
            pendingTrainingQuality: ctx.pendingTrainingQuality,
            pendingTrainingFeelAfter: ctx.pendingTrainingFeelAfter,
            pendingTrainingComment: ctx.pendingTrainingComment,
            editingTrainingIndex: ctx.editingTrainingIndex
        });

        return {
            waterPresets,
            waterAddedAnim,
            showWaterDrop,
            setWaterAddedAnim,
            setShowWaterDrop,
            mealHandlers,
            dayHandlers,
            trainingHandlers
        };
    };
})(window);
