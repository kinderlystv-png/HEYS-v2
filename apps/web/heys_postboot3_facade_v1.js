/**
 * heys_postboot3_facade_v1.js — Lazy-load trigger for postboot-3-ui-lazy chunk.
 *
 * heys_modal_manager_v1.js (loaded before this) already registered HEYS.ModalManager.
 * This file only kicks off the download of the rest of postboot-3-ui after first render.
 * All consumers of PredictiveInsights, planning, widgets, reports, etc. use optional
 * chaining and function after the lazy chunk finishes loading.
 */
(function () {
    'use strict';

    var _lazyPromise = null;

    function _loadLazyChunk() {
        if (_lazyPromise) return _lazyPromise;

        _lazyPromise = fetch('/lazy-manifest.json')
            .then(function (r) {
                if (!r.ok) throw new Error('lazy-manifest fetch failed: ' + r.status);
                return r.json();
            })
            .then(function (manifest) {
                var entry = manifest['postboot-3-ui-lazy'];
                if (!entry || !entry.file) {
                    throw new Error('[postboot3_facade] postboot-3-ui-lazy missing from manifest');
                }
                return new Promise(function (resolve, reject) {
                    var script = document.createElement('script');
                    script.src = '/' + entry.file;
                    script.onload = function () {
                        if (!window.HEYS || !window.HEYS.PredictiveInsights) {
                            reject(new Error('[postboot3_facade] lazy chunk loaded but PredictiveInsights not registered'));
                            return;
                        }
                        try {
                            window.dispatchEvent(new CustomEvent('heys:postboot-lazy-ready', {
                                detail: { bundle: 'postboot-3-ui' }
                            }));
                        } catch (_) {}
                        resolve();
                    };
                    script.onerror = function () {
                        reject(new Error('[postboot3_facade] script load error: ' + entry.file));
                    };
                    document.head.appendChild(script);
                });
            })
            .catch(function (err) {
                _lazyPromise = null;
                try {
                    window.dispatchEvent(new CustomEvent('heys:lazy-chunk-failed', {
                        detail: { bundle: 'postboot-3-ui', err: err.message }
                    }));
                } catch (_) {}
                console.error('[postboot3_facade] ❌', err.message);
            });

        return _lazyPromise;
    }

    // Expose force-load for React.lazy (bypasses idle callback, triggers immediate download)
    var HEYS = window.HEYS = window.HEYS || {};
    HEYS.__loadPostboot3Ui = _loadLazyChunk;

    // P0-D-stretch (2026-05-22): MealsPreload — public API для DatePicker
    // hover/touchstart. Идемпотентный: no-op после первого вызова или если
    // chunk уже загружен. Использует существующий __loadPostboot3Ui.
    HEYS.MealsPreload = (function () {
        var _triggered = false;
        return {
            requestChunk: function () {
                if (_triggered) return;
                if (HEYS.dayMealsDisplay && HEYS.dayMealsDisplay.useMealsDisplay) {
                    _triggered = true;
                    return;
                }
                _triggered = true;
                try { _loadLazyChunk(); } catch (_) { _triggered = false; }
            }
        };
    })();

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_loadLazyChunk, { timeout: 2000 });
    } else {
        setTimeout(_loadLazyChunk, 100);
    }
})();
