/**
 * HEYS Advice Module v1 — Hydration
 * @file advice/_hydration.js
 */

(function () {
    'use strict';

    window.HEYS = window.HEYS || {};
    window.HEYS.adviceModules = window.HEYS.adviceModules || {};

    window.HEYS.adviceModules.hydration = function buildHydrationAdvices(ctx, helpers) {
        const advices = [];
        const { rules } = helpers;
        const { THRESHOLDS } = rules;

        const { day, waterGoal, hour, mealCount } = ctx;
        const waterMl = day?.waterMl || 0;
        const waterPct = waterGoal > 0 ? waterMl / waterGoal : 0;

        const hoursSinceWater = helpers.getHoursSinceWater(day);

        if (hour >= 6 && hour < 10 && mealCount === 0 && waterMl === 0 && waterGoal > 0) {
            advices.push({
                id: 'water_morning_start',
                icon: '💧',
                text: 'Начни утро с 300–500 мл воды — так легче запустить день',
                details: '💧 После ночи организм просыпается слегка обезвоженным. Стакан воды с утра помогает концентрации, пищеварению и уменьшает путаницу между жаждой и голодом.',
                type: 'tip',
                priority: 18,
                category: 'hydration',
                triggers: ['tab_open'],
                excludes: ['water_reminder'],
                ttl: 5000,
                canSkipCooldown: true
            });
        }

        if (hour >= 18 && waterPct < 0.5 && waterGoal > 0) {
            advices.push({
                id: 'water_evening_low',
                icon: '💧',
                text: 'Вода отстаёт — выпей стакан прямо сейчас',
                details: '💧 Вечером нехватка воды часто маскируется под голод. 1-2 стакана воды улучшат самочувствие и сон.',
                type: 'tip',
                priority: 36,
                category: 'hydration',
                triggers: ['tab_open'],
                ttl: 5000
            });
        }

        if (hoursSinceWater >= 2 && hour >= 10 && hour <= 21) {
            advices.push({
                id: 'water_reminder',
                icon: '🚰',
                text: 'Пора пить воду — прошло больше 2 часов',
                details: '💧 Регулярная вода поддерживает концентрацию, снижает аппетит и улучшает пищеварение. Попробуй выпить 1 стакан.',
                type: 'tip',
                priority: 34,
                category: 'hydration',
                triggers: ['tab_open', 'product_added'],
                ttl: 4000
            });
        }

        if (waterPct >= 1.0 && waterGoal > 0) {
            advices.push({
                id: 'water_goal_reached',
                icon: '💧',
                text: 'Норма воды выполнена! Отлично 💙',
                details: '✅ Достаточная гидратация улучшает энергию, кожу и пищеварение.',
                type: 'achievement',
                priority: 36,
                category: 'hydration',
                triggers: ['tab_open', 'product_added'],
                ttl: 4000
            });
        }

        if (waterMl >= 2500) {
            advices.push({
                id: 'super_hydration',
                icon: '🌊',
                text: 'Супер-гидратация — больше 2.5л!',
                details: '🌊 Отличный уровень воды. Организм работает на максимум!',
                type: 'achievement',
                priority: 39,
                category: 'hydration',
                triggers: ['tab_open'],
                ttl: 4000
            });
        }

        return advices;
    };

})();
