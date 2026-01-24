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

  const TOUR_ID = 'onboarding_tour_v1';
  const STORAGE_KEY = 'heys_tour_completed';
  const HAPTIC_ENABLED = true; // navigator.vibrate на переходах
  const HAPTIC_PATTERN = [15]; // Короткая вибрация 15ms

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

  // Шаги тура с персонализацией
  const TOUR_STEPS = [
    {
      id: 'step_hero',
      targetId: 'tour-hero-stats',
      title: 'Главные цифры',
      // text генерируется динамически с именем пользователя
      getText: (name) => name
        ? `${name}, здесь ваш статус на сегодня. "Съедено" и "Осталось" помогут держать баланс.`
        : 'Здесь ваш статус на сегодня. "Съедено" и "Осталось" помогут держать баланс.',
      position: 'bottom',
      arrow: 'top',
      demoData: { eaten: 1450, goal: 2000, remaining: 550, ratio: 0.72 }
    },
    {
      id: 'step_sparkline',
      targetId: 'tour-calorie-graph',
      title: 'Динамика и Дефицит',
      getText: () => 'График показывает ваш прогресс за неделю. Следите за средним дефицитом!',
      position: 'bottom',
      arrow: 'top'
    },
    {
      id: 'step_insulin',
      targetId: 'tour-insulin-wave',
      title: 'Инсулиновая волна',
      getText: () => 'Уникальная фишка HEYS. Показывает, когда жиросжигание активно (🔥).',
      position: 'bottom',
      arrow: 'top',
      forceExpand: true // Раскрыть виджет если свернут
    },
    {
      id: 'step_fab',
      targetId: 'tour-fab-buttons',
      title: 'Быстрое добавление',
      getText: () => 'Главная кнопка 🍽️ для еды и 🥛 для воды. Всегда под рукой.',
      position: 'top',
      arrow: 'bottom'
    },
    // === ВКЛАДКИ (по порядку) ===
    {
      id: 'step_widgets',
      targetId: 'tour-widgets-tab',
      title: '🎛️ Виджеты',
      getText: () => 'Ваша панель управления. Настройте виджеты под себя — добавляйте, удаляйте, меняйте размер.',
      position: 'top',
      arrow: 'bottom',
      highlightTab: true
    },
    {
      id: 'step_stats',
      targetId: 'tour-stats-tab',
      title: '📊 Итоги дня',
      getText: () => 'Здесь вся статистика: макросы, сон, шаги, недельный отчёт и умные советы.',
      position: 'top',
      arrow: 'bottom',
      highlightTab: true
    },
    {
      id: 'step_diary',
      targetId: 'tour-diary-tab',
      title: '🍴 Дневник еды',
      getText: () => 'Все приёмы пищи за день. Добавляйте еду, редактируйте, смотрите детали.',
      position: 'top',
      arrow: 'bottom',
      highlightTab: true
    },
    {
      id: 'step_insights',
      targetId: 'tour-insights-tab',
      title: '🔮 Умные Инсайты',
      getText: () => 'Загляните сюда! Анализ метаболизма, прогнозы веса и персональные советы.',
      position: 'top',
      arrow: 'bottom',
      highlightTab: true
    }
  ];

  // Demo данные для визуализации (если у пользователя пусто)
  const TOUR_DEMO_DATA = {
    hero: {
      tdee: 2150,
      optimum: 2000,
      eaten: 1450,
      remaining: 550,
      ratio: 0.72
    },
    sparkline: [
      { date: 'Пн', kcal: 1800, target: 2000 },
      { date: 'Вт', kcal: 1950, target: 2000 },
      { date: 'Ср', kcal: 1700, target: 2000 },
      { date: 'Чт', kcal: 2100, target: 2000 }, // перебор
      { date: 'Пт', kcal: 1850, target: 2000 },
      { date: 'Сб', kcal: 1750, target: 2000 },
      { date: 'Вс', kcal: 0, target: 2000 }
    ]
  };

  // === MODULE STATE ===

  let state = {
    isActive: false,
    currentStepIndex: 0,
    stepStartTime: null, // Время начала шага для analytics
    overlayEl: null,
    tooltipEl: null,
    highlightEl: null,
    welcomeModalEl: null,
    onComplete: null,
    userName: null, // Имя пользователя для персонализации
    wasHidden: false // Флаг для visibilitychange
  };

  // === HAPTIC FEEDBACK ===

  function triggerHaptic() {
    if (HAPTIC_ENABLED && navigator.vibrate) {
      navigator.vibrate(HAPTIC_PATTERN);
    }
  }

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
        if (!isNaN(stepIndex) && stepIndex >= 0 && stepIndex < TOUR_STEPS.length) {
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

  function showWelcomeModal(options = {}) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'tour-welcome-modal';

      // Получаем имя пользователя
      const userName = getUserName();
      const greeting = userName ? `Привет, ${userName}!` : 'Добро пожаловать в HEYS!';

      el.innerHTML = `
        <div class="tour-welcome-backdrop"></div>
        <div class="tour-welcome-content">
          <div class="tour-welcome-icon">👋</div>
          <h2 class="tour-welcome-title">${greeting}</h2>
          <p class="tour-welcome-text">
            Хотите быстро познакомиться с приложением?<br>
            Покажем главные функции за 30 секунд.
          </p>
          <div class="tour-welcome-buttons">
            <button class="tour-btn tour-btn-later">Позже</button>
            <button class="tour-btn tour-btn-start">Да, показать! 🚀</button>
          </div>
        </div>
      `;

      document.body.appendChild(el);
      state.welcomeModalEl = el;

      // Анимация появления
      requestAnimationFrame(() => {
        el.classList.add('tour-welcome-enter');
      });

      // Обработчики
      const startBtn = el.querySelector('.tour-btn-start');
      const laterBtn = el.querySelector('.tour-btn-later');
      const backdrop = el.querySelector('.tour-welcome-backdrop');

      const close = (result) => {
        el.classList.remove('tour-welcome-enter');
        el.classList.add('tour-welcome-exit');
        triggerHaptic();
        setTimeout(() => {
          el.remove();
          state.welcomeModalEl = null;
          resolve(result);
        }, 300);
      };

      startBtn.onclick = () => close('start');
      laterBtn.onclick = () => close('later');
      backdrop.onclick = () => close('later');
    });
  }

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

  function createHighlight(rect) {
    let el = state.highlightEl;
    if (!el) {
      el = document.createElement('div');
      el.className = 'tour-highlight';
      el.style.position = 'fixed';
      el.style.zIndex = '9001';
      // v1.7: Базовая тень + анимация пульсации добавляется через CSS класс
      el.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.75)';
      el.style.borderRadius = '12px';
      el.style.pointerEvents = 'none'; // Пропускать клики если нужно (но обычно мы не даем жать)
      el.style.transition = 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease';
      // v1.7: Пульсация привлекает внимание к подсвеченному элементу
      el.style.animation = 'tourPulse 2s ease-in-out infinite';
      document.body.appendChild(el);
      state.highlightEl = el;
    }

    // Обновляем позицию
    // Добавляем padding
    const padding = 4;
    el.style.top = (rect.top - padding) + 'px';
    el.style.left = (rect.left - padding) + 'px';
    el.style.width = (rect.width + padding * 2) + 'px';
    el.style.height = (rect.height + padding * 2) + 'px';

    return el;
  }

  function createTooltip(step, rect) {
    let el = state.tooltipEl;
    const isNewStep = state._lastAnimatedStep !== state.currentStepIndex;

    if (!el) {
      el = document.createElement('div');
      el.className = 'tour-tooltip';
      el.style.position = 'fixed';
      el.style.zIndex = '9002';
      document.body.appendChild(el);
      state.tooltipEl = el;
    }

    // Контент (обновляем только при смене шага, иначе только позиционируем)
    if (!isNewStep && el.innerHTML) {
      // Только обновление позиции, контент уже есть
      updateTooltipPosition(el, step, rect);
      return;
    }

    // Контент
    const isFirst = state.currentStepIndex === 0;
    const isLast = state.currentStepIndex === TOUR_STEPS.length - 1;

    const nextLabel = isLast ? 'Готово! 🎉' : 'Далее →';

    el.innerHTML = `
      <div class="tour-tooltip-content">
        <h3 class="tour-title">${step.title}</h3>
        <p class="tour-text">${step.text}</p>
        <div class="tour-footer">
          <div class="tour-indicators">
            ${TOUR_STEPS.map((_, i) =>
      `<span class="tour-dot ${i === state.currentStepIndex ? 'active' : ''}"></span>`
    ).join('')}
          </div>
          <div class="tour-buttons">
            ${!isLast ? `<button class="tour-btn tour-btn-skip">Пропустить</button>` : ''}
            <button class="tour-btn tour-btn-next ${isLast ? 'tour-btn-finish' : ''}">${nextLabel}</button>
          </div>
        </div>
        <div class="tour-arrow tour-arrow-${step.arrow}"></div>
      </div>
    `;

    // Обработчики
    const nextBtn = el.querySelector('.tour-btn-next');
    const skipBtn = el.querySelector('.tour-btn-skip');

    if (nextBtn) nextBtn.onclick = () => OnboardingTour.next();
    if (skipBtn) skipBtn.onclick = () => OnboardingTour.skip();

    // Позиционирование
    // Базовая логика position: bottom/top
    const tooltipRect = el.getBoundingClientRect(); // Нужно для центрирования, но пока контент новый
    // Сброс стилей перед измерением
    el.style.top = '';
    el.style.bottom = '';
    el.style.left = '';
    el.style.right = '';

    // Позиционирование и анимация
    updateTooltipPosition(el, step, rect, true);

    // Отмечаем шаг как анимированный
    state._lastAnimatedStep = state.currentStepIndex;
  }

  /**
   * Обновить позицию тултипа (без перерисовки контента)
   * @param {HTMLElement} el - элемент тултипа
   * @param {Object} step - текущий шаг
   * @param {DOMRect} rect - rect целевого элемента
   * @param {boolean} animate - запускать ли анимацию появления
   */
  function updateTooltipPosition(el, step, rect, animate = false) {
    // Ждем рендера чтобы получить размеры
    requestAnimationFrame(() => {
      const ttW = el.offsetWidth;
      const ttH = el.offsetHeight;
      const gap = 12;

      let top, left;

      if (step.position === 'bottom') {
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (ttW / 2);
      } else if (step.position === 'top') {
        top = rect.top - ttH - gap;
        left = rect.left + (rect.width / 2) - (ttW / 2);
      }

      // 🔧 v1.17 FIX: Проверка границ экрана — горизонтальные И вертикальные
      const margin = 16;

      // Горизонтальные границы
      if (left < margin) left = margin;
      if (left + ttW > window.innerWidth - margin) {
        left = window.innerWidth - ttW - margin;
        // 🔧 v1.20 FIX: Если всё равно не влезает (на узких экранах), принудительно ограничиваем ширину
        if (left < margin) {
          left = margin;
          // Тут можно было бы менять ширину элемента, но он фиксированный в CSS.
          // Поэтому просто центрируем, пусть лучше влезает контент
        }
      }

      // 🔧 v1.17 FIX: Вертикальные границы (не давать тултипу уезжать за экран)
      // Добавлена логика для FAB кнопок (они внизу, тултип должен быть НАД ними)
      if (step.position === 'top' && top + ttH > rect.top) { // Если тултип перекрывает элемент (на узких экранах)
        top = rect.top - ttH - gap;
      }

      if (top < margin) {
        // Если уехал вверх — сдвигаем вниз от элемента
        top = rect.bottom + gap;
      }
      // Если уехал вниз за экран ИЛИ перекрыл нижний край (для safety)
      if (top + ttH > window.innerHeight - margin) {
        // Если уехал вниз — сдвигаем вверх от элемента
        top = rect.top - ttH - gap;
        // Если всё равно не влезает — прижимаем к верху (грубый фоллбек)
        if (top < margin) top = margin;
      }

      el.style.top = top + 'px';
      el.style.left = left + 'px';

      // 🔧 v1.21 FIX: Анимация появления только при смене шага (не при updatePosition)
      if (animate) {
        el.classList.remove('tour-tooltip-enter');
        void el.offsetWidth; // reflow
        el.classList.add('tour-tooltip-enter');
      }
    });
  }

  // === PUBLIC API ===

  const OnboardingTour = {

    /**
     * Запустить тур (с welcome modal)
     * @param {Object} options - { force: boolean, onComplete: func, skipWelcome: boolean }
     */
    async start(options = {}) {
      if (state.isActive) return;

      // Проверка: уже проходил?
      const isCompleted = getStoredFlag(STORAGE_KEY, false);

      if (isCompleted && !options.force) return;

      // Получаем имя пользователя для персонализации
      state.userName = getUserName();

      // Показать welcome modal если не пропущен
      if (!options.skipWelcome && !options.force) {
        const result = await showWelcomeModal();
        if (result === 'later') {
          trackTourEvent('onboarding_tour_deferred', { reason: 'user_later' });
          if (HEYS.analytics) {
            HEYS.analytics.trackEvent('tour_deferred');
          }
          return;
        }
      }

      trackTourEvent('onboarding_tour_starting', { hasUserName: !!state.userName });

      // FORCE SWITCH TO MAIN TAB before starting
      // This ensures elements like hero-stats are in the DOM
      if (HEYS.ui && HEYS.ui.switchTab) {
        // Check if we need to switch
        // We assume 'stats' is the tab where first steps are loccated.
        // Ideally we should check if the target element of the current step is visible.
        HEYS.ui.switchTab('stats');
      }

      // Temporarily suppress Morning Check-in using a global flag
      if (HEYS.ui) {
        HEYS.ui.suppressMorningCheckin = true;
        trackTourEvent('onboarding_checkin_suppressed', {});
      }

      // Wait for the target element of the first (or current) step to appear
      const initialStepIndex = getInterruptedStep() === null ? 0 : getInterruptedStep();
      const targetId = TOUR_STEPS[initialStepIndex]?.targetId;

      if (targetId) {
        trackTourEvent('onboarding_wait_for_element', { targetId });
        const waitForElement = (id, timeout = 2500) => {
          return new Promise(resolve => {
            const startTime = Date.now();
            const check = () => {
              const el = document.getElementById(id);
              if (el && el.offsetParent !== null) { // exists and visible (not display:none)
                trackTourEvent('onboarding_element_found', { targetId: id, ms: Date.now() - startTime });
                resolve(el);
              } else if (Date.now() - startTime > timeout) {
                trackTourEvent('onboarding_element_timeout', { targetId: id, ms: Date.now() - startTime });
                resolve(null);
              } else {
                requestAnimationFrame(check);
              }
            };
            check();
          });
        };
        await waitForElement(targetId);
        trackTourEvent('onboarding_wait_for_element_done', { targetId });
      } else {
        // Fallback just in case
        await new Promise(r => setTimeout(r, 500));
      }

      state.isActive = true;
      state.onComplete = options.onComplete;
      state.stepStartTime = Date.now(); // Для time_on_step

      // 🆕 Уведомляем виджеты о переходе в демо-режим (чтобы показать демо-данные)
      HEYS.Widgets?.emit?.('data:updated', {});

      // Восстановление прерванного шага если есть
      const interruptedStep = getInterruptedStep();
      if (interruptedStep !== null && !options.force) {
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

      const step = TOUR_STEPS[state.currentStepIndex];
      const targetEl = document.getElementById(step.targetId);

      trackTourEvent('onboarding_render_step', { targetId: step.targetId, found: !!targetEl });

      if (!targetEl) {
        trackTourEvent('onboarding_target_missing', { targetId: step.targetId });
        this.next();
        return;
      }

      // Функция отрисовки highlight и тултипа
      const updatePosition = () => {
        if (!state.isActive) return;
        const rect = targetEl.getBoundingClientRect();
        trackTourEvent('onboarding_update_position', { targetId: step.targetId });
        createHighlight(rect);
        // Передаём персонализированный текст
        const stepWithText = {
          ...step,
          text: step.getText ? step.getText(state.userName) : step.text
        };
        createTooltip(stepWithText, rect);
      };

      // Мгновенный скролл к элементу (без анимации — чтобы highlight сразу был в нужном месте)
      targetEl.scrollIntoView({ behavior: 'instant', block: 'center' });

      // Рисуем после того как браузер применил скролл (1 frame)
      requestAnimationFrame(() => {
        updatePosition();
        // Повторно обновляем через 100ms на случай lazy-рендера
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
          step_id: TOUR_STEPS[state.currentStepIndex]?.targetId,
          time_on_step_ms: timeOnStep
        });
      }

      triggerHaptic();

      if (state.currentStepIndex < TOUR_STEPS.length - 1) {
        state.currentStepIndex++;
        state.stepStartTime = Date.now(); // Сброс таймера для нового шага
        this.renderStep();
      } else {
        this.finish();
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

    finish() {
      if (!state.isActive) return;

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
          total_steps: TOUR_STEPS.length
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

    /**
     * Получить демо данные для конкретного компонента
     * @param {string} componentId - 'hero' | 'sparkline'
     * @returns {Object|null}
     */
    getDemoData(componentId) {
      if (!state.isActive) return null;
      return TOUR_DEMO_DATA[componentId] || null;
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
    }
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
    // Не показываем если основной тур ещё не пройден
    const mainTourCompleted = getStoredFlag(STORAGE_KEY, false);
    if (!mainTourCompleted) return false;

    // Не показываем если мини-тур уже пройден
    const insightsTourCompleted = getStoredFlag(INSIGHTS_STORAGE_KEY, false);
    if (insightsTourCompleted) return false;

    // Не показываем кураторам
    const isCurator = localStorage.getItem('heys_cloud_role') === 'curator' || HEYS.cloud?.isCurator?.();
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
    // Главный тур должен быть пройден
    const mainCompleted = getStoredFlag(STORAGE_KEY, false);
    if (!mainCompleted) return false;

    // Тур виджетов не пройден
    const widgetsCompleted = getStoredFlag(WIDGETS_STORAGE_KEY, false);
    if (widgetsCompleted) return false;

    // Для кураторов не показываем
    if (HEYS.user?.isCurator?.()) return false;

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
