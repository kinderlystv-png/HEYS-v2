// heys_app_overlays_v1.js — Overlays and banners wrapper

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const KEYBOARD_DISMISS_BOTTOM_VAR = '--heys-keyboard-dismiss-bottom';
    const KEYBOARD_DISMISS_RIGHT_VAR = '--heys-keyboard-dismiss-right';
    const KEYBOARD_DISMISS_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
    const KEYBOARD_DISMISS_DISABLED_SELECTOR = '[data-keyboard-dismiss="off"], [data-no-keyboard-dismiss]';
    const KEYBOARD_DISMISS_BLOCKED_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

    function getEditableElement(target) {
        if (!target || typeof target !== 'object') return null;

        const candidate = typeof target.closest === 'function'
            ? target.closest(KEYBOARD_DISMISS_SELECTOR)
            : target;

        if (!candidate || candidate.nodeType !== 1) return null;
        if (typeof candidate.closest === 'function' && candidate.closest(KEYBOARD_DISMISS_DISABLED_SELECTOR)) {
            return null;
        }

        if (candidate.matches?.('textarea')) {
            return candidate.disabled || candidate.readOnly ? null : candidate;
        }

        if (candidate.matches?.('input')) {
            const inputType = String(candidate.type || 'text').toLowerCase();
            if (candidate.disabled || candidate.readOnly || KEYBOARD_DISMISS_BLOCKED_INPUT_TYPES.has(inputType)) {
                return null;
            }
            return candidate;
        }

        return candidate.isContentEditable ? candidate : null;
    }

    function isMobileKeyboardContext() {
        if (typeof window === 'undefined') return false;

        const viewportWidth = Math.round(
            window.visualViewport?.width
            || window.innerWidth
            || document.documentElement?.clientWidth
            || 0,
        );
        const hasCoarsePointer = typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false;
        const hasTouchPoints = Number(window.navigator?.maxTouchPoints || 0) > 0;

        return viewportWidth <= 900 && (hasCoarsePointer || hasTouchPoints);
    }

    // iOS has a native keyboard dismiss button (▼) in the keyboard toolbar — no need for ours.
    function isIOSDevice() {
        if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
    }

    // Returns true only when the software keyboard is actually open (visualViewport shrinks).
    function isKeyboardActuallyVisible() {
        if (typeof window === 'undefined') return false;
        const vp = window.visualViewport;
        if (!vp) return false;
        const layoutHeight = Math.round(window.innerHeight || 0);
        const viewportHeight = Math.round(vp.height || layoutHeight);
        const viewportOffsetTop = Math.round(vp.offsetTop || 0);
        return (layoutHeight - viewportHeight - viewportOffsetTop) > 80;
    }

    function getBottomTabsOccupiedPx() {
        if (typeof document === 'undefined') return 0;

        const tabs = document.querySelector('.tabs');
        if (!tabs) return 0;

        const rect = tabs.getBoundingClientRect();
        if (!rect || rect.height <= 0) return 0;

        return Math.max(0, Math.round(window.innerHeight - rect.top));
    }

    function getKeyboardDismissOffsets() {
        if (typeof window === 'undefined') {
            return { bottom: 84, right: 12 };
        }

        const visualViewport = window.visualViewport;
        const layoutWidth = Math.max(
            0,
            Math.round(window.innerWidth || document.documentElement?.clientWidth || 0),
        );
        const layoutHeight = Math.max(
            0,
            Math.round(window.innerHeight || document.documentElement?.clientHeight || 0),
        );
        const viewportWidth = Math.max(0, Math.round(visualViewport?.width || layoutWidth));
        const viewportHeight = Math.max(0, Math.round(visualViewport?.height || layoutHeight));
        const viewportOffsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
        const viewportOffsetLeft = Math.max(0, Math.round(visualViewport?.offsetLeft || 0));
        const keyboardInset = Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop);
        const rightInset = Math.max(0, layoutWidth - viewportWidth - viewportOffsetLeft);
        const bottomTabsPx = getBottomTabsOccupiedPx();

        return {
            bottom: Math.max(12, Math.max(keyboardInset, bottomTabsPx) + 12),
            right: Math.max(12, rightInset + 12),
        };
    }

    function AppOverlays(props) {
        const {
            gate,
            desktopGate,
            consentGate,
            optionalOutdatedTypes,
            onOptionalReconsent,
            reconsentOpen,
            onReconsentDone,
            onReconsentClose,
            isConsentBlocking,
            isMorningCheckinBlocking,
            showMorningCheckin,
            setShowMorningCheckin,
            showOfflineBanner,
            showOnlineBanner,
            offlineDuration,
            pendingCount,
            showSyncLockOverlay,
            showSlowInternetHint,
            showPwaBanner,
            showIosPwaBanner,
            handlePwaInstall,
            dismissPwaBanner,
            dismissIosPwaBanner,
            notification,
            dismissNotification,
            widgetsEditMode,
            tab,
            AppShell,
            appShellProps,
            showWhatsNew,
            dismissWhatsNew,
        } = props;

        const [checkinMountKey, setCheckinMountKey] = React.useState('boot');
        const [checkinMode, setCheckinMode] = React.useState(undefined);
        const activeEditableRef = React.useRef(null);
        const [showKeyboardDismiss, setShowKeyboardDismiss] = React.useState(false);

        const syncKeyboardDismiss = React.useCallback(() => {
            if (typeof window === 'undefined' || typeof document === 'undefined') return;

            const root = document.documentElement;
            const activeEditable = getEditableElement(document.activeElement);
            const offsets = getKeyboardDismissOffsets();

            activeEditableRef.current = activeEditable;
            root.style.setProperty(KEYBOARD_DISMISS_BOTTOM_VAR, `${offsets.bottom}px`);
            root.style.setProperty(KEYBOARD_DISMISS_RIGHT_VAR, `${offsets.right}px`);

            const shouldShow = Boolean(activeEditable) && isMobileKeyboardContext() && !isIOSDevice() && isKeyboardActuallyVisible();
            setShowKeyboardDismiss((prev) => (prev === shouldShow ? prev : shouldShow));
        }, []);

        const handleDismissKeyboard = React.useCallback(() => {
            if (typeof document === 'undefined') return;

            const activeEditable = activeEditableRef.current || getEditableElement(document.activeElement);
            console.info('[HEYS.keyboard] Dismiss requested');

            if (activeEditable && typeof activeEditable.blur === 'function') {
                activeEditable.blur();
            }

            const fallbackActive = document.activeElement;
            if (fallbackActive && fallbackActive !== document.body && typeof fallbackActive.blur === 'function') {
                fallbackActive.blur();
            }

            try {
                window.getSelection?.()?.removeAllRanges?.();
            } catch (_) {
                // noop
            }

            activeEditableRef.current = null;
            setShowKeyboardDismiss(false);
        }, []);

        React.useEffect(() => {
            if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

            console.info('[HEYS.keyboard] Dismiss toolbar ready');

            let rafId = 0;
            const scheduleSync = () => {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    rafId = 0;
                    syncKeyboardDismiss();
                });
            };

            const handleFocusIn = (event) => {
                if (!getEditableElement(event.target)) return;
                scheduleSync();
            };

            const handleFocusOut = () => {
                setTimeout(syncKeyboardDismiss, 0);
            };

            syncKeyboardDismiss();

            document.addEventListener('focusin', handleFocusIn);
            document.addEventListener('focusout', handleFocusOut);
            window.addEventListener('resize', scheduleSync, { passive: true });
            window.addEventListener('orientationchange', scheduleSync, { passive: true });

            const visualViewport = window.visualViewport;
            visualViewport?.addEventListener('resize', scheduleSync);
            visualViewport?.addEventListener('scroll', scheduleSync);

            return () => {
                if (rafId) cancelAnimationFrame(rafId);
                document.removeEventListener('focusin', handleFocusIn);
                document.removeEventListener('focusout', handleFocusOut);
                window.removeEventListener('resize', scheduleSync);
                window.removeEventListener('orientationchange', scheduleSync);
                visualViewport?.removeEventListener('resize', scheduleSync);
                visualViewport?.removeEventListener('scroll', scheduleSync);
                document.documentElement.style.removeProperty(KEYBOARD_DISMISS_BOTTOM_VAR);
                document.documentElement.style.removeProperty(KEYBOARD_DISMISS_RIGHT_VAR);
            };
        }, [syncKeyboardDismiss]);

        const shouldShowSlowInternetHint = showSlowInternetHint;
        const isRouteLevelGate = ['trial-intake', 'subscription-loading', 'subscription-waiting']
            .includes(consentGate?.key);

        // The protected intake is a route-level screen, not a modal over the
        // regular app. Do not let profile onboarding, check-ins, banners or
        // the app shell compete for focus while that route is active.
        if (isRouteLevelGate) {
            return consentGate;
        }

        return React.createElement(
            React.Fragment,
            null,
            gate,
            desktopGate,
            consentGate,
            // heys/d8f2b0 — мягкий призыв переподписать необязательный документ.
            // Sticky-полоса поверх приложения, а не вместо него: доступ к сервису
            // не зависит от согласия на доступ куратора, push или маркетинг.
            // Над блокирующим гейтом не рисуем — там и так есть что читать.
            !isConsentBlocking
                && (optionalOutdatedTypes || []).length > 0
                && HEYS.Consents?.ConsentOutdatedBanner
                && React.createElement(HEYS.Consents.ConsentOutdatedBanner, {
                    key: 'optional-outdated-banner',
                    outdatedTypes: optionalOutdatedTypes,
                    graceExpiresAt: null,
                    onClick: onOptionalReconsent,
                }),
            // Лист повторной подписи — поверх баннера, открывается кликом по нему.
            reconsentOpen && HEYS.Consents?.ReconsentSheet
                && React.createElement(HEYS.Consents.ReconsentSheet, {
                    key: 'reconsent-sheet',
                    outdatedTypes: optionalOutdatedTypes,
                    onDone: onReconsentDone,
                    onClose: onReconsentClose,
                }),
            // === MORNING CHECK-IN (вес, сон, шаги — показывается ВМЕСТО контента, НО после согласий) ===
            // Крестика нет: выход только вперёд. После регистрации «Начать чек-ин»
            // перемонтирует мастер с mode=daily (новый key сбрасывает planRef).
            !isConsentBlocking && isMorningCheckinBlocking && React.createElement(HEYS.MorningCheckin, {
                key: checkinMountKey,
                mode: checkinMode,
                onComplete: (result) => {
                    if (result && result.startDailyCheckin) {
                        setCheckinMode('daily');
                        setCheckinMountKey('daily-' + Date.now());
                        setShowMorningCheckin(true);
                        return;
                    }
                    setShowMorningCheckin(false);
                    setCheckinMode(undefined);
                    setCheckinMountKey('boot');
                    try {
                        const homeTab = HEYS.AppTabState?.resolveHomeTab?.('widgets') || 'widgets';
                        HEYS.App?.setTab?.(homeTab);
                    } catch (_) { /* noop */ }
                }
            }),
            // === OFFLINE BANNER (показывается пока нет сети) ===
            !isConsentBlocking && !isMorningCheckinBlocking && showOfflineBanner && React.createElement(
                'div',
                { className: 'offline-banner offline-banner-enhanced' },
                React.createElement('span', { className: 'offline-banner-icon pulse' }, '📡'),
                React.createElement('div', { className: 'offline-banner-content' },
                    React.createElement('span', { className: 'offline-banner-text' },
                        HEYS.Day?.__offlineColdStart
                            ? '⚠️ Нет сети — данные за сегодня не загружены'
                            : 'Нет сети — работаете с сохранёнными данными'
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
            !isConsentBlocking && !isMorningCheckinBlocking && !showWhatsNew && showSyncLockOverlay && !(typeof window !== 'undefined' && window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled) && React.createElement(
                'div',
                {
                    className: 'sync-lock-overlay',
                    // role/aria-live сняты намеренно: знак ожидания внутри —
                    // сам живая область, а вложенные два role='status' дают
                    // двойное объявление. Подсказка о медленной сети получила
                    // свою область: она приходит отдельно и позже.
                    'aria-busy': 'true',
                },
                React.createElement('div', { className: 'sync-lock-overlay__card' },
                    // Строки «источник» и «форма» канваса знака ожидания: знак
                    // в продукте один. Здесь был свой круг 74 px с облаком
                    // внутри и оборотом 0,9 с — второй знак ожидания на самом
                    // заметном экране, к тому же голубой числами, а не ролью.
                    // Под «уменьшить движение» он замирал совсем, а строка
                    // «уменьшенное движение · дыхание» запрещает это дословно:
                    // общий знак несёт animate-always и в этом режиме дышит.
                    //
                    // Режим embedded, а не screen: экран показывают после 10–15 с
                    // ожидания, и ступени знака (300 мс до появления, 2 с до
                    // подписи) отсчитались бы заново — человек смотрел бы в пустую
                    // карточку ещё две секунды.
                    (HEYS.WaitMark && HEYS.WaitMark.render)
                        ? HEYS.WaitMark.render(React, {
                            mode: 'embedded',
                            state: 'wait',
                            title: 'Синхронизируем',
                            text: pendingCount > 0
                                ? 'Отправляем последние изменения в облако'
                                : 'Забираем данные из облака',
                            sr: 'Синхронизируем',
                        })
                        : React.createElement('div', { className: 'sync-lock-overlay__title', role: 'status' }, 'Синхронизируем'),
                    shouldShowSlowInternetHint && React.createElement(
                        'div',
                        { className: 'sync-lock-overlay__hint', role: 'status' },
                        'Похоже, интернет нестабильный — приложению просто нужно чуть больше времени на синхронизацию.'
                    ),
                    shouldShowSlowInternetHint && React.createElement(
                        'div',
                        { className: 'sync-lock-overlay__vpn-badge' },
                        React.createElement('span', { className: 'sync-lock-overlay__vpn-badge-icon', 'aria-hidden': 'true' }, '🔒'),
                        React.createElement('span', { className: 'sync-lock-overlay__vpn-badge-text' }, 'Включён VPN? Попробуйте отключить — ускорит синхронизацию')
                    )
                )
            ),
            // === PWA Install Banner for Android/Desktop (только после Morning Check-in) ===
            !isMorningCheckinBlocking && showPwaBanner && !(typeof window !== 'undefined' && window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled) && React.createElement(
                'div',
                { className: 'pwa-install-banner pwa-install-banner--android' },
                React.createElement('div', { className: 'pwa-banner-content pwa-banner-content--android' },
                    React.createElement('div', { className: 'pwa-banner-main' },
                        React.createElement('div', { className: 'pwa-banner-text' },
                            React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                            React.createElement('div', { className: 'pwa-banner-desc' }, 'Иконка на главном экране — открывается сразу')
                        ),
                        React.createElement('button', {
                            type: 'button',
                            className: 'pwa-banner-install',
                            onClick: handlePwaInstall
                        }, 'Установить')
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'pwa-banner-later',
                        onClick: dismissPwaBanner
                    }, 'Позже')
                )
            ),
            // === iOS Safari PWA Banner ===
            !isMorningCheckinBlocking && showIosPwaBanner && !(typeof window !== 'undefined' && window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled) && React.createElement(
                'div',
                { className: 'pwa-install-banner ios-pwa-banner' },
                React.createElement('div', { className: 'pwa-banner-content ios-banner-content' },
                    React.createElement('div', { className: 'ios-sheet-handle', 'aria-hidden': 'true' }),
                    React.createElement('div', { className: 'pwa-banner-title' }, 'Установить HEYS'),
                    React.createElement('div', { className: 'ios-benefit-hint' },
                        'На весь экран, с главного экрана — и без сети'
                    ),
                    React.createElement('div', { className: 'ios-steps' },
                        React.createElement('div', { className: 'ios-step' },
                            React.createElement('span', { className: 'ios-step-num' }, '1'),
                            React.createElement('span', { className: 'ios-step-text' }, 'Нажмите'),
                            React.createElement('span', { className: 'ios-share-icon', 'aria-hidden': 'true' },
                                React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
                                    React.createElement('path', { d: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8' }),
                                    React.createElement('polyline', { points: '16 6 12 2 8 6' }),
                                    React.createElement('line', { x1: 12, y1: 2, x2: 12, y2: 15 })
                                )
                            ),
                            React.createElement('span', { className: 'ios-step-text' }, 'внизу экрана')
                        ),
                        React.createElement('div', { className: 'ios-step' },
                            React.createElement('span', { className: 'ios-step-num' }, '2'),
                            React.createElement('span', { className: 'ios-step-text' }, '«На экран Домой»')
                        )
                    ),
                    React.createElement('button', {
                        type: 'button',
                        className: 'ios-got-it-btn',
                        onClick: dismissIosPwaBanner
                    }, 'Понял')
                )
            ),
            // === Обычный тост приложения ===
            // Тост «Доступна новая версия» стоял здесь же и удалён 25 августа:
            // pwa-update.v4.dc.html, «мягкие уведомления» — не рисуем. Классы
            // .update-toast остались историческим именем: их носит этот,
            // обычный тост, и переименование задело бы только вёрстку.
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
            HEYS.ReleaseFeatures?.whatsNewEnabled === true && !isConsentBlocking && !isMorningCheckinBlocking && showWhatsNew && HEYS.WhatsNew && React.createElement(HEYS.WhatsNew.WhatsNewModal, {
                onClose: dismissWhatsNew,
            }),
            // === Client Switch Overlay (curator only, self-managed via events) ===
            HEYS.ClientSwitchOverlay && React.createElement(HEYS.ClientSwitchOverlay),
            showKeyboardDismiss && React.createElement(
                'div',
                { className: 'heys-keyboard-dismiss', role: 'presentation' },
                React.createElement('button', {
                    type: 'button',
                    className: 'heys-keyboard-dismiss__button',
                    onClick: handleDismissKeyboard,
                    'aria-label': 'Скрыть клавиатуру',
                },
                    React.createElement('span', { className: 'heys-keyboard-dismiss__icon', 'aria-hidden': 'true' }, '⌄'),
                    React.createElement('span', { className: 'heys-keyboard-dismiss__label' }, 'Скрыть')
                )
            ),
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
