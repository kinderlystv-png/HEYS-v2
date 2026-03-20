/**
 * heys_risk_radar_v1.js — Unified Risk Radar
 *
 * Layer 2 в Day Intelligence Stack.
 * Один ответ на "есть ли угроза сегодня?" вместо двух параллельных рисков.
 *
 * Логика:
 *   riskScore = max(relapseRisk, crashRisk)
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

    function getLevel(score) {
        for (const [id, lvl] of Object.entries(LEVELS)) {
            if (score <= lvl.max) return { ...lvl, id };
        }
        return { ...LEVELS.critical, id: 'critical' };
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, Number(v) || 0));
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
            crashData = HEYS.Metabolic.calculateCrashRisk24h(
                new Date().toISOString().slice(0, 10),
                opts.profile,
                opts.historyDays
            );
        }
        if (crashData && typeof crashData.score === 'number') {
            crashScore = clamp(crashData.score, 0, 100);
        }

        // Unified score = max of both
        const riskScore = Math.max(relapseScore, crashScore);
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

        // Top drivers from whichever source is higher
        const drivers = [];
        if (relapseData?.drivers) {
            for (const d of relapseData.drivers.slice(0, 2)) {
                drivers.push({ label: d.label || d.factor, value: d.value, source: 'relapse' });
            }
        }
        if (crashData?.factors) {
            for (const f of Object.entries(crashData.factors || {}).slice(0, 2)) {
                drivers.push({ label: f[0], value: f[1], source: 'crash' });
            }
        }

        // Top actions: merge from both (deduplicate by label)
        const actions = [];
        const seen = new Set();
        const allActions = [
            ...(relapseData?.actions || []),
            ...(crashData?.actions || [])
        ];
        for (const a of allActions) {
            const key = (a.text || a.label || '').toLowerCase();
            if (key && !seen.has(key)) {
                seen.add(key);
                actions.push(a);
            }
            if (actions.length >= 3) break;
        }

        console.info(`${MODULE} ✅ Risk: ${riskScore} (relapse: ${relapseScore}, crash: ${crashScore}) | source: ${source} | level: ${level.label}`);

        return {
            score: riskScore,
            level,
            source,
            relapse: { score: relapseScore, data: relapseData },
            crash: { score: crashScore, data: crashData },
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

    console.info(`${MODULE} ✅ Module loaded v1.0.0 | Unified Risk = max(Relapse, Crash) + source indicator`);

})(typeof window !== 'undefined' ? window : global);
