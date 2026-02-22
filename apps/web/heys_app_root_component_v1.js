// heys_app_root_component_v1.js — App component proxy (delegates to AppRootImpl)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRootComponent = HEYS.AppRootComponent || {};

    // 🆕 Heartbeat для watchdog — AppRootComponent загружен
    if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

    // 🆕 Recovery UI для критических ошибок загрузки
    function RecoveryScreen({ React, moduleName }) {
        const [clearing, setClearing] = React.useState(false);

        const handleReload = () => {
            window.location.reload();
        };

        const handleClearCache = async () => {
            setClearing(true);
            try {
                // Уведомляем SW о boot failure
                if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
                }

                // Очищаем кэши напрямую
                if ('caches' in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                }

                // Unregister SW
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map(reg => reg.unregister()));
                }

                // Очищаем sessionStorage
                sessionStorage.clear();

                // Перезагружаем
                window.location.reload();
            } catch (e) {
                console.error('[Recovery] Error:', e);
                window.location.reload();
            }
        };

        return React.createElement('div', {
            style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                padding: '20px',
                fontFamily: 'system-ui, sans-serif',
                background: 'var(--bg-secondary, #f3f4f6)',
                textAlign: 'center'
            }
        }, [
            React.createElement('div', {
                key: 'card',
                style: {
                    background: 'var(--card, white)',
                    borderRadius: '16px',
                    padding: '32px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    maxWidth: '400px',
                    width: '100%'
                }
            }, [
                React.createElement('div', { key: 'icon', style: { fontSize: '48px', marginBottom: '16px' } }, '⚠️'),
                React.createElement('h2', {
                    key: 'title',
                    style: { margin: '0 0 8px', fontSize: '20px', fontWeight: '600' }
                }, 'Ошибка загрузки'),
                React.createElement('p', {
                    key: 'desc',
                    style: { margin: '0 0 24px', color: '#6b7280', fontSize: '14px' }
                }, moduleName
                    ? `Модуль "${moduleName}" недоступен`
                    : 'Не удалось загрузить приложение'
                ),
                React.createElement('div', {
                    key: 'buttons',
                    style: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }
                }, [
                    React.createElement('button', {
                        key: 'reload',
                        onClick: handleReload,
                        style: {
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#10b981',
                            color: 'white',
                            fontWeight: '500',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }
                    }, '🔄 Обновить'),
                    React.createElement('button', {
                        key: 'clear',
                        onClick: handleClearCache,
                        disabled: clearing,
                        style: {
                            padding: '12px 24px',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            background: 'var(--card, white)',
                            color: 'var(--text, #374151)',
                            fontWeight: '500',
                            cursor: clearing ? 'wait' : 'pointer',
                            fontSize: '14px',
                            opacity: clearing ? 0.6 : 1
                        }
                    }, clearing ? '⏳ Очистка...' : '🗑️ Сбросить кэш')
                ])
            ])
        ]);
    }

    HEYS.AppRootComponent.createApp = function createApp({ React }) {
        const AppRootImpl = HEYS.AppRootImpl;
        if (!AppRootImpl || typeof AppRootImpl.createApp !== 'function') {
            // 🆕 Уведомляем SW о boot failure
            if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'BOOT_FAILURE' });
            }
            window.__heysLog && window.__heysLog('[CRITICAL] AppRootImpl missing!');

            return function MissingAppRootImpl() {
                return React.createElement(RecoveryScreen, { React, moduleName: 'AppRootImpl' });
            };
        }
        return AppRootImpl.createApp({ React });
    };

    // Экспорт для тестирования
    HEYS.AppRootComponent.RecoveryScreen = RecoveryScreen;
})();

