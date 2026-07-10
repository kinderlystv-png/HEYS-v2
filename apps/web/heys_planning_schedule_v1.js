// heys_planning_schedule_v1.js — Calendar and Gantt screens for HEYS planning
(function () {
    'use strict';
    const React = window.React;
    const Planning = HEYS.Planning || {};
    const PlanningTasks = HEYS.PlanningTasks || {};
    const PlanningQuickTarget = HEYS.PlanningQuickTarget;
    const U = HEYS.utils || {};
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
    const CALENDAR_LOOKBACK_DAYS = 0;
    const CALENDAR_FORWARD_DAYS = 92;
    const CALENDAR_TOTAL_HEIGHT = HOURS.length * CALENDAR_HOUR_HEIGHT;
    const CALENDAR_DRAG_EDGE_THRESHOLD = 48;
    const CALENDAR_TOUCH_DRAG_HOLD_MS = 180;
    const CALENDAR_TOUCH_DRAG_MOVE_CANCEL_THRESHOLD = 12;
    const CALENDAR_POINTER_DRAG_MOVE_THRESHOLD = 6;
    const CALENDAR_CELL_LONG_PRESS_MS = 480;
    const CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD = 12;
    const CALENDAR_DAY_WINDOW_OPTIONS = [3, 5, 8];
    const CALENDAR_DAY_WINDOW_STORAGE_KEY = 'heys_planning_calendar_day_window';
    const CALENDAR_CONTEXT_VISIBILITY_STORAGE_KEY = 'heys_planning_calendar_show_day_context';
    const CALENDAR_STATE_VISIBILITY_STORAGE_KEY = 'heys_planning_calendar_show_state_markers';
    const CALENDAR_MEAL_DURATION_MINUTES = 30;
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
            const raw = typeof U.lsGet === 'function'
                ? U.lsGet(CALENDAR_DAY_WINDOW_STORAGE_KEY, null)
                : localStorage.getItem(CALENDAR_DAY_WINDOW_STORAGE_KEY);
            const n = Number(raw);
            if (CALENDAR_DAY_WINDOW_OPTIONS.indexOf(n) !== -1) return n;
        } catch (error) {
            // ignore
        }
        return 3;
    }

    function readStoredCalendarContextVisibility() {
        try {
            const stored = typeof U.lsGet === 'function'
                ? U.lsGet(CALENDAR_CONTEXT_VISIBILITY_STORAGE_KEY, '1')
                : localStorage.getItem(CALENDAR_CONTEXT_VISIBILITY_STORAGE_KEY);
            return stored !== '0';
        } catch (error) {
            return true;
        }
    }

    function storeCalendarContextVisibility(isVisible) {
        try {
            if (typeof U.lsSet === 'function') {
                U.lsSet(CALENDAR_CONTEXT_VISIBILITY_STORAGE_KEY, isVisible ? '1' : '0');
            }
        } catch (error) {
            // ignore quota / private mode
        }
    }

    function readStoredCalendarStateVisibility() {
        try {
            const stored = typeof U.lsGet === 'function'
                ? U.lsGet(CALENDAR_STATE_VISIBILITY_STORAGE_KEY, '1')
                : localStorage.getItem(CALENDAR_STATE_VISIBILITY_STORAGE_KEY);
            return stored !== '0';
        } catch (error) {
            return true;
        }
    }

    function storeCalendarStateVisibility(isVisible) {
        try {
            if (typeof U.lsSet === 'function') {
                U.lsSet(CALENDAR_STATE_VISIBILITY_STORAGE_KEY, isVisible ? '1' : '0');
            }
        } catch (error) {
            // ignore quota / private mode
        }
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

    function shouldCancelCalendarLongPress(startX, startY, currentX, currentY) {
        const distance = Math.hypot(
            (Number(currentX) || 0) - (Number(startX) || 0),
            (Number(currentY) || 0) - (Number(startY) || 0),
        );
        return distance >= CALENDAR_CELL_LONG_PRESS_MOVE_CANCEL_THRESHOLD;
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
            quickCreateMode: source?.quickCreateMode || '',
            isBackground: Boolean(source?.isBackground),
            bgColor: source?.bgColor || BACKGROUND_SLOT_COLORS[0].value,
            recurrenceGroupId: source?.recurrenceGroupId ? String(source.recurrenceGroupId) : '',
        };
    }

    function buildStandaloneQuickSlotOptions(source) {
        return {
            title: String(source?.title || '').trim() || 'Событие',
            date: dateStr(source?.date),
            startTime: source?.startTime || '09:00',
            endTime: source?.endTime || '10:00',
            source: 'user',
            isBackground: Boolean(source?.isBackground),
            bgColor: source?.isBackground ? source?.bgColor : undefined,
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

    function parseCalendarClockMinutes(value) {
        const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
        return (hours * 60) + minutes;
    }

    function buildCalendarSleepBlock(day) {
        const wakeTime = day?.sleepEnd || day?.wakeTime || day?.wokeAt;
        const wakeClockMinutes = parseCalendarClockMinutes(wakeTime);
        if (wakeClockMinutes == null) return null;

        let durationMinutes = null;
        const sleepClockMinutes = parseCalendarClockMinutes(day?.sleepStart);
        if (sleepClockMinutes != null) {
            durationMinutes = wakeClockMinutes - sleepClockMinutes;
            if (durationMinutes <= 0) durationMinutes += MINUTES_IN_DAY;
        } else {
            const sleepHours = Number(day?.sleepHours);
            if (Number.isFinite(sleepHours) && sleepHours > 0) {
                durationMinutes = Math.round(sleepHours * 60);
            }
        }

        if (!durationMinutes || durationMinutes > (16 * 60)) return null;

        const calendarStartMinutes = CALENDAR_START_HOUR * 60;
        const calendarEndMinutes = (CALENDAR_END_HOUR + 1) * 60;
        const wakeDisplayMinutes = wakeClockMinutes < calendarStartMinutes
            ? wakeClockMinutes + MINUTES_IN_DAY
            : wakeClockMinutes;
        const startDisplayMinutes = Math.max(calendarStartMinutes, wakeDisplayMinutes - durationMinutes);
        const endDisplayMinutes = Math.min(calendarEndMinutes, wakeDisplayMinutes);
        if (endDisplayMinutes <= startDisplayMinutes) return null;

        return {
            top: ((startDisplayMinutes - calendarStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT,
            height: ((endDisplayMinutes - startDisplayMinutes) / 60) * CALENDAR_HOUR_HEIGHT,
            startTime: formatClockTime(startDisplayMinutes),
            endTime: formatClockTime(endDisplayMinutes),
        };
    }

    function buildCalendarDayContextBlocks(day) {
        const calendarStartMinutes = CALENDAR_START_HOUR * 60;
        const calendarEndMinutes = (CALENDAR_END_HOUR + 1) * 60;
        const toBlock = ({ id, kind, title, startTime, durationMinutes }) => {
            const clockMinutes = parseCalendarClockMinutes(startTime);
            const safeDuration = Math.max(1, Math.round(Number(durationMinutes) || 0));
            if (clockMinutes == null || !safeDuration) return null;

            const displayStart = clockMinutes < calendarStartMinutes
                ? clockMinutes + MINUTES_IN_DAY
                : clockMinutes;
            const clippedStart = Math.max(displayStart, calendarStartMinutes);
            const clippedEnd = Math.min(displayStart + safeDuration, calendarEndMinutes);
            if (clippedEnd <= clippedStart) return null;

            return {
                id,
                kind,
                title,
                top: ((clippedStart - calendarStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT,
                height: ((clippedEnd - clippedStart) / 60) * CALENDAR_HOUR_HEIGHT,
                startTime: formatClockTime(clippedStart),
                endTime: formatClockTime(clippedEnd),
            };
        };

        const mealBlocks = (Array.isArray(day?.meals) ? day.meals : [])
            .map((meal, index) => {
                if (!meal || !Array.isArray(meal.items) || meal.items.length === 0) return null;
                return toBlock({
                    id: 'meal-' + String(meal.id || index),
                    kind: 'meal',
                    title: 'Приём пищи',
                    startTime: meal.time,
                    durationMinutes: CALENDAR_MEAL_DURATION_MINUTES,
                });
            })
            .filter(Boolean);

        const trainingBlocks = (Array.isArray(day?.trainings) ? day.trainings : [])
            .map((training, index) => {
                const durationMinutes = (Array.isArray(training?.z) ? training.z : [])
                    .reduce((sum, minutes) => sum + Math.max(0, Number(minutes) || 0), 0);
                if (!durationMinutes) return null;
                return toBlock({
                    id: 'training-' + String(training?.id || index),
                    kind: 'training',
                    title: String(training?.activityLabel || '').trim() || 'Тренировка',
                    startTime: training?.time,
                    durationMinutes,
                });
            })
            .filter(Boolean);

        return mealBlocks.concat(trainingBlocks).sort((left, right) => left.top - right.top);
    }

    function readCalendarHungerEvents() {
        try {
            if (typeof HEYS.HungerEnergyStatusStorage?.readEvents === 'function') {
                return HEYS.HungerEnergyStatusStorage.readEvents() || [];
            }
        } catch (_) { /* noop */ }
        try {
            if (typeof HEYS.utils?.lsGet === 'function') {
                return HEYS.utils.lsGet('heys_hunger_energy_status_events_v1', []) || [];
            }
        } catch (_) { /* noop */ }
        return [];
    }

    function buildCalendarStateMarkers(day, hungerEvents, displayDate) {
        const calendarStartMinutes = CALENDAR_START_HOUR * 60;
        const markerDate = dateStr(displayDate || day?.date);
        if (!markerDate) return [];

        const toMarker = ({ id, kind, value, time, label }) => {
            const level = Math.round(Number(value));
            const clockMinutes = parseCalendarClockMinutes(time);
            if (!Number.isFinite(level) || level < 1 || level > 10 || clockMinutes == null) return null;
            const displayMinutes = clockMinutes < calendarStartMinutes
                ? clockMinutes + MINUTES_IN_DAY
                : clockMinutes;
            return {
                id,
                kind,
                value: level,
                label,
                time: formatClockTime(displayMinutes),
                top: ((displayMinutes - calendarStartMinutes) / 60) * CALENDAR_HOUR_HEIGHT,
                tone: kind === 'hunger'
                    ? (level >= 7 ? 'alert' : level >= 4 ? 'attention' : 'calm')
                    : (level <= 3 ? 'alert' : level <= 6 ? 'attention' : 'calm'),
            };
        };

        const hungerMarkers = (Array.isArray(hungerEvents) ? hungerEvents : [])
            .map((row, index) => {
                const recordedAt = row?.recordedAt || row?.createdAt;
                const recordedDate = new Date(recordedAt);
                if (!Number.isFinite(recordedDate.getTime())) return null;
                const eventDate = dateStr(row?.date) || (() => {
                    const localDate = pad2(recordedDate.getFullYear()) + '-'
                        + pad2(recordedDate.getMonth() + 1) + '-'
                        + pad2(recordedDate.getDate());
                    return recordedDate.getHours() < CALENDAR_START_HOUR ? addDays(localDate, -1) : localDate;
                })();
                if (eventDate !== markerDate) return null;
                return toMarker({
                    id: 'hunger-' + String(row?.id || index),
                    kind: 'hunger',
                    value: row?.hungerLevel ?? row?.input?.hungerLevel,
                    time: pad2(recordedDate.getHours()) + ':' + pad2(recordedDate.getMinutes()),
                    label: 'Голод',
                });
            })
            .filter(Boolean);

        const wellbeingMarkers = [];
        const addWellbeing = (id, value, time, label) => {
            const marker = toMarker({ id, kind: 'wellbeing', value, time, label });
            if (marker) wellbeingMarkers.push(marker);
        };

        addWellbeing('wellbeing-morning', day?.wellbeingMorning, day?.sleepEnd, 'Самочувствие после сна');
        (Array.isArray(day?.meals) ? day.meals : []).forEach((meal, index) => {
            if (!Array.isArray(meal?.items) || meal.items.length === 0) return;
            addWellbeing(
                'wellbeing-meal-' + String(meal?.id || index),
                meal?.wellbeing,
                meal?.time,
                'Самочувствие после еды',
            );
        });
        (Array.isArray(day?.trainings) ? day.trainings : []).forEach((training, index) => {
            const duration = (Array.isArray(training?.z) ? training.z : [])
                .reduce((sum, minutes) => sum + Math.max(0, Number(minutes) || 0), 0);
            if (!duration) return;
            addWellbeing(
                'wellbeing-training-' + String(training?.id || index),
                training?.wellbeing,
                training?.time,
                'Самочувствие после тренировки',
            );
        });

        return hungerMarkers.concat(wellbeingMarkers).sort((left, right) => (
            left.top - right.top || left.kind.localeCompare(right.kind)
        ));
    }

    function resolveCalendarDropConflict(daySlots, candidateStartTime, durationMinutes, options = {}) {
        const calendarStartMinutes = CALENDAR_START_HOUR * 60;
        const calendarEndMinutes = (CALENDAR_END_HOUR + 1) * 60;
        const candidateStart = getCalendarDisplayMinutes(candidateStartTime);
        const safeDuration = Math.max(30, Math.round(Number(durationMinutes) || 0));
        const candidateEnd = candidateStart + safeDuration;
        const excludeSlotId = String(options.excludeSlotId || '');
        const ranges = (Array.isArray(daySlots) ? daySlots : [])
            .filter((slot) => !excludeSlotId || String(slot?.id || '') !== excludeSlotId)
            .map((slot) => ({
                start: getCalendarDisplayMinutes(slot?.startTime),
                end: getCalendarDisplayEndMinutes(slot),
            }))
            .filter((range) => range.end > range.start);

        const sleepBlock = options.sleepBlock;
        if (sleepBlock?.startTime && sleepBlock?.endTime) {
            const sleepStart = getCalendarDisplayMinutes(sleepBlock.startTime);
            let sleepEnd = getCalendarDisplayMinutes(sleepBlock.endTime);
            if (sleepEnd <= sleepStart) sleepEnd += MINUTES_IN_DAY;
            if (sleepEnd > sleepStart) ranges.push({ start: sleepStart, end: sleepEnd });
        }

        (Array.isArray(options.contextBlocks) ? options.contextBlocks : []).forEach((block) => {
            if (!block?.startTime || !block?.endTime) return;
            const blockStart = getCalendarDisplayMinutes(block.startTime);
            let blockEnd = getCalendarDisplayMinutes(block.endTime);
            if (blockEnd <= blockStart) blockEnd += MINUTES_IN_DAY;
            if (blockEnd > blockStart) ranges.push({ start: blockStart, end: blockEnd });
        });

        const overlaps = (start, end, range) => start < range.end && range.start < end;
        const conflicts = ranges.filter((range) => overlaps(candidateStart, candidateEnd, range));
        if (conflicts.length === 0) {
            return { hasConflict: false, conflictCount: 0, suggestedStartTime: '', suggestedEndTime: '' };
        }

        const isRangeFree = (start) => {
            const end = start + safeDuration;
            if (start < calendarStartMinutes || end > calendarEndMinutes) return false;
            return !ranges.some((range) => overlaps(start, end, range));
        };

        let suggestedStart = null;
        for (let offset = CALENDAR_SNAP_MINUTES; offset <= (calendarEndMinutes - calendarStartMinutes); offset += CALENDAR_SNAP_MINUTES) {
            const after = candidateStart + offset;
            const before = candidateStart - offset;
            if (isRangeFree(after)) {
                suggestedStart = after;
                break;
            }
            if (isRangeFree(before)) {
                suggestedStart = before;
                break;
            }
        }

        return {
            hasConflict: true,
            conflictCount: conflicts.length,
            suggestedStartTime: suggestedStart == null ? '' : formatClockTime(suggestedStart),
            suggestedEndTime: suggestedStart == null ? '' : formatClockTime(suggestedStart + safeDuration),
        };
    }

    function resolveCalendarConflictChoiceTarget(conflict, useSuggested) {
        const targetTime = useSuggested ? conflict?.suggestedStartTime : conflict?.startTime;
        const displayDay = String(conflict?.displayDay || '');
        if (!targetTime || !displayDay) return null;

        const targetMinutes = timeToMinutes(targetTime);
        const displayHour = Math.floor(targetMinutes / 60)
            + (targetMinutes < (CALENDAR_START_HOUR * 60) ? 24 : 0);
        const subHourMinutes = targetMinutes % 60;
        const target = resolveCalendarCellStart(displayDay, displayHour, subHourMinutes);
        return {
            date: target.date,
            time: target.time,
            displayHour,
            subHourMinutes,
        };
    }

    function readCalendarDayV2(dateKey) {
        try {
            if (HEYS.MorningCheckinUtils && typeof HEYS.MorningCheckinUtils.readDayV2ScopedFirst === 'function') {
                return HEYS.MorningCheckinUtils.readDayV2ScopedFirst(dateKey, {}) || {};
            }
        } catch (_) { /* noop */ }
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet('heys_dayv2_' + dateKey, {}) || {};
            }
        } catch (_) { /* noop */ }
        return {};
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

    function getCalendarTaskPickerPriorityRank(task) {
        const priority = String(task?.priority || 'p2').toLowerCase();
        if (priority === 'p!') return 0;
        if (priority === 'p1') return 1;
        if (priority === 'p2') return 2;
        if (priority === 'p3') return 3;
        return 9;
    }

    function getTaskCalendarSlotState(taskId, slots) {
        const normalizedTaskId = String(taskId || '');
        const recurrenceDatesByGroup = new Map();
        let hasSlot = false;

        (Array.isArray(slots) ? slots : []).forEach((slot) => {
            if (!normalizedTaskId || String(slot?.taskId || '') !== normalizedTaskId) return;
            hasSlot = true;
            const groupId = String(slot?.recurrenceGroupId || '');
            if (!groupId) return;
            if (!recurrenceDatesByGroup.has(groupId)) recurrenceDatesByGroup.set(groupId, new Set());
            recurrenceDatesByGroup.get(groupId).add(dateStr(slot?.date));
        });

        return {
            hasSlot,
            hasActiveRecurrence: Array.from(recurrenceDatesByGroup.values()).some((dates) => dates.size > 1),
        };
    }

    function canTaskAddCalendarSlot(taskId, slots) {
        const slotState = getTaskCalendarSlotState(taskId, slots);
        return !slotState.hasSlot || slotState.hasActiveRecurrence;
    }

    function buildCalendarTaskPickerTasks(tasks, query, parentTaskIdsWithChildren, slots) {
        const needle = String(query || '').trim().toLowerCase();
        const parentIds = parentTaskIdsWithChildren && typeof parentTaskIdsWithChildren.has === 'function'
            ? parentTaskIdsWithChildren
            : new Set();

        return (Array.isArray(tasks) ? tasks : [])
            .filter((task) => {
                if (!task || task.status === 'done' || task.status === 'cancelled') return false;
                if (parentIds.has(task.id)) return false;
                if (!canTaskAddCalendarSlot(task.id, slots)) return false;
                const title = String(task.title || '').trim();
                if (!title) return false;
                return !needle || title.toLowerCase().includes(needle);
            })
            .slice()
            .sort((left, right) => {
                const priorityDelta = getCalendarTaskPickerPriorityRank(left) - getCalendarTaskPickerPriorityRank(right);
                if (priorityDelta) return priorityDelta;
                const orderDelta = (Number(left.order) || 0) - (Number(right.order) || 0);
                if (orderDelta) return orderDelta;
                return String(left.title || '').localeCompare(String(right.title || ''), 'ru');
            });
    }

    function buildCalendarOverdueSlotItemsByDay(tasks, slots, todayIso, calendarDays, parentTaskIdsWithChildren) {
        const map = {};
        (Array.isArray(calendarDays) ? calendarDays : []).forEach((day) => { map[day] = []; });
        if (!todayIso || !map[todayIso]) return map;

        const parentIds = parentTaskIdsWithChildren && typeof parentTaskIdsWithChildren.has === 'function'
            ? parentTaskIdsWithChildren
            : new Set();
        const taskById = new Map(
            (Array.isArray(tasks) ? tasks : [])
                .filter((task) => task?.id)
                .map((task) => [String(task.id), task]),
        );
        const overdueSlotByTaskId = new Map();

        (Array.isArray(slots) ? slots : []).forEach((slot) => {
            const taskId = slot?.taskId ? String(slot.taskId) : '';
            const displayDate = getCalendarDisplayDate(slot);
            if (!taskId || !displayDate || displayDate >= todayIso) return;

            const task = taskById.get(taskId);
            if (!task || task.status === 'done' || task.status === 'cancelled') return;
            if (parentIds.has(task.id)) return;

            const existing = overdueSlotByTaskId.get(taskId);
            const existingDate = existing ? getCalendarDisplayDate(existing) : '';
            const isLater = !existing
                || displayDate > existingDate
                || (displayDate === existingDate
                    && getCalendarDisplayMinutes(slot.startTime) > getCalendarDisplayMinutes(existing.startTime));
            if (isLater) overdueSlotByTaskId.set(taskId, slot);
        });

        map[todayIso] = Array.from(overdueSlotByTaskId.entries())
            .map(([taskId, slot]) => ({
                task: taskById.get(taskId),
                slot,
                overdueDate: getCalendarDisplayDate(slot),
            }))
            .sort((left, right) => {
                if (left.overdueDate !== right.overdueDate) return left.overdueDate.localeCompare(right.overdueDate);
                const timeDelta = getCalendarDisplayMinutes(left.slot.startTime) - getCalendarDisplayMinutes(right.slot.startTime);
                if (timeDelta) return timeDelta;
                return getCalendarTaskPickerPriorityRank(left.task) - getCalendarTaskPickerPriorityRank(right.task)
                    || ((Number(left.task.order) || 0) - (Number(right.task.order) || 0))
                    || String(left.task.title || '').localeCompare(String(right.task.title || ''), 'ru');
            });

        return map;
    }

    function isPlanningCalendarDragPayload(payload) {
        return payload?.type === 'task' || payload?.type === 'slot';
    }

    function removeCalendarSlotKeepTask(state, slot) {
        if (!slot?.id || typeof state?.deleteSlot !== 'function') return;
        state.deleteSlot(slot.id);
    }

    function buildCalendarSlotUndoEntry(state, action) {
        const slotId = String(action?.slotId || '');
        if (!slotId) return null;
        if (action?.kind === 'move' && typeof state?.updateSlot === 'function') {
            const original = action.original || {};
            return {
                label: 'Слот перенесён',
                undo: () => state.updateSlot(slotId, {
                    date: original.date,
                    startTime: original.startTime,
                    endTime: original.endTime,
                }),
            };
        }
        if (action?.kind === 'create' && typeof state?.deleteSlot === 'function') {
            return {
                label: 'Слот добавлен',
                undo: () => state.deleteSlot(slotId),
            };
        }
        return null;
    }

    function SlotDeleteActionSheet({ hasLinkedTask, onClose, onSlotOnly, onSlotAndTask }) {
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
                }, 'Убрать только из календаря'),
                hasLinkedTask && h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-slot-delete-sheet__btn--danger',
                    onClick: () => {
                        onSlotAndTask();
                        onClose();
                    },
                }, 'Удалить задачу целиком'),
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

    function CalendarDropConflictSheet({ conflict, onClose, onUseSuggested, onKeepParallel }) {
        const suggestedRange = conflict?.suggestedStartTime && conflict?.suggestedEndTime
            ? conflict.suggestedStartTime + '–' + conflict.suggestedEndTime
            : '';
        return h('div', {
            className: 'planning-slot-delete-overlay planning-calendar-conflict-overlay',
            onClick: onClose,
            role: 'presentation',
        },
            h('div', {
                className: 'planning-slot-delete-sheet planning-calendar-conflict-sheet',
                onClick: (event) => event.stopPropagation(),
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'planning-calendar-conflict-title',
            },
                h('div', {
                    id: 'planning-calendar-conflict-title',
                    className: 'planning-slot-delete-sheet__title',
                }, 'Время уже занято'),
                h('p', { className: 'planning-slot-delete-sheet__hint' },
                    suggestedRange
                        ? 'Ближайшее свободное окно: ' + suggestedRange + '.'
                        : 'Свободного окна такой длительности в этом дне нет.',
                ),
                suggestedRange && h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-calendar-conflict-sheet__btn--primary',
                    onClick: onUseSuggested,
                }, 'Перенести на ' + suggestedRange),
                h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-calendar-conflict-sheet__btn--parallel',
                    onClick: onKeepParallel,
                }, 'Оставить параллельно'),
                h('button', {
                    type: 'button',
                    className: 'planning-slot-delete-sheet__btn planning-slot-delete-sheet__btn--ghost',
                    onClick: onClose,
                }, 'Отмена'),
            ),
        );
    }

    function CalendarDisplaySettingsSheet({
        isContextVisible,
        isStateVisible,
        onToggleContext,
        onToggleState,
        onClose,
    }) {
        const renderSwitch = (label, checked, onToggle) => h('button', {
            type: 'button',
            className: 'planning-calendar-display-settings__row',
            role: 'switch',
            'aria-checked': checked ? 'true' : 'false',
            onClick: onToggle,
        },
            h('span', { className: 'planning-calendar-display-settings__label' }, label),
            h('span', {
                className: 'planning-calendar-display-settings__switch' + (checked ? ' is-active' : ''),
                'aria-hidden': 'true',
            }, h('span', { className: 'planning-calendar-display-settings__thumb' })),
        );

        return h('div', {
            className: 'planning-slot-delete-overlay planning-calendar-display-settings-overlay',
            onClick: onClose,
            role: 'presentation',
        },
            h('div', {
                className: 'planning-slot-delete-sheet planning-calendar-display-settings-sheet',
                onClick: (event) => event.stopPropagation(),
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'planning-calendar-display-settings-title',
            },
                h('div', { className: 'planning-calendar-display-settings__head' },
                    h('div', {
                        id: 'planning-calendar-display-settings-title',
                        className: 'planning-slot-delete-sheet__title',
                    }, 'Слои календаря'),
                    h('button', {
                        type: 'button',
                        className: 'planning-calendar-display-settings__close',
                        onClick: onClose,
                        'aria-label': 'Закрыть настройки календаря',
                    }, '×'),
                ),
                renderSwitch('Еда и тренировки', isContextVisible, onToggleContext),
                renderSwitch('Голод и самочувствие', isStateVisible, onToggleState),
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

    function QuickCreateFlowSheet({ draft, onSelect, onClose }) {
        useEffect(() => {
            document.body.classList.add('planning-quick-event-modal-open');
            return () => document.body.classList.remove('planning-quick-event-modal-open');
        }, []);

        const dateValue = dateStr(draft?.date);
        const dateLabel = dateValue
            ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
                .format(new Date(dateValue + 'T12:00:00'))
            : '';
        const timeLabel = [draft?.startTime, draft?.endTime].filter(Boolean).join('–');

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--quick-event planning-quick-flow-overlay',
            onClick: onClose,
        },
            h('div', {
                className: 'planning-quick-flow-sheet',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'planning-quick-flow-title',
                onClick: (event) => event.stopPropagation(),
            },
                h('div', { className: 'planning-quick-flow-sheet__header' },
                    h('div', null,
                        h('div', { id: 'planning-quick-flow-title', className: 'planning-quick-flow-sheet__title' }, 'Что добавить?'),
                        h('div', { className: 'planning-quick-flow-sheet__time' }, [dateLabel, timeLabel].filter(Boolean).join(' · ')),
                    ),
                    h('button', {
                        type: 'button',
                        className: 'planning-modal__close planning-modal__close--quick-event',
                        onClick: onClose,
                        'aria-label': 'Закрыть',
                    }, '×'),
                ),
                h('div', { className: 'planning-quick-flow-sheet__actions' },
                    h('button', {
                        type: 'button',
                        className: 'planning-quick-flow-option planning-quick-flow-option--primary',
                        onClick: () => onSelect('event'),
                    },
                        h('span', { className: 'planning-quick-flow-option__icon', 'aria-hidden': 'true' }, '○'),
                        h('span', { className: 'planning-quick-flow-option__copy' },
                            h('strong', null, 'Разовое событие'),
                            h('span', null, 'Для дела, которое не нужно отслеживать'),
                        ),
                        h('span', { className: 'planning-quick-flow-option__arrow', 'aria-hidden': 'true' }, '›'),
                    ),
                    h('button', {
                        type: 'button',
                        className: 'planning-quick-flow-option',
                        onClick: () => onSelect('task'),
                    },
                        h('span', { className: 'planning-quick-flow-option__icon', 'aria-hidden': 'true' }, '✓'),
                        h('span', { className: 'planning-quick-flow-option__copy' },
                            h('strong', null, 'Задача'),
                            h('span', null, 'Можно менять статус и отмечать выполненной'),
                        ),
                        h('span', { className: 'planning-quick-flow-option__arrow', 'aria-hidden': 'true' }, '›'),
                    ),
                ),
                h('button', {
                    type: 'button',
                    className: 'planning-quick-flow-sheet__cancel',
                    onClick: onClose,
                }, 'Отмена'),
            ),
        );
    }

    function QuickSlotModal({ draft, state, onClose }) {
        const { isDesktop } = usePlanningViewport();
        const isStandaloneEvent = draft?.quickCreateMode === 'event';
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
            draft?.quickCreateMode,
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
            const taskTitle = cleanTitle || (isStandaloneEvent ? 'Событие' : 'Задача');

            if (isStandaloneEvent) {
                state.addSlot(buildStandaloneQuickSlotOptions({
                    title: taskTitle,
                    date,
                    startTime: st,
                    endTime: et,
                    isBackground,
                    bgColor,
                }));
                onClose();
                return;
            }

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
                        h('span', { className: 'planning-modal__header-title planning-modal__header-title--quick-event' },
                            isStandaloneEvent ? 'Разовое событие' : 'Новая задача',
                        ),
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
                            placeholder: isStandaloneEvent ? 'Название события' : 'Название задачи',
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
                    !isStandaloneEvent && h('div', { className: 'planning-quick-slot-target-wrap' },
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
                    !isStandaloneEvent && h('div', { className: 'planning-add-project' },
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
                    !isStandaloneEvent && h('div', { className: 'planning-quick-repeat' },
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
        const slotHeight = Number.parseFloat(String(style?.height || '')) || 0;
        const isCompactSlot = slotHeight > 0 && slotHeight <= 36;
        const isShortSlot = slotHeight > 0 && slotHeight <= 64;
        const showFooter = Boolean(
            showSubtitle
            || typeof onTaskStatusToggle === 'function'
            || typeof onDeleteClick === 'function'
            || showCarryover,
        );

        return h('div', {
            className: 'planning-calendar-slot'
                + (className || '')
                + (isCompactSlot ? ' planning-calendar-slot--compact' : '')
                + (!isCompactSlot && isShortSlot ? ' planning-calendar-slot--short' : '')
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
            h('div', { className: 'planning-calendar-slot__text' },
                parentGroupLabel && h('span', {
                    className: 'planning-calendar-slot__parent',
                    title: parentGroupLabel,
                }, parentGroupLabel),
                h('span', {
                    className: 'planning-calendar-slot__title' + (parentGroupLabel ? ' planning-calendar-slot__title--with-parent' : ''),
                }, title),
            ),
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
        slot,
        overdueDate,
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
        const dragPayload = slot?.id
            ? { type: 'slot', slotId: slot.id }
            : { type: 'task', taskId: task.id };
        const dragSourceKey = slot?.id ? ('slot:' + slot.id) : ('task:' + task.id);
        const overdueTimeLabel = slot?.startTime
            ? [overdueDate, slot.startTime + (slot.endTime ? ('–' + slot.endTime) : '')].filter(Boolean).join(' · ')
            : overdueDate;
        const taskTitle = parentGroupLabel ? (parentGroupLabel + ' · ' + task.title) : task.title;

        return h('div', {
            className: 'planning-calendar-unscheduled-pill'
                + (slot?.id ? ' planning-calendar-unscheduled-pill--overdue' : '')
                + (isTouchDragSource ? ' planning-calendar-unscheduled-pill--touch-dragging' : ''),
            draggable: (allowNativeDrag !== false) && !isTouchDevicePreferred(),
            style: {
                '--planning-unscheduled-project-color': projectColor,
                touchAction: 'none',
            },
            title: overdueTimeLabel ? (taskTitle + ' · ' + overdueTimeLabel) : taskTitle,
            'aria-label': overdueTimeLabel ? ('Просрочено: ' + taskTitle + '. ' + overdueTimeLabel) : taskTitle,
            onPointerDown: (event) => {
                const pointerType = String(event?.pointerType || '').toLowerCase();
                if ((pointerType === 'touch' || pointerType === 'pen') && event?.cancelable) {
                    // On mobile, block native scroll/drag so custom calendar drag keeps receiving move events.
                    event.preventDefault();
                }
                if (typeof onPointerDragStart === 'function') {
                    onPointerDragStart({
                        event,
                        payload: dragPayload,
                        sourceKey: dragSourceKey,
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
                        payload: dragPayload,
                        sourceKey: dragSourceKey,
                        title: task.title,
                        badgeText: '',
                        parentGroupLabel,
                        accentColor: projectColor,
                    });
                }
            },
            onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(
                    slot?.id ? 'text/heys-planning-slot' : 'text/heys-planning-task',
                    JSON.stringify(dragPayload),
                );
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

    function CalendarTaskPickerModal({
        tasks,
        projects,
        slots,
        taskLookup,
        parentTaskIdsWithChildren,
        onClose,
        onOpenTask,
        onCompleteTask,
        onDeleteTask,
        onDragStateChange,
        onTouchDragStart,
        onPointerDragStart,
        shouldSuppressClick,
        allowNativeDrag,
    }) {
        const [query, setQuery] = useState('');
        const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState('');
        const visibleTasks = useMemo(
            () => buildCalendarTaskPickerTasks(tasks, query, parentTaskIdsWithChildren, slots),
            [tasks, query, parentTaskIdsWithChildren, slots],
        );

        useEffect(() => {
            if (!confirmDeleteTaskId) return undefined;
            const timer = window.setTimeout(() => setConfirmDeleteTaskId(''), 3000);
            return () => window.clearTimeout(timer);
        }, [confirmDeleteTaskId]);

        const closeAfterDragActivation = () => {
            if (typeof onClose === 'function') onClose();
        };

        const renderTask = (task) => {
            const parentGroupLabel = buildTaskParentGroupLabel(task, taskLookup);
            const projectColor = getTaskProjectColor(task, projects);
            const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.p2 || {};
            const hasActiveRecurrence = getTaskCalendarSlotState(task.id, slots).hasActiveRecurrence;
            const isDeleteArmed = confirmDeleteTaskId === task.id;
            const startDrag = (event, mode) => {
                event.stopPropagation();
                const starter = mode === 'touch' ? onTouchDragStart : onPointerDragStart;
                if (typeof starter !== 'function') return;
                starter({
                    event,
                    payload: { type: 'task', taskId: task.id },
                    sourceKey: 'task:' + task.id,
                    title: task.title,
                    badgeText: '',
                    parentGroupLabel,
                    accentColor: projectColor,
                    onDragStateChange,
                    onDragActivated: closeAfterDragActivation,
                });
            };

            const completeTask = (event) => {
                event.stopPropagation();
                setConfirmDeleteTaskId('');
                if (typeof onCompleteTask === 'function') onCompleteTask(task.id);
            };

            const openTask = (event) => {
                if (event) event.stopPropagation();
                if (typeof shouldSuppressClick === 'function' && shouldSuppressClick()) return;
                if (typeof onOpenTask !== 'function') return;
                onClose();
                onOpenTask(task.id);
            };

            const deleteTask = (event) => {
                event.stopPropagation();
                if (!isDeleteArmed) {
                    setConfirmDeleteTaskId(task.id);
                    return;
                }
                setConfirmDeleteTaskId('');
                if (typeof onDeleteTask === 'function') onDeleteTask(task.id);
            };

            return h('div', {
                key: task.id,
                className: 'planning-calendar-task-picker__task',
                style: { '--planning-task-picker-color': projectColor },
                title: parentGroupLabel ? (parentGroupLabel + ' · ' + task.title) : task.title,
            },
                h('button', {
                    type: 'button',
                    className: 'planning-calendar-task-picker__task-main',
                    draggable: (allowNativeDrag !== false) && !isTouchDevicePreferred(),
                    onPointerDown: (event) => startDrag(event, 'pointer'),
                    onTouchStart: (event) => {
                        if (typeof window.PointerEvent === 'function') return;
                        startDrag(event, 'touch');
                    },
                    onDragStart: (event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = 'copyMove';
                        event.dataTransfer.setData('text/heys-planning-task', JSON.stringify({ type: 'task', taskId: task.id }));
                        const emptyImg = new Image();
                        emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                        event.dataTransfer.setDragImage(emptyImg, 0, 0);
                        closeAfterDragActivation();
                    },
                    onClick: openTask,
                },
                    h('span', {
                        className: 'planning-calendar-task-picker__priority',
                        style: {
                            color: priority.color || undefined,
                            background: priority.bg || undefined,
                            borderColor: priority.border || undefined,
                        },
                    }, priority.label || task.priority || 'P2'),
                    h('span', { className: 'planning-calendar-task-picker__body' },
                        parentGroupLabel && h('span', {
                            className: 'planning-calendar-task-picker__parent',
                        }, parentGroupLabel),
                        h('span', { className: 'planning-calendar-task-picker__title' }, task.title),
                    ),
                    hasActiveRecurrence && h('span', {
                        className: 'planning-calendar-task-picker__scheduled',
                        'aria-label': 'Повторение включено',
                        title: 'Повторение включено',
                    }, '↻'),
                ),
                h('span', { className: 'planning-calendar-task-picker__actions' },
                    h('button', {
                        type: 'button',
                        className: 'planning-calendar-task-picker__action planning-calendar-task-picker__action--edit',
                        'aria-label': 'Редактировать задачу',
                        title: 'Редактировать задачу',
                        onPointerDown: (event) => event.stopPropagation(),
                        onClick: openTask,
                    }, '✎'),
                    h('button', {
                        type: 'button',
                        className: 'planning-calendar-task-picker__action planning-calendar-task-picker__action--complete',
                        'aria-label': 'Отметить выполненной',
                        title: 'Отметить выполненной',
                        onPointerDown: (event) => event.stopPropagation(),
                        onClick: completeTask,
                    }, '✓'),
                    h('button', {
                        type: 'button',
                        className: 'planning-calendar-task-picker__action planning-calendar-task-picker__action--delete'
                            + (isDeleteArmed ? ' is-armed' : ''),
                        'aria-label': isDeleteArmed ? 'Подтвердить удаление задачи' : 'Удалить задачу',
                        title: isDeleteArmed ? 'Нажми ещё раз, чтобы удалить' : 'Удалить задачу',
                        onPointerDown: (event) => event.stopPropagation(),
                        onClick: deleteTask,
                    }, isDeleteArmed ? 'Да' : '×'),
                ),
            );
        };

        return h('div', {
            className: 'planning-calendar-task-picker-overlay',
            onClick: onClose,
            role: 'presentation',
        },
            h('div', {
                className: 'planning-calendar-task-picker',
                onClick: (event) => event.stopPropagation(),
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': 'planning-calendar-task-picker-title',
            },
                h('div', { className: 'planning-calendar-task-picker__head' },
                    h('div', { id: 'planning-calendar-task-picker-title', className: 'planning-calendar-task-picker__title-main' }, 'Добавить задачу'),
                    h('button', {
                        type: 'button',
                        className: 'planning-calendar-task-picker__close',
                        'aria-label': 'Закрыть',
                        title: 'Закрыть',
                        onClick: onClose,
                    }, '×'),
                ),
                h('input', {
                    className: 'planning-calendar-task-picker__search',
                    type: 'search',
                    value: query,
                    placeholder: 'Поиск по названию',
                    autoFocus: true,
                    onChange: (event) => setQuery(event.target.value),
                }),
                h('div', { className: 'planning-calendar-task-picker__list' },
                    visibleTasks.length
                        ? visibleTasks.map(renderTask)
                        : h('div', { className: 'planning-calendar-task-picker__empty' }, 'Задач не найдено'),
                ),
            ),
        );
    }

    function CalendarScreen({ state }) {
        const { isDesktop } = usePlanningViewport();
        const [slotDraft, setSlotDraft] = useState(null);
        const [selectedTaskId, setSelectedTaskId] = useState(null);
        const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
        const [resizePreview, setResizePreview] = useState(null);
        const [calendarDayWindow, setCalendarDayWindow] = useState(readStoredCalendarDayWindow);
        const [calendarViewportWidth, setCalendarViewportWidth] = useState(0);
        const [calendarViewportHeight, setCalendarViewportHeight] = useState(0);
        const [nowLineTop, setNowLineTop] = useState(() => getCalendarNowTop());
        const [shouldCenterNow, setShouldCenterNow] = useState(true);
        const [isCalendarContextVisible, setIsCalendarContextVisible] = useState(readStoredCalendarContextVisibility);
        const [isCalendarStateVisible, setIsCalendarStateVisible] = useState(readStoredCalendarStateVisibility);
        const [calendarStateVersion, setCalendarStateVersion] = useState(0);
        const [isDragCancelTargetActive, setIsDragCancelTargetActive] = useState(false);
        const [calendarCellDropPreview, setCalendarCellDropPreview] = useState(null);
        const [calendarDropCommitAccent, setCalendarDropCommitAccent] = useState(null);
        const headerFrame = { ready: true, top: 0, left: 0, width: 0, height: 0 };
        const [isCalendarDragZoomActive, setIsCalendarDragZoomActive] = useState(false);
        const [touchDragPreview, setTouchDragPreview] = useState(null);
        const [touchDragSourceKey, setTouchDragSourceKey] = useState('');
        const [rangeSelectPreview, setRangeSelectPreview] = useState(null);
        const [slotDeleteTarget, setSlotDeleteTarget] = useState(null);
        const [calendarUndoEntry, setCalendarUndoEntry] = useState(null);
        const [calendarDropConflictChoice, setCalendarDropConflictChoice] = useState(null);
        const [isCalendarDisplaySettingsOpen, setIsCalendarDisplaySettingsOpen] = useState(false);
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
        const dragCancelRef = useRef(null);
        const dropCommitAccentTimerRef = useRef(0);
        const calendarUndoTimerRef = useRef(0);
        const suppressCalendarClickUntilRef = useRef(0);
        const dayColumnWidthRef = useRef(0);
        const calendarBodyScrollRafRef = useRef(0);
        const calendarWindowBoundsRef = useRef({ firstIdx: -1, lastIdx: -1 });
        const [calendarWindowScrollTick, setCalendarWindowScrollTick] = useState(0);
        const calendarDaysRef = useRef([]);
        const isCalendarDragZoomActiveRef = useRef(false);
        const [, setCalendarThemeTick] = useState(0);
        const todayIso = getPlanningTodayIso();
        const [todayDayData, setTodayDayData] = useState(() => readCalendarDayV2(todayIso));
        const yesterdayIso = useMemo(() => addDays(todayIso, -1), [todayIso]);
        const calendarStartIso = useMemo(() => addDays(todayIso, -CALENDAR_LOOKBACK_DAYS), [todayIso]);
        const calendarDays = useMemo(
            () => buildCalendarDays(calendarStartIso, CALENDAR_LOOKBACK_DAYS + CALENDAR_FORWARD_DAYS + 1),
            [calendarStartIso],
        );
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
        const todaySleepBlock = useMemo(() => buildCalendarSleepBlock(todayDayData), [todayDayData]);
        const todayContextBlocks = useMemo(
            () => isCalendarContextVisible ? buildCalendarDayContextBlocks(todayDayData) : [],
            [isCalendarContextVisible, todayDayData],
        );
        const todayStateMarkers = useMemo(
            () => isCalendarStateVisible
                ? buildCalendarStateMarkers(todayDayData, readCalendarHungerEvents(), todayIso)
                : [],
            [calendarStateVersion, isCalendarStateVisible, todayDayData, todayIso],
        );

        useEffect(() => {
            const refreshCalendarDayData = () => {
                setTodayDayData(readCalendarDayV2(todayIso));
                setCalendarStateVersion((version) => version + 1);
            };
            const handleDayUpdated = (event) => {
                const eventDate = event?.detail?.date || event?.detail?.dateKey || '';
                if (!eventDate || eventDate === todayIso) refreshCalendarDayData();
            };

            refreshCalendarDayData();
            window.addEventListener('heys:day-updated', handleDayUpdated);
            window.addEventListener('heysMealAdded', refreshCalendarDayData);
            window.addEventListener('heys:hunger-energy-status-updated', refreshCalendarDayData);
            window.addEventListener('heysSyncCompleted', refreshCalendarDayData);
            return () => {
                window.removeEventListener('heys:day-updated', handleDayUpdated);
                window.removeEventListener('heysMealAdded', refreshCalendarDayData);
                window.removeEventListener('heys:hunger-energy-status-updated', refreshCalendarDayData);
                window.removeEventListener('heysSyncCompleted', refreshCalendarDayData);
            };
        }, [todayIso]);

        const toggleCalendarContextVisibility = () => {
            setIsCalendarContextVisible((current) => {
                const next = !current;
                storeCalendarContextVisibility(next);
                return next;
            });
        };

        const toggleCalendarStateVisibility = () => {
            setIsCalendarStateVisible((current) => {
                const next = !current;
                storeCalendarStateVisibility(next);
                return next;
            });
        };

        useEffect(() => () => {
            if (calendarUndoTimerRef.current) window.clearTimeout(calendarUndoTimerRef.current);
        }, []);

        const offerCalendarUndo = (label, undo) => {
            if (calendarUndoTimerRef.current) window.clearTimeout(calendarUndoTimerRef.current);
            setCalendarUndoEntry({ label, undo });
            calendarUndoTimerRef.current = window.setTimeout(() => {
                calendarUndoTimerRef.current = 0;
                setCalendarUndoEntry(null);
            }, 5000);
        };

        const triggerCalendarUndo = () => {
            if (calendarUndoEntry && typeof calendarUndoEntry.undo === 'function') {
                calendarUndoEntry.undo();
            }
            if (calendarUndoTimerRef.current) {
                window.clearTimeout(calendarUndoTimerRef.current);
                calendarUndoTimerRef.current = 0;
            }
            setCalendarUndoEntry(null);
        };

        const setCalendarDragZoom = (value) => {
            setIsCalendarDragZoomActive((current) => (current === value ? current : value));
        };

        const shouldSuppressCalendarClick = () => suppressCalendarClickUntilRef.current > Date.now();

        const suppressCalendarClick = () => {
            suppressCalendarClickUntilRef.current = Date.now() + 420;
        };

        const clearDragCancelTarget = () => {
            setIsDragCancelTargetActive((current) => (current ? false : current));
        };

        const buildCalendarCellDropPreview = (day, hour, payload, subHourMinutes) => {
            if (!day || hour == null || !isPlanningCalendarDragPayload(payload)) return null;

            const start = resolveCalendarCellStart(day, hour, subHourMinutes);
            const daySlots = state.slots.filter((slot) => getCalendarDisplayDate(slot) === day);

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
                const conflict = resolveCalendarDropConflict(daySlots, start.time, durationMinutes, {
                    excludeSlotId: slot.id,
                    sleepBlock: day === todayIso ? todaySleepBlock : null,
                    contextBlocks: day === todayIso ? todayContextBlocks : null,
                });

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
                    ...conflict,
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
                const conflict = resolveCalendarDropConflict(daySlots, start.time, durationMinutes, {
                    sleepBlock: day === todayIso ? todaySleepBlock : null,
                    contextBlocks: day === todayIso ? todayContextBlocks : null,
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
                    ...conflict,
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
                    && current.hasConflict === nextPreview.hasConflict
                    && current.conflictCount === nextPreview.conflictCount
                    && current.suggestedStartTime === nextPreview.suggestedStartTime
                    && current.suggestedEndTime === nextPreview.suggestedEndTime
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
            const cancelNode = dragCancelRef.current;
            if (cancelNode) {
                const cancelRect = cancelNode.getBoundingClientRect();
                const withinCancelX = clientX >= cancelRect.left && clientX <= cancelRect.right;
                const withinCancelY = clientY >= cancelRect.top && clientY <= cancelRect.bottom;
                if (withinCancelX && withinCancelY) return { type: 'cancel' };
            }

            const headerNode = headerRef.current;
            if (headerNode) {
                const headerRect = headerNode.getBoundingClientRect();
                const withinHeaderX = clientX >= headerRect.left && clientX <= headerRect.right;
                const withinHeaderY = clientY >= headerRect.top && clientY <= headerRect.bottom;
                if (withinHeaderX && withinHeaderY) return null;
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

        const syncTouchDragDropState = (active, clientX, clientY) => {
            const dropTarget = resolveCalendarDropTargetFromPoint(clientX, clientY);
            const nextCancelTargetActive = dropTarget?.type === 'cancel';
            setIsDragCancelTargetActive((current) => (
                current === nextCancelTargetActive ? current : nextCancelTargetActive
            ));

            if (isPlanningCalendarDragPayload(active?.payload) && dropTarget?.type === 'cell') {
                applyCalendarCellDropPreview(dropTarget.day, dropTarget.hour, active?.payload, dropTarget.subHourMinutes);
            } else {
                clearCalendarCellDropPreview();
            }

            return dropTarget;
        };

        const commitDragPayloadToTime = (date, startTime, payload) => {
            if (payload.type === 'slot' && payload.slotId) {
                const slot = state.slots.find((entry) => entry.id === payload.slotId);
                if (!slot) return false;
                const duration = Math.max(30, getCalendarDisplayEndMinutes(slot) - getCalendarDisplayMinutes(slot.startTime));
                const original = {
                    date: slot.date,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                };
                const nextEndTime = formatClockTime(timeToMinutes(startTime) + duration);
                if (
                    dateStr(slot.date) === date
                    && slot.startTime === startTime
                    && slot.endTime === nextEndTime
                ) return false;
                state.updateSlot(slot.id, {
                    date,
                    startTime,
                    endTime: nextEndTime,
                });
                const undoEntry = buildCalendarSlotUndoEntry(state, {
                    kind: 'move',
                    slotId: slot.id,
                    original,
                });
                if (undoEntry) offerCalendarUndo(undoEntry.label, undoEntry.undo);
                return true;
            }

            const task = state.tasks.find((entry) => entry.id === payload.taskId);
            if (!task) return false;
            if (!canTaskAddCalendarSlot(task.id, state.slots)) return false;
            const duration = getTaskDurationMinutes(task);
            const createdSlot = state.addSlot({
                taskId: task.id,
                date,
                startTime,
                endTime: formatClockTime(timeToMinutes(startTime) + duration),
                title: '',
            });
            if (createdSlot?.id) {
                const undoEntry = buildCalendarSlotUndoEntry(state, {
                    kind: 'create',
                    slotId: createdSlot.id,
                });
                if (undoEntry) offerCalendarUndo(undoEntry.label, undoEntry.undo);
            }
            return !!createdSlot?.id;
        };

        const applyDragPayloadToCell = (date, hour, payload, subHourMinutes, options = {}) => {
            if (!payload) return false;
            const start = resolveCalendarCellStart(date, hour, subHourMinutes);
            const sourceSlot = payload.type === 'slot' && payload.slotId
                ? state.slots.find((entry) => entry.id === payload.slotId)
                : null;
            const sourceTask = payload.type === 'task' && payload.taskId
                ? state.tasks.find((entry) => entry.id === payload.taskId)
                : null;
            if (payload.type === 'slot' && !sourceSlot) return false;
            if (payload.type === 'task' && !sourceTask) return false;

            const duration = sourceSlot
                ? Math.max(30, getCalendarDisplayEndMinutes(sourceSlot) - getCalendarDisplayMinutes(sourceSlot.startTime))
                : getTaskDurationMinutes(sourceTask);
            const displayDay = getCalendarDisplayDate({ date: start.date, startTime: start.time });
            const daySlots = state.slots.filter((slot) => getCalendarDisplayDate(slot) === displayDay);
            const conflict = resolveCalendarDropConflict(daySlots, start.time, duration, {
                excludeSlotId: sourceSlot?.id,
                sleepBlock: displayDay === todayIso ? todaySleepBlock : null,
                contextBlocks: displayDay === todayIso ? todayContextBlocks : null,
            });

            if (conflict.hasConflict && !options.keepParallel) {
                setCalendarDropConflictChoice({
                    ...conflict,
                    displayDay,
                    date: start.date,
                    startTime: start.time,
                    duration,
                    payload,
                });
                return false;
            }

            return commitDragPayloadToTime(start.date, start.time, payload);
        };

        const commitCalendarConflictChoice = (useSuggested) => {
            const choice = calendarDropConflictChoice;
            if (!choice) return;
            setCalendarDropConflictChoice(null);

            const target = resolveCalendarConflictChoiceTarget(choice, useSuggested);
            if (!target) return;
            if (commitDragPayloadToTime(target.date, target.time, choice.payload)) {
                flashCalendarDropCommitAccent(choice.displayDay, target.displayHour, target.subHourMinutes);
            }
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
            if (!current.dragActivationNotified && typeof current.onDragActivated === 'function') {
                current.dragActivationNotified = true;
                current.onDragActivated(current);
            }
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
            clearDragCancelTarget();
            clearCalendarCellDropPreview();
            setCalendarDragZoom(false);

            if (active.activated && typeof active.onDragStateChange === 'function') {
                active.onDragStateChange(false);
            }

            if (active.activated && suppressClickAfterDrop) {
                suppressCalendarClick();
            }

            if (!applyDrop || !active.activated || !dropTarget) return;
            if (dropTarget.type === 'cancel') return;
            if (dropTarget.type === 'cell') {
                const committed = applyDragPayloadToCell(
                    dropTarget.day,
                    dropTarget.hour,
                    active.payload,
                    dropTarget.subHourMinutes,
                );
                if (committed) {
                    flashCalendarDropCommitAccent(dropTarget.day, dropTarget.hour, dropTarget.subHourMinutes);
                }
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
            onDragActivated,
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
                onDragActivated,
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
                dragActivationNotified: false,
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
            onDragActivated,
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
                onDragActivated,
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
                dragActivationNotified: false,
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
                if (typeof U.lsSet === 'function') {
                    U.lsSet(CALENDAR_DAY_WINDOW_STORAGE_KEY, String(calendarDayWindow));
                }
            } catch (error) {
                // ignore
            }
        }, [calendarDayWindow]);

        useEffect(() => {
            const deactivateDragZoom = () => {
                setCalendarDragZoom(false);
                clearDragCancelTarget();
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

        const overdueSlotItemsByDay = useMemo(
            () => buildCalendarOverdueSlotItemsByDay(
                state.tasks,
                state.slots,
                todayIso,
                calendarDays,
                parentTaskIdsWithChildren,
            ),
            [calendarDays, parentTaskIdsWithChildren, state.tasks, state.slots, todayIso],
        );

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

                if (!active.activated && shouldCancelCalendarLongPress(
                    active.x0,
                    active.y0,
                    point.clientX,
                    active.y1,
                )) {
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

                // Browser/OS cancellation is never treated as an intentional create.
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
            const isTouchPointer = pointerType === 'touch';
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
                x0: event.clientX,
                x1: event.clientX,
                y0: y,
                y1: y,
                isTouchPointer: pointerType === 'pen',
                activated: false,
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
                active.x1 = ev.clientX;
                active.y1 = ev.clientY - r.top;

                const distance = Math.hypot(active.x1 - active.x0, active.y1 - active.y0);
                if (!active.activated) {
                    if (shouldCancelCalendarLongPress(active.x0, active.y0, active.x1, active.y1)) {
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
                if (active.col) {
                    active.col.style.touchAction = active.prevTouchAction || '';
                }
                if (bodyScrollRef.current) {
                    bodyScrollRef.current.style.overflow = active.prevBodyOverflow || '';
                    bodyScrollRef.current.style.touchAction = active.prevBodyTouchAction || '';
                }
                if (gridScrollRef.current) {
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
            };

            session.prevTouchAction = session.col?.style?.touchAction || '';
            session.prevBodyOverflow = bodyScrollRef.current?.style?.overflow || '';
            session.prevGridOverflow = gridScrollRef.current?.style?.overflow || '';
            session.prevBodyTouchAction = bodyScrollRef.current?.style?.touchAction || '';
            session.prevGridTouchAction = gridScrollRef.current?.style?.touchAction || '';
            session.holdTimer = window.setTimeout(() => {
                const active = rangePointerSessionRef.current;
                if (!active || active !== session) return;
                active.activated = true;
                active.longPressActivated = true;
                try { navigator.vibrate?.(10); } catch (_e) { /* unsupported */ }
                if (active.col) active.col.style.touchAction = 'none';
                if (bodyScrollRef.current) bodyScrollRef.current.style.overflow = 'hidden';
                if (gridScrollRef.current) gridScrollRef.current.style.overflow = 'hidden';
                if (bodyScrollRef.current) bodyScrollRef.current.style.touchAction = 'none';
                if (gridScrollRef.current) gridScrollRef.current.style.touchAction = 'none';
                if (session.pointerId != null && session.targetNode && typeof session.targetNode.setPointerCapture === 'function') {
                    try {
                        session.targetNode.setPointerCapture(session.pointerId);
                    } catch (error) {
                        // ignore
                    }
                }
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

            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', finish);
            window.addEventListener('pointercancel', cancel);
        };

        const handleDropToCell = (date, hour, event) => {
            event.preventDefault();
            setCalendarDragZoom(false);
            clearDragCancelTarget();
            clearCalendarCellDropPreview();
            const payload = parsePlanningDragPayload(event);
            if (applyDragPayloadToCell(date, hour, payload)) {
                flashCalendarDropCommitAccent(date, hour);
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
            touchDragPreview && h('div', {
                ref: dragCancelRef,
                className: 'planning-calendar-drag-cancel'
                    + (isDragCancelTargetActive ? ' is-active' : ''),
                role: 'status',
                'aria-label': 'Отменить перенос',
            },
                h('span', { className: 'planning-calendar-drag-cancel__icon', 'aria-hidden': 'true' }, '×'),
                h('span', { className: 'planning-calendar-drag-cancel__label' },
                    isDragCancelTargetActive ? 'Отпустите — перенос отменится' : 'Отменить перенос',
                ),
            ),
            calendarCellDropPreview?.hasConflict && h('div', {
                className: 'planning-calendar-drag-conflict',
                role: 'status',
                'aria-live': 'polite',
            },
                h('strong', null, 'Пересечение'),
                h('span', null, calendarCellDropPreview.suggestedStartTime
                    ? ('Свободно ' + calendarCellDropPreview.suggestedStartTime + '–' + calendarCellDropPreview.suggestedEndTime)
                    : 'Свободного окна в этом дне нет'),
            ),
            h('div', { className: 'planning-calendar-nav' },
                h('span', { className: 'planning-calendar-nav__density-label' }, 'Сколько дней в ряд'),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: () => scrollCalendarByDays(-visibleDayCount) }, '‹'),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: scrollCalendarToTodayWindow }, 'Сегодня'),
                h('button', {
                    type: 'button',
                    className: 'planning-btn planning-btn--sm planning-calendar-nav__add-task-btn',
                    onClick: () => setIsTaskPickerOpen(true),
                }, '+ Задача'),
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
                    className: 'planning-btn planning-btn--sm planning-calendar-nav__settings-btn',
                    'aria-label': 'Настроить слои календаря',
                    title: 'Настроить слои календаря',
                    onClick: () => setIsCalendarDisplaySettingsOpen(true),
                }, h('span', { 'aria-hidden': 'true' }, '⚙')),
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
                        const utils = root?.utils || {};
                        try {
                            if (utils.lsSet) {
                                utils.lsSet('heys_theme_pref', next);
                                utils.lsSet('heys_theme_explicit', '1');
                                utils.lsSet('heys_theme', next);
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
                                    + (isWeekendDay(day) ? ' planning-calendar-day-header--weekend' : ''),
                                title: dayOccupancyByDay[day]?.label || '',
                            },
                                h('div', { className: 'planning-calendar-day-header__title' },
                                    h('span', { className: 'planning-calendar-day-label' }, getWeekdayLabel(day)),
                                    h('span', { className: 'planning-calendar-day-date' }, day.slice(8)),
                                ),
                                dayOccupancyByDay[day]?.pressureTone && dayOccupancyByDay[day].pressureTone !== 'free' && h('span', {
                                    className: 'planning-calendar-day-pressure planning-calendar-day-pressure--' + dayOccupancyByDay[day].pressureTone,
                                    'aria-label': dayOccupancyByDay[day].label,
                                    title: dayOccupancyByDay[day].label,
                                }, dayOccupancyByDay[day].pressureLabel),
                                (overdueSlotItemsByDay[day] || []).length > 0 && h('div', { className: 'planning-calendar-day-unscheduled' },
                                    (overdueSlotItemsByDay[day] || []).map((item) => h(CalendarUnscheduledTaskPill, {
                                        key: item.slot.id,
                                        task: item.task,
                                        slot: item.slot,
                                        overdueDate: item.overdueDate,
                                        projects: state.projects,
                                        taskLookup: taskMap,
                                        onDragStateChange: setCalendarDragZoom,
                                        onTouchDragStart: handleCalendarTouchStart,
                                        onPointerDragStart: handleCalendarPointerDragStart,
                                        shouldSuppressClick: shouldSuppressCalendarClick,
                                        isTouchDragSource: touchDragSourceKey === ('slot:' + item.slot.id),
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
                        className: 'planning-calendar-time-drop-range'
                            + (calendarCellDropPreview.hasConflict ? ' planning-calendar-time-drop-range--conflict' : ''),
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
                        className: 'planning-calendar-time-drop-preview'
                            + (calendarCellDropPreview.hasConflict ? ' planning-calendar-time-drop-preview--conflict' : ''),
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
                                    clearDragCancelTarget();
                                    applyCalendarCellDropPreview(day, hour, payload);
                                },
                                onDrop: (event) => handleDropToCell(day, hour, event),
                            })),
                            day === todayIso && todaySleepBlock && h('div', {
                                className: 'planning-calendar-sleep-block',
                                style: {
                                    top: todaySleepBlock.top + 'px',
                                    height: todaySleepBlock.height + 'px',
                                },
                                title: 'Сон до ' + todaySleepBlock.endTime,
                                'aria-label': 'Сон до ' + todaySleepBlock.endTime,
                            },
                                h('span', { className: 'planning-calendar-sleep-block__title' }, 'Сон'),
                                h('span', { className: 'planning-calendar-sleep-block__time' },
                                    todaySleepBlock.startTime + '–' + todaySleepBlock.endTime,
                                ),
                            ),
                            day === todayIso && todayContextBlocks.map((block) => h('div', {
                                key: block.id,
                                className: 'planning-calendar-context-block planning-calendar-context-block--' + block.kind
                                    + (block.height < 28 ? ' is-compact' : ''),
                                style: {
                                    top: block.top + 'px',
                                    height: block.height + 'px',
                                },
                                title: block.title + ' · ' + block.startTime + '–' + block.endTime,
                                'aria-label': block.title + ' с ' + block.startTime + ' до ' + block.endTime,
                            },
                                h('span', { className: 'planning-calendar-context-block__title' }, block.title),
                                h('span', { className: 'planning-calendar-context-block__time' },
                                    block.startTime + '–' + block.endTime,
                                ),
                            )),
                            day === todayIso && todayStateMarkers.map((marker) => h('div', {
                                key: marker.id,
                                className: 'planning-calendar-state-marker planning-calendar-state-marker--' + marker.kind
                                    + ' planning-calendar-state-marker--' + marker.tone,
                                style: { top: marker.top + 'px' },
                                role: 'img',
                                title: marker.label + ' ' + marker.value + '/10 · ' + marker.time,
                                'aria-label': marker.label + ' ' + marker.value + ' из 10 в ' + marker.time,
                            },
                                h('span', {
                                    className: 'planning-calendar-state-marker__kind',
                                    'aria-hidden': 'true',
                                }, marker.kind === 'hunger' ? 'Г' : 'С'),
                                h('strong', { className: 'planning-calendar-state-marker__value' }, marker.value),
                            )),
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
                                        : ' planning-calendar-drop-preview--task')
                                    + (calendarCellDropPreview.hasConflict ? ' planning-calendar-drop-preview--conflict' : ''),
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
            calendarUndoEntry && h('div', {
                className: 'planning-calendar-undo-toast',
                role: 'status',
                'aria-live': 'polite',
            },
                h('span', { className: 'planning-calendar-undo-toast__label' }, calendarUndoEntry.label),
                h('button', {
                    type: 'button',
                    className: 'planning-calendar-undo-toast__btn',
                    onClick: triggerCalendarUndo,
                }, 'Отменить'),
            ),
            calendarDropConflictChoice && h(CalendarDropConflictSheet, {
                conflict: calendarDropConflictChoice,
                onClose: () => setCalendarDropConflictChoice(null),
                onUseSuggested: () => commitCalendarConflictChoice(true),
                onKeepParallel: () => commitCalendarConflictChoice(false),
            }),
            isCalendarDisplaySettingsOpen && h(CalendarDisplaySettingsSheet, {
                isContextVisible: isCalendarContextVisible,
                isStateVisible: isCalendarStateVisible,
                onToggleContext: toggleCalendarContextVisibility,
                onToggleState: toggleCalendarStateVisibility,
                onClose: () => setIsCalendarDisplaySettingsOpen(false),
            }),
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
                hasLinkedTask: !!slotDeleteTarget.slot.taskId,
                onClose: () => setSlotDeleteTarget(null),
                onSlotOnly: () => removeCalendarSlotKeepTask(state, slotDeleteTarget.slot),
                onSlotAndTask: () => removeCalendarSlotAndTask(slotDeleteTarget.slot),
            }),
            slotDraft && slotDraft.quickCreate && !slotDraft.quickCreateMode && h(QuickCreateFlowSheet, {
                draft: slotDraft,
                onSelect: (quickCreateMode) => setSlotDraft((current) => ({ ...current, quickCreateMode })),
                onClose: () => setSlotDraft(null),
            }),
            slotDraft && slotDraft.quickCreate && slotDraft.quickCreateMode && h(QuickSlotModal, {
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
            isTaskPickerOpen && h(CalendarTaskPickerModal, {
                tasks: state.tasks,
                projects: state.projects,
                slots: state.slots,
                taskLookup: taskMap,
                parentTaskIdsWithChildren,
                onClose: () => setIsTaskPickerOpen(false),
                onOpenTask: setSelectedTaskId,
                onCompleteTask: (taskId) => state.updateTask(taskId, { status: 'done' }),
                onDeleteTask: (taskId) => state.deleteTask(taskId),
                onDragStateChange: setCalendarDragZoom,
                onTouchDragStart: handleCalendarTouchStart,
                onPointerDragStart: handleCalendarPointerDragStart,
                shouldSuppressClick: shouldSuppressCalendarClick,
                allowNativeDrag: allowNativeCalendarDrag,
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
        buildCalendarTaskPickerTasks,
        canTaskAddCalendarSlot,
        buildCalendarOverdueSlotItemsByDay,
        removeCalendarSlotKeepTask,
        buildCalendarSleepBlock,
        buildCalendarDayContextBlocks,
        buildCalendarStateMarkers,
        shouldCancelCalendarLongPress,
        resolveCalendarDropConflict,
        resolveCalendarConflictChoiceTarget,
        buildCalendarSlotUndoEntry,
        buildStandaloneQuickSlotOptions,
    };
})();
