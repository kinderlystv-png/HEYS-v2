/**
 * HEYS Predictive Insights — Feedback Loop v1.2.1
 * 
 * Outcome learning: collect user feedback on recommendations and patterns.
 * ML weight adjustment via exponential moving average (EMA).
 * 
 * v1.2.1: extractProductIds handles flat/grouped/multi-meal formats.
 *         Fixes empty productIds in grouped mode (groups[] not extracted).
 * v1.2: Trimmed storage — only scenario + productIds stored (not full products).
 *       Max history reduced 100→50. Size guard: prune if > 200KB.
 *       Fixes localStorage overflow (693KB single key).
 * 
 * Flow:
 * 1. Recommendation given → store with ID
 * 2. User follows/ignores → track
 * 3. User provides outcome feedback (satiety, energy, mood)
 * 4. ML weight adjustment: EMA (α=0.1, ±5% boost/penalty, range 0.5-2.0)
 * 5. Product Picker reads learned weights for scoring
 * 
 * Dependencies: pi_meal_recommender.js, pi_whatif.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const STORAGE_KEY_PREFIX = 'heys_insights_feedback_';
    const MAX_HISTORY = 30; // Extra conservative to protect localStorage budget
    const MAX_STORAGE_KB = 96; // Hard cap per feedback key in KB

    /**
     * v1.2.1: Extract product IDs from any recommendation format.
     * Handles flat suggestions, grouped mode, and multi-meal plans.
     * @private
     * @param {object} rec - Recommendation (or recommendation sub-object)
     * @returns {string[]} - Unique product IDs (max 20)
     */
    function extractProductIds(rec) {
        if (!rec) return [];
        var ids = [];

        // Flat suggestions / products
        var suggestions = rec.suggestions || rec.products;
        if (Array.isArray(suggestions)) {
            suggestions.forEach(function (s) {
                var id = s && (s.id || s.product_id || s.productId);
                if (id) ids.push(id);
            });
        }

        // Grouped mode: groups[].products[]
        if (Array.isArray(rec.groups)) {
            rec.groups.forEach(function (g) {
                var prods = g && (g.products || g.items);
                if (Array.isArray(prods)) {
                    prods.forEach(function (p) {
                        var id = p && (p.id || p.product_id || p.productId);
                        if (id) ids.push(id);
                    });
                }
            });
        }

        // Multi-meal: mealPlan[].groups[].products[]
        var mealPlan = rec.mealPlan || rec.meals;
        if (Array.isArray(mealPlan)) {
            mealPlan.forEach(function (meal) {
                if (!meal) return;
                var mGroups = meal.groups;
                if (Array.isArray(mGroups)) {
                    mGroups.forEach(function (g) {
                        var prods = g && (g.products || g.items);
                        if (Array.isArray(prods)) {
                            prods.forEach(function (p) {
                                var id = p && (p.id || p.product_id || p.productId);
                                if (id) ids.push(id);
                            });
                        }
                    });
                }
            });
        }

        // Deduplicate & cap
        var seen = {};
        return ids.filter(function (id) {
            if (seen[id]) return false;
            seen[id] = true;
            return true;
        }).slice(0, 20);
    }

    /**
     * Store recommendation for tracking
     * @param {object} recommendation - Recommendation object
     * @param {string} type - 'meal' | 'whatif' | 'pattern'
     * @param {object} profile
     * @returns {string} - Recommendation ID
     */
    function storeRecommendation(recommendation, type, profile) {
        console.log('[MEALREC][FeedbackLoop] 💾 storeRecommendation called:', {
            type,
            profileId: profile?.id,
            hasRecommendation: !!recommendation
        });

        const recId = generateRecommendationId(type);
        const timestamp = new Date().toISOString();

        // v1.2.1: Extract product IDs from any format (flat, grouped, multi-meal)
        const productIds = extractProductIds(recommendation);

        const record = {
            id: recId,
            type,
            timestamp,
            clientId: profile?.id || 'unknown',
            recommendation: {
                scenario: recommendation?.scenario || 'UNKNOWN',
                productIds: productIds,
                score: recommendation?.score,
                mealType: recommendation?.mealType || recommendation?.meal_type
            },
            followed: null, // Will be updated later
            outcome: null,  // Will be updated later
            context: {
                date: new Date().toISOString().split('T')[0]
            }
        };

        saveRecommendationRecord(record, profile);
        console.log('[MEALREC][FeedbackLoop] ✅ Recommendation stored:', { recId, type });
        return recId;
    }

    /**
     * Mark recommendation as followed/ignored
     * @param {string} recId - Recommendation ID
     * @param {boolean} followed - True if user followed recommendation
     * @param {object} profile
     */
    function markRecommendationFollowed(recId, followed, profile) {
        const record = getRecommendationRecord(recId, profile);
        if (!record) {
            console.warn('[MEALREC][FeedbackLoop] Recommendation not found:', recId);
            return;
        }

        record.followed = followed;
        record.followedAt = new Date().toISOString();

        saveRecommendationRecord(record, profile);
        console.info(`[MEALREC][FeedbackLoop] Recommendation ${recId} marked as ${followed ? 'followed' : 'ignored'}`);
    }

    /**
     * Submit outcome feedback for recommendation
     * @param {string} recId - Recommendation ID
     * @param {object} outcome - User feedback { satiety: 1-5, energy: 1-5, mood: 1-5 }
     * @param {object} profile
     */
    function submitOutcomeFeedback(recId, outcome, profile) {
        const record = getRecommendationRecord(recId, profile);
        if (!record) {
            console.warn('[MEALREC][FeedbackLoop] Recommendation not found:', recId);
            return;
        }

        record.outcome = {
            ...outcome,
            submittedAt: new Date().toISOString()
        };

        saveRecommendationRecord(record, profile);
        console.info('[MEALREC][FeedbackLoop] Outcome feedback submitted for:', recId);

        // Trigger learning update (placeholder for ML integration)
        updateRecommendationWeights(record, profile);
    }

    /**
     * Get recommendation history
     * @param {object} profile
     * @param {number} limit - Max records to return
     * @returns {object[]} - Array of recommendation records
     */
    function getRecommendationHistory(profile, limit = 50) {
        const U = global.HEYS.dayUtils;
        if (!U) return [];

        const history = loadNormalizedHistory(profile);

        return history.slice(-limit);
    }

    /**
     * Analyze outcomes for pattern reinforcement
     * @param {object} profile
     * @param {number} daysBack - Analyze last N days
     * @returns {object} - Analysis result
     */
    function analyzeOutcomes(profile, daysBack = 7) {
        console.log('[MEALREC][FeedbackLoop] 📊 analyzeOutcomes called:', {
            profileId: profile?.id,
            daysBack
        });

        const history = getRecommendationHistory(profile, 100);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysBack);

        const recent = history.filter(rec =>
            rec.timestamp && new Date(rec.timestamp) >= cutoff
        );

        const followed = recent.filter(rec => rec.followed === true);
        const withOutcome = followed.filter(rec => rec.outcome);

        const analysis = {
            total: recent.length,
            followed: followed.length,
            followRate: recent.length > 0 ? (followed.length / recent.length) : 0,
            withFeedback: withOutcome.length,
            feedbackRate: followed.length > 0 ? (withOutcome.length / followed.length) : 0,
            avgSatiety: 0,
            avgEnergy: 0,
            avgMood: 0,
            positiveOutcomes: 0,
            recommendations: {}
        };

        // Calculate averages
        if (withOutcome.length > 0) {
            let totalSatiety = 0, totalEnergy = 0, totalMood = 0;

            withOutcome.forEach(rec => {
                totalSatiety += rec.outcome.satiety || 0;
                totalEnergy += rec.outcome.energy || 0;
                totalMood += rec.outcome.mood || 0;

                // Positive outcome: satiety >= 4, energy >= 4, mood >= 4
                if ((rec.outcome.satiety || 0) >= 4 &&
                    (rec.outcome.energy || 0) >= 4 &&
                    (rec.outcome.mood || 0) >= 4) {
                    analysis.positiveOutcomes++;
                }
            });

            analysis.avgSatiety = Math.round((totalSatiety / withOutcome.length) * 10) / 10;
            analysis.avgEnergy = Math.round((totalEnergy / withOutcome.length) * 10) / 10;
            analysis.avgMood = Math.round((totalMood / withOutcome.length) * 10) / 10;
        }

        console.log('[MEALREC][FeedbackLoop] ✅ Analysis complete:', {
            total: analysis.total,
            followed: analysis.followed,
            positiveOutcomes: analysis.positiveOutcomes,
            avgSatiety: analysis.avgSatiety
        });

        return analysis;
    }

    /**
     * Update recommendation weights based on outcomes
     * Uses exponential moving average to adjust product scoring weights
     * @private
     */
    function updateRecommendationWeights(record, profile) {
        const outcome = record.outcome;
        if (!outcome) {
            console.warn('[MEALREC][FeedbackLoop] ⚠️ No outcome data, skipping weight update');
            return;
        }

        // Handle quick feedback (👍/👎) vs full outcome (satiety/energy/mood)
        let isPositive;
        let avgScore;

        if (outcome.quickRating !== undefined) {
            // Quick feedback: 1 = positive (👍), -1 = negative (👎)
            isPositive = outcome.quickRating === 1;
            avgScore = isPositive ? 5 : 2; // Map to outcome scale for logging
        } else {
            // Full outcome: calculate average of 3 dimensions
            avgScore = (outcome.satiety + outcome.energy + outcome.mood) / 3;
            isPositive = avgScore >= 3.5;
        }

        console.info('[MEALREC][FeedbackLoop] 🧮 Processing outcome:', {
            type: outcome.quickRating !== undefined ? 'quick' : 'full',
            avgScore: avgScore.toFixed(2),
            isPositive,
            quickRating: outcome.quickRating,
            satiety: outcome.satiety,
            energy: outcome.energy,
            mood: outcome.mood
        });

        // Extract features from recommendation
        const recommendation = record.recommendation;
        if (!recommendation) {
            console.warn('[MEALREC][FeedbackLoop] ⚠️ No recommendation data in record');
            return;
        }

        const scenario = recommendation.scenario || 'UNKNOWN';
        // v1.2.1: Support trimmed (productIds), flat (suggestions), grouped, multi-meal
        var productIds = recommendation.productIds;
        if (!productIds || productIds.length === 0) {
            productIds = extractProductIds(recommendation);
        }

        if (productIds.length === 0) {
            console.warn('[MEALREC][FeedbackLoop] ⚠️ Cannot extract product IDs from recommendation');
            return;
        }

        console.info('[MEALREC][FeedbackLoop] 📦 Adjusting weights for:', {
            scenario,
            productCount: productIds.length,
            recId: record.id
        });

        // Load current weights
        const weights = loadProductWeights(profile);

        // Exponential moving average parameters
        const ALPHA = 0.1; // Learning rate (0.1 = slow, stable learning)
        const BOOST_FACTOR = 1.05; // +5% for positive outcomes
        const PENALTY_FACTOR = 0.95; // -5% for negative outcomes

        const adjustmentFactor = isPositive ? BOOST_FACTOR : PENALTY_FACTOR;
        let updatedCount = 0;

        // Update weights for each product in this scenario
        productIds.forEach(productId => {
            const key = `${scenario}_${productId}`;
            const currentWeight = weights[key] || 1.0;

            // EMA: new_weight = old_weight * (1 - α) + (old_weight * adjustment) * α
            const targetWeight = currentWeight * adjustmentFactor;
            const newWeight = currentWeight * (1 - ALPHA) + targetWeight * ALPHA;

            // Clamp weights to reasonable range [0.5, 2.0]
            const clampedWeight = Math.max(0.5, Math.min(2.0, newWeight));

            weights[key] = clampedWeight;
            updatedCount++;

            console.info(`[MEALREC][FeedbackLoop] 📊 ${key}: ${currentWeight.toFixed(3)} → ${clampedWeight.toFixed(3)}`);
        });

        // Save updated weights
        saveProductWeights(profile, weights);

        console.info('[MEALREC][FeedbackLoop] ✅ Weights updated:', {
            updatedCount,
            direction: isPositive ? 'boost (+5%)' : 'reduce (-5%)',
            scenario,
            recId: record.id
        });
    }

    /**
     * Load product weights from localStorage
     * @private
     * @returns {object} - Weight map: { "SCENARIO_productId": weight }
     */
    function loadProductWeights(profile) {
        const U = global.HEYS.dayUtils;
        if (!U) return {};

        const storageKey = `heys_meal_rec_weights_${profile?.id || 'default'}`;
        const weights = U.lsGet(storageKey) || {};

        return weights;
    }

    /**
     * Save product weights to localStorage
     * @private
     */
    function saveProductWeights(profile, weights) {
        const U = global.HEYS.dayUtils;
        if (!U) {
            console.warn('[MEALREC][FeedbackLoop] ⚠️ Cannot save weights: dayUtils unavailable');
            return;
        }

        const storageKey = `heys_meal_rec_weights_${profile?.id || 'default'}`;
        U.lsSet(storageKey, weights);

        console.info('[MEALREC][FeedbackLoop] 💾 Weights saved to localStorage:', storageKey);
    }

    /**
     * Get product weight for scoring (used by Product Picker)
     * @param {object} profile
     * @param {string} productId
     * @param {string} scenario
     * @returns {number} - Weight multiplier (default 1.0)
     */
    function getProductWeight(profile, productId, scenario) {
        const weights = loadProductWeights(profile);
        const key = `${scenario}_${productId}`;
        return weights[key] || 1.0;
    }

    /**
     * Get all weights for debugging
     * @param {object} profile
     * @returns {object} - All weights
     */
    function getAllWeights(profile) {
        return loadProductWeights(profile);
    }

    /**
     * Reset weights to default (1.0 for all)
     * @param {object} profile
     */
    function resetWeights(profile) {
        const U = global.HEYS.dayUtils;
        if (!U) return;

        const storageKey = `heys_meal_rec_weights_${profile?.id || 'default'}`;
        U.lsSet(storageKey, {});

        console.info('[MEALREC][FeedbackLoop] 🔄 Weights reset to default');
    }

    /**
     * Generate unique recommendation ID
     * @private
     */
    function generateRecommendationId(type) {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `rec_${type}_${timestamp}_${random}`;
    }

    /**
     * Get storage key for profile
     * @private
     */
    function getStorageKey(profile) {
        const clientId = profile?.id || 'default';
        return `${STORAGE_KEY_PREFIX}${clientId}`;
    }

    function sanitizeOutcome(outcome) {
        if (!outcome || typeof outcome !== 'object') return null;
        return {
            satiety: outcome.satiety ?? null,
            energy: outcome.energy ?? null,
            mood: outcome.mood ?? null,
            quickRating: outcome.quickRating ?? null,
            submittedAt: outcome.submittedAt || null
        };
    }

    function sanitizeReminders(reminders) {
        if (!reminders || typeof reminders !== 'object') return null;
        var compact = {};
        Object.keys(reminders).slice(0, 5).forEach(function (key) {
            compact[key] = {
                shown: !!reminders[key]?.shown,
                shownAt: reminders[key]?.shownAt || null
            };
        });
        return compact;
    }

    function sanitizeRecommendationRecord(record) {
        if (!record || typeof record !== 'object') {
            return {
                id: generateRecommendationId('unknown'),
                type: 'unknown',
                timestamp: new Date().toISOString(),
                clientId: 'unknown',
                recommendation: { scenario: 'UNKNOWN', productIds: [] },
                followed: null,
                followedAt: null,
                outcome: null,
                context: { date: new Date().toISOString().split('T')[0] },
                reminders: null
            };
        }

        var recommendation = record.recommendation || {};
        var productIds = Array.isArray(recommendation.productIds) && recommendation.productIds.length > 0
            ? recommendation.productIds
            : extractProductIds(recommendation);

        return {
            id: record.id || generateRecommendationId(record.type || 'unknown'),
            type: record.type || 'unknown',
            timestamp: record.timestamp || new Date().toISOString(),
            clientId: record.clientId || 'unknown',
            recommendation: {
                scenario: recommendation.scenario || 'UNKNOWN',
                productIds: productIds.slice(0, 20),
                score: recommendation.score,
                mealType: recommendation.mealType || recommendation.meal_type || null
            },
            followed: record.followed == null ? null : !!record.followed,
            followedAt: record.followedAt || null,
            outcome: sanitizeOutcome(record.outcome),
            context: {
                date: record?.context?.date || (record.timestamp ? String(record.timestamp).split('T')[0] : new Date().toISOString().split('T')[0])
            },
            reminders: sanitizeReminders(record.reminders)
        };
    }

    function normalizeRecommendationHistory(history) {
        if (!Array.isArray(history)) return [];

        var normalized = history
            .map(function (record) { return sanitizeRecommendationRecord(record); })
            .filter(Boolean);

        if (normalized.length > MAX_HISTORY) {
            normalized = normalized.slice(-MAX_HISTORY);
        }

        return normalized;
    }

    function pruneHistoryToStorageBudget(history, storageKey) {
        var normalized = normalizeRecommendationHistory(history);
        var serialized = JSON.stringify(normalized);

        while (normalized.length > 1 && serialized.length > MAX_STORAGE_KB * 1024) {
            var nextLength = normalized.length > 10
                ? Math.max(10, Math.ceil(normalized.length * 0.7))
                : normalized.length - 1;
            var pruneCount = Math.max(1, normalized.length - nextLength);
            normalized = normalized.slice(pruneCount);
            serialized = JSON.stringify(normalized);
            console.warn('[HEYS.insights.feedbackLoop] ⚠️ Pruned ' + pruneCount + ' old records for ' + storageKey + ' (' + Math.round(serialized.length / 1024) + 'KB)');
        }

        return normalized;
    }

    function loadNormalizedHistory(profile) {
        const U = global.HEYS.dayUtils;
        if (!U) return [];

        const storageKey = getStorageKey(profile);
        const rawHistory = U.lsGet(storageKey) || [];
        let history = trimLegacyRecords(normalizeRecommendationHistory(rawHistory));
        history = pruneHistoryToStorageBudget(history, storageKey);

        try {
            const rawSerialized = JSON.stringify(Array.isArray(rawHistory) ? rawHistory : []);
            const normalizedSerialized = JSON.stringify(history);
            if (rawSerialized !== normalizedSerialized) {
                U.lsSet(storageKey, history);
            }
        } catch (e) { }

        return history;
    }

    /**
     * v1.2: Trim legacy records that stored full recommendation objects.
     * Converts them to trimmed format (scenario + productIds only).
     * @private
     */
    function trimLegacyRecords(history) {
        var trimmed = false;
        for (var i = 0; i < history.length; i++) {
            var rec = sanitizeRecommendationRecord(history[i]);
            history[i] = rec;
            if (!rec.recommendation) continue;
            var r = rec.recommendation;
            // Detect legacy format: has full product objects in suggestions/groups/mealPlan
            var hasLegacySug = Array.isArray(r.suggestions) && r.suggestions.length > 0 && typeof r.suggestions[0] === 'object' && r.suggestions[0] !== null;
            var hasLegacyGroups = Array.isArray(r.groups) && r.groups.length > 0;
            var hasLegacyMealPlan = Array.isArray(r.mealPlan || r.meals);
            var hasLegacyProducts = Array.isArray(r.products) && r.products.length > 0 && typeof r.products[0] === 'object' && r.products[0] !== null;
            if (hasLegacySug || hasLegacyGroups || hasLegacyMealPlan || hasLegacyProducts) {
                var productIds = extractProductIds(r);
                rec.recommendation = {
                    scenario: r.scenario || 'UNKNOWN',
                    productIds: productIds,
                    score: r.score,
                    mealType: r.mealType || r.meal_type
                };
                trimmed = true;
            }
        }
        if (trimmed) {
            console.info('[MEALREC][FeedbackLoop] ✅ Migrated legacy records to trimmed format');
        }
        return history;
    }

    /**
     * Save recommendation record to localStorage
     * @private
     */
    function saveRecommendationRecord(record, profile) {
        const U = global.HEYS.dayUtils;
        if (!U) {
            console.warn('[MEALREC][FeedbackLoop] HEYS.dayUtils not available');
            return;
        }

        const storageKey = getStorageKey(profile);
        var history = loadNormalizedHistory(profile);
        var safeRecord = sanitizeRecommendationRecord(record);

        // Update existing record or add new
        const existingIndex = history.findIndex(r => r.id === safeRecord.id);
        if (existingIndex >= 0) {
            history[existingIndex] = safeRecord;
        } else {
            history.push(safeRecord);
        }

        history = pruneHistoryToStorageBudget(history, storageKey);

        U.lsSet(storageKey, history);
    }

    /**
     * Get recommendation record from localStorage
     * @private
     */
    function getRecommendationRecord(recId, profile) {
        const U = global.HEYS.dayUtils;
        if (!U) return null;

        const history = loadNormalizedHistory(profile);

        return history.find(r => r.id === recId);
    }

    /**
     * Mark reminder as shown (prevent duplicate prompts)
     * @param {string} recId - Recommendation ID
     * @param {number} daysThreshold - Days since recommendation (3, 7, or 14)
     * @param {object} profile
     */
    function markReminderShown(recId, daysThreshold, profile) {
        const record = getRecommendationRecord(recId, profile);
        if (!record) {
            console.warn('[MEALREC][FeedbackLoop] Recommendation not found:', recId);
            return;
        }

        if (!record.reminders) {
            record.reminders = {};
        }

        record.reminders[`day${daysThreshold}`] = {
            shown: true,
            shownAt: new Date().toISOString()
        };

        saveRecommendationRecord(record, profile);
        console.info(`[MEALREC][FeedbackLoop] ✅ Reminder marked as shown:`, { recId, days: daysThreshold });
    }

    /**
     * Get recommendation history (public wrapper)
     * @param {object} profile
     * @returns {object[]} - Array of recommendation records
     */
    function getRecommendationHistoryPublic(profile) {
        return getRecommendationHistory(profile);
    }

    // Export API
    HEYS.InsightsPI.feedbackLoop = {
        storeRecommendation,
        markFollowed: markRecommendationFollowed,
        submitFeedback: submitOutcomeFeedback,
        getHistory: getRecommendationHistory,
        getRecommendationHistory: getRecommendationHistoryPublic,
        analyzeOutcomes,
        markReminderShown,
        // ML Weight API (for Product Picker integration)
        getProductWeight,
        getAllWeights,
        resetWeights
    };

    console.info('[MEALREC][HEYS.InsightsPI.feedbackLoop] ✅ Feedback Loop v1.2.1 initialized (trimmed storage + size guard)');

})(typeof window !== 'undefined' ? window : global);
