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

  function isCuratorMode() {
    // Куратор работает с JWT-токеном из heys_curator_session или supabase_auth_token.
    try {
      if (localStorage.getItem('heys_curator_session')) return true;
      const raw = localStorage.getItem('heys_supabase_auth_token');
      if (raw) {
        const parsed = JSON.parse(raw);
        return !!parsed?.access_token;
      }
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

  // ── Attachments grid ─────────────────────────────────────────────────
  // eager=true для последних сообщений (в viewport при открытии) — грузятся
  // сразу, мгновенный показ. Для остальных — lazy, чтобы не качать тысячи
  // фото из длинной истории при каждом открытии треда.
  function MessageAttachments({ attachments, onPhotoClick, eager }) {
    if (!attachments || attachments.length === 0) return null;
    return React.createElement(
      'div',
      { className: `msg-attachments msg-attachments-count-${Math.min(attachments.length, 4)}` },
      attachments.map((att, idx) =>
        React.createElement('div', {
          key: att.url || att.path || idx,
          className: 'msg-attachment-item',
          onClick: () => onPhotoClick?.(attachments, idx),
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
    );
  }

  // ── Thread message bubble ────────────────────────────────────────────
  function MessageBubble({ message, viewerRole, onToggleAck, onDelete, onReply, onEdit, onPhotoClick, eagerPhotos }) {
    const isMine = message.sender_role === viewerRole;
    const isCurator = viewerRole === 'curator';
    // Курaтор тапает ✓ на client-msg → done_at. Клиент тапает ✓ на curator-msg → acked_at.
    // Унифицированный «ack» в UI с разной семантикой на backend.
    const canMarkAck = !isMine; // ✓ только на чужих сообщениях
    const ackAt = isCurator ? message.done_at : message.acked_at;
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
    const ackLabel = isAcked
      ? (isCurator
          ? `✓ Обработано ${formatTime(ackAt)}`
          : `✓ Принято ${formatTime(ackAt)}`)
      : null;

    const bubbleClasses = [
      'msg-bubble',
      isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs',
      isAcked ? 'msg-bubble-done' : '',
    ].filter(Boolean).join(' ');

    const handleDeleteClick = () => {
      if (!canDelete) return;
      if (!window.confirm('Удалить это сообщение? Восстановить не получится.')) return;
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

    // Кнопка удаления — вне капсулы, в той же row.
    // Для mine (справа) ставим слева от bubble, для theirs (слева) — справа.
    const deleteButton = canDelete
      ? React.createElement('button', {
          type: 'button',
          className: 'msg-delete-outside',
          onClick: handleDeleteClick,
          'aria-label': 'Удалить сообщение',
          title: 'Удалить сообщение',
        }, '🗑')
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
        canMarkAck &&
          React.createElement('button', {
            type: 'button',
            className: `msg-done-toggle ${isAcked ? 'msg-done-toggle-active' : ''}`,
            onClick: () => onToggleAck?.(message),
            'aria-label': isAcked ? 'Снять отметку' : (isCurator ? 'Отметить как обработанное' : 'Принять'),
            title: isAcked
              ? 'Снять отметку'
              : (isCurator ? 'Отметить как обработанное' : 'Я прочитал и принял'),
          }, isAcked ? '✓' : '○'),
        message.edited_at &&
          React.createElement('span', {
            className: 'msg-edited-marker',
            title: `Изменено ${formatTime(message.edited_at)}`,
          }, 'изм.'),
        React.createElement('div', { className: 'msg-meta' }, formatTime(message.created_at)),
      ),
    );

    // mine → [🗑] [bubble], theirs → [bubble] [🗑]
    const children = isMine ? [deleteButton, bubble] : [bubble, deleteButton];

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
    return '...';
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
          resolve({ base64: canvas.toDataURL('image/jpeg', 0.6), width, height });
        };
        img.onerror = () => reject(new Error('image_load_failed'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('file_read_failed'));
      reader.readAsDataURL(file);
    });
  }

  // ── Шаблоны быстрых ответов куратора ─────────────────────────────────
  const CURATOR_REPLY_TEMPLATES = [
    'Применено ✓',
    'Уточни граммы',
    'Фото пожалуйста',
    'Спасибо!',
  ];

  // ── Main MessengerModal ──────────────────────────────────────────────
  function MessengerModal({ onClose, curatorViewClientId }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [input, setInput] = useState('');
    const [error, setError] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [showOldMessages, setShowOldMessages] = useState(false);
    const [pendingPhotos, setPendingPhotos] = useState([]); // [{tempId, localPreview, status:'uploading'|'done'|'error', url?, path?, filename?, width?, height?}]
    const [lightbox, setLightbox] = useState(null); // {attachments, index} | null
    const threadRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const isCurator = isCuratorMode();
    const viewerRole = isCurator ? 'curator' : 'client';

    // Memo ID самого свежего сообщения с другой стороны (для звука)
    const lastForeignIdRef = useRef(null);
    // Was scrolled at bottom при последнем render (для smart scroll)
    const wasAtBottomRef = useRef(true);

    const fetchAndMerge = useCallback(async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      const opts = isCurator && curatorViewClientId ? { client_id: curatorViewClientId } : {};
      const res = await HEYS.MessengerAPI.getThread(opts);
      if (!silent) setLoading(false);
      if (!res?.success) {
        if (!silent) setError(res?.error || 'unknown_error');
        return;
      }
      const sorted = (res.messages || []).slice().reverse();

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
        const prevIds = new Set(prev.map((m) => m.id));
        const newForeign = sorted.find(
          (m) => !prevIds.has(m.id) && m.sender_role !== viewerRole
        );
        if (newForeign && lastForeignIdRef.current !== newForeign.id) {
          lastForeignIdRef.current = newForeign.id;
          try { window.HEYS?.audio?.play?.('notify'); } catch { /* ignore */ }
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
    }, [isCurator, curatorViewClientId, viewerRole]);

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
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          fetchAndMerge({ silent: true });
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }, [fetchAndMerge]);

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

    const handleTemplateClick = (template) => {
      setInput((prev) => (prev ? `${prev} ${template}` : template));
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleAttachClick = () => {
      fileInputRef.current?.click();
    };

    const handlePhotoClick = (attachments, index) => {
      setLightbox({ attachments, index });
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
          // Optimistic preview
          setPendingPhotos((prev) => [
            ...prev,
            {
              tempId, localPreview, status: 'uploading',
              filename: file.name, width: compressed.width, height: compressed.height,
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

    const handleSend = async () => {
      const trimmed = input.trim();
      const readyAttachments = pendingPhotos.filter((p) => p.status === 'done');
      const hasUploading = pendingPhotos.some((p) => p.status === 'uploading');
      if (hasUploading) {
        setError('Подожди, фото ещё загружается...');
        return;
      }
      // Должно быть хоть что-то: текст или фото
      if (!trimmed && readyAttachments.length === 0) return;
      if (sending) return;
      setSending(true);
      setError(null);
      // Если есть quote-context — prefix body цитатой
      const finalBody = trimmed
        ? (replyTo ? `> ${messagePreview(replyTo)}\n\n${trimmed}` : trimmed)
        : null;
      const attachmentsToSend = readyAttachments.map((p) => ({
        url: p.url,
        path: p.path,
        filename: p.filename,
        width: p.width,
        height: p.height,
        mime: 'image/jpeg',
      }));
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
      setInput('');
      setReplyTo(null);
      setPendingPhotos([]);
      // Optimistic: добавим в ленту, затем перезагрузим из БД
      const optimistic = {
        id: res.message_id,
        sender_role: viewerRole,
        body: finalBody,
        intent_type: null,
        intent_payload: null,
        applied_at: null,
        attachments: attachmentsToSend,
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

    // Удаление своего сообщения (hard delete). Оптимистично убираем из
    // локального state, на ошибку — возвращаем обратно.
    const handleDeleteMessage = async (message) => {
      const snapshot = messages;
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      const res = await HEYS.MessengerAPI.deleteMessage(message.id);
      if (!res?.success) {
        setMessages(snapshot);
        setError(res?.error || 'delete_failed');
        return;
      }
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
            { className: 'messenger-title' },
            '💬 ',
            isCurator ? 'Сообщения с клиентом' : 'Куратору',
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
                    : 'Напиши куратору что съел или о чём-то ещё.',
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
                        onDelete: handleDeleteMessage,
                        onReply: handleReply,
                        onEdit: handleEditMessage,
                        onPhotoClick: handlePhotoClick,
                        eagerPhotos: msgIdx >= eagerThreshold,
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
        // Шаблоны быстрых ответов (curator-only)
        isCurator &&
          React.createElement(
            'div',
            { className: 'messenger-templates' },
            CURATOR_REPLY_TEMPLATES.map((tpl) =>
              React.createElement('button', {
                key: tpl,
                type: 'button',
                className: 'messenger-template-chip',
                onClick: () => handleTemplateClick(tpl),
                disabled: sending,
              }, tpl),
            ),
          ),
        // Input
        React.createElement(
          'div',
          { className: 'messenger-input-row' },
          React.createElement('input', {
            ref: fileInputRef,
            type: 'file',
            accept: 'image/*',
            multiple: true,
            style: { display: 'none' },
            onChange: handleFilesSelected,
          }),
          React.createElement('button', {
            type: 'button',
            className: 'messenger-attach',
            onClick: handleAttachClick,
            disabled: sending || pendingPhotos.length >= 10,
            'aria-label': 'Прикрепить фото',
            title: 'Прикрепить фото',
          }, '📷'),
          React.createElement('textarea', {
            className: 'messenger-input',
            placeholder: isCurator ? 'Ответ клиенту...' : 'Напиши куратору...',
            value: input,
            onChange: (e) => setInput(e.target.value),
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
              disabled: sending || (!input.trim() && pendingPhotos.filter((p) => p.status === 'done').length === 0),
              'aria-label': 'Отправить',
            },
            sending ? '...' : '➤',
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
      ),
    );
  }

  // ── Mount/unmount API ────────────────────────────────────────────────
  let mountNode = null;
  let mountedRoot = null;

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
    window.addEventListener('heys:open-messenger', (e) => {
      openModal(e.detail || {});
    });
  }
})(typeof window !== 'undefined' ? window : global);
