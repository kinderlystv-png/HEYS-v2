// heys_push_v1.js — Web Push клиент HEYS
// Подписка / отписка / настройки / тестовый пуш.
// HEYS.push.* — публичный API, используется heys_consents_v1 и heys_user_tab_impl_v1.

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const lsGet = (k, d) => (HEYS.utils?.lsGet ? HEYS.utils.lsGet(k, d) : (() => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
  })());
  const lsSet = (k, v) => (HEYS.utils?.lsSet ? HEYS.utils.lsSet(k, v) : localStorage.setItem(k, JSON.stringify(v)));

  // ── API base URL (та же логика что в heys_yandex_api_v1) ──────────────
  const isLocalBrowserDev =
    typeof location !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API_URL = isLocalBrowserDev ? 'http://localhost:4001' : 'https://api.heyslab.ru';

  // ── Get bearer token (клиентский session или JWT куратора) ───────────
  function getBearerToken() {
    // 1) Клиентская сессия (PIN-auth)
    try {
      if (HEYS.auth && typeof HEYS.auth.getSessionToken === 'function') {
        const t = HEYS.auth.getSessionToken();
        if (t) return t;
      }
    } catch (e) { /* ignore */ }
    try {
      const raw = localStorage.getItem('heys_session_token');
      if (raw) { try { return JSON.parse(raw); } catch { return raw; } }
    } catch (e) { /* ignore */ }

    // 2) Localhost-only curator token. Production uses HttpOnly cookie.
    try {
      const devToken = HEYS.YandexAPI?.getCuratorToken?.();
      if (devToken) return devToken;
    } catch (e) { /* ignore */ }

    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function isCapable() {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  function isStandalone() {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator?.standalone === true
    );
  }

  function isIosSafari() {
    const ua = navigator.userAgent || '';
    const isIos = /iPhone|iPad|iPod/i.test(ua);
    const isWebkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(ua);
    return isIos && isWebkit;
  }

  // urlBase64ToUint8Array — VAPID public key из base64url в Uint8Array (для applicationServerKey).
  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // ── API calls ─────────────────────────────────────────────────────────
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getBearerToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // credentials:'include' — для PIN-клиентов в проде session_token живёт в
    // HttpOnly cookie (PR-C 2026-05-20), getBearerToken возвращает null.
    // Без include cookie не доставится и cloud function вернёт 401 missing_auth.
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
      const err = new Error(json?.error || `http_${res.status}`);
      err.statusCode = res.status;
      err.response = json;
      throw err;
    }
    return json;
  }

  // SEC-036: сервер спрашивается первым, кеш — только запасной вариант.
  // Прежняя версия возвращала localStorage-кеш и наружу не ходила вовсе, из-за
  // чего смену VAPID-ключа на сервере клиент не мог заметить в принципе.
  async function fetchVapidPublicKey() {
    try {
      const res = await fetch(`${API_URL}/push/vapid-key`);
      if (res.ok) {
        const json = await res.json();
        if (json?.publicKey) {
          lsSet('heys_push_vapid_pk', json.publicKey);
          return json.publicKey;
        }
      }
    } catch (_) {
      // Сети нет — ниже отдадим последний известный ключ.
    }
    const cached = lsGet('heys_push_vapid_pk', null);
    if (cached) return cached;
    throw new Error('vapid_key_fetch_failed');
  }

  // base64url из ArrayBuffer — обратная операция к urlBase64ToUint8Array.
  function uint8ArrayToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * SEC-036: выдана ли подписка под другой VAPID-ключ.
   *
   * Push-сервис отклоняет доставку, если сервер подписывает запрос ключом, не
   * тем, под который создана подписка. Браузер при этом продолжает отдавать её
   * как валидную, поэтому без явной сверки push умирает молча и навсегда.
   *
   * `options` есть не во всех браузерах: когда его нет, рабочую подписку не
   * трогаем — потерять доставку из-за неудачной проверки хуже, чем не заметить
   * ротацию.
   */
  function subscriptionKeyMismatch(sub, publicKey) {
    const applied = sub && sub.options && sub.options.applicationServerKey;
    if (!applied || !publicKey) return false;
    try {
      return uint8ArrayToBase64Url(applied) !== publicKey;
    } catch (_) {
      return false;
    }
  }

  // На localhost / demo SW не регистрируется (см. heys_platform_apis_v1).
  // `navigator.serviceWorker.ready` без регистрации зависает навсегда — тумблер
  // «молчит», getStatus не возвращается. Сначала проверяем, есть ли reg.
  async function getPushRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (!regs || !regs.length) return null;
      return await navigator.serviceWorker.ready;
    } catch (_) {
      return null;
    }
  }

  // ── Status ────────────────────────────────────────────────────────────
  async function getStatus() {
    const capable = isCapable();
    const standalone = isStandalone();
    const ios = isIosSafari();
    const permission = capable ? Notification.permission : 'unsupported';
    let subscription = null;
    let swAvailable = false;
    if (capable) {
      try {
        const reg = await getPushRegistration();
        swAvailable = !!reg;
        if (reg) subscription = await reg.pushManager.getSubscription();
      } catch (e) { /* ignore */ }
    }
    // На iOS Safari пуши работают только из standalone PWA.
    const needsInstall = ios && !standalone;
    return {
      capable,
      ios,
      standalone,
      needsInstall,
      permission,
      subscribed: !!subscription,
      swAvailable,
    };
  }

  // ── Subscribe / unsubscribe ───────────────────────────────────────────
  async function subscribe(opts = {}) {
    if (!isCapable()) {
      return { ok: false, reason: 'not_capable' };
    }
    // iOS без install — пуши не приедут, нет смысла подписываться.
    if (isIosSafari() && !isStandalone()) {
      return { ok: false, reason: 'ios_needs_install' };
    }

    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        lsSet('heys_push_onboarded', { state: 'denied', at: Date.now() });
        return { ok: false, reason: 'permission_denied' };
      }
    } else if (Notification.permission === 'denied') {
      lsSet('heys_push_onboarded', { state: 'denied', at: Date.now() });
      return { ok: false, reason: 'permission_blocked' };
    }

    const reg = await getPushRegistration();
    if (!reg) {
      return { ok: false, reason: 'sw_unavailable' };
    }
    let sub = await reg.pushManager.getSubscription();

    // Ключ нужен и для сверки существующей подписки, а не только для новой.
    // Если сети нет, а подписка уже есть — оставляем как было: молчаливый отказ
    // от доставки хуже, чем пропущенная проверка.
    let publicKey = null;
    try {
      publicKey = await fetchVapidPublicKey();
    } catch (e) {
      if (!sub) throw e;
    }

    // SEC-036: подписка под прежним VAPID-ключом после ротации перестаёт
    // доставлять уведомления, оставаясь «валидной» с точки зрения браузера.
    // Пересоздаём её, иначе push тихо умирает до ручной очистки данных сайта.
    if (sub && subscriptionKeyMismatch(sub, publicKey)) {
      console.info('[push] VAPID-ключ сменился — пересоздаю подписку');
      try {
        await sub.unsubscribe();
      } catch (_) {
        // Не отписались — всё равно создаём новую: старая уже нерабочая.
      }
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = sub.toJSON();
    await api('POST', '/push/subscribe', {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });

    lsSet('heys_push_onboarded', { state: 'granted', at: Date.now() });
    // Подписка получена — сбрасываем pending-install флаг, если он был.
    try { localStorage.removeItem('heys_push_pending_install'); } catch (_) { /* noop */ }
    return { ok: true };
  }

  function isCuratorSession() {
    try {
      if (typeof HEYS.auth?.isCuratorSession === 'function') {
        return !!HEYS.auth.isCuratorSession();
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function notifyEnabledChanged(detail) {
    try {
      window.dispatchEvent(new CustomEvent('heys:push-enabled-changed', { detail: detail || {} }));
    } catch (_) { /* ignore */ }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForClientConsentsApi() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const api = HEYS.Consents?.api;
      if (api && (typeof api.setPushConsent === 'function' || typeof api.revokeConsentBySession === 'function')) {
        return api;
      }
      await sleep(120);
    }
    return HEYS.Consents?.api || null;
  }

  async function writeClientPushConsent(granted, accessCode) {
    if (isCuratorSession()) return { success: true, skipped: 'curator' };
    const api = await waitForClientConsentsApi();
    if (!api) return { success: false, error: 'consents_not_ready' };
    if (granted) {
      if (typeof api.setPushConsent !== 'function') {
        return { success: false, error: 'consents_not_ready' };
      }
      return api.setPushConsent(true, accessCode || null);
    }
    if (typeof api.revokeConsentBySession === 'function') {
      return api.revokeConsentBySession('push_notifications');
    }
    if (typeof api.setPushConsent === 'function') {
      return api.setPushConsent(false);
    }
    return { success: false, error: 'consents_not_ready' };
  }

  // Один пользовательский рубильник: согласие 1.2 + подписка устройства.
  // Низкоуровневые subscribe/unsubscribe остаются для restore и тестов.
  async function setEnabled(enabled, options) {
    const accessCode = options && options.accessCode ? String(options.accessCode) : null;
    if (enabled) {
      const consent = await writeClientPushConsent(true, accessCode);
      if (!consent?.success) {
        if (consent?.needsAccessCode) {
          return { ok: false, reason: 'consent_needs_access_code', error: consent?.error, consent };
        }
        return { ok: false, reason: 'consent_failed', error: consent?.error, consent };
      }
      const sub = await subscribe();
      if (sub?.reason === 'ios_needs_install') {
        try { localStorage.setItem('heys_push_pending_install', '1'); } catch (_) { /* noop */ }
      }
      notifyEnabledChanged({ enabled: true, subscribe: sub });
      return { ok: !!sub?.ok, reason: sub?.reason, consent, subscribe: sub };
    }
    const sub = await unsubscribe();
    const consent = await writeClientPushConsent(false);
    notifyEnabledChanged({ enabled: false, subscribe: sub, consent });
    return {
      ok: true,
      reason: consent?.success === false ? 'consent_revoke_failed' : undefined,
      error: consent?.error,
      consent,
      subscribe: sub,
    };
  }

  async function unsubscribe() {
    if (!isCapable()) return { ok: false, reason: 'not_capable' };
    try {
      const reg = await getPushRegistration();
      if (!reg) return { ok: true, reason: 'sw_unavailable' };
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      lsSet('heys_push_onboarded', { state: 'unsubscribed', at: Date.now() });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  async function savePrefs(prefs) {
    const res = await api('POST', '/push/prefs', { prefs });
    if (res?.prefs) lsSet('heys_push_prefs', res.prefs);
    return res;
  }

  async function sendTest() {
    return api('POST', '/push/test', {});
  }

  // ── Resubscribe листенер (триггерится из SW при pushsubscriptionchange) ─
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type === 'heys-push-resubscribe') {
        try {
          await subscribe();
          console.info('[HEYS.push] resubscribed after pushsubscriptionchange');
        } catch (e) {
          console.warn('[HEYS.push] resubscribe failed:', e.message);
        }
      }
    });
  }

  // ── Auto-resubscribe при заходе (если permission=granted но subscription пропала) ─
  async function maybeAutoResubscribe() {
    if (!isCapable()) return;
    if (Notification.permission !== 'granted') return;
    const onboarded = lsGet('heys_push_onboarded', null);
    if (onboarded?.state !== 'granted') return;
    try {
      const reg = await getPushRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        await subscribe();
        console.info('[HEYS.push] auto-resubscribed (was granted, no subscription)');
      }
    } catch (e) { /* ignore */ }
  }

  // ── iOS PWA: после установки на главный экран — допросить разрешение ──
  // Если юзер на iOS Safari в онбординге согласился на push, но subscribe
  // вернул `ios_needs_install` — мы сохранили флаг `heys_push_pending_install`.
  // При первом запуске standalone-PWA на iOS этот хелпер пробует подписаться.
  async function maybePromptIosAfterInstall() {
    if (!isCapable()) return;
    if (!isIosSafari() || !isStandalone()) return;
    if (Notification.permission !== 'default') return; // уже спрашивали
    let pending = null;
    try { pending = localStorage.getItem('heys_push_pending_install'); } catch (_) { /* noop */ }
    if (pending !== '1') return;
    try {
      const r = await setEnabled(true);
      console.info('[HEYS.push] iOS PWA prompt →', r);
    } catch (e) {
      console.warn('[HEYS.push] iOS PWA prompt failed:', e?.message);
    }
  }

  function svgEl(tag, attrs, children) {
    const ns = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(ns, tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach((child) => {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function iconPhone() {
    return svgEl('svg', {
      width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, [
      svgEl('rect', { x: '7', y: '2', width: '10', height: '20', rx: '2' }),
      svgEl('line', { x1: '11', y1: '18', x2: '13', y2: '18' }),
    ]);
  }

  // Строка «вид шага»: иконка того, что искать глазами, — 16 px обводкой 2,4.
  function iconShare() {
    return svgEl('svg', {
      width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, [
      svgEl('path', { d: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8' }),
      svgEl('polyline', { points: '16 6 12 2 8 6' }),
      svgEl('line', { x1: '12', y1: '2', x2: '12', y2: '15' }),
    ]);
  }

  function iconAddHome() {
    return svgEl('svg', {
      width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, [
      svgEl('rect', { x: '4', y: '4', width: '16', height: '16', rx: '4' }),
      svgEl('line', { x1: '12', y1: '8', x2: '12', y2: '16' }),
      svgEl('line', { x1: '8', y1: '12', x2: '16', y2: '12' }),
    ]);
  }

  function iconOpen() {
    return svgEl('svg', {
      width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, [
      svgEl('line', { x1: '5', y1: '12', x2: '19', y2: '12' }),
      svgEl('polyline', { points: '12 5 19 12 12 19' }),
    ]);
  }

  let iosHomeInstallRoot = null;
  let iosHomeInstallOnKey = null;

  function hideIosHomeInstallGuide() {
    if (iosHomeInstallOnKey) {
      document.removeEventListener('keydown', iosHomeInstallOnKey);
      iosHomeInstallOnKey = null;
    }
    if (iosHomeInstallRoot && iosHomeInstallRoot.parentNode) {
      iosHomeInstallRoot.parentNode.removeChild(iosHomeInstallRoot);
    }
    iosHomeInstallRoot = null;
  }

  function showIosHomeInstallGuide(options) {
    if (typeof document === 'undefined') return false;
    hideIosHomeInstallGuide();

    const onLater = typeof options?.onLater === 'function' ? options.onLater : null;
    const onOk = typeof options?.onOk === 'function' ? options.onOk : null;

    const backdrop = document.createElement('div');
    backdrop.className = 'ios-home-install-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Чтобы напоминания приходили, добавьте иконку');

    const modal = document.createElement('div');
    modal.className = 'ios-home-install-modal';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ios-home-install-modal__close';
    closeBtn.setAttribute('aria-label', 'Закрыть');
    closeBtn.textContent = '×';

    const phone = document.createElement('div');
    phone.className = 'ios-home-install-modal__phone';
    phone.appendChild(iconPhone());

    const title = document.createElement('h2');
    title.className = 'ios-home-install-modal__title';
    title.textContent = 'Чтобы напоминания приходили, добавьте иконку';

    const lead = document.createElement('p');
    lead.className = 'ios-home-install-modal__lead';
    lead.textContent = 'На iPhone уведомления работают только из приложения, открытого с домашнего экрана.';

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'ios-home-install-modal__steps';

    const steps = [
      {
        num: '1',
        title: 'Нажмите «Поделиться»',
        hint: 'Квадрат со стрелкой внизу Safari',
        icon: iconShare,
      },
      {
        num: '2',
        title: 'Выберите «На экран „Домой“»',
        hint: 'Пункт в середине списка',
        icon: iconAddHome,
      },
      {
        num: '3',
        title: 'Откройте HEYS с иконки',
        hint: 'Дальше — как обычно, данные на месте',
        icon: iconOpen,
      },
    ];

    steps.forEach((step) => {
      const row = document.createElement('div');
      row.className = 'ios-home-install-modal__step';

      const num = document.createElement('span');
      num.className = 'ios-home-install-modal__num';
      num.textContent = step.num;

      const copy = document.createElement('div');
      copy.className = 'ios-home-install-modal__step-copy';
      const stepTitle = document.createElement('div');
      stepTitle.className = 'ios-home-install-modal__step-title';
      stepTitle.textContent = step.title;
      const stepHint = document.createElement('div');
      stepHint.className = 'ios-home-install-modal__step-hint';
      stepHint.textContent = step.hint;
      copy.appendChild(stepTitle);
      copy.appendChild(stepHint);

      const iconWrap = document.createElement('span');
      iconWrap.className = 'ios-home-install-modal__step-icon';
      iconWrap.appendChild(step.icon());

      row.appendChild(num);
      row.appendChild(copy);
      row.appendChild(iconWrap);
      stepsWrap.appendChild(row);
    });

    const footnote = document.createElement('p');
    footnote.className = 'ios-home-install-modal__footnote';
    footnote.textContent = 'Ничего не скачивается: иконка — ярлык на то же приложение.';

    const actions = document.createElement('div');
    actions.className = 'ios-home-install-modal__actions';

    const laterBtn = document.createElement('button');
    laterBtn.type = 'button';
    laterBtn.className = 'ios-home-install-modal__btn ios-home-install-modal__btn--later';
    laterBtn.textContent = 'Позже';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'ios-home-install-modal__btn ios-home-install-modal__btn--ok';
    okBtn.textContent = 'Понятно';

    const close = (kind) => {
      hideIosHomeInstallGuide();
      if (kind === 'later') onLater?.();
      else onOk?.();
    };

    closeBtn.addEventListener('click', () => close('ok'));
    laterBtn.addEventListener('click', () => close('later'));
    okBtn.addEventListener('click', () => close('ok'));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close('later');
    });
    iosHomeInstallOnKey = (event) => {
      if (event.key === 'Escape') close('later');
    };
    document.addEventListener('keydown', iosHomeInstallOnKey);

    actions.appendChild(laterBtn);
    actions.appendChild(okBtn);

    // Строка «вид шапки листа»: слева круг с иконкой, справа заголовок и
    // подпись — одной строкой, а не столбиком. Прежде иконка стояла над
    // заголовком отдельным блоком, и шапка занимала лишнюю высоту.
    const head = document.createElement('div');
    head.className = 'ios-home-install-modal__head';
    const headCopy = document.createElement('div');
    headCopy.className = 'ios-home-install-modal__head-copy';
    headCopy.appendChild(title);
    headCopy.appendChild(lead);
    head.appendChild(phone);
    head.appendChild(headCopy);

    modal.appendChild(closeBtn);
    modal.appendChild(head);
    modal.appendChild(stepsWrap);
    modal.appendChild(footnote);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    iosHomeInstallRoot = backdrop;
    try { okBtn.focus(); } catch (_) { /* ignore */ }
    return true;
  }

  function getEnableFailureCopy(reason) {
    switch (reason) {
      case 'ios_needs_install':
        return {
          icon: '📱',
          title: 'Чтобы напоминания приходили, добавьте иконку',
          text: 'На iPhone уведомления работают только из приложения, открытого с домашнего экрана.',
        };
      case 'permission_blocked':
        return {
          icon: '🔕',
          title: 'Уведомления запрещены',
          text: 'Разблокируй их в настройках сайта: значок замка в адресной строке → Уведомления → Разрешить.',
        };
      case 'permission_denied':
        return {
          icon: '🔔',
          title: 'Без разрешения не получится',
          text: 'Уведомления можно включить позже из этого же переключателя, когда будешь готов разрешить их браузеру.',
        };
      case 'not_capable':
        return {
          icon: '💻',
          title: 'Браузер не поддерживает',
          text: 'Этот браузер не умеет push-уведомления. Попробуй Chrome, Safari или установленное приложение HEYS.',
        };
      case 'sw_unavailable':
        return {
          icon: '🔧',
          title: 'Подписка здесь недоступна',
          text: 'На локальной разработке service worker не включается. Согласие можно подписать кодом доступа, а саму подписку устройства проверь на app.heyslab.ru.',
        };
      case 'consent_failed':
        return {
          icon: '⚠️',
          title: 'Не удалось записать согласие',
          text: 'Попробуй ещё раз. Если снова не выйдет — выйди и зайди по коду доступа.',
        };
      default:
        return null;
    }
  }

  // Красивая модалка вместо browser alert для отказов включения push.
  function explainEnableFailure(reason) {
    if (reason === 'ios_needs_install') {
      return showIosHomeInstallGuide();
    }
    const copy = getEnableFailureCopy(reason);
    if (!copy) return false;
    if (typeof HEYS.ConfirmModal?.show === 'function') {
      HEYS.ConfirmModal.show({
        icon: copy.icon,
        title: copy.title,
        text: copy.text,
        confirmStyle: 'primary',
        confirmVariant: 'fill',
        actions: [{
          key: 'ok',
          label: 'Понятно',
          value: 'ok',
          style: 'primary',
          variant: 'fill',
          row: 0,
          isDefault: true,
        }],
      });
      return true;
    }
    try { window.alert(copy.text); } catch (_) { /* ignore */ }
    return true;
  }

  // ── Local scheduled notifications (SW-backed, survives tab close) ───────
  const _pageLocalNotificationTimers = new Map();

  async function postToActiveSw(message) {
    const reg = await getPushRegistration();
    if (!reg?.active) return null;
    reg.active.postMessage(message);
    return reg;
  }

  function schedulePageLocalNotification(payload) {
    const delay = payload.fireAt - Date.now();
    if (delay <= 0) return { ok: false, reason: 'past' };
    const existing = _pageLocalNotificationTimers.get(payload.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      _pageLocalNotificationTimers.delete(payload.id);
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(payload.title, { body: payload.body, tag: payload.tag });
        }
      } catch (_) {
        // ignore
      }
    }, delay);
    _pageLocalNotificationTimers.set(payload.id, timer);
    return { ok: true, via: 'page' };
  }

  async function scheduleLocalNotification(payload = {}) {
    const id = String(payload.id || '');
    const fireAt = Number(payload.fireAt);
    const title = String(payload.title || '');
    const body = String(payload.body || '');
    const tag = String(payload.tag || id);
    if (!id || !Number.isFinite(fireAt) || !title) {
      return { ok: false, reason: 'invalid_payload' };
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return { ok: false, reason: 'permission' };
    }
    const normalized = { id, fireAt, title, body, tag };
    const reg = await postToActiveSw({ type: 'SCHEDULE_LOCAL_NOTIFICATION', payload: normalized });
    if (reg) return { ok: true, via: 'sw' };
    return schedulePageLocalNotification(normalized);
  }

  async function cancelLocalNotification(id) {
    const key = String(id || '');
    if (!key) return { ok: false, reason: 'invalid_id' };
    const pageTimer = _pageLocalNotificationTimers.get(key);
    if (pageTimer) {
      clearTimeout(pageTimer);
      _pageLocalNotificationTimers.delete(key);
    }
    await postToActiveSw({ type: 'CANCEL_LOCAL_NOTIFICATION', id: key });
    return { ok: true };
  }

  // ── Public API ────────────────────────────────────────────────────────
  HEYS.push = {
    isCapable,
    isStandalone,
    isIosSafari,
    getStatus,
    subscribe,
    unsubscribe,
    setEnabled,
    savePrefs,
    sendTest,
    maybeAutoResubscribe,
    maybePromptIosAfterInstall,
    fetchVapidPublicKey,
    getEnableFailureCopy,
    explainEnableFailure,
    showIosHomeInstallGuide,
    hideIosHomeInstallGuide,
    scheduleLocalNotification,
    cancelLocalNotification,
  };

  // Авто-проверка на старте — через небольшой timeout, чтобы SW успел встать.
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      maybeAutoResubscribe().catch(() => {});
      maybePromptIosAfterInstall().catch(() => {});
    }, 3000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
