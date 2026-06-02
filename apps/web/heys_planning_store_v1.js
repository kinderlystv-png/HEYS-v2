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
        LINKS: 'heys_planning_links_v1',
        CHRONO_ACTIVITIES: 'heys_planning_chrono_activities',
        CHRONO_ENTRIES: 'heys_planning_chrono_entries',
        CHRONO_SNAPSHOTS: 'heys_planning_chrono_snapshots',
        CHRONO_TIMER: 'heys_planning_chrono_timer',
    };

    const PROJECT_COLORS = [
        '#3b82f6', '#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981',
        '#22c55e', '#84cc16', '#a3e635', '#eab308', '#f59e0b', '#f97316',
        '#fb7185', '#f43f5e', '#ef4444', '#ec4899', '#d946ef', '#a855f7',
        '#8b5cf6', '#6366f1', '#38bdf8', '#2dd4bf', '#34d399', '#fda4af',
    ];

    const PRIORITY_CONFIG = {
        'p!': { label: 'P!', color: '#ea580c', bg: 'rgba(249,115,22,0.16)', border: 'rgba(249,115,22,0.28)' },
        p1: { label: 'P1', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.22)' },
        p2: { label: 'P2', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.24)' },
        p3: { label: 'P3', color: '#64748b', bg: 'rgba(100,116,139,0.14)', border: 'rgba(100,116,139,0.24)' },
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

    // Chrono palette — отдельный hue-пул для подвкладки «Хронометраж».
    // Кружки кодируют время двойной осью: размер (радиус) + насыщенность цвета.
    // Здесь храним только hue; saturation/lightness считаются на рендере по minutes/maxMin.
    const CHRONO_HUES = [
        18,   // тёплый коралл
        38,   // оранжевый
        70,   // оливковый
        100,  // зелёный
        145,  // морская зелень
        175,  // бирюзовый
        205,  // небесно-голубой
        225,  // синий
        260,  // сине-фиолетовый (мягкий)
        290,  // приглушённый пурпур
    ];

    function normalizeHue(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return ((Math.round(n) % 360) + 360) % 360;
    }

    function pickDistinctChronoHue(activities, options) {
        const list = Array.isArray(activities) ? activities : [];
        const excludeId = options?.excludeId || null;
        const used = new Set(
            list
                .filter((a) => a && a.id !== excludeId)
                .map((a) => normalizeHue(a.hue))
                .filter((h) => h !== null),
        );

        const available = CHRONO_HUES.filter((h) => !used.has(h));
        if (available.length > 0) return randomItem(available, CHRONO_HUES[0]);

        // Пул исчерпан — выбираем максимально удалённый от ближайшего used.
        let bestHue = CHRONO_HUES[0];
        let bestDist = -1;
        for (let candidate = 0; candidate < 360; candidate += 12) {
            let minDist = 360;
            used.forEach((h) => {
                const diff = Math.abs(candidate - h);
                const dist = Math.min(diff, 360 - diff);
                if (dist < minDist) minDist = dist;
            });
            if (minDist > bestDist) {
                bestDist = minDist;
                bestHue = candidate;
            }
        }
        return bestHue;
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

    function clampProgress(value, status) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return clamp(Math.round(value), 0, 100);
        }
        return status === 'done' ? 100 : 0;
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
            progress: clampProgress(opts?.progress, opts?.status || 'in_progress'),
            isMilestone: opts?.isMilestone === true,
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

        if (patch && Object.prototype.hasOwnProperty.call(patch, 'isMilestone')) {
            next.isMilestone = patch.isMilestone === true;
        }

        if (patch && Object.prototype.hasOwnProperty.call(patch, 'progress')) {
            next.progress = clampProgress(patch.progress, next.status);
            if (next.progress === 100 && next.status !== 'done' && next.status !== 'cancelled') {
                next.status = 'done';
                if (!current.completedAt) next.completedAt = nowISO();
            }
        } else if (patch?.status === 'done') {
            next.progress = 100;
        } else if (patch?.status && patch.status !== 'done' && current.progress === 100) {
            next.progress = 0;
        } else if (typeof current.progress !== 'number') {
            next.progress = clampProgress(undefined, next.status);
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

    // ── Chrono activities / entries / snapshots ─────────────────────
    // Отдельная сущность хранения: dayv2 рискован из-за hashDay по meals/items
    // и `...remote` spread в mergeDayData — chrono-поля терялись бы при cross-client merge,
    // плюс ломался бы режим Неделя. Здесь — три плоских ключа, синкаются через
    // localStorage interceptor + refreshPlanningFromCloud, как projects/tasks/slots.

    function getChronoActivities() {
        return sortByOrder(lsGet(KEYS.CHRONO_ACTIVITIES, []));
    }

    function saveChronoActivities(activities) {
        lsSet(KEYS.CHRONO_ACTIVITIES, sortByOrder(activities || []));
    }

    function addChronoActivity(input) {
        const activities = getChronoActivities();
        const name = String(input?.name || '').trim();
        if (!name) return null;
        const hue = input?.hue !== undefined && normalizeHue(input.hue) !== null
            ? normalizeHue(input.hue)
            : pickDistinctChronoHue(activities);
        const dayVal = Number(input?.targetMinutesPerDay);
        const weekVal = Number(input?.targetMinutesPerWeek);
        const dayBudget = Number(input?.budgetMinutesPerDay);
        const weekBudget = Number(input?.budgetMinutesPerWeek);
        const activity = {
            id: uid(),
            name,
            emoji: input?.emoji ? String(input.emoji) : undefined,
            hue,
            taskId: input?.taskId ? String(input.taskId) : undefined,
            projectId: input?.projectId ? String(input.projectId) : undefined,
            targetMinutesPerDay: dayVal > 0 ? Math.round(dayVal) : undefined,
            targetMinutesPerWeek: weekVal > 0 ? Math.round(weekVal) : undefined,
            budgetMinutesPerDay: dayBudget > 0 ? Math.round(dayBudget) : undefined,
            budgetMinutesPerWeek: weekBudget > 0 ? Math.round(weekBudget) : undefined,
            archived: false,
            createdAt: nowISO(),
            updatedAt: nowISO(),
        };
        saveChronoActivities(activities.concat(activity));
        return activity;
    }

    function updateChronoActivity(id, patch) {
        const activities = getChronoActivities();
        const index = activities.findIndex((a) => a.id === id);
        if (index === -1) return null;
        const current = activities[index];
        const updated = { ...current, ...patch, updatedAt: nowISO() };
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'hue')) {
            const nh = normalizeHue(patch.hue);
            if (nh !== null) updated.hue = nh;
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'taskId')) {
            updated.taskId = patch.taskId ? String(patch.taskId) : undefined;
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'projectId')) {
            updated.projectId = patch.projectId ? String(patch.projectId) : undefined;
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'archived')) {
            updated.archived = patch.archived === true;
            updated.archivedAt = updated.archived ? nowISO() : undefined;
        }
        // Цели и лимиты независимы между периодами (день/неделя), но
        // внутри одного периода mutually exclusive: target и budget не могут
        // одновременно быть установлены (бизнес-логика: цель — это «расти к»,
        // лимит — «не превышать», для одного периода только что-то одно).
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'targetMinutesPerDay')) {
            const tv = Number(patch.targetMinutesPerDay);
            if (tv > 0) {
                updated.targetMinutesPerDay = Math.round(tv);
                updated.budgetMinutesPerDay = undefined;
            } else {
                updated.targetMinutesPerDay = undefined;
            }
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'targetMinutesPerWeek')) {
            const tv = Number(patch.targetMinutesPerWeek);
            if (tv > 0) {
                updated.targetMinutesPerWeek = Math.round(tv);
                updated.budgetMinutesPerWeek = undefined;
            } else {
                updated.targetMinutesPerWeek = undefined;
            }
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'budgetMinutesPerDay')) {
            const bv = Number(patch.budgetMinutesPerDay);
            if (bv > 0) {
                updated.budgetMinutesPerDay = Math.round(bv);
                updated.targetMinutesPerDay = undefined;
            } else {
                updated.budgetMinutesPerDay = undefined;
            }
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'budgetMinutesPerWeek')) {
            const bv = Number(patch.budgetMinutesPerWeek);
            if (bv > 0) {
                updated.budgetMinutesPerWeek = Math.round(bv);
                updated.targetMinutesPerWeek = undefined;
            } else {
                updated.budgetMinutesPerWeek = undefined;
            }
        }
        activities[index] = updated;
        saveChronoActivities(activities);
        return updated;
    }

    function archiveChronoActivity(id) {
        return updateChronoActivity(id, { archived: true });
    }

    function restoreChronoActivity(id) {
        return updateChronoActivity(id, { archived: false });
    }

    function deleteChronoActivity(id) {
        const activities = getChronoActivities().filter((a) => a.id !== id);
        saveChronoActivities(activities);
        const entries = getChronoEntries().filter((e) => e.activityId !== id);
        saveChronoEntries(entries);
        const snapshots = getChronoSnapshots().filter((s) => s.activityId !== id);
        saveChronoSnapshots(snapshots);
    }

    function getChronoEntries() {
        return lsGet(KEYS.CHRONO_ENTRIES, []);
    }

    function saveChronoEntries(entries) {
        lsSet(KEYS.CHRONO_ENTRIES, Array.isArray(entries) ? entries : []);
    }

    function addChronoEntry(input) {
        const activityId = input?.activityId;
        const minutes = Math.round(Number(input?.minutes) || 0);
        if (!activityId || minutes <= 0) return null;
        const activity = getChronoActivities().find((a) => a.id === activityId);
        if (!activity) return null;
        const entry = {
            id: uid(),
            activityId,
            date: dateStr(input?.date),
            minutes,
            createdAt: nowISO(),
        };
        saveChronoEntries(getChronoEntries().concat(entry));
        return entry;
    }

    function updateChronoEntry(id, patch) {
        if (!id) return null;
        const entries = getChronoEntries();
        const index = entries.findIndex((e) => e.id === id);
        if (index === -1) return null;
        const current = entries[index];
        const next = { ...current, updatedAt: nowISO() };

        if (patch && Object.prototype.hasOwnProperty.call(patch, 'minutes')) {
            const minutes = Math.round(Number(patch.minutes) || 0);
            if (minutes <= 0) return null;
            next.minutes = minutes;
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'date')) {
            next.date = dateStr(patch.date);
        }
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'activityId')) {
            const activityId = patch.activityId ? String(patch.activityId) : '';
            const activity = getChronoActivities().find((a) => a.id === activityId);
            if (!activity) return null;
            next.activityId = activityId;
        }

        entries[index] = next;
        saveChronoEntries(entries);
        return next;
    }

    function adjustChronoEntryMinutes(id, deltaMinutes) {
        const entries = getChronoEntries();
        const current = entries.find((e) => e.id === id);
        if (!current) return null;
        const nextMinutes = Math.round((Number(current.minutes) || 0) + (Number(deltaMinutes) || 0));
        if (nextMinutes <= 0) {
            deleteChronoEntry(id);
            return { ...current, minutes: 0, deleted: true };
        }
        return updateChronoEntry(id, { minutes: nextMinutes });
    }

    function deleteChronoEntry(id) {
        if (!id) return;
        saveChronoEntries(getChronoEntries().filter((e) => e.id !== id));
    }

    function getChronoSnapshots() {
        return lsGet(KEYS.CHRONO_SNAPSHOTS, []);
    }

    function saveChronoSnapshots(snapshots) {
        lsSet(KEYS.CHRONO_SNAPSHOTS, Array.isArray(snapshots) ? snapshots : []);
    }

    function upsertSnapshotInPlace(snapshots, date, activityId, addMinutes) {
        const idx = snapshots.findIndex((s) => s.date === date && s.activityId === activityId);
        if (idx === -1) {
            snapshots.push({ date, activityId, totalMinutes: addMinutes });
        } else {
            snapshots[idx] = {
                ...snapshots[idx],
                totalMinutes: (Number(snapshots[idx].totalMinutes) || 0) + addMinutes,
            };
        }
    }

    function mergeChronoActivities(fromId, toId) {
        if (!fromId || !toId || fromId === toId) return false;
        const activities = getChronoActivities();
        const from = activities.find((a) => a.id === fromId);
        const to = activities.find((a) => a.id === toId);
        if (!from || !to) return false;

        const entries = getChronoEntries().map((e) => e.activityId === fromId
            ? { ...e, activityId: toId }
            : e);
        saveChronoEntries(entries);

        const snapshots = getChronoSnapshots().slice();
        const movedFrom = snapshots.filter((s) => s.activityId === fromId);
        const remaining = snapshots.filter((s) => s.activityId !== fromId);
        movedFrom.forEach((snap) => {
            upsertSnapshotInPlace(remaining, snap.date, toId, Number(snap.totalMinutes) || 0);
        });
        saveChronoSnapshots(remaining);

        saveChronoActivities(activities.filter((a) => a.id !== fromId));
        return true;
    }

    function compactChronoOlderThan90Once() {
        const entries = getChronoEntries();
        if (!entries.length) return 0;
        const cutoff = addDays(dateStr(new Date()), -90);
        const old = entries.filter((e) => e.date && e.date < cutoff);
        if (!old.length) return 0;
        const fresh = entries.filter((e) => !(e.date && e.date < cutoff));

        const snapshots = getChronoSnapshots().slice();
        old.forEach((e) => {
            upsertSnapshotInPlace(snapshots, e.date, e.activityId, Number(e.minutes) || 0);
        });

        saveChronoSnapshots(snapshots);
        saveChronoEntries(fresh);
        return old.length;
    }

    // ── Chrono timer (один глобальный активный таймер на клиент) ───────
    // Shape:
    // { activityId, startMs, plannedMinutes, accumulatedPausedMs, pausedAt, createdAt } | null

    function getChronoTimer() {
        return lsGet(KEYS.CHRONO_TIMER, null);
    }

    function saveChronoTimer(timer) {
        lsSet(KEYS.CHRONO_TIMER, timer || null);
    }

    function startChronoTimer(input) {
        const activityId = input?.activityId;
        const plannedMinutes = Math.round(Number(input?.plannedMinutes) || 0);
        if (!activityId || plannedMinutes <= 0) return null;
        const activity = getChronoActivities().find((a) => a.id === activityId);
        if (!activity) return null;
        const timer = {
            activityId,
            startMs: Date.now(),
            plannedMinutes,
            accumulatedPausedMs: 0,
            pausedAt: null,
            createdAt: nowISO(),
        };
        saveChronoTimer(timer);
        return timer;
    }

    function pauseChronoTimer() {
        const timer = getChronoTimer();
        if (!timer || timer.pausedAt) return timer || null;
        const next = { ...timer, pausedAt: Date.now(), updatedAt: nowISO() };
        saveChronoTimer(next);
        return next;
    }

    function resumeChronoTimer() {
        const timer = getChronoTimer();
        if (!timer || !timer.pausedAt) return timer || null;
        const pausedFor = Math.max(0, Date.now() - Number(timer.pausedAt));
        const next = {
            ...timer,
            accumulatedPausedMs: Math.max(0, Number(timer.accumulatedPausedMs) || 0) + pausedFor,
            pausedAt: null,
            updatedAt: nowISO(),
        };
        saveChronoTimer(next);
        return next;
    }

    function clearChronoTimer() {
        saveChronoTimer(null);
    }

    function getChronoMinutesByActivity(entries, snapshots, dates) {
        const dateSet = new Set(Array.isArray(dates) ? dates : []);
        const out = {};
        (Array.isArray(entries) ? entries : []).forEach((e) => {
            if (!e || !dateSet.has(e.date)) return;
            out[e.activityId] = (out[e.activityId] || 0) + (Number(e.minutes) || 0);
        });
        (Array.isArray(snapshots) ? snapshots : []).forEach((s) => {
            if (!s || !dateSet.has(s.date)) return;
            out[s.activityId] = (out[s.activityId] || 0) + (Number(s.totalMinutes) || 0);
        });
        return out;
    }

    function getPlanningCloudClientId() {
        try {
            if (HEYS.cloud && typeof HEYS.cloud.getClientId === 'function') {
                const id = String(HEYS.cloud.getClientId() || '');
                if (id) return id;
            }
        } catch (e) { /* noop */ }
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem('heys_pin_auth_client')
                    || localStorage.getItem('heys_client_current')
                    || '';
            }
        } catch (e) { /* noop */ }
        return '';
    }

    function refreshPlanningFromCloud() {
        const YandexAPI = HEYS.YandexAPI;
        const Store = HEYS.Planning && HEYS.Planning.Store;
        if (!YandexAPI || !Store || typeof YandexAPI.getKVBatch !== 'function') {
            return Promise.resolve({ ok: false, reason: 'no_api' });
        }
        const clientId = getPlanningCloudClientId();
        const keys = [
            'heys_planning_projects',
            'heys_planning_tasks',
            'heys_planning_slots',
            'heys_planning_links_v1',
            'heys_planning_chrono_activities',
            'heys_planning_chrono_entries',
            'heys_planning_chrono_snapshots',
            'heys_planning_chrono_timer',
        ];
        return YandexAPI.getKVBatch(clientId, keys).then(function (res) {
            if (res.error || !Array.isArray(res.data)) {
                return { ok: false, reason: res.error || 'batch_failed' };
            }
            res.data.forEach(function (item) {
                if (!item || item.k == null || item.v == null) return;
                if (item.k === 'heys_planning_projects' && typeof Store.saveProjects === 'function') {
                    Store.saveProjects(item.v);
                } else if (item.k === 'heys_planning_tasks' && typeof Store.saveTasks === 'function') {
                    Store.saveTasks(item.v);
                } else if (item.k === 'heys_planning_slots' && typeof Store.saveSlots === 'function') {
                    Store.saveSlots(item.v);
                } else if (item.k === 'heys_planning_links_v1' && typeof Store.saveLinks === 'function') {
                    Store.saveLinks(item.v);
                } else if (item.k === 'heys_planning_chrono_activities' && typeof Store.saveChronoActivities === 'function') {
                    Store.saveChronoActivities(item.v);
                } else if (item.k === 'heys_planning_chrono_entries' && typeof Store.saveChronoEntries === 'function') {
                    Store.saveChronoEntries(item.v);
                } else if (item.k === 'heys_planning_chrono_snapshots' && typeof Store.saveChronoSnapshots === 'function') {
                    Store.saveChronoSnapshots(item.v);
                } else if (item.k === 'heys_planning_chrono_timer' && typeof Store.saveChronoTimer === 'function') {
                    Store.saveChronoTimer(item.v);
                }
            });
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('heys:planning-updated'));
                }
            } catch (e) { /* noop */ }
            return { ok: true };
        });
    }

    function usePlanningState() {
        const [projects, setProjects] = useState(getProjects);
        const [tasks, setTasks] = useState(getTasks);
        const [slots, setSlots] = useState(getSlots);
        const [links, setLinks] = useState(getLinks);
        const [chronoActivities, setChronoActivities] = useState(getChronoActivities);
        const [chronoEntries, setChronoEntries] = useState(getChronoEntries);
        const [chronoSnapshots, setChronoSnapshots] = useState(getChronoSnapshots);
        const [chronoTimer, setChronoTimer] = useState(getChronoTimer);

        const refresh = useCallback(() => {
            setProjects(getProjects());
            setTasks(getTasks());
            setSlots(getSlots());
            setLinks(getLinks());
            setChronoActivities(getChronoActivities());
            setChronoEntries(getChronoEntries());
            setChronoSnapshots(getChronoSnapshots());
            setChronoTimer(getChronoTimer());
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
            addLink: (fromId, toId, opts) => { const link = addLink(fromId, toId, opts); refresh(); return link; },
            deleteLink: (id) => { deleteLink(id); refresh(); },
            getLinksFor,
            addChronoActivity: (input) => { const a = addChronoActivity(input); refresh(); return a; },
            updateChronoActivity: (id, patch) => { const a = updateChronoActivity(id, patch); refresh(); return a; },
            deleteChronoActivity: (id) => { deleteChronoActivity(id); refresh(); },
            archiveChronoActivity: (id) => { const a = archiveChronoActivity(id); refresh(); return a; },
            restoreChronoActivity: (id) => { const a = restoreChronoActivity(id); refresh(); return a; },
            mergeChronoActivities: (fromId, toId) => { const ok = mergeChronoActivities(fromId, toId); if (ok) refresh(); return ok; },
            addChronoEntry: (input) => { const e = addChronoEntry(input); if (e) refresh(); return e; },
            updateChronoEntry: (id, patch) => { const e = updateChronoEntry(id, patch); if (e) refresh(); return e; },
            adjustChronoEntryMinutes: (id, deltaMinutes) => { const e = adjustChronoEntryMinutes(id, deltaMinutes); refresh(); return e; },
            deleteChronoEntry: (id) => { deleteChronoEntry(id); refresh(); },
            startChronoTimer: (input) => { const t = startChronoTimer(input); if (t) refresh(); return t; },
            pauseChronoTimer: () => { const t = pauseChronoTimer(); refresh(); return t; },
            resumeChronoTimer: () => { const t = resumeChronoTimer(); refresh(); return t; },
            clearChronoTimer: () => { clearChronoTimer(); refresh(); },
            refresh,
        }), [refresh]);

        return { projects, tasks, slots, links, chronoActivities, chronoEntries, chronoSnapshots, chronoTimer, ...api };
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
        clampProgress,
        timeToMinutes,
        minutesToTime,
        localDateISO,
        getTaskDurationMinutes,
        isTaskTerminal,
        isTaskOverdue,
        getDueBucket,
        getTaskProjectColor,
        pickDistinctProjectColor,
        pickDistinctChronoHue,
        normalizeHue,
        getChronoMinutesByActivity,
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
        getLinks,
        saveLinks,
        addLink,
        deleteLink,
        getLinksFor,
        getChronoActivities,
        saveChronoActivities,
        addChronoActivity,
        updateChronoActivity,
        deleteChronoActivity,
        archiveChronoActivity,
        restoreChronoActivity,
        mergeChronoActivities,
        getChronoEntries,
        saveChronoEntries,
        addChronoEntry,
        updateChronoEntry,
        adjustChronoEntryMinutes,
        deleteChronoEntry,
        getChronoSnapshots,
        saveChronoSnapshots,
        compactChronoOlderThan90Once,
        getChronoTimer,
        saveChronoTimer,
        startChronoTimer,
        pauseChronoTimer,
        resumeChronoTimer,
        clearChronoTimer,
    };

    Planning.Hooks = {
        usePlanningState,
        usePlanningViewport,
    };

    Planning.refreshPlanningFromCloud = refreshPlanningFromCloud;
})();
