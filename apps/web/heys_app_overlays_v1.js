// heys_app_overlays_v1.js — Overlays and banners wrapper

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    function AppOverlays(props) {
        const {
            gate,
            desktopGate,
            consentGate,
            isConsentBlocking,
            isMorningCheckinBlocking,
            showMorningCheckin,
            setShowMorningCheckin,
            showOfflineBanner,
            showOnlineBanner,
            offlineDuration,
            pendingCount,
            showPwaBanner,
            showIosPwaBanner,
            handlePwaInstall,
            dismissPwaBanner,
            dismissIosPwaBanner,
            showUpdateToast,
            handleUpdate,
            dismissUpdateToast,
            notification,
            dismissNotification,
            widgetsEditMode,
            tab,
            AppShell,
            appShellProps,
            showWhatsNew,
            dismissWhatsNew,
        } = props;

        return React.createElement(
            React.Fragment,
            null,
            gate,
            desktopGate,
            consentGate,
            // === MORNING CHECK-IN (вес, сон, шаги — показывается ВМЕСТО контента, НО после согласий) ===
            !isConsentBlocking && isMorningCheckinBlocking && React.createElement(HEYS.MorningCheckin, {
                onComplete: () => {
                    setShowMorningCheckin(false);
                },
                onClose: () => {
                    // Закрытие крестиком — скрываем до следующей перезагрузки страницы
                    // При reload чек-ин снова появится если не заполнен вес
                    setShowMorningCheckin(false);
                }
            }),
            // === OFFLINE BANNER (показывается пока нет сети) ===
            !isConsentBlocking && !isMorningCheckinBlocking && showOfflineBanner && React.createElement(
                'div',
                { className: 'offline-banner offline-banner-enhanced' },
                React.createElement('span', { className: 'offline-banner-icon pulse' }, '📡'),
                React.createElement('div', { className: 'offline-banner-content' },
                    React.createElement('span', { className: 'offline-banner-text' },
                        'Нет сети — данные сохраняются локально'
                    ),
                    // 🆕 Показываем время офлайн если >10 секунд
                    offlineDuration > 10 && React.createElement('span', { className: 'offline-banner-duration' },
                        `Офлайн ${offlineDuration < 60 ? `${offlineDuration} сек` : `${Math.floor(offlineDuration / 60)} мин`}`
                    )
                )
            ),
            // === ONLINE BANNER (показывается 2 сек при восстановлении сети) ===
            !isConsentBlocking && !isMorningCheckinBlocking && showOnlineBanner && React.createElement(
                'div',
                { className: 'online-banner' },
                React.createElement('span', { className: 'online-banner-icon' }, '✓'),
                React.createElement('span', { className: 'online-banner-text' },
                    pendingCount > 0 ? 'Сеть восстановлена — синхронизация...' : 'Сеть восстановлена'
                )
            ),
            // Toast убран — отвлекает
            // Основной контент — скрыт во время Morning Check-in, Consent Screen или когда показывается gate (login/client select)
            React.createElement(AppShell, appShellProps),
            // === PWA Install Banner for Android/Desktop (только после Morning Check-in) ===
            !isMorningCheckinBlocking && showPwaBanner && React.createElement(
                'div',
                { className: 'pwa-install-banner' },
                React.createElement('div', { className: 'pwa-banner-content' },
                    React.createElement('div', { className: 'pwa-banner-icon' }, '📱'),
                    React.createElement('div', { className: 'pwa-banner-text' },
                        React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                        React.createElement('div', { className: 'pwa-banner-desc' }, 'Быстрый доступ с главного экрана')
                    ),
                    React.createElement('div', { className: 'pwa-banner-actions' },
                        React.createElement('button', {
                            className: 'pwa-banner-install',
                            onClick: handlePwaInstall
                        }, 'Установить'),
                        React.createElement('button', {
                            className: 'pwa-banner-dismiss',
                            onClick: dismissPwaBanner
                        }, '✕')
                    )
                )
            ),
            // === iOS Safari PWA Banner ===
            !isMorningCheckinBlocking && showIosPwaBanner && React.createElement(
                'div',
                { className: 'pwa-install-banner ios-pwa-banner' },
                React.createElement('div', { className: 'pwa-banner-content ios-banner-content' },
                    React.createElement('div', { className: 'pwa-banner-icon' }, '📲'),
                    React.createElement('div', { className: 'pwa-banner-text' },
                        React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                        React.createElement('div', { className: 'ios-benefit-hint' },
                            '✨ Полный экран • Быстрый доступ • Работа offline'
                        ),
                        React.createElement('div', { className: 'ios-steps' },
                            React.createElement('div', { className: 'ios-step' },
                                React.createElement('span', { className: 'ios-step-num' }, '1'),
                                'Нажмите ',
                                React.createElement('span', { className: 'ios-share-icon' },
                                    React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
                                        React.createElement('path', { d: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8' }),
                                        React.createElement('polyline', { points: '16 6 12 2 8 6' }),
                                        React.createElement('line', { x1: 12, y1: 2, x2: 12, y2: 15 })
                                    )
                                ),
                                ' внизу'
                            ),
                            React.createElement('div', { className: 'ios-step' },
                                React.createElement('span', { className: 'ios-step-num' }, '2'),
                                '«На экран Домой»'
                            )
                        )
                    ),
                    React.createElement('button', {
                        className: 'ios-got-it-btn',
                        onClick: dismissIosPwaBanner
                    }, 'Понял')
                ),
                React.createElement('div', { className: 'ios-arrow-hint' },
                    React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'currentColor' },
                        React.createElement('path', { d: 'M12 16l-6-6h12l-6 6z' })
                    )
                )
            ),
            // === Update Toast (только после Morning Check-in) ===
            !isMorningCheckinBlocking && showUpdateToast && React.createElement(
                'div',
                { className: 'update-toast' },
                React.createElement('div', { className: 'update-toast-content' },
                    React.createElement('span', { className: 'update-toast-icon' }, '🚀'),
                    React.createElement('span', { className: 'update-toast-text' }, 'Доступна новая версия!'),
                    React.createElement('button', {
                        className: 'update-toast-btn',
                        onClick: handleUpdate
                    }, 'Обновить'),
                    React.createElement('button', {
                        className: 'update-toast-dismiss',
                        onClick: dismissUpdateToast
                    }, '✕')
                )
            ),
            // === App Notification Toast ===
            !isMorningCheckinBlocking && notification && React.createElement(
                'div',
                { className: 'update-toast' },
                React.createElement('div', { className: 'update-toast-content' },
                    React.createElement('span', { className: 'update-toast-icon' }, notification.icon || (notification.type === 'success' ? '✅' : notification.type === 'error' ? '⚠️' : 'ℹ️')),
                    React.createElement('span', { className: 'update-toast-text' }, notification.message || ''),
                    React.createElement('button', {
                        className: 'update-toast-dismiss',
                        onClick: dismissNotification
                    }, '✕')
                )
            ),
            // === What's New modal (after update) ===
            !isConsentBlocking && !isMorningCheckinBlocking && showWhatsNew && HEYS.WhatsNew && React.createElement(HEYS.WhatsNew.WhatsNewModal, {
                onClose: dismissWhatsNew,
            }),
            // === FAB редактирования виджетов (глобальный, показывается на ВСЕХ вкладках в режиме редактирования) ===
            widgetsEditMode && tab !== 'widgets' && React.createElement(
                'div',
                { className: 'widgets-fab-left widgets-fab-global' },
                React.createElement('button', {
                    className: 'widgets-edit-fab active',
                    onClick: () => {
                        // Выходим из режима редактирования
                        if (window.HEYS?.Widgets?.toggleEditMode) {
                            window.HEYS.Widgets.toggleEditMode();
                        }
                    },
                    'aria-label': 'Завершить выбор домашней вкладки'
                }, '✓')
            ),
        );
    }

    const MemoAppOverlays = React.memo(AppOverlays);
    MemoAppOverlays.displayName = 'AppOverlays';

    HEYS.AppOverlays = {
        AppOverlays: MemoAppOverlays,
    };
})();
