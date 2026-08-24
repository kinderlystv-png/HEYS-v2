// heys_undo_v1.js — общий бар отмены: действие применяется сразу, человеку
// даётся окно на возврат.
//
// Источник правды — канвас undo-bar.v4.dc.html. Он главный для отмены во всём
// продукте: в nutrition-tab, date-remainders и tips прежние описания отменены
// и заменены ссылкой на него. Раньше правило жило в контракте вкладки
// «Питание», хотя бар всплывает в двенадцати местах.
//
// Что задаёт контракт: кольцо-таймер с цифрой вместо полосы (полоса вдоль
// нижней кромки читается как прогресс загрузки), 5 с на все места вызова,
// единственное слово действия — «Отменить», подряд идущие удаления одного
// вида собираются в один бар, подтверждающего тоста после отмены нет.
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});

  const CONFIG = {
    // Строка «длительность»: 5 с везде, отдельных длительностей у экранов нет.
    // Окно защиты записи равно видимому таймеру — невидимого запаса нет.
    defaultDuration: 5000,
    // Строка «положение»: врезка по бокам и зазор снизу — одна величина.
    gap: 12,
    zIndex: 1010,
    // Строка «появление» / «истёк без нажатия».
    enterMs: 220,
    leaveMs: 160,
    reducedMs: 120,
  };

  // Кольцо 30 px, r 12.5, обводка 2.5 — числа кадра. Длина окружности нужна
  // для dasharray: дуга убывает по часовой.
  const RING_CIRCUMFERENCE = 2 * Math.PI * 12.5;

  let currentUndo = null;
  let barEl = null;
  let ringArcEl = null;
  let countEl = null;
  let labelEl = null;
  let btnEl = null;
  let timerId = null;
  let rafId = null;
  let tickId = null;
  let hideTimerId = null;

  function prefersReducedMotion() {
    return !!global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

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

  // Строка «подряд идущие удаления»: текст пачки называет количество, поэтому
  // вызывающий отдаёт три формы слова — «продукт / продукта / продуктов».
  function pluralize(n, forms) {
    if (!Array.isArray(forms) || forms.length < 3) return '';
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 14) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
  }

  function entryLabel(state) {
    if (state.entries.length === 1) return state.entries[0].label;
    const word = pluralize(state.entries.length, state.forms);
    return 'Удалено ' + state.entries.length + (word ? ' ' + word : '');
  }

  // ── Положение ──

  // Строка «положение»: плашка стоит над нижней навигацией, а когда её нет —
  // над нижним краем с учётом safe-area. Правило словами, а не числом от края:
  // прежнее «bottom: 14» из кадра без навигации ставило плашку поверх неё.
  function applyBottomOffset() {
    if (!barEl) return;
    const tabsEl = document.querySelector('.tabs');
    const tabsHeight = tabsEl?.getBoundingClientRect?.().height || 0;
    // Без навигации отступ берёт CSS: там он с env(safe-area-inset-bottom),
    // а инлайновый calc(env(...)) переживает не всякий движок.
    if (tabsHeight) {
      barEl.style.bottom = Math.round(tabsHeight + CONFIG.gap) + 'px';
    } else {
      barEl.style.removeProperty('bottom');
    }
    barEl.style.zIndex = String(CONFIG.zIndex);
  }

  // ── DOM ──

  function ensureBar() {
    // Бар мог уходить в скрытие: переиспользуем его, иначе отложенный remove()
    // снесёт только что показанный.
    if (hideTimerId) {
      clearTimeout(hideTimerId);
      hideTimerId = null;
    }
    if (barEl && !barEl.isConnected) barEl = null;
    if (barEl) return barEl;

    barEl = document.createElement('div');
    barEl.className = 'heys-undo-bar';
    // Строка «доступность»: озвучивается текст и «Отменить, осталось N секунд»;
    // кольцо декоративно.
    barEl.setAttribute('role', 'status');
    barEl.setAttribute('aria-live', 'polite');
    barEl.setAttribute('aria-atomic', 'true');

    barEl.innerHTML = [
      '<div class="heys-undo-bar__content">',
      '  <span class="heys-undo-bar__ring" aria-hidden="true">',
      '    <svg width="30" height="30" viewBox="0 0 30 30">',
      '      <circle cx="15" cy="15" r="12.5" fill="none" stroke="var(--v4-act, #2563eb)" stroke-opacity=".22" stroke-width="2.5"/>',
      '      <circle class="heys-undo-bar__arc" cx="15" cy="15" r="12.5" fill="none" stroke="var(--v4-act, #2563eb)" stroke-width="2.5" stroke-linecap="round" transform="rotate(-90 15 15)"/>',
      '    </svg>',
      '    <span class="heys-undo-bar__count"></span>',
      '  </span>',
      '  <span class="heys-undo-bar__label"></span>',
      '  <button class="heys-undo-bar__btn" type="button">Отменить</button>',
      '</div>',
    ].join('');

    ringArcEl = barEl.querySelector('.heys-undo-bar__arc');
    countEl = barEl.querySelector('.heys-undo-bar__count');
    labelEl = barEl.querySelector('.heys-undo-bar__label');
    btnEl = barEl.querySelector('.heys-undo-bar__btn');
    btnEl.addEventListener('click', onUndoClick);

    applyBottomOffset();
    document.body.appendChild(barEl);
    return barEl;
  }

  function destroyBar() {
    if (!barEl) return;
    stopCountdown();
    barEl.classList.remove('heys-undo-bar--visible');
    barEl.classList.add('heys-undo-bar--leaving');
    if (hideTimerId) clearTimeout(hideTimerId);
    hideTimerId = setTimeout(
      () => {
        hideTimerId = null;
        barEl?.remove();
        barEl = null;
        ringArcEl = null;
        countEl = null;
        labelEl = null;
        btnEl = null;
      },
      prefersReducedMotion() ? CONFIG.reducedMs : CONFIG.leaveMs,
    );
  }

  // ── Таймер ──

  // Строка «убывает, а не растёт»: дуга и цифра показывают ОСТАТОК окна, 5 → 1.
  function renderRemaining(remainingMs, duration) {
    const ratio = Math.max(0, Math.min(1, remainingMs / duration));
    if (ringArcEl) {
      ringArcEl.setAttribute(
        'stroke-dasharray',
        RING_CIRCUMFERENCE * ratio + ' ' + RING_CIRCUMFERENCE,
      );
    }
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    if (countEl && countEl.textContent !== String(seconds)) {
      countEl.textContent = String(seconds);
    }
    if (btnEl) {
      btnEl.setAttribute('aria-label', 'Отменить, осталось ' + seconds + ' секунд');
    }
    // Отступ пересчитывается по ходу жизни бара: он переживает переключение
    // вкладки, а высота нижней навигации между вкладками может отличаться.
    applyBottomOffset();
  }

  function startCountdown(state) {
    stopCountdown();
    const duration = state.duration;
    renderRemaining(duration, duration);

    if (prefersReducedMotion()) {
      // Строка «уменьшенное движение»: кольцо не анимируется, цифра меняется
      // раз в секунду.
      tickId = setInterval(() => {
        if (!currentUndo) return stopCountdown();
        renderRemaining(state.endsAt - Date.now(), duration);
      }, 1000);
      return;
    }

    const tick = () => {
      if (!currentUndo) {
        rafId = null;
        return;
      }
      const remaining = state.endsAt - Date.now();
      renderRemaining(remaining, duration);
      rafId = remaining > 0 ? requestAnimationFrame(tick) : null;
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopCountdown() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  function clearCurrentTimer() {
    stopCountdown();
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function armTimer(state) {
    if (timerId) clearTimeout(timerId);
    state.endsAt = Date.now() + state.duration;
    timerId = setTimeout(() => {
      timerId = null;
      commitCurrent('expired');
    }, state.duration);
    startCountdown(state);
  }

  function showState(state) {
    currentUndo = state;
    const bar = ensureBar();
    if (labelEl) labelEl.textContent = entryLabel(state);
    applyBottomOffset();

    void bar.offsetHeight;
    bar.classList.remove('heys-undo-bar--leaving');
    bar.classList.add('heys-undo-bar--visible');

    armTimer(state);
    console.info('[HEYS.Undo] pushed:', entryLabel(state), state.duration + 'ms');
  }

  // ── Ядро ──

  // keepBar — замена бара: предыдущее состояние коммитится, но бар не гасим,
  // чтобы новый встал на его место без мигания.
  function commitCurrent(reason = 'manual', keepBar = false) {
    if (!currentUndo) return;
    const state = currentUndo;
    currentUndo = null;

    clearCurrentTimer();
    if (!keepBar) destroyBar();

    for (const entry of state.entries) {
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
  }

  function onUndoClick(e) {
    e?.stopPropagation();
    if (!currentUndo) return;
    const state = currentUndo;
    currentUndo = null;

    clearCurrentTimer();
    // Строка «после „Отменить“»: бар исчезает, запись возвращается на своё
    // место, подтверждающего тоста нет — исчезнувший бар и есть ответ.
    destroyBar();

    // Пачка возвращается целиком и в обратном порядке: последнее удалённое
    // ложится обратно первым, иначе индексы соседей разъезжаются.
    for (const entry of [...state.entries].reverse()) {
      try {
        handleAsyncCallback(entry.onUndo?.(entry.context, entry), {
          onSuccess: () => safeVibrate(15),
          onError: (err) => {
            console.error('[HEYS.Undo] onUndo error:', err);
            // Тост здесь оставлен намеренно. Контракт снимает у heys_toast_v1
            // роль подтверждения действия, а не компонент целиком: роль совета
            // описана в tips и остаётся живой. Замены для ошибок («ошибка живёт
            // на месте действия») пока нет, а молча проглотить несработавшую
            // отмену хуже.
            HEYS.Toast?.error('Не удалось отменить');
          },
        });
      } catch (err) {
        console.error('[HEYS.Undo] onUndo error:', err);
        HEYS.Toast?.error('Не удалось отменить');
      }
    }
  }

  function safeVibrate(pattern) {
    if (!navigator.vibrate) return;
    const activation = navigator.userActivation;
    if (activation && !activation.isActive && !activation.hasBeenActive) return;
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* ignore haptic errors */
    }
  }

  // ── Публичный API ──

  const Undo = {
    /**
     * @param {{
     *   label: string,
     *   onUndo: Function,
     *   onExpire?: Function,
     *   context?: any,
     *   duration?: number,
     *   batch?: { key: string, forms: [string, string, string] }
     * }} opts
     */
    push(opts) {
      if (!opts || typeof opts.onUndo !== 'function') {
        console.warn('[HEYS.Undo] push() requires onUndo callback');
        return;
      }

      const entry = {
        label: opts.label || 'Действие выполнено',
        onUndo: opts.onUndo,
        onExpire: opts.onExpire || null,
        context: opts.context,
      };
      const batchKey = opts.batch?.key || null;

      // Строка «подряд идущие удаления»: удаления одного вида внутри живого
      // окна собираются в один бар, таймер перезапускается, «Отменить»
      // возвращает все. Прежнее правило «второе удаление делает первое
      // необратимым» верно для редкого случая, но чистка приёма от нескольких
      // продуктов и разбор списка задач — рядовой сценарий.
      if (currentUndo && batchKey && currentUndo.batchKey === batchKey) {
        currentUndo.entries.push(entry);
        if (opts.batch?.forms) currentUndo.forms = opts.batch.forms;
        if (labelEl) labelEl.textContent = entryLabel(currentUndo);
        armTimer(currentUndo);
        console.info('[HEYS.Undo] batched:', entryLabel(currentUndo));
        return currentUndo;
      }

      // Строка «разные виды подряд»: в пачку не собираются — бар показывает
      // последнее, предыдущее становится необратимым. «Удалено 2 объекта»
      // ничего не говорит о том, что вернётся.
      if (currentUndo) {
        console.info('[HEYS.Undo] replaced:', entryLabel(currentUndo), '→', entry.label);
        commitCurrent('replaced', true);
      }

      const state = {
        entries: [entry],
        batchKey,
        forms: opts.batch?.forms || null,
        duration: opts.duration || CONFIG.defaultDuration,
        endsAt: 0,
      };
      showState(state);
      return state;
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
        try {
          opts.onApplyError?.(error);
        } catch (_) {
          /* ignore */
        }
        if (opts.errorMessage) {
          // См. комментарий в onUndoClick: ошибки уйдут вместе со снятием
          // heys_toast_v1, когда появится показ на месте действия.
          HEYS.Toast?.error(opts.errorMessage);
        }
        return false;
      }

      if (context === false) return false;

      this.push({
        label: opts.label,
        duration: opts.duration,
        batch: opts.batch,
        context,
        onUndo: () => opts.undo(context),
        onExpire: (reason) => opts.onExpire?.(reason, context),
      });

      return context;
    },

    /** Досрочно закрепить висящее действие без возврата. */
    commit(reason = 'manual') {
      commitCurrent(reason);
    },

    get pending() {
      return !!currentUndo;
    },
  };

  // ── Страховки жизненного цикла ──

  // Уход со страницы, а не со вкладки приложения: контракт защищает вкладки,
  // но при закрытии документа отложенное действие надо закрепить, иначе оно
  // потеряется вовсе.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentUndo) {
      console.info('[HEYS.Undo] visibilitychange → commit');
      commitCurrent('document-hidden');
    }
  });

  window.addEventListener('beforeunload', () => {
    if (currentUndo) commitCurrent('beforeunload');
  });

  window.addEventListener('resize', applyBottomOffset);

  HEYS.Undo = Undo;

  console.info('[HEYS.Undo] ✅ v2.0 ready');
})(window);
