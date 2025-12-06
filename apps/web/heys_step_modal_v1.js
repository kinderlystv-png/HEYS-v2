// heys_step_modal_v1.js — Модульная система модалок с шагами
// Позволяет комбинировать шаги: вес, сон, шаги, вода и др.
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useEffect, useCallback, useRef, useContext, createContext } = React;

  // === Контекст для передачи данных между шагами ===
  const StepModalContext = createContext({});

  // === Общие утилиты (переиспользуемые в steps/meal_step) ===
  
  // Обёртка для localStorage с поддержкой clientId namespace
  const U = () => HEYS.utils || {};
  
  function lsGet(key, def) {
    const utils = U();
    if (utils.lsGet) return utils.lsGet(key, def);
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  }
  
  function lsSet(key, val) {
    const utils = U();
    if (utils.lsSet) {
      utils.lsSet(key, val);
    } else {
      localStorage.setItem(key, JSON.stringify(val));
    }
  }

  function getTodayKey() {
    // Используем «эффективную» дату (до 03:00 считаем, что день ещё предыдущий)
    // Приоритет: dayUtils.todayISO → models.todayISO → fallback на ISO без смещения
    const dayUtils = HEYS.dayUtils || {};
    if (typeof dayUtils.todayISO === 'function') return dayUtils.todayISO();
    if (HEYS.models && typeof HEYS.models.todayISO === 'function') return HEYS.models.todayISO();
    return new Date().toISOString().slice(0, 10);
  }

  function getCurrentHour() {
    return new Date().getHours();
  }

  function getTimeBasedGreeting() {
    const hour = getCurrentHour();
    if (hour >= 5 && hour < 12) return 'Доброе утро! ☀️';
    if (hour >= 12 && hour < 17) return 'Добрый день! 🌤️';
    if (hour >= 17 && hour < 22) return 'Добрый вечер! 🌙';
    return 'Доброй ночи! 🌌';
  }

  function getDailyTip() {
    const tips = [
      '💡 Взвешивайтесь в одно время для точности',
      '🌊 Стакан воды утром запускает метаболизм',
      '🍳 Белок на завтрак = меньше голода днём',
      '🚶 10 минут прогулки после еды помогают пищеварению',
      '😴 Сон 7-8 часов = меньше тяги к сладкому',
      '🥗 Овощи в каждый приём пищи — простое правило',
      '⏰ Регулярное питание стабилизирует энергию',
      '💪 Каждый день — это новая возможность!',
      '🎯 Маленькие шаги ведут к большим результатам',
      '✨ Вы уже молодец, что следите за здоровьем!'
    ];
    const dayOfWeek = new Date().getDay();
    return tips[dayOfWeek % tips.length];
  }

  function getCurrentStreak() {
    try {
      if (HEYS.Day && typeof HEYS.Day.getStreak === 'function') {
        return HEYS.Day.getStreak();
      }
      const U = HEYS.utils || {};
      let streak = 0;
      const today = new Date();
      for (let i = 1; i <= 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
        if (dayData.meals && dayData.meals.length > 0) {
          streak++;
        } else {
          break;
        }
      }
      return streak;
    } catch (e) {
      return 0;
    }
  }

  // === WheelPicker (переиспользуемый) ===
  function WheelPicker({ values, value, onChange, label, suffix = '', currentSuffix = null }) {
    const containerRef = useRef(null);
    const currentIndex = values.indexOf(value);
    // currentSuffix — единицы для центрального значения (кг, ч), suffix — для остальных
    const displaySuffix = currentSuffix !== null ? currentSuffix : suffix;

    // Wheel scroll event (самый простой способ на десктопе)
    const handleWheel = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      const direction = e.deltaY > 0 ? 1 : -1;
      const newIndex = Math.max(0, Math.min(values.length - 1, currentIndex + direction));
      if (newIndex !== currentIndex) {
        onChange(values[newIndex]);
      }
    }, [values, currentIndex, onChange]);

    // Touch drag
    const touchState = useRef({ active: false, startY: 0, startIndex: 0 });
    
    const handleTouchStart = useCallback((e) => {
      touchState.current = {
        active: true,
        startY: e.touches[0].clientY,
        startIndex: currentIndex
      };
    }, [currentIndex]);

    const handleTouchMove = useCallback((e) => {
      if (!touchState.current.active) return;
      // Не вызываем preventDefault - это вызывает ошибку passive listener
      const deltaY = touchState.current.startY - e.touches[0].clientY;
      const steps = Math.round(deltaY / 30);
      const newIndex = Math.max(0, Math.min(values.length - 1, touchState.current.startIndex + steps));
      if (newIndex !== currentIndex) {
        onChange(values[newIndex]);
      }
    }, [values, currentIndex, onChange]);

    const handleTouchEnd = useCallback(() => {
      touchState.current.active = false;
    }, []);

    // Click на соседние значения
    const handleClickPrev = useCallback(() => {
      if (currentIndex > 0) onChange(values[currentIndex - 1]);
    }, [values, currentIndex, onChange]);

    const handleClickNext = useCallback(() => {
      if (currentIndex < values.length - 1) onChange(values[currentIndex + 1]);
    }, [values, currentIndex, onChange]);

    const handleClickPrev2 = useCallback(() => {
      if (currentIndex > 1) onChange(values[currentIndex - 2]);
    }, [values, currentIndex, onChange]);

    const handleClickNext2 = useCallback(() => {
      if (currentIndex < values.length - 2) onChange(values[currentIndex + 2]);
    }, [values, currentIndex, onChange]);

    const prev2Index = Math.max(0, currentIndex - 2);
    const prevIndex = Math.max(0, currentIndex - 1);
    const nextIndex = Math.min(values.length - 1, currentIndex + 1);
    const next2Index = Math.min(values.length - 1, currentIndex + 2);

    return React.createElement('div', {
      className: 'mc-wheel-picker',
      ref: containerRef,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onWheel: handleWheel
    },
      React.createElement('div', { className: 'mc-wheel-label' }, label),
      React.createElement('div', { className: 'mc-wheel-values' },
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--far',
          onClick: handleClickPrev2
        }, currentIndex > 1 ? values[prev2Index] + suffix : ''),
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--prev',
          onClick: handleClickPrev
        }, currentIndex > 0 ? values[prevIndex] + suffix : ''),
        React.createElement('div', { className: 'mc-wheel-value mc-wheel-value--current' },
          value,
          displaySuffix && React.createElement('span', { className: 'mc-wheel-suffix' }, displaySuffix)
        ),
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--next',
          onClick: handleClickNext
        }, currentIndex < values.length - 1 ? values[nextIndex] + suffix : ''),
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--far',
          onClick: handleClickNext2
        }, currentIndex < values.length - 2 ? values[next2Index] + suffix : '')
      )
    );
  }

  // === Реестр шагов ===
  const StepRegistry = {};

  /**
   * Регистрация нового шага
   * @param {string} id - уникальный идентификатор
   * @param {Object} config - конфигурация шага
   */
  function registerStep(id, config) {
    StepRegistry[id] = {
      id,
      title: config.title || id,
      hint: config.hint || '',
      icon: config.icon || '📋',
      component: config.component,
      getInitialData: config.getInitialData || (() => ({})),
      validate: config.validate || (() => true),
      save: config.save || (() => {}),
    };
  }

  // === StepModal — главный контейнер ===
  function StepModal({ 
    steps = [], 
    onComplete, 
    onClose,
    initialStep = 0,
    showProgress = true,
    showStreak = true,
    showGreeting = true,
    showTip = true,
    title = null,
    allowSwipe = true,
    allowSkip = false,
    context = {}, // Контекст для getInitialData (например, dateKey)
    hidePrimaryOnFirst = false
  }) {
    const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
    const [animating, setAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null);
    const [stepData, setStepData] = useState({});
    const [validationError, setValidationError] = useState(false); // Для shake-анимации
    const containerRef = useRef(null);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);

    // Получаем конфигурации шагов
    const stepConfigs = useMemo(() => {
      return steps.map(stepId => {
        if (typeof stepId === 'string') {
          return StepRegistry[stepId];
        }
        // Inline step config
        return stepId;
      }).filter(Boolean);
    }, [steps]);

    const totalSteps = stepConfigs.length;
    const currentConfig = stepConfigs[currentStepIndex];

    // Мемоизированные данные
    const greeting = useMemo(() => getTimeBasedGreeting(), []);
    const dailyTip = useMemo(() => getDailyTip(), []);
    const currentStreak = useMemo(() => getCurrentStreak(), []);

    // Инициализация данных шагов (только при первом рендере)
    const initializedRef = useRef(false);
    useEffect(() => {
      if (initializedRef.current) return; // Уже инициализировано
      initializedRef.current = true;
      
      const initialData = {};
      stepConfigs.forEach(config => {
        if (config.getInitialData) {
          initialData[config.id] = config.getInitialData(context);
        }
      });
      setStepData(initialData);
    }, []);

    // Обновление данных шага
    const updateStepData = useCallback((stepId, data) => {
      setStepData(prev => ({
        ...prev,
        [stepId]: data // Полностью заменяем данные шага (компонент передаёт полный объект)
      }));
    }, []);

    // Навигация
    const goToStep = useCallback((newIndex, direction) => {
      if (animating || newIndex < 0 || newIndex >= totalSteps) return;
      
      setSlideDirection(direction);
      setAnimating(true);
      
      setTimeout(() => {
        setCurrentStepIndex(newIndex);
        setSlideDirection(null);
        setAnimating(false);
      }, 200);
    }, [animating, totalSteps]);

    const handleNext = useCallback(() => {
      // Валидация текущего шага
      if (currentConfig.validate && !currentConfig.validate(stepData[currentConfig.id], stepData)) {
        // Показываем shake-анимацию при ошибке
        setValidationError(true);
        // Haptic feedback при ошибке
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        setTimeout(() => setValidationError(false), 500);
        return;
      }

      if (currentStepIndex < totalSteps - 1) {
        goToStep(currentStepIndex + 1, 'left');
      } else {
        // Сохраняем все данные
        stepConfigs.forEach(config => {
          if (config.save) {
            config.save(stepData[config.id]);
          }
        });
        
        // XP за чек-ин
        if (HEYS.gamification) {
          try {
            stepConfigs.forEach(config => {
              if (config.xpAction) {
                HEYS.gamification.addXP(config.xpAction);
              }
            });
          } catch (e) {
            console.warn('Gamification XP error:', e);
          }
        }

        // Уведомляем об обновлении (только если это НЕ MealStep — он обрабатывает сам)
        // MealStep сам управляет обновлением дня через onComplete
        if (!stepConfigs.some(c => c.id === 'mealName' || c.id === 'mealTime')) {
          window.dispatchEvent(new CustomEvent('heys:day-updated', { 
            detail: { date: getTodayKey(), source: 'step-modal' } 
          }));
        }
        
        onComplete && onComplete(stepData);
      }
    }, [currentStepIndex, totalSteps, currentConfig, stepData, stepConfigs, goToStep, onComplete]);

    const handlePrev = useCallback(() => {
      if (currentStepIndex > 0) {
        goToStep(currentStepIndex - 1, 'right');
      }
    }, [currentStepIndex, goToStep]);

    // Swipe handlers — учитываем allowSwipe из конфига шага
    const stepAllowSwipe = currentConfig?.allowSwipe !== false && allowSwipe;
    
    const handleTouchStart = useCallback((e) => {
      if (!stepAllowSwipe) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }, [stepAllowSwipe, currentConfig]);

    // Блокируем scroll на backdrop, разрешаем только внутри scrollable контейнеров
    // Используем useEffect для регистрации с { passive: false }, иначе preventDefault() не работает
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      
      const handleTouchMove = (e) => {
        // Находим ближайший scrollable элемент
        let target = e.target;
        while (target && target !== container) {
          const style = window.getComputedStyle(target);
          const overflowY = style.overflowY;
          const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
          
          if (isScrollable && target.scrollHeight > target.clientHeight) {
            // Это scrollable контейнер — разрешаем scroll
            return;
          }
          target = target.parentElement;
        }
        
        // Не внутри scrollable — блокируем scroll на backdrop
        e.preventDefault();
      };
      
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      return () => container.removeEventListener('touchmove', handleTouchMove);
    }, []);

    const handleTouchEnd = useCallback((e) => {
      if (!stepAllowSwipe) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX < 0 && currentStepIndex < totalSteps - 1) {
          goToStep(currentStepIndex + 1, 'left');
        } else if (deltaX > 0 && currentStepIndex > 0) {
          goToStep(currentStepIndex - 1, 'right');
        }
      }
    }, [stepAllowSwipe, currentStepIndex, totalSteps, goToStep, currentConfig]);

    // Закрытие
    const handleClose = useCallback(() => {
      onClose && onClose();
    }, [onClose]);

    // Контекст для шагов
    const contextValue = useMemo(() => ({
      stepData,
      updateStepData,
      currentStepIndex,
      totalSteps,
      goToStep
    }), [stepData, updateStepData, currentStepIndex, totalSteps, goToStep]);

    if (!currentConfig) {
      return null;
    }

    const slideClass = slideDirection === 'left' ? 'mc-slide-left' : 
                       slideDirection === 'right' ? 'mc-slide-right' : '';

    const StepComponent = currentConfig.component;

    // Закрытие по клику на backdrop (вне модалки)
    const handleBackdropClick = useCallback((e) => {
      if (e.target.classList.contains('mc-backdrop') && onClose) {
        onClose();
      }
    }, [onClose]);

    return React.createElement(StepModalContext.Provider, { value: contextValue },
      React.createElement('div', { 
        className: 'mc-backdrop',
        ref: containerRef,
        onClick: handleBackdropClick,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd
      },
        React.createElement('div', { className: 'mc-modal' },
          // Header
          React.createElement('div', { className: 'mc-header' },
            showGreeting && (title || greeting) && React.createElement('div', { className: 'mc-greeting' }, 
              title || greeting
            ),
            
            showStreak && currentStreak > 0 && React.createElement('div', { className: 'mc-streak-badge' },
              React.createElement('span', { className: 'mc-streak-fire' }, '🔥'),
              React.createElement('span', { className: 'mc-streak-count' }, currentStreak),
              React.createElement('span', { className: 'mc-streak-text' }, ' дн')
            ),

            onClose && React.createElement('button', {
              className: 'mc-close-btn',
              onClick: handleClose,
              'aria-label': 'Закрыть'
            }, '×')
          ),

          // Progress dots (кружочки) — кликабельные для навигации
          // Скрытые шаги (hidden: true) не отображаются в progress
          showProgress && totalSteps > 1 && React.createElement('div', { className: 'mc-progress-dots' },
            stepConfigs.map((config, i) => 
              // Пропускаем скрытые шаги
              config.hidden ? null : React.createElement('button', { 
                key: i,
                className: 'mc-progress-dot' + (i === currentStepIndex ? ' active' : '') + (i < currentStepIndex ? ' completed' : ''),
                onClick: () => {
                  if (i !== currentStepIndex) {
                    goToStep(i, i > currentStepIndex ? 'left' : 'right');
                  }
                },
                'aria-label': `Шаг ${i + 1}`
              })
            )
          ),

          // Step title (скрываем если title пустой)
          (currentConfig.title || currentConfig.hint) && React.createElement('div', { className: 'mc-step-header' },
            currentConfig.title && React.createElement('h2', { className: 'mc-step-title' }, 
              `${currentConfig.icon || ''} ${currentConfig.title}`.trim()
            ),
            currentConfig.hint && React.createElement('p', { className: 'mc-step-hint' }, 
              currentConfig.hint
            )
          ),

          // Step content
          React.createElement('div', { 
            className: `mc-step-content ${slideClass}${validationError ? ' mc-validation-error' : ''}` 
          },
            StepComponent && React.createElement(StepComponent, {
              data: stepData[currentConfig.id] || {},
              onChange: (data) => updateStepData(currentConfig.id, data),
              stepData: stepData,
              context: context
            })
          ),

          // Buttons
          React.createElement('div', { className: 'mc-buttons' },
            currentStepIndex > 0 && React.createElement('button', {
              className: 'mc-btn mc-btn--secondary',
              onClick: handlePrev
            }, '← Назад'),

            allowSkip && currentStepIndex < totalSteps - 1 && React.createElement('button', {
              className: 'mc-btn mc-btn--ghost',
              onClick: () => goToStep(currentStepIndex + 1, 'left')
            }, 'Пропустить'),

            !(hidePrimaryOnFirst && currentStepIndex === 0) && React.createElement('button', {
              className: 'mc-btn mc-btn--primary',
              onClick: handleNext
            }, currentStepIndex === totalSteps - 1 ? '✓ Готово' : 'Далее →')
          ),

          // Daily tip
          showTip && React.createElement('div', { className: 'mc-tip' }, dailyTip)
        )
      )
    );
  }

  // === API для показа модалки ===
  let modalRoot = null;
  let currentModalElement = null;

  function showStepModal(options) {
    // Создаём контейнер если нет
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'heys-step-modal-root';
      document.body.appendChild(modalRoot);
    }

    // 🔒 Блокируем прокрутку body при открытии модалки
    document.body.style.overflow = 'hidden';
    // Для iOS Safari — фиксируем позицию
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${window.scrollY}px`;

    const handleComplete = (data) => {
      hideStepModal();
      options.onComplete && options.onComplete(data);
    };

    const handleClose = () => {
      hideStepModal();
      options.onClose && options.onClose();
    };

    currentModalElement = React.createElement(StepModal, {
      ...options,
      onComplete: handleComplete,
      onClose: handleClose
    });

    ReactDOM.render(currentModalElement, modalRoot);
  }

  function hideStepModal() {
    // 🔓 Восстанавливаем прокрутку body при закрытии
    const scrollY = document.body.style.top;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    // Возвращаем скролл на место
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    
    if (modalRoot) {
      ReactDOM.unmountComponentAtNode(modalRoot);
    }
  }

  // === Экспорт ===
  HEYS.StepModal = {
    show: showStepModal,
    hide: hideStepModal,
    Component: StepModal,
    registerStep,
    registry: StepRegistry,
    WheelPicker,
    Context: StepModalContext,
    utils: {
      lsGet,
      lsSet,
      getTodayKey,
      getCurrentHour,
      getTimeBasedGreeting,
      getDailyTip,
      getCurrentStreak
    }
  };

})(typeof window !== 'undefined' ? window : global);
