// heys_meal_step_v1.js — Шаги добавления приёма пищи через StepModal
// Двухшаговый flow: время+тип → оценки+комментарий
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.warn('[HEYS] MealStep: StepModal not loaded yet');
  }

  // === Утилиты ===
  const U = () => HEYS.utils || {};
  const lsGet = (key, def) => {
    const utils = U();
    if (utils.lsGet) return utils.lsGet(key, def);
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  };
  const lsSet = (key, val) => {
    const utils = U();
    if (utils.lsSet) {
      utils.lsSet(key, val);
    } else {
      localStorage.setItem(key, JSON.stringify(val));
    }
  };

  // Haptic feedback
  const haptic = (intensity = 10) => {
    if (navigator.vibrate) navigator.vibrate(intensity);
  };

  // Unique ID generator
  const uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Pad number to 2 digits
  const pad2 = (n) => String(n).padStart(2, '0');

  // === Константы ===
  
  // Типы приёмов пищи
  const MEAL_TYPES = HEYS.dayUtils?.MEAL_TYPES || {
    breakfast: { name: 'Завтрак', icon: '🍳', order: 1 },
    snack1:    { name: 'Перекус', icon: '🍎', order: 2 },
    lunch:     { name: 'Обед', icon: '🍲', order: 3 },
    snack2:    { name: 'Перекус', icon: '🥜', order: 4 },
    dinner:    { name: 'Ужин', icon: '🍽️', order: 5 },
    snack3:    { name: 'Перекус', icon: '🧀', order: 6 },
    night:     { name: 'Ночной приём', icon: '🌙', order: 7 }
  };

  // Emoji для оценок
  const MOOD_EMOJI = ['😢','😢','😕','😕','😐','😐','🙂','🙂','😊','😊','😄'];
  const WELLBEING_EMOJI = ['🤒','🤒','😓','😓','😐','😐','🙂','🙂','💪','💪','🏆'];
  const STRESS_EMOJI = ['😌','😌','🙂','🙂','😐','😐','😟','😟','😰','😰','😱'];

  // ============================================================
  // STEP 1: ВРЕМЯ И ТИП ПРИЁМА
  // ============================================================
  
  // Импортируем из dayUtils (единый источник правды)
  const dayU = HEYS.dayUtils || {};
  const NIGHT_HOUR_THRESHOLD = dayU.NIGHT_HOUR_THRESHOLD || 3;
  const HOURS_ORDER = dayU.HOURS_ORDER || (() => {
    const order = [];
    for (let h = 3; h < 24; h++) order.push(h);
    for (let h = 0; h < 3; h++) order.push(h);
    return order;
  })();
  const wheelIndexToHour = dayU.wheelIndexToHour || ((idx) => HOURS_ORDER[idx] ?? idx);
  const hourToWheelIndex = dayU.hourToWheelIndex || ((hour) => {
    const normalizedHour = hour >= 24 ? hour - 24 : hour;
    const idx = HOURS_ORDER.indexOf(normalizedHour);
    return idx >= 0 ? idx : 0;
  });
  
  function MealTimeStepComponent({ data, onChange, context }) {
    const { WheelPicker } = HEYS.StepModal;
    
    // Индекс колеса для часов (не реальный час!)
    // При инициализации берём текущий час и конвертируем в индекс
    const currentHourIndex = data.hourIndex ?? hourToWheelIndex(new Date().getHours());
    const minutes = data.minutes ?? Math.floor(new Date().getMinutes() / 5) * 5;
    const mealType = data.mealType ?? null; // null = авто
    
    // Реальный час для отображения и логики
    const realHours = wheelIndexToHour(currentHourIndex);
    
    // Значения для пикера часов (форматированные строки)
    const hoursValues = useMemo(() => HOURS_ORDER.map(h => pad2(h)), []);
    // Значения для пикера минут
    const minutesValues = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
    
    // Получаем существующие приёмы для определения типа
    const existingMeals = useMemo(() => {
      const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
      return dayData.meals || [];
    }, [context?.dateKey]);
    
    // Авто-определение типа приёма по времени
    const autoType = useMemo(() => {
      const timeStr = `${pad2(realHours)}:${pad2(minutes)}`;
      if (HEYS.dayUtils?.getMealTypeForPreview) {
        return HEYS.dayUtils.getMealTypeForPreview(timeStr, existingMeals);
      }
      // Fallback логика
      if (realHours >= 6 && realHours < 10) return 'breakfast';
      if (realHours >= 10 && realHours < 12) return 'snack1';
      if (realHours >= 12 && realHours < 15) return 'lunch';
      if (realHours >= 15 && realHours < 18) return 'snack2';
      if (realHours >= 18 && realHours < 21) return 'dinner';
      if (realHours >= 21 || realHours < 3) return 'night';
      return 'snack3';
    }, [realHours, minutes, existingMeals]);
    
    const currentType = mealType || autoType;
    const typeInfo = MEAL_TYPES[currentType] || MEAL_TYPES.snack1;
    
    // Подсказка для ночных часов (00-02)
    const isNightHour = realHours >= 0 && realHours < NIGHT_HOUR_THRESHOLD;
    
    // Форматированная текущая дата
    const dateLabel = useMemo(() => {
      const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
      const d = new Date(dateKey);
      return `${d.getDate()} ${d.toLocaleDateString('ru-RU', { month: 'short' })}`;
    }, [context?.dateKey]);
    
    // Обновление часов — сохраняем ИНДЕКС, не реальный час
    const updateHours = (v) => {
      // v — это строка вида "00", "01", ..., "23"
      const hourValue = parseInt(v, 10);
      const newIndex = HOURS_ORDER.indexOf(hourValue);
      haptic(5);
      onChange({ ...data, hourIndex: newIndex >= 0 ? newIndex : 0, minutes: data.minutes ?? minutes });
    };
    
    const updateMinutes = (v) => {
      haptic(5);
      onChange({ ...data, hourIndex: data.hourIndex ?? currentHourIndex, minutes: v });
    };
    
    const selectType = (type) => {
      haptic(10);
      onChange({ ...data, mealType: type });
    };
    
    // Текущее значение для пикера часов (форматированная строка)
    const currentHourValue = pad2(realHours);

    return React.createElement('div', { className: 'meal-time-step' },
      // Время
      React.createElement('div', { className: 'meal-time-display' },
        React.createElement('span', { className: 'meal-time-value' }, 
          `${pad2(realHours)}:${pad2(minutes)}`
        )
      ),
      
      // Wheel pickers
      React.createElement('div', { className: 'meal-time-pickers' },
        React.createElement(WheelPicker, {
          values: hoursValues,
          value: currentHourValue,
          onChange: updateHours,
          label: 'Часы'
        }),
        React.createElement('span', { className: 'meal-time-separator' }, ':'),
        React.createElement(WheelPicker, {
          values: minutesValues,
          value: minutes,
          onChange: updateMinutes,
          label: 'Минуты',
          suffix: ''
        })
      ),
      
      // Подсказка для ночных часов
      isNightHour && React.createElement('div', { className: 'meal-night-hint' },
        React.createElement('span', { className: 'meal-night-icon' }, '🌙'),
        React.createElement('span', { className: 'meal-night-text' }, 
          'Ночной приём — запишется в ', React.createElement('b', null, dateLabel)
        )
      ),
      
      // Выбор типа приёма
      React.createElement('div', { className: 'meal-type-section' },
        React.createElement('div', { className: 'meal-type-label' }, 'Тип приёма:'),
        React.createElement('div', { className: 'meal-type-grid' },
          Object.entries(MEAL_TYPES).map(([key, val]) =>
            React.createElement('button', {
              key,
              className: `meal-type-btn ${currentType === key ? 'active' : ''}`,
              onClick: () => selectType(key)
            },
              React.createElement('span', { className: 'meal-type-btn-icon' }, val.icon),
              React.createElement('span', { className: 'meal-type-btn-name' }, val.name)
            )
          )
        )
      )
    );
  }

  // ============================================================
  // STEP 2: ОЦЕНКИ + КОММЕНТАРИЙ
  // ============================================================
  
  function MealMoodStepComponent({ data, onChange, stepData, context }) {
    const mood = data.mood ?? 5;
    const wellbeing = data.wellbeing ?? 5;
    const stress = data.stress ?? 5;
    const comment = data.comment ?? '';
    
    // Состояние анимации эмодзи и чисел
    const [emojiAnim, setEmojiAnim] = useState({ mood: '', wellbeing: '', stress: '' });
    const [numAnim, setNumAnim] = useState({ mood: false, wellbeing: false, stress: false });
    
    // Confetti state
    const [showConfetti, setShowConfetti] = useState(false);
    
    // Ref для автофокуса на комментарий
    const commentRef = useRef(null);
    
    // === Динамический комментарий ===
    
    // Определяем общее состояние
    const positiveSignals = (mood >= 7 ? 1 : 0) + (wellbeing >= 7 ? 1 : 0) + (stress > 0 && stress <= 3 ? 1 : 0);
    const negativeSignals = (mood > 0 && mood <= 3 ? 1 : 0) + (wellbeing > 0 && wellbeing <= 3 ? 1 : 0) + (stress >= 7 ? 1 : 0);
    
    const moodState = negativeSignals >= 2 ? 'negative' :
                      negativeSignals === 1 && positiveSignals === 0 ? 'negative' :
                      positiveSignals >= 2 ? 'positive' :
                      positiveSignals === 1 && negativeSignals === 0 ? 'positive' :
                      'neutral';
    
    // Текст в зависимости от состояния
    const getJournalText = () => {
      if (moodState === 'negative') {
        if (stress >= 8 && mood <= 3 && wellbeing <= 3) return '😰 Тяжёлый момент — что происходит?';
        if (stress >= 8 && mood <= 3) return 'Стресс + плохое настроение — расскажи';
        if (stress >= 8 && wellbeing <= 3) return 'Стресс + плохое самочувствие — что случилось?';
        if (mood <= 3 && wellbeing <= 3) return 'И настроение, и самочувствие... что не так?';
        if (stress >= 7) return 'Что стрессует?';
        if (wellbeing <= 3) return 'Плохое самочувствие — что беспокоит?';
        if (mood <= 3) return 'Плохое настроение — что расстроило?';
        return 'Что случилось?';
      }
      if (moodState === 'positive') {
        if (mood >= 9 && wellbeing >= 9 && stress <= 2) return '🌟 Идеальное состояние! В чём секрет?';
        if (mood >= 8 && wellbeing >= 8) return '✨ Отлично себя чувствуешь! Что помогло?';
        if (mood >= 8 && stress <= 2) return 'Отличное настроение и спокойствие!';
        if (wellbeing >= 8 && stress <= 2) return 'Прекрасное самочувствие! Что способствует?';
        if (mood >= 7) return 'Хорошее настроение! Что порадовало?';
        if (wellbeing >= 7) return 'Хорошое самочувствие! Запиши причину';
        if (stress <= 2) return 'Спокойствие — что помогает расслабиться?';
        return 'Запиши что порадовало!';
      }
      if (mood >= 5 && mood <= 6 && wellbeing >= 5 && wellbeing <= 6) return 'Стабильный день — любые мысли?';
      if (stress >= 4 && stress <= 6) return 'Немного напряжения — хочешь записать?';
      return 'Заметка о приёме пищи';
    };
    
    const getPlaceholder = () => {
      if (moodState === 'negative') {
        if (stress >= 7) return 'Работа, отношения, здоровье...';
        if (wellbeing <= 3) return 'Симптомы, усталость, боль...';
        if (mood <= 3) return 'Что расстроило или разозлило...';
        return 'Расскажи что не так...';
      }
      if (moodState === 'positive') {
        if (mood >= 8 && wellbeing >= 8) return 'Что сделало день отличным?';
        if (stress <= 2) return 'Медитация, прогулка, отдых...';
        return 'Что сделало момент хорошим?';
      }
      return 'Любые мысли о еде или дне...';
    };
    
    // Quick chips
    const getQuickChips = () => {
      if (moodState === 'negative') {
        if (stress >= 7) return ['Работа', 'Дедлайн', 'Конфликт', 'Усталость'];
        if (wellbeing <= 3) return ['Голова', 'Живот', 'Слабость', 'Недосып'];
        if (mood <= 3) return ['Тревога', 'Грусть', 'Злость', 'Апатия'];
        return ['Устал', 'Стресс', 'Плохо спал'];
      }
      if (moodState === 'positive') {
        if (mood >= 8) return ['Радость', 'Успех', 'Встреча', 'Природа'];
        if (stress <= 2) return ['Отдых', 'Медитация', 'Прогулка', 'Спорт'];
        return ['Хороший день', 'Энергия', 'Мотивация'];
      }
      return [];
    };
    
    const chips = getQuickChips();
    
    // Цвета для слайдеров
    const getPositiveColor = (v) => {
      if (v <= 3) return '#ef4444';
      if (v <= 5) return '#3b82f6';
      if (v <= 7) return '#22c55e';
      return '#10b981';
    };
    
    const getNegativeColor = (v) => {
      if (v <= 3) return '#10b981';
      if (v <= 5) return '#3b82f6';
      if (v <= 7) return '#eab308';
      return '#ef4444';
    };
    
    // Confetti при идеальных оценках
    const triggerConfetti = useCallback(() => {
      if (!showConfetti) {
        setShowConfetti(true);
        haptic([50, 50, 50, 50, 100]);
        setTimeout(() => setShowConfetti(false), 2000);
      }
    }, [showConfetti]);
    
    // Обработчик изменения слайдера
    const handleSliderChange = (field, value) => {
      haptic(value >= 8 || value <= 2 ? 15 : 10);
      
      // Анимация emoji
      const animType = (field === 'stress' && value >= 7) || 
                       ((field === 'mood' || field === 'wellbeing') && value <= 3) 
                       ? 'shake' : 'bounce';
      setEmojiAnim(prev => ({...prev, [field]: animType}));
      setTimeout(() => setEmojiAnim(prev => ({...prev, [field]: ''})), 400);
      
      // Анимация числа (bounce)
      setNumAnim(prev => ({...prev, [field]: true}));
      setTimeout(() => setNumAnim(prev => ({...prev, [field]: false})), 200);
      
      const newData = {...data, [field]: value};
      onChange(newData);
      
      // Автофокус на комментарий при негативных оценках
      if ((field === 'mood' && value <= 3) || (field === 'stress' && value >= 8)) {
        setTimeout(() => commentRef.current?.focus(), 300);
      }
      
      // Проверяем идеальные оценки для confetti
      const isPerfect = (field === 'mood' ? value : mood) >= 8 && 
                        (field === 'wellbeing' ? value : wellbeing) >= 8 && 
                        (field === 'stress' ? value : stress) > 0 && 
                        (field === 'stress' ? value : stress) <= 2;
      if (isPerfect) triggerConfetti();
    };
    
    // Добавить chip в комментарий
    const addChip = (chip) => {
      haptic(5);
      const newComment = comment ? comment + ', ' + chip : chip;
      onChange({ ...data, comment: newComment });
    };
    
    // Пресеты для быстрого выбора
    const handlePreset = (field, value) => {
      haptic(10);
      handleSliderChange(field, value);
    };
    
    // Получить текст для значения
    const getMoodText = (v) => v <= 2 ? 'Плохо' : v <= 4 ? 'Так себе' : v <= 6 ? 'Норм' : v <= 8 ? 'Хорошо' : 'Отлично';
    const getWellbeingText = (v) => v <= 2 ? 'Плохо' : v <= 4 ? 'Слабость' : v <= 6 ? 'Норм' : v <= 8 ? 'Хорошо' : 'Отлично';
    const getStressText = (v) => v <= 2 ? 'Спокоен' : v <= 4 ? 'Немного' : v <= 6 ? 'Средне' : v <= 8 ? 'Много' : 'Очень';
    
    // Цвет фона карточки по значению (позитивная шкала)
    const getCardBg = (v) => {
      if (v <= 2) return 'rgba(239, 68, 68, 0.08)';
      if (v <= 4) return 'rgba(245, 158, 11, 0.08)';
      if (v <= 6) return 'rgba(59, 130, 246, 0.06)';
      if (v <= 8) return 'rgba(34, 197, 94, 0.08)';
      return 'rgba(16, 185, 129, 0.12)';
    };
    // Цвет фона для стресса (инверсная шкала)
    const getStressCardBg = (v) => {
      if (v <= 2) return 'rgba(16, 185, 129, 0.12)';
      if (v <= 4) return 'rgba(34, 197, 94, 0.08)';
      if (v <= 6) return 'rgba(59, 130, 246, 0.06)';
      if (v <= 8) return 'rgba(245, 158, 11, 0.08)';
      return 'rgba(239, 68, 68, 0.08)';
    };
    
    // Общий индикатор состояния
    const getOverallStatus = () => {
      const avg = (mood + wellbeing + (11 - stress)) / 3;
      if (avg >= 8) return { emoji: '🌟', text: 'Отличное состояние!' };
      if (avg >= 6.5) return { emoji: '😊', text: 'Хорошее состояние' };
      if (avg >= 5) return { emoji: '😐', text: 'Нормальное состояние' };
      if (avg >= 3.5) return { emoji: '😕', text: 'Не лучший момент' };
      return { emoji: '😔', text: 'Тяжёлый момент' };
    };
    const overallStatus = getOverallStatus();
    
    // Пресеты для быстрого выбора
    const PRESETS_POSITIVE = [
      { emoji: '👎', value: 2, label: 'Плохо' },
      { emoji: '👌', value: 5, label: 'Норм' },
      { emoji: '👍', value: 8, label: 'Хорошо' }
    ];
    const PRESETS_NEGATIVE = [
      { emoji: '😌', value: 2, label: 'Спокоен' },
      { emoji: '😐', value: 5, label: 'Средне' },
      { emoji: '😰', value: 8, label: 'Стресс' }
    ];

    return React.createElement('div', { className: 'meal-mood-step' },
      // Общий индикатор состояния
      React.createElement('div', { className: 'meal-overall-status' },
        React.createElement('span', { className: 'meal-overall-emoji' }, overallStatus.emoji),
        React.createElement('span', { className: 'meal-overall-text' }, overallStatus.text)
      ),
      
      // Confetti
      showConfetti && React.createElement('div', { className: 'confetti-container' },
        ...Array(20).fill(0).map((_, i) => 
          React.createElement('div', { 
            key: 'confetti-' + i, 
            className: 'confetti-piece',
            style: {
              left: (5 + Math.random() * 90) + '%',
              animationDelay: (Math.random() * 0.5) + 's',
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][i % 5]
            }
          })
        )
      ),
      
      // Три карточки оценок — компактный layout
      React.createElement('div', { className: 'meal-ratings-grid' },
        
        // === Настроение ===
        React.createElement('div', { 
          className: 'meal-rating-card',
          style: { background: getCardBg(mood) }
        },
          React.createElement('div', { className: 'meal-rating-row-main' },
            // Emoji слева
            React.createElement('span', { 
              className: `meal-rating-emoji-lg ${emojiAnim.mood}`,
            }, MOOD_EMOJI[mood] || '😐'),
            // Инфо справа
            React.createElement('div', { className: 'meal-rating-info' },
              React.createElement('div', { className: 'meal-rating-title' }, 'Настроение'),
              React.createElement('div', { className: 'meal-rating-value-row' },
                React.createElement('span', { 
                  className: `meal-rating-num ${numAnim.mood ? 'num-bounce' : ''}`,
                  style: { color: getPositiveColor(mood) }
                }, mood),
                React.createElement('span', { className: 'meal-rating-max' }, '/10'),
                React.createElement('span', { className: 'meal-rating-text' }, getMoodText(mood))
              )
            ),
            // Пресеты справа
            React.createElement('div', { className: 'meal-rating-presets' },
              PRESETS_POSITIVE.map(p => 
                React.createElement('button', {
                  key: p.value,
                  className: `meal-preset-btn ${mood === p.value ? 'active' : ''}`,
                  onClick: () => handleSliderChange('mood', p.value),
                  title: p.label
                }, p.emoji)
              )
            )
          ),
          // Слайдер
          React.createElement('input', {
            type: 'range',
            className: 'mood-slider mood-slider-positive',
            min: 1, max: 10, value: mood,
            onChange: (e) => handleSliderChange('mood', Number(e.target.value))
          })
        ),
        
        // === Самочувствие ===
        React.createElement('div', { 
          className: 'meal-rating-card',
          style: { background: getCardBg(wellbeing) }
        },
          React.createElement('div', { className: 'meal-rating-row-main' },
            React.createElement('span', { 
              className: `meal-rating-emoji-lg ${emojiAnim.wellbeing}`,
            }, WELLBEING_EMOJI[wellbeing] || '😐'),
            React.createElement('div', { className: 'meal-rating-info' },
              React.createElement('div', { className: 'meal-rating-title' }, 'Самочувствие'),
              React.createElement('div', { className: 'meal-rating-value-row' },
                React.createElement('span', { 
                  className: `meal-rating-num ${numAnim.wellbeing ? 'num-bounce' : ''}`,
                  style: { color: getPositiveColor(wellbeing) }
                }, wellbeing),
                React.createElement('span', { className: 'meal-rating-max' }, '/10'),
                React.createElement('span', { className: 'meal-rating-text' }, getWellbeingText(wellbeing))
              )
            ),
            React.createElement('div', { className: 'meal-rating-presets' },
              PRESETS_POSITIVE.map(p => 
                React.createElement('button', {
                  key: p.value,
                  className: `meal-preset-btn ${wellbeing === p.value ? 'active' : ''}`,
                  onClick: () => handleSliderChange('wellbeing', p.value),
                  title: p.label
                }, p.emoji)
              )
            )
          ),
          React.createElement('input', {
            type: 'range',
            className: 'mood-slider mood-slider-positive',
            min: 1, max: 10, value: wellbeing,
            onChange: (e) => handleSliderChange('wellbeing', Number(e.target.value))
          })
        ),
        
        // === Стресс ===
        React.createElement('div', { 
          className: 'meal-rating-card',
          style: { background: getStressCardBg(stress) }
        },
          React.createElement('div', { className: 'meal-rating-row-main' },
            React.createElement('span', { 
              className: `meal-rating-emoji-lg ${emojiAnim.stress}`,
            }, STRESS_EMOJI[stress] || '😐'),
            React.createElement('div', { className: 'meal-rating-info' },
              React.createElement('div', { className: 'meal-rating-title' }, 'Стресс'),
              React.createElement('div', { className: 'meal-rating-value-row' },
                React.createElement('span', { 
                  className: `meal-rating-num ${numAnim.stress ? 'num-bounce' : ''}`,
                  style: { color: getNegativeColor(stress) }
                }, stress),
                React.createElement('span', { className: 'meal-rating-max' }, '/10'),
                React.createElement('span', { className: 'meal-rating-text' }, getStressText(stress))
              )
            ),
            React.createElement('div', { className: 'meal-rating-presets' },
              PRESETS_NEGATIVE.map(p => 
                React.createElement('button', {
                  key: p.value,
                  className: `meal-preset-btn ${stress === p.value ? 'active' : ''}`,
                  onClick: () => handleSliderChange('stress', p.value),
                  title: p.label
                }, p.emoji)
              )
            )
          ),
          React.createElement('input', {
            type: 'range',
            className: 'mood-slider mood-slider-negative',
            min: 1, max: 10, value: stress,
            onChange: (e) => handleSliderChange('stress', Number(e.target.value))
          })
        )
      ),
      
      // Динамический комментарий
      React.createElement('div', { 
        className: `meal-comment-section meal-comment-${moodState}`
      },
        React.createElement('div', { className: 'meal-comment-header' },
          React.createElement('span', { className: 'meal-comment-icon' }, 
            moodState === 'negative' ? '📝' : moodState === 'positive' ? '✨' : '💭'
          ),
          React.createElement('span', { className: 'meal-comment-title' }, getJournalText())
        ),
        
        // Quick chips — всегда рендерим контейнер для стабильной высоты
        React.createElement('div', { className: 'meal-comment-chips' },
          chips.map(chip => 
            React.createElement('button', {
              key: chip,
              className: 'meal-comment-chip',
              onClick: () => addChip(chip)
            }, chip)
          )
        ),
        
        // Input
        React.createElement('input', {
          ref: commentRef,
          type: 'text',
          className: 'meal-comment-input',
          placeholder: getPlaceholder(),
          value: comment,
          onChange: (e) => onChange({ ...data, comment: e.target.value })
        })
      )
    );
  }

  // ============================================================
  // РЕГИСТРАЦИЯ ШАГОВ
  // ============================================================
  
  if (HEYS.StepModal) {
    const { registerStep } = HEYS.StepModal;
    
    // Шаг 1: Время и тип
    registerStep('mealTime', {
      title: 'Время приёма',
      hint: 'Выберите время и тип',
      icon: '🕐',
      component: MealTimeStepComponent,
      getInitialData: (ctx) => {
        const now = new Date();
        return {
          hours: now.getHours(),
          minutes: Math.floor(now.getMinutes() / 5) * 5,
          mealType: null // авто
        };
      },
      validate: () => true
    });
    
    // Шаг 2: Оценки и комментарий
    registerStep('mealMood', {
      title: 'Самочувствие',
      hint: 'Как вы себя чувствуете?',
      icon: '😊',
      component: MealMoodStepComponent,
      getInitialData: (ctx) => {
        // Берём оценки из предыдущего приёма если есть
        const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
        const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
        const meals = dayData.meals || [];
        
        if (meals.length > 0) {
          const lastMeal = meals[meals.length - 1];
          return {
            mood: lastMeal.mood || 5,
            wellbeing: lastMeal.wellbeing || 5,
            stress: lastMeal.stress || 5,
            comment: ''
          };
        }
        
        return { mood: 5, wellbeing: 5, stress: 5, comment: '' };
      },
      validate: () => true
    });
  }

  // ============================================================
  // API: СОЗДАНИЕ ПРИЁМА
  // ============================================================
  
  /**
   * Показать модалку добавления приёма пищи
   * @param {Object} options
   * @param {string} options.dateKey - Дата (YYYY-MM-DD)
   * @param {Function} options.onComplete - Callback после создания
   */
  function showAddMealModal(options = {}) {
    const dateKey = options.dateKey || new Date().toISOString().slice(0, 10);
    
    HEYS.StepModal.show({
      steps: ['mealTime', 'mealMood'],
      title: 'Новый приём',
      showProgress: true,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      context: { dateKey },
      onComplete: (stepData) => {
        // Создаём приём
        const timeData = stepData.mealTime || {};
        const moodData = stepData.mealMood || {};
        
        // Конвертируем индекс колеса в реальный час
        // Если hourIndex не установлен (пользователь не трогал пикер), 
        // используем текущий час как fallback
        const defaultHourIndex = hourToWheelIndex(new Date().getHours());
        const hourIndex = timeData.hourIndex ?? defaultHourIndex;
        let realHours = wheelIndexToHour(hourIndex);
        
        // Ночные часы (00-02) записываем как 24-26 для правильной сортировки
        if (realHours < NIGHT_HOUR_THRESHOLD) {
          realHours += 24; // 00:20 → 24:20
        }
        const timeStr = `${pad2(realHours)}:${pad2(timeData.minutes || 0)}`;
        
        const newMeal = {
          id: uid('m_'),
          name: 'Приём',
          time: timeStr,
          mealType: timeData.mealType || null,
          mood: moodData.mood || 5,
          wellbeing: moodData.wellbeing || 5,
          stress: moodData.stress || 5,
          items: []
        };
        
        // Сохраняем комментарий если есть
        if (moodData.comment && moodData.comment.trim()) {
          newMeal.comment = moodData.comment.trim();
        }
        
        // НЕ сохраняем в localStorage напрямую!
        // DayTab сам добавит meal в свой state и сохранит через autosave
        // Это избегает race condition между модалкой и DayTab
        
        // Callback — передаём только newMeal, DayTab сам обновит state
        if (options.onComplete) {
          options.onComplete(newMeal);
        }
      },
      onClose: options.onClose
    });
  }
  
  // Вспомогательная функция для сортировки
  function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    // Ночные часы (00-02) — это "после полуночи"
    const hours = h < 3 ? h + 24 : h;
    return hours * 60 + m;
  }

  // === Экспорт ===
  HEYS.MealStep = {
    showAddMeal: showAddMealModal,
    TimeStep: MealTimeStepComponent,
    MoodStep: MealMoodStepComponent
  };

})(typeof window !== 'undefined' ? window : global);
