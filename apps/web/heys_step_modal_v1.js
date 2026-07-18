// heys_step_modal_v1.js — Модульная система модалок с шагами
// Позволяет комбинировать шаги: вес, сон, шаги, вода и др.
(function (global) {
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

  // 🛡️ iOS-fix (2026-05-18): unified whitelist для touch handlers.
  // На iOS Safari preventDefault() в touchmove между touchstart и touchend на
  // элементе может ОТМЕНИТЬ click event (особенно если палец слегка двигается
  // при тапе — это часто бывает на сенсорных экранах). Раньше whitelist в
  // touchmove handler был узкий: только слайдеры/wheel-picker/mood-card.
  // Кнопки "Далее", preset-кнопки, progress-dots не были покрыты — их клики
  // могли терятся, отсюда жалобы "много раз надо нажать Далее".
  // Покрываем все интерактивные элементы — общий helper, чтобы все три
  // handler'а (touchstart/touchmove/touchend) были согласованы.
  function isInteractiveTouchTarget(target) {
    if (!target || !target.closest) return false;
    // Native interactives: button, input, a, label, textarea, select, summary.
    if (target.closest('button, input, a[href], label, textarea, select, summary')) return true;
    // App-specific scrollable / draggable widgets.
    if (target.closest('.mc-quality-slider, .mood-rating-card, .mc-wheel-picker, .mc-progress-dot, .mc-header-btn')) return true;
    // role="button" / contenteditable areas.
    if (target.closest('[role="button"], [contenteditable="true"]')) return true;
    return false;
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
      const utils = HEYS.utils || {};
      if (typeof utils.safeGetStreak === 'function') {
        return utils.safeGetStreak();
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
  function WheelPicker({ values, value, onChange, label, suffix = '', currentSuffix = null, formatValue = null, wrap = true, height = null, compact = false }) {
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

  // === TimePicker — переиспользуемый компонент выбора времени ===
  /**
   * Унифицированный пикер времени (часы:минуты)
   * @param {Object} props
   * @param {number} props.hours - Значение часов (0-23)
   * @param {number} props.minutes - Значение минут (0-55, шаг 5)
   * @param {function} props.onHoursChange - Callback при изменении часов
   * @param {function} props.onMinutesChange - Callback при изменении минут
   * @param {string} [props.hoursLabel='ЧАСЫ'] - Подпись над часами
   * @param {string} [props.minutesLabel='МИНУТЫ'] - Подпись над минутами
   * @param {boolean} [props.wrap=true] - Циклическая прокрутка
   * @param {boolean} [props.compact=false] - Компактный режим (3 значения)
   * @param {string} [props.className=''] - Дополнительный класс контейнера
   * @param {number[]} [props.hoursValues] - Кастомный массив часов
   * @param {number[]} [props.minutesValues] - Кастомный массив минут
   * @param {string} [props.display] - Формат отображения времени сверху ('HH:MM' или null)
   */
  const DEFAULT_HOURS = Array.from({ length: 24 }, (_, i) => i);
  const DEFAULT_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const pad2 = (v) => String(v).padStart(2, '0');

  function TimePicker({
    hours,
    minutes,
    onHoursChange,
    onMinutesChange,
    onTimeChange, // 🆕 Единый callback для linkedScroll: (newHours, newMinutes) => void
    hoursLabel = 'ЧАСЫ',
    minutesLabel = 'МИНУТЫ',
    wrap = true,
    compact = false,
    className = '',
    hoursValues = DEFAULT_HOURS,
    minutesValues = DEFAULT_MINUTES,
    display = 'HH:MM',
    linkedScroll = true, // При переходе минут через границу менять час
    haptic = true // Включить haptic feedback
  }) {
    // Haptic feedback helper
    const triggerHaptic = React.useCallback((intensity = 5) => {
      if (!haptic) return;
      if (navigator.vibrate) navigator.vibrate(intensity);
    }, [haptic]);

    // Ref для отслеживания предыдущих минут — НЕ синхронизируем при каждом рендере!
    // Обновляется ТОЛЬКО в handleMinutesChange после использования
    const prevMinutesRef = useRef(minutes);

    // Обработчик изменения часов с haptic
    const handleHoursChange = React.useCallback((newHours) => {
      triggerHaptic(5);
      onHoursChange(newHours);
    }, [onHoursChange, triggerHaptic]);

    // Обработчик изменения минут с учётом overflow на час
    const handleMinutesChange = React.useCallback((newMinutes) => {
      const prevMin = prevMinutesRef.current;

      // Если linkedScroll включён и wrap=true — проверяем переход через границу
      if (linkedScroll && wrap) {
        const maxMinute = minutesValues[minutesValues.length - 1]; // 55
        const minMinute = minutesValues[0]; // 0

        // 55 → 0: прокрутка вперёд через границу → час +1
        if (prevMin === maxMinute && newMinutes === minMinute) {
          const currentHourIndex = hoursValues.indexOf(hours);
          const newHourIndex = (currentHourIndex + 1) % hoursValues.length;
          const newHour = hoursValues[newHourIndex];

          // Обновляем ref ПЕРЕД вызовом callback
          prevMinutesRef.current = newMinutes;
          triggerHaptic(10); // Усиленный haptic при переходе часа

          // Если есть onTimeChange — вызываем его (один вызов = нет batching проблемы)
          if (onTimeChange) {
            onTimeChange(newHour, newMinutes);
            return;
          }
          // Fallback: раздельные callbacks
          onHoursChange(newHour);
          onMinutesChange(newMinutes);
          return;
        }
        // 0 → 55: прокрутка назад через границу → час -1
        else if (prevMin === minMinute && newMinutes === maxMinute) {
          const currentHourIndex = hoursValues.indexOf(hours);
          const newHourIndex = (currentHourIndex - 1 + hoursValues.length) % hoursValues.length;
          const newHour = hoursValues[newHourIndex];

          // Обновляем ref ПЕРЕД вызовом callback
          prevMinutesRef.current = newMinutes;
          triggerHaptic(10); // Усиленный haptic при переходе часа

          // Если есть onTimeChange — вызываем его (один вызов = нет batching проблемы)
          if (onTimeChange) {
            onTimeChange(newHour, newMinutes);
            return;
          }
          // Fallback: раздельные callbacks
          onHoursChange(newHour);
          onMinutesChange(newMinutes);
          return;
        }
      }

      // Обычное изменение минут (без overflow)
      prevMinutesRef.current = newMinutes;
      triggerHaptic(5);
      onMinutesChange(newMinutes);
    }, [onMinutesChange, onHoursChange, onTimeChange, hoursValues, minutesValues, linkedScroll, wrap, hours, triggerHaptic]);

    return React.createElement('div', { className: `mc-time-picker ${className}`.trim() },
      // Дисплей времени сверху
      display && React.createElement('div', { className: 'mc-time-display' },
        React.createElement('span', { className: 'mc-time-display-value' },
          `${pad2(hours)}:${pad2(minutes)}`
        )
      ),
      // Подписи (скрываем если пустые)
      (hoursLabel || minutesLabel) && React.createElement('div', { className: 'mc-time-labels' },
        React.createElement('span', { className: 'mc-time-label' }, hoursLabel),
        React.createElement('span', { className: 'mc-time-label' }, minutesLabel)
      ),
      // Пикеры
      React.createElement('div', { className: 'mc-time-pickers' },
        React.createElement(WheelPicker, {
          values: hoursValues,
          value: hours,
          onChange: handleHoursChange, // С haptic
          label: '',
          formatValue: pad2,
          wrap,
          compact
        }),
        React.createElement('span', { className: 'mc-time-sep' }, ':'),
        React.createElement(WheelPicker, {
          values: minutesValues,
          value: minutes,
          onChange: handleMinutesChange, // С haptic + linkedScroll
          label: '',
          formatValue: pad2,
          wrap,
          compact
        })
      )
    );
  }

  // === Реестр шагов ===
  const StepRegistry = {};;

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
      shouldShow: config.shouldShow || null,
      getInitialData: config.getInitialData || (() => ({})),
      validate: config.validate || (() => true),
      save: config.save || (() => { }),
      canSkip: config.canSkip || false,
      nextLabel: config.nextLabel || null,  // Кастомный текст кнопки "Далее"/"Готово"
      hideHeaderNext: config.hideHeaderNext || false,  // Скрыть кнопку в хедере
    };
    try {
      document.dispatchEvent(new CustomEvent('heys-step-registered', { detail: { id } }));
    } catch (_) { }
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
    finishLabel = 'Готово', // Текст кнопки на последнем шаге (по умолчанию "Готово")
    freezeVisibleSteps = false,
    forceVisibleStepIds = [],
    requireStepAck = false,
    onStepSaved = null,
    allowProgressForwardNav = true
  }) {
    const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
    const [animating, setAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null);
    const [stepData, setStepData] = useState({});
    const [validationError, setValidationError] = useState(false);
    const [validationMessage, setValidationMessage] = useState(null);
    const [savingStep, setSavingStep] = useState(false);
    const [slideInDirection, setSlideInDirection] = useState(null); // Для shake-анимации
    const containerRef = useRef(null);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const touchStartActive = useRef(false);
    const savedStepSigsRef = useRef({});
    const frozenVisibleStepConfigsRef = useRef(null);
    const frozenContextKeyRef = useRef(null);
    const [registryVersion, setRegistryVersion] = useState(0);

    useEffect(() => {
      const handleStepRegistered = () => setRegistryVersion((version) => version + 1);
      document.addEventListener('heys-step-registered', handleStepRegistered);
      // Закрывает race, если регистрация случилась между первым render и effect.
      handleStepRegistered();
      return () => document.removeEventListener('heys-step-registered', handleStepRegistered);
    }, []);

    const contextKey = useMemo(() => JSON.stringify(context), [context]);
    const forceVisibleStepIdsKey = Array.isArray(forceVisibleStepIds)
      ? forceVisibleStepIds.join('|')
      : '';
    const forcedVisibleStepIdSet = useMemo(
      () => new Set(forceVisibleStepIdsKey ? forceVisibleStepIdsKey.split('|') : []),
      [forceVisibleStepIdsKey]
    );

    // Получаем конфигурации шагов
    const stepConfigs = useMemo(() => {
      return steps.map(stepId => {
        if (typeof stepId === 'string') {
          return StepRegistry[stepId];
        }
        // Inline step config
        return stepId;
      }).filter(Boolean);
    }, [steps, registryVersion]);

    const computedVisibleStepConfigs = useMemo(() => {
      return stepConfigs.filter(config => {
        if (!config) return false;
        if (forcedVisibleStepIdSet.has(config.id)) return true;
        if (typeof config.shouldShow !== 'function') return true;
        try {
          return config.shouldShow(context, stepData);
        } catch (e) {
          console.warn('[StepModal] shouldShow error:', config.id, e);
          return true;
        }
      });
    }, [stepConfigs, contextKey, stepData, forcedVisibleStepIdSet]);

    const allStepConfigsReady = stepConfigs.length === steps.length;
    if (freezeVisibleSteps && allStepConfigsReady
      && (frozenVisibleStepConfigsRef.current === null || frozenContextKeyRef.current !== contextKey)) {
      frozenContextKeyRef.current = contextKey;
      frozenVisibleStepConfigsRef.current = computedVisibleStepConfigs;
    }

    const visibleStepConfigs = freezeVisibleSteps
      ? (frozenVisibleStepConfigsRef.current || (allStepConfigsReady ? computedVisibleStepConfigs : []))
      : computedVisibleStepConfigs;

    const totalSteps = visibleStepConfigs.length;
    const currentConfig = visibleStepConfigs[currentStepIndex];

    // Мемоизированные данные
    const greeting = useMemo(() => getTimeBasedGreeting(), []);
    const dailyTip = useMemo(() => getDailyTip(), []);
    const currentStreak = useMemo(() => getCurrentStreak(), []);

    // Инициализация данных шагов: полный сброс при смене context; дозаполнение при появлении новых видимых шагов (ветвление)
    const lastContextKeyRef = useRef(null);
    const visibleIdsSig = useMemo(
      () => visibleStepConfigs.map((c) => c && c.id).filter(Boolean).join('|'),
      [visibleStepConfigs]
    );

    useEffect(() => {
      if (lastContextKeyRef.current !== contextKey) {
        lastContextKeyRef.current = contextKey;
        savedStepSigsRef.current = {};
        const initialData = {};
        visibleStepConfigs.forEach((config) => {
          if (config.getInitialData) {
            initialData[config.id] = config.getInitialData(context, initialData);
          }
        });
        setStepData(initialData);
        return;
      }
      setStepData((prev) => {
        const next = { ...prev };
        let changed = false;
        visibleStepConfigs.forEach((config) => {
          if (config.getInitialData && next[config.id] === undefined) {
            next[config.id] = config.getInitialData(context, next);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, [contextKey, visibleIdsSig, context, visibleStepConfigs]);

    const getStepSaveSignature = useCallback((config, allStepData) => {
      try {
        const configIndex = visibleStepConfigs.findIndex((item) => item && item.id === config?.id);
        const dependencyIds = configIndex >= 0
          ? visibleStepConfigs.slice(0, configIndex + 1).map((item) => item.id)
          : [config?.id].filter(Boolean);
        const dependencyData = {};
        dependencyIds.forEach((id) => {
          dependencyData[id] = allStepData?.[id];
        });
        return JSON.stringify({
          id: config?.id || '',
          data: dependencyData
        });
      } catch (_) {
        return String(Date.now());
      }
    }, [visibleStepConfigs]);

    const showSaveError = useCallback((message) => {
      setValidationMessage(message || 'Не удалось сохранить шаг. Попробуйте ещё раз.');
      setValidationError(true);
      setTimeout(() => {
        setValidationError(false);
        setValidationMessage(null);
      }, 2500);
    }, []);

    const getUserFacingCompletionError = useCallback((error) => {
      const raw = String(error?.message || error || '');
      if (raw.startsWith('checkin_incomplete_steps:')) {
        const labels = raw.slice('checkin_incomplete_steps:'.length).trim();
        return labels
          ? `Осталось заполнить: ${labels}. Вернитесь к указанным шагам и сохраните данные.`
          : 'Не удалось завершить чек-ин. Вернитесь к незаполненным обязательным шагам.';
      }
      if (raw === 'checkin_sync_timeout') {
        return 'Не удалось дождаться облака. Попробуйте ещё раз.';
      }
      return raw || 'Не удалось завершить чек-ин. Попробуйте ещё раз.';
    }, []);

    const normalizeValidationResult = useCallback((result) => {
      if (result === true || result === undefined || result === null) return { valid: true, message: null };
      if (result === false) return { valid: false, message: null };
      if (typeof result === 'string') return { valid: false, message: result };
      if (typeof result === 'object') {
        if (result.valid === false) return { valid: false, message: result.error || result.message || null };
        if (result.valid === true) return { valid: true, message: null };
      }
      return { valid: !!result, message: null };
    }, []);

    const saveStepConfig = useCallback(async (config, allStepData) => {
      if (!config || typeof config.save !== 'function') return true;
      const sig = getStepSaveSignature(config, allStepData);
      if (savedStepSigsRef.current[config.id] === sig) return true;
      try {
        const result = config.save(allStepData?.[config.id], context, allStepData);
        let saveResult = result;
        if (result && typeof result.then === 'function') {
          saveResult = await result;
        }
        if (typeof onStepSaved === 'function') {
          const ackResult = onStepSaved({
            stepId: config.id,
            config,
            data: allStepData?.[config.id],
            allStepData,
            saveResult,
            context
          });
          if (ackResult && typeof ackResult.then === 'function') {
            await ackResult;
          }
        }
        savedStepSigsRef.current[config.id] = sig;
        return true;
      } catch (e) {
        console.error('[StepModal] step save failed:', config.id, e);
        showSaveError(requireStepAck ? (e?.message || 'Не удалось сохранить шаг в облако. Попробуйте ещё раз.') : 'Не удалось сохранить шаг. Попробуйте ещё раз.');
        return false;
      }
    }, [context, getStepSaveSignature, onStepSaved, requireStepAck, showSaveError]);

    useEffect(() => {
      setCurrentStepIndex((i) => {
        const max = Math.max(0, totalSteps - 1);
        return i > max ? max : i;
      });
    }, [totalSteps]);

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

    // 🚀 PERF R30: defer step transition/save — validation stays sync for immediate UX feedback
    const handleNext = useCallback(async () => {
      if (savingStep || animating) return;

      // Валидация текущего шага
      const validation = currentConfig.validate
        ? normalizeValidationResult(currentConfig.validate(stepData[currentConfig.id], stepData))
        : { valid: true, message: null };
      if (!validation.valid) {
        // Получаем сообщение об ошибке если есть
        const errorMsg = currentConfig.getValidationMessage
          ? currentConfig.getValidationMessage(stepData[currentConfig.id], stepData)
          : validation.message;
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

      // 🛡️ iOS-fix (2026-05-18): убрали внешний `setTimeout(..., 0)`-обёртку.
      // На iOS Safari в режиме PWA setTimeout(0) может откладываться до
      // следующего idle slot — особенно если event-loop занят rerender'ом
      // после updateField (mood-step pulse-анимация). Это давало "Далее
      // нажимаешь — а ничего не происходит, нажимаешь снова". Validate тут
      // синхронный, goToStep уже сам управляет анимацией через свой
      // setTimeout(200), второй внешний wrapper избыточен.
      setSavingStep(true);
      try {
        if (currentStepIndex < totalSteps - 1) {
          if (!(await saveStepConfig(currentConfig, stepData))) return;
          goToStep(currentStepIndex + 1, 'left');
        } else {
          if (requireStepAck) {
            if (!(await saveStepConfig(currentConfig, stepData))) return;
          } else {
            // Сохраняем все данные
            for (const config of visibleStepConfigs) {
              if (!(await saveStepConfig(config, stepData))) return;
            }
          }

          // XP за чек-ин
          if (HEYS.gamification) {
            try {
              visibleStepConfigs.forEach(config => {
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
          if (!visibleStepConfigs.some(c => c.id === 'mealName' || c.id === 'mealTime')) {
            window.dispatchEvent(new CustomEvent('heys:day-updated', {
              detail: { date: getTodayKey(), source: 'step-modal' }
            }));
          }

          if (onComplete) {
            try {
              const completionResult = onComplete(stepData);
              if (completionResult && typeof completionResult.then === 'function') {
                await completionResult;
              }
            } catch (e) {
              console.error('[StepModal] completion failed:', e);
              showSaveError(requireStepAck ? getUserFacingCompletionError(e) : 'Не удалось завершить. Попробуйте ещё раз.');
              return;
            }
          }
        }
      } finally {
        setSavingStep(false);
      }
    }, [savingStep, animating, currentStepIndex, totalSteps, currentConfig, stepData, visibleStepConfigs, goToStep, onComplete, saveStepConfig, showSaveError, requireStepAck, normalizeValidationResult, getUserFacingCompletionError]);

    const handlePrev = useCallback(() => {
      if (currentStepIndex > 0) {
        // Пропускаем скрытые шаги при навигации назад
        let prevIndex = currentStepIndex - 1;
        while (prevIndex > 0 && visibleStepConfigs[prevIndex]?.hidden) {
          prevIndex--;
        }
        goToStep(prevIndex, 'right');
      }
    }, [currentStepIndex, goToStep, visibleStepConfigs]);

    const handleSkip = useCallback(async () => {
      if (savingStep || animating || currentStepIndex >= totalSteps - 1) return;
      if (requireStepAck && typeof onStepSaved === 'function' && currentConfig) {
        setSavingStep(true);
        try {
          const ackResult = onStepSaved({
            stepId: currentConfig.id,
            config: currentConfig,
            data: stepData[currentConfig.id],
            allStepData: stepData,
            saveResult: { skipped: true },
            skipped: true,
            context
          });
          if (ackResult && typeof ackResult.then === 'function') {
            await ackResult;
          }
        } catch (e) {
          console.error('[StepModal] step skip failed:', currentConfig.id, e);
          showSaveError(e?.message || 'Не удалось сохранить пропуск шага. Попробуйте ещё раз.');
          return;
        } finally {
          setSavingStep(false);
        }
      }
      goToStep(currentStepIndex + 1, 'left');
    }, [savingStep, animating, currentStepIndex, totalSteps, requireStepAck, onStepSaved, currentConfig, stepData, context, goToStep, showSaveError]);

    // Swipe handlers — учитываем allowSwipe из конфига шага
    const stepAllowSwipe = currentConfig?.allowSwipe !== false && allowSwipe;

    const handleTouchStart = useCallback((e) => {
      touchStartActive.current = false;
      if (!stepAllowSwipe) return;

      // Не перехватываем touch на интерактивных элементах — слайдеры, кнопки, инпуты.
      // 🛡️ iOS-fix: tap на кнопке "Далее" с лёгким сдвигом пальца не должен
      // регистрироваться как старт свайпа и затем глотаться preventDefault'ом.
      if (isInteractiveTouchTarget(e.target)) return;

      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartActive.current = true;
    }, [stepAllowSwipe, currentConfig]);

    // Блокируем scroll на backdrop, разрешаем только внутри scrollable контейнеров
    // Используем useEffect для регистрации с { passive: false }, иначе preventDefault() не работает
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleTouchMove = (e) => {
        // 🛡️ iOS-fix (2026-05-18): preventDefault на touchmove между touchstart и
        // touchend на кнопке может ОТМЕНИТЬ click event (особенно если палец
        // слегка смещается при тапе). Исключаем все интерактивные элементы —
        // кнопки, инпуты, ссылки, слайдеры, wheel-pickers, mood-rating-card.
        if (isInteractiveTouchTarget(e.target)) return;

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

        // Не внутри scrollable и не интерактивный — блокируем body-scroll на backdrop.
        e.preventDefault();
      };

      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      return () => container.removeEventListener('touchmove', handleTouchMove);
    }, []);

    const handleTouchEnd = useCallback((e) => {
      if (!stepAllowSwipe) {
        touchStartActive.current = false;
        return;
      }

      // Не перехватываем свайп на интерактивных элементах.
      if (isInteractiveTouchTarget(e.target)) {
        touchStartActive.current = false;
        return;
      }
      if (!touchStartActive.current) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      touchStartActive.current = false;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX < 0 && currentStepIndex < totalSteps - 1) {
          handleNext();
        } else if (deltaX > 0 && currentStepIndex > 0) {
          goToStep(currentStepIndex - 1, 'right');
        }
      }
    }, [stepAllowSwipe, currentStepIndex, totalSteps, goToStep, currentConfig, handleNext]);

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

    // Закрытие по клику на backdrop (вне модалки)
    const handleBackdropClick = useCallback((e) => {
      if (e.target.classList.contains('mc-backdrop') && onClose) {
        onClose();
      }
    }, [onClose]);

    if (!currentConfig) {
      return null;
    }

    const slideClass = slideDirection === 'left' ? 'mc-slide-left' :
      slideDirection === 'right' ? 'mc-slide-right' :
        slideInDirection === 'from-right' ? 'mc-slide-in-right' :
          slideInDirection === 'from-left' ? 'mc-slide-in-left' : '';

    const StepComponent = currentConfig.component;

    const headerRightContent = typeof context.headerRight === 'function'
      ? context.headerRight({
        stepData,
        currentConfig,
        currentStepIndex,
        totalSteps,
        context,
        goToStep // Добавляем для навигации на другие шаги
      })
      : context.headerRight;

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

            // Центр: Title / hint / точки прогресса
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
                ),
              // 🆕 Точки прогресса в шапке (компактный вариант)
              showProgress && totalSteps > 1 && React.createElement('div', { className: 'mc-progress-dots mc-progress-dots--in-header' },
                visibleStepConfigs.map((config, i) =>
                  config.hidden ? null : React.createElement('button', {
                    key: i,
                    className: 'mc-progress-dot' + (i === currentStepIndex ? ' active' : '') + (i < currentStepIndex ? ' completed' : ''),
                    onClick: () => {
                      if (i !== currentStepIndex) {
                        if (i > currentStepIndex) {
                          if (allowProgressForwardNav) handleNext();
                        }
                        else goToStep(i, 'right');
                      }
                    },
                    disabled: !allowProgressForwardNav && i > currentStepIndex,
                    'aria-label': `Шаг ${i + 1}`
                  })
                )
              )
            ),

            // Правая часть: headerRight ИЛИ кнопка Готово/Далее
            // headerRight — кастомный контент справа (например счётчик продуктов)
            // finishLabel — кастомный текст для последнего шага (например "Добавить")
            // currentConfig.nextLabel — кастомный текст для конкретного шага
            React.createElement('div', { className: 'mc-header-right' },
              headerRightContent
                ? React.createElement('span', { className: 'mc-header-right-text' }, headerRightContent)
                : (!(hidePrimaryOnFirst && currentStepIndex === 0) && !currentConfig.hideHeaderNext && React.createElement('button', {
                  className: 'mc-header-btn mc-header-btn--primary',
                  onClick: handleNext,
                  disabled: savingStep || animating
                }, savingStep
                  ? 'Сохраняю...'
                  : currentStepIndex === totalSteps - 1
                  ? (currentConfig.nextLabel || finishLabel)
                  : (currentConfig.nextLabel || 'Далее')))
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
              context: { ...context, onNext: handleNext, onClose: handleClose }  // Передаём onNext и onClose для кастомных кнопок
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
              onClick: handleSkip,
              disabled: savingStep || animating
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
  let modalRootInstance = null; // React 18 createRoot instance
  let currentModalElement = null;
  let savedScrollY = 0; // Сохраняем позицию скролла
  let modalCleanup = null; // Cleanup функция для ModalManager

  function showStepModal(options) {
    // Создаём контейнер если нет
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'heys-step-modal-root';
      document.body.appendChild(modalRoot);
    }

    // Регистрируем в ModalManager
    if (HEYS.ModalManager) {
      modalCleanup = HEYS.ModalManager.register('step-modal', () => {
        hideStepModal({ skipManagerNotify: true });
      });
    }

    // Сохраняем текущую позицию скролла
    savedScrollY = window.scrollY;

    // 🔒 Блокируем прокрутку body при открытии модалки (без position:fixed чтобы не прыгал фон)
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleComplete = async (data) => {
      const closeAfterComplete = options.closeOnComplete === 'after';
      if (!closeAfterComplete) {
        // Для приёмов пищи и продуктов — прокрутка к дневнику
        hideStepModal({ scrollToDiary: options.scrollToDiary !== false });
      }
      if (options.onComplete) {
        const complete = options.onComplete(data);
        if (complete && typeof complete.then === 'function') {
          await complete;
        }
      }
      if (closeAfterComplete) {
        // Для приёмов пищи и продуктов — прокрутка к дневнику
        hideStepModal({ scrollToDiary: options.scrollToDiary !== false });
      }
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

    // React 18: createRoot API
    if (!modalRootInstance) {
      modalRootInstance = ReactDOM.createRoot(modalRoot);
    }
    modalRootInstance.render(currentModalElement);
  }

  function hideStepModal(options = {}) {
    // 🔓 Восстанавливаем прокрутку body при закрытии
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // Дерегистрируем из ModalManager (если не вызвано из менеджера)
    if (modalCleanup && !options.skipManagerNotify) {
      modalCleanup();
      modalCleanup = null;
    }

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

    // React 18: unmount через root instance
    if (modalRootInstance) {
      modalRootInstance.unmount();
      modalRootInstance = null; // Сбрасываем для следующего показа
    }
    // Удаляем контейнер из DOM для корректного пересоздания createRoot
    if (modalRoot && modalRoot.parentNode) {
      modalRoot.parentNode.removeChild(modalRoot);
      modalRoot = null;
    }

    document.dispatchEvent(new CustomEvent('heys-stepmodal-closed'));
  }

  // === Экспорт ===
  HEYS.StepModal = {
    show: showStepModal,
    hide: hideStepModal,
    Component: StepModal,
    registerStep,
    registry: StepRegistry,
    WheelPicker,
    TimePicker,
    pad2,
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

  // Уведомляем другие модули что StepModal готов (в т.ч. те что загрузились раньше)
  try {
    document.dispatchEvent(new CustomEvent('heys-stepmodal-ready'));
    console.info('[HEYS.StepModal] ✅ heys-stepmodal-ready dispatched');
  } catch (_) { }

})(typeof window !== 'undefined' ? window : global);
