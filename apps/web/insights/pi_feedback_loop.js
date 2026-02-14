/**
 * HEYS Predictive Insights — Feedback Loop v1.0
 * 
 * Outcome learning: collect user feedback on recommendations and patterns.
 * 
 * Flow:
 * 1. Recommendation given → store with ID
 * 2. User follows/ignores → track
 * 3. User provides outcome feedback (satiety, energy, mood)
 * 4. 3-day/7-day outcome analysis → reinforcement learning
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
        console.log('[FeedbackLoop] 💾 storeRecommendation called:', {
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
        console.log('[FeedbackLoop] ✅ Recommendation stored:', { recId, type });
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
            console.warn('[FeedbackLoop] Recommendation not found:', recId);
            return;
        }

        record.followed = followed;
        record.followedAt = new Date().toISOString();

        saveRecommendationRecord(record, profile);
        console.info(`[FeedbackLoop] Recommendation ${recId} marked as ${followed ? 'followed' : 'ignored'}`);
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
            console.warn('[FeedbackLoop] Recommendation not found:', recId);
            return;
        }

        record.outcome = {
            ...outcome,
            submittedAt: new Date().toISOString()
        };

        saveRecommendationRecord(record, profile);
        console.info('[FeedbackLoop] Outcome feedback submitted for:', recId);

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
        console.log('[FeedbackLoop] 📊 analyzeOutcomes called:', {
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

        console.log('[FeedbackLoop] ✅ Analysis complete:', {
            total: analysis.total,
            followed: analysis.followed,
            positiveOutcomes: analysis.positiveOutcomes,
            avgSatiety: analysis.avgSatiety
        });

        return analysis;
    }

    /**
     * Update recommendation weights based on outcomes (placeholder for ML)
     * @private
     */
    function updateRecommendationWeights(record, profile) {
        // Placeholder for incremental learning
        // In production: send to backend for ML model update

        const outcome = record.outcome;
        if (!outcome) return;

        // Simple heuristic: boost similar recommendations if outcome is positive
        if (outcome.satiety >= 4 && outcome.energy >= 4 && outcome.mood >= 4) {
            console.info('[FeedbackLoop] Positive outcome detected, boosting similar recommendations');
            // TODO: Implement feature extraction and weight update
        } else {
            console.info('[FeedbackLoop] Negative outcome detected, reducing weight for similar recommendations');
        }

        // TODO: Backend integration
        // await HEYS.YandexAPI.rpc('update_recommendation_weights', {
        //   client_id: profile.id,
        //   rec_id: record.id,
        //   outcome: record.outcome
        // });
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
            console.warn('[FeedbackLoop] HEYS.dayUtils not available');
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

    // Export API
    HEYS.InsightsPI.feedbackLoop = {
        storeRecommendation,
        markFollowed: markRecommendationFollowed,
        submitFeedback: submitOutcomeFeedback,
        getHistory: getRecommendationHistory,
        analyzeOutcomes
    };

    console.info('[HEYS.InsightsPI.feedbackLoop] ✅ Feedback Loop v1.0 initialized (client-side)');

})(typeof window !== 'undefined' ? window : global);
