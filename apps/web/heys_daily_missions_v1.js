// heys_daily_missions_v1.js — Daily Missions Pool & Selection Engine
// Отдельный модуль миссий дня. Загружается ДО heys_gamification_v1.js
// v1.0.0
window.__heysPerfMark && window.__heysPerfMark('postboot-1-game: execute start');
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    // ─── Helpers ───────────────────────────────────────────────────

    /** Read profile from storage */
    function getProfile() {
        try {
            if (HEYS.store?.get) return HEYS.store.get('heys_profile', {}) || {};
            const U = HEYS.utils || {};
            if (U.lsGet) return U.lsGet('heys_profile', {}) || {};
            const raw = localStorage.getItem('heys_profile');
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    /** Read normAbs from HEYS.Day or fallback */
    function getNormAbs() {
        try {
            // HEYS.Day exports normAbs via getFiberPercent internals — but we need raw norms
            // Use stored norms as fallback
            if (HEYS.store?.get) {
                const n = HEYS.store.get('heys_norms', null);
                if (n) return n;
            }
            const U = HEYS.utils || {};
            if (U.lsGet) {
                const n = U.lsGet('heys_norms', null);
                if (n) return n;
            }
        } catch { /* ignore */ }
        return null;
    }

    // ─── Categories ────────────────────────────────────────────────

    const CATEGORY = {
        NUTRITION: 'nutrition',
        WATER: 'water',
        QUALITY: 'quality',
        DISCIPLINE: 'discipline',
        ACTIVITY: 'activity'
    };

    const CATEGORY_META = {
        [CATEGORY.NUTRITION]: { label: 'Питание', icon: '🍽️' },
        [CATEGORY.WATER]: { label: 'Вода', icon: '💧' },
        [CATEGORY.QUALITY]: { label: 'Качество', icon: '⭐' },
        [CATEGORY.DISCIPLINE]: { label: 'Дисциплина', icon: '⏰' },
        [CATEGORY.ACTIVITY]: { label: 'Активность', icon: '🏃' }
    };

    // ─── Mission Pool (~31) ────────────────────────────────────────
    //
    // Fields:
    //   id        — unique mission ID
    //   name      — display name (RU)
    //   icon      — emoji
    //   desc      — short description (RU)
    //   xp        — XP reward
    //   type      — handler type (used in updateDailyMission switch)
    //   category  — one of CATEGORY values
    //   target    — completion threshold
    //   minLevel  — minimum player level (default 1)
    //   condition — optional (profile) => boolean — extra filter
    //
    // condition checks:
    //   insulinWaveHours > 3 → "не IF-режим" (3+ часа волна = 3+ приёма в день)
    //   insulinWaveHours <= 3 → IF-режим (2 приёма)

    const DAILY_MISSION_POOL = [
        // ═══════════ ПИТАНИЕ ═══════════
        {
            id: 'log_2_meals',
            name: 'Два приёма',
            icon: '🍽️',
            desc: 'Запиши 2 приёма пищи',
            xp: 15,
            type: 'meals',
            category: CATEGORY.NUTRITION,
            target: 2,
            minLevel: 1
        },
        {
            id: 'log_3_meals',
            name: 'Три приёма',
            icon: '🍱',
            desc: 'Запиши 3 приёма пищи',
            xp: 25,
            type: 'meals',
            category: CATEGORY.NUTRITION,
            target: 3,
            minLevel: 4,
            // Не выдавать IF-клиентам (insulinWaveHours ≤ 3 → обычно 2 приёма)
            condition: (p) => (p.insulinWaveHours || 3) > 3,
            hint: 'Регулярное питание поддерживает стабильный уровень энергии',
            strategy: 'Распредели приёмы равномерно: завтрак 8-9, обед 13-14, ужин 19-20. Планируй заранее',
            examples: ['Каша утром', 'Суп днём', 'Овощи + белок вечером']
        },
        {
            id: 'add_5_products',
            name: 'Разнообразие',
            icon: '🥗',
            desc: 'Добавь 5 разных продуктов',
            xp: 20,
            type: 'products',
            category: CATEGORY.NUTRITION,
            target: 5,
            minLevel: 1
        },
        {
            id: 'add_8_products',
            name: 'Гурман',
            icon: '🍲',
            desc: 'Добавь 8 разных продуктов',
            xp: 30,
            type: 'products',
            category: CATEGORY.NUTRITION,
            target: 8,
            minLevel: 5,
            hint: 'Разнообразие продуктов обеспечивает полный спектр нутриентов',
            strategy: 'Правило радуги: продукты разных цветов. Комбинируй крупы, овощи, фрукты, белки',
            examples: ['Гречка + курица + огурец + томат + яблоко + творог + хлеб + орехи']
        },
        {
            id: 'first_meal_before_10',
            name: 'Ранний завтрак',
            icon: '🌅',
            desc: 'Первый приём до 10:00',
            xp: 20,
            type: 'early_meal',
            category: CATEGORY.NUTRITION,
            target: 10,
            minLevel: 3,
            // Не выдавать IF-клиентам
            condition: (p) => (p.insulinWaveHours || 3) > 3
        },
        {
            id: 'kcal_70',
            name: '70% калорий',
            icon: '🔥',
            desc: 'Набери 70% нормы калорий',
            xp: 20,
            type: 'kcal',
            category: CATEGORY.NUTRITION,
            target: 70,
            minLevel: 2
        },
        {
            id: 'kcal_90',
            name: 'Почти в норме',
            icon: '🎯',
            desc: 'Набери 90% нормы калорий',
            xp: 30,
            type: 'kcal',
            category: CATEGORY.NUTRITION,
            target: 90,
            minLevel: 6
        },

        // ═══════════ ВОДА ═══════════
        {
            id: 'water_50',
            name: 'Полпути',
            icon: '💧',
            desc: 'Выпей 50% нормы воды',
            xp: 15,
            type: 'water',
            category: CATEGORY.WATER,
            target: 50,
            minLevel: 1
        },
        {
            id: 'water_80',
            name: 'Хорошо!',
            icon: '💦',
            desc: 'Выпей 80% нормы воды',
            xp: 25,
            type: 'water',
            category: CATEGORY.WATER,
            target: 80,
            minLevel: 3
        },
        {
            id: 'water_100',
            name: 'Норма воды',
            icon: '🌊',
            desc: 'Выполни норму воды на 100%',
            xp: 30,
            type: 'water',
            category: CATEGORY.WATER,
            target: 100,
            minLevel: 5,
            hint: 'Вода улучшает обмен веществ и концентрацию',
            strategy: 'Стакан утром, по 200мл каждые 2 часа, за 30мин до еды. Используй напоминания',
            examples: ['Утром 250мл', 'Каждые 2ч по 200мл', 'Перед обедом 250мл']
        },
        {
            id: 'water_3_times',
            name: 'Регулярность',
            icon: '⏱️',
            desc: 'Запиши воду 3 раза',
            xp: 20,
            type: 'water_entries',
            category: CATEGORY.WATER,
            target: 3,
            minLevel: 1
        },
        {
            id: 'water_5_times',
            name: 'Водный марафон',
            icon: '🚿',
            desc: 'Запиши воду 5 раз',
            xp: 25,
            type: 'water_entries',
            category: CATEGORY.WATER,
            target: 5,
            minLevel: 5
        },

        // ═══════════ КАЧЕСТВО ═══════════
        {
            id: 'protein_50',
            name: 'Белковый старт',
            icon: '🥚',
            desc: 'Набери 50% нормы белка',
            xp: 15,
            type: 'protein',
            category: CATEGORY.QUALITY,
            target: 50,
            minLevel: 1
        },
        {
            id: 'protein_80',
            name: 'Белковый день',
            icon: '🥩',
            desc: 'Набери 80% нормы белка',
            xp: 30,
            type: 'protein',
            category: CATEGORY.QUALITY,
            target: 80,
            minLevel: 4,
            hint: 'Белок необходим для мышц и восстановления',
            strategy: 'В каждый приём белковый продукт: яйца утром, курица днём, рыба/творог вечером. Порции 20-30г',
            examples: ['Яйца 2шт (12г)', 'Курица 100г (25г)', 'Творог 200г (30г)']
        },
        {
            id: 'fiber_50',
            name: 'Больше клетчатки',
            icon: '🥦',
            desc: 'Набери 50% нормы клетчатки',
            xp: 20,
            type: 'fiber',
            category: CATEGORY.QUALITY,
            target: 50,
            minLevel: 3,
            hint: 'Клетчатка улучшает пищеварение и контроль веса',
            strategy: 'Овощи к каждому приёму. Цельнозерновые крупы. Фрукты с кожурой. Отруби',
            examples: ['Овощной салат 200г', 'Гречка 150г', 'Яблоко с кожурой', 'Отруби 2ст.л.']
        },
        {
            id: 'fiber_80',
            name: 'Fiber Master',
            icon: '🥬',
            desc: 'Набери 80% нормы клетчатки',
            xp: 30,
            type: 'fiber',
            category: CATEGORY.QUALITY,
            target: 80,
            minLevel: 6
        },
        {
            id: 'low_harm',
            name: 'Чистое питание',
            icon: '✨',
            desc: 'Harm score ниже 30% нормы',
            xp: 30,
            type: 'low_harm',
            category: CATEGORY.QUALITY,
            target: 30,
            minLevel: 5
        },
        {
            id: 'balance_day',
            name: 'Баланс БЖУ',
            icon: '⚖️',
            desc: 'Все макросы 80-120% нормы',
            xp: 40,
            type: 'balance',
            category: CATEGORY.QUALITY,
            target: 1,
            minLevel: 7
        },
        {
            id: 'low_gi_meal',
            name: 'Низкий ГИ',
            icon: '📉',
            desc: 'Приём пищи с ГИ < 50',
            xp: 25,
            type: 'low_gi',
            category: CATEGORY.QUALITY,
            target: 1,
            minLevel: 6
        },
        {
            id: 'complex_carbs_60',
            name: 'Сложные углеводы',
            icon: '🌾',
            desc: '60%+ углеводов — сложные',
            xp: 25,
            type: 'complex_carbs',
            category: CATEGORY.QUALITY,
            target: 60,
            minLevel: 5
        },

        // ═══════════ ДИСЦИПЛИНА ═══════════
        {
            id: 'streak_keep',
            name: 'Держи стрик',
            icon: '🔥',
            desc: 'Запиши хотя бы 1 приём пищи',
            xp: 10,
            type: 'streak_keep',
            category: CATEGORY.DISCIPLINE,
            target: 1,
            minLevel: 1
        },
        {
            id: 'dinner_before_20',
            name: 'Ужин до 20:00',
            icon: '🌙',
            desc: 'Последний приём до 20:00',
            xp: 20,
            type: 'dinner_time',
            category: CATEGORY.DISCIPLINE,
            target: 1,
            threshold: 20, // hour
            minLevel: 3
        },
        {
            id: 'no_late_snack',
            name: 'Без позднего перекуса',
            icon: '🚫',
            desc: 'Нет приёмов после 21:00',
            xp: 25,
            type: 'no_late_snack',
            category: CATEGORY.DISCIPLINE,
            target: 1,
            threshold: 21, // hour
            minLevel: 4
        },
        {
            id: 'eating_window_12h',
            name: 'Окно питания',
            icon: '⏰',
            desc: 'Ешь в окне ≤ 12 часов',
            xp: 25,
            type: 'eating_window',
            category: CATEGORY.DISCIPLINE,
            target: 1,
            threshold: 12, // hours
            minLevel: 5
        },
        {
            id: 'log_mood',
            name: 'Отслеживай настроение',
            icon: '😊',
            desc: 'Запиши настроение в приёме пищи',
            xp: 10,
            type: 'log_mood',
            category: CATEGORY.DISCIPLINE,
            target: 1,
            minLevel: 2
        },

        // ═══════════ АКТИВНОСТЬ ═══════════
        {
            id: 'log_training',
            name: 'Тренировка дня',
            icon: '💪',
            desc: 'Запиши тренировку',
            xp: 25,
            type: 'training',
            category: CATEGORY.ACTIVITY,
            target: 1,
            minLevel: 1
        },
        {
            id: 'steps_3k',
            name: '3000 шагов',
            icon: '🚶',
            desc: 'Пройди 3000 шагов',
            xp: 15,
            type: 'steps',
            category: CATEGORY.ACTIVITY,
            target: 3000,
            minLevel: 1
        },
        {
            id: 'steps_5k',
            name: '5000 шагов',
            icon: '👟',
            desc: 'Пройди 5000 шагов',
            xp: 25,
            type: 'steps',
            category: CATEGORY.ACTIVITY,
            target: 5000,
            minLevel: 3
        },
        {
            id: 'steps_goal',
            name: 'Цель шагов',
            icon: '🏆',
            desc: 'Выполни свою цель шагов',
            xp: 30,
            type: 'steps_goal',
            category: CATEGORY.ACTIVITY,
            target: 0, // resolved at selection time from profile.stepsGoal
            minLevel: 5
        },
        {
            id: 'active_day',
            name: 'Активный день',
            icon: '⚡',
            desc: 'Тренировка + 3000 шагов',
            xp: 35,
            type: 'active_day',
            category: CATEGORY.ACTIVITY,
            target: 1,
            minLevel: 6
        }
    ];

    // ─── Selection Engine ──────────────────────────────────────────

    /**
     * Select 3 daily missions from the pool.
     * Guarantees different categories. Filters by level and profile conditions.
     * @param {number} level — player gamification level
     * @param {Array<string>} [excludeIds] — mission IDs to exclude (for anti-repeat)
     * @returns {Array} — 3 mission objects with {completed:false, progress:0}
     */
    function selectDailyMissions(level, excludeIds = []) {
        const profile = getProfile();

        // 📊 Calculate behavior metrics for adaptive targets
        const behaviorMetrics = (typeof HEYS !== 'undefined' && HEYS.game?.calculateBehaviorMetrics)
            ? HEYS.game.calculateBehaviorMetrics()
            : null;

        // 1. Get ALL valid candidates for this user/level (ignoring excludes first)
        const validCandidates = DAILY_MISSION_POOL.filter(m => {
            if (level < (m.minLevel || 1)) return false;
            if (m.condition && !m.condition(profile)) return false;
            return true;
        });

        // 2. Filter by exclusion list
        let available = validCandidates.filter(m => !excludeIds.includes(m.id));

        // 3. Fallback: If available < 3, add back some excluded missions to ensure 3
        if (available.length < 3 && validCandidates.length >= 3) {
            const excluded = validCandidates.filter(m => excludeIds.includes(m.id));
            const shuffledExcluded = [...excluded].sort(() => Math.random() - 0.5);
            // Add what's needed to reach 3
            const needed = 3 - available.length;
            available = [...available, ...shuffledExcluded.slice(0, needed)];
        }

        // Shuffle
        const shuffled = [...available].sort(() => Math.random() - 0.5);

        // Pick 3 with different categories
        const usedCategories = new Set();
        const missions = [];

        for (const m of shuffled) {
            if (missions.length >= 3) break;
            if (!usedCategories.has(m.category)) {
                const mission = {
                    ...m,
                    completed: false,
                    progress: 0
                };

                // 🎯 Adaptive mission targets based on user behavior
                let adjustedTarget = mission.target;
                if (behaviorMetrics && behaviorMetrics.sampleDays >= 3) {
                    // Meals mission: adjust based on avgMealsPerDay
                    if (m.type === 'meals' && behaviorMetrics.avgMealsPerDay > 0) {
                        const targetMeals = Math.max(2, Math.round(behaviorMetrics.avgMealsPerDay * 0.8));
                        if (targetMeals !== mission.target) {
                            adjustedTarget = targetMeals;
                            mission.desc = `Добавь ${targetMeals} приёма пищи`;
                            mission.originalTarget = mission.target;
                        }
                    }
                    // Water mission: adjust based on avgWaterPercent
                    if (m.type === 'water' && behaviorMetrics.avgWaterPercent > 0 && behaviorMetrics.avgWaterPercent < 80) {
                        const targetWater = Math.max(50, Math.min(100, Math.round(behaviorMetrics.avgWaterPercent * 1.2)));
                        if (targetWater !== mission.target) {
                            adjustedTarget = targetWater;
                            mission.desc = `Выпей ${targetWater}% от нормы воды`;
                            mission.originalTarget = mission.target;
                        }
                    }
                    // Unique products mission: adjust based on avgUniqueProducts
                    if (m.type === 'products' && behaviorMetrics.avgUniqueProducts > 0) {
                        const targetProducts = Math.max(3, Math.round(behaviorMetrics.avgUniqueProducts * 0.9));
                        if (targetProducts !== mission.target) {
                            adjustedTarget = targetProducts;
                            mission.desc = `Добавь ${targetProducts} разных продуктов`;
                            mission.originalTarget = mission.target;
                        }
                    }
                    // Fiber mission: adjust based on avgFiberPercent
                    if (m.type === 'fiber' && behaviorMetrics.avgFiberPercent > 0 && behaviorMetrics.avgFiberPercent < 70) {
                        const targetFiber = Math.max(40, Math.min(100, Math.round(behaviorMetrics.avgFiberPercent * 1.15)));
                        if (targetFiber !== mission.target) {
                            adjustedTarget = targetFiber;
                            mission.desc = `Набери ${targetFiber}% клетчатки`;
                            mission.originalTarget = mission.target;
                        }
                    }
                }
                mission.target = adjustedTarget;

                // Resolve dynamic targets (steps_goal)
                if (m.type === 'steps_goal') {
                    mission.target = profile.stepsGoal || 10000;
                    mission.desc = `Пройди ${mission.target.toLocaleString('ru-RU')} шагов`;
                }
                // Remove runtime-only fields
                delete mission.condition;
                delete mission.minLevel;
                missions.push(mission);
                usedCategories.add(m.category);
            }
        }

        // If < 3 categories available, fill from remaining (different ids)
        if (missions.length < 3) {
            for (const m of shuffled) {
                if (missions.length >= 3) break;
                if (missions.find(s => s.id === m.id)) continue;
                const mission = { ...m, completed: false, progress: 0 };

                // Apply same adaptive logic for fallback missions
                let adjustedTarget = mission.target;
                if (behaviorMetrics && behaviorMetrics.sampleDays >= 3) {
                    if (m.type === 'meals' && behaviorMetrics.avgMealsPerDay > 0) {
                        adjustedTarget = Math.max(2, Math.round(behaviorMetrics.avgMealsPerDay * 0.8));
                        mission.desc = `Добавь ${adjustedTarget} приёма пищи`;
                        mission.originalTarget = mission.target;
                    }
                    if (m.type === 'water' && behaviorMetrics.avgWaterPercent > 0 && behaviorMetrics.avgWaterPercent < 80) {
                        adjustedTarget = Math.max(50, Math.min(100, Math.round(behaviorMetrics.avgWaterPercent * 1.2)));
                        mission.desc = `Выпей ${adjustedTarget}% от нормы воды`;
                        mission.originalTarget = mission.target;
                    }
                    if (m.type === 'products' && behaviorMetrics.avgUniqueProducts > 0) {
                        adjustedTarget = Math.max(3, Math.round(behaviorMetrics.avgUniqueProducts * 0.9));
                        mission.desc = `Добавь ${adjustedTarget} разных продуктов`;
                        mission.originalTarget = mission.target;
                    }
                    if (m.type === 'fiber' && behaviorMetrics.avgFiberPercent > 0 && behaviorMetrics.avgFiberPercent < 70) {
                        adjustedTarget = Math.max(40, Math.min(100, Math.round(behaviorMetrics.avgFiberPercent * 1.15)));
                        mission.desc = `Набери ${adjustedTarget}% клетчатки`;
                        mission.originalTarget = mission.target;
                    }
                }
                mission.target = adjustedTarget;

                if (m.type === 'steps_goal') {
                    mission.target = profile.stepsGoal || 10000;
                    mission.desc = `Пройди ${mission.target.toLocaleString('ru-RU')} шагов`;
                }
                delete mission.condition;
                delete mission.minLevel;
                missions.push(mission);
            }
        }

        return missions;
    }

    // ─── Exports ───────────────────────────────────────────────────

    HEYS.missions = {
        DAILY_MISSION_POOL,
        CATEGORY,
        CATEGORY_META,
        selectDailyMissions,
        getProfile,
        /** Utility: get total pool size for current level/profile */
        getAvailableCount(level) {
            const profile = getProfile();
            return DAILY_MISSION_POOL.filter(m => {
                if (level < (m.minLevel || 1)) return false;
                if (m.condition && !m.condition(profile)) return false;
                return true;
            }).length;
        }
    };

    console.info('[HEYS.missions] ✅ Daily missions module loaded — pool:', DAILY_MISSION_POOL.length);

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
