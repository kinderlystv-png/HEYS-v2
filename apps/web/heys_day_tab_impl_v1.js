// heys_day_tab_impl_v1.js — DayTab component implementation extracted from heys_day_v12.js
// Refactored: imports from heys_day_utils.js, heys_day_hooks.js, heys_day_pickers.js

; (function (global) {

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const HEYSRef = HEYS;

    // === Import utilities from dayUtils module ===
    const U = HEYS.dayUtils || {};

    // Explicit check for required dayUtils functions (warn once at load time)
    if (!HEYS.dayUtils) {
        console.error('[heys_day_v12] CRITICAL: HEYS.dayUtils not loaded before heys_day_v12.js');
    }

    // Haptic feedback (optional - graceful degradation if not available)
    const haptic = U.haptic || (() => { });

    // === Import popup components from dayPopups module ===
    const { PopupWithBackdrop, createSwipeHandlers, PopupCloseButton } = HEYS.dayPopups || {};

    // === Import photo gallery from dayGallery module ===
    const { PHOTO_LIMIT_PER_MEAL, LazyPhotoThumb } = HEYS.dayGallery || {};

    // === Import meal scoring from mealScoring module ===
    const {
        MEAL_KCAL_LIMITS,
        IDEAL_MACROS_UNIFIED,
        MEAL_KCAL_ABSOLUTE,
        IDEAL_MACROS,
        CIRCADIAN_MEAL_BONUS,
        LIQUID_FOOD_PATTERNS,
        HEALTHY_LIQUID_PATTERNS,
        LIQUID_FOOD_PENALTY,
        GL_QUALITY_THRESHOLDS,
        isLiquidFood,
        calculateMealGL,
        getCircadianBonus,
        getGLQualityBonus,
        calcKcalScore,
        calcMacroScore,
        calcCarbQuality,
        calcFatQuality,
        calcGiHarmScore,
        getMealQualityScore,
        getNutrientColor,
        getNutrientTooltip,
        getDailyNutrientColor,
        getDailyNutrientTooltip
    } = HEYS.mealScoring || {};

    // === Import AdviceCard from dayComponents module ===
    const AdviceCard = HEYS.dayComponents?.AdviceCard;

    // === Import MealAddProduct and ProductRow from dayComponents module ===
    const MealAddProduct = HEYS.dayComponents?.MealAddProduct;
    const ProductRow = HEYS.dayComponents?.ProductRow;

    // === Import MealCard from dayComponents module ===
    const MealCard = HEYS.dayComponents?.MealCard;

    // === Day helpers (storage/sound/guards/init/effects) ===
    if (!HEYS.dayStorage?.lsGet || !HEYS.dayStorage?.lsSet) {
        throw new Error('[heys_day_v12] HEYS.dayStorage not loaded before heys_day_v12.js');
    }
    if (!HEYS.daySound?.playSuccessSound) {
        throw new Error('[heys_day_v12] HEYS.daySound not loaded before heys_day_v12.js');
    }
    if (!HEYS.dayGuards?.renderGuardScreen) {
        throw new Error('[heys_day_v12] HEYS.dayGuards not loaded before heys_day_v12.js');
    }
    if (!HEYS.dayInit?.getInitialDay) {
        throw new Error('[heys_day_v12] HEYS.dayInit not loaded before heys_day_v12.js');
    }
    if (!HEYS.daySleepEffects?.useSleepHoursEffect) {
        throw new Error('[heys_day_v12] HEYS.daySleepEffects not loaded before heys_day_v12.js');
    }
    if (!HEYS.dayGlobalExports?.useDayGlobalExportsEffect) {
        throw new Error('[heys_day_v12] HEYS.dayGlobalExports not loaded before heys_day_v12.js');
    }
    const { lsGet, lsSet } = HEYS.dayStorage;
    const { playSuccessSound } = HEYS.daySound;
    const dayGuards = HEYS.dayGuards;
    const dayInit = HEYS.dayInit;
    const daySleepEffects = HEYS.daySleepEffects;
    const dayGlobalExports = HEYS.dayGlobalExports;

    // Utility functions from dayUtils (required)
    const pad2 = U.pad2;
    const todayISO = U.todayISO;
    const fmtDate = U.fmtDate;
    const parseISO = U.parseISO;
    const uid = U.uid;
    const formatDateDisplay = U.formatDateDisplay;
    // Math utilities from dayUtils (required)
    const clamp = U.clamp;
    const r0 = U.r0;
    const r1 = U.r1;
    const scale = U.scale;
    // Data model utilities from dayUtils (required)
    const ensureDay = U.ensureDay;
    const buildProductIndex = U.buildProductIndex;
    const getProductFromItem = U.getProductFromItem;
    const per100 = U.per100;
    const loadMealsForDate = U.loadMealsForDate;
    const productsSignature = U.productsSignature;
    const computePopularProducts = U.computePopularProducts;
    // Profile and calculation utilities from dayUtils (required)
    const getProfile = U.getProfile;
    const calcBMR = U.calcBMR;
    const kcalPerMin = U.kcalPerMin;
    const stepsKcal = U.stepsKcal;
    // Time parsing utilities from dayUtils (required)
    const parseTime = U.parseTime;
    const sleepHours = U.sleepHours;
    // Meal type classification
    const getMealType = U.getMealType;

    // === Import hooks from dayHooks module ===
    const H = HEYS.dayHooks || {};
    const useDayAutosave = H.useDayAutosave;
    const useMobileDetection = H.useMobileDetection;
    const useSmartPrefetch = H.useSmartPrefetch;

    // Calendar загружается динамически в DayTab (строка ~1337), 
    // НЕ кэшируем здесь чтобы HMR работал

    // === Import models module ===
    const M = HEYS.models || {};

    // === MealOptimizerSection (extracted) ===
    if (!HEYS.dayMealOptimizerSection?.MealOptimizerSection) {
        throw new Error('[heys_day_v12] HEYS.dayMealOptimizerSection not loaded before heys_day_v12.js');
    }
    const MealOptimizerSection = HEYS.dayMealOptimizerSection.MealOptimizerSection;

    function logMealExpandMissing(phase) {
        try {
            if (!HEYSRef.analytics?.trackError) return;
            const hasMealsScript = !!(global.document && document.querySelector && document.querySelector('script[src*="day/_meals.js"], script[src*="day%2F_meals.js"]'));
            HEYSRef.analytics.trackError(new Error('[heys_day_v12] dayMealExpandState missing'), {
                source: 'heys_day_tab_impl_v1.js',
                type: 'missing_dependency',
                phase: phase || 'unknown',
                hasMealsScript,
                modules: {
                    dayMealsList: !!HEYSRef.dayMealsList,
                    dayMealsDisplay: !!HEYSRef.dayMealsDisplay,
                    dayMealHandlers: !!HEYSRef.dayMealHandlers,
                    dayMealOptimizerSection: !!HEYSRef.dayMealOptimizerSection,
                    dayGuards: !!HEYSRef.dayGuards,
                    dayStorage: !!HEYSRef.dayStorage,
                    dayBundle: !!HEYSRef.dayMealsBundle,
                },
                version: HEYSRef.version || HEYSRef.buildVersion || null,
            });
        } catch (e) { }
    }

    // === Meal expand state fallback (если day/_meals.js не загрузился) ===
    if (!HEYSRef.dayMealExpandState?.useMealExpandState) {
        logMealExpandMissing('module_init');

        function useMealExpandState(params) {
            const { date } = params || {};
            if (!React) return {};

            const expandedMealsKey = 'heys_expandedMeals_' + date;

            const [manualExpandedStale, setManualExpandedStale] = React.useState({});
            const [expandedMeals, setExpandedMeals] = React.useState(() => {
                try {
                    const cached = sessionStorage.getItem(expandedMealsKey);
                    return cached ? JSON.parse(cached) : {};
                } catch (e) {
                    return {};
                }
            });

            React.useEffect(() => {
                try {
                    sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
                } catch (e) { }
            }, [expandedMeals, expandedMealsKey]);

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
                    setManualExpandedStale((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                } else {
                    setExpandedMeals((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                }
            }, [isMealStale]);

            const expandOnlyMeal = React.useCallback((mealIndex) => {
                const newState = {};
                newState[mealIndex] = true;
                setExpandedMeals(newState);
            }, []);

            const isMealExpanded = React.useCallback((mealIndex, totalMeals, meals, displayIndex = null) => {
                const meal = meals && meals[mealIndex];
                const isStale = meal && isMealStale(meal);

                if (isStale) {
                    return manualExpandedStale[mealIndex] === true;
                }

                if (Object.prototype.hasOwnProperty.call(expandedMeals, mealIndex)) {
                    return expandedMeals[mealIndex];
                }

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

        HEYSRef.dayMealExpandState = {
            useMealExpandState
        };
    }

    HEYS.DayTab = function DayTab(props) {

        // === CRITICAL: Глобальный флаг logout — проверяем ДО любых хуков! ===
        // React требует чтобы хуки вызывались всегда в одном порядке,
        // но мы можем сделать return ДО первого хука
        const logoutScreen = dayGuards.getLogoutScreen({ React, HEYSRef: window.HEYS });
        if (logoutScreen) return logoutScreen;

        const { useState, useMemo, useEffect, useRef } = React;

        const [mealsDepsReady, setMealsDepsReady] = useState(() => {
            return !!(HEYSRef.dayMealExpandState?.useMealExpandState
                && HEYSRef.dayMealHandlers?.createMealHandlers
                && HEYSRef.dayMealHandlers?.sortMealsByTime);
        });

        useEffect(() => {
            if (mealsDepsReady) return;
            if (!HEYSRef.waitForDeps) return;

            HEYSRef.waitForDeps([
                {
                    name: 'dayMealExpandState',
                    check: () => !!HEYSRef.dayMealExpandState?.useMealExpandState,
                },
                {
                    name: 'dayMealHandlers',
                    check: () => !!(HEYSRef.dayMealHandlers?.createMealHandlers && HEYSRef.dayMealHandlers?.sortMealsByTime),
                },
            ], () => {
                setMealsDepsReady(true);
            }, {
                timeoutMs: 3000,
                intervalMs: 20,
                onTimeout: () => {
                    logMealExpandMissing('waitForDeps_timeout');
                },
            });
        }, [mealsDepsReady]);

        // === EARLY RETURN: защита при logout/auth clearing ===
        // Во время logout очищаются данные → компонент может получить undefined
        // Вместо краша просто показываем loading
        const propsGuardScreen = dayGuards.getPropsGuardScreen({ React, props });
        if (propsGuardScreen) return propsGuardScreen;

        // Дата приходит из шапки App (DatePicker в header)
        const { selectedDate, setSelectedDate } = props;

        // Products context (extracted)
        if (!HEYS.dayProductsContext?.useProductsContext) {
            throw new Error('[heys_day_v12] HEYS.dayProductsContext not loaded before heys_day_v12.js');
        }
        const productsContext = HEYS.dayProductsContext.useProductsContext({
            React,
            propsProducts: props.products,
            productsSignature,
            buildProductIndex,
            HEYS: window.HEYS
        }) || {};
        const { products, prodSig, pIndex } = productsContext;

        // Boot effects (twemoji parse + analytics)
        if (!HEYS.dayEffects?.useDayBootEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEffects.useDayBootEffects();

        // prodSig/pIndex/debug now handled by dayProductsContext
        const prof = getProfile();
        // date приходит из props (selectedDate из App header)
        const date = selectedDate || todayISO();
        const setDate = setSelectedDate;
        // Meal expand/collapse state (extracted)
        if (!HEYSRef.dayMealExpandState?.useMealExpandState) {
            logMealExpandMissing('runtime_guard');

            HEYSRef.dayMealExpandState = {
                useMealExpandState: () => ({
                    isMealStale: () => false,
                    toggleMealExpand: () => { },
                    expandOnlyMeal: () => { },
                    isMealExpanded: (mealIndex, totalMeals, _meals, displayIndex = null) => {
                        if (displayIndex !== null) return displayIndex === 0;
                        return mealIndex === totalMeals - 1;
                    }
                })
            };
        }
        const mealExpandState = HEYSRef.dayMealExpandState.useMealExpandState({ React, date }) || {};
        const {
            isMealStale,
            toggleMealExpand,
            expandOnlyMeal,
            isMealExpanded
        } = mealExpandState;

        // Централизованная детекция мобильного устройства (с поддержкой ротации)
        const isMobile = useMobileDetection(768);

        // === МОБИЛЬНЫЕ ПОД-ВКЛАДКИ ===
        // 'stats' — статистика дня (шапка, статистика, активность, сон)
        // 'diary' — дневник питания (суточные итоги, приёмы пищи)
        // Теперь subTab приходит из props (из нижнего меню App)
        const mobileSubTab = props.subTab || 'stats';

        // === СВАЙП ДЛЯ ПОД-ВКЛАДОК УБРАН ===
        // Теперь свайп между stats/diary обрабатывается глобально в App
        // (нижнее меню с 5 вкладками)
        const onSubTabTouchStart = React.useCallback(() => { }, []);
        const onSubTabTouchEnd = React.useCallback(() => { }, []);

        // isMealExpanded теперь из dayMealExpandState

        // Флаг: данные загружены (из localStorage или Supabase)
        const [isHydrated, setIsHydrated] = useState(false);

        // State для развёрнутости NDTE badge (Next-Day Training Effect)
        const [ndteExpanded, setNdteExpanded] = useState(false);

        // Ref для отслеживания предыдущей даты (нужен для flush перед сменой)
        const prevDateRef = React.useRef(date);

        // Ref для отслеживания последнего updatedAt — предотвращает гонку между doLocal и handleDayUpdated
        const lastLoadedUpdatedAtRef = React.useRef(0);

        // Ref для блокировки обновлений от cloud sync во время редактирования
        const blockCloudUpdatesUntilRef = React.useRef(0);

        // Ref для блокировки событий heys:day-updated во время начальной синхронизации
        // Это предотвращает множественные setDay() вызовы и мерцание UI
        const isSyncingRef = React.useRef(false);

        // Миграция тренировок: quality/feelAfter → mood/wellbeing/stress
        // === Phase 11 Integration: Use extracted normalization functions ===
        const normalizeTrainings = HEYS.dayCalculations?.normalizeTrainings || ((trainings = []) => trainings);
        const cleanEmptyTrainings = HEYS.dayCalculations?.cleanEmptyTrainings || ((trainings) => trainings || []);

        const [dayRaw, setDayRaw] = useState(() => dayInit.getInitialDay({
            date,
            prof,
            lsGet,
            ensureDay,
            normalizeTrainings,
            cleanEmptyTrainings
        }));

        const setDay = setDayRaw;
        const day = dayRaw;
        const dayRef = useRef(day);

        useEffect(() => {
            dayRef.current = day;
        }, [day]);

        // === EARLY RETURN #2: защита если day стал undefined при logout ===
        // Это может произойти при race condition когда localStorage очищается во время рендера
        const missingDayScreen = dayGuards.getMissingDayScreen({ React, day });
        if (missingDayScreen) return missingDayScreen;

        // ЗАЩИТА ОТ КРАША: safeMeals всегда массив, даже когда day=undefined при logout
        const safeMeals = day?.meals || [];

        // cleanEmptyTrainings определена выше (для совместимости с прежним кодом вызовы остаются)

        // ЗАЩИТА: не сохранять до завершения гидратации (чтобы не затереть данные из Supabase)
        const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet, disabled: !isHydrated });

        // Smart Prefetch: предзагрузка ±7 дней при наличии интернета
        useSmartPrefetch && useSmartPrefetch({ currentDate: date, daysRange: 7, enabled: isHydrated });

        dayGlobalExports.useDayGlobalExportsEffect({
            React,
            flush,
            blockCloudUpdatesUntilRef,
            lastLoadedUpdatedAtRef,
            dayRef
        });

        // Логирование для диагностики рассинхрона продуктов и приёмов пищи
        useEffect(() => {
            // ...existing code...
        }, [products, day]);

        // ...existing code...

        // ...existing code...

        // ...existing code...

        // ...удалены дублирующиеся объявления useState...
        useEffect(() => { lsSet('heys_dayv2_date', date); }, [date]);

        // Effects (sync + heys:day-updated listener) — вынесено в модуль
        if (!HEYS.dayEffects?.useDaySyncEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEffects.useDaySyncEffects({
            date,
            setIsHydrated,
            setDay,
            getProfile,
            ensureDay,
            loadMealsForDate,
            lsGet,
            lsSet,
            normalizeTrainings,
            cleanEmptyTrainings,
            prevDateRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            isSyncingRef
        });

        // 🔬 TDEE v1.1.0: Консолидированный расчёт через единый модуль HEYS.TDEE
        // Заменяет ~60 строк inline кода — bmr, actTotal, TEF, NDTE, optimum
        if (!HEYS.dayEnergyContext?.buildEnergyContext) {
            throw new Error('[heys_day_v12] HEYS.dayEnergyContext not loaded before heys_day_v12.js');
        }
        const energyCtx = HEYS.dayEnergyContext.buildEnergyContext({
            day,
            prof,
            lsGet,
            pIndex,
            M,
            r0,
            HEYS: window.HEYS
        }) || {};
        const {
            tdeeResult,
            bmr,
            actTotal,
            trainingsK,
            train1k,
            train2k,
            train3k,
            stepsK,
            householdK,
            totalHouseholdMin,
            ndteBoostKcal,
            ndteData,
            tefKcal,
            tefData,
            baseExpenditure,
            tdee,
            optimum,
            weight,
            mets,
            kcalMin,
            dayTargetDef,
            cycleKcalMultiplier,
            TR,
            householdActivities,
            z,
            trainK,
            profileTargetDef,
            eatenKcal,
            factDefPct
        } = energyCtx;

        // Функция для вычисления средних оценок из утреннего чек-ина, приёмов пищи И тренировок
        // === Phase 11 Integration: Use extracted calculateDayAverages ===
        const calculateDayAverages = HEYS.dayCalculations?.calculateDayAverages || ((meals, trainings, dayData) => ({ moodAvg: '', wellbeingAvg: '', stressAvg: '', dayScore: '' }));

        // Автоматическое обновление средних оценок и dayScore (extracted)
        if (!HEYS.dayRatingAverages?.useRatingAveragesEffect) {
            throw new Error('[heys_day_v12] HEYS.dayRatingAverages not loaded before heys_day_v12.js');
        }
        HEYS.dayRatingAverages.useRatingAveragesEffect({
            React,
            day,
            setDay,
            calculateDayAverages
        });

        // === Sparkline данные: динамика настроения в течение дня (extracted) ===
        if (!HEYS.dayMoodSparkline?.useMoodSparklineData) {
            throw new Error('[heys_day_v12] HEYS.dayMoodSparkline not loaded before heys_day_v12.js');
        }
        const moodSparklineData = HEYS.dayMoodSparkline.useMoodSparklineData({ React, day }) || [];

        // === Meal Handlers (Phase 10) ===
        if (!mealsDepsReady) {
            return React.createElement('div', {
                className: 'card tone-slate',
                style: { margin: '12px', padding: '12px' },
            }, 'Загрузка дневника…');
        }
        if (!HEYS.dayMealHandlers?.createMealHandlers || !HEYS.dayMealHandlers?.sortMealsByTime) {
            throw new Error('[heys_day_v12] HEYS.dayMealHandlers not loaded before heys_day_v12.js');
        }
        const { sortMealsByTime } = HEYS.dayMealHandlers;

        // === Picker modals state/handlers (extracted) ===
        if (!HEYS.dayPickerModals?.usePickerModalsState) {
            throw new Error('[heys_day_v12] HEYS.dayPickerModals not loaded before heys_day_v12.js');
        }
        const updateMealTimeRef = useRef(null);
        const pickerState = HEYS.dayPickerModals.usePickerModalsState({
            day,
            date,
            isMobile,
            setDay,
            expandOnlyMeal,
            sortMealsByTime,
            haptic,
            updateMealTimeRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            calculateDayAverages,
            U,
            pad2,
            uid,
            lsGet
        }) || {};

        const {
            showTimePicker,
            pendingMealTime,
            setPendingMealTime,
            editingMealIndex,
            editMode,
            showTrainingPicker,
            setShowTrainingPicker,
            trainingPickerStep,
            setTrainingPickerStep,
            editingTrainingIndex,
            setEditingTrainingIndex,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            visibleTrainings,
            setVisibleTrainings,
            chartPeriod,
            setChartPeriod,
            chartTransitioning,
            handlePeriodChange,
            showZonePicker,
            setShowZonePicker,
            zonePickerTarget,
            setZonePickerTarget,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            zoneMinutesValues,
            zoneFormulaPopup,
            setZoneFormulaPopup,
            householdFormulaPopup,
            setHouseholdFormulaPopup,
            showSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            setShowDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            dayScoreValues,
            showWeightPicker,
            showDeficitPicker,
            pickerStep,
            animDirection,
            pendingMealMood,
            setPendingMealMood,
            pendingMealType,
            setPendingMealType,
            emojiAnimating,
            setEmojiAnimating,
            getScoreGradient,
            getScoreTextColor,
            getScoreEmoji,
            getYesterdayData,
            getCompareArrow,
            WheelColumn,
            trainingTypes,
            hoursValues,
            minutesValues,
            ratingValues,
            isNightHourSelected,
            currentDateLabel,
            openSleepQualityPicker,
            confirmSleepQualityPicker,
            cancelSleepQualityPicker,
            openDayScorePicker,
            confirmDayScorePicker,
            cancelDayScorePicker,
            openTimePickerForNewMeal,
            openTimeEditor,
            openMoodEditor,
            goToMoodStep,
            goBackToTimeStep,
            confirmTimeEdit,
            confirmMoodEdit,
            confirmMealCreation,
            cancelTimePicker
        } = pickerState;

        // === BottomSheet с поддержкой свайпа (extracted) ===
        if (!HEYS.dayBottomSheet?.useBottomSheetHandlers) {
            throw new Error('[heys_day_v12] HEYS.dayBottomSheet not loaded before heys_day_v12.js');
        }
        const bottomSheetState = HEYS.dayBottomSheet.useBottomSheetHandlers({ React, haptic }) || {};
        const {
            bottomSheetRef,
            handleSheetTouchStart,
            handleSheetTouchMove,
            handleSheetTouchEnd
        } = bottomSheetState;

        // === Popups (extracted) ===
        const popupsState = HEYS.dayPopupsState?.usePopupsState?.({ React }) || {};
        const {
            sparklinePopup,
            setSparklinePopup,
            macroBadgePopup,
            setMacroBadgePopup,
            metricPopup,
            setMetricPopup,
            tdeePopup,
            setTdeePopup,
            mealQualityPopup,
            setMealQualityPopup,
            weekNormPopup,
            setWeekNormPopup,
            weekDeficitPopup,
            setWeekDeficitPopup,
            balanceDayPopup,
            setBalanceDayPopup,
            tefInfoPopup,
            setTefInfoPopup,
            goalPopup,
            setGoalPopup,
            debtSciencePopup,
            setDebtSciencePopup,
            closeAllPopups,
            openExclusivePopup,
            getSmartPopupPosition
        } = popupsState;

        // === Состояние раскрытия карточки баланса калорий ===
        const [balanceCardExpanded, setBalanceCardExpanded] = useState(false);

        // === Measurements (extracted) ===
        const measurementsState = HEYS.dayMeasurements?.useMeasurementsState?.({
            React,
            day,
            date,
            setDay,
            HEYS: window.HEYS
        }) || {};

        const {
            measurementsHistory,
            measurementsByField,
            measurementsMonthlyProgress,
            measurementsLastDateFormatted,
            measurementsNeedUpdate,
            openMeasurementsEditor,
            renderMeasurementSpark
        } = measurementsState;

        // === Sparkline state (extracted) ===
        if (!HEYS.daySparklineState?.useSparklineState) {
            throw new Error('[heys_day_v12] HEYS.daySparklineState not loaded before heys_day_v12.js');
        }
        const sparklineState = HEYS.daySparklineState.useSparklineState({ React }) || {};
        const {
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            sparklineZoom,
            setSparklineZoom,
            sparklinePan,
            setSparklinePan,
            sparklineZoomRef,
            sparklineRefreshKey,
            setSparklineRefreshKey,
            brushRange,
            setBrushRange,
            brushing,
            setBrushing,
            brushStartRef
        } = sparklineState;


        // === Pull-to-refresh (Enhanced) ===
        const {
            pullProgress,
            isRefreshing,
            refreshStatus,
            pullThreshold
        } = HEYS.dayPullRefresh?.usePullToRefresh?.({
            React,
            date,
            lsGet,
            lsSet,
            HEYS: window.HEYS
        }) || { pullProgress: 0, isRefreshing: false, refreshStatus: 'idle', pullThreshold: 80 };

        // === Runtime UI state (time/offline/theme/hints) — extracted ===
        if (!HEYS.dayRuntimeUiState?.useRuntimeUiState) {
            throw new Error('[heys_day_v12] HEYS.dayRuntimeUiState not loaded before heys_day_v12.js');
        }
        const runtimeUiState = HEYS.dayRuntimeUiState.useRuntimeUiState({ React, HEYS: window.HEYS }) || {};
        const {
            currentMinute,
            insulinExpanded,
            setInsulinExpanded,
            isOnline,
            pendingChanges,
            syncMessage,
            pendingQueue,
            theme,
            setTheme,
            resolvedTheme,
            cycleTheme,
            mealChartHintShown,
            setMealChartHintShown,
            showFirstPerfectAchievement,
            setShowFirstPerfectAchievement,
            newMealAnimatingIndex,
            setNewMealAnimatingIndex
        } = runtimeUiState;

        // === Animations (extracted) ===
        if (!HEYS.dayAnimations?.useDayAnimations) {
            throw new Error('[heys_day_v12] HEYS.dayAnimations not loaded before heys_day_v12.js');
        }
        const animationsState = HEYS.dayAnimations.useDayAnimations({
            eatenKcal,
            optimum,
            mobileSubTab,
            date,
            haptic,
            playSuccessSound
        }) || {};
        const {
            showConfetti,
            setShowConfetti,
            shakeEaten,
            shakeOver,
            pulseSuccess,
            animatedProgress,
            animatedKcal,
            animatedRatioPct,
            animatedMarkerPos,
            isAnimating
        } = animationsState;

        // mealChartHintShown/showFirstPerfectAchievement/newMealAnimatingIndex are in dayRuntimeUiState

        // Emoji animation state handled by HEYS.dayPickerModals

        // Animation state handled by HEYS.dayAnimations

        // === Edit Grams Modal (extracted state) ===
        if (!HEYS.dayEditGramsState?.useEditGramsState) {
            throw new Error('[heys_day_v12] HEYS.dayEditGramsState not loaded before heys_day_v12.js');
        }
        const editGramsState = HEYS.dayEditGramsState.useEditGramsState({
            React,
            haptic
        }) || {};
        const {
            editGramsTarget,
            setEditGramsTarget,
            editGramsValue,
            setEditGramsValue,
            editGramsInputRef,
            editPortions,
            editLastPortionGrams,
            handleEditGramsDrag
        } = editGramsState;

        // NOTE: Zone/Household handlers moved to HEYS.dayTrainingHandlers.createTrainingHandlers() — see Phase 10 below
        // NOTE: Training Picker functions (openTrainingPicker, confirmTrainingPicker, cancelTrainingPicker)
        //       are now imported from createTrainingHandlers() — see destructuring at line ~1815

        // === Water state (extracted) ===
        if (!HEYS.dayWaterState?.useWaterState) {
            throw new Error('[heys_day_v12] HEYS.dayWaterState not loaded before heys_day_v12.js');
        }
        const waterState = HEYS.dayWaterState.useWaterState({
            React,
            day,
            prof,
            train1k,
            train2k,
            train3k,
            haptic
        }) || {};
        const {
            waterGoalBreakdown,
            waterGoal,
            waterMotivation,
            waterLastDrink,
            showWaterTooltip,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave
        } = waterState;

        // === Water functions (addWater, removeWater) provided by dayHandlers ===

        // === Handlers bundle (meal + day + training + water anim/presets) ===
        if (!HEYS.dayHandlersBundle?.useDayHandlersBundle) {
            throw new Error('[heys_day_v12] HEYS.dayHandlersBundle not loaded before heys_day_v12.js');
        }
        const handlersBundle = HEYS.dayHandlersBundle.useDayHandlersBundle({
            React,
            HEYS: window.HEYS,
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
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            updateMealTimeRef,
            showConfetti,
            setShowConfetti,
            waterGoal,
            setEditGramsTarget,
            setEditGramsValue,
            TR,
            zoneMinutesValues,
            visibleTrainings,
            setVisibleTrainings,
            lsGet,
            haptic,
            getSmartPopupPosition,
            setZonePickerTarget,
            zonePickerTarget,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            setShowZonePicker,
            setZoneFormulaPopup,
            setHouseholdFormulaPopup,
            setShowTrainingPicker,
            setTrainingPickerStep,
            setEditingTrainingIndex,
            setPendingTrainingTime,
            setPendingTrainingType,
            setPendingTrainingZones,
            setPendingTrainingQuality,
            setPendingTrainingFeelAfter,
            setPendingTrainingComment,
            trainingPickerStep,
            pendingTrainingTime,
            pendingTrainingZones,
            pendingTrainingType,
            pendingTrainingQuality,
            pendingTrainingFeelAfter,
            pendingTrainingComment,
            editingTrainingIndex
        }) || {};

        const {
            waterPresets,
            waterAddedAnim,
            showWaterDrop,
            setWaterAddedAnim,
            setShowWaterDrop,
            mealHandlers,
            dayHandlers,
            trainingHandlers
        } = handlersBundle;

        const {
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
            isNewItem
        } = mealHandlers || {};

        const {
            openWeightPicker,
            openStepsGoalPicker,
            openDeficitPicker,
            addWater,
            removeWater,
            openHouseholdPicker,
            openEditGramsModal,
            confirmEditGramsModal,
            cancelEditGramsModal,
            updateTraining
        } = dayHandlers || {};

        const {
            openZonePicker,
            confirmZonePicker,
            cancelZonePicker,
            showZoneFormula,
            closeZoneFormula,
            showHouseholdFormula,
            closeHouseholdFormula,
            openTrainingPicker,
            confirmTrainingPicker,
            cancelTrainingPicker,
            zoneNames
        } = trainingHandlers || {};

        const sleepH = sleepHours(day.sleepStart, day.sleepEnd);

        // Автоматически обновляем sleepHours в объекте дня при изменении времени сна
        daySleepEffects.useSleepHoursEffect({ React, day, setDay, sleepHours });

        // === Calendar metrics (extracted) ===
        if (!HEYS.dayCalendarMetrics?.computeActiveDays || !HEYS.dayCalendarMetrics?.computeCurrentStreak) {
            throw new Error('[heys_day_v12] HEYS.dayCalendarMetrics not loaded before heys_day_v12.js');
        }
        // Вычисляем данные о днях для текущего месяца (с цветовой индикацией близости к цели)
        const activeDays = useMemo(() => {
            return HEYS.dayCalendarMetrics.computeActiveDays({ date, prof, products });
        }, [date, prof.weight, prof.height, prof.age, prof.sex, prof.deficitPctTarget, products]);

        // Вычисляем текущий streak (дней подряд в норме 75-115%)
        const currentStreak = React.useMemo(() => {
            return HEYS.dayCalendarMetrics.computeCurrentStreak({ optimum, pIndex, fmtDate, lsGet });
        }, [optimum, pIndex, fmtDate, lsGet]);

        // Public exports (streak/addMeal/addWater/addProduct/getMealType) — вынесено в effects
        if (!HEYS.dayEffects?.useDayExportsEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEffects.useDayExportsEffects({
            currentStreak,
            addMeal,
            addWater,
            addProductToMeal,
            day,
            pIndex,
            getMealType,
            getMealQualityScore,
            safeMeals
        });

        // --- blocks
        // Получаем Calendar динамически, чтобы HMR работал
        const CalendarComponent = (HEYS.dayPickers && HEYS.dayPickers.Calendar) || HEYS.Calendar;
        if (!HEYS.dayCalendarBlock?.renderCalendarBlock) {
            throw new Error('[heys_day_v12] HEYS.dayCalendarBlock not loaded before heys_day_v12.js');
        }
        const calendarBlock = HEYS.dayCalendarBlock.renderCalendarBlock({
            React,
            CalendarComponent,
            date,
            activeDays,
            products,
            flush,
            setDate,
            lsGet,
            lsSet,
            getProfile,
            normalizeTrainings,
            cleanEmptyTrainings,
            loadMealsForDate,
            ensureDay,
            setDay
        });



        const mainBlock = HEYS.dayMainBlock?.renderMainBlock?.({
            React,
            day,
            tdee,
            ndteData,
            ndteBoostKcal,
            ndteExpanded,
            setNdteExpanded,
            bmr,
            stepsK,
            train1k,
            train2k,
            householdK,
            actTotal,
            tefKcal,
            setTefInfoPopup,
            optimum,
            dayTargetDef,
            factDefPct,
            eatenKcal,
            getProfile,
            setDay,
            r0,
            cycleKcalMultiplier
        }) || null;

        // Компактные тренировки в SaaS стиле (вынесено в модуль)
        const trainingsBlock = HEYS.dayTrainings?.renderTrainingsBlock?.({
            haptic,
            setDay,
            setVisibleTrainings,
            visibleTrainings,
            householdActivities,
            openTrainingPicker,
            showZoneFormula,
            openHouseholdPicker,
            showHouseholdFormula,
            trainingTypes,
            TR,
            kcalMin,
            kcalPerMin,
            weight,
            r0
        }) || null;

        // Компактный блок сна и оценки дня в SaaS стиле (две плашки в розовом контейнере)
        const sideBlock = HEYS.daySideBlock?.renderSideBlock?.({
            React,
            day,
            date,
            sleepH,
            getYesterdayData,
            getCompareArrow,
            getScoreEmoji,
            getScoreGradient,
            getScoreTextColor,
            dayScoreValues,
            setPendingDayScore,
            setShowDayScorePicker,
            setDay,
            calculateDayAverages,
            openSleepQualityPicker,
            measurementsNeedUpdate,
            openMeasurementsEditor,
            measurementsByField,
            measurementsHistory,
            measurementsMonthlyProgress,
            measurementsLastDateFormatted,
            renderMeasurementSpark
        }) || null;

        // === Cycle state (extracted) ===
        if (!HEYS.dayCycleState?.useCycleState) {
            throw new Error('[heys_day_v12] HEYS.dayCycleState not loaded before heys_day_v12.js');
        }
        const cycleState = HEYS.dayCycleState.useCycleState({ React, day, date, setDay, lsGet, lsSet, prof }) || {};
        const {
            showCycleCard,
            cyclePhase,
            cycleEditMode,
            setCycleEditMode,
            cycleDayInput,
            setCycleDayInput,
            saveCycleDay,
            clearCycleDay
        } = cycleState;

        const cycleCard = HEYS.dayCycleCard?.renderCycleCard?.({
            React,
            showCycleCard,
            cyclePhase,
            cycleEditMode,
            setCycleEditMode,
            day,
            saveCycleDay,
            clearCycleDay
        }) || null;

        // compareBlock удалён по требованию

        // === INSULIN WAVE INDICATOR DATA (через модуль HEYS.InsulinWave) ===
        const insulinWaveData = HEYS.dayInsulinWaveData?.computeInsulinWaveData?.({
            React,
            day,
            pIndex,
            getProductFromItem,
            getProfile,
            lsGet,
            currentMinute,
            HEYS: window.HEYS
        }) || null;

        // Meals display (sorted + UI) — extracted
        if (!HEYS.dayMealsDisplay?.useMealsDisplay) {
            throw new Error('[heys_day_v12] HEYS.dayMealsDisplay not loaded before heys_day_v12.js');
        }
        const mealsDisplay = HEYS.dayMealsDisplay.useMealsDisplay({
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
        }) || {};
        const { sortedMealsForDisplay, mealsUI } = mealsDisplay;

        // === Nutrition state (totals + norms + daily table) — extracted ===
        if (!HEYS.dayNutritionState?.buildNutritionState) {
            throw new Error('[heys_day_v12] HEYS.dayNutritionState not loaded before heys_day_v12.js');
        }
        const nutritionState = HEYS.dayNutritionState.buildNutritionState({
            React,
            day,
            pIndex,
            optimum,
            getDailyNutrientColor,
            getDailyNutrientTooltip,
            HEYS: window.HEYS
        }) || {};
        const {
            dayTot = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            normPerc = {},
            normAbs = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            dailyTableState: extractedDailyTableState = {}
        } = nutritionState;

        // === Advice Module Integration (extracted) ===
        if (!HEYS.dayAdviceIntegration?.useAdviceIntegration) {
            throw new Error('[heys_day_v12] HEYS.dayAdviceIntegration not loaded before heys_day_v12.js');
        }
        const adviceIntegration = HEYS.dayAdviceIntegration.useAdviceIntegration({
            React,
            day,
            date,
            prof,
            pIndex,
            dayTot,
            normAbs,
            optimum,
            waterGoal,
            haptic,
            U,
            lsGet,
            currentStreak,
            setShowConfetti,
            HEYS: window.HEYS,
            showTimePicker,
            showWeightPicker,
            showDeficitPicker,
            showZonePicker,
            showSleepQualityPicker,
            showDayScorePicker
        }) || {};
        const { adviceState = {} } = adviceIntegration;
        const { setToastVisible, setAdviceTrigger } = adviceState;

        // adviceState is provided by dayAdviceIntegration

        // 🔄 Orphan products state (extracted)
        if (!HEYS.dayOrphanState?.useOrphanState) {
            throw new Error('[heys_day_v12] HEYS.dayOrphanState not loaded before heys_day_v12.js');
        }
        const orphanState = HEYS.dayOrphanState.useOrphanState({ React, day, HEYS: window.HEYS }) || {};

        const dailyTableState = extractedDailyTableState;
        const {
            factKeys,
            fmtVal,
            devVal,
            devCell,
            factCell,
            normVal,
            per100Head,
            factHead,
            pct,
            daySummary
        } = dailyTableState;

        // Выравнивание высоты фиолетового блока с блоком тренировок справа
        // (авто-высота убрана; таблица сама уменьшена по строкам / высоте инпутов)

        // DatePicker теперь в шапке App (heys_app_v12.js)
        // Тренировки выводятся в sideBlock (side-compare)

        // === HERO METRICS CARDS (extracted) ===
        if (!HEYS.dayHeroMetrics?.computeHeroMetrics) {
            throw new Error('[heys_day_v12] HEYS.dayHeroMetrics not loaded before heys_day_v12.js');
        }
        const heroMetrics = HEYS.dayHeroMetrics.computeHeroMetrics({
            day,
            eatenKcal,
            optimum,
            factDefPct,
            dayTargetDef,
            r0,
            ratioZones: HEYS.ratioZones
        }) || {};
        const {
            effectiveOptimumForCards,
            remainingKcal,
            currentRatio,
            eatenCol,
            remainCol,
            defCol,
            ratioStatus,
            deficitProgress
        } = heroMetrics;

        const { weightTrend, monthForecast, weightSparklineData, cycleHistoryAnalysis } =
            HEYS.dayWeightTrends?.computeWeightTrends?.({
                React,
                date,
                day,
                chartPeriod,
                prof,
                fmtDate,
                r1,
                HEYS: window.HEYS
            }) || {};

        if (!HEYS.daySparklineState?.computeSparklineRenderData) {
            throw new Error('[heys_day_v12] HEYS.daySparklineState not loaded before heys_day_v12.js');
        }
        const sparklineDataState = HEYS.daySparklineState.computeSparklineRenderData({
            React,
            date,
            day,
            eatenKcal,
            chartPeriod,
            optimum,
            prof,
            products,
            dayTot,
            sparklineRefreshKey,
            fmtDate,
            HEYS: window.HEYS
        }) || {};
        const { sparklineData = [], sparklineRenderData = [] } = sparklineDataState;

        // === CALORIC DEBT RECOVERY — расчёт калорийного долга за последние 3 дня ===
        // === CALORIC BALANCE MODULE v3.0 ===
        // Анализ баланса калорий за текущую неделю (с понедельника)
        // Включает: долг, перебор, тренд, рекомендации кардио, учёт шагов и тренировок
        const caloricDebt = HEYS.dayCaloricBalance?.computeCaloricBalance?.({
            React,
            date,
            day,
            prof,
            optimum,
            eatenKcal,
            sparklineData,
            pIndex,
            fmtDate,
            lsGet,
            HEYS: window.HEYS
        }) || null;

        const {
            kcalTrend,
            balanceViz,
            weekHeatmapData,
            mealsChartData
        } = HEYS.dayInsightsData?.computeDayInsightsData?.({
            React,
            date,
            day,
            eatenKcal,
            optimum,
            caloricDebt,
            prof,
            pIndex,
            U,
            products,
            sparklineData,
            fmtDate,
            M,
            getMealType,
            getMealQualityScore,
            HEYS: window.HEYS
        }) || {};
        // === Caloric display state (extracted) ===
        if (!HEYS.dayCaloricDisplayState?.useCaloricDisplayState) {
            throw new Error('[heys_day_v12] HEYS.dayCaloricDisplayState not loaded before heys_day_v12.js');
        }
        const caloricDisplayState = HEYS.dayCaloricDisplayState.useCaloricDisplayState({
            React,
            day,
            setDay,
            optimum,
            eatenKcal,
            caloricDebt,
            r0
        }) || {};
        const {
            displayOptimum,
            displayRemainingKcal,
            displayCurrentRatio,
            displayRatioStatus
        } = caloricDisplayState;

        // === Engagement effects (extracted) ===
        if (!HEYS.dayEngagementEffects?.useEngagementEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEngagementEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEngagementEffects.useEngagementEffects({
            React,
            day,
            weekHeatmapData,
            showConfetti,
            setShowConfetti,
            haptic,
            insulinWaveData,
            mealsChartData,
            setShowFirstPerfectAchievement,
            setNewMealAnimatingIndex
        });

        // === Weekly Wrap Popup (Monday 09:00 локально) ===
        useEffect(() => {
            if (!isHydrated) return;
            if (HEYS.weeklyReports?.maybeShowWeeklyWrap) {
                HEYS.weeklyReports.maybeShowWeeklyWrap({
                    lsGet,
                    profile: prof,
                    pIndex,
                    date
                });
            }
        }, [isHydrated, date]);

        // === Pull-to-refresh логика вынесена в HEYS.dayPullRefresh ===

        // Progress/shake/confetti effects moved to HEYS.dayAnimations

        if (!HEYS.daySparklineState?.buildSparklineRenderers) {
            throw new Error('[heys_day_v12] HEYS.daySparklineState not loaded before heys_day_v12.js');
        }
        const sparklineRenderers = HEYS.daySparklineState.buildSparklineRenderers({
            React,
            haptic,
            openExclusivePopup,
            sparklineState,
            prof
        }) || {};
        const {
            renderSparkline,
            renderWeightSparkline
        } = sparklineRenderers;

        // === ПРОГРЕСС-БАР К ЦЕЛИ (отдельный компонент для diary) ===
        const goalProgressBar = HEYS.dayGoalProgress?.renderGoalProgressBar?.({
            React,
            day,
            displayOptimum,
            optimum,
            eatenKcal,
            animatedKcal,
            animatedProgress,
            animatedRatioPct,
            animatedMarkerPos,
            isAnimating,
            caloricDebt,
            setDay,
            r0,
            HEYS: window.HEYS
        }) || null;

        // === ALERT: Orphan-продукты (данные из штампа вместо базы) ===
        // orphanVersion используется для триггера ререндера при изменении orphan
        const { orphanCount = 0 } = orphanState;

        // === Phase 13A Integration: Use extracted orphan alert renderer ===
        const orphanAlert = HEYS.dayOrphanAlert?.renderOrphanAlert?.({ orphanCount }) || false;

        // === Hero display (tour override + colors + deficit) — extracted ===
        if (!HEYS.dayHeroDisplay?.buildHeroDisplay) {
            throw new Error('[heys_day_v12] HEYS.dayHeroDisplay not loaded before heys_day_v12.js');
        }
        const heroDisplay = HEYS.dayHeroDisplay.buildHeroDisplay({
            day,
            prof,
            tdee,
            displayOptimum,
            displayRemainingKcal,
            eatenKcal,
            HEYS: window.HEYS
        }) || {};
        const {
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRemainCol,
            profileDeficit,
            currentDeficit
        } = heroDisplay;

        // === БЛОК СТАТИСТИКА (extracted) ===
        if (!HEYS.dayStatsBlock?.buildStatsBlock) {
            throw new Error('[heys_day_v12] HEYS.dayStatsBlock not loaded before heys_day_v12.js');
        }
        const statsBlockResult = HEYS.dayStatsBlock.buildStatsBlock({
            React,
            HEYSRef: window.HEYS,
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
        }) || {};

        const { statsBlock, mealsChart, statsVm } = statsBlockResult;

        // === Water Card (extracted wrapper) ===
        if (!HEYS.dayWaterCard?.buildWaterCard) {
            throw new Error('[heys_day_v12] HEYS.dayWaterCard not loaded before heys_day_v12.js');
        }
        const waterCard = HEYS.dayWaterCard.buildWaterCard({
            React,
            day,
            prof,
            waterGoal,
            waterGoalBreakdown,
            waterPresets,
            waterMotivation,
            waterLastDrink,
            waterAddedAnim,
            showWaterDrop,
            showWaterTooltip,
            setDay,
            haptic,
            setWaterAddedAnim,
            setShowWaterDrop,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave,
            openExclusivePopup,
            addWater,
            removeWater
        });

        // === COMPACT ACTIVITY INPUT ===
        if (!HEYS.dayStepsUI?.useStepsState) {
            throw new Error('[heys_day_v12] HEYS.dayStepsUI not loaded before heys_day_v12.js');
        }
        const stepsState = HEYS.dayStepsUI.useStepsState({
            React,
            day,
            prof,
            getProfile,
            setDay
        }) || {};
        const {
            stepsGoal,
            stepsMax,
            stepsValue,
            stepsPercent,
            stepsColor,
            handleStepsDrag
        } = stepsState;

        // === Activity Card (extracted wrapper) ===
        if (!HEYS.dayActivityCard?.buildActivityCard) {
            throw new Error('[heys_day_v12] HEYS.dayActivityCard not loaded before heys_day_v12.js');
        }
        const compactActivity = HEYS.dayActivityCard.buildActivityCard({
            React,
            day,
            prof,
            stepsValue,
            stepsGoal,
            stepsPercent,
            stepsColor,
            stepsK,
            bmr,
            householdK,
            totalHouseholdMin,
            householdActivities,
            train1k,
            train2k,
            visibleTrainings,
            trainingsBlock,
            ndteData,
            ndteBoostKcal,
            tefData,
            tefKcal,
            dayTargetDef,
            displayOptimum,
            tdee,
            caloricDebt,
            r0,
            setDay,
            haptic,
            setMetricPopup,
            setTefInfoPopup,
            openStepsGoalPicker,
            handleStepsDrag,
            openHouseholdPicker,
            openTrainingPicker
        });

        if (!HEYS.dayTabRender?.renderDayTabLayout) {
            throw new Error('[heys_day_v12] HEYS.dayTabRender not loaded before heys_day_v12.js');
        }

        return HEYS.dayTabRender.renderDayTabLayout({
            React,
            HEYS: window.HEYS,
            pullProgress,
            isRefreshing,
            refreshStatus,
            pullThreshold,
            isMobile,
            mobileSubTab,
            orphanAlert,
            statsBlock,
            waterCard,
            compactActivity,
            sideBlock,
            cycleCard,
            date,
            day,
            caloricDebt,
            eatenKcal,
            optimum,
            addMeal,
            addWater,
            adviceState,
            AdviceCard,
            haptic,
            showTimePicker,
            cancelTimePicker,
            bottomSheetRef,
            handleSheetTouchStart,
            handleSheetTouchMove,
            handleSheetTouchEnd,
            pickerStep,
            animDirection,
            editMode,
            confirmTimeEdit,
            goToMoodStep,
            hoursValues,
            pendingMealTime,
            setPendingMealTime,
            minutesValues,
            isNightHourSelected,
            currentDateLabel,
            pendingMealType,
            setPendingMealType,
            WheelColumn,
            goBackToTimeStep,
            confirmMoodEdit,
            confirmMealCreation,
            pendingMealMood,
            setPendingMealMood,
            showConfetti,
            setShowConfetti,
            emojiAnimating,
            setEmojiAnimating,
            prof,
            pIndex,
            lsGet,
            fmtDate,
            getProductFromItem,
            getMealType,
            getMealQualityScore,
            editGramsTarget,
            editGramsValue,
            editPortions,
            editLastPortionGrams,
            editGramsInputRef,
            setEditGramsValue,
            confirmEditGramsModal,
            cancelEditGramsModal,
            handleEditGramsDrag,
            zoneFormulaPopup,
            closeZoneFormula,
            householdFormulaPopup,
            closeHouseholdFormula,
            showZonePicker,
            cancelZonePicker,
            confirmZonePicker,
            zonePickerTarget,
            zoneMinutesValues,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            showTrainingPicker,
            cancelTrainingPicker,
            confirmTrainingPicker,
            trainingPickerStep,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            trainingTypes,
            kcalMin,
            TR,
            mets,
            zoneNames,
            weight,
            kcalPerMin,
            r0,
            householdActivities,
            openTrainingPicker,
            openHouseholdPicker,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            showSleepQualityPicker,
            cancelSleepQualityPicker,
            confirmSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            cancelDayScorePicker,
            confirmDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            calculateDayAverages,
            mealQualityPopup,
            setMealQualityPopup,
            getSmartPopupPosition,
            createSwipeHandlers,
            M,
            goalProgressBar,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            mealsUI,
            daySummary
        });
    };

    HEYS.DayTabImpl = HEYS.DayTabImpl || {};
    HEYS.DayTabImpl.createDayTab = function createDayTab() {
        return HEYS.DayTab;
    };

})(window);
