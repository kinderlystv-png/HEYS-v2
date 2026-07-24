// heys_whats_new_modal_v1.js — "What's New" modal after PWA update
// Shows changelog with screenshots after app update
// Verification marker: dedicated release to test the PWA update → What's New flow.

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    if (!React) return;

    const MODULE_VERIFICATION_MARK = '2026-04-07-whats-new-followup-1';
    const { useState, useEffect, useCallback, useRef } = React;
    const LEGACY_SEEN_KEY = 'heys_whats_new_last_seen';
    const ACK_KEY = 'heys_whats_new_last_acknowledged';
    const SESSION_ACK_KEY = 'heys_whats_new_session_acknowledged';
    const FETCH_TIMEOUT = 5000;
    let runtimeAcknowledgedVersion = '';

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

    async function fetchBuildMeta() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const resp = await fetch(`/build-meta.json?_cb=${Date.now()}`, {
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (!resp.ok) return null;
            return await resp.json();
        } catch {
            clearTimeout(timer);
            return null;
        }
    }

    function getStorageValue(key) {
        try { return localStorage.getItem(key) || ''; } catch { return ''; }
    }

    function setStorageValue(key, value) {
        try { localStorage.setItem(key, value); return localStorage.getItem(key) === value; } catch { return false; }
    }

    function removeStorageValue(key) {
        try { localStorage.removeItem(key); } catch { /* noop */ }
    }

    function getSessionStorageValue(key) {
        try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
    }

    function setSessionStorageValue(key, value) {
        try { sessionStorage.setItem(key, value); } catch { /* noop */ }
    }

    function removeSessionStorageValue(key) {
        try { sessionStorage.removeItem(key); } catch { /* noop */ }
    }

    function getLegacySeenVersion() {
        return getStorageValue(LEGACY_SEEN_KEY);
    }

    function getAcknowledgedVersion() {
        return runtimeAcknowledgedVersion
            || getSessionStorageValue(SESSION_ACK_KEY)
            || getStorageValue(ACK_KEY);
    }

    function extractBuildHash(version) {
        if (!version || typeof version !== 'string') return '';
        const parts = version.split('.').filter(Boolean);
        return parts.length > 0 ? parts[parts.length - 1] : '';
    }

    function getLatestReleaseBuildHash(data) {
        return typeof data?.releases?.[0]?.buildHash === 'string'
            ? data.releases[0].buildHash.trim()
            : '';
    }

    function createDeferredInspectionResult(data, reason, extra = {}) {
        return {
            ok: false,
            hasUnseen: false,
            reason,
            latestVersion: data?.releases?.[0]?.version || '',
            legacySeenVersion: getLegacySeenVersion(),
            acknowledgedVersion: getAcknowledgedVersion(),
            resolvedSeenVersion: '',
            unseenReleases: [],
            ...extra,
        };
    }

    function persistAcknowledgedVersion(version) {
        if (!version) return;
        runtimeAcknowledgedVersion = version;
        setSessionStorageValue(SESSION_ACK_KEY, version);
        const acknowledgedSaved = setStorageValue(ACK_KEY, version);
        const legacySaved = setStorageValue(LEGACY_SEEN_KEY, version);
        if (!acknowledgedSaved || !legacySaved) {
            console.warn('[HEYS.WhatsNew] localStorage acknowledgement unavailable — using session fallback');
        }
    }

    function resolveSeenVersion(data) {
        const acknowledgedVersion = getAcknowledgedVersion();
        if (acknowledgedVersion) return acknowledgedVersion;

        const legacySeenVersion = getLegacySeenVersion();
        if (!legacySeenVersion) return '';

        const latestVersion = data?.releases?.[0]?.version || '';
        if (latestVersion && legacySeenVersion === latestVersion) {
            console.info('[HEYS.WhatsNew] Latest release exists only in legacy seen state — requiring explicit acknowledgement');
            return '';
        }

        return legacySeenVersion;
    }

    // --- Check if we should show What's New ---
    function getUnseenReleases(data) {
        if (!data || !data.releases || !data.releases.length) return [];
        const lastSeen = resolveSeenVersion(data);
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

    function inspectUnseenData(data) {
        if (!data || !Array.isArray(data.releases) || data.releases.length === 0) {
            return {
                ok: false,
                hasUnseen: false,
                reason: 'invalid_data',
                latestVersion: '',
                legacySeenVersion: getLegacySeenVersion(),
                acknowledgedVersion: getAcknowledgedVersion(),
                resolvedSeenVersion: '',
                unseenReleases: [],
            };
        }

        const resolvedSeenVersion = resolveSeenVersion(data);
        const unseenReleases = getUnseenReleases(data);

        return {
            ok: true,
            hasUnseen: unseenReleases.length > 0,
            reason: unseenReleases.length > 0 ? 'has_unseen' : 'up_to_date',
            latestVersion: data.releases[0]?.version || '',
            legacySeenVersion: getLegacySeenVersion(),
            acknowledgedVersion: getAcknowledgedVersion(),
            resolvedSeenVersion,
            unseenReleases,
        };
    }

    async function inspectUnseen() {
        const [data, buildMeta] = await Promise.all([
            fetchWhatsNew(),
            fetchBuildMeta(),
        ]);
        if (!data) {
            return createDeferredInspectionResult(null, 'fetch_failed', {
                latestVersion: '',
            });
        }

        const runningVersion = HEYS.version || '';
        const runningBuildHash = extractBuildHash(runningVersion);
        const latestReleaseBuildHash = getLatestReleaseBuildHash(data);

        if (latestReleaseBuildHash && runningBuildHash && latestReleaseBuildHash !== runningBuildHash) {
            console.info(
                '[HEYS.WhatsNew] Release build is newer than running code — deferring What\'s New.',
                'Running hash:', runningBuildHash, '→ Release hash:', latestReleaseBuildHash
            );
            return createDeferredInspectionResult(data, 'code_update_pending', {
                runningVersion,
                runningBuildHash,
                latestReleaseBuildHash,
            });
        }

        // Gate: if server has a newer code version than what's running,
        // defer What's New until PWA update reloads the page with new code.
        const serverVersion = buildMeta?.version || '';
        if (serverVersion && runningVersion && serverVersion !== runningVersion) {
            console.info(
                '[HEYS.WhatsNew] Code update pending — deferring What\'s New.',
                'Running:', runningVersion, '→ Server:', serverVersion
            );
            return createDeferredInspectionResult(data, 'code_update_pending', {
                runningVersion,
                runningBuildHash,
                latestReleaseBuildHash,
                serverVersion,
            });
        }

        return inspectUnseenData(data);
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
        const latestVersionRef = useRef(null);

        useEffect(() => {
            onCloseRef.current = onClose;
        }, [onClose]);

        useEffect(() => {
            let cancelled = false;
            inspectUnseen().then(inspection => {
                if (cancelled) return;
                const unseen = inspection.unseenReleases;
                if (inspection.ok && unseen.length > 0) {
                    latestVersionRef.current = inspection.latestVersion;
                    setReleases(unseen);
                    // Animate in
                    requestAnimationFrame(() => {
                        if (!cancelled) setVisible(true);
                    });
                    console.info('[HEYS.WhatsNew] Showing', unseen.length, 'unseen release(s), waiting for explicit acknowledgement of', inspection.latestVersion);
                    HEYS.LogTrace?.event?.('whats_new_shown', {
                        source: 'whats_new',
                        release_version: inspection.latestVersion,
                        unseen_count: unseen.length
                    });
                } else {
                    console.info('[HEYS.WhatsNew] Modal mount deferred —', inspection.reason || 'no_unseen');
                    HEYS.LogTrace?.event?.('whats_new_deferred', {
                        source: 'whats_new',
                        reason: inspection.reason || 'no_unseen'
                    });
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
            if (latestVersionRef.current) {
                persistAcknowledgedVersion(latestVersionRef.current);
                console.info('[HEYS.WhatsNew] Acknowledged release', latestVersionRef.current);
                HEYS.LogTrace?.event?.('whats_new_acknowledged', {
                    source: 'whats_new',
                    release_version: latestVersionRef.current,
                    unseen_count: Array.isArray(releases) ? releases.length : 0
                });
            }
            setVisible(false);
            setTimeout(() => {
                if (onCloseRef.current) onCloseRef.current();
            }, 250); // match CSS transition duration
        }, [releases]);

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
            const inspection = await inspectUnseen();
            return inspection.ok && inspection.hasUnseen;
        },
        inspectUnseen,
        // Utility: reset seen state (for testing)
        resetSeen: function () {
            runtimeAcknowledgedVersion = '';
            removeSessionStorageValue(SESSION_ACK_KEY);
            removeStorageValue(LEGACY_SEEN_KEY);
            removeStorageValue(ACK_KEY);
        },
    };

    console.info('[HEYS.WhatsNew] Module loaded', MODULE_VERIFICATION_MARK);
})();
