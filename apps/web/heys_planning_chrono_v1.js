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
        { name: 'Поиграл с ребёнком', emoji: '👶', category: 'care' },
        { name: 'Работа на студии', emoji: '🎨', category: 'focus' },
        { name: 'Залип в телефоне', emoji: '📱', category: 'drain' },
        { name: 'Программирование', emoji: '💻', category: 'focus' },
        { name: 'Спорт', emoji: '🏃', category: 'health' },
        { name: 'Чтение', emoji: '📚', category: 'growth' },
        { name: 'Домашние дела', emoji: '🧹', category: 'errands' },
        { name: 'Отдых', emoji: '😴', category: 'recovery' },
    ];

    const TOAST_TIMEOUT_MS = 5000;

    const CHRONO_CATEGORIES = [
        { id: 'focus', label: 'Фокус', short: 'Фокус', tone: 'blue' },
        { id: 'growth', label: 'Рост', short: 'Рост', tone: 'green' },
        { id: 'health', label: 'Здоровье', short: 'Здоровье', tone: 'teal' },
        { id: 'care', label: 'Семья', short: 'Семья', tone: 'rose' },
        { id: 'errands', label: 'Быт', short: 'Быт', tone: 'slate' },
        { id: 'recovery', label: 'Восстановление', short: 'Восст.', tone: 'amber' },
        { id: 'drain', label: 'Потери', short: 'Потери', tone: 'red' },
    ];

    const CHRONO_CATEGORY_BY_ID = CHRONO_CATEGORIES.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
    }, {});

    // === Чистые функции ===

    function radiusForMinutes(minutes, maxMin, sizeScale) {
        const m = Math.max(0, Number(minutes) || 0);
        const M = Math.max(0, Number(maxMin) || 0);
        const scale = Math.max(0.62, Math.min(1, Number(sizeScale) || 1));
        const minR = r_min * (0.9 + scale * 0.1);
        const maxR = r_max * scale;
        if (M <= 0) return minR;
        const t = Math.min(1, m / M);
        return minR + (maxR - minR) * Math.sqrt(t);
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

    function inferActivityCategory(activity) {
        if (!activity) return 'focus';
        const explicit = String(activity.category || '').trim();
        if (CHRONO_CATEGORY_BY_ID[explicit]) return explicit;
        const text = String(activity.name || '').toLowerCase();
        if (/телефон|соц|scroll|ютуб|youtube|игр/.test(text)) return 'drain';
        if (/спорт|трен|бег|зал|йога|здоров/.test(text)) return 'health';
        if (/реб|сем|сын|доч|жена|муж/.test(text)) return 'care';
        if (/дом|убор|дела|магаз|быт/.test(text)) return 'errands';
        if (/сон|отдых|релакс|медитац/.test(text)) return 'recovery';
        if (/чтен|учеб|книг|курс/.test(text)) return 'growth';
        return 'focus';
    }

    function getCategoryMeta(categoryId) {
        return CHRONO_CATEGORY_BY_ID[categoryId] || CHRONO_CATEGORY_BY_ID.focus;
    }

    function buildCategoryBalance(activities, minutesByActivity) {
        const totals = {};
        let total = 0;
        (Array.isArray(activities) ? activities : []).forEach((activity) => {
            if (!activity || activity.archived) return;
            const minutes = Math.round(Number(minutesByActivity && minutesByActivity[activity.id]) || 0);
            if (minutes <= 0) return;
            const category = inferActivityCategory(activity);
            totals[category] = (totals[category] || 0) + minutes;
            total += minutes;
        });
        return CHRONO_CATEGORIES
            .map((category) => ({
                ...category,
                minutes: totals[category.id] || 0,
                pct: total > 0 ? Math.round(((totals[category.id] || 0) / total) * 100) : 0,
            }))
            .filter((item) => item.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);
    }

    function buildDayTimeline(entries, activities, date) {
        const activityById = new Map((Array.isArray(activities) ? activities : []).map((a) => [a.id, a]));
        return (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && entry.date === date)
            .map((entry) => {
                const activity = activityById.get(entry.activityId) || {};
                return {
                    ...entry,
                    activity,
                    category: inferActivityCategory(activity),
                };
            })
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    }

    function buildSmartSuggestions(activity, entries, activeDate) {
        if (!activity) return [];
        const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.activityId === activity.id);
        const sorted = list.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const suggestions = [];
        const last = sorted[0];
        if (last && Number(last.minutes) > 0) {
            suggestions.push({ id: 'last', label: `Повторить ${formatMinutes(last.minutes)}`, minutes: Number(last.minutes) });
        }
        const yesterday = Utils.addDays(activeDate || Utils.dateStr(), -1);
        const yesterdayTotal = list
            .filter((entry) => entry.date === yesterday)
            .reduce((sum, entry) => sum + (Number(entry.minutes) || 0), 0);
        if (yesterdayTotal > 0) {
            suggestions.push({ id: 'yesterday', label: `Как вчера: ${formatMinutes(yesterdayTotal)}`, minutes: yesterdayTotal });
        }
        const sameDayTotals = {};
        list.forEach((entry) => {
            if (!entry.date || entry.date === activeDate) return;
            sameDayTotals[entry.date] = (sameDayTotals[entry.date] || 0) + (Number(entry.minutes) || 0);
        });
        const totals = Object.values(sameDayTotals).filter((m) => m > 0).sort((a, b) => a - b);
        if (totals.length >= 3) {
            const median = Math.round(totals[Math.floor(totals.length / 2)] / 5) * 5;
            if (median > 0 && !suggestions.some((s) => s.minutes === median)) {
                suggestions.push({ id: 'typical', label: `Типично: ${formatMinutes(median)}`, minutes: median });
            }
        }
        return suggestions.slice(0, 3);
    }

    function buildWeeklyReport(activities, entries, snapshots, weekDates, minutesByActivity) {
        const total = Object.values(minutesByActivity || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
        if (total <= 0) return null;
        const balance = buildCategoryBalance(activities, minutesByActivity);
        const activeItems = (Array.isArray(activities) ? activities : [])
            .filter((activity) => activity && !activity.archived)
            .map((activity) => ({
                activity,
                minutes: Math.round(Number(minutesByActivity && minutesByActivity[activity.id]) || 0),
            }))
            .filter((item) => item.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);
        const breakdown = buildWeekBreakdown(entries, snapshots, weekDates);
        let bestDay = null;
        (Array.isArray(weekDates) ? weekDates : []).forEach((date) => {
            const value = breakdown[date]?.__total || 0;
            if (!bestDay || value > bestDay.minutes) bestDay = { date, minutes: value };
        });
        const focusMinutes = balance
            .filter((item) => item.id === 'focus' || item.id === 'growth' || item.id === 'health')
            .reduce((sum, item) => sum + item.minutes, 0);
        const drainMinutes = balance.find((item) => item.id === 'drain')?.minutes || 0;
        const score = Math.max(0, Math.min(100, Math.round((focusMinutes / total) * 100 - (drainMinutes / total) * 30 + 20)));
        const headline = score >= 75
            ? 'Неделя собрана'
            : score >= 50
                ? 'Неделя в балансе'
                : 'Неделя требует чистки';
        const recommendation = drainMinutes > focusMinutes * 0.35
            ? 'Срежь потери на 30 минут и отдай их фокусу.'
            : focusMinutes < total * 0.4
                ? 'Добавь один блок фокуса на 45 минут.'
                : 'Сохраняй ритм: фокус уже держит структуру недели.';
        return {
            total,
            score,
            headline,
            recommendation,
            top: activeItems[0] || null,
            bestDay,
            balance: balance.slice(0, 4),
        };
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

        return insights.slice(0, 3);
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
            Store.addChronoActivity({ name: preset.name, emoji: preset.emoji, category: preset.category });
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

    // UI-prefs: свёрнут ли блок «Сводка». Локальный per-device ключ, не client-data.
    const OVERVIEW_COLLAPSED_KEY = 'heys_planning_chrono_overview_collapsed_v1';

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
                                }, '−'),
                                h('button', {
                                    type: 'button',
                                    className: 'chrono-history__tiny-btn',
                                    onClick: () => onAdjustEntry(entry.id, 5),
                                    'aria-label': 'Добавить 5 минут',
                                }, '+'),
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

    function ChronoCategoryRow({ activity, onSave }) {
        const current = inferActivityCategory(activity);
        return h('div', { className: 'chrono-duration__category' },
            h('div', { className: 'chrono-duration__category-title' }, 'Категория'),
            h('div', { className: 'chrono-duration__category-list' },
                CHRONO_CATEGORIES.map((category) => h('button', {
                    key: category.id,
                    type: 'button',
                    className: 'chrono-duration__category-chip'
                        + (current === category.id ? ' active' : '')
                        + ' tone-' + category.tone,
                    onClick: () => onSave && onSave(category.id),
                }, category.short)),
            ),
        );
    }

    function ChronoSmartSuggestions({ suggestions, onPick }) {
        if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
        return h('div', { className: 'chrono-duration__smart' },
            h('div', { className: 'chrono-duration__smart-title' }, 'Умно'),
            h('div', { className: 'chrono-duration__smart-list' },
                suggestions.map((item) => h('button', {
                    key: item.id,
                    type: 'button',
                    className: 'chrono-duration__smart-chip',
                    onClick: () => onPick && onPick(item.minutes),
                }, item.label)),
            ),
        );
    }

    function ChronoDurationModal({ activity, currentMinutes, scopeLabel, timerRunning, tasks, projects, entries, activeDate, onAdd, onSetTarget, onCategory, onLink, onStartTimer, onClose }) {
        const [hourIdx, setHourIdx] = useState(0);
        const [minuteIdx, setMinuteIdx] = useState(30);
        const overlayRef = useRef(null);
        const smartSuggestions = useMemo(() => buildSmartSuggestions(activity, entries, activeDate),
            [activity && activity.id, entries, activeDate]);


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
                    h(ChronoSmartSuggestions, {
                        suggestions: smartSuggestions,
                        onPick: applyPreset,
                    }),
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
                    h(ChronoCategoryRow, {
                        activity,
                        onSave: onCategory,
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

    const DRAG_ACTIVATE_PX = 10;  // палец должен пройти ≥ этого расстояния прежде чем включится drag mode

    function ChronoBubble({ activity, minutes, maxMin, sizeScale, scope, badge, onClick, onLongPress,
                            baseX, baseY, bubbleRadius, onDragStart, onDragMove, onDragEnd }) {
        const diameter = Math.round(radiusForMinutes(minutes, maxMin, sizeScale) * 2);
        const bg = colorForActivity(activity.hue, minutes, maxMin);
        const seed = hashSeed(activity.id);
        // Float уменьшен: 2-3px амплитуда (было 4-7), 12-17s период (было 8-12).
        // Цель — лёгкое «дыхание», а не плавание; кружки удерживают radial positions.
        const delay = ((seed % 100) / 100) * -12;
        const dur = 12 + (seed % 6);
        const fx = 1 + (seed % 2) * 0.5;
        const fy = 1 + ((seed >> 3) % 2) * 0.5;
        const progress = getProgress(activity, minutes, scope);
        const hasGoal = progress !== null;
        const progressDeg = hasGoal ? Math.round(progress.value * 360) : 0;
        const ringColor = ringColorForProgress(progress, activity.hue);
        const goalKind = progress ? progress.kind : null;
        const nameFontSize = Math.max(10, Math.min(20, diameter * 0.125));
        const timeFontSize = Math.max(12, Math.min(23, diameter * 0.145));

        const pressTimer = useRef(null);
        const longFiredRef = useRef(false);
        const startPosRef = useRef({ x: 0, y: 0 });
        // Drag state на ref — pointermove обрабатывается часто и не должен
        // re-render'ить bubble; updates идут наверх в ChronoCloud через onDragMove.
        const dragRef = useRef({ active: false, suppressClick: false, rafId: 0, lastDx: 0, lastDy: 0 });

        const clearPress = useCallback(() => {
            if (pressTimer.current) {
                clearTimeout(pressTimer.current);
                pressTimer.current = null;
            }
        }, []);

        const handlePointerDown = useCallback((e) => {
            longFiredRef.current = false;
            startPosRef.current = { x: e.clientX || 0, y: e.clientY || 0 };
            dragRef.current.active = false;
            dragRef.current.suppressClick = false;
            dragRef.current.lastDx = 0;
            dragRef.current.lastDy = 0;
            clearPress();
            pressTimer.current = setTimeout(() => {
                longFiredRef.current = true;
                pressTimer.current = null;
                if (typeof onLongPress === 'function') onLongPress(activity);
            }, LONG_PRESS_MS);
            try {
                if (e.pointerId !== undefined && e.currentTarget && e.currentTarget.setPointerCapture) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                }
            } catch (_) { /* noop */ }
        }, [activity, onLongPress, clearPress]);

        const handlePointerMove = useCallback((e) => {
            const dx = (e.clientX || 0) - startPosRef.current.x;
            const dy = (e.clientY || 0) - startPosRef.current.y;
            const absDist = Math.hypot(dx, dy);

            // Активация drag mode при превышении порога — отменяет long-press timer и click.
            if (!dragRef.current.active) {
                if (absDist < DRAG_ACTIVATE_PX) return;
                clearPress();
                dragRef.current.active = true;
                if (typeof onDragStart === 'function') {
                    onDragStart(activity.id, baseX || 0, baseY || 0, bubbleRadius || (diameter / 2));
                }
            }
            // Throttle через rAF — pointermove может ~120fps на trackpad, нам хватит 60.
            dragRef.current.lastDx = dx;
            dragRef.current.lastDy = dy;
            if (!dragRef.current.rafId && typeof onDragMove === 'function') {
                dragRef.current.rafId = requestAnimationFrame(() => {
                    dragRef.current.rafId = 0;
                    onDragMove(dragRef.current.lastDx, dragRef.current.lastDy);
                });
            }
        }, [activity, baseX, baseY, bubbleRadius, diameter, onDragStart, onDragMove, clearPress]);

        const handlePointerEnd = useCallback((e) => {
            clearPress();
            if (dragRef.current.rafId) {
                cancelAnimationFrame(dragRef.current.rafId);
                dragRef.current.rafId = 0;
            }
            try {
                if (e && e.pointerId !== undefined && e.currentTarget && e.currentTarget.releasePointerCapture) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
            } catch (_) { /* noop */ }
            if (dragRef.current.active) {
                dragRef.current.active = false;
                dragRef.current.suppressClick = true;
                if (typeof onDragEnd === 'function') onDragEnd();
            }
        }, [clearPress, onDragEnd]);

        const handleClick = useCallback((e) => {
            if (dragRef.current.suppressClick) {
                dragRef.current.suppressClick = false;
                e.preventDefault();
                return;
            }
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
                '--bubble-name-font': nameFontSize.toFixed(1) + 'px',
                '--bubble-time-font': timeFontSize.toFixed(1) + 'px',
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

    function ChronoOverviewPanel({ insights, balance }) {
        const list = Array.isArray(insights) ? insights : [];
        const top = list.find((item) => item && item.kind === 'top');
        const alerts = list.filter((item) => item && item.kind !== 'top').slice(0, 2);
        const categories = Array.isArray(balance) ? balance.filter((item) => item && item.minutes > 0).slice(0, 4) : [];
        if (!top && categories.length === 0 && alerts.length === 0) return null;

        // По дефолту свёрнуто; локальный UI-prefs ключ, не client-data (не синкается).
        const [collapsed, setCollapsed] = useState(() => {
            try {
                const stored = localStorage.getItem(OVERVIEW_COLLAPSED_KEY);
                return stored === null ? true : stored === '1';
            } catch (e) { return true; }
        });
        const toggle = useCallback(() => {
            setCollapsed((prev) => {
                const next = !prev;
                try { localStorage.setItem(OVERVIEW_COLLAPSED_KEY, next ? '1' : '0'); }
                catch (e) { /* noop */ }
                return next;
            });
        }, []);

        return h('div', {
            className: 'chrono-overview' + (collapsed ? ' is-collapsed' : ''),
            'aria-label': 'Сводка хронометража',
        },
            h('button', {
                type: 'button',
                className: 'chrono-overview__toggle',
                onClick: toggle,
                'aria-expanded': !collapsed,
                'aria-controls': 'chrono-overview-body',
            },
                h('span', { className: 'chrono-overview__toggle-label' }, 'Сводка'),
                top && collapsed && h('span', { className: 'chrono-overview__toggle-hint' }, top.value),
                h('span', { className: 'chrono-overview__toggle-chevron', 'aria-hidden': 'true' }, '▾'),
            ),
            !collapsed && h('div', { id: 'chrono-overview-body', className: 'chrono-overview__body' },
                h('div', { className: 'chrono-overview__top' },
                    h('span', { className: 'chrono-overview__eyebrow' }, 'Топ'),
                    h('strong', { className: 'chrono-overview__top-value' }, top ? top.value : 'Нет записей'),
                    top && h('span', { className: 'chrono-overview__top-detail' }, top.detail),
                    alerts.length > 0 && h('div', { className: 'chrono-overview__alerts' },
                        alerts.map((item) => h('span', {
                            key: item.kind,
                            className: 'chrono-overview__alert is-' + item.kind,
                            title: item.detail,
                        }, `${item.title}: ${item.value}`)),
                    ),
                ),
                categories.length > 0 && h('div', { className: 'chrono-overview__balance' },
                    h('div', { className: 'chrono-overview__stack', 'aria-hidden': 'true' },
                        categories.map((item) => h('span', {
                            key: item.id,
                            className: 'chrono-overview__segment tone-' + item.tone,
                            style: { width: Math.max(5, item.pct) + '%' },
                            title: `${item.label}: ${formatMinutes(item.minutes)}`,
                        })),
                    ),
                    h('div', { className: 'chrono-overview__legend' },
                        categories.map((item) => h('span', {
                            key: item.id,
                            className: 'chrono-overview__chip tone-' + item.tone,
                            title: `${item.label}: ${formatMinutes(item.minutes)}`,
                        },
                            h('i', { className: 'chrono-overview__dot', 'aria-hidden': 'true' }),
                            h('span', { className: 'chrono-overview__chip-label' }, item.short),
                            h('strong', null, `${item.pct}%`),
                        )),
                    ),
                ),
            ),
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

    function ChronoCategoryBalance({ balance }) {
        if (!Array.isArray(balance) || balance.length === 0) return null;
        return h('div', { className: 'chrono-category-balance', 'aria-label': 'Баланс категорий' },
            balance.slice(0, 5).map((item) => h('div', {
                key: item.id,
                className: 'chrono-category-balance__item tone-' + item.tone,
                title: `${item.label}: ${formatMinutes(item.minutes)}`,
            },
                h('span', { className: 'chrono-category-balance__label' }, item.short),
                h('span', { className: 'chrono-category-balance__bar' },
                    h('span', { className: 'chrono-category-balance__fill', style: { width: Math.max(4, item.pct) + '%' } }),
                ),
                h('span', { className: 'chrono-category-balance__value' }, `${item.pct}%`),
            )),
        );
    }

    function ChronoWeeklyReport({ report }) {
        if (!report) return null;
        return h('div', { className: 'chrono-weekly-report', 'aria-label': 'Отчёт недели' },
            h('div', { className: 'chrono-weekly-report__head' },
                h('div', null,
                    h('div', { className: 'chrono-weekly-report__eyebrow' }, 'Отчёт недели'),
                    h('div', { className: 'chrono-weekly-report__title' }, report.headline),
                ),
                h('div', { className: 'chrono-weekly-report__score' }, report.score),
            ),
            h('div', { className: 'chrono-weekly-report__grid' },
                h('div', null,
                    h('span', { className: 'chrono-weekly-report__label' }, 'Всего'),
                    h('strong', null, formatMinutes(report.total)),
                ),
                report.top && h('div', null,
                    h('span', { className: 'chrono-weekly-report__label' }, 'Главное'),
                    h('strong', null, `${report.top.activity.emoji || ''} ${report.top.activity.name}`),
                ),
                report.bestDay && h('div', null,
                    h('span', { className: 'chrono-weekly-report__label' }, 'Лучший день'),
                    h('strong', null, `${formatDateLabel(report.bestDay.date)} · ${formatMinutes(report.bestDay.minutes)}`),
                ),
            ),
            h('div', { className: 'chrono-weekly-report__recommendation' }, report.recommendation),
        );
    }

    function ChronoTimelineModal({ date, entries, activities, onClose, onPickActivity }) {
        const overlayRef = useRef(null);
        const timeline = useMemo(() => buildDayTimeline(entries, activities, date), [entries, activities, date]);

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-timeline', () => onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape') onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-timeline-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-timeline', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, 'Лента дня · ', formatDateLabel(date)),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-timeline__body' },
                    timeline.length === 0 && h('div', { className: 'chrono-timeline__empty' }, 'Записей за день пока нет.'),
                    timeline.map((entry) => {
                        const activity = entry.activity || {};
                        const category = getCategoryMeta(entry.category);
                        return h('button', {
                            key: entry.id,
                            type: 'button',
                            className: 'chrono-timeline__row tone-' + category.tone,
                            onClick: () => activity.id && onPickActivity && onPickActivity(activity),
                        },
                            h('span', { className: 'chrono-timeline__time' }, formatEntryTime(entry.createdAt).replace('сегодня ', '') || formatDateLabel(entry.date)),
                            h('span', { className: 'chrono-timeline__dot' }),
                            h('span', { className: 'chrono-timeline__main' },
                                h('span', { className: 'chrono-timeline__name' }, `${activity.emoji || ''} ${activity.name || 'Занятие'}`),
                                h('span', { className: 'chrono-timeline__cat' }, category.label),
                            ),
                            h('strong', { className: 'chrono-timeline__minutes' }, formatMinutes(entry.minutes)),
                        );
                    }),
                ),
            ),
        );
    }

    // Phyllotaxis spiral с collision-avoidance: углы — золотое сечение (137.5°),
    // а radius каждого кружка раздвигается наружу пока он не перестанет
    // перекрывать ранее уложенные. Сортировка по minutes desc → крупный
    // садится в (0,0), последующие закручиваются спиралью по убыванию.
    const PHYLLOTAXIS_GOLDEN_ANGLE = 137.5 * Math.PI / 180;
    const BUBBLE_GAP = 10;          // compact visible air между bubble'ами
    const DRAG_BUBBLE_GAP = 22;     // extra air пока палец ведёт bubble
    const RELEASE_BUBBLE_GAP = 18;  // extra air на медленном возврате
    const RING_PADDING = 8;         // .chrono-bubble-wrap.has-target + визуальный stroke/shadow
    const PHYLLOTAXIS_STEP = 4;     // шаг наружу при коллизии (px)
    const PHYLLOTAXIS_MAX_ATTEMPTS = 400;

    function sizeScaleForCount(count, halfW) {
        const n = Math.max(1, Number(count) || 1);
        const byCount = n <= 4 ? 1 : Math.max(0.68, 1 - (n - 4) * 0.055);
        const byWidth = halfW > 0 ? Math.max(0.7, Math.min(1, halfW / 190)) : 1;
        return Math.max(0.62, Math.min(1, byCount, byWidth));
    }

    function computeRadialLayout(activities, minutesByActivity, maxMin, halfW, sizeScale) {
        const sorted = activities.slice().sort((a, b) =>
            (minutesByActivity[b.id] || 0) - (minutesByActivity[a.id] || 0)
        );
        if (sorted.length === 0) return { positioned: [], cloudHeight: 240 };

        const allRadii = sorted.map((a) =>
            radiusForMinutes(minutesByActivity[a.id] || 0, maxMin, sizeScale) + RING_PADDING
        );
        const avgR = allRadii.reduce((s, r) => s + r, 0) / allRadii.length;
        const maxBubbleR = Math.max.apply(null, allRadii);
        let orbitScale = avgR * 1.45 + BUBBLE_GAP;
        const useBounds = halfW > 0;
        const outerCount = Math.max(1, sorted.length - 1);
        const verticalRows = Math.max(1, Math.ceil(outerCount / 2));
        const layoutHalfH = Math.max(
            190,
            maxBubbleR + (allRadii[1] || maxBubbleR) + BUBBLE_GAP + CLOUD_SAFE_PADDING + 24,
            maxBubbleR + verticalRows * (avgR * 0.85 + BUBBLE_GAP)
        );

        const placed = [];
        let maxExtent = 0;
        let maxYExtent = 0;

        sorted.forEach((activity, i) => {
            const bubbleR = allRadii[i];
            const theta = i * PHYLLOTAXIS_GOLDEN_ANGLE;
            let r = i === 0 ? 0 : orbitScale * Math.sqrt(i);

            for (let attempt = 0; attempt < PHYLLOTAXIS_MAX_ATTEMPTS; attempt += 1) {
                let cx = Math.cos(theta) * r;
                let cy = Math.sin(theta) * r;
                if (useBounds) {
                    const c = clampToBounds(cx, cy, bubbleR, halfW, layoutHalfH);
                    cx = c.x;
                    cy = c.y;
                }
                let collide = false;
                for (let j = 0; j < placed.length; j += 1) {
                    const p = placed[j];
                    const dx = cx - p.x;
                    const dy = cy - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < bubbleR + p.radius + BUBBLE_GAP) {
                        collide = true;
                        break;
                    }
                }
                if (!collide) {
                    const x = Math.round(cx);
                    const y = Math.round(cy);
                    placed.push({ activity, x, y, radius: bubbleR });
                    const ext = Math.max(Math.abs(x), Math.abs(y)) + bubbleR;
                    if (ext > maxExtent) maxExtent = ext;
                    const yExt = Math.abs(y) + bubbleR;
                    if (yExt > maxYExtent) maxYExtent = yExt;
                    return;
                }
                r += PHYLLOTAXIS_STEP;
            }
            // Fallback — кладём на clamped boundary даже если overlap (better than выезд за экран).
            let cx = Math.cos(theta) * r;
            let cy = Math.sin(theta) * r;
            if (useBounds) {
                const c = clampToBounds(cx, cy, bubbleR, halfW, layoutHalfH);
                cx = c.x;
                cy = c.y;
            }
            placed.push({ activity, x: Math.round(cx), y: Math.round(cy), radius: bubbleR });
            const ext = Math.max(Math.abs(cx), Math.abs(cy)) + bubbleR;
            if (ext > maxExtent) maxExtent = ext;
            const yExt = Math.abs(cy) + bubbleR;
            if (yExt > maxYExtent) maxYExtent = yExt;
        });

        let cloudHeight = Math.max(280, maxYExtent * 2 + 48);
        if (!hasBubbleOverlap(placed, BUBBLE_GAP)) {
            return { positioned: placed, cloudHeight };
        }
        let settled = placed;
        const centerLocks = placed[0] ? { [placed[0].activity.id]: true } : null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            settled = reflowAroundOverrides(placed, {}, halfW, cloudHeight / 2, centerLocks, BUBBLE_GAP);
            if (!hasBubbleOverlap(settled, BUBBLE_GAP)) break;
            cloudHeight += Math.max(48, maxBubbleR * 0.6);
        }
        return { positioned: settled, cloudHeight };
    }

    function hasBubbleOverlap(positioned, gap) {
        const minGap = Number.isFinite(gap) ? gap : BUBBLE_GAP;
        for (let i = 0; i < positioned.length; i += 1) {
            for (let j = i + 1; j < positioned.length; j += 1) {
                const a = positioned[i];
                const b = positioned[j];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (dist < a.radius + b.radius + minGap - 0.5) return true;
            }
        }
        return false;
    }

    // Force-directed reflow: симметричное отталкивание двух bubbles на каждом
    // обнаруженном overlap'е. Даже dragged/override bubble — мягкий якорь:
    // если точка пальца ведёт к наслоению у safe-zone, сам bubble чуть сдвинется
    // в ближайшее свободное место, как пузырёк в воде.
    function reflowAroundOverrides(positioned, overrides, halfW, halfH, lockedIds, gap) {
        const safeOverrides = overrides || {};
        const locks = lockedIds || {};
        const minGap = Number.isFinite(gap) ? gap : BUBBLE_GAP;
        const pos = positioned.map((p) => {
            const ov = safeOverrides[p.activity.id];
            if (!ov) return { ...p };
            const clamped = (halfW > 0 && halfH > 0)
                ? clampToBounds(ov.x, ov.y, p.radius, halfW, halfH)
                : ov;
            return { ...p, x: clamped.x, y: clamped.y };
        });
        const useBounds = halfW > 0 && halfH > 0;
        const RELAX_FACTOR = 0.85;

        for (let iter = 0; iter < 260; iter += 1) {
            let moved = false;
            for (let i = 0; i < pos.length; i += 1) {
                for (let j = i + 1; j < pos.length; j += 1) {
                    const dx = pos[i].x - pos[j].x;
                    const dy = pos[i].y - pos[j].y;
                    const dist = Math.hypot(dx, dy);
                    const minDist = pos[i].radius + pos[j].radius + minGap;
                    if (dist >= minDist) continue;

                    const overlap = (minDist - dist) * RELAX_FACTOR;
                    let ux;
                    let uy;
                    if (dist > 0.001) {
                        ux = dx / dist;
                        uy = dy / dist;
                    } else {
                        ux = 0; uy = -1;  // совпали → толкаем по вертикали
                    }
                    const iLocked = !!locks[pos[i].activity.id];
                    const jLocked = !!locks[pos[j].activity.id];
                    let shareI = 0.5;
                    let shareJ = 0.5;
                    if (iLocked && !jLocked) { shareI = 0; shareJ = 1; }
                    else if (!iLocked && jLocked) { shareI = 1; shareJ = 0; }
                    pos[i].x += ux * overlap * shareI;
                    pos[i].y += uy * overlap * shareI;
                    pos[j].x -= ux * overlap * shareJ;
                    pos[j].y -= uy * overlap * shareJ;
                    moved = true;
                }
            }
            // Clamp всех в safe zone после итерации push'ей.
            if (useBounds) {
                for (let i = 0; i < pos.length; i += 1) {
                    const c = clampToBounds(pos[i].x, pos[i].y, pos[i].radius, halfW, halfH);
                    if (c.x !== pos[i].x || c.y !== pos[i].y) {
                        pos[i].x = c.x;
                        pos[i].y = c.y;
                        moved = true;
                    }
                }
            }
            if (!moved) break;
        }
        return pos;
    }

    const CLOUD_SAFE_PADDING = 28;  // safe zone от края контейнера, в котором bubble не должен оказаться

    function clampToBounds(x, y, radius, halfW, halfH) {
        if (halfW <= 0 || halfH <= 0) return { x, y };
        const maxX = Math.max(0, halfW - radius - CLOUD_SAFE_PADDING);
        const maxY = Math.max(0, halfH - radius - CLOUD_SAFE_PADDING);
        return {
            x: Math.max(-maxX, Math.min(maxX, x)),
            y: Math.max(-maxY, Math.min(maxY, y)),
        };
    }


    const DRAG_RELEASE_DURATION_MS = 3800;  // медленный liquid-return на новую орбиту

    function ChronoCloud({ activities, minutesByActivity, maxMin, scope, recentBadge, onPick, onLongPress, hasInactive, onDragDelete }) {
        if (!activities.length) {
            const text = hasInactive
                ? 'Нажмите на занятие выше, чтобы записать время — кружок появится здесь и будет расти.'
                : 'Нажмите «+ Новая», чтобы добавить занятие.';
            return h('div', { className: 'chrono-empty' }, text);
        }

        // Измерение ширины контейнера для clamp'а позиций в safe zone.
        const containerRef = useRef(null);
        const [containerWidth, setContainerWidth] = useState(0);
        useEffect(() => {
            const el = containerRef.current;
            if (!el) return undefined;
            const update = () => setContainerWidth(el.clientWidth || 0);
            update();
            if (typeof ResizeObserver !== 'undefined') {
                const ro = new ResizeObserver(update);
                ro.observe(el);
                return () => ro.disconnect();
            }
            window.addEventListener('resize', update);
            return () => window.removeEventListener('resize', update);
        }, []);

        const [drag, setDrag] = useState(null);
        const [slotOverrides, setSlotOverrides] = useState({});

        const halfW = containerWidth / 2;
        const sizeScale = sizeScaleForCount(activities.length, halfW);
        // Базовый layout — чистый phyllotaxis с adaptive scale к safe zone.
        // Передаём halfW, чтобы orbits вписывались по ширине контейнера.
        const { positioned, cloudHeight } = useMemo(() =>
            computeRadialLayout(activities, minutesByActivity, maxMin, halfW, sizeScale),
            [activities, minutesByActivity, maxMin, halfW, sizeScale]
        );

        const dragHeightReserve = drag ? (drag.releasing ? 72 : 112) : 0;
        const displayCloudHeight = cloudHeight + dragHeightReserve;
        const halfH = displayCloudHeight / 2;

        // Permanent overrides из drag-release + временный override активного drag.
        // Во время drag/release сам dragged bubble locked: он идёт за пальцем
        // или по release-анимации, а остальные bubble'ы ищут места вокруг него.
        const displayed = useMemo(
            () => {
                const overrides = { ...slotOverrides };
                const lockedIds = {};
                if (drag) {
                    overrides[drag.id] = clampToBounds(
                        drag.baseX + drag.dx,
                        drag.baseY + drag.dy,
                        drag.radius,
                        halfW,
                        halfH
                    );
                    lockedIds[drag.id] = true;
                }
                const activeGap = drag
                    ? (drag.releasing ? RELEASE_BUBBLE_GAP : DRAG_BUBBLE_GAP)
                    : BUBBLE_GAP;
                return reflowAroundOverrides(positioned, overrides, halfW, halfH, lockedIds, activeGap);
            },
            [positioned, slotOverrides, halfW, halfH, drag]
        );
        const releaseRafRef = useRef(0);
        const trashRef = useRef(null);

        useEffect(() => () => {
            if (releaseRafRef.current) cancelAnimationFrame(releaseRafRef.current);
        }, []);

        // При изменении минут (например, после "+30м" — кружок вырос в радиусе)
        // или набора активностей — старые overrides становятся невалидными:
        // кружок с новым размером может перекрывать соседей. Сбрасываем.
        // Signature по чистому input layout'а (без overrides), чтобы сам drop
        // не триггерил сброс (drop меняет slotOverrides, но id+minutes — нет).
        const layoutSignatureRef = useRef('');
        const inputSignature = activities.map((a) =>
            a.id + ':' + Math.round(radiusForMinutes(minutesByActivity[a.id] || 0, maxMin, sizeScale))
        ).join('|');
        useEffect(() => {
            if (layoutSignatureRef.current && layoutSignatureRef.current !== inputSignature) {
                setSlotOverrides({});
            }
            layoutSignatureRef.current = inputSignature;
        }, [inputSignature]);

        const handleDragStart = useCallback((id, baseX, baseY, radius) => {
            if (releaseRafRef.current) {
                cancelAnimationFrame(releaseRafRef.current);
                releaseRafRef.current = 0;
            }
            setDrag({ id, baseX, baseY, dx: 0, dy: 0, radius, releasing: false });
        }, []);

        const handleDragMove = useCallback((dx, dy) => {
            setDrag((prev) => {
                if (!prev || prev.releasing) return prev;
                let overTrash = false;
                if (trashRef.current && containerRef.current) {
                    const cRect = containerRef.current.getBoundingClientRect();
                    const cx = cRect.left + cRect.width / 2 + prev.baseX + dx;
                    const cy = cRect.top + cRect.height / 2 + prev.baseY + dy;
                    const tRect = trashRef.current.getBoundingClientRect();
                    overTrash = cx >= tRect.left && cx <= tRect.right
                        && cy >= tRect.top && cy <= tRect.bottom;
                }
                return { ...prev, dx, dy, overTrash };
            });
        }, []);

        const handleDragEnd = useCallback(() => {
            setDrag((prev) => {
                if (!prev) return prev;
                if (prev.overTrash) {
                    if (typeof onDragDelete === 'function') onDragDelete(prev.id);
                    return null;
                }
                // Target radius = phyllotaxis-orbit размера этого кружка (его «слой»).
                // Большой (phyloIdx=0) → centr, маленькие → внешние orbit'ы.
                const idealEntry = positioned.find((p) => p.activity.id === prev.id);
                const targetR = idealEntry ? Math.hypot(idealEntry.x, idealEntry.y) : Math.hypot(prev.baseX, prev.baseY);
                // Angle берём из сырой позиции пальца (без safe-zone clamp) — куда
                // оттянул, туда и возвращается, даже если оттянул далеко за край.
                const releaseX = prev.baseX + prev.dx;
                const releaseY = prev.baseY + prev.dy;
                const releaseDist = Math.hypot(releaseX, releaseY);
                const angle = releaseDist < 0.001
                    ? Math.atan2(prev.baseY, prev.baseX)
                    : Math.atan2(releaseY, releaseX);
                let newX = targetR === 0 ? 0 : Math.round(Math.cos(angle) * targetR);
                let newY = targetR === 0 ? 0 : Math.round(Math.sin(angle) * targetR);
                // Если на этой орбите целевая точка выходит за safe zone — clamp.
                const finalClamp = clampToBounds(newX, newY, prev.radius, halfW, halfH);
                newX = finalClamp.x;
                newY = finalClamp.y;
                const targetDx = newX - prev.baseX;
                const targetDy = newY - prev.baseY;
                const startDx = prev.dx;
                const startDy = prev.dy;
                const startTs = performance.now();
                const releaseId = prev.id;
                const step = (now) => {
                    const t = Math.min(1, (now - startTs) / DRAG_RELEASE_DURATION_MS);
                    // Медленный smoothstep: меньше рывка в начале и длинный мягкий ход.
                    const eased = t * t * (3 - 2 * t);
                    const ndx = startDx + (targetDx - startDx) * eased;
                    const ndy = startDy + (targetDy - startDy) * eased;
                    if (t >= 1) {
                        releaseRafRef.current = 0;
                        // Коммитим новую позицию в overrides + чистим drag атомарно
                        // (React batch'ит оба update в одном render — slot
                        // переедет на newX/Y без визуального jump'а).
                        setSlotOverrides((cur) => ({ ...cur, [releaseId]: { x: newX, y: newY } }));
                        setDrag(null);
                        return;
                    }
                    setDrag((cur) => (cur ? { ...cur, dx: ndx, dy: ndy } : cur));
                    releaseRafRef.current = requestAnimationFrame(step);
                };
                releaseRafRef.current = requestAnimationFrame(step);
                return { ...prev, releasing: true };
            });
        }, [halfW, halfH, positioned, onDragDelete]);

        const releasing = !!(drag && drag.releasing);

        // Drag-движение НЕ clamp'ится — пользователь может оттянуть кружок куда угодно
        // (за safe zone, в любую сторону). Clamp применяется только к release-target
        // и к layout/reflow для resting positions. Это даёт ощущение "оттянуть подальше
        // и отпустить — пузырь сам найдёт дорогу домой".

        return h('div', { className: 'chrono-cloud' },
            h('div', {
                ref: containerRef,
                className: 'chrono-cloud__items chrono-cloud__items--radial' + (releasing ? ' is-releasing' : ''),
                style: { '--cloud-height': displayCloudHeight + 'px' },
            },
                displayed.map(({ activity, x: slotX, y: slotY, radius }) => {
                    const isDragged = drag && drag.id === activity.id;
                    return h('div', {
                        key: activity.id,
                        className: 'chrono-cloud__slot' + (isDragged ? ' is-dragged' : ''),
                        style: {
                            '--slot-x': slotX + 'px',
                            '--slot-y': slotY + 'px',
                            '--drag-dx': '0px',
                            '--drag-dy': '0px',
                        },
                    },
                        h(ChronoBubble, {
                            activity,
                            minutes: minutesByActivity[activity.id] || 0,
                            maxMin,
                            sizeScale,
                            scope,
                            badge: recentBadge && recentBadge.activityId === activity.id ? recentBadge : null,
                            onClick: onPick,
                            onLongPress,
                            baseX: slotX,
                            baseY: slotY,
                            bubbleRadius: radius,
                            onDragStart: handleDragStart,
                            onDragMove: handleDragMove,
                            onDragEnd: handleDragEnd,
                        }),
                    );
                }),
                h('div', {
                    ref: trashRef,
                    className: 'chrono-cloud__trash'
                        + (drag && !drag.releasing ? ' is-dragging' : '')
                        + (drag && drag.overTrash ? ' is-active' : ''),
                    'aria-hidden': 'true',
                },
                    h('svg', {
                        width: 22, height: 22, viewBox: '0 0 22 22', fill: 'none',
                    },
                        h('path', {
                            d: 'M4 6h14M9 6V4h4v2M9 10v6M13 10v6M5 6l1 12h10L17 6',
                            stroke: 'currentColor',
                            'stroke-width': '1.8',
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round',
                        }),
                    ),
                ),
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
        const [timelineOpen, setTimelineOpen] = useState(false);
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

        const categoryBalance = useMemo(() => buildCategoryBalance(visibleActivities, minutesByActivity),
            [visibleActivities, minutesByActivity]);

        const weeklyReport = useMemo(() => {
            if (scope !== 'week') return null;
            return buildWeeklyReport(visibleActivities, entries, snapshots, dates, minutesByActivity);
        }, [scope, visibleActivities, entries, snapshots, dates, minutesByActivity]);

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
                h('button', {
                    type: 'button',
                    className: 'chrono-scope-bar__icon-btn',
                    onClick: () => setTimelineOpen(true),
                    'aria-label': 'Лента дня',
                    title: 'Лента дня',
                }, '◷'),
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
            h(ChronoOverviewPanel, { insights, balance: categoryBalance }),
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
                hasInactive: partition.inactive.length > 0,
                onDragDelete: (id) => {
                    const a = activities.find((x) => x.id === id);
                    if (a) setDeleteTarget(a);
                },
            }),
            scope === 'week' && h(ChronoWeeklyReport, { report: weeklyReport }),
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
                entries,
                activeDate,
                onStartTimer: handleStartTimer,
                onAdd: handleAddMinutes,
                onCategory: (category) => state.updateChronoActivity(durationTarget.id, { category }),
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
            timelineOpen && h(ChronoTimelineModal, {
                date: activeDate,
                entries,
                activities,
                onPickActivity: (activity) => {
                    setTimelineOpen(false);
                    setDurationTarget(activity);
                },
                onClose: () => setTimelineOpen(false),
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
        sizeScaleForCount,
        computeRadialLayout,
        reflowAroundOverrides,
        hasBubbleOverlap,
        buildDailySeries,
        buildWeekBreakdown,
        buildChronoPlanFacts,
        buildChronoWeekInsights,
        buildCategoryBalance,
        buildDayTimeline,
        buildSmartSuggestions,
        buildWeeklyReport,
        inferActivityCategory,
        getCategoryMeta,
        CHRONO_PRESETS,
        CHRONO_EMOJI_PALETTE,
        CHRONO_CATEGORIES,
        TIMER_PRESETS,
        r_min,
        r_max,
        seedDefaultChronoOnce,
    };
})();
