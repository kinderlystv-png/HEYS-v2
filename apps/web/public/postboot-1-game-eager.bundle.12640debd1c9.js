
/* ===== heys_game_facade_v1.js ===== */
/**
 * heys_game_facade_v1.js — Lazy-load trigger for postboot-1-game-lazy chunk.
 *
 * Registers HEYS.game placeholder so optional-chain consumers in boot bundles
 * (e.g. heys_gamification_bar_v1.js) return defaults instead of throwing.
 * Kicks off lazy chunk download after first render.
 */
(function () {
    'use strict';

    var HEYS = window.HEYS = window.HEYS || {};

    // Placeholder so guards like `if (HEYS.game)` are false until real module loads.
    // Consumers already handle this: bar returns zero stats, day guards skip XP calls.
    // (Do NOT set HEYS.game = {} — that would make `if (HEYS.game)` truthy prematurely.)

    var _lazyPromise = null;

    function _loadLazyChunk() {
        if (_lazyPromise) return _lazyPromise;

        _lazyPromise = fetch('/lazy-manifest.json')
            .then(function (r) {
                if (!r.ok) throw new Error('lazy-manifest fetch failed: ' + r.status);
                return r.json();
            })
            .then(function (manifest) {
                var entry = manifest['postboot-1-game-lazy'];
                if (!entry || !entry.file) {
                    throw new Error('[game_facade] postboot-1-game-lazy missing from manifest');
                }
                return new Promise(function (resolve, reject) {
                    var script = document.createElement('script');
                    script.src = '/' + entry.file;
                    script.onload = function () {
                        if (!window.HEYS || !window.HEYS.game) {
                            reject(new Error('[game_facade] lazy chunk loaded but HEYS.game not registered'));
                            return;
                        }
                        try {
                            window.dispatchEvent(new CustomEvent('heys:postboot-lazy-ready', {
                                detail: { bundle: 'postboot-1-game' }
                            }));
                        } catch (_) {}
                        resolve();
                    };
                    script.onerror = function () {
                        reject(new Error('[game_facade] script load error: ' + entry.file));
                    };
                    document.head.appendChild(script);
                });
            })
            .catch(function (err) {
                _lazyPromise = null;
                try {
                    window.dispatchEvent(new CustomEvent('heys:lazy-chunk-failed', {
                        detail: { bundle: 'postboot-1-game', err: err.message }
                    }));
                } catch (_) {}
                console.error('[game_facade] ❌', err.message);
            });

        return _lazyPromise;
    }

    // Expose force-load for React.lazy (bypasses idle callback, triggers immediate download)
    var HEYS = window.HEYS = window.HEYS || {};
    HEYS.__loadPostboot1Game = _loadLazyChunk;

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_loadLazyChunk, { timeout: 2000 });
    } else {
        setTimeout(_loadLazyChunk, 100);
    }
})();
