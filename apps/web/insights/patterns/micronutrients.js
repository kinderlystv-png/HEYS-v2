// insights/patterns/micronutrients.js — Modular micronutrient analyzers (v6.3.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};

    const checkMinN = piStats.checkMinN || ((days, minDays) => ({ ok: Array.isArray(days) && days.length >= minDays }));
    const applySmallSamplePenalty = piStats.applySmallSamplePenalty || ((baseConfidence) => baseConfidence);

    const average = piStats.average || function (arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((sum, value) => sum + (Number(value) || 0), 0) / arr.length;
    };

    const PATTERNS = piConst.PATTERNS || {
        MICRONUTRIENT_RADAR: 'micronutrient_radar',
        VITAMIN_DEFENSE: 'vitamin_defense',
        B_COMPLEX_ANEMIA: 'b_complex_anemia',
        ADDED_SUGAR_DEPENDENCY: 'added_sugar_dependency',
        BONE_HEALTH: 'bone_health'
    };

    /**
     * Resolve product data from a meal item via product index fallbacks.
     * @param {object} item - Meal item wrapper.
     * @param {object} pIndex - Product index.
     * @returns {object|null} Resolved product object.
     */
    function resolveProduct(item, pIndex) {
        if (!item) return null;

        if (pIndex?.byId?.get && item.product_id != null) {
            const direct = pIndex.byId.get(item.product_id)
                || pIndex.byId.get(String(item.product_id))
                || pIndex.byId.get(String(item.product_id).toLowerCase());
            if (direct) return direct;
        }

        const candidateNames = [item.name, item.title, item.productName].filter(Boolean)
            .map(v => String(v).trim().toLowerCase())
            .filter(Boolean);

        if (pIndex?.byName?.get) {
            for (const name of candidateNames) {
                const byName = pIndex.byName.get(name);
                if (byName) return byName;
            }
        }

        if (item.vitamin_a || item.protein100 || item.simple100 || item.calcium || item.vitamin_b12) {
            return item;
        }

        return null;
    }

    /**
     * Iterate over every meal item in a day.
     * @param {object} day - Day object.
     * @param {(item: object, meal: object) => void} iteratee - Iteration callback.
     * @returns {void}
     */
    function eachMealItem(day, iteratee) {
        for (const meal of (day?.meals || [])) {
            for (const item of (meal?.items || [])) {
                iteratee(item, meal);
            }
        }
    }

    /**
     * C7: Micronutrient Radar (Hidden Hunger).
     * @param {Array} days - Days to analyze.
     * @param {object} pIndex - Product index.
     * @param {object} profile - User profile.
     * @returns {object} Pattern result.
     */
    function analyzeMicronutrients(days, pIndex, profile) {
        const pattern = PATTERNS.MICRONUTRIENT_RADAR || 'micronutrient_radar';
        const minDays = piConst?.CONFIG?.MIN_DAYS_FOR_FULL_ANALYSIS || 7;

        if (!Array.isArray(days) || days.length < minDays) {
            return { pattern, available: false };
        }

        void profile;

        // DRI targets (Daily Reference Intake, % of DV)
        const DRI_TARGETS = {
            iron: 100,
            magnesium: 100,
            zinc: 100,
            calcium: 100
        };

        const micronutrients = { iron: [], magnesium: [], zinc: [], calcium: [] };

        for (const day of days) {
            if (!day?.meals?.length) continue;

            const dayNutrients = { iron: 0, magnesium: 0, zinc: 0, calcium: 0 };

            eachMealItem(day, (item) => {
                const prod = resolveProduct(item, pIndex);
                if (!prod) return;

                const grams = Number(item.grams) || 0;
                const factor = grams / 100;

                if (prod.iron) dayNutrients.iron += Number(prod.iron) * factor;
                if (prod.magnesium) dayNutrients.magnesium += Number(prod.magnesium) * factor;
                if (prod.zinc) dayNutrients.zinc += Number(prod.zinc) * factor;
                if (prod.calcium) dayNutrients.calcium += Number(prod.calcium) * factor;
            });

            micronutrients.iron.push((dayNutrients.iron / 18) * 100);
            micronutrients.magnesium.push((dayNutrients.magnesium / 400) * 100);
            micronutrients.zinc.push((dayNutrients.zinc / 11) * 100);
            micronutrients.calcium.push((dayNutrients.calcium / 1000) * 100);
        }

        const avgIntake = {
            iron: average(micronutrients.iron),
            magnesium: average(micronutrients.magnesium),
            zinc: average(micronutrients.zinc),
            calcium: average(micronutrients.calcium)
        };

        const deficits = [];
        for (const [nutrient, avgPct] of Object.entries(avgIntake)) {
            if (avgPct < 70) {
                deficits.push({ nutrient, avgPct: Math.round(avgPct), target: DRI_TARGETS[nutrient] });
            }
        }

        const lowEnergyDays = days.filter(d => d.energy && d.energy < 3).length;
        const poorSleepDays = days.filter(d => d.sleepQuality && d.sleepQuality < 3).length;

        let score = 100;
        deficits.forEach(d => {
            score -= (100 - d.avgPct) * 0.5;
        });
        score = Math.max(0, Math.round(score));

        let insight = '';
        if (deficits.length === 0) {
            insight = `✅ Все 4 микроэлемента в норме (Fe ${Math.round(avgIntake.iron)}%, Mg ${Math.round(avgIntake.magnesium)}%, Zn ${Math.round(avgIntake.zinc)}%, Ca ${Math.round(avgIntake.calcium)}%)`;
        } else {
            const deficitNames = deficits.map(d => {
                const names = { iron: 'Fe', magnesium: 'Mg', zinc: 'Zn', calcium: 'Ca' };
                return `${names[d.nutrient]} ${d.avgPct}%`;
            }).join(', ');
            insight = `⚠️ Дефициты: ${deficitNames}. `;

            if (deficits.some(d => d.nutrient === 'iron') && lowEnergyDays > days.length * 0.4) {
                insight += `Низкое Fe → усталость (${lowEnergyDays} дней). `;
            }
            if (deficits.some(d => d.nutrient === 'magnesium') && poorSleepDays > days.length * 0.4) {
                insight += `Низкий Mg → плохой сон (${poorSleepDays} дней). `;
            }
        }

        const confidence = days.length >= 14 ? 0.75 : 0.60;

        return {
            pattern,
            available: true,
            avgIntake: {
                iron: Math.round(avgIntake.iron),
                magnesium: Math.round(avgIntake.magnesium),
                zinc: Math.round(avgIntake.zinc),
                calcium: Math.round(avgIntake.calcium)
            },
            deficits,
            lowEnergyDays,
            poorSleepDays,
            dataPoints: days.length,
            score,
            confidence,
            insight
        };
    }

    /**
     * C13: Vitamin Defense Radar.
     * @param {Array} days - Days to analyze.
     * @param {object} profile - User profile.
     * @param {object} pIndex - Product index.
     * @returns {object} Pattern result.
     */
    function analyzeVitaminDefense(days, profile, pIndex) {
        const pattern = PATTERNS.VITAMIN_DEFENSE || 'vitamin_defense';
        const minDays = 7;

        const nCheck = checkMinN(days, minDays);
        if (!nCheck.ok) {
            return { pattern, available: false, reason: 'min-data', daysAnalyzed: Array.isArray(days) ? days.length : 0 };
        }

        const validDays = (days || []).filter(d => d && d.meals && d.meals.length > 0);
        const avgProductsPerDay = validDays.length > 0
            ? validDays.reduce((sum, d) => sum + d.meals.reduce((pSum, m) => pSum + (m.items?.length || 0), 0), 0) / validDays.length
            : 0;

        if (avgProductsPerDay < 3) {
            return { pattern, available: false, reason: 'min-products', avgProducts: Math.round(avgProductsPerDay * 10) / 10 };
        }

        const gender = profile?.gender || 'male';
        const DRI = {
            vitamin_a: gender === 'female' ? 700 : 900,
            vitamin_c: gender === 'female' ? 75 : 90,
            vitamin_d: 15,
            vitamin_e: 15,
            vitamin_k: gender === 'female' ? 90 : 120,
            vitamin_b1: 1.2,
            vitamin_b2: 1.3,
            vitamin_b3: 16,
            vitamin_b6: 1.3,
            vitamin_b9: 400,
            vitamin_b12: 2.4
        };

        const vitaminData = {};
        const vitaminKeys = Object.keys(DRI);

        vitaminKeys.forEach(vitKey => {
            let totalIntake = 0;
            let daysWithData = 0;

            validDays.forEach(day => {
                let dayIntake = 0;
                eachMealItem(day, (item) => {
                    const prod = resolveProduct(item, pIndex);
                    if (!prod) return;
                    const vitValue = Number(prod[vitKey] || prod[`${vitKey}_100`]) || 0;
                    if (vitValue <= 0) return;
                    const grams = Number(item.grams || item.amount) || 0;
                    dayIntake += vitValue * grams / 100;
                });

                if (dayIntake > 0) {
                    totalIntake += dayIntake;
                    daysWithData++;
                }
            });

            const avgDailyIntake = daysWithData > 0 ? totalIntake / daysWithData : 0;
            const pctDV = (avgDailyIntake / DRI[vitKey]) * 100;

            vitaminData[vitKey] = {
                intake: Math.round(avgDailyIntake * 10) / 10,
                dri: DRI[vitKey],
                pctDV: Math.round(pctDV),
                deficit: pctDV < 70,
                daysWithData
            };
        });

        const clusters = {
            antioxidant: ['vitamin_a', 'vitamin_c', 'vitamin_e'],
            bone: ['vitamin_d', 'vitamin_k'],
            energy: ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6'],
            blood: ['vitamin_b9', 'vitamin_b12']
        };

        const clusterScores = {};
        Object.keys(clusters).forEach(clusterKey => {
            const vitKeys = clusters[clusterKey];
            const avgPct = vitKeys.reduce((sum, vk) => sum + (vitaminData[vk]?.pctDV || 0), 0) / vitKeys.length;
            clusterScores[clusterKey] = {
                avgPct: Math.round(avgPct),
                risk: avgPct < 70,
                vitamins: vitKeys
            };
        });

        const deficitList = vitaminKeys.filter(vk => vitaminData[vk].deficit);
        const countDeficits = deficitList.length;
        const score = Math.max(0, Math.min(100, 100 - (countDeficits * 8)));

        const baseConfidence = validDays.length >= 14 ? 0.80 : 0.70;
        const confidence = applySmallSamplePenalty(baseConfidence, validDays.length, 10);

        let insight = `Vitamin Defense Radar: ${countDeficits} из 11 витаминов ниже 70% DRI`;
        if (countDeficits === 0) {
            insight = '🌟 Отлично! Все 11 витаминов в норме (≥70% DRI)';
        } else if (countDeficits <= 2) {
            insight = `⚠️ Легкий дефицит: ${deficitList.join(', ')} < 70% DRI`;
        } else if (countDeficits >= 5) {
            insight = `🚨 Множественный дефицит: ${countDeficits} витаминов требуют внимания`;
        }

        return {
            pattern,
            available: true,
            vitaminData,
            clusterScores,
            deficitList,
            countDeficits,
            daysAnalyzed: validDays.length,
            avgProductsPerDay: Math.round(avgProductsPerDay * 10) / 10,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * C22: B-Complex Energy & Anemia Risk.
     * @param {Array} days - Days to analyze.
     * @param {object} profile - User profile.
     * @param {object} pIndex - Product index.
     * @returns {object} Pattern result.
     */
    function analyzeBComplexAnemia(days, profile, pIndex) {
        const pattern = PATTERNS.B_COMPLEX_ANEMIA || 'b_complex_anemia';
        const minDays = 7;

        const nCheck = checkMinN(days, minDays);
        if (!nCheck.ok) {
            return {
                pattern,
                available: false,
                reason: 'min_days_required',
                minDaysRequired: minDays,
                daysProvided: Array.isArray(days) ? days.length : 0
            };
        }

        const isFemale = profile?.gender === 'female' || profile?.gender === 'Женской';
        const DRI = {
            vitamin_b1: 1.2,
            vitamin_b2: 1.3,
            vitamin_b3: 16,
            vitamin_b6: 1.3,
            vitamin_b9: 400,
            vitamin_b12: 2.4,
            iron: isFemale ? 18 : 8
        };

        const nutrientKeys = Object.keys(DRI);
        const nutrientData = {};

        nutrientKeys.forEach((nutrient) => {
            let totalIntake = 0;
            let daysWithData = 0;

            (days || []).forEach(day => {
                let dayIntake = 0;
                eachMealItem(day, (item) => {
                    const product = resolveProduct(item, pIndex);
                    if (!product) return;
                    const value = Number(product[nutrient] || product[`${nutrient}_100`]) || 0;
                    const grams = Number(item.grams || item.amount) || 0;
                    dayIntake += (value * grams) / 100;
                });

                if (dayIntake > 0) {
                    totalIntake += dayIntake;
                    daysWithData++;
                }
            });

            const avgIntake = daysWithData > 0 ? totalIntake / daysWithData : 0;
            const pctDV = (avgIntake / DRI[nutrient]) * 100;

            nutrientData[nutrient] = {
                intake: Math.round(avgIntake * 10) / 10,
                dri: DRI[nutrient],
                pctDV: Math.round(pctDV),
                deficit: pctDV < 70
            };
        });

        const energyQuartet = ['vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6'];
        const bloodPair = ['vitamin_b9', 'vitamin_b12'];

        const energyBscore = Math.round(average(energyQuartet.map(v => nutrientData[v]?.pctDV || 0)));
        const bloodBscore = Math.round(average(bloodPair.map(v => nutrientData[v]?.pctDV || 0)));

        const ironDeficit = nutrientData.iron?.pctDV < 70;
        const b12Deficit = nutrientData.vitamin_b12?.pctDV < 70;
        const folateDeficit = nutrientData.vitamin_b9?.pctDV < 70;

        let anemiaRisk = 0;
        if (ironDeficit) anemiaRisk += 30;
        if (b12Deficit) anemiaRisk += 30;
        if (folateDeficit) anemiaRisk += 25;
        if (ironDeficit && b12Deficit && folateDeficit) anemiaRisk = 100;

        const score = Math.round(energyBscore * 0.4 + bloodBscore * 0.3 + (100 - anemiaRisk) * 0.3);
        const baseConfidence = score >= 70 ? 0.75 : 0.65;
        const confidence = applySmallSamplePenalty(baseConfidence, days.length, minDays);

        return {
            pattern,
            available: true,
            nutrientData,
            energyBscore,
            bloodBscore,
            anemiaRisk,
            daysAnalyzed: days.length,
            genderAdjusted: isFemale ? 'female (Fe DRI 18mg)' : 'male (Fe DRI 8mg)',
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight: anemiaRisk >= 70
                ? '❌ Высокий риск анемии, нужна коррекция рациона'
                : anemiaRisk >= 30
                    ? '⚠️ Умеренный риск анемии, следи за железом/B9/B12'
                    : '✅ Риск анемии низкий'
        };
    }

    /**
     * C18: Added Sugar & Dependency patterns.
     * @param {Array} days - Days to analyze.
     * @param {object} pIndex - Product index.
     * @returns {object} Pattern result.
     */
    function analyzeAddedSugarDependency(days, pIndex) {
        const pattern = PATTERNS.ADDED_SUGAR_DEPENDENCY || 'added_sugar_dependency';
        const minDays = 7;

        const nCheck = checkMinN(days, minDays);
        if (!nCheck.ok) {
            return {
                pattern,
                available: false,
                reason: 'min_days_required',
                minDaysRequired: minDays,
                daysProvided: Array.isArray(days) ? days.length : 0
            };
        }

        const dailySugar = [];
        const dailyConfidence = [];

        for (const day of days) {
            let sugar = 0;
            let confWeighted = 0;

            eachMealItem(day, (item) => {
                const prod = resolveProduct(item, pIndex);
                if (!prod) return;

                const grams = Number(item.grams) || 0;
                const factor = grams / 100;
                const simple = (Number(prod.simple100) || 0) * factor;

                let addedSugar = 0;
                let conf = 0;

                const sugar100 = Number(prod.sugar100);
                if (Number.isFinite(sugar100) && sugar100 > 0) {
                    addedSugar = sugar100 * factor;
                    conf = 1.0;
                } else if (Number(prod.nova_group) === 4 && simple > 0) {
                    addedSugar = simple * 0.70;
                    conf = 0.70;
                } else if (simple > 0) {
                    addedSugar = simple * 0.30;
                    conf = 0.50;
                }

                sugar += addedSugar;
                confWeighted += addedSugar * conf;
            });

            dailySugar.push(sugar);
            dailyConfidence.push(sugar > 0 ? confWeighted / sugar : 0);
        }

        const avgDailySugar = average(dailySugar);
        const avgConfidence = average(dailyConfidence);

        let maxStreak = 0;
        let streak = 0;
        dailySugar.forEach((s) => {
            if (s > 25) {
                streak++;
                maxStreak = Math.max(maxStreak, streak);
            } else {
                streak = 0;
            }
        });

        const dependencyPenalty = maxStreak >= 5 ? 20 : (maxStreak >= 3 ? 10 : 0);
        const sugarPenalty = Math.max(0, avgDailySugar - 25) * 1.5;
        const score = Math.round(Math.max(0, 100 - sugarPenalty - dependencyPenalty) * (avgConfidence || 0.5));

        return {
            pattern,
            available: true,
            avgDailySugar: Math.round(avgDailySugar * 10) / 10,
            avgConfidence: Math.round(avgConfidence * 100) / 100,
            maxStreak,
            dependencyRisk: maxStreak >= 5,
            score,
            confidence: Math.round(applySmallSamplePenalty(0.7, days.length, minDays) * 100) / 100,
            insight: maxStreak >= 5
                ? `🔴 Избыточный сахар ${avgDailySugar.toFixed(1)}г/день, streak ${maxStreak} дней`
                : avgDailySugar > 25
                    ? `🟡 Сахар в зоне внимания: ${avgDailySugar.toFixed(1)}г/день`
                    : `✅ Добавленный сахар под контролем: ${avgDailySugar.toFixed(1)}г/день`
        };
    }

    /**
     * C17: Bone Health index.
     * @param {Array} days - Days to analyze.
     * @param {object} profile - User profile.
     * @param {object} pIndex - Product index.
     * @returns {object} Pattern result.
     */
    function analyzeBoneHealth(days, profile, pIndex) {
        const pattern = PATTERNS.BONE_HEALTH || 'bone_health';
        const minDays = 14;

        const nCheck = checkMinN(days, minDays);
        if (!nCheck.ok) {
            return { pattern, available: false, reason: 'min_days_required' };
        }

        const isFemale = profile?.gender === 'female' || profile?.gender === 'Женской';
        const age = Number(profile?.age) || 0;
        const vitKTarget = isFemale ? 90 : 120;
        const riskPenalty = isFemale && age > 55 ? 12 : (isFemale && age > 45 ? 6 : 0);
        const targetMultiplier = riskPenalty > 0 ? 1.2 : 1.0;

        let caSum = 0;
        let dSum = 0;
        let kSum = 0;
        let pSum = 0;
        let strengthDays = 0;

        for (const day of days) {
            eachMealItem(day, (item) => {
                const prod = resolveProduct(item, pIndex);
                if (!prod) return;

                const grams = Number(item.grams) || 0;
                const factor = grams / 100;
                caSum += (Number(prod.calcium) || 0) * factor;
                dSum += (Number(prod.vitamin_d) || 0) * factor;
                kSum += (Number(prod.vitamin_k) || 0) * factor;
                pSum += (Number(prod.phosphorus) || 0) * factor;
            });

            if ((day.trainings || []).some(t => t?.type === 'strength')) strengthDays++;
        }

        const avgCa = caSum / days.length;
        const avgD = dSum / days.length;
        const avgK = kSum / days.length;
        const avgP = pSum / days.length;

        const caPct = Math.min(1, avgCa / (1000 * targetMultiplier)) * 35;
        const dPct = Math.min(1, avgD / (15 * targetMultiplier)) * 25;
        const kPct = Math.min(1, avgK / (vitKTarget * targetMultiplier)) * 15;
        const pPct = Math.min(1, avgP / (700 * targetMultiplier)) * 10;

        const caPRatio = avgP > 0 ? avgCa / avgP : 0;

        let ratioBonus = 0;
        if (caPRatio >= 1.0 && caPRatio <= 2.0) ratioBonus = 10;
        else if (caPRatio < 0.5) ratioBonus = -15;
        else if (caPRatio > 3.0) ratioBonus = -5;

        const exerciseBonus = strengthDays >= 6 ? 10 : (strengthDays >= 4 ? 5 : 0);
        const score = Math.max(0, Math.min(100, Math.round(caPct + dPct + kPct + pPct + ratioBonus + exerciseBonus - riskPenalty)));

        return {
            pattern,
            available: true,
            avgCa: Math.round(avgCa),
            avgVitD: Math.round(avgD * 10) / 10,
            avgVitK: Math.round(avgK),
            avgPhosphorus: Math.round(avgP),
            caPRatio: Math.round(caPRatio * 100) / 100,
            strengthDays,
            riskPenalty,
            score,
            confidence: Math.round(applySmallSamplePenalty(0.7, days.length, minDays) * 100) / 100,
            insight: score >= 80
                ? `✅ Костный профиль хороший (${score}/100)`
                : score >= 60
                    ? `🟡 Умеренный риск по костному профилю (${score}/100)`
                    : `🔴 Высокий риск дефицита костной поддержки (${score}/100)`
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeMicronutrients = analyzeMicronutrients;
    HEYS.InsightsPI.patternModules.analyzeVitaminDefense = analyzeVitaminDefense;
    HEYS.InsightsPI.patternModules.analyzeBComplexAnemia = analyzeBComplexAnemia;
    HEYS.InsightsPI.patternModules.analyzeAddedSugarDependency = analyzeAddedSugarDependency;
    HEYS.InsightsPI.patternModules.analyzeBoneHealth = analyzeBoneHealth;
})(typeof window !== 'undefined' ? window : global);
