// heys_fingers_fullscreen_v1.js — Portal orchestrator для fingers fullscreen overlay.
// Wave 3 step 3b. Управляет mount/unmount React portal к document.body,
// body scroll lock, wake lock, history.pushState routing, swipe-back prevention,
// close button с ConfirmModal на active session.
//
// Зависимости (все optional):
//   HEYS.Fingers.SessionUI({ dateKey, trainingIndex, onClose })
//   HEYS.Fingers.Onboarding({ onComplete, onSkip })
//   HEYS.Fingers.isOnboarded()
//   HEYS.Fingers.persistence.load() / detectOnBoot()
//   HEYS.AppHooks.useWakeLock (heys_app_hooks_v1.js:2526)
//   HEYS.ConfirmModal.show()
//   HEYS.utils.lsGet (для theme)
//
// Public API:
//   HEYS.Fingers.Fullscreen.mount({ dateKey, trainingIndex, mode })
//   HEYS.Fingers.Fullscreen.unmount()

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.Fullscreen__registered) return;
  Fingers.Fullscreen__registered = true;

  const React = global.React;
  const ReactDOM = global.ReactDOM;
  if (!React || !ReactDOM) {
    console.warn('[Fingers.Fullscreen] React/ReactDOM not loaded');
    return;
  }
  const h = React.createElement;
  const { useState, useEffect, useRef, useCallback } = React;

  const ROOT_ID = 'fingers-fullscreen-root';
  let activeRoot = null;
  let savedScrollY = 0;
  let touchStartXHandler = null;

  function getOrCreateHost() {
    let el = document.getElementById(ROOT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ROOT_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function applyTheme() {
    try {
      const u = HEYS.utils;
      const profile = (u && u.lsGet) ? u.lsGet('heys_profile', {}) : {};
      const themeId = profile?.fingerboardProfile?.themeId || 'A';
      document.documentElement.setAttribute('data-fingers-theme', themeId);
    } catch (_) {
      document.documentElement.setAttribute('data-fingers-theme', 'A');
    }
  }

  function clearTheme() {
    document.documentElement.removeAttribute('data-fingers-theme');
    document.documentElement.removeAttribute('data-fingers-fullscreen');
  }

  function lockBodyScroll() {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + savedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, savedScrollY);
  }

  function installSwipeBackGuard() {
    // Prevent accidental iOS PWA swipe-back on active timer screens.
    // We don't have direct state access, so we guard only on left 20px edge —
    // user can still swipe from middle. Active-timer screens should set a flag.
    touchStartXHandler = function (e) {
      try {
        if (!e.touches || !e.touches[0]) return;
        const x = e.touches[0].clientX;
        // Only block if there's an active timer (Fingers.activeTimerLock flag set by timer)
        if (x <= 20 && Fingers.activeTimerLock) {
          e.preventDefault();
        }
      } catch (_) { /* noop */ }
    };
    document.addEventListener('touchstart', touchStartXHandler, { passive: false });
  }

  function uninstallSwipeBackGuard() {
    if (touchStartXHandler) {
      document.removeEventListener('touchstart', touchStartXHandler);
      touchStartXHandler = null;
    }
  }

  // --- Inner Fullscreen Component ---
  function FullscreenOverlay({ dateKey, trainingIndex, mode, onRequestClose }) {
    // Decide route: onboarding (if not completed) vs SessionUI
    const onboarded = (typeof Fingers.isOnboarded === 'function')
      ? Fingers.isOnboarded()
      : true;
    const [showOnboarding, setShowOnboarding] = useState(!onboarded);

    // Wake lock — request on mount of active session screens (timer will manage finer-grained)
    const wakeLockHook = HEYS.AppHooks?.useWakeLock;
    const wl = typeof wakeLockHook === 'function' ? wakeLockHook() : null;
    useEffect(function () {
      try { wl?.request?.(); } catch (_) { /* noop */ }
      return function () { try { wl?.release?.(); } catch (_) { /* noop */ } };
    }, []);

    // Escape close
    useEffect(function () {
      const onKey = function (e) {
        if (e.key === 'Escape') onRequestClose();
      };
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [onRequestClose]);

    const handleOnboardingComplete = useCallback(function () {
      setShowOnboarding(false);
    }, []);

    return h('div', {
      className: 'fingers-fs',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Тренировка пальцев'
    },
      // Close button (always top-right)
      h('button', {
        className: 'fingers-fs__close',
        onClick: onRequestClose,
        'aria-label': 'Закрыть режим тренировки'
      },
        h('svg', { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.5 },
          h('path', { d: 'M5 5l10 10M15 5L5 15' })
        )
      ),

      // Container
      h('div', { className: 'fingers-fs__container' },
        showOnboarding && Fingers.Onboarding
          ? h(Fingers.Onboarding, {
              onComplete: handleOnboardingComplete,
              onSkip: handleOnboardingComplete
            })
          : Fingers.SessionUI
            ? h(Fingers.SessionUI, {
                dateKey: dateKey,
                trainingIndex: trainingIndex,
                onClose: onRequestClose
              })
            : h('div', { style: { padding: 32, textAlign: 'center' } },
                h('p', null, 'Модуль ещё не загружен (SessionUI или Onboarding).'),
                h('button', { onClick: onRequestClose,
                  style: { marginTop: 16, padding: '12px 24px' } }, 'Закрыть'))
      )
    );
  }

  // --- Public API ---
  const Fullscreen = {
    mount: function mount(opts) {
      const o = opts || {};
      if (activeRoot) {
        console.warn('[Fingers.Fullscreen] already mounted — ignoring');
        return;
      }

      applyTheme();
      lockBodyScroll();
      installSwipeBackGuard();
      document.documentElement.setAttribute('data-fingers-fullscreen', 'true');

      // History entry — allows browser back/swipe to act as close
      try {
        window.history.pushState({ fingers: true, ts: Date.now() }, '', window.location.pathname + '#fingers');
      } catch (_) { /* noop */ }

      const onPopState = function (e) {
        // Browser back triggered → unmount (but don't pushState again)
        Fullscreen.unmount({ skipHistoryPop: true });
      };
      window.addEventListener('popstate', onPopState);

      const host = getOrCreateHost();
      const root = ReactDOM.createRoot
        ? ReactDOM.createRoot(host)
        : null; // React 17 fallback handled below

      const requestClose = function () {
        // Confirm if active session in progress
        const hasActiveSession = (function () {
          try {
            const snap = Fingers.persistence?.load?.();
            if (!snap || snap.stale) return false;
            const s = snap.snapshot || snap;
            return s && s.state && s.state !== 'IDLE' && s.state !== 'DONE';
          } catch (_) { return false; }
        })();

        if (hasActiveSession && HEYS.ConfirmModal?.show) {
          HEYS.ConfirmModal.show({
            icon: '⚠',
            title: 'Прервать тренировку?',
            text: 'Прогресс будет сохранён в истории.',
            confirmText: 'Прервать',
            cancelText: 'Продолжить',
            confirmStyle: 'warning',
            onConfirm: function () { Fullscreen.unmount(); }
          });
        } else {
          Fullscreen.unmount();
        }
      };

      const element = h(FullscreenOverlay, {
        dateKey: o.dateKey,
        trainingIndex: o.trainingIndex,
        mode: o.mode || 'new',
        onRequestClose: requestClose
      });

      if (root) {
        root.render(element);
        activeRoot = { root: root, host: host, onPopState: onPopState };
      } else {
        // React 17 fallback
        ReactDOM.render(element, host);
        activeRoot = { host: host, onPopState: onPopState, legacy: true };
      }
    },

    unmount: function unmount(opts) {
      const o = opts || {};
      if (!activeRoot) return;

      window.removeEventListener('popstate', activeRoot.onPopState);

      try {
        if (activeRoot.root) activeRoot.root.unmount();
        else if (activeRoot.legacy) ReactDOM.unmountComponentAtNode(activeRoot.host);
      } catch (e) {
        console.warn('[Fingers.Fullscreen] unmount error:', e);
      }

      // Pop history entry unless triggered by popstate itself
      if (!o.skipHistoryPop) {
        try {
          if (window.history.state && window.history.state.fingers) {
            window.history.back();
          }
        } catch (_) { /* noop */ }
      }

      uninstallSwipeBackGuard();
      unlockBodyScroll();
      clearTheme();

      activeRoot = null;
    },

    isMounted: function () { return !!activeRoot; }
  };

  Fingers.Fullscreen = Fullscreen;
})(typeof window !== 'undefined' ? window : globalThis);
