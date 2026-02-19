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
            const protPct = (prot * 3) / kcal;
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

        const protCalRatio = kcal > 0 ? (prot * 3) / kcal : 0;
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
                        const protPct = (totals.prot * 3) / totals.kcal;
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