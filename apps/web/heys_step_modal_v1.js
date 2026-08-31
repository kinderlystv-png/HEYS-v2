// heys_step_modal_v1.js — Модульная система модалок с шагами
// Позволяет комбинировать шаги: вес, сон, шаги, вода и др.
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useEffect, useCallback, useRef, useContext, createContext } = React;

  // === Контекст для передачи данных между шагами ===
  const StepModalContext = createContext({});

  // «сохранение»: растущий интервал автоповтора записи профиля в облако,
  // последний шаг повторяется бесконечно — профиль сохранён только когда
  // облако подтвердило запись.
  const PROFILE_RETRY_DELAYS_SEC = [4, 8, 16, 30, 60];

  function pluralSeconds(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'секунду';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'секунды';
    return 'секунд';
  }

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
    if (target.closest('.mc-quality-slider, .mc-v4-scale, .mc-drag-slider, .mood-rating-card, .mc-wheel-picker, .mc-progress-dot, .mc-header-btn')) return true;
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
      // Второй алгоритм серии убран 2026-08-09: он считал «дней подряд, где
      // хоть что-то записано» — без калорий, зон и рефида, да ещё по UTC-дате,
      // из-за чего после 21:00 по Москве промахивался мимо ключей дня. Число
      // систематически расходилось с каноническим.
      const utils = HEYS.utils || {};
      if (typeof utils.safeGetStreak === 'function') {
        return utils.safeGetStreak();
      }
      return HEYS.dayCalendarMetrics?.getCurrentStreak?.() || 0;
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
  }) {
    // Ref для отслеживания предыдущих минут — НЕ синхронизируем при каждом рендере!
    // Обновляется ТОЛЬКО в handleMinutesChange после использования
    const prevMinutesRef = useRef(minutes);

    // Обработчик изменения часов
    const handleHoursChange = React.useCallback((newHours) => {
      onHoursChange(newHours);
    }, [onHoursChange]);

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
      onMinutesChange(newMinutes);
    }, [onMinutesChange, onHoursChange, onTimeChange, hoursValues, minutesValues, linkedScroll, wrap, hours]);

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
          onChange: handleHoursChange,
          label: '',
          formatValue: pad2,
          wrap,
          compact
        }),
        React.createElement('span', { className: 'mc-time-sep' }, ':'),
        React.createElement(WheelPicker, {
          values: minutesValues,
          value: minutes,
          onChange: handleMinutesChange, // linkedScroll
          label: '',
          formatValue: pad2,
          wrap,
          compact
        })
      )
    );
  }

  // === Реестр шагов ===
  // Lazy chunks can be requested both by the postboot loader and by a facade.
  // Preserve already registered external steps if this module is evaluated
  // again (for example during a same-version lazy/SW race).
  const StepRegistry = HEYS.StepModal?.registry || {};

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
      icon: Object.prototype.hasOwnProperty.call(config, 'icon') ? (config.icon || '') : '📋',
      component: config.component,
      shouldShow: config.shouldShow || null,
      getInitialData: config.getInitialData || (() => ({})),
      validate: config.validate || (() => true),
      save: config.save || (() => { }),
      canSkip: config.canSkip || false,
      nextLabel: config.nextLabel || null,  // Кастомный текст кнопки "Далее"/"Готово"
      hideHeaderNext: config.hideHeaderNext || false,  // Скрыть кнопку в хедере
      disableBack: config.disableBack === true,
      hideProgressDots: typeof config.hideProgressDots === 'function'
        ? config.hideProgressDots
        : config.hideProgressDots === true,
      hiddenFromProgress: config.hiddenFromProgress === true,
      hideDailyFooter: config.hideDailyFooter === true || typeof config.hideDailyFooter === 'function'
        ? config.hideDailyFooter
        : false,
      secondaryLabelWhen: typeof config.secondaryLabelWhen === 'function' ? config.secondaryLabelWhen : null,
      applySecondary: typeof config.applySecondary === 'function' ? config.applySecondary : null,
      headerCaption: config.headerCaption ?? null,
      showHeaderBack: typeof config.showHeaderBack === 'function' ? config.showHeaderBack : null,
      applyHeaderBack: typeof config.applyHeaderBack === 'function' ? config.applyHeaderBack : null,
      getValidationMessage: typeof config.getValidationMessage === 'function' ? config.getValidationMessage : null,
      allowSwipe: config.allowSwipe,
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
    onRequestClose = null,
    initialStep = 0,
    initialSlideInDirection = null,
    modalClassName = '',
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
    onStepShown = null,
    allowProgressForwardNav = true,
    layout = 'default',
    // Кадры v4 рисуют возврат шевроном 17×17, а не словами «← Назад». Флаг
    // включается потоками, у которых кадр это прямо задаёт, чтобы не менять
    // шапку тем, чей канвас ещё не сведён.
    chevronBack = false
  }) {
    const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
    const [animating, setAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null);
    const [stepData, setStepData] = useState({});
    const [validationError, setValidationError] = useState(false);
    const [validationMessage, setValidationMessage] = useState(null);
    const [savingStep, setSavingStep] = useState(false);
    const [profileSaveFail, setProfileSaveFail] = useState(false);
    const [profileSaveOk, setProfileSaveOk] = useState(false);
    const [dailySaveFail, setDailySaveFail] = useState(false);
    const [dailyRetryAttempt, setDailyRetryAttempt] = useState(0);
    const [dailyRetryCountdown, setDailyRetryCountdown] = useState(0);
    // «сохранение»: копия обещает автоматический повтор с растущим интервалом и
    // видимый номер попытки — значит это должно быть механикой, а не словами.
    const [profileRetryAttempt, setProfileRetryAttempt] = useState(0);
    const [profileRetryCountdown, setProfileRetryCountdown] = useState(0);
    const handleNextRef = useRef(null);
    // «клавиатура»: 100dvh на iOS не сжимается под системной клавиатурой —
    // высоту берём из visualViewport, иначе футер уезжает под клавиши.
    const [keyboardViewportHeight, setKeyboardViewportHeight] = useState(0);
    const [slideInDirection, setSlideInDirection] = useState(() =>
      initialSlideInDirection === 'from-right' || initialSlideInDirection === 'from-left'
        ? initialSlideInDirection
        : null
    ); // Для входа в flow и переходов между шагами
    const containerRef = useRef(null);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    const touchStartActive = useRef(false);
    const actionInFlightRef = useRef(false);
    const transitionInFlightRef = useRef(false);
    // Строка «повторный тап и поворот»: минимум 350 мс между тапами по
    // «Дальше» поверх actionInFlightRef — тот снимается сразу, как только
    // операция завершилась, а сеть иногда отвечает быстрее защитного окна.
    // Лок ключуется по id шага: повтор ТОГО ЖЕ шага в окне блокируется,
    // переход к следующему шагу — нет (это разные действия, не дубликат).
    const nextTapLockRef = useRef({ id: null, at: 0 });
    const savedStepSigsRef = useRef({});
    const shownStepSigRef = useRef('');
    const frozenVisibleStepConfigsRef = useRef(null);
    const frozenContextKeyRef = useRef(null);
    const registryTimeoutTraceRef = useRef('');
    const [registryVersion, setRegistryVersion] = useState(0);
    const [registryWaitExpired, setRegistryWaitExpired] = useState(false);

    useEffect(() => {
      const handleStepRegistered = () => setRegistryVersion((version) => version + 1);
      document.addEventListener('heys-step-registered', handleStepRegistered);
      // Закрывает race, если регистрация случилась между первым render и effect.
      handleStepRegistered();
      return () => document.removeEventListener('heys-step-registered', handleStepRegistered);
    }, []);

    useEffect(() => {
      if (!slideInDirection) return undefined;
      const timer = setTimeout(() => setSlideInDirection(null), 250);
      return () => clearTimeout(timer);
    }, []);

    // «клавиатура»: экран сжимается до видимой части viewport, футер с
    // «Дальше» остаётся над клавиатурой.
    useEffect(() => {
      const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!viewport) return undefined;
      const sync = () => {
        const inset = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
        // Порог отсекает адресную строку и мелкие сдвиги — реагируем на клавиатуру.
        setKeyboardViewportHeight(inset > 80 ? Math.round(viewport.height) : 0);
      };
      sync();
      viewport.addEventListener('resize', sync);
      viewport.addEventListener('scroll', sync);
      return () => {
        viewport.removeEventListener('resize', sync);
        viewport.removeEventListener('scroll', sync);
      };
    }, []);

    // «сохранение»: растущий интервал повтора; кнопка «Повторить сейчас»
    // просто опережает таймер, снимая profileSaveFail и убивая его в cleanup.
    useEffect(() => {
      if (!profileSaveFail) {
        setProfileRetryCountdown(0);
        return undefined;
      }
      const delays = PROFILE_RETRY_DELAYS_SEC;
      const index = Math.min(Math.max(profileRetryAttempt - 1, 0), delays.length - 1);
      let left = delays[index];
      setProfileRetryCountdown(left);
      const timer = setInterval(() => {
        left -= 1;
        if (left > 0) {
          setProfileRetryCountdown(left);
          return;
        }
        clearInterval(timer);
        setProfileRetryCountdown(0);
        const retry = handleNextRef.current;
        if (typeof retry === 'function') Promise.resolve(retry()).catch(() => null);
      }, 1000);
      return () => clearInterval(timer);
    }, [profileSaveFail, profileRetryAttempt]);

    useEffect(() => {
      if (!dailySaveFail) {
        setDailyRetryCountdown(0);
        return undefined;
      }
      const delays = PROFILE_RETRY_DELAYS_SEC;
      const index = Math.min(Math.max(dailyRetryAttempt - 1, 0), delays.length - 1);
      let left = delays[index];
      setDailyRetryCountdown(left);
      const timer = setInterval(() => {
        left -= 1;
        if (left > 0) {
          setDailyRetryCountdown(left);
          return;
        }
        clearInterval(timer);
        setDailyRetryCountdown(0);
        const retry = handleNextRef.current;
        if (typeof retry === 'function') Promise.resolve(retry()).catch(() => null);
      }, 1000);
      return () => clearInterval(timer);
    }, [dailySaveFail, dailyRetryAttempt]);

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
    const isDailyLayout = layout === 'daily';
    const progressStepConfigs = visibleStepConfigs.filter((config) => (
      config && !config.hidden && !config.hiddenFromProgress
    ));
    const progressActiveIndex = currentConfig
      ? progressStepConfigs.findIndex((config) => config.id === currentConfig.id)
      : -1;
    const currentStepData = currentConfig ? (stepData[currentConfig.id] || {}) : {};
    const hideProgressDotsResolved = typeof currentConfig?.hideProgressDots === 'function'
      ? currentConfig.hideProgressDots(currentStepData, { currentConfig, context }) === true
      : currentConfig?.hideProgressDots === true;
    const showDailyProgressDots = showProgress
      && isDailyLayout
      && !hideProgressDotsResolved
      && !currentConfig?.hiddenFromProgress
      && progressStepConfigs.length > 1;
    const hideDailyFooter = isDailyLayout && (
      currentConfig?.hideDailyFooter === true
      || (typeof currentConfig?.hideDailyFooter === 'function'
        && currentConfig.hideDailyFooter(currentStepData, { currentConfig, context }) === true)
    );
    const secondaryLabel = isDailyLayout && !hideDailyFooter && currentConfig?.secondaryLabelWhen
      ? currentConfig.secondaryLabelWhen(currentStepData, { currentConfig, context })
      : null;
    const dailyHeaderCaption = isDailyLayout && currentConfig
      ? (typeof currentConfig.headerCaption === 'function'
        ? currentConfig.headerCaption(currentStepData, { currentConfig, context })
        : (currentConfig.headerCaption
          || ((currentConfig.hideProgressDots || currentConfig.hiddenFromProgress) ? currentConfig.hint : null)))
      : null;
    const showLayerBack = !!(isDailyLayout
      && currentConfig
      && typeof currentConfig.showHeaderBack === 'function'
      && currentConfig.showHeaderBack(currentStepData, { currentConfig, context }) === true);
    const showDailyStepBack = !!(isDailyLayout
      && currentConfig
      && !currentConfig.disableBack
      && (
        showLayerBack
        || currentStepIndex > 0
        || (showDailyProgressDots && progressActiveIndex > 0)
      ));
    const resolvedNextLabel = currentConfig && typeof currentConfig.nextLabel === 'function'
      ? currentConfig.nextLabel(currentStepData, { currentConfig, context })
      : currentConfig?.nextLabel;
    const liveInvalidReason = isDailyLayout
      && currentConfig
      && typeof currentConfig.getValidationMessage === 'function'
      ? currentConfig.getValidationMessage(currentStepData, stepData)
      : null;
    const dailyPrimaryDisabled = savingStep || animating || liveInvalidReason != null;
    const requestedStepIdsKey = steps.map((step) => (
      typeof step === 'string' ? step : (step?.id || '')
    )).join('|');
    const missingStepIds = steps
      .filter((stepId) => typeof stepId === 'string' && !StepRegistry[stepId]);

    useEffect(() => {
      if (currentConfig || steps.length === 0) {
        setRegistryWaitExpired(false);
        registryTimeoutTraceRef.current = '';
        return undefined;
      }
      setRegistryWaitExpired(false);
      const timer = setTimeout(() => {
        setRegistryWaitExpired(true);
        const missingIds = steps
          .filter((stepId) => typeof stepId === 'string' && !StepRegistry[stepId])
          .slice(0, 8);
        const signature = missingIds.join('|') || requestedStepIdsKey || 'unknown';
        if (registryTimeoutTraceRef.current === signature) return;
        registryTimeoutTraceRef.current = signature;
        const updateState = HEYS.PlatformAPIs?.getUpdateState?.() || {};
        HEYS.LogTrace?.event?.('step_registry_timeout', {
          source: 'step_modal',
          status: 'failed',
          reason: 'missing_step_config',
          step_id: missingIds.join(',') || 'unknown',
          release_version: HEYS.PlatformAPIs?.getAppVersion?.() || HEYS.version || global.APP_VERSION || 'unknown',
          update_version: updateState.version || 'none',
          phase: HEYS.PlatformAPIs?.getSwUpdateState?.() || 'unknown'
        }, 'warn');
        console.warn('[StepModal] Step registry timeout', {
          missingStepIds: missingIds,
          reason: 'missing_step_config',
          appVersion: HEYS.PlatformAPIs?.getAppVersion?.() || HEYS.version || global.APP_VERSION || 'unknown',
          swState: HEYS.PlatformAPIs?.getSwUpdateState?.() || 'unknown',
          updateVersion: updateState.version || null
        });
      }, 8000);
      return () => clearTimeout(timer);
    }, [currentConfig, registryVersion, requestedStepIdsKey, steps.length]);

    useEffect(() => {
      if (!currentConfig || typeof onStepShown !== 'function') return;
      const signature = contextKey + ':' + currentStepIndex + ':' + currentConfig.id;
      if (shownStepSigRef.current === signature) return;
      shownStepSigRef.current = signature;
      try { onStepShown({ stepId: currentConfig.id, config: currentConfig, index: currentStepIndex, context }); }
      catch (_) { /* observability callback must not affect the flow */ }
    }, [context, contextKey, currentConfig, currentStepIndex, onStepShown]);

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
      if (raw.startsWith('checkin_decision_pending:')) {
        return 'Проверка прошлых дней ещё загружается. Подождите немного и нажмите «Готово» ещё раз.';
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

    const waitForSavingPaint = useCallback(() => new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    }), []);

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
        if (isDailyLayout && requireStepAck) {
          setDailySaveFail(false);
          setDailyRetryAttempt(0);
        }
        return true;
      } catch (e) {
        console.error('[StepModal] step save failed:', config.id, e);
        if (config.id === 'profile-metabolism') {
          // Номер попытки виден человеку и задаёт следующий интервал повтора.
          setProfileRetryAttempt((attempt) => attempt + 1);
          setProfileSaveFail(true);
          return false;
        }
        if (isDailyLayout && requireStepAck) {
          setDailyRetryAttempt((attempt) => attempt + 1);
          setDailySaveFail(true);
          return false;
        }
        showSaveError(requireStepAck ? (e?.message || 'Не удалось сохранить шаг в облако. Попробуйте ещё раз.') : 'Не удалось сохранить шаг. Попробуйте ещё раз.');
        return false;
      }
    }, [context, getStepSaveSignature, onStepSaved, requireStepAck, showSaveError, isDailyLayout]);

    useEffect(() => {
      setCurrentStepIndex((i) => {
        const max = Math.max(0, totalSteps - 1);
        return i > max ? max : i;
      });
    }, [totalSteps]);

    const stepDataRef = useRef(stepData);
    stepDataRef.current = stepData;

    // Обновление данных шага
    const updateStepData = useCallback((stepId, data) => {
      setStepData(prev => {
        const next = {
          ...prev,
          [stepId]: data // Полностью заменяем данные шага (компонент передаёт полный объект)
        };
        stepDataRef.current = next;
        return next;
      });
    }, []);

    // Навигация
    const goToStep = useCallback((newIndex, direction) => {
      if (transitionInFlightRef.current || animating || newIndex < 0 || newIndex >= totalSteps) return;

      transitionInFlightRef.current = true;
      setSlideDirection(direction);
      setAnimating(true);

      setTimeout(() => {
        setCurrentStepIndex(newIndex);
        setSlideDirection(null);
        // Запускаем slide-in анимацию для нового шага
        setSlideInDirection(direction === 'left' ? 'from-right' : 'from-left');
        setAnimating(false);
        transitionInFlightRef.current = false;
        // Сбрасываем slide-in после анимации
        setTimeout(() => setSlideInDirection(null), 250);
      }, 200);
    }, [animating, totalSteps]);

    const isStepDataPatch = useCallback((value) => (
      !!value
      && typeof value === 'object'
      && typeof value.preventDefault !== 'function'
      && !value.nativeEvent
    ), []);

    // 🚀 PERF R30: defer step transition/save — validation stays sync for immediate UX feedback
    const handleNext = useCallback(async (maybePatch) => {
      if (actionInFlightRef.current || transitionInFlightRef.current || savingStep || animating) return;

      let allStepData = stepDataRef.current || stepData;
      if (isStepDataPatch(maybePatch) && currentConfig) {
        const nextStep = { ...(allStepData[currentConfig.id] || {}), ...maybePatch };
        allStepData = { ...allStepData, [currentConfig.id]: nextStep };
        stepDataRef.current = allStepData;
        setStepData(allStepData);
      }

      // Валидация текущего шага
      const validation = currentConfig.validate
        ? normalizeValidationResult(currentConfig.validate(allStepData[currentConfig.id], allStepData))
        : { valid: true, message: null };
      if (!validation.valid) {
        // Получаем сообщение об ошибке если есть
        const errorMsg = currentConfig.getValidationMessage
          ? currentConfig.getValidationMessage(allStepData[currentConfig.id], allStepData)
          : validation.message;
        setValidationMessage(errorMsg);
        // Показываем shake-анимацию при ошибке
        setValidationError(true);
        // Вибрации на ошибке валидации нет: контракт знает два случая —
        // успешная запись и необратимое действие.
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
      actionInFlightRef.current = true;
      // Строка «повторный тап и поворот»: 350 мс минимальной защиты поверх
      // actionInFlightRef — тот снимается сразу по завершении операции, а
      // сеть иногда отвечает быстрее защитного окна. Лок стоит на моменте
      // тапа и не продлевает savingStep: продление ломает остальных
      // потребителей общей StepModal (приёмы пищи, вода, сон и т. д.),
      // которые не под этим контрактом, — 2026-08-25 так и нашли по красным
      // тестам morning-checkin-flow-resume.
      const tapNow = Date.now();
      const tapKey = currentConfig?.id ?? currentStepIndex;
      if (nextTapLockRef.current.id === tapKey && tapNow - nextTapLockRef.current.at < 350) {
        actionInFlightRef.current = false;
        return;
      }
      nextTapLockRef.current = { id: tapKey, at: tapNow };
      if (currentConfig?.id === 'profile-metabolism') {
        setProfileSaveFail(false);
        setProfileSaveOk(false);
      }
      if (isDailyLayout && requireStepAck) {
        setDailySaveFail(false);
      }
      setSavingStep(true);
      try {
        // Let the explicit "Сохраняю..." state reach one frame even
        // when local persistence resolves synchronously.
        await waitForSavingPaint();
        const holdProfileSaveOk = async () => {
          if (currentConfig?.id !== 'profile-metabolism') return;
          setProfileRetryAttempt(0);
          setProfileSaveOk(true);
          await new Promise((resolve) => setTimeout(resolve, 400));
        };
        if (currentStepIndex < totalSteps - 1) {
          if (!(await saveStepConfig(currentConfig, allStepData))) return;
          if (isDailyLayout && HEYS.feedback?.emit) {
            try { HEYS.feedback.emit('checkin.step'); } catch (_) { /* noop */ }
          }
          await holdProfileSaveOk();
          setProfileSaveOk(false);
          goToStep(currentStepIndex + 1, 'left');
        } else {
          if (requireStepAck) {
            if (!(await saveStepConfig(currentConfig, allStepData))) return;
          } else {
            // Сохраняем все данные
            for (const config of visibleStepConfigs) {
              if (!(await saveStepConfig(config, allStepData))) return;
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

          await holdProfileSaveOk();

          if (onComplete) {
            try {
              const completionResult = onComplete(allStepData);
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
        actionInFlightRef.current = false;
        setSavingStep(false);
      }
    }, [savingStep, animating, currentStepIndex, totalSteps, currentConfig, stepData, visibleStepConfigs, goToStep, onComplete, saveStepConfig, showSaveError, requireStepAck, normalizeValidationResult, getUserFacingCompletionError, waitForSavingPaint, isStepDataPatch]);

    // Автоповтор сохранения профиля бьёт в ту же кнопку, что и человек.
    handleNextRef.current = handleNext;

    const handlePrev = useCallback(() => {
      if (visibleStepConfigs[currentStepIndex]?.disableBack) return;
      if (currentStepIndex > 0) {
        // Пропускаем скрытые шаги при навигации назад
        let prevIndex = currentStepIndex - 1;
        while (prevIndex > 0 && visibleStepConfigs[prevIndex]?.hidden) {
          prevIndex--;
        }
        goToStep(prevIndex, 'right');
      }
    }, [currentStepIndex, goToStep, visibleStepConfigs]);

    const applyLayerHeaderBack = useCallback(() => {
      if (!currentConfig || typeof currentConfig.showHeaderBack !== 'function') return false;
      const liveData = stepDataRef.current[currentConfig.id] || {};
      if (currentConfig.showHeaderBack(liveData, { currentConfig, context }) !== true) return false;
      if (typeof currentConfig.applyHeaderBack !== 'function') return false;
      updateStepData(
        currentConfig.id,
        currentConfig.applyHeaderBack(liveData, { currentConfig, context })
      );
      return true;
    }, [context, currentConfig, updateStepData]);

    const handleDailyHeaderBack = useCallback(() => {
      if (applyLayerHeaderBack()) return;
      handlePrev();
    }, [applyLayerHeaderBack, handlePrev]);

    const handleSecondary = useCallback(() => {
      if (!currentConfig?.applySecondary || savingStep || animating) return;
      const nextData = currentConfig.applySecondary(currentStepData, {
        context,
        stepData,
        currentConfig
      });
      if (nextData && typeof nextData === 'object') {
        updateStepData(currentConfig.id, nextData);
      }
    }, [animating, context, currentConfig, currentStepData, savingStep, stepData, updateStepData]);

    const handleSkip = useCallback(async () => {
      if (actionInFlightRef.current || transitionInFlightRef.current || savingStep || animating || currentStepIndex >= totalSteps - 1) return;
      if (requireStepAck && typeof onStepSaved === 'function' && currentConfig) {
        actionInFlightRef.current = true;
        setSavingStep(true);
        try {
          await waitForSavingPaint();
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
          actionInFlightRef.current = false;
          setSavingStep(false);
        }
      }
      goToStep(currentStepIndex + 1, 'left');
    }, [savingStep, animating, currentStepIndex, totalSteps, requireStepAck, onStepSaved, currentConfig, stepData, context, goToStep, showSaveError, waitForSavingPaint]);

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
        } else if (deltaX > 0) {
          if (applyLayerHeaderBack()) return;
          if (currentStepIndex > 0) {
            goToStep(currentStepIndex - 1, 'right');
          }
        }
      }
    }, [stepAllowSwipe, currentStepIndex, totalSteps, goToStep, handleNext, applyLayerHeaderBack]);

    const forceClose = useCallback(() => {
      onClose && onClose();
    }, [onClose]);

    useEffect(() => {
      if (!isDailyLayout) return undefined;
      const openedDateKey = context?.dateKey || (
        typeof HEYS.dayUtils?.todayISO === 'function' ? HEYS.dayUtils.todayISO() : null
      );
      if (!openedDateKey) return undefined;
      const onVisibility = () => {
        if (document.visibilityState !== 'visible') return;
        const todayKey = typeof HEYS.dayUtils?.todayISO === 'function'
          ? HEYS.dayUtils.todayISO()
          : openedDateKey;
        if (todayKey !== openedDateKey) forceClose();
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }, [isDailyLayout, context?.dateKey, forceClose]);

    useEffect(() => {
      if (!isDailyLayout || !containerRef.current) return undefined;
      const syncLargeText = () => {
        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        containerRef.current?.classList.toggle('mc-modal--large-text', rootPx > 17);
      };
      syncLargeText();
      window.addEventListener('resize', syncLargeText);
      return () => window.removeEventListener('resize', syncLargeText);
    }, [isDailyLayout, currentStepIndex]);

    // Закрытие — опционально через onRequestClose (APS exit guard и др.)
    const handleClose = useCallback(() => {
      if (typeof onRequestClose === 'function') {
        onRequestClose(forceClose);
        return;
      }
      forceClose();
    }, [forceClose, onRequestClose]);

    // Контекст для шагов
    const contextValue = useMemo(() => ({
      stepData,
      updateStepData,
      currentStepIndex,
      totalSteps,
      goToStep
    }), [stepData, updateStepData, currentStepIndex, totalSteps, goToStep]);

    const handleBackdropClick = useCallback((e) => {
      if (e.target.classList.contains('mc-backdrop')) {
        handleClose();
      }
    }, [handleClose]);

    // Закрытие по тапу на backdrop (вне модалки) — без «призрачного» клика под ней
    const backdropDismissProps = React.useMemo(() => {
      const MD = window.HEYS?.ModalDismiss;
      if (MD?.reactBackdropDismiss) return MD.reactBackdropDismiss(handleClose);
      return { onClick: handleBackdropClick };
    }, [handleClose, handleBackdropClick]);

    if (!currentConfig) {
      return React.createElement('div', {
        className: 'mc-backdrop',
        'data-heys-step-modal-loading': 'true',
        'data-heys-step-modal-error': registryWaitExpired ? 'missing_step_config' : undefined
      },
        React.createElement('div', {
          className: `mc-modal${modalClassName ? ` ${modalClassName}` : ''}`,
          role: 'status',
          'aria-live': 'polite'
        },
          React.createElement('div', { className: 'mc-step-content mc-step-content--loading' },
            React.createElement('div', { className: 'yv-loading' }, registryWaitExpired
              ? 'Не удалось загрузить шаг'
              : 'Загружаем следующий шаг…'),
            !registryWaitExpired && missingStepIds.length > 0 && React.createElement('div', {
              className: 'mc-loading-hint'
            }, 'Это может занять несколько секунд.'),
            registryWaitExpired && React.createElement('button', {
              type: 'button',
              className: 'mc-btn mc-btn--primary',
              onClick: handleClose
            }, 'Закрыть')
          )
        )
      );
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
        goToStep,
        updateStepData
      })
      : context.headerRight;

    const headerCenterContent = typeof context.resolveHeaderCenter === 'function'
      ? context.resolveHeaderCenter({
        stepData,
        currentConfig,
        currentStepIndex,
        totalSteps,
        context,
        goToStep,
        updateStepData
      })
      : null;

    return React.createElement(StepModalContext.Provider, { value: contextValue },
      React.createElement('div', {
        className: 'mc-backdrop',
        ref: containerRef,
        ...backdropDismissProps,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd
      },
        React.createElement('div', {
          className: `mc-modal${modalClassName ? ` ${modalClassName}` : ''}${isDailyLayout ? ' mc-modal--daily' : ''}`,
          // «клавиатура»: пока клавиатура открыта, модалка живёт в высоте
          // visualViewport — контент сжимается, футер поднимается над клавишами.
          style: keyboardViewportHeight > 0
            ? (() => {
              const available = `${Math.max(280, keyboardViewportHeight - 24)}px`;
              return isDailyLayout
                ? { maxHeight: available, height: available }
                : { maxHeight: available };
            })()
            : undefined,
          'data-heys-step-modal': 'true',
          'data-heys-step-id': currentConfig.id,
          'data-heys-saving': savingStep ? 'true' : 'false',
          'data-heys-layout': isDailyLayout ? 'daily' : 'default'
        },
          // Header — iOS-style с кнопками слева/справа
          React.createElement('div', { className: 'mc-header mc-header--nav' },
            // Левая часть: Назад или Закрыть
            React.createElement('div', { className: 'mc-header-left' },
              (showDailyStepBack || (!isDailyLayout && currentStepIndex > 0 && !currentConfig?.disableBack))
                ? React.createElement('button', {
                  className: 'mc-header-btn mc-header-btn--back',
                  onClick: handleDailyHeaderBack,
                  'aria-label': 'Назад'
                },
                  (isDailyLayout || chevronBack)
                    ? React.createElement('svg', {
                      className: 'mc-header-back-icon',
                      width: 17,
                      height: 17,
                      viewBox: '0 0 24 24',
                      fill: 'none',
                      'aria-hidden': 'true'
                    },
                      React.createElement('path', {
                        d: 'M15 18l-6-6 6-6',
                        stroke: 'currentColor',
                        strokeWidth: 2.75,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round'
                      })
                    )
                    : '← Назад')
                : (isDailyLayout
                  ? React.createElement('span', { className: 'mc-header-spacer', 'aria-hidden': 'true' })
                  : null)
                || (!isDailyLayout && onClose && React.createElement('button', {
                  className: 'mc-header-btn mc-header-btn--close',
                  onClick: handleClose,
                  'aria-label': 'Закрыть'
                }, '×'))
            ),

            // Центр: Title / hint / точки прогресса
            React.createElement('div', { className: 'mc-header-center' },
              headerCenterContent
                ? headerCenterContent
                : context.headerExtra
                ? context.headerExtra
                : (!isDailyLayout && (currentConfig.title || currentConfig.hint) && React.createElement('div', { className: 'mc-header-titles' },
                  currentConfig.title && React.createElement(AutoFitText, {
                    className: 'mc-header-title',
                    text: [currentConfig.icon, currentConfig.title].filter(Boolean).join(' '),
                    maxFontSize: 16,
                    minFontSize: 11
                  }),
                  currentConfig.hint && React.createElement(AutoFitText, {
                    className: 'mc-header-hint',
                    text: currentConfig.hint,
                    maxFontSize: 12,
                    minFontSize: 9
                  })
                )),
              !showDailyProgressDots && dailyHeaderCaption && React.createElement('div', {
                className: 'mc-daily-header-caption'
                  + (hideProgressDotsResolved ? ' mc-daily-header-caption--layer' : '')
              }, dailyHeaderCaption),
              showDailyProgressDots && React.createElement('div', {
                className: 'mc-progress-dots mc-progress-dots--in-header mc-progress-dots--pills',
                // Строка «доступность» checkin-morning.v4: полоса прогресса —
                // role=progressbar с подписью «Шаг N из 5».
                role: 'progressbar',
                'aria-valuemin': 1,
                'aria-valuemax': progressStepConfigs.length,
                'aria-valuenow': progressActiveIndex + 1,
                'aria-label': `Шаг ${progressActiveIndex + 1} из ${progressStepConfigs.length}`,
              },
                progressStepConfigs.map((config, i) =>
                  React.createElement('button', {
                    key: config.id || i,
                    className: 'mc-progress-dot' + (i === progressActiveIndex ? ' active' : '') + (i < progressActiveIndex ? ' completed' : ''),
                    onClick: () => {
                      const targetIndex = visibleStepConfigs.findIndex((item) => item.id === config.id);
                      if (targetIndex >= 0 && targetIndex !== currentStepIndex) {
                        if (targetIndex > currentStepIndex) {
                          if (allowProgressForwardNav) handleNext();
                        }
                        else goToStep(targetIndex, 'right');
                      }
                    },
                    disabled: !allowProgressForwardNav && i > progressActiveIndex,
                    'aria-hidden': 'true',
                    tabIndex: -1,
                  })
                )
              ),
              !isDailyLayout && showProgress && totalSteps > 1 && !currentConfig?.hideProgressDots && React.createElement('div', { className: 'mc-progress-dots mc-progress-dots--in-header' },
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
                : (isDailyLayout
                  ? React.createElement('span', { className: 'mc-header-spacer', 'aria-hidden': 'true' })
                  : null)
                || (!isDailyLayout && !(hidePrimaryOnFirst && currentStepIndex === 0) && !currentConfig.hideHeaderNext && React.createElement('button', {
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
            className: `mc-step-content ${slideClass}${validationError ? ' mc-validation-error' : ''}`,
            'data-heys-step-id': currentConfig.id
          },
            StepComponent && React.createElement(StepComponent, {
              data: stepData[currentConfig.id] || {},
              onChange: (data) => updateStepData(currentConfig.id, data),
              stepData: stepData,
              context: { ...context, onNext: handleNext, onClose: forceClose, onRequestClose: handleClose }  // onClose = force; onRequestClose = guarded
            })
          ),

          // Validation message — в daily причина живёт над кнопкой, без эмодзи
          validationMessage && !isDailyLayout && React.createElement('div', { className: 'mc-validation-message' },
            React.createElement('span', { className: 'mc-validation-icon' }, '⚠️'),
            React.createElement('span', null, validationMessage)
          ),

          allowSkip && !isDailyLayout && currentStepIndex < totalSteps - 1 && React.createElement('div', { className: 'mc-buttons mc-buttons--skip-only' },
            React.createElement('button', {
              className: 'mc-btn mc-btn--ghost',
              onClick: handleSkip,
              disabled: savingStep || animating
            }, 'Пропустить')
          ),

          isDailyLayout && !hideDailyFooter && React.createElement('div', { className: 'mc-daily-footer' },
            (liveInvalidReason || validationMessage) && React.createElement('div', {
              className: 'mc-daily-footer-reason',
              // Кадр «одна ошибка»: причина под кнопкой 600 11,5/1,45 тоном
              // --ac2 по центру. Стояло 13 — крупнее самой подписи полей.
              style: { textAlign: 'center', fontWeight: 600, fontSize: 11.5, color: '#a1471c', lineHeight: 1.45, marginBottom: 6 }
            }, liveInvalidReason || validationMessage),
            secondaryLabel && React.createElement('button', {
              type: 'button',
              className: 'mc-btn mc-btn--ghost mc-daily-footer-secondary',
              onClick: handleSecondary,
              disabled: savingStep || animating
            }, secondaryLabel),
            React.createElement('button', {
              type: 'button',
              className: 'mc-btn mc-btn--primary mc-daily-footer-primary',
              onClick: handleNext,
              disabled: dailyPrimaryDisabled
            }, savingStep
              ? 'Сохраняю...'
              : currentStepIndex === totalSteps - 1
                ? (resolvedNextLabel || finishLabel)
                : (resolvedNextLabel || 'Дальше')),
            dailySaveFail && React.createElement('div', {
              className: 'mc-daily-save-fail',
              style: {
                marginTop: 8,
                textAlign: 'center',
                font: '500 11.5px/1.45 Figtree, system-ui, sans-serif',
                color: 'var(--v4-bad-text, #a1471c)',
              },
            }, dailyRetryCountdown > 0
              ? `Не сохранилось. Попробуем ещё раз · попытка ${dailyRetryAttempt}, через ${dailyRetryCountdown} ${pluralSeconds(dailyRetryCountdown)}`
              : `Не сохранилось. Попробуем ещё раз · попытка ${dailyRetryAttempt}`)
          ),

          // Daily tip
          showTip && React.createElement('div', { className: 'mc-tip' }, dailyTip),

          (profileSaveFail || profileSaveOk || (savingStep && currentConfig?.id === 'profile-metabolism')) && React.createElement('div', {
            className: 'heys-wait-mark-overlay',
          }, HEYS.WaitMark?.render?.(React, {
            mode: 'screen',
            state: profileSaveFail ? 'fail' : profileSaveOk ? 'ok' : 'wait',
            title: profileSaveFail ? 'Профиль не сохранился' : profileSaveOk ? 'Сохранено' : 'Сохраняем профиль',
            text: profileSaveFail
              ? 'Ответы на месте, они на устройстве. Повторяем автоматически, пока облако не подтвердит запись.'
              : profileSaveOk ? 'Профиль обновлён.' : 'Пара секунд.',
            actions: profileSaveFail ? [
              // «сохранение»: номер попытки и время до следующей — иначе
              // «повторяем автоматически» остаётся обещанием без доказательства.
              React.createElement('div', {
                key: 'attempt',
                className: 'mc-profile-retry-status',
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minHeight: 44, padding: '14px 16px', borderRadius: 20,
                  background: '#f7efe2', color: 'rgba(0,0,0,.55)',
                  font: '600 11.5px/1.4 Figtree, system-ui, sans-serif', textAlign: 'center',
                },
              }, profileRetryCountdown > 0
                ? `Попытка ${profileRetryAttempt} · следующая через ${profileRetryCountdown} ${pluralSeconds(profileRetryCountdown)}`
                : `Попытка ${profileRetryAttempt} · повторяем`),
              React.createElement('button', {
                key: 'retry', type: 'button', className: 'heys-wait-mark__btn', onClick: handleNext,
              }, 'Повторить сейчас'),
            ] : null,
          }))
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
        handleClose();
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

    const forceClose = () => {
      hideStepModal({ scrollToDiary: options.scrollToDiary !== false });
      options.onClose && options.onClose();
    };

    const handleClose = () => {
      if (typeof options.onRequestClose === 'function') {
        options.onRequestClose(forceClose);
        return;
      }
      forceClose();
    };

    currentModalElement = React.createElement(StepModal, {
      ...options,
      onComplete: handleComplete,
      onClose: forceClose,
      onRequestClose: handleClose
    });

    // React 18: createRoot API
    if (!modalRootInstance) {
      modalRootInstance = ReactDOM.createRoot(modalRoot);
    }
    modalRootInstance.render(currentModalElement);
    requestAnimationFrame(() => {
      HEYS.BlankScreenGuard?.reportVisibleFrame?.({
        element: modalRoot?.querySelector?.('[data-heys-step-modal]'),
        screen: 'step-modal',
        reason: 'step_modal_painted'
      });
    });
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
