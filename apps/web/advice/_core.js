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

    // ═══════════════════════════════════════════════════════════
    // 🚀 ADVICE CACHE — Кэширование результатов generateAdvices
    // ═══════════════════════════════════════════════════════════

    let adviceCache = {
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
            const ratings = JSON.parse(localStorage.getItem(RATING_KEY) || '{}');
            if (!ratings[adviceId]) {
                ratings[adviceId] = { positive: 0, negative: 0 };
            }
            if (isPositive) {
                ratings[adviceId].positive++;
            } else {
                ratings[adviceId].negative++;
            }
            ratings[adviceId].lastRated = Date.now();
            localStorage.setItem(RATING_KEY, JSON.stringify(ratings));
        } catch (e) { }
    }

    /**
     * Получает рейтинг совета
     * @param {string} adviceId
     * @returns {Object} { positive, negative, score }
     */
    function getAdviceRating(adviceId) {
        try {
            const ratings = JSON.parse(localStorage.getItem(RATING_KEY) || '{}');
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
            const data = localStorage.getItem(RATING_KEY);
            if (!data) return {};
            const parsed = JSON.parse(data);

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
                localStorage.setItem(RATING_KEY, JSON.stringify(parsed));
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
                const lastShown = localStorage.getItem(shownKey);
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
            localStorage.setItem('heys_combo_' + comboId, String(Date.now()));
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
            const patterns = JSON.parse(localStorage.getItem(RECOMMENDATION_PATTERNS_KEY) || '{}');
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

            localStorage.setItem(RECOMMENDATION_PATTERNS_KEY, JSON.stringify(patterns));
        } catch (e) { }
    }

    /**
     * Получает рекомендации на основе паттернов
     * @param {number} currentHour
     * @returns {Object|null} { productName, avgHour, message }
     */
    function getSmartRecommendation(currentHour) {
        try {
            const patterns = JSON.parse(localStorage.getItem(RECOMMENDATION_PATTERNS_KEY) || '{}');

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
            const U = window.HEYS?.utils || {};
            const stored = U.lsGet ? U.lsGet(ADVICE_SETTINGS_KEY, null) : JSON.parse(localStorage.getItem(ADVICE_SETTINGS_KEY) || 'null');
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
            const U = window.HEYS?.utils || {};
            if (U.lsSet) {
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
            const stored = localStorage.getItem(PERSONAL_BESTS_KEY);
            return stored ? JSON.parse(stored) : {};
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
                localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(bests));
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
            const chains = JSON.parse(localStorage.getItem(CHAIN_STORAGE_KEY) || '{}');
            chains[chainId] = Date.now();
            localStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify(chains));
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
            const chains = JSON.parse(localStorage.getItem(CHAIN_STORAGE_KEY) || '{}');
            const startTime = chains[chainId];
            if (!startTime) return null;

            const minutesPassed = (Date.now() - startTime) / (1000 * 60);
            if (minutesPassed >= chainConfig.delayMinutes) {
                // Удаляем из chains, чтобы не показать снова
                delete chains[chainId];
                localStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify(chains));

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
            const scheduled = JSON.parse(localStorage.getItem(SCHEDULED_KEY) || '[]');
            scheduled.push({
                advice,
                showAt: Date.now() + minutes * 60 * 1000
            });
            localStorage.setItem(SCHEDULED_KEY, JSON.stringify(scheduled));

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
            const scheduled = JSON.parse(localStorage.getItem(SCHEDULED_KEY) || '[]');
            if (scheduled.length === 0) return []; // Ничего нет — не трогаем storage

            const now = Date.now();

            const ready = scheduled.filter(s => s.showAt <= now);
            const remaining = scheduled.filter(s => s.showAt > now);

            // Обновляем storage ТОЛЬКО если есть готовые советы (чтобы не спамить)
            if (ready.length > 0) {
                localStorage.setItem(SCHEDULED_KEY, JSON.stringify(remaining));
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
            const scheduled = JSON.parse(localStorage.getItem(SCHEDULED_KEY) || '[]');
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
                const count = parseInt(localStorage.getItem(key) || '0', 10);
                localStorage.setItem(key, String(count + 1));
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
            const count = parseInt(localStorage.getItem('heys_dismiss_' + adviceId) || '0', 10);
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
            const shownAt = localStorage.getItem(key);
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
                localStorage.setItem('heys_chain_' + adviceId, String(Date.now()));
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

        // Если есть goal — используем goal-aware логику
        if (goal) {
            // Вернулся после перерыва
            let lastVisitDaysAgo = 0;
            try {
                const lastVisit = localStorage.getItem('heys_last_visit');
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
            const lastVisit = localStorage.getItem('heys_last_visit');
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
            const data = localStorage.getItem(TRACKING_KEY);
            if (!data) return {};
            const parsed = JSON.parse(data);

            // Автоочистка: удаляем записи старше 30 дней
            const now = Date.now();
            const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
            let needsSave = false;
            Object.keys(parsed).forEach(key => {
                if (parsed[key].lastShown && (now - parsed[key].lastShown) > THIRTY_DAYS) {
                    delete parsed[key];
                    needsSave = true;
                }
            });
            if (needsSave) {
                localStorage.setItem(TRACKING_KEY, JSON.stringify(parsed));
            }
            return parsed;
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
            localStorage.setItem(TRACKING_KEY, JSON.stringify(stats));
        } catch (e) {
            // Ignore storage errors
        }
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
            if (typeof mod === 'function') {
                const list = mod(ctx, helpers) || [];
                if (Array.isArray(list)) advices.push(...list);
                continue;
            }
            if (Array.isArray(mod)) {
                advices.push(...evaluateRules(mod, ctx, helpers));
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
        if (!day?.sleepStart || !day?.sleepEnd) return 0;

        const [startH, startM] = day.sleepStart.split(':').map(Number);
        const [endH, endM] = day.sleepEnd.split(':').map(Number);

        let hours = endH - startH;
        let mins = endM - startM;

        // Если легли вчера (например 23:00 → 07:00)
        if (hours < 0) hours += 24;

        return hours + mins / 60;
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
            return localStorage.getItem('heys_milestone_' + id) === '1';
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
            localStorage.setItem('heys_milestone_' + id, '1');
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
            return parseInt(localStorage.getItem('heys_best_streak') || '0', 10);
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
            try {
                localStorage.setItem('heys_best_streak', String(currentStreak));
            } catch (e) {
                // Ignore storage errors
            }
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
        const ctx = React.useMemo(() => {
            const now = new Date();
            const hour = now.getHours();
            const meals = day?.meals || [];
            const mealCount = meals.filter(m => m.items?.length > 0).length;
            const trainings = day?.trainings || [];
            const hasTraining = trainings.some(t => t.z && t.z.some(m => m > 0));

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
        }, [dayTot, normAbs, optimum, displayOptimum, caloricDebt, day, pIndex, currentStreak, prof, waterGoal]);

        // Генерируем все советы
        const allAdvices = React.useMemo(() => {
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
                ...baseAdvices,
                ...chainAdvices,
                ...scheduledAdvices,
                ...goalAdvices,
                ...personalBestAdvices
            ];
        }, [ctx]);

        // 🔧 Фильтруем по включённым категориям
        // 💊 Советы с isReminder: true (напоминания) показываются ВСЕГДА
        const categoryFilteredAdvices = React.useMemo(() => {
            return allAdvices.filter(a => {
                // Напоминания (витамины и т.д.) показываются всегда
                if (a.isReminder === true) return true;
                // Категория health — это напоминания, всегда показываем
                if (a.category === 'health') return true;
                if (!a.category) return true;
                return isCategoryEnabled(a.category);
            });
        }, [allAdvices]);

        // Применяем boost для goal-specific советов
        const boostedAdvices = React.useMemo(() => {
            return applyGoalBoost(categoryFilteredAdvices, ctx.goal);
        }, [categoryFilteredAdvices, ctx.goal]);

        // Фильтруем по эмоциональному состоянию
        const filteredAdvices = React.useMemo(() => {
            return filterByEmotionalState(boostedAdvices, ctx.emotionalState);
        }, [boostedAdvices, ctx.emotionalState]);

        // 🎭 Адаптируем тексты под настроение
        const moodAdaptedAdvices = React.useMemo(() => {
            const avgMood = getAverageMoodToday(ctx.day);
            if (!avgMood || avgMood === 0) return filteredAdvices;

            return filteredAdvices.map(advice => {
                const adaptedText = adaptTextToMood(advice.text, avgMood, advice.type);
                if (adaptedText === null) return null; // Фильтруем жёсткие советы при плохом настроении
                return { ...advice, text: adaptedText };
            }).filter(Boolean);
        }, [filteredAdvices, ctx.day]);

        // Фильтруем по триггеру (для показа в развёрнутом виде — без canShowAdvice)
        // Спецтриггер 'manual' — показывает ВСЕ советы без фильтрации по триггеру
        const allForTrigger = React.useMemo(() => {
            if (!trigger) return [];
            if (isUserBusy(uiState)) return [];

            let advices = moodAdaptedAdvices;

            // Manual trigger — показываем все советы
            if (trigger !== 'manual') {
                advices = advices.filter(a => a.triggers.includes(trigger));
            }

            // 🧠 Smart Prioritization — ML-like scoring
            advices = sortBySmartScore(advices, ctx);

            // ⏰ Применяем временные ограничения
            advices = filterByTimeRestrictions(advices);

            // 🔄 Дедупликация — из группы похожих показываем только один
            advices = deduplicateAdvices(advices);

            // Применяем систему excludes
            advices = filterByExcludes(advices);

            // Ограничиваем по категориям (антиспам)
            advices = limitByCategory(advices);

            return advices;
        }, [moodAdaptedAdvices, trigger, uiState, ctx]);

        // Советы которые можно показать (с проверкой cooldown)
        const relevantAdvices = React.useMemo(() => {
            return allForTrigger.filter(a => canShowAdvice(a.id, { canSkipCooldown: a.canSkipCooldown }));
        }, [allForTrigger]);

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
        const badgeAdvices = React.useMemo(() => {
            if (isUserBusy(uiState)) return [];

            let advices = moodAdaptedAdvices;

            // 🧠 Smart Prioritization
            advices = sortBySmartScore(advices, ctx);

            // ⏰ Временные ограничения
            advices = filterByTimeRestrictions(advices);

            // 🔄 Дедупликация
            advices = deduplicateAdvices(advices);

            // Excludes
            advices = filterByExcludes(advices);

            // Лимит по категориям
            advices = limitByCategory(advices);

            return advices;
        }, [moodAdaptedAdvices, uiState, ctx]);

        // Количество отложенных
        const scheduledCount = getScheduledCount();

        return {
            primary: primaryWithAnimation,
            relevant: allForTrigger, // Все советы для развёртывания
            adviceCount,
            badgeAdvices, // Для FAB badge — массив советов с полной фильтрацией
            scheduledCount,
            allAdvices,
            ctx,
            crashRisk: ctx?.crashRisk, // 🆕 Экспортируем crashRisk для UI
            // Методы
            markShown: (id) => {
                markAdviceShown(id);
                trackAdviceShown(id); // 📊 Tracking
            },
            trackClick: trackAdviceClicked, // 📊 Tracking клика
            rateAdvice, // 👍/👎 Rating
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
