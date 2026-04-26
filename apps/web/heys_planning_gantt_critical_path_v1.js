// heys_planning_gantt_critical_path_v1.js — pure DAG algorithms for Gantt v2 (Phase 4b).
// Critical Path Method (CPM), conflict detection, progress slack.
// All functions pure — no React, no DOM. Easy to unit-test.
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};

    // Build adjacency Maps from tasks[].blockedByTaskIds.
    // Returns Map<taskId, { task, predecessors: Set<id>, successors: Set<id> }>.
    function buildDependencyGraph(tasks) {
        const list = Array.isArray(tasks) ? tasks : [];
        const nodes = new Map();
        list.forEach((t) => {
            if (!t || !t.id) return;
            nodes.set(t.id, { task: t, predecessors: new Set(), successors: new Set() });
        });
        list.forEach((t) => {
            if (!t || !t.id) return;
            const blockers = Array.isArray(t.blockedByTaskIds) ? t.blockedByTaskIds : [];
            blockers.forEach((predId) => {
                if (!predId || predId === t.id) return;
                if (!nodes.has(predId)) return; // dangling reference — ignore
                nodes.get(predId).successors.add(t.id);
                nodes.get(t.id).predecessors.add(predId);
            });
        });
        return nodes;
    }

    // Kahn's algorithm. Returns { order: [taskId...], hasCycle: bool }.
    // hasCycle === true when result.length < graph.size.
    function topologicalSort(graph) {
        const inDegree = new Map();
        graph.forEach((node, id) => inDegree.set(id, node.predecessors.size));
        const queue = [];
        const order = [];
        inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });
        while (queue.length > 0) {
            const id = queue.shift();
            order.push(id);
            const node = graph.get(id);
            node.successors.forEach((succId) => {
                const nextDeg = inDegree.get(succId) - 1;
                inDegree.set(succId, nextDeg);
                if (nextDeg === 0) queue.push(succId);
            });
        }
        return { order, hasCycle: order.length < graph.size };
    }

    // Compute task duration in days. Uses dueDate-startDate span +1, fallback to 1 day.
    function getTaskDurationDays(task, diffDays) {
        if (!task) return 1;
        const start = task.startDate || task.dueDate;
        const end = task.dueDate || task.startDate;
        if (!start || !end) return 1;
        const span = Math.max(0, diffDays(start, end)) + 1;
        return Math.max(1, span);
    }

    // CPM: for each task compute ES/EF (forward) and LS/LF (backward). A task is on the
    // critical path when slack === 0 (LS === ES). Returns { criticalIds: Set, hasCycle: bool }.
    function computeCriticalPath(tasks, utilsLike) {
        const utils = utilsLike || (HEYS.Planning && HEYS.Planning.Utils) || {};
        const diffDays = typeof utils.diffDays === 'function' ? utils.diffDays : null;
        const graph = buildDependencyGraph(tasks);
        const { order, hasCycle } = topologicalSort(graph);
        if (hasCycle || !diffDays) return { criticalIds: new Set(), hasCycle };

        const ES = new Map();
        const EF = new Map();
        // Forward pass.
        order.forEach((id) => {
            const node = graph.get(id);
            const duration = getTaskDurationDays(node.task, diffDays);
            let earliestStart = 0;
            node.predecessors.forEach((predId) => {
                const predEF = EF.get(predId) || 0;
                if (predEF > earliestStart) earliestStart = predEF;
            });
            ES.set(id, earliestStart);
            EF.set(id, earliestStart + duration);
        });
        // Project finish = max of all EF values.
        let projectFinish = 0;
        EF.forEach((v) => { if (v > projectFinish) projectFinish = v; });

        // Backward pass.
        const LS = new Map();
        const LF = new Map();
        const reverse = order.slice().reverse();
        reverse.forEach((id) => {
            const node = graph.get(id);
            const duration = getTaskDurationDays(node.task, diffDays);
            let latestFinish = projectFinish;
            if (node.successors.size > 0) {
                latestFinish = Number.POSITIVE_INFINITY;
                node.successors.forEach((succId) => {
                    const succLS = LS.get(succId);
                    if (typeof succLS === 'number' && succLS < latestFinish) latestFinish = succLS;
                });
                if (!Number.isFinite(latestFinish)) latestFinish = projectFinish;
            }
            LF.set(id, latestFinish);
            LS.set(id, latestFinish - duration);
        });

        // Critical = slack 0 (within tolerance for floating point).
        const criticalIds = new Set();
        graph.forEach((_, id) => {
            const slack = (LS.get(id) || 0) - (ES.get(id) || 0);
            if (Math.abs(slack) < 0.001) criticalIds.add(id);
        });
        return { criticalIds, hasCycle: false };
    }

    // Progress slack: how far behind/ahead the task is vs. linear interpolation
    // between startDate and dueDate. Returns positive number = behind (good for highlight).
    function computeProgressSlack(task, todayIso, utilsLike) {
        if (!task || task.isMilestone) return 0;
        if (!task.startDate || !task.dueDate) return 0;
        const utils = utilsLike || (HEYS.Planning && HEYS.Planning.Utils) || {};
        const diffDays = typeof utils.diffDays === 'function' ? utils.diffDays : null;
        const dateStr = typeof utils.dateStr === 'function' ? utils.dateStr : null;
        if (!diffDays || !dateStr) return 0;

        const today = todayIso || dateStr();
        const total = diffDays(task.startDate, task.dueDate) + 1;
        if (total <= 0) return 0;
        const elapsed = Math.max(0, diffDays(task.startDate, today) + 1);
        const expectedPct = Math.max(0, Math.min(1, elapsed / total)) * 100;
        const actualPct = typeof task.progress === 'number'
            ? Math.max(0, Math.min(100, task.progress))
            : (task.status === 'done' ? 100 : 0);
        return expectedPct - actualPct; // > 0 = behind, < 0 = ahead
    }

    // Pairwise overlap detection within the same projectId.
    // Returns Set<id> for tasks that overlap with at least one peer.
    function detectConflicts(tasks) {
        const list = Array.isArray(tasks) ? tasks : [];
        const conflicts = new Set();
        const buckets = new Map();
        list.forEach((t) => {
            if (!t || !t.projectId) return;
            if (!t.startDate || !t.dueDate) return;
            if (t.isMilestone) return;
            if (!buckets.has(t.projectId)) buckets.set(t.projectId, []);
            buckets.get(t.projectId).push(t);
        });
        buckets.forEach((group) => {
            for (let i = 0; i < group.length; i += 1) {
                for (let j = i + 1; j < group.length; j += 1) {
                    const a = group[i];
                    const b = group[j];
                    if (a.dueDate < b.startDate || b.dueDate < a.startDate) continue;
                    conflicts.add(a.id);
                    conflicts.add(b.id);
                }
            }
        });
        return conflicts;
    }

    HEYS.PlanningGanttCriticalPath = {
        buildDependencyGraph,
        topologicalSort,
        computeCriticalPath,
        computeProgressSlack,
        detectConflicts,
        getTaskDurationDays,
    };
})();
