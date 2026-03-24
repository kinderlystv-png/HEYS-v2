// heys_undo_v1.js — Global Undo Manager with animated progress bar
// Snapshot + Restore pattern: action executes immediately, undo restores snapshot
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  const CONFIG = {
    defaultDuration: 4000,
    barHeight: 52,
    maxWidth: 560,
    zIndex: 1010,
    bottomOffset: 16,
    sideOffset: 16,
    animationMs: 250,
  };

  let currentUndo = null;
  let undoQueue = [];
  let barEl = null;
  let progressEl = null;
  let queueMetaEl = null;
  let labelEl = null;
  let subtitleEl = null;
  let iconEl = null;
  let timerId = null;
  let rafId = null;

  function handleAsyncCallback(result, handlers) {
    return Promise.resolve(result)
      .then((value) => {
        handlers?.onSuccess?.(value);
        return value;
      })
      .catch((error) => {
        handlers?.onError?.(error);
        return undefined;
      });
  }

  function getBottomOffset() {
    const tabsEl = document.querySelector('.tabs');
    if (!tabsEl) return CONFIG.bottomOffset;

    const rect = tabsEl.getBoundingClientRect();
    const safeInset = 0;
    const tabsHeight = rect && rect.height ? rect.height : 0;
    return Math.max(CONFIG.bottomOffset, Math.round(tabsHeight + safeInset + 8));
  }

  function updateBarLayout() {
    if (!barEl) return;
    barEl.style.left = '50%';
    barEl.style.right = 'auto';
    barEl.style.width = 'min(' + CONFIG.maxWidth + 'px, calc(100vw - ' + (CONFIG.sideOffset * 2) + 'px))';
    barEl.style.bottom = getBottomOffset() + 'px';
    barEl.style.zIndex = String(CONFIG.zIndex);
  }

  function formatSubtitle(duration) {
    const seconds = Math.max(1, Math.round((duration || CONFIG.defaultDuration) / 1000));
    return 'Можно вернуть в течение ' + seconds + ' сек';
  }

  // ── DOM ──

  function ensureBar() {
    if (barEl) return barEl;

    barEl = document.createElement('div');
    barEl.className = 'heys-undo-bar';
    barEl.setAttribute('role', 'status');
    barEl.setAttribute('aria-live', 'polite');
    barEl.setAttribute('aria-atomic', 'true');

    barEl.innerHTML = [
      '<div class="heys-undo-bar__shine"></div>',
      '<div class="heys-undo-bar__content">',
      '  <div class="heys-undo-bar__lead">',
      '    <span class="heys-undo-bar__icon-wrap">',
      '      <span class="heys-undo-bar__icon">↩</span>',
      '    </span>',
      '    <div class="heys-undo-bar__copy">',
      '      <span class="heys-undo-bar__label"></span>',
      '      <span class="heys-undo-bar__subtitle"></span>',
      '    </div>',
      '  </div>',
      '  <div class="heys-undo-bar__actions">',
      '    <span class="heys-undo-bar__meta" hidden></span>',
      '    <button class="heys-undo-bar__btn" type="button" aria-label="Отменить последнее действие">Отменить</button>',
      '    <button class="heys-undo-bar__close" type="button" aria-label="Закрыть уведомление об отмене">×</button>',
      '  </div>',
      '</div>',
      '<div class="heys-undo-bar__track">',
      '  <div class="heys-undo-bar__progress"></div>',
      '</div>',
    ].join('');

    progressEl = barEl.querySelector('.heys-undo-bar__progress');
    queueMetaEl = barEl.querySelector('.heys-undo-bar__meta');
    labelEl = barEl.querySelector('.heys-undo-bar__label');
    subtitleEl = barEl.querySelector('.heys-undo-bar__subtitle');
    iconEl = barEl.querySelector('.heys-undo-bar__icon');
    barEl.querySelector('.heys-undo-bar__btn').addEventListener('click', onUndoClick);
    barEl.querySelector('.heys-undo-bar__close').addEventListener('click', onDismissClick);

    updateBarLayout();

    document.body.appendChild(barEl);
    return barEl;
  }

  function destroyBar() {
    if (!barEl) return;
    barEl.classList.remove('heys-undo-bar--visible');
    setTimeout(() => {
      barEl?.remove();
      barEl = null;
      progressEl = null;
      queueMetaEl = null;
      labelEl = null;
      subtitleEl = null;
      iconEl = null;
    }, CONFIG.animationMs);
  }

  function updateQueueMeta() {
    if (!queueMetaEl) return;
    if (!undoQueue.length) {
      queueMetaEl.hidden = true;
      queueMetaEl.textContent = '';
      return;
    }

    queueMetaEl.hidden = false;
    queueMetaEl.textContent = '+' + undoQueue.length;
  }

  // ── Progress animation ──

  function startProgress(duration) {
    if (!progressEl) return;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const ratio = Math.max(0, 1 - elapsed / duration);
      progressEl.style.transform = 'scaleX(' + ratio + ')';
      if (ratio > 0 && currentUndo) {
        rafId = requestAnimationFrame(tick);
      }
    }

    progressEl.style.transform = 'scaleX(1)';
    rafId = requestAnimationFrame(tick);
  }

  function stopProgress() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function clearCurrentTimer() {
    stopProgress();
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleNextUndo() {
    if (currentUndo || !undoQueue.length) return;
    const nextEntry = undoQueue.shift();
    if (!nextEntry) return;
    showEntry(nextEntry);
  }

  function showEntry(entry) {
    if (!entry) return;

    currentUndo = entry;

    const bar = ensureBar();
    if (labelEl) labelEl.textContent = entry.label || 'Действие выполнено';
    if (subtitleEl) subtitleEl.textContent = entry.subtitle || formatSubtitle(entry.duration);
    if (iconEl) iconEl.textContent = entry.icon || '↩';
    updateQueueMeta();
    updateBarLayout();

    void bar.offsetHeight;
    bar.classList.add('heys-undo-bar--visible');

    startProgress(entry.duration);

    timerId = setTimeout(() => {
      timerId = null;
      commitCurrent('expired');
    }, entry.duration);

    console.info('[HEYS.Undo] pushed:', entry.label, entry.duration + 'ms');
  }

  // ── Core logic ──

  function commitCurrent(reason = 'manual') {
    if (!currentUndo) return;
    const entry = currentUndo;
    currentUndo = null;

    clearCurrentTimer();
    destroyBar();

    try {
      handleAsyncCallback(entry.onExpire?.(reason, entry.context, entry), {
        onError: (e) => {
          console.error('[HEYS.Undo] onExpire error:', e);
        },
      });
    } catch (e) {
      console.error('[HEYS.Undo] onExpire error:', e);
    }

    if (undoQueue.length) {
      setTimeout(scheduleNextUndo, CONFIG.animationMs + 24);
    }
  }

  function onUndoClick(e) {
    e?.stopPropagation();
    if (!currentUndo) return;
    const entry = currentUndo;
    currentUndo = null;

    clearCurrentTimer();
    destroyBar();

    try {
      handleAsyncCallback(entry.onUndo?.(entry.context, entry), {
        onSuccess: () => {
          if (navigator.vibrate) navigator.vibrate(15);
          HEYS.Toast?.success('Действие отменено');
        },
        onError: (err) => {
          console.error('[HEYS.Undo] onUndo error:', err);
          HEYS.Toast?.error('Не удалось отменить');
        },
      });
    } catch (err) {
      console.error('[HEYS.Undo] onUndo error:', err);
      HEYS.Toast?.error('Не удалось отменить');
    }

    if (undoQueue.length) {
      setTimeout(scheduleNextUndo, CONFIG.animationMs + 24);
    }
  }

  function onDismissClick(e) {
    e?.stopPropagation();
    if (!currentUndo) return;
    commitCurrent('dismissed-by-user');
  }

  function expireQueueEntry(entry, reason) {
    if (!entry) return;
    try {
      handleAsyncCallback(entry.onExpire?.(reason, entry.context, entry), {
        onError: (e) => {
          console.error('[HEYS.Undo] queued onExpire error:', e);
        },
      });
    } catch (e) {
      console.error('[HEYS.Undo] queued onExpire error:', e);
    }
  }

  function flushAll(reason = 'manual') {
    const queuedEntries = undoQueue.slice();
    undoQueue = [];

    if (currentUndo) {
      commitCurrent(reason);
    }

    queuedEntries.forEach((entry) => expireQueueEntry(entry, reason));
  }

  // ── Public API ──

  const Undo = {
    /**
     * @param {{ label: string, duration?: number, onUndo: Function, onExpire?: Function }} opts
     */
    push(opts) {
      if (!opts || typeof opts.onUndo !== 'function') {
        console.warn('[HEYS.Undo] push() requires onUndo callback');
        return;
      }

      const duration = opts.duration || CONFIG.defaultDuration;

      const nextEntry = {
        label: opts.label || 'Действие выполнено',
        subtitle: opts.subtitle || '',
        duration,
        icon: opts.icon || '↩',
        onUndo: opts.onUndo,
        onExpire: opts.onExpire || null,
        context: opts.context,
      };

      if (currentUndo) {
        undoQueue.push(nextEntry);
        updateQueueMeta();
        console.info('[HEYS.Undo] queued:', nextEntry.label, 'queue=' + undoQueue.length);
        return nextEntry;
      }

      showEntry(nextEntry);
      return nextEntry;
    },

    runAction(opts) {
      if (!opts || typeof opts.apply !== 'function' || typeof opts.undo !== 'function') {
        console.warn('[HEYS.Undo] runAction() requires apply and undo callbacks');
        return false;
      }

      let context;
      try {
        context = opts.apply();
      } catch (error) {
        console.error('[HEYS.Undo] runAction apply error:', error);
        try { opts.onApplyError?.(error); } catch (_) { }
        if (opts.errorMessage) {
          HEYS.Toast?.error(opts.errorMessage);
        }
        return false;
      }

      if (context === false) return false;

      this.push({
        label: opts.label,
        duration: opts.duration,
        context,
        onUndo: () => opts.undo(context),
        onExpire: (reason) => opts.onExpire?.(reason, context),
      });

      return context;
    },

    /** Force-commit current pending undo (no restore) */
    commit(reason = 'manual') {
      flushAll(reason);
    },

    /** Check if an undo action is pending */
    get pending() {
      return !!currentUndo || undoQueue.length > 0;
    },

    get queueSize() {
      return undoQueue.length + (currentUndo ? 1 : 0);
    },
  };

  // ── Lifecycle guards ──

  // Commit on page hide / visibility change (prevent data loss)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentUndo) {
      console.info('[HEYS.Undo] visibilitychange → commit');
      commitCurrent('document-hidden');
    }
  });

  // Commit before unload
  window.addEventListener('beforeunload', () => {
    if (currentUndo) commitCurrent('beforeunload');
  });

  window.addEventListener('resize', updateBarLayout);

  // ── Export ──
  HEYS.Undo = Undo;

  console.info('[HEYS.Undo] ✅ v1.0 ready');
})(window);
