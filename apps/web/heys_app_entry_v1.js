// heys_app_entry_v1.js — App entry orchestration extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppEntry = HEYS.AppEntry || {};

    HEYS.AppEntry.start = function start() {
        // 🔍 PWA Boot logging
        const bootLog = (msg) => window.__heysLog && window.__heysLog('[APP] ' + msg);
        bootLog('heys_app_entry_v1.js started');

        // 🔍 EARLY DEBUG: Проверяем auth token ДО любого кода
        try {
            const _earlyToken = localStorage.getItem('heys_supabase_auth_token');
            bootLog('auth token: ' + (_earlyToken ? 'YES' : 'NO'));
        } catch (e) {
            bootLog('auth check error: ' + e.message);
        }

        // Onboarding tour helpers moved to heys_app_onboarding_v1.js
        // Update checks moved to heys_app_update_checks_v1.js
        // Full backup export moved to heys_app_backup_export_v1.js
        // Debug panel + badge API moved to heys_app_gates_v1.js

        const AppInitializer = HEYS.AppInitializer;
        const initializeApp = AppInitializer?.initializeApp || (() => {
            window.__heysLog && window.__heysLog('[APP] AppInitializer missing, init skipped');
        });

        // Start initialization
        const startDependencyLoader = HEYS.AppDependencyLoader?.start;
        if (startDependencyLoader) {
            startDependencyLoader({ initializeApp });
        } else {
            setTimeout(() => {
                const retryStart = HEYS.AppDependencyLoader?.start;
                if (retryStart) {
                    retryStart({ initializeApp });
                    return;
                }
                window.__heysLog && window.__heysLog('[DEPS] dependency loader missing, fallback start');
                initializeApp();
            }, 100);
        }
    };
})();
