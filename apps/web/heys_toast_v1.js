// heys_toast_v1.js — Универсальная система toast-уведомлений
// Заменяет browser alert() на красивые toasts
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };

  // === КОНФИГУРАЦИЯ ===
  const CONFIG = {
    defaultDuration: 3500,    // ms — стандартное время показа
    longDuration: 5000,       // ms — для важных сообщений
    shortDuration: 2000,      // ms — для коротких подтверждений
    maxVisible: 3,            // Максимум одновременно показанных
    animationDuration: 300,   // ms — длительность анимации
    toastTopOffset: 72,       // px — отступ от верха (legacy fallback)
    tooltipToastEnabled: true, // Показывать подсказки (title) как toast на мобилке
    tooltipCooldown: 1200,     // ms — защита от спама
    tooltipMaxDepth: 4,        // Макс. глубина поиска title у родителя
    tooltipTitle: 'Подсказка'
  };

  // === ТИПЫ TOASTS ===
  const TOAST_TYPES = {
    success: { icon: '✓' },
    error: { icon: '!' },
    warning: { icon: '!' },
    info: { icon: 'i' },
    tip: { icon: 'i' },
  };

  // === СОСТОЯНИЕ ===
  let visibleToasts = [];
  let containerId = 'heys-toast-container';

  // === ИНИЦИАЛИЗАЦИЯ КОНТЕЙНЕРА ===
  function ensureContainer() {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }
    return container;
  }

  // === СОЗДАНИЕ TOAST ЭЛЕМЕНТА ===
  function createToastElement(options) {
    const { type = 'info', title, message, icon, action } = options;
    const typeConfig = TOAST_TYPES[type] || TOAST_TYPES.info;
    const displayIcon = icon || typeConfig.icon;

    const toast = document.createElement('div');
    toast.className = `heys-toast heys-toast--${type}`;

    const iconEl = document.createElement('span');
    iconEl.className = 'heys-toast__icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = displayIcon;
    toast.appendChild(iconEl);

    const content = document.createElement('div');
    content.className = 'heys-toast__content';

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'heys-toast__title';
      titleEl.textContent = title;
      content.appendChild(titleEl);
    }

    const messageText = message || (!title ? '' : null);
    if (messageText) {
      const messageEl = document.createElement('div');
      messageEl.className = title ? 'heys-toast__message' : 'heys-toast__title';
      messageEl.textContent = messageText;
      content.appendChild(messageEl);
    }

    toast.appendChild(content);

    if (action) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'heys-toast__action';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        action.onClick?.();
        hideToast(toast);
      });
      toast.appendChild(actionBtn);

      // Полоса времени: окно отмены равно видимой полосе, невидимого запаса
      // нет. Ссылка на nutrition-tab устарела — с девятой сборки отмену
      // описывает только undo-bar, а здесь остались роли, которых дизайн не
      // описывает вовсе. Рисуем полосу только у
      // тостов с действием — обычному сообщению обратный отсчёт не нужен.
      const duration = Number(options.duration);
      if (Number.isFinite(duration) && duration > 0) {
        const track = document.createElement('span');
        track.className = 'heys-toast__timer';
        track.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('i');
        fill.style.animationDuration = duration + 'ms';
        track.appendChild(fill);
        toast.appendChild(track);
      }
    }

    toast.addEventListener('click', () => hideToast(toast));

    return toast;
  }

  // === ПОКАЗ TOAST ===
  function showToast(options) {
    if (typeof options === 'string') {
      options = { message: options };
    }

    const { duration = CONFIG.defaultDuration } = options;

    // Новый тост отмены заменяет предыдущий, и прошлое удаление в этот момент
    // становится необратимым: очередь отмен ради случая, который почти не
    // происходит, — механизм дороже пользы (контракт nutrition-tab,
    // «два удаления подряд»). Обычные сообщения по-прежнему стопкой.
    if (options.action) {
      for (const shown of [...visibleToasts]) {
        if (shown.querySelector('.heys-toast__action')) hideToast(shown);
      }
    }

    while (visibleToasts.length >= CONFIG.maxVisible) {
      hideToast(visibleToasts[0]);
    }

    const container = ensureContainer();
    const toast = createToastElement(options);

    container.appendChild(toast);
    visibleToasts.push(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

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

    toast.classList.remove('is-visible');
    toast.classList.add('is-hiding');

    setTimeout(() => {
      toast.remove();
      visibleToasts = visibleToasts.filter(t => t !== toast);
    }, CONFIG.animationDuration);
  }

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

    confirm(message, actionLabel, onAction) {
      return showToast({
        type: 'warning',
        message,
        duration: 0,
        action: { label: actionLabel, onClick: onAction }
      });
    },

    hideAll() {
      [...visibleToasts].forEach(hideToast);
    }
  };

  HEYS.Toast = Toast;
  HEYS.toast = Toast.show;

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

  devLog('[HEYS] Toast module loaded');

})(typeof window !== 'undefined' ? window : global);
