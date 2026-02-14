/**
 * HEYS Insights — Smart Product Picker v2.5
 * Персонализированный подбор продуктов на основе истории питания (30 дней)
 * 
 * @module pi_product_picker
 * @version 2.5.0
 * @date 14.02.2026
 */

(function (global) {
    'use strict';

    const MODULE_NAME = 'HEYS.InsightsPI.productPicker';

    // ============================================================================
    // Constants
    // ============================================================================

    const HISTORY_DAYS = 30;
    const MIN_PRODUCTS_PER_CATEGORY = 5;

    const PRODUCT_CATEGORIES = {
        DAIRY: 'dairy',
        PROTEIN: 'protein',
        VEGETABLES: 'vegetables',
        FRUITS: 'fruits',
        GRAINS: 'grains',
        SNACKS: 'snacks',
        OTHER: 'other',
    };

    // Category keywords для автоматической классификации
    const CATEGORY_KEYWORDS = {
        dairy: ['молоко', 'творог', 'йогурт', 'кефир', 'сыр', 'ряженка', 'сметана'],
        protein: ['курица', 'куриц', 'курин', 'мясо', 'говядина', 'свинина', 'рыба', 'яйц', 'яйко', 'яй', 'индейка', 'тунец', 'грудка'],
        vegetables: ['огурец', 'огурц', 'помидор', 'капуста', 'морковь', 'салат', 'перец', 'брокколи'],
        fruits: ['яблоко', 'банан', 'апельсин', 'груша', 'киви', 'ягод', 'виноград'],
        grains: ['рис', 'гречка', 'овсянка', 'хлеб', 'макарон', 'крупа', 'каша'],
        snacks: ['орех', 'батончик', 'печенье', 'крекер', 'чипсы'],
    };

    // Scoring weights для multi-factor системы
    const SCORING_WEIGHTS = {
        proteinAlignment: 0.25,
        carbAlignment: 0.20,
        kcalFit: 0.20,
        giAwareness: 0.15,
        harmMinimization: 0.10,
        familiarityBoost: 0.10,
    };

    function buildLocalStorageFallbackLsGet() {
        return function (key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null || raw === undefined) return fallback;
                return JSON.parse(raw);
            } catch (err) {
                console.warn(`[${MODULE_NAME}] ⚠️ localStorage fallback read failed:`, {
                    key,
                    message: err?.message,
                });
                return fallback;
            }
        };
    }

    function resolveLsGet(lsGetFromParams) {
        if (typeof lsGetFromParams === 'function') return lsGetFromParams;
        if (typeof global.U?.lsGet === 'function') return global.U.lsGet.bind(global.U);
        if (typeof global.HEYS?.utils?.lsGet === 'function') return global.HEYS.utils.lsGet.bind(global.HEYS.utils);
        return buildLocalStorageFallbackLsGet();
    }

    // ============================================================================
    // Product History Analyzer
    // ============================================================================

    /**
     * Собирает историю съеденных продуктов за последние N дней
     * @param {number} days - количество дней для анализа
     * @param {Function} lsGet - функция для получения данных из localStorage
     * @returns {Object} история продуктов с метриками
     */
    function analyzeProductHistory(days, lsGet) {
        const dateOffsetStr = global.HEYS?.utils?.dateOffsetStr || function (offset) {
            const d = new Date();
            d.setDate(d.getDate() + offset);
            return d.toISOString().split('T')[0];
        };

        const productMap = new Map(); // productName -> stats

        for (let i = 0; i < days; i++) {
            const date = dateOffsetStr(-i);
            const dayData = lsGet(`heys_dayv2_${date}`);
            if (!dayData || !dayData.meals) continue;

            // Проходим по всем приёмам пищи
            dayData.meals.forEach((meal) => {
                if (!meal.items) return;

                meal.items.forEach((item) => {
                    const productName = item.title || item.name;
                    if (!productName) return;

                    if (!productMap.has(productName)) {
                        productMap.set(productName, {
                            name: productName,
                            frequency: 0,
                            totalGrams: 0,
                            avgGrams: 0,
                            lastEaten: date,
                            timesOfDay: [],
                            macros: {
                                protein: item.prot || 0,
                                carbs: item.carb || 0,
                                fat: item.fat || 0,
                                kcal: item.kcal || 0,
                            },
                            harm: item.harm || 0,
                            gi: item.gi || 50, // default medium GI
                        });
                    }

                    const stats = productMap.get(productName);
                    stats.frequency += 1;
                    stats.totalGrams += item.grams || 100;
                    stats.timesOfDay.push(meal.time || '12:00');

                    // Update macros (weighted average)
                    if (item.prot) stats.macros.protein = item.prot;
                    if (item.carb) stats.macros.carbs = item.carb;
                    if (item.fat) stats.macros.fat = item.fat;
                    if (item.kcal) stats.macros.kcal = item.kcal;
                });
            });
        }

        // Calculate averages and familiarity scores
        const products = Array.from(productMap.values()).map((p) => {
            p.avgGrams = p.totalGrams / p.frequency;
            p.familiarityScore = calculateFamiliarityScore(p.frequency, days);
            p.category = detectCategory(p.name);
            return p;
        });

        const grouped = groupByCategory(products);
        const avgFrequency = products.reduce((sum, p) => sum + p.frequency, 0) / products.length || 0;

        console.info(`[${MODULE_NAME}] 📊 History analyzed:`, {
            daysAnalyzed: days,
            totalProducts: products.length,
            avgFrequency: Math.round(avgFrequency * 10) / 10,
            byCategory: {
                dairy: grouped.dairy?.length || 0,
                protein: grouped.protein?.length || 0,
                vegetables: grouped.vegetables?.length || 0,
                fruits: grouped.fruits?.length || 0,
                grains: grouped.grains?.length || 0,
                snacks: grouped.snacks?.length || 0,
                other: grouped.other?.length || 0,
            },
            topProducts: products
                .sort((a, b) => b.frequency - a.frequency)
                .slice(0, 3)
                .map(p => ({ name: p.name, frequency: p.frequency, category: p.category }))
        });

        return {
            products,
            totalProducts: products.length,
            byCategory: grouped,
            avgFrequency,
        };
    }

    /**
     * Вычисляет familiarity score (1-10) на основе частоты употребления
     * @param {number} frequency - сколько раз съеден за период
     * @param {number} totalDays - общее количество дней в периоде
     * @returns {number} score от 1 до 10
     */
    function calculateFamiliarityScore(frequency, totalDays) {
        const ratio = frequency / totalDays;
        // 0.03 (1x/month) -> 3, 0.1 (3x/month) -> 5, 0.2 (6x/month) -> 7, 0.5+ (15x/month) -> 10
        if (ratio >= 0.5) return 10;
        if (ratio >= 0.3) return 9;
        if (ratio >= 0.2) return 7;
        if (ratio >= 0.1) return 5;
        if (ratio >= 0.05) return 3;
        return 1;
    }

    /**
     * Определяет категорию продукта по названию
     * @param {string} productName - название продукта
     * @returns {string} категория
     */
    function detectCategory(productName) {
        const normalized = productName.toLowerCase();

        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some((kw) => normalized.includes(kw))) {
                return category;
            }
        }

        return PRODUCT_CATEGORIES.OTHER;
    }

    /**
     * Группирует продукты по категориям
     * @param {Array} products - список продуктов
     * @returns {Object} продукты по категориям
     */
    function groupByCategory(products) {
        const grouped = {};
        Object.values(PRODUCT_CATEGORIES).forEach((cat) => {
            grouped[cat] = [];
        });

        products.forEach((p) => {
            const cat = p.category || PRODUCT_CATEGORIES.OTHER;
            grouped[cat].push(p);
        });

        return grouped;
    }

    // ============================================================================
    // Multi-Factor Scoring System
    // ============================================================================

    /**
     * Вычисляет multi-factor score для продукта в контексте сценария
     * @param {Object} product - продукт из истории
     * @param {Object} scenario - контекст сценария (remainingKcal, targetProtein, etc.)
     * @param {number} typicalPortion - типичная порция (grams) для этого продукта
     * @returns {number} score от 0 до 100
     */
    function calculateProductScore(product, scenario, typicalPortion = 100) {
        const scores = {};

        // 1. Protein Alignment (25%)
        const proteinPercentInProduct = (product.macros.protein / product.macros.kcal) * 100 || 0;
        const proteinTargetPercent = (scenario.targetProteinG * 4 / scenario.targetKcal) * 100 || 25;
        const proteinDiff = Math.abs(proteinPercentInProduct - proteinTargetPercent);
        scores.proteinAlignment = Math.max(0, 100 - proteinDiff * 2); // Penalize deviation

        // 2. Carb Appropriateness (20%)
        const carbPercentInProduct = (product.macros.carbs / product.macros.kcal) * 100 || 0;
        const carbTargetPercent = (scenario.targetCarbsG * 4 / scenario.targetKcal) * 100 || 40;
        const carbDiff = Math.abs(carbPercentInProduct - carbTargetPercent);
        scores.carbAlignment = Math.max(0, 100 - carbDiff * 2);

        // 3. Kcal Fit (20%)
        const portionKcal = (product.macros.kcal * typicalPortion) / 100;
        const kcalRatio = portionKcal / scenario.remainingKcal;
        // Ideal: 0.4-0.8 of remaining (not too small, not violating)
        if (kcalRatio >= 0.4 && kcalRatio <= 0.8) {
            scores.kcalFit = 100;
        } else if (kcalRatio > 0.8) {
            scores.kcalFit = Math.max(0, 100 - (kcalRatio - 0.8) * 200); // Penalize heavily
        } else {
            scores.kcalFit = Math.max(0, 50 + (kcalRatio / 0.4) * 50); // Penalize lightly
        }

        // 4. GI Awareness (15%)
        const idealGI = scenario.idealGI || 50;
        const giDiff = Math.abs(product.gi - idealGI);
        scores.giAwareness = Math.max(0, 100 - giDiff);

        // 5. Harm Minimization (10%)
        const harmScore = product.harm || 0;
        scores.harmMinimization = Math.max(0, 100 - harmScore * 10); // harm 0-10 scale

        // 6. Familiarity Boost (10%)
        scores.familiarityBoost = product.familiarityScore * 10; // 1-10 -> 10-100

        // Weighted sum
        const totalScore =
            scores.proteinAlignment * SCORING_WEIGHTS.proteinAlignment +
            scores.carbAlignment * SCORING_WEIGHTS.carbAlignment +
            scores.kcalFit * SCORING_WEIGHTS.kcalFit +
            scores.giAwareness * SCORING_WEIGHTS.giAwareness +
            scores.harmMinimization * SCORING_WEIGHTS.harmMinimization +
            scores.familiarityBoost * SCORING_WEIGHTS.familiarityBoost;

        const finalScore = Math.round(totalScore);

        // Verbose logging only for high scores (> 70) to avoid spam
        if (finalScore > 70) {
            console.info(`[${MODULE_NAME}] 🎯 High-score product:`, {
                product: product.name,
                score: finalScore,
                topFactors: Object.entries(scores)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([key, val]) => `${key}=${Math.round(val)}`)
                    .join(', ')
            });
        }

        return {
            totalScore: finalScore,
            breakdown: scores,
        };
    }

    // ============================================================================
    // Main Picker Logic
    // ============================================================================

    /**
     * Подбирает продукты для сценария на основе истории или fallback
     * @param {Object} scenario - контекст сценария
     * @param {Object} history - история продуктов (из analyzeProductHistory)
     * @param {Array} fallbackProducts - общая база продуктов (если история недостаточна)
     * @param {number} limit - максимум продуктов для возврата
     * @returns {Array} список рекомендованных продуктов
     */
    function pickProducts(scenario, history, fallbackProducts = [], limit = 3) {
        const targetCategory = scenario.category || PRODUCT_CATEGORIES.PROTEIN;
        const historyProducts = history.byCategory[targetCategory] || [];

        let candidates = [];

        // Strategy 1: Use history if sufficient
        if (historyProducts.length >= MIN_PRODUCTS_PER_CATEGORY) {
            candidates = historyProducts.map((p) => {
                const score = calculateProductScore(p, scenario, p.avgGrams || 100);
                return {
                    ...p,
                    score: score.totalScore,
                    scoreBreakdown: score.breakdown,
                    source: 'history',
                };
            });
        }
        // Strategy 2: Fallback to general product base
        else if (fallbackProducts.length > 0) {
            const fallbackCandidates = fallbackProducts
                .filter((p) => detectCategory(p.name || p.title) === targetCategory)
                .map((p) => {
                    const product = {
                        name: p.title || p.name,
                        avgGrams: 100, // Default portion size for fallback
                        macros: {
                            protein: p.prot || 0,
                            carbs: p.carb || 0,
                            fat: p.fat || 0,
                            kcal: p.kcal || 0,
                        },
                        harm: p.harm || 0,
                        gi: p.gi || 50,
                        familiarityScore: 0, // Unknown product
                        category: targetCategory,
                    };
                    const score = calculateProductScore(product, scenario, 100);
                    return {
                        ...product,
                        score: score.totalScore,
                        scoreBreakdown: score.breakdown,
                        source: 'fallback',
                    };
                });

            candidates = fallbackCandidates;
        }
        // Strategy 3: Use whatever history we have (even if < MIN_PRODUCTS_PER_CATEGORY)
        else if (historyProducts.length > 0) {
            candidates = historyProducts.map((p) => {
                const score = calculateProductScore(p, scenario, p.avgGrams || 100);
                return {
                    ...p,
                    score: score.totalScore,
                    scoreBreakdown: score.breakdown,
                    source: 'history',
                };
            });
        }

        // Sort by score descending and take top N
        candidates.sort((a, b) => b.score - a.score);
        const picked = candidates.slice(0, limit);

        console.info(`[${MODULE_NAME}] 🥇 Products picked:`, {
            scenario: scenario.scenario,
            category: targetCategory,
            strategy: historyProducts.length >= MIN_PRODUCTS_PER_CATEGORY ? 'HISTORY' :
                (fallbackProducts.length > 0 ? 'FALLBACK' : 'LIMITED_HISTORY'),
            candidatesEvaluated: candidates.length,
            topPicks: picked.map(p => ({
                name: p.name,
                score: p.score,
                source: p.source,
                grams: Math.round(p.avgGrams || 100)
            }))
        });

        return picked;
    }
    // ============================================================================
    // Public API
    // ============================================================================

    /**
     * Генерирует список продуктов для meal recommendation
     * @param {Object} params - параметры запроса
     * @returns {Array} рекомендации продуктов
     */
    function generateProductSuggestions(params) {
        const {
            scenario,
            remainingKcal,
            targetProteinG = 30,
            targetCarbsG = 40,
            targetFatG = 10,
            idealGI = 50,
            lsGet,
            sharedProducts = [],
            limit = 3,
        } = params;

        const safeLsGet = resolveLsGet(lsGet);

        console.info(`[${MODULE_NAME}] 🚀 Generating suggestions:`, {
            scenario,
            remainingKcal,
            targetMacros: { protein: targetProteinG, carbs: targetCarbsG, fat: targetFatG },
            idealGI,
            limit,
            hasLsGet: typeof safeLsGet === 'function',
        });

        // 1. Analyze history
        const history = analyzeProductHistory(HISTORY_DAYS, safeLsGet);

        // 2. Build scenario context
        const scenarioContext = {
            scenario,
            remainingKcal,
            targetProteinG,
            targetCarbsG,
            targetFatG,
            targetKcal: remainingKcal,
            idealGI,
            category: mapScenarioToCategory(scenario),
        };

        // 3. Pick products
        const picks = pickProducts(scenarioContext, history, sharedProducts, limit);

        // 4. Format output
        const suggestions = picks.map((pick) => ({
            product: pick.name,
            grams: Math.round(pick.avgGrams || 100),
            reason: generateProductReason(pick, scenarioContext),
            score: pick.score,
            source: pick.source,
            macros: {
                protein: Math.round((pick.macros.protein * pick.avgGrams) / 100 || 0),
                carbs: Math.round((pick.macros.carbs * pick.avgGrams) / 100 || 0),
                fat: Math.round((pick.macros.fat * pick.avgGrams) / 100 || 0),
                kcal: Math.round((pick.macros.kcal * pick.avgGrams) / 100 || 0),
            },
        }));

        const historyCount = suggestions.filter((s) => s.source === 'history').length;
        const fallbackCount = suggestions.filter((s) => s.source === 'fallback').length;
        const avgScore = suggestions.length > 0
            ? Math.round(suggestions.reduce((sum, s) => sum + s.score, 0) / suggestions.length)
            : 0;
        const totalMacros = suggestions.reduce((sum, s) => ({
            protein: sum.protein + s.macros.protein,
            carbs: sum.carbs + s.macros.carbs,
            kcal: sum.kcal + s.macros.kcal
        }), { protein: 0, carbs: 0, kcal: 0 });

        console.info(`[${MODULE_NAME}] ✅ Selected products:`, {
            scenario,
            count: suggestions.length,
            historyUsed: historyCount,
            fallbackUsed: fallbackCount,
            avgScore,
            totalMacros: {
                protein: Math.round(totalMacros.protein),
                carbs: Math.round(totalMacros.carbs),
                kcal: Math.round(totalMacros.kcal)
            },
            products: suggestions.map(s => `${s.product} (${s.grams}г, score=${s.score})`)
        });

        return suggestions;
    }

    /**
     * Определяет подходящую категорию для сценария
     */
    function mapScenarioToCategory(scenario) {
        const categoryMap = {
            GOAL_REACHED: PRODUCT_CATEGORIES.SNACKS,
            LIGHT_SNACK: PRODUCT_CATEGORIES.FRUITS,
            LATE_EVENING: PRODUCT_CATEGORIES.DAIRY,
            PRE_WORKOUT: PRODUCT_CATEGORIES.GRAINS,
            POST_WORKOUT: PRODUCT_CATEGORIES.PROTEIN,
            PROTEIN_DEFICIT: PRODUCT_CATEGORIES.PROTEIN,
            STRESS_EATING: PRODUCT_CATEGORIES.SNACKS,
            BALANCED: PRODUCT_CATEGORIES.PROTEIN,
        };
        return categoryMap[scenario] || PRODUCT_CATEGORIES.PROTEIN;
    }

    /**
     * Генерирует краткое объяснение выбора продукта
     */
    function generateProductReason(pick, scenario) {
        if (pick.source === 'history' && pick.familiarityScore >= 7) {
            return `Ваш частый выбор (${pick.frequency}x за месяц)`;
        }
        if (pick.scoreBreakdown.proteinAlignment > 80) {
            return 'Высокое содержание белка';
        }
        if (pick.scoreBreakdown.kcalFit > 80) {
            return 'Оптимальная калорийность';
        }
        if (pick.scoreBreakdown.giAwareness > 80) {
            return scenario.idealGI < 50 ? 'Низкий ГИ' : 'Медленные углеводы';
        }
        return 'Сбалансированные макросы';
    }

    // ============================================================================
    // Module Export
    // ============================================================================

    global.HEYS = global.HEYS || {};
    global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};
    global.HEYS.InsightsPI.productPicker = {
        generateProductSuggestions,
        analyzeProductHistory,
        calculateProductScore,
        // Exports for testing
        _internal: {
            detectCategory,
            calculateFamiliarityScore,
            mapScenarioToCategory,
        },
    };

    console.info(`[${MODULE_NAME}] ✅ Smart Product Picker v2.5 initialized (30d history, 6-factor scoring)`);
})(typeof window !== 'undefined' ? window : global);
