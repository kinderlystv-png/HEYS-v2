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
      this.closeAll(modalId);
      
      // Регистрируем новую
      openModals.add(modalId);
      modalClosers.set(modalId, closeFunction);
      
      // Возвращаем cleanup функцию
      return () => {
        openModals.delete(modalId);
        modalClosers.delete(modalId);
      };
    },

    /**
     * Закрывает все модалки кроме указанной
     * @param {string} exceptModalId - ID модалки которую НЕ закрывать
     */
    closeAll(exceptModalId = null) {
      for (const [modalId, closer] of modalClosers.entries()) {
        if (modalId !== exceptModalId) {
          try {
            closer();
          } catch (e) {
            console.warn(`[ModalManager] Ошибка при закрытии ${modalId}:`, e);
          }
        }
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
