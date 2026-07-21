// heys_messenger_api_v1.js — HTTP клиент для HEYS Messenger API.
// HEYS.MessengerAPI.* — публичный API, используется heys_messenger_v1
// (модалка клиента) и расширениями для куратора (badges в dropdown).

(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});

  // ── API base URL (тот же паттерн что в heys_push_v1.js) ─────────────
  const isLocalBrowserDev =
    typeof location !== 'undefined' &&
    /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API_URL = isLocalBrowserDev ? 'http://localhost:4001' : 'https://api.heyslab.ru';
  const disableLocalFabUnreadPolling = () =>
    isLocalBrowserDev && global.__HEYS_ENABLE_LOCAL_MESSENGER_POLLING !== true;

  // ── Bearer token (клиент session или JWT куратора, копия из heys_push_v1) ──
  function getBearerToken() {
    let hasPinAuthClient = false;
    try {
      hasPinAuthClient = !!localStorage.getItem('heys_pin_auth_client');
    } catch {
      /* ignore */
    }

    // Localhost may expose an in-memory dev token. Production curator requests
    // carry only the HttpOnly cookie via credentials:'include'.
    if (!hasPinAuthClient) {
      try {
        const devToken = HEYS.YandexAPI?.getCuratorToken?.();
        if (devToken) return devToken;
      } catch {
        /* ignore */
      }
      try {
        const hasCuratorSession = HEYS.auth?.isCuratorSession?.() === true
          || !!HEYS.cloud?.getUser?.()
          || !!localStorage.getItem('heys_curator_cookie_session_hint');
        if (hasCuratorSession) return null;
      } catch {
        /* ignore */
      }
    }

    try {
      if (HEYS.auth && typeof HEYS.auth.getSessionToken === 'function') {
        const t = HEYS.auth.getSessionToken();
        if (t) return t;
      }
    } catch {
      /* ignore */
    }

    try {
      const raw = localStorage.getItem('heys_session_token');
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  // ── Low-level fetch wrapper ──────────────────────────────────────────
  // Token может быть null для PIN-клиентов в проде (PR-C, 2026-05-20):
  // session token лежит в HttpOnly cookie, JS его не видит. В таком случае
  // отправляем БЕЗ Authorization header — credentials:'include' донесёт
  // cookie до cloud function, та прочтёт и подставит session_token.
  const RETRY_STATUSES = new Set([500, 502, 503, 504]);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function createRequestId() {
    try {
      if (global.crypto?.randomUUID) return global.crypto.randomUUID();
      const bytes = new Uint8Array(16);
      global.crypto?.getRandomValues?.(bytes);
      if (bytes.some(Boolean)) {
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    } catch { /* fallback below */ }
    const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
    hex[12] = '4';
    hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
    const value = hex.join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  async function call(path, opts = {}) {
    const token = getBearerToken();
    const url = API_URL + path;
    const method = opts.method || 'GET';
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    };
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const retryable = opts.retryable === true || (opts.retryable !== false && method === 'GET');
    const maxAttempts = retryable ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body,
          credentials: 'include',
        });
      } catch (err) {
        if (attempt + 1 < maxAttempts) {
          await sleep(180 * (attempt + 1));
          continue;
        }
        return { success: false, error: 'network_error' };
      }

      let json = null;
      try {
        json = await res.json();
      } catch {
        // empty response
      }

      if (res.ok) return json || { success: true };

      if (RETRY_STATUSES.has(res.status) && attempt + 1 < maxAttempts) {
        await sleep(220 * (attempt + 1));
        continue;
      }

      return {
        success: false,
        error: json?.error || `http_${res.status}`,
        detail: json?.details || json?.message || null,
        statusCode: res.status,
        retryAfter: json?.retry_after,
      };
    }

    return { success: false, error: 'network_error' };
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Отправить сообщение.
   *   client → curator: { body, intent_type?, intent_payload?, attachments? }
   *   curator → client: { client_id, body, attachments? }
   * attachments:
   *   image — {type:'image', url, path, filename?, mime?, width?, height?}
   *   audio — {type:'audio', url, path, filename?, mime?, duration_ms, size_bytes?, waveform?,
   *            transcript_status?, transcript_text?, transcript_provider?, transcript_created_at?, transcript_error?}
   */
  async function send(payload, options = {}) {
    const requestId = options.requestId || createRequestId();
    return call('/messages/send', {
      method: 'POST',
      body: { ...payload, request_id: requestId },
      retryable: true,
    });
  }

  async function getTranscriptionConsent() {
    return call('/messages/transcription-consent');
  }

  async function setTranscriptionConsent(granted, opts = {}) {
    return call('/messages/transcription-consent', {
      method: 'POST',
      body: {
        granted: !!granted,
        ...(opts.message_id ? { message_id: opts.message_id } : {}),
      },
      retryable: true,
    });
  }

  /**
   * Получить тред.
   *   client: { before_ts?, limit? }
   *   curator: { client_id, before_ts?, limit? }
   */
  async function getThread(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.client_id) qs.set('client_id', opts.client_id);
    if (opts.before_ts) qs.set('before', opts.before_ts);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const qstr = qs.toString();
    return call(`/messages/thread${qstr ? '?' + qstr : ''}`);
  }

  /**
   * Inbox куратора — список всех клиентов + unread + preview.
   * Только для куратора (server вернёт 403 для клиента).
   */
  async function getInbox() {
    return call('/messages/inbox');
  }

  /**
   * Пометить прочитанным.
   *   client: { up_to_ts? }
   *   curator: { client_id, up_to_ts? }
   */
  async function markRead(payload = {}) {
    return call('/messages/mark-read', { method: 'POST', body: payload, retryable: true });
  }

  async function setDone(messageId, desiredState) {
    return call('/messages/set-done', {
      method: 'POST',
      body: { message_id: messageId, desired_state: !!desiredState },
      retryable: true,
    });
  }

  async function setAcked(messageId, desiredState) {
    return call('/messages/set-acked', {
      method: 'POST',
      body: { message_id: messageId, desired_state: !!desiredState },
      retryable: true,
    });
  }

  /**
   * Удалить своё сообщение (hard delete). Клиент удаляет свои client-сообщения,
   * куратор — свои curator-сообщения. Идемпотентно (повторный вызов вернёт deleted=0).
   */
  async function deleteMessage(messageId) {
    return call('/messages/delete', {
      method: 'POST',
      body: { message_id: messageId },
      retryable: true,
    });
  }

  /**
   * Редактировать своё text-сообщение. Intent-сообщения редактировать нельзя
   * (контракт payload бы поломал ссылку applied_meal_id у куратора).
   * При успехе возвращает { success, edited_at }.
   */
  async function editMessage(messageId, newBody) {
    return call('/messages/edit', {
      method: 'POST',
      body: { message_id: messageId, body: newBody },
      retryable: true,
    });
  }

  /**
   * Получить количество непрочитанных сообщений.
   * Для клиента — от куратора.
   * Для куратора — от указанного client_id (или сумма по всем, если не указан).
   */
  async function getUnreadCount(opts = {}) {
    const qs = opts.client_id ? `?client_id=${encodeURIComponent(opts.client_id)}` : '';
    return call(`/messages/unread-count${qs}`);
  }

  // ── Inbox cache (curator-only) ───────────────────────────────────────
  // Кэш для синхронного чтения из не-React компонентов (buildGate карточки).
  // Polling каждые 30 сек, старт лениво при первом getInboxCache.
  let _inboxCache = {}; // {client_id → {unread_count, last_message_preview, last_message_at}}
  let _inboxPollTimer = null;
  let _inboxPolling = false;
  let _inboxBackoffUntil = 0;
  let _inboxBackoffMs = 0;

  function looksLikeCuratorToken() {
    try {
      if (HEYS.auth?.isCuratorSession?.() === true) return true;
    } catch {
      /* ignore */
    }
    try {
      if (HEYS.cloud?.getUser?.()) return true;
    } catch {
      /* ignore */
    }
    try {
      if (localStorage.getItem('heys_curator_cookie_session_hint')) return true;
    } catch {
      /* ignore */
    }
    const token = getBearerToken();
    if (!token) return false;
    // JWT имеет 3 точки + длиннее обычного session token
    return token.split('.').length === 3;
  }

  async function refreshInbox() {
    if (!looksLikeCuratorToken()) return;
    const now = Date.now();
    if (_inboxBackoffUntil && now < _inboxBackoffUntil) return;
    const res = await getInbox();
    if (res?.success && Array.isArray(res.inbox)) {
      _inboxBackoffMs = 0;
      _inboxBackoffUntil = 0;
      const next = {};
      for (const entry of res.inbox) {
        if (entry?.client_id) next[entry.client_id] = entry;
      }
      _inboxCache = next;
      try {
        window.dispatchEvent(new CustomEvent('heys:messenger-inbox-updated', { detail: _inboxCache }));
      } catch { /* ignore */ }
    } else if (RETRY_STATUSES.has(res?.statusCode) || res?.statusCode === 500) {
      _inboxBackoffMs = _inboxBackoffMs
        ? Math.min(_inboxBackoffMs * 2, 5 * 60 * 1000)
        : 60 * 1000;
      _inboxBackoffUntil = Date.now() + _inboxBackoffMs;
    }
  }

  function startInboxPolling() {
    if (_inboxPolling) return;
    _inboxPolling = true;
    void refreshInbox();
    _inboxPollTimer = setInterval(refreshInbox, 30000);
    // Перезагружать при смене клиента (там точно проявился новый msg)
    window.addEventListener('heys:client-changed', refreshInbox);
  }

  function getInboxCache() {
    // Lazy: первый вызов запускает поллинг
    if (!_inboxPolling && looksLikeCuratorToken()) {
      startInboxPolling();
    }
    return _inboxCache;
  }

  // ── Unread count для FAB badge (poll каждые 60 сек) ──────────────────
  // Кэшируем последнее значение для синхронного чтения из FAB-рендера.
  // Для куратора — unread от текущего клиента (HEYS.currentClientId).
  // Для клиента — unread от куратора.
  let _fabUnread = 0;
  let _fabPollTimer = null;
  let _fabPolling = false;
  let _fabUnreadBackoffUntil = 0;
  let _fabUnreadBackoffMs = 0;

  async function refreshFabUnread() {
    try {
      const now = Date.now();
      if (_fabUnreadBackoffUntil && now < _fabUnreadBackoffUntil) return;
      const isCurator = looksLikeCuratorToken();
      // 🛡️ 2026-05-30 Wave 4 audit: убран fallback на heys_last_client_id —
      // он может содержать stale clientId от прошлой сессии и приведёт к
      // запросу unread count для wrong client'а. Лучше показать 0 пока
      // currentClientId не установлен.
      const opts = isCurator
        ? { client_id: window.HEYS?.currentClientId || null }
        : {};
      if (isCurator && !opts.client_id) {
        // Курaтор без выбранного клиента — счёт не показываем
        if (_fabUnread !== 0) {
          _fabUnread = 0;
          window.dispatchEvent(new CustomEvent('heys:messenger-fab-unread', { detail: 0 }));
        }
        return;
      }
      const res = await getUnreadCount(opts);
      if (!res?.success && RETRY_STATUSES.has(res?.statusCode)) {
        _fabUnreadBackoffMs = _fabUnreadBackoffMs
          ? Math.min(_fabUnreadBackoffMs * 2, 5 * 60 * 1000)
          : 60 * 1000;
        _fabUnreadBackoffUntil = Date.now() + _fabUnreadBackoffMs;
        return;
      }
      _fabUnreadBackoffMs = 0;
      _fabUnreadBackoffUntil = 0;
      const next = res?.success ? (res.unread_count || 0) : 0;
      if (next !== _fabUnread) {
        _fabUnread = next;
        window.dispatchEvent(new CustomEvent('heys:messenger-fab-unread', { detail: next }));
      }
    } catch { /* ignore */ }
  }

  function startFabUnreadPolling() {
    if (_fabPolling) return;
    if (disableLocalFabUnreadPolling()) return;
    const hasCookieSession = (() => {
      try {
        return HEYS.auth?.isCuratorSession?.() === true
          || !!localStorage.getItem('heys_pin_cookie_session_hint')
          || !!localStorage.getItem('heys_curator_cookie_session_hint');
      } catch { return false; }
    })();
    if (!getBearerToken() && !hasCookieSession) return;
    _fabPolling = true;
    void refreshFabUnread();
    _fabPollTimer = setInterval(refreshFabUnread, 60000);
    // Принудительно обновлять при смене клиента (курaтор) и при focus возврата
    window.addEventListener('heys:client-changed', refreshFabUnread);
    window.addEventListener('focus', refreshFabUnread);
  }

  function getFabUnreadCount() {
    if (!_fabPolling) startFabUnreadPolling();
    return _fabUnread;
  }

  HEYS.MessengerAPI = {
    send,
    getTranscriptionConsent,
    setTranscriptionConsent,
    getThread,
    getInbox,
    markRead,
    setDone,
    setAcked,
    deleteMessage,
    editMessage,
    getUnreadCount,
    getInboxCache,
    refreshInbox,
    getFabUnreadCount,
    refreshFabUnread,
    _getBearerToken: getBearerToken, // exposed for testing/debug
    _looksLikeCuratorToken: looksLikeCuratorToken,
    _API_URL: API_URL,
    _createRequestId: createRequestId,
  };

  if (typeof window !== 'undefined') {
    window.__heysLoadingHeartbeat = Date.now();
  }
})(typeof window !== 'undefined' ? window : global);
