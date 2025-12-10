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

  // === AutoFitText — автоматическое уменьшение шрифта при переполнении ===
  function AutoFitText({ text, className, minFontSize = 10, maxFontSize = 16, style = {} }) {
    const containerRef = useRef(null);
    const textRef = useRef(null);
    const [fontSize, setFontSize] = useState(maxFontSize);
    
    useEffect(() => {
      const container = containerRef.current;
      const textEl = textRef.current;
      if (!container || !textEl) return;
      
      // Начинаем с максимального размера
      let currentSize = maxFontSize;
      textEl.style.fontSize = `${currentSize}px`;
      
      // Уменьшаем пока текст не влезет в контейнер
      const containerWidth = container.offsetWidth;
      while (textEl.offsetWidth > containerWidth && currentSize > minFontSize) {
        currentSize -= 0.5;
        textEl.style.fontSize = `${currentSize}px`;
      }
      
      setFontSize(currentSize);
    }, [text, maxFontSize, minFontSize]);
    
    return React.createElement('div', {
      ref: containerRef,
      className: className + '-container',
      style: { 
        width: '100%', 
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center'
      }
    }, 
      React.createElement('span', {
        ref: textRef,
        className,
        style: { 
          ...style, 
          fontSize: `${fontSize}px`,
          whiteSpace: 'nowrap'
        }
      }, text)
    );
  }

  // === WheelPicker (переиспользуемый) ===
  function WheelPicker({ values, value, onChange, label, suffix = '', currentSuffix = null, formatValue = null, wrap = false, height = null, compact = false }) {
    const containerRef = useRef(null);
    const currentIndex = values.indexOf(value);
    const len = values.length;
    // currentSuffix — единицы для центрального значения (кг, ч), suffix — для остальных
    const displaySuffix = currentSuffix !== null ? currentSuffix : suffix;
    // formatValue — функция форматирования (например, для ведущего нуля)
    const fmt = formatValue || ((v) => v);
    
    // Компактный режим (3 значения вместо 5)
    const showFar = !compact && !height;
    
    // Циклический индекс
    const wrapIndex = (i) => ((i % len) + len) % len;

    // Wheel scroll event (самый простой способ на десктопе)
    // Примечание: не используем preventDefault — React использует passive listeners
    const handleWheel = useCallback((e) => {
      const direction = e.deltaY > 0 ? 1 : -1;
      let newIndex;
      if (wrap) {
        newIndex = wrapIndex(currentIndex + direction);
      } else {
        newIndex = Math.max(0, Math.min(len - 1, currentIndex + direction));
      }
      if (newIndex !== currentIndex) {
        onChange(values[newIndex]);
      }
    }, [values, currentIndex, onChange, wrap, len]);

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
      let newIndex;
      if (wrap) {
        newIndex = wrapIndex(touchState.current.startIndex + steps);
      } else {
        newIndex = Math.max(0, Math.min(len - 1, touchState.current.startIndex + steps));
      }
      if (newIndex !== currentIndex) {
        onChange(values[newIndex]);
      }
    }, [values, currentIndex, onChange, wrap, len]);

    const handleTouchEnd = useCallback(() => {
      touchState.current.active = false;
    }, []);

    // Click на соседние значения (с циклом)
    const handleClickPrev = useCallback(() => {
      const newIndex = wrap ? wrapIndex(currentIndex - 1) : Math.max(0, currentIndex - 1);
      if (newIndex !== currentIndex) onChange(values[newIndex]);
    }, [values, currentIndex, onChange, wrap]);

    const handleClickNext = useCallback(() => {
      const newIndex = wrap ? wrapIndex(currentIndex + 1) : Math.min(len - 1, currentIndex + 1);
      if (newIndex !== currentIndex) onChange(values[newIndex]);
    }, [values, currentIndex, onChange, wrap, len]);

    const handleClickPrev2 = useCallback(() => {
      const newIndex = wrap ? wrapIndex(currentIndex - 2) : Math.max(0, currentIndex - 2);
      if (newIndex !== currentIndex) onChange(values[newIndex]);
    }, [values, currentIndex, onChange, wrap]);

    const handleClickNext2 = useCallback(() => {
      const newIndex = wrap ? wrapIndex(currentIndex + 2) : Math.min(len - 1, currentIndex + 2);
      if (newIndex !== currentIndex) onChange(values[newIndex]);
    }, [values, currentIndex, onChange, wrap, len]);

    // Индексы для отображения (с циклом)
    const prev2Index = wrap ? wrapIndex(currentIndex - 2) : Math.max(0, currentIndex - 2);
    const prevIndex = wrap ? wrapIndex(currentIndex - 1) : Math.max(0, currentIndex - 1);
    const nextIndex = wrap ? wrapIndex(currentIndex + 1) : Math.min(len - 1, currentIndex + 1);
    const next2Index = wrap ? wrapIndex(currentIndex + 2) : Math.min(len - 1, currentIndex + 2);
    
    // Показывать ли соседние значения (для не-циклического режима скрываем края)
    const showPrev2 = (wrap || currentIndex > 1) && showFar;
    const showPrev = wrap || currentIndex > 0;
    const showNext = wrap || currentIndex < len - 1;
    const showNext2 = (wrap || currentIndex < len - 2) && showFar;

    // Стиль для компактного режима
    const containerStyle = height ? { height: `${height}px` } : {};
    const compactClass = (compact || height) ? 'mc-wheel-picker--compact' : '';

    return React.createElement('div', {
      className: `mc-wheel-picker ${compactClass}`.trim(),
      ref: containerRef,
      style: containerStyle,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onWheel: handleWheel
    },
      React.createElement('div', { className: 'mc-wheel-label' }, label),
      React.createElement('div', { className: 'mc-wheel-values' },
        // Far prev (только если не compact)
        showFar && React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--far',
          onClick: handleClickPrev2
        }, showPrev2 ? fmt(values[prev2Index]) + suffix : ''),
        // Prev
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--prev',
          onClick: handleClickPrev
        }, showPrev ? fmt(values[prevIndex]) + suffix : ''),
        // Current
        React.createElement('div', { className: 'mc-wheel-value mc-wheel-value--current' },
          fmt(value),
          displaySuffix && React.createElement('span', { className: 'mc-wheel-suffix' }, displaySuffix)
        ),
        // Next
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--next',
          onClick: handleClickNext
        }, showNext ? fmt(values[nextIndex]) + suffix : ''),
        // Far next (только если не compact)
        showFar && React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--far',
          onClick: handleClickNext2
        }, showNext2 ? fmt(values[next2Index]) + suffix : '')
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
      canSkip: config.canSkip || false,
      nextLabel: config.nextLabel || null,  // Кастомный текст кнопки "Далее"/"Готово"
      hideHeaderNext: config.hideHeaderNext || false,  // Скрыть кнопку в хедере
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
    hidePrimaryOnFirst = false,
    finishLabel = 'Готово' // Текст кнопки на последнем шаге (по умолчанию "Готово")
  }) {
    const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
    const [animating, setAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null);
    const [stepData, setStepData] = useState({});
    const [validationError, setValidationError] = useState(false);
    const [validationMessage, setValidationMessage] = useState(null);
    const [slideInDirection, setSlideInDirection] = useState(null); // Для shake-анимации
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

    // Инициализация данных шагов (при изменении context)
    const contextKey = useMemo(() => JSON.stringify(context), [context]);
    const lastContextKeyRef = useRef(null);
    
    useEffect(() => {
      // Пропускаем если context не изменился
      if (lastContextKeyRef.current === contextKey) return;
      lastContextKeyRef.current = contextKey;
      
      const initialData = {};
      stepConfigs.forEach(config => {
        if (config.getInitialData) {
          // Передаём context и уже собранные данные других шагов
          initialData[config.id] = config.getInitialData(context, initialData);
        }
      });
      setStepData(initialData);
    }, [contextKey, stepConfigs]);

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
        // Запускаем slide-in анимацию для нового шага
        setSlideInDirection(direction === 'left' ? 'from-right' : 'from-left');
        setAnimating(false);
        // Сбрасываем slide-in после анимации
        setTimeout(() => setSlideInDirection(null), 250);
      }, 200);
    }, [animating, totalSteps]);

    const handleNext = useCallback(() => {
      // Валидация текущего шага
      if (currentConfig.validate && !currentConfig.validate(stepData[currentConfig.id], stepData)) {
        // Получаем сообщение об ошибке если есть
        const errorMsg = currentConfig.getValidationMessage 
          ? currentConfig.getValidationMessage(stepData[currentConfig.id], stepData)
          : null;
        setValidationMessage(errorMsg);
        // Показываем shake-анимацию при ошибке
        setValidationError(true);
        // Haptic feedback при ошибке
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        setTimeout(() => {
          setValidationError(false);
          setValidationMessage(null);
        }, 2500);
        return;
      }

      if (currentStepIndex < totalSteps - 1) {
        goToStep(currentStepIndex + 1, 'left');
      } else {
        // Сохраняем все данные
        stepConfigs.forEach(config => {
          if (config.save) {
            // Передаём: данные этого шага, context, и все данные всех шагов
            config.save(stepData[config.id], context, stepData);
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
        // Пропускаем скрытые шаги при навигации назад
        let prevIndex = currentStepIndex - 1;
        while (prevIndex > 0 && stepConfigs[prevIndex]?.hidden) {
          prevIndex--;
        }
        goToStep(prevIndex, 'right');
      }
    }, [currentStepIndex, goToStep, stepConfigs]);

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
        // Разрешаем touch на range inputs (слайдерах)
        if (e.target.tagName === 'INPUT' && e.target.type === 'range') {
          return;
        }
        
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
                       slideDirection === 'right' ? 'mc-slide-right' : 
                       slideInDirection === 'from-right' ? 'mc-slide-in-right' :
                       slideInDirection === 'from-left' ? 'mc-slide-in-left' : '';

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
          // Header — iOS-style с кнопками слева/справа
          React.createElement('div', { className: 'mc-header mc-header--nav' },
            // Левая часть: Назад или Закрыть
            React.createElement('div', { className: 'mc-header-left' },
              currentStepIndex > 0 
                ? React.createElement('button', {
                    className: 'mc-header-btn mc-header-btn--back',
                    onClick: handlePrev
                  }, '← Назад')
                : onClose && React.createElement('button', {
                    className: 'mc-header-btn mc-header-btn--close',
                    onClick: handleClose,
                    'aria-label': 'Закрыть'
                  }, '×')
            ),
            
            // Центр: Title или счётчик продуктов
            React.createElement('div', { className: 'mc-header-center' },
              context.headerExtra 
                ? context.headerExtra
                : (currentConfig.title || currentConfig.hint) && React.createElement('div', { className: 'mc-header-titles' },
                    currentConfig.title && React.createElement(AutoFitText, { 
                      className: 'mc-header-title',
                      text: `${currentConfig.icon || ''} ${currentConfig.title}`.trim(),
                      maxFontSize: 16,
                      minFontSize: 11
                    }),
                    currentConfig.hint && React.createElement(AutoFitText, { 
                      className: 'mc-header-hint',
                      text: currentConfig.hint,
                      maxFontSize: 12,
                      minFontSize: 9
                    })
                  )
            ),
            
            // Правая часть: headerRight ИЛИ кнопка Готово/Далее
            // headerRight — кастомный контент справа (например счётчик продуктов)
            // finishLabel — кастомный текст для последнего шага (например "Добавить")
            // currentConfig.nextLabel — кастомный текст для конкретного шага
            React.createElement('div', { className: 'mc-header-right' },
              context.headerRight 
                ? React.createElement('span', { className: 'mc-header-right-text' }, context.headerRight)
                : (!(hidePrimaryOnFirst && currentStepIndex === 0) && !currentConfig.hideHeaderNext && React.createElement('button', {
                    className: 'mc-header-btn mc-header-btn--primary',
                    onClick: handleNext
                  }, currentStepIndex === totalSteps - 1 
                    ? (currentConfig.nextLabel || finishLabel) 
                    : (currentConfig.nextLabel || 'Далее')))
            )
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

          // Step content
          React.createElement('div', { 
            className: `mc-step-content ${slideClass}${validationError ? ' mc-validation-error' : ''}` 
          },
            StepComponent && React.createElement(StepComponent, {
              data: stepData[currentConfig.id] || {},
              onChange: (data) => updateStepData(currentConfig.id, data),
              stepData: stepData,
              context: { ...context, onNext: handleNext }  // Передаём onNext для кастомных кнопок
            })
          ),

          // Validation message
          validationMessage && React.createElement('div', { className: 'mc-validation-message' },
            React.createElement('span', { className: 'mc-validation-icon' }, '⚠️'),
            React.createElement('span', null, validationMessage)
          ),

          // Skip button (если разрешён пропуск) — оставляем внизу
          allowSkip && currentStepIndex < totalSteps - 1 && React.createElement('div', { className: 'mc-buttons mc-buttons--skip-only' },
            React.createElement('button', {
              className: 'mc-btn mc-btn--ghost',
              onClick: () => goToStep(currentStepIndex + 1, 'left')
            }, 'Пропустить')
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
  let savedScrollY = 0; // Сохраняем позицию скролла

  function showStepModal(options) {
    // Создаём контейнер если нет
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'heys-step-modal-root';
      document.body.appendChild(modalRoot);
    }

    // Сохраняем текущую позицию скролла
    savedScrollY = window.scrollY;
    
    // 🔒 Блокируем прокрутку body при открытии модалки (без position:fixed чтобы не прыгал фон)
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleComplete = (data) => {
      // Для приёмов пищи и продуктов — прокрутка к дневнику
      hideStepModal({ scrollToDiary: options.scrollToDiary !== false });
      options.onComplete && options.onComplete(data);
    };

    const handleClose = () => {
      // При закрытии без сохранения тоже прокручиваем к дневнику
      hideStepModal({ scrollToDiary: options.scrollToDiary !== false });
      options.onClose && options.onClose();
    };

    currentModalElement = React.createElement(StepModal, {
      ...options,
      onComplete: handleComplete,
      onClose: handleClose
    });

    ReactDOM.render(currentModalElement, modalRoot);
  }

  function hideStepModal(options = {}) {
    // 🔓 Восстанавливаем прокрутку body при закрытии
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    
    // Если указано scrollToDiary — моментально прокручиваем к заголовку дневника
    if (options.scrollToDiary) {
      requestAnimationFrame(() => {
        const heading = document.getElementById('diary-heading');
        if (heading) {
          heading.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      });
    }
    // Иначе скролл остаётся на месте (не нужно восстанавливать, т.к. мы не меняли position)
    
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
