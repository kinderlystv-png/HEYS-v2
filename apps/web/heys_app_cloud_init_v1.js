// heys_app_cloud_init_v1.js — cloud init helpers extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppCloudInit = HEYS.AppCloudInit || {};

    HEYS.AppCloudInit.initCloud = function ({ fetcher } = {}) {
        // DEMO_MODE: do not init cloud, no health ping. Snapshot will be loaded
        // by heys_app_initialize_v1.js via HEYS.demoMode.loadSnapshot().
        if (window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled) {
            return { initialized: false, reason: 'demo-mode' };
        }
        if (!HEYS.cloud || typeof HEYS.cloud.init !== 'function') {
            return { initialized: false, reason: 'no-cloud' };
        }

        const doFetch = fetcher || fetch;
        const isLocalBrowserDev = typeof window !== 'undefined'
            && typeof window.location !== 'undefined'
            && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            && !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || ''));
        const apiBaseUrl = isLocalBrowserDev ? 'http://localhost:4001' : 'https://api.heyslab.ru';

        // 🔥 Warm-up ping — один раз за жизнь страницы (initCloud + initialize fallback делят флаг)
        if (!HEYS._heysApiHealthPingSent) {
            HEYS._heysApiHealthPingSent = true;
            doFetch(`${apiBaseUrl}/health`, { method: 'GET' }).catch(() => { });
        }

        // На production используем только Yandex Cloud API.
        const cloudApiUrl = apiBaseUrl;

        HEYS.cloud.init({
            url: cloudApiUrl,
            anonKey: '',
            localhostProxyUrl: isLocalBrowserDev ? apiBaseUrl : undefined,
        });

        return { initialized: true, url: cloudApiUrl };
    };
})();
