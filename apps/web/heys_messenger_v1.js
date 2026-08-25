// heys_messenger_v1.js — HEYS Messenger modal (Phase 1: текст).
// Открывается через FAB 💬 у клиента или через ?open_messages=1 (push deep-link).
// Использует HEYS.MessengerAPI (heys_messenger_api_v1.js).
//
// Phase 1: только свободный текст. Phase 2 добавит intent tabs (meal/training/weight)
// и кнопку [Применить] у куратора.

if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    console.warn('[HEYS.Messenger] React/ReactDOM not loaded');
    return;
  }

  const { useState, useEffect, useRef, useCallback } = React;

  const MAX_VOICE_DURATION_MS = 5 * 60 * 1000;
  const MIN_VOICE_BYTES = 1024;
  const THREAD_PAGE_LIMIT = 50;
  const KEYBOARD_CONFIRM_DELAY_MS = 900;
  const KEYBOARD_VIEWPORT_MIN_SHRINK_PX = 96;
  const ACK_CONFIRMING_ERROR = 'Не удалось подтвердить отметку. Проверяем автоматически…';
  const ACK_FAILED_ERROR = 'Не удалось изменить отметку. Повторите попытку.';

  // ── Helpers ──────────────────────────────────────────────────────────
  function formatTime(iso) {
    try {
      const d = new Date(iso);
      const today = new Date();
      const isToday =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      if (isToday) return `${hh}:${mm}`;
      const dd = String(d.getDate()).padStart(2, '0');
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}.${mo} ${hh}:${mm}`;
    } catch {
      return '';
    }
  }

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function formatConsentDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU');
    } catch {
      return '';
    }
  }

  function isAudioAttachment(att) {
    return att?.type === 'audio' || att?.media_type === 'audio' || String(att?.mime || '').startsWith('audio/');
  }

  function normalizeMime(mime) {
    return String(mime || '').split(';')[0].trim().toLowerCase();
  }

  function supportsPilotTranscription(att) {
    const mime = normalizeMime(att?.mime);
    return mime === 'audio/ogg' || mime === 'audio/wav' || mime === 'audio/x-wav';
  }

  function isPendingTranscript(attachment) {
    const status = attachment?.transcript_status || 'none';
    return status === 'queued' || status === 'processing';
  }

  function transcriptText(attachment, options = {}) {
    const status = attachment?.transcript_status || 'none';
    if (status === 'ready' && attachment?.transcript_text) return attachment.transcript_text;
    if (status === 'queued' || status === 'processing') return 'расшифровываем...';
    if (status === 'failed') return 'не удалось расшифровать';
    if (status === 'budget_capped') return 'расшифровка временно отключена';
    if (status === 'unsupported_format') return 'расшифровка недоступна для этого формата';
    if (status === 'consent_required') return 'расшифровка ждёт согласия';
    if (options.transcriptionGranted && supportsPilotTranscription(attachment)) return 'готовим расшифровку...';
    if (options.transcriptionGranted && isAudioAttachment(attachment)) return 'расшифровка недоступна для этого формата';
    return '';
  }

  function attachmentKey(att, idx) {
    return att?.url || att?.path || att?.localPreview || att?.tempId || idx;
  }

  function getPhotoSurface(runtime = {}) {
    const nav = runtime.navigator || global.navigator || {};
    const userAgent = String(nav.userAgent || '');
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
    let standalone = nav.standalone === true;
    try {
      const matchMediaFn = runtime.matchMedia || global.matchMedia;
      standalone = standalone || !!matchMediaFn?.call(global, '(display-mode: standalone)')?.matches;
    } catch { /* keep the navigator-derived value */ }
    return `${mobile ? 'mobile' : 'desktop'}-${standalone ? 'pwa' : 'browser'}`;
  }

  function buildPhotoFailureDiagnostic(details = {}, runtime = {}) {
    const nav = runtime.navigator || global.navigator || {};
    const effectiveType = String(nav.connection?.effectiveType || 'unknown').toLowerCase();
    const safeEffectiveType = ['slow-2g', '2g', '3g', '4g'].includes(effectiveType)
      ? effectiveType
      : 'unknown';
    // 'api' — авторизованный /photos/read, единственный сетевой источник с
    // 2026-08-11; 'local-preview' — ещё не отправленное фото, blob в памяти.
    const safeCandidateType = ['api', 'local-preview'].includes(details.candidateType)
      ? details.candidateType
      : 'unknown';
    const attemptCount = Math.max(1, Math.min(1000, Math.round(Number(details.attemptCount) || 1)));
    return {
      source: 'messenger',
      status: 'degraded',
      screen: 'messenger',
      online: nav.onLine !== false,
      effective_type: safeEffectiveType,
      candidate_type: safeCandidateType,
      attempt_count: attemptCount,
      surface: getPhotoSurface(runtime),
    };
  }

  function tracePhotoLoadFailure(details, runtime) {
    const diagnostic = buildPhotoFailureDiagnostic(details, runtime);
    try {
      HEYS.LogTrace?.event?.('messenger_photo_load_failed', diagnostic, 'warn');
    } catch { /* diagnostics must not affect photo recovery */ }
    return diagnostic;
  }

  function pendingTranscriptKey(messages) {
    const parts = [];
    for (const message of Array.isArray(messages) ? messages : []) {
      const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
      attachments.forEach((att, idx) => {
        if (!isAudioAttachment(att) || !isPendingTranscript(att)) return;
        parts.push(`${message.id || 'message'}:${attachmentKey(att, idx)}`);
      });
    }
    return parts.join('|');
  }

  function compareMessagesAsc(a, b) {
    const byTime = String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
    return byTime || String(a?.id || '').localeCompare(String(b?.id || ''));
  }

  function mergeMessagePage(existing, incoming) {
    const byId = new Map();
    for (const message of Array.isArray(existing) ? existing : []) {
      if (message?.id) byId.set(message.id, message);
    }
    for (const message of Array.isArray(incoming) ? incoming : []) {
      if (message?.id) byId.set(message.id, message);
    }
    return Array.from(byId.values()).sort(compareMessagesAsc);
  }

  function mergeLatestMessagePage(existing, incoming) {
    const latest = (Array.isArray(incoming) ? incoming : []).slice().sort(compareMessagesAsc);
    if (latest.length === 0) return [];
    const oldestLatestTs = latest[0]?.created_at || '';
    const olderLoaded = (Array.isArray(existing) ? existing : []).filter(
      (message) => String(message?.created_at || '') < oldestLatestTs,
    );
    return mergeMessagePage(olderLoaded, latest);
  }

  function getPrependScrollTop(previousHeight, previousTop, nextHeight) {
    return Number(previousTop || 0) + Math.max(0, Number(nextHeight || 0) - Number(previousHeight || 0));
  }

  function getLatestForeignReadTs(messages, viewerRole) {
    const sorted = (Array.isArray(messages) ? messages : []).slice().sort(compareMessagesAsc);
    if (!sorted.some((message) => message?.sender_role !== viewerRole)) return null;
    return sorted[sorted.length - 1]?.created_at || null;
  }

  function isAmbiguousMutationFailure(result) {
    return result?.error === 'network_error' || [500, 502, 503, 504].includes(result?.statusCode);
  }

  function getMessageStateConfirmation(messages, messageId, field, desiredState) {
    const message = (Array.isArray(messages) ? messages : []).find((item) => item?.id === messageId);
    if (!message) return { found: false, confirmed: false, value: null };
    const value = message[field] || null;
    return {
      found: true,
      confirmed: !!value === !!desiredState,
      value,
    };
  }

  function getVerificationBeforeTs(message) {
    const createdAt = Date.parse(message?.created_at || '');
    return Number.isFinite(createdAt) ? new Date(createdAt + 1).toISOString() : null;
  }

  function shouldSendMessageOnEnter(event, coarsePointer = window.matchMedia?.('(pointer: coarse)').matches) {
    if (event?.key !== 'Enter' || event.shiftKey || event.isComposing) return false;
    return !coarsePointer;
  }

  function focusMessageInputFromGesture(event, iosDevice = isIOSDevice(), forceRefocus = false) {
    const input = event?.currentTarget;
    if (!iosDevice || !input || input.disabled || typeof input.focus !== 'function') return false;
    try {
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      if (forceRefocus && document.activeElement === input && typeof input.blur === 'function') {
        input.blur();
      }
      if (document.activeElement !== input) input.focus();
      if (
        forceRefocus &&
        document.activeElement === input &&
        Number.isInteger(selectionStart) &&
        Number.isInteger(selectionEnd) &&
        typeof input.setSelectionRange === 'function'
      ) {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    } catch {
      return false;
    }
    return document.activeElement === input;
  }

  function getKeyboardSurface({
    iosDevice = isIOSDevice(),
    standalone = global.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
  } = {}) {
    if (!iosDevice) return 'other';
    return standalone ? 'ios-pwa' : 'ios-browser';
  }

  function getKeyboardViewportSnapshot({
    viewport = global.visualViewport,
    innerHeight = global.innerHeight,
    clientHeight = document.documentElement?.clientHeight,
  } = {}) {
    const viewportHeight = Number(viewport?.height);
    const layoutHeight = Math.max(
      Number(innerHeight) || 0,
      Number(clientHeight) || 0,
      Number.isFinite(viewportHeight) ? viewportHeight : 0,
    );
    return {
      supported: Number.isFinite(viewportHeight) && viewportHeight > 0,
      viewportHeight: Number.isFinite(viewportHeight) ? viewportHeight : layoutHeight,
      layoutHeight,
      offsetTop: Math.max(0, Number(viewport?.offsetTop) || 0),
    };
  }

  function hasKeyboardViewportEvidence(baseline, current) {
    if (!baseline?.supported || !current?.supported) return false;
    const threshold = Math.max(
      KEYBOARD_VIEWPORT_MIN_SHRINK_PX,
      Math.min(150, Math.round((baseline.viewportHeight || baseline.layoutHeight || 0) * 0.14)),
    );
    const heightShrink = Math.max(0, Number(baseline.viewportHeight) - Number(current.viewportHeight));
    const currentInset = Math.max(
      0,
      Number(current.layoutHeight) - Number(current.viewportHeight) - Number(current.offsetTop || 0),
    );
    return Math.max(heightShrink, currentInset) >= threshold;
  }

  function classifyKeyboardAttempt({
    disabled = false,
    active = false,
    viewportVisible = false,
    viewportSupported = false,
    inputObserved = false,
  } = {}) {
    if (inputObserved || viewportVisible) return null;
    if (disabled) return 'composer_disabled';
    if (!active) return 'focus_rejected';
    if (viewportSupported) return 'viewport_unchanged';
    return 'keyboard_unconfirmed';
  }

  function getKeyboardDiagnostic(code) {
    const details = {
      composer_disabled: {
        detail: 'Поле пока недоступно: сообщение отправляется.',
        supportCode: 'KB-IOS-DISABLED',
      },
      focus_rejected: {
        detail: 'Поле не получило фокус.',
        supportCode: 'KB-IOS-FOCUS',
      },
      viewport_unchanged: {
        detail: 'Поле активно, но показ клавиатуры не удалось подтвердить.',
        supportCode: 'KB-IOS-VIEWPORT',
      },
      keyboard_unconfirmed: {
        detail: 'Поле активно, но показ клавиатуры не удалось подтвердить.',
        supportCode: 'KB-IOS-UNCONFIRMED',
      },
    };
    return details[code] ? { code, ...details[code] } : null;
  }

  async function verifyMessageMutation(api, options) {
    const beforeTs = getVerificationBeforeTs(options.message);
    const response = await api.getThread({
      ...(options.threadOptions || {}),
      ...(beforeTs ? { before_ts: beforeTs } : {}),
      limit: 10,
    });
    if (!response?.success) return { verified: false, confirmed: false, value: null };
    const confirmation = getMessageStateConfirmation(
      response.messages,
      options.message.id,
      options.field,
      options.desiredState,
    );
    return { verified: confirmation.found, ...confirmation };
  }

  function acquireMessageMutation(pendingIds, messageId) {
    if (!pendingIds || !messageId || pendingIds.has(messageId)) return false;
    pendingIds.add(messageId);
    return true;
  }

  function getWaveformBars(att) {
    if (Array.isArray(att?.waveform) && att.waveform.length >= 12) {
      return att.waveform.slice(0, 32).map((v) => Math.max(0.18, Math.min(1, Number(v) || 0.18)));
    }
    const seed = String(att?.path || att?.url || att?.duration_ms || 'voice');
    let acc = 0;
    for (let i = 0; i < seed.length; i++) acc = (acc + seed.charCodeAt(i) * (i + 1)) % 997;
    return Array.from({ length: 28 }, (_, i) => {
      const x = Math.sin((acc + i * 17) * 0.37) + Math.cos((acc + i * 11) * 0.19);
      return 0.22 + Math.abs(x) * 0.34;
    });
  }

  function pickRecorderMime() {
    const candidates = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];
    if (typeof MediaRecorder === 'undefined') return '';
    return candidates.find((mime) => {
      try {
        return MediaRecorder.isTypeSupported(mime);
      } catch {
        return false;
      }
    }) || '';
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('audio_read_failed'));
      reader.readAsDataURL(blob);
    });
  }

  function encodeWavPcm16(audioBuffer, sampleRate = 16000) {
    const channel = audioBuffer.getChannelData(0);
    const dataSize = channel.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function convertBlobToSpeechkitWav(blob) {
    if (!blob || supportsPilotTranscription({ mime: blob.type })) return blob;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioCtx || !OfflineCtx || typeof blob.arrayBuffer !== 'function') return blob;

    const sourceBuffer = await blob.arrayBuffer();
    const audioContext = new AudioCtx();
    try {
      const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
      const targetRate = 16000;
      const targetFrames = Math.max(1, Math.ceil(decoded.duration * targetRate));
      const offline = new OfflineCtx(1, targetFrames, targetRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      return encodeWavPcm16(rendered, targetRate);
    } finally {
      try {
        await audioContext.close();
      } catch { /* ignore */ }
    }
  }

  function isCuratorMode() {
    // Куратор может быть восстановлен из HttpOnly cookie; сначала runtime context.
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
    return false;
  }

  function getCurrentClientId() {
    try {
      return HEYS.currentClientId || localStorage.getItem('heys_last_client_id') || null;
    } catch {
      return null;
    }
  }

  // Единственный источник — авторизованный `/photos/read` по `attachment.path`
  // (2026-08-11, тот же переход, что и у фото): `attachment.url` был публичной
  // ссылкой на бакет и больше не строится сервером. `localUrl` — локальный
  // objectURL ещё не отправленной записи, сети не касается.
  function useReliableAudioSource(attachment) {
    const [source, setSource] = useState('');
    const requestIdRef = useRef(0);
    const path = attachment?.path || null;
    const localUrl = attachment?.localUrl || null;

    const load = useCallback((force = false) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (localUrl) {
        setSource(localUrl);
        return;
      }
      if (!path) {
        setSource('');
        return;
      }
      const fetchBlob = HEYS.MessengerAPI?.fetchAudioBlob;
      if (typeof fetchBlob !== 'function') {
        setSource('');
        return;
      }
      Promise.resolve(fetchBlob(path, { force })).then((result) => {
        if (requestIdRef.current !== requestId) return;
        setSource(result?.success && result.objectUrl ? result.objectUrl : '');
      }).catch(() => {
        if (requestIdRef.current !== requestId) return;
        setSource('');
      });
    }, [path, localUrl]);

    useEffect(() => {
      load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, localUrl]);

    // Blob-URL принадлежит общему кэшу (heys_messenger_api_v1.js), не этому
    // компоненту: тот же голос мог звучать где-то ещё, отзыв — забота LRU.
    return { source, retry: () => load(true) };
  }

  function AudioAttachment({ attachment, compact, transcriptionGranted = false }) {
    const audioRef = useRef(null);
    const { source: resolvedSrc } = useReliableAudioSource(attachment);
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [playError, setPlayError] = useState('');
    const [currentMs, setCurrentMs] = useState(0);
    const [durationMs, setDurationMs] = useState(Number(attachment?.duration_ms || 0));
    const bars = getWaveformBars(attachment);
    const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return undefined;
      const onTime = () => setCurrentMs(audio.currentTime * 1000);
      const onMeta = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDurationMs(audio.duration * 1000);
        }
      };
      const onEnd = () => {
        setPlaying(false);
        setLoading(false);
        setCurrentMs(0);
      };
      const onPause = () => {
        setPlaying(false);
        setLoading(false);
      };
      const onPlay = () => {
        setPlaying(true);
        setLoading(false);
        setPlayError('');
      };
      const onWaiting = () => setLoading(true);
      const onCanPlay = () => setLoading(false);
      const onError = () => {
        setPlaying(false);
        setLoading(false);
        setPlayError('не удалось воспроизвести');
      };
      audio.addEventListener('timeupdate', onTime);
      audio.addEventListener('loadedmetadata', onMeta);
      audio.addEventListener('ended', onEnd);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('play', onPlay);
      audio.addEventListener('waiting', onWaiting);
      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('error', onError);
      return () => {
        audio.pause();
        audio.removeEventListener('timeupdate', onTime);
        audio.removeEventListener('loadedmetadata', onMeta);
        audio.removeEventListener('ended', onEnd);
        audio.removeEventListener('pause', onPause);
        audio.removeEventListener('play', onPlay);
        audio.removeEventListener('waiting', onWaiting);
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
      };
    }, [resolvedSrc]);

    const toggle = async () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (playing) {
        audio.pause();
        return;
      }
      try {
        setLoading(true);
        setPlayError('');
        await audio.play();
        setPlaying(true);
        setLoading(false);
      } catch (err) {
        setPlaying(false);
        setLoading(false);
        setPlayError(err?.name === 'NotAllowedError' ? 'нажмите ещё раз' : 'не удалось воспроизвести');
      }
    };

    const seek = (e) => {
      const audio = audioRef.current;
      if (!audio || !durationMs) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const next = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = (durationMs * next) / 1000;
      setCurrentMs(durationMs * next);
    };

    const transcript = transcriptText(attachment, { transcriptionGranted });
    return React.createElement(
      'div',
      { className: 'msg-audio-block' },
      React.createElement(
        'div',
        {
          className: `msg-audio${compact ? ' msg-audio-compact' : ''}${playing ? ' is-playing' : ''}${playError ? ' is-error' : ''}`,
        },
        React.createElement('audio', {
          ref: audioRef,
          src: resolvedSrc,
          preload: 'metadata',
        }),
        React.createElement('button', {
          type: 'button',
          className: 'msg-audio-play',
          onClick: toggle,
          'aria-label': playing ? 'Пауза' : loading ? 'Загрузка голосового' : 'Воспроизвести голосовое',
        }, loading ? '…' : playing ? '❚❚' : '▶'),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'msg-audio-wave',
            onClick: seek,
            'aria-label': 'Перемотать голосовое',
          },
          bars.map((h, i) =>
            React.createElement('span', {
              key: i,
              className: i / Math.max(1, bars.length - 1) <= progress ? 'is-played' : '',
              style: { height: `${Math.round(12 + h * 22)}px` },
            }),
          ),
        ),
        React.createElement(
          'div',
          { className: 'msg-audio-meta' },
          React.createElement('span', null, formatDuration(currentMs || durationMs)),
          loading && React.createElement('span', { className: 'msg-audio-pending' }, 'загрузка'),
          playError && React.createElement('span', { className: 'msg-audio-error' }, playError),
          attachment.pending && React.createElement('span', { className: 'msg-audio-pending' }, 'загрузка'),
        ),
      ),
      transcript && React.createElement('div', {
        className: `msg-audio-transcript${attachment.transcript_status === 'failed' ? ' is-error' : ''}${attachment.transcript_status === 'queued' || attachment.transcript_status === 'processing' || (!attachment.transcript_status && transcriptionGranted) ? ' is-pending' : ''}`,
      }, transcript),
    );
  }

  // ── Attachments grid ─────────────────────────────────────────────────
  // eager=true для последних сообщений (в viewport при открытии) — грузятся
  // сразу, мгновенный показ. Для остальных — lazy, чтобы не качать тысячи
  // фото из длинной истории при каждом открытии треда.
  //
  // Единственный источник — авторизованный `/photos/read` по `attachment.path`
  // (2026-08-11). Раньше было наоборот: прямая публичная ссылка на бакет была
  // основным источником, а этот путь — запасным на случай ошибки. С уходом
  // публичного доступа к бакету прямая ссылка стала мёртвой по определению, и
  // держать её первым кандидатом означало держать гарантированный первый
  // провал на каждом фото. `attachment.localPreview` остаётся отдельным
  // случаем: это собственный `objectURL` ещё не отправленного фото, локальный,
  // авторизации не требует и кэшем ниже не управляется.
  function useReliablePhotoSource(attachment) {
    const [source, setSource] = useState('');
    const [status, setStatus] = useState('loading');
    const requestIdRef = useRef(0);
    const path = attachment?.path || null;
    const localPreview = attachment?.localPreview || null;

    const load = useCallback((force = false) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (localPreview) {
        setSource(localPreview);
        setStatus('loading');
        return;
      }
      if (!path) {
        setSource('');
        setStatus('failed');
        return;
      }

      setStatus((prev) => (prev === 'loaded' ? 'loading' : prev === 'failed' ? 'retrying' : 'loading'));
      const fetchBlob = HEYS.MessengerAPI?.fetchPhotoBlob;
      if (typeof fetchBlob !== 'function') {
        setStatus('failed');
        return;
      }
      Promise.resolve(fetchBlob(path, { force })).then((result) => {
        if (requestIdRef.current !== requestId) return;
        if (result?.success && result.objectUrl) {
          setSource(result.objectUrl);
          setStatus('loading'); // снимается в 'loaded' самим <img onLoad>
          return;
        }
        tracePhotoLoadFailure({ candidateType: 'api', attemptCount: 1 });
        setSource('');
        setStatus('failed');
      }).catch(() => {
        if (requestIdRef.current !== requestId) return;
        tracePhotoLoadFailure({ candidateType: 'api', attemptCount: 1 });
        setSource('');
        setStatus('failed');
      });
    }, [path, localPreview]);

    useEffect(() => {
      load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, localPreview]);

    // Blob-URL'ы в кэше принадлежат кэшу (LRU в heys_messenger_api_v1.js),
    // а не компоненту: их отзывает вытеснение при переполнении, а не unmount
    // этого рендера. Отзывать здесь нельзя — тот же URL может быть показан
    // в другом месте экрана (лента и лайтбокс одного и того же фото).

    const onLoad = useCallback(() => setStatus('loaded'), []);
    const onError = useCallback(() => {
      // Провал уже отрисованного <img> — отдельно от провала самой загрузки
      // блоба (тот попадает в trace выше, в load()): здесь источник был
      // валиден, но браузер не смог его декодировать/показать.
      tracePhotoLoadFailure({ candidateType: localPreview ? 'local-preview' : 'api', attemptCount: 1 });
      setStatus('failed');
    }, [localPreview]);
    // Ручной повтор обходит короткий отрицательный кэш (30с): человек явно
    // просит попробовать снова, ждать TTL незачем.
    const retry = useCallback(() => load(true), [load]);

    return { source, status, onLoad, onError, retry };
  }

  function MessagePhoto({ attachment, photos, index, onPhotoClick, eager }) {
    const reliable = useReliablePhotoSource(attachment);
    return React.createElement(
      'div',
      {
        className: `msg-attachment-item${reliable.status === 'failed' ? ' is-failed' : ''}`,
        onClick: () => {
          if (reliable.status !== 'failed') onPhotoClick?.(photos, index);
        },
      },
      attachment.pending
        ? React.createElement('div', { className: 'msg-attachment-pending' }, '…')
        : null,
      React.createElement('img', {
        src: reliable.source,
        alt: attachment.filename || 'фото',
        loading: eager ? 'eager' : 'lazy',
        decoding: 'async',
        width: attachment.width || undefined,
        height: attachment.height || undefined,
        onLoad: reliable.onLoad,
        onError: reliable.onError,
        className: reliable.status === 'loaded' ? '' : 'is-loading',
      }),
      reliable.status === 'failed' && React.createElement(
        'div',
        { className: 'msg-attachment-error' },
        React.createElement('span', null, 'Не удалось показать фото'),
        React.createElement('button', {
          type: 'button',
          onClick: (event) => {
            event.stopPropagation();
            reliable.retry();
          },
        }, 'Повторить'),
      ),
    );
  }

  function LightboxPhoto({ attachment }) {
    const reliable = useReliablePhotoSource(attachment);
    return React.createElement('img', {
      src: reliable.source,
      alt: attachment?.filename || 'фото',
      onLoad: reliable.onLoad,
      onError: reliable.onError,
      onClick: (event) => event.stopPropagation(),
    });
  }

  function MessageAttachments({ attachments, onPhotoClick, eager, transcriptionGranted = false }) {
    if (!attachments || attachments.length === 0) return null;
    const audio = attachments.filter(isAudioAttachment);
    const photos = attachments.filter((att) => !isAudioAttachment(att));
    return React.createElement(
      'div',
      { className: 'msg-attachments-wrap' },
      audio.map((att, idx) =>
        React.createElement(AudioAttachment, {
          key: attachmentKey(att, idx),
          attachment: att,
          transcriptionGranted,
        }),
      ),
      photos.length > 0 && React.createElement(
        'div',
        { className: `msg-attachments msg-attachments-count-${Math.min(photos.length, 4)}` },
        photos.map((att, idx) =>
          React.createElement(MessagePhoto, {
            key: attachmentKey(att, idx),
            attachment: att,
            photos,
            index: idx,
            onPhotoClick,
            eager,
          }),
        ),
      ),
    );
  }

  // ── Thread message bubble ────────────────────────────────────────────
  function MessageBubble({
    message,
    viewerRole,
    onToggleAck,
    ackPending = false,
    onDelete,
    onReply,
    onEdit,
    onPhotoClick,
    onOpenDay,
    onApplyRequest,
    highlighted = false,
    eagerPhotos,
    transcriptionGranted = false,
  }) {
    const isMine = message.sender_role === viewerRole;
    const isCurator = viewerRole === 'curator';
    // Курaтор тапает ✓ на client-msg → done_at. Клиент тапает ✓ на curator-msg → acked_at.
    // Унифицированный «ack» в UI с разной семантикой на backend.
    // Зелёный пузырь видят ОБА — как только любая сторона нажала ✓.
    const canMarkAck = !isMine; // ✓ только на чужих сообщениях
    const myAckAt = isCurator ? message.done_at : message.acked_at;
    const theirAckAt = isCurator ? message.acked_at : message.done_at;
    const isMyAcked = !!myAckAt;
    const canDelete = isMine; // каждый удаляет только свои
    const canReply = !isMine; // отвечать можно только на чужие
    const canEdit = isMine && !message.intent_type; // intent редактировать нельзя
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const editTextareaRef = useRef(null);

    // Парсим quote-prefix только для text-сообщений
    const parsed = message.body ? parseQuotedBody(message.body) : { quote: null, reply: '' };
    // Интент — структурированная запись, а не фраза с эмодзи: кикер называет
    // тип, а значение стоит отдельной колонкой и читается с одного взгляда.
    const intentCard = !message.body ? buildIntentCard(message) : null;
    const replyText = message.body ? parsed.reply : '';
    // Под своим сообщением — одна строка состояния вместо голого времени:
    // человеку важно, дошло ли до куратора и попало ли в день, а не просто час
    // отправки. Порядок состояний — от самого позднего к раннему.
    const ownStatus = (() => {
      if (!isMine) return null;
      if (message.applied_at) {
        return { key: 'applied', icon: 'check', text: `Внесено в день · ${formatTime(message.applied_at)}` };
      }
      if (theirAckAt) {
        const label = isCurator ? 'Принято' : 'Обработано';
        return { key: 'acked', icon: 'check', text: `${label} · ${formatTime(theirAckAt)}` };
      }
      if (message.seen_at && !isCurator) {
        return { key: 'seen', dot: true, text: `Куратор смотрит · ${formatTime(message.seen_at)}` };
      }
      return { key: 'sent', text: `Отправлено · ${formatTime(message.created_at)}` };
    })();

    // Зелёный пузырь ушёл: статус теперь метка в мета-строке, а не заливка
    // всего сообщения — она спорила с фото и текстом внутри.
    const bubbleClasses = [
      'msg-bubble',
      isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs',
      message.queued ? 'msg-bubble-queued' : '',
    ].filter(Boolean).join(' ');

    const handleDeleteClick = () => {
      if (!canDelete) return;
      onDelete?.(message);
    };

    const handleEditStart = () => {
      if (!canEdit) return;
      // При входе в edit-режим берём parsed.reply (без quote) — пользователь
      // редактирует свой текст, а не цитату на которую отвечал.
      setEditValue(parsed.reply || message.body || '');
      setEditing(true);
      setTimeout(() => {
        const ta = editTextareaRef.current;
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }, 30);
    };

    const handleEditCancel = () => {
      setEditing(false);
      setEditValue('');
    };

    const handleEditSave = async () => {
      const trimmed = editValue.trim();
      if (!trimmed || savingEdit) return;
      // Восстанавливаем quote-prefix если был
      const finalBody = parsed.quote
        ? `${parsed.quote.split('\n').map((l) => `> ${l}`).join('\n')}\n\n${trimmed}`
        : trimmed;
      if (finalBody === message.body) {
        // Без изменений — просто выходим
        handleEditCancel();
        return;
      }
      setSavingEdit(true);
      const ok = await onEdit?.(message, finalBody);
      setSavingEdit(false);
      if (ok) handleEditCancel();
    };

    const handleEditKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); handleEditCancel(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
    };

    // Свои действия («Изменить», «Удалить») не висят на экране постоянно:
    // на десктопе их открывает hover через CSS, на тач-устройствах —
    // долгое нажатие, потому что hover там не существует.
    const [touchActionsOpen, setTouchActionsOpen] = useState(false);
    const longPressTimerRef = useRef(null);

    const cancelLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const handleTouchStart = () => {
      if (!canDelete && !canEdit) return;
      cancelLongPress();
      longPressTimerRef.current = setTimeout(() => setTouchActionsOpen(true), HEYS.longPress?.MS ?? 350);
    };

    useEffect(() => cancelLongPress, []);

    const ackAction = canMarkAck
      ? React.createElement('button', {
          type: 'button',
          key: 'ack',
          className: `msg-action msg-action--ack${isMyAcked ? ' is-active' : ''}`,
          onClick: () => onToggleAck?.(message),
          disabled: ackPending,
          'aria-busy': ackPending ? 'true' : undefined,
          'aria-label': ackPending
            ? 'Сохраняем отметку'
            : isMyAcked ? 'Снять отметку' : (isCurator ? 'Отметить как обработанное' : 'Принять'),
        },
          isMyAcked ? React.createElement(Icon, { name: 'check', size: 11, strokeWidth: 1.8 }) : null,
          ackPending
            ? 'Сохраняем…'
            : isMyAcked
              ? (isCurator ? 'Обработано' : 'Принято')
              : (isCurator ? 'Обработать' : 'Принять'),
        )
      : null;

    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
    const bubble = React.createElement(
      'div',
      { className: bubbleClasses },
      parsed.quote && !editing &&
        React.createElement('div', { className: 'msg-quote' }, parsed.quote),
      !editing && hasAttachments &&
        React.createElement(MessageAttachments, {
          attachments: message.attachments,
          onPhotoClick,
          eager: eagerPhotos,
          transcriptionGranted,
        }),
      editing
        ? React.createElement(
            'div',
            { className: 'msg-edit' },
            React.createElement('textarea', {
              className: 'msg-edit-textarea',
              ref: editTextareaRef,
              value: editValue,
              onChange: (e) => setEditValue(e.target.value),
              onKeyDown: handleEditKeyDown,
              disabled: savingEdit,
              maxLength: 2000,
              rows: 2,
            }),
            React.createElement(
              'div',
              { className: 'msg-edit-actions' },
              React.createElement('button', {
                type: 'button',
                className: 'msg-edit-cancel',
                onClick: handleEditCancel,
                disabled: savingEdit,
              }, 'Отмена'),
              React.createElement('button', {
                type: 'button',
                className: 'msg-edit-save',
                onClick: handleEditSave,
                disabled: savingEdit || !editValue.trim(),
              }, savingEdit ? '...' : 'Сохранить'),
            ),
          )
        : intentCard
          ? React.createElement(IntentCard, { card: intentCard })
          : replyText &&
              React.createElement('div', { className: 'msg-body' }, replyText),
    );

    // Мета живёт под пузырём, а не внутри: статусы, время и действия — это
    // не часть сообщения, и в пузыре они спорили с самим текстом.
    if (message.queued) {
      return React.createElement(
        'div',
        { className: 'msg-row msg-row-mine' },
        bubble,
        React.createElement(
          'div',
          { className: 'msg-meta-row' },
          React.createElement('span', { className: 'msg-meta' }, 'В очереди…'),
        ),
      );
    }

    const metaRow = !editing && React.createElement(
      'div',
      { className: `msg-meta-row${touchActionsOpen ? ' is-actions-open' : ''}` },
      ownStatus
        ? React.createElement(
            'span',
            { className: `msg-status msg-status--${ownStatus.key}` },
            ownStatus.dot && React.createElement('span', { className: 'msg-status__dot', 'aria-hidden': 'true' }),
            ownStatus.icon && React.createElement(Icon, { name: ownStatus.icon, size: 11, strokeWidth: 1.8 }),
            ownStatus.text,
          )
        : React.createElement('span', { className: 'msg-meta' }, formatTime(message.created_at)),
      message.edited_at &&
        React.createElement('span', {
          className: 'msg-edited-marker',
          title: `Изменено ${formatTime(message.edited_at)}`,
        }, 'изм.'),
      canReply && React.createElement('button', {
        type: 'button',
        className: 'msg-action',
        onClick: () => onReply?.(message),
        'aria-label': 'Ответить с цитатой',
      }, 'Ответить'),
      // Разбор — главное действие куратора, поэтому стоит рядом с ответом.
      isCurator && !isMine && onApplyRequest && React.createElement('button', {
        type: 'button',
        className: 'msg-action',
        onClick: () => onApplyRequest(message),
      }, message.applied_at ? 'Изменить разбор' : 'Разобрать'),
      ackAction,
      canEdit && React.createElement('button', {
        type: 'button',
        className: 'msg-action msg-action--own',
        onClick: handleEditStart,
        'aria-label': 'Редактировать сообщение',
      }, 'Изменить'),
      canDelete && React.createElement('button', {
        type: 'button',
        className: 'msg-action msg-action--own',
        onClick: handleDeleteClick,
        'aria-label': 'Удалить сообщение',
      }, 'Удалить'),
    );

    return React.createElement(
      'div',
      {
        className: [
          'msg-row',
          isMine ? 'msg-row-mine' : 'msg-row-theirs',
          highlighted ? 'is-highlighted' : '',
        ].filter(Boolean).join(' '),
        'data-message-id': message.id,
        onTouchStart: handleTouchStart,
        onTouchEnd: cancelLongPress,
        onTouchMove: cancelLongPress,
        onTouchCancel: cancelLongPress,
      },
      bubble,
      metaRow,
      // Карточка идёт сразу за сообщением, из которого куратор собрал приём.
      message.applied_summary && React.createElement(AppliedDayCard, {
        summary: message.applied_summary,
        onOpenDay,
      }),
    );
  }

  // ── Date separator ───────────────────────────────────────────────────
  function DateSeparator({ label }) {
    return React.createElement(
      'div',
      { className: 'msg-date-divider' },
      React.createElement('span', { className: 'msg-date-label' }, label),
    );
  }

  // Группа дня для разделителя: "Сегодня" / "Вчера" / "27 мая".
  function formatDayLabel(iso) {
    try {
      const d = new Date(iso);
      const today = new Date();
      const yest = new Date(today);
      yest.setDate(today.getDate() - 1);
      const sameDay = (a, b) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
      if (sameDay(d, today)) return 'Сегодня';
      if (sameDay(d, yest)) return 'Вчера';
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const dayLabel = `${d.getDate()} ${months[d.getMonth()]}`;
      // Год только если не текущий
      if (d.getFullYear() !== today.getFullYear()) {
        return `${dayLabel} ${d.getFullYear()}`;
      }
      return dayLabel;
    } catch {
      return '';
    }
  }

  function dayKey(iso) {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    } catch {
      return '';
    }
  }

  // ── Quote parsing ────────────────────────────────────────────────────
  // Body может начинаться с цитаты в формате "> текст\n> текст\n\nответ".
  // Парсим в { quote, reply }. Если нет цитаты — { quote: null, reply: body }.
  function parseQuotedBody(body) {
    if (!body || typeof body !== 'string') return { quote: null, reply: body || '' };
    const match = body.match(/^((?:>[^\n]*\n)+)\n([\s\S]*)$/);
    if (!match) return { quote: null, reply: body };
    const quoteLines = match[1]
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .filter((l) => l.length > 0);
    return { quote: quoteLines.join('\n'), reply: match[2] };
  }

  function shortPreview(text, max = 60) {
    if (!text) return '';
    const oneLine = String(text).replace(/\n+/g, ' ').trim();
    return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
  }

  // Превью для quote-reply: возвращает body или, если intent, человеческое описание
  function messagePreview(message) {
    if (message.body) return shortPreview(message.body);
    if (message.intent_type === 'meal') {
      const p = message.intent_payload || {};
      return `Приём пищи: ${p.product_name || '?'}, ${p.grams || '?'} г`;
    }
    if (message.intent_type === 'training') {
      const p = message.intent_payload || {};
      return `Тренировка: ${p.training_type || '?'}, ${p.duration_min || '?'} мин`;
    }
    if (message.intent_type === 'weight') {
      return `Вес: ${message.intent_payload?.weight_kg ?? '?'} кг`;
    }
    if (Array.isArray(message.attachments) && message.attachments.some(isAudioAttachment)) {
      return 'Голосовое сообщение';
    }
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      return 'Вложение';
    }
    return '...';
  }

  function DeleteConfirmDialog({ message, busy, onCancel, onConfirm }) {
    const cancelRef = useRef(null);
    useEffect(() => {
      const prevActive = document.activeElement;
      setTimeout(() => cancelRef.current?.focus(), 30);
      const onKeyDown = (e) => {
        if (e.key === 'Escape' && !busy) {
          e.preventDefault();
          onCancel?.();
        }
      };
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        if (prevActive && typeof prevActive.focus === 'function') {
          try { prevActive.focus(); } catch { /* ignore */ }
        }
      };
    }, [busy, onCancel]);

    const preview = messagePreview(message);

    return React.createElement(
      'div',
      {
        className: 'messenger-confirm-backdrop',
        onMouseDown: (e) => {
          if (e.target === e.currentTarget && !busy) onCancel?.();
        },
      },
      React.createElement(
        'div',
        {
          className: 'messenger-confirm-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'messenger-delete-title',
          'aria-describedby': 'messenger-delete-desc',
        },
        React.createElement(
          'div',
          { className: 'messenger-confirm-icon', 'aria-hidden': 'true' },
          React.createElement(Icon, { name: 'trash', size: 18 }),
        ),
        React.createElement('h3', { id: 'messenger-delete-title', className: 'messenger-confirm-title' }, 'Удалить сообщение?'),
        React.createElement(
          'p',
          { id: 'messenger-delete-desc', className: 'messenger-confirm-text' },
          'Куратор больше его не увидит. Если оно уже внесено в день, запись в дневнике останется.',
        ),
        preview && preview !== '...' &&
          React.createElement('div', { className: 'messenger-confirm-preview' }, preview),
        React.createElement(
          'div',
          { className: 'messenger-confirm-actions' },
          React.createElement('button', {
            type: 'button',
            ref: cancelRef,
            className: 'messenger-confirm-cancel',
            onClick: onCancel,
            disabled: busy,
          }, 'Отмена'),
          React.createElement('button', {
            type: 'button',
            className: 'messenger-confirm-delete',
            onClick: onConfirm,
            disabled: busy,
          }, busy ? 'Удаляю...' : 'Удалить'),
        ),
      ),
    );
  }

  // ── Collapse старых дней ─────────────────────────────────────────────
  // Сколько последних дней показываем сразу. Всё что старее — за кнопкой.
  const RECENT_DAYS_LIMIT = 7;

  // Возвращает ISO-timestamp cutoff: всё с created_at < cutoff = "старое".
  function getOldCutoffISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (RECENT_DAYS_LIMIT - 1)); // -1 чтобы 7 дней включая сегодня
    return d.toISOString();
  }

  // ── Photo compress (copy из heys_add_product_step_v1.js:3025-3066) ──
  // Принимает File, возвращает base64 data URL после resize до 800px (long side)
  // и JPEG re-encoding с quality 0.7.
  async function compressImageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 600px + JPEG q=0.6: ~40-80KB на типичное chat-фото вместо 80-150KB.
          // Для пузыря в треде (max-width 320px) 600px = 2x retina, читаемо.
          // Lightbox показывает то же фото на весь экран — на mobile 600px
          // покрывает 100% ширины с небольшим скейлом, заметной деградации нет.
          const MAX_SIDE = 600;
          let { width, height } = img;
          if (width > height) {
            if (width > MAX_SIDE) {
              height = Math.round((height * MAX_SIDE) / width);
              width = MAX_SIDE;
            }
          } else if (height > MAX_SIDE) {
            width = Math.round((width * MAX_SIDE) / height);
            height = MAX_SIDE;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // WebP даёт ~30% меньше веса при том же качестве. Browser support
          // 96%+ (Safari 14+, все остальные давно). Fallback на JPEG если
          // canvas.toDataURL вернёт «data:image/png» (т.е. WebP не поддержан).
          let base64 = canvas.toDataURL('image/webp', 0.6);
          if (!base64.startsWith('data:image/webp')) {
            base64 = canvas.toDataURL('image/jpeg', 0.6);
          }
          resolve({ base64, width, height });
        };
        img.onerror = () => reject(new Error('image_load_failed'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('file_read_failed'));
      reader.readAsDataURL(file);
    });
  }

  function getThreadSubtitle(messages, loading) {
    if (loading) return 'История загружается';
    if (!Array.isArray(messages) || messages.length === 0) return 'Диалог пока пуст';
    const last = messages[messages.length - 1];
    return `Последнее сообщение ${formatTime(last?.created_at)}`;
  }

  function formatMessengerError(error) {
    const value = String(error || '').trim();
    if (!value) return '';
    if (/[А-Яа-яЁё]/.test(value)) return value;
    if (value === 'network_error') {
      return 'Не удалось связаться с сервером. Повторите попытку.';
    }
    return 'Не удалось выполнить действие. Повторите попытку.';
  }

  // ── Иконки ───────────────────────────────────────────────────────────
  // Редизайн отказывается от эмодзи (📷 🎙 ➤ ✕ 🗑 ↩ ✎ 💬): они по-разному
  // выглядят на разных платформах и не подчиняются цвету темы. Вместо них —
  // один stroke-набор 1.5px, который наследует currentColor.

  const ICON_PATHS = {
    close: 'M5 5l10 10M15 5L5 15',
    more: 'M10 5.4v.01M10 10v.01M10 14.6v.01',
    camera: 'M3 7.5A1.5 1.5 0 014.5 6h1.8l1-1.7h3.4l1 1.7h1.8A1.5 1.5 0 0115 6.5v7A1.5 1.5 0 0113.5 15h-9A1.5 1.5 0 013 13.5v-6zM9 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    mic: 'M10 3.5a2 2 0 012 2v4.5a2 2 0 11-4 0V5.5a2 2 0 012-2zM5.5 9.5a4.5 4.5 0 009 0M10 14.5V17',
    send: 'M10 16V4M10 4L5 9M10 4l5 5',
    check: 'M4 10.5l3.5 3.5L16 5.5',
    clock: 'M10 5.5V10l2.8 1.6M10 17a7 7 0 110-14 7 7 0 010 14z',
    chat: 'M17 9.5c0 3.3-3.1 6-7 6-.8 0-1.6-.1-2.3-.3L3.5 16.5l1.2-3.1A5.7 5.7 0 013 9.5c0-3.3 3.1-6 7-6s7 2.7 7 6z',
    trash: 'M4 6h12M8.5 6V4.5h3V6M6 6l.7 9.2a1.3 1.3 0 001.3 1.3h4a1.3 1.3 0 001.3-1.3L14 6M8.5 9v4.5M11.5 9v4.5',
  };

  function Icon({ name, size = 18, className = '', strokeWidth = 1.5 }) {
    const d = ICON_PATHS[name];
    if (!d) return null;
    return React.createElement(
      'svg',
      {
        className: ['messenger-icon', className].filter(Boolean).join(' '),
        width: size,
        height: size,
        viewBox: '0 0 20 20',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      React.createElement('path', { d }),
    );
  }

  // ── Шапка ────────────────────────────────────────────────────────────

  function resolveCuratorName() {
    const configured = HEYS.config?.curatorDisplayName
      || HEYS.config?.curatorName
      || HEYS.curatorDisplayName;
    return String(configured || '').trim() || 'Антон';
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  }

  function MessengerHeader({ isCurator, subtitle, menuItems, offline, onClose }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const title = isCurator ? 'Сообщения с клиентом' : `Куратор ${resolveCuratorName()}`;
    const items = (menuItems || []).filter(Boolean);

    useEffect(() => {
      if (!menuOpen) return undefined;
      const onDocumentPointerDown = (event) => {
        if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
      };
      const onEscape = (event) => {
        if (event.key === 'Escape') setMenuOpen(false);
      };
      document.addEventListener('pointerdown', onDocumentPointerDown);
      document.addEventListener('keydown', onEscape);
      return () => {
        document.removeEventListener('pointerdown', onDocumentPointerDown);
        document.removeEventListener('keydown', onEscape);
      };
    }, [menuOpen]);

    return React.createElement(
      'div',
      { className: 'messenger-header' },
      !isCurator && React.createElement(
        'div',
        { className: 'messenger-avatar', 'aria-hidden': 'true' },
        getInitials(resolveCuratorName()),
      ),
      React.createElement(
        'div',
        { className: 'messenger-title-stack' },
        React.createElement('div', { className: 'messenger-title' }, title),
        React.createElement(
          'div',
          { className: 'messenger-subtitle' },
          React.createElement('span', {
            className: `messenger-subtitle__dot${offline ? ' is-offline' : ''}`,
            'aria-hidden': 'true',
          }),
          subtitle,
        ),
      ),
      React.createElement(
        'div',
        { className: 'messenger-header-actions', ref: menuRef },
        items.length > 0 && React.createElement(
          'button',
          {
            type: 'button',
            className: `messenger-header-button${menuOpen ? ' is-open' : ''}`,
            'aria-label': 'Ещё',
            'aria-expanded': menuOpen ? 'true' : 'false',
            onClick: () => setMenuOpen((open) => !open),
          },
          React.createElement(Icon, { name: 'more', strokeWidth: 2.4 }),
        ),
        React.createElement(
          'button',
          { type: 'button', className: 'messenger-header-button messenger-close', onClick: onClose, 'aria-label': 'Закрыть' },
          React.createElement(Icon, { name: 'close' }),
        ),
        menuOpen && React.createElement(
          'div',
          { className: 'messenger-header-menu', role: 'menu' },
          items.map((item) => React.createElement(
            'button',
            {
              key: item.key,
              type: 'button',
              role: 'menuitem',
              className: 'messenger-header-menu__item',
              disabled: !!item.disabled,
              onClick: () => {
                setMenuOpen(false);
                item.onSelect?.();
              },
            },
            React.createElement('span', { className: 'messenger-header-menu__label' }, item.label),
            item.hint && React.createElement('span', { className: 'messenger-header-menu__hint' }, item.hint),
          )),
        ),
      ),
    );
  }

  // ── Инбокс куратора ──────────────────────────────────────────────────
  // Панель разбора появилась раньше инбокса, и найти клиента с неразобранным
  // сообщением было нечем: куратор переключался через общий список приложения.

  const INBOX_FILTERS = [
    { key: 'pending', label: 'Ждут разбора' },
    { key: 'all', label: 'Все' },
    { key: 'silent', label: 'Молчат 3 дня' },
  ];
  const SILENT_DAYS = 3;
  const WAITING_WARN_MINUTES = 30;

  /** Имя клиента берём из уже загруженного списка куратора — инбокс его не отдаёт. */
  function readCuratorClients() {
    try {
      const raw = localStorage.getItem('heys_clients');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function clientNameById(clients, clientId) {
    const found = clients.find((c) => String(c?.id) === String(clientId));
    return found?.name || found?.first_name || 'Клиент';
  }

  function minutesSince(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
  }

  function formatWaiting(minutes) {
    if (minutes == null) return null;
    if (minutes < 60) return `Ждёт ${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Ждёт ${hours} ч`;
    return `Ждёт ${Math.floor(hours / 24)} дн`;
  }

  function previewText(preview) {
    if (!preview) return 'Нет сообщений';
    if (preview.body) return preview.body;
    if (preview.intent_type === 'meal') return 'Приём пищи';
    if (preview.intent_type === 'training') return 'Тренировка';
    if (preview.intent_type === 'weight') return 'Вес';
    return 'Вложение';
  }

  function sortInbox(rows) {
    // Сначала те, кого ждут дольше всех: неразобранное важнее свежего.
    return [...rows].sort((a, b) => {
      const aPending = (a.unread_count || 0) > 0;
      const bPending = (b.unread_count || 0) > 0;
      if (aPending !== bPending) return aPending ? -1 : 1;
      if (aPending && bPending) {
        return new Date(a.last_message_at || 0) - new Date(b.last_message_at || 0);
      }
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    });
  }

  function filterInbox(rows, filter) {
    if (filter === 'pending') return rows.filter((r) => (r.unread_count || 0) > 0);
    if (filter === 'silent') {
      const cutoff = Date.now() - SILENT_DAYS * 24 * 60 * 60 * 1000;
      return rows.filter((r) => !r.last_message_at || new Date(r.last_message_at).getTime() < cutoff);
    }
    return rows;
  }

  function CuratorInbox({ rows, activeClientId, onSelect }) {
    const [filter, setFilter] = useState('pending');
    const clients = readCuratorClients();
    const pendingCount = rows.filter((r) => (r.unread_count || 0) > 0).length;
    const visible = sortInbox(filterInbox(rows, filter));

    return React.createElement(
      'div',
      { className: 'messenger-inbox' },
      React.createElement(
        'div',
        { className: 'messenger-inbox__head' },
        React.createElement('div', { className: 'messenger-inbox__title' }, 'Сообщения клиентов'),
        React.createElement(
          'div',
          { className: 'messenger-inbox__subtitle' },
          `${pendingCount} ${pendingCount === 1 ? 'ждёт' : 'ждут'} разбора · ${rows.length} ${rows.length === 1 ? 'клиент' : 'клиентов'}`,
        ),
      ),
      React.createElement(
        'div',
        { className: 'messenger-inbox__filters' },
        INBOX_FILTERS.map((item) => React.createElement('button', {
          key: item.key,
          type: 'button',
          className: `messenger-inbox__filter${filter === item.key ? ' is-active' : ''}`,
          onClick: () => setFilter(item.key),
        }, item.key === 'pending' ? `${item.label} · ${pendingCount}` : item.label)),
      ),
      React.createElement(
        'div',
        { className: 'messenger-inbox__list' },
        visible.length === 0 && React.createElement(
          'div',
          { className: 'messenger-inbox__empty' },
          filter === 'pending' ? 'Всё разобрано.' : 'Пусто.',
        ),
        visible.map((row) => {
          const pending = (row.unread_count || 0) > 0;
          const waiting = pending ? formatWaiting(minutesSince(row.last_message_at)) : null;
          const overdue = pending && (minutesSince(row.last_message_at) || 0) >= WAITING_WARN_MINUTES;
          return React.createElement(
            'button',
            {
              key: row.client_id,
              type: 'button',
              className: [
                'messenger-inbox__row',
                String(row.client_id) === String(activeClientId) ? 'is-active' : '',
                pending ? '' : 'is-done',
              ].filter(Boolean).join(' '),
              onClick: () => onSelect?.(row.client_id),
            },
            React.createElement(
              'span',
              { className: 'messenger-inbox__avatar' },
              getInitials(clientNameById(clients, row.client_id)),
              pending && React.createElement('span', { className: 'messenger-inbox__badge' },
                row.unread_count > 99 ? '99+' : String(row.unread_count)),
            ),
            React.createElement(
              'span',
              { className: 'messenger-inbox__body' },
              React.createElement(
                'span',
                { className: 'messenger-inbox__line' },
                React.createElement('span', { className: 'messenger-inbox__name' }, clientNameById(clients, row.client_id)),
                row.last_message_at && React.createElement('span', { className: 'messenger-inbox__time' }, formatTime(row.last_message_at)),
              ),
              React.createElement('span', { className: 'messenger-inbox__preview' }, previewText(row.last_message_preview)),
              (waiting || !pending) && React.createElement(
                'span',
                { className: 'messenger-inbox__tags' },
                waiting && React.createElement('span', {
                  className: `messenger-inbox__tag${overdue ? ' is-overdue' : ''}`,
                }, waiting),
                !pending && row.last_message_at && React.createElement('span', {
                  className: 'messenger-inbox__tag is-done',
                }, 'Разобрано'),
              ),
            ),
          );
        }),
      ),
    );
  }

  // ── Офлайн-очередь и черновик ────────────────────────────────────────
  // Без сети сообщение раньше просто падало с ошибкой, и написанный текст
  // терялся. Теперь оно ложится в очередь на устройстве и уходит само, когда
  // сеть вернётся. Ключи скоупятся клиентом: на общем устройстве очередь
  // одного не должна уезжать от имени другого.

  const QUEUE_KEY_PREFIX = 'heys_messenger_queue';
  const DRAFT_KEY_PREFIX = 'heys_messenger_draft';
  const QUEUE_LIMIT = 20;

  function scopedMessengerKey(prefix, clientId) {
    const cid = clientId || getCurrentClientId();
    return cid ? `${prefix}_${String(cid).toLowerCase()}` : prefix;
  }

  function readQueue(clientId) {
    try {
      const raw = localStorage.getItem(scopedMessengerKey(QUEUE_KEY_PREFIX, clientId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function writeQueue(clientId, queue) {
    const key = scopedMessengerKey(QUEUE_KEY_PREFIX, clientId);
    try {
      if (!queue || queue.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(queue.slice(-QUEUE_LIMIT)));
    } catch { /* приватный режим — очередь живёт только в памяти вкладки */ }
  }

  // Фото в черновике: сжатый base64 уже есть в pendingPhotos до отправки,
  // поэтому снимок переживает перезагрузку так же, как текст. Лимиты жёсткие —
  // localStorage общий, и переполнить его значит сломать соседние ключи.
  const MAX_DRAFT_PHOTOS = 3;
  const MAX_DRAFT_PHOTO_BYTES = 1_500_000;

  function draftPhotoPayload(photo) {
    return {
      tempId: photo.tempId,
      localPreview: photo.localPreview,
      filename: photo.filename,
      width: photo.width,
      height: photo.height,
      mime: photo.mime,
      // Загруженное фото уже на сервере — храним ссылку, base64 нужен только
      // как превью.
      ...(photo.url ? { url: photo.url, path: photo.path } : {}),
      status: photo.status === 'done' ? 'done' : 'pending-upload',
    };
  }

  function readDraft(clientId) {
    try {
      const raw = localStorage.getItem(scopedMessengerKey(DRAFT_KEY_PREFIX, clientId));
      if (!raw) return { text: '', photos: [] };
      // До появления фото черновик был простой строкой.
      if (!raw.startsWith('{')) return { text: raw, photos: [] };
      const parsed = JSON.parse(raw);
      return {
        text: typeof parsed?.text === 'string' ? parsed.text : '',
        photos: Array.isArray(parsed?.photos) ? parsed.photos : [],
      };
    } catch { return { text: '', photos: [] }; }
  }

  function writeDraft(clientId, { text = '', photos = [] } = {}) {
    const key = scopedMessengerKey(DRAFT_KEY_PREFIX, clientId);
    try {
      if (!text && photos.length === 0) {
        localStorage.removeItem(key);
        return { saved: true, photosSaved: 0 };
      }
      const kept = [];
      let bytes = 0;
      for (const photo of photos.slice(0, MAX_DRAFT_PHOTOS)) {
        const size = (photo?.localPreview || '').length;
        if (bytes + size > MAX_DRAFT_PHOTO_BYTES) break;
        bytes += size;
        kept.push(draftPhotoPayload(photo));
      }
      localStorage.setItem(key, JSON.stringify({ text, photos: kept }));
      return { saved: true, photosSaved: kept.length };
    } catch {
      // Квота кончилась — текст важнее снимков, сохраняем хотя бы его.
      try {
        localStorage.setItem(key, JSON.stringify({ text, photos: [] }));
        return { saved: true, photosSaved: 0 };
      } catch { return { saved: false, photosSaved: 0 }; }
    }
  }

  function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /** Ошибка транспорта, а не отказ сервера: такое сообщение имеет смысл повторить. */
  function isNetworkFailure(res) {
    return !res || res.error === 'network_error' || res.statusCode === 0;
  }

  function queuedToOptimistic(entry, viewerRole) {
    return {
      id: `queued:${entry.request_id}`,
      sender_role: viewerRole,
      body: entry.payload?.body || null,
      attachments: entry.payload?.attachments || [],
      created_at: entry.created_at,
      queued: true,
    };
  }

  function OfflineQueueBar({ count, hasDraft, sending, onRetry }) {
    if (count === 0 && !hasDraft) return null;
    const parts = [];
    if (count > 0) parts.push(`${count} ${pluralMessages(count)}`);
    if (hasDraft) parts.push('черновик');
    return React.createElement(
      'div',
      { className: 'messenger-offline-bar', role: 'status' },
      React.createElement('span', { className: 'messenger-offline-bar__dot', 'aria-hidden': 'true' }),
      React.createElement(
        'span',
        { className: 'messenger-offline-bar__text' },
        isOffline() ? 'Нет сети. ' : '',
        `${parts.join(' и ')} ${count > 0 || hasDraft ? 'сохранены на устройстве.' : ''}`.trim(),
      ),
      count > 0 && React.createElement('button', {
        type: 'button',
        className: 'messenger-offline-bar__retry',
        onClick: onRetry,
        disabled: sending,
      }, sending ? 'Отправляю…' : 'Повторить'),
    );
  }

  function pluralMessages(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'сообщение';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'сообщения';
    return 'сообщений';
  }

  // ── Поиск по переписке ───────────────────────────────────────────────
  // История грузится страницами по 50, и «Показать ранее» — единственная
  // навигация. Поиск ищет и по расшифровкам голосовых: иначе голосовые
  // неотличимы друг от друга.

  const SEARCH_FILTERS = [
    { key: null, label: 'Всё' },
    { key: 'image', label: 'С фото' },
    { key: 'audio', label: 'Голосовые' },
    { key: 'applied', label: 'Внесённые' },
  ];
  const SEARCH_MIN_QUERY = 2;
  const SEARCH_DEBOUNCE_MS = 300;

  /** Текст, по которому ищем: тело сообщения либо расшифровка голосового. */
  function searchableText(message) {
    if (message?.body) return message.body;
    const transcript = (message?.attachments || [])
      .map((att) => att?.transcript_text)
      .find(Boolean);
    return transcript || '';
  }

  /** Кусок текста вокруг совпадения — целую простыню в строку результата не влезет. */
  function buildSnippet(text, query, radius = 40) {
    const source = String(text || '');
    const at = source.toLowerCase().indexOf(String(query || '').toLowerCase());
    if (at < 0) return source.slice(0, radius * 2);
    const start = Math.max(0, at - radius);
    const end = Math.min(source.length, at + query.length + radius);
    return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
  }

  /** Разбивка сниппета на части для подсветки — без dangerouslySetInnerHTML. */
  function splitByMatch(snippet, query) {
    const source = String(snippet || '');
    const needle = String(query || '');
    if (!needle) return [{ text: source, match: false }];
    const parts = [];
    let cursor = 0;
    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    for (;;) {
      const at = lowerSource.indexOf(lowerNeedle, cursor);
      if (at < 0) break;
      if (at > cursor) parts.push({ text: source.slice(cursor, at), match: false });
      parts.push({ text: source.slice(at, at + needle.length), match: true });
      cursor = at + needle.length;
    }
    if (cursor < source.length) parts.push({ text: source.slice(cursor), match: false });
    return parts;
  }

  function SearchPanel({ isCurator, curatorViewClientId, onClose, onJump }) {
    const [query, setQuery] = useState('');
    const [type, setType] = useState(null);
    const [results, setResults] = useState([]);
    const [state, setState] = useState('idle');
    const inputRef = useRef(null);

    useEffect(() => {
      setTimeout(() => inputRef.current?.focus(), 30);
    }, []);

    useEffect(() => {
      const trimmed = query.trim();
      if (trimmed.length < SEARCH_MIN_QUERY) {
        setResults([]);
        setState('idle');
        return undefined;
      }
      let cancelled = false;
      setState('loading');
      const timer = setTimeout(() => {
        HEYS.MessengerAPI.searchMessages({
          q: trimmed,
          ...(type ? { type } : {}),
          ...(isCurator && curatorViewClientId ? { client_id: curatorViewClientId } : {}),
        })
          .then((res) => {
            if (cancelled) return;
            setResults(res?.success ? (res.messages || []) : []);
            setState(res?.success ? 'ready' : 'error');
          })
          .catch(() => { if (!cancelled) setState('error'); });
      }, SEARCH_DEBOUNCE_MS);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [query, type, isCurator, curatorViewClientId]);

    const groups = [];
    for (const message of results) {
      const label = formatDayLabel(message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(message);
      else groups.push({ label, items: [message] });
    }

    return React.createElement(
      'div',
      { className: 'messenger-search' },
      React.createElement(
        'div',
        { className: 'messenger-search__bar' },
        React.createElement('button', {
          type: 'button',
          className: 'messenger-header-button',
          onClick: onClose,
          'aria-label': 'Закрыть поиск',
        }, React.createElement(Icon, { name: 'close', size: 18 })),
        React.createElement('input', {
          ref: inputRef,
          className: 'messenger-search__input',
          value: query,
          placeholder: 'Поиск по переписке',
          'aria-label': 'Поиск по переписке',
          onChange: (e) => setQuery(e.target.value),
        }),
      ),
      React.createElement(
        'div',
        { className: 'messenger-search__filters' },
        SEARCH_FILTERS.map((filter) => React.createElement('button', {
          key: filter.key || 'all',
          type: 'button',
          className: `messenger-search__filter${type === filter.key ? ' is-active' : ''}`,
          onClick: () => setType(filter.key),
        }, filter.label)),
      ),
      React.createElement(
        'div',
        { className: 'messenger-search__results' },
        state === 'idle' && query.trim().length < SEARCH_MIN_QUERY && React.createElement(
          'div',
          { className: 'messenger-search__hint' },
          'Введите хотя бы два символа. Голосовые ищутся по расшифровке.',
        ),
        state === 'loading' && React.createElement('div', { className: 'messenger-search__hint' }, 'Ищу…'),
        state === 'error' && React.createElement('div', { className: 'messenger-search__hint' }, 'Не удалось выполнить поиск. Повторите попытку.'),
        state === 'ready' && results.length === 0 && React.createElement(
          'div',
          { className: 'messenger-search__hint' },
          'Ничего не нашлось. Попробуйте другое слово.',
        ),
        groups.map((group) => React.createElement(
          'div',
          { key: group.label, className: 'messenger-search__group' },
          React.createElement('div', { className: 'messenger-search__day' }, group.label),
          group.items.map((message) => React.createElement(
            onJump ? 'button' : 'div',
            {
              key: message.id,
              className: 'messenger-search__item',
              ...(onJump ? { type: 'button', onClick: () => onJump(message) } : {}),
            },
            React.createElement(
              'div',
              { className: 'messenger-search__meta' },
              React.createElement('span', { className: 'messenger-search__author' },
                message.sender_role === 'curator' ? 'Куратор' : 'Клиент'),
              React.createElement('span', { className: 'messenger-search__time' }, formatTime(message.created_at)),
              message.applied_at && React.createElement('span', { className: 'msg-applied' }, 'Внесено в день'),
            ),
            React.createElement(
              'div',
              { className: 'messenger-search__snippet' },
              splitByMatch(buildSnippet(searchableText(message), query.trim()), query.trim())
                .map((part, index) => (part.match
                  ? React.createElement('mark', { key: index }, part.text)
                  : React.createElement('span', { key: index }, part.text))),
            ),
          )),
        )),
      ),
    );
  }

  // ── Разбор сообщения в запись дня ────────────────────────────────────
  // Куратор собирает из сообщения состав приёма и фиксирует его на сообщении.
  // Сам дневник по-прежнему заполняется в разделе «День»: механики записи в
  // чужой день из мессенджера в приложении нет, и притворяться, что кнопка
  // пишет в дневник, нельзя.

  // \b после «г» не работает: кириллица не входит в word-класс JS, поэтому
  // границу проверяем явным lookahead.
  const MEAL_ITEM_RE = /([А-Яа-яЁёA-Za-z][^,;:\n]*?)\s*(\d+(?:[.,]\d+)?)\s*(?:грамм\w*|гр|г)(?![А-Яа-яЁёA-Za-z0-9])/gi;

  /** Достать пары «продукт — граммы» из текста сообщения. */
  function parseMealItems(text) {
    const source = String(text || '');
    const items = [];
    let match;
    MEAL_ITEM_RE.lastIndex = 0;
    while ((match = MEAL_ITEM_RE.exec(source)) !== null) {
      const name = match[1].replace(/^[\s,;:–—-]+/, '').replace(/\s+/g, ' ').trim();
      const grams = Number(String(match[2]).replace(',', '.'));
      if (!name || !Number.isFinite(grams)) continue;
      items.push({ name, grams });
      if (items.length >= 12) break;
    }
    return items;
  }

  /** Заготовка разбора: из интента точнее, из текста — эвристикой. */
  function buildApplyDraft(message) {
    if (!message) return { items: [], mealTime: '' };
    const mealTime = (() => {
      const timeMatch = String(message.body || '').match(TIME_IN_TEXT_RE);
      if (timeMatch) return timeMatch[0].replace('.', ':');
      return formatTime(message.created_at) || '';
    })();

    if (message.intent_type === 'meal') {
      const payload = message.intent_payload || {};
      return {
        items: [{ name: payload.product_name || '', grams: payload.grams ?? '', kcal: payload.kcal ?? '' }],
        mealTime,
      };
    }
    return {
      items: parseMealItems(message.body).map((item) => ({ ...item, kcal: '' })),
      mealTime,
    };
  }

  function ApplyToDayPanel({ message, busy, error, onCancel, onApply }) {
    const [draft, setDraft] = useState(() => buildApplyDraft(message));
    // Название приёма пока не редактируется: у куратора нет источника, из
    // которого его выбирать, а свободный ввод разъедется с дневником.
    const mealLabel = 'Приём пищи';

    useEffect(() => {
      setDraft(buildApplyDraft(message));
    }, [message]);

    const updateItem = (index, patch) => {
      setDraft((current) => ({
        ...current,
        items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      }));
    };

    const totalKcal = draft.items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0);

    return React.createElement(
      'div',
      { className: 'messenger-apply', role: 'group', 'aria-label': 'Собрать в день' },
      React.createElement(
        'div',
        { className: 'messenger-apply__head' },
        React.createElement('span', { className: 'messenger-apply__kicker' }, 'Собрать в день'),
        draft.mealTime && React.createElement('span', { className: 'messenger-apply__time' }, `${mealLabel} · ${draft.mealTime}`),
      ),
      draft.items.length === 0 && React.createElement(
        'div',
        { className: 'messenger-apply__empty' },
        'В сообщении не нашлись продукты с весом. Добавьте строку вручную.',
      ),
      draft.items.map((item, index) => React.createElement(
        'div',
        { key: index, className: 'messenger-apply__row' },
        React.createElement('input', {
          className: 'messenger-apply__name',
          value: item.name,
          placeholder: 'Продукт',
          onChange: (e) => updateItem(index, { name: e.target.value }),
        }),
        React.createElement('input', {
          className: 'messenger-apply__grams',
          value: item.grams,
          inputMode: 'numeric',
          placeholder: 'г',
          'aria-label': 'Граммы',
          onChange: (e) => updateItem(index, { grams: e.target.value }),
        }),
        React.createElement('input', {
          className: 'messenger-apply__kcal',
          value: item.kcal,
          inputMode: 'numeric',
          placeholder: 'ккал',
          'aria-label': 'Калории',
          onChange: (e) => updateItem(index, { kcal: e.target.value }),
        }),
      )),
      React.createElement(
        'div',
        { className: 'messenger-apply__foot' },
        React.createElement('button', {
          type: 'button',
          className: 'messenger-apply__add',
          onClick: () => setDraft((current) => ({ ...current, items: [...current.items, { name: '', grams: '', kcal: '' }] })),
        }, '+ Добавить продукт'),
        totalKcal > 0 && React.createElement('span', { className: 'messenger-apply__total' }, `${totalKcal} ккал`),
      ),
      error && React.createElement('div', { className: 'messenger-apply__error' }, error),
      React.createElement(
        'div',
        { className: 'messenger-apply__note' },
        'Отметка появится у клиента карточкой. Сама запись — в разделе «День».',
      ),
      React.createElement(
        'div',
        { className: 'messenger-apply__actions' },
        React.createElement('button', {
          type: 'button',
          className: 'messenger-apply__cancel',
          onClick: onCancel,
          disabled: busy,
        }, 'Отмена'),
        React.createElement('button', {
          type: 'button',
          className: 'messenger-apply__submit',
          disabled: busy || draft.items.every((item) => !item.name.trim()),
          onClick: () => onApply?.({
            items: draft.items
              .filter((item) => item.name.trim())
              .map((item) => ({
                name: item.name.trim(),
                ...(item.grams !== '' && Number.isFinite(Number(item.grams)) ? { grams: Number(item.grams) } : {}),
                ...(item.kcal !== '' && Number.isFinite(Number(item.kcal)) ? { kcal: Number(item.kcal) } : {}),
              })),
            ...(totalKcal > 0 ? { total: { kcal: totalKcal } } : {}),
            meal_label: mealLabel,
            ...(draft.mealTime ? { meal_time: draft.mealTime } : {}),
          }),
        }, busy ? 'Сохраняю…' : 'Отметить внесённым'),
      ),
    );
  }

  // ── Карточка «внесено в дневник» ─────────────────────────────────────
  // Системный блок во всю ширину треда: это не реплика, а результат работы
  // куратора, поэтому он не пузырь и не привязан к стороне.

  function formatAppliedTotal(total) {
    if (!total || typeof total !== 'object') return null;
    const parts = [];
    if (total.kcal != null) parts.push(`Итого ${total.kcal} ккал`);
    if (total.p != null) parts.push(`Б ${total.p}`);
    if (total.f != null) parts.push(`Ж ${total.f}`);
    if (total.c != null) parts.push(`У ${total.c}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  function AppliedDayCard({ summary, onOpenDay }) {
    if (!summary || typeof summary !== 'object') return null;
    const items = Array.isArray(summary.items) ? summary.items : [];
    const header = [summary.meal_label, summary.meal_time].filter(Boolean).join(' · ');
    const total = formatAppliedTotal(summary.total);

    return React.createElement(
      'div',
      { className: 'msg-applied-card' },
      React.createElement(
        'div',
        { className: 'msg-applied-card__head' },
        React.createElement('span', { className: 'msg-applied-card__dot', 'aria-hidden': 'true' }),
        React.createElement('span', { className: 'msg-applied-card__title' }, 'Внесено в дневник'),
        header && React.createElement('span', { className: 'msg-applied-card__meta' }, header),
      ),
      items.length > 0 && React.createElement(
        'div',
        { className: 'msg-applied-card__items' },
        items.map((item, index) => React.createElement(
          'div',
          { key: `${item?.name || 'item'}-${index}`, className: 'msg-applied-card__item' },
          React.createElement('span', { className: 'msg-applied-card__name' }, item?.name || 'Без названия'),
          item?.grams != null && React.createElement('span', { className: 'msg-applied-card__grams' }, `${item.grams} г`),
          item?.kcal != null && React.createElement('span', { className: 'msg-applied-card__kcal' }, `${item.kcal} ккал`),
        )),
      ),
      (total || onOpenDay) && React.createElement(
        'div',
        { className: 'msg-applied-card__foot' },
        total && React.createElement('span', { className: 'msg-applied-card__total' }, total),
        onOpenDay && React.createElement('button', {
          type: 'button',
          className: 'msg-applied-card__open',
          onClick: () => onOpenDay(summary),
        }, 'Открыть день'),
      ),
    );
  }

  // ── Интент-сообщения ─────────────────────────────────────────────────
  // meal/training/weight приходят структурой, а не текстом. Показываем их
  // как запись: кикер — тип, слева название, справа значение. Эмодзи не
  // используем — тип уже назван словом.

  function buildIntentCard(message) {
    const payload = message?.intent_payload || {};
    if (message?.intent_type === 'meal') {
      const macros = [
        payload.kcal != null ? `${payload.kcal} ккал` : null,
        payload.protein != null ? `Б ${payload.protein}` : null,
        payload.fat != null ? `Ж ${payload.fat}` : null,
        payload.carbs != null ? `У ${payload.carbs}` : null,
      ].filter(Boolean);
      return {
        kicker: 'Приём пищи',
        title: payload.product_name || 'Без названия',
        value: payload.grams != null ? `${payload.grams} г` : null,
        details: macros.length > 0 ? macros.join(' · ') : null,
      };
    }
    if (message?.intent_type === 'training') {
      return {
        kicker: 'Тренировка',
        title: payload.training_type || 'Без названия',
        value: payload.duration_min != null ? `${payload.duration_min} мин` : null,
      };
    }
    if (message?.intent_type === 'weight') {
      return {
        kicker: 'Вес',
        value: payload.weight_kg != null ? `${payload.weight_kg} кг` : null,
        valueLarge: true,
      };
    }
    return null;
  }

  function IntentCard({ card }) {
    if (!card) return null;
    return React.createElement(
      'div',
      { className: 'msg-intent' },
      React.createElement('div', { className: 'msg-intent__kicker' }, card.kicker),
      React.createElement(
        'div',
        { className: `msg-intent__row${card.valueLarge ? ' msg-intent__row--single' : ''}` },
        card.title && React.createElement('span', { className: 'msg-intent__title' }, card.title),
        card.value && React.createElement('span', { className: 'msg-intent__value' }, card.value),
      ),
      card.details && React.createElement('div', { className: 'msg-intent__details' }, card.details),
    );
  }

  // ── Лайтбокс ─────────────────────────────────────────────────────────

  const SWIPE_MIN_DISTANCE_PX = 40;

  function PhotoLightbox({ attachments, index, onIndexChange, onClose }) {
    const list = Array.isArray(attachments) ? attachments : [];
    const total = list.length;
    const touchStartRef = useRef(null);

    const goTo = useCallback((next) => {
      if (total === 0) return;
      const wrapped = (next + total) % total;
      onIndexChange?.(wrapped);
    }, [onIndexChange, total]);

    useEffect(() => {
      const onKeyDown = (event) => {
        if (event.key === 'Escape') onClose?.();
        if (event.key === 'ArrowRight') goTo(index + 1);
        if (event.key === 'ArrowLeft') goTo(index - 1);
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }, [goTo, index, onClose]);

    const handleTouchStart = (event) => {
      touchStartRef.current = event.touches?.[0]?.clientX ?? null;
    };

    const handleTouchEnd = (event) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (start == null || total < 2) return;
      const delta = (event.changedTouches?.[0]?.clientX ?? start) - start;
      if (Math.abs(delta) < SWIPE_MIN_DISTANCE_PX) return;
      goTo(index + (delta < 0 ? 1 : -1));
    };

    return React.createElement(
      'div',
      {
        className: 'messenger-lightbox',
        role: 'dialog',
        'aria-label': 'Просмотр фото',
        onClick: (event) => { if (event.target === event.currentTarget) onClose?.(); },
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
      },
      React.createElement(
        'div',
        { className: 'messenger-lightbox__top' },
        React.createElement('button', {
          type: 'button',
          className: 'messenger-lightbox__button',
          onClick: onClose,
          'aria-label': 'Закрыть',
        }, React.createElement(Icon, { name: 'close', size: 18 })),
        total > 1 && React.createElement(
          'div',
          { className: 'messenger-lightbox__counter' },
          `${index + 1} / ${total}`,
        ),
      ),
      React.createElement(LightboxPhoto, { attachment: list[index] }),
      total > 1 && React.createElement(
        'div',
        { className: 'messenger-lightbox__strip' },
        list.map((attachment, i) => React.createElement('button', {
          key: attachment?.path || attachment?.url || i,
          type: 'button',
          className: `messenger-lightbox__thumb${i === index ? ' is-active' : ''}`,
          onClick: () => goTo(i),
          'aria-label': `Фото ${i + 1}`,
          'aria-current': i === index ? 'true' : undefined,
        }, React.createElement(LightboxPhoto, { attachment }))),
      ),
    );
  }

  // ── Пустой тред ──────────────────────────────────────────────────────

  // Подсказки закрывают самый частый ступор первого сообщения: человек не
  // знает, что именно от него ждут. Тап начинает сообщение за него.
  const EMPTY_THREAD_PROMPTS = [
    { key: 'photo', label: 'Фото завтрака', template: 'Завтрак в ' },
    { key: 'weight', label: 'Вес утром', template: 'Вес утром: ' },
    { key: 'how', label: 'Как самочувствие', template: 'Самочувствие сегодня: ' },
  ];

  function EmptyThread({ isCurator, onPickPrompt }) {
    if (isCurator) {
      return React.createElement(
        'div',
        { className: 'messenger-empty' },
        React.createElement('div', { className: 'messenger-empty__title' }, 'Нет сообщений от этого клиента'),
      );
    }
    return React.createElement(
      'div',
      { className: 'messenger-empty' },
      React.createElement(
        'div',
        { className: 'messenger-empty__badge', 'aria-hidden': 'true' },
        React.createElement(Icon, { name: 'chat', size: 26, strokeWidth: 1.6 }),
      ),
      React.createElement('div', { className: 'messenger-empty__title' }, 'Здесь начнётся переписка с куратором'),
      React.createElement(
        'div',
        { className: 'messenger-empty__text' },
        'Отправьте фото еды, вопрос или контекст по самочувствию — куратор ответит и соберёт день.',
      ),
      React.createElement(
        'div',
        { className: 'messenger-empty__prompts' },
        EMPTY_THREAD_PROMPTS.map((prompt) => React.createElement('button', {
          key: prompt.key,
          type: 'button',
          className: 'messenger-empty__prompt',
          onClick: () => onPickPrompt?.(prompt.template),
        }, prompt.label)),
      ),
    );
  }

  // Знак 56 в теле вкладки: история приходит из облака, рама уже живая.
  function ThreadSkeleton() {
    const mark = window.HEYS?.WaitMark?.render?.(React, { mode: 'embedded', sr: 'Загружаем' });
    return mark || React.createElement('div', {
      className: 'heys-wait-mark heys-wait-mark--embedded',
      role: 'status',
    }, 'Загружаем');
  }

  // ── Плашка «время и граммы» ──────────────────────────────────────────
  // Не декоративная подсказка, а рабочий элемент: от неё зависит, соберёт
  // куратор день с первого сообщения или пойдёт переспрашивать. Поэтому она
  // заметная и с быстрыми вставками, а не просто текст.

  const FOOD_HINT_DISMISSED_KEY = 'heys_messenger_food_hint_dismissed';

  // Ключ скоупится клиентом: на общем устройстве скрытая одним клиентом плашка
  // иначе пропала бы и у второго. Безклиентский вариант оставлен для случая,
  // когда клиент ещё не определён.
  function foodHintDismissedKey() {
    const cid = getCurrentClientId();
    return cid ? `${FOOD_HINT_DISMISSED_KEY}_${String(cid).toLowerCase()}` : FOOD_HINT_DISMISSED_KEY;
  }
  const FOOD_HINT_LEARNED_STREAK = 10;
  const TIME_IN_TEXT_RE = /\b([01]?\d|2[0-3])[:.][0-5]\d\b/;
  const GRAMS_IN_TEXT_RE = /\d+\s*(г|гр|грамм)/i;
  // Куратор переспрашивает вес/время — значит клиент ещё не привык, плашку
  // возвращаем даже если она была скрыта как «усвоено».
  const CURATOR_ASKS_RE = /(сколько\s+(грамм|весил)|вес\w*\s+(порци|в\s*грамм)|во\s+сколько|в\s+какое\s+время|время\s+приёма)/i;

  function readFoodHintDismissed() {
    try {
      return localStorage.getItem(foodHintDismissedKey()) === '1';
    } catch { return false; }
  }

  function writeFoodHintDismissed(value) {
    try {
      const key = foodHintDismissedKey();
      if (value) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch { /* приватный режим — просто не запоминаем */ }
  }

  /**
   * Показывать ли плашку. Клиент, который уже десять сообщений подряд пишет
   * время и граммы, в напоминании не нуждается — но если куратор снова
   * переспрашивает, плашка возвращается.
   */
  function shouldShowFoodHint(messages, viewerRole, { dismissedForSession = false } = {}) {
    if (viewerRole === 'curator' || dismissedForSession) return false;
    const list = Array.isArray(messages) ? messages : [];

    const recentCuratorAsk = list
      .filter((m) => m.sender_role === 'curator')
      .slice(-3)
      .some((m) => CURATOR_ASKS_RE.test(String(m.body || '')));
    if (recentCuratorAsk) return true;

    if (readFoodHintDismissed()) return false;

    const own = list.filter((m) => m.sender_role !== 'curator' && m.body).slice(-FOOD_HINT_LEARNED_STREAK);
    const learned = own.length >= FOOD_HINT_LEARNED_STREAK
      && own.every((m) => TIME_IN_TEXT_RE.test(m.body) && GRAMS_IN_TEXT_RE.test(m.body));
    if (learned) {
      writeFoodHintDismissed(true);
      return false;
    }
    return true;
  }

  const GRAMS_TEMPLATE = ' 000 г';
  const TIME_STEP_MINUTES = 5;

  function parseHHMMLabel(label) {
    const m = String(label || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  /** Сдвинуть «HH:MM» на N минут с переходом через полночь. */
  function shiftTimeLabel(label, deltaMinutes) {
    const total = ((parseHHMMLabel(label) + deltaMinutes) % 1440 + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function FoodHintCard({ onInsertTime, onInsertGrams, onHide }) {
    // Время живое: клиент открывает мессенджер и видит текущее, а не то,
    // что было на момент первого рендера.
    const [now, setNow] = useState(() => currentTimeLabel());
    const [stepperOpen, setStepperOpen] = useState(false);
    const [customTime, setCustomTime] = useState(() => currentTimeLabel());
    useEffect(() => {
      const timer = setInterval(() => setNow(currentTimeLabel()), 30000);
      return () => clearInterval(timer);
    }, []);

    return React.createElement(
      'div',
      { className: 'messenger-food-hint', role: 'note' },
      React.createElement(Icon, { name: 'clock', size: 16, className: 'messenger-food-hint__icon' }),
      React.createElement(
        'div',
        { className: 'messenger-food-hint__body' },
        React.createElement(
          'div',
          { className: 'messenger-food-hint__text' },
          React.createElement('b', null, 'Время и вес в граммах'),
          ' — тогда куратор соберёт день сразу, без уточняющих вопросов.',
        ),
        React.createElement(
          'div',
          { className: 'messenger-food-hint__actions' },
          React.createElement('button', {
            type: 'button',
            className: 'messenger-food-hint__pill',
            onClick: () => onInsertTime?.(now),
          }, `Сейчас · ${now}`),
          React.createElement('button', {
            type: 'button',
            className: 'messenger-food-hint__pill',
            onClick: () => onInsertTime?.(shiftTimeLabel(now, -60)),
          }, 'Час назад'),
          React.createElement('button', {
            type: 'button',
            className: `messenger-food-hint__pill${stepperOpen ? ' is-custom' : ''}`,
            onClick: () => setStepperOpen((open) => !open),
            'aria-expanded': stepperOpen ? 'true' : 'false',
          }, 'Своё время'),
          React.createElement('button', {
            type: 'button',
            className: 'messenger-food-hint__pill',
            onClick: () => onInsertGrams?.(),
          }, 'Вес 000 г'),
        ),
        // Степпер — второй слой: нужен, когда ни «сейчас», ни «час назад» не
        // подходят, и не занимает место в обычном случае.
        stepperOpen && React.createElement(
          'div',
          { className: 'messenger-food-hint__stepper' },
          React.createElement('button', {
            type: 'button',
            className: 'messenger-food-hint__step',
            onClick: () => setCustomTime((value) => shiftTimeLabel(value, -TIME_STEP_MINUTES)),
            'aria-label': 'Раньше на 5 минут',
          }, '−'),
          React.createElement('input', {
            type: 'time',
            className: 'messenger-food-hint__time',
            value: customTime,
            onChange: (e) => setCustomTime(e.target.value || customTime),
            'aria-label': 'Время приёма',
          }),
          React.createElement('button', {
            type: 'button',
            className: 'messenger-food-hint__step',
            onClick: () => setCustomTime((value) => shiftTimeLabel(value, TIME_STEP_MINUTES)),
            'aria-label': 'Позже на 5 минут',
          }, '+'),
          React.createElement('span', { className: 'messenger-food-hint__step-note' }, 'шаг 5 мин'),
          React.createElement('button', {
            type: 'button',
            className: 'messenger-food-hint__done',
            onClick: () => { onInsertTime?.(customTime); setStepperOpen(false); },
          }, 'Готово'),
        ),
      ),
      React.createElement('button', {
        type: 'button',
        className: 'messenger-food-hint__hide',
        onClick: onHide,
      }, 'Скрыть'),
    );
  }

  // ── Чек-лист дня ─────────────────────────────────────────────────────
  // «Чего ещё ждём сегодня»: клиенту — «Ждём», куратору — «Нет в дне».
  // Список приходит с сервера (/messages/day-checklist) и считается тем же
  // правилом, что и напоминания. Клиент ничего не досчитывает: пустой ответ
  // означает «показывать нечего», а не «данные не пришли».

  function currentTimeLabel() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // Тап по ожидаемому пункту начинает сообщение за клиента — дальше он
  // дописывает продукты и вес, как просит подсказка под композером.
  const CHECKLIST_TEMPLATES = {
    meal: () => `Приём пищи в ${currentTimeLabel()}, `,
    weight: () => 'Вес утром: ',
    water: () => 'Вода за день: ',
    // Спрашиваем про активность вообще, а не про тренировку: прогулка или
    // хобби тоже считаются, и человеку не надо решать, «засчитается» ли это.
    activity: () => 'Активность сегодня: ',
  };

  function DayChecklistRow({ items, isCurator, onPick }) {
    const visible = (Array.isArray(items) ? items : []).filter(
      (item) => item && (item.status === 'missing' || item.status === 'done'),
    );
    // Если ждать больше нечего — строка уходит целиком, а не висит галочками.
    if (!visible.some((item) => item.status === 'missing')) return null;

    return React.createElement(
      'div',
      { className: 'messenger-day-checklist', role: 'group', 'aria-label': isCurator ? 'Нет в дне' : 'Чего ждём сегодня' },
      React.createElement(
        'span',
        { className: 'messenger-day-checklist__label' },
        isCurator ? 'Нет в дне' : 'Ждём',
      ),
      visible.map((item) => {
        const missing = item.status === 'missing';
        const template = !isCurator && missing ? CHECKLIST_TEMPLATES[item.key] : null;
        const dueHint = missing && item.due_from ? `Ждём с ${item.due_from}` : null;
        return React.createElement(
          template ? 'button' : 'span',
          {
            key: item.key,
            className: [
              'messenger-day-checklist__chip',
              missing ? 'messenger-day-checklist__chip--missing' : 'messenger-day-checklist__chip--done',
              missing && isCurator ? 'messenger-day-checklist__chip--curator' : '',
            ].filter(Boolean).join(' '),
            ...(template
              ? {
                  type: 'button',
                  onClick: () => onPick?.(template()),
                  title: dueHint || undefined,
                }
              : { title: dueHint || undefined }),
          },
          missing ? null : React.createElement('span', { className: 'messenger-day-checklist__tick', 'aria-hidden': 'true' }, '✓'),
          item.label || item.key,
        );
      }),
    );
  }

  // ── Main MessengerModal ──────────────────────────────────────────────
  function MessengerModal({ onClose, curatorViewClientId }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [input, setInput] = useState('');
    const [dayChecklist, setDayChecklist] = useState([]);
    const [foodHintHidden, setFoodHintHidden] = useState(false);
    const [keyboardDiagnostic, setKeyboardDiagnostic] = useState(null);
    const [error, setError] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [showOldMessages, setShowOldMessages] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [pendingPhotos, setPendingPhotos] = useState([]); // [{tempId, localPreview, status:'uploading'|'done'|'error', url?, path?, filename?, width?, height?}]
    const [pendingAudio, setPendingAudio] = useState(null); // {tempId, status, localUrl, url?, path?, mime, duration_ms, size_bytes}
    const [recordingState, setRecordingState] = useState('idle'); // idle|recording|stopping
    const [recordingMs, setRecordingMs] = useState(0);
    const [transcriptionConsent, setTranscriptionConsent] = useState(null); // {granted, decided, created_at, revoked_at, version}
    const [transcriptionPromptOpen, setTranscriptionPromptOpen] = useState(false);
    const [savingTranscriptionConsent, setSavingTranscriptionConsent] = useState(false);
    const [lightbox, setLightbox] = useState(null); // {attachments, index} | null
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [highlightedId, setHighlightedId] = useState(null);
    const [outbox, setOutbox] = useState([]);
    const [flushing, setFlushing] = useState(false);
    const [pendingAudioTranscript, setPendingAudioTranscript] = useState(null);
    const [inboxRows, setInboxRows] = useState([]);
    const [activeClientId, setActiveClientId] = useState(curatorViewClientId || null);
    const [applyTarget, setApplyTarget] = useState(null);
    const [applyBusy, setApplyBusy] = useState(false);
    const [applyError, setApplyError] = useState(null);
    const [deletingMessageId, setDeletingMessageId] = useState(null);
    const [pendingAckMessageIds, setPendingAckMessageIds] = useState(() => new Set());
    const threadRef = useRef(null);
    const inputRef = useRef(null);
    const flushingRef = useRef(false);
    const pendingPhotosRef = useRef([]);
    const keyboardAttemptRef = useRef(null);
    const keyboardAttemptIdRef = useRef(0);
    const keyboardAttemptTimerRef = useRef(null);
    const lastKeyboardFailureRef = useRef(null);
    const keyboardRefocusInProgressRef = useRef(false);
    const fileInputRef = useRef(null);
    const recorderRef = useRef(null);
    const recordChunksRef = useRef([]);
    const recordStreamRef = useRef(null);
    const recordStartedAtRef = useRef(0);
    const recordTickRef = useRef(null);
    const recordStopTimerRef = useRef(null);
    const pendingAudioUrlRef = useRef(null);
    const pendingTranscriptionMessageRef = useRef(null);
    const ackVerificationRef = useRef(null);
    const ackMutationIdsRef = useRef(new Set());
    const transcriptionConsentRef = useRef(null);
    const optimisticAudioUrlsRef = useRef(new Set());
    const localAudioByRemoteRef = useRef(new Map());
    const mountedRef = useRef(true);
    const threadGenerationRef = useRef(0);
    const threadContextKeyRef = useRef(null);
    const prependScrollRef = useRef(null);
    const historyPaginationStartedRef = useRef(false);
    const pendingMediaRef = useRef({ photos: [], audio: null });
    const cancelledUploadIdsRef = useRef(new Set());
    const isCurator = isCuratorMode();
    const viewerRole = isCurator ? 'curator' : 'client';
    const threadContextKey = `${viewerRole}:${curatorViewClientId || ''}`;
    // Выбор клиента в инбоксе меняет тред, не закрывая модалку.
    const threadClientId = isCurator ? (activeClientId || curatorViewClientId) : null;
    if (threadContextKeyRef.current !== threadContextKey) {
      threadContextKeyRef.current = threadContextKey;
      threadGenerationRef.current += 1;
    }

    const clearKeyboardAttemptTimer = useCallback(() => {
      if (!keyboardAttemptTimerRef.current) return;
      clearTimeout(keyboardAttemptTimerRef.current);
      keyboardAttemptTimerRef.current = null;
    }, []);

    const traceKeyboardEvent = useCallback((eventName, attempt, reason, level = 'info') => {
      try {
        HEYS.LogTrace?.event?.(eventName, {
          source: 'messenger',
          status: level === 'warn' ? 'degraded' : 'ok',
          screen: 'messenger',
          reason,
          mode: attempt?.surface || getKeyboardSurface(),
          attempt: Number(attempt?.id || 0),
        }, level);
      } catch { /* diagnostics must not affect the composer */ }
    }, []);

    const confirmKeyboardAttempt = useCallback((reason) => {
      const attempt = keyboardAttemptRef.current;
      clearKeyboardAttemptTimer();
      keyboardAttemptRef.current = null;
      setKeyboardDiagnostic(null);
      if (lastKeyboardFailureRef.current) {
        const failure = lastKeyboardFailureRef.current;
        lastKeyboardFailureRef.current = null;
        traceKeyboardEvent('messenger_keyboard_recovered', attempt || failure, reason || failure.code, 'info');
      }
    }, [clearKeyboardAttemptTimer, traceKeyboardEvent]);

    const evaluateKeyboardAttempt = useCallback((attemptId) => {
      const attempt = keyboardAttemptRef.current;
      if (!attempt || attempt.id !== attemptId) return;
      keyboardAttemptTimerRef.current = null;
      const inputElement = inputRef.current;
      const currentViewport = getKeyboardViewportSnapshot();
      const code = classifyKeyboardAttempt({
        disabled: !!inputElement?.disabled,
        active: document.activeElement === inputElement,
        viewportVisible: hasKeyboardViewportEvidence(attempt.baseline, currentViewport),
        viewportSupported: currentViewport.supported,
      });
      if (!code) {
        confirmKeyboardAttempt('keyboard-visible');
        return;
      }
      const diagnostic = getKeyboardDiagnostic(code);
      if (!diagnostic) return;
      const next = { ...diagnostic, attempt: attempt.id, surface: attempt.surface };
      setKeyboardDiagnostic(next);
      if (lastKeyboardFailureRef.current?.attempt !== attempt.id) {
        lastKeyboardFailureRef.current = next;
        traceKeyboardEvent('messenger_keyboard_failed', attempt, code, 'warn');
      }
    }, [confirmKeyboardAttempt, traceKeyboardEvent]);

    const scheduleKeyboardAttemptCheck = useCallback((attempt) => {
      clearKeyboardAttemptTimer();
      keyboardAttemptTimerRef.current = setTimeout(() => {
        evaluateKeyboardAttempt(attempt.id);
      }, KEYBOARD_CONFIRM_DELAY_MS);
    }, [clearKeyboardAttemptTimer, evaluateKeyboardAttempt]);

    const beginKeyboardAttempt = useCallback((trigger = 'gesture', startedActive = false) => {
      if (!isIOSDevice()) return null;
      const current = keyboardAttemptRef.current;
      const now = Date.now();
      if (current && now - current.startedAt < 250) return current;
      const attempt = {
        id: keyboardAttemptIdRef.current + 1,
        trigger,
        surface: getKeyboardSurface(),
        baseline: getKeyboardViewportSnapshot(),
        startedAt: now,
        startedActive,
      };
      keyboardAttemptIdRef.current = attempt.id;
      keyboardAttemptRef.current = attempt;
      setKeyboardDiagnostic(null);
      scheduleKeyboardAttemptCheck(attempt);
      return attempt;
    }, [scheduleKeyboardAttemptCheck]);

    const handleKeyboardGestureStart = useCallback(() => {
      beginKeyboardAttempt('gesture', document.activeElement === inputRef.current);
    }, [beginKeyboardAttempt]);

    const handleKeyboardClick = useCallback((event) => {
      const attempt = keyboardAttemptRef.current || beginKeyboardAttempt(
        'click',
        document.activeElement === inputRef.current,
      );
      if (!attempt) return;
      const forceRefocus = attempt.trigger === 'gesture' && attempt.startedActive === false;
      keyboardRefocusInProgressRef.current = forceRefocus;
      try {
        focusMessageInputFromGesture(event, true, forceRefocus);
      } finally {
        keyboardRefocusInProgressRef.current = false;
      }
    }, [beginKeyboardAttempt]);

    const handleKeyboardRetry = useCallback(() => {
      const inputElement = inputRef.current;
      if (!inputElement) return;
      beginKeyboardAttempt('retry', document.activeElement === inputElement);
      keyboardRefocusInProgressRef.current = true;
      let focused = false;
      try {
        focused = focusMessageInputFromGesture({ currentTarget: inputElement }, true, true);
      } finally {
        keyboardRefocusInProgressRef.current = false;
      }
      if (!focused) {
        const attempt = keyboardAttemptRef.current;
        if (attempt) evaluateKeyboardAttempt(attempt.id);
      }
    }, [beginKeyboardAttempt, evaluateKeyboardAttempt]);

    useEffect(() => {
      const viewport = global.visualViewport;
      if (!viewport) return undefined;
      const handleViewportResize = () => {
        const attempt = keyboardAttemptRef.current;
        if (!attempt || document.activeElement !== inputRef.current) return;
        if (hasKeyboardViewportEvidence(attempt.baseline, getKeyboardViewportSnapshot())) {
          confirmKeyboardAttempt('viewport-resized');
        }
      };
      viewport.addEventListener('resize', handleViewportResize);
      return () => viewport.removeEventListener('resize', handleViewportResize);
    }, [confirmKeyboardAttempt]);

    useEffect(() => () => {
      clearKeyboardAttemptTimer();
      keyboardAttemptRef.current = null;
    }, [clearKeyboardAttemptTimer]);

    const rememberLocalAudio = useCallback((attachment) => {
      if (!attachment?.localUrl) return;
      if (attachment.url) localAudioByRemoteRef.current.set(attachment.url, attachment.localUrl);
      if (attachment.path) localAudioByRemoteRef.current.set(attachment.path, attachment.localUrl);
    }, []);

    const hydrateLocalAudio = useCallback((message) => {
      if (!Array.isArray(message?.attachments) || localAudioByRemoteRef.current.size === 0) return message;
      let changed = false;
      const attachments = message.attachments.map((att) => {
        if (!isAudioAttachment(att) || att.localUrl) return att;
        const localUrl = localAudioByRemoteRef.current.get(att.url) || localAudioByRemoteRef.current.get(att.path);
        if (!localUrl) return att;
        changed = true;
        return { ...att, localUrl };
      });
      return changed ? { ...message, attachments } : message;
    }, []);

    // Memo ID самого свежего сообщения с другой стороны (для звука)
    const lastForeignIdRef = useRef(null);
    // Was scrolled at bottom при последнем render (для smart scroll)
    const wasAtBottomRef = useRef(true);

    const refreshTranscriptionConsent = useCallback(async () => {
      if (!HEYS.MessengerAPI?.getTranscriptionConsent) return null;
      const res = await HEYS.MessengerAPI.getTranscriptionConsent();
      if (res?.success) {
        const next = {
          granted: !!res.granted,
          decided: !!res.decided,
          created_at: res.created_at || null,
          revoked_at: res.revoked_at || null,
          version: res.version || '1.0',
        };
        transcriptionConsentRef.current = next;
        setTranscriptionConsent(next);
        return next;
      }
      return null;
    }, []);

    useEffect(() => {
      transcriptionConsentRef.current = transcriptionConsent;
    }, [transcriptionConsent]);

    useEffect(() => {
      void refreshTranscriptionConsent();
    }, [refreshTranscriptionConsent]);

    const fetchAndMerge = useCallback(async ({ silent = false, beforeTs = null, prepend = false } = {}) => {
      const generation = threadGenerationRef.current;
      if (!silent && !prepend) setLoading(true);
      if (prepend) setLoadingOlder(true);
      const opts = {
        ...(isCurator && threadClientId ? { client_id: threadClientId } : {}),
        ...(beforeTs ? { before_ts: beforeTs } : {}),
        limit: THREAD_PAGE_LIMIT,
      };
      const res = await HEYS.MessengerAPI.getThread(opts);
      if (!mountedRef.current || generation !== threadGenerationRef.current) return;
      if (!silent && !prepend) setLoading(false);
      if (prepend) setLoadingOlder(false);
      if (!res?.success) {
        if (prepend) prependScrollRef.current = null;
        if (!silent) setError(res?.error || 'unknown_error');
        return;
      }
      const sorted = (res.messages || []).slice().reverse().map(hydrateLocalAudio);
      const pendingAck = ackVerificationRef.current;
      if (pendingAck) {
        const confirmation = getMessageStateConfirmation(
          sorted,
          pendingAck.messageId,
          pendingAck.field,
          pendingAck.desiredState,
        );
        if (confirmation.found) {
          ackVerificationRef.current = null;
          setError((current) => current === ACK_CONFIRMING_ERROR
            ? (confirmation.confirmed ? null : ACK_FAILED_ERROR)
            : current);
          if (confirmation.confirmed) {
            HEYS.MessengerAPI.refreshFabUnread?.();
            if (isCurator) HEYS.MessengerAPI.refreshInbox?.();
          }
        }
      }
      if (prepend) {
        historyPaginationStartedRef.current = true;
        setHasMoreHistory(sorted.length >= THREAD_PAGE_LIMIT);
      } else if (!historyPaginationStartedRef.current) {
        setHasMoreHistory(sorted.length >= THREAD_PAGE_LIMIT);
      }

      setMessages((prev) => {
        if (!prepend && prev.length === 0 && lastForeignIdRef.current == null) {
          const lastForeign = sorted.slice().reverse().find((m) => m.sender_role !== viewerRole);
          lastForeignIdRef.current = lastForeign?.id || null;
        } else if (!prepend) {
          const prevIds = new Set(prev.map((m) => m.id));
          const newForeign = sorted.find(
            (m) => !prevIds.has(m.id) && m.sender_role !== viewerRole
          );
          if (newForeign && lastForeignIdRef.current !== newForeign.id) {
            lastForeignIdRef.current = newForeign.id;
            // Отклик через единственную политику. Двойной звонок и
            // пятиимпульсная вибрация сведены к одному отклику: строка
            // «звук · правило продукта» знает два звука, и сообщение одолжило
            // звук совета вместе с его переключателем.
            try { window.HEYS?.feedback?.emit?.('message.incoming'); } catch { /* ignore */ }
          }
        }
        return prepend
          ? mergeMessagePage(prev, sorted)
          : mergeLatestMessagePage(prev, sorted);
      });

      if (prepend) {
        try {
          console.info('[HEYS.messenger] history_page_loaded', { count: sorted.length });
        } catch { /* ignore */ }
      }

      // The visible modal marks newly displayed foreign messages read even on silent polls.
      if (!prepend) {
        const latestTs = getLatestForeignReadTs(sorted, viewerRole);
        if (latestTs) {
          const markPayload = isCurator && threadClientId
            ? { client_id: threadClientId, up_to_ts: latestTs }
            : { up_to_ts: latestTs };
          HEYS.MessengerAPI.markRead(markPayload)
            .then(() => {
              HEYS.MessengerAPI.refreshFabUnread?.();
              if (isCurator) HEYS.MessengerAPI.refreshInbox?.();
            })
            .catch(() => {});
        }
      }
    }, [isCurator, threadClientId, viewerRole, hydrateLocalAudio]);

    // Черновик расшифровки появляется, как только SpeechKit вернул текст, и
    // сбрасывается вместе с самой записью.
    useEffect(() => {
      if (!pendingAudio) { setPendingAudioTranscript(null); return; }
      if (pendingAudio.transcript_status === 'ready' && typeof pendingAudio.transcript_text === 'string') {
        setPendingAudioTranscript((current) => (current === null ? pendingAudio.transcript_text : current));
      }
    }, [pendingAudio]);

    // Инбокс живёт только у куратора и обновляется тем же событием, что и
    // бейджи в шапке приложения.
    useEffect(() => {
      if (!isCurator) return undefined;
      let cancelled = false;
      const load = () => {
        HEYS.MessengerAPI.getInbox?.()
          .then((res) => {
            if (cancelled || !mountedRef.current) return;
            setInboxRows(res?.success && Array.isArray(res.inbox) ? res.inbox : []);
          })
          .catch(() => {});
      };
      load();
      window.addEventListener('heys:messenger-inbox-updated', load);
      return () => { cancelled = true; window.removeEventListener('heys:messenger-inbox-updated', load); };
    }, [isCurator]);

    const outboxClientId = isCurator ? (activeClientId || curatorViewClientId || getCurrentClientId()) : getCurrentClientId();

    // Черновик и очередь переживают закрытие модалки и перезагрузку страницы.
    useEffect(() => {
      setOutbox(readQueue(outboxClientId));
      const draft = readDraft(outboxClientId);
      if (draft.text) setInput((current) => current || draft.text);
      if (draft.photos.length > 0) {
        setPendingPhotos((current) => (current.length > 0 ? current : draft.photos));
      }
    }, [outboxClientId]);

    useEffect(() => {
      pendingPhotosRef.current = pendingPhotos;
    }, [pendingPhotos]);

    useEffect(() => {
      // Снимки без ошибки: битую загрузку тащить в новый сеанс незачем.
      const draftPhotos = pendingPhotos.filter((p) => p.status !== 'error' && p.localPreview);
      writeDraft(outboxClientId, { text: input.trim() ? input : '', photos: draftPhotos });
    }, [input, pendingPhotos, outboxClientId]);

    const flushOutbox = useCallback(async () => {
      if (flushingRef.current) return;
      const queue = readQueue(outboxClientId);
      if (queue.length === 0) return;
      flushingRef.current = true;
      setFlushing(true);
      let rest = queue;
      // Порядок важен: сообщения уходят по очереди, первое неудачное
      // останавливает отправку, чтобы не переставить их местами.
      for (const entry of queue) {
        const res = await HEYS.MessengerAPI.send(entry.payload, { requestId: entry.request_id })
          .catch(() => null);
        if (!res?.success) {
          if (isNetworkFailure(res)) break;
          // Сервер отказал по существу (например, сообщение слишком длинное) —
          // держать такое в очереди вечно бессмысленно.
        }
        rest = rest.filter((item) => item.request_id !== entry.request_id);
        writeQueue(outboxClientId, rest);
      }
      flushingRef.current = false;
      if (!mountedRef.current) return;
      setFlushing(false);
      setOutbox(rest);
      if (rest.length < queue.length) void fetchAndMerge({ silent: true });
    }, [outboxClientId, fetchAndMerge]);

    /** Снимки, дождавшиеся сети, уходят на сервер и снова становятся отправляемыми. */
    const uploadPendingPhotos = useCallback(async () => {
      const waiting = pendingPhotosRef.current.filter((p) => p.status === 'pending-upload' && p.localPreview);
      if (waiting.length === 0 || isOffline()) return;
      const uploadFn = window.HEYS?.StoragePhotos?.uploadPhoto;
      if (typeof uploadFn !== 'function') return;
      const targetClientId = isCurator
        ? (curatorViewClientId || getCurrentClientId())
        : getCurrentClientId();
      const today = new Date().toISOString().slice(0, 10);

      for (const photo of waiting) {
        setPendingPhotos((prev) => prev.map((p) => p.tempId === photo.tempId ? { ...p, status: 'uploading' } : p));
        const result = await uploadFn(photo.localPreview, targetClientId, today, 'msg-' + photo.tempId)
          .catch(() => null);
        if (!mountedRef.current) return;
        setPendingPhotos((prev) => prev.map((p) => {
          if (p.tempId !== photo.tempId) return p;
          if (!result?.url) return { ...p, status: 'error' };
          return { ...p, status: 'done', url: result.url, path: result.path };
        }));
      }
    }, [isCurator, curatorViewClientId]);

    useEffect(() => {
      const onOnline = () => {
        // Порядок важен: сначала снимки, потом сообщения — иначе очередь уйдёт
        // без вложений, которые человек к ней прикладывал.
        void uploadPendingPhotos().then(() => flushOutbox());
      };
      window.addEventListener('online', onOnline);
      if (!isOffline()) {
        void uploadPendingPhotos().then(() => flushOutbox());
      }
      return () => window.removeEventListener('online', onOnline);
    }, [flushOutbox, uploadPendingPhotos]);

    const loadThread = useCallback(() => fetchAndMerge({ silent: false }), [fetchAndMerge]);

    /**
     * Открыть тред на найденном сообщении. Догружать страницы по одной до
     * нужной было бы десятком запросов; вместо этого просим у сервера страницу,
     * которая заканчивается искомым: `before` = его время плюс миллисекунда.
     * Лента заменяется целиком — склеивать несмежные страницы нельзя, между
     * ними была бы дыра.
     */
    const jumpToMessage = useCallback(async (target) => {
      if (!target?.created_at) return;
      setSearchOpen(false);
      setLoading(true);
      const beforeTs = new Date(new Date(target.created_at).getTime() + 1).toISOString();
      const res = await HEYS.MessengerAPI.getThread({
        ...(isCurator && threadClientId ? { client_id: threadClientId } : {}),
        before_ts: beforeTs,
        limit: THREAD_PAGE_LIMIT,
      }).catch(() => null);
      if (!mountedRef.current) return;
      setLoading(false);
      if (!res?.success) {
        setError(res?.error || 'jump_failed');
        return;
      }
      const page = (res.messages || []).slice().reverse().map(hydrateLocalAudio);
      threadGenerationRef.current += 1;
      setMessages(page);
      // Найденное сообщение может быть старше недельного порога — раскрываем
      // сворачивание, иначе переход упёрся бы в кнопку «Показать ранее».
      setShowOldMessages(true);
      setHasMoreHistory(page.length >= THREAD_PAGE_LIMIT);
      historyPaginationStartedRef.current = true;
      setHighlightedId(target.id);
      wasAtBottomRef.current = false;
    }, [isCurator, threadClientId, hydrateLocalAudio]);

    // Подсветка гаснет сама: это указатель «вот оно», а не состояние.
    useEffect(() => {
      if (!highlightedId) return undefined;
      const node = threadRef.current?.querySelector(`[data-message-id="${highlightedId}"]`);
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const timer = setTimeout(() => setHighlightedId(null), 2600);
      return () => clearTimeout(timer);
    }, [highlightedId, messages]);

    // Разбор сообщения в запись дня — только у куратора.
    const openApplyPanel = useCallback((message) => {
      setApplyError(null);
      setApplyTarget(message);
    }, []);

    const closeApplyPanel = useCallback(() => {
      setApplyTarget(null);
      setApplyError(null);
    }, []);

    const submitApply = useCallback(async (summary) => {
      const target = applyTarget;
      if (!target) return;
      setApplyBusy(true);
      setApplyError(null);
      const res = await HEYS.MessengerAPI.setApplied(target.id, summary, true).catch(() => null);
      setApplyBusy(false);
      if (!mountedRef.current) return;
      if (!res?.success) {
        setApplyError(formatMessengerError(res?.error) || 'Не удалось сохранить разбор. Повторите попытку.');
        return;
      }
      // Отметка меняет и applied_at, и done_at — обновляем сообщение на месте,
      // не дожидаясь следующего поллинга.
      setMessages((prev) => prev.map((m) => (m.id === target.id
        ? { ...m, applied_at: res.applied_at, applied_summary: res.applied_summary, done_at: res.done_at }
        : m)));
      setApplyTarget(null);
      HEYS.MessengerAPI.refreshInbox?.();
    }, [applyTarget]);

    // Быстрые вставки из плашки. Обе дописывают в уже набранный текст и
    // оставляют фокус в поле — иначе на мобильном закроется клавиатура.
    const insertTimeIntoInput = useCallback((timeLabel) => {
      setInput((current) => {
        // Время в начале строки заменяем, а не дописываем второе.
        const withoutLeadingTime = current.replace(/^\s*([01]?\d|2[0-3])[:.][0-5]\d\s*/, '');
        return `${timeLabel} ${withoutLeadingTime}`.trimEnd() + (withoutLeadingTime ? '' : ' ');
      });
      const field = inputRef.current;
      if (!field) return;
      field.focus();
      requestAnimationFrame(() => {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      });
    }, []);

    const insertGramsIntoInput = useCallback(() => {
      const field = inputRef.current;
      setInput((current) => `${current.trimEnd()}${GRAMS_TEMPLATE}`);
      if (!field) return;
      field.focus();
      // Курсор встаёт на нули, чтобы человек сразу набрал число поверх них.
      requestAnimationFrame(() => {
        const zerosAt = field.value.lastIndexOf('000');
        if (zerosAt >= 0) field.setSelectionRange(zerosAt, zerosAt + 3);
      });
    }, []);

    const loadOlderHistory = useCallback(async () => {
      if (loadingOlder || !hasMoreHistory || messages.length === 0) return;
      const el = threadRef.current;
      if (el) {
        prependScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
        wasAtBottomRef.current = false;
      }
      await fetchAndMerge({
        silent: false,
        beforeTs: messages[0]?.created_at || null,
        prepend: true,
      });
    }, [fetchAndMerge, hasMoreHistory, loadingOlder, messages]);

    useEffect(() => {
      lastForeignIdRef.current = null;
      setMessages([]);
      historyPaginationStartedRef.current = false;
      setShowOldMessages(false);
      setHasMoreHistory(false);
      setError(null);
      ackVerificationRef.current = null;
      ackMutationIdsRef.current.clear();
      setPendingAckMessageIds(new Set());
    }, [isCurator, curatorViewClientId]);

    useEffect(() => {
      loadThread();
    }, [loadThread]);

    // Чек-лист грузится один раз на открытие треда: день меняется в других
    // экранах приложения, поэтому свежий снимок нужен именно в момент входа.
    // Ошибку не показываем — блок просто не появляется, остальной экран от
    // него не зависит.
    useEffect(() => {
      let cancelled = false;
      const opts = isCurator && curatorViewClientId ? { client_id: curatorViewClientId } : {};
      HEYS.MessengerAPI.getDayChecklist?.(opts)
        .then((res) => {
          if (cancelled || !mountedRef.current) return;
          setDayChecklist(res?.success && Array.isArray(res.items) ? res.items : []);
        })
        .catch(() => {
          if (!cancelled && mountedRef.current) setDayChecklist([]);
        });
      return () => { cancelled = true; };
    }, [isCurator, curatorViewClientId]);

    // ── Realtime polling: каждые 10 сек silent refresh пока модалка открыта ─
    // Cross-device sync: новые/удалённые/изменённые сообщения видны на других
    // открытых треда без ручного refresh. Звук notify при новом foreign-msg.
    useEffect(() => {
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchAndMerge({ silent: true });
        }
      }, 10000);
      // Также refresh при возврате во вкладку (если пропустили несколько polls)
      const refreshIfVisible = () => {
        if (document.visibilityState === 'visible') {
          fetchAndMerge({ silent: true });
        }
      };
      document.addEventListener('visibilitychange', refreshIfVisible);
      window.addEventListener('focus', refreshIfVisible);
      window.addEventListener('pageshow', refreshIfVisible);
      window.addEventListener('online', refreshIfVisible);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', refreshIfVisible);
        window.removeEventListener('focus', refreshIfVisible);
        window.removeEventListener('pageshow', refreshIfVisible);
        window.removeEventListener('online', refreshIfVisible);
      };
    }, [fetchAndMerge]);

    const activeTranscriptionKey = React.useMemo(() => pendingTranscriptKey(messages), [messages]);

    // Pending voice transcripts need a tighter watch than ordinary chat polling.
    // It stops as soon as fresh server data no longer contains queued/processing audio.
    useEffect(() => {
      if (!activeTranscriptionKey) return undefined;
      let stopped = false;
      let timer = null;
      let attempts = 0;
      const schedule = (delayMs) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (stopped) return;
          try {
            if (document.visibilityState === 'visible') {
              attempts += 1;
              await fetchAndMerge({ silent: true });
            }
          } finally {
            const delay = attempts < 8 ? 3500 : 10000;
            schedule(delay);
          }
        }, delayMs);
      };
      schedule(1200);
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    }, [activeTranscriptionKey, fetchAndMerge]);

    // Smart scroll: запоминаем был ли в самом низу ДО рендера, потом
    // скроллим только если был внизу (чтобы не утянуть пользователя
    // из середины треда при polling-refresh).
    useEffect(() => {
      const el = threadRef.current;
      if (!el) return;
      if (prependScrollRef.current) {
        const previous = prependScrollRef.current;
        prependScrollRef.current = null;
        el.scrollTop = getPrependScrollTop(previous.height, previous.top, el.scrollHeight);
        return;
      }
      if (wasAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    }, [messages]);

    // Tracking scroll position перед каждым обновлением messages
    useEffect(() => {
      const el = threadRef.current;
      if (!el) return;
      const onScroll = () => {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        wasAtBottomRef.current = distFromBottom < 80;
      };
      el.addEventListener('scroll', onScroll);
      return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const handleReply = (message) => {
      setReplyTo(message);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleAttachClick = () => {
      fileInputRef.current?.click();
    };

    const handlePhotoClick = (attachments, index) => {
      setLightbox({ attachments, index });
    };

    const deleteUploadedAttachmentBestEffort = useCallback((attachment) => {
      if (!attachment?.path) return;
      const deleteFn = isAudioAttachment(attachment)
        ? (window.HEYS?.StorageMedia?.deleteAudio || window.HEYS?.cloud?.deleteAudio)
        : (window.HEYS?.StoragePhotos?.deletePhoto || window.HEYS?.cloud?.deletePhoto);
      if (typeof deleteFn !== 'function') return;
      Promise.resolve(deleteFn(attachment.path)).catch(() => {});
    }, []);

    useEffect(() => {
      pendingMediaRef.current = { photos: pendingPhotos, audio: pendingAudio };
    }, [pendingPhotos, pendingAudio]);

    const cleanupRecordingHandles = () => {
      if (recordTickRef.current) {
        clearInterval(recordTickRef.current);
        recordTickRef.current = null;
      }
      if (recordStopTimerRef.current) {
        clearTimeout(recordStopTimerRef.current);
        recordStopTimerRef.current = null;
      }
      const stream = recordStreamRef.current;
      if (stream?.getTracks) {
        stream.getTracks().forEach((track) => track.stop());
      }
      recordStreamRef.current = null;
    };

    useEffect(() => {
      mountedRef.current = true;
      return () => {
      mountedRef.current = false;
      threadGenerationRef.current += 1;
      for (const photo of pendingMediaRef.current.photos || []) {
        cancelledUploadIdsRef.current.add(photo.tempId);
        deleteUploadedAttachmentBestEffort(photo);
      }
      if (pendingMediaRef.current.audio) {
        cancelledUploadIdsRef.current.add(pendingMediaRef.current.audio.tempId);
        deleteUploadedAttachmentBestEffort(pendingMediaRef.current.audio);
      }
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch { /* ignore */ }
      cleanupRecordingHandles();
      if (pendingAudioUrlRef.current) {
        URL.revokeObjectURL(pendingAudioUrlRef.current);
        pendingAudioUrlRef.current = null;
      }
      optimisticAudioUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      });
      optimisticAudioUrlsRef.current.clear();
      localAudioByRemoteRef.current.clear();
      };
    }, [deleteUploadedAttachmentBestEffort]);

    const uploadVoiceBlob = async (blob, durationMs, tempId) => {
      if (!blob || blob.size < MIN_VOICE_BYTES) {
        setPendingAudio(null);
        setError('Голосовое получилось пустым. Проверьте микрофон macOS и попробуйте ещё раз.');
        return;
      }
      let uploadBlob = blob;
      let convertedForTranscription = false;
      const localUrl = URL.createObjectURL(blob);
      if (pendingAudioUrlRef.current) URL.revokeObjectURL(pendingAudioUrlRef.current);
      pendingAudioUrlRef.current = localUrl;
      setPendingAudio({
        tempId,
        status: 'uploading',
        localUrl,
        mime: blob.type || 'audio/webm',
        duration_ms: durationMs,
        size_bytes: blob.size,
      });

      const targetClientId = isCurator
        ? (curatorViewClientId || getCurrentClientId())
        : getCurrentClientId();
      if (!targetClientId) {
        setPendingAudio((prev) => prev && prev.tempId === tempId ? { ...prev, status: 'error' } : prev);
        setError('Не найден клиент для отправки голосового.');
        return;
      }

      try {
        const liveConsent = await refreshTranscriptionConsent() || transcriptionConsentRef.current;
        const shouldPrepareForTranscription = true;
        if (shouldPrepareForTranscription && !supportsPilotTranscription({ mime: uploadBlob.type })) {
          try {
            const converted = await convertBlobToSpeechkitWav(uploadBlob);
            if (converted && supportsPilotTranscription({ mime: converted.type })) {
              uploadBlob = converted;
              convertedForTranscription = true;
              setPendingAudio((prev) => prev && prev.tempId === tempId
                ? {
                    ...prev,
                    mime: uploadBlob.type || 'audio/wav',
                    size_bytes: uploadBlob.size,
                  }
                : prev);
            }
          } catch (err) {
            console.warn('[HEYS.messenger.voice] wav conversion failed', {
              mime: blob.type || 'audio/webm',
              error: err?.message || String(err),
            });
          }
        }
        try {
          console.warn('[HEYS.messenger.voice] upload format', {
            originalMime: blob.type || 'audio/webm',
            uploadMime: uploadBlob.type || blob.type || 'audio/webm',
            consentGranted: !!liveConsent?.granted,
            consentDecided: !!liveConsent?.decided,
            preparedForTranscription: shouldPrepareForTranscription,
            convertedForTranscription,
            supportsTranscription: supportsPilotTranscription({ mime: uploadBlob.type }),
          });
        } catch { /* ignore */ }
        const dataUrl = await blobToDataUrl(uploadBlob);
        const uploadFn = window.HEYS?.StorageMedia?.uploadAudio || window.HEYS?.cloud?.uploadAudio;
        if (typeof uploadFn !== 'function') {
          throw new Error('StorageMedia.uploadAudio unavailable');
        }
        const today = new Date().toISOString().slice(0, 10);
        const result = await uploadFn(dataUrl, targetClientId, today, 'msg-' + tempId, {
          blob: uploadBlob,
          durationMs,
        });
        // Сигнал успеха — `path`, не `url`: `/photos/upload` перестал отдавать
        // `url` (2026-08-11, публичная ссылка на бакет закрыта). Проверка
        // `!result?.url` здесь останавливала бы КАЖДУЮ отправку голосового —
        // самый серьёзный побочный эффект из всех мест, читавших это поле.
        if (result?.error || !result?.path) {
          setPendingAudio((prev) => prev && prev.tempId === tempId ? { ...prev, status: 'error' } : prev);
          setError(result?.error || 'audio_upload_failed');
          return;
        }
        if (cancelledUploadIdsRef.current.has(tempId)) {
          cancelledUploadIdsRef.current.delete(tempId);
          deleteUploadedAttachmentBestEffort({ type: 'audio', path: result.path });
          return;
        }
        setPendingAudio((prev) => prev && prev.tempId === tempId
          ? {
              ...prev,
              status: 'done',
              url: result.url,
              path: result.path,
              mime: result.mime || uploadBlob.type || blob.type || 'audio/webm',
              size_bytes: result.size_bytes || uploadBlob.size || blob.size,
              converted_for_transcription: convertedForTranscription,
            }
          : prev);
      } catch (err) {
        setPendingAudio((prev) => prev && prev.tempId === tempId ? { ...prev, status: 'error' } : prev);
        setError(err?.message || 'audio_upload_failed');
      }
    };

    const stopVoiceRecording = () => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanupRecordingHandles();
        setRecordingState('idle');
        setRecordingMs(0);
        return;
      }
      setRecordingState('stopping');
      try {
        recorder.stop();
      } catch {
        cleanupRecordingHandles();
        setRecordingState('idle');
        setRecordingMs(0);
      }
    };

    const startVoiceRecording = async () => {
      if (recordingState === 'recording') {
        stopVoiceRecording();
        return;
      }
      if (recordingState !== 'idle' || sending || pendingAudio?.status === 'uploading') return;
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Запись голосовых не поддерживается в этом браузере.');
        return;
      }
      setError(null);
      try {
        if (pendingAudioUrlRef.current) {
          URL.revokeObjectURL(pendingAudioUrlRef.current);
          pendingAudioUrlRef.current = null;
        }
        setPendingAudio(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        const mimeType = pickRecorderMime();
        const options = mimeType
          ? { mimeType, audioBitsPerSecond: 48000 }
          : { audioBitsPerSecond: 48000 };
        const recorder = new MediaRecorder(stream, options);
        const tempId = 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        recordChunksRef.current = [];
        recordStreamRef.current = stream;
        recorderRef.current = recorder;
        recordStartedAtRef.current = Date.now();

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) recordChunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
          cleanupRecordingHandles();
          setRecordingState('idle');
          setRecordingMs(0);
          setError('Не удалось записать голосовое.');
        };
        recorder.onstop = () => {
          const durationMs = Math.max(250, Date.now() - recordStartedAtRef.current);
          const chunks = recordChunksRef.current.slice();
          const type = recorder.mimeType || mimeType || 'audio/webm';
          cleanupRecordingHandles();
          setRecordingState('idle');
          setRecordingMs(0);
          if (chunks.length === 0) {
            setError('Голосовое получилось пустым.');
            return;
          }
          const blob = new Blob(chunks, { type });
          void uploadVoiceBlob(blob, durationMs, tempId);
        };

        recorder.start(250);
        setRecordingState('recording');
        setRecordingMs(0);
        recordTickRef.current = setInterval(() => {
          const elapsed = Date.now() - recordStartedAtRef.current;
          setRecordingMs(Math.min(elapsed, MAX_VOICE_DURATION_MS));
        }, 250);
        recordStopTimerRef.current = setTimeout(() => {
          stopVoiceRecording();
        }, MAX_VOICE_DURATION_MS);
      } catch (err) {
        cleanupRecordingHandles();
        setRecordingState('idle');
        setRecordingMs(0);
        setError(err?.name === 'NotAllowedError'
          ? 'Нет доступа к микрофону.'
          : (err?.message || 'Не удалось включить микрофон.'));
      }
    };

    const removePendingAudio = () => {
      if (recordingState === 'recording') stopVoiceRecording();
      if (pendingAudio?.tempId) cancelledUploadIdsRef.current.add(pendingAudio.tempId);
      deleteUploadedAttachmentBestEffort(pendingAudio);
      if (pendingAudioUrlRef.current) {
        URL.revokeObjectURL(pendingAudioUrlRef.current);
        pendingAudioUrlRef.current = null;
      }
      setPendingAudio(null);
    };

    // Загрузка фото: compress на клиенте → uploadPhoto через готовый
    // HEYS.StoragePhotos API → меняем pendingPhoto на done с url/path.
    const handleFilesSelected = async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = ''; // позволить выбрать тот же файл повторно
      if (files.length === 0) return;
      if (pendingPhotos.length + files.length > 10) {
        setError('Максимум 10 фото на сообщение.');
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const targetClientId = isCurator
        ? (curatorViewClientId || getCurrentClientId())
        : getCurrentClientId();

      for (const file of files) {
        const tempId = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        let localPreview;
        try {
          const compressed = await compressImageToBase64(file);
          localPreview = compressed.base64;
          // Угадываем mime по data: URL префиксу — WebP если он реально вышел
          const mime = compressed.base64.startsWith('data:image/webp')
            ? 'image/webp'
            : 'image/jpeg';
          // Optimistic preview
          setPendingPhotos((prev) => [
            ...prev,
            {
              tempId, localPreview, status: 'uploading',
              filename: file.name, width: compressed.width, height: compressed.height,
              mime,
            },
          ]);
          // Без сети грузить нечего: снимок ждёт в черновике и уйдёт на
          // сервер, когда соединение вернётся.
          if (isOffline()) {
            setPendingPhotos((prev) =>
              prev.map((p) => p.tempId === tempId ? { ...p, status: 'pending-upload' } : p)
            );
            continue;
          }
          // Upload в фоне
          const dummyMealId = 'msg-' + tempId;
          const uploadFn = window.HEYS?.StoragePhotos?.uploadPhoto;
          if (typeof uploadFn !== 'function') {
            throw new Error('StoragePhotos.uploadPhoto unavailable');
          }
          const result = await uploadFn(compressed.base64, targetClientId, today, dummyMealId);
          if (result?.error || !result?.url) {
            setPendingPhotos((prev) =>
              prev.map((p) => p.tempId === tempId ? { ...p, status: 'error' } : p)
            );
            setError(result?.error || 'photo_upload_failed');
            continue;
          }
          if (cancelledUploadIdsRef.current.has(tempId)) {
            cancelledUploadIdsRef.current.delete(tempId);
            deleteUploadedAttachmentBestEffort({ type: 'image', path: result.path });
            continue;
          }
          setPendingPhotos((prev) =>
            prev.map((p) => p.tempId === tempId
              ? { ...p, status: 'done', url: result.url, path: result.path }
              : p),
          );
        } catch (err) {
          setPendingPhotos((prev) =>
            prev.map((p) => p.tempId === tempId ? { ...p, status: 'error' } : p)
          );
          setError(err?.message || 'photo_compress_failed');
        }
      }
    };

    const removePendingPhoto = (tempId) => {
      const pending = pendingPhotos.find((photo) => photo.tempId === tempId);
      cancelledUploadIdsRef.current.add(tempId);
      deleteUploadedAttachmentBestEffort(pending);
      setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
    };

    const needsTranscriptionConsentPrompt = async (audio) => {
      if (!audio || !isAudioAttachment(audio)) return false;
      const known = await refreshTranscriptionConsent() || transcriptionConsentRef.current || transcriptionConsent;
      return !known?.decided;
    };

    const maybePromptTranscriptionConsentAfterSend = (audio, messageId) => {
      if (!audio || !messageId || !isAudioAttachment(audio)) return;
      if ((transcriptionConsentRef.current || transcriptionConsent)?.decided) return;
      pendingTranscriptionMessageRef.current = messageId;
      setTimeout(async () => {
        try {
          if (await needsTranscriptionConsentPrompt(audio)) {
            setTranscriptionPromptOpen(true);
          } else {
            pendingTranscriptionMessageRef.current = null;
          }
        } catch {
          pendingTranscriptionMessageRef.current = null;
          // Consent prompt is optional for message delivery.
        }
      }, 0);
    };

    const handleSend = async () => {
      const trimmed = input.trim();
      const readyAttachments = pendingPhotos.filter((p) => p.status === 'done');
      const readyAudio = pendingAudio && pendingAudio.status === 'done' ? pendingAudio : null;
      const hasUploading = pendingPhotos.some((p) => p.status === 'uploading') ||
        pendingAudio?.status === 'uploading' ||
        recordingState === 'recording' ||
        recordingState === 'stopping';
      if (hasUploading) {
        setError(recordingState === 'recording' || recordingState === 'stopping'
          ? 'Заверши запись голосового перед отправкой.'
          : 'Подожди, вложение ещё загружается...');
        return;
      }
      // Фото без сети на сервер не попало, а в очередь уходит только ссылка.
      // Отправить сейчас значило бы отправить текст без снимка — вместо этого
      // держим всё в черновике до возвращения сети.
      if (pendingPhotos.some((p) => p.status === 'pending-upload')) {
        setError('Нет сети — фото пока не отправить. Сообщение и снимок сохранены, отправим вместе, когда связь появится.');
        return;
      }
      // Должно быть хоть что-то: текст, фото или голосовое.
      if (!trimmed && readyAttachments.length === 0 && !readyAudio) return;
      if (sending) return;
      setSending(true);
      setError(null);
      // Если есть quote-context — prefix body цитатой
      const finalBody = trimmed
        ? (replyTo ? `> ${messagePreview(replyTo)}\n\n${trimmed}` : trimmed)
        : null;
      const attachmentsToSend = readyAttachments.map((p) => ({
        type: 'image',
        url: p.url,
        path: p.path,
        filename: p.filename,
        width: p.width,
        height: p.height,
        mime: p.mime || 'image/jpeg',
      }));
      if (readyAudio) {
        const liveConsent = transcriptionConsentRef.current || transcriptionConsent || null;
        const audioAttachment = {
          type: 'audio',
          url: readyAudio.url,
          path: readyAudio.path,
          filename: readyAudio.filename || 'voice-message.webm',
          mime: normalizeMime(readyAudio.mime || 'audio/webm'),
          duration_ms: readyAudio.duration_ms,
          size_bytes: readyAudio.size_bytes,
          waveform: readyAudio.waveform || getWaveformBars(readyAudio),
        };
        // Если человек поправил расшифровку — уходит его версия, не машинная.
        const editedTranscript = typeof pendingAudioTranscript === 'string' ? pendingAudioTranscript.trim() : '';
        if (editedTranscript && editedTranscript !== (readyAudio.transcript_text || '').trim()) {
          audioAttachment.transcript_text = editedTranscript;
          audioAttachment.transcript_status = 'ready';
          audioAttachment.transcript_provider = 'client_edited';
        }
        const supportsTranscription = supportsPilotTranscription(audioAttachment);
        if (supportsTranscription) {
          audioAttachment.transcript_status = liveConsent?.granted ? 'queued' : 'consent_required';
          if (liveConsent?.granted) audioAttachment.transcript_provider = 'yandex_speechkit';
        } else if (liveConsent?.granted) {
          audioAttachment.transcript_status = 'unsupported_format';
        }
        attachmentsToSend.push(audioAttachment);
        try {
          console.warn('[HEYS.messenger.voice] send audio', {
            mime: audioAttachment.mime,
            supportsTranscription,
            consentGranted: !!liveConsent?.granted,
            consentDecided: !!liveConsent?.decided,
            transcriptStatus: audioAttachment.transcript_status || 'none',
            durationMs: audioAttachment.duration_ms,
          });
        } catch { /* ignore */ }
      }
      const attachmentsForDisplay = attachmentsToSend.map((att) => ({ ...att }));
      if (readyAudio?.localUrl) {
        const audioDisplay = attachmentsForDisplay.find((att) => isAudioAttachment(att));
        if (audioDisplay) {
          audioDisplay.localUrl = readyAudio.localUrl;
          optimisticAudioUrlsRef.current.add(readyAudio.localUrl);
          rememberLocalAudio(audioDisplay);
        }
      }
      const payload = isCurator
        ? { client_id: curatorViewClientId || getCurrentClientId(), body: finalBody, attachments: attachmentsToSend }
        : { body: finalBody, attachments: attachmentsToSend };
      const requestId = HEYS.MessengerAPI._createRequestId
        ? HEYS.MessengerAPI._createRequestId()
        : String(Date.now());

      // Без сети не показываем ошибку и не теряем текст: кладём в очередь и
      // отправляем сами, когда соединение вернётся.
      if (isOffline()) {
        const entry = { request_id: requestId, payload, created_at: new Date().toISOString() };
        const queue = [...readQueue(outboxClientId), entry];
        writeQueue(outboxClientId, queue);
        setOutbox(queue);
        setSending(false);
        setInput('');
        setReplyTo(null);
        setPendingPhotos([]);
        pendingAudioUrlRef.current = null;
        setPendingAudio(null);
        return;
      }

      const res = await HEYS.MessengerAPI.send(payload, { requestId });
      setSending(false);
      if (!res?.success) {
        if (res?.statusCode === 429) {
          setError(`Слишком много сообщений. Подожди ${res.retryAfter || 60} сек.`);
          return;
        }
        // Транспорт отвалился уже после ввода — то же, что офлайн: в очередь,
        // с тем же request_id, поэтому повтор не создаст дубль.
        if (isNetworkFailure(res)) {
          const entry = { request_id: requestId, payload, created_at: new Date().toISOString() };
          const queue = [...readQueue(outboxClientId), entry];
          writeQueue(outboxClientId, queue);
          setOutbox(queue);
          setInput('');
          setReplyTo(null);
          setPendingPhotos([]);
          pendingAudioUrlRef.current = null;
          setPendingAudio(null);
          return;
        }
        setError(res?.error || 'send_failed');
        return;
      }
      if (readyAudio) {
        try {
          console.warn('[HEYS.messenger.voice] sent', {
            messageId: res.message_id,
            transcriptStatus: attachmentsToSend.find((att) => isAudioAttachment(att))?.transcript_status || 'none',
          });
        } catch { /* ignore */ }
      }
      maybePromptTranscriptionConsentAfterSend(readyAudio, res.message_id);
      setInput('');
      setReplyTo(null);
      setPendingPhotos([]);
      pendingAudioUrlRef.current = null;
      setPendingAudio(null);
      setPendingAudioTranscript(null);
      // Optimistic: добавим в ленту, затем перезагрузим из БД
      const optimistic = {
        id: res.message_id,
        sender_role: viewerRole,
        body: finalBody,
        intent_type: null,
        intent_payload: null,
        applied_at: null,
        attachments: attachmentsForDisplay,
        read_at: null,
        created_at: res.created_at || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
    };

    const handleKeyDown = (e) => {
      confirmKeyboardAttempt('keyboard-input');
      if (shouldSendMessageOnEnter(e)) {
        e.preventDefault();
        handleSend();
      }
    };

    // Редактирование своего сообщения. Оптимистично обновляем body+edited_at,
    // на ошибку откатываем. Возвращает true при успехе (для bubble — закрыть edit-mode).
    const handleEditMessage = async (message, newBody) => {
      const prevBody = message.body;
      const optimisticEditedAt = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, body: newBody, edited_at: optimisticEditedAt } : m))
      );
      const res = await HEYS.MessengerAPI.editMessage(message.id, newBody);
      if (!res?.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, body: prevBody, edited_at: message.edited_at || null } : m))
        );
        setError(res?.error || 'edit_failed');
        return false;
      }
      // Используем server-truth для edited_at
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, edited_at: res.edited_at || optimisticEditedAt } : m))
      );
      return true;
    };

    const requestDeleteMessage = (message) => {
      setError(null);
      setDeleteConfirm(message);
    };

    const cancelDeleteMessage = () => {
      if (deletingMessageId) return;
      setDeleteConfirm(null);
    };

    // Удаление своего сообщения (hard delete). Оптимистично убираем из
    // локального state, на ошибку — возвращаем обратно.
    const confirmDeleteMessage = async () => {
      const message = deleteConfirm;
      if (!message || deletingMessageId) return;
      const snapshot = messages;
      setDeletingMessageId(message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      const res = await HEYS.MessengerAPI.deleteMessage(message.id);
      setDeletingMessageId(null);
      if (!res?.success) {
        setMessages(snapshot);
        const transientDeleteError = res?.statusCode === 502 || res?.statusCode === 503 || res?.statusCode === 504;
        setError(transientDeleteError
          ? 'Не удалось удалить сообщение. Повторите попытку чуть позже.'
          : (res?.error || 'Не удалось удалить сообщение.'));
        return;
      }
      setDeleteConfirm(null);
      // Удалили — мог упасть unread (если удалили необработанное сообщение клиента).
      // Тригерим refresh badges во всех местах сразу.
      HEYS.MessengerAPI.refreshFabUnread?.();
      HEYS.MessengerAPI.refreshInbox?.();
    };

    // Desired-state ack для обеих ролей: повтор безопасен и не меняет состояние обратно.
    // Оптимистично переключаем соответствующее поле в local state, на ошибку — rollback.
    const handleToggleAck = async (message) => {
      if (!acquireMessageMutation(ackMutationIdsRef.current, message?.id)) return;
      const field = isCurator ? 'done_at' : 'acked_at';
      const prevValue = message[field] || null;
      const optimisticValue = prevValue ? null : new Date().toISOString();
      const desiredState = !prevValue;
      const generation = threadGenerationRef.current;
      const verificationClientId = isCurator
        ? (curatorViewClientId || getCurrentClientId())
        : null;
      setPendingAckMessageIds((current) => new Set(current).add(message.id));
      setError(null);
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, [field]: optimisticValue } : m))
      );
      try {
        const res = isCurator
          ? await HEYS.MessengerAPI.setDone(message.id, desiredState)
          : await HEYS.MessengerAPI.setAcked(message.id, desiredState);
        if (!res?.success) {
          if (isAmbiguousMutationFailure(res)) {
            const pendingVerification = {
              messageId: message.id,
              field,
              desiredState,
            };
            ackVerificationRef.current = pendingVerification;
            setError(ACK_CONFIRMING_ERROR);
            const verification = await verifyMessageMutation(HEYS.MessengerAPI, {
              message,
              field,
              desiredState,
              threadOptions: verificationClientId
                ? { client_id: verificationClientId }
                : {},
            });
            if (!mountedRef.current || generation !== threadGenerationRef.current) return;
            if (verification.verified) {
              ackVerificationRef.current = null;
              setMessages((prev) =>
                prev.map((m) => (m.id === message.id ? { ...m, [field]: verification.value } : m))
              );
              setError(verification.confirmed ? null : ACK_FAILED_ERROR);
              if (verification.confirmed) {
                HEYS.MessengerAPI.refreshFabUnread?.();
                if (isCurator) HEYS.MessengerAPI.refreshInbox?.();
              }
            }
            return;
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? { ...m, [field]: prevValue } : m))
          );
          setError(ACK_FAILED_ERROR);
          return;
        }
        const serverValue = isCurator ? res.done_at : res.acked_at;
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, [field]: serverValue || null } : m))
        );
        // Меняет unread — мгновенно обновляем все badges.
        HEYS.MessengerAPI.refreshFabUnread?.();
        // Inbox cache актуален только для куратора (он показывает счёт по клиентам)
        if (isCurator) HEYS.MessengerAPI.refreshInbox?.();
      } finally {
        ackMutationIdsRef.current.delete(message.id);
        if (mountedRef.current && generation === threadGenerationRef.current) {
          setPendingAckMessageIds((current) => {
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
        }
      }
    };

    const handleTranscriptionConsentChoice = async (granted) => {
      if (!HEYS.MessengerAPI?.setTranscriptionConsent) {
        setTranscriptionPromptOpen(false);
        const next = { granted: false, decided: true, version: '1.1' };
        transcriptionConsentRef.current = next;
        setTranscriptionConsent(next);
        setError('Не удалось сохранить согласие на расшифровку.');
        return;
      }
      setSavingTranscriptionConsent(true);
      const messageId = granted ? pendingTranscriptionMessageRef.current : null;
      const res = await HEYS.MessengerAPI.setTranscriptionConsent(!!granted, { message_id: messageId });
      setSavingTranscriptionConsent(false);
      if (!res?.success) {
        setError(res?.error || 'transcription_consent_failed');
        return;
      }
      const next = {
        granted: !!res.granted,
        decided: !!res.decided,
        created_at: res.created_at || null,
        revoked_at: res.revoked_at || null,
        version: res.version || '1.1',
      };
      transcriptionConsentRef.current = next;
      setTranscriptionConsent(next);
      try {
        console.warn('[HEYS.messenger.voice] transcription consent', {
          granted: !!res.granted,
          messageId,
          enqueue: res.transcription_enqueue || null,
        });
      } catch { /* ignore */ }
      pendingTranscriptionMessageRef.current = null;
      setTranscriptionPromptOpen(false);
    };

    const handleTranscriptionSettingsToggle = async () => {
      const currentlyGranted = !!(transcriptionConsentRef.current || transcriptionConsent)?.granted;
      if (currentlyGranted && !window.confirm('Отозвать согласие на расшифровку новых голосовых сообщений?')) return;
      setSavingTranscriptionConsent(true);
      setError(null);
      const res = await HEYS.MessengerAPI?.setTranscriptionConsent?.(!currentlyGranted);
      setSavingTranscriptionConsent(false);
      if (!res?.success) {
        setError(res?.error || 'transcription_consent_failed');
        return;
      }
      const next = {
        granted: !!res.granted,
        decided: !!res.decided,
        created_at: res.created_at || null,
        revoked_at: res.revoked_at || null,
        version: res.version || '1.1',
      };
      transcriptionConsentRef.current = next;
      setTranscriptionConsent(next);
    };

    return React.createElement(
      'div',
      {
        className: 'messenger-overlay',
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose?.();
        },
      },
      React.createElement(
        'div',
        {
          className: `messenger-modal${isCurator ? ' messenger-modal--curator' : ''}`,
          role: 'dialog',
          'aria-label': 'Мессенджер HEYS',
        },
        // Инбокс: на широком экране — левая колонка, на узком — отдельный
        // экран, пока клиент не выбран.
        isCurator && React.createElement(CuratorInbox, {
          rows: inboxRows,
          activeClientId: threadClientId,
          onSelect: (clientId) => setActiveClientId(clientId),
        }),
        React.createElement(
          'div',
          { className: 'messenger-pane' },
        // Header
        React.createElement(MessengerHeader, {
          isCurator,
          subtitle: isOffline()
            ? 'нет сети — синхронизируем позже'
            : getThreadSubtitle(messages, loading),
          offline: isOffline(),
          onClose,
          // Постоянная полоса согласия на расшифровку уехала из композера в
          // это меню: она нужна раз в жизни клиента, а место занимала всегда.
          menuItems: [
            {
              key: 'search',
              label: 'Поиск по переписке',
              hint: 'включая расшифровки голосовых',
              onSelect: () => setSearchOpen(true),
            },
            HEYS.MessengerAPI?.setTranscriptionConsent && {
              key: 'transcription',
              label: 'Расшифровка голосовых',
              hint: savingTranscriptionConsent
                ? 'сохраняем…'
                : transcriptionConsent?.granted
                  ? `включена${formatConsentDate(transcriptionConsent.created_at) ? ' с ' + formatConsentDate(transcriptionConsent.created_at) : ''}`
                  : transcriptionConsent?.decided
                    ? 'выключена'
                    : 'спросим перед первой расшифровкой',
              disabled: savingTranscriptionConsent,
              onSelect: handleTranscriptionSettingsToggle,
            },
          ],
        }),
        // Вторая строка шапки: чего ещё ждём в дне
        React.createElement(DayChecklistRow, {
          items: dayChecklist,
          isCurator,
          onPick: (template) => {
            setInput((current) => (current ? current : template));
            inputRef.current?.focus();
          },
        }),
        // Поиск занимает место треда: это отдельный режим, а не оверлей.
        searchOpen && React.createElement(SearchPanel, {
          isCurator,
          curatorViewClientId,
          onClose: () => setSearchOpen(false),
          onJump: jumpToMessage,
        }),
        // Thread
        !searchOpen && React.createElement(
          'div',
          { className: 'messenger-thread', ref: threadRef },
          loading
            ? React.createElement(ThreadSkeleton, null)
            : messages.length === 0
              ? React.createElement(EmptyThread, {
                  isCurator,
                  onPickPrompt: (template) => {
                    setInput((current) => (current ? current : template));
                    inputRef.current?.focus();
                  },
                })
              : (() => {
                  // Collapse: всё что старше RECENT_DAYS_LIMIT дней — скрываем
                  // за кнопкой «Показать ранее (N)». Кликнул → showOldMessages=true
                  // → всё разворачивается до конца сессии модалки.
                  const cutoffISO = getOldCutoffISO();
                  const oldMessages = messages.filter((m) => m.created_at < cutoffISO);
                  const recentMessages = messages.filter((m) => m.created_at >= cutoffISO);
                  const visibleMessages = showOldMessages
                    ? messages
                    : recentMessages;

                  const nodes = [];

                  // «Показать ранее» раскрывает загруженное и при необходимости
                  // запрашивает следующую серверную страницу.
                  if (!showOldMessages && (oldMessages.length > 0 || hasMoreHistory)) {
                    nodes.push(
                      React.createElement('button', {
                        key: 'show-older',
                        type: 'button',
                        className: 'messenger-show-older',
                        disabled: loadingOlder,
                        onClick: () => {
                          setShowOldMessages(true);
                          if (hasMoreHistory) void loadOlderHistory();
                        },
                      }, loadingOlder
                        ? 'Загружаю...'
                        : `Показать ранее${oldMessages.length ? ` · ${oldMessages.length}` : ''}`),
                    );
                  } else if (showOldMessages && hasMoreHistory) {
                    nodes.push(
                      React.createElement('button', {
                        key: 'load-older',
                        type: 'button',
                        className: 'messenger-show-older',
                        disabled: loadingOlder,
                        onClick: () => void loadOlderHistory(),
                      }, loadingOlder ? 'Загружаю…' : 'Загрузить более ранние'),
                    );
                  }

                  // Eager-load фото только для последних 5 сообщений — они
                  // в viewport при открытии. Старые на lazy чтобы не качать
                  // тысячи фото из длинной истории.
                  const EAGER_PHOTO_TAIL = 5;
                  const eagerThreshold = visibleMessages.length - EAGER_PHOTO_TAIL;
                  // Рендерим бабблы + вставляем date-separator между разными днями
                  let lastKey = null;
                  let msgIdx = 0;
                  for (const m of visibleMessages) {
                    const k = dayKey(m.created_at);
                    if (k !== lastKey) {
                      nodes.push(
                        React.createElement(DateSeparator, {
                          key: `sep-${k}`,
                          label: formatDayLabel(m.created_at),
                        }),
                      );
                      lastKey = k;
                    }
                    nodes.push(
                      React.createElement(MessageBubble, {
                        key: m.id,
                        message: m,
                        viewerRole,
                        onToggleAck: handleToggleAck,
                        ackPending: pendingAckMessageIds.has(m.id),
                        onDelete: requestDeleteMessage,
                        onReply: handleReply,
                        onEdit: handleEditMessage,
                        onPhotoClick: handlePhotoClick,
                        onApplyRequest: isCurator ? openApplyPanel : undefined,
                        highlighted: m.id === highlightedId,
                        eagerPhotos: msgIdx >= eagerThreshold,
                        transcriptionGranted: !!transcriptionConsent?.granted,
                      }),
                    );
                    msgIdx++;
                  }
                  for (const entry of outbox) {
                    nodes.push(React.createElement(MessageBubble, {
                      key: `queued-${entry.request_id}`,
                      message: queuedToOptimistic(entry, viewerRole),
                      viewerRole,
                    }));
                  }

                  return nodes;
                })(),
        ),
        // Error banner
        error &&
          React.createElement('div', { className: 'messenger-error' }, formatMessengerError(error)),
        // Композер: цитата, вложения, плашка и ряд ввода — одна зона,
        // фиксированная внизу модалки.
        React.createElement(
          'div',
          { className: 'messenger-composer' },
        React.createElement(OfflineQueueBar, {
          count: outbox.length,
          hasDraft: !!input.trim() && isOffline(),
          sending: flushing,
          onRetry: () => { void flushOutbox(); },
        }),
        // Панель разбора стоит над композером: сначала «что внести», потом ответ.
        applyTarget && React.createElement(ApplyToDayPanel, {
          message: applyTarget,
          busy: applyBusy,
          error: applyError,
          onCancel: closeApplyPanel,
          onApply: submitApply,
        }),
        // Reply-preview (если выбрано сообщение для ответа)
        replyTo &&
          React.createElement(
            'div',
            { className: 'messenger-reply-preview' },
            React.createElement('div', { className: 'messenger-reply-preview-bar' }),
            React.createElement(
              'div',
              { className: 'messenger-reply-preview-content' },
              React.createElement('div', { className: 'messenger-reply-preview-label' }, 'В ответ на'),
              React.createElement('div', { className: 'messenger-reply-preview-text' }, messagePreview(replyTo)),
            ),
            React.createElement('button', {
              type: 'button',
              className: 'messenger-reply-preview-close',
              onClick: () => setReplyTo(null),
              'aria-label': 'Отменить ответ',
            }, '✕'),
          ),
        // Pending photos preview (миниатюры до отправки)
        pendingPhotos.length > 0 &&
          React.createElement(
            'div',
            { className: 'messenger-pending-photos' },
            pendingPhotos.map((p) =>
              React.createElement(
                'div',
                { key: p.tempId, className: `messenger-pending-photo status-${p.status}` },
                React.createElement('img', { src: p.localPreview, alt: p.filename || 'фото' }),
                p.status === 'uploading' && React.createElement('div', { className: 'messenger-pending-spinner' }, '…'),
                p.status === 'error' && React.createElement('div', { className: 'messenger-pending-error' }, '!'),
                React.createElement('button', {
                  type: 'button',
                  className: 'messenger-pending-remove',
                  onClick: () => removePendingPhoto(p.tempId),
                  'aria-label': 'Убрать',
                }, '✕'),
              ),
            ),
          ),
        (pendingAudio || recordingState !== 'idle') &&
          React.createElement(
            'div',
            { className: 'messenger-pending-audio' },
            recordingState !== 'idle'
              ? React.createElement(
                  'div',
                  { className: 'messenger-recording-live' },
                  React.createElement('span', { className: 'messenger-recording-dot' }),
                  React.createElement('span', { className: 'messenger-recording-label' }, recordingState === 'stopping' ? 'Сохраняю...' : 'Идёт запись'),
                  React.createElement('span', { className: 'messenger-recording-time' }, formatDuration(recordingMs)),
                  React.createElement('button', {
                    type: 'button',
                    className: 'messenger-recording-stop',
                    onClick: stopVoiceRecording,
                    disabled: recordingState !== 'recording',
                    'aria-label': 'Остановить запись',
                  }, 'Стоп'),
                )
              : React.createElement(
                  'div',
                  { className: `messenger-audio-draft status-${pendingAudio.status}` },
                  React.createElement(AudioAttachment, { attachment: pendingAudio, compact: true }),
                  pendingAudio.status === 'uploading' && React.createElement('span', { className: 'messenger-audio-status' }, 'Загружаю...'),
                  pendingAudio.status === 'error' && React.createElement('span', { className: 'messenger-audio-status error' }, 'Не загрузилось'),
                  React.createElement('button', {
                    type: 'button',
                    className: 'messenger-pending-audio-remove',
                    onClick: removePendingAudio,
                    'aria-label': 'Убрать голосовое',
                  }, React.createElement(Icon, { name: 'close', size: 14 })),
                ),
          ),
        // Расшифровку можно поправить до отправки: SpeechKit ошибается в
        // названиях продуктов, и куратор получил бы неверный состав.
        !isCurator && pendingAudio?.status === 'done' && pendingAudioTranscript !== null &&
          React.createElement(
            'div',
            { className: 'messenger-transcript-draft' },
            React.createElement(
              'div',
              { className: 'messenger-transcript-draft__head' },
              React.createElement('span', { className: 'messenger-transcript-draft__label' }, 'Расшифровка'),
              React.createElement('span', { className: 'messenger-transcript-draft__note' }, 'можно поправить до отправки'),
            ),
            React.createElement('textarea', {
              className: 'messenger-transcript-draft__field',
              value: pendingAudioTranscript,
              rows: 2,
              maxLength: 2000,
              onChange: (e) => setPendingAudioTranscript(e.target.value),
              'aria-label': 'Текст расшифровки',
            }),
          ),
        // Напоминание клиенту: время + граммы в сообщениях о еде
        shouldShowFoodHint(messages, viewerRole, { dismissedForSession: foodHintHidden }) &&
          React.createElement(FoodHintCard, {
            onInsertTime: insertTimeIntoInput,
            onInsertGrams: insertGramsIntoInput,
            onHide: () => setFoodHintHidden(true),
          }),
        // Input
        React.createElement(
          'div',
          {
            // Подсветка фокуса и «активности» переехала на само поле ввода —
            // ряду отдельные модификаторы больше не нужны.
            className: [
              'messenger-input-row',
              keyboardDiagnostic ? 'messenger-input-row--keyboard-error' : '',
            ].filter(Boolean).join(' '),
          },
          React.createElement('input', {
            ref: fileInputRef,
            type: 'file',
            accept: 'image/*',
            multiple: true,
            style: { display: 'none' },
            onChange: handleFilesSelected,
          }),
          React.createElement(
            'div',
            { className: 'messenger-input-actions' },
            React.createElement('button', {
              type: 'button',
              className: 'messenger-attach',
              onClick: handleAttachClick,
              disabled: sending || pendingPhotos.length >= 10,
              'aria-label': 'Прикрепить фото',
              title: 'Прикрепить фото',
            }, React.createElement(Icon, { name: 'camera', size: 19 })),
            React.createElement('button', {
              type: 'button',
              className: `messenger-voice${recordingState === 'recording' ? ' is-recording' : ''}`,
              onClick: startVoiceRecording,
              disabled: sending || pendingAudio?.status === 'uploading' || recordingState === 'stopping',
              'aria-label': recordingState === 'recording' ? 'Остановить запись' : 'Записать голосовое',
              title: recordingState === 'recording' ? 'Остановить запись' : 'Записать голосовое',
            }, recordingState === 'recording'
              ? React.createElement('span', { className: 'messenger-voice__stop', 'aria-hidden': 'true' })
              : React.createElement(Icon, { name: 'mic', size: 19 })),
          ),
          React.createElement(
            'div',
            {
              className: `messenger-input-stack${keyboardDiagnostic ? ' messenger-input-stack--error' : ''}`,
            },
            React.createElement('textarea', {
              className: 'messenger-input',
              placeholder: isCurator ? 'Ответ клиенту' : 'Сообщение куратору',
              value: input,
              onChange: (e) => {
                confirmKeyboardAttempt('text-input');
                setInput(e.target.value);
              },
              onBeforeInput: () => confirmKeyboardAttempt('before-input'),
              onInput: () => confirmKeyboardAttempt('text-input'),
              onPointerDown: handleKeyboardGestureStart,
              onTouchStart: handleKeyboardGestureStart,
              onClick: handleKeyboardClick,
              onBlur: () => {
                if (keyboardRefocusInProgressRef.current) return;
                clearKeyboardAttemptTimer();
                keyboardAttemptRef.current = null;
              },
              onKeyDown: handleKeyDown,
              disabled: sending,
              rows: 1,
              maxLength: 2000,
              ref: inputRef,
              'aria-invalid': keyboardDiagnostic ? 'true' : undefined,
              'aria-describedby': keyboardDiagnostic ? 'messenger-keyboard-diagnostic' : undefined,
            }),
            keyboardDiagnostic && React.createElement(
              'div',
              {
                id: 'messenger-keyboard-diagnostic',
                className: 'messenger-keyboard-diagnostic',
                role: 'alert',
                'aria-live': 'polite',
              },
              React.createElement(
                'div',
                { className: 'messenger-keyboard-diagnostic__text' },
                React.createElement('strong', null, 'Не удалось открыть клавиатуру на iPhone.'),
                React.createElement('span', null, keyboardDiagnostic.detail),
                React.createElement(
                  'span',
                  null,
                  'Если повтор не поможет, сделайте скриншот и отправьте куратору. ',
                  React.createElement('b', null, `Код: ${keyboardDiagnostic.supportCode}`),
                ),
              ),
              React.createElement('button', {
                type: 'button',
                className: 'messenger-keyboard-diagnostic__retry',
                onClick: handleKeyboardRetry,
                disabled: sending,
              }, 'Повторить'),
            ),
          ),
          React.createElement(
            'button',
            {
              className: 'messenger-send' + (sending ? ' messenger-send--busy' : ''),
              onClick: handleSend,
              disabled: sending ||
                recordingState !== 'idle' ||
                pendingAudio?.status === 'uploading' ||
                (!input.trim() &&
                  pendingPhotos.filter((p) => p.status === 'done').length === 0 &&
                  pendingAudio?.status !== 'done'),
              'aria-label': 'Отправить',
            },
            // Знак ожидания один на весь продукт (контракт «Спиннеры» → «форма»).
            // Место — кнопка действия с запросом к серверу, поэтому берётся форма
            // «вид знака в кнопке»: дуга 18 обводкой 2,5 тоном текста кнопки,
            // кнопка сохраняет размер и радиус и гаснет до 60 %. Своё кольцо 16/2
            // с хвостом .35 снято. silent — у кнопки уже есть aria-label,
            // вложенный role='status' озвучил бы её второй раз.
            sending
              ? (window.HEYS?.WaitMark?.render?.(React, { mode: 'button', state: 'wait', silent: true }) || null)
              : React.createElement(Icon, { name: 'send', size: 20, strokeWidth: 1.9 }),
          ),
        ),
        ),
        transcriptionPromptOpen &&
          React.createElement(
            'div',
            { className: 'messenger-consent-backdrop' },
            React.createElement(
              'div',
              { className: 'messenger-consent-dialog', role: 'dialog', 'aria-label': 'Согласие на расшифровку' },
              React.createElement('div', { className: 'messenger-consent-title' }, 'Расшифровывать голосовые?'),
              React.createElement(
                'div',
                { className: 'messenger-consent-text' },
                'Передадим выбранное аудио в Yandex SpeechKit и сохраним полученный текст в чате. В записи могут быть сведения о здоровье. Голосовое отправится и без расшифровки.',
              ),
              React.createElement(
                'a',
                {
                  className: 'messenger-consent-link',
                  href: '/docs/speech-transcription-consent.md',
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
                'Прочитать полное согласие',
              ),
              React.createElement(
                'div',
                { className: 'messenger-consent-actions' },
                React.createElement('button', {
                  type: 'button',
                  className: 'messenger-consent-secondary',
                  disabled: savingTranscriptionConsent,
                  onClick: () => handleTranscriptionConsentChoice(false),
                }, 'Без расшифровки'),
                React.createElement('button', {
                  type: 'button',
                  className: 'messenger-consent-primary',
                  disabled: savingTranscriptionConsent,
                  onClick: () => handleTranscriptionConsentChoice(true),
                }, savingTranscriptionConsent ? 'Сохраняю...' : 'Согласен'),
              ),
            ),
          ),
        // Lightbox для фото
        lightbox && React.createElement(PhotoLightbox, {
          attachments: lightbox.attachments,
          index: lightbox.index,
          onIndexChange: (next) => setLightbox((current) => (current ? { ...current, index: next } : current)),
          onClose: () => setLightbox(null),
        }),
        deleteConfirm &&
          React.createElement(DeleteConfirmDialog, {
            message: deleteConfirm,
            busy: deletingMessageId === deleteConfirm.id,
            onCancel: cancelDeleteMessage,
            onConfirm: confirmDeleteMessage,
          }),
        ),
      ),
    );
  }

  // ── Mount/unmount API ────────────────────────────────────────────────
  let mountNode = null;
  let mountedRoot = null;
  let inAppToastNode = null;
  let inAppToastTimer = null;
  let inAppUnreadBaseline = null;
  let pageScrollLock = null;
  let pageScrollRestoreFrame = null;
  let pageScrollRestoreTimer = null;
  let pageScrollRestoreToken = 0;

  function isIOSDevice({
    platform = typeof navigator !== 'undefined' ? navigator.platform : '',
    maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
    vendor = typeof navigator !== 'undefined' ? navigator.vendor : '',
  } = {}) {
    if (typeof navigator === 'undefined') return false;
    const appleWebKitRuntime = /Apple/i.test(vendor || '');
    const classicIOSPlatform = /^(iPad|iPhone|iPod)$/.test(platform || '');
    const ipadDesktopMode = platform === 'MacIntel' && Number(maxTouchPoints) > 1;
    return appleWebKitRuntime && (classicIOSPlatform || ipadDesktopMode);
  }

  function shouldContainMessengerTouchMove({
    insideThread = false,
    scrollTop = 0,
    scrollHeight = 0,
    clientHeight = 0,
    deltaY = 0,
  } = {}) {
    if (!insideThread) return true;
    const maxScrollTop = Math.max(0, Number(scrollHeight) - Number(clientHeight));
    if (maxScrollTop <= 0) return true;
    if (deltaY > 0 && Number(scrollTop) <= 0) return true;
    if (deltaY < 0 && Number(scrollTop) >= maxScrollTop - 1) return true;
    return false;
  }

  function cancelPendingPageScrollRestore() {
    pageScrollRestoreToken += 1;
    if (pageScrollRestoreFrame !== null && typeof global.cancelAnimationFrame === 'function') {
      global.cancelAnimationFrame(pageScrollRestoreFrame);
    }
    if (pageScrollRestoreTimer !== null) clearTimeout(pageScrollRestoreTimer);
    pageScrollRestoreFrame = null;
    pageScrollRestoreTimer = null;
  }

  function lockPageScroll({
    useFixedBody = !isIOSDevice(),
    lockOverflow = !isIOSDevice(),
    containTouch = isIOSDevice(),
  } = {}) {
    if (pageScrollLock || typeof document === 'undefined') return;
    cancelPendingPageScrollRestore();
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    pageScrollLock = {
      scrollY,
      useFixedBody,
      lockOverflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
      rootOverflow: root.style.overflow,
      rootOverscrollBehavior: root.style.overscrollBehavior,
      touchStartHandler: null,
      touchMoveHandler: null,
    };
    if (lockOverflow) {
      root.style.overflow = 'hidden';
      root.style.overscrollBehavior = 'none';
      body.style.overflow = 'hidden';
      body.style.overscrollBehavior = 'none';
    }
    if (useFixedBody) {
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }
    if (containTouch) {
      let lastTouchY = null;
      pageScrollLock.touchStartHandler = (event) => {
        lastTouchY = Number(event.touches?.[0]?.clientY);
      };
      pageScrollLock.touchMoveHandler = (event) => {
        const currentTouchY = Number(event.touches?.[0]?.clientY);
        if (!Number.isFinite(currentTouchY) || !Number.isFinite(lastTouchY)) return;
        const deltaY = currentTouchY - lastTouchY;
        lastTouchY = currentTouchY;
        const target = typeof event.target?.closest === 'function'
          ? event.target
          : event.target?.parentElement;
        const thread = typeof target?.closest === 'function'
          ? target.closest('.messenger-thread')
          : null;
        if (shouldContainMessengerTouchMove({
          insideThread: !!thread,
          scrollTop: thread?.scrollTop,
          scrollHeight: thread?.scrollHeight,
          clientHeight: thread?.clientHeight,
          deltaY,
        }) && event.cancelable) {
          event.preventDefault();
        }
      };
      document.addEventListener('touchstart', pageScrollLock.touchStartHandler, {
        capture: true,
        passive: true,
      });
      document.addEventListener('touchmove', pageScrollLock.touchMoveHandler, {
        capture: true,
        passive: false,
      });
    }
  }

  function unlockPageScroll() {
    if (!pageScrollLock || typeof document === 'undefined') return;
    const body = document.body;
    const root = document.documentElement;
    const saved = pageScrollLock;
    pageScrollLock = null;
    if (saved.touchStartHandler) {
      document.removeEventListener('touchstart', saved.touchStartHandler, true);
    }
    if (saved.touchMoveHandler) {
      document.removeEventListener('touchmove', saved.touchMoveHandler, true);
    }
    body.style.position = saved.position;
    body.style.top = saved.top;
    body.style.left = saved.left;
    body.style.right = saved.right;
    body.style.width = saved.width;
    body.style.overflow = saved.overflow;
    body.style.overscrollBehavior = saved.overscrollBehavior;
    root.style.overflow = saved.rootOverflow;
    root.style.overscrollBehavior = saved.rootOverscrollBehavior;
    const restoreToken = ++pageScrollRestoreToken;
    const restoreScrollPosition = () => {
      if (restoreToken !== pageScrollRestoreToken || pageScrollLock) return;
      window.scrollTo(0, saved.scrollY);
    };
    restoreScrollPosition();
    if (!saved.useFixedBody) {
      if (typeof global.requestAnimationFrame === 'function') {
        pageScrollRestoreFrame = global.requestAnimationFrame(() => {
          pageScrollRestoreFrame = null;
          restoreScrollPosition();
        });
      }
      pageScrollRestoreTimer = setTimeout(() => {
        pageScrollRestoreTimer = null;
        restoreScrollPosition();
      }, 420);
    }
  }

  function openModal(opts = {}) {
    if (mountNode) return; // уже открыт
    lockPageScroll();
    mountNode = document.createElement('div');
    mountNode.className = 'messenger-portal';
    document.body.appendChild(mountNode);

    const close = () => {
      try {
        if (mountedRoot && typeof mountedRoot.unmount === 'function') {
          mountedRoot.unmount();
        } else if (ReactDOM.unmountComponentAtNode) {
          ReactDOM.unmountComponentAtNode(mountNode);
        }
      } catch {
        /* ignore */
      }
      if (mountNode && mountNode.parentNode) {
        mountNode.parentNode.removeChild(mountNode);
      }
      mountNode = null;
      mountedRoot = null;
      unlockPageScroll();
    };

    const el = React.createElement(MessengerModal, {
      onClose: close,
      curatorViewClientId: opts.curatorViewClientId || getCurrentClientId(),
    });

    if (ReactDOM.createRoot) {
      mountedRoot = ReactDOM.createRoot(mountNode);
      mountedRoot.render(el);
    } else {
      ReactDOM.render(el, mountNode);
    }
  }

  function closeModal() {
    if (!mountNode) return;
    try {
      if (mountedRoot && typeof mountedRoot.unmount === 'function') {
        mountedRoot.unmount();
      } else if (ReactDOM.unmountComponentAtNode) {
        ReactDOM.unmountComponentAtNode(mountNode);
      }
    } catch {
      /* ignore */
    }
    if (mountNode && mountNode.parentNode) {
      mountNode.parentNode.removeChild(mountNode);
    }
    mountNode = null;
    mountedRoot = null;
    unlockPageScroll();
  }

  function playInAppMessageCue() {
    try { window.HEYS?.feedback?.emit?.('message.incoming'); } catch { /* ignore */ }
  }

  function hideInAppMessageToast() {
    if (inAppToastTimer) {
      clearTimeout(inAppToastTimer);
      inAppToastTimer = null;
    }
    if (!inAppToastNode) return;
    inAppToastNode.classList.remove('is-visible');
    const node = inAppToastNode;
    inAppToastNode = null;
    setTimeout(() => {
      try {
        if (node.parentNode) node.parentNode.removeChild(node);
      } catch { /* ignore */ }
    }, 220);
  }

  function showInAppMessageToast(unreadCount) {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (mountNode) return;
    hideInAppMessageToast();

    const node = document.createElement('div');
    node.className = 'messenger-inapp-toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.innerHTML = `
      <span class="messenger-inapp-toast__icon" aria-hidden="true">💬</span>
      <span class="messenger-inapp-toast__copy">
        <strong>Куратор написал сообщение</strong>
        <span>${unreadCount > 1 ? `${unreadCount} непрочитанных сообщений` : 'Откройте диалог, чтобы прочитать'}</span>
      </span>
      <span class="messenger-inapp-toast__actions">
        <button class="messenger-inapp-toast__later" type="button">Позже</button>
        <button class="messenger-inapp-toast__read" type="button">Прочитать</button>
      </span>
    `;
    node.querySelector('.messenger-inapp-toast__later')?.addEventListener('click', () => {
      hideInAppMessageToast();
    });
    node.querySelector('.messenger-inapp-toast__read')?.addEventListener('click', () => {
      hideInAppMessageToast();
      openModal();
    });
    document.body.appendChild(node);
    inAppToastNode = node;
    requestAnimationFrame(() => node.classList.add('is-visible'));
    playInAppMessageCue();
  }

  function installInAppMessageToast() {
    if (typeof window === 'undefined' || window.__heysMessengerInAppToastInstalled) return;
    window.__heysMessengerInAppToastInstalled = true;
    try {
      window.HEYS?.MessengerAPI?.getFabUnreadCount?.();
    } catch { /* ignore */ }
    window.addEventListener('heys:messenger-fab-unread', (e) => {
      const next = Number(e.detail || 0);
      if (!Number.isFinite(next)) return;
      if (inAppUnreadBaseline == null) {
        inAppUnreadBaseline = next;
        return;
      }
      const prev = inAppUnreadBaseline;
      inAppUnreadBaseline = next;
      if (next > prev) showInAppMessageToast(next);
    });
  }

  // ── FAB button с badge непрочитанных ─────────────────────────────────
  function FabButton({ className = 'message-fab', ariaLabel = 'Написать куратору' }) {
    const [unread, setUnread] = useState(() =>
      window.HEYS?.MessengerAPI?.getFabUnreadCount?.() || 0
    );
    useEffect(() => {
      // Lazy-start polling при первом рендере FAB
      if (window.HEYS?.MessengerAPI?.getFabUnreadCount) {
        setUnread(window.HEYS.MessengerAPI.getFabUnreadCount());
      }
      const onUpdate = (e) => setUnread(e.detail || 0);
      window.addEventListener('heys:messenger-fab-unread', onUpdate);
      return () => window.removeEventListener('heys:messenger-fab-unread', onUpdate);
    }, []);

    return React.createElement('button', {
      className,
      onClick: () => window.HEYS?.Messenger?.openModal?.(),
      'aria-label': ariaLabel,
    },
      React.createElement(
        'span',
        { className: 'message-fab-icon' },
        React.createElement(Icon, { name: 'chat', size: 24, strokeWidth: 1.6 }),
      ),
      unread > 0 && React.createElement('span', {
        className: 'message-fab-badge',
        'aria-label': `${unread} непрочитанных сообщений`,
      }, unread > 99 ? '99+' : String(unread)),
    );
  }

  HEYS.Messenger = {
    openModal,
    closeModal,
    MessengerModal,
    FabButton,
    _test: {
      compareMessagesAsc,
      mergeMessagePage,
      mergeLatestMessagePage,
      getPrependScrollTop,
      getLatestForeignReadTs,
      isAmbiguousMutationFailure,
      getMessageStateConfirmation,
      getVerificationBeforeTs,
      verifyMessageMutation,
      acquireMessageMutation,
      formatMessengerError,
      shouldSendMessageOnEnter,
      focusMessageInputFromGesture,
      getKeyboardSurface,
      getKeyboardViewportSnapshot,
      hasKeyboardViewportEvidence,
      classifyKeyboardAttempt,
      getKeyboardDiagnostic,
      isIOSDevice,
      shouldContainMessengerTouchMove,
      showInAppMessageToast,
      hideInAppMessageToast,
      lockPageScroll,
      unlockPageScroll,
      THREAD_PAGE_LIMIT,
      DayChecklistRow,
      CHECKLIST_TEMPLATES,
      MessengerHeader,
      EmptyThread,
      ThreadSkeleton,
      PhotoLightbox,
      IntentCard,
      buildIntentCard,
      AppliedDayCard,
      ApplyToDayPanel,
      SearchPanel,
      buildSnippet,
      splitByMatch,
      searchableText,
      buildApplyDraft,
      parseMealItems,
      FoodHintCard,
      shouldShowFoodHint,
      shiftTimeLabel,
      OfflineQueueBar,
      CuratorInbox,
      sortInbox,
      filterInbox,
      formatWaiting,
      previewText,
      readQueue,
      writeQueue,
      readDraft,
      writeDraft,
      isNetworkFailure,
      queuedToOptimistic,
      MessageBubble,
      DateSeparator,
      Icon,
      ICON_PATHS,
      getInitials,
      resolveCuratorName,
    },
  };

  HEYS.Messenger._test.buildPhotoFailureDiagnostic = buildPhotoFailureDiagnostic;
  HEYS.Messenger._test.tracePhotoLoadFailure = tracePhotoLoadFailure;
  HEYS.Messenger._test.MessagePhoto = MessagePhoto;

  // Subscribe to deep-link event from heys_app_shortcuts_v1
  if (typeof window !== 'undefined') {
    installInAppMessageToast();
    window.addEventListener('heys:open-messenger', (e) => {
      openModal(e.detail || {});
    });
  }
})(typeof window !== 'undefined' ? window : global);
