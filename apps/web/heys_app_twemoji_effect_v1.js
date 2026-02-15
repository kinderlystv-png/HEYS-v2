// heys_app_twemoji_effect_v1.js — Twemoji reparse effect

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppTwemojiEffect = HEYS.AppTwemojiEffect || {};

    HEYS.AppTwemojiEffect.useTwemojiEffect = function ({ React, tab }) {
        const { useEffect } = React;
        useEffect(() => {
            const root = document.getElementById('root') || document.body;

            if (window.scheduleTwemojiParse) {
                // Debounced reparse for current viewport content
                window.scheduleTwemojiParse(root);
            } else if (window.applyTwemoji) {
                window.applyTwemoji(root);
            } else {
                console.warn('[App] ⚠️ applyTwemoji not available');
            }
        }, [tab]);
    };
})();
