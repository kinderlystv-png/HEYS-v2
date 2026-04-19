// heys_planning_store_v1.js — shared store, helpers and hooks for HEYS planning
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const { useState, useEffect, useCallback, useMemo } = React;
    const U = HEYS.utils || {};
    const Planning = HEYS.Planning = HEYS.Planning || {};

    const KEYS = {
        PROJECTS: 'heys_planning_projects',
        TASKS: 'heys_planning_tasks',
        SLOTS: 'heys_planning_slots',
        CONTEXT_INBOX: 'heys_planning_inbox_v1',
        LINKS: 'heys_planning_links_v1',
    };

    const PROJECT_COLORS = [
        '#3b82f6', '#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981',
        '#22c55e', '#84cc16', '#a3e635', '#eab308', '#f59e0b', '#f97316',
        '#fb7185', '#f43f5e', '#ef4444', '#ec4899', '#d946ef', '#a855f7',
        '#8b5cf6', '#6366f1', '#38bdf8', '#2dd4bf', '#34d399', '#fda4af',
    ];

    const PRIORITY_CONFIG = {
        p1: { label: 'P1', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
        p2: { label: 'P2', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        p3: { label: 'P3', color: '#64748b', bg: 'rgba(100,116,139,0.14)' },
    };

    const STATUS_CONFIG = {
        todo: { label: 'Ожидает начала', icon: '○' },
        in_progress: { label: 'В работе', icon: '◐' },
        done: { label: 'Готово', icon: '●' },
        cancelled: { label: 'Отменено', icon: '✕' },
    };

    const DUE_BUCKETS = {
        all: 'Все даты',
        overdue: 'Просрочено',
        today: 'Сегодня',
        week: '7 дней',
        scheduled: 'Запланировано',
        unscheduled: 'Без слота',
    };

    const CALENDAR_START_HOUR = 3;
    const CALENDAR_END_HOUR = 26;
    const CALENDAR_HOUR_HEIGHT = 60;
    const GANTT_ZOOM_WIDTHS = { compact: 28, normal: 40, wide: 56 };

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function normalizeHexColor(value) {
        const input = String(value || '').trim().toLowerCase();
        if (!input) return null;
        if (/^#[0-9a-f]{6}$/.test(input)) return input;
        if (/^#[0-9a-f]{3}$/.test(input)) {
            return '#' + input.slice(1).split('').map((char) => char + char).join('');
        }
        return null;
    }

    function randomItem(items, fallback) {
        if (!Array.isArray(items) || items.length === 0) return fallback;
        return items[Math.floor(Math.random() * items.length)] || fallback;
    }

    function pickDistinctProjectColor(projects, options) {
        const list = Array.isArray(projects) ? projects : [];
        const excludeId = options?.excludeId || null;
        const excludeColor = normalizeHexColor(options?.excludeColor);
        const usedColors = new Set(
            list
                .filter((project) => project && project.id !== excludeId)
                .map((project) => normalizeHexColor(project.color))
                .filter(Boolean),
        );

        const available = PROJECT_COLORS.filter((color) => {
            const normalized = normalizeHexColor(color);
            if (!normalized) return false;
            if (excludeColor && normalized === excludeColor) return false;
            return !usedColors.has(normalized);
        });

        if (available.length > 0) return randomItem(available, PROJECT_COLORS[0]);

        const fallbackPool = PROJECT_COLORS.filter((color) => normalizeHexColor(color) !== excludeColor);
        return randomItem(fallbackPool, PROJECT_COLORS[0]);
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function localDateISO(date) {
        const value = date instanceof Date ? date : new Date(date);
        return [value.getFullYear(), pad2(value.getMonth() + 1), pad2(value.getDate())].join('-');
    }

    function normalizeDate(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            return new Date(value.length > 10 ? value : value + 'T12:00:00');
        }
        if (value instanceof Date) return new Date(value.getTime());
        return new Date(value);
    }

    function dateStr(value) {
        if (!value) return localDateISO(new Date());
        if (typeof value === 'string') return value.slice(0, 10);
        return localDateISO(normalizeDate(value));
    }

    function nowISO() {
        return new Date().toISOString();
    }

    function addDays(value, deltaDays) {
        const base = normalizeDate(value || new Date());
        base.setDate(base.getDate() + Number(deltaDays || 0));
        return dateStr(base);
    }

    function diffDays(fromValue, toValue) {
        if (!fromValue || !toValue) return 0;
        const from = normalizeDate(dateStr(fromValue));
        const to = normalizeDate(dateStr(toValue));
        const ms = to.getTime() - from.getTime();
        return Math.round(ms / 86400000);
    }

    function startOfWeek(baseDate) {
        const date = normalizeDate(baseDate || new Date());
        const day = date.getDay();
        const mondayOffset = (day + 6) % 7;
        date.setDate(date.getDate() - mondayOffset);
        return date;
    }

    function getWeekDays(baseDate) {
        const monday = startOfWeek(baseDate || new Date());
        const result = [];
        for (let index = 0; index < 7; index += 1) {
            const current = new Date(monday.getTime());
            current.setDate(monday.getDate() + index);
            result.push(dateStr(current));
        }
        return result;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function timeToMinutes(timeValue) {
        if (!timeValue || typeof timeValue !== 'string') return 0;
        const [hours, minutes] = timeValue.split(':').map(Number);
        return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    }

    function minutesToTime(totalMinutes) {
        const safe = clamp(Math.round(Number(totalMinutes) || 0), 0, (23 * 60) + 59);
        const hours = Math.floor(safe / 60);
        const minutes = safe % 60;
        return pad2(hours) + ':' + pad2(minutes);
    }

    function sortByOrder(items) {
        return items.slice().sort((left, right) => {
            const leftOrder = Number(left?.order ?? 0);
            const rightOrder = Number(right?.order ?? 0);
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''));
        });
    }

    function sortContextInboxItems(items) {
        return (Array.isArray(items) ? items : []).slice().sort((left, right) => {
            const leftUpdated = String(left?.updatedAt || left?.createdAt || '');
            const rightUpdated = String(right?.updatedAt || right?.createdAt || '');
            if (leftUpdated !== rightUpdated) return rightUpdated.localeCompare(leftUpdated);
            return String(right?.id || '').localeCompare(String(left?.id || ''));
        });
    }

    function getTaskDurationMinutes(task) {
        const planned = Number(task?.plannedMinutes);
        return planned > 0 ? planned : 60;
    }

    function isTaskTerminal(task) {
        return task?.status === 'done' || task?.status === 'cancelled';
    }

    function isTaskOverdue(task, todayIso) {
        return !!(task?.dueDate && !isTaskTerminal(task) && task.dueDate < todayIso);
    }

    function getDueBucket(task, todayIso, slots) {
        if (!task?.dueDate) {
            const hasSlot = Array.isArray(slots) && slots.some((slot) => slot.taskId === task.id);
            return hasSlot ? 'scheduled' : 'unscheduled';
        }
        if (task.dueDate < todayIso) return 'overdue';
        if (task.dueDate === todayIso) return 'today';
        if (diffDays(todayIso, task.dueDate) <= 7) return 'week';
        return 'all';
    }

    function getTaskProjectColor(task, projects) {
        const project = Array.isArray(projects)
            ? projects.find((entry) => entry.id === task?.projectId)
            : null;
        return project?.color || '#64748b';
    }

    function safeParse(raw, fallback) {
        if (raw === null || raw === undefined) return fallback;
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn('[HEYS.planning] Failed to parse planning storage:', error?.message || error);
            return fallback;
        }
    }

    function lsGet(key, fallback) {
        if (typeof U.lsGet === 'function') return U.lsGet(key, fallback);
        try {
            return safeParse(localStorage.getItem(key), fallback);
        } catch (error) {
            console.warn('[HEYS.planning] Failed to read planning storage:', key, error?.message || error);
            return fallback;
        }
    }

    function emitPlanningUpdated(kind, payload) {
        try {
            window.dispatchEvent(new CustomEvent('heys:planning-updated', { detail: { kind, payload } }));
        } catch (error) {
            console.warn('[HEYS.planning] Failed to emit planning event:', error?.message || error);
        }
    }

    function lsSet(key, value) {
        if (typeof U.lsSet === 'function') {
            U.lsSet(key, value);
            emitPlanningUpdated('storage:set', { key });
            return;
        }
        try {
            localStorage.setItem(key, JSON.stringify(value));
            emitPlanningUpdated('storage:set', { key });
        } catch (error) {
            console.warn('[HEYS.planning] Failed to write planning storage:', key, error?.message || error);
        }
    }

    function getProjects() {
        return sortByOrder(lsGet(KEYS.PROJECTS, []));
    }

    function saveProjects(projects) {
        lsSet(KEYS.PROJECTS, sortByOrder(projects || []));
    }

    function getTasks() {
        return sortByOrder(lsGet(KEYS.TASKS, []));
    }

    function saveTasks(tasks) {
        lsSet(KEYS.TASKS, sortByOrder(tasks || []));
    }

    function getSlots() {
        return sortByOrder(lsGet(KEYS.SLOTS, []));
    }

    function saveSlots(slots) {
        lsSet(KEYS.SLOTS, sortByOrder(slots || []));
    }

    function getContextInboxItems() {
        return sortContextInboxItems(lsGet(KEYS.CONTEXT_INBOX, []));
    }

    function saveContextInboxItems(items) {
        lsSet(KEYS.CONTEXT_INBOX, sortContextInboxItems(items || []));
    }

    function getNextOrder(items, predicate) {
        return items.filter(predicate).length;
    }

    function addProject(name) {
        const projects = getProjects();
        const project = {
            id: uid(),
            name: String(name || '').trim(),
            color: pickDistinctProjectColor(projects),
            status: 'active',
            order: projects.length,
            createdAt: nowISO(),
            updatedAt: nowISO(),
        };
        saveProjects(projects.concat(project));
        return project;
    }

    function updateProject(id, patch) {
        const projects = getProjects();
        const index = projects.findIndex((project) => project.id === id);
        if (index === -1) return null;
        const updated = { ...projects[index], ...patch, updatedAt: nowISO() };
        projects[index] = updated;
        saveProjects(projects);
        return updated;
    }

    function deleteProject(id) {
        const projects = getProjects().filter((project) => project.id !== id);
        saveProjects(projects);
        const tasks = getTasks().map((task) => task.projectId === id
            ? { ...task, projectId: undefined, updatedAt: nowISO() }
            : task);
        saveTasks(tasks);
    }

    function addTask(title, opts) {
        const tasks = getTasks();
        const projectId = opts?.projectId || undefined;
        const parentTaskId = opts?.parentTaskId || undefined;
        const task = {
            id: uid(),
            title: String(title || '').trim(),
            projectId,
            parentTaskId,
            blockedByTaskIds: Array.isArray(opts?.blockedByTaskIds) ? opts.blockedByTaskIds.slice() : [],
            priority: opts?.priority || 'p2',
            status: opts?.status || 'in_progress',
            startDate: opts?.startDate || undefined,
            dueDate: opts?.dueDate || undefined,
            plannedMinutes: Number(opts?.plannedMinutes) > 0 ? Number(opts.plannedMinutes) : undefined,
            baselineStartDate: opts?.baselineStartDate || undefined,
            baselineDueDate: opts?.baselineDueDate || undefined,
            baselinePlannedMinutes: Number(opts?.baselinePlannedMinutes) > 0 ? Number(opts.baselinePlannedMinutes) : undefined,
            order: getNextOrder(tasks, (item) => (item.projectId || '') === (projectId || '') && (item.parentTaskId || '') === (parentTaskId || '')),
            createdAt: nowISO(),
            updatedAt: nowISO(),
            completedAt: opts?.status === 'done' ? nowISO() : undefined,
        };
        saveTasks(tasks.concat(task));
        return task;
    }

    function updateTask(id, patch) {
        const tasks = getTasks();
        const index = tasks.findIndex((task) => task.id === id);
        if (index === -1) return null;
        const current = tasks[index];
        const next = {
            ...current,
            ...patch,
            blockedByTaskIds: Array.isArray(patch?.blockedByTaskIds)
                ? patch.blockedByTaskIds.filter((entry) => entry && entry !== id)
                : current.blockedByTaskIds,
            updatedAt: nowISO(),
        };

        if (patch?.status === 'done' && !current.completedAt) {
            next.completedAt = nowISO();
        } else if (patch?.status && patch.status !== 'done') {
            next.completedAt = undefined;
        }

        tasks[index] = next;
        saveTasks(tasks);
        return next;
    }

    function deleteTask(id) {
        let tasks = getTasks().filter((task) => task.id !== id);
        tasks = tasks.map((task) => ({
            ...task,
            blockedByTaskIds: Array.isArray(task.blockedByTaskIds)
                ? task.blockedByTaskIds.filter((entry) => entry !== id)
                : [],
            parentTaskId: task.parentTaskId === id ? undefined : task.parentTaskId,
            updatedAt: nowISO(),
        }));
        saveTasks(tasks);
        const slots = getSlots().filter((slot) => slot.taskId !== id);
        saveSlots(slots);
    }

    function reorderTasks(sourceId, targetId) {
        if (!sourceId || !targetId || sourceId === targetId) return getTasks();
        const tasks = getTasks();
        const source = tasks.find((task) => task.id === sourceId);
        const target = tasks.find((task) => task.id === targetId);
        if (!source || !target) return tasks;
        if ((source.projectId || '') !== (target.projectId || '')) return tasks;
        if ((source.parentTaskId || '') !== (target.parentTaskId || '')) return tasks;

        const siblings = sortByOrder(tasks.filter((task) =>
            (task.projectId || '') === (source.projectId || '') &&
            (task.parentTaskId || '') === (source.parentTaskId || '')
        ));

        const sourceIndex = siblings.findIndex((task) => task.id === sourceId);
        const targetIndex = siblings.findIndex((task) => task.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) return tasks;

        const reordered = siblings.slice();
        const [moved] = reordered.splice(sourceIndex, 1);
        reordered.splice(targetIndex, 0, moved);

        const nextOrder = new Map(reordered.map((task, order) => [task.id, order]));
        const nextTasks = tasks.map((task) => nextOrder.has(task.id)
            ? { ...task, order: nextOrder.get(task.id), updatedAt: nowISO() }
            : task);
        saveTasks(nextTasks);
        return nextTasks;
    }

    function addSlot(opts) {
        const slots = getSlots();
        const slot = {
            id: uid(),
            taskId: opts?.taskId || undefined,
            title: String(opts?.title || '').trim(),
            date: dateStr(opts?.date),
            startTime: opts?.startTime || '09:00',
            endTime: opts?.endTime || '10:00',
            source: opts?.source || 'user',
            recurrenceGroupId: opts?.recurrenceGroupId ? String(opts.recurrenceGroupId) : undefined,
            isBackground: Boolean(opts?.isBackground),
            bgColor: opts?.bgColor || undefined,
            createdAt: nowISO(),
            updatedAt: nowISO(),
        };
        saveSlots(slots.concat(slot));
        return slot;
    }

    function addSlotBatch(optsList) {
        const slots = getSlots();
        const now = nowISO();
        const created = (Array.isArray(optsList) ? optsList : []).map((opts) => ({
            id: uid(),
            taskId: opts?.taskId || undefined,
            title: String(opts?.title || '').trim(),
            date: dateStr(opts?.date),
            startTime: opts?.startTime || '09:00',
            endTime: opts?.endTime || '10:00',
            source: opts?.source || 'user',
            recurrenceGroupId: opts?.recurrenceGroupId ? String(opts.recurrenceGroupId) : undefined,
            isBackground: Boolean(opts?.isBackground),
            bgColor: opts?.bgColor || undefined,
            createdAt: now,
            updatedAt: now,
        }));
        if (!created.length) return [];
        saveSlots(slots.concat(created));
        return created;
    }

    function updateSlot(id, patch) {
        const slots = getSlots();
        const index = slots.findIndex((slot) => slot.id === id);
        if (index === -1) return null;
        const updated = {
            ...slots[index],
            ...patch,
            date: patch?.date ? dateStr(patch.date) : slots[index].date,
            updatedAt: nowISO(),
        };
        slots[index] = updated;
        saveSlots(slots);
        return updated;
    }

    function deleteSlot(id) {
        const slots = getSlots().filter((slot) => slot.id !== id);
        saveSlots(slots);
    }

    function deleteSlotBatch(ids) {
        const idSet = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '')).filter(Boolean));
        if (!idSet.size) return 0;
        const slots = getSlots().filter((slot) => !idSet.has(String(slot.id || '')));
        saveSlots(slots);
        return idSet.size;
    }

    function buildContextInboxPreview(text) {
        const normalized = String(text || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return { title: '', preview: '' };
        const titleBase = normalized.slice(0, 72).trim();
        return {
            title: normalized.length > 72 ? titleBase + '…' : titleBase,
            preview: normalized.length > 180 ? normalized.slice(0, 180).trim() + '…' : normalized,
        };
    }

    function addContextInboxItem(text, opts) {
        const body = String(text || '').trim();
        if (!body) return null;

        const items = getContextInboxItems();
        const now = nowISO();
        const presentation = buildContextInboxPreview(body);
        const item = {
            id: uid(),
            type: opts?.type || 'capture',
            status: opts?.status || 'new',
            source: opts?.source || 'user',
            privacy: opts?.privacy || 'standard',
            title: presentation.title || 'Новая запись',
            preview: presentation.preview,
            body,
            linkedTaskIds: Array.isArray(opts?.linkedTaskIds) ? opts.linkedTaskIds.slice() : [],
            createdAt: now,
            updatedAt: now,
        };

        saveContextInboxItems([item].concat(items));
        return item;
    }

    function updateContextInboxItem(id, patch) {
        const items = getContextInboxItems();
        const index = items.findIndex((item) => item.id === id);
        if (index === -1) return null;

        const current = items[index];
        const nextBody = patch?.body != null ? String(patch.body || '').trim() : current.body;
        const presentation = nextBody ? buildContextInboxPreview(nextBody) : null;
        const next = {
            ...current,
            ...patch,
            body: nextBody,
            title: presentation ? (patch?.title || presentation.title || current.title) : (patch?.title || current.title),
            preview: presentation ? presentation.preview : current.preview,
            linkedTaskIds: Array.isArray(patch?.linkedTaskIds)
                ? patch.linkedTaskIds.filter(Boolean)
                : current.linkedTaskIds,
            updatedAt: nowISO(),
        };

        items[index] = next;
        saveContextInboxItems(items);
        return next;
    }

    function deleteContextInboxItem(id) {
        const items = getContextInboxItems().filter((item) => item.id !== id);
        saveContextInboxItems(items);
    }

    // ── Links (graph edges) ──────────────────────────────────────────

    function getLinks() {
        return lsGet(KEYS.LINKS, []);
    }

    function saveLinks(links) {
        lsSet(KEYS.LINKS, Array.isArray(links) ? links : []);
    }

    function addLink(fromId, toId, opts) {
        if (!fromId || !toId || fromId === toId) return null;
        const links = getLinks();
        const existing = links.find(function (link) {
            return link.fromId === fromId && link.toId === toId && link.relation === (opts?.relation || 'related');
        });
        if (existing) return existing;
        var link = {
            id: uid(),
            fromId: fromId,
            toId: toId,
            fromType: opts?.fromType || 'unknown',
            toType: opts?.toType || 'unknown',
            relation: opts?.relation || 'related',
            label: opts?.label || '',
            createdAt: nowISO(),
        };
        saveLinks(links.concat(link));
        return link;
    }

    function deleteLink(id) {
        saveLinks(getLinks().filter(function (link) { return link.id !== id; }));
    }

    function getLinksFor(entityId) {
        return getLinks().filter(function (link) {
            return link.fromId === entityId || link.toId === entityId;
        });
    }

    function usePlanningState() {
        const [projects, setProjects] = useState(getProjects);
        const [tasks, setTasks] = useState(getTasks);
        const [slots, setSlots] = useState(getSlots);
        const [contextInboxItems, setContextInboxItems] = useState(getContextInboxItems);
        const [links, setLinks] = useState(getLinks);

        const refresh = useCallback(() => {
            setProjects(getProjects());
            setTasks(getTasks());
            setSlots(getSlots());
            setContextInboxItems(getContextInboxItems());
            setLinks(getLinks());
        }, []);

        useEffect(() => {
            const handleRefresh = () => refresh();
            window.addEventListener('storage', handleRefresh);
            window.addEventListener('data:updated', handleRefresh);
            window.addEventListener('heys:planning-updated', handleRefresh);
            return () => {
                window.removeEventListener('storage', handleRefresh);
                window.removeEventListener('data:updated', handleRefresh);
                window.removeEventListener('heys:planning-updated', handleRefresh);
            };
        }, [refresh]);

        const api = useMemo(() => ({
            addProject: (name) => { const project = addProject(name); refresh(); return project; },
            updateProject: (id, patch) => { const project = updateProject(id, patch); refresh(); return project; },
            deleteProject: (id) => { deleteProject(id); refresh(); },
            addTask: (title, opts) => { const task = addTask(title, opts); refresh(); return task; },
            updateTask: (id, patch) => { const task = updateTask(id, patch); refresh(); return task; },
            deleteTask: (id) => { deleteTask(id); refresh(); },
            reorderTasks: (sourceId, targetId) => { const nextTasks = reorderTasks(sourceId, targetId); refresh(); return nextTasks; },
            addSlot: (opts) => { const slot = addSlot(opts); refresh(); return slot; },
            addSlotBatch: (optsList) => { const list = addSlotBatch(optsList); refresh(); return list; },
            updateSlot: (id, patch) => { const slot = updateSlot(id, patch); refresh(); return slot; },
            deleteSlot: (id) => { deleteSlot(id); refresh(); },
            deleteSlotBatch: (ids) => { const n = deleteSlotBatch(ids); if (n) refresh(); return n; },
            addContextInboxItem: (text, opts) => { const item = addContextInboxItem(text, opts); refresh(); return item; },
            updateContextInboxItem: (id, patch) => { const item = updateContextInboxItem(id, patch); refresh(); return item; },
            deleteContextInboxItem: (id) => { deleteContextInboxItem(id); refresh(); },
            addLink: (fromId, toId, opts) => { const link = addLink(fromId, toId, opts); refresh(); return link; },
            deleteLink: (id) => { deleteLink(id); refresh(); },
            getLinksFor,
            refresh,
        }), [refresh]);

        return { projects, tasks, slots, contextInboxItems, links, ...api };
    }

    function usePlanningViewport() {
        const [isDesktop, setIsDesktop] = useState(() => (window.innerWidth || 0) > 768);

        useEffect(() => {
            const handleResize = () => setIsDesktop((window.innerWidth || 0) > 768);
            window.addEventListener('resize', handleResize);
            return () => window.removeEventListener('resize', handleResize);
        }, []);

        return { isDesktop };
    }

    Planning.Constants = {
        KEYS,
        PROJECT_COLORS,
        PRIORITY_CONFIG,
        STATUS_CONFIG,
        DUE_BUCKETS,
        CALENDAR_START_HOUR,
        CALENDAR_END_HOUR,
        CALENDAR_HOUR_HEIGHT,
        GANTT_ZOOM_WIDTHS,
    };

    Planning.Utils = {
        uid,
        dateStr,
        nowISO,
        addDays,
        diffDays,
        getWeekDays,
        clamp,
        timeToMinutes,
        minutesToTime,
        localDateISO,
        getTaskDurationMinutes,
        isTaskTerminal,
        isTaskOverdue,
        getDueBucket,
        getTaskProjectColor,
        pickDistinctProjectColor,
        sortByOrder,
    };

    Planning.Store = {
        getProjects,
        saveProjects,
        addProject,
        updateProject,
        deleteProject,
        getTasks,
        saveTasks,
        addTask,
        updateTask,
        deleteTask,
        reorderTasks,
        getSlots,
        saveSlots,
        addSlot,
        addSlotBatch,
        updateSlot,
        deleteSlot,
        deleteSlotBatch,
        getContextInboxItems,
        saveContextInboxItems,
        addContextInboxItem,
        updateContextInboxItem,
        deleteContextInboxItem,
        getLinks,
        saveLinks,
        addLink,
        deleteLink,
        getLinksFor,
    };

    Planning.Hooks = {
        usePlanningState,
        usePlanningViewport,
    };
})();
