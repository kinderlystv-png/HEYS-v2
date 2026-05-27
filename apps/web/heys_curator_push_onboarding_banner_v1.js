// heys_curator_push_onboarding_banner_v1.js
// Onboarding banner для куратора: при первом входе после релиза мессенджера
// предлагаем включить push, иначе сообщения от клиентов будут пропускаться.
//
// Условия показа:
//   • Сессия — куратор (HEYS.auth.isCuratorSession)
//   • HEYS.push.getStatus().capable === true (браузер поддерживает push)
//   • permission !== 'granted' (либо нет подписки)
//   • Не dismissed в последние 14 дней (localStorage флаг)
//   • permission !== 'denied' — на denied показ бесполезен (юзер уже отказал)
//
// Triggers:
//   • heysSyncCompleted (sync завершён, безопасно дёргать UI)
//   • Fallback timeout 8s — если sync не пришёл (legacy/curator paths)
//
// Не зависит от React — vanilla DOM, как heys_curator_actions_banner_v1.js.
// Стили — inline (banner мелкий, отдельный CSS overkill).

(function () {
  'use strict';

  const HEYS = (window.HEYS = window.HEYS || {});

  const LS_DISMISS_KEY = 'heys_messenger_push_onboarding_dismissed_at';
  const DISMISS_TTL_DAYS = 14;
  const SHOW_DELAY_MS = 1500;   // дать UI устаканиться после sync
  const FALLBACK_INIT_MS = 8000; // если heysSyncCompleted не пришёл

  let _bannerEl = null;
  let _initialized = false;
  let _checkScheduled = false;

  // ─── Helpers ────────────────────────────────────────────────────────

  function isCurator() {
    try {
      if (typeof HEYS.auth?.isCuratorSession === 'function') {
        return !!HEYS.auth.isCuratorSession();
      }
      if (typeof window.isCuratorSession === 'function') {
        return !!window.isCuratorSession();
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function isDismissed() {
    try {
      const raw = localStorage.getItem(LS_DISMISS_KEY);
      if (!raw) return false;
      const ts = parseInt(raw, 10);
      if (!Number.isFinite(ts)) return false;
      const daysPassed = (Date.now() - ts) / (1000 * 60 * 60 * 24);
      return daysPassed < DISMISS_TTL_DAYS;
    } catch (_) {
      return false;
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(LS_DISMISS_KEY, String(Date.now()));
    } catch (_) { /* ignore */ }
  }

  function hideBanner() {
    if (_bannerEl && _bannerEl.parentNode) {
      _bannerEl.parentNode.removeChild(_bannerEl);
    }
    _bannerEl = null;
  }

  // ─── UI ──────────────────────────────────────────────────────────────

  function buildBannerDOM(status) {
    const needsInstall = !!status?.needsInstall;
    const title = needsInstall
      ? '📲 Установи HEYS на главный экран, чтобы получать сообщения от клиентов'
      : '🔔 Включи уведомления, чтобы видеть сообщения от клиентов';
    const subtitle = needsInstall
      ? 'На iPhone push-уведомления работают только из установленного приложения. Поделиться → На экран «Домой», потом запусти HEYS с иконки.'
      : 'Когда клиент напишет 💬, тебе придёт push — даже если приложение закрыто.';
    const btnText = needsInstall ? 'Понятно' : 'Разрешить';

    const root = document.createElement('div');
    root.className = 'curator-push-onboarding-banner';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Onboarding push-уведомлений для куратора');
    root.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'z-index: 9998',
      'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'color: #ffffff',
      'padding: 12px 16px',
      'box-shadow: 0 2px 10px rgba(0,0,0,0.18)',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'box-sizing: border-box',
    ].join('; ');

    const container = document.createElement('div');
    container.style.cssText = [
      'max-width: 720px',
      'margin: 0 auto',
      'display: flex',
      'align-items: center',
      'gap: 12px',
    ].join('; ');

    const textBlock = document.createElement('div');
    textBlock.style.cssText = 'flex: 1; min-width: 0;';

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 4px; line-height: 1.3;';

    const subtitleEl = document.createElement('div');
    subtitleEl.textContent = subtitle;
    subtitleEl.style.cssText = 'font-size: 12px; opacity: 0.92; line-height: 1.4;';

    textBlock.appendChild(titleEl);
    textBlock.appendChild(subtitleEl);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.textContent = btnText;
    actionBtn.className = 'curator-push-onboarding-banner__btn';
    actionBtn.style.cssText = [
      'background: #ffffff',
      'color: #5a6fd6',
      'border: none',
      'border-radius: 8px',
      'padding: 8px 14px',
      'font-weight: 600',
      'font-size: 13px',
      'cursor: pointer',
      'white-space: nowrap',
      'flex-shrink: 0',
    ].join('; ');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Закрыть');
    closeBtn.textContent = '✕';
    closeBtn.className = 'curator-push-onboarding-banner__close';
    closeBtn.style.cssText = [
      'background: transparent',
      'color: #ffffff',
      'border: none',
      'font-size: 20px',
      'line-height: 1',
      'cursor: pointer',
      'padding: 4px 8px',
      'opacity: 0.75',
      'flex-shrink: 0',
    ].join('; ');

    container.appendChild(textBlock);
    container.appendChild(actionBtn);
    container.appendChild(closeBtn);
    root.appendChild(container);

    actionBtn.addEventListener('click', async () => {
      if (needsInstall) {
        // На iOS без install — просто закрываем (инструкция в subtitle)
        hideBanner();
        markDismissed();
        return;
      }
      try {
        actionBtn.disabled = true;
        const originalText = actionBtn.textContent;
        actionBtn.textContent = '...';
        const r = await HEYS.push?.subscribe?.();
        if (r && r.ok === true) {
          hideBanner();
          markDismissed();
          if (typeof HEYS.Toast?.success === 'function') {
            try { HEYS.Toast.success('Уведомления включены'); } catch (_) { /* ignore */ }
          }
          return;
        }
        // Восстановить кнопку для возможной повторной попытки
        actionBtn.textContent = originalText;
        actionBtn.disabled = false;
        if (r?.reason === 'permission_denied' || r?.reason === 'permission_blocked') {
          alert('Без разрешения уведомления не работают. Можно включить позже из шапки 🔔.');
          hideBanner();
          markDismissed();
        } else if (r?.reason === 'ios_needs_install') {
          alert('На iPhone уведомления работают только из установленного приложения. Поделиться → На экран «Домой», потом запусти HEYS с иконки.');
        } else if (r?.reason === 'not_capable') {
          // браузер не поддерживает — просто скрываем, чтоб не мозолил
          hideBanner();
          markDismissed();
        }
      } catch (e) {
        actionBtn.textContent = btnText;
        actionBtn.disabled = false;
        try { console.warn('[curator-push-onboarding] subscribe failed:', e?.message || e); } catch (_) { /* ignore */ }
      }
    });

    closeBtn.addEventListener('click', () => {
      hideBanner();
      markDismissed();
    });

    return root;
  }

  function showBanner(status) {
    if (_bannerEl) return;
    _bannerEl = buildBannerDOM(status);
    document.body.appendChild(_bannerEl);
  }

  // ─── Check + decide ─────────────────────────────────────────────────

  async function check() {
    try {
      if (!isCurator()) return;
      if (isDismissed()) return;
      if (!HEYS.push || typeof HEYS.push.getStatus !== 'function') return;

      const status = await HEYS.push.getStatus();
      if (!status?.capable) return; // браузер не умеет push
      if (status.subscribed && status.permission === 'granted') return; // уже всё ок
      if (status.permission === 'denied') return; // юзер уже отказал, бесполезно
      showBanner(status);
    } catch (e) {
      try { console.warn('[curator-push-onboarding] check failed:', e?.message || e); } catch (_) { /* ignore */ }
    }
  }

  function scheduleCheck() {
    if (_checkScheduled) return;
    _checkScheduled = true;
    setTimeout(() => { void check(); }, SHOW_DELAY_MS);
  }

  // ─── Init ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;

    // Основной trigger — sync завершён.
    try {
      window.addEventListener('heysSyncCompleted', scheduleCheck, { once: true });
    } catch (_) { /* ignore */ }

    // Fallback — если sync не пришёл за 8s (curator entry без полного sync flow).
    setTimeout(scheduleCheck, FALLBACK_INIT_MS);
  }

  // ─── Public API ─────────────────────────────────────────────────────

  HEYS.curatorPushOnboarding = {
    check,
    showBanner,
    hideBanner,
    isDismissed,
    markDismissed,
  };

  // Авто-старт
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }
})();
