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

  // ── Thread message bubble ────────────────────────────────────────────
  function MessageBubble({ message, viewerRole, onToggleDone, onDelete }) {
    const isMine = message.sender_role === viewerRole;
    const isCurator = viewerRole === 'curator';
    const canMarkDone = isCurator && message.sender_role === 'client';
    const canDelete = isMine; // каждый удаляет только свои
    const isDone = !!message.done_at;
    const displayBody = message.body
      ? message.body
      : message.intent_type === 'meal'
        ? `🍽️ Съел: ${message.intent_payload?.product_name ?? '?'} (${message.intent_payload?.grams ?? '?'}г)`
        : message.intent_type === 'training'
          ? `🏋️ ${message.intent_payload?.training_type ?? '?'} — ${message.intent_payload?.duration_min ?? '?'} мин`
          : message.intent_type === 'weight'
            ? `⚖️ Вес: ${message.intent_payload?.weight_kg ?? '?'} кг`
            : '';
    const doneAtLabel = isDone ? `✓ Обработано ${formatTime(message.done_at)}` : null;

    const bubbleClasses = [
      'msg-bubble',
      isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs',
      isDone ? 'msg-bubble-done' : '',
    ].filter(Boolean).join(' ');

    const handleDeleteClick = () => {
      if (!canDelete) return;
      if (!window.confirm('Удалить это сообщение? Восстановить не получится.')) return;
      onDelete?.(message);
    };

    return React.createElement(
      'div',
      { className: `msg-row ${isMine ? 'msg-row-mine' : 'msg-row-theirs'}` },
      React.createElement(
        'div',
        { className: bubbleClasses },
        React.createElement('div', { className: 'msg-body' }, displayBody),
        message.applied_at &&
          React.createElement(
            'div',
            { className: 'msg-applied' },
            '✅ Куратор применил в день',
          ),
        doneAtLabel &&
          React.createElement('div', { className: 'msg-done' }, doneAtLabel),
        React.createElement(
          'div',
          { className: 'msg-meta-row' },
          canDelete &&
            React.createElement('button', {
              type: 'button',
              className: 'msg-delete-btn',
              onClick: handleDeleteClick,
              'aria-label': 'Удалить сообщение',
              title: 'Удалить сообщение',
            }, '🗑'),
          canMarkDone &&
            React.createElement('button', {
              type: 'button',
              className: `msg-done-toggle ${isDone ? 'msg-done-toggle-active' : ''}`,
              onClick: () => onToggleDone?.(message),
              'aria-label': isDone ? 'Снять отметку' : 'Отметить как обработанное',
              title: isDone ? 'Снять отметку «обработано»' : 'Отметить как обработанное',
            }, isDone ? '✓' : '○'),
          React.createElement('div', { className: 'msg-meta' }, formatTime(message.created_at)),
        ),
      ),
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

  // ── Main MessengerModal ──────────────────────────────────────────────
  function MessengerModal({ onClose, curatorViewClientId }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [input, setInput] = useState('');
    const [error, setError] = useState(null);
    const threadRef = useRef(null);
    const isCurator = isCuratorMode();
    const viewerRole = isCurator ? 'curator' : 'client';

    const loadThread = useCallback(async () => {
      setLoading(true);
      setError(null);
      const opts = isCurator && curatorViewClientId ? { client_id: curatorViewClientId } : {};
      const res = await HEYS.MessengerAPI.getThread(opts);
      setLoading(false);
      if (!res?.success) {
        setError(res?.error || 'unknown_error');
        return;
      }
      // Reverse: DESC из БД, для UI хотим ASC (старые сверху, новые снизу)
      const sorted = (res.messages || []).slice().reverse();
      setMessages(sorted);
      // Mark read
      if (sorted.length > 0) {
        const latestTs = sorted[sorted.length - 1].created_at;
        const markPayload =
          isCurator && curatorViewClientId
            ? { client_id: curatorViewClientId, up_to_ts: latestTs }
            : { up_to_ts: latestTs };
        HEYS.MessengerAPI.markRead(markPayload).catch(() => {});
      }
    }, [isCurator, curatorViewClientId]);

    useEffect(() => {
      loadThread();
    }, [loadThread]);

    // Scroll to bottom when messages change
    useEffect(() => {
      if (threadRef.current) {
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
      }
    }, [messages]);

    const handleSend = async () => {
      const trimmed = input.trim();
      if (!trimmed || sending) return;
      setSending(true);
      setError(null);
      const payload = isCurator
        ? { client_id: curatorViewClientId || getCurrentClientId(), body: trimmed }
        : { body: trimmed };
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
      // Optimistic: добавим в ленту, затем перезагрузим из БД
      const optimistic = {
        id: res.message_id,
        sender_role: viewerRole,
        body: trimmed,
        intent_type: null,
        intent_payload: null,
        applied_at: null,
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

    // Удаление своего сообщения (hard delete). Оптимистично убираем из
    // локального state, на ошибку — возвращаем обратно.
    const handleDeleteMessage = async (message) => {
      const snapshot = messages;
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      const res = await HEYS.MessengerAPI.deleteMessage(message.id);
      if (!res?.success) {
        setMessages(snapshot);
        setError(res?.error || 'delete_failed');
      }
    };

    // Куратор: toggle "обработано" на сообщении клиента. Оптимистично
    // переключаем done_at в локальном state, на ошибку — откатываем.
    const handleToggleDone = async (message) => {
      const previousDoneAt = message.done_at || null;
      const optimisticDoneAt = previousDoneAt ? null : new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, done_at: optimisticDoneAt } : m))
      );
      const res = await HEYS.MessengerAPI.toggleDone(message.id);
      if (!res?.success) {
        // Rollback
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, done_at: previousDoneAt } : m))
        );
        setError(res?.error || 'toggle_done_failed');
        return;
      }
      // Server-truth (на случай если NOW() от сервера слегка отличается)
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, done_at: res.done_at || null } : m))
      );
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
                  // Рендерим бабблы + вставляем date-separator между разными днями
                  const nodes = [];
                  let lastKey = null;
                  for (const m of messages) {
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
                        onToggleDone: handleToggleDone,
                        onDelete: handleDeleteMessage,
                      }),
                    );
                  }
                  return nodes;
                })(),
        ),
        // Error banner
        error &&
          React.createElement('div', { className: 'messenger-error' }, error),
        // Input
        React.createElement(
          'div',
          { className: 'messenger-input-row' },
          React.createElement('textarea', {
            className: 'messenger-input',
            placeholder: isCurator ? 'Ответ клиенту...' : 'Напиши куратору...',
            value: input,
            onChange: (e) => setInput(e.target.value),
            onKeyDown: handleKeyDown,
            disabled: sending,
            rows: 2,
            maxLength: 2000,
          }),
          React.createElement(
            'button',
            {
              className: 'messenger-send',
              onClick: handleSend,
              disabled: sending || !input.trim(),
              'aria-label': 'Отправить',
            },
            sending ? '...' : '➤',
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

  HEYS.Messenger = {
    openModal,
    closeModal,
    MessengerModal,
  };

  // Subscribe to deep-link event from heys_app_shortcuts_v1
  if (typeof window !== 'undefined') {
    window.addEventListener('heys:open-messenger', (e) => {
      openModal(e.detail || {});
    });
  }
})(typeof window !== 'undefined' ? window : global);
