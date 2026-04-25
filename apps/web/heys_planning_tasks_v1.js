// heys_planning_tasks_v1.js — Tasks screen and task editor for HEYS planning
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    const Planning = HEYS.Planning || {};
    const PlanningQuickTarget = HEYS.PlanningQuickTarget;
    if (!React || !Planning.Constants || !Planning.Store || !Planning.Utils || !PlanningQuickTarget) return;

    const h = React.createElement;
    const { useState, useMemo, useRef } = React;
    const {
        buildResolvedTaskProjectMap,
        getResolvedTaskProjectId,
        createQuickTargetValue,
        resolveQuickTargetValue,
        PlanningQuickTargetField,
    } = PlanningQuickTarget;
    const { PRIORITY_CONFIG, STATUS_CONFIG, DUE_BUCKETS, PROJECT_COLORS } = Planning.Constants;
    const { clamp, dateStr, sortByOrder, timeToMinutes, minutesToTime, getDueBucket, getTaskDurationMinutes } = Planning.Utils;

    const TASKS_UI_SCALE_STORAGE_KEY = 'heys_planning_tasks_ui_scale_v1';
    const TASKS_UI_SCALE_MIN = 0.6;
    const TASKS_UI_SCALE_MAX = 1.4;
    const TASKS_UI_SCALE_STEP = 0.05;
    const TASKS_UI_SCALE_DEFAULT = 0.8;

    function clampTasksUiScale(value) {
        if (!Number.isFinite(value)) return TASKS_UI_SCALE_DEFAULT;
        if (value < TASKS_UI_SCALE_MIN) return TASKS_UI_SCALE_MIN;
        if (value > TASKS_UI_SCALE_MAX) return TASKS_UI_SCALE_MAX;
        return Math.round(value * 100) / 100;
    }

    function readSavedTasksUiScale() {
        try {
            const raw = window.localStorage.getItem(TASKS_UI_SCALE_STORAGE_KEY);
            if (raw == null) return TASKS_UI_SCALE_DEFAULT;
            return clampTasksUiScale(Number.parseFloat(raw));
        } catch (_) {
            return TASKS_UI_SCALE_DEFAULT;
        }
    }

    const DURATION_PRESETS = [
        { label: '15 мин', shortLabel: '15м', minutes: 15 },
        { label: '30 мин', shortLabel: '30м', minutes: 30 },
        { label: '1 час', shortLabel: '1ч', minutes: 60 },
        { label: '3 часа', shortLabel: '3ч', minutes: 180 },
        { label: '1 день', shortLabel: '1д', minutes: 480 },
        { label: '2 дня', shortLabel: '2д', minutes: 960 },
        { label: '3 дня', shortLabel: '3д', minutes: 1440 },
        { label: '5 дней', shortLabel: '5д', minutes: 2400 },
        { label: 'Неделя', shortLabel: '1н', minutes: 3360 },
        { label: '2 недели', shortLabel: '2н', minutes: 6720 },
        { label: 'Месяц', shortLabel: '1мес', minutes: 14400 },
    ];
    const DURATION_PRESET_BY_MINUTES = new Map(DURATION_PRESETS.map((preset) => [preset.minutes, preset]));

    function pluralizeDays(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return 'день';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
        return 'дней';
    }

    function normalizeDurationMinutes(value) {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes <= 0) return null;
        return Math.round(minutes);
    }

    function formatDurationLabel(value) {
        const minutes = normalizeDurationMinutes(value);
        if (!minutes) return '';

        const preset = DURATION_PRESET_BY_MINUTES.get(minutes);
        if (preset) return preset.label;

        if (minutes < 60) return minutes + ' мин';

        if (minutes % (8 * 60) === 0) {
            const days = minutes / (8 * 60);
            return days + ' ' + pluralizeDays(days);
        }

        if (minutes % 60 === 0) {
            const hours = minutes / 60;
            return hours === 1 ? '1 час' : hours + ' ч';
        }

        const roundedHours = Math.max(Math.round(minutes / 60), 1);
        return roundedHours === 1 ? '1 час' : roundedHours + ' ч';
    }

    function formatDurationCompactLabel(value) {
        const minutes = normalizeDurationMinutes(value);
        if (!minutes) return '';

        const preset = DURATION_PRESET_BY_MINUTES.get(minutes);
        if (preset) {
            if (minutes < 60) return minutes + ' мин';
            if (minutes % (8 * 60) === 0) {
                const days = minutes / (8 * 60);
                return days + ' дн';
            }
            return preset.shortLabel;
        }

        if (minutes < 60) return minutes + ' мин';

        if (minutes % (8 * 60) === 0) {
            const days = minutes / (8 * 60);
            return days + ' дн';
        }

        if (minutes % 60 === 0) {
            const hours = minutes / 60;
            return hours + ' ч';
        }

        return minutes + ' мин';
    }

    function addDaysToIsoDate(isoDate, days) {
        const parts = String(isoDate || '').split('-').map((value) => Number(value));
        if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return '';
        const nextDate = new Date(parts[0], parts[1] - 1, parts[2] + Number(days || 0));
        const year = String(nextDate.getFullYear());
        const month = String(nextDate.getMonth() + 1).padStart(2, '0');
        const day = String(nextDate.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
    }

    function parseIsoDate(isoDate) {
        const parts = String(isoDate || '').slice(0, 10).split('-').map((value) => Number(value));
        if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value) || value <= 0)) return null;
        const parsed = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function buildCompletionSlotFromNow(plannedMinutes) {
        const now = new Date();
        const endMinutes = (now.getHours() * 60) + now.getMinutes();
        const normalizedDuration = normalizeDurationMinutes(plannedMinutes);
        const duration = normalizedDuration || 15;
        const startMinutes = Math.max(0, endMinutes - duration);
        const safeEndMinutes = clamp(Math.max(startMinutes + 1, endMinutes), 1, (23 * 60) + 59);

        return {
            date: dateStr(now),
            startTime: minutesToTime(startMinutes),
            endTime: minutesToTime(safeEndMinutes),
        };
    }

    function pluralizeTasks(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return 'задача';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи';
        return 'задач';
    }

    function formatMinutesSummary(value) {
        const minutes = normalizeDurationMinutes(value);
        if (!minutes) return '0 мин';

        if (minutes % (8 * 60) === 0 && minutes >= (8 * 60)) {
            const days = minutes / (8 * 60);
            return days + ' дн';
        }

        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;
        if (hours > 0 && restMinutes > 0) return hours + 'ч ' + restMinutes + 'м';
        if (hours > 0) return hours + ' ч';
        return minutes + ' мин';
    }

    function formatIsoDateShort(isoDate, todayIso, tomorrowIso) {
        if (!isoDate) return '';
        if (isoDate === todayIso) return 'сегодня';
        if (isoDate === tomorrowIso) return 'завтра';
        const parsed = parseIsoDate(isoDate);
        if (!parsed) return isoDate;
        return parsed.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
        });
    }

    function hexToRgb(hexColor) {
        const normalized = String(hexColor || '').trim().toLowerCase();
        const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
        if (!match) return { r: 148, g: 163, b: 184 };
        const hex = match[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }

    function mixHexColors(leftHex, rightHex, factor) {
        const from = hexToRgb(leftHex);
        const to = hexToRgb(rightHex);
        const safeFactor = clamp(Number(factor) || 0, 0, 1);
        return {
            r: Math.round(from.r + ((to.r - from.r) * safeFactor)),
            g: Math.round(from.g + ((to.g - from.g) * safeFactor)),
            b: Math.round(from.b + ((to.b - from.b) * safeFactor)),
        };
    }

    function toRgbaString(rgb, alpha) {
        return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
    }

    function getPlanningLoadTone(loadRatio) {
        const safeRatio = clamp(Number(loadRatio) || 0, 0, 1);
        if (safeRatio >= 0.72) return 'busy';
        if (safeRatio >= 0.36) return 'balanced';
        return 'free';
    }

    function getPlanningLoadBackground(loadRatio) {
        const safeRatio = clamp(Number(loadRatio) || 0, 0, 1);
        const mix = safeRatio <= 0.5
            ? mixHexColors('#22c55e', '#eab308', safeRatio / 0.5)
            : mixHexColors('#eab308', '#ef4444', (safeRatio - 0.5) / 0.5);
        const start = toRgbaString(mix, (0.08 + (safeRatio * 0.06)).toFixed(3));
        const end = toRgbaString(mix, (0.14 + (safeRatio * 0.18)).toFixed(3));
        return 'linear-gradient(135deg, ' + start + ' 0%, ' + end + ' 100%)';
    }

    function getPlanningLoadBorderColor(loadRatio) {
        const safeRatio = clamp(Number(loadRatio) || 0, 0, 1);
        const mix = safeRatio <= 0.5
            ? mixHexColors('#22c55e', '#eab308', safeRatio / 0.5)
            : mixHexColors('#eab308', '#ef4444', (safeRatio - 0.5) / 0.5);
        return toRgbaString(mix, (0.14 + (safeRatio * 0.2)).toFixed(3));
    }

    function describePlanningLoad(entry) {
        if (!entry) return 'Свободнее · без задач и занятых слотов';

        const toneLabel = entry.loadTone === 'busy'
            ? 'День загружен'
            : (entry.loadTone === 'balanced' ? 'Средняя нагрузка' : 'Свободнее');
        const parts = [];

        if (entry.itemCount > 0) parts.push(entry.itemCount + ' ' + pluralizeTasks(entry.itemCount));
        if (entry.scheduledMinutes > 0) parts.push(formatMinutesSummary(entry.scheduledMinutes) + ' в слотах');
        if (entry.dueCount > 0) parts.push(entry.dueCount + ' дедл.');
        if (entry.startCount > 0) parts.push(entry.startCount + ' старт.');

        if (parts.length === 0) return toneLabel + ' · без задач и занятых слотов';
        return toneLabel + ' · ' + parts.join(' · ');
    }

    function createPlanningLoadEntry(isoDate) {
        return {
            isoDate,
            scheduledMinutes: 0,
            loadMinutes: 0,
            slotCount: 0,
            dueCount: 0,
            startCount: 0,
            taskIds: new Set(),
            standaloneSlotCount: 0,
            itemCount: 0,
            loadRatio: 0,
            loadTone: 'free',
            summary: 'Свободнее · без задач и занятых слотов',
        };
    }

    function buildPlanningLoadMap(tasks, slots, year, month) {
        const result = new Map();
        const scheduledTaskIdsByDate = new Map();

        const ensureEntry = (isoDate) => {
            if (!result.has(isoDate)) {
                result.set(isoDate, createPlanningLoadEntry(isoDate));
            }
            return result.get(isoDate);
        };

        const ensureScheduledTaskSet = (isoDate) => {
            if (!scheduledTaskIdsByDate.has(isoDate)) {
                scheduledTaskIdsByDate.set(isoDate, new Set());
            }
            return scheduledTaskIdsByDate.get(isoDate);
        };

        (Array.isArray(slots) ? slots : []).forEach((slot) => {
            const isoDate = String(slot?.date || '').slice(0, 10);
            const parsed = parseIsoDate(isoDate);
            if (!parsed || parsed.getFullYear() !== year || parsed.getMonth() !== month) return;

            const startMinutes = timeToMinutes(slot?.startTime);
            const endMinutes = timeToMinutes(slot?.endTime);
            const duration = endMinutes > startMinutes ? (endMinutes - startMinutes) : 30;
            const safeDuration = clamp(duration, 15, 12 * 60);
            const entry = ensureEntry(isoDate);

            entry.slotCount += 1;
            entry.scheduledMinutes += safeDuration;
            entry.loadMinutes += safeDuration;

            if (slot?.taskId) {
                entry.taskIds.add(slot.taskId);
                ensureScheduledTaskSet(isoDate).add(slot.taskId);
            } else {
                entry.standaloneSlotCount += 1;
            }
        });

        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
            if (!task || task.status === 'done' || task.status === 'cancelled') return;

            const baseMinutes = clamp(Math.max(getTaskDurationMinutes(task), 45), 45, 8 * 60);

            if (task.dueDate) {
                const dueIso = String(task.dueDate).slice(0, 10);
                const dueDate = parseIsoDate(dueIso);
                if (dueDate && dueDate.getFullYear() === year && dueDate.getMonth() === month) {
                    const entry = ensureEntry(dueIso);
                    const hasSameDaySlot = ensureScheduledTaskSet(dueIso).has(task.id);
                    const pressure = Math.round(Math.max(baseMinutes * (hasSameDaySlot ? 0.42 : 0.9), hasSameDaySlot ? 30 : 60));
                    entry.taskIds.add(task.id);
                    entry.dueCount += 1;
                    entry.loadMinutes += pressure;
                }
            }

            if (task.startDate && task.startDate !== task.dueDate) {
                const startIso = String(task.startDate).slice(0, 10);
                const startDate = parseIsoDate(startIso);
                if (startDate && startDate.getFullYear() === year && startDate.getMonth() === month) {
                    const entry = ensureEntry(startIso);
                    const hasSameDaySlot = ensureScheduledTaskSet(startIso).has(task.id);
                    const pressure = Math.round(Math.max(baseMinutes * (hasSameDaySlot ? 0.22 : 0.42), hasSameDaySlot ? 20 : 30));
                    entry.taskIds.add(task.id);
                    entry.startCount += 1;
                    entry.loadMinutes += pressure;
                }
            }
        });

        result.forEach((entry) => {
            entry.itemCount = entry.taskIds.size + entry.standaloneSlotCount;
            const coordinationPressure = Math.max(0, entry.itemCount - 1) * 24;
            const urgencyPressure = entry.dueCount * 18;
            entry.loadRatio = clamp((entry.loadMinutes + coordinationPressure + urgencyPressure) / (8 * 60), 0, 1);
            entry.loadTone = getPlanningLoadTone(entry.loadRatio);
            entry.summary = describePlanningLoad(entry);
        });

        return result;
    }

    function PlanningLoadDatePopover({ valueISO, tasks, slots, anchorRef, onSelect, onClear, onClose }) {
        if (!ReactDOM) return null;

        const todayIso = dateStr();
        const [cur, setCur] = useState(() => parseIsoDate(valueISO || todayIso) || parseIsoDate(todayIso) || new Date());
        const [dropdownPos, setDropdownPos] = useState({ top: 88, right: 16 });
        const [tooltip, setTooltip] = useState(null);
        const parsedToday = parseIsoDate(todayIso) || new Date();

        React.useEffect(() => {
            const nextDate = parseIsoDate(valueISO || todayIso);
            if (nextDate) setCur(nextDate);
        }, [valueISO, todayIso]);

        React.useEffect(() => {
            let rafId = 0;
            const updatePosition = () => {
                const anchorNode = anchorRef?.current;
                if (!anchorNode || typeof window === 'undefined') {
                    setDropdownPos({ top: 88, right: 16 });
                    return;
                }
                const rect = anchorNode.getBoundingClientRect();
                setDropdownPos({
                    top: Math.round(rect.bottom + 8),
                    right: Math.max(Math.round(window.innerWidth - rect.right), 16),
                });
            };
            const scheduleUpdate = () => {
                if (rafId) return;
                rafId = requestAnimationFrame(() => { rafId = 0; updatePosition(); });
            };

            updatePosition();
            window.addEventListener('resize', scheduleUpdate);
            window.addEventListener('scroll', scheduleUpdate, true);
            return () => {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', scheduleUpdate);
                window.removeEventListener('scroll', scheduleUpdate, true);
            };
        }, [anchorRef]);

        React.useEffect(() => {
            const handleKeyDown = (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                onClose();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [onClose]);

        const year = cur.getFullYear();
        const month = cur.getMonth();
        const firstDay = new Date(year, month, 1);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let index = 0; index < startOffset; index += 1) cells.push(null);
        for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day, 12, 0, 0, 0));

        const daysDataMap = useMemo(
            () => buildPlanningLoadMap(tasks, slots, year, month),
            [tasks, slots, year, month],
        );

        const selectedDate = parseIsoDate(valueISO || todayIso);
        const isCurrentMonth = year === parsedToday.getFullYear() && month === parsedToday.getMonth();

        function sameDay(left, right) {
            return !!(left && right
                && left.getFullYear() === right.getFullYear()
                && left.getMonth() === right.getMonth()
                && left.getDate() === right.getDate());
        }

        function handleDayHover(event, summary) {
            const rect = event.currentTarget.getBoundingClientRect();
            setTooltip({
                x: rect.left + (rect.width / 2),
                y: rect.top - 8,
                text: summary,
            });
        }

        return ReactDOM.createPortal(
            h(React.Fragment, null,
                h('div', {
                    className: 'date-picker-backdrop',
                    onClick: () => {
                        setTooltip(null);
                        onClose();
                    },
                }),
                tooltip && h('div', {
                    className: 'date-picker-tooltip',
                    style: { left: tooltip.x + 'px', top: tooltip.y + 'px' },
                }, tooltip.text),
                h('div', {
                    className: 'date-picker-dropdown planning-load-date-picker__dropdown',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Выбор даты по нагрузке',
                    style: { top: dropdownPos.top + 'px', right: dropdownPos.right + 'px' },
                },
                    h('div', { className: 'date-picker-header' },
                        h('button', {
                            type: 'button',
                            className: 'date-picker-nav',
                            onClick: () => setCur(new Date(year, month - 1, 1, 12, 0, 0, 0)),
                        }, '‹'),
                        h('span', { className: 'date-picker-title' },
                            cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }),
                        ),
                        h('button', {
                            type: 'button',
                            className: 'date-picker-nav',
                            onClick: () => setCur(new Date(year, month + 1, 1, 12, 0, 0, 0)),
                        }, '›'),
                    ),
                    !isCurrentMonth && h('button', {
                        type: 'button',
                        className: 'date-picker-goto-today',
                        onClick: () => setCur(parsedToday),
                    }, '↩ К текущему месяцу'),
                    h('div', { className: 'date-picker-weekdays' },
                        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => h('div', {
                            key: label,
                            className: 'date-picker-weekday',
                        }, label)),
                    ),
                    h('div', { className: 'date-picker-days' },
                        cells.map((cellDate, index) => {
                            if (cellDate == null) {
                                return h('div', { key: 'planning-empty-' + index, className: 'date-picker-day empty' });
                            }

                            const isoDate = dateStr(cellDate);
                            const dayData = daysDataMap.get(isoDate);
                            const loadRatio = dayData ? dayData.loadRatio : 0;
                            const tone = dayData ? dayData.loadTone : 'free';
                            const isSelected = sameDay(cellDate, selectedDate);
                            const isToday = sameDay(cellDate, parsedToday);
                            const summary = dayData ? dayData.summary : 'Свободнее · без задач и занятых слотов';
                            const cellStyle = (!isSelected && !isToday)
                                ? {
                                    background: getPlanningLoadBackground(loadRatio),
                                    boxShadow: 'inset 0 0 0 1px ' + getPlanningLoadBorderColor(loadRatio),
                                }
                                : undefined;

                            return h('div', {
                                key: isoDate,
                                className: [
                                    'date-picker-day',
                                    'planning-load-date-picker__day',
                                    'planning-load-date-picker__day--' + tone,
                                    isSelected ? 'selected' : '',
                                    isToday ? 'today' : '',
                                ].join(' ').trim(),
                                style: cellStyle,
                                title: summary,
                                onClick: () => {
                                    setTooltip(null);
                                    onSelect(isoDate);
                                },
                                onMouseEnter: (event) => handleDayHover(event, summary),
                                onMouseLeave: () => setTooltip(null),
                            },
                                h('span', { className: 'day-number' }, cellDate.getDate()),
                            );
                        }),
                    ),
                    h('div', { className: 'date-picker-legend planning-load-date-picker__legend' },
                        h('span', { className: 'legend-item good' }, '● свободно'),
                        h('span', { className: 'legend-item warn' }, '● средне'),
                        h('span', { className: 'legend-item bad' }, '● загружено'),
                    ),
                    h('div', { className: 'planning-load-date-picker__legend-hint' }, 'Учитываем задачи, дедлайны и занятые слоты.'),
                    h('div', { className: 'date-picker-footer' },
                        h('button', {
                            type: 'button',
                            className: 'date-picker-btn today-btn',
                            onClick: () => {
                                setTooltip(null);
                                onSelect(todayIso);
                            },
                        }, '📍 Сегодня'),
                        h('button', {
                            type: 'button',
                            className: 'date-picker-btn delete-btn',
                            onClick: () => {
                                setTooltip(null);
                                onClear();
                            },
                        }, '🗑️ Без даты'),
                    ),
                ),
            ),
            document.body,
        );
    }

    function FilterIcon() {
        return h('svg', {
            className: 'planning-filter-toggle__icon',
            viewBox: '0 0 20 20',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '1.8',
            'aria-hidden': 'true',
        },
            h('path', {
                d: 'M3 5h14l-5.5 6.5v4L8.5 17v-5.5L3 5Z',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
            }));
    }

    function ColorShuffleIcon() {
        return h('svg', {
            className: 'planning-project-group__color-icon',
            viewBox: '0 0 20 20',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '1.7',
            'aria-hidden': 'true',
        },
            h('path', {
                d: 'M5.2 12.7 9.6 7.1a1.8 1.8 0 0 1 2.9.1l2 2.8a1.8 1.8 0 0 1-1.5 2.8H7a1.8 1.8 0 0 1-1.8-1.8Z',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
            }),
            h('circle', { cx: '7', cy: '7', r: '1.6' }),
            h('circle', { cx: '14.4', cy: '5.6', r: '1.4' }),
            h('path', {
                d: 'M13.4 14.9h.01',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
            }),
        );
    }

    function resolvePaletteFloatingBounds(anchorNode) {
        const viewportPadding = 12;
        const fallbackBounds = {
            top: viewportPadding,
            bottom: Math.max(viewportPadding, (typeof window !== 'undefined' ? window.innerHeight : 0) - viewportPadding),
        };

        if (!anchorNode || typeof window === 'undefined' || typeof document === 'undefined') {
            return fallbackBounds;
        }

        let bounds = { ...fallbackBounds };
        const bottomTabsNode = document.querySelector('.tabs');
        const bottomTabsRect = bottomTabsNode?.getBoundingClientRect?.();
        if (bottomTabsRect && Number.isFinite(bottomTabsRect.top) && bottomTabsRect.top < bounds.bottom) {
            bounds.bottom = Math.max(bounds.top, Math.round(bottomTabsRect.top - viewportPadding));
        }

        const ownerGroup = anchorNode.closest('.planning-project-group');
        const parentProjectGroup = ownerGroup?.classList?.contains('planning-project-group--subgroup')
            ? ownerGroup.parentElement?.closest('.planning-project-group')
            : null;

        if (parentProjectGroup) {
            const parentRect = parentProjectGroup.getBoundingClientRect();
            bounds.top = Math.max(bounds.top, Math.round(parentRect.top + viewportPadding));
            bounds.bottom = Math.min(bounds.bottom, Math.round(parentRect.bottom - viewportPadding));
        }

        if (bounds.bottom < bounds.top) {
            return fallbackBounds;
        }

        return bounds;
    }

    function resolvePaletteFloatingPosition(anchorRect, panelRect, bounds) {
        const viewportPadding = 12;
        const offset = 8;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
        const panelWidth = Math.max(0, Math.round(panelRect?.width || 0));
        const panelHeight = Math.max(0, Math.round(panelRect?.height || 0));
        const boundaryTop = Math.max(viewportPadding, Math.round(bounds?.top || viewportPadding));
        const boundaryBottom = Math.max(boundaryTop, Math.round(bounds?.bottom || 0));
        const minLeft = viewportPadding;
        const maxLeft = Math.max(viewportPadding, viewportWidth - viewportPadding - panelWidth);
        const preferredLeft = Math.round((anchorRect?.right || 0) - panelWidth);
        const spaceBelow = Math.max(0, boundaryBottom - (anchorRect?.bottom || 0) - offset);
        const spaceAbove = Math.max(0, (anchorRect?.top || 0) - boundaryTop - offset);
        const shouldOpenUpward = panelHeight > spaceBelow && spaceAbove > spaceBelow;
        const preferredTop = shouldOpenUpward
            ? Math.round((anchorRect?.top || 0) - panelHeight - offset)
            : Math.round((anchorRect?.bottom || 0) + offset);
        const minTop = boundaryTop;
        const maxTop = Math.max(boundaryTop, boundaryBottom - panelHeight);

        return {
            left: clamp(preferredLeft, minLeft, maxLeft),
            top: clamp(preferredTop, minTop, maxTop),
            placement: shouldOpenUpward ? 'top' : 'bottom',
        };
    }

    function isPaletteInteractionTarget(root, target) {
        if (!root || !target) return false;
        if (root.contains(target)) return true;

        const ownerId = root.getAttribute('data-planning-palette-owner');
        if (!ownerId) return false;

        const elementTarget = target.nodeType === 1 ? target : target.parentElement;
        if (!elementTarget || typeof elementTarget.closest !== 'function') return false;

        const ownerNode = elementTarget.closest('[data-planning-palette-owner]');
        return !!(ownerNode && ownerNode.getAttribute('data-planning-palette-owner') === ownerId);
    }

    function ColorPalettePicker({
        pickerRef,
        isOpen,
        currentColor,
        occupiedColors,
        hasAvailableColors,
        title,
        onToggle,
        onPick,
    }) {
        const normalizedCurrent = normalizePaletteHex(currentColor);
        const paletteOwnerRef = useRef('planning-palette-' + Math.random().toString(36).slice(2));
        const palettePanelRef = useRef(null);
        const [floatingPaletteState, setFloatingPaletteState] = useState({
            left: 12,
            top: 12,
            placement: 'bottom',
            ready: false,
        });

        React.useLayoutEffect(() => {
            if (!isOpen || !ReactDOM) {
                setFloatingPaletteState((current) => (
                    current.ready
                        ? { ...current, ready: false }
                        : current
                ));
                return undefined;
            }

            const updatePosition = () => {
                const root = pickerRef?.current;
                const panel = palettePanelRef.current;
                if (!root || !panel || typeof window === 'undefined') return;

                const anchor = root.querySelector('.planning-project-group__color-btn') || root;
                const bounds = resolvePaletteFloatingBounds(anchor);
                const nextPosition = resolvePaletteFloatingPosition(
                    anchor.getBoundingClientRect(),
                    panel.getBoundingClientRect(),
                    bounds,
                );

                setFloatingPaletteState((current) => {
                    if (
                        current.left === nextPosition.left
                        && current.top === nextPosition.top
                        && current.placement === nextPosition.placement
                        && current.ready
                    ) {
                        return current;
                    }
                    return { ...nextPosition, ready: true };
                });
            };

            let rafId = 0;
            const scheduleUpdate = () => {
                if (rafId) return;
                rafId = requestAnimationFrame(() => { rafId = 0; updatePosition(); });
            };
            updatePosition();
            window.addEventListener('resize', scheduleUpdate);
            window.addEventListener('scroll', scheduleUpdate, true);
            return () => {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', scheduleUpdate);
                window.removeEventListener('scroll', scheduleUpdate, true);
            };
        }, [isOpen, pickerRef]);

        const paletteNode = h('div', {
            className: 'planning-project-group__palette' + (ReactDOM ? ' planning-project-group__palette--floating' : ''),
            ref: palettePanelRef,
            'data-planning-palette-owner': paletteOwnerRef.current,
            'data-planning-palette-placement': floatingPaletteState.placement,
            style: ReactDOM
                ? {
                    left: floatingPaletteState.left + 'px',
                    top: floatingPaletteState.top + 'px',
                    visibility: floatingPaletteState.ready ? 'visible' : 'hidden',
                }
                : undefined,
            onClick: (event) => event.stopPropagation(),
        },
            h('div', { className: 'planning-project-group__palette-title' }, title || 'Цвет группы'),
            h('div', { className: 'planning-project-group__palette-grid' },
                PROJECT_COLORS.map((color) => {
                    const normalized = normalizePaletteHex(color);
                    const disabled = !!(hasAvailableColors && occupiedColors.has(normalized));
                    const active = normalized === normalizedCurrent;

                    return h('button', {
                        key: color,
                        type: 'button',
                        className: 'planning-project-group__swatch' + (active ? ' active' : '') + (disabled ? ' disabled' : ''),
                        style: { '--planning-swatch-color': color },
                        title: disabled ? 'Уже используется другой группой' : ('Выбрать ' + color),
                        'aria-label': disabled ? ('Цвет ' + color + ' уже используется') : ('Выбрать цвет ' + color),
                        disabled,
                        onClick: (event) => {
                            event.stopPropagation();
                            if (disabled) return;
                            onPick(color);
                        },
                    },
                        active && h('span', { className: 'planning-project-group__swatch-check' }, '✓'),
                    );
                }),
            ),
        );

        return h('div', {
            className: 'planning-project-group__color-picker',
            ref: pickerRef,
            'data-planning-palette-owner': paletteOwnerRef.current,
            onClick: (event) => event.stopPropagation(),
        },
            h('button', {
                type: 'button',
                className: 'planning-project-group__color-btn' + (isOpen ? ' active' : ''),
                title: title || 'Выбрать цвет группы',
                'aria-label': title || 'Выбрать цвет группы',
                'aria-expanded': isOpen ? 'true' : 'false',
                onClick: (event) => {
                    event.stopPropagation();
                    onToggle();
                },
            },
                h(ColorShuffleIcon),
            ),
            isOpen && (ReactDOM ? ReactDOM.createPortal(paletteNode, document.body) : paletteNode),
        );
    }

    function DurationFieldButton({ value, placeholder, kicker, compact, minimal, onClick }) {
        const formattedValue = formatDurationLabel(value);
        const compactValue = formatDurationCompactLabel(value);
        const label = minimal
            ? (compactValue || placeholder || 'мин/дн')
            : (formattedValue || placeholder || 'Выбрать');
        const isEmpty = minimal ? !compactValue : !formattedValue;
        const secondaryText = kicker || '';
        const ariaLabel = formattedValue
            ? ('Длительность: ' + formattedValue)
            : 'Выбрать длительность';

        return h('button', {
            type: 'button',
            className: 'planning-duration-trigger'
                + (compact ? ' planning-duration-trigger--compact' : '')
                + (minimal ? ' planning-duration-trigger--minimal' : '')
                + (kicker ? ' planning-duration-trigger--kicker' : '')
                + (isEmpty ? ' is-empty' : ''),
            'aria-label': ariaLabel,
            onClick,
        },
            minimal
                ? h(React.Fragment, null,
                    h('span', { className: 'planning-duration-trigger__icon', 'aria-hidden': 'true' }, '⏱'),
                    h('span', { className: 'planning-duration-trigger__value' }, label),
                )
                : h(React.Fragment, null,
                    h('span', { className: 'planning-duration-trigger__value' }, label),
                    secondaryText && h('span', { className: 'planning-duration-trigger__kicker' }, secondaryText),
                    h('span', { className: 'planning-duration-trigger__icon', 'aria-hidden': 'true' }, '⏱'),
                ),
        );
    }

    function DurationPresetModal({ title, subtitle, value, onSelect, onClose }) {
        const normalizedValue = normalizeDurationMinutes(value);
        const [customMinutes, setCustomMinutes] = useState(() => (
            normalizedValue && !DURATION_PRESET_BY_MINUTES.has(normalizedValue)
                ? String(normalizedValue)
                : ''
        ));

        React.useEffect(() => {
            const nextValue = normalizeDurationMinutes(value);
            if (nextValue && !DURATION_PRESET_BY_MINUTES.has(nextValue)) {
                setCustomMinutes(String(nextValue));
                return;
            }
            setCustomMinutes('');
        }, [value]);

        React.useEffect(() => {
            const handleKeyDown = (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                onClose();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [onClose]);

        const handlePresetSelect = (minutes) => {
            onSelect(minutes);
            onClose();
        };

        const handleCustomApply = () => {
            const minutes = normalizeDurationMinutes(customMinutes);
            if (!minutes) return;
            onSelect(minutes);
            onClose();
        };

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested',
            onClick: (event) => {
                event.stopPropagation();
                onClose();
            },
        },
            h('div', {
                className: 'planning-modal planning-modal--picker',
                onClick: (event) => event.stopPropagation(),
            },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, title || 'Длительность'),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose }, '×'),
                ),
                h('div', { className: 'planning-modal__body' },
                    subtitle && h('div', { className: 'planning-duration-modal__hint' }, subtitle),
                    h('div', { className: 'planning-duration-modal__grid' },
                        DURATION_PRESETS.map((preset) => {
                            const active = normalizedValue === preset.minutes;
                            return h('button', {
                                key: preset.minutes,
                                type: 'button',
                                className: 'planning-duration-modal__option' + (active ? ' active' : ''),
                                'aria-pressed': active ? 'true' : 'false',
                                onClick: () => handlePresetSelect(preset.minutes),
                            },
                                h('span', { className: 'planning-duration-modal__option-label' }, preset.label),
                                h('span', { className: 'planning-duration-modal__option-meta' }, preset.shortLabel),
                            );
                        }),
                    ),
                    h('div', { className: 'planning-modal__section planning-duration-modal__custom-section' },
                        h('div', { className: 'planning-modal__section-title' }, 'Свой вариант'),
                        h('div', { className: 'planning-duration-modal__custom' },
                            h('input', {
                                className: 'planning-modal__input',
                                type: 'number',
                                min: 1,
                                placeholder: 'Минуты',
                                value: customMinutes,
                                onChange: (event) => setCustomMinutes(event.target.value),
                                onKeyDown: (event) => {
                                    if (event.key === 'Enter') handleCustomApply();
                                },
                            }),
                            h('button', {
                                type: 'button',
                                className: 'planning-btn planning-btn--primary',
                                disabled: !normalizeDurationMinutes(customMinutes),
                                onClick: handleCustomApply,
                            }, 'Применить'),
                        ),
                        h('div', { className: 'planning-duration-modal__custom-hint' }, 'Если пресеты не подходят, можно указать точное число минут.'),
                    ),
                ),
                h('div', { className: 'planning-modal__footer planning-modal__footer--spread' },
                    h('button', {
                        type: 'button',
                        className: 'planning-btn',
                        onClick: () => {
                            onSelect(null);
                            onClose();
                        },
                    }, 'Без оценки'),
                    h('button', { type: 'button', className: 'planning-btn', onClick: onClose }, 'Закрыть'),
                ),
            ),
        );
    }

    function TaskStatusToggle({ task, onUpdate }) {
        const isDone = task.status === 'done';
        const isCancelled = task.status === 'cancelled';
        const isTerminal = isDone || isCancelled;
        const icon = isCancelled
            ? (STATUS_CONFIG.cancelled?.icon || '✕')
            : (isDone ? (STATUS_CONFIG.done?.icon || '●') : (STATUS_CONFIG.todo?.icon || '○'));
        const label = isCancelled
            ? 'Задача отменена'
            : (isDone ? 'Задача завершена' : 'Завершить задачу');

        return h('button', {
            className: 'planning-status-toggle' + (isTerminal ? ' is-terminal' : ''),
            type: 'button',
            'data-swipe-ignore': 'true',
            'aria-label': label,
            title: label,
            disabled: isTerminal,
            onPointerDown: (event) => event.stopPropagation(),
            onTouchStart: (event) => event.stopPropagation(),
            onClick: (event) => {
                event.stopPropagation();
                if (isTerminal) return;
                onUpdate(task.id, { status: 'done' });
            },
        }, icon);
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

    function normalizePaletteHex(value) {
        const input = String(value || '').trim().toLowerCase();
        if (!input) return null;
        if (/^#[0-9a-f]{6}$/.test(input)) return input;
        if (/^#[0-9a-f]{3}$/.test(input)) {
            return '#' + input.slice(1).split('').map((char) => char + char).join('');
        }
        return null;
    }

    function isTaskTerminal(task) {
        return task?.status === 'done' || task?.status === 'cancelled';
    }

    function buildTaskChildrenMap(tasks) {
        const map = new Map();

        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
            const key = task?.parentTaskId || '';
            const bucket = map.get(key) || [];
            bucket.push(task);
            map.set(key, bucket);
        });

        map.forEach((items, key) => {
            map.set(key, sortByOrder(items));
        });

        return map;
    }

    function countCompletedBranchTasks(taskId, childrenMap) {
        const queue = (childrenMap.get(taskId) || []).slice();
        let completedCount = 0;

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            if (isTaskTerminal(current)) completedCount += 1;
            const nestedChildren = childrenMap.get(current.id) || [];
            nestedChildren.forEach((child) => queue.push(child));
        }

        return completedCount;
    }

    function buildScopedToneVars(color) {
        const normalized = normalizePaletteHex(color) || '#94a3b8';
        return {
            '--planning-project-color': normalized,
            '--planning-project-color-soft': normalized + '16',
            '--planning-project-color-border': normalized + '2e',
        };
    }

    function pickDistinctTaskGroupColor(tasks, projects, options) {
        const excludeTaskId = options?.excludeTaskId || null;
        const excludeColor = normalizePaletteHex(options?.excludeColor);
        const usedColors = new Set();

        (Array.isArray(projects) ? projects : []).forEach((project) => {
            const normalized = normalizePaletteHex(project?.color);
            if (normalized) usedColors.add(normalized);
        });

        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
            if (!task || task.id === excludeTaskId) return;
            const normalized = normalizePaletteHex(task.subprojectColor);
            if (normalized) usedColors.add(normalized);
        });

        const available = PROJECT_COLORS
            .map((color) => normalizePaletteHex(color))
            .filter((color) => color && color !== excludeColor && !usedColors.has(color));

        if (available.length > 0) return available[0];

        const fallback = PROJECT_COLORS
            .map((color) => normalizePaletteHex(color))
            .filter((color) => color && color !== excludeColor);

        return fallback[0] || '#94a3b8';
    }

    function buildParentGroupLabel(task, taskLookup) {
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

    function buildTaskMetaBadges(task) {
        const todayIso = dateStr();
        const tomorrowIso = addDaysToIsoDate(todayIso, 1);
        const badges = [];
        const isTerminal = task?.status === 'done' || task?.status === 'cancelled';

        if (task?.startDate && task.startDate !== todayIso) {
            badges.push({
                key: 'start',
                tone: 'start',
                label: 'Старт ' + formatIsoDateShort(task.startDate, todayIso, tomorrowIso),
            });
        }

        if (task?.dueDate) {
            let tone = 'due';
            if (!isTerminal && task.dueDate < todayIso) tone = 'due-overdue';
            else if (!isTerminal && task.dueDate === todayIso) tone = 'due-today';

            badges.push({
                key: 'due',
                tone,
                label: 'Дедлайн ' + formatIsoDateShort(task.dueDate, todayIso, tomorrowIso),
            });
        }

        if (task?.plannedMinutes) {
            badges.push({
                key: 'duration',
                tone: 'duration',
                label: formatDurationLabel(task.plannedMinutes),
            });
        }

        return badges;
    }

    function getDueDatePreset(isoDate, todayIso, tomorrowIso) {
        if (!isoDate) return '';
        if (isoDate === todayIso) return 'today';
        if (isoDate === tomorrowIso) return 'tomorrow';
        return 'custom';
    }

    function TaskPriorityButtons({ value, onChange }) {
        return h('div', { className: 'planning-quick-add__actions planning-quick-add__actions--priority-row' },
            Object.keys(PRIORITY_CONFIG).map((key) => {
                const config = PRIORITY_CONFIG[key];
                return h('button', {
                    key,
                    type: 'button',
                    className: 'planning-priority-btn' + (value === key ? ' active' : ''),
                    style: value === key
                        ? { color: config.color, background: config.bg, borderColor: config.border || config.color }
                        : undefined,
                    onClick: () => onChange(key),
                }, config.label);
            }),
        );
    }

    function TaskStatusButtons({ value, onChange }) {
        return h('div', {
            className: 'planning-task-editor__status-grid',
            role: 'group',
            'aria-label': 'Статус задачи',
        },
            Object.keys(STATUS_CONFIG).map((key) => h('button', {
                key,
                type: 'button',
                className: 'planning-task-editor__status-btn' + (value === key ? ' active' : ''),
                'aria-pressed': value === key ? 'true' : 'false',
                onClick: () => onChange(key),
            }, STATUS_CONFIG[key].label)),
        );
    }

    function TaskDueDatePicker({
        value,
        onChange,
        todayIso,
        tomorrowIso,
        inputRef,
        buttonRef,
        onCalendarClick,
        isCalendarOpen,
        ariaLabel,
    }) {
        const safeValue = value || '';
        const dueDateLabel = formatIsoDateShort(safeValue, todayIso, tomorrowIso);
        const duePreset = getDueDatePreset(safeValue, todayIso, tomorrowIso);
        const isCalendarActive = duePreset === 'custom' || !!isCalendarOpen;

        return h('div', {
            className: 'planning-date-picker',
            role: 'group',
            'aria-label': ariaLabel || 'Дедлайн задачи',
        },
            h('input', {
                ref: inputRef,
                className: 'planning-date-picker__native-input',
                type: 'date',
                value: safeValue,
                tabIndex: -1,
                'aria-hidden': 'true',
                onChange: (event) => onChange(event.target.value),
            }),
            h('button', {
                type: 'button',
                className: 'planning-date-picker__btn' + (duePreset === 'today' ? ' active' : ''),
                'aria-pressed': duePreset === 'today' ? 'true' : 'false',
                onClick: () => onChange(safeValue === todayIso ? '' : todayIso),
            }, 'Сегодня'),
            h('button', {
                type: 'button',
                className: 'planning-date-picker__btn' + (duePreset === 'tomorrow' ? ' active' : ''),
                'aria-pressed': duePreset === 'tomorrow' ? 'true' : 'false',
                onClick: () => onChange(safeValue === tomorrowIso ? '' : tomorrowIso),
            }, 'Завтра'),
            h('button', {
                ref: buttonRef,
                type: 'button',
                className: 'planning-date-picker__btn planning-date-picker__btn--calendar'
                    + (isCalendarActive ? ' active' : '')
                    + (isCalendarOpen ? ' is-open' : ''),
                title: dueDateLabel ? ('Открыть календарь, выбран дедлайн ' + dueDateLabel) : 'Открыть календарь',
                'aria-label': dueDateLabel ? ('Открыть календарь, выбран дедлайн ' + dueDateLabel) : 'Открыть календарь',
                'aria-pressed': isCalendarActive ? 'true' : 'false',
                onClick: onCalendarClick,
            }, '📅'),
        );
    }

    function TaskComposerFields({
        title,
        onTitleChange,
        titlePlaceholder,
        titleInputRef,
        onTitleKeyDown,
        actionButtons,
        primaryField,
        priorityValue,
        onPriorityChange,
        dueDate,
        onDueDateChange,
        todayIso,
        tomorrowIso,
        dueDateInputRef,
        dueCalendarButtonRef,
        onDueCalendarClick,
        isDueCalendarOpen,
        dueAriaLabel,
        durationValue,
        onDurationClick,
        durationPlaceholder,
        durationMinimal,
    }) {
        return h('div', { className: 'planning-quick-add' },
            h('div', { className: 'planning-quick-add__title-row' },
                h('input', {
                    ref: titleInputRef,
                    className: 'planning-quick-input planning-quick-input--main',
                    placeholder: titlePlaceholder || 'Новая задача...',
                    value: title,
                    onChange: (event) => onTitleChange(event.target.value),
                    onKeyDown: onTitleKeyDown,
                }),
                actionButtons || null,
            ),
            h('div', { className: 'planning-quick-add__primary-row' },
                primaryField,
                h(TaskPriorityButtons, {
                    value: priorityValue,
                    onChange: onPriorityChange,
                }),
            ),
            h('div', { className: 'planning-quick-add__secondary-row' },
                h(TaskDueDatePicker, {
                    value: dueDate,
                    onChange: onDueDateChange,
                    todayIso,
                    tomorrowIso,
                    inputRef: dueDateInputRef,
                    buttonRef: dueCalendarButtonRef,
                    onCalendarClick: onDueCalendarClick,
                    isCalendarOpen: isDueCalendarOpen,
                    ariaLabel: dueAriaLabel,
                }),
                h(DurationFieldButton, {
                    value: durationValue,
                    placeholder: durationPlaceholder || 'мин/дн',
                    minimal: durationMinimal !== false,
                    onClick: onDurationClick,
                }),
            ),
        );
    }

    function TaskComposerCard({
        cardTitle,
        cardHint,
        headerActions,
        ...fieldsProps
    }) {
        return h('section', { className: 'planning-quick-add-card' },
            (cardTitle || cardHint || headerActions) && h('div', { className: 'planning-quick-add-card__header' },
                h('div', { className: 'planning-quick-add-card__copy' },
                    cardTitle && h('span', { className: 'planning-quick-add-card__title' }, cardTitle),
                    cardHint && h('span', { className: 'planning-quick-add-card__hint' }, cardHint),
                ),
                headerActions && h('div', { className: 'planning-tasks-toolbar' }, headerActions),
            ),
            h(TaskComposerFields, fieldsProps),
        );
    }

    function TaskRow(props) {
        const {
            task,
            taskLookup,
            depth,
            isMobile,
            onUpdate,
            onDelete,
            onSelect,
            onStartQuickAddSubtask,
            onDropTask,
            extraActions,
            actionsClassName,
        } = props;

        const [editing, setEditing] = useState(false);
        const [draftTitle, setDraftTitle] = useState(task.title);
        const isDone = task.status === 'done' || task.status === 'cancelled';
        const isUrgent = task.priority === 'p!';
        const metaBadges = buildTaskMetaBadges(task);
        const trailingActions = React.Children.toArray(extraActions);

        const stopSwipeCapture = (event) => {
            event.stopPropagation();
        };

        const commitTitle = () => {
            const nextTitle = String(draftTitle || '').trim();
            if (nextTitle && nextTitle !== task.title) {
                onUpdate(task.id, { title: nextTitle });
            }
            setEditing(false);
            setDraftTitle(nextTitle || task.title);
        };

        const rowContent = h('div', {
            className: 'planning-task-row'
                + (isDone ? ' planning-task-row--done' : '')
                + (isUrgent ? ' planning-task-row--priority-urgent' : ''),
            draggable: !isMobile,
            onDragStart: (event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/heys-planning-task', JSON.stringify({ taskId: task.id }));
            },
            onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            },
            onDrop: (event) => {
                event.preventDefault();
                try {
                    const payload = JSON.parse(event.dataTransfer.getData('text/heys-planning-task'));
                    if (payload?.taskId) onDropTask(payload.taskId, task.id);
                } catch (error) {
                    console.warn('[HEYS.planning] Invalid task reorder payload:', error?.message || error);
                }
            },
        },
            h('div', {
                className: 'planning-task-row__indent',
                style: { width: (depth * 18) + 'px' },
            }),
            h(TaskStatusToggle, { task, onUpdate }),
            h('div', {
                className: 'planning-task-row__body',
                onClick: () => {
                    if (!editing) onSelect(task.id);
                },
            },
                editing
                    ? h('input', {
                        className: 'planning-inline-input',
                        'data-swipe-ignore': 'true',
                        value: draftTitle,
                        autoFocus: true,
                        onChange: (event) => setDraftTitle(event.target.value),
                        onBlur: commitTitle,
                        onPointerDown: stopSwipeCapture,
                        onTouchStart: stopSwipeCapture,
                        onKeyDown: (event) => {
                            if (event.key === 'Enter') commitTitle();
                            if (event.key === 'Escape') {
                                setDraftTitle(task.title);
                                setEditing(false);
                            }
                        },
                        onClick: (event) => event.stopPropagation(),
                    })
                    : h('div', { className: 'planning-task-row__main-line' },
                        h('button', {
                            type: 'button',
                            className: 'planning-task-row__title-trigger',
                            'data-swipe-ignore': 'true',
                            title: 'Изменить название',
                            onPointerDown: stopSwipeCapture,
                            onTouchStart: stopSwipeCapture,
                            onClick: (event) => {
                                event.stopPropagation();
                                setEditing(true);
                            },
                        },
                            h('span', { className: 'planning-task-row__title' }, task.title),
                        ),
                        metaBadges.length > 0 && h('div', { className: 'planning-task-row__meta-list' },
                            metaBadges.map((badge) => h('span', {
                                key: badge.key,
                                className: 'planning-task-row__meta-chip planning-task-row__meta-chip--' + badge.tone,
                            }, badge.label)),
                        ),
                    ),
            ),
            h('div', {
                className: 'planning-task-row__actions' + (actionsClassName ? (' ' + actionsClassName) : ''),
                'data-swipe-ignore': 'true',
                onPointerDown: stopSwipeCapture,
                onTouchStart: stopSwipeCapture,
            },
                trailingActions,
                h('button', {
                    type: 'button',
                    className: 'planning-icon-btn planning-icon-btn--subtask',
                    'data-swipe-ignore': 'true',
                    title: 'Добавить подзадачу',
                    onPointerDown: stopSwipeCapture,
                    onTouchStart: stopSwipeCapture,
                    onClick: (event) => {
                        event.stopPropagation();
                        onStartQuickAddSubtask(task);
                    },
                }, '↳'),
                h('button', {
                    type: 'button',
                    className: 'planning-icon-btn planning-icon-btn--edit',
                    'data-swipe-ignore': 'true',
                    title: 'Редактировать задачу',
                    'aria-label': 'Редактировать задачу',
                    onPointerDown: stopSwipeCapture,
                    onTouchStart: stopSwipeCapture,
                    onClick: (event) => {
                        event.stopPropagation();
                        onSelect(task.id);
                    },
                }, '✎'),
                h('button', {
                    type: 'button',
                    className: 'planning-icon-btn planning-icon-btn--danger',
                    'data-swipe-ignore': 'true',
                    title: 'Удалить задачу',
                    'aria-label': 'Удалить задачу',
                    onPointerDown: stopSwipeCapture,
                    onTouchStart: stopSwipeCapture,
                    onClick: (event) => {
                        event.stopPropagation();
                        onDelete(task.id);
                    },
                }, '🗑'),
            ),
        );

        return h('div', {
            className: 'planning-task-node' + (isDone ? ' planning-task-node--done' : ''),
            style: { '--planning-depth': depth },
        },
            (isMobile && HEYS.SwipeableRow)
                ? h(HEYS.SwipeableRow, {
                    onDelete: () => onDelete(task.id),
                    className: 'planning-task-swipe',
                }, rowContent)
                : rowContent,
        );
    }

    function TaskBranch(props) {
        const { task, depth, childrenMap } = props;
        const children = childrenMap.get(task.id) || [];

        if (children.length === 0) {
            return h(TaskRow, {
                task,
                taskLookup: props.taskLookup,
                depth,
                isMobile: props.isMobile,
                onUpdate: props.onUpdateTask,
                onDelete: props.onDeleteTask,
                onSelect: props.onSelectTask,
                onStartQuickAddSubtask: props.onStartQuickAddSubtask,
                onDropTask: props.onReorderTasks,
            });
        }

        return h(TaskSubgroupGroup, props);
    }

    function TaskSubgroupGroup(props) {
        const {
            task,
            depth,
            taskLookup,
            tasks,
            projects,
            childrenMap,
            isMobile,
            onUpdateTask,
            onDeleteTask,
            onSelectTask,
            onStartQuickAddSubtask,
            onReorderTasks,
            forceShowCompleted,
        } = props;

        const [showColorPalette, setShowColorPalette] = useState(false);
        const [showCompleted, setShowCompleted] = useState(false);
        const colorPickerRef = useRef(null);
        const subgroupColor = normalizePaletteHex(task.subprojectColor) || '#94a3b8';
        const toneVars = useMemo(() => buildScopedToneVars(subgroupColor), [subgroupColor]);
        const directChildren = childrenMap.get(task.id) || [];
        const activeChildren = directChildren.filter((entry) => !isTaskTerminal(entry));
        const completedChildren = directChildren.filter((entry) => isTaskTerminal(entry));
        const completedCount = useMemo(() => countCompletedBranchTasks(task.id, childrenMap), [task.id, childrenMap]);
        const revealCompleted = !!(forceShowCompleted || showCompleted);
        const occupiedColors = useMemo(() => new Set(
            (projects || [])
                .map((entry) => normalizePaletteHex(entry?.color))
                .concat((tasks || [])
                    .filter((entry) => entry && entry.id !== task.id)
                    .map((entry) => normalizePaletteHex(entry.subprojectColor)))
                .filter(Boolean),
        ), [projects, task.id, tasks]);
        const hasAvailableColors = useMemo(
            () => PROJECT_COLORS.some((color) => {
                const normalized = normalizePaletteHex(color);
                return normalized && !occupiedColors.has(normalized);
            }),
            [occupiedColors],
        );

        React.useEffect(() => {
            if (!showColorPalette) return undefined;
            const handlePointerDown = (event) => {
                const root = colorPickerRef.current;
                if (!root || isPaletteInteractionTarget(root, event.target)) return;
                setShowColorPalette(false);
            };
            window.addEventListener('pointerdown', handlePointerDown);
            return () => window.removeEventListener('pointerdown', handlePointerDown);
        }, [showColorPalette]);

        const subgroupActions = [];

        if (completedCount > 0 && !forceShowCompleted) {
            subgroupActions.push(h('button', {
                key: 'completed-toggle',
                type: 'button',
                className: 'planning-completed-toggle' + (showCompleted ? ' active' : ''),
                title: showCompleted ? 'Скрыть завершённые задачи подпроекта' : 'Показать завершённые задачи подпроекта',
                onClick: (event) => {
                    event.stopPropagation();
                    setShowCompleted((value) => !value);
                },
            }, showCompleted ? 'Скрыть завершённые' : ('Показать завершённые · ' + completedCount)));
        }

        subgroupActions.push(h(ColorPalettePicker, {
            key: 'color-picker',
            pickerRef: colorPickerRef,
            isOpen: showColorPalette,
            currentColor: subgroupColor,
            occupiedColors,
            hasAvailableColors,
            title: 'Цвет подпроекта',
            onToggle: () => setShowColorPalette((value) => !value),
            onPick: (color) => {
                onUpdateTask(task.id, { subprojectColor: color });
                setShowColorPalette(false);
            },
        }));

        return h('section', {
            className: 'planning-project-group planning-project-group--subgroup'
                + (showColorPalette ? ' planning-project-group--palette-open' : ''),
            style: toneVars,
        },
            h('div', { className: 'planning-task-group__header' },
                h(TaskRow, {
                    task,
                    taskLookup,
                    depth,
                    isMobile,
                    onUpdate: onUpdateTask,
                    onDelete: onDeleteTask,
                    onSelect: onSelectTask,
                    onStartQuickAddSubtask,
                    onDropTask: onReorderTasks,
                    extraActions: subgroupActions,
                    actionsClassName: 'planning-task-row__actions--group',
                }),
            ),
            h('div', { className: 'planning-project-group__tasks planning-task-group__tasks' },
                activeChildren.map((child) => h(TaskBranch, {
                    key: child.id,
                    task: child,
                    taskLookup,
                    depth: depth + 1,
                    tasks,
                    projects,
                    childrenMap,
                    isMobile,
                    onUpdateTask,
                    onDeleteTask,
                    onSelectTask,
                    onStartQuickAddSubtask,
                    onReorderTasks,
                    forceShowCompleted: revealCompleted,
                })),
                revealCompleted && completedChildren.map((child) => h(TaskBranch, {
                    key: child.id,
                    task: child,
                    taskLookup,
                    depth: depth + 1,
                    tasks,
                    projects,
                    childrenMap,
                    isMobile,
                    onUpdateTask,
                    onDeleteTask,
                    onSelectTask,
                    onStartQuickAddSubtask,
                    onReorderTasks,
                    forceShowCompleted: revealCompleted,
                })),
                activeChildren.length === 0 && completedCount > 0 && !revealCompleted
                    ? h('div', { className: 'planning-empty planning-empty--inline planning-empty--completed-hint' }, 'Завершённые внутри подпроекта скрыты.')
                    : null,
            ),
        );
    }

    function ProjectGroup(props) {
        const {
            project,
            projects,
            tasks,
            taskLookup,
            isMobile,
            onUpdateTask,
            onDeleteTask,
            onSelectTask,
            onStartQuickAddProject,
            onStartQuickAddSubtask,
            onUpdateProject,
            onDeleteProject,
            onReorderTasks,
            forceShowCompleted,
        } = props;

        const [collapsed, setCollapsed] = useState(false);
        const [showColorPalette, setShowColorPalette] = useState(false);
        const [showCompleted, setShowCompleted] = useState(false);
        const colorPickerRef = useRef(null);
        const projectTone = normalizePaletteHex(project.color) || '#94a3b8';
        const toneVars = useMemo(() => buildScopedToneVars(projectTone), [projectTone]);
        const occupiedColors = useMemo(() => new Set(
            (projects || [])
                .filter((entry) => entry && entry.id !== project.id)
                .map((entry) => normalizePaletteHex(entry.color))
                .filter(Boolean),
        ), [project.id, projects]);
        const hasAvailableColors = useMemo(() => PROJECT_COLORS.some((color) => {
            const normalized = normalizePaletteHex(color);
            return normalized && !occupiedColors.has(normalized);
        }), [occupiedColors]);
        const childrenMap = useMemo(() => buildTaskChildrenMap(tasks), [tasks]);
        const topLevelTasks = childrenMap.get('') || [];
        const activeTopLevelTasks = topLevelTasks.filter((task) => !isTaskTerminal(task));
        const completedTopLevelTasks = topLevelTasks.filter((task) => isTaskTerminal(task));
        const activeTaskCount = useMemo(() => tasks.filter((task) => !isTaskTerminal(task)).length, [tasks]);
        const completedTaskCount = useMemo(() => tasks.filter((task) => isTaskTerminal(task)).length, [tasks]);
        const revealCompleted = !!(forceShowCompleted || showCompleted);

        React.useEffect(() => {
            if (!showColorPalette) return undefined;
            const handlePointerDown = (event) => {
                const root = colorPickerRef.current;
                if (!root || isPaletteInteractionTarget(root, event.target)) return;
                setShowColorPalette(false);
            };
            window.addEventListener('pointerdown', handlePointerDown);
            return () => window.removeEventListener('pointerdown', handlePointerDown);
        }, [showColorPalette]);

        const handleQuickAddClick = (event) => {
            event.stopPropagation();
            onStartQuickAddProject(project.id === '__none__' ? '' : project.id);
        };

        const handleDeleteProjectClick = (event) => {
            event.stopPropagation();
            if (project.id === '__none__' || typeof onDeleteProject !== 'function') return;
            onDeleteProject(project.id);
        };

        return h('section', {
            className: 'planning-project-group' + (showColorPalette ? ' planning-project-group--palette-open' : ''),
            style: toneVars,
        },
            h('div', {
                className: 'planning-project-group__header',
                onClick: () => setCollapsed((value) => !value),
            },
                h('span', {
                    className: 'planning-project-group__dot',
                    style: { background: projectTone },
                }),
                h('span', { className: 'planning-project-group__name' }, project.name),
                h('span', { className: 'planning-project-group__count' }, '(' + activeTaskCount + ')'),
                h('div', {
                    className: 'planning-project-group__header-actions',
                    onClick: (event) => event.stopPropagation(),
                },
                    completedTaskCount > 0 && !forceShowCompleted && h('button', {
                        type: 'button',
                        className: 'planning-completed-toggle' + (showCompleted ? ' active' : ''),
                        title: showCompleted ? 'Скрыть завершённые задачи проекта' : 'Показать завершённые задачи проекта',
                        onClick: (event) => {
                            event.stopPropagation();
                            setShowCompleted((value) => !value);
                        },
                    }, showCompleted ? 'Скрыть завершённые' : ('Показать завершённые · ' + completedTaskCount)),
                    project.id !== '__none__' && h(ColorPalettePicker, {
                        pickerRef: colorPickerRef,
                        isOpen: showColorPalette,
                        currentColor: projectTone,
                        occupiedColors,
                        hasAvailableColors,
                        title: 'Цвет категории',
                        onToggle: () => setShowColorPalette((value) => !value),
                        onPick: (color) => {
                            onUpdateProject(project.id, { color });
                            setShowColorPalette(false);
                        },
                    }),
                    h('button', {
                        type: 'button',
                        className: 'planning-project-group__quick-add-btn',
                        title: project.id === '__none__' ? 'Добавить задачу без проекта' : ('Добавить задачу в «' + project.name + '»'),
                        onClick: handleQuickAddClick,
                    }, '+ Задача'),
                    project.id !== '__none__' && h('button', {
                        type: 'button',
                        className: 'planning-project-group__action-btn planning-project-group__action-btn--danger',
                        title: 'Удалить проект «' + project.name + '» и перенести его задачи в «Без проекта»',
                        'aria-label': 'Удалить проект «' + project.name + '»',
                        onClick: handleDeleteProjectClick,
                    }, '🗑'),
                ),
                h('span', { className: 'planning-project-group__chevron' + (collapsed ? ' collapsed' : '') }, '▾'),
            ),
            !collapsed && h('div', { className: 'planning-project-group__tasks' },
                activeTopLevelTasks.map((task) => h(TaskBranch, {
                    key: task.id,
                    task,
                    taskLookup,
                    depth: 0,
                    tasks,
                    projects,
                    childrenMap,
                    isMobile,
                    onUpdateTask,
                    onDeleteTask,
                    onSelectTask,
                    onStartQuickAddSubtask,
                    onReorderTasks,
                    forceShowCompleted: revealCompleted,
                })),
                revealCompleted && completedTopLevelTasks.map((task) => h(TaskBranch, {
                    key: task.id,
                    task,
                    taskLookup,
                    depth: 0,
                    tasks,
                    projects,
                    childrenMap,
                    isMobile,
                    onUpdateTask,
                    onDeleteTask,
                    onSelectTask,
                    onStartQuickAddSubtask,
                    onReorderTasks,
                    forceShowCompleted: revealCompleted,
                })),
                activeTopLevelTasks.length === 0 && completedTaskCount > 0 && !revealCompleted
                    ? h('div', { className: 'planning-empty planning-empty--inline planning-empty--completed-hint' }, 'Завершённые задачи скрыты до раскрытия.')
                    : null,
                activeTopLevelTasks.length === 0 && completedTaskCount === 0
                    ? h('div', { className: 'planning-empty planning-empty--inline' }, 'Пока нет задач в этой группе.')
                    : null,
            ),
        );
    }

    function TaskDetailModal({ taskId, state, resolvedTaskProjectIds, onDeleteTask, onClose }) {
        const { tasks, projects, slots } = state;
        const task = tasks.find((entry) => entry.id === taskId);
        const taskKey = task ? task.id : '';
        const effectiveProjectId = task ? (getResolvedTaskProjectId(task.id, resolvedTaskProjectIds) || '') : '';
        const todayIso = dateStr();
        const tomorrowIso = addDaysToIsoDate(todayIso, 1);

        const [savedMarker, setSavedMarker] = useState(0);
        const [showDurationPicker, setShowDurationPicker] = useState(false);
        const [showDueCalendar, setShowDueCalendar] = useState(false);
        const [showDependencyPicker, setShowDependencyPicker] = useState(false);
        const [confirmDelete, setConfirmDelete] = useState(false);
        const dueCalendarButtonRef = useRef(null);
        const dueDateInputRef = useRef(null);
        const titleInputRef = useRef(null);
        const confirmDeleteTimerRef = useRef(0);

        const descendants = useMemo(
            () => (task ? collectDescendantIds(tasks, task.id) : new Set()),
            [tasks, taskKey],
        );
        const linkedSlots = useMemo(
            () => (task ? slots.filter((slot) => slot.taskId === task.id) : []),
            [slots, taskKey],
        );

        const buildFormFromTask = (sourceTask, projectId) => ({
            title: sourceTask?.title || '',
            status: sourceTask?.status || 'todo',
            priority: sourceTask?.priority || 'p2',
            projectId: projectId || '',
            parentTaskId: sourceTask?.parentTaskId || '',
            startDate: sourceTask?.startDate || '',
            dueDate: sourceTask?.dueDate || '',
            plannedMinutes: sourceTask?.plannedMinutes || '',
            baselineStartDate: sourceTask?.baselineStartDate || '',
            baselineDueDate: sourceTask?.baselineDueDate || '',
            baselinePlannedMinutes: sourceTask?.baselinePlannedMinutes || '',
            blockedByTaskIds: Array.isArray(sourceTask?.blockedByTaskIds) ? sourceTask.blockedByTaskIds.slice() : [],
        });

        const [form, setForm] = useState(() => buildFormFromTask(task, effectiveProjectId));

        React.useEffect(() => {
            if (!task) return;
            setForm(buildFormFromTask(task, effectiveProjectId));
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [taskKey, savedMarker]);

        React.useEffect(() => {
            const handleKey = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    onClose();
                }
            };
            window.addEventListener('keydown', handleKey);
            return () => window.removeEventListener('keydown', handleKey);
        }, [onClose]);

        React.useEffect(() => {
            if (!task) return;
            const inputNode = titleInputRef.current;
            if (!inputNode) return;
            const focusTimer = window.setTimeout(() => {
                try { inputNode.focus(); } catch (_) {}
            }, 60);
            return () => window.clearTimeout(focusTimer);
        }, [taskKey]);

        React.useEffect(() => () => {
            if (confirmDeleteTimerRef.current) {
                window.clearTimeout(confirmDeleteTimerRef.current);
                confirmDeleteTimerRef.current = 0;
            }
        }, []);

        const eligibleTargetTasks = useMemo(
            () => (task ? tasks.filter((entry) => entry.id !== task.id && !descendants.has(entry.id)) : []),
            [tasks, taskKey, descendants],
        );

        if (!task) return null;

        const handleField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

        const handleDueDateChange = (nextValue) => {
            handleField('dueDate', nextValue || '');
            setShowDueCalendar(false);
        };

        const toggleDependency = (depId) => {
            if (!depId) return;
            setForm((current) => {
                const list = Array.isArray(current.blockedByTaskIds) ? current.blockedByTaskIds : [];
                const next = list.includes(depId) ? list.filter((id) => id !== depId) : [...list, depId];
                return { ...current, blockedByTaskIds: next };
            });
        };
        const removeDependency = (depId) => {
            if (!depId) return;
            setForm((current) => ({
                ...current,
                blockedByTaskIds: (current.blockedByTaskIds || []).filter((id) => id !== depId),
            }));
        };

        const handleDeleteClick = () => {
            if (!confirmDelete) {
                setConfirmDelete(true);
                if (confirmDeleteTimerRef.current) window.clearTimeout(confirmDeleteTimerRef.current);
                confirmDeleteTimerRef.current = window.setTimeout(() => {
                    setConfirmDelete(false);
                    confirmDeleteTimerRef.current = 0;
                }, 4000);
                return;
            }
            if (confirmDeleteTimerRef.current) {
                window.clearTimeout(confirmDeleteTimerRef.current);
                confirmDeleteTimerRef.current = 0;
            }
            if (typeof onDeleteTask === 'function') {
                onDeleteTask(task.id);
            } else {
                state.deleteTask(task.id);
            }
            onClose();
        };

        const openDueDatePicker = () => {
            if (ReactDOM) {
                setShowDueCalendar((value) => !value);
                return;
            }
            const inputNode = dueDateInputRef.current;
            if (!inputNode) return;
            if (typeof inputNode.showPicker === 'function') {
                inputNode.showPicker();
                return;
            }
            inputNode.focus();
            inputNode.click();
        };

        const handleSave = () => {
            const nextTitle = String(form.title || '').trim();
            if (!nextTitle) return;
            const nextParentTaskId = form.parentTaskId || undefined;
            const nextProjectId = nextParentTaskId
                ? getResolvedTaskProjectId(nextParentTaskId, resolvedTaskProjectIds)
                : (form.projectId || undefined);
            state.updateTask(task.id, {
                title: nextTitle,
                status: form.status,
                priority: form.priority,
                projectId: nextProjectId,
                parentTaskId: nextParentTaskId,
                startDate: form.startDate || undefined,
                dueDate: form.dueDate || undefined,
                plannedMinutes: form.plannedMinutes ? Number(form.plannedMinutes) : undefined,
                baselineStartDate: form.baselineStartDate || undefined,
                baselineDueDate: form.baselineDueDate || undefined,
                baselinePlannedMinutes: form.baselinePlannedMinutes ? Number(form.baselinePlannedMinutes) : undefined,
                blockedByTaskIds: form.blockedByTaskIds,
            });
            setSavedMarker((value) => value + 1);
            onClose();
        };

        const handleQuickSchedule = () => {
            const slotDate = form.startDate || form.dueDate || dateStr();
            const plannedMinutes = Number(form.plannedMinutes) > 0 ? Number(form.plannedMinutes) : getTaskDurationMinutes(task);
            const todayDateStr = dateStr();
            let startMinutes;
            if (slotDate === todayDateStr) {
                const now = new Date();
                const nowMinutes = now.getHours() * 60 + now.getMinutes();
                startMinutes = Math.min(Math.ceil((nowMinutes + 5) / 15) * 15, 23 * 60 + 45);
            } else {
                startMinutes = 9 * 60;
            }
            state.addSlot({
                taskId: task.id,
                date: slotDate,
                startTime: Planning.Utils.minutesToTime(startMinutes),
                endTime: Planning.Utils.minutesToTime(startMinutes + plannedMinutes),
                title: '',
            });
            onClose();
        };

        const dependencyTasks = form.blockedByTaskIds
            .map((dependencyId) => tasks.find((entry) => entry.id === dependencyId))
            .filter(Boolean);
        const dependencyAvailable = eligibleTargetTasks.filter((entry) => !form.blockedByTaskIds.includes(entry.id));
        const parentTitle = form.parentTaskId
            ? ((tasks.find((entry) => entry.id === form.parentTaskId) || {}).title || 'Родитель выбран')
            : 'Верхний уровень';
        const dependencySummary = dependencyTasks.length > 0
            ? (dependencyTasks.slice(0, 2).map((entry) => entry.title).join(', ') + (dependencyTasks.length > 2 ? (' +' + (dependencyTasks.length - 2)) : ''))
            : 'Пока без зависимостей';
        const baselineSummaryParts = [];
        if (form.baselineStartDate) baselineSummaryParts.push('старт ' + formatIsoDateShort(form.baselineStartDate, todayIso, tomorrowIso));
        if (form.baselineDueDate) baselineSummaryParts.push('дедлайн ' + formatIsoDateShort(form.baselineDueDate, todayIso, tomorrowIso));
        if (Number(form.baselinePlannedMinutes) > 0) baselineSummaryParts.push(formatMinutesSummary(form.baselinePlannedMinutes));
        const baselineSummary = baselineSummaryParts.length > 0 ? baselineSummaryParts.join(' · ') : 'Baseline не задан';
        const linkedSlotsSummary = linkedSlots.length > 0
            ? (linkedSlots.length + ' в календаре')
            : 'Слот ещё не поставлен';
        const quickTargetValue = form.parentTaskId
            ? createQuickTargetValue('task', form.parentTaskId)
            : (form.projectId ? createQuickTargetValue('project', form.projectId) : '');
        const handleQuickTargetChange = (nextValue) => {
            const resolved = resolveQuickTargetValue(nextValue, eligibleTargetTasks, resolvedTaskProjectIds);
            setForm((current) => ({
                ...current,
                projectId: resolved.projectId || '',
                parentTaskId: resolved.parentTaskId || '',
            }));
        };
        const projectField = h(PlanningQuickTargetField, {
            value: quickTargetValue,
            onChange: handleQuickTargetChange,
            projects,
            tasks: eligibleTargetTasks,
            resolvedTaskProjectIds,
            tabsSelector: '.tabs',
        });

        return h('div', { className: 'planning-modal-overlay', onClick: onClose },
            h('div', { className: 'planning-modal planning-modal--task-editor', onClick: (event) => event.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, 'Задача'),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose }, '×'),
                ),
                h('div', { className: 'planning-modal__body' },
                    h(TaskComposerCard, {
                        cardTitle: 'Редактирование задачи',
                        title: form.title,
                        onTitleChange: (value) => handleField('title', value),
                        titlePlaceholder: 'Название задачи...',
                        titleInputRef,
                        onTitleKeyDown: (event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                handleSave();
                            }
                        },
                        primaryField: projectField,
                        priorityValue: form.priority,
                        onPriorityChange: (value) => handleField('priority', value),
                        dueDate: form.dueDate,
                        onDueDateChange: handleDueDateChange,
                        todayIso,
                        tomorrowIso,
                        dueDateInputRef,
                        dueCalendarButtonRef,
                        onDueCalendarClick: openDueDatePicker,
                        isDueCalendarOpen: showDueCalendar,
                        dueAriaLabel: 'Дедлайн задачи в редакторе',
                        durationValue: form.plannedMinutes,
                        onDurationClick: () => setShowDurationPicker(true),
                        durationPlaceholder: 'мин/дн',
                        durationMinimal: true,
                    }),
                    h('div', { className: 'planning-modal__card-grid planning-task-editor-grid' },
                        h('section', { className: 'planning-modal__card planning-modal__card--compact' },
                            h('div', { className: 'planning-modal__card-header' },
                                h('span', { className: 'planning-modal__card-kicker' }, 'Состояние'),
                                h('span', { className: 'planning-modal__card-title' }, 'Статус и контекст'),
                                h('span', { className: 'planning-modal__card-hint' }, parentTitle),
                            ),
                            h(TaskStatusButtons, {
                                value: form.status,
                                onChange: (value) => handleField('status', value),
                            }),
                        ),
                        h('section', { className: 'planning-modal__card planning-modal__card--compact' },
                            h('div', { className: 'planning-modal__card-header' },
                                h('span', { className: 'planning-modal__card-kicker' }, 'План'),
                                h('span', { className: 'planning-modal__card-title' }, 'Старт и календарь'),
                                h('span', { className: 'planning-modal__card-hint' }, linkedSlotsSummary),
                            ),
                            h('div', { className: 'planning-task-editor__field-stack' },
                                h('div', { className: 'planning-task-editor__field' },
                                    h('label', { className: 'planning-task-editor__label' }, 'Старт'),
                                    h('input', {
                                        className: 'planning-quick-select planning-task-editor__input',
                                        type: 'date',
                                        value: form.startDate,
                                        onChange: (event) => handleField('startDate', event.target.value),
                                    }),
                                ),
                                linkedSlots.length > 0
                                    ? h('div', { className: 'planning-linked-banner planning-task-editor__banner' },
                                        h('span', null, '📅 ' + linkedSlotsSummary),
                                        h('span', null, linkedSlots[0].date),
                                    )
                                    : h('p', { className: 'planning-task-editor__hint' }, 'Если нужен слот, снизу уже есть быстрая кнопка «Запланировать».')
                            ),
                        ),
                    ),
                    h('details', { className: 'planning-modal__details planning-task-editor__details' },
                        h('summary', { className: 'planning-modal__details-summary' },
                            h('span', { className: 'planning-modal__details-title' }, 'Зависимости'),
                            h('span', { className: 'planning-modal__details-hint' }, dependencySummary),
                        ),
                        h('div', { className: 'planning-modal__details-body planning-task-editor__details-body' },
                            h('div', { className: 'planning-task-editor__field' },
                                h('label', { className: 'planning-task-editor__label' }, 'Зависимости'),
                                h('div', { className: 'planning-dependency-chips', role: 'list' },
                                    dependencyTasks.length === 0
                                        ? h('span', { className: 'planning-dependency-chips__empty' }, 'Нет зависимостей')
                                        : dependencyTasks.map((entry) => h('span', {
                                            key: entry.id,
                                            className: 'planning-dependency-chip',
                                            role: 'listitem',
                                        },
                                            h('span', { className: 'planning-dependency-chip__label' }, entry.title || 'Без названия'),
                                            h('button', {
                                                type: 'button',
                                                className: 'planning-dependency-chip__remove',
                                                onClick: () => removeDependency(entry.id),
                                                'aria-label': 'Убрать «' + (entry.title || 'задачу') + '»',
                                                title: 'Убрать',
                                            }, '×'),
                                        )),
                                ),
                                h('button', {
                                    type: 'button',
                                    className: 'planning-btn planning-btn--sm planning-dependency-add',
                                    onClick: () => setShowDependencyPicker((value) => !value),
                                    disabled: dependencyAvailable.length === 0,
                                    'aria-expanded': showDependencyPicker ? 'true' : 'false',
                                }, showDependencyPicker ? 'Закрыть' : '+ Добавить зависимость'),
                                showDependencyPicker && h('div', { className: 'planning-dependency-picker' },
                                    dependencyAvailable.length === 0
                                        ? h('div', { className: 'planning-dependency-picker__empty' }, 'Все доступные задачи уже добавлены')
                                        : dependencyAvailable.map((entry) => h('button', {
                                            key: entry.id,
                                            type: 'button',
                                            className: 'planning-dependency-picker__item',
                                            onClick: () => toggleDependency(entry.id),
                                        },
                                            h('span', { className: 'planning-dependency-picker__plus', 'aria-hidden': 'true' }, '+'),
                                            h('span', { className: 'planning-dependency-picker__title' }, entry.title || 'Без названия'),
                                        )),
                                ),
                            ),
                        ),
                    ),
                    h('details', { className: 'planning-modal__details planning-task-editor__details' },
                        h('summary', { className: 'planning-modal__details-summary' },
                            h('span', { className: 'planning-modal__details-title' }, 'Baseline'),
                            h('span', { className: 'planning-modal__details-hint' }, baselineSummary),
                        ),
                        h('div', { className: 'planning-modal__details-body planning-task-editor__details-body' },
                            h('div', { className: 'planning-modal__grid' },
                                h('div', { className: 'planning-task-editor__field' },
                                    h('label', { className: 'planning-task-editor__label' }, 'Baseline start'),
                                    h('input', {
                                        className: 'planning-quick-select planning-task-editor__input',
                                        type: 'date',
                                        value: form.baselineStartDate,
                                        onChange: (event) => handleField('baselineStartDate', event.target.value),
                                    }),
                                ),
                                h('div', { className: 'planning-task-editor__field' },
                                    h('label', { className: 'planning-task-editor__label' }, 'Baseline due'),
                                    h('input', {
                                        className: 'planning-quick-select planning-task-editor__input',
                                        type: 'date',
                                        value: form.baselineDueDate,
                                        onChange: (event) => handleField('baselineDueDate', event.target.value),
                                    }),
                                ),
                            ),
                        ),
                        h('div', { className: 'planning-modal__details-body planning-task-editor__details-body' },
                            h('div', { className: 'planning-task-editor__field' },
                                h('label', { className: 'planning-task-editor__label' }, 'Baseline minutes'),
                                h('input', {
                                    className: 'planning-quick-select planning-task-editor__input',
                                    type: 'number',
                                    min: 0,
                                    value: form.baselinePlannedMinutes,
                                    onChange: (event) => handleField('baselinePlannedMinutes', event.target.value),
                                }),
                            ),
                        ),
                    ),
                    linkedSlots.length > 0 && h('details', { className: 'planning-modal__details planning-task-editor__details' },
                        h('summary', { className: 'planning-modal__details-summary' },
                            h('span', { className: 'planning-modal__details-title' }, 'Привязанные слоты'),
                            h('span', { className: 'planning-modal__details-hint' }, linkedSlotsSummary),
                        ),
                        h('div', { className: 'planning-modal__details-body planning-task-editor__details-body' },
                            h('div', { className: 'planning-linked-list' },
                                linkedSlots.map((slot) => h('div', { key: slot.id, className: 'planning-linked-list__item' },
                                    h('span', null, slot.date + ' · ' + slot.startTime + '–' + slot.endTime),
                                )),
                            ),
                        ),
                    ),
                ),
                h('div', { className: 'planning-modal__footer planning-modal__footer--spread' },
                    h('button', {
                        type: 'button',
                        className: 'planning-btn planning-btn--danger' + (confirmDelete ? ' planning-btn--danger-armed' : ''),
                        onClick: handleDeleteClick,
                        title: confirmDelete ? 'Нажми ещё раз, чтобы удалить' : 'Удалить задачу',
                    }, confirmDelete ? 'Точно удалить?' : 'Удалить'),
                    h('div', { className: 'planning-modal__footer-actions' },
                        h('button', { type: 'button', className: 'planning-btn', onClick: handleQuickSchedule }, linkedSlots.length > 0 ? 'Добавить слот' : 'Запланировать'),
                        h('button', { type: 'button', className: 'planning-btn planning-btn--primary', onClick: handleSave }, 'Сохранить'),
                    ),
                ),
            ),
            showDurationPicker && h(DurationPresetModal, {
                title: 'Длительность задачи',
                subtitle: 'Выбери готовый пресет или задай точное число минут.',
                value: form.plannedMinutes,
                onSelect: (minutes) => handleField('plannedMinutes', minutes ? String(minutes) : ''),
                onClose: () => setShowDurationPicker(false),
            }),
            showDueCalendar && h(PlanningLoadDatePopover, {
                valueISO: form.dueDate,
                tasks,
                slots,
                anchorRef: dueCalendarButtonRef,
                onSelect: handleDueDateChange,
                onClear: () => handleDueDateChange(''),
                onClose: () => setShowDueCalendar(false),
            }),
        );
    }

    function TasksScreen({ state }) {
        const quickAddCardRef = useRef(null);
        const quickAddInputRef = useRef(null);
        const quickCalendarButtonRef = useRef(null);
        const quickDateInputRef = useRef(null);
        const [newTaskTitle, setNewTaskTitle] = useState('');
        const [newTaskProjectId, setNewTaskProjectId] = useState('');
        const [newProjectName, setNewProjectName] = useState('');
        const [pendingDeletedTaskIds, setPendingDeletedTaskIds] = useState(() => new Set());
        const [pendingDeletedProjectIds, setPendingDeletedProjectIds] = useState(() => new Set());
        const [selectedPriority, setSelectedPriority] = useState('p2');
        const [quickDueDate, setQuickDueDate] = useState('');
        const [quickMinutes, setQuickMinutes] = useState('');
        const [showFilters, setShowFilters] = useState(false);
        const [filterStatus, setFilterStatus] = useState('all');
        const [filterPriority, setFilterPriority] = useState('all');
        const [filterProject, setFilterProject] = useState('all');
        const [filterDueBucket, setFilterDueBucket] = useState('all');
        const [showQuickCalendar, setShowQuickCalendar] = useState(false);
        const [showQuickDurationPicker, setShowQuickDurationPicker] = useState(false);
        const [selectedTaskId, setSelectedTaskId] = useState(null);
        const [tasksUiScale, setTasksUiScale] = useState(readSavedTasksUiScale);

        React.useEffect(() => {
            try { window.localStorage.setItem(TASKS_UI_SCALE_STORAGE_KEY, String(tasksUiScale)); } catch (_) {}
            const planningTab = typeof document !== 'undefined' ? document.querySelector('.planning-tab') : null;
            if (!planningTab) return undefined;
            planningTab.style.setProperty('--planning-tasks-ui-scale', String(tasksUiScale));
            return () => {
                planningTab.style.removeProperty('--planning-tasks-ui-scale');
            };
        }, [tasksUiScale]);

        const adjustTasksUiScale = (delta) => setTasksUiScale((value) => clampTasksUiScale(value + delta));
        const resetTasksUiScale = () => setTasksUiScale(TASKS_UI_SCALE_DEFAULT);
        const viewport = Planning.Hooks && Planning.Hooks.usePlanningViewport
            ? Planning.Hooks.usePlanningViewport()
            : { isDesktop: false };
        const isMobile = !viewport.isDesktop;
        const todayIso = dateStr();
        const tomorrowIso = addDaysToIsoDate(todayIso, 1);
        const activeProjects = state.projects.filter((project) => project.status !== 'archived' && !pendingDeletedProjectIds.has(project.id));
        const activeFilterCount = useMemo(() => (
            [filterStatus, filterPriority, filterProject, filterDueBucket].filter((value) => value !== 'all').length
        ), [filterStatus, filterPriority, filterProject, filterDueBucket]);
        const forceShowCompleted = filterStatus === 'done';
        const visibleTasks = useMemo(() => state.tasks.filter((task) => !pendingDeletedTaskIds.has(task.id)), [state.tasks, pendingDeletedTaskIds]);
        const taskLookup = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks]);
        const visibleTaskChildrenMap = useMemo(() => buildTaskChildrenMap(visibleTasks), [visibleTasks]);
        const resolvedTaskProjectIds = useMemo(() => buildResolvedTaskProjectMap(state.tasks, activeProjects), [activeProjects, state.tasks]);
        const taskNeedingProjectRepair = useMemo(() => state.tasks.find((task) => {
            const currentProjectId = task.projectId || undefined;
            const resolvedProjectId = getResolvedTaskProjectId(task.id, resolvedTaskProjectIds);
            if (currentProjectId === resolvedProjectId) return false;
            return !!(task.parentTaskId || currentProjectId);
        }), [resolvedTaskProjectIds, state.tasks]);

        React.useEffect(() => {
            if (!taskNeedingProjectRepair) return;
            state.updateTask(taskNeedingProjectRepair.id, {
                projectId: getResolvedTaskProjectId(taskNeedingProjectRepair.id, resolvedTaskProjectIds),
            });
        }, [resolvedTaskProjectIds, state.updateTask, taskNeedingProjectRepair]);

        const filteredTasks = useMemo(() => visibleTasks.filter((task) => {
            if (filterStatus !== 'all' && task.status !== filterStatus) return false;
            if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
            if (filterProject !== 'all') {
                const effectiveProjectId = getResolvedTaskProjectId(task.id, resolvedTaskProjectIds) || '__none__';
                if (effectiveProjectId !== filterProject) return false;
            }
            if (filterDueBucket !== 'all') {
                const bucket = getDueBucket(task, todayIso, state.slots);
                if (bucket !== filterDueBucket) return false;
            }
            return true;
        }), [filterDueBucket, filterPriority, filterProject, filterStatus, resolvedTaskProjectIds, state.slots, todayIso, visibleTasks]);

        const tasksByProject = useMemo(() => {
            const map = {};
            activeProjects.forEach((project) => { map[project.id] = []; });
            map.__none__ = [];
            filteredTasks.forEach((task) => {
                const resolvedProjectId = getResolvedTaskProjectId(task.id, resolvedTaskProjectIds);
                const key = resolvedProjectId && map[resolvedProjectId] ? resolvedProjectId : '__none__';
                map[key].push(task);
            });
            return map;
        }, [activeProjects, filteredTasks, resolvedTaskProjectIds]);
        const resolvedQuickTarget = useMemo(
            () => resolveQuickTargetValue(newTaskProjectId, visibleTasks, resolvedTaskProjectIds),
            [newTaskProjectId, resolvedTaskProjectIds, visibleTasks],
        );

        React.useEffect(() => {
            if (!selectedTaskId || !pendingDeletedTaskIds.has(selectedTaskId)) return;
            setSelectedTaskId(null);
        }, [selectedTaskId, pendingDeletedTaskIds]);

        React.useEffect(() => {
            const subgroupParentsWithoutColor = visibleTasks.filter((task) => {
                const hasChildren = (visibleTaskChildrenMap.get(task.id) || []).length > 0;
                return hasChildren && !normalizePaletteHex(task.subprojectColor);
            });

            if (subgroupParentsWithoutColor.length === 0) return;

            let nextTaskSnapshot = visibleTasks.slice();
            subgroupParentsWithoutColor.forEach((task) => {
                const nextColor = pickDistinctTaskGroupColor(nextTaskSnapshot, activeProjects, { excludeTaskId: task.id });
                nextTaskSnapshot = nextTaskSnapshot.map((entry) => (
                    entry.id === task.id ? { ...entry, subprojectColor: nextColor } : entry
                ));
                state.updateTask(task.id, { subprojectColor: nextColor });
            });
        }, [activeProjects, state.updateTask, visibleTaskChildrenMap, visibleTasks]);

        const focusQuickAdd = () => {
            const quickAddCardNode = quickAddCardRef.current;
            const quickAddInputNode = quickAddInputRef.current;

            if (quickAddCardNode && typeof quickAddCardNode.scrollIntoView === 'function') {
                quickAddCardNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            const applyFocus = () => {
                if (!quickAddInputNode) return;
                quickAddInputNode.focus();
                if (typeof quickAddInputNode.select === 'function') {
                    quickAddInputNode.select();
                }
            };

            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(applyFocus);
                return;
            }

            setTimeout(applyFocus, 0);
        };

        const handleStartQuickAddForProject = (projectId) => {
            setNewTaskProjectId(projectId ? createQuickTargetValue('project', projectId) : '');
            focusQuickAdd();
        };

        const handleStartQuickAddForSubtask = (task) => {
            if (!task?.id) return;
            setNewTaskProjectId(createQuickTargetValue('task', task.id));
            focusQuickAdd();
        };

        const handleQuickDueDateChange = (nextValue) => {
            setQuickDueDate(nextValue || '');
            setShowQuickCalendar(false);
        };

        const markPendingDeletedTasks = (taskIds) => {
            const nextIds = Array.from(new Set((taskIds || []).filter(Boolean)));
            if (nextIds.length === 0) return nextIds;

            setPendingDeletedTaskIds((current) => {
                const next = new Set(current);
                nextIds.forEach((taskId) => next.add(taskId));
                return next;
            });
            setSelectedTaskId((current) => (nextIds.includes(current) ? null : current));
            return nextIds;
        };

        const unmarkPendingDeletedTasks = (taskIds) => {
            const nextIds = Array.from(new Set((taskIds || []).filter(Boolean)));
            if (nextIds.length === 0) return;

            setPendingDeletedTaskIds((current) => {
                const next = new Set(current);
                nextIds.forEach((taskId) => next.delete(taskId));
                return next;
            });
        };

        const markPendingDeletedProjects = (projectIds) => {
            const nextIds = Array.from(new Set((projectIds || []).filter(Boolean)));
            if (nextIds.length === 0) return nextIds;

            setPendingDeletedProjectIds((current) => {
                const next = new Set(current);
                nextIds.forEach((projectId) => next.add(projectId));
                return next;
            });
            return nextIds;
        };

        const unmarkPendingDeletedProjects = (projectIds) => {
            const nextIds = Array.from(new Set((projectIds || []).filter(Boolean)));
            if (nextIds.length === 0) return;

            setPendingDeletedProjectIds((current) => {
                const next = new Set(current);
                nextIds.forEach((projectId) => next.delete(projectId));
                return next;
            });
        };

        const handleDeleteTask = (taskId) => {
            const task = state.tasks.find((entry) => entry.id === taskId);
            if (!task) return;

            const hiddenTaskIds = [taskId].concat(Array.from(collectDescendantIds(state.tasks, taskId)));

            if (!HEYS.Undo?.push) {
                state.deleteTask(taskId);
                return;
            }

            const context = {
                taskId,
                taskTitle: String(task.title || '').trim() || 'Задача',
                hiddenTaskIds: markPendingDeletedTasks(hiddenTaskIds),
            };

            HEYS.Undo.push({
                label: 'Задача «' + context.taskTitle + '» удалена',
                subtitle: 'Можно вернуть одним тапом, пока карточка скрыта.',
                icon: '🗑',
                duration: 4600,
                context,
                onUndo: (undoContext) => {
                    unmarkPendingDeletedTasks(undoContext?.hiddenTaskIds);
                },
                onExpire: () => {
                    try {
                        state.deleteTask(taskId);
                    } finally {
                        unmarkPendingDeletedTasks(hiddenTaskIds);
                    }
                },
            });
        };

        const handleDeleteProject = (projectId) => {
            if (!projectId || projectId === '__none__') return;

            const project = state.projects.find((entry) => entry.id === projectId);
            if (!project) return;

            if (!HEYS.Undo?.push) {
                state.deleteProject(projectId);
                return;
            }

            const context = {
                projectId,
                projectName: String(project.name || '').trim() || 'Проект',
                hiddenProjectIds: markPendingDeletedProjects([projectId]),
            };

            HEYS.Undo.push({
                label: 'Проект «' + context.projectName + '» удалён',
                subtitle: 'Если не отменить, задачи проекта перейдут в «Без проекта».',
                icon: '🗑',
                duration: 4600,
                context,
                onUndo: (undoContext) => {
                    unmarkPendingDeletedProjects(undoContext?.hiddenProjectIds);
                },
                onExpire: () => {
                    try {
                        state.deleteProject(projectId);
                    } finally {
                        unmarkPendingDeletedProjects([projectId]);
                    }
                },
            });
        };

        const openQuickDatePicker = () => {
            if (ReactDOM) {
                setShowQuickCalendar((value) => !value);
                return;
            }
            const inputNode = quickDateInputRef.current;
            if (!inputNode) return;
            if (typeof inputNode.showPicker === 'function') {
                inputNode.showPicker();
                return;
            }
            inputNode.focus();
            inputNode.click();
        };

        const resetQuickAddFields = () => {
            setNewTaskTitle('');
            setQuickDueDate('');
            setQuickMinutes('');
            setShowQuickCalendar(false);
            setShowQuickDurationPicker(false);
        };

        const handleQuickCreateTask = (mode) => {
            const title = String(newTaskTitle || '').trim();
            if (!title) return;
            const status = mode === 'done'
                ? 'done'
                : (mode === 'draft' ? 'todo' : 'in_progress');
            const task = state.addTask(title, {
                projectId: resolvedQuickTarget.projectId,
                parentTaskId: resolvedQuickTarget.parentTaskId,
                priority: selectedPriority,
                status,
                dueDate: quickDueDate || undefined,
                plannedMinutes: quickMinutes ? Number(quickMinutes) : undefined,
            });

            if (mode === 'done' && task?.id) {
                const completionSlot = buildCompletionSlotFromNow(task.plannedMinutes);
                state.addSlot({
                    taskId: task.id,
                    date: completionSlot.date,
                    startTime: completionSlot.startTime,
                    endTime: completionSlot.endTime,
                    title: '',
                    source: 'completion',
                });
            }

            resetQuickAddFields();
        };

        const handleAddTask = () => handleQuickCreateTask('active');
        const handleAddCompletedTask = () => handleQuickCreateTask('done');
        const handleAddDraftTask = () => handleQuickCreateTask('draft');

        const handleAddProject = () => {
            const name = String(newProjectName || '').trim();
            if (!name) return;
            state.addProject(name);
            setNewProjectName('');
        };

        const handleResetFilters = () => {
            setFilterStatus('all');
            setFilterPriority('all');
            setFilterProject('all');
            setFilterDueBucket('all');
        };

        return h('div', { className: 'planning-tasks-screen' },
            h('div', { className: 'planning-tasks-header' },
                h('section', { ref: quickAddCardRef },
                    h(TaskComposerCard, {
                        cardTitle: 'Новая задача',
                        cardHint: 'По умолчанию задача создаётся в работе. Можно сразу отправить её в готово или в драфт.',
                        headerActions: h('button', {
                            type: 'button',
                            className: 'planning-filter-toggle' + (showFilters ? ' active' : '') + (activeFilterCount > 0 ? ' has-active' : ''),
                            'aria-label': activeFilterCount > 0
                                ? ('Фильтры, активно ' + activeFilterCount)
                                : 'Фильтры',
                            'aria-expanded': showFilters ? 'true' : 'false',
                            title: activeFilterCount > 0
                                ? ('Фильтры · активно ' + activeFilterCount)
                                : 'Фильтры',
                            onClick: () => setShowFilters((value) => !value),
                        },
                            h(FilterIcon),
                            activeFilterCount > 0 && h('span', { className: 'planning-filter-toggle__badge' }, String(activeFilterCount)),
                        ),
                        title: newTaskTitle,
                        onTitleChange: setNewTaskTitle,
                        titlePlaceholder: 'Новая задача...',
                        titleInputRef: quickAddInputRef,
                        onTitleKeyDown: (event) => event.key === 'Enter' && handleAddTask(),
                        actionButtons: h('div', { className: 'planning-quick-add__create-actions' },
                            h('button', {
                                type: 'button',
                                className: 'planning-add-btn planning-add-btn--quick planning-add-btn--active-task',
                                title: 'Создать задачу сразу в работе',
                                'aria-label': 'Создать задачу сразу в работе',
                                onClick: handleAddTask,
                            },
                                h('span', { className: 'planning-add-btn__icon', 'aria-hidden': 'true' }, '+'),
                                h('span', { className: 'planning-add-btn__label' }, 'В работу'),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-add-btn planning-add-btn--quick planning-add-btn--icon-only planning-add-btn--done-task',
                                title: 'Добавить уже завершённую задачу и поставить её в календарь текущим временем',
                                'aria-label': 'Добавить уже завершённую задачу',
                                onClick: handleAddCompletedTask,
                            },
                                h('span', { className: 'planning-add-btn__icon', 'aria-hidden': 'true' }, '⚡'),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-add-btn planning-add-btn--quick planning-add-btn--icon-only planning-add-btn--draft-task',
                                title: 'Добавить задачу как драфт — в статусе «Ожидает начала»',
                                'aria-label': 'Добавить задачу как драфт',
                                onClick: handleAddDraftTask,
                            },
                                h('span', { className: 'planning-add-btn__icon', 'aria-hidden': 'true' }, '⏸'),
                            ),
                        ),
                        primaryField: h(PlanningQuickTargetField, {
                            value: newTaskProjectId,
                            onChange: setNewTaskProjectId,
                            projects: activeProjects,
                            tasks: visibleTasks,
                            resolvedTaskProjectIds,
                            tabsSelector: '.tabs',
                        }),
                        priorityValue: selectedPriority,
                        onPriorityChange: setSelectedPriority,
                        dueDate: quickDueDate,
                        onDueDateChange: handleQuickDueDateChange,
                        todayIso,
                        tomorrowIso,
                        dueDateInputRef: quickDateInputRef,
                        dueCalendarButtonRef: quickCalendarButtonRef,
                        onDueCalendarClick: openQuickDatePicker,
                        isDueCalendarOpen: showQuickCalendar,
                        dueAriaLabel: 'Дедлайн новой задачи',
                        durationValue: quickMinutes,
                        onDurationClick: () => setShowQuickDurationPicker(true),
                        durationPlaceholder: 'мин/дн',
                        durationMinimal: true,
                    }),
                    showFilters && h('div', { className: 'planning-filters-panel' },
                        h('div', { className: 'planning-filters-panel__header' },
                            h('span', { className: 'planning-filters-panel__title' }, 'Фильтры'),
                            activeFilterCount > 0 && h('button', {
                                type: 'button',
                                className: 'planning-btn planning-btn--sm',
                                onClick: handleResetFilters,
                            }, 'Сбросить'),
                        ),
                        h('div', { className: 'planning-filters planning-filters--grid' },
                            h('select', {
                                className: 'planning-filter-select',
                                value: filterStatus,
                                onChange: (event) => setFilterStatus(event.target.value),
                            },
                                h('option', { value: 'all' }, 'Все статусы'),
                                Object.keys(STATUS_CONFIG).map((key) => h('option', { key, value: key }, STATUS_CONFIG[key].label)),
                            ),
                            h('select', {
                                className: 'planning-filter-select',
                                value: filterPriority,
                                onChange: (event) => setFilterPriority(event.target.value),
                            },
                                h('option', { value: 'all' }, 'Все приоритеты'),
                                Object.keys(PRIORITY_CONFIG).map((key) => h('option', { key, value: key }, PRIORITY_CONFIG[key].label)),
                            ),
                            h('select', {
                                className: 'planning-filter-select',
                                value: filterProject,
                                onChange: (event) => setFilterProject(event.target.value),
                            },
                                h('option', { value: 'all' }, 'Все проекты'),
                                h('option', { value: '__none__' }, 'Без проекта'),
                                activeProjects.map((project) => h('option', { key: project.id, value: project.id }, project.name)),
                            ),
                            h('select', {
                                className: 'planning-filter-select',
                                value: filterDueBucket,
                                onChange: (event) => setFilterDueBucket(event.target.value),
                            },
                                Object.keys(DUE_BUCKETS).map((key) => h('option', { key, value: key }, DUE_BUCKETS[key])),
                            ),
                        ),
                    ),
                ),
            ),
            h('div', { className: 'planning-tasks-list' },
                activeProjects.map((project) => h(ProjectGroup, {
                    key: project.id,
                    project,
                    projects: activeProjects,
                    tasks: tasksByProject[project.id] || [],
                    taskLookup,
                    isMobile,
                    onUpdateTask: state.updateTask,
                    onDeleteTask: handleDeleteTask,
                    onSelectTask: setSelectedTaskId,
                    onStartQuickAddProject: handleStartQuickAddForProject,
                    onStartQuickAddSubtask: handleStartQuickAddForSubtask,
                    onUpdateProject: state.updateProject,
                    onDeleteProject: handleDeleteProject,
                    onReorderTasks: state.reorderTasks,
                    forceShowCompleted,
                })),
                (tasksByProject.__none__ || []).length > 0 && h(ProjectGroup, {
                    key: '__none__',
                    project: { id: '__none__', name: 'Без проекта', color: '#94a3b8' },
                    projects: activeProjects,
                    tasks: tasksByProject.__none__,
                    taskLookup,
                    isMobile,
                    onUpdateTask: state.updateTask,
                    onDeleteTask: handleDeleteTask,
                    onSelectTask: setSelectedTaskId,
                    onStartQuickAddProject: handleStartQuickAddForProject,
                    onStartQuickAddSubtask: handleStartQuickAddForSubtask,
                    onUpdateProject: state.updateProject,
                    onDeleteProject: handleDeleteProject,
                    onReorderTasks: state.reorderTasks,
                    forceShowCompleted,
                }),
                activeProjects.length === 0 && filteredTasks.length === 0 && h('div', { className: 'planning-empty' }, 'Начни с проекта или добавь первую задачу.'),
            ),
            h('div', { className: 'planning-add-project' },
                h('input', {
                    className: 'planning-quick-input planning-quick-input--sm',
                    placeholder: 'Новый проект...',
                    value: newProjectName,
                    onChange: (event) => setNewProjectName(event.target.value),
                    onKeyDown: (event) => event.key === 'Enter' && handleAddProject(),
                }),
                h('button', { type: 'button', className: 'planning-add-btn planning-add-btn--project', onClick: handleAddProject }, '+ Проект'),
            ),
            (() => {
                const scaleControl = h('div', {
                    className: 'planning-tasks-scale-fab',
                    role: 'group',
                    'aria-label': 'Масштаб интерфейса задач',
                    onDoubleClick: resetTasksUiScale,
                    title: 'Двойной клик — сброс',
                },
                    h('button', {
                        type: 'button',
                        className: 'planning-tasks-scale-fab__btn',
                        onClick: () => adjustTasksUiScale(-TASKS_UI_SCALE_STEP),
                        disabled: tasksUiScale <= TASKS_UI_SCALE_MIN + 1e-6,
                        'aria-label': 'Уменьшить масштаб',
                    }, '−'),
                    h('span', { className: 'planning-tasks-scale-fab__value', 'aria-live': 'polite' }, Math.round(tasksUiScale * 100) + '%'),
                    h('button', {
                        type: 'button',
                        className: 'planning-tasks-scale-fab__btn',
                        onClick: () => adjustTasksUiScale(TASKS_UI_SCALE_STEP),
                        disabled: tasksUiScale >= TASKS_UI_SCALE_MAX - 1e-6,
                        'aria-label': 'Увеличить масштаб',
                    }, '+'),
                );

                return ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body
                    ? ReactDOM.createPortal(scaleControl, document.body)
                    : scaleControl;
            })(),
            selectedTaskId && h(TaskDetailModal, {
                taskId: selectedTaskId,
                state,
                resolvedTaskProjectIds,
                onDeleteTask: handleDeleteTask,
                onClose: () => setSelectedTaskId(null),
            }),
            showQuickDurationPicker && h(DurationPresetModal, {
                title: 'Длительность новой задачи',
                subtitle: 'Выбери пресет — или укажи своё число минут, если задача нестандартная.',
                value: quickMinutes,
                onSelect: (minutes) => setQuickMinutes(minutes ? String(minutes) : ''),
                onClose: () => setShowQuickDurationPicker(false),
            }),
            showQuickCalendar && h(PlanningLoadDatePopover, {
                valueISO: quickDueDate,
                tasks: state.tasks,
                slots: state.slots,
                anchorRef: quickCalendarButtonRef,
                onSelect: handleQuickDueDateChange,
                onClear: () => handleQuickDueDateChange(''),
                onClose: () => setShowQuickCalendar(false),
            }),
        );
    }

    HEYS.PlanningTasks = {
        DurationPresetModal,
        TaskDetailModal,
        TasksScreen,
    };
})();
