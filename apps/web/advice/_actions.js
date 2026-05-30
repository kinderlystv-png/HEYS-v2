/**
 * HEYS Advice Action Handlers — Phase B.1 + B.2
 * @file advice/_actions.js
 *
 * Реализует in-card action buttons для advice cards: вместо swipe-only
 * dismiss, прямо в карточке совета 2 кнопки на выбор:
 *
 *   • PRIMARY action (например, "→ В конструктор витаминов") — execute
 *     handler exec + mark advice as positive outcome
 *   • SNOOZE action ("Добавлю позже") — scheduleAdvice(advice, minutes) →
 *     advice re-appears через N часов через existing
 *     getScheduledAdvices() mechanism
 *
 * Rule schema extension:
 *   rule.action = {
 *     primary?: {
 *       label: string,           // e.g. "→ В конструктор витаминов"
 *       handler: string,         // lookup key в ADVICE_ACTION_HANDLERS
 *       data?: object            // passed to handler
 *     },
 *     snooze?: {
 *       label: string,           // e.g. "Добавлю позже"
 *       remindAfterMinutes: number // default 120 (2ч)
 *     }
 *   }
 *
 * Phase B.4 populate'ит action для 25+ rules:
 *   • 11 supplements/vitamins → openSupplementsCourse
 *   • 5 meal-addition (protein/fiber/breakfast) → addMealProduct
 *   • 2 water → logWaterGlass
 *   • 4 sleep/recovery/training → openHabitTracker
 *   • 3+ misc actionable
 *
 * NOTE: Phase B.3 UI buttons в renderAutoAdviceToast + renderManualAdviceList —
 * отдельный commit. Phase B.5+B.6 obstacle picker + smart snooze cycle —
 * отдельные commits.
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};

    // ═══════════════════════════════════════════════════════════════
    // ACTION HANDLERS — lookup table для primary actions
    // ═══════════════════════════════════════════════════════════════
    //
    // Каждый handler получает (data, advice) и выполняет UI action.
    // Defensive: если target API отсутствует — graceful warn без throw.
    // Click через handler также fires recordAdviceOutcomeEvent('positive')
    // через UI rendering layer (Phase B.3).

    const ADVICE_ACTION_HANDLERS = {
        // 💊 Vitamins/supplements — открывает конструктор курса витаминов
        openSupplementsCourse: (data /*, advice */) => {
            const api = window.HEYS?.Supplements;
            if (api?.openMyCourseScreen) {
                try {
                    api.openMyCourseScreen(data || {});
                    return true;
                } catch (e) {
                    console.warn('[advice.action] openSupplementsCourse failed:', e?.message);
                    return false;
                }
            }
            console.warn('[advice.action] HEYS.Supplements.openMyCourseScreen not available');
            return false;
        },

        // 🍽️ Meal addition — открывает product search для конкретной категории
        // data.category: 'protein' | 'fiber' | 'breakfast' | 'late_first'
        addMealProduct: (data) => {
            try {
                window.dispatchEvent(new CustomEvent('heys:open-product-search', {
                    detail: { category: data?.category || null, source: 'advice_action' }
                }));
                return true;
            } catch (e) {
                console.warn('[advice.action] addMealProduct event dispatch failed:', e?.message);
                return false;
            }
        },

        // 💧 Water logging — quick add 250ml (или data.ml)
        logWaterGlass: (data) => {
            try {
                window.dispatchEvent(new CustomEvent('heys:water-quick-add', {
                    detail: { ml: Number(data?.ml) || 250, source: 'advice_action' }
                }));
                return true;
            } catch (e) {
                console.warn('[advice.action] logWaterGlass event dispatch failed:', e?.message);
                return false;
            }
        },

        // 🌱 Habit tracker — open habit для sleep/training/walking/etc
        // data.habit: 'sleep' | 'walking' | 'meditation' | etc.
        openHabitTracker: (data) => {
            try {
                window.dispatchEvent(new CustomEvent('heys:open-habit-tracker', {
                    detail: { habit: data?.habit || null, source: 'advice_action' }
                }));
                return true;
            } catch (e) {
                console.warn('[advice.action] openHabitTracker event dispatch failed:', e?.message);
                return false;
            }
        },

        // 🩺 Open profile (для disclaimer / settings)
        openProfile: (data) => {
            try {
                window.dispatchEvent(new CustomEvent('heys:open-profile', {
                    detail: { section: data?.section || null, source: 'advice_action' }
                }));
                return true;
            } catch (e) {
                console.warn('[advice.action] openProfile event dispatch failed:', e?.message);
                return false;
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // API
    // ═══════════════════════════════════════════════════════════════

    /**
     * Execute primary action handler для совета.
     * @param {Object} advice — rule с rule.action.primary.handler
     * @returns {boolean} true if handler success
     */
    function executePrimary(advice) {
        const primary = advice?.action?.primary;
        if (!primary?.handler) return false;
        const handler = ADVICE_ACTION_HANDLERS[primary.handler];
        if (typeof handler !== 'function') {
            console.warn('[advice.action] Unknown handler:', primary.handler);
            return false;
        }
        const result = handler(primary.data || {}, advice);
        // Phase B.6: автоматически cancel pending snooze для этого ID
        // (юзер выполнил primary → no need to remind).
        try {
            if (result !== false && window.HEYS?.advice?.cancelScheduledByAdviceId) {
                window.HEYS.advice.cancelScheduledByAdviceId(advice.id);
            }
        } catch (e) { /* noop */ }
        // Reset snooze counter
        try { snoozeCounters[advice.id] = 0; persistSnoozeCounters(); } catch (e) { /* noop */ }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔁 Phase B.5+B.6 (2026-05-31): Smart snooze cycle с escalation
    //
    // Track snooze count per advice ID. После 3 snooze без compliance —
    // эскалация: пометить как "не актуально" (через commitments.decline
    // + cancel scheduled). Counter persisted в LS, reset при primary exec.
    // ═══════════════════════════════════════════════════════════════

    const SNOOZE_COUNTER_KEY = 'heys_advice_snooze_counters_v1';
    const SNOOZE_ESCALATION_THRESHOLD = 3;
    let snoozeCounters = (() => {
        try { return JSON.parse(localStorage.getItem(SNOOZE_COUNTER_KEY) || '{}'); }
        catch (e) { return {}; }
    })();

    function persistSnoozeCounters() {
        try {
            if (window.HEYS?.utils?.lsSet) {
                window.HEYS.utils.lsSet(SNOOZE_COUNTER_KEY, snoozeCounters);
            } else {
                localStorage.setItem(SNOOZE_COUNTER_KEY, JSON.stringify(snoozeCounters));
            }
        } catch (e) { /* noop */ }
    }

    /**
     * Smart snooze with escalation tracking.
     * @param {Object} advice
     * @returns {Object} { scheduled: boolean, count: number, escalated: boolean }
     */
    function snoozeWithEscalation(advice) {
        if (!advice?.id) return { scheduled: false, count: 0, escalated: false };
        const minutes = Number(advice?.action?.snooze?.remindAfterMinutes) || 120;
        const prevCount = snoozeCounters[advice.id] || 0;
        const newCount = prevCount + 1;
        snoozeCounters[advice.id] = newCount;
        persistSnoozeCounters();

        // Escalation: после 3+ snooze без compliance — cancel и log obstacle
        if (newCount >= SNOOZE_ESCALATION_THRESHOLD) {
            try {
                if (window.HEYS?.advice?.cancelScheduledByAdviceId) {
                    window.HEYS.advice.cancelScheduledByAdviceId(advice.id);
                }
                if (window.HEYS?.adviceCommitments?.decline) {
                    window.HEYS.adviceCommitments.decline(advice, 'repeated_snooze');
                }
                // Reset counter после escalation чтобы не блокировать навсегда
                snoozeCounters[advice.id] = 0;
                persistSnoozeCounters();
            } catch (e) { /* noop */ }
            return { scheduled: false, count: newCount, escalated: true };
        }

        // Normal snooze via existing scheduleAdvice infrastructure
        try {
            const scheduleFn = window.HEYS?.advice?.scheduleAdvice;
            if (typeof scheduleFn === 'function') {
                scheduleFn(advice, minutes);
                return { scheduled: true, count: newCount, escalated: false };
            }
        } catch (e) { /* noop */ }
        return { scheduled: false, count: newCount, escalated: false };
    }

    function getSnoozeCount(adviceId) {
        return snoozeCounters[adviceId] || 0;
    }

    function resetSnoozeCounter(adviceId) {
        if (adviceId) delete snoozeCounters[adviceId];
        else snoozeCounters = {};
        persistSnoozeCounters();
    }

    /**
     * Register custom handler (для extension точек / тестов).
     */
    function registerHandler(name, fn) {
        if (typeof fn !== 'function') {
            console.warn('[advice.action] registerHandler: not a function:', name);
            return;
        }
        ADVICE_ACTION_HANDLERS[name] = fn;
    }

    function listHandlers() {
        return Object.keys(ADVICE_ACTION_HANDLERS);
    }

    function hasHandler(name) {
        return typeof ADVICE_ACTION_HANDLERS[name] === 'function';
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════════
    window.HEYS.adviceActions = {
        execute: executePrimary,
        register: registerHandler,
        list: listHandlers,
        has: hasHandler,
        // Phase B.5+B.6 snooze cycle
        snooze: snoozeWithEscalation,
        getSnoozeCount,
        resetSnoozeCounter,
        // Direct exports для tests/debug
        _HANDLERS: ADVICE_ACTION_HANDLERS,
        _SNOOZE_ESCALATION_THRESHOLD: SNOOZE_ESCALATION_THRESHOLD
    };

})();
