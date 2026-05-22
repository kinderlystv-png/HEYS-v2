// heys_app_dependency_loader_v1.js — dependency wait & init loader extracted from heys_app_v12.js

// 🆕 PERF v9.2: Метка момента когда boot-init начал исполняться (не скачиваться)
window.__heysPerfMark && window.__heysPerfMark('boot-init: execute start');

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppDependencyLoader = HEYS.AppDependencyLoader || {};

    HEYS.AppDependencyLoader.start = function ({ initializeApp, isReactReady, isHeysReady }) {
        const bootLog = (msg) => window.__heysLog && window.__heysLog('[DEPS] ' + msg);
        bootLog('dependency loader start');
        window.__heysPerfMark && window.__heysPerfMark('boot-init: AppDependencyLoader.start');
        const INIT_RETRY_DELAY = 100;
        const INIT_LOADER_DELAY_MS = 420;
        const depsWaitStartedAt = Date.now();
        let reactCheckCount = 0;
        let _reactReadyLogged = false;
        let _heysReadyLogged = false;

        const defaultIsReactReady = () => Boolean(window.React && window.ReactDOM);

        // 🆕 Расширенная проверка HEYS модулей (включая критические для рендеринга)
        const defaultIsHeysReady = () => Boolean(
            HEYS &&
            HEYS.DayTab &&
            HEYS.Ration &&
            HEYS.UserTab &&
            // 🆕 Добавлены критические модули для рендеринга App
            HEYS.AppRootImpl &&
            HEYS.AppRootImpl.createApp &&
            HEYS.AppRootComponent &&
            HEYS.AppRootComponent.createApp
        );

        const checkReactReady = isReactReady || defaultIsReactReady;
        const checkHeysReady = isHeysReady || defaultIsHeysReady;

        const retryInit = () => {
            reactCheckCount++;
            setTimeout(initializeApp, INIT_RETRY_DELAY);
        };

        // 🆕 Recovery UI с кнопками
        // Recovery делегирована в index.html через __heysSilentRestart
        const showRecoveryUI = (reason) => {
            bootLog('delegating recovery: ' + reason);
            document.getElementById('heys-init-loader')?.remove();
            if (window.__heysSilentRestart) {
                window.__heysSilentRestart('DependencyLoader: ' + reason);
            } else {
                // Fallback если index.html recovery ещё не загрузился
                console.error('[HEYS.recovery] DependencyLoader fallback reload:', reason);
                location.reload();
            }
        };

        const waitForDependencies = (onReady) => {
            // 🔍 PWA Boot logging

            // Показываем минимальный loader только если реально подождали достаточно,
            // чтобы исключить micro-flash на быстрых сетях.
            // 🆕 Heartbeat для watchdog — скрипты ещё грузятся
            if (typeof window !== 'undefined') {
                window.__heysLoadingHeartbeat = Date.now();
            }

            const depsElapsedMs = Date.now() - depsWaitStartedAt;
            if (!document.getElementById('heys-init-loader') && depsElapsedMs < INIT_LOADER_DELAY_MS) {
                if (window.__heysInitLoaderState !== 'wait_delay') {
                    console.info('[HEYS.sceleton] ⏱️ init_wait_delay', {
                        elapsedMs: depsElapsedMs,
                        delayMs: INIT_LOADER_DELAY_MS
                    });
                    window.__heysInitLoaderState = 'wait_delay';
                }
            }

            if (depsElapsedMs >= INIT_LOADER_DELAY_MS && window.__heysInitLoaderState !== 'show_loader') {
                // P1-R: spinner заменён на heys_loading_progress_v1.js (DOM bar + chip).
                // Здесь только диспатчим прогресс-событие. Сам spinner-элемент
                // больше не создаём — progress UI уже показывает фазу "Загружаем модули..."
                bootLog('deps slow — notifying progress UI');
                console.info('[HEYS.sceleton] 🦴 init_show_loader', {
                    elapsedMs: depsElapsedMs,
                    delayMs: INIT_LOADER_DELAY_MS
                });
                window.__heysInitLoaderState = 'show_loader';
                try {
                    window.dispatchEvent(new CustomEvent('heys:progress', {
                        detail: {
                            phase: 'bundles-loading',
                            percent: 20,
                            message: 'Загружаем модули...',
                            detail: 'depsWait ' + (depsElapsedMs / 1000).toFixed(1) + 's'
                        }
                    }));
                } catch (_) { /* best-effort */ }
            }

            // 🆕 PERF v9.2: логируем первый момент готовности React и HEYS независимо
            if (!_reactReadyLogged && checkReactReady()) {
                _reactReadyLogged = true;
                window.__heysPerfMark && window.__heysPerfMark('React ready (retries=' + reactCheckCount + ')');
            }
            if (!_heysReadyLogged && checkHeysReady()) {
                _heysReadyLogged = true;
                window.__heysPerfMark && window.__heysPerfMark('HEYS deps ready (retries=' + reactCheckCount + ')');
            }

            if (checkReactReady() && checkHeysReady()) {
                bootLog('deps ready, init app');
                // Убираем loader если показывали
                document.getElementById('heys-init-loader')?.remove();
                if (window.__heysInitLoaderState !== 'ready') {
                    console.info('[HEYS.sceleton] ✅ init_ready', {
                        elapsedMs: depsElapsedMs,
                        retries: reactCheckCount
                    });
                    window.__heysInitLoaderState = 'ready';
                }
                onReady();
                // 🆕 Держим watchdog heartbeat живым пока app не готов (sync/bootstrap могут занять >10s)
                // Без этого watchdog через 10s показывает recovery UI несмотря на активную загрузку
                (function keepHeartbeat() {
                    if (window.__heysAppReady) return;
                    window.__heysLoadingHeartbeat = Date.now();
                    setTimeout(keepHeartbeat, 2000);
                })();
                return;
            }

            reactCheckCount++;
            // Логируем каждые 50 проверок чтобы не спамить консоль
            if (reactCheckCount % 50 === 0) {
                bootLog('waiting #' + reactCheckCount + ' React:' + checkReactReady() + ' HEYS:' + checkHeysReady());
            }

            // 🆕 Защита от зависания — макс 300 попыток (30 секунд)
            // На throttled сетях скрипты грузятся долго, 5s недостаточно
            if (reactCheckCount > 300) {
                console.error('[HEYS] ❌ Timeout waiting for dependencies!');
                console.error('React ready:', checkReactReady());
                console.error('HEYS ready:', checkHeysReady());

                // Детальная диагностика отсутствующих модулей
                const missing = [];
                if (!HEYS.DayTab) missing.push('DayTab');
                if (!HEYS.Ration) missing.push('Ration');
                if (!HEYS.UserTab) missing.push('UserTab');
                if (!HEYS.AppRootImpl) missing.push('AppRootImpl');
                if (!HEYS.AppRootComponent) missing.push('AppRootComponent');
                console.error('Missing modules:', missing.join(', ') || 'none');

                bootLog('TIMEOUT! Missing: ' + (missing.join(', ') || 'unknown'));

                showRecoveryUI(missing.length
                    ? `Не загружены модули: ${missing.join(', ')}`
                    : 'Превышено время ожидания загрузки'
                );
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
