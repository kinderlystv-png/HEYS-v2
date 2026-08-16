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

  // ── Status ────────────────────────────────────────────────────────────
  async function getStatus() {
    const capable = isCapable();
    const standalone = isStandalone();
    const ios = isIosSafari();
    const permission = capable ? Notification.permission : 'unsupported';
    let subscription = null;
    if (capable) {
      try {
        const reg = await navigator.serviceWorker.ready;
        subscription = await reg.pushManager.getSubscription();
      } catch (e) { /* ignore */ }
    }
    // На iOS Safari пуши работают только из standalone PWA.
    const needsInstall = ios && !standalone;
    return { capable, ios, standalone, needsInstall, permission, subscribed: !!subscription };
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

    const reg = await navigator.serviceWorker.ready;
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
      const reg = await navigator.serviceWorker.ready;
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
      const reg = await navigator.serviceWorker.ready;
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
  };

  // Авто-проверка на старте — через небольшой timeout, чтобы SW успел встать.
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      maybeAutoResubscribe().catch(() => {});
      maybePromptIosAfterInstall().catch(() => {});
    }, 3000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
