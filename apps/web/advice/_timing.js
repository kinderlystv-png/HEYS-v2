/**
 * HEYS Advice Module v1 — Timing
 * @file advice/_timing.js
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceModules = window.HEYS.adviceModules || {};

    window.HEYS.adviceModules.timing = function buildTimingAdvices(ctx, helpers) {
        const advices = [];
        const { rules } = helpers;
        const { PRIORITY, THRESHOLDS } = rules;

        const { day, hour, mealCount, prof, kcalPct, optimum } = ctx;

        const toMinutes = (timeStr) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + (m || 0);
        };

        const mealsWithItems = (day?.meals || []).filter(m => m.items?.length > 0 && m.time);
        const mealTimes = mealsWithItems.map(m => toMinutes(m.time)).sort((a, b) => a - b);

        const lastMealWithItems = helpers.getLastMealWithItems(day);
        const firstMealWithItems = helpers.getFirstMealWithItems(day);

        // late_first_meal — поздний первый приём
        if (firstMealWithItems && hour >= 13) {
            const fmHour = toMinutes(firstMealWithItems.time) / 60;
            if (fmHour >= 12) {
                advices.push({
                    id: 'late_first_meal',
                    icon: '⏰',
                    text: 'Первый приём поздновато — завтра попробуй раньше',
                    details: '☕ Первый приём до 12:00 запускает метаболизм и даёт энергию. Поздний завтрак = поздний ужин.',
                    type: 'tip',
                    priority: 77,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }
        }

        // fasting_window_good — 14+ часов без еды (ужин→завтрак)
        if (firstMealWithItems && hour >= 10) {
            const yesterdayDays = helpers.getRecentDays(1);
            const yesterdayDay = yesterdayDays[0];
            const yesterdayLastMeal = helpers.getLastMealWithItems(yesterdayDay);

            if (yesterdayLastMeal) {
                const lastH = Math.floor(toMinutes(yesterdayLastMeal.time) / 60);
                const firstH = Math.floor(toMinutes(firstMealWithItems.time) / 60);
                const fastingWindow = (24 - lastH) + firstH;

                if (fastingWindow >= 14 && !sessionStorage.getItem('heys_fasting_good')) {
                    advices.push({
                        id: 'fasting_window_good',
                        icon: '🕐',
                        text: `${fastingWindow}+ часов без еды — отличное окно!`,
                        details: '⏰ 14+ часов ночного голодания = интервальное голодание. Это ускоряет аутофагию и жиросжигание.',
                        type: 'achievement',
                        priority: 91,
                        category: 'timing',
                        triggers: ['tab_open'],
                        ttl: 5000,
                        onShow: () => { try { sessionStorage.setItem('heys_fasting_good', '1'); } catch (e) { } }
                    });
                }
            }
        }

        // lipolysis_going_strong / long_fast_warning
        if (mealTimes.length >= 1 && hour >= 10 && hour <= 18) {
            const lastMealMinutes = mealTimes[mealTimes.length - 1];
            const nowMinutes = hour * 60 + new Date().getMinutes();
            const gapHours = (nowMinutes - lastMealMinutes) / 60;

            if (gapHours > 5 && gapHours <= 7) {
                advices.push({
                    id: 'lipolysis_going_strong',
                    icon: '🔥',
                    text: `${Math.round(gapHours)}ч без еды — липолиз в разгаре! Держись!`,
                    details: '🔥 После 4-5 часов без еды инсулин падает и включается жиросжигание. Ты сейчас в режиме липолиза!',
                    type: 'achievement',
                    priority: 92,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            } else if (gapHours > 7) {
                advices.push({
                    id: 'long_fast_warning',
                    icon: '⚠️',
                    text: `${Math.round(gapHours)}ч без еды — когда поешь, выбирай низкий ГИ!`,
                    details: '🥗 После долгого перерыва организм чувствителен к углеводам. Начни с белка + овощи, потом добавь сложные углеводы.',
                    type: 'tip',
                    priority: 92,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }
        }

        // meal_spacing_perfect / frequent_eating_no_lipolysis
        if (mealTimes.length >= 3) {
            const gaps = [];
            for (let i = 1; i < mealTimes.length; i++) {
                gaps.push((mealTimes[i] - mealTimes[i - 1]) / 60);
            }
            const allGapsGood = gaps.every(g => g >= 3 && g <= 5);

            if (allGapsGood && !sessionStorage.getItem('heys_spacing_perfect')) {
                advices.push({
                    id: 'meal_spacing_perfect',
                    icon: '🔥',
                    text: 'Идеальные интервалы! Максимум времени в липолизе',
                    details: '⏱️ Интервалы 3-5 часов = максимальное время в режиме жиросжигания между приёмами. Инсулин успевает снизиться, и организм переключается на сжигание жира.',
                    type: 'achievement',
                    priority: 93,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_spacing_perfect', '1'); } catch (e) { } }
                });
            }

            const shortGaps = gaps.filter(g => g < 2);
            if (shortGaps.length >= 2) {
                advices.push({
                    id: 'frequent_eating_no_lipolysis',
                    icon: '📈',
                    text: 'Частые приёмы — инсулин постоянно высокий, липолиза нет',
                    details: '📊 Перерывы < 2 часов между едой = постоянно высокий инсулин. Жиросжигание не включается. Делай паузы 3-5 часов.',
                    type: 'warning',
                    priority: 45,
                    category: 'timing',
                    triggers: ['meal_added'],
                    ttl: 6000
                });
            }
        }

        // insulin_too_fast / insulin_perfect / insulin_countdown
        if (mealsWithItems.length >= 2) {
            const insulinWave = prof?.insulinWaveHours || 4;

            for (let i = 1; i < mealTimes.length; i++) {
                const gap = mealTimes[i] - mealTimes[i - 1];
                if (gap < insulinWave * 60 * 0.5) {
                    const gapHours = (gap / 60).toFixed(1).replace('.0', '');
                    advices.push({
                        id: 'insulin_too_fast',
                        icon: '⏱️',
                        text: `Между приёмами ${gapHours}ч — дай инсулину отдохнуть`,
                        details: '🔖 Инсулин высокий = жир не горит. Идеальный перерыв 3-4 часа между приёмами.',
                        type: 'tip',
                        priority: 38,
                        category: 'timing',
                        triggers: ['product_added'],
                        ttl: 5000
                    });
                    break;
                }
            }

            const avgGap = (mealTimes[mealTimes.length - 1] - mealTimes[0]) / (mealTimes.length - 1);
            if (avgGap >= insulinWave * 60 * 0.9 && mealsWithItems.length >= 3) {
                advices.push({
                    id: 'insulin_perfect',
                    icon: '⏰',
                    text: 'Отличные интервалы между приёмами!',
                    details: '🎯 Инсулин успевает снизиться → липолиз включается. Так держать!',
                    type: 'achievement',
                    priority: 39,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }

            const lastMealTimeMinutes = mealTimes[mealTimes.length - 1];
            const nowMinutes = hour * 60 + new Date().getMinutes();
            const insulinEndMinutes = lastMealTimeMinutes + insulinWave * 60;
            const minutesUntilEnd = insulinEndMinutes - nowMinutes;

            if (minutesUntilEnd > 0 && minutesUntilEnd < 60 && !sessionStorage.getItem('heys_insulin_countdown')) {
                advices.push({
                    id: 'insulin_countdown',
                    icon: '⏱️',
                    text: `Через ${minutesUntilEnd} мин инсулиновая волна закончится — можно перекусить`,
                    details: '🔥 Когда инсулин снизится, начнётся жиросжигание. Подожди ещё немного!',
                    type: 'info',
                    priority: 40,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_insulin_countdown', '1'); } catch (e) { } }
                });
            }
        }

        // bedtime_protein / bedtime_undereating
        const bedtimeInfo = helpers.getHoursUntilBedtime(hour, prof);
        const hoursUntilBed = bedtimeInfo.hoursUntilBed;
        const bedtimeText = bedtimeInfo.source === 'history'
            ? `(обычно в ${bedtimeInfo.bedtimeFormatted})`
            : '';

        if (hour >= 20 && hour <= 23 && ctx.proteinPct < 0.8 && hoursUntilBed > 0 && hoursUntilBed <= 4) {
            advices.push({
                id: 'bedtime_protein',
                icon: '🥛',
                text: `До сна ~${Math.round(hoursUntilBed)}ч ${bedtimeText} — добери белок!`,
                details: '🌙 Казеин (творог, греческий йогурт) — идеален на ночь. Медленно усваивается и питает мышцы во сне.',
                type: 'tip',
                priority: 35,
                category: 'timing',
                triggers: ['tab_open'],
                ttl: 5000,
                action: {
                    primary: { label: '🥛 Найти казеин/творог', handler: 'addMealProduct', data: { category: 'protein_slow' } },
                    snooze: { label: 'Позже', remindAfterMinutes: 30 }
                }
            });
        }

        if (hoursUntilBed > 0 && hoursUntilBed <= 2 && kcalPct < 0.7) {
            const kcalMissing = Math.round((1 - kcalPct) * (optimum || 2000));
            advices.push({
                id: 'bedtime_undereating',
                icon: '⏰',
                text: `До сна ~${Math.round(hoursUntilBed)}ч, а не хватает ${kcalMissing} ккал!`,
                details: `🔬 Времени мало, но лучше поесть:\n\n` +
                    `• Творог 200г = 220 ккал, 36г белка — переварится за 1.5-2ч\n` +
                    `• Протеиновый коктейль = 120-200 ккал за 30 мин\n` +
                    `• Орехи 50г = 300 ккал — быстро и сытно\n\n` +
                    `💡 Голодный сон = плохое восстановление + переедание завтра`,
                type: 'warning',
                priority: 8,
                category: 'timing',
                triggers: ['tab_open'],
                ttl: 6000,
                action: {
                    primary: { label: '🍽️ Добавить лёгкий приём', handler: 'addMealProduct', data: { category: 'protein_quick' } },
                    snooze: { label: 'Пропущу сегодня', remindAfterMinutes: 720 }
                }
            });
        }

        // late_dinner_warning / late_heavy_meal / good_dinner_time
        const lastMealTime = (() => {
            const mealsList = (day?.meals || []).filter(m => m.items?.length > 0);
            if (mealsList.length === 0) return null;
            const timesList = mealsList.map(m => m.time || '12:00').sort();
            return timesList[timesList.length - 1];
        })();

        if (lastMealTime) {
            const lastH = Math.floor(toMinutes(lastMealTime) / 60);

            if (lastH >= 22) {
                advices.push({
                    id: 'late_dinner_warning',
                    icon: '🌙',
                    text: 'Поздний ужин — сон может быть хуже',
                    details: '💤 Еда за 2-3 часа до сна успеет перевариться. Поздный ужин может вызвать изжогу и поверхностный сон.',
                    type: 'tip',
                    priority: 41,
                    category: 'timing',
                    triggers: ['product_added'],
                    ttl: 5000
                });
            }

            if (lastH >= 21 && lastH < 22 && !sessionStorage.getItem('heys_late_heavy_shown')) {
                const lastMealByTime = (day?.meals || []).find(m => m.time === lastMealTime);
                if (lastMealByTime) {
                    let lateMealKcal = 0;
                    for (const item of (lastMealByTime.items || [])) {
                        const product = helpers.getProductForItem(item, ctx.pIndex);
                        if (product) lateMealKcal += (product.kcal100 || 0) * window.HEYS.models.normalizeItemGrams(item.grams, 100) / 100;
                    }

                    if (lateMealKcal > 500) {
                        advices.push({
                            id: 'late_heavy_meal',
                            icon: '🌙',
                            text: `Плотный ужин (${Math.round(lateMealKcal)} ккал) после 21:00 — сон может быть хуже`,
                            details: '💤 Пищеварение мешает глубокому сну. В следующий раз поужинай легче или раньше.',
                            type: 'tip',
                            priority: 40,
                            category: 'timing',
                            triggers: ['product_added'],
                            ttl: 5000,
                            onShow: () => { try { sessionStorage.setItem('heys_late_heavy_shown', '1'); } catch (e) { } }
                        });
                    }
                }
            }

            if (lastH >= 18 && lastH <= 20 && hour >= 21) {
                advices.push({
                    id: 'good_dinner_time',
                    icon: '🌙',
                    text: 'Ужин в правильное время — сон будет лучше!',
                    details: '🌙 Оптимальный ужин — за 2-3 часа до сна. Ты всё сделал правильно!',
                    type: 'achievement',
                    priority: 42,
                    category: 'timing',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }
        }

        return advices;
    };

})();
