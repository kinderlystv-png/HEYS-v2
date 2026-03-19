// heys_day_sound_v1.js — DayTab sound effects (bridge to HEYS.audio)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    const playSuccessSound = (() => {
        let lastPlayTime = 0;
        return () => {
            // Dedup: не чаще раза в 2 сек (сохранено из оригинала)
            const now = Date.now();
            if (now - lastPlayTime < 2000) return;
            lastPlayTime = now;

            if (HEYS.audio) {
                HEYS.audio.play('calorieGoalReached');
            }
        };
    })();

    HEYS.daySound = {
        playSuccessSound
    };

    console.info('[HEYS.daySound] ✅ Bridge to HEYS.audio loaded');
})(window);
