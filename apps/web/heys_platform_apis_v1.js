/**
 * HEYS Platform APIs v1.0
 * =======================
 * Modern Web Platform APIs integration for PWA functionality
 * 
 * Includes 16 Platform APIs:
 * - Service Worker (registration, updates, background sync)
 * - Storage Management (persistent storage, estimates)
 * - Device Capabilities (memory, CPU, network)
 * - Idle Detection (user return detection)
 * - Window Controls Overlay (desktop PWA)
 * - Barcode Detection (product scanning)
 * - Web Share API (content sharing)
 * - Contact Picker API
 * - Speech Recognition API
 * - Launch Handler API
 * - Protocol Handler API
 * - File System Access API
 * - Credential Management API
 * - Screen Orientation API
 * - Fullscreen API
 * - Vibration API
 * - Web Animations API
 * 
 * @version 1.0.0
 * @feature-flag modular_platform_apis
 */

(function () {
  'use strict';

  const HEYS = window.HEYS = window.HEYS || {};
  const DEV = window.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
  const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };
  const devInfo = typeof DEV.info === 'function' ? DEV.info.bind(DEV) : function () { };
  const devDebug = typeof DEV.debug === 'function' ? DEV.debug.bind(DEV) : function () { };
  const trackError = (error, context) => {
    if (!HEYS?.analytics?.trackError) return;
    try {
      const err = error instanceof Error ? error : new Error(String(error || 'PlatformAPIs error'));
      HEYS.analytics.trackError(err, context);
    } catch (_) { }
  };
  const quietConsole = {
    trace: (...args) => { if (window.console && typeof window.console.trace === 'function') window.console.trace(...args); },
    log: (...args) => devLog(...args),
    info: (...args) => devInfo(...args),
    debug: (...args) => devDebug(...args),
    warn: (...args) => devWarn(...args),
    error: (...args) => {
      devWarn(...args);
      trackError(args[0], { scope: 'HEYS.PlatformAPIs', details: args.slice(1) });
    }
  };
  const console = quietConsole;

  // Check feature flag - если используется legacy mode, пропускаем модуль
  if (HEYS.featureFlags?.isEnabled('use_legacy_monolith')) {
    if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
      console.log('[PlatformAPIs] ⏭️ Skipped (legacy monolith mode)');
    }
    return;
  }

  // Performance tracking start
  HEYS.modulePerf?.startLoad('platform_apis');

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[PlatformAPIs] 📦 Loading module...');
  }

  // ============================================================================
  // EXTRACTED CODE FROM heys_app_v12.js (lines 481-2057)
  // ============================================================================

  // === Service Worker Registration (Production only) ===
  const UPDATE_BANNER_ID = 'heys-sw-update-banner';
  const OFFLINE_BANNER_ID = 'heys-offline-banner';
  const UPDATE_LOCK_KEY = 'heys_update_in_progress';
  const DROP_FENCE_SESSION_PREFIX = 'heys_drop_fence_';

  function clearSessionStoragePreservingDropFences() {
    const preserved = [];

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(DROP_FENCE_SESSION_PREFIX)) {
          preserved.push([key, sessionStorage.getItem(key)]);
        }
      }
    } catch (e) {
      preserved.length = 0;
    }

    try {
      sessionStorage.clear();
    } catch (e) {
      return;
    }

    preserved.forEach(([key, value]) => {
      try {
        if (value !== null) sessionStorage.setItem(key, value);
      } catch (e) { /* noop */ }
    });
  }
  const UPDATE_LOCK_TIMEOUT = 30000;
  const UPDATE_ATTEMPT_KEY = 'heys_update_attempt';
  const MAX_UPDATE_ATTEMPTS = 2;
  const UPDATE_COOLDOWN_MS = 60000;

  let _updateAvailable = false;
  let _updateVersion = null;

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 SW UPDATE STATE MACHINE (P3 hardening)
  // Lightweight diagnostic layer — tracks phases and detects illegal transitions.
  // States: idle → detected → downloading → ready → activating → reloading
  // ═══════════════════════════════════════════════════════════════════
  const SW_UPDATE_STATES = {
    IDLE: 'idle',
    DETECTED: 'detected',       // UPDATE_REQUIRED / updatefound received
    DOWNLOADING: 'downloading', // new SW installing
    READY: 'ready',             // newWorker.state === 'installed'
    ACTIVATING: 'activating',   // skipWaiting sent
    RELOADING: 'reloading',     // location.href about to change
  };
  const _SW_VALID_TRANSITIONS = {
    idle: ['detected'],
    detected: ['downloading', 'activating', 'idle'],   // activating = fast-path when already installed
    downloading: ['ready', 'idle'],                       // idle = timeout/error fallback
    ready: ['activating', 'idle'],
    activating: ['reloading', 'idle'],                   // idle = fallback if controller didn't change
    reloading: ['idle'],                                // idle = if reload aborted somehow
  };
  let _swUpdateState = SW_UPDATE_STATES.IDLE;
  let _swUpdateStateLog = [];
  const _SW_STATE_LOG_MAX = 20;

  function transitionSwUpdateState(to, source) {
    const from = _swUpdateState;
    const valid = _SW_VALID_TRANSITIONS[from];
    if (!valid || !valid.includes(to)) {
      console.error(
        `[SW-SM] 🚨 ILLEGAL transition: ${from} → ${to} (source: ${source}). ` +
        `Valid: [${(valid || []).join(', ')}]`
      );
      // Still apply to avoid stuck state, but flag it
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:sw-illegal-transition', {
          detail: { from, to, source, ts: Date.now() }
        }));
      }
    }
    _swUpdateState = to;
    const entry = { from, to, source, ts: Date.now() };
    _swUpdateStateLog.push(entry);
    if (_swUpdateStateLog.length > _SW_STATE_LOG_MAX) _swUpdateStateLog.shift();
    console.info(`[SW-SM] ${from} → ${to} (${source})`);
  }

  function getSwUpdateState() { return _swUpdateState; }
  function getSwUpdateStateLog() { return _swUpdateStateLog.slice(); }

  function getAppVersion() {
    return HEYS.version || window.APP_VERSION || 'unknown';
  }

  // === Семантическое сравнение версий ===
  // Версия: YYYY.MM.DD.HHMM.hash → сравниваем числовую часть
  function isNewerVersion(serverVersion, currentVersion) {
    if (!serverVersion || !currentVersion) return false;
    if (serverVersion === currentVersion) return false;

    const extractNumeric = (v) => {
      const parts = v.split('.');
      if (parts.length < 4) return 0;
      return parseInt(parts.slice(0, 4).join(''), 10) || 0;
    };

    const serverNum = extractNumeric(serverVersion);
    const currentNum = extractNumeric(currentVersion);

    return serverNum > currentNum;
  }

  function isUpdateLocked() {
    try {
      const lockData = localStorage.getItem(UPDATE_LOCK_KEY);
      if (!lockData) return false;
      const { timestamp } = JSON.parse(lockData);
      if (Date.now() - timestamp > UPDATE_LOCK_TIMEOUT) {
        localStorage.removeItem(UPDATE_LOCK_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function setUpdateLock() {
    localStorage.setItem(UPDATE_LOCK_KEY, JSON.stringify({ timestamp: Date.now() }));
  }

  function clearUpdateLock() {
    localStorage.removeItem(UPDATE_LOCK_KEY);
  }

  function showUpdateBadge(version) {
    _updateAvailable = true;
    _updateVersion = version;

    document.getElementById('heys-update-badge')?.remove();

    const badge = document.createElement('div');
    badge.id = 'heys-update-badge';
    badge.className = 'heys-update-badge';

    const button = document.createElement('button');
    button.id = 'heys-update-badge-btn';
    button.type = 'button';
    button.className = 'heys-update-badge__btn';
    button.innerHTML = `
      <span class="heys-update-badge__emoji">🆕</span>
      <span class="heys-update-badge__label">Обновить HEYS</span>
      <span class="heys-update-badge__version">v${version?.split('.').slice(0, 3).join('.') || 'new'}</span>
    `;
    button.addEventListener('click', () => installUpdate());

    badge.appendChild(button);
    document.body.appendChild(badge);

    if (navigator.vibrate) navigator.vibrate(50);
  }

  function hideUpdateBadge() {
    _updateAvailable = false;
    _updateVersion = null;

    const badge = document.getElementById('heys-update-badge');
    if (badge) {
      badge.classList.add('heys-update-badge--hide');
      setTimeout(() => badge.remove(), 300);
    }
  }

  function getProgressClass(progress) {
    const value = Number(progress) || 0;
    return `heys-update-modal__progress-bar--${value}`;
  }

  function showUpdateModal(stage = 'checking') {
    document.getElementById('heys-update-modal')?.remove();

    const stages = {
      checking: { icon: '🔍', title: 'Проверка обновлений', subtitle: 'Подождите...', isSpinner: false },
      found: { icon: '🆕', title: 'Найдено обновление!', subtitle: 'Загружаем новую версию...', isSpinner: false },
      downloading: { icon: '📥', title: 'Загрузка', subtitle: 'Это займёт пару секунд...', isSpinner: false },
      installing: { icon: '⚙️', title: 'Установка', subtitle: 'Почти готово...', isSpinner: false },
      ready: { icon: '✨', title: 'Готово!', subtitle: 'Приложение обновлено', isSpinner: false },
      reloading: { icon: 'spinner', title: 'Перезагрузка', subtitle: 'Применяем изменения...', isSpinner: true }
    };

    const s = stages[stage] || stages.checking;

    const iconHtml = `
      <div id="heys-update-icon" class="heys-update-modal__icon ${s.isSpinner ? 'is-spinner' : ''}">
        ${s.isSpinner ? '<div class="heys-update-modal__spinner"></div>' : s.icon}
      </div>
    `;

    const progressWidth = stage === 'checking'
      ? '20%'
      : stage === 'found'
        ? '40%'
        : stage === 'downloading'
          ? '60%'
          : stage === 'installing'
            ? '80%'
            : '100%';

    const progressValue = parseInt(progressWidth, 10) || 0;
    const progressClass = getProgressClass(progressValue);

    const progressHtml = `
      <div class="heys-update-modal__progress">
        <div id="heys-update-progress" class="heys-update-modal__progress-bar ${progressClass}"></div>
      </div>
    `;

    const footerHtml = `<p class="heys-update-modal__version">Версия ${getAppVersion()}</p>`;

    return renderUpdateDialog({
      dialogType: 'modal',
      id: 'heys-update-modal',
      rootClass: 'heys-update-modal',
      backdropClass: 'heys-update-modal__backdrop',
      cardClass: 'heys-update-modal__card',
      cardAttrs: 'role="dialog" aria-modal="true" aria-labelledby="heys-update-title" aria-describedby="heys-update-subtitle"',
      iconHtml,
      titleId: 'heys-update-title',
      titleClass: 'heys-update-modal__title',
      title: s.title,
      textId: 'heys-update-subtitle',
      textClass: 'heys-update-modal__subtitle',
      text: s.subtitle,
      progressHtml,
      footerHtml,
    });
  }

  function updateModalStage(stage) {
    const stages = {
      checking: { icon: '🔍', title: 'Проверка обновлений', subtitle: 'Подождите...', progress: 20, isSpinner: false },
      found: { icon: '🆕', title: 'Найдено обновление!', subtitle: 'Загружаем новую версию...', progress: 40, isSpinner: false },
      downloading: { icon: '📥', title: 'Загрузка', subtitle: 'Это займёт пару секунд...', progress: 60, isSpinner: false },
      installing: { icon: '⚙️', title: 'Установка', subtitle: 'Почти готово...', progress: 80, isSpinner: false },
      ready: { icon: '✨', title: 'Готово!', subtitle: 'Приложение обновлено', progress: 100, isSpinner: false },
      reloading: { icon: 'spinner', title: 'Перезагрузка', subtitle: 'Применяем изменения...', progress: 100, isSpinner: true }
    };

    const s = stages[stage];
    if (!s) return;

    const icon = document.getElementById('heys-update-icon');
    const title = document.getElementById('heys-update-title');
    const subtitle = document.getElementById('heys-update-subtitle');
    const progress = document.getElementById('heys-update-progress');

    if (icon) {
      if (s.isSpinner) {
        icon.innerHTML = '<div class="heys-update-modal__spinner"></div>';
        icon.classList.add('is-spinner');
      } else {
        icon.textContent = s.icon;
        icon.innerHTML = s.icon;
        icon.classList.remove('is-spinner');
      }
    }
    if (title) title.textContent = s.title;
    if (subtitle) subtitle.textContent = s.subtitle;
    if (progress) {
      progress.className = `heys-update-modal__progress-bar ${getProgressClass(s.progress)}`;
    }
  }

  function hideUpdateModal() {
    const modal = document.getElementById('heys-update-modal');
    if (modal) {
      modal.classList.add('heys-update-modal--hide');
      releaseUpdateDialogFocus(modal);
      setTimeout(() => modal.remove(), 300);
    }
  }

  function showManualRefreshPrompt(targetVersion) {
    document.getElementById('heys-update-modal')?.remove();

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    const iconHtml = '<div class="heys-update-prompt__spinner"></div>';
    const text = isIOS
      ? 'Закройте приложение и откройте заново для обновления до v' + targetVersion
      : 'Нажмите кнопку для обновления до v' + targetVersion;

    const actionsHtml = `${isIOS ? '' : `
      <button id="heys-manual-update-btn" class="heys-update-prompt__btn heys-update-prompt__btn--primary">Обновить сейчас</button>
    `}
      <button id="heys-update-later-btn" class="heys-update-prompt__btn heys-update-prompt__btn--ghost">Позже</button>
    `;

    const modal = renderUpdateDialog({
      dialogType: 'prompt',
      id: 'heys-update-modal',
      rootClass: 'heys-update-prompt',
      backdropClass: 'heys-update-prompt__backdrop',
      cardClass: 'heys-update-prompt__card',
      cardAttrs: 'role="dialog" aria-modal="true" aria-labelledby="heys-update-prompt-title" aria-describedby="heys-update-prompt-text"',
      iconHtml,
      titleId: 'heys-update-prompt-title',
      titleClass: 'heys-update-prompt__title',
      title: 'Требуется обновление',
      textId: 'heys-update-prompt-text',
      textClass: 'heys-update-prompt__text',
      text,
      footerHtml: actionsHtml,
    });

    const updateBtn = document.getElementById('heys-manual-update-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        localStorage.removeItem(UPDATE_ATTEMPT_KEY);
        const url = new URL(window.location.href);
        url.searchParams.set('_v', Date.now().toString());
        window.location.href = url.toString();
      });
    }

    const laterBtn = document.getElementById('heys-update-later-btn');
    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        releaseUpdateDialogFocus(modal);
        modal?.remove();
      });
    }
  }

  function renderUpdateDialog({
    dialogType,
    id,
    rootClass,
    backdropClass,
    cardClass,
    cardAttrs,
    iconHtml = '',
    titleId,
    titleClass,
    title,
    textId,
    textClass,
    text,
    progressHtml = '',
    footerHtml = '',
  }) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = rootClass;
    if (dialogType) {
      modal.dataset.updateDialog = dialogType;
    }

    const titleHtml = title
      ? `<h2 id="${titleId}" class="${titleClass}">${title}</h2>`
      : '';
    const textHtml = text
      ? `<p id="${textId}" class="${textClass}">${text}</p>`
      : '';

    modal.innerHTML = `
      <div class="${backdropClass}">
        <div class="${cardClass}" ${cardAttrs || ''}>
          ${iconHtml}
          ${titleHtml}
          ${textHtml}
          ${progressHtml}
          ${footerHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    trapUpdateDialogFocus(modal);
    return modal;
  }

  function trapUpdateDialogFocus(modal) {
    if (!modal) return;

    const focusables = getFocusableElements(modal);
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTarget = focusables[0] || modal.querySelector('[role="dialog"]') || modal;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      setTimeout(() => {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (_) {
          focusTarget.focus();
        }
      }, 0);
    }

    const handleKeydown = (event) => {
      if (event.key !== 'Tab') return;

      const items = getFocusableElements(modal);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const isShift = event.shiftKey;
      const active = document.activeElement;

      if (isShift && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!isShift && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener('keydown', handleKeydown);
    modal._heysFocusTrap = { previousActive, handleKeydown };
  }

  function releaseUpdateDialogFocus(modal) {
    const trap = modal?._heysFocusTrap;
    if (!trap) return;

    modal.removeEventListener('keydown', trap.handleKeydown);
    if (trap.previousActive && typeof trap.previousActive.focus === 'function') {
      try {
        trap.previousActive.focus({ preventScroll: true });
      } catch (_) {
        trap.previousActive.focus();
      }
    }
    delete modal._heysFocusTrap;
  }

  function getFocusableElements(container) {
    if (!container) return [];
    const selectors = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    return Array.from(container.querySelectorAll(selectors.join(',')))
      .filter((el) => el instanceof HTMLElement && !el.hasAttribute('disabled'));
  }

  function installUpdate() {
    hideUpdateBadge();
    showUpdateModal('found');
    setTimeout(() => updateModalStage('downloading'), 800);
    setTimeout(() => updateModalStage('installing'), 1600);
    setTimeout(() => {
      updateModalStage('reloading');
      forceUpdateAndReload(false);
    }, 2400);
  }

  function getNetworkQuality() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return { type: 'unknown', quality: 'good' };

    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink;
    const rtt = connection.rtt;

    let quality = 'good';
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || rtt > 500) {
      quality = 'poor';
    } else if (effectiveType === '3g' || rtt > 200 || downlink < 1) {
      quality = 'moderate';
    }

    return { type: effectiveType || 'unknown', downlink, rtt, quality, saveData: connection.saveData };
  }

  async function smartVersionCheck() {
    const network = getNetworkQuality();

    if (network.quality === 'poor' || network.saveData) {
      return;
    }

    try {
      const hasUpdate = await checkServerVersion(true);

      if (hasUpdate) {
        showUpdateBadge(_updateVersion);
      }
    } catch (e) {
      return;
    }
  }

  async function checkServerVersion(silent = true) {
    try {
      const cacheBust = Date.now();
      const response = await fetch(`/build-meta.json?_cb=${cacheBust}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });

      if (!response.ok) return false;

      const data = await response.json();
      const currentVersion = getAppVersion();

      if (data.version && isNewerVersion(data.version, currentVersion)) {
        _updateVersion = data.version;

        const attempt = JSON.parse(localStorage.getItem(UPDATE_ATTEMPT_KEY) || '{}');
        const now = Date.now();

        if (attempt.timestamp && (now - attempt.timestamp) < UPDATE_COOLDOWN_MS) {
          return false;
        }

        if (attempt.targetVersion === data.version) {
          attempt.count = (attempt.count || 0) + 1;
        } else {
          attempt.targetVersion = data.version;
          attempt.count = 1;
        }
        attempt.timestamp = now;
        localStorage.setItem(UPDATE_ATTEMPT_KEY, JSON.stringify(attempt));

        if (attempt.count > MAX_UPDATE_ATTEMPTS) {
          showManualRefreshPrompt(data.version);
          return true;
        }

        if (isUpdateLocked()) {
          return true;
        }
        setUpdateLock();

        showUpdateModal('found');
        setTimeout(() => updateModalStage('downloading'), 1200);
        setTimeout(() => updateModalStage('installing'), 2400);
        setTimeout(() => {
          updateModalStage('reloading');
          forceUpdateAndReload(false);
        }, 3600);

        setTimeout(() => {
          const modal = document.getElementById('heys-update-modal');
          if (modal) {
            hideUpdateModal();
            clearUpdateLock();
          }
        }, 12000);

        return true;
      } else if (data.version && data.version !== currentVersion) {
        return false;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  function createSystemBanner({ id, className, text, actions }) {
    if (!document?.body || document.getElementById(id)) return;

    const banner = document.createElement('div');
    banner.id = id;
    banner.className = className;

    const textEl = document.createElement('span');
    textEl.className = 'heys-system-banner__text';
    textEl.textContent = text;
    banner.appendChild(textEl);

    if (Array.isArray(actions) && actions.length > 0) {
      const actionsEl = document.createElement('div');
      actionsEl.className = 'heys-system-banner__actions';
      actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = action.className;
        btn.textContent = action.label;
        btn.addEventListener('click', action.onClick);
        actionsEl.appendChild(btn);
      });
      banner.appendChild(actionsEl);
    }

    document.body.appendChild(banner);
  }

  function showUpdateNotification() {
    createSystemBanner({
      id: UPDATE_BANNER_ID,
      className: 'heys-system-banner heys-system-banner--update',
      text: 'Доступно обновление приложения',
      actions: [
        {
          label: '🔄 Обновить',
          className: 'heys-system-banner__btn heys-system-banner__btn--primary',
          onClick: () => {
            triggerSkipWaiting({
              fallbackMs: 5000,
              showModal: true,
              source: 'update-banner',
            });
          }
        },
        {
          label: '✕',
          className: 'heys-system-banner__btn heys-system-banner__btn--ghost',
          onClick: () => {
            const banner = document.getElementById(UPDATE_BANNER_ID);
            if (banner) banner.remove();
          }
        }
      ]
    });
  }

  function showOfflineNotification() {
    createSystemBanner({
      id: OFFLINE_BANNER_ID,
      className: 'heys-system-banner heys-system-banner--offline',
      text: '📴 Офлайн режим — данные сохраняются локально',
      actions: []
    });
  }

  function hideOfflineNotification() {
    const banner = document.getElementById(OFFLINE_BANNER_ID);
    if (banner) banner.remove();
  }

  function registerServiceWorker() {
    const bootLog = (msg) => window.__heysLog && window.__heysLog('[SW] ' + msg);

    if (!('serviceWorker' in navigator)) {
      bootLog('not supported');
      return;
    }

    // ❌ НЕ регистрируем SW на localhost — мешает разработке (HMR, updatefound и т.д.)
    // ❌ НЕ регистрируем SW в demo-режиме — иначе бандлы demo закэшируются у посетителей
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isDemoMode = window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled;
    if (isLocalhost || isDemoMode) {
      const reason = isDemoMode ? 'demo mode' : 'localhost';
      console.log('[SW] ⏭️ Skipped (' + reason + ')');
      bootLog('skipped (' + reason + ')');
      // Удаляем существующий SW если есть (чтобы не мешал)
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
          reg.unregister().then(() => {
            console.log('[SW] 🗑️ Unregistered SW (' + reason + ')');
          });
        });
      });
      return;
    }

    bootLog('registering...');

    // One SW `message` listener — avoids duplicate handlers + defers heavy branches off the SW event turn.
    if (!window.__heysSwUnifiedMessageBound) {
      window.__heysSwUnifiedMessageBound = true;
      const deferSwPortWork = (fn) => {
        const run = () => {
          const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          try {
            fn();
          } catch (e) {
            console.warn('[SW] deferred message handler error', e);
          } finally {
            try {
              if (global.localStorage && global.localStorage.getItem('heys_perf_smoothness_sample') === '1' && global.HEYS?.debug?.bumpSmoothnessCounter) {
                const dt = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
                const b = dt < 16 ? 'b0_16' : dt < 100 ? 'b16_100' : 'b100p';
                global.HEYS.debug.bumpSmoothnessCounter('sw_deferred_ms_' + b);
              }
            } catch (_) { /* noop */ }
          }
        };
        try {
          if (typeof queueMicrotask === 'function') {
            queueMicrotask(run);
          } else {
            setTimeout(run, 0);
          }
        } catch (_) {
          setTimeout(run, 0);
        }
      };
      navigator.serviceWorker.addEventListener('message', (event) => {
        const t = event && event.data && event.data.type;
        if (!t) return;

        if (t === 'UPDATE_AVAILABLE') {
          deferSwPortWork(() => {
            console.log('[SW] 🆕 Background update detected:', event.data.version);
            showUpdateBadge(event.data.version);
            showUpdateNotification();
          });
          return;
        }

        if (t === 'UPDATE_REQUIRED') {
          deferSwPortWork(() => {
            console.log('[SW] 🧭 Version mismatch — forcing update:', event.data.version);
            transitionSwUpdateState(SW_UPDATE_STATES.DETECTED, 'update-required-msg');
            if (typeof HEYS.forceCheckAndUpdate === 'function') {
              HEYS.forceCheckAndUpdate();
            } else {
              triggerSkipWaiting({
                fallbackMs: 5000,
                showModal: true,
                source: 'update-required',
              });
            }
          });
          return;
        }

        if (t === 'CACHES_CLEARED') {
          deferSwPortWork(() => {
            const managedByChecks = sessionStorage.getItem('heys_update_managed_by_checks') === 'true';
            if (managedByChecks) {
              console.log('[SW] ✅ Caches cleared — lifecycle managed by update_checks, skipping reload here');
              try {
                sessionStorage.removeItem('heys_update_managed_by_checks');
              } catch (e) { /* noop */ }
              return;
            }

            const requiresLogout = sessionStorage.getItem('heys_update_requires_logout') === 'true';
            console.log('[SW] ✅ Caches cleared — resetting session for fresh data from cloud');

            if (requiresLogout) {
              window.HEYS = window.HEYS || {};
              window.HEYS._isLoggingOut = true;
            }

            if (requiresLogout) {
              try {
                if (HEYS.cloud?.signOut) {
                  HEYS.cloud.signOut();
                }

                const keysToRemove = [];
                const keysToKeep = ['heys_products', 'heys_profile', 'heys_norms', 'heys_hr_zones'];
                // Browser-global UI keys are not tied to a client/session and
                // must survive the update-triggered session reset.
                const cloudRef = window.HEYS && window.HEYS.cloud;
                const isBrowserGlobalUiKey = (k) =>
                  !!(cloudRef && typeof cloudRef.isNonClientDataKey === 'function' && cloudRef.isNonClientDataKey(k));

                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (!keysToKeep.some(k => key.includes(k)) && !key.startsWith('heys_dayv2_') && !isBrowserGlobalUiKey(key)) {
                    keysToRemove.push(key);
                  }
                }

                keysToRemove.forEach(key => localStorage.removeItem(key));
                console.log(`[SW] 🗑️ Removed ${keysToRemove.length} session keys, kept critical data`);

                clearSessionStoragePreservingDropFences();

                console.log('[SW] ✅ Session cleared safely, reloading...');
              } catch (e) {
                console.warn('[SW] Session clear error:', e);
              }
            }

            try {
              sessionStorage.removeItem('heys_update_requires_logout');
            } catch (e) { /* noop */ }

            setTimeout(() => {
              try {
                sessionStorage.removeItem('heys_pending_update');
              } catch (e) { /* noop */ }
              clearUpdateLock();
              transitionSwUpdateState(SW_UPDATE_STATES.RELOADING, 'caches-cleared');
              const url = new URL(window.location.href);
              url.searchParams.set('_v', Date.now().toString());
              window.location.href = url.toString();
            }, 100);
          });
          return;
        }

        if (t === 'SYNC_START' && window.HEYS?.cloud?.sync) {
          deferSwPortWork(() => {
            window.HEYS.cloud.sync();
          });
          return;
        }

        if (t === 'SYNC_COMPLETE') {
          deferSwPortWork(() => {
            window.dispatchEvent(new CustomEvent('heys:sync-complete'));
          });
          return;
        }

        // === Phase A KV SWR контракт (2026-05-27) ===
        // First iteration: log-only. Cache served stale, user may write → SW
        // invalidates, next visit refetches. KV_FRESH сообщает что background
        // refresh завершился — пока не триггерим re-apply (UI уже работает с
        // данными из localStorage / Phase A applyForegroundHotSyncValue path).
        // Если решим добавлять re-apply — менять ТОЛЬКО эти branches, без
        // правок в SW (контракт стабилен).
        if (t === 'KV_INVALIDATED') {
          deferSwPortWork(() => {
            try {
              if (window.__heysLogControl?.isEnabled?.('sw') === true) {
                console.log('[SW] 🔁 KV cache invalidated:', event.data.reason || 'unknown');
              }
            } catch (_) { /* noop */ }
          });
          return;
        }

        if (t === 'KV_FRESH') {
          deferSwPortWork(() => {
            try {
              if (window.__heysLogControl?.isEnabled?.('sw') === true) {
                console.log('[SW] ✨ KV background refresh complete');
              }
            } catch (_) { /* noop */ }
          });
          return;
        }
      });
    }

    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] ✅ Registered successfully');

        // Сохраняем регистрацию для Background Sync
        window.swRegistration = registration;

        // Background Sync — регистрируем при изменениях данных
        window.requestBackgroundSync = function () {
          if ('sync' in registration) {
            registration.sync.register('heys-sync')
              .then(function () { console.log('[SW] Background sync scheduled'); })
              .catch(function () { /* Background sync not available */ });
          }
        };

        // 🆕 Periodic Background Sync — автоматическая проверка обновлений в фоне
        // (раз в час когда приложение не активно, с WiFi)
        if ('periodicSync' in registration) {
          (async () => {
            try {
              const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
              if (status.state === 'granted') {
                await registration.periodicSync.register('heys-periodic-update', {
                  minInterval: 60 * 60 * 1000, // 1 час
                });
                console.log('[SW] ⏰ Periodic Background Sync registered (1h)');
              }
            } catch (e) {
              console.log('[SW] Periodic Background Sync not supported');
            }
          })();
        }

        // SW postMessage — единый deferred listener (__heysSwUnifiedMessageBound) выше.

        // Проверяем обновления каждые 60 секунд (не будим SW-проверки в фоновой вкладке)
        setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          registration.update().catch(() => { });
        }, 60000);
        document.addEventListener('visibilitychange', () => {
          if (typeof document !== 'undefined' && !document.hidden) {
            registration.update().catch(() => { });
          }
        });

        // Слушаем обновления
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[SW] 🔄 New version downloading...');
          transitionSwUpdateState(SW_UPDATE_STATES.DETECTED, 'updatefound');

          // 🔒 Показываем модалку ТОЛЬКО если это реальное обновление (есть предыдущий SW)
          // Используем registration.active — он показывает есть ли АКТИВНЫЙ SW до этого
          // controller может быть null если страница загружена до активации SW
          const hasExistingSW = registration.active || navigator.serviceWorker.controller;
          if (!hasExistingSW) {
            console.log('[SW] First-time install, no update modal needed');
            return;
          }

          console.log('[SW] 🆕 Update detected! Existing SW:', registration.active?.state || 'controller');

          // Предотвращаем дублирование обновления (надёжный флаг в localStorage)
          if (isUpdateLocked()) {
            console.log('[SW] Update already in progress (locked), skipping');
            return;
          }

          // 🔒 Устанавливаем флаг ДО показа модалки — это реальное обновление
          sessionStorage.setItem('heys_pending_update', 'true');
          setUpdateLock();

          // Показываем UI обновления
          showUpdateModal('downloading');
          transitionSwUpdateState(SW_UPDATE_STATES.DOWNLOADING, 'updatefound-modal');

          // 🔒 Fallback: если через 10 секунд модалка ещё на экране — убираем
          const swUpdateTimeout = setTimeout(() => {
            const modal = document.getElementById('heys-update-modal');
            if (modal) {
              console.warn('[SW] Update modal timeout, hiding...');
              hideUpdateModal();
              clearUpdateLock();
            }
          }, 10000);

          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              console.log('[SW] 🎉 New version ready!');
              transitionSwUpdateState(SW_UPDATE_STATES.READY, 'sw-installed');
              clearTimeout(swUpdateTimeout); // Отменяем fallback
              // Упрощённая анимация: ready → reloading → reload
              updateModalStage('ready');
              setTimeout(() => {
                updateModalStage('reloading');
                forceUpdateAndReload(false);
              }, 800);
            }
          });
        });
      })
      .catch((error) => {
        console.log('[SW] ❌ Registration failed', error);
      });

    // Offline/Online banner
    window.addEventListener('offline', showOfflineNotification);
    window.addEventListener('online', hideOfflineNotification);
    if (navigator.onLine === false) {
      showOfflineNotification();
    }

    // Слушаем контроллер изменений (когда SW взял контроль)
    // ✅ АВТОМАТИЧЕСКИЙ reload при смене SW для бесшовного обновления PWA
    let refreshing = false;
    let hadControllerBefore = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] Controller changed — new SW activated!');
      if (refreshing) return;

      // 🔒 Показываем модалку и делаем reload ТОЛЬКО если это реальное обновление
      // Реальное обновление: был контроллер до этого ИЛИ есть флаг pending_update
      const isRealUpdate = hadControllerBefore ||
        sessionStorage.getItem('heys_pending_update') === 'true' ||
        isUpdateLocked();

      console.log('[SW] Update check:', { hadControllerBefore, isRealUpdate });

      if (isRealUpdate) {
        // Реальное обновление — показываем модалку и делаем reload
        refreshing = true;
        showUpdateModal('reloading');

        // v63: НЕ ждём завершения sync перед reload.
        // Предыдущее поведение (v61/v62) откладывало reload до окончания sync (до 15с),
        // из-за чего пользователь видел полную загрузку данных, потом restart, потом
        // ещё раз полную загрузку — двойной cascade dots.
        // Данные в localStorage сохраняются при reload. На второй загрузке sync
        // подберёт и досинхронизирует всё, что не успело уйти на сервер.
        const doReload = () => {
          // Очищаем флаги ПЕРЕД reload — после него SW выполняет clients.claim()
          // за счёт чего может сработать controllerchange на новой странице.
          // Если флаги не убрать, isRealUpdate = true даже при hadControllerBefore = false,
          // что вызывает ложный второй reload (именно это приводит к мерцанию What's New).
          try { sessionStorage.removeItem('heys_pending_update'); } catch (e) { }
          clearUpdateLock();
          transitionSwUpdateState(SW_UPDATE_STATES.RELOADING, 'controllerchange');
          console.info('[SW] 🔄 Reloading page with new SW... (triggered by controllerchange)');
          const url = new URL(window.location.href);
          url.searchParams.set('_v', Date.now().toString());
          window.location.href = url.toString();
        };
        setTimeout(doReload, 500);
      } else {
        // Первичная установка SW — НЕ делаем reload, страница уже загружена
        console.log('[SW] First-time controller activation, no reload needed');
      }
    });
  }

  // === Централизованная функция skipWaiting с debounce и проверками ===
  let _skipWaitingInProgress = false;
  const SKIP_WAITING_DEBOUNCE_MS = 500;

  async function triggerSkipWaiting(options = {}) {
    const { fallbackMs = 5000, showModal = false, source = 'unknown' } = options;

    // Debounce: предотвращаем множественные вызовы
    if (_skipWaitingInProgress) {
      console.log('[SW] ⏳ skipWaiting already in progress, skipping duplicate from:', source);
      return false;
    }

    _skipWaitingInProgress = true;
    console.log('[SW] 🔄 triggerSkipWaiting called from:', source);
    transitionSwUpdateState(SW_UPDATE_STATES.ACTIVATING, 'skipWaiting-' + source);

    try {
      // 1. Проверяем наличие SW controller
      if (!navigator.serviceWorker?.controller) {
        console.warn('[SW] ⚠️ No active SW controller — skipping skipWaiting');
        return false;
      }

      // 2. Проверяем есть ли waiting SW (новая версия готова)
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        console.log('[SW] ✅ Found waiting SW — sending skipWaiting');
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        // Fallback: отправляем на controller (для старого формата)
        console.log('[SW] ⚠️ No waiting SW found — sending to controller (legacy)');
        navigator.serviceWorker.controller.postMessage('skipWaiting');
      }

      // 3. Устанавливаем флаги для корректного reload
      sessionStorage.setItem('heys_pending_update', 'true');
      sessionStorage.setItem('heys_force_sync_after_update', 'true');

      // 4. Показываем модал если нужно
      if (showModal && typeof showUpdateModal === 'function') {
        showUpdateModal('reloading');
      }

      // 5. Fallback таймер (если controllerchange не сработает)
      setTimeout(() => {
        if (sessionStorage.getItem('heys_pending_update') === 'true') {
          console.log('[SW] ⚡ Fallback reload after', fallbackMs, 'ms (triggered by triggerSkipWaiting fallback)');
          // Очищаем флаги перед reload чтобы не триггерить повторный controllerchange
          try { sessionStorage.removeItem('heys_pending_update'); } catch (e) { }
          clearUpdateLock();
          transitionSwUpdateState(SW_UPDATE_STATES.RELOADING, 'skipWaiting-fallback');
          const url = new URL(window.location.href);
          url.searchParams.set('_v', Date.now().toString());
          window.location.href = url.toString();
        }
      }, fallbackMs);

      return true;
    } catch (err) {
      console.error('[SW] ❌ triggerSkipWaiting error:', err);
      return false;
    } finally {
      // Сброс debounce через заданное время
      setTimeout(() => {
        _skipWaitingInProgress = false;
      }, SKIP_WAITING_DEBOUNCE_MS);
    }
  }

  // === Принудительное обновление ===
  function forceUpdateAndReload(showModal = true) {

    if (showModal) {
      showUpdateModal('reloading');
    }

    // Используем централизованную функцию с debounce и проверками
    triggerSkipWaiting({
      fallbackMs: 5000,
      showModal: false, // модал уже показан выше
      source: 'forceUpdateAndReload'
    });
  }

  // === Persistent Storage API ===
  // Защищает данные приложения от автоматического удаления браузером при нехватке места
  // Это критически важно для PWA с офлайн-данными
  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) {
      console.log('[Storage] Persistent Storage API not supported');
      return false;
    }

    try {
      // Проверяем текущий статус
      const isPersisted = await navigator.storage.persisted();

      if (isPersisted) {
        console.log('[Storage] ✅ Already persistent');
        return true;
      }

      // Запрашиваем постоянное хранение
      const granted = await navigator.storage.persist();

      if (granted) {
        console.log('[Storage] ✅ Persistent storage granted!');
        // Вибрация-подтверждение
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        return true;
      } else {
        console.log('[Storage] ⚠️ Persistent storage denied by browser');
        return false;
      }
    } catch (e) {
      console.error('[Storage] Error requesting persistence:', e);
      return false;
    }
  }

  // Storage Estimate — показывает сколько места используется
  async function getStorageEstimate() {
    if (!navigator.storage?.estimate) {
      return { usage: 0, quota: 0, usageDetails: {} };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
      const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(2);
      const usagePercent = ((estimate.usage / estimate.quota) * 100).toFixed(1);

      console.log(`[Storage] 📊 Usage: ${usageMB}MB / ${quotaMB}MB (${usagePercent}%)`);

      // Детализация по типам (если доступна)
      if (estimate.usageDetails) {
        Object.entries(estimate.usageDetails).forEach(([key, value]) => {
          console.log(`[Storage]   - ${key}: ${(value / (1024 * 1024)).toFixed(2)}MB`);
        });
      }

      return {
        usage: estimate.usage,
        quota: estimate.quota,
        usageMB: parseFloat(usageMB),
        quotaMB: parseFloat(quotaMB),
        usagePercent: parseFloat(usagePercent),
        usageDetails: estimate.usageDetails || {}
      };
    } catch (e) {
      console.error('[Storage] Error getting estimate:', e);
      return { usage: 0, quota: 0, usageDetails: {} };
    }
  }

  // Экспортируем для использования в приложении
  HEYS.storage = HEYS.storage || {};
  HEYS.storage.requestPersistent = requestPersistentStorage;
  HEYS.storage.getEstimate = getStorageEstimate;

  // Запрашиваем Persistent Storage автоматически после первого использования
  // (когда есть данные, которые стоит защитить)
  setTimeout(async () => {
    // Проверяем, есть ли у нас значимые данные
    const hasLocalData = Object.keys(localStorage).some(k => k.startsWith('heys_'));
    if (hasLocalData) {
      await requestPersistentStorage();
    }
  }, 5000);

  // === Device Capabilities API ===
  // Определяем возможности устройства для адаптивной производительности
  function getDeviceCapabilities() {
    const capabilities = {
      // Память устройства (GB) — используем для адаптации размера кэша
      memory: navigator.deviceMemory || 4, // fallback 4GB

      // Количество логических процессоров — для Web Workers
      cores: navigator.hardwareConcurrency || 4,

      // Тип соединения
      connection: navigator.connection ? {
        type: navigator.connection.effectiveType || 'unknown',
        downlink: navigator.connection.downlink || 0,
        rtt: navigator.connection.rtt || 0,
        saveData: navigator.connection.saveData || false
      } : { type: 'unknown', downlink: 0, rtt: 0, saveData: false },

      // Размер экрана
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        pixelRatio: window.devicePixelRatio || 1,
        colorDepth: window.screen.colorDepth || 24
      },

      // Touch capabilities
      hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      maxTouchPoints: navigator.maxTouchPoints || 0,

      // Платформа
      platform: navigator.platform || 'unknown',
      isStandalone: window.matchMedia('(display-mode: standalone)').matches,

      // Предпочтения пользователя
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      prefersColorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      prefersReducedData: window.matchMedia('(prefers-reduced-data: reduce)').matches
    };

    // Определяем уровень производительности устройства
    let performanceLevel = 'high'; // default

    if (capabilities.memory <= 2 || capabilities.cores <= 2) {
      performanceLevel = 'low';
    } else if (capabilities.memory <= 4 || capabilities.cores <= 4) {
      performanceLevel = 'medium';
    }

    // Если включён режим экономии данных — снижаем уровень
    if (capabilities.connection.saveData) {
      performanceLevel = 'low';
    }

    capabilities.performanceLevel = performanceLevel;

    console.log(`[Device] 📱 Capabilities:`, {
      memory: `${capabilities.memory}GB`,
      cores: capabilities.cores,
      connection: capabilities.connection.type,
      performanceLevel,
      standalone: capabilities.isStandalone
    });

    return capabilities;
  }

  // Экспортируем capabilities
  HEYS.device = getDeviceCapabilities();

  // Обновляем при изменении соединения
  if (navigator.connection) {
    navigator.connection.addEventListener('change', () => {
      HEYS.device = getDeviceCapabilities();
    });
  }

  // === Idle Detection API ===
  // Отслеживаем когда пользователь возвращается к устройству
  // Полезно для синхронизации данных и умных напоминаний
  let idleDetector = null;
  let lastIdleTime = null;

  function syncAfterIdleReturn() {
    const cloudRef = window.HEYS && window.HEYS.cloud;
    if (!cloudRef || typeof cloudRef.sync !== 'function') return false;

    try {
      Promise.resolve(cloudRef.sync()).catch((error) => {
        console.warn('[HEYS.platform] Idle sync after return failed', error);
      });
      return true;
    } catch (error) {
      console.warn('[HEYS.platform] Idle sync after return failed', error);
      return false;
    }
  }

  async function startIdleDetection() {
    if (!('IdleDetector' in window)) {
      console.log('[Idle] IdleDetector API not supported');
      return false;
    }

    try {
      // Запрашиваем разрешение
      const state = await IdleDetector.requestPermission();
      if (state !== 'granted') {
        console.log('[Idle] Permission denied');
        return false;
      }

      idleDetector = new IdleDetector();

      idleDetector.addEventListener('change', () => {
        const { userState, screenState } = idleDetector;

        // Пользователь стал активен после простоя
        if (userState === 'active' && lastIdleTime) {
          const idleDuration = Date.now() - lastIdleTime;
          const idleMinutes = Math.round(idleDuration / 60000);

          console.log(`[Idle] 👋 User returned after ${idleMinutes} min`);

          // Если был неактивен больше 5 минут — синхронизируем данные
          if (idleMinutes >= 5 && window.HEYS?.cloud?.sync) {
            console.log('[Idle] Syncing after idle period...');
            syncAfterIdleReturn();
          }

          // Если был неактивен больше 30 минут — проверяем обновления
          if (idleMinutes >= 30) {
            checkServerVersion(true);
          }

          // Dispatch custom event для компонентов
          window.dispatchEvent(new CustomEvent('heys:user-returned', {
            detail: { idleMinutes }
          }));

          lastIdleTime = null;
        }

        // Пользователь стал неактивен
        if (userState === 'idle' || screenState === 'locked') {
          lastIdleTime = Date.now();
          console.log('[Idle] 💤 User went idle/screen locked');
        }
      });

      // Порог простоя — 60 секунд
      await idleDetector.start({ threshold: 60000 });
      console.log('[Idle] ✅ Idle detection started');
      return true;

    } catch (e) {
      console.error('[Idle] Error starting detection:', e);
      return false;
    }
  }

  function stopIdleDetection() {
    if (idleDetector) {
      idleDetector.abort();
      idleDetector = null;
      console.log('[Idle] Stopped');
    }
  }

  // Экспортируем
  HEYS.idle = {
    start: startIdleDetection,
    stop: stopIdleDetection,
    _syncAfterIdleReturn: syncAfterIdleReturn
  };

  // Автоматический запуск если в standalone режиме
  if (window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(startIdleDetection, 10000); // Запускаем через 10 сек после старта
  }

  // === Window Controls Overlay API ===
  // Для десктопных PWA — получаем информацию о области заголовка окна
  function initWindowControlsOverlay() {
    if (!('windowControlsOverlay' in navigator)) {
      console.log('[WCO] Window Controls Overlay not supported');
      return;
    }

    const overlay = navigator.windowControlsOverlay;

    // Получаем начальную геометрию
    function updateTitlebarGeometry() {
      const { visible, x, y, width, height } = overlay.getTitlebarAreaRect?.() || {};

      if (visible) {
        console.log(`[WCO] 📐 Titlebar area: ${width}x${height} at (${x}, ${y})`);

        // Устанавливаем CSS переменные для использования в стилях
        document.documentElement.style.setProperty('--titlebar-area-x', `${x}px`);
        document.documentElement.style.setProperty('--titlebar-area-y', `${y}px`);
        document.documentElement.style.setProperty('--titlebar-area-width', `${width}px`);
        document.documentElement.style.setProperty('--titlebar-area-height', `${height}px`);

        // Добавляем класс для стилизации
        document.body.classList.add('wco-enabled');
      } else {
        document.body.classList.remove('wco-enabled');
      }
    }

    // Слушаем изменения
    overlay.addEventListener('geometrychange', updateTitlebarGeometry);

    // Начальное обновление
    updateTitlebarGeometry();

    console.log('[WCO] ✅ Window Controls Overlay initialized');
  }

  // Инициализируем WCO если это десктоп PWA
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
    initWindowControlsOverlay();
  }

  // === Barcode Detection API ===
  // Сканирование штрих-кодов продуктов с камеры
  let barcodeDetector = null;
  let barcodePolyfillPromise = null;
  let barcodeDetectorFormats = [];
  let barcodeScanStats = null;
  let barcodeFallbackCanvas = null;
  const BARCODE_POLYFILL_BASE = '/vendor/barcode/';
  const PRODUCT_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
  const EAN13_LEFT_ODD = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'
  ];
  const EAN13_LEFT_EVEN = [
    '0100111', '0110011', '0011011', '0100001', '0011101',
    '0111001', '0000101', '0010001', '0001001', '0010111'
  ];
  const EAN13_RIGHT = [
    '1110010', '1100110', '1101100', '1000010', '1011100',
    '1001110', '1010000', '1000100', '1001000', '1110100'
  ];
  const EAN13_PARITY_PREFIX = {
    LLLLLL: '0',
    LLGLGG: '1',
    LLGGLG: '2',
    LLGGGL: '3',
    LGLLGG: '4',
    LGGLLG: '5',
    LGGGLL: '6',
    LGLGLG: '7',
    LGLGGL: '8',
    LGGLGL: '9'
  };

  function canLoadBarcodePolyfill() {
    return typeof document !== 'undefined'
      && typeof WebAssembly !== 'undefined'
      && typeof Promise !== 'undefined';
  }

  function shouldPreferBarcodePolyfill() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function getBarcodePolyfillGlobal() {
    if (window.barcodeDetectorPolyfill) return window.barcodeDetectorPolyfill;
    try {
      // The vendored UMD bundle declares `const barcodeDetectorPolyfill = ...`;
      // Safari exposes that as a global lexical binding, not as window property.
      if (typeof barcodeDetectorPolyfill !== 'undefined') return barcodeDetectorPolyfill;
    } catch (_) { }
    return null;
  }

  function getBarcodeDebugState() {
    const polyfillGlobal = getBarcodePolyfillGlobal();
    return {
      hasBarcodeDetector: 'BarcodeDetector' in window,
      hasWindowPolyfill: !!window.barcodeDetectorPolyfill,
      hasGlobalPolyfill: !!polyfillGlobal,
      hasPolyfillClass: !!polyfillGlobal?.BarcodeDetectorPolyfill,
      canLoadPolyfill: canLoadBarcodePolyfill(),
      prefersPolyfill: shouldPreferBarcodePolyfill(),
      formats: barcodeDetectorFormats,
      scan: barcodeScanStats
    };
  }

  function clampRect(rect, width, height) {
    const x = Math.max(0, Math.min(width - 1, Math.round(rect.x)));
    const y = Math.max(0, Math.min(height - 1, Math.round(rect.y)));
    const w = Math.max(1, Math.min(width - x, Math.round(rect.w)));
    const h = Math.max(1, Math.min(height - y, Math.round(rect.h)));
    return { x, y, w, h };
  }

  function getVisibleVideoRect(videoElement) {
    const vw = videoElement.videoWidth || 0;
    const vh = videoElement.videoHeight || 0;
    if (!vw || !vh) return null;

    const boxW = videoElement.clientWidth || 4;
    const boxH = videoElement.clientHeight || 3;
    const sourceRatio = vw / vh;
    const boxRatio = boxW / boxH;

    if (sourceRatio > boxRatio) {
      const w = vh * boxRatio;
      return clampRect({ x: (vw - w) / 2, y: 0, w, h: vh }, vw, vh);
    }

    const h = vw / boxRatio;
    return clampRect({ x: 0, y: (vh - h) / 2, w: vw, h }, vw, vh);
  }

  function createBarcodeFrameSampler(videoElement) {
    const canvases = new Map();
    const getCanvas = (name, width, height) => {
      let item = canvases.get(name);
      if (!item) {
        const canvas = document.createElement('canvas');
        item = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
        canvases.set(name, item);
      }
      if (item.canvas.width !== width) item.canvas.width = width;
      if (item.canvas.height !== height) item.canvas.height = height;
      return item;
    };

    const drawCrop = (name, rect, maxWidth = 960) => {
      const vw = videoElement.videoWidth || 0;
      const vh = videoElement.videoHeight || 0;
      if (!vw || !vh || !rect?.w || !rect?.h) return null;
      const source = clampRect(rect, vw, vh);
      const scale = Math.min(1, maxWidth / source.w);
      const dw = Math.max(1, Math.round(source.w * scale));
      const dh = Math.max(1, Math.round(source.h * scale));
      const item = getCanvas(name, dw, dh);
      if (!item.ctx) return null;
      item.ctx.drawImage(videoElement, source.x, source.y, source.w, source.h, 0, 0, dw, dh);
      return { name, source: item.canvas };
    };

    return {
      targets() {
        const visible = getVisibleVideoRect(videoElement);
        const targets = [];
        if (visible) {
          const barcodeBand = {
            x: visible.x + visible.w * 0.04,
            y: visible.y + visible.h * 0.18,
            w: visible.w * 0.92,
            h: visible.h * 0.64
          };
          const barcodeTight = {
            x: visible.x + visible.w * 0.08,
            y: visible.y + visible.h * 0.28,
            w: visible.w * 0.84,
            h: visible.h * 0.48
          };
          [drawCrop('visible-crop', visible), drawCrop('barcode-band', barcodeBand), drawCrop('barcode-tight', barcodeTight)]
            .forEach((target) => { if (target) targets.push(target); });
        }
        targets.push({ name: 'video-full', source: videoElement });
        return targets;
      }
    };
  }

  function hammingDistance(a, b) {
    let distance = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i += 1) if (a[i] !== b[i]) distance += 1;
    return distance + Math.abs(a.length - b.length);
  }

  function matchEanPattern(bits, patterns) {
    let best = { digit: -1, distance: Infinity };
    patterns.forEach((pattern, digit) => {
      const distance = hammingDistance(bits, pattern);
      if (distance < best.distance) best = { digit, distance };
    });
    return best;
  }

  function isValidEan13(value) {
    if (!/^\d{13}$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i += 1) {
      const digit = Number(value[i]);
      sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === Number(value[12]);
  }

  function decodeEan13Bits(bits) {
    if (!bits || bits.length !== 95) return null;
    const startGuard = hammingDistance(bits.slice(0, 3), '101');
    const middleGuard = hammingDistance(bits.slice(45, 50), '01010');
    const endGuard = hammingDistance(bits.slice(92, 95), '101');
    if (startGuard + middleGuard + endGuard > 2) return null;

    const digits = [];
    let parity = '';
    let score = startGuard + middleGuard + endGuard;

    for (let i = 0; i < 6; i += 1) {
      const chunk = bits.slice(3 + i * 7, 10 + i * 7);
      const odd = matchEanPattern(chunk, EAN13_LEFT_ODD);
      const even = matchEanPattern(chunk, EAN13_LEFT_EVEN);
      const match = odd.distance <= even.distance ? odd : even;
      const side = odd.distance <= even.distance ? 'L' : 'G';
      if (match.distance > 2) return null;
      digits.push(String(match.digit));
      parity += side;
      score += match.distance;
    }

    const prefix = EAN13_PARITY_PREFIX[parity];
    if (!prefix) return null;

    for (let i = 0; i < 6; i += 1) {
      const chunk = bits.slice(50 + i * 7, 57 + i * 7);
      const match = matchEanPattern(chunk, EAN13_RIGHT);
      if (match.distance > 2) return null;
      digits.push(String(match.digit));
      score += match.distance;
    }

    if (score > 12) return null;
    const value = prefix + digits.join('');
    return isValidEan13(value) ? { value, score } : null;
  }

  function binaryFromImageRow(imageData, width, height, y, bandHeight = 5) {
    const y0 = Math.max(0, Math.min(height - 1, Math.round(y - bandHeight / 2)));
    const y1 = Math.max(y0 + 1, Math.min(height, y0 + bandHeight));
    const values = new Array(width);

    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let row = y0; row < y1; row += 1) {
        const idx = (row * width + x) * 4;
        sum += imageData[idx] * 0.299 + imageData[idx + 1] * 0.587 + imageData[idx + 2] * 0.114;
      }
      values[x] = sum / (y1 - y0);
    }

    const sorted = values.slice().sort((a, b) => a - b);
    const dark = sorted[Math.floor(sorted.length * 0.12)];
    const light = sorted[Math.floor(sorted.length * 0.88)];
    if (!Number.isFinite(dark) || !Number.isFinite(light) || light - dark < 24) return null;
    const threshold = dark + (light - dark) * 0.52;
    return values.map((value) => value < threshold ? 1 : 0);
  }

  function runsFromBinary(binary) {
    const runs = [];
    let value = binary[0];
    let start = 0;
    for (let i = 1; i <= binary.length; i += 1) {
      if (i === binary.length || binary[i] !== value) {
        runs.push({ value, start, end: i, len: i - start });
        value = binary[i];
        start = i;
      }
    }
    return runs;
  }

  function tryDecodeEan13FromBinary(binary) {
    const runs = runsFromBinary(binary);
    let best = null;
    for (let i = 0; i < runs.length - 2; i += 1) {
      const a = runs[i];
      const b = runs[i + 1];
      const c = runs[i + 2];
      if (a.value !== 1 || b.value !== 0 || c.value !== 1) continue;
      const moduleGuess = (a.len + b.len + c.len) / 3;
      if (moduleGuess < 1.4 || moduleGuess > 18) continue;

      for (let scale = 0.78; scale <= 1.28; scale += 0.05) {
        const moduleWidth = moduleGuess * scale;
        if (a.start + moduleWidth * 95 >= binary.length) continue;
        for (let shift = -0.35; shift <= 0.35; shift += 0.18) {
          const start = a.start + shift * moduleWidth;
          let bits = '';
          let ok = true;
          for (let bit = 0; bit < 95; bit += 1) {
            const x = Math.round(start + (bit + 0.5) * moduleWidth);
            if (x < 0 || x >= binary.length) {
              ok = false;
              break;
            }
            bits += binary[x] ? '1' : '0';
          }
          if (!ok) continue;
          const decoded = decodeEan13Bits(bits);
          if (decoded && (!best || decoded.score < best.score)) {
            best = { ...decoded, moduleWidth };
          }
        }
      }
    }
    return best;
  }

  function drawSourceToFallbackCanvas(source) {
    const width = Number(source.videoWidth || source.width || source.clientWidth || 0);
    const height = Number(source.videoHeight || source.height || source.clientHeight || 0);
    if (!width || !height) return null;
    if (!barcodeFallbackCanvas) barcodeFallbackCanvas = document.createElement('canvas');
    if (barcodeFallbackCanvas.width !== width) barcodeFallbackCanvas.width = width;
    if (barcodeFallbackCanvas.height !== height) barcodeFallbackCanvas.height = height;
    const ctx = barcodeFallbackCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    return { canvas: barcodeFallbackCanvas, ctx, width, height };
  }

  function decodeEan13FromImageSource(source) {
    const frame = drawSourceToFallbackCanvas(source);
    if (!frame) return null;
    let image;
    try {
      image = frame.ctx.getImageData(0, 0, frame.width, frame.height);
    } catch (e) {
      return { error: e?.message || String(e) };
    }

    const rowFractions = [0.24, 0.30, 0.36, 0.42, 0.48, 0.54, 0.60, 0.66, 0.72];
    let best = null;
    for (const fraction of rowFractions) {
      const binary = binaryFromImageRow(image.data, frame.width, frame.height, frame.height * fraction);
      if (!binary) continue;
      const decoded = tryDecodeEan13FromBinary(binary);
      if (decoded && (!best || decoded.score < best.score)) {
        best = { ...decoded, row: fraction };
      }
    }
    return best;
  }

  function loadBarcodeScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-heys-barcode-src="${src}"]`);
      if (existing?.dataset.loaded === 'true') return resolve();
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.heysBarcodeSrc = src;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensureBarcodeDetectorAvailable({ allowPolyfill = true, forcePolyfill = false } = {}) {
    try {
      if (!forcePolyfill && !shouldPreferBarcodePolyfill() && 'BarcodeDetector' in window && typeof BarcodeDetector.getSupportedFormats === 'function') {
        await BarcodeDetector.getSupportedFormats();
        return true;
      }
    } catch (nativeError) {
      console.warn('[Barcode] native BarcodeDetector check failed', nativeError?.message || nativeError);
    }

    if (!allowPolyfill || !canLoadBarcodePolyfill()) return false;
    if (!barcodePolyfillPromise) {
      barcodePolyfillPromise = (async () => {
        await loadBarcodeScript(`${BARCODE_POLYFILL_BASE}zbar-wasm.js`);
        await loadBarcodeScript(`${BARCODE_POLYFILL_BASE}barcode-detector-polyfill.js`);
        const Polyfill = getBarcodePolyfillGlobal()?.BarcodeDetectorPolyfill;
        if (!Polyfill) throw new Error('BarcodeDetectorPolyfill not exposed');
        window.barcodeDetectorPolyfill = getBarcodePolyfillGlobal();
        window.BarcodeDetector = Polyfill;
        console.log('[Barcode] ✅ BarcodeDetector polyfill loaded');
        return true;
      })().catch((error) => {
        barcodePolyfillPromise = null;
        console.warn('[Barcode] polyfill load failed', error?.message || error);
        return false;
      });
    }
    return barcodePolyfillPromise;
  }

  async function initBarcodeDetector(options = {}) {
    if (!(await ensureBarcodeDetectorAvailable(options))) {
      console.log('[Barcode] BarcodeDetector API/polyfill not available');
      return null;
    }

    try {
      // Получаем поддерживаемые форматы
      let formats = await BarcodeDetector.getSupportedFormats();
      console.log('[Barcode] Supported formats:', formats);

      // Создаём детектор для типичных продуктовых штрих-кодов
      let productFormats = formats.filter(f => PRODUCT_BARCODE_FORMATS.includes(f));

      if (productFormats.length === 0 && options.allowPolyfill !== false) {
        console.log('[Barcode] Native detector has no product formats, trying polyfill');
        if (await ensureBarcodeDetectorAvailable({ allowPolyfill: true, forcePolyfill: true })) {
          formats = await BarcodeDetector.getSupportedFormats();
          console.log('[Barcode] Polyfill supported formats:', formats);
          productFormats = formats.filter(f => PRODUCT_BARCODE_FORMATS.includes(f));
        }
      }

      if (productFormats.length === 0) {
        console.log('[Barcode] No product barcode formats supported');
        return null;
      }

      barcodeDetector = new BarcodeDetector({ formats: productFormats });
      barcodeDetectorFormats = productFormats;
      console.log('[Barcode] ✅ Detector initialized with formats:', productFormats);
      return barcodeDetector;
    } catch (e) {
      console.error('[Barcode] Error initializing:', e);
      return null;
    }
  }

  // Сканирование из изображения
  async function scanBarcodeFromImage(imageSource) {
    if (!barcodeDetector) {
      await initBarcodeDetector();
    }

    if (!barcodeDetector) {
      return { success: false, error: 'BarcodeDetector not available' };
    }

    try {
      const barcodes = await barcodeDetector.detect(imageSource);

      if (barcodes.length > 0) {
        const barcode = barcodes[0];
        console.log('[Barcode] 📦 Detected:', barcode.rawValue, barcode.format);

        // Вибрация при успешном сканировании
        if (window.HEYS?.haptic) {
          HEYS.haptic.medium();
        }

        return {
          success: true,
          value: barcode.rawValue,
          format: barcode.format,
          bounds: barcode.boundingBox
        };
      }

      return { success: false, error: 'No barcode found' };
    } catch (e) {
      console.error('[Barcode] Scan error:', e);
      return { success: false, error: e.message };
    }
  }

  // Сканирование в реальном времени из видеопотока
  async function startBarcodeScanning(videoElement, onDetected) {
    if (!barcodeDetector) {
      await initBarcodeDetector();
    }

    if (!barcodeDetector) {
      return { success: false, error: 'BarcodeDetector not available' };
    }

    let scanning = true;
    let lastDetectedCode = null;
    let lastDetectedTime = 0;
    let lastScanFrameTime = 0;
    const sampler = createBarcodeFrameSampler(videoElement);
    barcodeScanStats = {
      frames: 0,
      attempts: 0,
      fallbackAttempts: 0,
      fallbackDetections: 0,
      detections: 0,
      errors: 0,
      lastError: null,
      lastTarget: null,
      lastFallbackTarget: null,
      lastNoHitAt: null
    };

    const scanFrame = async () => {
      if (!scanning || videoElement.paused || videoElement.ended) return;

      try {
        const nowFrame = Date.now();
        if (nowFrame - lastScanFrameTime < 140) {
          requestAnimationFrame(scanFrame);
          return;
        }
        lastScanFrameTime = nowFrame;
        barcodeScanStats.frames += 1;

        let barcodes = [];
        let targetName = null;
        const targets = sampler.targets();
        for (const target of targets) {
          try {
            barcodeScanStats.attempts += 1;
            const found = await barcodeDetector.detect(target.source);
            if (found.length > 0) {
              barcodes = found;
              targetName = target.name;
              break;
            }
            if (target.name !== 'video-full') {
              barcodeScanStats.fallbackAttempts += 1;
              const fallback = decodeEan13FromImageSource(target.source);
              if (fallback?.value) {
                barcodes = [{
                  rawValue: fallback.value,
                  format: 'ean_13',
                  boundingBox: null,
                  cornerPoints: null
                }];
                targetName = `${target.name}:ean13-fallback`;
                barcodeScanStats.fallbackDetections += 1;
                barcodeScanStats.lastFallbackTarget = targetName;
                break;
              }
              if (fallback?.error) barcodeScanStats.lastError = fallback.error;
            }
          } catch (targetError) {
            barcodeScanStats.errors += 1;
            barcodeScanStats.lastError = targetError?.message || String(targetError);
          }
        }

        if (barcodes.length > 0) {
          const barcode = barcodes[0];
          const now = Date.now();
          barcodeScanStats.detections += 1;
          barcodeScanStats.lastTarget = targetName || 'unknown';

          // Debounce — не срабатываем на один и тот же код чаще чем раз в 2 секунды
          if (barcode.rawValue !== lastDetectedCode || (now - lastDetectedTime) > 2000) {
            lastDetectedCode = barcode.rawValue;
            lastDetectedTime = now;

            console.log('[Barcode] 📦 Scanned:', barcode.rawValue);

            if (window.HEYS?.haptic) {
              HEYS.haptic.medium();
            }

            onDetected?.({
              value: barcode.rawValue,
              format: barcode.format,
              bounds: barcode.boundingBox
            });
          }
        } else {
          barcodeScanStats.lastNoHitAt = new Date().toISOString();
        }
      } catch (e) {
        barcodeScanStats.errors += 1;
        barcodeScanStats.lastError = e?.message || String(e);
      }

      if (scanning) {
        requestAnimationFrame(scanFrame);
      }
    };

    requestAnimationFrame(scanFrame);

    return {
      success: true,
      stop: () => { scanning = false; }
    };
  }

  // Проверяем native-поддержку при старте без загрузки WASM. Polyfill грузится
  // только по явному запуску сканера.
  initBarcodeDetector({ allowPolyfill: false });

  // Экспортируем
  HEYS.barcode = {
    isSupported: () => 'BarcodeDetector' in window || canLoadBarcodePolyfill(),
    getDebugState: getBarcodeDebugState,
    scanImage: scanBarcodeFromImage,
    startScanning: startBarcodeScanning
  };

  // === Web Share API (исходящий) ===
  // Поделиться прогрессом, рецептами, результатами
  async function shareContent(data) {
    if (!navigator.share) {
      console.log('[Share] Web Share API not supported');
      // Fallback на clipboard
      if (navigator.clipboard && data.text) {
        await navigator.clipboard.writeText(data.text);
        HEYS.Toast?.success?.('Скопировано в буфер!');
        return { success: true, method: 'clipboard' };
      }
      return { success: false, error: 'Share not supported' };
    }

    try {
      await navigator.share(data);
      console.log('[Share] ✅ Shared successfully');

      if (window.HEYS?.haptic) {
        HEYS.haptic.light();
      }

      return { success: true, method: 'native' };
    } catch (e) {
      if (e.name === 'AbortError') {
        // Пользователь отменил — это нормально
        return { success: false, error: 'cancelled' };
      }
      console.error('[Share] Error:', e);
      return { success: false, error: e.message };
    }
  }

  // Проверяем возможность шаринга файлов
  function canShareFiles() {
    return navigator.canShare && navigator.canShare({ files: [new File([''], 'test.txt')] });
  }

  // Экспортируем
  HEYS.share = {
    isSupported: () => !!navigator.share,
    canShareFiles: canShareFiles,
    share: shareContent,

    // Удобные методы для типичных сценариев
    async shareProgress(stats) {
      const text = `🎯 Мой прогресс в HEYS:\n` +
        `📊 ${stats.streak || 0} дней подряд в норме\n` +
        `🔥 ${stats.kcal || 0} ккал сегодня\n` +
        `💧 ${stats.water || 0} мл воды\n\n` +
        `Попробуй HEYS: https://app.heyslab.ru`;

      return shareContent({ title: 'Мой прогресс в HEYS', text });
    },

    async shareDay(date, stats) {
      const text = `📅 ${date}\n` +
        `🔥 Калории: ${stats.kcal || 0}/${stats.norm || 0}\n` +
        `🥩 Белок: ${stats.protein || 0}г\n` +
        `💧 Вода: ${stats.water || 0} мл\n` +
        `👟 Шаги: ${stats.steps || 0}`;

      return shareContent({ title: `День ${date}`, text });
    }
  };

  // === Contact Picker API ===
  // Выбор контактов для приглашения друзей
  async function pickContacts(options = {}) {
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
      console.log('[Contacts] Contact Picker API not supported');
      return { success: false, error: 'Not supported' };
    }

    try {
      const properties = options.properties || ['name', 'tel'];
      const opts = { multiple: options.multiple ?? true };

      const contacts = await navigator.contacts.select(properties, opts);

      if (contacts.length > 0) {
        console.log(`[Contacts] ✅ Selected ${contacts.length} contacts`);

        if (window.HEYS?.haptic) {
          HEYS.haptic.light();
        }

        return { success: true, contacts };
      }

      return { success: false, error: 'No contacts selected' };
    } catch (e) {
      if (e.name === 'InvalidStateError') {
        // Уже открыт picker — нормальная ситуация
        return { success: false, error: 'picker_busy' };
      }
      console.error('[Contacts] Error:', e);
      return { success: false, error: e.message };
    }
  }

  // Проверяем какие свойства контактов поддерживаются
  async function getSupportedContactProperties() {
    if (!('contacts' in navigator)) {
      return [];
    }

    try {
      return await navigator.contacts.getProperties();
    } catch (e) {
      return [];
    }
  }

  // Экспортируем
  HEYS.contacts = {
    isSupported: () => 'contacts' in navigator && 'ContactsManager' in window,
    pick: pickContacts,
    getSupportedProperties: getSupportedContactProperties
  };

  // === Speech Recognition API ===
  // Голосовой ввод продуктов
  let speechRecognition = null;

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.log('[Speech] Speech Recognition not supported');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    return recognition;
  }

  // Распознать речь (Promise-based)
  function recognizeSpeech(options = {}) {
    return new Promise((resolve, reject) => {
      const recognition = initSpeechRecognition();

      if (!recognition) {
        reject(new Error('Speech recognition not supported'));
        return;
      }

      let finalTranscript = '';
      let interimCallback = options.onInterim;

      recognition.onresult = (event) => {
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];

          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }

        if (interimCallback && interim) {
          interimCallback(interim);
        }
      };

      recognition.onend = () => {
        if (finalTranscript) {
          console.log('[Speech] ✅ Recognized:', finalTranscript);

          if (window.HEYS?.haptic) {
            HEYS.haptic.light();
          }

          resolve({ success: true, text: finalTranscript.trim() });
        } else {
          resolve({ success: false, error: 'No speech detected' });
        }
      };

      recognition.onerror = (event) => {
        console.error('[Speech] Error:', event.error);
        reject(new Error(event.error));
      };

      try {
        recognition.start();
        console.log('[Speech] 🎤 Listening...');

        if (window.HEYS?.haptic) {
          HEYS.haptic.light();
        }
      } catch (e) {
        reject(e);
      }

      // Таймаут — останавливаем через N секунд
      const timeout = options.timeout || 10000;
      setTimeout(() => {
        try {
          recognition.stop();
        } catch (e) { }
      }, timeout);

      // Возвращаем способ остановить вручную
      speechRecognition = recognition;
    });
  }

  function stopSpeechRecognition() {
    if (speechRecognition) {
      try {
        speechRecognition.stop();
      } catch (e) { }
      speechRecognition = null;
    }
  }

  // Экспортируем
  HEYS.speech = {
    isSupported: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    recognize: recognizeSpeech,
    stop: stopSpeechRecognition
  };

  // === Launch Handler API ===
  // Обработка запуска приложения из разных источников
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer((launchParams) => {
      console.log('[Launch] 🚀 App launched with params:', launchParams);

      // Если запущено с файлами (например, фото еды)
      if (launchParams.files?.length > 0) {
        console.log('[Launch] Files:', launchParams.files.map(f => f.name));

        // Сохраняем файлы для обработки
        window.HEYS_LAUNCH_FILES = launchParams.files;

        // Диспатчим событие для компонентов
        window.dispatchEvent(new CustomEvent('heys:launch-files', {
          detail: { files: launchParams.files }
        }));
      }

      // Если есть целевой URL
      if (launchParams.targetURL) {
        const url = new URL(launchParams.targetURL);
        console.log('[Launch] Target URL:', url.href);

        // Обрабатываем параметры URL
        const action = url.searchParams.get('action');
        const tab = url.searchParams.get('tab');

        if (action) {
          window.dispatchEvent(new CustomEvent('heys:url-action', {
            detail: { action }
          }));
        }

        if (tab) {
          window.dispatchEvent(new CustomEvent('heys:url-tab', {
            detail: { tab }
          }));
        }
      }
    });
    console.log('[Launch] ✅ Launch handler registered');
  }

  // === Protocol Handler ===
  // Регистрируем кастомный протокол web+heys://
  function registerProtocolHandler() {
    if (!navigator.registerProtocolHandler) {
      console.log('[Protocol] Protocol handler not supported');
      return false;
    }

    try {
      navigator.registerProtocolHandler(
        'web+heys',
        '/?protocol=%s',
        'HEYS Nutrition'
      );
      console.log('[Protocol] ✅ Registered web+heys:// protocol');
      return true;
    } catch (e) {
      console.error('[Protocol] Registration error:', e);
      return false;
    }
  }

  // Обработка protocol deep links
  function handleProtocolUrl() {
    const params = new URLSearchParams(window.location.search);
    const protocolUrl = params.get('protocol');

    if (protocolUrl) {
      console.log('[Protocol] Handling:', protocolUrl);

      // Парсим web+heys://action/params
      const match = protocolUrl.match(/^web\+heys:\/\/([^/]+)\/?(.*)$/);

      if (match) {
        const [, action, data] = match;

        window.dispatchEvent(new CustomEvent('heys:protocol-action', {
          detail: { action, data: decodeURIComponent(data) }
        }));

        // Очищаем URL от protocol параметра
        params.delete('protocol');
        const newUrl = params.toString()
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }

  // Вызываем обработку при старте
  handleProtocolUrl();

  // Экспортируем
  HEYS.protocol = {
    register: registerProtocolHandler,
    handleUrl: handleProtocolUrl
  };

  // === File System Access API ===
  // Для экспорта/импорта данных пользователя

  // Сохранить данные в файл
  async function saveToFile(data, filename = 'heys-export.json', type = 'application/json') {
    // Современный File System Access API
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: type === 'application/json' ? 'JSON файл' : 'Текстовый файл',
            accept: { [type]: [filename.split('.').pop() ? `.${filename.split('.').pop()}` : '.json'] }
          }]
        });

        const writable = await handle.createWritable();
        await writable.write(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
        await writable.close();

        console.log('[FileSystem] ✅ Saved to:', handle.name);

        if (window.HEYS?.haptic) {
          HEYS.haptic.success();
        }

        return { success: true, filename: handle.name };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        console.error('[FileSystem] Save error:', e);
      }
    }

    // Fallback: download link
    const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[FileSystem] 📥 Downloaded:', filename);
    return { success: true, filename, fallback: true };
  }

  // Открыть и прочитать файл
  async function openFile(accept = ['.json']) {
    // Современный File System Access API
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Файлы данных',
            accept: { 'application/*': accept }
          }],
          multiple: false
        });

        const file = await handle.getFile();
        const content = await file.text();

        console.log('[FileSystem] ✅ Opened:', file.name);

        return {
          success: true,
          filename: file.name,
          content,
          data: accept.includes('.json') ? JSON.parse(content) : content
        };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        console.error('[FileSystem] Open error:', e);
      }
    }

    // Fallback: input file
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept.join(',');

      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) {
          resolve({ success: false, cancelled: true });
          return;
        }

        const content = await file.text();
        resolve({
          success: true,
          filename: file.name,
          content,
          data: accept.includes('.json') ? JSON.parse(content) : content,
          fallback: true
        });
      };

      input.oncancel = () => resolve({ success: false, cancelled: true });
      input.click();
    });
  }

  // Экспорт всех данных пользователя
  async function exportUserData() {
    const data = {
      exportDate: new Date().toISOString(),
      appVersion: getAppVersion(),
      profile: HEYS.utils?.lsGet?.('heys_profile') || {},
      norms: HEYS.utils?.lsGet?.('heys_norms') || {},
      products: HEYS.products?.getAll?.() || [],
      // Последние 90 дней данных
      days: []
    };

    // Собираем данные за 90 дней
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = HEYS.utils?.lsGet?.(`heys_dayv2_${dateStr}`);
      if (dayData) {
        data.days.push({ date: dateStr, ...dayData });
      }
    }

    const filename = `heys-export-${today.toISOString().split('T')[0]}.json`;
    return saveToFile(data, filename);
  }

  // Импорт данных пользователя
  async function importUserData() {
    const result = await openFile(['.json']);

    if (!result.success || result.cancelled) {
      return result;
    }

    const data = result.data;

    // Валидация
    if (!data.appVersion || !data.exportDate) {
      return { success: false, error: 'Invalid export file' };
    }

    // Импортируем данные
    let imported = { profile: false, norms: false, products: 0, days: 0 };

    if (data.profile && HEYS.utils?.lsSet) {
      HEYS.utils.lsSet('heys_profile', data.profile);
      imported.profile = true;
      try {
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
          detail: { source: 'platform-apis-import' }
        }));
      } catch (_) {}
    }

    if (data.norms && HEYS.utils?.lsSet) {
      HEYS.utils.lsSet('heys_norms', data.norms);
      imported.norms = true;
      try {
        window.dispatchEvent(new CustomEvent('heys:norms-updated', {
          detail: { source: 'platform-apis-import' }
        }));
      } catch (_) {}
    }

    if (data.products?.length && HEYS.products?.setAll) {
      const existing = HEYS.products.getAll() || [];
      const merged = [...existing];

      for (const product of data.products) {
        if (!merged.find(p => p.id === product.id)) {
          merged.push(product);
          imported.products++;
        }
      }

      HEYS.products.setAll(merged, { source: 'import-user-data' });
    }

    if (data.days?.length && HEYS.utils?.lsSet) {
      for (const day of data.days) {
        const key = `heys_dayv2_${day.date}`;
        const existing = HEYS.utils.lsGet(key);

        // Не перезаписываем существующие данные
        if (!existing) {
          HEYS.utils.lsSet(key, day);
          imported.days++;
        }
      }
    }

    console.log('[FileSystem] ✅ Imported:', imported);

    if (window.HEYS?.haptic) {
      HEYS.haptic.success();
    }

    return { success: true, imported, fromFile: result.filename };
  }

  HEYS.fileSystem = {
    isSupported: () => 'showSaveFilePicker' in window,
    saveToFile,
    openFile,
    exportUserData,
    importUserData
  };

  // === Credential Management API ===
  // Безопасное хранение учётных данных

  async function saveCredentials(phone, pin, name = 'HEYS Nutrition') {
    if (!('credentials' in navigator) || !window.PasswordCredential) {
      console.log('[Credentials] API not supported');
      return { success: false, reason: 'not_supported' };
    }

    try {
      const credential = new PasswordCredential({
        id: phone,
        password: pin,
        name: name
      });

      await navigator.credentials.store(credential);
      console.log('[Credentials] ✅ Saved credentials');
      return { success: true };
    } catch (e) {
      console.error('[Credentials] Save error:', e);
      return { success: false, error: e.message };
    }
  }

  async function getCredentials() {
    if (!('credentials' in navigator)) {
      return { success: false, reason: 'not_supported' };
    }

    try {
      const credential = await navigator.credentials.get({
        password: true,
        mediation: 'optional'
      });

      if (credential) {
        console.log('[Credentials] ✅ Retrieved credentials for:', credential.id);
        return {
          success: true,
          phone: credential.id,
          pin: credential.password,
          name: credential.name
        };
      }

      return { success: false, reason: 'no_credentials' };
    } catch (e) {
      console.error('[Credentials] Get error:', e);
      return { success: false, error: e.message };
    }
  }

  async function clearCredentials() {
    if (!('credentials' in navigator)) {
      return { success: false, reason: 'not_supported' };
    }

    try {
      await navigator.credentials.preventSilentAccess();
      console.log('[Credentials] ✅ Cleared silent access');
      return { success: true };
    } catch (e) {
      console.error('[Credentials] Clear error:', e);
      return { success: false, error: e.message };
    }
  }

  HEYS.credentials = {
    isSupported: () => 'credentials' in navigator && !!window.PasswordCredential,
    save: saveCredentials,
    get: getCredentials,
    clear: clearCredentials
  };

  // === Screen Orientation API ===
  // Управление ориентацией экрана

  async function lockOrientation(orientation = 'portrait') {
    if (!screen.orientation?.lock) {
      console.log('[Orientation] Lock not supported');
      return { success: false, reason: 'not_supported' };
    }

    try {
      await screen.orientation.lock(orientation);
      console.log('[Orientation] ✅ Locked to:', orientation);
      return { success: true, orientation };
    } catch (e) {
      console.error('[Orientation] Lock error:', e);
      return { success: false, error: e.message };
    }
  }

  function unlockOrientation() {
    if (!screen.orientation?.unlock) {
      return { success: false, reason: 'not_supported' };
    }

    screen.orientation.unlock();
    console.log('[Orientation] ✅ Unlocked');
    return { success: true };
  }

  HEYS.orientation = {
    isSupported: () => !!screen.orientation?.lock,
    lock: lockOrientation,
    unlock: unlockOrientation,
    get current() { return screen.orientation?.type || 'unknown'; },
    get angle() { return screen.orientation?.angle || 0; },
    onChange: (callback) => {
      screen.orientation?.addEventListener('change', callback);
      return () => screen.orientation?.removeEventListener('change', callback);
    }
  };

  // === Fullscreen API ===
  // Управление полноэкранным режимом

  async function enterFullscreen(element = document.documentElement) {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        await element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        await element.msRequestFullscreen();
      } else {
        return { success: false, reason: 'not_supported' };
      }

      console.log('[Fullscreen] ✅ Entered fullscreen');

      if (window.HEYS?.haptic) {
        HEYS.haptic.light();
      }

      return { success: true };
    } catch (e) {
      console.error('[Fullscreen] Enter error:', e);
      return { success: false, error: e.message };
    }
  }

  async function exitFullscreen() {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      } else {
        return { success: false, reason: 'not_supported' };
      }

      console.log('[Fullscreen] ✅ Exited fullscreen');
      return { success: true };
    } catch (e) {
      console.error('[Fullscreen] Exit error:', e);
      return { success: false, error: e.message };
    }
  }

  function isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
  }

  HEYS.fullscreen = {
    isSupported: () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
    enter: enterFullscreen,
    exit: exitFullscreen,
    toggle: async (element) => isFullscreen() ? exitFullscreen() : enterFullscreen(element),
    get isActive() { return isFullscreen(); },
    onChange: (callback) => {
      const events = ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'];
      events.forEach(e => document.addEventListener(e, callback));
      return () => events.forEach(e => document.removeEventListener(e, callback));
    }
  };

  // === Vibration Pattern API ===
  // Расширенные паттерны вибрации

  const VIBRATION_PATTERNS = {
    success: [50, 30, 50],           // Короткий двойной
    error: [100, 50, 100, 50, 100],  // Тройной
    warning: [200, 100, 200],        // Двойной длинный
    notification: [50, 100, 50, 100, 50], // Быстрая серия
    heartbeat: [100, 200, 100, 400], // Как сердцебиение
    sos: [100, 50, 100, 50, 100, 200, 300, 50, 300, 50, 300, 200, 100, 50, 100, 50, 100], // SOS
    countdown: [100, 800, 100, 800, 100, 800, 500], // Обратный отсчёт
    levelUp: [50, 50, 50, 50, 50, 50, 200] // Нарастающий
  };

  function vibratePattern(pattern) {
    if (!navigator.vibrate) {
      return false;
    }

    const p = typeof pattern === 'string' ? VIBRATION_PATTERNS[pattern] : pattern;

    if (!p) {
      console.warn('[Vibration] Unknown pattern:', pattern);
      return false;
    }

    navigator.vibrate(p);
    return true;
  }

  HEYS.vibration = {
    isSupported: () => 'vibrate' in navigator,
    patterns: VIBRATION_PATTERNS,
    play: vibratePattern,
    stop: () => navigator.vibrate?.(0),
    // Удобные методы
    success: () => vibratePattern('success'),
    error: () => vibratePattern('error'),
    warning: () => vibratePattern('warning'),
    notification: () => vibratePattern('notification'),
    heartbeat: () => vibratePattern('heartbeat'),
    levelUp: () => vibratePattern('levelUp')
  };

  // === Web Animations API utilities ===
  // Утилиты для анимаций

  function animateElement(element, keyframes, options = {}) {
    if (!element?.animate) {
      return null;
    }

    const defaultOptions = {
      duration: 300,
      easing: 'ease-out',
      fill: 'forwards'
    };

    return element.animate(keyframes, { ...defaultOptions, ...options });
  }

  // Готовые анимации
  const ANIMATIONS = {
    fadeIn: [
      { opacity: 0 },
      { opacity: 1 }
    ],
    fadeOut: [
      { opacity: 1 },
      { opacity: 0 }
    ],
    slideUp: [
      { transform: 'translateY(100%)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 }
    ],
    slideDown: [
      { transform: 'translateY(-100%)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 }
    ],
    scaleIn: [
      { transform: 'scale(0.8)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 }
    ],
    scaleOut: [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(0.8)', opacity: 0 }
    ],
    shake: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-10px)' },
      { transform: 'translateX(10px)' },
      { transform: 'translateX(-10px)' },
      { transform: 'translateX(10px)' },
      { transform: 'translateX(0)' }
    ],
    pulse: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1)' }
    ],
    bounce: [
      { transform: 'translateY(0)' },
      { transform: 'translateY(-20px)' },
      { transform: 'translateY(0)' },
      { transform: 'translateY(-10px)' },
      { transform: 'translateY(0)' }
    ],
    spin: [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(360deg)' }
    ],
    confetti: [
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { transform: 'translateY(-200px) rotate(720deg)', opacity: 0 }
    ]
  };

  HEYS.animate = {
    isSupported: () => !!document.documentElement.animate,
    element: animateElement,
    presets: ANIMATIONS,
    fadeIn: (el, opts) => animateElement(el, ANIMATIONS.fadeIn, opts),
    fadeOut: (el, opts) => animateElement(el, ANIMATIONS.fadeOut, opts),
    slideUp: (el, opts) => animateElement(el, ANIMATIONS.slideUp, opts),
    slideDown: (el, opts) => animateElement(el, ANIMATIONS.slideDown, opts),
    scaleIn: (el, opts) => animateElement(el, ANIMATIONS.scaleIn, opts),
    scaleOut: (el, opts) => animateElement(el, ANIMATIONS.scaleOut, opts),
    shake: (el, opts = { duration: 500 }) => animateElement(el, ANIMATIONS.shake, opts),
    pulse: (el, opts = { duration: 400, iterations: 2 }) => animateElement(el, ANIMATIONS.pulse, opts),
    bounce: (el, opts = { duration: 600 }) => animateElement(el, ANIMATIONS.bounce, opts),
    spin: (el, opts = { duration: 500 }) => animateElement(el, ANIMATIONS.spin, opts)
  };

  // ============================================================================
  // MODULE EXPORTS
  // ============================================================================

  // Экспортируем все Platform APIs в namespace
  HEYS.PlatformAPIs = {
    // Service Worker
    registerServiceWorker: registerServiceWorker,
    triggerSkipWaiting: triggerSkipWaiting,
    forceUpdateAndReload: forceUpdateAndReload,

    // Update helpers
    getAppVersion: getAppVersion,
    isNewerVersion: isNewerVersion,
    isUpdateLocked: isUpdateLocked,
    setUpdateLock: setUpdateLock,
    clearUpdateLock: clearUpdateLock,
    getSwUpdateState: getSwUpdateState,
    getSwUpdateStateLog: getSwUpdateStateLog,
    showUpdateBadge: showUpdateBadge,
    hideUpdateBadge: hideUpdateBadge,
    showUpdateModal: showUpdateModal,
    updateModalStage: updateModalStage,
    hideUpdateModal: hideUpdateModal,
    showManualRefreshPrompt: showManualRefreshPrompt,
    installUpdate: installUpdate,
    getNetworkQuality: getNetworkQuality,
    smartVersionCheck: smartVersionCheck,
    checkServerVersion: checkServerVersion,
    getUpdateState: () => ({ available: _updateAvailable, version: _updateVersion }),

    // Storage
    storage: {
      requestPersistent: requestPersistentStorage,
      getEstimate: getStorageEstimate
    },

    // Уже экспортированные API доступны через HEYS.*
    // (device, idle, barcode, share, contacts, speech, etc.)
  };

  // Performance tracking end
  HEYS.modulePerf?.endLoad('platform_apis', true);

  // Backward compatibility globals
  window.isUpdateLocked = window.isUpdateLocked || isUpdateLocked;
  window.setUpdateLock = window.setUpdateLock || setUpdateLock;
  window.clearUpdateLock = window.clearUpdateLock || clearUpdateLock;
  window.showUpdateBadge = window.showUpdateBadge || showUpdateBadge;
  window.hideUpdateModal = window.hideUpdateModal || hideUpdateModal;
  window.showUpdateModal = window.showUpdateModal || showUpdateModal;
  window.updateModalStage = window.updateModalStage || updateModalStage;
  window.getNetworkQuality = window.getNetworkQuality || getNetworkQuality;
  window.showManualRefreshPrompt = window.showManualRefreshPrompt || showManualRefreshPrompt;
  window.checkServerVersion = window.checkServerVersion || checkServerVersion;

  // 🚀 Auto-register Service Worker on module load
  // This was previously called from runVersionGuard() in heys_app_v12.js
  registerServiceWorker();

  if (HEYS.featureFlags?.isEnabled('dev_module_logging')) {
    console.log('[PlatformAPIs] ✅ Module loaded successfully');
  }
})();
