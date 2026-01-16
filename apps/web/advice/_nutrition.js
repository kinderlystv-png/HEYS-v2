/**
 * HEYS Advice Module v1 — Nutrition
 * @file advice/_nutrition.js
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceModules = window.HEYS.adviceModules || {};

    window.HEYS.adviceModules.nutrition = function buildNutritionAdvices(ctx, helpers) {
        const advices = [];
        const { rules } = helpers;
        const {
            THRESHOLDS,
            PRIORITY,
            PRODUCT_CATEGORIES
        } = rules;

        const {
            dayTot,
            normAbs,
            optimum,
            displayOptimum,
            caloricDebt,
            day,
            pIndex,
            hour,
            mealCount,
            kcalPct,
            prof,
            waterGoal,
            goal,
            proteinPct,
            fatPct,
            carbsPct,
            fiberPct,
            simplePct,
            transPct,
            harmPct,
            goodFatPct,
            isRefeedDay,
            isRefeedExcessOk
        } = ctx;

        const {
            getTimeBasedText,
            pickRandomText,
            personalizeText,
            markChainStart,
            getMealTotals,
            getLastMealWithItems,
            getFirstMealWithItems,
            canShowMealAdvice,
            markMealAdviceShown,
            analyzeProductCategories,
            getDayForecast,
            getWeeklyComparison,
            getRecentDays,
            getProductForItem,
            getHoursUntilBedtime,
            hasCoffeeAfterHour
        } = helpers;

        // ─────────────────────────────────────────────────────────
        // ⚠️ WARNINGS (priority: 11-30) — Goal-aware + Refeed-aware
        // ─────────────────────────────────────────────────────────

        if (goal && helpers.isCriticallyOver(kcalPct, goal) && !isRefeedExcessOk) {
            const overPct = Math.round((kcalPct - 1) * 100);
            const goalText = goal.mode === 'bulk'
                ? 'Даже для набора это многовато'
                : goal.mode === 'deficit'
                    ? 'План дефицита нарушен'
                    : 'Сильно больше нормы';
            advices.push({
                id: 'kcal_excess_critical',
                icon: '🔴',
                text: `+${overPct}% от плана. ${goalText}`,
                details: goal.mode === 'bulk'
                    ? 'Набор массы требует профицита, но слишком большой избыток уходит в жир. Завтра вернись в план +10-15%.'
                    : 'Не стоит переживать! Один день переедания — это нормально. Завтра сделай лёгкий дефицит и всё выровняется.',
                type: 'warning',
                priority: 11,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 6000
            });
        } else if (goal && kcalPct > goal.targetRange.max && !helpers.isCriticallyOver(kcalPct, goal) && !isRefeedExcessOk) {
            const overPct = Math.round((kcalPct - 1) * 100);
            advices.push({
                id: 'kcal_excess_mild',
                icon: '⚠️',
                text: goal.mode === 'bulk'
                    ? `+${overPct}% — чуть выше плана набора`
                    : `+${overPct}% от плана — ничего страшного`,
                details: '📊 Небольшой перебор не страшен. Важен тренд за неделю, а не каждый день идеально.',
                type: 'tip',
                priority: 15,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000
            });
        }

        if (goal && helpers.isCriticallyUnder(kcalPct, goal) && hour >= 14) {
            advices.push({
                id: 'kcal_under_critical',
                icon: goal.mode === 'bulk' ? '⚠️' : '🌙',
                text: goal.mode === 'bulk'
                    ? `Только ${Math.round(kcalPct * 100)}% — для набора мало!`
                    : goal.mode === 'deficit'
                        ? `${Math.round(kcalPct * 100)}% — слишком жёсткий дефицит`
                        : 'Съедено мало — добавь полноценный приём',
                details: goal.mode === 'bulk'
                    ? 'Для роста мышц нужен профицит калорий. Добавь качественные углеводы и белок.'
                    : 'Слишком резкий дефицит замедляет метаболизм и приводит к срывам. Лучше умеренный дефицит 10-15%.',
                type: goal.mode === 'bulk' ? 'warning' : 'tip',
                priority: 16,
                category: 'nutrition',
                triggers: ['tab_open', 'product_added'],
                ttl: 5000
            });
        }

        if (transPct > 1.0) {
            advices.push({
                id: 'trans_fat_warning',
                icon: '⚠️',
                text: 'Транс-жиры превышены — избегай фастфуда',
                details: 'Транс-жиры — самые вредные. Они повышают "плохой" холестерин и снижают "хороший". Избегай: маргарин, фаст-фуд, чипсы, выпечка с длительным сроком хранения.',
                type: 'warning',
                priority: 12,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000
            });
        }

        if (simplePct > 1.3) {
            const carbsText = getTimeBasedText('simple_carbs_warning', hour, 'Много сахара сегодня — ограничь сладкое');
            advices.push({
                id: 'simple_carbs_warning',
                icon: '🍬',
                text: carbsText,
                details: 'Простые углеводы быстро повышают сахар в крови, вызывая всплеск инсулина и потом упадок энергии. Альтернативы: фрукты, тёмный шоколад 70%+, орехи.',
                type: 'warning',
                priority: 14,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000
            });
        }

        if (harmPct > 1.0) {
            advices.push({
                id: 'harm_warning',
                icon: '💔',
                text: 'Много вредного — завтра начнём сначала',
                details: 'Вредные продукты — это нормально иногда. Главное — не каждый день. Завтра сделай акцент на овощах, белке и воде.',
                type: 'warning',
                priority: 13,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 💡 TIPS (priority: 31-50) — баланс
        // ─────────────────────────────────────────────────────────

        if (proteinPct < THRESHOLDS.protein.low && hour >= 12) {
            const proteinText = getTimeBasedText('protein_low', hour,
                personalizeText(pickRandomText([
                    'Добавь белка — мясо, рыба, творог',
                    '${firstName}, белка маловато — добавь!',
                    'Белок нужен мышцам — курица, яйца, творог'
                ]), ctx)
            );
            advices.push({
                id: 'protein_low',
                icon: '🥩',
                text: proteinText,
                details: 'Белок важен для мышц, иммунитета и сытости. Норма: 1.5-2г на кг веса. Лучшие источники: курица, индейка, рыба, яйца, творог, греческий йогурт, бобовые.',
                type: 'tip',
                priority: 31,
                category: 'nutrition',
                triggers: ['product_added', 'tab_open'],
                excludes: ['post_training_protein', 'deficit_protein_save_muscle', 'bulk_protein_critical'],
                ttl: 5000,
                onShow: () => { markChainStart('protein_low'); }
            });
        }

        if (fiberPct < THRESHOLDS.fiber.low && mealCount >= 2) {
            const fiberDefault = personalizeText(pickRandomText([
                'Мало клетчатки — добавь овощей или злаков',
                'Кишечнику нужна клетчатка — овощи, зелень',
                '${firstName}, добавь овощей для клетчатки'
            ]), ctx);
            const fiberText = getTimeBasedText('fiber_low', hour, fiberDefault);
            advices.push({
                id: 'fiber_low',
                icon: '🥬',
                text: fiberText,
                details: 'Клетчатка важна для пищеварения и сытости. Норма: 25-35г в день. Лидеры: авокадо, брокколи, овсянка, чечевица, груши, малина, семена чиа.',
                type: 'tip',
                priority: 32,
                category: 'nutrition',
                triggers: ['product_added', 'tab_open'],
                excludes: ['deficit_fiber_satiety'],
                ttl: 5000,
                onShow: () => { markChainStart('fiber_low'); }
            });
        }

        if (fiberPct >= THRESHOLDS.fiber.good) {
            advices.push({
                id: 'fiber_good',
                icon: '🥗',
                text: personalizeText(pickRandomText([
                    'Отлично с клетчаткой! Кишечник скажет спасибо',
                    '${firstName}, клетчатка в норме! 👍',
                    'Клетчатка в порядке — пищеварение скажет спасибо'
                ]), ctx),
                details: '🌱 Клетчатка кормит полезные бактерии кишечника, улучшает иммунитет и даёт долгую сытость.',
                type: 'achievement',
                priority: 35,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 4000
            });
        }

        if (goodFatPct < THRESHOLDS.fat.goodRatioLow && hour >= 14) {
            advices.push({
                id: 'good_fat_low',
                icon: '🥑',
                text: personalizeText(pickRandomText([
                    'Добавь полезных жиров — авокадо, орехи, оливковое масло',
                    'Омега-3 важны — рыба, орехи, льняное масло',
                    '${firstName}, не забудь полезные жиры!'
                ]), ctx),
                details: 'Омега-3 и мононенасыщенные жиры важны для мозга, сердца и гормонов. Лучшие источники: жирная рыба (сёмга, скумбрия), авокадо, оливковое масло, орехи (грецкие, миндаль), семена льна и чиа.',
                type: 'tip',
                priority: 33,
                category: 'nutrition',
                triggers: ['product_added', 'tab_open'],
                excludes: ['fat_quality_low'],
                ttl: 5000
            });
        }

        if (hour >= 20 && goal && helpers.isCriticallyUnder(kcalPct, goal)) {
            advices.push({
                id: 'evening_undereating',
                icon: goal.mode === 'bulk' ? '⚠️' : '🌙',
                text: goal.mode === 'bulk'
                    ? `Только ${Math.round(kcalPct * 100)}% — для набора мало! Добавь вечерний приём`
                    : goal.mode === 'deficit'
                        ? 'Слишком жёсткий дефицит — лучше добавь лёгкий ужин'
                        : 'Ещё можно поесть — не голодай перед сном',
                details: goal.mode === 'bulk'
                    ? 'Для роста мышц нужен профицит. Вечерний приём: творог + орехи, или протеин + банан.'
                    : `🔬 Дефицит >500 ккал хуже позднего ужина!\n\n` +
                    `• Метаболизм замедляется\n` +
                    `• Риск потери мышц и выпадения волос\n` +
                    `• Плохой сон от голода = ещё больше аппетита завтра\n\n` +
                    `💡 Творог, яйца, орехи — насытят без скачка инсулина`,
                type: goal.mode === 'bulk' ? 'warning' : 'tip',
                priority: 36,
                category: 'nutrition',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (mealCount >= 2 &&
            proteinPct >= THRESHOLDS.macros.balanceMin && fatPct >= THRESHOLDS.macros.balanceMin && carbsPct >= THRESHOLDS.macros.balanceMin &&
            proteinPct <= THRESHOLDS.macros.balanceMax && fatPct <= THRESHOLDS.macros.balanceMax && carbsPct <= THRESHOLDS.macros.balanceMax) {
            advices.push({
                id: 'balanced_macros',
                icon: '⚖️',
                text: 'Отличный баланс БЖУ!',
                details: '🎯 Белки, жиры и углеводы в балансе — это редкость! Такой день даёт стабильную энергию и хорошее самочувствие.',
                type: 'achievement',
                priority: 38,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 4000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🎯 GOAL-SPECIFIC
        // ─────────────────────────────────────────────────────────

        if (goal?.mode === 'bulk') {
            if (proteinPct < 0.8 && mealCount >= 1) {
                advices.push({
                    id: 'bulk_protein_critical',
                    icon: '🥩',
                    text: 'Для набора нужен белок! Добавь мясо, рыбу или творог',
                    details: 'При наборе массы белок — главный строительный материал. Минимум 1.8-2.2г на кг веса. Распредели по приёмам пищи.',
                    type: 'tip',
                    priority: 39,
                    category: 'nutrition',
                    triggers: ['tab_open', 'product_added'],
                    ttl: 5000
                });
            }

            if (carbsPct < 0.7 && mealCount >= 2) {
                advices.push({
                    id: 'bulk_carbs_low',
                    icon: '🍚',
                    text: 'Добавь углеводов — они дают энергию для роста',
                    details: 'Углеводы — топливо для тренировок и восстановления. Хорошие источники: рис, гречка, овсянка, картофель, макароны.',
                    type: 'tip',
                    priority: 41,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }

            if (hour >= 16 && kcalPct < 0.6) {
                advices.push({
                    id: 'bulk_kcal_behind',
                    icon: '⚠️',
                    text: `Только ${Math.round(kcalPct * 100)}% от плана набора — добавь калорий!`,
                    details: '🍚 Для набора массы нужен профицит 10-15%. Добавь углеводы (рис, гречка) и белок (мясо, творог). Без профицита мышцы не растут!',
                    type: 'warning',
                    priority: 40,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }
        }

        if (goal?.mode === 'deficit') {
            if (proteinPct < 0.9 && mealCount >= 2) {
                advices.push({
                    id: 'deficit_protein_save_muscle',
                    icon: '💪',
                    text: 'На дефиците белок критичен — он сохраняет мышцы',
                    details: 'При похудении организм может разрушать мышцы. Белок 1.6-2г на кг защищает мышечную массу. Приоритет: нежирное мясо, рыба, яйца.',
                    type: 'tip',
                    priority: 42,
                    category: 'nutrition',
                    triggers: ['tab_open', 'product_added'],
                    ttl: 5000
                });
            }

            if (fiberPct < 0.5 && mealCount >= 2) {
                advices.push({
                    id: 'deficit_fiber_satiety',
                    icon: '🥗',
                    text: 'Добавь овощей — клетчатка даёт сытость без калорий',
                    details: 'На дефиците важно чувствовать сытость. Овощи и зелень — объём без калорий. Огурцы, помидоры, капуста, салат — ешь сколько хочешь.',
                    type: 'tip',
                    priority: 43,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }

            if (hour >= 18 && kcalPct < 0.7 && kcalPct > 0) {
                advices.push({
                    id: 'deficit_too_harsh',
                    icon: '⚠️',
                    text: 'Слишком жёсткий дефицит замедляет метаболизм',
                    details: 'Резкое ограничение калорий приводит к срывам и замедлению обмена веществ. Лучше умеренный дефицит 10-15% на долгой дистанции.',
                    type: 'warning',
                    priority: 44,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }

            const waterPctForCombo = (day?.waterMl || 0) / (waterGoal || 2000);
            if (hour >= 16 && kcalPct < 0.6 && waterPctForCombo < 0.5 && mealCount >= 1) {
                advices.push({
                    id: 'undereating_dehydration_combo',
                    icon: '🚨',
                    text: 'Мало калорий И мало воды — двойной стресс для организма!',
                    details: `🔬 Комбинация дефицита и обезвоживания особенно опасна:\n\n` +
                        `• Метаболизм замедляется ещё сильнее\n` +
                        `• Голод усиливается (жажду путают с голодом)\n` +
                        `• Головная боль, слабость, раздражительность\n` +
                        `• Почки и печень работают на износ\n\n` +
                        `💡 Сначала выпей воды! Часто "голод" = жажда. Потом поешь.`,
                    type: 'warning',
                    priority: 6,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 7000
                });
            }

            if (helpers.isInTargetRange(kcalPct, goal) && mealCount >= 2) {
                advices.push({
                    id: 'deficit_on_track_motivation',
                    icon: '🔥',
                    text: 'Дефицит выдерживается — так держать!',
                    details: '🎯 При дефиците 10-15% ты теряешь ~0.5-1 кг в неделю без вреда для метаболизма. Это оптимальный темп!',
                    type: 'achievement',
                    priority: 45,
                    category: 'motivation',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }
        }

        if (goal?.mode === 'maintenance') {
            if (helpers.isInTargetRange(kcalPct, goal) && mealCount >= 2) {
                advices.push({
                    id: 'maintenance_stable',
                    icon: '⚖️',
                    text: 'Калории в балансе — отличная стабильность!',
                    details: '⚖️ Поддержание веса — это тоже результат! Ты нашёл свой баланс — продолжай в том же духе.',
                    type: 'achievement',
                    priority: 46,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 💰 CALORIC DEBT TIPS
        // ─────────────────────────────────────────────────────────

        if (caloricDebt && caloricDebt.hasDebt) {
            const debtKcal = Math.abs(caloricDebt.totalDebt);
            const dailyBoost = caloricDebt.dailyBoost || 0;
            const daysWithDeficit = caloricDebt.daysWithDeficit || 0;

            if (dailyBoost > 0 && hour >= 10 && !sessionStorage.getItem('heys_debt_info')) {
                advices.push({
                    id: 'caloric_debt_info',
                    icon: '💰',
                    text: `+${dailyBoost} ккал бонус за вчерашний дефицит!`,
                    details: `📊 За последние 3 дня накопился дефицит ${debtKcal} ккал. Норма увеличена до ${displayOptimum || optimum} ккал — организм сигнализирует о потребности в восполнении.`,
                    type: 'tip',
                    priority: 30,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 6000,
                    onShow: () => { try { sessionStorage.setItem('heys_debt_info', '1'); } catch (e) { } }
                });
            }

            if (debtKcal >= 500 && daysWithDeficit >= 2) {
                advices.push({
                    id: 'caloric_debt_high',
                    icon: '⚠️',
                    text: 'Накопился дефицит — метаболизм может замедлиться',
                    details: `🔬 ${daysWithDeficit} дня подряд недоедание (−${debtKcal} ккал). Постоянный дефицит снижает лептин и замедляет обмен веществ. Рассмотри рефид или увеличь калории сегодня.`,
                    type: 'warning',
                    priority: 25,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 7000
                });
            }

            const eatenPctOfBoost = dailyBoost > 0 ? (dayTot?.kcal || 0) / displayOptimum : 0;
            if (dailyBoost > 0 && eatenPctOfBoost >= 0.9 && eatenPctOfBoost <= 1.1 && hour >= 18) {
                advices.push({
                    id: 'caloric_debt_repaid',
                    icon: '✅',
                    text: 'Долг погашается — организм восстанавливается!',
                    details: '🎯 Ты съел с учётом бонусной зоны, но не переел. Это оптимальный способ восполнить дефицит без скачка веса.',
                    type: 'achievement',
                    priority: 10,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }

            const hasExcess = caloricDebt?.hasExcess;
            const dailyReduction = caloricDebt?.dailyReduction || 0;

            if (dailyReduction > 50 && !hasExcess && hour < 14) {
                advices.push({
                    id: 'excess_soft_correction',
                    icon: '🎯',
                    text: `Норма чуть снижена (−${dailyReduction} ккал) — мягкий акцент`,
                    details: '📊 Это не наказание! Коррекция 5-10% помогает осознанности без стресса. Главное — активность и позитивный настрой.',
                    type: 'tip',
                    priority: 35,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }

            const proteinDebt = caloricDebt?.proteinDebt;
            if (proteinDebt?.hasDebt && proteinDebt.severity !== 'none') {
                const protSeverity = proteinDebt.severity;

                if (protSeverity === 'critical') {
                    advices.push({
                        id: 'protein_debt_critical',
                        icon: '🚨',
                        text: 'Критический недобор белка за 3 дня!',
                        details: `💪 Среднее потребление белка ${Math.round(proteinDebt.avgProteinPct * 100)}% от нормы. При <18% организм начинает терять мышцы! Срочно добавь белковых продуктов.`,
                        type: 'warning',
                        priority: 12,
                        category: 'nutrition',
                        triggers: ['tab_open'],
                        ttl: 8000
                    });
                } else if (protSeverity === 'moderate') {
                    advices.push({
                        id: 'protein_debt_moderate',
                        icon: '🥩',
                        text: 'Маловато белка последние дни',
                        details: `🍗 Среднее ${Math.round(proteinDebt.avgProteinPct * 100)}% от нормы. Добавь творог, яйца, курицу или рыбу — сохранишь мышцы!`,
                        type: 'tip',
                        priority: 28,
                        category: 'nutrition',
                        triggers: ['tab_open'],
                        ttl: 6000
                    });
                } else if (protSeverity === 'mild' && hour >= 14) {
                    advices.push({
                        id: 'protein_debt_mild',
                        icon: '💪',
                        text: 'Белок в приоритете сегодня',
                        details: '🥚 Небольшой недобор белка за последние дни. Сегодня постарайся добрать норму — это важно для метаболизма и мышц.',
                        type: 'tip',
                        priority: 45,
                        category: 'nutrition',
                        triggers: ['tab_open'],
                        ttl: 5000
                    });
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 🌈 VARIETY
        // ─────────────────────────────────────────────────────────

        const allItems = (day?.meals || []).flatMap(m => m.items || []);
        const productNames = allItems.map(it => {
            const product = getProductForItem(it, pIndex);
            return (product?.name || it.name || '').toLowerCase().trim();
        }).filter(Boolean);
        const uniqueProducts = new Set(productNames).size;

        if (productNames.length >= 5 && uniqueProducts < 3) {
            advices.push({
                id: 'variety_low',
                icon: '🌈',
                text: 'Разнообразь рацион — добавь другие продукты',
                details: '🥗 Разнообразие = полный спектр витаминов и минералов. Разные цвета еды = разные нутриенты. Старайся 10+ разных продуктов в день.',
                type: 'tip',
                priority: 45,
                category: 'nutrition',
                triggers: ['product_added', 'tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🍽️ MEAL-LEVEL
        // ─────────────────────────────────────────────────────────

        const lastMealWithItems = getLastMealWithItems(day);
        const firstMealWithItems = getFirstMealWithItems(day);
        const lastMealTotals = lastMealWithItems ? getMealTotals(lastMealWithItems, pIndex) : null;

        if (lastMealTotals && lastMealTotals.kcal > THRESHOLDS.meal.tooLarge && canShowMealAdvice()) {
            advices.push({
                id: 'meal_too_large',
                icon: '🍽️',
                text: personalizeText(`Большой приём (${Math.round(lastMealTotals.kcal)} ккал)! Следующий сделай полегче`, ctx),
                details: '🍽️ Большие приёмы вызывают резкий скачок инсулина и сонливость. Лучше 4-5 средних приёмов по 300-500 ккал.',
                type: 'tip',
                priority: 71,
                category: 'nutrition',
                triggers: ['product_added'],
                excludes: ['meal_too_small'],
                ttl: 5000,
                onShow: () => markMealAdviceShown()
            });
        }

        if (lastMealTotals && lastMealTotals.kcal < THRESHOLDS.meal.tooSmall && lastMealTotals.kcal > 0 && mealCount >= 2 && canShowMealAdvice()) {
            advices.push({
                id: 'meal_too_small',
                icon: '🥄',
                text: personalizeText(pickRandomText(['Маловато — добавь ещё что-нибудь', '${firstName}, маловато — добавь ещё']), ctx),
                details: '🥄 Слишком маленькие приёмы не насыщают и ведут к перекусам. Минимум 150-200 ккал на приём для сытости.',
                type: 'tip',
                priority: 72,
                category: 'nutrition',
                triggers: ['product_added'],
                excludes: ['meal_too_large'],
                ttl: 5000,
                onShow: () => markMealAdviceShown()
            });
        }

        if (lastMealTotals && lastMealTotals.prot < THRESHOLDS.meal.proteinMin && lastMealTotals.kcal > 200 && canShowMealAdvice()) {
            advices.push({
                id: 'protein_per_meal_low',
                icon: '🥚',
                text: 'Мало белка в приёме — добавь яйцо или творог',
                details: '💪 20-30г белка на приём — оптимально для синтеза мышц. Яйцо = 6г, 100г творога = 18г, куриная грудка = 31г.',
                type: 'tip',
                priority: 73,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000,
                onShow: () => markMealAdviceShown()
            });
        }

        if (hour >= 20 && lastMealTotals && lastMealTotals.carbs > 50 && canShowMealAdvice()) {
            advices.push({
                id: 'evening_carbs_high',
                icon: '🌙',
                text: `${Math.round(lastMealTotals.carbs)}г углеводов на ночь — утром может быть голодно`,
                details: '🌜 Углеводы вечером вызывают инсулиновый всплеск и падение сахара ночью. Лучше белок + овощи на ужин.',
                type: 'tip',
                priority: 74,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000,
                onShow: () => markMealAdviceShown()
            });
        }

        if (lastMealTotals && lastMealTotals.fiber > 8 && canShowMealAdvice()) {
            advices.push({
                id: 'fiber_per_meal_good',
                icon: '🥗',
                text: 'Отлично с клетчаткой! Надолго насытит',
                details: '🥦 8+ грамм клетчатки в приёме — это отлично! Клетчатка замедляет усвоение углеводов и дольше держит сытым.',
                type: 'achievement',
                priority: 75,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 4000,
                onShow: () => markMealAdviceShown()
            });
        }

        if (lastMealWithItems && lastMealWithItems.items?.length >= 4 && canShowMealAdvice()) {
            advices.push({
                id: 'variety_meal_good',
                icon: '🌈',
                text: 'Разнообразный приём — так держать!',
                details: '🌟 Разнообразие = больше микронутриентов. Разные цвета еды = разные витамины и антиоксиданты.',
                type: 'achievement',
                priority: 76,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 4000,
                onShow: () => markMealAdviceShown()
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🎯 MEAL QUALITY SCORE
        // ─────────────────────────────────────────────────────────

        if (lastMealWithItems && window.HEYS?.getMealQualityScore && canShowMealAdvice()) {
            const mealTypeInfo = window.HEYS.getMealType?.(lastMealWithItems) || { type: 'snack' };
            const quality = window.HEYS.getMealQualityScore(lastMealWithItems, mealTypeInfo.type, optimum || 2000, pIndex);

            if (quality?.score !== undefined) {
                if (quality.score >= 85) {
                    advices.push({
                        id: 'meal_quality_excellent',
                        icon: '⭐',
                        text: `Отличный приём! Качество ${quality.score}/100`,
                        details: '🏆 Score 85+ означает отличный баланс макросов, хороший ГИ и достаточно белка. Так и надо!',
                        type: 'achievement',
                        priority: PRIORITY.ACHIEVEMENT,
                        category: 'nutrition',
                        triggers: ['product_added'],
                        ttl: 4000,
                        onShow: () => markMealAdviceShown()
                    });
                } else if (quality.score >= 70) {
                    advices.push({
                        id: 'meal_quality_good',
                        icon: '✓',
                        text: `Неплохой приём (${quality.score}/100)`,
                        details: '👍 Score 70-84 — это хорошо! Мелкие улучшения: больше белка или меньше простых углеводов.',
                        type: 'tip',
                        priority: PRIORITY.NORMAL + 8,
                        category: 'nutrition',
                        triggers: ['product_added'],
                        ttl: 4000,
                        onShow: () => markMealAdviceShown()
                    });
                } else if (quality.score < 50) {
                    const issues = [];
                    if (quality.badges?.some(b => b.type === 'Б')) issues.push('добавь белка');
                    if (quality.badges?.some(b => b.type === 'ТЖ')) issues.push('много транс-жиров');
                    if (quality.badges?.some(b => b.type === 'ГИ')) issues.push('высокий ГИ');
                    if (quality.badges?.some(b => b.type === '🌙')) issues.push('поздновато');

                    const issueText = issues.length > 0 ? ` — ${issues.slice(0, 2).join(', ')}` : '';

                    advices.push({
                        id: 'meal_quality_poor',
                        icon: '⚠️',
                        text: `Приём можно улучшить (${quality.score}/100)${issueText}`,
                        details: '💡 Score < 50 — есть над чем работать. Совет: добавь источник белка (яйцо, творог) или замени простые углеводы на сложные.',
                        type: 'warning',
                        priority: PRIORITY.NUTRITION,
                        category: 'nutrition',
                        triggers: ['product_added'],
                        ttl: 5000,
                        onShow: () => markMealAdviceShown()
                    });
                }

                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yKey = `heys_dayv2_${yesterday.toISOString().slice(0, 10)}`;
                const yesterdayDay = window.HEYS?.utils?.lsGet?.(yKey);

                if (yesterdayDay?.meals?.length > 0) {
                    let yScoreSum = 0, yCount = 0;
                    let tScoreSum = 0, tCount = 0;

                    for (const m of yesterdayDay.meals) {
                        if (m.items?.length > 0) {
                            const mt = window.HEYS.getMealType?.(m) || { type: 'snack' };
                            const qs = window.HEYS.getMealQualityScore(m, mt.type, optimum || 2000, pIndex);
                            if (qs?.score) { yScoreSum += qs.score; yCount++; }
                        }
                    }

                    for (const m of (day?.meals || [])) {
                        if (m.items?.length > 0) {
                            const mt = window.HEYS.getMealType?.(m) || { type: 'snack' };
                            const qs = window.HEYS.getMealQualityScore(m, mt.type, optimum || 2000, pIndex);
                            if (qs?.score) { tScoreSum += qs.score; tCount++; }
                        }
                    }

                    if (yCount >= 2 && tCount >= 2) {
                        const yAvg = yScoreSum / yCount;
                        const tAvg = tScoreSum / tCount;
                        const diff = tAvg - yAvg;

                        if (diff >= 10) {
                            advices.push({
                                id: 'meal_quality_improving',
                                icon: '📈',
                                text: `Качество еды улучшается! +${Math.round(diff)} за день`,
                                details: '🚀 Средний score приёмов сегодня выше чем вчера. Продолжай в том же духе!',
                                type: 'achievement',
                                priority: PRIORITY.ACHIEVEMENT,
                                category: 'nutrition',
                                triggers: ['tab_open'],
                                ttl: 5000
                            });
                        }
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📊 DAY-QUALITY
        // ─────────────────────────────────────────────────────────

        if ((dayTot?.trans || 0) === 0 && mealCount >= 2) {
            advices.push({
                id: 'trans_free_day',
                icon: '🎉',
                text: 'День без транс-жиров!',
                details: '💚 Транс-жиры — самые вредные для сердца. Отлично, что сегодня без них!',
                type: 'achievement',
                priority: 81,
                category: 'nutrition',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if ((dayTot?.simple || 0) < 25 && (dayTot?.simple || 0) > 0 && mealCount >= 2) {
            advices.push({
                id: 'sugar_low_day',
                icon: '🍬',
                text: 'Почти без сахара — отлично! 🚫',
                details: '🏆 Менее 25г простых углеводов — это круто! Норма ВОЗ: макс 50г сахара в день, идеал — до 25г.',
                type: 'achievement',
                priority: 82,
                category: 'nutrition',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const uniqueProductCount = helpers.countUniqueProducts(day);
        if (uniqueProductCount >= 10) {
            advices.push({
                id: 'variety_day_good',
                icon: '🌈',
                text: `${uniqueProductCount} разных продуктов — отличное разнообразие!`,
                details: '🥗 10+ продуктов = полный спектр витаминов, минералов и антиоксидантов. Так держать!',
                type: 'achievement',
                priority: 84,
                category: 'nutrition',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (helpers.isInTargetRange(kcalPct, goal) && hour >= 12 && mealCount >= 2) {
            advices.push({
                id: 'goal_on_track',
                icon: goal.emoji,
                text: goal.mode === 'bulk'
                    ? 'Набор идёт по плану! 💪'
                    : goal.mode === 'deficit'
                        ? 'Дефицит выдерживается! 🔥'
                        : 'Калории в норме! ⚖️',
                details: '🏆 Последовательность — ключ к результату. Каждый день в плане приближает тебя к цели!',
                type: 'achievement',
                priority: 85,
                category: 'nutrition',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🥜 AFTER SWEET
        // ─────────────────────────────────────────────────────────

        const lastMeal = (day?.meals || []).slice(-1)[0];
        if (lastMeal && lastMeal.items?.length > 0) {
            let lastMealSimple = 0, lastMealCarbs = 0, lastMealKcal = 0;
            for (const item of lastMeal.items) {
                const product = getProductForItem(item, pIndex);
                if (!product) continue;
                const grams = item.grams || 100;
                lastMealSimple += (product.simple100 || 0) * grams / 100;
                lastMealCarbs += ((product.simple100 || 0) + (product.complex100 || 0)) * grams / 100;
                lastMealKcal += (product.kcal100 || 0) * grams / 100;
            }
            const lastMealSimplePct = lastMealCarbs > 0 ? (lastMealSimple / lastMealCarbs) : 0;

            if (lastMealSimplePct > 0.6 && lastMealKcal > 100) {
                advices.push({
                    id: 'after_sweet_protein',
                    icon: '🥜',
                    text: 'После сладкого добавь белок — орехи или творог',
                    details: '⚖️ Белок замедляет усвоение сахара и смягчает инсулиновый скачок. Горсть орехов или ложка творога спасут ситуацию.',
                    type: 'tip',
                    priority: 55,
                    category: 'nutrition',
                    triggers: ['product_added'],
                    ttl: 5000
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📊 NUTRITION QUALITY
        // ─────────────────────────────────────────────────────────

        const avgGI = dayTot?.gi || 0;

        if (window.HEYS?.InsulinWave) {
            try {
                const iwData = window.HEYS.InsulinWave.calculate({
                    meals: day?.meals || [],
                    pIndex: window.HEYS?.day?.productIndex,
                    getProductFromItem: (item, idx) => {
                        if (!idx?.byId) return null;
                        return idx.byId.get(item.product_id) || idx.byId.get(String(item.product_id));
                    },
                    baseWaveHours: prof?.insulinWaveHours || 3
                });

                if (iwData && iwData.status !== 'ready' && iwData.avgGI > 65) {
                    const remainingText = iwData.remaining > 60
                        ? Math.round(iwData.remaining / 60) + 'ч'
                        : Math.round(iwData.remaining) + ' мин';

                    advices.push({
                        id: 'high_gi_during_wave',
                        icon: '⚡',
                        text: `ГИ ${iwData.avgGI} во время волны (${remainingText}) — сахар в крови подскочит`,
                        type: 'warning',
                        priority: 8,
                        category: 'nutrition',
                        triggers: ['product_added'],
                        ttl: 6000
                    });
                }

                if (iwData && iwData.status !== 'ready' && iwData.avgGI <= 40) {
                    advices.push({
                        id: 'low_gi_during_wave',
                        icon: '👍',
                        text: `ГИ ${iwData.avgGI} — отличный выбор для активной волны!`,
                        type: 'achievement',
                        priority: 35,
                        category: 'nutrition',
                        triggers: ['product_added'],
                        ttl: 4000
                    });
                }
            } catch (e) {
                // ignore
            }
        }

        if (avgGI > 70 && mealCount >= 2) {
            advices.push({
                id: 'high_gi_warning',
                icon: '📈',
                text: `Средний ГИ ${Math.round(avgGI)} — добавь белок и клетчатку`,
                details: '📉 Высокий ГИ = скачки сахара и голод. Белок и клетчатка замедляют усвоение углеводов.',
                type: 'tip',
                priority: 33,
                category: 'nutrition',
                triggers: ['product_added', 'tab_open'],
                ttl: 5000
            });
        }

        if (avgGI > 0 && avgGI <= 55 && mealCount >= 2) {
            advices.push({
                id: 'low_gi_great',
                icon: '💚',
                text: `ГИ ${Math.round(avgGI)} — стабильная энергия весь день`,
                details: '🌿 Низкий ГИ = стабильная энергия без скачков. Ты не чувствуешь голода и упадка сил.',
                type: 'achievement',
                priority: 36,
                category: 'nutrition',
                triggers: ['tab_open'],
                ttl: 4000
            });
        }

        const simpleCarbs = dayTot?.simple || 0;
        const complexCarbs = dayTot?.complex || 0;
        const totalCarbs = simpleCarbs + complexCarbs;

        if (totalCarbs > 50) {
            const simpleRatio = simpleCarbs / totalCarbs;

            if (simpleRatio > 0.5) {
                advices.push({
                    id: 'simple_complex_ratio',
                    icon: '⚖️',
                    text: `${Math.round(simpleRatio * 100)}% простых углеводов — добавь каши, хлеб`,
                    details: '🌾 Идеальное соотношение: 70% сложных (каши, хлеб, макароны) / 30% простых (фрукты, мёд). Сложные углеводы дают стабильную энергию на 3-4 часа без скачков сахара.',
                    type: 'tip',
                    priority: 34,
                    category: 'nutrition',
                    triggers: ['product_added'],
                    ttl: 5000
                });
            }

            if (simpleRatio <= 0.3 && mealCount >= 2) {
                advices.push({
                    id: 'carbs_balance_perfect',
                    icon: '🌾',
                    text: 'Отличный баланс углеводов!',
                    details: '🌾 70% сложных / 30% простых — идеальное соотношение для стабильной энергии.',
                    type: 'achievement',
                    priority: 37,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }
        }

        const goodFat = dayTot?.good || 0;
        const badFat = dayTot?.bad || 0;
        const transFat = dayTot?.trans || 0;
        const totalFat = goodFat + badFat + transFat;

        if (totalFat > 20) {
            const goodRatio = goodFat / totalFat;

            if (goodRatio < 0.4) {
                advices.push({
                    id: 'fat_quality_low',
                    icon: '🐟',
                    text: 'Добавь полезных жиров — рыба, орехи, авокадо',
                    details: '🧠 Полезные жиры (омега-3) нужны для мозга, сердца и гормонов. Сёмга, грецкие орехи, авокадо.',
                    type: 'tip',
                    priority: 32,
                    category: 'nutrition',
                    triggers: ['product_added', 'tab_open'],
                    ttl: 5000
                });
            }

            if (goodRatio >= 0.6) {
                advices.push({
                    id: 'fat_quality_great',
                    icon: '💚',
                    text: `${Math.round(goodRatio * 100)}% полезных жиров — супер!`,
                    details: '❤️ Отличное соотношение жиров! Твоё сердце и мозг скажут спасибо.',
                    type: 'achievement',
                    priority: 38,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // ☕ Caffeine timing (nutrition category)
        // ─────────────────────────────────────────────────────────

        const coffeeCheck = (() => {
            const bedInfo = getHoursUntilBedtime(hour, prof);
            const hoursToSleep = bedInfo.hoursUntilBed;

            const caffeineUnsafeHour = bedInfo.source === 'history'
                ? Math.max(12, 24 - 6 + parseInt(bedInfo.bedtimeFormatted.split(':')[0]) - 24)
                : 16;

            return {
                hasCoffee: hasCoffeeAfterHour(day?.meals, Math.min(caffeineUnsafeHour, 16), pIndex),
                bedtime: bedInfo.bedtimeFormatted,
                hoursToSleep,
                source: bedInfo.source
            };
        })();

        if (coffeeCheck.hasCoffee && !sessionStorage.getItem('heys_caffeine_tip')) {
            const coffeeDetail = coffeeCheck.source === 'history'
                ? `⏰ Ты обычно засыпаешь в ${coffeeCheck.bedtime}. Кофеин действует 6-8 часов — может помешать заснуть!`
                : '⏰ Кофеин действует 6-8 часов. Кофе в 16:00 = кофеин в крови до полуночи.';

            advices.push({
                id: 'caffeine_evening',
                icon: '☕',
                text: coffeeCheck.hoursToSleep <= 6
                    ? `До сна ${Math.round(coffeeCheck.hoursToSleep)}ч — кофеин ещё в крови!`
                    : 'Кофе вечером может ухудшить сон',
                details: coffeeDetail + '\n\n💡 Альтернатива: декаф, зелёный чай, цикорий.',
                type: coffeeCheck.hoursToSleep <= 4 ? 'warning' : 'tip',
                priority: coffeeCheck.hoursToSleep <= 4 ? 25 : 42,
                category: 'nutrition',
                triggers: ['product_added'],
                ttl: 5000,
                onShow: () => { try { sessionStorage.setItem('heys_caffeine_tip', '1'); } catch (e) { } }
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🥗 SMART PRODUCT CATEGORIES
        // ─────────────────────────────────────────────────────────

        if (mealCount >= 2) {
            const categories = analyzeProductCategories(day, pIndex);

            if (categories.missing.includes('vegetables') && !sessionStorage.getItem('heys_veggies_tip')) {
                const config = PRODUCT_CATEGORIES.vegetables;
                advices.push({
                    id: 'missing_vegetables',
                    icon: config.icon,
                    text: config.advice,
                    details: '🥗 Овощи = клетчатка + витамины + сытость при минимуме калорий. Добавь салат или овощи в блюдо.',
                    type: 'tip',
                    priority: 52,
                    category: 'nutrition',
                    triggers: ['tab_open', 'product_added'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_veggies_tip', '1'); } catch (e) { } }
                });
            }

            if (categories.missing.includes('dairy') && !sessionStorage.getItem('heys_dairy_tip')) {
                const config = PRODUCT_CATEGORIES.dairy;
                advices.push({
                    id: 'missing_dairy',
                    icon: config.icon,
                    text: config.advice,
                    details: '🧀 Молочка = кальций + белок + пробиотики (йогурт). Для костей и мышц.',
                    type: 'tip',
                    priority: 53,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_dairy_tip', '1'); } catch (e) { } }
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📊 DAY FORECAST
        // ─────────────────────────────────────────────────────────

        if (hour >= 11 && hour <= 18 && mealCount >= 1 && !sessionStorage.getItem('heys_forecast_shown')) {
            const forecast = getDayForecast(kcalPct, hour, mealCount);

            if (forecast && forecast.trend !== 'on_track') {
                advices.push({
                    id: 'day_forecast',
                    icon: forecast.trend === 'under' ? '📉' : '📈',
                    text: forecast.message,
                    details: '🔮 Прогноз на основе текущего темпа. Можно скорректировать до конца дня.',
                    type: 'insight',
                    priority: 42,
                    category: 'nutrition',
                    triggers: ['tab_open'],
                    ttl: 6000,
                    onShow: () => { try { sessionStorage.setItem('heys_forecast_shown', '1'); } catch (e) { } }
                });
            }
        }

        return advices;
    };

})();
