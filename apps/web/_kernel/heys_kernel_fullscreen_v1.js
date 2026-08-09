// heys_kernel_fullscreen_v1.js — ОБЩЕЕ ЯДРО: полноэкранный слой тренировочных
// режимов (portal shell).
//
// Третья реализация одного и того же каркаса: у пальцев
// (fingers/heys_fingers_fullscreen_v1.js) и у мобильности
// (mobility/heys_mobility_entry_v1.js) он уже написан по-своему. Силовой
// конструктор не становится третьей копией — общее вынесено сюда как generic,
// по правилу двух/трёх из CLAUDE.md. Пальцы и мобильность переезжают отдельной
// задачей: их переписывание не входит в редизайн силовой.
//
// Каркас домен-агностичен: он ничего не знает о содержимом экрана и отвечает
// только за оболочку — монтирование портала, блокировку прокрутки фона,
// аппаратную кнопку «назад», Esc и доступность.
//
// Public API (HEYS.TrainingKernel.fullscreen):
//   mount({ id, render, onClose, ariaLabel, className, theme })  — открыть слой
//   unmount(id)                                                   — закрыть
//   isOpen(id)                                                    — открыт ли

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.fullscreen && TK.fullscreen.__registered) return; // idempotent

  const doc = global.document;
  const open = {}; // id → { host, scrollY, onClose, popHandler, keyHandler }

  function React() { return global.React; }
  function ReactDOM() { return global.ReactDOM; }

  function hostFor(id) {
    if (!doc) return null;
    const rootId = 'heys-fullscreen-' + id;
    let el = doc.getElementById(rootId);
    if (!el) {
      el = doc.createElement('div');
      el.id = rootId;
      doc.body.appendChild(el);
    }
    return el;
  }

  /**
   * Блокировка прокрутки фона через position:fixed, а не overflow:hidden: на
   * iOS overflow фон всё равно тянется, а позиция теряется. Возвращаем скролл
   * ровно туда, где человек был.
   */
  function lockScroll(state) {
    if (!doc) return;
    state.scrollY = global.scrollY || global.pageYOffset || 0;
    const body = doc.body;
    state.prevStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow
    };
    body.style.position = 'fixed';
    body.style.top = '-' + state.scrollY + 'px';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
  }

  function unlockScroll(state) {
    if (!doc || !state.prevStyle) return;
    const body = doc.body;
    body.style.position = state.prevStyle.position || '';
    body.style.top = state.prevStyle.top || '';
    body.style.width = state.prevStyle.width || '';
    body.style.overflow = state.prevStyle.overflow || '';
    try {
      global.scrollTo(0, state.scrollY || 0);
    } catch (e) { /* jsdom */ }
  }

  function renderInto(id, element) {
    const state = open[id];
    if (!state) return false;
    const RD = ReactDOM();
    if (!RD) return false;
    if (RD.createRoot && !state.root) state.root = RD.createRoot(state.host);
    if (state.root) state.root.render(element);
    else RD.render(element, state.host);
    return true;
  }

  /**
   * Открыть полноэкранный слой.
   * render — функция, возвращающая React-элемент содержимого; ей передаётся
   * `{ close }`, чтобы содержимое закрывало слой само, не зная про портал.
   */
  function mount(opts) {
    const o = opts || {};
    const id = String(o.id || 'default');
    const R = React();
    if (!R || !ReactDOM() || !doc) return false;
    if (open[id]) unmount(id);

    const host = hostFor(id);
    if (!host) return false;
    const state = { host: host, onClose: typeof o.onClose === 'function' ? o.onClose : null };
    open[id] = state;
    lockScroll(state);

    // Аппаратная «назад» закрывает слой, а не уводит со страницы: для человека
    // это модальный экран, и уход из дня стал бы потерей контекста.
    try {
      global.history.pushState({ heysFullscreen: id }, '');
      state.popHandler = function () { unmount(id); };
      global.addEventListener('popstate', state.popHandler);
      state.pushed = true;
    } catch (e) { /* history недоступна */ }

    state.keyHandler = function (ev) {
      if (ev && ev.key === 'Escape') unmount(id);
    };
    global.addEventListener('keydown', state.keyHandler);

    if (o.theme && doc.documentElement) {
      state.themeAttr = 'data-heys-fullscreen-theme';
      doc.documentElement.setAttribute(state.themeAttr, String(o.theme));
    }

    const close = function () { unmount(id); };
    const content = typeof o.render === 'function' ? o.render({ close: close }) : o.render;
    const wrapper = R.createElement('div', {
      className: 'heys-fullscreen' + (o.className ? ' ' + o.className : ''),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': o.ariaLabel || ''
    }, content);

    if (!renderInto(id, wrapper)) {
      unmount(id);
      return false;
    }
    return true;
  }

  /** Перерисовать содержимое уже открытого слоя, не пересоздавая портал. */
  function update(id, element) {
    return renderInto(String(id || 'default'), element);
  }

  function unmount(id) {
    const key = String(id || 'default');
    const state = open[key];
    if (!state) return false;
    delete open[key];

    if (state.keyHandler) global.removeEventListener('keydown', state.keyHandler);
    if (state.popHandler) {
      global.removeEventListener('popstate', state.popHandler);
      // История возвращается назад только если запись добавляли мы и уходим не
      // по самой «назад»: иначе браузер уедет на шаг дальше, чем человек просил.
      if (state.pushed && global.history && global.history.state
        && global.history.state.heysFullscreen === key) {
        try { global.history.back(); } catch (e) { /* noop */ }
      }
    }
    if (state.themeAttr && doc && doc.documentElement) {
      doc.documentElement.removeAttribute(state.themeAttr);
    }

    try {
      const RD = ReactDOM();
      if (state.root) state.root.unmount();
      else if (RD && RD.unmountComponentAtNode) RD.unmountComponentAtNode(state.host);
    } catch (e) { /* уже размонтирован */ }
    if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);

    unlockScroll(state);
    if (state.onClose) {
      try { state.onClose(); } catch (e) { /* обработчик домена */ }
    }
    return true;
  }

  function isOpen(id) {
    return !!open[String(id || 'default')];
  }

  TK.fullscreen = {
    __registered: true,
    mount: mount,
    update: update,
    unmount: unmount,
    isOpen: isOpen
  };
})(typeof window !== 'undefined' ? window : globalThis);
