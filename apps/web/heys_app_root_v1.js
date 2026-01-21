// heys_app_root_v1.js — App component extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRoot = HEYS.AppRoot || {};

    HEYS.AppRoot.createApp = function createApp({ React }) {
        const AppRootComponent = HEYS.AppRootComponent || {};
        const createComponent = AppRootComponent.createApp;

        // 🆕 Если AppRootComponent отсутствует — используем RecoveryScreen
        if (!createComponent) {
            // Уведомляем SW о boot failure
            if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
            }
            window.__heysLog && window.__heysLog('[CRITICAL] AppRootComponent missing!');

            // Пробуем использовать RecoveryScreen если он уже доступен
            const RecoveryScreen = AppRootComponent.RecoveryScreen;
            if (RecoveryScreen) {
                return function AppWithRecovery() {
                    return React.createElement(RecoveryScreen, { React, moduleName: 'AppRootComponent' });
                };
            }

            // Минимальный fallback если RecoveryScreen тоже недоступен
            return function AppFallback() {
                return React.createElement('div', {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100vh',
                        fontFamily: 'system-ui',
                        textAlign: 'center',
                        padding: '20px'
                    }
                }, [
                    React.createElement('div', { key: 'content' }, [
                        React.createElement('div', { key: 'icon', style: { fontSize: '48px', marginBottom: '16px' } }, '⚠️'),
                        React.createElement('h2', { key: 'title', style: { margin: '0 0 16px' } }, 'Ошибка загрузки'),
                        React.createElement('button', {
                            key: 'reload',
                            onClick: () => window.location.reload(),
                            style: {
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#10b981',
                                color: 'white',
                                cursor: 'pointer'
                            }
                        }, '🔄 Обновить')
                    ])
                ]);
            };
        }

        return createComponent({ React });
    };
})();

