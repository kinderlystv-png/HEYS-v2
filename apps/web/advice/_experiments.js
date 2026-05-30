/**
 * HEYS Advice A/B Experiments — Phase 4.2
 * @file advice/_experiments.js
 *
 * Deterministic A/B routing для exp'ов advice engine.
 *
 * Дизайн:
 *   • Хеш user.id (или device-id если no user) → variant (control/A/B)
 *   • Stable per-user: тот же юзер всегда получает тот же variant
 *   • Snapshot и daily-log включают `variant` + `experimentId`
 *   • Per-variant breakdown в daily-log quality metrics
 *
 * Active experiments registered в EXPERIMENTS table. Только один active
 * experiment одновременно (избегаем cross-experiment interactions).
 *
 * Routing API: window.HEYS.adviceExperiments.getVariant(userId)
 *   → 'control' | 'A' | 'B' | null (если experiment не активен)
 *
 * NOTE: actual UI/engine behavior per-variant — defer в Phase 4.3
 * (integration с rendering pipeline).
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};

    // ═══════════════════════════════════════════════════════════════
    // EXPERIMENTS REGISTRY — currently active A/B tests
    // ═══════════════════════════════════════════════════════════════
    //
    // Каждый experiment имеет:
    //   • id: stable identifier (used в snapshot/log)
    //   • description: human-readable
    //   • variants: array of variant names ['control', 'A', 'B']
    //   • startDate / endDate: ISO strings (inclusive). null endDate = ongoing
    //   • routing: 'hash' | 'random' (hash = deterministic per user)
    //
    // Active experiment = first match where startDate <= today <= endDate.
    // Если активен один experiment — он применяется всем юзерам.
    // Если нет активного — getVariant() returns null.

    const EXPERIMENTS = [
        // Phase A.8 (2026-05-30): null startDate = baseline (no active experiment).
        // Когда будет real launch — set startDate/endDate to ISO date.
        // Это пример template — не реальный активный эксперимент.
        {
            id: 'evidence-badge-v1',
            description: 'A: показывать evidence sources в auto-toast inline · B: + commitment buttons',
            variants: ['control', 'A', 'B'],
            startDate: null, // baseline — set ISO date при launch
            endDate: null,
            routing: 'hash'
        }
        // Add more experiments here. Старые экспы оставлять для исторического trace.
    ];

    function getActiveExperiment(dateIso) {
        const today = dateIso || new Date().toISOString().slice(0, 10);
        return EXPERIMENTS.find(exp => {
            // Phase A.8 fix: null startDate = experiment не активен (baseline).
            // Раньше `!exp.startDate` давал true (null falsy) → false positive
            // active experiment. Корректно: для активного эксп требуется
            // явный startDate ISO.
            if (!exp.startDate) return false;
            const startOk = exp.startDate <= today;
            const endOk = !exp.endDate || exp.endDate >= today;
            return startOk && endOk;
        }) || null;
    }

    // ═══════════════════════════════════════════════════════════════
    // HASHING — deterministic variant assignment
    // ═══════════════════════════════════════════════════════════════
    //
    // FNV-1a 32-bit hash. Достаточно для balanced distribution по 2-3
    // variants на тысячах пользователей. Не cryptographic.

    function fnv1aHash(str) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            // 32-bit FNV prime multiplication
            hash = (hash * 0x01000193) >>> 0;
        }
        return hash >>> 0;
    }

    function pickVariantByHash(seed, variants) {
        if (!variants || variants.length === 0) return null;
        const h = fnv1aHash(String(seed || 'anonymous'));
        return variants[h % variants.length];
    }

    function pickVariantRandom(variants) {
        if (!variants || variants.length === 0) return null;
        return variants[Math.floor(Math.random() * variants.length)];
    }

    // ═══════════════════════════════════════════════════════════════
    // API — getVariant(userId) → variant string или null
    // ═══════════════════════════════════════════════════════════════

    function getVariant(userId, options = {}) {
        const exp = getActiveExperiment(options.dateIso);
        if (!exp) return null;

        const seed = userId
            || window.HEYS?.currentUser?.id
            || window.HEYS?.currentClient?.id
            || (() => {
                // device-stable fallback
                try {
                    let devId = localStorage.getItem('heys_device_id_v1');
                    if (!devId) {
                        devId = 'dev_' + Math.random().toString(36).slice(2, 10);
                        localStorage.setItem('heys_device_id_v1', devId);
                    }
                    return devId;
                } catch (e) { return 'anonymous'; }
            })();

        const variant = exp.routing === 'random'
            ? pickVariantRandom(exp.variants)
            : pickVariantByHash(seed, exp.variants);

        return variant;
    }

    function getCurrentExperimentMeta(userId) {
        const exp = getActiveExperiment();
        if (!exp) return null;
        return {
            experimentId: exp.id,
            variant: getVariant(userId),
            description: exp.description,
            variants: exp.variants
        };
    }

    function listAllExperiments() {
        return EXPERIMENTS.slice();
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════════
    window.HEYS.adviceExperiments = {
        getVariant,
        getCurrentExperimentMeta,
        getActiveExperiment,
        listAll: listAllExperiments,
        // Direct exports для tests/debug
        _EXPERIMENTS: EXPERIMENTS,
        _hashSeed: fnv1aHash,
        _pickByHash: pickVariantByHash
    };

})();
