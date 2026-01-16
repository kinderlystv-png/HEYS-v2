/**
 * HEYS Advice Module v1 — Training
 * @file advice/_training.js
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceModules = window.HEYS.adviceModules || {};

    window.HEYS.adviceModules.training = function buildTrainingAdvices(ctx, helpers) {
        const advices = [];
        const { rules } = helpers;
        const { THRESHOLDS } = rules;

        const {
            day,
            dayTot,
            normAbs,
            hour,
            mealCount,
            hasTraining,
            kcalPct,
            optimum,
            pIndex,
            proteinPct,
            carbsPct,
            caloricDebt
        } = ctx;

        // ─────────────────────────────────────────────────────────
        // 🏋️ Post-training nutrition
        // ─────────────────────────────────────────────────────────

        if (hasTraining && proteinPct < THRESHOLDS.protein.adequate) {
            advices.push({
                id: 'post_training_protein',
                icon: '💪',
                text: helpers.personalizeText(helpers.pickRandomText([
                    'После тренировки важен белок — добавь 20-30г',
                    '${firstName}, после тренировки нужен белок!',
                    'Мышцы ждут белок — творог, курица, яйца'
                ]), ctx),
                details: 'Белок в течение 2 часов после тренировки ускоряет восстановление мышц. Идеально: протеиновый коктейль, творог с бананом, куриная грудка с рисом, или греческий йогурт с орехами.',
                type: 'tip',
                priority: 34,
                category: 'training',
                triggers: ['product_added', 'tab_open'],
                excludes: ['protein_low', 'hard_workout_recovery', 'training_recovery_window'],
                canSkipCooldown: true,
                ttl: 5000
            });
        }

        if (hasTraining && kcalPct < 0.7 && hour >= 18) {
            const kcalMissing = Math.round((1 - kcalPct) * (optimum || 2000));
            advices.push({
                id: 'post_training_undereating_critical',
                icon: '🚨',
                text: `После тренировки не хватает ${kcalMissing} ккал — мышцам нужен белок!`,
                details: `🔬 Научный факт: первые 2-3 часа после тренировки — "анаболическое окно".\n\n` +
                    `• Без еды после тренировки = катаболизм (разрушение мышц)\n` +
                    `• Поздний ужин лучше чем голодание после нагрузки\n` +
                    `• Идеально: 25-40г белка + сложные углеводы\n\n` +
                    `💡 Варианты: творог 200г, яйца 3шт + хлеб, курица + рис, протеин + банан`,
                type: 'warning',
                priority: 5,
                category: 'training',
                triggers: ['tab_open'],
                ttl: 8000,
                canSkipCooldown: true
            });
        }

        // ─────────────────────────────────────────────────────────
        // 🏋️ Training day context (caloric debt)
        // ─────────────────────────────────────────────────────────

        const trainingCtx = caloricDebt?.trainingDayContext;
        if (trainingCtx?.isTrainingDay && trainingCtx.nutritionPriority === 'high') {
            const trainType = trainingCtx.trainingType;

            if (caloricDebt?.hasDebt && trainType === 'strength') {
                advices.push({
                    id: 'training_strength_undereating',
                    icon: '🏋️',
                    text: 'Силовая + недоедание = потеря мышц!',
                    details: '💪 После силовой мышцам нужен белок и углеводы для восстановления. Недобор сейчас = потеря прогресса в зале!',
                    type: 'warning',
                    priority: 14,
                    category: 'training',
                    triggers: ['tab_open'],
                    ttl: 7000
                });
            } else if (caloricDebt?.hasDebt && trainType === 'cardio') {
                advices.push({
                    id: 'training_cardio_undereating',
                    icon: '🏃',
                    text: 'Кардио + дефицит — восполни гликоген',
                    details: '⚡ После кардио гликоген истощён. Углеводы сейчас пойдут прямо в мышцы, а не в жир! Не бойся поесть.',
                    type: 'tip',
                    priority: 23,
                    category: 'training',
                    triggers: ['tab_open'],
                    ttl: 6000
                });
            }

            if (trainingCtx.trainingIntensity === 'high' || trainingCtx.trainingIntensity === 'extreme') {
                advices.push({
                    id: 'training_high_intensity_nutrition',
                    icon: '🔥',
                    text: 'Интенсивная тренировка — питание критично!',
                    details: '💥 Высокая интенсивность = высокий расход. Сегодня питание особенно важно для восстановления. Норма увеличена!',
                    type: 'info',
                    priority: 26,
                    category: 'training',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // ⏱️ Recovery window (30-60 мин после тренировки)
        // ─────────────────────────────────────────────────────────

        const trainingsP3 = day?.trainings || [];
        const todayTrainingP3 = trainingsP3.find(t => t.z && t.z.some(m => m > 0));
        if (todayTrainingP3 && todayTrainingP3.time) {
            const [trainH, trainM] = todayTrainingP3.time.split(':').map(Number);
            const trainMinutes = trainH * 60 + trainM;
            const nowMinutes = hour * 60 + new Date().getMinutes();
            const minutesSince = nowMinutes - trainMinutes;

            if (minutesSince >= 30 && minutesSince <= 60 && proteinPct < 0.8) {
                advices.push({
                    id: 'training_recovery_window',
                    icon: '🏋️',
                    text: 'Окно восстановления — белок сейчас усвоится лучше!',
                    details: '💪 30-60 минут после тренировки — анаболическое окно. Белок усваивается на 25% эффективнее. Идеально: 20-30г белка.',
                    type: 'tip',
                    priority: 94,
                    category: 'training',
                    triggers: ['tab_open'],
                    ttl: 5000
                });
            }
        }

        // ─────────────────────────────────────────────────────────
        // 🏋️ Training tips (интенсивность, тип)
        // ─────────────────────────────────────────────────────────

        const trainings = day?.trainings || [];
        const todayTraining = trainings.find(t => t.z && t.z.some(m => m > 0));

        if (todayTraining) {
            const totalMinutes = todayTraining.z.reduce((a, b) => a + b, 0);
            const highIntensityMinutes = (todayTraining.z[2] || 0) + (todayTraining.z[3] || 0);
            const isHardWorkout = highIntensityMinutes > 20;
            const proteinPctLocal = (dayTot?.prot || 0) / ((normAbs?.prot || 100) || 1);

            if (isHardWorkout && proteinPctLocal < 1.0) {
                advices.push({
                    id: 'hard_workout_recovery',
                    icon: '🔥',
                    text: `${highIntensityMinutes} мин в высоких зонах — добавь белка для восстановления`,
                    details: '🏋️ Интенсивная тренировка создаёт микроповреждения мышц. Белок в течение 2ч ускоряет восстановление.',
                    type: 'tip',
                    priority: 30,
                    category: 'training',
                    triggers: ['product_added', 'tab_open'],
                    ttl: 5000
                });
            }

            const fatBurnMinutes = todayTraining.z[1] || 0;
            const carbsPctLocal = (dayTot?.carbs || 0) / ((normAbs?.carbs || 200) || 1);
            if (fatBurnMinutes > 30 && carbsPctLocal > 1.2) {
                advices.push({
                    id: 'cardio_carbs_balance',
                    icon: '🏃',
                    text: 'После кардио лучше белок и овощи, чем углеводы',
                    details: '🔥 После кардио организм в режиме жиросжигания. Углеводы выключат этот режим.',
                    type: 'tip',
                    priority: 35,
                    category: 'training',
                    triggers: ['product_added'],
                    ttl: 5000
                });
            }

            if (totalMinutes >= 45) {
                advices.push({
                    id: 'great_workout',
                    icon: '💪',
                    text: `${totalMinutes} мин тренировки — супер!`,
                    details: '🎯 45+ минут тренировки = серьёзная нагрузка! Не забудь про восстановление и сон.',
                    type: 'achievement',
                    priority: 7,
                    category: 'training',
                    triggers: ['tab_open'],
                    ttl: 4000
                });
            }

            if (todayTraining.type === 'strength' && proteinPctLocal < 1.0) {
                advices.push({
                    id: 'training_type_strength',
                    icon: '🏋️',
                    text: 'После силовой важен белок — 20-30г в течение 2 часов',
                    details: '💪 Силовая создаёт микроповреждения мышц, белок их восстанавливает. Без белка — роста не будет.',
                    type: 'tip',
                    priority: 31,
                    category: 'training',
                    triggers: ['tab_open', 'product_added'],
                    ttl: 5000
                });
            }

            if (todayTraining.type === 'hobby' && !sessionStorage.getItem('heys_hobby_tip')) {
                advices.push({
                    id: 'training_type_hobby',
                    icon: '🧘',
                    text: 'После активного хобби идеален лёгкий приём — овощи, фрукты',
                    details: '🌿 Йога, прогулки, спортивные игры расслабляют и не требуют агрессивного восстановления.',
                    type: 'tip',
                    priority: 49,
                    category: 'training',
                    triggers: ['tab_open'],
                    ttl: 5000,
                    onShow: () => { try { sessionStorage.setItem('heys_hobby_tip', '1'); } catch (e) { } }
                });
            }
        }

        return advices;
    };

})();
