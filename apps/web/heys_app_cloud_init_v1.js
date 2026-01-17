// heys_app_cloud_init_v1.js — cloud init helpers extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppCloudInit = HEYS.AppCloudInit || {};

    HEYS.AppCloudInit.initCloud = function ({ fetcher } = {}) {
        if (!HEYS.cloud || typeof HEYS.cloud.init !== 'function') {
            return { initialized: false, reason: 'no-cloud' };
        }

        const doFetch = fetcher || fetch;

        // 🔥 Warm-up ping — прогреваем Yandex Cloud Functions
        doFetch('https://api.heyslab.ru/health', { method: 'GET' }).catch(() => { });

        // 🆕 v2025-12-22: На production используем ТОЛЬКО Yandex Cloud API
        // Supabase SDK инициализируется для совместимости cloud.signIn/signOut,
        // но основной трафик идёт через HEYS.YandexAPI
        const supabaseUrl = 'https://api.heyslab.ru';

        HEYS.cloud.init({
            url: supabaseUrl,
            anonKey:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTE1NDUsImV4cCI6MjA3MDgyNzU0NX0.Nzd8--PyGMJvIHqFoCQKNUOwpxnrAZuslQHtAjcE1Ds',
            // localhost fallback больше не нужен — используем Yandex API везде
            localhostProxyUrl: undefined,
        });

        return { initialized: true, url: supabaseUrl };
    };
})();
