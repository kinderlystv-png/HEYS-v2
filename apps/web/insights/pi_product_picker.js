/**
 * HEYS Insights — Smart Product Picker v3.2.1
 * Персонализированный подбор продуктов на основе истории питания (30 дней)
 * 
 * v3.2.1: Fat category guaranteed slot (17.02.2026)
 *   - Гарантия минимум 1 слот для категории жиров если >= 5% от макросов
 *   - Исправлено: жиры (9%) исчезали при округлении (0.09 * 5 = 0.45 → 0)
 *   - Теперь: fatPct >= 5% → минимум 1 слот → DAIRY группа всегда видна
 * 
 * v3.2: LATE_EVENING grouped mode (17.02.2026)
 *   - Добавлен LATE_EVENING в BALANCED_SCENARIOS
 *   - При любом остатке калорий для позднего вечера → grouped products (белки + углеводы + жиры)
 *   - Позволяет выбрать несколько категорий продуктов вместо одной молочки
 * 
 * v3.1: Balanced product mix (17.02.2026)
 *   - determineCategoryMix(): выбор категорий по пропорциям макросов
 *   - pickProductsMix(): подбор продуктов из РАЗНЫХ категорий для баланса
 *   - Для PROTEIN_DEFICIT (59g белка, 23g углеводов) → 2 белковых + 1 углеводный продукт
 *   - Избегает дубликации (курица + индейка → курица + греча)
 * 
 * v3.0: 11-factor scoring system (Phase A/B/C patterns integration)
 *   - Phase A (Core): C37 sugar, caffeine-awareness
 *   - Phase B (Context): C10 fiber boost
 *   - Phase C (Micronutrients): C26 minerals, C29 NOVA quality
 * 
 * @module pi_product_picker
 * @version 3.2.1
 * @date 17.02.2026
 */

(function (global) {
    'use strict';

    const MODULE_NAME = 'HEYS.InsightsPI.productPicker';
    const LOG_FILTER = 'MEALREC';
    const LOG_PREFIX = `[${LOG_FILTER}][${MODULE_NAME}]`;

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

    // Caffeine keywords for time-aware filtering (v2.6 feature - prevents coffee before sleep)
    const CAFFEINE_KEYWORDS = [
        'кофе', 'coffee', 'эспрессо', 'espresso', 'капучино', 'cappuccino', 'латте', 'latte',
        'чай черный', 'чёрный чай', 'black tea', 'энергетик', 'energy drink', 'энерджи'
    ];

    // Added sugar cues for dependency-aware penalty (Phase A: C37)
    const ADDED_SUGAR_KEYWORDS = [
        'сахар', 'sugar', 'шоколад', 'конфет', 'печенье', 'торт', 'пирож', 'сироп',
        'газировка', 'cola', 'кока-кола', 'сок', 'juice', 'мороженое', 'варенье', 'мед'
    ];

    const EVENING_CAFFEINE_CUTOFF_HOUR = 20; // After 20:00, penalize caffeine heavily

    // Category keywords для автоматической классификации
    const CATEGORY_KEYWORDS = {
        dairy: ['молоко', 'творог', 'йогурт', 'кефир', 'сыр', 'ряженка', 'сметана'],
        protein: ['курица', 'куриц', 'курин', 'мясо', 'говядина', 'свинина', 'рыба', 'яйц', 'яйко', 'яй', 'индейка', 'тунец', 'грудка'],
        vegetables: ['огурец', 'огурц', 'помидор', 'капуста', 'морковь', 'салат', 'перец', 'брокколи'],
        fruits: ['яблоко', 'банан', 'апельсин', 'груша', 'киви', 'ягод', 'виноград'],
        grains: ['рис', 'гречка', 'овсянка', 'хлеб', 'макарон', 'крупа', 'каша'],
        snacks: ['орех', 'батончик', 'печенье', 'крекер', 'чипсы'],
    };

    // Scoring weights для multi-factor системы (v3.0 Phase A/B/C integration)
    const SCORING_WEIGHTS = {
        proteinAlignment: 0.20,
        carbAlignment: 0.14,
        kcalFit: 0.14,
        caffeineAwareness: 0.09, // v2.6: time-aware caffeine penalty (evening)
        sugarAwareness: 0.09, // Phase A: C37 added sugar dependency
        fiberBoost: 0.08, // Phase B: C10 fiber regularity (boost high-fiber products)
        micronutrientBoost: 0.10, // Phase C: C26 micronutrient radar (boost Fe/Mg/Zn/Ca if deficit)
        novaQuality: 0.08, // Phase C: C29 NOVA quality (penalty NOVA-4)
        harmMinimization: 0.06,
        familiarityBoost: 0.02,
    };

    function buildLocalStorageFallbackLsGet() {
        return function (key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null || raw === undefined) return fallback;
                return JSON.parse(raw);
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ localStorage fallback read failed:`, {
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
                            product_id: item.product_id,
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

        console.info(`${LOG_PREFIX} 📊 History analyzed:`, {
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
     * Проверяет, содержит ли продукт кофеин
     * @param {string} productName - название продукта
     * @returns {boolean} true если содержит кофеин
     */
    function containsCaffeine(productName) {
        const normalized = productName.toLowerCase();
        return CAFFEINE_KEYWORDS.some((kw) => normalized.includes(kw));
    }

    /**
     * Проверяет, содержит ли продукт добавленный сахар (по названию)
     * @param {string} productName
     * @returns {boolean}
     */
    function containsAddedSugar(productName) {
        const normalized = productName.toLowerCase();
        return ADDED_SUGAR_KEYWORDS.some((kw) => normalized.includes(kw));
    }

    /**
     * Вычисляет multi-factor score для продукта в контексте сценария
     * @param {Object} product - продукт из истории
     * @param {Object} scenario - контекст сценария (remainingKcal, targetProtein, currentTime, etc.)
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

        // 4. Caffeine Awareness (10%) - v2.6 time-sensitive filter
        const hasCaffeine = containsCaffeine(product.name);
        const currentHour = scenario.currentTime ? Math.floor(scenario.currentTime) : 12; // Default to noon if not provided
        if (hasCaffeine && currentHour >= EVENING_CAFFEINE_CUTOFF_HOUR) {
            scores.caffeineAwareness = 0; // Hard penalty after 20:00
            console.warn(`${LOG_PREFIX} ☕❌ Caffeine product penalized (evening):`, {
                product: product.name,
                currentHour,
                cutoffHour: EVENING_CAFFEINE_CUTOFF_HOUR,
                currentTime: scenario.currentTime
            });
        } else if (hasCaffeine) {
            scores.caffeineAwareness = 80; // Minor penalty even during day (not ideal for all scenarios)
            console.info(`${LOG_PREFIX} ☕⚠️ Caffeine product (daytime):`, {
                product: product.name,
                currentHour,
                score: 80
            });
        } else {
            scores.caffeineAwareness = 100; // No caffeine - perfect
        }

        // 5. Sugar Awareness (10%) - Phase A C37 dependency-aware penalty
        const hasAddedSugar = containsAddedSugar(product.name);
        const sugarRiskScore = Number(scenario.addedSugarScore);
        const dependencyRisk = !!scenario.sugarDependencyRisk;

        if (dependencyRisk && hasAddedSugar) {
            scores.sugarAwareness = 0;
            console.warn(`${LOG_PREFIX} 🍬❌ Added sugar product penalized (dependency risk):`, {
                product: product.name,
                dependencyRisk,
                sugarRiskScore
            });
        } else if (hasAddedSugar && Number.isFinite(sugarRiskScore) && sugarRiskScore < 0.6) {
            scores.sugarAwareness = 30;
        } else if (hasAddedSugar) {
            scores.sugarAwareness = 70;
        } else {
            scores.sugarAwareness = 100;
        }

        // 6. GI Awareness (удалена, merged в другие factors)

        // 7. Fiber Boost (8%) - Phase B C10: boost high-fiber products if deficit
        const fiberRegScore = Number(scenario.fiberRegularityScore);
        const fiber100g = Number(product.fiber || product.cellulose || 0); // fiber per 100g
        if (Number.isFinite(fiberRegScore) && fiberRegScore < 0.6) {
            // Fiber deficit detected → boost fiber-rich products exponentially
            if (fiber100g >= 10) {
                scores.fiberBoost = 100; // Very high fiber (10g+/100g)
            } else if (fiber100g >= 5) {
                scores.fiberBoost = 80; // High fiber (5-10g/100g)
            } else if (fiber100g >= 2) {
                scores.fiberBoost = 50; // Medium fiber (2-5g/100g)
            } else {
                scores.fiberBoost = 20; // Low fiber (<2g/100g)
            }
        } else {
            scores.fiberBoost = 70; // Default neutral score (no fiber penalty)
        }

        // 8. Micronutrient Boost (10%) - Phase C C26: boost products rich in deficit minerals
        const microDeficits = scenario.micronutrientDeficits || []; // array: [{nutrient: 'iron', avgPct: 45}, ...]
        let microBoost = 50; // Default neutral
        if (microDeficits.length > 0) {
            // Check if product is rich in deficient minerals
            const productMinerals = {
                iron: Number(product.iron || product.fe || 0),
                magnesium: Number(product.magnesium || product.mg || 0),
                zinc: Number(product.zinc || product.zn || 0),
                calcium: Number(product.calcium || product.ca || 0)
            };

            const richInDeficit = microDeficits.some(d => {
                const mineralKey = d.nutrient;
                const richThreshold = mineralKey === 'iron' ? 3 : mineralKey === 'magnesium' ? 50 : mineralKey === 'zinc' ? 2 : 150; // per 100g
                return productMinerals[mineralKey] >= richThreshold;
            });

            if (richInDeficit) {
                microBoost = 100; // Strong boost for products rich in deficit minerals
            } else {
                microBoost = 40; // Penalty if not addressing deficits
            }
        }
        scores.micronutrientBoost = microBoost;

        // 9. NOVA Quality (8%) - Phase C C29: penalty for ultra-processed (NOVA-4)
        const novaQualityScore = Number(scenario.novaQualityScore);
        const productNova = Number(product.nova_group || product.novaGroup || 3); // Default to NOVA-3
        let novaPenalty = 70; // Default neutral
        if (Number.isFinite(novaQualityScore) && novaQualityScore < 0.6) {
            // High ultra-processed share → strongly prefer NOVA 1-2
            if (productNova === 4) {
                novaPenalty = 0; // Hard penalty for NOVA-4 when quality is low
            } else if (productNova === 3) {
                novaPenalty = 50; // Moderate penalty for NOVA-3
            } else {
                novaPenalty = 100; // Reward NOVA 1-2
            }
        } else {
            // Normal quality → mild preference for lower NOVA
            novaPenalty = productNova === 4 ? 30 : productNova === 3 ? 60 : 90;
        }
        scores.novaQuality = novaPenalty;

        // 10. Harm Minimization (6%)
        const harmScore = product.harm || 0;
        scores.harmMinimization = Math.max(0, 100 - harmScore * 10); // harm 0-10 scale

        // 11. Familiarity Boost (2%)
        scores.familiarityBoost = product.familiarityScore * 10; // 1-10 -> 10-100

        // Weighted sum
        const totalScore =
            scores.proteinAlignment * SCORING_WEIGHTS.proteinAlignment +
            scores.carbAlignment * SCORING_WEIGHTS.carbAlignment +
            scores.kcalFit * SCORING_WEIGHTS.kcalFit +
            scores.caffeineAwareness * SCORING_WEIGHTS.caffeineAwareness +
            scores.sugarAwareness * SCORING_WEIGHTS.sugarAwareness +
            scores.fiberBoost * SCORING_WEIGHTS.fiberBoost +
            scores.micronutrientBoost * SCORING_WEIGHTS.micronutrientBoost +
            scores.novaQuality * SCORING_WEIGHTS.novaQuality +
            scores.harmMinimization * SCORING_WEIGHTS.harmMinimization +
            scores.familiarityBoost * SCORING_WEIGHTS.familiarityBoost;

        // Apply ML weight multiplier from feedback loop (R2.7)
        let mlWeightMultiplier = 1.0;
        if (global.HEYS?.InsightsPI?.feedbackLoop?.getProductWeight) {
            const profile = scenario.profile || global.HEYS?.profile;
            const productId = product.id;
            const scenarioType = scenario.type || 'UNKNOWN';

            if (profile && productId) {
                mlWeightMultiplier = global.HEYS.InsightsPI.feedbackLoop.getProductWeight(
                    profile,
                    productId,
                    scenarioType
                );
            }
        }

        const mlAdjustedScore = totalScore * mlWeightMultiplier;
        const finalScore = Math.round(mlAdjustedScore);

        // Phase B/C verification logging (once per pick cycle)
        if (!window._phaseVerifyLogged && finalScore > 60) {
            window._phaseVerifyLogged = true;
            console.info(`${LOG_PREFIX} 🔬 Phase B/C Scoring Factors (v3.0):`, {
                product: product.name,
                fiberBoost: scores.fiberBoost,
                fiberRegScore,
                micronutrientBoost: scores.micronutrientBoost,
                microDeficits: microDeficits.length,
                novaQuality: scores.novaQuality,
                novaQualityScore,
                productNova,
                mlWeightMultiplier: mlWeightMultiplier !== 1.0 ? mlWeightMultiplier.toFixed(3) : undefined
            });
        }

        // Verbose logging only for high scores (> 70) to avoid spam
        if (finalScore > 70) {
            console.info(`${LOG_PREFIX} 🎯 High-score product:`, {
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

    /**
     * Определяет mix категорий продуктов на основе пропорций макросов
     * Возвращает массив категорий для balanced подбора (разные нутриенты!)
     * 
     * Пример: targetProteinG=59, targetCarbsG=23, targetFatG=3
     * → ~66% белок, ~26% углеводы, ~8% жир
     * → возвращает [PROTEIN, PROTEIN, GRAINS] (2 белковых + 1 углеводный)
     * 
     * @param {number} targetProteinG - целевой белок в граммах
     * @param {number} targetCarbsG - целевые углеводы в граммах
     * @param {number} targetFatG - целевой жир в граммах
     * @param {number} limit - сколько товаров макс (обычно 3)
     * @returns {Array<string>} массив категорий для подбора
     */
    function determineCategoryMix(targetProteinG, targetCarbsG, targetFatG, limit = 3) {
        // Калории из макросов (с TEF adjustment: белок 3kcal/g)
        const protKcal = targetProteinG * 3;
        const carbKcal = targetCarbsG * 4;
        const fatKcal = targetFatG * 9;
        const totalKcal = protKcal + carbKcal + fatKcal;

        if (totalKcal === 0) {
            // Fallback для edge case
            return [PRODUCT_CATEGORIES.PROTEIN, PRODUCT_CATEGORIES.GRAINS, PRODUCT_CATEGORIES.VEGETABLES];
        }

        // Пропорции
        const protPct = protKcal / totalKcal;
        const carbPct = carbKcal / totalKcal;
        const fatPct = fatKcal / totalKcal;

        console.info(`${LOG_PREFIX} 🧮 Macro proportions:`, {
            protein: `${(protPct * 100).toFixed(0)}%`,
            carbs: `${(carbPct * 100).toFixed(0)}%`,
            fat: `${(fatPct * 100).toFixed(0)}%`,
            targetMacros: { protein: targetProteinG, carbs: targetCarbsG, fat: targetFatG }
        });

        // Распределяем слоты категорий пропорционально
        const categories = [];
        const slots = { protein: protPct * limit, carbs: carbPct * limit, fat: fatPct * limit };

        // Округляем и гарантируем минимум 1 слот для макроса >= 5%
        let protSlots = Math.round(slots.protein);
        let carbSlots = Math.round(slots.carbs);
        let fatSlots = Math.round(slots.fat);

        // v3.2.1: Минимум 1 слот для категории >= 5%
        if (protPct >= 0.05 && protSlots === 0) protSlots = 1;
        if (carbPct >= 0.05 && carbSlots === 0) carbSlots = 1;
        if (fatPct >= 0.05 && fatSlots === 0) fatSlots = 1;

        // Корректировка если сумма не равна limit
        let totalSlots = protSlots + carbSlots + fatSlots;
        if (totalSlots < limit) {
            // Добавляем слот dominant макросу
            if (protPct >= carbPct && protPct >= fatPct) protSlots++;
            else if (carbPct >= fatPct) carbSlots++;
            else fatSlots++;
        } else if (totalSlots > limit) {
            // Убираем слот у минимального (но не до нуля если изначально был >= 5%)
            if (fatPct <= protPct && fatPct <= carbPct && (fatSlots > 1 || fatPct < 0.05)) fatSlots--;
            else if (carbPct <= protPct && (carbSlots > 1 || carbPct < 0.05)) carbSlots--;
            else if (protSlots > 1 || protPct < 0.05) protSlots--;
        }

        // Заполняем массив категориями
        for (let i = 0; i < protSlots; i++) categories.push(PRODUCT_CATEGORIES.PROTEIN);
        for (let i = 0; i < carbSlots; i++) categories.push(PRODUCT_CATEGORIES.GRAINS);
        for (let i = 0; i < fatSlots; i++) categories.push(PRODUCT_CATEGORIES.DAIRY); // Молочка часто жирная

        // Если остались свободные слоты → овощи (клетчатка!)
        while (categories.length < limit) {
            categories.push(PRODUCT_CATEGORIES.VEGETABLES);
        }

        console.info(`${LOG_PREFIX} 🎯 Category mix:`, {
            categories,
            slots: { protein: protSlots, carbs: carbSlots, fat: fatSlots }
        });

        return categories;
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
                        product_id: p.id || p.product_id,
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

        const topPicks = picked.map(p => ({
            name: p.name,
            score: p.score,
            source: p.source,
            grams: Math.round(p.avgGrams || 100),
            caffeineAwareness: p.scoreBreakdown?.caffeineAwareness, // v2.6: show caffeine penalty
            topFactors: Object.entries(p.scoreBreakdown || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([key, val]) => `${key}=${Math.round(val)}`)
                .join(', ')
        }));

        // Log with expanded topPicks (more readable in console)
        console.group(
            `${LOG_PREFIX} 🥇 Products picked: [${scenario.scenario}] ${targetCategory.toUpperCase()} | Strategy: ${historyProducts.length >= MIN_PRODUCTS_PER_CATEGORY ? 'HISTORY' : (fallbackProducts.length > 0 ? 'FALLBACK' : 'LIMITED_HISTORY')} | Evaluated: ${candidates.length}`
        );
        console.table(topPicks);
        console.groupEnd();

        return picked;
    }

    /**
     * Подбирает MIX продуктов из разных категорий для сбалансированного приёма
     * v3.1: Возвращает СТРУКТУРУ С ГРУППАМИ для UI с чекбоксами
     * 
     * @param {Array<string>} categories - массив категорий (например [PROTEIN, PROTEIN, GRAINS])
     * @param {Object} scenario - контекст сценария
     * @param {Object} history - история продуктов
     * @param {Array} fallbackProducts - fallback база
     * @param {number} productsPerCategory - сколько продуктов выбрать из каждой категории
     * @returns {Object} { groups: [{ category, categoryName, emoji, products: [] }] }
     */
    function pickProductsMix(categories, scenario, history, fallbackProducts = [], productsPerCategory = 5) {
        const categoryGroups = new Map(); // category → products[]
        const usedProductIds = new Set(); // Чтобы не дублировать продукты

        console.info(`${LOG_PREFIX} 🎨 Picking mix from categories:`, { categories, productsPerCategory });

        // Группируем по категориям (может быть [PROTEIN, PROTEIN, GRAINS] → {PROTEIN: 2, GRAINS: 1})
        const categoryCount = {};
        for (const cat of categories) {
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }

        // Для каждой уникальной категории берём ТОП-N продуктов
        for (const [category, count] of Object.entries(categoryCount)) {
            const categorizedScenario = { ...scenario, category };
            const categoryPicks = pickProducts(categorizedScenario, history, fallbackProducts, productsPerCategory);

            const uniquePicks = [];
            for (const pick of categoryPicks) {
                if (!usedProductIds.has(pick.product_id)) {
                    uniquePicks.push(pick);
                    usedProductIds.add(pick.product_id);
                }
            }

            if (uniquePicks.length > 0) {
                categoryGroups.set(category, {
                    category,
                    categoryName: getCategoryDisplayName(category),
                    emoji: getCategoryEmoji(category),
                    products: uniquePicks,
                    importance: count // Сколько слотов занимает категория в пропорциях
                });
            }
        }

        const groups = Array.from(categoryGroups.values());

        console.info(`${LOG_PREFIX} ✅ Mix picked:`, {
            groupsCount: groups.length,
            totalProducts: groups.reduce((sum, g) => sum + g.products.length, 0),
            breakdown: groups.map(g => `${g.categoryName}: ${g.products.length}`)
        });

        return { groups };
    }

    /**
     * Человекочитаемое название категории
     */
    function getCategoryDisplayName(category) {
        const names = {
            protein: 'Белки',
            grains: 'Углеводы',
            dairy: 'Жиры/Молочка',
            vegetables: 'Овощи',
            fruits: 'Фрукты',
            snacks: 'Снеки',
            other: 'Другое'
        };
        return names[category] || category;
    }

    /**
     * Emoji для категории
     */
    function getCategoryEmoji(category) {
        const emojis = {
            protein: '🥩',
            grains: '🌾',
            dairy: '🥛',
            vegetables: '🥗',
            fruits: '🍎',
            snacks: '🍪',
            other: '🍽️'
        };
        return emojis[category] || '🍴';
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
            currentTime, // v2.6: for caffeine-awareness filtering
            addedSugarScore,
            sugarDependencyRisk,
            fiberRegularityScore,
            micronutrientDeficits = [],
            novaQualityScore,
            lsGet,
            sharedProducts = [],
            limit = 3,
        } = params;

        const safeLsGet = resolveLsGet(lsGet);

        // Phase B/C Integration Summary (logged once per session)
        if (!window._mealRecPhaseSummaryLogged) {
            window._mealRecPhaseSummaryLogged = true;
            console.group(`${LOG_PREFIX} 📋 Phase A/B/C Integration Summary (v3.0)`);
            console.info('Phase A (Core): C37 sugar filtering, caffeine-awareness');
            console.info('Phase B (Context): C10 fiber boost (8% weight)');
            console.info('Phase C (Micronutrients): C26 minerals boost (10%), C29 NOVA filtering (8%)');
            console.info('Total: 11 scoring factors (was 8 in v2.6)');
            console.groupEnd();
        }

        console.info(`${LOG_PREFIX} 🚀 Generating suggestions:`, {
            scenario,
            remainingKcal,
            targetMacros: { protein: targetProteinG, carbs: targetCarbsG, fat: targetFatG },
            idealGI,
            addedSugarScore,
            sugarDependencyRisk,
            fiberRegularityScore,
            micronutrientDeficits,
            novaQualityScore,
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
            currentTime, // v2.6: pass time for caffeine-awareness
            addedSugarScore,
            sugarDependencyRisk,
            fiberRegularityScore,
            micronutrientDeficits,
            novaQualityScore,
            category: mapScenarioToCategory(scenario), // legacy для fallback
        };

        // 3. Pick products
        // v3.1: Используем balanced mix для сценариев требующих полноценный приём
        // v3.2: Добавлен LATE_EVENING для случаев с большим остатком калорий
        const BALANCED_SCENARIOS = ['PROTEIN_DEFICIT', 'BALANCED', 'POST_WORKOUT', 'PRE_WORKOUT', 'LATE_EVENING'];
        let picks;
        let isGroupedMode = false;

        if (BALANCED_SCENARIOS.includes(scenario)) {
            // Balanced mode: mix из разных категорий по пропорциям макросов
            const categories = determineCategoryMix(targetProteinG, targetCarbsG, targetFatG, limit);
            picks = pickProductsMix(categories, scenarioContext, history, sharedProducts);
            isGroupedMode = true;
        } else {
            // Legacy mode: одна категория из сценария (для снеков, стресс-еды и т.д.)
            picks = pickProducts(scenarioContext, history, sharedProducts, limit);
            isGroupedMode = false;
        }

        // 4. Format output
        if (isGroupedMode && picks.groups) {
            // Grouped mode response (v3.1)
            const formattedGroups = picks.groups.map(group => ({
                category: group.category,
                categoryName: group.categoryName,
                emoji: group.emoji,
                importance: group.importance,
                products: group.products.map((pick) => ({
                    product: pick.name,
                    productId: pick.product_id,
                    grams: Math.round(pick.avgGrams || 100),
                    reason: generateProductReason(pick, scenarioContext),
                    score: pick.score,
                    source: pick.source,
                    macros: {
                        protein: Math.round((pick.macros.protein * (pick.avgGrams || 100)) / 100 || 0),
                        carbs: Math.round((pick.macros.carbs * (pick.avgGrams || 100)) / 100 || 0),
                        fat: Math.round((pick.macros.fat * (pick.avgGrams || 100)) / 100 || 0),
                        kcal: Math.round((pick.macros.kcal * (pick.avgGrams || 100)) / 100 || 0),
                    },
                })),
            }));

            const totalProducts = formattedGroups.reduce((sum, g) => sum + g.products.length, 0);
            const historyCount = formattedGroups.reduce((sum, g) =>
                sum + g.products.filter(p => p.source === 'history').length, 0
            );

            console.info(`${LOG_PREFIX} ✅ Grouped selection:`, {
                scenario,
                groupsCount: formattedGroups.length,
                totalProducts,
                historyUsed: historyCount,
                breakdown: formattedGroups.map(g => `${g.categoryName}: ${g.products.length}`),
            });

            return {
                mode: 'grouped',
                groups: formattedGroups,
                totalProducts,
                historyUsed: historyCount,
            };
        }

        // Legacy flat mode response
        const suggestions = picks.map((pick) => ({
            product: pick.name,
            productId: pick.product_id,
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

        console.info(`${LOG_PREFIX} ✅ Selected products:`, {
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

        return {
            mode: 'flat',
            suggestions,
            count: suggestions.length,
            historyUsed: historyCount,
            fallbackUsed: fallbackCount,
            avgScore,
        };
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
        if (pick.scoreBreakdown.proteinAlignment > 80) {
            return 'Высокое содержание белка';
        }
        if (pick.scoreBreakdown.kcalFit > 80) {
            return 'Оптимальная калорийность';
        }
        if (pick.scoreBreakdown.giAwareness > 80) {
            return scenario.idealGI < 50 ? 'Низкий ГИ' : 'Медленные углеводы';
        }
        if (pick.source === 'history') {
            return 'Из вашей истории';
        }
        return 'Рекомендуем попробовать';
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

    console.info(`${LOG_PREFIX} ✅ Smart Product Picker v3.2.1 initialized (30d history, balanced mix + 11-factor scoring + guaranteed fat slots)`);
})(typeof window !== 'undefined' ? window : global);
