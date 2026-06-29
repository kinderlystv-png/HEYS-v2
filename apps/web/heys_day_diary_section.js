(function (HEYS) {
    'use strict';

    // PERF R16-FIX: LazyMount MUST be defined OUTSIDE renderDiarySection.
    // Defining a React component type inside a render function creates a new type
    // on every call — React unmounts/remounts the subtree on every parent re-render,
    // resetting state to false and triggering infinite re-mount cycles that cause
    // storeRecommendation → sync spam → setPendingCount → parent re-render loops.
    // Solution: lazy-init once with the React instance captured on first call.
    let _LazyMount = null;
    let _DiaryCompactSummary = null;
    let _DiaryFiberPanel = null;
    let _DiaryOptionalPanels = null;
    let _DiaryPanelGate = null;

    const HEALTH_TREND_PERIOD_STORAGE_KEY = 'heys_diary_health_trend_period_v1';
    const FIBER_PANEL_PROFILE_FIELD = 'showDiaryFiberPanel';
    const SCORE_RISK_TREND_PANEL_PROFILE_FIELD = 'showDiaryScoreRiskTrendPanel';
    const WATER_PANEL_PROFILE_FIELD = 'showDiaryWaterPanel';
    const PLANNER_PANEL_PROFILE_FIELD = 'showDiaryPlannerPanel';
    const SUPPLEMENTS_PANEL_PROFILE_FIELD = 'showDiarySupplementsPanel';
    const DISTRIBUTION_PANEL_PROFILE_FIELD = 'showDiaryDistributionPanel';
    const INSULIN_WAVE_PANEL_PROFILE_FIELD = 'showDiaryInsulinWavePanel';
    function getLazyMount(React) {
        if (_LazyMount) return _LazyMount;
        _LazyMount = React.memo(function LazyMount(props) {
            const { minHeight, rootMargin, children } = props;
            const ref = React.useRef(null);
            const [visible, setVisible] = React.useState(false);
            React.useEffect(() => {
                const el = ref.current;
                if (!el || visible) return;
                if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
                const io = new IntersectionObserver(function onEntry(entries) {
                    if (entries[0].isIntersecting) {
                        console.info('[HEYS.diary] 👁️ LazyMount visible — mounting below-fold cards');
                        setVisible(true); io.disconnect();
                    }
                }, { rootMargin: rootMargin || '400px 0px' });
                io.observe(el);
                return () => io.disconnect();
            }, [visible, rootMargin]);
            if (!visible) {
                return React.createElement('div', {
                    ref,
                    className: 'deferred-card-slot deferred-card-slot--lazy',
                    style: { minHeight: minHeight || 0 },
                    'aria-hidden': 'true'
                });
            }
            return React.createElement(React.Fragment, null, children);
        });
        console.info('[HEYS.diary] ✅ LazyMount component created (stable type, R16-fix)');
        return _LazyMount;
    }

    function getStoredHealthTrendPeriod() {
        try {
            const raw = window.localStorage?.getItem?.(HEALTH_TREND_PERIOD_STORAGE_KEY);
            return Number(raw) === 7 ? 7 : 30;
        } catch (_) {
            return 30;
        }
    }

    function saveStoredHealthTrendPeriod(periodDays) {
        try {
            window.localStorage?.setItem?.(HEALTH_TREND_PERIOD_STORAGE_KEY, String(periodDays));
        } catch (_) {
            // noop
        }
    }

    function getDiaryPanelVisibilitySource(profile, field) {
        const stored = window.HEYS?.utils?.lsGet?.('heys_profile', {}) || {};
        if (stored && typeof stored === 'object' && Object.prototype.hasOwnProperty.call(stored, field)) {
            return stored;
        }
        return profile && typeof profile === 'object' ? profile : stored;
    }

    function readDiaryFiberPanelEnabled(profile) {
        const source = getDiaryPanelVisibilitySource(profile, FIBER_PANEL_PROFILE_FIELD);
        return source?.[FIBER_PANEL_PROFILE_FIELD] !== false;
    }

    function readDiaryPanelEnabled(profile, field) {
        const source = getDiaryPanelVisibilitySource(profile, field);
        return source?.[field] !== false;
    }

    function getDiaryPanelGateComponent(React) {
        if (_DiaryPanelGate) return _DiaryPanelGate;

        _DiaryPanelGate = React.memo(function DiaryPanelGate(props) {
            const { profile, field, children } = props || {};
            const [enabled, setEnabled] = React.useState(function initDiaryPanelGateEnabled() {
                return readDiaryPanelEnabled(profile, field);
            });

            React.useEffect(function syncDiaryPanelGateFromProfile() {
                setEnabled(readDiaryPanelEnabled(profile, field));
            }, [profile?.[field], field]);

            React.useEffect(function listenDiaryPanelGateVisibility() {
                const sync = function syncDiaryPanelGateVisibility() {
                    setEnabled(readDiaryPanelEnabled(null, field));
                };
                window.addEventListener('heys:diary-optional-panels-visibility-changed', sync);
                window.addEventListener('heys:profile-updated', sync);
                return function cleanupDiaryPanelGateVisibility() {
                    window.removeEventListener('heys:diary-optional-panels-visibility-changed', sync);
                    window.removeEventListener('heys:profile-updated', sync);
                };
            }, [field]);

            if (!enabled) return null;
            return React.createElement(React.Fragment, null, children);
        });

        return _DiaryPanelGate;
    }

    function writeDiaryFiberPanelEnabled(enabled) {
        const utils = window.HEYS?.utils;
        const currentProfile = utils?.lsGet?.('heys_profile', {}) || {};
        const updatedProfile = {
            ...currentProfile,
            [FIBER_PANEL_PROFILE_FIELD]: enabled !== false,
        };
        utils?.lsSet?.('heys_profile', updatedProfile);
        try {
            window.dispatchEvent(new CustomEvent('heys:diary-fiber-panel-visibility-changed', {
                detail: { enabled: enabled !== false }
            }));
            window.dispatchEvent(new CustomEvent('heys:profile-updated', {
                detail: {
                    field: FIBER_PANEL_PROFILE_FIELD,
                    fields: [FIBER_PANEL_PROFILE_FIELD],
                    source: 'diary-fiber-panel',
                }
            }));
        } catch (_) {
            // noop
        }
        return updatedProfile;
    }

    function getSafeNormAbs(app, profile, pIndex, normAbs) {
        const current = normAbs && typeof normAbs === 'object' ? normAbs : {};
        if (Number(current.kcal) > 0 || Number(current.prot) > 0) return current;

        let resolved = app.norms?.getNormAbs?.(profile, pIndex) || {};
        if (Number(resolved.kcal) > 0 || Number(resolved.prot) > 0) return resolved;

        if (typeof app.TDEE?.calculate === 'function') {
            const tdee = app.TDEE.calculate(profile || {});
            if (tdee && tdee.optimum > 0) {
                const weight = Number(profile?.weight || profile?.baseWeight || 70) || 70;
                resolved = {
                    kcal: tdee.optimum,
                    prot: Math.round(weight * 1.6)
                };
            }
        }

        return resolved || {};
    }

    function getSafeDayScoreSummary(app, options = {}) {
        const dayData = options.dayData || {};
        const profile = options.profile || {};
        const pIndex = options.pIndex || profile?.pIndex || 0;
        const waterGoal = app.utils?.calculateWaterGoal?.(profile?.weight) || 2000;
        const dayTot = (options.dayTot && Object.keys(options.dayTot).length)
            ? options.dayTot
            : (app.DayData?.getDayTot?.(dayData)
                || (typeof app.dayCalculations?.calculateDayTotals === 'function'
                    ? app.dayCalculations.calculateDayTotals(dayData)
                    : {}));
        const normAbs = getSafeNormAbs(app, profile, pIndex, options.normAbs);

        const dayScore = typeof app.DayScore?.calculateDayScore === 'function'
            ? app.DayScore.calculateDayScore({
                dayData,
                profile,
                dayTot,
                normAbs,
                waterGoal,
                pIndex
            })
            : null;

        const riskRadar = typeof app.RiskRadar?.calculate === 'function'
            ? app.RiskRadar.calculate({
                dayData,
                profile,
                dayTot,
                normAbs,
                pIndex
            })
            : null;

        return {
            dayData,
            dayTot,
            normAbs,
            waterGoal,
            pIndex,
            dayScore,
            riskRadar
        };
    }

    function getHealthTrendLevel(score) {
        const numericScore = Number(score) || 0;
        if (numericScore >= 85) return { id: 'excellent', color: '#10b981' };
        if (numericScore >= 70) return { id: 'good', color: '#22c55e' };
        if (numericScore >= 50) return { id: 'attention', color: '#eab308' };
        if (numericScore >= 30) return { id: 'warning', color: '#f97316' };
        return { id: 'critical', color: '#ef4444' };
    }

    function getSafeHealthTrendSummary(app, options = {}) {
        const periodDays = Number(options.periodDays) === 7 ? 7 : 30;

        try {
            if (typeof app.Widgets?.data?.getHealthTrendData === 'function') {
                const widgetData = app.Widgets.data.getHealthTrendData({ periodDays });
                if (widgetData?.hasData) {
                    return {
                        ...widgetData,
                        level: getHealthTrendLevel(widgetData.score)
                    };
                }
            }

            const analyze = app.PredictiveInsights?.analyze;
            if (typeof analyze !== 'function') return null;

            const result = analyze({ daysBack: periodDays });
            if (!result?.available || !result?.healthScore) return null;

            const score = Number(result.healthScore.total) || 0;
            const hasData = score > 0 || Number(result.daysWithData) >= 3;
            if (!hasData) return null;

            return {
                hasData,
                score,
                periodDays,
                daysWithData: Number(result.daysWithData) || 0,
                level: getHealthTrendLevel(score)
            };
        } catch (error) {
            console.warn('[HEYS.diary] Health trend summary unavailable', error?.message || error);
            return null;
        }
    }

    function getSafeFiberTarget(dayTot, normAbs) {
        const explicitTarget = Number(normAbs?.fiber) || 0;
        if (explicitTarget > 0) return explicitTarget;

        const kcalTarget = Number(normAbs?.kcal) || Number(dayTot?.kcal) || 0;
        if (kcalTarget > 0) return (kcalTarget / 1000) * 14;

        return 25;
    }

    function roundFiberValue(value) {
        return Math.round((Number(value) || 0) * 10) / 10;
    }

    function addDaysISO(dateStr, delta) {
        const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))
            ? new Date(String(dateStr) + 'T12:00:00')
            : new Date();
        base.setDate(base.getDate() + delta);
        return base.toISOString().slice(0, 10);
    }

    function getFiberContributions(dayData, pIndex, app, eatenFiber) {
        const models = app?.models || {};
        const getProductFromItem = models.getProductFromItem || app?.dayUtils?.getProductFromItem;
        const per100 = models.per100 || app?.dayUtils?.per100;
        const byKey = new Map();

        (dayData?.meals || []).forEach(function eachMeal(meal) {
            (meal?.items || []).forEach(function eachItem(item) {
                const grams = Number(item?.grams) || 0;
                if (grams <= 0) return;

                const product = typeof getProductFromItem === 'function'
                    ? (getProductFromItem(item, pIndex) || item)
                    : item;
                const per = typeof per100 === 'function'
                    ? per100(product || {})
                    : { fiber100: Number(product?.fiber100 ?? item?.fiber100) || 0 };
                const fiber = roundFiberValue(((Number(per?.fiber100) || 0) * grams) / 100);
                if (fiber <= 0) return;

                const name = String(product?.name || item?.name || 'Продукт').trim() || 'Продукт';
                const key = String(product?.id || item?.product_id || item?.productId || name).toLowerCase();
                const current = byKey.get(key) || { name, grams: 0, fiber: 0 };
                current.grams += grams;
                current.fiber = roundFiberValue(current.fiber + fiber);
                byKey.set(key, current);
            });
        });

        const items = Array.from(byKey.values())
            .filter(function hasFiber(item) { return item.fiber > 0; })
            .sort(function sortByFiber(a, b) { return b.fiber - a.fiber || a.name.localeCompare(b.name, 'ru'); });
        const knownFiber = roundFiberValue(items.reduce(function sumFiber(sum, item) { return sum + item.fiber; }, 0));
        const missingFiber = roundFiberValue((Number(eatenFiber) || 0) - knownFiber);
        if (missingFiber > 0.4) {
            items.push({ name: 'Другие продукты', grams: 0, fiber: missingFiber, isFallback: true });
        }

        return items;
    }

    function classifyFiberContribution(name) {
        const text = String(name || '').toLowerCase();
        const soluble = /(овс|овся|ячмен|перлов|чечев|фасол|нут|горох|боб|яблок|груш|ягод|черник|малин|смород|слив|цитрус|апельс|псиллиум|семя|лен|чиа)/i.test(text);
        const insoluble = /(греч|рис|булгур|киноа|хлеб|цельн|отруб|капуст|брокк|морков|огур|томат|салат|зелень|перец|кабач|баклаж|картоф|свекл)/i.test(text);
        if (soluble && insoluble) return { soluble: 0.5, insoluble: 0.5 };
        if (soluble) return { soluble: 0.7, insoluble: 0.3 };
        if (insoluble) return { soluble: 0.3, insoluble: 0.7 };
        return { soluble: 0.45, insoluble: 0.55 };
    }

    function getFiberTypeSummary(contributions) {
        let soluble = 0;
        let insoluble = 0;
        (contributions || []).forEach(function eachContribution(item) {
            const fiber = Number(item?.fiber) || 0;
            if (fiber <= 0) return;
            const ratio = item?.isFallback ? { soluble: 0.45, insoluble: 0.55 } : classifyFiberContribution(item.name);
            soluble += fiber * ratio.soluble;
            insoluble += fiber * ratio.insoluble;
        });
        const total = soluble + insoluble;
        if (total <= 0) {
            return { solublePct: 0, insolublePct: 0, label: 'типы: овёс + овощи' };
        }
        const solublePct = Math.round((soluble / total) * 100);
        const insolublePct = Math.max(0, 100 - solublePct);
        return {
            solublePct,
            insolublePct,
            label: 'раствор. ' + solublePct + '% · грубая ' + insolublePct + '%'
        };
    }

    function getFiberSoftPlan(eaten, target) {
        const remaining = Math.max(0, (Number(target) || 0) - (Number(eaten) || 0));
        if (remaining <= 0.4) {
            return { label: 'норма без перегруза', addToday: 0, note: 'Сегодня достаточно не перегружать день.' };
        }
        const pct = target > 0 ? (eaten / target) * 100 : 0;
        const softAdd = remaining > 8 || pct < 45 ? Math.min(6, remaining) : Math.min(remaining, 8);
        const rounded = Math.max(1, Math.ceil(softAdd));
        return {
            label: 'мягко +' + rounded + ' г сегодня',
            addToday: rounded,
            note: remaining > rounded + 1
                ? 'Остальное лучше добрать постепенно за неделю.'
                : 'Осталось немного: можно закрыть норму сегодня.'
        };
    }

    function isLikelyFiberProductName(name) {
        const text = String(name || '').trim().toLowerCase();
        if (!text) return false;
        if (/оценоч|расч[её]т|завтрак|обед|ужин|перекус|ночной|при[её]м/.test(text)) return false;
        return true;
    }

    function getDayFiberTotal(dayData, pIndex, app, fallbackTotal) {
        if (!dayData || typeof dayData !== 'object') return Number(fallbackTotal) || 0;
        if (Number(dayData?.totals?.fiber) > 0) return Number(dayData.totals.fiber) || 0;
        if (Number(dayData?.dayTot?.fiber) > 0) return Number(dayData.dayTot.fiber) || 0;
        const mealTotals = app?.models?.mealTotals;
        if (typeof mealTotals === 'function') {
            return roundFiberValue((dayData.meals || []).reduce(function sumMeals(sum, meal) {
                const mt = mealTotals(meal, pIndex) || {};
                return sum + (Number(mt.fiber) || 0);
            }, 0));
        }
        const contributions = getFiberContributions(dayData, pIndex, app, 0);
        return roundFiberValue(contributions.reduce(function sumContributions(sum, item) {
            return sum + (Number(item.fiber) || 0);
        }, 0));
    }

    function getFiberWeekSummary(dateKey, dayData, dayTot, target, pIndex, app) {
        const loadDay = app?.dayUtils?.loadDay;
        const days = [];
        const sourceTotals = new Map();

        for (let i = 6; i >= 0; i -= 1) {
            const iso = addDaysISO(dateKey, -i);
            const data = i === 0 ? dayData : (typeof loadDay === 'function' ? loadDay(iso) : null);
            const fallbackFiber = i === 0 ? Number(dayTot?.fiber) || 0 : 0;
            const fiber = roundFiberValue(getDayFiberTotal(data, pIndex, app, fallbackFiber));
            const hasData = !!(data && Array.isArray(data.meals) && data.meals.some(function hasItems(meal) {
                return Array.isArray(meal?.items) && meal.items.length > 0;
            }));
            if (hasData || fiber > 0) {
                getFiberContributions(data, pIndex, app, fiber).forEach(function collectSource(item) {
                    if (!item?.name || item.isFallback) return;
                    if (!isLikelyFiberProductName(item.name)) return;
                    sourceTotals.set(item.name, roundFiberValue((sourceTotals.get(item.name) || 0) + (Number(item.fiber) || 0)));
                });
            }
            days.push({ date: iso, fiber, hasData });
        }

        const dataDays = days.filter(function hasDay(day) { return day.hasData || day.fiber > 0; });
        const denominator = dataDays.length || days.length || 1;
        const avg = roundFiberValue(days.reduce(function sumDays(sum, day) { return sum + day.fiber; }, 0) / denominator);
        const underDays = days.filter(function isUnder(day) { return day.fiber > 0 && day.fiber < target; }).length;
        let underStreak = 0;
        for (let i = days.length - 1; i >= 0; i -= 1) {
            if (days[i].fiber > 0 && days[i].fiber < target) underStreak += 1;
            else if (days[i].fiber >= target) break;
        }
        const best = Array.from(sourceTotals.entries())
            .sort(function sortSources(a, b) { return b[1] - a[1] || a[0].localeCompare(b[0], 'ru'); })[0];

        return {
            days,
            avg,
            avgGap: roundFiberValue(Math.max(0, target - avg)),
            underDays,
            underStreak,
            bestSource: best ? { name: best[0], fiber: best[1] } : null
        };
    }

    function getDiaryFiberPanelComponent(React) {
        if (_DiaryFiberPanel) return _DiaryFiberPanel;

        const fiberSources = [
            { icon: '🥦', title: 'Овощи', note: 'К каждому основному приёму', grams: '5-8 г' },
            { icon: '🫘', title: 'Бобовые', note: 'Чечевица, фасоль, нут', grams: '8-12 г' },
            { icon: '🌾', title: 'Цельные злаки', note: 'Овсянка, гречка, цельнозерновой хлеб', grams: '4-7 г' },
            { icon: '🫐', title: 'Ягоды и фрукты', note: 'Ягоды, яблоко, груша', grams: '3-6 г' }
        ];

        _DiaryFiberPanel = React.memo(function DiaryFiberPanel(props) {
            const { app, dateKey, dayData, dayTot, normAbs, pIndex, profile } = props || {};
            const [expanded, setExpanded] = React.useState(false);
            const [enabled, setEnabled] = React.useState(function initFiberPanelEnabled() {
                return readDiaryFiberPanelEnabled(profile);
            });

            React.useEffect(function syncFiberPanelVisibilityFromProfile() {
                setEnabled(readDiaryFiberPanelEnabled(profile));
            }, [profile]);

            React.useEffect(function listenFiberPanelVisibility() {
                const handleVisibilityChange = function handleVisibilityChange(event) {
                    if (typeof event?.detail?.enabled === 'boolean') {
                        setEnabled(event.detail.enabled);
                    } else {
                        setEnabled(readDiaryFiberPanelEnabled());
                    }
                };
                window.addEventListener('heys:diary-fiber-panel-visibility-changed', handleVisibilityChange);
                window.addEventListener('heys:profile-updated', handleVisibilityChange);
                return function cleanupVisibilityListener() {
                    window.removeEventListener('heys:diary-fiber-panel-visibility-changed', handleVisibilityChange);
                    window.removeEventListener('heys:profile-updated', handleVisibilityChange);
                };
            }, []);

            const eaten = Math.max(0, Number(dayTot?.fiber) || 0);
            const target = Math.max(1, getSafeFiberTarget(dayTot, normAbs));
            const contributions = React.useMemo(function computeFiberContributions() {
                return getFiberContributions(dayData, pIndex, app, eaten);
            }, [dayData, pIndex, app, eaten]);
            const fiberTypeSummary = React.useMemo(function computeFiberTypeSummary() {
                return getFiberTypeSummary(contributions);
            }, [contributions]);
            const softPlan = React.useMemo(function computeFiberSoftPlan() {
                return getFiberSoftPlan(eaten, target);
            }, [eaten, target]);
            const weekSummary = React.useMemo(function computeFiberWeekSummary() {
                return getFiberWeekSummary(dateKey || dayData?.date, dayData, dayTot, target, pIndex, app);
            }, [dateKey, dayData, dayTot, target, pIndex, app]);
            const remaining = Math.max(0, target - eaten);
            const pct = Math.max(0, Math.round((eaten / target) * 100));
            const cappedPct = Math.min(100, pct);
            const status = pct >= 100
                ? { label: 'Норма закрыта', tone: 'done' }
                : pct >= 70
                    ? { label: 'Почти добрали', tone: 'good' }
                    : pct >= 40
                        ? { label: 'Есть база', tone: 'mid' }
                        : { label: 'Нужно добрать', tone: 'low' };

            if (!enabled) return null;

            return React.createElement('section', {
                className: 'diary-fiber-panel diary-fiber-panel--' + status.tone + (expanded ? ' is-expanded' : ''),
                'aria-label': 'Панель управления клетчаткой'
            },
                React.createElement('button', {
                    type: 'button',
                    className: 'diary-fiber-panel__summary',
                    onClick: function toggleFiberPanel() {
                        setExpanded(function toggle(value) { return !value; });
                    },
                    'aria-expanded': expanded ? 'true' : 'false'
                },
                    React.createElement('span', { className: 'diary-fiber-panel__icon', 'aria-hidden': 'true' }, '🌿'),
                    React.createElement('span', { className: 'diary-fiber-panel__main' },
                        React.createElement('span', { className: 'diary-fiber-panel__eyebrow' }, 'Клетчатка'),
                        React.createElement('span', { className: 'diary-fiber-panel__title' }, status.label)
                    ),
                    React.createElement('span', { className: 'diary-fiber-panel__numbers' },
                        React.createElement('strong', null, Math.round(eaten)),
                        React.createElement('span', null, ' / ' + Math.round(target) + ' г')
                    ),
                    React.createElement('span', { className: 'diary-fiber-panel__more' },
                        expanded ? 'Скрыть' : 'Подробнее',
                        React.createElement('span', { className: 'diary-fiber-panel__chevron', 'aria-hidden': 'true' }, expanded ? '⌃' : '⌄')
                    )
                ),
                React.createElement('div', { className: 'diary-fiber-panel__bar', 'aria-hidden': 'true' },
                    React.createElement('span', {
                        className: 'diary-fiber-panel__fill',
                        style: { width: cappedPct + '%' }
                    })
                ),
                React.createElement('div', { className: 'diary-fiber-panel__quick' },
                    React.createElement('span', { className: 'diary-fiber-panel__chip diary-fiber-panel__chip--soft' }, softPlan.label),
                    React.createElement('span', { className: 'diary-fiber-panel__chip diary-fiber-panel__chip--type' }, fiberTypeSummary.label)
                ),
                React.createElement('div', { className: 'diary-fiber-panel__hint' },
                    remaining > 0
                        ? 'Осталось примерно ' + Math.ceil(remaining) + ' г. ' + softPlan.note
                        : 'Сегодня клетчатка в норме. Дальше достаточно не перегружать день.'
                ),
                expanded && React.createElement('div', { className: 'diary-fiber-panel__details' },
                    React.createElement('div', { className: 'diary-fiber-panel__week' },
                        React.createElement('div', { className: 'diary-fiber-panel__section-head' },
                            React.createElement('span', { className: 'diary-fiber-panel__section-title' }, 'Паттерн за 7 дней'),
                            React.createElement('strong', { className: 'diary-fiber-panel__section-total' }, weekSummary.avg + ' г/день')
                        ),
                        React.createElement('div', { className: 'diary-fiber-panel__week-bars', 'aria-hidden': 'true' },
                            weekSummary.days.map(function renderWeekDay(day) {
                                const height = Math.max(8, Math.min(100, Math.round((day.fiber / target) * 100)));
                                return React.createElement('span', {
                                    key: day.date,
                                    className: 'diary-fiber-panel__week-bar' + (day.fiber >= target ? ' is-done' : ''),
                                    style: { height: height + '%' }
                                });
                            })
                        ),
                        React.createElement('div', { className: 'diary-fiber-panel__week-facts' },
                            React.createElement('span', null, 'Недобор: ' + weekSummary.underDays + ' из 7 дней'),
                            React.createElement('span', null, weekSummary.avgGap > 0 ? 'Обычно не хватает ' + weekSummary.avgGap + ' г' : 'Средняя норма закрыта'),
                            React.createElement('span', null, weekSummary.bestSource ? 'Лучший источник: ' + weekSummary.bestSource.name : 'Лучший источник появится после 2-3 дней')
                        )
                    ),
                    React.createElement('div', { className: 'diary-fiber-panel__earned' },
                        React.createElement('div', { className: 'diary-fiber-panel__section-head' },
                            React.createElement('span', { className: 'diary-fiber-panel__section-title' }, 'Уже набрано сегодня'),
                            React.createElement('strong', { className: 'diary-fiber-panel__section-total' }, roundFiberValue(eaten) + ' г')
                        ),
                        contributions.length > 0
                            ? React.createElement('div', { className: 'diary-fiber-panel__earned-list' },
                                contributions.map(function renderContribution(item) {
                                    return React.createElement('div', {
                                        key: item.name + ':' + item.fiber,
                                        className: 'diary-fiber-panel__earned-row' + (item.isFallback ? ' diary-fiber-panel__earned-row--fallback' : '')
                                    },
                                        React.createElement('span', { className: 'diary-fiber-panel__earned-name' }, item.name),
                                        !item.isFallback && React.createElement('span', { className: 'diary-fiber-panel__earned-grams' }, Math.round(item.grams) + ' г продукта'),
                                        React.createElement('strong', { className: 'diary-fiber-panel__earned-fiber' }, item.fiber + ' г')
                                    );
                                })
                            )
                            : React.createElement('div', { className: 'diary-fiber-panel__empty' }, 'Пока нет продуктов с заметной клетчаткой.')
                    ),
                    React.createElement('div', { className: 'diary-fiber-panel__source-block' },
                        React.createElement('div', { className: 'diary-fiber-panel__section-head' },
                            React.createElement('span', { className: 'diary-fiber-panel__section-title' }, 'Чем добрать эффективнее')
                        ),
                        React.createElement('div', { className: 'diary-fiber-panel__sources' },
                            fiberSources.map(function renderSource(source) {
                                return React.createElement('div', { key: source.title, className: 'diary-fiber-panel__source' },
                                    React.createElement('span', { className: 'diary-fiber-panel__source-icon', 'aria-hidden': 'true' }, source.icon),
                                    React.createElement('span', { className: 'diary-fiber-panel__source-title' }, source.title),
                                    React.createElement('span', { className: 'diary-fiber-panel__source-note' }, source.note),
                                    React.createElement('span', { className: 'diary-fiber-panel__source-grams' }, source.grams)
                                );
                            })
                        )
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'diary-fiber-panel__hide',
                        onClick: function hideFiberPanel() {
                            writeDiaryFiberPanelEnabled(false);
                            setEnabled(false);
                        }
                    },
                        React.createElement('span', { 'aria-hidden': 'true' }, '✕'),
                        React.createElement('span', null, 'Скрыть карточку')
                    )
                )
            );
        });

        return _DiaryFiberPanel;
    }

    function getDiaryOptionalPanelsComponent(React) {
        if (_DiaryOptionalPanels) return _DiaryOptionalPanels;

        _DiaryOptionalPanels = React.memo(function DiaryOptionalPanels(props) {
            const {
                app,
                dateKey,
                dayData,
                profile,
                pIndex,
                dayTot,
                normAbs,
                displayOptimum,
                optimum,
                mealsChart,
                ensureSupplementsModule,
                deferredSlot,
            } = props || {};
            const [visibility, setVisibility] = React.useState(function initDiaryOptionalPanels() {
                return {
                    planner: readDiaryPanelEnabled(profile, PLANNER_PANEL_PROFILE_FIELD),
                    supplements: readDiaryPanelEnabled(profile, SUPPLEMENTS_PANEL_PROFILE_FIELD),
                    distribution: readDiaryPanelEnabled(profile, DISTRIBUTION_PANEL_PROFILE_FIELD),
                };
            });

            React.useEffect(function syncDiaryOptionalPanelsFromProfile() {
                setVisibility({
                    planner: readDiaryPanelEnabled(profile, PLANNER_PANEL_PROFILE_FIELD),
                    supplements: readDiaryPanelEnabled(profile, SUPPLEMENTS_PANEL_PROFILE_FIELD),
                    distribution: readDiaryPanelEnabled(profile, DISTRIBUTION_PANEL_PROFILE_FIELD),
                });
            }, [profile?.showDiaryPlannerPanel, profile?.showDiarySupplementsPanel, profile?.showDiaryDistributionPanel]);

            React.useEffect(function listenDiaryOptionalPanelsVisibility() {
                const sync = function syncDiaryOptionalPanelsVisibility() {
                    setVisibility({
                        planner: readDiaryPanelEnabled(null, PLANNER_PANEL_PROFILE_FIELD),
                        supplements: readDiaryPanelEnabled(null, SUPPLEMENTS_PANEL_PROFILE_FIELD),
                        distribution: readDiaryPanelEnabled(null, DISTRIBUTION_PANEL_PROFILE_FIELD),
                    });
                };
                window.addEventListener('heys:diary-optional-panels-visibility-changed', sync);
                window.addEventListener('heys:profile-updated', sync);
                return function cleanupDiaryOptionalPanelsVisibility() {
                    window.removeEventListener('heys:diary-optional-panels-visibility-changed', sync);
                    window.removeEventListener('heys:profile-updated', sync);
                };
            }, []);

            const showPlannerPanel = visibility.planner !== false;
            const showSupplementsPanel = visibility.supplements !== false;
            const showDistributionPanel = visibility.distribution !== false;
            const mealRecReady = showPlannerPanel && !!app?.MealRecCard?.renderCard && !!app?.InsightsPI?.mealRecommender?.recommend;
            const mealRecCard = mealRecReady ? (app.MealRecCard.renderCard({
                React,
                day: dayData,
                prof: profile,
                pIndex,
                dayTot,
                normAbs,
                optimum: displayOptimum || optimum
            }) || null) : null;

            if (mealRecCard) {
                if (!window.__heysLoggedMealRecRendered) {
                    window.__heysLoggedMealRecRendered = true;
                    console.info('[HEYS.diary] ✅ Meal rec card rendered');
                    try {
                        if (window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled) {
                            window.dispatchEvent(new CustomEvent('heys:diary-rendered', {
                                detail: { mealRecRendered: true },
                            }));
                        }
                    } catch (_) {}
                }
            } else if (mealRecReady) {
                if (!window.__heysLoggedMealRecNull) {
                    window.__heysLoggedMealRecNull = true;
                    console.info('[HEYS.diary] ℹ️ Meal rec card: no recommendation');
                }
            }

            const supplementsReady = showSupplementsPanel && !!app?.Supplements?.renderCard;
            if (showSupplementsPanel && !supplementsReady) ensureSupplementsModule?.();

            const supplementsCard = showSupplementsPanel && supplementsReady && dateKey ? (app.Supplements.renderCard({
                dateKey,
                dayData,
                onForceUpdate: () => {
                    window.dispatchEvent(new CustomEvent('heys:day-updated', {
                        detail: { date: dateKey, source: 'supplements-update', forceReload: true }
                    }));
                }
            }) || null) : null;

            return React.createElement(React.Fragment, null,
                showPlannerPanel && deferredSlot(mealRecReady, mealRecCard, 'slot-mealrec', 180, '🍽️', 'Загружаем ваши данные, чтобы умный планировщик дал точные рекомендации на остаток дня'),
                showSupplementsPanel && deferredSlot(supplementsReady, supplementsCard, 'slot-supplements', 140, '💊', 'Подготавливаем план добавок на сегодня'),
                showDistributionPanel && mealsChart
            );
        });

        return _DiaryOptionalPanels;
    }

    function getDiaryCompactSummaryComponent(React) {
        if (_DiaryCompactSummary) return _DiaryCompactSummary;

        _DiaryCompactSummary = React.memo(function DiaryCompactSummary(props) {
            const {
                app,
                date,
                dayData,
                profile,
                dayTot,
                normAbs,
                pIndex
            } = props || {};

            const [trendPeriodDays, setTrendPeriodDays] = React.useState(getStoredHealthTrendPeriod);
            const [enabled, setEnabled] = React.useState(function initScoreRiskTrendPanelEnabled() {
                return readDiaryPanelEnabled(profile, SCORE_RISK_TREND_PANEL_PROFILE_FIELD);
            });

            React.useEffect(function syncScoreRiskTrendPanelFromProfile() {
                setEnabled(readDiaryPanelEnabled(profile, SCORE_RISK_TREND_PANEL_PROFILE_FIELD));
            }, [profile?.showDiaryScoreRiskTrendPanel]);

            React.useEffect(function listenScoreRiskTrendPanelVisibility() {
                const sync = function syncScoreRiskTrendPanelVisibility() {
                    setEnabled(readDiaryPanelEnabled(null, SCORE_RISK_TREND_PANEL_PROFILE_FIELD));
                };
                window.addEventListener('heys:diary-optional-panels-visibility-changed', sync);
                window.addEventListener('heys:profile-updated', sync);
                return function cleanupScoreRiskTrendPanelVisibility() {
                    window.removeEventListener('heys:diary-optional-panels-visibility-changed', sync);
                    window.removeEventListener('heys:profile-updated', sync);
                };
            }, []);

            const summary = React.useMemo(function computeSummary() {
                return getSafeDayScoreSummary(app, {
                    dayData,
                    profile,
                    dayTot,
                    normAbs,
                    pIndex
                });
            }, [app, dayData, profile, dayTot, normAbs, pIndex, date]);

            const healthTrendResult = React.useMemo(function computeHealthTrend() {
                return getSafeHealthTrendSummary(app, { periodDays: trendPeriodDays });
            }, [app, trendPeriodDays, date, dayData, profile, dayTot, normAbs, pIndex]);

            const dayScoreResult = summary.dayScore;
            const riskRadarResult = summary.riskRadar;

            const handleTrendPeriodChange = React.useCallback(function handleChange(nextPeriod, event) {
                event?.stopPropagation?.();
                const normalized = Number(nextPeriod) === 7 ? 7 : 30;
                setTrendPeriodDays(function update(prev) {
                    if (prev === normalized) return prev;
                    saveStoredHealthTrendPeriod(normalized);
                    console.info('[HEYS.diary] Health trend period changed', { periodDays: normalized });
                    return normalized;
                });
            }, []);

            if (!enabled) return null;
            if (!dayScoreResult && !riskRadarResult && !healthTrendResult) return null;

            return React.createElement('section', {
                className: 'diary-compact-summary',
                'aria-label': 'Оценка дня, риск и тренд'
            },
                dayScoreResult && React.createElement('div', {
                    className: 'diary-compact-summary__pill diary-compact-summary__pill--day',
                    style: {
                        '--summary-accent': dayScoreResult?.level?.color || '#22c55e',
                        '--summary-accent-border': (dayScoreResult?.level?.color || '#22c55e') + '33',
                        '--summary-accent-border-dark': (dayScoreResult?.level?.color || '#22c55e') + '44'
                    }
                },
                    React.createElement('span', { className: 'diary-compact-summary__label' }, 'Оценка дня'),
                    React.createElement('span', { className: 'diary-compact-summary__value' }, Math.round(Number(dayScoreResult?.score) || 0))
                ),
                riskRadarResult && React.createElement('div', {
                    className: 'diary-compact-summary__pill diary-compact-summary__pill--risk',
                    style: {
                        '--summary-accent': riskRadarResult?.level?.color || '#22c55e',
                        '--summary-accent-border': (riskRadarResult?.level?.color || '#22c55e') + '33',
                        '--summary-accent-border-dark': (riskRadarResult?.level?.color || '#22c55e') + '44'
                    }
                },
                    React.createElement('span', { className: 'diary-compact-summary__label' }, 'Риск'),
                    React.createElement('span', { className: 'diary-compact-summary__value' }, Math.round(Number(riskRadarResult?.score) || 0))
                ),
                healthTrendResult && React.createElement('div', {
                    className: 'diary-compact-summary__pill diary-compact-summary__pill--trend',
                    style: {
                        '--summary-accent': healthTrendResult?.level?.color || '#22c55e',
                        '--summary-accent-border': (healthTrendResult?.level?.color || '#22c55e') + '33',
                        '--summary-accent-border-dark': (healthTrendResult?.level?.color || '#22c55e') + '44'
                    }
                },
                    React.createElement('div', {
                        className: 'diary-compact-summary__metric diary-compact-summary__metric--trend'
                    },
                        React.createElement('span', { className: 'diary-compact-summary__label' }, 'Тренд'),
                        React.createElement('span', { className: 'diary-compact-summary__value' }, Math.round(Number(healthTrendResult?.score) || 0))
                    ),
                    React.createElement('div', {
                        className: 'diary-compact-summary__range',
                        role: 'group',
                        'aria-label': 'Период тренда'
                    },
                        [7, 30].map(function renderPeriodButton(days) {
                            const isActive = trendPeriodDays === days;
                            return React.createElement('button', {
                                key: days,
                                type: 'button',
                                className: 'diary-compact-summary__range-btn' + (isActive ? ' is-active' : ''),
                                'aria-pressed': isActive ? 'true' : 'false',
                                onClick: function onClick(event) {
                                    handleTrendPeriodChange(days, event);
                                }
                            }, days + ' дн.');
                        })
                    )
                )
            );
        });

        return _DiaryCompactSummary;
    }

    const renderDiarySection = (params) => {

        const {
            React,
            isMobile,
            mobileSubTab,
            goalProgressBar,
            waterCard,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            addMeal,
            day,
            mealsUI,
            dailyWaveOverview,
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

        const dateKey = date
            || day?.date
            || app.models?.todayISO?.()
            || new Date().toISOString().slice(0, 10);

        // PERF R16: LazyMount — IntersectionObserver gate for below-fold slots.
        // Component type is stable (defined once at module scope via getLazyMount).
        const LazyMount = getLazyMount(React);
        const DiaryCompactSummary = getDiaryCompactSummaryComponent(React);
        const DiaryFiberPanel = getDiaryFiberPanelComponent(React);
        const DiaryOptionalPanels = getDiaryOptionalPanelsComponent(React);
        const DiaryPanelGate = getDiaryPanelGateComponent(React);

        // PERF v8.3: Deferred card slot — skeleton only after postboot completes
        // If postboot is still loading scripts, return null (invisible).
        // Skeleton only shows if postboot finished but module is STILL not ready (abnormal).
        const DEFERRED_SKELETON_DELAY_MS = 260;
        const DEFERRED_SLOT_DEBUG = (() => {
            try {
                return window.localStorage?.getItem('heys_deferred_slot_debug') === '1';
            } catch (_) {
                return false;
            }
        })();
        const logDeferredSlot = (...args) => {
            if (!DEFERRED_SLOT_DEBUG) return;
            console.info(...args);
        };
        const deferredSlotLoadSince = window.__heysDeferredSlotLoadSince = window.__heysDeferredSlotLoadSince || Object.create(null);
        const deferredSkeletonState = window.__heysDeferredSkeletonState = window.__heysDeferredSkeletonState || Object.create(null);
        const deferredPendingSlot = (slotKey, minHeightPx) => React.createElement('div', {
            key: slotKey,
            className: 'deferred-card-slot deferred-card-slot--pending',
            'aria-hidden': 'true',
            style: minHeightPx
                ? { minHeight: Math.max(0, Number(minHeightPx) || 0) + 'px' }
                : undefined,
        });
        const deferredSlot = (ready, content, slotKey, skeletonH, skeletonIcon, skeletonLabel) => {
            const debugKey = slotKey || 'unknown-slot';
            if (!ready) {
                // Don't show skeleton while postboot is still loading scripts
                if (!window.__heysPostbootDone) {
                    if (deferredSkeletonState[debugKey] !== 'wait_postboot') {
                        logDeferredSlot('[HEYS.sceleton] ⏳ wait_postboot', { slotKey: debugKey });
                        deferredSkeletonState[debugKey] = 'wait_postboot';
                    }
                    return deferredPendingSlot(slotKey, skeletonH);
                }

                // Anti-flicker: render skeleton only if module is still not ready after a small delay
                const now = Date.now();
                if (slotKey && !deferredSlotLoadSince[slotKey]) {
                    deferredSlotLoadSince[slotKey] = now;
                }
                const waitStart = slotKey ? deferredSlotLoadSince[slotKey] : now;
                if ((now - waitStart) < DEFERRED_SKELETON_DELAY_MS) {
                    if (deferredSkeletonState[debugKey] !== 'wait_delay') {
                        logDeferredSlot('[HEYS.sceleton] ⏱️ wait_delay', {
                            slotKey: debugKey,
                            elapsedMs: now - waitStart,
                            delayMs: DEFERRED_SKELETON_DELAY_MS
                        });
                        deferredSkeletonState[debugKey] = 'wait_delay';
                    }
                    return deferredPendingSlot(slotKey, skeletonH);
                }

                if (deferredSkeletonState[debugKey] !== 'show_skeleton') {
                    logDeferredSlot('[HEYS.sceleton] 🦴 show_skeleton', {
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
                    logDeferredSlot('[HEYS.sceleton] ℹ️ ready_empty', { slotKey: debugKey });
                    deferredSkeletonState[debugKey] = 'ready_empty';
                }
                return React.createElement('div', {
                    key: slotKey,
                    className: 'deferred-card-slot deferred-card-slot--empty',
                    style: skeletonH
                        ? { minHeight: Math.max(0, Number(skeletonH) || 0) + 'px' }
                        : undefined
                });
            }
            if (deferredSkeletonState[debugKey] !== 'ready_content') {
                logDeferredSlot('[HEYS.sceleton] ✅ ready_content', { slotKey: debugKey });
                deferredSkeletonState[debugKey] = 'ready_content';
            }
            const slotTypeClass = slotKey ? ('deferred-card-slot--' + String(slotKey).replace(/^slot-/, '')) : '';
            // PERF: skip unfold animation if user has cached local data (returning user)
            // v6.0: Adaptive Render Gate — when __heysGatedRender is true (full sync arrived
            // before DayTab unlock), ALL cards render instantly in one frame, no animation
            // CLS: returning users — no-animate for all deferred slots including mealrec/supplements
            const animClass = (window.__heysGatedRender || window.__heysHasLocalData)
                ? 'no-animate'
                : 'animate-always';
            return React.createElement('div', {
                key: slotKey,
                className: ('deferred-card-slot deferred-card-slot--loaded ' + animClass + ' ' + slotTypeClass).trim()
            }, content);
        };

        if (!showDiary) return insulinIndicator;

        return React.createElement(React.Fragment, null,
            React.createElement(DiaryCompactSummary, {
                app,
                date,
                dayData: day,
                profile: prof,
                dayTot,
                normAbs,
                pIndex
            }),
            React.createElement(DiaryFiberPanel, {
                app,
                dateKey,
                dayData: day,
                dayTot,
                normAbs,
                pIndex,
                profile: prof
            }),
            goalProgressBar,
            React.createElement(DiaryPanelGate, {
                profile: prof,
                field: WATER_PANEL_PROFILE_FIELD,
            }, waterCard),
            refeedCard,
            // R16: lazy-mount below-fold cards — prevent heavy hooks until near viewport
            React.createElement(LazyMount, { key: 'lazy-below-fold', minHeight: 460 },
                React.createElement(DiaryOptionalPanels, {
                    app,
                    dateKey,
                    dayData: day,
                    profile: prof,
                    pIndex,
                    dayTot,
                    normAbs,
                    displayOptimum,
                    optimum,
                    mealsChart,
                    ensureSupplementsModule,
                    deferredSlot,
                }),
                React.createElement(DiaryPanelGate, {
                    profile: prof,
                    field: INSULIN_WAVE_PANEL_PROFILE_FIELD,
                }, insulinIndicator)
            ),
            React.createElement('div', {
                className: 'diary-section-separator diary-section-separator--full-width',
                style: {
                    margin: '36px -18px 0 -18px',
                    padding: '10px 18px 18px 18px'
                }
            },
                React.createElement('div', {
                    className: 'diary-section-separator-line-wrap',
                    style: {
                        position: 'relative',
                        height: '10px',
                        margin: '0 0 12px 0',
                        overflow: 'visible'
                    }
                },
                    React.createElement('div', {
                        className: 'diary-section-separator-line',
                        style: {
                            position: 'absolute',
                            left: '50%',
                            bottom: '1px',
                            transform: 'translateX(-50%)',
                            width: '84%',
                            height: '2px',
                            borderRadius: '999px',
                            background: 'linear-gradient(90deg, rgba(15, 23, 42, 0) 0%, rgba(37, 99, 235, 0.08) 14%, rgba(30, 64, 175, 0.28) 32%, rgba(30, 41, 59, 0.84) 50%, rgba(30, 64, 175, 0.28) 68%, rgba(37, 99, 235, 0.08) 86%, rgba(15, 23, 42, 0) 100%)',
                            boxShadow: '0 0 10px rgba(30, 64, 175, 0.1)'
                        }
                    })
                ),
                React.createElement('h2', {
                    id: 'diary-heading',
                    style: {
                        fontSize: '24px',
                        fontWeight: '800',
                        color: 'var(--text, #1e293b)',
                        margin: '12px 0 26px 0',
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
                        width: '82%',
                        maxWidth: '460px',
                        padding: '15px 22px',
                        margin: '18px auto 20px auto',
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#fff',
                        background: 'linear-gradient(135deg, #74a6f4 0%, #5e93ef 55%, #4b7fe0 100%)',
                        border: 'none',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.16)',
                        transition: 'all 0.2s ease',
                        WebkitTapHighlightColor: 'transparent'
                    }
                },
                    React.createElement('span', {
                        style: {
                            fontSize: '22px',
                            lineHeight: 1,
                            color: 'rgba(255, 255, 255, 0.94)',
                            fontWeight: '500',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            textShadow: '0 1px 2px rgba(30, 64, 175, 0.12)'
                        }
                    }, '+'),
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
                // 🎯 R-DAY-STICKY-V2 (2026-05-15): отдельный fixed-bar поверх списка.
                // НЕ трогает шапки приёмов (sticky на них ломал layout). Один общий
                // bar показывает данные текущего приёма в момент скролла, через
                // scroll listener + data-meal-index lookup.
                isMobile && HEYS.dayComponents?.MealStickyBar && React.createElement(HEYS.dayComponents.MealStickyBar, {
                    day,
                    pIndex,
                    isMobile,
                    key: 'meal-sticky-bar',
                }),
                mealsUI,
                dailyWaveOverview,
                daySummary,
                React.createElement('div', { className: 'row desktop-only', style: { justifyContent: 'flex-start', marginTop: '8px' } },
                    React.createElement('button', { className: 'btn', onClick: addMeal }, '+ Приём')
                )
            ),
        );
    };

    HEYS.dayDiarySection = HEYS.dayDiarySection || {};
    HEYS.dayDiarySection.renderDiarySection = renderDiarySection;
})(window.HEYS = window.HEYS || {});
