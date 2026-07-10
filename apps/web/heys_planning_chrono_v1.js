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
    const MIN_BUBBLE_SIZE_SCALE = 0.44;

    const CHRONO_EMOJI_PALETTE = [
        '👶', '🎨', '💻', '📱', '🏃', '📚', '🧹', '😴',
        '🍳', '🚗', '🛒', '💤', '🎵', '🎮', '🍷', '🧘',
        '☕', '🎯', '💊', '🚿', '💼', '📞', '✈️', '🎬',
        '🍕', '🌱', '📝', '🐶', '🎓', '🧠', '❤️', '⏱️',
    ];

    const DEFAULT_ACTIVITIES = [
        { name: 'Работа', emoji: '💼', category: 'focus' },
        { name: 'Учёба', emoji: '🎓', category: 'growth' },
        { name: 'Домашние дела', emoji: '🧹', category: 'errands' },
        { name: 'Дорога', emoji: '🚗', category: 'errands' },
        { name: 'Семья', emoji: '👨‍👩‍👧', category: 'care' },
        { name: 'Общение', emoji: '💬', category: 'care' },
        { name: 'Телефон / соцсети', emoji: '📱', category: 'drain' },
        { name: 'Спорт', emoji: '🏃', category: 'health' },
        { name: 'Чтение', emoji: '📚', category: 'growth' },
        { name: 'Отдых', emoji: '😴', category: 'recovery' },
    ];

    const TOAST_TIMEOUT_MS = 5000;
    const CHRONO_DAY_START_HOUR = Planning.Constants?.CALENDAR_START_HOUR || 3;

    function traceChronoUi(event, payload, level) {
        try {
            const clientId = HEYS.currentClientId
                || (HEYS.cloud && typeof HEYS.cloud.getClientId === 'function' ? HEYS.cloud.getClientId() : '');
            const flowId = payload?.flowId
                || (HEYS.LogTrace && typeof HEYS.LogTrace.lastFlowId === 'function'
                    ? HEYS.LogTrace.lastFlowId('[HEYS.chrono.trace]', 5000)
                    : null);
            const body = {
                event,
                source: 'chrono-ui',
                client: String(clientId || '').slice(0, 8) || null,
                flowId,
                ...(payload || {}),
            };
            if (HEYS.LogTrace && typeof HEYS.LogTrace.trace === 'function') {
                HEYS.LogTrace.trace(level || 'info', '[HEYS.chrono.trace]', body);
                return;
            }
            const fn = level === 'warn' ? console.warn : (level === 'error' ? console.error : console.info);
            fn('[HEYS.chrono.trace]', body);
            setTimeout(() => {
                try {
                    if (HEYS.LogTrace && typeof HEYS.LogTrace.flush === 'function') HEYS.LogTrace.flush();
                } catch (_) { /* noop */ }
            }, 300);
        } catch (_) { /* trace must never break chrono UI */ }
    }

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
        const scale = Math.max(MIN_BUBBLE_SIZE_SCALE, Math.min(1, Number(sizeScale) || 1));
        const minR = r_min * (scale >= 0.62 ? (0.9 + scale * 0.1) : (0.55 + scale * 0.45));
        const maxR = Math.max(minR, r_max * scale);
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

    function formatClockTime(ms) {
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function parseClockMinutes(value) {
        const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return hh * 60 + mm;
    }

    function buildDateTimeMs(date, clock) {
        const minutes = parseClockMinutes(clock);
        if (minutes == null || !date) return null;
        const base = new Date(`${date}T00:00:00`);
        if (Number.isNaN(base.getTime())) return null;
        base.setMinutes(minutes);
        if (minutes < CHRONO_DAY_START_HOUR * 60) {
            base.setDate(base.getDate() + 1);
        }
        return base.getTime();
    }

    function resolveChronoEntryEndMs(entry) {
        if (!entry || !entry.createdAt) return NaN;
        const endMs = new Date(entry.createdAt).getTime();
        const displayEndMs = entry.displayEndAt ? new Date(entry.displayEndAt).getTime() : NaN;
        if ((entry.displayGroupId || entry.parallelGroupId) && Number.isFinite(displayEndMs)) return displayEndMs;
        const explicitStartMs = entry.at ? new Date(entry.at).getTime() : NaN;
        const displayStartMs = entry.displayStartAt ? new Date(entry.displayStartAt).getTime() : NaN;
        const startMs = Number.isFinite(displayStartMs)
            ? displayStartMs
            : (Number.isFinite(explicitStartMs) ? explicitStartMs : NaN);
        const minutes = Math.max(0, Number(entry.minutes) || 0);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && minutes > 0) {
            const expectedEndMs = startMs + minutes * 60000;
            const currentDurationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
            if (Math.abs(currentDurationMinutes - minutes) > 1) return expectedEndMs;
        }
        return endMs;
    }

    function buildChronoDayEndMs(date, nextDay) {
        const sleepStartClock = nextDay && (nextDay.sleepStart || nextDay.bedTime || nextDay.asleepAt);
        return buildDateTimeMs(date, sleepStartClock);
    }

    function formatDecimalHoursFromMinutes(minutes) {
        return (Math.max(0, Number(minutes) || 0) / 60).toFixed(1).replace('.', ',') + 'ч';
    }

    function formatUntrackedDurationLabel(minutes) {
        const rounded = Math.max(0, Math.round(Number(minutes) || 0));
        if (rounded > 0 && rounded < 60) return `${rounded} мин`;
        return formatDecimalHoursFromMinutes(rounded);
    }

    function splitMinutesForWheel(minutes) {
        const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(Number(minutes) || 0)));
        return {
            hours: Math.floor(safe / 60),
            minutes: safe % 60,
        };
    }

    function computeChronoCoveredMinutes(entries, snapshots, date) {
        const groups = new Map();
        (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
            if (!entry || entry.date !== date) return;
            const minutes = Math.max(0, Number(entry.minutes) || 0);
            if (minutes <= 0) return;
            const groupId = entry.displayGroupId
                ? `display:${entry.displayGroupId}`
                : (entry.parallelGroupId ? `parallel:${entry.parallelGroupId}` : `entry:${entry.id || index}`);
            const displayStartMs = entry.displayStartAt ? new Date(entry.displayStartAt).getTime() : NaN;
            const displayEndMs = entry.displayEndAt ? new Date(entry.displayEndAt).getTime() : NaN;
            const group = groups.get(groupId) || { minutes: 0, displayStartMs: null, displayEndMs: null };
            group.minutes = Math.max(group.minutes, minutes);
            if (Number.isFinite(displayStartMs)) {
                group.displayStartMs = group.displayStartMs == null
                    ? displayStartMs
                    : Math.min(group.displayStartMs, displayStartMs);
            }
            if (Number.isFinite(displayEndMs)) {
                group.displayEndMs = group.displayEndMs == null
                    ? displayEndMs
                    : Math.max(group.displayEndMs, displayEndMs);
            }
            groups.set(groupId, group);
        });
        let total = 0;
        groups.forEach((group) => {
            const displayMinutes = group
                && Number.isFinite(group.displayStartMs)
                && Number.isFinite(group.displayEndMs)
                && group.displayEndMs > group.displayStartMs
                ? Math.round((group.displayEndMs - group.displayStartMs) / 60000)
                : 0;
            total += Math.max(group.minutes || 0, displayMinutes);
        });
        (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
            if (!snapshot || snapshot.date !== date) return;
            total += Math.max(0, Number(snapshot.totalMinutes) || 0);
        });
        return total;
    }

    function buildLastAddedSummary(entries, activities, nowMs, date, options = {}) {
        const activityById = new Map((Array.isArray(activities) ? activities : []).map((a) => [a.id, a]));
        const sorted = (Array.isArray(entries) ? entries : [])
            .filter((entry) => {
                if (!entry || !entry.createdAt || Number(entry.minutes) <= 0) return false;
                if (date && entry.date !== date) return false;
                return activityById.has(entry.activityId);
            })
            .slice()
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        const last = sorted[0];
        if (!last) return null;
        const createdMs = new Date(last.createdAt).getTime();
        if (!Number.isFinite(createdMs)) return null;
        const now = Number(nowMs) || Date.now();
        const activity = activityById.get(last.activityId) || {};
        const elapsedHours = Math.max(0, (now - createdMs) / 36e5);
        return {
            timeLabel: formatClockTime(createdMs),
            nowLabel: formatClockTime(now),
            nowKind: options && options.nowKind ? String(options.nowKind) : 'now',
            detail: `+${formatMinutes(last.minutes)} ${activity.name || 'Занятие'}`,
            elapsedHoursLabel: elapsedHours.toFixed(1).replace('.', ',') + 'ч',
        };
    }

    function buildChronoLoggedRows(day, entries, activities, date) {
        const normalizeIds = (ids) => Array.from(new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])).sort();
        const isSubsetIds = (small, large) => {
            const largeSet = new Set(large);
            return small.length > 0 && small.every((id) => largeSet.has(id));
        };
        const canMergeLoggedRows = (prev, row) => {
            if (!prev || !row) return false;
            const isContiguous = Number.isFinite(prev.endMs)
                && Number.isFinite(row.startMs)
                && Math.abs(row.startMs - prev.endMs) <= 60000;
            if (!isContiguous) return false;
            const prevIds = normalizeIds(prev.activityIds);
            const rowIds = normalizeIds(row.activityIds);
            if (prevIds.length === 0 || rowIds.length === 0) return false;
            return isSubsetIds(prevIds, rowIds) || isSubsetIds(rowIds, prevIds);
        };
        const mergeLoggedRows = (prev, row) => {
            const prevSegments = Array.isArray(prev.segmentNames) && prev.segmentNames.length > 0
                ? prev.segmentNames.slice()
                : [prev.name].filter(Boolean);
            if (row.name && prevSegments[prevSegments.length - 1] !== row.name) prevSegments.push(row.name);
            prev.id = `merged:${prev.id}:${row.id}`;
            prev.endMs = row.endMs;
            prev.entryIds = prev.entryIds.concat(row.entryIds || []);
            prev.activityIds = Array.from(new Set([].concat(prev.activityIds || [], row.activityIds || [])));
            prev.segmentNames = prevSegments;
            prev.durationMinutes = Math.max(1, Math.round((prev.endMs - prev.startMs) / 60000));
            prev.minutes = prev.durationMinutes;
            prev.timeRange = `${formatClockTime(prev.startMs)}–${formatClockTime(prev.endMs)}`;
            prev.durationLabel = formatMinutes(prev.durationMinutes);
            prev.name = prevSegments.join(' → ');
        };
        const activityById = new Map((Array.isArray(activities) ? activities : []).map((a) => [a.id, a]));
        const wakeClock = day && (day.sleepEnd || day.wakeTime || day.wokeAt);
        const wakeMs = buildDateTimeMs(date, wakeClock);
        const groups = new Map();
        (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
            if (!entry || entry.date !== date || !entry.createdAt || Number(entry.minutes) <= 0) return;
            const activity = activityById.get(entry.activityId);
            if (!activity) return;
            const endMs = resolveChronoEntryEndMs(entry);
            if (!Number.isFinite(endMs)) return;
            const explicitStartMs = entry.at ? new Date(entry.at).getTime() : NaN;
            const displayStartMs = entry.displayStartAt ? new Date(entry.displayStartAt).getTime() : NaN;
            const displayEndMs = entry.displayEndAt ? new Date(entry.displayEndAt).getTime() : NaN;
            const useExplicitStart = Number.isFinite(explicitStartMs)
                && Math.abs(explicitStartMs - endMs) > 999;
            const groupId = entry.displayGroupId
                ? `display:${entry.displayGroupId}`
                : (entry.parallelGroupId ? `parallel:${entry.parallelGroupId}` : `entry:${entry.id || index}`);
            const group = groups.get(groupId) || {
                id: groupId,
                startMs: useExplicitStart ? explicitStartMs : null,
                displayStartMs: Number.isFinite(displayStartMs) ? displayStartMs : null,
                displayEndMs: Number.isFinite(displayEndMs) ? displayEndMs : null,
                endMs,
                minutes: 0,
                entryMinutes: [],
                entryIds: [],
                activityIds: [],
                names: [],
            };
            if (useExplicitStart) {
                group.startMs = group.startMs == null
                    ? explicitStartMs
                    : Math.min(group.startMs, explicitStartMs);
            }
            if (Number.isFinite(displayStartMs)) {
                group.displayStartMs = group.displayStartMs == null
                    ? displayStartMs
                    : Math.min(group.displayStartMs, displayStartMs);
            }
            if (Number.isFinite(displayEndMs)) {
                group.displayEndMs = group.displayEndMs == null
                    ? displayEndMs
                    : Math.max(group.displayEndMs, displayEndMs);
            }
            group.endMs = Math.max(group.endMs, endMs);
            group.minutes = Math.max(group.minutes, Number(entry.minutes) || 0);
            group.entryMinutes.push(Math.max(0, Number(entry.minutes) || 0));
            group.entryIds.push(entry.id);
            group.activityIds.push(entry.activityId);
            group.names.push(activity.name || 'Занятие');
            groups.set(groupId, group);
        });
        let previousEndMs = Number.isFinite(wakeMs) ? wakeMs : null;
        const rows = Array.from(groups.values())
            .sort((a, b) => a.endMs - b.endMs)
            .map((group) => {
                const rawGroupEndMs = Number.isFinite(group.displayEndMs) ? group.displayEndMs : group.endMs;
                const fallbackStartMs = rawGroupEndMs - Math.max(1, group.minutes) * 60000;
                const explicitStartMs = Number.isFinite(group.startMs) ? group.startMs : null;
                const displayStartMs = Number.isFinite(group.displayStartMs) ? group.displayStartMs : null;
                const startMs = displayStartMs != null
                    ? displayStartMs
                    : explicitStartMs != null
                    ? explicitStartMs
                    : (previousEndMs != null ? Math.min(previousEndMs, rawGroupEndMs) : fallbackStartMs);
                const displayDurationMinutes = Math.max(0, Math.round((rawGroupEndMs - startMs) / 60000));
                const hasExplicitTimingRange = (displayStartMs != null || explicitStartMs != null)
                    && Number.isFinite(rawGroupEndMs);
                const uniqueActivityIds = Array.from(new Set(group.activityIds || []));
                const entryMinutes = Array.isArray(group.entryMinutes) ? group.entryMinutes : [];
                const uniformEntryMinutes = entryMinutes.length > 0
                    && entryMinutes.every((minutes) => Math.abs(minutes - entryMinutes[0]) <= 1);
                const groupEndMs = hasExplicitTimingRange
                    && group.minutes > 0
                    && (uniqueActivityIds.length <= 1 || uniformEntryMinutes)
                    && Math.abs(displayDurationMinutes - group.minutes) > 1
                    ? startMs + Math.max(1, group.minutes) * 60000
                    : rawGroupEndMs;
                previousEndMs = groupEndMs;
                const derivedMinutes = Math.max(0, Math.round((groupEndMs - startMs) / 60000));
                const displayMinutes = Math.max(1, derivedMinutes);
                return {
                    id: group.id,
                    startMs,
                    endMs: groupEndMs,
                    entryIds: group.entryIds.slice(),
                    primaryEntryId: group.entryIds[0] || '',
                    activityIds: Array.from(new Set(group.activityIds)),
                    primaryActivityId: group.activityIds[0] || '',
                    minutes: group.minutes,
                    durationMinutes: displayMinutes,
                    timeRange: `${formatClockTime(startMs)}–${formatClockTime(groupEndMs)}`,
                    durationLabel: formatMinutes(displayMinutes),
                    name: Array.from(new Set(group.names)).join(' · '),
                };
            });
        return rows.reduce((acc, row) => {
            const prev = acc[acc.length - 1];
            if (canMergeLoggedRows(prev, row)) {
                mergeLoggedRows(prev, row);
                return acc;
            }
            acc.push({ ...row });
            return acc;
        }, []);
    }

    function buildChronoReorderAssignments(rows, date, anchorMs) {
        if (!Array.isArray(rows) || rows.length === 0 || !date) return [];
        let cursor = Number(anchorMs);
        if (!Number.isFinite(cursor)) {
            cursor = Number(rows[0] && rows[0].startMs);
        }
        if (!Number.isFinite(cursor)) return [];
        return rows.map((row) => {
            const durationMinutes = Math.max(1, Math.round(Number(row && row.durationMinutes) || Number(row && row.minutes) || 0));
            const startMs = cursor;
            const endMs = startMs + durationMinutes * 60000;
            cursor = endMs;
            return {
                id: row.id,
                entryIds: Array.isArray(row.entryIds) ? row.entryIds.slice() : [],
                date,
                startMs,
                endMs,
                minutes: durationMinutes,
            };
        });
    }

    function getLastChronoEntryMs(entries, date) {
        const latest = (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && entry.date === date && entry.createdAt)
            .map((entry) => resolveChronoEntryEndMs(entry))
            .filter((ms) => Number.isFinite(ms))
            .sort((a, b) => b - a)[0];
        return Number.isFinite(latest) ? latest : null;
    }

    function buildUntrackedChronoSummary(day, entries, date, nowMs, options = {}) {
        const wakeClock = day && (day.sleepEnd || day.wakeTime || day.wokeAt);
        const wakeMs = buildDateTimeMs(date, wakeClock);
        const explicitEndMs = Number(options && options.endMs);
        const now = Number.isFinite(explicitEndMs) ? explicitEndMs : (Number(nowMs) || Date.now());
        const endKind = Number.isFinite(explicitEndMs) ? (options.endKind || 'custom') : 'now';
        const endLabel = options && options.endLabel ? String(options.endLabel) : formatClockTime(now);
        if (wakeMs == null || !Number.isFinite(now) || wakeMs > now) return null;
        const lastEntryMs = getLastChronoEntryMs(entries, date);
        const startMs = lastEntryMs != null ? Math.max(wakeMs, lastEntryMs) : wakeMs;
        if (startMs > now) return null;
        const untrackedMinutes = Math.max(0, (now - startMs) / 60000);
        if (untrackedMinutes < 1) return null;
        return {
            minutes: Math.round(untrackedMinutes),
            hoursLabel: formatDecimalHoursFromMinutes(untrackedMinutes),
            durationLabel: formatUntrackedDurationLabel(untrackedMinutes),
            wakeLabel: String(wakeClock || ''),
            startMs,
            endMs: now,
            endLabel,
            endKind,
            sinceLabel: formatClockTime(startMs),
            sinceKind: lastEntryMs != null ? 'last-entry' : 'wake',
        };
    }

    function buildPastUntrackedTailSummaries(entries, daysByDate, todayStr, options = {}) {
        const result = [];
        const lookbackDays = Math.max(1, Math.round(Number(options.lookbackDays) || 7));
        const dismissed = options.dismissedDates instanceof Set
            ? options.dismissedDates
            : new Set(Array.isArray(options.dismissedDates) ? options.dismissedDates : []);
        const nowMs = Number(options.nowMs) || Date.now();

        for (let offset = 1; offset <= lookbackDays; offset += 1) {
            const date = Utils.addDays(todayStr, -offset);
            if (!date || dismissed.has(date)) continue;
            const nextDate = Utils.addDays(date, 1);
            const day = (daysByDate && daysByDate[date]) || {};
            const nextDay = (daysByDate && daysByDate[nextDate]) || {};
            const sleepEndMs = buildChronoDayEndMs(date, nextDay);
            if (sleepEndMs == null) continue;
            const sleepStart = nextDay && nextDay.sleepStart ? String(nextDay.sleepStart) : formatClockTime(sleepEndMs);
            const summary = buildUntrackedChronoSummary(day, entries, date, nowMs, {
                endMs: sleepEndMs,
                endKind: 'sleep',
                endLabel: sleepStart,
            });
            if (!summary || !summary.minutes) continue;
            result.push({
                ...summary,
                date,
                nextDate,
                sleepStart,
            });
        }

        return result;
    }

    function distributeUntrackedMinutes(totalMinutes, activityIds, currentAllocations, changedId, changedMinutes) {
        const ids = Array.from(new Set(Array.isArray(activityIds) ? activityIds.filter(Boolean) : []));
        const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
        if (ids.length === 0 || total <= 0) return {};
        if (ids.length === 1) return { [ids[0]]: total };

        const current = currentAllocations && typeof currentAllocations === 'object' ? currentAllocations : {};
        if (!changedId || !ids.includes(changedId)) {
            const base = Math.floor(total / ids.length);
            let rest = total - base * ids.length;
            return ids.reduce((acc, id) => {
                acc[id] = base + (rest > 0 ? 1 : 0);
                if (rest > 0) rest -= 1;
                return acc;
            }, {});
        }

        const fixed = Math.max(0, Math.min(total, Math.round(Number(changedMinutes) || 0)));
        const restIds = ids.filter((id) => id !== changedId);
        const remaining = total - fixed;
        const oldRestSum = restIds.reduce((sum, id) => sum + Math.max(0, Math.round(Number(current[id]) || 0)), 0);
        const next = { [changedId]: fixed };
        if (restIds.length === 0) return next;

        let assigned = 0;
        const weighted = restIds.map((id, index) => {
            const raw = oldRestSum > 0
                ? remaining * (Math.max(0, Number(current[id]) || 0) / oldRestSum)
                : remaining / restIds.length;
            const floor = Math.floor(raw);
            assigned += floor;
            return { id, floor, frac: raw - floor, index };
        }).sort((a, b) => (b.frac - a.frac) || (a.index - b.index));
        let leftover = remaining - assigned;
        weighted.forEach((item) => {
            next[item.id] = item.floor + (leftover > 0 ? 1 : 0);
            if (leftover > 0) leftover -= 1;
        });
        return next;
    }

    function normalizeUntrackedParallelIds(draft, selectedIdsOverride) {
        if (!draft) return [];
        const selectedIds = Array.isArray(selectedIdsOverride)
            ? selectedIdsOverride.filter(Boolean)
            : (Array.isArray(draft.selectedIds) ? draft.selectedIds.filter(Boolean) : []);
        const selected = new Set(selectedIds);
        const raw = Array.isArray(draft.parallelIds) ? draft.parallelIds : [];
        return Array.from(new Set(raw.filter((id) => id && selected.has(id))));
    }

    function getSequentialUntrackedIds(selectedIds, parallelIds) {
        const selected = Array.from(new Set(Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : []));
        const parallel = new Set(Array.isArray(parallelIds) ? parallelIds.filter(Boolean) : []);
        return selected.filter((id) => !parallel.has(id));
    }

    function distributeUntrackedDraftAllocations(totalMinutes, selectedIds, parallelIds, currentAllocations, changedId, changedMinutes) {
        const sequentialIds = getSequentialUntrackedIds(selectedIds, parallelIds);
        if (sequentialIds.length === 0) return {};
        const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
        const hasParallelAnchor = Array.isArray(parallelIds) && parallelIds.filter(Boolean).length > 0;
        if (hasParallelAnchor) {
            const current = currentAllocations && typeof currentAllocations === 'object' ? currentAllocations : {};
            return sequentialIds.reduce((acc, id) => {
                const fallback = total;
                const raw = id === changedId ? changedMinutes : current[id];
                const value = Number.isFinite(Number(raw)) ? Math.round(Number(raw)) : fallback;
                acc[id] = Math.max(0, Math.min(total, value));
                return acc;
            }, {});
        }
        return distributeUntrackedMinutes(totalMinutes, sequentialIds, currentAllocations, changedId, changedMinutes);
    }

    function buildUntrackedSteps(draft, activities) {
        if (!draft || !Array.isArray(draft.selectedIds)) return [];
        const byId = new Map((Array.isArray(activities) ? activities : []).map((item) => [item.id, item]));
        const selectedIds = Array.from(new Set(draft.selectedIds.filter(Boolean)));
        const parallelIds = normalizeUntrackedParallelIds(draft, selectedIds);
        const parallelSet = new Set(parallelIds);
        const hasParallelAnchor = parallelIds.length > 0;
        const hasSequential = getSequentialUntrackedIds(selectedIds, parallelIds).length > 0;
        const total = Math.max(0, Math.round(Number(draft.minutes) || 0));
        let cursor = Number(draft.startMs);
        const fallbackStart = Number.isFinite(cursor) ? cursor : null;
        return selectedIds
            .map((id) => {
                const activity = byId.get(id);
                if (!activity) return null;
                const isParallel = parallelSet.has(id);
                const rawMinutes = draft.allocations && draft.allocations[id];
                const parsedMinutes = Number(rawMinutes);
                const fallbackMinutes = hasParallelAnchor ? total : 0;
                const minutes = isParallel || !hasSequential
                    ? total
                    : Math.max(0, Math.min(total, Math.round(Number.isFinite(parsedMinutes) ? parsedMinutes : fallbackMinutes)));
                const startMs = isParallel || !hasSequential
                    ? fallbackStart
                    : (Number.isFinite(cursor) ? cursor : fallbackStart);
                const endMs = isParallel || !hasSequential
                    ? (Number.isFinite(fallbackStart) ? fallbackStart + minutes * 60000 : null)
                    : (Number.isFinite(startMs) ? startMs + minutes * 60000 : null);
                if (!isParallel && hasSequential && Number.isFinite(endMs)) cursor = endMs;
                return {
                    id,
                    activity,
                    minutes,
                    startMs,
                    endMs,
                    isParallel,
                    hasParallelAnchor,
                };
            })
            .filter(Boolean);
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
        const yesterday = Utils.addDays(activeDate || Utils.chronoDateStr?.() || Utils.dateStr(), -1);
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
        const days = (Array.isArray(weekDates) ? weekDates : []).map((date) => ({
            date,
            minutes: Math.round(Number(breakdown[date]?.__total) || 0),
        }));
        const bestDay = days.reduce((best, day) => (!best || day.minutes > best.minutes ? day : best), null);
        const focusMinutes = balance
            .filter((item) => item.id === 'focus' || item.id === 'growth' || item.id === 'health')
            .reduce((sum, item) => sum + item.minutes, 0);
        const drainMinutes = balance.find((item) => item.id === 'drain')?.minutes || 0;
        // Объяснимый score: UI показывает исходные доли и дни, а не
        // внутренние баллы формулы.
        const daysTracked = (Array.isArray(weekDates) ? weekDates : [])
            .filter((date) => (breakdown[date]?.__total || 0) > 0).length;
        const goalHit = buildWeekGoalHitRate(activities, entries, snapshots, weekDates);
        const { score, parts: scoreParts } = computeWeekScore({
            focusShare: total > 0 ? focusMinutes / total : 0,
            drainShare: total > 0 ? drainMinutes / total : 0,
            daysTracked,
            goalHitRate: goalHit.rate,
            hasGoals: goalHit.hasGoals,
        });
        const headline = score >= 75
            ? 'Неделя собрана'
            : score >= 50
                ? 'Неделя в балансе'
                : 'Неделю стоит упростить';
        const recommendation = drainMinutes > focusMinutes * 0.35
            ? 'Лучший следующий шаг: 30 минут из потерь перенести в фокус.'
            : focusMinutes < total * 0.4
                ? 'Лучший следующий шаг: добавить один фокус-блок на 45 минут.'
                : 'Ритм держится: фокус уже задаёт структуру недели.';
        return {
            total,
            score,
            scoreParts,
            days,
            daysTracked,
            focusShare: total > 0 ? focusMinutes / total : 0,
            drainShare: total > 0 ? drainMinutes / total : 0,
            goalHitRate: goalHit.rate,
            hasGoals: goalHit.hasGoals,
            headline,
            recommendation,
            trend: buildWeekTrend(activities, entries, snapshots, weekDates, minutesByActivity),
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

    function getChronoSlotDurationMinutes(slot) {
        if (!slot || !slot.startTime || !slot.endTime) return 0;
        const parseTime = (value) => {
            const parts = String(value || '').split(':').map(Number);
            if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
            return (parts[0] * 60) + parts[1];
        };
        const start = parseTime(slot.startTime);
        let end = parseTime(slot.endTime);
        if (start === null || end === null) return 0;
        if (end <= start) end += 24 * 60;
        return Math.max(30, Math.min(24 * 60, Math.round(end - start)));
    }

    function buildChronoPlanFacts(activities, tasks, minutesByActivity, slots, dates) {
        const out = [];
        const taskList = Array.isArray(tasks) ? tasks : [];
        const taskById = new Map(taskList.map((task) => [task.id, task]));
        const slotList = Array.isArray(slots) ? slots : [];
        const dateSet = new Set((Array.isArray(dates) ? dates : []).filter(Boolean));
        (Array.isArray(activities) ? activities : []).forEach((activity) => {
            if (!activity || activity.archived) return;
            const actual = Math.round(Number(minutesByActivity && minutesByActivity[activity.id]) || 0);
            let planned = 0;
            let label = '';
            let planSource = 'estimate';
            let relatedTaskIds = [];
            if (activity.taskId && taskById.has(activity.taskId)) {
                const task = taskById.get(activity.taskId);
                relatedTaskIds = [task.id];
                planned = Number(task.plannedMinutes) > 0 ? Math.round(Number(task.plannedMinutes)) : 0;
                label = task.title || activity.name;
            } else if (activity.projectId) {
                const projectTasks = taskList.filter((task) => task && task.projectId === activity.projectId);
                relatedTaskIds = projectTasks.map((task) => task.id);
                planned = projectTasks.reduce((sum, task) => sum + (Number(task.plannedMinutes) || 0), 0);
                label = activity.name;
            }
            if (relatedTaskIds.length > 0 && slotList.length > 0 && dateSet.size > 0) {
                const relatedIdSet = new Set(relatedTaskIds);
                const relatedSlots = slotList.filter((slot) => slot && relatedIdSet.has(slot.taskId));
                if (relatedSlots.length > 0) {
                    planned = relatedSlots
                        .filter((slot) => dateSet.has(slot.date))
                        .reduce((sum, slot) => sum + getChronoSlotDurationMinutes(slot), 0);
                    planSource = 'calendar';
                }
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
                planSource,
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

    function getBubbleProgress(activity, minutes, scope, planFact) {
        const scopedGoal = getActivityGoalForScope(activity, scope);
        if (scopedGoal) {
            return {
                ...getProgress(activity, minutes, scope),
                minutes: scopedGoal.minutes,
                source: 'activity',
            };
        }
        const planned = Math.round(Number(planFact && planFact.planned) || 0);
        if (planned <= 0) return null;
        const actual = Math.max(0, Number(minutes) || 0);
        const raw = actual / planned;
        return {
            kind: 'plan',
            value: Math.max(0, Math.min(1, raw)),
            raw,
            over: false,
            minutes: planned,
            source: 'task',
        };
    }

    // Цвет кольца на бабле, в зависимости от kind и прогресса.
    function ringColorForProgress(progress, activityHue) {
        if (!progress) return 'transparent';
        const safeHue = ((Number(activityHue) || 0) % 360 + 360) % 360;
        if (progress.kind === 'target' || progress.kind === 'plan') {
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
        (Array.isArray(weekDates) ? weekDates : []).forEach((d) => { out[d] = { __total: 0 }; });
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

    function buildDisplayChronoActivities(activities, minutesByActivity) {
        const byId = new Map();
        (Array.isArray(activities) ? activities : []).forEach((activity) => {
            if (activity && activity.id) byId.set(String(activity.id), activity);
        });
        Object.keys(minutesByActivity || {}).forEach((activityId, index) => {
            if (!activityId || byId.has(activityId) || (Number(minutesByActivity[activityId]) || 0) <= 0) return;
            byId.set(activityId, {
                id: activityId,
                name: 'Занятие',
                emoji: '◷',
                hue: (index * 47 + 205) % 360,
                archived: false,
                isPlaceholder: true,
            });
        });
        return Array.from(byId.values());
    }

    // ── Аналитика: стрики / тренд / score / время суток ──────────────
    // Все функции ниже чистые (без обращения к Store/LS напрямую), тестируются
    // через HEYS.PlanningChrono.*.

    // Минуты одной активности за конкретную дату (entries + snapshots).
    function sumActivityMinutesForDate(entries, snapshots, activityId, date) {
        let total = 0;
        (Array.isArray(entries) ? entries : []).forEach((e) => {
            if (e && e.activityId === activityId && e.date === date) total += Number(e.minutes) || 0;
        });
        (Array.isArray(snapshots) ? snapshots : []).forEach((s) => {
            if (s && s.activityId === activityId && s.date === date) total += Number(s.totalMinutes) || 0;
        });
        return total;
    }

    function dayGoalMet(kind, minutes, goalMinutes) {
        return kind === 'budget' ? minutes <= goalMinutes : minutes >= goalMinutes;
    }

    // Стрики попадания в дневную цель/лимит. Для каждой активности с дневной
    // целью считаем сколько дней ПОДРЯД (от хвоста) цель выполнена. Окно
    // ограничено возрастом активности (createdAt), чтобы budget-«чистый» стрик
    // не насчитывал успехи до её появления. target в середине дня не рвём:
    // если сегодня ещё недобор — считаем со вчера (metToday=false).
    function buildGoalStreaks(activities, entries, snapshots, todayStr) {
        const today = todayStr || Utils.chronoDateStr?.() || Utils.dateStr();
        const floor = Utils.addDays(today, -90);
        const out = [];
        (Array.isArray(activities) ? activities : []).forEach((activity) => {
            if (!activity || activity.archived) return;
            const goal = getActivityGoalForScope(activity, 'day');
            if (!goal || goal.minutes <= 0) return;
            const createdDay = activity.createdAt ? Utils.dateStr(activity.createdAt) : floor;
            const start = createdDay > floor ? createdDay : floor;
            if (start > today) return;
            const series = buildDailySeries(entries, snapshots, activity.id, start, today);
            if (!series.length) return;
            const last = series[series.length - 1];
            const metToday = dayGoalMet(goal.kind, last.minutes, goal.minutes);
            let idx = series.length - 1;
            if (goal.kind === 'target' && !metToday) idx -= 1;
            let streak = 0;
            for (let i = idx; i >= 0; i -= 1) {
                if (dayGoalMet(goal.kind, series[i].minutes, goal.minutes)) streak += 1;
                else break;
            }
            if (streak >= 2) {
                out.push({ activity, kind: goal.kind, goalMinutes: goal.minutes, streak, metToday });
            }
        });
        return out.sort((a, b) => b.streak - a.streak);
    }

    // Доля выполненных (активность × день) пар недели среди активностей с
    // дневной целью. Питает компонент «Цели» в score.
    function buildWeekGoalHitRate(activities, entries, snapshots, weekDates) {
        const dates = Array.isArray(weekDates) ? weekDates : [];
        const goalActs = (Array.isArray(activities) ? activities : []).filter((a) => {
            if (!a || a.archived) return false;
            const g = getActivityGoalForScope(a, 'day');
            return !!(g && g.minutes > 0);
        });
        if (!goalActs.length || !dates.length) return { rate: 0, hasGoals: false };
        let hits = 0;
        let count = 0;
        goalActs.forEach((a) => {
            const g = getActivityGoalForScope(a, 'day');
            dates.forEach((d) => {
                const minutes = sumActivityMinutesForDate(entries, snapshots, a.id, d);
                count += 1;
                if (dayGoalMet(g.kind, minutes, g.minutes)) hits += 1;
            });
        });
        return { rate: count > 0 ? hits / count : 0, hasGoals: true };
    }

    // Фокус (focus+growth+health) и потери (drain) из category-balance.
    function sumFocusDrainMinutes(balance) {
        const list = Array.isArray(balance) ? balance : [];
        const focus = list
            .filter((item) => item.id === 'focus' || item.id === 'growth' || item.id === 'health')
            .reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
        const drain = list.find((item) => item.id === 'drain')?.minutes || 0;
        return { focus, drain: Number(drain) || 0 };
    }

    // Тренд неделя-к-неделе: текущая неделя против сдвинутой на -7 дней.
    function buildWeekTrend(activities, entries, snapshots, weekDates, minutesByActivity) {
        const dates = Array.isArray(weekDates) ? weekDates : [];
        if (!dates.length) return null;
        const prevDates = dates.map((d) => Utils.addDays(d, -7));
        const prevMBA = Utils.getChronoMinutesByActivity(entries, snapshots, prevDates);
        const nowBalance = buildCategoryBalance(activities, minutesByActivity);
        const prevBalance = buildCategoryBalance(activities, prevMBA);
        const nowTotal = Object.values(minutesByActivity || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        const prevTotal = Object.values(prevMBA || {}).reduce((s, v) => s + (Number(v) || 0), 0);
        const nowFD = sumFocusDrainMinutes(nowBalance);
        const prevFD = sumFocusDrainMinutes(prevBalance);
        return {
            prevTotal: Math.round(prevTotal),
            totalDelta: Math.round(nowTotal - prevTotal),
            totalPct: prevTotal > 0 ? Math.round(((nowTotal - prevTotal) / prevTotal) * 100) : null,
            focus: { now: Math.round(nowFD.focus), prev: Math.round(prevFD.focus), delta: Math.round(nowFD.focus - prevFD.focus) },
            drain: { now: Math.round(nowFD.drain), prev: Math.round(prevFD.drain), delta: Math.round(nowFD.drain - prevFD.drain) },
        };
    }

    // Прозрачный недельный score. Веса вынесены в WEEK_SCORE_WEIGHTS. Возвращает
    // {score, parts:[{label, points}]} — parts(clamped) и есть «из чего сложилось».
    const WEEK_SCORE_WEIGHTS = { base: 35, focus: 35, drain: 30, consistency: 15, goals: 15 };

    function computeWeekScore(input) {
        const focusShare = Math.max(0, Math.min(1, Number(input && input.focusShare) || 0));
        const drainShare = Math.max(0, Math.min(1, Number(input && input.drainShare) || 0));
        const daysTracked = Math.max(0, Math.min(7, Number(input && input.daysTracked) || 0));
        const goalHitRate = Math.max(0, Math.min(1, Number(input && input.goalHitRate) || 0));
        const hasGoals = !!(input && input.hasGoals);
        const W = WEEK_SCORE_WEIGHTS;
        // Нет целей — вес «Цели» переливаем в базу, чтобы неделя без целей не
        // упиралась в потолок ниже 100.
        const base = W.base + (hasGoals ? 0 : W.goals);
        const parts = [
            { label: 'База', points: base },
            { label: 'Фокус', points: Math.round(W.focus * Math.min(1, focusShare / 0.5)) },
            { label: 'Потери', points: -Math.round(W.drain * Math.min(1, drainShare / 0.3)) },
            { label: 'Дней', points: Math.round(W.consistency * (daysTracked / 7)) },
        ];
        if (hasGoals) parts.push({ label: 'Цели', points: Math.round(W.goals * goalHitRate) });
        const raw = parts.reduce((sum, p) => sum + p.points, 0);
        return { score: Math.max(0, Math.min(100, raw)), parts };
    }

    const TIME_OF_DAY_PARTS = [
        { id: 'morning', label: 'утром' },
        { id: 'day', label: 'днём' },
        { id: 'evening', label: 'вечером' },
        { id: 'night', label: 'ночью' },
    ];

    function partForHour(hour) {
        if (hour >= 5 && hour < 11) return 'morning';
        if (hour >= 11 && hour < 17) return 'day';
        if (hour >= 17 && hour < 23) return 'evening';
        return 'night';
    }

    // Паттерн времени суток за окно windowDays (по умолчанию 30). Час берём из
    // entry.at || entry.createdAt. Если фокус-записей мало (<3) — focus=null.
    function buildTimeOfDayPattern(activities, entries, todayStr, windowDays) {
        const today = todayStr || Utils.chronoDateStr?.() || Utils.dateStr();
        const win = Math.max(1, Number(windowDays) || 30);
        const cutoff = Utils.addDays(today, -win);
        const catByActivity = new Map(
            (Array.isArray(activities) ? activities : []).map((a) => [a.id, inferActivityCategory(a)])
        );
        const byPart = { morning: 0, day: 0, evening: 0, night: 0 };
        const focusByPart = { morning: 0, day: 0, evening: 0, night: 0 };
        let focusCount = 0;
        (Array.isArray(entries) ? entries : []).forEach((e) => {
            if (!e || !e.date || e.date < cutoff || e.date > today) return;
            const minutes = Number(e.minutes) || 0;
            if (minutes <= 0) return;
            const stamp = e.at || e.createdAt;
            if (!stamp) return;
            const d = new Date(stamp);
            if (Number.isNaN(d.getTime())) return;
            const part = partForHour(d.getHours());
            byPart[part] += minutes;
            if (catByActivity.get(e.activityId) === 'focus') {
                focusByPart[part] += minutes;
                focusCount += 1;
            }
        });
        let focus = null;
        if (focusCount >= 3) {
            const total = focusByPart.morning + focusByPart.day + focusByPart.evening + focusByPart.night;
            if (total > 0) {
                let best = 'morning';
                ['day', 'evening', 'night'].forEach((p) => { if (focusByPart[p] > focusByPart[best]) best = p; });
                focus = { part: best, pct: Math.round((focusByPart[best] / total) * 100), minutes: Math.round(focusByPart[best]) };
            }
        }
        const headline = focus
            ? `Фокус чаще ${(TIME_OF_DAY_PARTS.find((p) => p.id === focus.part) || {}).label} (${focus.pct}%)`
            : null;
        return { byPart, focus, headline };
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

    function readStoredValue(key, fallback) {
        try {
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(key, fallback);
            }
        } catch (_) { /* noop */ }
        try {
            if (typeof localStorage === 'undefined') return fallback;
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }

    function getCurrentClientId() {
        try {
            if (HEYS.utils && typeof HEYS.utils.getCurrentClientId === 'function') {
                const id = String(HEYS.utils.getCurrentClientId() || '');
                if (id) return id;
            }
        } catch (_) { /* noop */ }
        try {
            if (HEYS.cloud && typeof HEYS.cloud.getClientId === 'function') {
                const id = String(HEYS.cloud.getClientId() || '');
                if (id) return id;
            }
        } catch (_) { /* noop */ }
        try {
            if (typeof localStorage !== 'undefined') {
                return localStorage.getItem('heys_pin_auth_client')
                    || localStorage.getItem('heys_client_current')
                    || localStorage.getItem('heys_current_client')
                    || '';
            }
        } catch (_) { /* noop */ }
        return '';
    }

    function readChronoDayV2(dateKey) {
        try {
            if (HEYS.MorningCheckinUtils && typeof HEYS.MorningCheckinUtils.readDayV2ScopedFirst === 'function') {
                return HEYS.MorningCheckinUtils.readDayV2ScopedFirst(dateKey, {}) || {};
            }
        } catch (_) { /* noop */ }
        const clientId = getCurrentClientId();
        if (clientId) {
            const scoped = readStoredValue(`heys_${clientId}_dayv2_${dateKey}`, null);
            if (scoped && typeof scoped === 'object') return scoped;
        }
        return readStoredValue(`heys_dayv2_${dateKey}`, {}) || {};
    }

    function readDismissedUntrackedTailDates() {
        try {
            const parsed = HEYS.utils && typeof HEYS.utils.lsGet === 'function'
                ? HEYS.utils.lsGet(UNTRACKED_TAIL_DISMISS_KEY, [])
                : [];
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (_) {
            return [];
        }
    }

    function saveDismissedUntrackedTailDates(dates) {
        const normalized = Array.from(new Set((Array.isArray(dates) ? dates : [])
            .map((date) => String(date || '').slice(0, 10))
            .filter(Boolean)))
            .sort();
        try {
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                HEYS.utils.lsSet(UNTRACKED_TAIL_DISMISS_KEY, normalized);
            }
        } catch (_) { /* noop */ }
        return normalized;
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

    function formatActivityCountSuffix(count) {
        const safe = Math.max(0, Math.round(Number(count) || 0));
        if (safe <= 1) return '';
        const lastTwo = safe % 100;
        const last = safe % 10;
        const word = lastTwo >= 11 && lastTwo <= 14
            ? 'активностей'
            : (last >= 2 && last <= 4 ? 'активности' : 'активностей');
        return ` в ${safe} ${word}`;
    }

    function ChronoUndoToast({ toast, onUndo, onDismiss }) {
        useEffect(() => {
            if (!toast) return undefined;
            const timer = setTimeout(onDismiss, TOAST_TIMEOUT_MS);
            return () => clearTimeout(timer);
        }, [toast, onDismiss]);

        if (!toast) return null;

        return h('div', { className: 'chrono-undo-toast', role: 'status' },
            h('span', { className: 'chrono-undo-toast__text' },
                toast.kind === 'cleared'
                    ? `Убрано ${toast.scope === 'week' ? 'из недели' : 'из дня'}${toast.minutes > 0 ? ': ' + formatMinutes(toast.minutes) : ''}`
                    : toast.adjusted
                        ? `Изменено ${toast.minutes > 0 ? '+' : '-'}${formatMinutes(Math.abs(toast.minutes))}`
                        : `Добавлено ${formatMinutes(toast.minutes)}${formatActivityCountSuffix(toast.activityCount || toast.parallelCount)}`),
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
                    className: 'chrono-picker__emoji chrono-picker__emoji--btn' + (emojiOpen ? ' active' : ''),
                    onClick: () => setEmojiOpen((open) => !open),
                    title: 'Сменить смайл',
                    'aria-expanded': emojiOpen,
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
            emojiOpen && h('div', { className: 'chrono-picker__emoji-panel' },
                h(EmojiPalette, {
                selected: emoji,
                onSelect: (next) => { setEmoji(next); setEmojiOpen(false); },
                }),
            ),
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
            function onKey(e) {
                if (e.key === 'Escape') onClose();
            }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        useEffect(() => {
            if (inputRef.current) inputRef.current.focus();
        }, []);

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
    const UNTRACKED_TAIL_DISMISS_KEY = 'heys_planning_chrono_untracked_tail_dismissed_v1';
    const LEDGER_LONG_PRESS_MS = 450;
    const LEDGER_DRAG_CANCEL_PX = 8;

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

    function ChronoUntrackedTailPromptModal({ tails, onFill, onDismissDates, onClose }) {
        const overlayRef = useRef(null);
        const list = Array.isArray(tails) ? tails.filter(Boolean) : [];
        const single = list.length === 1 ? list[0] : null;

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-untracked-tail-prompt', () => onClose && onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape' && onClose) onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        if (list.length === 0) return null;

        const title = single ? 'Остался незаполненный хвост' : 'Есть незаполненные хвосты';
        const dismissLabel = single ? 'Не актуально' : 'Не актуально по этим дням';
        const dates = list.map((item) => item.date).filter(Boolean);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-untracked-tail-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current && onClose) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-untracked-tail', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, title),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-untracked-tail__body' },
                    single
                        ? h('div', { className: 'chrono-untracked-tail__hero' },
                            h('span', { className: 'chrono-untracked-tail__icon', 'aria-hidden': 'true' }, '⏱'),
                            h('div', { className: 'chrono-untracked-tail__copy' },
                                h('strong', null, `${formatDateLabel(single.date)}: не учтено ${single.durationLabel || formatUntrackedDurationLabel(single.minutes)}`),
                                h('span', null, `Последняя запись была в ${single.sinceLabel}. До сна в ${single.sleepStart || single.endLabel} осталось время без активности.`),
                            ),
                        )
                        : h('div', { className: 'chrono-untracked-tail__stack' },
                            h('p', { className: 'chrono-untracked-tail__lead' },
                                `Нашёл ${list.length} дней, где после последней записи осталось время до сна.`),
                            h('div', { className: 'chrono-untracked-tail__list' },
                                list.map((item) => h('div', { key: item.date, className: 'chrono-untracked-tail__row' },
                                    h('span', { className: 'chrono-untracked-tail__date' }, formatDateLabel(item.date)),
                                    h('span', { className: 'chrono-untracked-tail__meta' },
                                        `${item.sinceLabel} → сон ${item.sleepStart || item.endLabel}`),
                                    h('strong', { className: 'chrono-untracked-tail__duration' },
                                        item.durationLabel || formatUntrackedDurationLabel(item.minutes)),
                                )),
                            ),
                            h('p', { className: 'chrono-untracked-tail__hint' },
                                'Открой нужные даты стрелками в хронометраже и дозаполни только то, что ещё важно.'),
                        ),
                    h('div', { className: 'chrono-untracked-tail__actions' },
                        single && h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--primary',
                            onClick: () => onFill && onFill(single.date),
                        }, 'Дозаполнить'),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--danger',
                            onClick: () => onDismissDates && onDismissDates(dates),
                        }, dismissLabel),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn',
                            onClick: onClose,
                        }, 'Позже'),
                    ),
                ),
            ),
        );
    }

    // === Heatmap по дням (GitHub-style тепловая карта за окно дней) ===

    const HEATMAP_DAYS = 91; // 13 недель × 7 дней — норм поместится на 390px

    function ChronoHeatmap({ activity, entries, snapshots }) {
        const todayStr = Utils.chronoDateStr?.() || Utils.dateStr();
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

    function ChronoEntryEditModal({ row, entries, activities, tasks, projects, onUpdateEntry, onDeleteEntry, onUpdateActivity, onClose }) {
        const overlayRef = useRef(null);
        const rowEntryIds = useMemo(() => new Set(Array.isArray(row && row.entryIds) ? row.entryIds : []), [row]);
        const rowEntries = useMemo(() => (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && rowEntryIds.has(entry.id)), [entries, rowEntryIds]);
        const primaryEntry = rowEntries.find((entry) => entry.id === (row && row.primaryEntryId)) || rowEntries[0] || null;
        const [draftMinutes, setDraftMinutes] = useState(() => String((row && row.minutes) || (primaryEntry && primaryEntry.minutes) || ''));
        const [activityId, setActivityId] = useState(() => (primaryEntry && primaryEntry.activityId) || (row && row.primaryActivityId) || '');
        const isParallel = rowEntries.length > 1;
        const selectedActivity = activities.find((item) => item.id === activityId)
            || activities.find((item) => item.id === (row && row.primaryActivityId))
            || {};
        const activeMinutes = Math.max(1, Math.round(Number(draftMinutes) || 0));

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-entry-edit', () => onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape') onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        useEffect(() => {
            setDraftMinutes(String((row && row.minutes) || (primaryEntry && primaryEntry.minutes) || ''));
            setActivityId((primaryEntry && primaryEntry.activityId) || (row && row.primaryActivityId) || '');
        }, [row && row.id, primaryEntry && primaryEntry.id]);

        const commitMinutes = useCallback((minutes) => {
            const next = Math.round(Number(minutes) || 0);
            if (next <= 0) return;
            const startMs = Number(row && row.startMs);
            const endMs = Number.isFinite(startMs) ? startMs + next * 60000 : NaN;
            const timingPatch = Number.isFinite(startMs) && Number.isFinite(endMs)
                ? {
                    at: new Date(startMs).toISOString(),
                    createdAt: new Date(endMs).toISOString(),
                    displayStartAt: new Date(startMs).toISOString(),
                    displayEndAt: new Date(endMs).toISOString(),
                }
                : {};
            rowEntries.forEach((entry) => onUpdateEntry && onUpdateEntry(entry.id, { minutes: next, ...timingPatch }));
            setDraftMinutes(String(next));
        }, [rowEntries, onUpdateEntry, row && row.startMs]);

        const commitActivity = useCallback((nextActivityId) => {
            if (!primaryEntry || !nextActivityId || isParallel) return;
            onUpdateEntry && onUpdateEntry(primaryEntry.id, { activityId: nextActivityId });
            setActivityId(nextActivityId);
        }, [primaryEntry, isParallel, onUpdateEntry]);

        const updateSelectedActivity = useCallback((patch) => {
            if (!selectedActivity || !selectedActivity.id || typeof onUpdateActivity !== 'function') return;
            onUpdateActivity(selectedActivity.id, patch);
        }, [selectedActivity && selectedActivity.id, onUpdateActivity]);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-entry-edit-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-entry-edit', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, 'Запись · ', row ? row.timeRange : ''),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-entry-edit__body' },
                    h('div', { className: 'chrono-entry-edit__summary' },
                        h('span', null, row ? row.name : 'Занятие'),
                        isParallel && h('span', { className: 'chrono-entry-edit__badge' }, 'параллельно'),
                    ),
                    h('label', { className: 'chrono-entry-edit__field' },
                        h('span', { className: 'chrono-entry-edit__label' }, 'Активность'),
                        h('select', {
                            className: 'planning-modal__input chrono-entry-edit__select',
                            value: activityId,
                            disabled: isParallel,
                            onChange: (e) => commitActivity(e.target.value),
                        },
                            activities.filter((item) => item && (!item.archived || item.id === activityId)).map((item) => h('option', {
                                key: item.id,
                                value: item.id,
                            }, `${item.emoji || '·'} ${item.name || 'Занятие'}`)),
                        ),
                    ),
                    h('label', { className: 'chrono-entry-edit__field' },
                        h('span', { className: 'chrono-entry-edit__label' }, isParallel ? 'Длительность для всех параллельных записей' : 'Длительность'),
                        h('div', { className: 'chrono-entry-edit__minutes-row' },
                            h('button', {
                                type: 'button',
                                className: 'chrono-history__tiny-btn',
                                onClick: () => commitMinutes(Math.max(1, activeMinutes - 5)),
                                'aria-label': 'Уменьшить на 5 минут',
                            }, '−'),
                            h('input', {
                                className: 'planning-modal__input chrono-entry-edit__minutes',
                                type: 'number',
                                min: 1,
                                step: 5,
                                inputMode: 'numeric',
                                value: draftMinutes,
                                onChange: (e) => setDraftMinutes(e.target.value),
                                onBlur: () => commitMinutes(draftMinutes),
                                onKeyDown: (e) => {
                                    if (e.key === 'Enter') {
                                        commitMinutes(draftMinutes);
                                        e.preventDefault();
                                    }
                                },
                            }),
                            h('span', { className: 'chrono-entry-edit__minutes-label' }, formatMinutes(activeMinutes)),
                            h('button', {
                                type: 'button',
                                className: 'chrono-history__tiny-btn',
                                onClick: () => commitMinutes(activeMinutes + 5),
                                'aria-label': 'Добавить 5 минут',
                            }, '+'),
                        ),
                    ),
                    h('div', { className: 'chrono-entry-edit__actions' },
                        h('button', { type: 'button', className: 'planning-btn planning-btn--primary', onClick: onClose }, 'Готово'),
                        h('button', {
                            type: 'button',
                            className: 'planning-btn planning-btn--danger',
                            onClick: () => {
                                rowEntries.forEach((entry) => onDeleteEntry && onDeleteEntry(entry.id));
                                onClose();
                            },
                        }, isParallel ? 'Удалить группу' : 'Удалить запись'),
                    ),
                    selectedActivity && selectedActivity.id && h(ChronoCategoryRow, {
                        activity: selectedActivity,
                        onSave: (category) => updateSelectedActivity({ category }),
                    }),
                    selectedActivity && selectedActivity.id && h(ChronoTargetRow, {
                        label: 'За день:',
                        valueInMinutes: (selectedActivity.budgetMinutesPerDay || selectedActivity.targetMinutesPerDay) || 0,
                        initialKind: selectedActivity.budgetMinutesPerDay ? 'budget' : 'target',
                        onSave: ({ kind, minutes }) => updateSelectedActivity({
                            [kind === 'budget' ? 'budgetMinutesPerDay' : 'targetMinutesPerDay']: minutes,
                        }),
                    }),
                    selectedActivity && selectedActivity.id && h(ChronoTargetRow, {
                        label: 'За неделю:',
                        valueInMinutes: (selectedActivity.budgetMinutesPerWeek || selectedActivity.targetMinutesPerWeek) || 0,
                        initialKind: selectedActivity.budgetMinutesPerWeek ? 'budget' : 'target',
                        onSave: ({ kind, minutes }) => updateSelectedActivity({
                            [kind === 'budget' ? 'budgetMinutesPerWeek' : 'targetMinutesPerWeek']: minutes,
                        }),
                    }),
                    selectedActivity && selectedActivity.id && h(ChronoLinkRow, {
                        activity: selectedActivity,
                        tasks,
                        projects,
                        onLink: updateSelectedActivity,
                    }),
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
            h('div', { className: 'chrono-duration__link-title' }, 'Связь с планом'),
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

    function ChronoUntrackedAllocationPanel({ draft, activities, onChange, onParallelChange, onRemove, onConfirm, onConfirmNow, onCancel }) {
        const steps = buildUntrackedSteps(draft, activities);
        const flowRef = useRef(null);
        useEffect(() => {
            const el = flowRef.current;
            if (!el) return undefined;
            const stopTouch = (e) => {
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            };
            el.addEventListener('touchstart', stopTouch, { passive: true });
            el.addEventListener('touchmove', stopTouch, { passive: true });
            el.addEventListener('touchend', stopTouch, { passive: true });
            el.addEventListener('touchcancel', stopTouch, { passive: true });
            return () => {
                el.removeEventListener('touchstart', stopTouch);
                el.removeEventListener('touchmove', stopTouch);
                el.removeEventListener('touchend', stopTouch);
                el.removeEventListener('touchcancel', stopTouch);
            };
        }, []);
        if (!draft || steps.length === 0) return null;
        const total = Math.max(1, Math.round(Number(draft.minutes) || 0));
        const isSingle = steps.length === 1;
        const canToggleParallel = steps.length > 0;
        return h('div', {
            ref: flowRef,
            className: 'chrono-untracked-flow no-swipe-zone',
            'aria-label': 'Распределение не записанного времени',
            onPointerDown: (e) => e.stopPropagation(),
            onPointerUp: (e) => e.stopPropagation(),
            onPointerCancel: (e) => e.stopPropagation(),
        },
            h('div', { className: 'chrono-untracked-flow__head' },
                h('span', { className: 'chrono-untracked-flow__title' }, 'Распределить время'),
                h('strong', { className: 'chrono-untracked-flow__total' }, formatMinutes(total)),
                h('button', {
                    type: 'button',
                    className: 'chrono-untracked-flow__close',
                    onClick: onCancel,
                    'aria-label': 'Отменить распределение',
                }, '×'),
            ),
            isSingle && h('div', { className: 'chrono-untracked-flow__single' + (steps[0].isParallel ? ' is-parallel' : '') },
                h('div', { className: 'chrono-untracked-flow__single-row' },
                    h('span', { className: 'chrono-untracked-flow__activity' },
                        `${steps[0].activity.emoji || '·'} ${steps[0].activity.name || 'Занятие'}`),
                    h('button', {
                        type: 'button',
                        className: 'chrono-untracked-flow__remove',
                        onClick: () => onRemove && onRemove(steps[0].id),
                        'aria-label': `Убрать ${steps[0].activity.name || 'занятие'} из распределения`,
                        title: 'Убрать',
                    }, '×'),
                    canToggleParallel && h('button', {
                        type: 'button',
                        className: 'chrono-untracked-flow__parallel-toggle' + (steps[0].isParallel ? ' active' : ''),
                        role: 'switch',
                        'aria-checked': steps[0].isParallel ? 'true' : 'false',
                        'aria-label': `${steps[0].activity.name || 'Занятие'}: параллельно`,
                        title: steps[0].isParallel ? 'Параллельно' : 'Обычная часть',
                        onClick: () => onParallelChange && onParallelChange(steps[0].id, !steps[0].isParallel),
                    },
                        h('span', { className: 'chrono-untracked-flow__parallel-switch', 'aria-hidden': 'true' },
                            h('span', { className: 'chrono-untracked-flow__parallel-knob' }),
                        ),
                    ),
                    h('span', { className: 'chrono-untracked-flow__minutes' }, formatMinutes(total)),
                ),
                h('div', { className: 'chrono-untracked-flow__bar', 'aria-hidden': 'true' },
                    h('span', { className: 'chrono-untracked-flow__bar-fill', style: { width: '100%' } }),
                ),
            ),
            !isSingle && h('div', { className: 'chrono-untracked-flow__sliders' },
                steps.map((step) => {
                    const minutes = Math.max(0, Math.round(Number(step.minutes) || 0));
                    const pct = Math.round((minutes / total) * 100);
                    const isParallel = !!step.isParallel;
                    const showParallelToggle = canToggleParallel && (!step.hasParallelAnchor || isParallel);
                    return h('div', {
                        key: step.id,
                        className: 'chrono-untracked-flow__slider-row' + (isParallel ? ' is-parallel' : ''),
                    },
                        h('span', { className: 'chrono-untracked-flow__slider-top' },
                            h('span', { className: 'chrono-untracked-flow__activity' },
                                `${step.activity.emoji || '·'} ${step.activity.name || 'Занятие'}`),
                            h('button', {
                                type: 'button',
                                className: 'chrono-untracked-flow__remove',
                                onClick: () => onRemove && onRemove(step.id),
                                'aria-label': `Убрать ${step.activity.name || 'занятие'} из распределения`,
                                title: 'Убрать',
                            }, '×'),
                            showParallelToggle && h('button', {
                                type: 'button',
                                className: 'chrono-untracked-flow__parallel-toggle' + (isParallel ? ' active' : ''),
                                role: 'switch',
                                'aria-checked': isParallel ? 'true' : 'false',
                                'aria-label': `${step.activity.name || 'Занятие'}: параллельно`,
                                title: isParallel ? 'Параллельно' : 'Обычная часть',
                                onClick: () => onParallelChange && onParallelChange(step.id, !isParallel),
                            },
                                h('span', { className: 'chrono-untracked-flow__parallel-switch', 'aria-hidden': 'true' },
                                    h('span', { className: 'chrono-untracked-flow__parallel-knob' }),
                                ),
                            ),
                            h('span', { className: 'chrono-untracked-flow__minutes' },
                                isParallel ? formatMinutes(minutes) : `${formatMinutes(minutes)} · ${pct}%`),
                        ),
                        h('input', {
                            className: 'chrono-untracked-flow__range',
                            type: 'range',
                            min: 0,
                            max: total,
                            step: 1,
                            value: minutes,
                            style: { '--chrono-range-pct': `${pct}%` },
                            disabled: isParallel,
                            'aria-label': `${step.activity.name || 'Занятие'}: минуты`,
                            onChange: (e) => onChange && onChange(step.id, Number(e.target.value)),
                        }),
                    );
                }),
            ),
            h('div', { className: 'chrono-untracked-flow__actions' },
                steps.length > 1 && h('button', {
                    type: 'button',
                    className: 'planning-btn chrono-untracked-flow__confirm',
                    onClick: onConfirm,
                }, 'По очереди'),
                h('button', {
                    type: 'button',
                    className: 'planning-btn planning-btn--primary chrono-untracked-flow__confirm-now',
                    onClick: onConfirmNow,
                }, 'Подтвердить'),
            ),
        );
    }

    function getParallelActivityOptions(activities, currentActivityId) {
        return (Array.isArray(activities) ? activities : [])
            .filter((item) => item && item.id && item.id !== currentActivityId && !item.archived)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }

    function ChronoDurationModal({ activity, activities, currentMinutes, scopeLabel, timerRunning, tasks, projects, entries, activeDate, initialMinutes, confirmationSteps, confirmationIndex, onAdd, onSetTarget, onCategory, onLink, onStartTimer, onClose }) {
        const initialWheelTime = splitMinutesForWheel(initialMinutes || 30);
        const [hourIdx, setHourIdx] = useState(initialWheelTime.hours);
        const [minuteIdx, setMinuteIdx] = useState(initialWheelTime.minutes);
        const [parallelEnabled, setParallelEnabled] = useState(false);
        const [parallelActivityId, setParallelActivityId] = useState('');
        const overlayRef = useRef(null);
        const smartSuggestions = useMemo(() => buildSmartSuggestions(activity, entries, activeDate),
            [activity && activity.id, entries, activeDate]);
        const parallelOptions = useMemo(() => getParallelActivityOptions(activities, activity && activity.id),
            [activities, activity && activity.id]);
        const selectedParallelActivityId = parallelOptions.some((item) => item.id === parallelActivityId)
            ? parallelActivityId
            : (parallelOptions[0] && parallelOptions[0].id) || '';
        const effectiveParallelActivityId = parallelEnabled ? selectedParallelActivityId : '';
        const isConfirmationFlow = Array.isArray(confirmationSteps) && confirmationSteps.length > 0;


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

        useEffect(() => {
            setParallelEnabled(false);
            setParallelActivityId('');
        }, [activity && activity.id]);

        useEffect(() => {
            const next = splitMinutesForWheel(initialMinutes || 30);
            setHourIdx(next.hours);
            setMinuteIdx(next.minutes);
        }, [activity && activity.id, initialMinutes]);

        useEffect(() => {
            if (!parallelEnabled || parallelActivityId) return;
            if (parallelOptions.length > 0) setParallelActivityId(parallelOptions[0].id);
        }, [parallelEnabled, parallelActivityId, parallelOptions]);

        function applyPreset(min) {
            const close = onAdd(min, { parallelActivityId: effectiveParallelActivityId });
            if (close !== false) onClose();
        }

        function applyCustom() {
            const min = hourIdx * 60 + minuteIdx;
            if (min <= 0) return;
            const close = onAdd(min, { parallelActivityId: effectiveParallelActivityId });
            if (close !== false) onClose();
        }

        const WheelColumn = HEYS.WheelColumn;

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-duration-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            Array.isArray(confirmationSteps) && confirmationSteps.length > 1 && h('div', {
                className: 'chrono-duration__step-pill',
                onClick: (e) => e.stopPropagation(),
            },
                confirmationSteps.map((step, index) => h('span', {
                    key: step.id,
                    className: 'chrono-duration__step-pill-item' + (index === confirmationIndex ? ' active' : ''),
                }, `${step.activity.emoji || '·'} ${step.activity.name || 'Занятие'}`)),
            ),
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
                    !isConfirmationFlow && h('div', { className: 'chrono-duration__parallel' },
                        h('button', {
                            type: 'button',
                            className: 'chrono-duration__parallel-toggle' + (parallelEnabled ? ' active' : ''),
                            role: 'switch',
                            'aria-checked': parallelEnabled ? 'true' : 'false',
                            disabled: parallelOptions.length === 0,
                            onClick: () => {
                                if (parallelOptions.length === 0) return;
                                setParallelEnabled((value) => !value);
                            },
                        },
                            h('span', { className: 'chrono-duration__parallel-copy' },
                                h('span', { className: 'chrono-duration__parallel-title' }, 'Параллельно'),
                                h('span', { className: 'chrono-duration__parallel-subtitle' },
                                    parallelEnabled && effectiveParallelActivityId
                                        ? 'Время прибавится двум активностям'
                                        : 'Доп. занятие в то же время'),
                            ),
                            h('span', { className: 'chrono-duration__parallel-switch', 'aria-hidden': 'true' },
                                h('span', { className: 'chrono-duration__parallel-knob' }),
                            ),
                        ),
                        parallelEnabled && parallelOptions.length > 0 && h('select', {
                            className: 'planning-modal__input chrono-duration__parallel-select',
                            value: selectedParallelActivityId,
                            onChange: (e) => setParallelActivityId(e.target.value),
                            'aria-label': 'Параллельная активность',
                        },
                            parallelOptions.map((item) => h('option', { key: item.id, value: item.id },
                                `${item.emoji || '·'} ${item.name || 'Занятие'}`,
                            )),
                        ),
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

    function ChronoBubble({ activity, minutes, maxMin, sizeScale, scope, planFact, badge, onClick, onLongPress,
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
        const progress = getBubbleProgress(activity, minutes, scope, planFact);
        const hasProgress = progress !== null;
        const missingLinkedPlan = !hasProgress && planFact && Number(planFact.planned) <= 0;
        const progressDeg = hasProgress ? Math.round(progress.value * 360) : 0;
        const ringColor = ringColorForProgress(progress, activity.hue);
        const goalKind = progress ? progress.kind : null;
        const compactPlan = hasProgress && diameter < 108;
        const nameFontSize = Math.max(9.2, Math.min(20, diameter * 0.118));
        const timeFontSize = Math.max(11, Math.min(23, diameter * 0.138));
        const planFontSize = Math.max(8.5, Math.min(13, diameter * 0.09));
        const progressLabel = goalKind === 'budget' ? 'лимит' : goalKind === 'target' ? 'цель' : 'план';
        const title = hasProgress
            ? `${activity.name} · факт ${formatMinutes(minutes)} · ${progressLabel} ${formatMinutes(progress.minutes)}`
            : missingLinkedPlan
                ? `${activity.name} · факт ${formatMinutes(minutes)} · план не задан`
                : `${activity.name} · ${formatMinutes(minutes)}`;

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
            dragRef.current.lastClientX = e.clientX || 0;
            dragRef.current.lastClientY = e.clientY || 0;
            if (!dragRef.current.rafId && typeof onDragMove === 'function') {
                dragRef.current.rafId = requestAnimationFrame(() => {
                    dragRef.current.rafId = 0;
                    onDragMove(dragRef.current.lastDx, dragRef.current.lastDy,
                        dragRef.current.lastClientX, dragRef.current.lastClientY);
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
                + (hasProgress ? ' has-progress' : '')
                + (goalKind === 'plan' ? ' is-plan' : '')
                + (goalKind === 'budget' ? ' is-budget' : '')
                + (progress && progress.kind !== 'budget' && progress.value >= 1 ? ' is-complete' : '')
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
                '--bubble-plan-font': planFontSize.toFixed(1) + 'px',
            },
        },
            h('button', {
                type: 'button',
                className: 'chrono-bubble'
                    + (hasProgress || missingLinkedPlan ? ' chrono-bubble--with-plan' : '')
                    + (compactPlan ? ' chrono-bubble--compact-plan' : ''),
                style: { '--bg': bg },
                onClick: handleClick,
                onPointerDown: handlePointerDown,
                onPointerMove: handlePointerMove,
                onPointerUp: handlePointerEnd,
                onPointerCancel: handlePointerEnd,
                onPointerLeave: handlePointerEnd,
                title,
                'aria-label': title,
            },
                h('span', { className: 'chrono-bubble__emoji', 'aria-hidden': 'true' }, activity.emoji || '·'),
                h('span', { className: 'chrono-bubble__name' }, activity.name),
                h('span', { className: 'chrono-bubble__time' }, formatMinutes(minutes)),
                hasProgress && h('span', { className: 'chrono-bubble__plan' },
                    `${progressLabel} ${formatMinutes(progress.minutes)}`,
                ),
                missingLinkedPlan && h('span', { className: 'chrono-bubble__plan is-missing' }, 'без плана'),
            ),
            badge && h('span', {
                key: badge.key,
                className: 'chrono-bubble__badge',
                style: { '--badge-bg': ringColor },
            }, '+' + formatMinutes(badge.minutes)),
        );
    }

    function ChronoStrip({ activities, onPick, onAddNew, trashRef, trashState }) {
        const trashDragging = !!(trashState && trashState.dragging);
        const trashActive = !!(trashState && trashState.active);
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
            trashRef && h('div', {
                key: '__trash__',
                ref: trashRef,
                className: 'chrono-strip__trash'
                    + (trashDragging ? ' is-dragging' : '')
                    + (trashActive ? ' is-active' : ''),
                title: 'Перетащите сюда круг, чтобы убрать из текущего периода',
                'aria-hidden': 'true',
            },
                h('svg', {
                    width: 20, height: 20, viewBox: '0 0 22 22', fill: 'none',
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

        const activitiesById = useMemo(() => {
            const map = new Map();
            activities.forEach((a) => map.set(a.id, a));
            return map;
        }, [activities]);

        if (maxDayTotal <= 0) return null;

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

    function ChronoOverviewPanel({ insights, balance, streaks, timeOfDay, lastAdded, loggedRows, totalMinutes, untracked, untrackedActive, variant, onUntrackedClick, onLoggedRowClick, onLoggedRowsReorder }) {
        const list = Array.isArray(insights) ? insights : [];
        const top = list.find((item) => item && item.kind === 'top');
        const alerts = list.filter((item) => item && item.kind !== 'top').slice(0, 2);
        const categories = Array.isArray(balance) ? balance.filter((item) => item && item.minutes > 0).slice(0, 4) : [];
        const streakList = Array.isArray(streaks) ? streaks.slice(0, 3) : [];
        const rows = Array.isArray(loggedRows) ? loggedRows : [];
        const isModal = variant === 'modal';
        const [dragRows, setDragRows] = useState(null);
        const [draggingRowId, setDraggingRowId] = useState('');
        const rowRefs = useRef(new Map());
        const ledgerDragRef = useRef({
            active: false,
            suppressClick: false,
            startId: '',
            startX: 0,
            startY: 0,
            timer: 0,
            rows: null,
        });
        const pattern = timeOfDay && timeOfDay.headline ? timeOfDay.headline : '';
        const untrackedEndLabel = untracked && untracked.endKind === 'sleep'
            ? `сон ${untracked.endLabel}`
            : 'сейчас';
        const untrackedContextLabel = untracked
            ? (untracked.sinceKind === 'last-entry'
                ? `с последней записи ${untracked.sinceLabel} → ${untrackedEndLabel}`
                : `с пробуждения ${untracked.wakeLabel || untracked.sinceLabel} → ${untrackedEndLabel}`)
            : '';
        const untrackedDurationLabel = untracked
            ? (untracked.durationLabel || formatUntrackedDurationLabel(untracked.minutes) || untracked.hoursLabel || '')
            : '';
        const showUntrackedLine = !!untracked;

        // По дефолту свёрнуто; локальный UI-prefs ключ, не client-data (не синкается).
        const [collapsed, setCollapsed] = useState(() => {
            try {
                const stored = HEYS.utils && typeof HEYS.utils.lsGet === 'function'
                    ? HEYS.utils.lsGet(OVERVIEW_COLLAPSED_KEY, null)
                    : null;
                if (stored === null || stored === undefined) return true;
                return stored === true || stored === 1 || stored === '1';
            } catch (e) { return true; }
        });
        const toggle = useCallback(() => {
            setCollapsed((prev) => {
                const next = !prev;
                try {
                    if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                        HEYS.utils.lsSet(OVERVIEW_COLLAPSED_KEY, next ? 1 : 0);
                    }
                }
                catch (e) { /* noop */ }
                return next;
            });
        }, []);

        const clearLedgerPress = useCallback(() => {
            if (ledgerDragRef.current.timer) {
                clearTimeout(ledgerDragRef.current.timer);
                ledgerDragRef.current.timer = 0;
            }
        }, []);

        useEffect(() => () => clearLedgerPress(), [clearLedgerPress]);

        useEffect(() => {
            if (!ledgerDragRef.current.active) setDragRows(null);
        }, [rows]);

        function reorderRows(listRows, sourceId, targetId) {
            if (!sourceId || !targetId || sourceId === targetId) return listRows;
            const next = listRows.slice();
            const from = next.findIndex((item) => item.id === sourceId);
            const to = next.findIndex((item) => item.id === targetId);
            if (from < 0 || to < 0 || from === to) return listRows;
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return next;
        }

        const getTargetLedgerRowId = useCallback((clientY) => {
            let best = '';
            let bestDist = Infinity;
            rowRefs.current.forEach((node, id) => {
                if (!node) return;
                const rect = node.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const dist = Math.abs(clientY - mid);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = id;
                }
            });
            return best;
        }, []);

        const handleLedgerPointerDown = useCallback((row, e, immediate) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            clearLedgerPress();
            ledgerDragRef.current = {
                active: !!immediate,
                suppressClick: !!immediate,
                startId: row.id,
                startX: e.clientX || 0,
                startY: e.clientY || 0,
                timer: 0,
                rows: rows.slice(),
            };
            if (immediate) {
                ledgerDragRef.current.active = true;
                ledgerDragRef.current.suppressClick = true;
                ledgerDragRef.current.rows = rows.slice();
                setDragRows(rows.slice());
                setDraggingRowId(row.id);
                e.preventDefault();
            } else {
                ledgerDragRef.current.timer = setTimeout(() => {
                    ledgerDragRef.current.active = true;
                    ledgerDragRef.current.suppressClick = true;
                    ledgerDragRef.current.rows = rows.slice();
                    setDragRows(rows.slice());
                    setDraggingRowId(row.id);
                }, LEDGER_LONG_PRESS_MS);
            }
            try {
                if (e.pointerId !== undefined && e.currentTarget && e.currentTarget.setPointerCapture) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                }
            } catch (_) { /* noop */ }
        }, [clearLedgerPress, rows]);

        const handleLedgerPointerMove = useCallback((e) => {
            const state = ledgerDragRef.current;
            if (!state.startId) return;
            const dx = (e.clientX || 0) - state.startX;
            const dy = (e.clientY || 0) - state.startY;
            if (!state.active) {
                if (Math.hypot(dx, dy) > LEDGER_DRAG_CANCEL_PX) clearLedgerPress();
                return;
            }
            e.preventDefault();
            const targetId = getTargetLedgerRowId(e.clientY || 0);
            if (!targetId || targetId === state.startId) return;
            const nextRows = reorderRows(state.rows || rows, state.startId, targetId);
            if (nextRows === state.rows) return;
            state.rows = nextRows;
            setDragRows(nextRows);
        }, [clearLedgerPress, getTargetLedgerRowId, rows]);

        const finishLedgerPointer = useCallback((e) => {
            clearLedgerPress();
            const state = ledgerDragRef.current;
            try {
                if (e && e.pointerId !== undefined && e.currentTarget && e.currentTarget.releasePointerCapture) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
            } catch (_) { /* noop */ }
            if (state.active && Array.isArray(state.rows)) {
                const changed = state.rows.map((item) => item.id).join('|') !== rows.map((item) => item.id).join('|');
                if (changed && typeof onLoggedRowsReorder === 'function') onLoggedRowsReorder(state.rows);
            }
            const suppressClick = state.suppressClick;
            ledgerDragRef.current = {
                active: false,
                suppressClick,
                startId: '',
                startX: 0,
                startY: 0,
                timer: 0,
                rows: null,
            };
            setDraggingRowId('');
            setDragRows(null);
        }, [clearLedgerPress, onLoggedRowsReorder, rows]);

        const handleLedgerClick = useCallback((row, e) => {
            if (ledgerDragRef.current.suppressClick) {
                ledgerDragRef.current.suppressClick = false;
                e.preventDefault();
                return;
            }
            onLoggedRowClick && onLoggedRowClick(row);
        }, [onLoggedRowClick]);

        const visibleRows = draggingRowId && dragRows ? dragRows : rows;
        const showBody = isModal;
        const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
        if (!isModal && rows.length === 0 && !lastAdded && !untracked && total <= 0) return null;
        if (!top && categories.length === 0 && alerts.length === 0 && streakList.length === 0 && !pattern && !lastAdded && rows.length === 0 && !untracked && total <= 0) return null;

        return h('div', {
            className: 'chrono-overview'
                + (collapsed && !isModal ? ' is-collapsed' : '')
                + (isModal ? ' chrono-overview--modal' : ''),
            'aria-label': 'Сводка хронометража',
        },
            rows.length > 0 && h('div', { className: 'chrono-overview__ledger' },
                visibleRows.map((row) => h('button', {
                    key: row.id,
                    type: 'button',
                    ref: (node) => {
                        if (node) rowRefs.current.set(row.id, node);
                        else rowRefs.current.delete(row.id);
                    },
                    className: 'chrono-overview__ledger-row'
                        + (row.id === draggingRowId ? ' is-dragging' : '')
                        + (draggingRowId ? ' is-reorder-mode' : ''),
                    onPointerDown: (e) => handleLedgerPointerDown(row, e, false),
                    onPointerMove: handleLedgerPointerMove,
                    onPointerUp: finishLedgerPointer,
                    onPointerCancel: finishLedgerPointer,
                    onClick: (e) => handleLedgerClick(row, e),
                    title: draggingRowId ? 'Перетащите строку' : 'Изменить запись',
                },
                    h('span', {
                        className: 'chrono-overview__ledger-handle',
                        'aria-hidden': 'true',
                        onPointerDown: (e) => {
                            e.stopPropagation();
                            handleLedgerPointerDown(row, e, true);
                        },
                    }, '↕'),
                    h('span', { className: 'chrono-overview__ledger-time' }, row.timeRange),
                    h('span', { className: 'chrono-overview__ledger-duration' }, `· ${row.durationLabel}`),
                    h('span', { className: 'chrono-overview__ledger-name' },
                        h('span', { className: 'chrono-overview__ledger-name-dot', 'aria-hidden': 'true' }, '·'),
                        h('span', { className: 'chrono-overview__ledger-name-text' }, row.name),
                    ),
                )),
            ),
            showUntrackedLine && h('div', {
                className: 'chrono-overview__last' + (!lastAdded ? ' chrono-overview__last--badge-only' : ''),
            },
                lastAdded && h('span', { className: 'chrono-overview__last-time' }, lastAdded.timeLabel),
                lastAdded && h('span', { className: 'chrono-overview__last-now' },
                    `${lastAdded.nowKind === 'sleep' ? 'сон' : 'сейчас'} ${lastAdded.nowLabel}`),
                untracked && h('span', {
                    className: 'chrono-overview__untracked-text',
                    title: untrackedContextLabel || undefined,
                }, untrackedActive ? untrackedDurationLabel : `не учтено ${untrackedDurationLabel}`),
                untracked && h('button', {
                    type: 'button',
                    className: 'chrono-overview__untracked-action' + (untrackedActive ? ' active' : ''),
                    onClick: onUntrackedClick,
                    'aria-pressed': untrackedActive ? 'true' : 'false',
                    title: untracked.sinceKind === 'last-entry'
                        ? `С последней записи в ${untracked.sinceLabel}`
                        : (untracked.wakeLabel ? `С пробуждения в ${untracked.wakeLabel}` : undefined),
                }, untrackedActive ? 'Выбирайте актив' : 'Записать'),
            ),
            total > 0 && h('div', {
                className: 'chrono-overview__total',
                title: `Суммарное время ${formatMinutes(total)}`,
                'aria-label': `Всего хронометрировано: ${formatMinutes(total)}`,
            },
                h('span', { className: 'chrono-overview__total-label' }, 'Хронометрировано'),
                h('strong', { className: 'chrono-overview__total-value' }, formatMinutes(total)),
            ),
            showBody && h('div', { id: isModal ? undefined : 'chrono-overview-body', className: 'chrono-overview__body' },
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
                streakList.length > 0 && h('div', { className: 'chrono-overview__streaks', 'aria-label': 'Серии по целям' },
                    streakList.map((s, i) => h('span', {
                        key: s.activity.id,
                        className: 'chrono-overview__streak' + (i === 0 ? ' is-best' : '') + (s.kind === 'budget' ? ' is-budget' : ''),
                        title: `${s.activity.name}: ${s.streak} дн. подряд ${s.kind === 'budget' ? 'в лимите' : 'в цели'}`,
                    },
                        h('span', { className: 'chrono-overview__streak-flame', 'aria-hidden': 'true' }, s.kind === 'budget' ? '🛡️' : '🔥'),
                        h('span', { className: 'chrono-overview__streak-emoji', 'aria-hidden': 'true' }, s.activity.emoji || ''),
                        h('strong', null, `${s.streak} дн.`),
                    )),
                ),
                pattern && h('div', { className: 'chrono-overview__pattern' },
                    h('span', { className: 'chrono-overview__pattern-icon', 'aria-hidden': 'true' }, '🕑'),
                    h('span', null, pattern),
                ),
            ),
        );
    }

    function ChronoOverviewModal({ dateLabel, overviewProps, onClose }) {
        const overlayRef = useRef(null);

        useEffect(() => {
            const ModalManager = HEYS.ModalManager;
            if (!ModalManager || typeof ModalManager.register !== 'function') return undefined;
            return ModalManager.register('chrono-overview', () => onClose());
        }, [onClose]);

        useEffect(() => {
            function onKey(e) { if (e.key === 'Escape') onClose(); }
            window.addEventListener('keydown', onKey);
            return () => window.removeEventListener('keydown', onKey);
        }, [onClose]);

        return h('div', {
            className: 'planning-modal-overlay planning-modal-overlay--nested chrono-overview-modal-overlay',
            ref: overlayRef,
            onClick: (e) => { if (e.target === overlayRef.current) onClose(); },
        },
            h('div', { className: 'planning-modal planning-modal--picker chrono-overview-modal', onClick: (e) => e.stopPropagation() },
                h('div', { className: 'planning-modal__header' },
                    h('span', null, 'Сводка', dateLabel ? ` · ${dateLabel}` : ''),
                    h('button', { type: 'button', className: 'planning-modal__close', onClick: onClose, 'aria-label': 'Закрыть' }, '×'),
                ),
                h('div', { className: 'planning-modal__body chrono-overview-modal__body' },
                    h(ChronoOverviewPanel, {
                        ...(overviewProps || {}),
                        variant: 'modal',
                    }),
                ),
            ),
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

    function formatSignedMinutesDelta(delta) {
        const d = Number(delta) || 0;
        return `${d > 0 ? '+' : d < 0 ? '−' : ''}${formatMinutes(Math.abs(Math.round(d)))}`;
    }

    function buildWeeklySignal(report) {
        const trend = report && report.trend;
        if (!trend) return null;
        const candidates = [];
        const focusDelta = Number(trend.focus && trend.focus.delta) || 0;
        const drainDelta = Number(trend.drain && trend.drain.delta) || 0;
        const totalDelta = Number(trend.totalDelta) || 0;
        if (focusDelta !== 0) {
            candidates.push({
                id: 'focus',
                weight: Math.abs(focusDelta) * 1.2,
                tone: focusDelta > 0 ? 'good' : 'bad',
                label: 'К прошлой неделе',
                title: focusDelta > 0 ? 'Фокус вырос' : 'Фокус снизился',
                value: formatSignedMinutesDelta(focusDelta),
            });
        }
        if (drainDelta !== 0) {
            candidates.push({
                id: 'drain',
                weight: Math.abs(drainDelta) * 1.1,
                tone: drainDelta > 0 ? 'bad' : 'good',
                label: 'К прошлой неделе',
                title: drainDelta > 0 ? 'Потери выросли' : 'Потери снизились',
                value: formatSignedMinutesDelta(drainDelta),
            });
        }
        if (totalDelta !== 0) {
            candidates.push({
                id: 'total',
                weight: Math.abs(totalDelta) * 0.65,
                tone: 'neutral',
                label: 'К прошлой неделе',
                title: totalDelta > 0 ? 'Объём вырос' : 'Объём снизился',
                value: formatSignedMinutesDelta(totalDelta),
            });
        }
        return candidates.sort((a, b) => b.weight - a.weight)[0] || null;
    }

    function ChronoWeeklyReport({ report, onPickDay }) {
        const [scoreOpen, setScoreOpen] = useState(false);
        if (!report) return null;
        const signal = buildWeeklySignal(report);
        const days = Array.isArray(report.days) ? report.days : [];
        const maxDayMinutes = days.reduce((max, day) => Math.max(max, Number(day.minutes) || 0), 0);
        const scoreFacts = [
            `${report.daysTracked || 0} из 7 дней`,
            `Фокус ${Math.round((Number(report.focusShare) || 0) * 100)}%`,
            `Потери ${Math.round((Number(report.drainShare) || 0) * 100)}%`,
        ];
        if (report.hasGoals) {
            scoreFacts.push(`Цели ${Math.round((Number(report.goalHitRate) || 0) * 100)}%`);
        }
        return h('div', { className: 'chrono-weekly-report', 'aria-label': 'Отчёт недели' },
            h('div', { className: 'chrono-weekly-report__head' },
                h('div', null,
                    h('div', { className: 'chrono-weekly-report__eyebrow' }, 'Неделя'),
                    h('div', { className: 'chrono-weekly-report__title' }, report.headline),
                ),
                h('button', {
                    type: 'button',
                    className: 'chrono-weekly-report__score',
                    onClick: () => setScoreOpen((open) => !open),
                    'aria-expanded': scoreOpen ? 'true' : 'false',
                    'aria-controls': 'chrono-weekly-score-details',
                    title: 'Из чего сложился ритм',
                },
                    h('span', null, 'Ритм'),
                    h('strong', null, report.score),
                ),
            ),
            scoreOpen && h('div', {
                id: 'chrono-weekly-score-details',
                className: 'chrono-weekly-report__score-details',
            }, scoreFacts.map((fact) => h('span', { key: fact }, fact))),
            h('div', { className: 'chrono-weekly-report__lead' }, report.recommendation),
            days.length > 0 && h('div', { className: 'chrono-weekly-report__days' },
                h('div', { className: 'chrono-weekly-report__label' }, 'По дням'),
                h('div', { className: 'chrono-weekly-report__day-grid' },
                    days.map((day, index) => {
                        const minutes = Math.max(0, Number(day.minutes) || 0);
                        const level = maxDayMinutes > 0 ? minutes / maxDayMinutes : 0;
                        return h('button', {
                            key: day.date,
                            type: 'button',
                            className: 'chrono-weekly-report__day' + (minutes <= 0 ? ' is-empty' : ''),
                            style: { '--day-level': String(level) },
                            onClick: () => onPickDay && onPickDay(day.date),
                            'aria-label': `${formatDateLabel(day.date)} · ${formatMinutes(minutes)}. Открыть день`,
                            title: `${formatDateLabel(day.date)} · ${formatMinutes(minutes)}`,
                        },
                            h('span', { className: 'chrono-weekly-report__day-bar', 'aria-hidden': 'true' },
                                h('span', null),
                            ),
                            h('span', { className: 'chrono-weekly-report__day-label' },
                                ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index] || formatDateLabel(day.date),
                            ),
                        );
                    }),
                ),
            ),
            h('div', { className: 'chrono-weekly-report__metrics' },
                h('div', { className: 'chrono-weekly-report__metric' },
                    h('span', { className: 'chrono-weekly-report__label' }, 'Всего'),
                    h('strong', null, formatMinutes(report.total)),
                ),
                report.top && h('div', { className: 'chrono-weekly-report__metric' },
                    h('span', { className: 'chrono-weekly-report__label' }, 'Главный фокус'),
                    h('strong', null, `${report.top.activity.emoji || ''} ${report.top.activity.name} · ${formatMinutes(report.top.minutes)}`),
                ),
            ),
            signal && h('div', { className: 'chrono-weekly-report__signal is-' + signal.tone, 'aria-label': 'Главное изменение к прошлой неделе' },
                h('span', { className: 'chrono-weekly-report__signal-label' }, signal.label),
                h('strong', null, signal.title),
                h('span', { className: 'chrono-weekly-report__signal-value' }, signal.value),
            ),
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
    const RING_PADDING = 8;         // .chrono-bubble-wrap.has-progress + визуальный stroke/shadow
    const PHYLLOTAXIS_STEP = 4;     // шаг наружу при коллизии (px)
    const PHYLLOTAXIS_MAX_ATTEMPTS = 400;

    function sizeScaleForCount(count, halfW, availableH) {
        const n = Math.max(1, Number(count) || 1);
        const byCount = n <= 4 ? 1 : Math.max(0.68, 1 - (n - 4) * 0.055);
        const byWidth = halfW > 0 ? Math.max(0.7, Math.min(1, halfW / 190)) : 1;
        // Для малого числа кругов не режем размер заранее: пусть они остаются
        // крупными, а shrink включится ниже только если фактический layout не
        // помещается. Начиная с 5 кругов включаем мягкие ступени, не резкий shrink.
        const heightTarget = n <= 4 ? 0 : (n <= 6 ? 300 : (n <= 8 ? 330 : 360));
        const byHeight = availableH > 0 && heightTarget > 0
            ? Math.max(MIN_BUBBLE_SIZE_SCALE, Math.min(1, availableH / heightTarget))
            : 1;
        return Math.max(MIN_BUBBLE_SIZE_SCALE, Math.min(1, byCount, byWidth, byHeight));
    }

    function computeRadialLayoutFit(activities, minutesByActivity, maxMin, halfW, baseSizeScale, availableH) {
        const count = Array.isArray(activities) ? activities.length : 0;
        const softMinFitScale = count <= 4 ? 0.86 : (count <= 6 ? 0.76 : (count <= 8 ? 0.68 : MIN_BUBBLE_SIZE_SCALE));
        let sizeScale = Math.max(MIN_BUBBLE_SIZE_SCALE, Math.min(1, Number(baseSizeScale) || 1));
        let layout = computeRadialLayout(activities, minutesByActivity, maxMin, halfW, sizeScale);
        const limit = Math.max(0, Number(availableH) || 0);
        if (!limit) return { ...layout, sizeScale };
        for (let i = 0; i < 4 && layout.cloudHeight > limit && sizeScale > softMinFitScale + 0.005; i += 1) {
            const ratio = Math.max(softMinFitScale, Math.min(1, (limit / layout.cloudHeight) * 0.96));
            const nextScale = Math.max(softMinFitScale, sizeScale * ratio);
            if (Math.abs(nextScale - sizeScale) < 0.005) break;
            sizeScale = nextScale;
            layout = computeRadialLayout(activities, minutesByActivity, maxMin, halfW, sizeScale);
        }
        for (let i = 0; i < 8 && sizeScale > MIN_BUBBLE_SIZE_SCALE + 0.005; i += 1) {
            const fittedH = Math.max(120, Math.min(layout.cloudHeight, limit));
            const clamped = reflowAroundOverrides(layout.positioned, {}, halfW, fittedH / 2, {}, BUBBLE_GAP);
            if (!hasBubbleOverlap(clamped, BUBBLE_GAP)) break;
            sizeScale = Math.max(MIN_BUBBLE_SIZE_SCALE, sizeScale * 0.94);
            layout = computeRadialLayout(activities, minutesByActivity, maxMin, halfW, sizeScale);
        }
        return { ...layout, sizeScale };
    }

    // Концентрический пакинг: центральный кружок (самый большой, pos[0]) пришпилен
    // в (0,0), остальные тянутся к центру лёгкой «гравитацией» и расталкиваются при
    // перекрытии → собираются плотно вокруг него, а не висят на широкой спирали.
    function packAroundCenter(items, halfW, halfH, gap) {
        const pos = items.map((p) => ({ ...p }));
        if (pos.length <= 1) return pos;
        const useBounds = halfW > 0 && halfH > 0;
        const minGap = Number.isFinite(gap) ? gap : BUBBLE_GAP;
        const ITERS = 460;
        for (let iter = 0; iter < ITERS; iter += 1) {
            // 1) гравитация к центру с затуханием (annealing): сначала стягиваем
            // плотно, к концу тяга → 0, чтобы расталкивание чисто развело кружки
            // без остаточных перекрытий и без распухания кластера.
            const gravity = 2.4 * (1 - iter / ITERS);
            if (gravity > 0.02) {
                for (let i = 1; i < pos.length; i += 1) {
                    const d = Math.hypot(pos[i].x, pos[i].y);
                    if (d < 0.5) continue;
                    const step = Math.min(d, gravity);
                    pos[i].x -= (pos[i].x / d) * step;
                    pos[i].y -= (pos[i].y / d) * step;
                }
            }
            // 2) полное расталкивание перекрытий (центральный pos[0] заблокирован)
            for (let i = 0; i < pos.length; i += 1) {
                for (let j = i + 1; j < pos.length; j += 1) {
                    const dx = pos[i].x - pos[j].x;
                    const dy = pos[i].y - pos[j].y;
                    const dist = Math.hypot(dx, dy);
                    const minDist = pos[i].radius + pos[j].radius + minGap;
                    if (dist >= minDist) continue;
                    const overlap = minDist - dist;
                    let ux;
                    let uy;
                    if (dist > 0.001) { ux = dx / dist; uy = dy / dist; }
                    else { ux = Math.cos(i * 2.4); uy = Math.sin(i * 2.4); }
                    let si = 0.5;
                    let sj = 0.5;
                    if (i === 0) { si = 0; sj = 1; } else if (j === 0) { si = 1; sj = 0; }
                    pos[i].x += ux * overlap * si; pos[i].y += uy * overlap * si;
                    pos[j].x -= ux * overlap * sj; pos[j].y -= uy * overlap * sj;
                }
            }
            pos[0].x = 0; pos[0].y = 0;
            // Без clamp: центр пришпилен, гравитация держит кластер у центра, а
            // расталкивание — зазор. Clamp здесь только мешал бы (вдавливал кружки
            // внутрь → наезды). Контейнер потом масштабируется под фактический пак.
        }
        return pos;
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
        // Меньший множитель = плотнее вокруг центрального кружка. Collision-петля
        // ниже всё равно гарантирует зазор BUBBLE_GAP, так что наезда не будет —
        // просто старт ближе к центру → компактнее.
        let orbitScale = avgR * 1.22 + BUBBLE_GAP;
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

        // Стягиваем рыхлую phyllotaxis-раскладку в плотный кластер вокруг центра.
        const packed = packAroundCenter(placed, halfW, layoutHalfH, BUBBLE_GAP);
        let packedYExtent = 0;
        packed.forEach((p) => {
            const yExt = Math.abs(p.y) + p.radius;
            if (yExt > packedYExtent) packedYExtent = yExt;
        });
        const cloudHeight = Math.max(160, packedYExtent * 2 + 56);
        return { positioned: packed, cloudHeight };
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

    function ChronoCloud({ activities, minutesByActivity, maxMin, scope, planFacts, recentBadge, onPick, onLongPress, hasInactive, onDragDelete, trashRef, onTrashStateChange }) {
        // Измерение доступной зоны для clamp'а и adaptive scale.
        const cloudRef = useRef(null);
        const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
        useEffect(() => {
            const el = cloudRef.current;
            if (!el) return undefined;
            const update = () => {
                const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
                const padTop = style ? parseFloat(style.paddingTop) || 0 : 0;
                const padBottom = style ? parseFloat(style.paddingBottom) || 0 : 0;
                setContainerSize({
                    width: el.clientWidth || 0,
                    height: Math.max(0, (el.clientHeight || 0) - padTop - padBottom),
                });
            };
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
        const planFactByActivityId = useMemo(() => new Map(
            (Array.isArray(planFacts) ? planFacts : []).map((fact) => [fact.activityId, fact])
        ), [planFacts]);

        const halfW = containerSize.width / 2;
        const baseSizeScale = sizeScaleForCount(activities.length, halfW, containerSize.height);
        // Базовый layout — чистый phyllotaxis с adaptive scale к safe zone.
        // Передаём halfW, чтобы orbits вписывались по ширине контейнера.
        const { positioned, cloudHeight, sizeScale } = useMemo(() =>
            computeRadialLayoutFit(activities, minutesByActivity, maxMin, halfW, baseSizeScale, containerSize.height),
            [activities, minutesByActivity, maxMin, halfW, baseSizeScale, containerSize.height]
        );

        const fittedCloudHeight = containerSize.height > 0
            ? Math.max(120, Math.min(cloudHeight, containerSize.height))
            : cloudHeight;
        const dragHeightReserve = drag ? (drag.releasing ? 72 : 112) : 0;
        const displayCloudHeight = fittedCloudHeight + dragHeightReserve;
        const halfH = fittedCloudHeight / 2;

        // Permanent overrides из drag-release + временный override активного drag.
        // Во время drag/release сам dragged bubble locked: он идёт за пальцем
        // или по release-анимации, а остальные bubble'ы ищут места вокруг него.
        const displayed = useMemo(
            () => {
                const overrides = { ...slotOverrides };
                const lockedIds = {};
                if (drag) {
                    // Активный drag — кружок идёт ЗА ПАЛЬЦЕМ без clamp, иначе он
                    // упирается в границы облака (середина экрана) и не доезжает
                    // до корзины внизу. Clamp нужен только на release (возврат на
                    // валидную орбиту — он уже есть в handleDragEnd).
                    overrides[drag.id] = drag.releasing
                        ? clampToBounds(drag.baseX + drag.dx, drag.baseY + drag.dy, drag.radius, halfW, halfH)
                        : { x: drag.baseX + drag.dx, y: drag.baseY + drag.dy };
                    lockedIds[drag.id] = true;
                }
                const activeGap = drag
                    ? (drag.releasing ? RELEASE_BUBBLE_GAP : DRAG_BUBBLE_GAP)
                    : BUBBLE_GAP;
                const reflowed = reflowAroundOverrides(positioned, overrides, halfW, halfH, lockedIds, activeGap);
                // reflowAroundOverrides клампит ВСЕ кружки к границам облака (и на
                // старте, и в каждой итерации) — включая тащимый. Поэтому на активном
                // drag перерисовываем тащимый кружок по СЫРОЙ позиции пальца, чтобы он
                // дотягивался до корзины внизу (вне облака). Остальные уже расступились.
                if (drag && !drag.releasing) {
                    const rawX = drag.baseX + drag.dx;
                    const rawY = drag.baseY + drag.dy;
                    return reflowed.map((p) => p.activity.id === drag.id ? { ...p, x: rawX, y: rawY } : p);
                }
                return reflowed;
            },
            [positioned, slotOverrides, halfW, halfH, drag]
        );
        const releaseRafRef = useRef(0);
        const internalTrashRef = useRef(null);
        const dropTargetRef = trashRef || internalTrashRef;
        const setTrashVisualState = useCallback((next) => {
            if (typeof onTrashStateChange === 'function') onTrashStateChange(next);
        }, [onTrashStateChange]);

        useEffect(() => () => {
            if (releaseRafRef.current) cancelAnimationFrame(releaseRafRef.current);
            // Safety: ушли с экрана посреди drag — не оставляем scroll-lock на <html>.
            try { document.documentElement.classList.remove('chrono-bubble-dragging'); } catch (_) { /* noop */ }
            setTrashVisualState({ dragging: false, active: false });
        }, [setTrashVisualState]);

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
            // Глушим прокрутку/overscroll страницы на время drag — иначе жест к
            // нижнему краю (к корзине) перехватывается scroll'ом и drag срывается.
            try { document.documentElement.classList.add('chrono-bubble-dragging'); } catch (_) { /* noop */ }
            setTrashVisualState({ dragging: true, active: false });
            setDrag({ id, baseX, baseY, dx: 0, dy: 0, radius, releasing: false });
        }, [setTrashVisualState]);

        const handleDragMove = useCallback((dx, dy, pointerX, pointerY) => {
            let overTrash = false;
            // Попадание считаем по позиции ПАЛЬЦА (pointerX/Y), а не по центру
            // кружка: центр смещён от пальца на точку захвата (у большого кружка
            // это ~радиус), из-за чего корзина срабатывала, когда палец выше неё.
            if (dropTargetRef.current && Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
                const tRect = dropTargetRef.current.getBoundingClientRect();
                overTrash = pointerX >= tRect.left && pointerX <= tRect.right
                    && pointerY >= tRect.top && pointerY <= tRect.bottom;
            }
            setTrashVisualState({ dragging: true, active: overTrash });
            setDrag((prev) => {
                if (!prev || prev.releasing) return prev;
                return { ...prev, dx, dy, overTrash };
            });
        }, [dropTargetRef, setTrashVisualState]);

        const handleDragEnd = useCallback(() => {
            // Палец отпущен — снимаем scroll-lock сразу (release-анимация чисто визуальная).
            try { document.documentElement.classList.remove('chrono-bubble-dragging'); } catch (_) { /* noop */ }
            setTrashVisualState({ dragging: false, active: false });
            setDrag((prev) => {
                if (!prev) return prev;
                if (prev.overTrash) {
                    if (typeof onDragDelete === 'function') onDragDelete(prev.id);
                    return null;
                }
                // Возврат строго в «домашнюю» позицию из packed-раскладки: большой
                // кружок всегда тяготеет в центр, меньшие — на свои места вокруг него.
                // Drag — только визуальный («погонять» + удаление), компоновку он НЕ
                // меняет, поэтому на отпускании кружок всегда возвращается в пак.
                const idealEntry = positioned.find((p) => p.activity.id === prev.id);
                const newX = idealEntry ? idealEntry.x : 0;
                const newY = idealEntry ? idealEntry.y : 0;
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
                        // НЕ пинним позицию: раскладка всегда возвращается к packed
                        // (gravity-пакинг, большой по центру). Чистим возможный
                        // прежний override этого кружка, если был.
                        setSlotOverrides((cur) => {
                            if (!(releaseId in cur)) return cur;
                            const next = { ...cur };
                            delete next[releaseId];
                            return next;
                        });
                        setDrag(null);
                        return;
                    }
                    setDrag((cur) => (cur ? { ...cur, dx: ndx, dy: ndy } : cur));
                    releaseRafRef.current = requestAnimationFrame(step);
                };
                releaseRafRef.current = requestAnimationFrame(step);
                return { ...prev, releasing: true };
            });
        }, [halfW, halfH, positioned, onDragDelete, setTrashVisualState]);

        const releasing = !!(drag && drag.releasing);

        // Drag-движение НЕ clamp'ится — пользователь может оттянуть кружок куда угодно
        // (за safe zone, в любую сторону). Clamp применяется только к release-target
        // и к layout/reflow для resting positions. Это даёт ощущение "оттянуть подальше
        // и отпустить — пузырь сам найдёт дорогу домой".

        if (!activities.length) {
            const text = hasInactive
                ? 'Нажмите на занятие выше, чтобы записать время — кружок появится здесь и будет расти.'
                : 'Нажмите «+ Новая», чтобы добавить занятие.';
            return h('div', { className: 'chrono-empty' }, text);
        }

        return h('div', {
            className: 'chrono-cloud' + (scope === 'week' ? ' chrono-cloud--week' : ''),
            ref: cloudRef,
        },
            h('div', {
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
                            planFact: planFactByActivityId.get(activity.id) || null,
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
                !trashRef && h('div', {
                    ref: internalTrashRef,
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
        const [activeDate, setActiveDate] = useState(() => Utils.chronoDateStr?.() || Utils.dateStr());
        const [durationTarget, setDurationTarget] = useState(null);
        const [durationInitialMinutes, setDurationInitialMinutes] = useState(null);
        const [untrackedDraft, setUntrackedDraft] = useState(null);
        const [pickerOpen, setPickerOpen] = useState(false);
        const [deleteTarget, setDeleteTarget] = useState(null);
        const [historyTarget, setHistoryTarget] = useState(null);
        const [entryEditTarget, setEntryEditTarget] = useState(null);
        const [toast, setToast] = useState(null);
        const [recentBadge, setRecentBadge] = useState(null);
        const [timerCompleteShown, setTimerCompleteShown] = useState(false);
        const [timerStopOpen, setTimerStopOpen] = useState(false);
        const [overviewModalOpen, setOverviewModalOpen] = useState(false);
        const [timerNow, setTimerNow] = useState(() => Date.now());
        const [dismissedTailDates, setDismissedTailDates] = useState(() => readDismissedUntrackedTailDates());
        const [tailPromptClosed, setTailPromptClosed] = useState(false);
        const chronoTrashRef = useRef(null);
        const [chronoTrashState, setChronoTrashState] = useState({ dragging: false, active: false });
        const todayStr = Utils.chronoDateStr?.() || Utils.dateStr();
        const chronoClientId = getCurrentClientId() || 'global';
        const dateLabel = scope === 'week' ? formatWeekLabel(activeDate) : formatDateLabel(activeDate);

        useEffect(() => {
            seedDefaultChronoOnce();
            if (typeof Store.compactChronoOlderThan90Once === 'function') {
                Store.compactChronoOlderThan90Once();
            }
        }, []);

        useEffect(() => {
            setDismissedTailDates(readDismissedUntrackedTailDates());
            setTailPromptClosed(false);
        }, [chronoClientId]);

        useEffect(() => {
            const syncDismissedTailDates = (event) => {
                const key = event && event.detail && event.detail.key;
                if (key && key !== UNTRACKED_TAIL_DISMISS_KEY) return;
                setDismissedTailDates(readDismissedUntrackedTailDates());
            };
            window.addEventListener('heys:planning-updated', syncDismissedTailDates);
            return () => window.removeEventListener('heys:planning-updated', syncDismissedTailDates);
        }, []);

        const activities = state.chronoActivities || [];
        const untrackedSteps = useMemo(() => buildUntrackedSteps(untrackedDraft, activities), [untrackedDraft, activities]);
        const untrackedSelectedIds = useMemo(() => new Set(
            untrackedDraft && Array.isArray(untrackedDraft.selectedIds)
                ? untrackedDraft.selectedIds.filter(Boolean)
                : []
        ), [untrackedDraft]);
        const visibleActivities = useMemo(() => activities.filter((a) =>
            !a.archived && !untrackedSelectedIds.has(a.id)
        ), [activities, untrackedSelectedIds]);
        const entries = state.chronoEntries || [];
        const snapshots = state.chronoSnapshots || [];
        const tasks = state.tasks || [];
        const projects = state.projects || [];
        const slots = state.slots || [];
        const timer = state.chronoTimer || null;
        const timerActivity = timer ? activities.find((a) => a.id === timer.activityId) : null;
        const timerPaused = !!(timer && timer.pausedAt);
        const timerRemainingMs = timer ? getTimerRemainingMs(timer, timerNow) : 0;
        const timerElapsedMs = timer ? getTimerElapsedMs(timer, timerNow) : 0;
        const timerExpired = timer ? !timerPaused && timerRemainingMs <= 0 : false;

        // Секундный тикер нужен только таймеру. Без таймера обновляем раз в
        // минуту строку «последнее добавление / сейчас».
        useEffect(() => {
            setTimerNow(Date.now());
            if (!timer && entries.length === 0 && activeDate !== todayStr) return undefined;
            const id = setInterval(() => setTimerNow(Date.now()), timer ? 1000 : 60000);
            return () => clearInterval(id);
        }, [timer && timer.activityId, timer && timer.startMs, timer && timer.pausedAt, entries.length, activeDate, todayStr]);

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

        const displayActivities = useMemo(() => buildDisplayChronoActivities(visibleActivities, minutesByActivity),
            [visibleActivities, minutesByActivity]);

        const planFacts = useMemo(() => buildChronoPlanFacts(
            displayActivities,
            tasks,
            minutesByActivity,
            slots,
            dates,
        ), [displayActivities, tasks, minutesByActivity, slots, dates]);

        const plannedActivityIds = useMemo(() => new Set(
            planFacts.filter((fact) => fact.planned > 0).map((fact) => fact.activityId)
        ), [planFacts]);

        const partition = useMemo(() => {
            const active = [];
            const inactive = [];
            displayActivities.forEach((a) => {
                if ((minutesByActivity[a.id] || 0) > 0
                    || plannedActivityIds.has(a.id)
                    || getActivityGoalForScope(a, scope)) active.push(a);
                else inactive.push(a);
            });
            return { active, inactive };
        }, [displayActivities, minutesByActivity, plannedActivityIds, scope]);

        // Cold-load syncing placeholder.
        // На первом заходе в Задачи после reload `usePlanningState` читает LS
        // синхронно — без реальных activities, потому что bootstrapClientSync
        // ещё качает их с облака. Без этой защиты юзеру показывали:
        //   • пустой strip («нет занятий», только «+ Новая») — если ничего нет
        //   • круги-плейсхолдеры с надписью «Занятие» и часами — если уже
        //     накоплены entries (минуты), но имена активностей не доехали
        // (см. mobile incident: entries горячие, activities холодные → strip
        // подгрузился через ~10 сек).
        // Чекаем именно `visibleActivities` (реальные records из LS), а не
        // partition.active (там placeholder из buildDisplayChronoActivities).
        // Реально пустой список (новый юзер) — не маскируем: после успешного
        // pull `didCompleteCloudPull()` вернёт true и empty state покажется.
        const checkPullCompleted = () =>
            !!(HEYS.Planning && typeof HEYS.Planning.didCompleteCloudPull === 'function'
                && HEYS.Planning.didCompleteCloudPull());
        const [pullCompleted, setPullCompleted] = useState(checkPullCompleted);
        useEffect(() => {
            // Двунаправленно: при переключении клиента в той же сессии
            // `didCompleteCloudPull()` вернёт false для нового клиента, пока
            // его собственный pull не завершится — снова показываем спиннер.
            const sync = () => setPullCompleted(checkPullCompleted());
            sync();
            window.addEventListener('heys:planning-updated', sync);
            return () => window.removeEventListener('heys:planning-updated', sync);
        }, []);
        const chronoSyncing = !pullCompleted && visibleActivities.length === 0;

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
            if (untrackedDraft && !untrackedDraft.confirming && activity && activity.id) {
                setUntrackedDraft((current) => {
                    if (!current || current.confirming) return current;
                    const selected = Array.isArray(current.selectedIds) ? current.selectedIds : [];
                    const exists = selected.includes(activity.id);
                    const selectedIds = exists
                        ? selected.filter((id) => id !== activity.id)
                        : selected.concat(activity.id);
                    const parallelIds = normalizeUntrackedParallelIds(current, selectedIds);
                    return {
                        ...current,
                        selectedIds,
                        parallelIds,
                        allocations: distributeUntrackedDraftAllocations(current.minutes, selectedIds, parallelIds, current.allocations),
                    };
                });
                return;
            }
            setDurationInitialMinutes(untrackedDraft ? untrackedDraft.minutes : null);
            setDurationTarget(activity);
            if (untrackedDraft) setUntrackedDraft(null);
        }, [untrackedDraft]);

        const handleLongPress = useCallback((activity) => {
            setHistoryTarget(activity);
        }, []);

        const persistChronoSegment = useCallback((activityId, minutes, options = {}) => {
            if (!activityId || minutes <= 0) {
                traceChronoUi('ui_persist_segment_rejected', {
                    reason: 'invalid_input',
                    hasActivityId: !!activityId,
                    minutes: Math.round(Number(minutes) || 0),
                    activeDate,
                }, 'warn');
                return { entry: null, ids: [] };
            }
            const parallelActivityId = options && options.parallelActivityId;
            const hasParallel = parallelActivityId && parallelActivityId !== activityId;
            const parallelGroupId = options && options.parallelGroupId
                ? options.parallelGroupId
                : (hasParallel ? `parallel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` : '');
            traceChronoUi('ui_persist_segment_start', {
                flowId: options && options.flowId || null,
                activityId,
                activeDate,
                minutes: Math.round(Number(minutes) || 0),
                hasParallel: !!hasParallel,
                sourceFlow: options && options.sourceFlow || 'duration',
            });
            const entryTiming = {};
            if (options && options.at) entryTiming.at = options.at;
            if (options && options.createdAt) entryTiming.createdAt = options.createdAt;
            if (options && options.displayGroupId) entryTiming.displayGroupId = options.displayGroupId;
            if (options && options.displayStartAt) entryTiming.displayStartAt = options.displayStartAt;
            if (options && options.displayEndAt) entryTiming.displayEndAt = options.displayEndAt;
            const entry = state.addChronoEntry({
                activityId,
                date: activeDate,
                minutes,
                flowId: options && options.flowId || null,
                parallelGroupId,
                ...entryTiming,
            });
            const ids = [];
            if (entry && entry.id) ids.push(entry.id);
            if (entry && hasParallel) {
                const parallelEntry = state.addChronoEntry({
                    activityId: parallelActivityId,
                    date: activeDate,
                    minutes,
                    flowId: options && options.flowId || null,
                    parallelGroupId,
                    ...entryTiming,
                });
                if (parallelEntry && parallelEntry.id) ids.push(parallelEntry.id);
            }
            traceChronoUi(entry && entry.id ? 'ui_persist_segment_saved' : 'ui_persist_segment_no_entry', {
                flowId: options && options.flowId || null,
                activityId,
                activeDate,
                minutes: Math.round(Number(minutes) || 0),
                entryId: entry && entry.id || null,
                ids,
                hasParallel: !!hasParallel,
                sourceFlow: options && options.sourceFlow || 'duration',
            }, entry && entry.id ? 'info' : 'warn');
            return { entry, ids };
        }, [state, activeDate]);

        const handleAddMinutes = useCallback((minutes, options = {}) => {
            if (!durationTarget || minutes <= 0) {
                traceChronoUi('ui_add_minutes_rejected', {
                    reason: !durationTarget ? 'missing_duration_target' : 'invalid_minutes',
                    minutes: Math.round(Number(minutes) || 0),
                    activeDate,
                }, 'warn');
                return;
            }
            const isUntrackedConfirming = !!(untrackedDraft && untrackedDraft.confirming);
            const flowId = options.flowId
                || (HEYS.LogTrace && typeof HEYS.LogTrace.makeFlowId === 'function'
                    ? HEYS.LogTrace.makeFlowId(isUntrackedConfirming ? 'chrono-untracked-step' : 'chrono-add')
                    : `chrono-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
            const currentConfirmIndex = Math.max(0, Number(untrackedDraft && untrackedDraft.confirmIndex) || 0);
            const currentStep = isUntrackedConfirming ? untrackedSteps[currentConfirmIndex] : null;
            const parallelActivityId = isUntrackedConfirming ? '' : options && options.parallelActivityId;
            traceChronoUi('ui_add_minutes_submit', {
                flowId,
                activityId: durationTarget.id,
                activeDate,
                minutes: Math.round(Number(minutes) || 0),
                flow: isUntrackedConfirming ? 'untracked-confirm-step' : 'duration-modal',
                confirmIndex: isUntrackedConfirming ? currentConfirmIndex : null,
            });
            const sharedUntrackedTiming = isUntrackedConfirming
                && untrackedDraft
                && Array.isArray(untrackedDraft.selectedIds)
                && untrackedDraft.selectedIds.length > 1
                && Number.isFinite(untrackedDraft.startMs)
                && Number.isFinite(untrackedDraft.endMs)
                ? {
                    at: new Date(untrackedDraft.startMs).toISOString(),
                    createdAt: new Date(untrackedDraft.endMs).toISOString(),
                    displayGroupId: untrackedDraft.groupId,
                    displayStartAt: new Date(untrackedDraft.startMs).toISOString(),
                    displayEndAt: new Date(untrackedDraft.endMs).toISOString(),
                }
                : null;
            const entryTiming = sharedUntrackedTiming || (currentStep && Number.isFinite(currentStep.startMs)
                ? {
                    at: new Date(currentStep.startMs).toISOString(),
                    createdAt: new Date((currentStep.startMs + minutes * 60000)).toISOString(),
                }
                : {});
            const { entry, ids } = persistChronoSegment(durationTarget.id, minutes, {
                flowId,
                parallelActivityId,
                sourceFlow: isUntrackedConfirming ? 'untracked-confirm-step' : 'duration-modal',
                ...entryTiming,
            });
            if (entry && entry.id) {
                setToast({ id: entry.id, ids, minutes, parallelCount: ids.length });
                setRecentBadge({ activityId: durationTarget.id, minutes, key: entry.id });
                setDurationInitialMinutes(null);
            }
            if (isUntrackedConfirming) {
                const nextStep = untrackedSteps[currentConfirmIndex + 1];
                if (nextStep && nextStep.activity) {
                    setUntrackedDraft((current) => current
                        ? { ...current, confirmIndex: currentConfirmIndex + 1 }
                        : current);
                    setDurationInitialMinutes(nextStep.minutes);
                    setDurationTarget(nextStep.activity);
                    return false;
                }
                setUntrackedDraft(null);
                setDurationInitialMinutes(null);
                setDurationTarget(null);
                return false;
            }
            return undefined;
        }, [durationTarget, untrackedDraft, untrackedSteps, persistChronoSegment, activeDate]);

        const handleUntrackedApplyNow = useCallback(() => {
            const flowId = HEYS.LogTrace && typeof HEYS.LogTrace.makeFlowId === 'function'
                ? HEYS.LogTrace.makeFlowId('chrono-untracked')
                : `chrono-untracked-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            traceChronoUi('ui_untracked_apply_now_submit', {
                flowId,
                activeDate,
                steps: untrackedSteps.length,
                draftMinutes: Math.round(Number(untrackedDraft && untrackedDraft.minutes) || 0),
            }, untrackedSteps.length ? 'info' : 'warn');
            if (!untrackedSteps.length) return;
            const sharedTiming = untrackedDraft
                && Array.isArray(untrackedDraft.selectedIds)
                && untrackedDraft.selectedIds.length > 1
                && Number.isFinite(untrackedDraft.startMs)
                && Number.isFinite(untrackedDraft.endMs)
                ? {
                    at: new Date(untrackedDraft.startMs).toISOString(),
                    createdAt: new Date(untrackedDraft.endMs).toISOString(),
                    displayGroupId: untrackedDraft.groupId,
                    displayStartAt: new Date(untrackedDraft.startMs).toISOString(),
                    displayEndAt: new Date(untrackedDraft.endMs).toISOString(),
                }
                : null;
            const saved = [];
            untrackedSteps.forEach((step) => {
                const minutes = Math.max(0, Math.round(Number(step.minutes) || 0));
                if (!step.activity || !step.activity.id || minutes <= 0) return;
                const { entry, ids } = persistChronoSegment(step.activity.id, minutes, {
                    flowId,
                    sourceFlow: 'untracked-apply-now',
                    ...(sharedTiming || {
                        at: Number.isFinite(step.startMs) ? new Date(step.startMs).toISOString() : undefined,
                        createdAt: Number.isFinite(step.endMs) ? new Date(step.endMs).toISOString() : undefined,
                    }),
                });
                if (entry && entry.id) {
                    saved.push({ entry, ids, minutes });
                }
            });
            if (saved.length > 0) {
                const lastSaved = saved[saved.length - 1];
                const allIds = saved.flatMap((item) => item.ids || []);
                const entryMinutes = saved.reduce((sum, item) => sum + item.minutes, 0);
                const realMinutes = sharedTiming
                    ? Math.max(0, Math.round(Number(untrackedDraft.minutes) || 0))
                    : entryMinutes;
                setToast({
                    id: lastSaved.entry.id,
                    ids: allIds,
                    minutes: realMinutes,
                    activityCount: saved.length,
                    parallelCount: allIds.length,
                });
                setRecentBadge({
                    activityId: lastSaved.entry.activityId,
                    minutes: lastSaved.minutes,
                    key: lastSaved.entry.id,
                });
            }
            traceChronoUi(saved.length ? 'ui_untracked_apply_now_saved' : 'ui_untracked_apply_now_no_entries', {
                flowId,
                activeDate,
                savedCount: saved.length,
                entryIds: saved.flatMap((item) => item.ids || []),
            }, saved.length ? 'info' : 'warn');
            setUntrackedDraft(null);
            setDurationTarget(null);
            setDurationInitialMinutes(null);
        }, [untrackedSteps, persistChronoSegment, untrackedDraft, activeDate]);

        const handleUndo = useCallback(() => {
            if (!toast) return;
            if (toast.kind === 'cleared') {
                // Возвращаем убранные записи (новые id — старые в tombstone'ах).
                (toast.removed || []).forEach((e) => {
                    state.addChronoEntry({
                        activityId: e.activityId,
                        date: e.date,
                        minutes: e.minutes,
                        at: e.at,
                        createdAt: e.createdAt,
                        parallelGroupId: e.parallelGroupId,
                        displayGroupId: e.displayGroupId,
                        displayStartAt: e.displayStartAt,
                        displayEndAt: e.displayEndAt,
                    });
                });
                setToast(null);
                return;
            }
            const ids = Array.isArray(toast.ids) && toast.ids.length > 0 ? toast.ids : [toast.id];
            ids.filter(Boolean).forEach((id) => state.deleteChronoEntry(id));
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

        const handleUpdateActivity = useCallback((id, patch) => {
            if (typeof state.updateChronoActivity === 'function') state.updateChronoActivity(id, patch);
        }, [state]);

        const handleTimerAccept = useCallback((minutes) => {
            if (!timer) {
                traceChronoUi('ui_timer_accept_rejected', { reason: 'missing_timer', minutes }, 'warn');
                return;
            }
            const flowId = HEYS.LogTrace && typeof HEYS.LogTrace.makeFlowId === 'function'
                ? HEYS.LogTrace.makeFlowId('chrono-timer-accept')
                : `chrono-timer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            traceChronoUi('ui_timer_accept_submit', {
                flowId,
                activityId: timer.activityId,
                minutes: Math.round(Number(minutes) || 0),
                activeDate,
            });
            const entry = state.addChronoEntry({
                activityId: timer.activityId,
                date: Utils.chronoDateStr?.(timer.startMs ? new Date(timer.startMs) : undefined) || Utils.dateStr(),
                minutes,
                flowId,
                at: timer.startMs ? new Date(timer.startMs).toISOString() : undefined,
            });
            traceChronoUi(entry && entry.id ? 'ui_timer_accept_saved' : 'ui_timer_accept_no_entry', {
                flowId,
                activityId: timer.activityId,
                minutes: Math.round(Number(minutes) || 0),
                entryId: entry && entry.id || null,
            }, entry && entry.id ? 'info' : 'warn');
            if (entry && entry.id) {
                setToast({ id: entry.id, minutes });
                setRecentBadge({ activityId: timer.activityId, minutes, key: entry.id });
            }
            state.clearChronoTimer();
            setTimerCompleteShown(false);
        }, [timer, state, activeDate]);

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
            if (!timer) {
                traceChronoUi('ui_timer_stop_save_rejected', { reason: 'missing_timer', minutes }, 'warn');
                return;
            }
            const flowId = HEYS.LogTrace && typeof HEYS.LogTrace.makeFlowId === 'function'
                ? HEYS.LogTrace.makeFlowId('chrono-timer-stop')
                : `chrono-timer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            traceChronoUi('ui_timer_stop_save_submit', {
                flowId,
                activityId: timer.activityId,
                minutes: Math.round(Number(minutes) || 0),
                activeDate,
            });
            const entry = state.addChronoEntry({
                activityId: timer.activityId,
                date: Utils.chronoDateStr?.(timer.startMs ? new Date(timer.startMs) : undefined) || Utils.dateStr(),
                minutes,
                flowId,
                at: timer.startMs ? new Date(timer.startMs).toISOString() : undefined,
            });
            traceChronoUi(entry && entry.id ? 'ui_timer_stop_save_saved' : 'ui_timer_stop_save_no_entry', {
                flowId,
                activityId: timer.activityId,
                minutes: Math.round(Number(minutes) || 0),
                entryId: entry && entry.id || null,
            }, entry && entry.id ? 'info' : 'warn');
            if (entry && entry.id) {
                setToast({ id: entry.id, minutes });
                setRecentBadge({ activityId: timer.activityId, minutes, key: entry.id });
            }
            state.clearChronoTimer();
            setTimerStopOpen(false);
        }, [timer, state, activeDate]);

        const handleTimerStopDiscard = useCallback(() => {
            state.clearChronoTimer();
            setTimerStopOpen(false);
        }, [state]);

        // Суммарное время за выбранный охват — для счётчика в шапке.
        const totalMinutes = useMemo(() => {
            let sum = 0;
            Object.values(minutesByActivity).forEach((v) => { sum += Number(v) || 0; });
            return sum;
        }, [minutesByActivity]);

        const insights = useMemo(() => buildChronoWeekInsights(displayActivities, minutesByActivity, totalMinutes, scope),
            [displayActivities, minutesByActivity, totalMinutes, scope]);

        const categoryBalance = useMemo(() => buildCategoryBalance(displayActivities, minutesByActivity),
            [displayActivities, minutesByActivity]);

        const weeklyReport = useMemo(() => {
            if (scope !== 'week') return null;
            return buildWeeklyReport(displayActivities, entries, snapshots, dates, minutesByActivity);
        }, [scope, displayActivities, entries, snapshots, dates, minutesByActivity]);

        // Стрики по дневным целям и паттерн времени суток — не зависят от scope,
        // считаются по всей истории (entries+snapshots).
        const streaks = useMemo(() => buildGoalStreaks(displayActivities, entries, snapshots, todayStr),
            [displayActivities, entries, snapshots, todayStr]);

        const timeOfDay = useMemo(() => buildTimeOfDayPattern(displayActivities, entries, todayStr),
            [displayActivities, entries, todayStr]);

        const activeDay = useMemo(() => readChronoDayV2(activeDate), [activeDate, entries, timerNow]);
        const nextActiveDate = useMemo(() => Utils.addDays(activeDate, 1), [activeDate]);
        const nextActiveDay = useMemo(() => readChronoDayV2(nextActiveDate), [nextActiveDate, entries, timerNow]);
        const activeDayEndMs = useMemo(() => {
            if (activeDate === todayStr) return null;
            return buildChronoDayEndMs(activeDate, nextActiveDay);
        }, [activeDate, todayStr, nextActiveDay]);
        const lastAdded = useMemo(() => {
            const endMs = Number.isFinite(activeDayEndMs) ? activeDayEndMs : timerNow;
            return buildLastAddedSummary(entries, activities, endMs, activeDate, {
                nowKind: Number.isFinite(activeDayEndMs) ? 'sleep' : 'now',
            });
        }, [entries, activities, timerNow, activeDate, activeDayEndMs]);
        const loggedRows = useMemo(() => buildChronoLoggedRows(activeDay, entries, activities, activeDate),
            [activeDay, entries, activities, activeDate]);
        const handleLoggedRowsReorder = useCallback((nextRows) => {
            if (typeof state.reorderChronoRows !== 'function') return;
            const anchorMs = loggedRows.length > 0 ? loggedRows[0].startMs : null;
            const assignments = buildChronoReorderAssignments(nextRows, activeDate, anchorMs);
            if (assignments.length > 0) state.reorderChronoRows(assignments);
        }, [state, loggedRows, activeDate]);

        const handleChronoTrashStateChange = useCallback((next) => {
            const dragging = !!(next && next.dragging);
            const active = !!(next && next.active);
            setChronoTrashState((prev) => (
                prev.dragging === dragging && prev.active === active
                    ? prev
                    : { dragging, active }
            ));
        }, []);

        const untracked = useMemo(() => {
            if (activeDate === todayStr) {
                return buildUntrackedChronoSummary(activeDay, entries, activeDate, timerNow);
            }
            const sleepEndMs = activeDayEndMs;
            if (sleepEndMs == null) return null;
            return buildUntrackedChronoSummary(activeDay, entries, activeDate, timerNow, {
                endMs: sleepEndMs,
                endKind: 'sleep',
                endLabel: nextActiveDay && nextActiveDay.sleepStart ? String(nextActiveDay.sleepStart) : formatClockTime(sleepEndMs),
            });
        }, [activeDate, todayStr, entries, activeDay, nextActiveDay, timerNow, activeDayEndMs]);
        const untrackedKey = untracked
            ? `${untracked.sinceKind}:${untracked.sinceLabel}:${untracked.minutes}`
            : '';

        const pastTailDaysByDate = useMemo(() => {
            const map = {};
            for (let offset = 0; offset <= 8; offset += 1) {
                const date = Utils.addDays(todayStr, -offset);
                if (date) map[date] = readChronoDayV2(date);
            }
            return map;
        }, [todayStr, entries, timerNow]);

        const pastUntrackedTails = useMemo(() => buildPastUntrackedTailSummaries(
            entries,
            pastTailDaysByDate,
            todayStr,
            {
                lookbackDays: 7,
                dismissedDates: dismissedTailDates,
                nowMs: timerNow,
            },
        ), [entries, pastTailDaysByDate, todayStr, dismissedTailDates, timerNow]);

        const shouldShowTailPrompt = scope === 'day'
            && activeDate === todayStr
            && !tailPromptClosed
            && pastUntrackedTails.length > 0
            && !durationTarget
            && !deleteTarget
            && !historyTarget
            && !entryEditTarget
            && !timerCompleteShown
            && !timerStopOpen
            && !overviewModalOpen;

        const handleTailPromptFill = useCallback((date) => {
            if (!date) return;
            setScope('day');
            setActiveDate(date);
            setTailPromptClosed(true);
            setUntrackedDraft(null);
            setOverviewModalOpen(false);
        }, []);

        const handleTailPromptDismissDates = useCallback((dates) => {
            const next = saveDismissedUntrackedTailDates([].concat(dismissedTailDates || [], dates || []));
            setDismissedTailDates(next);
            setTailPromptClosed(true);
        }, [dismissedTailDates]);

        useEffect(() => {
            if (!untrackedDraft) return;
            if (untrackedDraft.confirming) return;
            if (!untracked || untrackedDraft.key !== untrackedKey) setUntrackedDraft(null);
        }, [untracked, untrackedKey, untrackedDraft]);

        const handleUntrackedBadgeClick = useCallback(() => {
            if (!untracked || !untracked.minutes) return;
            const next = {
                key: untrackedKey,
                groupId: `untracked_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                minutes: untracked.minutes,
                startMs: untracked.startMs,
                endMs: untracked.endMs,
                selectedIds: [],
                parallelIds: [],
                allocations: {},
                confirming: false,
                confirmIndex: 0,
            };
            setUntrackedDraft((current) => (current && current.key === next.key ? null : next));
        }, [untracked, untrackedKey]);

        const handleUntrackedAllocationChange = useCallback((activityId, minutes) => {
            setUntrackedDraft((current) => {
                if (!current || current.confirming) return current;
                const parallelIds = normalizeUntrackedParallelIds(current);
                return {
                    ...current,
                    parallelIds,
                    allocations: distributeUntrackedDraftAllocations(
                        current.minutes,
                        current.selectedIds,
                        parallelIds,
                        current.allocations,
                        activityId,
                        minutes,
                    ),
                };
            });
        }, []);

        const handleUntrackedParallelChange = useCallback((activityId, enabled) => {
            setUntrackedDraft((current) => {
                if (!current || current.confirming || !activityId) return current;
                const selectedIds = Array.isArray(current.selectedIds) ? current.selectedIds.filter(Boolean) : [];
                if (!selectedIds.includes(activityId)) return current;
                const currentParallel = new Set(normalizeUntrackedParallelIds(current, selectedIds));
                if (enabled) currentParallel.add(activityId);
                else currentParallel.delete(activityId);
                const parallelIds = Array.from(currentParallel);
                return {
                    ...current,
                    parallelIds,
                    allocations: distributeUntrackedDraftAllocations(
                        current.minutes,
                        selectedIds,
                        parallelIds,
                        current.allocations,
                    ),
                };
            });
        }, []);

        const handleUntrackedRemove = useCallback((activityId) => {
            setUntrackedDraft((current) => {
                if (!current || current.confirming || !activityId) return current;
                const selectedIds = Array.isArray(current.selectedIds)
                    ? current.selectedIds.filter((id) => id && id !== activityId)
                    : [];
                const parallelIds = normalizeUntrackedParallelIds(current, selectedIds);
                return {
                    ...current,
                    selectedIds,
                    parallelIds,
                    allocations: distributeUntrackedDraftAllocations(
                        current.minutes,
                        selectedIds,
                        parallelIds,
                        current.allocations,
                    ),
                };
            });
        }, []);

        const handleUntrackedCancel = useCallback(() => {
            setUntrackedDraft(null);
            setDurationTarget(null);
            setDurationInitialMinutes(null);
        }, []);

        const handleUntrackedConfirm = useCallback(() => {
            const first = untrackedSteps[0];
            if (!first || !first.activity || first.minutes <= 0) return;
            setUntrackedDraft((current) => current
                ? { ...current, confirming: true, confirmIndex: 0 }
                : current);
            setDurationInitialMinutes(first.minutes);
            setDurationTarget(first.activity);
        }, [untrackedSteps]);

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
            if (e.target && typeof e.target.closest === 'function' && e.target.closest('.chrono-untracked-flow')) return;
            swipeRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), active: true };
        }, []);
        const handleScreenPointerUp = useCallback((e) => {
            if (!swipeRef.current.active) return;
            if (e.target && typeof e.target.closest === 'function' && e.target.closest('.chrono-untracked-flow')) {
                swipeRef.current.active = false;
                return;
            }
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
        const untrackedHasSelection = !!(untrackedDraft
            && Array.isArray(untrackedDraft.selectedIds)
            && untrackedDraft.selectedIds.length > 0);

        return h('div', {
            className: 'chrono-screen' + (scope === 'week' ? ' chrono-screen--week' : ''),
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
                    onClick: () => setOverviewModalOpen(true),
                    'aria-label': 'Сводка',
                    title: 'Сводка',
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
            chronoSyncing && h('div', { className: 'chrono-empty', role: 'status' }, 'Обновление занятий…'),
            !chronoSyncing && h(ChronoCloud, {
                activities: partition.active,
                minutesByActivity,
                maxMin,
                scope,
                planFacts,
                recentBadge,
                onPick: handleBubbleClick,
                onLongPress: handleLongPress,
                hasInactive: partition.inactive.length > 0,
                trashRef: chronoTrashRef,
                onTrashStateChange: handleChronoTrashStateChange,
                onDragDelete: (id) => {
                    const a = activities.find((x) => x.id === id);
                    if (!a) return;
                    // Корзина в облаке = убрать занятие из текущего дня/недели (вернуть в
                    // полосу выбора), НЕ удалять его совсем. Полное удаление — только из
                    // модалки «Занятия» (корзина у строки → DeleteActivityModal).
                    const removed = state.clearChronoScope(id, dates);
                    const entries = (removed && removed.entries) || [];
                    const minutes = entries.reduce((sum, e) => sum + (Number(e.minutes) || 0), 0);
                    setRecentBadge(null);
                    setToast({ kind: 'cleared', removed: entries, minutes, scope });
                },
            }),
            scope === 'week' && h(ChronoWeeklyReport, {
                report: weeklyReport,
                onPickDay: (date) => {
                    setActiveDate(date);
                    setScope('day');
                },
            }),
            h(ChronoOverviewPanel, {
                insights,
                balance: categoryBalance,
                streaks,
                timeOfDay,
                lastAdded,
                loggedRows,
                totalMinutes,
                untracked: untrackedHasSelection ? null : untracked,
                untrackedActive: !!untrackedDraft,
                onUntrackedClick: handleUntrackedBadgeClick,
                onLoggedRowClick: setEntryEditTarget,
                onLoggedRowsReorder: handleLoggedRowsReorder,
            }),
            untrackedDraft && !untrackedDraft.confirming && untrackedSteps.length > 0 && h(ChronoUntrackedAllocationPanel, {
                draft: untrackedDraft,
                activities,
                onChange: handleUntrackedAllocationChange,
                onParallelChange: handleUntrackedParallelChange,
                onRemove: handleUntrackedRemove,
                onConfirm: handleUntrackedConfirm,
                onConfirmNow: handleUntrackedApplyNow,
                onCancel: handleUntrackedCancel,
            }),
            !chronoSyncing && h(ChronoStrip, {
                activities: partition.inactive,
                onPick: handleBubbleClick,
                onAddNew: () => setPickerOpen(true),
                trashRef: chronoTrashRef,
                trashState: chronoTrashState,
            }),
            durationTarget && h(ChronoDurationModal, {
                activity: activities.find((a) => a.id === durationTarget.id) || durationTarget,
                activities: visibleActivities,
                currentMinutes: minutesByActivity[durationTarget.id] || 0,
                scopeLabel: scope === 'week' ? 'за неделю' : 'за день',
                timerRunning: !!timer,
                tasks,
                projects,
                entries,
                activeDate,
                initialMinutes: durationInitialMinutes,
                confirmationSteps: untrackedDraft && untrackedDraft.confirming ? untrackedSteps : null,
                confirmationIndex: untrackedDraft && untrackedDraft.confirming
                    ? Math.max(0, Number(untrackedDraft.confirmIndex) || 0)
                    : 0,
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
                onClose: () => {
                    if (untrackedDraft && untrackedDraft.confirming) setUntrackedDraft(null);
                    setDurationTarget(null);
                    setDurationInitialMinutes(null);
                },
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
            entryEditTarget && h(ChronoEntryEditModal, {
                row: entryEditTarget,
                entries: state.chronoEntries || [],
                activities,
                tasks,
                projects,
                onUpdateEntry: handleUpdateEntry,
                onDeleteEntry: (id) => state.deleteChronoEntry(id),
                onUpdateActivity: handleUpdateActivity,
                onClose: () => setEntryEditTarget(null),
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
            shouldShowTailPrompt && h(ChronoUntrackedTailPromptModal, {
                tails: pastUntrackedTails,
                onFill: handleTailPromptFill,
                onDismissDates: handleTailPromptDismissDates,
                onClose: () => setTailPromptClosed(true),
            }),
            overviewModalOpen && h(ChronoOverviewModal, {
                dateLabel,
                overviewProps: {
                    insights,
                    balance: categoryBalance,
                    streaks,
                    timeOfDay,
                    lastAdded,
                    loggedRows,
                    totalMinutes,
                    untracked: untrackedHasSelection ? null : untracked,
                    untrackedActive: !!untrackedDraft,
                    onUntrackedClick: handleUntrackedBadgeClick,
                    onLoggedRowClick: (row) => {
                        setOverviewModalOpen(false);
                        setEntryEditTarget(row);
                    },
                    onLoggedRowsReorder: handleLoggedRowsReorder,
                },
                onClose: () => setOverviewModalOpen(false),
            }),
        );
    }

    // === Экспорт ===

    HEYS.PlanningChrono = {
        ChronoScreen,
        ChronoDurationModal,
        ChronoEntryEditModal,
        ChronoHistoryModal,
        ChronoHeatmap,
        ChronoWeekBreakdown,
        ChronoWeeklyReport,
        ChronoOverviewPanel,
        ChronoCloud,
        ChronoTimerBanner,
        ChronoTimerCompleteModal,
        ChronoTimerStopModal,
        ChronoUntrackedTailPromptModal,
        radiusForMinutes,
        colorForActivity,
        formatMinutes,
        formatEntryTime,
        formatTimerRemaining,
        getTimerElapsedMs,
        getTimerRemainingMs,
        getProgress,
        getBubbleProgress,
        getActivityTarget,
        getActivityGoalForScope,
        ringColorForProgress,
        sizeScaleForCount,
        computeRadialLayout,
        reflowAroundOverrides,
        hasBubbleOverlap,
        buildDailySeries,
        buildWeekBreakdown,
        buildDisplayChronoActivities,
        buildChronoPlanFacts,
        getChronoSlotDurationMinutes,
        buildChronoWeekInsights,
        buildCategoryBalance,
        buildDayTimeline,
        computeChronoCoveredMinutes,
        splitMinutesForWheel,
        buildChronoLoggedRows,
        buildChronoReorderAssignments,
        buildLastAddedSummary,
        buildUntrackedChronoSummary,
        buildPastUntrackedTailSummaries,
        distributeUntrackedMinutes,
        buildUntrackedSteps,
        buildSmartSuggestions,
        getParallelActivityOptions,
        buildWeeklyReport,
        buildGoalStreaks,
        buildWeekGoalHitRate,
        buildWeekTrend,
        computeWeekScore,
        buildTimeOfDayPattern,
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
