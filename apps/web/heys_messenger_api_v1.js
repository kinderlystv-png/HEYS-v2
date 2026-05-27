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

  // ── Bearer token (клиент session или JWT куратора, копия из heys_push_v1) ──
  function getBearerToken() {
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

    try {
      const curatorSession = localStorage.getItem('heys_curator_session');
      if (curatorSession) return curatorSession;
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem('heys_supabase_auth_token');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.access_token) return parsed.access_token;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  // ── Low-level fetch wrapper ──────────────────────────────────────────
  async function call(path, opts = {}) {
    const token = getBearerToken();
    if (!token) {
      return { success: false, error: 'no_auth_token' };
    }
    const url = API_URL + path;
    const method = opts.method || 'GET';
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    };
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'include',
      });
    } catch (err) {
      return { success: false, error: 'network_error', detail: err.message };
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      // empty response
    }

    if (!res.ok) {
      return {
        success: false,
        error: json?.error || `http_${res.status}`,
        statusCode: res.status,
        retryAfter: json?.retry_after,
      };
    }
    return json || { success: true };
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Отправить сообщение.
   *   client → curator: { body, intent_type?, intent_payload? }
   *   curator → client: { client_id, body }
   */
  async function send(payload) {
    return call('/messages/send', { method: 'POST', body: payload });
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
    return call('/messages/mark-read', { method: 'POST', body: payload });
  }

  // ── Inbox cache (curator-only) ───────────────────────────────────────
  // Кэш для синхронного чтения из не-React компонентов (buildGate карточки).
  // Polling каждые 30 сек, старт лениво при первом getInboxCache.
  let _inboxCache = {}; // {client_id → {unread_count, last_message_preview, last_message_at}}
  let _inboxPollTimer = null;
  let _inboxPolling = false;

  function looksLikeCuratorToken() {
    const token = getBearerToken();
    if (!token) return false;
    // JWT имеет 3 точки + длиннее обычного session token
    return token.split('.').length === 3;
  }

  async function refreshInbox() {
    if (!looksLikeCuratorToken()) return;
    const res = await getInbox();
    if (res?.success && Array.isArray(res.inbox)) {
      const next = {};
      for (const entry of res.inbox) {
        if (entry?.client_id) next[entry.client_id] = entry;
      }
      _inboxCache = next;
      try {
        window.dispatchEvent(new CustomEvent('heys:messenger-inbox-updated', { detail: _inboxCache }));
      } catch { /* ignore */ }
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

  HEYS.MessengerAPI = {
    send,
    getThread,
    getInbox,
    markRead,
    getInboxCache,
    refreshInbox,
    _getBearerToken: getBearerToken, // exposed for testing/debug
    _API_URL: API_URL,
  };

  if (typeof window !== 'undefined') {
    window.__heysLoadingHeartbeat = Date.now();
  }
})(typeof window !== 'undefined' ? window : global);
