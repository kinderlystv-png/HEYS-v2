// pi_ui_helpers.js — Shared UI helpers for Insights modules
// Centralized fallback getters to avoid duplication across dashboard/cards/rings/what-if
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    function getInfoButton(hFactory) {
        return HEYS.InsightsPI?.uiDashboard?.InfoButton ||
            HEYS.PredictiveInsights?.components?.InfoButton ||
            HEYS.day?.InfoButton ||
            HEYS.InfoButton ||
            global.InfoButton ||
            function InfoButtonFallback({ infoKey }) {
                return hFactory
                    ? hFactory('span', {
                        className: 'info-button-placeholder',
                        title: infoKey,
                        style: { cursor: 'help', opacity: 0.5 }
                    }, 'ℹ️')
                    : null;
            };
    }

    const FALLBACK_PRIORITY_LEVELS = {
        CRITICAL: { level: 1, name: 'Критический', emoji: '🔴', color: '#ef4444' },
        HIGH: { level: 2, name: 'Высокий', emoji: '🟠', color: '#f97316' },
        MEDIUM: { level: 3, name: 'Средний', emoji: '🟡', color: '#eab308' },
        LOW: { level: 4, name: 'Низкий', emoji: '🟢', color: '#22c55e' },
        INFO: { level: 5, name: 'Справочный', emoji: '🔵', color: '#3b82f6' }
    };

    const FALLBACK_CATEGORIES = {
        METABOLISM: { id: 'metabolism', name: 'Метаболизм', emoji: '🔥', color: '#f97316' },
        NUTRITION: { id: 'nutrition', name: 'Питание', emoji: '🍽️', color: '#22c55e' },
        TIMING: { id: 'timing', name: 'Тайминг', emoji: '⏰', color: '#8b5cf6' },
        RECOVERY: { id: 'recovery', name: 'Восстановление', emoji: '😴', color: '#6366f1' },
        RISK: { id: 'risk', name: 'Риски', emoji: '⚠️', color: '#ef4444' },
        PREDICTION: { id: 'prediction', name: 'Прогнозы', emoji: '🔮', color: '#a855f7' },
        PATTERNS: { id: 'patterns', name: 'Паттерны', emoji: '🧬', color: '#ec4899' },
        COMPOSITE: { id: 'composite', name: 'Композитные', emoji: '📊', color: '#14b8a6' },
        STATISTICS: { id: 'statistics', name: 'Статистика', emoji: '📈', color: '#64748b' }
    };

    function getPriorityLevels(constants) {
        return constants?.PRIORITY_LEVELS || HEYS.InsightsPI?.constants?.PRIORITY_LEVELS || FALLBACK_PRIORITY_LEVELS;
    }

    function getCategories(constants) {
        return constants?.CATEGORIES || HEYS.InsightsPI?.constants?.CATEGORIES || FALLBACK_CATEGORIES;
    }

    HEYS.InsightsPI.uiHelpers = {
        getInfoButton,
        getPriorityLevels,
        getCategories
    };

    global.piUIHelpers = HEYS.InsightsPI.uiHelpers;
})(typeof window !== 'undefined' ? window : global);