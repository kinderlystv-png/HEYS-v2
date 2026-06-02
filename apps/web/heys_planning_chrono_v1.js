// heys_planning_chrono_v1.js — Хронометраж: облако кружков-дел в разделе Задачи
(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const Planning = HEYS.Planning || {};
    if (!React || !Planning.Constants || !Planning.Store || !Planning.Utils) return;

    const h = React.createElement;
    const { useState, useMemo, useEffect, useRef, useCallback } = React;
    const Store = Planning.Store;
    const Utils = Planning.Utils;

    // === Константы ===

    const CHRONO_PRESETS = [
        { label: '15м', minutes: 15 },
        { label: '30м', minutes: 30 },
        { label: '1ч', minutes: 60 },
        { label: '2ч', minutes: 120 },
        { label: '3ч', minutes: 180 },
        { label: '5ч', minutes: 300 },
    ];

    const r_min = 28;
    const r_max = 80;

    const CHRONO_EMOJI_PALETTE = [
        '👶', '🎨', '💻', '📱', '🏃', '📚', '🧹', '😴',
        '🍳', '🚗', '🛒', '💤', '🎵', '🎮', '🍷', '🧘',
        '☕', '🎯', '💊', '🚿', '💼', '📞', '✈️', '🎬',
        '🍕', '🌱', '📝', '🐶', '🎓', '🧠', '❤️', '⏱️',
    ];

    const DEFAULT_ACTIVITIES = [
        { name: 'Поиграл с ребёнком', emoji: '👶' },
        { name: 'Работа на студии', emoji: '🎨' },
        { name: 'Залип в телефоне', emoji: '📱' },
        { name: 'Программирование', emoji: '💻' },
        { name: 'Спорт', emoji: '🏃' },
        { name: 'Чтение', emoji: '📚' },
        { name: 'Домашние дела', emoji: '🧹' },
        { name: 'Отдых', emoji: '😴' },
    ];

    const TOAST_TIMEOUT_MS = 5000;

    // === Чистые функции ===

    function radiusForMinutes(minutes, maxMin) {
        const m = Math.max(0, Number(minutes) || 0);
        const M = Math.max(0, Number(maxMin) || 0);
        if (M <= 0) return r_min;
        const t = Math.min(1, m / M);
        return r_min + (r_max - r_min) * Math.sqrt(t);
    }

    function colorForActivity(hue, minutes, maxMin) {
        const m = Math.max(0, Number(minutes) || 0);
        const M = Math.max(0, Number(maxMin) || 0);
        const t = M > 0 ? Math.min(1, m / M) : 0;
        // Спокойная палитра: насыщенность держим низко (24%..38%) — никаких
        // «фуксий» даже на горячих hue вроде 300°. Основная дельта — в lightness
        // (88%..58%), это и есть «яркость растёт со временем». Цвет остаётся
        // пыльным/dusty, ближе к акварели, а кружки с большим временем —
        // плотнее и темнее тонально.
        const saturation = 24 + 14 * t;   // 24%..38%
        const lightness = 88 - 30 * t;    // 88%..58%
        const safeHue = ((Number(hue) || 0) % 360 + 360) % 360;
        return `hsl(${Math.round(safeHue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
    }

    function formatMinutes(totalMinutes) {
        const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
        if (m === 0) return '0м';
        const h = Math.floor(m / 60);
        const rest = m % 60;
        if (h === 0) return `${rest}м`;
        if (rest === 0) return `${h}ч`;
        return `${h}ч ${rest}м`;
    }

    function getTimerElapsedMs(timer, nowMs) {
        if (!timer) return 0;
        const start = Number(timer.startMs) || 0;
        if (start <= 0) return 0;
        const now = Number(nowMs) || Date.now();
        const endPoint = timer.pausedAt ? Number(timer.pausedAt) || now : now;
        const paused = Math.max(0, Number(timer.accumulatedPausedMs) || 0);
        return Math.max(0, endPoint - start - paused);
    }

    function getTimerRemainingMs(timer, nowMs) {
        if (!timer) return 0;
        const plannedMs = Math.max(0, Number(timer.plannedMinutes) || 0) * 60 * 1000;
        return Math.max(0, plannedMs - getTimerElapsedMs(timer, nowMs));
    }

    function getTaskLabel(task, projects) {
        if (!task) return '';
        const project = Array.isArray(projects)
            ? projects.find((p) => p && p.id === task.projectId)
            : null;
        return project ? `${project.name} · ${task.title}` : String(task.title || '');
    }

    function buildChronoPlanFacts(activities, tasks, minutesByActivity) {
        const out = [];
        const taskById = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [task.id, task]));
        (Array.isArray(activities) ? activities : []).forEach((activity) => {
            if (!activity || activity.archived) return;
            const actual = Math.round(Number(minutesByActivity && minutesByActivity[activity.id]) || 0);
            let planned = 0;
            let label = '';
            if (activity.taskId && taskById.has(activity.taskId)) {
                const task = taskById.get(activity.taskId);
                planned = Number(task.plannedMinutes) > 0 ? Math.round(Number(task.plannedMinutes)) : 0;
                label = task.title || activity.name;
            } else if (activity.projectId) {
                const projectTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => task && task.projectId === activity.projectId);
                planned = projectTasks.reduce((sum, task) => sum + (Number(task.plannedMinutes) || 0), 0);
                label = activity.name;
            }
            if (planned <= 0 && actual <= 0) return;
            if (!activity.taskId && !activity.projectId) return;
            out.push({
                activityId: activity.id,
                taskId: activity.taskId,
                projectId: activity.projectId,
                name: activity.name,
                emoji: activity.emoji,
                label,
                planned: Math.round(planned),
                actual,
                delta: actual - Math.round(planned),
                ratio: planned > 0 ? actual / planned : null,
            });
        });
        return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }

    function buildChronoWeekInsights(activities, minutesByActivity, totalMinutes, scope) {
        const active = (Array.isArray(activities) ? activities : [])
            .filter((a) => a && !a.archived)
            .map((a) => ({ activity: a, minutes: Math.round(Number(minutesByActivity && minutesByActivity[a.id]) || 0) }))
            .filter((item) => item.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);
        const insights = [];
        const total = Math.round(Number(totalMinutes) || 0);

        if (active.length > 0) {
            const top = active[0];
            insights.push({
                kind: 'top',
                title: 'Топ',
                value: `${top.activity.emoji || ''} ${top.activity.name}`,
                detail: `${formatMinutes(top.minutes)} · ${total > 0 ? Math.round((top.minutes / total) * 100) : 0}%`,
            });
        }

        const overBudget = active.find(({ activity, minutes }) => {
            const goal = getActivityGoalForScope(activity, scope);
            return goal && goal.kind === 'budget' && minutes > goal.minutes;
        });
        if (overBudget) {
            const goal = getActivityGoalForScope(overBudget.activity, scope);
            insights.push({
                kind: 'over',
                title: 'Лимит',
                value: overBudget.activity.name,
                detail: `+${formatMinutes(overBudget.minutes - goal.minutes)} сверх`,
            });
        }

        const underTarget = (Array.isArray(activities) ? activities : [])
            .filter((a) => a && !a.archived)
            .map((activity) => {
                const goal = getActivityGoalForScope(activity, scope);
                const minutes = Math.round(Number(minutesByActivity && minutesByActivity[activity.id]) || 0);
                return { activity, goal, minutes };
            })
            .filter(({ goal, minutes }) => goal && goal.kind === 'target' && minutes < goal.minutes)
            .sort((a, b) => (b.goal.minutes - b.minutes) - (a.goal.minutes - a.minutes))[0];
        if (underTarget) {
            insights.push({
                kind: 'under',
                title: 'Недобор',
                value: underTarget.activity.name,
                detail: `ещё ${formatMinutes(underTarget.goal.minutes - underTarget.minutes)}`,
            });
        }

        if (total > 0) {
            insights.push({
                kind: 'total',
                title: 'Всего',
                value: formatMinutes(total),
                detail: `${active.length} активн. дел`,
            });
        }
        return insights.slice(0, 4);
    }

    // У каждого занятия для каждого периода (день/неделя) может быть либо
    // цель (расти к), либо лимит (не превышать) — mutually exclusive внутри
    // периода (store следит). Возвращает {kind: 'target'|'budget', minutes}
    // для текущего охвата, либо null если ни того ни другого нет.
    function getActivityGoalForScope(activity, scope) {
        if (!activity) return null;
        if (scope === 'week') {
            const t = Number(activity.targetMinutesPerWeek) || 0;
            if (t > 0) return { kind: 'target', minutes: Math.round(t) };
            const b = Number(activity.budgetMinutesPerWeek) || 0;
            if (b > 0) return { kind: 'budget', minutes: Math.round(b) };
            return null;
        }
        const t = Number(activity.targetMinutesPerDay) || 0;
        if (t > 0) return { kind: 'target', minutes: Math.round(t) };
        const b = Number(activity.budgetMinutesPerDay) || 0;
        if (b > 0) return { kind: 'budget', minutes: Math.round(b) };
        return null;
    }

    // Для бабла: возвращает прогресс 0..1 + kind для раскраски кольца.
    // - target: progress линейный 0..1, превышение clamped на 1.
    // - budget: progress тоже 0..1 для размера сектора, но при minutes > limit
    //   возвращаем флаг over=true чтобы UI красил полное красное кольцо.
    function getProgress(activity, minutes, scope) {
        const goal = getActivityGoalForScope(activity, scope);
        if (!goal || goal.minutes <= 0) return null;
        const m = Number(minutes) || 0;
        const raw = m / goal.minutes;
        return {
            kind: goal.kind,
            value: Math.max(0, Math.min(1, raw)),
            raw,
            over: goal.kind === 'budget' && raw > 1,
        };
    }

    // Цвет кольца на бабле, в зависимости от kind и прогресса.
    function ringColorForProgress(progress, activityHue) {
        if (!progress) return 'transparent';
        const safeHue = ((Number(activityHue) || 0) % 360 + 360) % 360;
        if (progress.kind === 'target') {
            // Насыщенная версия hue активности.
            return `hsl(${Math.round(safeHue)}, 50%, 50%)`;
        }
        // Бюджет: зелёный <0.75, оранжевый 0.75..1, красный >1.
        const r = progress.raw;
        if (r <= 0.75) return 'hsl(142, 60%, 45%)';
        if (r <= 1)    return 'hsl(28, 85%, 52%)';
        return 'hsl(0, 80%, 52%)';
    }

    // Legacy/совместимость: возвращает «преимущественную» цель для отображения.
    // ActivityPicker уже читает поля напрямую (день+неделя обе показываются),
    // но эта функция остаётся для тестов и потенциальных интеграций.
    function getActivityTarget(activity) {
        const week = Number(activity && activity.targetMinutesPerWeek) || 0;
        if (week > 0) return { minutes: Math.round(week), period: 'week' };
        const day = Number(activity && activity.targetMinutesPerDay) || 0;
        if (day > 0) return { minutes: Math.round(day), period: 'day' };
        return null;
    }

    // [{date, minutes}] для конкретной активности за окно [startDate, endDate]
    // включительно. Тянет из entries + snapshots. Пропусков нет — дни без
    // записей отдаются с minutes: 0, чтобы heatmap получал плотную сетку.
    function buildDailySeries(entries, snapshots, activityId, startDate, endDate) {
        if (!activityId || !startDate || !endDate) return [];
        const totals = new Map();
        (Array.isArray(entries) ? entries : []).forEach((e) => {
            if (!e || e.activityId !== activityId) return;
            if (!e.date || e.date < startDate || e.date > endDate) return;
            totals.set(e.date, (totals.get(e.date) || 0) + (Number(e.minutes) || 0));
        });
        (Array.isArray(snapshots) ? snapshots : []).forEach((s) => {
            if (!s || s.activityId !== activityId) return;
            if (!s.date || s.date < startDate || s.date > endDate) return;
            totals.set(s.date, (totals.get(s.date) || 0) + (Number(s.totalMinutes) || 0));
        });
        const series = [];
        let cur = startDate;
        const safety = 4000; // защита от бесконечного цикла
        let i = 0;
        while (cur <= endDate && i < safety) {
            series.push({ date: cur, minutes: totals.get(cur) || 0 });
            cur = Utils.addDays(cur, 1);
            i += 1;
        }
        return series;
    }

    // Для stacked-bar в режиме «неделя»: { [date]: { [activityId]: minutes, __total: N } }
    function buildWeekBreakdown(entries, snapshots, weekDates) {
        const out = {};
        const dateSet = new Set(Array.isArray(weekDates) ? weekDates : []);
        weekDates.forEach((d) => { out[d] = { __total: 0 }; });
        (Array.isArray(entries) ? entries : []).forEach((e) => {
            if (!e || !dateSet.has(e.date)) return;
            const m = Number(e.minutes) || 0;
            if (m <= 0) return;
            out[e.date][e.activityId] = (out[e.date][e.activityId] || 0) + m;
            out[e.date].__total += m;
        });
        (Array.isArray(snapshots) ? snapshots : []).forEach((s) => {
            if (!s || !dateSet.has(s.date)) return;
            const m = Number(s.totalMinutes) || 0;
            if (m <= 0) return;
            out[s.date][s.activityId] = (out[s.date][s.activityId] || 0) + m;
            out[s.date].__total += m;
        });
        return out;
    }

    function formatEntryTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const today = new Date();
        const sameDay = d.getFullYear() === today.getFullYear()
            && d.getMonth() === today.getMonth()
            && d.getDate() === today.getDate();
        const pad = (n) => String(n).padStart(2, '0');
        const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (sameDay) return `сегодня ${time}`;
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`;
    }

    // === Сидинг ===

    const SEED_FLAG_KEY = 'heys_planning_chrono_seeded';

    function readSeedFlag() {
        const U = HEYS.utils;
        try {
            return U && typeof U.lsGet === 'function' ? !!U.lsGet(SEED_FLAG_KEY, false) : false;
        } catch (_) { return false; }
    }

    function writeSeedFlag() {
        const U = HEYS.utils;
        try {
            if (U && typeof U.lsSet === 'function') U.lsSet(SEED_FLAG_KEY, true);
        } catch (_) { /* noop */ }
    }

    function seedDefaultChronoOnce() {
        if (readSeedFlag()) return false;
        const existing = Store.getChronoActivities ? Store.getChronoActivities() : [];
        if (existing.length > 0) { writeSeedFlag(); return false; }
        if (typeof Store.addChronoActivity !== 'function') return false;
        DEFAULT_ACTIVITIES.forEach((preset) => {
            Store.addChronoActivity({ name: preset.name, emoji: preset.emoji });
        });
        writeSeedFlag();
        return true;
    }

    // === Дата-навигация ===

    function shiftDateStr(dateStrValue, deltaDays) {
        return Utils.addDays(dateStrValue, deltaDays);
    }

    function formatDateLabel(dateStrValue) {
        const parts = String(dateStrValue || '').split('-');
        if (parts.length !== 3) return dateStrValue || '';
        return `${parts[2]}.${parts[1]}`;
    }

    function formatWeekLabel(activeDate) {
        const week = Utils.getWeekDays(activeDate);
        if (!week.length) return '';
        return `${formatDateLabel(week[0])} – ${formatDateLabel(week[6])}`;
    }

    // === Toast (undo) ===

    function ChronoUndoToast({ toast, onUndo, onDismiss }) {
        useEffect(() => {
            if (!toast) return undefined;
            const timer = setTimeout(onDismiss, TOAST_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }, [toast, onDismiss]);

        if (!toast) return null;

        return h('div', { className: 'chrono-undo-toast', role: 'status' },
            h('span', { className: 'chrono-undo-toast__text' },
                toast.adjusted
                    ? `Изменено ${toast.minutes > 0 ? '+' : '-'}${formatMinutes(Math.abs(toast.minutes))}`
                    : `Добавлено ${formatMinutes(toast.minutes)}`),
            h('button', {
                type: 'button',
                className: 'chrono-undo-toast__action',
                onClick: onUndo,
            }, 'Отменить'),
            h('button', {
                type: 'button',
                className: 'chrono-undo-toast__close',
                onClick: onDismiss,
                'aria-label': 'Закрыть',
            }, '×'),
        );
    }

    // === Emoji palette ===

    function EmojiPalette({ selected, onSelect }) {
        return h('div', { className: 'chrono-emoji-palette' },
            CHRONO_EMOJI_PALETTE.map((emoji) => h('button', {
                key: emoji,
                type: 'button',
                className: 'chrono-emoji-palette__item' + (selected === emoji ? ' active' : ''),
                onClick: () => onSelect(emoji),
                'aria-label': emoji,
            }, emoji)),
        );
    }

    // === Activity picker (создать / переименовать / удалить) ===

    function ActivityRow({ activity, onRename, onArchive, onRestore, onDelete }) {
        const existingTarget = getActivityTarget(activity);
        const [editing, setEditing] = useState(false);
        const [name, setName] = useState(activity.name || '');
        const [emoji, setEmoji] = useState(activity.emoji || '');
        const [target, setTarget] = useState(existingTarget ? String(existingTarget.minutes) : '');
        const [targetPeriod, setTargetPeriod] = useState(existingTarget ? existingTarget.period : 'day');
        const [emojiOpen, setEmojiOpen] = useState(false);

        useEffect(() => {
            const t = getActivityTarget(activity);
            setName(activity.name || '');
            setEmoji(activity.emoji || '');
            setTarget(t ? String(t.minutes) : '');
            setTargetPeriod(t ? t.period : 'day');
        }, [activity.id, activity.name, activity.emoji, activity.targetMinutesPerDay, activity.targetMinutesPerWeek]);

        function save() {
            const trimmed = String(name || '').trim();
            if (!trimmed) return;
            const targetNum = Number(target);
            const patch = { name: trimmed, emoji };
            if (targetPeriod === 'week') {
                patch.targetMinutesPerWeek = targetNum > 0 ? targetNum : null;
            } else {
                patch.targetMinutesPerDay = targetNum > 0 ? targetNum : null;
            }
            onRename(activity.id, patch);
            setEditing(false);
            setEmojiOpen(false);
        }

        function cancel() {
            const t = getActivityTarget(activity);
            setName(activity.name || '');
            setEmoji(activity.emoji || '');
            setTarget(t ? String(t.minutes) : '');
            setTargetPeriod(t ? t.period : 'day');
            setEditing(false);
            setEmojiOpen(false);
        }

        if (!editing) {
            return h('div', { className: 'chrono-picker__row' + (activity.archived ? ' is-archived' : '') },
                h('span', { className: 'chrono-picker__emoji', 'aria-hidden': 'true' }, activity.emoji || '·'),
                h('div', { className: 'chrono-picker__name-block' },
                    h('span', { className: 'chrono-picker__name' }, activity.name),
                    (function renderGoalLine() {
                        const parts = [];
                        if (activity.archived) parts.push('архив');
                        if (activity.targetMinutesPerDay > 0) parts.push(`цель ${formatMinutes(activity.targetMinutesPerDay)}/день`);
                        if (activity.budgetMinutesPerDay > 0) parts.push(`лимит ${formatMinutes(activity.budgetMinutesPerDay)}/день`);
                        if (activity.targetMinutesPerWeek > 0) parts.push(`цель ${formatMinutes(activity.targetMinutesPerWeek)}/нед`);
                        if (activity.budgetMinutesPerWeek > 0) parts.push(`лимит ${formatMinutes(activity.budgetMinutesPerWeek)}/нед`);
                        if (activity.taskId) parts.push('связана с задачей');
                        if (activity.projectId && !activity.taskId) parts.push('связана с проектом');
                        if (!parts.length) return null;
                        return h('span', { className: 'chrono-picker__target' }, parts.join(' · '));
                    })(),
                ),
                h('div', { className: 'chrono-picker__row-actions' },
                    activity.archived && h('button', {
                        type: 'button',
                        className: 'chrono-picker__icon-btn',
                        onClick: () => onRestore(activity.id),
                        'aria-label': 'Вернуть из архива',
                        title: 'Вернуть из архива',
                    }, '↩'),
                    !activity.archived && h('button', {
                        type: 'button',
                        className: 'chrono-picker__icon-btn',
                        onClick: () => onArchive(activity.id),
                        'aria-label': 'Скрыть в архив',
                        title: 'Скрыть в архив',
                    }, '↓'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-picker__icon-btn',
                        onClick: () => setEditing(true),
                        'aria-label': 'Переименовать',
                    }, '✎'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-picker__icon-btn chrono-picker__icon-btn--danger',
                        onClick: () => onDelete(activity),
                        'aria-label': 'Удалить',
                    }, '🗑'),
                ),
            );
        }

        return h('div', { className: 'chrono-picker__row chrono-picker__row--editing' },
            h('div', { className: 'chrono-picker__edit-line' },
                h('button', {
                    type: 'button',
                    className: 'chrono-picker__emoji chrono-picker__emoji--btn',
                    onClick: () => setEmojiOpen((open) => !open),
                    'aria-label': 'Сменить эмодзи',
                }, emoji || '·'),
                h('input', {
                    className: 'chrono-picker__input',
                    type: 'text',
                    value: name,
                    autoFocus: true,
                    onChange: (e) => setName(e.target.value),
                    onKeyDown: (e) => {
                        if (e.key === 'Enter') save();
                        if (e.key === 'Escape') cancel();
                    },
                }),
                h('div', { className: 'chrono-picker__row-actions' },
                    h('button', {
                        type: 'button',
                        className: 'chrono-picker__icon-btn',
                        onClick: save,
                        'aria-label': 'Сохранить',
                    }, '✓'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-picker__icon-btn',
                        onClick: cancel,
                        'aria-label': 'Отмена',
                    }, '×'),
                ),
            ),
            h('div', { className: 'chrono-picker__target-row' },
                h('label', { className: 'chrono-picker__target-label' }, 'Цель (мин), опц.:'),
                h('div', { className: 'chrono-picker__target-period-toggle' },
                    h('button', {
                        type: 'button',
                        className: 'chrono-picker__target-period-btn' + (targetPeriod === 'day' ? ' active' : ''),
                        onClick: () => setTargetPeriod('day'),
                    }, '/день'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-picker__target-period-btn' + (targetPeriod === 'week' ? ' active' : ''),
                        onClick: () => setTargetPeriod('week'),
                    }, '/нед'),
                ),
                h('input', {
                    className: 'chrono-picker__input chrono-picker__target-input',
                    type: 'number',
                    min: 0,
                    step: 5,
                    inputMode: 'numeric',
                    placeholder: '—',
                    value: target,
                    onChange: (e) => setTarget(e.target.value),
                    onKeyDown: (e) => {
                        if (e.key === 'Enter') save();
                        if (e.key === 'Escape') cancel();
                    },
                }),
            ),
            emojiOpen && h(EmojiPalette, {
                selected: emoji,
                onSelect: (next) => { setEmoji(next); setEmojiOpen(false); },
            }),
        );
    }

    function CreateActivityBlock({ query, onCreate }) {
        const [emoji, setEmoji] = useState(CHRONO_EMOJI_PALETTE[0]);
        const trimmed = String(query || '').trim();

        useEffect(() => { setEmoji(CHRONO_EMOJI_PALETTE[0]); }, [trimmed.length === 0]);

        if (!trimmed) return null;

        return h('div', { className: 'chrono-picker__create' },
            h('div', { className: 'chrono-picker__create-row' },
                h('span', { className: 'chrono-picker__create-preview' },
                    h('span', { className: 'chrono-picker__emoji' }, emoji),
                    h('span', { className: 'chrono-picker__name' }, trimmed),
                ),
                h('button', {
                    type: 'button',
                    className: 'chrono-picker__create-btn',
                    onClick: () => onCreate({ name: trimmed, emoji }),
                }, 'Создать'),
            ),
            h(EmojiPalette, { selected: emoji, onSelect: setEmoji }),
        );
    }

    function ActivityPicker({ activities, onCreate, onRename, onArchive, onRestore, onRequestDelete, onClose }) {
        const [query, setQuery] = useState('');
        const [showArchived, setShowArchived] = useState(false);
        const inputRef = useRef(null);
        const overlayRef = useRef(null);

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-picker', () => onClose());
        }, [onClose]);

        useEffect(() => {
            if (inputRef.current) inputRef.current.focus();
            function onKey(e) {
                if (e.key === 'Escape') onClose();
            }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        const trimmed = query.trim().toLowerCase();
        const filtered = useMemo(() => {
            const base = (activities || []).filter((a) => showArchived || !a.archived);
            if (!trimmed) return base;
            return base.filter((a) => String(a.name || '').toLowerCase().includes(trimmed));
        }, [activities, trimmed, showArchived]);

        const hasExactMatch = trimmed
            ? activities.some((a) => String(a.name || '').trim().toLowerCase() === trimmed)
            : false;

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-picker-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-picker', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, 'Занятия'),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-picker__body' },
                    h('div', { className: 'chrono-picker__toolbar' },
                        h('button', {
                            type: 'button',
                            className: 'chrono-picker__archive-toggle' + (showArchived ? ' active' : ''),
                            onClick: () => setShowArchived((v) => !v),
                        }, showArchived ? 'Скрыть архив' : 'Показать архив'),
                    ),
                    h('input', {
                        ref: inputRef,
                        className: 'planning-modal__input chrono-picker__search',
                        type: 'text',
                        placeholder: 'Поиск или новое дело…',
                        value: query,
                        onChange: (e) => setQuery(e.target.value),
                    }),
                    h('div', { className: 'chrono-picker__list' },
                        filtered.length === 0 && !trimmed && h('div', { className: 'chrono-picker__empty' },
                            'Пока нет дел. Введите название и создайте первое.'),
                        filtered.map((a) => h(ActivityRow, {
                            key: a.id,
                            activity: a,
                            onRename,
                            onArchive,
                            onRestore,
                            onDelete: onRequestDelete,
                        })),
                    ),
                    !hasExactMatch && trimmed && h(CreateActivityBlock, {
                        query,
                        onCreate: (payload) => { onCreate(payload); setQuery(''); },
                    }),
                ),
            ),
        );
    }

    // === Модалка удаления (delete либо merge) ===

    function DeleteActivityModal({ activity, totalMinutes, otherActivities, onDelete, onMerge, onClose }) {
        const [step, setStep] = useState('choice'); // 'choice' | 'merge'
        const [targetId, setTargetId] = useState('');
        const overlayRef = useRef(null);

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-delete', () => onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape') onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        const hasHistory = totalMinutes > 0;
        const canMerge = otherActivities.length > 0;

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-delete-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-delete', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, step === 'merge' ? 'Перенести записи' : 'Удалить занятие?'),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-delete__body' },
                    h('div', { className: 'chrono-delete__activity' },
                        h('span', { className: 'chrono-delete__emoji' }, activity.emoji || '·'),
                        h('span', { className: 'chrono-delete__name' }, activity.name),
                    ),
                    hasHistory && h('div', { className: 'chrono-delete__history' },
                        `⏱ ${formatMinutes(totalMinutes)} истории`),
                    step === 'choice' && h('div', { className: 'chrono-delete__actions' },
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--danger',
                            onClick: () => onDelete(activity.id),
                        }, hasHistory ? `Удалить совсем (потерять ${formatMinutes(totalMinutes)})` : 'Удалить'),
                        canMerge && hasHistory && h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--primary',
                            onClick: () => setStep('merge'),
                        }, 'Перенести в другое дело'),
                        h('button', { type: 'button', className: 'planning-btn', onClick: onClose }, 'Отмена'),
                    ),
                    step === 'merge' && h('div', { className: 'chrono-delete__merge' },
                        h('div', { className: 'planning-modal__section-title' }, 'В какое дело перенести записи?'),
                        h('div', { className: 'chrono-delete__merge-list' },
                            otherActivities.map((target) => h('button', {
                                key: target.id,
                                type: 'button',
                                className: 'chrono-delete__merge-option' + (targetId === target.id ? ' active' : ''),
                                onClick: () => setTargetId(target.id),
                            },
                                h('span', { className: 'chrono-delete__emoji' }, target.emoji || '·'),
                                h('span', null, target.name),
                            )),
                        ),
                        h('div', { className: 'chrono-delete__actions' },
                            h('button', {
                                type: 'button',
                                className: 'planning-btn planning-btn--primary',
                                disabled: !targetId,
                                onClick: () => onMerge(activity.id, targetId),
                            }, 'Перенести и удалить'),
                            h('button', { type: 'button', className: 'planning-btn', onClick: () => setStep('choice') }, 'Назад'),
                        ),
                    ),
                ),
            ),
        );
    }

    // === Timer (Pomodoro-style встроенный таймер) ===

    const TIMER_PRESETS = [
        { label: '15м', minutes: 15 },
        { label: '25м · Pomodoro', minutes: 25 },
        { label: '45м', minutes: 45 },
        { label: '1ч', minutes: 60 },
    ];

    function formatTimerRemaining(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function ChronoTimerBanner({ activity, remainingMs, plannedMinutes, paused, onPause, onResume, onStop }) {
        if (!activity) return null;
        const total = Math.max(1, plannedMinutes * 60 * 1000);
        const elapsed = Math.max(0, total - remainingMs);
        const pct = Math.min(100, Math.round((elapsed / total) * 100));
        const safeHue = ((Number(activity.hue) || 0) % 360 + 360) % 360;
        return h('div', { className: 'chrono-timer-banner' + (paused ? ' is-paused' : ''), style: { '--hue': safeHue + 'deg' } },
            h('div', { className: 'chrono-timer-banner__fill', style: { width: pct + '%' } }),
            h('span', { className: 'chrono-timer-banner__emoji', 'aria-hidden': 'true' }, activity.emoji || '⏱'),
            h('span', { className: 'chrono-timer-banner__name' }, activity.name),
            paused && h('span', { className: 'chrono-timer-banner__paused' }, 'пауза'),
            h('span', { className: 'chrono-timer-banner__time' }, formatTimerRemaining(remainingMs)),
            h('button', {
                type: 'button',
                className: 'chrono-timer-banner__control',
                onClick: paused ? onResume : onPause,
                'aria-label': paused ? 'Продолжить таймер' : 'Поставить таймер на паузу',
            }, paused ? '▶' : 'Ⅱ'),
            h('button', {
                type: 'button',
                className: 'chrono-timer-banner__stop',
                onClick: onStop,
                'aria-label': 'Остановить таймер',
            }, '✕'),
        );
    }

    function ChronoTimerCompleteModal({ activity, plannedMinutes, onAccept, onSkip, onAdjust, onClose }) {
        const overlayRef = useRef(null);

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-timer-complete', () => onClose && onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape' && onClose) onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-timer-complete-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current && onClose) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-timer-complete', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, '✅ Таймер завершён'),
                    onClose && h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-timer-complete__body' },
                    h('div', { className: 'chrono-timer-complete__activity' },
                        h('span', { className: 'chrono-timer-complete__emoji' }, activity.emoji || '·'),
                        h('span', { className: 'chrono-timer-complete__name' }, activity.name),
                    ),
                    h('div', { className: 'chrono-timer-complete__msg' },
                        `Прошло ${formatMinutes(plannedMinutes)}. Записать это время?`),
                    h('div', { className: 'chrono-timer-complete__actions' },
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--primary',
                            onClick: () => onAccept(plannedMinutes),
                        }, `Записать ${formatMinutes(plannedMinutes)}`),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn',
                            onClick: onAdjust,
                        }, 'Другое количество'),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--danger',
                            onClick: onSkip,
                        }, 'Не записывать'),
                    ),
                ),
            ),
        );
    }

    function ChronoTimerStopModal({ activity, elapsedMinutes, onSave, onDiscard, onClose }) {
        const overlayRef = useRef(null);

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-timer-stop', () => onClose && onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape' && onClose) onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-timer-stop-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current && onClose) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-timer-stop', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, 'Остановить таймер?'),
                    onClose && h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-timer-stop__body' },
                    h('div', { className: 'chrono-timer-complete__activity' },
                        h('span', { className: 'chrono-timer-complete__emoji' }, activity.emoji || '·'),
                        h('span', { className: 'chrono-timer-complete__name' }, activity.name),
                    ),
                    h('div', { className: 'chrono-timer-complete__msg' },
                        elapsedMinutes > 0
                            ? `Прошло ${formatMinutes(elapsedMinutes)}. Записать это время или сбросить?`
                            : 'Меньше минуты прошло. Сбросить таймер?'),
                    h('div', { className: 'chrono-timer-complete__actions' },
                        elapsedMinutes > 0 && h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--primary',
                            onClick: () => onSave(elapsedMinutes),
                        }, `Записать ${formatMinutes(elapsedMinutes)}`),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--danger',
                            onClick: onDiscard,
                        }, 'Сбросить'),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn',
                            onClick: onClose,
                        }, 'Отмена'),
                    ),
                ),
            ),
        );
    }

    // === Heatmap по дням (GitHub-style тепловая карта за окно дней) ===

    const HEATMAP_DAYS = 91; // 13 недель × 7 дней — норм поместится на 390px

    function ChronoHeatmap({ activity, entries, snapshots }) {
        const todayStr = Utils.dateStr();
        const startStr = Utils.addDays(todayStr, -(HEATMAP_DAYS - 1));

        const series = useMemo(() => buildDailySeries(entries, snapshots, activity.id, startStr, todayStr),
            [entries, snapshots, activity.id, startStr, todayStr]);

        const maxMin = useMemo(() => {
            let m = 0;
            series.forEach((d) => { if (d.minutes > m) m = d.minutes; });
            return m;
        }, [series]);

        // Раскладка: 7 строк (пн..вс) × N колонок. Колонка = неделя.
        // Колонок ровно столько, чтобы вместить HEATMAP_DAYS, добивая первую
        // неделю пустыми ячейками сверху до понедельника.
        const safeHue = ((Number(activity.hue) || 0) % 360 + 360) % 360;

        const startDate = new Date(startStr + 'T00:00:00');
        const startWeekday = (startDate.getDay() + 6) % 7; // 0=пн..6=вс
        const cells = [];
        // паддинг до понедельника
        for (let p = 0; p < startWeekday; p += 1) cells.push(null);
        series.forEach((d) => cells.push(d));
        // паддинг до завершения недели справа
        while (cells.length % 7 !== 0) cells.push(null);
        const weeks = cells.length / 7;

        function cellColor(minutes) {
            if (!minutes || minutes <= 0) return 'rgba(15, 23, 42, 0.05)';
            const t = maxMin > 0 ? Math.min(1, minutes / maxMin) : 0;
            const sat = 24 + 30 * t;
            const light = 88 - 36 * t;
            return `hsl(${Math.round(safeHue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
        }

        function cellTitle(cell) {
            if (!cell) return '';
            const m = cell.minutes || 0;
            return `${cell.date.slice(8)}.${cell.date.slice(5, 7)} · ${m > 0 ? formatMinutes(m) : 'нет записей'}`;
        }

        // Колоночная раскладка — каждая колонка = неделя.
        return h('div', { className: 'chrono-heatmap' },
            h('div', { className: 'chrono-heatmap__row-labels' },
                h('span', null, 'пн'),
                h('span', null, 'ср'),
                h('span', null, 'пт'),
                h('span', null, 'вс'),
            ),
            h('div', {
                className: 'chrono-heatmap__grid',
                style: { gridTemplateColumns: `repeat(${weeks}, 1fr)` },
            },
                Array.from({ length: weeks }, (_, wi) => h('div', {
                    key: wi,
                    className: 'chrono-heatmap__col',
                },
                    Array.from({ length: 7 }, (_, di) => {
                        const cell = cells[wi * 7 + di];
                        return h('div', {
                            key: di,
                            className: 'chrono-heatmap__cell' + (cell ? '' : ' chrono-heatmap__cell--empty'),
                            style: cell ? { background: cellColor(cell.minutes) } : undefined,
                            title: cellTitle(cell),
                        });
                    }),
                )),
            ),
            h('div', { className: 'chrono-heatmap__legend' },
                h('span', null, 'меньше'),
                h('span', { style: { background: 'rgba(15, 23, 42, 0.05)' } }),
                h('span', { style: { background: cellColor(maxMin * 0.25 || 1) } }),
                h('span', { style: { background: cellColor(maxMin * 0.5 || 1) } }),
                h('span', { style: { background: cellColor(maxMin * 0.75 || 1) } }),
                h('span', { style: { background: cellColor(maxMin || 1) } }),
                h('span', null, 'больше'),
            ),
        );
    }

    // === История записей (long-press на кружок) ===

    function ChronoHistoryModal({ activity, allEntries, snapshots, scopeDates, scopeLabel, onUpdateEntry, onAdjustEntry, onDeleteEntry, onClose }) {
        const entries = useMemo(() => {
            const ds = new Set(Array.isArray(scopeDates) ? scopeDates : []);
            return (Array.isArray(allEntries) ? allEntries : []).filter((e) =>
                e && e.activityId === activity.id && ds.has(e.date));
        }, [allEntries, scopeDates, activity.id]);
        const overlayRef = useRef(null);
        const [editingId, setEditingId] = useState(null);
        const [draftMinutes, setDraftMinutes] = useState('');

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-history', () => onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape') onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        const sorted = useMemo(() => {
            const arr = Array.isArray(entries) ? entries.slice() : [];
            arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            return arr;
        }, [entries]);

        const total = useMemo(() => sorted.reduce((s, e) => s + (Number(e.minutes) || 0), 0), [sorted]);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-history-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-history', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null,
                        h('span', { className: 'chrono-history__emoji' }, activity.emoji || '·'),
                        ' ',
                        activity.name,
                    ),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-history__body' },
                    h('div', { className: 'chrono-history__section-title' }, 'За 13 недель'),
                    h(ChronoHeatmap, {
                        activity,
                        entries: allEntries,
                        snapshots,
                    }),
                    h('div', { className: 'chrono-history__section-title' }, scopeLabel || 'за день'),
                    h('div', { className: 'chrono-history__summary' },
                        `${formatMinutes(total)} · ${sorted.length} ${sorted.length === 1 ? 'запись' : 'записей'}`,
                    ),
                    sorted.length === 0 && h('div', { className: 'chrono-history__empty' },
                        'За выбранный период записей нет.'),
                    sorted.length > 0 && h('div', { className: 'chrono-history__list' },
                        sorted.map((entry) => {
                            const isEditing = editingId === entry.id;
                            if (isEditing) {
                                return h('div', { key: entry.id, className: 'chrono-history__row chrono-history__row--editing' },
                                    h('input', {
                                        className: 'chrono-history__edit-input',
                                        type: 'number',
                                        min: 1,
                                        step: 5,
                                        inputMode: 'numeric',
                                        value: draftMinutes,
                                        autoFocus: true,
                                        onChange: (e) => setDraftMinutes(e.target.value),
                                        onKeyDown: (e) => {
                                            if (e.key === 'Escape') setEditingId(null);
                                            if (e.key === 'Enter') {
                                                const next = Math.round(Number(draftMinutes) || 0);
                                                if (next > 0) onUpdateEntry(entry.id, { minutes: next });
                                                setEditingId(null);
                                            }
                                        },
                                    }),
                                    h('button', {
                                        type: 'button',
                                        className: 'chrono-picker__icon-btn',
                                        onClick: () => {
                                            const next = Math.round(Number(draftMinutes) || 0);
                                            if (next > 0) onUpdateEntry(entry.id, { minutes: next });
                                            setEditingId(null);
                                        },
                                        'aria-label': 'Сохранить запись',
                                    }, '✓'),
                                    h('button', {
                                        type: 'button',
                                        className: 'chrono-picker__icon-btn',
                                        onClick: () => setEditingId(null),
                                        'aria-label': 'Отмена',
                                    }, '×'),
                                );
                            }
                            return h('div', { key: entry.id, className: 'chrono-history__row' },
                                h('span', { className: 'chrono-history__row-time' }, '+' + formatMinutes(entry.minutes)),
                                h('span', { className: 'chrono-history__row-when' }, formatEntryTime(entry.createdAt)),
                                h('button', {
                                    type: 'button',
                                    className: 'chrono-history__tiny-btn',
                                    onClick: () => onAdjustEntry(entry.id, -5),
                                    'aria-label': 'Уменьшить на 5 минут',
                                }, '-5'),
                                h('button', {
                                    type: 'button',
                                    className: 'chrono-history__tiny-btn',
                                    onClick: () => onAdjustEntry(entry.id, 5),
                                    'aria-label': 'Добавить 5 минут',
                                }, '+5'),
                                h('button', {
                                    type: 'button',
                                    className: 'chrono-picker__icon-btn',
                                    onClick: () => {
                                        setEditingId(entry.id);
                                        setDraftMinutes(String(entry.minutes || ''));
                                    },
                                    'aria-label': 'Редактировать запись',
                                }, '✎'),
                                h('button', {
                                    type: 'button',
                                    className: 'chrono-picker__icon-btn chrono-picker__icon-btn--danger',
                                    onClick: () => onDeleteEntry(entry.id),
                                    'aria-label': 'Удалить запись',
                                }, '✕'),
                            );
                        }),
                    ),
                ),
            ),
        );
    }

    // === Модалка длительности ===

    function pickInitialTargetUnit(targetMin) {
        // Если цель кратна 30 минутам и >= 60 — приятнее в часах (5ч вместо 300 мин).
        const m = Number(targetMin) || 0;
        return m >= 60 && m % 30 === 0 ? 'hr' : 'min';
    }

    function formatTargetForUnit(targetMin, unit) {
        const m = Number(targetMin) || 0;
        if (m <= 0) return '';
        if (unit === 'hr') {
            // Округляем до 0.5 для адекватного редактирования.
            const h = Math.round((m / 60) * 2) / 2;
            return String(h);
        }
        return String(m);
    }

    const TARGET_AUTOSAVE_DELAY_MS = 600;

    // valueInMinutes — текущее сохранённое значение (target или budget) для
    // данного периода, передаваемое родителем. kind — какого типа активная
    // цель ('target'|'budget'), управляется тоглом. onSave({kind, minutes}).
    function ChronoTargetRow({ label, valueInMinutes, initialKind, onSave }) {
        const [kind, setKind] = useState(initialKind || 'target');
        const [unit, setUnit] = useState(() => pickInitialTargetUnit(valueInMinutes));
        const [draft, setDraft] = useState(() => formatTargetForUnit(valueInMinutes, pickInitialTargetUnit(valueInMinutes)));
        const [savedFlash, setSavedFlash] = useState(false);
        const lastSavedRef = useRef({ minutes: valueInMinutes || null, kind: initialKind || 'target' });

        useEffect(() => {
            const u = pickInitialTargetUnit(valueInMinutes);
            setUnit(u);
            setDraft(formatTargetForUnit(valueInMinutes, u));
            setKind(initialKind || 'target');
            lastSavedRef.current = { minutes: valueInMinutes || null, kind: initialKind || 'target' };
        }, [valueInMinutes, initialKind]);

        useEffect(() => {
            if (!savedFlash) return undefined;
            const t = setTimeout(() => setSavedFlash(false), 900);
            return () => clearTimeout(t);
        }, [savedFlash]);

        const parseDraft = useCallback(() => {
            const raw = String(draft || '').trim();
            if (raw === '') return null;
            const num = Number(raw.replace(',', '.'));
            if (!Number.isFinite(num) || num <= 0) return null;
            return unit === 'hr' ? Math.round(num * 60) : Math.round(num);
        }, [draft, unit]);

        const parsedDraft = parseDraft();
        const isDirty = parsedDraft !== lastSavedRef.current.minutes || kind !== lastSavedRef.current.kind;
        const hasValue = parsedDraft && parsedDraft > 0;
        const saveLabel = lastSavedRef.current.minutes ? 'Обновить' : 'Сохранить';

        const handleSave = useCallback(() => {
            const parsed = parseDraft();
            if (parsed === lastSavedRef.current.minutes && kind === lastSavedRef.current.kind) return;
            onSave({ kind, minutes: parsed });
            lastSavedRef.current = { minutes: parsed, kind };
            setSavedFlash(true);
        }, [parseDraft, onSave, kind]);

        // Авто-сохранение: после изменения draft/unit/kind ждём 600мс,
        // если значение реально изменилось — коммитим без явной кнопки.
        useEffect(() => {
            if (parsedDraft === lastSavedRef.current.minutes && kind === lastSavedRef.current.kind) return undefined;
            if (parsedDraft === null) return undefined;
            const timer = setTimeout(() => {
                onSave({ kind, minutes: parsedDraft });
                lastSavedRef.current = { minutes: parsedDraft, kind };
                setSavedFlash(true);
            }, TARGET_AUTOSAVE_DELAY_MS);
            return () => clearTimeout(timer);
        }, [parsedDraft, kind, onSave]);

        const toggleUnit = useCallback((nextUnit) => {
            if (nextUnit === unit) return;
            const current = Number(draft);
            if (Number.isFinite(current) && current > 0) {
                if (nextUnit === 'hr') setDraft(String(Math.round((current / 60) * 2) / 2));
                else setDraft(String(Math.round(current * 60)));
            }
            setUnit(nextUnit);
        }, [unit, draft]);

        const handleClear = useCallback(() => {
            setDraft('');
            if (lastSavedRef.current.minutes) {
                onSave({ kind, minutes: null });
                lastSavedRef.current = { minutes: null, kind };
                setSavedFlash(true);
            }
        }, [onSave, kind]);

        return h('div', { className: 'chrono-duration__target' + (kind === 'budget' ? ' is-budget' : '') },
            h('div', { className: 'chrono-duration__target-head' },
                h('label', { className: 'chrono-duration__target-label' }, label),
                h('div', { className: 'chrono-duration__target-kind-toggle' },
                    h('button', {
                        type: 'button',
                        className: 'chrono-duration__target-kind-btn' + (kind === 'target' ? ' active' : ''),
                        onClick: () => setKind('target'),
                    }, 'Цель'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-duration__target-kind-btn' + (kind === 'budget' ? ' active' : ''),
                        onClick: () => setKind('budget'),
                    }, 'Лимит'),
                ),
            ),
            h('div', { className: 'chrono-duration__target-value' },
                h('input', {
                    className: 'planning-modal__input chrono-duration__target-input'
                        + (savedFlash ? ' is-saved' : ''),
                    type: 'number',
                    min: 0,
                    step: unit === 'hr' ? 0.5 : 5,
                    inputMode: 'decimal',
                    placeholder: '—',
                    value: draft,
                    onChange: (e) => setDraft(e.target.value),
                    onKeyDown: (e) => { if (e.key === 'Enter') { handleSave(); e.preventDefault(); } },
                }),
                h('div', { className: 'chrono-duration__target-unit-toggle' },
                    h('button', {
                        type: 'button',
                        className: 'chrono-duration__target-unit-btn' + (unit === 'min' ? ' active' : ''),
                        onClick: () => toggleUnit('min'),
                    }, 'мин'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-duration__target-unit-btn' + (unit === 'hr' ? ' active' : ''),
                        onClick: () => toggleUnit('hr'),
                    }, 'ч'),
                ),
                hasValue && h('button', {
                    type: 'button',
                    className: 'chrono-duration__target-clear',
                    onClick: handleClear,
                    'aria-label': 'Убрать цель',
                    title: 'Убрать цель',
                }, '✕'),
                h('button', {
                    type: 'button',
                    className: 'chrono-duration__target-save' + (savedFlash ? ' is-saved' : ''),
                    disabled: !isDirty,
                    onClick: handleSave,
                }, savedFlash ? '✓' : saveLabel),
            ),
        );
    }

    function ChronoLinkRow({ activity, tasks, projects, onLink }) {
        const taskOptions = (Array.isArray(tasks) ? tasks : [])
            .filter((task) => task && task.title)
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
        const projectOptions = (Array.isArray(projects) ? projects : [])
            .filter((project) => project && project.name)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

        return h('div', { className: 'chrono-duration__link' },
            h('div', { className: 'chrono-duration__link-title' }, 'План-факт'),
            h('select', {
                className: 'planning-modal__input chrono-duration__link-select',
                value: activity.taskId || '',
                onChange: (e) => {
                    const taskId = e.target.value || undefined;
                    const task = taskOptions.find((item) => item.id === taskId);
                    onLink && onLink({ taskId, projectId: task ? task.projectId : activity.projectId });
                },
            },
                h('option', { value: '' }, 'Без задачи'),
                taskOptions.map((task) => h('option', { key: task.id, value: task.id },
                    getTaskLabel(task, projects) + (task.plannedMinutes ? ` · план ${formatMinutes(task.plannedMinutes)}` : ''),
                )),
            ),
            h('select', {
                className: 'planning-modal__input chrono-duration__link-select',
                value: activity.projectId || '',
                onChange: (e) => onLink && onLink({ projectId: e.target.value || undefined, taskId: activity.taskId }),
            },
                h('option', { value: '' }, 'Без проекта'),
                projectOptions.map((project) => h('option', { key: project.id, value: project.id }, project.name)),
            ),
        );
    }

    function ChronoDurationModal({ activity, currentMinutes, scopeLabel, timerRunning, tasks, projects, onAdd, onSetTarget, onLink, onStartTimer, onClose }) {
        const [hourIdx, setHourIdx] = useState(0);
        const [minuteIdx, setMinuteIdx] = useState(30);
        const overlayRef = useRef(null);


        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-duration', () => onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape') onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        function applyPreset(min) {
            onAdd(min);
            onClose();
        }

        function applyCustom() {
            const min = hourIdx * 60 + minuteIdx;
            if (min <= 0) return;
            onAdd(min);
            onClose();
        }

        const WheelColumn = HEYS.WheelColumn;

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-duration-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-duration', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null,
                        h('span', { className: 'chrono-duration__emoji', 'aria-hidden': 'true' }, activity.emoji || '·'),
                        ' ',
                        activity.name,
                    ),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-duration__body' },
                    h('div', { className: 'chrono-duration__current' },
                        (Number(currentMinutes) || 0) > 0
                            ? `Сейчас (${scopeLabel || 'сегодня'}): ${formatMinutes(currentMinutes)} · добавить ещё:`
                            : 'Сколько занимались?',
                    ),
                    h('div', { className: 'chrono-duration__grid' },
                        CHRONO_PRESETS.map((preset) => h('button', {
                            key: preset.minutes,
                            type: 'button',
                            className: 'chrono-duration__preset',
                            onClick: () => applyPreset(preset.minutes),
                        }, '+' + preset.label)),
                    ),
                    h('div', { className: 'chrono-duration__custom-label' }, 'Своё время'),
                    WheelColumn && h('div', { className: 'chrono-duration__custom' },
                        h('div', { className: 'chrono-duration__wheels' },
                            h(WheelColumn, {
                                values: WheelColumn.presets.hours,
                                selected: hourIdx,
                                onChange: setHourIdx,
                                label: 'часы',
                                wrap: false,
                            }),
                            h('div', { className: 'chrono-duration__wheel-sep' }, ':'),
                            h(WheelColumn, {
                                values: WheelColumn.presets.minutes,
                                selected: minuteIdx,
                                onChange: setMinuteIdx,
                                label: 'минуты',
                                wrap: false,
                            }),
                        ),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--primary chrono-duration__custom-add',
                            disabled: (hourIdx * 60 + minuteIdx) <= 0,
                            onClick: applyCustom,
                        }, `Добавить ${formatMinutes(hourIdx * 60 + minuteIdx) || '—'}`),
                    ),
                    h('div', { className: 'chrono-duration__timer' },
                        h('div', { className: 'chrono-duration__timer-head' },
                            h('span', { className: 'chrono-duration__timer-title' }, '⏱ Запустить таймер'),
                            timerRunning && h('span', { className: 'chrono-duration__timer-running' }, 'Таймер уже идёт — остановите его на главном экране'),
                        ),
                        h('div', { className: 'chrono-duration__timer-chips' },
                            TIMER_PRESETS.map((p) => h('button', {
                                key: p.minutes,
                                type: 'button',
                                className: 'chrono-duration__timer-chip',
                                disabled: !!timerRunning,
                                onClick: () => {
                                    if (typeof onStartTimer === 'function') onStartTimer(p.minutes);
                                    onClose();
                                },
                            }, p.label)),
                        ),
                    ),
                    h(ChronoTargetRow, {
                        label: 'За день:',
                        valueInMinutes: ((activity && activity.budgetMinutesPerDay) || (activity && activity.targetMinutesPerDay)) || 0,
                        initialKind: (activity && activity.budgetMinutesPerDay) ? 'budget' : 'target',
                        onSave: ({ kind, minutes }) => onSetTarget && onSetTarget({ period: 'day', kind, minutes }),
                    }),
                    h(ChronoTargetRow, {
                        label: 'За неделю:',
                        valueInMinutes: ((activity && activity.budgetMinutesPerWeek) || (activity && activity.targetMinutesPerWeek)) || 0,
                        initialKind: (activity && activity.budgetMinutesPerWeek) ? 'budget' : 'target',
                        onSave: ({ kind, minutes }) => onSetTarget && onSetTarget({ period: 'week', kind, minutes }),
                    }),
                    h(ChronoLinkRow, {
                        activity,
                        tasks,
                        projects,
                        onLink,
                    }),
                ),
            ),
        );
    }

    // === Bubble + Cloud ===

    function hashSeed(str) {
        let h = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    const LONG_PRESS_MS = 500;
    const LONG_PRESS_TOLERANCE_PX = 8;

    function ChronoBubble({ activity, minutes, maxMin, scope, badge, onClick, onLongPress, onQuickAdjust }) {
        const diameter = Math.round(radiusForMinutes(minutes, maxMin) * 2);
        const bg = colorForActivity(activity.hue, minutes, maxMin);
        const seed = hashSeed(activity.id);
        const delay = ((seed % 100) / 100) * -8;
        const dur = 8 + (seed % 5);
        const fx = 4 + (seed % 4);
        const fy = 4 + ((seed >> 3) % 4);
        const progress = getProgress(activity, minutes, scope);
        const hasGoal = progress !== null;
        const progressDeg = hasGoal ? Math.round(progress.value * 360) : 0;
        const ringColor = ringColorForProgress(progress, activity.hue);
        const goalKind = progress ? progress.kind : null;

        const pressTimer = useRef(null);
        const longFiredRef = useRef(false);
        const startPosRef = useRef({ x: 0, y: 0 });

        const clearPress = useCallback(() => {
            if (pressTimer.current) {
                clearTimeout(pressTimer.current);
                pressTimer.current = null;
            }
        }, []);

        const handlePointerDown = useCallback((e) => {
            longFiredRef.current = false;
            startPosRef.current = { x: e.clientX || 0, y: e.clientY || 0 };
            clearPress();
            pressTimer.current = setTimeout(() => {
                longFiredRef.current = true;
                pressTimer.current = null;
                if (typeof onLongPress === 'function') onLongPress(activity);
            }, LONG_PRESS_MS);
        }, [activity, onLongPress, clearPress]);

        const handlePointerMove = useCallback((e) => {
            if (!pressTimer.current) return;
            const dx = Math.abs((e.clientX || 0) - startPosRef.current.x);
            const dy = Math.abs((e.clientY || 0) - startPosRef.current.y);
            if (dx > LONG_PRESS_TOLERANCE_PX || dy > LONG_PRESS_TOLERANCE_PX) clearPress();
        }, [clearPress]);

        const handlePointerEnd = useCallback(() => { clearPress(); }, [clearPress]);

        const handleClick = useCallback((e) => {
            if (longFiredRef.current) {
                e.preventDefault();
                longFiredRef.current = false;
                return;
            }
            onClick(activity);
        }, [activity, onClick]);

        return h('div', {
            className: 'chrono-bubble-wrap'
                + (hasGoal ? ' has-target' : '')
                + (goalKind === 'budget' ? ' is-budget' : '')
                + (progress && progress.kind === 'target' && progress.value >= 1 ? ' is-complete' : '')
                + (progress && progress.over ? ' is-over' : ''),
            style: {
                '--size': diameter + 'px',
                '--progress-deg': progressDeg + 'deg',
                '--ring-color': ringColor,
                '--float-dur': dur + 's',
                '--float-delay': delay + 's',
                '--float-x': fx + 'px',
                '--float-y': fy + 'px',
            },
        },
            h('button', {
                type: 'button',
                className: 'chrono-bubble',
                style: { '--bg': bg },
                onClick: handleClick,
                onPointerDown: handlePointerDown,
                onPointerMove: handlePointerMove,
                onPointerUp: handlePointerEnd,
                onPointerCancel: handlePointerEnd,
                onPointerLeave: handlePointerEnd,
                title: hasGoal
                    ? `${activity.name} · ${formatMinutes(minutes)} / ${goalKind === 'budget' ? 'лимит' : 'цель'} ${formatMinutes((scope === 'week' ? (activity.targetMinutesPerWeek || activity.budgetMinutesPerWeek) : (activity.targetMinutesPerDay || activity.budgetMinutesPerDay)) || 0)}`
                    : `${activity.name} · ${formatMinutes(minutes)}`,
            },
                h('span', { className: 'chrono-bubble__emoji', 'aria-hidden': 'true' }, activity.emoji || '·'),
                h('span', { className: 'chrono-bubble__name' }, activity.name),
                h('span', { className: 'chrono-bubble__time' }, formatMinutes(minutes)),
            ),
            h('div', { className: 'chrono-bubble-quick', 'aria-label': 'Быстрые правки' },
                [-5, 5, 10].map((delta) => h('button', {
                    key: delta,
                    type: 'button',
                    className: 'chrono-bubble-quick__btn',
                    onClick: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof onQuickAdjust === 'function') onQuickAdjust(activity, delta);
                    },
                    title: `${delta > 0 ? '+' : ''}${delta} минут`,
                    'aria-label': `${delta > 0 ? 'Добавить' : 'Уменьшить'} ${Math.abs(delta)} минут`,
                }, `${delta > 0 ? '+' : ''}${delta}`)),
            ),
            badge && h('span', {
                key: badge.key,
                className: 'chrono-bubble__badge',
                style: { '--badge-bg': ringColor },
            }, '+' + formatMinutes(badge.minutes)),
        );
    }

    function ChronoStrip({ activities, onPick, onAddNew }) {
        return h('div', { className: 'chrono-strip', role: 'list' },
            activities.map((a) => h('button', {
                key: a.id,
                type: 'button',
                className: 'chrono-strip__item',
                style: { '--hue': (Number(a.hue) || 0) + 'deg' },
                onClick: () => onPick(a),
                title: `Тап → записать время в «${a.name}»`,
            },
                h('span', { className: 'chrono-strip__emoji', 'aria-hidden': 'true' }, a.emoji || '·'),
                h('span', { className: 'chrono-strip__name' }, a.name),
            )),
            onAddNew && h('button', {
                key: '__add-new__',
                type: 'button',
                className: 'chrono-strip__item chrono-strip__item--add',
                onClick: onAddNew,
                title: 'Добавить новое занятие',
            },
                h('span', { className: 'chrono-strip__name' }, '+ Новая'),
            ),
        );
    }

    const WEEKDAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

    function ChronoWeekBreakdown({ dates, breakdown, activities, todayStr, activeDate, onPickDate }) {
        const maxDayTotal = useMemo(() => {
            let m = 0;
            dates.forEach((d) => {
                const t = (breakdown[d] && breakdown[d].__total) || 0;
                if (t > m) m = t;
            });
            return m;
        }, [breakdown, dates]);

        if (maxDayTotal <= 0) return null;

        const activitiesById = useMemo(() => {
            const map = new Map();
            activities.forEach((a) => map.set(a.id, a));
            return map;
        }, [activities]);

        return h('div', { className: 'chrono-week-breakdown', 'aria-label': 'Распределение времени по дням недели' },
            dates.map((date, i) => {
                const day = breakdown[date] || { __total: 0 };
                const total = day.__total || 0;
                const heightPct = maxDayTotal > 0 ? Math.round((total / maxDayTotal) * 100) : 0;
                // Сегменты в обратном порядке (сверху меньшие, снизу большие — стек растёт снизу)
                const segments = Object.keys(day)
                    .filter((k) => k !== '__total')
                    .map((id) => ({ id, minutes: day[id] }))
                    .sort((a, b) => b.minutes - a.minutes);
                const isToday = date === todayStr;
                const isActive = date === activeDate;
                return h('button', {
                    key: date,
                    type: 'button',
                    className: 'chrono-week-breakdown__col'
                        + (isActive ? ' is-active' : '')
                        + (isToday ? ' is-today' : ''),
                    onClick: () => onPickDate && onPickDate(date),
                    title: `${date}: ${formatMinutes(total)}`,
                },
                    h('div', { className: 'chrono-week-breakdown__col-fill', style: { height: heightPct + '%' } },
                        segments.map((seg) => {
                            const a = activitiesById.get(seg.id);
                            const segPct = total > 0 ? (seg.minutes / total) * 100 : 0;
                            const hue = a ? (Number(a.hue) || 0) : 200;
                            return h('div', {
                                key: seg.id,
                                className: 'chrono-week-breakdown__seg',
                                style: {
                                    height: segPct + '%',
                                    background: `hsl(${hue}, 38%, 62%)`,
                                },
                                title: a ? `${a.emoji || ''} ${a.name}: ${formatMinutes(seg.minutes)}` : '',
                            });
                        }),
                    ),
                    h('span', { className: 'chrono-week-breakdown__label' }, WEEKDAY_LABELS[i] || ''),
                );
            }),
        );
    }

    function ChronoInsightsBar({ insights }) {
        if (!Array.isArray(insights) || insights.length === 0) return null;
        return h('div', { className: 'chrono-insights', 'aria-label': 'Краткая аналитика хронометража' },
            insights.map((item, index) => h('div', {
                key: item.kind + index,
                className: 'chrono-insights__item chrono-insights__item--' + item.kind,
            },
                h('span', { className: 'chrono-insights__title' }, item.title),
                h('span', { className: 'chrono-insights__value' }, item.value),
                h('span', { className: 'chrono-insights__detail' }, item.detail),
            )),
        );
    }

    function ChronoPlanFactPanel({ facts, tasks, projects }) {
        if (!Array.isArray(facts) || facts.length === 0) return null;
        const taskById = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [task.id, task]));
        return h('div', { className: 'chrono-planfact', 'aria-label': 'План-факт по задачам' },
            h('div', { className: 'chrono-planfact__title' }, 'План-факт'),
            facts.slice(0, 4).map((fact) => {
                const task = fact.taskId ? taskById.get(fact.taskId) : null;
                const ratio = fact.planned > 0 ? Math.max(0, Math.min(1.5, fact.actual / fact.planned)) : 0;
                return h('div', { key: fact.activityId, className: 'chrono-planfact__row' },
                    h('div', { className: 'chrono-planfact__main' },
                        h('span', { className: 'chrono-planfact__name' }, `${fact.emoji || ''} ${fact.name}`),
                        h('span', { className: 'chrono-planfact__meta' }, task ? getTaskLabel(task, projects) : fact.label),
                    ),
                    h('div', { className: 'chrono-planfact__meter' },
                        h('span', {
                            className: 'chrono-planfact__fill' + (fact.delta > 0 ? ' is-over' : ''),
                            style: { width: Math.round(Math.min(100, ratio * 100)) + '%' },
                        }),
                    ),
                    h('div', { className: 'chrono-planfact__numbers' },
                        `${formatMinutes(fact.actual)} / ${formatMinutes(fact.planned)}`,
                    ),
                );
            }),
        );
    }

    function ChronoCloud({ activities, minutesByActivity, maxMin, scope, recentBadge, onPick, onLongPress, onQuickAdjust, hasInactive }) {
        if (!activities.length) {
            const text = hasInactive
                ? 'Нажмите на занятие выше, чтобы записать время — кружок появится здесь и будет расти.'
                : 'Нажмите «+ Новая», чтобы добавить занятие.';
            return h('div', { className: 'chrono-empty' }, text);
        }

        return h('div', { className: 'chrono-cloud' },
            h('div', { className: 'chrono-cloud__items' },
                activities.map((a) => h(ChronoBubble, {
                    key: a.id,
                    activity: a,
                    minutes: minutesByActivity[a.id] || 0,
                    maxMin,
                    scope,
                    badge: recentBadge && recentBadge.activityId === a.id ? recentBadge : null,
                    onClick: onPick,
                    onLongPress,
                    onQuickAdjust,
                })),
            ),
        );
    }

    // === Основной экран ===

    function ChronoScreen({ state }) {
        const [scope, setScope] = useState('day');
        const [activeDate, setActiveDate] = useState(() => Utils.dateStr());
        const [durationTarget, setDurationTarget] = useState(null);
        const [pickerOpen, setPickerOpen] = useState(false);
        const [deleteTarget, setDeleteTarget] = useState(null);
        const [historyTarget, setHistoryTarget] = useState(null);
        const [toast, setToast] = useState(null);
        const [recentBadge, setRecentBadge] = useState(null);
        const [timerCompleteShown, setTimerCompleteShown] = useState(false);
        const [timerStopOpen, setTimerStopOpen] = useState(false);
        const [timerNow, setTimerNow] = useState(() => Date.now());

        useEffect(() => {
            seedDefaultChronoOnce();
            if (typeof Store.compactChronoOlderThan90Once === 'function') {
                Store.compactChronoOlderThan90Once();
            }
        }, []);

        const activities = state.chronoActivities || [];
        const visibleActivities = useMemo(() => activities.filter((a) => !a.archived), [activities]);
        const entries = state.chronoEntries || [];
        const snapshots = state.chronoSnapshots || [];
        const tasks = state.tasks || [];
        const projects = state.projects || [];
        const timer = state.chronoTimer || null;
        const timerActivity = timer ? activities.find((a) => a.id === timer.activityId) : null;
        const timerPaused = !!(timer && timer.pausedAt);
        const timerRemainingMs = timer ? getTimerRemainingMs(timer, timerNow) : 0;
        const timerElapsedMs = timer ? getTimerElapsedMs(timer, timerNow) : 0;
        const timerExpired = timer ? !timerPaused && timerRemainingMs <= 0 : false;

        // Тикаем секундным интервалом только когда есть активный таймер.
        useEffect(() => {
            if (!timer) return undefined;
            setTimerNow(Date.now());
            const id = setInterval(() => setTimerNow(Date.now()), 1000);
            return () => clearInterval(id);
        }, [timer && timer.activityId, timer && timer.startMs, timer && timer.pausedAt]);

        // При истечении — показываем complete-modal один раз.
        useEffect(() => {
            if (timer && timerExpired && !timerCompleteShown) {
                setTimerCompleteShown(true);
            }
            if (!timer) setTimerCompleteShown(false);
        }, [timer, timerExpired, timerCompleteShown]);

        const dates = useMemo(() => {
            if (scope === 'week') return Utils.getWeekDays(activeDate);
            return [activeDate];
        }, [scope, activeDate]);

        const minutesByActivity = useMemo(() => {
            if (typeof Utils.getChronoMinutesByActivity === 'function') {
                return Utils.getChronoMinutesByActivity(entries, snapshots, dates);
            }
            return {};
        }, [entries, snapshots, dates]);

        const maxMin = useMemo(() => {
            let m = 0;
            Object.values(minutesByActivity).forEach((v) => { if (v > m) m = v; });
            return m;
        }, [minutesByActivity]);

        const partition = useMemo(() => {
            const active = [];
            const inactive = [];
            visibleActivities.forEach((a) => {
                if ((minutesByActivity[a.id] || 0) > 0) active.push(a);
                else inactive.push(a);
            });
            return { active, inactive };
        }, [visibleActivities, minutesByActivity]);

        // Распределение времени по дням недели для режима week.
        const weekBreakdown = useMemo(() => {
            if (scope !== 'week') return null;
            return buildWeekBreakdown(entries, snapshots, dates);
        }, [scope, entries, snapshots, dates]);

        const totalForDelete = useMemo(() => {
            if (!deleteTarget) return 0;
            const fromEntries = entries
                .filter((e) => e.activityId === deleteTarget.id)
                .reduce((sum, e) => sum + (Number(e.minutes) || 0), 0);
            const fromSnapshots = snapshots
                .filter((s) => s.activityId === deleteTarget.id)
                .reduce((sum, s) => sum + (Number(s.totalMinutes) || 0), 0);
            return fromEntries + fromSnapshots;
        }, [deleteTarget, entries, snapshots]);

        const otherActivities = useMemo(() => {
            if (!deleteTarget) return [];
            return activities.filter((a) => a.id !== deleteTarget.id && !a.archived);
        }, [deleteTarget, activities]);

        const handleBubbleClick = useCallback((activity) => {
            setDurationTarget(activity);
        }, []);

        const handleLongPress = useCallback((activity) => {
            setHistoryTarget(activity);
        }, []);

        const handleAddMinutes = useCallback((minutes) => {
            if (!durationTarget || minutes <= 0) return;
            const entry = state.addChronoEntry({
                activityId: durationTarget.id,
                date: activeDate,
                minutes,
            });
            if (entry && entry.id) {
                setToast({ id: entry.id, minutes });
                setRecentBadge({ activityId: durationTarget.id, minutes, key: entry.id });
            }
        }, [durationTarget, activeDate, state]);

        const handleUndo = useCallback(() => {
            if (!toast || !toast.id) return;
            state.deleteChronoEntry(toast.id);
            setToast(null);
        }, [toast, state]);

        const handleCreateActivity = useCallback(({ name, emoji }) => {
            state.addChronoActivity({ name, emoji });
        }, [state]);

        const handleRename = useCallback((id, patch) => {
            state.updateChronoActivity(id, patch);
        }, [state]);

        const handleArchive = useCallback((id) => {
            if (typeof state.archiveChronoActivity === 'function') state.archiveChronoActivity(id);
            else state.updateChronoActivity(id, { archived: true });
        }, [state]);

        const handleRestore = useCallback((id) => {
            if (typeof state.restoreChronoActivity === 'function') state.restoreChronoActivity(id);
            else state.updateChronoActivity(id, { archived: false });
        }, [state]);

        const handleRequestDelete = useCallback((activity) => {
            setDeleteTarget(activity);
        }, []);

        const handleConfirmDelete = useCallback((id) => {
            state.deleteChronoActivity(id);
            setDeleteTarget(null);
        }, [state]);

        const handleMerge = useCallback((fromId, toId) => {
            state.mergeChronoActivities(fromId, toId);
            setDeleteTarget(null);
        }, [state]);

        const handleStartTimer = useCallback((minutes) => {
            if (!durationTarget) return;
            state.startChronoTimer({ activityId: durationTarget.id, plannedMinutes: minutes });
        }, [durationTarget, state]);

        const handleQuickAdjust = useCallback((activity, deltaMinutes) => {
            if (!activity || !deltaMinutes) return;
            if (deltaMinutes > 0) {
                const entry = state.addChronoEntry({ activityId: activity.id, date: activeDate, minutes: deltaMinutes });
                if (entry && entry.id) {
                    setToast({ id: entry.id, minutes: deltaMinutes });
                    setRecentBadge({ activityId: activity.id, minutes: deltaMinutes, key: entry.id });
                }
                return;
            }
            const ds = new Set(dates);
            const last = (entries || [])
                .filter((e) => e && e.activityId === activity.id && ds.has(e.date))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
            if (last && typeof state.adjustChronoEntryMinutes === 'function') {
                state.adjustChronoEntryMinutes(last.id, deltaMinutes);
                setToast({ id: last.id, minutes: deltaMinutes, adjusted: true });
            }
        }, [activeDate, dates, entries, state]);

        const handleUpdateEntry = useCallback((id, patch) => {
            if (typeof state.updateChronoEntry === 'function') state.updateChronoEntry(id, patch);
        }, [state]);

        const handleAdjustEntry = useCallback((id, deltaMinutes) => {
            if (typeof state.adjustChronoEntryMinutes === 'function') state.adjustChronoEntryMinutes(id, deltaMinutes);
        }, [state]);

        const handleTimerAccept = useCallback((minutes) => {
            if (!timer) return;
            const entry = state.addChronoEntry({
                activityId: timer.activityId,
                date: Utils.dateStr(),
                minutes,
            });
            if (entry && entry.id) {
                setToast({ id: entry.id, minutes });
                setRecentBadge({ activityId: timer.activityId, minutes, key: entry.id });
            }
            state.clearChronoTimer();
            setTimerCompleteShown(false);
        }, [timer, state]);

        const handleTimerAdjust = useCallback(() => {
            if (!timer || !timerActivity) return;
            // открываем стандартную модалку длительности на ту же активность;
            // таймер чистим — пользователь сам выберет сколько записать.
            setDurationTarget(timerActivity);
            state.clearChronoTimer();
            setTimerCompleteShown(false);
        }, [timer, timerActivity, state]);

        const handleTimerSkip = useCallback(() => {
            state.clearChronoTimer();
            setTimerCompleteShown(false);
        }, [state]);

        const handleTimerPause = useCallback(() => {
            if (typeof state.pauseChronoTimer === 'function') state.pauseChronoTimer();
        }, [state]);

        const handleTimerResume = useCallback(() => {
            if (typeof state.resumeChronoTimer === 'function') state.resumeChronoTimer();
        }, [state]);

        const handleTimerStopSave = useCallback((minutes) => {
            if (!timer) return;
            const entry = state.addChronoEntry({
                activityId: timer.activityId,
                date: Utils.dateStr(),
                minutes,
            });
            if (entry && entry.id) {
                setToast({ id: entry.id, minutes });
                setRecentBadge({ activityId: timer.activityId, minutes, key: entry.id });
            }
            state.clearChronoTimer();
            setTimerStopOpen(false);
        }, [timer, state]);

        const handleTimerStopDiscard = useCallback(() => {
            state.clearChronoTimer();
            setTimerStopOpen(false);
        }, [state]);

        const dateLabel = scope === 'week' ? formatWeekLabel(activeDate) : formatDateLabel(activeDate);
        const todayStr = Utils.dateStr();

        // Суммарное время за выбранный охват — для счётчика в шапке.
        const totalMinutes = useMemo(() => {
            let sum = 0;
            Object.values(minutesByActivity).forEach((v) => { sum += Number(v) || 0; });
            return sum;
        }, [minutesByActivity]);

        const insights = useMemo(() => buildChronoWeekInsights(visibleActivities, minutesByActivity, totalMinutes, scope),
            [visibleActivities, minutesByActivity, totalMinutes, scope]);

        const planFacts = useMemo(() => buildChronoPlanFacts(visibleActivities, tasks, minutesByActivity),
            [visibleActivities, tasks, minutesByActivity]);

        // Запрещаем листать в будущее: следующий шаг (день или неделя) не должен
        // выходить за «сегодня». Для недельного режима ориентируемся на старт
        // следующей недели (activeDate + 7) — он не должен оказаться позже сегодня.
        const canGoForward = useMemo(() => {
            const next = shiftDateStr(activeDate, scope === 'week' ? 7 : 1);
            return next <= todayStr;
        }, [activeDate, scope, todayStr]);

        // Спавн-эффект (анимация bubble + bubble badge) гасится через 1.4 сек.
        useEffect(() => {
            if (!recentBadge) return undefined;
            const t = setTimeout(() => setRecentBadge(null), 1400);
            return () => clearTimeout(t);
        }, [recentBadge && recentBadge.key]);

        // Swipe-навигация по датам — горизонтальный жест по облаку даёт
        // prev/next день (или неделю). Порог 60px по X, ≤40px по Y чтобы не
        // конфликтовать с вертикальным скроллом и тапом по bubble (<8px).
        const swipeRef = useRef({ x: 0, y: 0, t: 0, active: false });
        const handleScreenPointerDown = useCallback((e) => {
            if (e.pointerType === 'mouse') return; // мышь не используем — есть кнопки
            swipeRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), active: true };
        }, []);
        const handleScreenPointerUp = useCallback((e) => {
            if (!swipeRef.current.active) return;
            const dx = e.clientX - swipeRef.current.x;
            const dy = Math.abs(e.clientY - swipeRef.current.y);
            const dt = Date.now() - swipeRef.current.t;
            swipeRef.current.active = false;
            if (dt > 700) return;          // слишком долго — не свайп
            if (Math.abs(dx) < 60 || dy > 40) return;
            const step = scope === 'week' ? 7 : 1;
            if (dx > 0) {
                setActiveDate((d) => shiftDateStr(d, -step));
            } else {
                const next = shiftDateStr(activeDate, step);
                if (next <= todayStr) setActiveDate(next);
            }
        }, [scope, activeDate, todayStr]);
        const handleScreenPointerCancel = useCallback(() => {
            swipeRef.current.active = false;
        }, []);

        return h('div', {
            className: 'chrono-screen',
            onPointerDown: handleScreenPointerDown,
            onPointerUp: handleScreenPointerUp,
            onPointerCancel: handleScreenPointerCancel,
        },
            h('div', { className: 'chrono-scope-bar' },
                h('div', { className: 'chrono-scope-bar__toggle' },
                    h('button', {
                        type: 'button',
                        className: 'chrono-scope-bar__toggle-item' + (scope === 'day' ? ' active' : ''),
                        onClick: () => setScope('day'),
                    }, 'День'),
                    h('button', {
                        type: 'button',
                        className: 'chrono-scope-bar__toggle-item' + (scope === 'week' ? ' active' : ''),
                        onClick: () => setScope('week'),
                    }, 'Неделя'),
                ),
                h('button', {
                    type: 'button',
                    className: 'chrono-scope-bar__nav-btn',
                    onClick: () => setActiveDate((d) => shiftDateStr(d, scope === 'week' ? -7 : -1)),
                    'aria-label': 'Назад',
                }, '‹'),
                h('span', { className: 'chrono-scope-bar__date' }, dateLabel),
                h('button', {
                    type: 'button',
                    className: 'chrono-scope-bar__nav-btn',
                    onClick: () => setActiveDate((d) => shiftDateStr(d, scope === 'week' ? 7 : 1)),
                    disabled: !canGoForward,
                    'aria-label': 'Вперёд',
                }, '›'),
                h('button', {
                    type: 'button',
                    className: 'chrono-scope-bar__today',
                    onClick: () => setActiveDate(todayStr),
                }, 'Сегодня'),
            ),
            timer && timerActivity && h(ChronoTimerBanner, {
                activity: timerActivity,
                remainingMs: timerRemainingMs,
                plannedMinutes: timer.plannedMinutes,
                paused: timerPaused,
                onPause: handleTimerPause,
                onResume: handleTimerResume,
                onStop: () => setTimerStopOpen(true),
            }),
            h(ChronoInsightsBar, { insights }),
            h(ChronoPlanFactPanel, { facts: planFacts, tasks, projects }),
            h(ChronoStrip, {
                activities: partition.inactive,
                onPick: handleBubbleClick,
                onAddNew: () => setPickerOpen(true),
            }),
            h(ChronoCloud, {
                activities: partition.active,
                minutesByActivity,
                maxMin,
                scope,
                recentBadge,
                onPick: handleBubbleClick,
                onLongPress: handleLongPress,
                onQuickAdjust: handleQuickAdjust,
                hasInactive: partition.inactive.length > 0,
            }),
            scope === 'week' && weekBreakdown && h(ChronoWeekBreakdown, {
                dates,
                breakdown: weekBreakdown,
                activities,
                todayStr,
                activeDate,
                onPickDate: (d) => { setScope('day'); setActiveDate(d); },
            }),
            durationTarget && h(ChronoDurationModal, {
                activity: activities.find((a) => a.id === durationTarget.id) || durationTarget,
                currentMinutes: minutesByActivity[durationTarget.id] || 0,
                scopeLabel: scope === 'week' ? 'за неделю' : 'за день',
                timerRunning: !!timer,
                tasks,
                projects,
                onStartTimer: handleStartTimer,
                onAdd: handleAddMinutes,
                onLink: (patch) => state.updateChronoActivity(durationTarget.id, patch),
                onSetTarget: (payload) => {
                    // payload: { period: 'day'|'week', kind: 'target'|'budget', minutes: N|null }
                    if (!payload) return;
                    const m = payload.minutes;
                    const period = payload.period === 'week' ? 'week' : 'day';
                    const kind = payload.kind === 'budget' ? 'budget' : 'target';
                    const field = period === 'week'
                        ? (kind === 'budget' ? 'budgetMinutesPerWeek' : 'targetMinutesPerWeek')
                        : (kind === 'budget' ? 'budgetMinutesPerDay' : 'targetMinutesPerDay');
                    state.updateChronoActivity(durationTarget.id, { [field]: m });
                },
                onClose: () => setDurationTarget(null),
            }),
            pickerOpen && h(ActivityPicker, {
                activities,
                onCreate: handleCreateActivity,
                onRename: handleRename,
                onArchive: handleArchive,
                onRestore: handleRestore,
                onRequestDelete: handleRequestDelete,
                onClose: () => setPickerOpen(false),
            }),
            deleteTarget && h(DeleteActivityModal, {
                activity: deleteTarget,
                totalMinutes: totalForDelete,
                otherActivities,
                onDelete: handleConfirmDelete,
                onMerge: handleMerge,
                onClose: () => setDeleteTarget(null),
            }),
            historyTarget && h(ChronoHistoryModal, {
                activity: historyTarget,
                allEntries: state.chronoEntries || [],
                snapshots: state.chronoSnapshots || [],
                scopeDates: dates,
                scopeLabel: scope === 'week' ? 'за неделю' : 'за день',
                onUpdateEntry: handleUpdateEntry,
                onAdjustEntry: handleAdjustEntry,
                onDeleteEntry: (id) => state.deleteChronoEntry(id),
                onClose: () => setHistoryTarget(null),
            }),
            h(ChronoUndoToast, {
                toast,
                onUndo: handleUndo,
                onDismiss: () => setToast(null),
            }),
            timerCompleteShown && timerActivity && h(ChronoTimerCompleteModal, {
                activity: timerActivity,
                plannedMinutes: timer.plannedMinutes,
                onAccept: handleTimerAccept,
                onAdjust: handleTimerAdjust,
                onSkip: handleTimerSkip,
                onClose: () => setTimerCompleteShown(false),
            }),
            timerStopOpen && timer && timerActivity && h(ChronoTimerStopModal, {
                activity: timerActivity,
                elapsedMinutes: Math.round(timerElapsedMs / 60000),
                onSave: handleTimerStopSave,
                onDiscard: handleTimerStopDiscard,
                onClose: () => setTimerStopOpen(false),
            }),
            totalMinutes > 0 && h('div', {
                className: 'chrono-bottom-total',
                title: `Суммарное время ${scope === 'week' ? 'за неделю' : 'за день'}`,
                'aria-label': `Всего: ${formatMinutes(totalMinutes)}`,
            },
                h('span', { className: 'chrono-bottom-total__label' }, 'всего:'),
                h('span', { className: 'chrono-bottom-total__value' }, formatMinutes(totalMinutes)),
            ),
        );
    }

    // === Экспорт ===

    HEYS.PlanningChrono = {
        ChronoScreen,
        ChronoDurationModal,
        ChronoHistoryModal,
        ChronoHeatmap,
        ChronoWeekBreakdown,
        ChronoTimerBanner,
        ChronoTimerCompleteModal,
        ChronoTimerStopModal,
        radiusForMinutes,
        colorForActivity,
        formatMinutes,
        formatEntryTime,
        formatTimerRemaining,
        getTimerElapsedMs,
        getTimerRemainingMs,
        getProgress,
        getActivityTarget,
        getActivityGoalForScope,
        ringColorForProgress,
        buildDailySeries,
        buildWeekBreakdown,
        buildChronoPlanFacts,
        buildChronoWeekInsights,
        CHRONO_PRESETS,
        CHRONO_EMOJI_PALETTE,
        TIMER_PRESETS,
        r_min,
        r_max,
        seedDefaultChronoOnce,
    };
})();
