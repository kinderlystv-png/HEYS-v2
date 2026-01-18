// heys_day_meals_bundle_v1.js — bundled day meals modules (meal quality, add product, optimizer, meals UI, diary, orphan alert)

// ===== Begin day/_meal_quality.js =====
// day/_meal_quality.js — consolidated meal scoring + quality popup

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const ReactDOM = global.ReactDOM;
    const M = HEYS.models || {};
    const U = HEYS.dayUtils || {};

    // Import utility functions from dayUtils
    const getProductFromItem = U.getProductFromItem || (() => null);
    const parseTime = U.parseTime || ((t) => { if (!t || typeof t !== 'string' || !t.includes(':')) return null; const [hh, mm] = t.split(':').map((x) => parseInt(x, 10)); if (isNaN(hh) || isNaN(mm)) return null; return { hh: Math.max(0, Math.min(23, hh)), mm: Math.max(0, Math.min(59, mm)) }; });

    const MEAL_KCAL_LIMITS = {
        light: { max: 200 },
        normal: { max: 600 },
        heavy: { max: 800 },
        excess: { max: 1000 },
    };

    const IDEAL_MACROS_UNIFIED = {
        protPct: 0.25,
        carbPct: 0.45,
        fatPct: 0.30,
        minProtLight: 10,
        minProtNormal: 15,
    };

    const CIRCADIAN_MEAL_BONUS = {
        morning: { from: 6, to: 10, bonus: 3, desc: '🌅 Утро — лучшее время' },
        midday: { from: 10, to: 14, bonus: 2, desc: '🌞 Обеденное время' },
        afternoon: { from: 14, to: 18, bonus: 0, desc: 'Дневное время' },
        evening: { from: 18, to: 21, bonus: 0, desc: 'Вечер' },
        lateEvening: { from: 21, to: 23, bonus: -1, desc: '⏰ Поздний вечер' },
        night: { from: 23, to: 6, bonus: -3, desc: '🌙 Ночь' },
    };

    const LIQUID_FOOD_PATTERNS = [
        /сок\b/i, /\bсока\b/i, /\bсоки\b/i,
        /смузи/i, /коктейль/i, /shake/i,
        /йогурт.*питьевой/i, /питьевой.*йогурт/i,
        /бульон/i, /суп.*пюре/i, /крем.*суп/i,
        /кола/i, /пепси/i, /фанта/i, /спрайт/i, /лимонад/i, /газировка/i,
        /энергетик/i, /energy/i,
        /протеин.*коктейль/i, /protein.*shake/i,
    ];

    const HEALTHY_LIQUID_PATTERNS = [
        /кефир/i, /ряженка/i, /айран/i, /тан\b/i,
        /молоко/i, /простокваша/i, /варенец/i,
        /протеин/i, /protein/i,
    ];

    const LIQUID_FOOD_PENALTY = 5;

    const GL_QUALITY_THRESHOLDS = {
        veryLow: { max: 5, bonus: 3, desc: 'Минимальный инсулиновый ответ' },
        low: { max: 10, bonus: 2, desc: 'Низкий инсулиновый ответ' },
        medium: { max: 20, bonus: 0, desc: 'Умеренный ответ' },
        high: { max: 30, bonus: -2, desc: 'Высокий ответ' },
        veryHigh: { max: Infinity, bonus: -4, desc: 'Очень высокий ответ' },
    };

    function isLiquidFood(productName, category) {
        if (!productName) return false;
        const name = String(productName);
        const cat = String(category || '');

        for (const pattern of HEALTHY_LIQUID_PATTERNS) {
            if (pattern.test(name)) return false;
        }

        if (['Напитки', 'Соки', 'Молочные напитки'].includes(cat)) {
            if (cat === 'Молочные напитки') {
                for (const pattern of HEALTHY_LIQUID_PATTERNS) {
                    if (pattern.test(name)) return false;
                }
            }
            return true;
        }

        for (const pattern of LIQUID_FOOD_PATTERNS) {
            if (pattern.test(name)) return true;
        }

        return false;
    }

    function calculateMealGL(avgGI, totalCarbs) {
        if (!avgGI || !totalCarbs) return 0;
        return (avgGI * totalCarbs) / 100;
    }

    function getCircadianBonus(hour) {
        for (const [period, config] of Object.entries(CIRCADIAN_MEAL_BONUS)) {
            if (config.from <= config.to) {
                if (hour >= config.from && hour < config.to) {
                    return { bonus: config.bonus, period, desc: config.desc };
                }
            } else {
                if (hour >= config.from || hour < config.to) {
                    return { bonus: config.bonus, period, desc: config.desc };
                }
            }
        }
        return { bonus: 0, period: 'afternoon', desc: 'Дневное время' };
    }

    function getGLQualityBonus(gl) {
        for (const [level, config] of Object.entries(GL_QUALITY_THRESHOLDS)) {
            if (gl <= config.max) {
                return { bonus: config.bonus, level, desc: config.desc };
            }
        }
        return { bonus: -4, level: 'veryHigh', desc: 'Очень высокий ответ' };
    }

    const MEAL_KCAL_DISTRIBUTION = {
        breakfast: { minPct: 0.15, maxPct: 0.35 },
        snack1: { minPct: 0.05, maxPct: 0.25 },
        lunch: { minPct: 0.25, maxPct: 0.40 },
        snack2: { minPct: 0.05, maxPct: 0.25 },
        dinner: { minPct: 0.15, maxPct: 0.35 },
        snack3: { minPct: 0.02, maxPct: 0.15 },
        night: { minPct: 0.00, maxPct: 0.15 },
    };
    const MEAL_KCAL_ABSOLUTE = MEAL_KCAL_LIMITS;
    const IDEAL_MACROS = {
        breakfast: IDEAL_MACROS_UNIFIED,
        lunch: IDEAL_MACROS_UNIFIED,
        dinner: IDEAL_MACROS_UNIFIED,
        snack: IDEAL_MACROS_UNIFIED,
        night: IDEAL_MACROS_UNIFIED,
    };

    const safeRatio = (num, denom, fallback = 0.5) => {
        const n = +num || 0;
        const d = +denom || 0;
        if (d <= 0) return fallback;
        return n / d;
    };

    const NUTRIENT_COLORS = {
        good: '#16a34a',
        medium: '#ca8a04',
        bad: '#dc2626',
    };

    function getNutrientColor(nutrient, value, totals = {}) {
        const v = +value || 0;
        const { kcal = 0, carbs = 0, simple = 0, complex = 0, prot = 0, fat = 0, bad = 0, good = 0, trans = 0, fiber = 0 } = totals;

        switch (nutrient) {
            case 'kcal':
                if (v <= 0) return null;
                if (v <= 150) return NUTRIENT_COLORS.good;
                if (v <= 500) return null;
                if (v <= 700) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'carbs':
                if (v <= 0) return null;
                if (v <= 60) return NUTRIENT_COLORS.good;
                if (v <= 100) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'simple':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 10) return NUTRIENT_COLORS.good;
                if (v <= 25) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'complex':
                if (v <= 0) return null;
                if (v >= 30 && carbs > 0 && v / carbs >= 0.7) return NUTRIENT_COLORS.good;
                return null;
            case 'simple_complex_ratio': {
                if (carbs <= 5) return null;
                const simpleRatio = simple / carbs;
                if (simpleRatio <= 0.3) return NUTRIENT_COLORS.good;
                if (simpleRatio <= 0.5) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            }
            case 'prot':
                if (v <= 0) return null;
                if (v >= 20 && v <= 40) return NUTRIENT_COLORS.good;
                if (v >= 10 && v <= 50) return null;
                if (v < 10 && kcal > 200) return NUTRIENT_COLORS.medium;
                if (v > 50) return NUTRIENT_COLORS.medium;
                return null;
            case 'fat':
                if (v <= 0) return null;
                if (v <= 20) return NUTRIENT_COLORS.good;
                if (v <= 35) return null;
                if (v <= 50) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'bad':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 5) return null;
                if (v <= 10) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'good':
                if (fat <= 0) return null;
                if (v >= fat * 0.6) return NUTRIENT_COLORS.good;
                if (v >= fat * 0.4) return null;
                return NUTRIENT_COLORS.medium;
            case 'trans':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 0.5) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'fat_ratio': {
                if (fat <= 3) return null;
                const goodRatio = good / fat;
                const badRatio = bad / fat;
                if (goodRatio >= 0.6 && trans <= 0) return NUTRIENT_COLORS.good;
                if (badRatio > 0.5 || trans > 0.5) return NUTRIENT_COLORS.bad;
                return NUTRIENT_COLORS.medium;
            }
            case 'fiber':
                if (v <= 0) return null;
                if (v >= 8) return NUTRIENT_COLORS.good;
                if (v >= 4) return null;
                if (kcal > 300 && v < 2) return NUTRIENT_COLORS.medium;
                return null;
            case 'gi':
                if (v <= 0 || carbs <= 5) return null;
                if (v <= 40) return NUTRIENT_COLORS.good;
                if (v <= 55) return NUTRIENT_COLORS.good;
                if (v <= 70) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'harm':
                if (v <= 0) return NUTRIENT_COLORS.good;
                if (v <= 2) return NUTRIENT_COLORS.good;
                if (v <= 4) return null;
                if (v <= 6) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            default:
                return null;
        }
    }

    function getNutrientTooltip(nutrient, value, totals = {}) {
        const v = +value || 0;
        const { kcal = 0, carbs = 0, simple = 0, fat = 0, bad = 0, good = 0, trans = 0 } = totals;

        switch (nutrient) {
            case 'kcal':
                if (v <= 0) return 'Нет калорий';
                if (v <= 150) return '✅ Лёгкий приём (≤150 ккал)';
                if (v <= 500) return 'Нормальный приём';
                if (v <= 700) return '⚠️ Много для одного приёма (500-700 ккал)';
                return '❌ Переедание (>700 ккал за раз)';
            case 'carbs':
                if (v <= 0) return 'Без углеводов';
                if (v <= 60) return '✅ Умеренно углеводов (≤60г)';
                if (v <= 100) return '⚠️ Много углеводов (60-100г)';
                return '❌ Очень много углеводов (>100г)';
            case 'simple':
                if (v <= 0) return '✅ Без простых углеводов — идеально!';
                if (v <= 10) return '✅ Минимум простых (≤10г)';
                if (v <= 25) return '⚠️ Терпимо простых (10-25г)';
                return '❌ Много сахара (>25г) — инсулиновый скачок';
            case 'complex':
                if (v <= 0) return 'Без сложных углеводов';
                if (carbs > 0 && v / carbs >= 0.7) return '✅ Отлично! Сложных ≥70%';
                return 'Сложные углеводы';
            case 'prot':
                if (v <= 0) return 'Без белка';
                if (v >= 20 && v <= 40) return '✅ Оптимум белка (20-40г)';
                if (v < 10 && kcal > 200) return '⚠️ Мало белка для сытного приёма';
                if (v > 50) return '⚠️ Много белка (>50г) — избыток не усвоится';
                return 'Белок в норме';
            case 'fat':
                if (v <= 0) return 'Без жиров';
                if (v <= 20) return '✅ Умеренно жиров (≤20г)';
                if (v <= 35) return 'Жиры в норме';
                if (v <= 50) return '⚠️ Много жиров (35-50г)';
                return '❌ Очень много жиров (>50г)';
            case 'bad':
                if (v <= 0) return '✅ Без вредных жиров — отлично!';
                if (v <= 5) return 'Минимум вредных жиров';
                if (v <= 10) return '⚠️ Терпимо вредных жиров (5-10г)';
                return '❌ Много вредных жиров (>10г)';
            case 'good':
                if (fat <= 0) return 'Нет жиров';
                if (v >= fat * 0.6) return '✅ Полезных жиров ≥60%';
                if (v >= fat * 0.4) return 'Полезные жиры в норме';
                return '⚠️ Мало полезных жиров (<40%)';
            case 'trans':
                if (v <= 0) return '✅ Без транс-жиров — идеально!';
                if (v <= 0.5) return '⚠️ Есть транс-жиры (≤0.5г)';
                return '❌ Транс-жиры опасны (>0.5г)';
            case 'fiber':
                if (v <= 0) return 'Без клетчатки';
                if (v >= 8) return '✅ Отлично! Много клетчатки (≥8г)';
                if (v >= 4) return 'Клетчатка в норме';
                if (kcal > 300 && v < 2) return '⚠️ Мало клетчатки для сытного приёма';
                return 'Клетчатка';
            case 'gi':
                if (carbs <= 5) return 'Мало углеводов — ГИ неважен';
                if (v <= 40) return '✅ Низкий ГИ (≤40) — медленные углеводы';
                if (v <= 55) return '✅ Умеренный ГИ (40-55)';
                if (v <= 70) return '⚠️ Средний ГИ (55-70) — инсулин повышен';
                return '❌ Высокий ГИ (>70) — быстрый сахар в крови';
            case 'harm':
                if (v <= 0) return '✅ Полезная еда';
                if (v <= 2) return '✅ Минимальный вред';
                if (v <= 4) return 'Умеренный вред';
                if (v <= 6) return '⚠️ Заметный вред (4-6)';
                return '❌ Вредная еда (>6)';
            default:
                return null;
        }
    }

    function getDailyNutrientColor(nutrient, fact, norm) {
        if (!norm || norm <= 0) return null;
        const pct = fact / norm;

        switch (nutrient) {
            case 'kcal':
                if (pct >= 0.90 && pct <= 1.10) return NUTRIENT_COLORS.good;
                if (pct >= 0.75 && pct <= 1.20) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'prot':
                if (pct >= 0.90 && pct <= 1.30) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'carbs':
                if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
                if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'simple':
                if (pct <= 0.80) return NUTRIENT_COLORS.good;
                if (pct <= 1.10) return null;
                if (pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'complex':
                if (pct >= 1.00) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return null;
                return NUTRIENT_COLORS.medium;
            case 'fat':
                if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
                if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'bad':
                if (pct <= 0.70) return NUTRIENT_COLORS.good;
                if (pct <= 1.00) return null;
                if (pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'good':
                if (pct >= 1.00) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return null;
                return NUTRIENT_COLORS.medium;
            case 'trans':
                if (pct <= 0.50) return NUTRIENT_COLORS.good;
                if (pct <= 1.00) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'fiber':
                if (pct >= 1.00) return NUTRIENT_COLORS.good;
                if (pct >= 0.70) return null;
                if (pct >= 0.40) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'gi':
                if (pct <= 0.80) return NUTRIENT_COLORS.good;
                if (pct <= 1.10) return null;
                if (pct <= 1.30) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            case 'harm':
                if (pct <= 0.50) return NUTRIENT_COLORS.good;
                if (pct <= 1.00) return null;
                if (pct <= 1.50) return NUTRIENT_COLORS.medium;
                return NUTRIENT_COLORS.bad;
            default:
                return null;
        }
    }

    function getDailyNutrientTooltip(nutrient, fact, norm) {
        if (!norm || norm <= 0) return 'Норма не задана';
        const pct = Math.round((fact / norm) * 100);
        const diff = fact - norm;
        const diffStr = diff >= 0 ? '+' + Math.round(diff) : Math.round(diff);

        const baseInfo = `${Math.round(fact)} из ${Math.round(norm)} (${pct}%)`;

        switch (nutrient) {
            case 'kcal':
                if (pct >= 90 && pct <= 110) return `✅ Калории в норме: ${baseInfo}`;
                if (pct < 90) return `⚠️ Недобор калорий: ${baseInfo}`;
                return `❌ Перебор калорий: ${baseInfo}`;
            case 'prot':
                if (pct >= 90) return `✅ Белок в норме: ${baseInfo}`;
                if (pct >= 70) return `⚠️ Маловато белка: ${baseInfo}`;
                return `❌ Мало белка: ${baseInfo}`;
            case 'carbs':
                if (pct >= 85 && pct <= 115) return `✅ Углеводы в норме: ${baseInfo}`;
                if (pct < 85) return `⚠️ Мало углеводов: ${baseInfo}`;
                return `⚠️ Много углеводов: ${baseInfo}`;
            case 'simple':
                if (pct <= 80) return `✅ Мало простых — отлично: ${baseInfo}`;
                if (pct <= 110) return `Простые углеводы: ${baseInfo}`;
                return `❌ Много простых углеводов: ${baseInfo}`;
            case 'complex':
                if (pct >= 100) return `✅ Достаточно сложных: ${baseInfo}`;
                return `Сложные углеводы: ${baseInfo}`;
            case 'fat':
                if (pct >= 85 && pct <= 115) return `✅ Жиры в норме: ${baseInfo}`;
                return `Жиры: ${baseInfo}`;
            case 'bad':
                if (pct <= 70) return `✅ Мало вредных жиров: ${baseInfo}`;
                if (pct <= 100) return `Вредные жиры: ${baseInfo}`;
                return `❌ Много вредных жиров: ${baseInfo}`;
            case 'good':
                if (pct >= 100) return `✅ Достаточно полезных жиров: ${baseInfo}`;
                return `Полезные жиры: ${baseInfo}`;
            case 'trans':
                if (pct <= 50) return `✅ Минимум транс-жиров: ${baseInfo}`;
                return `❌ Транс-жиры: ${baseInfo}`;
            case 'fiber':
                if (pct >= 100) return `✅ Достаточно клетчатки: ${baseInfo}`;
                if (pct >= 70) return `Клетчатка: ${baseInfo}`;
                return `⚠️ Мало клетчатки: ${baseInfo}`;
            case 'gi':
                if (pct <= 80) return `✅ Низкий средний ГИ: ${baseInfo}`;
                if (pct <= 110) return `Средний ГИ: ${baseInfo}`;
                return `⚠️ Высокий средний ГИ: ${baseInfo}`;
            case 'harm':
                if (pct <= 50) return `✅ Минимальный вред: ${baseInfo}`;
                if (pct <= 100) return `Вредность: ${baseInfo}`;
                return `❌ Высокая вредность: ${baseInfo}`;
            default:
                return baseInfo;
        }
    }

    function calcKcalScore(kcal, mealType, optimum, timeStr, activityContext = null) {
        let points = 30;
        let ok = true;
        const issues = [];

        const hasTrainingContext = activityContext &&
            (activityContext.type === 'peri' || activityContext.type === 'post' || activityContext.type === 'pre');

        const kcalBoost = hasTrainingContext
            ? (activityContext.type === 'peri' ? 1.6 :
                activityContext.type === 'post' ? 1.4 : 1.2)
            : 1.0;

        const adjustedLimit = 800 * kcalBoost;
        const adjustedOvereatLimit = 1000 * kcalBoost;

        if (kcal > adjustedLimit) {
            const excess = (kcal - adjustedLimit) / 200;
            const penalty = Math.min(15, Math.round(excess * 5));
            points -= penalty;
            ok = false;
            issues.push(hasTrainingContext ? 'много для восстановления' : 'много ккал');
        }

        if (kcal > adjustedOvereatLimit) {
            points -= 10;
            issues.push('переедание');
        }

        const nightPenaltyOverride = activityContext?.nightPenaltyOverride === true;

        const parsed = parseTime(timeStr || '');
        if (parsed && !nightPenaltyOverride) {
            const hour = parsed.hh;

            if (hour >= 23 || hour < 5) {
                if (kcal > 300) {
                    const nightPenalty = Math.min(10, Math.round((kcal - 300) / 100));
                    points -= nightPenalty;
                    ok = false;
                    issues.push('ночь');
                }
                if (kcal > 700) {
                    points -= 5;
                    issues.push('тяжёлая еда ночью');
                }
            } else if (hour >= 21 && kcal > 500) {
                const latePenalty = Math.min(5, Math.round((kcal - 500) / 150));
                points -= latePenalty;
                issues.push('поздно');
            }
        }

        if (hasTrainingContext && kcal >= 300 && kcal <= adjustedLimit) {
            points += 2;
        }

        return {
            points: Math.max(0, Math.min(32, points)),
            ok,
            issues,
            trainingContextApplied: hasTrainingContext,
        };
    }

    function calcMacroScore(prot, carbs, fat, kcal, mealType, timeStr, activityContext = null) {
        const ideal = IDEAL_MACROS_UNIFIED;
        let points = 20;
        let proteinOk = true;
        const issues = [];

        const hasTrainingContext = activityContext &&
            (activityContext.type === 'peri' || activityContext.type === 'post' || activityContext.type === 'pre');

        const trainingMinProt = (activityContext?.type === 'post' || activityContext?.type === 'peri')
            ? 25 : ideal.minProtNormal;

        const minProt = kcal > 200
            ? (hasTrainingContext ? trainingMinProt : ideal.minProtNormal)
            : ideal.minProtLight;

        if (prot >= minProt) {
            points += 5;
            if (hasTrainingContext && prot >= 25) {
                points += 2;
            }
        } else if (kcal > 150) {
            const proteinPenalty = hasTrainingContext ? 7 : 5;
            points -= proteinPenalty;
            proteinOk = false;
            issues.push(hasTrainingContext ? 'мало белка для восстановления' : 'мало белка');
        }

        const maxProtThreshold = hasTrainingContext ? 80 : 60;
        if (prot > maxProtThreshold) {
            points -= 2;
            issues.push('много белка');
        }

        if (kcal > 0) {
            const protPct = (prot * 4) / kcal;
            const carbPct = (carbs * 4) / kcal;
            const fatPct = (fat * 9) / kcal;
            const deviation = Math.abs(protPct - ideal.protPct) + Math.abs(carbPct - ideal.carbPct) + Math.abs(fatPct - ideal.fatPct);
            points -= Math.min(10, Math.round(deviation * 15));

            const nightCarbsAllowed = activityContext?.type === 'post' && activityContext?.trainingRef?.intensity === 'high';
            const parsed = parseTime(timeStr || '');
            if (parsed && parsed.hh >= 20 && carbPct > 0.50 && !nightCarbsAllowed) {
                points -= 5;
                issues.push('углеводы вечером');
            }
        }

        return {
            points: Math.max(0, Math.min(27, points)),
            proteinOk,
            issues,
            trainingContextApplied: hasTrainingContext,
        };
    }

    function calcCarbQuality(simple, complex, context = {}) {
        const total = simple + complex;
        const simpleRatio = safeRatio(simple, total, 0.5);

        const {
            avgGI = 50,
            mealGL = 10,
            protein = 0,
            fat = 0,
            fiber = 0,
            hasDairy = false,
        } = context;

        let points = 15;
        let ok = true;
        const adjustments = [];

        let basePoints = 15;
        if (simpleRatio <= 0.30) {
            basePoints = 15;
        } else if (simpleRatio <= 0.50) {
            basePoints = 10;
        } else if (simpleRatio <= 0.70) {
            basePoints = 5;
        } else {
            basePoints = 0;
        }

        points = basePoints;

        if (total < 10) {
            const boost = Math.round((15 - basePoints) * 0.9);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'lowCarbs', boost, reason: `Углеводов мало (${total.toFixed(0)}г)` });
            }
        } else if (total < 20) {
            const boost = Math.round((15 - basePoints) * 0.6);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'moderateLowCarbs', boost, reason: `Углеводов немного (${total.toFixed(0)}г)` });
            }
        } else if (total < 30) {
            const boost = Math.round((15 - basePoints) * 0.3);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'mediumCarbs', boost, reason: `Углеводов умеренно (${total.toFixed(0)}г)` });
            }
        }

        if (avgGI < 55 && simpleRatio > 0.30) {
            const giCompensation = avgGI < 40 ? 0.5 : avgGI < 50 ? 0.35 : 0.2;
            const lostPoints = 15 - basePoints;
            const boost = Math.round(lostPoints * giCompensation);
            if (boost > 0) {
                points += boost;
                adjustments.push({ factor: 'lowGI', boost, reason: `Низкий ГИ (${avgGI.toFixed(0)}) компенсирует` });
            }
        }

        if (mealGL < 10 && simpleRatio > 0.30) {
            const boost = Math.round((15 - basePoints) * 0.4);
            if (boost > 0 && !adjustments.find((a) => a.factor === 'lowGI')) {
                points += boost;
                adjustments.push({ factor: 'lowGL', boost, reason: `Низкая GL (${mealGL.toFixed(1)})` });
            }
        }

        if (hasDairy && simpleRatio > 0.50) {
            const boost = 3;
            points += boost;
            adjustments.push({ factor: 'dairy', boost, reason: 'Молочные углеводы (лактоза)' });
        }

        if (protein >= 25 && simpleRatio > 0.30) {
            const boost = 2;
            points += boost;
            adjustments.push({ factor: 'highProtein', boost, reason: `Высокий белок (${protein.toFixed(0)}г) замедляет усвоение` });
        } else if (protein >= 15 && simpleRatio > 0.50) {
            const boost = 1;
            points += boost;
            adjustments.push({ factor: 'moderateProtein', boost, reason: `Белок (${protein.toFixed(0)}г) смягчает эффект` });
        }

        if (fiber >= 5 && simpleRatio > 0.30) {
            const boost = 2;
            points += boost;
            adjustments.push({ factor: 'highFiber', boost, reason: `Клетчатка (${fiber.toFixed(0)}г) замедляет усвоение` });
        } else if (fiber >= 2 && simpleRatio > 0.50) {
            const boost = 1;
            points += boost;
            adjustments.push({ factor: 'moderateFiber', boost, reason: 'Клетчатка смягчает эффект' });
        }

        if (fat >= 10 && simpleRatio > 0.40 && avgGI < 60) {
            const boost = 1;
            points += boost;
            adjustments.push({ factor: 'fatSlowdown', boost, reason: 'Жиры замедляют усвоение углеводов' });
        }

        points = Math.max(0, Math.min(15, points));
        ok = simpleRatio <= 0.35 || points >= 10;

        return {
            points,
            simpleRatio,
            ok,
            basePoints,
            adjustments,
            contextUsed: Object.keys(context).length > 0,
        };
    }

    function calcFatQuality(bad, good, trans) {
        const total = bad + good + trans;
        const goodRatio = safeRatio(good, total, 0.5);
        const badRatio = safeRatio(bad, total, 0.5);

        let points = 15;
        let ok = true;

        const isLowFat = total < 5;

        if (goodRatio >= 0.60) {
            points = 15;
        } else if (goodRatio >= 0.40) {
            points = 10;
        } else {
            points = isLowFat ? 10 : 5;
            ok = isLowFat ? true : false;
        }

        if (badRatio > 0.50 && !isLowFat) {
            points -= 5;
            ok = false;
        }

        const transRatio = total > 0 ? trans / total : 0;
        if (trans > 1 || (transRatio > 0.02 && trans > 0.3)) {
            points -= 5;
            ok = false;
        }

        return { points: Math.max(0, points), goodRatio, badRatio, ok };
    }

    function calcGiHarmScore(avgGI, avgHarm) {
        let points = 15;
        let ok = true;
        let harmPenalty = 0;

        if (avgGI <= 55) {
            points = 15;
        } else if (avgGI <= 70) {
            points = 10;
        } else {
            points = 5;
            ok = false;
        }

        if (avgHarm > 5) {
            if (avgHarm <= 10) {
                harmPenalty = Math.round((avgHarm - 5) / 2.5);
            } else if (avgHarm <= 20) {
                harmPenalty = 2 + Math.round((avgHarm - 10) / 3.3);
            } else if (avgHarm <= 40) {
                harmPenalty = 5 + Math.round((avgHarm - 20) / 4);
            } else {
                harmPenalty = 10 + Math.min(5, Math.round((avgHarm - 40) / 10));
            }

            points -= Math.min(15, harmPenalty);
            ok = avgHarm <= 15;
        }

        return { points: Math.max(0, points), ok, harmPenalty };
    }

    function getMealQualityScore(meal, mealType, optimum, pIndex, activityContext) {
        if (!meal?.items || meal.items.length === 0) return null;

        const opt = optimum > 0 ? optimum : 2000;
        const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };

        const harmMultiplier = activityContext?.harmMultiplier ?? 1;

        let gramSum = 0; let carbSum = 0; let giSum = 0; let harmSum = 0;
        let hasDairy = false;

        (meal.items || []).forEach((it) => {
            const p = getProductFromItem(it, pIndex) || {};
            const g = +it.grams || 0;
            if (!g) return;

            const name = (p.name || '').toLowerCase();
            const category = (p.category || '').toLowerCase();
            if (
                category.includes('молоч') || category.includes('dairy') ||
                name.includes('молок') || name.includes('творог') || name.includes('кефир') ||
                name.includes('йогурт') || name.includes('сметан') || name.includes('сливк') ||
                name.includes('сыр') || name.includes('ряженк') || name.includes('простокваш') ||
                name.includes('milk') || name.includes('cheese') || name.includes('yogurt')
            ) {
                hasDairy = true;
            }

            const simple100 = +p.simple100 || 0;
            const complex100 = +p.complex100 || 0;
            const itemCarbs = (simple100 + complex100) * g / 100;

            const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? 50;
            const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? 0;

            gramSum += g;
            carbSum += itemCarbs;
            giSum += gi * itemCarbs;
            harmSum += harm * g;
        });
        const avgGI = carbSum > 0 ? giSum / carbSum : 50;
        const rawAvgHarm = gramSum > 0 ? harmSum / gramSum : 0;

        const avgHarm = rawAvgHarm * harmMultiplier;
        const harmReduction = harmMultiplier < 1 ? Math.round((1 - harmMultiplier) * 100) : 0;

        const { kcal, prot, carbs, simple, complex, fat, bad, good, trans } = totals;
        let score = 0;
        const badges = [];

        const kcalScore = calcKcalScore(kcal, mealType, opt, meal.time, activityContext);
        score += kcalScore.points;
        if (!kcalScore.ok) badges.push({ type: 'К', ok: false });
        if (kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью')) {
            badges.push({ type: '🌙', ok: false, label: 'Поздно' });
        } else if (kcalScore.issues?.includes('поздно')) {
            badges.push({ type: '⏰', ok: false, label: 'Вечер' });
        }

        const macroScore = calcMacroScore(prot, carbs, fat, kcal, mealType, meal.time, activityContext);
        score += macroScore.points;
        if (!macroScore.proteinOk) badges.push({ type: 'Б', ok: false });
        if (macroScore.issues?.includes('углеводы вечером')) badges.push({ type: 'У⬇', ok: false, label: 'Угл вечером' });

        const mealGL = calculateMealGL(avgGI, totals.carbs || 0);

        const carbScore = calcCarbQuality(simple, complex, {
            avgGI,
            mealGL,
            protein: prot,
            fat,
            fiber: totals.fiber || 0,
            hasDairy,
        });
        score += carbScore.points;

        if (window.HEYS_DEBUG_CARB_SCORE) {
            // console.log('🔬 calcCarbQuality DEBUG:', {
            //   mealName: meal.name || 'Приём',
            //   simple, complex, total: simple + complex,
            //   simpleRatio: (simple / (simple + complex) * 100).toFixed(0) + '%',
            //   context: { avgGI: avgGI.toFixed(0), mealGL: mealGL.toFixed(1), protein: prot.toFixed(0), fat: fat.toFixed(0), fiber: (totals.fiber || 0).toFixed(0), hasDairy },
            //   result: carbScore
            // });
        }

        const fatScore = calcFatQuality(bad, good, trans);
        score += fatScore.points;
        if (trans > 0.5) badges.push({ type: 'ТЖ', ok: false });

        const giHarmScore = calcGiHarmScore(avgGI, avgHarm);
        score += giHarmScore.points;
        if (avgGI > 70) badges.push({ type: 'ГИ', ok: false });
        if (avgHarm > 10) badges.push({ type: 'Вр', ok: false });

        let bonusPoints = 0;
        const positiveBadges = [];

        const timeParsed = parseTime(meal.time || '');
        const hour = timeParsed?.hh || 12;

        const glBonus = getGLQualityBonus(mealGL);
        if (glBonus.bonus !== 0) {
            bonusPoints += glBonus.bonus;
            if (glBonus.bonus > 0) {
                positiveBadges.push({ type: '📉', ok: true, label: 'Низкая GL' });
            }
        }

        const circadian = getCircadianBonus(hour);
        if (circadian.bonus > 0 && kcal >= 200) {
            bonusPoints += circadian.bonus;
            if (circadian.period === 'morning') {
                positiveBadges.push({ type: '🌅', ok: true, label: 'Утренний приём' });
            } else if (circadian.period === 'midday') {
                positiveBadges.push({ type: '🌞', ok: true, label: 'Обеденное время' });
            }
        }

        let liquidKcal = 0;
        (meal.items || []).forEach((it) => {
            const p = getProductFromItem(it, pIndex) || {};
            const g = +it.grams || 0;
            if (!g) return;

            if (isLiquidFood(p.name, p.category)) {
                const itemKcal = (p.kcal100 || 0) * g / 100;
                liquidKcal += itemKcal;
            }
        });
        const liquidRatio = kcal > 0 ? liquidKcal / kcal : 0;
        if (liquidRatio > 0.5 && kcal >= 100) {
            bonusPoints -= LIQUID_FOOD_PENALTY;
            badges.push({ type: '🥤', ok: false, label: 'Жидкие калории' });
        }

        if (hour >= 18 && hour < 20 && kcal >= 200) {
            bonusPoints += 2;
            positiveBadges.push({ type: '🌇', ok: true, label: 'Ранний вечер' });
        }

        if (prot >= 20) {
            bonusPoints += 3;
            positiveBadges.push({ type: '🥛', ok: true, label: 'Белковый' });
        } else if (prot >= 15 && kcal <= 400) {
            bonusPoints += 2;
        }

        const fiber = totals.fiber || 0;
        if (fiber >= 5) {
            bonusPoints += 3;
            positiveBadges.push({ type: '🥗', ok: true, label: 'Клетчатка' });
        } else if (fiber >= 2) {
            bonusPoints += 1;
        }

        const itemCount = (meal.items || []).length;
        if (itemCount >= 4) {
            bonusPoints += 2;
            positiveBadges.push({ type: '🌈', ok: true, label: 'Разнообразие' });
        }

        const protCalRatio = kcal > 0 ? (prot * 4) / kcal : 0;
        if (protCalRatio >= 0.20 && protCalRatio <= 0.40 && prot >= 10) {
            bonusPoints += 2;
            positiveBadges.push({ type: '💪', ok: true, label: 'Белок' });
        }

        if (avgGI <= 50 && carbSum > 5) {
            bonusPoints += 2;
            positiveBadges.push({ type: '🎯', ok: true, label: 'Низкий ГИ' });
        }

        if (harmReduction > 0 && rawAvgHarm > 5) {
            const activityBonusPoints = Math.min(5, Math.round(harmReduction / 10));
            if (activityBonusPoints > 0) {
                bonusPoints += activityBonusPoints;
                positiveBadges.push({ type: activityContext?.badge || '🏋️', ok: true, label: `−${harmReduction}% вред` });
            }
        }

        if (activityContext && ['peri', 'post', 'pre'].includes(activityContext.type)) {
            const timingBonus = activityContext.type === 'peri' ? 3 :
                activityContext.type === 'post' ? 2 :
                    1;
            if (harmReduction === 0 || rawAvgHarm <= 5) {
                bonusPoints += timingBonus;
                positiveBadges.push({
                    type: activityContext.type === 'peri' ? '🔥' :
                        activityContext.type === 'post' ? '💪' : '⚡',
                    ok: true,
                    label: activityContext.type === 'peri' ? 'Во время трени' :
                        activityContext.type === 'post' ? 'После трени' : 'Перед трени',
                });
            }
        }

        const hasNightIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('поздно');
        if (hasNightIssue) {
            if (prot >= 25) {
                bonusPoints += 4;
                positiveBadges.push({ type: '🌙💪', ok: true, label: 'Белок ночью' });
            }
            if (avgGI <= 40) {
                bonusPoints += 3;
                positiveBadges.push({ type: '🌙🎯', ok: true, label: 'Низкий ГИ' });
            }
            if (simple < 15) {
                bonusPoints += 2;
            }
        }

        if (kcalScore.ok && macroScore.proteinOk && carbScore.ok && fatScore.ok && giHarmScore.ok) {
            bonusPoints += 3;
            positiveBadges.push({ type: '⭐', ok: true, label: 'Баланс' });
        }

        score += Math.min(15, bonusPoints);

        const finalScore = Math.min(100, Math.round(score));

        const color = finalScore >= 80 ? '#22c55e' : finalScore >= 50 ? '#eab308' : '#ef4444';

        const timeIssue = kcalScore.issues?.includes('ночь') || kcalScore.issues?.includes('тяжёлая еда ночью');
        const lateIssue = kcalScore.issues?.includes('поздно');
        const timeOk = !timeIssue && !lateIssue;
        const timeValue = timeIssue ? '⚠️ ночь' : lateIssue ? 'поздно' : '✓';

        const details = [
            { label: 'Калории', value: Math.round(kcal) + ' ккал', ok: kcalScore.ok },
            { label: 'Время', value: timeValue, ok: timeOk },
            { label: 'Белок', value: Math.round(prot) + 'г', ok: macroScore.proteinOk },
            { label: 'Углеводы', value: carbScore.simpleRatio <= 0.3 ? 'сложные ✓' : Math.round(carbScore.simpleRatio * 100) + '% простых', ok: carbScore.ok },
            { label: 'Жиры', value: fatScore.goodRatio >= 0.6 ? 'полезные ✓' : Math.round(fatScore.goodRatio * 100) + '% полезных', ok: fatScore.ok },
            { label: 'ГИ', value: Math.round(avgGI), ok: avgGI <= 70 },
            { label: 'GL', value: Math.round(mealGL), ok: mealGL <= 20 },
            { label: 'Клетчатка', value: Math.round(fiber) + 'г', ok: fiber >= 2 },
            ...(harmReduction > 0 ? [{ label: 'Вред', value: `${Math.round(rawAvgHarm)} → ${Math.round(avgHarm)} (−${harmReduction}%)`, ok: avgHarm <= 10 }] : []),
        ];

        const allBadges = [...badges.slice(0, 2), ...positiveBadges.slice(0, 1)];

        return {
            score: finalScore,
            color,
            badges: allBadges.slice(0, 3),
            details,
            avgGI,
            avgHarm,
            rawAvgHarm: harmReduction > 0 ? rawAvgHarm : undefined,
            harmReduction: harmReduction > 0 ? harmReduction : undefined,
            fiber,
            bonusPoints,
            mealGL: Math.round(mealGL * 10) / 10,
            glLevel: glBonus.level,
            circadianPeriod: circadian.period,
            circadianBonus: circadian.bonus,
            liquidRatio: Math.round(liquidRatio * 100),
            activityContext: activityContext || undefined,
            carbScore,
        };
    }

    function renderMealQualityPopup(params) {
        if (!React || !ReactDOM) return null;

        const {
            mealQualityPopup,
            setMealQualityPopup,
            getSmartPopupPosition,
            createSwipeHandlers,
            pIndex,
            getMealType,
        } = params || {};

        if (!mealQualityPopup) return null;

        return ReactDOM.createPortal(
            (() => {
                const { meal, quality, mealTypeInfo, x, y } = mealQualityPopup;
                const popupW = 320;
                const popupH = 480;

                const pos = getSmartPopupPosition(x, y, popupW, popupH, { preferAbove: true, offset: 12, margin: 16 });
                const { left, top, arrowPos, showAbove } = pos;

                const getColor = (score) => {
                    if (score >= 80) return '#10b981';
                    if (score >= 60) return '#22c55e';
                    if (score >= 40) return '#eab308';
                    return '#ef4444';
                };
                const color = getColor(quality.score);

                const swipeHandlers = createSwipeHandlers(() => setMealQualityPopup(null));

                const getTotals = () => {
                    if (!meal?.items || meal.items.length === 0) return { kcal: 0, prot: 0, carbs: 0, simple: 0, complex: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
                    const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
                    return totals;
                };
                const totals = getTotals();

                const parseTimeH = (t) => {
                    if (!t) return 12;
                    const [h] = t.split(':').map(Number);
                    return h || 12;
                };
                const hour = parseTimeH(meal.time);

                const calcKcalDisplay = () => {
                    let points = 30;
                    const issues = [];
                    if (totals.kcal > 800) {
                        const penalty = Math.min(15, Math.round((totals.kcal - 800) / 200 * 5));
                        points -= penalty;
                        issues.push('>' + 800 + ' ккал: -' + penalty);
                    }
                    if (totals.kcal > 1000) {
                        points -= 10;
                        issues.push('переедание: -10');
                    }
                    if ((hour >= 23 || hour < 5) && totals.kcal > 300) {
                        const nightPenalty = Math.min(10, Math.round((totals.kcal - 300) / 100));
                        points -= nightPenalty;
                        issues.push('ночь: -' + nightPenalty);
                    } else if (hour >= 21 && totals.kcal > 500) {
                        const latePenalty = Math.min(5, Math.round((totals.kcal - 500) / 150));
                        points -= latePenalty;
                        issues.push('поздно: -' + latePenalty);
                    }
                    return { points: Math.max(0, points), max: 30, issues };
                };

                const calcMacroDisplay = () => {
                    let points = 20;
                    const issues = [];
                    const minProt = totals.kcal > 200 ? 15 : 10;
                    if (totals.prot >= minProt) {
                        points += 5;
                        issues.push('белок ≥' + minProt + 'г: +5');
                    } else if (totals.kcal > 300) {
                        points -= 5;
                        issues.push('белок <' + minProt + 'г: -5');
                    }
                    if (totals.prot > 50) {
                        points -= 3;
                        issues.push('белок >' + 50 + 'г: -3');
                    }
                    if (totals.kcal > 0) {
                        const protPct = (totals.prot * 4) / totals.kcal;
                        const carbPct = (totals.carbs * 4) / totals.kcal;
                        const fatPct = (totals.fat * 9) / totals.kcal;
                        const deviation = Math.abs(protPct - 0.25) + Math.abs(carbPct - 0.45) + Math.abs(fatPct - 0.30);
                        const devPenalty = Math.min(10, Math.round(deviation * 15));
                        if (devPenalty > 0) {
                            points -= devPenalty;
                            issues.push('отклонение БЖУ: -' + devPenalty);
                        }
                    }
                    return { points: Math.max(0, Math.min(25, points)), max: 25, issues };
                };

                const calcCarbDisplay = () => {
                    const total = totals.simple + totals.complex;
                    const simpleRatio = total > 0 ? totals.simple / total : 0.5;
                    const issues = [];

                    const carbScore = quality.carbScore;
                    let points = carbScore?.points ?? 0;

                    if (carbScore?.adjustments && carbScore.adjustments.length > 0) {
                        carbScore.adjustments.forEach((adj) => {
                            if (adj.points !== 0) {
                                issues.push(adj.reason + ': ' + (adj.points > 0 ? '+' : '') + adj.points);
                            }
                        });
                    } else {
                        if (simpleRatio <= 0.30) {
                            issues.push('простые ≤30%: ' + points);
                        } else if (points >= 12) {
                            issues.push('адаптивная оценка: ' + points + ' (молочка/низкий ГИ)');
                        } else if (points >= 8) {
                            issues.push('умеренный бонус: ' + points);
                        } else {
                            issues.push('базовый расчёт: ' + points);
                        }
                    }

                    return { points, max: 15, issues, simpleRatio: Math.round(simpleRatio * 100) };
                };

                const calcFatDisplay = () => {
                    const total = totals.bad + totals.good + totals.trans;
                    const goodRatio = total > 0 ? totals.good / total : 0.5;
                    let points = 15;
                    const issues = [];
                    if (goodRatio >= 0.60) {
                        points = 15;
                        issues.push('полезные ≥60%: 15');
                    } else if (goodRatio >= 0.40) {
                        points = 10;
                        issues.push('полезные 40-60%: 10');
                    } else {
                        points = 5;
                        issues.push('полезные <40%: 5');
                    }
                    if (totals.trans > 0.5) {
                        points -= 5;
                        issues.push('транс >' + 0.5 + 'г: -5');
                    }
                    return { points: Math.max(0, points), max: 15, issues, goodRatio: Math.round(goodRatio * 100) };
                };

                const calcGiDisplay = () => {
                    const avgGI = quality.avgGI || 50;
                    let points = 15;
                    const issues = [];
                    if (avgGI <= 55) {
                        points = 15;
                        issues.push('ГИ ≤55: 15');
                    } else if (avgGI <= 70) {
                        points = 10;
                        issues.push('ГИ 55-70: 10');
                    } else {
                        points = 5;
                        issues.push('ГИ >70: 5');
                    }
                    const avgHarm = quality.avgHarm || 0;
                    if (avgHarm > 5) {
                        const harmPenalty = Math.min(5, Math.round(avgHarm / 5));
                        points -= harmPenalty;
                        issues.push('вред: -' + harmPenalty);
                    }
                    return { points: Math.max(0, points), max: 15, issues };
                };

                const kcalCalc = calcKcalDisplay();
                const macroCalc = calcMacroDisplay();
                const carbCalc = calcCarbDisplay();
                const fatCalc = calcFatDisplay();
                const giCalc = calcGiDisplay();

                const baseScore = kcalCalc.points + macroCalc.points + carbCalc.points + fatCalc.points + giCalc.points;
                const bonusPoints = quality.bonusPoints || 0;

                const allCalcs = [
                    { id: 'kcal', ...kcalCalc, icon: '🔥', label: Math.round(totals.kcal) + ' ккал' },
                    { id: 'macro', ...macroCalc, icon: '🥩', label: 'Б' + Math.round(totals.prot) + ' У' + Math.round(totals.carbs) + ' Ж' + Math.round(totals.fat) },
                    { id: 'carb', ...carbCalc, icon: '🍬', label: carbCalc.simpleRatio + '% простых' },
                    { id: 'fat', ...fatCalc, icon: '🥑', label: fatCalc.goodRatio + '% полезных' },
                    { id: 'gi', ...giCalc, icon: '📈', label: 'ГИ ' + Math.round(quality.avgGI || 50) },
                ];
                const worstCalc = allCalcs.reduce((w, c) => (c.points / c.max) < (w.points / w.max) ? c : w, allCalcs[0]);
                const worstId = (worstCalc.points / worstCalc.max) < 0.8 ? worstCalc.id : null;

                const circadianBonus = quality.circadianBonus || 0;
                const circadianBonusPct = Math.round(circadianBonus * 100);

                const getDairyWarning = () => {
                    if (!meal?.items || !pIndex) return null;
                    const dairyPatterns = /молок|кефир|йогурт|творог|сыр|сливк|ряженк/i;
                    const dairyItems = meal.items.filter((item) => {
                        const p = getProductFromItem(item, pIndex);
                        return p && dairyPatterns.test(p.name || item.name || '');
                    });
                    if (dairyItems.length === 0) return null;
                    const totalDairyGrams = dairyItems.reduce((sum, it) => sum + (+it.grams || 0), 0);
                    if (totalDairyGrams < 100) return null;
                    return { count: dairyItems.length, grams: totalDairyGrams };
                };
                const dairyWarning = getDairyWarning();

                const mealGL = quality.mealGL || 0;
                const glLevel = quality.glLevel || 'medium';
                const circadianPeriod = quality.circadianPeriod || 'afternoon';
                const liquidRatio = quality.liquidRatio || 0;

                const glLevelRu = {
                    'very-low': 'очень низкая',
                    'low': 'низкая',
                    'medium': 'средняя',
                    'high': 'высокая',
                    'very-high': 'очень высокая',
                }[glLevel] || glLevel;

                const circadianPeriodRu = {
                    'morning': '🌅 утро (метаболизм ↑)',
                    'midday': '🌞 день (оптимально)',
                    'afternoon': '☀️ день',
                    'evening': '🌇 вечер',
                    'night': '🌙 ночь (метаболизм ↓)',
                }[circadianPeriod] || circadianPeriod;

                const getProductsList = () => {
                    if (!meal?.items || meal.items.length === 0) return [];
                    return meal.items.slice(0, 5).map((item) => {
                        const p = getProductFromItem(item, pIndex) || {};
                        const name = item.name || p.name || 'Продукт';
                        const grams = +item.grams || 0;
                        const kcal = Math.round((p.kcal100 || 0) * grams / 100);
                        return { name: name.length > 20 ? name.slice(0, 18) + '...' : name, grams, kcal };
                    });
                };
                const productsList = getProductsList();

                const getTip = () => {
                    if (!worstId) return { text: '✨ Отличный сбалансированный приём!', type: 'success', worstId: null };

                    const tips = {
                        kcal: { text: '💡 Следи за размером порций', type: 'warning' },
                        macro: { text: '💡 Добавь белок: яйца, курицу или творог', type: 'info' },
                        carb: { text: '💡 Замени сладкое на сложные углеводы (каши, овощи)', type: 'info' },
                        fat: { text: '💡 Добавь полезные жиры: орехи, авокадо, рыба', type: 'info' },
                        gi: { text: '💡 Выбирай продукты с низким ГИ (<55)', type: 'info' },
                    };

                    return { ...tips[worstId], worstId } || { text: '💡 Следующий раз будет лучше!', type: 'neutral', worstId: null };
                };

                const tip = getTip();

                const getYesterdayComparison = () => {
                    try {
                        const mealType = mealTypeInfo?.type || 'meal';
                        const today = new Date();
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayKey = yesterday.toISOString().split('T')[0];
                        const yesterdayDay = U.lsGet ? U.lsGet('heys_dayv2_' + yesterdayKey, null) : null;
                        if (!yesterdayDay?.meals?.length) return null;

                        const yesterdayMeal = yesterdayDay.meals.find((m, i) => {
                            const yType = getMealType(i, m, yesterdayDay.meals, pIndex);
                            return yType?.type === mealType;
                        });
                        if (!yesterdayMeal?.items?.length) return null;

                        const yQuality = getMealQualityScore(yesterdayMeal, mealType, params?.optimum || 2000, pIndex);
                        if (!yQuality) return null;

                        const diff = quality.score - yQuality.score;
                        if (Math.abs(diff) < 3) return { diff: 0, text: '≈ как вчера' };
                        if (diff > 0) return { diff, text: '+' + diff + ' vs вчера 📈' };
                        return { diff, text: diff + ' vs вчера 📉' };
                    } catch (e) {
                        return null;
                    }
                };
                const yesterdayComp = getYesterdayComparison();

                const CalcRow = ({ id, icon, label, points, max, isBonus, isWorst }) =>
                    React.createElement('div', {
                        style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 8px',
                            background: isBonus ? 'rgba(234, 179, 8, 0.1)' : (points === max ? 'rgba(16, 185, 129, 0.06)' : points < max * 0.5 ? 'rgba(239, 68, 68, 0.06)' : 'rgba(234, 179, 8, 0.06)'),
                            borderRadius: '6px',
                            marginBottom: '4px',
                            borderLeft: '3px solid ' + (isBonus ? '#b45309' : (points === max ? '#10b981' : points < max * 0.5 ? '#ef4444' : '#eab308')),
                            animation: isWorst ? 'pulse-worst 1.5s ease-in-out infinite' : 'none',
                            boxShadow: isWorst ? '0 0 0 2px rgba(239, 68, 68, 0.3)' : 'none',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
                            icon,
                            React.createElement('span', { style: { color: 'var(--text-secondary)' } }, label),
                            isWorst && React.createElement('span', { style: { fontSize: '10px', color: '#ef4444', marginLeft: '4px' } }, '← исправить'),
                        ),
                        React.createElement('span', {
                            style: {
                                fontWeight: 700,
                                fontSize: '12px',
                                color: isBonus ? '#b45309' : (points === max ? '#10b981' : points < max * 0.5 ? '#ef4444' : '#eab308'),
                            },
                        }, (isBonus && points > 0 ? '+' : '') + points + '/' + max),
                    );

                return React.createElement('div', {
                    className: 'metric-popup meal-quality-popup' + (showAbove ? ' above' : ''),
                    role: 'dialog',
                    'aria-modal': 'true',
                    style: {
                        position: 'fixed',
                        left: left + 'px',
                        top: top + 'px',
                        width: popupW + 'px',
                        maxHeight: 'calc(100vh - 32px)',
                        overflowY: 'auto',
                        zIndex: 10000,
                    },
                    onClick: (e) => e.stopPropagation(),
                    ...swipeHandlers,
                },
                    React.createElement('div', { className: 'metric-popup-stripe', style: { background: color } }),
                    React.createElement('div', { className: 'metric-popup-content', style: { padding: '12px' } },
                        React.createElement('div', { className: 'metric-popup-swipe' }),
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } },
                            React.createElement('span', { style: { fontSize: '14px', fontWeight: 600 } },
                                (mealTypeInfo?.icon || '🍽️') + ' ' + (mealTypeInfo?.label || meal.name || 'Приём'),
                            ),
                            React.createElement('div', { style: { flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' } },
                                React.createElement('div', { style: { width: quality.score + '%', height: '100%', background: color, transition: 'width 0.3s' } }),
                            ),
                            React.createElement('span', { style: { fontSize: '18px', fontWeight: 800, color: color } }, quality.score),
                            yesterdayComp && React.createElement('span', {
                                style: {
                                    fontSize: '10px',
                                    color: yesterdayComp.diff > 0 ? '#10b981' : yesterdayComp.diff < 0 ? '#ef4444' : 'var(--text-muted)',
                                    fontWeight: 600,
                                },
                            }, yesterdayComp.text),
                        ),
                        React.createElement('div', {
                            style: {
                                padding: '6px 10px',
                                background: tip.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : tip.type === 'warning' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '6px',
                                marginBottom: '10px',
                                fontSize: '12px',
                            },
                        }, tip.text),
                        allCalcs.map((calc) => CalcRow({
                            key: calc.id,
                            id: calc.id,
                            icon: calc.icon,
                            label: calc.label,
                            points: calc.points,
                            max: calc.max,
                            isWorst: calc.id === worstId,
                        })),
                        bonusPoints !== 0 && CalcRow({ id: 'bonus', icon: '⭐', label: 'Бонусы', points: bonusPoints, max: 15, isBonus: true }),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 10px',
                                background: color + '15',
                                borderRadius: '6px',
                                marginTop: '6px',
                                marginBottom: '8px',
                            },
                        },
                            React.createElement('span', { style: { fontWeight: 600, fontSize: '12px' } }, '∑ ИТОГО'),
                            React.createElement('span', { style: { fontWeight: 700, fontSize: '14px', color: color } },
                                baseScore + '+' + bonusPoints + ' = ' + quality.score,
                            ),
                        ),
                        (circadianBonusPct !== 0 || dairyWarning) && React.createElement('div', {
                            style: {
                                display: 'flex',
                                gap: '6px',
                                flexWrap: 'wrap',
                                marginBottom: '8px',
                                fontSize: '10px',
                            },
                        },
                            circadianBonusPct !== 0 && React.createElement('span', {
                                style: {
                                    padding: '3px 6px',
                                    borderRadius: '6px',
                                    background: circadianBonusPct > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: circadianBonusPct > 0 ? '#10b981' : '#ef4444',
                                    fontWeight: 600,
                                },
                            }, '🕐 ' + (circadianBonusPct > 0 ? '+' : '') + circadianBonusPct + '% (время суток)'),
                            dairyWarning && React.createElement('span', {
                                style: {
                                    padding: '3px 6px',
                                    borderRadius: '6px',
                                    background: 'rgba(234, 179, 8, 0.1)',
                                    color: '#b45309',
                                    fontWeight: 600,
                                },
                                title: 'Молочные продукты вызывают повышенный инсулиновый ответ (II ×2-3)',
                            }, '🥛 ' + dairyWarning.grams + 'г молочки → II↑'),
                        ),
                        React.createElement('div', { style: { display: 'flex', gap: '8px', fontSize: '11px', marginBottom: '8px' } },
                            React.createElement('div', { style: { flex: 1, padding: '6px', background: 'var(--bg-tertiary, #f3f4f6)', borderRadius: '6px' } },
                                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' } }, '🔬 Данные'),
                                React.createElement('div', null, 'GL: ' + glLevelRu),
                                React.createElement('div', null, circadianPeriodRu),
                                liquidRatio > 0.3 && React.createElement('div', { style: { color: '#f59e0b' } }, '💧 ' + Math.round(liquidRatio * 100) + '% жидкое'),
                            ),
                            productsList.length > 0 && React.createElement('div', { style: { flex: 1, padding: '6px', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' } },
                                React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' } }, '📋 Состав'),
                                productsList.slice(0, 3).map((p, i) => React.createElement('div', { key: i, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                                    p.name + ' ' + p.grams + 'г',
                                )),
                                meal.items && meal.items.length > 3 && React.createElement('div', { style: { color: 'var(--text-muted)' } }, '+' + (meal.items.length - 3) + ' ещё'),
                            ),
                        ),
                        (quality.badges && quality.badges.length > 0) && React.createElement('div', {
                            style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' },
                        },
                            quality.badges.slice(0, 4).map((badge, i) => {
                                const isPositive = badge.ok === true;
                                const badgeType = typeof badge === 'object' ? badge.type : String(badge);
                                return React.createElement('span', {
                                    key: i,
                                    style: {
                                        background: isPositive ? '#dcfce7' : '#fee2e2',
                                        color: isPositive ? '#166534' : '#dc2626',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        fontSize: '10px',
                                        fontWeight: 500,
                                    },
                                }, badgeType);
                            }),
                        ),
                        React.createElement('button', { className: 'metric-popup-close', 'aria-label': 'Закрыть', onClick: () => setMealQualityPopup(null) }, '✕'),
                    ),
                    React.createElement('div', { className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '') }),
                );
            })(),
            document.body,
        );
    }

    HEYS.mealScoring = {
        MEAL_KCAL_LIMITS,
        IDEAL_MACROS_UNIFIED,
        MEAL_KCAL_ABSOLUTE,
        IDEAL_MACROS,
        CIRCADIAN_MEAL_BONUS,
        LIQUID_FOOD_PATTERNS,
        HEALTHY_LIQUID_PATTERNS,
        LIQUID_FOOD_PENALTY,
        GL_QUALITY_THRESHOLDS,
        isLiquidFood,
        calculateMealGL,
        getCircadianBonus,
        getGLQualityBonus,
        calcKcalScore,
        calcMacroScore,
        calcCarbQuality,
        calcFatQuality,
        calcGiHarmScore,
        getMealQualityScore,
        getNutrientColor,
        getNutrientTooltip,
        getDailyNutrientColor,
        getDailyNutrientTooltip,
    };

    HEYS.dayMealQualityPopup = {
        renderMealQualityPopup,
    };
})(window);

// ===== End day/_meal_quality.js =====

// ===== Begin heys_day_add_product.js =====
// heys_day_add_product.js — MealAddProduct and ProductRow components for DayTab
// Extracted from heys_day_v12.js (Phase 2.3)
// Contains: MealAddProduct component, ProductRow component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Import utilities from dayUtils
    const U = HEYS.dayUtils || {};
    const uid = U.uid || (() => 'id_' + Date.now());
    const buildProductIndex = U.buildProductIndex || (() => ({}));
    const getProductFromItem = U.getProductFromItem || (() => null);
    const per100 = U.per100 || ((p) => ({ kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0, sodium100: 0 }));
    const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

    // === MealAddProduct Component (extracted for stable identity) ===
    const MealAddProduct = React.memo(function MealAddProduct({
        mi,
        products,
        date,
        day,
        setDay,
        isCurrentMeal = false
    }) {
        const handleOpenModal = React.useCallback(() => {
            try { navigator.vibrate?.(10); } catch (e) { }

            const meal = day?.meals?.[mi] || {};

            if (window.HEYS?.AddProductStep?.show) {
                window.HEYS.AddProductStep.show({
                    mealIndex: mi,
                    mealPhotos: meal.photos || [], // Текущие фото для счётчика
                    products,
                    dateKey: date,
                    onAdd: ({ product, grams, mealIndex }) => {
                        // 🌐 Если продукт из общей базы — автоматически клонируем в личную
                        let finalProduct = product;
                        if (product?._fromShared || product?._source === 'shared') {
                            // console.log('[DayTab] 🌐 Shared product detected, auto-cloning to local:', product.name);
                            const cloned = window.HEYS?.products?.addFromShared?.(product);
                            if (cloned) {
                                finalProduct = cloned;
                                // console.log('[DayTab] ✅ Cloned product id:', cloned.id);
                            }
                        }

                        // Проверка наличия нутриентов
                        const hasNutrients = !!(finalProduct?.kcal100 || finalProduct?.protein100 || finalProduct?.carbs100);

                        if (!hasNutrients) {
                            console.error('🚨 [DayTab] CRITICAL: Received product with NO nutrients!', finalProduct);
                        }

                        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
                        // TEF-aware kcal100: пересчитываем по формуле 3*protein + 4*carbs + 9*fat
                        // чтобы snapshot совпадал с UI (computeDerivedProduct)
                        const computeTEFKcal100 = (p) => {
                            const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
                            const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
                            return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
                        };

                        // Use centralized harm normalization
                        const harmValue = HEYS.models?.normalizeHarm?.(finalProduct);
                        const additivesList = Array.isArray(finalProduct.additives) ? finalProduct.additives : undefined;
                        const novaGroup = finalProduct.nova_group ?? finalProduct.novaGroup;
                        const nutrientDensity = finalProduct.nutrient_density ?? finalProduct.nutrientDensity;

                        const newItem = {
                            id: uid('it_'),
                            product_id: finalProduct.id ?? finalProduct.product_id,
                            name: finalProduct.name,
                            grams: grams || 100,
                            // Для новых продуктов сохраняем нутриенты напрямую (fallback если продукт не в индексе)
                            ...(finalProduct.kcal100 !== undefined && {
                                kcal100: computeTEFKcal100(finalProduct), // TEF-aware пересчёт
                                protein100: finalProduct.protein100,
                                carbs100: finalProduct.carbs100,
                                fat100: finalProduct.fat100,
                                simple100: finalProduct.simple100,
                                complex100: finalProduct.complex100,
                                badFat100: finalProduct.badFat100,
                                goodFat100: finalProduct.goodFat100,
                                trans100: finalProduct.trans100,
                                fiber100: finalProduct.fiber100,
                                sodium100: finalProduct.sodium100,
                                omega3_100: finalProduct.omega3_100,
                                omega6_100: finalProduct.omega6_100,
                                nova_group: novaGroup,
                                additives: additivesList,
                                nutrient_density: nutrientDensity,
                                is_organic: finalProduct.is_organic,
                                is_whole_grain: finalProduct.is_whole_grain,
                                is_fermented: finalProduct.is_fermented,
                                is_raw: finalProduct.is_raw,
                                vitamin_a: finalProduct.vitamin_a,
                                vitamin_c: finalProduct.vitamin_c,
                                vitamin_d: finalProduct.vitamin_d,
                                vitamin_e: finalProduct.vitamin_e,
                                vitamin_k: finalProduct.vitamin_k,
                                vitamin_b1: finalProduct.vitamin_b1,
                                vitamin_b2: finalProduct.vitamin_b2,
                                vitamin_b3: finalProduct.vitamin_b3,
                                vitamin_b6: finalProduct.vitamin_b6,
                                vitamin_b9: finalProduct.vitamin_b9,
                                vitamin_b12: finalProduct.vitamin_b12,
                                calcium: finalProduct.calcium,
                                iron: finalProduct.iron,
                                magnesium: finalProduct.magnesium,
                                phosphorus: finalProduct.phosphorus,
                                potassium: finalProduct.potassium,
                                zinc: finalProduct.zinc,
                                selenium: finalProduct.selenium,
                                iodine: finalProduct.iodine,
                                gi: finalProduct.gi,
                                harm: harmValue  // Normalized harm (0-10)
                            })
                        };

                        // Проверка финального newItem
                        const itemHasNutrients = !!(newItem.kcal100 || newItem.protein100 || newItem.carbs100);
                        if (!itemHasNutrients) {
                            console.error('🚨 [DayTab] CRITICAL: newItem has NO nutrients! Will be saved without data.', {
                                newItem,
                                finalProduct,
                                spreadCondition: finalProduct.kcal100 !== undefined
                            });
                        }

                        // 🔒 КРИТИЧНО: Защита от перезаписи cloud sync при добавлении продукта
                        // Используем глобальный API вместо ref (MealAddProduct - отдельный компонент)
                        const newUpdatedAt = Date.now();
                        if (HEYS.Day?.setBlockCloudUpdates) {
                            HEYS.Day.setBlockCloudUpdates(newUpdatedAt + 3000);
                            // console.log('[MealAddProduct] 🔒 Blocking cloud updates until:', newUpdatedAt + 3000);
                        }
                        // 🔒 ВАЖНО: Обновляем lastLoadedUpdatedAt чтобы handleDayUpdated не перезаписал
                        if (HEYS.Day?.setLastLoadedUpdatedAt) {
                            HEYS.Day.setLastLoadedUpdatedAt(newUpdatedAt);
                        }

                        setDay((prevDay = {}) => {
                            const meals = (prevDay.meals || []).map((m, i) =>
                                i === mealIndex
                                    ? { ...m, items: [...(m.items || []), newItem] }
                                    : m
                            );
                            return { ...prevDay, meals, updatedAt: newUpdatedAt };
                        });

                        // 🔧 FIX: Сразу сохраняем день после добавления продукта
                        // Без этого setDay() только ставит debounce 500ms, а гонка с облачным sync
                        // может привести к тому что heys_grams_* сохранятся раньше чем day
                        // requestAnimationFrame + setTimeout гарантирует выполнение после React re-render и useEffect
                        requestAnimationFrame(() => {
                            setTimeout(() => {
                                if (HEYS.Day?.requestFlush) {
                                    HEYS.Day.requestFlush();
                                    // console.log('[DayTab] 💾 Forced flush after product add');
                                }
                            }, 50);
                        });

                        try { navigator.vibrate?.(10); } catch (e) { }

                        window.dispatchEvent(new CustomEvent('heysProductAdded', {
                            detail: { product, grams }
                        }));

                        try {
                            U.lsSet(`heys_last_grams_${productId}`, grams);
                            const history = U.lsGet('heys_grams_history', {});
                            if (!history[productId]) history[productId] = [];
                            history[productId].push(grams);
                            if (history[productId].length > 20) history[productId].shift();
                            U.lsSet('heys_grams_history', history);
                        } catch (e) { }
                    },
                    onAddPhoto: async ({ mealIndex, photo, filename, timestamp }) => {
                        // Проверяем лимит фото (10 на приём)
                        const meal = day?.meals?.[mealIndex];
                        const currentPhotos = meal?.photos?.length || 0;
                        if (currentPhotos >= PHOTO_LIMIT_PER_MEAL) {
                            HEYS.Toast?.warning(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`) || alert(`Максимум ${PHOTO_LIMIT_PER_MEAL} фото на приём пищи`);
                            return;
                        }

                        // Получаем данные для загрузки
                        const clientId = HEYS.utils?.getCurrentClientId?.() || 'default';
                        const mealId = meal?.id || uid('meal_');
                        const photoId = uid('photo_');

                        // Пытаемся загрузить в облако
                        let photoData = {
                            id: photoId,
                            data: photo, // Временно храним base64 для отображения
                            filename,
                            timestamp,
                            pending: true,
                            uploading: true, // Индикатор загрузки
                            uploaded: false
                        };

                        // Сначала добавляем в UI (для мгновенного отображения)
                        setDay((prevDay = {}) => {
                            const meals = (prevDay.meals || []).map((m, i) =>
                                i === mealIndex
                                    ? {
                                        ...m,
                                        photos: [...(m.photos || []), photoData]
                                    }
                                    : m
                            );
                            return { ...prevDay, meals, updatedAt: Date.now() };
                        });

                        try { navigator.vibrate?.(10); } catch (e) { }

                        // Асинхронно загружаем в облако
                        if (HEYS.cloud?.uploadPhoto) {
                            try {
                                const result = await HEYS.cloud.uploadPhoto(photo, clientId, date, mealId);

                                if (result?.uploaded && result?.url) {
                                    // Успешно загружено — обновляем фото в состоянии
                                    setDay((prevDay = {}) => {
                                        const meals = (prevDay.meals || []).map((m, i) => {
                                            if (i !== mealIndex || !m.photos) return m;
                                            return {
                                                ...m,
                                                photos: m.photos.map(p =>
                                                    p.id === photoId
                                                        ? { ...p, url: result.url, data: undefined, pending: false, uploading: false, uploaded: true }
                                                        : p
                                                )
                                            };
                                        });
                                        return { ...prevDay, meals, updatedAt: Date.now() };
                                    });
                                } else if (result?.pending) {
                                    // Сохранено для загрузки позже (offline)
                                    setDay((prevDay = {}) => {
                                        const meals = (prevDay.meals || []).map((m, i) => {
                                            if (i !== mealIndex || !m.photos) return m;
                                            return {
                                                ...m,
                                                photos: m.photos.map(p =>
                                                    p.id === photoId
                                                        ? { ...p, uploading: false }
                                                        : p
                                                )
                                            };
                                        });
                                        return { ...prevDay, meals, updatedAt: Date.now() };
                                    });
                                }
                            } catch (e) {
                                // Убираем флаг uploading при ошибке
                                setDay((prevDay = {}) => {
                                    const meals = (prevDay.meals || []).map((m, i) => {
                                        if (i !== mealIndex || !m.photos) return m;
                                        return {
                                            ...m,
                                            photos: m.photos.map(p =>
                                                p.id === photoId
                                                    ? { ...p, uploading: false }
                                                    : p
                                            )
                                        };
                                    });
                                    return { ...prevDay, meals, updatedAt: Date.now() };
                                });
                                console.warn('[HEYS] Photo upload failed, will retry later:', e);
                            }
                        }
                    },
                    onNewProduct: () => {
                        if (window.HEYS?.products?.showAddModal) {
                            window.HEYS.products.showAddModal();
                        }
                    }
                });
            } else {
                console.error('[HEYS] AddProductStep not loaded');
            }
        }, [mi, products, date, day, setDay]);

        return React.createElement('button', {
            className: 'aps-open-btn' + (isCurrentMeal ? ' aps-open-btn--current' : ''),
            onClick: handleOpenModal,
            'aria-label': 'Добавить продукт'
        },
            React.createElement('span', { className: 'aps-open-icon' }, '🔍'),
            React.createElement('span', { className: 'aps-open-text' }, 'Добавить еще продукт')
        );
    }, (prev, next) => {
        if (prev.mi !== next.mi) return false;
        if (prev.products !== next.products) return false;

        const prevItems = prev.day?.meals?.[prev.mi]?.items;
        const nextItems = next.day?.meals?.[next.mi]?.items;
        if (prevItems !== nextItems) return false;

        return true;
    });

    const MEAL_HEADER_META = [
        { label: '' },
        { label: 'г' },
        { label: 'ккал<br>/100', per100: true },
        { label: 'У<br>/100', per100: true },
        { label: 'Прост<br>/100', per100: true },
        { label: 'Сл<br>/100', per100: true },
        { label: 'Б<br>/100', per100: true },
        { label: 'Ж<br>/100', per100: true },
        { label: 'ВрЖ<br>/100', per100: true },
        { label: 'ПолЖ<br>/100', per100: true },
        { label: 'СупЖ<br>/100', per100: true },
        { label: 'Клет<br>/100', per100: true },
        { label: 'Na<br>/100', per100: true },
        { label: 'ккал' },
        { label: 'У' },
        { label: 'Прост' },
        { label: 'Сл' },
        { label: 'Б' },
        { label: 'Ж' },
        { label: 'ВрЖ' },
        { label: 'ПолЖ' },
        { label: 'СупЖ' },
        { label: 'Клет' },
        { label: 'Na' },
        { label: 'ГИ' },
        { label: 'Вред' },
        { label: '' }
    ];

    function fmtVal(key, v) {
        const num = +v || 0;
        if (!num) return '-';
        if (key === 'harm') return Math.round(num * 10) / 10; // вредность с одной десятичной
        return Math.round(num); // всё остальное до целых
    }

    const ProductRow = React.memo(function ProductRow({
        item,
        mealIndex,
        isNew,
        pIndex,
        setGrams,
        removeItem
    }) {
        const p = getProductFromItem(item, pIndex) || { name: item.name || '?' };
        const grams = +item.grams || 0;
        const per = per100(p);
        const row = {
            kcal: scale(per.kcal100, grams),
            carbs: scale(per.carbs100, grams),
            simple: scale(per.simple100, grams),
            complex: scale(per.complex100, grams),
            prot: scale(per.prot100, grams),
            fat: scale(per.fat100, grams),
            bad: scale(per.bad100, grams),
            good: scale(per.good100, grams),
            trans: scale(per.trans100, grams),
            fiber: scale(per.fiber100, grams),
            sodium: scale(per.sodium100, grams)
        };
        const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? item.gi;
        const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? item.harm ?? item.harmScore;
        return React.createElement('tr', { 'data-new': isNew ? 'true' : 'false' },
            React.createElement('td', { 'data-cell': 'name' }, p.name),
            React.createElement('td', { 'data-cell': 'grams' }, React.createElement('input', {
                type: 'number',
                value: grams,
                'data-grams-input': true,
                'data-meal-index': mealIndex,
                'data-item-id': item.id,
                onChange: e => setGrams(mealIndex, item.id, e.target.value),
                onKeyDown: e => {
                    if (e.key === 'Enter') {
                        e.target.blur(); // Убрать фокус после подтверждения
                    }
                },
                onFocus: e => e.target.select(), // Выделить текст при фокусе
                placeholder: 'грамм',
                style: { textAlign: 'center' }
            })),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('kcal100', per.kcal100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('carbs100', per.carbs100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('simple100', per.simple100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('complex100', per.complex100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('prot100', per.prot100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fat100', per.fat100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('bad', per.bad100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('good100', per.good100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('trans100', per.trans100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('fiber100', per.fiber100)),
            React.createElement('td', { 'data-cell': 'per100' }, fmtVal('sodium100', per.sodium100)),
            React.createElement('td', { 'data-cell': 'kcal' }, fmtVal('kcal', row.kcal)),
            React.createElement('td', { 'data-cell': 'carbs' }, fmtVal('carbs', row.carbs)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('simple', row.simple)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('complex', row.complex)),
            React.createElement('td', { 'data-cell': 'prot' }, fmtVal('prot', row.prot)),
            React.createElement('td', { 'data-cell': 'fat' }, fmtVal('fat', row.fat)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('bad', row.bad)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('good', row.good)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('trans', row.trans)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('fiber', row.fiber)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('sodium', row.sodium)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('gi', giVal)),
            React.createElement('td', { 'data-cell': 'hidden' }, fmtVal('harm', harmVal)),
            React.createElement('td', { 'data-cell': 'delete' }, React.createElement('button', { className: 'btn secondary', onClick: () => removeItem(mealIndex, item.id) }, '×'))
        );
    });

    // Export to HEYS namespace
    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealAddProduct = MealAddProduct;
    HEYS.dayComponents.ProductRow = ProductRow;

})(window);

// ===== End heys_day_add_product.js =====

// ===== Begin heys_day_meal_optimizer_section.js =====
// heys_day_meal_optimizer_section.js — MealOptimizerSection component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    const MealOptimizerSection = React.memo(function MealOptimizerSection(props) {
        const { meal, totals, dayData, profile, products, pIndex, mealIndex, addProductToMeal } = props || {};
        const MO = HEYS.MealOptimizer;
        const [optExpanded, setOptExpanded] = React.useState(true);
        const [debouncedMeal, setDebouncedMeal] = React.useState(meal);

        if (!meal?.items?.length) return null;

        React.useEffect(() => {
            const timer = setTimeout(() => setDebouncedMeal(meal), 300);
            return () => clearTimeout(timer);
        }, [meal]);

        const recommendations = React.useMemo(() => {
            if (!MO) return [];
            return MO.getMealOptimization({
                meal: debouncedMeal,
                mealTotals: totals,
                dayData,
                profile,
                products,
                pIndex,
                avgGI: totals?.gi || 50
            });
        }, [debouncedMeal, totals, dayData, profile, products, pIndex]);

        const visibleRecs = React.useMemo(() => {
            if (!MO) return [];
            const filtered = recommendations.filter(r => !MO.shouldHideRecommendation(r.id));

            const seen = new Map();
            filtered.forEach(r => {
                const key = r.title.toLowerCase().trim();
                if (!seen.has(key) || (seen.get(key).priority || 0) < (r.priority || 0)) {
                    seen.set(key, r);
                }
            });
            const deduped = Array.from(seen.values());

            return deduped.sort((a, b) => {
                if (a.isWarning && !b.isWarning) return -1;
                if (!a.isWarning && b.isWarning) return 1;
                const aHasProds = (a.products?.length || 0) > 0 ? 1 : 0;
                const bHasProds = (b.products?.length || 0) > 0 ? 1 : 0;
                if (aHasProds !== bHasProds) return bHasProds - aHasProds;
                return (b.priority || 50) - (a.priority || 50);
            });
        }, [recommendations]);

        const handleAddProduct = React.useCallback((product, ruleId) => {
            if (!addProductToMeal || !product || !MO) return;

            const portion = MO.getSmartPortion(product);
            const productWithGrams = { ...product, grams: portion.grams };

            addProductToMeal(mealIndex, productWithGrams);

            MO.trackUserAction({
                type: 'accept',
                ruleId,
                productId: product.id,
                productName: product.name
            });
        }, [addProductToMeal, mealIndex]);

        const handleDismiss = React.useCallback((ruleId) => {
            if (!MO) return;
            MO.trackUserAction({
                type: 'dismiss',
                ruleId
            });
        }, []);

        if (visibleRecs.length === 0) return null;

        const bestRec = visibleRecs[0];
        const restRecs = visibleRecs.slice(1);

        return React.createElement('div', {
            className: 'meal-optimizer' + (optExpanded ? ' meal-optimizer--expanded' : '')
        },
            React.createElement('div', {
                className: 'meal-optimizer__header',
                onClick: () => restRecs.length > 0 && setOptExpanded(!optExpanded)
            },
                React.createElement('span', { className: 'meal-optimizer__header-icon' }, bestRec.icon),
                React.createElement('div', { className: 'meal-optimizer__header-text' },
                    React.createElement('div', { className: 'meal-optimizer__header-title' }, bestRec.title),
                    React.createElement('div', { className: 'meal-optimizer__header-reason' }, bestRec.reason)
                ),
                React.createElement('div', { className: 'meal-optimizer__header-right' },
                    restRecs.length > 0 && React.createElement('span', { className: 'meal-optimizer__badge' },
                        '+' + restRecs.length
                    ),
                    restRecs.length > 0 && React.createElement('span', {
                        className: 'meal-optimizer__toggle' + (optExpanded ? ' meal-optimizer__toggle--expanded' : '')
                    }, '▼'),
                    React.createElement('button', {
                        className: 'meal-optimizer__dismiss',
                        onClick: (e) => { e.stopPropagation(); handleDismiss(bestRec.id); },
                        title: 'Скрыть'
                    }, '×')
                )
            ),

            bestRec.products && bestRec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
                bestRec.products.map((prod, pIdx) =>
                    React.createElement('button', {
                        key: prod.id || pIdx,
                        className: 'meal-optimizer__product',
                        onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, bestRec.id); },
                        title: `Добавить ${prod.name}`
                    },
                        React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                        prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                        React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                    )
                )
            ),

            optExpanded && restRecs.length > 0 && React.createElement('div', { className: 'meal-optimizer__content' },
                restRecs.map((rec) =>
                    React.createElement('div', {
                        key: rec.id,
                        className: 'meal-optimizer__item'
                            + (rec.isWarning ? ' meal-optimizer__item--warning' : '')
                            + (rec.isInfo ? ' meal-optimizer__item--info' : '')
                    },
                        React.createElement('div', { className: 'meal-optimizer__item-header' },
                            React.createElement('span', { className: 'meal-optimizer__item-icon' }, rec.icon),
                            React.createElement('div', { className: 'meal-optimizer__item-content' },
                                React.createElement('div', { className: 'meal-optimizer__item-title' }, rec.title),
                                React.createElement('div', { className: 'meal-optimizer__item-reason' }, rec.reason),
                                rec.science && React.createElement('div', { className: 'meal-optimizer__item-science' }, rec.science)
                            ),
                            React.createElement('button', {
                                className: 'meal-optimizer__item-dismiss',
                                onClick: (e) => { e.stopPropagation(); handleDismiss(rec.id); },
                                title: 'Больше не показывать'
                            }, '×')
                        ),

                        rec.products && rec.products.length > 0 && React.createElement('div', { className: 'meal-optimizer__products' },
                            rec.products.map((prod, pIdx) =>
                                React.createElement('button', {
                                    key: prod.id || pIdx,
                                    className: 'meal-optimizer__product',
                                    onClick: (e) => { e.stopPropagation(); handleAddProduct(prod, rec.id); },
                                    title: `Добавить ${prod.name}`
                                },
                                    React.createElement('span', { className: 'meal-optimizer__product-name' }, prod.name),
                                    prod.smartPortion && React.createElement('span', { className: 'meal-optimizer__product-portion' }, prod.smartPortion.label),
                                    React.createElement('span', { className: 'meal-optimizer__product-add' }, '+')
                                )
                            )
                        )
                    )
                )
            )
        );
    });

    HEYS.dayMealOptimizerSection = {
        MealOptimizerSection
    };
})(window);

// ===== End heys_day_meal_optimizer_section.js =====

// ===== Begin day/_meals.js =====
// day/_meals.js — consolidated DayTab meals modules (card/list/display/chart/state/handlers)

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const trackError = (err, context) => {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(err, context);
        }
    };

    // =========================
    // MealCard
    // =========================
    const U = HEYS.dayUtils || {};
    const getProductFromItem = U.getProductFromItem || (() => null);
    const formatMealTime = U.formatMealTime || ((time) => time);
    const MEAL_TYPES = U.MEAL_TYPES || {};
    const per100 = U.per100 || (() => ({
        kcal100: 0,
        carbs100: 0,
        prot100: 0,
        fat100: 0,
        simple100: 0,
        complex100: 0,
        bad100: 0,
        good100: 0,
        trans100: 0,
        fiber100: 0,
    }));
    const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

    const M = HEYS.models || {};
    const { LazyPhotoThumb } = HEYS.dayGallery || {};
    const { getMealQualityScore, getNutrientColor, getNutrientTooltip } = HEYS.mealScoring || {};
    const { PopupCloseButton } = HEYS.dayPopups || {};
    const MealOptimizerSection = HEYS.dayMealOptimizerSection?.MealOptimizerSection;

    function fmtVal(key, v) {
        const num = +v || 0;
        if (!num) return '-';
        if (key === 'harm') return Math.round(num * 10) / 10;
        return Math.round(num);
    }

    const MEAL_HEADER_META = [
        { label: 'Название<br>продукта' },
        { label: 'г' },
        { label: 'ккал<br>/100', per100: true },
        { label: 'У<br>/100', per100: true },
        { label: 'Прост<br>/100', per100: true },
        { label: 'Сл<br>/100', per100: true },
        { label: 'Б<br>/100', per100: true },
        { label: 'Ж<br>/100', per100: true },
        { label: 'ВрЖ<br>/100', per100: true },
        { label: 'ПЖ<br>/100', per100: true },
        { label: 'ТрЖ<br>/100', per100: true },
        { label: 'Клетч<br>/100', per100: true },
        { label: 'Na<br>/100', per100: true },
        { label: 'ГИ' },
        { label: 'Вред' },
        { label: '' },
    ];

    function getMealType(mealIndex, meal, allMeals, pIndex) {
        const time = meal?.time || '';
        const hour = parseInt(time.split(':')[0]) || 12;

        if (hour >= 6 && hour < 11) return { type: 'breakfast', label: 'Завтрак', emoji: '🌅' };
        if (hour >= 11 && hour < 16) return { type: 'lunch', label: 'Обед', emoji: '🌞' };
        if (hour >= 16 && hour < 21) return { type: 'dinner', label: 'Ужин', emoji: '🌆' };
        return { type: 'snack', label: 'Перекус', emoji: '🍎' };
    }

    const MealCard = React.memo(function MealCard({
        meal,
        mealIndex,
        displayIndex,
        products,
        pIndex,
        date,
        setDay,
        isMobile,
        isExpanded,
        onToggleExpand,
        onChangeMealType,
        onChangeTime,
        onChangeMood,
        onChangeWellbeing,
        onChangeStress,
        onRemoveMeal,
        openEditGramsModal,
        openTimeEditor,
        openMoodEditor,
        setGrams,
        removeItem,
        isMealStale,
        allMeals,
        isNewItem,
        optimum,
        setMealQualityPopup,
        addProductToMeal,
        dayData,
        profile,
        insulinWaveData: insulinWaveDataProp,
    }) {
        const MealAddProduct = HEYS.dayComponents?.MealAddProduct;
        const ProductRow = HEYS.dayComponents?.ProductRow;
        if (!MealAddProduct || !ProductRow) {
            trackError(new Error('[HEYS Day Meals] Meal components not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
                missing: {
                    MealAddProduct: !MealAddProduct,
                    ProductRow: !ProductRow,
                },
            });
            return React.createElement('div', {
                className: 'card tone-slate meal-card',
                style: { padding: '12px', marginTop: '8px' },
            }, 'Загрузка...');
        }
        const headerMeta = MEAL_HEADER_META;
        function mTotals(m) {
            const t = (M.mealTotals ? M.mealTotals(m, pIndex) : {
                kcal: 0,
                carbs: 0,
                simple: 0,
                complex: 0,
                prot: 0,
                fat: 0,
                bad: 0,
                good: 0,
                trans: 0,
                fiber: 0,
            });
            let gSum = 0;
            let giSum = 0;
            let harmSum = 0;
            (m.items || []).forEach((it) => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
            t.gi = gSum ? giSum / gSum : 0;
            t.harm = gSum ? harmSum / gSum : 0;
            return t;
        }
        const totals = mTotals(meal);
        const manualType = meal.mealType;
        const autoTypeInfo = getMealType(mealIndex, meal, allMeals, pIndex);
        const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType]
            ? { type: manualType, ...U.MEAL_TYPES[manualType] }
            : autoTypeInfo;

        const changeMealType = (newType) => {
            onChangeMealType(mealIndex, newType);
        };
        const timeDisplay = U.formatMealTime ? U.formatMealTime(meal.time) : (meal.time || '');
        const mealKcal = Math.round(totals.kcal || 0);
        const isStale = isMealStale(meal);
        const isCurrentMeal = displayIndex === 0 && !isStale;

        const mealActivityContext = React.useMemo(() => {
            if (!HEYS.InsulinWave?.calculateActivityContext) return null;
            if (!dayData?.trainings || dayData.trainings.length === 0) return null;
            if (!meal?.time || !meal?.items?.length) return null;

            const mealTotals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
            return HEYS.InsulinWave.calculateActivityContext({
                mealTime: meal.time,
                mealKcal: mealTotals.kcal || 0,
                trainings: dayData.trainings,
                householdMin: dayData.householdMin || 0,
                steps: dayData.steps || 0,
                allMeals: allMeals,
            });
        }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, pIndex]);

        const mealQuality = React.useMemo(() => {
            if (!meal?.items || meal.items.length === 0) return null;
            return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
        }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);

        const qualityLineColor = mealQuality
            ? mealQuality.color
            : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');

        const mealCardClass = isCurrentMeal ? 'card tone-green meal-card meal-card--current' : 'card tone-slate meal-card';
        const mealCardStyle = {
            marginTop: '8px',
            width: '100%',
            position: 'relative',
            paddingLeft: '12px',
            ...(isCurrentMeal
                ? {
                    border: '2px solid #22c55e',
                    boxShadow: '0 4px 12px rgba(34,197,94,0.25)',
                }
                : {}),
        };
        const computeDerivedProductFn = M.computeDerivedProduct || ((prod) => prod || {});

        const InsulinWave = HEYS.InsulinWave || {};
        const IWUtils = InsulinWave.utils || {};
        const insulinWaveData = insulinWaveDataProp || {};
        const waveHistorySorted = React.useMemo(() => {
            const list = insulinWaveData.waveHistory || [];
            if (!IWUtils.normalizeToHeysDay) return [...list].sort((a, b) => a.startMin - b.startMin);
            return [...list].sort((a, b) => IWUtils.normalizeToHeysDay(a.startMin) - IWUtils.normalizeToHeysDay(b.startMin));
        }, [insulinWaveData.waveHistory]);

        const currentWaveIndex = React.useMemo(() => waveHistorySorted.findIndex((w) => w.time === meal.time), [waveHistorySorted, meal.time]);
        const currentWave = currentWaveIndex >= 0 ? waveHistorySorted[currentWaveIndex] : null;
        const prevWave = currentWaveIndex > 0 ? waveHistorySorted[currentWaveIndex - 1] : null;
        const nextWave = (currentWaveIndex >= 0 && currentWaveIndex < waveHistorySorted.length - 1) ? waveHistorySorted[currentWaveIndex + 1] : null;
        const hasOverlapWithNext = currentWave && nextWave ? currentWave.endMin > nextWave.startMin : false;
        const hasOverlapWithPrev = currentWave && prevWave ? prevWave.endMin > currentWave.startMin : false;
        const hasAnyOverlap = hasOverlapWithNext || hasOverlapWithPrev;
        const lipolysisGapNext = currentWave && nextWave ? Math.max(0, nextWave.startMin - currentWave.endMin) : 0;
        const overlapMinutes = hasOverlapWithNext
            ? currentWave.endMin - nextWave.startMin
            : hasOverlapWithPrev
                ? prevWave.endMin - currentWave.startMin
                : 0;
        const [waveExpanded, setWaveExpanded] = React.useState(true);
        const [showWaveCalcPopup, setShowWaveCalcPopup] = React.useState(false);
        const showWaveButton = !!(currentWave && meal.time && (meal.items || []).length > 0);
        const formatMinutes = React.useCallback((mins) => {
            if (IWUtils.formatDuration) return IWUtils.formatDuration(mins);
            return `${Math.max(0, Math.round(mins))}м`;
        }, [IWUtils.formatDuration]);

        const toggleWave = React.useCallback(() => {
            const newState = !waveExpanded;
            setWaveExpanded(newState);
            if (HEYS.dayUtils?.haptic) HEYS.dayUtils.haptic('light');
            if (HEYS.analytics?.trackDataOperation) {
                HEYS.analytics.trackDataOperation('insulin_wave_meal_expand', {
                    action: newState ? 'open' : 'close',
                    hasOverlap: hasAnyOverlap,
                    overlapMinutes,
                    lipolysisGap: lipolysisGapNext,
                    mealIndex,
                });
            }
        }, [waveExpanded, hasAnyOverlap, overlapMinutes, lipolysisGapNext, mealIndex]);

        const getMoodEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
        const getWellbeingEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
        const getStressEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';

        const moodVal = +meal.mood || 0;
        const wellbeingVal = +meal.wellbeing || 0;
        const stressVal = +meal.stress || 0;
        const moodEmoji = getMoodEmoji(moodVal);
        const wellbeingEmoji = getWellbeingEmoji(wellbeingVal);
        const stressEmoji = getStressEmoji(stressVal);
        const hasRatings = moodVal > 0 || wellbeingVal > 0 || stressVal > 0;

        const [optimizerPopupOpen, setOptimizerPopupOpen] = React.useState(false);
        const [totalsExpanded, setTotalsExpanded] = React.useState(false);

        const optimizerRecsCount = React.useMemo(() => {
            const MO = HEYS.MealOptimizer;
            if (!MO || !meal?.items?.length) return 0;

            const recommendations = MO.getMealOptimization({
                meal,
                mealTotals: totals,
                dayData: dayData || {},
                profile: profile || {},
                products: products || [],
                pIndex,
                avgGI: totals?.gi || 50,
            });

            const filtered = recommendations.filter((r) => !MO.shouldHideRecommendation(r.id));

            const seen = new Set();
            return filtered.filter((r) => {
                const key = r.title.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).length;
        }, [meal, totals, dayData, profile, products, pIndex]);

        return React.createElement('div', { className: mealCardClass, 'data-meal-index': mealIndex, style: mealCardStyle },
            qualityLineColor !== 'transparent' && React.createElement('div', {
                className: 'meal-quality-line',
                style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    borderRadius: '12px 0 0 12px',
                    background: qualityLineColor,
                    transition: 'background 0.3s ease',
                },
            }),
            React.createElement('div', {
                className: 'meal-header-inside meal-type-' + mealTypeInfo.type,
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    background: qualityLineColor !== 'transparent'
                        ? qualityLineColor + '1F'
                        : undefined,
                    borderRadius: '10px 10px 0 0',
                    margin: '-12px -12px 8px -4px',
                    padding: '12px 16px 12px 8px',
                },
            },
                timeDisplay && React.createElement('span', {
                    className: 'meal-time-badge-inside',
                    onClick: () => openTimeEditor(mealIndex),
                    title: 'Изменить время',
                    style: { fontSize: '15px', padding: '6px 14px', fontWeight: '700', flexShrink: 0 },
                }, timeDisplay),
                React.createElement('div', { className: 'meal-type-wrapper', style: { flex: 1, display: 'flex', justifyContent: 'center' } },
                    React.createElement('span', { className: 'meal-type-label', style: { fontSize: '16px', fontWeight: '700', padding: '4px 12px' } },
                        mealTypeInfo.icon + ' ' + mealTypeInfo.name,
                        React.createElement('span', { className: 'meal-type-arrow' }, ' ▾'),
                    ),
                    React.createElement('select', {
                        className: 'meal-type-select',
                        value: manualType || '',
                        onChange: (e) => {
                            changeMealType(e.target.value || null);
                        },
                        title: 'Изменить тип приёма',
                    }, [
                        { value: '', label: '🔄 Авто' },
                        { value: 'breakfast', label: '🍳 Завтрак' },
                        { value: 'snack1', label: '🍎 Перекус' },
                        { value: 'lunch', label: '🍲 Обед' },
                        { value: 'snack2', label: '🥜 Перекус' },
                        { value: 'dinner', label: '🍽️ Ужин' },
                        { value: 'snack3', label: '🧀 Перекус' },
                        { value: 'night', label: '🌙 Ночной' },
                    ].map((opt) =>
                        React.createElement('option', { key: opt.value, value: opt.value }, opt.label),
                    )),
                ),
                React.createElement('span', { className: 'meal-kcal-badge-inside', style: { fontSize: '15px', padding: '6px 14px', flexShrink: 0 } },
                    mealKcal > 0 ? (mealKcal + ' ккал') : '0 ккал',
                ),
                currentWave && currentWave.activityContext && React.createElement('span', {
                    className: 'activity-context-badge',
                    title: currentWave.activityContext.desc,
                    style: {
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        background: currentWave.activityContext.type === 'peri' ? '#22c55e33'
                            : currentWave.activityContext.type === 'post' ? '#3b82f633'
                                : currentWave.activityContext.type === 'pre' ? '#eab30833'
                                    : '#6b728033',
                        color: currentWave.activityContext.type === 'peri' ? '#16a34a'
                            : currentWave.activityContext.type === 'post' ? '#2563eb'
                                : currentWave.activityContext.type === 'pre' ? '#ca8a04'
                                    : '#374151',
                        fontWeight: '600',
                        flexShrink: 0,
                        marginLeft: '4px',
                        whiteSpace: 'nowrap',
                    },
                }, currentWave.activityContext.badge || ''),
            ),
            mealActivityContext && mealActivityContext.type !== 'none' && (meal.items || []).length === 0
            && React.createElement('div', {
                className: 'training-context-hint',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    margin: '0 -4px 8px -4px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    background: mealActivityContext.type === 'peri' ? 'linear-gradient(135deg, #22c55e15, #22c55e25)'
                        : mealActivityContext.type === 'post' ? 'linear-gradient(135deg, #3b82f615, #3b82f625)'
                            : mealActivityContext.type === 'pre' ? 'linear-gradient(135deg, #eab30815, #eab30825)'
                                : 'linear-gradient(135deg, #6b728015, #6b728025)',
                    border: mealActivityContext.type === 'peri' ? '1px solid #22c55e40'
                        : mealActivityContext.type === 'post' ? '1px solid #3b82f640'
                            : mealActivityContext.type === 'pre' ? '1px solid #eab30840'
                                : '1px solid #6b728040',
                    color: mealActivityContext.type === 'peri' ? '#16a34a'
                        : mealActivityContext.type === 'post' ? '#2563eb'
                            : mealActivityContext.type === 'pre' ? '#ca8a04'
                                : '#374151',
                },
            },
                React.createElement('span', { style: { fontSize: '18px' } }, mealActivityContext.badge || '🏋️'),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } },
                        mealActivityContext.type === 'peri' ? '🔥 Топливо для тренировки!'
                            : mealActivityContext.type === 'post' ? '💪 Анаболическое окно!'
                                : mealActivityContext.type === 'pre' ? '⚡ Скоро тренировка!'
                                    : mealActivityContext.type === 'steps' ? '👟 Активный день!'
                                        : mealActivityContext.type === 'double' ? '🏆 Двойная тренировка!'
                                            : '🎯 Хорошее время!'
                    ),
                    React.createElement('div', { style: { opacity: 0.85, fontSize: '12px' } },
                        mealActivityContext.type === 'peri'
                            ? 'Еда пойдёт в энергию, а не в жир. Вред снижен на ' + Math.round((1 - (mealActivityContext.harmMultiplier || 1)) * 100) + '%'
                            : mealActivityContext.type === 'post'
                                ? 'Нутриенты усвоятся в мышцы. Отличное время для белка!'
                                : mealActivityContext.type === 'pre'
                                    ? 'Лёгкие углеводы дадут энергию для тренировки'
                                    : mealActivityContext.type === 'steps'
                                        ? 'Высокая активность улучшает метаболизм'
                                        : mealActivityContext.type === 'double'
                                            ? 'Двойная нагрузка — можно есть смелее!'
                                            : 'Инсулиновая волна будет короче'
                    ),
                ),
            ),
            React.createElement('div', { className: 'row desktop-add-product', style: { justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { className: 'section-title' }, 'Добавить продукт'),
                React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal }),
            ),
            React.createElement('div', { style: { overflowX: 'auto', marginTop: '8px' } }, React.createElement('table', { className: 'tbl meals-table' },
                React.createElement('thead', null, React.createElement('tr', null, headerMeta.map((h, i) => React.createElement('th', {
                    key: 'h' + i,
                    className: h.per100 ? 'per100-col' : undefined,
                    dangerouslySetInnerHTML: { __html: h.label },
                })))),
                React.createElement('tbody', null,
                    (meal.items || []).map((it) => React.createElement(ProductRow, {
                        key: it.id,
                        item: it,
                        mealIndex,
                        isNew: isNewItem(it.id),
                        pIndex,
                        setGrams,
                        removeItem,
                    })),
                    React.createElement('tr', { className: 'tr-sum' },
                        React.createElement('td', { className: 'fw-600' }, ''),
                        React.createElement('td', null, ''),
                        React.createElement('td', { colSpan: 12 }, React.createElement('div', { className: 'table-divider' })),
                        React.createElement('td', null, fmtVal('kcal', totals.kcal)),
                        React.createElement('td', null, fmtVal('carbs', totals.carbs)),
                        React.createElement('td', null, fmtVal('simple', totals.simple)),
                        React.createElement('td', null, fmtVal('complex', totals.complex)),
                        React.createElement('td', null, fmtVal('prot', totals.prot)),
                        React.createElement('td', null, fmtVal('fat', totals.fat)),
                        React.createElement('td', null, fmtVal('bad', totals.bad)),
                        React.createElement('td', null, fmtVal('good', totals.good)),
                        React.createElement('td', null, fmtVal('trans', totals.trans)),
                        React.createElement('td', null, fmtVal('fiber', totals.fiber)),
                        React.createElement('td', null, fmtVal('sodium', totals.sodium)),
                        React.createElement('td', null, fmtVal('gi', totals.gi)),
                        React.createElement('td', null, fmtVal('harm', totals.harm)),
                        React.createElement('td', null, ''),
                    ),
                ),
            )),
            React.createElement('div', { className: 'mobile-products-list' },
                React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
                    (meal.items || []).length > 0 && React.createElement('div', {
                        className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
                        onClick: () => onToggleExpand(mealIndex, allMeals),
                    },
                        React.createElement('span', { className: 'toggle-arrow' }, '›'),
                        React.createElement('span', null, isExpanded
                            ? (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов')
                            : 'развернуть ' + (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов')),
                    ),
                    React.createElement(MealAddProduct, { mi: mealIndex, products, date, setDay, isCurrentMeal }),
                ),
                isExpanded && (meal.items || []).map((it) => {
                    const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
                    const G = +it.grams || 0;
                    const per = per100(p);
                    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? it.gi;
                    const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct ?? it.harm ?? it.harmScore;

                    const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';

                    const getHarmBg = (h) => {
                        if (h == null) return '#fff';
                        if (h <= 1) return '#34d399';
                        if (h <= 2) return '#6ee7b7';
                        if (h <= 3) return '#a7f3d0';
                        if (h <= 4) return '#d1fae5';
                        if (h <= 5) return '#bae6fd';
                        if (h <= 6) return '#e0f2fe';
                        if (h <= 7) return '#fecaca';
                        if (h <= 8) return '#fee2e2';
                        if (h <= 9) return '#fecdd3';
                        return '#f87171';
                    };
                    const harmBg = getHarmBg(harmVal);

                    const getHarmBadge = (h) => {
                        if (h == null) return null;
                        if (h <= 2) return { emoji: '🌿', text: 'полезный', color: '#059669' };
                        if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
                        return null;
                    };
                    const harmBadge = getHarmBadge(harmVal);

                    const getCategoryIcon = (cat) => {
                        if (!cat) return null;
                        const c = cat.toLowerCase();
                        if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
                        if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
                        if (c.includes('рыб') || c.includes('морепр')) return '🐟';
                        if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
                        if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
                        if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
                        if (c.includes('яйц')) return '🥚';
                        if (c.includes('орех') || c.includes('семеч')) return '🥜';
                        if (c.includes('масл')) return '🫒';
                        if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
                        if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
                        if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
                        return '🍽️';
                    };
                    const categoryIcon = getCategoryIcon(p.category);

                    const findAlternative = (prod, allProducts) => {
                        if (!prod.category || !allProducts || allProducts.length < 2) return null;
                        const currentKcal = per.kcal100 || 0;
                        if (currentKcal < 50) return null;

                        const sameCategory = allProducts.filter((alt) =>
                            alt.category === prod.category
                            && alt.id !== prod.id
                            && (alt.kcal100 || computeDerivedProductFn(alt).kcal100) < currentKcal * 0.7,
                        );
                        if (sameCategory.length === 0) return null;

                        const best = sameCategory.reduce((a, b) => {
                            const aKcal = a.kcal100 || computeDerivedProductFn(a).kcal100;
                            const bKcal = b.kcal100 || computeDerivedProductFn(b).kcal100;
                            return aKcal < bKcal ? a : b;
                        });
                        const bestKcal = best.kcal100 || computeDerivedProductFn(best).kcal100;
                        const saving = Math.round((1 - bestKcal / currentKcal) * 100);
                        return { name: best.name, saving };
                    };
                    const alternative = findAlternative(p, products);

                    const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                            React.createElement('span', { className: 'mpc-name' }, p.name),
                            harmBadge && React.createElement('span', {
                                className: 'mpc-badge',
                                style: { color: harmBadge.color },
                            }, harmBadge.emoji),
                            React.createElement('button', {
                                className: 'mpc-grams-btn ' + gramsClass,
                                onClick: (e) => { e.stopPropagation(); openEditGramsModal(mealIndex, it.id, G, p); },
                            }, G + 'г'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                        alternative && React.createElement('div', { className: 'mpc-alternative' },
                            React.createElement('span', null, '💡 Замени на '),
                            React.createElement('strong', null, alternative.name),
                            React.createElement('span', null, ' — на ' + alternative.saving + '% меньше ккал'),
                        ),
                    );

                    if (isMobile && HEYS.SwipeableRow) {
                        return React.createElement(HEYS.SwipeableRow, {
                            key: it.id,
                            onDelete: () => removeItem(mealIndex, it.id),
                        }, cardContent);
                    }

                    return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            React.createElement('span', { className: 'mpc-name' }, p.name),
                            React.createElement('input', {
                                type: 'number',
                                className: 'mpc-grams',
                                value: G,
                                onChange: (e) => setGrams(mealIndex, it.id, e.target.value),
                                onFocus: (e) => e.target.select(),
                                onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
                                'data-grams-input': true,
                                'data-meal-index': mealIndex,
                                'data-item-id': it.id,
                                inputMode: 'decimal',
                            }),
                            React.createElement('button', {
                                className: 'mpc-delete',
                                onClick: () => removeItem(mealIndex, it.id),
                            }, '×'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                    );
                }),

                (meal.photos && meal.photos.length > 0) && React.createElement('div', { className: 'meal-photos' },
                    meal.photos.map((photo, photoIndex) => {
                        const photoSrc = photo.url || photo.data;
                        if (!photoSrc) return null;

                        const timeStr = photo.timestamp
                            ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                            : null;

                        const handleDelete = async (e) => {
                            e.stopPropagation();
                            if (!confirm('Удалить это фото?')) return;

                            if (photo.path && photo.uploaded && window.HEYS?.cloud?.deletePhoto) {
                                try {
                                    await window.HEYS.cloud.deletePhoto(photo.path);
                                } catch (err) {
                                    trackError(err, { source: 'day/_meals.js', action: 'delete_photo', mealIndex });
                                }
                            }

                            setDay((prevDay = {}) => {
                                const meals = (prevDay.meals || []).map((m, i) => {
                                    if (i !== mealIndex || !m.photos) return m;
                                    return { ...m, photos: m.photos.filter((p) => p.id !== photo.id) };
                                });
                                return { ...prevDay, meals, updatedAt: Date.now() };
                            });
                        };

                        let thumbClass = 'meal-photo-thumb';
                        if (photo.pending) thumbClass += ' pending';
                        if (photo.uploading) thumbClass += ' uploading';

                        return React.createElement(LazyPhotoThumb, {
                            key: photo.id || photoIndex,
                            photo,
                            photoSrc,
                            thumbClass,
                            timeStr,
                            mealIndex,
                            photoIndex,
                            mealPhotos: meal.photos,
                            handleDelete,
                            setDay,
                        });
                    }),
                ),

                showWaveButton && React.createElement('div', {
                    className: 'meal-wave-block' + (waveExpanded ? ' expanded' : ''),
                    style: {
                        marginTop: '10px',
                        background: 'transparent',
                        borderRadius: '12px',
                        overflow: 'hidden',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-wave-toggle',
                        onClick: toggleWave,
                        style: {
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600,
                            color: hasAnyOverlap ? '#b91c1c' : '#1f2937',
                        },
                    },
                        React.createElement('span', null,
                            `📉 Волна ${(currentWave.duration / 60).toFixed(1)}ч • ` + (
                                hasAnyOverlap
                                    ? `⚠️ перехлёст ${formatMinutes(overlapMinutes)}`
                                    : nextWave
                                        ? `✅ липолиз ${formatMinutes(lipolysisGapNext)}`
                                        : '🟢 последний приём'
                            ),
                        ),
                        React.createElement('button', {
                            onClick: (e) => {
                                e.stopPropagation();
                                setShowWaveCalcPopup(true);
                            },
                            style: {
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                color: '#3b82f6',
                                fontWeight: 500,
                                cursor: 'pointer',
                                marginLeft: '8px',
                            },
                        }, 'расчёт'),
                        React.createElement('span', { className: 'toggle-arrow' }, waveExpanded ? '▴' : '▾'),
                    ),
                    waveExpanded && InsulinWave.MealWaveExpandSection && React.createElement(InsulinWave.MealWaveExpandSection, {
                        waveData: currentWave,
                        prevWave,
                        nextWave,
                    }),

                    (() => {
                        const IW = HEYS.InsulinWave;
                        if (!IW || !IW.calculateHypoglycemiaRisk) return null;

                        const hypoRisk = IW.calculateHypoglycemiaRisk(meal, pIndex, getProductFromItem);
                        if (!hypoRisk.hasRisk) return null;

                        const mealMinutes = IW.utils?.timeToMinutes?.(meal.time) || 0;
                        const now = new Date();
                        const nowMinutes = now.getHours() * 60 + now.getMinutes();
                        let minutesSinceMeal = nowMinutes - mealMinutes;
                        if (minutesSinceMeal < 0) minutesSinceMeal += 24 * 60;

                        const inRiskWindow = minutesSinceMeal >= hypoRisk.riskWindow.start && minutesSinceMeal <= hypoRisk.riskWindow.end;

                        return React.createElement('div', {
                            className: 'hypoglycemia-warning',
                            style: {
                                margin: '8px 12px 10px 12px',
                                padding: '8px 10px',
                                background: inRiskWindow ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.1)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: inRiskWindow ? '#ea580c' : '#ca8a04',
                            },
                        },
                            React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                                inRiskWindow
                                    ? '⚡ Сейчас возможен спад энергии'
                                    : '⚡ Высокий GI — риск "сахарных качелей"',
                            ),
                            React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } },
                                inRiskWindow
                                    ? 'Это нормально! Съешь орехи или белок если устал'
                                    : `GI ~${Math.round(hypoRisk.details.avgGI)}, белок ${Math.round(hypoRisk.details.totalProtein)}г — через 2-3ч может "накрыть"`,
                            ),
                        );
                    })(),
                ),

                React.createElement('div', {
                    className: 'meal-meta-row',
                    style: {
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '8px 0',
                    },
                },
                    mealQuality && React.createElement('button', {
                        className: 'meal-quality-badge',
                        onClick: (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMealQualityPopup({
                                meal,
                                quality: mealQuality,
                                mealTypeInfo,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom + 8,
                            });
                        },
                        title: 'Качество приёма — нажми для деталей',
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            border: 'none',
                            background: mealQuality.color + '20',
                            color: mealQuality.color,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            flexShrink: 0,
                            minWidth: '28px',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '12px' } },
                            mealQuality.score >= 80 ? '⭐' : mealQuality.score >= 50 ? '📊' : '⚠️',
                        ),
                        React.createElement('span', { style: { fontSize: '11px', fontWeight: 600 } }, mealQuality.score),
                    ),
                    isMobile
                        ? React.createElement('div', {
                            className: 'mobile-mood-btn',
                            onClick: () => openMoodEditor(mealIndex),
                            title: 'Изменить оценки',
                            style: {
                                display: 'flex',
                                gap: '6px',
                                cursor: 'pointer',
                            },
                        },
                            hasRatings ? React.createElement(React.Fragment, null,
                                moodEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fef3c7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, moodEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#b45309' } }, moodVal),
                                ),
                                wellbeingEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#dcfce7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, wellbeingEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#15803d' } }, wellbeingVal),
                                ),
                                stressEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fce7f3',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, stressEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#be185d' } }, stressVal),
                                ),
                            ) : React.createElement('span', {
                                style: {
                                    fontSize: '11px',
                                    color: '#94a3b8',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    background: '#f1f5f9',
                                },
                            }, '+ оценки'))
                        : React.createElement(React.Fragment, null,
                            React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: (e) => onChangeTime(mealIndex, e.target.value) }),
                            React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: (e) => onChangeMood(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: (e) => onChangeWellbeing(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: (e) => onChangeStress(mealIndex, +e.target.value || '') })),
                        ),
                    (meal.items || []).length > 0 && React.createElement('button', {
                        className: 'meal-totals-badge',
                        onClick: (e) => {
                            e.stopPropagation();
                            setTotalsExpanded(!totalsExpanded);
                        },
                        title: 'Показать итоговые КБЖУ приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'КБЖУ',
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, totalsExpanded ? '▴' : '▾'),
                    ),
                    optimizerRecsCount > 0 && React.createElement('button', {
                        className: 'meal-optimizer-badge',
                        onClick: () => setOptimizerPopupOpen(!optimizerPopupOpen),
                        title: 'Советы по улучшению приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'Советы',
                        React.createElement('span', {
                            style: {
                                background: '#f59e0b',
                                color: '#fff',
                                borderRadius: '8px',
                                padding: '0 5px',
                                fontSize: '10px',
                                fontWeight: 700,
                                marginLeft: '3px',
                                lineHeight: '16px',
                            },
                        }, optimizerRecsCount),
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, optimizerPopupOpen ? '▴' : '▾'),
                    ),
                    React.createElement('button', {
                        className: 'meal-delete-btn',
                        onClick: () => onRemoveMeal(mealIndex),
                        title: 'Удалить приём',
                        style: {
                            padding: '4px 6px',
                            fontSize: '14px',
                            lineHeight: 1,
                            flexShrink: 0,
                        },
                    }, '🗑'),
                ),

                totalsExpanded && (meal.items || []).length > 0 && React.createElement('div', {
                    className: 'mpc-totals-wrap',
                    style: {
                        marginTop: '10px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(96, 165, 250, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                },
                    React.createElement('div', { className: 'mpc-grid mpc-header' },
                        React.createElement('span', null, 'ккал'),
                        React.createElement('span', null, 'У'),
                        React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                        React.createElement('span', null, 'Б'),
                        React.createElement('span', null, 'Ж'),
                        React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                        React.createElement('span', null, 'Кл'),
                        React.createElement('span', null, 'ГИ'),
                        React.createElement('span', null, 'Вр'),
                    ),
                    React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
                        React.createElement('span', { title: getNutrientTooltip('kcal', totals.kcal, totals), style: { color: getNutrientColor('kcal', totals.kcal, totals), fontWeight: getNutrientColor('kcal', totals.kcal, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.kcal)),
                        React.createElement('span', { title: getNutrientTooltip('carbs', totals.carbs, totals), style: { color: getNutrientColor('carbs', totals.carbs, totals), fontWeight: getNutrientColor('carbs', totals.carbs, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.carbs)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('simple', totals.simple, totals), style: { color: getNutrientColor('simple', totals.simple, totals), fontWeight: getNutrientColor('simple', totals.simple, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.simple || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('complex', totals.complex, totals), style: { color: getNutrientColor('complex', totals.complex, totals), cursor: 'help' } }, Math.round(totals.complex || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('prot', totals.prot, totals), style: { color: getNutrientColor('prot', totals.prot, totals), fontWeight: getNutrientColor('prot', totals.prot, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.prot)),
                        React.createElement('span', { title: getNutrientTooltip('fat', totals.fat, totals), style: { color: getNutrientColor('fat', totals.fat, totals), fontWeight: getNutrientColor('fat', totals.fat, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fat)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('bad', totals.bad, totals), style: { color: getNutrientColor('bad', totals.bad, totals), fontWeight: getNutrientColor('bad', totals.bad, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.bad || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('good', totals.good, totals), style: { color: getNutrientColor('good', totals.good, totals), fontWeight: getNutrientColor('good', totals.good, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.good || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('trans', totals.trans, totals), style: { color: getNutrientColor('trans', totals.trans, totals), fontWeight: getNutrientColor('trans', totals.trans, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.trans || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('fiber', totals.fiber, totals), style: { color: getNutrientColor('fiber', totals.fiber, totals), fontWeight: getNutrientColor('fiber', totals.fiber, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fiber || 0)),
                        React.createElement('span', { title: getNutrientTooltip('gi', totals.gi, totals), style: { color: getNutrientColor('gi', totals.gi, totals), fontWeight: getNutrientColor('gi', totals.gi, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.gi || 0)),
                        React.createElement('span', { title: getNutrientTooltip('harm', totals.harm, totals), style: { color: getNutrientColor('harm', totals.harm, totals), fontWeight: getNutrientColor('harm', totals.harm, totals) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', totals.harm || 0)),
                    ),
                ),

                optimizerPopupOpen && optimizerRecsCount > 0 && HEYS.MealOptimizer && MealOptimizerSection && React.createElement('div', {
                    className: 'meal-optimizer-expanded',
                    style: {
                        marginTop: '12px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(245, 158, 0, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(245, 158, 0, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                }, React.createElement(MealOptimizerSection, {
                    meal,
                    totals,
                    dayData: dayData || {},
                    profile: profile || {},
                    products: products || [],
                    pIndex,
                    mealIndex,
                    addProductToMeal,
                })),

                showWaveCalcPopup && currentWave && React.createElement('div', {
                    className: 'wave-details-overlay',
                    onClick: (e) => { if (e.target === e.currentTarget) setShowWaveCalcPopup(false); },
                    style: {
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                    },
                },
                    React.createElement('div', {
                        className: 'wave-details-popup',
                        style: {
                            background: '#fff',
                            borderRadius: '16px',
                            padding: '20px',
                            maxWidth: '360px',
                            width: '100%',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        },
                    },
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                            },
                        },
                            React.createElement('h3', {
                                style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' },
                            }, 'Расчёт волны'),
                            React.createElement('button', {
                                onClick: () => setShowWaveCalcPopup(false),
                                style: {
                                    background: 'none', border: 'none', fontSize: '20px',
                                    cursor: 'pointer', color: '#9ca3af', padding: '4px',
                                },
                            }, '×'),
                        ),

                        React.createElement('div', {
                            style: {
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '16px',
                                textAlign: 'center',
                                color: '#fff',
                            },
                        },
                            React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } }, 'Длина волны'),
                            React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),
                            React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } }, currentWave.timeDisplay + ' → ' + currentWave.endTimeDisplay),
                        ),

                        React.createElement('div', {
                            style: {
                                background: '#f8fafc',
                                borderRadius: '10px',
                                padding: '12px',
                                marginBottom: '16px',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                color: '#64748b',
                                textAlign: 'center',
                            },
                        }, 'База × Множитель = ' + (currentWave.baseWaveHours || 3).toFixed(1) + 'ч × '
                        + (currentWave.finalMultiplier || 1).toFixed(2) + ' = ' + (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '🍽️ Факторы еды'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.gi || 0)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.gl < 10 ? '#22c55e' : currentWave.gl > 20 ? '#ef4444' : '#1f2937' } }, (currentWave.gl || 0).toFixed(1)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.protein || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.fiber >= 5 ? '#22c55e' : '#1f2937' } }, Math.round(currentWave.fiber || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.fat || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.carbs || 0) + 'г'),
                            ),
                        ),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '⏰ Дневные факторы'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, '×' + (currentWave.circadianMultiplier || 1).toFixed(2)),
                            ),
                            currentWave.activityBonus && currentWave.activityBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
                                React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, (currentWave.activityBonus * 100).toFixed(0) + '%'),
                            ),
                        ),

                        React.createElement('button', {
                            onClick: () => setShowWaveCalcPopup(false),
                            style: {
                                width: '100%',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '10px',
                                padding: '12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginTop: '8px',
                            },
                        }, 'Закрыть'),
                    ),
                ),
            ),
        );
    }, (prevProps, nextProps) => {
        if (prevProps.meal !== nextProps.meal) return false;
        if (prevProps.meal?.mealType !== nextProps.meal?.mealType) return false;
        if (prevProps.meal?.name !== nextProps.meal?.name) return false;
        if (prevProps.meal?.time !== nextProps.meal?.time) return false;
        if (prevProps.meal?.items?.length !== nextProps.meal?.items?.length) return false;
        if (prevProps.meal?.photos?.length !== nextProps.meal?.photos?.length) return false;
        if (prevProps.mealIndex !== nextProps.mealIndex) return false;
        if (prevProps.displayIndex !== nextProps.displayIndex) return false;
        if (prevProps.isExpanded !== nextProps.isExpanded) return false;
        if (prevProps.allMeals !== nextProps.allMeals) return false;
        return true;
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealCard = MealCard;

    // =========================
    // Meals list
    // =========================
    function renderMealsList(params) {
        const {
            sortedMealsForDisplay,
            day,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params;

        if (!sortedMealsForDisplay || !Array.isArray(sortedMealsForDisplay)) {
            return [];
        }

        if (!MealCard) {
            trackError(new Error('[HEYS Day Meals] MealCard not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
            });
            return [];
        }

        return sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
            const mi = (day.meals || []).findIndex((m) => m.id === sortedMeal.id);
            if (mi === -1) {
                trackError(new Error('[HEYS Day Meals] meal not found in day.meals'), {
                    source: 'day/_meals.js',
                    type: 'missing_meal',
                    mealId: sortedMeal.id,
                });
                return null;
            }

            const meal = day.meals[mi];
            const isExpanded = isMealExpanded(mi, (day.meals || []).length, day.meals, displayIndex);
            const mealNumber = sortedMealsForDisplay.length - displayIndex;
            const isFirst = displayIndex === 0;
            const isCurrentMeal = isFirst && !isMealStale(meal);

            return React.createElement('div', {
                key: meal.id + '_' + (meal.mealType || 'auto'),
                className: 'meal-with-number',
                style: {
                    marginTop: isFirst ? '0' : '24px',
                },
            },
                React.createElement('div', {
                    className: 'meal-number-header',
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '6px',
                        gap: '4px',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-number-badge' + (isCurrentMeal ? ' meal-number-badge--current' : ''),
                        style: {
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isCurrentMeal
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            fontWeight: '700',
                            boxShadow: isCurrentMeal
                                ? '0 2px 8px rgba(34,197,94,0.35)'
                                : '0 2px 8px rgba(59,130,246,0.35)',
                        },
                    }, mealNumber),
                    isCurrentMeal && React.createElement('span', {
                        className: 'meal-current-label',
                        style: {
                            fontSize: '14px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: '#22c55e',
                            marginTop: '4px',
                        },
                    }, 'ТЕКУЩИЙ ПРИЁМ'),
                ),
                React.createElement(MealCard, {
                    meal,
                    mealIndex: mi,
                    displayIndex,
                    products,
                    pIndex,
                    date,
                    setDay,
                    isMobile,
                    isExpanded,
                    onToggleExpand: toggleMealExpand,
                    onChangeMealType: changeMealType,
                    onChangeTime: updateMealTime,
                    onChangeMood: changeMealMood,
                    onChangeWellbeing: changeMealWellbeing,
                    onChangeStress: changeMealStress,
                    onRemoveMeal: removeMeal,
                    openEditGramsModal,
                    openTimeEditor,
                    openMoodEditor,
                    setGrams,
                    removeItem,
                    isMealStale,
                    allMeals: day.meals,
                    isNewItem,
                    optimum,
                    setMealQualityPopup,
                    addProductToMeal,
                    dayData: day,
                    profile: prof,
                    insulinWaveData,
                }),
            );
        });
    }

    function renderEmptyMealsState(params) {
        const { addMeal } = params;

        return React.createElement('div', {
            className: 'empty-meals-state',
            style: {
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
            },
        },
            React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🍽️'),
            React.createElement('div', { style: { fontSize: '18px', fontWeight: '600', marginBottom: '8px' } }, 'Нет приёмов пищи'),
            React.createElement('div', { style: { fontSize: '14px', marginBottom: '24px' } }, 'Добавь свой первый приём пищи'),
            addMeal && React.createElement('button', {
                className: 'button-primary',
                onClick: addMeal,
                style: {
                    padding: '12px 24px',
                    fontSize: '16px',
                },
            }, '➕ Добавить приём'),
        );
    }

    HEYS.dayMealsList = {
        renderMealsList,
        renderEmptyMealsState,
    };

    // =========================
    // Meals display (sorting + list)
    // =========================
    function useMealsDisplay(params) {
        const {
            day,
            safeMeals,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params || {};

        if (!React) return { sortedMealsForDisplay: [], mealsUI: [] };

        const sortedMealsForDisplay = React.useMemo(() => {
            const meals = day?.meals || [];
            if (meals.length <= 1) return meals;

            return [...meals].sort((a, b) => {
                const timeA = U?.timeToMinutes ? U.timeToMinutes(a.time) : null;
                const timeB = U?.timeToMinutes ? U.timeToMinutes(b.time) : null;

                if (timeA === null && timeB === null) return 0;
                if (timeA === null) return 1;
                if (timeB === null) return -1;

                return timeB - timeA;
            });
        }, [safeMeals]);

        const mealsUI = HEYS.dayMealsList?.renderMealsList?.({
            sortedMealsForDisplay,
            day,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        }) || [];

        return { sortedMealsForDisplay, mealsUI };
    }

    HEYS.dayMealsDisplay = {
        useMealsDisplay,
    };

    // =========================
    // Meals chart UI
    // =========================
    const MealsChartUI = {};
    MealsChartUI.renderMealsChart = function renderMealsChart({
        React,
        mealsChartData,
        statsVm,
        mealChartHintShown,
        setMealChartHintShown,
        setShowConfetti,
        setMealQualityPopup,
        newMealAnimatingIndex,
        showFirstPerfectAchievement,
        U,
    }) {
        if (!mealsChartData || !mealsChartData.meals || mealsChartData.meals.length === 0) return null;

        const utils = U || HEYS.utils || {};

        return React.createElement('div', {
            className: 'meals-chart-container',
            style: {
                margin: '12px 0',
                padding: '12px 16px',
                background: 'var(--surface, #fff)',
                borderRadius: '12px',
                border: '1px solid var(--border, #e5e7eb)',
            },
        },
            React.createElement('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '4px',
                },
            },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #6b7280)' } }, '📊 Распределение'),
                    mealsChartData.avgQualityScore > 0 && React.createElement('span', {
                        className: 'meal-avg-score-badge',
                        style: {
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: mealsChartData.avgQualityScore >= 80 ? '#dcfce7' : mealsChartData.avgQualityScore >= 50 ? '#fef3c7' : '#fee2e2',
                            color: mealsChartData.avgQualityScore >= 80 ? '#166534' : mealsChartData.avgQualityScore >= 50 ? '#92400e' : '#991b1b',
                            fontWeight: '600',
                        },
                    }, 'средняя оценка ' + mealsChartData.avgQualityScore),
                    mealsChartData.yesterdayAvgScore > 0 && (() => {
                        const diff = mealsChartData.avgQualityScore - mealsChartData.yesterdayAvgScore;
                        if (Math.abs(diff) < 3) return null;
                        return React.createElement('span', {
                            style: {
                                fontSize: '10px',
                                color: diff > 0 ? '#16a34a' : '#dc2626',
                                fontWeight: '500',
                            },
                        }, diff > 0 ? '↑+' + diff : '↓' + diff);
                    })(),
                ),
            ),
            !mealChartHintShown && React.createElement('div', { className: 'meal-chart-hint' },
                React.createElement('span', null, '👆'),
                'Нажми на полоску для деталей',
            ),
            mealsChartData.meals.length > 1 && React.createElement('div', {
                className: 'meals-day-sparkline',
                style: {
                    position: 'relative',
                    height: '60px',
                    marginBottom: '12px',
                    padding: '8px 0 16px 0',
                },
            },
                (() => {
                    const meals = mealsChartData.meals;
                    const maxKcal = Math.max(...meals.map((m) => m.kcal), 200);
                    const svgW = 280;
                    const svgH = 40;
                    const padding = 10;

                    const parseTime = (t) => {
                        if (!t) return 0;
                        const [h, m] = t.split(':').map(Number);
                        return (h || 0) * 60 + (m || 0);
                    };

                    const times = meals.map((m) => parseTime(m.time)).filter((t) => t > 0);
                    const dataMinTime = times.length > 0 ? Math.min(...times) : 12 * 60;
                    const dataMaxTime = times.length > 0 ? Math.max(...times) : 20 * 60;
                    const minTime = dataMinTime - 30;
                    const maxTime = dataMaxTime + 30;
                    const timeRange = Math.max(maxTime - minTime, 60);

                    const bestIdx = mealsChartData.bestMealIndex;

                    const points = meals.map((m, idx) => {
                        const t = parseTime(m.time);
                        const x = padding + ((t - minTime) / timeRange) * (svgW - 2 * padding);
                        const y = svgH - padding - ((m.kcal / maxKcal) * (svgH - 2 * padding));
                        const r = 3 + Math.min(4, (m.kcal / 200));
                        const isBest = idx === bestIdx && m.quality && m.quality.score >= 70;
                        return { x, y, meal: m, idx, r, isBest };
                    }).sort((a, b) => a.x - b.x);

                    const linePath = points.length > 1
                        ? 'M ' + points.map((p) => `${p.x},${p.y}`).join(' L ')
                        : '';

                    const areaPath = points.length > 1
                        ? `M ${points[0].x},${svgH - padding} `
                        + points.map((p) => `L ${p.x},${p.y}`).join(' ')
                        + ` L ${points[points.length - 1].x},${svgH - padding} Z`
                        : '';

                    const yesterdayMeals = statsVm?.computed?.mealsChartMeta?.yesterdayMeals || [];
                    const yesterdayPath = (() => {
                        if (yesterdayMeals.length < 2) return '';
                        const yMaxKcal = Math.max(maxKcal, ...yesterdayMeals.map((p) => p.kcal));
                        const pts = yesterdayMeals.map((p) => {
                            const x = padding + ((p.t - minTime) / timeRange) * (svgW - 2 * padding);
                            const y = svgH - padding - ((p.kcal / yMaxKcal) * (svgH - 2 * padding));
                            return { x: Math.max(padding, Math.min(svgW - padding, x)), y };
                        }).sort((a, b) => a.x - b.x);
                        return 'M ' + pts.map((p) => `${p.x},${p.y}`).join(' L ');
                    })();

                    return React.createElement('svg', {
                        viewBox: `0 0 ${svgW} ${svgH + 12}`,
                        style: { width: '100%', height: '100%' },
                        preserveAspectRatio: 'xMidYMid meet',
                    },
                        React.createElement('defs', null,
                            React.createElement('linearGradient', { id: 'mealSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#10b981', stopOpacity: '0.3' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#10b981', stopOpacity: '0.05' }),
                            ),
                            React.createElement('linearGradient', { id: 'goodZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.02' }),
                            ),
                            React.createElement('linearGradient', { id: 'snackZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#eab308', stopOpacity: '0.08' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#eab308', stopOpacity: '0.01' }),
                            ),
                            React.createElement('linearGradient', { id: 'badZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: '0.02' }),
                            ),
                        ),
                        (() => {
                            const firstMealTime = times.length > 0 ? Math.min(...times) : 8 * 60;
                            const endOfDayMinutes = 27 * 60;
                            const slotDuration = (endOfDayMinutes - firstMealTime) / 6;

                            const zones = [
                                { start: firstMealTime - 30, end: firstMealTime + slotDuration * 0.3, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 0.8, end: firstMealTime + slotDuration * 1.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 2.8, end: firstMealTime + slotDuration * 3.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 4.5, end: endOfDayMinutes, gradient: 'url(#badZoneGrad)' },
                            ];

                            return zones.map((zone, i) => {
                                const x1 = padding + ((zone.start - minTime) / timeRange) * (svgW - 2 * padding);
                                const x2 = padding + ((zone.end - minTime) / timeRange) * (svgW - 2 * padding);
                                if (x2 < padding || x1 > svgW - padding) return null;
                                const clampedX1 = Math.max(padding, x1);
                                const clampedX2 = Math.min(svgW - padding, x2);
                                if (clampedX2 <= clampedX1) return null;
                                return React.createElement('rect', {
                                    key: 'zone-' + i,
                                    x: clampedX1,
                                    y: 0,
                                    width: clampedX2 - clampedX1,
                                    height: svgH,
                                    fill: zone.gradient,
                                    rx: 3,
                                });
                            });
                        })(),
                        yesterdayPath && React.createElement('path', {
                            d: yesterdayPath,
                            fill: 'none',
                            stroke: '#9ca3af',
                            strokeWidth: '1.5',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-yesterday',
                        }),
                        areaPath && React.createElement('path', {
                            d: areaPath,
                            fill: 'url(#mealSparkGrad)',
                            className: 'meal-sparkline-area',
                        }),
                        linePath && React.createElement('path', {
                            d: linePath,
                            fill: 'none',
                            stroke: '#10b981',
                            strokeWidth: '2',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-line',
                            style: { strokeDasharray: 500, strokeDashoffset: 500 },
                        }),
                        points.map((p, i) =>
                            React.createElement('g', {
                                key: i,
                                className: 'meal-sparkline-dot',
                                style: { '--dot-delay': (1 + i * 0.4) + 's' },
                            },
                                p.isBest && React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r + 4,
                                    fill: 'none',
                                    stroke: '#22c55e',
                                    strokeWidth: '2',
                                    opacity: 0.6,
                                    className: 'sparkline-pulse',
                                }),
                                React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r,
                                    fill: p.meal.quality ? p.meal.quality.color : '#10b981',
                                    stroke: p.isBest ? '#22c55e' : '#fff',
                                    strokeWidth: p.isBest ? 2 : 1.5,
                                    style: { cursor: 'pointer' },
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        const quality = p.meal.quality;
                                        if (!quality) return;
                                        const svg = e.target.closest('svg');
                                        const svgRect = svg.getBoundingClientRect();
                                        const viewBox = svg.viewBox.baseVal;
                                        const scaleX = svgRect.width / viewBox.width;
                                        const scaleY = svgRect.height / viewBox.height;
                                        const screenX = svgRect.left + p.x * scaleX;
                                        const screenY = svgRect.top + p.y * scaleY;
                                        if (!mealChartHintShown) {
                                            setMealChartHintShown(true);
                                            try {
                                                utils.lsSet ? utils.lsSet('heys_meal_hint_shown', '1') : localStorage.setItem('heys_meal_hint_shown', '1');
                                            } catch { }
                                        }
                                        if (quality.score >= 95) {
                                            setShowConfetti(true);
                                            setTimeout(() => setShowConfetti(false), 2000);
                                        }
                                        setMealQualityPopup({
                                            meal: p.meal,
                                            quality,
                                            mealTypeInfo: { label: p.meal.name, icon: p.meal.icon },
                                            x: screenX,
                                            y: screenY + 15,
                                        });
                                    },
                                }),
                            ),
                        ),
                        points.map((p, i) =>
                            React.createElement('text', {
                                key: 'time-' + i,
                                x: p.x,
                                y: svgH + 10,
                                fontSize: '8',
                                fill: '#9ca3af',
                                textAnchor: 'middle',
                            }, p.meal.time || ''),
                        ),
                    );
                })(),
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' } },
                React.createElement('div', {
                    className: 'meals-target-line',
                    style: {
                        position: 'absolute',
                        left: 'calc(100px + 100%)',
                        top: 0,
                        bottom: 0,
                        width: '0',
                        borderLeft: '2px dashed rgba(16, 185, 129, 0.4)',
                        pointerEvents: 'none',
                        zIndex: 1,
                    },
                }),
                mealsChartData.meals.map((meal, i) => {
                    const originalIndex = i;
                    const widthPct = mealsChartData.targetKcal > 0
                        ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
                        : 0;
                    const barWidthPct = widthPct > 0 && widthPct < 12 ? 12 : widthPct;
                    const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
                    const quality = meal.quality;
                    const isBest = mealsChartData.bestMealIndex === originalIndex && quality && quality.score >= 70;
                    const barFill = quality
                        ? `linear-gradient(90deg, ${quality.color} 0%, ${quality.color}cc 100%)`
                        : (isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)');
                    const problemBadges = quality?.badges?.filter((b) => !b.ok).slice(0, 3) || [];
                    const openQualityModal = (e) => {
                        if (!quality) return;
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (!mealChartHintShown) {
                            setMealChartHintShown(true);
                            try { utils.lsSet ? utils.lsSet('heys_meal_hint_shown', '1') : localStorage.setItem('heys_meal_hint_shown', '1'); } catch { }
                        }
                        if (quality.score >= 95) {
                            setShowConfetti(true);
                            setTimeout(() => setShowConfetti(false), 2000);
                        }
                        setMealQualityPopup({
                            meal,
                            quality,
                            mealTypeInfo: { label: meal.name, icon: meal.icon },
                            x: rect.left + rect.width / 2,
                            y: rect.bottom,
                        });
                    };
                    const isLowScore = quality && quality.score < 50;
                    const isNewMeal = newMealAnimatingIndex === originalIndex;
                    return React.createElement('div', {
                        key: i,
                        className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 6px',
                            marginLeft: '-6px',
                            marginRight: '-6px',
                            borderRadius: '6px',
                            background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            transition: 'background 0.2s ease',
                        },
                    },
                        meal.time && React.createElement('span', {
                            style: {
                                width: '50px',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #374151)',
                                textAlign: 'left',
                                flexShrink: 0,
                            },
                        }, utils.formatMealTime ? utils.formatMealTime(meal.time) : meal.time),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: '90px',
                                fontSize: '15px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #1e293b)',
                                flexShrink: 0,
                            },
                        },
                            React.createElement('span', { style: { fontSize: '16px' } }, meal.icon),
                            React.createElement('span', null, meal.name),
                        ),
                        React.createElement('div', {
                            className: 'meal-bar-container' + (isBest ? ' meal-bar-best' : '') + (quality && quality.score >= 80 ? ' meal-bar-excellent' : ''),
                            role: quality ? 'button' : undefined,
                            tabIndex: quality ? 0 : undefined,
                            onClick: openQualityModal,
                            onKeyDown: quality ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualityModal(); } } : undefined,
                            style: {
                                flex: 1,
                                minWidth: 0,
                                height: '22px',
                                background: 'var(--meal-bar-track, rgba(148,163,184,0.24))',
                                borderRadius: '4px',
                                overflow: 'visible',
                                position: 'relative',
                                cursor: quality ? 'pointer' : 'default',
                                boxShadow: isBest ? '0 0 0 2px #fbbf24, 0 2px 8px rgba(251,191,36,0.3)' : undefined,
                            },
                        },
                            React.createElement('div', {
                                style: {
                                    width: barWidthPct + '%',
                                    height: '100%',
                                    background: barFill,
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease',
                                },
                            }),
                            meal.kcal > 0 && React.createElement('span', {
                                style: {
                                    position: 'absolute',
                                    left: `calc(${barWidthPct}% + 6px)`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    color: 'var(--text-primary, #1f2937)',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                },
                            },
                                meal.kcal + ' ккал',
                                React.createElement('span', {
                                    style: {
                                        fontSize: '9px',
                                        color: 'var(--text-tertiary, #9ca3af)',
                                        fontWeight: '500',
                                    },
                                }, '(' + Math.round(widthPct) + '%)'),
                            ),
                            problemBadges.length > 0 && React.createElement('div', {
                                style: {
                                    position: 'absolute',
                                    right: '4px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    gap: '2px',
                                },
                            },
                                problemBadges.map((b, idx) =>
                                    React.createElement('span', {
                                        key: idx,
                                        style: {
                                            fontSize: '8px',
                                            padding: '1px 3px',
                                            borderRadius: '3px',
                                            background: 'rgba(239,68,68,0.9)',
                                            color: '#fff',
                                            fontWeight: '600',
                                        },
                                    }, '!' + b.type),
                                ),
                            ),
                        ),
                        quality && React.createElement('span', { className: 'meal-quality-score', style: { color: quality.color, flexShrink: 0 } }, '⭐' + quality.score),
                    );
                }),
                mealsChartData.qualityStreak >= 3 && React.createElement('div', { className: 'meal-quality-streak-banner' },
                    React.createElement('span', { className: 'streak-fire' }, '🔥'),
                    React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } }, mealsChartData.qualityStreak + ' отличных приёмов подряд!'),
                    React.createElement('span', { style: { fontSize: '16px' } }, '🏆'),
                ),
                showFirstPerfectAchievement && React.createElement('div', { className: 'first-perfect-meal-badge', style: { marginTop: '8px' } },
                    React.createElement('span', { className: 'trophy' }, '🏆'),
                    'Первый идеальный приём!',
                    React.createElement('span', null, '✨'),
                ),
            ),
        );
    };

    HEYS.dayMealsChartUI = MealsChartUI;

    // =========================
    // Meal expand state
    // =========================
    function useMealExpandState(params) {
        const { date } = params || {};
        if (!React) return {};

        const expandedMealsKey = 'heys_expandedMeals_' + date;

        const [manualExpandedStale, setManualExpandedStale] = React.useState({});
        const [expandedMeals, setExpandedMeals] = React.useState(() => {
            try {
                const stored = localStorage.getItem(expandedMealsKey);
                return stored ? JSON.parse(stored) : {};
            } catch (err) {
                return {};
            }
        });

        React.useEffect(() => {
            try {
                localStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
            } catch (err) { }
        }, [expandedMeals, expandedMealsKey]);

        const toggleMealExpand = React.useCallback((mealIndex, allMeals) => {
            setExpandedMeals((prev) => {
                const next = { ...prev };
                next[mealIndex] = !next[mealIndex];
                return next;
            });
            setManualExpandedStale((prev) => ({ ...prev, [mealIndex]: false }));
        }, []);

        const isMealExpanded = React.useCallback((mealIndex, totalMeals, allMeals, displayIndex) => {
            if (expandedMeals[mealIndex] != null) return expandedMeals[mealIndex];
            if (displayIndex === 0) return true;
            if (totalMeals <= 2) return true;
            return false;
        }, [expandedMeals]);

        const isMealStale = React.useCallback((meal) => {
            if (!meal?.time) return false;
            if (!U?.timeToMinutes) return false;
            const mealMinutes = U.timeToMinutes(meal.time);
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            let minutesSince = nowMinutes - mealMinutes;
            if (minutesSince < 0) minutesSince += 24 * 60;
            return minutesSince > 180;
        }, []);

        return {
            toggleMealExpand,
            isMealExpanded,
            isMealStale,
        };
    }

    HEYS.dayMealsState = {
        useMealExpandState,
    };

    // =========================
    // Meal handlers
    // =========================
    function useMealHandlers(params) {
        const {
            day,
            setDay,
            products,
            pIndex,
            date,
            safeMeals,
            onSave,
        } = params || {};

        const uid = U.uid || (() => 'id_' + Date.now());

        const addMeal = React.useCallback(() => {
            const newMeal = {
                id: uid('meal_'),
                name: 'Приём',
                time: U.getDefaultMealTime ? U.getDefaultMealTime(day?.meals || []) : '12:00',
                items: [],
            };

            setDay((prevDay = {}) => {
                const meals = [...(prevDay.meals || []), newMeal];
                return { ...prevDay, meals, updatedAt: Date.now() };
            });

            if (HEYS.analytics?.trackDataOperation) {
                HEYS.analytics.trackDataOperation('add_meal', { date });
            }
        }, [day?.meals, setDay, date]);

        const updateMealTime = React.useCallback((mealIndex, time) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, time } : m,
                );
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const changeMealType = React.useCallback((mealIndex, newType) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, mealType: newType || undefined } : m,
                );
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const changeMealMood = React.useCallback((mealIndex, mood) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, mood } : m,
                );
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const changeMealWellbeing = React.useCallback((mealIndex, wellbeing) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, wellbeing } : m,
                );
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const changeMealStress = React.useCallback((mealIndex, stress) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, stress } : m,
                );
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeMeal = React.useCallback((mealIndex) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).filter((_, i) => i !== mealIndex);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const openEditGramsModal = React.useCallback((mealIndex, itemId, grams, product) => {
            if (!HEYS.DayEditGramsModal?.open) return;

            HEYS.DayEditGramsModal.open({
                mealIndex,
                itemId,
                grams,
                product,
                onSave: (newGrams) => {
                    setGrams(mealIndex, itemId, newGrams);
                },
            });
        }, []);

        const openTimeEditor = React.useCallback((mealIndex) => {
            if (!HEYS.DayTimeMoodPicker?.open) return;

            HEYS.DayTimeMoodPicker.open({
                mealIndex,
                day,
                onSave: (data) => {
                    if (data?.time) updateMealTime(mealIndex, data.time);
                    if (data?.mood != null) changeMealMood(mealIndex, data.mood);
                    if (data?.wellbeing != null) changeMealWellbeing(mealIndex, data.wellbeing);
                    if (data?.stress != null) changeMealStress(mealIndex, data.stress);
                },
            });
        }, [day, updateMealTime, changeMealMood, changeMealWellbeing, changeMealStress]);

        const openMoodEditor = React.useCallback((mealIndex) => {
            if (!HEYS.DayTimeMoodPicker?.open) return;

            HEYS.DayTimeMoodPicker.open({
                mealIndex,
                day,
                mode: 'mood',
                onSave: (data) => {
                    if (data?.mood != null) changeMealMood(mealIndex, data.mood);
                    if (data?.wellbeing != null) changeMealWellbeing(mealIndex, data.wellbeing);
                    if (data?.stress != null) changeMealStress(mealIndex, data.stress);
                },
            });
        }, [day, changeMealMood, changeMealWellbeing, changeMealStress]);

        const setGrams = React.useCallback((mealIndex, itemId, grams) => {
            const newGrams = parseFloat(grams) || 0;
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex) return m;
                    const items = (m.items || []).map((it) =>
                        it.id === itemId ? { ...it, grams: newGrams } : it,
                    );
                    return { ...m, items };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeItem = React.useCallback((mealIndex, itemId) => {
            setDay((prevDay = {}) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex) return m;
                    const items = (m.items || []).filter((it) => it.id !== itemId);
                    return { ...m, items };
                });
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        return {
            addMeal,
            updateMealTime,
            changeMealType,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
        };
    }

    HEYS.dayMealsHandlers = {
        useMealHandlers,
    };
})(window);

// ===== End day/_meals.js =====

// ===== Begin heys_day_diary_section.js =====
(function (HEYS) {
    'use strict';

    const renderDiarySection = (params) => {
        const {
            React,
            isMobile,
            mobileSubTab,
            goalProgressBar,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            addMeal,
            day,
            mealsUI,
            daySummary,
            HEYS: rootHEYs
        } = params || {};

        if (!React) return null;

        const app = rootHEYs || HEYS;
        const showDiary = !isMobile || mobileSubTab === 'diary';

        const insulinIndicator = app.dayInsulinWaveUI?.renderInsulinWaveIndicator?.({
            React,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            mobileSubTab,
            isMobile,
            openExclusivePopup,
            HEYS: app
        }) || null;

        if (!showDiary) return insulinIndicator;

        return React.createElement(React.Fragment, null,
            goalProgressBar,
            mealsChart,
            insulinIndicator,
            React.createElement('h2', {
                id: 'diary-heading',
                style: {
                    fontSize: '24px',
                    fontWeight: '800',
                    color: '#1e293b',
                    margin: '28px 0 20px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    scrollMarginTop: '150px'
                }
            }, 'ДНЕВНИК ПИТАНИЯ'),
            React.createElement('button', {
                className: 'add-meal-btn-full',
                onClick: addMeal,
                style: {
                    width: '100%',
                    padding: '18px 24px',
                    marginBottom: '20px',
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#fff',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                    transition: 'all 0.2s ease',
                    WebkitTapHighlightColor: 'transparent'
                }
            },
                React.createElement('span', { style: { fontSize: '22px' } }, '➕'),
                'Добавить приём пищи'
            ),
            (!day?.meals || day.meals.length === 0) && React.createElement('div', { className: 'empty-state' },
                React.createElement('div', { className: 'empty-state-icon' }, '🍽️'),
                React.createElement('div', { className: 'empty-state-title' }, 'Пока нет приёмов пищи'),
                React.createElement('div', { className: 'empty-state-text' }, 'Добавьте первый приём, чтобы начать отслеживание'),
                React.createElement('button', {
                    className: 'btn btn-primary empty-state-btn',
                    onClick: addMeal,
                    style: {
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
                    }
                }, '+ Добавить приём')
            ),
            mealsUI,
            daySummary,
            React.createElement('div', { className: 'row desktop-only', style: { justifyContent: 'flex-start', marginTop: '8px' } },
                React.createElement('button', { className: 'btn', onClick: addMeal }, '+ Приём')
            )
        );
    };

    HEYS.dayDiarySection = HEYS.dayDiarySection || {};
    HEYS.dayDiarySection.renderDiarySection = renderDiarySection;
})(window.HEYS = window.HEYS || {});

// ===== End heys_day_diary_section.js =====

// ===== Begin heys_day_orphan_alert.js =====
// heys_day_orphan_alert.js — Orphan products alert component
// Phase 13A of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js lines 11,923-12,012
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    /**
     * Render orphan products alert (products not found in database)
     * @param {Object} params - Parameters
     * @returns {React.Element|boolean} Alert element or false if no orphans
     */
    function renderOrphanAlert(params) {
        const { orphanCount } = params;

        if (!orphanCount || orphanCount === 0) {
            return false;
        }

        return React.createElement('div', {
            className: 'orphan-alert compact-card',
            style: {
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '1px solid #f59e0b',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
            }
        },
            React.createElement('span', { style: { fontSize: '20px' } }, '⚠️'),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', {
                    style: {
                        fontWeight: 600,
                        color: '#92400e',
                        marginBottom: '4px',
                        fontSize: '14px'
                    }
                }, `${orphanCount} продукт${orphanCount === 1 ? '' : orphanCount < 5 ? 'а' : 'ов'} не найден${orphanCount === 1 ? '' : 'о'} в базе`),
                React.createElement('div', {
                    style: {
                        color: '#a16207',
                        fontSize: '12px',
                        lineHeight: '1.4'
                    }
                }, 'Калории считаются по сохранённым данным. Нажми чтобы увидеть список.'),
                // Список orphan-продуктов
                React.createElement('details', {
                    style: { marginTop: '8px' }
                },
                    React.createElement('summary', {
                        style: {
                            cursor: 'pointer',
                            color: '#92400e',
                            fontSize: '12px',
                            fontWeight: 500
                        }
                    }, 'Показать продукты'),
                    React.createElement('ul', {
                        style: {
                            margin: '8px 0 0 0',
                            padding: '0 0 0 20px',
                            fontSize: '12px',
                            color: '#78350f'
                        }
                    },
                        (HEYS.orphanProducts?.getAll?.() || []).map((o, i) =>
                            React.createElement('li', { key: o.name || i, style: { marginBottom: '4px' } },
                                React.createElement('strong', null, o.name),
                                ` — ${o.hasInlineData ? '✓ можно восстановить' : '⚠️ нет данных'}`,
                                // Показываем даты использования
                                o.usedInDays && o.usedInDays.length > 0 && React.createElement('div', {
                                    style: { fontSize: '11px', color: '#92400e', marginTop: '2px' }
                                }, `📅 ${o.usedInDays.slice(0, 5).join(', ')}${o.usedInDays.length > 5 ? ` и ещё ${o.usedInDays.length - 5}...` : ''}`)
                            )
                        )
                    ),
                    // Кнопка восстановления
                    React.createElement('button', {
                        style: {
                            marginTop: '10px',
                            padding: '8px 16px',
                            background: '#f59e0b',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        },
                        onClick: async () => {
                            const result = await HEYS.orphanProducts?.restore?.();
                            if (result?.success) {
                                HEYS.Toast?.success(`Восстановлено ${result.count} продуктов! Обновите страницу для применения.`) || alert(`✅ Восстановлено ${result.count} продуктов!\nОбновите страницу для применения.`);
                                window.location.reload();
                            } else {
                                HEYS.Toast?.warning('Не удалось восстановить — нет данных в штампах.') || alert('⚠️ Не удалось восстановить — нет данных в штампах.');
                            }
                        }
                    }, '🔧 Восстановить в базу')
                )
            )
        );
    }

    // Export module
    HEYS.dayOrphanAlert = {
        renderOrphanAlert
    };

})(window);

// ===== End heys_day_orphan_alert.js =====
