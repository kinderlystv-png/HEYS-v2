// heys_meal_step_v1.js — Шаги добавления приёма пищи через StepModal
// Двухшаговый flow: время+тип → оценки+комментарий
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.warn('[HEYS] MealStep: StepModal not loaded yet');
  }

  // Используем общие утилиты из StepModal
  const { lsGet, lsSet } = HEYS.StepModal?.utils || {};

  const readStoredValue = (key, fallback = null) => {
    if (HEYS.store?.readSafe) return HEYS.store.readSafe(key, fallback);
    try {
      const v = (lsGet || HEYS.utils?.lsGet)?.(key, fallback);
      return v == null ? fallback : v;
    } catch (_) { return fallback; }
  };

  // Fallback если StepModal ещё не загружен
  const safeLsGet = (key, def) => readStoredValue(key, def);

  const safeLsSet = (key, val) => {
    if (HEYS.store?.set) return HEYS.store.set(key, val);
    if (lsSet) return lsSet(key, val);
    if (HEYS.utils?.lsSet) return HEYS.utils.lsSet(key, val);
    localStorage.setItem(key, JSON.stringify(val));
  };

  // Шаги мастера приёма — чипы и ползунки: строка «вибрация · правило
  // продукта» отклика им не даёт (checkin-morning: «на кручение колёс и
  // ползунков её нет»). Отклик на записанный приём выдаёт day/_meals.js.
  const haptic = () => { };

  // Unique ID generator
  const uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Pad number to 2 digits
  const pad2 = (n) => String(n).padStart(2, '0');

  function formatWaveCloseClock(minutesAhead) {
    const mins = Math.max(0, Math.round(Number(minutesAhead) || 0));
    const target = new Date(Date.now() + mins * 60000);
    return pad2(target.getHours()) + ':' + pad2(target.getMinutes());
  }

  function buildWavePlaqueText(wave) {
    const remaining = Number(wave?.rangeRemaining ?? wave?.remaining);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return 'Прошлый приём ещё усваивается.';
    }
    return 'Прошлый приём ещё усваивается — окно закроется в ' + formatWaveCloseClock(remaining) + '.';
  }

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
    snack1: { name: 'Перекус', icon: '🍎', order: 2 },
    coffee_break: { name: 'Кофе-брейк', icon: '☕', order: 2.5 },
    lunch: { name: 'Обед', icon: '🍲', order: 3 },
    snack2: { name: 'Перекус', icon: '🥜', order: 4 },
    dinner: { name: 'Ужин', icon: '🍽️', order: 5 },
    snack3: { name: 'Перекус', icon: '🧀', order: 6 },
    night: { name: 'Ночной приём', icon: '🌙', order: 7 }
  };

  // Emoji для оценок
  const MOOD_EMOJI = ['😢', '😢', '😕', '😕', '😐', '😐', '🙂', '🙂', '😊', '😊', '😄'];
  const WELLBEING_EMOJI = ['🤒', '🤒', '😓', '😓', '😐', '😐', '🙂', '🙂', '💪', '💪', '🏆'];
  const STRESS_EMOJI = ['😌', '😌', '🙂', '🙂', '😐', '😐', '😟', '😟', '😰', '😰', '😱'];

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
  const getPositiveColor = (v) => HEYS.scales.wellbeing(v).color;

  const getNegativeColor = (v) => HEYS.scales.stress(v).color;

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
  // Строка «тон заполнения и слова»: пороги на все три шкалы одни — 1–3, 4–6,
  // 7–10, — но читаются по своей стороне. Пять ступеней через два дробили одну
  // и ту же тройку на «Плохо / Так себе / Норм / Хорошо / Отлично», и слово
  // переставало совпадать с тоном заполнения.
  const getMoodText = (v) => v <= 3 ? 'слабость' : v <= 6 ? 'так себе' : 'хорошо';
  const getWellbeingText = (v) => v <= 3 ? 'слабость' : v <= 6 ? 'так себе' : 'бодрость';
  const getStressText = (v) => v <= 3 ? 'спокоен' : v <= 6 ? 'напряжён' : 'на пределе';

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

  const MEAL_TYPE_CHIPS = [
    { id: 'breakfast', name: 'Завтрак' },
    { id: 'lunch', name: 'Обед' },
    { id: 'snack', name: 'Перекус', slots: ['snack', 'snack1', 'snack2', 'snack3'] },
    { id: 'dinner', name: 'Ужин' },
    { id: 'coffee_break', name: 'Кофе-брейк' },
    { id: 'night', name: 'Ночной приём' }
  ];

  function chipIdForType(type) {
    const key = String(type || '');
    const chip = MEAL_TYPE_CHIPS.find((item) => item.id === key || item.slots?.includes(key));
    return chip?.id || key;
  }

  function typeForChip(chipId, hour) {
    if (chipId !== 'snack') return chipId;
    const auto = getMealTypeByHour(hour);
    if (auto === 'snack1' || auto === 'snack2' || auto === 'snack3') return auto;
    if (hour < 12) return 'snack1';
    if (hour < 18) return 'snack2';
    return 'snack3';
  }

  // Кадры разводят два вида одного блока. На первом шаге («Добавление · время
  // и тип») это ярус «Тип приёма» и сетка 1fr 1fr без подсказки; в листе правки
  // («Приём · время и тип») — ряд чипов с переносом, без яруса, с подсказкой
  // «Тип предложен по времени — можно оставить как есть».
  function MealTypeGrid({ currentType, onSelect, variant = 'step' }) {
    const activeChip = chipIdForType(currentType);
    const isSheet = variant === 'sheet';
    return React.createElement('div', {
      className: 'meal-type-section' + (isSheet ? ' meal-type-section--sheet' : '')
    },
      !isSheet && React.createElement('div', { className: 'meal-type-label' }, 'Тип приёма'),
      React.createElement('div', { className: 'meal-type-chips' },
        MEAL_TYPE_CHIPS.map((chip) =>
          React.createElement('button', {
            key: chip.id,
            type: 'button',
            className: 'meal-type-chip' + (activeChip === chip.id ? ' is-on' : ''),
            onClick: () => onSelect(chip.id)
          }, chip.name)
        )
      ),
      isSheet && React.createElement('div', { className: 'meal-type-hint' },
        'Тип предложен по времени — можно оставить как есть.'
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

  const TIME_SHIFTS = [
    { label: '−15 мин', minutes: 15 },
    { label: '−30 мин', minutes: 30 },
    { label: '−1 ч', minutes: 60 }
  ];
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

    // Чип «сейчас» — только когда колесо стоит на реальном времени часов.
    const isNowSelected = useMemo(() => {
      const now = new Date();
      return now.getHours() === realHours && Math.floor(now.getMinutes() / 5) * 5 === minutes;
    }, [realHours, minutes]);

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
    // Кадр «Добавление · время и тип»: три быстрых сдвига назад под колесом.
    // Еду вспоминают задним числом («съел полчаса назад»), а докручивать колесо
    // на это ради каждого приёма — лишняя работа.
    const shiftTimeBack = (backMinutes) => {
      haptic(10);
      const total = (realHours * 60 + minutes - backMinutes + 1440) % 1440;
      updateTime(Math.floor(total / 60), Math.floor((total % 60) / 5) * 5);
    };

    const updateTime = (hourValue, newMinutes) => {
      const newIndex = HOURS_ORDER.indexOf(hourValue);
      onChange({ ...data, hourIndex: newIndex >= 0 ? newIndex : 0, minutes: newMinutes });
      // Предупреждение о волне теперь показывается при переходе на следующий шаг, не при касании колеса
    };

    const selectType = (chipId) => {
      haptic(10);
      onChange({ ...data, mealType: typeForChip(chipId, realHours) });
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
        const products = HEYS.products?.getAll?.() || [];
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
      // Инсулиновая волна релевантна только для СЕГОДНЯШНЕГО дня
      // Если добавляем приём в другой день — пропускаем предупреждение
      const todayKey = HEYS.models?.todayISO?.() || new Date().toISOString().slice(0, 10);
      if (context?.dateKey && context.dateKey !== todayKey) return true;
      return false;
    }, [isEditMode, isBulkMode, insulinWave, mealsForWave, context?.dateKey]);

    const trackInsulinEvent = useCallback((action, wave) => {
      if (!analytics || !analytics.trackDataOperation) return;
      analytics.trackDataOperation('insulin_wave_warning', {
        action,
        remainingMinutes: wave?.rangeRemaining ?? wave?.remaining ?? null,
        status: wave?.rangeStatus || wave?.status || null
      });
    }, [analytics]);

    const liveWave = useMemo(() => {
      if (shouldSkipWarning || !insulinWave?.calculate) return null;
      try {
        return insulinWave.calculate({
          meals: mealsForWave,
          pIndex: pIndexForWave,
          getProductFromItem: getProductFromItemFn,
          baseWaveHours,
          trainings: trainingsForWave,
          dayData: context?.dayData || {
            meals: mealsForWave,
            trainings: trainingsForWave,
            deficitPct: context?.deficitPct
          }
        });
      } catch (_) {
        return null;
      }
    }, [shouldSkipWarning, insulinWave, mealsForWave, pIndexForWave, getProductFromItemFn, baseWaveHours, trainingsForWave, context?.dayData, context?.deficitPct]);

    const selectedCloseToNow = useMemo(() => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const selectedMinutes = realHours * 60 + minutes;
      let diff = Math.abs(selectedMinutes - nowMinutes);
      if (diff > 720) diff = 1440 - diff;
      return diff <= 30;
    }, [realHours, minutes]);

    const wave = liveWave;
    const showWavePlaque = !!(
      wave
      && selectedCloseToNow
      && !((wave.rangeStatus || wave.status) !== 'settling')
    );

    useEffect(() => {
      if (!showWavePlaque || hasShownWarning) return;
      setHasShownWarning(true);
      setCachedWave(liveWave);
      trackInsulinEvent('show', liveWave);
    }, [showWavePlaque, hasShownWarning, liveWave, trackInsulinEvent]);

    const handleWait = useCallback(() => {
      trackInsulinEvent('wait', cachedWave || liveWave);
      HEYS.StepModal?.hide?.();
    }, [cachedWave, liveWave, trackInsulinEvent]);

    const handleNextStep = useCallback(() => {
      if (showWavePlaque) trackInsulinEvent('continue', cachedWave || liveWave);
      if (context?.onNext) context.onNext();
    }, [showWavePlaque, cachedWave, liveWave, trackInsulinEvent, context]);

    useEffect(() => {
      if (!showWavePlaque) return undefined;
      const onKey = (e) => {
        if (e.key === 'Escape') handleWait();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [showWavePlaque, handleWait]);

    return React.createElement('div', {
      className: 'meal-time-step meal-time-step--v4' + (isEditMode ? ' meal-time-step--sheet' : '')
    },
      React.createElement('div', {
        className: 'meal-time-hero',
        role: 'group',
        'aria-label': 'Время приёма'
      },
        React.createElement(TimePicker, {
          hours: realHours,
          minutes: minutes,
          onHoursChange: updateHours,
          onMinutesChange: updateMinutes,
          onTimeChange: updateTime,
          hoursValues: hoursValues,
          minutesValues: minutesValues,
          hoursLabel: '',
          minutesLabel: '',
          linkedScroll: true,
          wrap: true,
          compact: true,
          display: null,
          className: 'meal-time-pickers'
        }),
        // Строка «шаг и диапазон»: чип «сейчас» стоит справа от минут абсолютом,
        // вне потока, чтобы цифры не сдвигались с оси; под его ширину ряд
        // колонок получает правое поле.
        // Строка «вид · лист времени и типа»: «чипа „сейчас" здесь нет, и правого
        // поля под него тоже». Сдвигов назад в листе правки тоже нет — время
        // приёма там уже записано, его правят, а не вспоминают.
        !isEditMode && isNowSelected && React.createElement('span', {
          className: 'meal-time-hero__now'
        }, 'сейчас')
      ),

      !isEditMode && React.createElement('div', { className: 'meal-time-shifts' },
        TIME_SHIFTS.map(({ label, minutes: back }) => React.createElement('button', {
          key: label,
          type: 'button',
          className: 'meal-time-shift',
          onClick: () => shiftTimeBack(back)
        }, label))
      ),

      React.createElement(NightHint, { isNightHour, dateLabel }),

      React.createElement(MealTypeGrid, {
        currentType,
        onSelect: selectType,
        variant: isEditMode ? 'sheet' : 'step'
      }),

      showWavePlaque && React.createElement('div', { className: 'meal-time-wave' },
        buildWavePlaqueText(liveWave)
      ),

      React.createElement('button', {
        type: 'button',
        className: 'meal-time-cta',
        onClick: handleNextStep
      }, showWavePlaque ? 'Всё равно продолжить' : 'Далее'),

      showWavePlaque && React.createElement('button', {
        type: 'button',
        className: 'meal-time-wait',
        onClick: handleWait
      }, 'Подождать')
    );
  }

  // ============================================================
  // STEP 2: ОЦЕНКИ + КОММЕНТАРИЙ
  // ============================================================

  const INFLUENCE_CHIPS = ['Радость', 'Успех', 'Встреча', 'Природа', 'Недосып'];

  // Три полосы, а не две: шалфей --gr2, средний тон --ovl, тревожный --val-bad.
  // Стресс читается наоборот — у него тревожен верх шкалы.
  function scaleTone(field, value) {
    const band = value <= 3 ? 'low' : value <= 6 ? 'mid' : 'high';
    if (band === 'mid') return 'mid';
    if (field === 'stress') return band === 'high' ? 'bad' : 'ok';
    return band === 'low' ? 'bad' : 'ok';
  }

  // Подписи краёв шкалы: кадр называет их у каждой шкалы своими словами. Без
  // них «3» и «8» — просто числа, и человек не знает, куда тянуть ползунок.
  const MOOD_SCALE_ENDS = {
    mood: ['подавленно', 'подъём'],
    wellbeing: ['разбитость', 'бодрость'],
    stress: ['спокойствие', 'на пределе']
  };

  function MoodScaleRow({ field, title, value, getText, onChange }) {
    const tone = scaleTone(field, value);
    const pct = ((Number(value) - 1) / 9) * 100;
    // Заливка ролями набора вместо литералов. Тревожная половина шкалы красилась
    // #d99a63 — это тон нахлёста волны, а кадр называет здесь --val-bad.
    const fill = tone === 'ok' ? 'var(--v4-ok-fill, #7a8a5e)'
      : tone === 'mid' ? 'var(--v4-wave-overlap, #d99a63)'
        : 'var(--v4-bad-text, #a83c22)';
    const ends = MOOD_SCALE_ENDS[field] || ['', ''];
    return React.createElement('div', { className: 'meal-mood-scale' },
      React.createElement('div', { className: 'meal-mood-scale__top' },
        React.createElement('span', { className: 'meal-mood-scale__label' }, title),
        React.createElement('span', {
          className: 'meal-mood-scale__value meal-mood-scale__value--' + tone
        }, value + ' · ' + String(getText(value) || '').toLowerCase())
      ),
      React.createElement('input', {
        type: 'range',
        className: 'meal-mood-scale__slider',
        min: 1,
        max: 10,
        value: value,
        style: { '--mood-fill': fill, '--mood-pct': pct + '%' },
        'aria-label': title,
        onChange: (e) => onChange(field, Number(e.target.value)),
        onTouchStart: (e) => e.stopPropagation(),
        onTouchEnd: (e) => e.stopPropagation(),
        onTouchMove: (e) => e.stopPropagation()
      }),
      React.createElement('div', { className: 'meal-mood-scale__ends' },
        React.createElement('span', null, ends[0]),
        React.createElement('span', null, ends[1])
      )
    );
  }

  function MealMoodStepComponent({ data, onChange, context }) {
    const mood = data.mood ?? 5;
    const wellbeing = data.wellbeing ?? 5;
    const stress = data.stress ?? 5;
    const comment = data.comment ?? '';
    const isEditMood = context?.mealIndex !== undefined;
    const commentParts = comment.split(',').map((part) => part.trim()).filter(Boolean);
    const selectedChips = commentParts.filter((part) => INFLUENCE_CHIPS.includes(part));
    const ownText = commentParts.filter((part) => !INFLUENCE_CHIPS.includes(part)).join(', ');
    const [ownOpen, setOwnOpen] = useState(() => !!ownText);

    const prefill = data.prefillFrom;
    const prefillHint = !isEditMood && prefill
      ? (prefill.kind === 'meal'
        ? `Как в прошлый раз${prefill.time ? ', ' + prefill.time : ''} — поправьте, если изменилось`
        : 'Как на утреннем чек-ине — поправьте, если изменилось')
      : null;

    const setOwnText = (text) => {
      const next = selectedChips.concat(String(text || '').trim() ? [text.trim()] : []);
      onChange({ ...data, comment: next.join(', ') });
    };

    const handleSliderChange = (field, value) => {
      haptic(value >= 8 || value <= 2 ? 15 : 10);
      onChange({ ...data, [field]: value, skipRatings: false });
    };

    const toggleChip = (chip) => {
      haptic(5);
      const next = selectedChips.includes(chip)
        ? selectedChips.filter((item) => item !== chip)
        : selectedChips.concat(chip);
      onChange({ ...data, comment: next.concat(ownText ? [ownText] : []).join(', ') });
    };

    const handleNext = () => {
      if (context?.onNext) context.onNext();
    };

    const handleSkip = () => {
      onChange({
        ...data,
        skipRatings: true,
        mood: null,
        wellbeing: null,
        stress: null
      });
      setTimeout(() => {
        if (context?.onNext) context.onNext();
      }, 0);
    };

    return React.createElement('div', { className: 'meal-mood-step meal-mood-step--v4' },
      prefillHint && React.createElement('div', { className: 'meal-mood-prefill' },
        React.createElement('svg', {
          className: 'meal-mood-prefill__icon',
          width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round',
          strokeLinejoin: 'round', 'aria-hidden': 'true'
        },
          React.createElement('circle', { cx: 12, cy: 12, r: 9 }),
          React.createElement('path', { d: 'M12 8v5l3 2' })
        ),
        React.createElement('span', null, prefillHint)
      ),
      React.createElement(MoodScaleRow, {
        field: 'mood',
        title: 'Настроение',
        value: mood,
        getText: getMoodText,
        onChange: handleSliderChange
      }),
      React.createElement(MoodScaleRow, {
        field: 'wellbeing',
        title: 'Самочувствие',
        value: wellbeing,
        getText: getWellbeingText,
        onChange: handleSliderChange
      }),
      React.createElement(MoodScaleRow, {
        field: 'stress',
        title: 'Стресс',
        value: stress,
        getText: getStressText,
        onChange: handleSliderChange
      }),
      React.createElement('div', { className: 'meal-mood-tier' }, 'Что повлияло'),
      React.createElement('div', { className: 'meal-mood-chips' },
        INFLUENCE_CHIPS.map((chip) =>
          React.createElement('button', {
            key: chip,
            type: 'button',
            className: 'meal-mood-chip' + (selectedChips.includes(chip) ? ' is-on' : ''),
            onClick: () => toggleChip(chip)
          }, chip)
        ),
        React.createElement('button', {
          type: 'button',
          className: 'meal-mood-chip meal-mood-chip--own' + (ownOpen ? ' is-on' : ''),
          onClick: () => {
            haptic(5);
            if (ownOpen && ownText) setOwnText('');
            setOwnOpen(!ownOpen);
          }
        },
          React.createElement('svg', {
            width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
            stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round',
            'aria-hidden': 'true'
          }, React.createElement('path', { d: 'M12 5v14M5 12h14' })),
          'Своё')
      ),
      ownOpen && React.createElement('input', {
        type: 'text',
        className: 'meal-mood-own-input',
        value: ownText,
        maxLength: 60,
        placeholder: 'Что повлияло',
        'aria-label': 'Своё — что повлияло',
        onChange: (e) => setOwnText(e.target.value)
      }),
      React.createElement('button', {
        type: 'button',
        className: 'meal-time-cta meal-mood-cta',
        onClick: handleNext
      }, isEditMood ? 'Сохранить' : 'Дальше'),
      !isEditMood && React.createElement('button', {
        type: 'button',
        className: 'meal-time-wait',
        onClick: handleSkip
      }, 'Сохранить приём без оценок')
    );
  }

  // ============================================================
  // РЕГИСТРАЦИЯ ШАГОВ
  // ============================================================

  if (HEYS.StepModal) {
    const { registerStep } = HEYS.StepModal;

    // Шаг 1: Время и тип
    registerStep('mealTime', {
      title: 'Новый приём',
      hint: '',
      icon: '',
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
      title: 'Как вы сейчас',
      hint: '',
      icon: '',
      allowSwipe: false,
      hideHeaderNext: true,
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
            comment: '',
            // Откуда взяты числа — шаг говорит это вслух строкой над шкалами.
            prefillFrom: { kind: 'meal', time: lastMeal.time || '' }
          };
        }

        // 2. Если первый приём — берём оценки из утреннего чек-ина
        const checkinMood = dayData?.moodAvg;
        const checkinWellbeing = dayData?.wellbeingAvg;
        const checkinStress = dayData?.stressAvg;

        const hasCheckinRatings =
          Number.isFinite(checkinMood) ||
          Number.isFinite(checkinWellbeing) ||
          Number.isFinite(checkinStress);

        if (hasCheckinRatings) {
          return {
            mood: Number.isFinite(checkinMood) ? Math.round(checkinMood) : 5,
            wellbeing: Number.isFinite(checkinWellbeing) ? Math.round(checkinWellbeing) : 5,
            stress: Number.isFinite(checkinStress) ? Math.round(checkinStress) : 5,
            comment: ''
          };
        }

        // 3. Если первый приём — берём средние за вчера
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

        // 4. Если нет данных — по умолчанию 5
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
   * @param {string} [options.time] - Начальное время приёма (HH:MM)
   * @param {Function} options.onComplete - Callback после создания
   */
  function parseInitialMealTime(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return {
      initialHourIndex: hourToWheelIndex(hours % 24),
      initialMinutes: Math.max(0, Math.min(59, minutes)),
      initialMealType: getMealTypeByHour(hours)
    };
  }

  function showAddMealModal(options = {}) {
    const dateKey = options.dateKey || new Date().toISOString().slice(0, 10);
    const initialTime = parseInitialMealTime(options.time || options.initialTime);

    HEYS.StepModal.show({
      chevronBack: true,
      steps: ['mealTime', 'mealMood'],
      title: 'Новый приём',
      initialSlideInDirection: options.initialSlideInDirection || null,
      modalClassName: 'mc-modal--meal-create',
      showProgress: true,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      finishLabel: 'Добавить', // Создание — "Добавить"
      // Сначала записываем новый приём в Day state/local storage, и только затем
      // закрываем модалку и возобновляем cloud sync. Иначе свежий cloud pull мог
      // визуально "перезагрузить" дневник и затереть только что созданный приём.
      closeOnComplete: 'after',
      context: {
        dateKey,
        meals: options.meals,
        pIndex: options.pIndex,
        getProductFromItem: options.getProductFromItem,
        trainings: options.trainings,
        deficitPct: options.deficitPct,
        prof: options.prof,
        dayData: options.dayData,
        ...(initialTime || {})
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

        // Если тип не выбран явно — определяем автоматически по времени.
        // timeData.mealType заполняет только selectType, то есть явное касание
        // чипа: автоподстановка фиксацией названия не считается (контракт
        // nutrition-tab, «название приёма»).
        const mealTypePinned = !!timeData.mealType;
        const mealType = timeData.mealType || getMealTypeByHour(realHours);

        // Название приёма из типа
        const mealName = MEAL_TYPES[mealType]?.name || 'Приём';

        const newMeal = {
          id: uid('m_'),
          name: mealName,
          time: timeStr,
          mealType: mealType,
          mealTypePinned,
          items: []
        };
        if (!moodData.skipRatings) {
          newMeal.mood = moodData.mood || 5;
          newMeal.wellbeing = moodData.wellbeing || 5;
          newMeal.stress = moodData.stress || 5;
        }

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
      chevronBack: true,
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

        // Тип приёма. Фиксацией считается только явное касание чипа в этой
        // шторке; у приёмов, созданных до правила, флага нет — они остаются на
        // динамике до первой правки.
        const mealTypePinned = !!timeData.mealType || meal.mealTypePinned === true;
        const mealType = timeData.mealType || meal.mealType || null;
        const localize = HEYS.dayUtils?.localizeMealName;
        const localizedStored = typeof localize === 'function'
          ? localize(meal.name, 'Приём')
          : (meal.name || 'Приём');
        const mealName = mealType
          ? (MEAL_TYPES[mealType]?.name || localizedStored)
          : localizedStored;

        // Возвращаем обновлённые данные
        if (onComplete) {
          onComplete({
            mealIndex,
            time: timeStr,
            mealType,
            mealTypePinned,
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
      chevronBack: true,
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
