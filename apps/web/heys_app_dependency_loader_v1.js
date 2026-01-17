// heys_app_dependency_loader_v1.js — dependency wait & init loader extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppDependencyLoader = HEYS.AppDependencyLoader || {};

    HEYS.AppDependencyLoader.start = function ({ initializeApp, isReactReady, isHeysReady }) {
        const bootLog = (msg) => window.__heysLog && window.__heysLog('[DEPS] ' + msg);
        bootLog('dependency loader start');
        const INIT_RETRY_DELAY = 100;
        let reactCheckCount = 0;

        const defaultIsReactReady = () => Boolean(window.React && window.ReactDOM);
        const defaultIsHeysReady = () => Boolean(
            HEYS &&
            HEYS.DayTab &&
            HEYS.Ration &&
            HEYS.UserTab
        );

        const checkReactReady = isReactReady || defaultIsReactReady;
        const checkHeysReady = isHeysReady || defaultIsHeysReady;

        const retryInit = () => {
            reactCheckCount++;
            setTimeout(initializeApp, INIT_RETRY_DELAY);
        };

        const waitForDependencies = (onReady) => {
            // 🔍 PWA Boot logging

            // Показываем минимальный loader если ждём больше 200мс
            if (reactCheckCount === 2 && !document.getElementById('heys-init-loader')) {
                bootLog('showing loader (waiting for deps)');
                const loader = document.createElement('div');
                loader.id = 'heys-init-loader';
                loader.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;z-index:99999';
                loader.innerHTML = '<div style="width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#10b981;border-radius:50%;animation:spin 0.8s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
                document.body.appendChild(loader);
            }

            if (checkReactReady() && checkHeysReady()) {
                bootLog('deps ready, init app');
                // Убираем loader если показывали
                document.getElementById('heys-init-loader')?.remove();
                onReady();
                return;
            }

            reactCheckCount++;
            bootLog('waiting #' + reactCheckCount + ' React:' + checkReactReady() + ' HEYS:' + checkHeysReady());

            // Защита от зависания — макс 50 попыток (5 секунд)
            if (reactCheckCount > 50) {
                console.error('[HEYS] ❌ Timeout waiting for dependencies!');
                console.error('React ready:', checkReactReady());
                console.error('HEYS ready:', checkHeysReady());
                bootLog('TIMEOUT! React:' + checkReactReady() + ' HEYS:' + checkHeysReady());
                document.getElementById('heys-init-loader')?.remove();
                // Показываем сообщение об ошибке
                document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:system-ui"><h1>⚠️ Ошибка загрузки</h1><p>Не удалось загрузить приложение. Обновите страницу.</p><button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;background:#10b981;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer">Обновить</button></div>';
                return;
            }

            setTimeout(() => waitForDependencies(onReady), INIT_RETRY_DELAY);
        };

        if (!checkReactReady()) {
            retryInit();
            return;
        }
        if (!checkHeysReady()) {
            retryInit();
            return;
        }

        waitForDependencies(initializeApp);
    };
})();
