/**
 * HEYS Insights — Smart Product Picker v4.0.5
 * Персонализированный подбор продуктов на основе истории питания (30 дней)
 *
 * v4.0.0: S10 "Smart Scoring" Refactor (19.02.2026)
 * v4.0.1: Fix macro alignment — SCENARIO_IDEAL_MACRO_PROFILES (flat scoring root cause)
 * v4.0.2: Fix P0/C0/F0 — enrich history product macros from sharedProducts (MealItem has no prot/carb/fat)
 * v4.0.3: Fix enrichMacros field names — sharedProducts use protein100/simple100/complex100/badfat100 (not prot/carb/fat)
 * v4.0.4: Fix topFactors display — sort by weighted contribution (score×weight) so macro factors appear first
 * v4.0.5: Fix LATE_EVENING — add category override (DAIRY+PROTEIN, no GRAINS) + extend sleepGIPenalty
 *   - determineCategoryMix(): LATE_EVENING → [DAIRY, DAIRY, PROTEIN] (light dairy before sleep)
 *   - sleepGIPenalty: now applies to LATE_EVENING too (GRAINS→0, DAIRY→100, PROTEIN→90)
 *   - Bug: LATE_EVENING fell through to proportional calc → GRAINS slot appeared
 *   - Bug: sleepGIPenalty only checked PRE_SLEEP → GRAINS scored neutral 50 in LATE_EVENING
 *   - Rebalanced Weights: Macro alignment 49% (prot 0.25+carb0.14+fat0.10+kcal0.10), Binary 6% (tie-breakers)
 *   - New Math: Alignments use Energy% (TEF-adj: prot×3, carb×4, fat×9) — same scale both sides
 *   - Fat Alignment: new factor 0.10 (was blind spot — zero weight on fat profile mismatch)
 *   - KcalFit: soft linear penalty, 0 only at ratio>1.2 (was hard 0 at 0.80)
 *   - Neutral baselines: sleepGIPenalty/glPenalty/workoutCarbBoost → 50 (was 75, widened dynamic range)
 *
 * v3.6.0: F4 Feedback ML weights (19.02.2026)
 *   - generateProductSuggestions(): принимает profile — передаётся в scenarioContext
 *   - calculateProductScore(): mlWeightMultiplier читает feedbackLoop.getProductWeight(profile, productId, scenario)
 *   - Диапазон: 0.5–2.0 (EMA α=0.1, ±5% за каждый 👍/👎)
 *   - Ключи: "PROTEIN_DEFICIT_productId", "PRE_SLEEP_productId" и т.д.
 *
 * v3.5.0: POST_WORKOUT carb boost (F3) (19.02.2026)
 *   - determineCategoryMix(): POST_WORKOUT → GRAINS-first mix [GRAINS, GRAINS, PROTEIN]
 *     (Анаболическое окно 2ч: быстрые углеводы для ресинтеза гликогена, белок для MPS)
 *   - calculateProductScore(): factor 14 — workoutCarbBoost (0.05 weight)
 *     GRAINS → score=100; FRUITS → 90; PROTEIN → 85; DAIRY → 70; other → 40
 *     (Ivy 2004: 1.0г/кг углеводы + 0.35г/кг белок в анаболическое окно)
 *   - SCORING_WEIGHTS: 14 факторов (sum=1.00)
 *
 * v3.4.0: targetGL scoring factor (F2) (19.02.2026)
 *   - calculateProductScore(): factor 13 — glPenalty (0.05 weight)
 *     Оценивает GL продукта (GI × carbs_в_порции / 100) vs targetGL из планировщика
 *     targetGL=20 (дневные приёмы), targetGL=10 (PRE_SLEEP, Ludwig 2002)
 *
 * v3.3.0: PRE_SLEEP category override + sleep GI penalty (20.02.2026)
 *   - determineCategoryMix(): PRE_SLEEP scenario → DAIRY-first mix (casein, kefir) instead of GRAINS
 *   - calculateProductScore(): factor 12 — sleep GI penalty (0.06 weight)
 *     GRAINS перед сном → score=0; DAIRY → score=100; PROTEIN → score=90
 *     (Halson 2014: casein pre-sleep → MPS without insulin spike)
 *   - mapScenarioToCategory(): added PRE_SLEEP → DAIRY mapping
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
 * @version 3.6.0
 * @date 19.02.2026
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

    // Scoring weights for v4.0.0 (S10 "Smart Scoring")
    // Macro alignment total: 0.49 (prot+carb+fat+kcal). Binary total: 0.06 (tie-breakers). Sum=1.00
    const SCORING_WEIGHTS = {
        proteinAlignment: 0.25, // ↑ was 0.20 — главный дифференциатор
        carbAlignment: 0.14, // ↑ was 0.11
        fatAlignment: 0.10, // NEW — закрывает слепую зону жировых профилей
        kcalFit: 0.10, // was 0.11 (soft linear penalty)
        caffeineAwareness: 0.03, // ↓ was 0.08 (tie-breaker)
        sugarAwareness: 0.03, // ↓ was 0.08 (tie-breaker)
        fiberBoost: 0.06, // ↓ was 0.07
        micronutrientBoost: 0.06, // ↓ was 0.09
        novaQuality: 0.05, // ↓ was 0.07
        harmMinimization: 0.03, // ↑ was 0.02
        familiarityBoost: 0.02, // ↑ was 0.01
        sleepGIPenalty: 0.05, // ↓ was 0.06
        glPenalty: 0.04, // ↓ was 0.05
        workoutCarbBoost: 0.04, // ↓ was 0.05
    };

    // ──────────────────────────────────────────────────────────────────────────
    // Spam-safe grouped logging for hottest paths (macro + GL warnings)
    // ──────────────────────────────────────────────────────────────────────────
    let _activePickerLogCycle = null;

    function startPickerLogCycle(meta) {
        _activePickerLogCycle = {
            meta: meta || {},
            macroRows: [],
            glWarnings: [],
            highScoreRows: [],
            pickedRows: [],
            sleepPenaltyRows: [],
        };
    }

    function pushPickerLogRow(type, payload) {
        if (!_activePickerLogCycle) return;
        if (type === 'macro') {
            _activePickerLogCycle.macroRows.push(payload);
            return;
        }
        if (type === 'glWarning') {
            _activePickerLogCycle.glWarnings.push(payload);
            return;
        }
        if (type === 'highScore') {
            _activePickerLogCycle.highScoreRows.push(payload);
            return;
        }
        if (type === 'picked') {
            _activePickerLogCycle.pickedRows.push(payload);
            return;
        }
        if (type === 'sleepPenalty') {
            _activePickerLogCycle.sleepPenaltyRows.push(payload);
        }
    }

    function flushPickerLogCycle() {
        if (!_activePickerLogCycle) return;
        const cycle = _activePickerLogCycle;
        _activePickerLogCycle = null;

        // 1) Macro rows: very noisy. Group by scenario and print compact top set.
        if (cycle.macroRows.length > 0) {
            const byScenario = {};
            cycle.macroRows.forEach((row) => {
                const key = row.scenario || 'UNKNOWN';
                byScenario[key] = byScenario[key] || { count: 0, rows: [] };
                byScenario[key].count += 1;
                if (byScenario[key].rows.length < 8) byScenario[key].rows.push(row);
            });

            const summary = Object.entries(byScenario).map(([scenario, info]) => ({
                scenario,
                total: info.count,
                shown: info.rows.length,
            }));
            console.info(`${LOG_PREFIX} 🧪 [macro] grouped summary:`, {
                groups: summary,
                cycle: cycle.meta,
            });

            Object.entries(byScenario).forEach(([scenario, info]) => {
                console.group(`${LOG_PREFIX} 🧪 [macro] ${scenario}: showing ${info.rows.length}/${info.count}`);
                console.table(info.rows);
                console.groupEnd();
            });
        }

        // 2) GL warnings: keep signal, collapse duplicates.
        if (cycle.glWarnings.length > 0) {
            const top = cycle.glWarnings
                .slice()
                .sort((a, b) => b.glOverflow - a.glOverflow)
                .slice(0, 10)
                .map((w) => ({
                    product: w.product,
                    scenario: w.scenario,
                    productGL: w.productGL,
                    targetGL: w.targetGL,
                    overflow: w.glOverflow,
                    glPenaltyScore: w.glPenaltyScore,
                }));
            // Это digest-сводка предыдущих warning'ов (top-10 worst), не сам
            // warning. Чтобы не дублировать красные крестики в консоли —
            // info-level. Раньше был console.warn.
            console.info(`${LOG_PREFIX} 📊 [GL] grouped warnings:`, {
                total: cycle.glWarnings.length,
                shown: top.length,
                cycle: cycle.meta,
            });
            console.table(top);
        }

        // 2b) Sleep penalty (GRAINS pre-sleep/late-evening): collapse to one digest row.
        if (cycle.sleepPenaltyRows.length > 0) {
            const byScenario = {};
            cycle.sleepPenaltyRows.forEach((row) => {
                const key = row.scenario || 'UNKNOWN';
                byScenario[key] = byScenario[key] || { count: 0, products: [] };
                byScenario[key].count += 1;
                if (byScenario[key].products.length < 8) byScenario[key].products.push(row.product);
            });
            console.info(`${LOG_PREFIX} 🌙 [sleepPenalty] GRAINS penalized:`, {
                total: cycle.sleepPenaltyRows.length,
                byScenario,
                cycle: cycle.meta,
            });
        }

        // 3) Picked tables: collapse repeated per-category dumps into one compact summary.
        if (cycle.pickedRows.length > 0) {
            const grouped = cycle.pickedRows.map((r) => ({
                scenario: r.scenario,
                category: r.category,
                strategy: r.strategy,
                evaluated: r.evaluated,
                selected: r.selected,
                sampleTop: r.sampleTop,
            }));

            console.info(`${LOG_PREFIX} 🥇 [picked] grouped summary:`, {
                totalGroups: grouped.length,
                cycle: cycle.meta,
            });
            console.table(grouped);
        }
    }

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

    // v4.0.0: S10 fix — Scenario-based ideal macro profiles
    // Root cause of flat scoring: computing Enegy% target as targetProteinG/targetKcal
    // gives 21% for PROTEIN_DEFICIT (73g/1026kcal) → chicken (58%) scores 0, bread (14%) scores 79 — WRONG.
    // Fix: use scenario-specific IDEAL product composition profiles (what type of product helps this scenario).
    // Based on nutritional science (TEF-adjusted protein=3 kcal/g: Livesey 2001)
    const SCENARIO_IDEAL_MACRO_PROFILES = {
        // PROTEIN_DEFICIT: need protein-rich products → high protein En%, moderate fat, low carbs
        PROTEIN_DEFICIT: { protPct: 45, carbPct: 15, fatPct: 40 },  // Chicken=58%→diff13 | Bread=14%→diff31
        // STRESS_EATING: same logic — protein helps satiety and reduces cortisol-driven cravings
        STRESS_EATING: { protPct: 40, carbPct: 20, fatPct: 40 },
        // POST_WORKOUT: anabolic window — fast carbs + protein (Ivy 2004: ~3:1 carb:protein)
        POST_WORKOUT: { protPct: 25, carbPct: 55, fatPct: 20 },
        // PRE_SLEEP: casein-friendly, low GI, low carbs (Halson 2014)
        PRE_SLEEP: { protPct: 35, carbPct: 15, fatPct: 50 },  // Dairy=fat+prot | Bread=carbs → penalized
        // LATE_EVENING: light, moderate protein, lower carbs
        LATE_EVENING: { protPct: 35, carbPct: 20, fatPct: 45 },
        // LIGHT_SNACK: volume food, high water content, moderate everything
        LIGHT_SNACK: { protPct: 25, carbPct: 40, fatPct: 35 },
        // BALANCED / default: standard healthy plate (~30/40/30)
        BALANCED: { protPct: 30, carbPct: 40, fatPct: 30 },
        DEFAULT: { protPct: 30, carbPct: 40, fatPct: 30 },
    };

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
        if (!productName || typeof productName !== 'string') return PRODUCT_CATEGORIES.OTHER;
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
        if (!productName || typeof productName !== 'string') return false;
        const normalized = productName.toLowerCase();
        return CAFFEINE_KEYWORDS.some((kw) => normalized.includes(kw));
    }

    /**
     * Проверяет, содержит ли продукт добавленный сахар (по названию)
     * @param {string} productName
     * @returns {boolean}
     */
    function containsAddedSugar(productName) {
        if (!productName || typeof productName !== 'string') return false;
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

        // S10 v4.0.1: Scenario Ideal Profile approach — FIX for flat scoring.
        // Root cause: derived target (73g prot / 1026kcal = 21%) made chicken(58%) score 0, bread(14%) score 79 — inverted!
        // Fix: use SCENARIO_IDEAL_MACRO_PROFILES — what TYPE of product density helps this scenario.
        const prodKcal = product.macros.kcal || 1; // Avoid div/0
        const scenarioType = scenario.scenario || scenario.type || 'DEFAULT';
        const idealProfile = SCENARIO_IDEAL_MACRO_PROFILES[scenarioType] || SCENARIO_IDEAL_MACRO_PROFILES.DEFAULT;

        // 1. Protein Alignment (25%) — product protein% vs scenario ideal protein% (TEF-adjusted 3 kcal/g)
        const proteinEnPct = (product.macros.protein * 3 / prodKcal) * 100;
        const proteinDiff = Math.abs(proteinEnPct - idealProfile.protPct);
        scores.proteinAlignment = Math.max(0, 100 - proteinDiff * 2.0); // ×2: 20%diff→60, 50%diff→0

        // 2. Carb Alignment (14%) — 4 kcal/g
        const carbEnPct = (product.macros.carbs * 4 / prodKcal) * 100;
        const carbDiff = Math.abs(carbEnPct - idealProfile.carbPct);
        scores.carbAlignment = Math.max(0, 100 - carbDiff * 2.0);

        // 3. Fat Alignment (10%) — Atwater 9 kcal/g (no TEF correction for fat)
        const fatEnPct = (product.macros.fat * 9 / prodKcal) * 100;
        const fatDiff = Math.abs(fatEnPct - idealProfile.fatPct);
        scores.fatAlignment = Math.max(0, 100 - fatDiff * 1.5); // ×1.5: softer — fat varies widely

        pushPickerLogRow('macro', {
            product: String(product.name || '???').substring(0, 32),
            scenario: scenarioType,
            ideal: `P${idealProfile.protPct}/C${idealProfile.carbPct}/F${idealProfile.fatPct}`,
            prod: `P${Math.round(proteinEnPct)}/C${Math.round(carbEnPct)}/F${Math.round(fatEnPct)}`,
            scores: `prot=${Math.round(scores.proteinAlignment)},carb=${Math.round(scores.carbAlignment)},fat=${Math.round(scores.fatAlignment)}`,
        });

        // 4. Kcal Fit (10%) — Soft Linear Penalty (v4.0.0)
        // Plan: ratio ≤ 0.8 → 100 (ideal), > 0.8 → linear decline, 0 at ratio = 1.2
        // Ensures multi-meal portions (each ~50% budget) score 100, not penalised
        const portionKcal = (prodKcal * typicalPortion) / 100;
        const remainingKcal = scenario.remainingKcal || 400;
        const kcalRatio = portionKcal / remainingKcal;

        if (kcalRatio <= 0.8) {
            scores.kcalFit = 100; // Ideal: portion fits within 80% of remaining budget
        } else {
            // Linear decline from 100 at 0.80 to 0 at 1.20 (slope = -250)
            scores.kcalFit = Math.max(0, 100 - (kcalRatio - 0.8) * 250);
        }

        // 5. Caffeine Awareness (3%) — binary tie-breaker, v2.6 time-sensitive filter
        const hasCaffeine = containsCaffeine(product.name);
        const currentHour = scenario.currentTime ? Math.floor(scenario.currentTime) : 12;
        if (hasCaffeine && currentHour >= EVENING_CAFFEINE_CUTOFF_HOUR) {
            scores.caffeineAwareness = 0; // Hard penalty after 20:00
        } else if (hasCaffeine) {
            scores.caffeineAwareness = 80;
        } else {
            scores.caffeineAwareness = 100;
        }

        // 6. Sugar Awareness (2%) - Tie-breaker
        const hasAddedSugar = containsAddedSugar(product.name);
        const dependencyRisk = !!scenario.sugarDependencyRisk;
        if (dependencyRisk && hasAddedSugar) {
            scores.sugarAwareness = 0; // Avoid triggers
        } else if (hasAddedSugar) {
            scores.sugarAwareness = 60; // Moderate penalty
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

        // 10. Harm Minimization (4%)
        const harmScore = product.harm || 0;
        scores.harmMinimization = Math.max(0, 100 - harmScore * 10); // harm 0-10 scale

        // 11. Familiarity Boost (1%)
        scores.familiarityBoost = product.familiarityScore * 10; // 1-10 -> 10-100

        // 12. Sleep GI Penalty (6%) - v3.3+v4.0.5: PRE_SLEEP & LATE_EVENING avoid high-GI carbs (Halson 2014)
        // Casein/dairy pre-sleep → steady amino acid release without blood sugar spike
        // GRAINS (bread, pasta, rice) → rapid glucose → disrupts deep sleep architecture
        // v4.0.5: Extended to LATE_EVENING — same sleep-disruption risk after 21:00
        const mealScenarioType = scenario.scenario || scenario.type;
        const isPreSleepScenario = mealScenarioType === 'PRE_SLEEP' || mealScenarioType === 'LATE_EVENING';
        if (isPreSleepScenario) {
            const productCat = product.category || 'other';
            if (productCat === PRODUCT_CATEGORIES.GRAINS) {
                scores.sleepGIPenalty = 0; // Hard penalty: high-GI carbs disrupt sleep
                pushPickerLogRow('sleepPenalty', {
                    product: product.name,
                    scenario: mealScenarioType || 'UNKNOWN',
                    category: productCat,
                });
            } else if (productCat === PRODUCT_CATEGORIES.DAIRY) {
                scores.sleepGIPenalty = 100; // Boost: casein/kefir optimal pre-sleep
            } else if (productCat === PRODUCT_CATEGORIES.PROTEIN) {
                scores.sleepGIPenalty = 90; // Good: lean protein (poultry, eggs)
            } else {
                scores.sleepGIPenalty = 65; // Neutral for other categories
            }
        } else {
            scores.sleepGIPenalty = 50; // Neutral baseline for non-sleep meals (50=symmetric, widened dynamic range)
        }

        // 13. Glycemic Load Penalty (5%) - v3.4: F2 penalise products pushing GL over targetGL (Ludwig, 2002)
        // GL = GI × carbs_in_portion / 100; targetGL from planner (20=day, 10=PRE_SLEEP)
        const targetGLValue = scenario.targetGL;
        if (targetGLValue != null && Number.isFinite(targetGLValue) && targetGLValue > 0) {
            // Fallback GI by category when product lacks explicit .gi field
            const GI_BY_CATEGORY = {
                [PRODUCT_CATEGORIES.GRAINS]: 65,
                [PRODUCT_CATEGORIES.FRUITS]: 52,
                [PRODUCT_CATEGORIES.SNACKS]: 60,
                [PRODUCT_CATEGORIES.DAIRY]: 30,
                [PRODUCT_CATEGORIES.VEGETABLES]: 25,
                [PRODUCT_CATEGORIES.PROTEIN]: 5,
                [PRODUCT_CATEGORIES.OTHER]: 50,
            };
            const productGI = Number(product.gi || product.glycemicIndex ||
                GI_BY_CATEGORY[product.category] || GI_BY_CATEGORY[PRODUCT_CATEGORIES.OTHER]);
            const carbsInPortion = (product.macros.carbs * typicalPortion) / 100;
            const productGL = (productGI * carbsInPortion) / 100;

            if (productGL <= targetGLValue) {
                scores.glPenalty = 100; // Within target — perfect
            } else if (productGL <= targetGLValue * 1.5) {
                scores.glPenalty = 70; // 0-50% over target — mild penalty
            } else if (productGL <= targetGLValue * 2.5) {
                scores.glPenalty = 40; // 50-150% over target — significant penalty
            } else {
                scores.glPenalty = 10; // >150% over target — strong penalty
            }

            if (scores.glPenalty < 70) {
                const roundedGL = Math.round(productGL * 10) / 10;
                pushPickerLogRow('glWarning', {
                    product: product.name,
                    scenario: mealScenarioType || 'UNKNOWN',
                    productGI,
                    carbsInPortion: Math.round(carbsInPortion),
                    productGL: roundedGL,
                    targetGL: targetGLValue,
                    glOverflow: Math.round((roundedGL - targetGLValue) * 10) / 10,
                    glPenaltyScore: scores.glPenalty,
                });
            }
        } else {
            scores.glPenalty = 50; // No targetGL available — neutral baseline (50=symmetric, widened dynamic range)
        }

        // 14. Workout Carb Boost (5%) - v3.5: F3 POST_WORKOUT anabolic window (Ivy 2004)
        // Within 2h after training: fast carbs replenish glycogen + blunt cortisol spike
        // GRAINS (rice, oats, potato) → ideal; FRUITS (banana) → good; PROTEIN → necessary for MPS
        // DAIRY → moderate (casein too slow); fats → penalise (delay gastric emptying)
        const isPostWorkoutScenario = mealScenarioType === 'POST_WORKOUT';
        if (isPostWorkoutScenario) {
            const productCatPW = product.category || 'other';
            if (productCatPW === PRODUCT_CATEGORIES.GRAINS) {
                scores.workoutCarbBoost = 100; // Ideal: fast carbs for glycogen replenishment
            } else if (productCatPW === PRODUCT_CATEGORIES.FRUITS) {
                scores.workoutCarbBoost = 90;  // Good: fructose+glucose (banana, etc.)
            } else if (productCatPW === PRODUCT_CATEGORIES.PROTEIN) {
                scores.workoutCarbBoost = 85;  // Necessary: MPS (0.35g/kg, Ivy 2004)
            } else if (productCatPW === PRODUCT_CATEGORIES.DAIRY) {
                scores.workoutCarbBoost = 70;  // Moderate: casein too slow for anabolic window
            } else {
                scores.workoutCarbBoost = 40;  // Low: fats/snacks slow absorption
            }
            if (scores.workoutCarbBoost >= 90) {
                console.info(`${LOG_PREFIX} 🏋️ POST_WORKOUT carb boost:`, {
                    product: product.name,
                    category: productCatPW,
                    score: scores.workoutCarbBoost,
                });
            }
        } else {
            scores.workoutCarbBoost = 50; // Neutral baseline for non-workout meals (50=symmetric, widened dynamic range)
        }

        // Weighted sum (15 factors v4.0.0, sum=1.00)
        const totalScore =
            scores.proteinAlignment * SCORING_WEIGHTS.proteinAlignment +
            scores.carbAlignment * SCORING_WEIGHTS.carbAlignment +
            scores.fatAlignment * SCORING_WEIGHTS.fatAlignment +
            scores.kcalFit * SCORING_WEIGHTS.kcalFit +
            scores.caffeineAwareness * SCORING_WEIGHTS.caffeineAwareness +
            scores.sugarAwareness * SCORING_WEIGHTS.sugarAwareness +
            scores.fiberBoost * SCORING_WEIGHTS.fiberBoost +
            scores.micronutrientBoost * SCORING_WEIGHTS.micronutrientBoost +
            scores.novaQuality * SCORING_WEIGHTS.novaQuality +
            scores.harmMinimization * SCORING_WEIGHTS.harmMinimization +
            scores.familiarityBoost * SCORING_WEIGHTS.familiarityBoost +
            scores.sleepGIPenalty * SCORING_WEIGHTS.sleepGIPenalty +
            scores.glPenalty * SCORING_WEIGHTS.glPenalty +
            scores.workoutCarbBoost * SCORING_WEIGHTS.workoutCarbBoost;

        // Apply ML weight multiplier from feedback loop (R2.7)
        let mlWeightMultiplier = 1.0;
        if (global.HEYS?.InsightsPI?.feedbackLoop?.getProductWeight) {
            const rawProfile = scenario.profile || global.HEYS?.profile;
            // v3.6: F4 fix — profile.id не существует в heys_profile; используем currentClientId как идентификатор
            const profileWithId = rawProfile
                ? { ...rawProfile, id: rawProfile.id || global.HEYS?.currentClientId || 'default' }
                : (global.HEYS?.currentClientId ? { id: global.HEYS.currentClientId } : null);
            const productId = product.id || product.product_id; // v3.6: F4 fix — history uses .product_id, fallback uses .id
            const scenarioType = scenario.scenario || scenario.type || 'UNKNOWN'; // v3.6: F4 fix — scenario stored in .scenario, not .type

            // v3.6: F4 — диагностика один раз за сессию (показывает ID и готовность системы)
            if (!window._f4DiagLogged) {
                window._f4DiagLogged = true;
                console.info(`${LOG_PREFIX} 🔍 [F4] EMA system state:`, {
                    hasProfile: !!profileWithId,
                    clientId: profileWithId?.id || null,
                    hasProductId: !!productId,
                    scenarioType,
                    storageKey: `heys_meal_rec_weights_${profileWithId?.id || 'default'}`,
                    note: 'multiplier=1.0 until first 👍/👎 feedback',
                });
            }

            if (profileWithId && productId) {
                mlWeightMultiplier = global.HEYS.InsightsPI.feedbackLoop.getProductWeight(
                    profileWithId,
                    productId,
                    scenarioType
                );
                if (mlWeightMultiplier !== 1.0) {
                    console.info(`${LOG_PREFIX} 🤖 [F4] ML weight applied:`, {
                        product: product.name,
                        scenario: scenarioType,
                        multiplier: mlWeightMultiplier.toFixed(3),
                        clientId: profileWithId.id,
                    });
                }
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
            // Sort by weighted contribution (score × weight) to show differentiating factors,
            // not universal-100 factors like kcalFit/caffeineAwareness/sugarAwareness
            const topFactors = Object.entries(scores)
                .filter(([key]) => SCORING_WEIGHTS[key] != null)
                .sort((a, b) => (b[1] * (SCORING_WEIGHTS[b[0]] || 0)) - (a[1] * (SCORING_WEIGHTS[a[0]] || 0)))
                .slice(0, 4)
                .map(([key, val]) => `${key}=${Math.round(val)}`)
                .join(', ');
            pushPickerLogRow('highScore', {
                product: product.name,
                score: finalScore,
                topFactors,
                scenario: scenarioType,
            });
        }

        return {
            totalScore: finalScore,
            breakdown: scores,
        };
    }

    /**
     * Определяет mix категорий продуктов на основе пропорций макросов
     * v3.3: PRE_SLEEP сценарий → sleep-friendly override (DAIRY-first, no GRAINS)
     *
     * Пример: targetProteinG=59, targetCarbsG=23, targetFatG=3
     * → ~66% белок, ~26% углеводы, ~8% жир
     * → возвращает [PROTEIN, PROTEIN, GRAINS] (2 белковых + 1 углеводный)
     * PRE_SLEEP: → [DAIRY, PROTEIN, PROTEIN] (1 молочный + 2 белковых, без круп)
     *
     * @param {number} targetProteinG - целевой белок в граммах
     * @param {number} targetCarbsG - целевые углеводы в граммах
     * @param {number} targetFatG - целевой жир в граммах
     * @param {number} limit - сколько товаров макс (обычно 3)
     * @param {string|null} scenarioType - тип сценария ('PRE_SLEEP', 'PROTEIN_DEFICIT', etc.)
     * @returns {Array<string>} массив категорий для подбора
     */
    function determineCategoryMix(targetProteinG, targetCarbsG, targetFatG, limit = 3, scenarioType = null) {
        // v3.5: POST_WORKOUT override — fast carbs first (Ivy 2004 anabolic window)
        // Glycogen replenishment: 1.0g/kg carbs + 0.35g/kg protein within 2h post-workout
        // GRAINS (rice, potato, oats, pasta) replenish muscle glycogen rapidly
        if (scenarioType === 'POST_WORKOUT') {
            const workoutMix = [];
            const carbSlots = Math.ceil(limit * 2 / 3); // 2/3 carbs slots (Ivy 2004 ~3:1 ratio)
            for (let i = 0; i < limit; i++) {
                workoutMix.push(i < carbSlots ? PRODUCT_CATEGORIES.GRAINS : PRODUCT_CATEGORIES.PROTEIN);
            }
            console.info(`${LOG_PREFIX} 🏋️ POST_WORKOUT category override:`, {
                categories: workoutMix,
                reason: 'Ivy 2004: anabolic window 2h — fast carbs for glycogen + protein for MPS',
                limit
            });
            return workoutMix;
        }

        // v3.3: PRE_SLEEP override — sleep-friendly categories (Halson 2014)
        // Casein/kefir/cottage cheese: slow-digesting, no insulin spike, supports MPS during sleep
        // Avoid GRAINS (bread, pasta, rice): rapid glucose → disrupts deep sleep architecture
        if (scenarioType === 'PRE_SLEEP') {
            const sleepMix = [];
            for (let i = 0; i < limit; i++) {
                sleepMix.push(i === 0 ? PRODUCT_CATEGORIES.DAIRY : PRODUCT_CATEGORIES.PROTEIN);
            }
            console.info(`${LOG_PREFIX} 🌙 PRE_SLEEP category override:`, {
                categories: sleepMix,
                reason: 'Halson 2014: casein pre-sleep → MPS without insulin spike',
                limit
            });
            return sleepMix;
        }

        // v4.0.5: LATE_EVENING override — light dairy-protein mix (Halson 2014)
        // Same rationale as PRE_SLEEP but with 2 dairy slots (more variety from yogurt/kefir/cottage cheese)
        // "Лёгкий белок (творог, кефир) — лучше для сна / Избегай углеводов и больших порций"
        if (scenarioType === 'LATE_EVENING') {
            const eveningMix = [];
            for (let i = 0; i < limit; i++) {
                eveningMix.push(i < 2 ? PRODUCT_CATEGORIES.DAIRY : PRODUCT_CATEGORIES.PROTEIN);
            }
            console.info(`${LOG_PREFIX} 🌙 LATE_EVENING category override:`, {
                categories: eveningMix,
                reason: 'Halson 2014: light dairy-protein before sleep, avoid GRAINS',
                limit
            });
            return eveningMix;
        }
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

        // Build lookup index from sharedProducts (fallback) by product_id or name
        // Needed to enrich history products with real macros (MealItem only stores grams+product_id, not prot/carb/fat)
        const sharedIndex = new Map();
        for (const sp of fallbackProducts) {
            if (sp.id) sharedIndex.set(sp.id, sp);
            if (sp.product_id) sharedIndex.set(sp.product_id, sp);
            if (sp.title) sharedIndex.set(sp.title.toLowerCase(), sp);
            if (sp.name) sharedIndex.set(sp.name.toLowerCase(), sp);
        }

        /**
         * Enrich history product macros from sharedProducts when item.prot/carb/fat = 0
         * Root cause: MealItem stores only grams+product_id, macros must come from sharedProducts (per 100g)
         */
        function enrichMacros(p) {
            if (p.macros.kcal > 0) return p; // Already has macros (e.g. from explicit item fields)
            const byId = sharedIndex.get(p.product_id);
            const nameKey = (p.name || '').toLowerCase();
            const byName = sharedIndex.get(nameKey);
            const sp = byId || byName;

            if (!sp) return p;

            // sharedProducts DB format: protein100, simple100+complex100=carbs, badfat100+goodfat100+trans100=fat
            // (no prot/carb/fat/kcal shorthand — those are legacy aliases not present in HEYS.products.getAll())
            const prot = sp.protein100 || sp.prot || 0;
            const carb = sp.carbs100 != null
                ? sp.carbs100
                : (sp.carb || (sp.simple100 || 0) + (sp.complex100 || 0));
            const fat = sp.fat100 != null
                ? sp.fat100
                : (sp.fat || (sp.badfat100 || sp.badFat100 || 0) + (sp.goodfat100 || sp.goodFat100 || 0) + (sp.trans100 || 0));
            // TEF-adjusted Atwater: protein=3 kcal/g, carbs=4, fat=9
            const kcal = sp.kcal100 || sp.kcal || Math.round(prot * 3 + carb * 4 + fat * 9);

            return {
                ...p,
                macros: { protein: prot, carbs: carb, fat, kcal },
                gi: sp.gi || p.gi || 50,
                harm: sp.harm != null ? sp.harm : (p.harm || 0),
            };
        }

        // Strategy 1: Use history if sufficient
        if (historyProducts.length >= MIN_PRODUCTS_PER_CATEGORY) {
            candidates = historyProducts.map((p) => {
                const enriched = enrichMacros(p);
                const score = calculateProductScore(enriched, scenario, enriched.avgGrams || 100);
                return {
                    ...enriched,
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
                const enriched = enrichMacros(p);
                const score = calculateProductScore(enriched, scenario, enriched.avgGrams || 100);
                return {
                    ...enriched,
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
                .filter(([key]) => SCORING_WEIGHTS[key] != null)
                .sort((a, b) => (b[1] * (SCORING_WEIGHTS[b[0]] || 0)) - (a[1] * (SCORING_WEIGHTS[a[0]] || 0)))
                .slice(0, 4)
                .map(([key, val]) => `${key}=${Math.round(val)}`)
                .join(', ')
        }));

        const strategy = historyProducts.length >= MIN_PRODUCTS_PER_CATEGORY
            ? 'HISTORY'
            : (fallbackProducts.length > 0 ? 'FALLBACK' : 'LIMITED_HISTORY');

        pushPickerLogRow('picked', {
            scenario: scenario.scenario || scenario.type || 'UNKNOWN',
            category: targetCategory.toUpperCase(),
            strategy,
            evaluated: candidates.length,
            selected: picked.length,
            sampleTop: topPicks.slice(0, 3).map((p) => `${p.name} (${p.score})`).join(' | '),
        });

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
    function pickProductsMix(categories, scenario, history, fallbackProducts = [], productsPerCategory = 5, excludeProductIds = null) {
        const categoryGroups = new Map(); // category → products[]
        // P3 fix: pre-populate from cross-meal exclusion set to deduplicate products across meals
        const usedProductIds = excludeProductIds instanceof Set ? new Set(excludeProductIds) : new Set();

        console.info(`${LOG_PREFIX} 🎨 Picking mix from categories:`, { categories, productsPerCategory, excludedCount: usedProductIds.size });

        // Группируем по категориям (может быть [PROTEIN, PROTEIN, GRAINS] → {PROTEIN: 2, GRAINS: 1})
        const categoryCount = {};
        for (const cat of categories) {
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }

        // Для каждой уникальной категории берём ТОП-N продуктов
        for (const [category, count] of Object.entries(categoryCount)) {
            const categorizedScenario = { ...scenario, category };
            // P3 fix v2: request extra products to compensate for cross-meal excluded slots
            const extraBuffer = usedProductIds.size > 0 ? Math.ceil(usedProductIds.size / Object.keys(categoryCount).length) + productsPerCategory : productsPerCategory;
            const categoryPicks = pickProducts(categorizedScenario, history, fallbackProducts, Math.min(extraBuffer, 20));

            const uniquePicks = [];
            for (const pick of categoryPicks) {
                if (!usedProductIds.has(pick.product_id) && uniquePicks.length < productsPerCategory) {
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
            targetGL = null,   // v3.4: F2 — GL target from planner (20=day, 10=PRE_SLEEP, Ludwig 2002)
            currentTime, // v2.6: for caffeine-awareness filtering
            addedSugarScore,
            sugarDependencyRisk,
            fiberRegularityScore,
            micronutrientDeficits = [],
            novaQualityScore,
            lsGet,
            sharedProducts = [],
            limit = 3,
            excludeProductIds = null,
            profile = null,    // v3.6: F4 — needed for feedbackLoop.getProductWeight() ML multiplier
        } = params;

        const safeLsGet = resolveLsGet(lsGet);

        startPickerLogCycle({ scenario, limit, targetGL: targetGL ?? null });

        // Phase B/C Integration Summary (logged once per session)
        if (!window._mealRecPhaseSummaryLogged) {
            window._mealRecPhaseSummaryLogged = true;
            console.group(`${LOG_PREFIX} 📋 Phase A/B/C Integration Summary (v3.0)`);
            console.info('Phase A (Core): C37 sugar filtering, caffeine-awareness');
            console.info('Phase B (Context): C10 fiber boost (8% weight)');
            console.info('Phase C (Micronutrients): C26 minerals boost (10%), C29 NOVA filtering (8%)');
            console.info('v3.3: PRE_SLEEP GI penalty (6% weight) — DAIRY boost, GRAINS penalty before sleep');
            console.info('v3.4: GL Penalty (5% weight) — targetGL=20/10 from planner (Ludwig 2002)');
            console.info('v3.5: Workout Carb Boost (5% weight) — GRAINS boost for POST_WORKOUT (Ivy 2004)');
            console.info('v3.6: F4 Feedback ML weights — EMA multiplier [0.5-2.0] per product+scenario (👍👎 → score)');
            console.info('Total: 14 scoring factors × ML multiplier (EMA feedback loop active)');
            console.groupEnd();
        }

        console.info(`${LOG_PREFIX} 🚀 Generating suggestions:`, {
            scenario,
            remainingKcal,
            targetMacros: { protein: targetProteinG, carbs: targetCarbsG, fat: targetFatG },
            idealGI,
            targetGL,          // v3.4: F2
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
            targetGL,          // v3.4: F2 — GL target for factor 13 scoring (Ludwig 2002)
            currentTime, // v2.6: pass time for caffeine-awareness
            addedSugarScore,
            sugarDependencyRisk,
            fiberRegularityScore,
            micronutrientDeficits,
            novaQualityScore,
            category: mapScenarioToCategory(scenario), // legacy для fallback
            profile,           // v3.6: F4 — for feedbackLoop.getProductWeight() ML multiplier
        };

        // v3.4: F2 — log GL scoring activation (once per pick cycle)
        if (targetGL != null && Number.isFinite(targetGL)) {
            console.info(`${LOG_PREFIX} 📊 [F2] GL scoring active:`, {
                targetGL,
                scenario,
                note: targetGL <= 10 ? 'PRE_SLEEP strict (GL<10)' : 'Day target (GL<20)',
            });
        }

        // 3. Pick products
        // v3.1: Используем balanced mix для сценариев требующих полноценный приём
        // v3.2: Добавлен LATE_EVENING для случаев с большим остатком калорий
        const BALANCED_SCENARIOS = ['PROTEIN_DEFICIT', 'BALANCED', 'POST_WORKOUT', 'PRE_WORKOUT', 'LATE_EVENING', 'PRE_SLEEP'];
        let picks;
        let isGroupedMode = false;

        if (BALANCED_SCENARIOS.includes(scenario)) {
            // Balanced mode: mix из разных категорий по пропорциям макросов
            // v3.3: pass scenario type so PRE_SLEEP gets sleep-friendly category override
            const categories = determineCategoryMix(targetProteinG, targetCarbsG, targetFatG, limit, scenario);
            picks = pickProductsMix(categories, scenarioContext, history, sharedProducts, 5, excludeProductIds instanceof Set ? excludeProductIds : null);
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

            flushPickerLogCycle();
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

        flushPickerLogCycle();
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
            PRE_SLEEP: PRODUCT_CATEGORIES.DAIRY,  // v3.3: casein/kefir pre-sleep (Halson 2014)
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

    console.info(`${LOG_PREFIX} ✅ Smart Product Picker v4.0.5 initialized (LATE_EVENING: DAIRY+PROTEIN category override, sleepGIPenalty extended)`);
    console.info(`${LOG_PREFIX} 📊 SCENARIO_IDEAL_MACRO_PROFILES loaded:`, Object.keys(SCENARIO_IDEAL_MACRO_PROFILES).join(', '));
    console.info(`${LOG_PREFIX} 📊 v4.0: Rebalanced scoring — macro alignment 49% (prot×3+carb×4+fat×9 Energy%), binary reduced to 6%, fat alignment added, kcalFit soft 0→1.2, neutral baselines 50`);
})(typeof window !== 'undefined' ? window : global);
