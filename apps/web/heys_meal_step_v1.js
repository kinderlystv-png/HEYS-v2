// heys_meal_step_v1.js — Шаги добавления приёма пищи через StepModal
// Двухшаговый flow: время+тип → оценки+комментарий
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.warn('[HEYS] MealStep: StepModal not loaded yet');
  }

  // Используем общие утилиты из StepModal
  const { lsGet, lsSet } = HEYS.StepModal?.utils || {};
  
  // Fallback если StepModal ещё не загружен
  const safeLsGet = lsGet || ((key, def) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  });
  
  const safeLsSet = lsSet || ((key, val) => {
    localStorage.setItem(key, JSON.stringify(val));
  });

  // Haptic feedback
  const haptic = (intensity = 10) => {
    if (navigator.vibrate) navigator.vibrate(intensity);
  };

  // Unique ID generator
  const uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Pad number to 2 digits
  const pad2 = (n) => String(n).padStart(2, '0');

  // ============================================================
  // ХЕЛПЕРЫ ВРЕМЕНИ
  // ============================================================

  /**
   * Конвертирует время в минуты для сортировки
   * Ночные часы (00-02) считаются как "после полуночи" (24-26)
   */
  function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const hours = h < 3 ? h + 24 : h;
    return hours * 60 + m;
  }

  /**
   * Определяет тип приёма пищи по часу
   */
  function getMealTypeByHour(hour) {
    const h = hour >= 24 ? hour - 24 : hour;
    if (h >= 6 && h < 10) return 'breakfast';
    if (h >= 10 && h < 12) return 'snack1';
    if (h >= 12 && h < 15) return 'lunch';
    if (h >= 15 && h < 18) return 'snack2';
    if (h >= 18 && h < 21) return 'dinner';
    if (h >= 21 || h < 3) return 'night';
    return 'snack3';
  }

  /**
   * Нормализует часы для хранения (ночные 00-02 → 24-26)
   */
  function normalizeHoursForStorage(hours, nightThreshold = 3) {
    return hours < nightThreshold ? hours + 24 : hours;
  }

  /**
   * Денормализует часы для отображения (24-26 → 00-02)
   */
  function normalizeHoursForDisplay(hours) {
    return hours >= 24 ? hours - 24 : hours;
  }

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

  // Пресеты для быстрого выбора оценок
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

  // ============================================================
  // ХЕЛПЕРЫ ДЛЯ ДИНАМИЧЕСКОГО КОММЕНТАРИЯ
  // ============================================================

  /**
   * Определяет общее эмоциональное состояние по оценкам
   */
  function getMoodState(mood, wellbeing, stress) {
    const positiveSignals = (mood >= 7 ? 1 : 0) + (wellbeing >= 7 ? 1 : 0) + (stress > 0 && stress <= 3 ? 1 : 0);
    const negativeSignals = (mood > 0 && mood <= 3 ? 1 : 0) + (wellbeing > 0 && wellbeing <= 3 ? 1 : 0) + (stress >= 7 ? 1 : 0);
    
    if (negativeSignals >= 2) return 'negative';
    if (negativeSignals === 1 && positiveSignals === 0) return 'negative';
    if (positiveSignals >= 2) return 'positive';
    if (positiveSignals === 1 && negativeSignals === 0) return 'positive';
    return 'neutral';
  }

  /**
   * Возвращает текст-заголовок для секции комментария
   */
  function getJournalText(moodState, mood, wellbeing, stress) {
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
  }

  /**
   * Возвращает placeholder для input комментария
   */
  function getPlaceholder(moodState, mood, wellbeing, stress) {
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
  }

  /**
   * Возвращает quick chips для быстрого добавления в комментарий
   */
  function getQuickChips(moodState, mood, wellbeing, stress) {
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
  }

  // ============================================================
  // ХЕЛПЕРЫ ЦВЕТОВ И ТЕКСТОВ
  // ============================================================

  // Цвета для позитивных шкал (mood, wellbeing)
  const getPositiveColor = (v) => {
    if (v <= 3) return '#ef4444';
    if (v <= 5) return '#3b82f6';
    if (v <= 7) return '#22c55e';
    return '#10b981';
  };

  // Цвета для негативных шкал (stress)
  const getNegativeColor = (v) => {
    if (v <= 3) return '#10b981';
    if (v <= 5) return '#3b82f6';
    if (v <= 7) return '#eab308';
    return '#ef4444';
  };

  // Цвет фона карточки (позитивная шкала)
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

  // Текст для значений оценок
  const getMoodText = (v) => v <= 2 ? 'Плохо' : v <= 4 ? 'Так себе' : v <= 6 ? 'Норм' : v <= 8 ? 'Хорошо' : 'Отлично';
  const getWellbeingText = (v) => v <= 2 ? 'Плохо' : v <= 4 ? 'Слабость' : v <= 6 ? 'Норм' : v <= 8 ? 'Хорошо' : 'Отлично';
  const getStressText = (v) => v <= 2 ? 'Спокоен' : v <= 4 ? 'Немного' : v <= 6 ? 'Средне' : v <= 8 ? 'Много' : 'Очень';

  // Общий индикатор состояния
  const getOverallStatus = (mood, wellbeing, stress) => {
    const avg = (mood + wellbeing + (11 - stress)) / 3;
    if (avg >= 8) return { emoji: '🌟', text: 'Отличное состояние!' };
    if (avg >= 6.5) return { emoji: '😊', text: 'Хорошее состояние' };
    if (avg >= 5) return { emoji: '😐', text: 'Нормальное состояние' };
    if (avg >= 3.5) return { emoji: '😕', text: 'Не лучший момент' };
    return { emoji: '😔', text: 'Тяжёлый момент' };
  };

  // ============================================================
  // КОМПОНЕНТ: MoodSparkline — мини-график настроения за день
  // ============================================================

  function MoodSparkline({ data, currentAvg }) {
    const sparklineData = [...data.map(m => m.avg), currentAvg];
    if (sparklineData.length < 2) return null;

    const width = 120;
    const height = 24;
    const padding = 2;
    const sparkMax = 10;
    const sparkMin = 0;

    const points = sparklineData.map((v, i) => {
      const x = padding + (i / (sparklineData.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - sparkMin) / (sparkMax - sparkMin)) * (height - padding * 2);
      return { x, y, v };
    });
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    return React.createElement('svg', {
      className: 'meal-mood-sparkline',
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: 'none'
    },
      React.createElement('path', {
        d: pathD,
        fill: 'none',
        stroke: '#3b82f6',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }),
      ...points.map((p, i) =>
        React.createElement('circle', {
          key: i,
          cx: p.x,
          cy: p.y,
          r: i === points.length - 1 ? 4 : 3,
          fill: i === points.length - 1 ? '#10b981' : (p.v >= 6 ? '#22c55e' : p.v >= 4 ? '#eab308' : '#ef4444'),
          stroke: 'white',
          strokeWidth: 1.5
        })
      )
    );
  }

  // ============================================================
  // КОМПОНЕНТ: RatingCard — универсальная карточка оценки
  // ============================================================

  function RatingCard({
    field,
    value,
    emoji,
    title,
    presets,
    getColor,
    getBg,
    getText,
    emojiAnim,
    numAnim,
    emojiTap,
    showPulse,
    onSliderChange,
    onEmojiTap,
    isNegative = false
  }) {
    return React.createElement('div', {
      className: 'meal-rating-card',
      style: { background: getBg(value) }
    },
      React.createElement('div', { className: 'meal-rating-row-main' },
        // Emoji слева (с тапом)
        React.createElement('span', {
          className: `meal-rating-emoji-lg ${emojiAnim} ${emojiTap ? 'emoji-tap' : ''}`,
          onClick: () => onEmojiTap(field)
        }, emoji),
        // Инфо справа
        React.createElement('div', { className: 'meal-rating-info' },
          React.createElement('div', { className: 'meal-rating-title' }, title),
          React.createElement('div', { className: 'meal-rating-value-row' },
            React.createElement('span', {
              className: `meal-rating-num ${numAnim ? 'num-bounce' : ''}`,
              style: { color: getColor(value) }
            }, value),
            React.createElement('span', { className: 'meal-rating-max' }, '/10'),
            React.createElement('span', { className: 'meal-rating-text' }, getText(value))
          )
        ),
        // Пресеты справа
        React.createElement('div', { className: `meal-rating-presets ${showPulse ? 'presets-pulse' : ''}` },
          presets.map(p =>
            React.createElement('button', {
              key: p.value,
              className: `meal-preset-btn ${value === p.value ? 'active' : ''}`,
              onClick: () => onSliderChange(field, p.value),
              title: p.label
            }, p.emoji)
          )
        )
      ),
      // Слайдер
      React.createElement('input', {
        type: 'range',
        className: `mood-slider ${isNegative ? 'mood-slider-negative' : 'mood-slider-positive'}`,
        min: 1,
        max: 10,
        value: value,
        onChange: (e) => onSliderChange(field, Number(e.target.value)),
        onTouchStart: (e) => e.stopPropagation(),
        onTouchEnd: (e) => e.stopPropagation(),
        onTouchMove: (e) => e.stopPropagation()
      })
    );
  }

  // ============================================================
  // КОМПОНЕНТ: MealTypeGrid — сетка выбора типа приёма
  // ============================================================

  function MealTypeGrid({ types, currentType, onSelect }) {
    return React.createElement('div', { className: 'meal-type-section' },
      React.createElement('div', { className: 'meal-type-label' }, 'Тип приёма:'),
      React.createElement('div', { className: 'meal-type-grid' },
        Object.entries(types).map(([key, val]) =>
          React.createElement('button', {
            key,
            className: `meal-type-btn ${currentType === key ? 'active' : ''}`,
            onClick: () => onSelect(key)
          },
            React.createElement('span', { className: 'meal-type-btn-icon' }, val.icon),
            React.createElement('span', { className: 'meal-type-btn-name' }, val.name)
          )
        )
      )
    );
  }

  // ============================================================
  // КОМПОНЕНТ: ConfettiEffect — эффект конфетти
  // ============================================================

  const CONFETTI_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#3b82f6'];

  function ConfettiEffect({ show, count = 20 }) {
    if (!show) return null;
    return React.createElement('div', { className: 'confetti-container' },
      ...Array(count).fill(0).map((_, i) => 
        React.createElement('div', { 
          key: 'confetti-' + i, 
          className: 'confetti-piece',
          style: {
            left: (5 + Math.random() * 90) + '%',
            animationDelay: (Math.random() * 0.5) + 's',
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length]
          }
        })
      )
    );
  }

  // ============================================================
  // КОМПОНЕНТ: NightHint — подсказка для ночных часов
  // ============================================================

  function NightHint({ isNightHour, dateLabel }) {
    if (!isNightHour) return null;
    return React.createElement('div', { className: 'meal-night-hint' },
      React.createElement('span', { className: 'meal-night-icon' }, '🌙'),
      React.createElement('span', { className: 'meal-night-text' }, 
        'Ночной приём — запишется в ', React.createElement('b', null, dateLabel)
      )
    );
  }

  // ============================================================
  // КОМПОНЕНТ: MoodHistorySection — история настроения за день
  // ============================================================

  function MoodHistorySection({ todayMoods, currentAvg }) {
    if (todayMoods.length === 0) return null;
    
    return React.createElement('div', { className: 'meal-mood-history' },
      React.createElement('div', { className: 'meal-mood-history-header' },
        React.createElement('span', { className: 'meal-mood-history-label' }, 'Сегодня'),
        React.createElement(MoodSparkline, { data: todayMoods, currentAvg })
      ),
      React.createElement('div', { className: 'meal-mood-history-items' },
        ...todayMoods.map((m, i) => 
          React.createElement('div', { 
            key: i, 
            className: 'meal-mood-history-item',
            title: `😊${m.mood} 💪${m.wellbeing} 😰${m.stress}`
          },
            React.createElement('span', { className: 'meal-mood-history-name' }, m.name),
            React.createElement('span', { 
              className: 'meal-mood-history-avg',
              style: { color: m.avg >= 6 ? '#22c55e' : m.avg >= 4 ? '#eab308' : '#ef4444' }
            }, m.avg.toFixed(1))
          )
        ),
        // Текущий
        React.createElement('div', { className: 'meal-mood-history-item meal-mood-history-current' },
          React.createElement('span', { className: 'meal-mood-history-name' }, 'Сейчас'),
          React.createElement('span', { 
            className: 'meal-mood-history-avg',
            style: { color: '#3b82f6', fontWeight: 600 }
          }, currentAvg.toFixed(1))
        )
      )
    );
  }

  // ============================================================
  // КОМПОНЕНТ: CommentSection — секция динамического комментария
  // ============================================================

  function CommentSection({ moodState, mood, wellbeing, stress, comment, chips, onAddChip, onChangeComment, commentRef }) {
    const icon = moodState === 'negative' ? '📝' : moodState === 'positive' ? '✨' : '💭';
    
    return React.createElement('div', { 
      className: `meal-comment-section meal-comment-${moodState}`
    },
      React.createElement('div', { className: 'meal-comment-header' },
        React.createElement('span', { className: 'meal-comment-icon' }, icon),
        React.createElement('span', { className: 'meal-comment-title' }, getJournalText(moodState, mood, wellbeing, stress))
      ),
      
      // Quick chips
      React.createElement('div', { className: 'meal-comment-chips' },
        chips.map(chip => 
          React.createElement('button', {
            key: chip,
            className: 'meal-comment-chip',
            onClick: () => onAddChip(chip)
          }, chip)
        )
      ),
      
      // Input
      React.createElement('input', {
        ref: commentRef,
        type: 'text',
        className: 'meal-comment-input',
        placeholder: getPlaceholder(moodState, mood, wellbeing, stress),
        value: comment,
        onChange: (e) => onChangeComment(e.target.value)
      })
    );
  }

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
    const { TimePicker } = HEYS.StepModal;
    const insulinWave = HEYS.InsulinWave;
    const analytics = HEYS.analytics;
    const isEditMode = context?.mealIndex !== undefined || context?.initialHourIndex !== undefined;
    const [hasShownWarning, setHasShownWarning] = useState(false);
    const [warningOpen, setWarningOpen] = useState(false);
    const [cachedWave, setCachedWave] = useState(null);
    
    // Индекс колеса для часов (не реальный час!)
    // При редактировании берём из context, иначе текущий час
    const defaultHourIndex = context?.initialHourIndex ?? hourToWheelIndex(new Date().getHours());
    const defaultMinutes = context?.initialMinutes ?? Math.floor(new Date().getMinutes() / 5) * 5;
    const defaultMealType = context?.initialMealType ?? null;
    
    const currentHourIndex = data.hourIndex ?? defaultHourIndex;
    const minutes = data.minutes ?? defaultMinutes;
    const mealType = data.mealType ?? defaultMealType;
    
    // Больше не нужен hourIndexRef — используем onTimeChange для linkedScroll
    
    // Реальный час для отображения и логики
    const realHours = wheelIndexToHour(currentHourIndex);
    
    // Значения для пикера часов (особый порядок: 04-23, 00-03)
    const hoursValues = HOURS_ORDER;
    // Значения для пикера минут (0, 5, 10... 55)
    const minutesValues = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
    
    // Получаем существующие приёмы для определения типа
    const existingMeals = useMemo(() => {
      const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
      const dayData = safeLsGet(`heys_dayv2_${dateKey}`, null);
      // Защита от null — день может ещё не существовать (завтра, будущие даты)
      return dayData?.meals || [];
    }, [context?.dateKey]);
    
    // Авто-определение типа приёма по времени
    const autoType = useMemo(() => {
      const timeStr = `${pad2(realHours)}:${pad2(minutes)}`;
      if (HEYS.dayUtils?.getMealTypeForPreview) {
        return HEYS.dayUtils.getMealTypeForPreview(timeStr, existingMeals);
      }
      // Fallback — используем вынесенный хелпер
      return getMealTypeByHour(realHours);
    }, [realHours, minutes, existingMeals]);
    
    const currentType = mealType || autoType;
    
    // Подсказка для ночных часов (00-02)
    const isNightHour = realHours >= 0 && realHours < NIGHT_HOUR_THRESHOLD;
    
    // Форматированная текущая дата
    const dateLabel = useMemo(() => {
      const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
      const d = new Date(dateKey);
      return `${d.getDate()} ${d.toLocaleDateString('ru-RU', { month: 'short' })}`;
    }, [context?.dateKey]);
    
    // Обновление часов — сохраняем ИНДЕКС, не реальный час (haptic уже в TimePicker)
    const updateHours = (hourValue) => {
      // hourValue — это число (час) из HOURS_ORDER
      const newIndex = HOURS_ORDER.indexOf(hourValue);
      onChange({ ...data, hourIndex: newIndex >= 0 ? newIndex : 0, minutes: data.minutes ?? minutes });
      // Предупреждение о волне теперь показывается при переходе на следующий шаг, не при касании колеса
    };
    
    const updateMinutes = (newMinutes) => {
      onChange({ ...data, hourIndex: currentHourIndex, minutes: newMinutes });
      // Предупреждение о волне теперь показывается при переходе на следующий шаг, не при касании колеса
    };

    // Единый callback для linkedScroll — решает проблему React batching
    const updateTime = (hourValue, newMinutes) => {
      const newIndex = HOURS_ORDER.indexOf(hourValue);
      onChange({ ...data, hourIndex: newIndex >= 0 ? newIndex : 0, minutes: newMinutes });
      // Предупреждение о волне теперь показывается при переходе на следующий шаг, не при касании колеса
    };
    
    const selectType = (type) => {
      haptic(10);
      onChange({ ...data, mealType: type });
    };

    // === Инсулиновая волна — предупреждение ===
    const isBulkMode = useMemo(() => {
      const deficit = context?.deficitPct;
      const profDeficit = context?.prof?.deficitPctTarget;
      const dayDeficit = context?.dayData?.deficitPct;
      const val = deficit ?? dayDeficit ?? profDeficit ?? 0;
      return typeof val === 'number' && val >= 10;
    }, [context?.deficitPct, context?.prof?.deficitPctTarget, context?.dayData?.deficitPct]);

    const mealsForWave = useMemo(() => {
      if (context?.meals && Array.isArray(context.meals)) return context.meals;
      return existingMeals;
    }, [context?.meals, existingMeals]);

    const trainingsForWave = useMemo(() => {
      if (context?.trainings && Array.isArray(context.trainings)) return context.trainings;
      return context?.dayData?.trainings || [];
    }, [context?.trainings, context?.dayData?.trainings]);

    const pIndexForWave = useMemo(() => {
      if (context?.pIndex) return context.pIndex;
      if (HEYS.dayUtils?.buildProductIndex) {
        const products = HEYS.products?.getAll?.() || safeLsGet('heys_products', []);
        return HEYS.dayUtils.buildProductIndex(products);
      }
      return null;
    }, [context?.pIndex]);

    const getProductFromItemFn = useMemo(() => {
      if (context?.getProductFromItem) return context.getProductFromItem;
      if (HEYS.dayUtils?.getProductFromItem) return HEYS.dayUtils.getProductFromItem;
      return () => null;
    }, [context?.getProductFromItem]);

    const baseWaveHours = useMemo(() => {
      return context?.prof?.insulinWaveHours || context?.dayData?.insulinWaveHours || 3;
    }, [context?.prof?.insulinWaveHours, context?.dayData?.insulinWaveHours]);

    const shouldSkipWarning = useMemo(() => {
      if (isEditMode) return true;
      if (isBulkMode) return true;
      if (!insulinWave || !insulinWave.calculate) return true;
      if (!mealsForWave || mealsForWave.length === 0) return true;
      return false;
    }, [isEditMode, isBulkMode, insulinWave, mealsForWave]);

    const trackInsulinEvent = useCallback((action, wave) => {
      if (!analytics || !analytics.trackDataOperation) return;
      analytics.trackDataOperation('insulin_wave_warning', {
        action,
        remainingMinutes: wave?.remaining ?? null,
        status: wave?.status || null
      });
    }, [analytics]);

    const computeWaveData = useCallback(() => {
      if (shouldSkipWarning) return null;
      const wave = insulinWave.calculate({
        meals: mealsForWave,
        pIndex: pIndexForWave,
        getProductFromItem: getProductFromItemFn,
        baseWaveHours,
        trainings: trainingsForWave,
        dayData: context?.dayData || { meals: mealsForWave, trainings: trainingsForWave, deficitPct: context?.deficitPct }
      });
      setCachedWave(wave);
      return wave;
    }, [shouldSkipWarning, insulinWave, mealsForWave, pIndexForWave, getProductFromItemFn, baseWaveHours, trainingsForWave, context?.dayData, context?.deficitPct]);

    // Проверяем, близко ли выбранное время к текущему (в пределах 30 минут)
    const isSelectedTimeCloseToNow = useCallback(() => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const selectedMinutes = realHours * 60 + minutes;
      // Разница в минутах (учитываем переход через полночь)
      let diff = Math.abs(selectedMinutes - nowMinutes);
      if (diff > 720) diff = 1440 - diff; // Если больше 12 часов — считаем с другой стороны
      return diff <= 30; // В пределах 30 минут от текущего времени
    }, [realHours, minutes]);

    const maybeShowInsulinWaveWarning = useCallback(() => {
      if (hasShownWarning) return false;
      if (shouldSkipWarning) return false;
      // Не показываем предупреждение если заполняем приём из прошлого
      if (!isSelectedTimeCloseToNow()) return false;
      const wave = cachedWave || computeWaveData();
      if (!wave) return false;
      if (wave.status === 'lipolysis') return false;
      setHasShownWarning(true);
      setWarningOpen(true);
      trackInsulinEvent('show', wave);
      return true; // Вернули true — предупреждение показано
    }, [hasShownWarning, shouldSkipWarning, isSelectedTimeCloseToNow, cachedWave, computeWaveData, trackInsulinEvent]);

    const handleWait = useCallback(() => {
      setWarningOpen(false);
      trackInsulinEvent('wait', cachedWave);
      HEYS.StepModal?.hide?.();
    }, [cachedWave, trackInsulinEvent]);

    const handleContinue = useCallback(() => {
      setWarningOpen(false);
      setHasShownWarning(true);
      trackInsulinEvent('continue', cachedWave);
      // После подтверждения — переходим к следующему шагу
      if (context?.onNext) {
        context.onNext();
      }
    }, [cachedWave, trackInsulinEvent, context]);

    // Keyboard Escape handler
    useEffect(() => {
      if (!warningOpen) return;
      const handleEscape = (e) => {
        if (e.key === 'Escape') handleWait();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }, [warningOpen, handleWait]);

    // Обработчик перехода к следующему шагу — проверяем инсулиновую волну
    const handleNextStep = useCallback(() => {
      // Показываем предупреждение если нужно
      const warningShown = maybeShowInsulinWaveWarning();
      // Если предупреждение не показано — сразу переходим к следующему шагу
      if (!warningShown && context?.onNext) {
        context.onNext();
      }
    }, [maybeShowInsulinWaveWarning, context]);

    return React.createElement('div', { className: 'meal-time-step' },
      warningOpen && React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.75)'
        }
      },
        React.createElement('div', {
          style: {
            width: '100%',
            maxWidth: '400px',
            borderRadius: '16px',
            backgroundColor: '#fff',
            padding: '20px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#d97706',
              fontWeight: 600,
              fontSize: '18px'
            }
          },
            React.createElement('span', null, '⚠️'),
            React.createElement('span', null, 'Инсулиновая волна ещё активна')
          ),
          // Progress bar wrapper с отступами
          React.createElement('div', { style: { margin: '4px 0' } },
            (insulinWave?.renderProgressBar && cachedWave)
              ? insulinWave.renderProgressBar(cachedWave)
              : React.createElement('div', { style: { fontSize: '14px', color: '#475569' } },
                  (cachedWave?.endTimeDisplay || cachedWave?.endTime)
                    ? `Липолиз откроется в ${cachedWave.endTimeDisplay || cachedWave.endTime}`
                    : 'Волна ещё не завершена — подождите немного')
          ),
          React.createElement('div', { style: { fontSize: '14px', color: '#334155', lineHeight: 1.6 } },
            'Если поесть сейчас, волна продлится и липолиз отложится.'
          ),
          React.createElement('div', { style: { fontSize: '13px', color: '#64748b' } },
            '💧 Вода, чай или кофе без сахара — не прерывают липолиз'
          ),
          React.createElement('div', { style: { display: 'flex', gap: '12px', paddingTop: '4px' } },
            React.createElement('button', {
              style: {
                flex: 1,
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                padding: '12px 16px',
                minHeight: '44px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#334155',
                border: 'none',
                cursor: 'pointer'
              },
              onClick: handleWait
            }, 'Подождать'),
            React.createElement('button', {
              style: {
                flex: 1,
                borderRadius: '12px',
                backgroundColor: '#10b981',
                padding: '12px 16px',
                minHeight: '44px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              },
              onClick: handleContinue
            }, 'Всё равно добавить')
          )
        )
      ),
      // Время
      React.createElement('div', { className: 'meal-time-display' },
        React.createElement('span', { className: 'meal-time-value' }, 
          `${pad2(realHours)}:${pad2(minutes)}`
        )
      ),
      
      // Переиспользуемый TimePicker с linkedScroll
      React.createElement(TimePicker, {
        hours: realHours,
        minutes: minutes,
        onHoursChange: updateHours,
        onMinutesChange: updateMinutes,
        onTimeChange: updateTime, // Единый callback для linkedScroll
        hoursValues: hoursValues,
        minutesValues: minutesValues,
        hoursLabel: '',
        minutesLabel: '',
        linkedScroll: true,
        wrap: true,
        display: null,
        className: 'meal-time-pickers'
      }),
      
      // Подсказка для ночных часов
      React.createElement(NightHint, { isNightHour, dateLabel }),
      
      // Выбор типа приёма
      React.createElement(MealTypeGrid, { 
        types: MEAL_TYPES, 
        currentType, 
        onSelect: selectType 
      }),
      
      // Кнопка "Далее" — внутри компонента для проверки инсулиновой волны при переходе
      React.createElement('button', {
        className: 'meal-time-next-btn',
        onClick: handleNextStep,
        style: {
          marginTop: '16px',
          width: '100%',
          padding: '14px 24px',
          borderRadius: '12px',
          backgroundColor: '#10b981',
          color: '#fff',
          fontWeight: 600,
          fontSize: '16px',
          border: 'none',
          cursor: 'pointer',
          minHeight: '48px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }
      }, 'Далее →')
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
    const [emojiTap, setEmojiTap] = useState({ mood: false, wellbeing: false, stress: false });
    
    // Confetti state
    const [showConfetti, setShowConfetti] = useState(false);
    
    // Показывать pulse на пресетах (только первые 3 секунды)
    const [showPulse, setShowPulse] = useState(true);
    useEffect(() => {
      const timer = setTimeout(() => setShowPulse(false), 3000);
      return () => clearTimeout(timer);
    }, []);
    
    // Ref для автофокуса на комментарий
    const commentRef = useRef(null);
    
    // История оценок за сегодня
    const todayMoods = useMemo(() => {
      const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
      const dayData = safeLsGet(`heys_dayv2_${dateKey}`, null);
      // Защита от null — день может ещё не существовать
      const meals = dayData?.meals || [];
      return meals.map(m => {
        const moodVal = m.mood || 5;
        const wellVal = m.wellbeing || 5;
        const stressVal = m.stress || 5;
        // Средняя оценка: mood + wellbeing + (10 - stress) / 3, шкала 0-10
        const avg = (moodVal + wellVal + (10 - stressVal)) / 3;
        
        // Название: из name, или из mealType, или fallback
        let displayName = m.name;
        if (!displayName || displayName === 'Приём') {
          if (m.mealType && MEAL_TYPES[m.mealType]) {
            displayName = MEAL_TYPES[m.mealType].name;
          } else {
            displayName = 'Приём';
          }
        }
        
        return {
          name: displayName,
          mood: moodVal,
          wellbeing: wellVal,
          stress: stressVal,
          avg: Math.round(avg * 10) / 10
        };
      });
    }, [context?.dateKey]);
    
    // === Динамический комментарий ===
    // Используем вынесенные хелперы
    const moodState = getMoodState(mood, wellbeing, stress);
    const chips = getQuickChips(moodState, mood, wellbeing, stress);
    
    // Confetti при идеальных оценках
    const triggerConfetti = useCallback(() => {
      if (!showConfetti) {
        setShowConfetti(true);
        haptic([50, 50, 50, 50, 100]);
        setTimeout(() => setShowConfetti(false), 2000);
      }
    }, [showConfetti]);
    
    // Тап на emoji — увеличение
    const handleEmojiTap = (field) => {
      haptic(5);
      setEmojiTap(prev => ({...prev, [field]: true}));
      setTimeout(() => setEmojiTap(prev => ({...prev, [field]: false})), 300);
    };
    
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

    // Общий индикатор состояния (используем вынесенный хелпер)
    const overallStatus = getOverallStatus(mood, wellbeing, stress);

    // Текущая средняя оценка для спарклайна
    const currentAvg = Math.round((mood + wellbeing + (10 - stress)) / 3 * 10) / 10;

    return React.createElement('div', { className: 'meal-mood-step' },
      // Мини-график настроения за день — используем вынесенный компонент
      React.createElement(MoodHistorySection, { todayMoods, currentAvg }),
      
      // Общий индикатор состояния
      React.createElement('div', { className: 'meal-overall-status' },
        React.createElement('span', { className: 'meal-overall-emoji' }, overallStatus.emoji),
        React.createElement('span', { className: 'meal-overall-text' }, overallStatus.text)
      ),
      
      // Confetti — используем вынесенный компонент
      React.createElement(ConfettiEffect, { show: showConfetti }),
      
      // Три карточки оценок — используем RatingCard компонент
      React.createElement('div', { className: 'meal-ratings-grid' },
        
        // === Настроение ===
        React.createElement(RatingCard, {
          field: 'mood',
          value: mood,
          emoji: MOOD_EMOJI[mood] || '😐',
          title: 'Настроение',
          presets: PRESETS_POSITIVE,
          getColor: getPositiveColor,
          getBg: getCardBg,
          getText: getMoodText,
          emojiAnim: emojiAnim.mood,
          numAnim: numAnim.mood,
          emojiTap: emojiTap.mood,
          showPulse,
          onSliderChange: handleSliderChange,
          onEmojiTap: handleEmojiTap,
          isNegative: false
        }),
        
        // === Самочувствие ===
        React.createElement(RatingCard, {
          field: 'wellbeing',
          value: wellbeing,
          emoji: WELLBEING_EMOJI[wellbeing] || '😐',
          title: 'Самочувствие',
          presets: PRESETS_POSITIVE,
          getColor: getPositiveColor,
          getBg: getCardBg,
          getText: getWellbeingText,
          emojiAnim: emojiAnim.wellbeing,
          numAnim: numAnim.wellbeing,
          emojiTap: emojiTap.wellbeing,
          showPulse,
          onSliderChange: handleSliderChange,
          onEmojiTap: handleEmojiTap,
          isNegative: false
        }),
        
        // === Стресс ===
        React.createElement(RatingCard, {
          field: 'stress',
          value: stress,
          emoji: STRESS_EMOJI[stress] || '😐',
          title: 'Стресс',
          presets: PRESETS_NEGATIVE,
          getColor: getNegativeColor,
          getBg: getStressCardBg,
          getText: getStressText,
          emojiAnim: emojiAnim.stress,
          numAnim: numAnim.stress,
          emojiTap: emojiTap.stress,
          showPulse,
          onSliderChange: handleSliderChange,
          onEmojiTap: handleEmojiTap,
          isNegative: true
        })
      ),
      
      // Динамический комментарий — используем вынесенный компонент
      React.createElement(CommentSection, {
        moodState,
        mood,
        wellbeing,
        stress,
        comment,
        chips,
        onAddChip: addChip,
        onChangeComment: (val) => onChange({ ...data, comment: val }),
        commentRef
      })
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
        // При редактировании берём начальные значения из context
        if (ctx?.initialHourIndex !== undefined) {
          return {
            hourIndex: ctx.initialHourIndex,
            minutes: ctx.initialMinutes ?? 0,
            mealType: ctx.initialMealType ?? null
          };
        }
        // Для нового приёма — текущее время
        const now = new Date();
        return {
          hourIndex: hourToWheelIndex(now.getHours()),
          minutes: Math.floor(now.getMinutes() / 5) * 5,
          mealType: null // авто
        };
      },
      validate: () => true,
      hideHeaderNext: true // Кнопка "Далее" внутри компонента для проверки волны при переходе
    });
    
    // Шаг 2: Оценки и комментарий
    registerStep('mealMood', {
      title: 'Самочувствие',
      hint: 'Как вы себя чувствуете?',
      icon: '😊',
      allowSwipe: false, // Отключаем свайп — конфликтует со слайдерами
      component: MealMoodStepComponent,
      getInitialData: (ctx) => {
        // При редактировании берём начальные значения из context
        if (ctx?.initialMood !== undefined) {
          return {
            mood: ctx.initialMood,
            wellbeing: ctx.initialWellbeing ?? 5,
            stress: ctx.initialStress ?? 5,
            comment: ctx.initialComment ?? ''
          };
        }
        
        // Берём оценки из предыдущего приёма если есть
        const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
        const dayData = safeLsGet(`heys_dayv2_${dateKey}`, null);
        // Защита от null — день может ещё не существовать (завтра, будущие даты)
        const meals = dayData?.meals || [];
        
        // 1. Если есть приёмы сегодня — берём последний
        if (meals.length > 0) {
          const lastMeal = meals[meals.length - 1];
          return {
            mood: lastMeal.mood || 5,
            wellbeing: lastMeal.wellbeing || 5,
            stress: lastMeal.stress || 5,
            comment: ''
          };
        }
        
        // 2. Если первый приём — берём средние за вчера
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);
        const yesterdayData = safeLsGet(`heys_dayv2_${yesterdayKey}`, null);
        const yesterdayMeals = yesterdayData?.meals || [];
        
        if (yesterdayMeals.length > 0) {
          // Вычисляем средние оценки за вчера
          let totalMood = 0, totalWellbeing = 0, totalStress = 0;
          let count = 0;
          
          for (const meal of yesterdayMeals) {
            if (meal.mood || meal.wellbeing || meal.stress) {
              totalMood += meal.mood || 5;
              totalWellbeing += meal.wellbeing || 5;
              totalStress += meal.stress || 5;
              count++;
            }
          }
          
          if (count > 0) {
            return {
              mood: Math.round(totalMood / count),
              wellbeing: Math.round(totalWellbeing / count),
              stress: Math.round(totalStress / count),
              comment: ''
            };
          }
        }
        
        // 3. Если нет данных — по умолчанию 5
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
      finishLabel: 'Добавить', // Создание — "Добавить"
      context: {
        dateKey,
        meals: options.meals,
        pIndex: options.pIndex,
        getProductFromItem: options.getProductFromItem,
        trainings: options.trainings,
        deficitPct: options.deficitPct,
        prof: options.prof,
        dayData: options.dayData
      },
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
        
        // Нормализуем часы для хранения (ночные 00-02 → 24-26)
        realHours = normalizeHoursForStorage(realHours, NIGHT_HOUR_THRESHOLD);
        const timeStr = `${pad2(realHours)}:${pad2(timeData.minutes || 0)}`;
        
        // Если тип не выбран явно — определяем автоматически по времени
        const mealType = timeData.mealType || getMealTypeByHour(realHours);
        
        // Название приёма из типа
        const mealName = MEAL_TYPES[mealType]?.name || 'Приём';
        
        const newMeal = {
          id: uid('m_'),
          name: mealName,
          time: timeStr,
          mealType: mealType,
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

  /**
   * Показать модалку редактирования времени и типа приёма (1 шаг)
   * @param {Object} options
   * @param {Object} options.meal - Текущий приём для редактирования
   * @param {number} options.mealIndex - Индекс приёма
   * @param {string} options.dateKey - Дата (YYYY-MM-DD)
   * @param {Function} options.onComplete - Callback после сохранения
   */
  function showEditMealModal(options = {}) {
    const { meal, mealIndex, dateKey, onComplete, onClose } = options;
    if (!meal) {
      console.error('[MealStep] showEditMeal: meal is required');
      return;
    }
    
    // Парсим текущее время
    const timeParts = (meal.time || '').split(':');
    let hours = parseInt(timeParts[0]) || new Date().getHours();
    const minutes = parseInt(timeParts[1]) || 0;
    
    // Денормализуем часы для отображения (24-26 → 0-2)
    hours = normalizeHoursForDisplay(hours);
    
    // Конвертируем в индекс колеса
    const hourIndex = hourToWheelIndex(hours);
    
    HEYS.StepModal.show({
      steps: ['mealTime'],  // Только 1 шаг — время и тип
      title: '',  // Без заголовка
      icon: '',   // Без иконки
      showProgress: false,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      finishLabel: 'Сохранить', // Редактирование — "Сохранить"
      context: { 
        dateKey,
        mealIndex,
        // Начальные значения
        initialHourIndex: hourIndex,
        initialMinutes: minutes,
        initialMealType: meal.mealType || null
      },
      onComplete: (stepData) => {
        const timeData = stepData.mealTime || {};
        
        // Используем initialHourIndex если пользователь не менял
        const finalHourIndex = timeData.hourIndex ?? hourIndex;
        let realHours = wheelIndexToHour(finalHourIndex);
        
        // Нормализуем часы для хранения (00-02 → 24-26)
        realHours = normalizeHoursForStorage(realHours, NIGHT_HOUR_THRESHOLD);
        const timeStr = `${pad2(realHours)}:${pad2(timeData.minutes ?? minutes)}`;
        
        // Тип приёма
        const mealType = timeData.mealType || meal.mealType || null;
        const mealName = mealType ? (MEAL_TYPES[mealType]?.name || meal.name) : meal.name;
        
        // Возвращаем обновлённые данные
        if (onComplete) {
          onComplete({
            mealIndex,
            time: timeStr,
            mealType,
            name: mealName
          });
        }
      },
      onClose
    });
  }

  /**
   * Показать модалку редактирования оценок приёма (1 шаг)
   * @param {Object} options
   * @param {Object} options.meal - Текущий приём для редактирования
   * @param {number} options.mealIndex - Индекс приёма
   * @param {string} options.dateKey - Дата (YYYY-MM-DD)
   * @param {Function} options.onComplete - Callback после сохранения
   */
  function showEditMoodModal(options = {}) {
    const { meal, mealIndex, dateKey, onComplete, onClose } = options;
    if (!meal) {
      console.error('[MealStep] showEditMood: meal is required');
      return;
    }
    
    HEYS.StepModal.show({
      steps: ['mealMood'],  // Только 1 шаг — оценки
      title: '',  // Без заголовка
      icon: '',   // Без иконки
      showProgress: false,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      finishLabel: 'Сохранить', // Редактирование — "Сохранить"
      context: { 
        dateKey,
        mealIndex,
        // Начальные значения — берём из текущего приёма
        initialMood: meal.mood || 5,
        initialWellbeing: meal.wellbeing || 5,
        initialStress: meal.stress || 5,
        initialComment: meal.comment || ''
      },
      onComplete: (stepData) => {
        const moodData = stepData.mealMood || {};
        
        // Возвращаем обновлённые данные
        if (onComplete) {
          onComplete({
            mealIndex,
            mood: moodData.mood ?? meal.mood ?? 5,
            wellbeing: moodData.wellbeing ?? meal.wellbeing ?? 5,
            stress: moodData.stress ?? meal.stress ?? 5,
            comment: moodData.comment ?? meal.comment ?? ''
          });
        }
      },
      onClose
    });
  }

  // === Экспорт ===
  HEYS.MealStep = {
    showAddMeal: showAddMealModal,
    showEditMeal: showEditMealModal,
    showEditMood: showEditMoodModal,
    TimeStep: MealTimeStepComponent,
    MoodStep: MealMoodStepComponent
  };

})(typeof window !== 'undefined' ? window : global);
