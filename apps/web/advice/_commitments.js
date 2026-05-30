/**
 * HEYS Advice Commitments + Follow-up Engine — Phase 3
 * @file advice/_commitments.js
 *
 * Реализует behavior change framework BJ Fogg + Motivational Interviewing:
 *   • Юзер принимает совет ("Сделаю сегодня") → создаётся pending commitment
 *   • Через N часов (rule.follow_up.hours) engine evaluates `check` predicate
 *     на текущем ctx → выдаёт reinforcement (success) или alt (miss)
 *   • Юзер отказывается ("Сложно сейчас") → opens obstacle picker
 *     → fires commitment_declined с reason
 *
 * Persistence: LocalStorage (`heys_advice_commitments_v1`). Cloud-sync через
 * HEYS.utils.lsSet — cross-device.
 *
 * Check predicates: lookup table COMMITMENT_CHECKS. Каждый получает ctx,
 * возвращает boolean.
 *
 * NOTE: Phase 3.3 (UI buttons "Сделаю/Сложно") + 3.4 (populate Tier-A
 * commitment fields) — отдельными commits.
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};

    const STORAGE_KEY = 'heys_advice_commitments_v1';
    const MAX_COMMITMENTS = 50; // soft cap, FIFO eviction старых
    const COMMITMENT_TTL_HOURS = 48; // если commit'нул и забыл — через 48ч cleanup

    // ═══════════════════════════════════════════════════════════════
    // STORAGE — LS + cloud-sync через HEYS.utils.lsSet
    // ═══════════════════════════════════════════════════════════════

    function getCommitments() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
    }

    function setCommitments(list) {
        try {
            const truncated = list.slice(-MAX_COMMITMENTS);
            const json = JSON.stringify(truncated);
            // Используем HEYS.utils.lsSet для cloud-sync если доступен
            if (window.HEYS?.utils?.lsSet) {
                window.HEYS.utils.lsSet(STORAGE_KEY, truncated);
            } else {
                localStorage.setItem(STORAGE_KEY, json);
            }
        } catch (e) { /* noop — LS may be full */ }
    }

    // ═══════════════════════════════════════════════════════════════
    // CHECK PREDICATES — lookup table для follow-up compliance
    // ═══════════════════════════════════════════════════════════════
    //
    // Каждый predicate получает ctx (snapshot) и возвращает boolean:
    //   true  → success (commitment honored)
    //   false → miss (commitment not honored)
    //
    // Naming convention: <subject>_<action>_<condition>
    // Например: meal_logged_with_protein_ge_15 = "был хотя бы один meal
    // с белком ≥ 15г"

    const COMMITMENT_CHECKS = {
        // Protein checks
        'meal_logged_with_protein_ge_15': (ctx) => {
            const meals = ctx?.day?.meals || [];
            return meals.some(m => (Number(m.protein) || 0) >= 15);
        },
        'meal_logged_with_protein_ge_20': (ctx) => {
            const meals = ctx?.day?.meals || [];
            return meals.some(m => (Number(m.protein) || 0) >= 20);
        },
        'protein_target_reached': (ctx) => {
            const proteinPct = Number(ctx?.proteinPct) || 0;
            return proteinPct >= 0.85;
        },

        // Hydration checks
        'water_target_reached': (ctx) => {
            const waterPct = Number(ctx?.waterPct) || 0;
            return waterPct >= 0.85;
        },
        'water_500ml_added': (ctx) => {
            // Сравнить current water с baseline (ctx должен содержать waterBefore)
            const current = Number(ctx?.day?.waterMl) || 0;
            const baseline = Number(ctx?.waterBeforeCommitment) || 0;
            return current - baseline >= 500;
        },

        // Meal-timing checks
        'no_late_dinner_today': (ctx) => {
            const meals = ctx?.day?.meals || [];
            return !meals.some(m => {
                const h = parseInt((m.time || '').split(':')[0], 10);
                return !isNaN(h) && h >= 21;
            });
        },
        'breakfast_within_2h_of_wake': (ctx) => {
            const meals = ctx?.day?.meals || [];
            const wakeHour = Number(ctx?.day?.wakeHour) || 7;
            return meals.some(m => {
                const h = parseInt((m.time || '').split(':')[0], 10);
                return !isNaN(h) && h <= wakeHour + 2;
            });
        },

        // Sleep / Recovery
        'sleep_logged_ge_7h': (ctx) => {
            const sleep = Number(ctx?.day?.sleepHours) || 0;
            return sleep >= 7;
        },

        // Activity / NEAT
        'steps_ge_8000': (ctx) => {
            const steps = Number(ctx?.day?.steps) || 0;
            return steps >= 8000;
        },
        'walking_logged_today': (ctx) => {
            const trainings = ctx?.day?.trainings || [];
            return trainings.some(t => (t.type || '').toLowerCase().includes('walk') ||
                                       (t.type || '').toLowerCase().includes('ходьб'));
        },

        // Stress / Emotional
        'gratitude_logged_today': (ctx) => {
            const notes = ctx?.day?.notes || '';
            return typeof notes === 'string' && (
                notes.toLowerCase().includes('благодар') ||
                notes.toLowerCase().includes('gratitude')
            );
        },

        // Generic fallback — всегда returns false (manual feedback only)
        'manual_only': () => false
    };

    function evaluateCommitmentCheck(checkName, ctx) {
        const fn = COMMITMENT_CHECKS[checkName];
        if (typeof fn !== 'function') return null; // unknown check — skip evaluation
        try { return Boolean(fn(ctx)); } catch (e) { return null; }
    }

    // ═══════════════════════════════════════════════════════════════
    // ENGINE OPERATIONS — accept / decline / process expired
    // ═══════════════════════════════════════════════════════════════

    /**
     * Создаёт pending commitment когда юзер нажимает "Сделаю".
     * @param {Object} advice — совет (rule.follow_up должен быть populated)
     * @param {Object} ctx — текущий snapshot (для baseline'а water/etc)
     */
    function acceptCommitment(advice, ctx) {
        if (!advice?.follow_up?.check) return null;
        const hours = Number(advice.follow_up.hours) || 6;
        const now = Date.now();
        const commitment = {
            adviceId: advice.id,
            acceptedAt: now,
            dueAt: now + hours * 3600 * 1000,
            check: advice.follow_up.check,
            on_success: advice.follow_up.on_success || null,
            on_miss: advice.follow_up.on_miss || null,
            // Baselines на момент accept'а — для water_500ml_added и подобных
            waterBeforeCommitment: Number(ctx?.day?.waterMl) || 0,
            mealCountBeforeCommitment: (ctx?.day?.meals || []).length
        };
        const list = getCommitments();
        list.push(commitment);
        setCommitments(list);
        return commitment;
    }

    /**
     * Регистрирует obstacle (юзер нажал "Сложно сейчас").
     * Не создаёт commitment, но логирует reason для analytics.
     * @param {Object} advice
     * @param {string} reason — top obstacle (time / supplies / fatigue / stress / not_relevant)
     */
    function declineCommitment(advice, reason) {
        try {
            const obstacleKey = 'heys_advice_obstacles_v1';
            const raw = localStorage.getItem(obstacleKey);
            const list = raw ? JSON.parse(raw) : [];
            list.push({
                adviceId: advice.id,
                reason: reason || 'unspecified',
                declinedAt: Date.now()
            });
            // Truncate to last 100 obstacles
            const truncated = list.slice(-100);
            if (window.HEYS?.utils?.lsSet) {
                window.HEYS.utils.lsSet(obstacleKey, truncated);
            } else {
                localStorage.setItem(obstacleKey, JSON.stringify(truncated));
            }
        } catch (e) { /* noop */ }
    }

    /**
     * Process expired commitments — вызывается из generateAdvices.
     * Возвращает массив follow-up advice IDs которые надо добавить в pool.
     * Cleanup expired entries (success/miss already processed).
     * @param {Object} ctx
     * @returns {Array<{adviceId: string, outcome: 'success'|'miss', commitment}>}
     */
    function processExpiredCommitments(ctx) {
        const now = Date.now();
        const list = getCommitments();
        const remaining = [];
        const results = [];
        const ttlMs = COMMITMENT_TTL_HOURS * 3600 * 1000;

        for (const c of list) {
            // Cleanup ancient (TTL exceeded даже без processing — пользователь забыл)
            if (now - c.acceptedAt > ttlMs) continue;

            // Not yet due
            if (now < c.dueAt) {
                remaining.push(c);
                continue;
            }

            // Due — evaluate
            const passed = evaluateCommitmentCheck(c.check, ctx);
            if (passed === null) {
                // Unknown check — keep in list, may be evaluated next time
                // (но не больше TTL)
                remaining.push(c);
                continue;
            }

            const targetId = passed ? c.on_success : c.on_miss;
            if (targetId) {
                results.push({
                    adviceId: targetId,
                    outcome: passed ? 'success' : 'miss',
                    commitment: c
                });
            }
            // Don't push to remaining — commitment processed
        }

        // Cleanup processed commitments
        if (remaining.length !== list.length) {
            setCommitments(remaining);
        }

        return results;
    }

    /**
     * Cancel pending commitment by adviceId (например, юзер передумал).
     */
    function cancelCommitment(adviceId) {
        const list = getCommitments();
        const filtered = list.filter(c => c.adviceId !== adviceId);
        if (filtered.length !== list.length) setCommitments(filtered);
    }

    function getPendingCommitments() {
        const now = Date.now();
        return getCommitments().filter(c => c.dueAt > now);
    }

    function getCommitmentStats() {
        const list = getCommitments();
        const now = Date.now();
        return {
            total: list.length,
            pending: list.filter(c => c.dueAt > now).length,
            overdue: list.filter(c => c.dueAt <= now).length
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════════
    window.HEYS.adviceCommitments = {
        accept: acceptCommitment,
        decline: declineCommitment,
        processExpired: processExpiredCommitments,
        cancel: cancelCommitment,
        getPending: getPendingCommitments,
        getStats: getCommitmentStats,
        evaluateCheck: evaluateCommitmentCheck,
        // Direct exports для tests/debug
        _STORAGE_KEY: STORAGE_KEY,
        _COMMITMENT_CHECKS: COMMITMENT_CHECKS
    };

})();
