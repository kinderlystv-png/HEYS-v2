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
        return handler(primary.data || {}, advice);
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
        // Direct exports для tests/debug
        _HANDLERS: ADVICE_ACTION_HANDLERS
    };

})();
