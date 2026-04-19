// heys_planning_schedule_v1.js — Calendar and Gantt screens for HEYS planning
(function () {
    'use strict';
    const React = window.React;
    const Planning = HEYS.Planning || {};
    const PlanningTasks = HEYS.PlanningTasks || {};
    const PlanningQuickTarget = HEYS.PlanningQuickTarget;
    if (!React || !Planning.Constants || !Planning.Utils || !Planning.Hooks || !PlanningQuickTarget) return;
    const h = React.createElement;
    const { useState, useMemo, useRef, useEffect } = React;
    const {
        PRIORITY_CONFIG,
        STATUS_CONFIG,
        CALENDAR_START_HOUR,
        CALENDAR_END_HOUR,
        CALENDAR_HOUR_HEIGHT,
        GANTT_ZOOM_WIDTHS,
    } = Planning.Constants;
    const {
        dateStr,
        timeToMinutes,
        getTaskDurationMinutes,
        addDays,
        diffDays,
        getTaskProjectColor,
        uid,
    } = Planning.Utils;
    const { usePlanningViewport } = Planning.Hooks;

    const {
        buildTaskLookup,
        buildResolvedTaskProjectMap,
        getResolvedTaskProjectId,
        PlanningQuickTargetField,
        encodePlanningFieldsToQuickValue,
        resolveQuickTargetToFormFields,
        resolveQuickTargetValue: resolveQuickTargetPickerValue,
    } = PlanningQuickTarget;

    const HOURS = Array.from({ length: (CALENDAR_END_HOUR - CALENDAR_START_HOUR) + 1 }, (_, index) => CALENDAR_START_HOUR + index);
    const RANGE_DRAG_THRESHOLD_PX = 10;
    const CALENDAR_SNAP_MINUTES = 15;
    const QUICK_REPEAT_HORIZON_DAYS = 55;
    const QUICK_WEEKDAY_CHIPS = [
        { dow: 1, label: 'Пн' }, { dow: 2, label: 'Вт' }, { dow: 3, label: 'Ср' }, { dow: 4, label: 'Чт' },
        { dow: 5, label: 'Пт' }, { dow: 6, label: 'Сб' }, { dow: 0, label: 'Вс' },
    ];
    const BACKGROUND_SLOT_COLORS = [
        { value: '#3b82f6', label: 'Синий' },
        { value: '#8b5cf6', label: 'Фиолетовый' },
        { value: '#06b6d4', label: 'Бирюзовый' },
        { value: '#22c55e', label: 'Зелёный' },
        { value: '#eab308', label: 'Жёлтый' },
        { value: '#f97316', label: 'Оранжевый' },
        { value: '#ef4444', label: 'Красный' },
        { value: '#94a3b8', label: 'Серый' },
    ];
    const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const MINUTES_IN_DAY = 24 * 60;
    const CALENDAR_LOOKBACK_DAYS = 1;
    const CALENDAR_FORWARD_DAYS = 92;
    const CALENDAR_TOTAL_HEIGHT = HOURS.length * CALENDAR_HOUR_HEIGHT;
    const CALENDAR_DRAG_EDGE_THRESHOLD = 48;
    const CALENDAR_TOUCH_DRAG_HOLD_MS = 180;
    const CALENDAR_TOUCH_DRAG_MOVE_CANCEL_THRESHOLD = 12;
    const CALENDAR_POINTER_DRAG_MOVE_THRESHOLD = 6;
    const CALENDAR_CELL_LONG_PRESS_MS = 280;
    const CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD = 30;
    const CALENDAR_TOUCH_TAP_SLOP_PX = 14;
    const CALENDAR_DAY_WINDOW_OPTIONS = [3, 5, 8];
    const CALENDAR_DAY_WINDOW_STORAGE_KEY = 'heys_planning_calendar_day_window';
    const CALENDAR_MIN_DAY_COLUMN_WIDTH = 72;
    const CALENDAR_WINDOW_OVERSCAN_DAYS = 15;
    const CALENDAR_DRAG_ZOOM_VISIBLE_DAYS = 8;
    const CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE = 56;
    const CALENDAR_TOUCH_DRAG_AUTO_SCROLL_STEP = 18;
    const CALENDAR_SLOT_DONE_BACKGROUND = 'linear-gradient(180deg, rgba(34, 197, 94, 0.94) 0%, rgba(21, 128, 61, 0.9) 100%)';

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function getPlanningTodayIso() {
        const dayUtils = HEYS.dayUtils || {};
        if (typeof dayUtils.todayISO === 'function') return dayUtils.todayISO();

        const models = HEYS.models || {};
        if (typeof models.todayISO === 'function') return models.todayISO();

        const now = new Date();
        if (now.getHours() < CALENDAR_START_HOUR) now.setDate(now.getDate() - 1);
        return dateStr(now);
    }

    function buildCalendarDays(startIso, length) {
        return Array.from({ length }, (_, index) => addDays(startIso, index));
    }

    function readStoredCalendarDayWindow() {
        try {
            const raw = localStorage.getItem(CALENDAR_DAY_WINDOW_STORAGE_KEY);
            const n = Number(raw);
            if (CALENDAR_DAY_WINDOW_OPTIONS.indexOf(n) !== -1) return n;
        } catch (error) {
            // ignore
        }
        return 3;
    }

    function getWeekdayLabel(isoDate) {
        const parsed = new Date(String(isoDate || '') + 'T12:00:00');
        if (Number.isNaN(parsed.getTime())) return '';
        const index = (parsed.getDay() + 6) % 7;
        return WEEKDAY_LABELS[index] || '';
    }

    function isWeekendDay(isoDate) {
        const d = new Date(String(isoDate || '') + 'T12:00:00');
        const dow = d.getDay();
        return dow === 0 || dow === 6;
    }

    function formatCalendarHourLabel(hourValue) {
        const normalizedHour = ((Number(hourValue) || 0) % 24 + 24) % 24;
        return pad2(normalizedHour) + ':00';
    }

    function getCalendarDisplayMinutes(timeValue) {
        const minutes = timeToMinutes(timeValue);
        return minutes < (CALENDAR_START_HOUR * 60) ? minutes + MINUTES_IN_DAY : minutes;
    }

    function formatClockTime(totalMinutes) {
        const normalized = ((Math.round(Number(totalMinutes) || 0) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
        const hours = Math.floor(normalized / 60);
        const minutes = normalized % 60;
        return pad2(hours) + ':' + pad2(minutes);
    }

    function normalizeDurationMinutes(value) {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes <= 0) return null;
        return Math.round(minutes);
    }

    function pluralizeDays(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return 'день';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
        return 'дней';
    }

    function formatDurationLabel(value) {
        const minutes = normalizeDurationMinutes(value);
        if (!minutes) return '';

        if (minutes < 60) return minutes + ' мин';

        if (minutes % (8 * 60) === 0) {
            const days = minutes / (8 * 60);
            return days + ' ' + pluralizeDays(days);
        }

        if (minutes % 60 === 0) {
            const hours = minutes / 60;
            return hours === 1 ? '1 час' : hours + ' ч';
        }

        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;
        if (hours > 0 && restMinutes > 0) return hours + 'ч ' + restMinutes + 'м';
        return minutes + ' мин';
    }

    function pluralizeSlots(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return 'слот';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'слота';
        return 'слотов';
    }

    function getCalendarNowTop() {
        const now = new Date();
        const minutes = (now.getHours() * 60) + now.getMinutes();
        const displayMinutes = minutes < (CALENDAR_START_HOUR * 60) ? minutes + MINUTES_IN_DAY : minutes;
        return ((displayMinutes - (CALENDAR_START_HOUR * 60)) / 60) * CALENDAR_HOUR_HEIGHT;
    }

    function isCalendarNowTopVisible(top) {
        return Number.isFinite(top) && top >= 0 && top <= CALENDAR_TOTAL_HEIGHT;
    }

    function findVerticalScrollContainer(node) {
        let current = node?.parentElement || null;

        while (current && current !== document.body) {
            const styles = window.getComputedStyle(current);
            const overflowY = String(styles?.overflowY || '').toLowerCase();
            const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';

            if (canScroll && current.scrollHeight > (current.clientHeight + 1)) {
                return current;
            }

            current = current.parentElement;
        }

        return document.scrollingElement || document.documentElement || null;
    }

    function canScrollVertically(node) {
        if (!node) return false;

        if (
            node === window
            || node === document.body
            || node === document.documentElement
            || node === document.scrollingElement
        ) {
            const scrollRoot = document.scrollingElement || document.documentElement;
            return !!scrollRoot && scrollRoot.scrollHeight > (scrollRoot.clientHeight + 1);
        }

        return node.scrollHeight > (node.clientHeight + 1);
    }

    function centerCalendarNowLine(lineElement, headerElement, preferredScrollContainer) {
        if (!lineElement) return;
        const scrollContainer = canScrollVertically(preferredScrollContainer)
            ? preferredScrollContainer
            : findVerticalScrollContainer(lineElement);
        const lineRect = lineElement.getBoundingClientRect();
        const headerBottom = Math.max(headerElement?.getBoundingClientRect?.().bottom || 0, 0);
        const scrollRoot = document.scrollingElement || document.documentElement;
        const isRootScroll = !scrollContainer
            || scrollContainer === document.body
            || scrollContainer === document.documentElement
            || scrollContainer === document.scrollingElement;

        if (isRootScroll) {
            const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
            const visibleTop = headerBottom;
            const visibleHeight = Math.max(viewportHeight - visibleTop, 0);
            const lineCenterAbsolute = (scrollRoot?.scrollTop || window.scrollY || 0) + lineRect.top + (lineRect.height / 2);
            const targetScrollTop = lineCenterAbsolute - (visibleTop + (visibleHeight / 2));
            const currentScrollTop = scrollRoot?.scrollTop || 0;

            if (Math.abs(targetScrollTop - currentScrollTop) < 1) return;

            if (scrollRoot) {
                scrollRoot.scrollTop = targetScrollTop;
                return;
            }

            window.scrollTo({ top: targetScrollTop, behavior: 'auto' });
            return;
        }

        const containerRect = typeof scrollContainer.getBoundingClientRect === 'function'
            ? scrollContainer.getBoundingClientRect()
            : {
                top: 0,
                bottom: window.innerHeight || document.documentElement?.clientHeight || 0,
            };
        const visibleTop = Math.max(headerBottom, containerRect.top || 0);
        const visibleHeight = Math.max((containerRect.bottom || 0) - visibleTop, 0);
        const lineCenterWithinContent = scrollContainer.scrollTop + (lineRect.top - containerRect.top) + (lineRect.height / 2);
        const visibleCenterWithinContent = scrollContainer.scrollTop + (visibleTop - containerRect.top) + (visibleHeight / 2);
        const targetScrollTop = lineCenterWithinContent - ((visibleTop - containerRect.top) + (visibleHeight / 2));

        if (Math.abs(targetScrollTop - scrollContainer.scrollTop) < 1) return;

        scrollContainer.scrollTop = targetScrollTop;
    }

    function getCalendarCenterDelta(lineElement, headerElement, preferredScrollContainer) {
        if (!lineElement) return Number.POSITIVE_INFINITY;

        const scrollContainer = canScrollVertically(preferredScrollContainer)
            ? preferredScrollContainer
            : findVerticalScrollContainer(lineElement);
        const lineRect = lineElement.getBoundingClientRect();
        const headerBottom = Math.max(headerElement?.getBoundingClientRect?.().bottom || 0, 0);
        const isRootScroll = !scrollContainer
            || scrollContainer === document.body
            || scrollContainer === document.documentElement
            || scrollContainer === document.scrollingElement;

        if (isRootScroll) {
            const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
            const visibleTop = headerBottom;
            const visibleCenter = visibleTop + Math.max((viewportHeight - visibleTop) / 2, 0);
            const lineCenter = lineRect.top + (lineRect.height / 2);
            return lineCenter - visibleCenter;
        }

        const containerRect = typeof scrollContainer.getBoundingClientRect === 'function'
            ? scrollContainer.getBoundingClientRect()
            : {
                top: 0,
                bottom: window.innerHeight || document.documentElement?.clientHeight || 0,
            };
        const visibleTop = Math.max(headerBottom, containerRect.top || 0);
        const visibleCenter = visibleTop + Math.max(((containerRect.bottom || 0) - visibleTop) / 2, 0);
        const lineCenter = lineRect.top + (lineRect.height / 2);
        return lineCenter - visibleCenter;
    }

    function resolveCalendarCellStart(date, displayHour, subHourMinutes) {
        const normalizedHour = Number(displayHour) || CALENDAR_START_HOUR;
        const extraMinutes = Math.max(0, Math.min(59, Math.round(Number(subHourMinutes) || 0)));
        const snappedExtra = Math.round(extraMinutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
        const totalMinutes = normalizedHour * 60 + snappedExtra;
        const actualDate = totalMinutes >= 24 * 60 ? addDays(date, 1) : date;
        return {
            date: actualDate,
            time: formatClockTime(totalMinutes),
        };
    }

    function getCalendarDisplayDate(slot) {
        const slotDate = dateStr(slot?.date);
        if (!slotDate) return '';
        const startMinutes = timeToMinutes(slot?.startTime);
        return startMinutes < (CALENDAR_START_HOUR * 60)
            ? addDays(slotDate, -1)
            : slotDate;
    }

    function sendPlanningDebugLog(payload) {
        const logRecord = {
            sessionId: '236dee',
            timestamp: Date.now(),
            ...payload,
        };
        try {
            console.info('[HEYS.planning][debug]', logRecord.message || 'event', logRecord);
        } catch (error) {
            // ignore
        }
    }

    function getCalendarDisplayEndMinutes(slot) {
        const startMinutes = getCalendarDisplayMinutes(slot?.startTime);
        let endMinutes = getCalendarDisplayMinutes(slot?.endTime);
        if (endMinutes <= startMinutes) endMinutes += MINUTES_IN_DAY;
        return endMinutes;
    }

    function parsePlanningDragPayload(event) {
        const raw = event?.dataTransfer?.getData('text/heys-planning-slot') || event?.dataTransfer?.getData('text/heys-planning-task');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn('[HEYS.planning] Invalid drag payload:', error?.message || error);
            return null;
        }
    }

    function hasTouchLikeInput() {
        try {
            if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
                return true;
            }
        } catch (error) {
            // ignore
        }

        return Number(typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0) > 0;
    }

    function findTouchByIdentifier(touchList, identifier) {
        if (!touchList || identifier == null) return null;
        for (let index = 0; index < touchList.length; index += 1) {
            if (touchList[index]?.identifier === identifier) return touchList[index];
        }
        return null;
    }

    function getTouchEventPoint(event, identifier) {
        return findTouchByIdentifier(event?.touches, identifier)
            || findTouchByIdentifier(event?.changedTouches, identifier)
            || null;
    }

    function resolveAutoScrollDelta(distanceToEdge, edgeThreshold) {
        const safeThreshold = Math.max(Number(edgeThreshold) || 0, 1);
        const safeDistance = Math.max(0, Math.min(safeThreshold, Number(distanceToEdge) || 0));
        const intensity = 1 - (safeDistance / safeThreshold);
        return Math.max(0, intensity) * CALENDAR_TOUCH_DRAG_AUTO_SCROLL_STEP;
    }

    function buildSlotDraft(source) {
        return {
            id: source?.id || '',
            taskId: source?.taskId || '',
            title: source?.title || '',
            date: dateStr(source?.date),
            startTime: source?.startTime || '09:00',
            endTime: source?.endTime || '10:00',
            quickCreate: !!source?.quickCreate,
            isBackground: Boolean(source?.isBackground),
            bgColor: source?.bgColor || BACKGROUND_SLOT_COLORS[0].value,
            recurrenceGroupId: source?.recurrenceGroupId ? String(source.recurrenceGroupId) : '',
        };
    }

    function collectSlotsByRecurrenceGroup(slots, recurrenceGroupId) {
        const gid = String(recurrenceGroupId || '');
        if (!gid) return [];
        return (Array.isArray(slots) ? slots : []).filter((slot) => String(slot.recurrenceGroupId || '') === gid);
    }

    function snapCalendarGridMinutes(minutes) {
        return Math.round(minutes / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
    }

    function columnYToGridWallMinutes(y, totalHeight, hoursCount, startHour) {
        const clampedY = Math.max(0, Math.min(totalHeight, y));
        const ratio = totalHeight > 0 ? clampedY / totalHeight : 0;
        const spanMinutes = hoursCount * 60;
        const minM = startHour * 60;
        const maxM = minM + spanMinutes;
        const raw = minM + ratio * spanMinutes;
        return snapCalendarGridMinutes(Math.max(minM, Math.min(maxM, raw)));
    }

    function formatWallClockHm(totalMinutes) {
        const rounded = Math.round(Number(totalMinutes) || 0);
        const h = Math.floor(rounded / 60);
        const m = ((rounded % 60) + 60) % 60;
        return pad2(h) + ':' + pad2(m);
    }

    function rangeColumnYToSlotTimes(y0, y1, totalHeight, hoursCount, startHour) {
        const topY = Math.min(y0, y1);
        const botY = Math.max(y0, y1);
        let startM = columnYToGridWallMinutes(topY, totalHeight, hoursCount, startHour);
        let endM = columnYToGridWallMinutes(botY, totalHeight, hoursCount, startHour);
        if (endM <= startM) endM = startM + CALENDAR_SNAP_MINUTES;
        return {
            startTime: formatWallClockHm(startM),
            endTime: formatWallClockHm(endM),
        };
    }

    /** HTML input[type=time] accepts only 00:00–23:59; normalize wall times (e.g. 25:00 → 01:00). */
    function normalizeQuickModalTimeForInput(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return '09:00';
        const trimmed = String(timeStr).trim();
        const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return '09:00';
        let h = parseInt(match[1], 10);
        let m = parseInt(match[2], 10);
        if (!Number.isFinite(m)) m = 0;
        m = Math.max(0, Math.min(59, m));
        if (!Number.isFinite(h)) h = 9;
        h = ((h % 24) + 24) % 24;
        return pad2(h) + ':' + pad2(m);
    }

    function getSlotDurationMinutes(slotLike) {
        if (!slotLike?.startTime || !slotLike?.endTime) return 60;
        return Math.max(30, getCalendarDisplayEndMinutes(slotLike) - getCalendarDisplayMinutes(slotLike.startTime));
    }

    function collectDescendantIds(tasks, rootId) {
        const result = new Set();
        const queue = [rootId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            tasks.forEach((task) => {
                if (task.parentTaskId === currentId && !result.has(task.id)) {
                    result.add(task.id);
                    queue.push(task.id);
                }
            });
        }
        return result;
    }

    function buildUnifiedSlotDraft(source, tasks, resolvedTaskProjectIds) {
        const slotDraft = buildSlotDraft(source);
        const linkedTask = (Array.isArray(tasks) ? tasks : []).find((task) => task.id === slotDraft.taskId);
        return {
            ...slotDraft,
            taskTitle: linkedTask?.title || '',
            taskStatus: linkedTask?.status || 'in_progress',
            taskPriority: linkedTask?.priority || 'p2',
            taskProjectId: linkedTask ? (getResolvedTaskProjectId(linkedTask.id, resolvedTaskProjectIds) || '') : '',
            taskParentTaskId: linkedTask?.parentTaskId || '',
            taskStartDate: linkedTask?.startDate || '',
            taskDueDate: linkedTask?.dueDate || '',
            taskPlannedMinutes: linkedTask?.plannedMinutes ? String(linkedTask.plannedMinutes) : '',
            taskBaselineStartDate: linkedTask?.baselineStartDate || '',
            taskBaselineDueDate: linkedTask?.baselineDueDate || '',
            taskBaselinePlannedMinutes: linkedTask?.baselinePlannedMinutes ? String(linkedTask.baselinePlannedMinutes) : '',
            taskBlockedByTaskIds: Array.isArray(linkedTask?.blockedByTaskIds) ? linkedTask.blockedByTaskIds.slice() : [],
        };
    }

    function buildSlotMetrics(slot) {
        const startMinutes = getCalendarDisplayMinutes(slot.startTime);
        const endMinutes = Math.min(getCalendarDisplayEndMinutes(slot), (CALENDAR_END_HOUR + 1) * 60);
        const offsetMinutes = startMinutes - (CALENDAR_START_HOUR * 60);
        const durationMinutes = Math.max(30, endMinutes - startMinutes);
        return {
            top: (offsetMinutes / 60) * CALENDAR_HOUR_HEIGHT,
            height: (durationMinutes / 60) * CALENDAR_HOUR_HEIGHT,
            durationMinutes,
        };
    }

    function resolveCalendarDisplayDateTime(displayDate, displayMinutes) {
        const normalizedMinutes = Math.max(CALENDAR_START_HOUR * 60, Math.round(Number(displayMinutes) || 0));
        const actualDate = normalizedMinutes >= MINUTES_IN_DAY ? addDays(displayDate, 1) : displayDate;
        return {
            date: actualDate,
            time: formatClockTime(normalizedMinutes),
        };
    }

    function resolveCalendarSlotAppearance(slotDay, yesterdayIso, linkedTask, projects, slot) {
        if (slot?.isBackground && slot.bgColor) {
            const hex = slot.bgColor;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return {
                className: ' planning-calendar-slot--background',
                color: 'linear-gradient(180deg, rgba(' + r + ',' + g + ',' + b + ',0.22) 0%, rgba(' + r + ',' + g + ',' + b + ',0.14) 100%)',
            };
        }

        if (linkedTask?.status === 'done') {
            return {
                className: ' planning-calendar-slot--done',
                color: CALENDAR_SLOT_DONE_BACKGROUND,
            };
        }

        if (slotDay !== yesterdayIso) {
            return {
                className: '',
                color: getTaskProjectColor(linkedTask, projects),
            };
        }

        const status = linkedTask?.status || '';
        const isMuted = !linkedTask || status === 'cancelled';

        if (isMuted) {
            return {
                className: ' planning-calendar-slot--muted',
                color: 'linear-gradient(180deg, rgba(148, 163, 184, 0.34) 0%, rgba(148, 163, 184, 0.24) 100%)',
            };
        }

        return {
            className: ' planning-calendar-slot--attention',
            color: 'linear-gradient(180deg, rgba(239, 68, 68, 0.94) 0%, rgba(220, 38, 38, 0.88) 100%)',
        };
    }

    function getTaskCalendarAnchorDate(task, todayIso, rangeStartIso, rangeEndIso) {
        const preferredDate = dateStr(task?.startDate || task?.dueDate || todayIso);
        if (preferredDate < rangeStartIso) return rangeStartIso;
        if (preferredDate > rangeEndIso) return rangeEndIso;
        return preferredDate;
    }

    function buildParentTaskIdsWithChildren(tasks) {
        const parents = new Set();

        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
            const parentTaskId = task?.parentTaskId || '';
            if (parentTaskId) parents.add(parentTaskId);
        });

        return parents;
    }

    function buildTaskParentGroupLabel(task, taskLookup) {
        if (!task?.parentTaskId || !taskLookup?.has(task.parentTaskId)) return '';

        const titles = [];
        const seen = new Set([task.id]);
        let currentId = task.parentTaskId;
        let guard = 0;

        while (currentId && taskLookup.has(currentId) && guard < 120 && !seen.has(currentId)) {
            const currentTask = taskLookup.get(currentId);
            const currentTitle = String(currentTask?.title || '').trim();

            if (currentTitle) titles.unshift(currentTitle);

            seen.add(currentId);
            currentId = currentTask?.parentTaskId || '';
            guard += 1;
        }

        return titles.join(' → ');
    }

    function findPlanningProjectName(projectId, projects) {
        if (!projectId) return '';
        const project = (Array.isArray(projects) ? projects : []).find((entry) => entry?.id === projectId);
        return String(project?.name || '').trim();
    }

    function buildTaskLineage(taskId, taskLookup) {
        if (!taskId || !taskLookup?.has(taskId)) return [];

        const lineage = [];
        const seen = new Set();
        let currentId = taskId;
        let guard = 0;

        while (currentId && taskLookup.has(currentId) && guard < 120 && !seen.has(currentId)) {
            const currentTask = taskLookup.get(currentId);
            lineage.unshift(currentTask);
            seen.add(currentId);
            currentId = currentTask?.parentTaskId || '';
            guard += 1;
        }

        return lineage;
    }

    function buildTaskHierarchyInfo(task, taskLookup, projects, resolvedTaskProjectIds) {
        if (!task?.id) {
            return {
                projectName: '',
                parentTitles: [],
                leafTitle: String(task?.title || '').trim(),
                fullPath: [],
                ladderSteps: [],
                selectLabel: String(task?.title || '').trim(),
            };
        }

        const lineage = buildTaskLineage(task.id, taskLookup);
        const titles = lineage
            .map((entry) => String(entry?.title || '').trim())
            .filter(Boolean);
        const leafTitle = titles[titles.length - 1] || String(task.title || '').trim();
        const parentTitles = titles.slice(0, -1);
        const projectName = findPlanningProjectName(
            getResolvedTaskProjectId(task.id, resolvedTaskProjectIds),
            projects,
        );
        const fullPath = [projectName, ...titles].filter(Boolean);
        const ladderSteps = [
            projectName ? 'Проект: ' + projectName : '',
            ...parentTitles.map((title, index) => ('↳ '.repeat(index + 1) + title)),
            leafTitle ? ('↳ '.repeat(parentTitles.length + 1) + leafTitle) : '',
        ].filter(Boolean);

        return {
            projectName,
            parentTitles,
            leafTitle,
            fullPath,
            ladderSteps,
            selectLabel: fullPath.join(' → ') || leafTitle || 'Задача',
        };
    }

    function buildTaskHeaderDayPatch(task, targetDate, todayIso) {
        const anchorDate = dateStr(task?.startDate || task?.dueDate || todayIso);
        if (!targetDate || targetDate === anchorDate) return null;

        if (task?.startDate && task?.dueDate) {
            const deltaDays = diffDays(anchorDate, targetDate);
            return {
                startDate: addDays(task.startDate, deltaDays),
                dueDate: addDays(task.dueDate, deltaDays),
            };
        }

        if (task?.startDate) {
            return { startDate: targetDate };
        }

        return { dueDate: targetDate };
    }

    function isPlanningCalendarDragPayload(payload) {
        return payload?.type === 'task' || payload?.type === 'slot';
    }

    function SlotDeleteActionSheet({ slot, columnDay, hasLinkedTask, onClose, onSlotOnly, onSlotAndTask }) {
        return h('div', {
            className: 'planning-slot-delete-overlay',
            onClick: onClose,
            role: 'presentation',
        },
            h('div', {
                className: 'planning-slot-delete-sheet',
                onClick: (event) => event.stopPropagation(),
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'planning-slot-delete-title',
            },
                h('div', { id: 'planning-slot-delete-title', className: 'planning-slot-delete-sheet__title' }, 'Удаление'),
                h('p', { className: 'planning-slot-delete-sheet__hint' },
                    hasLinkedTask
                        ? 'Убрать только время из календаря или удалить и задачу целиком.'
                        : 'Удалить это событие с календаря?',
                ),
                hasLinkedTask && h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-slot-delete-sheet__btn--soft',
                    onClick: () => {
                        onSlotOnly();
                        onClose();
                    },
                }, 'Только слот — задача в шапке дня'),
                hasLinkedTask && h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-slot-delete-sheet__btn--danger',
                    onClick: () => {
                        onSlotAndTask();
                        onClose();
                    },
                }, 'Слот и задачу'),
                !hasLinkedTask && h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-slot-delete-sheet__btn--danger',
                    onClick: () => {
                        onSlotAndTask();
                        onClose();
                    },
                }, 'Удалить событие'),
                h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-slot-delete-sheet__btn--ghost',
                    onClick: onClose,
                }, 'Отмена'),
            ),
        );
    }

    const MONTH_NAMES_RU = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ];

    function RepeatDateCalendar({ selectedDates, onToggleDate, onClear, anchorDate, onClose }) {
        const anchor = new Date(String(anchorDate || '') + 'T12:00:00');
        const [cur, setCur] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));
        const year = cur.getFullYear();
        const month = cur.getMonth();
        const firstDay = new Date(year, month, 1);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < startOffset; i += 1) cells.push(null);
        for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(year, month, d, 12, 0, 0, 0));

        const todayIso = dateStr();

        const fmtIso = (dt) => {
            const yy = dt.getFullYear();
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');
            return yy + '-' + mm + '-' + dd;
        };

        return h('div', { className: 'planning-repeat-calendar' },
            h('div', { className: 'planning-repeat-calendar__header' },
                h('button', {
                    type: 'button',
                    className: 'planning-repeat-calendar__nav',
                    onClick: () => setCur(new Date(year, month - 1, 1)),
                }, '\u2039'),
                h('span', { className: 'planning-repeat-calendar__title' },
                    MONTH_NAMES_RU[month] + ' ' + year,
                ),
                h('button', {
                    type: 'button',
                    className: 'planning-repeat-calendar__nav',
                    onClick: () => setCur(new Date(year, month + 1, 1)),
                }, '\u203A'),
            ),
            h('div', { className: 'planning-repeat-calendar__weekdays' },
                ['\u041F\u043D', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041F\u0442', '\u0421\u0431', '\u0412\u0441'].map((label) =>
                    h('div', { key: label, className: 'planning-repeat-calendar__wd' }, label),
                ),
            ),
            h('div', { className: 'planning-repeat-calendar__grid' },
                cells.map((cellDate, index) => {
                    if (cellDate == null) {
                        return h('div', { key: 'empty-' + index, className: 'planning-repeat-calendar__day planning-repeat-calendar__day--empty' });
                    }
                    const iso = fmtIso(cellDate);
                    const isSelected = selectedDates.has(iso);
                    const isToday = iso === todayIso;
                    const isPast = iso < todayIso;
                    return h('button', {
                        key: iso,
                        type: 'button',
                        className: 'planning-repeat-calendar__day'
                            + (isSelected ? ' planning-repeat-calendar__day--selected' : '')
                            + (isToday ? ' planning-repeat-calendar__day--today' : '')
                            + (isPast ? ' planning-repeat-calendar__day--past' : ''),
                        onClick: () => onToggleDate(iso),
                    }, cellDate.getDate());
                }),
            ),
            h('div', { className: 'planning-repeat-calendar__footer' },
                selectedDates.size > 0 && h('button', {
                    type: 'button',
                    className: 'planning-repeat-calendar__clear',
                    onClick: onClear,
                }, '\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C'),
                h('span', { className: 'planning-repeat-calendar__count' },
                    selectedDates.size > 0
                        ? '\u0412\u044B\u0431\u0440\u0430\u043D\u043E: ' + selectedDates.size
                        : '',
                ),
                h('button', {
                    type: 'button',
                    className: 'planning-repeat-calendar__confirm',
                    onClick: onClose,
                }, '\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C'),
            ),
        );
    }

    function QuickSlotModal({ draft, state, onClose }) {
        const { isDesktop } = usePlanningViewport();
        const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
        const projects = Array.isArray(state?.projects) ? state.projects : [];
        const activeProjectsQuick = useMemo(
            () => projects.filter((project) => project.status !== 'archived'),
            [projects],
        );
        const resolvedTaskProjectIdsQuick = useMemo(
            () => buildResolvedTaskProjectMap(tasks, activeProjectsQuick),
            [activeProjectsQuick, tasks],
        );
        const anchorDate = dateStr(draft?.date);
        const anchorDow = useMemo(() => new Date(String(anchorDate || '') + 'T12:00:00').getDay(), [anchorDate]);
        const draftSyncKey = [
            draft?.date,
            draft?.startTime,
            draft?.endTime,
            draft?.quickCreate,
        ].join('|');

        const [title, setTitle] = useState(() => String(draft?.title || '').trim());
        const [date, setDate] = useState(anchorDate);
        const [startTime, setStartTime] = useState(() => normalizeQuickModalTimeForInput(draft?.startTime || '09:00'));
        const [endTime, setEndTime] = useState(() => normalizeQuickModalTimeForInput(draft?.endTime || '10:00'));
        const [repeatWeekly, setRepeatWeekly] = useState(false);
        const [weekdaySet, setWeekdaySet] = useState(() => new Set([anchorDow]));
        const [customDates, setCustomDates] = useState(() => new Set());
        const [showDateCalendar, setShowDateCalendar] = useState(false);
        const [isBackground, setIsBackground] = useState(false);
        const [bgColor, setBgColor] = useState(BACKGROUND_SLOT_COLORS[0].value);
        const [quickTargetValue, setQuickTargetValue] = useState('');
        const [newProjectName, setNewProjectName] = useState('');

        useEffect(() => {
            document.body.classList.add('planning-quick-event-modal-open');
            return () => {
                document.body.classList.remove('planning-quick-event-modal-open');
            };
        }, []);

        useEffect(() => {
            const nextAnchor = dateStr(draft?.date);
            const dow = new Date(String(nextAnchor || '') + 'T12:00:00').getDay();
            setTitle(String(draft?.title || '').trim());
            setDate(nextAnchor);
            setStartTime(normalizeQuickModalTimeForInput(draft?.startTime || '09:00'));
            setEndTime(normalizeQuickModalTimeForInput(draft?.endTime || '10:00'));
            setRepeatWeekly(false);
            setWeekdaySet(new Set([dow]));
            setCustomDates(new Set());
            setShowDateCalendar(false);
            setIsBackground(false);
            setBgColor(BACKGROUND_SLOT_COLORS[0].value);
            setQuickTargetValue('');
            setNewProjectName('');
        }, [draftSyncKey]);

        const toggleDow = (dow) => {
            setWeekdaySet((prev) => {
                const next = new Set(prev);
                if (next.has(dow)) {
                    if (next.size <= 1) return next;
                    next.delete(dow);
                } else {
                    next.add(dow);
                }
                return next;
            });
        };

        const handleRepeatToggle = (enabled) => {
            setRepeatWeekly(enabled);
            if (enabled) {
                setWeekdaySet(new Set([new Date(String(date || '') + 'T12:00:00').getDay()]));
                setCustomDates(new Set());
                setShowDateCalendar(false);
            }
        };

        const toggleCustomDate = (isoDate) => {
            setCustomDates((prev) => {
                const next = new Set(prev);
                if (next.has(isoDate)) next.delete(isoDate);
                else next.add(isoDate);
                return next;
            });
        };

        const hasCustomDates = customDates.size > 0;

        const save = () => {
            const cleanTitle = String(title || '').trim();
            if (!date || !startTime || !endTime) return;
            let sm = timeToMinutes(startTime);
            let em = timeToMinutes(endTime);
            if (em <= sm) {
                const tmp = sm;
                sm = em;
                em = tmp + CALENDAR_SNAP_MINUTES;
            }
            const st = formatWallClockHm(sm);
            const et = formatWallClockHm(em);
            const durationMin = Math.max(30, em - sm);
            const taskTitle = cleanTitle || 'Событие';
            const targetResolved = resolveQuickTargetPickerValue(quickTargetValue, tasks, resolvedTaskProjectIdsQuick);
            const nextParentTaskId = targetResolved.parentTaskId;
            const nextProjectId = targetResolved.projectId;

            if (!repeatWeekly) {
                const task = state.addTask(taskTitle, {
                    projectId: nextProjectId,
                    parentTaskId: nextParentTaskId,
                    startDate: date,
                    dueDate: date,
                    plannedMinutes: durationMin,
                    status: 'todo',
                });
                state.addSlot({
                    taskId: task.id,
                    title: '',
                    date,
                    startTime: st,
                    endTime: et,
                    source: 'user',
                    isBackground,
                    bgColor: isBackground ? bgColor : undefined,
                });
            } else if (hasCustomDates) {
                const groupId = uid();
                const sorted = [...customDates].sort();
                const slotOpts = sorted.map((d) => ({
                    date: d,
                    startTime: st,
                    endTime: et,
                    source: 'user',
                    recurrenceGroupId: groupId,
                    isBackground,
                    bgColor: isBackground ? bgColor : undefined,
                }));
                if (!slotOpts.length) { onClose(); return; }
                const task = state.addTask(taskTitle, {
                    projectId: nextProjectId,
                    parentTaskId: nextParentTaskId,
                    startDate: sorted[0],
                    dueDate: sorted[sorted.length - 1],
                    plannedMinutes: durationMin,
                    status: 'todo',
                });
                state.addSlotBatch(slotOpts.map((o) => ({
                    ...o,
                    taskId: task.id,
                    title: '',
                })));
            } else {
                const groupId = uid();
                const slotOpts = [];
                let lastSlotDate = date;
                for (let i = 0; i <= QUICK_REPEAT_HORIZON_DAYS; i += 1) {
                    const d = addDays(date, i);
                    if (d < date) continue;
                    const dow = new Date(String(d) + 'T12:00:00').getDay();
                    if (!weekdaySet.has(dow)) continue;
                    slotOpts.push({
                        date: d,
                        startTime: st,
                        endTime: et,
                        source: 'user',
                        recurrenceGroupId: groupId,
                        isBackground,
                        bgColor: isBackground ? bgColor : undefined,
                    });
                    if (d > lastSlotDate) lastSlotDate = d;
                }
                if (!slotOpts.length) {
                    onClose();
                    return;
                }
                const task = state.addTask(taskTitle, {
                    projectId: nextProjectId,
                    parentTaskId: nextParentTaskId,
                    startDate: date,
                    dueDate: lastSlotDate,
                    plannedMinutes: durationMin,
                    status: 'todo',
                });
                state.addSlotBatch(slotOpts.map((o) => ({
                    ...o,
                    taskId: task.id,
                    title: '',
                })));
            }
            onClose();
        };

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--quick-event'
                + (!isDesktop ? ' planning-modal-overlay--quick-event-sheet' : ''),
            onClick: onClose,
        },
            h('div', {
                className: 'planning-modal planning-modal--quick-event'
                    + (!isDesktop ? ' planning-modal--quick-event-sheet' : ''),
                onClick: (event) => event.stopPropagation(),
            },
                h('div', { className: 'planning-modal__header planning-modal__header--quick-event' },
                    h('div', { className: 'planning-modal__header-copy' },
                        h('span', { className: 'planning-modal__header-title planning-modal__header-title--quick-event' }, 'Новое событие'),
                    ),
                    h('button', {
                        type: 'button',
                        className: 'planning-modal__close planning-modal__close--quick-event',
                        onClick: onClose,
                        'aria-label': 'Закрыть',
                    }, '×'),
                ),
                h('div', { className: 'planning-modal__body planning-modal__body--quick-event' },
                    h('div', { className: 'planning-quick-title-field' },
                        h('input', {
                            id: 'planning-quick-event-title',
                            className: 'planning-quick-title-field__input',
                            placeholder: 'Название события',
                            value: title,
                            onChange: (event) => setTitle(event.target.value),
                            autoFocus: true,
                            autoComplete: 'off',
                        }),
                    ),
                    h('div', { className: 'planning-quick-date-action-row' },
                        h('div', { className: 'planning-quick-date-action-row__date' },
                            h('label', { className: 'planning-quick-date-action-row__label', htmlFor: 'planning-quick-event-date' }, 'Дата'),
                            h('input', {
                                id: 'planning-quick-event-date',
                                className: 'planning-quick-date-action-row__date-input',
                                type: 'date',
                                value: date,
                                onChange: (event) => setDate(event.target.value),
                            }),
                        ),
                        h('button', {
                            type: 'button',
                            className: 'planning-quick-btn-done planning-quick-btn-done--in-body',
                            onClick: save,
                        },
                            h('span', { className: 'planning-quick-btn-done__icon', 'aria-hidden': 'true' }, '✓'),
                            h('span', { className: 'planning-quick-btn-done__text' }, 'Готово'),
                        ),
                    ),
                    h('div', { className: 'planning-quick-time-pair' },
                        h('div', { className: 'planning-quick-time-pair__field' },
                            h('label', { htmlFor: 'planning-quick-event-start' }, 'Начало'),
                            h('input', {
                                id: 'planning-quick-event-start',
                                className: 'planning-quick-time-pair__input',
                                type: 'time',
                                step: 300,
                                value: startTime,
                                onChange: (event) => setStartTime(normalizeQuickModalTimeForInput(event.target.value || '09:00')),
                            }),
                        ),
                        h('div', { className: 'planning-quick-time-pair__sep', 'aria-hidden': 'true' }, '—'),
                        h('div', { className: 'planning-quick-time-pair__field' },
                            h('label', { htmlFor: 'planning-quick-event-end' }, 'Конец'),
                            h('input', {
                                id: 'planning-quick-event-end',
                                className: 'planning-quick-time-pair__input',
                                type: 'time',
                                step: 300,
                                value: endTime,
                                onChange: (event) => setEndTime(normalizeQuickModalTimeForInput(event.target.value || '10:00')),
                            }),
                        ),
                    ),
                    h('div', { className: 'planning-quick-slot-target-wrap' },
                        h('div', { className: 'planning-quick-slot-target-wrap__label' }, 'Проект и подпроект'),
                        h(PlanningQuickTargetField, {
                            value: quickTargetValue,
                            onChange: setQuickTargetValue,
                            projects: activeProjectsQuick,
                            tasks,
                            resolvedTaskProjectIds: resolvedTaskProjectIdsQuick,
                            tabsSelector: '.tabs',
                            modalMenuMode: true,
                        }),
                    ),
                    h('div', { className: 'planning-add-project' },
                        h('input', {
                            className: 'planning-quick-input planning-quick-input--sm',
                            placeholder: 'Новый проект...',
                            value: newProjectName,
                            onChange: (event) => setNewProjectName(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key !== 'Enter') return;
                                const name = String(newProjectName || '').trim();
                                if (!name) return;
                                state.addProject(name);
                                setNewProjectName('');
                            },
                        }),
                        h('button', {
                            type: 'button',
                            className: 'planning-add-btn planning-add-btn--project',
                            onClick: () => {
                                const name = String(newProjectName || '').trim();
                                if (!name) return;
                                state.addProject(name);
                                setNewProjectName('');
                            },
                        }, '+ Проект'),
                    ),
                    h('div', { className: 'planning-quick-repeat' },
                        h('label', { className: 'planning-quick-repeat__toggle' },
                            h('input', {
                                type: 'checkbox',
                                checked: repeatWeekly,
                                onChange: (event) => handleRepeatToggle(event.target.checked),
                            }),
                            h('span', null, '\u041F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C \u043F\u043E \u0434\u043D\u044F\u043C \u043D\u0435\u0434\u0435\u043B\u0438'),
                        ),
                        repeatWeekly && !hasCustomDates && h('div', {
                            className: 'planning-quick-repeat__days',
                            role: 'group',
                            'aria-label': '\u0414\u043D\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0430',
                        },
                            QUICK_WEEKDAY_CHIPS.map(({ dow, label }) => h('button', {
                                key: dow,
                                type: 'button',
                                className: 'planning-weekday-chip' + (weekdaySet.has(dow) ? ' planning-weekday-chip--active' : ''),
                                'aria-pressed': weekdaySet.has(dow) ? 'true' : 'false',
                                onClick: () => toggleDow(dow),
                            }, label)),
                        ),
                        repeatWeekly && !hasCustomDates && h('button', {
                            type: 'button',
                            className: 'planning-quick-repeat__pick-dates',
                            onClick: () => setShowDateCalendar(true),
                        }, '\uD83D\uDCC5 \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0430\u0442\u044B'),
                        repeatWeekly && hasCustomDates && h('div', { className: 'planning-quick-repeat__custom-summary' },
                            h('span', { className: 'planning-quick-repeat__badge' },
                                '\u0412\u044B\u0431\u0440\u0430\u043D\u043E ' + customDates.size + ' ' + (
                                    customDates.size === 1 ? '\u0434\u0430\u0442\u0430' :
                                    customDates.size < 5 ? '\u0434\u0430\u0442\u044B' : '\u0434\u0430\u0442'
                                ),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-quick-repeat__pick-dates',
                                onClick: () => setShowDateCalendar(true),
                            }, '\uD83D\uDCC5 \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C'),
                            h('button', {
                                type: 'button',
                                className: 'planning-quick-repeat__reset',
                                onClick: () => { setCustomDates(new Set()); },
                            }, '\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C'),
                        ),
                        repeatWeekly && !hasCustomDates && h('p', { className: 'planning-quick-repeat__hint' },
                            '\u0414\u043E 8 \u043D\u0435\u0434\u0435\u043B\u044C \u043E\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0434\u0430\u0442\u044B, \u0442\u0435 \u0436\u0435 \u0447\u0430\u0441\u044B.',
                        ),
                        repeatWeekly && hasCustomDates && h('p', { className: 'planning-quick-repeat__hint' },
                            '\u0421\u043B\u043E\u0442\u044B \u0441\u043E\u0437\u0434\u0430\u0434\u0443\u0442\u0441\u044F \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0434\u0430\u0442\u044B, \u0442\u0435 \u0436\u0435 \u0447\u0430\u0441\u044B.',
                        ),
                    ),
                    h('div', { className: 'planning-bg-section' },
                        h('label', { className: 'planning-bg-section__toggle' },
                            h('input', {
                                type: 'checkbox',
                                checked: isBackground,
                                onChange: (event) => setIsBackground(event.target.checked),
                            }),
                            h('span', null, '\u0424\u043E\u043D\u043E\u0432\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435'),
                        ),
                        isBackground && h('div', { className: 'planning-bg-palette' },
                            BACKGROUND_SLOT_COLORS.map((c) => h('button', {
                                key: c.value,
                                type: 'button',
                                className: 'planning-bg-swatch' + (bgColor === c.value ? ' planning-bg-swatch--active' : ''),
                                style: { background: c.value },
                                title: c.label,
                                'aria-label': c.label,
                                onClick: () => setBgColor(c.value),
                            })),
                        ),
                    ),
                ),
                h('div', { className: 'planning-modal__footer planning-modal__footer--quick-event' },
                    h('button', {
                        type: 'button',
                        className: 'planning-quick-link-cancel',
                        onClick: onClose,
                    }, 'Отмена'),
                    !isDesktop && h('button', {
                        type: 'button',
                        className: 'planning-quick-btn-done planning-quick-btn-done--footer',
                        onClick: save,
                    },
                        h('span', { className: 'planning-quick-btn-done__icon', 'aria-hidden': 'true' }, '✓'),
                        h('span', { className: 'planning-quick-btn-done__text' }, 'Готово'),
                    ),
                ),
                showDateCalendar && h('div', {
                    className: 'planning-repeat-calendar__backdrop',
                    onClick: (event) => { event.stopPropagation(); setShowDateCalendar(false); },
                    onPointerDown: (event) => { event.stopPropagation(); },
                }),
                showDateCalendar && h('div', {
                    className: 'planning-repeat-calendar__overlay',
                    onClick: (event) => event.stopPropagation(),
                },
                    h('div', { className: 'planning-repeat-calendar__overlay-header' },
                        h('span', { className: 'planning-repeat-calendar__overlay-title' }, '\u0412\u044B\u0431\u043E\u0440 \u0434\u0430\u0442'),
                        h('button', {
                            type: 'button',
                            className: 'planning-modal__close planning-modal__close--quick-event',
                            onClick: () => setShowDateCalendar(false),
                        }, '\u00D7'),
                    ),
                    h(RepeatDateCalendar, {
                        selectedDates: customDates,
                        onToggleDate: toggleCustomDate,
                        onClear: () => setCustomDates(new Set()),
                        anchorDate: date,
                        onClose: () => setShowDateCalendar(false),
                    }),
                ),
            ),
        );
    }

    function SlotEditorModal({ draft, state, resolvedTaskProjectIds, onClose }) {
        const { isDesktop } = usePlanningViewport();
        const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
        const projects = Array.isArray(state?.projects) ? state.projects : [];
        const activeProjects = useMemo(
            () => projects.filter((project) => project.status !== 'archived'),
            [projects],
        );
        const resolvedForQuickTarget = useMemo(
            () => buildResolvedTaskProjectMap(tasks, activeProjects),
            [activeProjects, tasks],
        );
        const slots = Array.isArray(state?.slots) ? state.slots : [];
        const taskLookup = useMemo(() => buildTaskLookup(tasks), [tasks]);
        const [showTaskDurationPicker, setShowTaskDurationPicker] = useState(false);
        const [showSlotDurationPicker, setShowSlotDurationPicker] = useState(false);
        const [newSlotProjectName, setNewSlotProjectName] = useState('');
        const [form, setForm] = useState(() => buildUnifiedSlotDraft(draft, tasks, resolvedTaskProjectIds));
        const anchorDowForDraft = useMemo(
            () => new Date(String(dateStr(draft?.date) || '') + 'T12:00:00').getDay(),
            [draft?.date],
        );
        const [repeatWeekly, setRepeatWeekly] = useState(false);
        const [weekdaySet, setWeekdaySet] = useState(() => new Set([anchorDowForDraft]));
        const [customDates, setCustomDates] = useState(() => new Set());
        const [showDateCalendar, setShowDateCalendar] = useState(false);

        useEffect(() => {
            setForm(buildUnifiedSlotDraft(draft, tasks, resolvedTaskProjectIds));
        }, [draft, tasks, resolvedTaskProjectIds]);

        useEffect(() => {
            const anchorDate = dateStr(draft?.date);
            const anchorDow = new Date(String(anchorDate || '') + 'T12:00:00').getDay();
            const gid = String(draft?.recurrenceGroupId || '');
            const siblings = gid && draft?.taskId
                ? collectSlotsByRecurrenceGroup(slots, gid).filter((s) => s.taskId === draft.taskId)
                : (gid ? collectSlotsByRecurrenceGroup(slots, gid) : []);
            const uniqDates = [...new Set(siblings.map((s) => dateStr(s.date)))].sort();
            if (uniqDates.length > 1) {
                setRepeatWeekly(true);
                setCustomDates(new Set(uniqDates));
                setWeekdaySet(new Set([anchorDow]));
            } else {
                setRepeatWeekly(false);
                setCustomDates(new Set());
                setWeekdaySet(new Set([anchorDow]));
            }
            setShowDateCalendar(false);
        }, [draft?.id, draft?.recurrenceGroupId, draft?.taskId, draft?.date, slots]);

        const linkedTask = tasks.find((task) => task.id === form.taskId) || null;
        const descendants = useMemo(
            () => (linkedTask ? collectDescendantIds(tasks, linkedTask.id) : new Set()),
            [tasks, linkedTask],
        );
        const dependencyOptions = useMemo(() => (
            linkedTask
                ? tasks.filter((entry) => entry.id !== linkedTask.id && !descendants.has(entry.id))
                : []
        ), [descendants, linkedTask, tasks]);
        const linkedSlots = useMemo(() => (
            linkedTask
                ? slots.filter((slot) => slot.taskId === linkedTask.id && slot.id !== form.id)
                : []
        ), [form.id, linkedTask, slots]);
        const slotDurationMinutes = getSlotDurationMinutes(form);
        const slotDurationLabel = formatDurationLabel(slotDurationMinutes) || 'Без длительности';
        const taskDurationLabel = formatDurationLabel(form.taskPlannedMinutes) || 'Без оценки';
        const DurationPresetModal = HEYS.PlanningTasks && HEYS.PlanningTasks.DurationPresetModal;
        const headerTitle = linkedTask
            ? (form.taskTitle || linkedTask.title || 'Задача')
            : (String(form.title || '').trim() || 'Отдельное событие');
        const titleFieldValue = linkedTask ? form.taskTitle : form.title;
        const titleFieldPlaceholder = linkedTask ? 'Название задачи' : 'Название события';

        const handleField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

        const handleTaskDependencies = (event) => {
            const values = Array.from(event.target.selectedOptions || []).map((option) => option.value);
            handleField('taskBlockedByTaskIds', values);
        };

        const handleLinkedTaskChange = (taskId) => {
            const nextTask = tasks.find((task) => task.id === taskId);
            const anchorIso = dateStr(form.date);
            const anchorDow = new Date(String(anchorIso || '') + 'T12:00:00').getDay();
            setRepeatWeekly(false);
            setCustomDates(new Set());
            setWeekdaySet(new Set([anchorDow]));
            setShowDateCalendar(false);
            setForm((current) => ({
                ...current,
                taskId,
                title: '',
                taskTitle: nextTask?.title || '',
                taskStatus: nextTask?.status || 'in_progress',
                taskPriority: nextTask?.priority || 'p2',
                taskProjectId: nextTask ? (getResolvedTaskProjectId(nextTask.id, resolvedTaskProjectIds) || '') : '',
                taskParentTaskId: nextTask?.parentTaskId || '',
                taskStartDate: nextTask?.startDate || '',
                taskDueDate: nextTask?.dueDate || '',
                taskPlannedMinutes: nextTask?.plannedMinutes ? String(nextTask.plannedMinutes) : '',
                taskBaselineStartDate: nextTask?.baselineStartDate || '',
                taskBaselineDueDate: nextTask?.baselineDueDate || '',
                taskBaselinePlannedMinutes: nextTask?.baselinePlannedMinutes ? String(nextTask.baselinePlannedMinutes) : '',
                taskBlockedByTaskIds: Array.isArray(nextTask?.blockedByTaskIds) ? nextTask.blockedByTaskIds.slice() : [],
                recurrenceGroupId: '',
            }));
        };

        const hasCustomDates = customDates.size > 0;

        const toggleDow = (dow) => {
            setWeekdaySet((prev) => {
                const next = new Set(prev);
                if (next.has(dow)) {
                    if (next.size <= 1) return next;
                    next.delete(dow);
                } else {
                    next.add(dow);
                }
                return next;
            });
        };

        const handleRepeatToggle = (enabled) => {
            setRepeatWeekly(enabled);
            if (enabled) {
                const anchorIso = dateStr(form.date);
                const dow = new Date(String(anchorIso || '') + 'T12:00:00').getDay();
                setWeekdaySet(new Set([dow]));
                setCustomDates(new Set());
                setShowDateCalendar(false);
            }
        };

        const toggleCustomDate = (isoDate) => {
            setCustomDates((prev) => {
                const next = new Set(prev);
                if (next.has(isoDate)) next.delete(isoDate);
                else next.add(isoDate);
                return next;
            });
        };

        const save = () => {
            if (!form.date || !form.startTime || !form.endTime) return;

            const eventTitle = String(form.title || '').trim();
            const slotDurationMin = getSlotDurationMinutes(form);
            const wantsImplicitTask = !form.taskId && !!(form.taskProjectId || form.taskParentTaskId);

            if (!form.taskId && !wantsImplicitTask && !eventTitle && !form.id) return;

            if (form.taskId && linkedTask) {
                const nextParentTaskId = form.taskParentTaskId || undefined;
                const nextProjectId = nextParentTaskId
                    ? getResolvedTaskProjectId(nextParentTaskId, resolvedTaskProjectIds)
                    : (form.taskProjectId || undefined);

                state.updateTask(form.taskId, {
                    title: String(form.taskTitle || linkedTask.title || '').trim() || linkedTask.title,
                    status: form.taskStatus,
                    priority: form.taskPriority,
                    projectId: nextProjectId,
                    parentTaskId: nextParentTaskId,
                    startDate: form.taskStartDate || undefined,
                    dueDate: form.taskDueDate || undefined,
                    plannedMinutes: form.taskPlannedMinutes ? Number(form.taskPlannedMinutes) : undefined,
                    baselineStartDate: form.taskBaselineStartDate || undefined,
                    baselineDueDate: form.taskBaselineDueDate || undefined,
                    baselinePlannedMinutes: form.taskBaselinePlannedMinutes ? Number(form.taskBaselinePlannedMinutes) : undefined,
                    blockedByTaskIds: form.taskBlockedByTaskIds,
                });

                let sm = timeToMinutes(form.startTime);
                let em = timeToMinutes(form.endTime);
                if (em <= sm) {
                    const tmp = sm;
                    sm = em;
                    em = tmp + CALENDAR_SNAP_MINUTES;
                }
                const st = formatWallClockHm(sm);
                const et = formatWallClockHm(em);

                const baseSlotPayload = {
                    taskId: form.taskId,
                    title: '',
                    startTime: st,
                    endTime: et,
                    isBackground: form.isBackground,
                    bgColor: form.isBackground ? form.bgColor : undefined,
                };

                const gid = String(form.recurrenceGroupId || '');
                const oldSiblings = gid
                    ? collectSlotsByRecurrenceGroup(slots, gid).filter((s) => s.taskId === form.taskId)
                    : [];
                const oldIds = oldSiblings.map((s) => s.id).filter(Boolean);

                if (repeatWeekly) {
                    let dateList = [];
                    if (hasCustomDates) {
                        dateList = [...customDates].sort();
                    } else {
                        for (let i = 0; i <= QUICK_REPEAT_HORIZON_DAYS; i += 1) {
                            const d = addDays(form.date, i);
                            const dow = new Date(String(d) + 'T12:00:00').getDay();
                            if (weekdaySet.has(dow)) dateList.push(d);
                        }
                    }
                    if (!dateList.length) return;

                    const groupId = uid();
                    const idsToDrop = (oldIds.length ? oldIds : (form.id ? [form.id] : [])).filter(Boolean);
                    if (typeof state.deleteSlotBatch === 'function' && idsToDrop.length) {
                        state.deleteSlotBatch(idsToDrop);
                    } else {
                        idsToDrop.forEach((id) => state.deleteSlot(id));
                    }

                    const slotOpts = dateList.map((d) => ({
                        ...baseSlotPayload,
                        date: d,
                        source: 'user',
                        recurrenceGroupId: groupId,
                    }));
                    state.addSlotBatch(slotOpts.map((o) => ({
                        ...o,
                        taskId: form.taskId,
                        title: '',
                    })));
                    onClose();
                    return;
                }

                const others = oldIds.filter((id) => id !== form.id);
                if (others.length && typeof state.deleteSlotBatch === 'function') {
                    state.deleteSlotBatch(others);
                } else if (others.length) {
                    others.forEach((id) => state.deleteSlot(id));
                }

                const slotPayloadLinked = {
                    ...baseSlotPayload,
                    date: form.date,
                    recurrenceGroupId: undefined,
                };
                if (form.id) state.updateSlot(form.id, slotPayloadLinked);
                else state.addSlot(slotPayloadLinked);
                onClose();
                return;
            }

            if (wantsImplicitTask) {
                const nextParentTaskId = form.taskParentTaskId || undefined;
                const nextProjectId = nextParentTaskId
                    ? getResolvedTaskProjectId(nextParentTaskId, resolvedTaskProjectIds)
                    : (form.taskProjectId || undefined);
                const taskTitle = eventTitle || 'Событие';
                const newTask = state.addTask(taskTitle, {
                    projectId: nextProjectId,
                    parentTaskId: nextParentTaskId,
                    startDate: form.date,
                    dueDate: form.date,
                    plannedMinutes: slotDurationMin,
                    status: 'todo',
                });
                const slotPayloadNew = {
                    taskId: newTask.id,
                    title: '',
                    date: form.date,
                    startTime: form.startTime,
                    endTime: form.endTime,
                    isBackground: form.isBackground,
                    bgColor: form.isBackground ? form.bgColor : undefined,
                };
                if (form.id) state.updateSlot(form.id, slotPayloadNew);
                else state.addSlot(slotPayloadNew);
                onClose();
                return;
            }

            const slotPayload = {
                taskId: undefined,
                title: eventTitle,
                date: form.date,
                startTime: form.startTime,
                endTime: form.endTime,
                isBackground: form.isBackground,
                bgColor: form.isBackground ? form.bgColor : undefined,
            };
            if (form.id) state.updateSlot(form.id, slotPayload);
            else state.addSlot(slotPayload);
            onClose();
        };

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--quick-event'
                + (!isDesktop ? ' planning-modal-overlay--quick-event-sheet' : ''),
            onClick: onClose,
        },
            h('div', {
                className: 'planning-modal planning-modal--quick-event planning-modal--slot-edit'
                    + (!isDesktop ? ' planning-modal--quick-event-sheet' : ''),
                onClick: (event) => event.stopPropagation(),
            },
                h('div', { className: 'planning-modal__header planning-modal__header--quick-event' },
                    h('div', { className: 'planning-modal__header-copy' },
                        h('span', { className: 'planning-modal__header-title planning-modal__header-title--quick-event' }, headerTitle),
                    ),
                    h('button', {
                        type: 'button',
                        className: 'planning-modal__close planning-modal__close--quick-event',
                        onClick: onClose,
                        'aria-label': 'Закрыть',
                    }, '×'),
                ),
                h('div', { className: 'planning-modal__body planning-modal__body--quick-event' },
                    h('div', { className: 'planning-slot-edit-task-row' },
                        h('label', { className: 'planning-slot-edit-task-row__label', htmlFor: 'planning-slot-edit-task' }, 'Задача'),
                        h('select', {
                            id: 'planning-slot-edit-task',
                            className: 'planning-slot-edit-task-row__select',
                            value: form.taskId,
                            onChange: (event) => handleLinkedTaskChange(event.target.value),
                        },
                            h('option', { value: '' }, '— обычное событие —'),
                            tasks.map((task) => h('option', {
                                key: task.id,
                                value: task.id,
                            }, buildTaskHierarchyInfo(task, taskLookup, projects, resolvedTaskProjectIds).selectLabel)),
                        ),
                    ),
                    h('div', { className: 'planning-quick-title-field' },
                        h('input', {
                            id: 'planning-slot-edit-title',
                            className: 'planning-quick-title-field__input',
                            placeholder: titleFieldPlaceholder,
                            value: titleFieldValue,
                            onChange: (event) => handleField(linkedTask ? 'taskTitle' : 'title', event.target.value),
                            autoComplete: 'off',
                        }),
                    ),
                    h('div', { className: 'planning-quick-date-action-row' },
                        h('div', { className: 'planning-quick-date-action-row__date' },
                            h('label', { className: 'planning-quick-date-action-row__label', htmlFor: 'planning-slot-edit-date' }, 'Дата'),
                            h('input', {
                                id: 'planning-slot-edit-date',
                                className: 'planning-quick-date-action-row__date-input',
                                type: 'date',
                                value: form.date,
                                onChange: (event) => handleField('date', event.target.value),
                            }),
                        ),
                        isDesktop && h('button', {
                            type: 'button',
                            className: 'planning-quick-btn-done planning-quick-btn-done--in-body',
                            onClick: save,
                        },
                            h('span', { className: 'planning-quick-btn-done__icon', 'aria-hidden': 'true' }, '✓'),
                            h('span', { className: 'planning-quick-btn-done__text' }, 'Сохранить'),
                        ),
                    ),
                    h('div', { className: 'planning-quick-time-pair' },
                        h('div', { className: 'planning-quick-time-pair__field' },
                            h('label', { htmlFor: 'planning-slot-edit-start' }, 'Начало'),
                            h('input', {
                                id: 'planning-slot-edit-start',
                                className: 'planning-quick-time-pair__input',
                                type: 'time',
                                step: 300,
                                value: normalizeQuickModalTimeForInput(form.startTime || '09:00'),
                                onChange: (event) => handleField(
                                    'startTime',
                                    normalizeQuickModalTimeForInput(event.target.value || '09:00'),
                                ),
                            }),
                        ),
                        h('div', { className: 'planning-quick-time-pair__sep', 'aria-hidden': 'true' }, '—'),
                        h('div', { className: 'planning-quick-time-pair__field' },
                            h('label', { htmlFor: 'planning-slot-edit-end' }, 'Конец'),
                            h('input', {
                                id: 'planning-slot-edit-end',
                                className: 'planning-quick-time-pair__input',
                                type: 'time',
                                step: 300,
                                value: normalizeQuickModalTimeForInput(form.endTime || '10:00'),
                                onChange: (event) => handleField(
                                    'endTime',
                                    normalizeQuickModalTimeForInput(event.target.value || '10:00'),
                                ),
                            }),
                        ),
                    ),
                    h('div', { className: 'planning-slot-edit-duration-link' },
                        h('button', {
                            type: 'button',
                            className: 'planning-slot-edit-duration-link__btn',
                            onClick: () => setShowSlotDurationPicker(true),
                        },
                            'Длительность слота: ',
                            h('span', { className: 'planning-slot-edit-duration-link__value' }, slotDurationLabel),
                        ),
                    ),
                    linkedTask && h('div', { className: 'planning-slot-edit-status-row' },
                        h('div', { className: 'planning-slot-edit-status-row__field' },
                            h('label', { htmlFor: 'planning-slot-edit-status' }, 'Статус'),
                            h('select', {
                                id: 'planning-slot-edit-status',
                                className: 'planning-slot-edit-status-row__select',
                                value: form.taskStatus,
                                onChange: (event) => handleField('taskStatus', event.target.value),
                            },
                                Object.keys(STATUS_CONFIG).map((key) => h('option', { key, value: key }, STATUS_CONFIG[key].label)),
                            ),
                        ),
                        h('div', { className: 'planning-slot-edit-status-row__field' },
                            h('label', { htmlFor: 'planning-slot-edit-priority' }, 'Приоритет'),
                            h('select', {
                                id: 'planning-slot-edit-priority',
                                className: 'planning-slot-edit-status-row__select',
                                value: form.taskPriority,
                                onChange: (event) => handleField('taskPriority', event.target.value),
                            },
                                Object.keys(PRIORITY_CONFIG).map((key) => h('option', { key, value: key }, PRIORITY_CONFIG[key].label)),
                            ),
                        ),
                    ),
                    h('div', { className: 'planning-quick-slot-target-wrap' },
                        h('div', { className: 'planning-quick-slot-target-wrap__label' }, 'Проект и подпроект'),
                        h(PlanningQuickTargetField, {
                            value: encodePlanningFieldsToQuickValue(form.taskProjectId, form.taskParentTaskId),
                            onChange: (next) => {
                                const fields = resolveQuickTargetToFormFields(next, tasks, resolvedForQuickTarget);
                                setForm((current) => ({
                                    ...current,
                                    taskProjectId: fields.taskProjectId,
                                    taskParentTaskId: fields.taskParentTaskId,
                                }));
                            },
                            projects: activeProjects,
                            tasks,
                            resolvedTaskProjectIds: resolvedForQuickTarget,
                            tabsSelector: '.tabs',
                            modalMenuMode: true,
                        }),
                    ),
                    h('div', { className: 'planning-add-project' },
                        h('input', {
                            className: 'planning-quick-input planning-quick-input--sm',
                            placeholder: 'Новый проект...',
                            value: newSlotProjectName,
                            onChange: (event) => setNewSlotProjectName(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key !== 'Enter') return;
                                const name = String(newSlotProjectName || '').trim();
                                if (!name) return;
                                state.addProject(name);
                                setNewSlotProjectName('');
                            },
                        }),
                        h('button', {
                            type: 'button',
                            className: 'planning-add-btn planning-add-btn--project',
                            onClick: () => {
                                const name = String(newSlotProjectName || '').trim();
                                if (!name) return;
                                state.addProject(name);
                                setNewSlotProjectName('');
                            },
                        }, '+ Проект'),
                    ),
                    linkedTask && h('div', { className: 'planning-quick-repeat' },
                        h('label', { className: 'planning-quick-repeat__toggle' },
                            h('input', {
                                type: 'checkbox',
                                checked: repeatWeekly,
                                onChange: (event) => handleRepeatToggle(event.target.checked),
                            }),
                            h('span', null, '\u041F\u043E\u0432\u0442\u043E\u0440\u044F\u0442\u044C \u043F\u043E \u0434\u043D\u044F\u043C \u043D\u0435\u0434\u0435\u043B\u0438'),
                        ),
                        repeatWeekly && !hasCustomDates && h('div', {
                            className: 'planning-quick-repeat__days',
                            role: 'group',
                            'aria-label': '\u0414\u043D\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0430',
                        },
                            QUICK_WEEKDAY_CHIPS.map(({ dow, label }) => h('button', {
                                key: dow,
                                type: 'button',
                                className: 'planning-weekday-chip' + (weekdaySet.has(dow) ? ' planning-weekday-chip--active' : ''),
                                'aria-pressed': weekdaySet.has(dow) ? 'true' : 'false',
                                onClick: () => toggleDow(dow),
                            }, label)),
                        ),
                        repeatWeekly && !hasCustomDates && h('button', {
                            type: 'button',
                            className: 'planning-quick-repeat__pick-dates',
                            onClick: () => setShowDateCalendar(true),
                        }, '\uD83D\uDCC5 \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0430\u0442\u044B'),
                        repeatWeekly && hasCustomDates && h('div', { className: 'planning-quick-repeat__custom-summary' },
                            h('span', { className: 'planning-quick-repeat__badge' },
                                '\u0412\u044B\u0431\u0440\u0430\u043D\u043E ' + customDates.size + ' ' + (
                                    customDates.size === 1 ? '\u0434\u0430\u0442\u0430' :
                                    customDates.size < 5 ? '\u0434\u0430\u0442\u044B' : '\u0434\u0430\u0442'
                                ),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-quick-repeat__pick-dates',
                                onClick: () => setShowDateCalendar(true),
                            }, '\uD83D\uDCC5 \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C'),
                            h('button', {
                                type: 'button',
                                className: 'planning-quick-repeat__reset',
                                onClick: () => { setCustomDates(new Set()); },
                            }, '\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C'),
                        ),
                        repeatWeekly && !hasCustomDates && h('p', { className: 'planning-quick-repeat__hint' },
                            '\u0414\u043E 8 \u043D\u0435\u0434\u0435\u043B\u044C \u043E\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u0434\u0430\u0442\u044B, \u0442\u0435 \u0436\u0435 \u0447\u0430\u0441\u044B.',
                        ),
                        repeatWeekly && hasCustomDates && h('p', { className: 'planning-quick-repeat__hint' },
                            '\u0421\u043B\u043E\u0442\u044B \u0441\u043E\u0437\u0434\u0430\u0434\u0443\u0442\u0441\u044F \u043D\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0434\u0430\u0442\u044B, \u0442\u0435 \u0436\u0435 \u0447\u0430\u0441\u044B.',
                        ),
                    ),
                    !linkedTask && h('p', { className: 'planning-quick-repeat__hint' },
                        'Если выбран проект или родитель без задачи в списке выше, при сохранении создаётся задача и слот к ней привязывается.',
                    ),
                    h('div', { className: 'planning-bg-section' },
                        h('label', { className: 'planning-bg-section__toggle' },
                            h('input', {
                                type: 'checkbox',
                                checked: form.isBackground,
                                onChange: (event) => handleField('isBackground', event.target.checked),
                            }),
                            h('span', null, '\u0424\u043E\u043D\u043E\u0432\u043E\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u0435'),
                        ),
                        form.isBackground && h('div', { className: 'planning-bg-palette' },
                            BACKGROUND_SLOT_COLORS.map((c) => h('button', {
                                key: c.value,
                                type: 'button',
                                className: 'planning-bg-swatch' + (form.bgColor === c.value ? ' planning-bg-swatch--active' : ''),
                                style: { background: c.value },
                                title: c.label,
                                'aria-label': c.label,
                                onClick: () => handleField('bgColor', c.value),
                            })),
                        ),
                    ),
                    linkedTask && h('div', { className: 'planning-slot-edit-task-plan' },
                        h('div', { className: 'planning-slot-edit-task-plan__title' }, 'Сроки и оценка задачи'),
                        h('div', { className: 'planning-slot-edit-task-plan__grid' },
                            h('div', { className: 'planning-slot-edit-task-plan__field' },
                                h('label', { htmlFor: 'planning-slot-edit-task-start' }, 'Старт'),
                                h('input', {
                                    id: 'planning-slot-edit-task-start',
                                    className: 'planning-slot-edit-task-plan__input',
                                    type: 'date',
                                    value: form.taskStartDate,
                                    onChange: (event) => handleField('taskStartDate', event.target.value),
                                }),
                            ),
                            h('div', { className: 'planning-slot-edit-task-plan__field' },
                                h('label', { htmlFor: 'planning-slot-edit-task-due' }, 'Дедлайн'),
                                h('input', {
                                    id: 'planning-slot-edit-task-due',
                                    className: 'planning-slot-edit-task-plan__input',
                                    type: 'date',
                                    value: form.taskDueDate,
                                    onChange: (event) => handleField('taskDueDate', event.target.value),
                                }),
                            ),
                            h('div', { className: 'planning-slot-edit-task-plan__field planning-slot-edit-task-plan__field--span' },
                                h('label', null, 'Оценка задачи'),
                                h('button', {
                                    type: 'button',
                                    className: 'planning-duration-trigger planning-duration-trigger--compact',
                                    onClick: () => setShowTaskDurationPicker(true),
                                },
                                    h('span', { className: 'planning-duration-trigger__value' }, taskDurationLabel),
                                    h('span', { className: 'planning-duration-trigger__icon', 'aria-hidden': 'true' }, '⏱'),
                                ),
                            ),
                        ),
                    ),
                    linkedTask && h('details', { className: 'planning-modal__details planning-modal__details--slot-advanced' },
                        h('summary', { className: 'planning-modal__details-summary' },
                            h('span', { className: 'planning-modal__details-title' }, 'Зависимости, baseline, другие слоты'),
                            h('span', { className: 'planning-modal__details-hint' }, 'по желанию'),
                        ),
                        h('div', { className: 'planning-modal__details-body' },
                            h('div', { className: 'planning-slot-edit-advanced__block' },
                                h('label', { className: 'planning-slot-edit-advanced__label', htmlFor: 'planning-slot-edit-deps' }, 'Зависимости'),
                                h('select', {
                                    id: 'planning-slot-edit-deps',
                                    className: 'planning-slot-edit-advanced__multiselect',
                                    multiple: true,
                                    size: Math.min(4, Math.max(2, dependencyOptions.length || 2)),
                                    value: form.taskBlockedByTaskIds,
                                    onChange: handleTaskDependencies,
                                },
                                    dependencyOptions.map((entry) => h('option', {
                                        key: entry.id,
                                        value: entry.id,
                                    }, buildTaskHierarchyInfo(entry, taskLookup, projects, resolvedTaskProjectIds).selectLabel)),
                                ),
                            ),
                            linkedSlots.length > 0 && h('div', { className: 'planning-modal__subcard' },
                                h('div', { className: 'planning-modal__subcard-title' }, 'Другие слоты этой задачи'),
                                h('div', { className: 'planning-linked-list' },
                                    linkedSlots.map((slot) => h('div', { key: slot.id, className: 'planning-linked-list__item' },
                                        h('span', null, slot.date + ' · ' + slot.startTime + '–' + slot.endTime),
                                    )),
                                ),
                            ),
                            h('div', { className: 'planning-slot-edit-baseline' },
                                h('div', { className: 'planning-slot-edit-baseline__title' }, 'Baseline'),
                                h('div', { className: 'planning-slot-edit-baseline__grid' },
                                    h('div', { className: 'planning-slot-edit-baseline__field' },
                                        h('label', { htmlFor: 'planning-slot-edit-bl-start' }, 'Старт'),
                                        h('input', {
                                            id: 'planning-slot-edit-bl-start',
                                            className: 'planning-slot-edit-baseline__input',
                                            type: 'date',
                                            value: form.taskBaselineStartDate,
                                            onChange: (event) => handleField('taskBaselineStartDate', event.target.value),
                                        }),
                                    ),
                                    h('div', { className: 'planning-slot-edit-baseline__field' },
                                        h('label', { htmlFor: 'planning-slot-edit-bl-due' }, 'Срок'),
                                        h('input', {
                                            id: 'planning-slot-edit-bl-due',
                                            className: 'planning-slot-edit-baseline__input',
                                            type: 'date',
                                            value: form.taskBaselineDueDate,
                                            onChange: (event) => handleField('taskBaselineDueDate', event.target.value),
                                        }),
                                    ),
                                    h('div', { className: 'planning-slot-edit-baseline__field planning-slot-edit-baseline__field--full' },
                                        h('label', { htmlFor: 'planning-slot-edit-bl-min' }, 'Минуты'),
                                        h('input', {
                                            id: 'planning-slot-edit-bl-min',
                                            className: 'planning-slot-edit-baseline__input',
                                            type: 'number',
                                            min: 0,
                                            value: form.taskBaselinePlannedMinutes,
                                            onChange: (event) => handleField('taskBaselinePlannedMinutes', event.target.value),
                                        }),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
                h('div', { className: 'planning-modal__footer planning-modal__footer--quick-event' },
                    form.id && h('button', {
                        type: 'button',
                        className: 'planning-quick-link-cancel planning-quick-link-cancel--danger',
                        onClick: () => {
                            const gid = String(form.recurrenceGroupId || '');
                            const group = gid
                                ? collectSlotsByRecurrenceGroup(slots, gid).filter((s) => s.taskId === form.taskId)
                                : [];
                            const ids = group.length ? group.map((s) => s.id) : [form.id];
                            if (typeof state.deleteSlotBatch === 'function' && ids.length > 1) {
                                state.deleteSlotBatch(ids);
                            } else {
                                ids.forEach((id) => state.deleteSlot(id));
                            }
                            onClose();
                        },
                    }, 'Удалить'),
                    h('button', { type: 'button', className: 'planning-quick-link-cancel', onClick: onClose }, 'Отмена'),
                    !isDesktop && h('button', {
                        type: 'button',
                        className: 'planning-quick-btn-done planning-quick-btn-done--footer',
                        onClick: save,
                    },
                        h('span', { className: 'planning-quick-btn-done__icon', 'aria-hidden': 'true' }, '✓'),
                        h('span', { className: 'planning-quick-btn-done__text' }, 'Сохранить'),
                    ),
                ),
            ),
            showSlotDurationPicker && DurationPresetModal && h(DurationPresetModal, {
                title: 'Длительность слота',
                subtitle: 'Меняем длительность блока, сохраняя текущее время начала.',
                value: slotDurationMinutes,
                onSelect: (minutes) => {
                    const normalized = normalizeDurationMinutes(minutes);
                    if (!normalized) return;
                    setForm((current) => ({
                        ...current,
                        endTime: formatClockTime(timeToMinutes(current.startTime) + normalized),
                    }));
                },
                onClose: () => setShowSlotDurationPicker(false),
            }),
            showTaskDurationPicker && DurationPresetModal && h(DurationPresetModal, {
                title: 'Длительность задачи',
                subtitle: 'Это оценка задачи, она используется и при планировании новых слотов.',
                value: form.taskPlannedMinutes,
                onSelect: (minutes) => handleField('taskPlannedMinutes', minutes ? String(minutes) : ''),
                onClose: () => setShowTaskDurationPicker(false),
            }),
            linkedTask && showDateCalendar && h('div', {
                className: 'planning-repeat-calendar__backdrop',
                onClick: (event) => { event.stopPropagation(); setShowDateCalendar(false); },
                onPointerDown: (event) => { event.stopPropagation(); },
            }),
            linkedTask && showDateCalendar && h('div', {
                className: 'planning-repeat-calendar__overlay',
                onClick: (event) => event.stopPropagation(),
            },
                h('div', { className: 'planning-repeat-calendar__overlay-header' },
                    h('span', { className: 'planning-repeat-calendar__overlay-title' }, '\u0412\u044B\u0431\u043E\u0440 \u0434\u0430\u0442'),
                    h('button', {
                        type: 'button',
                        className: 'planning-modal__close planning-modal__close--quick-event',
                        onClick: () => setShowDateCalendar(false),
                    }, '\u00D7'),
                ),
                h(RepeatDateCalendar, {
                    selectedDates: customDates,
                    onToggleDate: toggleCustomDate,
                    onClear: () => setCustomDates(new Set()),
                    anchorDate: form.date,
                    onClose: () => setShowDateCalendar(false),
                }),
            ),
        );
    }

    function CalendarSlotCard({
        slot,
        color,
        className,
        style,
        title,
        subtitle,
        parentGroupLabel,
        showSubtitle,
        onTaskStatusToggle,
        taskStatusToggleDone,
        onOpen,
        onResizeStart,
        onDragStateChange,
        onTouchDragStart,
        onPointerDragStart,
        shouldSuppressClick,
        isTouchDragSource,
        allowNativeDrag,
        showResizeHandle,
        onDeleteClick,
        isPastDay,
        onQuickReschedule,
    }) {
        const slotTitle = parentGroupLabel ? (parentGroupLabel + ' · ' + title) : title;
        const toggleIcon = taskStatusToggleDone
            ? (STATUS_CONFIG.done?.icon || '●')
            : (STATUS_CONFIG.todo?.icon || '○');
        const toggleLabel = taskStatusToggleDone ? 'Вернуть в работу' : 'Завершить задачу';
        const showCarryover = isPastDay && !taskStatusToggleDone && typeof onQuickReschedule === 'function';
        const showFooter = Boolean(
            showSubtitle
            || typeof onTaskStatusToggle === 'function'
            || typeof onDeleteClick === 'function'
            || showCarryover,
        );

        return h('div', {
            className: 'planning-calendar-slot'
                + (className || '')
                + (isTouchDragSource ? ' planning-calendar-slot--touch-dragging' : ''),
            draggable: allowNativeDrag !== false,
            style: isTouchDragSource
                ? { ...style, background: 'transparent' }
                : { ...style, background: color },
            title: slotTitle,
            onPointerDown: (event) => {
                if (typeof onPointerDragStart === 'function') {
                    onPointerDragStart({
                        event,
                        payload: { type: 'slot', slotId: slot.id },
                        sourceKey: 'slot:' + slot.id,
                        title,
                        badgeText: subtitle,
                        parentGroupLabel,
                        accentColor: color,
                        background: color,
                        onDragStateChange,
                    });
                }
            },
            onTouchStart: (event) => {
                if (typeof onTouchDragStart === 'function') {
                    onTouchDragStart({
                        event,
                        payload: { type: 'slot', slotId: slot.id },
                        sourceKey: 'slot:' + slot.id,
                        title,
                        badgeText: subtitle,
                        parentGroupLabel,
                        accentColor: color,
                        background: color,
                        onDragStateChange,
                    });
                }
            },
            onClick: (event) => {
                event.stopPropagation();
                if (typeof shouldSuppressClick === 'function' && shouldSuppressClick()) return;
                onOpen();
            },
            onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/heys-planning-slot', JSON.stringify({ type: 'slot', slotId: slot.id }));
                const emptyImg = new Image();
                emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                event.dataTransfer.setDragImage(emptyImg, 0, 0);
            },
            onDragEnd: () => {
                if (typeof onDragStateChange === 'function') onDragStateChange(false);
            },
        },
            parentGroupLabel && h('span', {
                className: 'planning-calendar-slot__parent',
                title: parentGroupLabel,
            }, parentGroupLabel),
            h('span', {
                className: 'planning-calendar-slot__title' + (parentGroupLabel ? ' planning-calendar-slot__title--with-parent' : ''),
            }, title),
            showFooter && h('div', { className: 'planning-calendar-slot__footer' },
                showSubtitle && h('span', { className: 'planning-calendar-slot__time' }, subtitle),
                h('div', { className: 'planning-calendar-slot__actions' },
                    typeof onTaskStatusToggle === 'function' && h('button', {
                        type: 'button',
                        className: 'planning-calendar-slot__complete'
                            + (taskStatusToggleDone ? ' planning-calendar-slot__complete--done' : ''),
                        title: toggleLabel,
                        'aria-label': toggleLabel,
                        'aria-pressed': taskStatusToggleDone ? 'true' : 'false',
                        onPointerDown: (event) => event.stopPropagation(),
                        onTouchStart: (event) => event.stopPropagation(),
                        onClick: (event) => {
                            event.stopPropagation();
                            onTaskStatusToggle();
                        },
                    }, toggleIcon),
                    typeof onDeleteClick === 'function' && h('button', {
                        type: 'button',
                        className: 'planning-calendar-slot__delete',
                        title: 'Удалить слот',
                        'aria-label': 'Удалить слот',
                        onPointerDown: (event) => event.stopPropagation(),
                        onTouchStart: (event) => event.stopPropagation(),
                        onClick: (event) => {
                            event.stopPropagation();
                            onDeleteClick(event);
                        },
                    }, h('span', { className: 'planning-calendar-slot__delete-icon', 'aria-hidden': 'true' }, '×')),
                    showCarryover && h('button', {
                        type: 'button',
                        className: 'planning-calendar-slot__carryover',
                        title: 'На сегодня',
                        'aria-label': 'Перенести на сегодня',
                        onPointerDown: (event) => event.stopPropagation(),
                        onTouchStart: (event) => event.stopPropagation(),
                        onClick: (event) => { event.stopPropagation(); onQuickReschedule('today'); },
                    }, '→'),
                    showCarryover && h('button', {
                        type: 'button',
                        className: 'planning-calendar-slot__carryover',
                        title: 'На завтра',
                        'aria-label': 'Перенести на завтра',
                        onPointerDown: (event) => event.stopPropagation(),
                        onTouchStart: (event) => event.stopPropagation(),
                        onClick: (event) => { event.stopPropagation(); onQuickReschedule('tomorrow'); },
                    }, '⇥'),
                ),
            ),
            showResizeHandle && h('button', {
                type: 'button',
                className: 'planning-calendar-slot__resize planning-calendar-slot__resize--start planning-calendar-slot__resize--corner-l',
                onPointerDown: (event) => onResizeStart(slot, 'start', event),
                onTouchStart: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                title: 'Изменить время начала (угол)',
                'aria-label': 'Изменить время начала, левый угол',
            }),
            showResizeHandle && h('button', {
                type: 'button',
                className: 'planning-calendar-slot__resize planning-calendar-slot__resize--start planning-calendar-slot__resize--corner-r',
                onPointerDown: (event) => onResizeStart(slot, 'start', event),
                onTouchStart: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                title: 'Изменить время начала (угол)',
                'aria-label': 'Изменить время начала, правый угол',
            }),
            showResizeHandle && h('button', {
                type: 'button',
                className: 'planning-calendar-slot__resize planning-calendar-slot__resize--end planning-calendar-slot__resize--corner-l',
                onPointerDown: (event) => onResizeStart(slot, 'end', event),
                onTouchStart: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                title: 'Изменить время окончания (угол)',
                'aria-label': 'Изменить время окончания, левый угол',
            }),
            showResizeHandle && h('button', {
                type: 'button',
                className: 'planning-calendar-slot__resize planning-calendar-slot__resize--end planning-calendar-slot__resize--corner-r',
                onPointerDown: (event) => onResizeStart(slot, 'end', event),
                onTouchStart: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                title: 'Изменить время окончания (угол)',
                'aria-label': 'Изменить время окончания, правый угол',
            }),
        );
    }

    function CalendarUnscheduledTaskPill({
        task,
        projects,
        taskLookup,
        onOpen,
        onDragStateChange,
        onTouchDragStart,
        onPointerDragStart,
        shouldSuppressClick,
        isTouchDragSource,
        allowNativeDrag,
    }) {
        const parentGroupLabel = buildTaskParentGroupLabel(task, taskLookup);
        const projectColor = getTaskProjectColor(task, projects);

        return h('div', {
            className: 'planning-calendar-unscheduled-pill'
                + (isTouchDragSource ? ' planning-calendar-unscheduled-pill--touch-dragging' : ''),
            draggable: (allowNativeDrag !== false) && !isTouchDevicePreferred(),
            style: {
                '--planning-unscheduled-project-color': projectColor,
                touchAction: 'none',
            },
            title: parentGroupLabel ? (parentGroupLabel + ' · ' + task.title) : task.title,
            onPointerDown: (event) => {
                const pointerType = String(event?.pointerType || '').toLowerCase();
                if ((pointerType === 'touch' || pointerType === 'pen') && event?.cancelable) {
                    // On mobile, block native scroll/drag so custom calendar drag keeps receiving move events.
                    event.preventDefault();
                }
                if (typeof onPointerDragStart === 'function') {
                    onPointerDragStart({
                        event,
                        payload: { type: 'task', taskId: task.id },
                        sourceKey: 'task:' + task.id,
                        title: task.title,
                        badgeText: '',
                        parentGroupLabel,
                        accentColor: projectColor,
                    });
                }
            },
            onTouchStart: (event) => {
                if (typeof window.PointerEvent === 'function') return;
                if (typeof onTouchDragStart === 'function') {
                    onTouchDragStart({
                        event,
                        payload: { type: 'task', taskId: task.id },
                        sourceKey: 'task:' + task.id,
                        title: task.title,
                        badgeText: '',
                        parentGroupLabel,
                        accentColor: projectColor,
                    });
                }
            },
            onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'copyMove';
                event.dataTransfer.setData('text/heys-planning-task', JSON.stringify({ type: 'task', taskId: task.id }));
                const emptyImg = new Image();
                emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                event.dataTransfer.setDragImage(emptyImg, 0, 0);
            },
            onDragEnd: () => {
                if (typeof onDragStateChange === 'function') onDragStateChange(false);
            },
            onClick: () => {
                if (typeof shouldSuppressClick === 'function' && shouldSuppressClick()) return;
                onOpen(task.id);
            },
        },
            h('div', { className: 'planning-calendar-unscheduled-pill__body' },
                parentGroupLabel && h('span', {
                    className: 'planning-calendar-unscheduled-pill__parent',
                    title: parentGroupLabel,
                }, parentGroupLabel),
                h('span', { className: 'planning-calendar-unscheduled-pill__title' }, task.title),
            ),
        );
    }

    function CalendarScreen({ state }) {
        const { isDesktop } = usePlanningViewport();
        const [slotDraft, setSlotDraft] = useState(null);
        const [selectedTaskId, setSelectedTaskId] = useState(null);
        const [resizePreview, setResizePreview] = useState(null);
        const [calendarDayWindow, setCalendarDayWindow] = useState(readStoredCalendarDayWindow);
        const [calendarViewportWidth, setCalendarViewportWidth] = useState(0);
        const [calendarViewportHeight, setCalendarViewportHeight] = useState(0);
        const [nowLineTop, setNowLineTop] = useState(() => getCalendarNowTop());
        const [shouldCenterNow, setShouldCenterNow] = useState(true);
        const [headerDropState, setHeaderDropState] = useState({ day: '', mode: '' });
        const [calendarCellDropPreview, setCalendarCellDropPreview] = useState(null);
        const [calendarDropCommitAccent, setCalendarDropCommitAccent] = useState(null);
        const headerFrame = { ready: true, top: 0, left: 0, width: 0, height: 0 };
        const [isCalendarDragZoomActive, setIsCalendarDragZoomActive] = useState(false);
        const [touchDragPreview, setTouchDragPreview] = useState(null);
        const [touchDragSourceKey, setTouchDragSourceKey] = useState('');
        const [rangeSelectPreview, setRangeSelectPreview] = useState(null);
        const [slotDeleteTarget, setSlotDeleteTarget] = useState(null);
        const rangePointerSessionRef = useRef(null);
        const rangeTouchSessionRef = useRef(null);
        const resizeStateRef = useRef(null);
        const headerRef = useRef(null);
        const nowLineRef = useRef(null);
        const gridScrollRef = useRef(null);
        const bodyScrollRef = gridScrollRef;
        const previousDayWidthRef = useRef(0);
        const touchDragStateRef = useRef(null);
        const touchDragAutoScrollFrameRef = useRef(0);
        const touchDragBodyRectRef = useRef(null);
        const touchDragGridRectRef = useRef(null);
        const touchDragLayoutGenRef = useRef(0);
        const headerDropStateRef = useRef({ day: '', mode: '' });
        const dropCommitAccentTimerRef = useRef(0);
        const suppressCalendarClickUntilRef = useRef(0);
        const dayColumnWidthRef = useRef(0);
        const calendarBodyScrollRafRef = useRef(0);
        const calendarWindowBoundsRef = useRef({ firstIdx: -1, lastIdx: -1 });
        const [calendarWindowScrollTick, setCalendarWindowScrollTick] = useState(0);
        const calendarDaysRef = useRef([]);
        const isCalendarDragZoomActiveRef = useRef(false);
        const [, setCalendarThemeTick] = useState(0);
        const todayIso = getPlanningTodayIso();
        const yesterdayIso = useMemo(() => addDays(todayIso, -1), [todayIso]);
        const calendarStartIso = useMemo(() => addDays(todayIso, -CALENDAR_LOOKBACK_DAYS), [todayIso]);
        const calendarDays = useMemo(
            () => buildCalendarDays(calendarStartIso, CALENDAR_LOOKBACK_DAYS + CALENDAR_FORWARD_DAYS + 1),
            [calendarStartIso],
        );
        const calendarEndIso = calendarDays[calendarDays.length - 1] || todayIso;
        const visibleDayCount = Math.max(calendarDayWindow, isCalendarDragZoomActive ? CALENDAR_DRAG_ZOOM_VISIBLE_DAYS : 0);
        const isCompactCalendarView = visibleDayCount >= CALENDAR_DRAG_ZOOM_VISIBLE_DAYS;
        const rawDayColumnWidth = Math.round((calendarViewportWidth || (isDesktop ? 720 : 330)) / Math.max(visibleDayCount, 1));
        const dayColumnWidth = Math.max(rawDayColumnWidth, CALENDAR_MIN_DAY_COLUMN_WIDTH);
        const desiredCalendarHalfViewport = Math.max(Math.round(calendarViewportHeight / 2), 0);
        const clampedNowLineTop = Math.max(0, Math.min(CALENDAR_TOTAL_HEIGHT, Number(nowLineTop) || 0));
        const calendarVerticalTopPadding = Math.max(desiredCalendarHalfViewport - clampedNowLineTop, 0);
        const calendarVerticalBottomPadding = Math.max(desiredCalendarHalfViewport - (CALENDAR_TOTAL_HEIGHT - clampedNowLineTop), 0);
        const usesTouchLikeInput = hasTouchLikeInput();
        const allowNativeCalendarDrag = false;
        const taskMap = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks]);
        const resolvedTaskProjectIds = useMemo(() => buildResolvedTaskProjectMap(state.tasks, state.projects), [state.tasks, state.projects]);
        const parentTaskIdsWithChildren = useMemo(() => buildParentTaskIdsWithChildren(state.tasks), [state.tasks]);

        const setCalendarDragZoom = (value) => {
            setIsCalendarDragZoomActive((current) => (current === value ? current : value));
        };

        useEffect(() => {
            headerDropStateRef.current = headerDropState;
        }, [headerDropState]);

        const shouldSuppressCalendarClick = () => suppressCalendarClickUntilRef.current > Date.now();

        const suppressCalendarClick = () => {
            suppressCalendarClickUntilRef.current = Date.now() + 420;
        };

        const resolveHeaderDropMode = (payload) => (payload?.type === 'slot' ? 'unschedule' : 'task');

        const applyHeaderDropState = (day, payload) => {
            const nextMode = resolveHeaderDropMode(payload);
            const currentState = headerDropStateRef.current;
            if (currentState.day === day && currentState.mode === nextMode) return;
            setHeaderDropState((current) => {
                if (current.day === day && current.mode === nextMode) return current;
                return { day, mode: nextMode };
            });
        };

        const clearHeaderDropState = () => {
            const currentState = headerDropStateRef.current;
            if (!currentState.day && !currentState.mode) return;
            setHeaderDropState((current) => {
                if (!current.day && !current.mode) return current;
                return { day: '', mode: '' };
            });
        };

        const buildCalendarCellDropPreview = (day, hour, payload, subHourMinutes) => {
            if (!day || hour == null || !isPlanningCalendarDragPayload(payload)) return null;

            const start = resolveCalendarCellStart(day, hour, subHourMinutes);

            if (payload.type === 'slot' && payload.slotId) {
                const slot = state.slots.find((entry) => entry.id === payload.slotId);
                if (!slot) return null;

                const linkedTask = slot.taskId ? taskMap.get(slot.taskId) : null;
                const durationMinutes = Math.max(30, getCalendarDisplayEndMinutes(slot) - getCalendarDisplayMinutes(slot.startTime));
                const endTime = formatClockTime(timeToMinutes(start.time) + durationMinutes);
                const metrics = buildSlotMetrics({
                    startTime: start.time,
                    endTime,
                });
                const appearance = resolveCalendarSlotAppearance(day, yesterdayIso, linkedTask, state.projects, null);

                return {
                    day,
                    hour,
                    kind: 'slot',
                    top: metrics.top,
                    height: metrics.height,
                    startTimeLabel: start.time,
                    title: linkedTask?.title || slot.title || 'Событие',
                    parentGroupLabel: linkedTask ? buildTaskParentGroupLabel(linkedTask, taskMap) : '',
                    timeLabel: start.time + '–' + endTime,
                    accentColor: getTaskProjectColor(linkedTask || {}, state.projects),
                    background: appearance.color,
                };
            }

            if (payload.type === 'task' && payload.taskId) {
                const task = state.tasks.find((entry) => entry.id === payload.taskId);
                if (!task) return null;

                const durationMinutes = getTaskDurationMinutes(task);
                const endTime = formatClockTime(timeToMinutes(start.time) + durationMinutes);
                const metrics = buildSlotMetrics({
                    startTime: start.time,
                    endTime,
                });

                return {
                    day,
                    hour,
                    kind: 'task',
                    top: metrics.top,
                    height: metrics.height,
                    startTimeLabel: start.time,
                    title: task.title,
                    parentGroupLabel: buildTaskParentGroupLabel(task, taskMap),
                    timeLabel: start.time + '–' + endTime,
                    accentColor: getTaskProjectColor(task, state.projects),
                    background: '',
                };
            }

            return null;
        };

        const applyCalendarCellDropPreview = (day, hour, payload, subHourMinutes) => {
            const nextPreview = buildCalendarCellDropPreview(day, hour, payload, subHourMinutes);
            setCalendarCellDropPreview((current) => {
                if (!nextPreview) return current ? null : current;
                if (
                    current
                    && current.day === nextPreview.day
                    && current.hour === nextPreview.hour
                    && current.kind === nextPreview.kind
                    && current.top === nextPreview.top
                    && current.height === nextPreview.height
                    && current.startTimeLabel === nextPreview.startTimeLabel
                    && current.title === nextPreview.title
                    && current.parentGroupLabel === nextPreview.parentGroupLabel
                    && current.timeLabel === nextPreview.timeLabel
                    && current.accentColor === nextPreview.accentColor
                    && current.background === nextPreview.background
                ) {
                    return current;
                }
                return nextPreview;
            });
        };

        const clearCalendarCellDropPreview = () => {
            setCalendarCellDropPreview((current) => (current ? null : current));
        };

        const clearCalendarDropCommitAccent = () => {
            if (dropCommitAccentTimerRef.current) {
                window.clearTimeout(dropCommitAccentTimerRef.current);
                dropCommitAccentTimerRef.current = 0;
            }
            setCalendarDropCommitAccent((current) => (current ? null : current));
        };

        const flashCalendarDropCommitAccent = (day, hour, subHourMinutes) => {
            if (!day || hour == null) return;

            const start = resolveCalendarCellStart(day, hour, subHourMinutes);
            const markerMetrics = buildSlotMetrics({
                startTime: start.time,
                endTime: formatClockTime(timeToMinutes(start.time) + 30),
            });

            if (dropCommitAccentTimerRef.current) {
                window.clearTimeout(dropCommitAccentTimerRef.current);
                dropCommitAccentTimerRef.current = 0;
            }

            setCalendarDropCommitAccent({
                day,
                hour,
                top: markerMetrics.top,
                timeLabel: start.time,
            });

            dropCommitAccentTimerRef.current = window.setTimeout(() => {
                dropCommitAccentTimerRef.current = 0;
                setCalendarDropCommitAccent(null);
            }, 1280);
        };

        const stopCalendarTouchAutoScroll = () => {
            if (!touchDragAutoScrollFrameRef.current) return;
            window.cancelAnimationFrame(touchDragAutoScrollFrameRef.current);
            touchDragAutoScrollFrameRef.current = 0;
        };

        const resolveCalendarDropTargetFromPoint = (clientX, clientY) => {
            const currentDayWidth = Math.max(dayColumnWidthRef.current || dayColumnWidth || 1, 1);
            const currentCalendarDays = calendarDaysRef.current || calendarDays;
            const horizontalScrollLeft = gridScrollRef.current?.scrollLeft || 0;

            const headerNode = headerRef.current;
            if (headerNode) {
                const headerRect = headerNode.getBoundingClientRect();
                const withinHeaderX = clientX >= headerRect.left && clientX <= headerRect.right;
                const withinHeaderY = clientY >= headerRect.top && clientY <= headerRect.bottom;

                if (withinHeaderX && withinHeaderY) {
                    const relativeX = clientX - headerRect.left + horizontalScrollLeft;
                    const dayIndex = Math.floor(relativeX / currentDayWidth);
                    const day = currentCalendarDays[dayIndex];
                    if (day) return { type: 'header', day };
                }
            }

            const bodyNode = bodyScrollRef.current;
            const gridNode = gridScrollRef.current;
            if (!bodyNode || !gridNode) return null;

            const bodyRect = bodyNode.getBoundingClientRect();
            const gridRect = gridNode.getBoundingClientRect();
            const withinBodyX = clientX >= bodyRect.left && clientX <= bodyRect.right;
            const withinBodyY = clientY >= gridRect.top && clientY <= gridRect.bottom;
            if (!withinBodyX || !withinBodyY) return null;

            const relativeX = clientX - bodyRect.left + bodyNode.scrollLeft;
            const dayIndex = Math.floor(relativeX / currentDayWidth);
            const day = currentCalendarDays[dayIndex];
            if (!day) return null;

            const stickyHeaderHeight = headerRef.current ? headerRef.current.getBoundingClientRect().height : 0;
            const relativeY = clientY - bodyRect.top - stickyHeaderHeight + gridNode.scrollTop;
            const hourIndex = Math.max(0, Math.min(HOURS.length - 1, Math.floor(relativeY / CALENDAR_HOUR_HEIGHT)));
            const withinCellY = relativeY - (hourIndex * CALENDAR_HOUR_HEIGHT);
            const subHourMinutes = Math.round((withinCellY / CALENDAR_HOUR_HEIGHT) * 60 / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
            return {
                type: 'cell',
                day,
                hour: HOURS[hourIndex],
                subHourMinutes: Math.max(0, Math.min(45, subHourMinutes)),
            };
        };

        const resolveHeaderDropContext = (payload) => {
            if (payload?.type === 'task' && payload.taskId) {
                const task = state.tasks.find((entry) => entry.id === payload.taskId);
                return task ? { task, slot: null } : null;
            }

            if (payload?.type === 'slot' && payload.slotId) {
                const slot = state.slots.find((entry) => entry.id === payload.slotId);
                if (!slot?.taskId) return null;

                const task = state.tasks.find((entry) => entry.id === slot.taskId);
                return task ? { task, slot } : null;
            }

            return null;
        };

        const canApplyDragPayloadToHeaderDay = (payload) => (
            (payload?.type === 'task' && !!payload.taskId)
            || (payload?.type === 'slot' && !!payload.slotId)
        );

        const syncTouchDragDropState = (active, clientX, clientY) => {
            const dropTarget = resolveCalendarDropTargetFromPoint(clientX, clientY);

            if (canApplyDragPayloadToHeaderDay(active?.payload) && dropTarget?.type === 'header') {
                applyHeaderDropState(dropTarget.day, active?.payload);
                clearCalendarCellDropPreview();
            } else {
                clearHeaderDropState();
            }

            if (isPlanningCalendarDragPayload(active?.payload) && dropTarget?.type === 'cell') {
                applyCalendarCellDropPreview(dropTarget.day, dropTarget.hour, active?.payload, dropTarget.subHourMinutes);
            } else {
                clearCalendarCellDropPreview();
            }

            return dropTarget;
        };

        const applyDragPayloadToHeaderDay = (day, payload) => {
            const context = resolveHeaderDropContext(payload);
            if (!context?.task) return;

            const patch = buildTaskHeaderDayPatch(context.task, day, todayIso);
            if (patch) state.updateTask(context.task.id, patch);
            if (context.slot?.id) state.deleteSlot(context.slot.id);
        };

        const applyDragPayloadToCell = (date, hour, payload, subHourMinutes) => {
            if (!payload) return;
            const start = resolveCalendarCellStart(date, hour, subHourMinutes);
            const startTime = start.time;

            if (payload.type === 'slot' && payload.slotId) {
                const slot = state.slots.find((entry) => entry.id === payload.slotId);
                if (!slot) return;
                const duration = Math.max(30, getCalendarDisplayEndMinutes(slot) - getCalendarDisplayMinutes(slot.startTime));
                state.updateSlot(slot.id, {
                    date: start.date,
                    startTime,
                    endTime: formatClockTime(timeToMinutes(startTime) + duration),
                });
                return;
            }

            const task = state.tasks.find((entry) => entry.id === payload.taskId);
            if (!task) return;
            const duration = getTaskDurationMinutes(task);
            state.addSlot({
                taskId: task.id,
                date: start.date,
                startTime,
                endTime: formatClockTime(timeToMinutes(startTime) + duration),
                title: '',
            });
        };

        const maybeActivateCalendarDragZoomFromPoint = (clientX, payload) => {
            if (isCalendarDragZoomActiveRef.current) return;
            if (!isPlanningCalendarDragPayload(payload)) return;
            if (payload?.type === 'task' && calendarDayWindow < CALENDAR_DRAG_ZOOM_VISIBLE_DAYS) {
                // For header task drag on narrow view, keep density stable (no 3→8 relayout)
                // and rely on horizontal auto-scroll instead.
                return;
            }

            const scrollContainer = gridScrollRef.current;
            const containerRect = scrollContainer?.getBoundingClientRect?.();
            if (!containerRect) return;

            const edgeThreshold = Math.min(CALENDAR_DRAG_EDGE_THRESHOLD, Math.max(containerRect.width * 0.12, 24));
            const nearLeftEdge = clientX <= (containerRect.left + edgeThreshold);
            const nearRightEdge = clientX >= (containerRect.right - edgeThreshold);

            if (nearLeftEdge || nearRightEdge) {
                setCalendarDragZoom(true);
            }
        };

        const startCalendarTouchAutoScroll = () => {
            if (touchDragAutoScrollFrameRef.current) return;
            touchDragLayoutGenRef.current = 0;
            touchDragBodyRectRef.current = null;
            touchDragGridRectRef.current = null;

            const step = () => {
                const active = touchDragStateRef.current;
                if (!active || !active.activated) {
                    touchDragAutoScrollFrameRef.current = 0;
                    touchDragBodyRectRef.current = null;
                    touchDragGridRectRef.current = null;
                    return;
                }

                const bodyNode = bodyScrollRef.current;
                const gridNode = gridScrollRef.current;
                const gen = (touchDragLayoutGenRef.current += 1);
                const measureBody = gen === 1 || (gen % 2 === 1);
                const measureGrid = gen === 1 || (gen % 2 === 1);

                if (bodyNode) {
                    let rect = touchDragBodyRectRef.current;
                    if (measureBody || !rect) {
                        rect = bodyNode.getBoundingClientRect();
                        touchDragBodyRectRef.current = rect;
                    }
                    const edge = Math.min(CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE, Math.max(rect.width * 0.16, 28));
                    let deltaX = 0;

                    if (active.lastX <= rect.left + edge) {
                        deltaX = -resolveAutoScrollDelta(active.lastX - rect.left, edge);
                    } else if (active.lastX >= rect.right - edge) {
                        deltaX = resolveAutoScrollDelta(rect.right - active.lastX, edge);
                    }

                    if (Math.abs(deltaX) > 0.1) {
                        bodyNode.scrollLeft += deltaX;
                        touchDragBodyRectRef.current = null;
                        maybeActivateCalendarDragZoomFromPoint(active.lastX, active.payload);
                    }
                }

                if (gridNode) {
                    let rect = touchDragGridRectRef.current;
                    if (measureGrid || !rect) {
                        rect = gridNode.getBoundingClientRect();
                        touchDragGridRectRef.current = rect;
                    }
                    const edge = Math.min(CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE, Math.max(rect.height * 0.12, 24));
                    let deltaY = 0;
                    /* Only when the pointer is inside the grid vertically. If the finger is still in the
                       day header (above rect.top), the old "top edge" branch fired and scrolled the grid. */
                    if (active.lastY >= rect.top && active.lastY <= rect.top + edge) {
                        deltaY = -resolveAutoScrollDelta(active.lastY - rect.top, edge);
                    } else if (active.lastY <= rect.bottom && active.lastY >= rect.bottom - edge) {
                        deltaY = resolveAutoScrollDelta(rect.bottom - active.lastY, edge);
                    }

                    if (Math.abs(deltaY) > 0.1) {
                        gridNode.scrollTop += deltaY;
                        touchDragGridRectRef.current = null;
                    }
                }

                syncTouchDragDropState(active, active.lastX, active.lastY);
                touchDragAutoScrollFrameRef.current = window.requestAnimationFrame(step);
            };

            touchDragAutoScrollFrameRef.current = window.requestAnimationFrame(step);
        };

        const activateCalendarCustomDrag = (current) => {
            if (!current || current.activated) return;

            current.activated = true;
            maybeActivateCalendarDragZoomFromPoint(current.lastX, current.payload);
            try { navigator.vibrate?.(10); } catch (_e) { /* unsupported */ }
            setTouchDragSourceKey(current.sourceKey || '');

            let sourceHeight = 60;
            let sourceWidth = dayColumnWidth || 120;
            let grabOffsetX = 0;
            let grabOffsetY = 0;
            const sourceEl = current.targetNode;
            if (sourceEl) {
                const r = sourceEl.getBoundingClientRect();
                if (r.height > 0) sourceHeight = r.height;
                if (r.width > 0) sourceWidth = r.width;
                grabOffsetX = current.startX - r.left;
                grabOffsetY = current.startY - r.top;
            }

            setTouchDragPreview({
                kind: current.payload?.type === 'slot' ? 'slot' : 'task',
                title: current.title || '',
                badgeText: current.badgeText || '',
                parentGroupLabel: current.parentGroupLabel || '',
                accentColor: current.accentColor || '',
                background: current.background || '',
                x: current.lastX,
                y: current.lastY,
                height: sourceHeight,
                width: sourceWidth,
                grabOffsetX,
                grabOffsetY,
            });

            syncTouchDragDropState(current, current.lastX, current.lastY);
            startCalendarTouchAutoScroll();
        };

        const finishCalendarTouchDrag = ({ applyDrop, suppressClickAfterDrop, interactionEvent } = {}) => {
            const active = touchDragStateRef.current;
            if (!active) return;

            if (active.holdTimer) {
                window.clearTimeout(active.holdTimer);
                active.holdTimer = 0;
            }

            if (typeof active.handleTouchMove === 'function') {
                document.removeEventListener('touchmove', active.handleTouchMove, true);
            }
            if (typeof active.handleTouchMovePassive === 'function') {
                document.removeEventListener('touchmove', active.handleTouchMovePassive, true);
            }
            if (typeof active.handleTouchMoveActive === 'function') {
                document.removeEventListener('touchmove', active.handleTouchMoveActive, true);
            }
            if (typeof active.handleTouchEnd === 'function') {
                document.removeEventListener('touchend', active.handleTouchEnd, true);
            }
            if (typeof active.handleTouchCancel === 'function') {
                document.removeEventListener('touchcancel', active.handleTouchCancel, true);
            }
            if (typeof active.handlePointerMove === 'function') {
                window.removeEventListener('pointermove', active.handlePointerMove);
            }
            if (typeof active.handlePointerUp === 'function') {
                window.removeEventListener('pointerup', active.handlePointerUp);
            }
            if (typeof active.handlePointerCancel === 'function') {
                window.removeEventListener('pointercancel', active.handlePointerCancel);
            }

            if (
                active.pointerId != null
                && active.targetNode
                && typeof active.targetNode.releasePointerCapture === 'function'
            ) {
                try {
                    active.targetNode.releasePointerCapture(active.pointerId);
                } catch (error) {
                    // ignore
                }
            }

            stopCalendarTouchAutoScroll();

            if (interactionEvent) {
                if (typeof interactionEvent.clientX === 'number' || typeof interactionEvent.clientY === 'number') {
                    active.lastX = Number(interactionEvent.clientX) || active.lastX;
                    active.lastY = Number(interactionEvent.clientY) || active.lastY;
                } else {
                    const point = getTouchEventPoint(interactionEvent, active.touchId);
                    if (point) {
                        active.lastX = Number(point.clientX) || active.lastX;
                        active.lastY = Number(point.clientY) || active.lastY;
                    }
                }
            }

            const dropTarget = active.activated
                ? resolveCalendarDropTargetFromPoint(active.lastX, active.lastY)
                : null;

            touchDragStateRef.current = null;
            setTouchDragPreview(null);
            setTouchDragSourceKey('');
            clearHeaderDropState();
            clearCalendarCellDropPreview();
            setCalendarDragZoom(false);

            if (active.activated && typeof active.onDragStateChange === 'function') {
                active.onDragStateChange(false);
            }

            if (active.activated && suppressClickAfterDrop) {
                suppressCalendarClick();
            }

            if (!applyDrop || !active.activated || !dropTarget) return;
            if (dropTarget.type === 'header') {
                clearCalendarDropCommitAccent();
                applyDragPayloadToHeaderDay(dropTarget.day, active.payload);
                return;
            }
            if (dropTarget.type === 'cell') {
                applyDragPayloadToCell(dropTarget.day, dropTarget.hour, active.payload, dropTarget.subHourMinutes);
                flashCalendarDropCommitAccent(dropTarget.day, dropTarget.hour, dropTarget.subHourMinutes);
            }
        };

        const handleCalendarTouchStart = ({
            event,
            payload,
            sourceKey,
            title,
            badgeText,
            parentGroupLabel,
            accentColor,
            background,
            onDragStateChange,
        }) => {
            const touchPoint = event?.touches?.[0];
            if (!touchPoint || (event?.touches?.length || 0) !== 1) return;

            /* Pointer Events handle touch on modern browsers; legacy path = long-press only */
            if (typeof window.PointerEvent === 'function') return;

            finishCalendarTouchDrag();

            const targetNode = event.currentTarget;
            const clientX = Number(touchPoint.clientX) || 0;
            const clientY = Number(touchPoint.clientY) || 0;
            const active = {
                payload,
                sourceKey,
                title,
                badgeText,
                parentGroupLabel,
                accentColor,
                background,
                onDragStateChange,
                touchId: touchPoint.identifier,
                targetNode,
                startX: clientX,
                startY: clientY,
                lastX: clientX,
                lastY: clientY,
                activated: false,
                useMoveToActivate: payload?.type === 'task',
                holdTimer: 0,
                handleTouchMove: null,
                handleTouchMovePassive: null,
                handleTouchMoveActive: null,
                handleTouchEnd: null,
                handleTouchCancel: null,
                handlePointerMove: null,
                handlePointerUp: null,
                handlePointerCancel: null,
            };

            const activateTouchDrag = () => {
                const current = touchDragStateRef.current;
                if (!current || current !== active || current.activated) return;

                if (typeof current.handleTouchMovePassive === 'function') {
                    document.removeEventListener('touchmove', current.handleTouchMovePassive, true);
                }
                if (typeof current.handleTouchMoveActive === 'function') {
                    document.addEventListener('touchmove', current.handleTouchMoveActive, { passive: false, capture: true });
                }

                activateCalendarCustomDrag(current);
            };

            active.handleTouchMovePassive = (moveEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;

                const point = getTouchEventPoint(moveEvent, current.touchId);
                if (!point) return;

                const nextX = Number(point.clientX) || 0;
                const nextY = Number(point.clientY) || 0;
                current.lastX = nextX;
                current.lastY = nextY;

                if (!current.activated) {
                    const distance = Math.hypot(nextX - current.startX, nextY - current.startY);
                    if (current.useMoveToActivate) {
                        if (distance >= CALENDAR_POINTER_DRAG_MOVE_THRESHOLD) {
                            activateTouchDrag();
                        }
                    } else if (distance > CALENDAR_TOUCH_DRAG_MOVE_CANCEL_THRESHOLD) {
                        finishCalendarTouchDrag({ applyDrop: false, suppressClickAfterDrop: false });
                    }
                }

                if (current.activated) return;
            };

            active.handleTouchMoveActive = (moveEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active || !current.activated) return;

                const point = getTouchEventPoint(moveEvent, current.touchId);
                if (!point) return;

                const nextX = Number(point.clientX) || 0;
                const nextY = Number(point.clientY) || 0;
                current.lastX = nextX;
                current.lastY = nextY;

                if (moveEvent.cancelable) moveEvent.preventDefault();
                maybeActivateCalendarDragZoomFromPoint(nextX, current.payload);
                syncTouchDragDropState(current, nextX, nextY);

                setTouchDragPreview((preview) => {
                    if (!preview) return preview;
                    if (preview.x === nextX && preview.y === nextY) return preview;
                    return {
                        ...preview,
                        x: nextX,
                        y: nextY,
                    };
                });
            };

            active.handleTouchMove = active.handleTouchMoveActive;

            active.handleTouchEnd = (touchEndEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;
                const point = getTouchEventPoint(touchEndEvent, current.touchId);
                if (!point && current.activated) return;

                finishCalendarTouchDrag({
                    applyDrop: true,
                    suppressClickAfterDrop: current.activated,
                    interactionEvent: touchEndEvent,
                });
            };

            active.handleTouchCancel = (touchCancelEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;
                const point = getTouchEventPoint(touchCancelEvent, current.touchId);
                if (!point && current.activated) return;

                finishCalendarTouchDrag({
                    applyDrop: false,
                    suppressClickAfterDrop: false,
                    interactionEvent: touchCancelEvent,
                });
            };

            if (active.useMoveToActivate) {
                // Task pills from calendar header: immediate touch drag, no long press.
                touchDragStateRef.current = active;
                document.addEventListener('touchmove', active.handleTouchMoveActive, { passive: false, capture: true });
                document.addEventListener('touchend', active.handleTouchEnd, { passive: true, capture: true });
                document.addEventListener('touchcancel', active.handleTouchCancel, { passive: true, capture: true });
                activateCalendarCustomDrag(active);
                return;
            }

            active.holdTimer = window.setTimeout(activateTouchDrag, CALENDAR_TOUCH_DRAG_HOLD_MS);
            touchDragStateRef.current = active;

            document.addEventListener('touchmove', active.handleTouchMovePassive, { passive: true, capture: true });
            document.addEventListener('touchend', active.handleTouchEnd, { passive: true, capture: true });
            document.addEventListener('touchcancel', active.handleTouchCancel, { passive: true, capture: true });
        };

        const handleCalendarPointerDragStart = ({
            event,
            payload,
            sourceKey,
            title,
            badgeText,
            parentGroupLabel,
            accentColor,
            background,
            onDragStateChange,
        }) => {
            const pointerType = String(event?.pointerType || '').toLowerCase();
            if (event.button != null && event.button !== 0) return;

            /* Touch/pen: defer preventDefault until drag activates so scroll still works from a slot */
            if (pointerType === 'mouse' && event.cancelable) event.preventDefault();

            finishCalendarTouchDrag();

            const targetNode = event.currentTarget;
            const clientX = Number(event.clientX) || 0;
            const clientY = Number(event.clientY) || 0;
            const active = {
                payload,
                sourceKey,
                title,
                badgeText,
                parentGroupLabel,
                accentColor,
                background,
                onDragStateChange,
                pointerId: event.pointerId,
                targetNode,
                startX: clientX,
                startY: clientY,
                lastX: clientX,
                lastY: clientY,
                activated: false,
                useMoveToActivate: payload?.type === 'task',
                holdTimer: 0,
                handleTouchMove: null,
                handleTouchMovePassive: null,
                handleTouchMoveActive: null,
                handleTouchEnd: null,
                handleTouchCancel: null,
                handlePointerMove: null,
                handlePointerUp: null,
                handlePointerCancel: null,
            };

            const isTouchLike = pointerType === 'touch' || pointerType === 'pen';

            if (!isTouchLike && active.pointerId != null && targetNode && typeof targetNode.setPointerCapture === 'function') {
                try {
                    targetNode.setPointerCapture(active.pointerId);
                } catch (error) {
                    // ignore
                }
            }

            const removeHoldVisual = () => {
                if (targetNode) targetNode.classList.remove('planning-calendar-slot--hold-active');
            };

            const clearSlotHoldTimer = () => {
                if (active.holdTimer) { window.clearTimeout(active.holdTimer); active.holdTimer = 0; }
                removeHoldVisual();
            };

            if (isTouchLike && !active.useMoveToActivate) {
                targetNode.classList.add('planning-calendar-slot--hold-active');

                active.holdTimer = window.setTimeout(() => {
                    active.holdTimer = 0;
                    const current = touchDragStateRef.current;
                    if (!current || current !== active || current.activated) return;
                    removeHoldVisual();
                    if (gridScrollRef.current) gridScrollRef.current.style.touchAction = 'none';
                    if (active.pointerId != null && targetNode && typeof targetNode.setPointerCapture === 'function') {
                        try { targetNode.setPointerCapture(active.pointerId); } catch (_e) { /* ignore */ }
                    }
                    activateCalendarCustomDrag(current);
                    syncTouchDragDropState(current, current.lastX, current.lastY);
                }, CALENDAR_TOUCH_DRAG_HOLD_MS);
            }

            active.handlePointerMove = (moveEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;
                if (current.pointerId != null && moveEvent.pointerId != null && current.pointerId !== moveEvent.pointerId) return;

                const nextX = Number(moveEvent.clientX) || 0;
                const nextY = Number(moveEvent.clientY) || 0;
                current.lastX = nextX;
                current.lastY = nextY;

                if (!current.activated) {
                    const distance = Math.hypot(nextX - current.startX, nextY - current.startY);
                    if (isTouchLike) {
                        if (current.useMoveToActivate) {
                            if (distance < CALENDAR_POINTER_DRAG_MOVE_THRESHOLD) return;
                            if (gridScrollRef.current) gridScrollRef.current.style.touchAction = 'none';
                            if (current.pointerId != null && targetNode && typeof targetNode.setPointerCapture === 'function') {
                                try { targetNode.setPointerCapture(current.pointerId); } catch (_e) { /* ignore */ }
                            }
                            activateCalendarCustomDrag(current);
                            syncTouchDragDropState(current, current.lastX, current.lastY);
                        } else if (distance >= CALENDAR_TOUCH_DRAG_MOVE_CANCEL_THRESHOLD) {
                            clearSlotHoldTimer();
                            finishCalendarTouchDrag({ applyDrop: false, suppressClickAfterDrop: false });
                        }
                        if (!current.activated) return;
                    }
                    if (!current.activated) {
                        if (distance < CALENDAR_POINTER_DRAG_MOVE_THRESHOLD) return;
                        activateCalendarCustomDrag(current);
                    }
                }

                if (moveEvent.cancelable) moveEvent.preventDefault();
                maybeActivateCalendarDragZoomFromPoint(nextX, current.payload);
                syncTouchDragDropState(current, nextX, nextY);

                setTouchDragPreview((preview) => {
                    if (!preview) return preview;
                    if (preview.x === nextX && preview.y === nextY) return preview;
                    return { ...preview, x: nextX, y: nextY };
                });
            };

            active.handlePointerUp = (pointerUpEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;
                if (current.pointerId != null && pointerUpEvent.pointerId != null && current.pointerId !== pointerUpEvent.pointerId) return;

                clearSlotHoldTimer();
                if (isTouchLike && gridScrollRef.current) gridScrollRef.current.style.touchAction = '';
                finishCalendarTouchDrag({
                    applyDrop: current.activated,
                    suppressClickAfterDrop: current.activated,
                    interactionEvent: pointerUpEvent,
                });
            };

            active.handlePointerCancel = (pointerCancelEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;
                if (current.pointerId != null && pointerCancelEvent.pointerId != null && current.pointerId !== pointerCancelEvent.pointerId) return;

                clearSlotHoldTimer();
                if (isTouchLike && gridScrollRef.current) gridScrollRef.current.style.touchAction = '';
                finishCalendarTouchDrag({
                    applyDrop: false,
                    suppressClickAfterDrop: false,
                    interactionEvent: pointerCancelEvent,
                });
            };

            touchDragStateRef.current = active;
            if (isTouchLike && active.useMoveToActivate) {
                if (gridScrollRef.current) gridScrollRef.current.style.touchAction = 'none';
                if (active.pointerId != null && targetNode && typeof targetNode.setPointerCapture === 'function') {
                    try { targetNode.setPointerCapture(active.pointerId); } catch (_e) { /* ignore */ }
                }
                activateCalendarCustomDrag(active);
                syncTouchDragDropState(active, active.lastX, active.lastY);
            }
            window.addEventListener('pointermove', active.handlePointerMove, { passive: false });
            window.addEventListener('pointerup', active.handlePointerUp);
            window.addEventListener('pointercancel', active.handlePointerCancel);
        };

        const maybeActivateCalendarDragZoom = (event) => {
            const payload = parsePlanningDragPayload(event);
            maybeActivateCalendarDragZoomFromPoint(event.clientX, payload);
        };

        dayColumnWidthRef.current = dayColumnWidth;
        calendarDaysRef.current = calendarDays;
        isCalendarDragZoomActiveRef.current = isCalendarDragZoomActive;

        useEffect(() => {
            const measure = () => {
                const width = gridScrollRef.current?.clientWidth || 0;
                const height = gridScrollRef.current?.clientHeight || 0;
                if (width) setCalendarViewportWidth(width);
                if (height) setCalendarViewportHeight(height);
                setCalendarWindowScrollTick((tick) => tick + 1);
            };

            measure();
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }, []);

        useEffect(() => {
            const gridNode = gridScrollRef.current;
            if (!gridNode || typeof ResizeObserver !== 'function') return undefined;

            const resizeObserver = new ResizeObserver(() => {
                const nextHeight = gridNode.clientHeight || 0;
                setCalendarViewportHeight((current) => (current === nextHeight ? current : nextHeight));
                setCalendarWindowScrollTick((tick) => tick + 1);
            });

            resizeObserver.observe(gridNode);
            return () => resizeObserver.disconnect();
        }, []);

        useEffect(() => {
            if (!gridScrollRef.current) {
                previousDayWidthRef.current = dayColumnWidth;
                return;
            }

            const previousDayWidth = previousDayWidthRef.current;
            if (!previousDayWidth || previousDayWidth === dayColumnWidth) {
                previousDayWidthRef.current = dayColumnWidth;
                return;
            }

            const scrollNode = gridScrollRef.current;
            const nextScrollLeft = (scrollNode.scrollLeft / previousDayWidth) * dayColumnWidth;
            scrollNode.scrollLeft = nextScrollLeft;
            previousDayWidthRef.current = dayColumnWidth;
            calendarWindowBoundsRef.current = { firstIdx: -1, lastIdx: -1 };
            setCalendarWindowScrollTick((tick) => tick + 1);
        }, [dayColumnWidth]);

        useEffect(() => {
            try {
                localStorage.setItem(CALENDAR_DAY_WINDOW_STORAGE_KEY, String(calendarDayWindow));
            } catch (error) {
                // ignore
            }
        }, [calendarDayWindow]);

        useEffect(() => {
            const deactivateDragZoom = () => {
                setCalendarDragZoom(false);
                clearHeaderDropState();
                clearCalendarCellDropPreview();
            };

            window.addEventListener('dragend', deactivateDragZoom);
            window.addEventListener('drop', deactivateDragZoom, true);

            return () => {
                window.removeEventListener('dragend', deactivateDragZoom);
                window.removeEventListener('drop', deactivateDragZoom, true);
            };
        }, []);

        useEffect(() => () => {
            clearCalendarDropCommitAccent();
            finishCalendarTouchDrag({ applyDrop: false, suppressClickAfterDrop: false });
            stopCalendarTouchAutoScroll();
        }, []);

        useEffect(() => {
            const handleKeyDown = (event) => {
                if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA' || event.target?.tagName === 'SELECT') return;
                if (event.target?.isContentEditable) return;
                if (event.key === 'ArrowLeft') { scrollCalendarByDays(-visibleDayCount); event.preventDefault(); }
                else if (event.key === 'ArrowRight') { scrollCalendarByDays(visibleDayCount); event.preventDefault(); }
                else if (event.key === 't' || event.key === 'T' || event.key === 'е' || event.key === 'Е') { scrollCalendarToTodayWindow(); event.preventDefault(); }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [visibleDayCount, dayColumnWidth]);

        /* Header is now sticky inside the unified scroll container — no measurement needed */

        useEffect(() => {
            const updateNowLine = () => setNowLineTop(getCalendarNowTop());

            updateNowLine();
            const intervalId = window.setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden) return;
                updateNowLine();
            }, 60_000);
            const onVis = () => {
                if (typeof document !== 'undefined' && !document.hidden) updateNowLine();
            };
            document.addEventListener('visibilitychange', onVis);
            return () => {
                window.clearInterval(intervalId);
                document.removeEventListener('visibilitychange', onVis);
            };
        }, []);

        useEffect(() => {
            if (!shouldCenterNow || !calendarViewportWidth || !calendarViewportHeight) return undefined;

            let frameId = 0;
            let retryFrameId = 0;
            let attempts = 0;
            let disposed = false;

            const tryCenterNowLine = () => {
                if (disposed) return;

                const lineElement = nowLineRef.current;
                const headerElement = headerRef.current;
                const scrollContainer = gridScrollRef.current;

                if (!lineElement) {
                    if (attempts >= 6) {
                        setShouldCenterNow(false);
                        return;
                    }
                    attempts += 1;
                    retryFrameId = window.requestAnimationFrame(tryCenterNowLine);
                    return;
                }

                centerCalendarNowLine(lineElement, headerElement, scrollContainer);
                const delta = getCalendarCenterDelta(lineElement, headerElement, scrollContainer);

                if (Math.abs(delta) <= 8) {
                    console.info('[HEYS.planning] Centered calendar on current time', { delta });
                    setShouldCenterNow(false);
                    return;
                }

                if (attempts >= 6) {
                    console.info('[HEYS.planning] Calendar now-line centering stopped with residual delta', { delta });
                    setShouldCenterNow(false);
                    return;
                }

                attempts += 1;
                retryFrameId = window.requestAnimationFrame(tryCenterNowLine);
            };

            frameId = window.requestAnimationFrame(() => {
                retryFrameId = window.requestAnimationFrame(tryCenterNowLine);
            });

            return () => {
                disposed = true;
                window.cancelAnimationFrame(frameId);
                window.cancelAnimationFrame(retryFrameId);
            };
        }, [calendarViewportWidth, calendarViewportHeight, shouldCenterNow]);

        const onCalendarGridScroll = () => {
            if (calendarBodyScrollRafRef.current) return;
            calendarBodyScrollRafRef.current = window.requestAnimationFrame(() => {
                calendarBodyScrollRafRef.current = 0;
                const node = gridScrollRef.current;
                if (!node) return;
                const colW = Math.max(dayColumnWidthRef.current || dayColumnWidth || 1, 1);
                const vw = node.clientWidth || colW;
                const sl = node.scrollLeft;
                const overscan = CALENDAR_WINDOW_OVERSCAN_DAYS;
                let fi = Math.floor(sl / colW) - overscan;
                fi = Math.max(0, fi);
                const colsNeeded = Math.max(1, Math.ceil(vw / colW) + overscan * 2 + 2);
                const li = fi + colsNeeded;
                const prev = calendarWindowBoundsRef.current;
                if (prev.firstIdx === fi && prev.lastIdx === li) return;
                calendarWindowBoundsRef.current = { firstIdx: fi, lastIdx: li };
                setCalendarWindowScrollTick((tick) => tick + 1);
            });
        };

        const scrollCalendarByDays = (days) => {
            if (!gridScrollRef.current) return;
            gridScrollRef.current.scrollBy({ left: dayColumnWidth * days, behavior: 'smooth' });
        };

        const scrollCalendarToTodayWindow = () => {
            if (!gridScrollRef.current) return;
            gridScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
            setShouldCenterNow(true);
        };

        const handleDropToHeaderDay = (day, event) => {
            event.preventDefault();
            setCalendarDragZoom(false);
            clearHeaderDropState();
            clearCalendarCellDropPreview();
            clearCalendarDropCommitAccent();
            const payload = parsePlanningDragPayload(event);
            applyDragPayloadToHeaderDay(day, payload);
        };

        useEffect(() => {
            const finishResizeInteraction = () => {
                const active = resizeStateRef.current;
                if (!active) return;

                if (
                    active.pointerId != null
                    && active.targetNode
                    && typeof active.targetNode.releasePointerCapture === 'function'
                ) {
                    try {
                        active.targetNode.releasePointerCapture(active.pointerId);
                    } catch (error) {
                        // ignore
                    }
                }

                if (resizePreview?.slotId === active.slotId) {
                    const patch = {};
                    if (resizePreview.date && resizePreview.date !== active.originalDate) patch.date = resizePreview.date;
                    if (resizePreview.startTime && resizePreview.startTime !== active.originalStartTime) patch.startTime = resizePreview.startTime;
                    if (resizePreview.endTime && resizePreview.endTime !== active.originalEndTime) patch.endTime = resizePreview.endTime;
                    if (Object.keys(patch).length) state.updateSlot(active.slotId, patch);
                }

                resizeStateRef.current = null;
                setResizePreview(null);
            };

            const handlePointerMove = (event) => {
                const active = resizeStateRef.current;
                if (!active) return;
                if (active.pointerId != null && event.pointerId != null && active.pointerId !== event.pointerId) return;
                const halfHourHeight = CALENDAR_HOUR_HEIGHT / 2;
                const deltaSteps = Math.round((event.clientY - active.startY) / halfHourHeight);
                const nextDeltaMinutes = deltaSteps * 30;

                if (active.edge === 'start') {
                    const nextStartMinutes = Math.max(
                        CALENDAR_START_HOUR * 60,
                        Math.min(active.endMinutes - 30, active.startMinutes + nextDeltaMinutes),
                    );
                    const nextStart = resolveCalendarDisplayDateTime(active.displayDate, nextStartMinutes);
                    setResizePreview({
                        slotId: active.slotId,
                        date: nextStart.date,
                        startTime: nextStart.time,
                        endTime: active.originalEndTime,
                    });
                    return;
                }

                const nextEndMinutes = Math.max(active.startMinutes + 30, active.endMinutes + nextDeltaMinutes);
                setResizePreview({
                    slotId: active.slotId,
                    date: active.originalDate,
                    startTime: active.originalStartTime,
                    endTime: formatClockTime(nextEndMinutes),
                });
            };

            const handlePointerUp = (event) => {
                const active = resizeStateRef.current;
                if (!active) return;
                if (active.pointerId != null && event.pointerId != null && active.pointerId !== event.pointerId) return;
                finishResizeInteraction();
            };

            const handlePointerCancel = (event) => {
                const active = resizeStateRef.current;
                if (!active) return;
                if (active.pointerId != null && event.pointerId != null && active.pointerId !== event.pointerId) return;
                finishResizeInteraction();
            };

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            window.addEventListener('pointercancel', handlePointerCancel);
            return () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
                window.removeEventListener('pointercancel', handlePointerCancel);
            };
        }, [resizePreview, state]);

        const slotsByDay = useMemo(() => {
            const map = {};
            calendarDays.forEach((day) => { map[day] = []; });
            state.slots.forEach((slot) => {
                const displayDate = getCalendarDisplayDate(slot);
                if (map[displayDate]) map[displayDate].push(slot);
            });
            Object.keys(map).forEach((key) => {
                map[key] = map[key].slice().sort((left, right) => getCalendarDisplayMinutes(left.startTime) - getCalendarDisplayMinutes(right.startTime));
            });
            return map;
        }, [calendarDays, state.slots]);

        const unscheduledTasks = useMemo(() => state.tasks.filter((task) => {
            if (task.status === 'done' || task.status === 'cancelled') return false;
            if (parentTaskIdsWithChildren.has(task.id)) return false;
            return !state.slots.some((slot) => slot.taskId === task.id);
        }), [parentTaskIdsWithChildren, state.tasks, state.slots]);

        const unscheduledTasksByDay = useMemo(() => {
            const map = {};
            calendarDays.forEach((day) => { map[day] = []; });
            unscheduledTasks.forEach((task) => {
                const day = getTaskCalendarAnchorDate(task, todayIso, calendarStartIso, calendarEndIso);
                if (!map[day]) map[day] = [];
                map[day].push(task);
            });
            return map;
        }, [calendarDays, unscheduledTasks, todayIso, calendarStartIso, calendarEndIso]);

        const moveYesterdayUnscheduledToToday = () => {
            const tasks = unscheduledTasksByDay[yesterdayIso] || [];
            if (!tasks.length) return;
            let moved = 0;
            tasks.forEach((task) => {
                const patch = buildTaskHeaderDayPatch(task, todayIso, todayIso);
                if (patch) {
                    state.updateTask(task.id, patch);
                    moved += 1;
                }
            });
            suppressCalendarClick();
            if (moved && typeof console !== 'undefined' && typeof console.info === 'function') {
                console.info('[HEYS.planning.calendar] Moved ' + moved + ' unscheduled task(s) from yesterday to today');
            }
        };

        const dayOccupancyByDay = useMemo(() => {
            const map = {};
            calendarDays.forEach((day) => {
                const daySlots = slotsByDay[day] || [];
                const totalMinutes = daySlots.reduce((sum, slot) => {
                    return sum + Math.max(30, getCalendarDisplayEndMinutes(slot) - getCalendarDisplayMinutes(slot.startTime));
                }, 0);
                const level = Math.max(0, Math.min(4, Math.ceil(totalMinutes / 180)));
                let pressureTone = 'free';
                let pressureLabel = '';
                if (totalMinutes === 0) { pressureTone = 'free'; pressureLabel = ''; }
                else if (totalMinutes <= 120) { pressureTone = 'calm'; pressureLabel = formatDurationLabel(totalMinutes); }
                else if (totalMinutes <= 300) { pressureTone = 'moderate'; pressureLabel = formatDurationLabel(totalMinutes); }
                else if (totalMinutes <= 480) { pressureTone = 'loaded'; pressureLabel = formatDurationLabel(totalMinutes); }
                else { pressureTone = 'overloaded'; pressureLabel = formatDurationLabel(totalMinutes); }
                map[day] = {
                    count: daySlots.length,
                    totalMinutes,
                    level,
                    pressureTone,
                    pressureLabel,
                    label: daySlots.length
                        ? (daySlots.length + ' ' + pluralizeSlots(daySlots.length) + ' · ' + formatDurationLabel(totalMinutes))
                        : 'Свободно',
                };
            });
            return map;
        }, [calendarDays, slotsByDay]);

        const calendarWindowLayout = useMemo(() => {
            const len = calendarDays.length;
            const colW = Math.max(dayColumnWidth, 1);
            const vw = Math.max(calendarViewportWidth || 0, colW * Math.max(visibleDayCount, 1));
            const scrollLeft = gridScrollRef.current ? gridScrollRef.current.scrollLeft : 0;
            const overscan = CALENDAR_WINDOW_OVERSCAN_DAYS;
            let firstIdx = Math.floor(scrollLeft / colW) - overscan;
            firstIdx = Math.max(0, Math.min(Math.max(0, len - 1), firstIdx));
            const colsNeeded = Math.max(1, Math.ceil(vw / colW) + overscan * 2 + 2);
            let lastIdx = Math.min(len, firstIdx + colsNeeded);
            if (lastIdx <= firstIdx) lastIdx = Math.min(len, firstIdx + 1);
            const visibleDays = calendarDays.slice(firstIdx, lastIdx);
            const leftSpacer = firstIdx * colW;
            const rightSpacer = (len - lastIdx) * colW;
            const gridTemplateColumns = `${leftSpacer}px repeat(${visibleDays.length}, ${colW}px) ${rightSpacer}px`;
            return {
                visibleDays,
                firstIdx,
                lastIdx,
                gridTemplateColumns,
                colW,
            };
        }, [calendarDays, dayColumnWidth, calendarViewportWidth, calendarWindowScrollTick, visibleDayCount]);

        const openNewSlot = (date, hour) => {
            if (shouldSuppressCalendarClick()) return;
            const start = resolveCalendarCellStart(date, hour);
            const end = resolveCalendarCellStart(date, hour + 1);
            // #region agent log
            sendPlanningDebugLog({
                runId: 'range-debug-1',
                hypothesisId: 'H6',
                location: 'heys_planning_schedule_v1.js:openNewSlot',
                message: 'openNewSlot committed',
                data: {
                    date: start.date,
                    startTime: start.time,
                    endTime: end.time,
                },
            });
            // #endregion
            setSlotDraft(buildSlotDraft({
                date: start.date,
                startTime: start.time,
                endTime: end.time,
                quickCreate: true,
            }));
        };

        const commitCalendarRangeDraft = (active, logOptions) => {
            if (!active) return;

            if (!active.moved) {
                if (active.isTouchPointer) {
                    const startMinutes = columnYToGridWallMinutes(
                        active.y0,
                        CALENDAR_TOTAL_HEIGHT,
                        HOURS.length,
                        CALENDAR_START_HOUR,
                    );
                    const endMinutes = startMinutes + (active.longPressActivated ? 60 : 30);
                    suppressCalendarClick();
                    setSlotDraft(buildSlotDraft({
                        date: active.day,
                        startTime: formatWallClockHm(startMinutes),
                        endTime: formatWallClockHm(endMinutes),
                        quickCreate: true,
                    }));
                    return;
                }
                if (!shouldSuppressCalendarClick()) {
                    const hourIndex = Math.max(0, Math.min(HOURS.length - 1, Math.floor(active.y0 / CALENDAR_HOUR_HEIGHT)));
                    openNewSlot(active.day, HOURS[hourIndex]);
                }
                return;
            }

            const effectiveY1 = active.longPressActivated
                ? active.y0 + Math.max(CALENDAR_HOUR_HEIGHT, active.y1 - active.y0)
                : active.y1;
            const times = rangeColumnYToSlotTimes(
                active.y0,
                effectiveY1,
                CALENDAR_TOTAL_HEIGHT,
                HOURS.length,
                CALENDAR_START_HOUR,
            );
            suppressCalendarClick();
            setSlotDraft(buildSlotDraft({
                date: active.day,
                startTime: times.startTime,
                endTime: times.endTime,
                quickCreate: true,
            }));

            if (logOptions?.location && logOptions?.message) {
                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: logOptions.hypothesisId || 'H7',
                    location: logOptions.location,
                    message: logOptions.message,
                    data: {
                        date: active.day,
                        startTime: times.startTime,
                        endTime: times.endTime,
                    },
                });
                // #endregion
            }
        };

        // Store latest beginCalendarCellTouch in a ref so native listeners
        // always call the current version (avoids stale closure).
        const cellTouchHandlerRef = useRef(null);

        // Attach a single non-passive touchstart listener per day-column
        // via ref callback. This avoids the React passive-listener issue.
        const dayColTouchMapRef = useRef(new Map());

        useEffect(() => {
            const html = document.documentElement;
            const bump = () => setCalendarThemeTick((n) => n + 1);
            const observer = new MutationObserver((records) => {
                for (const record of records) {
                    if (record.attributeName === 'data-theme') bump();
                }
            });
            observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
            return () => observer.disconnect();
        }, []);

        const makeDayColTouchRef = (day) => {
            const prev = dayColTouchMapRef.current.get(day);
            if (prev) return prev.refCb;
            const entry = { node: null, handler: null, refCb: null };
            entry.refCb = (node) => {
                if (entry.node && entry.node !== node && entry.handler) {
                    entry.node.removeEventListener('touchstart', entry.handler);
                    if (entry.contextHandler) entry.node.removeEventListener('contextmenu', entry.contextHandler);
                }
                entry.node = node;
                if (!node) { entry.handler = null; entry.contextHandler = null; return; }
                entry.handler = (event) => {
                    // Only fire for direct calendar-cell touches
                    const cell = event.target?.closest?.('.planning-calendar-cell');
                    if (!cell || !node.contains(cell)) return;
                    // Read from ref to get the latest version
                    const fn = cellTouchHandlerRef.current;
                    if (fn) fn(day, event);
                };
                node.addEventListener('touchstart', entry.handler, { passive: true });
                // Prevent native context menu on long press (Android/iOS) which
                // would otherwise fire touchcancel before our hold timer completes.
                entry.contextHandler = (e) => e.preventDefault();
                node.addEventListener('contextmenu', entry.contextHandler);
            };
            dayColTouchMapRef.current.set(day, entry);
            return entry.refCb;
        };

        const beginCalendarCellTouch = (day, event) => {
            const touchPoint = event?.touches?.[0];
            if (!touchPoint || (event?.touches?.length || 0) !== 1) return;
            if (rangePointerSessionRef.current || rangeTouchSessionRef.current) return;

            const col = typeof event.target?.closest === 'function'
                ? event.target.closest('.planning-calendar-day-col')
                : null;
            if (!col) return;

            const rect = col.getBoundingClientRect();
            const y = touchPoint.clientY - rect.top;
            const session = {
                day,
                col,
                targetNode: event.currentTarget || null,
                touchId: touchPoint.identifier,
                x0: touchPoint.clientX,
                y0: y,
                y1: y,
                isTouchPointer: true,
                activated: false,
                moved: false,
                longPressActivated: false,
                holdTimer: 0,
                prevBodyOverflow: '',
                prevGridOverflow: '',
                prevBodyTouchAction: '',
                prevGridTouchAction: '',
                didLogActivatedMove: false,
                handleTouchMovePassive: null,
                handleTouchMoveActive: null,
                handleTouchEnd: null,
                handleTouchCancel: null,
            };
            rangeTouchSessionRef.current = session;

            // #region agent log
            sendPlanningDebugLog({
                runId: 'range-debug-1',
                hypothesisId: 'H1-touch',
                location: 'heys_planning_schedule_v1.js:beginCalendarCellTouch',
                message: 'range touch start',
                data: {
                    touchId: session.touchId,
                    bodyScrollTop: bodyScrollRef.current?.scrollTop || 0,
                    gridScrollTop: gridScrollRef.current?.scrollTop || 0,
                },
            });
            // #endregion

            const clearHoldTimer = (active) => {
                if (!active?.holdTimer) return;
                window.clearTimeout(active.holdTimer);
                active.holdTimer = 0;
            };

            const cleanupTouchSession = () => {
                const active = rangeTouchSessionRef.current;
                if (!active) return null;
                if (typeof active.handleTouchMovePassive === 'function') {
                    document.removeEventListener('touchmove', active.handleTouchMovePassive, true);
                }
                if (typeof active.handleTouchMoveActive === 'function') {
                    document.removeEventListener('touchmove', active.handleTouchMoveActive, true);
                }
                if (typeof active.handleTouchEnd === 'function') {
                    document.removeEventListener('touchend', active.handleTouchEnd, true);
                }
                if (typeof active.handleTouchCancel === 'function') {
                    document.removeEventListener('touchcancel', active.handleTouchCancel, true);
                }
                rangeTouchSessionRef.current = null;
                setRangeSelectPreview(null);
                clearHoldTimer(active);
                if (bodyScrollRef.current) {
                    bodyScrollRef.current.style.overflow = active.prevBodyOverflow || '';
                    bodyScrollRef.current.style.touchAction = active.prevBodyTouchAction || '';
                }
                if (gridScrollRef.current) {
                    gridScrollRef.current.style.overflow = active.prevGridOverflow || '';
                    gridScrollRef.current.style.touchAction = active.prevGridTouchAction || '';
                }
                return active;
            };

            const activateTouchRange = () => {
                const active = rangeTouchSessionRef.current;
                if (!active || active !== session || active.activated) {
                    return;
                }

                active.activated = true;
                active.longPressActivated = true;
                try { navigator.vibrate?.(10); } catch (_e) { /* unsupported */ }

                if (typeof active.handleTouchMovePassive === 'function') {
                    document.removeEventListener('touchmove', active.handleTouchMovePassive, true);
                }
                if (typeof active.handleTouchMoveActive === 'function') {
                    document.addEventListener('touchmove', active.handleTouchMoveActive, { passive: false, capture: true });
                }

                if (bodyScrollRef.current) bodyScrollRef.current.style.overflow = 'hidden';
                if (gridScrollRef.current) gridScrollRef.current.style.overflow = 'hidden';
                if (bodyScrollRef.current) bodyScrollRef.current.style.touchAction = 'none';
                if (gridScrollRef.current) gridScrollRef.current.style.touchAction = 'none';

                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: 'H1-touch',
                    location: 'heys_planning_schedule_v1.js:touchHoldTimer',
                    message: 'touch long press activated',
                    data: {
                        touchId: active.touchId,
                        y0: active.y0,
                        bodyOverflow: bodyScrollRef.current?.style?.overflow || '',
                        gridOverflow: gridScrollRef.current?.style?.overflow || '',
                    },
                });
                // #endregion

                setRangeSelectPreview({
                    day: active.day,
                    top: active.y0,
                    height: CALENDAR_HOUR_HEIGHT,
                });
            };

            session.handleTouchMovePassive = (moveEvent) => {
                const active = rangeTouchSessionRef.current;
                if (!active || active !== session) return;

                const point = getTouchEventPoint(moveEvent, active.touchId);
                if (!point) return;

                const r = active.col.getBoundingClientRect();
                active.y1 = point.clientY - r.top;
                const distanceY = Math.abs(active.y1 - active.y0);
                const distanceX = Math.abs(point.clientX - (active.x0 || 0));

                if (!active.activated && (distanceY >= CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD || distanceX >= CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD)) {
                    sendPlanningDebugLog({
                        runId: 'range-debug-1',
                        hypothesisId: 'H2-touch',
                        location: 'heys_planning_schedule_v1.js:touchMovePassive',
                        message: 'touch hold cancelled by movement before activation',
                        data: {
                            touchId: active.touchId,
                            distanceX,
                            distanceY,
                            threshold: CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD,
                        },
                    });
                    cleanupTouchSession();
                }
            };

            session.handleTouchMoveActive = (moveEvent) => {
                const active = rangeTouchSessionRef.current;
                if (!active || active !== session || !active.activated) return;

                const point = getTouchEventPoint(moveEvent, active.touchId);
                if (!point) return;

                const r = active.col.getBoundingClientRect();
                active.y1 = point.clientY - r.top;

                if (moveEvent.cancelable) moveEvent.preventDefault();
                if (Math.abs(active.y1 - active.y0) >= RANGE_DRAG_THRESHOLD_PX) {
                    active.moved = true;
                }
                if (!active.didLogActivatedMove) {
                    active.didLogActivatedMove = true;
                    // #region agent log
                    sendPlanningDebugLog({
                        runId: 'range-debug-1',
                        hypothesisId: 'H3-touch',
                        location: 'heys_planning_schedule_v1.js:touchMoveActive',
                        message: 'touch activated move observed',
                        data: {
                            touchId: active.touchId,
                            y0: active.y0,
                            y1: active.y1,
                            moved: active.moved,
                            bodyScrollTop: bodyScrollRef.current?.scrollTop || 0,
                            gridScrollTop: gridScrollRef.current?.scrollTop || 0,
                        },
                    });
                    // #endregion
                }
                if (!active.moved && !active.longPressActivated) return;
                const rawDown = active.y1 - active.y0;
                const heightPx = Math.max(CALENDAR_HOUR_HEIGHT, rawDown);
                setRangeSelectPreview({ day: active.day, top: active.y0, height: heightPx });
            };

            session.handleTouchEnd = (touchEndEvent) => {
                const active = rangeTouchSessionRef.current;
                if (!active || active !== session) return;
                const point = getTouchEventPoint(touchEndEvent, active.touchId);
                const cleaned = cleanupTouchSession();
                if (!cleaned) return;

                if (point) {
                    const r = cleaned.col.getBoundingClientRect();
                    cleaned.y1 = point.clientY - r.top;
                }

                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: 'H4-touch',
                    location: 'heys_planning_schedule_v1.js:touchEnd',
                    message: 'touch range finish',
                    data: {
                        touchId: cleaned.touchId,
                        activated: cleaned.activated,
                        moved: cleaned.moved,
                        y0: cleaned.y0,
                        y1: cleaned.y1,
                    },
                });
                // #endregion

                if (cleaned.activated) {
                    commitCalendarRangeDraft(cleaned, {
                        location: 'heys_planning_schedule_v1.js:touchEnd',
                        message: 'range draft committed by touch end',
                        hypothesisId: 'H7-touch',
                    });
                    return;
                }

                const yEnd = typeof cleaned.y1 === 'number' ? cleaned.y1 : cleaned.y0;
                const dy = Math.abs(yEnd - cleaned.y0);
                if (!cleaned.moved && dy <= CALENDAR_TOUCH_TAP_SLOP_PX) {
                    commitCalendarRangeDraft(cleaned, {
                        location: 'heys_planning_schedule_v1.js:touchTap',
                        message: 'quick slot draft from tap',
                        hypothesisId: 'H7-touch-tap',
                    });
                }
            };

            session.handleTouchCancel = (touchCancelEvent) => {
                const active = rangeTouchSessionRef.current;
                if (!active || active !== session) return;
                const point = getTouchEventPoint(touchCancelEvent, active.touchId);
                const cleaned = cleanupTouchSession();
                if (!cleaned) return;

                if (point) {
                    const r = cleaned.col.getBoundingClientRect();
                    cleaned.y1 = point.clientY - r.top;
                }

                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: 'H5-touch',
                    location: 'heys_planning_schedule_v1.js:touchCancel',
                    message: 'touch range cancelled',
                    data: {
                        touchId: cleaned.touchId,
                        activated: cleaned.activated,
                        moved: cleaned.moved,
                        y0: cleaned.y0,
                        y1: cleaned.y1,
                    },
                });
                // #endregion

                if (!cleaned.activated) return;
                commitCalendarRangeDraft(cleaned, {
                    location: 'heys_planning_schedule_v1.js:touchCancel',
                    message: 'range draft committed by touch cancel',
                    hypothesisId: 'H7-touch',
                });
            };

            session.prevBodyOverflow = bodyScrollRef.current?.style?.overflow || '';
            session.prevGridOverflow = gridScrollRef.current?.style?.overflow || '';
            session.prevBodyTouchAction = bodyScrollRef.current?.style?.touchAction || '';
            session.prevGridTouchAction = gridScrollRef.current?.style?.touchAction || '';
            session.holdTimer = window.setTimeout(activateTouchRange, CALENDAR_CELL_LONG_PRESS_MS);

            document.addEventListener('touchmove', session.handleTouchMovePassive, { passive: true, capture: true });
            document.addEventListener('touchend', session.handleTouchEnd, { passive: true, capture: true });
            document.addEventListener('touchcancel', session.handleTouchCancel, { passive: true, capture: true });
        };

        // Keep ref in sync so native listeners always call latest version
        cellTouchHandlerRef.current = beginCalendarCellTouch;

        const beginCalendarCellPointer = (day, event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (rangePointerSessionRef.current || rangeTouchSessionRef.current) return;

            const pointerType = String(event.pointerType || '').toLowerCase();
            const isLikelyTouchDevice = !!usesTouchLikeInput;
            const isTouchPointer = pointerType === 'touch'
                || pointerType === 'pen'
                || (!pointerType && isLikelyTouchDevice)
                || (pointerType === 'mouse' && isLikelyTouchDevice);
            if (isTouchPointer) return;

            const col = typeof event.currentTarget.closest === 'function'
                ? event.currentTarget.closest('.planning-calendar-day-col')
                : null;
            if (!col) return;
            const rect = col.getBoundingClientRect();
            const y = event.clientY - rect.top;
            const session = {
                day,
                col,
                targetNode: event.currentTarget || null,
                pointerId: event.pointerId,
                y0: y,
                y1: y,
                isTouchPointer,
                activated: !isTouchPointer,
                moved: false,
                longPressActivated: false,
                holdTimer: 0,
                prevTouchAction: '',
                prevBodyOverflow: '',
                prevGridOverflow: '',
                prevBodyTouchAction: '',
                prevGridTouchAction: '',
                didLogActivatedMove: false,
            };
            rangePointerSessionRef.current = session;

            // #region agent log
            sendPlanningDebugLog({
                runId: 'range-debug-1',
                hypothesisId: 'H1',
                location: 'heys_planning_schedule_v1.js:beginCalendarCellPointer',
                message: 'range pointer down',
                data: {
                    pointerType,
                    isLikelyTouchDevice,
                    isTouchPointer,
                    pointerId: session.pointerId,
                    bodyScrollTop: bodyScrollRef.current?.scrollTop || 0,
                    gridScrollTop: gridScrollRef.current?.scrollTop || 0,
                },
            });
            // #endregion

            const clearHoldTimer = (active) => {
                if (!active?.holdTimer) return;
                window.clearTimeout(active.holdTimer);
                active.holdTimer = 0;
            };

            const onMove = (ev) => {
                const active = rangePointerSessionRef.current;
                if (!active || ev.pointerId !== active.pointerId) return;
                const r = active.col.getBoundingClientRect();
                active.y1 = ev.clientY - r.top;

                const distance = Math.abs(active.y1 - active.y0);
                if (!active.activated) {
                    if (active.isTouchPointer && distance >= CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD) {
                        // #region agent log
                        sendPlanningDebugLog({
                            runId: 'range-debug-1',
                            hypothesisId: 'H2',
                            location: 'heys_planning_schedule_v1.js:onMove',
                            message: 'hold cancelled by movement before activation',
                            data: {
                                pointerId: active.pointerId,
                                distance,
                                threshold: CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD,
                            },
                        });
                        // #endregion
                        clearHoldTimer(active);
                        return;
                    }
                    return;
                }

                if (ev.cancelable) ev.preventDefault();
                if (Math.abs(active.y1 - active.y0) >= RANGE_DRAG_THRESHOLD_PX) {
                    active.moved = true;
                }
                if (!active.didLogActivatedMove) {
                    active.didLogActivatedMove = true;
                    // #region agent log
                    sendPlanningDebugLog({
                        runId: 'range-debug-1',
                        hypothesisId: 'H3',
                        location: 'heys_planning_schedule_v1.js:onMove',
                        message: 'activated move observed',
                        data: {
                            pointerId: active.pointerId,
                            y0: active.y0,
                            y1: active.y1,
                            moved: active.moved,
                            bodyScrollTop: bodyScrollRef.current?.scrollTop || 0,
                            gridScrollTop: gridScrollRef.current?.scrollTop || 0,
                        },
                    });
                    // #endregion
                }
                if (!active.moved && !active.longPressActivated) return;
                if (active.longPressActivated) {
                    const rawDown = active.y1 - active.y0;
                    const heightPx = Math.max(CALENDAR_HOUR_HEIGHT, rawDown);
                    setRangeSelectPreview({ day: active.day, top: active.y0, height: heightPx });
                } else {
                    const topY = Math.min(active.y0, active.y1);
                    const heightPx = Math.max(RANGE_DRAG_THRESHOLD_PX, Math.abs(active.y1 - active.y0));
                    setRangeSelectPreview({ day: active.day, top: topY, height: heightPx });
                }
            };

            const cleanupPointerSession = () => {
                const active = rangePointerSessionRef.current;
                if (!active) return null;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', finish);
                window.removeEventListener('pointercancel', cancel);
                rangePointerSessionRef.current = null;
                setRangeSelectPreview(null);
                clearHoldTimer(active);
                if (active.isTouchPointer && active.col) {
                    active.col.style.touchAction = active.prevTouchAction || '';
                }
                if (active.isTouchPointer && bodyScrollRef.current) {
                    bodyScrollRef.current.style.overflow = active.prevBodyOverflow || '';
                    bodyScrollRef.current.style.touchAction = active.prevBodyTouchAction || '';
                }
                if (active.isTouchPointer && gridScrollRef.current) {
                    gridScrollRef.current.style.overflow = active.prevGridOverflow || '';
                    gridScrollRef.current.style.touchAction = active.prevGridTouchAction || '';
                }
                if (
                    active.pointerId != null
                    && active.targetNode
                    && typeof active.targetNode.releasePointerCapture === 'function'
                ) {
                    try {
                        active.targetNode.releasePointerCapture(active.pointerId);
                    } catch (error) {
                        // ignore
                    }
                }
                return active;
            };

            const finish = (ev) => {
                const active = rangePointerSessionRef.current;
                if (!active || ev.pointerId !== active.pointerId) return;
                cleanupPointerSession();

                const r = active.col.getBoundingClientRect();
                active.y1 = ev.clientY - r.top;

                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: 'H4',
                    location: 'heys_planning_schedule_v1.js:finish',
                    message: 'range finish',
                    data: {
                        pointerId: active.pointerId,
                        activated: active.activated,
                        moved: active.moved,
                        y0: active.y0,
                        y1: active.y1,
                        pointerType: String(ev.pointerType || ''),
                    },
                });
                // #endregion

                if (!active.activated) {
                    return;
                }
                commitCalendarRangeDraft(active, {
                    location: 'heys_planning_schedule_v1.js:finish',
                    message: 'range draft committed by finish',
                    hypothesisId: 'H7',
                });
            };

            const cancel = (ev) => {
                const active = rangePointerSessionRef.current;
                if (!active || ev.pointerId !== active.pointerId) return;
                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: 'H5',
                    location: 'heys_planning_schedule_v1.js:cancel',
                    message: 'range cancelled',
                    data: {
                        pointerId: active.pointerId,
                        activated: active.activated,
                        moved: active.moved,
                        pointerType: String(ev.pointerType || ''),
                        bodyScrollTop: bodyScrollRef.current?.scrollTop || 0,
                        gridScrollTop: gridScrollRef.current?.scrollTop || 0,
                    },
                });
                // #endregion
                cleanupPointerSession();

                if (!active.activated) return;

                // #region agent log
                sendPlanningDebugLog({
                    runId: 'range-debug-1',
                    hypothesisId: 'H5',
                    location: 'heys_planning_schedule_v1.js:cancel',
                    message: 'cancel promoted to finish',
                    data: {
                        pointerId: active.pointerId,
                        moved: active.moved,
                        y0: active.y0,
                        y1: active.y1,
                    },
                });
                // #endregion

                commitCalendarRangeDraft(active, {
                    location: 'heys_planning_schedule_v1.js:cancel',
                    message: 'range draft committed by cancel',
                    hypothesisId: 'H7',
                });
            };

            if (session.isTouchPointer) {
                session.prevTouchAction = session.col?.style?.touchAction || '';
                if (session.col) session.col.style.touchAction = 'none';
                session.prevBodyOverflow = bodyScrollRef.current?.style?.overflow || '';
                session.prevGridOverflow = gridScrollRef.current?.style?.overflow || '';
                session.prevBodyTouchAction = bodyScrollRef.current?.style?.touchAction || '';
                session.prevGridTouchAction = gridScrollRef.current?.style?.touchAction || '';
                if (session.pointerId != null && session.targetNode && typeof session.targetNode.setPointerCapture === 'function') {
                    try {
                        session.targetNode.setPointerCapture(session.pointerId);
                    } catch (error) {
                        // ignore
                    }
                }
                if (event.cancelable) event.preventDefault();
                session.holdTimer = window.setTimeout(() => {
                    const active = rangePointerSessionRef.current;
                    if (!active || active !== session) return;
                    active.activated = true;
                    active.longPressActivated = true;
                    try { navigator.vibrate?.(10); } catch (_e) { /* unsupported */ }
                    if (bodyScrollRef.current) bodyScrollRef.current.style.overflow = 'hidden';
                    if (gridScrollRef.current) gridScrollRef.current.style.overflow = 'hidden';
                    if (bodyScrollRef.current) bodyScrollRef.current.style.touchAction = 'none';
                    if (gridScrollRef.current) gridScrollRef.current.style.touchAction = 'none';
                    // #region agent log
                    sendPlanningDebugLog({
                        runId: 'range-debug-1',
                        hypothesisId: 'H1',
                        location: 'heys_planning_schedule_v1.js:holdTimer',
                        message: 'long press activated',
                        data: {
                            pointerId: active.pointerId,
                            y0: active.y0,
                            bodyOverflow: bodyScrollRef.current?.style?.overflow || '',
                            gridOverflow: gridScrollRef.current?.style?.overflow || '',
                            bodyTouchAction: bodyScrollRef.current?.style?.touchAction || '',
                            gridTouchAction: gridScrollRef.current?.style?.touchAction || '',
                        },
                    });
                    // #endregion
                    setRangeSelectPreview({
                        day: active.day,
                        top: active.y0,
                        height: CALENDAR_HOUR_HEIGHT,
                    });
                }, CALENDAR_CELL_LONG_PRESS_MS);
            }

            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', finish);
            window.addEventListener('pointercancel', cancel);
        };

        const handleDropToCell = (date, hour, event) => {
            event.preventDefault();
            setCalendarDragZoom(false);
            clearHeaderDropState();
            clearCalendarCellDropPreview();
            const payload = parsePlanningDragPayload(event);
            applyDragPayloadToCell(date, hour, payload);
            flashCalendarDropCommitAccent(date, hour);
        };

        const removeCalendarSlotKeepTask = (slot, columnDay) => {
            const taskId = slot?.taskId;
            const remaining = state.slots.filter((s) => s.taskId === taskId && s.id !== slot.id);
            state.deleteSlot(slot.id);
            if (taskId && remaining.length === 0) {
                state.updateTask(taskId, {
                    startDate: columnDay,
                    dueDate: columnDay,
                });
            }
        };

        const removeCalendarSlotAndTask = (slot) => {
            if (slot.taskId) {
                state.deleteTask(slot.taskId);
            } else {
                state.deleteSlot(slot.id);
            }
        };

        const beginResize = (slot, edge, event) => {
            event.preventDefault();
            event.stopPropagation();
            const targetNode = event.currentTarget || null;
            const pointerId = event.pointerId ?? null;

            if (
                pointerId != null
                && targetNode
                && typeof targetNode.setPointerCapture === 'function'
            ) {
                try {
                    targetNode.setPointerCapture(pointerId);
                } catch (error) {
                    // ignore
                }
            }

            const displayDate = getCalendarDisplayDate(slot) || dateStr(slot.date);
            resizeStateRef.current = {
                slotId: slot.id,
                edge: edge === 'start' ? 'start' : 'end',
                pointerId,
                targetNode,
                displayDate,
                startY: event.clientY,
                startMinutes: getCalendarDisplayMinutes(slot.startTime),
                endMinutes: getCalendarDisplayEndMinutes(slot),
                originalDate: dateStr(slot.date),
                originalStartTime: slot.startTime,
                originalEndTime: slot.endTime,
            };
            setResizePreview({
                slotId: slot.id,
                date: dateStr(slot.date),
                startTime: slot.startTime,
                endTime: slot.endTime,
            });
        };

        return h('div', {
            className: 'planning-calendar-screen'
                + (isCompactCalendarView ? ' planning-calendar-screen--drag-zoom' : '')
                + (touchDragPreview?.kind === 'task' ? ' planning-calendar-screen--task-dragging' : ''),
        },
            h('div', { className: 'planning-calendar-nav' },
                h('span', { className: 'planning-calendar-nav__density-label' }, 'Сколько дней в ряд'),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: () => scrollCalendarByDays(-visibleDayCount) }, '‹'),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: scrollCalendarToTodayWindow }, 'Сегодня'),
                h('div', { className: 'planning-calendar-nav__window-toggle', role: 'group', 'aria-label': 'Плотность календаря: дней в окне' },
                    CALENDAR_DAY_WINDOW_OPTIONS.map((days) => h('button', {
                        key: 'days-window-' + days,
                        type: 'button',
                        className: 'planning-btn planning-btn--sm' + (calendarDayWindow === days ? ' planning-btn--active' : ''),
                        'aria-pressed': calendarDayWindow === days ? 'true' : 'false',
                        title: 'Показывать ' + days + ' дн.',
                        onClick: () => setCalendarDayWindow(days),
                    }, days + 'д')),
                ),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: () => scrollCalendarByDays(visibleDayCount) }, '›'),
                h('button', {
                    type: 'button',
                    className: 'hdr-theme-btn planning-calendar-nav__theme-btn',
                    'aria-label': 'Сменить тему',
                    title: 'Сменить тему',
                    onClick: (event) => {
                        event.stopPropagation();
                        const root = window.HEYS;
                        if (typeof root?.cycleTheme === 'function') {
                            root.cycleTheme();
                            return;
                        }
                        const html = document.documentElement;
                        const current = html.getAttribute('data-theme') || 'light';
                        const next = current === 'dark' ? 'light' : 'dark';
                        html.setAttribute('data-theme', next);
                        const U = root?.utils || {};
                        try {
                            localStorage.setItem('heys_theme_pref', next);
                            localStorage.setItem('heys_theme_explicit', '1');
                            localStorage.setItem('heys_theme', next);
                            if (U.lsSet) {
                                U.lsSet('heys_theme_pref', next);
                                U.lsSet('heys_theme_explicit', '1');
                                U.lsSet('heys_theme', next);
                            }
                        } catch (err) {
                            // ignore quota / private mode
                        }
                        setCalendarThemeTick((n) => n + 1);
                    },
                }, typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'),
            ),
            h('div', {
                ref: gridScrollRef,
                className: 'planning-calendar-unified-scroll',
                onScroll: onCalendarGridScroll,
            },
                h('div', {
                    ref: headerRef,
                    className: 'planning-calendar-header planning-calendar-header--sticky',
                },
                    h('div', { className: 'planning-calendar-time-gutter planning-calendar-time-gutter--sticky-corner' }),
                    h('div', {
                        className: 'planning-calendar-days-track planning-calendar-days-track--header planning-calendar-days-track--windowed',
                        style: {
                            '--planning-calendar-day-width': dayColumnWidth + 'px',
                            gridTemplateColumns: calendarWindowLayout.gridTemplateColumns,
                            gridAutoColumns: 'unset',
                        },
                    },
                        h('div', { key: 'cal-win-spacer-left', className: 'planning-calendar-window-spacer', 'aria-hidden': 'true' }),
                            calendarWindowLayout.visibleDays.map((day) => h('div', {
                                key: day,
                                className: 'planning-calendar-day-header'
                                    + (day === todayIso ? ' planning-calendar-day-header--today' : '')
                                    + (isWeekendDay(day) ? ' planning-calendar-day-header--weekend' : '')
                                    + (headerDropState.day === day ? ' planning-calendar-day-header--drop-target' : '')
                                    + (headerDropState.day === day && headerDropState.mode === 'unschedule'
                                        ? ' planning-calendar-day-header--drop-unschedule'
                                        : ''),
                                title: dayOccupancyByDay[day]?.label || '',
                                onDragOver: (event) => {
                                    const payload = parsePlanningDragPayload(event);
                                    if (!canApplyDragPayloadToHeaderDay(payload)) {
                                        if (headerDropState.day === day) clearHeaderDropState();
                                        return;
                                    }

                                    event.preventDefault();
                                    maybeActivateCalendarDragZoom(event);
                                    event.dataTransfer.dropEffect = 'move';
                                    clearCalendarCellDropPreview();
                                    applyHeaderDropState(day, payload);
                                },
                                onDragLeave: () => {
                                    if (headerDropState.day === day) clearHeaderDropState();
                                },
                                onDrop: (event) => handleDropToHeaderDay(day, event),
                            },
                                (day === yesterdayIso && (unscheduledTasksByDay[yesterdayIso] || []).length > 0)
                                    ? h('div', {
                                        className: 'planning-calendar-day-header__title planning-calendar-day-header__title--with-bulk',
                                    },
                                        h('div', { className: 'planning-calendar-day-header__title-row' },
                                            h('div', { className: 'planning-calendar-day-header__title-dates' },
                                                h('span', { className: 'planning-calendar-day-label' }, getWeekdayLabel(day)),
                                                h('span', { className: 'planning-calendar-day-date' }, day.slice(8)),
                                            ),
                                            h('button', {
                                                type: 'button',
                                                className: 'planning-btn planning-btn--sm planning-calendar-day-header__bulk-today-btn',
                                                title: 'Перенести все задачи без времени на сегодня',
                                                'aria-label': 'Перенести все задачи без времени на сегодня',
                                                onClick: (event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    moveYesterdayUnscheduledToToday();
                                                },
                                            }, 'Сегодня'),
                                        ),
                                    )
                                    : h('div', { className: 'planning-calendar-day-header__title' },
                                        h('span', { className: 'planning-calendar-day-label' }, getWeekdayLabel(day)),
                                        h('span', { className: 'planning-calendar-day-date' }, day.slice(8)),
                                    ),
                                dayOccupancyByDay[day]?.pressureTone && dayOccupancyByDay[day].pressureTone !== 'free' && h('span', {
                                    className: 'planning-calendar-day-pressure planning-calendar-day-pressure--' + dayOccupancyByDay[day].pressureTone,
                                    'aria-label': dayOccupancyByDay[day].label,
                                    title: dayOccupancyByDay[day].label,
                                }, dayOccupancyByDay[day].pressureLabel),
                                headerDropState.day === day && headerDropState.mode === 'unschedule' && h('span', {
                                    className: 'planning-calendar-day-drop-hint',
                                    'aria-hidden': 'true',
                                }, '↺ без времени'),
                                h('div', { className: 'planning-calendar-day-unscheduled' },
                                    (unscheduledTasksByDay[day] || []).map((task) => h(CalendarUnscheduledTaskPill, {
                                        key: task.id,
                                        task,
                                        projects: state.projects,
                                        taskLookup: taskMap,
                                        onDragStateChange: setCalendarDragZoom,
                                        onTouchDragStart: handleCalendarTouchStart,
                                        onPointerDragStart: handleCalendarPointerDragStart,
                                        shouldSuppressClick: shouldSuppressCalendarClick,
                                        isTouchDragSource: touchDragSourceKey === ('task:' + task.id),
                                        allowNativeDrag: allowNativeCalendarDrag,
                                        onOpen: setSelectedTaskId,
                                    })),
                                ),
                            )),
                            h('div', { key: 'cal-win-spacer-right', className: 'planning-calendar-window-spacer', 'aria-hidden': 'true' }),
                        ),
                    ),
                h('div', {
                    className: 'planning-calendar-body-row',
                    style: {
                        paddingTop: calendarVerticalTopPadding + 'px',
                        paddingBottom: calendarVerticalBottomPadding + 'px',
                    },
                },
                    h('div', { className: 'planning-calendar-time-gutter planning-calendar-time-gutter--grid' },
                    calendarCellDropPreview && h('div', {
                        className: 'planning-calendar-time-drop-range',
                        style: {
                            top: calendarCellDropPreview.top + 'px',
                            height: calendarCellDropPreview.height + 'px',
                        },
                        'aria-hidden': 'true',
                    }),
                    HOURS.map((hour) => h('div', {
                        key: hour,
                        className: 'planning-calendar-hour-label'
                            + (calendarDropCommitAccent?.hour === hour ? ' planning-calendar-hour-label--drop-accent' : ''),
                    }, formatCalendarHourLabel(hour))),
                    calendarCellDropPreview && h('div', {
                        className: 'planning-calendar-time-drop-preview',
                        style: { top: calendarCellDropPreview.top + 'px' },
                        'aria-hidden': 'true',
                    },
                        h('span', { className: 'planning-calendar-time-drop-preview__label' }, calendarCellDropPreview.startTimeLabel),
                        h('span', { className: 'planning-calendar-time-drop-preview__arrow' }, '→'),
                    ),
                ),
                    h('div', {
                        className: 'planning-calendar-days-track planning-calendar-days-track--grid planning-calendar-days-track--windowed',
                        style: {
                            '--planning-calendar-day-width': dayColumnWidth + 'px',
                            gridTemplateColumns: calendarWindowLayout.gridTemplateColumns,
                            gridAutoColumns: 'unset',
                        },
                    },
                        h('div', { key: 'cal-body-win-spacer-left', className: 'planning-calendar-window-spacer', 'aria-hidden': 'true' }),
                        calendarWindowLayout.visibleDays.map((day) => h('div', {
                            key: day,
                            ref: makeDayColTouchRef(day),
                            className: 'planning-calendar-day-col'
                                + (day === todayIso ? ' planning-calendar-day-col--today' : '')
                                + (isWeekendDay(day) ? ' planning-calendar-day-col--weekend' : ''),
                        },
                            HOURS.map((hour) => h('div', {
                                key: hour,
                                className: 'planning-calendar-cell'
                                    + (calendarCellDropPreview?.day === day && calendarCellDropPreview?.hour === hour
                                        ? ' planning-calendar-cell--drop-target'
                                        : ''),
                                onPointerDown: (event) => beginCalendarCellPointer(day, event),
                                onContextMenu: (event) => {
                                    event.preventDefault();
                                },
                                onDragOver: (event) => {
                                    const payload = parsePlanningDragPayload(event);
                                    if (!isPlanningCalendarDragPayload(payload)) return;

                                    event.preventDefault();
                                    maybeActivateCalendarDragZoom(event);
                                    event.dataTransfer.dropEffect = 'move';
                                    clearHeaderDropState();
                                    applyCalendarCellDropPreview(day, hour, payload);
                                },
                                onDrop: (event) => handleDropToCell(day, hour, event),
                            })),
                            rangeSelectPreview && rangeSelectPreview.day === day && h('div', {
                                className: 'planning-calendar-range-selection',
                                style: {
                                    top: rangeSelectPreview.top + 'px',
                                    height: rangeSelectPreview.height + 'px',
                                },
                                'aria-hidden': 'true',
                            }),
                            calendarCellDropPreview?.day === day && h('div', {
                                className: 'planning-calendar-drop-preview'
                                    + (calendarCellDropPreview.kind === 'slot'
                                        ? ' planning-calendar-drop-preview--slot'
                                        : ' planning-calendar-drop-preview--task'),
                                style: {
                                    top: calendarCellDropPreview.top + 'px',
                                    height: calendarCellDropPreview.height + 'px',
                                    '--planning-calendar-drop-preview-color': calendarCellDropPreview.accentColor || '#64748b',
                                },
                                'aria-hidden': 'true',
                            }),
                            calendarDropCommitAccent?.day === day && h('div', {
                                className: 'planning-calendar-drop-commit-marker',
                                style: { top: calendarDropCommitAccent.top + 'px' },
                                'aria-hidden': 'true',
                            },
                                h('span', { className: 'planning-calendar-drop-commit-marker__dot' }),
                                h('span', { className: 'planning-calendar-drop-commit-marker__line' }),
                            ),
                            (slotsByDay[day] || []).map((slot) => {
                                const linkedTask = slot.taskId ? taskMap.get(slot.taskId) : null;
                                const slotPreview = resizePreview?.slotId === slot.id
                                    ? {
                                        ...slot,
                                        date: resizePreview.date || slot.date,
                                        startTime: resizePreview.startTime || slot.startTime,
                                        endTime: resizePreview.endTime || slot.endTime,
                                    }
                                    : slot;
                                const metrics = buildSlotMetrics(slotPreview);
                                const appearance = resolveCalendarSlotAppearance(day, yesterdayIso, linkedTask, state.projects, slot);
                                const parentGroupLabel = linkedTask ? buildTaskParentGroupLabel(linkedTask, taskMap) : '';
                                const showTaskStatusToggle = Boolean(
                                    linkedTask && linkedTask.status !== 'cancelled',
                                );
                                const isTaskDone = linkedTask?.status === 'done';
                                return h(CalendarSlotCard, {
                                    key: slot.id,
                                    slot,
                                    color: appearance.color,
                                    className: appearance.className,
                                    style: { top: metrics.top + 'px', height: metrics.height + 'px' },
                                    title: linkedTask?.title || slot.title || 'Событие',
                                    subtitle: slotPreview.startTime + '–' + slotPreview.endTime,
                                    parentGroupLabel,
                                    showSubtitle: !parentGroupLabel || metrics.height >= 44,
                                    taskStatusToggleDone: isTaskDone,
                                    onTaskStatusToggle: showTaskStatusToggle
                                        ? () => state.updateTask(linkedTask.id, {
                                            status: isTaskDone ? 'in_progress' : 'done',
                                        })
                                        : undefined,
                                    onDragStateChange: setCalendarDragZoom,
                                    onTouchDragStart: handleCalendarTouchStart,
                                    onPointerDragStart: handleCalendarPointerDragStart,
                                    shouldSuppressClick: shouldSuppressCalendarClick,
                                    isTouchDragSource: touchDragSourceKey === ('slot:' + slot.id),
                                    allowNativeDrag: allowNativeCalendarDrag,
                                    showResizeHandle: true,
                                    onOpen: () => setSlotDraft(buildSlotDraft(slot)),
                                    onResizeStart: beginResize,
                                    onDeleteClick: () => {
                                        suppressCalendarClick();
                                        setSlotDeleteTarget({ slot, day });
                                    },
                                    isPastDay: day < todayIso,
                                    onQuickReschedule: day < todayIso && !isTaskDone
                                        ? (target) => {
                                            const targetDate = target === 'tomorrow' ? addDays(todayIso, 1) : todayIso;
                                            state.updateSlot(slot.id, { date: targetDate });
                                        }
                                        : undefined,
                                });
                            }),
                            day === todayIso && isCalendarNowTopVisible(nowLineTop) && h('div', {
                                ref: nowLineRef,
                                className: 'planning-calendar-now-line',
                                style: { top: nowLineTop + 'px' },
                                'aria-hidden': 'true',
                            },
                                h('span', { className: 'planning-calendar-now-line__dot' }),
                                h('span', { className: 'planning-calendar-now-line__bar' }),
                            ),
                        )),
                        h('div', { key: 'cal-body-win-spacer-right', className: 'planning-calendar-window-spacer', 'aria-hidden': 'true' }),
                    ),
                ),
            ),
            touchDragPreview && h('div', {
                className: 'planning-calendar-drag-ghost'
                    + (touchDragPreview.kind === 'slot'
                        ? ' planning-calendar-drag-ghost--slot'
                        : ' planning-calendar-drag-ghost--task'),
                style: {
                    left: (touchDragPreview.x - (touchDragPreview.grabOffsetX || 0)) + 'px',
                    top: (touchDragPreview.y - (touchDragPreview.grabOffsetY || 0)) + 'px',
                    width: (touchDragPreview.width || 100) + 'px',
                    height: (touchDragPreview.height || 60) + 'px',
                    background: touchDragPreview.background || undefined,
                    '--planning-drag-ghost-accent': touchDragPreview.accentColor || '#64748b',
                },
            },
                touchDragPreview.parentGroupLabel && h('span', {
                    className: 'planning-calendar-slot__parent',
                }, touchDragPreview.parentGroupLabel),
                h('span', {
                    className: 'planning-calendar-slot__title'
                        + (touchDragPreview.parentGroupLabel ? ' planning-calendar-slot__title--with-parent' : ''),
                }, touchDragPreview.title),
            ),
            slotDeleteTarget && h(SlotDeleteActionSheet, {
                slot: slotDeleteTarget.slot,
                columnDay: slotDeleteTarget.day,
                hasLinkedTask: !!slotDeleteTarget.slot.taskId,
                onClose: () => setSlotDeleteTarget(null),
                onSlotOnly: () => removeCalendarSlotKeepTask(slotDeleteTarget.slot, slotDeleteTarget.day),
                onSlotAndTask: () => removeCalendarSlotAndTask(slotDeleteTarget.slot),
            }),
            slotDraft && slotDraft.quickCreate && h(QuickSlotModal, {
                draft: slotDraft,
                state,
                onClose: () => setSlotDraft(null),
            }),
            slotDraft && !slotDraft.quickCreate && h(SlotEditorModal, {
                draft: slotDraft,
                state,
                resolvedTaskProjectIds,
                onClose: () => setSlotDraft(null),
            }),
            selectedTaskId && PlanningTasks.TaskDetailModal && h(PlanningTasks.TaskDetailModal, {
                taskId: selectedTaskId,
                state,
                resolvedTaskProjectIds,
                onClose: () => setSelectedTaskId(null),
            }),
        );
    }

    function GanttBar({ task, dayWidth, timelineStart, color, isDesktop, onUpdateTask, onOpenTask }) {
        const interactionRef = useRef(null);
        const [preview, setPreview] = useState(null);

        useEffect(() => {
            const handleMove = (event) => {
                const active = interactionRef.current;
                if (!active) return;
                const deltaDays = Math.round((event.clientX - active.startX) / dayWidth);
                if (!deltaDays) {
                    setPreview(null);
                    return;
                }
                const current = { ...active.original };
                if (active.mode === 'move') {
                    current.startDate = active.original.startDate ? addDays(active.original.startDate, deltaDays) : active.original.startDate;
                    current.dueDate = active.original.dueDate ? addDays(active.original.dueDate, deltaDays) : active.original.dueDate;
                }
                if (active.mode === 'start' && active.original.startDate) {
                    const candidate = addDays(active.original.startDate, deltaDays);
                    if (!active.original.dueDate || candidate <= active.original.dueDate) current.startDate = candidate;
                }
                if (active.mode === 'end' && active.original.dueDate) {
                    const candidate = addDays(active.original.dueDate, deltaDays);
                    if (!active.original.startDate || candidate >= active.original.startDate) current.dueDate = candidate;
                }
                setPreview(current);
            };

            const handleUp = () => {
                const active = interactionRef.current;
                if (!active) return;
                if (preview) {
                    onUpdateTask(task.id, {
                        startDate: preview.startDate,
                        dueDate: preview.dueDate,
                    });
                }
                interactionRef.current = null;
                setPreview(null);
            };

            window.addEventListener('pointermove', handleMove);
            window.addEventListener('pointerup', handleUp);
            return () => {
                window.removeEventListener('pointermove', handleMove);
                window.removeEventListener('pointerup', handleUp);
            };
        }, [dayWidth, onUpdateTask, preview, task.id]);

        const effectiveTask = preview || task;
        const startDate = effectiveTask.startDate || effectiveTask.dueDate;
        const dueDate = effectiveTask.dueDate || effectiveTask.startDate;
        const startOffset = diffDays(timelineStart, startDate);
        const endOffset = diffDays(timelineStart, dueDate);
        const width = Math.max(dayWidth, ((endOffset - startOffset) + 1) * dayWidth);
        const left = startOffset * dayWidth;

        const baselineStart = task.baselineStartDate || task.baselineDueDate;
        const baselineEnd = task.baselineDueDate || task.baselineStartDate;
        const showBaseline = isDesktop && baselineStart && baselineEnd;
        const baselineLeft = showBaseline ? diffDays(timelineStart, baselineStart) * dayWidth : 0;
        const baselineWidth = showBaseline
            ? Math.max(dayWidth, ((diffDays(timelineStart, baselineEnd) - diffDays(timelineStart, baselineStart)) + 1) * dayWidth)
            : 0;

        const beginInteraction = (mode, event) => {
            if (!isDesktop) return;
            event.preventDefault();
            event.stopPropagation();
            interactionRef.current = {
                mode,
                startX: event.clientX,
                original: {
                    startDate: task.startDate || undefined,
                    dueDate: task.dueDate || undefined,
                },
            };
            setPreview(null);
        };

        return h('div', { className: 'planning-gantt-bar-wrap' },
            showBaseline && h('div', {
                className: 'planning-gantt-baseline',
                style: { left: baselineLeft + 'px', width: baselineWidth + 'px' },
            }),
            h('div', {
                className: 'planning-gantt-bar',
                style: { left: left + 'px', width: width + 'px', background: color },
                onClick: () => onOpenTask(task.id),
                onPointerDown: (event) => beginInteraction('move', event),
                title: task.title + ' · ' + (startDate || '?') + ' → ' + (dueDate || '?'),
            },
                isDesktop && h('span', {
                    className: 'planning-gantt-handle planning-gantt-handle--start',
                    onPointerDown: (event) => beginInteraction('start', event),
                }),
                h('span', { className: 'planning-gantt-bar__label' }, task.title),
                isDesktop && h('span', {
                    className: 'planning-gantt-handle planning-gantt-handle--end',
                    onPointerDown: (event) => beginInteraction('end', event),
                }),
            ),
        );
    }

    function GanttScreen({ state }) {
        const { isDesktop } = usePlanningViewport();
        const [zoom, setZoom] = useState(isDesktop ? 'normal' : 'compact');
        const [collapsed, setCollapsed] = useState({});
        const [selectedTaskId, setSelectedTaskId] = useState(null);
        const resolvedTaskProjectIds = useMemo(() => buildResolvedTaskProjectMap(state.tasks, state.projects), [state.tasks, state.projects]);

        useEffect(() => {
            if (!isDesktop) setZoom('compact');
        }, [isDesktop]);

        const relevantTasks = useMemo(() => state.tasks.filter((task) => {
            if (task.status === 'cancelled') return false;
            return !!(task.startDate || task.dueDate || task.baselineStartDate || task.baselineDueDate);
        }), [state.tasks]);

        const timelineBounds = useMemo(() => {
            const dates = [];
            relevantTasks.forEach((task) => {
                [task.startDate, task.dueDate, task.baselineStartDate, task.baselineDueDate].forEach((value) => {
                    if (value) dates.push(value);
                });
            });
            if (dates.length === 0) {
                const today = dateStr();
                return { start: addDays(today, -3), end: addDays(today, 17) };
            }
            const sorted = dates.slice().sort();
            return { start: addDays(sorted[0], -2), end: addDays(sorted[sorted.length - 1], 4) };
        }, [relevantTasks]);

        const timelineDays = useMemo(() => {
            const length = Math.max(1, diffDays(timelineBounds.start, timelineBounds.end) + 1);
            return Array.from({ length }, (_, index) => addDays(timelineBounds.start, index));
        }, [timelineBounds]);

        const dayWidth = GANTT_ZOOM_WIDTHS[zoom] || GANTT_ZOOM_WIDTHS.normal;
        const todayIso = dateStr();
        const projects = state.projects.filter((project) => project.status !== 'archived');

        const grouped = useMemo(() => {
            const buckets = new Map();
            projects.forEach((project) => buckets.set(project.id, { project, tasks: [] }));
            buckets.set('__none__', { project: { id: '__none__', name: 'Без проекта', color: '#94a3b8' }, tasks: [] });
            relevantTasks.forEach((task) => {
                const key = task.projectId && buckets.has(task.projectId) ? task.projectId : '__none__';
                buckets.get(key).tasks.push(task);
            });
            return Array.from(buckets.values())
                .map((entry) => ({ ...entry, tasks: entry.tasks.slice().sort((left, right) => (left.order || 0) - (right.order || 0)) }))
                .filter((entry) => entry.tasks.length > 0);
        }, [projects, relevantTasks]);

        const layout = useMemo(() => {
            const taskTopById = {};
            const taskMetrics = {};
            const rows = [];
            let cursorTop = 0;
            grouped.forEach((group) => {
                rows.push({ type: 'group', id: group.project.id, top: cursorTop, height: 34, group });
                cursorTop += 34;
                if (collapsed[group.project.id]) return;
                group.tasks.forEach((task) => {
                    const row = { type: 'task', id: task.id, top: cursorTop, height: 42, task, group };
                    rows.push(row);
                    taskTopById[task.id] = cursorTop;
                    const startDate = task.startDate || task.dueDate;
                    const dueDate = task.dueDate || task.startDate;
                    const left = diffDays(timelineBounds.start, startDate) * dayWidth;
                    const width = Math.max(dayWidth, ((diffDays(timelineBounds.start, dueDate) - diffDays(timelineBounds.start, startDate)) + 1) * dayWidth);
                    taskMetrics[task.id] = { left, right: left + width, centerY: cursorTop + 21 };
                    cursorTop += 42;
                });
            });
            return { rows, taskTopById, taskMetrics, height: cursorTop };
        }, [collapsed, grouped, timelineBounds.start, dayWidth]);

        const dependencyPaths = useMemo(() => {
            if (!isDesktop) return [];
            const paths = [];
            relevantTasks.forEach((task) => {
                (task.blockedByTaskIds || []).forEach((blockedId) => {
                    const from = layout.taskMetrics[blockedId];
                    const to = layout.taskMetrics[task.id];
                    if (!from || !to) return;
                    const midX = Math.max(from.right + 12, to.left - 12);
                    paths.push('M ' + from.right + ' ' + from.centerY + ' H ' + midX + ' V ' + to.centerY + ' H ' + to.left);
                });
            });
            return paths;
        }, [isDesktop, layout.taskMetrics, relevantTasks]);

        return h('div', { className: 'planning-gantt-screen' },
            h('div', { className: 'planning-gantt-toolbar' },
                h('div', { className: 'planning-gantt-toolbar__group' },
                    h('button', {
                        type: 'button',
                        className: 'planning-btn planning-btn--sm' + (zoom === 'compact' ? ' planning-btn--active' : ''),
                        onClick: () => setZoom('compact'),
                    }, 'S'),
                    h('button', {
                        type: 'button',
                        className: 'planning-btn planning-btn--sm' + (zoom === 'normal' ? ' planning-btn--active' : ''),
                        onClick: () => setZoom('normal'),
                    }, 'M'),
                    h('button', {
                        type: 'button',
                        className: 'planning-btn planning-btn--sm' + (zoom === 'wide' ? ' planning-btn--active' : ''),
                        onClick: () => setZoom('wide'),
                        disabled: !isDesktop,
                    }, 'L'),
                ),
                h('span', { className: 'planning-gantt-toolbar__hint' }, isDesktop ? 'Drag/resize включён' : 'На мобилке — компактный режим'),
            ),
            h('div', { className: 'planning-gantt-container' },
                h('div', { className: 'planning-gantt-header' },
                    h('div', { className: 'planning-gantt-labels' }, 'Задачи'),
                    h('div', { className: 'planning-gantt-timeline-header' },
                        timelineDays.map((day) => h('div', {
                            key: day,
                            className: 'planning-gantt-day-header'
                                + (day === todayIso ? ' planning-gantt-day-header--today' : '')
                                + (isWeekendDay(day) ? ' planning-gantt-day-header--weekend' : ''),
                            style: { width: dayWidth + 'px' },
                        },
                            h('span', { className: 'planning-gantt-day-name' }, WEEKDAY_LABELS[(new Date(day + 'T12:00:00').getDay() + 6) % 7]),
                            h('span', { className: 'planning-gantt-day-num' }, day.slice(8)),
                        )),
                    ),
                ),
                relevantTasks.length === 0
                    ? h('div', { className: 'planning-empty' }, 'Нет задач с датами. Добавь даты или baseline на экране задач.')
                    : h('div', {
                        className: 'planning-gantt-body',
                        style: {
                            minWidth: (timelineDays.length * dayWidth) + 180 + 'px',
                            height: layout.height + 'px',
                        },
                    },
                        h('div', { className: 'planning-gantt-overlay', style: { height: layout.height + 'px', left: '140px', width: (timelineDays.length * dayWidth) + 'px' } },
                            isDesktop && dependencyPaths.length > 0 && h('svg', { className: 'planning-gantt-deps', width: timelineDays.length * dayWidth, height: layout.height },
                                h('defs', null,
                                    h('marker', { id: 'planning-arrow', markerWidth: '8', markerHeight: '8', refX: '6', refY: '4', orient: 'auto', markerUnits: 'strokeWidth' },
                                        h('path', { d: 'M 0 0 L 8 4 L 0 8 z', fill: 'rgba(37,99,235,0.66)' }),
                                    ),
                                ),
                                dependencyPaths.map((path, index) => h('path', {
                                    key: index,
                                    d: path,
                                    fill: 'none',
                                    stroke: 'rgba(37,99,235,0.66)',
                                    strokeWidth: '1.5',
                                    markerEnd: 'url(#planning-arrow)',
                                })),
                            ),
                            timelineDays.indexOf(todayIso) >= 0 && h('div', {
                                className: 'planning-gantt-today-line',
                                style: { left: (timelineDays.indexOf(todayIso) * dayWidth) + (dayWidth / 2) + 'px', height: layout.height + 'px' },
                            }),
                        ),
                        layout.rows.map((row) => row.type === 'group'
                            ? h('div', {
                                key: 'group-' + row.id,
                                className: 'planning-gantt-group-row',
                                style: { top: row.top + 'px', height: row.height + 'px' },
                            },
                                h('button', {
                                    type: 'button',
                                    className: 'planning-gantt-group-toggle',
                                    onClick: () => setCollapsed((current) => ({ ...current, [row.group.project.id]: !current[row.group.project.id] })),
                                }, collapsed[row.group.project.id] ? '▸' : '▾'),
                                h('span', {
                                    className: 'planning-gantt-group-dot',
                                    style: { background: row.group.project.color },
                                }),
                                h('span', { className: 'planning-gantt-group-name' }, row.group.project.name),
                                h('span', { className: 'planning-gantt-group-count' }, row.group.tasks.length),
                            )
                            : h('div', {
                                key: row.id,
                                className: 'planning-gantt-row',
                                style: { top: row.top + 'px', height: row.height + 'px' },
                            },
                                h('div', { className: 'planning-gantt-labels' },
                                    h('div', { className: 'planning-gantt-task-title' }, row.task.title),
                                    h('div', { className: 'planning-gantt-task-meta' }, [row.task.startDate, row.task.dueDate].filter(Boolean).join(' → ') || 'Без дат'),
                                ),
                                h('div', { className: 'planning-gantt-timeline' },
                                    h(GanttBar, {
                                        task: row.task,
                                        dayWidth,
                                        timelineStart: timelineBounds.start,
                                        color: getTaskProjectColor(row.task, state.projects),
                                        isDesktop,
                                        onUpdateTask: state.updateTask,
                                        onOpenTask: setSelectedTaskId,
                                    }),
                                ),
                            )),
                    ),
            ),
            selectedTaskId && PlanningTasks.TaskDetailModal && h(PlanningTasks.TaskDetailModal, {
                taskId: selectedTaskId,
                state,
                resolvedTaskProjectIds,
                onClose: () => setSelectedTaskId(null),
            }),
        );
    }

    HEYS.PlanningSchedule = {
        CalendarScreen,
        GanttScreen,
    };
})();
