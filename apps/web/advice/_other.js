/**
 * HEYS Advice Module v1 — Other (motivation, lifestyle, achievements, supplements, patterns)
 * @file advice/_other.js
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceModules = window.HEYS.adviceModules || {};

    window.HEYS.adviceModules.other = function buildOtherAdvices(ctx, helpers) {
        const advices = [];
        const { rules } = helpers;
        const { SEASONAL_TIPS } = rules;

        const {
            dayTot,
            normAbs,
            optimum,
            displayOptimum,
            caloricDebt,
            day,
            pIndex,
            currentStreak,
            hour,
            mealCount,
            hasTraining,
            kcalPct,
            specialDay,
            prof,
            waterGoal,
            goal,
            proteinPct
        } = ctx;

        // ─────────────────────────────────────────────────────────
        // 💊 Morning supplements reminder
        // ─────────────────────────────────────────────────────────

        const supplementsAdviceShown = sessionStorage.getItem('heys_morning_supplements_advice_shown');
        const plannedSupplements = day?.supplementsPlanned || prof?.plannedSupplements || [];
        const takenSupplements = day?.supplementsTaken || [];
        const hasPendingSupplements = plannedSupplements.length > 0 &&
            plannedSupplements.some(id => !takenSupplements.includes(id));

        if (hour >= 6 && hour <= 12 && hasPendingSupplements && !supplementsAdviceShown) {
            if (window.HEYS?.Supplements?.generateMorningSupplementAdvice) {
                const supplementAdvice = window.HEYS.Supplements.generateMorningSupplementAdvice(
                    plannedSupplements.filter(id => !takenSupplements.includes(id)),
                    { mealCount, hasEaten: mealCount > 0, profile: prof }
                );

                if (supplementAdvice) {
                    advices.push({
                        ...supplementAdvice,
                        priority: 0,
                        category: 'health',
                        isReminder: true,
                        onShow: () => {
                            try { sessionStorage.setItem('heys_morning_supplements_advice_shown', Date.now().toString()); } catch (e) { }
                        }
                    });
                }
            } else {
                const pendingSupps = plannedSupplements.filter(id => !takenSupplements.includes(id));
                const suppNames = pendingSupps
                    .map(id => window.HEYS?.Supplements?.CATALOG?.[id]?.name || id)
                    .slice(0, 3)
                    .join(', ');

                advices.push({
                    id: 'morning_supplements_reminder',
                    icon: '💊',
                    text: `Время витаминов: ${suppNames}${pendingSupps.length > 3 ? ` и ещё ${pendingSupps.length - 3}` : ''}`,
                    details: 'Утренние витамины лучше принимать с завтраком для максимального усвоения. Отметь их в карточке витаминов!',
                    type: 'health',
                    priority: 0,
                    category: 'health',
                    isReminder: true,
                    triggers: ['tab_open', 'checkin_complete'],
                    ttl: 8000,
                    onShow: () => {
                        try { sessionStorage.setItem('heys_morning_supplements_advice_shown', Date.now().toString()); } catch (e) { }
                    }
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 🌙 Evening supplements reminder
        // ─────────────────────────────────────────────────────────

        const eveningSupplementsAdviceShown = sessionStorage.getItem('heys_evening_supplements_advice_shown');
        const eveningTimings = ['evening', 'beforeBed'];
        const eveningSupps = plannedSupplements.filter(id => {
            if (takenSupplements.includes(id)) return false;
            const info = window.HEYS?.Supplements?.SCIENCE?.MORNING_SUPPLEMENT_SCIENCE?.[id];
            return info && eveningTimings.includes(info.timing);
        });

        if (hour >= 18 && hour <= 23 && eveningSupps.length > 0 && !eveningSupplementsAdviceShown) {
            if (window.HEYS?.Supplements?.generateEveningSupplementAdvice) {
                const eveningAdvice = window.HEYS.Supplements.generateEveningSupplementAdvice(
                    plannedSupplements.filter(id => !takenSupplements.includes(id)),
                    { mealCount, hasEaten: mealCount > 0, profile: prof }
                );

                if (eveningAdvice) {
                    advices.push({
                        ...eveningAdvice,
                        priority: 0,
                        category: 'health',
                        isReminder: true,
                        onShow: () => {
                            try { sessionStorage.setItem('heys_evening_supplements_advice_shown', Date.now().toString()); } catch (e) { }
                        }
                    });
                }
            } else {
                const suppNames = eveningSupps
                    .map(id => window.HEYS?.Supplements?.CATALOG?.[id]?.name || id)
                    .slice(0, 3)
                    .join(', ');

                advices.push({
                    id: 'evening_supplements_reminder',
                    icon: '🌙',
                    text: `Вечерние витамины: ${suppNames}${eveningSupps.length > 3 ? ` и ещё ${eveningSupps.length - 3}` : ''}`,
                    details: 'Не забудь принять вечерние витамины! Магний и мелатонин лучше работают перед сном. Отметь их в карточке витаминов!',
                    type: 'health',
                    priority: 0,
                    category: 'health',
                    isReminder: true,
                    triggers: ['product_added'],
                    ttl: 8000,
                    onShow: () => {
                        try { sessionStorage.setItem('heys_evening_supplements_advice_shown', Date.now().toString()); } catch (e) { }
                    }
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 🎯 Special day tips
        // ─────────────────────────────────────────────────────────

        if (specialDay === 'monday_morning') {
            advices.push({
                id: 'monday_motivation',
                icon: '💪',
                text: helpers.personalizeText(helpers.pickRandomText([
                    'Новая неделя — новые возможности!',
                    '${firstName}, новая неделя — новый старт!',
                    'Понедельник — идеальный старт для целей!'
                ]), ctx),
                details: 'Исследования показывают: люди, которые планируют питание в понедельник, на 30% успешнее достигают целей. Запиши план на неделю!',
                type: 'tip',
                priority: 5,
                category: 'motivation',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (specialDay === 'friday_evening') {
            advices.push({
                id: 'friday_reminder',
                icon: '🎯',
                text: 'Выходные близко — помни о своих целях!',
                details: 'В выходные легко переесть на 500-1000 ккал. Совет: позволь себе 1 "свободный" приём, но остальные держи в норме.',
                type: 'tip',
                priority: 10,
                category: 'motivation',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (specialDay === 'sunday_evening') {
            advices.push({
                id: 'sunday_planning',
                icon: '📋',
                text: 'Спланируй питание на неделю',
                details: 'Meal prep в воскресенье экономит 3-5 часов в неделю. Приготовь базу: крупы, мясо, овощи — комбинируй в разные блюда.',
                type: 'tip',
                priority: 10,
                category: 'motivation',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const today = new Date();
        const dayOfMonth = today.getDate();
        const monthOfYear = today.getMonth();
        const postHolidayDates = [
            [1, 0], [2, 0],
            [24, 1],
            [9, 2],
            [10, 4],
            [13, 5]
        ];
        const isPostHoliday = postHolidayDates.some(([d, m]) => d === dayOfMonth && m === monthOfYear);

        if (isPostHoliday && !sessionStorage.getItem('heys_post_holiday')) {
            advices.push({
                id: 'post_holiday_detox',
                icon: '🌿',
                text: 'После вчерашнего праздника — лёгкий день: овощи, вода, белок',
                details: 'Не нужно голодать! Просто выбери лёгкую еду: салаты, рыба на пару, много воды. Организм сам восстановит баланс за 1-2 дня.',
                type: 'tip',
                priority: 15,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 6000,
                onShow: () => { try { sessionStorage.setItem('heys_post_holiday', '1'); } catch (e) { } }
            });
        }

        // Best day recall
        const lastBestDayCheck = localStorage.getItem('heys_best_day_last_check');
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        if (!lastBestDayCheck || +lastBestDayCheck < weekAgo) {
            const recentDays = helpers.getRecentDays(7);

            if (recentDays.length >= 3) {
                let bestDay = null;
                let bestDiff = Infinity;

                for (const d of recentDays) {
                    const dayMeals = d.meals || [];
                    let dayKcal = 0;
                    for (const meal of dayMeals) {
                        for (const item of (meal.items || [])) {
                            const product = helpers.getProductForItem(item, pIndex);
                            if (product) dayKcal += (product.kcal100 || 0) * (item.grams || 100) / 100;
                        }
                    }

                    const ratio = dayKcal / (optimum || 2000);
                    const diff = Math.abs(ratio - 1.0);

                    if (diff < bestDiff && ratio > 0.5) {
                        bestDiff = diff;
                        bestDay = { ...d, ratio };
                    }
                }

                if (bestDay && bestDiff < 0.15) {
                    const dayDate = new Date(bestDay.date);
                    const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
                    const dayName = dayNames[dayDate.getDay()];
                    const pct = Math.round(bestDay.ratio * 100);

                    advices.push({
                        id: 'best_day_recall',
                        icon: '⭐',
                        text: `Твой лучший день был ${dayName} — ${pct}% нормы. Повтори!`,
                        details: '💡 Вспомни, что ты ел в тот день. Хорошие паттерны стоит повторять!',
                        type: 'motivation',
                        priority: 44,
                        category: 'motivation',
                        triggers: ['tab_open'],
                        ttl: 6000,
                        onShow: () => {
                            try { localStorage.setItem('heys_best_day_last_check', Date.now().toString()); } catch (e) { }
                        }
                    });
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 🏆 Achievements & streaks
        // ─────────────────────────────────────────────────────────

        if (currentStreak >= 7 && !sessionStorage.getItem('heys_streak7')) {
            advices.push({
                id: 'streak_7',
                icon: '🏆',
                text: helpers.personalizeText(helpers.pickRandomText([
                    `Невероятно! ${currentStreak} дней в норме!`,
                    '${firstName}, ты легенда! ' + currentStreak + ' дней подряд!',
                    `🔥 ${currentStreak} дней streak! Так держать!`
                ]), ctx),
                details: '🌟 Это значит, что ты уже сформировал привычку! Исследования показывают: 21 день — и правильное питание станет автоматическим.',
                type: 'achievement',
                priority: 1,
                category: 'achievement',
                score: 1.0,
                triggers: ['tab_open'],
                ttl: 7000,
                showConfetti: true,
                canSkipCooldown: true,
                excludes: ['streak_3'],
                onShow: () => { try { sessionStorage.setItem('heys_streak7', '1'); } catch (e) { } }
            });
        }

        if (currentStreak >= 3 && currentStreak < 7 && !sessionStorage.getItem('heys_streak3')) {
            advices.push({
                id: 'streak_3',
                icon: '🔥',
                text: `${currentStreak} дня подряд в норме! Так держать!`,
                details: '💪 Ты на пути к привычке! Ещё 4 дня — и будет недельный streak. Каждый день в норме — это инвестиция в здоровье.',
                type: 'achievement',
                priority: 2,
                category: 'achievement',
                score: 0.9,
                triggers: ['tab_open'],
                ttl: 5000,
                onShow: () => { try { sessionStorage.setItem('heys_streak3', '1'); } catch (e) { } }
            });
        }

        if (hour >= 18 && helpers.isInTargetRange(kcalPct, goal) &&
            proteinPct >= 0.9 && ctx.fatPct >= 0.9 && ctx.carbsPct >= 0.9) {
            advices.push({
                id: 'perfect_day',
                icon: '⭐',
                text: goal.mode === 'bulk'
                    ? 'Идеальный день набора! 💪🎉'
                    : goal.mode === 'deficit'
                        ? 'Идеальный дефицит с балансом БЖУ! 🔥🎉'
                        : 'Идеальный баланс! Отличная работа 🎉',
                details: '🌟 Калории, белки, жиры и углеводы — всё в норме. Такие дни приближают тебя к цели. Запомни, что ел сегодня!',
                type: 'achievement',
                priority: 5,
                category: 'achievement',
                score: 1.0,
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (mealCount === 1 && !localStorage.getItem('heys_first_meal_tip')) {
            advices.push({
                id: 'first_day',
                icon: '👋',
                text: 'Отличное начало! Записывай всё — это ключ к успеху',
                details: '📊 Исследования: люди, которые записывают еду, худеют в 2 раза эффективнее. Записывай сразу после еды — так точнее.',
                type: 'achievement',
                priority: 3,
                category: 'achievement',
                score: 1.0,
                triggers: ['product_added'],
                ttl: 5000,
                onShow: () => { try { localStorage.setItem('heys_first_meal_tip', '1'); } catch (e) { } }
            });
        }

        if (proteinPct >= rules.THRESHOLDS.protein.champion && !sessionStorage.getItem('heys_protein_champion')) {
            advices.push({
                id: 'protein_champion',
                icon: '🏆',
                text: helpers.personalizeText(helpers.pickRandomText([
                    'Белковый чемпион! Мышцы тебя благодарят',
                    '${firstName}, ты белковый чемпион! 🏆',
                    'Белка больше нормы — мышцы рады!'
                ]), ctx),
                details: '💪 Белок 1.5-2г/кг — идеально для роста мышц и восстановления. Переизбыток белка безопасен для здоровых людей.',
                type: 'achievement',
                priority: 10,
                category: 'achievement',
                triggers: ['tab_open', 'product_added'],
                ttl: 5000,
                excludes: ['protein_low', 'post_training_protein'],
                onShow: () => { try { sessionStorage.setItem('heys_protein_champion', '1'); } catch (e) { } }
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🌞 Lifestyle tips
        // ─────────────────────────────────────────────────────────

        const sleepHours = helpers.calculateSleepHours(day);
        if (sleepHours > 0 && sleepHours < 6) {
            advices.push({
                id: 'sleep_low',
                icon: '😴',
                text: 'Мало сна — аппетит может быть повышен',
                details: '💤 Недосып повышает грелин (гормон голода) и снижает лептин (сытость). Сегодня будет хотеться есть больше — это нормально.',
                type: 'tip',
                priority: 51,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (hour >= 7 && hour < 10 && mealCount === 0) {
            advices.push({
                id: 'morning_breakfast',
                icon: '☀️',
                text: 'Доброе утро! Не забудь позавтракать',
                details: '🍳 Завтрак запускает метаболизм и даёт энергию. Идеально: белок + сложные углеводы (яйца + овсянка, творог + фрукты).',
                type: 'tip',
                priority: 52,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (hour >= 10 && hour < 12 && mealCount === 0 && !sessionStorage.getItem('heys_morning_breakfast_shown')) {
            advices.push({
                id: 'empty_stomach_late',
                icon: '🍳',
                text: `Уже ${hour}:00, а завтрака нет — метаболизм ждёт топлива`,
                details: '⚠️ Пропуск завтрака может привести к перееданию вечером. Если не голоден — хотя бы лёгкий перекус.',
                type: 'tip',
                priority: 53,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000,
                onShow: () => { try { sessionStorage.setItem('heys_morning_breakfast_shown', '1'); } catch (e) { } }
            });
        }

        if (hour === 13 && mealCount === 1) {
            advices.push({
                id: 'lunch_time',
                icon: '🍽️',
                text: 'Час дня — идеальное время для обеда!',
                details: '🌞 Обед должен быть самым плотным приёмом дня (35-40% калорий). Идеально: белок + сложные углеводы + овощи.',
                type: 'tip',
                priority: 52,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (hour === 16 && kcalPct < 0.6) {
            const remaining = Math.round((optimum || 2000) * (1 - kcalPct));
            advices.push({
                id: 'snack_window',
                icon: '🥪',
                text: `16:00 — время полдника. Осталось ~${remaining} ккал`,
                details: '🍏 Полдник помогает не переесть за ужином. Идеи: орехи, яблоко, греческий йогурт, творог.',
                type: 'tip',
                priority: 51,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const steps = day?.steps || 0;
        if (steps >= 10000) {
            advices.push({
                id: 'steps_goal',
                icon: '🚶',
                text: `${steps.toLocaleString()} шагов! Отличная активность`,
                details: '🎯 10 000 шагов сжигают ~400-500 ккал и улучшают сердечно-сосудистую систему. Это твой ежедневный бонус!',
                type: 'achievement',
                priority: 53,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const isWeekend = [0, 6].includes(new Date().getDay());
        if (isWeekend && kcalPct > goal.targetRange.max && !helpers.isCriticallyOver(kcalPct, goal) && goal.mode !== 'bulk') {
            advices.push({
                id: 'weekend_relax',
                icon: '🛋️',
                text: 'Выходной расслабляешься — это нормально',
                details: '🎉 Лёгкий перебор в выходные — это ОК! Главное — средняя за неделю. Наслаждайся без чувства вины.',
                type: 'tip',
                priority: 86,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // ❄️ Seasonal tips
        // ─────────────────────────────────────────────────────────

        const month = new Date().getMonth();
        for (const seasonal of SEASONAL_TIPS) {
            if (seasonal.months.includes(month) && !sessionStorage.getItem('heys_seasonal_' + seasonal.id)) {
                advices.push({
                    id: seasonal.id,
                    icon: seasonal.icon,
                    text: helpers.personalizeText(helpers.pickRandomText(seasonal.texts), ctx),
                    type: 'tip',
                    priority: seasonal.priority,
                    category: seasonal.category,
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_seasonal_' + seasonal.id, '1'); } catch (e) { } }
                });
                break;
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📈 Caloric excess & circadian context
        // ─────────────────────────────────────────────────────────

        const hasExcess = caloricDebt?.hasExcess;
        const cardioRec = caloricDebt?.cardioRecommendation;
        const activityCompensation = caloricDebt?.activityCompensation || 0;
        const dailyReduction = caloricDebt?.dailyReduction || 0;

        if (hasExcess && cardioRec && !cardioRec.compensatedBySteps && hour >= 14) {
            advices.push({
                id: 'excess_activity_recommended',
                icon: '✨',
                text: `Лучший способ: ${cardioRec.text}`,
                details: `🏃 Активность эффективнее ограничений! ${cardioRec.minutes} мин ${cardioRec.activityIcon} компенсирует ~${activityCompensation} ккал (70% профицита). Это здоровый подход без стресса.`,
                type: 'tip',
                priority: 26,
                category: 'activity',
                triggers: ['tab_open'],
                ttl: 6000
            });
        }

        if (hasExcess && cardioRec?.compensatedBySteps) {
            advices.push({
                id: 'excess_compensated_by_steps',
                icon: '👟',
                text: `Шаги компенсируют перебор на ${cardioRec.stepsCompensation}%!`,
                details: `🎉 Твоя активность уже сделала работу! ${day?.steps || 0} шагов частично компенсировали профицит. Продолжай в том же духе.`,
                type: 'achievement',
                priority: 12,
                category: 'achievement',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (dailyReduction > 50 && !caloricDebt?.hasDebt && hour < 14) {
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

        const rawDebt = caloricDebt?.rawDebt || caloricDebt?.debt || 0;
        if (caloricDebt?.hasDebt && hour < 12 && rawDebt < 600) {
            advices.push({
                id: 'circadian_morning_calm',
                icon: '🌅',
                text: 'Утро — ещё рано подводить итоги',
                details: '⏰ Недобор сейчас — норма. День впереди! Фокусируйся на качественном завтраке с белком, а не на цифрах.',
                type: 'tip',
                priority: 50,
                category: 'lifestyle',
                triggers: ['tab_open'],
                ttl: 4000
            });
        }

        if (caloricDebt?.hasDebt && hour >= 20 && rawDebt > 500) {
            advices.push({
                id: 'circadian_evening_urgent',
                icon: '🌙',
                text: 'Вечер — нужно поесть до сна',
                details: '⚠️ Большой недобор перед сном ухудшит качество сна и повысит грелин завтра. Съешь хотя бы 200-300 ккал белкового перекуса.',
                type: 'warning',
                priority: 19,
                category: 'timing',
                triggers: ['tab_open'],
                ttl: 6000
            });
        }

        const bmiCtx = caloricDebt?.bmiContext;
        if (bmiCtx && caloricDebt?.hasDebt && bmiCtx.category === 'underweight') {
            advices.push({
                id: 'bmi_underweight_warning',
                icon: '⚠️',
                text: 'Вес ниже нормы — недоедание опасно!',
                details: '🩺 При BMI < 18.5 недобор калорий особенно критичен. Восстановление ускорено на 30%. Приоритет: набрать норму!',
                type: 'warning',
                priority: 13,
                category: 'health',
                triggers: ['tab_open'],
                ttl: 8000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🔄 Refeed day tips
        // ─────────────────────────────────────────────────────────

        if (window.HEYS?.Refeed?.getRefeedAdvices) {
            const refeedAdvices = window.HEYS.Refeed.getRefeedAdvices({
                isRefeedDay: day?.isRefeedDay,
                refeedReason: day?.refeedReason,
                caloricDebt: caloricDebt,
                eatenKcal: dayTot?.kcal || 0,
                optimum: optimum,
                hour: hour
            });
            advices.push(...refeedAdvices);
        }

        // ─────────────────────────────────────────────────────────
        // 📊 Weight trends & forecast
        // ─────────────────────────────────────────────────────────

        const recentDaysForWeight = helpers.getRecentDays(7);
        const weightsForTrend = recentDaysForWeight.map(d => d.weightMorning).filter(w => w > 0);

        if (weightsForTrend.length >= 3) {
            const firstAvg = weightsForTrend.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
            const lastAvg = weightsForTrend.slice(-3).reduce((a, b) => a + b, 0) / 3;
            const trendPerWeek = ((lastAvg - firstAvg) / weightsForTrend.length) * 7;
            const weightGoal = prof?.weightGoal;
            const currentWeight = day?.weightMorning || weightsForTrend[weightsForTrend.length - 1];
            const hasWeightGoal = Number.isFinite(weightGoal) && weightGoal > 0 && Number.isFinite(currentWeight) && currentWeight > 0;
            const aimingToLose = goal?.mode === 'deficit' || (hasWeightGoal && currentWeight > weightGoal + 0.5);
            const aimingToGain = goal?.mode === 'bulk' || (hasWeightGoal && currentWeight < weightGoal - 0.5);
            const aimingToMaintain = goal?.mode === 'maintenance' || (!aimingToLose && !aimingToGain);
            const trendLabel = `${trendPerWeek > 0 ? '+' : ''}${trendPerWeek.toFixed(1)} кг/нед`;
            const trendMagnitude = Math.abs(trendPerWeek);

            if (trendPerWeek < -0.3 && !sessionStorage.getItem('heys_weight_trend_down')) {
                let weightTrendDownAdvice;

                if (aimingToGain) {
                    weightTrendDownAdvice = {
                        icon: '📉',
                        text: 'Вес снижается — проверь калории и восстановление',
                        details: `⚠️ Текущий тренд ${trendLabel}. Для набора это сигнал: возможно, профицит слишком маленький или не хватает восстановления.`,
                        type: 'warning',
                        priority: 7
                    };
                } else if (aimingToMaintain) {
                    weightTrendDownAdvice = {
                        icon: '📉',
                        text: 'Вес снижается — проверь баланс калорий',
                        details: `⚠️ Текущий тренд ${trendLabel}. Если цель — поддержание, стоит немного поднять калораж или проверить активность.`,
                        type: 'warning',
                        priority: 7
                    };
                } else if (trendMagnitude > 1.0) {
                    weightTrendDownAdvice = {
                        icon: '📉',
                        text: 'Вес снижается слишком быстро — проверь дефицит',
                        details: `⚠️ Текущий тренд ${trendLabel}. Слишком резкое снижение веса часто означает слишком жёсткий дефицит и риск потери мышц.`,
                        type: 'warning',
                        priority: 7
                    };
                } else {
                    weightTrendDownAdvice = {
                        icon: '📉',
                        text: 'Вес снижается в нужную сторону',
                        details: `📉 Текущий тренд ${trendLabel}. Для снижения веса это рабочий темп — продолжай держать план.`,
                        type: 'achievement',
                        priority: 6
                    };
                }

                advices.push({
                    id: 'weight_trend_down',
                    ...weightTrendDownAdvice,
                    category: 'weight',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_weight_trend_down', '1'); } catch (e) { } }
                });
            }

            if (trendPerWeek > 0.5 && !sessionStorage.getItem('heys_weight_trend_up')) {
                let weightTrendUpAdvice;

                if (aimingToGain && trendPerWeek <= 1.0) {
                    weightTrendUpAdvice = {
                        icon: '📈',
                        text: 'Вес растёт в нужную сторону',
                        details: `📈 Текущий тренд ${trendLabel}. Для набора это выглядит рабочим темпом, если самочувствие и замеры тоже ок.`,
                        type: 'achievement',
                        priority: 6
                    };
                } else if (aimingToGain) {
                    weightTrendUpAdvice = {
                        icon: '📈',
                        text: 'Вес растёт слишком быстро — проверь профицит',
                        details: `⚠️ Текущий тренд ${trendLabel}. Для набора слишком быстрый рост чаще означает лишний жир, а не только мышцы.`,
                        type: 'warning',
                        priority: 7
                    };
                } else if (aimingToMaintain) {
                    weightTrendUpAdvice = {
                        icon: '📈',
                        text: 'Вес растёт — проверь баланс калорий',
                        details: `⚠️ Текущий тренд ${trendLabel}. Если цель — удержание веса, проверь калораж, напитки и скрытые перекусы.`,
                        type: 'warning',
                        priority: 7
                    };
                } else {
                    weightTrendUpAdvice = {
                        icon: '📈',
                        text: 'Вес растёт — проверь калории и перекусы',
                        details: `⚠️ Текущий тренд ${trendLabel}. При цели снижения веса это сигнал пересмотреть калораж, напитки и перекусы.`,
                        type: 'warning',
                        priority: 7
                    };
                }

                advices.push({
                    id: 'weight_trend_up',
                    ...weightTrendUpAdvice,
                    category: 'weight',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_weight_trend_up', '1'); } catch (e) { } }
                });
            }

            if (weightGoal && currentWeight && Math.abs(currentWeight - weightGoal) > 0.5) {
                const deficitPct = Math.abs(prof?.deficitPctTarget || day?.deficitPct || 10);
                const rateKgPerWeek = (deficitPct / 100) * currentWeight * 0.8;
                const weightDiff = currentWeight - weightGoal;
                const actualRatePerWeek = (trendPerWeek !== 0) ? Math.abs(trendPerWeek) : rateKgPerWeek;
                const isGoingRight = (weightDiff > 0 && trendPerWeek < 0) || (weightDiff < 0 && trendPerWeek > 0);

                if (isGoingRight && actualRatePerWeek > 0.1) {
                    const weeksToGoal = Math.ceil(Math.abs(weightDiff) / actualRatePerWeek);

                    if (weeksToGoal <= 52) {
                        const goalDate = new Date();
                        goalDate.setDate(goalDate.getDate() + weeksToGoal * 7);
                        const goalDateStr = goalDate.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' });

                        advices.push({
                            id: 'weight_forecast_on_track',
                            icon: '🎯',
                            text: `По прогнозу ${weightGoal}кг — к ${goalDateStr}`,
                            details: `📊 При текущем темпе (${actualRatePerWeek.toFixed(1)} кг/нед) цель в ${weightGoal}кг будет достигнута через ~${weeksToGoal} нед. Продолжай!`,
                            type: 'achievement',
                            priority: rules.PRIORITY.ACHIEVEMENT,
                            category: 'weight',
                            triggers: ['tab_open'],
                            ttl: 6000
                        });
                    } else {
                        advices.push({
                            id: 'weight_forecast_slow',
                            icon: '🐢',
                            text: `Темп медленный — цель далеко (>${Math.round(weeksToGoal / 4)} мес)`,
                            details: `⏰ При ${actualRatePerWeek.toFixed(1)} кг/нед до ${weightGoal}кг — более ${Math.round(weeksToGoal / 4)} месяцев. Можно увеличить дефицит или добавить активности.`,
                            type: 'tip',
                            priority: rules.PRIORITY.LOW,
                            category: 'weight',
                            triggers: ['tab_open'],
                            ttl: 6000
                        });
                    }
                }

                if (!isGoingRight && Math.abs(trendPerWeek) > 0.2) {
                    advices.push({
                        id: 'weight_forecast_wrong_direction',
                        icon: '⚠️',
                        text: 'Вес идёт от цели — проверь план',
                        details: `🔄 Цель ${weightGoal}кг, но тренд ${trendPerWeek > 0 ? '+' : ''}${trendPerWeek.toFixed(1)} кг/нед. Пересмотри калории или добавь активности.`,
                        type: 'warning',
                        priority: rules.PRIORITY.IMPORTANT,
                        category: 'weight',
                        triggers: ['tab_open'],
                        ttl: 6000
                    });
                }

                if (Math.abs(weightDiff) < 2) {
                    advices.push({
                        id: 'weight_almost_there',
                        icon: '🏁',
                        text: `До цели ${Math.abs(weightDiff).toFixed(1)}кг — финишная прямая!`,
                        details: `🎯 Осталось меньше 2кг до ${weightGoal}кг! Финиш близко — не сбавляй темп!`,
                        type: 'achievement',
                        priority: rules.PRIORITY.ACHIEVEMENT - 1,
                        category: 'weight',
                        triggers: ['tab_open'],
                        ttl: 6000
                    });
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📏 Measurements insights
        // ─────────────────────────────────────────────────────────

        const getMeasurementsHistory = window.HEYS?.Steps?.getMeasurementsHistory;
        if (typeof getMeasurementsHistory === 'function') {
            const measurementsHistory = getMeasurementsHistory(30);

            if (measurementsHistory && measurementsHistory.length >= 2) {
                const latest = measurementsHistory[0];
                const oldest = measurementsHistory[measurementsHistory.length - 1];

                const waistChange = (latest.waist && oldest.waist) ? latest.waist - oldest.waist : null;
                const bicepsChange = (latest.biceps && oldest.biceps) ? latest.biceps - oldest.biceps : null;

                if (waistChange !== null && waistChange < -1 && !sessionStorage.getItem('heys_waist_down')) {
                    advices.push({
                        id: 'waist_down_progress',
                        icon: '📏',
                        text: `Талия -${Math.abs(waistChange).toFixed(1)} см за месяц! Прогресс`,
                        details: '🏆 Уменьшение талии = уход висцерального жира. Это важнее цифры на весах!',
                        type: 'achievement',
                        priority: 5,
                        category: 'measurements',
                        triggers: ['tab_open'],
                        ttl: 6000,
                        showConfetti: true,
                        onShow: () => { try { sessionStorage.setItem('heys_waist_down', '1'); } catch (e) { } }
                    });
                }

                if (bicepsChange !== null && bicepsChange > 0.5 && !sessionStorage.getItem('heys_biceps_up')) {
                    advices.push({
                        id: 'biceps_growing',
                        icon: '💪',
                        text: `Бицепс +${bicepsChange.toFixed(1)} см! Мышцы растут`,
                        details: '💪 Рост мышц = правильные тренировки + достаточно белка. Продолжай!',
                        type: 'achievement',
                        priority: 6,
                        category: 'measurements',
                        triggers: ['tab_open'],
                        ttl: 5000,
                        onShow: () => { try { sessionStorage.setItem('heys_biceps_up', '1'); } catch (e) { } }
                    });
                }

                const weightGoal = prof?.weightGoal || 0;
                const currentWeight = day?.weightMorning || prof?.weight || 0;

                if (weightGoal > 0 && currentWeight > 0 && waistChange !== null) {
                    const weightDiff = currentWeight - weightGoal;
                    if (weightDiff > 0 && waistChange < -0.5 && !sessionStorage.getItem('heys_weight_waist_corr')) {
                        advices.push({
                            id: 'weight_waist_correlation',
                            icon: '📊',
                            text: `Талия -${Math.abs(waistChange).toFixed(1)} см = приближение к цели`,
                            details: `🎯 До цели ${weightDiff.toFixed(1)} кг. Талия уменьшается — значит жир уходит!`,
                            type: 'insight',
                            priority: 8,
                            category: 'correlation',
                            triggers: ['tab_open'],
                            ttl: 6000,
                            onShow: () => { try { sessionStorage.setItem('heys_weight_waist_corr', '1'); } catch (e) { } }
                        });
                    }

                    if (weightDiff < -2 && bicepsChange !== null && bicepsChange > 0.3 && !sessionStorage.getItem('heys_bulk_corr')) {
                        advices.push({
                            id: 'bulk_muscle_correlation',
                            icon: '🏋️',
                            text: 'Вес выше цели, но мышцы растут — это нормально',
                            details: '💡 Набор мышц = набор веса. Отслеживай замеры, не только весы.',
                            type: 'insight',
                            priority: 9,
                            category: 'correlation',
                            triggers: ['tab_open'],
                            ttl: 5000,
                            onShow: () => { try { sessionStorage.setItem('heys_bulk_corr', '1'); } catch (e) { } }
                        });
                    }
                }

                const lastMeasuredDate = latest?.measuredAt;
                if (lastMeasuredDate) {
                    const daysSinceMeasured = Math.floor((Date.now() - new Date(lastMeasuredDate).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSinceMeasured >= 14 && !sessionStorage.getItem('heys_measure_reminder')) {
                        advices.push({
                            id: 'measure_reminder',
                            icon: '📐',
                            text: `${daysSinceMeasured} дней без замеров — пора измериться`,
                            details: '📏 Еженедельные замеры помогают отслеживать реальный прогресс, а не только вес.',
                            type: 'tip',
                            priority: 15,
                            category: 'measurements',
                            triggers: ['tab_open'],
                            ttl: 5000,
                            onShow: () => { try { sessionStorage.setItem('heys_measure_reminder', '1'); } catch (e) { } }
                        });
                    }
                }
            }

            if (measurementsHistory && measurementsHistory.length === 1 && !helpers.isMilestoneShown('first_measurement')) {
                advices.push({
                    id: 'first_measurement',
                    icon: '📏',
                    text: 'Первый замер сделан! Отслеживай прогресс',
                    details: '🎯 Замеры тела точнее показывают изменения, чем весы. Измеряйся раз в неделю.',
                    type: 'achievement',
                    priority: 4,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 6000,
                    showConfetti: true,
                    onShow: () => helpers.markMilestoneShown('first_measurement')
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📊 Behavioral patterns
        // ─────────────────────────────────────────────────────────

        const recentForTraining = helpers.getRecentDays(3); // 3 дня для проверки
        const todayHasTraining = (day?.trainings || []).some(t => t.z?.some(m => m > 0));
        if (todayHasTraining && recentForTraining.length >= 3 && !sessionStorage.getItem('heys_workout_consistent')) {
            const allThreeHaveTraining = recentForTraining.every(d =>
                (d.trainings || []).some(t => t.z?.some(m => m > 0))
            );

            if (allThreeHaveTraining) {
                advices.push({
                    id: 'workout_consistent',
                    icon: '🔥',
                    text: '3 дня тренировок подряд! Ты машина 💪',
                    details: '🎯 Регулярность важнее интенсивности. 3 дня подряд = привычка формируется!',
                    type: 'achievement',
                    priority: 7,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_workout_consistent', '1'); } catch (e) { } }
                });
            }
        }

        const lastEvensCheck = localStorage.getItem('heys_evening_snacker_check');
        const weekAgoPattern = Date.now() - 7 * 24 * 60 * 60 * 1000;

        if (!lastEvensCheck || +lastEvensCheck < weekAgoPattern) {
            const recentForPattern = helpers.getRecentDays(3);

            if (recentForPattern.length >= 3) {
                const allLateEaters = recentForPattern.every(d => {
                    const dayMeals = (d.meals || []).filter(m => m.items?.length > 0);
                    if (dayMeals.length === 0) return false;
                    const times = dayMeals.map(m => m.time || '12:00').sort();
                    const lastTime = times[times.length - 1];
                    const [h] = lastTime.split(':').map(Number);
                    return h >= 22;
                });

                if (allLateEaters) {
                    advices.push({
                        id: 'evening_snacker',
                        icon: '🌙',
                        text: 'Заметил тренд — ты часто ужинаешь поздно. Может, перекус раньше?',
                        details: '💡 Поздние ужины ухудшают сон и метаболизм. Попробуй ужинать до 20:00.',
                        type: 'insight',
                        priority: 38,
                        category: 'correlation',
                        triggers: ['tab_open'],
                        ttl: 6000,
                        onShow: () => {
                            try { localStorage.setItem('heys_evening_snacker_check', Date.now().toString()); } catch (e) { }
                        }
                    });
                }
            }
        }

        const lastSkipCheck = localStorage.getItem('heys_morning_skipper_check');
        if (!lastSkipCheck || +lastSkipCheck < weekAgoPattern) {
            const recentForSkip = helpers.getRecentDays(3);

            if (recentForSkip.length >= 3) {
                const allSkipBreakfast = recentForSkip.every(d => {
                    const dayMeals = (d.meals || []).filter(m => m.items?.length > 0);
                    if (dayMeals.length === 0) return true;
                    const times = dayMeals.map(m => m.time || '12:00').sort();
                    const firstTime = times[0];
                    const [h] = firstTime.split(':').map(Number);
                    return h >= 11;
                });

                if (allSkipBreakfast) {
                    advices.push({
                        id: 'morning_skipper',
                        icon: '🤔',
                        text: 'Уже 3 дня без раннего завтрака — экспериментируешь с интервальным голоданием?',
                        details: '🥐 Если 16/8 — отлично! Если нет — завтрак запускает метаболизм.',
                        type: 'insight',
                        priority: 39,
                        category: 'correlation',
                        triggers: ['tab_open'],
                        ttl: 6000,
                        onShow: () => {
                            try { localStorage.setItem('heys_morning_skipper_check', Date.now().toString()); } catch (e) { }
                        }
                    });
                }
            }
        }

        const lastUnderCheck = localStorage.getItem('heys_chronic_undereating_check');
        if (!lastUnderCheck || +lastUnderCheck < weekAgoPattern) {
            const recentForUnder = helpers.getRecentDays(3);

            if (recentForUnder.length >= 3) {
                const underEatingDays = recentForUnder.filter(d => {
                    const dayMeals = (d.meals || []).filter(m => m.items?.length > 0);
                    if (dayMeals.length === 0) return false;

                    let dayKcal = 0;
                    for (const meal of dayMeals) {
                        for (const item of meal.items || []) {
                            const product = helpers.getProductForItem(item, pIndex);
                            if (product) {
                                const grams = item.grams || 100;
                                dayKcal += (product.kcal100 || 0) * grams / 100;
                            }
                        }
                    }

                    const dayRatio = dayKcal / (optimum || 2000);
                    return dayRatio < 0.75;
                });

                if (underEatingDays.length >= 3) {
                    advices.push({
                        id: 'chronic_undereating_pattern',
                        icon: '🚨',
                        text: 'Уже 3+ дней подряд сильный недобор — это опасно для здоровья',
                        details: `🔬 Хронический дефицит (>25% от нормы) вызывает:\n\n` +
                            `• Метаболическую адаптация — организм замедляет обмен веществ\n` +
                            `• Потерю мышечной массы (тело расщепляет мышцы для энергии)\n` +
                            `• Гормональные нарушения (щитовидка, кортизол, половые гормоны)\n` +
                            `• Выпадение волос (телогеновая алопеция)\n\n` +
                            `💡 Совет: либо увеличь порции, либо проверь что норма рассчитана правильно в профиле.`,
                        type: 'warning',
                        priority: 3,
                        category: 'correlation',
                        triggers: ['tab_open'],
                        ttl: 10000,
                        onShow: () => {
                            try { localStorage.setItem('heys_chronic_undereating_check', Date.now().toString()); } catch (e) { }
                        }
                    });
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 👤 Personalized tips (gender/age/cycle)
        // ─────────────────────────────────────────────────────────

        const isFemale = prof?.gender === 'Женский';
        if (isFemale && mealCount >= 2) {
            const ironRichKeywords = ['мясо', 'печень', 'говядина', 'гречка', 'шпинат', 'чечевица'];
            const allItemsP = (day?.meals || []).flatMap(m => m.items || []);
            const hasIronRichFood = allItemsP.some(item => {
                const product = helpers.getProductForItem(item, pIndex);
                const name = (product?.name || item.name || '').toLowerCase();
                return ironRichKeywords.some(kw => name.includes(kw));
            });

            if (!hasIronRichFood && !sessionStorage.getItem('heys_iron_tip_today')) {
                advices.push({
                    id: 'iron_reminder',
                    icon: '🩸',
                    text: 'Не забывай о железе — мясо, печень, гречка',
                    details: '🦸‍♀️ Женщинам нужно 18мг железа/день (мужчинам 8мг). Лидеры: печень, красное мясо, чечевица, шпинат.',
                    type: 'tip',
                    priority: 55,
                    category: 'personalized',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_iron_tip_today', '1'); } catch (e) { } }
                });
            }
        }

        const cycleDay = day?.cycleDay || null;
        const cyclePhase = window.HEYS?.Cycle?.getCyclePhase?.(cycleDay);
        const allItemsCycle = (day?.meals || []).flatMap(m => m.items || []);

        if (cyclePhase?.id === 'menstrual' && ctx.simplePct > 1.0) {
            advices.push({
                id: 'cycle_sweet_craving',
                icon: '🌸',
                text: 'Тяга к сладкому — норма в этот период',
                details: '🧬 Гормональные изменения вызывают тягу к углеводам. Лучше выбери тёмный шоколад или фрукты.',
                type: 'tip',
                priority: 58,
                category: 'personalized',
                triggers: ['product_added', 'tab_open'],
                ttl: 5000
            });
        }

        if (cyclePhase?.id === 'menstrual') {
            const ironKeywords = ['печень', 'говядин', 'гранат', 'гречк', 'чечевиц', 'шпинат', 'индейк'];
            const hasIron = allItemsCycle.some(item => {
                const product = helpers.getProductForItem(item, pIndex);
                const name = (product?.name || item.name || '').toLowerCase();
                return ironKeywords.some(kw => name.includes(kw));
            });

            if (!hasIron && mealCount >= 2) {
                advices.push({
                    id: 'cycle_iron_important',
                    icon: '🩸',
                    text: 'Сейчас железо особенно важно',
                    details: '💪 В период менструации потери железа увеличиваются. Добавь печень, гречку или гранат.',
                    type: 'tip',
                    priority: 57,
                    category: 'personalized',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }
        }

        if (cyclePhase?.id === 'menstrual' && cycleDay <= 2 && !day.trainings?.length) {
            advices.push({
                id: 'cycle_rest_ok',
                icon: '🧘',
                text: 'Отдых сегодня — правильный выбор',
                details: '✨ В первые дни цикла энергия снижена. Лёгкая йога или прогулка лучше интенсивной тренировки.',
                type: 'support',
                priority: 56,
                category: 'personalized',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (cyclePhase?.id === 'menstrual' && ctx.waterPct < 0.7) {
            advices.push({
                id: 'cycle_hydration',
                icon: '💧',
                text: 'Сейчас вода особенно нужна',
                details: '🌊 Организм теряет жидкость. Вода помогает с самочувствием и уменьшает отёки.',
                type: 'tip',
                priority: 56,
                category: 'hydration',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (cyclePhase?.id === 'follicular' && !sessionStorage.getItem('heys_cycle_energy_today')) {
            advices.push({
                id: 'cycle_energy_up',
                icon: '🌱',
                text: 'Энергия восстанавливается — хорошее время для тренировок',
                details: '🎯 Фолликулярная фаза — отличное время для интенсивных нагрузок и новых целей.',
                type: 'motivation',
                priority: 55,
                category: 'personalized',
                triggers: ['tab_open'],
                ttl: 5000,
                onShow: () => { try { sessionStorage.setItem('heys_cycle_energy_today', '1'); } catch (e) { } }
            });
        }

        if (cyclePhase?.id === 'ovulation' && !sessionStorage.getItem('heys_cycle_peak_today')) {
            advices.push({
                id: 'cycle_peak_performance',
                icon: '⭐',
                text: 'Пик энергии! Идеальное время для рекордов',
                details: '🏆 Дни овуляции — максимальная сила и выносливость. Используй это!',
                type: 'motivation',
                priority: 58,
                category: 'personalized',
                triggers: ['tab_open'],
                ttl: 5000,
                onShow: () => { try { sessionStorage.setItem('heys_cycle_peak_today', '1'); } catch (e) { } }
            });
        }

        if (cyclePhase && !sessionStorage.getItem('heys_cycle_thanks_shown')) {
            advices.push({
                id: 'cycle_tracking_thanks',
                icon: '🌸',
                text: 'Учитываем особый период в расчётах',
                details: '💜 Нормы воды и инсулиновая волна адаптированы под твой цикл.',
                type: 'info',
                priority: 50,
                category: 'personalized',
                triggers: ['tab_open'],
                ttl: 4000,
                onShow: () => { try { sessionStorage.setItem('heys_cycle_thanks_shown', '1'); } catch (e) { } }
            });
        }

        const age = prof?.age || 30;
        const proteinPctAge = (dayTot?.prot || 0) / ((normAbs?.prot || 100) || 1);
        if (age >= 40 && proteinPctAge < 0.9) {
            advices.push({
                id: 'age_protein',
                icon: '💪',
                text: 'После 40 важно больше белка — сохраняем мышцы',
                details: '📊 После 40 мышечная масса теряется на 3-5% за десятилетие. Белок 1.5-2г/кг + силовые тренировки = сохранение формы.',
                type: 'tip',
                priority: 54,
                category: 'personalized',
                triggers: ['product_added', 'tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🏠 Activity tips
        // ─────────────────────────────────────────────────────────

        const household = day?.householdMin || 0;
        if (household >= 60) {
            const extraKcal = Math.round(household * 3);
            advices.push({
                id: 'household_bonus',
                icon: '🏠',
                text: `${household} мин активности ≈ +${extraKcal} ккал сожжено`,
                details: '🧹 Домашние дела — это тоже активность! Уборка 60 мин = ~180 ккал.',
                type: 'info',
                priority: 50,
                category: 'activity',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const stepsDay = day?.steps || 0;
        if (household === 0 && stepsDay < 3000 && !hasTraining && hour >= 18) {
            advices.push({
                id: 'sedentary_day',
                icon: '🚶',
                text: 'Малоподвижный день — прогуляйся 15 минут',
                details: '🎯 15 минут ходьбы = ~50-70 ккал + улучшение настроения и качества сна. Даже короткая прогулка лучше, чем ничего!',
                type: 'tip',
                priority: 48,
                category: 'activity',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 💤 Sleep quality
        // ─────────────────────────────────────────────────────────

        const sleepQuality = day?.sleepQuality || 0;
        if (sleepQuality > 0 && sleepQuality <= 2 && hour < 12) {
            advices.push({
                id: 'bad_sleep_advice',
                icon: '😴',
                text: 'После плохого сна — меньше кофе, больше белка',
                details: '💡 После недосыпа организм хочет быструю энергию (сахар, кофе). Лучше: белок + сложные углеводы для стабильной энергии.',
                type: 'tip',
                priority: 26,
                category: 'sleep',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const sleepHoursQ = helpers.calculateSleepHours(day);
        if (sleepQuality >= 4 && sleepHoursQ >= 7) {
            advices.push({
                id: 'great_sleep',
                icon: '😊',
                text: 'Хорошо выспался — день будет продуктивным!',
                details: '🌟 Качественный сон = низкий кортизол и стабильный аппетит. Сегодня будет легче держать план!',
                type: 'achievement',
                priority: 46,
                category: 'sleep',
                triggers: ['tab_open'],
                ttl: 4000
            });
        }

        const recentDaysForSleep = helpers.getRecentDays(3);
        const sleepHoursRecent = recentDaysForSleep.map(d => helpers.calculateSleepHours(d)).filter(h => h > 0);
        if (sleepHoursRecent.length >= 3) {
            const allUnder6 = sleepHoursRecent.every(h => h < 6);
            if (allUnder6 && !sessionStorage.getItem('heys_sleep_debt')) {
                advices.push({
                    id: 'sleep_debt_accumulating',
                    icon: '😴',
                    text: 'Накопился недосып — сегодня ляг пораньше!',
                    details: '⚠️ 3+ дня недосыпа = нарушение гормонов. Грелин (голод) растёт, лептин (сытость) падает.',
                    type: 'warning',
                    priority: 95,
                    category: 'lifestyle',
                    triggers: ['tab_open'],
                    ttl: 6000,
                    onShow: () => { try { sessionStorage.setItem('heys_sleep_debt', '1'); } catch (e) { } }
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 🥇 Milestones
        // ─────────────────────────────────────────────────────────

        const totalDays = helpers.getTotalDaysTracked();
        if (totalDays === 7 && !helpers.isMilestoneShown('7_days')) {
            advices.push({
                id: 'milestone_7_days',
                icon: '📅',
                text: 'Неделя с HEYS! Привычка формируется',
                details: '💡 7 дней — первый рубеж! Исследования показывают: 21 день — привычка, 66 дней — автоматизм.',
                type: 'achievement',
                priority: 2,
                category: 'achievement',
                triggers: ['tab_open'],
                ttl: 8000,
                showConfetti: true,
                onShow: () => helpers.markMilestoneShown('7_days')
            });
        }

        if (totalDays === 30 && !helpers.isMilestoneShown('30_days')) {
            const firstName = prof?.firstName || '';
            advices.push({
                id: 'milestone_30_days',
                icon: '🎉',
                text: firstName ? `Месяц с HEYS, ${firstName}! Ты молодец` : 'Месяц с HEYS! Ты молодец',
                details: '🏆 30 дней = привычка сформирована! Трекинг питания стал частью твоей жизни.',
                type: 'achievement',
                priority: 1,
                category: 'achievement',
                triggers: ['tab_open'],
                ttl: 10000,
                showConfetti: true,
                onShow: () => helpers.markMilestoneShown('30_days')
            });
        }

        if (totalDays === 100 && !helpers.isMilestoneShown('100_days')) {
            advices.push({
                id: 'milestone_100_days',
                icon: '🏆',
                text: '100 дней! Ты легенда',
                details: '🌟 100 дней трекинга — это уровень мастера! Ты в топ-1% пользователей.',
                type: 'achievement',
                priority: 1,
                category: 'achievement',
                triggers: ['tab_open'],
                ttl: 12000,
                showConfetti: true,
                onShow: () => helpers.markMilestoneShown('100_days')
            });
        }

        if (currentStreak > 0) {
            const isNewRecord = helpers.updatePersonalBestStreak(currentStreak);
            if (isNewRecord && currentStreak >= 3 && !sessionStorage.getItem('heys_new_record')) {
                advices.push({
                    id: 'new_record_streak',
                    icon: '🔥',
                    text: `Рекордный streak — ${currentStreak} дней! 🔥🔥🔥`,
                    details: '🏅 Новый личный рекорд! Каждый день streak укрепляет привычку. Не сломай серию!',
                    type: 'achievement',
                    priority: 2,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 8000,
                    showConfetti: true,
                    onShow: () => { try { sessionStorage.setItem('heys_new_record', '1'); } catch (e) { } }
                });
            }
        }

        if (hasTraining && !helpers.isMilestoneShown('first_training')) {
            const historyDays = helpers.getRecentDays(30);
            const hasHistoryTraining = historyDays.some(d =>
                d.trainings?.some(t => t.z && t.z.some(m => m > 0))
            );

            if (!hasHistoryTraining) {
                advices.push({
                    id: 'first_training_ever',
                    icon: '🏃',
                    text: 'Первая тренировка в HEYS! Начало положено',
                    details: '🎯 Первая тренировка — самая тяжёлая! Теперь HEYS будет учитывать твои тренировки в расчётах.',
                    type: 'achievement',
                    priority: 3,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 8000,
                    showConfetti: true,
                    onShow: () => helpers.markMilestoneShown('first_training')
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 📅 Weekly comparison / summary / streak hint / combo
        // ─────────────────────────────────────────────────────────

        if (!sessionStorage.getItem('heys_weekly_comparison')) {
            const weekComp = helpers.getWeeklyComparison();
            if (weekComp?.message) {
                advices.push({
                    id: 'weekly_comparison',
                    icon: '📊',
                    text: weekComp.message,
                    details: '📅 Сравнение с прошлой неделей помогает видеть прогресс и тренды.',
                    type: 'achievement',
                    priority: 15,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 6000,
                    onShow: () => { try { sessionStorage.setItem('heys_weekly_comparison', '1'); } catch (e) { } }
                });
            }
        }

        if (hour >= 18 && !sessionStorage.getItem('heys_weekly_summary')) {
            const summary = helpers.getWeeklySummary();
            if (summary) {
                advices.push({
                    id: 'weekly_summary',
                    icon: '📋',
                    text: summary.message,
                    details: '📈 Анализ недели помогает увидеть паттерны и скорректировать план.',
                    type: 'insight',
                    priority: 10,
                    category: 'lifestyle',
                    triggers: ['tab_open'],
                    ttl: 8000,
                    onShow: () => { try { sessionStorage.setItem('heys_weekly_summary', '1'); } catch (e) { } }
                });
            }
        }

        if (currentStreak > 0 && currentStreak < 30 && !sessionStorage.getItem('heys_streak_hint')) {
            const milestone = helpers.getNextStreakMilestone(currentStreak);
            if (milestone && milestone.remain <= 3) {
                advices.push({
                    id: 'streak_hint',
                    icon: milestone.icon,
                    text: milestone.text,
                    details: '🔥 Каждый день в норме укрепляет привычку. Не сдавайся!',
                    type: 'motivation',
                    priority: 20,
                    category: 'gamification',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_streak_hint', '1'); } catch (e) { } }
                });
            }
        }

        if (!sessionStorage.getItem('heys_combo_checked')) {
            const combo = helpers.checkComboAchievements(ctx);
            if (combo) {
                advices.push({
                    id: 'combo_' + combo.id,
                    icon: combo.icon,
                    text: combo.text,
                    type: 'achievement',
                    priority: 5,
                    category: 'achievement',
                    triggers: ['tab_open'],
                    ttl: 8000,
                    onShow: () => {
                        helpers.markComboShown(combo.id);
                        try { sessionStorage.setItem('heys_combo_checked', '1'); } catch (e) { }
                    }
                });
            }
            try { sessionStorage.setItem('heys_combo_checked', '1'); } catch (e) { }
        }

        if (!sessionStorage.getItem('heys_smart_rec_shown')) {
            const recommendation = helpers.getSmartRecommendation(hour);
            if (recommendation) {
                advices.push({
                    id: 'smart_recommendation',
                    icon: '💡',
                    text: recommendation.message,
                    details: '🎯 Персональная рекомендация на основе твоих данных и паттернов.',
                    type: 'tip',
                    priority: 35,
                    category: 'personalized',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_smart_rec_shown', '1'); } catch (e) { } }
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 💊 Supplements advices (catalog-based)
        // ─────────────────────────────────────────────────────────

        if (window.HEYS?.Supplements) {
            const Supps = window.HEYS.Supplements;
            const dateKey = day?.date || new Date().toISOString().slice(0, 10);
            const planned = Supps.getPlanned?.() || [];
            const taken = Supps.getTaken?.(dateKey) || [];
            const notTaken = planned.filter(id => !taken.includes(id));

            if (hour >= 7 && hour <= 10 && !sessionStorage.getItem('heys_supp_morning')) {
                const morningSupps = notTaken.filter(id => {
                    const s = Supps.CATALOG?.[id];
                    return s && (s.timing === 'morning' || s.timing === 'empty');
                });

                if (morningSupps.length > 0) {
                    const names = morningSupps.slice(0, 3).map(id => Supps.CATALOG[id]?.name).join(', ');
                    advices.push({
                        id: 'supplements_morning_reminder',
                        icon: '💊',
                        text: `Утренние витамины: ${names}`,
                        details: '🌅 Натощак лучше усваиваются: B12, железо. D3 можно с завтраком.',
                        type: 'tip',
                        priority: 22,
                        category: 'supplements',
                        triggers: ['tab_open'],
                        ttl: 5000,
                        onShow: () => { try { sessionStorage.setItem('heys_supp_morning', '1'); } catch (e) { } }
                    });
                }
            }

            if (hour >= 21 && hour <= 23 && !sessionStorage.getItem('heys_supp_evening')) {
                const eveningSupps = notTaken.filter(id => {
                    const s = Supps.CATALOG?.[id];
                    return s && (s.timing === 'evening' || s.timing === 'beforeBed');
                });

                if (eveningSupps.length > 0) {
                    const names = eveningSupps.slice(0, 3).map(id => Supps.CATALOG[id]?.name).join(', ');
                    advices.push({
                        id: 'supplements_evening_reminder',
                        icon: '🌙',
                        text: `Вечерние: ${names}`,
                        details: '😴 Магний и мелатонин помогают расслабиться перед сном.',
                        type: 'tip',
                        priority: 25,
                        category: 'supplements',
                        triggers: ['tab_open'],
                        ttl: 5000,
                        onShow: () => { try { sessionStorage.setItem('heys_supp_evening', '1'); } catch (e) { } }
                    });
                }
            }

            const lastMeal = (day?.meals || []).slice(-1)[0];
            if (lastMeal && lastMeal.items?.length > 0 && !sessionStorage.getItem('heys_supp_fat_synergy')) {
                let mealFat = 0;
                for (const item of lastMeal.items) {
                    const p = helpers.getProductForItem(item, pIndex);
                    if (p) mealFat += (p.fat100 || 0) * (item.grams || 100) / 100;
                }

                if (mealFat >= 10) {
                    const fatSoluble = notTaken.filter(id =>
                        Supps.CATALOG?.[id]?.timing === 'withFat'
                    );

                    if (fatSoluble.length > 0) {
                        const names = fatSoluble.map(id => Supps.CATALOG[id]?.name).join(', ');
                        advices.push({
                            id: 'supplements_fat_meal_synergy',
                            icon: '🥑',
                            text: `Жирный приём! Идеально для: ${names}`,
                            details: '🧬 Жирорастворимые витамины (D, E, K, A) усваиваются в 3-4 раза лучше с жирами.',
                            type: 'tip',
                            priority: 18,
                            category: 'supplements',
                            triggers: ['product_added'],
                            ttl: 6000,
                            onShow: () => { try { sessionStorage.setItem('heys_supp_fat_synergy', '1'); } catch (e) { } }
                        });
                    }
                }
            }

            if (lastMeal && lastMeal.items?.length > 0 && !sessionStorage.getItem('heys_supp_dairy_iron')) {
                const dairyFoods = ['творог', 'молоко', 'сыр', 'йогурт', 'кефир', 'сметана'];
                const hasDairy = lastMeal.items.some(item =>
                    dairyFoods.some(f => (item.name || '').toLowerCase().includes(f))
                );

                if (hasDairy && notTaken.includes('iron')) {
                    advices.push({
                        id: 'supplements_dairy_iron_conflict',
                        icon: '⚠️',
                        text: 'Молочка + железо = плохо усваивается',
                        details: '🧀 Кальций из молочки блокирует усвоение железа. Раздели приём на 2-3 часа.',
                        type: 'warning',
                        priority: 20,
                        category: 'supplements',
                        triggers: ['product_added'],
                        ttl: 5000,
                        onShow: () => { try { sessionStorage.setItem('heys_supp_dairy_iron', '1'); } catch (e) { } }
                    });
                }
            }

            if (lastMeal && !sessionStorage.getItem('heys_supp_coffee_minerals')) {
                const hasCoffee = (lastMeal.items || []).some(item =>
                    (item.name || '').toLowerCase().includes('кофе')
                );
                const mineralSupps = notTaken.filter(id =>
                    ['iron', 'calcium', 'zinc', 'magnesium'].includes(id)
                );

                if (hasCoffee && mineralSupps.length > 0) {
                    const names = mineralSupps.map(id => Supps.CATALOG[id]?.name).join(', ');
                    advices.push({
                        id: 'supplements_coffee_minerals',
                        icon: '☕',
                        text: `Кофе блокирует: ${names}`,
                        details: '☕ Танины и кофеин снижают усвоение минералов на 40-60%. Подожди 1-2 часа.',
                        type: 'warning',
                        priority: 23,
                        category: 'supplements',
                        triggers: ['product_added'],
                        ttl: 5000,
                        onShow: () => { try { sessionStorage.setItem('heys_supp_coffee_minerals', '1'); } catch (e) { } }
                    });
                }
            }

            if (lastMeal && !sessionStorage.getItem('heys_supp_iron_vitc')) {
                const ironRichFoods = ['печень', 'говядина', 'гречка', 'чечевица', 'шпинат', 'фасоль'];
                const hasIronFood = (lastMeal.items || []).some(item =>
                    ironRichFoods.some(f => (item.name || '').toLowerCase().includes(f))
                );

                if (hasIronFood && notTaken.includes('vitC')) {
                    advices.push({
                        id: 'supplements_iron_vitc_synergy',
                        icon: '🍊',
                        text: 'Еда с железом! Витамин C усилит усвоение ×3',
                        details: '🧬 Витамин C превращает негемовое железо в легкоусваиваемую форму.',
                        type: 'tip',
                        priority: 17,
                        category: 'supplements',
                        triggers: ['product_added'],
                        ttl: 6000,
                        onShow: () => { try { sessionStorage.setItem('heys_supp_iron_vitc', '1'); } catch (e) { } }
                    });
                }
            }

            const compliance = Supps.getComplianceStats?.();
            if (compliance?.currentStreak >= 5 && !sessionStorage.getItem('heys_supp_streak')) {
                advices.push({
                    id: 'supplements_streak',
                    icon: '🔥',
                    text: `${compliance.currentStreak} дней подряд все витамины!`,
                    details: '💪 Регулярность важнее дозировки. Продолжай!',
                    type: 'achievement',
                    priority: 45,
                    category: 'supplements',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_supp_streak', '1'); } catch (e) { } }
                });
            }

            if (planned.length > 0 && notTaken.length === 0 && !sessionStorage.getItem('heys_supp_all_done')) {
                advices.push({
                    id: 'supplements_all_taken',
                    icon: '✅',
                    text: 'Все витамины приняты! Молодец!',
                    details: '💊 Последовательность — ключ к результату.',
                    type: 'achievement',
                    priority: 55,
                    category: 'supplements',
                    triggers: ['tab_open'],
                    ttl: 4000,
                    onShow: () => { try { sessionStorage.setItem('heys_supp_all_done', '1'); } catch (e) { } }
                });
            }

            if (!sessionStorage.getItem('heys_supp_personal_rec')) {
                const recs = Supps.getSmartRecommendations?.(prof, day) || [];
                if (recs.length > 0) {
                    const rec = recs[0];
                    advices.push({
                        id: 'supplements_personal_rec',
                        icon: '💡',
                        text: rec.reason,
                        details: `Рекомендуем добавить ${Supps.CATALOG?.[rec.id]?.name || rec.id} в план.`,
                        type: 'tip',
                        priority: 50,
                        category: 'supplements',
                        triggers: ['tab_open'],
                        ttl: 6000,
                        onShow: () => { try { sessionStorage.setItem('heys_supp_personal_rec', '1'); } catch (e) { } }
                    });
                }
            }
        }

        return advices;
    };

})();
