(function (HEYS) {
    'use strict';

    const renderDiarySection = (params) => {

        const {
            React,
            isMobile,
            mobileSubTab,
            goalProgressBar,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            addMeal,
            day,
            mealsUI,
            daySummary,
            caloricDebt,
            eatenKcal,
            optimum,
            displayOptimum,
            date,
            prof,
            pIndex,
            dayTot,
            normAbs,
            HEYS: rootHEYs
        } = params || {};

        if (!React) {
            console.warn('[HEYS.diary] ❌ No React provided, returning null');
            return null;
        }

        const app = rootHEYs || HEYS;
        const showDiary = !isMobile || mobileSubTab === 'diary';

        const ensureSupplementsModule = () => {
            if (app.Supplements?.renderCard) return true;
            if (typeof document === 'undefined') return false;
            if (window.__heysSupplementsLoading) return false;

            window.__heysSupplementsLoading = true;
            const script = document.createElement('script');
            script.src = 'heys_supplements_v1.js?v=1';
            script.async = true;
            script.onload = () => {
                window.__heysSupplementsLoading = false;
                window.dispatchEvent(new CustomEvent('heys-deferred-module-loaded', {
                    detail: { module: 'supplements' }
                }));
            };
            script.onerror = () => {
                window.__heysSupplementsLoading = false;
            };
            document.head.appendChild(script);
            return false;
        };

        const insulinIndicator = app.dayInsulinWaveUI?.renderInsulinWaveIndicator?.({
            React,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            mobileSubTab,
            isMobile,
            openExclusivePopup,
            HEYS: app
        }) || null;

        const refeedCard = app.Refeed?.renderRefeedCard?.({
            isRefeedDay: day?.isRefeedDay,
            refeedReason: day?.refeedReason,
            caloricDebt,
            eatenKcal,
            optimum
        }) || null;


        // PERF v8.0: Separate module readiness from content — enables skeleton UX
        const cascadeReady = !!app.CascadeCard?.renderCard;
        const cascadeCard = cascadeReady ? (app.CascadeCard.renderCard({
            React, day, prof, pIndex, dayTot, normAbs
        }) || null) : null;

        const mealRecReady = !!app.MealRecCard?.renderCard && !!app.InsightsPI?.mealRecommender?.recommend;
        const mealRecCard = mealRecReady ? (app.MealRecCard.renderCard({
            React,
            day,
            prof,
            pIndex,
            dayTot,
            normAbs,
            optimum: displayOptimum || optimum
        }) || null) : null;

        if (mealRecCard) {
            if (!window.__heysLoggedMealRecRendered) {
                window.__heysLoggedMealRecRendered = true;
                console.info('[HEYS.diary] ✅ Meal rec card rendered');
            }
        } else if (mealRecReady) {
            // Only log when module loaded but no recommendation (not when still loading)
            if (!window.__heysLoggedMealRecNull) {
                window.__heysLoggedMealRecNull = true;
                console.info('[HEYS.diary] ℹ️ Meal rec card: no recommendation');
            }
        }

        const dateKey = date
            || day?.date
            || app.models?.todayISO?.()
            || new Date().toISOString().slice(0, 10);
        const supplementsReady = !!app.Supplements?.renderCard;
        if (!supplementsReady) ensureSupplementsModule();
        const supplementsCard = supplementsReady && dateKey ? (app.Supplements.renderCard({
            dateKey,
            dayData: day,
            onForceUpdate: () => {
                window.dispatchEvent(new CustomEvent('heys:day-updated', {
                    detail: { date: dateKey, source: 'supplements-update', forceReload: true }
                }));
            }
        }) || null) : null;

        // PERF v8.3: Deferred card slot — skeleton only after postboot completes
        // If postboot is still loading scripts, return null (invisible).
        // Skeleton only shows if postboot finished but module is STILL not ready (abnormal).
        const DEFERRED_SKELETON_DELAY_MS = 260;
        const deferredSlotLoadSince = window.__heysDeferredSlotLoadSince = window.__heysDeferredSlotLoadSince || Object.create(null);
        const deferredSkeletonState = window.__heysDeferredSkeletonState = window.__heysDeferredSkeletonState || Object.create(null);
        const deferredPendingSlot = (slotKey) => React.createElement('div', {
            key: slotKey,
            className: 'deferred-card-slot deferred-card-slot--pending',
            'aria-hidden': 'true'
        });
        const deferredSlot = (ready, content, slotKey, skeletonH, skeletonIcon, skeletonLabel) => {
            const debugKey = slotKey || 'unknown-slot';
            if (!ready) {
                // Don't show skeleton while postboot is still loading scripts
                if (!window.__heysPostbootDone) {
                    if (deferredSkeletonState[debugKey] !== 'wait_postboot') {
                        console.info('[HEYS.sceleton] ⏳ wait_postboot', { slotKey: debugKey });
                        deferredSkeletonState[debugKey] = 'wait_postboot';
                    }
                    return deferredPendingSlot(slotKey); // Keep stable DOM slot, zero-height
                }

                // Anti-flicker: render skeleton only if module is still not ready after a small delay
                const now = Date.now();
                if (slotKey && !deferredSlotLoadSince[slotKey]) {
                    deferredSlotLoadSince[slotKey] = now;
                }
                const waitStart = slotKey ? deferredSlotLoadSince[slotKey] : now;
                if ((now - waitStart) < DEFERRED_SKELETON_DELAY_MS) {
                    if (deferredSkeletonState[debugKey] !== 'wait_delay') {
                        console.info('[HEYS.sceleton] ⏱️ wait_delay', {
                            slotKey: debugKey,
                            elapsedMs: now - waitStart,
                            delayMs: DEFERRED_SKELETON_DELAY_MS
                        });
                        deferredSkeletonState[debugKey] = 'wait_delay';
                    }
                    return deferredPendingSlot(slotKey);
                }

                if (deferredSkeletonState[debugKey] !== 'show_skeleton') {
                    console.info('[HEYS.sceleton] 🦴 show_skeleton', {
                        slotKey: debugKey,
                        elapsedMs: now - waitStart,
                        delayMs: DEFERRED_SKELETON_DELAY_MS
                    });
                    deferredSkeletonState[debugKey] = 'show_skeleton';
                }

                return React.createElement('div', { key: slotKey, className: 'deferred-card-slot deferred-card-slot--loading' },
                    React.createElement('div', {
                        className: 'deferred-card-skeleton',
                        style: { minHeight: skeletonH + 'px' }
                    },
                        React.createElement('div', { className: 'deferred-card-skeleton__shimmer' }),
                        React.createElement('div', { className: 'deferred-card-skeleton__content' },
                            skeletonIcon && React.createElement('div', { className: 'deferred-card-skeleton__icon' }, skeletonIcon),
                            skeletonLabel && React.createElement('div', { className: 'deferred-card-skeleton__label' }, skeletonLabel)
                        )
                    )
                );
            }

            if (slotKey && deferredSlotLoadSince[slotKey]) {
                delete deferredSlotLoadSince[slotKey];
            }

            if (!content) {
                if (deferredSkeletonState[debugKey] !== 'ready_empty') {
                    console.info('[HEYS.sceleton] ℹ️ ready_empty', { slotKey: debugKey });
                    deferredSkeletonState[debugKey] = 'ready_empty';
                }
                return React.createElement('div', { key: slotKey, className: 'deferred-card-slot deferred-card-slot--empty' });
            }
            if (deferredSkeletonState[debugKey] !== 'ready_content') {
                console.info('[HEYS.sceleton] ✅ ready_content', { slotKey: debugKey });
                deferredSkeletonState[debugKey] = 'ready_content';
            }
            const slotTypeClass = slotKey ? ('deferred-card-slot--' + String(slotKey).replace(/^slot-/, '')) : '';
            // PERF: skip unfold animation if user has cached local data (returning user)
            // Meal rec card always uses smooth unfold (loads late, needs visual transition)
            const animClass = (window.__heysHasLocalData && slotKey !== 'slot-mealrec') ? 'no-animate' : 'animate-always';
            return React.createElement('div', {
                key: slotKey,
                className: ('deferred-card-slot deferred-card-slot--loaded ' + animClass + ' ' + slotTypeClass).trim()
            }, content);
        };

        if (!showDiary) return insulinIndicator;

        return React.createElement(React.Fragment, null,
            React.createElement('h2', {
                id: 'day-remaining-heading',
                style: {
                    fontSize: '24px',
                    fontWeight: '800',
                    color: 'var(--text, #1e293b)',
                    margin: '12px 0 16px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    scrollMarginTop: '150px'
                }
            }, 'ОСТАЛОСЬ НА СЕГОДНЯ'),
            goalProgressBar,
            deferredSlot(cascadeReady, cascadeCard, 'slot-cascade', 140, '🔬', 'Анализируем ваши данные, чтобы показать состояние поведенческого каскада'),
            refeedCard,
            deferredSlot(mealRecReady, mealRecCard, 'slot-mealrec', 72, '🍽️', 'Загружаем ваши данные, чтобы умный планировщик дал точные рекомендации на остаток дня'),
            deferredSlot(supplementsReady, supplementsCard, 'slot-supplements', 96, '💊', 'Подготавливаем план добавок на сегодня'),
            mealsChart,
            insulinIndicator,
            React.createElement('h2', {
                id: 'diary-heading',
                style: {
                    fontSize: '24px',
                    fontWeight: '800',
                    color: 'var(--text, #1e293b)',
                    margin: '28px 0 20px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    scrollMarginTop: '150px'
                }
            }, 'ДНЕВНИК ПИТАНИЯ'),
            React.createElement('button', {
                className: 'add-meal-btn-full',
                onClick: addMeal,
                style: {
                    width: '100%',
                    padding: '18px 24px',
                    marginBottom: '20px',
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#fff',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                    transition: 'all 0.2s ease',
                    WebkitTapHighlightColor: 'transparent'
                }
            },
                React.createElement('span', { style: { fontSize: '22px' } }, '➕'),
                'Добавить приём пищи'
            ),
            (!day?.meals || day.meals.length === 0) && React.createElement('div', { className: 'empty-state' },
                React.createElement('div', { className: 'empty-state-icon' }, '🍽️'),
                React.createElement('div', { className: 'empty-state-title' }, 'Пока нет приёмов пищи'),
                React.createElement('div', { className: 'empty-state-text' }, 'Добавьте первый приём, чтобы начать отслеживание'),
                React.createElement('button', {
                    className: 'btn btn-primary empty-state-btn',
                    onClick: addMeal,
                    style: {
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
                    }
                }, '+ Добавить приём')
            ),
            mealsUI,
            daySummary,
            React.createElement('div', { className: 'row desktop-only', style: { justifyContent: 'flex-start', marginTop: '8px' } },
                React.createElement('button', { className: 'btn', onClick: addMeal }, '+ Приём')
            )
        );
    };

    HEYS.dayDiarySection = HEYS.dayDiarySection || {};
    HEYS.dayDiarySection.renderDiarySection = renderDiarySection;
})(window.HEYS = window.HEYS || {});
