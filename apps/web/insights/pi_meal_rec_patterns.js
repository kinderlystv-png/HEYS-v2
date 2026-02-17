/**
 * HEYS Predictive Insights — Meal Recommender × Deep Patterns Integration v1.0
 * 
 * Интеграция 41 pattern score, insulin wave predictions, phenotype adjustments
 * для повышения точности meal recommendations.
 * 
 * Part of R2.6 Deep Insights Integration release.
 * 
 * Dependencies: pi_patterns.js, pi_phenotype.js, pi_stats.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    // Unified logging filter for console filtering (supports quick filters: "mealrec" and "dynamic")
    const LOG_FILTER = 'MEALREC|dynamic';

    // Critical patterns that affect meal recommendations
    const CRITICAL_PATTERNS = {
        C09_PROTEIN_SATIETY: 'protein_satiety',
        C11_STRESS_EATING: 'stress_eating',
        C13_CIRCADIAN: 'circadian_timing',
        C30_TRAINING_RECOVERY: 'training_recovery',
        C01_MEAL_TIMING: 'meal_timing',
        C02_WAVE_OVERLAP: 'wave_overlap',
        C15_INSULIN_SENSITIVITY: 'insulin_sensitivity',
        C34_GLYCEMIC_LOAD: 'glycemic_load',
        C35_PROTEIN_DISTRIBUTION: 'protein_distribution',
        C37_ADDED_SUGAR_DEPENDENCY: 'added_sugar_dependency'
    };

    /**
     * Normalize pattern score to 0..1 regardless of source scale (0..1 or 0..100)
     * @param {number} score
     * @returns {number}
     */
    function normalizeScore(score) {
        const s = Number(score);
        if (!Number.isFinite(s)) return 0.5;
        if (s > 1) return Math.max(0, Math.min(1, s / 100));
        return Math.max(0, Math.min(1, s));
    }

    /**
     * Get current pattern scores for meal-relevant patterns
     * @param {object[]} days - Recent days (7-14d recommended)
     * @param {object} profile - User profile
     * @param {object} pIndex - Product index
     * @returns {object|null} - Pattern scores or null if unavailable
     */
    function getCurrentPatternScores(days, profile, pIndex) {
        if (!days || days.length < 7) {
            console.warn(`[${LOG_FILTER}] ⚠️ Insufficient data for pattern scores (<7 days)`);
            return null;
        }

        const patterns = HEYS.InsightsPI?.patterns;
        if (!patterns) {
            console.warn(`[${LOG_FILTER}] ⚠️ PI Patterns module not loaded`);
            return null;
        }

        const scores = {};

        // C09: Protein Satiety (влияет на PROTEIN_DEFICIT сценарий)
        try {
            const proteinSatiety = patterns.analyzeProteinSatiety?.(days, pIndex, profile);
            if (proteinSatiety?.available) {
                scores.proteinSatiety = {
                    score: normalizeScore(proteinSatiety.score),
                    scoreRaw: Number(proteinSatiety.score) || 0,
                    confidence: proteinSatiety.confidence || 0.7,
                    avgProtein: proteinSatiety.avgProteinG,
                    satietyScore: proteinSatiety.satietyScore
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get protein_satiety:`, err.message);
        }

        // C11: Stress Eating (влияет на STRESS_EATING сценарий)
        try {
            const stressEating = patterns.analyzeStressEating?.(days, pIndex, profile);
            if (stressEating?.available) {
                scores.stressEating = {
                    score: normalizeScore(stressEating.score),
                    scoreRaw: Number(stressEating.score) || 0,
                    confidence: stressEating.confidence || 0.7,
                    correlation: stressEating.correlation,
                    stressDays: stressEating.stressDays
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get stress_eating:`, err.message);
        }

        // C13: Circadian Timing (влияет на LATE_EVENING threshold)
        try {
            const circadian = patterns.analyzeCircadianTiming?.(days, pIndex, profile);
            if (circadian?.available) {
                scores.circadian = {
                    score: normalizeScore(circadian.score),
                    scoreRaw: Number(circadian.score) || 0,
                    confidence: circadian.confidence || 0.7,
                    earlyDistribution: circadian.earlyDistribution,
                    peakHour: circadian.peakHour
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get circadian_timing:`, err.message);
        }

        // C30: Training Recovery (влияет на PRE/POST_WORKOUT macros)
        try {
            const recovery = patterns.analyzeTrainingRecovery?.(days, pIndex, profile);
            if (recovery?.available) {
                scores.trainingRecovery = {
                    score: normalizeScore(recovery.score),
                    scoreRaw: Number(recovery.score) || 0,
                    confidence: recovery.confidence || 0.7,
                    recoveryRate: recovery.recoveryRate
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get training_recovery:`, err.message);
        }

        // C01: Meal Timing (влияет на timing window)
        try {
            const mealTiming = patterns.analyzeMealTiming?.(days, profile, pIndex);
            if (mealTiming?.available) {
                scores.mealTiming = {
                    score: normalizeScore(mealTiming.score),
                    scoreRaw: Number(mealTiming.score) || 0,
                    confidence: mealTiming.confidence || 0.7,
                    avgGapMinutes: mealTiming.avgGapMinutes,
                    idealGapMinutes: mealTiming.idealGapMinutes,
                    overlapCount: mealTiming.overlapCount || 0
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get meal_timing:`, err.message);
        }

        // C02: Wave Overlap (влияет на timing + GI moderation)
        try {
            const waveOverlap = patterns.analyzeWaveOverlap?.(days, profile);
            if (waveOverlap?.available) {
                scores.waveOverlap = {
                    score: normalizeScore(waveOverlap.score),
                    scoreRaw: Number(waveOverlap.score) || 0,
                    confidence: waveOverlap.confidence || 0.7,
                    overlapCount: waveOverlap.overlapCount || 0,
                    avgOverlapPct: waveOverlap.avgOverlapPct || 0,
                    hasOverlaps: !!waveOverlap.hasOverlaps
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get wave_overlap:`, err.message);
        }

        // C15: Insulin Sensitivity (влияет на carb ratios)
        try {
            const insulinSensitivity = patterns.analyzeInsulinSensitivity?.(days, pIndex, profile);
            if (insulinSensitivity?.available) {
                scores.insulinSensitivity = {
                    score: normalizeScore(insulinSensitivity.score),
                    scoreRaw: Number(insulinSensitivity.score) || 0,
                    confidence: insulinSensitivity.confidence || 0.7,
                    avgGI: insulinSensitivity.avgGI,
                    avgFiberPer1000: insulinSensitivity.avgFiberPer1000
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get insulin_sensitivity:`, err.message);
        }

        // C34: Glycemic Load (влияет на idealGI)
        try {
            const glycemicLoad = patterns.analyzeGlycemicLoad?.(days, pIndex);
            if (glycemicLoad?.available) {
                scores.glycemicLoad = {
                    score: normalizeScore(glycemicLoad.score),
                    scoreRaw: Number(glycemicLoad.score) || 0,
                    confidence: glycemicLoad.confidence || 0.7,
                    avgDailyGL: glycemicLoad.avgDailyGL,
                    avgEveningRatio: glycemicLoad.avgEveningRatio,
                    dailyClass: glycemicLoad.dailyClass
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get glycemic_load:`, err.message);
        }

        // C35: Protein Distribution (влияет на protein target)
        try {
            const proteinDistribution = patterns.analyzeProteinDistribution?.(days, profile, pIndex);
            if (proteinDistribution?.available) {
                scores.proteinDistribution = {
                    score: normalizeScore(proteinDistribution.score),
                    scoreRaw: Number(proteinDistribution.score) || 0,
                    confidence: proteinDistribution.confidence || 0.7,
                    distributionScore: proteinDistribution.distributionScore,
                    subthresholdMeals: proteinDistribution.subthresholdMeals,
                    excessMeals: proteinDistribution.excessMeals
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get protein_distribution:`, err.message);
        }

        // C37: Added Sugar Dependency (влияет на product penalties)
        try {
            const sugarDependency = patterns.analyzeAddedSugarDependency?.(days, pIndex);
            if (sugarDependency?.available) {
                scores.addedSugarDependency = {
                    score: normalizeScore(sugarDependency.score),
                    scoreRaw: Number(sugarDependency.score) || 0,
                    confidence: sugarDependency.confidence || 0.7,
                    avgDailySugar: sugarDependency.avgDailySugar,
                    maxStreak: sugarDependency.maxStreak,
                    dependencyRisk: !!sugarDependency.dependencyRisk
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get added_sugar_dependency:`, err.message);
        }

        // === PHASE B: CONTEXT MODIFIERS (4 patterns) ===

        // C06: Sleep → Hunger (влияет на POOR_SLEEP scenario modifier)
        try {
            const sleepHunger = patterns.analyzeSleepHunger?.(days, profile, pIndex);
            if (sleepHunger?.available) {
                scores.sleepHunger = {
                    score: normalizeScore(sleepHunger.score),
                    scoreRaw: Number(sleepHunger.score) || 0,
                    confidence: sleepHunger.confidence || 0.7,
                    correlation: sleepHunger.correlation,
                    poorSleepDays: sleepHunger.poorSleepDays || 0,
                    avgLag: sleepHunger.lagEffect || 0
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get sleep_hunger:`, err.message);
        }

        // C14: Nutrient Timing (влияет на PRE/POST_WORKOUT macro fine-tuning)
        try {
            const nutrientTiming = patterns.analyzeNutrientTiming?.(days, pIndex, profile);
            if (nutrientTiming?.available) {
                scores.nutrientTiming = {
                    score: normalizeScore(nutrientTiming.score),
                    scoreRaw: Number(nutrientTiming.score) || 0,
                    confidence: nutrientTiming.confidence || 0.7,
                    carbTimingScore: nutrientTiming.carbTimingScore || 0,
                    proteinTimingScore: nutrientTiming.proteinTimingScore || 0,
                    optimalWindow: nutrientTiming.optimalWindow || 'N/A'
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get nutrient_timing:`, err.message);
        }

        // C10: Fiber Regularity (влияет на product picker fiber boost)
        try {
            const fiberRegularity = patterns.analyzeFiberRegularity?.(days, pIndex);
            if (fiberRegularity?.available) {
                scores.fiberRegularity = {
                    score: normalizeScore(fiberRegularity.score),
                    scoreRaw: Number(fiberRegularity.score) || 0,
                    confidence: fiberRegularity.confidence || 0.7,
                    avgFiberG: fiberRegularity.avgFiberG || 0,
                    targetFiberG: fiberRegularity.targetFiberG || 25,
                    fiberPer1000: fiberRegularity.fiberPer1000 || 0
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get fiber_regularity:`, err.message);
        }

        // C12: Mood ↔ Food (влияет на STRESS_EATING macro strategy)
        try {
            const optimum = profile?.optimum || 2000;
            const moodFood = patterns.analyzeMoodFood?.(days, pIndex, optimum);
            if (moodFood?.available) {
                scores.moodFood = {
                    score: normalizeScore(moodFood.score),
                    scoreRaw: Number(moodFood.score) || 0,
                    confidence: moodFood.confidence || 0.7,
                    correlation: moodFood.correlation || 0,
                    bestFoods: moodFood.bestFoods || [],
                    worstFoods: moodFood.worstFoods || []
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get mood_food:`, err.message);
        }

        // === PHASE C: MICRONUTRIENT INTELLIGENCE (2 patterns) ===

        // C26: Micronutrient Radar (влияет на product boost for Fe/Mg/Zn/Ca sources)
        try {
            const micronutrients = patterns.analyzeMicronutrients?.(days, pIndex, profile);
            if (micronutrients?.available) {
                scores.micronutrients = {
                    score: normalizeScore(micronutrients.score),
                    scoreRaw: Number(micronutrients.score) || 0,
                    confidence: micronutrients.confidence || 0.7,
                    deficits: micronutrients.deficits || [],
                    avgIntake: micronutrients.avgIntake || {}
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get micronutrients:`, err.message);
        }

        // C29: NOVA Quality (влияет на product filter - penalty NOVA-4)
        try {
            const novaQuality = patterns.analyzeNOVAQuality?.(days, pIndex);
            if (novaQuality?.available) {
                scores.novaQuality = {
                    score: normalizeScore(novaQuality.score),
                    scoreRaw: Number(novaQuality.score) || 0,
                    confidence: novaQuality.confidence || 0.7,
                    nova4Share: novaQuality.nova4SharePct || 0,
                    avgNOVA: novaQuality.avgNOVA || 2.5
                };
            }
        } catch (err) {
            console.warn(`[${LOG_FILTER}] ⚠️ Failed to get nova_quality:`, err.message);
        }

        const availableCount = Object.keys(scores).length;
        if (availableCount === 0) {
            console.warn(`[${LOG_FILTER}] ⚠️ No pattern scores available`);
            return null;
        }

        // Format patterns for table display
        const patternTable = Object.entries(scores).map(([name, data]) => {
            const row = {
                pattern: name,
                score: data.score,
                scoreRaw: data.scoreRaw,
                confidence: data.confidence.toFixed(2)
            };
            // Add pattern-specific metrics
            if (data.avgProtein !== undefined) row.avgProtein = Math.round(data.avgProtein);
            if (data.satietyScore !== undefined) row.satietyScore = Math.round(data.satietyScore);
            if (data.correlation !== undefined) row.correlation = data.correlation.toFixed(2);
            if (data.stressDays !== undefined) row.stressDays = data.stressDays;
            if (data.earlyDistribution !== undefined) row.earlyDistrib = data.earlyDistribution.toFixed(2);
            if (data.peakHour !== undefined) row.peakHour = data.peakHour;
            if (data.recoveryRate !== undefined) row.recoveryRate = data.recoveryRate.toFixed(2);
            if (data.avgGapMinutes !== undefined) row.avgGapMin = data.avgGapMinutes;
            if (data.idealGapMinutes !== undefined) row.idealGapMin = data.idealGapMinutes;
            if (data.overlapCount !== undefined) row.overlapCount = data.overlapCount;
            if (data.avgOverlapPct !== undefined) row.avgOverlapPct = data.avgOverlapPct;
            if (data.avgGI !== undefined) row.avgGI = data.avgGI;
            if (data.avgFiberPer1000 !== undefined) row.avgFiberPer1000 = data.avgFiberPer1000;
            if (data.avgDailyGL !== undefined) row.avgDailyGL = data.avgDailyGL;
            if (data.avgEveningRatio !== undefined) row.avgEveningRatio = data.avgEveningRatio;
            if (data.distributionScore !== undefined) row.distributionScore = data.distributionScore;
            if (data.avgDailySugar !== undefined) row.avgDailySugar = data.avgDailySugar;
            if (data.maxStreak !== undefined) row.sugarStreak = data.maxStreak;
            if (data.dependencyRisk !== undefined) row.sugarRisk = data.dependencyRisk;
            // Phase B specific metrics
            if (data.poorSleepDays !== undefined) row.poorSleepDays = data.poorSleepDays;
            if (data.avgLag !== undefined) row.sleepLag = data.avgLag;
            if (data.carbTimingScore !== undefined) row.carbTiming = data.carbTimingScore;
            if (data.proteinTimingScore !== undefined) row.proteinTiming = data.proteinTimingScore;
            if (data.avgFiberG !== undefined) row.avgFiberG = data.avgFiberG;
            if (data.fiberPer1000 !== undefined) row.fiberPer1000 = data.fiberPer1000;
            if (data.bestFoods !== undefined) row.bestFoodCount = data.bestFoods.length;
            if (data.worstFoods !== undefined) row.worstFoodCount = data.worstFoods.length;
            // Phase C specific metrics
            if (data.deficits !== undefined) row.deficitCount = data.deficits.length;
            if (data.avgIntake !== undefined && data.avgIntake.iron) row.avgFe = data.avgIntake.iron;
            if (data.nova4Share !== undefined) row.nova4Pct = data.nova4Share;
            if (data.avgNOVA !== undefined) row.avgNOVA = data.avgNOVA;
            return row;
        });

        console.group(`[${LOG_FILTER}] ✅ Pattern scores loaded: ${availableCount} patterns used for confidence calculation`);
        console.table(patternTable);
        console.groupEnd();

        return scores;
    }

    /**
     * Calculate dynamic confidence score based on multiple factors
     * @param {string} scenario - Detected scenario
     * @param {object} patternScores - Pattern scores from getCurrentPatternScores()
     * @param {number} daysCount - Number of historical days available
     * @param {object} thresholds - Adaptive thresholds (for source check)
     * @returns {number} - Confidence 0.0-1.0
     */
    function calculateDynamicConfidence(scenario, patternScores, daysCount, thresholds) {
        // Factor 1: Scenario detection confidence (0.4 weight)
        let scenarioConf = 0.7; // Base confidence for rule-based scenarios

        // Boost confidence if relevant pattern supports the scenario
        let boostPattern = null;
        let baseScenarioConf = 0.7;
        if (scenario === 'PROTEIN_DEFICIT' && patternScores?.proteinSatiety) {
            scenarioConf = Math.min(0.95, 0.7 + patternScores.proteinSatiety.confidence * 0.2);
            boostPattern = 'proteinSatiety';
        } else if (scenario === 'STRESS_EATING' && patternScores?.stressEating) {
            scenarioConf = Math.min(0.95, 0.7 + patternScores.stressEating.confidence * 0.2);
            boostPattern = 'stressEating';
        } else if (scenario === 'LATE_EVENING' && patternScores?.circadian) {
            scenarioConf = Math.min(0.95, 0.7 + patternScores.circadian.confidence * 0.2);
            boostPattern = 'circadian';
        } else if ((scenario === 'PRE_WORKOUT' || scenario === 'POST_WORKOUT') && patternScores?.trainingRecovery) {
            scenarioConf = Math.min(0.95, 0.7 + patternScores.trainingRecovery.confidence * 0.2);
            boostPattern = 'trainingRecovery';
        }

        // Factor 2: Pattern score average (0.3 weight)
        // P0 Fix: Normalize pattern scores (0-100 scale) to 0-1 range
        let patternAvg = 0.5; // Default if no patterns
        if (patternScores) {
            const scores = Object.values(patternScores).map(p => p.score); // already normalized to 0..1
            patternAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
        }

        // Factor 3: Data quality (0.3 weight)
        let dataQuality = 0.5;
        if (daysCount >= 30) {
            dataQuality = 1.0;
        } else if (daysCount >= 14) {
            dataQuality = 0.85;
        } else if (daysCount >= 7) {
            dataQuality = 0.7;
        }

        // Boost for high-quality thresholds
        if (thresholds?.source === 'FULL') {
            dataQuality = Math.min(1.0, dataQuality + 0.1);
        }

        // Weighted average (0.4 + 0.3 + 0.3 = 1.0)
        const confidence = (scenarioConf * 0.4) + (patternAvg * 0.3) + (dataQuality * 0.3);

        // Build confidence breakdown table
        const confidenceBreakdown = [
            {
                factor: 'Scenario Confidence',
                value: scenarioConf.toFixed(2),
                weight: '40%',
                contribution: (scenarioConf * 0.4).toFixed(2),
                note: boostPattern ? `✅ Boosted by ${boostPattern}` : 'Base 0.7 (rule-based)'
            },
            {
                factor: 'Pattern Avg Score',
                value: patternAvg.toFixed(2),
                weight: '30%',
                contribution: (patternAvg * 0.3).toFixed(2),
                note: patternScores ? `${Object.keys(patternScores).length} patterns` : 'Default'
            },
            {
                factor: 'Data Quality',
                value: dataQuality.toFixed(2),
                weight: '30%',
                contribution: (dataQuality * 0.3).toFixed(2),
                note: `${daysCount}d, thresholds=${thresholds?.source || 'N/A'}`
            },
            {
                factor: '🎯 FINAL CONFIDENCE',
                value: confidence.toFixed(2),
                weight: '100%',
                contribution: confidence.toFixed(2),
                note: 'Weighted sum (clamped 0.5-1.0)'
            }
        ];

        console.group(`[${LOG_FILTER}] 📊 Dynamic confidence calculated: ${scenario} → ${confidence.toFixed(2)}`);
        console.table(confidenceBreakdown);
        console.groupEnd();

        return Math.max(0.5, Math.min(1.0, confidence)); // Clamp to [0.5, 1.0]
    }

    /**
     * Adjust scenario priority based on pattern scores
     * @param {string} scenario - Detected scenario
     * @param {object} patternScores - Pattern scores
     * @returns {number} - Priority multiplier 0.7-1.3 (1.0 = neutral)
     */
    function getScenarioPriorityMultiplier(scenario, patternScores) {
        if (!patternScores) return 1.0;

        let multiplier = 1.0;

        // PROTEIN_DEFICIT: если C09 score низкий → повысить приоритет
        if (scenario === 'PROTEIN_DEFICIT' && patternScores.proteinSatiety) {
            if (patternScores.proteinSatiety.score < 0.5) {
                multiplier = 1.3; // +30% priority
            } else if (patternScores.proteinSatiety.score < 0.7) {
                multiplier = 1.15; // +15% priority
            }
        }

        // STRESS_EATING: если C11 correlation высокий → повысить приоритет
        if (scenario === 'STRESS_EATING' && patternScores.stressEating) {
            const absCorr = Math.abs(patternScores.stressEating.correlation || 0);
            if (absCorr > 0.5) {
                multiplier = 1.25; // +25% priority
            } else if (absCorr > 0.3) {
                multiplier = 1.1; // +10% priority
            }
        }

        // LATE_EVENING: если C13 circadian плохой → повысить осторожность
        if (scenario === 'LATE_EVENING' && patternScores.circadian) {
            if (patternScores.circadian.score < 0.5) {
                multiplier = 1.2; // +20% priority (больше внимания к позднему приёму)
            }
        }

        // LATE_EVENING/BALANCED: high glycemic load history → more conservative priority
        if ((scenario === 'LATE_EVENING' || scenario === 'BALANCED') && patternScores.glycemicLoad) {
            if (patternScores.glycemicLoad.score < 0.45) {
                multiplier = Math.max(multiplier, 1.15);
            }
        }

        // PRE/POST_WORKOUT: если C30 recovery низкий → корректировка
        if ((scenario === 'PRE_WORKOUT' || scenario === 'POST_WORKOUT') && patternScores.trainingRecovery) {
            if (patternScores.trainingRecovery.score < 0.6) {
                multiplier = 1.15; // +15% priority (нужно больше внимания к recovery)
            }
        }

        return multiplier;
    }

    /**
     * Get phenotype-adjusted macro ratios for scenario
     * @param {string} scenario - Meal scenario
     * @param {object} baseMacros - Base macro ratios {protein%, carbs%, fat%}
     * @param {object} phenotype - User phenotype profile
     * @returns {object} - Adjusted macro ratios
     */
    function getPhenotypeAdjustedMacros(scenario, baseMacros, phenotype) {
        if (!phenotype || !HEYS.InsightsPI?.phenotype) {
            return baseMacros; // No adjustment
        }

        const adjusted = { ...baseMacros };

        // Insulin resistance → reduce carbs, increase protein
        if (phenotype.metabolic === 'insulin_resistant' || phenotype.metabolic === 'metabolic_syndrome_risk') {
            const carbReduction = phenotype.metabolic === 'metabolic_syndrome_risk' ? 0.75 : 0.85;
            adjusted.carbsRatio = (adjusted.carbsRatio || 0.4) * carbReduction;
            adjusted.proteinRatio = (adjusted.proteinRatio || 0.35) * 1.15;
            adjusted.fatRatio = 1.0 - adjusted.proteinRatio - adjusted.carbsRatio;
        }

        // Insulin sensitive → можно больше углеводов в PRE/POST_WORKOUT
        if (phenotype.metabolic === 'insulin_sensitive' && (scenario === 'PRE_WORKOUT' || scenario === 'POST_WORKOUT')) {
            adjusted.carbsRatio = (adjusted.carbsRatio || 0.5) * 1.15;
            adjusted.proteinRatio = (adjusted.proteinRatio || 0.35) * 0.95;
            adjusted.fatRatio = 1.0 - adjusted.proteinRatio - adjusted.carbsRatio;
        }

        // Low satiety → больше белка во всех сценариях
        if (phenotype.satiety === 'low_satiety') {
            adjusted.proteinRatio = (adjusted.proteinRatio || 0.35) * 1.15;
            adjusted.carbsRatio = (adjusted.carbsRatio || 0.4) * 0.95;
            adjusted.fatRatio = 1.0 - adjusted.proteinRatio - adjusted.carbsRatio;
        }

        // Evening type → LATE_EVENING может быть менее строгим (не корректирует макросы, но влияет на threshold)
        // Morning type → наоборот, LATE_EVENING строже

        console.info(`[${LOG_FILTER}] 🧬 Phenotype-adjusted macros:`, {
            scenario,
            phenotype,
            baseMacros,
            adjusted
        });

        return adjusted;
    }

    /**
     * Main integration function: enhance recommendation with pattern insights
     * @param {object} contextAnalysis - Current scenario analysis
     * @param {object} recommendation - Base recommendation
     * @param {object[]} days - Historical days
     * @param {object} profile - User profile
     * @param {object} pIndex - Product index
     * @param {object} thresholds - Adaptive thresholds
     * @returns {object} - Enhanced recommendation
     */
    function enhanceRecommendation(contextAnalysis, recommendation, days, profile, pIndex, thresholds) {
        console.info(`[${LOG_FILTER}] 🚀 enhanceRecommendation called`);

        // 1. Load pattern scores
        const patternScores = getCurrentPatternScores(days, profile, pIndex);

        // 2. Calculate dynamic confidence
        const dynamicConfidence = calculateDynamicConfidence(
            contextAnalysis.scenario,
            patternScores,
            days.length,
            thresholds
        );

        // 3. Get scenario priority multiplier
        const priorityMultiplier = getScenarioPriorityMultiplier(
            contextAnalysis.scenario,
            patternScores
        );

        // 4. Get phenotype-adjusted macros
        let adjustedMacros = recommendation.macros;
        if (profile.phenotype) {
            const baseMacroRatios = {
                proteinRatio: recommendation.macros.protein / recommendation.macros.kcal * 4, // protein = 4 kcal/g (not TEF-adjusted for ratio)
                carbsRatio: recommendation.macros.carbs / recommendation.macros.kcal * 4,
                fatRatio: recommendation.macros.fat / recommendation.macros.kcal * 9
            };
            const adjustedRatios = getPhenotypeAdjustedMacros(
                contextAnalysis.scenario,
                baseMacroRatios,
                profile.phenotype
            );

            // Recalculate macros from adjusted ratios
            const totalKcal = recommendation.macros.kcal;
            adjustedMacros = {
                kcal: totalKcal,
                protein: Math.round((totalKcal * adjustedRatios.proteinRatio) / 3), // TEF-adjusted 3 kcal/g
                carbs: Math.round((totalKcal * adjustedRatios.carbsRatio) / 4),
                fat: Math.round((totalKcal * adjustedRatios.fatRatio) / 9)
            };
        }

        // 5. Construct enhanced result
        const enhanced = {
            ...recommendation,
            confidence: dynamicConfidence,
            macros: adjustedMacros,
            insights: {
                // Return patternScores as object { C09: 0.7, C11: 0.65, ... } not array
                patternScores: patternScores ? Object.keys(patternScores).reduce((acc, k) => {
                    acc[k] = patternScores[k].score;
                    return acc;
                }, {}) : {},
                priorityMultiplier: priorityMultiplier !== 1.0 ? priorityMultiplier : undefined,
                phenotypeApplied: !!profile.phenotype
            }
        };

        console.info(`[${LOG_FILTER}] ✅ Recommendation enhanced:`, {
            confidence: dynamicConfidence.toFixed(2),
            priorityMultiplier: priorityMultiplier.toFixed(2),
            phenotypeApplied: !!profile.phenotype,
            patternsUsed: patternScores ? Object.keys(patternScores).length : 0
        });

        return enhanced;
    }

    // Public API
    HEYS.InsightsPI.mealRecPatterns = {
        getCurrentPatternScores,
        calculateDynamicConfidence,
        getScenarioPriorityMultiplier,
        getPhenotypeAdjustedMacros,
        enhanceRecommendation
    };

    console.info(`[${LOG_FILTER}] ✅ Module loaded (v3.0 - Phase A/B/C: 12 patterns integrated)`);

})(typeof window !== 'undefined' ? window : global);
