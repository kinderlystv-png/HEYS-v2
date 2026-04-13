// heys_planning_v1.js — coordinator for HEYS planning runtime
// PIN-only access: renders only when !cloudUser && clientId

(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const h = React.createElement;
    const { useMemo, useState, useEffect, useRef } = React;
    const Planning = HEYS.Planning = HEYS.Planning || {};

    const SUBNAV_ITEMS = [
        { id: 'tasks', label: 'Список', shortLabel: 'Список', icon: '☑️' },
        { id: 'calendar', label: 'Календарь', shortLabel: 'Кален.', icon: '📅' },
        { id: 'gantt', label: 'Гант', shortLabel: 'Гант', icon: '📊' },
        { id: 'context', label: 'Контекст', shortLabel: 'Конт.', icon: '🧠' },
    ];

    function PlanningFallback() {
        return h('div', { className: 'planning-tab' },
            h('div', { className: 'planning-content' },
                h('div', { className: 'planning-empty' },
                    'Planning modules ещё загружаются. Обнови экран, если состояние зависло.',
                ),
            ),
        );
    }

    function resolvePlanningRuntime() {
        const TasksScreen = HEYS.PlanningTasks && HEYS.PlanningTasks.TasksScreen;
        const CalendarScreen = HEYS.PlanningSchedule && HEYS.PlanningSchedule.CalendarScreen;
        const GanttScreen = HEYS.PlanningSchedule && HEYS.PlanningSchedule.GanttScreen;
        const ContextScreen = HEYS.PlanningContext && HEYS.PlanningContext.ContextScreen;
        const usePlanningState = Planning.Hooks && Planning.Hooks.usePlanningState;

        return {
            TasksScreen,
            CalendarScreen,
            GanttScreen,
            ContextScreen,
            usePlanningState,
            store: Planning.Store || {},
        };
    }

    function PlanningTab() {
        const [activeScreen, setActiveScreen] = useState('calendar');
        const [layoutMetrics, setLayoutMetrics] = useState({ mainTabsHeight: 0, subnavHeight: 0 });
        const runtime = resolvePlanningRuntime();
        const planState = runtime.usePlanningState ? runtime.usePlanningState() : null;
        const subnavRef = useRef(null);

        useEffect(() => {
            if (typeof document === 'undefined' || !document.body) return undefined;
            document.body.classList.add('planning-tab-active');
            return () => {
                document.body.classList.remove('planning-tab-active');
            };
        }, []);

        useEffect(() => {
            const pull = HEYS.Planning && typeof HEYS.Planning.refreshPlanningFromCloud === 'function'
                ? HEYS.Planning.refreshPlanningFromCloud
                : null;
            if (!pull) return undefined;
            pull().catch(function () { /* offline / RPC optional */ });
            return undefined;
        }, []);

        useEffect(() => {
            if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

            let frameId = 0;
            const measureLayout = () => {
                const nextMainTabsHeight = Math.round(document.querySelector('.tabs')?.getBoundingClientRect?.().height || 0);
                const nextSubnavHeight = Math.round(subnavRef.current?.getBoundingClientRect?.().height || 0);

                setLayoutMetrics((current) => {
                    if (current.mainTabsHeight === nextMainTabsHeight && current.subnavHeight === nextSubnavHeight) {
                        return current;
                    }

                    return {
                        mainTabsHeight: nextMainTabsHeight,
                        subnavHeight: nextSubnavHeight,
                    };
                });
            };

            frameId = window.requestAnimationFrame(measureLayout);

            const resizeObserver = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => measureLayout())
                : null;
            const tabsElement = document.querySelector('.tabs');

            if (resizeObserver) {
                if (tabsElement) resizeObserver.observe(tabsElement);
                if (subnavRef.current) resizeObserver.observe(subnavRef.current);
            }

            window.addEventListener('resize', measureLayout);
            return () => {
                window.cancelAnimationFrame(frameId);
                window.removeEventListener('resize', measureLayout);
                if (resizeObserver) resizeObserver.disconnect();
            };
        }, []);

        const planningLayoutStyle = useMemo(() => {
            const style = {};

            if (layoutMetrics.mainTabsHeight > 0) {
                style['--planning-main-tabs-height'] = layoutMetrics.mainTabsHeight + 'px';
            }

            if (layoutMetrics.subnavHeight > 0) {
                style['--planning-subnav-height'] = layoutMetrics.subnavHeight + 'px';
            }

            return style;
        }, [layoutMetrics.mainTabsHeight, layoutMetrics.subnavHeight]);

        const CurrentScreen = useMemo(() => {
            if (activeScreen === 'calendar') return runtime.CalendarScreen;
            if (activeScreen === 'gantt') return runtime.GanttScreen;
            if (activeScreen === 'context') return runtime.ContextScreen;
            return runtime.TasksScreen;
        }, [activeScreen, runtime.CalendarScreen, runtime.ContextScreen, runtime.GanttScreen, runtime.TasksScreen]);

        if (!planState || !runtime.TasksScreen || !runtime.CalendarScreen || !runtime.GanttScreen) {
            console.warn('[HEYS.planning] Planning split modules are not ready yet');
            return h(PlanningFallback);
        }

        const subnavNode = h('div', { className: 'planning-subnav planning-subnav--docked', ref: subnavRef },
            h('div', { className: 'planning-subnav__inner' },
                SUBNAV_ITEMS.map((item) => h('button', {
                    key: item.id,
                    type: 'button',
                    title: item.label,
                    'aria-label': item.label,
                    'data-screen': item.id,
                    className: 'planning-subnav__item' + (activeScreen === item.id ? ' active' : ''),
                    onClick: () => setActiveScreen(item.id),
                },
                    h('span', { className: 'planning-subnav__icon', 'aria-hidden': 'true' }, item.icon),
                    h('span', {
                        className: 'planning-subnav__label',
                        'data-short-label': item.shortLabel || item.label,
                        'aria-hidden': 'true',
                    }, item.label),
                )),
            ),
        );

        return h('div', { className: 'planning-tab', style: planningLayoutStyle },
            h('div', { className: 'planning-content' },
                CurrentScreen ? h(CurrentScreen, { state: planState }) : h(PlanningFallback),
            ),
            h('div', { className: 'planning-subnav-shell', 'aria-hidden': 'true' }),
            ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined'
                ? ReactDOM.createPortal(subnavNode, document.body)
                : subnavNode,
        );
    }

    HEYS.PlanningTab = PlanningTab;
    HEYS.PlanningData = Planning.Store || {};
    console.info('[HEYS.planning] ✅ PlanningTab coordinator registered');
})();
