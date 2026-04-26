
/* ===== heys_modal_manager_v1.js ===== */
window.__heysPerfMark && window.__heysPerfMark('postboot-3-ui: execute start');
// heys_modal_manager_v1.js — Централизованное управление всеми модалками
// Обеспечивает:
// 1. Автоматическое закрытие других модалок при открытии новой
// 2. Единый реестр всех открытых модалок
// 3. Закрытие по клику вне модалки
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // === Реестр открытых модалок ===
  const openModals = new Set();
  const modalClosers = new Map(); // modalId => closeFunction
  const MODAL_SYNC_BLOCK_MS = 10 * 60 * 1000;
  const syncState = {
    token: null,
    dayBlockUntil: 0,
    transitioning: false
  };

  // === API ===
  const ModalManager = {
    /**
     * Регистрирует новую модалку
     * @param {string} modalId - уникальный ID модалки
     * @param {Function} closeFunction - функция закрытия модалки
     * @returns {Function} cleanup функция для дерегистрации
     */
    register(modalId, closeFunction) {
      // Закрываем все другие модалки
      syncState.transitioning = true;
      this.closeAll(modalId);

      // Регистрируем новую
      if (openModals.size === 0) {
        this._pauseSyncForModal();
      }
      openModals.add(modalId);
      modalClosers.set(modalId, closeFunction);
      syncState.transitioning = false;

      // Возвращаем cleanup функцию
      return () => {
        this._unregister(modalId);
        if (!syncState.transitioning) {
          this._resumeSyncIfNeeded();
        }
      };
    },

    /**
     * Закрывает все модалки кроме указанной
     * @param {string} exceptModalId - ID модалки которую НЕ закрывать
     */
    closeAll(exceptModalId = null) {
      const idsToClose = [];
      for (const modalId of modalClosers.keys()) {
        if (modalId !== exceptModalId) idsToClose.push(modalId);
      }

      idsToClose.forEach((modalId) => {
        const closer = modalClosers.get(modalId);
        if (!closer) return;
        try {
          closer();
        } catch (e) {
          console.warn(`[ModalManager] Ошибка при закрытии ${modalId}:`, e);
        }
        this._unregister(modalId);
      });

      if (!syncState.transitioning) {
        this._resumeSyncIfNeeded();
      }
    },

    /**
     * Закрывает конкретную модалку
     * @param {string} modalId - ID модалки для закрытия
     */
    close(modalId) {
      const closer = modalClosers.get(modalId);
      if (closer) {
        try {
          closer();
        } catch (e) {
          console.warn(`[ModalManager] Ошибка при закрытии ${modalId}:`, e);
        }
      }
      this._unregister(modalId);
      this._resumeSyncIfNeeded();
    },

    /**
     * Проверяет открыта ли модалка
     * @param {string} modalId - ID модалки
     * @returns {boolean}
     */
    isOpen(modalId) {
      return openModals.has(modalId);
    },

    /**
     * Получить список всех открытых модалок
     * @returns {Array<string>}
     */
    getOpenModals() {
      return Array.from(openModals);
    },

    /**
     * Количество открытых модалок
     * @returns {number}
     */
    getOpenCount() {
      return openModals.size;
    },

    _unregister(modalId) {
      openModals.delete(modalId);
      modalClosers.delete(modalId);
    },

    _pauseSyncForModal() {
      if (syncState.token) return;

      if (HEYS.Day?.setBlockCloudUpdates) {
        syncState.dayBlockUntil = Date.now() + MODAL_SYNC_BLOCK_MS;
        HEYS.Day.setBlockCloudUpdates(syncState.dayBlockUntil);
      }

      syncState.token = HEYS.cloud?.pauseSync?.(MODAL_SYNC_BLOCK_MS, 'modal') || null;
    },

    _resumeSyncIfNeeded() {
      if (openModals.size > 0) return;

      if (HEYS.cloud?.resumeSync && syncState.token) {
        HEYS.cloud.resumeSync(syncState.token);
      }
      syncState.token = null;

      if (HEYS.Day?.getBlockUntil && HEYS.Day?.setBlockCloudUpdates && syncState.dayBlockUntil) {
        const currentBlock = HEYS.Day.getBlockUntil() || 0;
        if (currentBlock >= syncState.dayBlockUntil - 50) {
          HEYS.Day.setBlockCloudUpdates(Date.now());
        }
      }
      syncState.dayBlockUntil = 0;
    }
  };

  // === Экспорт ===
  HEYS.ModalManager = ModalManager;

  // Debug helper
  if (typeof window !== 'undefined') {
    window.debugModals = () => {
      console.table({
        'Открыто модалок': openModals.size,
        'Список': Array.from(openModals).join(', ') || 'нет'
      });
    };
  }

})(typeof window !== 'undefined' ? window : global);


/* ===== heys_postboot3_facade_v1.js ===== */
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

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(_loadLazyChunk, { timeout: 2000 });
    } else {
        setTimeout(_loadLazyChunk, 100);
    }
})();
