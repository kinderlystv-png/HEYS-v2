// heys_day_sound_v1.js — DayTab sound effects (success chime)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getLsGet() {
        if (HEYS.dayStorage?.lsGet) return HEYS.dayStorage.lsGet;
        if (HEYS.utils?.lsGet) return HEYS.utils.lsGet;
        return (key, defaultValue) => {
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw == null ? null : JSON.parse(raw);
                return parsed == null ? defaultValue : parsed;
            } catch (e) {
                return defaultValue;
            }
        };
    }

    const playSuccessSound = (() => {
        let audioCtx = null;
        let lastPlayTime = 0;
        return () => {
            const lsGet = getLsGet();
            const soundEnabled = lsGet('heys_sound_enabled', true);
            if (!soundEnabled) return;

            const now = Date.now();
            if (now - lastPlayTime < 2000) return;
            lastPlayTime = now;

            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(audioCtx.destination);

                osc1.frequency.value = 880; // A5
                osc2.frequency.value = 1174.66; // D6
                osc1.type = 'sine';
                osc2.type = 'sine';

                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

                osc1.start(audioCtx.currentTime);
                osc2.start(audioCtx.currentTime + 0.1);
                osc1.stop(audioCtx.currentTime + 0.3);
                osc2.stop(audioCtx.currentTime + 0.4);
            } catch (e) {
                // ignore audio errors
            }
        };
    })();

    HEYS.daySound = {
        playSuccessSound
    };
})(window);
