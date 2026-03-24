// heys_app_update_checks_v1.js — update helpers extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppUpdateChecks = HEYS.AppUpdateChecks || {};

    function ensureReadyModalCloseAction(hideUpdateModal) {
        const modal = document.getElementById('heys-update-modal');
        const card = modal?.querySelector('.heys-update-modal__card');
        if (!card || typeof hideUpdateModal !== 'function') return;

        let actions = card.querySelector('.heys-update-modal__actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'heys-update-modal__actions';
            card.appendChild(actions);
        }

        let closeButton = actions.querySelector('.heys-update-modal__close-btn');
        if (!closeButton) {
            closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'heys-update-modal__close-btn';
            closeButton.textContent = 'Закрыть';
            closeButton.addEventListener('click', () => hideUpdateModal());
            actions.appendChild(closeButton);
        }
    }

    function getPwaHelpers() {
        const pwa = HEYS.PWA || {};
        return {
            showUpdateModal: pwa.showUpdateModal || window.showUpdateModal,
            updateModalStage: pwa.updateModalStage || window.updateModalStage,
            hideUpdateModal: pwa.hideUpdateModal || window.hideUpdateModal,
            checkServerVersion: pwa.checkServerVersion || window.checkServerVersion,
            isNewerVersion: pwa.isNewerVersion || null,
            version: pwa.version || HEYS.version || window.APP_VERSION || 'unknown',
        };
    }

    HEYS.AppUpdateChecks.init = function () {
        const helpers = getPwaHelpers();

        // Экспорт для ручного вызова
        HEYS.checkForUpdates = () => {
            if (helpers.showUpdateModal) {
                helpers.showUpdateModal('checking');
            }
            setTimeout(async () => {
                if (!helpers.checkServerVersion) return;
                const hasUpdate = await helpers.checkServerVersion(false);
                if (!hasUpdate && helpers.updateModalStage && helpers.hideUpdateModal) {
                    helpers.updateModalStage('ready');
                    const title = document.getElementById('heys-update-title');
                    const subtitle = document.getElementById('heys-update-subtitle');
                    const icon = document.getElementById('heys-update-icon');
                    if (title) title.textContent = 'Всё актуально!';
                    if (subtitle) subtitle.textContent = 'У вас последняя версия — закройте это окно, когда будете готовы';
                    if (icon) icon.textContent = '✅';
                    ensureReadyModalCloseAction(helpers.hideUpdateModal);
                }
            }, 800);
        };

        // Тихая проверка версии (без UI) — для pull-to-refresh
        HEYS.checkVersionSilent = async () => {
            try {
                if (helpers.checkServerVersion) {
                    await helpers.checkServerVersion(true);
                }
            } catch (e) {
                // Silent fail
            }
        };

        // === Принудительная проверка и обновление (для pull-to-refresh) ===
        // Возвращает Promise<{ hasUpdate: boolean, version?: string }>
        HEYS.forceCheckAndUpdate = async function () {
            try {
                // 1. Проверяем версию с сервера (без UI)
                const cacheBust = Date.now();
                const response = await fetch(`/build-meta.json?_cb=${cacheBust}`, {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
                });

                if (!response.ok) {
                    console.log('[PWA Update] build-meta.json not available');
                    return { hasUpdate: false };
                }

                const data = await response.json();
                const isNewer = helpers.isNewerVersion;
                if (!isNewer) {
                    console.log('[PWA Update] isNewerVersion not available');
                    return { hasUpdate: false };
                }

                const currentVersion = helpers.version;

                // 2. Сравниваем версии
                if (!data.version || !isNewer(data.version, currentVersion)) {
                    console.log('[PWA Update] No update available | server:', data.version, '| local:', currentVersion);
                    return { hasUpdate: false };
                }

                console.log('[PWA Update] 🆕 Update available!', currentVersion, '→', data.version);

                // ✅ Маркер: при обновлении требуется logout + чистка сессии
                try {
                    sessionStorage.setItem('heys_update_requires_logout', 'true');
                } catch (e) { }

                // 3. Принудительная очистка всех кэшей через SW
                if (navigator.serviceWorker?.controller) {
                    // 🔒 Guard: сообщаем platform_apis что update_checks управляет lifecycle
                    // Без этого флага CACHES_CLEARED handler в platform_apis сделает
                    // location.reload() через 100ms, не дождавшись triggerSkipWaiting
                    try {
                        sessionStorage.setItem('heys_update_managed_by_checks', 'true');
                    } catch (e) { }

                    console.log('[PWA Update] 🗑️ Clearing all caches...');
                    navigator.serviceWorker.controller.postMessage('clearAllCaches');

                    // Ждём подтверждения очистки кэшей (макс 2 сек)
                    await new Promise((resolve) => {
                        const timeout = setTimeout(resolve, 2000);
                        const handler = (event) => {
                            if (event.data?.type === 'CACHES_CLEARED') {
                                clearTimeout(timeout);
                                navigator.serviceWorker.removeEventListener('message', handler);
                                resolve();
                            }
                        };
                        navigator.serviceWorker.addEventListener('message', handler);
                    });

                    // 4. Принудительно обновляем SW
                    console.log('[PWA Update] 🔄 Updating Service Worker...');
                    const registration = await navigator.serviceWorker.getRegistration();
                    if (registration) {
                        await registration.update();
                    }

                    // 5. skipWaiting для немедленной активации нового SW (через централизованную функцию)
                    HEYS.PlatformAPIs?.triggerSkipWaiting?.({
                        fallbackMs: 5000,
                        showModal: false,
                        source: 'HEYS.forceCheckAndUpdate',
                    });
                } else {
                    // Нет SW — просто устанавливаем флаги для reload
                    sessionStorage.setItem('heys_pending_update', 'true');
                    sessionStorage.setItem('heys_force_sync_after_update', 'true');
                }

                // ⚠️ VERSION_KEY теперь сохраняется в triggerSkipWaiting ТОЛЬКО после успешного reload
                // Это предотвращает ситуацию когда версия помечена как обновлённая, но reload не произошёл

                return { hasUpdate: true, version: data.version };
            } catch (e) {
                console.warn('[PWA Update] Check failed:', e.message);
                return { hasUpdate: false, error: e.message };
            }
        };
    };

    HEYS.AppUpdateChecks.init();
})();
