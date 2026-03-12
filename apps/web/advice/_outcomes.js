(function () {
    'use strict';

    const OUTCOME_PROFILE_KEY = 'heys_advice_outcomes_v1';
    const OUTCOME_PENDING_KEY = 'heys_advice_pending_outcomes_v1';
    const OUTCOME_PROFILE_VERSION = 2;
    const OUTCOME_PENDING_VERSION = 1;
    const MAX_OUTCOME_ADVICE_BUCKETS = 400;
    const MAX_OUTCOME_THEME_BUCKETS = 80;
    const MAX_OUTCOME_CONTEXT_BUCKETS = 320;
    const MAX_PENDING_OUTCOME_ITEMS = 240;
    const MAX_PENDING_OUTCOME_AGE_MS = 72 * 60 * 60 * 1000;

    function normalizeNonNegativeNumber(value, fallback = 0) {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0
            ? value
            : fallback;
    }

    function normalizeIntegerCounter(value) {
        return Math.max(0, Math.floor(normalizeNonNegativeNumber(value, 0)));
    }

    function sanitizeOutcomeBucket(stats) {
        return {
            shown: normalizeIntegerCounter(stats?.shown),
            click: normalizeIntegerCounter(stats?.click),
            read: normalizeIntegerCounter(stats?.read),
            hidden: normalizeIntegerCounter(stats?.hidden),
            positive: normalizeIntegerCounter(stats?.positive),
            negative: normalizeIntegerCounter(stats?.negative),
            autoSuccess: normalizeIntegerCounter(stats?.autoSuccess),
            autoFailure: normalizeIntegerCounter(stats?.autoFailure),
            autoNeutral: normalizeIntegerCounter(stats?.autoNeutral),
            lastUpdated: normalizeIntegerCounter(stats?.lastUpdated)
        };
    }

    function sanitizeOutcomeCollection(collection, maxEntries) {
        if (!collection || typeof collection !== 'object' || Array.isArray(collection)) return {};

        return Object.entries(collection)
            .filter(([key, value]) => !!key && value && typeof value === 'object' && !Array.isArray(value))
            .map(([key, value]) => [key, sanitizeOutcomeBucket(value)])
            .sort((a, b) => (b[1]?.lastUpdated || 0) - (a[1]?.lastUpdated || 0))
            .slice(0, maxEntries)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
    }

    function sanitizeAdviceOutcomeProfiles(profiles) {
        return {
            version: OUTCOME_PROFILE_VERSION,
            advice: sanitizeOutcomeCollection(profiles?.advice, MAX_OUTCOME_ADVICE_BUCKETS),
            theme: sanitizeOutcomeCollection(profiles?.theme, MAX_OUTCOME_THEME_BUCKETS),
            context: sanitizeOutcomeCollection(profiles?.context, MAX_OUTCOME_CONTEXT_BUCKETS),
            lastUpdated: normalizeIntegerCounter(profiles?.lastUpdated)
        };
    }

    function sanitizePendingOutcomeEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

        const shownAt = normalizeIntegerCounter(entry?.shownAt);
        const now = Date.now();
        if (!entry?.adviceId || shownAt <= 0 || shownAt > now + (5 * 60 * 1000)) return null;
        if (now - shownAt > MAX_PENDING_OUTCOME_AGE_MS) return null;

        return {
            adviceId: String(entry.adviceId),
            theme: String(entry?.theme || 'general'),
            contextKey: String(entry?.contextKey || 'general|maintenance|low|midday|low'),
            date: typeof entry?.date === 'string' ? entry.date : new Date(shownAt).toISOString().slice(0, 10),
            shownAt,
            hour: normalizeIntegerCounter(entry?.hour),
            mealCount: normalizeIntegerCounter(entry?.mealCount),
            lastMealHour: entry?.lastMealHour == null ? null : normalizeIntegerCounter(entry?.lastMealHour),
            proteinPct: normalizeNonNegativeNumber(entry?.proteinPct, 0),
            fiberPct: normalizeNonNegativeNumber(entry?.fiberPct, 0),
            waterPct: normalizeNonNegativeNumber(entry?.waterPct, 0),
            simplePct: normalizeNonNegativeNumber(entry?.simplePct, 0),
            kcalPct: normalizeNonNegativeNumber(entry?.kcalPct, 0),
            stressAvg: normalizeNonNegativeNumber(entry?.stressAvg, 0),
            crashRiskLevel: typeof entry?.crashRiskLevel === 'string' ? entry.crashRiskLevel : 'low'
        };
    }

    function sanitizePendingOutcomeMap(pending) {
        if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return {};

        return Object.entries(pending)
            .map(([key, value]) => [key, sanitizePendingOutcomeEntry(value)])
            .filter(([, value]) => !!value)
            .sort((a, b) => (b[1]?.shownAt || 0) - (a[1]?.shownAt || 0))
            .slice(0, MAX_PENDING_OUTCOME_ITEMS)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
    }

    function getAdviceOutcomeProfiles() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const parsed = HEYS.store?.get
                ? (HEYS.store.get(OUTCOME_PROFILE_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(OUTCOME_PROFILE_KEY, null) || {}) : JSON.parse(localStorage.getItem(OUTCOME_PROFILE_KEY) || 'null') || {});

            return sanitizeAdviceOutcomeProfiles(parsed);
        } catch (e) {
            return sanitizeAdviceOutcomeProfiles(null);
        }
    }

    function saveAdviceOutcomeProfiles(profiles) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const payload = sanitizeAdviceOutcomeProfiles({
                ...profiles,
                lastUpdated: Date.now()
            });

            if (HEYS.store?.set) {
                HEYS.store.set(OUTCOME_PROFILE_KEY, payload);
            } else if (U.lsSet) {
                U.lsSet(OUTCOME_PROFILE_KEY, payload);
            } else {
                localStorage.setItem(OUTCOME_PROFILE_KEY, JSON.stringify(payload));
            }
        } catch (e) {
            // Ignore storage errors
        }
    }

    function getPendingAdviceOutcomes() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const parsed = HEYS.store?.get
                ? (HEYS.store.get(OUTCOME_PENDING_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(OUTCOME_PENDING_KEY, null) || {}) : JSON.parse(localStorage.getItem(OUTCOME_PENDING_KEY) || 'null') || {});

            const pendingItems = parsed?.items && typeof parsed.items === 'object' && !Array.isArray(parsed.items)
                ? parsed.items
                : parsed;

            return sanitizePendingOutcomeMap(pendingItems);
        } catch (e) {
            return {};
        }
    }

    function savePendingAdviceOutcomes(pending) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const payload = {
                version: OUTCOME_PENDING_VERSION,
                items: sanitizePendingOutcomeMap(pending)
            };
            if (HEYS.store?.set) {
                HEYS.store.set(OUTCOME_PENDING_KEY, payload);
            } else if (U.lsSet) {
                U.lsSet(OUTCOME_PENDING_KEY, payload);
            } else {
                localStorage.setItem(OUTCOME_PENDING_KEY, JSON.stringify(payload));
            }
        } catch (e) {
            // Ignore storage errors
        }
    }

    function ensureOutcomeBucket(root, key) {
        if (!root[key]) {
            root[key] = {
                shown: 0,
                click: 0,
                read: 0,
                hidden: 0,
                positive: 0,
                negative: 0,
                autoSuccess: 0,
                autoFailure: 0,
                autoNeutral: 0,
                lastUpdated: 0
            };
        }

        return root[key];
    }

    function applyOutcomeEvent(stats, eventType) {
        if (!stats || !eventType) return;
        if (typeof stats[eventType] !== 'number') stats[eventType] = 0;
        stats[eventType] += 1;
        stats.lastUpdated = Date.now();
    }

    function getOutcomeContextKey(advice, ctx) {
        const theme = advice?.expertMeta?.theme || advice?.category || 'general';
        const goalMode = ctx?.goal?.mode || 'maintenance';
        const crashLevel = ctx?.crashRisk?.level || 'low';
        const hour = ctx?.hour || 0;
        const timeBucket = hour < 11 ? 'morning' : hour < 17 ? 'midday' : hour < 22 ? 'evening' : 'late';
        const stressValue = ctx?.day?.stressAvg || 0;
        const stressBucket = stressValue >= 6 ? 'high' : stressValue >= 4 ? 'medium' : 'low';
        return [theme, goalMode, crashLevel, timeBucket, stressBucket].join('|');
    }

    function buildAdviceOutcomeSnapshot(advice, ctx, getLastMealHourFn) {
        const getLastMealHour = typeof getLastMealHourFn === 'function'
            ? getLastMealHourFn
            : () => null;

        return {
            theme: advice?.expertMeta?.theme || advice?.category || 'general',
            contextKey: getOutcomeContextKey(advice, ctx),
            date: ctx?.day?.date || new Date().toISOString().slice(0, 10),
            shownAt: Date.now(),
            hour: ctx?.hour || 0,
            mealCount: ctx?.mealCount || 0,
            lastMealHour: getLastMealHour(ctx?.day || {}),
            proteinPct: ctx?.proteinPct || 0,
            fiberPct: ctx?.fiberPct || 0,
            waterPct: ctx?.waterPct || 0,
            simplePct: ctx?.simplePct || 0,
            kcalPct: ctx?.kcalPct || 0,
            stressAvg: ctx?.day?.stressAvg || 0,
            crashRiskLevel: ctx?.crashRisk?.level || 'low'
        };
    }

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceOutcomeStorage = {
        OUTCOME_PROFILE_KEY,
        OUTCOME_PENDING_KEY,
        OUTCOME_PROFILE_VERSION,
        OUTCOME_PENDING_VERSION,
        MAX_OUTCOME_ADVICE_BUCKETS,
        MAX_OUTCOME_THEME_BUCKETS,
        MAX_OUTCOME_CONTEXT_BUCKETS,
        MAX_PENDING_OUTCOME_ITEMS,
        MAX_PENDING_OUTCOME_AGE_MS,
        sanitizeAdviceOutcomeProfiles,
        sanitizePendingOutcomeMap,
        getAdviceOutcomeProfiles,
        saveAdviceOutcomeProfiles,
        getPendingAdviceOutcomes,
        savePendingAdviceOutcomes,
        ensureOutcomeBucket,
        applyOutcomeEvent,
        getOutcomeContextKey,
        buildAdviceOutcomeSnapshot
    };
})();
