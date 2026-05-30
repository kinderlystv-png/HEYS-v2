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
        // Wave 3 — Integration UI (зависят от Wave 2 catalogs/visuals/timer)
        'heys_fingers_muscle_detail_v1.js',     // drill-down per muscle
        'heys_fingers_constructor_v1.js',       // exercise editor (depends на grip_catalog, anatomy, records, ageGate)
        'heys_fingers_onboarding_v1.js',        // wizard (depends на programs, ageGate, calibration)
        'heys_fingers_session_ui_v1.js',        // 4-tab UI (depends на ВСЕ выше)
        'heys_fingers_fullscreen_v1.js',        // portal orchestrator (depends на SessionUI + Onboarding)
        'heys_fingers_entry_v1.js'              // entry LAST — exposes openFullscreen() public API
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
