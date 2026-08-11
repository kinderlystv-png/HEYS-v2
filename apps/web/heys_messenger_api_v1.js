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

  // ── Photo blob cache ─────────────────────────────────────────────────
  // Публичные ссылки на фото убраны из ответа `/photos/upload` (2026-08-11):
  // каждая загрузка раньше клала в базу постоянный публичный URL, и снятие
  // публичного доступа с бакета его не отзывало бы. Единственный путь чтения
  // теперь — авторизованный `/photos/read` по `path`. Он вызывается на КАЖДОЕ
  // открытие фото (лента куратора за неделю, история сообщений), поэтому кэш
  // здесь не оптимизация, а необходимость: без него неделя фото — это неделя
  // запросов заново при каждом рендере.
  //
  // Кэш общий для мессенджера и дневника — оба контура используют один и тот
  // же `path` от одного и того же эндпоинта, второй кэш плодил бы дубликаты
  // blob'ов в памяти без причины.
  const PHOTO_CACHE_LIMIT = 60; // блобов одновременно; вытесняются самые старые
  const PHOTO_NEGATIVE_TTL_MS = 30 * 1000; // короткий: сетевой сбой не должен
  // держать «фото недоступно» до перезагрузки вкладки
  const photoObjectUrlCache = new Map(); // path -> objectUrl; порядок вставки = recency (LRU)
  const photoNegativeCache = new Map(); // path -> expiresAt
  const photoInFlight = new Map(); // path -> Promise, чтобы параллельные рендеры не дублировали запрос

  function touchLru(map, key) {
    if (!map.has(key)) return;
    const value = map.get(key);
    map.delete(key);
    map.set(key, value);
  }

  function evictPhotoCacheOverflow() {
    while (photoObjectUrlCache.size > PHOTO_CACHE_LIMIT) {
      const oldestKey = photoObjectUrlCache.keys().next().value;
      const objectUrl = photoObjectUrlCache.get(oldestKey);
      photoObjectUrlCache.delete(oldestKey);
      try { URL.revokeObjectURL(objectUrl); } catch { /* уже отозван — не критично */ }
    }
  }

  async function requestPhotoBlob(path, mediaTypePrefix) {
    const token = getBearerToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let res;
      try {
        const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(8000)
          : undefined;
        res = await fetch(`${API_URL}/photos/read`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ path }),
          ...(signal ? { signal } : {}),
        });
      } catch {
        if (attempt === 0) {
          await sleep(220);
          continue;
        }
        return { success: false, error: 'network_error' };
      }
      if (res.ok) {
        const blob = await res.blob();
        if (!blob?.size || !String(blob.type || '').startsWith(`${mediaTypePrefix}/`)) {
          return { success: false, error: 'invalid_photo_response' };
        }
        return { success: true, blob };
      }
      let json = null;
      try { json = await res.json(); } catch { /* non-JSON error */ }
      if (RETRY_STATUSES.has(res.status) && attempt === 0) {
        await sleep(220);
        continue;
      }
      return {
        success: false,
        error: json?.error || `http_${res.status}`,
        statusCode: res.status,
      };
    }
    return { success: false, error: 'network_error' };
  }

  // `force` — обход обоих кэшей: используется ручным «Повторить», где сигнал
  // от человека важнее короткого отрицательного TTL.
  //
  // Кэш общий для фото и голосовых: пути не пересекаются (у голосовых свой
  // `voice/` сегмент, см. `isMessengerAudioPath` на сервере), а `/photos/read`
  // — один и тот же эндпоинт для обоих, определяет тип по структуре пути.
  async function fetchMediaBlob(path, mediaTypePrefix, { force = false } = {}) {
    if (!path || typeof path !== 'string') return { success: false, error: 'path_required' };
    // Ключ включает тип медиа: пути image/audio на практике не пересекаются
    // (у голосовых свой `voice/` сегмент), но если бы кто-то вызвал
    // `fetchPhotoBlob` и `fetchAudioBlob` для одного и того же пути, общий
    // ключ вернул бы из кэша объект чужого типа без повторной проверки MIME —
    // проверка идёт только при живом сетевом запросе.
    const cacheKey = `${mediaTypePrefix}:${path}`;

    if (!force && photoObjectUrlCache.has(cacheKey)) {
      touchLru(photoObjectUrlCache, cacheKey);
      return { success: true, objectUrl: photoObjectUrlCache.get(cacheKey), cached: true };
    }
    if (!force) {
      const negative = photoNegativeCache.get(cacheKey);
      if (negative) {
        if (negative > Date.now()) {
          return { success: false, error: 'cached_failure', cached: true };
        }
        photoNegativeCache.delete(cacheKey);
      }
    }
    if (!force && photoInFlight.has(cacheKey)) return photoInFlight.get(cacheKey);

    const promise = (async () => {
      const result = await requestPhotoBlob(path, mediaTypePrefix);
      if (result.success) {
        const objectUrl = URL.createObjectURL(result.blob);
        photoObjectUrlCache.set(cacheKey, objectUrl);
        evictPhotoCacheOverflow();
        return { success: true, objectUrl };
      }
      photoNegativeCache.set(cacheKey, Date.now() + PHOTO_NEGATIVE_TTL_MS);
      return result;
    })();
    photoInFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      photoInFlight.delete(cacheKey);
    }
  }

  function fetchPhotoBlob(path, opts) {
    return fetchMediaBlob(path, 'image', opts);
  }

  // Голосовые лежат в бакете тем же способом, что и фото (2026-08-11): раньше
  // публичная ссылка была видна в `attachment.url`, теперь единственный путь —
  // тот же авторизованный `/photos/read`, только с проверкой `audio/*` вместо
  // `image/*`.
  function fetchAudioBlob(path, opts) {
    return fetchMediaBlob(path, 'audio', opts);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Отправить сообщение.
   *   client → curator: { body, intent_type?, intent_payload?, attachments? }
   *   curator → client: { client_id, body, attachments? }
   * attachments (2026-08-11: `url` больше не используется для чтения —
   *   `/photos/upload` его не отдаёт, показ идёт через `path` и
   *   `fetchPhotoBlob`/`fetchAudioBlob`; поле может остаться в старых записях
   *   как мёртвое значение):
   *   image — {type:'image', path, filename?, mime?, width?, height?}
   *   audio — {type:'audio', path, filename?, mime?, duration_ms, size_bytes?, waveform?,
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
   * Поиск по переписке: текст сообщений и расшифровки голосовых.
   *   client: { q, type?, before_ts?, limit? }
   *   curator: { client_id, q, ... }
   * type: image | audio | applied.
   */
  async function searchMessages(opts = {}) {
    const qs = new URLSearchParams();
    qs.set('q', String(opts.q || ''));
    if (opts.client_id) qs.set('client_id', opts.client_id);
    if (opts.type) qs.set('type', opts.type);
    if (opts.before_ts) qs.set('before', opts.before_ts);
    if (opts.limit) qs.set('limit', String(opts.limit));
    return call(`/messages/search?${qs.toString()}`);
  }

  /**
   * Куратор отмечает сообщение внесённым в день.
   * summary — что именно попало в дневник: { items:[{name,grams,kcal}], total, meal_label, meal_time }.
   * applied: false снимает отметку.
   */
  async function setApplied(messageId, summary, applied = true) {
    return call('/messages/set-applied', {
      method: 'POST',
      body: { message_id: messageId, summary: applied ? summary : null, applied },
    });
  }

  /**
   * Чек-лист дня — чего ещё ждём от клиента.
   *   client: { date? }
   *   curator: { client_id, date? }
   * Ответ: { success, date, items: [{key, label, status, due_from?}], completeness }.
   * Правило считается на сервере и общее с напоминаниями, поэтому клиент
   * ничего не досчитывает: пришло items: [] — блок просто не показывается.
   */
  async function getDayChecklist(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.client_id) qs.set('client_id', opts.client_id);
    if (opts.date) qs.set('date', opts.date);
    const qstr = qs.toString();
    return call(`/messages/day-checklist${qstr ? '?' + qstr : ''}`);
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
    getDayChecklist,
    searchMessages,
    setApplied,
    markRead,
    setDone,
    setAcked,
    deleteMessage,
    editMessage,
    fetchPhotoBlob,
    fetchAudioBlob,
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
