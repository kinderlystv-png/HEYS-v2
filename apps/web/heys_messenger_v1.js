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

  function AudioAttachment({ attachment, compact, transcriptionGranted = false }) {
    const audioRef = useRef(null);
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
    }, [attachment?.url, attachment?.localUrl]);

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
          src: attachment.localUrl || attachment.url || '',
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
          React.createElement('div', {
            key: attachmentKey(att, idx),
            className: 'msg-attachment-item',
            onClick: () => onPhotoClick?.(photos, idx),
          },
            att.pending
              ? React.createElement('div', { className: 'msg-attachment-pending' }, '…')
              : null,
            React.createElement('img', {
              src: att.url || att.localPreview || '',
              alt: att.filename || 'фото',
              loading: eager ? 'eager' : 'lazy',
              decoding: 'async',
              width: att.width || undefined,
              height: att.height || undefined,
            }),
          ),
        ),
      ),
    );
  }

  // ── Thread message bubble ────────────────────────────────────────────
  function MessageBubble({
    message,
    viewerRole,
    onToggleAck,
    onDelete,
    onReply,
    onEdit,
    onPhotoClick,
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
    const ackAt = myAckAt || theirAckAt;
    const isAcked = !!ackAt;
    const canDelete = isMine; // каждый удаляет только свои
    const canReply = !isMine; // отвечать можно только на чужие
    const canEdit = isMine && !message.intent_type; // intent редактировать нельзя
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const editTextareaRef = useRef(null);

    // Парсим quote-prefix только для text-сообщений
    const parsed = message.body ? parseQuotedBody(message.body) : { quote: null, reply: '' };
    const replyText = message.body
      ? parsed.reply
      : message.intent_type === 'meal'
        ? `🍽️ Съел: ${message.intent_payload?.product_name ?? '?'} (${message.intent_payload?.grams ?? '?'}г)`
        : message.intent_type === 'training'
          ? `🏋️ ${message.intent_payload?.training_type ?? '?'} — ${message.intent_payload?.duration_min ?? '?'} мин`
          : message.intent_type === 'weight'
            ? `⚖️ Вес: ${message.intent_payload?.weight_kg ?? '?'} кг`
            : '';
    // Метка под пузырём: показываем что сделал каждый
    // (если есть обе метки — обе строкой; если только одна — её)
    const ackLabel = (() => {
      if (!isAcked) return null;
      const parts = [];
      if (message.done_at) parts.push(`✓ Обработано ${formatTime(message.done_at)}`);
      if (message.acked_at) parts.push(`✓ Принято ${formatTime(message.acked_at)}`);
      return parts.join(' · ');
    })();

    const bubbleClasses = [
      'msg-bubble',
      isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs',
      isAcked ? 'msg-bubble-done' : '',
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

    const deleteButton = canDelete
      ? React.createElement('button', {
          type: 'button',
          className: 'msg-delete-outside',
          onClick: handleDeleteClick,
          'aria-label': 'Удалить сообщение',
          title: 'Удалить сообщение',
        }, '🗑')
      : null;

    const ackButton = canMarkAck
      ? React.createElement('button', {
          type: 'button',
          className: `msg-ack-outside ${isAcked ? 'msg-ack-outside-active' : ''}`,
          onClick: () => onToggleAck?.(message),
          'aria-label': isAcked ? 'Снять отметку' : (isCurator ? 'Отметить как обработанное' : 'Принять'),
          title: isAcked
            ? 'Снять отметку'
            : (isCurator ? 'Отметить как обработанное' : 'Я прочитал и принял'),
        }, '✓')
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
        : replyText &&
            React.createElement('div', { className: 'msg-body' }, replyText),
      message.applied_at && !editing &&
        React.createElement('div', { className: 'msg-applied' }, '✅ Куратор применил в день'),
      ackLabel && !editing &&
        React.createElement('div', { className: 'msg-done' }, ackLabel),
      !editing && React.createElement(
        'div',
        { className: 'msg-meta-row' },
        canReply &&
          React.createElement('button', {
            type: 'button',
            className: 'msg-reply-btn',
            onClick: () => onReply?.(message),
            'aria-label': 'Ответить с цитатой',
            title: 'Ответить с цитатой',
          }, '↩'),
        canEdit &&
          React.createElement('button', {
            type: 'button',
            className: 'msg-edit-btn',
            onClick: handleEditStart,
            'aria-label': 'Редактировать сообщение',
            title: 'Редактировать сообщение',
          }, '✎'),
        message.edited_at &&
          React.createElement('span', {
            className: 'msg-edited-marker',
            title: `Изменено ${formatTime(message.edited_at)}`,
          }, 'изм.'),
        React.createElement('div', { className: 'msg-meta' }, formatTime(message.created_at)),
      ),
    );

    const children = isMine ? [deleteButton, bubble] : [bubble, ackButton];

    return React.createElement(
      'div',
      { className: `msg-row ${isMine ? 'msg-row-mine' : 'msg-row-theirs'}` },
      ...children,
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
      return `🍽️ ${p.product_name || '?'} ${p.grams || '?'}г`;
    }
    if (message.intent_type === 'training') {
      const p = message.intent_payload || {};
      return `🏋️ ${p.training_type || '?'} ${p.duration_min || '?'} мин`;
    }
    if (message.intent_type === 'weight') {
      return `⚖️ ${message.intent_payload?.weight_kg ?? '?'} кг`;
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
        React.createElement('div', { className: 'messenger-confirm-icon' }, '🗑'),
        React.createElement('div', { className: 'messenger-confirm-kicker' }, 'Удаление сообщения'),
        React.createElement('h3', { id: 'messenger-delete-title', className: 'messenger-confirm-title' }, 'Удалить это сообщение?'),
        React.createElement(
          'p',
          { id: 'messenger-delete-desc', className: 'messenger-confirm-text' },
          'Сообщение исчезнет из диалога. Восстановить его не получится.',
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

  // ── Main MessengerModal ──────────────────────────────────────────────
  function MessengerModal({ onClose, curatorViewClientId }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [input, setInput] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const [error, setError] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [showOldMessages, setShowOldMessages] = useState(false);
    const [pendingPhotos, setPendingPhotos] = useState([]); // [{tempId, localPreview, status:'uploading'|'done'|'error', url?, path?, filename?, width?, height?}]
    const [pendingAudio, setPendingAudio] = useState(null); // {tempId, status, localUrl, url?, path?, mime, duration_ms, size_bytes}
    const [recordingState, setRecordingState] = useState('idle'); // idle|recording|stopping
    const [recordingMs, setRecordingMs] = useState(0);
    const [transcriptionConsent, setTranscriptionConsent] = useState(null); // {granted, decided, created_at, revoked_at, version}
    const [transcriptionPromptOpen, setTranscriptionPromptOpen] = useState(false);
    const [savingTranscriptionConsent, setSavingTranscriptionConsent] = useState(false);
    const [lightbox, setLightbox] = useState(null); // {attachments, index} | null
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [deletingMessageId, setDeletingMessageId] = useState(null);
    const threadRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const recorderRef = useRef(null);
    const recordChunksRef = useRef([]);
    const recordStreamRef = useRef(null);
    const recordStartedAtRef = useRef(0);
    const recordTickRef = useRef(null);
    const recordStopTimerRef = useRef(null);
    const pendingAudioUrlRef = useRef(null);
    const pendingTranscriptionMessageRef = useRef(null);
    const transcriptionConsentRef = useRef(null);
    const optimisticAudioUrlsRef = useRef(new Set());
    const localAudioByRemoteRef = useRef(new Map());
    const isCurator = isCuratorMode();
    const viewerRole = isCurator ? 'curator' : 'client';

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

    const fetchAndMerge = useCallback(async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      const opts = isCurator && curatorViewClientId ? { client_id: curatorViewClientId } : {};
      const res = await HEYS.MessengerAPI.getThread(opts);
      if (!silent) setLoading(false);
      if (!res?.success) {
        if (!silent) setError(res?.error || 'unknown_error');
        return;
      }
      const sorted = (res.messages || []).slice().reverse().map(hydrateLocalAudio);

      // Smart merge: если пользователь сейчас редактирует сообщение, мы
      // не перезаписываем его свежим body с сервера (потеряет ввод).
      // Editing state живёт в MessageBubble local state — мы не знаем какие
      // именно editing. Простое правило: если timestamps совпадают (та же
      // запись) и body отличается локально только текстом — оставим local.
      // Для простоты в MVP: просто берём server-truth, edit-mode пересоздаст
      // bubble если кнопка ✎ остаётся активной (textarea сохранится через
      // useState внутри bubble — он привязан к key=m.id, не пересоздаётся).
      setMessages((prev) => {
        // Detect новые foreign сообщения для звука
        if (prev.length === 0 && lastForeignIdRef.current == null) {
          const lastForeign = sorted
            .slice()
            .reverse()
            .find((m) => m.sender_role !== viewerRole);
          lastForeignIdRef.current = lastForeign?.id || null;
          return sorted;
        }
        const prevIds = new Set(prev.map((m) => m.id));
        const newForeign = sorted.find(
          (m) => !prevIds.has(m.id) && m.sender_role !== viewerRole
        );
        if (newForeign && lastForeignIdRef.current !== newForeign.id) {
          lastForeignIdRef.current = newForeign.id;
          // Очевидный сигнал: двойной chime + вибрация (на мобиле очень
          // заметна). HEYS.audio.preview('notify') обходит quiet hours
          // и громче чем play() — для входящего сообщения это правильно.
          try {
            const audio = window.HEYS?.audio;
            if (audio?.preview) {
              audio.preview('notify');
              setTimeout(() => audio.preview('notify'), 220);
            } else if (audio?.play) {
              audio.play('notify');
              setTimeout(() => audio.play('notify'), 220);
            }
          } catch { /* ignore */ }
          try {
            if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 200]);
          } catch { /* ignore */ }
        }
        return sorted;
      });

      // Mark read — только при первом load (не silent)
      if (!silent && sorted.length > 0) {
        const latestTs = sorted[sorted.length - 1].created_at;
        const markPayload =
          isCurator && curatorViewClientId
            ? { client_id: curatorViewClientId, up_to_ts: latestTs }
            : { up_to_ts: latestTs };
        HEYS.MessengerAPI.markRead(markPayload)
          .then(() => HEYS.MessengerAPI.refreshFabUnread?.())
          .catch(() => {});
      }
    }, [isCurator, curatorViewClientId, viewerRole, hydrateLocalAudio]);

    const loadThread = useCallback(() => fetchAndMerge({ silent: false }), [fetchAndMerge]);

    useEffect(() => {
      loadThread();
    }, [loadThread]);

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

    useEffect(() => () => {
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
    }, []);

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
        if (result?.error || !result?.url) {
          setPendingAudio((prev) => prev && prev.tempId === tempId ? { ...prev, status: 'error' } : prev);
          setError(result?.error || 'audio_upload_failed');
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
            path: audioAttachment.path,
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
      const res = await HEYS.MessengerAPI.send(payload);
      setSending(false);
      if (!res?.success) {
        if (res?.statusCode === 429) {
          setError(`Слишком много сообщений. Подожди ${res.retryAfter || 60} сек.`);
        } else {
          setError(res?.error || 'send_failed');
        }
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
      if (e.key === 'Enter' && !e.shiftKey) {
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

    // Унифицированный toggle ack для обеих ролей. Симметричная семантика:
    //   - viewerRole='curator' тапает ✓ на client-msg → done_at (RPC toggle-done)
    //   - viewerRole='client' тапает ✓ на curator-msg → acked_at (RPC toggle-acked)
    // Оптимистично переключаем соответствующее поле в local state, на ошибку — rollback.
    const handleToggleAck = async (message) => {
      const field = isCurator ? 'done_at' : 'acked_at';
      const prevValue = message[field] || null;
      const optimisticValue = prevValue ? null : new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, [field]: optimisticValue } : m))
      );
      const res = isCurator
        ? await HEYS.MessengerAPI.toggleDone(message.id)
        : await HEYS.MessengerAPI.toggleAcked(message.id);
      if (!res?.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, [field]: prevValue } : m))
        );
        setError(res?.error || 'toggle_ack_failed');
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
    };

    const handleTranscriptionConsentChoice = async (granted) => {
      if (!HEYS.MessengerAPI?.setTranscriptionConsent) {
        setTranscriptionPromptOpen(false);
        const next = { granted: false, decided: true, version: '1.0' };
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
        version: res.version || '1.0',
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
        version: res.version || '1.0',
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
        { className: 'messenger-modal', role: 'dialog', 'aria-label': 'Мессенджер HEYS' },
        // Header
        React.createElement(
          'div',
          { className: 'messenger-header' },
          React.createElement(
            'div',
            { className: 'messenger-title-stack' },
            React.createElement(
              'div',
              { className: 'messenger-title' },
              '💬 ',
              isCurator ? 'Сообщения с клиентом' : 'Куратору',
            ),
            React.createElement(
              'div',
              { className: 'messenger-subtitle' },
              getThreadSubtitle(messages, loading),
            ),
          ),
          React.createElement(
            'button',
            { className: 'messenger-close', onClick: onClose, 'aria-label': 'Закрыть' },
            '✕',
          ),
        ),
        // Thread
        React.createElement(
          'div',
          { className: 'messenger-thread', ref: threadRef },
          loading
            ? React.createElement('div', { className: 'messenger-loading' }, 'Загружаю...')
            : messages.length === 0
              ? React.createElement(
                  'div',
                  { className: 'messenger-empty' },
                  isCurator
                    ? 'Нет сообщений от этого клиента.'
                    : 'Отправьте фото еды, вопрос или контекст по самочувствию.',
                )
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

                  // Кнопка «Показать ранее» — если есть скрытые
                  if (!showOldMessages && oldMessages.length > 0) {
                    nodes.push(
                      React.createElement('button', {
                        key: 'show-older',
                        type: 'button',
                        className: 'messenger-show-older',
                        onClick: () => setShowOldMessages(true),
                      }, `↑ Показать ранее (${oldMessages.length})`),
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
                        onDelete: requestDeleteMessage,
                        onReply: handleReply,
                        onEdit: handleEditMessage,
                        onPhotoClick: handlePhotoClick,
                        eagerPhotos: msgIdx >= eagerThreshold,
                        transcriptionGranted: !!transcriptionConsent?.granted,
                      }),
                    );
                    msgIdx++;
                  }
                  // Пустое состояние: если рекент пуст, но есть старые сообщения
                  if (visibleMessages.length === 0 && oldMessages.length > 0) {
                    nodes.push(
                      React.createElement(
                        'div',
                        { key: 'no-recent', className: 'messenger-empty' },
                        `Нет сообщений за последние ${RECENT_DAYS_LIMIT} дней.`,
                      ),
                    );
                  }
                  return nodes;
                })(),
        ),
        // Error banner
        error &&
          React.createElement('div', { className: 'messenger-error' }, error),
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
                  }, '✕'),
                ),
          ),
        HEYS.MessengerAPI?.setTranscriptionConsent &&
          React.createElement(
            'div',
            { className: `messenger-transcription-settings${transcriptionConsent?.granted ? ' is-enabled' : ''}` },
            React.createElement(
              'div',
              { className: 'messenger-transcription-settings__text' },
              React.createElement('span', { className: 'messenger-transcription-settings__title' }, 'Расшифровка голосовых'),
              React.createElement(
                'span',
                { className: 'messenger-transcription-settings__status' },
                transcriptionConsent?.granted
                  ? `включена${formatConsentDate(transcriptionConsent.created_at) ? ' с ' + formatConsentDate(transcriptionConsent.created_at) : ''}`
                  : transcriptionConsent?.decided
                    ? 'выключена'
                    : 'спросим перед первым OggOpus голосовым',
              ),
            ),
            React.createElement('button', {
              type: 'button',
              className: 'messenger-transcription-settings__button',
              disabled: savingTranscriptionConsent,
              onClick: handleTranscriptionSettingsToggle,
            }, savingTranscriptionConsent ? '...' : transcriptionConsent?.granted ? 'Отозвать' : 'Включить'),
          ),
        // Input
        React.createElement(
          'div',
          {
            className: [
              'messenger-input-row',
              inputFocused ? 'messenger-input-row--focused' : '',
              (input.trim() || pendingPhotos.length > 0 || pendingAudio || recordingState !== 'idle')
                ? 'messenger-input-row--active'
                : '',
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
            }, '📷'),
            React.createElement('button', {
              type: 'button',
              className: `messenger-voice${recordingState === 'recording' ? ' is-recording' : ''}`,
              onClick: startVoiceRecording,
              disabled: sending || pendingAudio?.status === 'uploading' || recordingState === 'stopping',
              'aria-label': recordingState === 'recording' ? 'Остановить запись' : 'Записать голосовое',
              title: recordingState === 'recording' ? 'Остановить запись' : 'Записать голосовое',
            }, recordingState === 'recording' ? '■' : '🎙'),
          ),
          React.createElement('textarea', {
            className: 'messenger-input',
            placeholder: isCurator ? 'Ответ клиенту...' : 'Сообщение куратору...',
            value: input,
            onChange: (e) => setInput(e.target.value),
            onFocus: () => setInputFocused(true),
            onBlur: () => setInputFocused(false),
            onKeyDown: handleKeyDown,
            disabled: sending,
            rows: 2,
            maxLength: 2000,
            ref: inputRef,
          }),
          React.createElement(
            'button',
            {
              className: 'messenger-send',
              onClick: handleSend,
              disabled: sending ||
                recordingState !== 'idle' ||
                pendingAudio?.status === 'uploading' ||
                (!input.trim() &&
                  pendingPhotos.filter((p) => p.status === 'done').length === 0 &&
                  pendingAudio?.status !== 'done'),
              'aria-label': 'Отправить',
            },
            sending ? '...' : '➤',
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
                'Для автоматической расшифровки аудио будет передано в Yandex SpeechKit. Голосовое отправится в любом случае.',
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
        lightbox &&
          React.createElement(
            'div',
            {
              className: 'messenger-lightbox',
              onClick: () => setLightbox(null),
            },
            React.createElement('img', {
              src: lightbox.attachments[lightbox.index]?.url,
              alt: 'фото',
              onClick: (e) => e.stopPropagation(),
            }),
            React.createElement('button', {
              type: 'button',
              className: 'messenger-lightbox-close',
              onClick: () => setLightbox(null),
              'aria-label': 'Закрыть',
            }, '✕'),
            lightbox.attachments.length > 1 && React.createElement(
              'div',
              { className: 'messenger-lightbox-counter' },
              `${lightbox.index + 1} / ${lightbox.attachments.length}`,
            ),
          ),
        deleteConfirm &&
          React.createElement(DeleteConfirmDialog, {
            message: deleteConfirm,
            busy: deletingMessageId === deleteConfirm.id,
            onCancel: cancelDeleteMessage,
            onConfirm: confirmDeleteMessage,
          }),
      ),
    );
  }

  // ── Mount/unmount API ────────────────────────────────────────────────
  let mountNode = null;
  let mountedRoot = null;
  let inAppToastNode = null;
  let inAppToastTimer = null;
  let inAppUnreadBaseline = null;

  function openModal(opts = {}) {
    if (mountNode) return; // уже открыт
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
  }

  function playInAppMessageCue() {
    try {
      const audio = window.HEYS?.audio;
      if (audio?.play) audio.play('notify');
      else if (audio?.preview) audio.preview('notify');
    } catch { /* ignore */ }
    try {
      if (navigator.vibrate) navigator.vibrate([80, 50, 120]);
    } catch { /* ignore */ }
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

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'messenger-inapp-toast';
    node.setAttribute('aria-label', 'Открыть новое сообщение в мессенджере');
    node.innerHTML = `
      <span class="messenger-inapp-toast__icon" aria-hidden="true">💬</span>
      <span class="messenger-inapp-toast__copy">
        <strong>Новое сообщение</strong>
        <span>${unreadCount > 1 ? `${unreadCount} непрочитанных` : 'Нажмите, чтобы открыть диалог'}</span>
      </span>
      <span class="messenger-inapp-toast__arrow" aria-hidden="true">›</span>
    `;
    node.addEventListener('click', () => {
      hideInAppMessageToast();
      openModal();
    });
    document.body.appendChild(node);
    inAppToastNode = node;
    requestAnimationFrame(() => node.classList.add('is-visible'));
    inAppToastTimer = setTimeout(hideInAppMessageToast, 6000);
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
      React.createElement('span', { className: 'message-fab-icon' }, '💬'),
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
  };

  // Subscribe to deep-link event from heys_app_shortcuts_v1
  if (typeof window !== 'undefined') {
    installInAppMessageToast();
    window.addEventListener('heys:open-messenger', (e) => {
      openModal(e.detail || {});
    });
  }
})(typeof window !== 'undefined' ? window : global);
