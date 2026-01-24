// day/_meals.js — consolidated DayTab meals modules (card/list/display/chart/state/handlers)

; (function (global) {
    'use strict';
    console.log('[HEYS] 📦 day/_meals.js START loading');

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const trackError = (err, context) => {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(err, context);
        }
    };

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
        openEditGramsModal,
        openTimeEditor,
        openMoodEditor,
        setGrams,
        removeItem,
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
                className: 'card tone-slate meal-card',
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
                // Use centralized harm normalization with fallback to item
                const harm = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
            t.gi = gSum ? giSum / gSum : 0;
            t.harm = gSum ? harmSum / gSum : 0;
            return t;
        }
        const totals = mTotals(meal);
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

        const mealActivityContext = React.useMemo(() => {
            if (!HEYS.InsulinWave?.calculateActivityContext) return null;
            if (!dayData?.trainings || dayData.trainings.length === 0) return null;
            if (!meal?.time || !meal?.items?.length) return null;

            const mealTotals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
            return HEYS.InsulinWave.calculateActivityContext({
                mealTime: meal.time,
                mealKcal: mealTotals.kcal || 0,
                trainings: dayData.trainings,
                householdMin: dayData.householdMin || 0,
                steps: dayData.steps || 0,
                allMeals: allMeals,
            });
        }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, pIndex]);

        const mealQuality = React.useMemo(() => {
            if (!meal?.items || meal.items.length === 0) return null;
            return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
        }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);

        const qualityLineColor = mealQuality
            ? mealQuality.color
            : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');

        const mealCardClass = isCurrentMeal ? 'card tone-green meal-card meal-card--current' : 'card tone-slate meal-card';
        const mealCardStyle = {
            marginTop: '8px',
            width: '100%',
            position: 'relative',
            paddingLeft: '12px',
            ...(isCurrentMeal
                ? {
                    border: '2px solid #22c55e',
                    boxShadow: '0 4px 12px rgba(34,197,94,0.25)',
                }
                : {}),
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

        return React.createElement('div', { className: mealCardClass, 'data-meal-index': mealIndex, style: mealCardStyle },
            qualityLineColor !== 'transparent' && React.createElement('div', {
                className: 'meal-quality-line',
                style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    borderRadius: '12px 0 0 12px',
                    background: qualityLineColor,
                    transition: 'background 0.3s ease',
                },
            }),
            React.createElement('div', {
                className: 'meal-header-inside meal-type-' + mealTypeInfo.type,
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    background: qualityLineColor !== 'transparent'
                        ? qualityLineColor + '1F'
                        : undefined,
                    borderRadius: '10px 10px 0 0',
                    margin: '-12px -12px 8px -4px',
                    padding: '12px 16px 12px 8px',
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
                currentWave && currentWave.activityContext && React.createElement('span', {
                    className: 'activity-context-badge',
                    title: currentWave.activityContext.desc,
                    style: {
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        background: currentWave.activityContext.type === 'peri' ? '#22c55e33'
                            : currentWave.activityContext.type === 'post' ? '#3b82f633'
                                : currentWave.activityContext.type === 'pre' ? '#eab30833'
                                    : '#6b728033',
                        color: currentWave.activityContext.type === 'peri' ? '#16a34a'
                            : currentWave.activityContext.type === 'post' ? '#2563eb'
                                : currentWave.activityContext.type === 'pre' ? '#ca8a04'
                                    : '#374151',
                        fontWeight: '600',
                        flexShrink: 0,
                        marginLeft: '4px',
                        whiteSpace: 'nowrap',
                    },
                }, currentWave.activityContext.badge || ''),
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
                    background: mealActivityContext.type === 'peri' ? 'linear-gradient(135deg, #22c55e15, #22c55e25)'
                        : mealActivityContext.type === 'post' ? 'linear-gradient(135deg, #3b82f615, #3b82f625)'
                            : mealActivityContext.type === 'pre' ? 'linear-gradient(135deg, #eab30815, #eab30825)'
                                : 'linear-gradient(135deg, #6b728015, #6b728025)',
                    border: mealActivityContext.type === 'peri' ? '1px solid #22c55e40'
                        : mealActivityContext.type === 'post' ? '1px solid #3b82f640'
                            : mealActivityContext.type === 'pre' ? '1px solid #eab30840'
                                : '1px solid #6b728040',
                    color: mealActivityContext.type === 'peri' ? '#16a34a'
                        : mealActivityContext.type === 'post' ? '#2563eb'
                            : mealActivityContext.type === 'pre' ? '#ca8a04'
                                : '#374151',
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
                React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal }),
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
                React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
                    (meal.items || []).length > 0 && React.createElement('div', {
                        className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
                        onClick: () => onToggleExpand(mealIndex, allMeals),
                    },
                        React.createElement('span', { className: 'toggle-arrow' }, '›'),
                        React.createElement('span', null, isExpanded
                            ? (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов')
                            : 'развернуть ' + (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов')),
                    ),
                    React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal }),
                ),
                isExpanded && (meal.items || []).map((it) => {
                    const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
                    const G = +it.grams || 0;
                    const per = per100(p);
                    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? it.gi;
                    // Use centralized harm normalization with fallback to item
                    const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);

                    if (harmVal == null) {
                        logMissingHarm(p.name, it, 'mobile-card');
                    }

                    if (harmVal == null) {
                        logMissingHarm(p.name, it, 'mobile-card-compact');
                    }

                    const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';

                    const getHarmBg = (h) => {
                        if (h == null) return '#fff';
                        if (h <= 1) return '#34d399';
                        if (h <= 2) return '#6ee7b7';
                        if (h <= 3) return '#a7f3d0';
                        if (h <= 4) return '#d1fae5';
                        if (h <= 5) return '#bae6fd';
                        if (h <= 6) return '#e0f2fe';
                        if (h <= 7) return '#fecaca';
                        if (h <= 8) return '#fee2e2';
                        if (h <= 9) return '#fecdd3';
                        return '#f87171';
                    };
                    const harmBg = getHarmBg(harmVal);

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
                        if (!prod.category || !allProducts || allProducts.length < 2) return null;
                        const currentKcal = per.kcal100 || 0;
                        if (currentKcal < 50) return null;

                        const sameCategory = allProducts.filter((alt) =>
                            alt.category === prod.category
                            && alt.id !== prod.id
                            && (alt.kcal100 || computeDerivedProductFn(alt).kcal100) < currentKcal * 0.7,
                        );
                        if (sameCategory.length === 0) return null;

                        const best = sameCategory.reduce((a, b) => {
                            const aKcal = a.kcal100 || computeDerivedProductFn(a).kcal100;
                            const bKcal = b.kcal100 || computeDerivedProductFn(b).kcal100;
                            return aKcal < bKcal ? a : b;
                        });
                        const bestKcal = best.kcal100 || computeDerivedProductFn(best).kcal100;
                        const saving = Math.round((1 - bestKcal / currentKcal) * 100);
                        return { name: best.name, saving };
                    };
                    const alternative = findAlternative(p, products);

                    const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                            React.createElement('span', { className: 'mpc-name' }, p.name),
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
                            React.createElement('span', null, ' — на ' + alternative.saving + '% меньше ккал'),
                        ),
                    );

                    if (isMobile && HEYS.SwipeableRow) {
                        return React.createElement(HEYS.SwipeableRow, {
                            key: it.id,
                            onDelete: () => removeItem(mealIndex, it.id),
                        }, cardContent);
                    }

                    return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            React.createElement('span', { className: 'mpc-name' }, p.name),
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
                            e.stopPropagation();
                            if (!confirm('Удалить это фото?')) return;

                            if (photo.path && photo.uploaded && window.HEYS?.cloud?.deletePhoto) {
                                try {
                                    await window.HEYS.cloud.deletePhoto(photo.path);
                                } catch (err) {
                                    trackError(err, { source: 'day/_meals.js', action: 'delete_photo', mealIndex });
                                }
                            }

                            setDay((prevDay = {}) => {
                                const meals = (prevDay.meals || []).map((m, i) => {
                                    if (i !== mealIndex || !m.photos) return m;
                                    return { ...m, photos: m.photos.filter((p) => p.id !== photo.id) };
                                });
                                return { ...prevDay, meals, updatedAt: Date.now() };
                            });
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

                showWaveCalcPopup && currentWave && React.createElement('div', {
                    className: 'wave-details-overlay',
                    onClick: (e) => { if (e.target === e.currentTarget) setShowWaveCalcPopup(false); },
                    style: {
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                    },
                },
                    React.createElement('div', {
                        className: 'wave-details-popup',
                        style: {
                            background: '#fff',
                            borderRadius: '16px',
                            padding: '20px',
                            maxWidth: '360px',
                            width: '100%',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        },
                    },
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                            },
                        },
                            React.createElement('h3', {
                                style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' },
                            }, 'Расчёт волны'),
                            React.createElement('button', {
                                onClick: () => setShowWaveCalcPopup(false),
                                style: {
                                    background: 'none', border: 'none', fontSize: '20px',
                                    cursor: 'pointer', color: '#9ca3af', padding: '4px',
                                },
                            }, '×'),
                        ),

                        React.createElement('div', {
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

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '🍽️ Факторы еды'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.gi || 0)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.gl < 10 ? '#22c55e' : currentWave.gl > 20 ? '#ef4444' : '#1f2937' } }, (currentWave.gl || 0).toFixed(1)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.protein || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.fiber >= 5 ? '#22c55e' : '#1f2937' } }, Math.round(currentWave.fiber || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.fat || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.carbs || 0) + 'г'),
                            ),
                        ),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '⏰ Дневные факторы'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, '×' + (currentWave.circadianMultiplier || 1).toFixed(2)),
                            ),
                            currentWave.activityBonus && currentWave.activityBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
                                React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, (currentWave.activityBonus * 100).toFixed(0) + '%'),
                            ),
                        ),

                        React.createElement('button', {
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
                    ),
                ),
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
        if (prevProps.allMeals !== nextProps.allMeals) return false;
        return true;
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealCard = MealCard;

    // =========================
    // Meals list
    // =========================
    function renderMealsList(params) {
        const {
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

        return sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
            const mi = (day.meals || []).findIndex((m) => m.id === sortedMeal.id);
            if (mi === -1) {
                trackError(new Error('[HEYS Day Meals] meal not found in day.meals'), {
                    source: 'day/_meals.js',
                    type: 'missing_meal',
                    mealId: sortedMeal.id,
                });
                return null;
            }

            const meal = day.meals[mi];
            const isExpanded = isMealExpanded(mi, (day.meals || []).length, day.meals, displayIndex);
            const mealNumber = sortedMealsForDisplay.length - displayIndex;
            const isFirst = displayIndex === 0;
            const isCurrentMeal = isFirst && !isMealStale(meal);

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
                    isCurrentMeal && React.createElement('span', {
                        className: 'meal-current-label',
                        style: {
                            fontSize: '14px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: '#22c55e',
                            marginTop: '4px',
                        },
                    }, 'ТЕКУЩИЙ ПРИЁМ'),
                ),
                React.createElement(MealCard, {
                    meal,
                    mealIndex: mi,
                    displayIndex,
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
                    openEditGramsModal,
                    openTimeEditor,
                    openMoodEditor,
                    setGrams,
                    removeItem,
                    isMealStale,
                    allMeals: day.meals,
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
            insulinWaveData,
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
            insulinWaveData,
        }) || [];

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
            className: 'meals-chart-container',
            style: {
                margin: '12px 0',
                padding: '12px 16px',
                background: 'var(--surface, #fff)',
                borderRadius: '12px',
                border: '1px solid var(--border, #e5e7eb)',
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
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #6b7280)' } }, '📊 Распределение'),
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
            !mealChartHintShown && React.createElement('div', { className: 'meal-chart-hint' },
                React.createElement('span', null, '👆'),
                'Нажми на полоску для деталей',
            ),
            mealsChartData.meals.length > 1 && React.createElement('div', {
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
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' } },
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
                    const isLowScore = quality && quality.score < 50;
                    const isNewMeal = newMealAnimatingIndex === originalIndex;
                    return React.createElement('div', {
                        key: i,
                        className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 6px',
                            marginLeft: '-6px',
                            marginRight: '-6px',
                            borderRadius: '6px',
                            background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            transition: 'background 0.2s ease',
                        },
                    },
                        meal.time && React.createElement('span', {
                            style: {
                                width: '50px',
                                fontSize: '14px',
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
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: '90px',
                                fontSize: '15px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #1e293b)',
                                flexShrink: 0,
                            },
                        },
                            React.createElement('span', { style: { fontSize: '16px' } }, meal.icon),
                            React.createElement('span', null, meal.name),
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
                                height: '22px',
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
                                    fontSize: '10px',
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
                                        fontSize: '9px',
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
                        quality && React.createElement('span', { className: 'meal-quality-score', style: { color: quality.color, flexShrink: 0 } }, '⭐' + quality.score),
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

    console.log('[HEYS] 📦 day/_meals.js exporting dayMealExpandState');
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

                        setDay((prevDay) => {
                            const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
                            const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };

                            const key = 'heys_dayv2_' + date;
                            try {
                                lsSet(key, newDayData);
                            } catch (e) {
                                trackError(e, { source: 'day/_meals.js', action: 'save_meal' });
                            }

                            return newDayData;
                        });

                        if (window.HEYS && window.HEYS.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-created');
                        }
                        HEYS.Toast?.success('Приём создан');

                        setTimeout(() => {
                            // Get current meals to find the new meal index
                            // Use a ref-based approach to avoid calling show() inside setDay
                            let foundMealIndex = -1;

                            setDay((currentDay) => {
                                const meals = currentDay.meals || [];
                                foundMealIndex = meals.findIndex((m) => m.id === newMealId);

                                if (foundMealIndex >= 0) {
                                    expandOnlyMeal(foundMealIndex);
                                }

                                return currentDay;
                            });

                            // Call AddProductStep.show OUTSIDE of setDay to avoid setState during render
                            setTimeout(() => {
                                if (foundMealIndex >= 0 && window.HEYS?.AddProductStep?.show) {
                                    window.HEYS.AddProductStep.show({
                                        mealIndex: foundMealIndex,
                                        products: products,
                                        day: day,
                                        dateKey: date,
                                        onAdd: ({ product, grams, mealIndex: targetMealIndex }) => {
                                            let finalProduct = product;
                                            if (product?._fromShared || product?._source === 'shared' || product?.is_shared) {
                                                const cloned = HEYS.products?.addFromShared?.(product);
                                                if (cloned) {
                                                    finalProduct = cloned;
                                                }
                                            }

                                            const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
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

                                            setDay((prevDay = {}) => {
                                                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                                    i === targetMealIndex
                                                        ? { ...m, items: [...(m.items || []), newItem] }
                                                        : m,
                                                );
                                                const newDayData = { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };

                                                const key = 'heys_dayv2_' + date;
                                                try {
                                                    lsSet(key, newDayData);
                                                } catch (e) {
                                                    trackError(e, { source: 'day/_meals.js', action: 'save_product' });
                                                }

                                                return newDayData;
                                            });

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
                                            if (scrollToDiaryHeading) scrollToDiaryHeading();
                                        },
                                        onNewProduct: () => {
                                            if (window.HEYS?.products?.showAddModal) {
                                                window.HEYS.products.showAddModal();
                                            }
                                        },
                                    });
                                }
                            }, 0);
                        }, 50);
                    },
                });
            } else if (isMobile) {
                if (openTimePickerForNewMeal) openTimePickerForNewMeal();
            } else {
                const newMealId = uid('m_');
                let newMealIndex = 0;
                setDay((prevDay) => {
                    const baseMeals = prevDay.meals || [];
                    const newMeals = [...baseMeals, { id: newMealId, name: 'Приём', time: '', mood: '', wellbeing: '', stress: '', items: [] }];
                    newMealIndex = newMeals.length - 1;
                    return { ...prevDay, meals: newMeals, updatedAt: Date.now() };
                });
                expandOnlyMeal(newMealIndex);
                if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('meal-created');
                }
                HEYS.Toast?.success('Приём создан');
            }
        }, [date, expandOnlyMeal, isMobile, openTimePickerForNewMeal, products, setDay, day, prof, pIndex, getProductFromItem, scrollToDiaryHeading, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const updateMealTime = React.useCallback((mealIndex, newTime) => {
            setDay((prevDay) => {
                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, time: newTime } : m,
                );
                const sortedMeals = sortMealsByTime(updatedMeals);
                return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeMeal = React.useCallback(async (i) => {
            const confirmed = await HEYS.ConfirmModal?.confirmDelete({
                icon: '🗑️',
                title: 'Удалить приём пищи?',
                text: 'Все продукты в этом приёме будут удалены. Это действие нельзя отменить.',
            });

            if (!confirmed) return;

            haptic('medium');
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).filter((_, idx) => idx !== i);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [haptic, setDay]);

        const addProductToMeal = React.useCallback((mi, p) => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление продуктов недоступно');
                return;
            }

            haptic('light');

            let finalProduct = p;
            if (p?._fromShared || p?._source === 'shared' || p?.is_shared) {
                const cloned = HEYS.products?.addFromShared?.(p);
                if (cloned) {
                    finalProduct = cloned;
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
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: [...(m.items || []), item] } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });

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
        }, [haptic, setDay, setNewItemIds, date]);

        const setGrams = React.useCallback((mi, itId, g) => {
            const grams = +g || 0;
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).map((it) => it.id === itId ? { ...it, grams } : it) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeItem = React.useCallback((mi, itId) => {
            haptic('medium');
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).filter((it) => it.id !== itId) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
            setTimeout(() => {
                if (window.HEYS?.orphanProducts?.recalculate) {
                    window.HEYS.orphanProducts.recalculate();
                }
            }, 100);
        }, [haptic, setDay]);

        const updateMealField = React.useCallback((mealIndex, field, value) => {
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mealIndex ? { ...m, [field]: value } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

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
            setGrams,
            removeItem,
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

    console.log('[HEYS] ✅ day/_meals.js FINISHED, dayMealExpandState =', !!HEYS.dayMealExpandState?.useMealExpandState);

})(window);
