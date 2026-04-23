// heys_client_switch_overlay_v1.js — Full-screen overlay during curator client switch
// Shows progress stages while switchClient() runs under the overlay,
// so that when overlay fades out, all widgets/tabs already display new client data.

(function () {
    'use strict';
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const { useState, useEffect, useCallback, useRef } = React;

    // Resolve target client name from localStorage cache
    function resolveClientName(clientId) {
        try {
            const raw = localStorage.getItem('heys_clients');
            if (!raw) return null;
            const clients = JSON.parse(raw);
            if (!Array.isArray(clients)) return null;
            const c = clients.find(x => x.id === clientId);
            return c?.name || null;
        } catch (_) { return null; }
    }

    const STAGES = {
        preparing: { key: 'preparing', label: 'Переключаю клиента…', step: 0 },
        saving: { key: 'saving', label: 'Сохраняю изменения…', step: 0 },
        loading: { key: 'loading', label: 'Загружаю данные…', step: 1 },
        done: { key: 'done', label: 'Готово', step: 2 },
        error: { key: 'error', label: 'Не удалось переключить', step: 2 },
    };

    // How long to keep "Готово" visible before fade-out
    const DONE_DISPLAY = 500;
    // Fade-out animation duration (matches CSS)
    const FADE_OUT = 300;

    function ClientSwitchOverlay() {
        const [visible, setVisible] = useState(false);
        const [fadingOut, setFadingOut] = useState(false);
        const [stageKey, setStageKey] = useState('preparing');
        const [targetClient, setTargetClient] = useState(null); // { id, name }
        const timerRef = useRef(null);
        const activeSwitchRef = useRef(false);
        const activeClientIdRef = useRef(null);

        const cleanup = useCallback(() => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        }, []);

        // Fade out and hide
        const fadeOut = useCallback(() => {
            cleanup();
            activeSwitchRef.current = false;
            setFadingOut(true);
            timerRef.current = setTimeout(() => {
                setVisible(false);
                setFadingOut(false);
                setStageKey('preparing');
                setTargetClient(null);
                activeClientIdRef.current = null;
            }, FADE_OUT);
        }, [cleanup]);

        // Dismiss after switchClient finishes (emitSwitchStage 'done') OR after gate/shell dispatches
        // heys:client-changed. Relying only on client-changed races useSyncEffects dedupe/order.
        const completeAndFade = useCallback(() => {
            if (!activeSwitchRef.current) return;
            activeSwitchRef.current = false;
            cleanup();
            setStageKey('done');
            timerRef.current = setTimeout(() => {
                fadeOut();
            }, DONE_DISPLAY);
        }, [cleanup, fadeOut]);

        useEffect(() => {
            // Skip for PIN clients (single-client, no switch possible)
            const isPinClient = () => HEYS.cloud?.isPinAuthClient?.() === true;

            const onSwitching = (e) => {
                if (isPinClient()) return;
                const clientId = e.detail?.clientId;
                if (!clientId) return;

                const name = resolveClientName(clientId);

                cleanup();
                activeSwitchRef.current = true;
                activeClientIdRef.current = clientId;
                setTargetClient({ id: clientId, name: name || '…' });
                setStageKey('preparing');
                setFadingOut(false);
                setVisible(true);
            };

            const onStage = (e) => {
                if (!activeSwitchRef.current) return;
                const clientId = e.detail?.clientId;
                const stage = e.detail?.stage;
                if (!stage || !STAGES[stage]) return;
                if (clientId && activeClientIdRef.current && clientId !== activeClientIdRef.current) return;
                setStageKey(stage);
                if (stage === 'done') {
                    completeAndFade();
                }
            };

            const onChanged = (e) => {
                if (!activeSwitchRef.current) return;
                const clientId = e.detail?.clientId;
                if (clientId && activeClientIdRef.current && clientId !== activeClientIdRef.current) return;
                completeAndFade();
            };

            const onSyncError = (e) => {
                if (!activeSwitchRef.current) return;
                const clientId = e.detail?.clientId;
                if (clientId && activeClientIdRef.current && clientId !== activeClientIdRef.current) return;
                cleanup();
                setStageKey('error');
                timerRef.current = setTimeout(() => {
                    fadeOut();
                }, DONE_DISPLAY + 300);
            };

            window.addEventListener('heys:client-switching', onSwitching);
            window.addEventListener('heys:client-switch-stage', onStage);
            window.addEventListener('heys:client-changed', onChanged);
            window.addEventListener('heys:sync-error', onSyncError);

            return () => {
                window.removeEventListener('heys:client-switching', onSwitching);
                window.removeEventListener('heys:client-switch-stage', onStage);
                window.removeEventListener('heys:client-changed', onChanged);
                window.removeEventListener('heys:sync-error', onSyncError);
                cleanup();
            };
        }, [cleanup, fadeOut, completeAndFade]);

        if (!visible) return null;

        const helpers = HEYS.AppClientHelpers || {};
        const getInitials = helpers.getClientInitials || ((n) => n ? n.slice(0, 2).toUpperCase() : '?');
        const getColor = helpers.getAvatarColor || (() => 'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)');

        const stage = STAGES[stageKey] || STAGES.preparing;
        const clientName = targetClient?.name || '…';

        return React.createElement(
            'div',
            {
                className: 'cso-backdrop' + (fadingOut ? ' cso-fade-out' : ''),
                'aria-live': 'polite',
                role: 'status',
            },
            React.createElement('div', { className: 'cso-card' },
                // Avatar
                React.createElement('div', {
                    className: 'cso-avatar',
                    style: { background: getColor(clientName) },
                }, getInitials(clientName)),

                // Client name
                React.createElement('div', { className: 'cso-name' }, clientName),

                // Stage indicator
                React.createElement('div', { className: 'cso-stage', key: stage.key },
                    stage.key !== 'done'
                        && stage.key !== 'error'
                        ? React.createElement('span', { className: 'cso-spinner' })
                        : React.createElement('span', { className: 'cso-check' }, stage.key === 'error' ? '!' : '✓'),
                    React.createElement('span', { className: 'cso-stage-text' }, stage.label)
                ),

                // Progress dots
                React.createElement('div', { className: 'cso-dots' },
                    ['saving', 'loading', 'done'].map((stepKey, i) => React.createElement('span', {
                        key: stepKey,
                        className: 'cso-dot' + (i <= stage.step ? ' cso-dot-active' : ''),
                    }))
                )
            )
        );
    }

    const MemoOverlay = React.memo(ClientSwitchOverlay);
    MemoOverlay.displayName = 'ClientSwitchOverlay';

    HEYS.ClientSwitchOverlay = MemoOverlay;
})();
