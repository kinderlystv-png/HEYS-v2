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

    const STAGES = [
        { key: 'saving', label: 'Сохраняю данные…' },
        { key: 'loading', label: 'Загружаю данные…' },
        { key: 'done', label: 'Готово' },
    ];

    // Auto-advance delay from saving → loading (ms).
    // Real switchClient flushes pending (0-8s) then syncs new (1-5s).
    // We advance after 2s which roughly matches end-of-flush for typical cases.
    const SAVING_DURATION = 2000;
    // How long to keep "Готово" visible before fade-out
    const DONE_DISPLAY = 500;
    // Fade-out animation duration (matches CSS)
    const FADE_OUT = 300;

    function ClientSwitchOverlay() {
        const [visible, setVisible] = useState(false);
        const [fadingOut, setFadingOut] = useState(false);
        const [stageIdx, setStageIdx] = useState(0);
        const [targetClient, setTargetClient] = useState(null); // { id, name }
        const timerRef = useRef(null);
        const switchDoneRef = useRef(false);
        const activeSwitchRef = useRef(false);

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
                setStageIdx(0);
                setTargetClient(null);
                switchDoneRef.current = false;
            }, FADE_OUT);
        }, [cleanup]);

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
                switchDoneRef.current = false;
                setTargetClient({ id: clientId, name: name || '…' });
                setStageIdx(0);
                setFadingOut(false);
                setVisible(true);

                // Auto-advance saving → loading after SAVING_DURATION
                timerRef.current = setTimeout(() => {
                    setStageIdx(1);
                }, SAVING_DURATION);
            };

            const onChanged = () => {
                if (!activeSwitchRef.current) return;

                activeSwitchRef.current = false;
                switchDoneRef.current = true;

                cleanup();
                setStageIdx(2); // done

                timerRef.current = setTimeout(() => {
                    fadeOut();
                }, DONE_DISPLAY);
            };

            const onSyncError = () => {
                if (!activeSwitchRef.current) return;
                fadeOut();
            };

            window.addEventListener('heys:client-switching', onSwitching);
            window.addEventListener('heys:client-changed', onChanged);
            window.addEventListener('heys:sync-error', onSyncError);

            return () => {
                window.removeEventListener('heys:client-switching', onSwitching);
                window.removeEventListener('heys:client-changed', onChanged);
                window.removeEventListener('heys:sync-error', onSyncError);
                cleanup();
            };
        }, [cleanup, fadeOut]);

        if (!visible) return null;

        const helpers = HEYS.AppClientHelpers || {};
        const getInitials = helpers.getClientInitials || ((n) => n ? n.slice(0, 2).toUpperCase() : '?');
        const getColor = helpers.getAvatarColor || (() => 'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)');

        const stage = STAGES[stageIdx] || STAGES[0];
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
                    stageIdx < 2
                        ? React.createElement('span', { className: 'cso-spinner' })
                        : React.createElement('span', { className: 'cso-check' }, '✓'),
                    React.createElement('span', { className: 'cso-stage-text' }, stage.label)
                ),

                // Progress dots
                React.createElement('div', { className: 'cso-dots' },
                    STAGES.map((s, i) => React.createElement('span', {
                        key: s.key,
                        className: 'cso-dot' + (i <= stageIdx ? ' cso-dot-active' : ''),
                    }))
                )
            )
        );
    }

    const MemoOverlay = React.memo(ClientSwitchOverlay);
    MemoOverlay.displayName = 'ClientSwitchOverlay';

    HEYS.ClientSwitchOverlay = MemoOverlay;
})();
