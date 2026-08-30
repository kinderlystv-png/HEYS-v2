// heys_day_tab_impl_v1.js — DayTab component implementation extracted from heys_day_v12.js
// Refactored: imports from heys_day_utils.js, heys_day_hooks.js, heys_day_pickers.js

; (function (global) {

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const HEYSRef = HEYS;

    // 🆕 Heartbeat для watchdog — DayTab impl загружен (критический для dep check)
    if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

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

    function pluralRu(n, forms) {
        const value = Math.abs(Number(n) || 0);
        const mod10 = value % 10;
        const mod100 = value % 100;
        if (mod10 === 1 && mod100 !== 11) return forms[0];
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
        return forms[2];
    }

    function parseLocalDate(dateStr) {
        const parts = String(dateStr || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
        return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    }

    // Виджет входа сам ничего не считает. Прежде здесь была запасная ветка,
    // которая до загрузки модуля сканировала хранилище своими порогами (2 дня
    // на неделю, 14 на месяц) — и числа во входе расходились с числами в самом
    // листе. Пока модуль не подъехал, чисел нет вовсе: карточка зовёт открыть
    // отчёты, а счёт покажет тот же расчёт, что и лист.
    function buildReportsOverviewMeta() {
        const service = HEYS.monthlyReportsService;
        if (!service?.buildMonthlyWeeks) {
            return { pending: true, actionText: 'Открыть отчёты' };
        }

        let weeksCount = 0;
        let monthsCount = 0;
        try {
            weeksCount = (service.buildMonthlyWeeks({ weeksCount: 16, useCache: true }) || []).length;
            monthsCount = service.buildMonthlyMonths
                ? (service.buildMonthlyMonths({ weeksCount: 16, useCache: true }) || []).length
                : 0;
        } catch (_) {
            return { pending: true, actionText: 'Открыть отчёты' };
        }

        const weekUnitText = pluralRu(weeksCount, ['неделя', 'недели', 'недель']);
        const monthUnitText = pluralRu(monthsCount, ['месяц', 'месяца', 'месяцев']);
        const weeksText = weeksCount + ' ' + weekUnitText;
        const monthsText = monthsCount + ' ' + monthUnitText;

        if (weeksCount === 0 && monthsCount === 0) {
            return {
                pending: false,
                monthsCount: 0,
                weeksCount: 0,
                monthUnitText,
                weekUnitText,
                monthsText,
                weeksText,
                countText: weeksText,
                bodyText: 'Пока мало данных: отчёты появятся после 2 дней с едой за неделю.',
                detailText: 'Нужно больше дней с записями',
                actionText: 'Посмотреть раздел'
            };
        }

        return {
            pending: false,
            monthsCount,
            weeksCount,
            monthUnitText,
            weekUnitText,
            monthsText,
            weeksText,
            countText: weeksText,
            bodyText: monthsCount > 0
                ? 'Доступно ' + monthsText + ' и ' + weeksText + ' статистики для просмотра.'
                : 'Доступно ' + weeksText + ' статистики для просмотра.',
            // Вход отвечает «есть ли что открывать», а не «можно ли доверять»:
            // его порог — два дня с едой, а надёжность в листе начинается с
            // шести. Прежняя копия обещала второе, называя первое.
            detailText: 'Периоды, где есть записи',
            actionText: 'Открыть отчёты'
        };
    }
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

        const { useState, useMemo, useEffect, useRef, useCallback } = React;

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

        // PERF v8.1: Lightweight re-render when deferred modules load
        // Avoids full setDay() reload — just triggers render so deferredSlot swaps skeleton → content
        if (HEYS.dayEffects.useDeferredModuleEffect) {
            HEYS.dayEffects.useDeferredModuleEffect();
        }

        // prodSig/pIndex/debug now handled by dayProductsContext
        // 🚀 PERF: Stabilize prof — getProfile() creates a new object on every call.
        // Without memoization every AppRoot re-render (caused by sync indicator state updates)
        // triggers sparklineData + computeCaloricBalance recompute → 300-400ms violations.
        // We read key scalar fields once (cheap), build a stable signature string, and only
        // recompute prof when the profile is actually changed by the user.
        const _profSig = (() => { const r = U.lsGet('heys_profile', {}) || {}; return String(r.sex || r.gender || '') + '|' + (+r.height || 0) + '|' + (+r.weight || 0) + '|' + (r.birthDate || r.age || 0) + '|' + (+r.deficitPctTarget || 0) + '|' + (r.pal || r.activityLevel || r.activity || '') + '|' + (+r.weightGoal || 0); })();
        const prof = React.useMemo(() => getProfile(), [_profSig]); // eslint-disable-line react-hooks/exhaustive-deps
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
        const isTabActive = props.isActive !== false;
        const showStatsContent = !isMobile || mobileSubTab === 'stats';
        const showActivityContent = !isMobile || mobileSubTab === 'activity';
        const showNutritionContent = !isMobile || mobileSubTab === 'diary';
        const activityContentEnabled = showStatsContent || showActivityContent;
        const [reportsModalOpen, setReportsModalOpen] = useState(false);
        const [reportsModuleTick, setReportsModuleTick] = useState(0);
        const [monthlyReportsMode, setMonthlyReportsMode] = useState('weeks');
        // Фильтр надёжности живёт здесь же, где режим: внутри модалки он
        // умирал вместе с ней, и выбор терялся на каждом заходе.
        const [monthlyWeekFilter, setMonthlyWeekFilter] = useState('all');
        const [monthlyMonthFilter, setMonthlyMonthFilter] = useState('all');

        const ensureReportsModules = useCallback(() => {
            // Глобал живёт в HEYS, а не на window напрямую
            // (heys_postboot3_facade_v1.js: HEYS.__loadPostboot3Ui).
            const loader = window.HEYS?.__loadPostboot3Ui;
            if (typeof loader !== 'function') return;
            try {
                const result = loader();
                if (result && typeof result.then === 'function') {
                    result.finally(() => setReportsModuleTick((value) => value + 1));
                } else {
                    setTimeout(() => setReportsModuleTick((value) => value + 1), 0);
                }
            } catch (err) {
                console.warn('[HEYS.reports] monthly reports lazy load failed', err);
            }
        }, []);

        const closeReportsModal = useCallback(() => {
            setReportsModalOpen(false);
        }, []);

        const openReportsModal = useCallback(() => {
            setReportsModalOpen(true);
            ensureReportsModules();
            haptic?.('light');
        }, [ensureReportsModules]);

        useEffect(() => {
            if (!reportsModalOpen) return undefined;
            ensureReportsModules();
            document.body.classList.add('reports-fullscreen-open');
            const handleKeyDown = (event) => {
                if (event.key === 'Escape') {
                    closeReportsModal();
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                document.body.classList.remove('reports-fullscreen-open');
                window.removeEventListener('keydown', handleKeyDown);
            };
        }, [reportsModalOpen, ensureReportsModules, closeReportsModal]);

        // === СВАЙП ДЛЯ ПОД-ВКЛАДОК УБРАН ===
        // Теперь свайп между stats/diary обрабатывается глобально в App
        // (нижнее меню с 5 вкладками)
        const onSubTabTouchStart = React.useCallback(() => { }, []);
        const onSubTabTouchEnd = React.useCallback(() => { }, []);

        // isMealExpanded теперь из dayMealExpandState

        // Флаг: данные загружены (из localStorage или Supabase)
        const [isHydrated, setIsHydrated] = useState(false);
        // Двухфазный рендер: тяжелую часть дневника поднимаем после первого paint.
        const [heavyUiReady, setHeavyUiReady] = useState(false);

        // State для развёрнутости NDTE badge (Next-Day Training Effect)
        const [ndteExpanded, setNdteExpanded] = useState(false);

        useEffect(() => {
            setHeavyUiReady(false);
            let timeoutId = null;
            const rafId = requestAnimationFrame(() => {
                timeoutId = setTimeout(() => setHeavyUiReady(true), 120);
            });
            return () => {
                cancelAnimationFrame(rafId);
                if (timeoutId) clearTimeout(timeoutId);
            };
        }, [date]);

        // 🔀 Live-refresh: polling cloud day every 30s while tab is visible.
        // Without this, edits from another device (e.g. curator) stay invisible
        // until next bootstrap. See heys_day_live_refresh_v1.js for the polling loop.
        useEffect(() => {
            const liveRefresh = HEYS.dayLiveRefresh;
            const clientId = HEYS.currentClientId;
            if (!liveRefresh || !clientId || !date) return;
            liveRefresh.start({ date, clientId });
            return () => liveRefresh.stop();
        }, [date]);

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
        // Синхронно: HEYS.Day.getDay() и flush должны видеть актуальный день в том же тике, что и setDay
        // (иначе StepModal/MA может прочитать dayRef до commit useEffect).
        dayRef.current = day;

        // === EARLY RETURN #2: защита если day стал undefined при logout ===
        // Это может произойти при race condition когда localStorage очищается во время рендера
        const missingDayScreen = dayGuards.getMissingDayScreen({ React, day });
        if (missingDayScreen) return missingDayScreen;

        // ЗАЩИТА ОТ КРАША: safeMeals всегда массив, даже когда day=undefined при logout
        const safeMeals = day?.meals || [];

        // cleanEmptyTrainings определена выше (для совместимости с прежним кодом вызовы остаются)

        // ЗАЩИТА: не сохранять до завершения гидратации (чтобы не затереть данные из Supabase)
        // v69 FIX: Use scoped keyPrefix to prevent cross-client contamination via proxy mirror
        const _cid = window.HEYS?.currentClientId || U?.getCurrentClientId?.() || '';
        const _dayKeyPrefix = _cid ? 'heys_' + _cid + '_dayv2_' : 'heys_dayv2_';
        const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet, keyPrefix: _dayKeyPrefix, disabled: !isHydrated });

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
        useEffect(() => {
            if (!date) return;
            const current = lsGet('heys_dayv2_date', null);
            if (current === date) return;
            lsSet('heys_dayv2_date', date);
        }, [date]);

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
        // 🚀 PERF R7: granular deps — skip TDEE recalc on water/sleep/mood changes
        // buildEnergyContext reads: meals, trainings, steps, householdActivities,
        // householdMin, savedEatenKcal, weightMorning, date — NOT waterMl/sleep/mood
        const energyCtx = useMemo(() => HEYS.dayEnergyContext.buildEnergyContext({
            day,
            prof,
            lsGet,
            pIndex,
            M,
            r0,
            HEYS: window.HEYS
        }) || {}, [day?.meals, day?.trainings, day?.steps, day?.householdActivities, day?.householdMin, day?.savedEatenKcal, day?.weightMorning, day?.date, prof, pIndex]);
        const {
            tdeeResult,
            bmr,
            actTotal,
            trainingsK,
            train1k,
            train2k,
            train3k,
            stepsK,
            stepsEstimated,
            stepsMissing,
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
            train3k
        }) || {};
        const {
            waterGoalBreakdown,
            waterGoal,
            waterLastDrink
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
            mealHandlers,
            dayHandlers,
            trainingHandlers
        } = handlersBundle;

        const {
            addMeal,
            updateMealTime,
            removeMeal,
            addProductToMeal,
            addProductsToMeal,
            copyItemsToMeal,
            openCopyMealModal,
            openMoveMealModal,
            moveMealToDate,
            saveAsPreset,
            openAddProductForMeal,
            repeatYesterdayMeal,
            setGrams,
            removeItem,
            moveItem,
            copyItem,
            removePhoto,
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
            focusWater,
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

        const executeInsightsDataAction = React.useCallback((actionId) => {
            switch (actionId) {
                case 'open_training':
                    if (typeof openTrainingPicker === 'function') {
                        openTrainingPicker('add');
                        return true;
                    }
                    return false;
                case 'open_household':
                    if (typeof openHouseholdPicker === 'function') {
                        openHouseholdPicker('add');
                        return true;
                    }
                    return false;
                case 'open_sleep_quality':
                    if (typeof openSleepQualityPicker === 'function') {
                        openSleepQualityPicker();
                        return true;
                    }
                    return false;
                case 'open_measurements':
                    if (typeof openMeasurementsEditor === 'function') {
                        openMeasurementsEditor();
                        return true;
                    }
                    return false;
                case 'open_steps':
                    if (typeof openStepsGoalPicker === 'function') {
                        openStepsGoalPicker();
                        return true;
                    }
                    return false;
                case 'open_weight':
                    if (typeof openWeightPicker === 'function') {
                        openWeightPicker();
                        return true;
                    }
                    return false;
                default:
                    return false;
            }
        }, [
            openTrainingPicker,
            openHouseholdPicker,
            openSleepQualityPicker,
            openMeasurementsEditor,
            openStepsGoalPicker,
            openWeightPicker
        ]);

        // Экспорт обработчика для quick-actions из Insights
        useEffect(() => {
            HEYS.ui = HEYS.ui || {};
            HEYS.ui.openDataEntryFromInsights = executeInsightsDataAction;

            return () => {
                if (HEYS.ui?.openDataEntryFromInsights === executeInsightsDataAction) {
                    delete HEYS.ui.openDataEntryFromInsights;
                }
            };
        }, [executeInsightsDataAction]);

        // Авто-выполнение pending action после перехода из Insights
        useEffect(() => {
            const pendingAction = HEYS.ui?.pendingDataEntryAction;
            if (!pendingAction) return;

            const timer = setTimeout(() => {
                const opened = executeInsightsDataAction(pendingAction);
                if (opened && HEYS.ui) {
                    delete HEYS.ui.pendingDataEntryAction;
                }
            }, 80);

            return () => clearTimeout(timer);
        }, [executeInsightsDataAction]);

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
            focusWater,
            addProductToMeal,
            addProductsToMeal,
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
        // 🚀 PERF R7: memoize — only rebuild on training data changes
        const regularTrainingsBlock = useMemo(() => {
            if (!activityContentEnabled) return null;
            return HEYS.dayTrainings?.renderTrainingsBlock?.({
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
                r0,
                dateKey: date,
                trainingFilterMode: 'regular',
                includeHouseholdEntries: true
            }) || null;
        }, [activityContentEnabled, visibleTrainings, householdActivities, trainingTypes, weight, kcalMin, TR, date]);

        // Программа куратора собирается своим проходом и встаёт выше яруса
        // «Сегодня»: правка куратора, карточка назначенного плана, строка
        // «Следующая тренировка» (контракт «три элемента программы»).
        //
        // Занял слот мёртвого chargeTrainingBlock: он считался на каждой смене
        // тренировок и выбрасывался — ActivityTabV4 его не разбирал
        // (разбор «Актив», дефект M).
        const programTrainingsBlock = useMemo(() => {
            if (!activityContentEnabled) return null;
            return HEYS.dayTrainings?.renderTrainingsBlock?.({
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
                r0,
                dateKey: date,
                trainingFilterMode: 'program'
            }) || null;
        }, [activityContentEnabled, visibleTrainings, householdActivities, trainingTypes, weight, kcalMin, TR, date]);

        // Сводка тренировок за 30 дней (чтение из localStorage по префиксу дня)
        // Рост рабочих весов на вкладке. Метрика уже написана и до сих пор жила
        // только внутри поправки на факт, где она довод («норму не трогаем»);
        // здесь она факт о тренировках, и формулировка положительная
        // (контракт «рост рабочих весов на вкладке», строка 17).
        //
        // Модуль лежит в постбут-чанке, порядок загрузки не гарантирован:
        // пока его нет, строки просто нет — deferred-рендер вернётся сюда сам.
        const workingWeights = useMemo(() => {
            if (!activityContentEnabled) return null;
            const analyze = HEYS.WorkingWeights?.analyze;
            if (typeof analyze !== 'function') return null;
            const windowDays = HEYS.WorkingWeights.WINDOW_DAYS || 28;
            const endD = parseISO(date);
            if (!endD || isNaN(endD.getTime())) return null;
            const days = [];
            for (let i = windowDays - 1; i >= 0; i--) {
                const d = new Date(endD);
                d.setDate(d.getDate() - i);
                const dk = fmtDate(d);
                const stored = lsGet('heys_dayv2_' + dk, null);
                if (stored && typeof stored === 'object') days.push({ ...stored, date: dk });
            }
            try {
                return analyze({ days });
            } catch (_) {
                return null;
            }
        }, [activityContentEnabled, lsGet, date, day?.updatedAt, day?.trainings]);

        const monthTrainingsRows = useMemo(() => {
            if (!activityContentEnabled) return [];
            return HEYS.dayActivity?.collectMonthTrainingRows?.({
                lsGet,
                kcalMin,
                trainingTypes,
                r0,
                formatDateDisplay,
                todayISO,
                parseISO,
                fmtDate
            }) || [];
        }, [activityContentEnabled, lsGet, kcalMin, trainingTypes, r0, day?.date, day?.updatedAt, day?.trainings]);

        const readMaDayForActivityCalendar = React.useCallback((dk) => {
            // Logical key heys_dayv2_* — HEYS.utils.lsGet applies client scope via nsKey (do not pass heys_<cid>_dayv2_* or key doubles).
            const stored = lsGet('heys_dayv2_' + dk, {}) || {};
            try {
                const live = HEYS.Day?.getDay?.();
                if (live && live.date === dk && dk === date) {
                    const su = Number(stored.updatedAt) || 0;
                    const lu = Number(live.updatedAt) || 0;
                    return lu >= su ? live : stored;
                }
            } catch (_) { /* ignore */ }
            return stored;
        }, [lsGet, date, day?.updatedAt]);

        const morningActivationCalendarBlock = useMemo(() => {
            if (!activityContentEnabled) return null;
            const Cal = HEYS.morningActivationCalendar?.MorningActivationHabitCalendar;
            if (!Cal || !date) return null;
            return React.createElement(Cal, {
                dateKey: date,
                readDayData: readMaDayForActivityCalendar,
                headingTitle: '⚡ Календарь зарядки',
                layoutClass: 'ma-habit-cal--activity'
            });
        }, [activityContentEnabled, date, readMaDayForActivityCalendar, day?.updatedAt]);

        // Компактный блок сна и оценки дня в SaaS стиле (две плашки в розовом контейнере)
        // 🚀 PERF R7: memoize sideBlock — skip on popup/animation/water changes
        const sideBlock = useMemo(() => {
            if (!showStatsContent) return null;
            return HEYS.daySideBlock?.renderSideBlock?.({
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
        }, [showStatsContent, day?.sleepHours, day?.sleepQuality, day?.moodAvg, day?.wellbeingAvg, day?.stressAvg, day?.dayScore, day?.dayScoreManual, date, sleepH, measurementsNeedUpdate, measurementsLastDateFormatted]);

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

        const cycleCard = showStatsContent
            ? (HEYS.dayCycleCard?.renderCycleCard?.({
                React,
                showCycleCard,
                cyclePhase,
                cycleEditMode,
                setCycleEditMode,
                day,
                date,
                setDay,
                lsGet,
                lsSet,
                saveCycleDay,
                clearCycleDay,
                eatenKcal,
                budgetKcal: optimum,
                cycleKcalMultiplier,
            }) || null)
            : null;

        const reportsOverviewCard = useMemo(() => {
            if (!showStatsContent) return null;
            const meta = buildReportsOverviewMeta();
            return React.createElement('section', {
                className: 'reports-overview-card',
                role: 'button',
                tabIndex: 0,
                'aria-haspopup': 'dialog',
                'aria-label': 'Открыть отчёты по месяцам и неделям',
                onClick: openReportsModal,
                onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openReportsModal();
                    }
                }
            },
                React.createElement('div', { className: 'reports-overview-card__head' },
                    React.createElement('span', { className: 'reports-overview-card__icon', 'aria-hidden': 'true' }, '📙'),
                    React.createElement('span', { className: 'reports-overview-card__title' }, 'ОТЧЕТЫ ПО МЕСЯЦАМ И НЕДЕЛЯМ')
                ),
                meta.pending
                    // Модуль ещё не подъехал: чисел нет, но открыть можно —
                    // счёт покажет тот же расчёт, что и лист.
                    ? React.createElement('div', { className: 'reports-overview-card__body' },
                        React.createElement('span', { className: 'reports-overview-card__action' }, meta.actionText)
                    )
                    : React.createElement('div', { className: 'reports-overview-card__body' },
                    // Недели первыми и крупно: лист открывается в неделях, а
                    // главным числом стояли месяцы — человек видел «1 месяц» и
                    // попадал в список недель.
                    React.createElement('div', { className: 'reports-overview-card__stats' },
                        React.createElement('span', { className: 'reports-overview-card__stat reports-overview-card__stat--primary' },
                            React.createElement('span', { className: 'reports-overview-card__stat-value' }, meta.weeksCount),
                            React.createElement('span', { className: 'reports-overview-card__stat-label' }, meta.weekUnitText)
                        ),
                        React.createElement('span', { className: 'reports-overview-card__stat' },
                            React.createElement('span', { className: 'reports-overview-card__stat-value' }, meta.monthsCount),
                            React.createElement('span', { className: 'reports-overview-card__stat-label' }, meta.monthUnitText)
                        )
                    ),
                    React.createElement('span', { className: 'reports-overview-card__text' }, meta.detailText),
                    React.createElement('span', { className: 'reports-overview-card__action' }, meta.actionText)
                )
            );
        }, [showStatsContent, openReportsModal, date, day?.updatedAt]);

        const reportsFullscreenModal = useMemo(() => {
            if (!reportsModalOpen) return null;
            const MonthlyReportsLegend = window.HEYS?.monthlyReports?.MonthlyReportsLegend;
            const MonthlyReportsContent = window.HEYS?.monthlyReports?.MonthlyReportsContent;
            return React.createElement('div', {
                className: 'reports-fullscreen-modal',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'reports-fullscreen-title'
            },
                React.createElement('div', { className: 'reports-fullscreen-modal__topbar' },
                    React.createElement('button', {
                        type: 'button',
                        className: 'reports-fullscreen-modal__close-text',
                        onClick: closeReportsModal
                    }, 'Закрыть'),
                    React.createElement('button', {
                        type: 'button',
                        className: 'reports-fullscreen-modal__close-icon',
                        onClick: closeReportsModal,
                        'aria-label': 'Закрыть отчёты'
                    }, '×')
                ),
                React.createElement('main', { className: 'reports-fullscreen-modal__body' },
                    React.createElement('div', { className: 'reports-fullscreen-modal__card' },
                        React.createElement('div', { className: 'reports-title-row reports-title-row--monthly' },
                            React.createElement('h2', {
                                id: 'reports-fullscreen-title',
                                className: 'reports-title'
                            }, 'Месячные отчёты'),
                            MonthlyReportsLegend
                                ? React.createElement(MonthlyReportsLegend, { mode: monthlyReportsMode })
                                : null
                        ),
                        MonthlyReportsContent
                            ? React.createElement(MonthlyReportsContent, {
                                mode: monthlyReportsMode,
                                weekFilter: monthlyWeekFilter,
                                setWeekFilter: setMonthlyWeekFilter,
                                monthFilter: monthlyMonthFilter,
                                setMonthFilter: setMonthlyMonthFilter,
                                setMode: setMonthlyReportsMode
                            })
                            : React.createElement('div', {
                                className: 'reports-fullscreen-modal__loading'
                            }, 'Загружаем модуль месячных отчётов...')
                    )
                )
            );
        }, [reportsModalOpen, reportsModuleTick, monthlyReportsMode, closeReportsModal]);

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
            openCopyMealModal,
            openMoveMealModal,
            saveAsPreset,
            repeatYesterdayMeal,
            removePhoto,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            moveItem,
            copyItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
            currentMinute
        }) || {};
        const { sortedMealsForDisplay, mealsUI } = mealsDisplay;

        // === Nutrition state (totals + norms + daily table) — extracted ===
        if (!HEYS.dayNutritionState?.buildNutritionState) {
            throw new Error('[heys_day_v12] HEYS.dayNutritionState not loaded before heys_day_v12.js');
        }
        // 🚀 PERF: memoize — dayTot/normAbs calc iterates all meals + reads localStorage
        const nutritionState = useMemo(() => HEYS.dayNutritionState.buildNutritionState({
            React,
            day,
            pIndex,
            optimum,
            getDailyNutrientColor,
            getDailyNutrientTooltip,
            HEYS: window.HEYS
        }) || {}, [day?.meals, day?.savedEatenKcal, day?.savedEatenProt, day?.savedEatenCarbs, day?.savedEatenFat, day?.savedEatenFiber, pIndex, optimum]);
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
            prodSig,
            dayTot,
            normAbs,
            optimum,
            waterGoal,
            haptic,
            U,
            lsGet,
            currentStreak,
            currentMinute,
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

        // === Export HEYS.Day mission helper methods ===
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.getMealsCount = () => (day.meals || []).length;
            HEYS.Day.getMeals = () => day.meals || [];
            // Diagnostics / render-desync detection (Phase B): expose current React day
            // (via dayRef so it is always the latest, not a stale effect closure),
            // its updatedAt, the date, and the block-window state. Used by the day-effects
            // same-updatedAt content-aware apply-guard and the Sync Debug Snapshot.
            HEYS.Day.getDay = () => dayRef.current || null;
            HEYS.Day.getDayUpdatedAt = () => (dayRef.current && dayRef.current.updatedAt) || 0;
            HEYS.Day.getDate = () => date;
            HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current || 0;
            HEYS.Day.isBlockingCloudUpdates = () => Date.now() < (blockCloudUpdatesUntilRef.current || 0);
            HEYS.Day.getLastLoadedUpdatedAt = () => lastLoadedUpdatedAtRef.current || 0;
            HEYS.Day.getSteps = () => day.steps || 0;
            HEYS.Day.getTrainingsCount = () => (day.trainings || []).length;
            HEYS.Day.getWaterPercent = () => {
                const w = day.water || 0;
                const goal = waterGoal || 2000;
                return goal > 0 ? Math.round((w / goal) * 100) : 0;
            };
            HEYS.Day.getKcalPercent = () => {
                const norm = normAbs.kcal || 2000;
                return norm > 0 ? Math.round(((dayTot.kcal || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getFiberPercent = () => {
                const norm = normAbs.fiber || 25;
                return norm > 0 ? Math.round(((dayTot.fiber || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getProteinPercent = () => {
                const norm = normAbs.prot || 100;
                return norm > 0 ? Math.round(((dayTot.prot || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getComplexCarbsPercent = () => {
                const totalCarbs = dayTot.carbs || 0;
                const complexCarbs = dayTot.complex || 0;
                return totalCarbs > 0 ? Math.round((complexCarbs / totalCarbs) * 100) : 0;
            };
            HEYS.Day.getHarmPercent = () => {
                const norm = normAbs.harm || 10;
                return norm > 0 ? Math.round(((dayTot.harm || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getMacroBalance = () => {
                const np = normAbs.prot || 1;
                const nc = normAbs.carbs || 1;
                const nf = normAbs.fat || 1;
                return {
                    protein: np > 0 ? (dayTot.prot || 0) / np : 0,
                    carbs: nc > 0 ? (dayTot.carbs || 0) / nc : 0,
                    fat: nf > 0 ? (dayTot.fat || 0) / nf : 0
                };
            };
            HEYS.Day.getLastMealGI = () => {
                const meals = day.meals || [];
                if (meals.length === 0) return 100;
                const lastMeal = meals[meals.length - 1];
                if (!lastMeal || !lastMeal.items || lastMeal.items.length === 0) return 100;
                let totalGI = 0, count = 0;
                for (const item of lastMeal.items) {
                    const p = pIndex ? pIndex[item.productId || item.id] : null;
                    if (p && typeof p.gi === 'number' && p.gi > 0) {
                        totalGI += p.gi;
                        count++;
                    }
                }
                return count > 0 ? Math.round(totalGI / count) : 100;
            };
            HEYS.Day.getUniqueProductsCount = () => {
                const meals = day?.meals || [];
                const productIds = new Set();
                meals.forEach(meal => {
                    (meal.items || []).forEach(item => {
                        const pid = item.product_id ?? item.productId ?? item.id;
                        if (pid != null) productIds.add(String(pid));
                    });
                });
                return productIds.size;
            };
            return () => {
                if (HEYS.Day) {
                    delete HEYS.Day.getMealsCount;
                    delete HEYS.Day.getMeals;
                    delete HEYS.Day.getSteps;
                    delete HEYS.Day.getTrainingsCount;
                    delete HEYS.Day.getWaterPercent;
                    delete HEYS.Day.getKcalPercent;
                    delete HEYS.Day.getFiberPercent;
                    delete HEYS.Day.getProteinPercent;
                    delete HEYS.Day.getComplexCarbsPercent;
                    delete HEYS.Day.getHarmPercent;
                    delete HEYS.Day.getMacroBalance;
                    delete HEYS.Day.getLastMealGI;
                    delete HEYS.Day.getUniqueProductsCount;
                }
            };
        }, [day, dayTot, normAbs, waterGoal, pIndex]);

        // 🔄 Orphan products state (extracted)
        if (!HEYS.dayOrphanState?.useOrphanState) {
            throw new Error('[heys_day_v12] HEYS.dayOrphanState not loaded before heys_day_v12.js');
        }
        const orphanState = HEYS.dayOrphanState.useOrphanState({ React, day, date, HEYS: window.HEYS }) || {};

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
        // 🚀 PERF R7: memoize heroMetrics — skip on popup/animation/water changes
        const heroMetrics = useMemo(() => HEYS.dayHeroMetrics.computeHeroMetrics({
            day,
            eatenKcal,
            optimum,
            factDefPct,
            dayTargetDef,
            r0,
            ratioZones: HEYS.ratioZones
        }) || {}, [eatenKcal, optimum, factDefPct, dayTargetDef, day?.isRefeedDay]);
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
                isEnabled: showStatsContent,
                date,
                day,
                // Контракт reports-insights.v4 «динамика»: кривая веса
                // считается на 30 днях независимо от выбранного периода —
                // на коротком окне наклон врёт, на длинном тянет старый тренд.
                chartPeriod: 31,
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
            includeWeeklyInsights: showStatsContent,
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
            ndteBoostKcal,
            r0
        }) || {};
        const {
            displayOptimum,
            displayRemainingKcal,
            displayCurrentRatio,
            displayRatioStatus
        } = caloricDisplayState;

        // Один бюджет на весь экран (контракт nutrition-tab, «бюджет дня»):
        // нормы вкладки «Питание» считаются от displayOptimum — нормы с учётом
        // рефида и калорийного долга. buildNutritionState стоит выше по порядку
        // хуков, где displayOptimum ещё не посчитан: он зависит от caloricDebt,
        // тот — от sparklineData, а та — от dayTot. Поэтому нормы экрана
        // пересчитываются здесь, после того как бюджет стал известен.
        const displayNormAbs = useMemo(() => {
            if (!displayOptimum || displayOptimum === optimum) return normAbs;
            return HEYS.dayNutritionState.computeNormAbs({
                budgetKcal: displayOptimum,
                normPerc,
                day,
                HEYS: window.HEYS
            });
        }, [displayOptimum, optimum, normPerc, normAbs]);

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
            sparklinePopup,
            sparklineState,
            prof
        }) || {};
        const {
            renderSparkline,
            renderWeightSparkline
        } = sparklineRenderers;

        // === ПРОГРЕСС-БАР К ЦЕЛИ (отдельный компонент для diary) ===
        // 🚀 PERF R7: memoize — animation state changes rarely now (2 renders vs 5-8 before)
        const goalProgressBar = useMemo(() => HEYS.dayGoalProgress?.renderGoalProgressBar?.({
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
        }) || null, [displayOptimum, optimum, eatenKcal, animatedKcal, animatedProgress, animatedRatioPct, animatedMarkerPos, isAnimating, caloricDebt, day?.isRefeedDay, day?.refeedReason]);

        // === ALERT: Orphan-продукты (данные из штампа вместо базы) ===
        // orphanVersion используется для триггера ререндера при изменении orphan
        const { orphanCount = 0 } = orphanState;

        // === Phase 13A Integration: Use extracted orphan alert renderer ===
        const orphanAlert = HEYS.dayOrphanAlert?.renderOrphanAlert?.({ orphanCount, date }) || false;

        // === Low-cal banner: дни с ratio < 50% без верификации (fasting/incomplete) ===
        const todayKey = fmtDate(new Date());
        const lowCalBanner = HEYS.dayLowCalBanner?.renderLowCalBanner?.({
            date,
            day,
            eatenKcal,
            displayOptimum,
            isToday: date === todayKey
        }) || false;

        // === Геймификация: «День выполнен» / «Идеальный день» ===
        // currentRatio — живой ratio текущего дня (heroMetrics выше). Начисляем
        // только за СЕГОДНЯ: ретроспективный просмотр прошлых дат не должен
        // триггерить XP. Дедупликация — maxPerDay в самой геймификации, поэтому
        // повторные вызовы при каждом изменении eatenKcal безопасны.
        React.useEffect(() => {
            if (date !== todayKey) return;
            if (!HEYS.game?.checkDayCompleted) return;
            HEYS.game.checkDayCompleted(currentRatio, todayKey);
            // Разовое предложение включить push — момент выбран точно: первый
            // заполненный день (UI v4, 2026-08-10). Тот же порог, что у
            // day_completed XP в checkDayCompleted (apps/web/heys_gamification_v1.js).
            if (currentRatio >= 0.75 && currentRatio <= 1.1) {
                window.dispatchEvent(new CustomEvent('heys:day-completed-for-push-prompt'));
            }
        }, [date, todayKey, currentRatio]);

        // === Hero display (tour override + colors + deficit) — extracted ===
        if (!HEYS.dayHeroDisplay?.buildHeroDisplay) {
            throw new Error('[heys_day_v12] HEYS.dayHeroDisplay not loaded before heys_day_v12.js');
        }
        // 🚀 PERF R7: memoize heroDisplay — skip on popup/animation/water/mood changes
        const heroDisplay = useMemo(() => HEYS.dayHeroDisplay.buildHeroDisplay({
            day,
            prof,
            tdee,
            displayOptimum,
            displayRemainingKcal,
            eatenKcal,
            HEYS: window.HEYS
        }) || {}, [tdee, displayOptimum, displayRemainingKcal, eatenKcal]);
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
        const cascadeReady = showStatsContent && !!HEYS.CascadeCard?.renderCard;
        const cascadeContent = cascadeReady ? (HEYS.CascadeCard.renderCard({
            React,
            day,
            selectedDate: date,
            prof,
            pIndex,
            dayTot,
            normAbs
        }) || null) : null;
        const cascadeSlot = showStatsContent
            ? React.createElement('div', {
                className: cascadeReady
                    ? 'deferred-card-slot deferred-card-slot--loaded no-animate deferred-card-slot--cascade'
                    : 'deferred-card-slot deferred-card-slot--pending deferred-card-slot--cascade',
                'aria-hidden': cascadeReady ? undefined : 'true',
                style: cascadeReady ? undefined : { minHeight: '140px' }
            }, cascadeContent)
            : null;
        const statsBlockResult = HEYS.dayStatsBlock.buildStatsBlock({
            React,
            HEYSRef: window.HEYS,
            renderStatsBlock: showStatsContent,
            cascadeSlot,
            openExclusivePopup,
            haptic,
            setDay,
            handlePeriodChange,
            setChartPeriod,
            setBalanceCardExpanded,
            // Вход в лист периодов у Отчётов свой — строка «По месяцам и
            // неделям» между «Днями» и «Что с этим делать». Модалка та же,
            // что открывает карточка дневника: двух списков периодов в
            // продукте нет.
            openReportsModal,
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
            tdeeResult,
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
            getDailyNutrientColor,
            getDailyNutrientTooltip,
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
        // 🚀 PERF R7: memoize compactActivity — only rebuild on activity/energy changes.
        // Skips rebuild on popup/animation/water/mood changes.
        const compactActivity = useMemo(() => {
            if (!showActivityContent) return null;
            return HEYS.dayActivityCard.buildActivityCard({
                React,
                day,
                prof,
                stepsValue,
                stepsGoal,
                stepsPercent,
                stepsColor,
                stepsK,
                stepsEstimated,
                stepsMissing,
                bmr,
                householdK,
                totalHouseholdMin,
                householdActivities,
                train1k,
                train2k,
                train3k,
                visibleTrainings,
                trainingTypes,
                regularTrainingsBlock,
                programTrainingsBlock,
                ndteData,
                ndteBoostKcal,
                tefData,
                tefKcal,
                dayTargetDef,
                displayOptimum,
                optimum,
                cycleKcalMultiplier,
                tdee,
                caloricDebt,
                monthTrainingsRows,
                workingWeights,
                morningActivationCalendarBlock,
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
        }, [showActivityContent, stepsValue, stepsGoal, stepsPercent, stepsColor, stepsK, stepsEstimated, stepsMissing, bmr, householdK, totalHouseholdMin, train1k, train2k, train3k, visibleTrainings, trainingTypes, regularTrainingsBlock, programTrainingsBlock, monthTrainingsRows, workingWeights, morningActivationCalendarBlock, ndteBoostKcal, tefKcal, dayTargetDef, displayOptimum, optimum, cycleKcalMultiplier, tdee, caloricDebt, day?.isRefeedDay]);

        if (!HEYS.dayNutritionCard?.buildNutritionCard) {
            throw new Error('[heys_day_v12] HEYS.dayNutritionCard not loaded before heys_day_v12.js');
        }
        const compactNutrition = useMemo(() => {
            if (!showNutritionContent) return null;
            return HEYS.dayNutritionCard.buildNutritionCard({
                React,
                day,
                prof,
                pIndex,
                date,
                eatenKcal,
                optimum,
                displayOptimum,
                displayRemainingKcal,
                dayTot,
                // Нормы экрана — от бюджета дня, не от базового optimum.
                normAbs: displayNormAbs,
                insulinWaveData,
                waterMl: day?.waterMl ?? day?.water,
                waterGoal,
                waterGoalBreakdown,
                waterLastDrink,
                addMeal,
                addWater,
                removeWater,
                openAddProductForMeal,
                haptic,
                openExclusivePopup,
                // Лист правки приёма переиспользует существующие обработчики
                // дневника: своих записей в день у него нет.
                openTimeEditor,
                openMoodEditor,
                openEditGramsModal,
                openCopyMealModal,
                openMoveMealModal,
                saveAsPreset,
                repeatYesterdayMeal,
                removeMeal,
                removeItem,
                copyItem,
                moveItem
            });
        }, [showNutritionContent, day, eatenKcal, optimum, displayOptimum, displayRemainingKcal, dayTot, displayNormAbs, insulinWaveData, waterGoal, waterGoalBreakdown, waterLastDrink, date, pIndex, prof, openAddProductForMeal, addMeal, addWater, removeWater, haptic, openTimeEditor, openMoodEditor, openEditGramsModal, openCopyMealModal, openMoveMealModal, saveAsPreset, repeatYesterdayMeal, removeMeal, removeItem, copyItem, moveItem]);

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
            isTabActive,
            orphanAlert,
            lowCalBanner,
            statsBlock,
            compactActivity,
            compactNutrition,
            sideBlock,
            cycleCard,
            reportsOverviewCard,
            reportsFullscreenModal,
            date,
            day,
            caloricDebt,
            eatenKcal,
            optimum,
            displayOptimum,
            tdee,
            addMeal,
            addWater,
            removeWater,
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
            dailyWaveOverview: HEYS.dayMealsChartUI?.renderDailyWaveOverview?.({ React, insulinWaveData }) || null,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            mealsUI,
            daySummary,
            dayTot,
            normAbs,
            heavyUiReady
        });
    };

    HEYS.DayTabImpl = HEYS.DayTabImpl || {};
    HEYS.DayTabImpl.createDayTab = function createDayTab() {
        // Wrap in React.memo to skip re-renders when props haven't changed
        if (!HEYS.DayTab._memoized && window.React?.memo) {
            const MemoTab = React.memo(HEYS.DayTab);
            MemoTab.displayName = 'DayTab';
            HEYS.DayTab._memoized = MemoTab;
        }
        return HEYS.DayTab._memoized || HEYS.DayTab;
    };

})(window);
