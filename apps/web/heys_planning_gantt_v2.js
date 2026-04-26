// heys_planning_gantt_v2.js — mobile-native Gantt screen (Phase 1: layout + statique render)
// Touch interactions arrive in Phase 2; bottom-sheet quick-edit in Phase 3.
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState, useCallback } = React;

    const LS_ZOOM = 'heys_planning_gantt_zoom_v1';
    const LS_TOGGLES = 'heys_planning_gantt_toggles_v1';
    const LS_GROUPS = 'heys_planning_gantt_groups_collapsed_v1';

    const DEFAULT_TOGGLES = {
        deps: false,
        baseline: false,
        criticalPath: false,
        conflicts: true,
        slack: false,
        miniOverview: true,
    };

    function lsGet(key, fallback) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(key, fallback);
            }
        } catch (e) { /* noop */ }
        return fallback;
    }

    function lsSet(key, value) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                HEYS.utils.lsSet(key, value);
            }
        } catch (e) { /* noop */ }
    }

    function GanttFallback({ message }) {
        return h('div', { className: 'planning-gantt2-fallback' },
            message || 'Gantt v2 загружается…',
        );
    }

    function GanttScreenV2(props) {
        const state = props && props.state;
        const Layout = HEYS.PlanningGanttLayout;
        const Utils = HEYS.Planning && HEYS.Planning.Utils;
        const Migration = HEYS.PlanningGanttMigration;
        const Touch = HEYS.PlanningGanttTouch;

        if (!state || !Layout || !Utils) {
            return h(GanttFallback, { message: 'Planning runtime не готов.' });
        }

        // ── One-shot migration on mount + re-run on cloud-update ────────────
        const migrationRanRef = useRef(false);
        useEffect(() => {
            if (migrationRanRef.current) return;
            migrationRanRef.current = true;
            try { Migration && Migration.run && Migration.run(); } catch (e) { /* noop */ }
        }, [Migration]);

        // ── Persisted state ─────────────────────────────────────────────────
        const [dayWidth, setDayWidth] = useState(() => {
            const stored = Number(lsGet(LS_ZOOM, Layout.DEFAULT_DAY_WIDTH));
            return stored >= Layout.ZOOM_MIN && stored <= Layout.ZOOM_MAX ? Layout.snapDayWidth(stored) : Layout.DEFAULT_DAY_WIDTH;
        });
        const [toggles, setToggles] = useState(() => ({ ...DEFAULT_TOGGLES, ...(lsGet(LS_TOGGLES, {}) || {}) }));
        const [collapsed, setCollapsed] = useState(() => lsGet(LS_GROUPS, {}) || {});

        useEffect(() => { lsSet(LS_ZOOM, dayWidth); }, [dayWidth]);
        useEffect(() => { lsSet(LS_TOGGLES, toggles); }, [toggles]);
        useEffect(() => { lsSet(LS_GROUPS, collapsed); }, [collapsed]);

        // ── Transient state ─────────────────────────────────────────────────
        const scrollRef = useRef(null);
        const screenRef = useRef(null);
        const todayIso = Utils.dateStr();

        // Phase 6 — virtualization. Track scrollTop + viewportHeight to render only the
        // visible row slice (+ buffer). Updates throttled via rAF in handleScroll.
        const [scrollTop, setScrollTop] = useState(0);
        const [viewportH, setViewportH] = useState(0);

        // ── Pure data (memoized) ────────────────────────────────────────────
        const relevantTasks = useMemo(() => Layout.computeRelevantTasks(state.tasks), [state.tasks]);
        const timelineBounds = useMemo(() => Layout.computeTimelineBounds(relevantTasks, todayIso), [relevantTasks, todayIso]);
        const timelineDays = useMemo(() => Layout.computeTimelineDays(timelineBounds), [timelineBounds]);
        const grouped = useMemo(() => Layout.computeGroupedTasks(relevantTasks, state.projects), [relevantTasks, state.projects]);
        const layout = useMemo(() => Layout.computeRowsAndMetrics(grouped, timelineBounds.start, dayWidth, collapsed), [grouped, timelineBounds.start, dayWidth, collapsed]);

        const todayDayIndex = timelineDays.indexOf(todayIso);

        // Phase 6 — visible row slice. Buffer 5 rows before/after viewport.
        const visibleSlice = useMemo(() =>
            Layout.computeVisibleSlice(layout.rows, scrollTop, viewportH, Layout.TASK_ROW_HEIGHT, 5),
            [layout.rows, scrollTop, viewportH]);

        // ── Scroll handlers ─────────────────────────────────────────────────
        // Toggle .is-scrolled-right when scrollLeft > 12px (fluid labels collapse).
        // Also reposition mini-overview window-indicator via direct DOM transform (no re-render).
        const scrollRafRef = useRef(0);
        const miniIndicatorRef = useRef(null);
        const miniStripRef = useRef(null);
        const handleScroll = useCallback(() => {
            if (scrollRafRef.current) return;
            scrollRafRef.current = window.requestAnimationFrame(() => {
                scrollRafRef.current = 0;
                const screen = screenRef.current;
                const scroll = scrollRef.current;
                if (!screen || !scroll) return;
                const isScrolledRight = scroll.scrollLeft > 12;
                screen.classList.toggle('is-scrolled-right', isScrolledRight);
                // Phase 6: track scrollTop for row virtualization.
                setScrollTop(scroll.scrollTop);
                // Mini-overview: reposition the window indicator by ratio of scroll/total.
                const indicator = miniIndicatorRef.current;
                const strip = miniStripRef.current;
                if (indicator && strip && scroll.scrollWidth > scroll.clientWidth) {
                    const stripWidth = strip.clientWidth;
                    const ratioWidth = scroll.clientWidth / scroll.scrollWidth;
                    const indicatorWidth = Math.max(24, ratioWidth * stripWidth);
                    indicator.style.width = indicatorWidth + 'px';
                    const totalScrollable = Math.max(1, scroll.scrollWidth - scroll.clientWidth);
                    const ratio = Math.max(0, Math.min(1, scroll.scrollLeft / totalScrollable));
                    const x = ratio * Math.max(0, stripWidth - indicatorWidth);
                    indicator.style.transform = 'translate3d(' + x + 'px, 0, 0)';
                }
            });
        }, []);

        useEffect(() => () => {
            if (scrollRafRef.current) {
                window.cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = 0;
            }
        }, []);

        // Block heys_app_swipe_nav_v1 from intercepting horizontal pulls inside the Gantt.
        // React synthetic stopPropagation isn't enough — React 18+ uses single-root event
        // delegation, so the swipe-nav onTouchStart handler may fire from the same root
        // listener regardless. A NATIVE listener with stopImmediatePropagation halts the
        // bubble before React's delegation root sees it, killing all parent handlers.
        useEffect(() => {
            const el = screenRef.current;
            if (!el) return undefined;
            const stop = (e) => {
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            };
            el.addEventListener('touchstart', stop, { passive: true });
            el.addEventListener('touchmove', stop, { passive: true });
            el.addEventListener('touchend', stop, { passive: true });
            el.addEventListener('touchcancel', stop, { passive: true });
            return () => {
                el.removeEventListener('touchstart', stop);
                el.removeEventListener('touchmove', stop);
                el.removeEventListener('touchend', stop);
                el.removeEventListener('touchcancel', stop);
            };
        }, []);

        // Phase 6 — observe scroll-area size for virtualization viewport.
        useEffect(() => {
            const el = scrollRef.current;
            if (!el || typeof ResizeObserver !== 'function') return undefined;
            const ro = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry) return;
                const next = Math.round(entry.contentRect.height);
                setViewportH((prev) => (prev === next ? prev : next));
            });
            ro.observe(el);
            // Seed once.
            setViewportH(el.clientHeight);
            return () => ro.disconnect();
        }, []);

        // ── Today scroll-to button ──────────────────────────────────────────
        const scrollToToday = useCallback(() => {
            const scroll = scrollRef.current;
            if (!scroll || todayDayIndex < 0) return;
            const targetX = (todayDayIndex * dayWidth) - 80; // small offset so today isn't at very edge
            scroll.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
        }, [todayDayIndex, dayWidth]);

        // ── Touch interactions: drag-to-move (Phase 2a) ─────────────────────
        const tasksByIdRef = useRef(new Map());
        useEffect(() => {
            const m = new Map();
            (state.tasks || []).forEach((t) => m.set(t.id, t));
            tasksByIdRef.current = m;
        }, [state.tasks]);
        const getTaskById = useCallback((id) => tasksByIdRef.current.get(id), []);

        const handleMoveTask = useCallback((taskId, deltaDays) => {
            const task = tasksByIdRef.current.get(taskId);
            if (!task || !state.updateTask) return;
            const patch = {};
            if (task.startDate) patch.startDate = Utils.addDays(task.startDate, deltaDays);
            if (task.dueDate) patch.dueDate = Utils.addDays(task.dueDate, deltaDays);
            if (Object.keys(patch).length > 0) state.updateTask(taskId, patch);
        }, [state, Utils]);

        const handleResizeTask = useCallback((taskId, side, deltaDays) => {
            const task = tasksByIdRef.current.get(taskId);
            if (!task || !state.updateTask) return;
            if (side === 'start' && task.startDate) {
                const candidate = Utils.addDays(task.startDate, deltaDays);
                // Guard: new startDate must not exceed dueDate.
                if (task.dueDate && candidate > task.dueDate) return;
                state.updateTask(taskId, { startDate: candidate });
            } else if (side === 'end' && task.dueDate) {
                const candidate = Utils.addDays(task.dueDate, deltaDays);
                // Guard: new dueDate must not precede startDate.
                if (task.startDate && candidate < task.startDate) return;
                state.updateTask(taskId, { dueDate: candidate });
            }
        }, [state, Utils]);

        // Tap → quick-edit bottom sheet (Phase 3). "Открыть детали" inside sheet
        // escalates to TaskDetailModal for advanced fields (subtasks, blockedByTaskIds).
        const [quickEditTaskId, setQuickEditTaskId] = useState(null);
        const [selectedTaskId, setSelectedTaskId] = useState(null);
        const handleTapTask = useCallback((taskId) => {
            setQuickEditTaskId(taskId);
        }, []);
        const handleOpenDetails = useCallback((taskId) => {
            setQuickEditTaskId(null);
            setSelectedTaskId(taskId);
        }, []);
        const handleDeleteTaskFromSheet = useCallback((taskId) => {
            if (state.deleteTask) state.deleteTask(taskId);
        }, [state]);
        const handleUpdateTaskFromSheet = useCallback((taskId, patch) => {
            if (state.updateTask) state.updateTask(taskId, patch);
        }, [state]);
        const resolvedTaskProjectIds = useMemo(() => {
            const PlanningTasks = HEYS.PlanningTasks;
            if (PlanningTasks && typeof PlanningTasks.buildResolvedTaskProjectMap === 'function') {
                return PlanningTasks.buildResolvedTaskProjectMap(state.tasks, state.projects);
            }
            return new Map();
        }, [state.tasks, state.projects]);

        const quickEditTask = useMemo(() => {
            if (!quickEditTaskId) return null;
            return tasksByIdRef.current.get(quickEditTaskId) || null;
        }, [quickEditTaskId, state.tasks]);

        const handleZoomEnd = useCallback((snappedDayWidth) => {
            if (typeof snappedDayWidth === 'number' && snappedDayWidth > 0) {
                setDayWidth(snappedDayWidth);
            }
        }, []);

        // ── Phase 4b: critical path / slack / conflicts (lazy via toggles) ──
        const CriticalPath = HEYS.PlanningGanttCriticalPath;
        const cycleWarnedRef = useRef(false);

        const criticalResult = useMemo(() => {
            if (!toggles.criticalPath || !CriticalPath) return { criticalIds: new Set(), hasCycle: false };
            try { return CriticalPath.computeCriticalPath(state.tasks, Utils); }
            catch (e) { return { criticalIds: new Set(), hasCycle: false }; }
        }, [toggles.criticalPath, state.tasks, Utils, CriticalPath]);

        const conflictIds = useMemo(() => {
            if (!toggles.conflicts || !CriticalPath) return new Set();
            try { return CriticalPath.detectConflicts(state.tasks); }
            catch (e) { return new Set(); }
        }, [toggles.conflicts, state.tasks, CriticalPath]);

        const slackByTaskId = useMemo(() => {
            if (!toggles.slack || !CriticalPath) return new Map();
            const m = new Map();
            (state.tasks || []).forEach((t) => {
                const slack = CriticalPath.computeProgressSlack(t, todayIso, Utils);
                if (slack > 10) m.set(t.id, slack); // > 10% behind highlights
            });
            return m;
        }, [toggles.slack, state.tasks, todayIso, Utils, CriticalPath]);

        // Surface cycle detection to the user once via confirmModal.
        useEffect(() => {
            if (!toggles.criticalPath) { cycleWarnedRef.current = false; return; }
            if (!criticalResult.hasCycle || cycleWarnedRef.current) return;
            cycleWarnedRef.current = true;
            const cm = HEYS.confirmModal;
            if (cm && typeof cm.show === 'function') {
                try {
                    cm.show({
                        icon: '⚠️',
                        title: 'Цикл в зависимостях',
                        text: 'Невозможно вычислить критический путь — задачи блокируют друг друга по кругу. Проверьте blockedByTaskIds в деталях задачи.',
                        confirmText: 'Понятно',
                        cancelText: '',
                    });
                } catch (e) { /* noop */ }
            }
        }, [toggles.criticalPath, criticalResult.hasCycle]);

        const dragApi = (Touch && typeof Touch.useGanttDragInteractions === 'function')
            ? Touch.useGanttDragInteractions({
                scrollRef, screenRef,
                timelineStart: timelineBounds.start,
                dayWidth,
                onMoveTask: handleMoveTask,
                onResizeTask: handleResizeTask,
                onTapTask: handleTapTask,
                onZoomEnd: handleZoomEnd,
                getTaskById,
            })
            : { onPointerDown: null, dragPreview: null };

        // Initial scroll-to-today on mount (if today within bounds).
        useEffect(() => {
            const t = window.setTimeout(() => {
                if (todayDayIndex >= 0) scrollToToday();
                // Run handleScroll once on mount to size and position the mini-overview
                // indicator (it has no initial layout otherwise).
                handleScroll();
            }, 60);
            return () => window.clearTimeout(t);
        }, []); // mount only

        // ── Zoom controls ───────────────────────────────────────────────────
        const ZOOM_PRESETS = [
            { label: 'S', value: 28 },
            { label: 'M', value: 40 },
            { label: 'L', value: 56 },
        ];

        const cssVars = {
            '--gantt-day-w': dayWidth + 'px',
            '--gantt-days': timelineDays.length,
        };

        // ── Render ──────────────────────────────────────────────────────────
        const PlanningTasks = HEYS.PlanningTasks;
        const TaskDetailModal = PlanningTasks && PlanningTasks.TaskDetailModal;
        const QuickEdit = HEYS.PlanningGanttQuickEdit;
        const QuickEditSheet = QuickEdit && QuickEdit.GanttQuickEditSheet;

        return h('div', {
            className: 'planning-gantt2-screen no-swipe-zone',
            ref: screenRef,
            style: cssVars,
            'data-no-pull-refresh': 'true',
        },
            renderToolbar({ ZOOM_PRESETS, dayWidth, setDayWidth, toggles, setToggles, scrollToToday, todayAvailable: todayDayIndex >= 0 }),
            toggles.miniOverview && relevantTasks.length > 0 && renderMiniOverview({
                miniStripRef,
                miniIndicatorRef,
                tasks: relevantTasks,
                projects: state.projects,
                timelineStart: timelineBounds.start,
                timelineDays,
                scrollRef,
                dayWidth,
                Utils,
            }),
            renderScrollArea({
                scrollRef, handleScroll,
                relevantTasks, timelineDays, dayWidth, todayIso, todayDayIndex,
                timelineStart: timelineBounds.start,
                layout, visibleRows: visibleSlice.slice,
                collapsed, setCollapsed, projects: state.projects, toggles,
                onBarPointerDown: dragApi.onPointerDown,
                criticalIds: criticalResult.criticalIds,
                conflictIds,
                slackByTaskId,
            }),
            dragApi.dragPreview && renderDragGhost(dragApi.dragPreview, dayWidth, timelineBounds.start, getTaskById),
            quickEditTask && QuickEditSheet && h(QuickEditSheet, {
                task: quickEditTask,
                projects: state.projects,
                onUpdate: handleUpdateTaskFromSheet,
                onDelete: handleDeleteTaskFromSheet,
                onOpenDetails: TaskDetailModal ? handleOpenDetails : null,
                onClose: () => setQuickEditTaskId(null),
            }),
            selectedTaskId && TaskDetailModal && h(TaskDetailModal, {
                taskId: selectedTaskId,
                state,
                resolvedTaskProjectIds,
                onClose: () => setSelectedTaskId(null),
            }),
        );
    }

    function renderDragGhost(preview, dayWidth, timelineStart, getTaskById) {
        if (!preview) return null;
        // Ghost positioned in viewport via fixed coords; centered on finger via grabOffsets.
        const left = preview.x - preview.grabOffsetX;
        const top = preview.y - preview.grabOffsetY;
        const dt = preview.deltaDays || 0;
        const dtLabel = dt === 0
            ? ''
            : (dt > 0 ? '+' + dt : String(dt)) + (Math.abs(dt) === 1 ? ' день' : ' дн.');
        const modeLabel = preview.mode === 'resize-start' ? '← начало'
            : preview.mode === 'resize-end' ? 'конец →'
            : '';
        const hint = [modeLabel, dtLabel].filter(Boolean).join(' · ');

        return h('div', {
            className: 'planning-gantt2-drag-ghost'
                + (preview.mode === 'resize-start' ? ' is-resize-start' : '')
                + (preview.mode === 'resize-end' ? ' is-resize-end' : ''),
            style: {
                position: 'fixed',
                left: left + 'px',
                top: top + 'px',
                width: preview.width + 'px',
                height: preview.height + 'px',
                background: preview.background,
                pointerEvents: 'none',
                zIndex: 1000,
                transform: 'translate3d(0,0,0)',
            },
        },
            h('div', { className: 'planning-gantt2-drag-ghost__label' }, preview.label || ''),
            hint && h('div', { className: 'planning-gantt2-drag-ghost__hint' }, hint),
        );
    }

    function renderToolbar({ ZOOM_PRESETS, dayWidth, setDayWidth, toggles, setToggles, scrollToToday, todayAvailable }) {
        const zoomBtn = (preset) => h('button', {
            key: preset.label,
            type: 'button',
            className: 'planning-gantt2-zoom-btn' + (dayWidth === preset.value ? ' is-active' : ''),
            onClick: () => setDayWidth(preset.value),
            'aria-label': 'Zoom ' + preset.label,
        }, preset.label);

        return h('div', { className: 'planning-gantt2-toolbar' },
            h('div', { className: 'planning-gantt2-toolbar__group' }, ZOOM_PRESETS.map(zoomBtn)),
            todayAvailable && h('button', {
                type: 'button',
                className: 'planning-gantt2-today-pill',
                onClick: scrollToToday,
                'aria-label': 'Прокрутить к сегодня',
            }, 'Сегодня'),
            h('div', { className: 'planning-gantt2-toolbar__group planning-gantt2-toolbar__group--right planning-gantt2-toolbar__group--scroll' },
                renderToggleBtn(toggles, setToggles, 'criticalPath', '★', 'Критический путь'),
                renderToggleBtn(toggles, setToggles, 'conflicts', '⚠', 'Конфликты'),
                renderToggleBtn(toggles, setToggles, 'slack', '⏱', 'Отставание'),
                renderToggleBtn(toggles, setToggles, 'baseline', '▭', 'Baseline'),
                renderToggleBtn(toggles, setToggles, 'deps', '↗', 'Связи'),
            ),
        );
    }

    function renderMiniOverview({ miniStripRef, miniIndicatorRef, tasks, projects, timelineStart, timelineDays, scrollRef, dayWidth, Utils }) {
        const totalDays = timelineDays.length;
        if (totalDays <= 0) return null;

        // Build flattened task bars in mini-strip coords (% of total).
        // Skip tasks without a date span.
        const items = [];
        for (let i = 0; i < tasks.length; i += 1) {
            const t = tasks[i];
            const start = t.startDate || t.dueDate;
            const end = t.dueDate || t.startDate;
            if (!start || !end) continue;
            const startOffset = Utils.diffDays(timelineStart, start);
            const endOffset = Utils.diffDays(timelineStart, end);
            if (startOffset < 0 || endOffset > totalDays) continue;
            const leftPct = (startOffset / totalDays) * 100;
            const widthPct = Math.max(0.4, ((endOffset - startOffset + 1) / totalDays) * 100);
            const color = (Utils.getTaskProjectColor)
                ? Utils.getTaskProjectColor(t, projects)
                : '#64748b';
            items.push({ id: t.id, leftPct, widthPct, color });
        }

        const onStripTap = (e) => {
            const scroll = scrollRef.current;
            const strip = miniStripRef.current;
            if (!scroll || !strip) return;
            const rect = strip.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            const totalScrollable = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
            const targetLeft = ratio * totalScrollable;
            scroll.scrollTo({ left: targetLeft, behavior: 'smooth' });
        };

        return h('div', {
            className: 'planning-gantt2-mini-overview',
            ref: miniStripRef,
            onClick: onStripTap,
            'aria-label': 'Обзор таймлайна — нажмите для перехода',
        },
            items.map((item) => h('div', {
                key: 'mini-' + item.id,
                className: 'planning-gantt2-mini-bar',
                style: {
                    left: item.leftPct + '%',
                    width: item.widthPct + '%',
                    background: item.color,
                },
            })),
            h('div', {
                className: 'planning-gantt2-mini-indicator',
                ref: miniIndicatorRef,
                'aria-hidden': 'true',
            }),
        );
    }

    function renderToggleBtn(toggles, setToggles, key, icon, label) {
        return h('button', {
            type: 'button',
            className: 'planning-gantt2-toggle-btn' + (toggles[key] ? ' is-active' : ''),
            onClick: () => setToggles((prev) => ({ ...prev, [key]: !prev[key] })),
            'aria-label': label || icon,
            title: label || icon,
        },
            h('span', { className: 'planning-gantt2-toggle-btn__icon', 'aria-hidden': 'true' }, icon),
            label && h('span', { className: 'planning-gantt2-toggle-btn__label' }, label),
        );
    }

    function renderScrollArea({ scrollRef, handleScroll, relevantTasks, timelineDays, dayWidth, todayIso, todayDayIndex, timelineStart, layout, visibleRows, collapsed, setCollapsed, projects, toggles, onBarPointerDown, criticalIds, conflictIds, slackByTaskId }) {
        // Phase 6: render only the visible slice (virtualization). Fall back to full rows on the
        // first frame before viewportH is measured.
        const rowsToRender = (Array.isArray(visibleRows) && visibleRows.length > 0) ? visibleRows : layout.rows;
        const Layout = HEYS.PlanningGanttLayout;
        const Utils = HEYS.Planning && HEYS.Planning.Utils;
        const totalWidth = (timelineDays.length * dayWidth);
        const totalHeight = layout.height;

        if (relevantTasks.length === 0) {
            return h('div', { className: 'planning-gantt2-empty' },
                'Нет задач с датами. Добавь даты или baseline на экране задач.',
            );
        }

        // Stop touch event propagation so the parent `.tab-content-swipeable` (heys_app_swipe_nav_v1)
        // never sees them. The .no-swipe-zone class on the screen root should already gate this via
        // closest() — but on iOS Safari during horizontal scroll the synthetic event sometimes
        // bypasses that check; explicit stopPropagation is the bulletproof fix.
        const stopTouch = (e) => { e.stopPropagation(); };

        return h('div', {
            className: 'planning-gantt2-scroll no-swipe-zone',
            ref: scrollRef,
            onScroll: handleScroll,
            onTouchStart: stopTouch,
            onTouchMove: stopTouch,
            onTouchEnd: stopTouch,
            onTouchCancel: stopTouch,
        },
            h('div', {
                className: 'planning-gantt2-grid',
                style: {
                    minWidth: 'calc(var(--gantt-labels-w, 140px) + ' + totalWidth + 'px)',
                },
            },
                // Sticky corner (top-left)
                h('div', { className: 'planning-gantt2-corner' }, 'Задачи'),
                // Sticky timeline header (top)
                h('div', { className: 'planning-gantt2-timeline-header', style: { width: totalWidth + 'px' } },
                    timelineDays.map((day) => h('div', {
                        key: day,
                        className: 'planning-gantt2-day-cell'
                            + (day === todayIso ? ' is-today' : '')
                            + (Layout.isWeekendDay(day) ? ' is-weekend' : ''),
                        style: { width: dayWidth + 'px' },
                    },
                        h('span', { className: 'planning-gantt2-day-name' }, Layout.weekdayLabelForIso(day)),
                        h('span', { className: 'planning-gantt2-day-num' }, day.slice(8)),
                    )),
                ),
                // Sticky labels column (left) + body
                h('div', {
                    className: 'planning-gantt2-body-wrap',
                    style: { height: totalHeight + 'px' },
                },
                    // Sticky left labels column
                    h('div', { className: 'planning-gantt2-row-labels', style: { height: totalHeight + 'px' } },
                        rowsToRender.map((row) => row.type === 'group'
                            ? h('div', {
                                key: 'label-group-' + row.id,
                                className: 'planning-gantt2-label planning-gantt2-label--group',
                                style: { top: row.top + 'px', height: row.height + 'px' },
                            },
                                h('button', {
                                    type: 'button',
                                    className: 'planning-gantt2-group-toggle',
                                    onClick: () => setCollapsed((cur) => ({ ...cur, [row.group.project.id]: !cur[row.group.project.id] })),
                                    'aria-label': 'Свернуть/развернуть группу',
                                }, collapsed[row.group.project.id] ? '▸' : '▾'),
                                h('span', {
                                    className: 'planning-gantt2-group-chip',
                                    style: { background: row.group.project.color },
                                    title: row.group.project.name,
                                }, projectInitials(row.group.project.name)),
                                h('span', { className: 'planning-gantt2-group-name' }, row.group.project.name),
                                h('span', { className: 'planning-gantt2-group-count' }, row.group.tasks.length),
                            )
                            : h('div', {
                                key: 'label-task-' + row.id,
                                className: 'planning-gantt2-label planning-gantt2-label--task',
                                style: { top: row.top + 'px', height: row.height + 'px' },
                            },
                                h('span', {
                                    className: 'planning-gantt2-task-chip',
                                    style: { background: row.group.project.color },
                                    title: row.task.title,
                                }, projectInitials(row.task.title || row.group.project.name)),
                                h('div', { className: 'planning-gantt2-task-text' },
                                    h('div', { className: 'planning-gantt2-task-title' }, row.task.title || 'Без названия'),
                                    h('div', { className: 'planning-gantt2-task-meta' },
                                        [row.task.startDate, row.task.dueDate].filter(Boolean).join(' → ') || 'Без дат',
                                    ),
                                ),
                            )),
                    ),
                    // Timeline body
                    h('div', {
                        className: 'planning-gantt2-timeline-body',
                        style: { width: totalWidth + 'px', height: totalHeight + 'px' },
                    },
                        // Today line
                        todayDayIndex >= 0 && h('div', {
                            className: 'planning-gantt2-today-line',
                            style: { left: (todayDayIndex * dayWidth + (dayWidth / 2)) + 'px' },
                        }),
                        // Bars / milestones / group rows
                        rowsToRender.map((row) => row.type === 'group'
                            ? h('div', {
                                key: 'body-group-' + row.id,
                                className: 'planning-gantt2-group-row',
                                style: { top: row.top + 'px', height: row.height + 'px' },
                            })
                            : renderTaskRow(row, layout.taskMetrics[row.task.id], dayWidth, projects, onBarPointerDown, {
                                isCritical: criticalIds && criticalIds.has(row.task.id),
                                isConflict: conflictIds && conflictIds.has(row.task.id),
                                slack: slackByTaskId && slackByTaskId.get(row.task.id),
                            })),
                    ),
                ),
            ),
        );
    }

    function projectInitials(name) {
        const safe = String(name || '').trim();
        if (!safe) return '··';
        const parts = safe.split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return safe.slice(0, 2).toUpperCase();
    }

    function renderTaskRow(row, metrics, dayWidth, projects, onBarPointerDown, extras) {
        const isCritical = extras && extras.isCritical;
        const isConflict = extras && extras.isConflict;
        const slack = extras && typeof extras.slack === 'number' ? extras.slack : 0;
        const hasSlack = slack > 0;
        const Utils = HEYS.Planning && HEYS.Planning.Utils;
        const task = row.task;
        const color = (Utils && Utils.getTaskProjectColor)
            ? Utils.getTaskProjectColor(task, projects)
            : (row.group.project.color || '#64748b');

        if (!metrics) {
            // Task has no datable span (shouldn't happen — relevantTasks filter), render placeholder.
            return h('div', {
                key: 'body-row-' + row.id,
                className: 'planning-gantt2-row planning-gantt2-row--undated',
                style: { top: row.top + 'px', height: row.height + 'px' },
            });
        }

        const isMilestone = task.isMilestone === true;
        const progress = typeof task.progress === 'number' ? Math.max(0, Math.min(100, task.progress)) : 0;
        const isDone = task.status === 'done';

        if (isMilestone) {
            // Diamond on dueDate axis
            return h('div', {
                key: 'body-row-' + row.id,
                className: 'planning-gantt2-row planning-gantt2-row--milestone',
                style: { top: row.top + 'px', height: row.height + 'px' },
                'data-task-id': task.id,
            },
                h('div', {
                    className: 'planning-gantt2-milestone' + (isDone ? ' is-done' : ''),
                    style: {
                        left: (metrics.right - 8) + 'px',  // center the 16px diamond on dueDate
                        top: ((row.height - 16) / 2) + 'px',
                        background: color,
                    },
                    title: task.title,
                    onPointerDown: onBarPointerDown ? (e) => onBarPointerDown(e, task.id, { isResizable: false }) : undefined,
                }),
                h('div', {
                    className: 'planning-gantt2-milestone-label',
                    style: { left: (metrics.right + 12) + 'px', top: 0, height: row.height + 'px' },
                }, task.title),
            );
        }

        const barLeft = metrics.left;
        const barWidth = metrics.right - metrics.left;
        const barHeight = Math.min(28, row.height - 8);

        return h('div', {
            key: 'body-row-' + row.id,
            className: 'planning-gantt2-row',
            style: { top: row.top + 'px', height: row.height + 'px' },
            'data-task-id': task.id,
        },
            h('div', {
                className: 'planning-gantt2-bar'
                    + (isDone ? ' is-done' : '')
                    + (isCritical ? ' is-critical' : '')
                    + (isConflict ? ' is-conflict' : '')
                    + (hasSlack ? ' is-behind' : ''),
                style: {
                    left: barLeft + 'px',
                    width: Math.max(dayWidth, barWidth) + 'px',
                    top: ((row.height - barHeight) / 2) + 'px',
                    height: barHeight + 'px',
                    background: color,
                    '--bar-progress-color': color,
                },
                'data-task-id': task.id,
                title: hasSlack ? (task.title + ' · отстаёт на ' + Math.round(slack) + '%') : task.title,
                onPointerDown: onBarPointerDown ? (e) => onBarPointerDown(e, task.id, { isResizable: true }) : undefined,
            },
                progress > 0 && h('div', {
                    className: 'planning-gantt2-bar__progress',
                    style: { width: progress + '%' },
                }),
                h('div', { className: 'planning-gantt2-bar__label' }, task.title),
            ),
        );
    }

    HEYS.PlanningGantt = { GanttScreen: GanttScreenV2 };
})();
