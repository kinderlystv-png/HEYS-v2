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

    const MODULE_NAME = 'HEYS.InsightsPI.mealRecFeedback';
    const STORAGE_KEY = 'heys_meal_feedback';
    const CLOUD_KV_KEY = 'meal_rec_feedback_v1';
    const RETENTION_DAYS = 90;
    const HALF_LIFE_DAYS = 14; // период полураспада для exponential decay

    // Unified logging filter for console filtering
    const LOG_FILTER = 'MEALREC';
    const LOG_PREFIX = `[${LOG_FILTER}][${MODULE_NAME}]`;

    // Cloud sync runtime state (best effort, non-blocking)
    const syncState = {
        lastSyncAt: null,
        lastSyncStatus: 'idle', // idle | syncing | success | error | skipped
        lastSyncReason: null,
        lastError: null,
    };

    /**
     * Получить текущий clientId из профиля
     */
    function getCurrentClientId() {
        try {
            const profile = globalObj.U?.lsGet('heys_profile');
            return profile?.id || null;
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Cannot get clientId:`, err?.message);
            return null;
        }
    }

    /**
     * Проверка доступности cloud KV API
     */
    function canUseCloudKV() {
        return !!(
            globalObj.HEYS?.YandexAPI &&
            typeof globalObj.HEYS.YandexAPI.getKV === 'function' &&
            typeof globalObj.HEYS.YandexAPI.saveKV === 'function'
        );
    }

    /**
     * Создать уникальный ID feedback-записи
     */
    function makeFeedbackId() {
        return `fb_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }

    /**
     * Нормализация записи feedback (backward compatibility)
     */
    function normalizeFeedbackEntry(item) {
        if (!item || typeof item !== 'object') return null;
        if (!item.timestamp) return null;

        return {
            id: item.id || makeFeedbackId(),
            timestamp: item.timestamp,
            scenario: item.scenario || 'UNKNOWN',
            rating: item.rating === 1 ? 1 : -1,
            products: Array.isArray(item.products) ? item.products : [],
            confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
            context: item.context || null,
        };
    }

    /**
     * Объединить локальную и облачную историю без дублей
     */
    function mergeHistories(localHistory, cloudHistory) {
        const byId = new Map();
        const byFingerprint = new Set();

        const add = (entry) => {
            const normalized = normalizeFeedbackEntry(entry);
            if (!normalized) return;

            if (normalized.id && byId.has(normalized.id)) return;

            const fingerprint = `${normalized.timestamp}|${normalized.scenario}|${normalized.rating}|${(normalized.products || []).join(',')}`;
            if (byFingerprint.has(fingerprint)) return;

            if (normalized.id) byId.set(normalized.id, normalized);
            byFingerprint.add(fingerprint);
        };

        (localHistory || []).forEach(add);
        (cloudHistory || []).forEach(add);

        return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
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
                        console.info(`${LOG_PREFIX} 🔄 Migrated feedback from legacy key`);
                    }
                }
            }

            if (!data || !Array.isArray(data)) return [];

            // Фильтрация старых записей (retention: 90 дней)
            const now = Date.now();
            const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
            const filtered = data
                .map(normalizeFeedbackEntry)
                .filter(Boolean)
                .filter(item => (now - item.timestamp) < retentionMs);

            return filtered;
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Cannot load feedback history:`, err?.message);
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
                // HEYS.utils.lsSet недоступен (bootstrap-window). Не пишем напрямую
                // в LS — это bypass'ит cloud-sync interceptor. Лучше потерять кеш
                // одного бутстрапа чем рассинхронить с облаком.
                console.warn(`${LOG_PREFIX} ⚠️ U.lsSet недоступен, feedback не закешировался локально (будет загружен из облака)`);
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} ❌ Cannot save feedback:`, err?.message);
        }
    }

    /**
     * Загрузить историю feedback из cloud KV (если доступно)
     */
    async function loadCloudHistory(clientId) {
        if (!clientId || !canUseCloudKV()) return [];

        try {
            const result = await globalObj.HEYS.YandexAPI.getKV(clientId, CLOUD_KV_KEY);
            if (result?.error) {
                console.warn(`${LOG_PREFIX} ⚠️ Cloud getKV failed:`, result.error);
                return [];
            }

            const payload = result?.data;
            if (!payload) return [];

            const cloudItems = Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload)
                    ? payload
                    : [];

            return cloudItems.map(normalizeFeedbackEntry).filter(Boolean);
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Cloud history load error:`, err?.message);
            return [];
        }
    }

    /**
     * Сохранить историю feedback в cloud KV (если доступно)
     */
    async function saveCloudHistory(clientId, history, reason = 'manual') {
        if (!clientId || !canUseCloudKV()) return { success: false, skipped: true };

        try {
            const payload = {
                version: '1.1.0',
                updatedAt: Date.now(),
                reason,
                items: Array.isArray(history) ? history : [],
            };

            const result = await globalObj.HEYS.YandexAPI.saveKV(clientId, CLOUD_KV_KEY, payload);
            if (!result?.success) {
                return { success: false, error: result?.error || 'Unknown saveKV error' };
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || 'Cloud save failed' };
        }
    }

    /**
     * Выполнить cloud sync (pull + merge + push), не ломая локальный UX
     */
    async function syncWithCloud(options = {}) {
        const reason = options.reason || 'manual';
        const clientId = options.clientId || getCurrentClientId();

        if (!clientId) {
            syncState.lastSyncStatus = 'skipped';
            syncState.lastSyncReason = reason;
            syncState.lastError = 'No clientId';
            console.info(`${LOG_PREFIX} ℹ️ Cloud sync skipped: no clientId`);
            return { success: false, skipped: true, reason: 'no_client' };
        }

        if (!canUseCloudKV()) {
            syncState.lastSyncStatus = 'skipped';
            syncState.lastSyncReason = reason;
            syncState.lastError = 'YandexAPI KV unavailable';
            console.info(`${LOG_PREFIX} ℹ️ Cloud sync skipped: YandexAPI KV unavailable`);
            return { success: false, skipped: true, reason: 'no_api' };
        }

        syncState.lastSyncStatus = 'syncing';
        syncState.lastSyncReason = reason;
        syncState.lastError = null;

        try {
            const localHistory = loadFeedbackHistory(clientId);
            const cloudHistory = await loadCloudHistory(clientId);
            const merged = mergeHistories(localHistory, cloudHistory);

            saveFeedbackHistory(clientId, merged);

            const pushResult = await saveCloudHistory(clientId, merged, reason);
            if (!pushResult.success) {
                syncState.lastSyncStatus = 'error';
                syncState.lastError = pushResult.error || 'push failed';
                console.warn(`${LOG_PREFIX} ⚠️ Cloud sync push failed:`, pushResult.error);
                return { success: false, error: pushResult.error || 'push failed' };
            }

            syncState.lastSyncStatus = 'success';
            syncState.lastSyncAt = Date.now();
            syncState.lastError = null;

            console.info(`${LOG_PREFIX} ✅ Cloud sync completed:`, {
                reason,
                localCount: localHistory.length,
                cloudCount: cloudHistory.length,
                mergedCount: merged.length,
            });

            return {
                success: true,
                localCount: localHistory.length,
                cloudCount: cloudHistory.length,
                mergedCount: merged.length,
            };
        } catch (err) {
            syncState.lastSyncStatus = 'error';
            syncState.lastError = err?.message || 'sync failed';
            console.error(`${LOG_PREFIX} ❌ Cloud sync error:`, err?.message);
            return { success: false, error: err?.message || 'sync failed' };
        }
    }

    /**
     * Текущий статус последней синхронизации
     */
    function getSyncStatus() {
        return {
            ...syncState,
        };
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
            console.warn(`${LOG_PREFIX} ⚠️ Cannot add feedback: no clientId`);
            return false;
        }

        if (!feedbackData || !feedbackData.scenario || !feedbackData.rating) {
            console.warn(`${LOG_PREFIX} ⚠️ Invalid feedback data:`, feedbackData);
            return false;
        }

        try {
            const history = loadFeedbackHistory(clientId);
            const newEntry = {
                id: makeFeedbackId(),
                timestamp: Date.now(),
                scenario: feedbackData.scenario,
                rating: feedbackData.rating, // 1 or -1
                products: feedbackData.products || [],
                confidence: feedbackData.confidence || 0,
                context: feedbackData.context || null
            };

            history.push(newEntry);
            saveFeedbackHistory(clientId, history);

            console.info(`${LOG_PREFIX} ✅ Feedback added:`, {
                scenario: newEntry.scenario,
                rating: newEntry.rating === 1 ? '👍' : '👎',
                totalFeedback: history.length
            });

            // Best-effort cloud sync, no blocking UI
            syncWithCloud({ clientId, reason: 'add_feedback' })
                .catch((err) => console.warn(`${LOG_PREFIX} ⚠️ Async sync failed:`, err?.message));

            return true;
        } catch (err) {
            console.error(`${LOG_PREFIX} ❌ Cannot add feedback:`, err?.message);
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

        console.info(`${LOG_PREFIX} 📊 Adjustment calculated:`, {
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
            console.info(`${LOG_PREFIX} ✅ Feedback history cleared`);
            return true;
        } catch (err) {
            console.error(`${LOG_PREFIX} ❌ Cannot clear feedback:`, err?.message);
            return false;
        }
    }

    // v61: Wait for main sync to complete before bootstrap so profile/clientId are loaded.
    // Falls back to 10s timeout if heys:sync-complete never fires (e.g. session already cached).
    var _fbBootstrapDone = false;
    function _doBootstrapSync() {
        if (_fbBootstrapDone) return;
        _fbBootstrapDone = true;
        syncWithCloud({ reason: 'bootstrap' })
            .catch((err) => console.warn(`${LOG_PREFIX} ⚠️ Bootstrap sync failed:`, err?.message));
    }
    globalObj.addEventListener('heys:sync-complete', function _onSyncComplete() {
        globalObj.removeEventListener('heys:sync-complete', _onSyncComplete);
        _doBootstrapSync();
    });
    // Fallback: if heys:sync-complete never fires within 10s, try anyway
    setTimeout(_doBootstrapSync, 10000);

    // Публичное API
    globalObj.HEYS.InsightsPI.mealRecFeedback = {
        addFeedback,
        calculateAdjustmentFactor,
        getFeedbackStats,
        clearFeedbackHistory,
        syncWithCloud,
        getSyncStatus,
        // Для тестирования
        _loadHistory: loadFeedbackHistory,
        _saveHistory: saveFeedbackHistory,
        _getCurrentClientId: getCurrentClientId,
        _mergeHistories: mergeHistories,
    };

    console.info(`${LOG_PREFIX} 📦 Module loaded (v1.1.0 hybrid local+cloud)`);
})();
