// heys_day_sound_v1.js — DayTab sound effects (bridge to HEYS.audio)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    // Звука у достигнутой нормы калорий нет — строка «звук · правило
    // продукта»: звуков два, капля воды и звук совета. Функция остаётся, чтобы
    // цепочка вызовов из heys_day_animations.js не разъезжалась.
    const playSuccessSound = () => { };

    HEYS.daySound = {
        playSuccessSound
    };

    console.info('[HEYS.daySound] ✅ loaded (звука у нормы калорий нет)');
})(window);
