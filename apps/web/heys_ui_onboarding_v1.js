// heys_ui_onboarding_v1.js — Модуль интерактивного тура для новых пользователей
// Показывает spotlight на ключевых элементах и объясняет их функцию
// Использует z-index 9000-9500 (выше контента, ниже системных модалок)
// v1.7: Визуальные улучшения — pulse animation + backdrop blur + tooltip fade-in
// v1.6: Sync curator check via localStorage — HEYS.cloud.role may not be set yet

(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const trackTourEvent = (event, data) => {
    if (HEYS.analytics?.trackEvent) {
      HEYS.analytics.trackEvent(event, data);
    }
  };

  const trackTourError = (error, context) => {
    if (HEYS.analytics?.trackError) {
      HEYS.analytics.trackError(error, context);
    }
  };

  // === CONFIGURATION ===

  const ONBOARDING_TOUR_ENABLED = false;
  // Post-release: довести мини-туры и включить после smoke.
  const WIDGETS_TOUR_ENABLED = false;
  const INSIGHTS_TOUR_ENABLED = false;
  const TOUR_ID = 'onboarding_tour_v1';
  const STORAGE_KEY = 'heys_tour_completed';

  const getStoredFlag = (key, fallback = false) => {
    const scoped = HEYS.store?.get?.(key, null);
    if (scoped === true || scoped === 'true') return true;
    if (scoped === false || scoped === 'false') return false;
    try {
      return localStorage.getItem(key) === 'true';
    } catch (e) {
      return fallback;
    }
  };

  // Четыре шага обзора — first-run.v4, строка «четыре шага и их порядок»:
  // от того, что человек видит, к тому, за чем вернётся. Цель шага ищется по
  // живому экрану; если её нет (виджет убран с Главной) — шаг выпадает, и
  // счёт в кикере пересчитывается (строка «цель не найдена»). Демо-чисел нет:
  // обзор идёт по настоящему экрану (строка «своих чисел, а не демонстрационных»).
  const TOUR_STEPS = [
    {
      id: 'step_numbers',
      radius: 20,
      title: 'Ваши цифры на сегодня',
      text: 'Съедено и осталось — два числа, по которым видно, как идёт день. Пока пусто: заполнится с первой записью.',
      // Верхний ряд виджетов Главной: плитки с той же вершиной, что у первой.
      getTarget: () => {
        const grid = document.querySelector('.widgets-grid');
        if (!grid) return document.getElementById('tour-hero-stats');
        const tiles = Array.from(grid.querySelectorAll('[data-widget-id]'));
        if (!tiles.length) return null;
        const top = tiles[0].getBoundingClientRect().top;
        return tiles.filter((tile) => Math.abs(tile.getBoundingClientRect().top - top) < 2);
      },
    },
    {
      id: 'step_add',
      // Окно вокруг круглой кнопки — круг (кадр «Первый вход · шаг 2»: 999).
      radius: 999,
      title: 'Записать еду и воду',
      text: 'Одна кнопка на все записи дня. Долгий тап по ней — сразу вода, без выбора.',
      getTarget: () => document.querySelector('.widgets-quick-fab-wrap') || document.getElementById('tour-fab-buttons'),
    },
    {
      id: 'step_nav',
      radius: 20,
      title: 'Где что лежит',
      text: 'Питание — приёмы и продукты, Актив — шаги и тренировки, Отчёты — что вышло за неделю.',
      getTarget: () => document.querySelector('.tab-primary-nav-row') || document.querySelector('.tabs--v4-primary'),
    },
    {
      id: 'step_reports',
      // Вкладка навигации — радиус 18 (кадр «Первый вход · шаг 4»).
      radius: 18,
      title: 'Куда смотреть через неделю',
      text: 'В «Отчётах» неделя собирается сама: средние, динамика веса и что стоит поправить.',
      getTarget: () => document.getElementById('tour-stats-tab'),
    },
  ];

  // Прямоугольник цели: объединение видимых элементов шага.
  function stepTargetRect(step) {
    let target = null;
    try { target = step.getTarget(); } catch (e) { trackTourError(e, { scope: 'onboarding_step_target', step: step.id }); }
    if (!target) return null;
    const rects = (Array.isArray(target) ? target : [target])
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function availableSteps() {
    return TOUR_STEPS.filter((step) => !!stepTargetRect(step));
  }

  const reducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  };

  // === MODULE STATE ===

  let state = {
    isActive: false,
    currentStepIndex: 0,
    steps: [], // доступные шаги этого прохода (строка «цель не найдена»)
    fromSettings: false, // из настроек плашка «обзор пройден» не показывается
    stepStartTime: null, // Время начала шага для analytics
    overlayEl: null,
    tooltipEl: null,
    highlightEl: null,
    welcomeModalEl: null,
    onComplete: null,
    userName: null, // Имя пользователя для персонализации
    wasHidden: false // Флаг для visibilitychange
  };

  // Переходы между шагами тура отклика не получают — строка «вибрация ·
  // правило продукта»; registration: «на переходах между шагами её нет».
  function triggerHaptic() { }

  // === VISIBILITY CHANGE HANDLER ===

  const INTERRUPTED_STEP_KEY = 'heys_tour_interrupted_step';
  let hiddenTimestamp = 0;
  const MIN_HIDDEN_DURATION = 500; // Игнорируем "скрытия" короче 500мс (артефакты переключения табов)

  function handleVisibilityChange() {
    if (document.hidden && state.isActive) {
      hiddenTimestamp = Date.now();
      state.wasHidden = true;
      // Сохраняем текущий шаг для восстановления при прерывании
      try {
        localStorage.setItem(INTERRUPTED_STEP_KEY, String(state.currentStepIndex));
        trackTourEvent('onboarding_visibility_hidden', { step: state.currentStepIndex });
      } catch (e) {
        trackTourError(e, { scope: 'onboarding_save_interrupted_step' });
      }
    } else if (!document.hidden && state.wasHidden && state.isActive) {
      const hiddenDuration = Date.now() - hiddenTimestamp;
      state.wasHidden = false;

      // Игнорируем очень короткие "скрытия" — это артефакты переключения табов/рендера
      if (hiddenDuration < MIN_HIDDEN_DURATION) {
        trackTourEvent('onboarding_visibility_short_hide', { hiddenDurationMs: hiddenDuration });
        return;
      }

      trackTourEvent('onboarding_visibility_restore', { hiddenDurationMs: hiddenDuration });
      // Восстановить позицию highlight если нужно
      OnboardingTour.renderStep();
    }
  }

  /**
   * Получить прерванный шаг если есть
   */
  function getInterruptedStep() {
    try {
      const saved = localStorage.getItem(INTERRUPTED_STEP_KEY);
      if (saved !== null) {
        const stepIndex = parseInt(saved, 10);
        if (!isNaN(stepIndex) && stepIndex >= 0) {
          return stepIndex;
        }
      }
    } catch (e) {
      trackTourError(e, { scope: 'onboarding_read_interrupted_step' });
    }
    return null;
  }

  /**
   * Очистить прерванный шаг
   */
  function clearInterruptedStep() {
    try {
      localStorage.removeItem(INTERRUPTED_STEP_KEY);
    } catch (e) {
      // ignore
    }
  }

  // === WELCOME MODAL ===

  function getUserName() {
    // Пытаемся получить имя из разных источников
    try {
      // 1. Из профиля HEYS
      if (HEYS.store && HEYS.store.get) {
        const profile = HEYS.store.get('heys_profile', null);
        if (profile && profile.firstName) return profile.firstName;
        if (profile && profile.name) return profile.name.split(' ')[0];
      }
      // 2. Из localStorage напрямую
      const profileRaw = localStorage.getItem('heys_profile');
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        if (profile.firstName) return profile.firstName;
        if (profile.name) return profile.name.split(' ')[0];
      }
    } catch (e) {
      trackTourError(e, { scope: 'onboarding_get_user_name' });
    }
    return null;
  }

  // === CSS ANIMATIONS (v1.7) ===

  let animationsInjected = false;

  function injectTourAnimations() {
    if (animationsInjected) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'tour-animations';
    styleEl.textContent = `
      /* Tour Pulse Animation — "дыхание" подсветки */
      @keyframes tourPulse {
        0%, 100% {
          box-shadow: 
            0 0 0 9999px rgba(0, 0, 0, 0.75),
            0 0 0 0 rgba(255, 255, 255, 0.3);
        }
        50% {
          box-shadow: 
            0 0 0 9999px rgba(0, 0, 0, 0.75),
            0 0 0 6px rgba(255, 255, 255, 0.1);
        }
      }
      
      /* Tour Tooltip Fade-in — применяется ТОЛЬКО через .tour-tooltip-enter */
      @keyframes tourTooltipIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      /* Анимация только при добавлении класса .tour-tooltip-enter */
      .tour-tooltip-enter {
        animation: tourTooltipIn 0.25s ease-out;
      }
      
      /* Highlight glow effect */
      .tour-highlight {
        border: 2px solid rgba(255, 255, 255, 0.15);
      }
    `;
    document.head.appendChild(styleEl);
    animationsInjected = true;
  }

  // === RENDER HELPERS ===

  function createOverlay() {
    if (state.overlayEl) return state.overlayEl;

    // Инжектируем CSS анимацию если еще не добавлена
    injectTourAnimations();

    const el = document.createElement('div');
    el.className = 'tour-overlay';
    // Стили будут в CSS, но базовые для надежности
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.zIndex = '9000';
    // ВАЖНО: overlay прозрачный! Затемнение создаётся через box-shadow у highlight
    // Это позволяет highlight "вырезать дырку" в затемнении
    el.style.background = 'transparent';
    el.style.opacity = '1';
    // НЕ используем backdrop-filter — он размывает в том числе подсвеченный элемент!

    // Overlay только блокирует клики по контенту под ним

    document.body.appendChild(el);

    state.overlayEl = el;
    return el;
  }

  function createHighlight(rect, radius = 20) {
    let el = state.highlightEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'tour-highlight';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      state.highlightEl = el;
    }
    // Поля окна — границы цели плюс 4 px, чтобы обводка не наезжала на содержимое.
    const padding = 4;
    el.style.top = (rect.top - padding) + 'px';
    el.style.left = (rect.left - padding) + 'px';
    el.style.width = (rect.width + padding * 2) + 'px';
    el.style.height = (rect.height + padding * 2) + 'px';
    // Радиус окна свой у каждого шага — как в кадрах: у ряда плиток и навигации 20,
    // у круглой кнопки круг, у вкладки «Отчёты» 18.
    el.style.borderRadius = radius + 'px';
    return el;
  }

  function createTooltip(step, rect) {
    let el = state.tooltipEl;
    const isNewStep = state._lastAnimatedStep !== state.currentStepIndex;
    if (!el) {
      el = document.createElement('div');
      el.className = 'tour-card';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'tour-card-title');
      el.setAttribute('aria-describedby', 'tour-card-text');
      document.body.appendChild(el);
      state.tooltipEl = el;
    }
    if (!isNewStep && el.innerHTML) {
      updateTooltipPosition(el, step, rect);
      return;
    }
    const total = state.steps.length;
    const index = state.currentStepIndex;
    const isLast = index === total - 1;
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    el.innerHTML = `
      <span class="tour-card__nose" aria-hidden="true"></span>
      <div class="tour-card__live" aria-live="polite" aria-atomic="true">
        <div class="tour-card__kicker">Шаг ${index + 1} из ${total}</div>
        <h3 class="tour-card__title" id="tour-card-title">${esc(step.title)}</h3>
        <p class="tour-card__text" id="tour-card-text">${esc(step.text)}</p>
      </div>
      <div class="tour-card__actions">
        ${isLast ? '' : '<button type="button" class="tour-card__skip">Пропустить</button>'}
        <button type="button" class="tour-card__next">${isLast ? 'Всё понятно' : 'Далее'}</button>
      </div>
    `;
    const nextBtn = el.querySelector('.tour-card__next');
    const skipBtn = el.querySelector('.tour-card__skip');
    if (nextBtn) nextBtn.onclick = () => OnboardingTour.next();
    if (skipBtn) skipBtn.onclick = () => OnboardingTour.skip();
    updateTooltipPosition(el, step, rect, true);
    state._lastAnimatedStep = state.currentStepIndex;
    // Строка «доступность»: фокус на «Далее».
    try { nextBtn?.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
  }

  // Карточка ниже окна, если окно в верхней половине экрана, и выше — если в
  // нижней; носик всегда указывает на окно (строка «карточка шага»).
  function updateTooltipPosition(el, step, rect, animate = false) {
    const padding = 4;
    const nose = 14;
    const gap = 12;
    const windowTop = rect.top - padding;
    const windowBottom = rect.bottom + padding;
    const centerY = (windowTop + windowBottom) / 2;
    const below = centerY < window.innerHeight / 2;
    el.classList.toggle('tour-card--below', below);
    el.classList.toggle('tour-card--above', !below);
    if (below) {
      el.style.top = Math.round(windowBottom + nose / 2 + gap) + 'px';
      el.style.bottom = '';
    } else {
      el.style.top = '';
      el.style.bottom = Math.round(window.innerHeight - windowTop + nose / 2 + gap) + 'px';
    }
    const noseEl = el.querySelector('.tour-card__nose');
    if (noseEl) {
      const cardLeft = 14;
      const cardWidth = window.innerWidth - cardLeft * 2;
      const centerX = (rect.left + rect.right) / 2 - cardLeft;
      const x = Math.max(22, Math.min(cardWidth - 22 - nose, centerX - nose / 2));
      noseEl.style.left = Math.round(x) + 'px';
    }
    if (animate && !reducedMotion()) {
      el.classList.remove('tour-card--enter');
      void el.offsetWidth;
      el.classList.add('tour-card--enter');
    }
  }

  // === PUBLIC API ===

  const OnboardingTour = {

    /**
     * Запустить тур (с welcome modal)
     * @param {Object} options - { force: boolean, onComplete: func, skipWelcome: boolean }
     */
    async start(options = {}) {
      if (!ONBOARDING_TOUR_ENABLED) {
        trackTourEvent('onboarding_tour_skipped', { reason: 'disabled' });
        return false;
      }

      if (state.isActive) return;

      // Проверка: уже проходил?
      const isCompleted = getStoredFlag(STORAGE_KEY, false);

      if (isCompleted && !options.force) return;

      // Получаем имя пользователя для персонализации
      state.userName = getUserName();

      trackTourEvent('onboarding_tour_starting', { hasUserName: !!state.userName });

      // FORCE SWITCH TO MAIN TAB before starting
      // This ensures elements like hero-stats are in the DOM
      // Обзор идёт поверх настоящей Главной (строка «своих чисел»).
      if (HEYS.ui && HEYS.ui.switchTab) HEYS.ui.switchTab('widgets');
      state.fromSettings = !!options.fromSettings;

      // Temporarily suppress Morning Check-in using a global flag
      if (HEYS.ui) {
        HEYS.ui.suppressMorningCheckin = true;
        trackTourEvent('onboarding_checkin_suppressed', {});
      }

      // Ждём, пока на Главной появится хоть одна цель обзора; из нуля
      // доступных шагов обзор не запускается вовсе (строка «цель не найдена»).
      const waitForSteps = (timeout = 2500) => new Promise((resolve) => {
        const startTime = Date.now();
        const check = () => {
          const steps = availableSteps();
          if (steps.length || Date.now() - startTime > timeout) resolve(steps);
          else requestAnimationFrame(check);
        };
        check();
      });
      state.steps = await waitForSteps();
      trackTourEvent('onboarding_steps_available', { count: state.steps.length });
      if (!state.steps.length) {
        trackTourEvent('onboarding_tour_skipped', { reason: 'no_targets' });
        if (HEYS.ui) HEYS.ui.suppressMorningCheckin = false;
        return;
      }

      state.isActive = true;
      state.onComplete = options.onComplete;
      state.stepStartTime = Date.now(); // Для time_on_step

      // Восстановление прерванного шага если есть
      const interruptedStep = getInterruptedStep();
      if (interruptedStep !== null && !options.force && interruptedStep < state.steps.length) {
        state.currentStepIndex = interruptedStep;
        trackTourEvent('onboarding_resume_interrupted_step', { step: interruptedStep });
      } else {
        state.currentStepIndex = 0;
      }

      // Подписываемся на visibility change
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Добавляем класс для скрытия PWA баннера
      document.body.classList.add('tour-active');

      createOverlay();
      this.renderStep();
      triggerHaptic();

      // Analytics
      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('tour_started', {
          user_name: state.userName ? 'yes' : 'no'
        });
      }
    },

    /**
     * Показать текущий шаг
     */
    renderStep() {
      if (!state.isActive) return;
      const step = state.steps[state.currentStepIndex];
      if (!step) { this.finish(); return; }
      const rect = stepTargetRect(step);
      trackTourEvent('onboarding_render_step', { step: step.id, found: !!rect });
      if (!rect) {
        // Цель исчезла по ходу — шаг выпадает, счёт пересчитывается.
        trackTourEvent('onboarding_target_missing', { step: step.id });
        state.steps = state.steps.filter((item) => item !== step);
        if (!state.steps.length) { this.finish(); return; }
        if (state.currentStepIndex >= state.steps.length) state.currentStepIndex = state.steps.length - 1;
        state._lastAnimatedStep = null;
        this.renderStep();
        return;
      }
      const updatePosition = () => {
        if (!state.isActive) return;
        const current = stepTargetRect(step) || rect;
        createHighlight(current, step.radius);
        createTooltip(step, current);
      };
      const target = step.getTarget();
      const first = Array.isArray(target) ? target[0] : target;
      if (first?.scrollIntoView) first.scrollIntoView({ behavior: 'instant', block: 'center' });
      requestAnimationFrame(() => {
        updatePosition();
        setTimeout(updatePosition, 100);
      });
    },

    next() {
      if (!state.isActive) return;

      // Трекаем время на шаге
      const timeOnStep = state.stepStartTime ? Date.now() - state.stepStartTime : 0;

      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('tour_step', {
          step_index: state.currentStepIndex,
          step_id: state.steps[state.currentStepIndex]?.id,
          time_on_step_ms: timeOnStep
        });
      }

      triggerHaptic();

      if (state.currentStepIndex < state.steps.length - 1) {
        state.currentStepIndex++;
        state.stepStartTime = Date.now(); // Сброс таймера для нового шага
        this.renderStep();
      } else {
        this.finish({ completed: true });
      }
    },

    skip() {
      const timeOnStep = state.stepStartTime ? Date.now() - state.stepStartTime : 0;

      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('tour_skipped', {
          step: state.currentStepIndex,
          time_on_step_ms: timeOnStep
        });
      }
      this.finish();
    },

    finish(result = {}) {
      if (!state.isActive) return;
      // Строка «обзор пройден»: после последнего шага — плашка по правилам
      // undo-bar без кольца и действия, 4 с. Из настроек и по «Пропустить»
      // плашки нет (строки «возврат к обзору», «пропуск без переспроса»).
      if (result.completed && !state.fromSettings) {
        HEYS.Undo?.push?.({ label: 'Обзор пройден. Вернуться к нему — в настройках', duration: 4000, notice: true });
      }

      trackTourEvent('onboarding_tour_finished', {});

      // Отписываемся от visibility change
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Убираем класс для скрытия PWA баннера
      document.body.classList.remove('tour-active');

      // Снимаем флаг подавления Morning Check-in
      if (HEYS.ui) {
        HEYS.ui.suppressMorningCheckin = false;
        trackTourEvent('onboarding_checkin_restored', {});
      }

      // Cleanup DOM
      if (state.overlayEl) state.overlayEl.remove();
      if (state.highlightEl) state.highlightEl.remove();
      if (state.tooltipEl) state.tooltipEl.remove();

      state.overlayEl = null;
      state.highlightEl = null;
      state.tooltipEl = null;
      state.isActive = false;
      state.stepStartTime = null;
      state.userName = null;
      state.wasHidden = false;

      // 🆕 Уведомляем виджеты о выходе из демо-режима (чтобы вернуть реальные данные)
      HEYS.Widgets?.emit?.('data:updated', {});

      // Save state
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(STORAGE_KEY, true);
      } else {
        localStorage.setItem(STORAGE_KEY, 'true');
      }

      // Очищаем прерванный шаг т.к. тур завершён
      clearInterruptedStep();

      triggerHaptic();

      // Analytics
      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('tour_completed', {
          total_steps: state.steps.length
        });
      }

      // 🎉 Gamification: конфетти через централизованный модуль
      if (HEYS.game?.celebrate) {
        HEYS.game.celebrate();
      }

      // 🏆 Gamification: XP награда за прохождение онбординга
      if (HEYS.game?.addXP) {
        HEYS.game.addXP(50, 'onboarding_completed');
      }

      if (state.onComplete) state.onComplete();
    },

    /**
     * Активен ли тур сейчас?
     * (используется компонентами для рендера demo-данных)
     */
    isActive() {
      return state.isActive;
    },

    isEnabled() {
      return ONBOARDING_TOUR_ENABLED;
    },

    /**
     * Получить демо данные для конкретного компонента
     * @param {string} componentId - 'hero' | 'sparkline'
     * @returns {Object|null}
     */
    getDemoData() {
      // Строка «своих чисел, а не демонстрационных»: обзор идёт по настоящему
      // экрану, демо-числа в разметку не подставляются.
      return null;
    },

    /**
     * Сбросить флаг прохождения (для тестирования)
     */
    reset() {
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(STORAGE_KEY, false);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      trackTourEvent('onboarding_tour_reset', {});
    },

    async openVisualFixtureStep(stepIndex) {
      if (state.isActive) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (state.overlayEl) state.overlayEl.remove();
        if (state.highlightEl) state.highlightEl.remove();
        if (state.tooltipEl) state.tooltipEl.remove();
        state.overlayEl = null;
        state.highlightEl = null;
        state.tooltipEl = null;
        state.isActive = false;
        document.body.classList.remove('tour-active');
        document.body.style.overflow = '';
      }
      // `start()` сюда не годится по двум причинам: тур выключен флагом до
      // пострелизной доводки, и по пути он переключает вкладку, глушит утренний
      // чек-ин и будит виджеты — на стенде это подвешивало страницу. Кадрам
      // нужен только слой с подсветкой над готовыми целями, поэтому состояние
      // поднимается ровно до него.
      state.isActive = true;
      state.userName = state.userName || '';
      state.stepStartTime = Date.now();
      document.body.classList.add('tour-active');
      createOverlay();

      state.steps = availableSteps();
      if (!state.steps.length) throw new Error('OnboardingTour: на экране нет ни одной цели обзора');
      state.fromSettings = false;
      state.currentStepIndex = Math.min(Math.max(0, stepIndex), state.steps.length - 1);
      state._lastAnimatedStep = null;
      this.renderStep();
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔮 INSIGHTS MINI-TOUR — контекстный мини-тур для вкладки Инсайтов
  // ═══════════════════════════════════════════════════════════════════════════

  const INSIGHTS_TOUR_ID = 'insights_tour_v1';
  const INSIGHTS_STORAGE_KEY = 'heys_insights_tour_completed';

  const INSIGHTS_TOUR_STEPS = [
    {
      id: 'insights_status',
      targetId: 'tour-insights-status',
      title: '📊 Статус дня',
      getText: () => 'Интегральная оценка 0-100. Показывает насколько день соответствует вашим целям.',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'insights_metabolic',
      targetId: 'tour-insights-metabolic',
      title: '⚡ Метаболический статус',
      getText: () => 'Быстрая оценка риска срыва и текущего состояния метаболизма.',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'insights_prediction',
      targetId: 'tour-insights-prediction',
      title: '🔮 Прогнозы',
      getText: () => 'AI-предсказания на основе ваших паттернов: риски, рекомендации, инсайты.',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'insights_phenotype',
      targetId: 'tour-insights-phenotype',
      title: '🧬 Метаболический фенотип',
      getText: () => 'Ваш уникальный профиль: как организм реагирует на еду и нагрузки.',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'insights_analytics',
      targetId: 'tour-insights-analytics',
      title: '📈 Расширенная аналитика',
      getText: () => 'Глубокий анализ: корреляции, тренды, сравнение периодов.',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'insights_metabolism',
      targetId: 'tour-insights-metabolism',
      title: '🔥 Метаболизм',
      getText: () => 'Детали энергообмена: BMR, TDEE, термический эффект пищи.',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'insights_timing',
      targetId: 'tour-insights-timing',
      title: '⏰ Тайминг приёмов',
      getText: () => 'Оптимальное время для еды на основе вашего режима.',
      position: 'bottom',
      arrow: 'top'
    }
  ];

  let insightsState = {
    isActive: false,
    currentStepIndex: 0,
    overlayEl: null,
    tooltipEl: null,
    highlightEl: null
  };

  /**
   * Проверить, нужно ли показывать мини-тур Insights
   */
  function shouldShowInsightsTour() {
    if (!INSIGHTS_TOUR_ENABLED) return false;

    // Не показываем если основной тур ещё не пройден
    const mainTourCompleted = getStoredFlag(STORAGE_KEY, false);
    if (!mainTourCompleted) return false;

    // Не показываем если мини-тур уже пройден
    const insightsTourCompleted = getStoredFlag(INSIGHTS_STORAGE_KEY, false);
    if (insightsTourCompleted) return false;

    // Не показываем кураторам
    const isCurator = typeof HEYS.auth?.isCuratorSession === 'function'
      ? HEYS.auth.isCuratorSession()
      : !!HEYS.cloud?.getUser?.();
    if (isCurator) return false;

    return true;
  }

  /**
   * Рендер шага мини-тура Insights
   */
  function renderInsightsStep() {
    const step = INSIGHTS_TOUR_STEPS[insightsState.currentStepIndex];
    if (!step) return;

    const target = document.getElementById(step.targetId);
    if (!target) {
      trackTourEvent('insights_tour_target_missing', { targetId: step.targetId });
      // Пропускаем шаг если элемент не найден
      if (insightsState.currentStepIndex < INSIGHTS_TOUR_STEPS.length - 1) {
        insightsState.currentStepIndex++;
        renderInsightsStep();
      } else {
        InsightsTour.finish();
      }
      return;
    }

    // Scroll to target
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll and render
    setTimeout(() => {
      const rect = target.getBoundingClientRect();

      // Используем те же функции создания overlay/highlight/tooltip
      if (insightsState.overlayEl) insightsState.overlayEl.remove();
      if (insightsState.highlightEl) insightsState.highlightEl.remove();
      if (insightsState.tooltipEl) insightsState.tooltipEl.remove();

      insightsState.overlayEl = createOverlay();
      insightsState.highlightEl = createHighlight(rect);
      insightsState.tooltipEl = createInsightsTooltip(step, rect);

      document.body.appendChild(insightsState.overlayEl);
      document.body.appendChild(insightsState.highlightEl);
      document.body.appendChild(insightsState.tooltipEl);

      // Fade-in анимация — меняем inline opacity напрямую (т.к. inline перезаписывает CSS класс)
      requestAnimationFrame(() => {
        insightsState.tooltipEl.style.opacity = '1';
        insightsState.tooltipEl.style.transform = 'translateY(0)';
      });
    }, 300);
  }

  /**
   * Создаём tooltip для мини-тура (укороченная версия)
   */
  function createInsightsTooltip(step, targetRect) {
    const el = document.createElement('div');
    el.className = 'tour-tooltip tour-tooltip--insights';
    el.style.cssText = `
      position: fixed;
      z-index: 9002;
      background: linear-gradient(135deg, #1e1e2f 0%, #2d2d44 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 12px;
      padding: 14px 18px;
      max-width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(139, 92, 246, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #fff;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    `;

    const stepNumber = insightsState.currentStepIndex + 1;
    const totalSteps = INSIGHTS_TOUR_STEPS.length;
    const progress = Math.round((stepNumber / totalSteps) * 100);

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: #a78bfa;">${step.title}</span>
        <span style="font-size: 11px; color: #888;">${stepNumber}/${totalSteps}</span>
      </div>
      <div style="font-size: 13px; line-height: 1.4; color: #ddd; margin-bottom: 12px;">
        ${step.getText()}
      </div>
      <div style="background: rgba(139,92,246,0.2); border-radius: 4px; height: 3px; margin-bottom: 12px;">
        <div style="background: #a78bfa; height: 100%; width: ${progress}%; border-radius: 4px; transition: width 0.3s ease;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; gap: 8px;">
        <button class="tour-skip-insights" style="
          flex: 1;
          padding: 8px 12px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          background: transparent;
          color: #aaa;
          font-size: 12px;
          cursor: pointer;
        ">Пропустить</button>
        <button class="tour-next-insights" style="
          flex: 2;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: white;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        ">${stepNumber === totalSteps ? '✨ Готово' : 'Далее →'}</button>
      </div>
    `;

    // Events
    el.querySelector('.tour-skip-insights').onclick = () => InsightsTour.skip();
    el.querySelector('.tour-next-insights').onclick = () => InsightsTour.next();

    // Position
    const padding = 16;
    let top, left;

    if (step.position === 'bottom') {
      top = targetRect.bottom + padding;
      left = targetRect.left + (targetRect.width / 2) - 140;
    } else {
      top = targetRect.top - 200 - padding;
      left = targetRect.left + (targetRect.width / 2) - 140;
    }

    // Clamp to screen
    left = Math.max(16, Math.min(left, window.innerWidth - 296));
    top = Math.max(16, Math.min(top, window.innerHeight - 220));

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;

    return el;
  }

  const InsightsTour = {
    /**
     * Запустить мини-тур Insights
     */
    start() {
      if (insightsState.isActive) return;
      if (!shouldShowInsightsTour()) {
        trackTourEvent('insights_tour_skipped', { reason: 'not_needed' });
        return;
      }

      trackTourEvent('insights_tour_starting', {});
      insightsState.isActive = true;
      insightsState.currentStepIndex = 0;

      // Блокируем скролл
      document.body.style.overflow = 'hidden';

      // 🔧 v1.16 FIX: Добавляем класс для скрытия PWA баннера (как в основном туре)
      document.body.classList.add('tour-active');

      triggerHaptic();
      renderInsightsStep();

      // Analytics
      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('insights_tour_started');
      }
    },

    /**
     * Следующий шаг
     */
    next() {
      if (!insightsState.isActive) return;

      triggerHaptic();

      if (insightsState.currentStepIndex < INSIGHTS_TOUR_STEPS.length - 1) {
        insightsState.currentStepIndex++;
        renderInsightsStep();
      } else {
        InsightsTour.finish();
      }
    },

    /**
     * Пропустить тур
     */
    skip() {
      trackTourEvent('insights_tour_skipped', { reason: 'user' });
      InsightsTour.cleanup();

      // 🔧 v1.12 FIX: Сохраняем в ОБА места
      if (HEYS.store?.set) {
        HEYS.store.set(INSIGHTS_STORAGE_KEY, true);
      }
      // ВСЕГДА также сохраняем в unscoped localStorage
      localStorage.setItem(INSIGHTS_STORAGE_KEY, 'true');

      // Dispatch событие для обновления React компонента
      window.dispatchEvent(new Event('storage'));

      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('insights_tour_skipped', {
          step: insightsState.currentStepIndex
        });
      }
    },

    /**
     * Завершить тур
     */
    finish() {
      trackTourEvent('insights_tour_completed', {});
      InsightsTour.cleanup();

      // 🔧 v1.12 FIX: Сохраняем в ОБА места:
      // 1. HEYS.store (scoped с clientId) — для cloud sync
      // 2. localStorage напрямую (unscoped) — для React компонента который читает напрямую
      if (HEYS.store?.set) {
        HEYS.store.set(INSIGHTS_STORAGE_KEY, true);
      }
      // ВСЕГДА также сохраняем в unscoped localStorage для React-компонента
      localStorage.setItem(INSIGHTS_STORAGE_KEY, 'true');

      trackTourEvent('insights_tour_saved', { key: INSIGHTS_STORAGE_KEY });

      // 🔧 v1.17 FIX: Прокрутка страницы вверх чтобы была видна заглушка "3 дня"
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        trackTourEvent('insights_tour_scrolled_top', {});
      }, 100);

      // Dispatch событие для обновления React компонента
      window.dispatchEvent(new Event('storage'));

      triggerHaptic();

      if (HEYS.analytics) {
        HEYS.analytics.trackEvent('insights_tour_completed');
      }

      // Небольшой конфетти для завершения
      if (HEYS.game?.celebrate) {
        HEYS.game.celebrate();
      }

      // 🔧 v1.19: WidgetsTour запускается при переходе на вкладку виджетов
      // (аналогично InsightsTour при переходе на insights)
      // Автозапуск убран — тур теперь стартует в WidgetsTab useEffect
      trackTourEvent('insights_tour_next_widgets_hint', {});
    },

    /**
     * Очистить DOM
     */
    cleanup() {
      if (insightsState.overlayEl) insightsState.overlayEl.remove();
      if (insightsState.highlightEl) insightsState.highlightEl.remove();
      if (insightsState.tooltipEl) insightsState.tooltipEl.remove();

      // Разблокируем скролл
      document.body.style.overflow = '';

      // 🔧 v1.16 FIX: Убираем класс скрытия PWA баннера
      document.body.classList.remove('tour-active');

      insightsState.overlayEl = null;
      insightsState.highlightEl = null;
      insightsState.tooltipEl = null;
      insightsState.isActive = false;
    },

    /**
     * Активен ли мини-тур
     */
    isActive() {
      return insightsState.isActive;
    },

    /**
     * Сбросить флаг прохождения
     */
    reset() {
      if (HEYS.store?.set) {
        HEYS.store.set(INSIGHTS_STORAGE_KEY, false);
      } else {
        localStorage.removeItem(INSIGHTS_STORAGE_KEY);
      }
      trackTourEvent('insights_tour_reset', {});
    },

    /**
     * Нужно ли показывать тур
     */
    shouldShow: shouldShowInsightsTour
  };

  HEYS.OnboardingTour = OnboardingTour;
  HEYS.InsightsTour = InsightsTour;

  // =========================================================================
  // 4. WIDGETS TOUR (Мини-тур для вкладки виджетов)
  // =========================================================================

  const WIDGETS_TOUR_ID = 'widgets_tour_v1';
  const WIDGETS_STORAGE_KEY = 'heys_widgets_tour_completed';

  /**
   * Шаги демо-обзора виджетов (ДО режима редактирования)
   * Показывают реальные виджеты на странице с объяснениями и демо-данными
   */
  const WIDGETS_DEMO_STEPS = [
    {
      id: 'demo_intro',
      targetSelector: '.widgets-grid',
      title: '📊 Ваша панель виджетов',
      getText: () => 'Это ваша персональная панель. Здесь вы видите ключевые показатели дня.',
      demoData: '🎯 Каждый виджет — отдельный показатель вашего прогресса',
      position: 'bottom',
      arrow: 'top',
      isDemo: true
    },
    {
      id: 'demo_calories',
      targetSelector: '[data-widget-type="calories"]',
      title: '🔥 Калории',
      getText: () => 'Показывает вашу цель на день и сколько осталось.',
      demoData: '📊 Например: 750 из 2000 ккал — осталось 1250 ккал',
      position: 'bottom',
      arrow: 'top',
      isDemo: true
    },
    {
      id: 'demo_water',
      targetSelector: '[data-widget-type="water"]',
      title: '💧 Водный баланс',
      getText: () => 'Отслеживает выпитую воду за день.',
      demoData: '💧 Например: 1.2 л из 2.5 л — ещё 5 стаканов',
      position: 'bottom',
      arrow: 'top',
      isDemo: true
    },
    {
      id: 'demo_weight',
      targetSelector: '[data-widget-type="weight"]',
      title: '⚖️ Вес и тренд',
      getText: () => 'Текущий вес, BMI и динамика за неделю.',
      demoData: '⚖️ Например: 72.3 кг, BMI 23.5, ↓0.5 кг за неделю',
      position: 'bottom',
      arrow: 'top',
      isDemo: true
    },
    {
      id: 'demo_heatmap',
      targetSelector: '[data-widget-type="heatmap"]',
      title: '📅 Тепловая карта',
      getText: () => 'Цветовая история: 🟢 норма, 🟡 небольшое отклонение, 🔴 срыв.',
      demoData: '📅 Видите паттерны: по выходным чаще жёлтые дни?',
      position: 'top',
      arrow: 'bottom',
      isDemo: true
    },
    {
      id: 'demo_crashRisk',
      targetSelector: '[data-widget-type="crashRisk"]',
      title: '⚠️ Риск срыва',
      getText: () => 'ИИ предупреждает о риске переедания заранее.',
      demoData: '🤖 Например: Риск 65% — мало сна + стресс',
      position: 'bottom',
      arrow: 'top',
      isDemo: true
    }
  ];

  /**
   * Шаги мини-тура для редактирования виджетов (ПОСЛЕ демо-обзора)
   */
  const WIDGETS_EDIT_STEPS = [
    {
      id: 'widgets_edit',
      targetId: 'tour-widgets-edit',
      title: '✏️ Режим редактирования',
      getText: () => 'Нажмите эту кнопку, чтобы перейти в режим редактирования виджетов',
      position: 'top',
      arrow: 'bottom',
      requiresEditMode: true
    },
    {
      id: 'widgets_add',
      targetId: 'tour-widgets-add',
      title: '➕ Добавление виджетов',
      getText: () => 'Откройте каталог и выберите нужные виджеты для вашей панели',
      position: 'top',
      arrow: 'bottom',
      requiresEditMode: true
    },
    {
      id: 'widgets_size',
      targetId: 'tour-widgets-size',
      title: '📐 Изменение размера',
      getText: () => 'Потяните за угол виджета или нажмите на бейдж размера. Больше размер — больше информации!',
      position: 'bottom',
      arrow: 'top',
      requiresEditMode: true
    },
    {
      id: 'widgets_settings',
      targetId: 'tour-widgets-settings',
      title: '⚙️ Настройки виджета',
      getText: () => 'Настройте отображение данных внутри виджета под себя',
      position: 'bottom',
      arrow: 'top',
      requiresEditMode: true
    },
    {
      id: 'widgets_delete',
      targetId: 'tour-widgets-delete',
      title: '🗑️ Удаление виджетов',
      getText: () => 'Уберите ненужные виджеты — всегда можно добавить обратно из каталога',
      position: 'bottom',
      arrow: 'top',
      requiresEditMode: true
    }
  ];

  /**
   * Все шаги тура виджетов (демо + редактирование)
   */
  const WIDGETS_TOUR_STEPS = [...WIDGETS_DEMO_STEPS, ...WIDGETS_EDIT_STEPS];

  /**
   * Стейт мини-тура виджетов
   */
  const widgetsState = {
    isActive: false,
    currentStepIndex: 0,
    overlayEl: null,
    tooltipEl: null,
    highlightEl: null,
    wasEditModeActive: false // Сохраняем исходное состояние edit mode
  };

  /**
   * Проверка: показывать ли мини-тур виджетов
   */
  function shouldShowWidgetsTour() {
    if (!WIDGETS_TOUR_ENABLED) return false;

    // Главный тур должен быть пройден
    const mainCompleted = getStoredFlag(STORAGE_KEY, false);
    if (!mainCompleted) return false;

    // Тур виджетов не пройден
    const widgetsCompleted = getStoredFlag(WIDGETS_STORAGE_KEY, false);
    if (widgetsCompleted) return false;

    // Для кураторов не показываем
    if (typeof HEYS.auth?.isCuratorSession === 'function') {
      if (HEYS.auth.isCuratorSession()) return false;
    } else if (HEYS.user?.isCurator?.()) {
      return false;
    }

    return true;
  }

  /**
   * Рендер шага тура виджетов
   */
  function renderWidgetsStep(stepIndex) {
    const step = WIDGETS_TOUR_STEPS[stepIndex];
    if (!step) return;

    // Если это edit step и мы еще не в edit mode - входим
    if (step.requiresEditMode && !HEYS.Widgets?.isEditMode?.()) {
      trackTourEvent('widgets_tour_enter_edit_mode', {});
      if (HEYS.Widgets?.enterEditMode) {
        HEYS.Widgets.enterEditMode();
        // Даем DOM обновиться после входа в edit mode
        setTimeout(() => renderWidgetsStep(stepIndex), 150);
        return;
      }
    }

    // Находим элемент: по selector (для demo) или по id (для edit)
    let targetEl;
    if (step.targetSelector) {
      targetEl = document.querySelector(step.targetSelector);
    } else if (step.targetId) {
      targetEl = document.getElementById(step.targetId);
    }

    if (!targetEl) {
      trackTourEvent('widgets_tour_target_missing', { targetId: step.targetSelector || step.targetId });
      // Пропускаем шаг если элемент не найден
      if (stepIndex < WIDGETS_TOUR_STEPS.length - 1) {
        widgetsState.currentStepIndex++;
        renderWidgetsStep(widgetsState.currentStepIndex);
      } else {
        WidgetsTour.finish();
      }
      return;
    }

    // Обновляем overlay (создаём сразу)
    if (!widgetsState.overlayEl) {
      widgetsState.overlayEl = document.createElement('div');
      widgetsState.overlayEl.className = 'tour-overlay tour-overlay--mini';
      document.body.appendChild(widgetsState.overlayEl);
    }

    // Highlight (создаём сразу)
    if (!widgetsState.highlightEl) {
      widgetsState.highlightEl = document.createElement('div');
      widgetsState.highlightEl.className = 'tour-highlight';
      document.body.appendChild(widgetsState.highlightEl);
    }

    // Функция обновления позиции хайлайта и тултипа
    const updateHighlightPosition = () => {
      const rect = targetEl.getBoundingClientRect();
      const padding = 8;
      widgetsState.highlightEl.style.cssText = `
        position: fixed;
        top: ${rect.top - padding}px;
        left: ${rect.left - padding}px;
        width: ${rect.width + padding * 2}px;
        height: ${rect.height + padding * 2}px;
        border-radius: 8px;
        z-index: 9001;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.65);
        pointer-events: none;
      `;

      // Tooltip
      if (widgetsState.tooltipEl) widgetsState.tooltipEl.remove();
      widgetsState.tooltipEl = createWidgetsTooltip(step, stepIndex, rect);
      document.body.appendChild(widgetsState.tooltipEl);
    };

    // Scroll to element и обновляем позицию после завершения скролла
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Позиционируем сразу для быстрого появления
    updateHighlightPosition();

    // И обновляем после завершения smooth scroll (300-500ms)
    setTimeout(updateHighlightPosition, 350);
  }

  /**
   * Создание тултипа для тура виджетов (бирюзовая тема)
   */
  function createWidgetsTooltip(step, stepIndex, targetRect) {
    const tooltip = document.createElement('div');
    // Сразу добавляем tour-tooltip-enter для видимости (без анимации появления)
    tooltip.className = 'tour-tooltip tour-tooltip--mini tour-tooltip-enter';

    // Определяем фазу тура (demo или edit)
    const isDemo = step.isDemo === true;
    const demoStepsCount = WIDGETS_DEMO_STEPS.length;
    const editStepsCount = WIDGETS_EDIT_STEPS.length;

    // Прогресс внутри фазы
    let phaseLabel, phaseProgress;
    if (isDemo) {
      phaseLabel = '👀 Обзор виджетов';
      phaseProgress = `${stepIndex + 1}/${demoStepsCount}`;
    } else {
      const editStepIndex = stepIndex - demoStepsCount;
      phaseLabel = '⚙️ Настройка';
      phaseProgress = `${editStepIndex + 1}/${editStepsCount}`;
    }

    const totalProgress = `${stepIndex + 1}/${WIDGETS_TOUR_STEPS.length}`;
    const isLast = stepIndex === WIDGETS_TOUR_STEPS.length - 1;

    // Цвет фона в зависимости от фазы
    const bgGradient = isDemo
      ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' // фиолетовый для demo
      : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'; // бирюзовый для edit
    const shadowColor = isDemo ? 'rgba(139, 92, 246, 0.3)' : 'rgba(6, 182, 212, 0.3)';
    const btnColor = isDemo ? '#7c3aed' : '#0891b2';

    // Демо-данные (если есть)
    const demoDataHtml = step.demoData
      ? `<div style="margin-top: 8px; padding: 8px 10px; background: rgba(255,255,255,0.15); border-radius: 8px; font-size: 12px; line-height: 1.4;">
          ${step.demoData}
        </div>`
      : '';

    tooltip.innerHTML = `
      <div style="background: ${bgGradient}; color: white; padding: 12px 16px; border-radius: 12px; box-shadow: 0 8px 32px ${shadowColor}; min-width: 220px; max-width: 280px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; opacity: 0.85;">${phaseLabel} ${phaseProgress}</span>
        </div>
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px;">${step.title}</div>
        <div style="font-size: 13px; opacity: 0.95; line-height: 1.4; max-height: 80px; overflow-y: auto;">${step.getText()}</div>
        ${demoDataHtml}
        <div style="display: flex; gap: 8px; margin-top: 12px; flex-shrink: 0;">
          <button class="widgets-tour-skip" style="flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.3); background: transparent; color: white; border-radius: 8px; cursor: pointer; font-size: 12px;">Пропустить</button>
          <button class="widgets-tour-next" style="flex: 1; padding: 8px 12px; border: none; background: white; color: ${btnColor}; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;">${isLast ? 'Готово!' : 'Далее →'}</button>
        </div>
        <div style="margin-top: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; height: 3px; overflow: hidden; flex-shrink: 0;">
          <div style="background: white; height: 100%; width: ${((stepIndex + 1) / WIDGETS_TOUR_STEPS.length) * 100}%; transition: width 0.3s;"></div>
        </div>
      </div>
    `;

    // Position
    const tooltipWidth = 280;
    const tooltipHeight = 220; // Приблизительная высота тултипа
    const gap = 12;
    let top, left;

    // Сначала пробуем разместить согласно step.position
    if (step.position === 'top') {
      top = targetRect.top - gap - tooltipHeight;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    } else {
      top = targetRect.bottom + gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    }

    // Constrain to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

    // Проверяем нижнюю границу — если выходит за viewport, переносим наверх
    if (top + tooltipHeight > window.innerHeight - 16) {
      top = targetRect.top - gap - tooltipHeight;
    }
    // Проверяем верхнюю границу
    top = Math.max(16, top);

    tooltip.style.cssText = `
      position: fixed;
      top: ${top}px;
      left: ${left}px;
      z-index: 9002;
    `;

    // Event listeners
    tooltip.querySelector('.widgets-tour-skip').onclick = () => WidgetsTour.skip();
    tooltip.querySelector('.widgets-tour-next').onclick = () => WidgetsTour.next();

    return tooltip;
  }

  /**
   * WidgetsTour API
   */
  const WidgetsTour = {
    /**
     * Запустить мини-тур виджетов
     */
    start() {
      if (!shouldShowWidgetsTour()) {
        trackTourEvent('widgets_tour_skipped', { reason: 'not_ready' });
        return false;
      }

      trackTourEvent('widgets_tour_starting', {});
      widgetsState.isActive = true;
      widgetsState.currentStepIndex = 0;

      // 🔧 v1.19 FIX: Сначала переключаем на вкладку widgets, чтобы виджеты отрендерились
      const currentTab = window.HEYS?.App?.getTab?.();
      if (currentTab !== 'widgets') {
        trackTourEvent('widgets_tour_switch_tab', { currentTab });
        if (window.HEYS?.App?.setTab) {
          window.HEYS.App.setTab('widgets');
          // Ждём пока виджеты отрендерятся (300ms для React re-render)
          setTimeout(() => {
            this._startInternal();
          }, 400);
          return true;
        }
      }

      // Если уже на вкладке widgets - стартуем сразу
      this._startInternal();
      return true;
    },

    /**
     * Внутренний старт после переключения вкладки
     */
    _startInternal() {
      trackTourEvent('widgets_tour_start_internal', {});

      // Сохраняем исходное состояние edit mode (восстановим при выходе)
      widgetsState.wasEditModeActive = HEYS.Widgets?.isEditMode?.() || false;

      // НЕ входим в edit mode сразу - сначала показываем demo шаги
      // Edit mode включится автоматически когда дойдём до шагов с requiresEditMode: true

      // Блокируем скролл
      document.body.style.overflow = 'hidden';
      document.body.classList.add('tour-active');

      // Небольшая задержка для обновления DOM после переключения вкладки
      setTimeout(() => {
        renderWidgetsStep(0);
      }, 150);
    },

    /**
     * Следующий шаг
     */
    next() {
      if (!widgetsState.isActive) return;

      if (widgetsState.currentStepIndex < WIDGETS_TOUR_STEPS.length - 1) {
        widgetsState.currentStepIndex++;
        renderWidgetsStep(widgetsState.currentStepIndex);
      } else {
        this.finish();
      }
    },

    /**
     * Пропустить тур
     */
    skip() {
      trackTourEvent('widgets_tour_skipped', { reason: 'user' });

      // Сохраняем флаг
      if (HEYS.store?.set) {
        HEYS.store.set(WIDGETS_STORAGE_KEY, true);
      }
      localStorage.setItem(WIDGETS_STORAGE_KEY, 'true');

      this.cleanup();
    },

    /**
     * Завершить тур
     */
    finish() {
      trackTourEvent('widgets_tour_completed', {});

      // Сохраняем флаг
      if (HEYS.store?.set) {
        HEYS.store.set(WIDGETS_STORAGE_KEY, true);
      }
      localStorage.setItem(WIDGETS_STORAGE_KEY, 'true');

      this.cleanup();

      // Празднуем
      if (HEYS.game?.celebrate) {
        HEYS.game.celebrate();
      }
    },

    /**
     * Очистить DOM
     */
    cleanup() {
      if (widgetsState.overlayEl) widgetsState.overlayEl.remove();
      if (widgetsState.highlightEl) widgetsState.highlightEl.remove();
      if (widgetsState.tooltipEl) widgetsState.tooltipEl.remove();

      document.body.style.overflow = '';
      document.body.classList.remove('tour-active');

      // Восстанавливаем исходное состояние edit mode
      if (!widgetsState.wasEditModeActive && HEYS.Widgets?.isEditMode?.()) {
        trackTourEvent('widgets_tour_restore_edit_mode', {});
        HEYS.Widgets.exitEditMode?.();
      }

      widgetsState.overlayEl = null;
      widgetsState.highlightEl = null;
      widgetsState.tooltipEl = null;
      widgetsState.isActive = false;
      widgetsState.wasEditModeActive = false;
    },

    /**
     * Активен ли тур
     */
    isActive() {
      return widgetsState.isActive;
    },

    /**
     * Сбросить флаг прохождения
     */
    reset() {
      if (HEYS.store?.set) {
        HEYS.store.set(WIDGETS_STORAGE_KEY, false);
      }
      // ALWAYS remove localStorage key (in case it was set directly)
      localStorage.removeItem(WIDGETS_STORAGE_KEY);

      trackTourEvent('widgets_tour_reset', {});
    },

    /**
     * Нужно ли показывать тур
     */
    shouldShow: shouldShowWidgetsTour
  };

  HEYS.WidgetsTour = WidgetsTour;

})(window);
