/**
 * HEYS Predictive Insights — Feedback Loop v1.1
 * 
 * Outcome learning: collect user feedback on recommendations and patterns.
 * ML weight adjustment via exponential moving average (EMA).
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

        const record = {
            id: recId,
            type,
            timestamp,
            clientId: profile?.id || 'unknown',
            recommendation,
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

        const storageKey = getStorageKey(profile);
        const history = U.lsGet(storageKey) || [];

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
        const suggestions = recommendation.suggestions || [];

        if (suggestions.length === 0) {
            console.warn('[MEALREC][FeedbackLoop] ⚠️ No products in recommendation');
            return;
        }

        // Get product IDs from suggestions
        const productIds = suggestions
            .map(s => s.id || s.product_id || s.productId)
            .filter(Boolean);

        if (productIds.length === 0) {
            console.warn('[MEALREC][FeedbackLoop] ⚠️ Cannot extract product IDs from suggestions');
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
        const history = U.lsGet(storageKey) || [];

        // Update existing record or add new
        const existingIndex = history.findIndex(r => r.id === record.id);
        if (existingIndex >= 0) {
            history[existingIndex] = record;
        } else {
            history.push(record);
        }

        // Keep last 100 recommendations
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }

        U.lsSet(storageKey, history);
    }

    /**
     * Get recommendation record from localStorage
     * @private
     */
    function getRecommendationRecord(recId, profile) {
        const U = global.HEYS.dayUtils;
        if (!U) return null;

        const storageKey = getStorageKey(profile);
        const history = U.lsGet(storageKey) || [];

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

    console.info('[MEALREC][HEYS.InsightsPI.feedbackLoop] ✅ Feedback Loop v1.1 initialized (client-side + ML weights)');

})(typeof window !== 'undefined' ? window : global);
