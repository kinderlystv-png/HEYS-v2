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

    // 2) JWT куратора
    try {
      const curatorSession = localStorage.getItem('heys_curator_session');
      if (curatorSession) return curatorSession;
    } catch (e) { /* ignore */ }
    try {
      const raw = localStorage.getItem('heys_supabase_auth_token');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token;
      }
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

  async function fetchVapidPublicKey() {
    const cached = lsGet('heys_push_vapid_pk', null);
    if (cached) return cached;
    const res = await fetch(`${API_URL}/push/vapid-key`);
    if (!res.ok) throw new Error('vapid_key_fetch_failed');
    const json = await res.json();
    if (json?.publicKey) {
      lsSet('heys_push_vapid_pk', json.publicKey);
      return json.publicKey;
    }
    throw new Error('vapid_key_missing');
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
    if (!sub) {
      const publicKey = await fetchVapidPublicKey();
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
      const r = await subscribe();
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
