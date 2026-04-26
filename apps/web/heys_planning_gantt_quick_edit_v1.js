// heys_planning_gantt_quick_edit_v1.js — bottom-sheet quick-edit for Gantt v2 tasks (Phase 3).
// Mobile-friendly fast path: dates / duration / progress / priority / status / milestone toggle.
// For deeper fields (subtasks, blockedByTaskIds) the sheet exposes "Открыть детали" → TaskDetailModal.
//
// Reuses HEYS.dayBottomSheet.useBottomSheetHandlers for swipe-down dismiss (>100px).
// Hardware back / Esc / backdrop-tap also close the sheet.
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef, useMemo } = React;

    const PRIORITY_OPTIONS = [
        { value: 'p!', label: 'P!' },
        { value: 'p1', label: 'P1' },
        { value: 'p2', label: 'P2' },
        { value: 'p3', label: 'P3' },
    ];

    const STATUS_OPTIONS = [
        { value: 'todo', label: 'Ожидает' },
        { value: 'in_progress', label: 'В работе' },
        { value: 'done', label: 'Готово' },
    ];

    const DELETE_RESET_MS = 4000;

    // Fallback hook used only if HEYS.dayBottomSheet failed to load — keeps hook order stable.
    function stubBottomSheetHandlers() {
        const ref = React.useRef(null);
        return {
            bottomSheetRef: ref,
            handleSheetTouchStart: () => {},
            handleSheetTouchMove: () => {},
            handleSheetTouchEnd: () => {},
        };
    }

    function clampProgress(value) {
        const n = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        return Number.isFinite(n) ? n : 0;
    }

    function GanttQuickEditSheet(props) {
        const {
            task,
            projects,
            onUpdate,        // (taskId, patch) => void
            onDelete,        // (taskId) => void
            onOpenDetails,   // (taskId) => void
            onClose,         // () => void
        } = props || {};

        if (!task) return null;

        // ── Local form state ─────────────────────────────────────────────
        const [startDate, setStartDate] = useState(task.startDate || '');
        const [dueDate, setDueDate] = useState(task.dueDate || '');
        const [plannedMinutes, setPlannedMinutes] = useState(
            Number(task.plannedMinutes) > 0 ? String(task.plannedMinutes) : ''
        );
        const [progress, setProgress] = useState(typeof task.progress === 'number' ? clampProgress(task.progress) : 0);
        const [priority, setPriority] = useState(task.priority || 'p2');
        const [status, setStatus] = useState(task.status || 'in_progress');
        const [isMilestone, setIsMilestone] = useState(task.isMilestone === true);
        const [deleteArmed, setDeleteArmed] = useState(false);
        const deleteResetRef = useRef(0);

        // ── Bottom-sheet swipe-down handlers ────────────────────────────
        // useBottomSheetHandlers is a plain hook (uses useRef internally). Called unconditionally
        // to keep hook order stable; HEYS.dayBottomSheet is guaranteed available via boot-day bundle.
        const sheetHaptic = useCallback((kind) => {
            try { navigator.vibrate?.(kind === 'light' ? 8 : 16); } catch (_e) { /* noop */ }
        }, []);
        const useBSHandlers = (HEYS.dayBottomSheet && HEYS.dayBottomSheet.useBottomSheetHandlers) || stubBottomSheetHandlers;
        const { bottomSheetRef, handleSheetTouchStart, handleSheetTouchMove, handleSheetTouchEnd } =
            useBSHandlers({ React, haptic: sheetHaptic });

        // ── Hardware back (Android) + Esc dismiss ───────────────────────
        useEffect(() => {
            const url = window.location.href;
            try { window.history.pushState({ ganttQuickEdit: true }, '', url); } catch (_e) { /* noop */ }
            const onPop = () => onClose && onClose();
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Esc') {
                    e.preventDefault();
                    onClose && onClose();
                }
            };
            window.addEventListener('popstate', onPop);
            window.addEventListener('keydown', onKey);
            return () => {
                window.removeEventListener('popstate', onPop);
                window.removeEventListener('keydown', onKey);
                // If we still own the pushed history entry (closed via UI, not back-button),
                // pop it now so URL state stays consistent.
                try {
                    if (window.history.state && window.history.state.ganttQuickEdit) {
                        window.history.back();
                    }
                } catch (_e) { /* noop */ }
            };
        }, [onClose]);

        // ── Delete two-stage reset timer ────────────────────────────────
        useEffect(() => () => {
            if (deleteResetRef.current) {
                window.clearTimeout(deleteResetRef.current);
                deleteResetRef.current = 0;
            }
        }, []);

        // ── Auto-cascade: status='done' → progress=100 ──────────────────
        useEffect(() => {
            if (status === 'done' && progress < 100) setProgress(100);
        }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

        // ── Save handler ─────────────────────────────────────────────────
        const handleSave = useCallback(() => {
            const patch = {};
            // Only include changed fields to avoid unnecessary writes.
            if ((task.startDate || '') !== startDate) patch.startDate = startDate || undefined;
            if ((task.dueDate || '') !== dueDate) patch.dueDate = dueDate || undefined;
            const nextPlanned = plannedMinutes ? Number(plannedMinutes) : null;
            if ((Number(task.plannedMinutes) || null) !== nextPlanned) {
                patch.plannedMinutes = nextPlanned > 0 ? nextPlanned : undefined;
            }
            const nextProgress = clampProgress(progress);
            if ((typeof task.progress === 'number' ? task.progress : 0) !== nextProgress) {
                patch.progress = nextProgress;
            }
            if ((task.priority || 'p2') !== priority) patch.priority = priority;
            if ((task.status || 'in_progress') !== status) patch.status = status;
            if ((task.isMilestone === true) !== isMilestone) patch.isMilestone = isMilestone;

            if (Object.keys(patch).length > 0 && typeof onUpdate === 'function') {
                onUpdate(task.id, patch);
            }
            onClose && onClose();
        }, [task, startDate, dueDate, plannedMinutes, progress, priority, status, isMilestone, onUpdate, onClose]);

        // ── Delete (two-stage) ──────────────────────────────────────────
        const handleDeleteClick = useCallback(() => {
            if (!deleteArmed) {
                setDeleteArmed(true);
                if (deleteResetRef.current) window.clearTimeout(deleteResetRef.current);
                deleteResetRef.current = window.setTimeout(() => {
                    setDeleteArmed(false);
                    deleteResetRef.current = 0;
                }, DELETE_RESET_MS);
                try { navigator.vibrate?.(20); } catch (_e) { /* noop */ }
                return;
            }
            // Confirmed
            if (typeof onDelete === 'function') onDelete(task.id);
            onClose && onClose();
        }, [deleteArmed, onDelete, onClose, task.id]);

        const handleBackdropClick = useCallback(() => onClose && onClose(), [onClose]);
        const handleSheetClick = useCallback((e) => e.stopPropagation(), []);

        const handleOpenDetails = useCallback(() => {
            if (typeof onOpenDetails === 'function') onOpenDetails(task.id);
            onClose && onClose();
        }, [onOpenDetails, onClose, task.id]);

        // ── Render ───────────────────────────────────────────────────────
        const project = (Array.isArray(projects) ? projects : []).find((p) => p && p.id === task.projectId);
        const projectColor = (project && project.color) || '#64748b';
        const projectName = project ? project.name : 'Без проекта';

        return h('div', {
            className: 'gantt-quick-edit-backdrop',
            onClick: handleBackdropClick,
        },
            h('div', {
                className: 'gantt-quick-edit-sheet',
                ref: bottomSheetRef,
                onClick: handleSheetClick,
                onTouchStart: handleSheetTouchStart,
                onTouchMove: handleSheetTouchMove,
                onTouchEnd: () => handleSheetTouchEnd(onClose),
            },
                h('div', { className: 'gantt-quick-edit-handle', onTouchStart: handleSheetTouchStart, onTouchMove: handleSheetTouchMove, onTouchEnd: () => handleSheetTouchEnd(onClose) }),
                h('div', { className: 'gantt-quick-edit-header' },
                    h('span', { className: 'gantt-quick-edit-project-chip', style: { background: projectColor }, title: projectName }),
                    h('div', { className: 'gantt-quick-edit-title' }, task.title || 'Без названия'),
                ),
                renderDateRow({ isMilestone, startDate, setStartDate, dueDate, setDueDate }),
                renderPlannedMinutesRow({ plannedMinutes, setPlannedMinutes, isMilestone }),
                renderProgressRow({ progress, setProgress, isMilestone, status }),
                renderSegmented({
                    label: 'Приоритет',
                    options: PRIORITY_OPTIONS,
                    value: priority,
                    onChange: setPriority,
                    extraClass: 'gantt-quick-edit-priority',
                }),
                renderSegmented({
                    label: 'Статус',
                    options: STATUS_OPTIONS,
                    value: status,
                    onChange: setStatus,
                    extraClass: 'gantt-quick-edit-status',
                }),
                renderMilestoneToggle({ isMilestone, setIsMilestone }),
                onOpenDetails && h('button', {
                    type: 'button',
                    className: 'gantt-quick-edit-details-btn',
                    onClick: handleOpenDetails,
                }, 'Открыть детали…'),
                h('div', { className: 'gantt-quick-edit-actions' },
                    h('button', {
                        type: 'button',
                        className: 'gantt-quick-edit-btn gantt-quick-edit-btn--danger' + (deleteArmed ? ' is-armed' : ''),
                        onClick: handleDeleteClick,
                    }, deleteArmed ? 'Удалить точно?' : 'Удалить'),
                    h('div', { className: 'gantt-quick-edit-actions__primary' },
                        h('button', {
                            type: 'button',
                            className: 'gantt-quick-edit-btn gantt-quick-edit-btn--ghost',
                            onClick: onClose,
                        }, 'Отмена'),
                        h('button', {
                            type: 'button',
                            className: 'gantt-quick-edit-btn gantt-quick-edit-btn--primary',
                            onClick: handleSave,
                        }, 'Сохранить'),
                    ),
                ),
            ),
        );
    }

    function renderDateRow({ isMilestone, startDate, setStartDate, dueDate, setDueDate }) {
        return h('div', { className: 'gantt-quick-edit-row gantt-quick-edit-row--dates' },
            !isMilestone && h('label', { className: 'gantt-quick-edit-field' },
                h('span', { className: 'gantt-quick-edit-field__label' }, 'Начало'),
                h('input', {
                    type: 'date',
                    className: 'gantt-quick-edit-input',
                    value: startDate || '',
                    onChange: (e) => setStartDate(e.target.value),
                }),
            ),
            h('label', { className: 'gantt-quick-edit-field' },
                h('span', { className: 'gantt-quick-edit-field__label' }, isMilestone ? 'Дата' : 'Срок'),
                h('input', {
                    type: 'date',
                    className: 'gantt-quick-edit-input',
                    value: dueDate || '',
                    onChange: (e) => setDueDate(e.target.value),
                }),
            ),
        );
    }

    function renderPlannedMinutesRow({ plannedMinutes, setPlannedMinutes, isMilestone }) {
        if (isMilestone) return null;
        return h('label', { className: 'gantt-quick-edit-row gantt-quick-edit-field' },
            h('span', { className: 'gantt-quick-edit-field__label' }, 'Длительность (мин)'),
            h('input', {
                type: 'number',
                className: 'gantt-quick-edit-input',
                value: plannedMinutes,
                step: 15,
                min: 0,
                inputMode: 'numeric',
                onChange: (e) => setPlannedMinutes(e.target.value),
            }),
        );
    }

    function renderProgressRow({ progress, setProgress, isMilestone, status }) {
        if (isMilestone) return null;
        const value = clampProgress(progress);
        return h('div', { className: 'gantt-quick-edit-row gantt-quick-edit-progress-row' },
            h('div', { className: 'gantt-quick-edit-progress-row__head' },
                h('span', { className: 'gantt-quick-edit-field__label' }, 'Прогресс'),
                h('span', { className: 'gantt-quick-edit-progress-value' }, value + '%'),
            ),
            h('input', {
                type: 'range',
                className: 'gantt-quick-edit-progress-slider',
                min: 0,
                max: 100,
                step: 5,
                value,
                onChange: (e) => setProgress(clampProgress(e.target.value)),
                disabled: status === 'cancelled',
            }),
        );
    }

    function renderSegmented({ label, options, value, onChange, extraClass }) {
        return h('div', { className: 'gantt-quick-edit-row gantt-quick-edit-segmented-row ' + (extraClass || '') },
            h('span', { className: 'gantt-quick-edit-field__label' }, label),
            h('div', { className: 'gantt-quick-edit-segmented' },
                options.map((opt) => h('button', {
                    key: opt.value,
                    type: 'button',
                    className: 'gantt-quick-edit-seg-btn' + (value === opt.value ? ' is-active' : ''),
                    onClick: () => onChange(opt.value),
                }, opt.label)),
            ),
        );
    }

    function renderMilestoneToggle({ isMilestone, setIsMilestone }) {
        return h('label', { className: 'gantt-quick-edit-row gantt-quick-edit-toggle-row' },
            h('span', { className: 'gantt-quick-edit-field__label' }, 'Milestone (точка без длительности)'),
            h('input', {
                type: 'checkbox',
                className: 'gantt-quick-edit-toggle',
                checked: isMilestone,
                onChange: (e) => setIsMilestone(!!e.target.checked),
            }),
        );
    }

    HEYS.PlanningGanttQuickEdit = { GanttQuickEditSheet };
})();
