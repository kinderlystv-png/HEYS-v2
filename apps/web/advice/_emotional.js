/**
 * HEYS Advice Module v1 — Emotional & Correlation
 * @file advice/_emotional.js
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceModules = window.HEYS.adviceModules || {};

    window.HEYS.adviceModules.emotional = function buildEmotionalAdvices(ctx, helpers) {
        const advices = [];

        const {
            day,
            dayTot,
            normAbs,
            optimum,
            hour,
            mealCount,
            kcalPct,
            emotionalState,
            goal,
            proteinPct,
            waterGoal,
            caloricDebt
        } = ctx;

        const {
            calculateAverageStress,
            calculateAverageWellbeing,
            calculateSleepHours,
            getProductForItem
        } = helpers;

        // ─────────────────────────────────────────────────────────
        // 😊 EMOTIONAL STATE TIPS
        // ─────────────────────────────────────────────────────────

        if (emotionalState === 'crashed') {
            const isUnderEating = kcalPct < 0.7;
            const kcalDeficit = Math.round((1 - kcalPct) * (optimum || 2000));
            const currentPct = Math.round(kcalPct * 100);

            if (isUnderEating && hour >= 18) {
                advices.push({
                    id: 'undereating_warning',
                    icon: '⚠️',
                    text: `Съедено ${currentPct}% — не хватает ~${kcalDeficit} ккал`,
                    details: `🔬 Научный факт: жёсткий дефицит (>500 ккал) хуже позднего ужина!\n\n` +
                        `• Метаболизм замедляется на 10-15%\n` +
                        `• После тренировки критически важен белок\n` +
                        `• Риск: потеря мышц, выпадение волос, гормональный сбой\n\n` +
                        `💡 Лучше поесть даже в 23:00: творог 200г (~220 ккал, 36г белка), яйца 3шт (~240 ккал), орехи 50г (~300 ккал)`,
                    type: 'warning',
                    priority: 1,
                    category: 'nutrition',
                    triggers: ['tab_open', 'product_added'],
                    ttl: 8000
                });
            } else {
                advices.push({
                    id: 'crash_support',
                    icon: '💙',
                    text: 'Бывает! Завтра новый день. Ты справишься!',
                    details: '🧡 Один плохой день не отменяет всего прогресса. Даже у профессионалов бывают срывы. Главное — вернуться к плану завтра.',
                    type: 'achievement',
                    priority: 1,
                    category: 'emotional',
                    triggers: ['tab_open', 'product_added'],
                    ttl: 6000
                });
            }
        }

        if (emotionalState === 'stressed') {
            advices.push({
                id: 'stress_support',
                icon: '🤗',
                text: 'Ты молодец, что записываешь. Это уже успех!',
                details: '💪 Сам факт ведения дневника увеличивает шансы на успех в 2 раза. Даже в стрессе ты делаешь правильные шаги.',
                type: 'achievement',
                priority: 2,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 😰 EMOTIONAL RISK — стресс + долг
        // ─────────────────────────────────────────────────────────

        const avgStress = day?.stressAvg || 0;
        const isHighStress = avgStress >= 6;
        const hasDebt = caloricDebt?.hasDebt;
        const emotionalRiskLevel = (isHighStress && hasDebt) ? 'high'
            : (isHighStress || hasDebt) ? 'medium'
                : 'low';

        if (emotionalRiskLevel === 'high' && hour >= 16) {
            advices.push({
                id: 'emotional_risk_high',
                icon: '🧘',
                text: 'Стресс + недоедание — риск срыва! Мягче к себе',
                details: '🔬 При высоком кортизоле мозг требует быстрой энергии. Это не слабость — биохимия! Лучше съешь что-то сейчас, чем сорвёшься вечером.',
                type: 'warning',
                priority: 18,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 7000
            });
        } else if (isHighStress && hour >= 18 && kcalPct < 0.8) {
            advices.push({
                id: 'stress_undereating_warning',
                icon: '⚠️',
                text: 'Стресс сегодня высокий — не голодай',
                details: '😰 При стрессе лептин падает, грелин растёт. Недоедание + стресс = 90% шанс срыва ночью. Лучше поесть нормально сейчас.',
                type: 'warning',
                priority: 22,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 6000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🧠 CORRELATION INSIGHTS
        // ─────────────────────────────────────────────────────────

        const sleepHours = calculateSleepHours(day);
        const sleepNorm = ctx.prof?.sleepHours || 8;
        const sleepDeficit = sleepNorm - sleepHours;

        if (sleepDeficit > 2 && kcalPct > 1.15) {
            advices.push({
                id: 'sleep_hunger_correlation',
                icon: '🧠',
                text: `Недосып ${sleepDeficit.toFixed(1)}ч повышает аппетит — это нормально`,
                details: '📊 Каждый час недосыпа = +45 ккал аппетита. Это гормоны, не слабость воли.',
                type: 'insight',
                priority: 20,
                category: 'correlation',
                triggers: ['product_added', 'tab_open'],
                ttl: 6000
            });
        }

        if (sleepDeficit > 1.5 && hour < 12 && kcalPct < 0.3) {
            advices.push({
                id: 'sleep_hunger_warning',
                icon: '⚡',
                text: 'После недосыпа аппетит выше — планируй сытный обед',
                details: '☕ После недосыпа тянет на сладкое. Запланируй белковый обед заранее.',
                type: 'tip',
                priority: 25,
                category: 'correlation',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const avgStressForPattern = calculateAverageStress(day);
        const simplePctCorr = (dayTot?.simple || 0) / ((normAbs?.simple || 50) || 1);

        if (avgStressForPattern >= 4 && simplePctCorr > 1.2) {
            advices.push({
                id: 'stress_sweet_pattern',
                icon: '💡',
                text: 'Стресс → сладкое — попробуй орехи или тёмный шоколад',
                details: '🍫 Стресс → кортизол → тяга к сладкому. Альтернатива: тёмный шоколад 70%+, орехи, банан.',
                type: 'insight',
                priority: 22,
                category: 'correlation',
                triggers: ['product_added'],
                ttl: 6000
            });
        }

        if (avgStressForPattern > 0 && avgStressForPattern <= 2 && kcalPct >= 0.9 && kcalPct <= 1.1) {
            advices.push({
                id: 'low_stress_balance',
                icon: '☮️',
                text: 'Спокойный день = легче держать баланс. Замечаешь?',
                details: '🧘 Низкий стресс = низкий кортизол = меньше тяги к еде. Запомни это состояние!',
                type: 'insight',
                priority: 40,
                category: 'correlation',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (avgStressForPattern >= 4 && kcalPct > 1.15) {
            advices.push({
                id: 'stress_eating_detected',
                icon: '🚶',
                text: 'Стресс → перекус? Попробуй прогулку вместо еды',
                details: '🧠 Стрессовое переедание — это кортизол. 10-минутная прогулка снижает его лучше, чем еда.',
                type: 'tip',
                priority: 96,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🎭 EMOTIONAL INTELLIGENCE
        // ─────────────────────────────────────────────────────────

        const mealsWithMood = (day?.meals || []).filter(m => m.mood > 0 && m.items?.length > 0);
        if (mealsWithMood.length >= 2) {
            const moodDropMeal = mealsWithMood.find((m, i) => {
                if (i === 0) return false;
                return m.mood < mealsWithMood[i - 1].mood - 1;
            });

            if (moodDropMeal) {
                const prevMealIdx = mealsWithMood.indexOf(moodDropMeal) - 1;
                const prevMeal = mealsWithMood[prevMealIdx];

                let prevSimple = 0;
                for (const item of prevMeal.items || []) {
                    const product = getProductForItem(item, ctx.pIndex);
                    if (product) prevSimple += (product.simple100 || 0) * (item.grams || 100) / 100;
                }

                if (prevSimple > 30) {
                    advices.push({
                        id: 'sugar_mood_crash',
                        icon: '🎢',
                        text: 'Заметил? После сладкого настроение может падать',
                        details: '📉 Это "сахарные горки": быстрый скачок глюкозы → инсулин → падение энергии. Сложные углеводы дают стабильную энергию.',
                        type: 'insight',
                        priority: 24,
                        category: 'emotional',
                        triggers: ['tab_open'],
                        ttl: 6000
                    });
                }
            }
        }

        const avgWellbeing = calculateAverageWellbeing(day);

        if (avgWellbeing > 0 && avgWellbeing < 3 && kcalPct < 0.4 && hour >= 12) {
            advices.push({
                id: 'wellbeing_low_food',
                icon: '🍽️',
                text: 'Возможно самочувствие улучшится после еды',
                details: '🧠 Мозгу нужна глюкоза! Низкий сахар в крови = усталость, раздражительность, слабость. Поешь — станет легче.',
                type: 'tip',
                priority: 29,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (avgWellbeing >= 4 && kcalPct >= 0.8 && kcalPct <= 1.1) {
            advices.push({
                id: 'wellbeing_nutrition_link',
                icon: '✨',
                text: 'Хорошее самочувствие + правильное питание — запомни этот день!',
                details: '📝 Запиши, что ел сегодня! Когда найдёшь свой идеальный рацион — повторяй его.',
                type: 'insight',
                priority: 45,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const dayScore = day?.dayScore ? +day.dayScore : 0;
        if (dayScore > 0 && dayScore < 5 && hour >= 20) {
            advices.push({
                id: 'day_score_low',
                icon: '💙',
                text: 'Не лучший день? Завтра будет лучше!',
                details: '🧡 Плохие дни бывают у всех. Важно не сдаваться. Хороший сон сегодня — и завтра будет лучше.',
                type: 'tip',
                priority: 27,
                category: 'emotional',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (dayScore >= 8 && hour >= 20) {
            advices.push({
                id: 'day_score_high',
                icon: '⭐',
                text: 'Отличная оценка дня! Запомни это ощущение',
                details: '🏆 Дни с высокой оценкой — эталон для подражания. Что делал сегодня? Повтори завтра!',
                type: 'achievement',
                priority: 8,
                category: 'achievement',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        const mealsWithMoodData = (day?.meals || []).filter(m => m.mood > 0 && m.items?.length > 0);
        if (mealsWithMoodData.length >= 2 && !sessionStorage.getItem('heys_mood_improving')) {
            const prevMealMood = mealsWithMoodData[mealsWithMoodData.length - 2]?.mood || 0;
            const currentMealMood = mealsWithMoodData[mealsWithMoodData.length - 1]?.mood || 0;

            if (prevMealMood > 0 && currentMealMood > prevMealMood) {
                advices.push({
                    id: 'mood_improving',
                    icon: '📈',
                    text: 'Настроение улучшилось после еды — интересный паттерн!',
                    details: '🧠 Еда влияет на настроение через серотонин и дофамин. Запоминай удачные сочетания!',
                    type: 'insight',
                    priority: 45,
                    category: 'correlation',
                    triggers: ['product_added'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_mood_improving', '1'); } catch (e) { } }
                });
            }
        }

        return advices;
    };

})();
