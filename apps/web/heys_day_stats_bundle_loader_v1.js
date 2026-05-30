// heys_day_stats_bundle_loader_v1.js — loader bundle for stats/water/activity modules
// 🆕 PERF v9.2: Метка момента когда boot-day начал исполняться
window.__heysPerfMark && window.__heysPerfMark('boot-day: execute start');
; (function (global) {
    const HEYS = (global.HEYS = global.HEYS || {});

    const scripts = [
        'heys_morning_activation_calendar_v1.js',
        'heys_day_stats_vm_v1.js',
        'heys_day_realdata_actions_v1.js',
        'heys_day_stats_v1.js',
        'heys_day_activity_v1.js',
        'heys_day_trainings_v1.js',
        'heys_day_training_popups_v1.js',
        'heys_day_sleep_score_popups_v1.js',
        // 🤚 Fingers — climbing fingerboard module (Wave 2 — 17 modules)
        // Order: features FIRST (capability detection), then data (catalogs/bibliography),
        // then visuals (svg/voice), then logic (records → calibration → timer), then UI helpers.
        'heys_platform_features_v1.js',
        'heys_fingers_audio_extension_v1.js',
        'heys_fingers_bibliography_v1.js',
        'heys_fingers_grips_catalog_v1.js',
        'heys_fingers_boards_catalog_v1.js',
        'heys_fingers_programs_catalog_v1.js',
        'heys_fingers_age_gating_v1.js',
        'heys_fingers_readiness_v1.js',
        'heys_fingers_svg_grips_v1.js',
        'heys_fingers_svg_anatomy_v1.js',
        'heys_fingers_voice_v1.js',
        'heys_fingers_records_store_v1.js',
        'heys_fingers_calibration_v1.js',
        'heys_fingers_timer_v1.js',
        'heys_fingers_session_persistence_v1.js',
        'heys_fingers_calendar_v1.js',
        'heys_fingers_safety_v1.js',
        'heys_fingers_entry_v1.js' // entry stub LAST — opens fullscreen using everything above
    ];

    function reportError(error, src) {
        try {
            if (HEYS?.analytics?.trackError) {
                HEYS.analytics.trackError(error instanceof Error ? error : new Error(String(error)), {
                    module: 'heys_day_stats_bundle_loader_v1',
                    src: src || null
                });
            }
        } catch (_) {
            // noop
        }
    }

    function loadSequential(index) {
        if (index >= scripts.length) return;
        const script = document.createElement('script');
        script.src = scripts[index];
        script.async = false;
        script.defer = true;
        script.onload = () => loadSequential(index + 1);
        script.onerror = () => {
            reportError(new Error('Failed to load ' + scripts[index]), scripts[index]);
        };
        document.head.appendChild(script);
    }

    try {
        loadSequential(0);
    } catch (e) {
        reportError(e, 'init');
    }
})(window);
