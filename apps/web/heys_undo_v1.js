// heys_undo_v1.js — Global Undo Manager with animated progress bar
// Snapshot + Restore pattern: action executes immediately, undo restores snapshot
//
// Поведение — строки контракта nutrition-tab «удаление и отмена» и «два
// удаления подряд»: окно защиты записи равно видимой полосе (невидимого запаса
// нет), единственное действие — «Отменить», новый тост заменяет предыдущий, и
// предыдущее удаление в этот момент становится необратимым. Очереди тостов нет.
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // Вид и числа взяты из кадра «Питание · отмена удаления» канваса
  // nutrition-tab.v4.dc.html: 5 с, полоса времени 3 px, единственное текстовое
  // действие «Отменить», радиус 16. Тот же паттерн «действие применилось,
  // даётся окно на возврат» канвасы date-remainders и tips описывают иначе —
  // 3 с, кольцо 30 px с цифрой, залитая пилюля «Вернуть», радиус 22 и прямой
  // запрет полосы. Вопрос открыт записью 1 в docs/ui/UI_V4_FINDINGS.md; пока
  // ответа нет, HEYS.Undo живёт по кадру питания (отмену совета он не
  // обслуживает — она ещё не реализована).
  const CONFIG = {
    defaultDuration: 5000,
    maxWidth: 560,
    zIndex: 1010,
    bottomOffset: 14,
    sideOffset: 14,
    animationMs: 250,
  };

  const DEFAULT_SUBTITLE = 'можно вернуть, пока идёт полоса';

  let currentUndo = null;
  let barEl = null;
  let progressEl = null;
  let labelEl = null;
  let subtitleEl = null;
  let timerId = null;
  let rafId = null;
  let hideTimerId = null;

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

  // ── DOM ──

  function ensureBar() {
    // Бар мог уходить в скрытие: переиспользуем его, иначе отложенный remove()
    // снесёт только что показанный тост.
    if (hideTimerId) {
      clearTimeout(hideTimerId);
      hideTimerId = null;
    }
    if (barEl && !barEl.isConnected) {
      barEl = null;
      progressEl = null;
      labelEl = null;
      subtitleEl = null;
    }
    if (barEl) {
      if (!progressEl) {
        progressEl = barEl.querySelector('.heys-undo-bar__progress');
        labelEl = barEl.querySelector('.heys-undo-bar__label');
        subtitleEl = barEl.querySelector('.heys-undo-bar__subtitle');
      }
      return barEl;
    }

    barEl = document.createElement('div');
    barEl.className = 'heys-undo-bar';
    barEl.setAttribute('role', 'status');
    barEl.setAttribute('aria-live', 'polite');
    barEl.setAttribute('aria-atomic', 'true');

    barEl.innerHTML = [
      '<div class="heys-undo-bar__content">',
      '  <div class="heys-undo-bar__copy">',
      '    <b class="heys-undo-bar__label"></b>',
      '    <span class="heys-undo-bar__subtitle"></span>',
      '  </div>',
      '  <button class="heys-undo-bar__btn" type="button" aria-label="Отменить последнее действие">Отменить</button>',
      '</div>',
      '<div class="heys-undo-bar__track">',
      '  <div class="heys-undo-bar__progress"></div>',
      '</div>',
    ].join('');

    progressEl = barEl.querySelector('.heys-undo-bar__progress');
    labelEl = barEl.querySelector('.heys-undo-bar__label');
    subtitleEl = barEl.querySelector('.heys-undo-bar__subtitle');
    barEl.querySelector('.heys-undo-bar__btn').addEventListener('click', onUndoClick);

    updateBarLayout();

    document.body.appendChild(barEl);
    return barEl;
  }

  function destroyBar() {
    if (!barEl) return;
    stopProgress();
    barEl.classList.remove('heys-undo-bar--visible');
    if (hideTimerId) clearTimeout(hideTimerId);
    hideTimerId = setTimeout(() => {
      hideTimerId = null;
      barEl?.remove();
      barEl = null;
      progressEl = null;
      labelEl = null;
      subtitleEl = null;
    }, CONFIG.animationMs);
  }

  // ── Progress animation ──

  // Полоса УБЫВАЕТ: показывает остаток окна возврата, а не прошедшее время.
  function startProgress(duration) {
    stopProgress();
    if (!progressEl) return;
    const start = performance.now();
    // Бар переживает переключение вкладки, а высота нижней навигации между
    // вкладками может отличаться — отступ надо пересчитывать по ходу жизни
    // тоста. ResizeObserver дешевле по числу замеров, но требует переподписки,
    // когда React пересоздаёт узел .tabs; здесь уже крутится rAF полосы, и
    // редкий (5 раз в секунду) пересчёт в нём покрывает и смену высоты, и
    // подмену самого узла, не заводя отдельного наблюдателя.
    let lastLayoutAt = start;

    function tick(now) {
      if (!progressEl) {
        rafId = null;
        return;
      }
      if (now - lastLayoutAt >= 200) {
        lastLayoutAt = now;
        updateBarLayout();
      }
      const elapsed = now - start;
      const ratio = Math.max(0, 1 - elapsed / duration);
      progressEl.style.transform = 'scaleX(' + ratio + ')';
      if (ratio > 0 && currentUndo) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
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

  function showEntry(entry) {
    if (!entry) return;

    currentUndo = entry;

    const bar = ensureBar();
    if (labelEl) labelEl.textContent = entry.label || 'Действие выполнено';
    if (subtitleEl) subtitleEl.textContent = entry.subtitle || DEFAULT_SUBTITLE;
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

  // keepBar — замена тоста: предыдущая запись коммитится, но бар не гасим,
  // чтобы новый тост встал на его место без мигания.
  function commitCurrent(reason = 'manual', keepBar = false) {
    if (!currentUndo) return;
    const entry = currentUndo;
    currentUndo = null;

    clearCurrentTimer();
    if (!keepBar) destroyBar();

    try {
      handleAsyncCallback(entry.onExpire?.(reason, entry.context, entry), {
        onError: (e) => {
          console.error('[HEYS.Undo] onExpire error:', e);
        },
      });
    } catch (e) {
      console.error('[HEYS.Undo] onExpire error:', e);
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
          safeVibrate(15);
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
  }

  function safeVibrate(pattern) {
    if (!navigator.vibrate) return;
    const activation = navigator.userActivation;
    if (activation && !activation.isActive && !activation.hasBeenActive) return;
    try { navigator.vibrate(pattern); } catch (_) { /* ignore haptic errors */ }
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
        onUndo: opts.onUndo,
        onExpire: opts.onExpire || null,
        context: opts.context,
      };

      // Контракт «два удаления подряд»: новый тост заменяет старый, и первое
      // удаление в этот момент становится необратимым.
      if (currentUndo) {
        console.info('[HEYS.Undo] replaced:', currentUndo.label, '→', nextEntry.label);
        commitCurrent('replaced', true);
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
        // Подпись прокидывается наравне с остальным: у вызывающих с нестандартным
        // окном (очистка дня — 7 с) она единственная называет срок словами.
        subtitle: opts.subtitle,
        duration: opts.duration,
        context,
        onUndo: () => opts.undo(context),
        onExpire: (reason) => opts.onExpire?.(reason, context),
      });

      return context;
    },

    /** Force-commit current pending undo (no restore) */
    commit(reason = 'manual') {
      commitCurrent(reason);
    },

    /** Check if an undo action is pending */
    get pending() {
      return !!currentUndo;
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
