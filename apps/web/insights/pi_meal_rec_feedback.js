/**
 * Meal Recommender Feedback Module (R2.7 ML)
 * v1.0.0 — Machine Learning via User Feedback
 * 
 * Функционал:
 * - Сбор обратной связи от пользователя (👍/👎)
 * - Хранение истории feedback в localStorage (по clientId)
 * - Агрегация feedback по сценариям
 * - Динамическая корректировка confidence на основе истории
 * - Exponential Moving Average для адаптивного обучения
 * - Очистка старых данных (retention: 90 дней)
 * 
 * Формула adjustment:
 * confidence_adjusted = confidence_base × adjustment_factor
 * adjustment_factor = 0.5 + (successRate × decay)
 * где decay = exp(-age/halfLife), halfLife = 14 дней
 * 
 * @author HEYS Insights Team
 * @since 2026-02-15
 */

(function () {
    'use strict';

    const globalObj = typeof window !== 'undefined' ? window : global;

    if (!globalObj.HEYS) globalObj.HEYS = {};
    if (!globalObj.HEYS.InsightsPI) globalObj.HEYS.InsightsPI = {};
    if (!globalObj.HEYS.InsightsPI.mealRecFeedback) {
        globalObj.HEYS.InsightsPI.mealRecFeedback = {};
    }

    const STORAGE_KEY = 'heys_meal_feedback';
    const RETENTION_DAYS = 90;
    const HALF_LIFE_DAYS = 14; // период полураспада для exponential decay

    // Unified logging filter for console filtering
    const LOG_FILTER = 'MEALREC';

    /**
     * Получить текущий clientId из профиля
     */
    function getCurrentClientId() {
        try {
            const profile = globalObj.U?.lsGet('heys_profile');
            return profile?.id || null;
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Cannot get clientId:`, err?.message);
            return null;
        }
    }

    /**
     * Построить namespace ключ для хранения (legacy compatibility)
     */
    function buildLegacyStorageKey(clientId) {
        if (!clientId) return STORAGE_KEY;
        return `heys_${clientId}_${STORAGE_KEY}`;
    }

    /**
     * Загрузить все feedback из localStorage
     * P2 Fix: Uses U.lsGet with backward-compatible read-through
     */
    function loadFeedbackHistory(clientId) {
        try {
            // Try new U.lsGet approach (namespaced by clientId automatically)
            const U = globalObj.U;
            let data = null;

            if (U && typeof U.lsGet === 'function') {
                data = U.lsGet(STORAGE_KEY); // U.lsGet handles clientId namespace
            }

            // Backward-compatible read: check old key format if no data
            if (!data && clientId) {
                const legacyKey = buildLegacyStorageKey(clientId);
                const raw = localStorage.getItem(legacyKey);
                if (raw) {
                    data = JSON.parse(raw);
                    // Migrate to new format
                    if (U && typeof U.lsSet === 'function') {
                        U.lsSet(STORAGE_KEY, data);
                        localStorage.removeItem(legacyKey); // Clean up old key
                        console.info(`[${LOG_FILTER}] 🔄 Migrated feedback from legacy key`);
                    }
                }
            }

            if (!data || !Array.isArray(data)) return [];

            // Фильтрация старых записей (retention: 90 дней)
            const now = Date.now();
            const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
            const filtered = data.filter(item => {
                if (!item.timestamp) return false;
                return (now - item.timestamp) < retentionMs;
            });

            return filtered;
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Cannot load feedback history:`, err?.message);
            return [];
        }
    }

    /**
     * Сохранить feedback в localStorage
     * P2 Fix: Uses U.lsSet with automatic clientId namespacing
     */
    function saveFeedbackHistory(clientId, feedback) {
        try {
            const U = globalObj.U;
            if (U && typeof U.lsSet === 'function') {
                U.lsSet(STORAGE_KEY, feedback); // U.lsSet handles clientId namespace
            } else {
                // Fallback to direct localStorage (shouldn't happen in production)
                const legacyKey = buildLegacyStorageKey(clientId);
                localStorage.setItem(legacyKey, JSON.stringify(feedback));
            }
        } catch (err) {
            console.error(`[${LOG_FILTER}] ❌ Cannot save feedback:`, err?.message);
        }
    }

    /**
     * Добавить новый feedback
     * @param {Object} feedbackData - Данные обратной связи
     * @param {string} feedbackData.scenario - Сценарий рекомендации
     * @param {number} feedbackData.rating - 1 (👍) или -1 (👎)
     * @param {Array<string>} feedbackData.products - Список продуктов
     * @param {number} feedbackData.confidence - Изначальная confidence
     * @param {Object} feedbackData.context - Контекст рекомендации (опционально)
     * @param {string} [feedbackData.clientId] - Опциональный clientId (fallback к автоопределению)
     */
    function addFeedback(feedbackData) {
        const clientId = feedbackData.clientId || getCurrentClientId();
        if (!clientId) {
            console.warn(`[${LOG_FILTER}] ⚠️ Cannot add feedback: no clientId`);
            return false;
        }

        if (!feedbackData || !feedbackData.scenario || !feedbackData.rating) {
            console.warn(`[${LOG_FILTER}] ⚠️ Invalid feedback data:`, feedbackData);
            return false;
        }

        try {
            const history = loadFeedbackHistory(clientId);
            const newEntry = {
                timestamp: Date.now(),
                scenario: feedbackData.scenario,
                rating: feedbackData.rating, // 1 or -1
                products: feedbackData.products || [],
                confidence: feedbackData.confidence || 0,
                context: feedbackData.context || null
            };

            history.push(newEntry);
            saveFeedbackHistory(clientId, history);

            console.info(`[${LOG_FILTER}] ✅ Feedback added:`, {
                scenario: newEntry.scenario,
                rating: newEntry.rating === 1 ? '👍' : '👎',
                totalFeedback: history.length
            });

            return true;
        } catch (err) {
            console.error(`[${LOG_FILTER}] ❌ Cannot add feedback:`, err?.message);
            return false;
        }
    }

    /**
     * Вычислить adjustment factor для сценария на основе истории feedback
     * @param {string} scenario - Название сценария
     * @param {Array} history - История feedback (опционально, если null - загрузит сам)
     * @returns {number} - Adjustment factor (0.5-1.5)
     */
    function calculateAdjustmentFactor(scenario, history = null) {
        const clientId = getCurrentClientId();
        if (!clientId) return 1.0; // neutral если нет clientId

        if (!history) {
            history = loadFeedbackHistory(clientId);
        }

        if (!history || history.length === 0) {
            return 1.0; // neutral при отсутствии данных
        }

        // Фильтруем feedback для данного сценария
        const scenarioFeedback = history.filter(item => item.scenario === scenario);
        if (scenarioFeedback.length === 0) {
            return 1.0; // neutral для нового сценария
        }

        // Вычисляем weighted success rate с exponential decay
        const now = Date.now();
        const halfLifeMs = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

        let weightedSum = 0;
        let weightTotal = 0;

        scenarioFeedback.forEach(item => {
            const age = now - item.timestamp;
            const decay = Math.exp(-age / halfLifeMs); // exponential decay
            const weight = decay;
            const score = item.rating === 1 ? 1 : 0; // 1 для 👍, 0 для 👎

            weightedSum += score * weight;
            weightTotal += weight;
        });

        if (weightTotal === 0) return 1.0;

        const successRate = weightedSum / weightTotal; // 0.0-1.0

        // Adjustment factor: 0.5-1.5 (базовый диапазон)
        // successRate=1.0 (все 👍) → adjustment=1.5
        // successRate=0.5 (50/50) → adjustment=1.0
        // successRate=0.0 (все 👎) → adjustment=0.5
        const adjustmentFactor = 0.5 + (successRate * 1.0);

        console.info(`[${LOG_FILTER}] 📊 Adjustment calculated:`, {
            scenario,
            feedbackCount: scenarioFeedback.length,
            successRate: successRate.toFixed(2),
            adjustmentFactor: adjustmentFactor.toFixed(2)
        });

        return adjustmentFactor;
    }

    /**
     * Получить статистику feedback для всех сценариев
     */
    function getFeedbackStats() {
        const clientId = getCurrentClientId();
        if (!clientId) return null;

        const history = loadFeedbackHistory(clientId);
        if (!history || history.length === 0) {
            return {
                totalFeedback: 0,
                scenarios: {}
            };
        }

        // Группировка по сценариям
        const scenarios = {};
        history.forEach(item => {
            if (!scenarios[item.scenario]) {
                scenarios[item.scenario] = {
                    total: 0,
                    positive: 0,
                    negative: 0,
                    successRate: 0,
                    adjustment: 1.0
                };
            }
            scenarios[item.scenario].total++;
            if (item.rating === 1) scenarios[item.scenario].positive++;
            if (item.rating === -1) scenarios[item.scenario].negative++;
        });

        // Вычисляем success rate и adjustment для каждого сценария
        Object.keys(scenarios).forEach(scenario => {
            const stats = scenarios[scenario];
            stats.successRate = stats.total > 0 ? (stats.positive / stats.total) : 0;
            stats.adjustment = calculateAdjustmentFactor(scenario, history);
        });

        return {
            totalFeedback: history.length,
            scenarios
        };
    }

    /**
     * Очистить всю историю feedback (для тестирования)
     */
    function clearFeedbackHistory() {
        const clientId = getCurrentClientId();
        if (!clientId) return false;

        try {
            const U = globalObj.U;
            if (U && typeof U.lsSet === 'function') {
                U.lsSet(STORAGE_KEY, null);
            } else {
                const legacyKey = buildLegacyStorageKey(clientId);
                localStorage.removeItem(legacyKey);
            }
            console.info(`[${LOG_FILTER}] ✅ Feedback history cleared`);
            return true;
        } catch (err) {
            console.error(`[${LOG_FILTER}] ❌ Cannot clear feedback:`, err?.message);
            return false;
        }
    }

    // Публичное API
    globalObj.HEYS.InsightsPI.mealRecFeedback = {
        addFeedback,
        calculateAdjustmentFactor,
        getFeedbackStats,
        clearFeedbackHistory,
        // Для тестирования
        _loadHistory: loadFeedbackHistory,
        _saveHistory: saveFeedbackHistory,
        _getCurrentClientId: getCurrentClientId
    };

    console.info(`[${LOG_FILTER}] 📦 Module loaded (v1.0)`);
})();
