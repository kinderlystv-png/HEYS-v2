/**
 * HEYS Predictive Insights — Early Warning System v1.1
 * 
 * Проактивная детекция негативных трендов до того, как они станут проблемой.
 * 
 * Сценарии:
 * 1. Health Score падает 3 дня подряд
 * 2. Критичный паттерн (C1-C22) ухудшился на 20%+ за 7 дней OR низкий score
 * 3. Status Score (0-100) падает 3 дня подряд
 * 4. Sleep debt накопился (3+ дня <7ч)
 * 5. Caloric debt >1500 kcal 2 дня подряд
 * 
 * Dependencies: pi_patterns.js, pi_advanced.js, heys_status_v1.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    // Thresholds for warnings
    const THRESHOLDS = {
        HEALTH_SCORE_DECLINE_DAYS: 3,
        HEALTH_SCORE_MIN_DELTA: 10, // minimum total drop over N days (positive = decline)
        STATUS_SCORE_DECLINE_DAYS: 3,
        STATUS_SCORE_MIN_DELTA: 10, // minimum total drop over N days (positive = decline)
        CRITICAL_PATTERN_DEGRADATION: -0.2, // -20%
        SLEEP_DEFICIT_DAYS: 3,
        SLEEP_DEFICIT_HOURS: 7,
        CALORIC_DEBT_DAYS: 2,
        CALORIC_DEBT_THRESHOLD: 1500,
        MIN_DAYS_FOR_ANALYSIS: 7
    };

    // Critical patterns (C1-C22) that require immediate attention
    // Based on health impact: inflammation, metabolic health, performance
    const CRITICAL_PATTERNS = [
        // C1-C10: Timing & Behavior
        'meal_timing',          // C1: Meal spacing affects insulin
        'wave_overlap',         // C2: Fat burning windows
        'late_eating',          // C3: Sleep & weight impact
        'meal_quality_trend',   // C4: Diet quality trajectory
        'sleep_weight',         // C5: Recovery & metabolism
        'sleep_hunger',         // C6: Appetite regulation
        'training_kcal',        // C7: Energy balance
        'steps_weight',         // C8: NEAT activity
        'protein_satiety',      // C9: Satiety optimization
        'fiber_regularity',     // C10: Gut transit

        // C11-C22: Nutrition Quality (high health impact)
        'nutrition_quality',    // C15: Overall diet quality score
        'omega_balancer',       // C16: Inflammation control
        'protein_distribution', // C17: Muscle protein synthesis
        'training_type_match',  // C19: Performance optimization
        'hydration',            // C20: Basic physiological need
        'gut_health'            // C14: Microbiome & immunity
    ];

    // Low score thresholds for pattern alerts
    const PATTERN_LOW_SCORE_THRESHOLDS = {
        critical: 35,  // Critical patterns below this = high severity warning
        important: 45  // Important patterns below this = medium severity warning
    };

    /**
     * Detect consecutive decline in values
     * @param {number[]} values - Array of numeric values (most recent last)
     * @param {number} consecutiveDays - Number of consecutive days to check
     * @returns {boolean}
     */
    function isConsecutiveDecline(values, consecutiveDays) {
        if (!Array.isArray(values) || values.length < consecutiveDays) {
            return false;
        }

        const recent = values.slice(-consecutiveDays);

        for (let i = 1; i < recent.length; i++) {
            if (recent[i] >= recent[i - 1]) {
                return false; // Not declining
            }
        }

        return true;
    }

    /**
     * Calculate average decline rate
     * @param {number[]} values
     * @returns {number} - Average change per day
     */
    function calculateDeclineRate(values) {
        if (!Array.isArray(values) || values.length < 2) return 0;

        let totalChange = 0;
        for (let i = 1; i < values.length; i++) {
            totalChange += (values[i] - values[i - 1]);
        }

        return totalChange / (values.length - 1);
    }

    /**
     * Warning 1: Health Score declining 3+ days
     * @param {object[]} days - Array of day objects (sorted oldest to newest)
     * @param {object} profile
     * @param {object} pIndex
     * @param {object} options - Additional options with currentPatterns/previousPatterns
     * @returns {object|null}
     */
    function checkHealthScoreDecline(days, profile, pIndex, options = {}) {
        console.log('[EWS] 📉 Checking health score decline...');
        if (days.length < THRESHOLDS.MIN_DAYS_FOR_ANALYSIS) {
            console.log('[EWS]   ⏭️ Skip: insufficient days', days.length, '<', THRESHOLDS.MIN_DAYS_FOR_ANALYSIS);
            return null;
        }

        // Check if we have pattern data passed from UI
        const { currentPatterns, previousPatterns } = options;

        // Fallback path: detect decline from day-level health score calculation
        // (keeps backward compatibility for environments without pattern snapshots)
        if (!currentPatterns || !previousPatterns) {
            const calcDayHealthScore = HEYS.InsightsPI?.calculations?.calculateHealthScore;
            if (!calcDayHealthScore) {
                console.log('[EWS]   ⏭️ Skip: no pattern snapshots and no day-level health score calculator');
                return null;
            }

            try {
                const sortedDays = days
                    .slice()
                    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)); // newest first

                const currentPeriod = sortedDays.slice(0, THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS);
                const previousPeriod = sortedDays.slice(
                    THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS,
                    THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS * 2
                );

                if (currentPeriod.length < THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS || previousPeriod.length < THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS) {
                    return null;
                }

                const currentScores = currentPeriod
                    .map(day => calcDayHealthScore(day, profile, pIndex, days))
                    .map(score => score?.overall ?? score?.total ?? 0)
                    .filter(score => Number.isFinite(score) && score > 0);

                const previousScores = previousPeriod
                    .map(day => calcDayHealthScore(day, profile, pIndex, days))
                    .map(score => score?.overall ?? score?.total ?? 0)
                    .filter(score => Number.isFinite(score) && score > 0);

                if (currentScores.length < THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS || previousScores.length < THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS) {
                    console.log('[EWS]   ⏭️ Skip: insufficient valid scores after filtering');
                    return null;
                }

                const currentScore = currentScores.reduce((sum, v) => sum + v, 0) / currentScores.length;
                const previousScore = previousScores.reduce((sum, v) => sum + v, 0) / previousScores.length;
                const totalDrop = previousScore - currentScore;

                console.log(`[EWS]   Health scores (fallback): prev=${Math.round(previousScore)}, curr=${Math.round(currentScore)}, drop=${Math.round(totalDrop)}`);

                if (totalDrop >= THRESHOLDS.HEALTH_SCORE_MIN_DELTA) {
                    const percentChange = Math.round((totalDrop / previousScore) * 100);

                    const warning = {
                        type: 'HEALTH_SCORE_DECLINE',
                        severity: totalDrop >= 20 ? 'high' : 'medium',
                        days: THRESHOLDS.HEALTH_SCORE_DECLINE_DAYS,
                        currentScore: Math.round(currentScore),
                        previousScore: Math.round(previousScore),
                        totalDrop: Math.round(totalDrop),
                        percentChange,
                        message: `📉 Health Score снизился на ${Math.round(totalDrop)} баллов за последние дни`,
                        detail: `Было ${Math.round(previousScore)}, стало ${Math.round(currentScore)} (−${percentChange}%)`,
                        action: 'Проверить breakdown по категориям в Pattern Debugger',
                        actionable: true
                    };
                    console.log(`[EWS]   ✅ HEALTH_SCORE_DECLINE warning: severity=${warning.severity}, drop=${warning.totalDrop}`);
                    return warning;
                }

                console.log('[EWS]   ➖ No significant health score decline (fallback)');
                return null;
            } catch (e) {
                console.error('[EWS] Error in day-level health score fallback:', e);
                return null;
            }
        }

        // Use calculateHealthScore to compute scores from patterns
        const calculateHealthScore = HEYS.PredictiveInsights?.calculateHealthScore;
        if (!calculateHealthScore) {
            console.warn('[EWS] HEYS.PredictiveInsights.calculateHealthScore not available');
            return null;
        }

        try {
            // Calculate health scores from patterns
            const currentHealthScore = calculateHealthScore(currentPatterns, profile);
            const previousHealthScore = calculateHealthScore(previousPatterns, profile);

            const currentScore = currentHealthScore?.total || 0;
            const previousScore = previousHealthScore?.total || 0;

            console.log('[EWS] Health scores:', {
                previous: Math.round(previousScore),
                current: Math.round(currentScore),
                delta: Math.round(currentScore - previousScore)
            });

            if (currentScore === 0 || previousScore === 0) {
                console.log('[EWS] Health score calculation returned 0, skipping');
                return null;
            }

            // Check for decline (previous > current = decline)
            const totalDrop = previousScore - currentScore; // Positive = decline

            if (totalDrop >= THRESHOLDS.HEALTH_SCORE_MIN_DELTA) {  // Significant drop (e.g., >= 10 points)
                const percentChange = Math.round((totalDrop / previousScore) * 100);

                return {
                    type: 'HEALTH_SCORE_DECLINE',
                    severity: totalDrop >= 20 ? 'high' : 'medium',
                    days: 7,
                    currentScore: Math.round(currentScore),
                    previousScore: Math.round(previousScore),
                    totalDrop: Math.round(totalDrop),
                    percentChange,
                    message: `📉 Health Score снизился на ${Math.round(totalDrop)} баллов за 7 дней`,
                    detail: `Было ${Math.round(previousScore)}, стало ${Math.round(currentScore)} (−${percentChange}%)`,
                    action: 'Проверить breakdown по категориям в Pattern Debugger',
                    actionable: true
                };
            }

            console.log('[EWS] Health score stable (drop < threshold)');
            return null;

        } catch (e) {
            console.error('[EWS] Error calculating health score decline:', e);
            return null;
        }
    }

    /**
     * Warning 2: Critical pattern degraded significantly OR current low scores
     * @param {object[]} days
     * @param {object} profile
     * @param {object} pIndex
     * @param {object} previousPatterns - patterns from 7 days ago (optional)
     * @param {object} currentPatterns - patterns from today (required)
     * @returns {object[]|null}
     */
    function checkCriticalPatternDegradation(days, profile, pIndex, previousPatterns, currentPatterns) {
        if (!currentPatterns) return null;

        const warnings = [];

        // Check 1: Pattern score degradation (change over time) - ONLY if we have previous data
        if (previousPatterns) {
            for (const patternId of CRITICAL_PATTERNS) {
                const prev = previousPatterns[patternId];
                const curr = currentPatterns[patternId];

                if (!prev || !curr || !prev.available || !curr.available) continue;

                const prevScore = prev.score || 0;
                const currScore = curr.score || 0;

                if (prevScore === 0) continue; // Avoid division by zero

                const relativeChange = (currScore - prevScore) / prevScore;

                if (relativeChange <= THRESHOLDS.CRITICAL_PATTERN_DEGRADATION) {
                    const absoluteChange = currScore - prevScore;

                    warnings.push({
                        type: 'CRITICAL_PATTERN_DEGRADATION',
                        severity: relativeChange <= -0.3 ? 'high' : 'medium',
                        pattern: patternId,
                        patternName: prev.pattern || patternId,
                        previousScore: Math.round(prevScore),
                        currentScore: Math.round(currScore),
                        absoluteChange: Math.round(absoluteChange),
                        relativeChange: Math.round(relativeChange * 100),
                        message: `⚠️ ${prev.pattern || patternId} ухудшился на ${Math.abs(Math.round(relativeChange * 100))}%`,
                        detail: `С ${Math.round(prevScore)} до ${Math.round(currScore)} за 7 дней`,
                        action: `Изучить insight: «${curr.insight || 'N/A'}»`,
                        actionable: true
                    });
                }
            }
        }

        // Check 2: Current low pattern scores (absolute values) - ALWAYS check this
        console.log('[EWS] 🔍 Checking current pattern scores...');

        // Convert patterns array to id-indexed object for easier lookup
        const patternsById = {};
        if (Array.isArray(currentPatterns)) {
            for (const p of currentPatterns) {
                if (p.pattern) patternsById[p.pattern] = p;
            }
        } else {
            // Already an object
            Object.assign(patternsById, currentPatterns);
        }

        const allPatternIds = Object.keys(patternsById);

        for (const patternId of allPatternIds) {
            const pattern = patternsById[patternId];
            if (!pattern || !pattern.available) continue;

            const score = pattern.score || 0;
            const isCritical = CRITICAL_PATTERNS.includes(patternId);

            console.log(`[EWS]   ${patternId}: score=${score}, critical=${isCritical}`);

            // Critical patterns: HIGH severity if below 35, MEDIUM if 35-50
            if (isCritical && score > 0 && score < PATTERN_LOW_SCORE_THRESHOLDS.critical) {
                warnings.push({
                    type: 'LOW_PATTERN_SCORE',
                    severity: 'high',
                    pattern: patternId,
                    patternName: pattern.pattern || patternId,
                    currentScore: Math.round(score),
                    threshold: PATTERN_LOW_SCORE_THRESHOLDS.critical,
                    message: `🚨 ${pattern.pattern || patternId}: критически низкий score ${Math.round(score)}`,
                    detail: pattern.insight || 'Паттерн требует немедленного внимания',
                    actionable: true
                });
            }
            // Critical patterns: MEDIUM severity if 35-50 (still needs attention)
            else if (isCritical && score >= PATTERN_LOW_SCORE_THRESHOLDS.critical && score < 50) {
                warnings.push({
                    type: 'LOW_PATTERN_SCORE',
                    severity: 'medium',
                    pattern: patternId,
                    patternName: pattern.pattern || patternId,
                    currentScore: Math.round(score),
                    threshold: 50,
                    message: `⚠️ ${pattern.pattern || patternId}: низкий score ${Math.round(score)}`,
                    detail: pattern.insight || 'Критический паттерн стоит улучшить',
                    actionable: true
                });
            }
            // Non-critical patterns: warn if below 45
            else if (!isCritical && score > 0 && score < PATTERN_LOW_SCORE_THRESHOLDS.important) {
                warnings.push({
                    type: 'LOW_PATTERN_SCORE',
                    severity: 'medium',
                    pattern: patternId,
                    patternName: pattern.pattern || patternId,
                    currentScore: Math.round(score),
                    threshold: PATTERN_LOW_SCORE_THRESHOLDS.important,
                    message: `⚠️ ${pattern.pattern || patternId}: низкий score ${Math.round(score)}`,
                    detail: pattern.insight || 'Паттерн стоит улучшить',
                    actionable: true
                });
            }
        }

        console.log(`[EWS] ✅ Found ${warnings.length} pattern-related warnings`);

        return warnings.length > 0 ? warnings : null;
    }

    /**
     * Warning 3: Status Score decline
     * @param {object[]} days - Array of day objects with statusScore property
     * @returns {object|null}
     */
    function checkStatusScoreDecline(days) {
        console.log('[EWS] 📊 Checking Status Score decline...');

        if (days.length < THRESHOLDS.STATUS_SCORE_DECLINE_DAYS) {
            console.log('[EWS]   ⏭️ Skip: insufficient days', days.length, '<', THRESHOLDS.STATUS_SCORE_DECLINE_DAYS);
            return null;
        }

        // Get Status Score for recent days
        const recentDays = days.slice(-7); // Most recent 7 days
        const statusScores = [];

        for (const day of recentDays) {
            // Try to get cached status or calculate
            let status = null;

            if (day.statusScore !== undefined) {
                status = day.statusScore;
            } else if (day._statusCalculated && day._statusCalculated.score !== undefined) {
                status = day._statusCalculated.score;
            } else if (typeof HEYS !== 'undefined' && HEYS.Status && typeof HEYS.Status.calculate === 'function') {
                // Try to calculate status Score on the fly
                try {
                    const result = HEYS.Status.calculate({ dayData: day });
                    if (result && result.score !== undefined) {
                        status = result.score;
                    }
                } catch (e) {
                    console.warn('[EWS]   ⚠️ Failed to calculate status for day', day.date, e.message);
                }
            }

            if (status !== null && status !== undefined) {
                statusScores.push({
                    date: day.date,
                    score: status
                });
            }
        }

        console.log(`[EWS]   Collected ${statusScores.length} status scores from ${recentDays.length} days`);

        if (statusScores.length < THRESHOLDS.STATUS_SCORE_DECLINE_DAYS) {
            console.log('[EWS]   ⏭️ Skip: not enough status scores', statusScores.length, '<', THRESHOLDS.STATUS_SCORE_DECLINE_DAYS);
            return null;
        }

        // Check consecutive decline
        const recent = statusScores.slice(-THRESHOLDS.STATUS_SCORE_DECLINE_DAYS);
        const scores = recent.map(d => d.score);
        const isDecline = isConsecutiveDecline(scores, THRESHOLDS.STATUS_SCORE_DECLINE_DAYS);

        console.log(`[EWS]   Status scores (${recent.length}d):`, scores.map(s => Math.round(s)));

        if (isDecline) {
            const totalDrop = scores[0] - scores[scores.length - 1];
            const avgDailyDrop = calculateDeclineRate(scores);

            console.log(`[EWS]   📉 Decline detected: totalDrop=${totalDrop.toFixed(1)}, avgDaily=${avgDailyDrop.toFixed(1)}`);

            if (totalDrop >= THRESHOLDS.STATUS_SCORE_MIN_DELTA) {
                const startScore = Math.round(scores[0]);
                const endScore = Math.round(scores[scores.length - 1]);

                const warning = {
                    type: 'STATUS_SCORE_DECLINE',
                    severity: totalDrop >= 20 ? 'high' : (totalDrop >= 15 ? 'medium' : 'low'),
                    days: THRESHOLDS.STATUS_SCORE_DECLINE_DAYS,
                    startScore,
                    endScore,
                    totalDrop: Math.round(totalDrop),
                    avgDailyDrop: Math.round(avgDailyDrop * 10) / 10,
                    message: `📊 Status Score падает ${THRESHOLDS.STATUS_SCORE_DECLINE_DAYS} дня подряд`,
                    detail: `С ${startScore} до ${endScore} (падение ${Math.round(totalDrop)} баллов)`,
                    action: 'Проверить слабые факторы в Status карточке',
                    actionable: true
                };

                console.log(`[EWS]   ✅ STATUS_SCORE_DECLINE warning: severity=${warning.severity}, drop=${warning.totalDrop}`);
                return warning;
            }
        }

        console.log('[EWS]   ➖ No Status Score decline detected');
        return null;
    }

    /**
     * Warning 4: Sleep debt accumulation
     * @param {object[]} days - Array of day objects (sorted oldest to newest)
     * @param {object} profile
     * @returns {object|null}
     */
    function checkSleepDebt(days, profile) {
        console.log('[EWS] 🛌 Checking sleep debt...');
        if (days.length < THRESHOLDS.SLEEP_DEFICIT_DAYS) {
            console.log('[EWS]   ⏭️ Skip: insufficient days', days.length, '<', THRESHOLDS.SLEEP_DEFICIT_DAYS);
            return null;
        }

        const targetSleep = profile?.sleepHours || 8;
        const recentDays = days.slice(-7); // Most recent first

        const sleepData = recentDays.map(day => {
            const sleep = day.sleepHours || (day.sleepStart && day.sleepEnd
                ? calculateSleepHours(day.sleepStart, day.sleepEnd)
                : null);
            return { date: day.date, sleep, deficit: sleep ? Math.max(0, targetSleep - sleep) : 0 };
        }).filter(d => d.sleep !== null);

        if (sleepData.length < THRESHOLDS.SLEEP_DEFICIT_DAYS) {
            console.log('[EWS]   ⏭️ Skip: not enough sleep data after filter', sleepData.length, '<', THRESHOLDS.SLEEP_DEFICIT_DAYS);
            return null;
        }

        // Check last N consecutive days (most recent first)
        const recent = sleepData.slice(0, THRESHOLDS.SLEEP_DEFICIT_DAYS);
        const allDeficit = recent.every(d => d.sleep < THRESHOLDS.SLEEP_DEFICIT_HOURS);

        console.log(`[EWS]   Sleep stats: recent=${recent.length}d, avgSleep=${(recent.reduce((s, d) => s + d.sleep, 0) / recent.length).toFixed(1)}h, target=${targetSleep}h, allDeficit=${allDeficit}`);

        if (allDeficit) {
            const totalDeficit = recent.reduce((sum, d) => sum + d.deficit, 0);
            const avgSleep = recent.reduce((sum, d) => sum + d.sleep, 0) / recent.length;

            const warning = {
                type: 'SLEEP_DEBT',
                severity: totalDeficit > 6 ? 'high' : 'medium',
                days: THRESHOLDS.SLEEP_DEFICIT_DAYS,
                avgSleep: Math.round(avgSleep * 10) / 10,
                targetSleep,
                totalDeficit: Math.round(totalDeficit * 10) / 10,
                message: `💤 Накопился sleep debt за ${THRESHOLDS.SLEEP_DEFICIT_DAYS} дня`,
                detail: `Средний сон: ${Math.round(avgSleep * 10) / 10}ч (цель: ${targetSleep}ч), дефицит: ${Math.round(totalDeficit * 10) / 10}ч`,
                action: 'Запланировать ранний отход ко сну на ближайшие 2-3 дня',
                actionable: true
            };
            console.log(`[EWS]   ✅ SLEEP_DEBT warning: severity=${warning.severity}, totalDeficit=${warning.totalDeficit}h`);
            return warning;
        }

        console.log('[EWS]   ➖ No sleep debt detected');
        return null;
    }

    /**
     * Warning 4: Caloric debt accumulation
     * @param {object[]} days - Array of day objects (sorted oldest to newest)
     * @param {object} profile
     * @param {object} pIndex
     * @returns {object|null}
     */
    function checkCaloricDebt(days, profile, pIndex) {
        console.log('[EWS] 🍽️ Checking caloric debt...');
        if (days.length < THRESHOLDS.CALORIC_DEBT_DAYS) {
            console.log('[EWS]   ⏭️ Skip: insufficient days', days.length, '<', THRESHOLDS.CALORIC_DEBT_DAYS);
            return null;
        }

        const calculateItemKcal = HEYS.InsightsPI?.calculations?.calculateItemKcal;
        if (!calculateItemKcal) {
            console.warn('[EWS]   ⏭️ Skip: calculateItemKcal not available');
            return null;
        }

        const recentDays = days.slice(-7); // Most recent first
        const optimum = profile?.optimum || profile?.norm?.kcal || 2000;

        const caloricData = recentDays.map(day => {
            let eaten = day.savedEatenKcal || 0;

            if (!eaten && day.meals) {
                eaten = day.meals.reduce((sum, meal) => {
                    if (!meal.items) return sum;
                    return sum + meal.items.reduce((mealSum, item) => {
                        return mealSum + calculateItemKcal(item, pIndex);
                    }, 0);
                }, 0);
            }

            const debt = Math.max(0, optimum - eaten);
            return { date: day.date, eaten, optimum, debt };
        });

        // Check last N consecutive days (most recent first)
        const recent = caloricData.slice(0, THRESHOLDS.CALORIC_DEBT_DAYS);
        const totalDebt = recent.reduce((sum, d) => sum + d.debt, 0);

        console.log(`[EWS]   Caloric stats: recent=${recent.length}d, optimum=${optimum}kcal, totalDebt=${Math.round(totalDebt)}kcal, threshold=${THRESHOLDS.CALORIC_DEBT_THRESHOLD}kcal`);

        if (totalDebt > THRESHOLDS.CALORIC_DEBT_THRESHOLD) {
            const avgEaten = recent.reduce((sum, d) => sum + d.eaten, 0) / recent.length;
            const avgDebt = totalDebt / recent.length;

            const warning = {
                type: 'CALORIC_DEBT',
                severity: totalDebt > 2500 ? 'high' : 'medium',
                days: THRESHOLDS.CALORIC_DEBT_DAYS,
                avgEaten: Math.round(avgEaten),
                optimum,
                totalDebt: Math.round(totalDebt),
                avgDebt: Math.round(avgDebt),
                message: `🍽️ Накопился caloric debt ${THRESHOLDS.CALORIC_DEBT_DAYS} дня подряд`,
                detail: `Средний недобор: ${Math.round(avgDebt)} ккал/день (всего ${Math.round(totalDebt)} ккал)`,
                action: 'Запланировать refeed meal или увеличить порции',
                actionable: true
            };
            console.log(`[EWS]   ✅ CALORIC_DEBT warning: severity=${warning.severity}, totalDebt=${warning.totalDebt}kcal`);
            return warning;
        }

        console.log('[EWS]   ➖ No caloric debt detected');
        return null;
    }

    /**
     * Helper: Calculate sleep hours from start/end time
     * @param {string} start - "23:00"
     * @param {string} end - "07:30"
     * @returns {number}
     */
    function calculateSleepHours(start, end) {
        if (!start || !end) return 0;

        try {
            const [startH, startM] = start.split(':').map(Number);
            const [endH, endM] = end.split(':').map(Number);

            let hours = endH - startH;
            let minutes = endM - startM;

            if (hours < 0) hours += 24; // Overnight
            if (minutes < 0) {
                hours -= 1;
                minutes += 60;
            }

            return hours + minutes / 60;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Main API: Detect all early warning signals
     * @param {object[]} days - Array of day objects (sorted oldest to newest)
     * @param {object} profile - User profile
     * @param {object} pIndex - Product index
     * @param {object} [options] - Optional previous/current pattern snapshots
     * @returns {object}
     */
    function detectEarlyWarnings(days, profile, pIndex, options = {}) {
        console.log('[EWS] 🚨 detectEarlyWarnings called:', {
            daysCount: days?.length || 0,
            profileId: profile?.id,
            hasPIndex: !!pIndex,
            hasOptions: !!options.previousPatterns,
            thresholds: THRESHOLDS
        });

        if (!Array.isArray(days) || days.length < THRESHOLDS.MIN_DAYS_FOR_ANALYSIS) {
            console.warn('[EWS] ⚠️ Insufficient data:', days?.length || 0, 'days (need', THRESHOLDS.MIN_DAYS_FOR_ANALYSIS, ')');
            return {
                available: false,
                reason: 'insufficient_data',
                minDaysRequired: THRESHOLDS.MIN_DAYS_FOR_ANALYSIS,
                warnings: []
            };
        }

        const warnings = [];

        console.log('[EWS] 🎯 Running 5 warning checks...');

        // Warning 1: Health Score decline
        const scoreWarning = checkHealthScoreDecline(days, profile, pIndex, options);
        if (scoreWarning) {
            console.log('[EWS]   ✅ Check 1 (HealthScore): found warning');
            warnings.push(scoreWarning);
        } else {
            console.log('[EWS]   ➖ Check 1 (HealthScore): no warning');
        }

        // Warning 2: Critical pattern degradation OR low pattern scores
        if (options.currentPatterns) {
            const patternWarnings = checkCriticalPatternDegradation(
                days,
                profile,
                pIndex,
                options.previousPatterns,  // optional
                options.currentPatterns    // required
            );
            if (patternWarnings) {
                console.log(`[EWS]   ✅ Check 2 (Patterns): found ${patternWarnings.length} warning(s)`);
                warnings.push(...patternWarnings);
            } else {
                console.log('[EWS]   ➖ Check 2 (Patterns): no warnings');
            }
        } else {
            console.log('[EWS]   ⏭️ Check 2 (Patterns): skipped (no currentPatterns)');
        }

        // Warning 3: Status Score decline
        const statusWarning = checkStatusScoreDecline(days);
        if (statusWarning) {
            console.log('[EWS]   ✅ Check 3 (Status): found warning');
            warnings.push(statusWarning);
        } else {
            console.log('[EWS]   ➖ Check 3 (Status): no warning');
        }

        // Warning 4: Sleep debt
        const sleepWarning = checkSleepDebt(days, profile);
        if (sleepWarning) {
            console.log('[EWS]   ✅ Check 4 (Sleep): found warning');
            warnings.push(sleepWarning);
        } else {
            console.log('[EWS]   ➖ Check 4 (Sleep): no warning');
        }

        // Warning 5: Caloric debt
        const caloricWarning = checkCaloricDebt(days, profile, pIndex);
        if (caloricWarning) {
            console.log('[EWS]   ✅ Check 5 (Caloric): found warning');
            warnings.push(caloricWarning);
        } else {
            console.log('[EWS]   ➖ Check 5 (Caloric): no warning');
        }

        // Sort by severity
        warnings.sort((a, b) => {
            const severityOrder = { high: 0, medium: 1, low: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

        console.log('[EWS] ✅ Detection complete:', {
            totalWarnings: warnings.length,
            types: warnings.map(w => w.type),
            severities: warnings.map(w => w.severity),
            highSeverity: warnings.filter(w => w.severity === 'high').length
        });

        return {
            available: true,
            count: warnings.length,
            warnings,
            summary: warnings.length === 0
                ? '✅ Негативных трендов не обнаружено'
                : `⚠️ Обнаружено ${warnings.length} warning signal${warnings.length > 1 ? 's' : ''}`,
            highSeverityCount: warnings.filter(w => w.severity === 'high').length,
            mediumSeverityCount: warnings.filter(w => w.severity === 'medium').length
        };
    }

    // Export API
    HEYS.InsightsPI.earlyWarning = {
        detect: detectEarlyWarnings,
        thresholds: THRESHOLDS,
        version: '1.1.0'
    };

    console.log('[HEYS.InsightsPI] ✅ Early Warning System v1.1 loaded (5 checks)');

})(typeof window !== 'undefined' ? window : global);
