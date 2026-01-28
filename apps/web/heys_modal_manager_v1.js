// heys_modal_manager_v1.js — Централизованное управление всеми модалками
// Обеспечивает:
// 1. Автоматическое закрытие других модалок при открытии новой
// 2. Единый реестр всех открытых модалок
// 3. Закрытие по клику вне модалки
(function(global) {
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
