/**
 * HEYS Predictive Insights — Phenotype Classifier & Multipliers v1.0
 * 
 * Классификация метаболических, циркадных и поведенческих фенотипов
 * для персонализации adaptive thresholds.
 * 
 * Dependencies: pi_stats.js, pi_patterns.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    /**
     * Phenotype taxonomy
     */
    const PHENOTYPES = {
        metabolic: ['insulin_sensitive', 'insulin_resistant', 'metabolic_syndrome_risk', 'neutral'],
        circadian: ['morning_type', 'evening_type', 'flexible'],
        satiety: ['high_satiety', 'low_satiety', 'volume_eater', 'normal'],
        stress: ['stress_eater', 'stress_anorexic', 'neutral']
    };

    /**
     * Threshold multipliers by phenotype
     * Base multiplier = 1.0 (neutral)
     */
    const PHENOTYPE_MULTIPLIERS = {
        // Late eating hour (default = 21:00)
        lateEatingHour: {
            insulin_resistant: 0.85,    // Should eat earlier (21:00 → 17:50)
            metabolic_syndrome_risk: 0.8, // Even earlier (21:00 → 16:48)
            evening_type: 1.1,          // Can eat later (21:00 → 23:06)
            morning_type: 0.95,         // Prefer earlier (21:00 → 19:57)
            neutral: 1.0
        },

        // Protein per meal (default = 25g)
        proteinPerMealG: {
            low_satiety: 1.2,           // Need more protein (25g → 30g)
            high_satiety: 0.9,          // Can manage with less (25g → 22.5g)
            volume_eater: 0.95,         // Rely on volume, less on protein
            insulin_resistant: 1.15,    // More protein for insulin sensitivity
            neutral: 1.0
        },

        // Daily protein target (g/kg body weight)
        proteinTarget: {
            low_satiety: 1.2,           // Need more protein for satiety
            high_satiety: 0.9,          // Lower needs
            insulin_resistant: 1.15,    // Higher protein ratio
            metabolic_syndrome_risk: 1.1, // Preserve muscle mass
            neutral: 1.0
        },

        // Meal frequency (default = 3-4 meals/day)
        mealFrequency: {
            low_satiety: 1.2,           // More frequent meals OK (4 → 4.8)
            high_satiety: 0.85,         // Fewer meals OK (4 → 3.4)
            insulin_resistant: 0.9,     // Fewer, bigger meals (4 → 3.6)
            neutral: 1.0
        },

        // Training proximity to meals (default = 2h)
        trainingProximityHours: {
            insulin_sensitive: 1.2,     // Can train closer to meals (2h → 2.4h)
            insulin_resistant: 0.85,    // Should separate more (2h → 1.7h)
            neutral: 1.0
        },

        // Carb per meal (default varies by profile)
        carbPerMealG: {
            insulin_sensitive: 1.15,    // Can handle more carbs
            insulin_resistant: 0.85,    // Should reduce carbs
            metabolic_syndrome_risk: 0.75, // Significant reduction
            neutral: 1.0
        },

        // Sleep variability tolerance (default = 1h)
        sleepVariabilityHours: {
            morning_type: 0.85,         // Less tolerance (1h → 0.85h)
            evening_type: 1.15,         // More flexible (1h → 1.15h)
            flexible: 1.2,              // Very flexible (1h → 1.2h)
            neutral: 1.0
        },

        // Stress-eating sensitivity (default threshold)
        stressEatingThreshold: {
            stress_eater: 1.3,          // More sensitive detection
            stress_anorexic: 0.8,       // Less sensitive
            neutral: 1.0
        },

        // NEW v5.0: EWS Specific Thresholds

        // Sodium limit (default = 2300-2500 mg)
        sodiumLimit: {
            insulin_resistant: 0.8,     // Stricter limit for BP/water retention
            metabolic_syndrome_risk: 0.7, // Very strict
            high_satiety: 1.1,          // Can tolerate slightly more
            neutral: 1.0
        },

        // Sugar limit (default = 25-30g added sugar)
        sugarLimit: {
            insulin_resistant: 0.5,     // Very strict reduction needed
            metabolic_syndrome_risk: 0.4, // Minimal sugar
            stress_eater: 0.6,          // Trigger food reduction
            neutral: 1.0
        },

        // Fiber target (default = 25-30g)
        fiberTarget: {
            insulin_resistant: 1.2,     // Need more for blood sugar control
            low_satiety: 1.3,           // Maximize volume/satiety
            // gut_health_risk: 1.25,   // TODO: add gut_health_risk to PHENOTYPES taxonomy first
            neutral: 1.0
        },

        // Fasting window hours (eating window duration)
        mealTimeWindow: {
            insulin_resistant: 0.9,     // Shorter eating window better (TRF)
            evening_type: 1.1,          // Shifted window
            stress_anorexic: 1.2,       // Longer window to ensure intake
            neutral: 1.0
        },

        // Binge volume threshold (kcal in one sitting)
        bingeVolume: {
            volume_eater: 1.2,          // Higher threshold (adaptation)
            stress_eater: 0.8,          // Lower threshold (early warning)
            low_satiety: 0.9,           // Lower threshold
            neutral: 1.0
        },

        // Meal skip tolerance (hours between meals)
        mealSkipTolerance: {
            stress_anorexic: 0.7,       // Alert earlier on skips
            low_satiety: 0.8,           // Needs frequent meals
            morning_type: 0.9,          // Early energy needs
            neutral: 1.0
        }
    };

    /**
     * Apply phenotype multipliers to base thresholds
     * @param {object} baseThresholds - Base adaptive thresholds
     * @param {object} phenotype - User phenotype profile
     * @returns {object} - Adjusted thresholds
     */
    function applyPhenotypeMultipliers(baseThresholds, phenotype) {
        console.log('[Phenotype] 🧬 applyPhenotypeMultipliers called:', {
            phenotype,
            baseThresholdsCount: Object.keys(baseThresholds || {}).length
        });

        if (!phenotype || typeof phenotype !== 'object') {
            console.warn('[Phenotype] ⚠️ No phenotype provided, returning base thresholds');
            return baseThresholds;
        }

        const adjusted = { ...baseThresholds };

        // Apply multipliers for each threshold
        for (const [thresholdKey, multiplierMap] of Object.entries(PHENOTYPE_MULTIPLIERS)) {
            if (!adjusted[thresholdKey]) continue;

            let multiplier = 1.0;

            // Check all phenotype categories (metabolic, circadian, satiety, stress)
            for (const category of Object.keys(PHENOTYPES)) {
                const userPhenotype = phenotype[category];
                if (userPhenotype && multiplierMap[userPhenotype]) {
                    multiplier *= multiplierMap[userPhenotype];
                }
            }

            // Apply multiplier to base threshold
            if (typeof adjusted[thresholdKey] === 'number') {
                adjusted[thresholdKey] = Math.round(adjusted[thresholdKey] * multiplier * 10) / 10;
            }
        }

        const changedKeys = Object.keys(adjusted).filter(k => adjusted[k] !== baseThresholds[k]);
        console.log('[Phenotype] ✅ Applied multipliers:', {
            totalThresholds: Object.keys(adjusted).length,
            changed: changedKeys.length,
            changedKeys
        });

        return adjusted;
    }

    /**
     * Auto-detect phenotype from 30-day behavior patterns
     * @param {object[]} days - 30+ days of data
     * @param {object} profile
     * @param {object} pIndex
     * @returns {object|null} - Detected phenotype or null if insufficient data
     */
    function autoDetectPhenotype(days, profile, pIndex) {
        if (days.length < 30) {
            return null; // Need at least 30 days
        }

        const phenotype = {
            metabolic: 'neutral',
            circadian: 'flexible',
            satiety: 'normal',
            stress: 'neutral',
            confidence: {}
        };

        // 1. Metabolic phenotype (insulin sensitivity proxy)
        const metabolicSignals = detectMetabolicPhenotype(days, profile, pIndex);
        phenotype.metabolic = metabolicSignals.type;
        phenotype.confidence.metabolic = metabolicSignals.confidence;

        // 2. Circadian phenotype (meal timing patterns)
        const circadianSignals = detectCircadianPhenotype(days);
        phenotype.circadian = circadianSignals.type;
        phenotype.confidence.circadian = circadianSignals.confidence;

        // 3. Satiety phenotype (meal frequency & volume)
        const satietySignals = detectSatietyPhenotype(days, profile, pIndex);
        phenotype.satiety = satietySignals.type;
        phenotype.confidence.satiety = satietySignals.confidence;

        // 4. Stress phenotype (psychological eating patterns)
        const stressSignals = detectStressPhenotype(days, profile, pIndex);
        phenotype.stress = stressSignals.type;
        phenotype.confidence.stress = stressSignals.confidence;

        return phenotype;
    }

    /**
     * Detect metabolic phenotype (insulin sensitivity proxy)
     * Signals: carb tolerance, post-meal energy, weight stability
     * @private
     */
    function detectMetabolicPhenotype(days, profile, pIndex) {
        // Simplified detection logic (placeholder for full implementation)
        const weightChange = getWeightTrend(days);
        const carbIntake = getAvgCarbIntake(days, pIndex);
        const energyLevels = getAvgEnergyLevels(days);

        let type = 'neutral';
        let confidence = 0.5;

        // High carb + weight gain + low energy = insulin_resistant
        if (carbIntake > 200 && weightChange > 0.5 && energyLevels < 60) {
            type = 'insulin_resistant';
            confidence = 0.7;
        }
        // Moderate/high carb + stable weight + good energy = insulin_sensitive
        else if (carbIntake > 150 && Math.abs(weightChange) < 0.3 && energyLevels > 70) {
            type = 'insulin_sensitive';
            confidence = 0.75;
        }

        return { type, confidence };
    }

    /**
     * Detect circadian phenotype (meal timing preferences)
     * Signals: first meal time, last meal time, consistency
     * @private
     */
    function detectCircadianPhenotype(days) {
        const firstMealTimes = [];
        const lastMealTimes = [];

        days.forEach(day => {
            if (!day.meals || day.meals.length === 0) return;

            const firstMeal = day.meals[0];
            const lastMeal = day.meals[day.meals.length - 1];

            if (firstMeal?.time) firstMealTimes.push(parseTime(firstMeal.time));
            if (lastMeal?.time) lastMealTimes.push(parseTime(lastMeal.time));
        });

        if (firstMealTimes.length < 15) {
            return { type: 'flexible', confidence: 0.3 };
        }

        const avgFirstMeal = average(firstMealTimes);
        const avgLastMeal = average(lastMealTimes);

        let type = 'flexible';
        let confidence = 0.6;

        // Early first meal (<8:00) + early last meal (<20:00) = morning_type
        if (avgFirstMeal < 8 && avgLastMeal < 20) {
            type = 'morning_type';
            confidence = 0.75;
        }
        // Late first meal (>10:00) + late last meal (>21:00) = evening_type
        else if (avgFirstMeal > 10 && avgLastMeal > 21) {
            type = 'evening_type';
            confidence = 0.75;
        }

        return { type, confidence };
    }

    /**
     * Detect satiety phenotype (meal frequency & volume)
     * Signals: meal frequency, portion sizes, snacking
     * @private
     */
    function detectSatietyPhenotype(days, profile, pIndex) {
        const avgMealFrequency = getAvgMealFrequency(days);
        const avgPortionSize = getAvgPortionSize(days, pIndex);

        let type = 'normal';
        let confidence = 0.6;

        // Many small meals = low_satiety
        if (avgMealFrequency > 5 && avgPortionSize < 400) {
            type = 'low_satiety';
            confidence = 0.7;
        }
        // Few large meals = high_satiety
        else if (avgMealFrequency < 3 && avgPortionSize > 600) {
            type = 'high_satiety';
            confidence = 0.7;
        }
        // High volume, normal frequency = volume_eater
        else if (avgMealFrequency >= 3 && avgMealFrequency <= 4 && avgPortionSize > 500) {
            type = 'volume_eater';
            confidence = 0.65;
        }

        return { type, confidence };
    }

    /**
     * Detect stress phenotype (psychological eating patterns)
     * Signals: stress-eating correlation, mood-food patterns
     * @private
     */
    function detectStressPhenotype(days, profile, pIndex) {
        // Check if stress_eating pattern exists and is significant
        const patterns = HEYS.InsightsPI?.patterns;
        if (!patterns) {
            return { type: 'neutral', confidence: 0.3 };
        }

        try {
            const stressEating = patterns.psychology?.analyzeStressEating?.(days, profile, pIndex);
            const moodFood = patterns.psychology?.analyzeMoodFood?.(days, profile, pIndex);

            let type = 'neutral';
            let confidence = 0.5;

            if (stressEating?.correlation && Math.abs(stressEating.correlation) > 0.3) {
                type = stressEating.correlation > 0 ? 'stress_eater' : 'stress_anorexic';
                confidence = Math.min(0.85, Math.abs(stressEating.correlation));
            } else if (moodFood?.correlation && Math.abs(moodFood.correlation) > 0.3) {
                type = moodFood.correlation > 0 ? 'stress_eater' : 'stress_anorexic';
                confidence = Math.min(0.8, Math.abs(moodFood.correlation));
            }

            return { type, confidence };
        } catch (e) {
            console.warn('[Phenotype] Stress detection failed:', e.message);
            return { type: 'neutral', confidence: 0.3 };
        }
    }

    // Helper functions
    function getWeightTrend(days) {
        const weights = days.map(d => d.weight).filter(w => w > 0);
        if (weights.length < 10) return 0;
        return weights[weights.length - 1] - weights[0];
    }

    function getAvgCarbIntake(days, pIndex) {
        const carbs = days.map(d => d.dayTot?.carb || 0).filter(c => c > 0);
        return average(carbs);
    }

    function getAvgEnergyLevels(days) {
        const energy = days.map(d => d.wellbeing?.energy || 0).filter(e => e > 0);
        return average(energy);
    }

    function getAvgMealFrequency(days) {
        const frequencies = days.map(d => d.meals?.length || 0).filter(f => f > 0);
        return average(frequencies);
    }

    function getAvgPortionSize(days, pIndex) {
        const calculateItemKcal = HEYS.InsightsPI?.calculations?.calculateItemKcal;
        if (!calculateItemKcal) return 400;

        const portions = [];
        days.forEach(day => {
            if (!day.meals) return;
            day.meals.forEach(meal => {
                if (!meal.items) return;
                const mealKcal = meal.items.reduce((sum, item) =>
                    sum + calculateItemKcal(item, pIndex), 0);
                if (mealKcal > 0) portions.push(mealKcal);
            });
        });

        return average(portions);
    }

    function parseTime(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours + (minutes || 0) / 60;
    }

    function average(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }

    // Export API
    HEYS.InsightsPI.phenotype = {
        PHENOTYPES,
        PHENOTYPE_MULTIPLIERS,
        applyMultipliers: applyPhenotypeMultipliers,
        autoDetect: autoDetectPhenotype
    };

    console.info('[HEYS.InsightsPI.phenotype] ✅ Phenotype Classifier v1.0 initialized');

})(typeof window !== 'undefined' ? window : global);
