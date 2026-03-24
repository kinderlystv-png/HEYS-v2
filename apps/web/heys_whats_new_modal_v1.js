// heys_whats_new_modal_v1.js — "What's New" modal after PWA update
// Shows changelog with screenshots after app update

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const { useState, useEffect, useCallback, useRef } = React;

    const LS_KEY = 'heys_whats_new_last_seen';
    const FETCH_TIMEOUT = 5000;

    // --- Type badges ---
    const TYPE_CONFIG = {
        feature: { emoji: '🆕', label: 'Новое', badgeClass: 'wn-badge--feature' },
        improvement: { emoji: '✨', label: 'Улучшение', badgeClass: 'wn-badge--improvement' },
        fix: { emoji: '🔧', label: 'Исправление', badgeClass: 'wn-badge--fix' },
    };

    function getTypeConfig(type) {
        return TYPE_CONFIG[type] || TYPE_CONFIG.feature;
    }

    // --- Data fetching ---
    async function fetchWhatsNew() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const resp = await fetch(`/whats-new.json?_cb=${Date.now()}`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!resp.ok) return null;
            const data = await resp.json();
            return data && Array.isArray(data.releases) ? data : null;
        } catch {
            clearTimeout(timer);
            return null;
        }
    }

    function getLastSeenVersion() {
        try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; }
    }

    function setLastSeenVersion(version) {
        try { localStorage.setItem(LS_KEY, version); } catch { /* noop */ }
    }

    // --- Check if we should show What's New ---
    function getUnseenReleases(data) {
        if (!data || !data.releases || !data.releases.length) return [];
        const lastSeen = getLastSeenVersion();
        if (!lastSeen) {
            // First time ever — show only the latest release
            return [data.releases[0]];
        }
        const seenIndex = data.releases.findIndex((release) => release.version === lastSeen);
        if (seenIndex === 0) return [];
        if (seenIndex > 0) return data.releases.slice(0, seenIndex);
        // If localStorage contains an old/unknown version, show only the latest release.
        return [data.releases[0]];
    }

    // --- Image component with loading state ---
    function ReleaseImage({ src, alt }) {
        const [loaded, setLoaded] = useState(false);
        const [error, setError] = useState(false);

        if (!src || error) return null;

        return React.createElement('div', { className: 'wn-image-wrap' },
            !loaded && React.createElement('div', { className: 'wn-image-skeleton' }),
            React.createElement('img', {
                src,
                alt: alt || '',
                className: `wn-image${loaded ? ' wn-image--loaded' : ''}`,
                loading: 'lazy',
                onLoad: () => setLoaded(true),
                onError: () => setError(true),
            })
        );
    }

    // --- Single release item ---
    function ReleaseItem({ item }) {
        const cfg = getTypeConfig(item.type);
        return React.createElement('div', { className: 'wn-item' },
            React.createElement('div', { className: 'wn-item-header' },
                React.createElement('span', { className: `wn-badge ${cfg.badgeClass}` },
                    cfg.emoji, ' ', cfg.label
                ),
            ),
            React.createElement('div', { className: 'wn-item-title' }, item.title),
            item.description && React.createElement('div', { className: 'wn-item-desc' }, item.description),
            item.image && React.createElement(ReleaseImage, { src: item.image, alt: item.title }),
        );
    }

    // --- Single release section ---
    function ReleaseSection({ release }) {
        return React.createElement('div', { className: 'wn-release' },
            React.createElement('div', { className: 'wn-release-header' },
                React.createElement('span', { className: 'wn-release-version' }, release.version),
                release.date && React.createElement('span', { className: 'wn-release-date' },
                    formatDate(release.date)
                ),
            ),
            release.title && React.createElement('div', { className: 'wn-release-title' }, release.title),
            React.createElement('div', { className: 'wn-items' },
                release.items.map((item, i) =>
                    React.createElement(ReleaseItem, { key: i, item })
                )
            ),
        );
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr + 'T00:00:00');
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    // --- Main modal component ---
    function WhatsNewModal({ onClose }) {
        const [releases, setReleases] = useState(null);
        const [visible, setVisible] = useState(false);
        const backdropRef = useRef(null);
        const onCloseRef = useRef(onClose);

        useEffect(() => {
            onCloseRef.current = onClose;
        }, [onClose]);

        useEffect(() => {
            let cancelled = false;
            fetchWhatsNew().then(data => {
                if (cancelled) return;
                const unseen = getUnseenReleases(data);
                if (unseen.length > 0) {
                    setReleases(unseen);
                    // Mark as seen: use the newest release version
                    setLastSeenVersion(data.releases[0].version);
                    // Animate in
                    requestAnimationFrame(() => {
                        if (!cancelled) setVisible(true);
                    });
                    console.info('[HEYS.WhatsNew] Showing', unseen.length, 'unseen release(s)');
                } else {
                    console.info('[HEYS.WhatsNew] No unseen releases, closing');
                    if (onCloseRef.current) onCloseRef.current();
                }
            });
            return () => { cancelled = true; };
        }, []);

        useEffect(() => {
            if (!releases || typeof document === 'undefined') return undefined;

            const { body, documentElement } = document;
            if (!body || !documentElement) return undefined;

            const previousBodyOverflow = body.style.overflow;
            const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
            const previousDocumentOverflow = documentElement.style.overflow;
            const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

            body.style.overflow = 'hidden';
            body.style.overscrollBehavior = 'none';
            documentElement.style.overflow = 'hidden';
            documentElement.style.overscrollBehavior = 'none';

            console.info('[HEYS.WhatsNew] Background scroll lock enabled');

            return () => {
                body.style.overflow = previousBodyOverflow;
                body.style.overscrollBehavior = previousBodyOverscrollBehavior;
                documentElement.style.overflow = previousDocumentOverflow;
                documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
                console.info('[HEYS.WhatsNew] Background scroll lock released');
            };
        }, [releases]);

        const handleClose = useCallback(() => {
            setVisible(false);
            setTimeout(() => {
                if (onCloseRef.current) onCloseRef.current();
            }, 250); // match CSS transition duration
        }, []);

        const handleBackdropClick = useCallback((e) => {
            if (e.target === backdropRef.current) {
                console.info('[HEYS.WhatsNew] Backdrop click ignored — waiting for explicit user close');
            }
        }, []);

        // Don't render until we have data
        if (!releases) return null;

        return React.createElement('div', {
            ref: backdropRef,
            className: `wn-backdrop${visible ? ' wn-backdrop--visible' : ''}`,
            onClick: handleBackdropClick,
        },
            React.createElement('div', { className: `wn-modal${visible ? ' wn-modal--visible' : ''}` },
                // Header
                React.createElement('div', { className: 'wn-header' },
                    React.createElement('div', { className: 'wn-header-icon' }, '🚀'),
                    React.createElement('div', { className: 'wn-header-title' }, 'Что нового'),
                    React.createElement('button', {
                        className: 'wn-close',
                        onClick: handleClose,
                        'aria-label': 'Закрыть',
                    }, '✕'),
                ),
                // Scrollable content
                React.createElement('div', { className: 'wn-content' },
                    releases.map((release, i) =>
                        React.createElement(ReleaseSection, { key: release.version || i, release })
                    ),
                ),
                // Footer
                React.createElement('div', { className: 'wn-footer' },
                    React.createElement('button', {
                        className: 'wn-got-it',
                        onClick: handleClose,
                    }, 'Понял, спасибо!'),
                ),
            ),
        );
    }

    // --- Public API ---
    HEYS.WhatsNew = {
        WhatsNewModal,
        // Utility: check if there are unseen releases without showing modal
        checkUnseen: async function () {
            const data = await fetchWhatsNew();
            return getUnseenReleases(data).length > 0;
        },
        // Utility: reset seen state (for testing)
        resetSeen: function () {
            try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
        },
    };

    console.info('[HEYS.WhatsNew] Module loaded');
})();
