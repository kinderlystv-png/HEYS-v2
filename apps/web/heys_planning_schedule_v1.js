// heys_planning_schedule_v1.js — Calendar and Gantt screens for HEYS planning
(function () {
    'use strict';
    const React = window.React;
    const Planning = HEYS.Planning || {};
    const PlanningTasks = HEYS.PlanningTasks || {};
    if (!React || !Planning.Constants || !Planning.Utils || !Planning.Hooks) return;
    const h = React.createElement;
    const { useState, useMemo, useRef, useEffect } = React;
    const {
        PRIORITY_CONFIG,
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
    } = Planning.Utils;
    const { usePlanningViewport } = Planning.Hooks;

    const HOURS = Array.from({ length: (CALENDAR_END_HOUR - CALENDAR_START_HOUR) + 1 }, (_, index) => CALENDAR_START_HOUR + index);
    const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const MINUTES_IN_DAY = 24 * 60;
    const CALENDAR_LOOKBACK_DAYS = 1;
    const CALENDAR_FORWARD_DAYS = 92;
    const CALENDAR_TOTAL_HEIGHT = HOURS.length * CALENDAR_HOUR_HEIGHT;
    const CALENDAR_DRAG_EDGE_THRESHOLD = 48;
    const CALENDAR_TOUCH_DRAG_HOLD_MS = 180;
    const CALENDAR_TOUCH_DRAG_MOVE_CANCEL_THRESHOLD = 12;
    const CALENDAR_POINTER_DRAG_MOVE_THRESHOLD = 6;
    const CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE = 56;
    const CALENDAR_TOUCH_DRAG_AUTO_SCROLL_STEP = 18;

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

    function getWeekdayLabel(isoDate) {
        const parsed = new Date(String(isoDate || '') + 'T12:00:00');
        if (Number.isNaN(parsed.getTime())) return '';
        const index = (parsed.getDay() + 6) % 7;
        return WEEKDAY_LABELS[index] || '';
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

    function centerCalendarNowLine(lineElement, headerElement) {
        if (!lineElement) return;
        const scrollContainer = findVerticalScrollContainer(lineElement);
        const containerRect = typeof scrollContainer?.getBoundingClientRect === 'function'
            ? scrollContainer.getBoundingClientRect()
            : {
                top: 0,
                bottom: window.innerHeight || document.documentElement?.clientHeight || 0,
            };
        const headerBottom = Math.max(headerElement?.getBoundingClientRect?.().bottom || containerRect.top || 0, containerRect.top || 0);
        const lineRect = lineElement.getBoundingClientRect();
        const currentCenter = lineRect.top + (lineRect.height / 2);
        const targetCenter = headerBottom + Math.max(((containerRect.bottom || 0) - headerBottom) / 2, 0);
        const delta = currentCenter - targetCenter;

        if (Math.abs(delta) < 1) return;

        if (
            scrollContainer
            && scrollContainer !== document.body
            && scrollContainer !== document.documentElement
            && scrollContainer !== document.scrollingElement
        ) {
            scrollContainer.scrollTop += delta;
            return;
        }

        const scrollRoot = document.scrollingElement || document.documentElement;
        if (scrollRoot) {
            scrollRoot.scrollTop += delta;
            return;
        }

        window.scrollBy({ top: delta, behavior: 'auto' });
    }

    function resolveCalendarCellStart(date, displayHour) {
        const normalizedHour = Number(displayHour) || CALENDAR_START_HOUR;
        const actualDate = normalizedHour >= 24 ? addDays(date, 1) : date;
        return {
            date: actualDate,
            time: formatCalendarHourLabel(normalizedHour),
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

    function resolveCalendarSlotAppearance(slotDay, yesterdayIso, linkedTask, projects) {
        if (slotDay !== yesterdayIso) {
            return {
                className: '',
                color: getTaskProjectColor(linkedTask, projects),
            };
        }

        const status = linkedTask?.status || '';
        const isResolved = !linkedTask || status === 'done' || status === 'cancelled';

        if (isResolved) {
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

    function SlotEditorModal({ draft, tasks, onClose, onDelete, onSave, onOpenTask }) {
        const [form, setForm] = useState(() => buildSlotDraft(draft));

        useEffect(() => {
            setForm(buildSlotDraft(draft));
        }, [draft?.id, draft?.date, draft?.startTime, draft?.endTime, draft?.taskId, draft?.title]);

        const linkedTask = tasks.find((task) => task.id === form.taskId);
        const save = () => {
            if (!form.date || !form.startTime || !form.endTime) return;
            onSave({
                ...form,
                title: String(form.title || '').trim(),
            });
        };

        return h('div', { className: 'planning-modal-overlay', onClick: onClose },
            h('div', { className: 'planning-modal', onClick: (event) => event.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, form.id ? 'Слот' : 'Новый слот'),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose }, '×'),
                ),
                h('div', { className: 'planning-modal__body' },
                    h('div', { className: 'planning-modal__row' },
                        h('label', null, 'Связанная задача'),
                        h('select', {
                            value: form.taskId,
                            onChange: (event) => setForm((current) => ({ ...current, taskId: event.target.value })),
                        },
                            h('option', { value: '' }, '— обычное событие —'),
                            tasks.map((task) => h('option', { key: task.id, value: task.id }, task.title)),
                        ),
                    ),
                    h('input', {
                        className: 'planning-modal__input',
                        placeholder: linkedTask ? 'Оставь пустым, чтобы использовать название задачи' : 'Название слота',
                        value: form.title,
                        onChange: (event) => setForm((current) => ({ ...current, title: event.target.value })),
                    }),
                    h('div', { className: 'planning-modal__grid' },
                        h('div', { className: 'planning-modal__row' },
                            h('label', null, 'Дата'),
                            h('input', {
                                type: 'date',
                                value: form.date,
                                onChange: (event) => setForm((current) => ({ ...current, date: event.target.value })),
                            }),
                        ),
                        h('div', { className: 'planning-modal__row' },
                            h('label', null, 'Старт'),
                            h('input', {
                                type: 'time',
                                value: form.startTime,
                                onChange: (event) => setForm((current) => ({ ...current, startTime: event.target.value })),
                            }),
                        ),
                    ),
                    h('div', { className: 'planning-modal__row' },
                        h('label', null, 'Окончание'),
                        h('input', {
                            type: 'time',
                            value: form.endTime,
                            onChange: (event) => setForm((current) => ({ ...current, endTime: event.target.value })),
                        }),
                    ),
                    linkedTask && h('div', { className: 'planning-linked-banner' },
                        h('span', null, 'Связано с задачей: ' + linkedTask.title),
                        h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: () => onOpenTask(linkedTask.id) }, 'Открыть задачу'),
                    ),
                ),
                h('div', { className: 'planning-modal__footer planning-modal__footer--spread' },
                    form.id
                        ? h('button', { type: 'button', className: 'planning-btn', onClick: () => onDelete(form.id) }, 'Удалить')
                        : h('span'),
                    h('div', { className: 'planning-modal__footer-actions' },
                        h('button', { type: 'button', className: 'planning-btn', onClick: onClose }, 'Отмена'),
                        h('button', { type: 'button', className: 'planning-btn planning-btn--primary', onClick: save }, 'Сохранить'),
                    ),
                ),
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
        onOpen,
        onResizeStart,
        onDragStateChange,
        onTouchDragStart,
        onPointerDragStart,
        shouldSuppressClick,
        isTouchDragSource,
        allowNativeDrag,
        showResizeHandle,
    }) {
        const slotTitle = parentGroupLabel ? (parentGroupLabel + ' · ' + title) : title;

        return h('div', {
            className: 'planning-calendar-slot'
                + (className || '')
                + (isTouchDragSource ? ' planning-calendar-slot--touch-dragging' : ''),
            draggable: allowNativeDrag !== false,
            style: { ...style, background: color },
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
                        background: color,
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
                        background: color,
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
            showSubtitle && h('span', { className: 'planning-calendar-slot__time' }, subtitle),
            showResizeHandle && h('button', {
                type: 'button',
                className: 'planning-calendar-slot__resize planning-calendar-slot__resize--start',
                onPointerDown: (event) => onResizeStart(slot, 'start', event),
                onTouchStart: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                title: 'Изменить время начала',
                'aria-label': 'Изменить время начала',
            }),
            showResizeHandle && h('button', {
                type: 'button',
                className: 'planning-calendar-slot__resize planning-calendar-slot__resize--end',
                onPointerDown: (event) => onResizeStart(slot, 'end', event),
                onTouchStart: (event) => event.stopPropagation(),
                onClick: (event) => event.stopPropagation(),
                title: 'Изменить время окончания',
                'aria-label': 'Изменить время окончания',
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
        const priorityLabel = PRIORITY_CONFIG[task.priority]?.label || 'P2';
        const projectColor = getTaskProjectColor(task, projects);

        return h('div', {
            className: 'planning-calendar-unscheduled-pill'
                + (isTouchDragSource ? ' planning-calendar-unscheduled-pill--touch-dragging' : ''),
            draggable: allowNativeDrag !== false,
            style: { '--planning-unscheduled-project-color': projectColor },
            title: parentGroupLabel ? (parentGroupLabel + ' · ' + task.title) : task.title,
            onPointerDown: (event) => {
                if (typeof onPointerDragStart === 'function') {
                    onPointerDragStart({
                        event,
                        payload: { type: 'task', taskId: task.id },
                        sourceKey: 'task:' + task.id,
                        title: task.title,
                        badgeText: priorityLabel,
                        parentGroupLabel,
                        accentColor: projectColor,
                    });
                }
            },
            onTouchStart: (event) => {
                if (typeof onTouchDragStart === 'function') {
                    onTouchDragStart({
                        event,
                        payload: { type: 'task', taskId: task.id },
                        sourceKey: 'task:' + task.id,
                        title: task.title,
                        badgeText: priorityLabel,
                        parentGroupLabel,
                        accentColor: projectColor,
                    });
                }
            },
            onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'copyMove';
                event.dataTransfer.setData('text/heys-planning-task', JSON.stringify({ type: 'task', taskId: task.id }));
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
            h('span', {
                className: 'planning-calendar-unscheduled-pill__priority',
                style: { color: PRIORITY_CONFIG[task.priority]?.color, background: PRIORITY_CONFIG[task.priority]?.bg },
            }, priorityLabel),
        );
    }

    function CalendarScreen({ state }) {
        const { isDesktop } = usePlanningViewport();
        const [slotDraft, setSlotDraft] = useState(null);
        const [selectedTaskId, setSelectedTaskId] = useState(null);
        const [resizePreview, setResizePreview] = useState(null);
        const [calendarViewportWidth, setCalendarViewportWidth] = useState(0);
        const [nowLineTop, setNowLineTop] = useState(() => getCalendarNowTop());
        const [shouldCenterNow, setShouldCenterNow] = useState(true);
        const [headerDropState, setHeaderDropState] = useState({ day: '', mode: '' });
        const [calendarCellDropPreview, setCalendarCellDropPreview] = useState(null);
        const [calendarDropCommitAccent, setCalendarDropCommitAccent] = useState(null);
        const [headerFrame, setHeaderFrame] = useState({ ready: false, top: 0, left: 0, width: 0, height: 0 });
        const [isCalendarDragZoomActive, setIsCalendarDragZoomActive] = useState(false);
        const [touchDragPreview, setTouchDragPreview] = useState(null);
        const [touchDragSourceKey, setTouchDragSourceKey] = useState('');
        const resizeStateRef = useRef(null);
        const headerShellRef = useRef(null);
        const headerRef = useRef(null);
        const nowLineRef = useRef(null);
        const gridScrollRef = useRef(null);
        const bodyScrollRef = useRef(null);
        const headerScrollRef = useRef(null);
        const previousDayWidthRef = useRef(0);
        const touchDragStateRef = useRef(null);
        const touchDragAutoScrollFrameRef = useRef(0);
        const dropCommitAccentTimerRef = useRef(0);
        const suppressCalendarClickUntilRef = useRef(0);
        const dayColumnWidthRef = useRef(0);
        const calendarDaysRef = useRef([]);
        const isCalendarDragZoomActiveRef = useRef(false);
        const todayIso = getPlanningTodayIso();
        const yesterdayIso = useMemo(() => addDays(todayIso, -1), [todayIso]);
        const calendarStartIso = useMemo(() => addDays(todayIso, -CALENDAR_LOOKBACK_DAYS), [todayIso]);
        const calendarDays = useMemo(
            () => buildCalendarDays(calendarStartIso, CALENDAR_LOOKBACK_DAYS + CALENDAR_FORWARD_DAYS + 1),
            [calendarStartIso],
        );
        const calendarEndIso = calendarDays[calendarDays.length - 1] || todayIso;
        const visibleDayCount = isCalendarDragZoomActive ? 7 : 3;
        const dayColumnWidth = Math.max(Math.round((calendarViewportWidth || (isDesktop ? 720 : 330)) / visibleDayCount), 1);
        const usesTouchLikeInput = hasTouchLikeInput();
        const allowNativeCalendarDrag = false;
        const taskMap = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks]);
        const parentTaskIdsWithChildren = useMemo(() => buildParentTaskIdsWithChildren(state.tasks), [state.tasks]);

        const setCalendarDragZoom = (value) => {
            setIsCalendarDragZoomActive((current) => (current === value ? current : value));
        };

        const shouldSuppressCalendarClick = () => suppressCalendarClickUntilRef.current > Date.now();

        const suppressCalendarClick = () => {
            suppressCalendarClickUntilRef.current = Date.now() + 420;
        };

        const resolveHeaderDropMode = (payload) => (payload?.type === 'slot' ? 'unschedule' : 'task');

        const applyHeaderDropState = (day, payload) => {
            const nextMode = resolveHeaderDropMode(payload);
            setHeaderDropState((current) => {
                if (current.day === day && current.mode === nextMode) return current;
                return { day, mode: nextMode };
            });
        };

        const clearHeaderDropState = () => {
            setHeaderDropState((current) => {
                if (!current.day && !current.mode) return current;
                return { day: '', mode: '' };
            });
        };

        const buildCalendarCellDropPreview = (day, hour, payload) => {
            if (!day || hour == null || !isPlanningCalendarDragPayload(payload)) return null;

            const start = resolveCalendarCellStart(day, hour);

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
                const appearance = resolveCalendarSlotAppearance(day, yesterdayIso, linkedTask, state.projects);

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

        const applyCalendarCellDropPreview = (day, hour, payload) => {
            const nextPreview = buildCalendarCellDropPreview(day, hour, payload);
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

        const flashCalendarDropCommitAccent = (day, hour) => {
            if (!day || hour == null) return;

            const start = resolveCalendarCellStart(day, hour);
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

            const headerNode = headerScrollRef.current;
            if (headerNode) {
                const headerRect = headerNode.getBoundingClientRect();
                const withinHeaderX = clientX >= headerRect.left && clientX <= headerRect.right;
                const withinHeaderY = clientY >= headerRect.top && clientY <= headerRect.bottom;

                if (withinHeaderX && withinHeaderY) {
                    const relativeX = clientX - headerRect.left + headerNode.scrollLeft;
                    const dayIndex = Math.floor(relativeX / currentDayWidth);
                    const day = currentCalendarDays[dayIndex];
                    if (day) return { type: 'header', day };
                }
            }

            const bodyNode = bodyScrollRef.current;
            const gridNode = gridScrollRef.current;
            if (!bodyNode || !gridNode) return null;

            const bodyRect = bodyNode.getBoundingClientRect();
            const withinBodyX = clientX >= bodyRect.left && clientX <= bodyRect.right;
            const withinBodyY = clientY >= bodyRect.top && clientY <= bodyRect.bottom;
            if (!withinBodyX || !withinBodyY) return null;

            const relativeX = clientX - bodyRect.left + bodyNode.scrollLeft;
            const dayIndex = Math.floor(relativeX / currentDayWidth);
            const day = currentCalendarDays[dayIndex];
            if (!day) return null;

            const relativeY = clientY - bodyRect.top + gridNode.scrollTop;
            const hourIndex = Math.max(0, Math.min(HOURS.length - 1, Math.floor(relativeY / CALENDAR_HOUR_HEIGHT)));
            return {
                type: 'cell',
                day,
                hour: HOURS[hourIndex],
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

        const canApplyDragPayloadToHeaderDay = (payload) => !!resolveHeaderDropContext(payload);

        const syncTouchDragDropState = (active, clientX, clientY) => {
            const dropTarget = resolveCalendarDropTargetFromPoint(clientX, clientY);

            if (canApplyDragPayloadToHeaderDay(active?.payload) && dropTarget?.type === 'header') {
                applyHeaderDropState(dropTarget.day, active?.payload);
                clearCalendarCellDropPreview();
            } else {
                clearHeaderDropState();
            }

            if (isPlanningCalendarDragPayload(active?.payload) && dropTarget?.type === 'cell') {
                applyCalendarCellDropPreview(dropTarget.day, dropTarget.hour, active?.payload);
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

        const applyDragPayloadToCell = (date, hour, payload) => {
            if (!payload) return;
            const start = resolveCalendarCellStart(date, hour);
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

            const scrollContainer = bodyScrollRef.current || headerScrollRef.current;
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

            const step = () => {
                const active = touchDragStateRef.current;
                if (!active || !active.activated) {
                    touchDragAutoScrollFrameRef.current = 0;
                    return;
                }

                const bodyNode = bodyScrollRef.current;
                const gridNode = gridScrollRef.current;

                if (bodyNode) {
                    const rect = bodyNode.getBoundingClientRect();
                    const edge = Math.min(CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE, Math.max(rect.width * 0.16, 28));
                    let deltaX = 0;

                    if (active.lastX <= rect.left + edge) {
                        deltaX = -resolveAutoScrollDelta(active.lastX - rect.left, edge);
                    } else if (active.lastX >= rect.right - edge) {
                        deltaX = resolveAutoScrollDelta(rect.right - active.lastX, edge);
                    }

                    if (Math.abs(deltaX) > 0.1) {
                        bodyNode.scrollLeft += deltaX;
                        syncHeaderScroll();
                        maybeActivateCalendarDragZoomFromPoint(active.lastX, active.payload);
                    }
                }

                if (gridNode) {
                    const rect = gridNode.getBoundingClientRect();
                    const edge = Math.min(CALENDAR_TOUCH_DRAG_AUTO_SCROLL_EDGE, Math.max(rect.height * 0.12, 24));
                    let deltaY = 0;

                    if (active.lastY <= rect.top + edge) {
                        deltaY = -resolveAutoScrollDelta(active.lastY - rect.top, edge);
                    } else if (active.lastY >= rect.bottom - edge) {
                        deltaY = resolveAutoScrollDelta(rect.bottom - active.lastY, edge);
                    }

                    if (Math.abs(deltaY) > 0.1) {
                        gridNode.scrollTop += deltaY;
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
            setTouchDragSourceKey(current.sourceKey || '');
            setTouchDragPreview({
                kind: current.payload?.type === 'slot' ? 'slot' : 'task',
                title: current.title || '',
                badgeText: current.badgeText || '',
                parentGroupLabel: current.parentGroupLabel || '',
                accentColor: current.accentColor || '',
                background: current.background || '',
                x: current.lastX,
                y: current.lastY,
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
                applyDragPayloadToCell(dropTarget.day, dropTarget.hour, active.payload);
                flashCalendarDropCommitAccent(dropTarget.day, dropTarget.hour);
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
                    if (distance > CALENDAR_TOUCH_DRAG_MOVE_CANCEL_THRESHOLD) {
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
            if (pointerType === 'touch' || pointerType === 'pen') return;
            if (event.button != null && event.button !== 0) return;

            if (event.cancelable) event.preventDefault();

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

            if (active.pointerId != null && targetNode && typeof targetNode.setPointerCapture === 'function') {
                try {
                    targetNode.setPointerCapture(active.pointerId);
                } catch (error) {
                    // ignore
                }
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
                    if (distance < CALENDAR_POINTER_DRAG_MOVE_THRESHOLD) return;
                    activateCalendarCustomDrag(current);
                }

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

            active.handlePointerUp = (pointerUpEvent) => {
                const current = touchDragStateRef.current;
                if (!current || current !== active) return;
                if (current.pointerId != null && pointerUpEvent.pointerId != null && current.pointerId !== pointerUpEvent.pointerId) return;

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

                finishCalendarTouchDrag({
                    applyDrop: false,
                    suppressClickAfterDrop: false,
                    interactionEvent: pointerCancelEvent,
                });
            };

            touchDragStateRef.current = active;
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
                const width = bodyScrollRef.current?.clientWidth || 0;
                if (width) setCalendarViewportWidth(width);
            };

            measure();
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }, []);

        useEffect(() => {
            if (!bodyScrollRef.current) {
                previousDayWidthRef.current = dayColumnWidth;
                return;
            }

            const previousDayWidth = previousDayWidthRef.current;
            if (!previousDayWidth || previousDayWidth === dayColumnWidth) {
                previousDayWidthRef.current = dayColumnWidth;
                return;
            }

            const bodyNode = bodyScrollRef.current;
            const nextScrollLeft = (bodyNode.scrollLeft / previousDayWidth) * dayColumnWidth;
            bodyNode.scrollLeft = nextScrollLeft;
            if (headerScrollRef.current) headerScrollRef.current.scrollLeft = nextScrollLeft;
            previousDayWidthRef.current = dayColumnWidth;
        }, [dayColumnWidth]);

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
            const shell = headerShellRef.current;
            const header = headerRef.current;
            if (!shell || !header) return undefined;

            const measureHeaderFrame = () => {
                const shellRect = shell.getBoundingClientRect();
                const nextFrame = {
                    ready: true,
                    top: Math.max(shellRect.top || 0, 0),
                    left: shellRect.left,
                    width: shellRect.width,
                    height: header.offsetHeight || shellRect.height || 0,
                };

                setHeaderFrame((current) => {
                    if (
                        current.ready === nextFrame.ready &&
                        Math.abs((current.top || 0) - nextFrame.top) < 1 &&
                        Math.abs((current.left || 0) - nextFrame.left) < 1 &&
                        Math.abs((current.width || 0) - nextFrame.width) < 1 &&
                        Math.abs((current.height || 0) - nextFrame.height) < 1
                    ) {
                        return current;
                    }
                    return nextFrame;
                });
            };

            measureHeaderFrame();

            const resizeObserver = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => measureHeaderFrame())
                : null;

            if (resizeObserver) {
                resizeObserver.observe(shell);
                resizeObserver.observe(header);
            }

            window.addEventListener('resize', measureHeaderFrame);
            return () => {
                window.removeEventListener('resize', measureHeaderFrame);
                if (resizeObserver) resizeObserver.disconnect();
            };
        }, [calendarViewportWidth, isDesktop, calendarDays.length, state.tasks.length, state.slots.length]);

        useEffect(() => {
            const updateNowLine = () => setNowLineTop(getCalendarNowTop());

            updateNowLine();
            const intervalId = window.setInterval(updateNowLine, 60_000);
            return () => window.clearInterval(intervalId);
        }, []);

        useEffect(() => {
            if (!shouldCenterNow || !calendarViewportWidth || !headerFrame.ready) return undefined;

            let frameId = 0;
            let nestedFrameId = 0;

            frameId = window.requestAnimationFrame(() => {
                nestedFrameId = window.requestAnimationFrame(() => {
                    const lineElement = nowLineRef.current;
                    const headerElement = headerRef.current;
                    if (!lineElement) return;
                    centerCalendarNowLine(lineElement, headerElement);
                    console.info('[HEYS.planning] Centered calendar on current time');
                    setShouldCenterNow(false);
                });
            });

            return () => {
                window.cancelAnimationFrame(frameId);
                window.cancelAnimationFrame(nestedFrameId);
            };
        }, [calendarViewportWidth, shouldCenterNow, headerFrame.ready, headerFrame.height]);

        const syncHeaderScroll = () => {
            if (!headerScrollRef.current || !bodyScrollRef.current) return;
            headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
        };

        const scrollCalendarHorizontallyBy = (delta) => {
            const bodyNode = bodyScrollRef.current;
            if (!bodyNode || !Number.isFinite(delta) || Math.abs(delta) < 0.5) return;

            bodyNode.scrollLeft += delta;
            syncHeaderScroll();
        };

        const handleHeaderWheel = (event) => {
            const deltaX = Number(event.deltaX) || 0;
            const deltaY = Number(event.deltaY) || 0;
            const hasHorizontalIntent = Math.abs(deltaX) > Math.abs(deltaY) || (event.shiftKey && Math.abs(deltaY) > 0.5);
            if (!hasHorizontalIntent) return;

            const horizontalDelta = Math.abs(deltaX) > 0.5 ? deltaX : deltaY;
            if (Math.abs(horizontalDelta) < 0.5) return;

            if (event.cancelable) event.preventDefault();
            scrollCalendarHorizontallyBy(horizontalDelta);
        };

        const scrollCalendarByDays = (days) => {
            if (!bodyScrollRef.current) return;
            bodyScrollRef.current.scrollBy({ left: dayColumnWidth * days, behavior: 'smooth' });
        };

        const scrollCalendarToTodayWindow = () => {
            if (!bodyScrollRef.current) return;
            bodyScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
            syncHeaderScroll();
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
            const handlePointerMove = (event) => {
                const active = resizeStateRef.current;
                if (!active) return;
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

            const handlePointerUp = () => {
                const active = resizeStateRef.current;
                if (!active) return;
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

            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            return () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
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

        const openNewSlot = (date, hour) => {
            if (shouldSuppressCalendarClick()) return;
            const start = resolveCalendarCellStart(date, hour);
            const end = resolveCalendarCellStart(date, hour + 1);
            setSlotDraft(buildSlotDraft({
                date: start.date,
                startTime: start.time,
                endTime: end.time,
            }));
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

        const handleSaveSlot = (draft) => {
            const payload = {
                taskId: draft.taskId || undefined,
                title: draft.title || '',
                date: draft.date,
                startTime: draft.startTime,
                endTime: draft.endTime,
            };
            if (draft.id) {
                state.updateSlot(draft.id, payload);
            } else {
                state.addSlot(payload);
            }
            setSlotDraft(null);
        };

        const beginResize = (slot, edge, event) => {
            event.preventDefault();
            event.stopPropagation();
            const displayDate = getCalendarDisplayDate(slot) || dateStr(slot.date);
            resizeStateRef.current = {
                slotId: slot.id,
                edge: edge === 'start' ? 'start' : 'end',
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
            className: 'planning-calendar-screen' + (isCalendarDragZoomActive ? ' planning-calendar-screen--drag-zoom' : ''),
        },
            h('div', { className: 'planning-calendar-nav' },
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: () => scrollCalendarByDays(-3) }, '‹'),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: scrollCalendarToTodayWindow }, 'Сегодня'),
                h('button', { type: 'button', className: 'planning-btn planning-btn--sm', onClick: () => scrollCalendarByDays(3) }, '›'),
            ),
            h('div', {
                ref: headerShellRef,
                className: 'planning-calendar-header-shell',
                style: headerFrame.ready ? { height: headerFrame.height + 'px' } : undefined,
            },
                h('div', {
                    ref: headerRef,
                    className: 'planning-calendar-header' + (headerFrame.ready ? ' planning-calendar-header--pinned' : ''),
                    style: headerFrame.ready
                        ? {
                            top: headerFrame.top + 'px',
                            left: headerFrame.left + 'px',
                            width: headerFrame.width + 'px',
                        }
                        : undefined,
                },
                    h('div', { className: 'planning-calendar-time-gutter' }),
                    h('div', {
                        ref: headerScrollRef,
                        className: 'planning-calendar-days-scroll planning-calendar-days-scroll--header',
                        onWheel: handleHeaderWheel,
                    },
                        h('div', {
                            className: 'planning-calendar-days-track planning-calendar-days-track--header',
                            style: { '--planning-calendar-day-width': dayColumnWidth + 'px' },
                        },
                            calendarDays.map((day) => h('div', {
                                key: day,
                                className: 'planning-calendar-day-header'
                                    + (day === todayIso ? ' planning-calendar-day-header--today' : '')
                                    + (headerDropState.day === day ? ' planning-calendar-day-header--drop-target' : '')
                                    + (headerDropState.day === day && headerDropState.mode === 'unschedule'
                                        ? ' planning-calendar-day-header--drop-unschedule'
                                        : ''),
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
                                h('div', { className: 'planning-calendar-day-header__title' },
                                    h('span', { className: 'planning-calendar-day-label' }, getWeekdayLabel(day)),
                                    h('span', { className: 'planning-calendar-day-date' }, day.slice(8)),
                                ),
                                headerDropState.day === day && headerDropState.mode === 'unschedule' && h('span', {
                                    className: 'planning-calendar-day-drop-hint',
                                    'aria-hidden': 'true',
                                }, '↺ без времени'),
                                (unscheduledTasksByDay[day] || []).length > 0 && h('div', { className: 'planning-calendar-day-unscheduled' },
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
                        ),
                    ),
                ),
            ),
            h('div', { ref: gridScrollRef, className: 'planning-calendar-grid' },
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
                    ref: bodyScrollRef,
                    className: 'planning-calendar-days-scroll planning-calendar-days-scroll--body',
                    onScroll: syncHeaderScroll,
                },
                    h('div', {
                        className: 'planning-calendar-days-track planning-calendar-days-track--grid',
                        style: { '--planning-calendar-day-width': dayColumnWidth + 'px' },
                    },
                        calendarDays.map((day) => h('div', {
                            key: day,
                            className: 'planning-calendar-day-col' + (day === todayIso ? ' planning-calendar-day-col--today' : ''),
                        },
                            HOURS.map((hour) => h('div', {
                                key: hour,
                                className: 'planning-calendar-cell'
                                    + (calendarCellDropPreview?.day === day && calendarCellDropPreview?.hour === hour
                                        ? ' planning-calendar-cell--drop-target'
                                        : ''),
                                onClick: () => openNewSlot(day, hour),
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
                            calendarCellDropPreview?.day === day && h('div', {
                                className: 'planning-calendar-drop-preview'
                                    + (calendarCellDropPreview.kind === 'slot'
                                        ? ' planning-calendar-drop-preview--slot'
                                        : ' planning-calendar-drop-preview--task'),
                                style: {
                                    top: calendarCellDropPreview.top + 'px',
                                    height: calendarCellDropPreview.height + 'px',
                                    '--planning-calendar-drop-preview-color': calendarCellDropPreview.accentColor || '#64748b',
                                    ...(calendarCellDropPreview.kind === 'slot' && calendarCellDropPreview.background
                                        ? { background: calendarCellDropPreview.background }
                                        : {}),
                                },
                                'aria-hidden': 'true',
                            },
                                h('div', { className: 'planning-calendar-drop-preview__body' },
                                    calendarCellDropPreview.parentGroupLabel && h('span', {
                                        className: 'planning-calendar-drop-preview__parent',
                                    }, calendarCellDropPreview.parentGroupLabel),
                                    h('span', {
                                        className: 'planning-calendar-drop-preview__title',
                                    }, calendarCellDropPreview.title),
                                    h('span', {
                                        className: 'planning-calendar-drop-preview__time',
                                    }, calendarCellDropPreview.timeLabel),
                                ),
                            ),
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
                                const appearance = resolveCalendarSlotAppearance(day, yesterdayIso, linkedTask, state.projects);
                                const parentGroupLabel = linkedTask ? buildTaskParentGroupLabel(linkedTask, taskMap) : '';
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
                                    onDragStateChange: setCalendarDragZoom,
                                    onTouchDragStart: handleCalendarTouchStart,
                                    onPointerDragStart: handleCalendarPointerDragStart,
                                    shouldSuppressClick: shouldSuppressCalendarClick,
                                    isTouchDragSource: touchDragSourceKey === ('slot:' + slot.id),
                                    allowNativeDrag: allowNativeCalendarDrag,
                                    showResizeHandle: true,
                                    onOpen: () => setSlotDraft(buildSlotDraft(slot)),
                                    onResizeStart: beginResize,
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
                    ),
                ),
            ),
            touchDragPreview && touchDragPreview.kind !== 'slot' && h('div', {
                className: 'planning-calendar-touch-preview'
                    + (touchDragPreview.kind === 'slot'
                        ? ' planning-calendar-touch-preview--slot'
                        : ' planning-calendar-touch-preview--task'),
                style: {
                    left: touchDragPreview.x + 'px',
                    top: touchDragPreview.y + 'px',
                    '--planning-calendar-touch-preview-color': touchDragPreview.accentColor || '#64748b',
                    ...(touchDragPreview.kind === 'slot' && touchDragPreview.background
                        ? { background: touchDragPreview.background }
                        : {}),
                },
            },
                h('div', { className: 'planning-calendar-touch-preview__body' },
                    touchDragPreview.parentGroupLabel && h('span', {
                        className: 'planning-calendar-touch-preview__parent',
                    }, touchDragPreview.parentGroupLabel),
                    h('span', { className: 'planning-calendar-touch-preview__title' }, touchDragPreview.title),
                ),
                touchDragPreview.badgeText && h('span', {
                    className: 'planning-calendar-touch-preview__badge',
                }, touchDragPreview.badgeText),
            ),
            slotDraft && h(SlotEditorModal, {
                draft: slotDraft,
                tasks: state.tasks,
                onClose: () => setSlotDraft(null),
                onDelete: (slotId) => {
                    state.deleteSlot(slotId);
                    setSlotDraft(null);
                },
                onSave: handleSaveSlot,
                onOpenTask: (taskId) => {
                    setSlotDraft(null);
                    setSelectedTaskId(taskId);
                },
            }),
            selectedTaskId && PlanningTasks.TaskDetailModal && h(PlanningTasks.TaskDetailModal, {
                taskId: selectedTaskId,
                state,
                onClose: () => setSelectedTaskId(null),
            }),
            !isDesktop && h('div', { className: 'planning-mobile-hint' }, 'Подсказка: обычный свайп скроллит, зажим на задаче включает перенос.'),
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
                            className: 'planning-gantt-day-header' + (day === todayIso ? ' planning-gantt-day-header--today' : ''),
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
                onClose: () => setSelectedTaskId(null),
            }),
        );
    }

    HEYS.PlanningSchedule = {
        CalendarScreen,
        GanttScreen,
    };
})();
