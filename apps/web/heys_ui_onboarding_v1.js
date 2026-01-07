// heys_ui_onboarding_v1.js — Модуль интерактивного тура для новых пользователей
// Показывает spotlight на ключевых элементах и объясняет их функцию
// Использует z-index 9000-9500 (выше контента, ниже системных модалок)
// v1.1: Welcome modal, tour_step analytics, haptic feedback, visibilitychange, pulse animation

(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === CONFIGURATION ===
  
  const TOUR_ID = 'onboarding_tour_v1';
  const STORAGE_KEY = 'heys_tour_completed';
  const HAPTIC_ENABLED = true; // navigator.vibrate на переходах
  const HAPTIC_PATTERN = [15]; // Короткая вибрация 15ms
  
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
    {
      id: 'step_insights',
      targetId: 'tour-insights-tab',
      title: 'Умные Инсайты',
      getText: () => 'Загляните сюда! Анализ метаболизма, прогнозы веса и советы.',
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
  
  function handleVisibilityChange() {
    if (document.hidden && state.isActive) {
      state.wasHidden = true;
      // Сохраняем текущий шаг для восстановления при прерывании
      try {
        localStorage.setItem(INTERRUPTED_STEP_KEY, String(state.currentStepIndex));
        console.log('[Onboarding] Page hidden, saved step:', state.currentStepIndex);
      } catch (e) {
        console.warn('[Onboarding] Could not save interrupted step:', e);
      }
    } else if (!document.hidden && state.wasHidden && state.isActive) {
      state.wasHidden = false;
      console.log('[Onboarding] Page visible, restoring tour state');
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
      console.warn('[Onboarding] Could not read interrupted step:', e);
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
      console.warn('[Onboarding] Could not get user name:', e);
    }
    return null;
  }

  // === RENDER HELPERS ===

  function createOverlay() {
    if (state.overlayEl) return state.overlayEl;
    
    const el = document.createElement('div');
    el.className = 'tour-overlay';
    // Стили будут в CSS, но базовые для надежности
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.zIndex = '9000';
    el.style.background = 'rgba(0, 0, 0, 0.7)'; // Fallback
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s ease';
    
    // Клик по оверлею блокируется, но можно сделать пропуск?
    // Лучше блокировать взаимодействие с контентом кроме highlight
    
    document.body.appendChild(el);
    
    // Force reflow
    el.getBoundingClientRect();
    el.style.opacity = '1';
    
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
      el.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.75)'; // Spotlight эффект
      el.style.borderRadius = '12px';
      el.style.pointerEvents = 'none'; // Пропускать клики если нужно (но обычно мы не даем жать)
      el.style.transition = 'all 0.3s ease';
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
    if (!el) {
      el = document.createElement('div');
      el.className = 'tour-tooltip';
      el.style.position = 'fixed';
      el.style.zIndex = '9002';
      document.body.appendChild(el);
      state.tooltipEl = el;
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
      </div>
      <div class="tour-arrow tour-arrow-${step.arrow}"></div>
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
      
      // Проверка границ экрана
      const margin = 16;
      if (left < margin) left = margin;
      if (left + ttW > window.innerWidth - margin) left = window.innerWidth - ttW - margin;
      
      el.style.top = top + 'px';
      el.style.left = left + 'px';
      
      // Анимация появления
      el.classList.remove('tour-tooltip-enter');
      void el.offsetWidth; // reflow
      el.classList.add('tour-tooltip-enter');
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
      const isCompleted = HEYS.store && HEYS.store.get ? 
        HEYS.store.get(STORAGE_KEY, false) : 
        localStorage.getItem(STORAGE_KEY) === 'true';
        
      if (isCompleted && !options.force) return;
      
      // Получаем имя пользователя для персонализации
      state.userName = getUserName();
      
      // Показать welcome modal если не пропущен
      if (!options.skipWelcome && !options.force) {
        const result = await showWelcomeModal();
        if (result === 'later') {
          console.log('[Onboarding] User chose to defer tour');
          if (HEYS.analytics) {
            HEYS.analytics.trackEvent('tour_deferred');
          }
          return;
        }
      }
      
      console.log('[Onboarding] Starting tour...', state.userName ? `for ${state.userName}` : '');
      
      state.isActive = true;
      state.onComplete = options.onComplete;
      state.stepStartTime = Date.now(); // Для time_on_step
      
      // Восстановление прерванного шага если есть
      const interruptedStep = getInterruptedStep();
      if (interruptedStep !== null && !options.force) {
        state.currentStepIndex = interruptedStep;
        console.log('[Onboarding] Resuming from interrupted step:', interruptedStep);
      } else {
        state.currentStepIndex = 0;
      }
      
      // Подписываемся на visibility change
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
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
      
      if (!targetEl) {
        console.warn(`[Onboarding] Target not found: ${step.targetId}, skipping step`);
        this.next();
        return;
      }
      
      // Скролл к элементу
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Ждем скролла
      setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        createHighlight(rect);
        // Передаём персонализированный текст
        const stepWithText = {
          ...step,
          text: step.getText ? step.getText(state.userName) : step.text
        };
        createTooltip(stepWithText, rect);
      }, 400); // 400ms delay for scroll
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
      
      console.log('[Onboarding] Tour finished');
      
      // Отписываемся от visibility change
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
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
      console.log('[Onboarding] Tour state reset');
    }
  };

  HEYS.OnboardingTour = OnboardingTour;

})(window);
