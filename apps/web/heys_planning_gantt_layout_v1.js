// heys_planning_gantt_layout_v1.js — pure layout helpers for Gantt v2
// No React; relies on HEYS.Planning.Utils for date math.
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};

    // Snap targets — covers quarter-view (12px/day) up to wide hour-zoom (120px/day).
    const ZOOM_SNAP_VALUES = [12, 18, 28, 40, 56, 80, 120];
    const ZOOM_MIN = 12;
    const ZOOM_MAX = 120;
    const DEFAULT_DAY_WIDTH = 28;

    const GROUP_ROW_HEIGHT = 44;
    const TASK_ROW_HEIGHT = 44;
    const VIRTUAL_BUFFER_DEFAULT = 5;

    // Mon-Sun two-letter labels (matches existing WEEKDAY_LABELS in heys_planning_schedule_v1.js)
    const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    function resolveUtils() {
        const utils = HEYS.Planning && HEYS.Planning.Utils;
        if (!utils) throw new Error('[gantt-layout] HEYS.Planning.Utils unavailable');
        return utils;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function clampDayWidth(value) {
        return clamp(Number(value) || DEFAULT_DAY_WIDTH, ZOOM_MIN, ZOOM_MAX);
    }

    function snapDayWidth(value) {
        const safe = clampDayWidth(value);
        let best = ZOOM_SNAP_VALUES[0];
        let bestDist = Math.abs(best - safe);
        for (let i = 1; i < ZOOM_SNAP_VALUES.length; i += 1) {
            const v = ZOOM_SNAP_VALUES[i];
            const d = Math.abs(v - safe);
            if (d < bestDist) { best = v; bestDist = d; }
        }
        return best;
    }

    function pinchRatioToWidth(initialWidth, ratio) {
        const safeInitial = clamp(Number(initialWidth) || DEFAULT_DAY_WIDTH, ZOOM_MIN, ZOOM_MAX);
        const safeRatio = Number(ratio) || 1;
        return clamp(safeInitial * safeRatio, ZOOM_MIN, ZOOM_MAX);
    }

    function isRelevantTask(task, opts) {
        if (!task) return false;
        if (task.status === 'cancelled' && !(opts && opts.includeCancelled)) return false;
        return !!(task.startDate || task.dueDate || task.baselineStartDate || task.baselineDueDate);
    }

    function computeRelevantTasks(tasks, opts) {
        const list = Array.isArray(tasks) ? tasks : [];
        return list.filter((t) => isRelevantTask(t, opts));
    }

    // Tasks WITHOUT any date span — used by the "Backlog" zone in Gantt v2.
    // Excludes cancelled and milestones (milestones with dueDate are scheduled).
    function computeBacklogTasks(tasks) {
        const list = Array.isArray(tasks) ? tasks : [];
        return list.filter((t) => {
            if (!t) return false;
            if (t.status === 'cancelled') return false;
            return !(t.startDate || t.dueDate || t.baselineStartDate || t.baselineDueDate);
        });
    }

    // Compute timeline bounds with ±2-year clamp from today (perf safety against far-future dates).
    function computeTimelineBounds(relevantTasks, todayIso) {
        const utils = resolveUtils();
        const today = todayIso || utils.dateStr();
        const minClamp = utils.addDays(today, -730);
        const maxClamp = utils.addDays(today, 730);

        const dates = [];
        relevantTasks.forEach((task) => {
            [task.startDate, task.dueDate, task.baselineStartDate, task.baselineDueDate].forEach((value) => {
                if (value) dates.push(value);
            });
        });
        if (dates.length === 0) {
            return { start: utils.addDays(today, -3), end: utils.addDays(today, 17) };
        }
        const sorted = dates.slice().sort();
        let start = utils.addDays(sorted[0], -2);
        let end = utils.addDays(sorted[sorted.length - 1], 4);
        if (start < minClamp) start = minClamp;
        if (end > maxClamp) end = maxClamp;
        if (start > end) start = end;
        return { start, end };
    }

    function computeTimelineDays(bounds) {
        const utils = resolveUtils();
        const length = Math.max(1, utils.diffDays(bounds.start, bounds.end) + 1);
        const days = new Array(length);
        for (let i = 0; i < length; i += 1) days[i] = utils.addDays(bounds.start, i);
        return days;
    }

    // Build groups: { project, tasks } per project (filtered by status !== 'archived').
    // '__none__' bucket holds tasks without project. Empty buckets dropped.
    function computeGroupedTasks(relevantTasks, projects) {
        const buckets = new Map();
        const activeProjects = (Array.isArray(projects) ? projects : []).filter((p) => p && p.status !== 'archived');
        activeProjects.forEach((project) => {
            buckets.set(project.id, { project, tasks: [] });
        });
        const noneBucket = {
            project: { id: '__none__', name: 'Без проекта', color: '#94a3b8' },
            tasks: [],
        };
        buckets.set('__none__', noneBucket);

        relevantTasks.forEach((task) => {
            const key = task.projectId && buckets.has(task.projectId) ? task.projectId : '__none__';
            buckets.get(key).tasks.push(task);
        });

        return Array.from(buckets.values())
            .map((entry) => ({
                ...entry,
                tasks: entry.tasks.slice().sort((left, right) => (left.order || 0) - (right.order || 0)),
            }))
            .filter((entry) => entry.tasks.length > 0);
    }

    // Compute rows + per-task metrics. Returns absolute-positioned layout.
    // collapsed: { [projectId]: true } — collapse a group's tasks (group row still rendered).
    function computeRowsAndMetrics(grouped, timelineStartIso, dayWidth, collapsed) {
        const utils = resolveUtils();
        const taskTopById = {};
        const taskMetrics = {};
        const rows = [];
        const collapsedSet = collapsed || {};
        let cursorTop = 0;

        grouped.forEach((group) => {
            rows.push({
                type: 'group',
                id: group.project.id,
                top: cursorTop,
                height: GROUP_ROW_HEIGHT,
                group,
            });
            cursorTop += GROUP_ROW_HEIGHT;
            if (collapsedSet[group.project.id]) return;

            group.tasks.forEach((task) => {
                rows.push({
                    type: 'task',
                    id: task.id,
                    top: cursorTop,
                    height: TASK_ROW_HEIGHT,
                    task,
                    group,
                });
                taskTopById[task.id] = cursorTop;

                const startDate = task.startDate || task.dueDate;
                const dueDate = task.dueDate || task.startDate;
                if (startDate && dueDate) {
                    const startOffset = utils.diffDays(timelineStartIso, startDate);
                    const dueOffset = utils.diffDays(timelineStartIso, dueDate);
                    const left = startOffset * dayWidth;
                    const width = Math.max(dayWidth, ((dueOffset - startOffset) + 1) * dayWidth);
                    taskMetrics[task.id] = {
                        left,
                        right: left + width,
                        centerY: cursorTop + (TASK_ROW_HEIGHT / 2),
                    };
                }
                cursorTop += TASK_ROW_HEIGHT;
            });
        });

        return { rows, taskTopById, taskMetrics, height: cursorTop };
    }

    // Virtualization slice: rows visible within [scrollTop, scrollTop + viewportH] +/- buffer rows.
    // Returns { startIdx, endIdx, slice } — slice is rows.slice(startIdx, endIdx).
    function computeVisibleSlice(rows, scrollTop, viewportH, rowHeight, buffer) {
        const safeRows = Array.isArray(rows) ? rows : [];
        if (safeRows.length === 0) return { startIdx: 0, endIdx: 0, slice: [] };
        const safeRowH = Number(rowHeight) > 0 ? Number(rowHeight) : TASK_ROW_HEIGHT;
        const safeBuffer = Number(buffer) >= 0 ? Number(buffer) : VIRTUAL_BUFFER_DEFAULT;
        const safeScrollTop = Math.max(0, Number(scrollTop) || 0);
        const safeViewportH = Math.max(0, Number(viewportH) || 0);

        if (safeViewportH === 0) {
            // Fallback: render the first ~30 rows when viewport size unknown (initial mount).
            return { startIdx: 0, endIdx: Math.min(safeRows.length, 30), slice: safeRows.slice(0, Math.min(safeRows.length, 30)) };
        }

        // Use first row's top as anchor — rows are absolute-positioned.
        // We can binary-search but linear is fine for hundreds of rows.
        let firstVisible = 0;
        for (let i = 0; i < safeRows.length; i += 1) {
            const row = safeRows[i];
            const rowBottom = row.top + (row.height || safeRowH);
            if (rowBottom > safeScrollTop) { firstVisible = i; break; }
            firstVisible = safeRows.length;
        }
        let lastVisible = firstVisible;
        const viewportBottom = safeScrollTop + safeViewportH;
        for (let i = firstVisible; i < safeRows.length; i += 1) {
            if (safeRows[i].top >= viewportBottom) break;
            lastVisible = i;
        }

        const startIdx = Math.max(0, firstVisible - safeBuffer);
        const endIdx = Math.min(safeRows.length, lastVisible + safeBuffer + 1);
        return { startIdx, endIdx, slice: safeRows.slice(startIdx, endIdx) };
    }

    function isWeekendDay(iso) {
        if (!iso || typeof iso !== 'string') return false;
        const date = new Date(iso + 'T12:00:00');
        const day = date.getDay();
        return day === 0 || day === 6;
    }

    function weekdayLabelForIso(iso) {
        const date = new Date(iso + 'T12:00:00');
        return WEEKDAY_LABELS[(date.getDay() + 6) % 7];
    }

    HEYS.PlanningGanttLayout = {
        // Pure helpers (testable)
        clampDayWidth,
        snapDayWidth,
        pinchRatioToWidth,
        computeRelevantTasks,
        computeBacklogTasks,
        computeTimelineBounds,
        computeTimelineDays,
        computeGroupedTasks,
        computeRowsAndMetrics,
        computeVisibleSlice,
        isWeekendDay,
        weekdayLabelForIso,
        // Constants
        ZOOM_SNAP_VALUES,
        ZOOM_MIN,
        ZOOM_MAX,
        DEFAULT_DAY_WIDTH,
        GROUP_ROW_HEIGHT,
        TASK_ROW_HEIGHT,
        VIRTUAL_BUFFER_DEFAULT,
        WEEKDAY_LABELS,
    };
})();
