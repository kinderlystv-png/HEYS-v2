/**
 * pi_facade.js — Eager stub for postboot-2-insights lazy chunk.
 *
 * Registers an empty HEYS.InsightsPI placeholder so optional-chain consumers
 * don't throw during boot. Kicks off lazy chunk download after first render
 * via requestIdleCallback, reading the URL from lazy-manifest.json (S1).
 *
 * Safety mechanisms:
 *  S1 — URL read from /lazy-manifest.json at runtime (SW cross-deploy safety).
 *  S2 — _lazyPromise coalesces concurrent calls; API assertion on load.
 *  S3 — heys:lazy-chunk-failed event on failure (allows error UI).
 */
(function () {
    'use strict';

    var HEYS = window.HEYS = window.HEYS || {};

    // Placeholder namespace — optional-chain consumers return undefined, not throw.
    // The real InsightsPI sub-namespaces get registered when the lazy chunk runs.
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    // S2: coalesce concurrent load calls
    var _lazyPromise = null;

    function _loadLazyChunk() {
        if (_lazyPromise) return _lazyPromise;

        _lazyPromise = fetch('/lazy-manifest.json')
            .then(function (r) {
                if (!r.ok) throw new Error('lazy-manifest fetch failed: ' + r.status);
                return r.json();
            })
            .then(function (manifest) {
                var entry = manifest['postboot-2-insights-lazy'];
                if (!entry || !entry.file) {
                    throw new Error('[pi_facade] postboot-2-insights-lazy missing from manifest');
                }
                return new Promise(function (resolve, reject) {
                    var script = document.createElement('script');
                    script.src = '/' + entry.file;
                    script.onload = function () {
                        // S2: API assertion — chunk must register earlyWarning
                        if (!HEYS.InsightsPI || !HEYS.InsightsPI.earlyWarning) {
                            reject(new Error('[pi_facade] lazy chunk loaded but InsightsPI.earlyWarning not registered'));
                            return;
                        }
                        try {
                            window.dispatchEvent(new CustomEvent('heys:postboot-lazy-ready', {
                                detail: { bundle: 'postboot-2-insights' }
                            }));
                        } catch (_) {}
                        resolve();
                    };
                    script.onerror = function () {
                        reject(new Error('[pi_facade] script load error: ' + entry.file));
                    };
                    document.head.appendChild(script);
                });
            })
            .catch(function (err) {
                _lazyPromise = null; // allow retry on next idle tick
                try {
                    window.dispatchEvent(new CustomEvent('heys:lazy-chunk-failed', {
                        detail: { bundle: 'postboot-2-insights', err: err.message }
                    }));
                } catch (_) {}
                console.error('[pi_facade] ❌', err.message);
            });

        return _lazyPromise;
    }

    // Expose force-load for React.lazy (bypasses idle callback, triggers immediate download)
    HEYS.__loadPostboot2Insights = _loadLazyChunk;

    // Load after first render — yield to React scheduler, then kick off download.
    // The AppShell EWS retry loop (up to 23s total backoff) handles the async gap.
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_loadLazyChunk, { timeout: 2000 });
    } else {
        setTimeout(_loadLazyChunk, 100);
    }
})();
