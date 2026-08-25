// heys_day_time_mood_picker_v1.js — Time/mood picker renderer
// Extracted from heys_day_v12.js

;(function(global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  function renderTimeMoodPicker(params) {
    if (!React || !ReactDOM) return null;

    const {
      showTimePicker,
      cancelTimePicker,
      bottomSheetRef,
      handleSheetTouchStart,
      handleSheetTouchMove,
      handleSheetTouchEnd,
      pickerStep,
      animDirection,
      editMode,
      confirmTimeEdit,
      goToMoodStep,
      hoursValues,
      pendingMealTime,
      setPendingMealTime,
      minutesValues,
      isNightHourSelected,
      currentDateLabel,
      pendingMealType,
      setPendingMealType,
      day,
      WheelColumn,
      goBackToTimeStep,
      confirmMoodEdit,
      confirmMealCreation,
      pendingMealMood,
      setPendingMealMood,
      showConfetti,
      setShowConfetti,
      emojiAnimating,
      setEmojiAnimating,
      prof,
      pIndex,
      lsGet,
      fmtDate,
      optimum,
      getProductFromItem,
      getMealType,
      getMealQualityScore
    } = params || {};

    if (!showTimePicker) return null;

    return ReactDOM.createPortal(
      React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTimePicker },
        React.createElement('div', { 
          ref: bottomSheetRef,
          className: 'time-picker-modal', 
          onClick: e => e.stopPropagation()
        },
          // Ручка для свайпа
          React.createElement('div', { 
            className: 'bottom-sheet-handle',
            onTouchStart: handleSheetTouchStart,
            onTouchMove: handleSheetTouchMove,
            onTouchEnd: () => handleSheetTouchEnd(cancelTimePicker)
          }),
          
          // Step 1: Время (показывается при editMode='new' или 'time')
          pickerStep === 1 && React.createElement('div', { 
            className: 'time-picker-step' + (animDirection === 'back' ? ' back' : ''),
            key: 'step1'
          },
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTimePicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, editMode === 'time' ? 'Изменить время' : 'Время приёма'),
              // Если редактируем только время — "Готово", если новый — "Далее"
              editMode === 'time'
                ? React.createElement('button', { className: 'time-picker-confirm', onClick: confirmTimeEdit }, 'Готово')
                : React.createElement('button', { className: 'time-picker-confirm', onClick: goToMoodStep }, 'Далее')
            ),
            React.createElement('div', { className: 'time-picker-wheels' },
              React.createElement(WheelColumn, {
                values: hoursValues,
                selected: pendingMealTime.hours,
                onChange: (i) => setPendingMealTime(prev => ({...prev, hours: i})),
                label: 'Часы'
              }),
              React.createElement('div', { className: 'time-picker-separator' }, ':'),
              React.createElement(WheelColumn, {
                values: minutesValues,
                selected: pendingMealTime.minutes,
                onChange: (i) => setPendingMealTime(prev => ({...prev, minutes: i})),
                label: 'Минуты'
              })
            ),
            // Подсказка для ночных часов (00:00-02:59)
            isNightHourSelected && React.createElement('div', { className: 'night-time-hint' },
              React.createElement('span', { className: 'night-time-icon' }, '🌙'),
              React.createElement('span', { className: 'night-time-text' }, 
                'Ночной приём — запишется в ',
                React.createElement('b', null, currentDateLabel)
              )
            ),
            // Предпросмотр типа приёма
            (() => {
              const timeStr = `${String(pendingMealTime.hours).padStart(2, '0')}:${String(pendingMealTime.minutes).padStart(2, '0')}`;
              const previewType = pendingMealType || HEYS.dayUtils.getMealTypeForPreview(timeStr, day.meals || []);
              const typeInfo = HEYS.dayUtils.MEAL_TYPES[previewType];
              return React.createElement('div', { className: 'meal-type-preview' },
                React.createElement('span', { className: 'meal-type-preview-label' }, 'Тип приёма:'),
                React.createElement('div', { className: 'meal-type-preview-value meal-type-' + previewType },
                  React.createElement('span', { className: 'meal-type-preview-icon' }, typeInfo.icon),
                  React.createElement('span', { className: 'meal-type-preview-name' }, typeInfo.name),
                  React.createElement('select', {
                    className: 'meal-type-preview-select',
                    value: previewType,
                    onChange: (e) => setPendingMealType(e.target.value)
                  },
                    Object.entries(HEYS.dayUtils.MEAL_TYPES).map(([key, val]) =>
                      React.createElement('option', { key, value: key }, val.icon + ' ' + val.name)
                    )
                  )
                )
              );
            })()
          ),
          
          // Step 2: Самочувствие (показывается при editMode='new' или 'mood')
          pickerStep === 2 && React.createElement('div', { 
            className: 'time-picker-step' + (animDirection === 'forward' ? '' : ' back'),
            key: 'step2'
          },
            React.createElement('div', { className: 'time-picker-header' },
              // Если редактируем только оценки — "Отмена", если новый — "← Назад"
              editMode === 'mood'
                ? React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTimePicker }, 'Отмена')
                : React.createElement('button', { className: 'time-picker-cancel', onClick: goBackToTimeStep }, '← Назад'),
              React.createElement('span', { className: 'time-picker-title' }, editMode === 'mood' ? 'Оценки' : 'Самочувствие'),
              // Если редактируем только оценки — confirmMoodEdit, если новый — confirmMealCreation
              editMode === 'mood'
                ? React.createElement('button', { className: 'time-picker-confirm', onClick: confirmMoodEdit }, 'Готово')
                : React.createElement('button', { className: 'time-picker-confirm', onClick: confirmMealCreation }, 'Готово')
            ),
            // Подсказка для первого приёма в день
            (day.meals || []).length === 0 && editMode === 'new' && React.createElement('div', { className: 'mood-hint-first' },
              '💡 Ставьте первую оценку, которая пришла в голову — это самое верное интуитивное решение'
            ),
            // Helper функции для слайдеров
            // Dynamic emoji по значению
            ...(() => {
              const getMoodEmoji = (v) => ['😢','😢','😕','😕','😐','😐','🙂','🙂','😊','😊','😄'][v] || '😊';
              const getWellbeingEmoji = (v) => ['🤒','🤒','😓','😓','😐','😐','🙂','🙂','💪','💪','🏆'][v] || '💪';
              const getStressEmoji = (v) => ['😌','😌','🙂','🙂','😐','😐','😟','😟','😰','😰','😱'][v] || '😰';
              
              // Composite mood face на основе всех трёх оценок
              const getCompositeFace = () => {
                const m = pendingMealMood.mood || 5;
                const w = pendingMealMood.wellbeing || 5;
                const s = pendingMealMood.stress || 5;
                const avg = (m + w + (10 - s)) / 3; // stress инвертируем
                if (avg >= 8) return { emoji: '🤩', text: 'Супер!' };
                if (avg >= 6.5) return { emoji: '😊', text: 'Хорошо' };
                if (avg >= 5) return { emoji: '😐', text: 'Норм' };
                if (avg >= 3.5) return { emoji: '😕', text: 'Так себе' };
                return { emoji: '😢', text: 'Плохо' };
              };
              const compositeFace = getCompositeFace();
              
              // ⏰ Таймер с последнего приёма пищи
              const getTimeSinceLastMeal = () => {
                const meals = day.meals || [];
                if (meals.length === 0) return null;
                const lastMeal = meals[meals.length - 1];
                if (!lastMeal.time) return null;
                
                const [h, m] = lastMeal.time.split(':').map(Number);
                const lastMealDate = new Date();
                lastMealDate.setHours(h, m, 0, 0);
                
                const now = new Date();
                const diffMs = now - lastMealDate;
                if (diffMs < 0) return null; // прошлый день
                
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                
                // Инсулиновая волна из профиля (по умолчанию 4 часа)
                const insulinWave = prof?.insulinWaveHours || 4;
                const isInsulinOk = diffHours >= insulinWave;
                
                return {
                  hours: diffHours,
                  mins: diffMins,
                  isOk: isInsulinOk,
                  insulinWave
                };
              };
              const timeSinceLastMeal = getTimeSinceLastMeal();
              
              // 🎉 Триггер confetti при идеальных оценках (используем состояние из родительского компонента)
              const triggerConfetti = () => {
                if (!showConfetti) {
                  // Ни звука, ни вибрации: три собственных синтезатора этого
                  // экрана (аккорд-празднование, тик ползунка, звук хорошей
                  // оценки) шли мимо HEYS.audio и мимо переключателей звука.
                  // Строка «звук · правило продукта»: звуков два, оба здесь ни
                  // при чём.
                  setShowConfetti(true);
                  setTimeout(() => setShowConfetti(false), 2000);
                }
              };
              
              // Цвет значения по позиции (positive: red→blue→green)
              const getPositiveColor = (v) => HEYS.scales.wellbeing(v).color;
              const getNegativeColor = (v) => HEYS.scales.stress(v).color;
              
              // Корреляция с прошлыми данными
              const getCorrelationHint = () => {
                try {
                  // Ищем похожие паттерны за последние 14 дней
                  const mood = pendingMealMood.mood;
                  const stress = pendingMealMood.stress;
                  if (mood === 0 && stress === 0) return null;
                  
                  for (let i = 1; i <= 14; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dData = lsGet('heys_dayv2_' + fmtDate(d), null);
                    if (!dData) continue;
                    
                    // Низкое настроение — ищем связь с недосыпом
                    if (mood > 0 && mood <= 3 && dData.sleepHours && dData.sleepHours < 6) {
                      const dMoods = (dData.meals || []).map(m => m.mood).filter(v => v > 0);
                      const avgMood = dMoods.length > 0 ? dMoods.reduce((a,b) => a+b, 0) / dMoods.length : 5;
                      if (avgMood <= 4) {
                        return { icon: '💡', text: `${i} дн. назад при ${dData.sleepHours}ч сна тоже было настроение ${Math.round(avgMood)}` };
                      }
                    }
                    
                    // Высокий стресс — ищем связь с переработкой
                    if (stress >= 7) {
                      const dStress = (dData.meals || []).map(m => m.stress).filter(v => v > 0);
                      const avgStress = dStress.length > 0 ? dStress.reduce((a,b) => a+b, 0) / dStress.length : 5;
                      if (avgStress >= 7) {
                        return { icon: '🔄', text: `${i} дн. назад тоже был высокий стресс — паттерн?` };
                      }
                    }
                  }
                } catch (e) {}
                return null;
              };
              
              const correlationHint = getCorrelationHint();
              
              // emojiAnimating теперь на уровне компонента (useState нельзя в IIFE)
              
              // Quick chips для комментария
              const getQuickChips = () => {
                if (moodJournalState === 'negative') {
                  if (pendingMealMood.stress >= 7) return ['Работа', 'Дедлайн', 'Конфликт', 'Усталость'];
                  if (pendingMealMood.wellbeing <= 3) return ['Голова', 'Живот', 'Слабость', 'Недосып'];
                  if (pendingMealMood.mood <= 3) return ['Тревога', 'Грусть', 'Злость', 'Апатия'];
                  return ['Устал', 'Стресс', 'Плохо спал'];
                }
                if (moodJournalState === 'positive') {
                  if (pendingMealMood.mood >= 8) return ['Радость', 'Успех', 'Встреча', 'Природа'];
                  if (pendingMealMood.stress <= 2) return ['Отдых', 'Медитация', 'Прогулка', 'Спорт'];
                  return ['Хороший день', 'Энергия', 'Мотивация'];
                }
                return [];
              };
              
              // Подсчёт заполненности
              const filledCount = (pendingMealMood.mood > 0 ? 1 : 0) + (pendingMealMood.wellbeing > 0 ? 1 : 0) + (pendingMealMood.stress > 0 ? 1 : 0);
              
              // Разница с предыдущим приёмом
              const prevMeal = (day.meals || []).length > 0 ? day.meals[day.meals.length - 1] : null;
              const getDiff = (current, prev) => {
                if (!prev || prev === 0 || current === 0) return null;
                const diff = current - prev;
                if (diff === 0) return { text: '=', className: 'diff-same' };
                if (diff > 0) return { text: `+${diff}`, className: 'diff-up' };
                return { text: `${diff}`, className: 'diff-down' };
              };
              
              // Сравнение с вчера (средние значения)
              const getYesterdayAvg = (field) => {
                try {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  const yKey = 'heys_dayv2_' + fmtDate(yesterday);
                  const yData = lsGet(yKey, null);
                  if (!yData || !yData.meals || yData.meals.length === 0) return null;
                  const values = yData.meals.map(m => m[field]).filter(v => v > 0);
                  if (values.length === 0) return null;
                  return Math.round(values.reduce((a,b) => a+b, 0) / values.length);
                } catch (e) { return null; }
              };
              const yesterdayMood = getYesterdayAvg('mood');
              const yesterdayWellbeing = getYesterdayAvg('wellbeing');
              const yesterdayStress = getYesterdayAvg('stress');
              
              // AI-подсказка корреляции (mood→eating pattern)
              const getAIInsight = () => {
                try {
                  // Собираем историю за 14 дней
                  const history = [];
                  for (let i = 1; i <= 14; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dData = lsGet('heys_dayv2_' + fmtDate(d), null);
                    if (dData && dData.meals && dData.meals.length > 0) {
                      // Средние оценки за день
                      const moods = dData.meals.map(m => m.mood).filter(v => v > 0);
                      const avgMood = moods.length > 0 ? moods.reduce((a,b) => a+b, 0) / moods.length : 5;
                      // Калории за день
                      let kcal = 0;
                      dData.meals.forEach(m => (m.items || []).forEach(item => {
                        const nameKey = (item.name || '').trim().toLowerCase();
                        const p = (nameKey && pIndex?.byName?.get(nameKey)) || (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
                        const src = p || item; // fallback to inline data
                        if (src.kcal100 != null) kcal += ((+src.kcal100 || 0) * (+item.grams || 0) / 100);
                      }));
                      const ratio = kcal / (optimum || 2000);
                      history.push({ avgMood, ratio });
                    }
                  }
                  if (history.length < 5) return null;
                  
                  // Анализируем паттерны
                  const lowMoodDays = history.filter(h => h.avgMood < 5);
                  const highMoodDays = history.filter(h => h.avgMood >= 7);
                  
                  const currentMood = pendingMealMood.mood;
                  
                  if (currentMood < 5 && lowMoodDays.length >= 3) {
                    const avgOvereat = lowMoodDays.reduce((a, h) => a + h.ratio, 0) / lowMoodDays.length;
                    if (avgOvereat > 1.15) {
                      const overPct = Math.round((avgOvereat - 1) * 100);
                      return { icon: '🤖', text: `При плохом настроении ты обычно переедаешь на ${overPct}%` };
                    }
                  }
                  
                  if (currentMood >= 7 && highMoodDays.length >= 3) {
                    const avgRatio = highMoodDays.reduce((a, h) => a + h.ratio, 0) / highMoodDays.length;
                    if (avgRatio >= 0.85 && avgRatio <= 1.1) {
                      return { icon: '✨', text: 'Хорошее настроение = сбалансированное питание!' };
                    }
                  }
                  
                  return null;
                } catch (e) { return null; }
              };
              const aiInsight = getAIInsight();
              
              // Контекстные подсказки по времени дня
              const getTimeHint = () => {
                const hour = new Date().getHours();
                if (hour >= 6 && hour < 10) return '☀️ Как проснулся?';
                if (hour >= 12 && hour < 14) return '🍽️ Как после обеда?';
                if (hour >= 14 && hour < 17) return '😴 Не клонит в сон?';
                if (hour >= 17 && hour < 21) return '🌆 Как день прошёл?';
                if (hour >= 21 || hour < 6) return '🌙 Устал за день?';
                return null;
              };
              const timeHint = getTimeHint();
              
              // Mini sparkline для последних 5 приёмов
              const getSparkline = (field) => {
                const meals = day.meals || [];
                if (meals.length === 0) return null;
                const values = meals.slice(-5).map(m => m[field] || 0).filter(v => v > 0);
                if (values.length === 0) return null;
                return values;
              };
              
              const renderSparkline = (values, isNegative = false) => {
                if (!values || values.length === 0) return null;
                const max = 10;
                const width = 60;
                const height = 16;
                const step = width / Math.max(values.length - 1, 1);
                const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');
                return React.createElement('svg', { 
                  className: 'mood-sparkline',
                  width: width, 
                  height: height,
                  viewBox: `0 0 ${width} ${height}`
                },
                  React.createElement('polyline', {
                    points: points,
                    fill: 'none',
                    stroke: isNegative ? '#ef4444' : '#22c55e',
                    strokeWidth: 2,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round'
                  })
                );
              };
              
              // Рендер метки "вчера"
              const renderYesterdayMark = (value, isNegative = false) => {
                if (value === null) return null;
                const pct = (value / 10) * 100;
                return React.createElement('div', { 
                  className: 'yesterday-mark',
                  style: { left: `${pct}%` },
                  title: `Вчера в среднем: ${value}`
                }, '▼');
              };
              
              const moodDiff = getDiff(pendingMealMood.mood, prevMeal?.mood);
              const wellbeingDiff = getDiff(pendingMealMood.wellbeing, prevMeal?.wellbeing);
              const stressDiff = getDiff(pendingMealMood.stress, prevMeal?.stress);
              
              // Вычисляем общее состояние на основе всех 3 оценок
              const { mood, wellbeing, stress } = pendingMealMood;
              const hasAnyRating = mood > 0 || wellbeing > 0 || stress > 0;
              
              // Позитивные сигналы: высокие mood/wellbeing (≥7), низкий stress (≤3)
              const positiveSignals = (mood >= 7 ? 1 : 0) + (wellbeing >= 7 ? 1 : 0) + (stress > 0 && stress <= 3 ? 1 : 0);
              // Негативные сигналы: низкие mood/wellbeing (≤3), высокий stress (≥7)
              const negativeSignals = (mood > 0 && mood <= 3 ? 1 : 0) + (wellbeing > 0 && wellbeing <= 3 ? 1 : 0) + (stress >= 7 ? 1 : 0);
              
              // Определяем состояние: positive, negative или neutral
              const moodJournalState = negativeSignals >= 2 ? 'negative' : // 2+ плохих = плохо
                                       negativeSignals === 1 && positiveSignals === 0 ? 'negative' : // 1 плохой и нет хороших = плохо  
                                       positiveSignals >= 2 ? 'positive' : // 2+ хороших = хорошо
                                       positiveSignals === 1 && negativeSignals === 0 ? 'positive' : // 1 хороший и нет плохих = хорошо
                                       'neutral'; // смешанные или нейтральные оценки
              
              // Детальный текст в зависимости от комбинации оценок
              const getJournalText = () => {
                if (moodJournalState === 'negative') {
                  // Комбинации негативных состояний
                  if (stress >= 8 && mood <= 3 && wellbeing <= 3) return '😰 Тяжёлый момент — что происходит?';
                  if (stress >= 8 && mood <= 3) return 'Стресс + плохое настроение — расскажи';
                  if (stress >= 8 && wellbeing <= 3) return 'Стресс + плохое самочувствие — что случилось?';
                  if (mood <= 3 && wellbeing <= 3) return 'И настроение, и самочувствие... что не так?';
                  if (stress >= 7) return 'Что стрессует?';
                  if (wellbeing <= 3) return 'Плохое самочувствие — что беспокоит?';
                  if (mood <= 3) return 'Плохое настроение — что расстроило?';
                  return 'Что случилось?';
                }
                if (moodJournalState === 'positive') {
                  // Комбинации позитивных состояний
                  if (mood >= 9 && wellbeing >= 9 && stress <= 2) return '🌟 Идеальное состояние! В чём секрет?';
                  if (mood >= 8 && wellbeing >= 8) return '✨ Отлично себя чувствуешь! Что помогло?';
                  if (mood >= 8 && stress <= 2) return 'Отличное настроение и спокойствие!';
                  if (wellbeing >= 8 && stress <= 2) return 'Прекрасное самочувствие! Что способствует?';
                  if (mood >= 7) return 'Хорошее настроение! Что порадовало?';
                  if (wellbeing >= 7) return 'Хорошее самочувствие! Запиши причину';
                  if (stress <= 2) return 'Спокойствие — что помогает расслабиться?';
                  return 'Запиши что порадовало!';
                }
                // neutral — разные контексты
                if (mood >= 5 && mood <= 6 && wellbeing >= 5 && wellbeing <= 6) return 'Стабильный день — любые мысли?';
                if (stress >= 4 && stress <= 6) return 'Немного напряжения — хочешь записать?';
                return 'Заметка о приёме пищи';
              };
              
              const getJournalPlaceholder = () => {
                if (moodJournalState === 'negative') {
                  if (stress >= 7) return 'Работа, отношения, здоровье...';
                  if (wellbeing <= 3) return 'Симптомы, усталость, боль...';
                  if (mood <= 3) return 'Что расстроило или разозлило...';
                  return 'Расскажи что не так...';
                }
                if (moodJournalState === 'positive') {
                  if (mood >= 8 && wellbeing >= 8) return 'Что сделало день отличным?';
                  if (stress <= 2) return 'Медитация, прогулка, отдых...';
                  return 'Что сделало момент хорошим?';
                }
                return 'Любые мысли о еде или дне...';
              };

              const journalConfig = {
                negative: { 
                  icon: '📝', 
                  text: getJournalText(),
                  placeholder: getJournalPlaceholder(),
                  btnText: 'Записать'
                },
                positive: {
                  icon: '✨',
                  text: getJournalText(),
                  placeholder: getJournalPlaceholder(),
                  btnText: 'Записать'
                },
                neutral: {
                  icon: '💭',
                  text: getJournalText(),
                  placeholder: getJournalPlaceholder(),
                  btnText: 'Записать'
                }
              };
              
              // Slider handler с haptic, звуком и анимацией emoji
              const handleSliderChange = (field, value, prevValue) => {
                
                // Emoji анимация
                if (value !== prevValue) {
                  const animType = (field === 'stress' && value >= 7) || 
                                   ((field === 'mood' || field === 'wellbeing') && value <= 3) 
                                   ? 'shake' : 'bounce';
                  setEmojiAnimating(prev => ({...prev, [field]: animType}));
                  setTimeout(() => setEmojiAnimating(prev => ({...prev, [field]: ''})), 400);
                }
                
                // Обновляем состояние
                const newMood = {...pendingMealMood, [field]: value};
                setPendingMealMood(newMood);
                
                // Проверяем идеальные оценки для confetti
                const isPerfect = newMood.mood >= 8 && newMood.wellbeing >= 8 && 
                                  newMood.stress > 0 && newMood.stress <= 2;
                if (isPerfect && !showConfetti) {
                  triggerConfetti();
                }
              };
              
              // Добавить chip в комментарий
              const addChipToComment = (chip) => {
                const current = pendingMealMood.journalEntry || '';
                const newEntry = current ? current + ', ' + chip : chip;
                setPendingMealMood(prev => ({...prev, journalEntry: newEntry}));
              };
              
              return [
            // 🎉 Confetti animation
            showConfetti && React.createElement('div', { className: 'confetti-container mood-confetti', key: 'confetti' },
              ...Array(20).fill(0).map((_, i) => 
                React.createElement('div', { 
                  key: 'confetti-' + i, 
                  className: 'confetti-piece',
                  style: {
                    left: (5 + Math.random() * 90) + '%',
                    animationDelay: (Math.random() * 0.5) + 's',
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#3b82f6'][i % 5]
                  }
                })
              )
            ),
            
            // Progress dots
            React.createElement('div', { className: 'rating-progress-dots', key: 'progress-dots' },
              React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.mood > 0 ? ' filled' : '') }),
              React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.wellbeing > 0 ? ' filled' : '') }),
              React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.stress > 0 ? ' filled' : '') })
            ),
            
            // ⏰ Таймер с последнего приёма
            timeSinceLastMeal && React.createElement('div', { 
              className: 'meal-timer-hint' + (timeSinceLastMeal.isOk ? ' ok' : ' warning'),
              key: 'meal-timer'
            },
              React.createElement('span', { className: 'meal-timer-icon' }, timeSinceLastMeal.isOk ? '✅' : '⏰'),
              React.createElement('span', { className: 'meal-timer-text' },
                timeSinceLastMeal.hours > 0 
                  ? `${timeSinceLastMeal.hours}ч ${timeSinceLastMeal.mins}мин с прошлого приёма`
                  : `${timeSinceLastMeal.mins} мин с прошлого приёма`
              ),
              !timeSinceLastMeal.isOk && React.createElement('span', { className: 'meal-timer-wave' },
                ` (инсулиновая волна ${timeSinceLastMeal.insulinWave}ч)`
              )
            ),
            
            // Mood Face Avatar (большое лицо вверху)
            React.createElement('div', { className: 'mood-face-avatar', key: 'mood-face' },
              React.createElement('span', { className: 'mood-face-emoji' + (showConfetti ? ' celebrate' : '') }, compositeFace.emoji),
              React.createElement('span', { className: 'mood-face-text' }, compositeFace.text)
            ),
            
            // Контекстная подсказка по времени
            timeHint && (day.meals || []).length === 0 && React.createElement('div', { className: 'mood-time-hint', key: 'time-hint' }, timeHint),
            
            // AI-инсайт
            aiInsight && React.createElement('div', { className: 'mood-ai-insight', key: 'ai-insight' },
              React.createElement('span', null, aiInsight.icon),
              React.createElement('span', null, aiInsight.text)
            ),
            
            // Корреляция с прошлыми данными
            correlationHint && React.createElement('div', { className: 'correlation-hint', key: 'correlation-hint' },
              React.createElement('span', { className: 'correlation-hint-icon' }, correlationHint.icon),
              React.createElement('span', { className: 'correlation-hint-text' }, correlationHint.text)
            ),
            
            // Слайдеры оценок
            React.createElement('div', { className: 'mood-sliders', key: 'mood-sliders' },
              // Настроение
              React.createElement('div', { className: 'mood-slider-row' },
                React.createElement('div', { className: 'mood-slider-header' },
                  React.createElement('span', { 
                    className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.mood ? ' animate-' + emojiAnimating.mood : '')
                  }, getMoodEmoji(pendingMealMood.mood)),
                  React.createElement('span', { className: 'mood-slider-label' }, 'Настроение'),
                  React.createElement('span', { 
                    className: 'mood-slider-value' + (pendingMealMood.mood !== (prevMeal?.mood || 0) ? ' pulse' : ''), 
                    style: { color: pendingMealMood.mood === 0 ? '#999' : getPositiveColor(pendingMealMood.mood) }
                  }, pendingMealMood.mood === 0 ? '—' : pendingMealMood.mood),
                  moodDiff && React.createElement('span', { className: 'mood-diff ' + moodDiff.className }, moodDiff.text)
                ),
                // Quick presets
                React.createElement('div', { className: 'mood-presets' },
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-bad' + (pendingMealMood.mood <= 3 && pendingMealMood.mood > 0 ? ' active' : ''),
                    onClick: () => { handleSliderChange('mood', 2, pendingMealMood.mood); }
                  }, '😢 Плохо'),
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-ok' + (pendingMealMood.mood >= 4 && pendingMealMood.mood <= 6 ? ' active' : ''),
                    onClick: () => { handleSliderChange('mood', 5, pendingMealMood.mood); }
                  }, '😐 Норм'),
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-good' + (pendingMealMood.mood >= 7 ? ' active' : ''),
                    onClick: () => { handleSliderChange('mood', 8, pendingMealMood.mood); }
                  }, '😊 Отлично')
                ),
                React.createElement('div', { className: 'mood-slider-track' },
                  React.createElement('input', {
                    type: 'range',
                    min: 0,
                    max: 10,
                    value: pendingMealMood.mood,
                    className: 'mood-slider mood-slider-positive',
                    onChange: (e) => handleSliderChange('mood', parseInt(e.target.value))
                  }),
                  renderYesterdayMark(yesterdayMood)
                ),
                // Sparkline истории
                (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                  renderSparkline(getSparkline('mood')),
                  React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                )
              ),
              // Самочувствие
              React.createElement('div', { className: 'mood-slider-row' },
                React.createElement('div', { className: 'mood-slider-header' },
                  React.createElement('span', { 
                    className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.wellbeing ? ' animate-' + emojiAnimating.wellbeing : '')
                  }, getWellbeingEmoji(pendingMealMood.wellbeing)),
                  React.createElement('span', { className: 'mood-slider-label' }, 'Самочувствие'),
                  React.createElement('span', { 
                    className: 'mood-slider-value' + (pendingMealMood.wellbeing !== (prevMeal?.wellbeing || 0) ? ' pulse' : ''), 
                    style: { color: pendingMealMood.wellbeing === 0 ? '#999' : getPositiveColor(pendingMealMood.wellbeing) }
                  }, pendingMealMood.wellbeing === 0 ? '—' : pendingMealMood.wellbeing),
                  wellbeingDiff && React.createElement('span', { className: 'mood-diff ' + wellbeingDiff.className }, wellbeingDiff.text)
                ),
                React.createElement('div', { className: 'mood-presets' },
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-bad' + (pendingMealMood.wellbeing <= 3 && pendingMealMood.wellbeing > 0 ? ' active' : ''),
                    onClick: () => { handleSliderChange('wellbeing', 2, pendingMealMood.wellbeing); }
                  }, '🤒 Плохо'),
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-ok' + (pendingMealMood.wellbeing >= 4 && pendingMealMood.wellbeing <= 6 ? ' active' : ''),
                    onClick: () => { handleSliderChange('wellbeing', 5, pendingMealMood.wellbeing); }
                  }, '😐 Норм'),
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-good' + (pendingMealMood.wellbeing >= 7 ? ' active' : ''),
                    onClick: () => { handleSliderChange('wellbeing', 8, pendingMealMood.wellbeing); }
                  }, '💪 Отлично')
                ),
                React.createElement('div', { className: 'mood-slider-track' },
                  React.createElement('input', {
                    type: 'range',
                    min: 0,
                    max: 10,
                    value: pendingMealMood.wellbeing,
                    className: 'mood-slider mood-slider-positive',
                    onChange: (e) => handleSliderChange('wellbeing', parseInt(e.target.value))
                  }),
                  renderYesterdayMark(yesterdayWellbeing)
                ),
                (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                  renderSparkline(getSparkline('wellbeing')),
                  React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                )
              ),
              // Стресс (инверсия)
              React.createElement('div', { className: 'mood-slider-row' },
                React.createElement('div', { className: 'mood-slider-header' },
                  React.createElement('span', { 
                    className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.stress ? ' animate-' + emojiAnimating.stress : '')
                  }, getStressEmoji(pendingMealMood.stress)),
                  React.createElement('span', { className: 'mood-slider-label' }, 'Стресс'),
                  React.createElement('span', { 
                    className: 'mood-slider-value' + (pendingMealMood.stress !== (prevMeal?.stress || 0) ? ' pulse' : ''), 
                    style: { color: pendingMealMood.stress === 0 ? '#999' : getNegativeColor(pendingMealMood.stress) }
                  }, pendingMealMood.stress === 0 ? '—' : pendingMealMood.stress),
                  stressDiff && React.createElement('span', { className: 'mood-diff ' + (stressDiff.text.startsWith('+') ? 'diff-down' : stressDiff.text === '=' ? 'diff-same' : 'diff-up') }, stressDiff.text)
                ),
                React.createElement('div', { className: 'mood-presets' },
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-good' + (pendingMealMood.stress <= 3 && pendingMealMood.stress > 0 ? ' active' : ''),
                    onClick: () => { handleSliderChange('stress', 2, pendingMealMood.stress); }
                  }, '😌 Спокоен'),
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-ok' + (pendingMealMood.stress >= 4 && pendingMealMood.stress <= 6 ? ' active' : ''),
                    onClick: () => { handleSliderChange('stress', 5, pendingMealMood.stress); }
                  }, '😐 Норм'),
                  React.createElement('button', { 
                    className: 'mood-preset mood-preset-bad' + (pendingMealMood.stress >= 7 ? ' active' : ''),
                    onClick: () => { handleSliderChange('stress', 8, pendingMealMood.stress); }
                  }, '😰 Стресс')
                ),
                React.createElement('div', { className: 'mood-slider-track' },
                  React.createElement('input', {
                    type: 'range',
                    min: 0,
                    max: 10,
                    value: pendingMealMood.stress,
                    className: 'mood-slider mood-slider-negative',
                    onChange: (e) => handleSliderChange('stress', parseInt(e.target.value))
                  }),
                  renderYesterdayMark(yesterdayStress, true)
                ),
                (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                  renderSparkline(getSparkline('stress'), true),
                  React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                )
              )
            ),
            
            // Блок комментария — всегда виден, стиль меняется по всем 3 оценкам
            React.createElement('div', { 
              className: 'mood-journal-wrapper ' + moodJournalState, 
              key: 'journal-wrapper' 
            },
              React.createElement('div', { 
                className: 'mood-journal-prompt ' + moodJournalState
              },
                React.createElement('span', { className: 'mood-journal-icon' }, journalConfig[moodJournalState].icon),
                React.createElement('span', { className: 'mood-journal-text' }, journalConfig[moodJournalState].text),
                // Quick chips для быстрого ввода
                getQuickChips().length > 0 && React.createElement('div', { 
                  className: 'quick-chips ' + moodJournalState 
                },
                  getQuickChips().map(chip => 
                    React.createElement('button', { 
                      key: chip,
                      className: 'quick-chip' + ((pendingMealMood.journalEntry || '').includes(chip) ? ' selected' : ''),
                      onClick: () => addChipToComment(chip)
                    }, chip)
                  )
                ),
                // Поле ввода комментария
                React.createElement('input', {
                  type: 'text',
                  className: 'mood-journal-input',
                  placeholder: journalConfig[moodJournalState].placeholder,
                  value: pendingMealMood.journalEntry || '',
                  onChange: (e) => setPendingMealMood(prev => ({...prev, journalEntry: e.target.value})),
                  onClick: (e) => e.stopPropagation()
                })
              )
            )
              ];
            })()
          )
        )
      ),
      document.body
    );
  }

  HEYS.dayTimeMoodPicker = {
    renderTimeMoodPicker
  };
})(window);
