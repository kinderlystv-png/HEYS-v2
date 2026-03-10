/**
 * HEYS Advice Module v1 (Core)
 * Модульная система умных советов (core)
 * 
 * @file advice/_core.js
 * @version 1.2.0
 * @description Core-утилиты и движок советов (без категорий)
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // HELPER: Get product for item (by name first, then by id)
    // ═══════════════════════════════════════════════════════════
    function getProductForItem(item, pIndex) {
        if (!item || !pIndex) return null;
        // Сначала ищем по названию
        const nameKey = (item.name || '').trim().toLowerCase();
        if (nameKey && pIndex.byName) {
            const found = pIndex.byName.get(nameKey);
            if (found) return found;
        }
        // Fallback на product_id для обратной совместимости
        if (item.product_id != null && pIndex.byId) {
            const found = pIndex.byId.get(String(item.product_id).toLowerCase());
            if (found) return found;
        }
        // Если есть inline данные — возвращаем сам item
        if (item.kcal100 !== undefined || item.protein100 !== undefined) {
            return item;
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    const AdviceRules = window.HEYS && window.HEYS.adviceRules;
    if (!AdviceRules) {
        throw new Error('HEYS.adviceRules required');
    }

    const {
        MAX_ADVICES_PER_SESSION,
        ADVICE_COOLDOWN_MS,
        SESSION_KEY,
        TRACKING_KEY,
        PRIORITY,
        ADVICE_CACHE_TTL,
        MAX_ADVICES_PER_CATEGORY,
        THRESHOLDS,
        PRODUCT_CATEGORIES,
        DEDUPLICATION_RULES,
        TIME_RESTRICTIONS,
        ADVICE_CHAINS,
        STREAK_MILESTONES,
        QUICK_DISMISS_THRESHOLD_MS,
        DISMISS_PENALTY_FACTOR,
        TTL_CONFIG,
        RATING_KEY,
        TIME_BASED_TEXTS,
        COMBO_ACHIEVEMENTS,
        RECOMMENDATION_PATTERNS_KEY,
        MOOD_TONES,
        ADVICE_SETTINGS_KEY,
        DEFAULT_ADVICE_SETTINGS,
        CATEGORY_LABELS,
        PERSONAL_BESTS_KEY,
        TRACKABLE_METRICS,
        GOAL_MODES,
        SCHEDULED_KEY,
        SNOOZE_OPTIONS,
        ADVICE_ANIMATIONS,
        CTR_WEIGHT,
        RECENCY_WEIGHT,
        RELEVANCE_WEIGHT,
        SEASONAL_TIPS,
        CHAIN_STORAGE_KEY,
        MEAL_ADVICE_THROTTLE_MS
    } = AdviceRules;

    const OUTCOME_PROFILE_KEY = 'heys_advice_outcomes_v1';
    const OUTCOME_PENDING_KEY = 'heys_advice_pending_outcomes_v1';

    // ═══════════════════════════════════════════════════════════
    // 🚀 ADVICE CACHE — Кэширование результатов generateAdvices
    // ═══════════════════════════════════════════════════════════

    let adviceCache = {
        key: null,
        result: null,
        timestamp: 0
    };

    let expertSignalsCache = {
        key: null,
        result: null,
        timestamp: 0
    };

    /**
     * Генерирует ключ кэша для контекста
     * @param {Object} ctx
     * @returns {string}
     */
    function generateCacheKey(ctx) {
        const day = ctx?.day || {};
        const dayTot = ctx?.dayTot || {};
        const normAbs = ctx?.normAbs || {};
        const goalMode = ctx?.goal?.mode || '';

        return [
            day.date || '',
            ctx?.hour ?? '',
            ctx?.mealCount ?? '',
            ctx?.kcalPct ?? '',
            goalMode,
            day.isRefeedDay ? '1' : '0',
            dayTot.kcal || 0,
            dayTot.prot || 0,
            dayTot.carbs || 0,
            dayTot.fat || 0,
            dayTot.simple || 0,
            dayTot.fiber || 0,
            dayTot.harm || 0,
            normAbs.kcal || 0,
            normAbs.prot || 0,
            normAbs.carbs || 0,
            normAbs.fat || 0,
            normAbs.simple || 0,
            normAbs.fiber || 0,
            normAbs.harm || 0
        ].join('|');
    }

    /**
     * Проверяет валидность кэша для текущего контекста
     * @param {Object} ctx
     * @returns {boolean}
     */
    function isCacheValid(ctx) {
        if (!adviceCache.result) return false;
        if (Date.now() - adviceCache.timestamp > ADVICE_CACHE_TTL) return false;
        return adviceCache.key === generateCacheKey(ctx);
    }

    /**
     * Инвалидация кэша (например после добавления продукта)
     */
    function invalidateAdviceCache() {
        adviceCache = { key: null, result: null, timestamp: 0 };
    }

    // ═══════════════════════════════════════════════════════════
    // PERSONALIZED TEXT TEMPLATES
    // ═══════════════════════════════════════════════════════════

    /**
     * Заменяет плейсхолдеры в тексте
     * @param {string} text - Текст с плейсхолдерами
     * @param {Object} ctx - Контекст с данными
     * @returns {string}
     */
    function personalizeText(text, ctx) {
        const firstName = ctx.prof?.firstName || '';
        const result = text
            .replace(/\$\{firstName\}/g, firstName)
            .replace(/\$\{firstName\}, /g, firstName ? firstName + ', ' : '')
            .replace(/\$\{firstName\}!/g, firstName ? firstName + '!' : '')
            .replace(/\, \$\{firstName\}/g, firstName ? ', ' + firstName : '');
        return result.trim();
    }

    /**
     * Выбирает вариант текста детерминированно (стабильно в рамках сессии)
     * Используем дату + id для seed, чтобы выбор был стабильным но менялся ежедневно
     * @param {string|string[]} textOrArray
     * @param {string} [seed] - опциональный seed для детерминированного выбора (id совета)
     * @returns {string}
     */
    // Кэш выбранных текстов для стабильности в рамках сессии
    const _textChoiceCache = new Map();

    function pickRandomText(textOrArray, seed = '') {
        if (!Array.isArray(textOrArray)) {
            return textOrArray;
        }
        if (textOrArray.length === 1) {
            return textOrArray[0];
        }

        // Создаём ключ кэша из seed + текстов
        const cacheKey = seed + '|' + textOrArray.join('|');

        // Проверяем кэш
        if (_textChoiceCache.has(cacheKey)) {
            return _textChoiceCache.get(cacheKey);
        }

        // Детерминированный выбор на основе даты + seed
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const seedStr = today + seed;

        // Simple hash function
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) {
            const char = seedStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }

        const index = Math.abs(hash) % textOrArray.length;
        const result = textOrArray[index];

        // Сохраняем в кэш
        _textChoiceCache.set(cacheKey, result);

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // ADVICE RATING — Система оценки советов
    // ═══════════════════════════════════════════════════════════

    /**
     * Сохраняет оценку совета (👍/👎)
     * @param {string} adviceId
     * @param {boolean} isPositive - true = 👍, false = 👎
     */
    function rateAdvice(adviceId, isPositive) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(RATING_KEY, null)
                : (U.lsGet ? U.lsGet(RATING_KEY, null) : JSON.parse(localStorage.getItem(RATING_KEY) || 'null'));
            const ratings = stored || {};
            if (!ratings[adviceId]) {
                ratings[adviceId] = { positive: 0, negative: 0 };
            }
            if (isPositive) {
                ratings[adviceId].positive++;
            } else {
                ratings[adviceId].negative++;
            }
            ratings[adviceId].lastRated = Date.now();
            if (HEYS.store?.set) {
                HEYS.store.set(RATING_KEY, ratings);
            } else if (U.lsSet) {
                U.lsSet(RATING_KEY, ratings);
            } else {
                localStorage.setItem(RATING_KEY, JSON.stringify(ratings));
            }
        } catch (e) { }
    }

    /**
     * Получает рейтинг совета
     * @param {string} adviceId
     * @returns {Object} { positive, negative, score }
     */
    function getAdviceRating(adviceId) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(RATING_KEY, null)
                : (U.lsGet ? U.lsGet(RATING_KEY, null) : JSON.parse(localStorage.getItem(RATING_KEY) || 'null'));
            const ratings = stored || {};
            const r = ratings[adviceId] || { positive: 0, negative: 0 };
            const total = r.positive + r.negative;
            const score = total > 0 ? (r.positive - r.negative) / total : 0;
            return { ...r, score, total };
        } catch (e) {
            return { positive: 0, negative: 0, score: 0, total: 0 };
        }
    }

    /**
     * Получает все рейтинги (с автоочисткой старых >60 дней)
     * @returns {Object}
     */
    function getAllRatings() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const parsed = HEYS.store?.get
                ? (HEYS.store.get(RATING_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(RATING_KEY, null) || {}) : JSON.parse(localStorage.getItem(RATING_KEY) || 'null') || {});

            // Автоочистка: удаляем записи старше 60 дней
            const now = Date.now();
            const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
            let needsSave = false;
            Object.keys(parsed).forEach(key => {
                if (parsed[key].lastRated && (now - parsed[key].lastRated) > SIXTY_DAYS) {
                    delete parsed[key];
                    needsSave = true;
                }
            });
            if (needsSave) {
                if (HEYS.store?.set) {
                    HEYS.store.set(RATING_KEY, parsed);
                } else if (U.lsSet) {
                    U.lsSet(RATING_KEY, parsed);
                } else {
                    localStorage.setItem(RATING_KEY, JSON.stringify(parsed));
                }
            }
            return parsed;
        } catch (e) {
            return {};
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TIME-BASED TEXT SELECTION — Выбор текста по времени суток
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает период дня
     * @param {number} hour
     * @returns {'morning'|'afternoon'|'evening'}
     */
    function getTimePeriod(hour) {
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        return 'evening';
    }

    /**
     * Выбирает текст совета с учётом времени суток
     * @param {string} adviceId
     * @param {number} hour
     * @param {string} defaultText
     * @returns {string}
     */
    function getTimeBasedText(adviceId, hour, defaultText) {
        const variants = TIME_BASED_TEXTS[adviceId];
        if (!variants) return defaultText;

        const period = getTimePeriod(hour);
        const texts = variants[period];

        if (texts && texts.length > 0) {
            return pickRandomText(texts);
        }
        return defaultText;
    }

    // ═══════════════════════════════════════════════════════════
    // COMBO ACHIEVEMENTS — Проверка комбо достижений
    // ═══════════════════════════════════════════════════════════

    /**
     * Проверяет combo достижения на основе истории
     * @param {Object} ctx - Контекст с текущими данными
     * @returns {Object|null} Достигнутое комбо или null
     */
    function checkComboAchievements(ctx) {
        try {
            const lsGet = (window.HEYS?.utils?.lsGet) || ((k, d) => {
                try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
            });

            const today = new Date();

            for (const combo of COMBO_ACHIEVEMENTS) {
                // Проверяем, не показывали ли уже это комбо
                const shownKey = 'heys_combo_' + combo.id;
                const HEYS = window.HEYS || {};
                const U = HEYS.utils || {};
                const lastShown = HEYS.store?.get
                    ? HEYS.store.get(shownKey, null)
                    : (U.lsGet ? U.lsGet(shownKey, null) : localStorage.getItem(shownKey));
                if (lastShown) {
                    const daysSince = (Date.now() - parseInt(lastShown, 10)) / (1000 * 60 * 60 * 24);
                    if (daysSince < 7) continue; // Не чаще раза в неделю
                }

                // Собираем данные за нужное количество дней
                let successDays = 0;

                for (let i = 0; i < combo.daysRequired + 2; i++) { // +2 для буфера
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const iso = d.toISOString().slice(0, 10);
                    const dayData = lsGet('heys_dayv2_' + iso, null);

                    if (!dayData?.meals?.length) continue;

                    // Проверяем условия
                    let meetsConditions = true;
                    const cond = combo.conditions;

                    if (cond.proteinPct !== undefined) {
                        const pct = (dayData.dayTot?.prot || 0) / (ctx.normAbs?.prot || 100);
                        if (pct < cond.proteinPct) meetsConditions = false;
                    }
                    if (cond.fiberPct !== undefined) {
                        const pct = (dayData.dayTot?.fiber || 0) / (ctx.normAbs?.fiber || 25);
                        if (pct < cond.fiberPct) meetsConditions = false;
                    }
                    if (cond.waterPct !== undefined) {
                        const pct = (dayData.waterMl || 0) / (ctx.waterGoal || 2000);
                        if (pct < cond.waterPct) meetsConditions = false;
                    }
                    if (cond.harmPct !== undefined) {
                        const pct = (dayData.dayTot?.harm || 0) / 100;
                        if (pct > cond.harmPct) meetsConditions = false;
                    }
                    if (cond.breakfastBefore !== undefined) {
                        const firstMeal = (dayData.meals || []).find(m => m.items?.length > 0);
                        if (firstMeal?.time) {
                            const [h] = firstMeal.time.split(':').map(Number);
                            if (h >= cond.breakfastBefore) meetsConditions = false;
                        } else {
                            meetsConditions = false;
                        }
                    }

                    if (meetsConditions) successDays++;
                    if (successDays >= combo.daysRequired) {
                        return combo;
                    }
                }
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Отмечает показ комбо
     * @param {string} comboId
     */
    function markComboShown(comboId) {
        try {
            const key = 'heys_combo_' + comboId;
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            if (HEYS.store?.set) {
                HEYS.store.set(key, String(Date.now()));
            } else if (U.lsSet) {
                U.lsSet(key, String(Date.now()));
            } else {
                localStorage.setItem(key, String(Date.now()));
            }
        } catch (e) { }
    }

    // ═══════════════════════════════════════════════════════════
    // SMART RECOMMENDATIONS — Анализ паттернов пользователя
    // ═══════════════════════════════════════════════════════════

    /**
     * Записывает паттерн добавления продукта
     * @param {string} productName
     * @param {number} hour
     */
    function trackProductPattern(productName, hour) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(RECOMMENDATION_PATTERNS_KEY, null)
                : (U.lsGet ? U.lsGet(RECOMMENDATION_PATTERNS_KEY, null) : JSON.parse(localStorage.getItem(RECOMMENDATION_PATTERNS_KEY) || 'null'));
            const patterns = stored || {};
            const key = productName.toLowerCase().slice(0, 20); // Первые 20 символов

            if (!patterns[key]) {
                patterns[key] = { hours: [], count: 0 };
            }

            patterns[key].hours.push(hour);
            patterns[key].count++;
            patterns[key].lastAdded = Date.now();

            // Держим только последние 10 записей времени
            if (patterns[key].hours.length > 10) {
                patterns[key].hours = patterns[key].hours.slice(-10);
            }

            if (HEYS.store?.set) {
                HEYS.store.set(RECOMMENDATION_PATTERNS_KEY, patterns);
            } else if (U.lsSet) {
                U.lsSet(RECOMMENDATION_PATTERNS_KEY, patterns);
            } else {
                localStorage.setItem(RECOMMENDATION_PATTERNS_KEY, JSON.stringify(patterns));
            }
        } catch (e) { }
    }

    /**
     * Получает рекомендации на основе паттернов
     * @param {number} currentHour
     * @returns {Object|null} { productName, avgHour, message }
     */
    function getSmartRecommendation(currentHour) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(RECOMMENDATION_PATTERNS_KEY, null)
                : (U.lsGet ? U.lsGet(RECOMMENDATION_PATTERNS_KEY, null) : JSON.parse(localStorage.getItem(RECOMMENDATION_PATTERNS_KEY) || 'null'));
            const patterns = stored || {};

            let bestMatch = null;
            let bestScore = 0;

            for (const [product, data] of Object.entries(patterns)) {
                if (data.count < 3) continue; // Минимум 3 раза добавлял

                // Средний час добавления
                const avgHour = Math.round(data.hours.reduce((a, b) => a + b, 0) / data.hours.length);

                // Проверяем, близко ли текущее время к обычному
                const hourDiff = Math.abs(currentHour - avgHour);
                if (hourDiff <= 1) { // В пределах часа
                    const score = data.count / (hourDiff + 1);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = {
                            productName: product,
                            avgHour,
                            count: data.count,
                            message: `Обычно в это время ты добавляешь ${product}`
                        };
                    }
                }
            }

            return bestMatch;
        } catch (e) {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MOOD-ADAPTIVE MESSAGES — Адаптация тона под настроение
    // ═══════════════════════════════════════════════════════════

    /**
     * Адаптирует текст совета под текущее настроение
     * @param {string} text - Оригинальный текст
     * @param {number} mood - Настроение (1-5)
     * @param {string} adviceType - Тип совета
     * @returns {string}
     */
    function adaptTextToMood(text, mood, adviceType) {
        if (!mood || mood === 0) return text;

        let toneKey = 'neutral';
        if (mood <= 2) toneKey = 'low';
        else if (mood >= 4) toneKey = 'high';

        const tone = MOOD_TONES[toneKey];
        if (!tone) return text;

        // При низком настроении избегаем жёстких советов
        if (tone.avoid.includes(adviceType)) {
            return null; // Сигнал не показывать
        }

        // Добавляем prefix/suffix случайно
        const prefix = pickRandomText(tone.prefix);
        const suffix = pickRandomText(tone.suffix);

        return prefix + text + suffix;
    }

    /**
     * Получает среднее настроение за сегодня
     * @param {Object} day
     * @returns {number} 0-5
     */
    function getAverageMoodToday(day) {
        const meals = (day?.meals || []).filter(m => m.mood > 0);
        if (meals.length === 0) return 0;
        return meals.reduce((sum, m) => sum + m.mood, 0) / meals.length;
    }

    // ═══════════════════════════════════════════════════════════
    // SMART PRIORITIZATION — ML-like scoring на основе CTR
    // ═══════════════════════════════════════════════════════════

    /**
     * Вычисляет smart score для совета (без кэша - для отдельных вызовов)
     * @param {Object} advice
     * @param {Object} ctx
     * @returns {number} Score (выше = лучше)
     */
    function calculateSmartScore(advice, ctx) {
        return calculateSmartScoreCached(advice, ctx, getTrackingStats(), getAllRatings());
    }

    /**
     * Сортирует советы по smart score
     * @param {Array} advices
     * @param {Object} ctx
     * @returns {Array}
     */
    function sortBySmartScore(advices, ctx) {
        // 🚀 Оптимизация: кэшируем stats и ratings для всей сортировки
        const cachedStats = getTrackingStats();
        const cachedRatings = getAllRatings();

        return advices
            .map(a => ({ ...a, smartScore: calculateSmartScoreCached(a, ctx, cachedStats, cachedRatings) }))
            .sort((a, b) => b.smartScore - a.smartScore);
    }

    /**
     * Вычисляет smart score с кэшированными данными
     * @param {Object} advice
     * @param {Object} ctx
     * @param {Object} stats - кэшированные stats
     * @param {Object} ratings - кэшированные ratings
     * @returns {number}
     */
    function calculateSmartScoreCached(advice, ctx, stats, ratings) {
        let score = 100 - advice.priority;

        // 1. CTR factor
        const adviceStats = stats[advice.id];
        if (adviceStats && adviceStats.shown >= 3) {
            const ctr = adviceStats.clicked / adviceStats.shown;
            score += ctr * 50 * CTR_WEIGHT;
        }

        // 2. Rating factor
        const r = ratings[advice.id] || { positive: 0, negative: 0 };
        const total = r.positive + r.negative;
        if (total >= 2) {
            const ratingScore = (r.positive - r.negative) / total;
            score += ratingScore * 30 * CTR_WEIGHT;
        }

        // 3. Recency factor
        if (adviceStats?.lastShown) {
            const hoursSince = (Date.now() - adviceStats.lastShown) / (1000 * 60 * 60);
            if (hoursSince > 24) {
                score += Math.min(hoursSince / 24, 5) * 10 * RECENCY_WEIGHT;
            }
        } else {
            score += 10 * RECENCY_WEIGHT;
        }

        // 4. Relevance
        if (advice.category === 'nutrition' && advice.nutrient) {
            const pct = (ctx.dayTot?.[advice.nutrient] || 0) / (ctx.normAbs?.[advice.nutrient] || 100);
            if (pct < 0.5) score += 20 * RELEVANCE_WEIGHT;
        }

        // 5. 🆕 Crash Risk boost — повышаем приоритет советов при высоком риске срыва
        if (ctx.crashRisk && ctx.crashRisk.level === 'high') {
            // Советы, связанные с предотвращением срыва, получают бонус
            const crashPreventionCategories = ['emotional', 'nutrition', 'recovery'];
            const crashPreventionIds = [
                'crash_support', 'stress_support', 'sleep_hunger_correlation',
                'undereating_warning', 'evening_undereating', 'chronic_undereating_pattern'
            ];

            if (crashPreventionCategories.includes(advice.category) ||
                crashPreventionIds.includes(advice.id)) {
                score += 30; // Значительный бонус при высоком риске
            }
        } else if (ctx.crashRisk && ctx.crashRisk.level === 'medium') {
            // Умеренный бонус при среднем риске
            if (advice.category === 'emotional' || advice.id?.includes('stress')) {
                score += 15;
            }
        }

        // 6. Expert evidence factor
        const evidenceScore = advice?.expertMeta?.evidenceScore || 0;
        const sourceCount = advice?.expertMeta?.sourceCount || 0;
        const contradictionsCount = Array.isArray(advice?.expertMeta?.contradictions)
            ? advice.expertMeta.contradictions.length
            : 0;
        const urgency = advice?.expertMeta?.actionNow?.urgency;

        score += Math.min(24, evidenceScore / 3.5);
        score += Math.min(10, sourceCount * 3);
        if (urgency === 'now') score += 12;
        else if (urgency === 'today') score += 5;
        score -= contradictionsCount * 10;

        return score;
    }

    // ═══════════════════════════════════════════════════════════
    // ADVICE SETTINGS — Управление настройками
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает настройки советов
     * 🔧 FIX: Используем U.lsGet для синхронизации с облаком
     * @returns {Object}
     */
    function getAdviceSettings() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(ADVICE_SETTINGS_KEY, null)
                : (U.lsGet ? U.lsGet(ADVICE_SETTINGS_KEY, null) : JSON.parse(localStorage.getItem(ADVICE_SETTINGS_KEY) || 'null'));
            if (stored) {
                return { ...DEFAULT_ADVICE_SETTINGS, ...stored };
            }
        } catch (e) { }
        return { ...DEFAULT_ADVICE_SETTINGS };
    }

    /**
     * Сохраняет настройки советов
     * 🔧 FIX: Используем U.lsSet для синхронизации с облаком
     * @param {Object} settings
     */
    function setAdviceSettings(settings) {
        try {
            const current = getAdviceSettings();
            const merged = { ...current, ...settings };
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            if (HEYS.store?.set) {
                HEYS.store.set(ADVICE_SETTINGS_KEY, merged);
            } else if (U.lsSet) {
                U.lsSet(ADVICE_SETTINGS_KEY, merged);
            } else {
                localStorage.setItem(ADVICE_SETTINGS_KEY, JSON.stringify(merged));
            }
            // Emit event для UI
            window.dispatchEvent(new CustomEvent('heysAdviceSettingsChanged', { detail: merged }));
        } catch (e) { }
    }

    /**
     * Проверяет, включена ли категория советов
     * @param {string} category
     * @returns {boolean}
     */
    function isCategoryEnabled(category) {
        const settings = getAdviceSettings();
        return settings.categories?.[category] !== false;
    }

    /**
     * Переключает категорию
     * @param {string} category
     * @param {boolean} enabled
     */
    function toggleCategory(category, enabled) {
        const settings = getAdviceSettings();
        settings.categories = settings.categories || {};
        settings.categories[category] = enabled;
        setAdviceSettings(settings);
    }

    // ═══════════════════════════════════════════════════════════
    // PERSONAL BEST TRACKING — Отслеживание рекордов
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает все личные рекорды
     * @returns {Object}
     */
    function getPersonalBests() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(PERSONAL_BESTS_KEY, null)
                : (U.lsGet ? U.lsGet(PERSONAL_BESTS_KEY, null) : JSON.parse(localStorage.getItem(PERSONAL_BESTS_KEY) || 'null'));
            return stored || {};
        } catch (e) {
            return {};
        }
    }

    /**
     * Проверяет и обновляет личный рекорд
     * @param {string} metric - Ключ метрики
     * @param {number} value - Текущее значение
     * @param {string} date - Дата в ISO формате
     * @returns {Object|null} { isNewRecord, previousValue, improvement }
     */
    function checkAndUpdatePersonalBest(metric, value, date) {
        const config = TRACKABLE_METRICS[metric];
        if (!config) return null;

        const bests = getPersonalBests();
        const current = bests[metric];

        let isNewRecord = false;
        let previousValue = null;

        if (!current) {
            isNewRecord = true;
        } else {
            previousValue = current.value;
            if (config.higher) {
                isNewRecord = value > current.value;
            } else {
                isNewRecord = value < current.value;
            }
        }

        if (isNewRecord && value > 0) {
            bests[metric] = { value, date, previous: previousValue };
            try {
                const HEYS = window.HEYS || {};
                const U = HEYS.utils || {};
                if (HEYS.store?.set) {
                    HEYS.store.set(PERSONAL_BESTS_KEY, bests);
                } else if (U.lsSet) {
                    U.lsSet(PERSONAL_BESTS_KEY, bests);
                } else {
                    localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(bests));
                }
            } catch (e) { }

            return {
                isNewRecord: true,
                previousValue,
                improvement: previousValue ? Math.abs(value - previousValue) : null,
                metric: config
            };
        }

        return { isNewRecord: false, currentBest: current?.value };
    }

    /**
     * Генерирует совет для нового рекорда
     * @param {string} metric
     * @param {Object} recordInfo
     * @returns {Object|null} Advice object
     */
    function createPersonalBestAdvice(metric, recordInfo) {
        if (!recordInfo?.isNewRecord) return null;

        const config = TRACKABLE_METRICS[metric];
        if (!config) return null;

        const value = recordInfo.improvement
            ? `+${recordInfo.improvement.toFixed(1)}${config.unit} от прошлого!`
            : `${config.unit}`;

        return {
            id: 'personal_best_' + metric,
            icon: '🏆',
            text: `Новый личный рекорд: ${config.name}! ${value}`,
            type: 'achievement',
            priority: 3,
            category: 'achievement',
            triggers: ['tab_open'],
            ttl: 6000,
            showConfetti: true,
            animation: 'bounce'
        };
    }

    // ═══════════════════════════════════════════════════════════
    // ADVICE CHAINS — Связанные советы
    // ═══════════════════════════════════════════════════════════

    /**
     * Отмечает начало цепочки советов
     * @param {string} chainId - ID начального совета
     */
    function markChainStart(chainId) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const chains = HEYS.store?.get
                ? (HEYS.store.get(CHAIN_STORAGE_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(CHAIN_STORAGE_KEY, null) || {}) : JSON.parse(localStorage.getItem(CHAIN_STORAGE_KEY) || 'null') || {});
            chains[chainId] = Date.now();
            if (HEYS.store?.set) {
                HEYS.store.set(CHAIN_STORAGE_KEY, chains);
            } else if (U.lsSet) {
                U.lsSet(CHAIN_STORAGE_KEY, chains);
            } else {
                localStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify(chains));
            }
        } catch (e) { }
    }

    /**
     * Проверяет, пора ли показать следующий совет в цепочке
     * @param {string} chainId
     * @returns {Object|null} Next advice in chain или null
     */
    function checkChainContinuation(chainId) {
        const chainConfig = ADVICE_CHAINS[chainId];
        if (!chainConfig) return null;

        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const chains = HEYS.store?.get
                ? (HEYS.store.get(CHAIN_STORAGE_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(CHAIN_STORAGE_KEY, null) || {}) : JSON.parse(localStorage.getItem(CHAIN_STORAGE_KEY) || 'null') || {});
            const startTime = chains[chainId];
            if (!startTime) return null;

            const minutesPassed = (Date.now() - startTime) / (1000 * 60);
            if (minutesPassed >= chainConfig.delayMinutes) {
                // Удаляем из chains, чтобы не показать снова
                delete chains[chainId];
                if (HEYS.store?.set) {
                    HEYS.store.set(CHAIN_STORAGE_KEY, chains);
                } else if (U.lsSet) {
                    U.lsSet(CHAIN_STORAGE_KEY, chains);
                } else {
                    localStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify(chains));
                }

                return chainConfig.next;
            }
        } catch (e) { }

        return null;
    }

    /**
     * Генерирует follow-up советы для цепочек
     * @returns {Array} Массив follow-up советов
     */
    function generateChainAdvices() {
        const advices = [];

        // Проверяем все активные цепочки
        for (const chainId of Object.keys(ADVICE_CHAINS)) {
            const nextId = checkChainContinuation(chainId);
            if (nextId) {
                // Генерируем follow-up совет
                if (nextId === 'water_benefits') {
                    advices.push({
                        id: 'water_benefits',
                        icon: '💧',
                        text: 'Вода ускоряет метаболизм на 30% на час после стакана',
                        type: 'tip',
                        priority: 45,
                        category: 'hydration',
                        triggers: ['tab_open'],
                        ttl: 5000
                    });
                }
            }
        }

        return advices;
    }

    // ═══════════════════════════════════════════════════════════
    // ADVICE SCHEDULING — Отложенные напоминания
    // ═══════════════════════════════════════════════════════════

    /**
     * Откладывает совет на указанное время
     * @param {Object} advice - Совет
     * @param {number} minutes - Через сколько минут показать
     */
    function scheduleAdvice(advice, minutes) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const scheduled = HEYS.store?.get
                ? (HEYS.store.get(SCHEDULED_KEY, null) || [])
                : (U.lsGet ? (U.lsGet(SCHEDULED_KEY, null) || []) : JSON.parse(localStorage.getItem(SCHEDULED_KEY) || 'null') || []);
            scheduled.push({
                advice,
                showAt: Date.now() + minutes * 60 * 1000
            });
            if (HEYS.store?.set) {
                HEYS.store.set(SCHEDULED_KEY, scheduled);
            } else if (U.lsSet) {
                U.lsSet(SCHEDULED_KEY, scheduled);
            } else {
                localStorage.setItem(SCHEDULED_KEY, JSON.stringify(scheduled));
            }

            // Уведомление об отложке
            window.dispatchEvent(new CustomEvent('heysAdviceScheduled', {
                detail: { advice, minutes }
            }));
        } catch (e) { }
    }

    /**
     * Получает советы, которые пора показать
     * @returns {Array}
     */
    function getScheduledAdvices() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const scheduled = HEYS.store?.get
                ? (HEYS.store.get(SCHEDULED_KEY, null) || [])
                : (U.lsGet ? (U.lsGet(SCHEDULED_KEY, null) || []) : JSON.parse(localStorage.getItem(SCHEDULED_KEY) || 'null') || []);
            if (scheduled.length === 0) return []; // Ничего нет — не трогаем storage

            const now = Date.now();

            const ready = scheduled.filter(s => s.showAt <= now);
            const remaining = scheduled.filter(s => s.showAt > now);

            // Обновляем storage ТОЛЬКО если есть готовые советы (чтобы не спамить)
            if (ready.length > 0) {
                if (HEYS.store?.set) {
                    HEYS.store.set(SCHEDULED_KEY, remaining);
                } else if (U.lsSet) {
                    U.lsSet(SCHEDULED_KEY, remaining);
                } else {
                    localStorage.setItem(SCHEDULED_KEY, JSON.stringify(remaining));
                }
            }

            return ready.map(s => ({
                ...s.advice,
                id: s.advice.id + '_scheduled',
                isScheduled: true,
                text: '⏰ ' + s.advice.text,
                triggers: ['scheduled', 'tab_open', 'product_added'], // Показываем при любом триггере
                priority: 100 // Высокий приоритет — пользователь сам отложил
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Получает количество отложенных советов
     * @returns {number}
     */
    function getScheduledCount() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const scheduled = HEYS.store?.get
                ? (HEYS.store.get(SCHEDULED_KEY, null) || [])
                : (U.lsGet ? (U.lsGet(SCHEDULED_KEY, null) || []) : JSON.parse(localStorage.getItem(SCHEDULED_KEY) || 'null') || []);
            return scheduled.length;
        } catch (e) {
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // GOAL-SPECIFIC ADVICE — Советы по целям
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает бонусные советы для текущей цели
     * @param {string} goalMode
     * @returns {Array}
     */
    function getGoalSpecificAdvices(goalMode) {
        const config = GOAL_MODES[goalMode];
        if (!config || !config.bonusAdvices) return [];

        return config.bonusAdvices.map(a => ({
            ...a,
            type: 'tip',
            category: 'lifestyle',
            triggers: ['tab_open'],
            ttl: 5000,
            goalSpecific: true
        }));
    }

    // ═══════════════════════════════════════════════════════════
    // MICRO-ANIMATIONS — Получение анимации для типа совета
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает класс анимации для совета
     * @param {Object} advice
     * @returns {string} CSS class name
     */
    function getAdviceAnimation(advice) {
        // Явно заданная анимация
        if (advice.animation) return advice.animation;

        // По типу
        return ADVICE_ANIMATIONS[advice.type] || 'fadeSlide';
    }

    // ═══════════════════════════════════════════════════════════
    // SMART PRODUCT CATEGORIES — Определение категорий продуктов
    // ═══════════════════════════════════════════════════════════

    /**
     * Анализирует продукты дня и определяет какие категории представлены
     * @param {Object} day - Данные дня
     * @param {Object} pIndex - Индекс продуктов
     * @returns {Object} { present: Set<string>, missing: string[], counts: Map }
     */
    function analyzeProductCategories(day, pIndex) {
        const present = new Set();
        const counts = new Map();

        const allItems = (day?.meals || []).flatMap(m => m.items || []);

        for (const item of allItems) {
            let productName = item.name || '';
            if (!productName) {
                const product = getProductForItem(item, pIndex);
                if (product) productName = product.name || '';
            }

            const nameLower = productName.toLowerCase();

            for (const [category, config] of Object.entries(PRODUCT_CATEGORIES)) {
                if (config.keywords.some(kw => nameLower.includes(kw))) {
                    present.add(category);
                    counts.set(category, (counts.get(category) || 0) + 1);
                }
            }
        }

        // Определяем недостающие важные категории
        const importantCategories = ['vegetables', 'fruits', 'dairy', 'fish'];
        const missing = importantCategories.filter(c => !present.has(c));

        return { present, missing, counts };
    }

    // ═══════════════════════════════════════════════════════════
    // DAY FORECAST — Прогноз калорий к концу дня
    // ═══════════════════════════════════════════════════════════

    /**
     * Прогнозирует итоговый % калорий к концу дня
     * @param {number} currentKcalPct - Текущий % от нормы
     * @param {number} hour - Текущий час
     * @param {number} mealCount - Количество приёмов пищи
     * @returns {Object} { forecastPct, trend: 'under'|'on_track'|'over', message }
     */
    function getDayForecast(currentKcalPct, hour, mealCount) {
        if (hour < 10 || mealCount === 0) return null;

        // Типичное распределение: к 12:00 ~25%, к 15:00 ~50%, к 18:00 ~75%, к 21:00 ~95%
        const expectedByHour = {
            10: 0.15, 11: 0.20, 12: 0.30, 13: 0.40, 14: 0.50,
            15: 0.55, 16: 0.60, 17: 0.65, 18: 0.75, 19: 0.80,
            20: 0.85, 21: 0.92, 22: 0.97, 23: 1.0
        };

        const expectedNow = expectedByHour[hour] || (hour < 10 ? 0.1 : 1.0);
        const pace = currentKcalPct / expectedNow;

        // Прогноз на конец дня
        const forecastPct = Math.round(pace * 100);

        let trend = 'on_track';
        let message = '';

        if (pace < 0.85) {
            trend = 'under';
            message = `При текущем темпе будет ~${forecastPct}% к вечеру`;
        } else if (pace > 1.15) {
            trend = 'over';
            message = `При текущем темпе будет ~${forecastPct}% к вечеру`;
        } else {
            trend = 'on_track';
            message = `Темп хороший — будет ~${forecastPct}% к вечеру`;
        }

        return { forecastPct, trend, message, pace };
    }

    // ═══════════════════════════════════════════════════════════
    // WEEKLY COMPARISON — Сравнение с прошлой неделей
    // ═══════════════════════════════════════════════════════════

    /**
     * Сравнивает метрики текущей недели с прошлой
     * @returns {Object|null} { kcalDiff, simpleDiff, protDiff, message }
     */
    function getWeeklyComparison() {
        try {
            const lsGet = (window.HEYS?.utils?.lsGet) || ((k, d) => {
                try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
            });

            const today = new Date();
            const dayOfWeek = today.getDay() || 7; // 1-7 (пн-вс)

            // Если понедельник или вторник — мало данных
            if (dayOfWeek <= 2) return null;

            let thisWeek = { kcal: 0, simple: 0, prot: 0, days: 0 };
            let lastWeek = { kcal: 0, simple: 0, prot: 0, days: 0 };

            // Собираем данные текущей недели
            for (let i = 0; i < dayOfWeek; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().slice(0, 10);
                const dayData = lsGet('heys_dayv2_' + iso, null);
                if (dayData?.meals?.length > 0) {
                    thisWeek.kcal += dayData.dayTot?.kcal || 0;
                    thisWeek.simple += dayData.dayTot?.simple || 0;
                    thisWeek.prot += dayData.dayTot?.prot || 0;
                    thisWeek.days++;
                }
            }

            // Собираем данные прошлой недели (те же дни)
            for (let i = 7; i < 7 + dayOfWeek; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().slice(0, 10);
                const dayData = lsGet('heys_dayv2_' + iso, null);
                if (dayData?.meals?.length > 0) {
                    lastWeek.kcal += dayData.dayTot?.kcal || 0;
                    lastWeek.simple += dayData.dayTot?.simple || 0;
                    lastWeek.prot += dayData.dayTot?.prot || 0;
                    lastWeek.days++;
                }
            }

            if (thisWeek.days < 2 || lastWeek.days < 2) return null;

            // Средние значения
            const avgThis = {
                kcal: thisWeek.kcal / thisWeek.days,
                simple: thisWeek.simple / thisWeek.days,
                prot: thisWeek.prot / thisWeek.days
            };
            const avgLast = {
                kcal: lastWeek.kcal / lastWeek.days,
                simple: lastWeek.simple / lastWeek.days,
                prot: lastWeek.prot / lastWeek.days
            };

            // Процентные изменения
            const kcalDiff = avgLast.kcal > 0 ? Math.round((avgThis.kcal - avgLast.kcal) / avgLast.kcal * 100) : 0;
            const simpleDiff = avgLast.simple > 0 ? Math.round((avgThis.simple - avgLast.simple) / avgLast.simple * 100) : 0;
            const protDiff = avgLast.prot > 0 ? Math.round((avgThis.prot - avgLast.prot) / avgLast.prot * 100) : 0;

            // Генерируем сообщение для самого значительного изменения
            let message = null;
            const absDiffs = [
                { type: 'simple', diff: simpleDiff, positive: simpleDiff < 0 },
                { type: 'prot', diff: protDiff, positive: protDiff > 0 },
                { type: 'kcal', diff: kcalDiff, positive: Math.abs(kcalDiff) < 10 }
            ];

            // Ищем хорошие новости
            const goodNews = absDiffs.filter(d => d.positive && Math.abs(d.diff) >= 10);
            if (goodNews.length > 0) {
                const best = goodNews.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
                if (best.type === 'simple' && best.diff < -10) {
                    message = `На ${Math.abs(best.diff)}% меньше сахара чем на прошлой неделе! 🎉`;
                } else if (best.type === 'prot' && best.diff > 10) {
                    message = `На ${best.diff}% больше белка чем на прошлой неделе! 💪`;
                }
            }

            return { kcalDiff, simpleDiff, protDiff, message, thisWeek, lastWeek };
        } catch (e) {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SMART DISMISS — Умное скрытие советов
    // ═══════════════════════════════════════════════════════════

    /**
     * Записывает быстрое закрытие совета
     * @param {string} adviceId
     * @param {number} visibleMs - Сколько мс был виден
     */
    function trackDismiss(adviceId, visibleMs) {
        try {
            if (visibleMs < QUICK_DISMISS_THRESHOLD_MS) {
                const key = 'heys_dismiss_' + adviceId;
                const HEYS = window.HEYS || {};
                const U = HEYS.utils || {};
                const stored = HEYS.store?.get
                    ? HEYS.store.get(key, null)
                    : (U.lsGet ? U.lsGet(key, null) : localStorage.getItem(key));
                const count = parseInt(stored || '0', 10);
                const nextValue = String(count + 1);
                if (HEYS.store?.set) {
                    HEYS.store.set(key, nextValue);
                } else if (U.lsSet) {
                    U.lsSet(key, nextValue);
                } else {
                    localStorage.setItem(key, nextValue);
                }
            }
        } catch (e) { }
    }

    /**
     * Получает множитель приоритета на основе истории быстрых закрытий
     * @param {string} adviceId
     * @returns {number} 1.0 = норма, <1 = снижен
     */
    function getDismissPenalty(adviceId) {
        try {
            const key = 'heys_dismiss_' + adviceId;
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(key, null)
                : (U.lsGet ? U.lsGet(key, null) : localStorage.getItem(key));
            const count = parseInt(stored || '0', 10);
            if (count >= 3) return 0.3;  // 3+ быстрых закрытий = сильно снижаем
            if (count >= 2) return 0.5;  // 2 = умеренно
            if (count >= 1) return 0.7;  // 1 = слегка
            return 1.0;
        } catch (e) {
            return 1.0;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DYNAMIC TTL — Адаптивное время показа
    // ═══════════════════════════════════════════════════════════

    /**
     * Вычисляет оптимальный TTL на основе длины текста
     * @param {string} text
     * @param {boolean} isCritical
     * @returns {number} TTL в мс
     */
    function calculateDynamicTTL(text, isCritical = false) {
        const baseTime = text.length * TTL_CONFIG.msPerChar;
        let ttl = Math.max(TTL_CONFIG.minTTL, Math.min(TTL_CONFIG.maxTTL, baseTime));
        if (isCritical) ttl += TTL_CONFIG.criticalBonus;
        return ttl;
    }

    // ═══════════════════════════════════════════════════════════
    // ADVICE CHAINS — Связанные советы
    // ═══════════════════════════════════════════════════════════

    /**
     * Проверяет, есть ли follow-up совет для показа
     * @param {string} prevAdviceId
     * @returns {Object|null} { nextAdviceId, ready: boolean }
     */
    function checkAdviceChain(prevAdviceId) {
        const chain = ADVICE_CHAINS[prevAdviceId];
        if (!chain) return null;

        try {
            const key = 'heys_chain_' + prevAdviceId;
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const shownAt = HEYS.store?.get
                ? HEYS.store.get(key, null)
                : (U.lsGet ? U.lsGet(key, null) : localStorage.getItem(key));
            if (!shownAt) return null;

            const elapsed = Date.now() - parseInt(shownAt, 10);
            const ready = elapsed >= chain.delayMinutes * 60 * 1000;

            return { nextAdviceId: chain.next, ready };
        } catch (e) {
            return null;
        }
    }

    /**
     * Записывает показ совета для chain
     * @param {string} adviceId
     */
    function markChainStartForAdvice(adviceId) {
        if (ADVICE_CHAINS[adviceId]) {
            try {
                const key = 'heys_chain_' + adviceId;
                const HEYS = window.HEYS || {};
                const U = HEYS.utils || {};
                const value = String(Date.now());
                if (HEYS.store?.set) {
                    HEYS.store.set(key, value);
                } else if (U.lsSet) {
                    U.lsSet(key, value);
                } else {
                    localStorage.setItem(key, value);
                }
            } catch (e) { }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // STREAK GAMIFICATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает ближайший milestone streak и сколько осталось
     * @param {number} currentStreak
     * @returns {Object|null} { milestone, remain, icon, text }
     */
    function getNextStreakMilestone(currentStreak) {
        for (const m of STREAK_MILESTONES) {
            if (currentStreak < m.days) {
                const remain = m.days - currentStreak;
                const text = m.text.replace('${remain}', String(remain));
                return { milestone: m.days, remain, icon: m.icon, text };
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // WEEKLY SUMMARY
    // ═══════════════════════════════════════════════════════════

    /**
     * Генерирует итоги недели (для воскресенья вечером)
     * @returns {Object|null} { avgKcal, avgProt, avgSimple, bestDay, worstDay, message }
     */
    function getWeeklySummary() {
        try {
            const lsGet = (window.HEYS?.utils?.lsGet) || ((k, d) => {
                try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
            });

            const today = new Date();
            if (today.getDay() !== 0) return null; // Только воскресенье

            const weekDays = [];

            for (let i = 0; i < 7; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const iso = d.toISOString().slice(0, 10);
                const dayData = lsGet('heys_dayv2_' + iso, null);
                if (dayData?.meals?.length > 0) {
                    weekDays.push({
                        date: iso,
                        kcal: dayData.dayTot?.kcal || 0,
                        prot: dayData.dayTot?.prot || 0,
                        simple: dayData.dayTot?.simple || 0,
                        score: dayData.dayScore || 0
                    });
                }
            }

            if (weekDays.length < 3) return null;

            const avgKcal = Math.round(weekDays.reduce((s, d) => s + d.kcal, 0) / weekDays.length);
            const avgProt = Math.round(weekDays.reduce((s, d) => s + d.prot, 0) / weekDays.length);
            const avgSimple = Math.round(weekDays.reduce((s, d) => s + d.simple, 0) / weekDays.length);

            const bestDay = weekDays.reduce((best, d) => d.score > best.score ? d : best, weekDays[0]);
            const worstDay = weekDays.reduce((worst, d) => d.score < worst.score && d.score > 0 ? d : worst, weekDays[0]);

            const message = `Неделя: ${weekDays.length} дней, ~${avgKcal} ккал/день, ~${avgProt}г белка`;

            return { avgKcal, avgProt, avgSimple, bestDay, worstDay, message, daysTracked: weekDays.length };
        } catch (e) {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает тон сообщений в зависимости от времени суток
     * @param {number} hour - Текущий час (0-23)
     * @returns {'gentle'|'active'|'calm'}
     */
    function getToneForHour(hour) {
        // Убран silent режим — советы работают 24/7
        if (hour >= 6 && hour < 10) return 'gentle';   // Утро — мягко
        if (hour >= 10 && hour < 18) return 'active';  // День — активно
        return 'calm'; // Вечер/ночь — спокойно
    }

    /**
     * Определяет эмоциональное состояние пользователя
     * Использует централизованный HEYS.ratioZones для порогов
     * @param {Object} params
     * @returns {'normal'|'stressed'|'crashed'|'success'|'returning'}
     */
    function getEmotionalState(params) {
        const { day, currentStreak, mealCount, kcalPct, totalDaysTracked, goal } = params;
        const hour = new Date().getHours();
        const HEYS = window.HEYS || {};
        const U = HEYS.utils || {};

        // Если есть goal — используем goal-aware логику
        if (goal) {
            // Вернулся после перерыва
            let lastVisitDaysAgo = 0;
            try {
                const lastVisit = HEYS.store?.get
                    ? HEYS.store.get('heys_last_visit', null)
                    : (U.lsGet ? U.lsGet('heys_last_visit', null) : localStorage.getItem('heys_last_visit'));
                if (lastVisit) {
                    const last = new Date(lastVisit);
                    const now = new Date();
                    lastVisitDaysAgo = Math.floor((now - last) / (1000 * 60 * 60 * 24));
                }
            } catch (e) { }
            if (lastVisitDaysAgo > 3) return 'returning';

            // 🔒 Защита от ложного "срыва":
            // - Не судим о недоборе утром (до 12:00) или если мало приёмов
            // - Не судим о срыве если kcalPct близок к целевому диапазону
            const isEarlyForUnder = hour < 12 || mealCount < 2;
            const isEarlyForOver = hour < 10 || mealCount < 1;

            // Срыв — критически выбился из цели (но с защитой от раннего времени)
            const criticallyOver = isCriticallyOver(kcalPct, goal);
            const criticallyUnder = isCriticallyUnder(kcalPct, goal);

            // Перебор — показываем сразу (если съел >115%)
            if (criticallyOver && !isEarlyForOver) return 'crashed';

            // Недобор — показываем только вечером (после 18:00) и если есть приёмы
            if (criticallyUnder && hour >= 18 && mealCount >= 1) return 'crashed';

            // Стресс — низкое настроение
            const avgMood = calculateAverageMood(day);
            if (avgMood > 0 && avgMood < 3) return 'stressed';

            // Успех — в целевом диапазоне или streak
            if (currentStreak >= 3 || isInTargetRange(kcalPct, goal)) return 'success';

            return 'normal';
        }

        // Используем централизованный ratioZones (legacy fallback)
        const rz = HEYS.ratioZones;
        if (rz) {
            return rz.getEmotionalCategory(kcalPct, currentStreak);
        }

        // Fallback если ratioZones не загружен
        // Вычисляем lastVisitDaysAgo из localStorage
        let lastVisitDaysAgo = 0;
        try {
            const lastVisit = HEYS.store?.get
                ? HEYS.store.get('heys_last_visit', null)
                : (U.lsGet ? U.lsGet('heys_last_visit', null) : localStorage.getItem('heys_last_visit'));
            if (lastVisit) {
                const last = new Date(lastVisit);
                const now = new Date();
                lastVisitDaysAgo = Math.floor((now - last) / (1000 * 60 * 60 * 24));
            }
        } catch (e) { }

        // Вернулся после перерыва
        if (lastVisitDaysAgo > 3) return 'returning';

        // Срыв — сильно переел или недоел
        // ⚠️ Защита: не судим о недоборе утром или если мало приёмов
        const isEarlyForUnder = hour < 12 || mealCount < 2;
        if (kcalPct > 1.3) return 'crashed';
        if (kcalPct < 0.5 && hour >= 18 && mealCount >= 1) return 'crashed';

        // Стресс — низкое настроение
        const avgMood = calculateAverageMood(day);
        if (avgMood > 0 && avgMood < 3) return 'stressed';

        // Успех — streak или хороший день (0.75-1.1)
        if (currentStreak >= 3 || (kcalPct >= 0.75 && kcalPct <= 1.1)) return 'success';

        return 'normal';
    }

    /**
     * Вычисляет среднее настроение за день
     * @param {Object} day
     * @returns {number} 0 если нет данных, иначе 1-5
     */
    function calculateAverageMood(day) {
        const meals = day?.meals || [];
        const moods = meals.map(m => m.mood).filter(m => m > 0);
        if (moods.length === 0) return 0;
        return moods.reduce((a, b) => a + b, 0) / moods.length;
    }

    /**
     * Вычисляет среднее стресс за день
     * @param {Object} day
     * @returns {number} 0 если нет данных, иначе 1-5
     */
    function calculateAverageStress(day) {
        const meals = day?.meals || [];
        const stresses = meals.map(m => m.stress).filter(s => s > 0);
        if (stresses.length === 0) return 0;
        return stresses.reduce((a, b) => a + b, 0) / stresses.length;
    }

    /**
     * Вычисляет среднее самочувствие за день
     * @param {Object} day
     * @returns {number} 0 если нет данных, иначе 1-5
     */
    function calculateAverageWellbeing(day) {
        const meals = day?.meals || [];
        const values = meals.map(m => m.wellbeing).filter(w => w > 0);
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Определяет особый день (понедельник, пятница и т.д.)
     * @param {Date} date
     * @returns {string|null}
     */
    function getSpecialDay(date) {
        const day = date.getDay();
        const month = date.getMonth();
        const dateNum = date.getDate();
        const hour = date.getHours();

        // Новый год
        if (month === 0 && dateNum === 1) return 'new_year';

        // Понедельник утро
        if (day === 1 && hour < 12) return 'monday_morning';

        // Пятница вечер
        if (day === 5 && hour >= 17) return 'friday_evening';

        // Воскресенье вечер
        if (day === 0 && hour >= 18) return 'sunday_evening';

        // Конец месяца
        if (dateNum >= 28) return 'month_end';

        return null;
    }

    /**
     * Фильтрует советы по эмоциональному состоянию
     * @param {Array} advices
     * @param {string} emotionalState
     * @returns {Array}
     */
    function filterByEmotionalState(advices, emotionalState) {
        // При стрессе или срыве — убираем warnings
        if (emotionalState === 'stressed' || emotionalState === 'crashed') {
            return advices.filter(a => a.type !== 'warning');
        }
        return advices;
    }

    /**
     * Проверяет, занят ли пользователь (открыта модалка и т.д.)
     * @param {Object} uiState
     * @returns {boolean}
     */
    function isUserBusy(uiState) {
        if (!uiState) return false;
        return !!(
            uiState.modalOpen ||
            uiState.searchOpen ||
            uiState.showTimePicker ||
            uiState.showGramsPicker ||
            uiState.showWeightPicker ||
            uiState.showDeficitPicker ||
            uiState.showZonePicker ||
            uiState.showSleepQualityPicker ||
            uiState.showDayScorePicker ||
            uiState.showHouseholdPicker ||
            uiState.showTrainingPicker
        );
    }

    // ═══════════════════════════════════════════════════════════
    // SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает сессионные данные
     * @returns {Object}
     */
    function getSessionData() {
        try {
            const data = sessionStorage.getItem(SESSION_KEY);
            return data ? JSON.parse(data) : { shown: [], count: 0, lastShown: 0 };
        } catch (e) {
            return { shown: [], count: 0, lastShown: 0 };
        }
    }

    /**
     * Сохраняет сессионные данные
     * @param {Object} data
     */
    function saveSessionData(data) {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
        } catch (e) {
            // Ignore storage errors
        }
    }

    /**
     * Отмечает совет как показанный
     * @param {string} adviceId
     */
    function markAdviceShown(adviceId) {
        const data = getSessionData();
        if (!data.shown.includes(adviceId)) {
            data.shown.push(adviceId);
        }
        data.count++;
        data.lastShown = Date.now();
        saveSessionData(data);
    }

    /**
     * Проверяет, можно ли показать совет
     * @param {string} adviceId
     * @param {Object} options - { canSkipCooldown?: boolean }
     * @returns {boolean}
     */
    function canShowAdvice(adviceId, options = {}) {
        const data = getSessionData();

        // Лимит советов за сессию
        if (data.count >= MAX_ADVICES_PER_SESSION) return false;

        // Cooldown между советами (если не canSkipCooldown)
        if (!options.canSkipCooldown && Date.now() - data.lastShown < ADVICE_COOLDOWN_MS) return false;

        // Уже показывали этот совет
        if (data.shown.includes(adviceId)) return false;

        return true;
    }

    /**
     * Фильтрует советы по системе excludes
     * Если совет A.excludes содержит B.id, и оба активны — показываем только A (по приоритету)
     * @param {Array} advices - Отсортированные по приоритету советы
     * @returns {Array}
     */
    function filterByExcludes(advices) {
        const excludedIds = new Set();
        const result = [];

        for (const advice of advices) {
            // Если этот совет уже исключён другим — пропускаем
            if (excludedIds.has(advice.id)) continue;

            result.push(advice);

            // Добавляем его excludes в исключённые
            if (advice.excludes && Array.isArray(advice.excludes)) {
                for (const exId of advice.excludes) {
                    excludedIds.add(exId);
                }
            }
        }

        return result;
    }

    /**
     * Дедупликация — из группы похожих советов показываем только один
     * @param {Array} advices - Советы (уже отсортированы по приоритету)
     * @returns {Array}
     */
    function deduplicateAdvices(advices) {
        const shownGroups = new Set();
        const result = [];

        for (const advice of advices) {
            // Найти группу, к которой относится совет
            let adviceGroup = null;
            for (const [group, ids] of Object.entries(DEDUPLICATION_RULES)) {
                if (ids.includes(advice.id)) {
                    adviceGroup = group;
                    break;
                }
            }

            // Если совет принадлежит группе и группа уже показана — пропускаем
            if (adviceGroup && shownGroups.has(adviceGroup)) {
                continue;
            }

            result.push(advice);
            if (adviceGroup) {
                shownGroups.add(adviceGroup);
            }
        }

        return result;
    }

    /**
     * Фильтрует советы по временным ограничениям
     * @param {Array} advices
     * @returns {Array}
     */
    function filterByTimeRestrictions(advices) {
        const hour = new Date().getHours();

        return advices.filter(advice => {
            const restriction = TIME_RESTRICTIONS[advice.id];
            if (!restriction) return true; // Нет ограничений

            // notAfterHour: не показывать после N часов
            if (restriction.notAfterHour !== undefined && hour >= restriction.notAfterHour) {
                return false;
            }

            // notBeforeHour: не показывать до N часов
            if (restriction.notBeforeHour !== undefined && hour < restriction.notBeforeHour) {
                return false;
            }

            // onlyBetweenHours: показывать только в диапазоне [from, to]
            if (restriction.onlyBetweenHours) {
                const [from, to] = restriction.onlyBetweenHours;
                if (hour < from || hour >= to) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Ограничивает советы по категориям (антиспам)
     * Не более MAX_ADVICES_PER_CATEGORY советов одной категории
     * @param {Array} advices
     * @returns {Array}
     */
    function limitByCategory(advices) {
        const categoryCount = {};
        const result = [];

        for (const advice of advices) {
            const cat = advice.category || 'other';
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;

            if (categoryCount[cat] <= MAX_ADVICES_PER_CATEGORY) {
                result.push(advice);
            }
        }

        return result;
    }

    /**
     * Применяет boost приоритета для goal-specific советов
     * @param {Array} advices
     * @param {Object} goal - текущий goal режим
     * @returns {Array}
     */
    function applyGoalBoost(advices, goal) {
        if (!goal) return advices;

        const goalPrefix = goal.mode + '_'; // 'bulk_', 'deficit_', 'maintenance_'

        return advices.map(advice => {
            // Советы начинающиеся с текущего goal режима получают boost
            if (advice.id.startsWith(goalPrefix)) {
                return { ...advice, priority: advice.priority - 10 }; // Меньше = выше приоритет
            }
            return advice;
        });
    }

    /**
     * Сбрасывает счётчик сессии (при смене дня)
     */
    function resetSessionAdvices() {
        saveSessionData({ shown: [], count: 0, lastShown: 0 });
    }

    // ═══════════════════════════════════════════════════════════
    // TRACKING — Статистика эффективности советов
    // ═══════════════════════════════════════════════════════════

    /**
     * Получает статистику советов
     * @returns {Object} { [adviceId]: { shown: number, clicked: number, lastShown: timestamp } }
     */
    function getTrackingStats() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const parsed = HEYS.store?.get
                ? (HEYS.store.get(TRACKING_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(TRACKING_KEY, null) || {}) : JSON.parse(localStorage.getItem(TRACKING_KEY) || 'null') || {});

            let stats = parsed;
            if (typeof stats === 'string') {
                try {
                    stats = JSON.parse(stats);
                } catch (e) {
                    stats = {};
                }
            }
            if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
                stats = {};
            }

            // Автоочистка: удаляем записи старше 30 дней
            const now = Date.now();
            const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
            let needsSave = false;
            Object.keys(stats).forEach(key => {
                if (stats[key].lastShown && (now - stats[key].lastShown) > THIRTY_DAYS) {
                    delete stats[key];
                    needsSave = true;
                }
            });
            if (needsSave) {
                if (HEYS.store?.set) {
                    HEYS.store.set(TRACKING_KEY, stats);
                } else if (U.lsSet) {
                    U.lsSet(TRACKING_KEY, stats);
                } else {
                    localStorage.setItem(TRACKING_KEY, JSON.stringify(stats));
                }
            }
            return stats;
        } catch (e) {
            return {};
        }
    }

    /**
     * Сохраняет статистику
     * @param {Object} stats
     */
    function saveTrackingStats(stats) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            if (HEYS.store?.set) {
                HEYS.store.set(TRACKING_KEY, stats);
            } else if (U.lsSet) {
                U.lsSet(TRACKING_KEY, stats);
            } else {
                localStorage.setItem(TRACKING_KEY, JSON.stringify(stats));
            }
        } catch (e) {
            // Ignore storage errors
        }
    }

    function getAdviceOutcomeProfiles() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const parsed = HEYS.store?.get
                ? (HEYS.store.get(OUTCOME_PROFILE_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(OUTCOME_PROFILE_KEY, null) || {}) : JSON.parse(localStorage.getItem(OUTCOME_PROFILE_KEY) || 'null') || {});

            return {
                advice: parsed?.advice && typeof parsed.advice === 'object' ? parsed.advice : {},
                theme: parsed?.theme && typeof parsed.theme === 'object' ? parsed.theme : {},
                context: parsed?.context && typeof parsed.context === 'object' ? parsed.context : {},
                lastUpdated: parsed?.lastUpdated || 0
            };
        } catch (e) {
            return { advice: {}, theme: {}, context: {}, lastUpdated: 0 };
        }
    }

    function saveAdviceOutcomeProfiles(profiles) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const payload = {
                advice: profiles?.advice || {},
                theme: profiles?.theme || {},
                context: profiles?.context || {},
                lastUpdated: Date.now()
            };

            if (HEYS.store?.set) {
                HEYS.store.set(OUTCOME_PROFILE_KEY, payload);
            } else if (U.lsSet) {
                U.lsSet(OUTCOME_PROFILE_KEY, payload);
            } else {
                localStorage.setItem(OUTCOME_PROFILE_KEY, JSON.stringify(payload));
            }
        } catch (e) {
            // Ignore storage errors
        }
    }

    function getPendingAdviceOutcomes() {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const parsed = HEYS.store?.get
                ? (HEYS.store.get(OUTCOME_PENDING_KEY, null) || {})
                : (U.lsGet ? (U.lsGet(OUTCOME_PENDING_KEY, null) || {}) : JSON.parse(localStorage.getItem(OUTCOME_PENDING_KEY) || 'null') || {});

            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed
                : {};
        } catch (e) {
            return {};
        }
    }

    function savePendingAdviceOutcomes(pending) {
        try {
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            if (HEYS.store?.set) {
                HEYS.store.set(OUTCOME_PENDING_KEY, pending || {});
            } else if (U.lsSet) {
                U.lsSet(OUTCOME_PENDING_KEY, pending || {});
            } else {
                localStorage.setItem(OUTCOME_PENDING_KEY, JSON.stringify(pending || {}));
            }
        } catch (e) {
            // Ignore storage errors
        }
    }

    function ensureOutcomeBucket(root, key) {
        if (!root[key]) {
            root[key] = {
                shown: 0,
                click: 0,
                read: 0,
                hidden: 0,
                positive: 0,
                negative: 0,
                autoSuccess: 0,
                autoFailure: 0,
                autoNeutral: 0,
                lastUpdated: 0
            };
        }

        return root[key];
    }

    function applyOutcomeEvent(stats, eventType) {
        if (!stats || !eventType) return;
        if (typeof stats[eventType] !== 'number') stats[eventType] = 0;
        stats[eventType] += 1;
        stats.lastUpdated = Date.now();
    }

    function getOutcomeContextKey(advice, ctx) {
        const theme = advice?.expertMeta?.theme || advice?.category || 'general';
        const goalMode = ctx?.goal?.mode || 'maintenance';
        const crashLevel = ctx?.crashRisk?.level || 'low';
        const hour = ctx?.hour || 0;
        const timeBucket = hour < 11 ? 'morning' : hour < 17 ? 'midday' : hour < 22 ? 'evening' : 'late';
        const stressValue = ctx?.day?.stressAvg || 0;
        const stressBucket = stressValue >= 6 ? 'high' : stressValue >= 4 ? 'medium' : 'low';
        return [theme, goalMode, crashLevel, timeBucket, stressBucket].join('|');
    }

    function buildAdviceOutcomeSnapshot(advice, ctx) {
        return {
            theme: advice?.expertMeta?.theme || advice?.category || 'general',
            contextKey: getOutcomeContextKey(advice, ctx),
            date: ctx?.day?.date || new Date().toISOString().slice(0, 10),
            shownAt: Date.now(),
            hour: ctx?.hour || 0,
            mealCount: ctx?.mealCount || 0,
            lastMealHour: getLastMealHour(ctx?.day || {}),
            proteinPct: ctx?.proteinPct || 0,
            fiberPct: ctx?.fiberPct || 0,
            waterPct: ctx?.waterPct || 0,
            simplePct: ctx?.simplePct || 0,
            kcalPct: ctx?.kcalPct || 0,
            stressAvg: ctx?.day?.stressAvg || 0,
            crashRiskLevel: ctx?.crashRisk?.level || 'low'
        };
    }

    function resolveAdviceResponseMemory(advice, ctx, profiles) {
        const safeProfiles = profiles || getAdviceOutcomeProfiles();
        const adviceStats = safeProfiles.advice?.[advice?.id] || null;
        const themeKey = advice?.expertMeta?.theme || advice?.category || 'general';
        const themeStats = safeProfiles.theme?.[themeKey] || null;
        const contextKey = getOutcomeContextKey(advice, ctx);
        const contextStats = safeProfiles.context?.[contextKey] || null;

        const weighted = [
            { stats: adviceStats, weight: 1.15 },
            { stats: themeStats, weight: 0.85 },
            { stats: contextStats, weight: 1.0 }
        ].filter(item => item.stats);

        if (weighted.length === 0) return null;

        let positiveScore = 0;
        let negativeScore = 0;
        let sampleCount = 0;
        let autoSignals = 0;

        weighted.forEach(({ stats, weight }) => {
            positiveScore += ((stats.click || 0) * 1.1 + (stats.read || 0) * 0.45 + (stats.positive || 0) * 1.8 + (stats.autoSuccess || 0) * 1.5) * weight;
            negativeScore += ((stats.hidden || 0) * 1.0 + (stats.negative || 0) * 1.8 + (stats.autoFailure || 0) * 1.45) * weight;
            sampleCount += (stats.click || 0) + (stats.read || 0) + (stats.hidden || 0) + (stats.positive || 0) + (stats.negative || 0) + (stats.autoSuccess || 0) + (stats.autoFailure || 0);
            autoSignals += (stats.autoSuccess || 0) + (stats.autoFailure || 0);
        });

        if (sampleCount < 2 && autoSignals === 0) return null;

        const balance = positiveScore - negativeScore;
        const score = Math.max(-18, Math.min(18, balance * 3.2));
        let label = 'нейтральный отклик';
        let message = 'Пока мало признаков, что этот тип совета заметно лучше или хуже обычного.';

        if (score >= 9) {
            label = 'обычно помогает';
            message = 'Похожие советы в таком контексте чаще приводят к хорошей реакции пользователя.';
        } else if (score <= -9) {
            label = 'часто не заходит';
            message = 'Похожие советы в таком контексте чаще игнорируются или не дают хорошего отклика.';
        } else if (score >= 4) {
            label = 'скорее полезен';
            message = 'Есть умеренные признаки, что такой совет чаще оказывается уместным.';
        } else if (score <= -4) {
            label = 'скорее слабый';
            message = 'Есть признаки, что в таком контексте совет стоит подавать осторожнее.';
        }

        return {
            score,
            label,
            message,
            sampleCount,
            autoSignals,
            contextKey
        };
    }

    function evaluatePendingAdviceOutcome(pending, ctx) {
        const ageHours = (Date.now() - (pending?.shownAt || Date.now())) / (1000 * 60 * 60);
        const theme = pending?.theme || 'general';
        const currentLastMealHour = getLastMealHour(ctx?.day || {});

        const current = {
            proteinPct: ctx?.proteinPct || 0,
            fiberPct: ctx?.fiberPct || 0,
            waterPct: ctx?.waterPct || 0,
            simplePct: ctx?.simplePct || 0,
            crashRiskLevel: ctx?.crashRisk?.level || 'low',
            stressAvg: ctx?.day?.stressAvg || 0,
            lastMealHour: currentLastMealHour
        };

        if (theme === 'protein') {
            if (current.proteinPct >= Math.max(0.92, (pending?.proteinPct || 0) + 0.15)) return 'autoSuccess';
            if (ageHours >= 6 && current.proteinPct < Math.max(0.85, (pending?.proteinPct || 0) + 0.05)) return 'autoFailure';
            return null;
        }

        if (theme === 'fiber') {
            if (current.fiberPct >= Math.max(0.85, (pending?.fiberPct || 0) + 0.12)) return 'autoSuccess';
            if (ageHours >= 6 && current.fiberPct < Math.max(0.75, (pending?.fiberPct || 0) + 0.04)) return 'autoFailure';
            return null;
        }

        if (theme === 'hydration') {
            if (current.waterPct >= Math.max(0.85, (pending?.waterPct || 0) + 0.2)) return 'autoSuccess';
            if (ageHours >= 4 && current.waterPct < Math.max(0.72, (pending?.waterPct || 0) + 0.08)) return 'autoFailure';
            return null;
        }

        if (theme === 'timing') {
            if (ageHours >= 3 && ctx?.hour >= 21 && current.lastMealHour !== null && current.lastMealHour <= 20) return 'autoSuccess';
            if (ageHours >= 3 && ctx?.hour >= 21 && current.lastMealHour !== null && current.lastMealHour >= 21) return 'autoFailure';
            return null;
        }

        if (theme === 'stress') {
            const riskImproved = pending?.crashRiskLevel === 'high' && current.crashRiskLevel !== 'high';
            const stressImproved = current.stressAvg > 0 && pending?.stressAvg > 0 && current.stressAvg <= (pending.stressAvg - 1);
            const worsened = current.simplePct >= (pending?.simplePct || 0) + 0.2 || (pending?.crashRiskLevel === 'medium' && current.crashRiskLevel === 'high');
            if (riskImproved || stressImproved) return 'autoSuccess';
            if (ageHours >= 4 && worsened) return 'autoFailure';
            return null;
        }

        if (theme === 'carbs') {
            const stabilized = current.simplePct <= Math.max(0.95, (pending?.simplePct || 0) + 0.05)
                && (current.proteinPct >= (pending?.proteinPct || 0) + 0.08 || current.fiberPct >= (pending?.fiberPct || 0) + 0.08);
            if (stabilized) return 'autoSuccess';
            if (ageHours >= 4 && current.simplePct >= (pending?.simplePct || 0) + 0.2) return 'autoFailure';
            return null;
        }

        if (theme === 'training') {
            const recovered = current.proteinPct >= Math.max(0.85, (pending?.proteinPct || 0) + 0.1)
                || current.waterPct >= Math.max(0.8, (pending?.waterPct || 0) + 0.15);
            if (recovered) return 'autoSuccess';
            if (ageHours >= 6 && !recovered && current.crashRiskLevel === 'high') return 'autoFailure';
            return null;
        }

        if (ageHours >= 20) return 'autoNeutral';
        return null;
    }

    function resolvePendingAdviceOutcomes(ctx) {
        const pending = getPendingAdviceOutcomes();
        const keys = Object.keys(pending);
        if (keys.length === 0) return getAdviceOutcomeProfiles();

        const profiles = getAdviceOutcomeProfiles();
        let changed = false;

        keys.forEach(key => {
            const snapshot = pending[key];
            const ageHours = (Date.now() - (snapshot?.shownAt || Date.now())) / (1000 * 60 * 60);
            const sameDay = snapshot?.date === (ctx?.day?.date || new Date().toISOString().slice(0, 10));
            const canEvaluate = !sameDay || ageHours >= 1.5 || (ctx?.mealCount || 0) > (snapshot?.mealCount || 0);
            if (!canEvaluate) return;

            const eventType = evaluatePendingAdviceOutcome(snapshot, ctx);
            if (!eventType && ageHours < 28) return;

            const resolvedEvent = eventType || 'autoNeutral';
            applyOutcomeEvent(ensureOutcomeBucket(profiles.advice, snapshot?.adviceId || 'unknown'), resolvedEvent);
            applyOutcomeEvent(ensureOutcomeBucket(profiles.theme, snapshot?.theme || 'general'), resolvedEvent);
            applyOutcomeEvent(ensureOutcomeBucket(profiles.context, snapshot?.contextKey || 'general|maintenance|low|midday|low'), resolvedEvent);
            delete pending[key];
            changed = true;
        });

        if (changed) {
            saveAdviceOutcomeProfiles(profiles);
            savePendingAdviceOutcomes(pending);
        }

        return profiles;
    }

    function recordPendingAdviceOutcome(advice, ctx) {
        if (!advice || !ctx) return;

        const pending = getPendingAdviceOutcomes();
        const snapshot = buildAdviceOutcomeSnapshot(advice, ctx);
        const key = `${advice.id}|${snapshot.shownAt}`;

        pending[key] = {
            adviceId: advice.id,
            ...snapshot
        };

        savePendingAdviceOutcomes(pending);
    }

    function recordAdviceOutcomeEvent(advice, ctx, eventType) {
        if (!advice || !eventType) return;

        const profiles = getAdviceOutcomeProfiles();
        const theme = advice?.expertMeta?.theme || advice?.category || 'general';
        const contextKey = getOutcomeContextKey(advice, ctx || {});

        applyOutcomeEvent(ensureOutcomeBucket(profiles.advice, advice.id), eventType);
        applyOutcomeEvent(ensureOutcomeBucket(profiles.theme, theme), eventType);
        applyOutcomeEvent(ensureOutcomeBucket(profiles.context, contextKey), eventType);
        saveAdviceOutcomeProfiles(profiles);
    }

    /**
     * Трекает показ совета
     * @param {string} adviceId
     */
    function trackAdviceShown(adviceId) {
        const stats = getTrackingStats();
        if (!stats[adviceId]) {
            stats[adviceId] = { shown: 0, clicked: 0, lastShown: 0 };
        }
        stats[adviceId].shown++;
        stats[adviceId].lastShown = Date.now();
        saveTrackingStats(stats);
    }

    /**
     * Трекает клик/действие по совету
     * @param {string} adviceId
     */
    function trackAdviceClicked(adviceId) {
        const stats = getTrackingStats();
        if (!stats[adviceId]) {
            stats[adviceId] = { shown: 0, clicked: 0, lastShown: 0 };
        }
        stats[adviceId].clicked++;
        saveTrackingStats(stats);
    }

    /**
     * Получает CTR (click-through rate) совета
     * @param {string} adviceId
     * @returns {number} 0-1
     */
    function getAdviceCTR(adviceId) {
        const stats = getTrackingStats();
        const s = stats[adviceId];
        if (!s || s.shown === 0) return 0;
        return s.clicked / s.shown;
    }

    /**
     * Получает топ советов по показам
     * @param {number} n - количество
     * @returns {Array<{id: string, shown: number, clicked: number, ctr: number}>}
     */
    function getTopAdvices(n = 10) {
        const stats = getTrackingStats();
        return Object.entries(stats)
            .map(([id, s]) => ({ id, ...s, ctr: s.shown > 0 ? s.clicked / s.shown : 0 }))
            .sort((a, b) => b.shown - a.shown)
            .slice(0, n);
    }

    // ═══════════════════════════════════════════════════════════
    // GOAL-AWARE HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Определяет режим питания пользователя
     * @param {number} deficitPct - Процент дефицита/профицита (отрицательное = дефицит, положительное = набор)
     * @returns {{mode: 'deficit'|'maintenance'|'bulk', label: string, emoji: string, targetRange: {min: number, max: number}}}
     */
    function getGoalMode(deficitPct) {
        const pct = deficitPct || 0;

        if (pct <= -10) {
            // Активный дефицит (-10% и ниже)
            return {
                mode: 'deficit',
                label: 'Похудение',
                emoji: '🔥',
                // Успех: 90-105% от optimum (небольшой запас на погрешность)
                targetRange: { min: 0.90, max: 1.05 },
                // Критический перебор: >115% (уже сильно выбился из плана)
                criticalOver: 1.15,
                // Критический недобор: <80%
                criticalUnder: 0.80
            };
        } else if (pct <= -5) {
            // Лёгкий дефицит (-5% до -9%)
            return {
                mode: 'deficit',
                label: 'Лёгкое похудение',
                emoji: '🎯',
                targetRange: { min: 0.92, max: 1.08 },
                criticalOver: 1.20,
                criticalUnder: 0.75
            };
        } else if (pct >= 10) {
            // Активный набор (+10% и выше)
            return {
                mode: 'bulk',
                label: 'Набор массы',
                emoji: '💪',
                // Успех: 95-110% от optimum
                targetRange: { min: 0.95, max: 1.10 },
                // Критический перебор: >125% (слишком быстро)
                criticalOver: 1.25,
                // Критический недобор: <85% (не добираешь для роста)
                criticalUnder: 0.85
            };
        } else if (pct >= 5) {
            // Лёгкий набор (+5% до +9%)
            return {
                mode: 'bulk',
                label: 'Лёгкий набор',
                emoji: '💪',
                targetRange: { min: 0.93, max: 1.12 },
                criticalOver: 1.20,
                criticalUnder: 0.80
            };
        } else {
            // Поддержание (-4% до +4%)
            return {
                mode: 'maintenance',
                label: 'Поддержание',
                emoji: '⚖️',
                targetRange: { min: 0.90, max: 1.10 },
                criticalOver: 1.25,
                criticalUnder: 0.70
            };
        }
    }

    /**
     * Проверяет, в целевом ли диапазоне калории
     * @param {number} kcalPct - Процент от optimum
     * @param {Object} goal - Объект от getGoalMode()
     * @returns {boolean}
     */
    function isInTargetRange(kcalPct, goal) {
        return kcalPct >= goal.targetRange.min && kcalPct <= goal.targetRange.max;
    }

    /**
     * Проверяет критический перебор (с учётом цели)
     * @param {number} kcalPct
     * @param {Object} goal
     * @returns {boolean}
     */
    function isCriticallyOver(kcalPct, goal) {
        return kcalPct > goal.criticalOver;
    }

    /**
     * Проверяет критический недобор (с учётом цели)
     * @param {number} kcalPct
     * @param {Object} goal
     * @returns {boolean}
     */
    function isCriticallyUnder(kcalPct, goal) {
        return kcalPct < goal.criticalUnder;
    }

    // ═══════════════════════════════════════════════════════════
    // ADVICE GENERATION (Core)
    // ═══════════════════════════════════════════════════════════

    function buildDerivedContext(ctx) {
        const dayTot = ctx?.dayTot || {};
        const normAbs = ctx?.normAbs || {};
        const day = ctx?.day || {};

        const proteinPct = (dayTot?.prot || 0) / (normAbs?.prot || 1);
        const fatPct = (dayTot?.fat || 0) / (normAbs?.fat || 1);
        const carbsPct = (dayTot?.carbs || 0) / (normAbs?.carbs || 1);
        const fiberPct = (dayTot?.fiber || 0) / (normAbs?.fiber || 1);
        const simplePct = (dayTot?.simple || 0) / (normAbs?.simple || 1);
        const transPct = (dayTot?.trans || 0) / (normAbs?.trans || 1);
        const harmPct = (dayTot?.harm || 0) / (normAbs?.harm || 1);
        const goodFatPct = (dayTot?.good || 0) / (normAbs?.good || 1);

        const isRefeedDay = day?.isRefeedDay || false;
        const kcalPct = ctx?.kcalPct || (dayTot?.kcal || 0) / (ctx?.optimum || 2000);
        const isRefeedExcessOk = isRefeedDay && kcalPct > 1.0 && kcalPct <= 1.35;
        const isDayEmpty = (dayTot?.kcal || 0) < 10 && (ctx?.mealCount || 0) === 0;
        const waterPct = (day?.waterMl || 0) / (ctx?.waterGoal || 2000);

        return {
            proteinPct,
            fatPct,
            carbsPct,
            fiberPct,
            simplePct,
            transPct,
            harmPct,
            goodFatPct,
            isRefeedDay,
            kcalPct,
            isRefeedExcessOk,
            isDayEmpty,
            waterPct
        };
    }

    function evaluateRules(rules, ctx, helpers) {
        const advices = [];
        for (const rule of rules) {
            if (typeof rule.condition === 'function' && !rule.condition(ctx, helpers)) continue;
            const advice = typeof rule.build === 'function' ? rule.build(ctx, helpers) : { ...rule };
            if (!advice) continue;
            advices.push(advice);
        }
        return advices;
    }

    function collectModuleAdvices(ctx) {
        const advices = [];
        const modules = window.HEYS?.adviceModules || {};
        const helpers = window.HEYS?.adviceCoreHelpers || {};
        const order = ['nutrition', 'timing', 'training', 'emotional', 'hydration', 'other'];

        for (const key of order) {
            const mod = modules[key];
            if (!mod) continue;
            try {
                if (typeof mod === 'function') {
                    const list = mod(ctx, helpers) || [];
                    if (Array.isArray(list)) advices.push(...list);
                    continue;
                }
                if (Array.isArray(mod)) {
                    advices.push(...evaluateRules(mod, ctx, helpers));
                }
            } catch (e) {
                console.error('[HEYS.advice] ❌ Module "' + key + '" error:', e?.message, e?.stack?.split('\n')[1]);
            }
        }

        return advices;
    }

    /**
     * Создаёт совет со стабильным текстом (детерминированный выбор из вариантов)
     * @param {Object} advice - Объект совета с id, text (string|array), и др.
     * @param {Object} ctx - Контекст для personalizeText
     * @returns {Object} Совет со стабильным текстом
     */
    function createAdvice(advice, ctx) {
        // Если text — массив, выбираем стабильно по id
        const rawText = Array.isArray(advice.text)
            ? pickRandomText(advice.text, advice.id)
            : advice.text;

        // Персонализируем текст
        const text = ctx ? personalizeText(rawText, ctx) : rawText;

        return { ...advice, text };
    }

    /**
     * Генерирует все возможные советы на основе контекста
     * @param {Object} ctx - Контекст дня
     * @returns {Array} Массив советов
     */
    function generateAdvices(ctx) {
        // 🚀 Early exit: если контекст неполный — возвращаем пустой массив
        if (!ctx || !ctx.normAbs) {
            return [];
        }

        // 🚀 CACHE CHECK: Если кэш валиден — возвращаем из кэша
        if (isCacheValid(ctx)) {
            return adviceCache.result;
        }

        const derived = buildDerivedContext(ctx);
        const fullCtx = { ...ctx, ...derived };

        const advices = collectModuleAdvices(fullCtx);

        // ─────────────────────────────────────────────────────────
        // 🎯 APPLY DISMISS PENALTY & DYNAMIC TTL (NEW!)
        // ─────────────────────────────────────────────────────────

        // Применяем penalty к приоритету на основе быстрых закрытий
        for (const advice of advices) {
            const penalty = getDismissPenalty(advice.id);
            if (penalty < 1) {
                advice.priority = Math.round(advice.priority / penalty); // Выше priority = ниже в списке
            }

            // Пересчитываем TTL на основе длины текста
            if (!advice.ttl || advice.ttl === 5000) { // Только для стандартного TTL
                const isCritical = advice.type === 'critical' || advice.canSkipCooldown;
                advice.ttl = calculateDynamicTTL(advice.text, isCritical);
            }
        }

        // 🚀 CACHE RESULT: Сохраняем в кэш перед возвратом
        adviceCache = {
            key: generateCacheKey(fullCtx),
            result: advices,
            timestamp: Date.now()
        };

        return advices;
    }

    /**
     * Вычисляет часы сна
     * @param {Object} day
     * @returns {number}
     */
    function calculateSleepHours(day) {
        if (window.HEYS?.dayUtils?.getTotalSleepHours) {
            return window.HEYS.dayUtils.getTotalSleepHours(day);
        }

        if (!day?.sleepStart || !day?.sleepEnd) {
            const napHours = Math.max(0, Math.round(+day?.daySleepMinutes || 0)) / 60;
            return (day?.sleepHours || 0) || napHours;
        }

        const [startH, startM] = day.sleepStart.split(':').map(Number);
        const [endH, endM] = day.sleepEnd.split(':').map(Number);

        let hours = endH - startH;
        let mins = endM - startM;

        if (hours < 0) hours += 24;

        const napHours = Math.max(0, Math.round(+day?.daySleepMinutes || 0)) / 60;
        return hours + mins / 60 + napHours;
    }

    /**
     * Возвращает часы с последнего приёма воды
     * @param {Object} day
     * @returns {number}
     */
    function getHoursSinceWater(day) {
        const lastWater = day?.lastWaterTime ? new Date(day.lastWaterTime) : null;
        if (!lastWater || Number.isNaN(lastWater.getTime())) return 99;
        return (Date.now() - lastWater.getTime()) / (1000 * 60 * 60);
    }

    /**
     * Загружает N дней истории из localStorage
     * @param {number} n - Количество дней назад
     * @returns {Array<{date: string, [key: string]: any}>} Массив дней с данными
     */
    function getRecentDays(n) {
        // Приоритет: HEYS.utils (с namespace) → HEYS.dayUtils → fallback
        const lsGet = (window.HEYS?.utils?.lsGet) || (window.HEYS?.dayUtils?.lsGet) || ((k, d) => {
            try {
                const v = localStorage.getItem(k);
                return v ? JSON.parse(v) : d;
            } catch { return d; }
        });

        const days = [];
        const today = new Date();

        for (let i = 1; i <= n; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const iso = d.toISOString().slice(0, 10);
            const dayData = lsGet('heys_dayv2_' + iso, null);

            if (dayData && dayData.date) {
                days.push({ date: iso, ...dayData });
            }
        }

        return days;
    }

    function generateExpertSignalsKey(ctx) {
        return [
            ctx?.day?.date || '',
            ctx?.dayTot?.kcal || 0,
            ctx?.dayTot?.prot || 0,
            ctx?.dayTot?.fiber || 0,
            ctx?.day?.waterMl || 0,
            ctx?.day?.stressAvg || 0,
            ctx?.day?.steps || 0,
            ctx?.hour || 0,
            ctx?.mealCount || 0,
            ctx?.currentStreak || 0,
            ctx?.prof?.weight || 0,
            ctx?.prof?.deficitPctTarget || 0,
            ctx?.goal?.mode || ''
        ].join('|');
    }

    function isExpertSignalsCacheValid(ctx) {
        if (!expertSignalsCache.result) return false;
        if (Date.now() - expertSignalsCache.timestamp > ADVICE_CACHE_TTL) return false;
        return expertSignalsCache.key === generateExpertSignalsKey(ctx);
    }

    function buildHistoryWithToday(ctx, daysBack = 14) {
        const previousDays = getRecentDays(Math.max(daysBack - 1, 0)) || [];
        const todayDate = ctx?.day?.date || new Date().toISOString().slice(0, 10);
        const todaySnapshot = {
            ...(ctx?.day || {}),
            date: todayDate,
            dayTot: ctx?.dayTot || {},
            meals: Array.isArray(ctx?.day?.meals) ? ctx.day.meals : [],
            waterMl: ctx?.day?.waterMl || 0,
            stressAvg: ctx?.day?.stressAvg || 0,
            steps: ctx?.day?.steps || 0,
            trainings: Array.isArray(ctx?.day?.trainings) ? ctx.day.trainings : [],
            weightMorning: ctx?.day?.weightMorning || 0
        };

        const byDate = new Map();
        [...previousDays, todaySnapshot].forEach(day => {
            if (!day?.date) return;
            byDate.set(day.date, day);
        });

        return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }

    function getLastMealHour(day) {
        const lastMeal = getLastMealWithItems(day);
        if (!lastMeal?.time) return null;
        const [h] = lastMeal.time.split(':').map(Number);
        return Number.isFinite(h) ? h : null;
    }

    function matchesAdvice(advice, patterns) {
        const haystack = ((advice?.id || '') + '|' + (advice?.category || '') + '|' + (advice?.type || '')).toLowerCase();
        return patterns.some(pattern => pattern.test(haystack));
    }

    function collectPatternBridgeSignals(history14, history30, ctx) {
        const patternsApi = window.HEYS?.InsightsPI?.patterns;
        if (!patternsApi) return {};

        const result = {};
        const safeAnalyze = (key, analyzer) => {
            try {
                const data = analyzer();
                if (!data || data.available === false) return;
                const score = typeof data.score === 'number'
                    ? data.score
                    : (typeof data.currentScore === 'number' ? data.currentScore : null);
                const correlation = typeof data.correlation === 'number'
                    ? Math.abs(data.correlation)
                    : null;

                result[key] = {
                    score,
                    correlation,
                    available: true,
                    pattern: data.pattern || key
                };
            } catch (e) {
                // Soft bridge only — ignore unavailable analytics
            }
        };

        safeAnalyze('mealTiming', () => patternsApi.analyzeMealTiming(history14, ctx?.prof || {}, ctx?.pIndex || {}));
        safeAnalyze('sleepHunger', () => patternsApi.analyzeSleepHunger(history14, ctx?.prof || {}, ctx?.pIndex || {}));
        safeAnalyze('hydration', () => patternsApi.analyzeHydration(history14));
        safeAnalyze('stressEating', () => patternsApi.analyzeStressEating(history14, ctx?.pIndex || {}));
        safeAnalyze('insulinSensitivity', () => patternsApi.analyzeInsulinSensitivity(history30, ctx?.pIndex || {}, ctx?.prof || {}));
        safeAnalyze('circadian', () => patternsApi.analyzeCircadianTiming(history14, ctx?.pIndex || {}, ctx?.prof || {}));

        return result;
    }

    function averageBy(days, selector) {
        const values = (Array.isArray(days) ? days : [])
            .map(day => selector(day))
            .filter(value => typeof value === 'number' && Number.isFinite(value));

        if (values.length === 0) return null;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function countBy(days, predicate) {
        return (Array.isArray(days) ? days : []).filter(day => {
            try {
                return !!predicate(day);
            } catch (e) {
                return false;
            }
        }).length;
    }

    function buildWeeklyTrendSignals(history14, ctx) {
        if (!Array.isArray(history14) || history14.length < 10) return {};

        const previous7 = history14.slice(-14, -7);
        const recent7 = history14.slice(-7);

        if (previous7.length < 4 || recent7.length < 4) return {};

        const proteinNorm = ctx?.normAbs?.prot || 1;
        const fiberNorm = ctx?.normAbs?.fiber || 1;
        const simpleNorm = ctx?.normAbs?.simple || 1;
        const waterGoal = ctx?.waterGoal || 2000;

        const prevProtein = averageBy(previous7, day => (day?.dayTot?.prot || 0) / proteinNorm);
        const recentProtein = averageBy(recent7, day => (day?.dayTot?.prot || 0) / proteinNorm);
        const prevFiber = averageBy(previous7, day => (day?.dayTot?.fiber || 0) / fiberNorm);
        const recentFiber = averageBy(recent7, day => (day?.dayTot?.fiber || 0) / fiberNorm);
        const prevWater = averageBy(previous7, day => (day?.waterMl || 0) / waterGoal);
        const recentWater = averageBy(recent7, day => (day?.waterMl || 0) / waterGoal);
        const prevSimple = averageBy(previous7, day => (day?.dayTot?.simple || 0) / simpleNorm);
        const recentSimple = averageBy(recent7, day => (day?.dayTot?.simple || 0) / simpleNorm);

        const prevLateMeals = countBy(previous7, day => {
            const lastHour = getLastMealHour(day);
            return lastHour !== null && lastHour >= 21;
        });
        const recentLateMeals = countBy(recent7, day => {
            const lastHour = getLastMealHour(day);
            return lastHour !== null && lastHour >= 21;
        });

        const prevStress = averageBy(previous7, day => day?.stressAvg || calculateAverageStress(day) || 0);
        const recentStress = averageBy(recent7, day => day?.stressAvg || calculateAverageStress(day) || 0);

        return {
            proteinDown: prevProtein !== null && recentProtein !== null && (recentProtein - prevProtein) <= -0.12,
            fiberDown: prevFiber !== null && recentFiber !== null && (recentFiber - prevFiber) <= -0.12,
            waterDown: prevWater !== null && recentWater !== null && (recentWater - prevWater) <= -0.12,
            simpleUp: prevSimple !== null && recentSimple !== null && (recentSimple - prevSimple) >= 0.15,
            lateMealsUp: recentLateMeals - prevLateMeals >= 2,
            stressUp: prevStress !== null && recentStress !== null && (recentStress - prevStress) >= 1,
            snapshot: {
                prevProtein,
                recentProtein,
                prevFiber,
                recentFiber,
                prevWater,
                recentWater,
                prevSimple,
                recentSimple,
                prevLateMeals,
                recentLateMeals,
                prevStress,
                recentStress
            }
        };
    }

    function collectEarlyWarningBridgeSignals(history14, history30, ctx) {
        const earlyWarningApi = window.HEYS?.InsightsPI?.earlyWarning;
        if (!earlyWarningApi?.detect) return null;

        const analysisDays = Array.isArray(history14) && history14.length >= 7
            ? history14
            : history30;

        if (!Array.isArray(analysisDays) || analysisDays.length < 7) {
            return null;
        }

        try {
            const result = earlyWarningApi.detect(
                analysisDays,
                ctx?.prof || {},
                ctx?.pIndex || {},
                {
                    mode: 'acute',
                    includeDetails: false
                }
            );

            if (!result?.available) return null;

            const warnings = Array.isArray(result.warnings)
                ? result.warnings.slice(0, 8)
                : [];

            const byType = new Map();
            warnings.forEach(warning => {
                if (warning?.type) byType.set(warning.type, warning);
            });

            return {
                warnings,
                byType,
                globalScore: result?.globalScore || 0,
                highSeverityCount: result?.highSeverityCount || warnings.filter(w => w?.severity === 'high').length,
                mediumSeverityCount: result?.mediumSeverityCount || warnings.filter(w => w?.severity === 'medium').length,
                criticalCount: Array.isArray(result?.criticalPriority) ? result.criticalPriority.length : 0,
                causalChains: Array.isArray(result?.causalChains) ? result.causalChains.slice(0, 3) : []
            };
        } catch (e) {
            return null;
        }
    }

    function collectSoftExpertSignals(ctx) {
        if (!ctx) return null;

        if (isExpertSignalsCacheValid(ctx)) {
            return expertSignalsCache.result;
        }

        const history7 = buildHistoryWithToday(ctx, 7);
        const history14 = buildHistoryWithToday(ctx, 14);
        const history30 = buildHistoryWithToday(ctx, 30);

        const proteinNorm = ctx?.normAbs?.prot || 1;
        const fiberNorm = ctx?.normAbs?.fiber || 1;
        const simpleNorm = ctx?.normAbs?.simple || 1;
        const waterGoal = ctx?.waterGoal || 2000;
        const sleepNorm = ctx?.prof?.sleepHours || 8;

        const signals = {
            history7,
            history14,
            history30,
            outcomeProfiles: resolvePendingAdviceOutcomes(ctx),
            lowProteinDays7: history7.filter(day => ((day?.dayTot?.prot || 0) / proteinNorm) < 0.85).length,
            lowFiberDays7: history7.filter(day => ((day?.dayTot?.fiber || 0) / fiberNorm) < 0.7).length,
            highSimpleDays7: history7.filter(day => ((day?.dayTot?.simple || 0) / simpleNorm) > 1.15).length,
            lowWaterDays7: history7.filter(day => ((day?.waterMl || 0) / waterGoal) < 0.7).length,
            lateMealDays7: history7.filter(day => {
                const lastHour = getLastMealHour(day);
                return lastHour !== null && lastHour >= 21;
            }).length,
            sleepDebtDays7: history7.filter(day => calculateSleepHours(day) > 0 && calculateSleepHours(day) < (sleepNorm - 1)).length,
            highStressDays7: history7.filter(day => {
                const stress = day?.stressAvg || calculateAverageStress(day) || 0;
                return stress >= 6;
            }).length,
            underTargetDays7: history7.filter(day => ((day?.dayTot?.kcal || 0) / (ctx?.optimum || 2000)) < 0.85).length,
            trainingDays7: history7.filter(day => Array.isArray(day?.trainings) && day.trainings.some(t => t?.z && t.z.some(m => m > 0))).length,
            poorRecoveryTrainingDays7: history7.filter(day => {
                const hasTraining = Array.isArray(day?.trainings) && day.trainings.some(t => t?.z && t.z.some(m => m > 0));
                if (!hasTraining) return false;
                const sleepHours = calculateSleepHours(day);
                const stress = day?.stressAvg || calculateAverageStress(day) || 0;
                return (sleepHours > 0 && sleepHours < 6.5) || stress >= 6;
            }).length,
            weeklyTrends: {},
            phenotype: null,
            patternSignals: {},
            earlyWarnings: null
        };

        try {
            const phenotypeApi = window.HEYS?.InsightsPI?.phenotype;
            if (phenotypeApi?.autoDetect && history30.length >= 30) {
                signals.phenotype = phenotypeApi.autoDetect(history30, ctx?.prof || {}, ctx?.pIndex || {});
            }
        } catch (e) {
            signals.phenotype = null;
        }

        signals.weeklyTrends = buildWeeklyTrendSignals(history14, ctx);
        signals.patternSignals = collectPatternBridgeSignals(history14, history30, ctx);
        signals.earlyWarnings = collectEarlyWarningBridgeSignals(history14, history30, ctx);

        expertSignalsCache = {
            key: generateExpertSignalsKey(ctx),
            result: signals,
            timestamp: Date.now()
        };

        return signals;
    }

    function normalizeAdviceConfidence(score) {
        if (score >= 55) return 'high';
        if (score >= 30) return 'medium';
        if (score >= 14) return 'low';
        return null;
    }

    function getConfidenceLabel(confidence) {
        if (confidence === 'high') return 'высокая';
        if (confidence === 'medium') return 'средняя';
        if (confidence === 'low') return 'базовая';
        return '';
    }

    function getEarlyWarningLabel(warning) {
        if (!warning) return '';
        if (warning.patternName) return warning.patternName;
        if (warning.message) {
            return String(warning.message)
                .replace(/^[^\p{L}\p{N}]+/u, '')
                .trim();
        }
        return String(warning.type || '').replace(/_/g, ' ').toLowerCase();
    }

    function getAdviceExpertFlags(advice) {
        return {
            isProteinAdvice: matchesAdvice(advice, [/protein/, /training.*recovery/, /bulk_/, /deficit_/]),
            isFiberAdvice: matchesAdvice(advice, [/fiber/, /vegetable/, /veggies/, /gut/]),
            isHydrationAdvice: matchesAdvice(advice, [/water/, /hydration/]),
            isTimingAdvice: matchesAdvice(advice, [/timing/, /late/, /bedtime/, /sleep/, /circadian/, /breakfast/, /dinner/]),
            isStressAdvice: matchesAdvice(advice, [/stress/, /mood/, /crash/, /emotional/, /binge/]),
            isCarbAdvice: matchesAdvice(advice, [/carb/, /simple/, /sugar/, /gi/, /glycemic/]),
            isTrainingAdvice: matchesAdvice(advice, [/train/, /workout/, /recovery/, /cardio/, /strength/])
        };
    }

    function getAdviceTheme(advice, flags) {
        if (flags.isProteinAdvice) return 'protein';
        if (flags.isFiberAdvice) return 'fiber';
        if (flags.isHydrationAdvice) return 'hydration';
        if (flags.isTimingAdvice) return 'timing';
        if (flags.isStressAdvice) return 'stress';
        if (flags.isCarbAdvice) return 'carbs';
        if (flags.isTrainingAdvice) return 'training';
        return advice?.category || 'general';
    }

    function buildAdviceActionStep(advice, ctx, flags, signals) {
        if (flags.isHydrationAdvice) {
            return {
                label: 'Выпей 300–500 мл воды в ближайшие 10 минут',
                urgency: 'now'
            };
        }
        if (flags.isProteinAdvice) {
            return {
                label: 'Добери 20–30 г белка в следующий приём пищи',
                urgency: ctx?.hour >= 18 ? 'now' : 'today'
            };
        }
        if (flags.isFiberAdvice) {
            return {
                label: 'Добавь овощи, ягоды или бобовые в следующий приём',
                urgency: 'today'
            };
        }
        if (flags.isTimingAdvice) {
            const lateMeals = signals?.lateMealDays7 || 0;
            return {
                label: lateMeals >= 3
                    ? 'Сдвинь последний приём на 30–60 минут раньше сегодня'
                    : 'Сохрани ровный интервал до следующего приёма пищи',
                urgency: 'today'
            };
        }
        if (flags.isStressAdvice) {
            return {
                label: 'Сделай короткую паузу: вода, 5 глубоких вдохов и только потом решай про еду',
                urgency: 'now'
            };
        }
        if (flags.isCarbAdvice) {
            return {
                label: 'Следующий перекус собери вокруг белка и клетчатки, а не сахара',
                urgency: 'today'
            };
        }
        if (flags.isTrainingAdvice) {
            return {
                label: 'Проверь восстановление: белок, вода и сон сегодня важнее добивания нагрузкой',
                urgency: 'today'
            };
        }

        return {
            label: 'Сделай один маленький следующий шаг по этому совету сегодня',
            urgency: 'today'
        };
    }

    function evaluateAdviceContradictions(advice, ctx, flags) {
        const contradictions = [];
        const add = (text) => {
            if (text && !contradictions.includes(text) && contradictions.length < 2) contradictions.push(text);
        };

        if (flags.isProteinAdvice && (ctx?.proteinPct || 0) >= 0.95) {
            add('сегодня белок уже близок к цели');
        }
        if (flags.isFiberAdvice && (ctx?.fiberPct || 0) >= 0.9) {
            add('сегодня клетчатка уже почти в норме');
        }
        if (flags.isHydrationAdvice && (ctx?.waterPct || 0) >= 0.85) {
            add('по воде сегодня уже хороший темп');
        }
        if (flags.isCarbAdvice && (ctx?.simplePct || 0) <= 0.9) {
            add('сегодня простые углеводы пока под контролем');
        }
        if (flags.isStressAdvice && (ctx?.day?.stressAvg || 0) > 0 && (ctx?.day?.stressAvg || 0) <= 4 && ctx?.crashRisk?.level === 'low') {
            add('сегодня острый стресс-сигнал низкий');
        }
        if (flags.isTrainingAdvice && !ctx?.hasTraining && !ctx?.day?.trainings?.length) {
            add('сегодня нет явного тренировочного триггера');
        }
        if (flags.isTimingAdvice) {
            const lastMealHour = getLastMealHour(ctx?.day || {});
            if (lastMealHour !== null && lastMealHour <= 19 && (ctx?.hour || 0) < 21) {
                add('сегодня тайминг еды пока выглядит ровнее');
            }
        }

        return contradictions;
    }

    function getPiScienceRegistry() {
        return window.HEYS?.InsightsPI?.constants?.SCIENCE_INFO
            || window.piConst?.SCIENCE_INFO
            || {};
    }

    function mapAdviceToScienceKeys(flags) {
        if (flags.isProteinAdvice) {
            return ['PROTEIN_DISTRIBUTION', 'NUTRIENT_TIMING', 'TRAINING_TYPE_MATCH'];
        }
        if (flags.isFiberAdvice) {
            return ['NUTRITION_QUALITY', 'GUT_HEALTH', 'NUTRIENT_DENSITY'];
        }
        if (flags.isHydrationAdvice) {
            return ['HYDRATION', 'HYDRATION_TREND', 'ELECTROLYTE_HOMEOSTASIS'];
        }
        if (flags.isTimingAdvice) {
            return ['MEAL_TIMING', 'WAVE_OVERLAP', 'LATE_EATING', 'CIRCADIAN', 'NEXT_MEAL'];
        }
        if (flags.isStressAdvice) {
            return ['HORMONES', 'PREDICTIVE_RISK', 'CRASH_RISK', 'EARLY_WARNING_SIGNALS', 'CATEGORY_RECOVERY'];
        }
        if (flags.isCarbAdvice) {
            return ['GLYCEMIC_LOAD', 'GLYCEMIC_VARIABILITY', 'ADDED_SUGAR_DEPENDENCY', 'INSULIN_SENSITIVITY'];
        }
        if (flags.isTrainingAdvice) {
            return ['TRAINING_TYPE_MATCH', 'TRAINING_RECOVERY', 'EPOC', 'PROTEIN_DISTRIBUTION'];
        }

        return ['HEALTH_SCORE', 'STATUS_SCORE'];
    }

    function normalizeAdviceActionability(actionability) {
        if (actionability === 'IMMEDIATE') return 'now';
        if (actionability === 'DAILY' || actionability === 'TODAY') return 'today';
        if (actionability === 'WEEKLY' || actionability === 'LONG_TERM') return 'watch';
        return 'watch';
    }

    function getAdviceScienceMeta(flags) {
        const registry = getPiScienceRegistry();
        const keys = mapAdviceToScienceKeys(flags).filter(key => registry[key]);

        if (keys.length === 0) {
            return {
                key: null,
                topic: 'behavioral nutrition',
                evidenceLevel: 'C',
                confidenceScore: 0.65,
                impactScore: 0.35,
                actionability: 'INFORMATIONAL',
                actionUrgency: 'watch',
                rationale: 'Совет опирается на общие поведенческие закономерности, но без прямой привязки к научной карточке PI.'
            };
        }

        const metrics = keys.map(key => ({ key, ...registry[key] }));
        metrics.sort((a, b) => {
            const impactDiff = (b.impactScore || 0) - (a.impactScore || 0);
            if (impactDiff !== 0) return impactDiff;
            return (b.confidenceScore || 0) - (a.confidenceScore || 0);
        });

        const primary = metrics[0];
        const avgConfidence = metrics.reduce((sum, metric) => sum + (metric.confidenceScore || 0), 0) / metrics.length;
        const avgImpact = metrics.reduce((sum, metric) => sum + (metric.impactScore || 0), 0) / metrics.length;

        return {
            key: primary.key,
            topic: primary.name || primary.key,
            evidenceLevel: primary.evidenceLevel || 'C',
            confidenceScore: avgConfidence,
            impactScore: avgImpact,
            actionability: primary.actionability || 'INFORMATIONAL',
            actionUrgency: normalizeAdviceActionability(primary.actionability),
            rationale: primary.whyImportant || primary.short || primary.interpretation || ''
        };
    }

    function buildAdviceUncertaintyMeta(science, evidenceScore, contradictions, sourceCount) {
        const contradictionCount = Array.isArray(contradictions) ? contradictions.length : 0;
        const confidenceScore = science?.confidenceScore || 0.65;
        const impactScore = science?.impactScore || 0.35;

        let certainty = 'tentative';
        let label = 'гипотеза';
        let message = 'Сигнал полезный, но скорее как мягкая гипотеза, чем как жёсткий вывод.';

        if (evidenceScore >= 58 && confidenceScore >= 0.84 && contradictionCount === 0 && sourceCount >= 3) {
            certainty = 'robust';
            label = 'сильный вывод';
            message = 'Совет хорошо подтверждён несколькими слоями данных и подходит как приоритетное действие.';
        } else if (evidenceScore >= 34 && confidenceScore >= 0.75 && contradictionCount <= 1 && sourceCount >= 2) {
            certainty = 'supported';
            label = 'подтверждённый сигнал';
            message = 'Есть хорошая опора в данных, но контекст всё ещё важен сильнее любой одной метрики.';
        } else if (evidenceScore >= 18 && impactScore >= 0.5) {
            certainty = 'directional';
            label = 'рабочий сигнал';
            message = 'Направление выглядит разумным, но это скорее подсказка для мягкой коррекции, чем для жёсткого вывода.';
        }

        if (contradictionCount >= 2) {
            certainty = 'tentative';
            label = 'слабый сигнал';
            message = 'Есть противоречащие факторы текущего дня, поэтому совет лучше трактовать аккуратно.';
        }

        return {
            certainty,
            label,
            message
        };
    }

    function getAdviceCausalMeta(advice, flags, signals) {
        const chains = signals?.earlyWarnings?.causalChains || [];
        if (!Array.isArray(chains) || chains.length === 0) return null;

        const theme = getAdviceTheme(advice, flags);
        const relevantNodesByTheme = {
            protein: ['PROTEIN_DEFICIT', 'CALORIC_DEBT'],
            fiber: ['FIBER_DEFICIT'],
            hydration: ['HYDRATION_DEFICIT'],
            timing: ['SLEEP_DEBT', 'CIRCADIAN_DISRUPTION', 'MEAL_TIMING_DRIFT', 'LOGGING_GAP'],
            stress: ['STRESS_ACCUMULATION', 'MOOD_WELLBEING_DECLINE', 'BINGE_RISK', 'STATUS_SCORE_DECLINE'],
            carbs: ['SUGAR_DEPENDENCY', 'EVENING_OVERCONSUMPTION', 'BINGE_RISK'],
            training: ['TRAINING_WITHOUT_RECOVERY', 'WEIGHT_PLATEAU']
        };

        const relevantNodes = relevantNodesByTheme[theme] || [];
        let best = null;

        chains.forEach(chain => {
            const matchedNodes = Array.isArray(chain?.matchedNodes) ? chain.matchedNodes : [];
            const touchesRoot = relevantNodes.includes(chain?.rootCause);
            const touchesOutcome = relevantNodes.includes(chain?.outcome);
            const touchesMechanism = matchedNodes.some(node => relevantNodes.includes(node));
            if (!touchesRoot && !touchesOutcome && !touchesMechanism) return;

            const relevance = touchesRoot ? 'root' : touchesMechanism ? 'mechanism' : 'outcome';
            const weight = relevance === 'root' ? 3 : relevance === 'mechanism' ? 2 : 1;
            const score = ((chain?.adjustedConfidence || 0) * 100) + weight * 15 + (chain?.matchRatio || 0) / 10;

            if (!best || score > best.score) {
                best = {
                    chainId: chain.chainId,
                    name: chain.name,
                    relevance,
                    confidence: chain.adjustedConfidence || 0,
                    coverage: chain.matchRatio || 0,
                    rootCause: chain.rootCause,
                    outcome: chain.outcome,
                    path: matchedNodes.join(' → '),
                    mechanism: chain.mechanism,
                    actionableFix: Array.isArray(chain.actionableFix) ? chain.actionableFix.slice(0, 2) : [],
                    score
                };
            }
        });

        return best;
    }

    function buildAdviceEvidence(advice, ctx, signals) {
        if (!advice || !signals) return null;

        const drivers = [];
        const crossConfirmedBy = [];
        const sourceTags = new Set();
        const contradictions = [];

        const addDriver = (text, source = 'history') => {
            if (text && !drivers.includes(text) && drivers.length < 3) drivers.push(text);
            if (text && source) sourceTags.add(source);
        };
        const addCross = (text, source = 'cross') => {
            if (text && !crossConfirmedBy.includes(text) && crossConfirmedBy.length < 3) crossConfirmedBy.push(text);
            if (text && source) sourceTags.add(source);
        };
        const addContradiction = (text) => {
            if (text && !contradictions.includes(text) && contradictions.length < 2) contradictions.push(text);
        };

        const adviceFlags = getAdviceExpertFlags(advice);
        const responseMemory = resolveAdviceResponseMemory(advice, ctx, signals?.outcomeProfiles);
        const {
            isProteinAdvice,
            isFiberAdvice,
            isHydrationAdvice,
            isTimingAdvice,
            isStressAdvice,
            isCarbAdvice,
            isTrainingAdvice
        } = adviceFlags;

        if (isProteinAdvice && signals.lowProteinDays7 >= 3) {
            addDriver(`белок ниже цели ${signals.lowProteinDays7}/7 дн`, 'history');
        }
        if (isFiberAdvice && signals.lowFiberDays7 >= 3) {
            addDriver(`клетчатка проседает ${signals.lowFiberDays7}/7 дн`, 'history');
        }
        if (isHydrationAdvice && signals.lowWaterDays7 >= 3) {
            addDriver(`вода ниже цели ${signals.lowWaterDays7}/7 дн`, 'history');
        }
        if (isTimingAdvice && signals.lateMealDays7 >= 3) {
            addDriver(`поздние приёмы ${signals.lateMealDays7}/7 дн`, 'history');
        }
        if (isTimingAdvice && signals.sleepDebtDays7 >= 3) {
            addDriver(`недосып ${signals.sleepDebtDays7}/7 дн`, 'history');
        }
        if (isStressAdvice && signals.highStressDays7 >= 3) {
            addDriver(`стресс высокий ${signals.highStressDays7}/7 дн`, 'history');
        }
        if ((isProteinAdvice || isCarbAdvice) && signals.underTargetDays7 >= 3) {
            addDriver(`энергия ниже цели ${signals.underTargetDays7}/7 дн`, 'history');
        }
        if (isTrainingAdvice && signals.poorRecoveryTrainingDays7 >= 2) {
            addDriver(`нагрузка без восстановления ${signals.poorRecoveryTrainingDays7} дн`, 'history');
        }
        if (isCarbAdvice && signals.highSimpleDays7 >= 3) {
            addDriver(`простые углеводы высокие ${signals.highSimpleDays7}/7 дн`, 'history');
        }

        const weeklyTrends = signals.weeklyTrends || {};
        if (isProteinAdvice && weeklyTrends.proteinDown) {
            addCross('за неделю белок стал хуже относительно прошлой', 'weekly');
        }
        if (isFiberAdvice && weeklyTrends.fiberDown) {
            addCross('за неделю клетчатка снизилась', 'weekly');
        }
        if (isHydrationAdvice && weeklyTrends.waterDown) {
            addCross('за неделю вода просела', 'weekly');
        }
        if (isTimingAdvice && weeklyTrends.lateMealsUp) {
            addCross('за неделю поздние приёмы участились', 'weekly');
        }
        if (isStressAdvice && weeklyTrends.stressUp) {
            addCross('за неделю стресс усилился', 'weekly');
        }
        if (isCarbAdvice && weeklyTrends.simpleUp) {
            addCross('за неделю быстрые углеводы выросли', 'weekly');
        }

        const phenotype = signals.phenotype;
        if (phenotype?.metabolic === 'insulin_resistant' && (isCarbAdvice || isTimingAdvice || isFiberAdvice)) {
            addCross('подтверждено фенотипом insulin resistant', 'phenotype');
        }
        if (phenotype?.circadian === 'evening_type' && isTimingAdvice) {
            addCross('учтён вечерний циркадный тип', 'phenotype');
        }
        if (phenotype?.satiety === 'low_satiety' && (isProteinAdvice || isFiberAdvice || isHydrationAdvice)) {
            addCross('учтён низкий satiety-профиль', 'phenotype');
        }
        if (phenotype?.stress === 'stress_eater' && isStressAdvice) {
            addCross('учтён stress-eating паттерн', 'phenotype');
        }

        const patternSignals = signals.patternSignals || {};
        if (isTimingAdvice && patternSignals.mealTiming?.score !== null && patternSignals.mealTiming?.score < 55) {
            addCross(`pattern meal timing: ${Math.round(patternSignals.mealTiming.score)}/100`, 'pattern');
        }
        if (isTimingAdvice && patternSignals.circadian?.score !== null && patternSignals.circadian?.score < 55) {
            addCross(`pattern circadian: ${Math.round(patternSignals.circadian.score)}/100`, 'pattern');
        }
        if ((isStressAdvice || isCarbAdvice) && patternSignals.sleepHunger?.score !== null && patternSignals.sleepHunger?.score < 55) {
            addCross(`pattern sleep→hunger: ${Math.round(patternSignals.sleepHunger.score)}/100`, 'pattern');
        }
        if (isHydrationAdvice && patternSignals.hydration?.score !== null && patternSignals.hydration?.score < 55) {
            addCross(`pattern hydration: ${Math.round(patternSignals.hydration.score)}/100`, 'pattern');
        }
        if (isStressAdvice && (
            (patternSignals.stressEating?.score !== null && patternSignals.stressEating?.score < 55) ||
            (patternSignals.stressEating?.correlation !== null && patternSignals.stressEating?.correlation > 0.3)
        )) {
            addCross('pattern stress-eating подтверждает риск', 'pattern');
        }
        if (isCarbAdvice && patternSignals.insulinSensitivity?.score !== null && patternSignals.insulinSensitivity?.score < 55) {
            addCross(`pattern insulin sensitivity: ${Math.round(patternSignals.insulinSensitivity.score)}/100`, 'pattern');
        }
        if ((advice.category === 'nutrition' || isStressAdvice || isTimingAdvice) && ctx?.crashRisk?.level === 'high') {
            addCross('высокий crash-risk 24ч', 'metabolic');
        } else if (isStressAdvice && ctx?.crashRisk?.level === 'medium') {
            addCross('средний crash-risk 24ч', 'metabolic');
        }

        const earlyWarnings = signals.earlyWarnings;
        if (earlyWarnings?.warnings?.length) {
            const relevantTypes = [];

            if (isProteinAdvice) relevantTypes.push('PROTEIN_DEFICIT', 'CALORIC_DEBT', 'TRAINING_WITHOUT_RECOVERY');
            if (isFiberAdvice) relevantTypes.push('FIBER_DEFICIT');
            if (isHydrationAdvice) relevantTypes.push('HYDRATION_DEFICIT', 'ELECTROLYTE_IMBALANCE');
            if (isTimingAdvice) relevantTypes.push('SLEEP_DEBT', 'CIRCADIAN_DISRUPTION', 'MEAL_TIMING_DRIFT');
            if (isStressAdvice) relevantTypes.push('STRESS_ACCUMULATION', 'SLEEP_DEBT', 'STATUS_SCORE_DECLINE');
            if (isCarbAdvice) relevantTypes.push('SUGAR_DEPENDENCY', 'BINGE_RISK', 'CALORIC_DEBT');
            if (isTrainingAdvice) relevantTypes.push('TRAINING_WITHOUT_RECOVERY', 'PROTEIN_DEFICIT', 'CALORIC_DEBT');

            const matchedWarnings = [...new Set(relevantTypes)]
                .map(type => earlyWarnings.byType?.get(type))
                .filter(Boolean)
                .sort((a, b) => {
                    const severityWeight = { high: 3, medium: 2, low: 1 };
                    const aScore = (severityWeight[a?.severity] || 0) * 100 + (a?.priorityScore || 0);
                    const bScore = (severityWeight[b?.severity] || 0) * 100 + (b?.priorityScore || 0);
                    return bScore - aScore;
                });

            if (matchedWarnings[0]) {
                addCross(`EWS: ${getEarlyWarningLabel(matchedWarnings[0])}`, 'ews');
            }

            if (matchedWarnings.length >= 2) {
                addCross(`EWS подтверждает ещё ${matchedWarnings.length - 1} связ. сигн.`, 'ews');
            }

            if (matchedWarnings.length > 0 && earlyWarnings.globalScore >= 40) {
                addCross(`EWS risk ${earlyWarnings.globalScore}/100`, 'ews');
            }
        }

        const causal = getAdviceCausalMeta(advice, adviceFlags, signals);
        if (causal) {
            if (causal.relevance === 'root') {
                addCross(`causal root: ${causal.name}`, 'causal');
            } else if (causal.relevance === 'mechanism') {
                addCross(`causal path: ${causal.name}`, 'causal');
            } else {
                addCross(`causal outcome: ${causal.name}`, 'causal');
            }
        }

        if (responseMemory?.score >= 4) {
            addCross(`response memory: ${responseMemory.label}`, 'outcome');
        } else if (responseMemory?.score <= -4) {
            addContradiction(`response memory: ${responseMemory.label}`);
        }

        evaluateAdviceContradictions(advice, ctx, adviceFlags).forEach(addContradiction);

        const historyScore = drivers.length * 14;
        const crossScore = crossConfirmedBy.length * 11;
        const sourceDiversityBonus = Math.max(0, sourceTags.size - 1) * 6;
        const causalBonus = causal?.relevance === 'root' ? 14 : causal?.relevance === 'mechanism' ? 8 : causal?.relevance === 'outcome' ? 4 : 0;
        const responseAdjustment = responseMemory ? Math.max(-10, Math.min(10, responseMemory.score / 1.8)) : 0;
        const contradictionPenalty = contradictions.length * 18;
        const evidenceScore = Math.max(0, historyScore + crossScore + sourceDiversityBonus + causalBonus + responseAdjustment - contradictionPenalty);
        const confidence = normalizeAdviceConfidence(evidenceScore);
        if (!confidence) return null;

        const priorityBoost = Math.max(0, Math.min(
            confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1,
            contradictions.length > 0 ? 2 : 3
        ));
        const whyNow = drivers[0] || crossConfirmedBy[0] || '';
        const actionNow = buildAdviceActionStep(advice, ctx, adviceFlags, signals);
        const theme = getAdviceTheme(advice, adviceFlags);
        const science = getAdviceScienceMeta(adviceFlags);
        const uncertainty = buildAdviceUncertaintyMeta(science, evidenceScore, contradictions, sourceTags.size);
        const summaryParts = [];
        if (drivers.length > 0) summaryParts.push(drivers.slice(0, 2).join(' · '));
        if (crossConfirmedBy.length > 0) summaryParts.push(crossConfirmedBy.slice(0, 2).join(' · '));
        if (contradictions.length > 0 && summaryParts.length === 0) {
            summaryParts.push(`soft-signal: ${contradictions[0]}`);
        }

        return {
            confidence,
            confidenceLabel: getConfidenceLabel(confidence),
            priorityBoost,
            evidenceScore,
            sourceCount: sourceTags.size,
            whyNow,
            actionNow,
            theme,
            science,
            uncertainty,
            causal,
            responseMemory,
            drivers,
            crossConfirmedBy,
            contradictions,
            evidenceSummary: summaryParts.join(' • '),
            phenotype: phenotype || null
        };
    }

    function enrichAdvicesWithExpertContext(advices, ctx, signals) {
        if (!Array.isArray(advices) || advices.length === 0) return advices || [];

        return advices.map(advice => {
            const evidence = buildAdviceEvidence(advice, ctx, signals);
            if (!evidence) return advice;

            return {
                ...advice,
                priority: Math.max(0, (advice.priority || 0) - evidence.priorityBoost),
                confidence: evidence.confidence,
                confidenceLabel: evidence.confidenceLabel,
                evidenceSummary: evidence.evidenceSummary,
                expertMeta: {
                    whyNow: evidence.whyNow,
                    evidenceScore: evidence.evidenceScore,
                    sourceCount: evidence.sourceCount,
                    actionNow: evidence.actionNow,
                    theme: evidence.theme,
                    science: evidence.science,
                    uncertainty: evidence.uncertainty,
                    causal: evidence.causal,
                    responseMemory: evidence.responseMemory,
                    drivers: evidence.drivers,
                    crossConfirmedBy: evidence.crossConfirmedBy,
                    contradictions: evidence.contradictions,
                    phenotype: evidence.phenotype
                }
            };
        });
    }

    function getCrossThemeConflicts(theme) {
        const graph = {
            timing: ['stress', 'carbs'],
            stress: ['carbs'],
            hydration: ['stress', 'carbs'],
            protein: ['carbs'],
            training: ['stress']
        };

        return graph[theme] || [];
    }

    function getAdviceExpertPriority(advice) {
        const urgencyWeight = { now: 3, today: 2, watch: 1 };
        const causalBonus = advice?.expertMeta?.causal?.relevance === 'root'
            ? 22
            : advice?.expertMeta?.causal?.relevance === 'mechanism'
                ? 12
                : advice?.expertMeta?.causal?.relevance === 'outcome'
                    ? 4
                    : 0;
        const responseBonus = advice?.expertMeta?.responseMemory?.score || 0;

        return (advice?.smartScore || 0)
            + (advice?.expertMeta?.evidenceScore || 0)
            + ((urgencyWeight[advice?.expertMeta?.actionNow?.urgency] || 0) * 8)
            + causalBonus
            + responseBonus;
    }

    function applyExpertConflictResolution(advices) {
        if (!Array.isArray(advices) || advices.length <= 1) return advices || [];

        const winnersByTheme = new Map();
        const result = [];

        for (const advice of advices) {
            if (!advice || advice.isReminder === true || advice.category === 'health' || advice.type === 'achievement') {
                result.push(advice);
                continue;
            }

            const theme = advice?.expertMeta?.theme || advice?.category || 'general';
            const currentEvidence = advice?.expertMeta?.evidenceScore || 0;
            const currentUrgency = advice?.expertMeta?.actionNow?.urgency === 'now'
                ? 3
                : advice?.expertMeta?.actionNow?.urgency === 'today'
                    ? 2
                    : 1;
            const currentScore = getAdviceExpertPriority(advice);
            const winner = winnersByTheme.get(theme);

            if (!winner) {
                winnersByTheme.set(theme, {
                    advice,
                    score: currentScore,
                    evidence: currentEvidence,
                    urgency: currentUrgency,
                    type: advice?.type
                });
                result.push(advice);
                continue;
            }

            const strongerWarning = advice?.type === 'warning' && winner.type !== 'warning' && currentEvidence >= Math.max(20, winner.evidence - 8);
            const clearlyStronger = currentScore >= winner.score + 16;
            const moreUrgent = currentUrgency > winner.urgency && currentEvidence >= Math.max(14, winner.evidence - 6);

            if (strongerWarning || clearlyStronger || moreUrgent) {
                const previousIndex = result.findIndex(item => item?.id === winner.advice?.id);
                if (previousIndex >= 0) {
                    result.splice(previousIndex, 1);
                }

                winnersByTheme.set(theme, {
                    advice,
                    score: currentScore,
                    evidence: currentEvidence,
                    urgency: currentUrgency,
                    type: advice?.type
                });
                result.push(advice);
                continue;
            }

            const isClearlyRedundant = currentEvidence <= winner.evidence && currentUrgency <= winner.urgency;
            if (isClearlyRedundant) {
                continue;
            }

            result.push(advice);
        }

        const crossResolved = [];

        for (const advice of result) {
            const theme = advice?.expertMeta?.theme || advice?.category || 'general';
            const conflictingThemes = getCrossThemeConflicts(theme);
            const conflictIndex = crossResolved.findIndex(item => conflictingThemes.includes(item?.expertMeta?.theme || item?.category || 'general'));

            if (conflictIndex === -1) {
                crossResolved.push(advice);
                continue;
            }

            const existing = crossResolved[conflictIndex];
            const currentPriority = getAdviceExpertPriority(advice);
            const existingPriority = getAdviceExpertPriority(existing);
            const currentCausal = advice?.expertMeta?.causal?.relevance;
            const existingCausal = existing?.expertMeta?.causal?.relevance;

            const currentRootWins = currentCausal === 'root' && existingCausal !== 'root' && currentPriority >= (existingPriority - 8);
            const existingRootWins = existingCausal === 'root' && currentCausal !== 'root' && existingPriority >= (currentPriority - 8);
            const currentClearlyStronger = currentPriority >= existingPriority + 18;

            if (currentRootWins || currentClearlyStronger) {
                crossResolved.splice(conflictIndex, 1, advice);
                continue;
            }

            if (existingRootWins || currentPriority <= existingPriority) {
                continue;
            }

            crossResolved.push(advice);
        }

        return crossResolved;
    }

    /**
     * Вычисляет среднее время засыпания на основе истории (sleepStart из чек-ина)
     * @param {number} [daysBack=14] - Количество дней для анализа
     * @returns {{hour: number, minute: number, formatted: string, count: number}|null}
     */
    function getAverageBedtime(daysBack = 14) {
        const recentDays = getRecentDays(daysBack);

        // Собираем все sleepStart (время засыпания)
        const bedtimes = recentDays
            .map(d => d.sleepStart)
            .filter(t => t && typeof t === 'string' && t.includes(':'));

        if (bedtimes.length < 3) return null; // Нужно минимум 3 дня данных

        // Конвертируем время в минуты от полуночи (с учётом что 23:00 > 00:30)
        const minutesFromMidnight = bedtimes.map(t => {
            const [h, m] = t.split(':').map(Number);
            // Если время раньше 12:00 — это после полуночи (добавляем 24ч)
            // Например: 01:00 → 25*60=1500 мин, 23:00 → 23*60=1380 мин
            return h < 12 ? (h + 24) * 60 + m : h * 60 + m;
        });

        // Среднее
        const avgMinutes = Math.round(minutesFromMidnight.reduce((a, b) => a + b, 0) / minutesFromMidnight.length);

        // Конвертируем обратно в часы:минуты
        let hour = Math.floor(avgMinutes / 60);
        const minute = avgMinutes % 60;

        // Если больше 24 — вычитаем (00:30 → 0.5)
        if (hour >= 24) hour -= 24;

        const formatted = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

        return { hour, minute, formatted, count: bedtimes.length };
    }

    /**
     * Вычисляет сколько часов осталось до обычного времени сна
     * @param {number} currentHour - Текущий час
     * @param {Object} [prof] - Профиль пользователя (fallback на sleepHours)
     * @returns {{hoursUntilBed: number, bedtimeFormatted: string, source: 'history'|'calculated'}}
     */
    function getHoursUntilBedtime(currentHour, prof) {
        // Пробуем получить из истории
        const avgBedtime = getAverageBedtime(14);

        if (avgBedtime) {
            // Вычисляем разницу
            let bedHour = avgBedtime.hour;
            // Если время сна после полуночи, добавляем 24 для корректного расчёта
            if (bedHour < 12) bedHour += 24;

            let hoursUntilBed = bedHour - currentHour;
            if (hoursUntilBed < 0) hoursUntilBed += 24;
            if (hoursUntilBed > 12) hoursUntilBed = 0; // Уже должен спать

            return {
                hoursUntilBed,
                bedtimeFormatted: avgBedtime.formatted,
                source: 'history'
            };
        }

        // Fallback: вычисляем из профиля (если встаёт в 7)
        const sleepNormHours = prof?.sleepHours || 8;
        const expectedBedtime = 24 - sleepNormHours + 7; // Примерно когда ложится
        const hoursUntilBed = expectedBedtime - currentHour;

        return {
            hoursUntilBed: hoursUntilBed > 0 ? hoursUntilBed : 0,
            bedtimeFormatted: `~${expectedBedtime}:00`,
            source: 'calculated'
        };
    }

    /**
     * Проверяет, есть ли кофе-содержащие продукты после указанного часа
     * @param {Array} meals - Массив приёмов пищи (day.meals)
     * @param {number} afterHour - После какого часа искать (например 16)
     * @param {Object} pIndex - Индекс продуктов { byId: Map, byName: Map }
     * @returns {boolean} true если найден кофе после указанного часа
     */
    function hasCoffeeAfterHour(meals, afterHour, pIndex) {
        if (!meals || !Array.isArray(meals)) return false;

        const coffeeKeywords = ['кофе', 'coffee', 'капучино', 'латте', 'лате', 'раф', 'американо', 'эспрессо', 'флэт', 'мокко', 'макиато'];

        for (const meal of meals) {
            // Парсим время приёма
            if (!meal.time) continue;
            const [h] = meal.time.split(':').map(Number);
            if (h < afterHour) continue;

            // Проверяем продукты в приёме
            for (const item of (meal.items || [])) {
                // Получаем название продукта
                let name = item.name || '';
                if (!name) {
                    const product = getProductForItem(item, pIndex);
                    if (product) name = product.name || '';
                }

                // Ищем кофе-ключевые слова
                const nameLower = name.toLowerCase();
                if (coffeeKeywords.some(kw => nameLower.includes(kw))) {
                    return true;
                }
            }
        }

        return false;
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 0: MEAL & MILESTONE HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Вычисляет суммы нутриентов для одного приёма пищи
     * @param {Object} meal - Приём пищи (meal object)
     * @param {Object} pIndex - Индекс продуктов { byId: Map, byName: Map }
     * @returns {Object|null} { kcal, prot, carbs, simple, complex, fat, good, bad, trans, fiber } или null
     */
    function getMealTotals(meal, pIndex) {
        if (!meal || !meal.items || meal.items.length === 0) return null;

        // Пробуем использовать HEYS.models.mealTotals если доступен
        if (window.HEYS?.models?.mealTotals) {
            return window.HEYS.models.mealTotals(meal, pIndex);
        }

        // Fallback: вычисляем сами
        const tot = { kcal: 0, prot: 0, carbs: 0, simple: 0, complex: 0, fat: 0, good: 0, bad: 0, trans: 0, fiber: 0 };

        for (const item of meal.items) {
            const grams = item.grams || 0;
            if (grams <= 0) continue;

            // Получаем продукт из индекса (по названию, fallback на id)
            const product = getProductForItem(item, pIndex);
            if (!product) continue;

            const ratio = grams / 100;
            tot.kcal += (product.kcal100 || 0) * ratio;
            tot.prot += (product.protein100 || 0) * ratio;
            tot.simple += (product.simple100 || 0) * ratio;
            tot.complex += (product.complex100 || 0) * ratio;
            tot.carbs += ((product.simple100 || 0) + (product.complex100 || 0)) * ratio;
            tot.good += (product.goodFat100 || 0) * ratio;
            tot.bad += (product.badFat100 || 0) * ratio;
            tot.trans += (product.trans100 || 0) * ratio;
            tot.fat += ((product.goodFat100 || 0) + (product.badFat100 || 0) + (product.trans100 || 0)) * ratio;
            tot.fiber += (product.fiber100 || 0) * ratio;
        }

        return tot;
    }

    /**
     * Получает последний приём пищи с реальными продуктами
     * @param {Object} day - Данные дня
     * @returns {Object|null} meal объект или null
     */
    function getLastMealWithItems(day) {
        const meals = (day?.meals || []).filter(m => m.items?.length > 0);
        return meals.length > 0 ? meals[meals.length - 1] : null;
    }

    /**
     * Получает первый приём пищи с реальными продуктами
     * @param {Object} day - Данные дня
     * @returns {Object|null} meal объект или null
     */
    function getFirstMealWithItems(day) {
        const meals = (day?.meals || []).filter(m => m.items?.length > 0);
        return meals.length > 0 ? meals[0] : null;
    }

    /**
     * Проверяет, был ли показан milestone (персистентно)
     * @param {string} id - ID milestone (например '30_days')
     * @returns {boolean}
     */
    function isMilestoneShown(id) {
        try {
            const key = 'heys_milestone_' + id;
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(key, null)
                : (U.lsGet ? U.lsGet(key, null) : localStorage.getItem(key));
            return stored === '1' || stored === 1 || stored === true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Отмечает milestone как показанный
     * @param {string} id - ID milestone
     */
    function markMilestoneShown(id) {
        try {
            const key = 'heys_milestone_' + id;
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            if (HEYS.store?.set) {
                HEYS.store.set(key, '1');
            } else if (U.lsSet) {
                U.lsSet(key, '1');
            } else {
                localStorage.setItem(key, '1');
            }
        } catch (e) {
            // Ignore storage errors
        }
    }

    /**
     * Подсчитывает количество уникальных продуктов за день
     * @param {Object} day - Данные дня
     * @returns {number}
     */
    function countUniqueProducts(day) {
        const names = new Set();
        (day?.meals || []).forEach(meal => {
            (meal.items || []).forEach(item => {
                // Используем название как уникальный идентификатор
                const name = String(item.name || '').trim().toLowerCase();
                if (name) names.add(name);
            });
        });
        return names.size;
    }

    /**
     * Подсчитывает общее количество дней с данными в localStorage
     * Учитывает clientId для multi-client режима
     * @returns {number}
     */
    function getTotalDaysTracked() {
        try {
            const U = HEYS.utils || {};
            const clientId = U.getCurrentClientId ? U.getCurrentClientId() : '';
            let count = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('heys_dayv2_')) {
                    // Если есть clientId, проверяем что ключ начинается с него
                    // Формат: {clientId}_heys_dayv2_{date} или heys_dayv2_{date}
                    if (!clientId || key.startsWith(clientId + '_') || !key.includes('_heys_dayv2_')) {
                        count++;
                    }
                }
            }
            return count;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Получает лучший streak из localStorage
     * @returns {number}
     */
    function getPersonalBestStreak() {
        try {
            const key = 'heys_best_streak';
            const HEYS = window.HEYS || {};
            const U = HEYS.utils || {};
            const stored = HEYS.store?.get
                ? HEYS.store.get(key, null)
                : (U.lsGet ? U.lsGet(key, null) : localStorage.getItem(key));
            return parseInt(stored || '0', 10);
        } catch (e) {
            return 0;
        }
    }

    /**
     * Обновляет лучший streak если текущий больше
     * @param {number} currentStreak - Текущий streak
     * @returns {boolean} true если это новый рекорд
     */
    function updatePersonalBestStreak(currentStreak) {
        const best = getPersonalBestStreak();
        if (currentStreak > best) {
            // 🔧 v4.7.1 FIX: Откладываем запись в localStorage чтобы не триггерить
            // setState во время render фазы React (Cannot update component while rendering)
            setTimeout(() => {
                try {
                    const key = 'heys_best_streak';
                    const HEYS = window.HEYS || {};
                    const U = HEYS.utils || {};
                    if (HEYS.store?.set) {
                        HEYS.store.set(key, String(currentStreak));
                    } else if (U.lsSet) {
                        U.lsSet(key, String(currentStreak));
                    } else {
                        localStorage.setItem(key, String(currentStreak));
                    }
                } catch (e) {
                    // Ignore storage errors
                }
            }, 0);
            return true; // Новый рекорд!
        }
        return false;
    }

    /**
     * Проверяет, можно ли показать meal-level совет
     * @returns {boolean}
     */
    function canShowMealAdvice() {
        try {
            const last = sessionStorage.getItem('heys_last_meal_advice');
            return !last || (Date.now() - parseInt(last, 10)) > MEAL_ADVICE_THROTTLE_MS;
        } catch (e) {
            return true;
        }
    }

    /**
     * Отмечает время показа meal-level совета
     */
    function markMealAdviceShown() {
        try {
            sessionStorage.setItem('heys_last_meal_advice', String(Date.now()));
        } catch (e) {
            // Ignore storage errors
        }
    }

    // ═══════════════════════════════════════════════════════════
    // REACT HOOK
    // ═══════════════════════════════════════════════════════════

    /**
     * React hook для получения советов
     * @param {Object} params
     * @param {Object} params.dayTot - Суммы за день
     * @param {Object} params.normAbs - Нормы в граммах
     * @param {number} params.optimum - Целевой калораж
     * @param {Object} params.day - Данные дня
     * @param {Map} params.pIndex - Индекс продуктов
     * @param {number} params.currentStreak - Текущий streak (передаётся из DayTab, НЕ вычисляется заново!)
     * @param {string} params.trigger - Что вызвало показ ('tab_open'|'product_added')
     * @param {Object} params.uiState - Состояние UI для проверки занятости
     * @param {Object} params.prof - Профиль пользователя (sex, age, weight, sleepHours, insulinWaveHours, deficitPctTarget и др.)
     * @param {number} params.waterGoal - Динамическая норма воды (из waterGoalBreakdown)
     * @param {Object} params.caloricDebt - Данные о калорийном долге (totalDebt, dailyBoost, hasDebt и др.)
     * @param {number} params.displayOptimum - Скорректированная норма с учётом долга
     * @returns {Object} Объект с советами и методами
     */
    function useAdviceEngine(params) {
        // ⚠️ ВАЖНО: currentStreak передаётся как параметр, НЕ вычисляется!
        const { dayTot, normAbs, optimum, displayOptimum, caloricDebt, day, pIndex, currentStreak, trigger, uiState, prof, waterGoal } = params;
        const React = window.React;

        // Вычисляем контекст
        const ctx = (() => {
            try {
                const now = new Date();
                const hour = now.getHours();
                const meals = Array.isArray(day?.meals) ? day.meals : [];
                const mealCount = meals.filter(m => m?.items?.length > 0).length;
                const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
                const hasTraining = trainings.some(t => t?.z && Array.isArray(t.z) && t.z.some(m => m > 0));

                // 🧠 Расширенный контекст
                const kcalPct = (dayTot?.kcal || 0) / (optimum || 2000);
                const tone = getToneForHour(hour);
                const specialDay = getSpecialDay(now);

                // 🎯 Goal-aware: определяем режим по цели (дефицит/набор/поддержание)
                const dayDeficit = day?.deficitPct;
                const profileDeficit = prof?.deficitPctTarget;
                const effectiveDeficit = dayDeficit ?? profileDeficit ?? 0;
                const goal = getGoalMode(effectiveDeficit);

                const emotionalState = getEmotionalState({
                    day,
                    currentStreak: currentStreak || 0,
                    mealCount,
                    kcalPct,
                    goal, // Передаём goal для goal-aware определения
                    totalDaysTracked: 30 // Приблизительно
                });

                // 🆕 Получаем crashRisk из Metabolic Intelligence
                let crashRisk = null;
                if (window.HEYS?.Metabolic?.calculateCrashRisk24h) {
                    try {
                        crashRisk = window.HEYS.Metabolic.calculateCrashRisk24h();
                    } catch (e) {
                        // Игнорируем ошибки при получении crashRisk
                    }
                }

                return {
                    dayTot: dayTot || {},
                    normAbs: normAbs || {},
                    optimum: optimum || 2000,
                    displayOptimum: displayOptimum || optimum || 2000, // С учётом долга (fallback на optimum)
                    caloricDebt: caloricDebt || null,                   // Данные о долге
                    day: day || {},
                    pIndex: pIndex || { byId: new Map(), byName: new Map() },
                    currentStreak: currentStreak || 0,
                    hour,
                    mealCount,
                    hasTraining,
                    kcalPct,
                    tone,
                    specialDay,
                    emotionalState,
                    prof: prof || {},           // Профиль пользователя
                    waterGoal: waterGoal || 2000, // Норма воды
                    goal,                        // 🎯 Goal режим (deficit/bulk/maintenance)
                    crashRisk                    // 🆕 Риск срыва из Metabolic Intelligence
                };
            } catch (e) {
                console.error('[HEYS.advice] ❌ ctx useMemo crash:', e?.message);
                return {
                    dayTot: {}, normAbs: {}, optimum: 2000, displayOptimum: 2000,
                    caloricDebt: null, day: {}, pIndex: { byId: new Map(), byName: new Map() },
                    currentStreak: 0, hour: new Date().getHours(), mealCount: 0,
                    hasTraining: false, kcalPct: 0, tone: 'neutral', specialDay: null,
                    emotionalState: 'normal', prof: {}, waterGoal: 2000,
                    goal: 'maintenance', crashRisk: null
                };
            }
        })();

        // Генерируем все советы
        const allAdvices = (() => {
            try {
                if (!ctx) return [];
                const baseAdvices = generateAdvices(ctx);

                // 🔗 Добавляем chain follow-ups
                const chainAdvices = generateChainAdvices();

                // ⏰ Добавляем отложенные советы
                const scheduledAdvices = getScheduledAdvices();

                // 🎯 Добавляем goal-specific советы
                const goalAdvices = getGoalSpecificAdvices(ctx.goal);

                // 🏆 Проверяем personal bests
                const personalBestAdvices = [];
                const todayISO = new Date().toISOString().slice(0, 10);

                // Проверяем рекорды по метрикам
                const proteinPct = (ctx.dayTot?.prot || 0) / (ctx.normAbs?.prot || 100);
                const proteinRecord = checkAndUpdatePersonalBest('proteinPct', proteinPct * 100, todayISO);
                if (proteinRecord?.isNewRecord) {
                    const advice = createPersonalBestAdvice('proteinPct', proteinRecord);
                    if (advice) personalBestAdvices.push(advice);
                }

                const fiberPct = (ctx.dayTot?.fiber || 0) / (ctx.normAbs?.fiber || 25);
                const fiberRecord = checkAndUpdatePersonalBest('fiberPct', fiberPct * 100, todayISO);
                if (fiberRecord?.isNewRecord) {
                    const advice = createPersonalBestAdvice('fiberPct', fiberRecord);
                    if (advice) personalBestAdvices.push(advice);
                }

                // Streak record
                if (ctx.currentStreak > 0) {
                    const streakRecord = checkAndUpdatePersonalBest('streak', ctx.currentStreak, todayISO);
                    if (streakRecord?.isNewRecord) {
                        const advice = createPersonalBestAdvice('streak', streakRecord);
                        if (advice) personalBestAdvices.push(advice);
                    }
                }

                return [
                    ...(Array.isArray(baseAdvices) ? baseAdvices : []),
                    ...(Array.isArray(chainAdvices) ? chainAdvices : []),
                    ...(Array.isArray(scheduledAdvices) ? scheduledAdvices : []),
                    ...(Array.isArray(goalAdvices) ? goalAdvices : []),
                    ...personalBestAdvices
                ];
            } catch (e) {
                console.error('[HEYS.advice] ❌ allAdvices useMemo crash:', e?.message);
                return [];
            }
        })();

        const expertSignals = (() => {
            try {
                return collectSoftExpertSignals(ctx);
            } catch (e) {
                console.warn('[HEYS.advice] ⚠️ expertSignals skipped:', e?.message);
                return null;
            }
        })();

        const enrichedAdvices = (() => {
            try {
                return enrichAdvicesWithExpertContext(allAdvices, ctx, expertSignals);
            } catch (e) {
                console.warn('[HEYS.advice] ⚠️ enrichAdvices skipped:', e?.message);
                return allAdvices;
            }
        })();

        // 🔧 Фильтруем по включённым категориям
        // 💊 Советы с isReminder: true (напоминания) показываются ВСЕГДА
        const categoryFilteredAdvices = (() => {
            return enrichedAdvices.filter(a => {
                // Напоминания (витамины и т.д.) показываются всегда
                if (a.isReminder === true) return true;
                // Категория health — это напоминания, всегда показываем
                if (a.category === 'health') return true;
                if (!a.category) return true;
                return isCategoryEnabled(a.category);
            });
        })();

        // Применяем boost для goal-specific советов
        const boostedAdvices = (() => {
            return applyGoalBoost(categoryFilteredAdvices, ctx.goal);
        })();

        // Фильтруем по эмоциональному состоянию
        const filteredAdvices = (() => {
            return filterByEmotionalState(boostedAdvices, ctx.emotionalState);
        })();

        // 🎭 Адаптируем тексты под настроение
        const moodAdaptedAdvices = (() => {
            const avgMood = getAverageMoodToday(ctx.day);
            if (!avgMood || avgMood === 0) return filteredAdvices;

            return filteredAdvices.map(advice => {
                const adaptedText = adaptTextToMood(advice.text, avgMood, advice.type);
                if (adaptedText === null) return null; // Фильтруем жёсткие советы при плохом настроении
                return { ...advice, text: adaptedText };
            }).filter(Boolean);
        })();

        // Фильтруем по триггеру (для показа в развёрнутом виде — без canShowAdvice)
        // Спецтриггер 'manual' — показывает ВСЕ советы без фильтрации по триггеру
        const allForTrigger = (() => {
            if (!trigger) return [];
            if (isUserBusy(uiState)) return [];

            let advices = moodAdaptedAdvices;

            // Manual trigger — показываем все советы
            if (trigger !== 'manual') {
                advices = advices.filter(a => a.triggers.includes(trigger));
            }

            // 🧠 Smart Prioritization — ML-like scoring
            advices = sortBySmartScore(advices, ctx);

            // 🧠 Expert arbitrage — suppress weaker same-theme advices
            advices = applyExpertConflictResolution(advices);

            // ⏰ Применяем временные ограничения
            advices = filterByTimeRestrictions(advices);

            // 🔄 Дедупликация — из группы похожих показываем только один
            advices = deduplicateAdvices(advices);

            // Применяем систему excludes
            advices = filterByExcludes(advices);

            // Ограничиваем по категориям (антиспам)
            advices = limitByCategory(advices);

            return advices;
        })();

        // Советы которые можно показать (с проверкой cooldown)
        const relevantAdvices = (() => {
            return allForTrigger.filter(a => canShowAdvice(a.id, { canSkipCooldown: a.canSkipCooldown }));
        })();

        // Основной совет (первый доступный)
        const primary = relevantAdvices[0] || null;

        // Добавляем animation класс
        const primaryWithAnimation = primary ? {
            ...primary,
            animationClass: getAdviceAnimation(primary)
        } : null;

        // Количество для badge — ВСЕ советы для триггера (без canShowAdvice)
        const adviceCount = allForTrigger.length;

        // 🔢 Badge advices — советы для FAB badge (как trigger='manual', но без зависимости от trigger)
        // Применяем ВСЕ фильтры
        const badgeAdvices = (() => {
            if (isUserBusy(uiState)) return [];

            let advices = moodAdaptedAdvices;

            // 🧠 Smart Prioritization
            advices = sortBySmartScore(advices, ctx);

            // 🧠 Expert arbitrage
            advices = applyExpertConflictResolution(advices);

            // ⏰ Временные ограничения
            advices = filterByTimeRestrictions(advices);

            // 🔄 Дедупликация
            advices = deduplicateAdvices(advices);

            // Excludes
            advices = filterByExcludes(advices);

            // Лимит по категориям
            advices = limitByCategory(advices);

            return advices;
        })();

        // Количество отложенных
        const scheduledCount = getScheduledCount();

        const resolveAdviceRef = (adviceRef) => {
            if (!adviceRef) return null;
            if (typeof adviceRef === 'object' && adviceRef.id) return adviceRef;
            const adviceId = String(adviceRef);
            return enrichedAdvices.find(item => item?.id === adviceId) || null;
        };

        return {
            primary: primaryWithAnimation,
            relevant: allForTrigger, // Все советы для развёртывания
            adviceCount,
            badgeAdvices, // Для FAB badge — массив советов с полной фильтрацией
            scheduledCount,
            allAdvices: enrichedAdvices,
            ctx,
            crashRisk: ctx?.crashRisk, // 🆕 Экспортируем crashRisk для UI
            expertSignals,
            // Методы
            markShown: (adviceRef) => {
                const advice = resolveAdviceRef(adviceRef);
                const adviceId = advice?.id || String(adviceRef || '');
                if (!adviceId) return;
                markAdviceShown(adviceId);
                trackAdviceShown(adviceId); // 📊 Tracking
                if (advice) {
                    recordAdviceOutcomeEvent(advice, ctx, 'shown');
                    recordPendingAdviceOutcome(advice, ctx);
                }
            },
            trackClick: (adviceRef) => {
                const advice = resolveAdviceRef(adviceRef);
                const adviceId = advice?.id || String(adviceRef || '');
                if (!adviceId) return;
                trackAdviceClicked(adviceId);
                if (advice) recordAdviceOutcomeEvent(advice, ctx, 'click');
            },
            markRead: (adviceRef) => {
                const advice = resolveAdviceRef(adviceRef);
                if (advice) recordAdviceOutcomeEvent(advice, ctx, 'read');
            },
            markHidden: (adviceRef) => {
                const advice = resolveAdviceRef(adviceRef);
                if (advice) recordAdviceOutcomeEvent(advice, ctx, 'hidden');
            },
            rateAdvice: (adviceRef, isPositive) => {
                const advice = resolveAdviceRef(adviceRef);
                const adviceId = advice?.id || String(adviceRef || '');
                if (!adviceId) return;
                rateAdvice(adviceId, isPositive);
                if (advice) recordAdviceOutcomeEvent(advice, ctx, isPositive ? 'positive' : 'negative');
            },
            scheduleAdvice, // ⏰ Отложить совет
            canShow: canShowAdvice,
            resetSession: resetSessionAdvices
        };
    }

    /**
     * 🆕 Получение crashRisk из Metabolic Intelligence
     * Helper для добавления в контекст советов
     * @returns {Object|null} { risk: 0-100, level: 'low'|'medium'|'high', factors: [] }
     */
    function getCrashRiskForContext() {
        if (!window.HEYS?.Metabolic?.calculateCrashRisk24h) {
            return null;
        }

        try {
            return window.HEYS.Metabolic.calculateCrashRisk24h();
        } catch (e) {
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Helpers registry (shared for category modules)
    // ═══════════════════════════════════════════════════════════

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceCoreHelpers = {
        rules: AdviceRules,
        getProductForItem,
        personalizeText,
        pickRandomText,
        getTimeBasedText,
        getTimePeriod,
        adaptTextToMood,
        getAverageMoodToday,
        calculateAverageMood,
        calculateAverageStress,
        calculateAverageWellbeing,
        getToneForHour,
        getEmotionalState,
        getSpecialDay,
        filterByEmotionalState,
        isUserBusy,
        analyzeProductCategories,
        getDayForecast,
        getWeeklyComparison,
        getWeeklySummary,
        getNextStreakMilestone,
        trackDismiss,
        getDismissPenalty,
        calculateDynamicTTL,
        checkAdviceChain,
        markChainStart: markChainStartForAdvice,
        checkComboAchievements,
        markComboShown,
        trackProductPattern,
        getSmartRecommendation,
        calculateSleepHours,
        getMealTotals,
        getLastMealWithItems,
        getFirstMealWithItems,
        isMilestoneShown,
        markMilestoneShown,
        countUniqueProducts,
        getTotalDaysTracked,
        getPersonalBestStreak,
        updatePersonalBestStreak,
        canShowMealAdvice,
        markMealAdviceShown,
        getRecentDays,
        getAverageBedtime,
        getHoursUntilBedtime,
        getHoursSinceWater,
        hasCoffeeAfterHour,
        getGoalMode,
        isInTargetRange,
        isCriticallyOver,
        isCriticallyUnder
    };

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    const adviceRules = AdviceRules;

    const adviceEngine = {
        generateAdvices,
        useAdviceEngine,
        invalidateAdviceCache
    };

    window.HEYS.adviceRules = adviceRules;
    window.HEYS.adviceEngine = adviceEngine;
    window.HEYS.advice = {
        rules: adviceRules,
        engine: adviceEngine,
        useAdviceEngine,
        generateAdvices,
        markShown: markAdviceShown,
        canShow: canShowAdvice,
        resetSessionAdvices,
        // 🎯 Goal-aware helpers
        getGoalMode,
        isInTargetRange,
        isCriticallyOver,
        isCriticallyUnder,
        // 🔧 Filtering & processing
        filterByExcludes,
        limitByCategory,
        applyGoalBoost,
        sortBySmartScore,
        // 📊 Tracking & Analytics
        trackAdviceShown,
        trackAdviceClicked,
        getAdviceCTR,
        getTopAdvices,
        getTrackingStats,
        getAdviceOutcomeProfiles,
        // 👍👎 Rating system
        rateAdvice,
        getAdviceRating,
        getAllRatings,
        // 🎨 Text helpers
        personalizeText,
        pickRandomText,
        getTimeBasedText,
        getTimePeriod,
        adaptTextToMood,
        getAverageMoodToday,
        // 📋 Config — Все правила в одном месте
        THRESHOLDS,
        SEASONAL_TIPS,
        MAX_ADVICES_PER_CATEGORY,
        PRODUCT_CATEGORIES,
        ADVICE_CHAINS,
        DEDUPLICATION_RULES,    // 🆕 Группы похожих советов
        TIME_RESTRICTIONS,      // 🆕 Временные ограничения
        STREAK_MILESTONES,
        TTL_CONFIG,
        TIME_BASED_TEXTS,
        COMBO_ACHIEVEMENTS,
        MOOD_TONES,
        // 🔧 Filtering functions
        deduplicateAdvices,       // 🆕 Дедупликация
        filterByTimeRestrictions, // 🆕 Временные ограничения
        // Helper functions для тестирования
        getToneForHour,
        getEmotionalState,
        getSpecialDay,
        filterByEmotionalState,
        isUserBusy,
        calculateAverageMood,
        calculateAverageStress,
        calculateAverageWellbeing,
        // Phase 0 helpers (Phase 2 советы)
        getMealTotals,
        getLastMealWithItems,
        getFirstMealWithItems,
        isMilestoneShown,
        markMilestoneShown,
        countUniqueProducts,
        getTotalDaysTracked,
        getPersonalBestStreak,
        updatePersonalBestStreak,
        canShowMealAdvice,
        markMealAdviceShown,
        getRecentDays,
        getAverageBedtime,      // 🆕 Среднее время сна из истории
        getHoursUntilBedtime,   // 🆕 Часов до сна (из истории или расчёта)
        // 🆕 Phase 3 helpers
        analyzeProductCategories,
        getDayForecast,
        getWeeklyComparison,
        getWeeklySummary,
        getNextStreakMilestone,
        trackDismiss,
        getDismissPenalty,
        calculateDynamicTTL,
        checkAdviceChain,
        markChainStart: markChainStartForAdvice,
        // 🆕 Phase 4 helpers
        checkComboAchievements,
        markComboShown,
        trackProductPattern,
        getSmartRecommendation,
        calculateSmartScore,
        collectSoftExpertSignals,
        enrichAdvicesWithExpertContext,
        applyExpertConflictResolution,
        // 🆕 Phase 5 helpers
        // Settings
        getAdviceSettings,
        setAdviceSettings,
        isCategoryEnabled,
        toggleCategory,
        CATEGORY_LABELS,
        DEFAULT_ADVICE_SETTINGS,
        // Personal Bests
        getPersonalBests,
        checkAndUpdatePersonalBest,
        createPersonalBestAdvice,
        TRACKABLE_METRICS,
        // Chains
        checkChainContinuation,
        generateChainAdvices,
        // Scheduling
        scheduleAdvice,
        getScheduledAdvices,
        getScheduledCount,
        SNOOZE_OPTIONS,
        // Goal-specific
        getGoalSpecificAdvices,
        GOAL_MODES,
        // Animations
        getAdviceAnimation,
        ADVICE_ANIMATIONS,
        // 🚀 Cache management
        invalidateAdviceCache,      // 🆕 Инвалидация кэша (вызывать при product_added)
        // 🎯 Priority constants
        PRIORITY                    // 🆕 Стандартизованные приоритеты
    };

})();
