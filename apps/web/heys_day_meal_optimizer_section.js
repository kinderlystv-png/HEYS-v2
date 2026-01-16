// heys_day_meal_optimizer_section.js — MealOptimizerSection component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    const MealOptimizerSection = React.memo(function MealOptimizerSection(props) {
        const { meal, totals, dayData, profile, products, pIndex, mealIndex, addProductToMeal } = props || {};
        const MO = HEYS.MealOptimizer;
        const [optExpanded, setOptExpanded] = React.useState(true);
        const [debouncedMeal, setDebouncedMeal] = React.useState(meal);

        if (!meal?.items?.length) return null;

        React.useEffect(() => {
            const timer = setTimeout(() => setDebouncedMeal(meal), 300);
            return () => clearTimeout(timer);
        }, [meal]);

        const recommendations = React.useMemo(() => {
            if (!MO) return [];
            return MO.getMealOptimization({
                meal: debouncedMeal,
                mealTotals: totals,
                dayData,
                profile,
                products,
                pIndex,
                avgGI: totals?.gi || 50
            });
        }, [debouncedMeal, totals, dayData, profile, products, pIndex]);

        const visibleRecs = React.useMemo(() => {
            if (!MO) return [];
            const filtered = recommendations.filter(r => !MO.shouldHideRecommendation(r.id));

            const seen = new Map();
            filtered.forEach(r => {
                const key = r.title.toLowerCase().trim();
                if (!seen.has(key) || (seen.get(key).priority || 0) < (r.priority || 0)) {
                    seen.set(key, r);
                }
            });
            const deduped = Array.from(seen.values());

            return deduped.sort((a, b) => {
                if (a.isWarning && !b.isWarning) return -1;
                if (!a.isWarning && b.isWarning) return 1;
                const aHasProds = (a.products?.length || 0) > 0 ? 1 : 0;
                const bHasProds = (b.products?.length || 0) > 0 ? 1 : 0;
                if (aHasProds !== bHasProds) return bHasProds - aHasProds;
                return (b.priority || 50) - (a.priority || 50);
            });
        }, [recommendations]);

        const handleAddProduct = React.useCallback((product, ruleId) => {
            if (!addProductToMeal || !product || !MO) return;

            const portion = MO.getSmartPortion(product);
            const productWithGrams = { ...product, grams: portion.grams };

            addProductToMeal(mealIndex, productWithGrams);

            MO.trackUserAction({
                type: 'accept',
                ruleId,
                productId: product.id,
                productName: product.name
            });
        }, [addProductToMeal, mealIndex]);

        const handleDismiss = React.useCallback((ruleId) => {
            if (!MO) return;
            MO.trackUserAction({
                type: 'dismiss',
                ruleId
            });
        }, []);

        if (visibleRecs.length === 0) return null;

        const bestRec = visibleRecs[0];
        const restRecs = visibleRecs.slice(1);

        return React.createElement('div', {
            className: 'meal-optimizer' + (optExpanded ? ' meal-optimizer--expanded' : '')
        },
            React.createElement('div', {
                className: 'meal-optimizer__header',
                onClick: () => restRecs.length > 0 && setOptExpanded(!optExpanded)
            },
                React.createElement('span', { className: 'meal-optimizer__header-icon' }, bestRec.icon),
                React.createElement('div', { className: 'meal-optimizer__header-text' },
                    React.createElement('div', { className: 'meal-optimizer__header-title' }, bestRec.title),
                    React.createElement('div', { className: 'meal-optimizer__header-reason' }, bestRec.reason)
                ),
                React.createElement('div', { className: 'meal-optimizer__header-right' },
                    restRecs.length > 0 && React.createElement('span', { className: 'meal-optimizer__badge' },
                        '+' + restRecs.length
                    ),
                    restRecs.length > 0 && React.createElement('span', {
                        className: 'meal-optimizer__toggle' + (optExpanded ? ' meal-optimizer__toggle--expanded' : '')
                    }, '▼'),
                    React.createElement('button', {
                        className: 'meal-optimizer__dismiss',
                        onClick: (e) => { e.stopPropagation(); handleDismiss(bestRec.id); },
                        title: 'Скрыть'
                    }, '×')
                )
            ),

            bestRec.products && bestRec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
                bestRec.products.map((prod, pIdx) =>
                    React.createElement('button', {
                        key: prod.id || pIdx,
                        className: 'meal-optimizer__product',
                        onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, bestRec.id); },
                        title: `Добавить ${prod.name}`
                    },
                        React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                        prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                        React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                    )
                )
            ),

            optExpanded && restRecs.length > 0 && React.createElement('div', { className: 'meal-optimizer__content' },
                restRecs.map((rec) =>
                    React.createElement('div', {
                        key: rec.id,
                        className: 'meal-optimizer__item'
                            + (rec.isWarning ? ' meal-optimizer__item--warning' : '')
                            + (rec.isInfo ? ' meal-optimizer__item--info' : '')
                    },
                        React.createElement('div', { className: 'meal-optimizer__item-header' },
                            React.createElement('span', { className: 'meal-optimizer__item-icon' }, rec.icon),
                            React.createElement('div', { className: 'meal-optimizer__item-content' },
                                React.createElement('div', { className: 'meal-optimizer__item-title' }, rec.title),
                                React.createElement('div', { className: 'meal-optimizer__item-reason' }, rec.reason),
                                rec.science && React.createElement('div', { className: 'meal-optimizer__item-science' }, rec.science)
                            ),
                            React.createElement('button', {
                                className: 'meal-optimizer__item-dismiss',
                                onClick: (e) => { e.stopPropagation(); handleDismiss(rec.id); },
                                title: 'Больше не показывать'
                            }, '×')
                        ),

                        rec.products && rec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
                            rec.products.map((prod, pIdx) =>
                                React.createElement('button', {
                                    key: prod.id || pIdx,
                                    className: 'meal-optimizer__product',
                                    onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, rec.id); },
                                    title: `Добавить ${prod.name}`
                                },
                                    React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                                    prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                                    React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                                )
                            )
                        )
                    )
                )
            )
        );
    });

    HEYS.dayMealOptimizerSection = {
        MealOptimizerSection
    };
})(window);
