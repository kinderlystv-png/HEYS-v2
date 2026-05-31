// day/_meals.js — consolidated DayTab meals modules (card/list/display/chart/state/handlers)

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const ReactDOM = global.ReactDOM;
    const trackError = (err, context) => {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(err, context);
        }
    };

    // v69 FIX: Resolve scoped dayv2 key to prevent cross-client contamination
    function _scopedDayKey(dateStr) {
        const cid = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
        return cid ? 'heys_' + cid + '_dayv2_' + dateStr : 'heys_dayv2_' + dateStr;
    }

    // Today's local ISO date (matches heys_app_date_state_v1.js::getTodayISO — <3am = yesterday)
    function _getTodayISO() {
        const d = new Date();
        if (d.getHours() < 3) d.setDate(d.getDate() - 1);
        return d.getFullYear()
            + '-' + String(d.getMonth() + 1).padStart(2, '0')
            + '-' + String(d.getDate()).padStart(2, '0');
    }

    // =========================
    // MealCard
    // =========================
    const U = HEYS.dayUtils || {};
    const getProductFromItem = U.getProductFromItem || (() => null);
    const formatMealTime = U.formatMealTime || ((time) => time);
    const MEAL_TYPES = U.MEAL_TYPES || {};
    const per100 = U.per100 || (() => ({
        kcal100: 0,
        carbs100: 0,
        prot100: 0,
        fat100: 0,
        simple100: 0,
        complex100: 0,
        bad100: 0,
        good100: 0,
        trans100: 0,
        fiber100: 0,
    }));
    const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

    const M = HEYS.models || {};
    const { LazyPhotoThumb } = HEYS.dayGallery || {};
    const { getMealQualityScore, getNutrientColor, getNutrientTooltip } = HEYS.mealScoring || {};
    const { PopupCloseButton } = HEYS.dayPopups || {};
    const MealOptimizerSection = HEYS.dayMealOptimizerSection?.MealOptimizerSection;

    function fmtVal(key, v) {
        if (v == null || v === '') return '-';
        const num = +v || 0;
        if (key === 'harm') return Math.round(num * 10) / 10;
        if (!num) return '-';
        return Math.round(num);
    }

    const harmMissingLogged = new Set();
    function logMissingHarm(name, item, source) {
        if (!HEYS.analytics?.trackDataOperation) return;
        const key = `${source || 'meal-card'}:${(name || 'unknown').toLowerCase()}`;
        if (harmMissingLogged.has(key)) return;
        harmMissingLogged.add(key);
        HEYS.analytics.trackDataOperation('harm_missing_in_meal_card', {
            source: source || 'meal-card',
            name: name || null,
            productId: item?.product_id ?? item?.productId ?? item?.id ?? null,
            hasItemHarm: HEYS.models?.normalizeHarm?.(item) != null,
        });
    }

    const MEAL_HEADER_META = [
        { label: 'Название<br>продукта' },
        { label: 'г' },
        { label: 'ккал<br>/100', per100: true },
        { label: 'У<br>/100', per100: true },
        { label: 'Прост<br>/100', per100: true },
        { label: 'Сл<br>/100', per100: true },
        { label: 'Б<br>/100', per100: true },
        { label: 'Ж<br>/100', per100: true },
        { label: 'ВрЖ<br>/100', per100: true },
        { label: 'ПЖ<br>/100', per100: true },
        { label: 'ТрЖ<br>/100', per100: true },
        { label: 'Клетч<br>/100', per100: true },
        { label: 'ГИ' },
        { label: 'Вред' },
        { label: '' },
    ];

    function getMealType(mealIndex, meal, allMeals, pIndex) {
        const time = meal?.time || '';
        const hour = parseInt(time.split(':')[0]) || 12;

        if (hour >= 6 && hour < 11) return { type: 'breakfast', label: 'Завтрак', emoji: '🌅' };
        if (hour >= 11 && hour < 16) return { type: 'lunch', label: 'Обед', emoji: '🌞' };
        if (hour >= 16 && hour < 21) return { type: 'dinner', label: 'Ужин', emoji: '🌆' };
        return { type: 'snack', label: 'Перекус', emoji: '🍎' };
    }

    function getActivityContextTone(activityType) {
        switch (activityType) {
            case 'peri':
                return { background: '#22c55e33', color: '#16a34a', border: '#22c55e55' };
            case 'post':
                return { background: '#3b82f633', color: '#2563eb', border: '#3b82f655' };
            case 'pre':
                return { background: '#eab30833', color: '#ca8a04', border: '#eab30855' };
            case 'steps':
                return { background: '#10b9812b', color: '#047857', border: '#10b9814d' };
            case 'household':
                return { background: '#f9a8d433', color: '#be185d', border: '#f472b655' };
            case 'double':
                return { background: '#c084fc33', color: '#7e22ce', border: '#a855f755' };
            default:
                return { background: '#dcfce733', color: '#15803d', border: '#86efac66' };
        }
    }

    function resolveBestActivityContext(...contexts) {
        const candidates = contexts.filter((ctx) => ctx && ctx.type && ctx.type !== 'none');
        if (!candidates.length) return null;

        return candidates.sort((a, b) => {
            const priorityA = Number.isFinite(+a.priority) ? +a.priority : -Infinity;
            const priorityB = Number.isFinite(+b.priority) ? +b.priority : -Infinity;
            if (priorityA !== priorityB) return priorityB - priorityA;

            const richnessA = (a.badge ? 1 : 0) + (a.desc ? 1 : 0) + (a.details ? 1 : 0);
            const richnessB = (b.badge ? 1 : 0) + (b.desc ? 1 : 0) + (b.details ? 1 : 0);
            return richnessB - richnessA;
        })[0];
    }

    const MealCard = React.memo(function MealCard({
        meal,
        mealIndex,
        displayIndex,
        products,
        pIndex,
        date,
        setDay,
        isMobile,
        isExpanded,
        onToggleExpand,
        onChangeMealType,
        onChangeTime,
        onChangeMood,
        onChangeWellbeing,
        onChangeStress,
        onRemoveMeal,
        onCopyMeal,
        onMoveMeal,
        onSaveAsPreset,
        onRepeatYesterday,
        openEditGramsModal,
        openTimeEditor,
        openMoodEditor,
        setGrams,
        removeItem,
        moveItem,
        copyItem,
        removePhoto,
        isMealStale,
        allMeals,
        isNewItem,
        optimum,
        setMealQualityPopup,
        addProductToMeal,
        dayData,
        profile,
        insulinWaveData: insulinWaveDataProp,
    }) {
        const MealAddProduct = HEYS.dayComponents?.MealAddProduct;
        const ProductRow = HEYS.dayComponents?.ProductRow;
        if (!MealAddProduct || !ProductRow) {
            trackError(new Error('[HEYS Day Meals] Meal components not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
                missing: {
                    MealAddProduct: !MealAddProduct,
                    ProductRow: !ProductRow,
                },
            });
            return React.createElement('div', {
                className: 'card tone-slate meal-card widget-shadow-diary-glass widget-outline-diary-glass',
                style: { padding: '12px', marginTop: '8px' },
            }, 'Загрузка...');
        }
        const headerMeta = MEAL_HEADER_META;
        function mTotals(m) {
            const t = (M.mealTotals ? M.mealTotals(m, pIndex) : {
                kcal: 0,
                carbs: 0,
                simple: 0,
                complex: 0,
                prot: 0,
                fat: 0,
                bad: 0,
                good: 0,
                trans: 0,
                fiber: 0,
            });
            let gSum = 0;
            let giSum = 0;
            let harmSum = 0;
            (m.items || []).forEach((it) => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                // Dose-adjusted harm: cascade uses the same dynamic scoring as item cards
                const _pHasMacros = (
                    p.simple100 != null || p.carbs100 != null ||
                    p.trans100 != null || p.badFat100 != null || p.badfat100 != null
                );
                const harm = (g > 0 && _pHasMacros && HEYS.Harm?.calculateDoseAdjustedHarm)
                    ? HEYS.Harm.calculateDoseAdjustedHarm(p, g)
                    : (HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it));
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
            t.gi = gSum ? giSum / gSum : 0;
            t.harm = gSum ? harmSum / gSum : 0;
            return t;
        }
        const totals = React.useMemo(() => mTotals(meal), [meal, pIndex]);
        const manualType = meal.mealType;
        const autoTypeInfo = getMealType(mealIndex, meal, allMeals, pIndex);
        const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType]
            ? { type: manualType, ...U.MEAL_TYPES[manualType] }
            : autoTypeInfo;

        const changeMealType = (newType) => {
            onChangeMealType(mealIndex, newType);
        };
        const timeDisplay = U.formatMealTime ? U.formatMealTime(meal.time) : (meal.time || '');
        const mealKcal = Math.round(totals.kcal || 0);
        const isStale = isMealStale(meal);
        const isCurrentMeal = displayIndex === 0 && !isStale;

        // «Повторить как вчера» — загружаем данные только для пустых приёмов на сегодня
        const isToday = date === _getTodayISO();
        const isEmpty = (meal.items || []).length === 0;
        const canRepeatYesterday = isToday && isEmpty && typeof onRepeatYesterday === 'function';

        const [yesterdayMeal, setYesterdayMeal] = React.useState(null);
        const [hasRecentMeals, setHasRecentMeals] = React.useState(false);
        React.useEffect(() => {
            if (!canRepeatYesterday) {
                setYesterdayMeal(null);
                setHasRecentMeals(false);
                return;
            }
            try {
                const recent = loadRecentMealsForDate(date, 2);
                setHasRecentMeals(recent.length > 0);
                const yMeals = recent.filter(e => e.dateLabel === 'вчера').map(e => e.meal);
                const yMatch = findYesterdayEquivalent(meal, yMeals);
                setYesterdayMeal((yMatch && (yMatch.items || []).length > 0) ? yMatch : null);
            } catch (e) {
                setYesterdayMeal(null);
                setHasRecentMeals(false);
            }
        }, [canRepeatYesterday, meal.name, meal.mealType, meal.time, date]);

        const handleOpenRecentList = React.useCallback((e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            const recent = loadRecentMealsForDate(date, 2);
            if (!recent.length) {
                HEYS.Toast?.info?.('За последние 2 дня нет приёмов с продуктами');
                return;
            }
            if (!HEYS.CopyMealModal || !HEYS.CopyMealModal.showRecentList) return;
            HEYS.CopyMealModal.showRecentList({
                recentEntries: recent,
                onPick: (pickedMeal) => {
                    if (typeof onRepeatYesterday === 'function') onRepeatYesterday(mealIndex, pickedMeal);
                },
            });
        }, [date, mealIndex, onRepeatYesterday]);

        const mealActivityContext = React.useMemo(() => {
            if (!HEYS.InsulinWave?.calculateActivityContext) return null;
            if (!meal?.time || !meal?.items?.length) return null;

            const [mealHour, mealMinute] = String(meal.time || '').split(':').map(Number);
            if (Number.isNaN(mealHour) || Number.isNaN(mealMinute)) return null;

            const mealTimeMin = mealHour * 60 + mealMinute;

            return HEYS.InsulinWave.calculateActivityContext({
                mealTimeMin,
                mealKcal: totals.kcal || 0,
                trainings: dayData?.trainings || [],
                householdMin: dayData.householdMin || 0,
                steps: dayData.steps || 0,
                allMeals: allMeals,
            });
        }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, totals?.kcal]);

        const mealQuality = React.useMemo(() => {
            if (!meal?.items || meal.items.length === 0) return null;
            return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
        }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);

        const qualityLineColor = mealQuality
            ? mealQuality.color
            : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');

        const mealCardClass = isCurrentMeal
            ? 'card tone-green meal-card meal-card--current widget-shadow-diary-glass widget-outline-diary-glass'
            : 'card tone-slate meal-card widget-shadow-diary-glass widget-outline-diary-glass';
        const mealCardStyle = {
            marginTop: '8px',
            width: '100%',
            position: 'relative',
            paddingLeft: '12px',
        };
        const computeDerivedProductFn = M.computeDerivedProduct || ((prod) => prod || {});

        const InsulinWave = HEYS.InsulinWave || {};
        const IWUtils = InsulinWave.utils || {};
        const insulinWaveData = insulinWaveDataProp || {};
        const waveHistorySorted = React.useMemo(() => {
            const list = insulinWaveData.waveHistory || [];
            if (!IWUtils.normalizeToHeysDay) return [...list].sort((a, b) => a.startMin - b.startMin);
            return [...list].sort((a, b) => IWUtils.normalizeToHeysDay(a.startMin) - IWUtils.normalizeToHeysDay(b.startMin));
        }, [insulinWaveData.waveHistory]);

        const currentWaveIndex = React.useMemo(() => waveHistorySorted.findIndex((w) => w.time === meal.time), [waveHistorySorted, meal.time]);
        const currentWave = currentWaveIndex >= 0 ? waveHistorySorted[currentWaveIndex] : null;
        const prevWave = currentWaveIndex > 0 ? waveHistorySorted[currentWaveIndex - 1] : null;
        const nextWave = (currentWaveIndex >= 0 && currentWaveIndex < waveHistorySorted.length - 1) ? waveHistorySorted[currentWaveIndex + 1] : null;
        const resolvedActivityContext = resolveBestActivityContext(currentWave?.activityContext, mealActivityContext);
        const activityContextTone = getActivityContextTone(resolvedActivityContext?.type);
        const mealActivityContextTone = getActivityContextTone(mealActivityContext?.type);
        const hasOverlapWithNext = currentWave && nextWave ? currentWave.endMin > nextWave.startMin : false;
        const hasOverlapWithPrev = currentWave && prevWave ? prevWave.endMin > currentWave.startMin : false;
        const hasAnyOverlap = hasOverlapWithNext || hasOverlapWithPrev;
        const lipolysisGapNext = currentWave && nextWave ? Math.max(0, nextWave.startMin - currentWave.endMin) : 0;
        const overlapMinutes = hasOverlapWithNext
            ? currentWave.endMin - nextWave.startMin
            : hasOverlapWithPrev
                ? prevWave.endMin - currentWave.startMin
                : 0;
        const [waveExpanded, setWaveExpanded] = React.useState(true);
        const [showWaveCalcPopup, setShowWaveCalcPopup] = React.useState(false);
        const showWaveButton = !!(currentWave && meal.time && (meal.items || []).length > 0);
        const formatMinutes = React.useCallback((mins) => {
            if (IWUtils.formatDuration) return IWUtils.formatDuration(mins);
            return `${Math.max(0, Math.round(mins))}м`;
        }, [IWUtils.formatDuration]);

        const toggleWave = React.useCallback(() => {
            const newState = !waveExpanded;
            setWaveExpanded(newState);
            if (HEYS.dayUtils?.haptic) HEYS.dayUtils.haptic('light');
            if (HEYS.analytics?.trackDataOperation) {
                HEYS.analytics.trackDataOperation('insulin_wave_meal_expand', {
                    action: newState ? 'open' : 'close',
                    hasOverlap: hasAnyOverlap,
                    overlapMinutes,
                    lipolysisGap: lipolysisGapNext,
                    mealIndex,
                });
            }
        }, [waveExpanded, hasAnyOverlap, overlapMinutes, lipolysisGapNext, mealIndex]);

        const getMoodEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
        const getWellbeingEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
        const getStressEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';

        const moodVal = +meal.mood || 0;
        const wellbeingVal = +meal.wellbeing || 0;
        const stressVal = +meal.stress || 0;
        const moodEmoji = getMoodEmoji(moodVal);
        const wellbeingEmoji = getWellbeingEmoji(wellbeingVal);
        const stressEmoji = getStressEmoji(stressVal);
        const hasRatings = moodVal > 0 || wellbeingVal > 0 || stressVal > 0;

        const [optimizerPopupOpen, setOptimizerPopupOpen] = React.useState(false);
        const [totalsExpanded, setTotalsExpanded] = React.useState(false);

        const optimizerRecsCount = React.useMemo(() => {
            const MO = HEYS.MealOptimizer;
            if (!MO || !meal?.items?.length) return 0;

            const recommendations = MO.getMealOptimization({
                meal,
                mealTotals: totals,
                dayData: dayData || {},
                profile: profile || {},
                products: products || [],
                pIndex,
                avgGI: totals?.gi || 50,
            });

            const filtered = recommendations.filter((r) => !MO.shouldHideRecommendation(r.id));

            const seen = new Set();
            return filtered.filter((r) => {
                const key = r.title.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).length;
        }, [meal, totals, dayData, profile, products, pIndex]);

        return React.createElement('div', {
            className: mealCardClass,
            'data-meal-index': mealIndex,
            'data-meal-id': meal?.id || '',
            'data-meal-time': meal?.time || '',
            style: mealCardStyle,
        },
            // 🚫 R-DAY-STICKY REVERTED (2026-05-15): sticky на .meal-header-inside
            // ломает раскладку (CSS .meal-header-inside имеет flex-wrap: wrap, который
            // в комбинации с inline flex-direction:column + position:sticky производит
            // непредсказуемое поведение — у юзера элементы шапки и соседи (Показать,
            // Добавить N, + Добавить несколько) рендерятся вперемешку). Возвращаю
            // оригинальное position: relative — шапка работает как раньше, но без sticky.
            React.createElement('div', {
                className: 'meal-header-inside meal-type-' + mealTypeInfo.type,
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    position: 'relative',
                    background: qualityLineColor !== 'transparent'
                        ? qualityLineColor + '1F'
                        : undefined,
                    borderRadius: '10px 10px 0 0',
                    margin: '-12px -12px 8px -4px',
                    padding: '12px 16px 12px 8px',
                },
            },
                React.createElement('div', {
                    className: 'meal-header-main-row',
                    style: {
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                    },
                },
                    timeDisplay && React.createElement('span', {
                        className: 'meal-time-badge-inside',
                        onClick: () => openTimeEditor(mealIndex),
                        title: 'Изменить время',
                        style: { fontSize: '15px', padding: '6px 14px', fontWeight: '700', flexShrink: 0 },
                    }, timeDisplay),
                    React.createElement('div', { className: 'meal-type-wrapper', style: { flex: 1, display: 'flex', justifyContent: 'center' } },
                        React.createElement('span', { className: 'meal-type-label', style: { fontSize: '16px', fontWeight: '700', padding: '4px 12px' } },
                            mealTypeInfo.icon + ' ' + mealTypeInfo.name,
                            React.createElement('span', { className: 'meal-type-arrow' }, ' ▾'),
                        ),
                        React.createElement('select', {
                            className: 'meal-type-select',
                            value: manualType || '',
                            onChange: (e) => {
                                changeMealType(e.target.value || null);
                            },
                            title: 'Изменить тип приёма',
                        }, [
                            { value: '', label: '🔄 Авто' },
                            { value: 'breakfast', label: '🍳 Завтрак' },
                            { value: 'snack1', label: '🍎 Перекус' },
                            { value: 'lunch', label: '🍲 Обед' },
                            { value: 'snack2', label: '🥜 Перекус' },
                            { value: 'dinner', label: '🍽️ Ужин' },
                            { value: 'snack3', label: '🧀 Перекус' },
                            { value: 'night', label: '🌙 Ночной' },
                        ].map((opt) =>
                            React.createElement('option', { key: opt.value, value: opt.value }, opt.label),
                        )),
                    ),
                    React.createElement('span', { className: 'meal-kcal-badge-inside', style: { fontSize: '15px', padding: '6px 14px', flexShrink: 0 } },
                        mealKcal > 0 ? (mealKcal + ' ккал') : '0 ккал',
                    ),
                ),
                (resolvedActivityContext && resolvedActivityContext.type !== 'none' || mealQuality?.mealRoleStatus) && React.createElement('div', {
                    className: 'meal-header-badges-row',
                    style: {
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                    },
                },
                    resolvedActivityContext && resolvedActivityContext.type !== 'none' && React.createElement('span', {
                        className: 'activity-context-badge',
                        title: resolvedActivityContext.desc,
                        style: {
                            fontSize: '12px',
                            padding: '4px 8px',
                            borderRadius: '8px',
                            background: activityContextTone.background,
                            color: activityContextTone.color,
                            border: '1px solid ' + activityContextTone.border,
                            fontWeight: '600',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        },
                    }, resolvedActivityContext.badge || ''),
                    mealQuality?.mealRoleStatus && React.createElement('span', {
                        className: 'meal-role-status-badge-header',
                        title: mealQuality.mealRoleStatus.fullLabel,
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            padding: '4px 10px',
                            borderRadius: '10px',
                            background: mealQuality.mealRoleStatus.tone === 'green'
                                ? '#dcfce7'
                                : mealQuality.mealRoleStatus.tone === 'amber'
                                    ? '#fef3c7'
                                    : mealQuality.mealRoleStatus.tone === 'slate'
                                        ? '#e2e8f0'
                                        : '#dbeafe',
                            color: mealQuality.mealRoleStatus.tone === 'green'
                                ? '#15803d'
                                : mealQuality.mealRoleStatus.tone === 'amber'
                                    ? '#b45309'
                                    : mealQuality.mealRoleStatus.tone === 'slate'
                                        ? '#475569'
                                        : '#1d4ed8',
                            fontWeight: '700',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '13px' } }, mealQuality.mealRoleStatus.icon),
                        React.createElement('span', null, mealQuality.mealRoleStatus.shortLabel),
                    ),
                ),
            ),
            mealActivityContext && mealActivityContext.type !== 'none' && (meal.items || []).length === 0
            && React.createElement('div', {
                className: 'training-context-hint',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    margin: '0 -4px 8px -4px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    background: 'linear-gradient(135deg, ' + mealActivityContextTone.background.replace('33', '15') + ', ' + mealActivityContextTone.background.replace('33', '25').replace('2b', '20') + ')',
                    border: '1px solid ' + mealActivityContextTone.border.replace('55', '40').replace('4d', '40').replace('66', '40'),
                    color: mealActivityContextTone.color,
                },
            },
                React.createElement('span', { style: { fontSize: '18px' } }, mealActivityContext.badge || '🏋️'),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } },
                        mealActivityContext.type === 'peri' ? '🔥 Топливо для тренировки!'
                            : mealActivityContext.type === 'post' ? '💪 Анаболическое окно!'
                                : mealActivityContext.type === 'pre' ? '⚡ Скоро тренировка!'
                                    : mealActivityContext.type === 'steps' ? '👟 Активный день!'
                                        : mealActivityContext.type === 'double' ? '🏆 Двойная тренировка!'
                                            : '🎯 Хорошее время!'
                    ),
                    React.createElement('div', { style: { opacity: 0.85, fontSize: '12px' } },
                        mealActivityContext.type === 'peri'
                            ? 'Еда пойдёт в энергию, а не в жир. Вред снижен на ' + Math.round((1 - (mealActivityContext.harmMultiplier || 1)) * 100) + '%'
                            : mealActivityContext.type === 'post'
                                ? 'Нутриенты усвоятся в мышцы. Отличное время для белка!'
                                : mealActivityContext.type === 'pre'
                                    ? 'Лёгкие углеводы дадут энергию для тренировки'
                                    : mealActivityContext.type === 'steps'
                                        ? 'Высокая активность улучшает метаболизм'
                                        : mealActivityContext.type === 'double'
                                            ? 'Двойная нагрузка — можно есть смелее!'
                                            : 'Инсулиновая волна будет короче'
                    ),
                ),
            ),
            React.createElement('div', { className: 'row desktop-add-product', style: { justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { className: 'section-title' }, 'Добавить продукт'),
                React.createElement('div', { className: 'aps-open-buttons aps-open-buttons--column' },
                    React.createElement('div', { className: 'aps-open-row-quick' },
                        React.createElement(MealAddProduct, {
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            buttonText: '⚡ Добавить 1 продукт',
                            buttonIcon: '',
                            buttonClassName: 'aps-open-btn--quick',
                            highlightCurrent: false,
                            ariaLabel: 'Добавить 1 продукт'
                        }),
                        // 🆕 Кнопки «Подряд 2/3/4» — справа от «Добавить 1 продукт», минимальной ширины
                        ...[2, 3, 4].map(n => React.createElement(MealAddProduct, {
                            key: `repeat-${n}`,
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            multiProductMode: true,
                            autoRepeatCount: n,
                            buttonText: String(n),
                            buttonIcon: '',
                            buttonClassName: 'aps-open-btn--repeat',
                            highlightCurrent: false,
                            ariaLabel: `Добавить ${n} продукта подряд без промежуточной модалки`
                        }))
                    ),
                    React.createElement(MealAddProduct, {
                        mi: mealIndex,
                        products,
                        date,
                        setDay,
                        isCurrentMeal,
                        multiProductMode: true,
                        buttonText: 'Добавить несколько продуктов',
                        buttonIcon: '➕',
                        buttonClassName: 'aps-open-btn--multi',
                        highlightCurrent: true,
                        ariaLabel: 'Добавить несколько продуктов'
                    }),
                ),
            ),
            React.createElement('div', { style: { overflowX: 'auto', marginTop: '8px' } }, React.createElement('table', { className: 'tbl meals-table' },
                React.createElement('thead', null, React.createElement('tr', null, headerMeta.map((h, i) => React.createElement('th', {
                    key: 'h' + i,
                    className: h.per100 ? 'per100-col' : undefined,
                    dangerouslySetInnerHTML: { __html: h.label },
                })))),
                React.createElement('tbody', null,
                    (meal.items || []).map((it) => React.createElement(ProductRow, {
                        key: it.id,
                        item: it,
                        mealIndex,
                        isNew: isNewItem(it.id),
                        pIndex,
                        setGrams,
                        removeItem,
                    })),
                    React.createElement('tr', { className: 'tr-sum' },
                        React.createElement('td', { className: 'fw-600' }, ''),
                        React.createElement('td', null, ''),
                        React.createElement('td', { colSpan: 10 }, React.createElement('div', { className: 'table-divider' })),
                        React.createElement('td', null, fmtVal('kcal', totals.kcal)),
                        React.createElement('td', null, fmtVal('carbs', totals.carbs)),
                        React.createElement('td', null, fmtVal('simple', totals.simple)),
                        React.createElement('td', null, fmtVal('complex', totals.complex)),
                        React.createElement('td', null, fmtVal('prot', totals.prot)),
                        React.createElement('td', null, fmtVal('fat', totals.fat)),
                        React.createElement('td', null, fmtVal('bad', totals.bad)),
                        React.createElement('td', null, fmtVal('good', totals.good)),
                        React.createElement('td', null, fmtVal('trans', totals.trans)),
                        React.createElement('td', null, fmtVal('fiber', totals.fiber)),
                        React.createElement('td', null, fmtVal('gi', totals.gi)),
                        React.createElement('td', null, fmtVal('harm', totals.harm)),
                        React.createElement('td', null, ''),
                    ),
                ),
            )),
            React.createElement('div', { className: 'mobile-products-list' },
                canRepeatYesterday && yesterdayMeal && React.createElement('div', {
                    className: 'repeat-yesterday-suggestion',
                    style: {
                        margin: '0 0 10px',
                        borderRadius: '12px',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--card, #fff)',
                        overflow: 'hidden',
                    },
                },
                    React.createElement('button', {
                        type: 'button',
                        onClick: () => onRepeatYesterday(mealIndex, yesterdayMeal),
                        title: 'Скопировать вчерашний приём',
                        style: {
                            width: '100%',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 14px 8px',
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', textAlign: 'left',
                        },
                    },
                        React.createElement('span', { style: { flexShrink: 0 } }, '↩'),
                        React.createElement('span', {
                            style: { flex: '1 1 auto', minWidth: 0, fontSize: '13px', fontWeight: 600, color: 'var(--acc, #3b82f6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                        }, `Повторить вчерашний «${yesterdayMeal.name || 'Приём'}»`),
                    ),
                    React.createElement('div', {
                        style: { padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: '2px' },
                    },
                        (yesterdayMeal.items || []).slice(0, 4).map((it, idx) => {
                            const g = Number(it.grams) || 0;
                            const kcal = Math.round(((Number(it.kcal100) || 0) * g) / 100);
                            return React.createElement('div', {
                                key: it.id || idx,
                                style: { display: 'flex', gap: '6px', fontSize: '12px', color: 'var(--muted, #94a3b8)' },
                            },
                                React.createElement('span', { style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, it.name || '—'),
                                React.createElement('span', { style: { flexShrink: 0, fontVariantNumeric: 'tabular-nums' } }, `${g}г · ${kcal}к`),
                            );
                        }),
                        (yesterdayMeal.items || []).length > 4 && React.createElement('div', {
                            style: { fontSize: '11px', color: 'var(--muted, #94a3b8)', fontStyle: 'italic' },
                        }, `и ещё ${(yesterdayMeal.items || []).length - 4} продукта(ов)`),
                    ),
                ),
                canRepeatYesterday && hasRecentMeals && React.createElement('button', {
                    type: 'button',
                    onClick: handleOpenRecentList,
                    className: 'repeat-recent-meal-btn',
                    title: 'Выбрать из недавних приёмов',
                    style: {
                        margin: '0 0 10px',
                        width: '100%',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid var(--border, #e2e8f0)',
                        background: 'var(--card, #fff)',
                        color: 'var(--text, #374151)',
                        fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', textAlign: 'left',
                    },
                },
                    React.createElement('span', { style: { flexShrink: 0 } }, '📋'),
                    React.createElement('span', {
                        style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                    }, 'Повторить приём из недавних'),
                ),
                React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
                    (meal.items || []).length > 0 && React.createElement('div', {
                        className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
                        onClick: () => onToggleExpand(mealIndex, allMeals),
                    },
                        React.createElement('span', { className: 'toggle-arrow' }, '›'),
                        React.createElement('span', { className: 'mpc-toggle-text' },
                            React.createElement('span', { className: 'mpc-toggle-title' }, isExpanded ? 'Скрыть' : 'Показать'),
                            React.createElement('span', { className: 'mpc-toggle-count' },
                                (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов'),
                            ),
                        ),
                    ),
                    React.createElement('div', { className: 'aps-open-buttons' },
                        React.createElement('div', { className: 'aps-open-row-quick' },
                            React.createElement(MealAddProduct, {
                                mi: mealIndex,
                                products,
                                date,
                                setDay,
                                isCurrentMeal,
                                buttonText: '⚡ Добавить 1 продукт',
                                buttonIcon: '',
                                buttonClassName: 'aps-open-btn--quick',
                                highlightCurrent: false,
                                ariaLabel: 'Добавить 1 продукт'
                            }),
                            // 🆕 Кнопки «Подряд 2/3/4» — справа от «Добавить 1 продукт», минимальной ширины
                            ...[2, 3, 4].map(n => React.createElement(MealAddProduct, {
                                key: `repeat-${n}`,
                                mi: mealIndex,
                                products,
                                date,
                                setDay,
                                isCurrentMeal,
                                multiProductMode: true,
                                autoRepeatCount: n,
                                buttonText: String(n),
                                buttonIcon: '',
                                buttonClassName: 'aps-open-btn--repeat',
                                highlightCurrent: false,
                                ariaLabel: `Добавить ${n} продукта подряд без промежуточной модалки`
                            }))
                        ),
                        React.createElement(MealAddProduct, {
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            multiProductMode: true,
                            buttonText: 'Добавить несколько продуктов',
                            buttonIcon: '➕',
                            buttonClassName: 'aps-open-btn--multi',
                            highlightCurrent: true,
                            ariaLabel: 'Добавить несколько продуктов'
                        }),
                    ),
                ),
                isExpanded && (meal.items || []).map((it) => {
                    const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
                    const G = +it.grams || 0;
                    const per = per100(p);
                    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? it.gi;
                    // Use centralized harm normalization with fallback to item
                    const baseHarm = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);

                    if (baseHarm == null) {
                        logMissingHarm(p.name, it, 'mobile-card');
                    }

                    if (baseHarm == null) {
                        logMissingHarm(p.name, it, 'mobile-card-compact');
                    }

                    // Dose-adjusted harm: при маленькой порции продукт показывается честно.
                    // Мёд 15г ≠ мёд 100г по реальному гликемическому удару и вреду.
                    // Используем calculateDoseAdjustedHarm если у продукта есть макро-данные.
                    const _pHasMacros = (
                        p.simple100 != null || p.carbs100 != null ||
                        p.trans100 != null || p.badFat100 != null || p.badfat100 != null
                    );
                    const harmVal = (G > 0 && _pHasMacros && HEYS.Harm?.calculateDoseAdjustedHarm)
                        ? HEYS.Harm.calculateDoseAdjustedHarm(p, G)
                        : baseHarm;

                    const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';

                    const getHarmToneStyle = (h) => {
                        if (h == null) return null;
                        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

                        let accent = '#60a5fa';
                        let edge = isDark ? 'rgba(96, 165, 250, 0.18)' : 'rgba(59, 130, 246, 0.14)';
                        let wash = isDark ? 'rgba(96, 165, 250, 0.07)' : 'rgba(59, 130, 246, 0.06)';
                        let border = isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(59, 130, 246, 0.16)';

                        if (h <= 2) {
                            accent = isDark ? '#34d399' : '#10b981';
                            edge = isDark ? 'rgba(52, 211, 153, 0.16)' : 'rgba(16, 185, 129, 0.11)';
                            wash = isDark ? 'rgba(52, 211, 153, 0.05)' : 'rgba(16, 185, 129, 0.04)';
                            border = isDark ? 'rgba(52, 211, 153, 0.18)' : 'rgba(16, 185, 129, 0.12)';
                        } else if (h <= 4) {
                            accent = isDark ? '#4ade80' : '#22c55e';
                            edge = isDark ? 'rgba(74, 222, 128, 0.14)' : 'rgba(34, 197, 94, 0.09)';
                            wash = isDark ? 'rgba(74, 222, 128, 0.045)' : 'rgba(34, 197, 94, 0.035)';
                            border = isDark ? 'rgba(74, 222, 128, 0.16)' : 'rgba(34, 197, 94, 0.11)';
                        } else if (h <= 6) {
                            accent = isDark ? '#60a5fa' : '#3b82f6';
                            edge = isDark ? 'rgba(96, 165, 250, 0.19)' : 'rgba(59, 130, 246, 0.13)';
                            wash = isDark ? 'rgba(96, 165, 250, 0.07)' : 'rgba(59, 130, 246, 0.05)';
                            border = isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(59, 130, 246, 0.15)';
                        } else if (h <= 8) {
                            accent = isDark ? '#fb7185' : '#ef4444';
                            edge = isDark ? 'rgba(251, 113, 133, 0.18)' : 'rgba(239, 68, 68, 0.12)';
                            wash = isDark ? 'rgba(251, 113, 133, 0.07)' : 'rgba(239, 68, 68, 0.05)';
                            border = isDark ? 'rgba(251, 113, 133, 0.22)' : 'rgba(239, 68, 68, 0.15)';
                        } else {
                            accent = isDark ? '#f87171' : '#ef4444';
                            edge = isDark ? 'rgba(248, 113, 113, 0.24)' : 'rgba(239, 68, 68, 0.17)';
                            wash = isDark ? 'rgba(248, 113, 113, 0.10)' : 'rgba(239, 68, 68, 0.07)';
                            border = isDark ? 'rgba(248, 113, 113, 0.26)' : 'rgba(239, 68, 68, 0.18)';
                        }

                        const dangerGlow = h > 6
                            ? `, radial-gradient(circle at 100% 0%, ${isDark ? (h > 8 ? 'rgba(248, 113, 113, 0.16)' : 'rgba(251, 113, 133, 0.12)') : (h > 8 ? 'rgba(239, 68, 68, 0.10)' : 'rgba(244, 63, 94, 0.08)')} 0%, rgba(255, 255, 255, 0) 56%)`
                            : '';

                        return {
                            backgroundColor: isDark ? 'var(--heys-bg-card)' : '#ffffff',
                            backgroundImage: `linear-gradient(90deg, ${edge} 0%, ${wash} 18%, rgba(255, 255, 255, 0) 42%)${dangerGlow}, linear-gradient(180deg, ${isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.65)'} 0%, rgba(255, 255, 255, 0) 72%)`,
                            borderColor: border,
                            boxShadow: `inset 3px 0 0 ${accent}`,
                        };
                    };
                    const harmToneStyle = getHarmToneStyle(harmVal);

                    const getHarmBadge = (h) => {
                        if (h == null) return null;
                        if (h <= 2) return { emoji: '🌿', text: 'полезный', color: '#059669' };
                        if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
                        return null;
                    };
                    const harmBadge = getHarmBadge(harmVal);

                    const getCategoryIcon = (cat) => {
                        if (!cat) return null;
                        const c = cat.toLowerCase();
                        if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
                        if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
                        if (c.includes('рыб') || c.includes('морепр')) return '🐟';
                        if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
                        if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
                        if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
                        if (c.includes('яйц')) return '🥚';
                        if (c.includes('орех') || c.includes('семеч')) return '🥜';
                        if (c.includes('масл')) return '🫒';
                        if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
                        if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
                        if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
                        return '🍽️';
                    };
                    const categoryIcon = getCategoryIcon(p.category);

                    const findAlternative = (prod, allProducts) => {
                        // Smart Alternative v1.0: semantic category + macro similarity + multi-factor scoring
                        const _LOG = '[HEYS.prodRec]';
                        if (!allProducts || allProducts.length < 2) {
                            console.info(_LOG, '⛔ skip: allProducts empty or single', { product: prod?.name, poolSize: allProducts?.length });
                            return null;
                        }
                        const currentKcal = per.kcal100 || 0;
                        if (currentKcal < 50) {
                            console.info(_LOG, '⛔ skip: product kcal too low (< 50)', { product: prod?.name, kcal: currentKcal });
                            return null;
                        }

                        console.info(_LOG, '🔍 START findAlternative', {
                            product: prod.name,
                            kcal: currentKcal,
                            prot: per.prot100 || 0,
                            carbs: per.carbs100 || 0,
                            fat: per.fat100 || 0,
                            harm: prod.harm ?? baseHarm ?? 0,
                            gi: prod.gi ?? 50,
                            fiber: per.fiber100 || 0,
                            category: prod.category || '—',
                            poolSize: allProducts.length,
                        });

                        // Actual calories consumed at the real portion the user ate (G = grams from closure)
                        // Early harm eval — needed for good-product guard (#6) and harm-only fallback (#4)
                        // Intentionally uses baseHarm (per-100g intrinsic quality), not dose-adjusted harmVal,
                        // so that we evaluate the product's nature, not the portion size.
                        const origHarm = prod.harm ?? baseHarm ?? 0;
                        // #6 Guard: product already good — no value in recommending a swap
                        if (origHarm <= 1 && currentKcal <= 200) {
                            console.info(_LOG, '⛔ skip: product already good (harm≤1 + kcal≤200)', { product: prod.name, harm: origHarm, kcal: currentKcal });
                            return null;
                        }
                        const actualCurrentKcal = Math.round(currentKcal * G / 100);
                        // Tiny portion guard: swapping < 20g serving is nonsensical (e.g. 11g almonds)
                        if (G > 0 && G < 20) {
                            console.info(_LOG, '⛔ skip: portion too small (< 20г) — swap makes no sense', { product: prod?.name, grams: G, actualKcal: actualCurrentKcal });
                            return null;
                        }
                        // Helper: typical portion (grams) a person would eat of a given product
                        const getTypicalGrams = (altProd) => {
                            const sp = HEYS.MealOptimizer?.getSmartPortion?.(altProd);
                            return sp?.grams || 100;
                        };

                        // Semantic category detection (Product Picker if available, else keyword fallback)
                        const _detectCat = HEYS.InsightsPI?.productPicker?._internal?.detectCategory;
                        const _catSource = _detectCat ? 'ProductPicker' : 'keyword-fallback';
                        const getSemanticCat = (name, fallbackCat) => {
                            // Priority sub-categories — override ProductPicker for specific use-cases
                            const _n = (name || '').toLowerCase();
                            // Guard: "блюдо в майонезе" — майонез как ингредиент, а не соус сам по себе
                            // Note: '(в майонезе)' has '(' before 'в', not space — use includes without leading space
                            const _sauceAsIngredient = _n.includes('в майонезе') || _n.includes('с майонезом') ||
                                _n.includes('в кетчупе') || _n.includes('в горчиц') ||
                                _n.includes('в соусе') || _n.includes('с соусом');
                            if (!_sauceAsIngredient && (
                                _n.includes('майонез') || _n.includes('кетчуп') || _n.includes('горчиц') ||
                                _n.startsWith('соус') || _n.includes(' соус') || _n.includes('уксус') ||
                                _n.includes('заправк') || _n.includes('аджик') || _n.includes('хрен') ||
                                _n.includes('васаби') || _n.includes('песто') || _n.includes('тахини') ||
                                _n.includes('ткемали'))) return 'sauce';
                            if (_n.includes('шоколад') || _n.includes('мороженое') || _n.includes('пломбир') ||
                                _n.includes('сорбет') || _n.includes('тирамису') || _n.includes('торт') ||
                                _n.includes('пирожн') || _n.includes('вафл') || _n.includes('круасс') ||
                                _n.includes('суфле') || _n.includes('макарун') ||
                                _n.includes('сгущён') || _n.includes('пудинг') || _n.includes('конфет') ||
                                _n.includes('мармелад') || _n.includes('зефир') || _n.includes('халва') ||
                                _n.includes('варень') || _n.includes('джем') || _n.includes('нутелл') ||
                                _n.includes('карамел') || _n.includes('пастил') || _n.includes('трюфел')) return 'dessert_sweet';
                            if (_n.includes('колбас') || _n.includes('сосис') || _n.includes('сарделька') ||
                                _n.includes('ветчин') || _n.includes('бекон') || _n.includes('паштет') ||
                                _n.includes('сервелат') || _n.includes('буженин') || _n.includes('балык') ||
                                _n.includes('карбонад') || _n.includes('салями') || _n.includes('прошутто')) return 'processed_meat';
                            if (_n.includes('газировк') || _n.includes('кола') || _n.includes('лимонад') ||
                                _n.includes('компот') || _n.includes('морс') || _n.includes('нектар') ||
                                _n.includes('квас')) return 'drink';
                            if (_n.startsWith('масло ') || _n.includes(' масло ') ||
                                _n.includes('масло сливочн') || _n.includes('масло растительн') ||
                                _n.includes('масло оливков') || _n.includes('масло подсолнечн') ||
                                _n.includes('масло кокосов') || _n.includes('масло кунжутн') ||
                                _n.includes('масло льнян')) return 'oil';
                            // Grains: ProductPicker пропускает блины/оладьи/лепёшки/овсяные хлопья
                            if (_n.includes('блин') || _n.includes('оладь') || _n.includes('лепёшк') ||
                                _n.includes('пицц') || _n.includes('тортилья') || _n.includes('лаваш') ||
                                _n.startsWith('овсян') || _n.includes('овсяные') || _n.includes('овсяных')) return 'grains';
                            if (_detectCat) return _detectCat(name || '');
                            const c = (fallbackCat || name || '').toLowerCase();
                            if (c.includes('молоч') || c.includes('кефир') || c.includes('творог') || c.includes('йогур') || c.includes('сыр')) return 'dairy';
                            if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говяд') || c.includes('рыб') || c.includes('морепр') || c.includes('яйц')) return 'protein';
                            if (c.includes('овощ') || c.includes('фрукт') || c.includes('ягод') || c.includes('зелен') || c.includes('салат')) return 'vegetables';
                            if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('макарон')) return 'grains';
                            if (c.includes('орех') || c.includes('семеч') || c.includes('миндал') || c.includes('фундук')) return 'snacks';
                            return 'other';
                        };
                        const getGrainSubtype = (name) => {
                            const _n = (name || '').toLowerCase();
                            if (_n.includes('овсян') || _n.includes('каша') || _n.includes('мюсли') ||
                                _n.includes('гранол') || _n.includes('хлопь') || _n.includes('отруб')) return 'breakfast_grain';
                            if (_n.includes('блин') || _n.includes('оладь') || _n.includes('лепёшк') ||
                                _n.includes('тортилья') || _n.includes('лаваш') || _n.includes('пицц')) return 'flatbread_grain';
                            if (_n.includes('макарон') || _n.includes('паста') || _n.includes('лапша') ||
                                _n.includes('спагет')) return 'pasta_grain';
                            return 'generic_grain';
                        };
                        const getLateEveningPreparationPenalty = (name, scenario, semCat) => {
                            if (!(scenario === 'LATE_EVENING' || scenario === 'PRE_SLEEP')) return 0;
                            const _n = (name || '').toLowerCase();
                            const _isFried = _n.includes('жарен') || _n.includes('фритюр');
                            const _isDoughy = _n.includes('блин') || _n.includes('оладь') || _n.includes('пицц') ||
                                _n.includes('лаваш') || _n.includes('лепёшк') || _n.includes('тортилья');
                            if (_isFried) return -10;
                            if (_isDoughy && semCat === 'grains') return -8;
                            if (_isDoughy) return -5;
                            return 0;
                        };
                        const getFoodFormFactor = (name, semCat) => {
                            const _n = (name || '').toLowerCase();
                            const _isSpreadableToken =
                                semCat === 'sauce' || semCat === 'oil' ||
                                _n.includes('творожн') && _n.includes('сыр') ||
                                _n.includes('сливочн') && _n.includes('сыр') ||
                                _n.includes('крем-сыр') || _n.includes('плавлен') ||
                                _n.includes('намазк') || _n.includes('паштет') ||
                                _n.includes('хумус') || _n.includes('арахисов') && _n.includes('паста');
                            const _isDishToken =
                                _n.includes('ролл') || _n.includes('сэндвич') || _n.includes('бургер') ||
                                _n.includes('шаурм') || _n.includes('брускет') || _n.includes('суши') ||
                                _n.includes('суп') || _n.includes('котлет') || _n.includes('тефтел') ||
                                _n.includes('куриц') || _n.includes('индейк') || _n.includes('говядин') ||
                                _n.includes('свинин') || _n.includes('рыба') || _n.includes('лосос') ||
                                _n.includes('минтай') || _n.includes('салат') || _n.includes('запек') ||
                                _n.includes('туш') || _n.includes('шашлык') || _n.includes('плов') ||
                                _n.includes('омлет') || _n.includes('жаркое');
                            // В композитных блюдах (например, ролл с творожным сыром)
                            // spreadable ингредиент не должен определять форму всего продукта.
                            if (_isDishToken) return 'solid_meal';
                            if (_isSpreadableToken) return 'spreadable';
                            if (semCat === 'drink' || _n.includes('кефир') || _n.includes('йогурт пить')) return 'liquid';
                            return 'neutral';
                        };
                        // Dominant macro fallback: for products where semantic cat = 'other'
                        const getDominantMacro = (prot, carbs, fat, kcal) => {
                            if (!kcal || kcal < 1) return 'macro_mixed';
                            if ((prot * 3) / kcal >= 0.35) return 'macro_protein';
                            if ((fat * 9) / kcal >= 0.55) return 'macro_fat';
                            if ((carbs * 4) / kcal >= 0.50) return 'macro_carb';
                            return 'macro_mixed';
                        };
                        const origSemCat = getSemanticCat(prod.name, prod.category);
                        const origFormFactor = getFoodFormFactor(prod.name, origSemCat);
                        const origMacroCat = origSemCat === 'other'
                            ? getDominantMacro(per.prot100 || 0, per.carbs100 || 0, per.fat100 || 0, currentKcal)
                            : null;
                        const origGrainSubtype = origSemCat === 'grains' ? getGrainSubtype(prod.name) : null;

                        console.info(_LOG, '🏷️ category detection', {
                            catSource: _catSource,
                            semCat: origSemCat,
                            formFactor: origFormFactor,
                            macroCat: origMacroCat || '—',
                            grainSubtype: origGrainSubtype || '—',
                        });

                        // Candidate pool: client products + shared products (#8 try multiple access paths)
                        const _sharedList = (() => {
                            const _paths = [
                                HEYS.cloud?.getCachedSharedProducts?.(),
                                HEYS.products?.shared,
                                HEYS.products?.getShared?.(),
                                HEYS.products?.sharedProducts,
                                HEYS.products?.all?.filter?.((p) => p._shared || p.shared),
                            ];
                            for (const _p of _paths) {
                                if (Array.isArray(_p) && _p.length > 0) return _p;
                            }
                            return [];
                        })();
                        const _clientIds = new Set(allProducts.map((ap) => ap.id));
                        const candidatePool = [
                            ...allProducts.map((ap) => ({ ...ap, _familiar: true })),
                            ..._sharedList.filter((sp) => sp && sp.id && !_clientIds.has(sp.id)).map((sp) => ({ ...sp, _familiar: false })),
                        ];

                        console.info(_LOG, '📦 candidate pool built', {
                            clientProducts: allProducts.length,
                            sharedProducts: _sharedList.length,
                            totalPool: candidatePool.length,
                        });

                        // #3 Exclude ALL products already in this meal (other items in same sitting)
                        const _mealItemIds = new Set(
                            (meal?.items || []).map((mi) => mi.product_id || mi.id).filter(Boolean)
                        );
                        // #2 Adaptive noSaving threshold: low-kcal products need softer filter
                        const _noSavingThreshold = currentKcal < 200 ? 0.75 : 0.90;
                        // Filter: real food, category-compatible, meaningful saving
                        const _rejectLog = { selfMatch: 0, mealItem: 0, lowKcal: 0, lowMacro: 0, noSaving: 0, tooLowKcal: 0, wrongCat: 0, formMismatch: 0, grainSubtypeMismatch: 0, passed: 0 };
                        const candidates = candidatePool.filter((alt) => {
                            if (alt.id === prod.id) { _rejectLog.selfMatch++; return false; }
                            if (_mealItemIds.has(alt.id) || _mealItemIds.has(alt.product_id)) { _rejectLog.mealItem++; return false; }
                            const altDer = computeDerivedProductFn(alt);
                            const altKcal = alt.kcal100 || altDer.kcal100 || 0;
                            if (altKcal < 30) { _rejectLog.lowKcal++; return false; } // exclude supplements/spices/teas
                            const altMacroSum = (alt.prot100 || altDer.prot100 || 0)
                                + (alt.fat100 || altDer.fat100 || 0)
                                + ((alt.simple100 || 0) + (alt.complex100 || 0) || alt.carbs100 || altDer.carbs100 || 0);
                            if (altMacroSum < 5) { _rejectLog.lowMacro++; return false; } // not real food
                            if (altKcal >= currentKcal * _noSavingThreshold) { _rejectLog.noSaving++; return false; } // adaptive: 75% for <200kcal, 90% otherwise
                            if (altKcal < currentKcal * 0.15) { _rejectLog.tooLowKcal++; return false; } // guard: cap at 85% saving
                            const altSemCat = getSemanticCat(alt.name, alt.category);
                            const altFormFactor = getFoodFormFactor(alt.name, altSemCat);
                            if (origSemCat === 'grains' && origGrainSubtype === 'breakfast_grain') {
                                const altGrainSubtype = getGrainSubtype(alt.name);
                                if (altGrainSubtype === 'flatbread_grain') {
                                    _rejectLog.grainSubtypeMismatch++;
                                    return false;
                                }
                            }
                            if (origSemCat !== 'other') {
                                if (altSemCat !== origSemCat) { _rejectLog.wrongCat++; return false; }
                            } else {
                                const altMacroCat = getDominantMacro(
                                    alt.prot100 || altDer.prot100 || 0,
                                    alt.carbs100 || altDer.carbs100 || 0,
                                    alt.fat100 || altDer.fat100 || 0,
                                    altKcal,
                                );
                                if (origMacroCat !== 'macro_mixed' && altMacroCat !== 'macro_mixed' && origMacroCat !== altMacroCat) { _rejectLog.wrongCat++; return false; }
                            }
                            // Hard guard: spreadable products should only be replaced with spreadable products
                            if (origFormFactor === 'spreadable' && altFormFactor !== 'spreadable') {
                                _rejectLog.formMismatch++;
                                return false;
                            }
                            _rejectLog.passed++;
                            return true;
                        });

                        console.info(_LOG, '🔬 filter results', {
                            ..._rejectLog,
                            passedCandidates: candidates.map((c) => c.name),
                        });

                        if (candidates.length === 0) {
                            console.info(_LOG, '❌ no candidates after filter — no recommendation');
                            return null;
                        }

                        // Pre-compute original macro energy fractions
                        // origHarm already declared above (early guard section)
                        const origGI = prod.gi ?? 50;
                        const origProtEn = (per.prot100 || 0) * 3 / currentKcal;
                        const origCarbEn = (per.carbs100 || 0) * 4 / currentKcal;
                        const origFatEn = (per.fat100 || 0) * 9 / currentKcal;
                        const origFiber = per.fiber100 || 0;

                        // Build Product Picker scenario context (best effort)
                        let _pickerFn = null;
                        let _pickerScenario = null;
                        try {
                            _pickerFn = HEYS.InsightsPI?.productPicker?.calculateProductScore;
                            if (_pickerFn && meal?.time) {
                                const _mealHour = parseInt(meal.time.split(':')[0], 10);
                                _pickerScenario = {
                                    scenario: _mealHour >= 22 ? 'PRE_SLEEP' : _mealHour >= 20 ? 'LATE_EVENING' : 'BALANCED',
                                    remainingKcal: optimum ? Math.max(0, optimum - currentKcal) : 500,
                                    currentTime: _mealHour,
                                    targetProtein: profile?.targetProtein || 100,
                                    sugarDependencyRisk: false,
                                    fiberRegularityScore: 0.5,
                                    micronutrientDeficits: [],
                                    novaQualityScore: 0.5,
                                    targetGL: _mealHour >= 20 ? 10 : 20,
                                };
                                console.info(_LOG, '⚙️ ProductPicker scenario', _pickerScenario);
                            } else {
                                console.info(_LOG, '⚙️ ProductPicker unavailable — using neutral pickerScore=50', {
                                    hasFn: !!_pickerFn,
                                    mealTime: meal?.time || '—',
                                });
                            }
                        } catch (e) {
                            _pickerFn = null;
                            console.warn(_LOG, '⚠️ ProductPicker scenario build failed:', e?.message);
                        }

                        let best = null;
                        let bestComposite = -Infinity;
                        const scoredCandidates = [];
                        for (const alt of candidates) {
                            try {
                                const altDer = computeDerivedProductFn(alt);
                                const altKcal = alt.kcal100 || altDer.kcal100 || 1;
                                const altProt = alt.prot100 || altDer.prot100 || 0;
                                const altCarbs = alt.carbs100 || altDer.carbs100 || 0;
                                const altFat = alt.fat100 || altDer.fat100 || 0;
                                const altFiber = alt.fiber100 || altDer.fiber100 || 0;
                                const altGI = alt.gi ?? 50;
                                const altHarm = alt.harm ?? 0;
                                // 5. Portion-aware reality check: compare realistic serving calories
                                const typicalAltGrams = getTypicalGrams(alt);
                                const actualAltKcal = Math.round(altKcal * typicalAltGrams / 100);
                                const portionKcalRatio = actualAltKcal / Math.max(1, actualCurrentKcal);
                                // If replacement realistically means >50% more calories → skip entirely
                                if (portionKcalRatio > 1.5) {
                                    console.info(_LOG, '🚫 portion skip (would eat more kcal in real serving):', {
                                        name: alt.name,
                                        typicalAltGrams,
                                        actualAltKcal,
                                        vs: actualCurrentKcal,
                                        ratio: Math.round(portionKcalRatio * 100) + '%',
                                    });
                                    continue;
                                }
                                let portionPenalty = 0;
                                let portionMode = 'real_saving';
                                if (portionKcalRatio > 1.0) {
                                    portionPenalty = -10; // per-100g better but real serving ≈ same/more kcal
                                    portionMode = 'composition';
                                }
                                // 1. Macro similarity (0–100)
                                const macroSimilarity = Math.max(0,
                                    100
                                    - Math.abs(origProtEn - (altProt * 3 / altKcal)) * 150
                                    - Math.abs(origCarbEn - (altCarbs * 4 / altKcal)) * 100
                                    - Math.abs(origFatEn - (altFat * 9 / altKcal)) * 100,
                                );
                                // 2. Improvement: harm reduction + soft kcal saving + fiber
                                const savingPct = Math.round((1 - altKcal / currentKcal) * 100);
                                const harmImprov = Math.min(50, Math.max(-20, (origHarm - altHarm) * 15));
                                const fiberBonus = altFiber > origFiber + 1 ? 10 : 0;
                                const improvementScore = harmImprov + Math.min(35, savingPct * 0.45) + fiberBonus;
                                // 3. Familiarity bonus
                                const familiarBonus = alt._familiar ? 10 : 0;
                                // 3.1 Grains subtype bias: keep breakfast grains close to breakfast grains
                                const altSemCatForScore = getSemanticCat(alt.name, alt.category);
                                const altFormFactor = getFoodFormFactor(alt.name, altSemCatForScore);
                                const altGrainSubtype = origSemCat === 'grains' ? getGrainSubtype(alt.name) : null;
                                let grainSubtypeBonus = 0;
                                if (origGrainSubtype && altGrainSubtype) {
                                    if (origGrainSubtype === altGrainSubtype) {
                                        grainSubtypeBonus = 8;
                                    } else if (
                                        (origGrainSubtype === 'breakfast_grain' && altGrainSubtype === 'flatbread_grain') ||
                                        (origGrainSubtype === 'flatbread_grain' && altGrainSubtype === 'breakfast_grain')
                                    ) {
                                        grainSubtypeBonus = -12;
                                    } else {
                                        grainSubtypeBonus = -4;
                                    }
                                }
                                const eveningPrepPenalty = getLateEveningPreparationPenalty(
                                    alt.name,
                                    _pickerScenario?.scenario,
                                    altSemCatForScore,
                                );
                                let formFactorBonus = 0;
                                if (origFormFactor === 'spreadable' && altFormFactor !== 'spreadable') {
                                    formFactorBonus = altFormFactor === 'solid_meal' ? -24 : -12;
                                } else if (origFormFactor === altFormFactor && origFormFactor !== 'neutral') {
                                    formFactorBonus = 6;
                                }
                                // 4. Product Picker contextual score (optional)
                                // calculateProductScore returns { totalScore, breakdown } — extract number!
                                let pickerScore = 50;
                                if (_pickerFn && _pickerScenario) {
                                    try {
                                        const _pickerResult = _pickerFn({
                                            name: alt.name,
                                            macros: { protein: altProt, carbs: altCarbs, fat: altFat, kcal: altKcal },
                                            harm: altHarm, gi: altGI,
                                            category: getSemanticCat(alt.name, alt.category),
                                            familiarityScore: alt._familiar ? 7 : 3,
                                            fiber: altFiber, nova_group: alt.novaGroup || 2,
                                        }, _pickerScenario);
                                        // Return is always an object { totalScore, breakdown }
                                        pickerScore = typeof _pickerResult?.totalScore === 'number'
                                            ? _pickerResult.totalScore
                                            : (typeof _pickerResult === 'number' ? _pickerResult : 50);
                                    } catch (e) {
                                        console.warn(_LOG, '⚠️ pickerFn threw for', alt?.name, e?.message);
                                        pickerScore = 50;
                                    }
                                }
                                // Composite: productPicker 35% + macroSimilarity 30% + improvement 25% + familiarity 10% + portionPenalty + grains subtype bias + late-evening preparation penalty
                                const composite = pickerScore * 0.35 + macroSimilarity * 0.30 + improvementScore * 0.25 + familiarBonus * 0.10 + portionPenalty + grainSubtypeBonus + eveningPrepPenalty + formFactorBonus;
                                scoredCandidates.push({
                                    name: alt.name,
                                    kcal: altKcal,
                                    harm: altHarm,
                                    saving: savingPct,
                                    familiar: alt._familiar,
                                    portionMode,
                                    typicalAltGrams,
                                    actualAltKcal,
                                    scores: {
                                        picker: Math.round(pickerScore * 10) / 10,
                                        macroSim: Math.round(macroSimilarity * 10) / 10,
                                        improvement: Math.round(improvementScore * 10) / 10,
                                        familiarBonus,
                                        portionPenalty,
                                        grainSubtypeBonus,
                                        eveningPrepPenalty,
                                        formFactorBonus,
                                        composite: Math.round(composite * 10) / 10,
                                    },
                                    breakdown: {
                                        harmImprov: Math.round(harmImprov * 10) / 10,
                                        savingBonus: Math.round(Math.min(35, savingPct * 0.45) * 10) / 10,
                                        fiberBonus,
                                        grainSubtype: origSemCat === 'grains'
                                            ? `${origGrainSubtype || '—'}→${altGrainSubtype || '—'}`
                                            : '—',
                                        prepPenaltyReason: eveningPrepPenalty < 0 ? 'late-evening fried/doughy' : 'none',
                                        formFactor: `${origFormFactor}→${altFormFactor}`,
                                    },
                                });
                                if (composite > bestComposite) {
                                    bestComposite = composite;
                                    best = { name: alt.name, saving: savingPct, score: Math.round(composite), portionMode, actualCurrentKcal, actualAltKcal, harmImproved: altHarm < origHarm - 0.5 };
                                }
                            } catch (e) {
                                console.warn(_LOG, '⚠️ scoring error for candidate', alt?.name, e?.message);
                            }
                        }

                        // Log all scored candidates sorted by composite desc
                        const sortedLog = [...scoredCandidates].sort((a, b) => b.scores.composite - a.scores.composite);
                        console.info(_LOG, '📊 scoring table (desc)', sortedLog.map((c) => ({
                            name: c.name,
                            kcal: c.kcal,
                            saving: c.saving + '%',
                            harm: c.harm,
                            familiar: c.familiar,
                            portionMode: c.portionMode,
                            portion: `${c.typicalAltGrams}г → ${c.actualAltKcal}ккал (orig ${actualCurrentKcal}ккал)`,
                            composite: c.scores.composite,
                            breakdown: `picker=${c.scores.picker} | macroSim=${c.scores.macroSim} | improv=${c.scores.improvement}(harm=${c.breakdown.harmImprov},save=${c.breakdown.savingBonus},fiber=${c.breakdown.fiberBonus}) | fam=${c.scores.familiarBonus} | grainSubtype=${c.scores.grainSubtypeBonus}(${c.breakdown.grainSubtype}) | portionPenalty=${c.scores.portionPenalty} | eveningPrep=${c.scores.eveningPrepPenalty}(${c.breakdown.prepPenaltyReason}) | form=${c.scores.formFactorBonus}(${c.breakdown.formFactor})`,
                        })));

                        if (!best || bestComposite < 28) {
                            // #4 Harm-only fallback: original product is harmful — recommend cleaner option
                            // even when no kcal saving is achievable (e.g. Краковская колбаса harm=8.5)
                            if (origHarm >= 3) {
                                const _harmPool = candidatePool.filter((alt) => {
                                    if (alt.id === prod.id || _mealItemIds.has(alt.id)) return false;
                                    const _altDer = computeDerivedProductFn(alt);
                                    const _altKcal2 = alt.kcal100 || _altDer.kcal100 || 0;
                                    const _altHarm2 = alt.harm ?? 0;
                                    if (_altKcal2 < 30) return false;
                                    if (_altHarm2 >= origHarm - 2) return false; // must be meaningfully cleaner
                                    const _typGrams2 = getTypicalGrams(alt);
                                    if (Math.round(_altKcal2 * _typGrams2 / 100) > actualCurrentKcal * 2) return false; // portion reality
                                    const _altSemCat2 = getSemanticCat(alt.name, alt.category);
                                    if (origSemCat !== 'other' && _altSemCat2 !== origSemCat) return false;
                                    return true;
                                });
                                if (_harmPool.length > 0) {
                                    const _hBest = _harmPool.reduce((a, b) => (a.harm ?? 0) < (b.harm ?? 0) ? a : b);
                                    const _hDer = computeDerivedProductFn(_hBest);
                                    const _hKcal = _hBest.kcal100 || _hDer.kcal100 || 1;
                                    const _hHarm = _hBest.harm ?? 0;
                                    const _hGrams = getTypicalGrams(_hBest);
                                    const _hActKcal = Math.round(_hKcal * _hGrams / 100);
                                    const _hSaving = Math.round((1 - _hKcal / currentKcal) * 100);
                                    console.info(_LOG, '✅ harm-only fallback selected', {
                                        original: prod.name, origHarm,
                                        replacement: _hBest.name, altHarm: _hHarm,
                                        portion: `${_hGrams}г → ${_hActKcal}ккал`,
                                        harmOnlyPool: _harmPool.length,
                                    });
                                    return { name: _hBest.name, saving: _hSaving, score: 0, portionMode: 'harm_only', actualCurrentKcal, actualAltKcal: _hActKcal, harmImproved: true, origHarm: Math.round(origHarm * 10) / 10, altHarm: _hHarm };
                                }
                            }
                            console.info(_LOG, '❌ no recommendation — below threshold, no harm-only fallback', {
                                bestName: best?.name || '—',
                                bestComposite: Math.round(bestComposite * 10) / 10,
                                origHarm,
                            });
                            return null;
                        }
                        console.info(_LOG, '✅ recommendation selected', {
                            original: prod.name,
                            originalKcal: currentKcal,
                            replacement: best.name,
                            saving: best.saving + '%',
                            composite: best.score,
                            portionMode: best.portionMode,
                            portion: `${G}г → ${best.actualCurrentKcal}ккал | замена ~${best.actualAltKcal}ккал`,
                            semCat: origSemCat,
                            grainSubtype: origGrainSubtype || '—',
                            macroCat: origMacroCat || '—',
                            candidatesTotal: candidates.length,
                        });
                        return best;
                    };
                    // boot_optimized_v1 / Phase 1.3: memoize findAlternative — the
                    // 509-product candidate pool scoring is the dominant cost when
                    // multiple meal items render. Cache invalidates on
                    // HEYS.products.contentVersion bump (see S4 in plan).
                    const alternative = window.HEYS && window.HEYS.__memoFindAlt
                        ? window.HEYS.__memoFindAlt(p, products, findAlternative)
                        : findAlternative(p, products);

                    const cardContent = React.createElement('div', { className: 'mpc', style: harmToneStyle || undefined },
                        React.createElement('div', { className: 'mpc-row1' },
                            categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                            React.createElement('span', { className: 'mpc-name' },
                                p.name,
                                it._oneTime && React.createElement('span', {
                                    className: 'mpc-name-oneoff',
                                    title: 'Разовый продукт — не сохранён в базу',
                                }, ' (разово)')
                            ),
                            harmBadge && React.createElement('span', {
                                className: 'mpc-badge',
                                style: { color: harmBadge.color },
                            }, harmBadge.emoji),
                            React.createElement('button', {
                                className: 'mpc-grams-btn ' + gramsClass,
                                onClick: (e) => { e.stopPropagation(); openEditGramsModal(mealIndex, it.id, G, p); },
                            }, G + 'г'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                        alternative && React.createElement('div', { className: 'mpc-alternative' },
                            React.createElement('span', null, '💡 Замени на '),
                            React.createElement('strong', null, alternative.name),
                            React.createElement('span', null, (() => {
                                const _a = alternative;
                                if (_a.portionMode === 'harm_only') return ` — вред ${_a.origHarm} → ${_a.altHarm}`;
                                if (_a.portionMode === 'real_saving') {
                                    const _t = ` — ~${_a.actualAltKcal} ккал вместо ~${_a.actualCurrentKcal} ккал`;
                                    return _a.harmImproved ? _t + ', вред ниже' : _t;
                                }
                                return _a.harmImproved ? ' — полезнее по составу, вред ниже' : ' — полезнее по составу';
                            })()),
                        ),
                    );

                    if (isMobile && HEYS.SwipeableRow) {
                        const swipeActions = [];
                        if (typeof moveItem === 'function') {
                            swipeActions.push({
                                key: 'move', label: 'Переместить', color: 'move',
                                onAction: () => moveItem(mealIndex, it.id),
                            });
                        }
                        if (typeof copyItem === 'function') {
                            swipeActions.push({
                                key: 'copy', label: 'Копировать', color: 'copy',
                                onAction: () => copyItem(mealIndex, it.id),
                            });
                        }
                        return React.createElement(HEYS.SwipeableRow, {
                            key: it.id,
                            onDelete: () => removeItem(mealIndex, it.id),
                            actions: swipeActions.length > 0 ? swipeActions : undefined,
                        }, cardContent);
                    }

                    return React.createElement('div', { key: it.id, className: 'mpc', style: harmToneStyle ? { marginBottom: '6px', ...harmToneStyle } : { marginBottom: '6px' } },
                        React.createElement('div', { className: 'mpc-row1' },
                            React.createElement('span', { className: 'mpc-name' },
                                p.name,
                                it._oneTime && React.createElement('span', {
                                    className: 'mpc-name-oneoff',
                                    title: 'Разовый продукт — не сохранён в базу',
                                }, ' (разово)')
                            ),
                            React.createElement('input', {
                                type: 'number',
                                className: 'mpc-grams',
                                value: G,
                                onChange: (e) => setGrams(mealIndex, it.id, e.target.value),
                                onFocus: (e) => e.target.select(),
                                onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
                                'data-grams-input': true,
                                'data-meal-index': mealIndex,
                                'data-item-id': it.id,
                                inputMode: 'decimal',
                            }),
                            React.createElement('button', {
                                className: 'mpc-delete',
                                onClick: () => removeItem(mealIndex, it.id),
                            }, '×'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                    );
                }),

                (meal.photos && meal.photos.length > 0) && React.createElement('div', { className: 'meal-photos' },
                    meal.photos.map((photo, photoIndex) => {
                        const photoSrc = photo.url || photo.data;
                        if (!photoSrc) return null;

                        const timeStr = photo.timestamp
                            ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                            : null;

                        const handleDelete = async (e) => {
                            e?.stopPropagation?.();
                            await removePhoto?.(mealIndex, photo.id);
                        };

                        let thumbClass = 'meal-photo-thumb';
                        if (photo.pending) thumbClass += ' pending';
                        if (photo.uploading) thumbClass += ' uploading';

                        return React.createElement(LazyPhotoThumb, {
                            key: photo.id || photoIndex,
                            photo,
                            photoSrc,
                            thumbClass,
                            timeStr,
                            mealIndex,
                            photoIndex,
                            mealPhotos: meal.photos,
                            handleDelete,
                            removePhoto,
                            setDay,
                        });
                    }),
                ),

                showWaveButton && React.createElement('div', {
                    className: 'meal-wave-block' + (waveExpanded ? ' expanded' : ''),
                    style: {
                        marginTop: '10px',
                        background: 'transparent',
                        borderRadius: '12px',
                        overflow: 'hidden',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-wave-toggle',
                        onClick: toggleWave,
                        style: {
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600,
                            color: hasAnyOverlap ? '#b91c1c' : '#1f2937',
                        },
                    },
                        React.createElement('span', null,
                            `📉 Волна ${(currentWave.duration / 60).toFixed(1)}ч • ` + (
                                hasAnyOverlap
                                    ? `⚠️ перехлёст ${formatMinutes(overlapMinutes)}`
                                    : nextWave
                                        ? `✅ липолиз ${formatMinutes(lipolysisGapNext)}`
                                        : '🟢 последний приём'
                            ),
                        ),
                        React.createElement('button', {
                            className: 'meal-wave-calc-btn',
                            onClick: (e) => {
                                e.stopPropagation();
                                setShowWaveCalcPopup(true);
                            },
                            style: {
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                color: '#3b82f6',
                                fontWeight: 500,
                                cursor: 'pointer',
                                marginLeft: '8px',
                            },
                        }, 'расчёт'),
                        React.createElement('span', { className: 'toggle-arrow' }, waveExpanded ? '▴' : '▾'),
                    ),
                    waveExpanded && InsulinWave.MealWaveExpandSection && React.createElement(InsulinWave.MealWaveExpandSection, {
                        waveData: currentWave,
                        prevWave,
                        nextWave,
                    }),

                    (() => {
                        const IW = HEYS.InsulinWave;
                        if (!IW || !IW.calculateHypoglycemiaRisk) return null;

                        const hypoRisk = IW.calculateHypoglycemiaRisk(meal, pIndex, getProductFromItem);
                        if (!hypoRisk.hasRisk) return null;

                        const mealMinutes = IW.utils?.timeToMinutes?.(meal.time) || 0;
                        const now = new Date();
                        const nowMinutes = now.getHours() * 60 + now.getMinutes();
                        let minutesSinceMeal = nowMinutes - mealMinutes;
                        if (minutesSinceMeal < 0) minutesSinceMeal += 24 * 60;

                        const inRiskWindow = minutesSinceMeal >= hypoRisk.riskWindow.start && minutesSinceMeal <= hypoRisk.riskWindow.end;

                        return React.createElement('div', {
                            className: 'hypoglycemia-warning',
                            style: {
                                margin: '8px 12px 10px 12px',
                                padding: '8px 10px',
                                background: inRiskWindow ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.1)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: inRiskWindow ? '#ea580c' : '#ca8a04',
                            },
                        },
                            React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                                inRiskWindow
                                    ? '⚡ Сейчас возможен спад энергии'
                                    : '⚡ Высокий GI — риск "сахарных качелей"',
                            ),
                            React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } },
                                inRiskWindow
                                    ? 'Это нормально! Съешь орехи или белок если устал'
                                    : `GI ~${Math.round(hypoRisk.details.avgGI)}, белок ${Math.round(hypoRisk.details.totalProtein)}г — через 2-3ч может "накрыть"`,
                            ),
                        );
                    })(),
                ),

                React.createElement('div', {
                    className: 'meal-meta-row',
                    style: {
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '8px 0',
                    },
                },
                    mealQuality && React.createElement('button', {
                        className: 'meal-quality-badge',
                        onClick: (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMealQualityPopup({
                                meal,
                                quality: mealQuality,
                                mealTypeInfo,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom + 8,
                            });
                        },
                        title: 'Качество приёма — нажми для деталей',
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            border: 'none',
                            background: mealQuality.color + '20',
                            color: mealQuality.color,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            flexShrink: 0,
                            minWidth: '28px',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '12px' } },
                            mealQuality.score >= 80 ? '⭐' : mealQuality.score >= 50 ? '📊' : '⚠️',
                        ),
                        React.createElement('span', { style: { fontSize: '11px', fontWeight: 600 } }, mealQuality.score),
                    ),
                    isMobile
                        ? React.createElement('div', {
                            className: 'mobile-mood-btn',
                            onClick: () => openMoodEditor(mealIndex),
                            title: 'Изменить оценки',
                            style: {
                                display: 'flex',
                                gap: '6px',
                                cursor: 'pointer',
                            },
                        },
                            hasRatings ? React.createElement(React.Fragment, null,
                                moodEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fef3c7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, moodEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#b45309' } }, moodVal),
                                ),
                                wellbeingEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#dcfce7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, wellbeingEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#15803d' } }, wellbeingVal),
                                ),
                                stressEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fce7f3',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, stressEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#be185d' } }, stressVal),
                                ),
                            ) : React.createElement('span', {
                                style: {
                                    fontSize: '11px',
                                    color: '#94a3b8',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    background: '#f1f5f9',
                                },
                            }, '+ оценки'))
                        : React.createElement(React.Fragment, null,
                            React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: (e) => onChangeTime(mealIndex, e.target.value) }),
                            React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: (e) => onChangeMood(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: (e) => onChangeWellbeing(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: (e) => onChangeStress(mealIndex, +e.target.value || '') })),
                        ),
                    (meal.items || []).length > 0 && React.createElement('button', {
                        className: 'meal-totals-badge',
                        onClick: (e) => {
                            e.stopPropagation();
                            setTotalsExpanded(!totalsExpanded);
                        },
                        title: 'Показать итоговые КБЖУ приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'КБЖУ',
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, totalsExpanded ? '▴' : '▾'),
                    ),
                    optimizerRecsCount > 0 && React.createElement('button', {
                        className: 'meal-optimizer-badge',
                        onClick: () => setOptimizerPopupOpen(!optimizerPopupOpen),
                        title: 'Советы по улучшению приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'Советы',
                        React.createElement('span', {
                            style: {
                                background: '#f59e0b',
                                color: '#fff',
                                borderRadius: '8px',
                                padding: '0 5px',
                                fontSize: '10px',
                                fontWeight: 700,
                                marginLeft: '3px',
                                lineHeight: '16px',
                            },
                        }, optimizerRecsCount),
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, optimizerPopupOpen ? '▴' : '▾'),
                    ),
                    typeof onCopyMeal === 'function' && React.createElement('button', {
                        className: 'meal-copy-btn',
                        onClick: () => onCopyMeal(mealIndex),
                        title: 'Копировать приём (или часть продуктов)',
                        disabled: !((meal.items || []).length),
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#e0f2fe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: (meal.items || []).length ? 'pointer' : 'not-allowed',
                            opacity: (meal.items || []).length ? 1 : 0.4,
                            flexShrink: 0,
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                        },
                    }, '📋 Копировать'),
                    typeof onMoveMeal === 'function' && React.createElement('button', {
                        className: 'meal-move-btn',
                        onClick: () => onMoveMeal(mealIndex),
                        title: 'Переместить приём на другой день',
                        disabled: !((meal.items || []).length),
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: (meal.items || []).length ? 'pointer' : 'not-allowed',
                            opacity: (meal.items || []).length ? 1 : 0.4,
                            flexShrink: 0,
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                        },
                    }, '🔀 Переместить'),
                    typeof onSaveAsPreset === 'function' && React.createElement('button', {
                        className: 'meal-save-preset-btn',
                        onClick: () => onSaveAsPreset(mealIndex),
                        title: 'Сохранить приём как набор',
                        disabled: !((meal.items || []).length),
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#f0fdf4',
                            color: '#15803d',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: (meal.items || []).length ? 'pointer' : 'not-allowed',
                            opacity: (meal.items || []).length ? 1 : 0.4,
                            flexShrink: 0,
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                        },
                    }, '💾 Шаблон'),
                    React.createElement('button', {
                        className: 'meal-delete-btn',
                        onClick: () => onRemoveMeal(mealIndex),
                        title: 'Удалить приём',
                        style: {
                            padding: '4px 6px',
                            fontSize: '14px',
                            lineHeight: 1,
                            flexShrink: 0,
                        },
                    }, '🗑'),
                ),

                mealQuality?.mealRoleStatus?.coachText && React.createElement('div', {
                    className: 'meal-role-coach-card',
                    'data-tone': mealQuality.mealRoleStatus.tone || 'slate',
                },
                    React.createElement('div', { className: 'meal-role-coach-card__icon' },
                        mealQuality.mealRoleStatus.icon,
                    ),
                    React.createElement('div', { className: 'meal-role-coach-card__body' },
                        React.createElement('div', { className: 'meal-role-coach-card__label' },
                            mealQuality.mealRoleStatus.coachLabel || 'Подсказка',
                        ),
                        React.createElement('div', { className: 'meal-role-coach-card__title' },
                            mealQuality.mealRoleStatus.coachTitle || mealQuality.mealRoleStatus.shortLabel,
                        ),
                        React.createElement('div', { className: 'meal-role-coach-card__text' },
                            mealQuality.mealRoleStatus.coachText,
                        ),
                    ),
                ),

                totalsExpanded && (meal.items || []).length > 0 && React.createElement('div', {
                    className: 'mpc-totals-wrap',
                    style: {
                        marginTop: '10px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(96, 165, 250, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                },
                    React.createElement('div', { className: 'mpc-grid mpc-header' },
                        React.createElement('span', null, 'ккал'),
                        React.createElement('span', null, 'У'),
                        React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                        React.createElement('span', null, 'Б'),
                        React.createElement('span', null, 'Ж'),
                        React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                        React.createElement('span', null, 'Кл'),
                        React.createElement('span', null, 'ГИ'),
                        React.createElement('span', null, 'Вр'),
                    ),
                    React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
                        React.createElement('span', { title: getNutrientTooltip('kcal', totals.kcal, totals), style: { color: getNutrientColor('kcal', totals.kcal, totals), fontWeight: getNutrientColor('kcal', totals.kcal, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.kcal)),
                        React.createElement('span', { title: getNutrientTooltip('carbs', totals.carbs, totals), style: { color: getNutrientColor('carbs', totals.carbs, totals), fontWeight: getNutrientColor('carbs', totals.carbs, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.carbs)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('simple', totals.simple, totals), style: { color: getNutrientColor('simple', totals.simple, totals), fontWeight: getNutrientColor('simple', totals.simple, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.simple || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('complex', totals.complex, totals), style: { color: getNutrientColor('complex', totals.complex, totals), cursor: 'help' } }, Math.round(totals.complex || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('prot', totals.prot, totals), style: { color: getNutrientColor('prot', totals.prot, totals), fontWeight: getNutrientColor('prot', totals.prot, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.prot)),
                        React.createElement('span', { title: getNutrientTooltip('fat', totals.fat, totals), style: { color: getNutrientColor('fat', totals.fat, totals), fontWeight: getNutrientColor('fat', totals.fat, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fat)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('bad', totals.bad, totals), style: { color: getNutrientColor('bad', totals.bad, totals), fontWeight: getNutrientColor('bad', totals.bad, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.bad || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('good', totals.good, totals), style: { color: getNutrientColor('good', totals.good, totals), fontWeight: getNutrientColor('good', totals.good, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.good || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('trans', totals.trans, totals), style: { color: getNutrientColor('trans', totals.trans, totals), fontWeight: getNutrientColor('trans', totals.trans, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.trans || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('fiber', totals.fiber, totals), style: { color: getNutrientColor('fiber', totals.fiber, totals), fontWeight: getNutrientColor('fiber', totals.fiber, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fiber || 0)),
                        React.createElement('span', { title: getNutrientTooltip('gi', totals.gi, totals), style: { color: getNutrientColor('gi', totals.gi, totals), fontWeight: getNutrientColor('gi', totals.gi, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.gi || 0)),
                        React.createElement('span', { title: getNutrientTooltip('harm', totals.harm, totals), style: { color: getNutrientColor('harm', totals.harm, totals), fontWeight: getNutrientColor('harm', totals.harm, totals) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', totals.harm || 0)),
                    ),
                ),

                optimizerPopupOpen && optimizerRecsCount > 0 && HEYS.MealOptimizer && MealOptimizerSection && React.createElement('div', {
                    className: 'meal-optimizer-expanded',
                    style: {
                        marginTop: '12px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(245, 158, 0, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(245, 158, 0, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                }, React.createElement(MealOptimizerSection, {
                    meal,
                    totals,
                    dayData: dayData || {},
                    profile: profile || {},
                    products: products || [],
                    pIndex,
                    mealIndex,
                    addProductToMeal,
                })),

                showWaveCalcPopup && currentWave && (() => {
                    const overlay = React.createElement('div', {
                        className: 'wave-details-overlay',
                        onClick: (e) => { if (e.target === e.currentTarget) setShowWaveCalcPopup(false); },
                        style: {
                            position: 'fixed',
                            inset: 0,
                            width: '100vw',
                            height: '100dvh',
                            minHeight: '100dvh',
                            background: 'rgba(0,0,0,0.5)',
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px',
                            overflow: 'hidden',
                            boxSizing: 'border-box',
                        },
                    },
                        React.createElement('div', {
                            className: 'wave-details-popup',
                            style: {
                                background: '#fff',
                                borderRadius: '16px',
                                padding: '20px',
                                maxWidth: 'min(360px, calc(100vw - 24px))',
                                width: '100%',
                                maxHeight: 'calc(100dvh - 24px)',
                                overflowY: 'auto',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                                boxSizing: 'border-box',
                            },
                        },
                            React.createElement('div', {
                                className: 'wave-details-popup__header',
                                style: {
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '16px',
                                },
                            },
                                React.createElement('h3', {
                                    className: 'wave-details-popup__title',
                                    style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' },
                                }, 'Расчёт волны'),
                                React.createElement('button', {
                                    className: 'wave-details-popup__close',
                                    onClick: () => setShowWaveCalcPopup(false),
                                    style: {
                                        background: 'none', border: 'none', fontSize: '20px',
                                        cursor: 'pointer', color: '#9ca3af', padding: '4px',
                                    },
                                }, '×'),
                            ),

                            React.createElement('div', {
                                className: 'wave-details-popup__hero',
                                style: {
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '16px',
                                    textAlign: 'center',
                                    color: '#fff',
                                },
                            },
                                React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } }, 'Длина волны'),
                                React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),
                                React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } }, currentWave.timeDisplay + ' → ' + currentWave.endTimeDisplay),
                            ),

                            React.createElement('div', {
                                className: 'wave-details-popup__formula',
                                style: {
                                    background: '#f8fafc',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    marginBottom: '16px',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: '#64748b',
                                    textAlign: 'center',
                                },
                            }, 'База × Множитель = ' + (currentWave.baseWaveHours || 3).toFixed(1) + 'ч × '
                            + (currentWave.finalMultiplier || 1).toFixed(2) + ' = ' + (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),

                            React.createElement('div', { className: 'wave-details-popup__section', style: { marginBottom: '12px' } },
                                React.createElement('div', { className: 'wave-details-popup__section-title', style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '🍽️ Факторы еды'),
                                React.createElement('div', { className: 'wave-details-popup__row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
                                    React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.gi || 0)),
                                ),
                                React.createElement('div', { className: 'wave-details-popup__row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
                                    React.createElement('span', { style: { fontWeight: 500, color: currentWave.gl < 10 ? '#22c55e' : currentWave.gl > 20 ? '#ef4444' : '#1f2937' } }, (currentWave.gl || 0).toFixed(1)),
                                ),
                                React.createElement('div', { className: 'wave-details-popup__row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
                                    React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.protein || 0) + 'г'),
                                ),
                                React.createElement('div', { className: 'wave-details-popup__row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
                                    React.createElement('span', { style: { fontWeight: 500, color: currentWave.fiber >= 5 ? '#22c55e' : '#1f2937' } }, Math.round(currentWave.fiber || 0) + 'г'),
                                ),
                                React.createElement('div', { className: 'wave-details-popup__row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
                                    React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.fat || 0) + 'г'),
                                ),
                                React.createElement('div', { className: 'wave-details-popup__row wave-details-popup__row--last', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
                                    React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.carbs || 0) + 'г'),
                                ),
                            ),

                            React.createElement('div', { className: 'wave-details-popup__section', style: { marginBottom: '12px' } },
                                React.createElement('div', { className: 'wave-details-popup__section-title', style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '⏰ Дневные факторы'),
                                React.createElement('div', { className: 'wave-details-popup__row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                    React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
                                    React.createElement('span', { style: { fontWeight: 500, color: currentWave.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, '×' + (currentWave.circadianMultiplier || 1).toFixed(2)),
                                ),
                                currentWave.activityBonus && currentWave.activityBonus !== 0 && React.createElement('div', { className: 'wave-details-popup__row wave-details-popup__row--last', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                    React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
                                    React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, (currentWave.activityBonus * 100).toFixed(0) + '%'),
                                ),
                            ),

                            React.createElement('button', {
                                className: 'wave-details-popup__action',
                                onClick: () => setShowWaveCalcPopup(false),
                                style: {
                                    width: '100%',
                                    background: '#3b82f6',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    marginTop: '8px',
                                },
                            }, 'Закрыть'),
                        )
                    );

                    return ReactDOM?.createPortal && global.document?.body
                        ? ReactDOM.createPortal(overlay, global.document.body)
                        : overlay;
                })(),
            ),
        );
    }, (prevProps, nextProps) => {
        if (prevProps.meal !== nextProps.meal) return false;
        if (prevProps.meal?.mealType !== nextProps.meal?.mealType) return false;
        if (prevProps.meal?.name !== nextProps.meal?.name) return false;
        if (prevProps.meal?.time !== nextProps.meal?.time) return false;
        if (prevProps.meal?.items?.length !== nextProps.meal?.items?.length) return false;
        if (prevProps.meal?.photos?.length !== nextProps.meal?.photos?.length) return false;
        if (prevProps.mealIndex !== nextProps.mealIndex) return false;
        if (prevProps.displayIndex !== nextProps.displayIndex) return false;
        if (prevProps.isExpanded !== nextProps.isExpanded) return false;
        if (prevProps.dayData?.steps !== nextProps.dayData?.steps) return false;
        if (prevProps.dayData?.householdMin !== nextProps.dayData?.householdMin) return false;
        if (prevProps.dayData?.trainings !== nextProps.dayData?.trainings) return false;
        if (prevProps.optimum !== nextProps.optimum) return false;
        return true;
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealCard = MealCard;

    // =========================
    // MealStickyBar — отдельный JS-bar поверх списка приёмов.
    // НЕ трогает DOM шапки приёмов (которая ломалась при попытке sticky).
    // Один fixed-bar сверху, IntersectionObserver-style scroll listener
    // определяет какой приём «активен» (его верх ушёл выше viewport y=100,
    // а низ ещё ниже) и подменяет содержимое бара.
    // =========================
    const STICKY_BAR_LINE = 130; // px от верха viewport (под .hdr с воздухом)

    function MealStickyBar({ day, pIndex, isMobile }) {
        const [currentIdx, setCurrentIdx] = React.useState(null);
        const rafRef = React.useRef(null);

        React.useEffect(() => {
            // Только мобильный — на десктопе не нужно (нет scroll problem).
            if (!isMobile) return undefined;

            const updateCurrent = () => {
                rafRef.current = null;
                const cards = document.querySelectorAll('.meal-card[data-meal-index]');
                let active = null;
                for (const card of cards) {
                    const rect = card.getBoundingClientRect();
                    // Карточка «активна» когда её верх прошёл sticky-линию,
                    // а низ ещё ниже линии (т.е. карточка пересекает y=100).
                    if (rect.top <= STICKY_BAR_LINE && rect.bottom > STICKY_BAR_LINE) {
                        active = parseInt(card.dataset.mealIndex, 10);
                    }
                }
                setCurrentIdx((prev) => (prev === active ? prev : active));
            };

            const onScroll = () => {
                if (rafRef.current != null) return;
                rafRef.current = requestAnimationFrame(updateCurrent);
            };

            window.addEventListener('scroll', onScroll, { passive: true });
            updateCurrent(); // initial check

            return () => {
                window.removeEventListener('scroll', onScroll);
                if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            };
        }, [isMobile, day?.meals?.length]);

        // Не рендерим вообще на десктопе.
        if (!isMobile) return null;

        const meals = day?.meals || [];
        const meal = currentIdx != null ? meals[currentIdx] : null;
        const visible = !!meal;

        let timeText = '';
        let typeText = '';
        let kcalText = '';
        let mealType = ''; // breakfast/lunch/dinner/snack1/snack2/snack3/night — для CSS-варианта
        if (meal) {
            // Используем канонический HEYS.dayUtils.getMealType (возвращает {type, name, icon}),
            // а не локальный getMealType из этого файла (тот возвращает старый формат
            // {type, label, emoji} → undefined undefined в баре).
            // Также учитываем ручной mealType юзера через MEAL_TYPES.
            const manualType = meal.mealType;
            const autoTypeInfo = U.getMealType
                ? U.getMealType(currentIdx, meal, meals, pIndex)
                : null;
            const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType]
                ? { type: manualType, ...U.MEAL_TYPES[manualType] }
                : (autoTypeInfo || { type: 'snack', name: 'Приём', icon: '🍽️' });
            const totals = (M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 });
            const kcal = Math.round(totals.kcal || 0);
            timeText = meal.time || '';
            typeText = (mealTypeInfo.icon || '🍽️') + ' ' + (mealTypeInfo.name || 'Приём');
            kcalText = kcal + ' ккал';
            mealType = mealTypeInfo.type || '';
        }

        const onClick = () => {
            if (currentIdx == null) return;
            const card = document.querySelector('.meal-card[data-meal-index="' + currentIdx + '"]');
            if (!card) return;
            const top = card.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: Math.max(0, top - STICKY_BAR_LINE), behavior: 'smooth' });
        };

        return React.createElement('div', {
            className: 'meal-sticky-bar'
                + (visible ? ' meal-sticky-bar--visible' : '')
                + (mealType ? ' meal-type-' + mealType : ''),
            onClick: visible ? onClick : undefined,
            role: visible ? 'button' : 'presentation',
            'aria-hidden': !visible,
            'aria-label': visible ? 'Перейти к началу: ' + typeText : undefined,
            title: visible ? 'Тап → к началу приёма' : undefined,
        },
            React.createElement('span', { className: 'meal-sticky-bar__time' }, timeText),
            React.createElement('span', { className: 'meal-sticky-bar__type' }, typeText),
            React.createElement('span', { className: 'meal-sticky-bar__kcal' }, kcalText),
        );
    }

    HEYS.dayComponents.MealStickyBar = MealStickyBar;

    // =========================
    // Meals list
    // =========================
    function renderMealsList(params) {
        const {
            sortedMealsForDisplay,
            baseDisplayIndex = 0,
            totalMealsCount = 0,
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
            openCopyMealModal,
            openMoveMealModal,
            saveAsPreset,
            repeatYesterdayMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            moveItem,
            copyItem,
            removePhoto,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params;

        if (!sortedMealsForDisplay || !Array.isArray(sortedMealsForDisplay)) {
            return [];
        }

        if (!MealCard) {
            trackError(new Error('[HEYS Day Meals] MealCard not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
            });
            return [];
        }

        const sourceMeals = Array.isArray(day?.meals) ? day.meals : [];
        const mealIndexById = new Map();
        for (let idx = 0; idx < sourceMeals.length; idx += 1) {
            const mealId = sourceMeals[idx]?.id;
            if (mealId) mealIndexById.set(mealId, idx);
        }
        const nowDate = new Date();
        const nowMinutes = (nowDate.getHours() * 60) + nowDate.getMinutes();

        return sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
            const absoluteDisplayIndex = baseDisplayIndex + displayIndex;
            const mi = mealIndexById.has(sortedMeal.id) ? mealIndexById.get(sortedMeal.id) : -1;
            if (mi === -1) {
                trackError(new Error('[HEYS Day Meals] meal not found in day.meals'), {
                    source: 'day/_meals.js',
                    type: 'missing_meal',
                    mealId: sortedMeal.id,
                });
                return null;
            }

            const meal = sourceMeals[mi];
            const isExpanded = isMealExpanded(mi, sourceMeals.length, sourceMeals, absoluteDisplayIndex);
            const sortedTotal = totalMealsCount > 0 ? totalMealsCount : sortedMealsForDisplay.length;
            const mealNumber = sortedTotal - absoluteDisplayIndex;
            const isFirst = absoluteDisplayIndex === 0;
            const isCurrentMeal = isFirst && !isMealStale(meal, nowMinutes);

            return React.createElement('div', {
                key: meal.id + '_' + (meal.mealType || 'auto'),
                className: 'meal-with-number',
                style: {
                    marginTop: isFirst ? '0' : '24px',
                },
            },
                React.createElement('div', {
                    className: 'meal-number-header',
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '6px',
                        gap: '4px',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-number-badge' + (isCurrentMeal ? ' meal-number-badge--current' : ''),
                        style: {
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isCurrentMeal
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            fontWeight: '700',
                            boxShadow: isCurrentMeal
                                ? '0 2px 8px rgba(34,197,94,0.35)'
                                : '0 2px 8px rgba(59,130,246,0.35)',
                        },
                    }, mealNumber),
                    React.createElement('span', {
                        className: 'meal-current-label',
                        style: {
                            fontSize: '14px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: isCurrentMeal ? '#22c55e' : '#3b82f6',
                            marginTop: '4px',
                        },
                    }, isCurrentMeal ? 'ТЕКУЩИЙ ПРИЁМ' : 'ПРИЁМ'),
                ),
                React.createElement(MealCard, {
                    meal,
                    mealIndex: mi,
                    displayIndex: absoluteDisplayIndex,
                    products,
                    pIndex,
                    date,
                    setDay,
                    isMobile,
                    isExpanded,
                    onToggleExpand: toggleMealExpand,
                    onChangeMealType: changeMealType,
                    onChangeTime: updateMealTime,
                    onChangeMood: changeMealMood,
                    onChangeWellbeing: changeMealWellbeing,
                    onChangeStress: changeMealStress,
                    onRemoveMeal: removeMeal,
                    onCopyMeal: openCopyMealModal,
                    onMoveMeal: openMoveMealModal,
                    onSaveAsPreset: saveAsPreset,
                    onRepeatYesterday: repeatYesterdayMeal,
                    openEditGramsModal,
                    openTimeEditor,
                    openMoodEditor,
                    setGrams,
                    removeItem,
                    moveItem,
                    copyItem,
                    removePhoto,
                    isMealStale,
                    allMeals: sourceMeals,
                    isNewItem,
                    optimum,
                    setMealQualityPopup,
                    addProductToMeal,
                    dayData: day,
                    profile: prof,
                    insulinWaveData,
                }),
            );
        });
    }

    function renderEmptyMealsState(params) {
        const { addMeal } = params;

        return React.createElement('div', {
            className: 'empty-meals-state',
            style: {
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
            },
        },
            React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🍽️'),
            React.createElement('div', { style: { fontSize: '18px', fontWeight: '600', marginBottom: '8px' } }, 'Нет приёмов пищи'),
            React.createElement('div', { style: { fontSize: '14px', marginBottom: '24px' } }, 'Добавь свой первый приём пищи'),
            addMeal && React.createElement('button', {
                className: 'button-primary',
                onClick: addMeal,
                style: {
                    padding: '12px 24px',
                    fontSize: '16px',
                },
            }, '➕ Добавить приём'),
        );
    }

    HEYS.dayMealsList = {
        renderMealsList,
        renderEmptyMealsState,
    };

    // =========================
    // Meals display (sorting + list)
    // =========================
    function useMealsDisplay(params) {
        const {
            day,
            safeMeals,
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
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            moveItem,
            copyItem,
            removePhoto,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params || {};

        if (!React) return { sortedMealsForDisplay: [], mealsUI: [] };

        const INITIAL_VISIBLE_MEALS = 8;
        const MEALS_RENDER_CHUNK_SIZE = 6;
        const MAX_RENDERED_MEALS_WINDOW = 24;

        const sortedMealsForDisplay = React.useMemo(() => {
            const meals = day?.meals || [];
            if (meals.length <= 1) return meals;
            const toMinutes = U?.timeToMinutes;
            const timeCache = new WeakMap();
            const getTime = (meal) => {
                if (!meal || !toMinutes) return null;
                if (timeCache.has(meal)) return timeCache.get(meal);
                const value = toMinutes(meal.time);
                timeCache.set(meal, value);
                return value;
            };
            const compareByTimeDesc = (a, b) => {
                const timeA = getTime(a);
                const timeB = getTime(b);
                if (timeA === null && timeB === null) return 0;
                if (timeA === null) return 1;
                if (timeB === null) return -1;
                return timeB - timeA;
            };

            let alreadySorted = true;
            for (let idx = 1; idx < meals.length; idx += 1) {
                if (compareByTimeDesc(meals[idx - 1], meals[idx]) > 0) {
                    alreadySorted = false;
                    break;
                }
            }
            if (alreadySorted) return meals;

            return [...meals].sort(compareByTimeDesc);
        }, [safeMeals]);

        const totalMeals = sortedMealsForDisplay.length;
        const [visibleMealsLimit, setVisibleMealsLimit] = React.useState(() => {
            if (totalMeals <= INITIAL_VISIBLE_MEALS) return totalMeals;
            return INITIAL_VISIBLE_MEALS;
        });
        const [showAllLoadedMeals, setShowAllLoadedMeals] = React.useState(false);
        const loadMoreAnchorRef = React.useRef(null);

        React.useEffect(() => {
            setVisibleMealsLimit((prev) => {
                if (totalMeals <= INITIAL_VISIBLE_MEALS) return totalMeals;
                if (prev >= totalMeals) return prev;
                return INITIAL_VISIBLE_MEALS;
            });
        }, [totalMeals]);

        const hasMoreMeals = visibleMealsLimit < totalMeals;
        const loadMoreMeals = React.useCallback(() => {
            setVisibleMealsLimit((prev) => Math.min(totalMeals, prev + MEALS_RENDER_CHUNK_SIZE));
        }, [totalMeals]);

        React.useEffect(() => {
            if (!hasMoreMeals) return undefined;
            const anchor = loadMoreAnchorRef.current;
            if (!anchor || typeof IntersectionObserver === 'undefined') return undefined;

            const observer = new IntersectionObserver((entries) => {
                if (!entries || entries.length === 0) return;
                if (entries[0].isIntersecting) {
                    loadMoreMeals();
                }
            }, {
                root: null,
                rootMargin: '0px 0px 480px 0px',
                threshold: 0.01,
            });

            observer.observe(anchor);
            return () => observer.disconnect();
        }, [hasMoreMeals, loadMoreMeals]);

        const visibleSortedMeals = React.useMemo(() => {
            if (visibleMealsLimit >= totalMeals) return sortedMealsForDisplay;
            return sortedMealsForDisplay.slice(0, visibleMealsLimit);
        }, [sortedMealsForDisplay, totalMeals, visibleMealsLimit]);

        const windowStartIndex = React.useMemo(() => {
            if (showAllLoadedMeals) return 0;
            return Math.max(0, visibleMealsLimit - MAX_RENDERED_MEALS_WINDOW);
        }, [showAllLoadedMeals, visibleMealsLimit]);

        const hiddenTopMealsCount = windowStartIndex;
        const windowedVisibleMeals = React.useMemo(() => {
            if (windowStartIndex <= 0) return visibleSortedMeals;
            return visibleSortedMeals.slice(windowStartIndex);
        }, [visibleSortedMeals, windowStartIndex]);

        const mealsUI = React.useMemo(() => {
            const baseMealsUI = HEYS.dayMealsList?.renderMealsList?.({
                sortedMealsForDisplay: windowedVisibleMeals,
                baseDisplayIndex: windowStartIndex,
                totalMealsCount: totalMeals,
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
                openCopyMealModal,
                openMoveMealModal,
                saveAsPreset,
                repeatYesterdayMeal,
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
            }) || [];
            const nextUi = [];

            if (hiddenTopMealsCount > 0) {
                nextUi.push(
                    React.createElement('div', {
                        key: 'meals-window-restore-top',
                        className: 'meals-window-restore-top',
                        style: {
                            display: 'flex',
                            justifyContent: 'center',
                            padding: '4px 0 10px',
                        },
                    },
                        React.createElement('button', {
                            type: 'button',
                            className: 'btn',
                            onClick: () => setShowAllLoadedMeals(true),
                            style: {
                                borderRadius: '12px',
                                padding: '8px 12px',
                                fontWeight: '600',
                            },
                        }, `Показать верхние ${hiddenTopMealsCount}`))
                );
            }

            nextUi.push(...baseMealsUI);

            if (!hasMoreMeals) return nextUi;

            return [
                ...nextUi,
                React.createElement('div', {
                    key: 'meals-load-more-anchor',
                    ref: loadMoreAnchorRef,
                    className: 'meals-load-more-anchor',
                    style: {
                        display: 'flex',
                        justifyContent: 'center',
                        padding: '10px 0 4px',
                    },
                },
                    React.createElement('button', {
                        type: 'button',
                        className: 'btn',
                        onClick: loadMoreMeals,
                        style: {
                            minWidth: '160px',
                            borderRadius: '12px',
                            padding: '10px 14px',
                            fontWeight: '600',
                        },
                    }, `Показать ещё (${Math.max(0, totalMeals - visibleMealsLimit)})`))
            ];
        }, [
            addProductToMeal,
            changeMealMood,
            changeMealStress,
            changeMealType,
            changeMealWellbeing,
            date,
            day,
            insulinWaveData,
            isMealExpanded,
            isMealStale,
            isMobile,
            isNewItem,
            openEditGramsModal,
            openMoodEditor,
            openTimeEditor,
            optimum,
            pIndex,
            products,
            prof,
            windowStartIndex,
            windowedVisibleMeals,
            hiddenTopMealsCount,
            hasMoreMeals,
            removeItem,
            moveItem,
            copyItem,
            removeMeal,
            openCopyMealModal,
            openMoveMealModal,
            saveAsPreset,
            repeatYesterdayMeal,
            loadMoreMeals,
            setShowAllLoadedMeals,
            setDay,
            setGrams,
            setMealQualityPopup,
            totalMeals,
            visibleMealsLimit,
            toggleMealExpand,
            updateMealTime,
        ]);

        return { sortedMealsForDisplay, mealsUI };
    }

    HEYS.dayMealsDisplay = {
        useMealsDisplay,
    };

    // =========================
    // Meals chart UI
    // =========================
    const MealsChartUI = {};
    MealsChartUI.renderMealsChart = function renderMealsChart({
        React,
        mealsChartData,
        statsVm,
        day,
        dayTot,
        normAbs,
        pIndex,
        getDailyNutrientColor,
        getDailyNutrientTooltip,
        mealChartHintShown,
        setMealChartHintShown,
        setShowConfetti,
        setMealQualityPopup,
        newMealAnimatingIndex,
        showFirstPerfectAchievement,
        U,
    }) {
        if (!mealsChartData || !mealsChartData.meals || mealsChartData.meals.length === 0) return null;

        const utils = U || HEYS.utils || {};

        return React.createElement('div', {
            className: 'meals-chart-container widget-shadow-diary-glass widget-outline-diary-glass',
            style: {
                margin: '0 0 var(--heys-diary-stack-gap, 12px) 0',
                padding: 'var(--heys-diary-card-padding, 14px 16px)',
                background: 'var(--surface, #fff)',
            },
        },
            React.createElement('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '4px',
                },
            },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', {
                        style: {
                            fontSize: 'var(--heys-diary-card-title-size, 14px)',
                            fontWeight: 'var(--heys-diary-card-title-weight, 600)',
                            color: 'var(--heys-diary-card-title-color, var(--text, #1e293b))',
                        },
                    }, 'Распределение'),
                    mealsChartData.avgQualityScore > 0 && React.createElement('span', {
                        className: 'meal-avg-score-badge',
                        style: {
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: mealsChartData.avgQualityScore >= 80 ? '#dcfce7' : mealsChartData.avgQualityScore >= 50 ? '#fef3c7' : '#fee2e2',
                            color: mealsChartData.avgQualityScore >= 80 ? '#166534' : mealsChartData.avgQualityScore >= 50 ? '#92400e' : '#991b1b',
                            fontWeight: '600',
                        },
                    }, 'средняя оценка ' + mealsChartData.avgQualityScore),
                    mealsChartData.yesterdayAvgScore > 0 && (() => {
                        const diff = mealsChartData.avgQualityScore - mealsChartData.yesterdayAvgScore;
                        if (Math.abs(diff) < 3) return null;
                        return React.createElement('span', {
                            style: {
                                fontSize: '10px',
                                color: diff > 0 ? '#16a34a' : '#dc2626',
                                fontWeight: '500',
                            },
                        }, diff > 0 ? '↑+' + diff : '↓' + diff);
                    })(),
                ),
            ),
            HEYS.dayDailySummary?.renderDailySummaryTable?.({
                React,
                day,
                pIndex,
                dayTot,
                normAbs,
                getDailyNutrientColor,
                getDailyNutrientTooltip,
            }),
            !mealChartHintShown && React.createElement('div', { className: 'meal-chart-hint' },
                React.createElement('span', null, '👆'),
                'Нажми на полоску для деталей',
            ),
            false && mealsChartData.meals.length > 1 && React.createElement('div', {
                className: 'meals-day-sparkline',
                style: {
                    position: 'relative',
                    height: '60px',
                    marginBottom: '12px',
                    padding: '8px 0 16px 0',
                },
            },
                (() => {
                    const meals = mealsChartData.meals;
                    const maxKcal = Math.max(...meals.map((m) => m.kcal), 200);
                    const svgW = 280;
                    const svgH = 40;
                    const padding = 10;

                    const parseTime = (t) => {
                        if (!t) return 0;
                        const [h, m] = t.split(':').map(Number);
                        return (h || 0) * 60 + (m || 0);
                    };

                    const times = meals.map((m) => parseTime(m.time)).filter((t) => t > 0);
                    const dataMinTime = times.length > 0 ? Math.min(...times) : 12 * 60;
                    const dataMaxTime = times.length > 0 ? Math.max(...times) : 20 * 60;
                    const minTime = dataMinTime - 30;
                    const maxTime = dataMaxTime + 30;
                    const timeRange = Math.max(maxTime - minTime, 60);

                    const bestIdx = mealsChartData.bestMealIndex;

                    const points = meals.map((m, idx) => {
                        const t = parseTime(m.time);
                        const x = padding + ((t - minTime) / timeRange) * (svgW - 2 * padding);
                        const y = svgH - padding - ((m.kcal / maxKcal) * (svgH - 2 * padding));
                        const r = 3 + Math.min(4, (m.kcal / 200));
                        const isBest = idx === bestIdx && m.quality && m.quality.score >= 70;
                        return { x, y, meal: m, idx, r, isBest };
                    }).sort((a, b) => a.x - b.x);

                    const linePath = points.length > 1
                        ? 'M ' + points.map((p) => `${p.x},${p.y}`).join(' L ')
                        : '';

                    const areaPath = points.length > 1
                        ? `M ${points[0].x},${svgH - padding} `
                        + points.map((p) => `L ${p.x},${p.y}`).join(' ')
                        + ` L ${points[points.length - 1].x},${svgH - padding} Z`
                        : '';

                    const yesterdayMeals = statsVm?.computed?.mealsChartMeta?.yesterdayMeals || [];
                    const yesterdayPath = (() => {
                        if (yesterdayMeals.length < 2) return '';
                        const yMaxKcal = Math.max(maxKcal, ...yesterdayMeals.map((p) => p.kcal));
                        const pts = yesterdayMeals.map((p) => {
                            const x = padding + ((p.t - minTime) / timeRange) * (svgW - 2 * padding);
                            const y = svgH - padding - ((p.kcal / yMaxKcal) * (svgH - 2 * padding));
                            return { x: Math.max(padding, Math.min(svgW - padding, x)), y };
                        }).sort((a, b) => a.x - b.x);
                        return 'M ' + pts.map((p) => `${p.x},${p.y}`).join(' L ');
                    })();

                    return React.createElement('svg', {
                        viewBox: `0 0 ${svgW} ${svgH + 12}`,
                        style: { width: '100%', height: '100%' },
                        preserveAspectRatio: 'xMidYMid meet',
                    },
                        React.createElement('defs', null,
                            React.createElement('linearGradient', { id: 'mealSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#10b981', stopOpacity: '0.3' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#10b981', stopOpacity: '0.05' }),
                            ),
                            React.createElement('linearGradient', { id: 'goodZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.02' }),
                            ),
                            React.createElement('linearGradient', { id: 'snackZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#eab308', stopOpacity: '0.08' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#eab308', stopOpacity: '0.01' }),
                            ),
                            React.createElement('linearGradient', { id: 'badZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: '0.02' }),
                            ),
                        ),
                        (() => {
                            const firstMealTime = times.length > 0 ? Math.min(...times) : 8 * 60;
                            const endOfDayMinutes = 27 * 60;
                            const slotDuration = (endOfDayMinutes - firstMealTime) / 6;

                            const zones = [
                                { start: firstMealTime - 30, end: firstMealTime + slotDuration * 0.3, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 0.8, end: firstMealTime + slotDuration * 1.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 2.8, end: firstMealTime + slotDuration * 3.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 4.5, end: endOfDayMinutes, gradient: 'url(#badZoneGrad)' },
                            ];

                            return zones.map((zone, i) => {
                                const x1 = padding + ((zone.start - minTime) / timeRange) * (svgW - 2 * padding);
                                const x2 = padding + ((zone.end - minTime) / timeRange) * (svgW - 2 * padding);
                                if (x2 < padding || x1 > svgW - padding) return null;
                                const clampedX1 = Math.max(padding, x1);
                                const clampedX2 = Math.min(svgW - padding, x2);
                                if (clampedX2 <= clampedX1) return null;
                                return React.createElement('rect', {
                                    key: 'zone-' + i,
                                    x: clampedX1,
                                    y: 0,
                                    width: clampedX2 - clampedX1,
                                    height: svgH,
                                    fill: zone.gradient,
                                    rx: 3,
                                });
                            });
                        })(),
                        yesterdayPath && React.createElement('path', {
                            d: yesterdayPath,
                            fill: 'none',
                            stroke: '#9ca3af',
                            strokeWidth: '1.5',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-yesterday',
                        }),
                        areaPath && React.createElement('path', {
                            d: areaPath,
                            fill: 'url(#mealSparkGrad)',
                            className: 'meal-sparkline-area',
                        }),
                        linePath && React.createElement('path', {
                            d: linePath,
                            fill: 'none',
                            stroke: '#10b981',
                            strokeWidth: '2',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-line',
                            style: { strokeDasharray: 500, strokeDashoffset: 500 },
                        }),
                        points.map((p, i) =>
                            React.createElement('g', {
                                key: i,
                                className: 'meal-sparkline-dot',
                                style: { '--dot-delay': (1 + i * 0.4) + 's' },
                            },
                                p.isBest && React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r + 4,
                                    fill: 'none',
                                    stroke: '#22c55e',
                                    strokeWidth: '2',
                                    opacity: 0.6,
                                    className: 'sparkline-pulse',
                                }),
                                React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r,
                                    fill: p.meal.quality ? p.meal.quality.color : '#10b981',
                                    stroke: p.isBest ? '#22c55e' : '#fff',
                                    strokeWidth: p.isBest ? 2 : 1.5,
                                    style: { cursor: 'pointer' },
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        const quality = p.meal.quality;
                                        if (!quality) return;
                                        const svg = e.target.closest('svg');
                                        const svgRect = svg.getBoundingClientRect();
                                        const viewBox = svg.viewBox.baseVal;
                                        const scaleX = svgRect.width / viewBox.width;
                                        const scaleY = svgRect.height / viewBox.height;
                                        const screenX = svgRect.left + p.x * scaleX;
                                        const screenY = svgRect.top + p.y * scaleY;
                                        if (!mealChartHintShown) {
                                            setMealChartHintShown(true);
                                            try {
                                                if (HEYS.store?.set) HEYS.store.set('heys_meal_hint_shown', '1');
                                                else if (utils.lsSet) utils.lsSet('heys_meal_hint_shown', '1');
                                                else localStorage.setItem('heys_meal_hint_shown', '1');
                                            } catch { }
                                        }
                                        if (quality.score >= 95) {
                                            setShowConfetti(true);
                                            setTimeout(() => setShowConfetti(false), 2000);
                                        }
                                        setMealQualityPopup({
                                            meal: p.meal,
                                            quality,
                                            mealTypeInfo: { label: p.meal.name, icon: p.meal.icon },
                                            x: screenX,
                                            y: screenY + 15,
                                        });
                                    },
                                }),
                            ),
                        ),
                        points.map((p, i) =>
                            React.createElement('text', {
                                key: 'time-' + i,
                                x: p.x,
                                y: svgH + 10,
                                fontSize: '8',
                                fill: '#9ca3af',
                                textAnchor: 'middle',
                            }, p.meal.time || ''),
                        ),
                    );
                })(),
            ),
            React.createElement('div', {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    position: 'relative',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(148,163,184,0.28)',
                },
            },
                React.createElement('div', {
                    className: 'meals-target-line',
                    style: {
                        position: 'absolute',
                        left: 'calc(100px + 100%)',
                        top: 0,
                        bottom: 0,
                        width: '0',
                        borderLeft: '2px dashed rgba(16, 185, 129, 0.4)',
                        pointerEvents: 'none',
                        zIndex: 1,
                    },
                }),
                mealsChartData.meals.map((meal, i) => {
                    const originalIndex = i;
                    const widthPct = mealsChartData.targetKcal > 0
                        ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
                        : 0;
                    const barWidthPct = widthPct > 0 && widthPct < 12 ? 12 : widthPct;
                    const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
                    const quality = meal.quality;
                    const isBest = mealsChartData.bestMealIndex === originalIndex && quality && quality.score >= 70;
                    const barFill = quality
                        ? `linear-gradient(90deg, ${quality.color} 0%, ${quality.color}cc 100%)`
                        : (isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)');
                    const problemBadges = quality?.badges?.filter((b) => !b.ok).slice(0, 3) || [];
                    const openQualityModal = (e) => {
                        if (!quality) return;
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (!mealChartHintShown) {
                            setMealChartHintShown(true);
                            try {
                                if (HEYS.store?.set) HEYS.store.set('heys_meal_hint_shown', '1');
                                else if (utils.lsSet) utils.lsSet('heys_meal_hint_shown', '1');
                                else localStorage.setItem('heys_meal_hint_shown', '1');
                            } catch { }
                        }
                        if (quality.score >= 95) {
                            setShowConfetti(true);
                            setTimeout(() => setShowConfetti(false), 2000);
                        }
                        setMealQualityPopup({
                            meal,
                            quality,
                            mealTypeInfo: { label: meal.name, icon: meal.icon },
                            x: rect.left + rect.width / 2,
                            y: rect.bottom,
                        });
                    };

                    const scrollToMealCard = (e) => {
                        e.stopPropagation();
                        try {
                            let target = null;
                            if (meal?.id) {
                                target = document.querySelector(`[data-meal-id="${meal.id}"]`);
                            }
                            if (!target && meal?.time) {
                                target = document.querySelector(`[data-meal-time="${meal.time}"]`);
                            }
                            if (!target && Number.isFinite(originalIndex)) {
                                target = document.querySelector(`[data-meal-index="${originalIndex}"]`);
                            }
                            if (target && typeof target.scrollIntoView === 'function') {
                                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        } catch (err) {
                            console.warn('[HEYS.day] ⚠️ Scroll to meal failed:', err?.message || err);
                        }
                    };

                    const isLowScore = quality && quality.score < 50;
                    const isNewMeal = newMealAnimatingIndex === originalIndex;
                    const qualityBadgeStyle = quality ? (
                        quality.score >= 80
                            ? { background: 'rgba(34, 197, 94, 0.14)', color: '#16a34a', borderColor: 'rgba(34, 197, 94, 0.28)' }
                            : quality.score >= 50
                                ? { background: 'rgba(245, 158, 11, 0.14)', color: '#b45309', borderColor: 'rgba(245, 158, 11, 0.28)' }
                                : { background: 'rgba(239, 68, 68, 0.14)', color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.28)' }
                    ) : null;
                    return React.createElement('div', {
                        key: i,
                        className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 4px',
                            marginLeft: '-6px',
                            marginRight: '-6px',
                            borderRadius: '6px',
                            background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            transition: 'background 0.2s ease',
                        },
                    },
                        meal.time && React.createElement('span', {
                            style: {
                                width: '46px',
                                fontSize: '11px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #374151)',
                                textAlign: 'left',
                                flexShrink: 0,
                            },
                        }, utils.formatMealTime ? utils.formatMealTime(meal.time) : meal.time),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                gap: '3px',
                                minWidth: '84px',
                                fontSize: '11px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #1e293b)',
                                flexShrink: 0,
                                textAlign: 'left',
                            },
                        },
                            React.createElement('span', { style: { fontSize: '14px' } }, meal.icon),
                            React.createElement('button', {
                                type: 'button',
                                onClick: scrollToMealCard,
                                title: 'Прокрутить к этому приёму',
                                style: {
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0',
                                    margin: '0',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    textAlign: 'left',
                                },
                            }, meal.name),
                        ),
                        React.createElement('div', {
                            className: 'meal-bar-container' + (isBest ? ' meal-bar-best' : '') + (quality && quality.score >= 80 ? ' meal-bar-excellent' : ''),
                            role: quality ? 'button' : undefined,
                            tabIndex: quality ? 0 : undefined,
                            onClick: openQualityModal,
                            onKeyDown: quality ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualityModal(); } } : undefined,
                            style: {
                                flex: 1,
                                minWidth: 0,
                                height: '18px',
                                background: 'var(--meal-bar-track, rgba(148,163,184,0.24))',
                                borderRadius: '4px',
                                overflow: 'visible',
                                position: 'relative',
                                cursor: quality ? 'pointer' : 'default',
                                boxShadow: isBest ? '0 0 0 2px #fbbf24, 0 2px 8px rgba(251,191,36,0.3)' : undefined,
                            },
                        },
                            React.createElement('div', {
                                style: {
                                    width: barWidthPct + '%',
                                    height: '100%',
                                    background: barFill,
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease',
                                },
                            }),
                            meal.kcal > 0 && React.createElement('span', {
                                style: {
                                    position: 'absolute',
                                    left: `calc(${barWidthPct}% + 6px)`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '9px',
                                    fontWeight: '600',
                                    color: 'var(--text-primary, #1f2937)',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                },
                            },
                                meal.kcal + ' ккал',
                                React.createElement('span', {
                                    style: {
                                        fontSize: '8px',
                                        color: 'var(--text-tertiary, #9ca3af)',
                                        fontWeight: '500',
                                    },
                                }, '(' + Math.round(widthPct) + '%)'),
                            ),
                            problemBadges.length > 0 && React.createElement('div', {
                                style: {
                                    position: 'absolute',
                                    right: '4px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    gap: '2px',
                                },
                            },
                                problemBadges.map((b, idx) =>
                                    React.createElement('span', {
                                        key: idx,
                                        style: {
                                            fontSize: '8px',
                                            padding: '1px 3px',
                                            borderRadius: '3px',
                                            background: 'rgba(239,68,68,0.9)',
                                            color: '#fff',
                                            fontWeight: '600',
                                        },
                                    }, '!' + b.type),
                                ),
                            ),
                        ),
                        quality && React.createElement('span', {
                            className: 'meal-quality-score',
                            style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: '46px',
                                padding: '2px 6px',
                                borderRadius: '999px',
                                border: `1px solid ${qualityBadgeStyle?.borderColor || 'rgba(148,163,184,0.25)'}`,
                                background: qualityBadgeStyle?.background || 'rgba(148,163,184,0.12)',
                                color: qualityBadgeStyle?.color || quality.color,
                                fontWeight: 700,
                                fontSize: '11px',
                                lineHeight: 1,
                                flexShrink: 0,
                            },
                        },
                            React.createElement('span', { style: { fontSize: '12px' } }, '⭐'),
                            React.createElement('span', null, String(quality.score)),
                        ),
                    );
                }),
                mealsChartData.qualityStreak >= 3 && React.createElement('div', { className: 'meal-quality-streak-banner' },
                    React.createElement('span', { className: 'streak-fire' }, '🔥'),
                    React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } }, mealsChartData.qualityStreak + ' отличных приёмов подряд!'),
                    React.createElement('span', { style: { fontSize: '16px' } }, '🏆'),
                ),
                showFirstPerfectAchievement && React.createElement('div', { className: 'first-perfect-meal-badge', style: { marginTop: '8px' } },
                    React.createElement('span', { className: 'trophy' }, '🏆'),
                    'Первый идеальный приём!',
                    React.createElement('span', null, '✨'),
                ),
            ),
        );
    };

    HEYS.dayMealsChartUI = MealsChartUI;

    // =========================
    // Meal expand state
    // =========================
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

        const isMealStale = React.useCallback((meal, nowMinutesOverride) => {
            if (!meal || !meal.time) return false;
            const [hours, minutes] = meal.time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return false;

            let nowMinutes = Number(nowMinutesOverride);
            if (!Number.isFinite(nowMinutes)) {
                const nowDate = new Date();
                nowMinutes = (nowDate.getHours() * 60) + nowDate.getMinutes();
            }

            const mealMinutes = (hours * 60) + minutes;
            const diffMinutes = nowMinutes - mealMinutes;
            return diffMinutes > 30;
        }, []);

        const toggleMealExpand = React.useCallback((mealIndex, meals) => {
            const meal = meals && meals[mealIndex];
            const isStale = meal && isMealStale(meal);

            // R17: defer heavy re-render from product list expand/collapse
            // 2026-05-28: drop React.startTransition — в курaторской сессии setter
            // discarded из-за deprioritization (как в advice, см. commit 65f8259c).
            // Кнопка «Показать N продукт» переставала реагировать на тап у курaтора.
            // setTimeout(0) сам по себе достаточен для defer'а тяжёлого re-render'а.
            setTimeout(() => {
                if (isStale) {
                    setManualExpandedStale((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                } else {
                    setExpandedMeals((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                }
            }, 0);
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

            if (expandedMeals.hasOwnProperty(mealIndex)) {
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
            isMealExpanded,
        };
    }

    HEYS.dayMealExpandState = {
        useMealExpandState,
    };

    // =========================
    // Meal handlers
    // =========================
    if (!HEYS.dayUtils) {
        trackError(new Error('[HEYS Day Meals] HEYS.dayUtils is required'), {
            source: 'day/_meals.js',
            type: 'missing_dependency',
        });
    }
    const { haptic, lsSet, lsGet, uid, timeToMinutes, MEAL_TYPES: MEAL_TYPES_HANDLER } = HEYS.dayUtils || {};

    function sortMealsByTime(meals) {
        if (!meals || meals.length <= 1) return meals;

        return [...meals].sort((a, b) => {
            const timeA = timeToMinutes ? timeToMinutes(a.time) : null;
            const timeB = timeToMinutes ? timeToMinutes(b.time) : null;

            if (timeA === null && timeB === null) return 0;
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            return timeB - timeA;
        });
    }

    function cloneItemsFromMeal(meal, itemIds, gramsOverrides) {
        const idsSet = new Set(itemIds);
        const go = gramsOverrides || {};
        return ((meal && meal.items) || [])
            .filter((it) => idsSet.has(it.id))
            .map((it) => {
                const g = Object.prototype.hasOwnProperty.call(go, it.id) ? go[it.id] : it.grams;
                return { ...it, id: uid('it_'), grams: g };
            });
    }

    function loadRecentMealsForDate(targetDate, daysBack, options) {
        if (!targetDate) return [];
        const back = Math.max(1, Math.min(7, +daysBack || 2));
        const includeEmpty = !!(options && options.includeEmpty);
        const parts = targetDate.split('-');
        if (parts.length !== 3) return [];
        const baseD = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        const labels = ['вчера', 'позавчера', '3 дня назад', '4 дня назад', '5 дней назад', '6 дней назад', '7 дней назад'];
        const out = [];
        const lsGetFn = (U && U.lsGet) || (() => null);
        for (let i = 1; i <= back; i++) {
            const d = new Date(baseD);
            d.setDate(d.getDate() - i);
            const dStr = d.getFullYear()
                + '-' + String(d.getMonth() + 1).padStart(2, '0')
                + '-' + String(d.getDate()).padStart(2, '0');
            try {
                const dayData = lsGetFn(_scopedDayKey(dStr), null);
                if (!dayData || !Array.isArray(dayData.meals)) continue;
                const label = labels[i - 1] || dStr;
                dayData.meals.forEach(m => {
                    if (!m) return;
                    if (!includeEmpty && !(m.items || []).length) return;
                    out.push({ dateStr: dStr, dateLabel: label, meal: m });
                });
            } catch (e) { /* ignore */ }
        }
        const toMins = (U && U.timeToMinutes) || ((t) => {
            if (!t) return -1;
            const p = (t || '').split(':');
            return p.length >= 2 ? +p[0] * 60 + +p[1] : -1;
        });
        out.sort((a, b) => {
            if (a.dateStr !== b.dateStr) return a.dateStr < b.dateStr ? 1 : -1;
            return (toMins(b.meal.time) || 0) - (toMins(a.meal.time) || 0);
        });
        return out;
    }

    function findYesterdayEquivalent(todayMeal, yesterdayMeals) {
        if (!yesterdayMeals || !yesterdayMeals.length) return null;
        const withItems = yesterdayMeals.filter(m => m && (m.items || []).length > 0);
        if (!withItems.length) return null;
        if (todayMeal && todayMeal.mealType) {
            const m = withItems.find(ym => ym.mealType === todayMeal.mealType);
            if (m) return m;
        }
        if (todayMeal && todayMeal.name) {
            const name = todayMeal.name.toLowerCase().trim();
            const m = withItems.find(ym => ym.name && ym.name.toLowerCase().trim() === name);
            if (m) return m;
        }
        const toMins = (U && U.timeToMinutes) || ((t) => {
            if (!t) return null;
            const p = t.split(':');
            return p.length >= 2 ? +p[0] * 60 + +p[1] : null;
        });
        if (todayMeal && todayMeal.time) {
            const todayMins = toMins(todayMeal.time);
            if (todayMins !== null) {
                let best = null;
                let bestDiff = Infinity;
                withItems.forEach(ym => {
                    const ymMins = toMins(ym.time);
                    if (ymMins === null) return;
                    const diff = Math.abs(ymMins - todayMins);
                    if (diff < bestDiff) { bestDiff = diff; best = ym; }
                });
                if (best && bestDiff <= 120) return best;
            }
        }
        return null;
    }

    function createMealHandlers(deps) {
        const {
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
            scrollToDiaryHeading,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            newItemIds,
            setNewItemIds,
        } = deps;

        // PERF NEW-3: dayRef стабилизирует callbacks которые читают `day` для validation/undo metadata.
        // Раньше: `day` в deps useCallback'ов → callback recreates каждый render → MealCard.memo
        // bypass'ится → все meal cards re-render даже при unchanged data.
        // Теперь: ref обновляется на каждый render, но идентичность callbacks стабильна.
        const dayRef = React.useRef(day);
        dayRef.current = day;

        const persistDayData = React.useCallback((nextDayData, action = 'save_day') => {
            const key = _scopedDayKey(date);
            const _mCnt = Array.isArray(nextDayData?.meals) ? nextDayData.meals.length : '?';
            const _iCnt = Array.isArray(nextDayData?.meals) ? nextDayData.meals.reduce((s, m) => s + (m.items?.length || 0), 0) : '?';
            try {
                console.info('[HEYS.syncTrace] PERSIST_DAY', { key, action, meals: _mCnt, items: _iCnt, updatedAt: nextDayData?.updatedAt });
                lsSet(key, nextDayData);
            } catch (e) {
                trackError(e, { source: 'day/_meals.js', action });
            }
        }, [date]);

        const markUndoWindow = React.useCallback((durationMs = 5000) => {
            const updatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = updatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = updatedAt + durationMs;
            return updatedAt;
        }, [lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const recalculateOrphanProducts = React.useCallback(() => {
            setTimeout(() => {
                if (window.HEYS?.orphanProducts?.recalculate) {
                    window.HEYS.orphanProducts.recalculate();
                }
            }, 100);
        }, []);

        const runUndoableDayMutation = React.useCallback((opts) => {
            if (!opts || typeof opts.applyMutation !== 'function' || typeof opts.undoMutation !== 'function') {
                return false;
            }

            if (HEYS.Undo?.runAction) {
                return HEYS.Undo.runAction({
                    label: opts.label,
                    duration: opts.duration,
                    errorMessage: opts.errorMessage,
                    apply: opts.applyMutation,
                    undo: opts.undoMutation,
                    onExpire: opts.onExpire,
                    onApplyError: (error) => {
                        trackError(error, {
                            source: 'day/_meals.js',
                            action: opts.errorAction || 'undoable_day_mutation'
                        });
                    },
                });
            }

            let context;
            try {
                context = opts.applyMutation();
            } catch (error) {
                trackError(error, {
                    source: 'day/_meals.js',
                    action: opts.errorAction || 'undoable_day_mutation'
                });
                if (opts.errorMessage) HEYS.Toast?.error(opts.errorMessage);
                return false;
            }

            if (context === false) return false;

            if (HEYS.Undo) {
                HEYS.Undo.push({
                    label: opts.label,
                    duration: opts.duration,
                    context,
                    onUndo: () => opts.undoMutation(context),
                    onExpire: (reason) => opts.onExpire?.(reason, context),
                });
            }

            return context;
        }, []);

        const addMeal = React.useCallback(async () => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление приёма пищи недоступно');
                return;
            }

            if (isMobile && HEYS.MealStep) {
                HEYS.MealStep.showAddMeal({
                    dateKey: date,
                    meals: day.meals,
                    pIndex,
                    getProductFromItem,
                    trainings: day.trainings || [],
                    deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
                    prof,
                    dayData: day,
                    onComplete: (newMeal) => {
                        const newMealId = newMeal.id;
                        const newUpdatedAt = Date.now();
                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        const baseDay = dayRef.current || {};
                        const newMeals = sortMealsByTime([...(baseDay.meals || []), newMeal]);
                        const newDayData = { ...baseDay, meals: newMeals, updatedAt: newUpdatedAt };
                        const key = _scopedDayKey(date);
                        try {
                            lsSet(key, newDayData);
                        } catch (e) {
                            trackError(e, { source: 'day/_meals.js', action: 'save_meal' });
                        }
                        setDay(() => newDayData);

                        if (window.HEYS && window.HEYS.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-created');
                        }
                        HEYS.Toast?.success('Приём создан');
                        window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));

                        // 📝 Event log (Ticket N): meal-add — UI emit for activity reports
                        try {
                            window.HEYS?.eventLog?.write(
                                'meal-add',
                                `meal=${newMeal.name || 'unnamed'} для ${date}`,
                                { dateKey: date, mealName: newMeal.name || '', count: 1 },
                                'addMeal_mobile_flow'
                            );
                        } catch (_) { /* noop */ }

                        // 🆕 Стабильный флоу: lazy-вычисление индекса через HEYS.Day, retry через rAF
                        const savedMealName = (newMeal.name || '').toLowerCase();

                        const findMealIndex = () => {
                            const currentDay = HEYS.Day?.getDay?.();
                            if (!currentDay?.meals) return -1;
                            return currentDay.meals.findIndex((m) => m.id === newMealId);
                        };

                        const showFlowModal = (attempt) => {
                            const maxAttempts = 5;
                            const mealIndex = findMealIndex();

                            if (mealIndex < 0) {
                                if (attempt < maxAttempts) {
                                    // Retry: React ещё не применил state update
                                    requestAnimationFrame(() => showFlowModal(attempt + 1));
                                    return;
                                }
                                console.warn('[HEYS.Day] ⚠️ Flow modal skipped: meal not found after', maxAttempts, 'attempts', { newMealId });
                                return;
                            }

                            expandOnlyMeal(mealIndex);
                            const mealName = savedMealName || `приём ${mealIndex + 1}`;

                            // Функция открытия модалки добавления продукта
                            const openAddProductModal = (targetMealIndex, multiProductMode, dayOverride, autoRepeatCount) => {
                                if (!window.HEYS?.AddProductStep?.show) return;

                                window.HEYS.AddProductStep.show({
                                    mealIndex: targetMealIndex,
                                    multiProductMode: multiProductMode,
                                    autoRepeatCount: autoRepeatCount || 0, // 🆕 «Подряд N продуктов»
                                    products: products,
                                    day: dayOverride || HEYS.Day?.getDay?.() || day,
                                    dateKey: date,
                                    onAdd: ({ product, grams, mealIndex: addMealIndex }) => {
                                        let finalProduct = product;
                                        if (product?._fromShared || product?._source === 'shared' || product?.is_shared) {
                                            const cloned = HEYS.products?.addFromShared?.(product);
                                            if (cloned) {
                                                finalProduct = cloned;
                                            }
                                        }

                                        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
                                        // 🆕 v2.8.2: Трекаем использование для сортировки по популярности
                                        HEYS?.SmartSearchWithTypos?.trackProductUsage?.(String(productId));
                                        console.info('[HEYS.search] ✅ Product usage tracked:', { productId: String(productId), name: finalProduct.name });
                                        const computeTEFKcal100 = (p) => {
                                            const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
                                            const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
                                            return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
                                        };
                                        const newItem = {
                                            id: uid('it_'),
                                            product_id: finalProduct.id ?? finalProduct.product_id,
                                            name: finalProduct.name,
                                            grams: grams || 100,
                                            ...(finalProduct.kcal100 !== undefined && {
                                                kcal100: computeTEFKcal100(finalProduct),
                                                protein100: finalProduct.protein100,
                                                carbs100: finalProduct.carbs100,
                                                fat100: finalProduct.fat100,
                                                simple100: finalProduct.simple100,
                                                complex100: finalProduct.complex100,
                                                badFat100: finalProduct.badFat100,
                                                goodFat100: finalProduct.goodFat100,
                                                trans100: finalProduct.trans100,
                                                fiber100: finalProduct.fiber100,
                                                gi: finalProduct.gi,
                                                harm: HEYS.models?.normalizeHarm?.(finalProduct),  // Canonical harm field
                                            }),
                                        };

                                        const newUpdatedAt = Date.now();
                                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                                        console.info('[HEYS.meal] ➕ Adding product to meal', {
                                            product: finalProduct.name,
                                            productId: String(productId),
                                            grams,
                                            mealIndex: addMealIndex,
                                            dateKey: date,
                                            updatedAt: newUpdatedAt,
                                            blockUntilTs: newUpdatedAt + 3000,
                                        });

                                        // 2026-05-29 anti-loop: pre-compute + persist outside setDay reducer,
                                        // см. fix(day) f23aa6a2 + commit для остальных reducer'ов в этом файле.
                                        const baseDay = dayRef.current || {};
                                        const updatedMeals = (baseDay.meals || []).map((m, i) =>
                                            i === addMealIndex
                                                ? { ...m, items: [...(m.items || []), newItem] }
                                                : m,
                                        );
                                        const newDayData = { ...baseDay, meals: updatedMeals, updatedAt: newUpdatedAt };

                                        const key = _scopedDayKey(date);
                                        const prevMealItems = ((baseDay?.meals || [])[addMealIndex]?.items || []).length;
                                        try {
                                            lsSet(key, newDayData);
                                            console.info('[HEYS.meal] ✅ Product saved to localStorage', {
                                                product: finalProduct.name,
                                                key,
                                                mealIndex: addMealIndex,
                                                itemsInMeal: prevMealItems + 1,
                                                totalMeals: updatedMeals.length,
                                                updatedAt: newUpdatedAt,
                                            });
                                        } catch (e) {
                                            console.error('[HEYS.meal] ❌ Product lsSet failed', {
                                                product: finalProduct.name,
                                                key,
                                                error: String(e),
                                            });
                                            trackError(e, { source: 'day/_meals.js', action: 'save_product' });
                                        }

                                        setDay(() => newDayData);

                                        try { navigator.vibrate?.(10); } catch (e) { }
                                        window.dispatchEvent(new CustomEvent('heysProductAdded', { detail: { product: finalProduct, grams } }));
                                        try {
                                            lsSet(`heys_last_grams_${productId}`, grams);
                                            const history = lsGet('heys_grams_history', {});
                                            if (!history[productId]) history[productId] = [];
                                            history[productId].push(grams);
                                            if (history[productId].length > 20) history[productId].shift();
                                            lsSet('heys_grams_history', history);
                                        } catch (e) { }
                                        // 🆕 autoRepeat: молчаливое повторение N раз — пропускаем summary, AddProductStep сам делает goToStep(0)
                                        if (autoRepeatCount && autoRepeatCount > 1) {
                                            if (scrollToDiaryHeading) scrollToDiaryHeading();
                                            return;
                                        }
                                        if (multiProductMode && HEYS.dayAddProductSummary?.show) {
                                            // Build updated day inline: setDay is async and
                                            // HEYS.Day.getDay() (dayRef.current) won't reflect
                                            // the new item yet at this point.
                                            const baseDayForSummary = dayOverride || HEYS.Day?.getDay?.() || day || {};
                                            const srcMeals = baseDayForSummary.meals || [];
                                            const mealsWithNewItem = srcMeals.map((m, i) =>
                                                i === addMealIndex
                                                    ? { ...m, items: [...(m.items || []), newItem] }
                                                    : m
                                            );
                                            if (addMealIndex >= srcMeals.length) {
                                                while (mealsWithNewItem.length < addMealIndex) {
                                                    mealsWithNewItem.push({ items: [] });
                                                }
                                                mealsWithNewItem[addMealIndex] = { items: [newItem] };
                                            }
                                            const updatedDayForSummary = { ...baseDayForSummary, meals: mealsWithNewItem, updatedAt: newUpdatedAt };

                                            if (HEYS.StepModal?.hide) {
                                                HEYS.StepModal.hide({ scrollToDiary: false });
                                            }

                                            requestAnimationFrame(() => {
                                                setTimeout(() => {
                                                    HEYS.dayAddProductSummary.show({
                                                        day: updatedDayForSummary,
                                                        mealIndex: addMealIndex,
                                                        pIndex,
                                                        getProductFromItem,
                                                        per100,
                                                        scale,
                                                        onAddMore: (updatedDay, autoRepeatCount) => openAddProductModal(addMealIndex, true, updatedDay, autoRepeatCount || 0),
                                                        onAddLast: (updatedDay) => openAddProductModal(addMealIndex, false, updatedDay),
                                                    });
                                                }, 100);
                                            });
                                        }
                                        if (scrollToDiaryHeading) scrollToDiaryHeading();
                                    },
                                    onNewProduct: () => {
                                        if (window.HEYS?.products?.showAddModal) {
                                            window.HEYS.products.showAddModal();
                                        }
                                    },
                                });
                            };

                            // Показываем модалку выбора флоу
                            if (!window.HEYS?.ConfirmModal?.show) {
                                // Fallback: сразу открываем быстрый режим
                                openAddProductModal(mealIndex, false);
                                return;
                            }

                            // Подгружаем недавние приёмы — для опциональной кнопки «Повторить из недавних».
                            // Только когда новый приём ещё пуст и у нас есть что предложить за последние 2 дня.
                            const currentMealForFlow = HEYS.Day?.getDay?.()?.meals?.[mealIndex];
                            const newMealIsEmpty = !((currentMealForFlow?.items || []).length);
                            const recentMealsForFlow = newMealIsEmpty ? loadRecentMealsForDate(date, 2) : [];

                            const handleFlowRepeatRecent = () => {
                                window.HEYS.ConfirmModal.hide();
                                const actualIdx = findMealIndex();
                                if (actualIdx < 0) return;
                                const fresh = loadRecentMealsForDate(date, 2);
                                if (!fresh.length) {
                                    HEYS.Toast?.info?.('За последние 2 дня нет приёмов с продуктами');
                                    return;
                                }
                                if (!HEYS.CopyMealModal?.showRecentList) return;
                                setTimeout(() => {
                                    HEYS.CopyMealModal.showRecentList({
                                        recentEntries: fresh,
                                        onPick: (pickedMeal) => {
                                            if (!pickedMeal || !(pickedMeal.items || []).length) return;
                                            const cloned = pickedMeal.items.map(it => ({ ...it, id: uid('it_') }));
                                            markUndoWindow(3000);
                                            const baseDay = dayRef.current || {};
                                            const newMeals = (baseDay.meals || []).map((m, i) =>
                                                i === actualIdx ? { ...m, items: [...(m.items || []), ...cloned] } : m
                                            );
                                            const updated = { ...baseDay, meals: newMeals, updatedAt: Date.now() };
                                            persistDayData(updated, 'flow_repeat_recent_meal');
                                            setDay(() => updated);
                                            HEYS.Toast?.success?.(`Скопировано продуктов: ${cloned.length}`);
                                        },
                                    });
                                }, 100);
                            };

                            window.HEYS.ConfirmModal.show({
                                icon: '🍽️',
                                title: `Добавить продукты в ${mealName}`,
                                text: React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        margin: '8px 0'
                                    }
                                },
                                    // Кнопка "↩ Повторить приём из недавних" — фиолетовый, только если есть недавние и приём пуст
                                    recentMealsForFlow.length > 0 && React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--repeat-recent',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: 'none',
                                            borderRadius: '12px',
                                            background: '#6366f1',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: handleFlowRepeatRecent
                                    },
                                        React.createElement('span', { style: { fontSize: '28px' } }, '↩'),
                                        React.createElement('div', { style: { flex: 1 } },
                                            React.createElement('div', {
                                                style: { fontWeight: '700', color: '#ffffff', fontSize: '15px' }
                                            }, 'Повторить приём из недавних'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }
                                            }, 'Скопировать продукты из приёма за последние 2 дня')
                                        )
                                    ),
                                    // Кнопка "Быстро добавить 1 продукт" — синий primary fill (как в summary)
                                    React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--quick',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: 'none',
                                            borderRadius: '12px',
                                            background: '#3b82f6',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: () => {
                                            window.HEYS.ConfirmModal.hide();
                                            const actualIdx = findMealIndex();
                                            if (actualIdx >= 0) {
                                                setTimeout(() => openAddProductModal(actualIdx, false), 100);
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            style: { fontSize: '28px' }
                                        }, '➕'),
                                        React.createElement('div', {
                                            style: { flex: 1 }
                                        },
                                            React.createElement('div', {
                                                style: { fontWeight: '700', color: '#ffffff', fontSize: '15px' }
                                            }, 'Быстро добавить 1 продукт'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }
                                            }, 'Выбрать продукт и сразу закрыть')
                                        )
                                    ),
                                    // Кнопка "Добавить несколько продуктов" — зелёный success fill (как в summary)
                                    React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--multi',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: 'none',
                                            borderRadius: '12px',
                                            background: '#22c55e',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: () => {
                                            window.HEYS.ConfirmModal.hide();
                                            const actualIdx = findMealIndex();
                                            if (actualIdx >= 0) {
                                                setTimeout(() => openAddProductModal(actualIdx, true), 100);
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            style: { fontSize: '28px' }
                                        }, '📝'),
                                        React.createElement('div', {
                                            style: { flex: 1 }
                                        },
                                            React.createElement('div', {
                                                style: { fontWeight: '700', color: '#ffffff', fontSize: '15px' }
                                            }, 'Добавить несколько продуктов'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: 'rgba(255,255,255,0.9)', marginTop: '2px' }
                                            }, 'Формировать приём пошагово')
                                        )
                                    ),
                                    // 🆕 Кнопки «Добавить 2/3/4» — без промежуточной summary-модалки
                                    React.createElement('div', {
                                        style: { display: 'flex', gap: '8px', marginTop: '4px' }
                                    },
                                        [2, 3, 4].map(n => React.createElement('button', {
                                            key: `repeat-${n}`,
                                            className: 'flow-selection-btn flow-selection-btn--repeat',
                                            style: {
                                                flex: 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '12px 8px',
                                                border: '1px solid #86efac',
                                                borderRadius: '12px',
                                                background: '#dcfce7',
                                                color: '#14532d',
                                                fontSize: '15px',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            },
                                            onClick: () => {
                                                window.HEYS.ConfirmModal.hide();
                                                const actualIdx = findMealIndex();
                                                if (actualIdx >= 0) {
                                                    setTimeout(() => openAddProductModal(actualIdx, true, undefined, n), 100);
                                                }
                                            }
                                        }, `Добавить ${n}`))
                                    )
                                ),
                                // Скрываем стандартную кнопку confirm — используем кастомные внутри text
                                confirmText: '',
                                cancelText: 'Отмена',
                                cancelStyle: 'primary',
                                cancelVariant: 'outline'
                            });
                        };

                        // Запускаем через rAF — ждём пока React применит state update
                        requestAnimationFrame(() => showFlowModal(1));
                    },
                });
            } else if (isMobile) {
                if (openTimePickerForNewMeal) openTimePickerForNewMeal();
            } else {
                const newMealId = uid('m_');
                const newMeal = { id: newMealId, name: 'Приём', time: '', mood: '', wellbeing: '', stress: '', items: [] };
                const newUpdatedAt = Date.now();
                let newMealIndex = 0;
                if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
                const baseDay = dayRef.current || {};
                const baseMeals = baseDay.meals || [];
                const newMeals = [...baseMeals, newMeal];
                newMealIndex = newMeals.length - 1;
                const newDayData = { ...baseDay, meals: newMeals, updatedAt: newUpdatedAt };
                const key = _scopedDayKey(date);
                try {
                    lsSet(key, newDayData);
                } catch (e) {
                    trackError(e, { source: 'day/_meals.js', action: 'save_meal_desktop' });
                }
                setDay(() => newDayData);
                expandOnlyMeal(newMealIndex);
                if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('meal-created');
                }
                HEYS.Toast?.success('Приём создан');
                window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));

                // 📝 Event log (Ticket N): meal-add — UI emit for activity reports
                try {
                    window.HEYS?.eventLog?.write(
                        'meal-add',
                        `meal=${newMeal.name || 'unnamed'} для ${date}`,
                        { dateKey: date, mealName: newMeal.name || '', count: 1 },
                        'addMeal_desktop'
                    );
                } catch (_) { /* noop */ }
            }
        }, [date, expandOnlyMeal, isMobile, openTimePickerForNewMeal, products, setDay, day, prof, pIndex, getProductFromItem, scrollToDiaryHeading, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const replanEmitTimersRef = React.useRef({});

        const emitPlannerReplanRequest = React.useCallback((reason, meta = {}) => {
            window.dispatchEvent(new CustomEvent('heys:planner-replan-request', {
                detail: {
                    reason,
                    source: 'day/_meals',
                    at: Date.now(),
                    ...meta,
                },
            }));
        }, []);

        const emitPlannerReplanRequestDebounced = React.useCallback((reason, meta = {}, waitMs = 260) => {
            const key = `${reason}:${meta?.mealIndex ?? 'na'}:${meta?.itemId ?? 'na'}`;
            const timers = replanEmitTimersRef.current || {};
            if (timers[key]) clearTimeout(timers[key]);
            timers[key] = setTimeout(() => {
                emitPlannerReplanRequest(reason, meta);
                delete timers[key];
            }, waitMs);
            replanEmitTimersRef.current = timers;
        }, [emitPlannerReplanRequest]);

        React.useEffect(() => () => {
            const timers = replanEmitTimersRef.current || {};
            Object.keys(timers).forEach((key) => clearTimeout(timers[key]));
            replanEmitTimersRef.current = {};
        }, []);

        const updateMealTime = React.useCallback((mealIndex, newTime) => {
            setDay((prevDay) => {
                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, time: newTime } : m,
                );
                const sortedMeals = sortMealsByTime(updatedMeals);
                return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
            });
            emitPlannerReplanRequest('MEAL_TIME_UPDATED', { mealIndex, newTime });
        }, [setDay, emitPlannerReplanRequest]);

        const removeMeal = React.useCallback(async (i) => {
            const mealToRemove = dayRef.current.meals?.[i];
            if (!mealToRemove) return;

            const confirmed = await HEYS.ConfirmModal?.confirmDelete?.({
                icon: '🗑️',
                title: 'Удалить приём пищи?',
                text: 'Приём исчезнет сразу, но его можно будет быстро вернуть через кнопку «Отменить».',
            });

            if (confirmed === false) return;

            const mealName = mealToRemove?.name || 'Приём пищи';
            const mealId = mealToRemove.id;

            haptic('medium');

            runUndoableDayMutation({
                label: mealName + ' удалён',
                duration: 4000,
                errorMessage: 'Не удалось удалить приём пищи',
                errorAction: 'remove_meal',
                applyMutation: () => {
                    const removedUpdatedAt = markUndoWindow(5000);

                    const baseDay = dayRef.current || {};
                    const meals = (baseDay.meals || []).filter((meal) => meal.id !== mealId);
                    const nextDayData = { ...baseDay, meals, updatedAt: removedUpdatedAt };
                    persistDayData(nextDayData, 'remove_meal');
                    setDay(() => nextDayData);

                    return { mealId, mealToRemove, insertIndex: i };
                },
                undoMutation: ({ mealId: ctxMealId, mealToRemove: ctxMeal, insertIndex }) => {
                    const undoUpdatedAt = markUndoWindow(3000);
                    const baseDay = dayRef.current || {};
                    const baseMeals = baseDay.meals || [];
                    if (baseMeals.some((meal) => meal.id === ctxMealId)) {
                        return;
                    }
                    const meals = [...baseMeals];
                    meals.splice(Math.max(0, Math.min(insertIndex, meals.length)), 0, ctxMeal);
                    const restoredMeals = sortMealsByTime(meals);
                    const nextDayData = { ...baseDay, meals: restoredMeals, updatedAt: undoUpdatedAt };
                    persistDayData(nextDayData, 'undo_remove_meal');
                    setDay(() => nextDayData);
                },
            });
        }, [haptic, setDay, markUndoWindow, persistDayData, runUndoableDayMutation]);

        const addProductToMeal = React.useCallback((mi, p) => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление продуктов недоступно');
                return;
            }

            haptic('light');

            // 🔬 [HEYS.day-trace] 1/8 entry — what we're trying to add and to which meal.
            try {
                console.info('[HEYS.day-trace] 1/8 addProductToMeal entry', {
                    date,
                    mealIndex: mi,
                    productSource: p?._source || (p?._fromShared ? 'shared' : 'personal'),
                    productId: p?.id ?? p?.product_id ?? null,
                    productName: p?.name || null,
                    productKcal100: p?.kcal100,
                    gramsHint: p?.grams,
                });
            } catch (_) { /* noop */ }

            let finalProduct = p;
            if (p?._fromShared || p?._source === 'shared' || p?.is_shared) {
                const cloned = HEYS.products?.addFromShared?.(p);
                if (cloned) {
                    finalProduct = cloned;
                    try {
                        console.info('[HEYS.day-trace] 2/8 cloned from shared', {
                            originalId: p?.id,
                            clonedId: cloned?.id,
                            name: cloned?.name,
                        });
                    } catch (_) { /* noop */ }
                }
            }

            // Use centralized harm normalization
            const harmVal = HEYS.models?.normalizeHarm?.(finalProduct);

            const item = {
                id: uid('it_'),
                product_id: finalProduct.id ?? finalProduct.product_id,
                name: finalProduct.name,
                grams: finalProduct.grams || 100,
                kcal100: finalProduct.kcal100,
                protein100: finalProduct.protein100,
                fat100: finalProduct.fat100,
                simple100: finalProduct.simple100,
                complex100: finalProduct.complex100,
                badFat100: finalProduct.badFat100,
                goodFat100: finalProduct.goodFat100,
                trans100: finalProduct.trans100,
                fiber100: finalProduct.fiber100,
                gi: finalProduct.gi ?? finalProduct.gi100,
                harm: harmVal,  // Normalized harm (0-10)
            };
            // 🔬 [HEYS.day-trace] 3/8 item built — final shape going into the meal.
            try {
                console.info('[HEYS.day-trace] 3/8 item built', {
                    itemId: item.id,
                    product_id: item.product_id,
                    name: item.name,
                    grams: item.grams,
                    kcal100: item.kcal100,
                    hasInline: item.kcal100 != null && item.protein100 != null,
                });
            } catch (_) { /* noop */ }
            const newUpdatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
            // 2026-05-29 bug fix: ранее использовался dayRef.current — может отставать
            // от LS state после быстрой последовательности «create meal → add product»
            // (React не commit'ил setDay → dayRef.current stale → mealsList без новой
            // meal → mealIndex для свежей meal out-of-bounds → продукт молча терялся
            // или mapping коlapse'ил на wrong index). Читаем live snapshot из LS
            // (canonical source of truth между actions). Bounds-check предотвращает
            // запись поломанного state.
            const key = _scopedDayKey(date);
            let baseDay = {};
            try {
                baseDay = (HEYS.utils && typeof HEYS.utils.lsGet === 'function')
                    ? (HEYS.utils.lsGet(key, {}) || {})
                    : (dayRef.current || {});
            } catch (_) { baseDay = dayRef.current || {}; }
            const mealsList = (baseDay && baseDay.meals) || [];
            if (!mealsList[mi]) {
                console.warn('[HEYS.day] ❌ Meal index out-of-bounds for addProductToMeal — aborting (state race?)', {
                    mealIndex: mi,
                    mealsCount: mealsList.length,
                    productName: finalProduct?.name || null,
                    baseDayUpdatedAt: baseDay?.updatedAt || null,
                });
                if (HEYS.Toast?.error) HEYS.Toast.error('Не удалось добавить — приём не найден, попробуй ещё раз');
                return;
            }
            const before = (mealsList[mi]?.items || []).length;
            const meals = mealsList.map((m, i) => i === mi ? { ...m, items: [...(m.items || []), item] } : m);
            const newDayData = { ...baseDay, meals, updatedAt: newUpdatedAt };
            try {
                console.info('[HEYS.day-trace] 4/8 setDay applied', {
                    date: baseDay.date,
                    key,
                    mealIndex: mi,
                    itemsBefore: before,
                    itemsAfter: (newDayData.meals?.[mi]?.items || []).length,
                    totalItems: meals.reduce((acc, m) => acc + ((m.items || []).length), 0),
                    updatedAt: newUpdatedAt,
                });
            } catch (_) { /* noop */ }
            try {
                try {
                    console.info('[HEYS.day-trace] 5/8 LS write', {
                        key,
                        mealsCount: meals.length,
                        totalItems: meals.reduce((acc, m) => acc + ((m.items || []).length), 0),
                        updatedAt: newUpdatedAt,
                    });
                } catch (_) { /* noop */ }
                lsSet(key, newDayData);
            } catch (e) {
                trackError(e, { source: 'day/_meals.js', action: 'save_product_quick' });
            }
            setDay(() => newDayData);

            if (setNewItemIds) {
                setNewItemIds((prev) => new Set([...prev, item.id]));
                setTimeout(() => {
                    setNewItemIds((prev) => {
                        const next = new Set(prev);
                        next.delete(item.id);
                        return next;
                    });
                }, 500);
            }

            window.dispatchEvent(new CustomEvent('heysProductAdded'));
            emitPlannerReplanRequest('PRODUCT_ADDED', { mealIndex: mi, productId: item.product_id });
        }, [haptic, setDay, setNewItemIds, date, emitPlannerReplanRequest]);

        const setGrams = React.useCallback((mi, itId, g) => {
            const grams = +g || 0;
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).map((it) => it.id === itId ? { ...it, grams } : it) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
            emitPlannerReplanRequestDebounced('GRAMS_UPDATED', { mealIndex: mi, itemId: itId, grams }, 300);
        }, [setDay, emitPlannerReplanRequestDebounced]);

        const removeItem = React.useCallback((mi, itId) => {
            const sourceMeal = dayRef.current.meals?.[mi];
            if (!sourceMeal) return;

            const mealId = sourceMeal.id;
            const originalItems = sourceMeal.items || [];
            const itemIndex = originalItems.findIndex((it) => it.id === itId);
            if (itemIndex < 0) return;

            const removedItem = originalItems[itemIndex];
            const removedName = removedItem?.name || 'Продукт';

            haptic('medium');

            runUndoableDayMutation({
                label: removedName + ' удалён',
                duration: 4000,
                errorMessage: 'Не удалось удалить продукт',
                errorAction: 'remove_item',
                applyMutation: () => {
                    const removedUpdatedAt = markUndoWindow(5000);

                    const baseDay = dayRef.current || {};
                    const meals = (baseDay.meals || []).map((meal) => {
                        if (meal.id !== mealId) return meal;
                        return { ...meal, items: (meal.items || []).filter((it) => it.id !== itId) };
                    });
                    const nextDayData = { ...baseDay, meals, updatedAt: removedUpdatedAt };
                    persistDayData(nextDayData, 'remove_item');
                    setDay(() => nextDayData);

                    recalculateOrphanProducts();
                    emitPlannerReplanRequest('PRODUCT_REMOVED', { mealId, itemId: itId });
                    return { mealId, removedItem, itemIndex };
                },
                undoMutation: ({ mealId: ctxMealId, removedItem: ctxRemovedItem, itemIndex: ctxItemIndex }) => {
                    const undoUpdatedAt = markUndoWindow(3000);
                    const baseDay = dayRef.current || {};
                    const meals = (baseDay.meals || []).map((meal) => {
                        if (meal.id !== ctxMealId) return meal;

                        const items = [...(meal.items || [])];
                        if (items.some((it) => it.id === ctxRemovedItem.id)) {
                            return meal;
                        }

                        items.splice(Math.max(0, Math.min(ctxItemIndex, items.length)), 0, ctxRemovedItem);
                        return { ...meal, items };
                    });

                    const nextDayData = { ...baseDay, meals, updatedAt: undoUpdatedAt };
                    persistDayData(nextDayData, 'undo_remove_item');
                    setDay(() => nextDayData);
                    recalculateOrphanProducts();
                },
            });
        }, [haptic, setDay, markUndoWindow, persistDayData, recalculateOrphanProducts, runUndoableDayMutation, emitPlannerReplanRequest]);

        const repeatYesterdayMeal = React.useCallback((mealIndex, yMeal) => {
            if (!yMeal || !(yMeal.items || []).length) return;
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast?.('Копирование продуктов недоступно');
                return;
            }
            const cloned = (yMeal.items || []).map(it => ({ ...it, id: uid('it_') }));
            markUndoWindow(3000);
            const baseDay = dayRef.current || {};
            const newMeals = (baseDay.meals || []).map((m, i) =>
                i === mealIndex ? { ...m, items: [...(m.items || []), ...cloned] } : m
            );
            const updated = { ...baseDay, meals: newMeals, updatedAt: Date.now() };
            persistDayData(updated, 'repeat_yesterday_meal');
            setDay(() => updated);
            HEYS.Toast?.success?.(`Повторено: ${cloned.length} продуктов из вчера`);
        }, [setDay, markUndoWindow, persistDayData]);

        const saveAsPreset = React.useCallback((mealIndex) => {
            const meal = (day.meals || [])[mealIndex];
            if (!meal || !(meal.items || []).length) {
                HEYS.Toast?.info?.('Приём пуст — нечего сохранять');
                return;
            }
            HEYS.AddProductStep?.show?.({
                mealIndex,
                day,
                dateKey: date,
                openPresetsCreate: true,
                onAdd: addProductToMeal,
            });
        }, [day, date, addProductToMeal]);

        // Helpers для копирования в произвольную дату (today, обычно)
        const navigateAndScrollToMeal = React.useCallback((targetDate, mealId) => {
            const setSel = window.__heysSetSelectedDate;
            if (typeof setSel === 'function' && targetDate && targetDate !== date) {
                try { setSel(targetDate); } catch (e) { /* ignore */ }
            }
            // Retry scroll до 6 раз с интервалом 250ms — даём React отрендерить переход на новую дату.
            let tries = 0;
            const tryScroll = () => {
                tries += 1;
                const target = mealId && document.querySelector(`[data-meal-id="${mealId}"]`);
                if (target && typeof target.scrollIntoView === 'function') {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (tries < 6) {
                    setTimeout(tryScroll, 250);
                }
            };
            setTimeout(tryScroll, 200);
        }, [date]);

        const copyItemsToMeal = React.useCallback((srcMealIndex, itemIds, dstMealIndex, targetDate, gramsMap) => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Копирование продуктов недоступно');
                return;
            }
            const tgtDate = targetDate || date;
            const src = dayRef.current?.meals?.[srcMealIndex];
            const cloned = cloneItemsFromMeal(src, itemIds, gramsMap);
            if (cloned.length === 0) return;

            const writeIntoTarget = (existingDay) => {
                const meals = existingDay?.meals || [];
                if (!meals[dstMealIndex]) return null;
                const newMeals = meals.map((m, i) =>
                    i === dstMealIndex
                        ? { ...m, items: [...(m.items || []), ...cloned] }
                        : m,
                );
                return { ...(existingDay || {}), date: tgtDate, meals: newMeals, updatedAt: Date.now() };
            };

            let dstMealId = null;

            if (tgtDate === date) {
                // Same-day copy — обновляем React state + LS через стандартный путь
                markUndoWindow(3000);
                const baseDay = dayRef.current || {};
                const updated = writeIntoTarget(baseDay);
                if (updated) {
                    persistDayData(updated, 'copy_items_to_meal');
                    setDay(() => updated);
                    dstMealId = updated.meals[dstMealIndex]?.id || null;
                }
            } else {
                // Cross-day copy — пишем в LS целевого дня; React state открытого дня НЕ трогаем
                const tgtKey = _scopedDayKey(tgtDate);
                const existing = lsGet(tgtKey, null) || { date: tgtDate, meals: [] };
                const updated = writeIntoTarget(existing);
                if (!updated) {
                    HEYS.Toast?.error?.('Целевой приём не найден');
                    return;
                }
                try {
                    lsSet(tgtKey, updated);
                } catch (e) {
                    trackError(e, { source: 'day/_meals.js', action: 'copy_items_cross_day' });
                }
                dstMealId = updated.meals[dstMealIndex]?.id || null;
                window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: tgtDate, source: 'copy_meal' } }));
            }

            HEYS.Toast?.success?.(`Скопировано: ${itemIds.length}`);
            navigateAndScrollToMeal(tgtDate, dstMealId);
        }, [setDay, markUndoWindow, persistDayData, date, navigateAndScrollToMeal]);

        const openCopyMealModal = React.useCallback((srcMealIndex) => {
            const meal = dayRef.current?.meals?.[srcMealIndex];
            if (!meal || !(meal.items || []).length) {
                HEYS.Toast?.info?.('Приём пуст — нечего копировать');
                return;
            }
            if (!HEYS.CopyMealModal || !HEYS.CopyMealModal.show) {
                console.error('[copyMeal] HEYS.CopyMealModal not available');
                return;
            }

            // Целевой день = всегда сегодня
            const todayStr = _getTodayISO();
            const sourceDate = date;
            const targetDay = (todayStr === date)
                ? dayRef.current
                : (lsGet(_scopedDayKey(todayStr), null) || { date: todayStr, meals: [] });
            const targetMeals = (targetDay && targetDay.meals) || [];

            HEYS.CopyMealModal.show({
                sourceMeal: meal,
                sourceMealIndex: srcMealIndex,
                sourceDate,
                targetDate: todayStr,
                targetMeals,
                onCopyToExisting: (itemIds, dstIdx, gramsMap) => {
                    copyItemsToMeal(srcMealIndex, itemIds, dstIdx, todayStr, gramsMap);
                },
                onCopyToNew: (itemIds, gramsMap) => {
                    // Snapshot ДО открытия wizard — фиксирует source.items на момент клика
                    const cloned = cloneItemsFromMeal(meal, itemIds, gramsMap);
                    if (cloned.length === 0) return;

                    const completeWithItems = (newMealRaw) => {
                        const newMeal = { ...newMealRaw, items: cloned };

                        if (todayStr === date) {
                            // Today открыт: используем стандартный setDay
                            markUndoWindow(3000);
                            const baseDay = dayRef.current || {};
                            const newMeals = sortMealsByTime([...(baseDay.meals || []), newMeal]);
                            const updated = { ...baseDay, meals: newMeals, updatedAt: Date.now() };
                            persistDayData(updated, 'copy_items_to_new_meal');
                            setDay(() => updated);
                        } else {
                            // Today не открыт: пишем в LS today's dayv2 напрямую
                            const tgtKey = _scopedDayKey(todayStr);
                            const existing = lsGet(tgtKey, null) || { date: todayStr, meals: [] };
                            const newMeals = sortMealsByTime([...(existing.meals || []), newMeal]);
                            const updated = { ...existing, date: todayStr, meals: newMeals, updatedAt: Date.now() };
                            try {
                                lsSet(tgtKey, updated);
                            } catch (e) {
                                trackError(e, { source: 'day/_meals.js', action: 'copy_to_new_cross_day' });
                            }
                            window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: todayStr, source: 'copy_meal_new' } }));
                        }

                        HEYS.Toast?.success?.(`Создан приём, скопировано: ${cloned.length}`);
                        window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));

                        // 📝 Event log (Ticket N): meal-add — UI emit for activity reports
                        try {
                            window.HEYS?.eventLog?.write(
                                'meal-add',
                                `meal=${newMeal.name || 'unnamed'} для ${todayStr}`,
                                { dateKey: todayStr, mealName: newMeal.name || '', count: 1 },
                                'addMeal_copy_new_day'
                            );
                        } catch (_) { /* noop */ }

                        navigateAndScrollToMeal(todayStr, newMeal.id);
                    };

                    // 100ms — даём CopyMealModal закрыться (visual smoothness перед открытием MealStep)
                    setTimeout(() => {
                        if (HEYS.MealStep && HEYS.MealStep.showAddMeal) {
                            HEYS.MealStep.showAddMeal({
                                dateKey: todayStr,
                                meals: targetMeals,
                                pIndex,
                                getProductFromItem,
                                trainings: targetDay?.trainings || [],
                                deficitPct: Number(targetDay?.deficitPct ?? prof?.deficitPctTarget ?? 0),
                                prof,
                                dayData: targetDay,
                                onComplete: completeWithItems,
                            });
                        } else {
                            // Fallback если MealStep ещё не загружен
                            completeWithItems({
                                id: uid('m_'),
                                name: 'Приём',
                                time: '',
                                mood: '',
                                wellbeing: '',
                                stress: '',
                                items: [],
                            });
                        }
                    }, 100);
                },
            });
        }, [date, pIndex, getProductFromItem, prof, copyItemsToMeal, setDay, markUndoWindow, persistDayData, navigateAndScrollToMeal]);

        const buildDaysWithMeals = React.useCallback((opts) => {
            const includeEmpty = !!(opts && opts.includeEmpty);
            const today = _getTodayISO();
            const parts = today.split('-');
            if (parts.length !== 3) return [];
            const baseD = new Date(+parts[0], +parts[1] - 1, +parts[2]);
            const labels = ['Сегодня', 'Вчера', 'Позавчера'];
            const result = [];
            for (let i = 0; i < 3; i++) {
                const d = new Date(baseD);
                d.setDate(d.getDate() - i);
                const dStr = d.getFullYear()
                    + '-' + String(d.getMonth() + 1).padStart(2, '0')
                    + '-' + String(d.getDate()).padStart(2, '0');
                let dayData = null;
                if (dStr === date) dayData = dayRef.current;
                else dayData = lsGet(_scopedDayKey(dStr), null);
                const rawMeals = (dayData && Array.isArray(dayData.meals)) ? dayData.meals : [];
                const meals = includeEmpty ? rawMeals : rawMeals.filter(m => m && (m.items || []).length > 0);
                result.push({ dateStr: dStr, dateLabel: labels[i], meals });
            }
            return result;
        }, [date]);

        const readDay = React.useCallback((dStr) => {
            if (dStr === date) return dayRef.current;
            return lsGet(_scopedDayKey(dStr), null) || { date: dStr, meals: [] };
        }, [date]);

        const writeDay = React.useCallback((dStr, mutator, action) => {
            if (dStr === date) {
                markUndoWindow(3000);
                const baseDay = dayRef.current || {};
                const next = mutator(baseDay);
                if (!next) return false;
                persistDayData(next, action);
                setDay(() => next);
                dayRef.current = next;
                return true;
            }
            const key = _scopedDayKey(dStr);
            const existing = lsGet(key, null) || { date: dStr, meals: [] };
            const next = mutator(existing);
            if (!next) return false;
            try { lsSet(key, next); } catch (e) {
                trackError(e, { source: 'day/_meals.js', action: action || 'cross_day_write' });
                return false;
            }
            window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: dStr, source: action || 'move' } }));
            return true;
        }, [date, setDay, markUndoWindow, persistDayData]);

        const createNewMealAndAddItem = React.useCallback((params) => {
            const { srcDate, srcMealId, srcItem, srcItemIndex, mode, todayStr } = params;
            const dstItem = { ...srcItem, id: uid('it_') };

            const completeWithNewMeal = (newMealRaw) => {
                const newMeal = { ...newMealRaw, items: [dstItem] };

                const writeOk = writeDay(todayStr, (existing) => {
                    const meals = sortMealsByTime([...(existing.meals || []), newMeal]);
                    return { ...existing, date: todayStr, meals, updatedAt: Date.now() };
                }, mode + '_item_to_new_meal');

                if (!writeOk) {
                    HEYS.Toast?.error?.('Не удалось создать новый приём');
                    return;
                }

                if (mode === 'move') {
                    writeDay(srcDate, (existing) => {
                        const meals = (existing.meals || []).map(m => m && m.id === srcMealId
                            ? { ...m, items: (m.items || []).filter(it => it.id !== srcItem.id) } : m);
                        return { ...existing, meals, updatedAt: Date.now() };
                    }, 'move_item_from_source');
                    recalculateOrphanProducts();
                }

                haptic(mode === 'move' ? 'medium' : 'light');

                let undone = false;
                const undo = () => {
                    if (undone) return;
                    undone = true;
                    writeDay(todayStr, (existing) => {
                        const meals = (existing.meals || []).filter(m => m && m.id !== newMeal.id);
                        return { ...existing, meals, updatedAt: Date.now() };
                    }, 'undo_create_new_meal');
                    if (mode === 'move') {
                        writeDay(srcDate, (existing) => {
                            const meals = (existing.meals || []).map(m => {
                                if (!m || m.id !== srcMealId) return m;
                                const items = [...(m.items || [])];
                                if (items.some(it => it.id === srcItem.id)) return m;
                                items.splice(Math.max(0, Math.min(srcItemIndex, items.length)), 0, srcItem);
                                return { ...m, items };
                            });
                            return { ...existing, meals, updatedAt: Date.now() };
                        }, 'undo_move_item_source');
                    }
                    HEYS.Toast?.info?.('Возвращено');
                };

                HEYS.Toast?.show?.({
                    type: 'success',
                    message: mode === 'move' ? 'Перемещено в новый приём' : 'Скопировано в новый приём',
                    duration: 4000,
                    action: { label: 'Отменить', onClick: undo },
                });

                window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));

                // 📝 Event log (Ticket N): meal-add — UI emit for activity reports
                try {
                    window.HEYS?.eventLog?.write(
                        'meal-add',
                        `meal=${newMeal.name || 'unnamed'} для ${todayStr}`,
                        { dateKey: todayStr, mealName: newMeal.name || '', count: 1 },
                        'addMeal_move_copy_new'
                    );
                } catch (_) { /* noop */ }

                navigateAndScrollToMeal(todayStr, newMeal.id);
            };

            const todayDay = (todayStr === date)
                ? dayRef.current
                : (lsGet(_scopedDayKey(todayStr), null) || { date: todayStr, meals: [] });

            // 100ms — даём MoveModal закрыться (visual smoothness)
            setTimeout(() => {
                if (HEYS.MealStep && HEYS.MealStep.showAddMeal) {
                    HEYS.MealStep.showAddMeal({
                        dateKey: todayStr,
                        meals: todayDay?.meals || [],
                        pIndex,
                        getProductFromItem,
                        trainings: todayDay?.trainings || [],
                        deficitPct: Number(todayDay?.deficitPct ?? prof?.deficitPctTarget ?? 0),
                        prof,
                        dayData: todayDay,
                        onComplete: completeWithNewMeal,
                    });
                } else {
                    completeWithNewMeal({
                        id: uid('m_'),
                        name: 'Приём',
                        time: '',
                        mood: '',
                        wellbeing: '',
                        stress: '',
                        items: [],
                    });
                }
            }, 100);
        }, [date, writeDay, pIndex, getProductFromItem, prof, navigateAndScrollToMeal, recalculateOrphanProducts, haptic]);

        const moveItem = React.useCallback((srcMealIndex, srcItemId) => {
            if (!HEYS.MoveModal || !HEYS.MoveModal.show) {
                HEYS.Toast?.info?.('Модалка ещё загружается — попробуй через секунду');
                return;
            }
            const srcMeal = dayRef.current?.meals?.[srcMealIndex];
            if (!srcMeal) return;
            const srcItems = srcMeal.items || [];
            const srcItemIndex = srcItems.findIndex(it => it.id === srcItemId);
            if (srcItemIndex < 0) return;
            const srcItem = srcItems[srcItemIndex];
            const srcDate = date;
            const srcMealId = srcMeal.id;

            const itemKcal = (() => {
                const product = (typeof getProductFromItem === 'function')
                    ? (getProductFromItem(srcItem, pIndex) || {}) : (srcItem || {});
                const kcal100 = +product.kcal100 || +srcItem.kcal100 || 0;
                const g = +srcItem.grams || 0;
                return Math.round(kcal100 * g / 100);
            })();

            const daysWithMeals = buildDaysWithMeals({ includeEmpty: true });

            HEYS.MoveModal.show({
                mode: 'product-move',
                sourceDate: srcDate,
                sourceMealIndex: srcMealIndex,
                sourceLabel: `Переносим: ${srcItem.name || 'Продукт'}, ${srcItem.grams || 0}г${itemKcal ? ', ~' + itemKcal + ' ккал' : ''}`,
                daysWithMeals,
                todayDateStr: _getTodayISO(),
                pIndex,
                getProductFromItem,
                onPick: ({ dstDate, dstMealIndex, dstMealId, createNewMeal }) => {
                    if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                        HEYS.Paywall.showBlockedToast?.('Перенос недоступен');
                        return;
                    }
                    if (createNewMeal) {
                        createNewMealAndAddItem({
                            srcDate,
                            srcMealId,
                            srcItem,
                            srcItemIndex,
                            mode: 'move',
                            todayStr: dstDate,
                        });
                        return;
                    }
                    const dstItem = { ...srcItem, id: uid('it_') };

                    const writeOk = writeDay(dstDate, (existing) => {
                        const meals = existing.meals || [];
                        const idx = dstMealId
                            ? meals.findIndex(m => m && m.id === dstMealId)
                            : dstMealIndex;
                        if (idx == null || idx < 0 || !meals[idx]) return null;
                        const newMeals = meals.map((m, i) => i === idx
                            ? { ...m, items: [...(m.items || []), dstItem] } : m);
                        return { ...existing, date: dstDate, meals: newMeals, updatedAt: Date.now() };
                    }, 'move_item_to_target');

                    if (!writeOk) {
                        HEYS.Toast?.error?.('Не удалось записать в целевой приём');
                        return;
                    }

                    writeDay(srcDate, (existing) => {
                        const meals = (existing.meals || []).map(m => m && m.id === srcMealId
                            ? { ...m, items: (m.items || []).filter(it => it.id !== srcItemId) } : m);
                        return { ...existing, meals, updatedAt: Date.now() };
                    }, 'move_item_from_source');

                    haptic('medium');
                    recalculateOrphanProducts();

                    const dstLabel = daysWithMeals.find(d => d.dateStr === dstDate)?.dateLabel || dstDate;
                    let undone = false;
                    const undo = () => {
                        if (undone) return;
                        undone = true;
                        writeDay(dstDate, (existing) => {
                            const meals = (existing.meals || []).map(m => ({
                                ...m,
                                items: (m.items || []).filter(it => it.id !== dstItem.id),
                            }));
                            return { ...existing, meals, updatedAt: Date.now() };
                        }, 'undo_move_item_target');
                        writeDay(srcDate, (existing) => {
                            const meals = (existing.meals || []).map(m => {
                                if (!m || m.id !== srcMealId) return m;
                                const items = [...(m.items || [])];
                                if (items.some(it => it.id === srcItemId)) return m;
                                items.splice(Math.max(0, Math.min(srcItemIndex, items.length)), 0, srcItem);
                                return { ...m, items };
                            });
                            return { ...existing, meals, updatedAt: Date.now() };
                        }, 'undo_move_item_source');
                        HEYS.Toast?.info?.('Возвращено');
                    };

                    HEYS.Toast?.show?.({
                        type: 'success',
                        message: `Переместили в ${dstLabel}`,
                        duration: 4000,
                        action: { label: 'Отменить', onClick: undo },
                    });
                },
            });
        }, [date, pIndex, getProductFromItem, haptic, buildDaysWithMeals, writeDay, recalculateOrphanProducts, createNewMealAndAddItem]);

        const copyItem = React.useCallback((srcMealIndex, srcItemId) => {
            if (!HEYS.MoveModal || !HEYS.MoveModal.show) {
                HEYS.Toast?.info?.('Модалка ещё загружается — попробуй через секунду');
                return;
            }
            const srcMeal = dayRef.current?.meals?.[srcMealIndex];
            if (!srcMeal) return;
            const srcItem = (srcMeal.items || []).find(it => it.id === srcItemId);
            if (!srcItem) return;
            const srcDate = date;

            const itemKcal = (() => {
                const product = (typeof getProductFromItem === 'function')
                    ? (getProductFromItem(srcItem, pIndex) || {}) : (srcItem || {});
                const kcal100 = +product.kcal100 || +srcItem.kcal100 || 0;
                const g = +srcItem.grams || 0;
                return Math.round(kcal100 * g / 100);
            })();

            const daysWithMeals = buildDaysWithMeals({ includeEmpty: true });

            HEYS.MoveModal.show({
                mode: 'product-copy',
                sourceDate: srcDate,
                sourceMealIndex: srcMealIndex,
                sourceLabel: `Копируем: ${srcItem.name || 'Продукт'}, ${srcItem.grams || 0}г${itemKcal ? ', ~' + itemKcal + ' ккал' : ''}`,
                daysWithMeals,
                todayDateStr: _getTodayISO(),
                pIndex,
                getProductFromItem,
                onPick: ({ dstDate, dstMealIndex, dstMealId, createNewMeal }) => {
                    if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                        HEYS.Paywall.showBlockedToast?.('Копирование недоступно');
                        return;
                    }
                    if (createNewMeal) {
                        createNewMealAndAddItem({
                            srcDate,
                            srcMealId: srcMeal.id,
                            srcItem,
                            srcItemIndex: -1,
                            mode: 'copy',
                            todayStr: dstDate,
                        });
                        return;
                    }
                    const dstItem = { ...srcItem, id: uid('it_') };
                    const writeOk = writeDay(dstDate, (existing) => {
                        const meals = existing.meals || [];
                        const idx = dstMealId
                            ? meals.findIndex(m => m && m.id === dstMealId)
                            : dstMealIndex;
                        if (idx == null || idx < 0 || !meals[idx]) return null;
                        const newMeals = meals.map((m, i) => i === idx
                            ? { ...m, items: [...(m.items || []), dstItem] } : m);
                        return { ...existing, date: dstDate, meals: newMeals, updatedAt: Date.now() };
                    }, 'copy_item_to_target');

                    if (!writeOk) {
                        HEYS.Toast?.error?.('Не удалось записать в целевой приём');
                        return;
                    }

                    haptic('light');

                    const dstLabel = daysWithMeals.find(d => d.dateStr === dstDate)?.dateLabel || dstDate;

                    if (HEYS.ConfirmModal && typeof HEYS.ConfirmModal.show === 'function') {
                        HEYS.ConfirmModal.show({
                            icon: '✅',
                            title: `Скопировано в ${dstLabel}`,
                            text: 'Перейти в приём, куда скопировали, или остаться в текущем?',
                            confirmText: 'Перейти',
                            cancelText: 'Остаться',
                            confirmStyle: 'primary',
                            confirmVariant: 'fill',
                            cancelStyle: 'neutral',
                            onConfirm: () => navigateAndScrollToMeal(dstDate, dstMealId),
                        });
                    } else {
                        HEYS.Toast?.success?.(`Скопировано в ${dstLabel}`);
                    }
                },
            });
        }, [date, pIndex, getProductFromItem, haptic, buildDaysWithMeals, writeDay, createNewMealAndAddItem, navigateAndScrollToMeal]);

        const moveMealToDate = React.useCallback((srcMealIndex, dstDate) => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast?.('Перенос приёма недоступен');
                return;
            }
            const srcMeal = dayRef.current?.meals?.[srcMealIndex];
            if (!srcMeal) return;
            const srcDate = date;
            if (dstDate === srcDate) {
                HEYS.Toast?.info?.('Приём уже здесь');
                return;
            }
            const srcMealId = srcMeal.id;
            const srcMealClone = JSON.parse(JSON.stringify(srcMeal));
            const dstMeal = {
                ...srcMeal,
                id: uid('m_'),
                items: (srcMeal.items || []).map(it => ({ ...it, id: uid('it_') })),
            };

            const writeOk = writeDay(dstDate, (existing) => {
                const newMeals = sortMealsByTime([...(existing.meals || []), dstMeal]);
                return { ...existing, date: dstDate, meals: newMeals, updatedAt: Date.now() };
            }, 'move_meal_to_target');

            if (!writeOk) {
                HEYS.Toast?.error?.('Не удалось записать в целевой день');
                return;
            }

            writeDay(srcDate, (existing) => {
                const meals = (existing.meals || []).filter(m => m && m.id !== srcMealId);
                return { ...existing, meals, updatedAt: Date.now() };
            }, 'move_meal_from_source');

            haptic('medium');

            const labels = buildDaysWithMeals({ includeEmpty: true });
            const dstLabel = labels.find(d => d.dateStr === dstDate)?.dateLabel || dstDate;

            let undone = false;
            const undo = () => {
                if (undone) return;
                undone = true;
                writeDay(dstDate, (existing) => {
                    const meals = (existing.meals || []).filter(m => m && m.id !== dstMeal.id);
                    return { ...existing, meals, updatedAt: Date.now() };
                }, 'undo_move_meal_target');
                writeDay(srcDate, (existing) => {
                    const meals = sortMealsByTime([...(existing.meals || []), srcMealClone]);
                    return { ...existing, meals, updatedAt: Date.now() };
                }, 'undo_move_meal_source');
                HEYS.Toast?.info?.('Приём возвращён');
            };

            HEYS.Toast?.show?.({
                type: 'success',
                message: `Приём перемещён в ${dstLabel}`,
                duration: 4000,
                action: { label: 'Отменить', onClick: undo },
            });
        }, [date, haptic, buildDaysWithMeals, writeDay]);

        const openMoveMealModal = React.useCallback((srcMealIndex) => {
            if (!HEYS.MoveModal || !HEYS.MoveModal.show) {
                HEYS.Toast?.info?.('Модалка ещё загружается — попробуй через секунду');
                return;
            }
            const meal = dayRef.current?.meals?.[srcMealIndex];
            if (!meal || !(meal.items || []).length) {
                HEYS.Toast?.info?.('Пустой приём — нечего переносить');
                return;
            }
            const itemCount = (meal.items || []).length;
            const sourceLabel = `Переносим: ${meal.name || 'Приём'}${meal.time ? ' (' + meal.time + ')' : ''}, ${itemCount} ${itemCount === 1 ? 'продукт' : (itemCount < 5 ? 'продукта' : 'продуктов')}`;

            HEYS.MoveModal.show({
                mode: 'meal-move',
                sourceDate: date,
                sourceLabel,
                daysWithMeals: buildDaysWithMeals({ includeEmpty: true }),
                onPick: ({ dstDate }) => moveMealToDate(srcMealIndex, dstDate),
            });
        }, [date, buildDaysWithMeals, moveMealToDate]);

        const removePhoto = React.useCallback(async (mi, photoId, options = {}) => {
            const sourceMeal = dayRef.current.meals?.[mi];
            if (!sourceMeal) return false;

            const mealId = sourceMeal.id;
            const originalPhotos = sourceMeal.photos || [];
            const photoIndex = originalPhotos.findIndex((photo) => photo.id === photoId);
            if (photoIndex < 0) return false;

            const removedPhoto = originalPhotos[photoIndex];
            const confirmed = options.skipConfirm === true
                ? true
                : await HEYS.ConfirmModal?.confirmDelete?.({
                    icon: '🗑️',
                    title: 'Удалить фото?',
                    text: 'Фото исчезнет сразу, но его можно будет быстро вернуть через кнопку «Отменить».',
                });

            if (confirmed === false) return false;

            haptic('medium');

            return !!runUndoableDayMutation({
                label: 'Фото удалено',
                duration: 5000,
                errorMessage: 'Не удалось удалить фото',
                errorAction: 'remove_photo',
                applyMutation: () => {
                    const removedUpdatedAt = markUndoWindow(6000);

                    const baseDay = dayRef.current || {};
                    const meals = (baseDay.meals || []).map((meal) => {
                        if (meal.id !== mealId) return meal;
                        return { ...meal, photos: (meal.photos || []).filter((photo) => photo.id !== photoId) };
                    });
                    const nextDayData = { ...baseDay, meals, updatedAt: removedUpdatedAt };
                    persistDayData(nextDayData, 'remove_photo');
                    setDay(() => nextDayData);

                    return { mealId, removedPhoto, photoIndex };
                },
                undoMutation: ({ mealId: ctxMealId, removedPhoto: ctxRemovedPhoto, photoIndex: ctxPhotoIndex }) => {
                    const undoUpdatedAt = markUndoWindow(3000);
                    const baseDay = dayRef.current || {};
                    const meals = (baseDay.meals || []).map((meal) => {
                        if (meal.id !== ctxMealId) return meal;

                        const photos = [...(meal.photos || [])];
                        if (photos.some((photo) => photo.id === ctxRemovedPhoto.id)) {
                            return meal;
                        }

                        photos.splice(Math.max(0, Math.min(ctxPhotoIndex, photos.length)), 0, ctxRemovedPhoto);
                        return { ...meal, photos };
                    });

                    const nextDayData = { ...baseDay, meals, updatedAt: undoUpdatedAt };
                    persistDayData(nextDayData, 'undo_remove_photo');
                    setDay(() => nextDayData);
                },
                onExpire: async (_reason, { removedPhoto: ctxRemovedPhoto }) => {
                    if (ctxRemovedPhoto?.path && ctxRemovedPhoto?.uploaded && window.HEYS?.cloud?.deletePhoto) {
                        try {
                            await window.HEYS.cloud.deletePhoto(ctxRemovedPhoto.path);
                        } catch (error) {
                            trackError(error, { source: 'day/_meals.js', action: 'delete_photo_cloud_finalize' });
                            HEYS.Toast?.error('Фото удалено локально, но не удалилось из облака');
                        }
                    }
                },
            });
        }, [haptic, markUndoWindow, persistDayData, runUndoableDayMutation, setDay]);

        const updateMealField = React.useCallback((mealIndex, field, value) => {
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mealIndex ? { ...m, [field]: value } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
            emitPlannerReplanRequest('MEAL_FIELD_UPDATED', { mealIndex, field });
        }, [setDay, emitPlannerReplanRequest]);

        const changeMealMood = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'mood', value), [updateMealField]);
        const changeMealWellbeing = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'wellbeing', value), [updateMealField]);
        const changeMealStress = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'stress', value), [updateMealField]);

        const changeMealType = React.useCallback((mealIndex, newType) => {
            const newUpdatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex) return m;
                    const newName = newType && MEAL_TYPES_HANDLER && MEAL_TYPES_HANDLER[newType]
                        ? MEAL_TYPES_HANDLER[newType].name
                        : m.name;
                    return { ...m, mealType: newType, name: newName };
                });
                return { ...prevDay, meals, updatedAt: newUpdatedAt };
            });
            haptic('light');
        }, [setDay, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const isNewItem = React.useCallback((itemId) => newItemIds && newItemIds.has(itemId), [newItemIds]);

        return {
            addMeal,
            updateMealTime,
            removeMeal,
            addProductToMeal,
            copyItemsToMeal,
            openCopyMealModal,
            saveAsPreset,
            repeatYesterdayMeal,
            setGrams,
            removeItem,
            moveItem,
            copyItem,
            openMoveMealModal,
            moveMealToDate,
            removePhoto,
            updateMealField,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            changeMealType,
            isNewItem,
            sortMealsByTime,
        };
    }

    HEYS.dayMealHandlers = {
        createMealHandlers,
        sortMealsByTime,
    };

})(window);
