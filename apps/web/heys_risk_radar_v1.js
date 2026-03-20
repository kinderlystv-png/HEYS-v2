/**
 * heys_risk_radar_v1.js — Unified Risk Radar
 *
 * Layer 2 в Day Intelligence Stack.
 * Один ответ на "есть ли угроза сегодня?" вместо двух параллельных рисков.
 *
 * Логика:
 *   riskScore = confidence-aware blend(relapseRisk, crashRisk)
 *   source    = который из двух выше (или 'both' если разница <5)
 *
 * Relapse Risk — эмоциональный риск срыва (стресс, настроение, рестрикция)
 * Crash Risk   — метаболический риск (недосып, дефицит, weekend паттерн)
 *
 * Version: 1.0.0
 * Created: 2026-03-20
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const MODULE = '[HEYS.RiskRadar]';

    const LEVELS = {
        low: { min: 0, max: 19, label: 'Низкий', emoji: '🟢', color: '#22c55e' },
        guarded: { min: 20, max: 39, label: 'Умеренный', emoji: '🟡', color: '#eab308' },
        elevated: { min: 40, max: 59, label: 'Повышенный', emoji: '🟠', color: '#f97316' },
        high: { min: 60, max: 79, label: 'Высокий', emoji: '🔴', color: '#ef4444' },
        critical: { min: 80, max: 100, label: 'Критичный', emoji: '🚨', color: '#dc2626' }
    };
    const DEFAULT_BLEND_WEIGHTS = { relapse: 0.6, crash: 0.4 };
    const WINDOW_CRASH_INFLUENCE = { next3h: 0.35, tonight: 0.65, next24h: 1 };

    function getLevel(score) {
        for (const [id, lvl] of Object.entries(LEVELS)) {
            if (score <= lvl.max) return { ...lvl, id };
        }
        return { ...LEVELS.critical, id: 'critical' };
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, Number(v) || 0));
    }

    function normalizeConfidence(value, fallback) {
        const raw = Number(value);
        if (!Number.isFinite(raw)) return fallback;
        if (raw <= 1) return clamp(raw, 0, 1);
        return clamp(raw / 100, 0, 1);
    }

    function buildBlendWeights(relapseData, crashData) {
        const relapseConfidence = normalizeConfidence(relapseData?.confidence, 0.75);
        const crashConfidence = normalizeConfidence(crashData?.confidence, 0.6);

        const relapseSupport = DEFAULT_BLEND_WEIGHTS.relapse * (0.5 + relapseConfidence);
        const crashSupport = DEFAULT_BLEND_WEIGHTS.crash * (0.5 + crashConfidence);
        const totalSupport = relapseSupport + crashSupport || 1;

        return {
            relapse: relapseSupport / totalSupport,
            crash: crashSupport / totalSupport,
            relapseConfidence,
            crashConfidence,
        };
    }

    function blendRiskWindows(relapseData, relapseScore, crashScore, weights) {
        const relapseWindows = relapseData?.windows || relapseData?.raw?.windows || {};
        const fallbackWindow = clamp(relapseScore, 0, 100);

        function blendWindow(key) {
            const relapseWindow = clamp(relapseWindows?.[key], 0, 100) || fallbackWindow;
            const crashShare = clamp(weights.crash * (WINDOW_CRASH_INFLUENCE[key] || 0), 0, 0.85);
            return Math.round((relapseWindow * (1 - crashShare) + crashScore * crashShare) * 10) / 10;
        }

        return {
            next3h: blendWindow('next3h'),
            tonight: blendWindow('tonight'),
            next24h: blendWindow('next24h'),
        };
    }

    function normalizeAction(action) {
        if (!action) return null;
        if (typeof action === 'string') return { text: action };

        const text = [action.text, action.label, action.title, action.action]
            .find(function (candidate) { return typeof candidate === 'string' && candidate.trim(); });

        if (!text) return null;

        return {
            ...action,
            text: text.trim(),
        };
    }

    function resolveStorage() {
        const U = HEYS.utils;
        return typeof U?.lsGet === 'function'
            ? U.lsGet.bind(U)
            : function (key, fb) { try { return JSON.parse(localStorage.getItem(key)) || fb; } catch { return fb; } };
    }

    function collectHistoryDays(count) {
        const lsGet = resolveStorage();
        const days = [];
        for (let i = 1; i <= count; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = 'heys_dayv2_' + d.toISOString().split('T')[0];
            const day = lsGet(key, null);
            if (day && typeof day === 'object') days.push(day);
        }
        return days;
    }

    /**
     * Compute unified Risk Radar.
     *
     * @param {Object} opts
     * @param {Object} [opts.relapseSnapshot] — from HEYS.RelapseRisk.getCurrentSnapshot()
     * @param {Object} [opts.crashRiskResult] — from HEYS.Metabolic.calculateCrashRisk24h()
     * @param {Object} [opts.dayData]
     * @param {Object} [opts.dayTot]
     * @param {Object} [opts.normAbs]
     * @param {Object} [opts.profile]
     * @param {Array}  [opts.historyDays]
     * @returns {Object} { score, level, source, relapse, crash, drivers, actions }
     */
    function calculate(opts = {}) {
        let relapseScore = 0;
        let crashScore = 0;
        let relapseData = opts.relapseSnapshot || null;
        let crashData = opts.crashRiskResult || null;

        // Try to get Relapse Risk if not provided
        if (!relapseData && HEYS.RelapseRisk?.getCurrentSnapshot) {
            relapseData = HEYS.RelapseRisk.getCurrentSnapshot();
        }
        if (relapseData && typeof relapseData.score === 'number') {
            relapseScore = clamp(relapseData.score, 0, 100);
        }

        // Try to get Crash Risk if not provided
        if (!crashData && HEYS.Metabolic?.calculateCrashRisk24h) {
            const history = Array.isArray(opts.historyDays) && opts.historyDays.length > 0
                ? opts.historyDays
                : collectHistoryDays(14);
            crashData = HEYS.Metabolic.calculateCrashRisk24h(
                new Date().toISOString().slice(0, 10),
                opts.profile,
                history
            );
        }
        if (crashData) {
            // Metabolic returns 'risk' field; normalize to 'score' for consistency
            const rawCrash = Number(crashData.score ?? crashData.risk);
            if (Number.isFinite(rawCrash)) {
                crashScore = clamp(rawCrash, 0, 100);
            }
        }

        const blendWeights = buildBlendWeights(relapseData, crashData);
        const riskScore = Math.round(
            relapseScore * blendWeights.relapse +
            crashScore * blendWeights.crash
        );
        const diff = Math.abs(relapseScore - crashScore);

        let source;
        if (diff < 5 && relapseScore > 0 && crashScore > 0) {
            source = 'both';
        } else if (relapseScore >= crashScore) {
            source = 'emotional';
        } else {
            source = 'metabolic';
        }

        const level = getLevel(riskScore);
        const windows = blendRiskWindows(relapseData, relapseScore, crashScore, blendWeights);

        // Top drivers from whichever source is higher
        const drivers = [];
        const relapseDrivers = Array.isArray(relapseData?.primaryDrivers)
            ? relapseData.primaryDrivers
            : Array.isArray(relapseData?.drivers)
                ? relapseData.drivers
                : [];
        if (relapseDrivers.length) {
            for (const d of relapseDrivers.slice(0, 3)) {
                drivers.push({
                    label: d.label || d.factor || d.id,
                    impact: Number(d.impact ?? d.value) || 0,
                    explanation: d.explanation,
                    source: 'relapse'
                });
            }
        }
        if (Array.isArray(crashData?.factors)) {
            for (const f of crashData.factors.slice(0, 3)) {
                drivers.push({
                    label: f.label || f.id || 'Metabolic factor',
                    impact: Number(f.impact) || 0,
                    explanation: f.details,
                    source: 'crash'
                });
            }
        }
        drivers.sort(function (a, b) { return (Number(b.impact) || 0) - (Number(a.impact) || 0); });

        // Top actions: merge from both (deduplicate by label)
        const actions = [];
        const seen = new Set();
        const allActions = [
            ...(relapseData?.recommendations || []),
            ...(relapseData?.actions || []),
            ...(crashData?.actions || []),
            ...(crashData?.preventionStrategy || [])
        ];
        for (const a of allActions) {
            const normalized = normalizeAction(a);
            const key = (normalized?.text || '').toLowerCase();
            if (key && !seen.has(key)) {
                seen.add(key);
                actions.push(normalized);
            }
            if (actions.length >= 3) break;
        }

        console.info(`${MODULE} ✅ Risk: ${riskScore} (relapse: ${relapseScore}, crash: ${crashScore}) | source: ${source} | level: ${level.label} | weights r=${blendWeights.relapse.toFixed(2)} c=${blendWeights.crash.toFixed(2)}`);

        return {
            score: riskScore,
            level,
            source,
            relapse: { score: relapseScore, data: relapseData },
            crash: { score: crashScore, data: crashData },
            blend: {
                weights: {
                    relapse: Math.round(blendWeights.relapse * 100) / 100,
                    crash: Math.round(blendWeights.crash * 100) / 100,
                },
                confidence: {
                    relapse: Math.round(blendWeights.relapseConfidence * 100),
                    crash: Math.round(blendWeights.crashConfidence * 100),
                }
            },
            windows,
            drivers,
            actions,
            timestamp: Date.now()
        };
    }

    // === EXPORT ===

    HEYS.RiskRadar = {
        calculate,
        getLevel,
        LEVELS,
        VERSION: '1.0.0'
    };

    console.info(`${MODULE} ✅ Module loaded v1.0.0 | Unified Risk = confidence-aware blend(Relapse, Crash) + source indicator`);

})(typeof window !== 'undefined' ? window : global);
