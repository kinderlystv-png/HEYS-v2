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
        CHRONO_TOMBSTONES: 'heys_planning_chrono_tombstones_v1',
        CHRONO_TIMER: 'heys_planning_chrono_timer',
        CHECKLISTS: 'heys_planning_checklists_v1',
        CHECKLIST_TOMBSTONES: 'heys_planning_checklist_tombstones_v1',
    };

    const CHRONO_TOMBSTONE_TTL_MS = 180 * 86400000;

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

    function chronoDateStr(value) {
        const raw = value == null ? new Date() : value;
        if (typeof raw === 'string' && raw.length <= 10) return raw.slice(0, 10);
        const date = normalizeDate(raw);
        if (!date || Number.isNaN(date.getTime())) return localDateISO(new Date());
        date.setHours(date.getHours() - CALENDAR_START_HOUR);
        return localDateISO(date);
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

    function normalizeChronoTombstone(entry) {
        if (!entry) return null;
        const type = String(entry.type || 'activity');
        const id = String(entry.id || '').trim();
        if (!id) return null;
        return {
            type,
            id,
            deletedAt: Number(entry.deletedAt) || Date.now(),
            source: entry.source ? String(entry.source) : undefined,
        };
    }

    function pruneChronoTombstones(items) {
        const now = Date.now();
        const byKey = new Map();
        (Array.isArray(items) ? items : []).forEach((raw) => {
            const tomb = normalizeChronoTombstone(raw);
            if (!tomb) return;
            if ((now - tomb.deletedAt) > CHRONO_TOMBSTONE_TTL_MS) return;
            const key = tomb.type + ':' + tomb.id;
            const prev = byKey.get(key);
            if (!prev || tomb.deletedAt >= prev.deletedAt) byKey.set(key, tomb);
        });
        return Array.from(byKey.values()).sort((left, right) => right.deletedAt - left.deletedAt).slice(0, 500);
    }

    function getChronoTombstones() {
        return pruneChronoTombstones(lsGet(KEYS.CHRONO_TOMBSTONES, []));
    }

    function saveChronoTombstones(tombstones) {
        const current = lsGet(KEYS.CHRONO_TOMBSTONES, []);
        const incoming = Array.isArray(tombstones) ? tombstones : [];
        lsSet(KEYS.CHRONO_TOMBSTONES, pruneChronoTombstones(current.concat(incoming)));
    }

    function addChronoTombstone(type, id, source) {
        const tomb = normalizeChronoTombstone({ type, id, source, deletedAt: Date.now() });
        if (!tomb) return;
        saveChronoTombstones(getChronoTombstones().concat(tomb));
    }

    function getChronoTombstoneSet(type) {
        return new Set(
            getChronoTombstones()
                .filter((item) => item.type === type)
                .map((item) => item.id),
        );
    }

    function chronoSnapshotTombstoneId(snapshotOrActivityId, maybeDate) {
        const activityId = typeof snapshotOrActivityId === 'object'
            ? snapshotOrActivityId && snapshotOrActivityId.activityId
            : snapshotOrActivityId;
        const date = typeof snapshotOrActivityId === 'object'
            ? snapshotOrActivityId && snapshotOrActivityId.date
            : maybeDate;
        if (!activityId || !date) return '';
        return String(date) + ':' + String(activityId);
    }

    // id → последний deletedAt (ms) для активити-tombstone'ов.
    function getChronoActivityTombstoneTimes() {
        const map = new Map();
        getChronoTombstones().forEach((item) => {
            if (!item || item.type !== 'activity') return;
            const id = String(item.id || '');
            const prev = map.get(id);
            if (prev == null || item.deletedAt > prev) map.set(id, item.deletedAt);
        });
        return map;
    }

    // Время «жизни» занятия в ms: updatedAt > createdAt, иначе 0.
    function chronoStampMs(rec) {
        const raw = rec && (rec.updatedAt || rec.createdAt);
        const t = raw ? Date.parse(raw) : NaN;
        return Number.isFinite(t) ? t : 0;
    }

    // Воскрешённые занятия: присутствуют в каноничном массиве И их stamp новее их
    // же tombstone'а (повторное добавление/правка перекрыли старое удаление).
    // Читаем сырой LS (не getChronoActivities) — иначе рекурсия через фильтр.
    function resurrectedChronoActivityIds() {
        const tombTimes = getChronoActivityTombstoneTimes();
        if (tombTimes.size === 0) return new Set();
        const acts = lsGet(KEYS.CHRONO_ACTIVITIES, []);
        const res = new Set();
        (Array.isArray(acts) ? acts : []).forEach((a) => {
            if (!a) return;
            const id = String(a.id || '');
            const tombAt = tombTimes.get(id);
            if (tombAt != null && chronoStampMs(a) > tombAt) res.add(id);
        });
        return res;
    }

    function filterChronoActivities(activities) {
        const tombTimes = getChronoActivityTombstoneTimes();
        return (Array.isArray(activities) ? activities : []).filter((activity) => {
            if (!activity) return false;
            const tombAt = tombTimes.get(String(activity.id || ''));
            // Нет tombstone → живо. Есть → переживает, только если занятие создано/
            // обновлено ПОЗЖЕ удаления. Так stale-массив со старым удалённым занятием
            // (старый stamp < deletedAt) остаётся удалённым (invariant #7), а реальное
            // повторное добавление (новый stamp) — выживает.
            return tombAt == null || chronoStampMs(activity) > tombAt;
        });
    }

    function filterChronoEntries(entries) {
        const deletedActivities = getChronoTombstoneSet('activity');
        const resurrected = resurrectedChronoActivityIds();
        const deletedEntries = getChronoTombstoneSet('entry');
        return (Array.isArray(entries) ? entries : []).filter((entry) => {
            if (!entry) return false;
            if (deletedEntries.has(String(entry.id || ''))) return false;
            const aid = String(entry.activityId || '');
            return !(deletedActivities.has(aid) && !resurrected.has(aid));
        });
    }

    function filterChronoSnapshots(snapshots) {
        const deletedActivities = getChronoTombstoneSet('activity');
        const resurrected = resurrectedChronoActivityIds();
        const deletedSnapshots = new Map();
        getChronoTombstones().forEach((item) => {
            if (!item || item.type !== 'snapshot') return;
            const prev = deletedSnapshots.get(item.id);
            if (prev == null || item.deletedAt > prev) deletedSnapshots.set(item.id, item.deletedAt);
        });
        return (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => {
            if (!snapshot) return false;
            const aid = String(snapshot.activityId || '');
            if (deletedActivities.has(aid) && !resurrected.has(aid)) return false;
            const tombAt = deletedSnapshots.get(chronoSnapshotTombstoneId(snapshot));
            return tombAt == null || chronoStampMs(snapshot) > tombAt;
        });
    }

    // ── Cloud pull merge by record (id + recency + tombstones) ────────────────
    // Hot-sync / full-sync / refresh previously REPLACED a planning array wholesale
    // with the cloud copy. Parallel edits on another device → loss: a stale cloud
    // array resurrected deletes or dropped local-only additions. (Chrono twin of the
    // cycleDay cross-client leak — same architectural root: trust the whole container,
    // never reconcile per record.) These helpers merge per id instead:
    //   • union by id (my new + their new both survive)
    //   • on id-collision keep the later updatedAt/createdAt (edits don't get lost)
    //   • ties keep LOCAL (our possibly-unsynced edit wins)
    //   • deletes flow through the existing tombstone union (filterChrono* strips them)
    // Output is deterministically ordered so re-merging identical input yields identical
    // bytes — callers compare against current LS and skip the write (no echo-upload loop,
    // see project_dayv2_echo_loop_fix history).
    function chronoRecencyMs(item) {
        const t = item && (item.updatedAt || item.createdAt || item.at);
        if (t == null) return 0;
        const n = typeof t === 'number' ? t : Date.parse(t);
        return Number.isFinite(n) ? n : 0;
    }

    function mergeArrayById(localArr, remoteArr) {
        const byId = new Map();
        const absorb = (arr) => {
            (Array.isArray(arr) ? arr : []).forEach((item) => {
                if (!item || item.id == null) return;
                const id = String(item.id);
                const prev = byId.get(id);
                // remote absorbed first, then local → equal-recency ties keep LOCAL.
                if (!prev || chronoRecencyMs(item) >= chronoRecencyMs(prev)) byId.set(id, item);
            });
        };
        absorb(remoteArr);
        absorb(localArr);
        return Array.from(byId.values());
    }

    // Stable, deterministic order for idempotency (so merge(merge(x)) === merge(x) byte-wise).
    function sortChronoEntriesStable(entries) {
        return (Array.isArray(entries) ? entries.slice() : []).sort((a, b) => {
            const ra = chronoRecencyMs(a), rb = chronoRecencyMs(b);
            if (ra !== rb) return ra - rb;
            return String(a && a.id).localeCompare(String(b && b.id));
        });
    }

    // Pure: returns the array to persist for a cloud pull of `key`, or NULL when the
    // key is NOT safe to merge (caller then keeps the legacy wholesale replace).
    // Does NOT write — callers (hot-sync interceptor, full-sync, refreshPlanningFromCloud)
    // decide how to store.
    //
    // ⚠️ Only chrono ACTIVITIES and ENTRIES are merge-safe, because merge-by-union
    // resurrects deletes unless a tombstone marks them. Those two have id + tombstone
    // coverage (filterChrono* strips deleted ids here). The rest stay on replace:
    //   • snapshots — no stable id (keyed by date+activityId, additive aggregate)
    //   • projects/tasks/slots/links — no tombstone system yet, so union would
    //     resurrect a delete done on another device. Adding per-record merge for
    //     tasks/projects needs a tombstone layer first (separate change).
    function mergeCloudPlanningArray(key, localArr, remoteArr) {
        if (key === KEYS.CHRONO_ACTIVITIES) {
            return sortByOrder(filterChronoActivities(mergeArrayById(localArr, remoteArr)));
        }
        if (key === KEYS.CHRONO_ENTRIES) {
            return sortChronoEntriesStable(filterChronoEntries(mergeArrayById(localArr, remoteArr)));
        }
        if (key === KEYS.CHECKLISTS) {
            return sortByOrder(filterChecklists(mergeArrayById(localArr, remoteArr)));
        }
        return null; // not merge-safe — caller keeps wholesale replace
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

    // ── Checklists ─────────────────────────────────────────────────

    function normalizeChecklistTombstone(entry) {
        const id = String(entry?.id || '').trim();
        if (!id) return null;
        return {
            id,
            deletedAt: Number(entry.deletedAt) || Date.now(),
            source: entry.source ? String(entry.source) : undefined,
        };
    }

    function pruneChecklistTombstones(items) {
        const now = Date.now();
        const byId = new Map();
        (Array.isArray(items) ? items : []).forEach((raw) => {
            const tomb = normalizeChecklistTombstone(raw);
            if (!tomb) return;
            if ((now - tomb.deletedAt) > CHRONO_TOMBSTONE_TTL_MS) return;
            const prev = byId.get(tomb.id);
            if (!prev || tomb.deletedAt >= prev.deletedAt) byId.set(tomb.id, tomb);
        });
        return Array.from(byId.values()).sort((left, right) => right.deletedAt - left.deletedAt).slice(0, 500);
    }

    function getChecklistTombstones() {
        return pruneChecklistTombstones(lsGet(KEYS.CHECKLIST_TOMBSTONES, []));
    }

    function saveChecklistTombstones(tombstones) {
        const current = lsGet(KEYS.CHECKLIST_TOMBSTONES, []);
        const incoming = Array.isArray(tombstones) ? tombstones : [];
        lsSet(KEYS.CHECKLIST_TOMBSTONES, pruneChecklistTombstones(current.concat(incoming)));
    }

    function addChecklistTombstone(id, source) {
        const tomb = normalizeChecklistTombstone({ id, source, deletedAt: Date.now() });
        if (!tomb) return;
        saveChecklistTombstones(getChecklistTombstones().concat(tomb));
    }

    function getChecklistTombstoneTimes() {
        const map = new Map();
        getChecklistTombstones().forEach((item) => {
            const prev = map.get(item.id);
            if (prev == null || item.deletedAt > prev) map.set(item.id, item.deletedAt);
        });
        return map;
    }

    function coerceChecklistArray(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
            if (Array.isArray(value.v)) return value.v;
            if (value.id != null && (value.title != null || Array.isArray(value.items))) return [value];
            const vals = Object.values(value);
            if (vals.length && vals.every((x) => x && typeof x === 'object')) return vals;
        }
        return [];
    }

    function normalizeChecklistItem(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        const text = String(raw.text || '').trim();
        if (!text) return null;
        return {
            id: raw.id ? String(raw.id) : uid(),
            text,
            group: raw.group ? String(raw.group) : undefined,
            quantity: raw.quantity ? String(raw.quantity) : undefined,
            note: raw.note ? String(raw.note) : undefined,
            done: raw.done === true,
            order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
            createdAt: raw.createdAt || nowISO(),
            updatedAt: raw.updatedAt || raw.createdAt || nowISO(),
        };
    }

    function normalizeChecklistItems(items) {
        return (Array.isArray(items) ? items : [])
            .map((item, index) => normalizeChecklistItem(item, index))
            .filter(Boolean)
            .sort((left, right) => {
                const orderDelta = Number(left.order || 0) - Number(right.order || 0);
                if (orderDelta !== 0) return orderDelta;
                return String(left.createdAt || '').localeCompare(String(right.createdAt || ''));
            });
    }

    function filterChecklists(checklists) {
        const tombTimes = getChecklistTombstoneTimes();
        return (Array.isArray(checklists) ? checklists : []).filter((checklist) => {
            if (!checklist) return false;
            const id = String(checklist.id || '');
            if (!id) return false;
            const tombAt = tombTimes.get(id);
            return tombAt == null || chronoStampMs(checklist) > tombAt;
        });
    }

    function getChecklists() {
        return sortByOrder(filterChecklists(coerceChecklistArray(lsGet(KEYS.CHECKLISTS, []))));
    }

    function saveChecklists(checklists) {
        const normalized = (Array.isArray(checklists) ? checklists : []).map((checklist, index) => {
            if (!checklist || typeof checklist !== 'object') return null;
            const title = String(checklist.title || '').trim();
            if (!title) return null;
            return {
                ...checklist,
                id: checklist.id ? String(checklist.id) : uid(),
                title,
                items: normalizeChecklistItems(checklist.items),
                status: checklist.status === 'archived' ? 'archived' : 'active',
                order: Number.isFinite(Number(checklist.order)) ? Number(checklist.order) : index,
                createdAt: checklist.createdAt || nowISO(),
                updatedAt: checklist.updatedAt || checklist.createdAt || nowISO(),
            };
        }).filter(Boolean);
        lsSet(KEYS.CHECKLISTS, sortByOrder(filterChecklists(normalized)));
    }

    function addChecklist(input) {
        const checklists = getChecklists();
        const title = String(input?.title || '').trim() || 'Новый чек-лист';
        const now = nowISO();
        const checklist = {
            ...(input && typeof input === 'object' ? input : {}),
            id: uid(),
            title,
            items: normalizeChecklistItems(input?.items),
            status: 'active',
            order: checklists.length,
            createdAt: now,
            updatedAt: now,
        };
        saveChecklists(checklists.concat(checklist));
        return checklist;
    }

    function updateChecklist(id, patch) {
        const checklists = getChecklists();
        const index = checklists.findIndex((checklist) => checklist.id === id);
        if (index === -1) return null;
        const current = checklists[index];
        const next = {
            ...current,
            ...patch,
            title: Object.prototype.hasOwnProperty.call(patch || {}, 'title')
                ? (String(patch.title || '').trim() || current.title)
                : current.title,
            items: Object.prototype.hasOwnProperty.call(patch || {}, 'items')
                ? normalizeChecklistItems(patch.items)
                : current.items,
            updatedAt: nowISO(),
        };
        checklists[index] = next;
        saveChecklists(checklists);
        return next;
    }

    function deleteChecklist(id) {
        addChecklistTombstone(id, 'delete-checklist');
        saveChecklists(getChecklists().filter((checklist) => checklist.id !== id));
    }

    // ── Chrono activities / entries / snapshots ─────────────────────
    // Отдельная сущность хранения: dayv2 рискован из-за hashDay по meals/items
    // и `...remote` spread в mergeDayData — chrono-поля терялись бы при cross-client merge,
    // плюс ломался бы режим Неделя. Здесь — три плоских ключа, синкаются через
    // localStorage interceptor + refreshPlanningFromCloud, как projects/tasks/slots.

    // Самовосстановление: cloud-sync иногда кладёт значение как array-like объект
    // ({0:…,1:…}) или wrapper ({v:[…]}) вместо массива — тогда фильтры роняли список
    // в [] и занятия пропадали. Приводим к массиву; следующий save перезапишет облако
    // чистым массивом. См. incident 2026-06-06 (chrono activities → object).
    function coerceChronoArray(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
            if (Array.isArray(value.v)) return value.v;
            if (value.id != null && (value.name != null || value.activityId != null)) return [value];
            const vals = Object.values(value);
            if (vals.length && vals.every((x) => x && typeof x === 'object')) return vals;
        }
        return [];
    }

    function getChronoActivities() {
        return sortByOrder(filterChronoActivities(coerceChronoArray(lsGet(KEYS.CHRONO_ACTIVITIES, []))));
    }

    function saveChronoActivities(activities) {
        lsSet(KEYS.CHRONO_ACTIVITIES, sortByOrder(filterChronoActivities(activities || [])));
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
            category: input?.category ? String(input.category) : undefined,
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
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'category')) {
            updated.category = patch.category ? String(patch.category) : undefined;
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
        addChronoTombstone('activity', id, 'delete-activity');
        const activities = getChronoActivities().filter((a) => a.id !== id);
        saveChronoActivities(activities);
        const entries = getChronoEntries().filter((e) => e.activityId !== id);
        saveChronoEntries(entries);
        const snapshots = getChronoSnapshots().filter((s) => s.activityId !== id);
        saveChronoSnapshots(snapshots);
    }

    function getChronoEntries() {
        return filterChronoEntries(coerceChronoArray(lsGet(KEYS.CHRONO_ENTRIES, [])));
    }

    function saveChronoEntries(entries) {
        lsSet(KEYS.CHRONO_ENTRIES, filterChronoEntries(entries));
    }

    function addChronoEntry(input) {
        const activityId = input?.activityId;
        const minutes = Math.round(Number(input?.minutes) || 0);
        if (!activityId || minutes <= 0) return null;
        const activity = getChronoActivities().find((a) => a.id === activityId);
        if (!activity) return null;
        const createdAt = input?.createdAt || nowISO();
        const at = input?.at || createdAt;
        const entry = {
            id: uid(),
            activityId,
            date: input?.date ? dateStr(input.date) : chronoDateStr(at),
            minutes,
            createdAt,
            // `at` — ISO момента фактического начала активности (для паттерна
            // времени суток). Таймер передаёт реальный startMs; ручной ввод —
            // дефолт now. Опциональное, backward-compat: читатели берут
            // entry.at || entry.createdAt.
            at,
        };
        if (input?.parallelGroupId) entry.parallelGroupId = String(input.parallelGroupId);
        if (input?.displayGroupId) entry.displayGroupId = String(input.displayGroupId);
        if (input?.displayStartAt) entry.displayStartAt = String(input.displayStartAt);
        if (input?.displayEndAt) entry.displayEndAt = String(input.displayEndAt);
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

    function reorderChronoRows(assignments) {
        if (!Array.isArray(assignments) || assignments.length === 0) return [];
        const byEntryId = new Map();
        assignments.forEach((item) => {
            const ids = Array.isArray(item && item.entryIds) ? item.entryIds : [];
            const minutes = Math.round(Number(item && item.minutes) || 0);
            const startMs = Number(item && item.startMs);
            const endMs = Number(item && item.endMs);
            if (minutes <= 0 || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return;
            ids.filter(Boolean).forEach((id) => byEntryId.set(String(id), {
                date: item.date ? dateStr(item.date) : chronoDateStr(new Date(startMs)),
                minutes,
                at: new Date(startMs).toISOString(),
                createdAt: new Date(endMs).toISOString(),
            }));
        });
        if (byEntryId.size === 0) return [];

        const updated = [];
        const now = nowISO();
        const entries = getChronoEntries().map((entry) => {
            const patch = byEntryId.get(String(entry && entry.id));
            if (!patch) return entry;
            const next = { ...entry, ...patch, updatedAt: now };
            updated.push(next);
            return next;
        });
        if (updated.length > 0) saveChronoEntries(entries);
        return updated;
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
        addChronoTombstone('entry', id, 'delete-entry');
        saveChronoEntries(getChronoEntries().filter((e) => e.id !== id));
    }

    // Убирает время занятия за конкретный набор дат (текущий день/неделю), НЕ удаляя
    // само занятие — оно остаётся в списке и возвращается в полосу выбора. Возвращает
    // удалённые записи, чтобы вызывающий мог предложить undo.
    function clearChronoScope(activityId, dates) {
        if (!activityId || !Array.isArray(dates) || !dates.length) return { entries: [] };
        const dateSet = new Set(dates);
        const inScope = (rec) => rec && rec.activityId === activityId && dateSet.has(rec.date);

        const allEntries = getChronoEntries();
        const removedEntries = allEntries.filter(inScope);
        if (removedEntries.length) {
            removedEntries.forEach((e) => addChronoTombstone('entry', e.id, 'clear-scope'));
            saveChronoEntries(allEntries.filter((e) => !inScope(e)));
        }

        const allSnaps = getChronoSnapshots();
        const removedSnaps = allSnaps.filter(inScope);
        if (removedSnaps.length) {
            removedSnaps.forEach((s) => addChronoTombstone('snapshot', chronoSnapshotTombstoneId(s), 'clear-scope'));
            saveChronoSnapshots(allSnaps.filter((s) => !inScope(s)));
        }

        return { entries: removedEntries };
    }

    function getChronoSnapshots() {
        return filterChronoSnapshots(coerceChronoArray(lsGet(KEYS.CHRONO_SNAPSHOTS, [])));
    }

    function saveChronoSnapshots(snapshots) {
        lsSet(KEYS.CHRONO_SNAPSHOTS, filterChronoSnapshots(snapshots));
    }

    function upsertSnapshotInPlace(snapshots, date, activityId, addMinutes) {
        const updatedAt = nowISO();
        const idx = snapshots.findIndex((s) => s.date === date && s.activityId === activityId);
        if (idx === -1) {
            snapshots.push({ date, activityId, totalMinutes: addMinutes, updatedAt });
        } else {
            snapshots[idx] = {
                ...snapshots[idx],
                totalMinutes: (Number(snapshots[idx].totalMinutes) || 0) + addMinutes,
                updatedAt,
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

        addChronoTombstone('activity', fromId, 'merge-activity');
        saveChronoActivities(activities.filter((a) => a.id !== fromId));
        return true;
    }

    function compactChronoOlderThan90Once() {
        const entries = getChronoEntries();
        if (!entries.length) return 0;
        const cutoff = addDays(chronoDateStr(new Date()), -90);
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

    // Per-client флаг «первый pull облака для этого клиента уже завершился».
    // Нужен ChronoScreen'у: на cold-load до прихода ответа надо показывать
    // «Обновление занятий…» вместо empty state «нажмите + Новая», иначе у
    // юзера с реальными занятиями моргает ложное «у тебя нет занятий».
    // Отдельно от bootstrapClientSync — он пишет в LS напрямую, planning
    // state узнаёт об этом только через cloud pull, поэтому именно его и
    // ждём.
    let _cloudPullDoneClientId = null;

    function didCompleteCloudPull() {
        if (_cloudPullDoneClientId == null) return false;
        const current = getPlanningCloudClientId();
        if (!current) return _cloudPullDoneClientId !== null;
        return _cloudPullDoneClientId === current;
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
            'heys_planning_chrono_tombstones_v1',
            'heys_planning_checklists_v1',
            'heys_planning_checklist_tombstones_v1',
            // heys_planning_chrono_timer не тянем: активный stopwatch локальный,
            // не синкается на push-стороне (см. CLIENT_SPECIFIC_KEYS в storage).
        ];
        return YandexAPI.getKVBatch(clientId, keys).then(function (res) {
            if (res.error || !Array.isArray(res.data)) {
                return { ok: false, reason: res.error || 'batch_failed' };
            }
            res.data.forEach(function (item) {
                if (item && item.k === 'heys_planning_chrono_tombstones_v1' && item.v != null) {
                    saveChronoTombstones(item.v);
                } else if (item && item.k === 'heys_planning_checklist_tombstones_v1' && item.v != null) {
                    saveChecklistTombstones(item.v);
                }
            });
            res.data.forEach(function (item) {
                if (!item || item.k == null || item.v == null) return;
                // 🛡️ L3d (2026-06-03): respect the same pending-write guard as
                // applyForegroundHotSyncValue. This path used to call Store.save*
                // directly, bypassing the guard — so a local edit still queued for
                // upload could be clobbered by a stale cloud array. Tombstone union
                // (first pass above) stays unconditional; it is additive and safe.
                try {
                    if (HEYS.cloud && typeof HEYS.cloud.getSyncStatus === 'function'
                        && HEYS.cloud.getSyncStatus(item.k) === 'pending') {
                        return; // local write pending — keep local authoritative
                    }
                } catch (e) { /* noop */ }
                // 🛡️ Chrono activities/entries: merge-by-record (union local+cloud) so a
                // stale cloud array can't drop local-only adds or resurrect local deletes.
                // Other keys: legacy replace (no tombstone layer → union would resurrect).
                if (item.k === 'heys_planning_projects' && typeof Store.saveProjects === 'function') {
                    Store.saveProjects(item.v);
                } else if (item.k === 'heys_planning_tasks' && typeof Store.saveTasks === 'function') {
                    Store.saveTasks(item.v);
                } else if (item.k === 'heys_planning_slots' && typeof Store.saveSlots === 'function') {
                    Store.saveSlots(item.v);
                } else if (item.k === 'heys_planning_links_v1' && typeof Store.saveLinks === 'function') {
                    Store.saveLinks(item.v);
                } else if (item.k === 'heys_planning_chrono_activities' && typeof Store.saveChronoActivities === 'function') {
                    const _localAct = getChronoActivities();
                    // 🛡️ Anti-wipe guard через tombstone-aware helper: пропускаем
                    // запись если cloud прислал пустоту, но local непустой и
                    // tombstones не покрывают local IDs (транзиентный пустой
                    // ответ). Реальное массовое удаление с другого устройства
                    // пройдёт нормально (tombstones первой фазой выше).
                    if (isCloudChronoWipeSuspicious(item.k, _localAct, item.v)) {
                        console.warn('[HEYS.planning] BLOCKED suspicious chrono activities wipe; local has', _localAct.length, 'items');
                    } else {
                        Store.saveChronoActivities(mergeCloudPlanningArray(item.k, _localAct, item.v) || item.v);
                    }
                } else if (item.k === 'heys_planning_chrono_entries' && typeof Store.saveChronoEntries === 'function') {
                    const _localEnt = getChronoEntries();
                    if (isCloudChronoWipeSuspicious(item.k, _localEnt, item.v)) {
                        console.warn('[HEYS.planning] BLOCKED suspicious chrono entries wipe; local has', _localEnt.length, 'items');
                    } else {
                        Store.saveChronoEntries(mergeCloudPlanningArray(item.k, _localEnt, item.v) || item.v);
                    }
                } else if (item.k === 'heys_planning_chrono_snapshots' && typeof Store.saveChronoSnapshots === 'function') {
                    Store.saveChronoSnapshots(item.v);
                } else if (item.k === 'heys_planning_chrono_tombstones_v1' && typeof Store.saveChronoTombstones === 'function') {
                    Store.saveChronoTombstones(item.v); // tombstones already union-merge in saveChronoTombstones
                } else if (item.k === 'heys_planning_checklists_v1' && typeof Store.saveChecklists === 'function') {
                    const _localChecklists = getChecklists();
                    if (isCloudChecklistWipeSuspicious(item.k, _localChecklists, item.v)) {
                        console.warn('[HEYS.planning] BLOCKED suspicious checklist wipe; local has', _localChecklists.length, 'items');
                    } else {
                        Store.saveChecklists(mergeCloudPlanningArray(item.k, _localChecklists, item.v) || item.v);
                    }
                } else if (item.k === 'heys_planning_checklist_tombstones_v1' && typeof Store.saveChecklistTombstones === 'function') {
                    Store.saveChecklistTombstones(item.v);
                }
            });
            _cloudPullDoneClientId = clientId || _cloudPullDoneClientId;
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('heys:planning-updated', {
                        detail: { source: 'cloud-pull', initial: true },
                    }));
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
        const [checklists, setChecklists] = useState(getChecklists);

        const refresh = useCallback(() => {
            setProjects(getProjects());
            setTasks(getTasks());
            setSlots(getSlots());
            setLinks(getLinks());
            setChronoActivities(getChronoActivities());
            setChronoEntries(getChronoEntries());
            setChronoSnapshots(getChronoSnapshots());
            setChronoTimer(getChronoTimer());
            setChecklists(getChecklists());
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
            reorderChronoRows: (assignments) => { const rows = reorderChronoRows(assignments); if (rows.length) refresh(); return rows; },
            adjustChronoEntryMinutes: (id, deltaMinutes) => { const e = adjustChronoEntryMinutes(id, deltaMinutes); refresh(); return e; },
            deleteChronoEntry: (id) => { deleteChronoEntry(id); refresh(); },
            clearChronoScope: (activityId, dates) => { const r = clearChronoScope(activityId, dates); refresh(); return r; },
            startChronoTimer: (input) => { const t = startChronoTimer(input); if (t) refresh(); return t; },
            pauseChronoTimer: () => { const t = pauseChronoTimer(); refresh(); return t; },
            resumeChronoTimer: () => { const t = resumeChronoTimer(); refresh(); return t; },
            clearChronoTimer: () => { clearChronoTimer(); refresh(); },
            addChecklist: (input) => { const checklist = addChecklist(input); refresh(); return checklist; },
            updateChecklist: (id, patch) => { const checklist = updateChecklist(id, patch); refresh(); return checklist; },
            deleteChecklist: (id) => { deleteChecklist(id); refresh(); },
            refresh,
        }), [refresh]);

        return { projects, tasks, slots, links, chronoActivities, chronoEntries, chronoSnapshots, chronoTimer, checklists, ...api };
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
        chronoDateStr,
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
        getChronoTombstones,
        saveChronoTombstones,
        mergeArrayById,
        mergeCloudPlanningArray,
        isCloudChronoWipeSuspicious,
        getChronoEntries,
        saveChronoEntries,
        addChronoEntry,
        updateChronoEntry,
        reorderChronoRows,
        adjustChronoEntryMinutes,
        deleteChronoEntry,
        clearChronoScope,
        getChronoSnapshots,
        saveChronoSnapshots,
        compactChronoOlderThan90Once,
        getChronoTimer,
        saveChronoTimer,
        startChronoTimer,
        pauseChronoTimer,
        resumeChronoTimer,
        clearChronoTimer,
        getChecklists,
        saveChecklists,
        addChecklist,
        updateChecklist,
        deleteChecklist,
        getChecklistTombstones,
        saveChecklistTombstones,
        isCloudChecklistWipeSuspicious,
    };

    Planning.Hooks = {
        usePlanningState,
        usePlanningViewport,
    };

    // Anti-wipe guard для cloud writes. Если cloud прислал пустой массив
    // chrono_activities/entries, а в local лежит непустой — это почти всегда
    // транзиентный пустой ответ облака (stale row / RPC inconsistency).
    // Реальное массовое удаление шло бы через tombstones, которые мы
    // отдельно синкаем. Возвращает true если такую запись надо ПРОПУСТИТЬ
    // (т.е. cloud wipe «подозрительный»). False — пишите как обычно.
    // Используется в bootstrap (boot-core), hot-sync и refreshPlanningFromCloud.
    function isCloudChronoWipeSuspicious(baseKey, localArr, cloudArr) {
        if (!Array.isArray(cloudArr) || cloudArr.length > 0) return false;
        if (!Array.isArray(localArr) || localArr.length === 0) return false;
        if (baseKey === KEYS.CHRONO_ACTIVITIES) {
            const tombSet = getChronoTombstoneSet('activity');
            // Все local activities покрыты tombstones → реальное удаление,
            // не блокируем. Иначе — подозрительная пустота, блокируем.
            return !localArr.every((a) => tombSet.has(String((a && a.id) || '')));
        }
        if (baseKey === KEYS.CHRONO_ENTRIES) {
            const entryTomb = getChronoTombstoneSet('entry');
            const actTomb = getChronoTombstoneSet('activity');
            return !localArr.every((e) => {
                const id = String((e && e.id) || '');
                const aid = String((e && e.activityId) || '');
                return entryTomb.has(id) || actTomb.has(aid);
            });
        }
        // По умолчанию — блокируем (snapshots и любые иные пустоты)
        return true;
    }

    function isCloudChecklistWipeSuspicious(baseKey, localArr, cloudArr) {
        if (baseKey !== KEYS.CHECKLISTS) return false;
        if (!Array.isArray(cloudArr) || cloudArr.length > 0) return false;
        if (!Array.isArray(localArr) || localArr.length === 0) return false;
        const tombTimes = getChecklistTombstoneTimes();
        return !localArr.every((checklist) => tombTimes.has(String((checklist && checklist.id) || '')));
    }

    Planning.refreshPlanningFromCloud = refreshPlanningFromCloud;
    Planning.didCompleteCloudPull = didCompleteCloudPull;
    Planning.isCloudChronoWipeSuspicious = isCloudChronoWipeSuspicious;
    Planning.isCloudChecklistWipeSuspicious = isCloudChecklistWipeSuspicious;

    // bootstrapClientSync Phase A пишет planning ключи прямым ls.setItem минуя
    // interceptor (см. heys_storage_supabase_v1.js:7283-7288) — usePlanningState
    // не узнаёт об апдейте, и ChronoScreen остаётся в `chronoSyncing=true`.
    // Слушаем `heysSyncCompleted` (диспатчится после Phase A line 7306 и
    // полного sync): помечаем pull done для клиента + дёргаем planning-updated
    // чтобы LS дочитался и спиннер сменился на чипы.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('heysSyncCompleted', function (ev) {
            const cid = ev && ev.detail && ev.detail.clientId;
            if (cid) _cloudPullDoneClientId = cid;
            try {
                window.dispatchEvent(new CustomEvent('heys:planning-updated', {
                    detail: { source: 'phase-a', initial: true, clientId: cid },
                }));
            } catch (e) { /* noop */ }
        });
    }
})();
