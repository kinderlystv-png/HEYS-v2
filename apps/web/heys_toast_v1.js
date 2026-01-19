// heys_toast_v1.js — Универсальная система toast-уведомлений
// Заменяет browser alert() на красивые toasts
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // === КОНФИГУРАЦИЯ ===
  const CONFIG = {
    defaultDuration: 3500,    // ms — стандартное время показа
    longDuration: 5000,       // ms — для важных сообщений
    shortDuration: 2000,      // ms — для коротких подтверждений
    maxVisible: 3,            // Максимум одновременно показанных
    animationDuration: 300,   // ms — длительность анимации
    toastTopOffset: 72,       // px — отступ от верха (до шапки)
    tooltipToastEnabled: true, // Показывать подсказки (title) как toast на мобилке
    tooltipCooldown: 1200,     // ms — защита от спама
    tooltipMaxDepth: 4,        // Макс. глубина поиска title у родителя
    tooltipTitle: 'ℹ️ Подсказка'
  };

  // === ТИПЫ TOASTS ===
  const TOAST_TYPES = {
    success: {
      icon: '✅',
      gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      shadowColor: 'rgba(16, 185, 129, 0.4)',
    },
    error: {
      icon: '❌',
      gradient: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
      shadowColor: 'rgba(239, 68, 68, 0.4)',
    },
    warning: {
      icon: '⚠️',
      gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
      shadowColor: 'rgba(245, 158, 11, 0.4)',
    },
    info: {
      icon: 'ℹ️',
      gradient: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
      shadowColor: 'rgba(59, 130, 246, 0.4)',
    },
    tip: {
      icon: '💡',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
      shadowColor: 'rgba(139, 92, 246, 0.4)',
    },
  };

  // === СОСТОЯНИЕ ===
  let toastQueue = [];
  let visibleToasts = [];
  let containerId = 'heys-toast-container';

  // === ИНИЦИАЛИЗАЦИЯ КОНТЕЙНЕРА ===
  function ensureContainer() {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = `
        position: fixed;
        top: calc(${CONFIG.toastTopOffset}px + env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        z-index: 10002;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: center;
        pointer-events: none;
        max-width: 90vw;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  // === СОЗДАНИЕ TOAST ЭЛЕМЕНТА ===
  function createToastElement(options) {
    const { type = 'info', title, message, icon, duration, action } = options;
    const typeConfig = TOAST_TYPES[type] || TOAST_TYPES.info;
    const displayIcon = icon || typeConfig.icon;

    const toast = document.createElement('div');
    toast.className = 'heys-toast';
    toast.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 18px;
      background: ${typeConfig.gradient};
      border-radius: 16px;
      box-shadow: 0 4px 20px ${typeConfig.shadowColor}, 0 2px 8px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(10px);
      max-width: 360px;
      min-width: 280px;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(-100%) scale(0.9);
      transition: all ${CONFIG.animationDuration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
      cursor: pointer;
    `;

    // Иконка
    const iconEl = document.createElement('span');
    iconEl.style.cssText = `
      font-size: 22px;
      flex-shrink: 0;
      line-height: 1;
    `;
    iconEl.textContent = displayIcon;
    toast.appendChild(iconEl);

    // Контент
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      min-width: 0;
    `;

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: white;
        margin-bottom: ${message ? '4px' : '0'};
        line-height: 1.3;
      `;
      titleEl.textContent = title;
      content.appendChild(titleEl);
    }

    if (message) {
      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1.4;
        white-space: pre-line;
      `;
      messageEl.textContent = message;
      content.appendChild(messageEl);
    }

    toast.appendChild(content);

    // Кнопка действия (опционально)
    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.style.cssText = `
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.25);
        color: white;
        font-size: 12px;
        font-weight: 600;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        flex-shrink: 0;
        transition: background 0.15s;
      `;
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        action.onClick?.();
        hideToast(toast);
      });
      actionBtn.addEventListener('mouseenter', () => {
        actionBtn.style.background = 'rgba(255, 255, 255, 0.35)';
      });
      actionBtn.addEventListener('mouseleave', () => {
        actionBtn.style.background = 'rgba(255, 255, 255, 0.25)';
      });
      toast.appendChild(actionBtn);
    }

    // Закрытие по клику
    toast.addEventListener('click', () => hideToast(toast));

    return toast;
  }

  // === ПОКАЗ TOAST ===
  function showToast(options) {
    // Нормализация опций
    if (typeof options === 'string') {
      options = { message: options };
    }

    const { duration = CONFIG.defaultDuration } = options;

    // Если превышен лимит — убираем старые
    while (visibleToasts.length >= CONFIG.maxVisible) {
      const oldest = visibleToasts[0];
      hideToast(oldest);
    }

    const container = ensureContainer();
    const toast = createToastElement(options);

    container.appendChild(toast);
    visibleToasts.push(toast);

    // Анимация появления
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0) scale(1)';
    });

    // Автоскрытие
    if (duration > 0) {
      toast._timeout = setTimeout(() => hideToast(toast), duration);
    }

    return toast;
  }

  // === СКРЫТИЕ TOAST ===
  function hideToast(toast) {
    if (!toast || toast._hiding) return;
    toast._hiding = true;

    if (toast._timeout) {
      clearTimeout(toast._timeout);
    }

    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px) scale(0.9)';

    setTimeout(() => {
      toast.remove();
      visibleToasts = visibleToasts.filter(t => t !== toast);
    }, CONFIG.animationDuration);
  }

  // === УДОБНЫЕ МЕТОДЫ ===
  const Toast = {
    show: showToast,

    success(message, options = {}) {
      return showToast({ type: 'success', message, ...options });
    },

    error(message, options = {}) {
      return showToast({ type: 'error', message, duration: CONFIG.longDuration, ...options });
    },

    warning(message, options = {}) {
      return showToast({ type: 'warning', message, ...options });
    },

    info(message, options = {}) {
      return showToast({ type: 'info', message, ...options });
    },

    tip(message, options = {}) {
      return showToast({ type: 'tip', message, duration: CONFIG.longDuration, ...options });
    },

    // Для критических действий — с кнопкой
    confirm(message, actionLabel, onAction) {
      return showToast({
        type: 'warning',
        message,
        duration: 0, // Не закрывать автоматически
        action: { label: actionLabel, onClick: onAction }
      });
    },

    // Скрыть все
    hideAll() {
      [...visibleToasts].forEach(hideToast);
    }
  };

  // === ЭКСПОРТ ===
  HEYS.Toast = Toast;

  // Глобальный хелпер для замены alert()
  HEYS.toast = Toast.show;

  // === MOBILE TOOLTIP → TOAST ===
  let lastTooltipAt = 0;
  let lastTooltipText = '';

  function isTouchLike() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      return false;
    }
  }

  function findTitleTarget(startEl) {
    let el = startEl;
    for (let i = 0; i < CONFIG.tooltipMaxDepth && el; i++) {
      if (el.getAttribute && el.getAttribute('title')) {
        if (el.getAttribute('data-toast-disabled') === 'true') return null;
        if (el.getAttribute('data-tooltip') !== 'ui') return null;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function handleTooltipTap(e) {
    if (!CONFIG.tooltipToastEnabled || !isTouchLike()) return;
    const target = findTitleTarget(e.target);
    if (!target) return;
    const text = target.getAttribute('title');
    if (!text) return;

    const now = Date.now();
    if (now - lastTooltipAt < CONFIG.tooltipCooldown) return;
    if (lastTooltipText && lastTooltipText === text) return;
    lastTooltipAt = now;
    lastTooltipText = text;

    Toast.info(text, { title: CONFIG.tooltipTitle, duration: CONFIG.shortDuration });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', handleTooltipTap, true);
  }

  // === ИНТЕРЦЕПТОР alert() (опционально, для legacy) ===
  // Можно включить если нужно перехватывать все alert()
  // const originalAlert = window.alert;
  // window.alert = function(message) {
  //   if (HEYS.Toast) {
  //     HEYS.Toast.info(message);
  //   } else {
  //     originalAlert(message);
  //   }
  // };

  console.log('[HEYS] Toast module loaded');

})(typeof window !== 'undefined' ? window : global);
