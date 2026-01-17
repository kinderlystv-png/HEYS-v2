// heys_app_twemoji_effect_v1.js — Twemoji reparse effect

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppTwemojiEffect = HEYS.AppTwemojiEffect || {};

    HEYS.AppTwemojiEffect.useTwemojiEffect = function ({ React, tab }) {
        const { useEffect } = React;
        useEffect(() => {
            if (window.applyTwemoji) {
                // Immediate + delayed to catch React render
                window.applyTwemoji();
                setTimeout(() => {
                    window.applyTwemoji();
                }, 50);
                setTimeout(() => {
                    window.applyTwemoji();
                }, 150);
            } else {
                console.warn('[App] ⚠️ applyTwemoji not available');
            }
        }, [tab]);
    };
})();
