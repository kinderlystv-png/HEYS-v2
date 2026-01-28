// heys_confirm_modal_v1.js — Переиспользуемая модалка подтверждения
// Единый компонент для всех confirm-диалогов в приложении
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  if (!React || !ReactDOM) {
    console.error('[ConfirmModal] React/ReactDOM not found');
    return;
  }

  // === Состояние модалки ===
  let currentModal = null;
  let setModalState = null;
  let modalRoot = null;
  let modalRootInstance = null; // React 18 createRoot instance
  let modalCleanup = null; // Cleanup функция для ModalManager

  // === Дефолтные настройки ===
  const DEFAULTS = {
    icon: '❓',
    title: 'Подтвердите действие',
    text: 'Вы уверены?',
    confirmText: 'Подтвердить',
    cancelText: 'Отмена',
    confirmStyle: 'danger', // 'danger' | 'primary' | 'success'
    cancelStyle: 'neutral', // 'neutral' | 'danger' | 'primary' | 'success'
    confirmVariant: 'text', // 'text' | 'fill'
    cancelVariant: 'text', // 'text' | 'fill'
    onConfirm: () => { },
    onCancel: () => { }
  };

  // === Стили для confirmStyle ===
  const CONFIRM_STYLES = {
    neutral: {
      color: '#6b7280',
      activeBackground: '#f3f4f6',
      darkColor: '#9ca3af',
      darkActiveBackground: 'rgba(148, 163, 184, 0.2)'
    },
    danger: {
      color: '#ef4444',
      activeBackground: '#fef2f2',
      darkColor: '#f87171',
      darkActiveBackground: 'rgba(239, 68, 68, 0.2)'
    },
    primary: {
      color: '#3b82f6',
      activeBackground: '#eff6ff',
      darkColor: '#60a5fa',
      darkActiveBackground: 'rgba(59, 130, 246, 0.2)'
    },
    success: {
      color: '#22c55e',
      activeBackground: '#f0fdf4',
      darkColor: '#4ade80',
      darkActiveBackground: 'rgba(34, 197, 94, 0.2)'
    }
  };

  // === Компонент модалки ===
  function ConfirmModalComponent() {
    const [modal, setModal] = React.useState(null);

    // Сохраняем setter для внешнего использования
    React.useEffect(() => {
      setModalState = setModal;
      return () => { setModalState = null; };
    }, []);

    // Закрытие по Escape
    React.useEffect(() => {
      if (!modal) return;

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
        } else if (e.key === 'Enter') {
          handleConfirm();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [modal]);

    const handleConfirm = React.useCallback(() => {
      if (!modal) return;

      // Haptic feedback
      if (HEYS.dayUtils?.haptic) {
        HEYS.dayUtils.haptic('medium');
      }

      modal.onConfirm?.();
      setModal(null);
    }, [modal]);

    const handleCancel = React.useCallback(() => {
      if (!modal) return;
      modal.onCancel?.();
      setModal(null);
    }, [modal]);

    const handleBackdropClick = React.useCallback((e) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    }, [handleCancel]);

    if (!modal) return null;

    const confirmStyle = CONFIRM_STYLES[modal.confirmStyle] || CONFIRM_STYLES.danger;
    const cancelStyle = CONFIRM_STYLES[modal.cancelStyle] || CONFIRM_STYLES.neutral;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const confirmVariant = modal.confirmVariant || 'text';
    const cancelVariant = modal.cancelVariant || 'text';

    return React.createElement('div', {
      className: 'confirm-modal-backdrop',
      onClick: handleBackdropClick
    },
      React.createElement('div', {
        className: 'confirm-modal',
        onClick: e => e.stopPropagation()
      },
        // Иконка
        React.createElement('div', { className: 'confirm-modal-icon' }, modal.icon),

        // Заголовок
        React.createElement('div', { className: 'confirm-modal-title' }, modal.title),

        // Текст
        modal.text && React.createElement('div', { className: 'confirm-modal-text' }, modal.text),

        // Кнопки
        React.createElement('div', { className: 'confirm-modal-buttons' },
          React.createElement('button', {
            className: 'confirm-modal-btn cancel'
              + (modal.cancelStyle ? ` confirm-modal-btn--${modal.cancelStyle}` : '')
              + (cancelVariant === 'fill' ? ' confirm-modal-btn--fill' : ''),
            style: cancelVariant === 'fill'
              ? { fontWeight: 600 }
              : {
                color: isDark ? cancelStyle.darkColor : cancelStyle.color,
                fontWeight: 600
              },
            onClick: handleCancel
          }, modal.cancelText),
          React.createElement('button', {
            className: 'confirm-modal-btn confirm'
              + (modal.confirmStyle ? ` confirm-modal-btn--${modal.confirmStyle}` : '')
              + (confirmVariant === 'fill' ? ' confirm-modal-btn--fill' : ''),
            style: confirmVariant === 'fill'
              ? { fontWeight: 600 }
              : {
                color: isDark ? confirmStyle.darkColor : confirmStyle.color,
                fontWeight: 600
              },
            onClick: handleConfirm
          }, modal.confirmText)
        )
      )
    );
  }

  // === Инициализация root элемента ===
  function ensureRoot() {
    if (modalRoot) return modalRoot;

    modalRoot = document.getElementById('confirm-modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'confirm-modal-root';
      document.body.appendChild(modalRoot);
    }

    // React 18: createRoot API
    if (!modalRootInstance) {
      modalRootInstance = ReactDOM.createRoot(modalRoot);
    }
    modalRootInstance.render(
      React.createElement(ConfirmModalComponent)
    );

    return modalRoot;
  }

  // === Публичное API ===

  /**
   * Показать модалку подтверждения
   * @param {Object} options - Настройки модалки
   * @param {string} options.icon - Эмодзи иконка (напр. '🗑️')
   * @param {string} options.title - Заголовок
   * @param {string} options.text - Описание (опционально)
   * @param {string} options.confirmText - Текст кнопки подтверждения
   * @param {string} options.cancelText - Текст кнопки отмены
  * @param {string} options.confirmStyle - Стиль: 'danger' | 'primary' | 'success'
  * @param {string} options.cancelStyle - Стиль: 'neutral' | 'danger' | 'primary' | 'success'
  * @param {string} options.confirmVariant - Вариант: 'text' | 'fill'
  * @param {string} options.cancelVariant - Вариант: 'text' | 'fill'
   * @param {Function} options.onConfirm - Callback при подтверждении
   * @param {Function} options.onCancel - Callback при отмене
   * @returns {Promise<boolean>} - true если подтверждено, false если отменено
   */
  function show(options = {}) {
    ensureRoot();

    // Регистрируем в ModalManager
    if (HEYS.ModalManager) {
      modalCleanup = HEYS.ModalManager.register('confirm-modal', () => {
        hide(true); // skipManagerNotify = true
      });
    }

    return new Promise((resolve) => {
      const modal = {
        ...DEFAULTS,
        ...options,
        onConfirm: () => {
          options.onConfirm?.();
          resolve(true);
        },
        onCancel: () => {
          options.onCancel?.();
          resolve(false);
        }
      };

      if (setModalState) {
        setModalState(modal);
      }
    });
  }

  /**
   * Скрыть модалку
   */
  function hide(skipManagerNotify = false) {
    // Дерегистрируем из ModalManager (если не вызвано из менеджера)
    if (modalCleanup && !skipManagerNotify) {
      modalCleanup();
      modalCleanup = null;
    }

    if (setModalState) {
      setModalState(null);
    }
  }

  // === Готовые пресеты ===

  /**
   * Подтверждение удаления
   */
  function confirmDelete(options = {}) {
    return show({
      icon: '🗑️',
      title: options.title || 'Удалить?',
      text: options.text || 'Это действие нельзя отменить.',
      confirmText: 'Удалить',
      cancelText: 'Отмена',
      confirmStyle: 'danger',
      ...options
    });
  }

  /**
   * Подтверждение действия (нейтральное)
   */
  function confirmAction(options = {}) {
    return show({
      icon: '❓',
      title: options.title || 'Подтвердите действие',
      confirmText: 'Подтвердить',
      cancelText: 'Отмена',
      confirmStyle: 'primary',
      ...options
    });
  }

  /**
   * Подтверждение сохранения
   */
  function confirmSave(options = {}) {
    return show({
      icon: '💾',
      title: options.title || 'Сохранить изменения?',
      confirmText: 'Сохранить',
      cancelText: 'Отмена',
      confirmStyle: 'success',
      ...options
    });
  }

  // === Экспорт ===
  HEYS.ConfirmModal = {
    show,
    hide,
    confirmDelete,
    confirmAction,
    confirmSave,
    // Компонент для встраивания (если нужен)
    Component: ConfirmModalComponent
  };

  // Инициализация при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureRoot);
  } else {
    // Небольшая задержка чтобы React точно загрузился
    setTimeout(ensureRoot, 0);
  }

})(typeof window !== 'undefined' ? window : global);
