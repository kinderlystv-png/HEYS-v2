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
        'heys_day_sleep_score_popups_v1.js'
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
