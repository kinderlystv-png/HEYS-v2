
/* ===== heys_day_stats_bundle_loader_v1.js ===== */
// heys_day_stats_bundle_loader_v1.js — loader bundle for stats/water/activity modules
// 🆕 PERF v9.2: Метка момента когда boot-day начал исполняться
window.__heysPerfMark && window.__heysPerfMark('boot-day: execute start');
; (function (global) {
    const HEYS = (global.HEYS = global.HEYS || {});

    const scripts = [
        'heys_day_stats_vm_v1.js',
        'heys_day_stats_v1.js',
        'heys_day_water_v1.js',
        'heys_day_activity_v1.js',
        'heys_day_trainings_v1.js',
        'heys_day_training_popups_v1.js',
        'heys_day_sleep_score_popups_v1.js'
    ];

    function reportError(error, src) {
        try {
            if (HEYS?.analytics?.trackError) {
                HEYS.analytics.trackError(error instanceof Error ? error : new Error(String(error)), {
                    module: 'heys_day_stats_bundle_loader_v1',
                    src: src || null
                });
            }
        } catch (_) {
            // noop
        }
    }

    function loadSequential(index) {
        if (index >= scripts.length) return;
        const script = document.createElement('script');
        script.src = scripts[index];
        script.async = false;
        script.defer = true;
        script.onload = () => loadSequential(index + 1);
        script.onerror = () => {
            reportError(new Error('Failed to load ' + scripts[index]), scripts[index]);
        };
        document.head.appendChild(script);
    }

    try {
        loadSequential(0);
    } catch (e) {
        reportError(e, 'init');
    }
})(window);


/* ===== heys_day_edit_grams_modal_v1.js ===== */
// heys_day_edit_grams_modal_v1.js — Edit grams modal renderer
// Extracted from heys_day_v12.js

;(function(global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  function renderEditGramsModal(params) {
    if (!React || !ReactDOM) return null;

    const {
      editGramsTarget,
      editGramsValue,
      editPortions,
      editLastPortionGrams,
      editGramsInputRef,
      setEditGramsValue,
      confirmEditGramsModal,
      cancelEditGramsModal,
      handleSheetTouchStart,
      handleSheetTouchMove,
      handleSheetTouchEnd,
      handleEditGramsDrag,
      haptic
    } = params || {};

    if (!editGramsTarget) return null;

    return ReactDOM.createPortal(
      React.createElement('div', { className: 'time-picker-backdrop grams-modal-backdrop', onClick: cancelEditGramsModal },
        React.createElement('div', { className: 'time-picker-modal grams-modal', onClick: e => e.stopPropagation() },
          // Ручка для свайпа
          React.createElement('div', { 
            className: 'bottom-sheet-handle',
            onTouchStart: handleSheetTouchStart,
            onTouchMove: handleSheetTouchMove,
            onTouchEnd: () => handleSheetTouchEnd(cancelEditGramsModal)
          }),
          // Header
          React.createElement('div', { className: 'time-picker-header' },
            React.createElement('button', { className: 'time-picker-cancel', onClick: cancelEditGramsModal }, 'Отмена'),
            React.createElement('span', { className: 'time-picker-title grams-modal-title' }, 
              editGramsTarget.product?.name || 'Граммы'
            ),
            React.createElement('button', { className: 'time-picker-confirm', onClick: confirmEditGramsModal }, 'Готово')
          ),
          // Главный input граммов (HERO)
          React.createElement('div', { className: 'grams-input-hero' },
            React.createElement('button', {
              className: 'grams-stepper-btn grams-stepper-btn--hero',
              onClick: () => {
                const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                setEditGramsValue(Math.max(step, editGramsValue - step));
                if (typeof haptic === 'function') haptic('light');
              }
            }, '−'),
            React.createElement('form', { 
              className: 'grams-input-hero__field',
              onSubmit: e => {
                e.preventDefault();
                confirmEditGramsModal();
              }
            },
              React.createElement('input', {
                ref: editGramsInputRef,
                type: 'text',
                inputMode: 'numeric',
                pattern: '[0-9]*',
                enterKeyHint: 'done',
                className: 'grams-input grams-input--hero',
                value: editGramsValue,
                onChange: e => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setEditGramsValue(Math.max(1, Math.min(2000, parseInt(val) || 0)));
                },
                onKeyDown: e => {
                  if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    e.target.blur();
                    confirmEditGramsModal();
                  }
                },
                onFocus: e => e.target.select(),
                onClick: e => e.target.select()
              }),
              React.createElement('span', { className: 'grams-input-suffix--hero' }, 'г')
            ),
            React.createElement('button', {
              className: 'grams-stepper-btn grams-stepper-btn--hero',
              onClick: () => {
                const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                setEditGramsValue(Math.min(2000, editGramsValue + step));
                if (typeof haptic === 'function') haptic('light');
              }
            }, '+')
          ),
          // Калории (вторичная информация)
          React.createElement('div', { className: 'grams-kcal-secondary' },
            React.createElement('span', { className: 'grams-kcal-secondary__value' }, 
              Math.round((editGramsTarget.product?.kcal100 || 0) * editGramsValue / 100) + ' ккал'
            )
          ),
          // 🍽️ Порции продукта (если есть)
          editPortions.length > 0 && React.createElement('div', { className: 'grams-portions' },
            editPortions.map((portion, idx) => {
              const isActive = editGramsValue === portion.grams;
              const isRecommended = editLastPortionGrams === portion.grams && !isActive;
              return React.createElement('button', {
                key: idx,
                className: 'grams-portion-btn' + (isActive ? ' active' : '') + (isRecommended ? ' recommended' : ''),
                onClick: () => {
                  setEditGramsValue(portion.grams);
                  if (typeof haptic === 'function') haptic('light');
                }
              }, 
                React.createElement('span', { className: 'portion-name' }, portion.name),
                React.createElement('span', { className: 'portion-grams' }, portion.grams + 'г')
              );
            })
          ),
          // Slider
          React.createElement('div', { className: 'grams-slider-container' },
            React.createElement('div', {
              className: 'grams-slider',
              onMouseDown: handleEditGramsDrag,
              onTouchStart: handleEditGramsDrag
            },
              React.createElement('div', { className: 'grams-slider-track' }),
              React.createElement('div', { 
                className: 'grams-slider-fill',
                style: { width: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
              }),
              React.createElement('div', { 
                className: 'grams-slider-thumb',
                style: { left: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
              }),
              // Метки
              [100, 200, 300, 400].map(mark => 
                React.createElement('div', {
                  key: mark,
                  className: 'grams-slider-mark',
                  style: { left: ((mark - 10) / (500 - 10) * 100) + '%' }
                })
              )
            ),
            React.createElement('div', { className: 'grams-slider-labels' },
              React.createElement('span', null, '10'),
              React.createElement('span', null, '500')
            )
          ),
          // Presets
          React.createElement('div', { className: 'grams-presets' },
            [50, 100, 150, 200, 250].map(preset =>
              React.createElement('button', {
                key: preset,
                className: 'grams-preset' + (editGramsValue === preset ? ' active' : ''),
                onClick: () => {
                  setEditGramsValue(preset);
                  try { navigator.vibrate?.(5); } catch(e) {}
                }
              }, preset + 'г')
            )
          )
        )
      ),
      document.body
    );
  }

  HEYS.dayEditGramsModal = {
    renderEditGramsModal
  };
})(window);


/* ===== heys_day_time_mood_picker_v1.js ===== */
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
                  setShowConfetti(true);
                  // Haptic celebration
                  if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50, 100]);
                  // Звук celebration
                  try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const playNote = (freq, time, dur) => {
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.type = 'sine';
                      osc.frequency.value = freq;
                      gain.gain.setValueAtTime(0.06, ctx.currentTime + time);
                      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + dur);
                      osc.start(ctx.currentTime + time);
                      osc.stop(ctx.currentTime + time + dur);
                    };
                    // Мажорный аккорд C-E-G-C
                    playNote(523.25, 0, 0.15);
                    playNote(659.25, 0.1, 0.15);
                    playNote(783.99, 0.2, 0.15);
                    playNote(1046.50, 0.3, 0.2);
                  } catch(e) {}
                  // Автоскрытие через 2 секунды
                  setTimeout(() => setShowConfetti(false), 2000);
                }
              };
              
              // Цвет значения по позиции (positive: red→blue→green)
              const getPositiveColor = (v) => {
                if (v <= 3) return '#ef4444';
                if (v <= 5) return '#3b82f6';
                if (v <= 7) return '#22c55e';
                return '#10b981';
              };
              // Negative: green→blue→red (для стресса)
              const getNegativeColor = (v) => {
                if (v <= 3) return '#10b981';
                if (v <= 5) return '#3b82f6';
                if (v <= 7) return '#eab308';
                return '#ef4444';
              };
              
              // Haptic feedback с интенсивностью
              const triggerHaptic = (intensity = 10) => {
                if (navigator.vibrate) navigator.vibrate(intensity);
              };
              
              // Звуковой tick (очень тихий) + success звук
              const playTick = (() => {
                let lastValue = null;
                return (value) => {
                  if (lastValue !== null && lastValue !== value) {
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.frequency.value = 800 + value * 50;
                      gain.gain.value = 0.03;
                      osc.start();
                      osc.stop(ctx.currentTime + 0.02);
                    } catch (e) {}
                  }
                  lastValue = value;
                };
              })();
              
              // Приятный звук при хорошей оценке (4-5)
              const playSuccessSound = () => {
                try {
                  const ctx = new (window.AudioContext || window.webkitAudioContext)();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                  osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
                  osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
                  gain.gain.setValueAtTime(0.05, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.25);
                } catch (e) {}
              };
              
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
                triggerHaptic(value >= 8 || value <= 2 ? 15 : 10);
                playTick(value);
                
                // Emoji анимация
                if (value !== prevValue) {
                  const animType = (field === 'stress' && value >= 7) || 
                                   ((field === 'mood' || field === 'wellbeing') && value <= 3) 
                                   ? 'shake' : 'bounce';
                  setEmojiAnimating(prev => ({...prev, [field]: animType}));
                  setTimeout(() => setEmojiAnimating(prev => ({...prev, [field]: ''})), 400);
                }
                
                // Success sound при хорошей оценке
                if (value >= 8 && prevValue < 8) playSuccessSound();
                
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
                triggerHaptic(5);
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


/* ===== heys_day_sparklines_v1.js ===== */
// heys_day_sparklines_v1.js — extracted sparklines

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.daySparklines = HEYS.daySparklines || {};

  HEYS.daySparklines.renderSparkline = function renderSparkline(ctx) {
    const {
      data,
      goal,
      React,
      haptic,
      openExclusivePopup,
      sparklineZoom,
      setSparklineZoom,
      sparklineZoomRef,
      sparklinePan,
      setSparklinePan,
      sliderPoint,
      setSliderPoint,
      sliderPrevPointRef,
      brushing,
      setBrushing,
      brushRange,
      setBrushRange,
      brushStartRef
    } = ctx || {};

    const safeHaptic = typeof haptic === 'function' ? haptic : () => { };
    const safeOpenPopup = typeof openExclusivePopup === 'function' ? openExclusivePopup : () => { };
    const safeSetSparklineZoom = typeof setSparklineZoom === 'function' ? setSparklineZoom : () => { };
    const safeSetSparklinePan = typeof setSparklinePan === 'function' ? setSparklinePan : () => { };
    const safeSetSliderPoint = typeof setSliderPoint === 'function' ? setSliderPoint : () => { };
    const safeSetBrushing = typeof setBrushing === 'function' ? setBrushing : () => { };
    const safeSetBrushRange = typeof setBrushRange === 'function' ? setBrushRange : () => { };

    // Skeleton loader пока данные загружаются
    if (!data) {
      return React.createElement('div', { className: 'sparkline-skeleton' },
        React.createElement('div', { className: 'sparkline-skeleton-line' }),
        React.createElement('div', { className: 'sparkline-skeleton-dots' },
          Array.from({ length: 7 }).map((_, i) =>
            React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
          )
        )
      );
    }

    if (data.length === 0) return null;

    // === Empty state: проверяем есть ли реальные данные (хотя бы 2 дня с kcal > 0) ===
    const daysWithData = data.filter(d => d.kcal > 0).length;
    if (daysWithData < 2) {
      const daysNeeded = 2 - daysWithData;
      return React.createElement('div', { className: 'sparkline-empty-state' },
        React.createElement('div', { className: 'sparkline-empty-icon' }, '📊'),
        React.createElement('div', { className: 'sparkline-empty-text' },
          daysWithData === 0
            ? 'Начните вести дневник питания'
            : 'Добавьте еду ещё за ' + daysNeeded + ' день'
        ),
        React.createElement('div', { className: 'sparkline-empty-hint' },
          'График появится после 2+ дней с данными'
        ),
        React.createElement('div', { className: 'sparkline-empty-progress' },
          React.createElement('div', {
            className: 'sparkline-empty-progress-bar',
            style: { width: (daysWithData / 2 * 100) + '%' }
          }),
          React.createElement('span', { className: 'sparkline-empty-progress-text' },
            daysWithData + ' / 2 дней'
          )
        ),
        React.createElement('button', {
          className: 'sparkline-empty-btn',
          onClick: () => {
            // Открываем модалку добавления приёма
            if (HEYS.Day && HEYS.Day.addMeal) {
              HEYS.Day.addMeal();
            }
            safeHaptic('light');
          }
        }, '+ Добавить еду')
      );
    }

    // === Helpers для выходных и праздников ===
    const RU_HOLIDAYS = [
      '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
      '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'
    ];
    const isWeekend = (dateStr) => {
      if (!dateStr) return false;
      const day = new Date(dateStr).getDay();
      return day === 0 || day === 6;
    };
    const isHoliday = (dateStr) => dateStr ? RU_HOLIDAYS.includes(dateStr.slice(5)) : false;
    const addDays = (dateStr, days) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      // Защита от Invalid Date (для новых пользователей без данных)
      if (isNaN(d.getTime())) return '';
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    // === Проверка: сегодня съедено < 50% нормы? ===
    // Если да, показываем сегодня как прогноз (пунктиром), а не как реальные данные
    const todayData = data.find(d => d.isToday);
    const todayRatio = todayData && todayData.target > 0 ? todayData.kcal / todayData.target : 0;
    const isTodayIncomplete = todayData && todayRatio < 0.5;

    // Обрабатываем данные:
    // 1. Помечаем пустые/неполные дни как "unknown" (будут показаны как "?")
    // 2. Интерполируем их kcal между соседними известными днями
    // 3. isFuture дни исключаются из основного графика — они станут прогнозом
    const processedData = data.map((d) => {
      // Будущие дни (isFuture) — исключаем из основного графика, покажем как прогноз
      if (d.isFuture) {
        return { ...d, isUnknown: false, excludeFromChart: true, isFutureDay: true };
      }

      // Сегодня неполный — отдельная логика (показываем как прогноз)
      if (d.isToday && isTodayIncomplete) {
        return { ...d, isUnknown: false, excludeFromChart: true };
      }

      // Пустой день или <50% нормы = неизвестный
      // Исключения:
      // - isFastingDay === true → данные корректны (осознанное голодание)
      // - isIncomplete === true → точно неизвестный (незаполненные данные)
      const ratio = d.target > 0 ? d.kcal / d.target : 0;
      const isLowRatio = d.kcal === 0 || (!d.isToday && ratio < 0.5);

      // Если явно помечен как fasting — считаем данные корректными
      if (d.isFastingDay) {
        return { ...d, isUnknown: false, excludeFromChart: false };
      }

      // Если явно помечен как incomplete — исключаем
      if (d.isIncomplete) {
        return { ...d, isUnknown: true, excludeFromChart: false };
      }

      const isUnknown = isLowRatio;

      return { ...d, isUnknown, excludeFromChart: false };
    });

    // Извлекаем будущие дни для прогноза
    const futureDays = processedData.filter(d => d.isFutureDay);

    // Интерполируем kcal для unknown дней
    const chartData = processedData.filter(d => !d.excludeFromChart).map((d, idx, arr) => {
      if (!d.isUnknown) return d;

      // Ищем ближайший известный день слева
      let leftKcal = null, leftIdx = idx - 1;
      while (leftIdx >= 0) {
        if (!arr[leftIdx].isUnknown) { leftKcal = arr[leftIdx].kcal; break; }
        leftIdx--;
      }

      // Ищем ближайший известный день справа
      let rightKcal = null, rightIdx = idx + 1;
      while (rightIdx < arr.length) {
        if (!arr[rightIdx].isUnknown) { rightKcal = arr[rightIdx].kcal; break; }
        rightIdx++;
      }

      // Интерполируем
      let interpolatedKcal;
      if (leftKcal !== null && rightKcal !== null) {
        // Линейная интерполяция между соседями
        const leftDist = idx - leftIdx;
        const rightDist = rightIdx - idx;
        const totalDist = leftDist + rightDist;
        interpolatedKcal = Math.round((leftKcal * rightDist + rightKcal * leftDist) / totalDist);
      } else if (leftKcal !== null) {
        interpolatedKcal = leftKcal; // Только слева — берём его
      } else if (rightKcal !== null) {
        interpolatedKcal = rightKcal; // Только справа — берём его
      } else {
        interpolatedKcal = d.target || goal; // Нет соседей — берём норму
      }

      return { ...d, kcal: interpolatedKcal, originalKcal: d.kcal };
    });

    // Прогноз на +1 день по тренду (завтра), или сегодня+завтра если сегодня неполный
    const forecastDays = 1;
    const hasEnoughData = chartData.length >= 3;
    // ВАЖНО: Если сегодня неполный — всегда показываем прогноз, даже если данных мало
    // Это гарантирует что сегодняшний день всегда виден на графике
    const shouldShowForecast = hasEnoughData || isTodayIncomplete;
    let forecastPoints = [];
    const lastChartDate = chartData[chartData.length - 1]?.date || '';

    if (shouldShowForecast && lastChartDate) {
      // Используем линейную регрессию по всем данным для более стабильного тренда
      // Это предотвращает "взлёты" из-за одного-двух дней переедания
      const n = chartData.length;
      const kcalValues = chartData.map(d => d.kcal);

      // Последнее значение и норма
      const lastKcal = n > 0 ? kcalValues[n - 1] : goal;
      const lastTarget = n > 0 ? (chartData[n - 1].target || goal) : goal;

      // Для прогноза: если мало данных — используем норму как прогноз
      // Иначе используем регрессию
      let blendedNext = goal;
      let clampedSlope = 0;

      if (n >= 3) {
        // Вычисляем линейную регрессию: y = a + b*x
        // b = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          sumX += i;
          sumY += kcalValues[i];
          sumXY += i * kcalValues[i];
          sumX2 += i * i;
        }

        const denominator = n * sumX2 - sumX * sumX;
        // slope = изменение ккал за 1 день по тренду
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        const intercept = (sumY - slope * sumX) / n;

        // Ограничиваем slope чтобы не было безумных прогнозов
        // Максимум ±150 ккал/день изменения тренда
        clampedSlope = Math.max(-150, Math.min(150, slope));

        // Для прогноза: используем регрессию, но ближе к последнему значению
        // Смешиваем: 60% регрессия + 40% продолжение от последнего значения
        const regressionNext = intercept + clampedSlope * n;
        const simpleNext = lastKcal + clampedSlope;
        blendedNext = regressionNext * 0.6 + simpleNext * 0.4;
      } else if (n > 0) {
        // Мало данных — используем последнее значение или норму
        blendedNext = lastKcal > 0 ? lastKcal : goal;
      }

      // Норма для прогнозных дней = текущий optimum (goal)
      // Норма зависит от BMR + активность, а не от тренда прошлых дней
      const forecastTarget = goal;

      // === Regression to Mean для прогноза калорий ===
      // Дни 1-2: тренд по данным (slope) — краткосрочный паттерн
      // Дни 3+: плавное возвращение к норме (гомеостаз)
      // Формула: kcal = prevKcal + (target - prevKcal) * decayRate
      const calculateForecastKcal = (dayIndex, prevKcal) => {
        if (dayIndex <= 2) {
          // Первые 2 дня — продолжаем тренд
          return dayIndex === 1
            ? Math.round(blendedNext)
            : Math.round(blendedNext + clampedSlope * (dayIndex - 1));
        } else {
          // Дни 3+ — regression to mean (возврат к норме на 30% за день)
          const decayRate = 0.3;
          return Math.round(prevKcal + (goal - prevKcal) * decayRate);
        }
      };

      // === ИСПРАВЛЕНИЕ: Если сегодня неполный — сначала добавляем его как прогноз ===
      let prevKcal = lastKcal;
      let dayIndexOffset = 0;

      if (isTodayIncomplete && todayData) {
        // Добавляем сегодня как первый прогнозный день
        const todayDateStr = todayData.date;
        const todayDayNum = todayDateStr ? new Date(todayDateStr).getDate() : '';
        const todayForecastKcal = calculateForecastKcal(1, prevKcal);
        prevKcal = todayForecastKcal;
        dayIndexOffset = 1; // Сдвигаем индексы для следующих дней

        forecastPoints.push({
          kcal: Math.max(0, todayForecastKcal),
          target: forecastTarget,
          isForecast: true,
          isTodayForecast: true, // Маркер что это прогноз на сегодня
          isFutureDay: false,
          date: todayDateStr,
          dayNum: todayDayNum,
          dayOfWeek: todayDateStr ? new Date(todayDateStr).getDay() : 0,
          isWeekend: isWeekend(todayDateStr) || isHoliday(todayDateStr)
        });
      }

      // === Добавляем будущие дни (futureDays) или стандартный прогноз ===
      if (futureDays.length > 0) {
        // Используем futureDays как основу для прогноза
        futureDays.forEach((fd, i) => {
          const dayIndex = i + 1 + dayIndexOffset; // Учитываем сдвиг если добавили сегодня
          const forecastDayNum = fd.date ? new Date(fd.date).getDate() : '';
          const forecastKcal = calculateForecastKcal(dayIndex, prevKcal);
          prevKcal = forecastKcal; // для следующей итерации

          forecastPoints.push({
            kcal: Math.max(0, forecastKcal),
            target: forecastTarget,  // Стабильная норма = текущий optimum
            isForecast: true,
            isFutureDay: true,  // Маркер что это будущий день (не динамический прогноз)
            isTodayForecast: false,
            date: fd.date,
            dayNum: forecastDayNum,
            dayOfWeek: fd.date ? new Date(fd.date).getDay() : 0,
            isWeekend: isWeekend(fd.date) || isHoliday(fd.date)
          });
        });
      } else {
        // === ВСЕГДА добавляем прогноз на завтра ===
        // Определяем базовую дату для прогноза:
        // - Если сегодня неполный — прогноз начинается от сегодня (уже добавлен выше)
        // - Иначе прогноз на день после последнего в chartData
        const baseDate = isTodayIncomplete && todayData
          ? todayData.date  // Сегодня уже добавлен как прогноз
          : lastChartDate;

        const tomorrowDate = addDays(baseDate, 1);

        // Защита: если нет валидной даты (новый пользователь без данных) — пропускаем прогноз
        if (tomorrowDate) {
          const tomorrowDayNum = new Date(tomorrowDate).getDate();
          const tomorrowDayIndex = isTodayIncomplete ? 2 : 1; // Если сегодня прогноз — завтра это 2-й день
          const tomorrowKcal = calculateForecastKcal(tomorrowDayIndex, prevKcal);

          forecastPoints.push({
            kcal: Math.max(0, tomorrowKcal),
            target: forecastTarget,
            isForecast: true,
            isTodayForecast: false,
            isFutureDay: true,
            date: tomorrowDate,
            dayNum: tomorrowDayNum,
            dayOfWeek: new Date(tomorrowDate).getDay(),
            isWeekend: isWeekend(tomorrowDate) || isHoliday(tomorrowDate)
          });
        }
      }
    }

    const totalPoints = chartData.length + forecastPoints.length;
    const width = 360;
    const height = 158; // увеличено для даты + дельты + дня недели
    const paddingTop = 16; // для меток над точками
    const paddingBottom = 52; // место для дат + дельты + дня недели
    const paddingX = 8; // минимальные отступы — точки почти у края
    const chartHeight = height - paddingTop - paddingBottom;

    // Адаптивная шкала Y: от минимума до максимума с отступами
    // Это делает разницу между точками более заметной
    const allKcalValues = [...chartData, ...forecastPoints].map(d => d.kcal).filter(v => v > 0);
    // 🔧 FIX: Для сегодняшнего дня используем goal (displayOptimum с долгом)
    const allTargetValues = [...chartData, ...forecastPoints].map(d => d.isToday ? goal : (d.target || goal));
    const allValues = [...allKcalValues, ...allTargetValues];

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const range = dataMax - dataMin;

    // Отступы: 15% снизу и сверху от диапазона данных
    const padding = Math.max(range * 0.15, 100); // минимум 100 ккал отступ
    const scaleMin = Math.max(0, dataMin - padding);
    const scaleMax = dataMax + padding;
    const scaleRange = scaleMax - scaleMin;

    // Основные точки данных (без неполного сегодня)
    const points = chartData.map((d, i) => {
      const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
      // Нормализуем к scaleMin-scaleMax
      const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
      const y = paddingTop + chartHeight - yNorm * chartHeight;
      // 🔧 FIX: Для сегодняшнего дня используем goal (displayOptimum с долгом), для прошлых — d.target
      const effectiveTarget = d.isToday ? goal : (d.target || goal);
      const targetNorm = scaleRange > 0 ? (effectiveTarget - scaleMin) / scaleRange : 0.5;
      const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
      // Извлекаем день из даты (последние 2 символа)
      const dayNum = d.date ? d.date.slice(-2).replace(/^0/, '') : '';
      const ratio = effectiveTarget > 0 ? d.kcal / effectiveTarget : 0;
      // Хороший день: используем централизованный ratioZones с учётом refeed
      const rz = HEYS.ratioZones;
      // isPerfect учитывает refeed (расширенный диапазон 0.70-1.35)
      const isPerfect = d.isUnknown ? false : (rz?.isStreakDayWithRefeed
        ? rz.isStreakDayWithRefeed(ratio, d)
        : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10)));
      // Выходные/праздники
      const isWeekendDay = isWeekend(d.date) || isHoliday(d.date);
      // День недели (0=Вс, 1=Пн, ...)
      const dayOfWeek = d.date ? new Date(d.date).getDay() : 0;
      return {
        x, y, kcal: d.kcal, target: effectiveTarget, spent: d.spent || effectiveTarget, targetY, ratio,
        isToday: d.isToday, dayNum, date: d.date, isPerfect,
        isUnknown: d.isUnknown || false, // флаг неизвестного дня
        hasTraining: d.hasTraining, trainingTypes: d.trainingTypes || [],
        trainingMinutes: d.trainingMinutes || 0,
        isWeekend: isWeekendDay, sleepQuality: d.sleepQuality || 0,
        sleepHours: d.sleepHours || 0, dayScore: d.dayScore || 0,
        steps: d.steps || 0,
        prot: d.prot || 0, fat: d.fat || 0, carbs: d.carbs || 0,
        dayOfWeek,
        isRefeedDay: d.isRefeedDay || false  // 🔄 Refeed day flag для UI
      };
    });

    // Точки прогноза (включая сегодня если неполный)
    const forecastPts = forecastPoints.map((d, i) => {
      const idx = chartData.length + i;
      const x = paddingX + (idx / (totalPoints - 1)) * (width - paddingX * 2);
      const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
      const y = paddingTop + chartHeight - yNorm * chartHeight;
      const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
      const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
      return {
        x, y, kcal: d.kcal, target: d.target, targetY, isForecast: true,
        isTodayForecast: d.isTodayForecast || false,
        isFutureDay: d.isFutureDay || false,  // Маркер будущего дня для UI
        dayNum: d.dayNum || '', date: d.date, isWeekend: d.isWeekend
      };
    });

    // Min/Max для меток
    const kcalValues = points.filter(p => p.kcal > 0).map(p => p.kcal);
    const minKcal = Math.min(...kcalValues);
    const maxKcalVal = Math.max(...kcalValues);
    const minPoint = points.find(p => p.kcal === minKcal);
    const maxPoint = points.find(p => p.kcal === maxKcalVal);

    // Плавная кривая через cubic bezier (catmull-rom → bezier)
    // С ограничением overshooting для монотонности
    const smoothPath = (pts, yKey = 'y') => {
      if (pts.length < 2) return '';
      if (pts.length === 2) return `M${pts[0].x},${pts[0][yKey]} L${pts[1].x},${pts[1][yKey]}`;

      let d = `M${pts[0].x},${pts[0][yKey]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        // Catmull-Rom → Cubic Bezier control points
        const tension = 0.25; // Уменьшено для меньшего overshooting

        // Базовые контрольные точки
        let cp1x = p1.x + (p2.x - p0.x) * tension;
        let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
        let cp2x = p2.x - (p3.x - p1.x) * tension;
        let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;

        // === Monotonic constraint: ограничиваем overshooting ===
        // Контрольные точки не должны выходить за пределы Y между p1 и p2
        const minY = Math.min(p1[yKey], p2[yKey]);
        const maxY = Math.max(p1[yKey], p2[yKey]);
        const margin = (maxY - minY) * 0.15; // 15% допуск

        cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
        cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));

        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
      }
      return d;
    };

    // Расчёт длины cubic bezier сегмента (приближение через разбиение на отрезки)
    const bezierLength = (p1, cp1, cp2, p2, steps = 10) => {
      let length = 0;
      let prevX = p1.x, prevY = p1.y;
      for (let t = 1; t <= steps; t++) {
        const s = t / steps;
        const u = 1 - s;
        // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
        const x = u * u * u * p1.x + 3 * u * u * s * cp1.x + 3 * u * s * s * cp2.x + s * s * s * p2.x;
        const y = u * u * u * p1.y + 3 * u * u * s * cp1.y + 3 * u * s * s * cp2.y + s * s * s * p2.y;
        length += Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
        prevX = x;
        prevY = y;
      }
      return length;
    };

    // Кумулятивные длины пути до каждой точки (для синхронизации анимации)
    const calcCumulativeLengths = (pts, yKey = 'y') => {
      const lengths = [0]; // первая точка = 0
      if (pts.length < 2) return lengths;

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const tension = 0.25;
        const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1[yKey] + (p2[yKey] - p0[yKey]) * tension };
        const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2[yKey] - (p3[yKey] - p1[yKey]) * tension };

        const segmentLen = bezierLength(
          { x: p1.x, y: p1[yKey] }, cp1, cp2, { x: p2.x, y: p2[yKey] }
        );
        lengths.push(lengths[lengths.length - 1] + segmentLen);
      }
      return lengths;
    };

    // === Известные точки для интерполяции Y у unknown ===
    const knownPoints = points.filter(p => !p.isUnknown);

    // === Вычисляем Y для unknown точек на кривой Безье ===
    // Сначала интерполируем Y, потом строим path по ВСЕМ точкам (для непрерывной линии)
    // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    const cubicBezier = (t, p0, cp1, cp2, p3) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * cp1 + 3 * u * t * t * cp2 + t * t * t * p3;
    };

    points.forEach((p) => {
      if (!p.isUnknown) return;

      // Находим между какими известными точками (по X) лежит unknown
      let leftIdx = -1, rightIdx = -1;
      for (let i = 0; i < knownPoints.length; i++) {
        if (knownPoints[i].x <= p.x) leftIdx = i;
        if (knownPoints[i].x > p.x && rightIdx < 0) { rightIdx = i; break; }
      }

      if (leftIdx < 0 || rightIdx < 0) {
        // Крайний случай — используем ближайшую точку
        if (leftIdx >= 0) p.y = knownPoints[leftIdx].y;
        else if (rightIdx >= 0) p.y = knownPoints[rightIdx].y;
        return;
      }

      // Catmull-Rom → Bezier control points (те же что в smoothPath)
      const tension = 0.25;
      const i = leftIdx;
      const p0 = knownPoints[Math.max(0, i - 1)];
      const p1 = knownPoints[i];
      const p2 = knownPoints[i + 1];
      const p3 = knownPoints[Math.min(knownPoints.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      // Находим t по X (приближённо, для Bezier X тоже кривая)
      // Используем итеративный поиск
      const targetX = p.x;
      let t = (targetX - p1.x) / (p2.x - p1.x); // начальное приближение

      // Несколько итераций Newton-Raphson для уточнения t
      for (let iter = 0; iter < 5; iter++) {
        const currentX = cubicBezier(t, p1.x, cp1x, cp2x, p2.x);
        const error = currentX - targetX;
        if (Math.abs(error) < 0.1) break;

        // Производная Bezier по t
        const u = 1 - t;
        const dx = 3 * u * u * (cp1x - p1.x) + 6 * u * t * (cp2x - cp1x) + 3 * t * t * (p2.x - cp2x);
        if (Math.abs(dx) > 0.001) t -= error / dx;
        t = Math.max(0, Math.min(1, t));
      }

      // Вычисляем Y по найденному t
      p.y = cubicBezier(t, p1.y, cp1y, cp2y, p2.y);
    });

    // === Path строится по ВСЕМ точкам (включая unknown с интерполированным Y) ===
    // Это обеспечивает непрерывную линию через все дни, включая пропущенные
    const pathD = smoothPath(points, 'y');

    // === Вычисляем длины сегментов для анимации точек ===
    const cumulativeLengths = calcCumulativeLengths(points, 'y');
    const totalPathLength = cumulativeLengths[cumulativeLengths.length - 1] || 1;

    // Линия цели — плавная пунктирная
    const goalPathD = smoothPath(points, 'targetY');

    // Прогнозная линия (если есть данные)
    let forecastPathD = '';
    let forecastColor = '#94a3b8'; // серый по умолчанию
    let forecastPathLength = 0; // длина для анимации
    if (forecastPts.length > 0 && points.length >= 2) {
      // Берём 2 последние точки для плавного продолжения Bezier
      const prev2Point = points[points.length - 2];
      const lastPoint = points[points.length - 1];
      const forecastPoint = forecastPts[forecastPts.length - 1];

      // Полный массив для расчёта касательных
      const allForBezier = [prev2Point, lastPoint, ...forecastPts];

      // Строим путь только для прогнозной части (от lastPoint)
      // Используем smoothPath но начинаем с индекса 1
      let d = `M${lastPoint.x},${lastPoint.y}`;
      for (let i = 1; i < allForBezier.length - 1; i++) {
        const p0 = allForBezier[i - 1];
        const p1 = allForBezier[i];
        const p2 = allForBezier[i + 1];
        const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
        const tension = 0.25;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;

        // Длина сегмента
        forecastPathLength += bezierLength(
          { x: p1.x, y: p1.y },
          { x: cp1x, y: cp1y },
          { x: cp2x, y: cp2y },
          { x: p2.x, y: p2.y }
        );
      }
      forecastPathD = d;

      // Цвет прогнозной линии — всегда оранжевый для чёткого отличия от реальных данных
      forecastColor = '#f97316'; // orange-500 — прогноз всегда оранжевый
    }

    // Прогнозная линия НОРМЫ (goal) — продолжение тренда за 7 дней
    let forecastGoalPathD = '';
    if (forecastPts.length > 0 && points.length >= 2) {
      // Берём 2 последние точки для плавного продолжения Bezier
      const prev2Point = points[points.length - 2];
      const lastPoint = points[points.length - 1];

      // Полный массив для расчёта касательных (используем targetY)
      const allForBezier = [prev2Point, lastPoint, ...forecastPts];

      // Строим путь только для прогнозной части (от lastPoint)
      let d = `M${lastPoint.x},${lastPoint.targetY}`;
      for (let i = 1; i < allForBezier.length - 1; i++) {
        const p0 = allForBezier[i - 1];
        const p1 = allForBezier[i];
        const p2 = allForBezier[i + 1];
        const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
        const tension = 0.25;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
      }
      forecastGoalPathD = d;
    }

    // === Streak detection: золотая линия между последовательными 🔥 днями ===
    // Находит индексы начала и конца последовательных идеальных дней
    const findStreakRanges = (pts) => {
      const ranges = [];
      let startIdx = -1;
      pts.forEach((p, i) => {
        if (p.isPerfect && p.kcal > 0) {
          if (startIdx === -1) startIdx = i;
        } else {
          if (startIdx !== -1 && i - startIdx >= 2) {
            ranges.push({ start: startIdx, end: i - 1 });
          }
          startIdx = -1;
        }
      });
      // Последний streak
      if (startIdx !== -1 && pts.length - startIdx >= 2) {
        ranges.push({ start: startIdx, end: pts.length - 1 });
      }
      return ranges;
    };

    // Извлекает сегмент пути между индексами, используя ТЕ ЖЕ контрольные точки
    // С monotonic constraint для предотвращения overshooting
    const extractPathSegment = (allPts, startIdx, endIdx, yKey = 'y') => {
      if (startIdx >= endIdx) return '';

      let d = `M${allPts[startIdx].x},${allPts[startIdx][yKey]}`;
      for (let i = startIdx; i < endIdx; i++) {
        // Используем ВСЕ точки для расчёта контрольных точек (как в основном пути)
        const p0 = allPts[Math.max(0, i - 1)];
        const p1 = allPts[i];
        const p2 = allPts[i + 1];
        const p3 = allPts[Math.min(allPts.length - 1, i + 2)];

        const tension = 0.25;
        let cp1x = p1.x + (p2.x - p0.x) * tension;
        let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
        let cp2x = p2.x - (p3.x - p1.x) * tension;
        let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;

        // Monotonic constraint
        const minY = Math.min(p1[yKey], p2[yKey]);
        const maxY = Math.max(p1[yKey], p2[yKey]);
        const margin = (maxY - minY) * 0.15;
        cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
        cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));

        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
      }
      return d;
    };

    const streakRanges = findStreakRanges(points);

    // Вычисляем длину каждого streak-сегмента и задержку анимации
    const lineDrawDuration = 3; // секунд — должно совпадать с анимацией основной линии
    const streakData = streakRanges.map(range => {
      const path = extractPathSegment(points, range.start, range.end, 'y');

      // Длина streak-сегмента
      let segmentLength = 0;
      for (let i = range.start; i < range.end; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const tension = 0.25;
        const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1.y + (p2.y - p0.y) * tension };
        const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2.y - (p3.y - p1.y) * tension };
        segmentLength += bezierLength({ x: p1.x, y: p1.y }, cp1, cp2, { x: p2.x, y: p2.y });
      }

      // Задержка = когда основная линия достигает начала streak
      const startProgress = cumulativeLengths[range.start] / totalPathLength;
      const animDelay = startProgress * lineDrawDuration;

      // Длительность = пропорционально длине сегмента относительно общей длины
      const segmentDuration = (segmentLength / totalPathLength) * lineDrawDuration;

      return { path, segmentLength, animDelay, segmentDuration };
    });

    // Для совместимости оставляем streakPaths
    const streakPaths = streakData.map(d => d.path);

    // Определяем цвет точки по ratio — используем централизованный ratioZones
    const rz = HEYS.ratioZones;
    const getDotColor = (ratio) => {
      return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
    };

    // Полный плавный путь области между двумя кривыми
    // С monotonic constraint для предотвращения overshooting
    const buildFullAreaPath = (pts) => {
      if (pts.length < 2) return '';

      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const tension = 0.25;
        let cp1x = p1.x + (p2.x - p0.x) * tension;
        let cp1y = p1.y + (p2.y - p0.y) * tension;
        let cp2x = p2.x - (p3.x - p1.x) * tension;
        let cp2y = p2.y - (p3.y - p1.y) * tension;

        // Monotonic constraint
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const margin = (maxY - minY) * 0.15;
        cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
        cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));

        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }

      d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].targetY}`;

      for (let i = pts.length - 1; i > 0; i--) {
        const p0 = pts[Math.min(pts.length - 1, i + 1)];
        const p1 = pts[i];
        const p2 = pts[i - 1];
        const p3 = pts[Math.max(0, i - 2)];

        const tension = 0.25;
        let cp1x = p1.x + (p2.x - p0.x) * tension;
        let cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
        let cp2x = p2.x - (p3.x - p1.x) * tension;
        let cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;

        // Monotonic constraint for targetY
        const minTY = Math.min(p1.targetY, p2.targetY);
        const maxTY = Math.max(p1.targetY, p2.targetY);
        const marginT = (maxTY - minTY) * 0.15;
        cp1y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp1y));
        cp2y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp2y));

        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
      }

      d += ' Z';
      return d;
    };

    const fullAreaPath = buildFullAreaPath(points);

    // === 1. Goal Achievement % — процент дней в норме ===
    const successDays = points.filter(p => p.kcal > 0 && p.isPerfect).length;
    const totalDaysWithData = points.filter(p => p.kcal > 0).length;
    const goalAchievementPct = totalDaysWithData > 0
      ? Math.round((successDays / totalDaysWithData) * 100)
      : 0;

    // === 2. Confidence interval для прогноза ===
    // Стандартное отклонение калорий за период
    const avgKcal = points.length > 0
      ? points.reduce((s, p) => s + p.kcal, 0) / points.length
      : 0;
    const variance = points.length > 1
      ? points.reduce((s, p) => s + Math.pow(p.kcal - avgKcal, 2), 0) / (points.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);
    // Коридор: ±1 стандартное отклонение (≈68% уверенность)
    const confidenceMargin = Math.min(stdDev * 0.7, 300); // макс ±300 ккал

    // === 3. Weekend ranges для shading ===
    const weekendRanges = [];
    let weekendStart = null;
    points.forEach((p, i) => {
      if (p.isWeekend) {
        if (weekendStart === null) weekendStart = i;
      } else {
        if (weekendStart !== null) {
          weekendRanges.push({ start: weekendStart, end: i - 1 });
          weekendStart = null;
        }
      }
    });
    // Последний weekend
    if (weekendStart !== null) {
      weekendRanges.push({ start: weekendStart, end: points.length - 1 });
    }

    // Определяем цвет для каждой точки — используем градиент из ratioZones
    const getPointColor = (ratio) => {
      return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
    };

    // Создаём горизонтальный градиент с цветами по точкам
    const gradientStops = points.map((p, i) => {
      const ratio = p.target > 0 ? p.kcal / p.target : 0;
      const color = getPointColor(ratio);
      const offset = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
      return { offset, color };
    });

    // === Pointer events для slider ===
    const handlePointerMove = (e) => {
      // Если идёт brush — обновляем диапазон
      if (brushing && brushStartRef && brushStartRef.current !== null) {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const nearestIdx = points.reduce((prevIdx, curr, idx) =>
          Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);

        const startIdx = brushStartRef.current;
        safeSetBrushRange({
          start: Math.min(startIdx, nearestIdx),
          end: Math.max(startIdx, nearestIdx)
        });
        return;
      }

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (width / rect.width);

      // Найти ближайшую точку (только основные, не прогноз)
      const nearest = points.reduce((prev, curr) =>
        Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
      );

      // Haptic при смене точки
      if (sliderPrevPointRef && sliderPrevPointRef.current !== nearest) {
        sliderPrevPointRef.current = nearest;
        safeHaptic('selection');
      }

      safeSetSliderPoint(nearest);
    };

    const handlePointerLeave = () => {
      safeSetSliderPoint(null);
      if (sliderPrevPointRef) {
        sliderPrevPointRef.current = null;
      }
    };

    // === Brush selection handlers ===
    const handleBrushStart = (e) => {
      // Только при долгом нажатии или с Shift
      if (!e.shiftKey && e.pointerType !== 'touch') return;

      e.preventDefault();
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (width / rect.width);
      const nearestIdx = points.reduce((prevIdx, curr, idx) =>
        Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);

      if (brushStartRef) {
        brushStartRef.current = nearestIdx;
      }
      safeSetBrushing(true);
      safeSetBrushRange({ start: nearestIdx, end: nearestIdx });
      safeHaptic('light');
    };

    const handleBrushEnd = () => {
      if (brushing && brushRange && brushRange.start !== brushRange.end) {
        safeHaptic('medium');
        // Brush завершён — можно показать статистику по диапазону
      }
      safeSetBrushing(false);
      if (brushStartRef) {
        brushStartRef.current = null;
      }
    };

    const clearBrush = () => {
      safeSetBrushRange(null);
      safeSetBrushing(false);
      if (brushStartRef) {
        brushStartRef.current = null;
      }
    };

    // === Pinch zoom handlers ===
    const handleTouchStart = (e) => {
      if (e.touches.length === 2 && sparklineZoomRef) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        sparklineZoomRef.current.initialDistance = Math.hypot(dx, dy);
        sparklineZoomRef.current.initialZoom = sparklineZoom;
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && sparklineZoomRef) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.hypot(dx, dy);
        const initialDist = sparklineZoomRef.current.initialDistance;

        if (initialDist > 0) {
          const scale = distance / initialDist;
          const newZoom = Math.max(1, Math.min(3, sparklineZoomRef.current.initialZoom * scale));
          safeSetSparklineZoom(newZoom);
        }
      }
    };

    const handleTouchEnd = () => {
      if (sparklineZoomRef) {
        sparklineZoomRef.current.initialDistance = 0;
      }
    };

    // Сброс zoom по двойному тапу
    const handleDoubleClick = () => {
      if (sparklineZoom > 1) {
        safeSetSparklineZoom(1);
        safeSetSparklinePan(0);
        safeHaptic('light');
      }
    };

    // === Точка "сегодня" ===
    const todayPoint = points.find(p => p.isToday);

    // === Статистика выбранного диапазона (brush) ===
    const brushStats = brushRange && brushRange.start !== brushRange.end ? (() => {
      const rangePoints = points.slice(brushRange.start, brushRange.end + 1);
      const totalKcal = rangePoints.reduce((s, p) => s + p.kcal, 0);
      const avgKcal = Math.round(totalKcal / rangePoints.length);
      const avgRatio = rangePoints.reduce((s, p) => s + p.ratio, 0) / rangePoints.length;
      const daysInRange = rangePoints.length;
      return { totalKcal, avgKcal, avgRatio, daysInRange };
    })() : null;

    // Класс для Goal Achievement badge
    const goalBadgeClass = 'sparkline-goal-badge' +
      (goalAchievementPct >= 70 ? '' : goalAchievementPct >= 40 ? ' goal-low' : ' goal-critical');

    return React.createElement('div', {
      className: 'sparkline-container' + (sparklineZoom > 1 ? ' sparkline-zoomed' : ''),
      style: { position: 'relative', overflow: 'hidden' },
      ref: (el) => {
        // Вызываем Twemoji после рендера для foreignObject
        if (el && window.applyTwemoji) {
          setTimeout(() => window.applyTwemoji(el), 50);
        }
      }
    },
      // Goal Achievement Badge перенесён в header (kcal-sparkline-header)
      // === Brush Stats Badge (при выборе диапазона) ===
      brushStats && React.createElement('div', {
        className: 'sparkline-brush-stats',
        onClick: clearBrush
      },
        React.createElement('span', { className: 'brush-days' }, brushStats.daysInRange + ' дн'),
        React.createElement('span', { className: 'brush-avg' }, 'Ø ' + brushStats.avgKcal + ' ккал'),
        React.createElement('span', {
          className: 'brush-ratio',
          style: { backgroundColor: rz ? rz.getGradientColor(brushStats.avgRatio, 0.9) : '#22c55e' }
        }, Math.round(brushStats.avgRatio * 100) + '%'),
        React.createElement('span', { className: 'brush-close' }, '✕')
      ),
      // === Zoom indicator ===
      sparklineZoom > 1 && React.createElement('div', {
        className: 'sparkline-zoom-indicator',
        onClick: handleDoubleClick
      }, Math.round(sparklineZoom * 100) + '%'),
      React.createElement('svg', {
        className: 'sparkline-svg animate-always',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'none',
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
        onPointerDown: handleBrushStart,
        onPointerUp: handleBrushEnd,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onDoubleClick: handleDoubleClick,
        style: {
          touchAction: sparklineZoom > 1 ? 'pan-x' : 'none',
          height: height + 'px',
          transform: sparklineZoom > 1 ? `scale(${sparklineZoom}) translateX(${sparklinePan}%)` : 'none',
          transformOrigin: 'center center'
        }
      },
        // Градиенты с цветами по точкам (для области и линии)
        React.createElement('defs', null,
          // Градиент фона (для зазора под 🍕)
          React.createElement('linearGradient', { id: 'sparklineBgGradient', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
            React.createElement('stop', {
              offset: '0%',
              stopColor: 'var(--sparkline-bg-start, #ecfdf5)'
            }),
            React.createElement('stop', {
              offset: '100%',
              stopColor: 'var(--sparkline-bg-end, #dcfce7)'
            })
          ),
          // Градиент для заливки области (с прозрачностью)
          React.createElement('linearGradient', { id: 'kcalAreaGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) =>
              React.createElement('stop', {
                key: i,
                offset: stop.offset + '%',
                stopColor: stop.color,
                stopOpacity: 0.25
              })
            )
          ),
          // Градиент для линии (полная яркость) — цвета по ratio zones
          React.createElement('linearGradient', { id: 'kcalLineGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) =>
              React.createElement('stop', {
                key: i,
                offset: stop.offset + '%',
                stopColor: stop.color,
                stopOpacity: 1
              })
            )
          )
        ),
        // Заливка области с градиентом (анимированная)
        React.createElement('path', {
          d: fullAreaPath,
          fill: 'url(#kcalAreaGradient)',
          className: 'sparkline-area-animated'
        }),
        // Линия цели (плавная пунктирная)
        React.createElement('path', {
          d: goalPathD,
          className: 'sparkline-goal',
          fill: 'none'
        }),
        // Линия графика с градиентом по ratio zones
        React.createElement('path', {
          d: pathD,
          className: 'sparkline-line',
          style: {
            stroke: 'url(#kcalLineGradient)',
            strokeDasharray: totalPathLength,
            strokeDashoffset: totalPathLength
          }
        }),
        // Золотые streak-линии между 🔥 днями (анимируются синхронно с основной линией)
        streakData.map((data, i) =>
          React.createElement('path', {
            key: 'streak-' + i,
            d: data.path,
            className: 'sparkline-streak-line sparkline-streak-animated',
            style: {
              strokeDasharray: data.segmentLength,
              strokeDashoffset: data.segmentLength,
              animationDelay: data.animDelay + 's',
              animationDuration: data.segmentDuration + 's'
            }
          })
        ),
        // Прогнозная линия калорий — маска для анимации + пунктир
        forecastPathD && React.createElement('g', { key: 'forecast-group' },
          // Маска: сплошная линия которая рисуется
          React.createElement('defs', null,
            React.createElement('mask', { id: 'forecastMask' },
              React.createElement('path', {
                d: forecastPathD,
                fill: 'none',
                stroke: 'white',
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeDasharray: forecastPathLength,
                strokeDashoffset: forecastPathLength,
                className: 'sparkline-forecast-mask'
              })
            )
          ),
          // Видимая пунктирная линия под маской
          React.createElement('path', {
            d: forecastPathD,
            fill: 'none',
            stroke: forecastColor,
            strokeWidth: 2,
            strokeDasharray: '6 4',
            strokeOpacity: 0.7,
            strokeLinecap: 'round',
            mask: 'url(#forecastMask)'
          })
        ),
        // Прогнозная линия нормы (цели)
        forecastGoalPathD && React.createElement('path', {
          key: 'forecast-goal-line',
          d: forecastGoalPathD,
          fill: 'none',
          stroke: 'rgba(148, 163, 184, 0.7)', // серый slate-400
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
          strokeLinecap: 'round'
        }),
        // === Confidence interval для прогноза (коридор ±σ) — заливка области ===
        forecastPts.length > 0 && confidenceMargin > 50 && (() => {
          // Строим path для области: верхняя граница → нижняя граница (обратно)
          const marginPx = (confidenceMargin / scaleRange) * chartHeight;

          // Верхняя линия (слева направо)
          const upperPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.max(paddingTop, p.y - marginPx)
          }));

          // Нижняя линия (справа налево)
          const lowerPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.min(paddingTop + chartHeight, p.y + marginPx)
          })).reverse();

          // Добавляем начальную точку от последней реальной точки
          const lastRealPoint = points[points.length - 1];
          const startX = lastRealPoint ? lastRealPoint.x : forecastPts[0].x;

          // Строим path
          let areaPath = 'M ' + startX + ' ' + upperPoints[0].y;
          upperPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          lowerPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          areaPath += ' Z';

          return React.createElement('path', {
            key: 'confidence-area',
            d: areaPath,
            fill: forecastColor,
            fillOpacity: 0.08,
            stroke: 'none'
          });
        })(),
        // Точки прогноза (с цветом по тренду) — появляются после прогнозной линии
        // Для isFutureDay используем серый цвет с пунктиром
        forecastPts.map((p, i) => {
          // Задержка = 3с (основная линия) + время до этой точки в прогнозе
          const forecastDelay = 3 + (i + 1) / forecastPts.length * Math.max(0.5, (forecastPathLength / totalPathLength) * 3);
          const isFutureDay = p.isFutureDay;
          const dotColor = isFutureDay ? 'rgba(156, 163, 175, 0.6)' : forecastColor;
          return React.createElement('circle', {
            key: 'forecast-dot-' + i,
            cx: p.x,
            cy: p.y,
            r: isFutureDay ? 6 : (p.isTodayForecast ? 4 : 3), // будущие дни крупнее для "?"
            className: 'sparkline-dot sparkline-forecast-dot' + (isFutureDay ? ' sparkline-future-dot' : ''),
            style: {
              fill: isFutureDay ? 'rgba(156, 163, 175, 0.3)' : forecastColor,
              opacity: 0, // начинаем скрытым
              '--delay': forecastDelay + 's',
              strokeDasharray: isFutureDay ? '3 2' : '2 2',
              stroke: dotColor,
              strokeWidth: isFutureDay ? 1.5 : (p.isTodayForecast ? 2 : 1)
            }
          });
        }),
        // Метки прогнозных ккал над точками (бледные)
        // Для isFutureDay показываем "?" вместо прогнозных ккал
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          const isFutureDay = p.isFutureDay;
          // Цифра прогноза: синяя для сегодня, оранжевая для будущих
          const kcalColor = p.isTodayForecast ? '#3b82f6' : (isFutureDay ? 'rgba(156, 163, 175, 0.9)' : forecastColor);
          return React.createElement('g', { key: 'forecast-kcal-group-' + i },
            // "прогноз на сегодня" НАД цифрой — только для сегодняшнего прогноза
            p.isTodayForecast && React.createElement('text', {
              key: 'forecast-label-' + i,
              x: p.x,
              y: p.y - 38,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.9, fontSize: '9px', fill: '#3b82f6' }
            }, 'прогноз на сегодня'),
            // Цифра ккал (с гапом от треугольника)
            React.createElement('text', {
              key: 'forecast-kcal-' + i,
              x: p.x,
              y: p.y - (p.isTodayForecast ? 22 : 12),
              className: 'sparkline-day-label' + (p.isTodayForecast ? ' sparkline-day-today' : ' sparkline-day-forecast'),
              textAnchor: isLast ? 'end' : 'middle',
              style: {
                opacity: isFutureDay ? 0.6 : (p.isTodayForecast ? 0.9 : 0.5),
                fill: kcalColor,
                fontSize: p.isTodayForecast ? '12px' : (isFutureDay ? '11px' : undefined),
                fontWeight: p.isTodayForecast ? '700' : (isFutureDay ? '600' : undefined)
              }
            }, isFutureDay ? '?' : p.kcal),
            // Анимированный треугольник-указатель между цифрой и точкой для сегодняшнего прогноза
            p.isTodayForecast && React.createElement('text', {
              key: 'forecast-arrow-' + i,
              x: p.x,
              y: p.y - 8,
              textAnchor: 'middle',
              className: 'sparkline-today-label sparkline-forecast-arrow',
              style: {
                fill: '#3b82f6',
                fontSize: '10px',
                fontWeight: '600',
                opacity: 0.9
              }
            }, '▼')
          );
        }),
        // Метки прогнозных дней (дата внизу, "прогноз на завтра" для завтра)
        // Для isFutureDay показываем просто дату без "прогноз на завтра"
        // "прогноз на сегодня" теперь отрисовывается НАВЕРХУ над цифрой прогноза
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          const isFutureDay = p.isFutureDay;
          const isTomorrow = !p.isTodayForecast && !isFutureDay && i === 0;
          // Только для завтра показываем "прогноз на завтра" внизу
          const showTomorrowLabel = isTomorrow && !isFutureDay;

          return React.createElement('g', { key: 'forecast-day-' + i },
            // "прогноз на завтра" выше даты — только для завтра
            showTomorrowLabel && React.createElement('text', {
              x: p.x,
              y: height - 34,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.9, fontSize: '8px', fill: '#3b82f6' }
            }, 'прогноз'),
            showTomorrowLabel && React.createElement('text', {
              x: p.x,
              y: height - 25,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.9, fontSize: '8px', fill: '#3b82f6' }
            }, 'на завтра'),
            // Дата — на том же уровне что и обычные дни
            React.createElement('text', {
              x: p.x,
              y: height - 26,
              className: 'sparkline-day-label' +
                (p.isTodayForecast ? ' sparkline-day-today' : '') +
                (isFutureDay ? ' sparkline-day-future' : ' sparkline-day-forecast') +
                (p.isWeekend ? ' sparkline-day-weekend' : ''),
              textAnchor: isLast ? 'end' : 'middle',
              dominantBaseline: 'alphabetic',
              style: {
                opacity: isFutureDay ? 0.5 : (p.isTodayForecast ? 1 : 0.8),
                fontSize: p.isTodayForecast ? '9.5px' : undefined,
                fontWeight: p.isTodayForecast ? '700' : undefined,
                fill: p.isTodayForecast ? '#3b82f6' : undefined
              }
            }, p.dayNum),
            // День недели для прогнозных дней
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: 'sparkline-weekday-label' + (p.isWeekend ? ' sparkline-weekday-weekend' : ''),
              textAnchor: 'middle',
              style: { fontSize: '8px', fill: p.isWeekend ? '#ef4444' : 'rgba(100, 116, 139, 0.5)' }
            }, ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][p.dayOfWeek !== undefined ? p.dayOfWeek : (p.date ? new Date(p.date).getDay() : 0)] || '')
          );
        }),
        // Метки дней внизу + дельта для всех дней (дельта появляется синхронно с точкой)
        points.map((p, i) => {
          // Классы для выходных и сегодня
          let dayClass = 'sparkline-day-label';
          if (p.isToday) dayClass += ' sparkline-day-today';
          if (p.isWeekend) dayClass += ' sparkline-day-weekend';
          if (p.isUnknown) dayClass += ' sparkline-day-unknown';

          // Дельта: разница между съеденным и нормой
          // Для сегодня используем goal (= displayOptimum с учётом долга), т.к. p.target может быть устаревшим на первом рендере
          const effectiveTarget = p.isToday && goal > 0 ? goal : p.target;
          const delta = p.kcal - effectiveTarget;
          const deltaText = delta >= 0 ? '+' + Math.round(delta) : Math.round(delta);
          // Цвет дельты: минус (дефицит) = зелёный, плюс (переел) = красный
          const deltaColor = delta >= 0 ? '#ef4444' : '#22c55e';

          // Delay: все дельты и эмодзи появляются одновременно — взрыв от оси X
          const deltaDelay = 2.6; // все сразу

          return React.createElement('g', { key: 'day-group-' + i },
            // Дата — для сегодня чуть крупнее и жирнее, цвет по ratio
            React.createElement('text', {
              x: p.x,
              y: height - 26,
              className: dayClass,
              textAnchor: 'middle',
              dominantBaseline: 'alphabetic',
              style: p.isUnknown ? { opacity: 0.5 } : (p.isToday && p.kcal > 0 ? { fontSize: '9.5px', fontWeight: '700', fill: deltaColor } : {})
            }, p.dayNum),
            // Дельта под датой (для всех дней с данными, кроме unknown)
            p.kcal > 0 && !p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height - 14,
              className: 'sparkline-delta-label',
              textAnchor: 'middle',
              style: { fill: deltaColor, '--delay': deltaDelay + 's' }
            }, deltaText),
            // День недели под дельтой
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: 'sparkline-weekday-label' + (p.isWeekend ? ' sparkline-weekday-weekend' : '') + (p.isToday ? ' sparkline-weekday-today' : ''),
              textAnchor: 'middle',
              style: { fontSize: '8px', fill: p.isWeekend ? '#ef4444' : 'rgba(100, 116, 139, 0.7)' }
            }, ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][p.dayOfWeek !== undefined ? p.dayOfWeek : (p.date ? new Date(p.date).getDay() : 0)] || ''),
            // Для unknown дней — показываем "—" вместо дельты
            p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height - 14,
              className: 'sparkline-delta-label sparkline-delta-unknown',
              textAnchor: 'middle',
              style: { fill: 'rgba(156, 163, 175, 0.6)', '--delay': deltaDelay + 's' }
            }, '—')
          );
        }),
        // Точки на все дни с hover и цветом по статусу (анимация с задержкой)
        // Weekly Rhythm — вертикальные сепараторы перед понедельниками (но не первым)
        points.filter((p, i) => i > 0 && p.dayOfWeek === 1).map((p, i) =>
          React.createElement('line', {
            key: 'week-sep-' + i,
            x1: p.x - 4,
            y1: paddingTop + 4,
            x2: p.x - 4,
            y2: height - paddingBottom - 4,
            className: 'sparkline-week-separator'
          })
        ),
        // Золотые пульсирующие точки для идеальных дней, иначе обычные точки
        // Точки появляются синхронно с рисованием линии (по реальной длине кривой Безье)
        (() => {
          const lineDrawDuration = 3; // секунд — должно совпадать с CSS animation
          const leadTime = 0.15; // точки появляются чуть раньше линии

          return points.map((p, i) => {
            // Для сегодня используем goal (= displayOptimum с учётом долга), т.к. p.target может быть устаревшим на первом рендере
            const effectiveTarget = p.isToday && goal > 0 ? goal : p.target;
            const ratio = effectiveTarget > 0 ? p.kcal / effectiveTarget : 0;
            // Задержка пропорциональна реальной длине пути до точки
            const pathProgress = cumulativeLengths[i] / totalPathLength;
            const animDelay = Math.max(0, pathProgress * lineDrawDuration - leadTime);

            // Неизвестный день — серый кружок с "?"
            if (p.isUnknown) {
              return React.createElement('g', { key: 'unknown-' + i },
                React.createElement('circle', {
                  cx: p.x,
                  cy: p.y,
                  r: 6,
                  className: 'sparkline-dot sparkline-dot-unknown',
                  style: {
                    cursor: 'pointer',
                    '--delay': animDelay + 's',
                    fill: 'rgba(156, 163, 175, 0.3)',
                    stroke: 'rgba(156, 163, 175, 0.6)',
                    strokeWidth: 1.5,
                    strokeDasharray: '2 2'
                  },
                  onClick: (e) => {
                    e.stopPropagation();
                    safeHaptic('light');
                    safeOpenPopup('sparkline', { type: 'unknown', point: p, x: e.clientX, y: e.clientY });
                  }
                }),
                React.createElement('text', {
                  x: p.x,
                  y: p.y + 3,
                  textAnchor: 'middle',
                  className: 'sparkline-unknown-label',
                  style: {
                    fill: 'rgba(156, 163, 175, 0.9)',
                    fontSize: '9px',
                    fontWeight: '600',
                    pointerEvents: 'none'
                  }
                }, '?')
              );
            }

            // Refeed день — показываем эмодзи 🍕 вместо точки
            if (p.isRefeedDay && p.kcal > 0) {
              const emojiClass = 'sparkline-refeed-emoji' + (p.isToday ? ' sparkline-refeed-emoji-today' : '');
              return React.createElement('g', {
                key: 'refeed-emoji-' + i,
                onClick: (e) => {
                  e.stopPropagation();
                  safeHaptic('medium');
                  safeOpenPopup('sparkline', { type: 'refeed', point: p, x: e.clientX, y: e.clientY });
                }
              },
                React.createElement('circle', {
                  className: 'sparkline-refeed-emoji-gap',
                  cx: p.x,
                  cy: p.y,
                  r: 6.5
                }),
                React.createElement('text', {
                  x: p.x - 1.8,
                  y: p.y + 1.8,
                  textAnchor: 'middle',
                  className: emojiClass,
                  style: { cursor: 'pointer', '--delay': animDelay + 's' }
                }, '🍕')
              );
            }

            // Идеальный день — золотая пульсирующая точка (или оранжевая для refeed)
            if (p.isPerfect && p.kcal > 0) {
              // Refeed день: оранжевая граница + 🔄 бейдж
              const isRefeed = p.isRefeedDay && ratio > 1.1;
              return React.createElement('g', { key: 'perfect-' + i },
                React.createElement('circle', {
                  key: 'gold-' + i,
                  cx: p.x,
                  cy: p.y,
                  r: p.isToday ? 5 : 4,
                  className: isRefeed
                    ? 'sparkline-dot-refeed' + (p.isToday ? ' sparkline-dot-refeed-today' : '')
                    : 'sparkline-dot-gold' + (p.isToday ? ' sparkline-dot-gold-today' : ''),
                  style: { cursor: 'pointer', '--delay': animDelay + 's' },
                  onClick: (e) => {
                    e.stopPropagation();
                    safeHaptic('medium');
                    safeOpenPopup('sparkline', { type: isRefeed ? 'refeed' : 'perfect', point: p, x: e.clientX, y: e.clientY });
                  }
                }),
                // Refeed бейдж (🔄) над точкой
                isRefeed && React.createElement('text', {
                  x: p.x,
                  y: p.y - 10,
                  textAnchor: 'middle',
                  className: 'sparkline-refeed-badge',
                  style: { fontSize: '10px', '--delay': animDelay + 0.2 + 's' }
                }, '🔄')
              );
            }

            // Обычная точка — цвет через inline style из ratioZones
            const dotColor = rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
            let dotClass = 'sparkline-dot';
            if (p.isToday) dotClass += ' sparkline-dot-today';

            return React.createElement('circle', {
              key: 'dot-' + i,
              cx: p.x,
              cy: p.y,
              r: p.isToday ? 5 : 4,
              className: dotClass,
              style: { cursor: 'pointer', '--delay': animDelay + 's', fill: dotColor },
              onClick: (e) => {
                e.stopPropagation();
                safeHaptic('light');
                safeOpenPopup('sparkline', { type: 'kcal', point: p, x: e.clientX, y: e.clientY });
              }
            },
              React.createElement('title', null, p.dayNum + ': ' + p.kcal + ' / ' + p.target + ' ккал')
            );
          });
        })(),
        // Пунктирные линии от точек к меткам дней (появляются синхронно с точкой)
        points.map((p, i) => {
          if (p.kcal <= 0) return null;
          const pathProgress = cumulativeLengths[i] / totalPathLength;
          const lineDelay = Math.max(0, pathProgress * 3 - 0.15);
          return React.createElement('line', {
            key: 'point-line-' + i,
            x1: p.x,
            y1: p.y + 6, // от точки
            x2: p.x,
            y2: height - paddingBottom + 6, // до меток дней
            className: 'sparkline-point-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — пунктирные линии вниз к точкам (появляются синхронно с точкой)
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          const lineDelay = 2.6; // все сразу
          return React.createElement('line', {
            key: 'train-line-' + i,
            x1: p.x,
            y1: 6, // от верхней линии
            x2: p.x,
            y2: p.y - 6, // до точки
            className: 'sparkline-training-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — иконки в одну линию сверху
        // Используем SVG <image> с Twemoji CDN напрямую
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          // Маппинг типов на Twemoji codepoints
          const typeCodepoint = {
            cardio: '1f3c3',      // 🏃
            strength: '1f3cb',    // 🏋️ (без -fe0f!)
            hobby: '26bd'         // ⚽
          };
          const emojiDelay = 2.6;
          const emojiSize = 16;
          const emojiCount = p.trainingTypes.length;
          const totalWidth = emojiCount * emojiSize;
          const startX = p.x - totalWidth / 2;

          return React.createElement('g', {
            key: 'train-' + i,
            className: 'sparkline-annotation sparkline-annotation-training',
            style: { '--delay': emojiDelay + 's' }
          },
            p.trainingTypes.map((t, j) => {
              const code = typeCodepoint[t] || '1f3c3';
              const url = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/' + code + '.svg';
              return React.createElement('image', {
                key: j,
                href: url,
                x: startX + j * emojiSize,
                y: 1,
                width: emojiSize,
                height: emojiSize
              });
            })
          );
        }).filter(Boolean),
        // Слайдер — вертикальная линия
        sliderPoint && React.createElement('line', {
          key: 'slider-line',
          x1: sliderPoint.x,
          y1: paddingTop,
          x2: sliderPoint.x,
          y2: height - paddingBottom + 2,
          className: 'sparkline-slider-line'
        }),
        // Слайдер — увеличенная точка
        sliderPoint && React.createElement('circle', {
          key: 'slider-point',
          cx: sliderPoint.x,
          cy: sliderPoint.y,
          r: 6,
          className: 'sparkline-slider-point'
        }),
        // === TODAY LINE — вертикальная линия на сегодня ===
        todayPoint && React.createElement('g', { key: 'today-line-group' },
          // Полупрозрачная полоса
          React.createElement('rect', {
            x: todayPoint.x - 1.5,
            y: paddingTop,
            width: 3,
            height: chartHeight,
            className: 'sparkline-today-line',
            fill: 'rgba(59, 130, 246, 0.2)'
          }),
          // Процент дефицита/профицита от затрат (с гапом от треугольника)
          todayPoint.spent > 0 && React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 26,
            textAnchor: 'middle',
            className: 'sparkline-today-pct',
            style: {
              fill: rz ? rz.getGradientColor(todayPoint.kcal / todayPoint.spent, 1) : '#22c55e',
              fontSize: '12px',
              fontWeight: '700'
            }
          }, (() => {
            const deviation = Math.round((todayPoint.kcal / todayPoint.spent - 1) * 100);
            return deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
          })()),
          // Анимированный треугольник-указатель (между процентом и точкой)
          React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 14,
            textAnchor: 'middle',
            className: 'sparkline-today-label sparkline-forecast-arrow',
            style: { fill: 'rgba(59, 130, 246, 0.9)', fontSize: '10px', fontWeight: '600' }
          }, '▼')
        ),
        // === BRUSH SELECTION — полоса выбора диапазона ===
        brushRange && points[brushRange.start] && points[brushRange.end] && React.createElement('rect', {
          key: 'brush-overlay',
          x: Math.min(points[brushRange.start].x, points[brushRange.end].x),
          y: paddingTop,
          width: Math.abs(points[brushRange.end].x - points[brushRange.start].x),
          height: chartHeight,
          className: 'sparkline-brush-overlay',
          fill: 'rgba(59, 130, 246, 0.12)',
          stroke: 'rgba(59, 130, 246, 0.4)',
          strokeWidth: 1,
          rx: 2
        })
      ),
      // Glassmorphism тултип для слайдера (компактный)
      sliderPoint && React.createElement('div', {
        className: 'sparkline-slider-tooltip',
        style: {
          left: Math.min(Math.max(sliderPoint.x, 60), width - 60) + 'px',
          transform: 'translateX(-50%)'
        }
      },
        // Header: дата + badge процент
        React.createElement('div', { className: 'sparkline-slider-tooltip-header' },
          React.createElement('span', { className: 'sparkline-slider-tooltip-date' },
            (() => {
              if (sliderPoint.isForecast) return sliderPoint.dayNum + ' П';
              const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
              const wd = weekDays[sliderPoint.dayOfWeek] || '';
              return sliderPoint.dayNum + ' ' + wd;
            })()
          ),
          sliderPoint.ratio && React.createElement('span', {
            className: 'sparkline-slider-tooltip-ratio',
            style: { backgroundColor: rz ? rz.getGradientColor(sliderPoint.ratio, 0.9) : '#22c55e' }
          }, Math.round(sliderPoint.ratio * 100) + '%')
        ),
        // Калории
        React.createElement('div', { className: 'sparkline-slider-tooltip-kcal' },
          sliderPoint.kcal + ' ',
          React.createElement('small', null, '/ ' + sliderPoint.target)
        ),
        // Теги: сон, оценка сна, тренировка, шаги, оценка дня
        (sliderPoint.sleepHours > 0 || sliderPoint.sleepQuality > 0 || sliderPoint.dayScore > 0 || sliderPoint.trainingMinutes > 0 || sliderPoint.steps > 0) &&
        React.createElement('div', { className: 'sparkline-slider-tooltip-tags' },
          // Сон
          sliderPoint.sleepHours > 0 &&
          React.createElement('span', {
            className: 'sparkline-slider-tooltip-tag' + (sliderPoint.sleepHours < 6 ? ' bad' : '')
          }, 'Сон: ' + sliderPoint.sleepHours.toFixed(1) + 'ч'),
          // Оценка сна (1-10) — динамический цвет
          sliderPoint.sleepQuality > 0 &&
          React.createElement('span', {
            className: 'sparkline-slider-tooltip-tag',
            style: {
              backgroundColor: sliderPoint.sleepQuality <= 3 ? '#ef4444' :
                sliderPoint.sleepQuality <= 5 ? '#f97316' :
                  sliderPoint.sleepQuality <= 7 ? '#eab308' : '#22c55e',
              color: sliderPoint.sleepQuality <= 5 ? '#fff' : '#000'
            }
          }, 'Оценка сна: ' + sliderPoint.sleepQuality),
          // Тренировка
          sliderPoint.trainingMinutes > 0 &&
          React.createElement('span', {
            className: 'sparkline-slider-tooltip-tag good'
          }, 'Тренировка: ' + sliderPoint.trainingMinutes + 'м'),
          // Шаги
          sliderPoint.steps > 0 &&
          React.createElement('span', {
            className: 'sparkline-slider-tooltip-tag' + (sliderPoint.steps >= 10000 ? ' good' : '')
          }, 'Шаги: ' + sliderPoint.steps.toLocaleString()),
          // Оценка дня (1-10) — динамический цвет
          sliderPoint.dayScore > 0 &&
          React.createElement('span', {
            className: 'sparkline-slider-tooltip-tag',
            style: {
              backgroundColor: sliderPoint.dayScore <= 3 ? '#ef4444' :
                sliderPoint.dayScore <= 5 ? '#f97316' :
                  sliderPoint.dayScore <= 7 ? '#eab308' : '#22c55e',
              color: sliderPoint.dayScore <= 5 ? '#fff' : '#000'
            }
          }, 'Оценка дня: ' + sliderPoint.dayScore)
        )
      ),
      // Полоса оценки дня (dayScore) под графиком
      (() => {
        // Используем исходные data (до фильтрации excludeFromChart), чтобы включить сегодня
        const allDaysWithScore = data.filter(d => d.dayScore > 0);
        const hasDayScoreData = allDaysWithScore.length > 0;

        if (hasDayScoreData) {
          // Полоса с градиентом по dayScore (1-10)
          const getDayScoreColor = (score) => {
            if (!score || score <= 0) return 'transparent'; // нет данных — прозрачный пропуск
            if (score <= 3) return '#ef4444'; // 😢 плохо — красный
            if (score <= 5) return '#f97316'; // 😐 средне — оранжевый
            if (score <= 7) return '#eab308'; // 🙂 нормально — жёлтый
            return '#22c55e'; // 😊 хорошо — зелёный
          };

          // Используем все дни из data для градиента (включая сегодня)
          const moodStops = data.map((d, i) => ({
            offset: data.length > 1 ? (i / (data.length - 1)) * 100 : 50,
            color: getDayScoreColor(d.dayScore)
          }));

          // Бар заканчивается на сегодня, справа место для надписи
          // Вычисляем ширину бара: data.length дней из totalPoints (включая прогноз)
          const barWidthPct = totalPoints > 1 ? ((data.length) / totalPoints) * 100 : 85;

          // ВРЕМЕННО ЗАКОММЕНТИРОВАНО: надпись и бар оценки дня
          return null;
          /*
          return React.createElement('div', { className: 'sparkline-mood-container' },
            React.createElement('span', { 
              className: 'sparkline-mood-label',
              style: { textAlign: 'left', lineHeight: '1', fontSize: '8px', marginRight: '4px' }
            }, 'Оценка дня'),
            React.createElement('div', { 
              className: 'sparkline-mood-bar-modern',
              style: { 
                width: barWidthPct + '%',
                background: 'linear-gradient(to right, ' + 
                  moodStops.map(s => s.color + ' ' + s.offset + '%').join(', ') + ')'
              }
            })
          );
          */
        }

        // Fallback: Mini heatmap калорий
        return React.createElement('div', { className: 'sparkline-heatmap' },
          points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            let level;
            if (ratio === 0) level = 0;
            else if (ratio < 0.5) level = 1;
            else if (ratio < 0.8) level = 2;
            else if (ratio < 0.95) level = 3;
            else if (ratio <= 1.05) level = 4;
            else if (ratio <= 1.15) level = 5;
            else level = 6;

            return React.createElement('div', {
              key: 'hm-' + i,
              className: 'sparkline-heatmap-cell level-' + level,
              title: p.dayNum + ': ' + Math.round(ratio * 100) + '%'
            });
          })
        );
      })()
      // Ряд индикаторов сна убран — информация дублируется с баром "Оценка дня"
    );
  };

  HEYS.daySparklines.renderWeightSparkline = function renderWeightSparkline(ctx) {
    const { data, React, prof, openExclusivePopup, haptic } = ctx || {};

    const safeHaptic = typeof haptic === 'function' ? haptic : () => { };
    const safeOpenPopup = typeof openExclusivePopup === 'function' ? openExclusivePopup : () => { };

    // Skeleton loader пока данные загружаются
    if (!data) {
      return React.createElement('div', { className: 'sparkline-skeleton' },
        React.createElement('div', { className: 'sparkline-skeleton-line' }),
        React.createElement('div', { className: 'sparkline-skeleton-dots' },
          Array.from({ length: 7 }).map((_, i) =>
            React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
          )
        )
      );
    }

    if (data.length === 0) return null;

    // Разделяем данные на реальные и прогнозные (isFuture)
    const realData = data.filter(d => !d.isFuture);
    const futureData = data.filter(d => d.isFuture);

    // Если только 1 реальная точка — показываем её с подсказкой
    if (realData.length === 1 && futureData.length === 0) {
      const point = realData[0];
      return React.createElement('div', { className: 'weight-single-point' },
        React.createElement('div', { className: 'weight-single-value' },
          React.createElement('span', { className: 'weight-single-number' }, point.weight),
          React.createElement('span', { className: 'weight-single-unit' }, ' кг')
        ),
        React.createElement('div', { className: 'weight-single-hint' },
          'Добавьте вес завтра для отслеживания тренда'
        )
      );
    }

    // Прогноз теперь приходит из данных с isFuture: true
    // Используем последнюю точку прогноза если есть
    const forecastPoint = futureData.length > 0 ? futureData[futureData.length - 1] : null;

    const width = 360;
    const height = 120; // оптимальный размер графика
    const paddingTop = 16; // для меток веса над точками
    const paddingBottom = 16;
    const paddingX = 8; // минимальные отступы — точки почти у края
    const chartHeight = height - paddingTop - paddingBottom;

    // Масштаб с минимумом 1 кг range (все данные уже включают прогноз)
    const allWeights = data.map(d => d.weight);
    const minWeight = Math.min(...allWeights);
    const maxWeight = Math.max(...allWeights);
    const rawRange = maxWeight - minWeight;
    const range = Math.max(1, rawRange + 0.5);
    const adjustedMin = minWeight - 0.25;

    const totalPoints = data.length;

    // Проверяем есть ли дни с задержкой воды (только в реальных данных)
    const hasAnyRetentionDays = realData.some(d => d.hasWaterRetention);

    const points = data.map((d, i) => {
      const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
      const y = paddingTop + chartHeight - ((d.weight - adjustedMin) / range) * chartHeight;
      return {
        x,
        y,
        weight: d.weight,
        isToday: d.isToday,
        isFuture: d.isFuture || false, // Маркер прогнозного дня
        dayNum: d.dayNum,
        date: d.date,
        // Данные о цикле
        cycleDay: d.cycleDay,
        hasWaterRetention: d.hasWaterRetention,
        retentionSeverity: d.retentionSeverity,
        retentionAdvice: d.retentionAdvice
      };
    });

    // Точка последнего прогноза (для отдельного рендеринга confidence interval)
    // Теперь прогнозные точки уже в points с isFuture: true
    const forecastPt = futureData.length > 0 ? points.find(p => p.date === forecastPoint.date) : null;

    // Плавная кривая (как у калорий) с monotonic constraint
    const smoothPath = (pts) => {
      if (pts.length < 2) return '';
      if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const tension = 0.25;
        let cp1x = p1.x + (p2.x - p0.x) * tension;
        let cp1y = p1.y + (p2.y - p0.y) * tension;
        let cp2x = p2.x - (p3.x - p1.x) * tension;
        let cp2y = p2.y - (p3.y - p1.y) * tension;

        // Monotonic constraint — ограничиваем overshooting
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const margin = (maxY - minY) * 0.15;
        cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
        cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));

        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }
      return d;
    };

    // Разделяем точки на реальные и прогнозные для рендеринга
    const realPoints = points.filter(p => !p.isFuture);
    const futurePoints = points.filter(p => p.isFuture);

    // Линия рисуется только для реальных точек
    const pathD = smoothPath(realPoints);

    // Определяем тренд: сравниваем первую и последнюю половину (только реальные данные)
    const firstHalf = realPoints.slice(0, Math.ceil(realPoints.length / 2));
    const secondHalf = realPoints.slice(Math.floor(realPoints.length / 2));
    const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((s, p) => s + p.weight, 0) / firstHalf.length : 0;
    const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((s, p) => s + p.weight, 0) / secondHalf.length : 0;
    const weightTrend = avgSecond - avgFirst; // положительный = вес растёт

    // Цвет градиента по тренду
    const trendColor = weightTrend <= -0.1 ? '#22c55e' : (weightTrend >= 0.1 ? '#ef4444' : '#3b82f6');

    // Цвет прогноза — серый для нейтральности (прогноз — это неизвестность)
    const forecastColor = '#9ca3af'; // gray-400

    // Область под графиком (только реальные точки)
    const areaPath = realPoints.length >= 2
      ? pathD + ` L${realPoints[realPoints.length - 1].x},${paddingTop + chartHeight} L${realPoints[0].x},${paddingTop + chartHeight} Z`
      : '';

    // Gradient stops для линии веса — по локальному тренду каждой точки (только реальные)
    // Зелёный = вес снижается, красный = вес растёт, фиолетовый = стабильно
    const weightLineGradientStops = realPoints.map((p, i) => {
      const prevWeight = i > 0 ? realPoints[i - 1].weight : p.weight;
      const localTrend = p.weight - prevWeight;
      const dotColor = localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#3b82f6');
      const offset = realPoints.length > 1 ? (i / (realPoints.length - 1)) * 100 : 50;
      return { offset, color: dotColor };
    });

    // Прогнозная линия (от последней реальной точки ко всем прогнозным) — пунктирная
    // Используем плавную кривую, продолжающую тренд основной линии
    let forecastLineD = '';
    if (futurePoints.length > 0 && realPoints.length >= 2) {
      const lastRealPoint = realPoints[realPoints.length - 1];
      const prevRealPoint = realPoints[realPoints.length - 2];
      const futurePt = futurePoints[0];

      // Вычисляем контрольные точки для плавного продолжения тренда
      // Используем тот же tension что и в smoothPath
      const tension = 0.25;

      // Направление от предпоследней к последней точке (тренд)
      const dx = lastRealPoint.x - prevRealPoint.x;
      const dy = lastRealPoint.y - prevRealPoint.y;

      // Контрольная точка 1: продолжение тренда от последней реальной точки
      const cp1x = lastRealPoint.x + dx * tension;
      const cp1y = lastRealPoint.y + dy * tension;

      // Контрольная точка 2: притяжение к прогнозной точке
      const cp2x = futurePt.x - (futurePt.x - lastRealPoint.x) * tension;
      const cp2y = futurePt.y - (futurePt.y - lastRealPoint.y) * tension;

      forecastLineD = `M${lastRealPoint.x},${lastRealPoint.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${futurePt.x},${futurePt.y}`;
    } else if (futurePoints.length > 0 && realPoints.length === 1) {
      // Fallback: прямая линия если только 1 реальная точка
      const lastRealPoint = realPoints[0];
      const futurePt = futurePoints[0];
      forecastLineD = `M${lastRealPoint.x},${lastRealPoint.y} L${futurePt.x},${futurePt.y}`;
    }

    return React.createElement('svg', {
      className: 'weight-sparkline-svg animate-always',
      viewBox: '0 0 ' + width + ' ' + height,
      preserveAspectRatio: 'none', // растягиваем по всей ширине
      style: { height: height + 'px' } // явная высота
    },
      // Градиенты для веса
      React.createElement('defs', null,
        // Вертикальный градиент для заливки области
        React.createElement('linearGradient', { id: 'weightAreaGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
          React.createElement('stop', { offset: '0%', stopColor: trendColor, stopOpacity: '0.25' }),
          React.createElement('stop', { offset: '100%', stopColor: trendColor, stopOpacity: '0.05' })
        ),
        // Горизонтальный градиент для линии — цвета по локальному тренду
        React.createElement('linearGradient', { id: 'weightLineGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
          weightLineGradientStops.map((stop, i) =>
            React.createElement('stop', {
              key: i,
              offset: stop.offset + '%',
              stopColor: stop.color,
              stopOpacity: 1
            })
          )
        ),
        // Градиент для зоны задержки воды (розовый, вертикальный)
        React.createElement('linearGradient', { id: 'retentionZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
          React.createElement('stop', { offset: '0%', stopColor: '#ec4899', stopOpacity: '0.15' }),
          React.createElement('stop', { offset: '100%', stopColor: '#ec4899', stopOpacity: '0.03' })
        )
      ),
      // === Горизонтальная линия целевого веса ===
      (() => {
        const goalWeight = +prof?.weightGoal;
        if (!goalWeight || goalWeight <= 0) return null;

        // Проверяем что цель в пределах графика
        if (goalWeight < adjustedMin || goalWeight > adjustedMin + range) return null;

        const goalY = paddingTop + chartHeight - ((goalWeight - adjustedMin) / range) * chartHeight;

        return React.createElement('g', { key: 'weight-goal-line', className: 'weight-goal-line-group' },
          // Пунктирная линия
          React.createElement('line', {
            x1: paddingX,
            y1: goalY,
            x2: width - paddingX,
            y2: goalY,
            className: 'weight-goal-line',
            strokeDasharray: '6 4'
          }),
          // Метка справа
          React.createElement('text', {
            x: width - paddingX - 2,
            y: goalY - 4,
            className: 'weight-goal-label',
            textAnchor: 'end'
          }, 'Цель: ' + goalWeight + ' кг')
        );
      })(),
      // === Розовые зоны для дней с задержкой воды (рисуем ДО основного графика) ===
      // Используем только реальные точки — прогнозные не имеют данных о цикле
      hasAnyRetentionDays && (() => {
        // Находим группы последовательных дней с задержкой (в реальных данных)
        const retentionRanges = [];
        let rangeStart = null;

        for (let i = 0; i < realPoints.length; i++) {
          if (realPoints[i].hasWaterRetention) {
            if (rangeStart === null) rangeStart = i;
          } else {
            if (rangeStart !== null) {
              retentionRanges.push({ start: rangeStart, end: i - 1 });
              rangeStart = null;
            }
          }
        }
        if (rangeStart !== null) {
          retentionRanges.push({ start: rangeStart, end: realPoints.length - 1 });
        }

        // Ширина одной "колонки" для точки
        const colWidth = (width - paddingX * 2) / (totalPoints - 1);

        return retentionRanges.map((range, idx) => {
          const startX = realPoints[range.start].x - colWidth * 0.4;
          const endX = realPoints[range.end].x + colWidth * 0.4;
          const rectWidth = Math.max(endX - startX, colWidth * 0.8);

          return React.createElement('rect', {
            key: 'retention-zone-' + idx,
            x: Math.max(0, startX),
            y: 0,
            width: rectWidth,
            height: height,
            fill: 'url(#retentionZoneGrad)',
            className: 'weight-retention-zone',
            rx: 4 // скруглённые углы
          });
        });
      })(),
      // Заливка под графиком (анимированная)
      React.createElement('path', {
        d: areaPath,
        fill: 'url(#weightAreaGrad)',
        className: 'weight-sparkline-area sparkline-area-animated'
      }),
      // Линия графика с градиентом по тренду
      React.createElement('path', {
        d: pathD,
        className: 'weight-sparkline-line weight-sparkline-line-animated',
        style: { stroke: 'url(#weightLineGrad)' }
      }),
      // Прогнозная линия (пунктирная) — все будущие дни
      futurePoints.length > 0 && forecastLineD && React.createElement('g', { key: 'weight-forecast-group' },
        // Маска: сплошная линия которая рисуется после основной
        React.createElement('defs', null,
          React.createElement('mask', { id: 'weightForecastMask' },
            React.createElement('path', {
              d: forecastLineD,
              fill: 'none',
              stroke: 'white',
              strokeWidth: 4,
              strokeLinecap: 'round',
              strokeDasharray: 200,
              strokeDashoffset: 200,
              className: 'weight-sparkline-forecast-mask'
            })
          )
        ),
        // Видимая пунктирная линия под маской
        React.createElement('path', {
          d: forecastLineD,
          fill: 'none',
          stroke: forecastColor,
          strokeWidth: 2,
          strokeDasharray: '4 3',
          strokeOpacity: 0.6,
          strokeLinecap: 'round',
          mask: 'url(#weightForecastMask)'
        })
      ),
      // === Confidence interval для прогноза веса (±0.3 кг) ===
      // Рисуем только для последней прогнозной точки
      futurePoints.length > 0 && realPoints.length > 0 && (() => {
        const confidenceKg = 0.3; // ±300г погрешность
        const marginPx = (confidenceKg / range) * chartHeight;
        const lastRealPt = realPoints[realPoints.length - 1];
        const lastFuturePt = futurePoints[futurePoints.length - 1];
        if (!lastRealPt || !lastFuturePt) return null;

        const upperY = Math.max(paddingTop, lastFuturePt.y - marginPx);
        const lowerY = Math.min(paddingTop + chartHeight, lastFuturePt.y + marginPx);

        // Треугольная область от последней реальной точки к последней прогнозной
        const confAreaPath = `M ${lastRealPt.x} ${lastRealPt.y} L ${lastFuturePt.x} ${upperY} L ${lastFuturePt.x} ${lowerY} Z`;

        return React.createElement('path', {
          key: 'weight-confidence-area',
          d: confAreaPath,
          fill: forecastColor,
          fillOpacity: 0.1,
          stroke: 'none'
        });
      })(),
      // === TODAY LINE для веса ===
      (() => {
        const todayPt = realPoints.find(p => p.isToday);
        if (!todayPt) return null;

        // Изменение веса с первой реальной точки периода
        const firstWeight = realPoints[0]?.weight || todayPt.weight;
        const weightChange = todayPt.weight - firstWeight;
        const changeText = weightChange >= 0 ? '+' + weightChange.toFixed(1) : weightChange.toFixed(1);
        const changeColor = weightChange < -0.05 ? '#22c55e' : (weightChange > 0.05 ? '#ef4444' : '#3b82f6');

        return React.createElement('g', { key: 'weight-today-line-group' },
          // Изменение веса над точкой (выше)
          React.createElement('text', {
            x: todayPt.x,
            y: todayPt.y - 26,
            textAnchor: 'middle',
            style: {
              fill: changeColor,
              fontSize: '9px',
              fontWeight: '700'
            }
          }, changeText + ' кг'),
          // Стрелка (выше)
          React.createElement('text', {
            x: todayPt.x,
            y: todayPt.y - 16,
            textAnchor: 'middle',
            style: { fill: 'rgba(139, 92, 246, 0.9)', fontSize: '8px', fontWeight: '600' }
          }, '▼')
        );
      })(),
      // Пунктирные линии от точек к меткам дней (все точки, включая прогноз)
      points.map((p, i) => {
        const animDelay = 3 + i * 0.15;
        return React.createElement('line', {
          key: 'wpoint-line-' + i,
          x1: p.x,
          y1: p.y + 6, // от точки
          x2: p.x,
          y2: height - paddingBottom + 4, // до меток дней
          className: 'sparkline-point-line weight-sparkline-point-line' + (p.isFuture ? ' weight-sparkline-point-line-future' : ''),
          style: { '--delay': animDelay + 's', opacity: p.isFuture ? 0.4 : 1 }
        });
      }),
      // Метки дней внизу (только ключевые точки на длинных периодах)
      points.map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === points.length - 1;
        const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');

        // На длинных графиках (>10 точек) показываем только ключевые метки дней
        const totalPoints = points.length;
        const showDayLabel = totalPoints <= 10 ||
          isFirst || isLast || p.isToday ||
          (!p.isFuture && i % 3 === 0) ||  // Каждая 3-я реальная
          (p.isFuture && i % 5 === 0);      // Каждая 5-я прогнозная

        if (!showDayLabel) return null;

        return React.createElement('text', {
          key: 'wday-' + i,
          x: p.x,
          y: height - 2,
          className: 'weight-sparkline-day-label' +
            (p.isToday ? ' weight-sparkline-day-today' : '') +
            (p.isFuture ? ' weight-sparkline-day-forecast weight-sparkline-label-forecast' : ''),
          textAnchor: anchor
        }, p.dayNum);  // Всегда показываем реальную дату
      }).filter(Boolean),
      // Метки веса над точками (только ключевые точки на длинных периодах)
      points.map((p, i) => {
        const isFirst = i === 0;
        const isLast = i === points.length - 1;
        const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');

        // Находим индекс последней реальной точки и первой прогнозной
        const lastRealIndex = points.findIndex(pt => pt.isFuture) - 1;
        const firstFutureIndex = points.findIndex(pt => pt.isFuture);
        const isLastReal = i === lastRealIndex || (lastRealIndex < 0 && isLast);
        const isFirstFuture = i === firstFutureIndex;

        // На длинных графиках (>10 точек) показываем только ключевые метки веса
        const totalPoints = points.length;
        const showWeightLabel = totalPoints <= 10 ||
          isFirst || isLast || p.isToday || isLastReal || isFirstFuture ||
          (!p.isFuture && i % 3 === 0) ||  // Каждая 3-я реальная
          (p.isFuture && i % 7 === 0);      // Каждая 7-я прогнозная

        if (!showWeightLabel) return null;

        return React.createElement('text', {
          key: 'wlabel-' + i,
          x: p.x,
          y: p.y - 8,
          className: 'weight-sparkline-weight-label' +
            (p.isToday ? ' weight-sparkline-day-today' : '') +
            (p.isFuture ? ' weight-sparkline-day-forecast weight-sparkline-label-forecast' : ''),
          textAnchor: anchor
        }, p.weight.toFixed(1));
      }).filter(Boolean),
      // Точки с цветом по локальному тренду (анимация с задержкой)
      points.map((p, i) => {
        // Локальный тренд: сравниваем с предыдущей точкой
        const prevWeight = i > 0 ? points[i - 1].weight : p.weight;
        const localTrend = p.weight - prevWeight;

        // Для прогнозных точек — серый цвет
        const dotColor = p.isFuture
          ? forecastColor  // серый для прогноза
          : (localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#3b82f6'));

        let dotClass = 'weight-sparkline-dot sparkline-dot';
        if (p.isToday) dotClass += ' weight-sparkline-dot-today sparkline-dot-pulse';
        if (p.hasWaterRetention) dotClass += ' weight-sparkline-dot-retention';
        if (p.isFuture) dotClass += ' weight-sparkline-dot-forecast';

        // Задержка анимации через CSS переменную
        const animDelay = 3 + i * 0.15;

        // Стили для точки
        const dotStyle = {
          cursor: 'pointer',
          fill: dotColor,
          '--delay': animDelay + 's'
        };

        // Розовая обводка для дней с задержкой воды
        if (p.hasWaterRetention) {
          dotStyle.stroke = '#ec4899';
          dotStyle.strokeWidth = 2;
        }

        // Пунктирная обводка для прогнозных дней
        if (p.isFuture) {
          dotStyle.opacity = 0.6;
          dotStyle.strokeDasharray = '2 2';
          dotStyle.stroke = forecastColor;
          dotStyle.strokeWidth = 1.5;
        }

        // Tooltip с учётом прогноза и задержки воды
        let tooltipText = p.isFuture
          ? '(прогноз): ~' + p.weight.toFixed(1) + ' кг'
          : p.dayNum + ': ' + p.weight + ' кг';
        if (!p.isFuture && localTrend !== 0) {
          tooltipText += ' (' + (localTrend > 0 ? '+' : '') + localTrend.toFixed(1) + ')';
        }
        if (p.hasWaterRetention) {
          tooltipText += ' 🌸 День ' + p.cycleDay + ' — возможна задержка воды';
        }

        return React.createElement('circle', {
          key: 'wdot-' + i,
          cx: p.x,
          cy: p.y,
          r: p.isFuture ? 3.5 : (p.isToday ? 5 : 4),
          className: dotClass,
          style: dotStyle,
          onClick: (e) => {
            e.stopPropagation();
            safeHaptic('light');

            if (p.isFuture) {
              // Клик на прогнозную точку
              const lastRealWeight = realPoints.length > 0 ? realPoints[realPoints.length - 1].weight : p.weight;
              const forecastChange = p.weight - lastRealWeight;
              safeOpenPopup('sparkline', {
                type: 'weight-forecast',
                point: {
                  ...p,
                  forecastChange,
                  lastWeight: lastRealWeight
                },
                x: e.clientX,
                y: e.clientY
              });
            } else {
              // Клик на реальную точку
              safeOpenPopup('sparkline', {
                type: 'weight',
                point: { ...p, localTrend },
                x: e.clientX,
                y: e.clientY
              });
            }
          }
        },
          React.createElement('title', null, tooltipText)
        );
      })
    );
  };
})();


/* ===== heys_day_sparkline_data_v1.js ===== */
// heys_day_sparkline_data_v1.js — extracted sparkline data computation

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.daySparklineData = HEYS.daySparklineData || {};

  HEYS.daySparklineData.computeSparklineData = function computeSparklineData(ctx) {
    const {
      React,
      date,
      day,
      eatenKcal,
      chartPeriod,
      optimum,
      prof,
      products,
      dayTot,
      sparklineRefreshKey,
      fmtDate,
      HEYS: heysCtx
    } = ctx || {};

    const H = heysCtx || HEYS;

    const sparklineData = React.useMemo(() => {
      try {
        // === ВАЖНО: Используем выбранный день (date) как "сегодня" для sparkline ===
        // Это позволяет корректно показывать данные при просмотре любого дня,
        // включая ночные часы (00:00-02:59) когда HEYS-день ещё не закончился
        const realToday = new Date(date + 'T12:00:00'); // Парсим date из пропсов
        const realTodayStr = date; // date уже в формате YYYY-MM-DD
        const days = [];
        const clientId = (H && H.currentClientId) || '';

        // Строим Map продуктов из state (ключ = lowercase name для поиска по названию)
        // ВАЖНО: getDayData ищет по lowercase, поэтому ключ тоже должен быть lowercase
        const productsMap = new Map();
        (products || []).forEach((p) => {
          if (p && p.name) {
            const name = String(p.name).trim().toLowerCase();
            if (name) productsMap.set(name, p);
          }
        });

        // Получаем данные activeDays для нескольких месяцев
        const getActiveDaysForMonth = (H.dayUtils && H.dayUtils.getActiveDaysForMonth) || (() => new Map());

        const allActiveDays = new Map();

        // Собираем данные за 3 месяца назад (для поиска первого дня с данными)
        for (let monthOffset = 0; monthOffset >= -3; monthOffset--) {
          const checkDate = new Date(realToday);
          checkDate.setMonth(checkDate.getMonth() + monthOffset);

          const monthData = getActiveDaysForMonth(
            checkDate.getFullYear(),
            checkDate.getMonth(),
            prof,
            products
          );
          monthData.forEach((v, k) => allActiveDays.set(k, v));
        }

        // === НОВОЕ: Находим первый день с данными за последние 60 дней ===
        let firstDataDay = null;
        const maxLookback = 60;
        for (let i = maxLookback; i >= 0; i--) {
          const d = new Date(realToday);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const dayInfo = allActiveDays.get(dateStr);
          if (dayInfo && dayInfo.kcal > 0) {
            firstDataDay = dateStr;
            break;
          }
        }

        // Если нет данных — возвращаем пустой массив (покажем empty state)
        if (!firstDataDay) {
          // Возвращаем chartPeriod пустых дней чтобы empty state отобразился
          for (let i = chartPeriod - 1; i >= 0; i--) {
            const d = new Date(realToday);
            d.setDate(d.getDate() - i);
            days.push({
              date: fmtDate(d),
              kcal: 0,
              target: optimum,
              spent: optimum, // 🆕 v5.0: Затраты = норма для пустых дней
              isToday: i === 0,
              hasTraining: false,
              trainingTypes: [],
              sleepHours: 0,
              sleepQuality: 0,
              dayScore: 0,
              steps: 0
            });
          }
          return days;
        }

        // === Считаем сколько дней с данными от firstDataDay до сегодня ===
        const firstDataDate = new Date(firstDataDay);
        const daysSinceFirstData =
          Math.floor((realToday - firstDataDate) / (24 * 60 * 60 * 1000)) + 1;

        // === КЛЮЧЕВАЯ ЛОГИКА: Определяем диапазон дат для графика ===
        // Если данных >= chartPeriod — показываем последние chartPeriod дней (как раньше)
        // Если данных < chartPeriod — показываем от firstDataDay, остальное справа будет прогнозом
        let startDate;
        let daysToShow;
        let futureDaysCount = 0;

        if (daysSinceFirstData >= chartPeriod) {
          // Данных достаточно — показываем последние chartPeriod дней
          startDate = new Date(realToday);
          startDate.setDate(startDate.getDate() - (chartPeriod - 1));
          daysToShow = chartPeriod;
        } else {
          // Данных мало — показываем от первого дня с данными до сегодня
          // Остальные слоты справа заполним прогнозом
          startDate = firstDataDate;
          daysToShow = daysSinceFirstData;
          futureDaysCount = chartPeriod - daysSinceFirstData;
        }

        // Функция для получения данных одного дня
        const getDayData = (dateStr, isRealToday) => {
          const dayInfo = allActiveDays.get(dateStr);

          // Для реального сегодняшнего дня используем eatenKcal и текущий optimum
          if (isRealToday) {
            const todayTrainings = (day.trainings || []).filter((t) => t && t.z && t.z.some((z) => z > 0));
            const hasTraining = todayTrainings.length > 0;
            const trainingTypes = todayTrainings.map((t) => t.type || 'cardio');
            let trainingMinutes = 0;
            todayTrainings.forEach((t) => {
              if (t.z && Array.isArray(t.z)) trainingMinutes += t.z.reduce((s, m) => s + (+m || 0), 0);
            });
            let sleepHours = 0;
            if (day.sleepStart && day.sleepEnd) {
              const [sh, sm] = day.sleepStart.split(':').map(Number);
              const [eh, em] = day.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              sleepHours = (endMin - startMin) / 60;
            }
            const todayKcal = Math.round(eatenKcal || 0);
            // Используем savedDisplayOptimum (с учётом долга) если есть, иначе optimum
            const todayTarget = day.savedDisplayOptimum > 0 ? day.savedDisplayOptimum : optimum;
            const todayRatio = todayTarget > 0 ? todayKcal / todayTarget : 0;
            // 🆕 v5.0: Рассчитываем затраты дня (TDEE) для сегодня
            const lsGet = (H && H.utils && H.utils.lsGet) || ((k, d) => d);
            const pIndex = productsMap;
            const tdeeResult = (H && H.TDEE && H.TDEE.calculate)
              ? H.TDEE.calculate(day, prof, { lsGet, includeNDTE: true, pIndex })
              : null;
            const todaySpent = tdeeResult?.tdee || todayTarget; // Fallback к target если TDEE недоступен
            return {
              date: dateStr,
              kcal: todayKcal,
              target: todayTarget,
              spent: todaySpent, // 🆕 v5.0: Затраты дня (TDEE) для расчета дефицита/профицита
              ratio: todayRatio, // 🆕 Ratio для инсайтов
              isToday: true,
              hasTraining,
              trainingTypes,
              trainingMinutes,
              sleepHours,
              steps: +day.steps || 0, // 🆕 Шаги для текущего дня
              waterMl: +day.waterMl || 0, // 🆕 Вода для текущего дня
              weightMorning: +day.weightMorning || 0, // 🆕 Вес для текущего дня
              moodAvg: +day.moodAvg || 0,
              dayScore: +day.dayScore || 0,
              prot: Math.round(dayTot.prot || 0),
              fat: Math.round(dayTot.fat || 0),
              carbs: Math.round(dayTot.carbs || 0),
              isRefeedDay: day.isRefeedDay || false // 🔄 Refeed day flag
            };
          }

          // Для прошлых дней используем данные из activeDays
          if (dayInfo && dayInfo.kcal > 0) {
            return {
              date: dateStr,
              kcal: dayInfo.kcal,
              target: dayInfo.target,
              baseTarget: dayInfo.baseTarget || dayInfo.target, // 🔧 Базовая норма для caloricDebt
              spent: dayInfo.spent || dayInfo.target, // 🆕 v5.0: Затраты дня (TDEE)
              ratio: dayInfo.ratio || (dayInfo.target > 0 ? dayInfo.kcal / dayInfo.target : 0), // 🆕 Ratio для инсайтов
              isToday: false,
              hasTraining: dayInfo.hasTraining || false,
              trainingTypes: dayInfo.trainingTypes || [],
              trainingMinutes: dayInfo.trainingMinutes || 0,
              sleepHours: dayInfo.sleepHours || 0,
              sleepQuality: dayInfo.sleepQuality || 0,
              dayScore: dayInfo.dayScore || 0,
              steps: dayInfo.steps || 0,
              waterMl: dayInfo.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
              weightMorning: dayInfo.weightMorning || 0, // 🆕 Вес для персонализированных инсайтов
              prot: dayInfo.prot || 0,
              fat: dayInfo.fat || 0,
              carbs: dayInfo.carbs || 0,
              isRefeedDay: dayInfo.isRefeedDay || false, // 🔄 Refeed day flag
              isFastingDay: dayInfo.isFastingDay || false, // 🆕 Голодание (данные корректны)
              isIncomplete: dayInfo.isIncomplete || false // 🆕 Незаполненный день (исключить из статистики)
            };
          }

          // Fallback: читаем напрямую из localStorage
          let dayData = null;
          try {
            const scopedKey = clientId
              ? 'heys_' + clientId + '_dayv2_' + dateStr
              : 'heys_dayv2_' + dateStr;
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              if (raw.startsWith('¤Z¤')) {
                let str = raw.substring(3);
                const patterns = {
                  '¤n¤': '"name":"',
                  '¤k¤': '"kcal100"',
                  '¤p¤': '"protein100"',
                  '¤c¤': '"carbs100"',
                  '¤f¤': '"fat100"'
                };
                for (const [code, pattern] of Object.entries(patterns)) str = str.split(code).join(pattern);
                dayData = JSON.parse(str);
              } else {
                dayData = JSON.parse(raw);
              }
            }
          } catch (e) { }

          if (dayData && dayData.meals) {
            let totalKcal = 0;
            (dayData.meals || []).forEach((meal) => {
              (meal.items || []).forEach((item) => {
                const grams = +item.grams || 0;
                if (grams <= 0) return;
                const nameKey = (item.name || '').trim();
                const product = nameKey ? productsMap.get(nameKey) : null;
                const src = product || item;
                if (src.kcal100 != null) {
                  totalKcal += ((+src.kcal100 || 0) * grams) / 100;
                }
              });
            });
            const dayTrainings = (dayData.trainings || []).filter((t) => t && t.z && t.z.some((z) => z > 0));
            let fallbackSleepHours = 0;
            if (dayData.sleepStart && dayData.sleepEnd) {
              const [sh, sm] = dayData.sleepStart.split(':').map(Number);
              const [eh, em] = dayData.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              fallbackSleepHours = (endMin - startMin) / 60;
            }
            const fallbackTotalKcal = Math.round(totalKcal);
            // 🔧 FIX: Используем сохранённую норму дня если есть, иначе текущий optimum
            const fallbackTarget = +dayData.savedDisplayOptimum > 0 ? +dayData.savedDisplayOptimum : optimum;
            // 🔧 FIX: Используем сохранённые калории если есть, иначе пересчитанные
            const fallbackKcal = +dayData.savedEatenKcal > 0 ? +dayData.savedEatenKcal : fallbackTotalKcal;
            return {
              date: dateStr,
              kcal: fallbackKcal,
              target: fallbackTarget,
              spent: fallbackTarget, // 🆕 v5.0: Затраты = норма для fallback дней (нет TDEE)
              ratio: fallbackTarget > 0 ? fallbackKcal / fallbackTarget : 0, // 🆕 Ratio для инсайтов
              isToday: false,
              hasTraining: dayTrainings.length > 0,
              trainingTypes: dayTrainings.map((t) => t.type || 'cardio'),
              sleepHours: fallbackSleepHours,
              sleepQuality: +dayData.sleepQuality || 0,
              dayScore: +dayData.dayScore || 0,
              steps: +dayData.steps || 0,
              waterMl: +dayData.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
              weightMorning: +dayData.weightMorning || 0, // 🆕 Вес для персонализированных инсайтов
              prot: 0, // fallback — нет детальных данных
              fat: 0,
              carbs: 0,
              isRefeedDay: dayData.isRefeedDay || false, // 🔄 Refeed day flag
              isFastingDay: dayData.isFastingDay || false, // 🆕 Голодание (данные корректны)
              isIncomplete: dayData.isIncomplete || false // 🆕 Незаполненный день (исключить из статистики)
            };
          }

          // Нет данных дня — используем текущий optimum как fallback (день пустой, delta не важна)
          return {
            date: dateStr,
            kcal: 0,
            target: optimum,
            spent: optimum, // 🆕 v5.0: Затраты = норма для пустых дней
            ratio: 0,
            isToday: false,
            hasTraining: false,
            trainingTypes: [],
            sleepHours: 0,
            sleepQuality: 0,
            dayScore: 0,
            steps: 0,
            waterMl: 0,
            weightMorning: 0,
            prot: 0,
            fat: 0,
            carbs: 0,
            isRefeedDay: false,
            isFastingDay: false,
            isIncomplete: false
          };
        };

        // Собираем данные за период (от startDate до сегодня)
        for (let i = 0; i < daysToShow; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr;
          days.push(getDayData(dateStr, isRealToday));
        }

        // === НОВОЕ: Добавляем будущие дни как прогноз ===
        // Эти дни будут помечены как isFuture и показаны как "?" с прогнозной линией
        for (let i = 1; i <= futureDaysCount; i++) {
          const d = new Date(realToday);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          days.push({
            date: dateStr,
            kcal: 0,
            target: optimum,
            spent: optimum, // 🆕 v5.0: Затраты = норма для будущих дней
            ratio: 0, // 🆕 Для консистентности
            isToday: false,
            isFuture: true, // Маркер будущего дня
            hasTraining: false,
            trainingTypes: [],
            sleepHours: 0,
            sleepQuality: 0,
            dayScore: 0,
            steps: 0,
            waterMl: 0,
            weightMorning: 0,
            prot: 0,
            fat: 0,
            carbs: 0
          });
        }

        return days;
      } catch (e) {
        return [];
      }
    }, [
      date,
      eatenKcal,
      chartPeriod,
      optimum,
      prof,
      products,
      day?.trainings,
      day?.sleepStart,
      day?.sleepEnd,
      day?.moodAvg,
      day?.dayScore,
      day?.savedDisplayOptimum,
      day?.updatedAt,
      sparklineRefreshKey
    ]);

    return sparklineData;
  };
})();


/* ===== heys_day_caloric_balance_v1.js ===== */
// heys_day_caloric_balance_v1.js — extracted caloric debt/balance computation

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCaloricBalance = HEYS.dayCaloricBalance || {};

  HEYS.dayCaloricBalance.computeCaloricBalance = function computeCaloricBalance(ctx) {
    const {
      React,
      date,
      day,
      prof,
      optimum,
      eatenKcal,
      sparklineData,
      pIndex,
      fmtDate,
      lsGet,
      HEYS: heysCtx
    } = ctx || {};

    const H = heysCtx || HEYS;
    const HEYS_LOCAL = H;

    const caloricDebt = React.useMemo(() => {
      const HEYS = HEYS_LOCAL;
      // === КОНСТАНТЫ ===
      // 🔬 Научное обоснование:
      // - Leibel 1995 (PMID: 7632212): Метаболизм адаптируется на ~15% при дефиците
      // - Hall 2011 (PMID: 21872751): Постепенные изменения эффективнее резких
      // - Практика: компенсировать 70-85% долга за 1-3 дня оптимально
      const CFG = {
        MAX_DEBT: 1500,              // Максимум учитываемого долга
        // ГИБКОЕ ВОССТАНОВЛЕНИЕ: зависит от размера долга
        // < 300 ккал → 1 день (маленький долг)
        // 300-700 ккал → 2 дня (средний долг)
        // > 700 ккал → 3 дня (большой долг)
        RECOVERY_TARGET: 0.75,       // Компенсируем только 75% долга (метаболизм адаптировался)
        MAX_BOOST_PCT: 0.20,         // Максимум +20% к норме
        TRAINING_MULT: 1.3,          // Недобор в тренировочный день ×1.3
        REFEED_THRESHOLD: 1000,      // Порог для refeed
        REFEED_CONSECUTIVE: 5,       // Дней подряд в дефиците >20%
        REFEED_BOOST_PCT: 0.35,      // +35% в refeed day
        EXCESS_THRESHOLD: 100,       // Показывать перебор если > 100 ккал
        CARDIO_KCAL_PER_MIN: 6,      // ~6 ккал/мин лёгкого кардио
        STEPS_KCAL_PER_1000: 40,     // ~40 ккал на 1000 шагов
        KCAL_PER_GRAM: 7.7,          // Калории в грамме жира

        // 🆕 v3.1: TRAINING DAY ENHANCEMENT (#3)
        // Разные типы тренировок требуют разного восстановления
        TRAINING_TYPE_MULT: {
          strength: 1.4,  // Силовая: больше белка + углеводов нужно
          cardio: 1.25,   // Кардио: умеренное восстановление
          hobby: 1.1      // Хобби: минимальное влияние
        },
        TRAINING_INTENSITY_MULT: {
          light: 0.8,     // Лёгкая (< 30 мин зоны 1-2)
          moderate: 1.0,  // Умеренная (30-60 мин)
          high: 1.3,      // Интенсивная (> 60 мин или зоны 3-4)
          extreme: 1.5    // Экстремальная (> 90 мин высокой интенсивности)
        },

        // 🆕 v3.1: BMI-BASED PERSONALIZATION (#6)
        // 🔬 Kahn & Flier 2000, DeFronzo 1979
        BMI_RECOVERY_MULT: {
          underweight: { threshold: 18.5, mult: 1.3, boost: 1.2 },   // Больше ешь!
          normal: { threshold: 25, mult: 1.0, boost: 1.0 },          // Стандарт
          overweight: { threshold: 30, mult: 0.85, boost: 0.9 },     // Можно агрессивнее
          obese: { threshold: Infinity, mult: 0.7, boost: 0.8 }      // Ещё агрессивнее
        },

        // 🆕 v3.1: PROTEIN DEBT (#2)
        // 🔬 Mettler 2010 (PMID: 20095013): 1.8-2.7г/кг на дефиците
        PROTEIN_DEBT_WINDOW: 3,      // Дней для анализа белкового долга
        PROTEIN_TARGET_PCT: 0.25,    // 25% калорий из белка (норма)
        PROTEIN_CRITICAL_PCT: 0.18,  // <18% = критический недобор
        PROTEIN_RECOVERY_MULT: 1.2,  // Бонус к белковым рекомендациям

        // 🆕 v3.1: EMOTIONAL RISK (#5)
        // 🔬 Epel 2001: Стресс → кортизол → тяга к сладкому
        STRESS_HIGH_THRESHOLD: 6,    // Стресс >= 6 = высокий
        STRESS_DEBT_RISK_MULT: 1.5,  // Риск срыва при стресс + долг

        // 🆕 v3.1: CIRCADIAN CONTEXT (#4)
        // 🔬 Van Cauter 1997: Утренняя инсулиночувствительность выше
        CIRCADIAN_MORNING_MULT: 0.7, // Утренний недобор менее критичен
        CIRCADIAN_EVENING_MULT: 1.3  // Вечерний недобор более срочный
      };

      // === GOAL-AWARE THRESHOLDS ===
      // Пороги зависят от цели пользователя
      const getGoalThresholds = () => {
        // Number() для корректного сравнения строк из localStorage с числами
        const deficitPct = Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0) || 0;
        if (deficitPct <= -10) {
          // Похудение — перебор критичнее
          return { debtThreshold: 80, excessThreshold: 150, mode: 'loss' };
        } else if (deficitPct >= 10) {
          // Набор — недобор критичнее
          return { debtThreshold: 150, excessThreshold: 200, mode: 'bulk' };
        }
        // Поддержание — симметрично
        return { debtThreshold: 100, excessThreshold: 100, mode: 'maintenance' };
      };
      const goalThresholds = getGoalThresholds();

      if (!sparklineData || sparklineData.length < 2 || !optimum || optimum <= 0) {
        return null;
      }

      try {
        // === ОПРЕДЕЛЯЕМ ПЕРИОД: последние 3 дня (научно обоснованный минимум) ===
        // Leibel 1995, Hall 2011: 3-5 дней достаточно для выявления тренда
        const DEBT_WINDOW = 3;
        const todayDate = new Date(date + 'T12:00:00');
        const todayStr = date;

        // Берём последние 3 дня (не включая сегодня)
        const windowStart = new Date(todayDate);
        windowStart.setDate(todayDate.getDate() - DEBT_WINDOW);
        const windowStartStr = fmtDate(windowStart);

        // Фильтруем дни: последние 3 дня до вчера (сегодня не считаем — ещё едим)
        // 🔧 FIX: Исключаем дни с < 1/3 от нормы — это значит данные не внесены полностью
        // 🆕 v1.1: Учитываем isFastingDay (данные корректны) и isIncomplete (исключаем)
        const minKcalThreshold = optimum / 3; // ~600-700 ккал для большинства людей
        const pastDays = sparklineData.filter((d) => {
          if (d.isToday) return false;
          if (d.isFuture) return false;
          if (d.kcal <= 0) return false;

          // 🆕 Если помечен как incomplete (незаполненные данные) — не учитываем
          if (d.isIncomplete) return false;

          // 🆕 Если помечен как fasting (реальное голодание) — учитываем как есть
          // даже если kcal < threshold
          if (d.isFastingDay) {
            // Но всё равно проверяем временные рамки
            if (d.date < windowStartStr) return false;
            if (d.date >= todayStr) return false;
            return true;
          }

          if (d.kcal < minKcalThreshold) return false; // 🆕 День без полных данных — не учитываем
          if (d.date < windowStartStr) return false; // Старше 3 дней не берём
          if (d.date >= todayStr) return false; // Сегодня и позже не берём
          return true;
        });

        if (pastDays.length === 0) return null;

        // === НАЗВАНИЯ ДНЕЙ НЕДЕЛИ ===
        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

        // === СБОР ДАННЫХ ===
        let totalBalance = 0;
        let weightedBalance = 0;
        let consecutiveDeficit = 0;
        let maxConsecutiveDeficit = 0;
        let totalTrainingKcal = 0;
        const dayBreakdown = [];
        const totalDays = pastDays.length;

        // Для тренда: первая и вторая половина
        let firstHalfBalance = 0;
        let secondHalfBalance = 0;
        const midPoint = Math.floor(totalDays / 2);

        pastDays.forEach((d, idx) => {
          // 🔧 CRITICAL FIX: Используем БАЗОВУЮ норму (без долга) для расчёта нового долга!
          // d.target = savedDisplayOptimum (уже включает предыдущий долг) — НЕПРАВИЛЬНО для расчёта
          // d.baseTarget = пересчитанная норма TDEE * (1 + deficit%) — ПРАВИЛЬНО
          const baseTarget = d.baseTarget || d.target || optimum;
          let target = baseTarget;

          // 🔄 REFEED FIX: Если день был refeed, используем норму +35%
          // Refeed — часть стратегии, не "срыв". Перебор считаем от refeed-нормы, а не от дефицитной.
          if (d.isRefeedDay) {
            const REFEED_BOOST = 0.35;
            target = Math.round(target * (1 + REFEED_BOOST));
          }

          const rawDelta = d.kcal - target; // > 0 переел, < 0 недоел

          let delta = rawDelta;
          // УБРАН множитель тренировки — NDTE уже учитывает эффект тренировки в TDEE
          // Раньше было: delta *= 1.3 при тренировке, но это двойной учёт

          // Собираем калории от тренировок за неделю
          if (d.hasTraining && d.trainingKcal) {
            totalTrainingKcal += d.trainingKcal;
          }

          totalBalance += delta;

          // Весовой коэффициент: вчера важнее понедельника
          // Формула: 0.5 + (0.5 * (totalDays - daysAgo) / totalDays)
          const daysAgo = totalDays - idx;
          const weight = 0.5 + (0.5 * (totalDays - daysAgo) / totalDays);
          weightedBalance += delta * weight;

          // Тренд: первая vs вторая половина
          if (idx < midPoint) {
            firstHalfBalance += delta;
          } else {
            secondHalfBalance += delta;
          }

          // Считаем последовательные дни в дефиците >20%
          const ratio = d.kcal / target;
          if (ratio < 0.8) {
            consecutiveDeficit++;
            maxConsecutiveDeficit = Math.max(maxConsecutiveDeficit, consecutiveDeficit);
          } else {
            consecutiveDeficit = 0;
          }

          // День недели
          const dayDate = new Date(d.date + 'T12:00:00');
          const dayOfWeekIdx = dayDate.getDay();

          // Breakdown для UI
          dayBreakdown.push({
            date: d.date,
            dayNum: d.date.split('-')[2],
            dayName: dayNames[dayOfWeekIdx],
            eaten: Math.round(d.kcal),
            target: Math.round(target),
            baseTarget: Math.round(baseTarget),
            delta: Math.round(delta),
            hasTraining: d.hasTraining,
            ratio: ratio,
            isRefeedDay: d.isRefeedDay
          });
        });

        // === ДОЛГ (недобор) ===
        const rawDebt = Math.max(0, -totalBalance);
        const cappedDebt = Math.min(rawDebt, CFG.MAX_DEBT);
        const hasDebt = cappedDebt > goalThresholds.debtThreshold;

        // === ПЕРЕБОР ===
        const rawExcess = Math.max(0, totalBalance);
        // При переборе учитываем тренировки за неделю (компенсируют 50%)
        const netExcess = Math.max(0, rawExcess - totalTrainingKcal * 0.5);
        const hasExcess = netExcess > goalThresholds.excessThreshold;

        // === ТРЕНД ===
        let trend = { direction: 'stable', text: 'Стабильно', emoji: '➡️' };
        if (totalDays >= 4) {
          const trendDiff = secondHalfBalance - firstHalfBalance;
          if (trendDiff < -100) {
            trend = { direction: 'improving', text: 'Недобор уменьшается', emoji: '📈' };
          } else if (trendDiff > 100) {
            trend = { direction: 'worsening', text: 'Перебор растёт', emoji: '📉' };
          }
        }

        // === SEVERITY (степень серьёзности) ===
        let severity = 0; // 0 = незначительно, 1 = умеренно, 2 = значительно
        const absBalance = Math.abs(totalBalance);
        if (absBalance > 800) severity = 2;
        else if (absBalance > 400) severity = 1;

        // === REFEED (только рекомендация, НЕ автоматический boost) ===
        const hasHardTrainingToday = (day.trainings || []).some((t) => {
          if (!t || !t.z) return false;
          const totalMin = t.z.reduce((s, m) => s + (+m || 0), 0);
          return totalMin >= 45;
        });

        const needsRefeed =
          cappedDebt >= CFG.REFEED_THRESHOLD ||
          maxConsecutiveDeficit >= CFG.REFEED_CONSECUTIVE ||
          (cappedDebt > 500 && hasHardTrainingToday);

        // === ГИБКОЕ ВОССТАНОВЛЕНИЕ ===
        // 🔬 Научная логика:
        // 1. Компенсируем только 75% долга — организм адаптировался (Leibel 1995)
        // 2. Дни восстановления зависят от размера долга:
        //    - < 300 ккал → 1 день (быстро закрыть)
        //    - 300-700 ккал → 2 дня (умеренно)
        //    - > 700 ккал → 3 дня (постепенно)
        const getRecoveryDays = (debt) => {
          if (debt < 300) return 1;
          if (debt < 700) return 2;
          return 3;
        };

        let dailyBoost = 0;
        let refeedBoost = 0;
        let recoveryDays = 0;
        let effectiveDebt = 0; // Сколько реально компенсируем

        if (hasDebt) {
          // Компенсируем только 75% долга
          effectiveDebt = Math.round(cappedDebt * CFG.RECOVERY_TARGET);

          // Гибкое количество дней
          recoveryDays = getRecoveryDays(cappedDebt);

          // Расчёт boost
          const rawBoost = effectiveDebt / recoveryDays;
          const maxBoost = optimum * CFG.MAX_BOOST_PCT;
          dailyBoost = Math.round(Math.min(rawBoost, maxBoost));

          // Refeed boost (для рекомендации)
          if (needsRefeed) {
            refeedBoost = Math.round(optimum * CFG.REFEED_BOOST_PCT);
          }
        }

        // === МЯГКАЯ КОРРЕКЦИЯ ПРИ ПЕРЕБОРЕ ===
        // 🔬 Философия: НЕ наказываем за переедание (провоцирует срыв!)
        // Вместо этого:
        // 1. Главное — рекомендация активности (кардио, шаги)
        // 2. Мягкий акцент — небольшое снижение нормы (5-10%)
        // 3. Позитивный тон — "баланс", а не "штраф"
        //
        // Научное обоснование:
        // - Herman & Polivy, 1984 (PMID: 6727817): Жёсткие ограничения → срывы
        // - Tomiyama, 2018 (PMID: 29866473): Самокритика ухудшает результаты
        // - Практика: мягкая коррекция + активность эффективнее "наказания"

        const EXCESS_CFG = {
          SOFT_REDUCTION_PCT: 0.05,      // Мягкое снижение: 5% от нормы
          MODERATE_REDUCTION_PCT: 0.08,  // Умеренное: 8%
          MAX_REDUCTION_PCT: 0.10,       // Максимум: 10% (НЕ больше!)
          ACTIVITY_PRIORITY: 0.7,        // 70% компенсации через активность
          SOFT_THRESHOLD: 200,           // До 200 ккал — игнорируем
          MODERATE_THRESHOLD: 400,       // 200-400 — мягкая коррекция
          SIGNIFICANT_THRESHOLD: 600     // >400 — умеренная коррекция
        };

        let dailyReduction = 0; // Снижение нормы (мягкий акцент)
        let effectiveExcess = 0; // Чистый перебор после учёта активности
        let excessRecoveryDays = 0; // Дней на компенсацию
        let activityCompensation = 0; // Сколько компенсируем активностью

        if (hasExcess && netExcess > EXCESS_CFG.SOFT_THRESHOLD) {
          // Сколько компенсируем активностью (приоритет!)
          activityCompensation = Math.round(netExcess * EXCESS_CFG.ACTIVITY_PRIORITY);

          // Остаток — через мягкое снижение нормы
          const remainingExcess = netExcess - activityCompensation;
          effectiveExcess = Math.round(remainingExcess);

          // Определяем степень коррекции
          let reductionPct;
          if (netExcess < EXCESS_CFG.MODERATE_THRESHOLD) {
            // Маленький перебор — минимальная коррекция
            reductionPct = EXCESS_CFG.SOFT_REDUCTION_PCT;
            excessRecoveryDays = 1;
          } else if (netExcess < EXCESS_CFG.SIGNIFICANT_THRESHOLD) {
            // Средний перебор — умеренная коррекция
            reductionPct = EXCESS_CFG.MODERATE_REDUCTION_PCT;
            excessRecoveryDays = 2;
          } else {
            // Большой перебор — максимальная (но мягкая!) коррекция
            reductionPct = EXCESS_CFG.MAX_REDUCTION_PCT;
            excessRecoveryDays = 2; // Не больше 2 дней — не растягиваем "наказание"
          }

          // Расчёт снижения: распределяем остаток на дни
          const rawReduction = Math.round(effectiveExcess / excessRecoveryDays);
          const maxReduction = Math.round(optimum * reductionPct);
          dailyReduction = Math.min(rawReduction, maxReduction);

          // Если снижение слишком маленькое — не показываем (не создаём шум)
          if (dailyReduction < 30) {
            dailyReduction = 0;
            excessRecoveryDays = 0;
          }
        }

        // === ПРОГНОЗ ВОССТАНОВЛЕНИЯ ===
        const daysToRecover = dailyBoost > 0 ? Math.ceil(effectiveDebt / dailyBoost) : 0;
        const recoveryDate = new Date(todayDate);
        recoveryDate.setDate(recoveryDate.getDate() + daysToRecover);
        const recoveryDayName = dayNames[recoveryDate.getDay()];

        // === ПРОГРЕСС ВОССТАНОВЛЕНИЯ (если был долг вчера) ===
        const yesterdayDebt = dayBreakdown.length > 0 ? Math.abs(dayBreakdown[dayBreakdown.length - 1].delta) : 0;
        const isRecovering =
          yesterdayDebt > 0 &&
          dayBreakdown.length > 1 &&
          dayBreakdown[dayBreakdown.length - 1].delta > dayBreakdown[dayBreakdown.length - 2].delta;

        // === РЕКОМЕНДАЦИЯ КАРДИО (при переборе) ===
        let cardioRecommendation = null;
        if (hasExcess && !hasHardTrainingToday) {
          // Учитываем сегодняшние шаги
          const todaySteps = day.steps || 0;
          const stepsKcal = Math.round((todaySteps / 1000) * CFG.STEPS_KCAL_PER_1000);
          const remainingExcess = Math.max(0, netExcess - stepsKcal);

          if (remainingExcess > 50) {
            const rawMinutes = Math.round(remainingExcess / CFG.CARDIO_KCAL_PER_MIN);

            // Если > 60 мин — делим на 2 дня
            const splitDays = rawMinutes > 60 ? 2 : 1;
            const minutesPerDay = Math.round(rawMinutes / splitDays);

            // Тип активности
            let activityType, activityIcon;
            if (minutesPerDay <= 20) {
              activityType = 'прогулка';
              activityIcon = '🚶';
            } else if (minutesPerDay <= 45) {
              activityType = 'лёгкое кардио';
              activityIcon = '🏃';
            } else {
              activityType = 'активное кардио';
              activityIcon = '🏃‍♂️';
            }

            cardioRecommendation = {
              excessKcal: Math.round(netExcess),
              stepsCompensation: stepsKcal,
              remainingExcess,
              minutes: minutesPerDay,
              splitDays,
              activityType,
              activityIcon,
              text: splitDays > 1
                ? `${splitDays} дня по ${minutesPerDay} мин ${activityType}`
                : `${minutesPerDay} мин ${activityType}`
            };
          } else if (stepsKcal > 0) {
            // Шаги полностью компенсировали перебор
            cardioRecommendation = {
              excessKcal: Math.round(netExcess),
              stepsCompensation: stepsKcal,
              remainingExcess: 0,
              minutes: 0,
              compensatedBySteps: true,
              text: 'Отличная активность! Шаги компенсировали перебор'
            };
          }
        }

        // === СВЯЗЬ С ВЕСОМ ===
        const weightImpact = {
          grams: Math.round(Math.abs(totalBalance) / CFG.KCAL_PER_GRAM),
          isGain: totalBalance > 0,
          text: totalBalance > 50
            ? `~+${Math.round(totalBalance / CFG.KCAL_PER_GRAM)}г к весу`
            : totalBalance < -50
              ? `~−${Math.round(Math.abs(totalBalance) / CFG.KCAL_PER_GRAM)}г веса`
              : 'Вес стабилен'
        };

        // ═══════════════════════════════════════════════════════════════════
        // 🔬 НАУЧНАЯ АНАЛИТИКА v4.3 — Deep Metabolic Insights
        // ═══════════════════════════════════════════════════════════════════

        // --- 1. TEF Analysis (Thermic Effect of Food) ---
        // Westerterp, 2004: TEF составляет 10-15% от калорий
        const todayMeals = day.meals || [];
        let todayProtein = 0, todayCarbs = 0, todayFat = 0;
        todayMeals.forEach((meal) => {
          (meal.items || []).forEach((item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              todayProtein += (prod.protein100 || 0) * g / 100;
              todayCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
              todayFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
            }
          });
        });

        // 🔬 TEF v1.0.0: используем единый модуль HEYS.TEF с fallback
        let tefResult;
        if (HEYS.TEF?.calculate) {
          tefResult = HEYS.TEF.calculate(todayProtein, todayCarbs, todayFat);
        } else {
          // Fallback: inline расчёт если модуль не загружен (Westerterp 2004, Tappy 1996)
          const proteinTEF = 0; // NET Atwater: TEF 25% built into 3 kcal/g coefficient
          const carbsTEF = Math.round(todayCarbs * 4 * 0.075);
          const fatTEF = Math.round(todayFat * 9 * 0.015);
          tefResult = {
            total: proteinTEF + carbsTEF + fatTEF,
            breakdown: { protein: proteinTEF, carbs: carbsTEF, fat: fatTEF }
          };
        }
        const totalTEF = tefResult.total;
        const tefPct = eatenKcal > 0 ? Math.round((totalTEF / eatenKcal) * 100) : 0;

        const tefAnalysis = {
          total: totalTEF,
          percent: tefPct,
          breakdown: tefResult.breakdown,
          quality: tefPct >= 12 ? 'excellent' : tefPct >= 10 ? 'good' : tefPct >= 8 ? 'normal' : 'low',
          insight: tefPct >= 12
            ? `🔥 Отличный TEF ${tefPct}%! Много белка = больше калорий на переваривание`
            : tefPct < 8
              ? `⚠️ Низкий TEF ${tefPct}%. Добавь белка для ускорения метаболизма`
              : `✓ TEF ${tefPct}% — стандартный термический эффект`,
          pmid: '15507147' // Westerterp, 2004
        };

        // --- 2. EPOC Analysis (Excess Post-exercise Oxygen Consumption) ---
        // LaForgia et al., 2006: EPOC может добавить 6-15% к затратам тренировки
        const todayTrainings = day.trainings || [];
        let epocKcal = 0;
        let epocInsight = null;

        // Получаем пульсовые зоны из localStorage (формат: [{MET: 2.5}, {MET: 6}, ...])
        const hrZonesRaw = lsGet('heys_hr_zones', []);
        const defaultMets = [2.5, 6, 8, 10]; // Дефолтные MET для 4 зон

        if (todayTrainings.length > 0) {
          todayTrainings.forEach((tr) => {
            const zones = tr.z || [0, 0, 0, 0];
            const totalMin = zones.reduce((s, v) => s + v, 0);
            const highIntensityMin = (zones[2] || 0) + (zones[3] || 0);
            const intensity = totalMin > 0 ? highIntensityMin / totalMin : 0;

            // EPOC зависит от интенсивности: 6% (низкая) до 15% (высокая)
            const epocRate = 0.06 + intensity * 0.09;
            const trainingKcal = zones.reduce((sum, mins, idx) => {
              const met = +hrZonesRaw[idx]?.MET || defaultMets[idx] || (idx + 1) * 2;
              return sum + (mins * met * (prof?.weight || 70) / 60);
            }, 0);
            epocKcal += trainingKcal * epocRate;
          });

          epocKcal = Math.round(epocKcal);
          epocInsight = epocKcal > 50
            ? `🔥 +${epocKcal} ккал EPOC — метаболизм повышен после тренировки`
            : epocKcal > 20
              ? `⚡ +${epocKcal} ккал EPOC от тренировки`
              : null;
        }

        const epocAnalysis = {
          kcal: epocKcal,
          insight: epocInsight,
          hasTraining: todayTrainings.length > 0,
          pmid: '16825252' // LaForgia, 2006
        };

        // --- 3. Adaptive Thermogenesis ---
        // Rosenbaum & Leibel, 2010: При хроническом дефиците метаболизм падает на 10-15%
        const chronicDeficit = pastDays.filter((d) => d.ratio < 0.85).length;
        const adaptiveReduction = chronicDeficit >= 5 ? 0.12 : chronicDeficit >= 3 ? 0.08 : chronicDeficit >= 2 ? 0.04 : 0;

        const adaptiveThermogenesis = {
          chronicDeficitDays: chronicDeficit,
          metabolicReduction: adaptiveReduction,
          reducedKcal: Math.round(optimum * adaptiveReduction),
          isAdapted: adaptiveReduction > 0,
          insight: adaptiveReduction >= 0.10
            ? `⚠️ Метаболизм снижен на ~${Math.round(adaptiveReduction * 100)}% из-за хронического дефицита. Рекомендуется refeed`
            : adaptiveReduction >= 0.05
              ? `📉 Лёгкая адаптация метаболизма (−${Math.round(adaptiveReduction * 100)}%). Избегай длительного дефицита`
              : null,
          pmid: '20107198' // Rosenbaum & Leibel, 2010
        };

        // --- 4. Hormonal Balance (Leptin/Ghrelin) ---
        // Spiegel et al., 2004: Недосып повышает грелин на 28%, снижает лептин на 18%
        const sleepHours = day.sleepHours || 0;
        const sleepDebt = Math.max(0, (prof?.sleepHours || 8) - sleepHours);

        let ghrelinChange = 0, leptinChange = 0;
        if (sleepDebt >= 2) {
          ghrelinChange = Math.min(28, sleepDebt * 10); // До +28%
          leptinChange = Math.min(18, sleepDebt * 6); // До -18%
        }

        const hormonalBalance = {
          sleepDebt,
          ghrelinIncrease: ghrelinChange,
          leptinDecrease: leptinChange,
          hungerRisk: ghrelinChange > 15 ? 'high' : ghrelinChange > 5 ? 'moderate' : 'low',
          insight: ghrelinChange > 15
            ? `😴 Недосып ${sleepDebt.toFixed(1)}ч → грелин +${ghrelinChange}%. Повышенный голод сегодня!`
            : ghrelinChange > 5
              ? `💤 Лёгкий недосып влияет на аппетит (+${ghrelinChange}% грелин)`
              : null,
          pmid: '15602591' // Spiegel, 2004
        };

        // --- 5. Insulin Timing Analysis ---
        // Jakubowicz et al., 2013: Большой завтрак лучше для похудения
        const mealsByTime = [...todayMeals].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        let breakfastKcal = 0, dinnerKcal = 0;

        mealsByTime.forEach((meal) => {
          const hour = parseInt((meal.time || '12:00').split(':')[0], 10);
          const mealKcal = (meal.items || []).reduce((sum, item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            return sum + (prod?.kcal100 || 0) * g / 100;
          }, 0);

          if (hour < 10) breakfastKcal += mealKcal;
          if (hour >= 19) dinnerKcal += mealKcal;
        });

        const breakfastRatio = eatenKcal > 0 ? breakfastKcal / eatenKcal : 0;
        const dinnerRatio = eatenKcal > 0 ? dinnerKcal / eatenKcal : 0;

        const insulinTimingAnalysis = {
          breakfastKcal: Math.round(breakfastKcal),
          dinnerKcal: Math.round(dinnerKcal),
          breakfastRatio,
          dinnerRatio,
          isOptimal: breakfastRatio >= 0.25 && dinnerRatio <= 0.30,
          insight: breakfastRatio < 0.15 && eatenKcal > 500
            ? `🌅 Мало калорий утром (${Math.round(breakfastRatio * 100)}%). Большой завтрак ускоряет метаболизм`
            : dinnerRatio > 0.40
              ? `🌙 Много калорий вечером (${Math.round(dinnerRatio * 100)}%). Перенеси часть на утро`
              : breakfastRatio >= 0.25
                ? `✅ Отличное распределение! Завтрак ${Math.round(breakfastRatio * 100)}% калорий`
                : null,
          pmid: '23512957' // Jakubowicz, 2013
        };

        // --- 6. Cortisol & Stress Analysis ---
        // Epel et al., 2001: Стресс увеличивает тягу к сладкому и жирному
        const avgStress = day.stressAvg || 0;
        const highStressDays = pastDays.filter((d) => (d.stressAvg || 0) >= 6).length;

        // Считаем простые углеводы за сегодня
        let todaySimple = 0;
        todayMeals.forEach((meal) => {
          (meal.items || []).forEach((item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              todaySimple += (prod.simple100 || 0) * g / 100;
            }
          });
        });

        const stressEatingPattern = avgStress >= 6 && todaySimple > 50;

        const cortisolAnalysis = {
          todayStress: avgStress,
          highStressDays,
          simpleCarbs: Math.round(todaySimple),
          stressEatingDetected: stressEatingPattern,
          insight: stressEatingPattern
            ? `😰 Стресс ${avgStress}/10 + много сладкого (${Math.round(todaySimple)}г). Кортизол провоцирует тягу к быстрым углеводам`
            : avgStress >= 7
              ? `⚠️ Высокий стресс (${avgStress}/10) может усилить аппетит. Будь внимательней`
              : highStressDays >= 3
                ? `📊 ${highStressDays} стрессовых дней за неделю. Это влияет на пищевое поведение`
                : null,
          pmid: '11070333' // Epel, 2001
        };

        // --- 7. Circadian Rhythm Analysis ---
        // Garaulet et al., 2013: Поздний ужин ассоциирован с худшим похудением
        const lastMealTime = mealsByTime.length > 0 ? mealsByTime[mealsByTime.length - 1]?.time : null;
        const lastMealHour = lastMealTime ? parseInt(lastMealTime.split(':')[0], 10) : 0;
        const sleepStart = day.sleepStart || '23:00';
        const sleepStartHour = parseInt(sleepStart.split(':')[0], 10);
        const hoursBeforeSleep = lastMealHour > 0 ? sleepStartHour - lastMealHour : 0;

        const circadianAnalysis = {
          lastMealTime,
          lastMealHour,
          hoursBeforeSleep,
          isLateEater: lastMealHour >= 21,
          insight: hoursBeforeSleep < 2 && hoursBeforeSleep >= 0
            ? `🌙 Еда за ${hoursBeforeSleep}ч до сна. Рекомендуется минимум 3 часа`
            : lastMealHour >= 22
              ? `⏰ Поздний ужин (${lastMealTime}). Это замедляет метаболизм ночью`
              : lastMealHour > 0 && lastMealHour <= 19
                ? `✅ Последний приём в ${lastMealTime} — отлично для метаболизма!`
                : null,
          pmid: '23357955' // Garaulet, 2013
        };

        // --- 8. Meal Frequency Analysis ---
        // Leidy et al., 2011: 3-4 приёма оптимально для контроля аппетита
        const mealCount = todayMeals.length;
        const avgMealKcal = mealCount > 0 ? eatenKcal / mealCount : 0;

        const mealFrequencyAnalysis = {
          count: mealCount,
          avgKcal: Math.round(avgMealKcal),
          isOptimal: mealCount >= 3 && mealCount <= 5,
          insight: mealCount <= 2 && eatenKcal > 1000
            ? `🍽️ Только ${mealCount} приёма пищи. 3-4 приёма лучше для сытости и метаболизма`
            : mealCount >= 6
              ? `🔄 ${mealCount} приёмов — много перекусов. Это может стимулировать аппетит`
              : avgMealKcal > 600 && mealCount >= 3
                ? `⚠️ Большие порции (${Math.round(avgMealKcal)} ккал/приём). Раздели на меньшие`
                : null,
          pmid: '21123467' // Leidy, 2011
        };

        // --- 9. Metabolic Window Analysis ---
        // Ivy & Kuo, 1998: 30-60 мин после тренировки — окно для восстановления
        let postWorkoutMealFound = false;
        let postWorkoutProtein = 0;

        todayTrainings.forEach((tr) => {
          const trainingHour = parseInt((tr.time || '12:00').split(':')[0], 10);
          const trainingMin = parseInt((tr.time || '12:00').split(':')[1], 10) || 0;

          todayMeals.forEach((meal) => {
            const mealHour = parseInt((meal.time || '12:00').split(':')[0], 10);
            const mealMin = parseInt((meal.time || '12:00').split(':')[1], 10) || 0;
            const diffMin = (mealHour * 60 + mealMin) - (trainingHour * 60 + trainingMin);

            if (diffMin > 0 && diffMin <= 90) {
              postWorkoutMealFound = true;
              (meal.items || []).forEach((item) => {
                const g = item.grams || 0;
                const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
                if (prod && g > 0) {
                  postWorkoutProtein += (prod.protein100 || 0) * g / 100;
                }
              });
            }
          });
        });

        const metabolicWindowAnalysis = {
          hasTraining: todayTrainings.length > 0,
          postWorkoutMealFound,
          postWorkoutProtein: Math.round(postWorkoutProtein),
          isOptimal: postWorkoutMealFound && postWorkoutProtein >= 20,
          insight: todayTrainings.length > 0 && !postWorkoutMealFound
            ? `💪 Тренировка была, но нет приёма пищи в течение 90 мин. Упущено метаболическое окно!`
            : postWorkoutMealFound && postWorkoutProtein < 20
              ? `🥛 После тренировки только ${Math.round(postWorkoutProtein)}г белка. Нужно минимум 20г`
              : postWorkoutMealFound && postWorkoutProtein >= 20
                ? `✅ Отлично! ${Math.round(postWorkoutProtein)}г белка после тренировки`
                : null,
          pmid: '9694422' // Ivy & Kuo, 1998
        };

        // --- 10. Weight Prediction (Hall Model) ---
        // Hall et al., 2011: Модель предсказания веса на основе баланса
        const currentWeight = prof?.weight || 70;
        const weeklyBalanceKcal = (totalBalance * 7) / Math.max(pastDays.length, 1);
        const predictedWeightChange = weeklyBalanceKcal / 7700; // кг за неделю
        const monthlyPrediction = predictedWeightChange * 4;

        const weightPrediction = {
          weeklyChange: Math.round(predictedWeightChange * 1000) / 1000,
          monthlyChange: Math.round(monthlyPrediction * 10) / 10,
          predictedWeight: Math.round((currentWeight + monthlyPrediction) * 10) / 10,
          insight: Math.abs(monthlyPrediction) >= 0.5
            ? predictedWeightChange > 0
              ? `📈 При текущем темпе: +${monthlyPrediction.toFixed(1)}кг за месяц`
              : `📉 При текущем темпе: ${monthlyPrediction.toFixed(1)}кг за месяц`
            : `⚖️ Вес стабилен (изменение <0.5кг/мес)`,
          pmid: '21872751' // Hall, 2011
        };

        // --- 11. Fat Quality Analysis (Omega Balance) ---
        // Simopoulos, 2008: Оптимальное соотношение Omega-6:Omega-3 = 4:1
        let totalGoodFat = 0, totalBadFat = 0, totalTransFat = 0;
        todayMeals.forEach((meal) => {
          (meal.items || []).forEach((item) => {
            const g = item.grams || 0;
            const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              totalGoodFat += (prod.goodFat100 || 0) * g / 100;
              totalBadFat += (prod.badFat100 || 0) * g / 100;
              totalTransFat += (prod.trans100 || 0) * g / 100;
            }
          });
        });

        const totalFatConsumed = totalGoodFat + totalBadFat + totalTransFat;
        const goodFatRatio = totalFatConsumed > 0 ? totalGoodFat / totalFatConsumed : 0;

        const fatQualityAnalysis = {
          goodFat: Math.round(totalGoodFat),
          badFat: Math.round(totalBadFat),
          transFat: Math.round(totalTransFat * 10) / 10,
          goodFatRatio,
          quality: goodFatRatio >= 0.6 ? 'excellent' : goodFatRatio >= 0.4 ? 'good' : goodFatRatio >= 0.25 ? 'moderate' : 'poor',
          insight: totalTransFat > 1
            ? `🚫 Транс-жиры ${totalTransFat.toFixed(1)}г! Это очень вредно для сердца`
            : goodFatRatio < 0.25 && totalFatConsumed > 20
              ? `⚠️ Мало полезных жиров (${Math.round(goodFatRatio * 100)}%). Добавь рыбу, орехи, авокадо`
              : goodFatRatio >= 0.6
                ? `✅ Отличный баланс жиров! ${Math.round(goodFatRatio * 100)}% полезных`
                : null,
          pmid: '18408140' // Simopoulos, 2008
        };

        // --- 12. Insulin Wave Integration ---
        // Связь с модулем инсулиновой волны
        let insulinWaveInsight = null;
        if (typeof HEYS !== 'undefined' && HEYS.InsulinWave) {
          try {
            const waveData = HEYS.InsulinWave.getLastWaveData?.() || {};
            if (waveData.status === 'active' && waveData.remaining > 0) {
              insulinWaveInsight = {
                status: 'active',
                remaining: waveData.remaining,
                text: `🌊 Инсулиновая волна активна ещё ${waveData.remaining} мин. Жиросжигание заблокировано`,
                recommendation: 'Дождись окончания волны перед следующим приёмом пищи'
              };
            } else if (waveData.status === 'lipolysis') {
              insulinWaveInsight = {
                status: 'lipolysis',
                text: '🔥 Липолиз активен! Жир сжигается',
                recommendation: 'Отличное время для лёгкой активности'
              };
            }
          } catch (e) { /* ignore */ }
        }

        // --- 13. Sleep-Calorie Correlation ---
        // Связь недосыпа и переедания за прошлые дни
        const sleepCalorieCorrelation = pastDays.reduce(
          (acc, d) => {
            const sleep = d.sleepHours || 0;
            const ratio = d.ratio || 0;
            if (sleep > 0 && sleep < 6 && ratio > 1.1) {
              acc.badSleepOvereatDays++;
            }
            if (sleep >= 7 && ratio >= 0.85 && ratio <= 1.1) {
              acc.goodSleepBalancedDays++;
            }
            return acc;
          },
          { badSleepOvereatDays: 0, goodSleepBalancedDays: 0 }
        );

        const sleepInsight = sleepCalorieCorrelation.badSleepOvereatDays >= 2
          ? {
            type: 'correlation',
            text: `😴 ${sleepCalorieCorrelation.badSleepOvereatDays} дня: недосып → переедание. Сон влияет на аппетит!`,
            pmid: '15602591'
          }
          : sleepCalorieCorrelation.goodSleepBalancedDays >= 3
            ? {
              type: 'positive',
              text: `✅ Хороший сон = контроль аппетита (${sleepCalorieCorrelation.goodSleepBalancedDays} сбалансированных дня)`,
              pmid: '15602591'
            }
            : null;

        // --- 14. Hydration Impact ---
        // Dennis et al., 2010: Вода перед едой снижает потребление на 75-90 ккал
        const waterMl = day.waterMl || 0;
        const waterGoal = typeof HEYS !== 'undefined' && HEYS.utils?.getWaterGoal
          ? HEYS.utils.getWaterGoal(prof)
          : 2000;
        const waterRatio = waterGoal > 0 ? waterMl / waterGoal : 0;

        const waterInsight = waterRatio < 0.5 && eatenKcal > optimum
          ? {
            type: 'warning',
            text: `💧 Мало воды (${Math.round(waterRatio * 100)}%) + перебор калорий. Вода помогает контролировать аппетит`,
            pmid: '19661958'
          }
          : waterRatio >= 1.0
            ? {
              type: 'positive',
              text: '💧 Отличная гидратация! Это помогает метаболизму и сытости',
              pmid: '19661958'
            }
            : null;

        // --- 15. Last Week Comparison ---
        // Сравнение с прошлой неделей
        let lastWeekBalance = 0;
        let lastWeekDays = 0;
        // todayDate уже объявлен выше (строка ~8590)

        for (let i = 7; i < 14; i++) {
          const checkDate = new Date(todayDate);
          checkDate.setDate(todayDate.getDate() - i);
          const checkDateStr = fmtDate(checkDate);
          const dayData = sparklineData?.activeDays?.get?.(checkDateStr);
          if (dayData && dayData.kcal && dayData.optimum) {
            lastWeekBalance += dayData.kcal - dayData.optimum;
            lastWeekDays++;
          }
        }

        const lastWeekComparison = lastWeekDays >= 3
          ? {
            lastWeekBalance: Math.round(lastWeekBalance),
            thisWeekBalance: Math.round(totalBalance),
            improvement: totalBalance < lastWeekBalance,
            diff: Math.round(totalBalance - lastWeekBalance),
            insight: totalBalance < lastWeekBalance - 200
              ? `📈 Эта неделя лучше прошлой на ${Math.abs(Math.round(totalBalance - lastWeekBalance))} ккал!`
              : totalBalance > lastWeekBalance + 200
                ? `📉 Эта неделя хуже прошлой на ${Math.round(totalBalance - lastWeekBalance)} ккал`
                : '↔️ Баланс на уровне прошлой недели'
          }
          : null;

        // --- 16. Smart Timing (не показывать лишнее утром) ---
        const currentHour = new Date().getHours();
        const showExcessWarning = currentHour >= 14 || (hasExcess && netExcess > 300);
        const showDebtWarning = currentHour >= 12 || (hasDebt && rawDebt > 400);

        const smartTiming = {
          currentHour,
          showExcessWarning,
          showDebtWarning,
          reason: currentHour < 12
            ? 'Утро — ещё рано делать выводы о балансе дня'
            : 'День в разгаре — данные актуальны'
        };

        // --- 17. Cycle Awareness (если доступен модуль цикла) ---
        let cycleInsight = null;
        if (typeof HEYS !== 'undefined' && HEYS.Cycle && day.cycleDay) {
          const phase = HEYS.Cycle.getCyclePhase?.(day.cycleDay);
          if (phase) {
            const kcalMult = HEYS.Cycle.getKcalMultiplier?.(day.cycleDay) || 1;
            if (kcalMult > 1.05) {
              cycleInsight = {
                phase: phase.name,
                multiplier: kcalMult,
                text: `🌸 ${phase.name} фаза цикла: норма калорий увеличена на ${Math.round((kcalMult - 1) * 100)}%`,
                recommendation: 'Лёгкий перебор в эту фазу — норма'
              };
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // 🔬 НАУЧНАЯ АНАЛИТИКА v5.0 — Smart Insights System
        // ═══════════════════════════════════════════════════════════════════

        // --- Определяем контекст времени суток ---
        const insightHour = currentHour;
        const isMorning = insightHour >= 6 && insightHour < 12;
        const isEvening = insightHour >= 18 && insightHour < 24;
        const isNight = insightHour >= 0 && insightHour < 6;

        // --- Категории инсайтов с приоритетами ---
        // priority: 1 = критический (всегда показывать), 2 = важный, 3 = информативный, 4 = норма (фильтруется)
        // severity: 'critical' | 'warning' | 'positive' | 'info'
        // group: 'sleep' | 'metabolism' | 'timing' | 'nutrition' | 'activity' | 'hormones' | 'pattern'
        // action: конкретное действие

        const rawInsights = [];

        // --- 1. Адаптивный термогенез (критический!) ---
        if (adaptiveThermogenesis.isAdapted) {
          rawInsights.push({
            type: 'adaptive',
            group: 'metabolism',
            priority: 1,
            severity: adaptiveThermogenesis.metabolicReduction >= 0.10 ? 'critical' : 'warning',
            emoji: '⚠️',
            text: adaptiveThermogenesis.insight,
            action: 'Запланируй refeed день — это восстановит метаболизм',
            pmid: adaptiveThermogenesis.pmid,
            timeRelevance: 1 // Всегда релевантно
          });
        }

        // --- 2. Гормональный баланс (сон/грелин) ---
        if (hormonalBalance.ghrelinIncrease > 5) {
          const morningBoost = isMorning ? 1.5 : 1; // Утром важнее
          rawInsights.push({
            type: 'hormonal',
            group: 'sleep',
            priority: hormonalBalance.ghrelinIncrease > 15 ? 1 : 2,
            severity: hormonalBalance.ghrelinIncrease > 15 ? 'critical' : 'warning',
            emoji: '😴',
            text: hormonalBalance.insight,
            action: hormonalBalance.ghrelinIncrease > 15
              ? 'Ешь белок и клетчатку — они подавляют грелин'
              : 'Добавь 20 мин дневного сна если возможно',
            pmid: hormonalBalance.pmid,
            timeRelevance: morningBoost
          });
        }

        // --- 3. TEF анализ (только если отличается от нормы) ---
        if (tefAnalysis.quality === 'excellent' || tefAnalysis.quality === 'low') {
          rawInsights.push({
            type: 'tef',
            group: 'metabolism',
            priority: tefAnalysis.quality === 'low' ? 2 : 3,
            severity: tefAnalysis.quality === 'excellent' ? 'positive' : 'warning',
            emoji: tefAnalysis.quality === 'excellent' ? '🔥' : '📉',
            text: tefAnalysis.insight,
            action: tefAnalysis.quality === 'low'
              ? 'Добавь белок — он сжигает до 25% своих калорий на переваривание'
              : null,
            pmid: tefAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 4. EPOC (только если есть тренировка) ---
        if (epocAnalysis.hasTraining && epocAnalysis.kcal > 20) {
          rawInsights.push({
            type: 'epoc',
            group: 'activity',
            priority: 3,
            severity: 'positive',
            emoji: '🔥',
            text: epocAnalysis.insight,
            action: null, // Это позитивный факт
            pmid: epocAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 5. Тайминг еды ---
        if (insulinTimingAnalysis.insight) {
          const isActionable = insulinTimingAnalysis.breakfastRatio < 0.15 || insulinTimingAnalysis.dinnerRatio > 0.40;
          if (isActionable || insulinTimingAnalysis.isOptimal) {
            rawInsights.push({
              type: 'timing',
              group: 'timing',
              priority: isActionable ? 2 : 4,
              severity: insulinTimingAnalysis.isOptimal ? 'positive' : 'warning',
              emoji: insulinTimingAnalysis.isOptimal ? '✅' : insulinTimingAnalysis.breakfastRatio < 0.15 ? '🌅' : '🌙',
              text: insulinTimingAnalysis.insight,
              action: insulinTimingAnalysis.breakfastRatio < 0.15
                ? 'Завтра начни с белкового завтрака 300+ ккал'
                : insulinTimingAnalysis.dinnerRatio > 0.40
                  ? 'Перенеси 20% ужина на обед'
                  : null,
              pmid: insulinTimingAnalysis.pmid,
              timeRelevance: isMorning && insulinTimingAnalysis.breakfastRatio < 0.15 ? 1.5 : 1
            });
          }
        }

        // --- 6. Циркадные ритмы (поздний ужин) ---
        if (circadianAnalysis.insight) {
          const isLate = circadianAnalysis.isLateEater || circadianAnalysis.hoursBeforeSleep < 2;
          const eveningBoost = isEvening ? 1.5 : 1;
          rawInsights.push({
            type: 'circadian',
            group: 'timing',
            priority: isLate ? 2 : 4,
            severity: circadianAnalysis.lastMealHour <= 19 ? 'positive' : 'warning',
            emoji: circadianAnalysis.lastMealHour <= 19 ? '✅' : '🌙',
            text: circadianAnalysis.insight,
            action: isLate ? 'Ужинай до 20:00 — это ускорит метаболизм на 5-10%' : null,
            pmid: circadianAnalysis.pmid,
            timeRelevance: eveningBoost
          });
        }

        // --- 7. Стресс и кортизол ---
        if (cortisolAnalysis.insight) {
          rawInsights.push({
            type: 'cortisol',
            group: 'hormones',
            priority: cortisolAnalysis.stressEatingDetected ? 1 : cortisolAnalysis.todayStress >= 7 ? 2 : 3,
            severity: cortisolAnalysis.stressEatingDetected ? 'critical' : 'warning',
            emoji: '😰',
            text: cortisolAnalysis.insight,
            action: cortisolAnalysis.stressEatingDetected
              ? '5 мин дыхательных упражнений снизят кортизол на 25%'
              : 'Прогулка 15 мин снижает кортизол',
            pmid: cortisolAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 8. Частота приёмов пищи ---
        if (mealFrequencyAnalysis.insight) {
          rawInsights.push({
            type: 'frequency',
            group: 'timing',
            priority: 3,
            severity: mealFrequencyAnalysis.isOptimal ? 'positive' : 'warning',
            emoji: '🍽️',
            text: mealFrequencyAnalysis.insight,
            action: mealFrequencyAnalysis.count <= 2
              ? 'Раздели калории на 3-4 приёма для лучшей сытости'
              : mealFrequencyAnalysis.count >= 6
                ? 'Объедини перекусы в полноценные приёмы'
                : null,
            pmid: mealFrequencyAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 9. Метаболическое окно после тренировки ---
        if (metabolicWindowAnalysis.insight && metabolicWindowAnalysis.hasTraining) {
          rawInsights.push({
            type: 'window',
            group: 'activity',
            priority: !metabolicWindowAnalysis.postWorkoutMealFound ? 2 : 3,
            severity: metabolicWindowAnalysis.isOptimal ? 'positive' : 'warning',
            emoji: metabolicWindowAnalysis.isOptimal ? '✅' : '💪',
            text: metabolicWindowAnalysis.insight,
            action: !metabolicWindowAnalysis.postWorkoutMealFound
              ? 'После тренировки съешь 20-30г белка в течение 90 мин'
              : null,
            pmid: metabolicWindowAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 10. Качество жиров ---
        if (fatQualityAnalysis.insight) {
          const isCritical = fatQualityAnalysis.transFat > 1;
          rawInsights.push({
            type: 'fatQuality',
            group: 'nutrition',
            priority: isCritical ? 1 : fatQualityAnalysis.quality === 'excellent' ? 4 : 3,
            severity: isCritical ? 'critical' : fatQualityAnalysis.quality === 'excellent' ? 'positive' : 'warning',
            emoji: isCritical ? '🚫' : fatQualityAnalysis.quality === 'excellent' ? '✅' : '⚠️',
            text: fatQualityAnalysis.insight,
            action: isCritical
              ? 'Исключи маргарин, фастфуд, выпечку — они содержат транс-жиры'
              : fatQualityAnalysis.goodFatRatio < 0.25
                ? 'Добавь орехи, авокадо или жирную рыбу'
                : null,
            pmid: fatQualityAnalysis.pmid,
            timeRelevance: 1
          });
        }

        // --- 11. Инсулиновая волна ---
        if (insulinWaveInsight) {
          rawInsights.push({
            type: 'insulinWave',
            group: 'metabolism',
            priority: insulinWaveInsight.status === 'active' ? 2 : 4,
            severity: insulinWaveInsight.status === 'lipolysis' ? 'positive' : 'info',
            emoji: insulinWaveInsight.status === 'lipolysis' ? '🔥' : '🌊',
            text: insulinWaveInsight.text,
            action: insulinWaveInsight.recommendation,
            pmid: null,
            timeRelevance: 1.2 // Всегда чуть важнее
          });
        }

        // --- 12. Корреляция сна и переедания ---
        if (sleepInsight) {
          rawInsights.push({
            type: 'sleepCorrelation',
            group: 'sleep',
            priority: sleepInsight.type === 'correlation' ? 2 : 3,
            severity: sleepInsight.type === 'positive' ? 'positive' : 'warning',
            emoji: sleepInsight.type === 'positive' ? '✅' : '😴',
            text: sleepInsight.text,
            action: sleepInsight.type === 'correlation'
              ? 'Ложись на 30 мин раньше — это снизит аппетит завтра'
              : null,
            pmid: sleepInsight.pmid,
            timeRelevance: isMorning ? 1.3 : isEvening ? 1.5 : 1
          });
        }

        // --- 13. Гидратация ---
        if (waterInsight) {
          rawInsights.push({
            type: 'water',
            group: 'nutrition',
            priority: waterInsight.type === 'warning' ? 2 : 4,
            severity: waterInsight.type === 'positive' ? 'positive' : 'warning',
            emoji: '💧',
            text: waterInsight.text,
            action: waterInsight.type === 'warning'
              ? 'Выпей стакан воды перед следующим приёмом пищи'
              : null,
            pmid: waterInsight.pmid,
            timeRelevance: 1
          });
        }

        // --- 14. Сравнение с прошлой неделей ---
        if (lastWeekComparison?.insight) {
          rawInsights.push({
            type: 'comparison',
            group: 'pattern',
            priority: 3,
            severity: lastWeekComparison.improvement ? 'positive' : 'info',
            emoji: lastWeekComparison.improvement ? '📈' : lastWeekComparison.diff > 200 ? '📉' : '↔️',
            text: lastWeekComparison.insight,
            action: null,
            pmid: null,
            timeRelevance: 1
          });
        }

        // --- 15. Цикл ---
        if (cycleInsight) {
          rawInsights.push({
            type: 'cycle',
            group: 'hormones',
            priority: 2,
            severity: 'info',
            emoji: '🌸',
            text: cycleInsight.text,
            action: cycleInsight.recommendation,
            pmid: null,
            timeRelevance: 1
          });
        }

        // --- 16. 🆕 Персональные паттерны (анализ истории) ---
        // Паттерн: недосып → переедание
        const sleepOvereatPattern = pastDays.filter((d) =>
          (d.sleepHours || 0) < 6 && (d.ratio || 0) > 1.15
        ).length;
        if (sleepOvereatPattern >= 2) {
          rawInsights.push({
            type: 'personalPattern',
            group: 'pattern',
            priority: 1,
            severity: 'critical',
            emoji: '🔄',
            text: `Твой паттерн: ${sleepOvereatPattern} из ${pastDays.length} дней — недосып → переедание`,
            action: 'Это твоя главная точка роста! Фокус на сон = контроль веса',
            pmid: '15602591',
            timeRelevance: 1.5,
            isPersonal: true
          });
        }

        // Паттерн: выходные → перебор
        const weekendOvereatPattern = pastDays.filter((d) => {
          const dayDate = new Date(d.date);
          const dow = dayDate.getDay();
          return (dow === 0 || dow === 6) && (d.ratio || 0) > 1.2;
        }).length;
        const totalWeekends = pastDays.filter((d) => {
          const dayDate = new Date(d.date);
          const dow = dayDate.getDay();
          return dow === 0 || dow === 6;
        }).length;
        if (weekendOvereatPattern >= 2 && totalWeekends >= 2 && weekendOvereatPattern / totalWeekends >= 0.5) {
          rawInsights.push({
            type: 'personalPattern',
            group: 'pattern',
            priority: 2,
            severity: 'warning',
            emoji: '🎉',
            text: `Паттерн выходных: ${weekendOvereatPattern} из ${totalWeekends} — перебор >20%`,
            action: 'Планируй выходные заранее — добавь активность или refeed',
            pmid: null,
            timeRelevance: 1.3,
            isPersonal: true
          });
        }

        // --- 17. 🆕 Хронический недосып (на основе реальных данных) ---
        const daysWithSleep = pastDays.filter((d) => (d.sleepHours || 0) > 0);
        const avgSleepHours = daysWithSleep.length > 0
          ? daysWithSleep.reduce((s, d) => s + (d.sleepHours || 0), 0) / daysWithSleep.length
          : 0;
        const sleepNorm = prof.sleepHours || 8;
        const sleepDeficitHours = sleepNorm - avgSleepHours;

        if (avgSleepHours > 0 && sleepDeficitHours >= 0.8 && daysWithSleep.length >= 3) {
          rawInsights.push({
            type: 'chronicSleepDeficit',
            group: 'sleep',
            priority: sleepDeficitHours >= 1.5 ? 1 : 2,
            severity: sleepDeficitHours >= 1.5 ? 'critical' : 'warning',
            emoji: '😴',
            text: `Недосып: ${avgSleepHours.toFixed(1)}ч в среднем при норме ${sleepNorm}ч (−${sleepDeficitHours.toFixed(1)}ч)`,
            action: 'Ложись на 30 мин раньше сегодня. Недосып → +15% голода, −20% силы воли',
            pmid: '15602591',
            timeRelevance: 1.6,
            isPersonal: true
          });
        }

        // --- 18. 🆕 Низкая активность / сидячий образ жизни ---
        const daysWithSteps = pastDays.filter((d) => (d.steps || 0) > 0);
        const avgSteps = daysWithSteps.length > 0
          ? Math.round(daysWithSteps.reduce((s, d) => s + (d.steps || 0), 0) / daysWithSteps.length)
          : 0;
        const stepsGoal = prof.stepsGoal || 7000;
        const stepsPct = avgSteps / stepsGoal;

        if (avgSteps > 0 && avgSteps < 3000 && daysWithSteps.length >= 3) {
          rawInsights.push({
            type: 'sedentaryPattern',
            group: 'activity',
            priority: 1,
            severity: 'critical',
            emoji: '🪑',
            text: `Очень низкая активность: ${avgSteps} шагов/день (${Math.round(stepsPct * 100)}% от цели ${stepsGoal})`,
            action: 'Каждый час вставай на 5 мин. NEAT сжигает до 350 ккал/день!',
            pmid: '17827399',
            timeRelevance: 1.5,
            isPersonal: true
          });
        } else if (avgSteps > 0 && stepsPct < 0.6 && daysWithSteps.length >= 3) {
          rawInsights.push({
            type: 'lowStepsPattern',
            group: 'activity',
            priority: 2,
            severity: 'warning',
            emoji: '👟',
            text: `Шагов мало: ${avgSteps}/день — это ${Math.round(stepsPct * 100)}% от твоей цели ${stepsGoal}`,
            action: 'Добавь 15-мин прогулку после обеда. Это +2000 шагов и −100 ккал',
            pmid: null,
            timeRelevance: 1.3,
            isPersonal: true
          });
        }

        // --- 19. 🆕 Комбо: агрессивный дефицит + недосып = срыв ---
        const deficitPct = prof.deficitPctTarget || 0;
        if (deficitPct <= -15 && avgSleepHours > 0 && avgSleepHours < 7) {
          rawInsights.push({
            type: 'deficitSleepCombo',
            group: 'metabolism',
            priority: 1,
            severity: 'critical',
            emoji: '⚠️',
            text: `Опасное комбо: дефицит ${deficitPct}% + сон ${avgSleepHours.toFixed(1)}ч`,
            action: 'При недосыпе организм теряет мышцы вместо жира. Снизь дефицит до −10% или спи 7+ часов',
            pmid: '20921542',
            timeRelevance: 1.8,
            isPersonal: true
          });
        }

        // --- 20. 🆕 Низкое потребление воды ---
        const daysWithWater = pastDays.filter((d) => (d.waterMl || 0) > 0);
        const avgWaterMl = daysWithWater.length > 0
          ? Math.round(daysWithWater.reduce((s, d) => s + (d.waterMl || 0), 0) / daysWithWater.length)
          : 0;
        const waterNorm = (prof.weight || 70) * 30; // 30мл на кг

        if (avgWaterMl > 0 && avgWaterMl < waterNorm * 0.5 && daysWithWater.length >= 3) {
          rawInsights.push({
            type: 'lowWaterPattern',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '💧',
            text: `Мало воды: ${avgWaterMl}мл/день при норме ${waterNorm}мл (${Math.round(avgWaterMl / waterNorm * 100)}%)`,
            action: 'Дегидратация маскируется под голод. Пей стакан воды перед каждым приёмом пищи',
            pmid: '28739050',
            timeRelevance: 1.2,
            isPersonal: true
          });
        }

        // --- 21. 🆕 Нерегулярные тренировки ---
        const daysWithTraining = pastDays.filter((d) => d.hasTraining).length;
        const trainingFrequency = pastDays.length > 0 ? daysWithTraining / pastDays.length : 0;

        if (pastDays.length >= 7 && trainingFrequency < 0.3 && daysWithTraining < 3) {
          rawInsights.push({
            type: 'lowTrainingPattern',
            group: 'activity',
            priority: 2,
            severity: 'warning',
            emoji: '🏋️',
            text: `Мало тренировок: ${daysWithTraining} из ${pastDays.length} дней (${Math.round(trainingFrequency * 100)}%)`,
            action: 'Даже 2-3 тренировки в неделю ускоряют метаболизм на 5-15% на следующий день (NDTE)',
            pmid: '3056758',
            timeRelevance: 1.2,
            isPersonal: true
          });
        }

        // --- 22. 🆕 Скачки веса (высокая вариабельность) ---
        const daysWithWeight = pastDays.filter((d) => (d.weightMorning || 0) > 0);
        if (daysWithWeight.length >= 5) {
          const weights = daysWithWeight.map((d) => d.weightMorning);
          const avgWeight = weights.reduce((s, w) => s + w, 0) / weights.length;
          const variance = weights.reduce((s, w) => s + Math.pow(w - avgWeight, 2), 0) / weights.length;
          const stdDev = Math.sqrt(variance);
          const weightRange = Math.max(...weights) - Math.min(...weights);

          if (stdDev > 0.8 || weightRange > 2.5) {
            rawInsights.push({
              type: 'weightFluctuation',
              group: 'pattern',
              priority: 2,
              severity: 'info',
              emoji: '📊',
              text: `Скачки веса: ±${stdDev.toFixed(1)}кг (диапазон ${weightRange.toFixed(1)}кг за ${daysWithWeight.length} дней)`,
              action: 'Это нормально! Вода, соль, стресс. Смотри на тренд 7-14 дней, не на дневные скачки',
              pmid: null,
              timeRelevance: 1.0,
              isPersonal: true
            });
          }
        }

        // ========== ПИТАНИЕ И МАКРОСЫ (главное!) ==========

        // --- 23. 🆕 Хронический недобор калорий ---
        const daysWithRatio = pastDays.filter((d) => d.ratio && d.ratio > 0);
        const avgRatio = daysWithRatio.length > 0
          ? daysWithRatio.reduce((s, d) => s + d.ratio, 0) / daysWithRatio.length
          : 0;
        const chronicUndereating = daysWithRatio.filter((d) => d.ratio < 0.85).length;

        if (avgRatio > 0 && avgRatio < 0.85 && daysWithRatio.length >= 5) {
          rawInsights.push({
            type: 'chronicUndereating',
            group: 'nutrition',
            priority: 1,
            severity: 'critical',
            emoji: '🚨',
            text: `Хронический недоед: ${Math.round(avgRatio * 100)}% от нормы (${chronicUndereating} из ${daysWithRatio.length} дней <85%)`,
            action: 'Метаболизм замедляется! Добавь 200-300 ккал или сделай refeed день',
            pmid: '20921542',
            timeRelevance: 1.8,
            isPersonal: true
          });
        } else if (avgRatio > 0 && avgRatio < 0.92 && daysWithRatio.length >= 5) {
          rawInsights.push({
            type: 'slightUndereating',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '📉',
            text: `Систематический недобор: ${Math.round(avgRatio * 100)}% от нормы за ${daysWithRatio.length} дней`,
            action: 'Немного не добираешь. Добавь перекус или увеличь порции на 10%',
            pmid: null,
            timeRelevance: 1.3,
            isPersonal: true
          });
        }

        // --- 24. 🆕 Хронический перебор калорий ---
        const chronicOvereating = daysWithRatio.filter((d) => d.ratio > 1.15).length;

        if (avgRatio > 1.15 && daysWithRatio.length >= 5) {
          rawInsights.push({
            type: 'chronicOvereating',
            group: 'nutrition',
            priority: 1,
            severity: 'critical',
            emoji: '⚠️',
            text: `Систематический перебор: ${Math.round(avgRatio * 100)}% от нормы (${chronicOvereating} из ${daysWithRatio.length} дней >115%)`,
            action: 'Пересмотри размер порций или увеличь активность. 100 лишних ккал/день = +5кг/год',
            pmid: null,
            timeRelevance: 1.6,
            isPersonal: true
          });
        }

        // --- 25. 🆕 Низкий белок в среднем ---
        const daysWithProt = pastDays.filter((d) => d.prot > 0 && d.target > 0);
        const avgProtPct = daysWithProt.length > 0
          ? daysWithProt.reduce((s, d) => s + (d.prot * 3 / d.target), 0) / daysWithProt.length
          : 0;
        const proteinNormPct = 0.25; // 25% от калоража — норма

        if (avgProtPct > 0 && avgProtPct < proteinNormPct * 0.7 && daysWithProt.length >= 5) {
          rawInsights.push({
            type: 'chronicLowProtein',
            group: 'nutrition',
            priority: 1,
            severity: 'critical',
            emoji: '🥩',
            text: `Критически мало белка: ${Math.round(avgProtPct * 100)}% от калоража (норма ${Math.round(proteinNormPct * 100)}%)`,
            action: 'На дефиците теряешь мышцы! Добавь белок к каждому приёму: творог, яйца, мясо',
            pmid: '22150425',
            timeRelevance: 1.7,
            isPersonal: true
          });
        } else if (avgProtPct > 0 && avgProtPct < proteinNormPct * 0.85 && daysWithProt.length >= 5) {
          rawInsights.push({
            type: 'lowProtein',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '🍗',
            text: `Маловато белка: ${Math.round(avgProtPct * 100)}% от калоража (цель ${Math.round(proteinNormPct * 100)}%)`,
            action: 'Добавь 20-30г белка в день. Протеин = сытость + сохранение мышц',
            pmid: null,
            timeRelevance: 1.4,
            isPersonal: true
          });
        }

        // --- 26. 🆕 Перебор углеводов ---
        const daysWithCarbs = pastDays.filter((d) => d.carbs > 0 && d.target > 0);
        const avgCarbsPct = daysWithCarbs.length > 0
          ? daysWithCarbs.reduce((s, d) => s + (d.carbs * 4 / d.target), 0) / daysWithCarbs.length
          : 0;
        const carbsNormPct = 0.45; // 45% от калоража

        if (avgCarbsPct > carbsNormPct * 1.3 && daysWithCarbs.length >= 5) {
          rawInsights.push({
            type: 'highCarbs',
            group: 'nutrition',
            priority: 2,
            severity: 'warning',
            emoji: '🍞',
            text: `Много углеводов: ${Math.round(avgCarbsPct * 100)}% от калоража (норма ~${Math.round(carbsNormPct * 100)}%)`,
            action: 'Высокие углеводы = частые инсулиновые волны. Замени часть на белок/жиры',
            pmid: null,
            timeRelevance: 1.2,
            isPersonal: true
          });
        }

        // --- 27. 🆕 Нестабильность калоража (йо-йо питание) ---
        if (daysWithRatio.length >= 5) {
          const ratios = daysWithRatio.map((d) => d.ratio);
          const avgR = ratios.reduce((s, r) => s + r, 0) / ratios.length;
          const ratioVariance = ratios.reduce((s, r) => s + Math.pow(r - avgR, 2), 0) / ratios.length;
          const ratioStdDev = Math.sqrt(ratioVariance);

          if (ratioStdDev > 0.25) {
            rawInsights.push({
              type: 'unstableCalories',
              group: 'pattern',
              priority: 2,
              severity: 'warning',
              emoji: '🎢',
              text: `Йо-йо питание: калории скачут ±${Math.round(ratioStdDev * 100)}% от нормы`,
              action: 'Стабильность важнее идеала! Лучше 95% каждый день, чем 70%→130%',
              pmid: null,
              timeRelevance: 1.3,
              isPersonal: true
            });
          }
        }

        // --- 28. 🆕 Отличный баланс калорий ---
        if (avgRatio >= 0.92 && avgRatio <= 1.08 && daysWithRatio.length >= 5) {
          const goodDays = daysWithRatio.filter((d) => d.ratio >= 0.85 && d.ratio <= 1.15).length;
          const goodPct = goodDays / daysWithRatio.length;

          if (goodPct >= 0.7) {
            rawInsights.push({
              type: 'stableCalories',
              group: 'nutrition',
              priority: 3,
              severity: 'positive',
              emoji: '🎯',
              text: `Стабильное питание: ${Math.round(avgRatio * 100)}% от нормы, ${goodDays}/${daysWithRatio.length} дней в цели`,
              action: 'Отлично! Такая стабильность = предсказуемый результат. Продолжай!',
              pmid: null,
              timeRelevance: 1.0,
              isPersonal: true
            });
          }
        }

        // --- 29. 🆕 Отличный белок ---
        if (avgProtPct >= proteinNormPct * 0.95 && daysWithProt.length >= 5) {
          rawInsights.push({
            type: 'goodProtein',
            group: 'nutrition',
            priority: 3,
            severity: 'positive',
            emoji: '💪',
            text: `Белок в норме: ${Math.round(avgProtPct * 100)}% от калоража — мышцы защищены!`,
            action: 'Так держать! Белок сохраняет мышцы даже на дефиците',
            pmid: null,
            timeRelevance: 0.9,
            isPersonal: true
          });
        }

        // --- Сортировка и фильтрация ---
        // 1. Фильтруем "норма" инсайты (priority 4) если есть более важные
        // 2. Сортируем по: severity → priority → timeRelevance

        const severityOrder = { critical: 0, warning: 1, positive: 2, info: 3 };

        const sortedInsights = rawInsights
          .map((ins) => ({
            ...ins,
            score: (4 - severityOrder[ins.severity]) * 100 + (5 - ins.priority) * 10 + (ins.timeRelevance || 1) * 5
          }))
          .sort((a, b) => b.score - a.score);

        // Если есть критические/warning — убираем "положительные" инсайты чтобы не отвлекать
        const hasCritical = sortedInsights.some((i) => i.severity === 'critical' || i.severity === 'warning');
        const scientificInsights = hasCritical
          ? sortedInsights.filter((i) => i.severity !== 'positive' || i.priority <= 2 || i.isPersonal)
          : sortedInsights;

        // Группируем по теме для UI
        const insightGroups = {
          sleep: scientificInsights.filter((i) => i.group === 'sleep'),
          metabolism: scientificInsights.filter((i) => i.group === 'metabolism'),
          timing: scientificInsights.filter((i) => i.group === 'timing'),
          nutrition: scientificInsights.filter((i) => i.group === 'nutrition'),
          activity: scientificInsights.filter((i) => i.group === 'activity'),
          hormones: scientificInsights.filter((i) => i.group === 'hormones'),
          pattern: scientificInsights.filter((i) => i.group === 'pattern')
        };

        // Главный инсайт дня (самый важный)
        const mainInsight = scientificInsights[0] || null;

        // ═══════════════════════════════════════════════════════════════════
        // 🆕 v3.1: РАСШИРЕННАЯ АНАЛИТИКА (6 новых фич)
        // ═══════════════════════════════════════════════════════════════════

        // --- #2: PROTEIN DEBT (Белковый долг) ---
        // 🔬 Mettler 2010: При дефиците нужно 1.8-2.7г/кг белка для сохранения мышц
        let proteinDebt = {
          hasDebt: false,
          debt: 0,
          avgProteinPct: 0,
          targetPct: CFG.PROTEIN_TARGET_PCT,
          daysAnalyzed: 0,
          severity: 'none', // none | mild | moderate | critical
          recommendation: null,
          pmid: '20095013'
        };

        const proteinDays = pastDays.filter((d) => d.prot > 0 && d.target > 0);
        if (proteinDays.length >= 2) {
          const avgProtPct = proteinDays.reduce((s, d) => s + (d.prot * 3 / d.target), 0) / proteinDays.length;
          const targetPct = CFG.PROTEIN_TARGET_PCT;
          const deficitPct = targetPct - avgProtPct;

          proteinDebt.avgProteinPct = Math.round(avgProtPct * 100);
          proteinDebt.daysAnalyzed = proteinDays.length;

          if (avgProtPct < CFG.PROTEIN_CRITICAL_PCT) {
            proteinDebt.hasDebt = true;
            proteinDebt.severity = 'critical';
            proteinDebt.debt = Math.round((targetPct - avgProtPct) * optimum / 4); // граммы
            proteinDebt.recommendation = `Критический недобор белка! Добавь ${Math.round(proteinDebt.debt * 0.5)}г белка сегодня`;
          } else if (avgProtPct < targetPct * 0.85) {
            proteinDebt.hasDebt = true;
            proteinDebt.severity = 'moderate';
            proteinDebt.debt = Math.round((targetPct - avgProtPct) * optimum / 4);
            proteinDebt.recommendation = `Маловато белка. Добавь ${Math.round(proteinDebt.debt * 0.3)}г к обычному рациону`;
          } else if (avgProtPct < targetPct * 0.95) {
            proteinDebt.hasDebt = true;
            proteinDebt.severity = 'mild';
            proteinDebt.debt = Math.round((targetPct - avgProtPct) * optimum / 4);
            proteinDebt.recommendation = 'Белок немного ниже оптимума. Добавь яйцо или порцию творога';
          }
        }

        // --- #3: TRAINING DAY CONTEXT (Контекст тренировочного дня) ---
        // Разные типы тренировок требуют разного восстановления
        let trainingDayContext = {
          isTrainingDay: false,
          trainingType: null,
          trainingIntensity: 'none',
          recoveryMultiplier: 1.0,
          recommendations: [],
          nutritionPriority: 'balanced' // balanced | protein | carbs | recovery
        };

        const todayTrainingsForContext = day.trainings || [];
        if (todayTrainingsForContext.length > 0) {
          trainingDayContext.isTrainingDay = true;

          // Определяем доминирующий тип
          const typeCounts = { strength: 0, cardio: 0, hobby: 0 };
          let totalZoneMinutes = 0;
          let highIntensityMinutes = 0; // Зоны 3-4

          todayTrainingsForContext.forEach((t) => {
            typeCounts[t.type || 'hobby']++;
            if (t.z) {
              const total = t.z.reduce((s, m) => s + (+m || 0), 0);
              totalZoneMinutes += total;
              highIntensityMinutes += (+t.z[2] || 0) + (+t.z[3] || 0); // Зоны 3-4
            }
          });

          // Доминирующий тип
          trainingDayContext.trainingType = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'hobby';

          // Интенсивность по времени в зонах 3-4
          if (totalZoneMinutes >= 90 && highIntensityMinutes >= 30) {
            trainingDayContext.trainingIntensity = 'extreme';
          } else if (totalZoneMinutes >= 60 || highIntensityMinutes >= 20) {
            trainingDayContext.trainingIntensity = 'high';
          } else if (totalZoneMinutes >= 30) {
            trainingDayContext.trainingIntensity = 'moderate';
          } else {
            trainingDayContext.trainingIntensity = 'light';
          }

          // Множитель восстановления
          const typeMult = CFG.TRAINING_TYPE_MULT[trainingDayContext.trainingType] || 1.0;
          const intensityMult = CFG.TRAINING_INTENSITY_MULT[trainingDayContext.trainingIntensity] || 1.0;
          trainingDayContext.recoveryMultiplier = Math.round(typeMult * intensityMult * 100) / 100;

          // Приоритет питания
          if (trainingDayContext.trainingType === 'strength') {
            trainingDayContext.nutritionPriority = 'protein';
            trainingDayContext.recommendations.push('💪 Силовая: фокус на белок (1.6-2.2г/кг)');
          } else if (trainingDayContext.trainingType === 'cardio' && trainingDayContext.trainingIntensity !== 'light') {
            trainingDayContext.nutritionPriority = 'carbs';
            trainingDayContext.recommendations.push('🏃 Кардио: восполни гликоген углеводами');
          }

          if (trainingDayContext.trainingIntensity === 'extreme' || trainingDayContext.trainingIntensity === 'high') {
            trainingDayContext.nutritionPriority = 'recovery';
            trainingDayContext.recommendations.push('🔥 Интенсивная: добавь +10-15% калорий для восстановления');
          }
        }

        // --- #4: CIRCADIAN CONTEXT (Циркадный контекст) ---
        // 🔬 Van Cauter 1997: Утренняя инсулиночувствительность выше
        // currentHour уже объявлен выше (строка 10018)
        let circadianContext = {
          period: 'day', // morning | day | evening | night
          urgency: 'low', // low | medium | high
          debtMultiplier: 1.0,
          advice: null
        };

        if (currentHour >= 6 && currentHour < 12) {
          circadianContext.period = 'morning';
          circadianContext.urgency = 'low';
          circadianContext.debtMultiplier = CFG.CIRCADIAN_MORNING_MULT;
          if (hasDebt && rawDebt < 500) {
            circadianContext.advice = 'Утро — ещё рано переживать о недоборе. Впереди весь день!';
          }
        } else if (currentHour >= 12 && currentHour < 18) {
          circadianContext.period = 'day';
          circadianContext.urgency = 'medium';
          circadianContext.debtMultiplier = 1.0;
        } else if (currentHour >= 18 && currentHour < 23) {
          circadianContext.period = 'evening';
          circadianContext.urgency = hasDebt && rawDebt > 400 ? 'high' : 'medium';
          circadianContext.debtMultiplier = CFG.CIRCADIAN_EVENING_MULT;
          if (hasDebt && rawDebt > 500) {
            circadianContext.advice = 'Вечер — нужно поесть! Большой недобор ухудшит сон и повысит грелин завтра.';
          }
        } else {
          circadianContext.period = 'night';
          circadianContext.urgency = 'high';
          circadianContext.debtMultiplier = CFG.CIRCADIAN_EVENING_MULT;
        }

        // --- #5: EMOTIONAL RISK (Эмоциональный риск срыва) ---
        // 🔬 Epel 2001: Стресс + голод = высокий риск срыва
        // avgStress уже объявлен выше (строка 9746)
        const isHighStress = avgStress >= CFG.STRESS_HIGH_THRESHOLD;

        let emotionalRisk = {
          level: 'low', // low | medium | high | critical
          stressLevel: avgStress,
          factors: [],
          bingeRisk: 0, // 0-100%
          recommendation: null,
          pmid: '11070333' // Epel 2001
        };

        // Факторы риска
        if (isHighStress) emotionalRisk.factors.push('Высокий стресс');
        if (hasDebt && rawDebt > 400) emotionalRisk.factors.push('Накопленный недобор');
        if (cortisolAnalysis.stressEatingDetected) emotionalRisk.factors.push('Паттерн стрессового переедания');
        if (circadianContext.period === 'evening' || circadianContext.period === 'night') {
          emotionalRisk.factors.push('Вечер/ночь (пик уязвимости)');
        }

        // Расчёт риска
        emotionalRisk.bingeRisk = Math.min(100, emotionalRisk.factors.length * 25);

        if (emotionalRisk.bingeRisk >= 75) {
          emotionalRisk.level = 'critical';
          emotionalRisk.recommendation = '🚨 Высокий риск срыва! Съешь что-то прямо сейчас — это предотвратит переедание позже';
        } else if (emotionalRisk.bingeRisk >= 50) {
          emotionalRisk.level = 'high';
          emotionalRisk.recommendation = '⚠️ Будь внимательней — стресс + голод провоцируют переедание';
        } else if (emotionalRisk.bingeRisk >= 25) {
          emotionalRisk.level = 'medium';
          emotionalRisk.recommendation = 'Следи за собой — один из факторов риска присутствует';
        }

        // --- #6: BMI-BASED PERSONALIZATION ---
        // 🔬 Kahn & Flier 2000, DeFronzo 1979: Разный BMI = разный метаболизм
        const weight = prof?.weight || 70;
        const height = prof?.height || 170;
        const bmi = weight / Math.pow(height / 100, 2);

        let bmiContext = {
          value: Math.round(bmi * 10) / 10,
          category: 'normal',
          recoveryMultiplier: 1.0,
          boostMultiplier: 1.0,
          recommendation: null
        };

        // Определяем категорию
        for (const [cat, cfg] of Object.entries(CFG.BMI_RECOVERY_MULT)) {
          if (bmi < cfg.threshold) {
            bmiContext.category = cat;
            bmiContext.recoveryMultiplier = cfg.mult;
            bmiContext.boostMultiplier = cfg.boost;
            break;
          }
        }

        // Рекомендации по BMI
        if (bmiContext.category === 'underweight') {
          bmiContext.recommendation = 'При низком BMI важнее НАБРАТЬ, чем терять. Увеличь калории!';
        } else if (bmiContext.category === 'obese') {
          bmiContext.recommendation = 'При высоком BMI можно чуть агрессивнее с дефицитом, но сохраняй белок!';
        }

        // === РЕЗУЛЬТАТ ===
        return {
          // Долг (недобор)
          hasDebt,
          debt: Math.round(cappedDebt),
          rawDebt: Math.round(rawDebt),
          effectiveDebt, // Сколько реально компенсируем (75% от долга)
          recoveryDays, // Гибкое кол-во дней (1-3)
          dailyBoost,
          adjustedOptimum: optimum + dailyBoost,
          needsRefeed,
          refeedBoost,
          refeedOptimum: optimum + Math.round(optimum * CFG.REFEED_BOOST_PCT),
          consecutiveDeficitDays: maxConsecutiveDeficit,

          // Прогноз восстановления
          daysToRecover,
          recoveryDayName,
          isRecovering,

          // Перебор
          hasExcess,
          excess: Math.round(netExcess),
          rawExcess: Math.round(rawExcess),
          totalTrainingKcal: Math.round(totalTrainingKcal),
          cardioRecommendation,
          // Мягкая коррекция перебора
          dailyReduction, // Снижение нормы (акцент)
          effectiveExcess, // Чистый перебор после активности
          excessRecoveryDays, // Дней на компенсацию
          activityCompensation, // Сколько через активность
          adjustedOptimumWithExcess: optimum - dailyReduction, // Норма с учётом перебора

          // Общее
          dayBreakdown,
          daysAnalyzed: pastDays.length,
          totalBalance: Math.round(totalBalance),
          weightedBalance: Math.round(weightedBalance),

          // Аналитика
          trend,
          severity,
          weightImpact,
          goalMode: goalThresholds.mode,

          // 🔬 Научная аналитика v5.0
          scientificInsights,
          insightGroups,
          mainInsight,
          hasCriticalInsights: hasCritical,

          // Детальные анализы (для расширенного UI)
          tefAnalysis,
          epocAnalysis,
          adaptiveThermogenesis,
          hormonalBalance,
          insulinTimingAnalysis,
          cortisolAnalysis,
          circadianAnalysis,
          mealFrequencyAnalysis,
          metabolicWindowAnalysis,
          weightPrediction,
          fatQualityAnalysis,
          insulinWaveInsight,
          sleepInsight,
          waterInsight,
          lastWeekComparison,
          smartTiming,
          cycleInsight,

          // 🆕 v3.1: Расширенная аналитика
          proteinDebt, // #2 Белковый долг
          trainingDayContext, // #3 Контекст тренировочного дня
          circadianContext, // #4 Циркадный контекст
          emotionalRisk, // #5 Эмоциональный риск срыва
          bmiContext // #6 BMI-персонализация
        };
      } catch (e) {
        console.warn('[CaloricDebt] Error:', e);
        return null;
      }
    }, [sparklineData, optimum, day.trainings, day.steps, day.deficitPct, prof?.deficitPctTarget]);

    return caloricDebt;
  };
})();


/* ===== heys_day_insights_data_v1.js ===== */
// heys_day_insights_data_v1.js — day insights calculations (kcal trend, balance viz, heatmap, meals chart)
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  // Debug marker: модуль загружен
  try {
    HEYS.debugData = HEYS.debugData || {};
    HEYS.debugData.insightsModuleLoaded = { ts: Date.now(), version: 'v1-local' };
  } catch (e) { }
  HEYS.dayInsightsData = HEYS.dayInsightsData || {};

  HEYS.weeklyCalc = HEYS.weeklyCalc || {};
  HEYS.weeklyCalc.resolveTargetDeficitPct = HEYS.weeklyCalc.resolveTargetDeficitPct || function ({ dayData, tdeeInfo, profile, goalTarget, burned }) {
    const fromDay = dayData?.deficitPct;
    if (Number.isFinite(fromDay)) return fromDay;
    const fromTdee = tdeeInfo?.deficitPct;
    if (Number.isFinite(fromTdee)) return fromTdee;
    const fromProfile = profile?.deficitPctTarget;
    if (Number.isFinite(fromProfile)) return fromProfile;
    const fromGoal = (Number.isFinite(goalTarget) && goalTarget > 0 && Number.isFinite(burned) && burned > 0)
      ? ((goalTarget - burned) / burned) * 100
      : null;
    return Number.isFinite(fromGoal) ? fromGoal : 0;
  };

  HEYS.weeklyCalc.isIncompleteToday = HEYS.weeklyCalc.isIncompleteToday || function ({ isToday, dateStr, nowDateStr, ratio }) {
    const isSameDay = isToday || (dateStr && nowDateStr && dateStr === nowDateStr);
    if (!isSameDay) return false;
    return ratio == null || ratio < 0.5;
  };

  HEYS.weeklyCalc.shouldIncludeDay = HEYS.weeklyCalc.shouldIncludeDay || function ({ day, nowDateStr, requireMeals = false, requireKcal = false, requireRatio = false }) {
    if (!day) return false;
    if (day.isFuture) return false;
    const dateStr = day.dateStr || day.date;
    const incomplete = HEYS.weeklyCalc.isIncompleteToday({
      isToday: !!day.isToday,
      dateStr,
      nowDateStr,
      ratio: day.ratio
    });
    if (incomplete) return false;
    if (requireMeals && !day.hasMeals) return false;
    if (requireKcal && !(day.kcal > 0)) return false;
    if (requireRatio && !(day.ratio != null && day.ratio > 0)) return false;
    return true;
  };

  HEYS.dayInsightsData.computeDayInsightsData = function computeDayInsightsData(ctx) {
    const {
      React,
      date,
      day,
      eatenKcal,
      optimum,
      caloricDebt,
      prof,
      pIndex,
      U,
      products,
      sparklineData,
      fmtDate,
      M,
      getMealType,
      getMealQualityScore,
      HEYS: heysGlobal
    } = ctx || {};

    if (!React) return {};

    const HEYSRef = heysGlobal || global.HEYS || {};
    const safeDay = day || {};
    const safeMeals = safeDay.meals || [];
    const safeProducts = products || [];
    const safeU = U || HEYSRef.utils || {};
    const dayUtils = HEYSRef.dayUtils || {};

    // Debug marker: фиксируем факт вызова computeDayInsightsData
    try {
      HEYSRef.debugData = HEYSRef.debugData || {};
      HEYSRef.debugData.insightsDataSeen = {
        date,
        hasReact: !!React,
        hasFmtDate: !!fmtDate,
        ts: Date.now()
      };
    } catch (e) { }

    // Тренд калорий за последние N дней (среднее превышение/дефицит)
    const kcalTrend = React.useMemo(() => {
      if (!sparklineData || sparklineData.length < 3 || !optimum || optimum <= 0) return null;

      try {
        // Считаем среднее отклонение от нормы (исключая сегодня и неполные дни <50%)
        const pastDays = sparklineData.filter(d => {
          if (d.isToday) return false;
          if (d.kcal <= 0) return false;
          // Исключаем дни с <50% заполненности — вероятно незаполненные
          const ratio = d.target > 0 ? d.kcal / d.target : 0;
          return ratio >= 0.5;
        });
        if (pastDays.length < 2) return null;

        const avgKcal = pastDays.reduce((sum, d) => sum + d.kcal, 0) / pastDays.length;
        const diff = avgKcal - optimum;
        const diffPct = Math.round((diff / optimum) * 100);

        let direction = 'same';
        let text = '';

        if (diffPct <= -5) {
          direction = 'deficit';
          text = 'Дефицит ' + Math.abs(diffPct) + '%';
        } else if (diffPct >= 5) {
          direction = 'excess';
          text = 'Избыток ' + diffPct + '%';
        } else {
          direction = 'same';
          text = 'В норме';
        }

        return { text, diff, direction, avgKcal: Math.round(avgKcal) };
      } catch (e) {
        return null;
      }
    }, [sparklineData, optimum]);

    // === BALANCE VIZ — Мини-график баланса за неделю ===
    // Визуализация для карточки "Инсайты недели"
    const balanceViz = React.useMemo(() => {
      // Если нет caloricDebt — создаём базовую визуализацию из текущего дня
      const dayBreakdown = caloricDebt?.dayBreakdown || [];

      // Если вообще нет данных — показываем хотя бы текущий день
      if (dayBreakdown.length === 0) {
        const todayDelta = Math.round((eatenKcal || 0) - (optimum || 0));
        const todayRatio = optimum > 0 ? (eatenKcal || 0) / optimum : 0;

        // Цвет для текущего дня
        let todayColor;
        if (Math.abs(todayDelta) <= 100) {
          todayColor = '#22c55e';
        } else if (todayDelta < 0) {
          todayColor = '#eab308';
        } else {
          todayColor = '#ef4444';
        }

        const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const todayIdx = new Date().getDay();

        return {
          viz: [{
            bar: todayDelta > 0 ? '▅' : todayDelta < -200 ? '▂' : '▄',
            color: todayColor,
            delta: todayDelta,
            day: dayNames[todayIdx],
            date: new Date().toISOString().split('T')[0],
            eaten: Math.round(eatenKcal || 0),
            target: Math.round(optimum || 0),
            hasTraining: (safeDay.trainings || []).length > 0,
            ratio: todayRatio
          }],
          insights: [{
            type: 'today',
            emoji: '📊',
            text: 'Сегодня: ' + (todayDelta > 0 ? '+' : '') + todayDelta + ' ккал от нормы',
            color: todayColor
          }],
          totalBalance: todayDelta,
          daysCount: 1
        };
      }

      const { totalBalance, trend, goalMode } = caloricDebt || {};

      // Столбики для визуализации
      const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

      // Находим максимальную дельту для нормализации
      const maxDelta = Math.max(...dayBreakdown.map(d => Math.abs(d.delta)), 100);

      const viz = dayBreakdown.map(d => {
        // Нормализуем дельту к высоте столбика (0-7)
        const normalized = Math.min(Math.abs(d.delta) / maxDelta, 1);
        const barIdx = Math.floor(normalized * 7);

        // Цвет: зелёный = в норме (±100), жёлтый = недобор, красный = перебор
        let color;
        if (Math.abs(d.delta) <= 100) {
          color = '#22c55e'; // Зелёный — баланс
        } else if (d.delta < 0) {
          color = '#eab308'; // Жёлтый — недобор
        } else {
          color = '#ef4444'; // Красный — перебор
        }

        return {
          bar: bars[barIdx],
          color,
          delta: d.delta,
          day: d.dayName,
          date: d.date,
          eaten: d.eaten,
          target: d.target,
          baseTarget: d.baseTarget,
          isRefeedDay: d.isRefeedDay,
          hasTraining: d.hasTraining,
          ratio: d.ratio,
          dayOfWeek: new Date(d.date).getDay() // 0=Вс, 6=Сб
        };
      });

      // === РАЗДЕЛЯЕМ ИНСАЙТЫ ===
      // 1. balanceInsights — про перебор/баланс (для карточки перебора)
      // 2. scienceInsights — научная аналитика (для "Инсайты недели")

      const balanceInsights = [];
      const scienceInsights = [];

      // === SEVERITY для тона сообщений ===
      const severity = caloricDebt?.severity || 0;
      const severityTone = severity >= 3 ? 'critical' : severity >= 2 ? 'warning' : 'mild';

      // === ИНСАЙТЫ БАЛАНСА (для карточки перебора) ===

      // 1. Тренд с severity-dependent текстом
      if (trend && trend.direction !== 'stable') {
        let trendText = trend.text;
        if (trend.direction === 'worsening' && severity >= 2) {
          trendText = 'Перебор нарастает — нужно действовать';
        }
        balanceInsights.push({
          type: 'trend',
          emoji: trend.emoji,
          text: trendText,
          color: trend.direction === 'improving' ? '#22c55e' : '#ef4444',
          priority: 1
        });
      }

      // 2. Паттерн выходных — ИСПРАВЛЕНО: по dayOfWeek, не по индексу
      const weekendDays = viz.filter(d => d.dayOfWeek === 0 || d.dayOfWeek === 6); // Вс или Сб
      const weekdayDays = viz.filter(d => d.dayOfWeek >= 1 && d.dayOfWeek <= 5); // Пн-Пт
      const weekendAvg = weekendDays.length > 0 ? weekendDays.reduce((s, d) => s + d.delta, 0) / weekendDays.length : 0;
      const weekdayAvg = weekdayDays.length > 0 ? weekdayDays.reduce((s, d) => s + d.delta, 0) / weekdayDays.length : 0;

      if (weekendDays.length > 0 && weekendAvg > weekdayAvg + 100) {
        const diff = Math.round(weekendAvg - weekdayAvg);
        balanceInsights.push({
          type: 'pattern',
          emoji: '🎉',
          text: 'В выходные +' + diff + ' ккал к будням',
          color: '#f59e0b',
          priority: 2
        });
      }

      // 3. 🔬 EPOC-adjusted перебор (научно!)
      // EPOC = 6-15% от калорий тренировки (PMID: 12882417)
      const totalTrainingKcal = caloricDebt?.totalTrainingKcal || 0;
      const epocKcal = Math.round(totalTrainingKcal * 0.12); // 12% — средний EPOC
      const netExcess = (totalBalance || 0) - epocKcal;

      if (totalTrainingKcal > 100 && epocKcal > 30) {
        balanceInsights.push({
          type: 'epoc',
          emoji: '🔥',
          text: 'EPOC сжёг ещё ~' + epocKcal + ' ккал после тренировок',
          color: '#22c55e',
          priority: 3,
          pmid: '12882417'
        });
      }

      // 4. ⏰ Тайминг перебора — когда съедены лишние калории
      // Анализируем приёмы пищи за текущий день
      const todayMeals = safeDay.meals || [];
      if (todayMeals.length >= 2 && totalBalance > 100) {
        const mealsByTime = todayMeals.map(m => {
          const hour = parseInt((m.time || '12:00').split(':')[0], 10);
          const mealKcal = (m.items || []).reduce((sum, item) => {
            const prod = pIndex?.byId?.get?.(item.product_id);
            const kcal100 = prod?.kcal100 || item.kcal100 || 0;
            return sum + (kcal100 * (item.grams || 0) / 100);
          }, 0);
          return { hour, kcal: mealKcal };
        });

        const eveningKcal = mealsByTime.filter(m => m.hour >= 19).reduce((s, m) => s + m.kcal, 0);
        const totalDayKcal = mealsByTime.reduce((s, m) => s + m.kcal, 0);
        const eveningPct = totalDayKcal > 0 ? Math.round(eveningKcal / totalDayKcal * 100) : 0;

        if (eveningPct >= 45) {
          balanceInsights.push({
            type: 'timing',
            emoji: '🌙',
            text: eveningPct + '% калорий после 19:00 — ↓термогенез',
            color: '#f59e0b',
            priority: 2,
            pmid: '31064667' // Ночное питание и метаболизм
          });
        }
      }

      // 5. 📈 Умный прогноз с учётом паттерна выходных
      if (dayBreakdown.length >= 3) {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0=Вс
        const remainingDays = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

        // Считаем средние для будней и выходных отдельно
        const weekdayAvgDelta = weekdayDays.length > 0 ? weekdayDays.reduce((s, d) => s + d.delta, 0) / weekdayDays.length : 0;
        const weekendAvgDelta = weekendDays.length > 0 ? weekendDays.reduce((s, d) => s + d.delta, 0) / weekendDays.length : weekdayAvgDelta * 1.3;

        // Прогноз с учётом типа оставшихся дней
        let forecastDelta = 0;
        for (let d = dayOfWeek + 1; d <= 7; d++) {
          const dow = d % 7;
          forecastDelta += (dow === 0 || dow === 6) ? weekendAvgDelta : weekdayAvgDelta;
        }

        const forecastBalance = (totalBalance || 0) + forecastDelta;

        if (remainingDays > 0) {
          balanceInsights.push({
            type: 'forecast',
            emoji: forecastBalance > 300 ? '📈' : forecastBalance < -300 ? '📉' : '✅',
            text: 'К воскресенью: ' + (forecastBalance > 0 ? '+' : '') + Math.round(forecastBalance) + ' ккал',
            color: Math.abs(forecastBalance) <= 300 ? '#22c55e' : forecastBalance > 0 ? '#ef4444' : '#f59e0b',
            priority: 3
          });
        }
      }

      // 6. 🧬 Forbes equation — научный расчёт влияния на вес
      // Forbes: ΔFat = ΔEnergy × (Fat% / (Fat% + 10.4))
      // При жире 25%: ~70% перебора → жир, 30% → гликоген+вода
      // PMID: 10365981
      const bodyFatPct = prof?.bodyFatPct || 25; // Предполагаем 25% если не указано
      const forbesFatRatio = bodyFatPct / (bodyFatPct + 10.4);
      const fatGain = Math.round(Math.abs(totalBalance || 0) * forbesFatRatio / 9); // 9 ккал/г жира
      const glycogenWater = Math.round(Math.abs(totalBalance || 0) * (1 - forbesFatRatio) / 4); // гликоген + вода

      if (Math.abs(totalBalance || 0) >= 200) {
        const sign = totalBalance > 0 ? '+' : '−';
        balanceInsights.push({
          type: 'forbes',
          emoji: '🧬',
          text: sign + fatGain + 'г жира, ' + sign + glycogenWater + 'г воды/гликогена',
          color: '#64748b',
          priority: 4,
          pmid: '10365981'
        });
      }

      // 7. 🎯 Контекст цели
      const currentGoalMode = goalMode || 'maintenance';
      const deficitPct = prof?.deficitPctTarget || safeDay.deficitPct || 0;

      if (currentGoalMode === 'loss' && totalBalance > 200) {
        // Сколько дней прогресса потеряно
        const dailyDeficit = optimum * Math.abs(deficitPct) / 100;
        const daysLost = dailyDeficit > 0 ? Math.round(totalBalance / dailyDeficit * 10) / 10 : 0;

        if (daysLost >= 0.5) {
          balanceInsights.push({
            type: 'goal',
            emoji: '🎯',
            text: '~' + daysLost + ' дн прогресса к цели упущено',
            color: '#ef4444',
            priority: 2
          });
        }
      }

      // 8. 💧 Гидратация и "ложный" вес
      // Углеводы задерживают воду: 1г углеводов = 3-4г воды
      if (caloricDebt?.dayBreakdown?.length > 0) {
        const yesterdayIdx = caloricDebt.dayBreakdown.length - 2;
        if (yesterdayIdx >= 0) {
          const yesterday = caloricDebt.dayBreakdown[yesterdayIdx];
          // Если вчера был большой перебор, сегодня может быть +вес (вода)
          if (yesterday.delta > 300) {
            balanceInsights.push({
              type: 'water',
              emoji: '💧',
              text: 'Вчерашние углеводы → +' + Math.round(yesterday.delta * 0.3 / 100) * 100 + 'г воды сегодня',
              color: '#3b82f6',
              priority: 5
            });
          }
        }
      }

      // Сортируем по приоритету
      balanceInsights.sort((a, b) => (a.priority || 99) - (b.priority || 99));

      // === НАУЧНЫЕ ИНСАЙТЫ (для блока "Инсайты недели") ===
      if (caloricDebt?.scientificInsights) {
        caloricDebt.scientificInsights.slice(0, 6).forEach(sci => {
          if (sci && sci.insight) {
            scienceInsights.push({
              type: sci.type || 'science',
              emoji: sci.insight.charAt(0) === '✅' || sci.insight.charAt(0) === '🔥' ? sci.insight.charAt(0) : '🔬',
              text: sci.insight.replace(/^[^\s]+\s/, ''), // Убираем первый эмодзи
              color: sci.insight.includes('⚠️') || sci.insight.includes('📉') ? '#f59e0b' : '#22c55e',
              pmid: sci.pmid
            });
          }
        });
      }

      return {
        viz,
        balanceInsights,    // Для карточки перебора
        scienceInsights,    // Для блока "Инсайты недели"
        insights: balanceInsights, // Совместимость со старым кодом
        totalBalance,
        netExcess,          // EPOC-adjusted
        epocKcal,           // Сколько EPOC сжёг
        fatGain,            // Forbes: граммы жира
        glycogenWater,      // Forbes: гликоген+вода
        daysCount: dayBreakdown.length,
        severityTone        // mild/warning/critical
      };
    }, [caloricDebt, eatenKcal, optimum, safeDay.trainings, safeDay.meals, pIndex, prof]);

    // Данные для heatmap текущей недели (пн-вс)
    const weekHeatmapData = React.useMemo(() => {
      if (!date || !fmtDate) {
        return {
          days: [],
          inNorm: 0,
          withData: 0,
          streak: 0,
          weekendPattern: null,
          avgRatioPct: 0,
          totalEaten: 0,
          totalBurned: 0,
          avgTargetDeficit: prof?.deficitPctTarget || 0
        };
      }

      // Парсим текущую дату правильно (без timezone issues)
      const [year, month, dayNum] = date.split('-').map(Number);
      const today = new Date(year, month - 1, dayNum);
      const now = new Date();
      const nowDateStr = fmtDate(now);

      // Находим понедельник текущей недели
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);

      // Используем те же данные что и sparklineData (activeDays)
      const getActiveDaysForMonth = (HEYSRef.dayUtils && HEYSRef.dayUtils.getActiveDaysForMonth) || (() => new Map());
      const allActiveDays = new Map();

      // Собираем данные за текущий и предыдущий месяц (неделя может охватывать 2 месяца)
      for (let monthOffset = 0; monthOffset >= -1; monthOffset--) {
        const checkDate = new Date(today);
        checkDate.setMonth(checkDate.getMonth() + monthOffset);
        const monthData = getActiveDaysForMonth(checkDate.getFullYear(), checkDate.getMonth(), prof, safeProducts);
        monthData.forEach((v, k) => allActiveDays.set(k, v));
      }

      const days = [];
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      let streak = 0;
      let weekendExcess = 0;
      let weekdayAvg = 0;
      let weekendCount = 0;
      let weekdayCount = 0;
      const dayOptimumCache = new Map();

      const getDayOptimum = (dateStr, dayInfo) => {
        if (dayOptimumCache.has(dateStr)) return dayOptimumCache.get(dateStr);

        const dayData = dayInfo?.dayData
          || (dayUtils.loadDay ? dayUtils.loadDay(dateStr) : (safeU.lsGet ? safeU.lsGet('heys_dayv2_' + dateStr, null) : null));
        const tdeeInfo = dayUtils.getDayTdee
          ? dayUtils.getDayTdee(dateStr, prof, { includeNDTE: true, dayData, pIndex, products: safeProducts })
          : null;
        const target = (dayInfo?.target && dayInfo.target > 0)
          ? dayInfo.target
          : (tdeeInfo?.optimum || optimum || 0);

        const result = { target, baseTarget: tdeeInfo?.baseExpenditure || null };
        dayOptimumCache.set(dateStr, result);
        return result;
      };

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = fmtDate(d);
        const isFuture = dateStr > nowDateStr;
        const isToday = dateStr === date;
        const isWeekend = i >= 5;

        // Загружаем данные дня из activeDays
        let ratio = null;
        let kcal = 0;
        let status = 'empty'; // empty | low | green | yellow | red | perfect
        let isRefeedDay = false; // Загрузочный день
        let isStreakEligible = false;

        // Используем централизованный ratioZones
        const rz = HEYSRef.ratioZones;

        if (!isFuture) {
          // Для сегодняшнего дня используем свежие данные из переданного day, а не кэш
          const dayInfo = isToday && eatenKcal > 0
            ? { kcal: eatenKcal, target: optimum, isRefeedDay: safeDay.isRefeedDay, dayData: safeDay }
            : allActiveDays.get(dateStr);
          isRefeedDay = dayInfo?.isRefeedDay || false;

          if (dayInfo && dayInfo.kcal > 0) {
            kcal = dayInfo.kcal;
            const { target } = getDayOptimum(dateStr, dayInfo);
            if (kcal > 0 && target > 0) {
              ratio = kcal / target;
              // Используем ratioZones для определения статуса — с учётом refeed
              if (isRefeedDay && rz && rz.getDayZone) {
                // Refeed: используем расширенные зоны (до 1.35 = ok)
                const refeedZone = rz.getDayZone(ratio, { isRefeedDay: true });
                status = refeedZone.id === 'refeed_ok' ? 'green' :
                  refeedZone.id === 'refeed_under' ? 'yellow' : 'red';
              } else {
                status = rz ? rz.getHeatmapStatus(ratio) : 'empty';
              }

              // Определяем streak-статус дня (с учётом refeed)
              isStreakEligible = rz?.isStreakDayWithRefeed
                ? rz.isStreakDayWithRefeed(ratio, { isRefeedDay })
                : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.1));

              // Статистика для паттерна выходных
              if (isWeekend) {
                weekendExcess += ratio;
                weekendCount++;
              } else {
                weekdayAvg += ratio;
                weekdayCount++;
              }
            }
          }
        }

        days.push({
          date: dateStr,
          name: dayNames[i],
          dayNumber: d.getDate(), // Число месяца (15, 16, 17...)
          status: isToday && status === 'empty' ? 'in-progress' : status, // Сегодня без данных = "в процессе"
          ratio,
          kcal: Math.round(kcal),
          isToday,
          isFuture,
          isWeekend,
          isRefeedDay, // Загрузочный день
          isStreakDay: false, // будет проставлено после расчёта streak
          isStreakEligible,
          isPerfect: ratio && rz ? rz.isPerfect(ratio) : false, // Идеальный день (0.9-1.1)
          // Градиентный цвет из ratioZones
          bgColor: ratio && rz ? rz.getGradientColor(ratio, 0.6) : null
        });
      }

      // Проставляем streak-дни (последовательность до вчера/последнего полного дня)
      const todayIndex = days.findIndex((d) => d.isToday);
      let streakStartIndex = todayIndex > 0 ? todayIndex - 1 : -1;

      if (streakStartIndex < 0) {
        for (let i = days.length - 1; i >= 0; i--) {
          if (!days[i].isFuture) {
            streakStartIndex = i;
            break;
          }
        }
      }

      if (streakStartIndex >= 0) {
        for (let i = streakStartIndex; i >= 0; i--) {
          const d = days[i];
          if (d.isFuture || d.isToday) break;
          if (!d.isStreakEligible) break;
          d.isStreakDay = true;
          streak++;
        }
      }

      const isIncompleteToday = (d) => HEYSRef.weeklyCalc?.isIncompleteToday
        ? HEYSRef.weeklyCalc.isIncompleteToday({ isToday: d.isToday, dateStr: d.date, nowDateStr, ratio: d.ratio })
        : (d.date === nowDateStr && (d.ratio === null || d.ratio < 0.5));
      const shouldIncludeDay = (d, opts) => HEYSRef.weeklyCalc?.shouldIncludeDay
        ? HEYSRef.weeklyCalc.shouldIncludeDay({ day: d, nowDateStr, ...opts })
        : (!d.isFuture && !isIncompleteToday(d));
      const inNorm = days.filter(d => d.status === 'green' || d.status === 'perfect').length;
      const withData = days.filter(d => d.status !== 'empty' && shouldIncludeDay(d, { requireKcal: true })).length;
      const todayExcluded = days.some(d => isIncompleteToday(d));

      // Средний ratio в процентах за неделю (% от нормы)
      const daysWithRatio = days.filter(d => shouldIncludeDay(d, { requireRatio: true }));
      const avgRatioPct = daysWithRatio.length > 0
        ? Math.round(daysWithRatio.reduce((sum, d) => sum + (d.ratio * 100), 0) / daysWithRatio.length)
        : 0;

      // Паттерн выходных
      let weekendPattern = null;
      if (weekendCount > 0 && weekdayCount > 0) {
        const avgWeekend = weekendExcess / weekendCount;
        const avgWeekday = weekdayAvg / weekdayCount;
        const diff = Math.round((avgWeekend - avgWeekday) * 100);
        if (Math.abs(diff) >= 10) {
          weekendPattern = diff > 0
            ? 'По выходным +' + diff + '% калорий'
            : 'По выходным ' + diff + '% калорий';
        }
      }

      // 🆕 Суммы калорий за неделю (потрачено / съедено) + средний целевой дефицит
      let totalEaten = 0;
      let totalBurned = 0;
      let totalTargetDeficit = 0;
      let daysWithDeficit = 0;

      days.forEach(d => {
        if (shouldIncludeDay(d, { requireKcal: true })) {
          totalEaten += d.kcal;
          // Для сегодняшнего дня используем актуальный safeDay, для остальных - loadDay
          const dayData = d.isToday
            ? safeDay
            : (dayUtils.loadDay
              ? dayUtils.loadDay(d.date)
              : (safeU.lsGet ? safeU.lsGet('heys_dayv2_' + d.date, null) : null));
          const tdeeInfo = dayUtils.getDayTdee
            ? dayUtils.getDayTdee(d.date, prof, { includeNDTE: true, dayData, pIndex, products: safeProducts })
            : null;
          const burned = tdeeInfo?.tdee || 0;
          const dayInfo = allActiveDays.get(d.date);
          let goalTarget = getDayOptimum(d.date, dayInfo).target || optimum;
          if (dayData?.savedDisplayOptimum > 0) {
            goalTarget = dayData.savedDisplayOptimum;
          } else if (dayData?.isRefeedDay && HEYSRef.Refeed && tdeeInfo?.optimum) {
            goalTarget = HEYSRef.Refeed.getRefeedOptimum(tdeeInfo.optimum, true);
          }

          if (burned > 0) {
            totalBurned += burned;
            const targetPctFromGoal = goalTarget > 0 ? ((goalTarget - burned) / burned) * 100 : null;
            const targetPctFromDay = HEYSRef.weeklyCalc?.resolveTargetDeficitPct
              ? HEYSRef.weeklyCalc.resolveTargetDeficitPct({
                dayData,
                tdeeInfo,
                profile: prof,
                goalTarget,
                burned
              })
              : (Number.isFinite(targetPctFromGoal) ? targetPctFromGoal : (prof?.deficitPctTarget ?? 0));
            totalTargetDeficit += Number.isFinite(targetPctFromDay) ? targetPctFromDay : 0;
            daysWithDeficit++;
          } else {
            // Fallback на норму если модуль не загружен
            totalBurned += goalTarget;
            totalTargetDeficit += prof?.deficitPctTarget || 0;
            daysWithDeficit++;
          }
        }
      });

      // Средний целевой дефицит за эти дни
      const avgTargetDeficit = daysWithDeficit > 0 ? Math.round(totalTargetDeficit / daysWithDeficit) : (prof?.deficitPctTarget || 0);

      // Debug snapshot: сравнение данных heatmap и источников (без логов)
      try {
        HEYSRef.debugData = HEYSRef.debugData || {};
        HEYSRef.debugData.weekHeatmapData = {
          date,
          nowDateStr,
          monday: fmtDate(monday),
          inNorm,
          withData,
          avgRatioPct,
          totalEaten,
          totalBurned,
          avgTargetDeficit,
          days: days.map((d) => {
            const dayInfo = allActiveDays.get(d.date);
            const computedTarget = dayInfo ? getDayOptimum(d.date, dayInfo).target : 0;
            return {
              date: d.date,
              kcal: d.kcal,
              ratio: d.ratio,
              status: d.status,
              isToday: d.isToday,
              isFuture: d.isFuture,
              isIncompleteToday: isIncompleteToday(d),
              activeKcal: dayInfo?.kcal || 0,
              activeTarget: dayInfo?.target || 0,
              computedTarget
            };
          })
        };
      } catch (e) { }

      return { days, inNorm, withData, streak, weekendPattern, avgRatioPct, totalEaten, totalBurned, avgTargetDeficit, todayExcluded };
    }, [date, optimum, pIndex, safeProducts, prof, eatenKcal, safeDay.updatedAt, safeDay.isRefeedDay]);

    // === Мини-график калорий по приёмам ===
    const mealsChartData = React.useMemo(() => {
      const meals = safeDay.meals || [];
      if (meals.length === 0) return null;

      // Сортируем по времени для графика (поздние первые — вверху списка)
      const parseTimeToMin = (t) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const sortedMeals = [...meals].sort((a, b) => parseTimeToMin(b.time) - parseTimeToMin(a.time));

      const data = sortedMeals.map((meal, mi) => {
        const totals = M && M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
        // Используем ручной тип если есть, иначе автоопределение
        const autoTypeInfo = getMealType ? getMealType(mi, meal, sortedMeals, pIndex) : { type: 'snack', name: 'Перекус', icon: '🍎' };
        const manualType = meal.mealType;
        const mealTypeInfo = manualType && safeU.MEAL_TYPES && safeU.MEAL_TYPES[manualType]
          ? { type: manualType, ...safeU.MEAL_TYPES[manualType] }
          : autoTypeInfo;
        // Вычисляем activityContext для harmMultiplier
        const mealActCtx = HEYSRef.InsulinWave?.calculateActivityContext?.({
          mealTime: meal.time,
          mealKcal: totals.kcal || 0,
          trainings: safeDay.trainings || [],
          householdMin: safeDay.householdMin || 0,
          steps: safeDay.steps || 0,
          allMeals: sortedMeals
        }) || null;
        const quality = getMealQualityScore ? getMealQualityScore(meal, mealTypeInfo.type, optimum, pIndex, mealActCtx) : null;
        return {
          name: mealTypeInfo.name,
          icon: mealTypeInfo.icon,
          type: mealTypeInfo.type,
          kcal: Math.round(totals.kcal || 0),
          time: meal.time || '',
          quality
        };
      });

      const totalKcal = data.reduce((sum, m) => sum + m.kcal, 0);
      const maxKcal = Math.max(...data.map(m => m.kcal), 1);
      const qualityStreak = (() => {
        // Ищем максимальную последовательность отличных приёмов (≥80)
        let maxStreak = 0;
        let currentStreak = 0;
        for (const m of data) {
          if (m.quality && m.quality.score >= 80) {
            currentStreak += 1;
            maxStreak = Math.max(maxStreak, currentStreak);
          } else {
            currentStreak = 0;
          }
        }
        return maxStreak;
      })();
      const avgQualityScore = data.length > 0
        ? Math.round(data.reduce((sum, m) => sum + (m.quality?.score || 0), 0) / data.length)
        : 0;

      // Лучший приём дня (max score)
      const bestMealIndex = data.reduce((best, m, i) => {
        if (!m.quality) return best;
        if (best === -1) return i;
        return m.quality.score > (data[best]?.quality?.score || 0) ? i : best;
      }, -1);

      // Сравнение с вчера
      const getYesterdayKey = () => {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return 'heys_meal_avg_' + y.toISOString().slice(0, 10);
      };
      const yesterdayAvgScore = +(localStorage.getItem(getYesterdayKey()) || 0);

      // Debug snapshot
      try {
        HEYSRef.debug = HEYSRef.debug || {};
        HEYSRef.debug.mealsChartData = { meals: data, totalKcal, maxKcal, targetKcal: optimum || 2000, qualityStreak, avgQualityScore };
        HEYSRef.debug.dayProductIndex = pIndex;
      } catch (e) { }

      return { meals: data, totalKcal, maxKcal, targetKcal: optimum || 2000, qualityStreak, avgQualityScore, bestMealIndex, yesterdayAvgScore };
    }, [safeMeals, pIndex, optimum]);

    // Сохраняем сегодняшний avg после рендера (избегаем setState во время render)
    const mealsChartAvgScore = mealsChartData?.avgQualityScore || 0;
    React.useEffect(() => {
      if (mealsChartAvgScore <= 0) return;
      const todayKey = 'heys_meal_avg_' + new Date().toISOString().slice(0, 10);
      const currentSaved = +(localStorage.getItem(todayKey) || 0);
      if (currentSaved !== mealsChartAvgScore) {
        localStorage.setItem(todayKey, String(mealsChartAvgScore));
      }
    }, [mealsChartAvgScore]);

    return {
      kcalTrend,
      balanceViz,
      weekHeatmapData,
      mealsChartData
    };
  };
})(window);


/* ===== heys_day_insulin_wave_data_v1.js ===== */
// heys_day_insulin_wave_data_v1.js — insulin wave data computation for DayTab
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayInsulinWaveData = HEYS.dayInsulinWaveData || {};

  HEYS.dayInsulinWaveData.computeInsulinWaveData = function computeInsulinWaveData(ctx) {
    const {
      React,
      day,
      pIndex,
      getProductFromItem,
      getProfile,
      lsGet,
      currentMinute,
      HEYS: heysGlobal
    } = ctx || {};

    if (!React) return null;

    const HEYSRef = heysGlobal || global.HEYS || {};
    const safeDay = day || {};

    // Версионный счётчик: увеличивается когда InsulinWave-модуль загружается
    // (postboot-1-game грузится позже boot-бандлов — нужен re-render при готовности модуля)
    const [iwVersion, setIwVersion] = React.useState(() => HEYSRef.InsulinWave?.calculate ? 1 : 0);
    React.useEffect(function () {
      if (HEYSRef.InsulinWave?.calculate) return; // уже загружен
      function onIWReady() {
        setIwVersion(function (v) { return v + 1; });
        console.info('[HEYS.dayInsulinWaveData] ✅ InsulinWave ready, re-computing wave data');
      }
      document.addEventListener('heys-insulinwave-ready', onIWReady, { once: true });
      return function () { document.removeEventListener('heys-insulinwave-ready', onIWReady); };
    }, []);

    return React.useMemo(() => {
      const prof = typeof getProfile === 'function' ? getProfile() : (HEYSRef.utils?.lsGet?.('heys_profile', {}) || {});
      const baseWaveHours = prof?.insulinWaveHours || 3;

      // Используем модуль HEYS.InsulinWave если доступен
      if (HEYSRef.InsulinWave && HEYSRef.InsulinWave.calculate) {
        const result = HEYSRef.InsulinWave.calculate({
          meals: safeDay.meals,
          pIndex,
          getProductFromItem,
          baseWaveHours,
          trainings: safeDay.trainings || [], // 🏃 Передаём тренировки для workout acceleration
          // 🆕 v1.4: Данные дня для stress и sleep факторов
          // 🆕 v3.0.0: Добавлен profile для персональной базы волны
          dayData: {
            sleepHours: safeDay.sleepHours || null,  // часы сна предыдущей ночи
            sleepQuality: safeDay.sleepQuality || null, // качество сна (1-10)
            stressAvg: safeDay.stressAvg || 0,        // средний стресс за день (1-5)
            waterMl: safeDay.waterMl || 0,            // выпито воды (мл)
            householdMin: safeDay.householdMin || 0,  // бытовая активность
            steps: safeDay.steps || 0,                // шаги
            cycleDay: safeDay.cycleDay || null,       // день цикла
            // 🆕 v3.0.0: Профиль для персональной базы
            profile: {
              age: prof?.age || 0,
              weight: prof?.weight || 0,
              height: prof?.height || 0,
              gender: prof?.gender || ''
            },
            // 🆕 v3.6.0: Для расчёта NDTE (эффект вчерашней тренировки)
            date: safeDay.date,
            lsGet
          }
        });
        return result;
      }

      // Fallback если модуль не загружен
      const meals = safeDay.meals || [];
      if (meals.length === 0) return null;

      const mealsWithTime = meals.filter(m => m.time);
      if (mealsWithTime.length === 0) return null;

      const sorted = [...mealsWithTime].sort((a, b) => {
        const timeA = (a.time || '').replace(':', '');
        const timeB = (b.time || '').replace(':', '');
        return timeB.localeCompare(timeA);
      });
      const lastMeal = sorted[0];
      const lastMealTime = lastMeal?.time;
      if (!lastMealTime) return null;

      // Простой расчёт без модуля
      let avgGI = 50, totalGrams = 0, weightedGI = 0;
      for (const item of (lastMeal.items || [])) {
        const grams = item.grams || 100;
        const prod = getProductFromItem ? getProductFromItem(item, pIndex) : null;
        const gi = prod?.gi || prod?.gi100 || 50;
        weightedGI += gi * grams;
        totalGrams += grams;
      }
      if (totalGrams > 0) avgGI = Math.round(weightedGI / totalGrams);

      let giMultiplier = avgGI <= 35 ? 1.2 : avgGI <= 55 ? 1.0 : avgGI <= 70 ? 0.85 : 0.7;
      const giCategory = avgGI <= 35 ? 'low' : avgGI <= 55 ? 'medium' : avgGI <= 70 ? 'high' : 'very-high';

      const waveMinutes = baseWaveHours * giMultiplier * 60;
      const [mealH, mealM] = lastMealTime.split(':').map(Number);
      if (isNaN(mealH)) return null;

      const mealMinutes = mealH * 60 + (mealM || 0);
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      let diffMinutes = Math.max(0, nowMinutes - mealMinutes);

      const remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
      const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);

      const endMinutes = mealMinutes + Math.round(waveMinutes);
      const endTime = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0') + ':' + String(endMinutes % 60).padStart(2, '0');

      const isNightTime = now.getHours() >= 22 || now.getHours() < 6;
      let status, emoji, text, color, subtext;

      if (remainingMinutes <= 0) {
        status = 'lipolysis'; emoji = '🔥'; text = 'Липолиз!'; color = '#22c55e';
        subtext = isNightTime ? '🌙 Идеально! Ночной липолиз до утра' : '💪 Жиросжигание идёт! Продержись подольше';
      } else if (remainingMinutes <= 15) {
        status = 'almost'; emoji = '⏳'; text = Math.ceil(remainingMinutes) + ' мин'; color = '#f97316';
        subtext = '⏳ Скоро начнётся липолиз!';
      } else if (remainingMinutes <= 30) {
        status = 'soon'; emoji = '🌊'; text = Math.ceil(remainingMinutes) + ' мин'; color = '#eab308';
        subtext = '🍵 Вода не прерывает липолиз';
      } else {
        const h = Math.floor(remainingMinutes / 60), m = Math.round(remainingMinutes % 60);
        status = 'active'; emoji = '📈'; text = h > 0 ? h + 'ч ' + m + 'м' : m + ' мин'; color = '#3b82f6';
        subtext = '📈 Инсулин высокий, жир запасается';
      }

      return {
        status, emoji, text, color, subtext, progress: progressPct, remaining: remainingMinutes,
        lastMealTime, lastMealTimeDisplay: lastMealTime, endTime, insulinWaveHours: baseWaveHours * giMultiplier, baseWaveHours, isNightTime,
        avgGI, giCategory: { color: giMultiplier === 1.2 ? '#22c55e' : giMultiplier === 1.0 ? '#eab308' : giMultiplier === 0.85 ? '#f97316' : '#ef4444', text: giCategory }, giMultiplier,
        waveHistory: [], overlaps: [], hasOverlaps: false, gapQuality: 'unknown'
      };
    }, [safeDay.meals, safeDay.trainings, safeDay.sleepHours, safeDay.sleepQuality, safeDay.stressAvg, safeDay.waterMl, safeDay.householdMin, safeDay.steps, safeDay.cycleDay, safeDay.date, pIndex, getProductFromItem, currentMinute, iwVersion]);
  };
})(window);


/* ===== heys_day_goal_progress_v1.js ===== */
// heys_day_goal_progress_v1.js — Goal progress bar renderer
; (function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function renderGoalProgressBar(params) {
    const {
      React,
      day,
      displayOptimum,
      optimum,
      eatenKcal,
      animatedKcal,
      animatedProgress,
      animatedRatioPct,
      animatedMarkerPos,
      isAnimating,
      caloricDebt,
      setDay,
      r0,
      HEYS: HEYS_GLOBAL
    } = params || {};

    const HEYS_LOCAL = HEYS_GLOBAL || HEYS;
    const Refeed = HEYS_LOCAL?.Refeed;
    const ratio = (eatenKcal || 0) / (displayOptimum || optimum || 1);
    const r0Safe = r0 || ((v) => Math.round(v || 0));

    // === ДИНАМИЧЕСКИЙ ГРАДИЕНТ ПО ВСЕЙ ПОЛОСЕ ===
    // Зоны: 0-80% жёлтый → 80-100% зелёный → 100-105% зелёный → 105-110% жёлтый → 110%+ красный

    const buildDynamicGradient = (currentRatio) => {
      if (currentRatio <= 0) return '#e5e7eb';

      const yellow = '#eab308';
      const yellowLight = '#fbbf24';
      const green = '#22c55e';
      const greenDark = '#16a34a';
      const red = '#ef4444';
      const redDark = '#dc2626';

      // Ключевые точки (в % от нормы)
      const zone80 = 0.80;
      const zone100 = 1.0;
      const zone105 = 1.05;
      const zone110 = 1.10;

      // Преобразуем точки зон в % от текущего заполнения
      const toFillPct = (zoneRatio) => Math.min((zoneRatio / currentRatio) * 100, 100);

      if (currentRatio <= zone80) {
        // Весь бар жёлтый (недобор)
        return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} 100%)`;
      } else if (currentRatio <= zone100) {
        // 0→80% жёлтый, 80%→100% зелёный
        const p80 = toFillPct(zone80);
        return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 5}%, ${green} ${p80 + 5}%, ${greenDark} 100%)`;
      } else if (currentRatio <= zone105) {
        // 0→80% жёлтый, 80%→105% зелёный (всё ОК)
        const p80 = toFillPct(zone80);
        return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 3}%, ${green} ${p80 + 3}%, ${greenDark} 100%)`;
      } else if (currentRatio <= zone110) {
        // 0→80% жёлтый, 80%→105% зелёный, 105%→110% жёлтый
        const p80 = toFillPct(zone80);
        const p105 = toFillPct(zone105);
        return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 3}%, ${green} ${p80 + 3}%, ${green} ${p105 - 3}%, ${yellow} ${p105 + 3}%, ${yellow} 100%)`;
      } else {
        // > 110%: жёлтый → зелёный → жёлтый → красный
        const p80 = toFillPct(zone80);
        const p105 = toFillPct(zone105);
        const p110 = toFillPct(zone110);
        return `linear-gradient(90deg, ${yellowLight} 0%, ${yellow} ${p80 - 2}%, ${green} ${p80 + 2}%, ${green} ${p105 - 2}%, ${yellow} ${p105 + 2}%, ${yellow} ${p110 - 2}%, ${red} ${p110 + 2}%, ${redDark} 100%)`;
      }
    };

    const fillGradient = buildDynamicGradient(ratio);

    // Цвет части ПОСЛЕ НОРМЫ (goal-progress-over) — зависит от степени превышения
    let overColor, overGradient;
    if (ratio <= 1.05) {
      // 100-105% — зелёный (всё ОК)
      overColor = '#22c55e';
      overGradient = 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)';
    } else if (ratio <= 1.10) {
      // 105-110% — жёлтый (лёгкий перебор)
      overColor = '#eab308';
      overGradient = 'linear-gradient(90deg, #fbbf24 0%, #eab308 100%)';
    } else {
      // > 110% — красный (перебор)
      overColor = '#ef4444';
      overGradient = 'linear-gradient(90deg, #f87171 0%, #dc2626 100%)';
    }

    // Цвет заголовка — общий статус дня
    let titleColor, titleIcon, titleText;

    // === REFEED DAY — особый статус ===
    if (day.isRefeedDay && Refeed) {
      const refeedZone = Refeed.getRefeedZone(ratio, true);
      if (refeedZone) {
        titleColor = refeedZone.color;
        titleIcon = refeedZone.icon;
        titleText = refeedZone.name;
      }
    } else if (ratio < 0.80) {
      titleColor = '#eab308';
      titleIcon = '📉';
      titleText = 'Маловато';
    } else if (ratio <= 1.0) {
      titleColor = '#22c55e';
      titleIcon = '🎯';
      titleText = 'До цели';
    } else if (ratio <= 1.05) {
      titleColor = '#22c55e';
      titleIcon = '✅';
      titleText = 'Отлично';
    } else if (ratio <= 1.10) {
      titleColor = '#eab308';
      titleIcon = '⚠️';
      titleText = 'Чуть больше';
    } else {
      titleColor = '#ef4444';
      titleIcon = '🚨';
      titleText = 'Перебор';
    }

    return React.createElement('div', { className: 'goal-progress-card' },
      React.createElement('div', {
        className: 'goal-progress-bar' + (ratio >= 0.9 && ratio <= 1.1 ? ' pulse-perfect' : ratio > 1.25 ? ' shake-excess' : '')
      },
        React.createElement('div', { className: 'goal-progress-header' },
          React.createElement('span', {
            className: 'goal-progress-title',
            style: { color: titleColor }
          }, titleIcon + ' ' + titleText),
          React.createElement('span', { className: 'goal-progress-stats' },
            React.createElement('span', { className: 'goal-eaten-wrap' },
              React.createElement('span', {
                className: 'goal-eaten',
                style: { color: titleColor }
              }, r0Safe(animatedKcal)),
              React.createElement('span', { className: 'goal-eaten-label' }, 'съедено')
            ),
            React.createElement('span', { className: 'goal-divider' }, '/'),
            React.createElement('span', { className: 'goal-target-wrap' },
              React.createElement('span', { className: 'goal-target' }, displayOptimum),
              React.createElement('span', { className: 'goal-target-label' }, 'цель')
            ),
            displayOptimum > optimum && React.createElement('span', { className: 'goal-bonus-wrap' },
              React.createElement('span', { className: 'goal-bonus-center' },
                React.createElement('span', { className: 'goal-bonus-value' }, '+' + (displayOptimum - optimum)),
                React.createElement('span', { className: 'goal-bonus-label' }, 'долг')
              ),
              React.createElement('span', {
                className: 'goal-bonus-info',
                title: 'Бонус от калорийного долга: норма повышена, чтобы мягко компенсировать недоедание за последние дни',
                onClick: (e) => {
                  e.stopPropagation();
                  const msg = 'Бонус от калорийного долга: норма повышена, чтобы мягко компенсировать недоедание за последние дни';
                  HEYS_LOCAL?.Toast?.info?.(msg, { title: 'ℹ️ Подсказка', duration: 4000 });
                }
              }, 'i')
            )
          )
        ),
        React.createElement('div', { className: 'goal-progress-track' + (eatenKcal > displayOptimum ? ' has-over' : '') + (displayOptimum > optimum ? ' has-debt' : '') + (day.isRefeedDay ? ' has-refeed' : '') },
          // Контейнер для самого прогресс-бара
          React.createElement('div', { className: 'goal-progress-track-inner' },
            // Clip wrapper — clips fill/markers to rounded track shape; badge stays outside
            React.createElement('div', { className: 'goal-progress-bar-clip' },
              // Бонусная зона калорийного долга (справа от 100%, показывает расширенную зелёную зону)
              // Позиционируется от 100% до 100% + bonus% (где bonus = (displayOptimum - optimum) / optimum)
              displayOptimum > optimum && eatenKcal <= optimum && React.createElement('div', {
                className: 'goal-bonus-zone',
                style: {
                  // Бонусная зона начинается с правого края (100%) и расширяется вправо
                  // Но мы не можем показать >100%, поэтому показываем масштабированно:
                  // Если displayOptimum = 1.17 * optimum, то зона занимает последние 14.5% бара
                  // Формула: left = optimum / displayOptimum, width = (displayOptimum - optimum) / displayOptimum
                  left: (optimum / displayOptimum * 100) + '%',
                  width: ((displayOptimum - optimum) / displayOptimum * 100) + '%'
                },
                title: '💰 Бонусная зона: +' + (displayOptimum - optimum) + ' ккал из калорийного долга'
              }),
              // Маркер базовой нормы (пунктир) если есть долг и не переедание
              displayOptimum > optimum && eatenKcal <= displayOptimum && React.createElement('div', {
                className: 'goal-base-marker',
                style: { left: (optimum / displayOptimum * 100) + '%' },
                title: 'Базовая норма: ' + optimum + ' ккал'
              }),
              React.createElement('div', {
                className: 'goal-progress-fill' + (isAnimating ? ' no-transition' : ''),
                style: {
                  // В debt-режиме: animatedProgress (0→eatenKcal/optimum*100) масштабируем на optimum/displayOptimum
                  // → итог: 0→eatenKcal/displayOptimum*100, синхронизировано с бейджем
                  width: displayOptimum > optimum
                    ? Math.min(animatedProgress * (optimum / displayOptimum), 100) + '%'
                    : Math.min(animatedProgress, 100) + '%',
                  background: fillGradient
                }
              }),
              // Красная часть перебора (только если съели больше displayOptimum)
              eatenKcal > displayOptimum && React.createElement('div', {
                className: 'goal-progress-over',
                style: {
                  left: (displayOptimum / eatenKcal * 100) + '%',
                  width: ((eatenKcal - displayOptimum) / eatenKcal * 100) + '%',
                  background: overGradient
                }
              }),
              React.createElement('div', {
                className: 'goal-marker' + (eatenKcal > displayOptimum ? ' over' : ''),
                style: eatenKcal > displayOptimum ? { left: (displayOptimum / eatenKcal * 100) + '%' } : {}
              }),
              // Показываем остаток калорий на пустой части полосы ИЛИ внутри бара когда мало места ИЛИ перебор
              (() => {
                // Используем displayOptimum для debt-aware расчётов
                const effectiveTarget = displayOptimum || optimum;

                if (eatenKcal > effectiveTarget) {
                  // Перебор — показываем слева от маркера (перед чёрной линией)
                  const overKcal = Math.round(eatenKcal - effectiveTarget);
                  const markerPos = (effectiveTarget / eatenKcal * 100); // позиция маркера в %
                  return React.createElement('div', {
                    className: 'goal-remaining-inside goal-over-inside pulse-glow',
                    style: {
                      position: 'absolute',
                      right: (100 - markerPos + 2) + '%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '3px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.95)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      zIndex: 10
                    }
                  },
                    React.createElement('span', { style: { fontSize: '10px', fontWeight: '500', color: '#dc2626' } }, 'Перебор'),
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '800', color: '#dc2626' } }, '+' + overKcal)
                  );
                }

                if (eatenKcal >= effectiveTarget) return null;

                // Округляем остаток (от displayOptimum)
                const effectiveRemaining = Math.round(effectiveTarget - eatenKcal);

                // Цвет зависит от того сколько осталось: много = зелёный, мало = красный, средне = жёлтый
                const effectiveRatio = eatenKcal / effectiveTarget;
                const remainingRatio = 1 - effectiveRatio; // 1 = много осталось, 0 = мало
                let remainingColor;
                if (remainingRatio > 0.5) {
                  remainingColor = '#16a34a';
                } else if (remainingRatio > 0.2) {
                  remainingColor = '#ca8a04';
                } else {
                  remainingColor = '#dc2626';
                }

                // Когда прогресс > 80%, перемещаем внутрь бара
                const effectiveProgress = displayOptimum > optimum
                  ? (eatenKcal / effectiveTarget * 100)
                  : animatedProgress;
                const isInsideBar = effectiveProgress >= 80;

                if (isInsideBar) {
                  // Внутри заполненной части — справа, с пульсацией
                  return React.createElement('div', {
                    className: 'goal-remaining-inside pulse-glow',
                    style: {
                      position: 'absolute',
                      right: (100 - Math.min(effectiveProgress, 100) + 2) + '%',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '3px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.95)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      zIndex: 10
                    }
                  },
                    React.createElement('span', { style: { fontSize: '10px', fontWeight: '500', color: '#6b7280' } }, 'Осталось всего'),
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '800', color: remainingColor } }, effectiveRemaining)
                  );
                } else {
                  // На пустой части полосы
                  return React.createElement('div', {
                    className: 'goal-remaining-inline',
                    style: {
                      position: 'absolute',
                      left: Math.max(effectiveProgress + 2, 5) + '%',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      fontSize: '14px',
                      fontWeight: '700',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }
                  },
                    React.createElement('span', { style: { fontSize: '12px', fontWeight: '500', color: '#6b7280' } }, 'Ещё'),
                    React.createElement('span', { style: { fontSize: '15px', fontWeight: '800', color: remainingColor } }, effectiveRemaining)
                  );
                }
              })()
            ), // close goal-progress-bar-clip
            // Маркер текущего % — снаружи clip wrapper, не обрезается
            React.createElement('div', {
              className: 'goal-current-marker' + (isAnimating ? ' no-transition' : ''),
              style: {
                // В debt-режиме: позиция = animatedMarkerPos * (optimum/displayOptimum)
                // → синхронизировано с шириной заливки, анимируется вместе
                left: displayOptimum > optimum
                  ? Math.min(animatedMarkerPos * (optimum / displayOptimum), 100) + '%'
                  : animatedMarkerPos + '%'
              }
            },
              React.createElement('span', { className: 'goal-current-pct' },
                // В debt-режиме: текст тоже анимируется (показывает % от displayOptimum)
                displayOptimum > optimum
                  ? Math.round(animatedMarkerPos * (optimum / displayOptimum)) + '%'
                  : animatedRatioPct + '%'
              )
            )
          ),
          // Refeed Toggle — справа от прогресс-бара
          Refeed && React.createElement('div', {
            className: 'goal-refeed-toggle-wrapper',
            style: {
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          },
            Refeed.renderRefeedToggle({
              isRefeedDay: day.isRefeedDay,
              refeedReason: day.refeedReason,
              caloricDebt: caloricDebt,
              optimum: optimum,
              onToggle: (isActive, reason) => {
                setDay(prev => ({
                  ...prev,
                  isRefeedDay: isActive ? true : false,
                  refeedReason: isActive ? reason : null,
                  updatedAt: Date.now()
                }));
              }
            }),
            React.createElement('div', {
              style: {
                position: 'absolute',
                top: '100%',
                marginTop: '4px',
                fontSize: '10px',
                lineHeight: '12px',
                color: '#94a3b8',
                textAlign: 'center',
                whiteSpace: 'nowrap'
              }
            }, day.isRefeedDay ? 'рефид включен' : 'рефид')
          )
        ),
        // Метки зон под полосой (убрано по запросу)
      )
    );
  }

  HEYS.dayGoalProgress = {
    renderGoalProgressBar
  };
})(window);


/* ===== heys_day_daily_summary_v1.js ===== */
// heys_day_daily_summary_v1.js — Daily summary table renderer
;(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  function renderDailySummary(params) {
    const {
      React,
      dayTot,
      normAbs,
      fmtVal,
      pct,
      getDailyNutrientColor,
      getDailyNutrientTooltip
    } = params || {};

    if (!React) return null;

    const factKeys = ['kcal','carbs','simple','complex','prot','fat','bad','good','trans','fiber','gi','harm'];

    function devCell(k){
      const n=+normAbs[k]||0; if(!n) return React.createElement('td',{key:'ds-dv'+k},'-');
      const f=+dayTot[k]||0; const d=((f-n)/n)*100; const diff=Math.round(d);
      const color= diff>0?'#dc2626':(diff<0?'#059669':'#111827'); const fw=diff!==0?600:400;
      return React.createElement('td',{key:'ds-dv'+k,style:{color,fontWeight:fw}},(diff>0?'+':'')+diff+'%');
    }

    function factCell(k){
      const f=+dayTot[k]||0; const n=+normAbs[k]||0; if(!n) return React.createElement('td',{key:'ds-fv'+k},fmtVal(k,f));
      const over=f>n, under=f<n; let color=null; let fw=600;
      if(['bad','trans'].includes(k)){ if(under) color='#059669'; else if(over) color='#dc2626'; else fw=400; }
      else if(k==='simple'){ if(under) color='#059669'; else if(over) color='#dc2626'; else fw=400; }
      else if(k==='complex'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='fiber'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='kcal'){ if(over) color='#dc2626'; else fw=400; }
      else if(k==='prot'){ if(over) color='#059669'; else fw=400; }
      else if(k==='carbs' || k==='fat'){ if(over) color='#dc2626'; else fw=400; }
      else if(k==='good'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='gi' || k==='harm'){ if(over) color='#dc2626'; else if(under) color='#059669'; else fw=400; }
      else { fw=400; }
      const style=color?{color,fontWeight:fw}:{fontWeight:fw};
      return React.createElement('td',{key:'ds-fv'+k,style},fmtVal(k,f));
    }

    function normVal(k){ const n=+normAbs[k]||0; return n?fmtVal(k,n):'-'; }

    const per100Head = ['','','','','','','','','','']; // 10 per100 columns blank (соответствует таблице приёма)
    const factHead = ['ккал','У','Прост','Сл','Б','Ж','ВрЖ','ПолЖ','СупЖ','Клет','ГИ','Вред','']; // последний пустой (кнопка)

    return React.createElement('div',{className:'card tone-slate',style:{marginTop:'8px',overflowX:'auto'}},
      React.createElement('div',{className:'section-title',style:{marginBottom:'4px'}},'СУТОЧНЫЕ ИТОГИ'),
      React.createElement('table',{className:'tbl meals-table daily-summary'},
        React.createElement('thead',null,React.createElement('tr',null,
          React.createElement('th',null,''),
          React.createElement('th',null,''),
          per100Head.map((h,i)=>React.createElement('th',{key:'ds-ph'+i,className:'per100-col'},h)),
          factHead.map((h,i)=>React.createElement('th',{key:'ds-fh'+i},h))
        )),
        React.createElement('tbody',null,
          // Факт
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-pvL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Факт'},'Ф'):React.createElement('td',{key:'ds-pv'+i},'')),
            factKeys.map(k=>factCell(k)),
            React.createElement('td',null,'')
          ),
          // Норма
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-npL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Норма'},'Н'):React.createElement('td',{key:'ds-np'+i},'')),
            factKeys.map(k=>React.createElement('td',{key:'ds-nv'+k},normVal(k))),
            React.createElement('td',null,'')
          ),
          // Откл
          React.createElement('tr',{className:'daily-dev-row'},
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-dpL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Отклонение'},'Δ'):React.createElement('td',{key:'ds-dp'+i},'')),
            factKeys.map(k=>devCell(k)),
            React.createElement('td',null,'')
          )
        )
      ),
      // MOBILE: compact daily summary with column headers
      React.createElement('div', { className: 'mobile-daily-summary' },
        // Header row
        React.createElement('div', { className: 'mds-header' },
          React.createElement('span', { className: 'mds-label' }, ''),
          React.createElement('span', null, 'ккал'),
          React.createElement('span', null, 'У'),
          React.createElement('span', { className: 'mds-dim' }, 'пр/сл'),
          React.createElement('span', null, 'Б'),
          React.createElement('span', null, 'Ж'),
          React.createElement('span', { className: 'mds-dim' }, 'вр/пол/суп'),
          React.createElement('span', null, 'Кл'),
          React.createElement('span', null, 'ГИ'),
          React.createElement('span', null, 'Вр')
        ),
        // Fact row - с цветовой индикацией относительно нормы
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label', title: 'Факт' }, 'Ф'),
          React.createElement('span', { title: getDailyNutrientTooltip('kcal', dayTot.kcal, normAbs.kcal), style: { color: getDailyNutrientColor('kcal', dayTot.kcal, normAbs.kcal), fontWeight: getDailyNutrientColor('kcal', dayTot.kcal, normAbs.kcal) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.kcal)),
          React.createElement('span', { title: getDailyNutrientTooltip('carbs', dayTot.carbs, normAbs.carbs), style: { color: getDailyNutrientColor('carbs', dayTot.carbs, normAbs.carbs), fontWeight: getDailyNutrientColor('carbs', dayTot.carbs, normAbs.carbs) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.carbs)),
          React.createElement('span', { className: 'mds-dim' },
            React.createElement('span', { title: getDailyNutrientTooltip('simple', dayTot.simple, normAbs.simple), style: { color: getDailyNutrientColor('simple', dayTot.simple, normAbs.simple), fontWeight: getDailyNutrientColor('simple', dayTot.simple, normAbs.simple) ? 600 : 400, cursor: 'help' } }, pct(dayTot.simple, dayTot.carbs)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('complex', dayTot.complex, normAbs.complex), style: { color: getDailyNutrientColor('complex', dayTot.complex, normAbs.complex), cursor: 'help' } }, pct(dayTot.complex, dayTot.carbs))
          ),
          React.createElement('span', { title: getDailyNutrientTooltip('prot', dayTot.prot, normAbs.prot), style: { color: getDailyNutrientColor('prot', dayTot.prot, normAbs.prot), fontWeight: getDailyNutrientColor('prot', dayTot.prot, normAbs.prot) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.prot)),
          React.createElement('span', { title: getDailyNutrientTooltip('fat', dayTot.fat, normAbs.fat), style: { color: getDailyNutrientColor('fat', dayTot.fat, normAbs.fat), fontWeight: getDailyNutrientColor('fat', dayTot.fat, normAbs.fat) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.fat)),
          React.createElement('span', { className: 'mds-dim' },
            React.createElement('span', { title: getDailyNutrientTooltip('bad', dayTot.bad, normAbs.bad), style: { color: getDailyNutrientColor('bad', dayTot.bad, normAbs.bad), fontWeight: getDailyNutrientColor('bad', dayTot.bad, normAbs.bad) ? 600 : 400, cursor: 'help' } }, pct(dayTot.bad, dayTot.fat)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('good', dayTot.good, normAbs.good), style: { color: getDailyNutrientColor('good', dayTot.good, normAbs.good), fontWeight: getDailyNutrientColor('good', dayTot.good, normAbs.good) ? 600 : 400, cursor: 'help' } }, pct(dayTot.good, dayTot.fat)),
            '/',
            React.createElement('span', { title: getDailyNutrientTooltip('trans', dayTot.trans, normAbs.trans), style: { color: getDailyNutrientColor('trans', dayTot.trans, normAbs.trans), fontWeight: getDailyNutrientColor('trans', dayTot.trans, normAbs.trans) ? 600 : 400, cursor: 'help' } }, pct(dayTot.trans || 0, dayTot.fat))
          ),
          React.createElement('span', { title: getDailyNutrientTooltip('fiber', dayTot.fiber, normAbs.fiber), style: { color: getDailyNutrientColor('fiber', dayTot.fiber, normAbs.fiber), fontWeight: getDailyNutrientColor('fiber', dayTot.fiber, normAbs.fiber) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.fiber)),
          React.createElement('span', { title: getDailyNutrientTooltip('gi', dayTot.gi, normAbs.gi), style: { color: getDailyNutrientColor('gi', dayTot.gi, normAbs.gi), fontWeight: getDailyNutrientColor('gi', dayTot.gi, normAbs.gi) ? 600 : 400, cursor: 'help' } }, Math.round(dayTot.gi || 0)),
          React.createElement('span', { title: getDailyNutrientTooltip('harm', dayTot.harm, normAbs.harm), style: { color: getDailyNutrientColor('harm', dayTot.harm, normAbs.harm), fontWeight: getDailyNutrientColor('harm', dayTot.harm, normAbs.harm) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', dayTot.harm || 0))
        ),
        // Norm row
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label', title: 'Норма' }, 'Н'),
          React.createElement('span', null, Math.round(normAbs.kcal || 0)),
          React.createElement('span', null, Math.round(normAbs.carbs || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.simple || 0, normAbs.carbs || 1) + '/' + pct(normAbs.complex || 0, normAbs.carbs || 1)),
          React.createElement('span', null, Math.round(normAbs.prot || 0)),
          React.createElement('span', null, Math.round(normAbs.fat || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.bad || 0, normAbs.fat || 1) + '/' + pct(normAbs.good || 0, normAbs.fat || 1) + '/' + pct(normAbs.trans || 0, normAbs.fat || 1)),
          React.createElement('span', null, Math.round(normAbs.fiber || 0)),
          React.createElement('span', null, Math.round(normAbs.gi || 0)),
          React.createElement('span', null, fmtVal('harm', normAbs.harm || 0))
        ),
        // Deviation row - custom layout matching header columns
        React.createElement('div', { className: 'mds-row mds-dev' },
          React.createElement('span', { className: 'mds-label', title: 'Отклонение' }, 'Δ'),
          // kcal
          (() => { const n = normAbs.kcal || 0, f = dayTot.kcal || 0; if (!n) return React.createElement('span', { key: 'dev-kcal' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-kcal', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // carbs
          (() => { const n = normAbs.carbs || 0, f = dayTot.carbs || 0; if (!n) return React.createElement('span', { key: 'dev-carbs' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-carbs', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // simple/complex (combined)
          (() => {
            const ns = normAbs.simple || 0, fs = dayTot.simple || 0;
            const nc = normAbs.complex || 0, fc = dayTot.complex || 0;
            const ds = ns ? Math.round(((fs - ns) / ns) * 100) : 0;
            const dc = nc ? Math.round(((fc - nc) / nc) * 100) : 0;
            const cs = ds > 0 ? '#dc2626' : ds < 0 ? '#059669' : '#6b7280';
            const cc = dc > 0 ? '#dc2626' : dc < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-sc', className: 'mds-dim' },
              React.createElement('span', { style: { color: cs } }, (ds > 0 ? '+' : '') + ds),
              '/',
              React.createElement('span', { style: { color: cc } }, (dc > 0 ? '+' : '') + dc)
            );
          })(),
          // prot
          (() => { const n = normAbs.prot || 0, f = dayTot.prot || 0; if (!n) return React.createElement('span', { key: 'dev-prot' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-prot', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // fat
          (() => { const n = normAbs.fat || 0, f = dayTot.fat || 0; if (!n) return React.createElement('span', { key: 'dev-fat' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fat', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // bad/good/trans (combined)
          (() => {
            const nb = normAbs.bad || 0, fb = dayTot.bad || 0;
            const ng = normAbs.good || 0, fg = dayTot.good || 0;
            const nt = normAbs.trans || 0, ft = dayTot.trans || 0;
            const db = nb ? Math.round(((fb - nb) / nb) * 100) : 0;
            const dg = ng ? Math.round(((fg - ng) / ng) * 100) : 0;
            const dt = nt ? Math.round(((ft - nt) / nt) * 100) : 0;
            const cb = db > 0 ? '#dc2626' : db < 0 ? '#059669' : '#6b7280';
            const cg = dg > 0 ? '#dc2626' : dg < 0 ? '#059669' : '#6b7280';
            const ct = dt > 0 ? '#dc2626' : dt < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-bgt', className: 'mds-dim' },
              React.createElement('span', { style: { color: cb } }, (db > 0 ? '+' : '') + db),
              '/',
              React.createElement('span', { style: { color: cg } }, (dg > 0 ? '+' : '') + dg),
              '/',
              React.createElement('span', { style: { color: ct } }, (dt > 0 ? '+' : '') + dt)
            );
          })(),
          // fiber
          (() => { const n = normAbs.fiber || 0, f = dayTot.fiber || 0; if (!n) return React.createElement('span', { key: 'dev-fiber' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fiber', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // gi
          (() => { const n = normAbs.gi || 0, f = dayTot.gi || 0; if (!n) return React.createElement('span', { key: 'dev-gi' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-gi', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // harm
          (() => { const n = normAbs.harm || 0, f = dayTot.harm || 0; if (!n) return React.createElement('span', { key: 'dev-harm' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-harm', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })()
        )
      )
    );
  }

  HEYS.dayDailySummary = {
    renderDailySummary
  };
})(window);


/* ===== heys_day_pull_refresh_v1.js ===== */
// heys_day_pull_refresh_v1.js — pull-to-refresh logic
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.usePullToRefresh = function usePullToRefresh({ React, date, lsGet, lsSet, HEYS }) {
    const { useState, useEffect, useRef } = React;
    const heys = HEYS || window.HEYS || {};

    // === Pull-to-refresh (Enhanced) ===
    const [pullProgress, setPullProgress] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('idle'); // idle | pulling | ready | syncing | success | error
    const pullStartY = useRef(0);
    const isPulling = useRef(false);
    const lastHapticRef = useRef(0);
    // 🔧 FIX: Use refs to avoid stale closures in event handlers
    const isRefreshingRef = useRef(false);
    const refreshStatusRef = useRef('idle');
    const pullProgressRef = useRef(0);

    // Keep refs in sync with state
    useEffect(() => {
      isRefreshingRef.current = isRefreshing;
    }, [isRefreshing]);
    useEffect(() => {
      refreshStatusRef.current = refreshStatus;
    }, [refreshStatus]);
    useEffect(() => {
      pullProgressRef.current = pullProgress;
    }, [pullProgress]);

    // === Pull-to-refresh логика (Enhanced) ===
    const PULL_THRESHOLD = 80;

    // Haptic feedback helper
    const triggerHaptic = (intensity = 10) => {
      const now = Date.now();
      if (now - lastHapticRef.current > 50 && navigator.vibrate) {
        navigator.vibrate(intensity);
        lastHapticRef.current = now;
      }
    };

    // ✅ Pull-to-refresh: sync из cloud (БЕЗ reload!)
    // Подтягивает изменения куратора, UI обновляется через события heys:day-updated
    const handleRefresh = async () => {
      setIsRefreshing(true);
      setRefreshStatus('syncing');
      triggerHaptic(15);

      const cloud = heys && heys.cloud;
      const U = heys && heys.utils;
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';

      try {
        // 1. Тихая проверка SW (без блокировки)
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then(reg => reg.update?.()).catch(() => { });
        }

        // 2. КРИТИЧНО: Flush pending данных в cloud ПЕРЕД загрузкой!
        // Используем публичное API getPendingCount() вместо приватной _clientUpsertQueue
        if (cloud?.flushPendingQueue && cloud?.getPendingCount) {
          const pendingCount = cloud.getPendingCount();
          if (pendingCount > 0) {
            console.info('[PullRefresh] ⏳ Flushing', pendingCount, 'pending items...');
            // 🔧 FIX: Увеличиваем таймаут до 5 сек и ЖДЁМ завершения
            const flushed = await cloud.flushPendingQueue(5000);
            if (flushed) {
              console.info('[PullRefresh] ✅ Flush completed');
            } else {
              console.warn('[PullRefresh] ⚠️ Flush timeout, continuing...');
            }
            // Даём серверу время обработать данные
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // 3. Sync данных из cloud (подтягиваем изменения куратора)
        // UI обновится автоматически через события heys:day-updated
        if (clientId && cloud && typeof cloud.syncClient === 'function') {
          console.info('[PullRefresh] 🔄 Starting sync...');
          await Promise.race([
            cloud.syncClient(clientId, { force: true }),
            new Promise(r => setTimeout(r, 8000)) // max 8 сек (sync может быть долгим)
          ]);
          console.info('[PullRefresh] ✅ Sync completed');
        }

        // 4. Показываем успех
        setRefreshStatus('success');
        triggerHaptic(20);

        // 5. Держим индикатор 600ms для UX, затем сбрасываем
        await new Promise(r => setTimeout(r, 600));

      } catch (err) {
        console.warn('[PullRefresh] Error:', err.message);
        setRefreshStatus('error');
        await new Promise(r => setTimeout(r, 800));
      } finally {
        // Сбрасываем состояние (без reload!)
        queueMicrotask(() => {
          setIsRefreshing(false);
          setRefreshStatus('idle');
          setPullProgress(0);
        });
      }
    };

    useEffect(() => {
      // 🔧 FIX: Event handlers use refs to avoid stale closures
      // This allows us to use [] deps and NOT re-register listeners on every state change
      const onTouchStart = (e) => {
        // Начинаем pull только если скролл вверху страницы
        if (window.scrollY <= 0) {
          pullStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          setRefreshStatus('pulling');
        }
      };

      const onTouchMove = (e) => {
        // Use refs for current values (avoids stale closure)
        if (!isPulling.current || isRefreshingRef.current) return;

        const y = e.touches[0].clientY;
        const diff = y - pullStartY.current;

        if (diff > 0 && window.scrollY <= 0) {
          // Resistance effect с elastic curve
          const resistance = 0.45;
          const progress = Math.min(diff * resistance, PULL_THRESHOLD * 1.2);
          setPullProgress(progress);

          // Haptic при достижении threshold
          if (progress >= PULL_THRESHOLD && refreshStatusRef.current !== 'ready') {
            setRefreshStatus('ready');
            triggerHaptic(12);
          } else if (progress < PULL_THRESHOLD && refreshStatusRef.current === 'ready') {
            setRefreshStatus('pulling');
          }

          if (diff > 10 && e.cancelable) {
            e.preventDefault(); // Предотвращаем обычный скролл
          }
        }
      };

      const onTouchEnd = () => {
        if (!isPulling.current) return;

        // Use ref for current pullProgress value
        if (pullProgressRef.current >= PULL_THRESHOLD) {
          handleRefresh();
        } else {
          // Elastic bounce back
          setPullProgress(0);
          setRefreshStatus('idle');
        }
        isPulling.current = false;
      };

      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd, { passive: true });

      return () => {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 🔧 Empty deps — handlers use refs, no re-registration needed

    return {
      pullProgress,
      isRefreshing,
      refreshStatus,
      pullThreshold: PULL_THRESHOLD
    };
  };

  window.HEYS.dayPullRefresh = MOD;
})();


/* ===== heys_day_offline_sync_v1.js ===== */
// heys_day_offline_sync_v1.js — offline/sync indicator logic
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.useOfflineSyncIndicator = function useOfflineSyncIndicator({ React, HEYS }) {
    const { useState, useEffect } = React;
    const heys = HEYS || window.HEYS || {};

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingChanges, setPendingChanges] = useState(false);
    const [syncMessage, setSyncMessage] = useState(''); // '' | 'offline' | 'pending' | 'syncing' | 'synced'
    const [pendingQueue, setPendingQueue] = useState([]); // Очередь изменений для Optimistic UI

    // Слушаем online/offline события
    useEffect(() => {
      const handleOnline = async () => {
        setIsOnline(true);
        // Автоматическая синхронизация при восстановлении сети
        if (pendingChanges) {
          setSyncMessage('syncing');
          const cloud = heys.cloud;
          const U = heys.utils;
          const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
          try {
            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
              await cloud.bootstrapClientSync(clientId);
            }
            setSyncMessage('synced');
            setPendingChanges(false);
            // Скрываем через 2 сек
            setTimeout(() => setSyncMessage(''), 2000);
          } catch (e) {
            setSyncMessage('pending');
          }
        }
      };

      const handleOffline = () => {
        setIsOnline(false);
        setSyncMessage('offline');
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Начальная проверка
      if (!navigator.onLine) {
        setSyncMessage('offline');
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, [pendingChanges]);

    // Отслеживаем изменения данных (для pendingChanges)
    useEffect(() => {
      const handleDataChange = (e) => {
        if (!navigator.onLine) {
          setPendingChanges(true);
          setSyncMessage('pending');

          // Добавляем в очередь (если есть детали)
          if (e.detail && e.detail.type) {
            setPendingQueue(prev => {
              const newItem = {
                id: Date.now(),
                type: e.detail.type,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              };
              // Максимум 5 последних изменений
              return [...prev, newItem].slice(-5);
            });
          }
        }
      };

      // Слушаем события сохранения
      window.addEventListener('heys:data-saved', handleDataChange);
      return () => window.removeEventListener('heys:data-saved', handleDataChange);
    }, []);

    // Очистка очереди при успешной синхронизации
    useEffect(() => {
      if (syncMessage === 'synced') {
        setPendingQueue([]);
      }
    }, [syncMessage]);

    return {
      isOnline,
      pendingChanges,
      syncMessage,
      pendingQueue
    };
  };

  window.HEYS.dayOfflineSync = MOD;
})();


/* ===== heys_day_insulin_wave_ui_v1.js ===== */
// heys_day_insulin_wave_ui_v1.js — insulin wave indicator UI
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.renderInsulinWaveIndicator = function renderInsulinWaveIndicator({
    React,
    insulinWaveData,
    insulinExpanded,
    setInsulinExpanded,
    mobileSubTab,
    isMobile,
    openExclusivePopup,
    HEYS
  }) {
    if (!insulinWaveData) return null;
    if (isMobile && mobileSubTab !== 'diary') return null;

    const heys = HEYS || window.HEYS || {};
    const IW = heys.InsulinWave;

    // Мягкий shake когда осталось ≤30 мин до липолиза (almost или soon)
    const shouldShake = insulinWaveData.status === 'almost' || insulinWaveData.status === 'soon';

    // GI info — из модуля или fallback
    const giInfo = insulinWaveData.giCategory?.text 
      ? insulinWaveData.giCategory // модуль возвращает объект
      : { // fallback для старого формата
          low: { text: 'Низкий ГИ', color: '#22c55e', desc: 'медленное усвоение' },
          medium: { text: 'Средний ГИ', color: '#eab308', desc: 'нормальное' },
          high: { text: 'Высокий ГИ', color: '#f97316', desc: 'быстрое' },
          'very-high': { text: 'Очень высокий ГИ', color: '#ef4444', desc: 'очень быстрое' }
        }[insulinWaveData.giCategory] || { text: 'Средний ГИ', color: '#eab308', desc: 'нормальное' };

    // Форматирование времени липолиза
    const formatLipolysisTime = (minutes) => {
      if (minutes < 60) return `${minutes} мин`;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    };

    // Прогресс-бар (из модуля или inline)
    const renderProgressBar = () => {
      if (IW && IW.renderProgressBar) {
        return IW.renderProgressBar(insulinWaveData);
      }

      const progress = insulinWaveData.progress;
      const isLipolysis = insulinWaveData.status === 'lipolysis';
      const lipolysisMinutes = insulinWaveData.lipolysisMinutes || 0;
      const remainingMinutes = insulinWaveData.remaining || 0;

      // Форматирование оставшегося времени
      const formatRemaining = (mins) => {
        if (mins <= 0) return 'скоро';
        if (mins < 60) return `${Math.round(mins)} мин`;
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
      };

      const gradientBg = isLipolysis 
        ? 'linear-gradient(90deg, #22c55e, #10b981, #059669)' 
        : insulinWaveData.status === 'almost'
          ? 'linear-gradient(90deg, #f97316, #fb923c, #fdba74)'
          : insulinWaveData.status === 'soon'
            ? 'linear-gradient(90deg, #eab308, #facc15, #fde047)'
            : 'linear-gradient(90deg, #0284c7, #0ea5e9, #38bdf8)';

      return React.createElement('div', { className: 'insulin-wave-progress' },
        React.createElement('div', { 
          className: isLipolysis ? 'insulin-wave-bar lipolysis-progress-fill' : 'insulin-wave-bar', 
          style: { 
            width: '100%', 
            background: gradientBg,
            height: '28px',
            borderRadius: '8px',
            transition: 'all 0.3s ease'
          } 
        }),
        !isLipolysis && React.createElement('div', { className: 'insulin-wave-animation' }),
        // При липолизе: крупный таймер 🔥
        isLipolysis ? React.createElement('div', {
          className: 'lipolysis-timer-display',
          style: { 
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '14px', fontWeight: '800', color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2
          }
        },
          React.createElement('span', null, formatLipolysisTime(lipolysisMinutes)),
          React.createElement('span', { style: { fontSize: '11px', opacity: 0.9, fontWeight: '600' } }, 'жиросжигание')
        )
        // При активной волне: время до липолиза
        : React.createElement('div', {
          style: { 
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '14px', fontWeight: '700', color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2
          }
        },
          React.createElement('span', { style: { fontSize: '12px' } }, '⏱'),
          React.createElement('span', null, 'до липолиза: ' + formatRemaining(remainingMinutes))
        )
      );
    };

    // История волн (из модуля или inline)
    const renderWaveHistory = () => {
      if (IW && IW.renderWaveHistory) {
        return IW.renderWaveHistory(insulinWaveData);
      }

      const history = insulinWaveData.waveHistory || [];
      if (history.length === 0) return null;

      const firstMealMin = Math.min(...history.map(w => w.startMin));
      const lastMealEnd = Math.max(...history.map(w => w.endMin));
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const rangeStart = firstMealMin - 15;
      const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
      const totalRange = rangeEnd - rangeStart;

      const w = 320, h = 60, padding = 4, barY = 20, barH = 18;
      const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);
      const formatTime = (min) => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

      return React.createElement('div', { className: 'insulin-history', style: { marginTop: '12px', margin: '12px -8px 0 -8px' } },
        React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' } }, '📊 Волны сегодня'),
        React.createElement('svg', { width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' } },
          React.createElement('defs', null,
            React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
              React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
              React.createElement('stop', { offset: '100%', stopColor: '#3b82f6' })
            )
          ),
          React.createElement('line', { x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2, stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round' }),
          history.map((wave, i) => {
            const x1 = minToX(wave.startMin), x2 = minToX(wave.endMin), barW = Math.max(8, x2 - x1);
            const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';
            return React.createElement('g', { key: 'wave-' + i },
              React.createElement('rect', { x: x1, y: barY, width: barW, height: barH, fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor, opacity: wave.isActive ? 1 : 0.6, rx: 4 }),
              wave.isActive && React.createElement('rect', { x: x1, y: barY, width: barW, height: barH, fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4, className: 'wave-active-pulse' })
            );
          }),
          history.map((wave, i) => {
            const x = minToX(wave.startMin);
            return React.createElement('g', { key: 'meal-' + i },
              React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
              React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
              React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' }, formatTime(wave.startMin))
            );
          }),
          (() => {
            const x = minToX(nowMin);
            if (x < padding || x > w - padding) return null;
            return React.createElement('g', null,
              React.createElement('line', { x1: x, y1: barY - 5, x2: x, y2: barY + barH + 5, stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
              React.createElement('polygon', { points: `${x-4},${barY-5} ${x+4},${barY-5} ${x},${barY}`, fill: '#ef4444' }),
              React.createElement('text', { x, y: barY - 8, fontSize: 8, fill: '#ef4444', textAnchor: 'middle', fontWeight: '600' }, 'Сейчас')
            );
          })()
        ),
        React.createElement('div', { className: 'insulin-history-legend', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #3b82f6', background: '#fff' } }),
            'Приём'
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '16px', height: '8px', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #3b82f6)' } }),
            'Активная'
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' } }),
            'Низкий ГИ'
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#eab308' } }),
            'Средний'
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
            React.createElement('span', { style: { width: '12px', height: '2px', background: '#ef4444' } }),
            'Сейчас'
          )
        )
      );
    };

    // Expanded секция (полная версия из модуля или inline)
    const renderExpandedSection = () => {
      if (IW && IW.renderExpandedSection) {
        return IW.renderExpandedSection(insulinWaveData);
      }

      // Inline fallback с расширенными данными
      const formatDuration = (min) => {
        if (min <= 0) return '0 мин';
        const h = Math.floor(min / 60), m = Math.round(min % 60);
        return h > 0 ? (m > 0 ? `${h}ч ${m}м` : `${h}ч`) : `${m} мин`;
      };

      return React.createElement('div', { className: 'insulin-wave-expanded', onClick: e => e.stopPropagation() },
        // ГИ информация
        React.createElement('div', { className: 'insulin-gi-info' },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: giInfo.color } }),
            React.createElement('span', { style: { fontWeight: '600' } }, giInfo.text),
            React.createElement('span', { style: { color: '#64748b', fontSize: '12px' } }, '— ' + (giInfo.desc || ''))
          ),
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
            `Базовая волна: ${insulinWaveData.baseWaveHours}ч → Скорректированная: ${Math.round(insulinWaveData.insulinWaveHours * 10) / 10}ч`
          ),
          // Модификаторы белок/клетчатка
          (insulinWaveData.proteinBonus > 0 || insulinWaveData.fiberBonus > 0) && 
            React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' } },
              insulinWaveData.totalProtein > 0 && React.createElement('span', null, 
                `🥩 Белок: ${insulinWaveData.totalProtein}г${insulinWaveData.proteinBonus > 0 ? ` (+${Math.round(insulinWaveData.proteinBonus * 100)}%)` : ''}`
              ),
              insulinWaveData.totalFiber > 0 && React.createElement('span', null, 
                `🌾 Клетчатка: ${insulinWaveData.totalFiber}г${insulinWaveData.fiberBonus > 0 ? ` (+${Math.round(insulinWaveData.fiberBonus * 100)}%)` : ''}`
              )
            ),
          // 🏃 Workout бонус
          insulinWaveData.hasWorkoutBonus && 
            React.createElement('div', { style: { fontSize: '11px', color: '#22c55e', marginTop: '4px' } },
              `🏃 Тренировка ${insulinWaveData.workoutMinutes} мин → волна ${Math.abs(Math.round(insulinWaveData.workoutBonus * 100))}% короче`
            ),
          // 🌅 Circadian rhythm
          insulinWaveData.circadianMultiplier && insulinWaveData.circadianMultiplier !== 1.0 &&
            React.createElement('div', { style: { fontSize: '11px', color: insulinWaveData.circadianMultiplier < 1 ? '#22c55e' : '#f97316', marginTop: '4px' } },
              insulinWaveData.circadianDesc || `⏰ Время суток: ${insulinWaveData.circadianMultiplier < 1 ? 'быстрее' : 'медленнее'}`
            )
        ),

        // 🧪 v3.2.0: Шкала липолиза — уровень инсулина
        (() => {
          const IW = heys.InsulinWave;
          if (!IW || !IW.estimateInsulinLevel) return null;
          const insulinLevel = IW.estimateInsulinLevel(insulinWaveData.progress || 0);

          return React.createElement('div', { 
            className: 'insulin-lipolysis-scale',
            style: { marginTop: '12px', padding: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }
          },
            // Заголовок
            React.createElement('div', { 
              style: { fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }
            }, '🧪 Уровень инсулина (оценка)'),

            // Шкала — градиент
            React.createElement('div', { 
              style: {
                height: '8px',
                borderRadius: '4px',
                background: 'linear-gradient(to right, #22c55e 0%, #22c55e 5%, #eab308 15%, #f97316 50%, #ef4444 100%)',
                position: 'relative'
              }
            },
              // Маркер текущего уровня
              React.createElement('div', {
                style: {
                  position: 'absolute',
                  left: `${Math.min(100, Math.max(0, insulinLevel.level))}%`,
                  top: '-4px',
                  width: '4px',
                  height: '16px',
                  background: 'var(--card, #fff)',
                  borderRadius: '2px',
                  boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                  transform: 'translateX(-50%)',
                  transition: 'left 0.3s ease'
                }
              })
            ),

            // Метки под шкалой
            React.createElement('div', { 
              style: { 
                display: 'flex', 
                justifyContent: 'space-between', 
                fontSize: '10px', 
                color: '#94a3b8',
                marginTop: '4px'
              }
            },
              React.createElement('span', null, '🟢 <5'),
              React.createElement('span', null, '🟡 15'),
              React.createElement('span', null, '🟠 50'),
              React.createElement('span', null, '🔴 100+')
            ),

            // Текущий уровень и описание
            React.createElement('div', {
              style: { 
                textAlign: 'center', 
                fontSize: '13px',
                color: insulinLevel.color,
                marginTop: '8px',
                fontWeight: '600'
              }
            }, `~${insulinLevel.level} µЕд/мл • ${insulinLevel.desc}`),

            // Подсказка о жиросжигании
            insulinLevel.lipolysisPct < 100 && React.createElement('div', {
              style: { 
                fontSize: '11px', 
                color: '#64748b', 
                textAlign: 'center',
                marginTop: '4px'
              }
            }, `Жиросжигание: ~${insulinLevel.lipolysisPct}%`)
          );
        })(),

        // Предупреждение о перекрытии волн
        insulinWaveData.hasOverlaps && React.createElement('div', { 
          className: 'insulin-overlap-warning',
          style: { 
            marginTop: '8px', padding: '8px', 
            background: insulinWaveData.worstOverlap?.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
            borderRadius: '8px', fontSize: '12px',
            border: `1px solid ${insulinWaveData.worstOverlap?.severity === 'high' ? '#fca5a5' : '#fcd34d'}`
          }
        },
          React.createElement('div', { style: { fontWeight: '600', color: insulinWaveData.worstOverlap?.severity === 'high' ? '#dc2626' : '#d97706' } },
            '⚠️ Волны пересеклись!'
          ),
          React.createElement('div', { style: { marginTop: '2px', color: '#64748b' } },
            (insulinWaveData.overlaps || []).map((o, i) => 
              React.createElement('div', { key: i }, `${o.from} → ${o.to}: перекрытие ${o.overlapMinutes} мин`)
            )
          ),
          React.createElement('div', { style: { marginTop: '4px', fontSize: '11px', fontStyle: 'italic' } },
            `💡 Совет: подожди минимум ${Math.round(insulinWaveData.baseWaveHours * 60)} мин между приёмами`
          )
        ),

        // Персональная статистика
        insulinWaveData.personalAvgGap > 0 && React.createElement('div', { 
          className: 'insulin-personal-stats',
          style: { marginTop: '8px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '12px' }
        },
          React.createElement('div', { style: { fontWeight: '600', color: '#3b82f6', marginBottom: '4px' } }, '📊 Твои паттерны'),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b' } },
            React.createElement('span', null, 'Сегодня между приёмами:'),
            React.createElement('span', { style: { fontWeight: '600' } }, insulinWaveData.avgGapToday > 0 ? formatDuration(insulinWaveData.avgGapToday) : '—')
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
            React.createElement('span', null, 'Твой средний gap:'),
            React.createElement('span', { style: { fontWeight: '600' } }, formatDuration(insulinWaveData.personalAvgGap))
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
            React.createElement('span', null, 'Рекомендуемый:'),
            React.createElement('span', { style: { fontWeight: '600' } }, formatDuration(insulinWaveData.recommendedGap || insulinWaveData.baseWaveHours * 60))
          ),
          React.createElement('div', { 
            style: { 
              marginTop: '6px', padding: '4px 8px', borderRadius: '4px', textAlign: 'center', fontWeight: '600',
              background: insulinWaveData.gapQuality === 'excellent' ? '#dcfce7' : insulinWaveData.gapQuality === 'good' ? '#fef9c3' : insulinWaveData.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
              color: insulinWaveData.gapQuality === 'excellent' ? '#166534' : insulinWaveData.gapQuality === 'good' ? '#854d0e' : insulinWaveData.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
            }
          },
            insulinWaveData.gapQuality === 'excellent' ? '🌟 Отлично! Выдерживаешь оптимальные промежутки' :
            insulinWaveData.gapQuality === 'good' ? '👍 Хорошо! Почти идеальные промежутки' :
            insulinWaveData.gapQuality === 'moderate' ? '😐 Можно лучше. Попробуй увеличить gap' :
            insulinWaveData.gapQuality === 'needs-work' ? '⚠️ Ешь слишком часто. Дай организму переварить' :
            '📈 Продолжай вести дневник для статистики'
          )
        ),

        // История волн
        renderWaveHistory()
      );
    };

    // Overlay вынесен отдельно через Fragment
    return React.createElement(React.Fragment, null,
      // Focus overlay (blur фон когда раскрыто) — ВНЕ карточки!
      insulinExpanded && React.createElement('div', { 
        className: 'insulin-focus-overlay',
        onClick: () => setInsulinExpanded(false)
      }),
      // Сама карточка с мягким shake при приближении липолиза
      React.createElement('div', { 
        className: 'insulin-wave-indicator insulin-' + insulinWaveData.status + (shouldShake ? ' shake-subtle' : '') + (insulinExpanded ? ' expanded' : ''),
        id: 'tour-insulin-wave',
        style: { 
          margin: '8px 0', 
          cursor: 'pointer',
          position: insulinExpanded ? 'relative' : undefined,
          zIndex: insulinExpanded ? 100 : undefined
        },
        onClick: () => setInsulinExpanded(!insulinExpanded)
      },

      // Анимированный фон волны
      React.createElement('div', { className: 'insulin-wave-bg' }),

      // Контент
      React.createElement('div', { className: 'insulin-wave-content' },
        // Header: иконка + label + статус
        React.createElement('div', { className: 'insulin-wave-header' },
          React.createElement('div', { className: 'insulin-wave-left' },
            React.createElement('span', { className: 'insulin-wave-icon' }, insulinWaveData.emoji),
            React.createElement('span', { className: 'insulin-wave-label' }, 
              insulinWaveData.status === 'lipolysis' ? 'Липолиз активен! 🔥' : 'Инсулиновая волна'
            ),
            // Expand indicator
            React.createElement('span', { 
              style: { fontSize: '10px', color: '#94a3b8', marginLeft: '4px' } 
            }, insulinExpanded ? '▲' : '▼')
          )
        ),

        // Прогресс-бар
        renderProgressBar(),

        // 🆕 v4.1.4: Мини-легенда компонентов + научный popup
        insulinWaveData.wavePhases && React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            marginTop: '8px',
            marginBottom: '4px',
            fontSize: '10px',
            opacity: 0.9,
            paddingLeft: '4px'
          }
        },
          React.createElement('span', { style: { color: '#f97316' } }, '⚡ Быстрые'),
          React.createElement('span', { style: { color: '#22c55e' } }, '🌿 Основной'),
          React.createElement('span', { style: { color: '#8b5cf6' } }, '🫀 Печёночный'),
          // "?" сноска с научным обоснованием
          React.createElement('span', {
            style: {
              marginLeft: '4px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: 'rgba(107, 114, 128, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '9px',
              color: '#6b7280',
              cursor: 'pointer',
              fontWeight: 600
            },
            onClick: (e) => {
              e.stopPropagation();
              const popupData = {
                title: '🧬 3-компонентная модель инсулиновой волны',
                content: [
                  { label: '⚡ Быстрые (Fast Peak)', value: 'Простые углеводы → быстрый пик глюкозы (15-25 мин). GI>70: сахар, белый хлеб, мёд.' },
                  { label: '🌿 Основной (Main Peak)', value: 'Главный инсулиновый ответ на смешанный приём (45-60 мин). Зависит от общей GL.' },
                  { label: '🫀 Печёночный (Hepatic Tail)', value: 'Жиры, белок, клетчатка замедляют всасывание (90-120 мин). Печень процессит нутриенты.' }
                ],
                links: [
                  { text: 'Brand-Miller 2003', url: 'https://pubmed.ncbi.nlm.nih.gov/12828192/' },
                  { text: 'Holt 1997', url: 'https://pubmed.ncbi.nlm.nih.gov/9356547/' }
                ]
              };
              // Если на вкладке Отчёты — сначала переключаемся на Дневник
              if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
                window.HEYS.App.setTab('diary');
                setTimeout(() => openExclusivePopup('debt-science', popupData), 200);
              } else {
                openExclusivePopup('debt-science', popupData);
              }
            }
          }, '?')
        ),

        // Подсказка
        insulinWaveData.subtext && React.createElement('div', { className: 'insulin-wave-suggestion' }, insulinWaveData.subtext),

        // 🏆 При липолизе: рекорд + streak + ккал
        insulinWaveData.status === 'lipolysis' && React.createElement('div', { 
          className: 'lipolysis-stats',
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginTop: '8px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.5)',
            borderRadius: '8px',
            fontSize: '12px',
            gap: '8px'
          }
        },
          // Рекорд
          React.createElement('div', { 
            style: { 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px',
              color: insulinWaveData.isNewRecord ? '#f59e0b' : '#64748b'
            }
          },
            React.createElement('span', null, insulinWaveData.isNewRecord ? '🏆' : '🎯'),
            React.createElement('span', { style: { fontWeight: insulinWaveData.isNewRecord ? '700' : '500' } }, 
              insulinWaveData.isNewRecord 
                ? 'Новый рекорд!' 
                : 'Рекорд: ' + formatLipolysisTime(insulinWaveData.lipolysisRecord?.minutes || 0)
            )
          ),
          // Streak
          insulinWaveData.lipolysisStreak?.current > 0 && React.createElement('div', { 
            style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e' }
          },
            React.createElement('span', null, '🔥'),
            React.createElement('span', { style: { fontWeight: '600' } }, 
              insulinWaveData.lipolysisStreak.current + ' ' + 
              (insulinWaveData.lipolysisStreak.current === 1 ? 'день' : 
               insulinWaveData.lipolysisStreak.current < 5 ? 'дня' : 'дней')
            )
          ),
          // Примерно сожжённые ккал
          insulinWaveData.lipolysisKcal > 0 && React.createElement('div', { 
            style: { display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }
          },
            React.createElement('span', null, '💪'),
            React.createElement('span', { style: { fontWeight: '600' } }, 
              '~' + insulinWaveData.lipolysisKcal + ' ккал'
            )
          )
        ),

        // 🆕 v3.2.1: Аутофагия — показываем при активной фазе
        insulinWaveData.autophagy && insulinWaveData.isAutophagyActive && React.createElement('div', {
          className: 'autophagy-status',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            padding: '8px 12px',
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.15))',
            borderRadius: '8px',
            border: '1px solid rgba(34, 197, 94, 0.3)'
          }
        },
          React.createElement('span', { style: { fontSize: '18px' } }, insulinWaveData.autophagy.icon),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { 
              style: { fontWeight: '600', fontSize: '13px', color: insulinWaveData.autophagy.color }
            }, insulinWaveData.autophagy.label),
            React.createElement('div', { 
              style: { fontSize: '11px', color: '#64748b' }
            }, 'Клеточное очищение • ' + Math.round(insulinWaveData.currentFastingHours || 0) + 'ч голода')
          ),
          // Прогресс-бар внутри фазы
          React.createElement('div', { 
            style: { 
              width: '40px', 
              height: '4px', 
              background: 'rgba(0,0,0,0.1)', 
              borderRadius: '2px', 
              overflow: 'hidden' 
            }
          },
            React.createElement('div', {
              style: {
                width: insulinWaveData.autophagy.progress + '%',
                height: '100%',
                background: insulinWaveData.autophagy.color,
                transition: 'width 0.3s'
              }
            })
          )
        ),

        // 🆕 v3.2.1: Холодовое воздействие — если активно
        insulinWaveData.hasColdExposure && React.createElement('div', {
          className: 'cold-exposure-badge',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
            padding: '6px 10px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.15))',
            borderRadius: '6px',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            fontSize: '12px'
          }
        },
          React.createElement('span', null, '🧊'),
          React.createElement('span', { style: { color: '#3b82f6', fontWeight: '500' } }, 
            insulinWaveData.coldExposure.desc
          )
        ),

        // 🆕 v3.2.1: Добавки — если есть
        insulinWaveData.hasSupplements && React.createElement('div', {
          className: 'supplements-badge',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
            padding: '6px 10px',
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(192, 132, 252, 0.15))',
            borderRadius: '6px',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            fontSize: '12px'
          }
        },
          React.createElement('span', null, '🧪'),
          React.createElement('span', { style: { color: '#a855f7', fontWeight: '500' } }, 
            insulinWaveData.supplements.supplements.map(function(s) {
              if (s === 'vinegar') return 'Уксус';
              if (s === 'cinnamon') return 'Корица';
              if (s === 'berberine') return 'Берберин';
              return s;
            }).join(', ') + ' → ' + Math.abs(Math.round(insulinWaveData.supplementsBonus * 100)) + '% короче'
          )
        ),

        // === Expanded секция ===
        insulinExpanded && renderExpandedSection()
      )
    )  // закрываем Fragment
    );
  };

  window.HEYS.dayInsulinWaveUI = MOD;
})();


/* ===== heys_day_measurements_v1.js ===== */
// heys_day_measurements_v1.js — measurements helpers/state for DayTab
;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const MOD = {};

  MOD.useMeasurementsState = function useMeasurementsState({
    React,
    day,
    date,
    setDay,
    HEYS: heysGlobal
  }) {
    const { useMemo, useCallback } = React;
    const HEYSRef = heysGlobal || HEYS;

    const measurementFields = useMemo(() => ([
      { key: 'waist', label: 'Обхват талии', icon: '📏' },
      { key: 'hips', label: 'Обхват бёдер', icon: '🍑' },
      { key: 'thigh', label: 'Обхват бедра', icon: '🦵' },
      { key: 'biceps', label: 'Обхват бицепса', icon: '💪' }
    ]), []);

    const measurementsHistory = useMemo(() => {
      try {
        const history = HEYSRef.Steps?.getMeasurementsHistory ? HEYSRef.Steps.getMeasurementsHistory(90) : [];
        return Array.isArray(history) ? history : [];
      } catch (e) {
        return [];
      }
    }, [date, day.updatedAt, HEYSRef.Steps]);

    const measurementsByField = useMemo(() => {
      const current = day.measurements || {};
      return measurementFields.map((f) => {
        const points = [];
        (measurementsHistory || []).forEach((entry) => {
          const val = entry[f.key];
          if (val !== null && val !== undefined && !Number.isNaN(+val)) {
            points.push({ value: +val, date: entry.date || entry.measuredAt });
          }
        });

        const latest = points[0] || null;
        const prev = points[1] || null;
        const value = (current[f.key] !== null && current[f.key] !== undefined && !Number.isNaN(+current[f.key]))
          ? +current[f.key]
          : latest ? latest.value : null;
        const prevValue = prev ? prev.value : null;
        const delta = (value !== null && prevValue !== null) ? value - prevValue : null;
        const deltaPct = (value !== null && prevValue && prevValue !== 0) ? delta / prevValue : null;
        const warn = deltaPct !== null && Math.abs(deltaPct) > 0.15;

        return {
          ...f,
          value,
          prevValue,
          delta,
          deltaPct,
          warn,
          points: points.slice(0, 8)
        };
      });
    }, [measurementFields, measurementsHistory, day.measurements]);

    const measurementsLastDate = useMemo(() => {
      if (!measurementsHistory || measurementsHistory.length === 0) return null;
      return measurementsHistory[0].date || measurementsHistory[0].measuredAt || null;
    }, [measurementsHistory]);

    const measurementsLastDateFormatted = useMemo(() => {
      if (!measurementsLastDate) return null;
      const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
      const lastDate = new Date(measurementsLastDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastDateNorm = new Date(lastDate);
      lastDateNorm.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - lastDateNorm) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'сегодня';
      if (diffDays === 1) return 'вчера';
      if (diffDays === 2) return 'позавчера';
      return `${lastDate.getDate()} ${months[lastDate.getMonth()]}`;
    }, [measurementsLastDate]);

    const measurementsNeedUpdate = useMemo(() => {
      if (!measurementsLastDate) return true;
      const lastDate = new Date(measurementsLastDate);
      const today = new Date();
      const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
      return diffDays >= 7;
    }, [measurementsLastDate]);

    const measurementsMonthlyProgress = useMemo(() => {
      if (!measurementsHistory || measurementsHistory.length < 2) return null;

      const results = [];
      measurementFields.forEach(f => {
        const values = measurementsHistory
          .filter(h => h[f.key] != null)
          .map(h => ({ value: +h[f.key], date: h.date || h.measuredAt }));

        if (values.length >= 2) {
          const newest = values[0].value;
          const oldest = values[values.length - 1].value;
          const diff = newest - oldest;
          if (Math.abs(diff) >= 0.5) {
            results.push({ label: f.label.toLowerCase(), diff: Math.round(diff * 10) / 10 });
          }
        }
      });

      return results.length > 0 ? results : null;
    }, [measurementsHistory, measurementFields]);

    const openMeasurementsEditor = useCallback(() => {
      if (HEYSRef.showCheckin?.measurements) {
        HEYSRef.showCheckin.measurements(date, (stepData) => {
          const m = stepData?.measurements;
          if (m && (m.waist || m.hips || m.thigh || m.biceps)) {
            setDay(prev => ({
              ...prev,
              measurements: {
                waist: m.waist ?? null,
                hips: m.hips ?? null,
                thigh: m.thigh ?? null,
                biceps: m.biceps ?? null,
                measuredAt: date
              },
              updatedAt: Date.now()
            }));
          }
        });
      } else if (HEYSRef.StepModal?.show) {
        HEYSRef.StepModal.show({
          steps: ['measurements'],
          context: { dateKey: date }
        });
      }
    }, [HEYSRef, date, setDay]);

    const formatShortDate = useCallback((dateStr) => {
      if (!dateStr) return '';
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];
      const d = new Date(dateStr);
      return `${d.getDate()} ${months[d.getMonth()]}`;
    }, []);

    const renderMeasurementSpark = useCallback((points) => {
      if (!points || points.length < 2) return null;

      const reversed = [...points].reverse();
      const values = reversed.map(p => p.value);
      const dates = reversed.map(p => formatShortDate(p.date));

      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const width = 100;
      const height = 20;
      const padding = 8;
      const step = reversed.length > 1 ? (width - padding * 2) / (reversed.length - 1) : 0;

      const pointCoords = values.map((v, idx) => ({
        x: padding + idx * step,
        y: height - ((v - min) / span) * (height - 6) - 3
      }));

      const svgPoints = pointCoords.map(p => `${p.x},${p.y}`).join(' ');
      const datePositions = pointCoords.map(p => p.x);

      return React.createElement('div', { className: 'measurement-spark-container' },
        React.createElement('svg', { className: 'measurement-spark', viewBox: '0 0 100 20' },
          pointCoords.map((p, idx) =>
            React.createElement('line', {
              key: 'grid-' + idx,
              x1: p.x,
              y1: 0,
              x2: p.x,
              y2: height,
              stroke: '#e5e7eb',
              strokeWidth: 0.5,
              strokeDasharray: '1,2'
            })
          ),
          React.createElement('polyline', {
            points: svgPoints,
            fill: 'none',
            stroke: 'var(--acc, #3b82f6)',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
          }),
          pointCoords.map((p, idx) =>
            React.createElement('circle', {
              key: 'dot-' + idx,
              cx: p.x,
              cy: p.y,
              r: 2.5,
              fill: idx === pointCoords.length - 1 ? 'var(--acc, #3b82f6)' : '#fff',
              stroke: 'var(--acc, #3b82f6)',
              strokeWidth: 1
            })
          )
        ),
        React.createElement('div', { className: 'measurement-spark-dates' },
          dates.map((d, idx) =>
            React.createElement('span', {
              key: 'date-' + idx,
              className: 'measurement-spark-date-label',
              style: { left: `${datePositions[idx]}%`, transform: 'translateX(-50%)' }
            }, d)
          )
        )
      );
    }, [formatShortDate, React]);

    return {
      measurementFields,
      measurementsHistory,
      measurementsByField,
      measurementsLastDateFormatted,
      measurementsNeedUpdate,
      measurementsMonthlyProgress,
      openMeasurementsEditor,
      renderMeasurementSpark
    };
  };

  HEYS.dayMeasurements = MOD;
})(window);


/* ===== heys_day_popups_state_v1.js ===== */
// heys_day_popups_state_v1.js — popup state + helpers for DayTab
;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  const MOD = {};

  MOD.usePopupsState = function usePopupsState({ React }) {
    const { useState, useCallback, useEffect } = React;

    const [sparklinePopup, setSparklinePopup] = useState(null); // { type: 'kcal'|'weight', point, x, y }
    const [macroBadgePopup, setMacroBadgePopup] = useState(null); // { macro, emoji, desc, x, y }
    const [metricPopup, setMetricPopup] = useState(null); // { type: 'water'|'steps'|'kcal', x, y, data }
    const [tdeePopup, setTdeePopup] = useState(null); // { x, y, data }
    const [mealQualityPopup, setMealQualityPopup] = useState(null); // { meal, quality, mealTypeInfo, x, y }
    const [weekNormPopup, setWeekNormPopup] = useState(null); // { days, inNorm, withData, x, y }
    const [weekDeficitPopup, setWeekDeficitPopup] = useState(null); // { x, y, data }
    const [balanceDayPopup, setBalanceDayPopup] = useState(null); // { day, x, y }
    const [tefInfoPopup, setTefInfoPopup] = useState(null); // { x, y }
    const [goalPopup, setGoalPopup] = useState(null); // { x, y, data }
    const [debtSciencePopup, setDebtSciencePopup] = useState(null); // { title, content, links }

    // === Управление попапами: одновременно может быть только один ===
    const closeAllPopups = useCallback(() => {
      setSparklinePopup(null);
      setMacroBadgePopup(null);
      setMetricPopup(null);
      setTdeePopup(null);
      setMealQualityPopup(null);
      setWeekNormPopup(null);
      setGoalPopup(null);
      setDebtSciencePopup(null);
    }, []);

    const openExclusivePopup = useCallback((type, payload) => {
      setSparklinePopup(type === 'sparkline' ? payload : null);
      setMacroBadgePopup(type === 'macro' ? payload : null);
      setMetricPopup(type === 'metric' ? payload : null);
      setTdeePopup(type === 'tdee' ? payload : null);
      setMealQualityPopup(type === 'mealQuality' ? payload : null);
      setWeekNormPopup(type === 'weekNorm' ? payload : null);
      setGoalPopup(type === 'goal' ? payload : null);
      setDebtSciencePopup(type === 'debt-science' ? payload : null);
    }, []);

    // === Утилита для умного позиционирования попапов ===
    const getSmartPopupPosition = useCallback((clickX, clickY, popupWidth, popupHeight, options = {}) => {
      const {
        preferAbove = false,
        margin = 12,
        offset = 15,
        arrowSize = 8
      } = options;

      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      // Горизонтальная позиция
      let left, arrowPos = 'center';
      if (clickX < popupWidth / 2 + margin) {
        left = margin;
        arrowPos = 'left';
      } else if (clickX > screenW - popupWidth / 2 - margin) {
        left = screenW - popupWidth - margin;
        arrowPos = 'right';
      } else {
        left = clickX - popupWidth / 2;
      }

      // Вертикальная позиция
      let top, showAbove = false;
      const spaceBelow = screenH - clickY - offset;
      const spaceAbove = clickY - offset;

      if (preferAbove && spaceAbove >= popupHeight) {
        top = clickY - popupHeight - offset;
        showAbove = true;
      } else if (spaceBelow >= popupHeight) {
        top = clickY + offset;
      } else if (spaceAbove >= popupHeight) {
        top = clickY - popupHeight - offset;
        showAbove = true;
      } else {
        top = Math.max(margin, (screenH - popupHeight) / 2);
      }

      if (top < margin) top = margin;
      if (top + popupHeight > screenH - margin) {
        top = screenH - popupHeight - margin;
      }

      return { left, top, arrowPos, showAbove };
    }, []);

    // Закрытие popup при клике вне
    useEffect(() => {
      if (!sparklinePopup && !macroBadgePopup && !metricPopup && !mealQualityPopup && !tdeePopup && !weekNormPopup && !tefInfoPopup && !goalPopup && !weekDeficitPopup && !balanceDayPopup && !debtSciencePopup) return;
      const handleClickOutside = (e) => {
        if (sparklinePopup && !e.target.closest('.sparkline-popup')) {
          setSparklinePopup(null);
        }
        if (macroBadgePopup && !e.target.closest('.macro-badge-popup')) {
          setMacroBadgePopup(null);
        }
        if (metricPopup && !e.target.closest('.metric-popup')) {
          setMetricPopup(null);
        }
        if (mealQualityPopup && !e.target.closest('.meal-quality-popup') && !e.target.closest('.meal-bar-container')) {
          setMealQualityPopup(null);
        }
        if (tdeePopup && !e.target.closest('.tdee-popup')) {
          setTdeePopup(null);
        }
        if (weekNormPopup && !e.target.closest('.week-norm-popup')) {
          setWeekNormPopup(null);
        }
        if (weekDeficitPopup && !e.target.closest('.week-deficit-popup') && !e.target.closest('.week-heatmap-deficit')) {
          setWeekDeficitPopup(null);
        }
        if (balanceDayPopup && !e.target.closest('.balance-day-popup') && !e.target.closest('.balance-viz-bar') && !e.target.closest('.balance-viz-bar-clickable')) {
          setBalanceDayPopup(null);
        }
        if (tefInfoPopup && !e.target.closest('.tef-info-popup') && !e.target.closest('.tef-help-icon')) {
          setTefInfoPopup(null);
        }
        if (goalPopup && !e.target.closest('.goal-popup')) {
          setGoalPopup(null);
        }
        // debtSciencePopup закрывается через overlay onClick
      };
      const timerId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
      return () => {
        clearTimeout(timerId);
        document.removeEventListener('click', handleClickOutside);
      };
    }, [
      sparklinePopup,
      macroBadgePopup,
      metricPopup,
      mealQualityPopup,
      tdeePopup,
      weekNormPopup,
      weekDeficitPopup,
      balanceDayPopup,
      tefInfoPopup,
      goalPopup,
      debtSciencePopup
    ]);

    return {
      sparklinePopup,
      setSparklinePopup,
      macroBadgePopup,
      setMacroBadgePopup,
      metricPopup,
      setMetricPopup,
      tdeePopup,
      setTdeePopup,
      mealQualityPopup,
      setMealQualityPopup,
      weekNormPopup,
      setWeekNormPopup,
      weekDeficitPopup,
      setWeekDeficitPopup,
      balanceDayPopup,
      setBalanceDayPopup,
      tefInfoPopup,
      setTefInfoPopup,
      goalPopup,
      setGoalPopup,
      debtSciencePopup,
      setDebtSciencePopup,
      closeAllPopups,
      openExclusivePopup,
      getSmartPopupPosition
    };
  };

  HEYS.dayPopupsState = MOD;
})(window);


/* ===== heys_day_main_block_v1.js ===== */
// heys_day_main_block_v1.js — main violet block (DayTab)
(function () {
  if (!window.HEYS) window.HEYS = {};

  const MOD = {};

  MOD.renderMainBlock = function renderMainBlock(params) {
    const {
      React,
      day,
      tdee,
      ndteData,
      ndteBoostKcal,
      ndteExpanded,
      setNdteExpanded,
      bmr,
      stepsK,
      train1k,
      train2k,
      householdK,
      actTotal,
      tefKcal,
      setTefInfoPopup,
      optimum,
      dayTargetDef,
      factDefPct,
      eatenKcal,
      getProfile,
      setDay,
      r0,
      cycleKcalMultiplier
    } = params || {};

    if (!React) return null;

    return React.createElement('div', { className: 'area-main card tone-violet main-violet', id: 'main-violet-block', style: { overflow: 'hidden' } },
      React.createElement('table', { className: 'violet-table' },
        React.createElement('colgroup', null, [
          React.createElement('col', { key: 'main-col-0', style: { width: '40%' } }),
          React.createElement('col', { key: 'main-col-1', style: { width: '20%' } }),
          React.createElement('col', { key: 'main-col-2', style: { width: '20%' } }),
          React.createElement('col', { key: 'main-col-3', style: { width: '20%' } })
        ]),
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, ''),
            React.createElement('th', null, 'ккал.'),
            React.createElement('th', null, ''),
            React.createElement('th', null, '')
          )
        ),
        React.createElement('tbody', null,
          // Row 1 — Общие затраты
          React.createElement('tr', { className: 'vio-row total-kcal' },
            React.createElement('td', { className: 'label small' },
              React.createElement('strong', null, 'Общие затраты :'),
              // 🆕 v3.7.0: Интерактивный NDTE badge с expand/countdown
              window.HEYS?.InsulinWave?.renderNDTEBadge &&
                window.HEYS.InsulinWave.renderNDTEBadge(ndteData, ndteBoostKcal, ndteExpanded, () => setNdteExpanded(prev => !prev))
            ),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: tdee, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 2 — BMR + вес
          React.createElement('tr', null,
            React.createElement('td', { className: 'label small' }, 'BMR :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: bmr, disabled: true })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              step: '0.1',
              value: day?.weightMorning ? Math.round(day.weightMorning * 10) / 10 : '',
              onChange: e => {
                const newWeight = +e.target.value || '';
                const prof = getProfile ? getProfile() : {};
                // Если раньше вес был пустой и сейчас вводится первый раз, подставляем целевой дефицит из профиля
                if (!setDay) return;
                setDay(prevDay => {
                  const shouldSetDeficit = (!prevDay.weightMorning || prevDay.weightMorning === '') && newWeight && (!prevDay.deficitPct && prevDay.deficitPct !== 0);
                  return {
                    ...prevDay,
                    weightMorning: newWeight,
                    deficitPct: shouldSetDeficit ? (Number(prof.deficitPctTarget) || 0) : prevDay.deficitPct
                  };
                });
              }
            })),
            React.createElement('td', null, 'вес на утро')
          ),
          // Row 3 — Шаги (ккал считаем из stepsK)
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, 'Шаги :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: stepsK, disabled: true, title: 'ккал от шагов' })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              value: day?.steps || 0,
              onChange: e => setDay && setDay(prev => ({ ...prev, steps: +e.target.value || 0, updatedAt: Date.now() }))
            })),
            React.createElement('td', null, 'шагов')
          ),
          // Row 4 — Тренировки
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, 'Тренировки :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: r0 ? r0(train1k + train2k) : (train1k + train2k), disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 5 — Бытовая активность
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, 'Бытовая активность :'),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: householdK, disabled: true })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              value: day?.householdMin || 0,
              onChange: e => setDay && setDay(prev => ({ ...prev, householdMin: +e.target.value || 0, updatedAt: Date.now() }))
            })),
            React.createElement('td', null, 'мин')
          ),
          // Row 6 — Общая активность
          React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small' }, React.createElement('strong', null, 'Общая активность :')),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: actTotal, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 7 — TEF (Термический эффект пищи) v1.0.0
          tefKcal > 0 && React.createElement('tr', null,
            React.createElement('td', { className: 'label muted small', title: 'Thermic Effect of Food — затраты на переваривание' },
              '🔥 Переваривание (TEF) :',
              React.createElement('span', {
                className: 'tef-help-icon',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  setTefInfoPopup && setTefInfoPopup({ x: rect.left + rect.width / 2, y: rect.bottom });
                },
                style: {
                  marginLeft: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: 'rgba(100,116,139,0.15)',
                  color: '#64748b',
                  fontSize: '9px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }
              }, '?')
            ),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: tefKcal, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 8 — Нужно съесть ккал + Целевой дефицит (редактируемый по дням)
          React.createElement('tr', { className: 'vio-row need-kcal' },
            React.createElement('td', { className: 'label small' },
              React.createElement('strong', null, 'Нужно съесть ккал :'),
              // Индикатор коррекции на цикл
              cycleKcalMultiplier > 1 && React.createElement('span', {
                style: { marginLeft: '6px', fontSize: '11px', color: '#ec4899' }
              }, '🌸 +' + Math.round((cycleKcalMultiplier - 1) * 100) + '%')
            ),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: optimum, disabled: true })),
            React.createElement('td', null, React.createElement('input', {
              type: 'number',
              value: day?.deficitPct || 0,
              onChange: e => setDay && setDay(prev => ({ ...prev, deficitPct: Number(e.target.value) || 0, updatedAt: Date.now() })),
              style: { width: '60px', textAlign: 'center', fontWeight: 600 }
            })),
            React.createElement('td', null, 'Целевой дефицит')
          ),
          // Row 7 — Съедено за день
          React.createElement('tr', { className: 'vio-row eaten-kcal' },
            React.createElement('td', { className: 'label small' }, React.createElement('strong', null, 'Съедено за день :')),
            React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: r0 ? r0(eatenKcal) : eatenKcal, disabled: true })),
            React.createElement('td', null, ''),
            React.createElement('td', null, '')
          ),
          // Row 8 — Дефицит ФАКТ (фактический % от Общих затрат)
          React.createElement('tr', { className: 'dev-row' },
            (function () {
              const target = dayTargetDef; // используем целевой дефицит дня
              const fact = factDefPct; // отрицательно — хорошо если <= target
              const labelText = fact < target ? 'Дефицит ФАКТ :' : 'Профицит ФАКТ :';
              return React.createElement('td', { className: 'label small' }, labelText);
            })(),
            (function () {
              const target = dayTargetDef; // используем целевой дефицит дня
              const fact = factDefPct; // отрицательно — хорошо если <= target
              const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
              const bg = good ? '#dcfce7' : '#fee2e2';
              const col = good ? '#065f46' : '#b91c1c';
              return React.createElement('td', null, React.createElement('input', { className: 'readOnly', disabled: true, value: (fact > 0 ? '+' : '') + fact + '%', style: { background: bg, color: col, fontWeight: 700, border: '1px solid ' + (good ? '#86efac' : '#fecaca') } }));
            })(),
            (function () {
              const target = dayTargetDef; // используем целевой дефицит дня
              const fact = factDefPct; // отрицательно — хорошо если <= target
              const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
              const deficitKcal = eatenKcal - tdee; // отрицательно = дефицит, положительно = профицит
              const bg = good ? '#dcfce7' : '#fee2e2';
              const col = good ? '#065f46' : '#b91c1c';
              return React.createElement('td', null, React.createElement('input', { className: 'readOnly', disabled: true, value: (deficitKcal > 0 ? '+' : '') + Math.round(deficitKcal), style: { background: bg, color: col, fontWeight: 700, border: '1px solid ' + (good ? '#86efac' : '#fecaca') } }));
            })(),
            React.createElement('td', null, '')
          )
        )
      )
    );
  };

  window.HEYS.dayMainBlock = MOD;
})();


/* ===== heys_day_side_block_v1.js ===== */
// heys_day_side_block_v1.js — extracted side block (compact sleep/day + measurements)

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.daySideBlock = HEYS.daySideBlock || {};

  HEYS.daySideBlock.renderSideBlock = function renderSideBlock(ctx) {
    const {
      React,
      day,
      date,
      sleepH,
      getYesterdayData,
      getCompareArrow,
      getScoreEmoji,
      getScoreGradient,
      getScoreTextColor,
      setDay,
      calculateDayAverages,
      measurementsNeedUpdate,
      openMeasurementsEditor,
      measurementsByField,
      measurementsHistory,
      measurementsMonthlyProgress,
      measurementsLastDateFormatted,
      renderMeasurementSpark
    } = ctx || {};

    const openSleepCheckin = () => {
      if (HEYS.showCheckin?.sleep) {
        HEYS.showCheckin.sleep(date, (stepData) => {
          if (stepData) {
            const timeData = stepData.sleepTime || {};
            const qualityData = stepData.sleepQuality || {};
            setDay(prev => ({
              ...prev,
              sleepStart: timeData.sleepStart ?? prev.sleepStart,
              sleepEnd: timeData.sleepEnd ?? prev.sleepEnd,
              sleepHours: timeData.sleepHours ?? prev.sleepHours,
              sleepQuality: qualityData.sleepQuality ?? prev.sleepQuality,
              sleepNote: qualityData.sleepNote || prev.sleepNote,
              updatedAt: Date.now()
            }));
          }
        });
      }
    };

    const openMorningMoodCheckin = () => {
      if (HEYS.showCheckin?.morningMood) {
        HEYS.showCheckin.morningMood(date, () => {
          const dateKey = date || new Date().toISOString().slice(0, 10);
          const storedDay = HEYS.utils?.lsGet ? HEYS.utils.lsGet(`heys_dayv2_${dateKey}`, {}) : null;

          setDay(prev => {
            const merged = { ...prev, ...(storedDay || {}) };
            const averages = typeof calculateDayAverages === 'function'
              ? calculateDayAverages(merged.meals, merged.trainings, merged)
              : {};
            const nextDayScore = merged.dayScoreManual ? merged.dayScore : averages.dayScore;

            return {
              ...merged,
              ...averages,
              dayScore: nextDayScore,
              dayScoreManual: merged.dayScoreManual,
              updatedAt: Date.now()
            };
          });
        });
      }
    };

    return React.createElement('div', { className: 'area-side right-col' },
      React.createElement('div', { className: 'compact-sleep compact-card' },
        React.createElement('div', { className: 'compact-card-header' }, '😴 СОН И САМОЧУВСТВИЕ'),

        // Ряд с двумя плашками
        React.createElement('div', { className: 'sleep-cards-row' },
          // Плашка СОН
          (() => {
            const yData = getYesterdayData();
            const sleepCompare = getCompareArrow(day.sleepQuality, yData?.sleepQuality);
            const sleepEmoji = getScoreEmoji(day.sleepQuality);
            const isPulse = (day.sleepQuality || 0) >= 9;

            // Умная подсказка при низкой оценке сна
            const sleepTip = (day.sleepQuality > 0 && day.sleepQuality <= 4)
              ? '💡 Попробуй: без экранов за час, прохладная комната'
              : null;

            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '🌙'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Сон')
              ),
              React.createElement('div', { className: 'sleep-card-times' },
                React.createElement('span', {
                  className: 'sleep-time-display clickable',
                  onClick: openSleepCheckin
                }, day.sleepStart || '—:—'),
                React.createElement('span', { className: 'sleep-arrow' }, '→'),
                React.createElement('span', {
                  className: 'sleep-time-display clickable',
                  onClick: openSleepCheckin
                }, day.sleepEnd || '—:—')
              ),
              // Качество сна — большой блок как у оценки дня
              React.createElement('div', {
                className: 'sleep-quality-display clickable' + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.sleepQuality) },
                onClick: openSleepCheckin
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  sleepEmoji && React.createElement('span', { className: 'score-emoji' }, sleepEmoji),
                  React.createElement('span', {
                    className: 'sleep-quality-value-big',
                    style: { color: getScoreTextColor(day.sleepQuality) }
                  }, day.sleepQuality || '—'),
                  React.createElement('span', { className: 'sleep-quality-max' }, '/ 10')
                ),
                // Compare with yesterday
                sleepCompare && React.createElement('span', {
                  className: 'score-compare',
                  style: { color: sleepCompare.color }
                }, sleepCompare.icon + ' vs вчера'),
                sleepH > 0 && React.createElement('span', { className: 'sleep-duration-hint' }, sleepH + ' ч сна')
              ),
              // Умная подсказка
              sleepTip && React.createElement('div', { className: 'smart-tip' }, sleepTip),
              React.createElement('textarea', {
                className: 'sleep-note',
                placeholder: 'Заметка...',
                value: day.sleepNote || '',
                rows: day.sleepNote && day.sleepNote.includes('\n') ? Math.min(day.sleepNote.split('\n').length, 4) : 1,
                onChange: e => setDay(prev => ({ ...prev, sleepNote: e.target.value, updatedAt: Date.now() }))
              })
            );
          })(),

          // Плашка ОЦЕНКА ДНЯ
          (() => {
            const yData = getYesterdayData();
            const scoreCompare = getCompareArrow(day.dayScore, yData?.dayScore);
            const scoreEmoji = getScoreEmoji(day.dayScore);
            const isPulse = (day.dayScore || 0) >= 9;

            // Время последнего приёма
            const meals = day.meals || [];
            const lastMeal = meals.length > 0 ? meals[meals.length - 1] : null;
            const lastMealTime = lastMeal?.time || null;

            // Корреляция сон→самочувствие (без dayTot, который ещё не объявлен)
            const sleepH = day.sleepHours || 0;
            const sleepCorrelation = sleepH > 0 && sleepH < 6
              ? '😴 Мало сна — будь внимателен к аппетиту'
              : sleepH >= 8
                ? '😴✓ Отличный сон!'
                : null;

            // Умная подсказка при низкой оценке дня
            const dayTip = (day.dayScore > 0 && day.dayScore <= 4)
              ? '💡 Маленькие шаги: прогулка 10 мин, стакан воды'
              : (day.stressAvg >= 4)
                ? '💡 Высокий стресс. Попробуй 5 мин дыхания'
                : null;

            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '📊'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Оценка дня')
              ),
              // dayScore: авто из mood/wellbeing/stress, но можно поправить вручную
              React.createElement('div', {
                className: 'day-score-display' + (day.dayScore ? ' clickable' : '') + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.dayScore) },
                onClick: openMorningMoodCheckin
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  scoreEmoji && React.createElement('span', { className: 'score-emoji' }, scoreEmoji),
                  React.createElement('span', {
                    className: 'day-score-value-big',
                    style: { color: getScoreTextColor(day.dayScore) }
                  }, day.dayScore || '—'),
                  React.createElement('span', { className: 'day-score-max' }, '/ 10')
                ),
                // Compare with yesterday
                scoreCompare && React.createElement('span', {
                  className: 'score-compare',
                  style: { color: scoreCompare.color }
                }, scoreCompare.icon + ' vs вчера'),
                // Показываем "✨ авто" или "✏️ ручная" в зависимости от источника
                day.dayScoreManual
                  ? React.createElement('span', {
                    className: 'day-score-manual-hint',
                    onClick: (e) => {
                      e.stopPropagation();
                      // Сброс на авто
                      setDay(prev => {
                        const averages = calculateDayAverages(prev.meals, prev.trainings, prev);
                        return { ...prev, dayScore: averages.dayScore, dayScoreManual: false };
                      });
                    }
                  }, '✏️ сбросить')
                  : (day.moodAvg || day.wellbeingAvg || day.stressAvg) &&
                  React.createElement('span', { className: 'day-score-auto-hint' }, '✨ авто')
              ),
              React.createElement('div', {
                className: 'day-mood-row clickable',
                onClick: openMorningMoodCheckin
              },
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '😊'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Настроение'),
                  React.createElement('span', { className: 'mood-card-value' }, day.moodAvg || '—')
                ),
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '💪'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Самочувствие'),
                  React.createElement('span', { className: 'mood-card-value' }, day.wellbeingAvg || '—')
                ),
                React.createElement('div', { className: 'mood-card' },
                  React.createElement('span', { className: 'mood-card-icon' }, '😰'),
                  React.createElement('span', { className: 'mood-card-label' }, 'Стресс'),
                  React.createElement('span', { className: 'mood-card-value' }, day.stressAvg || '—')
                )
              ),
              // Время последнего приёма и корреляция
              (lastMealTime || sleepCorrelation) && React.createElement('div', { className: 'day-insights-row' },
                lastMealTime && React.createElement('span', { className: 'day-insight' }, '🍽️ ' + lastMealTime),
                sleepCorrelation && React.createElement('span', { className: 'day-insight correlation' }, sleepCorrelation)
              ),
              // Умная подсказка
              dayTip && React.createElement('div', { className: 'smart-tip' }, dayTip),
              React.createElement('textarea', {
                className: 'sleep-note',
                placeholder: 'Заметка...',
                value: day.dayComment || '',
                rows: day.dayComment && day.dayComment.includes('\n') ? Math.min(day.dayComment.split('\n').length, 4) : 1,
                onChange: e => setDay(prev => ({ ...prev, dayComment: e.target.value, updatedAt: Date.now() }))
              })
            );
          })()
        )
      ),

      // Карточка замеров тела
      React.createElement('div', {
        className: 'measurements-card compact-card' + (measurementsNeedUpdate ? ' measurements-card--needs-update' : ''),
        onClick: (e) => {
          // Клик по карточке открывает редактор (если не по кнопке)
          if (!e.target.closest('button')) {
            openMeasurementsEditor();
          }
        },
        style: { cursor: 'pointer' }
      },
        React.createElement('div', { className: 'measurements-card__header' },
          React.createElement('div', { className: 'measurements-card__title' },
            React.createElement('span', { className: 'measurements-card__icon' }, '📐'),
            React.createElement('span', null, 'ЗАМЕРЫ ТЕЛА'),
            measurementsNeedUpdate && React.createElement('span', { className: 'measurements-card__badge' }, '📏 Пора обновить')
          ),
          React.createElement('div', { className: 'measurements-card__header-right' },
            React.createElement('button', { className: 'measurements-card__edit', onClick: openMeasurementsEditor }, 'Изменить')
          )
        ),

        // Содержимое
        (measurementsByField.some(f => f.value !== null) || measurementsHistory.length > 0)
          ? React.createElement('div', { className: 'measurements-card__list' },
            measurementsByField.map((f) => React.createElement('div', {
              key: f.key,
              className: 'measurements-card__row' + (f.warn ? ' measurements-card__row--warn' : '')
            },
              // Верхняя строка: иконка, название, значение, дельта, предупреждение
              React.createElement('div', { className: 'measurements-card__main' },
                React.createElement('div', { className: 'measurements-card__label' },
                  React.createElement('span', { className: 'measurements-card__label-icon' }, f.icon),
                  React.createElement('span', null, f.label)
                ),
                React.createElement('div', { className: 'measurements-card__values' },
                  React.createElement('span', { className: 'measurements-card__value' }, f.value !== null ? (Math.round(f.value * 10) / 10) + ' см' : '—'),
                  f.delta !== null && React.createElement('span', {
                    className: 'measurements-card__delta ' + (f.delta > 0 ? 'up' : f.delta < 0 ? 'down' : '')
                  }, (f.delta > 0 ? '↑ +' : f.delta < 0 ? '↓ ' : '') + (Math.round(f.delta * 10) / 10) + ' см'),
                  f.warn && React.createElement('span', { className: 'measurements-card__warn' }, '⚠️')
                )
              ),
              // Sparkline на отдельной строке с датами
              f.points && f.points.length >= 2 && React.createElement('div', { className: 'measurements-card__spark-row' },
                renderMeasurementSpark(f.points)
              )
            )),
            // Прогресс за месяц
            measurementsMonthlyProgress && React.createElement('div', { className: 'measurements-card__monthly' },
              '📊 За период: ',
              measurementsMonthlyProgress.map((p, i) =>
                React.createElement('span', {
                  key: p.label,
                  className: 'measurements-card__monthly-item' + (p.diff < 0 ? ' down' : p.diff > 0 ? ' up' : '')
                },
                  (i > 0 ? ', ' : '') + p.label + ' ' + (p.diff > 0 ? '+' : '') + p.diff + ' см'
                )
              )
            )
          )
          : React.createElement('div', { className: 'measurements-card__empty' },
            React.createElement('div', { className: 'measurements-card__empty-icon' }, '📏'),
            React.createElement('div', { className: 'measurements-card__empty-text' }, 'Добавьте замеры раз в неделю'),
            React.createElement('button', { className: 'measurements-card__button', onClick: openMeasurementsEditor }, 'Заполнить замеры')
          ),

        React.createElement('div', { className: 'measurements-card__footer' },
          measurementsLastDateFormatted && React.createElement('span', { className: 'measurements-card__footer-date' }, 'Последний замер: ' + measurementsLastDateFormatted)
        )
      )
    );
  };
})();


/* ===== heys_day_cycle_card_v1.js ===== */
// heys_day_cycle_card_v1.js — extracted cycle card renderer

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayCycleCard = HEYS.dayCycleCard || {};

  HEYS.dayCycleCard.renderCycleCard = function renderCycleCard(ctx) {
    const {
      React,
      showCycleCard,
      cyclePhase,
      cycleEditMode,
      setCycleEditMode,
      day,
      saveCycleDay,
      clearCycleDay
    } = ctx || {};

    if (!showCycleCard) return null;

    return React.createElement('div', {
      className: 'cycle-card compact-card' + (cycleEditMode ? ' cycle-card--editing' : ''),
      key: 'cycle-card'
    },
      // Если есть данные — показываем фазу
      cyclePhase ? React.createElement(React.Fragment, null,
        React.createElement('div', {
          className: 'cycle-card__header',
          onClick: () => setCycleEditMode(!cycleEditMode)
        },
          React.createElement('span', { className: 'cycle-card__icon' }, cyclePhase.icon),
          React.createElement('span', { className: 'cycle-card__title' }, cyclePhase.shortName),
          React.createElement('span', { className: 'cycle-card__day' }, 'День ' + day.cycleDay),
          React.createElement('span', { className: 'cycle-card__edit-hint' }, '✏️')
        ),
        !cycleEditMode && React.createElement('div', { className: 'cycle-card__info' },
          cyclePhase.kcalMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' },
            '🔥 ' + (cyclePhase.kcalMultiplier > 1 ? '+' : '') + Math.round((cyclePhase.kcalMultiplier - 1) * 100) + '% ккал'
          ),
          cyclePhase.waterMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' },
            '💧 +' + Math.round((cyclePhase.waterMultiplier - 1) * 100) + '% вода'
          ),
          cyclePhase.insulinWaveMultiplier !== 1 && React.createElement('span', { className: 'cycle-card__badge' },
            '📈 +' + Math.round((cyclePhase.insulinWaveMultiplier - 1) * 100) + '% волна'
          )
        )
      )
      // Если нет данных — показываем "Указать"
      : React.createElement('div', {
        className: 'cycle-card__header cycle-card__header--empty',
        onClick: () => setCycleEditMode(true)
      },
        React.createElement('span', { className: 'cycle-card__icon' }, '🌸'),
        React.createElement('span', { className: 'cycle-card__title' }, 'Особый период'),
        React.createElement('span', { className: 'cycle-card__empty-hint' }, 'Указать день →')
      ),

      // Режим редактирования — кнопки выбора дня
      cycleEditMode && React.createElement('div', { className: 'cycle-card__edit' },
        React.createElement('div', { className: 'cycle-card__days' },
          [1, 2, 3, 4, 5, 6, 7].map(d =>
            React.createElement('button', {
              key: d,
              className: 'cycle-card__day-btn' + (day.cycleDay === d ? ' cycle-card__day-btn--active' : ''),
              onClick: () => saveCycleDay(d)
            }, d)
          )
        ),
        React.createElement('div', { className: 'cycle-card__actions' },
          day.cycleDay && React.createElement('button', {
            className: 'cycle-card__clear-btn',
            onClick: clearCycleDay
          }, 'Сбросить'),
          React.createElement('button', {
            className: 'cycle-card__cancel-btn',
            onClick: () => setCycleEditMode(false)
          }, 'Отмена')
        )
      )
    );
  };
})();

/* ===== heys_day_weight_trends_v1.js ===== */
// heys_day_weight_trends_v1.js — extracted weight trend/sparkline computations

(function () {
  const root = (typeof window !== 'undefined' ? window : globalThis) || {};
  const HEYS = (root.HEYS = root.HEYS || {});

  HEYS.dayWeightTrends = HEYS.dayWeightTrends || {};

  HEYS.dayWeightTrends.computeWeightTrends = function computeWeightTrends(ctx) {
    const {
      React,
      date,
      day,
      chartPeriod,
      prof,
      fmtDate,
      r1,
      HEYS: heysCtx
    } = ctx || {};

    const H = heysCtx || HEYS;

    const weightTrend = React.useMemo(() => {
      try {
        const today = new Date(date);
        const weights = [];
        const weightsClean = [];
        const clientId = (H && H.currentClientId) || '';
        let hasRetentionDays = false;

        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const scopedKey = clientId
            ? 'heys_' + clientId + '_dayv2_' + dateStr
            : 'heys_dayv2_' + dateStr;

          let dayData = null;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            }
          } catch (e) {}

          if (dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0) {
            const cycleDayValue = dayData.cycleDay || null;
            const cycleExclude = H.Cycle?.shouldExcludeFromWeightTrend?.(cycleDayValue) || false;
            const refeedExclude = H.Refeed?.shouldExcludeFromWeightTrend?.(dayData) || false;
            const shouldExclude = cycleExclude || refeedExclude;

            const weightEntry = {
              date: dateStr,
              weight: +dayData.weightMorning,
              dayIndex: 6 - i,
              cycleDay: cycleDayValue,
              hasRetention: shouldExclude
            };

            weights.push(weightEntry);

            if (shouldExclude) {
              hasRetentionDays = true;
            } else {
              weightsClean.push(weightEntry);
            }
          }
        }

        if (weights.length < 2) return null;

        const useClean = weightsClean.length >= 2 && hasRetentionDays;
        const dataForTrend = useClean ? weightsClean : weights;

        dataForTrend.sort((a, b) => a.date.localeCompare(b.date));

        const n = dataForTrend.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          const x = dataForTrend[i].dayIndex;
          const y = dataForTrend[i].weight;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }

        const denominator = n * sumX2 - sumX * sumX;
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));

        const firstWeight = dataForTrend[0].weight;
        const lastWeight = dataForTrend[dataForTrend.length - 1].weight;
        const diff = lastWeight - firstWeight;

        let arrow = '→';
        let direction = 'same';
        if (clampedSlope > 0.03) { arrow = '⬆️'; direction = 'up'; }
        else if (clampedSlope < -0.03) { arrow = '⬇️'; direction = 'down'; }

        const sign = diff > 0 ? '+' : '';
        const format = typeof r1 === 'function' ? r1(diff) : Math.round(diff * 10) / 10;
        const text = arrow + ' ' + sign + format + ' кг';

        return {
          text,
          diff,
          direction,
          slope: clampedSlope,
          dataPoints: n,
          isCleanTrend: useClean,
          retentionDaysExcluded: hasRetentionDays ? weights.length - weightsClean.length : 0
        };
      } catch (e) {
        return null;
      }
    }, [date, day?.weightMorning, day?.cycleDay]);

    const monthForecast = React.useMemo(() => {
      if (!weightTrend || weightTrend.slope === undefined) return null;

      const monthChange = weightTrend.slope * 30;

      if (Math.abs(monthChange) < 0.3 || weightTrend.dataPoints < 3) return null;

      const sign = monthChange > 0 ? '+' : '';
      const format = typeof r1 === 'function' ? r1(monthChange) : Math.round(monthChange * 10) / 10;
      return {
        text: '~' + sign + format + ' кг/мес',
        direction: monthChange < 0 ? 'down' : monthChange > 0 ? 'up' : 'same'
      };
    }, [weightTrend]);

    const weightSparklineData = React.useMemo(() => {
      try {
        const realToday = new Date(date + 'T12:00:00');
        const realTodayStr = date;
        const days = [];
        const clientId = (H && H.currentClientId) || '';

        const todayCycleDay = day?.cycleDay || null;

        const getDayWeight = (dateStr) => {
          const scopedKey = clientId
            ? 'heys_' + clientId + '_dayv2_' + dateStr
            : 'heys_dayv2_' + dateStr;

          try {
            const raw = localStorage.getItem(scopedKey);
            if (!raw) return null;
            const dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            if (dayData?.weightMorning > 0) {
              const cycleDayValue = dayData.cycleDay || null;
              const retentionInfo = H.Cycle?.getWaterRetentionInfo?.(cycleDayValue) || { hasRetention: false };
              const trainings = dayData.trainings || [];
              const hasTraining = trainings.some(t => t?.z?.some(z => z > 0));
              const trainingTypes = trainings
                .filter(t => t?.z?.some(z => z > 0))
                .map(t => t.type || 'cardio');
              return {
                weight: +dayData.weightMorning,
                cycleDay: cycleDayValue,
                hasWaterRetention: retentionInfo.hasRetention,
                retentionSeverity: retentionInfo.severity,
                retentionAdvice: retentionInfo.advice,
                hasTraining,
                trainingTypes
              };
            }
          } catch (e) {}
          return null;
        };

        let firstDataDay = null;
        const maxLookback = 60;
        for (let i = maxLookback; i >= 0; i--) {
          const d = new Date(realToday);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);

          if (dateStr === realTodayStr) {
            if (+day?.weightMorning > 0) {
              firstDataDay = dateStr;
              break;
            }
          } else {
            const data = getDayWeight(dateStr);
            if (data) {
              firstDataDay = dateStr;
              break;
            }
          }
        }

        if (!firstDataDay) return [];

        const firstDataDate = new Date(firstDataDay);
        const daysSinceFirstData = Math.floor((realToday - firstDataDate) / (24 * 60 * 60 * 1000)) + 1;

        let startDate;
        let daysToShow;

        if (daysSinceFirstData >= chartPeriod - 1) {
          startDate = new Date(realToday);
          startDate.setDate(startDate.getDate() - (chartPeriod - 2));
          daysToShow = chartPeriod - 1;
        } else {
          startDate = firstDataDate;
          daysToShow = daysSinceFirstData;
        }

        for (let i = 0; i < daysToShow; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr;

          if (isRealToday) {
            const todayWeight = +day?.weightMorning || 0;
            if (todayWeight > 0) {
              const retentionInfo = H.Cycle?.getWaterRetentionInfo?.(todayCycleDay) || { hasRetention: false };
              const trainings = day?.trainings || [];
              const hasTraining = trainings.some(t => t?.z?.some(z => z > 0));
              const trainingTypes = trainings
                .filter(t => t?.z?.some(z => z > 0))
                .map(t => t.type || 'cardio');
              days.push({
                date: dateStr,
                weight: todayWeight,
                isToday: true,
                dayNum: dateStr.slice(-2).replace(/^0/, ''),
                cycleDay: todayCycleDay,
                hasWaterRetention: retentionInfo.hasRetention,
                retentionSeverity: retentionInfo.severity,
                retentionAdvice: retentionInfo.advice,
                hasTraining,
                trainingTypes
              });
            }
            continue;
          }

          const data = getDayWeight(dateStr);
          if (data) {
            days.push({
              date: dateStr,
              weight: data.weight,
              isToday: false,
              dayNum: dateStr.slice(-2).replace(/^0/, ''),
              cycleDay: data.cycleDay,
              hasWaterRetention: data.hasWaterRetention,
              retentionSeverity: data.retentionSeverity,
              retentionAdvice: data.retentionAdvice,
              hasTraining: data.hasTraining,
              trainingTypes: data.trainingTypes
            });
          }
        }

        if (days.length >= 2) {
          const recentDays = days.slice(-7);
          const weights = recentDays.map(d => d.weight);
          const n = weights.length;

          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
          for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += weights[i];
            sumXY += i * weights[i];
            sumX2 += i * i;
          }
          const denominator = n * sumX2 - sumX * sumX;
          const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

          const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));

          const lastWeight = weights[n - 1];

          const tomorrowDate = new Date(realToday);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);
          const tomorrowStr = fmtDate(tomorrowDate);

          const forecastWeight = lastWeight + clampedSlope;

          days.push({
            date: tomorrowStr,
            weight: Math.round(forecastWeight * 10) / 10,
            isToday: false,
            isFuture: true,
            dayNum: tomorrowStr.slice(-2).replace(/^0/, ''),
            cycleDay: null,
            hasWaterRetention: false
          });
        }

        return days;
      } catch (e) {
        return [];
      }
    }, [date, day?.weightMorning, day?.cycleDay, chartPeriod, prof?.weightGoal]);

    const cycleHistoryAnalysis = React.useMemo(() => {
      if (!day?.cycleDay) return null;

      try {
        const lsGet = (key, def) => {
          const clientId = (H && H.currentClientId) || '';
          const scopedKey = clientId ? 'heys_' + clientId + '_' + key.replace('heys_', '') : key;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (!raw) return def;
            return raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
          } catch (e) { return def; }
        };

        const analysis = H.Cycle?.analyzeWaterRetentionHistory?.(6, lsGet);
        const forecast = H.Cycle?.getWeightNormalizationForecast?.(day?.cycleDay);

        return {
          ...analysis,
          forecast
        };
      } catch (e) {
        return null;
      }
    }, [day?.cycleDay]);

    return { weightTrend, monthForecast, weightSparklineData, cycleHistoryAnalysis };
  };
})();


/* ===== heys_day_picker_modals.js ===== */
// heys_day_picker_modals.js — Picker modals state + helpers
// Phase 13B of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_picker_modals] React is required');
        }
        return React;
    }

    function usePickerModalsState(deps) {
        const React = getReact();
        const {
            day,
            date,
            isMobile,
            setDay,
            expandOnlyMeal,
            sortMealsByTime,
            haptic,
            updateMealTimeRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            calculateDayAverages,
            U,
            pad2,
            uid,
            lsGet
        } = deps;

        if (!U) {
            throw new Error('[heys_day_picker_modals] dayUtils (U) is required');
        }

        const { useState, useMemo } = React;

        // === iOS-style Time Picker Modal (mobile only) ===
        const [showTimePicker, setShowTimePicker] = useState(false);
        const [pendingMealTime, setPendingMealTime] = useState({ hours: 12, minutes: 0 });
        const [editingMealIndex, setEditingMealIndex] = useState(null); // null = новый, число = редактирование
        const [editMode, setEditMode] = useState('new'); // 'new' | 'time' | 'mood'

        // === Training Picker Modal ===
        const [showTrainingPicker, setShowTrainingPicker] = useState(false);
        const [trainingPickerStep, setTrainingPickerStep] = useState(1); // 1 = тип+время, 2 = зоны, 3 = оценки
        const [editingTrainingIndex, setEditingTrainingIndex] = useState(null);
        const [pendingTrainingTime, setPendingTrainingTime] = useState({ hours: 10, minutes: 0 });
        const [pendingTrainingType, setPendingTrainingType] = useState('cardio');
        const [pendingTrainingZones, setPendingTrainingZones] = useState([0, 0, 0, 0]); // индексы для zoneMinutesValues
        const [pendingTrainingQuality, setPendingTrainingQuality] = useState(0); // 0-10
        const [pendingTrainingFeelAfter, setPendingTrainingFeelAfter] = useState(0); // 0-10
        const [pendingTrainingComment, setPendingTrainingComment] = useState('');

        // === Тренировки: количество видимых блоков ===
        const [visibleTrainings, setVisibleTrainings] = useState(() => {
            // Автоопределяем сколько тренировок показывать на основе данных
            const tr = day.trainings || [];
            const hasData = (t) => t && t.z && t.z.some(v => +v > 0);
            if (tr[2] && hasData(tr[2])) return 3;
            if (tr[1] && hasData(tr[1])) return 2;
            if (tr[0] && hasData(tr[0])) return 1;
            return 0; // Если нет тренировок — не показываем пустые блоки
        });

        // === Период графиков (7, 14, 30 дней) ===
        const [chartPeriod, setChartPeriod] = useState(7);
        const [chartTransitioning, setChartTransitioning] = useState(false);

        // Плавная смена периода с transition
        const handlePeriodChange = (period) => {
            if (chartPeriod !== period) {
                setChartTransitioning(true);
                if (typeof haptic === 'function') haptic('light');
                setTimeout(() => {
                    setChartPeriod(period);
                    setChartTransitioning(false);
                }, 150);
            }
        };

        // === Zone Minutes Picker Modal ===
        const [showZonePicker, setShowZonePicker] = useState(false);
        const [zonePickerTarget, setZonePickerTarget] = useState(null); // {trainingIndex, zoneIndex}
        const [pendingZoneMinutes, setPendingZoneMinutes] = useState(0);
        // Значения минут: 0-120
        const zoneMinutesValues = useMemo(() => Array.from({ length: 121 }, (_, i) => String(i)), []);

        // === Zone Formula Popup ===
        const [zoneFormulaPopup, setZoneFormulaPopup] = useState(null); // {ti, zi, x, y}

        // === Household Formula Popup ===
        const [householdFormulaPopup, setHouseholdFormulaPopup] = useState(null); // {hi, x, y}

        // === Sleep Quality Picker Modal ===
        const [showSleepQualityPicker, setShowSleepQualityPicker] = useState(false);
        const [pendingSleepQuality, setPendingSleepQuality] = useState(0);
        const [pendingSleepNote, setPendingSleepNote] = useState(''); // временный комментарий
        const sleepQualityValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);

        // === Day Score Picker Modal ===
        const [showDayScorePicker, setShowDayScorePicker] = useState(false);
        const [pendingDayScore, setPendingDayScore] = useState(0);
        const [pendingDayComment, setPendingDayComment] = useState(''); // временный комментарий
        const dayScoreValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);

        // === Weight/Deficit Picker flags (compat for uiState) ===
        const [showWeightPicker, setShowWeightPicker] = useState(false);
        const [showDeficitPicker, setShowDeficitPicker] = useState(false);

        // Используем глобальный WheelColumn
        const WheelColumn = HEYS.WheelColumn;

        // Типы тренировок для Training Picker Modal
        const trainingTypes = [
            { id: 'cardio', icon: '🏃', label: 'Кардио' },
            { id: 'strength', icon: '🏋️', label: 'Силовая' },
            { id: 'hobby', icon: '⚽', label: 'Активное хобби' }
        ];

        // Импортируем константы из dayUtils (единый источник правды)
        const NIGHT_HOUR_THRESHOLD = U.NIGHT_HOUR_THRESHOLD || 3;
        const HOURS_ORDER = U.HOURS_ORDER || (() => {
            const order = [];
            for (let h = 3; h < 24; h++) order.push(h);
            for (let h = 0; h < 3; h++) order.push(h);
            return order;
        })();

        // Значения для колеса (с подписями для ночных часов)
        const hoursValues = useMemo(() => {
            return HOURS_ORDER.map(h => pad2(h));
        }, [HOURS_ORDER, pad2]);

        // Конвертация: индекс колеса → реальные часы
        const wheelIndexToHour = U.wheelIndexToHour || ((idx) => HOURS_ORDER[idx] ?? idx);
        // Конвертация: реальные часы → индекс колеса
        const hourToWheelIndex = U.hourToWheelIndex || ((hour) => {
            const normalizedHour = hour >= 24 ? hour - 24 : hour;
            const idx = HOURS_ORDER.indexOf(normalizedHour);
            return idx >= 0 ? idx : 0;
        });

        // Проверка: выбранный час относится к ночным (00-02)
        const isNightHourSelected = useMemo(() => {
            const realHour = wheelIndexToHour(pendingMealTime.hours);
            return realHour >= 0 && realHour < NIGHT_HOUR_THRESHOLD;
        }, [pendingMealTime.hours, wheelIndexToHour, NIGHT_HOUR_THRESHOLD]);

        // Форматированная дата для отображения
        const currentDateLabel = useMemo(() => {
            const d = new Date(date);
            const dayNum = d.getDate();
            const month = d.toLocaleDateString('ru-RU', { month: 'short' });
            return `${dayNum} ${month}`;
        }, [date]);

        const minutesValues = WheelColumn?.presets?.minutes || [];
        const ratingValues = WheelColumn?.presets?.rating || [];

        // Состояние для второго слайда (самочувствие)
        const [pickerStep, setPickerStep] = useState(1); // 1 = время, 2 = самочувствие
        const [pendingMealMood, setPendingMealMood] = useState({ mood: 5, wellbeing: 5, stress: 5 });
        // Состояние для типа приёма в модалке создания
        const [pendingMealType, setPendingMealType] = useState(null); // null = авто

        // Направление анимации: 'forward' или 'back'
        const [animDirection, setAnimDirection] = useState('forward');

        // === Emoji анимация в рейтинг модалке ===
        const [emojiAnimating, setEmojiAnimating] = useState({ mood: '', wellbeing: '', stress: '' });

        // Helper: получить градиент цвета по оценке 1-10
        function getScoreGradient(score) {
            if (!score || score === 0) return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; // серый
            if (score <= 2) return 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)'; // красный
            if (score <= 4) return 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'; // оранжевый
            if (score <= 5) return 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)'; // жёлтый
            if (score <= 7) return 'linear-gradient(135deg, #d9f99d 0%, #bef264 100%)'; // лайм
            if (score <= 9) return 'linear-gradient(135deg, #bbf7d0 0%, #86efac 100%)'; // зелёный
            return 'linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%)'; // изумрудный (10)
        }

        function getScoreTextColor(score) {
            if (!score || score === 0) return '#9ca3af'; // серый
            if (score <= 2) return '#dc2626'; // красный
            if (score <= 4) return '#ea580c'; // оранжевый
            if (score <= 5) return '#ca8a04'; // жёлтый
            if (score <= 7) return '#65a30d'; // лайм
            if (score <= 9) return '#16a34a'; // зелёный
            return '#059669'; // изумрудный
        }

        // Helper: emoji по оценке 1-10
        function getScoreEmoji(score) {
            if (!score || score === 0) return '';
            if (score <= 2) return '😫';
            if (score <= 4) return '😕';
            if (score <= 5) return '😐';
            if (score <= 6) return '🙂';
            if (score <= 7) return '😊';
            if (score <= 8) return '😄';
            if (score <= 9) return '🤩';
            return '🌟'; // 10 = идеально
        }

        // Helper: получить данные вчера
        function getYesterdayData() {
            const yesterday = new Date(date);
            yesterday.setDate(yesterday.getDate() - 1);
            const yStr = yesterday.toISOString().split('T')[0];
            return lsGet('heys_dayv2_' + yStr, null);
        }

        // Helper: сравнение с вчера (↑ / ↓ / =)
        function getCompareArrow(todayVal, yesterdayVal) {
            if (!todayVal || !yesterdayVal) return null;
            const diff = todayVal - yesterdayVal;
            if (diff > 0) return { icon: '↑', diff: '+' + diff, color: '#16a34a' };
            if (diff < 0) return { icon: '↓', diff: String(diff), color: '#dc2626' };
            return { icon: '=', diff: '0', color: '#6b7280' };
        }

        // === Sleep Quality Picker functions ===
        function openSleepQualityPicker() {
            const currentQuality = day.sleepQuality || 0;
            // Находим индекс: 0='—', 1='1', 2='1.5', 3='2', ...
            const idx = currentQuality === 0 ? 0 : sleepQualityValues.indexOf(String(currentQuality));
            setPendingSleepQuality(idx >= 0 ? idx : 0);
            setShowSleepQualityPicker(true);
        }

        function confirmSleepQualityPicker() {
            const value = pendingSleepQuality === 0 ? 0 : parseInt(sleepQualityValues[pendingSleepQuality]);
            setDay(prevDay => {
                let newSleepNote = prevDay.sleepNote || '';
                if (pendingSleepNote.trim()) {
                    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    const entry = `[${time}] ${pendingSleepNote.trim()}`;
                    newSleepNote = newSleepNote ? newSleepNote + '\n' + entry : entry;
                }
                return { ...prevDay, sleepQuality: value, sleepNote: newSleepNote, updatedAt: Date.now() };
            });
            setPendingSleepNote('');
            setShowSleepQualityPicker(false);
        }

        function cancelSleepQualityPicker() {
            setPendingSleepNote('');
            setShowSleepQualityPicker(false);
        }

        // === Day Score Picker functions ===
        function openDayScorePicker() {
            const currentScore = day.dayScore || 0;
            const idx = currentScore === 0 ? 0 : dayScoreValues.indexOf(String(currentScore));
            setPendingDayScore(idx >= 0 ? idx : 0);
            setShowDayScorePicker(true);
        }

        function confirmDayScorePicker() {
            const value = pendingDayScore === 0 ? 0 : parseInt(dayScoreValues[pendingDayScore]);
            setDay(prevDay => {
                const autoScore = calculateDayAverages(prevDay.meals, prevDay.trainings, prevDay).dayScore;
                const isManual = value !== 0 && value !== autoScore;
                let newDayComment = prevDay.dayComment || '';
                if (pendingDayComment.trim()) {
                    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    const entry = `[${time}] ${pendingDayComment.trim()}`;
                    newDayComment = newDayComment ? newDayComment + '\n' + entry : entry;
                }
                return { ...prevDay, dayScore: value, dayScoreManual: isManual, dayComment: newDayComment, updatedAt: Date.now() };
            });
            setPendingDayComment('');
            setShowDayScorePicker(false);
        }

        function cancelDayScorePicker() {
            setPendingDayComment('');
            setShowDayScorePicker(false);
        }

        function goToMoodStep() {
            setAnimDirection('forward');
            setPickerStep(2);
        }

        function goBackToTimeStep() {
            setAnimDirection('back');
            setPickerStep(1);
        }

        // Открыть модалку для нового приёма
        function openTimePickerForNewMeal() {
            const now = new Date();
            // Конвертируем реальные часы в индекс колеса
            setPendingMealTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });

            // Оценки: если есть предыдущие приёмы — берём от последнего, иначе 5
            const meals = day.meals || [];
            if (meals.length > 0) {
                // Берём последний приём по времени (они отсортированы)
                const lastMeal = meals[meals.length - 1];
                setPendingMealMood({
                    mood: lastMeal.mood || 5,
                    wellbeing: lastMeal.wellbeing || 5,
                    stress: lastMeal.stress || 5
                });
            } else {
                // Первый приём в день — дефолт 5
                setPendingMealMood({ mood: 5, wellbeing: 5, stress: 5 });
            }

            setPendingMealType(null); // Сбрасываем на авто
            setEditingMealIndex(null);
            setEditMode('new');
            setPickerStep(1);
            setShowTimePicker(true);
        }

        // Открыть модалку для редактирования времени и типа (новая модульная)
        function openTimeEditor(mealIndex) {
            const meal = day.meals[mealIndex];
            if (!meal) return;

            // Используем новую модульную модалку если доступна
            if (isMobile && HEYS.MealStep?.showEditMeal) {
                HEYS.MealStep.showEditMeal({
                    meal,
                    mealIndex,
                    dateKey: date,
                    onComplete: ({ mealIndex: idx, time, mealType, name }) => {
                        // Обновляем приём
                        const newUpdatedAt = Date.now();
                        if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay(prevDay => {
                            const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                i === idx ? { ...m, time, mealType, name } : m
                            );
                            // Сортируем по времени
                            const sortedMeals = sortMealsByTime(updatedMeals);
                            return { ...prevDay, meals: sortedMeals, updatedAt: newUpdatedAt };
                        });

                        if (window.HEYS?.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-time-updated');
                        }
                        // Success toast
                        HEYS.Toast?.success('Приём сохранён');
                    }
                });
            } else {
                // Fallback на старую модалку
                const timeParts = (meal.time || '').split(':');
                const hours = parseInt(timeParts[0]) || new Date().getHours();
                const minutes = parseInt(timeParts[1]) || 0;

                // Конвертируем реальные часы в индекс колеса
                setPendingMealTime({ hours: hourToWheelIndex(hours), minutes });
                setEditingMealIndex(mealIndex);
                setEditMode('time');
                setPickerStep(1);
                setShowTimePicker(true);
            }
        }

        // Открыть модалку для редактирования только оценок
        function openMoodEditor(mealIndex) {
            const meal = day.meals[mealIndex];
            if (!meal) return;

            // Используем новую модульную модалку если доступна
            if (isMobile && HEYS.MealStep?.showEditMood) {
                HEYS.MealStep.showEditMood({
                    meal,
                    mealIndex,
                    dateKey: date,
                    onComplete: ({ mealIndex: idx, mood, wellbeing, stress, comment }) => {
                        // Обновляем приём
                        const newUpdatedAt = Date.now();
                        if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay(prevDay => {
                            const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                i === idx ? { ...m, mood, wellbeing, stress, comment } : m
                            );
                            return { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };
                        });

                        if (window.HEYS?.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-mood-updated');
                        }
                        // Success toast
                        HEYS.Toast?.success('Оценки сохранены');
                    }
                });
            } else {
                // Fallback на старую модалку
                setPendingMealMood({
                    mood: meal.mood ? ratingValues.indexOf(String(meal.mood)) : 5,
                    wellbeing: meal.wellbeing ? ratingValues.indexOf(String(meal.wellbeing)) : 5,
                    stress: meal.stress ? ratingValues.indexOf(String(meal.stress)) : 5
                });
                setEditingMealIndex(mealIndex);
                setEditMode('mood');
                setPickerStep(2);
                setShowTimePicker(true);
            }
        }

        // Подтверждение только времени (для редактирования)
        function confirmTimeEdit() {
            // Конвертируем индекс колеса в реальные часы
            let realHours = wheelIndexToHour(pendingMealTime.hours);
            // Ночные часы (00-02) записываем как 24-26
            if (realHours < NIGHT_HOUR_THRESHOLD) {
                realHours += 24;
            }
            const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
            // Используем функцию с автосортировкой
            const updateMealTime = updateMealTimeRef?.current;
            if (typeof updateMealTime === 'function') {
                updateMealTime(editingMealIndex, timeStr);
            }
            setShowTimePicker(false);
            setEditingMealIndex(null);
        }

        // Подтверждение только оценок (для редактирования)
        function confirmMoodEdit() {
            const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
            const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
            const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;
            setDay(prevDay => {
                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                    i === editingMealIndex ? { ...m, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal } : m
                );
                return { ...prevDay, meals: updatedMeals, updatedAt: Date.now() };
            });
            setShowTimePicker(false);
            setEditingMealIndex(null);
        }

        function confirmMealCreation() {
            // Конвертируем индекс колеса в реальные часы
            let realHours = wheelIndexToHour(pendingMealTime.hours);
            // Ночные часы (00-02) записываем как 24-26
            if (realHours < NIGHT_HOUR_THRESHOLD) {
                realHours += 24;
            }
            const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
            const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
            const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
            const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;

            if (editingMealIndex !== null) {
                setDay(prevDay => {
                    const updatedMeals = (prevDay.meals || []).map((m, i) =>
                        i === editingMealIndex
                            ? { ...m, time: timeStr, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal }
                            : m
                    );
                    const sortedMeals = sortMealsByTime(updatedMeals);
                    return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
                });
            } else {
                // Создание нового
                const newMeal = {
                    id: uid('m_'),
                    name: 'Приём',
                    time: timeStr,
                    mood: moodVal,
                    wellbeing: wellbeingVal,
                    stress: stressVal,
                    items: []
                };
                let newIndex = -1;
                let newMealsLen = 0;
                setDay(prevDay => {
                    const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
                    newIndex = newMeals.findIndex(m => m.id === newMeal.id);
                    newMealsLen = newMeals.length;
                    return { ...prevDay, meals: newMeals, updatedAt: Date.now() };
                });
                expandOnlyMeal(newIndex >= 0 ? newIndex : Math.max(0, newMealsLen - 1));
            }

            setShowTimePicker(false);
            setPickerStep(1);
            setEditingMealIndex(null);
            if (window.HEYS && window.HEYS.analytics) {
                window.HEYS.analytics.trackDataOperation(editingMealIndex !== null ? 'meal-updated' : 'meal-created');
            }
        }

        function cancelTimePicker() {
            setShowTimePicker(false);
            setPickerStep(1);
            setEditingMealIndex(null);
            setEditMode('new');
        }

        return {
            // State for pickers
            showTimePicker,
            pendingMealTime,
            setPendingMealTime,
            editingMealIndex,
            editMode,
            showTrainingPicker,
            setShowTrainingPicker,
            trainingPickerStep,
            setTrainingPickerStep,
            editingTrainingIndex,
            setEditingTrainingIndex,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            visibleTrainings,
            setVisibleTrainings,
            chartPeriod,
            chartTransitioning,
            handlePeriodChange,
            showZonePicker,
            setShowZonePicker,
            zonePickerTarget,
            setZonePickerTarget,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            zoneMinutesValues,
            zoneFormulaPopup,
            setZoneFormulaPopup,
            householdFormulaPopup,
            setHouseholdFormulaPopup,
            showSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            dayScoreValues,
            showWeightPicker,
            setShowWeightPicker,
            showDeficitPicker,
            setShowDeficitPicker,
            pickerStep,
            animDirection,
            pendingMealMood,
            setPendingMealMood,
            pendingMealType,
            setPendingMealType,
            emojiAnimating,
            setEmojiAnimating,

            // Helpers
            getScoreGradient,
            getScoreTextColor,
            getScoreEmoji,
            getYesterdayData,
            getCompareArrow,

            // Picker data
            WheelColumn,
            trainingTypes,
            hoursValues,
            minutesValues,
            ratingValues,
            isNightHourSelected,
            currentDateLabel,
            wheelIndexToHour,
            hourToWheelIndex,

            // Actions
            openSleepQualityPicker,
            confirmSleepQualityPicker,
            cancelSleepQualityPicker,
            openDayScorePicker,
            confirmDayScorePicker,
            cancelDayScorePicker,
            openTimePickerForNewMeal,
            openTimeEditor,
            openMoodEditor,
            goToMoodStep,
            goBackToTimeStep,
            confirmTimeEdit,
            confirmMoodEdit,
            confirmMealCreation,
            cancelTimePicker
        };
    }

    HEYS.dayPickerModals = {
        usePickerModalsState
    };

})(window);


/* ===== heys_day_animations.js ===== */
// heys_day_animations.js — Day animations (progress, confetti, shake)
// Phase 13C of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_animations] React is required');
        }
        return React;
    }

    function useDayAnimations(deps) {
        const React = getReact();
        const {
            eatenKcal,
            optimum,
            mobileSubTab,
            date,
            haptic,
            playSuccessSound
        } = deps;

        const { useState, useEffect, useRef } = React;
        const hapticFn = typeof haptic === 'function' ? haptic : (() => { });

        // === Confetti при достижении цели ===
        const [showConfetti, setShowConfetti] = useState(false);
        const confettiShownRef = useRef(false);
        const prevKcalRef = useRef(null);

        // === Анимации карточек при превышении/успехе ===
        const [shakeEaten, setShakeEaten] = useState(false);   // карточка "Съедено" — shake при превышении
        const [shakeOver, setShakeOver] = useState(false);     // карточка "Перебор" — shake при превышении
        const [pulseSuccess, setPulseSuccess] = useState(false); // карточка "Съедено" — pulse при успехе

        // === Progress animation ===
        const [animatedProgress, setAnimatedProgress] = useState(0);
        const [animatedKcal, setAnimatedKcal] = useState(0);
        const [animatedRatioPct, setAnimatedRatioPct] = useState(0); // Анимированный % для бейджа
        const [animatedMarkerPos, setAnimatedMarkerPos] = useState(0); // Позиция бейджа (всегда до 100%)
        const [isAnimating, setIsAnimating] = useState(false);

        // Refs для определения «реального» действия (добавили еду/рефид/сменили день)
        const prevDateTabRef = useRef(null); // "date|mobileSubTab"

        // === Анимация прогресса калорий при загрузке и при переключении на вкладку ===
        const animationRef = useRef(null);
        useEffect(() => {
            // Отменяем предыдущую анимацию
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }

            const dateTabKey = date + '|' + mobileSubTab;
            const isRealAction = (eatenKcal !== prevKcalRef.current) || (dateTabKey !== prevDateTabRef.current);

            // Обновляем refs
            prevKcalRef.current = eatenKcal;
            prevDateTabRef.current = dateTabKey;

            if (!isRealAction) {
                // Только optimum изменился (forceReload/normAbs пересчёт) — не сбрасываем бар,
                // просто пересчитываем финальную позицию мгновенно без transition
                const isOver = eatenKcal > optimum;
                const target = isOver
                    ? (optimum / eatenKcal) * 100
                    : (eatenKcal / optimum) * 100;
                const targetRatioPct = Math.round((eatenKcal / (optimum || 1)) * 100);
                const targetMarkerPos = isOver ? 100 : Math.min(target, 100);
                setIsAnimating(true); // Отключаем transition на время телепорта
                setAnimatedProgress(target);
                setAnimatedKcal(eatenKcal);
                setAnimatedRatioPct(targetRatioPct);
                setAnimatedMarkerPos(targetMarkerPos);
                requestAnimationFrame(() => setIsAnimating(false));
                return;
            }

            // Шаг 1: Сбрасываем к 0 мгновенно
            setIsAnimating(true);
            setAnimatedProgress(0);
            setAnimatedKcal(0);
            setAnimatedRatioPct(0);
            setAnimatedMarkerPos(0);

            // При переборе: зелёная часть = доля нормы от съеденного (optimum/eaten)
            // При норме: зелёная часть = доля съеденного от нормы (eaten/optimum)
            const isOver = eatenKcal > optimum;
            const target = isOver
                ? (optimum / eatenKcal) * 100  // При переборе: показываем долю нормы
                : (eatenKcal / optimum) * 100; // При норме: показываем прогресс к цели

            // Шаг 2: Ждём чтобы React применил width: 0, затем запускаем анимацию
            const timeoutId = setTimeout(() => {
                setIsAnimating(false); // Включаем transition обратно

                const duration = 1400;
                const startTime = performance.now();
                const targetKcal = eatenKcal; // Целевое значение калорий
                const targetRatioPct = Math.round((eatenKcal / (optimum || 1)) * 100); // Целевой % для бэджа
                // Бейдж: при переборе — едет до 100%, при норме — до конца заполненной линии
                const targetMarkerPos = isOver ? 100 : Math.min(target, 100);

                const animate = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    // Ease out cubic
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const current = target * eased;
                    const currentKcal = Math.round(targetKcal * eased);
                    const currentRatioPct = Math.round(targetRatioPct * eased);
                    const currentMarkerPos = targetMarkerPos * eased; // Позиция бейджа синхронизирована с линией
                    setAnimatedProgress(current);
                    setAnimatedKcal(currentKcal);
                    setAnimatedRatioPct(currentRatioPct);
                    setAnimatedMarkerPos(currentMarkerPos);

                    if (progress < 1) {
                        animationRef.current = requestAnimationFrame(animate);
                    } else {
                        setAnimatedKcal(targetKcal); // Финальное точное значение
                        setAnimatedRatioPct(targetRatioPct);
                        setAnimatedMarkerPos(targetMarkerPos); // Бейдж остаётся на конце линии
                    }
                };

                animationRef.current = requestAnimationFrame(animate);
            }, 50); // 50ms задержка для гарантированного применения width: 0

            return () => {
                clearTimeout(timeoutId);
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
            };
        }, [eatenKcal, optimum, mobileSubTab, date]); // date — сброс анимации при смене дня

        // 🔔 Shake после завершения анимации sparkline (последовательно: Съедено → Перебор)
        const shakeTimerRef = useRef(null);
        useEffect(() => {
            // Очищаем предыдущий таймер
            if (shakeTimerRef.current) {
                clearTimeout(shakeTimerRef.current);
            }

            const ratio = eatenKcal / (optimum || 1);
            const isSuccess = ratio >= 0.75 && ratio <= 1.1;
            const isExcess = ratio > 1.1;

            if (isExcess) {
                // ❌ Превышение — shake последовательно
                shakeTimerRef.current = setTimeout(() => {
                    setShakeEaten(true);
                    setTimeout(() => setShakeEaten(false), 500);

                    setTimeout(() => {
                        setShakeOver(true);
                        setTimeout(() => setShakeOver(false), 500);
                    }, 300);
                }, 5000);
            } else if (isSuccess) {
                // ✅ Успех — пульсация при загрузке
                shakeTimerRef.current = setTimeout(() => {
                    setPulseSuccess(true);
                    // Пульсация длится 1.5с (3 цикла по 0.5с)
                    setTimeout(() => setPulseSuccess(false), 1500);
                }, 5000);
            }

            return () => {
                if (shakeTimerRef.current) {
                    clearTimeout(shakeTimerRef.current);
                }
            };
        }, [date, eatenKcal, optimum]);

        // === Confetti при достижении 100% цели ===
        useEffect(() => {
            const progress = (eatenKcal / optimum) * 100;
            const prevProgress = (prevKcalRef.current / optimum) * 100;

            // Показываем confetti когда впервые достигаем 95-105% (зона успеха)
            if (progress >= 95 && progress <= 105 && prevProgress < 95 && !confettiShownRef.current) {
                confettiShownRef.current = true;
                setShowConfetti(true);
                hapticFn('success');
                if (typeof playSuccessSound === 'function') {
                    playSuccessSound(); // 🔔 Звук успеха!
                }

                // Скрываем через 3 секунды
                setTimeout(() => setShowConfetti(false), 3000);
            }

            // Сбрасываем флаг если уходим ниже 90%
            if (progress < 90) {
                confettiShownRef.current = false;
            }

            prevKcalRef.current = eatenKcal;
        }, [eatenKcal, optimum, playSuccessSound, hapticFn]);

        return {
            showConfetti,
            setShowConfetti,
            shakeEaten,
            shakeOver,
            pulseSuccess,
            animatedProgress,
            animatedKcal,
            animatedRatioPct,
            animatedMarkerPos,
            isAnimating
        };
    }

    HEYS.dayAnimations = {
        useDayAnimations
    };

})(window);


/* ===== heys_day_hero_metrics.js ===== */
// heys_day_hero_metrics.js — Hero metrics calculations (ratio status, colors)
// Phase 13D of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function computeHeroMetrics(params) {
        const {
            day,
            eatenKcal,
            optimum,
            dayTargetDef,
            r0,
            ratioZones
        } = params;
        const { factDefPct } = params || {};

        const rz = ratioZones || HEYS.ratioZones;

        const effectiveOptimumForCards = (() => {
            // 1. Refeed day — +35%
            if (day?.isRefeedDay && HEYS.Refeed) {
                return HEYS.Refeed.getRefeedOptimum(optimum, true);
            }
            // 2. Базовый optimum (долг будет учтён через displayOptimum позже)
            return optimum;
        })();

        const remainingKcal = r0(effectiveOptimumForCards - eatenKcal);
        const currentRatio = eatenKcal / (effectiveOptimumForCards || 1);

        function getEatenColor() {
            if (rz) {
                const zone = rz.getZone(currentRatio);
                const baseColor = zone.color;
                return {
                    bg: baseColor + '20',
                    text: zone.textColor === '#fff' ? baseColor : zone.textColor,
                    border: baseColor + '60'
                };
            }
            if (currentRatio < 0.5) return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
            if (currentRatio < 0.75) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
            if (currentRatio < 1.1) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
            if (currentRatio < 1.3) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
            return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
        }

        function getRemainingColor() {
            if (rz) {
                const zone = rz.getZone(currentRatio);
                const baseColor = zone.color;
                return {
                    bg: baseColor + '20',
                    text: zone.textColor === '#fff' ? baseColor : zone.textColor,
                    border: baseColor + '60'
                };
            }
            if (remainingKcal > 100) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
            if (remainingKcal >= 0) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
            return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
        }

        // Статус ratio для badge — АДАПТИВНЫЙ к времени дня
        function getRatioStatus() {
            if (eatenKcal === 0) {
                return { emoji: '👋', text: 'Хорошего дня!', color: '#64748b' };
            }

            const now = new Date();
            const currentHour = now.getHours();

            let expectedProgress;
            if (currentHour < 6) {
                expectedProgress = 0;
            } else if (currentHour <= 9) {
                expectedProgress = (currentHour - 6) * 0.08;
            } else if (currentHour <= 14) {
                expectedProgress = 0.24 + (currentHour - 9) * 0.10;
            } else if (currentHour <= 20) {
                expectedProgress = 0.74 + (currentHour - 14) * 0.04;
            } else {
                expectedProgress = 0.98;
            }

            const progressDiff = currentRatio - expectedProgress;

            if (currentRatio >= 1.3) {
                return { emoji: '🚨', text: 'Перебор!', color: '#ef4444' };
            }
            if (currentRatio >= 1.1) {
                return { emoji: '😅', text: 'Чуть больше', color: '#eab308' };
            }
            if (currentRatio >= 0.9 && currentRatio < 1.1) {
                return { emoji: '🔥', text: 'Идеально!', color: '#10b981' };
            }

            if (currentHour < 12) {
                if (currentRatio >= 0.1) {
                    return { emoji: '🌅', text: 'Хорошее начало!', color: '#22c55e' };
                }
                return { emoji: '☕', text: 'Время завтрака', color: '#64748b' };
            }

            if (currentHour < 15) {
                if (progressDiff >= -0.1) {
                    return { emoji: '👍', text: 'Так держать!', color: '#22c55e' };
                }
                if (progressDiff >= -0.25) {
                    return { emoji: '🍽️', text: 'Время обеда', color: '#eab308' };
                }
                return { emoji: '⚠️', text: 'Мало для обеда', color: '#f97316' };
            }

            if (currentHour < 19) {
                if (progressDiff >= -0.1) {
                    return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
                }
                if (progressDiff >= -0.2) {
                    return { emoji: '🍽️', text: 'Пора перекусить', color: '#eab308' };
                }
                return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
            }

            if (currentRatio >= 0.75) {
                return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
            }
            if (currentRatio >= 0.6) {
                return { emoji: '🍽️', text: 'Нужен ужин', color: '#eab308' };
            }
            if (currentRatio >= 0.4) {
                return { emoji: '⚠️', text: 'Мало калорий', color: '#f97316' };
            }
            return { emoji: '💀', text: 'Критически мало!', color: '#ef4444' };
        }

        function getDeficitColor() {
            const target = dayTargetDef;
            if (target === undefined || target === null) {
                return { bg: '#dcfce7', text: '#065f46', border: '#86efac' };
            }
            return (params.factDefPct <= target)
                ? { bg: '#dcfce7', text: '#065f46', border: '#86efac' }
                : { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' };
        }

        const deficitProgress = Math.min(100, Math.abs(factDefPct || 0) / 50 * 100);

        return {
            effectiveOptimumForCards,
            remainingKcal,
            currentRatio,
            eatenCol: getEatenColor(),
            remainCol: getRemainingColor(),
            defCol: getDeficitColor(),
            ratioStatus: getRatioStatus(),
            deficitProgress
        };
    }

    HEYS.dayHeroMetrics = {
        computeHeroMetrics
    };

})(window);


/* ===== heys_day_water_state.js ===== */
// heys_day_water_state.js — water goal + motivation + tooltip state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useWaterState(params) {
        const { React, day, prof, train1k, train2k, train3k, haptic } = params || {};
        const { useMemo, useState, useRef } = React || {};

        const safeDay = day || {};
        const safeProf = prof || {};

        const waterGoalBreakdown = useMemo(() => {
            const w = +safeDay.weightMorning || +safeProf.weight || 70;
            const age = +safeProf.age || 30;
            const isFemale = safeProf.sex === 'female';
            const coef = isFemale ? 28 : 30;

            const baseRaw = w * coef;

            let ageFactor = 1;
            let ageNote = '';
            if (age >= 60) { ageFactor = 0.9; ageNote = '−10% (60+)'; }
            else if (age >= 40) { ageFactor = 0.95; ageNote = '−5% (40+)'; }
            const base = baseRaw * ageFactor;

            const stepsCount = Math.floor((safeDay.steps || 0) / 5000);
            const stepsBonus = stepsCount * 250;

            const trainCount = [train1k, train2k, train3k].filter(k => k > 50).length;
            const trainBonus = trainCount * 500;

            const month = new Date().getMonth();
            const isHotSeason = month >= 5 && month <= 7;
            const seasonBonus = isHotSeason ? 300 : 0;
            const seasonNote = isHotSeason ? '☀️ Лето' : '';

            const cycleMultiplier = HEYS.Cycle?.getWaterMultiplier?.(safeDay.cycleDay) || 1;
            const cycleBonus = cycleMultiplier > 1 ? Math.round(base * (cycleMultiplier - 1)) : 0;
            const cycleNote = cycleBonus > 0 ? '🌸 Особый период' : '';

            const total = Math.round((base + stepsBonus + trainBonus + seasonBonus + cycleBonus) / 100) * 100;
            const finalGoal = Math.max(1500, Math.min(5000, total));

            return {
                weight: w,
                coef,
                baseRaw: Math.round(baseRaw),
                ageFactor,
                ageNote,
                base: Math.round(base),
                stepsCount,
                stepsBonus,
                trainCount,
                trainBonus,
                seasonBonus,
                seasonNote,
                cycleBonus,
                cycleNote,
                total: Math.round(total),
                finalGoal
            };
        }, [safeDay.weightMorning, safeDay.steps, safeDay.cycleDay, train1k, train2k, train3k, safeProf.weight, safeProf.age, safeProf.sex]);

        const waterGoal = waterGoalBreakdown.finalGoal;

        const waterMotivation = useMemo(() => {
            const pct = ((safeDay.waterMl || 0) / waterGoal) * 100;
            if (pct >= 100) return { emoji: '🏆', text: 'Цель достигнута!' };
            if (pct >= 75) return { emoji: '🔥', text: 'Почти у цели!' };
            if (pct >= 50) return { emoji: '🎯', text: 'Половина пути!' };
            if (pct >= 25) return { emoji: '🌊', text: 'Хороший старт!' };
            return { emoji: '💧', text: 'Добавь воды' };
        }, [safeDay.waterMl, waterGoal]);

        const waterLastDrink = useMemo(() => {
            const lastTime = safeDay.lastWaterTime;
            if (!lastTime) return null;

            const now = Date.now();
            const diffMs = now - lastTime;
            const diffMin = Math.floor(diffMs / 60000);

            if (diffMin < 60) {
                return { minutes: diffMin, text: diffMin + ' мин назад', isLong: false };
            }

            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;
            const isLong = hours >= 2;
            const text = hours + 'ч' + (mins > 0 ? ' ' + mins + 'мин' : '') + ' назад';

            return { hours, minutes: mins, text, isLong };
        }, [safeDay.lastWaterTime]);

        const [showWaterTooltip, setShowWaterTooltip] = useState(false);
        const waterLongPressRef = useRef(null);

        function handleWaterRingDown() {
            waterLongPressRef.current = setTimeout(() => {
                setShowWaterTooltip(true);
                haptic && haptic('light');
            }, 400);
        }
        function handleWaterRingUp() {
            if (waterLongPressRef.current) {
                clearTimeout(waterLongPressRef.current);
                waterLongPressRef.current = null;
            }
        }
        function handleWaterRingLeave() {
            handleWaterRingUp();
            if (!('ontouchstart' in window)) {
                setShowWaterTooltip(false);
            }
        }

        return {
            waterGoalBreakdown,
            waterGoal,
            waterMotivation,
            waterLastDrink,
            showWaterTooltip,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave
        };
    }

    HEYS.dayWaterState = {
        useWaterState
    };
})(window);


/* ===== heys_day_daily_table.js ===== */
// heys_day_daily_table.js — daily totals table helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildDailyTableState(params) {
        const {
            React,
            dayTot,
            normAbs,
            getDailyNutrientColor,
            getDailyNutrientTooltip
        } = params || {};

        const factKeys = ['kcal', 'carbs', 'simple', 'complex', 'prot', 'fat', 'bad', 'good', 'trans', 'fiber', 'gi', 'harm'];

        function fmtVal(key, v) {
            const num = +v || 0;
            if (!num) return '-';
            if (key === 'harm') return Math.round(num * 10) / 10;
            return Math.round(num);
        }

        function devVal(k) {
            const n = +normAbs[k] || 0;
            const f = +dayTot[k] || 0;
            if (!n) return '-';
            const d = ((f - n) / n) * 100;
            return (d > 0 ? '+' : '') + Math.round(d) + '%';
        }

        function devCell(k) {
            const n = +normAbs[k] || 0;
            if (!n) return React.createElement('td', { key: 'ds-dv' + k }, '-');
            const f = +dayTot[k] || 0;
            const d = ((f - n) / n) * 100;
            const diff = Math.round(d);
            const color = diff > 0 ? '#dc2626' : (diff < 0 ? '#059669' : '#111827');
            const fw = diff !== 0 ? 600 : 400;
            return React.createElement('td', { key: 'ds-dv' + k, style: { color, fontWeight: fw } }, (diff > 0 ? '+' : '') + diff + '%');
        }

        function factCell(k) {
            const f = +dayTot[k] || 0;
            const n = +normAbs[k] || 0;
            if (!n) return React.createElement('td', { key: 'ds-fv' + k }, fmtVal(k, f));
            const over = f > n, under = f < n; let color = null; let fw = 600;
            if (['bad', 'trans'].includes(k)) { if (under) color = '#059669'; else if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'simple') { if (under) color = '#059669'; else if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'complex') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
            else if (k === 'fiber') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
            else if (k === 'kcal') { if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'prot') { if (over) color = '#059669'; else fw = 400; }
            else if (k === 'carbs' || k === 'fat') { if (over) color = '#dc2626'; else fw = 400; }
            else if (k === 'good') { if (over) color = '#059669'; else if (under) color = '#dc2626'; else fw = 400; }
            else if (k === 'gi' || k === 'harm') { if (over) color = '#dc2626'; else if (under) color = '#059669'; else fw = 400; }
            else { fw = 400; }
            const style = color ? { color, fontWeight: fw } : { fontWeight: fw };
            return React.createElement('td', { key: 'ds-fv' + k, style }, fmtVal(k, f));
        }

        function normVal(k) {
            const n = +normAbs[k] || 0;
            return n ? fmtVal(k, n) : '-';
        }

        const per100Head = ['', '', '', '', '', '', '', '', '', ''];
        const factHead = ['ккал', 'У', 'Прост', 'Сл', 'Б', 'Ж', 'ВрЖ', 'ПолЖ', 'СупЖ', 'Клет', 'ГИ', 'Вред', ''];

        const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

        const daySummary = HEYS.dayDailySummary?.renderDailySummary?.({
            React,
            dayTot,
            normAbs,
            fmtVal,
            pct,
            getDailyNutrientColor,
            getDailyNutrientTooltip
        }) || null;

        return {
            factKeys,
            fmtVal,
            devVal,
            devCell,
            factCell,
            normVal,
            per100Head,
            factHead,
            pct,
            daySummary
        };
    }

    HEYS.dayDailyTable = {
        buildDailyTableState
    };
})(window);


/* ===== heys_day_steps_ui.js ===== */
// heys_day_steps_ui.js — steps goal + slider state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useStepsState(params) {
        const { React, day, prof, getProfile, setDay } = params || {};
        const { useState, useEffect, useRef } = React || {};

        const safeDay = day || {};
        const safeProf = prof || {};

        const [savedStepsGoal, setSavedStepsGoal] = useState(() => safeProf.stepsGoal || 7000);
        const initialStepsSyncDoneRef = useRef(false);
        const lastDispatchedStepsRef = useRef(safeDay.steps || 0);
        const latestStepsRef = useRef(safeDay.steps || 0);

        useEffect(() => {
            const handleProfileUpdate = (e) => {
                if (e.type === 'heysSyncCompleted') {
                    if (!initialStepsSyncDoneRef.current) {
                        initialStepsSyncDoneRef.current = true;
                        return;
                    }
                }

                const stepsFromEvent = e?.detail?.stepsGoal;
                if (stepsFromEvent != null) {
                    setSavedStepsGoal(prev => prev === stepsFromEvent ? prev : stepsFromEvent);
                    return;
                }
                const profileFromStorage = getProfile ? getProfile() : {};
                if (profileFromStorage.stepsGoal) {
                    setSavedStepsGoal(prev => prev === profileFromStorage.stepsGoal ? prev : profileFromStorage.stepsGoal);
                }
            };

            window.addEventListener('heysSyncCompleted', handleProfileUpdate);
            window.addEventListener('heys:profile-updated', handleProfileUpdate);

            return () => {
                window.removeEventListener('heysSyncCompleted', handleProfileUpdate);
                window.removeEventListener('heys:profile-updated', handleProfileUpdate);
            };
        }, [getProfile]);

        const stepsGoal = Math.max(1, savedStepsGoal || 7000);
        const stepsMax = 20000;
        const stepsValue = safeDay.steps || 0;

        const stepsPercent = stepsValue <= stepsGoal
            ? (stepsValue / stepsGoal) * 80
            : 80 + ((stepsValue - stepsGoal) / (stepsMax - stepsGoal)) * 20;

        const stepsColorPercent = Math.min(100, (stepsValue / stepsGoal) * 100);

        const getStepsColor = (pct) => {
            if (pct < 30) {
                const t = pct / 30;
                const r = Math.round(239 - t * (239 - 234));
                const g = Math.round(68 + t * (179 - 68));
                const b = Math.round(68 - t * (68 - 8));
                return `rgb(${r}, ${g}, ${b})`;
            }
            const t = (pct - 30) / 70;
            const r = Math.round(234 - t * (234 - 34));
            const g = Math.round(179 + t * (197 - 179));
            const b = Math.round(8 + t * (94 - 8));
            return `rgb(${r}, ${g}, ${b})`;
        };

        const stepsColor = getStepsColor(stepsColorPercent);

        const handleStepsDrag = (e) => {
            const slider = e.currentTarget.closest('.steps-slider');
            if (!slider) return;

            const rect = slider.getBoundingClientRect();
            const updateSteps = (clientX) => {
                const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
                const percent = (x / rect.width) * 100;
                let newSteps;
                if (percent <= 80) {
                    newSteps = Math.round(((percent / 80) * stepsGoal) / 10) * 10;
                } else {
                    const extraPercent = (percent - 80) / 20;
                    newSteps = stepsGoal + Math.round((extraPercent * (stepsMax - stepsGoal)) / 100) * 100;
                }
                latestStepsRef.current = Math.min(stepsMax, Math.max(0, newSteps));
                setDay(prev => ({ ...prev, steps: latestStepsRef.current, updatedAt: Date.now() }));
            };

            const onMove = (ev) => {
                if (ev.cancelable) ev.preventDefault();
                const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
                updateSteps(clientX);
            };

            const onEnd = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);

                const latestSteps = latestStepsRef.current || 0;
                if (latestSteps !== lastDispatchedStepsRef.current) {
                    lastDispatchedStepsRef.current = latestSteps;
                    window.dispatchEvent(new CustomEvent('heysStepsUpdated', {
                        detail: { steps: latestSteps }
                    }));
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            updateSteps(clientX);
        };

        return {
            stepsGoal,
            stepsMax,
            stepsValue,
            stepsPercent,
            stepsColor,
            handleStepsDrag
        };
    }

    HEYS.dayStepsUI = {
        useStepsState
    };
})(window);


/* ===== heys_day_sparkline_state.js ===== */
// heys_day_sparkline_state.js — sparkline state + render data helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useSparklineState(params) {
        const { React } = params || {};
        const { useState, useRef } = React || {};

        const [sliderPoint, setSliderPoint] = useState(null);
        const sliderPrevPointRef = useRef(null);

        const [sparklineZoom, setSparklineZoom] = useState(1);
        const [sparklinePan, setSparklinePan] = useState(0);
        const sparklineZoomRef = useRef({ initialDistance: 0, initialZoom: 1 });

        const [sparklineRefreshKey, setSparklineRefreshKey] = useState(0);

        const [brushRange, setBrushRange] = useState(null);
        const [brushing, setBrushing] = useState(false);
        const brushStartRef = useRef(null);

        return {
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            sparklineZoom,
            setSparklineZoom,
            sparklinePan,
            setSparklinePan,
            sparklineZoomRef,
            sparklineRefreshKey,
            setSparklineRefreshKey,
            brushRange,
            setBrushRange,
            brushing,
            setBrushing,
            brushStartRef
        };
    }

    function computeSparklineRenderData(params) {
        const {
            React,
            date,
            day,
            eatenKcal,
            chartPeriod,
            optimum,
            prof,
            products,
            dayTot,
            sparklineRefreshKey,
            fmtDate,
            HEYS: heysCtx
        } = params || {};

        const sparklineData = heysCtx?.daySparklineData?.computeSparklineData?.({
            React,
            date,
            day,
            eatenKcal,
            chartPeriod,
            optimum,
            prof,
            products,
            dayTot,
            sparklineRefreshKey,
            fmtDate,
            HEYS: heysCtx
        }) || [];

        const sparklineRenderData = React.useMemo(() => {
            const isTourActive = heysCtx?.OnboardingTour && heysCtx.OnboardingTour.isActive();
            const demo = isTourActive ? heysCtx.OnboardingTour.getDemoData('sparkline') : null;
            if (!demo) return sparklineData;
            const today = new Date();
            return demo.map((pt, i) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - i));
                const dateStr = d.getDate().toString().padStart(2, '0') + '.' + (d.getMonth() + 1).toString().padStart(2, '0');
                const dayOfWeek = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
                return {
                    date: dayOfWeek,
                    fullDate: dateStr,
                    kcal: pt.kcal,
                    target: pt.target,
                    isRefeed: false
                };
            });
        }, [sparklineData]);

        return {
            sparklineData,
            sparklineRenderData
        };
    }

    function buildSparklineRenderers(params) {
        const {
            React,
            haptic,
            openExclusivePopup,
            sparklineState,
            prof
        } = params || {};

        const {
            sparklineZoom,
            setSparklineZoom,
            sparklineZoomRef,
            sparklinePan,
            setSparklinePan,
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            brushing,
            setBrushing,
            brushRange,
            setBrushRange,
            brushStartRef
        } = sparklineState || {};

        const renderSparkline = (data, goal) => HEYS.daySparklines?.renderSparkline?.({
            data,
            goal,
            React,
            haptic,
            openExclusivePopup,
            sparklineZoom,
            setSparklineZoom,
            sparklineZoomRef,
            sparklinePan,
            setSparklinePan,
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            brushing,
            setBrushing,
            brushRange,
            setBrushRange,
            brushStartRef
        });

        const renderWeightSparkline = (data) => HEYS.daySparklines?.renderWeightSparkline?.({
            data,
            React,
            prof,
            openExclusivePopup,
            haptic
        });

        return {
            renderSparkline,
            renderWeightSparkline
        };
    }

    HEYS.daySparklineState = {
        useSparklineState,
        computeSparklineRenderData,
        buildSparklineRenderers
    };
})(window);


/* ===== heys_day_edit_grams_state.js ===== */
// heys_day_edit_grams_state.js — edit grams modal state helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useEditGramsState(params) {
        const { React, haptic } = params || {};
        const { useState, useMemo, useRef } = React || {};

        const [editGramsTarget, setEditGramsTarget] = useState(null);
        const [editGramsValue, setEditGramsValue] = useState(100);
        const editGramsInputRef = useRef(null);

        const editPortions = useMemo(() => {
            if (!editGramsTarget?.product) return [];
            const product = editGramsTarget.product;
            if (product.portions?.length) return product.portions;
            const M = global.HEYS?.models;
            if (M?.getAutoPortions) {
                return M.getAutoPortions(product.name);
            }
            return [];
        }, [editGramsTarget?.product]);

        const editLastPortionGrams = useMemo(() => {
            if (!editGramsTarget?.product?.id) return null;
            const M = global.HEYS?.models;
            return M?.getLastPortion ? M.getLastPortion(editGramsTarget.product.id) : null;
        }, [editGramsTarget?.product?.id]);

        function handleEditGramsDrag(e) {
            e.preventDefault();
            const slider = e.currentTarget;
            const rect = slider.getBoundingClientRect();
            const minGrams = 10;
            const maxGrams = 500;

            const updateFromPosition = (clientX) => {
                const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
                const percent = x / rect.width;
                const grams = Math.round((minGrams + percent * (maxGrams - minGrams)) / 10) * 10;
                setEditGramsValue(Math.max(minGrams, Math.min(maxGrams, grams)));
                try { navigator.vibrate?.(3); } catch (e) { }
            };

            updateFromPosition(e.touches ? e.touches[0].clientX : e.clientX);

            const handleMove = (moveEvent) => {
                if (moveEvent.cancelable) moveEvent.preventDefault();
                updateFromPosition(moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX);
            };

            const handleEnd = () => {
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleEnd);
                document.removeEventListener('touchmove', handleMove);
                document.removeEventListener('touchend', handleEnd);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd);
        }

        return {
            editGramsTarget,
            setEditGramsTarget,
            editGramsValue,
            setEditGramsValue,
            editGramsInputRef,
            editPortions,
            editLastPortionGrams,
            handleEditGramsDrag
        };
    }

    HEYS.dayEditGramsState = {
        useEditGramsState
    };
})(window);


/* ===== heys_day_caloric_display_state.js ===== */
// heys_day_caloric_display_state.js — displayOptimum + ratio status helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useCaloricDisplayState(params) {
        const {
            React,
            day,
            setDay,
            optimum,
            eatenKcal,
            caloricDebt,
            r0
        } = params || {};

        const displayOptimum = React.useMemo(() => {
            if (day?.isRefeedDay && HEYS.Refeed) {
                return HEYS.Refeed.getRefeedOptimum(optimum, true);
            }
            if (caloricDebt && caloricDebt.dailyBoost > 0) {
                return optimum + caloricDebt.dailyBoost;
            }
            if (caloricDebt && caloricDebt.dailyReduction > 0 && !caloricDebt.hasDebt) {
                return optimum - caloricDebt.dailyReduction;
            }
            return optimum;
        }, [optimum, caloricDebt, day?.isRefeedDay]);

        React.useEffect(() => {
            if (!displayOptimum || displayOptimum <= 0) return;
            const roundedEaten = r0(eatenKcal);
            const needsUpdate = day.savedDisplayOptimum !== displayOptimum || day.savedEatenKcal !== roundedEaten;
            if (!needsUpdate) return;

            setDay(prev => ({
                ...prev,
                savedDisplayOptimum: displayOptimum,
                savedEatenKcal: roundedEaten,
                updatedAt: Date.now(),
            }));
        }, [displayOptimum, eatenKcal, day.savedDisplayOptimum, day.savedEatenKcal, setDay, r0]);

        const displayRemainingKcal = React.useMemo(() => {
            return r0(displayOptimum - eatenKcal);
        }, [displayOptimum, eatenKcal, r0]);

        const displayCurrentRatio = React.useMemo(() => {
            return eatenKcal / (displayOptimum || optimum || 1);
        }, [eatenKcal, displayOptimum, optimum]);

        const displayRatioStatus = React.useMemo(() => {
            if (eatenKcal === 0) {
                return { emoji: '👋', text: 'Хорошего дня!', color: '#64748b' };
            }

            const ratio = displayCurrentRatio;

            if (ratio >= 1.3) {
                return { emoji: '🚨', text: 'Перебор!', color: '#ef4444' };
            }
            if (ratio >= 1.1) {
                return { emoji: '😅', text: 'Чуть больше', color: '#eab308' };
            }

            const now = new Date();
            const currentHour = now.getHours();

            let expectedProgress;
            if (currentHour < 6) {
                expectedProgress = 0;
            } else if (currentHour <= 9) {
                expectedProgress = (currentHour - 6) * 0.08;
            } else if (currentHour <= 14) {
                expectedProgress = 0.24 + (currentHour - 9) * 0.10;
            } else if (currentHour <= 20) {
                expectedProgress = 0.74 + (currentHour - 14) * 0.04;
            } else {
                expectedProgress = 0.98;
            }

            const progressDiff = ratio - expectedProgress;

            if (currentHour < 12) {
                if (progressDiff >= -0.15) return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
                if (progressDiff >= -0.25) return { emoji: '🍽️', text: 'Пора кушать', color: '#eab308' };
                return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
            }

            if (currentHour < 15) {
                if (progressDiff >= -0.1) return { emoji: '👍', text: 'Так держать!', color: '#22c55e' };
                if (progressDiff >= -0.25) return { emoji: '🍽️', text: 'Время обеда', color: '#eab308' };
                return { emoji: '⚠️', text: 'Мало для обеда', color: '#f97316' };
            }

            if (currentHour < 19) {
                if (progressDiff >= -0.1) return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
                if (progressDiff >= -0.2) return { emoji: '🍽️', text: 'Пора перекусить', color: '#eab308' };
                return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
            }

            if (ratio >= 0.75) return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
            if (ratio >= 0.6) return { emoji: '🍽️', text: 'Нужен ужин', color: '#eab308' };
            if (ratio >= 0.4) return { emoji: '⚠️', text: 'Мало калорий', color: '#f97316' };
            return { emoji: '💀', text: 'Критически мало!', color: '#ef4444' };
        }, [eatenKcal, displayCurrentRatio]);

        return {
            displayOptimum,
            displayRemainingKcal,
            displayCurrentRatio,
            displayRatioStatus
        };
    }

    HEYS.dayCaloricDisplayState = {
        useCaloricDisplayState
    };
})(window);


/* ===== heys_day_page_shell.js ===== */
// heys_day_page_shell.js — DayTab page shell renderer
if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    function renderDayPage(params) {
        const {
            isReadOnly,
            pullProgress,
            isRefreshing,
            refreshStatus,
            pullThreshold,
            isMobile,
            mobileSubTab,
            orphanAlert,
            statsBlock,
            waterCard,
            compactActivity,
            sideBlock,
            cycleCard,
            date,
            day,
            caloricDebt,
            eatenKcal,
            optimum,
            addMeal,
            addWater,
            diarySection,
            adviceTrigger,
            adviceRelevant,
            toastVisible,
            dismissToast,
            getSortedGroupedAdvices,
            dismissedAdvices,
            hiddenUntilTomorrow,
            lastDismissedAdvice,
            adviceSwipeState,
            expandedAdviceId,
            handleAdviceToggleExpand,
            rateAdvice,
            handleAdviceSwipeStart,
            handleAdviceSwipeMove,
            handleAdviceSwipeEnd,
            handleAdviceLongPressStart,
            handleAdviceLongPressEnd,
            registerAdviceCardRef,
            handleAdviceListTouchStart,
            handleAdviceListTouchMove,
            handleAdviceListTouchEnd,
            handleDismissAll,
            dismissAllAnimation,
            toastsEnabled,
            toggleToastsEnabled,
            adviceSoundEnabled,
            toggleAdviceSoundEnabled,
            scheduleAdvice,
            undoLastDismiss,
            clearLastDismissed,
            ADVICE_CATEGORY_NAMES,
            AdviceCard,
            displayedAdvice,
            adviceExpanded,
            toastSwiped,
            toastSwipeX,
            toastDetailsOpen,
            toastAppearedAtRef,
            toastScheduledConfirm,
            haptic,
            setToastDetailsOpen,
            setAdviceExpanded,
            setAdviceTrigger,
            handleToastTouchStart,
            handleToastTouchMove,
            handleToastTouchEnd,
            handleToastUndo,
            handleToastSchedule,
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
            getProductFromItem,
            getMealType,
            getMealQualityScore,
            editGramsTarget,
            editGramsValue,
            editPortions,
            editLastPortionGrams,
            editGramsInputRef,
            setEditGramsValue,
            confirmEditGramsModal,
            cancelEditGramsModal,
            handleEditGramsDrag,
            zoneFormulaPopup,
            closeZoneFormula,
            householdFormulaPopup,
            closeHouseholdFormula,
            showZonePicker,
            cancelZonePicker,
            confirmZonePicker,
            zonePickerTarget,
            zoneMinutesValues,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            showTrainingPicker,
            cancelTrainingPicker,
            confirmTrainingPicker,
            trainingPickerStep,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            trainingTypes,
            kcalMin,
            TR,
            mets,
            zoneNames,
            weight,
            kcalPerMin,
            r0,
            householdActivities,
            openTrainingPicker,
            openHouseholdPicker,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            showSleepQualityPicker,
            cancelSleepQualityPicker,
            confirmSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            cancelDayScorePicker,
            confirmDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            calculateDayAverages,
            mealQualityPopup,
            setMealQualityPopup,
            getSmartPopupPosition,
            createSwipeHandlers,
            M
        } = params || {};

        return React.createElement(React.Fragment, null,
            React.createElement('div', {
                className: 'page page-day'
            },
                isReadOnly && HEYS.Paywall?.ReadOnlyBanner && React.createElement(HEYS.Paywall.ReadOnlyBanner, {
                    compact: false,
                    onClick: () => HEYS.Paywall?.showPaywall?.('trial_expired')
                }),

                (pullProgress > 0 || isRefreshing) && React.createElement('div', {
                    className: 'pull-indicator'
                        + (isRefreshing ? ' refreshing' : '')
                        + (refreshStatus === 'ready' ? ' ready' : '')
                        + (refreshStatus === 'success' ? ' success' : ''),
                    style: {
                        height: isRefreshing ? 56 : Math.max(pullProgress, 0),
                        opacity: isRefreshing ? 1 : Math.min(pullProgress / 35, 1)
                    }
                },
                    React.createElement('div', { className: 'pull-spinner' },
                        refreshStatus === 'success'
                            ? React.createElement('svg', {
                                className: 'pull-spinner-ring ready',
                                viewBox: '0 0 28 28',
                                style: { stroke: 'var(--success)' }
                            },
                                React.createElement('path', {
                                    d: 'M7 14l5 5 9-9',
                                    strokeWidth: 3,
                                    fill: 'none',
                                    strokeLinecap: 'round',
                                    strokeLinejoin: 'round'
                                })
                            )
                            : refreshStatus === 'error'
                                ? React.createElement('svg', {
                                    className: 'pull-spinner-ring',
                                    viewBox: '0 0 28 28',
                                    style: { stroke: 'var(--err, #ef4444)' }
                                },
                                    React.createElement('path', {
                                        d: 'M8 8l12 12M20 8l-12 12',
                                        strokeWidth: 3,
                                        fill: 'none',
                                        strokeLinecap: 'round'
                                    })
                                )
                                : refreshStatus === 'syncing'
                                    ? React.createElement('svg', {
                                        className: 'pull-spinner-ring spinning',
                                        viewBox: '0 0 28 28'
                                    },
                                        React.createElement('circle', {
                                            cx: 14, cy: 14, r: 10,
                                            strokeDasharray: '45 20',
                                            strokeDashoffset: 0
                                        })
                                    )
                                    : React.createElement('svg', {
                                        className: 'pull-spinner-ring' + (refreshStatus === 'ready' ? ' ready' : ''),
                                        viewBox: '0 0 28 28',
                                        style: {
                                            transform: `rotate(${-90 + Math.min(pullProgress / pullThreshold, 1) * 180}deg)`,
                                            transition: 'transform 0.1s ease-out'
                                        }
                                    },
                                        React.createElement('circle', {
                                            cx: 14, cy: 14, r: 10,
                                            strokeDasharray: 63,
                                            strokeDashoffset: 63 - (Math.min(pullProgress / pullThreshold, 1) * 63)
                                        })
                                    )
                    ),
                    React.createElement('span', {
                        className: 'pull-text'
                            + (refreshStatus === 'ready' ? ' ready' : '')
                            + (refreshStatus === 'syncing' ? ' syncing' : '')
                    },
                        refreshStatus === 'success' ? 'Готово!'
                            : refreshStatus === 'error' ? 'Ошибка синхронизации'
                                : refreshStatus === 'syncing' ? 'Синхронизация...'
                                    : refreshStatus === 'ready' ? 'Отпустите для обновления'
                                        : 'Потяните для обновления'
                    )
                ),

                (!isMobile || mobileSubTab === 'stats') && orphanAlert,
                (!isMobile || mobileSubTab === 'stats') && statsBlock,
                (!isMobile || mobileSubTab === 'stats') && waterCard,
                (!isMobile || mobileSubTab === 'stats') && compactActivity,
                (!isMobile || mobileSubTab === 'stats') && sideBlock,
                (!isMobile || mobileSubTab === 'stats') && cycleCard,

                isMobile && (mobileSubTab === 'stats' || mobileSubTab === 'diary') && React.createElement('div', {
                    className: 'fab-group',
                    id: 'tour-fab-buttons'
                },
                    React.createElement('button', {
                        className: 'meal-fab',
                        onClick: () => {
                            if (mobileSubTab === 'stats' && window.HEYS?.App?.setTab) {
                                window.HEYS.App.setTab('diary');
                                setTimeout(() => {
                                    const heading = document.getElementById('diary-heading');
                                    if (heading) {
                                        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                    setTimeout(() => addMeal(), 800);
                                }, 200);
                            } else {
                                const heading = document.getElementById('diary-heading');
                                if (heading) {
                                    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                                setTimeout(() => addMeal(), 800);
                            }
                        },
                        'aria-label': 'Добавить приём пищи'
                    }, '🍽️'),
                    React.createElement('button', {
                        className: 'water-fab',
                        onClick: () => addWater(200),
                        'aria-label': 'Добавить стакан воды'
                    }, '🥛')
                ),

                diarySection,

                HEYS.dayAdviceListUI?.renderManualAdviceList?.({
                    React,
                    adviceTrigger,
                    adviceRelevant,
                    toastVisible,
                    dismissToast,
                    getSortedGroupedAdvices,
                    dismissedAdvices,
                    hiddenUntilTomorrow,
                    lastDismissedAdvice,
                    adviceSwipeState,
                    expandedAdviceId,
                    handleAdviceToggleExpand,
                    rateAdvice,
                    handleAdviceSwipeStart,
                    handleAdviceSwipeMove,
                    handleAdviceSwipeEnd,
                    handleAdviceLongPressStart,
                    handleAdviceLongPressEnd,
                    registerAdviceCardRef,
                    handleAdviceListTouchStart,
                    handleAdviceListTouchMove,
                    handleAdviceListTouchEnd,
                    handleDismissAll,
                    dismissAllAnimation,
                    toastsEnabled,
                    toggleToastsEnabled,
                    adviceSoundEnabled,
                    toggleAdviceSoundEnabled,
                    scheduleAdvice,
                    undoLastDismiss,
                    clearLastDismissed,
                    ADVICE_CATEGORY_NAMES,
                    AdviceCard
                }) || null,

                HEYS.dayAdviceListUI?.renderEmptyAdviceToast?.({
                    React,
                    adviceTrigger,
                    toastVisible,
                    dismissToast
                }) || null,

                HEYS.dayAdviceToastUI?.renderAutoAdviceToast?.({
                    React,
                    adviceTrigger,
                    displayedAdvice,
                    toastVisible,
                    adviceExpanded,
                    toastSwiped,
                    toastSwipeX,
                    toastDetailsOpen,
                    toastAppearedAtRef,
                    toastScheduledConfirm,
                    haptic,
                    setToastDetailsOpen,
                    setAdviceExpanded,
                    setAdviceTrigger,
                    handleToastTouchStart,
                    handleToastTouchMove,
                    handleToastTouchEnd,
                    handleToastUndo,
                    handleToastSchedule
                }) || null,

                null,

                HEYS.dayTimeMoodPicker?.renderTimeMoodPicker?.({
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
                }) || null,

                HEYS.dayEditGramsModal?.renderEditGramsModal?.({
                    editGramsTarget,
                    editGramsValue,
                    editPortions,
                    editLastPortionGrams,
                    editGramsInputRef,
                    setEditGramsValue,
                    confirmEditGramsModal,
                    cancelEditGramsModal,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd,
                    handleEditGramsDrag,
                    haptic
                }) || null,

                HEYS.dayTrainingPopups?.renderTrainingPopups?.({
                    zoneFormulaPopup,
                    closeZoneFormula,
                    householdFormulaPopup,
                    closeHouseholdFormula,
                    showZonePicker,
                    cancelZonePicker,
                    confirmZonePicker,
                    zonePickerTarget,
                    zoneMinutesValues,
                    pendingZoneMinutes,
                    setPendingZoneMinutes,
                    showTrainingPicker,
                    cancelTrainingPicker,
                    confirmTrainingPicker,
                    trainingPickerStep,
                    pendingTrainingZones,
                    setPendingTrainingZones,
                    pendingTrainingTime,
                    setPendingTrainingTime,
                    pendingTrainingType,
                    setPendingTrainingType,
                    trainingTypes,
                    hoursValues,
                    minutesValues,
                    kcalMin,
                    TR,
                    mets,
                    zoneNames,
                    weight,
                    kcalPerMin,
                    r0,
                    householdActivities,
                    openTrainingPicker,
                    openHouseholdPicker,
                    WheelColumn,
                    haptic,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd,
                    pendingTrainingQuality,
                    setPendingTrainingQuality,
                    pendingTrainingFeelAfter,
                    setPendingTrainingFeelAfter,
                    pendingTrainingComment,
                    setPendingTrainingComment
                }) || null,

                HEYS.daySleepScorePopups?.renderSleepScorePopups?.({
                    showSleepQualityPicker,
                    cancelSleepQualityPicker,
                    confirmSleepQualityPicker,
                    pendingSleepQuality,
                    setPendingSleepQuality,
                    pendingSleepNote,
                    setPendingSleepNote,
                    sleepQualityValues,
                    showDayScorePicker,
                    cancelDayScorePicker,
                    confirmDayScorePicker,
                    pendingDayScore,
                    setPendingDayScore,
                    pendingDayComment,
                    setPendingDayComment,
                    day,
                    calculateDayAverages,
                    handleSheetTouchStart,
                    handleSheetTouchMove,
                    handleSheetTouchEnd
                }) || null
            ),
            HEYS.dayMealQualityPopup?.renderMealQualityPopup?.({
                mealQualityPopup,
                setMealQualityPopup,
                getSmartPopupPosition,
                createSwipeHandlers,
                M,
                pIndex,
                getProductFromItem,
                optimum,
                getMealType,
                getMealQualityScore
            })
        );
    }

    HEYS.dayPageShell = {
        renderDayPage
    };
})(window);


/* ===== heys_day_engagement_effects.js ===== */
// heys_day_engagement_effects.js — streak/lipolysis/achievement effects

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useEngagementEffects(params) {
        const {
            React,
            day,
            weekHeatmapData,
            showConfetti,
            setShowConfetti,
            haptic,
            insulinWaveData,
            mealsChartData,
            setShowFirstPerfectAchievement,
            setNewMealAnimatingIndex
        } = params || {};

        const streakConfettiShownRef = React.useRef(false);
        const prevQualityStreakRef = React.useRef(0);
        const lowScoreHapticRef = React.useRef(false);
        const prevInsulinStatusRef = React.useRef(null);
        const lipolysisRecordTriggeredRef = React.useRef(false);
        const prevMealsCountRef = React.useRef(0);
        const firstPerfectShownRef = React.useRef(false);

        // Confetti при streak 7+ дней
        React.useEffect(() => {
            if (weekHeatmapData?.streak >= 7 && !streakConfettiShownRef.current && !showConfetti) {
                streakConfettiShownRef.current = true;
                setShowConfetti(true);
                haptic('success');
                setTimeout(() => setShowConfetti(false), 3000);
            }
            if ((weekHeatmapData?.streak || 0) < 7) {
                streakConfettiShownRef.current = false;
            }
        }, [weekHeatmapData?.streak, showConfetti, setShowConfetti, haptic]);

        // Делаем данные волны доступными глобально для карточек приёмов
        React.useEffect(() => {
            try {
                const h = window.HEYS = window.HEYS || {};
                h.insulinWaveData = insulinWaveData || null;
            } catch (e) { }
        }, [insulinWaveData]);

        // Haptic при начале липолиза
        React.useEffect(() => {
            if (insulinWaveData?.status === 'lipolysis' && prevInsulinStatusRef.current !== 'lipolysis') {
                try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
            }
            prevInsulinStatusRef.current = insulinWaveData?.status || null;
        }, [insulinWaveData?.status]);

        // Confetti при новом рекорде липолиза
        React.useEffect(() => {
            if (insulinWaveData?.isNewRecord && !lipolysisRecordTriggeredRef.current) {
                lipolysisRecordTriggeredRef.current = true;

                if (typeof HEYS !== 'undefined' && HEYS.InsulinWave?.updateLipolysisRecord) {
                    const wasUpdated = HEYS.InsulinWave.updateLipolysisRecord(insulinWaveData.lipolysisMinutes);
                    if (wasUpdated) {
                        setShowConfetti(true);
                        try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
                        setTimeout(() => setShowConfetti(false), 3000);
                    }
                }
            }

            if (insulinWaveData?.status !== 'lipolysis') {
                lipolysisRecordTriggeredRef.current = false;
            }
        }, [insulinWaveData?.isNewRecord, insulinWaveData?.lipolysisMinutes, insulinWaveData?.status, setShowConfetti]);

        // Haptic feedback for streak / low scores
        React.useEffect(() => {
            const currentStreak = mealsChartData?.qualityStreak || 0;
            const prev = prevQualityStreakRef.current;
            if (currentStreak >= 3 && prev < 3) {
                try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
            }
            prevQualityStreakRef.current = currentStreak;
        }, [mealsChartData?.qualityStreak]);

        React.useEffect(() => {
            const meals = mealsChartData?.meals || [];
            const hasLow = meals.some(m => m.quality && m.quality.score < 50);
            if (hasLow && !lowScoreHapticRef.current) {
                try { HEYS.dayUtils?.haptic?.('warning'); } catch (e) { }
                lowScoreHapticRef.current = true;
            }
            if (!hasLow) {
                lowScoreHapticRef.current = false;
            }
        }, [mealsChartData]);

        // Achievement: первый идеальный приём
        React.useEffect(() => {
            const meals = mealsChartData?.meals || [];
            const hasPerfect = meals.some(m => m.quality && m.quality.score >= 90);

            if (hasPerfect && !firstPerfectShownRef.current) {
                try {
                    const U = window.HEYS?.utils || {};
                    const store = window.HEYS?.store;
                    const alreadyAchieved = store?.get
                        ? store.get('heys_first_perfect_meal', null) === '1'
                        : (U.lsGet ? U.lsGet('heys_first_perfect_meal', null) === '1' : localStorage.getItem('heys_first_perfect_meal') === '1');
                    if (!alreadyAchieved) {
                        if (store?.set) store.set('heys_first_perfect_meal', '1');
                        else if (U.lsSet) U.lsSet('heys_first_perfect_meal', '1');
                        else localStorage.setItem('heys_first_perfect_meal', '1');
                        setShowFirstPerfectAchievement(true);
                        setShowConfetti(true);
                        try { HEYS.dayUtils?.haptic?.('success'); } catch (e) { }
                        setTimeout(() => {
                            setShowFirstPerfectAchievement(false);
                            setShowConfetti(false);
                        }, 5000);
                        firstPerfectShownRef.current = true;
                    }
                } catch (e) { }
            }
        }, [mealsChartData, setShowConfetti, setShowFirstPerfectAchievement]);

        // Анимация нового приёма
        React.useEffect(() => {
            const mealsCount = day?.meals?.length || 0;
            const prevCount = prevMealsCountRef.current;

            if (mealsCount > prevCount && prevCount > 0) {
                setTimeout(() => {
                    setNewMealAnimatingIndex(mealsCount - 1);
                    setTimeout(() => setNewMealAnimatingIndex(-1), 600);
                }, 300);
            }

            prevMealsCountRef.current = mealsCount;
        }, [day?.meals?.length, setNewMealAnimatingIndex]);
    }

    HEYS.dayEngagementEffects = {
        useEngagementEffects
    };
})(window);


/* ===== heys_day_calendar_metrics.js ===== */
// heys_day_calendar_metrics.js — activeDays & streak calculations

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function computeActiveDays(params) {
        const { date, prof, products } = params || {};
        const getActiveDaysForMonth = HEYS.dayUtils?.getActiveDaysForMonth || (() => new Map());
        const d = new Date(date);
        return getActiveDaysForMonth(d.getFullYear(), d.getMonth(), prof, products);
    }

    function computeCurrentStreak(params) {
        const { optimum, pIndex, fmtDate, lsGet, includeToday } = params || {};

        try {
            let count = 0;
            let checkDate = new Date();
            checkDate.setHours(12);

            // По умолчанию НЕ учитываем сегодня (день ещё может измениться)
            if (!includeToday) {
                checkDate.setDate(checkDate.getDate() - 1);
            }

            for (let i = 0; i < 30; i++) {
                const dateStr = fmtDate(checkDate);
                const dayData = lsGet('heys_dayv2_' + dateStr, null);

                if (dayData && dayData.meals && dayData.meals.length > 0) {
                    let totalKcal = 0;
                    (dayData.meals || []).forEach(meal => {
                        (meal.items || []).forEach(item => {
                            const grams = +item.grams || 0;
                            if (grams <= 0) return;
                            const nameKey = (item.name || '').trim().toLowerCase();
                            const product = nameKey && pIndex?.byName?.get(nameKey)
                                || (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
                            const src = product || item;
                            if (src.kcal100 != null) {
                                totalKcal += ((+src.kcal100 || 0) * grams / 100);
                            }
                        });
                    });

                    // 🔧 FIX v2.6: Используем savedDisplayOptimum дня (TDEE того дня),
                    // а не текущий optimum (сегодняшний TDEE без активности).
                    // Каждый день имеет свой TDEE в зависимости от тренировок, шагов и т.д.
                    const dayOptimum = (+dayData.savedDisplayOptimum > 0)
                        ? +dayData.savedDisplayOptimum
                        : (optimum || 1);
                    const ratio = totalKcal / dayOptimum;
                    const rz = HEYS.ratioZones;
                    const isRefeedDay = !!dayData?.isRefeedDay;
                    const isStreakDay = rz?.isStreakDayWithRefeed
                        ? rz.isStreakDayWithRefeed(ratio, dayData)
                        : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10));

                    // Рефид-день: не добавляет к стрику и не обрывает его
                    if (!isRefeedDay) {
                        if (isStreakDay) {
                            count++;
                        } else if (i > 0) break;
                    }
                } else if (i > 0) break;

                checkDate.setDate(checkDate.getDate() - 1);
            }
            return count;
        } catch (e) {
            return 0;
        }
    }

    HEYS.dayCalendarMetrics = {
        computeActiveDays,
        computeCurrentStreak
    };
})(window);


/* ===== heys_day_calendar_block_v1.js ===== */
// heys_day_calendar_block_v1.js — DayTab calendar block renderer

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function renderCalendarBlock(params) {
        const {
            React,
            CalendarComponent,
            date,
            activeDays,
            products,
            flush,
            setDate,
            lsGet,
            lsSet,
            getProfile,
            normalizeTrainings,
            cleanEmptyTrainings,
            loadMealsForDate,
            ensureDay,
            setDay
        } = params || {};

        if (!React || !CalendarComponent) return null;

        const haptic = HEYS?.haptic || (() => { });

        const handleSelect = (d) => {
            const nextDate = d;

            try {
                if (HEYS?.Day?.requestFlush) HEYS.Day.requestFlush({ force: true });
            } catch (e) { }

            const applyDate = () => {
                setDate(nextDate);
                haptic('light');
            };

            if (HEYS?.cloud?.fetchDays) {
                HEYS.cloud.fetchDays([nextDate])
                    .then(() => applyDate())
                    .catch(() => applyDate());
                return;
            }

            applyDate();
        };

        const handleRemove = () => {
            localStorage.removeItem('heys_dayv2_' + date);
            const profNow = getProfile();
            setDay(ensureDay({
                date: date,
                meals: [],
                steps: 0,
                trainings: [],
                // Очищаем поля сна и оценки дня
                sleepStart: '',
                sleepEnd: '',
                sleepQuality: '',
                sleepNote: '',
                dayScore: '',
                moodAvg: '',
                wellbeingAvg: '',
                stressAvg: '',
                dayComment: ''
            }, profNow));
        };

        return React.createElement('div', { className: 'area-cal' },
            React.createElement(CalendarComponent, {
                key: 'cal-' + activeDays.size + '-' + products.length,
                valueISO: date,
                activeDays: activeDays,
                onSelect: handleSelect,
                onRemove: handleRemove
            })
        );
    }

    HEYS.dayCalendarBlock = {
        renderCalendarBlock
    };
})(window);


/* ===== heys_day_mood_sparkline_v1.js ===== */
// heys_day_mood_sparkline_v1.js — mood sparkline data hook

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useMoodSparklineData(params) {
        const { React, day } = params || {};
        if (!React) return [];

        return React.useMemo(() => {
            const points = [];
            const parseTime = (t) => {
                if (!t) return 0;
                const [h, m] = t.split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
            };

            // Утренняя оценка из чек-ина (стартовая точка дня)
            if (day?.moodMorning || day?.wellbeingMorning || day?.stressMorning) {
                const mood = +day.moodMorning || 0;
                const wellbeing = +day.wellbeingMorning || 0;
                const stress = +day.stressMorning || 0;
                if (mood || wellbeing || stress) {
                    const m = mood || 5;
                    const w = wellbeing || 5;
                    const s = stress || 5;
                    const score = (m + w + (10 - s)) / 3;
                    // Время утренней оценки: берём из sleepEnd или 7:00 по умолчанию
                    const morningTime = parseTime(day.sleepEnd) || parseTime('07:00');
                    points.push({
                        time: morningTime,
                        score: Math.round(score * 10) / 10,
                        type: 'morning',
                        name: 'Утро',
                        mood,
                        wellbeing,
                        stress,
                        icon: '🌅'
                    });
                }
            }

            // Собираем точки из приёмов пищи
            (day?.meals || []).forEach((meal, idx) => {
                const mood = +meal.mood || 0;
                const wellbeing = +meal.wellbeing || 0;
                const stress = +meal.stress || 0;
                // Нужна хотя бы одна оценка
                if (!mood && !wellbeing && !stress) return;
                const time = parseTime(meal.time);
                if (!time) return;
                // Комбинированная оценка: (mood + wellbeing + (10 - stress)) / 3
                // Если какой-то параметр отсутствует, используем нейтральное 5
                const m = mood || 5;
                const w = wellbeing || 5;
                const s = stress || 5;
                const score = (m + w + (10 - s)) / 3;
                points.push({
                    time,
                    score: Math.round(score * 10) / 10,
                    type: 'meal',
                    name: meal.name || 'Приём ' + (idx + 1),
                    mood,
                    wellbeing,
                    stress,
                    icon: '🍽️'
                });
            });

            // Собираем точки из тренировок
            (day?.trainings || []).forEach((tr, idx) => {
                const mood = +tr.mood || 0;
                const wellbeing = +tr.wellbeing || 0;
                const stress = +tr.stress || 0;
                if (!mood && !wellbeing && !stress) return;
                const time = parseTime(tr.time);
                if (!time) return;
                const m = mood || 5;
                const w = wellbeing || 5;
                const s = stress || 5;
                const score = (m + w + (10 - s)) / 3;
                const typeIcons = { cardio: '🏃', strength: '🏋️', hobby: '⚽' };
                points.push({
                    time,
                    score: Math.round(score * 10) / 10,
                    type: 'training',
                    name: tr.type === 'cardio' ? 'Кардио' : tr.type === 'strength' ? 'Силовая' : 'Хобби',
                    mood,
                    wellbeing,
                    stress,
                    icon: typeIcons[tr.type] || '🏃'
                });
            });

            // Сортируем по времени
            points.sort((a, b) => a.time - b.time);

            return points;
        }, [
            day?.moodMorning,
            day?.wellbeingMorning,
            day?.stressMorning,
            day?.sleepEnd,
            day?.meals?.map(m => `${m.time}-${m.mood}-${m.wellbeing}-${m.stress}`).join('|'),
            day?.trainings?.map(t => `${t.time}-${t.mood}-${t.wellbeing}-${t.stress}`).join('|')
        ]);
    }

    HEYS.dayMoodSparkline = {
        useMoodSparklineData
    };
})(window);


/* ===== heys_day_stats_block_v1.js ===== */
// heys_day_stats_block_v1.js — stats block builder (VM + actions + UI)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildStatsBlock(params) {
        const {
            React,
            HEYSRef,
            // actions deps
            openExclusivePopup,
            haptic,
            setDay,
            handlePeriodChange,
            setChartPeriod,
            setBalanceCardExpanded,
            setSparklinePopup,
            setWeekNormPopup,
            setWeekDeficitPopup,
            setBalanceDayPopup,
            setTdeePopup,
            setTefInfoPopup,
            setGoalPopup,
            setDebtSciencePopup,
            setMetricPopup,
            setMacroBadgePopup,
            setDate,
            setToastVisible,
            setAdviceTrigger,
            setMealChartHintShown,
            setShowConfetti,
            setInsulinExpanded,
            openWeightPicker,
            openDeficitPicker,
            setMealQualityPopup,
            r0,
            r1,

            // VM deps
            prof,
            day,
            dayTot,
            optimum,
            normAbs,
            weight,
            ndteData,
            tefData,
            chartPeriod,
            tdee,
            bmr,
            eatenKcal,
            stepsK,
            householdK,
            train1k,
            train2k,
            train3k,
            tefKcal,
            dayTargetDef,
            baseExpenditure,
            caloricDebt,
            sparklineData,
            sparklineRenderData,
            currentRatio,
            displayOptimum,
            displayRemainingKcal,
            balanceCardExpanded,
            showConfetti,
            shakeEaten,
            shakeOver,
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRatioStatus,
            weightSparklineData,
            weightTrend,
            kcalTrend,
            monthForecast,
            cycleHistoryAnalysis,
            weekHeatmapData,
            mealsChartData,
            currentDeficit,
            profileDeficit,
            date,
            isMobile,
            mobileSubTab,
            insulinWaveData,
            balanceViz,
            mealChartHintShown,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            sparklinePopup,
            weekNormPopup,
            weekDeficitPopup,
            balanceDayPopup,
            tdeePopup,
            tefInfoPopup,
            goalPopup,
            debtSciencePopup,
            metricPopup,
            macroBadgePopup,
            chartTransitioning,
            insulinExpanded,

            // stats data deps
            renderSparkline,
            renderWeightSparkline,
            U,
            M,
            pIndex,
            lsGet,
            PopupWithBackdrop,
            createSwipeHandlers,
            getSmartPopupPosition,
            ReactDOM
        } = params || {};

        if (!React) return { statsBlock: null, mealsChart: null, statsVm: null };

        const HEYSLocal = HEYSRef || HEYS;

        const statsActions = {
            openExclusivePopup,
            haptic,
            setDay,
            handlePeriodChange,
            setChartPeriod,
            setBalanceCardExpanded,
            setSparklinePopup,
            setWeekNormPopup,
            setWeekDeficitPopup,
            setBalanceDayPopup,
            setTdeePopup,
            setTefInfoPopup,
            setGoalPopup,
            setDebtSciencePopup,
            setMetricPopup,
            setMacroBadgePopup,
            setDate,
            setToastVisible,
            setAdviceTrigger,
            setMealChartHintShown,
            setShowConfetti,
            setInsulinExpanded,
            openWeightPicker,
            openDeficitPicker,
            setMealQualityPopup,
            r0,
            r1
        };

        const statsVm = HEYSLocal.dayStatsVm?.build?.({
            prof, day, dayTot, optimum, normAbs, weight,
            cycleDay: day?.cycleDay || null,
            ndteData, tefData, hrZones: [], chartPeriod,
            tdee, bmr, eatenKcal, stepsK, householdK, train1k, train2k, train3k,
            tefKcal, dayTargetDef, baseExpenditure, caloricDebt, sparklineData,
            sparklineRenderData,
            currentRatio, displayOptimum, displayRemainingKcal,
            balanceCardExpanded, showConfetti, shakeEaten, shakeOver,
            displayTdee, displayHeroOptimum, displayHeroEaten, displayHeroRemaining,
            displayRatioStatus,
            ratioZones: HEYSLocal.ratioZones,
            weightSparklineData,
            weightTrend,
            kcalTrend,
            monthForecast,
            cycleHistoryAnalysis,
            weekHeatmapData,
            mealsChartData,
            currentDeficit,
            profileDeficit,
            date,
            isMobile,
            mobileSubTab,
            insulinWaveData,
            balanceViz,
            mealChartHintShown,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            sparklinePopup,
            weekNormPopup,
            weekDeficitPopup,
            balanceDayPopup,
            tdeePopup,
            tefInfoPopup,
            goalPopup,
            debtSciencePopup,
            metricPopup,
            macroBadgePopup,
            chartTransitioning,
            insulinExpanded,
            metricPopupDeps: { U, M, pIndex },
            macroPopupDeps: { U, pIndex },
            mealsChartDeps: { U, pIndex },
            tefInfoDeps: { TEF: HEYSLocal.TEF }
        });

        const statsData = {
            helpers: {
                renderSparkline,
                renderWeightSparkline
            },
            deps: {
                U,
                pIndex,
                lsGet,
                PopupWithBackdrop,
                createSwipeHandlers,
                getSmartPopupPosition,
                ReactDOM,
                ratioZones: HEYSLocal.ratioZones,
                Refeed: HEYSLocal.Refeed,
                TEF: HEYSLocal.TEF,
                Day: HEYSLocal.Day,
                showCheckin: HEYSLocal.showCheckin,
                App: HEYSLocal.App,
                openProfileModal: HEYSLocal.openProfileModal
            }
        };

        const statsBlock = HEYSLocal.dayStats?.render?.({
            React,
            vm: statsVm,
            actions: statsActions,
            data: statsData
        }) || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Stats module not loaded');

        const mealsChart = HEYSLocal.dayMealsChartUI?.renderMealsChart?.({
            React,
            mealsChartData,
            statsVm,
            mealChartHintShown,
            setMealChartHintShown,
            setShowConfetti,
            setMealQualityPopup,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            U
        }) || null;

        return { statsBlock, mealsChart, statsVm };
    }

    HEYS.dayStatsBlock = {
        buildStatsBlock
    };
})(window);


/* ===== heys_day_orphan_state_v1.js ===== */
// heys_day_orphan_state_v1.js — orphan products state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useOrphanState(params) {
        const { React, day, HEYS: HEYSRef } = params || {};
        if (!React) return { orphanCount: 0 };

        const ctx = HEYSRef || HEYS;

        const [orphanVersion, setOrphanVersion] = React.useState(0);

        React.useEffect(() => {
            const handleOrphanUpdated = () => {
                setOrphanVersion(v => v + 1);
            };
            window.addEventListener('heys:orphan-updated', handleOrphanUpdated);
            // Также слушаем heysProductsUpdated — когда продукты обновились
            const handleProductsUpdated = () => {
                if (ctx?.orphanProducts?.recalculate) {
                    ctx.orphanProducts.recalculate();
                }
            };
            window.addEventListener('heysProductsUpdated', handleProductsUpdated);
            return () => {
                window.removeEventListener('heys:orphan-updated', handleOrphanUpdated);
                window.removeEventListener('heysProductsUpdated', handleProductsUpdated);
            };
        }, [ctx]);

        const orphanCount = React.useMemo(() => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            void orphanVersion; // Зависимость для пересчёта
            return ctx?.orphanProducts?.count?.() || 0;
        }, [orphanVersion, day?.meals]);

        return { orphanCount };
    }

    HEYS.dayOrphanState = {
        useOrphanState
    };
})(window);


/* ===== heys_day_nutrition_state_v1.js ===== */
// heys_day_nutrition_state_v1.js — nutrition totals + norms + daily table state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildNutritionState(params) {
        const {
            React,
            day,
            pIndex,
            optimum,
            getDailyNutrientColor,
            getDailyNutrientTooltip,
            HEYS: HEYSRef
        } = params || {};

        if (!React) return {
            dayTot: { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            normPerc: {},
            normAbs: { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            dailyTableState: {}
        };

        const ctx = HEYSRef || HEYS;

        const dayTot = ctx.dayCalculations?.calculateDayTotals?.(day, pIndex) || { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };
        const normPerc = (ctx.utils && ctx.utils.lsGet ? ctx.utils.lsGet('heys_norms', {}) : {}) || {};
        const normAbs = ctx.dayCalculations?.computeDailyNorms?.(optimum, normPerc) || { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };

        const dailyTableState = ctx.dayDailyTable?.buildDailyTableState
            ? ctx.dayDailyTable.buildDailyTableState({
                React,
                dayTot,
                normAbs,
                getDailyNutrientColor,
                getDailyNutrientTooltip
            }) || {}
            : {};

        return { dayTot, normPerc, normAbs, dailyTableState };
    }

    HEYS.dayNutritionState = {
        buildNutritionState
    };
})(window);


/* ===== heys_day_runtime_ui_state_v1.js ===== */
// heys_day_runtime_ui_state_v1.js — runtime UI state (time, offline, theme, hints)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useRuntimeUiState(params) {
        const { React, HEYS: HEYSRef } = params || {};
        if (!React) {
            return {
                currentMinute: 0,
                setCurrentMinute: () => { },
                insulinExpanded: false,
                setInsulinExpanded: () => { },
                isOnline: navigator.onLine,
                pendingChanges: false,
                syncMessage: '',
                pendingQueue: [],
                theme: 'light',
                setTheme: () => { },
                resolvedTheme: 'light',
                cycleTheme: () => { },
                mealChartHintShown: false,
                setMealChartHintShown: () => { },
                showFirstPerfectAchievement: false,
                setShowFirstPerfectAchievement: () => { },
                newMealAnimatingIndex: -1,
                setNewMealAnimatingIndex: () => { }
            };
        }

        const ctx = HEYSRef || HEYS;
        const dayEffects = ctx.dayEffects || {};
        const readStoredValue = (key, fallback) => {
            try {
                if (ctx?.store?.get) return ctx.store.get(key, fallback);
                if (ctx?.utils?.lsGet) return ctx.utils.lsGet(key, fallback);
                const raw = localStorage.getItem(key);
                return raw == null ? fallback : raw;
            } catch {
                return fallback;
            }
        };

        if (!dayEffects?.useDayCurrentMinuteEffect) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.dayEffects.useDayCurrentMinuteEffect not loaded');
        }
        if (!dayEffects?.useDayThemeEffect) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.dayEffects.useDayThemeEffect not loaded');
        }

        // === Current time for Insulin Wave Indicator (updates every minute) ===
        const [currentMinute, setCurrentMinute] = React.useState(() => Math.floor(Date.now() / 60000));
        const [insulinExpanded, setInsulinExpanded] = React.useState(false);
        dayEffects.useDayCurrentMinuteEffect({ setCurrentMinute });

        // === Offline indicator ===
        const offlineState = ctx.dayOfflineSync?.useOfflineSyncIndicator?.({
            React,
            HEYS: ctx
        }) || { isOnline: navigator.onLine, pendingChanges: false, syncMessage: '', pendingQueue: [] };

        // === Dark Theme (3 modes: light / dark / auto) ===
        const [theme, setTheme] = React.useState(() => {
            const saved = readStoredValue('heys_theme', 'light');
            // Валидация: только light/dark/auto, иначе light
            return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
        });

        // Вычисляем реальную тему (для auto режима)
        const resolvedTheme = React.useMemo(() => {
            if (theme === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return theme;
        }, [theme]);

        // Применяем тему + слушаем системные изменения
        dayEffects.useDayThemeEffect({ theme, resolvedTheme });

        // Cycle: light → dark → auto → light
        const cycleTheme = React.useCallback(() => {
            setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
        }, []);

        // === Подсказка "нажми для деталей" ===
        const [mealChartHintShown, setMealChartHintShown] = React.useState(() => {
            try {
                const saved = readStoredValue('heys_meal_hint_shown', null);
                if (saved != null) return saved === '1' || saved === 1 || saved === true;
                return false;
            } catch { return false; }
        });

        // === Ачивка "Первый идеальный приём" ===
        const [showFirstPerfectAchievement, setShowFirstPerfectAchievement] = React.useState(false);

        // === Анимация нового приёма в графике ===
        const [newMealAnimatingIndex, setNewMealAnimatingIndex] = React.useState(-1);

        return {
            currentMinute,
            setCurrentMinute,
            insulinExpanded,
            setInsulinExpanded,
            ...offlineState,
            theme,
            setTheme,
            resolvedTheme,
            cycleTheme,
            mealChartHintShown,
            setMealChartHintShown,
            showFirstPerfectAchievement,
            setShowFirstPerfectAchievement,
            newMealAnimatingIndex,
            setNewMealAnimatingIndex
        };
    }

    HEYS.dayRuntimeUiState = {
        useRuntimeUiState
    };
})(window);


/* ===== heys_day_water_card_v1.js ===== */
// heys_day_water_card_v1.js — water card wrapper (ctx/actions)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildWaterCard(params) {
        const {
            React,
            day,
            prof,
            waterGoal,
            waterGoalBreakdown,
            waterPresets,
            waterMotivation,
            waterLastDrink,
            waterAddedAnim,
            showWaterDrop,
            showWaterTooltip,
            setDay,
            haptic,
            setWaterAddedAnim,
            setShowWaterDrop,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave,
            openExclusivePopup,
            addWater,
            removeWater
        } = params || {};

        if (!React) return null;

        const waterCtx = {
            day,
            prof,
            waterGoal,
            waterGoalBreakdown,
            waterPresets,
            waterMotivation,
            waterLastDrink,
            waterAddedAnim,
            showWaterDrop,
            showWaterTooltip
        };

        const waterActions = {
            setDay,
            haptic,
            setWaterAddedAnim,
            setShowWaterDrop,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave,
            openExclusivePopup,
            addWater,
            removeWater
        };

        return HEYS.dayWater?.render?.({ React, ctx: waterCtx, actions: waterActions })
            || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Water module not loaded');
    }

    HEYS.dayWaterCard = {
        buildWaterCard
    };
})(window);


/* ===== heys_day_activity_card_v1.js ===== */
// heys_day_activity_card_v1.js — activity card wrapper (ctx/actions)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildActivityCard(params) {
        const {
            React,
            day,
            prof,
            stepsValue,
            stepsGoal,
            stepsPercent,
            stepsColor,
            stepsK,
            bmr,
            householdK,
            totalHouseholdMin,
            householdActivities,
            train1k,
            train2k,
            visibleTrainings,
            trainingsBlock,
            ndteData,
            ndteBoostKcal,
            tefData,
            tefKcal,
            dayTargetDef,
            displayOptimum,
            tdee,
            caloricDebt,
            r0,
            setDay,
            haptic,
            setMetricPopup,
            setTefInfoPopup,
            openStepsGoalPicker,
            handleStepsDrag,
            openHouseholdPicker,
            openTrainingPicker
        } = params || {};

        if (!React) return null;

        const activityCtx = {
            day, prof,
            // Steps
            stepsValue, stepsGoal, stepsPercent, stepsColor, stepsK,
            // Household & Training
            bmr, householdK, totalHouseholdMin, householdActivities,
            train1k, train2k, visibleTrainings, trainingsBlock,
            // Metabolism (NDTE, TEF)
            ndteData, ndteBoostKcal, tefData, tefKcal,
            // Caloric calculations
            dayTargetDef, displayOptimum, tdee, caloricDebt,
            r0
        };

        const activityActions = {
            setDay, haptic,
            setMetricPopup, setTefInfoPopup,
            openStepsGoalPicker, handleStepsDrag,
            openHouseholdPicker, openTrainingPicker
        };

        return HEYS.dayActivity?.render?.({ React, ctx: activityCtx, actions: activityActions })
            || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Activity module not loaded');
    }

    HEYS.dayActivityCard = {
        buildActivityCard
    };
})(window);


/* ===== heys_day_energy_context_v1.js ===== */
// heys_day_energy_context_v1.js — TDEE + energy context

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildEnergyContext(params) {
        const { day, prof, lsGet, pIndex, M, r0, HEYS: HEYSRef } = params || {};
        const ctx = HEYSRef || HEYS;

        const tdeeResult = ctx.TDEE?.calculate?.(day, prof, { lsGet, pIndex }) || {};
        const {
            bmr = 0,
            actTotal = 0,
            trainingsKcal: trainingsK = 0,
            train1k = 0,
            train2k = 0,
            train3k = 0,
            stepsKcal: stepsK = 0,
            householdKcal: householdK = 0,
            totalHouseholdMin = 0,
            ndteBoost: ndteBoostKcal = 0,
            ndteData = { active: false, tdeeBoost: 0 },
            tefKcal = 0,
            tefData = { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } },
            baseExpenditure = 0,
            tdee = 0,
            optimum = 0,
            weight = 70,
            mets = [2.5, 6, 8, 10],
            kcalMin = [0, 0, 0, 0],
            deficitPct: dayTargetDef = 0,
            cycleMultiplier: cycleKcalMultiplier = 1
        } = tdeeResult;

        const TR = (day?.trainings && Array.isArray(day.trainings)) ? day.trainings : [];
        const householdActivities = (day?.householdActivities && Array.isArray(day.householdActivities)) ? day.householdActivities : [];
        const z = mets;
        const trainK = (t) => (t.z || [0, 0, 0, 0]).reduce((s, min, i) => s + r0((+min || 0) * (kcalMin[i] || 0)), 0);
        const profileTargetDef = +(lsGet?.('heys_profile', {})?.deficitPctTarget) || 0;

        const eatenKcal = (day?.meals || []).reduce((a, m) => {
            const t = (M?.mealTotals ? M.mealTotals(m, pIndex) : { kcal: 0 });
            return a + (t.kcal || 0);
        }, 0);
        const factDefPct = tdee ? r0(((eatenKcal - tdee) / tdee) * 100) : 0; // <0 значит дефицит

        if (window._HEYS_DEBUG_TDEE) {
            // console.group('HEYS_TDEE_DEBUG [DAY] Расчёт для', day.date);
            // console.log('HEYS_TDEE_DEBUG [DAY] Входные данные:');
            // console.log('HEYS_TDEE_DEBUG [DAY]   weightMorning:', day.weightMorning, '| профиль weight:', prof.weight, '| итог weight:', weight);
            // console.log('HEYS_TDEE_DEBUG [DAY]   steps:', day.steps, '| householdMin:', day.householdMin);
            // console.log('HEYS_TDEE_DEBUG [DAY]   trainings:', JSON.stringify(TR));
            // console.log('HEYS_TDEE_DEBUG [DAY]   HR zones (MET):', JSON.stringify(z));
            // console.log('HEYS_TDEE_DEBUG [DAY] Промежуточные расчёты:');
            // console.log('HEYS_TDEE_DEBUG [DAY]   BMR:', bmr);
            // console.log('HEYS_TDEE_DEBUG [DAY]   train1k:', train1k, '| train2k:', train2k);
            // console.log('HEYS_TDEE_DEBUG [DAY]   stepsK:', stepsK, '| householdK:', householdK);
            // console.log('HEYS_TDEE_DEBUG [DAY]   actTotal:', actTotal);
            // console.log('HEYS_TDEE_DEBUG [DAY] Итоговые значения:');
            // console.log('HEYS_TDEE_DEBUG [DAY]   tdee (Общие затраты):', tdee);
            // console.log('HEYS_TDEE_DEBUG [DAY]   eatenKcal (съедено):', r0(eatenKcal));
            // console.log('HEYS_TDEE_DEBUG [DAY]   optimum (нужно съесть):', optimum);
            // console.log('HEYS_TDEE_DEBUG [DAY]   factDefPct:', factDefPct + '%');
            // console.groupEnd();
        }

        return {
            tdeeResult,
            bmr,
            actTotal,
            trainingsK,
            train1k,
            train2k,
            train3k,
            stepsK,
            householdK,
            totalHouseholdMin,
            ndteBoostKcal,
            ndteData,
            tefKcal,
            tefData,
            baseExpenditure,
            tdee,
            optimum,
            weight,
            mets,
            kcalMin,
            dayTargetDef,
            cycleKcalMultiplier,
            TR,
            householdActivities,
            z,
            trainK,
            profileTargetDef,
            eatenKcal,
            factDefPct
        };
    }

    HEYS.dayEnergyContext = {
        buildEnergyContext
    };
})(window);


/* ===== heys_day_bottom_sheet_v1.js ===== */
// heys_day_bottom_sheet_v1.js — BottomSheet swipe handlers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useBottomSheetHandlers(params) {
        const { React, haptic } = params || {};
        if (!React) {
            return {
                bottomSheetRef: { current: null },
                handleSheetTouchStart: () => { },
                handleSheetTouchMove: () => { },
                handleSheetTouchEnd: () => { }
            };
        }

        const bottomSheetRef = React.useRef(null);
        const sheetDragY = React.useRef(0);
        const sheetStartY = React.useRef(0);
        const isSheetDragging = React.useRef(false);

        const handleSheetTouchStart = (e) => {
            sheetStartY.current = e.touches[0].clientY;
            isSheetDragging.current = true;
            sheetDragY.current = 0;
        };

        const handleSheetTouchMove = (e) => {
            if (!isSheetDragging.current) return;
            const diff = e.touches[0].clientY - sheetStartY.current;
            if (diff > 0) {
                sheetDragY.current = diff;
                if (bottomSheetRef.current) {
                    bottomSheetRef.current.style.transform = `translateY(${diff}px)`;
                }
            }
        };

        const handleSheetTouchEnd = (closeCallback) => {
            if (!isSheetDragging.current) return;
            isSheetDragging.current = false;

            if (sheetDragY.current > 100) {
                // Закрываем если свайпнули > 100px
                haptic && haptic('light');
                if (bottomSheetRef.current) {
                    bottomSheetRef.current.classList.add('closing');
                }
                setTimeout(() => closeCallback(), 200);
            } else {
                // Возвращаем на место
                if (bottomSheetRef.current) {
                    bottomSheetRef.current.style.transform = '';
                }
            }
            sheetDragY.current = 0;
        };

        return {
            bottomSheetRef,
            handleSheetTouchStart,
            handleSheetTouchMove,
            handleSheetTouchEnd
        };
    }

    HEYS.dayBottomSheet = {
        useBottomSheetHandlers
    };
})(window);


/* ===== heys_day_hero_display_v1.js ===== */
// heys_day_hero_display_v1.js — hero display helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildHeroDisplay(params) {
        const {
            day,
            prof,
            tdee,
            displayOptimum,
            displayRemainingKcal,
            eatenKcal,
            HEYS: HEYSRef
        } = params || {};

        const ctx = HEYSRef || HEYS;

        // 🎓 TOUR DEMO OVERRIDE
        const isTourActive = ctx.OnboardingTour && ctx.OnboardingTour.isActive();
        const tourHero = isTourActive && ctx.OnboardingTour.getDemoData('hero');

        const displayTdee = tourHero ? tourHero.tdee : tdee;
        const displayHeroOptimum = tourHero ? tourHero.optimum : displayOptimum;
        const displayHeroEaten = tourHero ? tourHero.eaten : eatenKcal;
        const displayHeroRemaining = tourHero ? tourHero.remaining : displayRemainingKcal;

        // Color for remaining/surplus display
        const displayRemainCol = displayHeroRemaining > 100
            ? { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' }
            : displayHeroRemaining >= 0
                ? { bg: '#eab30820', text: '#eab308', border: '#eab30860' }
                : { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };

        // === Deficit calculations for stats VM ===
        const profileDeficit = Number(prof?.deficitPctTarget) || 0;
        const currentDeficit = (day?.deficitPct !== '' && day?.deficitPct != null)
            ? Number(day.deficitPct)
            : profileDeficit;

        return {
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRemainCol,
            profileDeficit,
            currentDeficit
        };
    }

    HEYS.dayHeroDisplay = {
        buildHeroDisplay
    };
})(window);


/* ===== heys_day_rating_averages_v1.js ===== */
// heys_day_rating_averages_v1.js — auto-update day averages effect

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useRatingAveragesEffect(params) {
        const { React, day, setDay, calculateDayAverages } = params || {};
        if (!React) return;

        React.useEffect(() => {
            const averages = calculateDayAverages(day.meals, day.trainings, day);

            // Не перезаписываем dayScore если есть ручной override (dayScoreManual)
            const shouldUpdateDayScore = !day.dayScoreManual && averages.dayScore !== day.dayScore;

            if (averages.moodAvg !== day.moodAvg || averages.wellbeingAvg !== day.wellbeingAvg ||
                averages.stressAvg !== day.stressAvg || shouldUpdateDayScore) {
                setDay(prevDay => ({
                    ...prevDay,
                    moodAvg: averages.moodAvg,
                    wellbeingAvg: averages.wellbeingAvg,
                    stressAvg: averages.stressAvg,
                    // Обновляем dayScore только если нет ручного override
                    ...(shouldUpdateDayScore ? { dayScore: averages.dayScore } : {}),
                    updatedAt: Date.now()
                }));
            }
        }, [
            day.meals?.map(m => `${m.mood}-${m.wellbeing}-${m.stress}`).join('|'),
            day.trainings?.map(t => `${t.mood}-${t.wellbeing}-${t.stress}`).join('|'),
            day.moodMorning, day.wellbeingMorning, day.stressMorning,
            day.dayScoreManual
        ]);
    }

    HEYS.dayRatingAverages = {
        useRatingAveragesEffect
    };
})(window);


/* ===== heys_day_advice_integration_v1.js ===== */
// heys_day_advice_integration_v1.js — Advice UI state + useAdviceState wiring

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    HEYS.dayAdviceIntegration = HEYS.dayAdviceIntegration || {};

    HEYS.dayAdviceIntegration.useAdviceIntegration = function useAdviceIntegration(ctx) {
        const React = ctx.React || global.React;
        const heysRef = ctx.HEYS || HEYS;

        const uiState = React.useMemo(() => ({
            modalOpen: false, // TODO: отслеживать состояние модалок
            searchOpen: false, // В DayTab нет глобального поиска, он внутри MealAddProduct
            showTimePicker: ctx.showTimePicker,
            showWeightPicker: ctx.showWeightPicker,
            showDeficitPicker: ctx.showDeficitPicker,
            showZonePicker: ctx.showZonePicker,
            showSleepQualityPicker: ctx.showSleepQualityPicker,
            showDayScorePicker: ctx.showDayScorePicker
        }), [
            ctx.showTimePicker,
            ctx.showWeightPicker,
            ctx.showDeficitPicker,
            ctx.showZonePicker,
            ctx.showSleepQualityPicker,
            ctx.showDayScorePicker
        ]);

        const adviceState = heysRef.dayAdviceState?.useAdviceState?.({
            React,
            day: ctx.day,
            date: ctx.date,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            dayTot: ctx.dayTot,
            normAbs: ctx.normAbs,
            optimum: ctx.optimum,
            waterGoal: ctx.waterGoal,
            uiState,
            haptic: ctx.haptic,
            U: ctx.U,
            lsGet: ctx.lsGet,
            currentStreak: ctx.currentStreak,
            setShowConfetti: ctx.setShowConfetti,
            HEYS: heysRef
        }) || {};

        return { uiState, adviceState };
    };
})(window);


/* ===== heys_day_products_context_v1.js ===== */
// heys_day_products_context_v1.js — products fallback + index context

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useProductsContext(params) {
        const { React, propsProducts, productsSignature, buildProductIndex, HEYS: HEYSRef } = params || {};
        if (!React) return { products: [], prodSig: '', pIndex: { byId: new Map(), byName: new Map() } };

        const ctx = HEYSRef || HEYS;
        const safePropsProducts = Array.isArray(propsProducts) ? propsProducts : [];

        // 🔧 FIX: Подписка на обновления локальных продуктов (порции и т.д.)
        // При обновлении локального продукта, перезагружаем products из localStorage
        const [localProductsOverride, setLocalProductsOverride] = React.useState(null);

        React.useEffect(() => {
            const handleLocalProductUpdated = (event) => {
                const detail = event?.detail || {};
                console.log('[useProductsContext] 🔄 Local product updated, forcing refresh', {
                    productId: detail.productId,
                    sharedId: detail.sharedId,
                    portionsCount: detail.portions?.length
                });

                // Загружаем свежие данные из localStorage
                const freshProducts = ctx.products?.getAll?.() || [];
                if (Array.isArray(freshProducts) && freshProducts.length > 0) {
                    setLocalProductsOverride([...freshProducts]); // Новый массив чтобы триггернуть React
                }
            };

            window.addEventListener('heys:local-product-updated', handleLocalProductUpdated);
            return () => window.removeEventListener('heys:local-product-updated', handleLocalProductUpdated);
        }, [ctx]);

        const products = React.useMemo(() => {
            // 🔧 FIX: Если есть override от event — используем его (самые свежие данные)
            if (localProductsOverride && localProductsOverride.length > 0) {
                return localProductsOverride;
            }
            if (safePropsProducts.length > 0) return safePropsProducts;
            // Fallback: берём из глобального хранилища
            const fromStore = ctx.products?.getAll?.() || [];
            if (Array.isArray(fromStore) && fromStore.length > 0) return fromStore;
            // Последний fallback: из localStorage напрямую
            const U = ctx.utils || {};
            const lsData = U.lsGet?.('heys_products', []) || [];
            return Array.isArray(lsData) ? lsData : [];
        }, [safePropsProducts, localProductsOverride]); // 🔧 FIX: добавлена зависимость от localProductsOverride

        const prodSig = React.useMemo(() => productsSignature(products), [products]);
        const pIndex = React.useMemo(() => buildProductIndex(products), [prodSig]);

        // Debug info (minimal)
        ctx.debug = ctx.debug || {};
        ctx.debug.dayProducts = products;
        ctx.debug.dayProductIndex = pIndex;

        return { products, prodSig, pIndex };
    }

    HEYS.dayProductsContext = {
        useProductsContext
    };
})(window);


/* ===== heys_day_diary_section.js ===== */
(function (HEYS) {
    'use strict';

    const renderDiarySection = (params) => {

        const {
            React,
            isMobile,
            mobileSubTab,
            goalProgressBar,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            addMeal,
            day,
            mealsUI,
            daySummary,
            caloricDebt,
            eatenKcal,
            optimum,
            displayOptimum,
            date,
            prof,
            pIndex,
            dayTot,
            normAbs,
            HEYS: rootHEYs
        } = params || {};

        if (!React) {
            console.warn('[HEYS.diary] ❌ No React provided, returning null');
            return null;
        }

        const app = rootHEYs || HEYS;
        const showDiary = !isMobile || mobileSubTab === 'diary';

        const ensureSupplementsModule = () => {
            if (app.Supplements?.renderCard) return true;
            if (typeof document === 'undefined') return false;
            if (window.__heysSupplementsLoading) return false;

            window.__heysSupplementsLoading = true;
            const script = document.createElement('script');
            script.src = 'heys_supplements_v1.js?v=1';
            script.async = true;
            script.onload = () => {
                window.__heysSupplementsLoading = false;
                window.dispatchEvent(new CustomEvent('heys-deferred-module-loaded', {
                    detail: { module: 'supplements' }
                }));
            };
            script.onerror = () => {
                window.__heysSupplementsLoading = false;
            };
            document.head.appendChild(script);
            return false;
        };

        const insulinIndicator = app.dayInsulinWaveUI?.renderInsulinWaveIndicator?.({
            React,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            mobileSubTab,
            isMobile,
            openExclusivePopup,
            HEYS: app
        }) || null;

        const refeedCard = app.Refeed?.renderRefeedCard?.({
            isRefeedDay: day?.isRefeedDay,
            refeedReason: day?.refeedReason,
            caloricDebt,
            eatenKcal,
            optimum
        }) || null;


        // PERF v8.0: Separate module readiness from content — enables skeleton UX
        const cascadeReady = !!app.CascadeCard?.renderCard;
        const cascadeCard = cascadeReady ? (app.CascadeCard.renderCard({
            React, day, prof, pIndex, dayTot, normAbs
        }) || null) : null;

        const mealRecReady = !!app.MealRecCard?.renderCard && !!app.InsightsPI?.mealRecommender?.recommend;
        const mealRecCard = mealRecReady ? (app.MealRecCard.renderCard({
            React,
            day,
            prof,
            pIndex,
            dayTot,
            normAbs,
            optimum: displayOptimum || optimum
        }) || null) : null;

        if (mealRecCard) {
            if (!window.__heysLoggedMealRecRendered) {
                window.__heysLoggedMealRecRendered = true;
                console.info('[HEYS.diary] ✅ Meal rec card rendered');
            }
        } else if (mealRecReady) {
            // Only log when module loaded but no recommendation (not when still loading)
            if (!window.__heysLoggedMealRecNull) {
                window.__heysLoggedMealRecNull = true;
                console.info('[HEYS.diary] ℹ️ Meal rec card: no recommendation');
            }
        }

        const dateKey = date
            || day?.date
            || app.models?.todayISO?.()
            || new Date().toISOString().slice(0, 10);
        const supplementsReady = !!app.Supplements?.renderCard;
        if (!supplementsReady) ensureSupplementsModule();
        const supplementsCard = supplementsReady && dateKey ? (app.Supplements.renderCard({
            dateKey,
            dayData: day,
            onForceUpdate: () => {
                window.dispatchEvent(new CustomEvent('heys:day-updated', {
                    detail: { date: dateKey, source: 'supplements-update', forceReload: true }
                }));
            }
        }) || null) : null;

        // PERF v8.3: Deferred card slot — skeleton only after postboot completes
        // If postboot is still loading scripts, return null (invisible).
        // Skeleton only shows if postboot finished but module is STILL not ready (abnormal).
        const DEFERRED_SKELETON_DELAY_MS = 260;
        const deferredSlotLoadSince = window.__heysDeferredSlotLoadSince = window.__heysDeferredSlotLoadSince || Object.create(null);
        const deferredSkeletonState = window.__heysDeferredSkeletonState = window.__heysDeferredSkeletonState || Object.create(null);
        const deferredPendingSlot = (slotKey) => React.createElement('div', {
            key: slotKey,
            className: 'deferred-card-slot deferred-card-slot--pending',
            'aria-hidden': 'true'
        });
        const deferredSlot = (ready, content, slotKey, skeletonH, skeletonIcon, skeletonLabel) => {
            const debugKey = slotKey || 'unknown-slot';
            if (!ready) {
                // Don't show skeleton while postboot is still loading scripts
                if (!window.__heysPostbootDone) {
                    if (deferredSkeletonState[debugKey] !== 'wait_postboot') {
                        console.info('[HEYS.sceleton] ⏳ wait_postboot', { slotKey: debugKey });
                        deferredSkeletonState[debugKey] = 'wait_postboot';
                    }
                    return deferredPendingSlot(slotKey); // Keep stable DOM slot, zero-height
                }

                // Anti-flicker: render skeleton only if module is still not ready after a small delay
                const now = Date.now();
                if (slotKey && !deferredSlotLoadSince[slotKey]) {
                    deferredSlotLoadSince[slotKey] = now;
                }
                const waitStart = slotKey ? deferredSlotLoadSince[slotKey] : now;
                if ((now - waitStart) < DEFERRED_SKELETON_DELAY_MS) {
                    if (deferredSkeletonState[debugKey] !== 'wait_delay') {
                        console.info('[HEYS.sceleton] ⏱️ wait_delay', {
                            slotKey: debugKey,
                            elapsedMs: now - waitStart,
                            delayMs: DEFERRED_SKELETON_DELAY_MS
                        });
                        deferredSkeletonState[debugKey] = 'wait_delay';
                    }
                    return deferredPendingSlot(slotKey);
                }

                if (deferredSkeletonState[debugKey] !== 'show_skeleton') {
                    console.info('[HEYS.sceleton] 🦴 show_skeleton', {
                        slotKey: debugKey,
                        elapsedMs: now - waitStart,
                        delayMs: DEFERRED_SKELETON_DELAY_MS
                    });
                    deferredSkeletonState[debugKey] = 'show_skeleton';
                }

                return React.createElement('div', { key: slotKey, className: 'deferred-card-slot deferred-card-slot--loading' },
                    React.createElement('div', {
                        className: 'deferred-card-skeleton',
                        style: { minHeight: skeletonH + 'px' }
                    },
                        React.createElement('div', { className: 'deferred-card-skeleton__shimmer' }),
                        React.createElement('div', { className: 'deferred-card-skeleton__content' },
                            skeletonIcon && React.createElement('div', { className: 'deferred-card-skeleton__icon' }, skeletonIcon),
                            skeletonLabel && React.createElement('div', { className: 'deferred-card-skeleton__label' }, skeletonLabel)
                        )
                    )
                );
            }

            if (slotKey && deferredSlotLoadSince[slotKey]) {
                delete deferredSlotLoadSince[slotKey];
            }

            if (!content) {
                if (deferredSkeletonState[debugKey] !== 'ready_empty') {
                    console.info('[HEYS.sceleton] ℹ️ ready_empty', { slotKey: debugKey });
                    deferredSkeletonState[debugKey] = 'ready_empty';
                }
                return React.createElement('div', { key: slotKey, className: 'deferred-card-slot deferred-card-slot--empty' });
            }
            if (deferredSkeletonState[debugKey] !== 'ready_content') {
                console.info('[HEYS.sceleton] ✅ ready_content', { slotKey: debugKey });
                deferredSkeletonState[debugKey] = 'ready_content';
            }
            const slotTypeClass = slotKey ? ('deferred-card-slot--' + String(slotKey).replace(/^slot-/, '')) : '';
            // PERF: skip unfold animation if user has cached local data (returning user)
            // Meal rec card always uses smooth unfold (loads late, needs visual transition)
            // v6.0: Adaptive Render Gate — when __heysGatedRender is true (full sync arrived
            // before DayTab unlock), ALL cards render instantly in one frame, no animation
            const animClass = window.__heysGatedRender
                ? 'no-animate'
                : ((window.__heysHasLocalData && slotKey !== 'slot-mealrec') ? 'no-animate' : 'animate-always');
            return React.createElement('div', {
                key: slotKey,
                className: ('deferred-card-slot deferred-card-slot--loaded ' + animClass + ' ' + slotTypeClass).trim()
            }, content);
        };

        if (!showDiary) return insulinIndicator;

        return React.createElement(React.Fragment, null,
            React.createElement('h2', {
                id: 'day-remaining-heading',
                style: {
                    fontSize: '24px',
                    fontWeight: '800',
                    color: 'var(--text, #1e293b)',
                    margin: '12px 0 16px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    scrollMarginTop: '150px'
                }
            }, 'ОСТАЛОСЬ НА СЕГОДНЯ'),
            goalProgressBar,
            deferredSlot(cascadeReady, cascadeCard, 'slot-cascade', 140, '🔬', 'Анализируем ваши данные, чтобы показать состояние поведенческого каскада'),
            refeedCard,
            deferredSlot(mealRecReady, mealRecCard, 'slot-mealrec', 72, '🍽️', 'Загружаем ваши данные, чтобы умный планировщик дал точные рекомендации на остаток дня'),
            deferredSlot(supplementsReady, supplementsCard, 'slot-supplements', 96, '💊', 'Подготавливаем план добавок на сегодня'),
            mealsChart,
            insulinIndicator,
            React.createElement('h2', {
                id: 'diary-heading',
                style: {
                    fontSize: '24px',
                    fontWeight: '800',
                    color: 'var(--text, #1e293b)',
                    margin: '28px 0 20px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    textAlign: 'center',
                    scrollMarginTop: '150px'
                }
            }, 'ДНЕВНИК ПИТАНИЯ'),
            React.createElement('button', {
                className: 'add-meal-btn-full',
                onClick: addMeal,
                style: {
                    width: '100%',
                    padding: '18px 24px',
                    marginBottom: '20px',
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#fff',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                    transition: 'all 0.2s ease',
                    WebkitTapHighlightColor: 'transparent'
                }
            },
                React.createElement('span', { style: { fontSize: '22px' } }, '➕'),
                'Добавить приём пищи'
            ),
            (!day?.meals || day.meals.length === 0) && React.createElement('div', { className: 'empty-state' },
                React.createElement('div', { className: 'empty-state-icon' }, '🍽️'),
                React.createElement('div', { className: 'empty-state-title' }, 'Пока нет приёмов пищи'),
                React.createElement('div', { className: 'empty-state-text' }, 'Добавьте первый приём, чтобы начать отслеживание'),
                React.createElement('button', {
                    className: 'btn btn-primary empty-state-btn',
                    onClick: addMeal,
                    style: {
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
                    }
                }, '+ Добавить приём')
            ),
            mealsUI,
            daySummary,
            React.createElement('div', { className: 'row desktop-only', style: { justifyContent: 'flex-start', marginTop: '8px' } },
                React.createElement('button', { className: 'btn', onClick: addMeal }, '+ Приём')
            )
        );
    };

    HEYS.dayDiarySection = HEYS.dayDiarySection || {};
    HEYS.dayDiarySection.renderDiarySection = renderDiarySection;
})(window.HEYS = window.HEYS || {});


/* ===== heys_day_tab_render_v1.js ===== */
// heys_day_tab_render_v1.js — DayTab render assembly (skeleton/read-only/diary/shell)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    HEYS.dayTabRender = HEYS.dayTabRender || {};

    HEYS.dayTabRender.renderDayTabLayout = function renderDayTabLayout(ctx) {
        const React = ctx.React || global.React;
        const heysRef = ctx.HEYS || HEYS;

        // === SKELETON LOADER ===
        const skeletonLoader = React.createElement('div', { className: 'skeleton-page' },
            // Skeleton для СТАТИСТИКА
            React.createElement('div', { className: 'skeleton-card skeleton-stats' },
                React.createElement('div', { className: 'skeleton-header' }),
                React.createElement('div', { className: 'skeleton-metrics' },
                    React.createElement('div', { className: 'skeleton-metric' }),
                    React.createElement('div', { className: 'skeleton-metric' }),
                    React.createElement('div', { className: 'skeleton-metric' }),
                    React.createElement('div', { className: 'skeleton-metric' })
                ),
                React.createElement('div', { className: 'skeleton-sparkline' }),
                React.createElement('div', { className: 'skeleton-progress' }),
                React.createElement('div', { className: 'skeleton-macros' },
                    React.createElement('div', { className: 'skeleton-ring' }),
                    React.createElement('div', { className: 'skeleton-ring' }),
                    React.createElement('div', { className: 'skeleton-ring' })
                )
            ),
            // Skeleton для АКТИВНОСТЬ
            React.createElement('div', { className: 'skeleton-card skeleton-activity' },
                React.createElement('div', { className: 'skeleton-header' }),
                React.createElement('div', { className: 'skeleton-slider' }),
                React.createElement('div', { className: 'skeleton-row' },
                    React.createElement('div', { className: 'skeleton-block' }),
                    React.createElement('div', { className: 'skeleton-block' })
                )
            ),
            // Skeleton для приёмов пищи
            React.createElement('div', { className: 'skeleton-card skeleton-meal' },
                React.createElement('div', { className: 'skeleton-meal-header' }),
                React.createElement('div', { className: 'skeleton-search' }),
                React.createElement('div', { className: 'skeleton-item' }),
                React.createElement('div', { className: 'skeleton-item' })
            )
        );

        // УБРАНО: Скелетон вызывал мерцание при каждой загрузке
        // Теперь данные показываются мгновенно из localStorage (useState инициализирован из кэша)
        // isHydrated оставлен только для блокировки autosave до завершения sync
        // if (!isHydrated) {
        //   return React.createElement('div', { className: 'page page-day' }, skeletonLoader);
        // }

        // === READ-ONLY BANNER: показываем если триал истёк ===
        const subscriptionStatus = heysRef.Subscription?.getStatus?.() || {};
        const isReadOnly = subscriptionStatus.status === 'read_only';

        // === Diary Section (extracted) ===
        const diarySection = heysRef.dayDiarySection?.renderDiarySection?.({
            React,
            isMobile: ctx.isMobile,
            mobileSubTab: ctx.mobileSubTab,
            goalProgressBar: ctx.goalProgressBar,
            mealsChart: ctx.mealsChart,
            insulinWaveData: ctx.insulinWaveData,
            insulinExpanded: ctx.insulinExpanded,
            setInsulinExpanded: ctx.setInsulinExpanded,
            openExclusivePopup: ctx.openExclusivePopup,
            addMeal: ctx.addMeal,
            day: ctx.day,
            mealsUI: ctx.mealsUI,
            daySummary: ctx.daySummary,
            caloricDebt: ctx.caloricDebt,
            eatenKcal: ctx.eatenKcal,
            optimum: ctx.optimum,
            displayOptimum: ctx.displayOptimum,
            date: ctx.date,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            dayTot: ctx.dayTot,
            normAbs: ctx.normAbs,
            HEYS: heysRef
        }) || null;

        if (!heysRef.dayPageShell?.renderDayPage) {
            throw new Error('[heys_day_tab_render_v1] HEYS.dayPageShell not loaded before renderDayTabLayout');
        }

        const adviceState = ctx.adviceState || {};

        return heysRef.dayPageShell.renderDayPage({
            isReadOnly,
            pullProgress: ctx.pullProgress,
            isRefreshing: ctx.isRefreshing,
            refreshStatus: ctx.refreshStatus,
            pullThreshold: ctx.pullThreshold,
            isMobile: ctx.isMobile,
            mobileSubTab: ctx.mobileSubTab,
            orphanAlert: ctx.orphanAlert,
            statsBlock: ctx.statsBlock,
            waterCard: ctx.waterCard,
            compactActivity: ctx.compactActivity,
            sideBlock: ctx.sideBlock,
            cycleCard: ctx.cycleCard,
            date: ctx.date,
            day: ctx.day,
            caloricDebt: ctx.caloricDebt,
            eatenKcal: ctx.eatenKcal,
            optimum: ctx.optimum,
            addMeal: ctx.addMeal,
            addWater: ctx.addWater,
            diarySection,
            adviceTrigger: adviceState.adviceTrigger,
            adviceRelevant: adviceState.adviceRelevant,
            toastVisible: adviceState.toastVisible,
            dismissToast: adviceState.dismissToast,
            getSortedGroupedAdvices: adviceState.getSortedGroupedAdvices,
            dismissedAdvices: adviceState.dismissedAdvices,
            hiddenUntilTomorrow: adviceState.hiddenUntilTomorrow,
            lastDismissedAdvice: adviceState.lastDismissedAdvice,
            adviceSwipeState: adviceState.adviceSwipeState,
            expandedAdviceId: adviceState.expandedAdviceId,
            handleAdviceToggleExpand: adviceState.handleAdviceToggleExpand,
            rateAdvice: adviceState.rateAdvice,
            handleAdviceSwipeStart: adviceState.handleAdviceSwipeStart,
            handleAdviceSwipeMove: adviceState.handleAdviceSwipeMove,
            handleAdviceSwipeEnd: adviceState.handleAdviceSwipeEnd,
            handleAdviceLongPressStart: adviceState.handleAdviceLongPressStart,
            handleAdviceLongPressEnd: adviceState.handleAdviceLongPressEnd,
            registerAdviceCardRef: adviceState.registerAdviceCardRef,
            handleAdviceListTouchStart: adviceState.handleAdviceListTouchStart,
            handleAdviceListTouchMove: adviceState.handleAdviceListTouchMove,
            handleAdviceListTouchEnd: adviceState.handleAdviceListTouchEnd,
            handleDismissAll: adviceState.handleDismissAll,
            dismissAllAnimation: adviceState.dismissAllAnimation,
            toastsEnabled: adviceState.toastsEnabled,
            toggleToastsEnabled: adviceState.toggleToastsEnabled,
            adviceSoundEnabled: adviceState.adviceSoundEnabled,
            toggleAdviceSoundEnabled: adviceState.toggleAdviceSoundEnabled,
            scheduleAdvice: adviceState.scheduleAdvice,
            undoLastDismiss: adviceState.undoLastDismiss,
            clearLastDismissed: adviceState.clearLastDismissed,
            ADVICE_CATEGORY_NAMES: adviceState.ADVICE_CATEGORY_NAMES,
            AdviceCard: ctx.AdviceCard,
            displayedAdvice: adviceState.displayedAdvice,
            adviceExpanded: adviceState.adviceExpanded,
            toastSwiped: adviceState.toastSwiped,
            toastSwipeX: adviceState.toastSwipeX,
            toastDetailsOpen: adviceState.toastDetailsOpen,
            toastAppearedAtRef: adviceState.toastAppearedAtRef,
            toastScheduledConfirm: adviceState.toastScheduledConfirm,
            haptic: ctx.haptic,
            setToastDetailsOpen: adviceState.setToastDetailsOpen,
            setAdviceExpanded: adviceState.setAdviceExpanded,
            setAdviceTrigger: adviceState.setAdviceTrigger,
            handleToastTouchStart: adviceState.handleToastTouchStart,
            handleToastTouchMove: adviceState.handleToastTouchMove,
            handleToastTouchEnd: adviceState.handleToastTouchEnd,
            handleToastUndo: adviceState.handleToastUndo,
            handleToastSchedule: adviceState.handleToastSchedule,
            showTimePicker: ctx.showTimePicker,
            cancelTimePicker: ctx.cancelTimePicker,
            bottomSheetRef: ctx.bottomSheetRef,
            handleSheetTouchStart: ctx.handleSheetTouchStart,
            handleSheetTouchMove: ctx.handleSheetTouchMove,
            handleSheetTouchEnd: ctx.handleSheetTouchEnd,
            pickerStep: ctx.pickerStep,
            animDirection: ctx.animDirection,
            editMode: ctx.editMode,
            confirmTimeEdit: ctx.confirmTimeEdit,
            goToMoodStep: ctx.goToMoodStep,
            hoursValues: ctx.hoursValues,
            pendingMealTime: ctx.pendingMealTime,
            setPendingMealTime: ctx.setPendingMealTime,
            minutesValues: ctx.minutesValues,
            isNightHourSelected: ctx.isNightHourSelected,
            currentDateLabel: ctx.currentDateLabel,
            pendingMealType: ctx.pendingMealType,
            setPendingMealType: ctx.setPendingMealType,
            WheelColumn: ctx.WheelColumn,
            goBackToTimeStep: ctx.goBackToTimeStep,
            confirmMoodEdit: ctx.confirmMoodEdit,
            confirmMealCreation: ctx.confirmMealCreation,
            pendingMealMood: ctx.pendingMealMood,
            setPendingMealMood: ctx.setPendingMealMood,
            showConfetti: ctx.showConfetti,
            setShowConfetti: ctx.setShowConfetti,
            emojiAnimating: ctx.emojiAnimating,
            setEmojiAnimating: ctx.setEmojiAnimating,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            lsGet: ctx.lsGet,
            fmtDate: ctx.fmtDate,
            getProductFromItem: ctx.getProductFromItem,
            getMealType: ctx.getMealType,
            getMealQualityScore: ctx.getMealQualityScore,
            editGramsTarget: ctx.editGramsTarget,
            editGramsValue: ctx.editGramsValue,
            editPortions: ctx.editPortions,
            editLastPortionGrams: ctx.editLastPortionGrams,
            editGramsInputRef: ctx.editGramsInputRef,
            setEditGramsValue: ctx.setEditGramsValue,
            confirmEditGramsModal: ctx.confirmEditGramsModal,
            cancelEditGramsModal: ctx.cancelEditGramsModal,
            handleEditGramsDrag: ctx.handleEditGramsDrag,
            zoneFormulaPopup: ctx.zoneFormulaPopup,
            closeZoneFormula: ctx.closeZoneFormula,
            householdFormulaPopup: ctx.householdFormulaPopup,
            closeHouseholdFormula: ctx.closeHouseholdFormula,
            showZonePicker: ctx.showZonePicker,
            cancelZonePicker: ctx.cancelZonePicker,
            confirmZonePicker: ctx.confirmZonePicker,
            zonePickerTarget: ctx.zonePickerTarget,
            zoneMinutesValues: ctx.zoneMinutesValues,
            pendingZoneMinutes: ctx.pendingZoneMinutes,
            setPendingZoneMinutes: ctx.setPendingZoneMinutes,
            showTrainingPicker: ctx.showTrainingPicker,
            cancelTrainingPicker: ctx.cancelTrainingPicker,
            confirmTrainingPicker: ctx.confirmTrainingPicker,
            trainingPickerStep: ctx.trainingPickerStep,
            pendingTrainingZones: ctx.pendingTrainingZones,
            setPendingTrainingZones: ctx.setPendingTrainingZones,
            pendingTrainingTime: ctx.pendingTrainingTime,
            setPendingTrainingTime: ctx.setPendingTrainingTime,
            pendingTrainingType: ctx.pendingTrainingType,
            setPendingTrainingType: ctx.setPendingTrainingType,
            trainingTypes: ctx.trainingTypes,
            kcalMin: ctx.kcalMin,
            TR: ctx.TR,
            mets: ctx.mets,
            zoneNames: ctx.zoneNames,
            weight: ctx.weight,
            kcalPerMin: ctx.kcalPerMin,
            r0: ctx.r0,
            householdActivities: ctx.householdActivities,
            openTrainingPicker: ctx.openTrainingPicker,
            openHouseholdPicker: ctx.openHouseholdPicker,
            pendingTrainingQuality: ctx.pendingTrainingQuality,
            setPendingTrainingQuality: ctx.setPendingTrainingQuality,
            pendingTrainingFeelAfter: ctx.pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter: ctx.setPendingTrainingFeelAfter,
            pendingTrainingComment: ctx.pendingTrainingComment,
            setPendingTrainingComment: ctx.setPendingTrainingComment,
            showSleepQualityPicker: ctx.showSleepQualityPicker,
            cancelSleepQualityPicker: ctx.cancelSleepQualityPicker,
            confirmSleepQualityPicker: ctx.confirmSleepQualityPicker,
            pendingSleepQuality: ctx.pendingSleepQuality,
            setPendingSleepQuality: ctx.setPendingSleepQuality,
            pendingSleepNote: ctx.pendingSleepNote,
            setPendingSleepNote: ctx.setPendingSleepNote,
            sleepQualityValues: ctx.sleepQualityValues,
            showDayScorePicker: ctx.showDayScorePicker,
            cancelDayScorePicker: ctx.cancelDayScorePicker,
            confirmDayScorePicker: ctx.confirmDayScorePicker,
            pendingDayScore: ctx.pendingDayScore,
            setPendingDayScore: ctx.setPendingDayScore,
            pendingDayComment: ctx.pendingDayComment,
            setPendingDayComment: ctx.setPendingDayComment,
            calculateDayAverages: ctx.calculateDayAverages,
            mealQualityPopup: ctx.mealQualityPopup,
            setMealQualityPopup: ctx.setMealQualityPopup,
            getSmartPopupPosition: ctx.getSmartPopupPosition,
            createSwipeHandlers: ctx.createSwipeHandlers,
            M: ctx.M
        });
    };
})(window);


/* ===== heys_day_cycle_state.js ===== */
// heys_day_cycle_state.js — cycle card state helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useCycleState(params) {
        const { React, day, date, setDay, lsGet, lsSet, prof } = params || {};

        const showCycleCard = prof?.cycleTrackingEnabled && prof?.sex === 'female';
        const cyclePhase = HEYS.Cycle?.getCyclePhase?.(day?.cycleDay);

        const [cycleEditMode, setCycleEditMode] = React.useState(false);
        const [cycleDayInput, setCycleDayInput] = React.useState(day?.cycleDay || '');

        const saveCycleDay = React.useCallback((newDay) => {
            const validDay = newDay === null ? null : Math.min(Math.max(1, parseInt(newDay) || 1), 7);

            setDay(prev => ({ ...prev, cycleDay: validDay, updatedAt: Date.now() }));
            setCycleEditMode(false);

            if (validDay && HEYS.Cycle?.setCycleDaysAuto && lsGet && lsSet) {
                HEYS.Cycle.setCycleDaysAuto(date, validDay, lsGet, lsSet);
            }
        }, [setDay, date, lsGet, lsSet]);

        const clearCycleDay = React.useCallback(() => {
            setDay(prev => ({ ...prev, cycleDay: null, updatedAt: Date.now() }));
            setCycleEditMode(false);

            if (HEYS.Cycle?.clearCycleDays && lsGet && lsSet) {
                HEYS.Cycle.clearCycleDays(date, lsGet, lsSet);
            }
        }, [setDay, date, lsGet, lsSet]);

        return {
            showCycleCard,
            cyclePhase,
            cycleEditMode,
            setCycleEditMode,
            cycleDayInput,
            setCycleDayInput,
            saveCycleDay,
            clearCycleDay
        };
    }

    HEYS.dayCycleState = {
        useCycleState
    };
})(window);


/* ===== day/_meals.js ===== */
// day/_meals.js — consolidated DayTab meals modules (card/list/display/chart/state/handlers)

; (function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const trackError = (err, context) => {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(err, context);
        }
    };

    // =========================
    // MealCard
    // =========================
    const U = HEYS.dayUtils || {};
    const getProductFromItem = U.getProductFromItem || (() => null);
    const formatMealTime = U.formatMealTime || ((time) => time);
    const MEAL_TYPES = U.MEAL_TYPES || {};
    const per100 = U.per100 || (() => ({
        kcal100: 0,
        carbs100: 0,
        prot100: 0,
        fat100: 0,
        simple100: 0,
        complex100: 0,
        bad100: 0,
        good100: 0,
        trans100: 0,
        fiber100: 0,
    }));
    const scale = U.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);

    const M = HEYS.models || {};
    const { LazyPhotoThumb } = HEYS.dayGallery || {};
    const { getMealQualityScore, getNutrientColor, getNutrientTooltip } = HEYS.mealScoring || {};
    const { PopupCloseButton } = HEYS.dayPopups || {};
    const MealOptimizerSection = HEYS.dayMealOptimizerSection?.MealOptimizerSection;

    function fmtVal(key, v) {
        if (v == null || v === '') return '-';
        const num = +v || 0;
        if (key === 'harm') return Math.round(num * 10) / 10;
        if (!num) return '-';
        return Math.round(num);
    }

    const harmMissingLogged = new Set();
    function logMissingHarm(name, item, source) {
        if (!HEYS.analytics?.trackDataOperation) return;
        const key = `${source || 'meal-card'}:${(name || 'unknown').toLowerCase()}`;
        if (harmMissingLogged.has(key)) return;
        harmMissingLogged.add(key);
        HEYS.analytics.trackDataOperation('harm_missing_in_meal_card', {
            source: source || 'meal-card',
            name: name || null,
            productId: item?.product_id ?? item?.productId ?? item?.id ?? null,
            hasItemHarm: HEYS.models?.normalizeHarm?.(item) != null,
        });
    }

    const MEAL_HEADER_META = [
        { label: 'Название<br>продукта' },
        { label: 'г' },
        { label: 'ккал<br>/100', per100: true },
        { label: 'У<br>/100', per100: true },
        { label: 'Прост<br>/100', per100: true },
        { label: 'Сл<br>/100', per100: true },
        { label: 'Б<br>/100', per100: true },
        { label: 'Ж<br>/100', per100: true },
        { label: 'ВрЖ<br>/100', per100: true },
        { label: 'ПЖ<br>/100', per100: true },
        { label: 'ТрЖ<br>/100', per100: true },
        { label: 'Клетч<br>/100', per100: true },
        { label: 'ГИ' },
        { label: 'Вред' },
        { label: '' },
    ];

    function getMealType(mealIndex, meal, allMeals, pIndex) {
        const time = meal?.time || '';
        const hour = parseInt(time.split(':')[0]) || 12;

        if (hour >= 6 && hour < 11) return { type: 'breakfast', label: 'Завтрак', emoji: '🌅' };
        if (hour >= 11 && hour < 16) return { type: 'lunch', label: 'Обед', emoji: '🌞' };
        if (hour >= 16 && hour < 21) return { type: 'dinner', label: 'Ужин', emoji: '🌆' };
        return { type: 'snack', label: 'Перекус', emoji: '🍎' };
    }

    const MealCard = React.memo(function MealCard({
        meal,
        mealIndex,
        displayIndex,
        products,
        pIndex,
        date,
        setDay,
        isMobile,
        isExpanded,
        onToggleExpand,
        onChangeMealType,
        onChangeTime,
        onChangeMood,
        onChangeWellbeing,
        onChangeStress,
        onRemoveMeal,
        openEditGramsModal,
        openTimeEditor,
        openMoodEditor,
        setGrams,
        removeItem,
        isMealStale,
        allMeals,
        isNewItem,
        optimum,
        setMealQualityPopup,
        addProductToMeal,
        dayData,
        profile,
        insulinWaveData: insulinWaveDataProp,
    }) {
        const MealAddProduct = HEYS.dayComponents?.MealAddProduct;
        const ProductRow = HEYS.dayComponents?.ProductRow;
        if (!MealAddProduct || !ProductRow) {
            trackError(new Error('[HEYS Day Meals] Meal components not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
                missing: {
                    MealAddProduct: !MealAddProduct,
                    ProductRow: !ProductRow,
                },
            });
            return React.createElement('div', {
                className: 'card tone-slate meal-card',
                style: { padding: '12px', marginTop: '8px' },
            }, 'Загрузка...');
        }
        const headerMeta = MEAL_HEADER_META;
        function mTotals(m) {
            const t = (M.mealTotals ? M.mealTotals(m, pIndex) : {
                kcal: 0,
                carbs: 0,
                simple: 0,
                complex: 0,
                prot: 0,
                fat: 0,
                bad: 0,
                good: 0,
                trans: 0,
                fiber: 0,
            });
            let gSum = 0;
            let giSum = 0;
            let harmSum = 0;
            (m.items || []).forEach((it) => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                // Use centralized harm normalization with fallback to item
                const harm = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
            t.gi = gSum ? giSum / gSum : 0;
            t.harm = gSum ? harmSum / gSum : 0;
            return t;
        }
        const totals = mTotals(meal);
        const manualType = meal.mealType;
        const autoTypeInfo = getMealType(mealIndex, meal, allMeals, pIndex);
        const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType]
            ? { type: manualType, ...U.MEAL_TYPES[manualType] }
            : autoTypeInfo;

        const changeMealType = (newType) => {
            onChangeMealType(mealIndex, newType);
        };
        const timeDisplay = U.formatMealTime ? U.formatMealTime(meal.time) : (meal.time || '');
        const mealKcal = Math.round(totals.kcal || 0);
        const isStale = isMealStale(meal);
        const isCurrentMeal = displayIndex === 0 && !isStale;

        const mealActivityContext = React.useMemo(() => {
            if (!HEYS.InsulinWave?.calculateActivityContext) return null;
            if (!dayData?.trainings || dayData.trainings.length === 0) return null;
            if (!meal?.time || !meal?.items?.length) return null;

            const mealTotals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
            return HEYS.InsulinWave.calculateActivityContext({
                mealTime: meal.time,
                mealKcal: mealTotals.kcal || 0,
                trainings: dayData.trainings,
                householdMin: dayData.householdMin || 0,
                steps: dayData.steps || 0,
                allMeals: allMeals,
            });
        }, [meal?.time, meal?.items, dayData?.trainings, dayData?.householdMin, dayData?.steps, allMeals, pIndex]);

        const mealQuality = React.useMemo(() => {
            if (!meal?.items || meal.items.length === 0) return null;
            return getMealQualityScore(meal, mealTypeInfo.type, optimum || 2000, pIndex, mealActivityContext);
        }, [meal?.items, mealTypeInfo.type, optimum, pIndex, mealActivityContext]);

        const qualityLineColor = mealQuality
            ? mealQuality.color
            : (meal?.items?.length > 0 ? '#9ca3af' : 'transparent');

        const mealCardClass = isCurrentMeal ? 'card tone-green meal-card meal-card--current' : 'card tone-slate meal-card';
        const mealCardStyle = {
            marginTop: '8px',
            width: '100%',
            position: 'relative',
            paddingLeft: '12px',
            ...(isCurrentMeal
                ? {
                    border: '2px solid #22c55e',
                    boxShadow: '0 4px 12px rgba(34,197,94,0.25)',
                }
                : {}),
        };
        const computeDerivedProductFn = M.computeDerivedProduct || ((prod) => prod || {});

        const InsulinWave = HEYS.InsulinWave || {};
        const IWUtils = InsulinWave.utils || {};
        const insulinWaveData = insulinWaveDataProp || {};
        const waveHistorySorted = React.useMemo(() => {
            const list = insulinWaveData.waveHistory || [];
            if (!IWUtils.normalizeToHeysDay) return [...list].sort((a, b) => a.startMin - b.startMin);
            return [...list].sort((a, b) => IWUtils.normalizeToHeysDay(a.startMin) - IWUtils.normalizeToHeysDay(b.startMin));
        }, [insulinWaveData.waveHistory]);

        const currentWaveIndex = React.useMemo(() => waveHistorySorted.findIndex((w) => w.time === meal.time), [waveHistorySorted, meal.time]);
        const currentWave = currentWaveIndex >= 0 ? waveHistorySorted[currentWaveIndex] : null;
        const prevWave = currentWaveIndex > 0 ? waveHistorySorted[currentWaveIndex - 1] : null;
        const nextWave = (currentWaveIndex >= 0 && currentWaveIndex < waveHistorySorted.length - 1) ? waveHistorySorted[currentWaveIndex + 1] : null;
        const hasOverlapWithNext = currentWave && nextWave ? currentWave.endMin > nextWave.startMin : false;
        const hasOverlapWithPrev = currentWave && prevWave ? prevWave.endMin > currentWave.startMin : false;
        const hasAnyOverlap = hasOverlapWithNext || hasOverlapWithPrev;
        const lipolysisGapNext = currentWave && nextWave ? Math.max(0, nextWave.startMin - currentWave.endMin) : 0;
        const overlapMinutes = hasOverlapWithNext
            ? currentWave.endMin - nextWave.startMin
            : hasOverlapWithPrev
                ? prevWave.endMin - currentWave.startMin
                : 0;
        const [waveExpanded, setWaveExpanded] = React.useState(true);
        const [showWaveCalcPopup, setShowWaveCalcPopup] = React.useState(false);
        const showWaveButton = !!(currentWave && meal.time && (meal.items || []).length > 0);
        const formatMinutes = React.useCallback((mins) => {
            if (IWUtils.formatDuration) return IWUtils.formatDuration(mins);
            return `${Math.max(0, Math.round(mins))}м`;
        }, [IWUtils.formatDuration]);

        const toggleWave = React.useCallback(() => {
            const newState = !waveExpanded;
            setWaveExpanded(newState);
            if (HEYS.dayUtils?.haptic) HEYS.dayUtils.haptic('light');
            if (HEYS.analytics?.trackDataOperation) {
                HEYS.analytics.trackDataOperation('insulin_wave_meal_expand', {
                    action: newState ? 'open' : 'close',
                    hasOverlap: hasAnyOverlap,
                    overlapMinutes,
                    lipolysisGap: lipolysisGapNext,
                    mealIndex,
                });
            }
        }, [waveExpanded, hasAnyOverlap, overlapMinutes, lipolysisGapNext, mealIndex]);

        const getMoodEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '😊' : '😄';
        const getWellbeingEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '🤒' : v <= 4 ? '😓' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🏆';
        const getStressEmoji = (v) =>
            v <= 0 ? null : v <= 2 ? '😌' : v <= 4 ? '🙂' : v <= 6 ? '😐' : v <= 8 ? '😟' : '😰';

        const moodVal = +meal.mood || 0;
        const wellbeingVal = +meal.wellbeing || 0;
        const stressVal = +meal.stress || 0;
        const moodEmoji = getMoodEmoji(moodVal);
        const wellbeingEmoji = getWellbeingEmoji(wellbeingVal);
        const stressEmoji = getStressEmoji(stressVal);
        const hasRatings = moodVal > 0 || wellbeingVal > 0 || stressVal > 0;

        const [optimizerPopupOpen, setOptimizerPopupOpen] = React.useState(false);
        const [totalsExpanded, setTotalsExpanded] = React.useState(false);

        const optimizerRecsCount = React.useMemo(() => {
            const MO = HEYS.MealOptimizer;
            if (!MO || !meal?.items?.length) return 0;

            const recommendations = MO.getMealOptimization({
                meal,
                mealTotals: totals,
                dayData: dayData || {},
                profile: profile || {},
                products: products || [],
                pIndex,
                avgGI: totals?.gi || 50,
            });

            const filtered = recommendations.filter((r) => !MO.shouldHideRecommendation(r.id));

            const seen = new Set();
            return filtered.filter((r) => {
                const key = r.title.toLowerCase().trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).length;
        }, [meal, totals, dayData, profile, products, pIndex]);

        return React.createElement('div', { className: mealCardClass, 'data-meal-index': mealIndex, style: mealCardStyle },
            qualityLineColor !== 'transparent' && React.createElement('div', {
                className: 'meal-quality-line',
                style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    borderRadius: '12px 0 0 12px',
                    background: qualityLineColor,
                    transition: 'background 0.3s ease',
                },
            }),
            React.createElement('div', {
                className: 'meal-header-inside meal-type-' + mealTypeInfo.type,
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    background: qualityLineColor !== 'transparent'
                        ? qualityLineColor + '1F'
                        : undefined,
                    borderRadius: '10px 10px 0 0',
                    margin: '-12px -12px 8px -4px',
                    padding: '12px 16px 12px 8px',
                },
            },
                timeDisplay && React.createElement('span', {
                    className: 'meal-time-badge-inside',
                    onClick: () => openTimeEditor(mealIndex),
                    title: 'Изменить время',
                    style: { fontSize: '15px', padding: '6px 14px', fontWeight: '700', flexShrink: 0 },
                }, timeDisplay),
                React.createElement('div', { className: 'meal-type-wrapper', style: { flex: 1, display: 'flex', justifyContent: 'center' } },
                    React.createElement('span', { className: 'meal-type-label', style: { fontSize: '16px', fontWeight: '700', padding: '4px 12px' } },
                        mealTypeInfo.icon + ' ' + mealTypeInfo.name,
                        React.createElement('span', { className: 'meal-type-arrow' }, ' ▾'),
                    ),
                    React.createElement('select', {
                        className: 'meal-type-select',
                        value: manualType || '',
                        onChange: (e) => {
                            changeMealType(e.target.value || null);
                        },
                        title: 'Изменить тип приёма',
                    }, [
                        { value: '', label: '🔄 Авто' },
                        { value: 'breakfast', label: '🍳 Завтрак' },
                        { value: 'snack1', label: '🍎 Перекус' },
                        { value: 'lunch', label: '🍲 Обед' },
                        { value: 'snack2', label: '🥜 Перекус' },
                        { value: 'dinner', label: '🍽️ Ужин' },
                        { value: 'snack3', label: '🧀 Перекус' },
                        { value: 'night', label: '🌙 Ночной' },
                    ].map((opt) =>
                        React.createElement('option', { key: opt.value, value: opt.value }, opt.label),
                    )),
                ),
                React.createElement('span', { className: 'meal-kcal-badge-inside', style: { fontSize: '15px', padding: '6px 14px', flexShrink: 0 } },
                    mealKcal > 0 ? (mealKcal + ' ккал') : '0 ккал',
                ),
                currentWave && currentWave.activityContext && React.createElement('span', {
                    className: 'activity-context-badge',
                    title: currentWave.activityContext.desc,
                    style: {
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        background: currentWave.activityContext.type === 'peri' ? '#22c55e33'
                            : currentWave.activityContext.type === 'post' ? '#3b82f633'
                                : currentWave.activityContext.type === 'pre' ? '#eab30833'
                                    : '#6b728033',
                        color: currentWave.activityContext.type === 'peri' ? '#16a34a'
                            : currentWave.activityContext.type === 'post' ? '#2563eb'
                                : currentWave.activityContext.type === 'pre' ? '#ca8a04'
                                    : '#374151',
                        fontWeight: '600',
                        flexShrink: 0,
                        marginLeft: '4px',
                        whiteSpace: 'nowrap',
                    },
                }, currentWave.activityContext.badge || ''),
            ),
            mealActivityContext && mealActivityContext.type !== 'none' && (meal.items || []).length === 0
            && React.createElement('div', {
                className: 'training-context-hint',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    margin: '0 -4px 8px -4px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.4',
                    background: mealActivityContext.type === 'peri' ? 'linear-gradient(135deg, #22c55e15, #22c55e25)'
                        : mealActivityContext.type === 'post' ? 'linear-gradient(135deg, #3b82f615, #3b82f625)'
                            : mealActivityContext.type === 'pre' ? 'linear-gradient(135deg, #eab30815, #eab30825)'
                                : 'linear-gradient(135deg, #6b728015, #6b728025)',
                    border: mealActivityContext.type === 'peri' ? '1px solid #22c55e40'
                        : mealActivityContext.type === 'post' ? '1px solid #3b82f640'
                            : mealActivityContext.type === 'pre' ? '1px solid #eab30840'
                                : '1px solid #6b728040',
                    color: mealActivityContext.type === 'peri' ? '#16a34a'
                        : mealActivityContext.type === 'post' ? '#2563eb'
                            : mealActivityContext.type === 'pre' ? '#ca8a04'
                                : '#374151',
                },
            },
                React.createElement('span', { style: { fontSize: '18px' } }, mealActivityContext.badge || '🏋️'),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontWeight: 600, marginBottom: '2px' } },
                        mealActivityContext.type === 'peri' ? '🔥 Топливо для тренировки!'
                            : mealActivityContext.type === 'post' ? '💪 Анаболическое окно!'
                                : mealActivityContext.type === 'pre' ? '⚡ Скоро тренировка!'
                                    : mealActivityContext.type === 'steps' ? '👟 Активный день!'
                                        : mealActivityContext.type === 'double' ? '🏆 Двойная тренировка!'
                                            : '🎯 Хорошее время!'
                    ),
                    React.createElement('div', { style: { opacity: 0.85, fontSize: '12px' } },
                        mealActivityContext.type === 'peri'
                            ? 'Еда пойдёт в энергию, а не в жир. Вред снижен на ' + Math.round((1 - (mealActivityContext.harmMultiplier || 1)) * 100) + '%'
                            : mealActivityContext.type === 'post'
                                ? 'Нутриенты усвоятся в мышцы. Отличное время для белка!'
                                : mealActivityContext.type === 'pre'
                                    ? 'Лёгкие углеводы дадут энергию для тренировки'
                                    : mealActivityContext.type === 'steps'
                                        ? 'Высокая активность улучшает метаболизм'
                                        : mealActivityContext.type === 'double'
                                            ? 'Двойная нагрузка — можно есть смелее!'
                                            : 'Инсулиновая волна будет короче'
                    ),
                ),
            ),
            React.createElement('div', { className: 'row desktop-add-product', style: { justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { className: 'section-title' }, 'Добавить продукт'),
                React.createElement('div', { className: 'aps-open-buttons' },
                    React.createElement(MealAddProduct, {
                        mi: mealIndex,
                        products,
                        date,
                        setDay,
                        isCurrentMeal,
                        buttonText: 'Быстро добавить 1 продукт',
                        buttonIcon: '⚡',
                        buttonClassName: 'aps-open-btn--quick',
                        highlightCurrent: false,
                        ariaLabel: 'Быстро добавить 1 продукт'
                    }),
                    React.createElement(MealAddProduct, {
                        mi: mealIndex,
                        products,
                        date,
                        setDay,
                        isCurrentMeal,
                        multiProductMode: true,
                        buttonText: 'Добавить несколько продуктов',
                        buttonIcon: '➕',
                        buttonClassName: 'aps-open-btn--multi',
                        highlightCurrent: true,
                        ariaLabel: 'Добавить несколько продуктов'
                    }),
                ),
            ),
            React.createElement('div', { style: { overflowX: 'auto', marginTop: '8px' } }, React.createElement('table', { className: 'tbl meals-table' },
                React.createElement('thead', null, React.createElement('tr', null, headerMeta.map((h, i) => React.createElement('th', {
                    key: 'h' + i,
                    className: h.per100 ? 'per100-col' : undefined,
                    dangerouslySetInnerHTML: { __html: h.label },
                })))),
                React.createElement('tbody', null,
                    (meal.items || []).map((it) => React.createElement(ProductRow, {
                        key: it.id,
                        item: it,
                        mealIndex,
                        isNew: isNewItem(it.id),
                        pIndex,
                        setGrams,
                        removeItem,
                    })),
                    React.createElement('tr', { className: 'tr-sum' },
                        React.createElement('td', { className: 'fw-600' }, ''),
                        React.createElement('td', null, ''),
                        React.createElement('td', { colSpan: 10 }, React.createElement('div', { className: 'table-divider' })),
                        React.createElement('td', null, fmtVal('kcal', totals.kcal)),
                        React.createElement('td', null, fmtVal('carbs', totals.carbs)),
                        React.createElement('td', null, fmtVal('simple', totals.simple)),
                        React.createElement('td', null, fmtVal('complex', totals.complex)),
                        React.createElement('td', null, fmtVal('prot', totals.prot)),
                        React.createElement('td', null, fmtVal('fat', totals.fat)),
                        React.createElement('td', null, fmtVal('bad', totals.bad)),
                        React.createElement('td', null, fmtVal('good', totals.good)),
                        React.createElement('td', null, fmtVal('trans', totals.trans)),
                        React.createElement('td', null, fmtVal('fiber', totals.fiber)),
                        React.createElement('td', null, fmtVal('gi', totals.gi)),
                        React.createElement('td', null, fmtVal('harm', totals.harm)),
                        React.createElement('td', null, ''),
                    ),
                ),
            )),
            React.createElement('div', { className: 'mobile-products-list' },
                React.createElement('div', { className: 'mpc-toggle-add-row' + ((meal.items || []).length === 0 ? ' single' : '') },
                    (meal.items || []).length > 0 && React.createElement('div', {
                        className: 'mpc-products-toggle' + (isExpanded ? ' expanded' : ''),
                        onClick: () => onToggleExpand(mealIndex, allMeals),
                    },
                        React.createElement('span', { className: 'toggle-arrow' }, '›'),
                        React.createElement('span', { className: 'mpc-toggle-text' },
                            React.createElement('span', { className: 'mpc-toggle-title' }, isExpanded ? 'Свернуть' : 'Развернуть'),
                            React.createElement('span', { className: 'mpc-toggle-count' },
                                (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов'),
                            ),
                        ),
                    ),
                    React.createElement('div', { className: 'aps-open-buttons' },
                        React.createElement(MealAddProduct, {
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            buttonText: 'Быстро добавить 1 продукт',
                            buttonIcon: '⚡',
                            buttonClassName: 'aps-open-btn--quick',
                            highlightCurrent: false,
                            ariaLabel: 'Быстро добавить 1 продукт'
                        }),
                        React.createElement(MealAddProduct, {
                            mi: mealIndex,
                            products,
                            date,
                            setDay,
                            isCurrentMeal,
                            multiProductMode: true,
                            buttonText: 'Добавить несколько продуктов',
                            buttonIcon: '➕',
                            buttonClassName: 'aps-open-btn--multi',
                            highlightCurrent: true,
                            ariaLabel: 'Добавить несколько продуктов'
                        }),
                    ),
                ),
                isExpanded && (meal.items || []).map((it) => {
                    const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
                    const G = +it.grams || 0;
                    const per = per100(p);
                    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex ?? it.gi;
                    // Use centralized harm normalization with fallback to item
                    const harmVal = HEYS.models?.normalizeHarm?.(p) ?? HEYS.models?.normalizeHarm?.(it);

                    if (harmVal == null) {
                        logMissingHarm(p.name, it, 'mobile-card');
                    }

                    if (harmVal == null) {
                        logMissingHarm(p.name, it, 'mobile-card-compact');
                    }

                    const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';

                    const getHarmBg = (h) => {
                        if (h == null) return '#fff';
                        if (h <= 1) return '#34d399';
                        if (h <= 2) return '#6ee7b7';
                        if (h <= 3) return '#a7f3d0';
                        if (h <= 4) return '#d1fae5';
                        if (h <= 5) return '#bae6fd';
                        if (h <= 6) return '#e0f2fe';
                        if (h <= 7) return '#fecaca';
                        if (h <= 8) return '#fee2e2';
                        if (h <= 9) return '#fecdd3';
                        return '#f87171';
                    };
                    const harmBg = getHarmBg(harmVal);

                    const getHarmBadge = (h) => {
                        if (h == null) return null;
                        if (h <= 2) return { emoji: '🌿', text: 'полезный', color: '#059669' };
                        if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
                        return null;
                    };
                    const harmBadge = getHarmBadge(harmVal);

                    const getCategoryIcon = (cat) => {
                        if (!cat) return null;
                        const c = cat.toLowerCase();
                        if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
                        if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
                        if (c.includes('рыб') || c.includes('морепр')) return '🐟';
                        if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
                        if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
                        if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
                        if (c.includes('яйц')) return '🥚';
                        if (c.includes('орех') || c.includes('семеч')) return '🥜';
                        if (c.includes('масл')) return '🫒';
                        if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
                        if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
                        if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
                        return '🍽️';
                    };
                    const categoryIcon = getCategoryIcon(p.category);

                    const findAlternative = (prod, allProducts) => {
                        // Smart Alternative v1.0: semantic category + macro similarity + multi-factor scoring
                        const _LOG = '[HEYS.prodRec]';
                        if (!allProducts || allProducts.length < 2) {
                            console.info(_LOG, '⛔ skip: allProducts empty or single', { product: prod?.name, poolSize: allProducts?.length });
                            return null;
                        }
                        const currentKcal = per.kcal100 || 0;
                        if (currentKcal < 50) {
                            console.info(_LOG, '⛔ skip: product kcal too low (< 50)', { product: prod?.name, kcal: currentKcal });
                            return null;
                        }

                        console.info(_LOG, '🔍 START findAlternative', {
                            product: prod.name,
                            kcal: currentKcal,
                            prot: per.prot100 || 0,
                            carbs: per.carbs100 || 0,
                            fat: per.fat100 || 0,
                            harm: prod.harm ?? harmVal ?? 0,
                            gi: prod.gi ?? 50,
                            fiber: per.fiber100 || 0,
                            category: prod.category || '—',
                            poolSize: allProducts.length,
                        });

                        // Actual calories consumed at the real portion the user ate (G = grams from closure)
                        // Early harm eval — needed for good-product guard (#6) and harm-only fallback (#4)
                        const origHarm = prod.harm ?? harmVal ?? 0;
                        // #6 Guard: product already good — no value in recommending a swap
                        if (origHarm <= 1 && currentKcal <= 200) {
                            console.info(_LOG, '⛔ skip: product already good (harm≤1 + kcal≤200)', { product: prod.name, harm: origHarm, kcal: currentKcal });
                            return null;
                        }
                        const actualCurrentKcal = Math.round(currentKcal * G / 100);
                        // Tiny portion guard: swapping < 20g serving is nonsensical (e.g. 11g almonds)
                        if (G > 0 && G < 20) {
                            console.info(_LOG, '⛔ skip: portion too small (< 20г) — swap makes no sense', { product: prod?.name, grams: G, actualKcal: actualCurrentKcal });
                            return null;
                        }
                        // Helper: typical portion (grams) a person would eat of a given product
                        const getTypicalGrams = (altProd) => {
                            const sp = HEYS.MealOptimizer?.getSmartPortion?.(altProd);
                            return sp?.grams || 100;
                        };

                        // Semantic category detection (Product Picker if available, else keyword fallback)
                        const _detectCat = HEYS.InsightsPI?.productPicker?._internal?.detectCategory;
                        const _catSource = _detectCat ? 'ProductPicker' : 'keyword-fallback';
                        const getSemanticCat = (name, fallbackCat) => {
                            // Priority sub-categories — override ProductPicker for specific use-cases
                            const _n = (name || '').toLowerCase();
                            // Guard: "блюдо в майонезе" — майонез как ингредиент, а не соус сам по себе
                            // Note: '(в майонезе)' has '(' before 'в', not space — use includes without leading space
                            const _sauceAsIngredient = _n.includes('в майонезе') || _n.includes('с майонезом') ||
                                _n.includes('в кетчупе') || _n.includes('в горчиц') ||
                                _n.includes('в соусе') || _n.includes('с соусом');
                            if (!_sauceAsIngredient && (
                                _n.includes('майонез') || _n.includes('кетчуп') || _n.includes('горчиц') ||
                                _n.startsWith('соус') || _n.includes(' соус') || _n.includes('уксус') ||
                                _n.includes('заправк') || _n.includes('аджик') || _n.includes('хрен') ||
                                _n.includes('васаби') || _n.includes('песто') || _n.includes('тахини') ||
                                _n.includes('ткемали'))) return 'sauce';
                            if (_n.includes('шоколад') || _n.includes('мороженое') || _n.includes('пломбир') ||
                                _n.includes('сорбет') || _n.includes('тирамису') || _n.includes('торт') ||
                                _n.includes('пирожн') || _n.includes('вафл') || _n.includes('круасс') ||
                                _n.includes('суфле') || _n.includes('макарун') ||
                                _n.includes('сгущён') || _n.includes('пудинг') || _n.includes('конфет') ||
                                _n.includes('мармелад') || _n.includes('зефир') || _n.includes('халва') ||
                                _n.includes('варень') || _n.includes('джем') || _n.includes('нутелл') ||
                                _n.includes('карамел') || _n.includes('пастил') || _n.includes('трюфел')) return 'dessert_sweet';
                            if (_n.includes('колбас') || _n.includes('сосис') || _n.includes('сарделька') ||
                                _n.includes('ветчин') || _n.includes('бекон') || _n.includes('паштет') ||
                                _n.includes('сервелат') || _n.includes('буженин') || _n.includes('балык') ||
                                _n.includes('карбонад') || _n.includes('салями') || _n.includes('прошутто')) return 'processed_meat';
                            if (_n.includes('газировк') || _n.includes('кола') || _n.includes('лимонад') ||
                                _n.includes('компот') || _n.includes('морс') || _n.includes('нектар') ||
                                _n.includes('квас')) return 'drink';
                            if (_n.startsWith('масло ') || _n.includes(' масло ') ||
                                _n.includes('масло сливочн') || _n.includes('масло растительн') ||
                                _n.includes('масло оливков') || _n.includes('масло подсолнечн') ||
                                _n.includes('масло кокосов') || _n.includes('масло кунжутн') ||
                                _n.includes('масло льнян')) return 'oil';
                            // Grains: ProductPicker пропускает блины/оладьи/лепёшки/овсяные хлопья
                            if (_n.includes('блин') || _n.includes('оладь') || _n.includes('лепёшк') ||
                                _n.includes('пицц') || _n.includes('тортилья') || _n.includes('лаваш') ||
                                _n.startsWith('овсян') || _n.includes('овсяные') || _n.includes('овсяных')) return 'grains';
                            if (_detectCat) return _detectCat(name || '');
                            const c = (fallbackCat || name || '').toLowerCase();
                            if (c.includes('молоч') || c.includes('кефир') || c.includes('творог') || c.includes('йогур') || c.includes('сыр')) return 'dairy';
                            if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говяд') || c.includes('рыб') || c.includes('морепр') || c.includes('яйц')) return 'protein';
                            if (c.includes('овощ') || c.includes('фрукт') || c.includes('ягод') || c.includes('зелен') || c.includes('салат')) return 'vegetables';
                            if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('макарон')) return 'grains';
                            if (c.includes('орех') || c.includes('семеч') || c.includes('миндал') || c.includes('фундук')) return 'snacks';
                            return 'other';
                        };
                        const getGrainSubtype = (name) => {
                            const _n = (name || '').toLowerCase();
                            if (_n.includes('овсян') || _n.includes('каша') || _n.includes('мюсли') ||
                                _n.includes('гранол') || _n.includes('хлопь') || _n.includes('отруб')) return 'breakfast_grain';
                            if (_n.includes('блин') || _n.includes('оладь') || _n.includes('лепёшк') ||
                                _n.includes('тортилья') || _n.includes('лаваш') || _n.includes('пицц')) return 'flatbread_grain';
                            if (_n.includes('макарон') || _n.includes('паста') || _n.includes('лапша') ||
                                _n.includes('спагет')) return 'pasta_grain';
                            return 'generic_grain';
                        };
                        const getLateEveningPreparationPenalty = (name, scenario, semCat) => {
                            if (!(scenario === 'LATE_EVENING' || scenario === 'PRE_SLEEP')) return 0;
                            const _n = (name || '').toLowerCase();
                            const _isFried = _n.includes('жарен') || _n.includes('фритюр');
                            const _isDoughy = _n.includes('блин') || _n.includes('оладь') || _n.includes('пицц') ||
                                _n.includes('лаваш') || _n.includes('лепёшк') || _n.includes('тортилья');
                            if (_isFried) return -10;
                            if (_isDoughy && semCat === 'grains') return -8;
                            if (_isDoughy) return -5;
                            return 0;
                        };
                        const getFoodFormFactor = (name, semCat) => {
                            const _n = (name || '').toLowerCase();
                            const _isSpreadableToken =
                                semCat === 'sauce' || semCat === 'oil' ||
                                _n.includes('творожн') && _n.includes('сыр') ||
                                _n.includes('сливочн') && _n.includes('сыр') ||
                                _n.includes('крем-сыр') || _n.includes('плавлен') ||
                                _n.includes('намазк') || _n.includes('паштет') ||
                                _n.includes('хумус') || _n.includes('арахисов') && _n.includes('паста');
                            const _isDishToken =
                                _n.includes('ролл') || _n.includes('сэндвич') || _n.includes('бургер') ||
                                _n.includes('шаурм') || _n.includes('брускет') || _n.includes('суши') ||
                                _n.includes('суп') || _n.includes('котлет') || _n.includes('тефтел') ||
                                _n.includes('куриц') || _n.includes('индейк') || _n.includes('говядин') ||
                                _n.includes('свинин') || _n.includes('рыба') || _n.includes('лосос') ||
                                _n.includes('минтай') || _n.includes('салат') || _n.includes('запек') ||
                                _n.includes('туш') || _n.includes('шашлык') || _n.includes('плов') ||
                                _n.includes('омлет') || _n.includes('жаркое');
                            // В композитных блюдах (например, ролл с творожным сыром)
                            // spreadable ингредиент не должен определять форму всего продукта.
                            if (_isDishToken) return 'solid_meal';
                            if (_isSpreadableToken) return 'spreadable';
                            if (semCat === 'drink' || _n.includes('кефир') || _n.includes('йогурт пить')) return 'liquid';
                            return 'neutral';
                        };
                        // Dominant macro fallback: for products where semantic cat = 'other'
                        const getDominantMacro = (prot, carbs, fat, kcal) => {
                            if (!kcal || kcal < 1) return 'macro_mixed';
                            if ((prot * 3) / kcal >= 0.35) return 'macro_protein';
                            if ((fat * 9) / kcal >= 0.55) return 'macro_fat';
                            if ((carbs * 4) / kcal >= 0.50) return 'macro_carb';
                            return 'macro_mixed';
                        };
                        const origSemCat = getSemanticCat(prod.name, prod.category);
                        const origFormFactor = getFoodFormFactor(prod.name, origSemCat);
                        const origMacroCat = origSemCat === 'other'
                            ? getDominantMacro(per.prot100 || 0, per.carbs100 || 0, per.fat100 || 0, currentKcal)
                            : null;
                        const origGrainSubtype = origSemCat === 'grains' ? getGrainSubtype(prod.name) : null;

                        console.info(_LOG, '🏷️ category detection', {
                            catSource: _catSource,
                            semCat: origSemCat,
                            formFactor: origFormFactor,
                            macroCat: origMacroCat || '—',
                            grainSubtype: origGrainSubtype || '—',
                        });

                        // Candidate pool: client products + shared products (#8 try multiple access paths)
                        const _sharedList = (() => {
                            const _paths = [
                                HEYS.cloud?.getCachedSharedProducts?.(),
                                HEYS.products?.shared,
                                HEYS.products?.getShared?.(),
                                HEYS.products?.sharedProducts,
                                HEYS.products?.all?.filter?.((p) => p._shared || p.shared),
                            ];
                            for (const _p of _paths) {
                                if (Array.isArray(_p) && _p.length > 0) return _p;
                            }
                            return [];
                        })();
                        const _clientIds = new Set(allProducts.map((ap) => ap.id));
                        const candidatePool = [
                            ...allProducts.map((ap) => ({ ...ap, _familiar: true })),
                            ..._sharedList.filter((sp) => sp && sp.id && !_clientIds.has(sp.id)).map((sp) => ({ ...sp, _familiar: false })),
                        ];

                        console.info(_LOG, '📦 candidate pool built', {
                            clientProducts: allProducts.length,
                            sharedProducts: _sharedList.length,
                            totalPool: candidatePool.length,
                        });

                        // #3 Exclude ALL products already in this meal (other items in same sitting)
                        const _mealItemIds = new Set(
                            (meal?.items || []).map((mi) => mi.product_id || mi.id).filter(Boolean)
                        );
                        // #2 Adaptive noSaving threshold: low-kcal products need softer filter
                        const _noSavingThreshold = currentKcal < 200 ? 0.75 : 0.90;
                        // Filter: real food, category-compatible, meaningful saving
                        const _rejectLog = { selfMatch: 0, mealItem: 0, lowKcal: 0, lowMacro: 0, noSaving: 0, tooLowKcal: 0, wrongCat: 0, formMismatch: 0, grainSubtypeMismatch: 0, passed: 0 };
                        const candidates = candidatePool.filter((alt) => {
                            if (alt.id === prod.id) { _rejectLog.selfMatch++; return false; }
                            if (_mealItemIds.has(alt.id) || _mealItemIds.has(alt.product_id)) { _rejectLog.mealItem++; return false; }
                            const altDer = computeDerivedProductFn(alt);
                            const altKcal = alt.kcal100 || altDer.kcal100 || 0;
                            if (altKcal < 30) { _rejectLog.lowKcal++; return false; } // exclude supplements/spices/teas
                            const altMacroSum = (alt.prot100 || altDer.prot100 || 0)
                                + (alt.fat100 || altDer.fat100 || 0)
                                + ((alt.simple100 || 0) + (alt.complex100 || 0) || alt.carbs100 || altDer.carbs100 || 0);
                            if (altMacroSum < 5) { _rejectLog.lowMacro++; return false; } // not real food
                            if (altKcal >= currentKcal * _noSavingThreshold) { _rejectLog.noSaving++; return false; } // adaptive: 75% for <200kcal, 90% otherwise
                            if (altKcal < currentKcal * 0.15) { _rejectLog.tooLowKcal++; return false; } // guard: cap at 85% saving
                            const altSemCat = getSemanticCat(alt.name, alt.category);
                            const altFormFactor = getFoodFormFactor(alt.name, altSemCat);
                            if (origSemCat === 'grains' && origGrainSubtype === 'breakfast_grain') {
                                const altGrainSubtype = getGrainSubtype(alt.name);
                                if (altGrainSubtype === 'flatbread_grain') {
                                    _rejectLog.grainSubtypeMismatch++;
                                    return false;
                                }
                            }
                            if (origSemCat !== 'other') {
                                if (altSemCat !== origSemCat) { _rejectLog.wrongCat++; return false; }
                            } else {
                                const altMacroCat = getDominantMacro(
                                    alt.prot100 || altDer.prot100 || 0,
                                    alt.carbs100 || altDer.carbs100 || 0,
                                    alt.fat100 || altDer.fat100 || 0,
                                    altKcal,
                                );
                                if (origMacroCat !== 'macro_mixed' && altMacroCat !== 'macro_mixed' && origMacroCat !== altMacroCat) { _rejectLog.wrongCat++; return false; }
                            }
                            // Hard guard: spreadable products should only be replaced with spreadable products
                            if (origFormFactor === 'spreadable' && altFormFactor !== 'spreadable') {
                                _rejectLog.formMismatch++;
                                return false;
                            }
                            _rejectLog.passed++;
                            return true;
                        });

                        console.info(_LOG, '🔬 filter results', {
                            ..._rejectLog,
                            passedCandidates: candidates.map((c) => c.name),
                        });

                        if (candidates.length === 0) {
                            console.info(_LOG, '❌ no candidates after filter — no recommendation');
                            return null;
                        }

                        // Pre-compute original macro energy fractions
                        // origHarm already declared above (early guard section)
                        const origGI = prod.gi ?? 50;
                        const origProtEn = (per.prot100 || 0) * 3 / currentKcal;
                        const origCarbEn = (per.carbs100 || 0) * 4 / currentKcal;
                        const origFatEn = (per.fat100 || 0) * 9 / currentKcal;
                        const origFiber = per.fiber100 || 0;

                        // Build Product Picker scenario context (best effort)
                        let _pickerFn = null;
                        let _pickerScenario = null;
                        try {
                            _pickerFn = HEYS.InsightsPI?.productPicker?.calculateProductScore;
                            if (_pickerFn && meal?.time) {
                                const _mealHour = parseInt(meal.time.split(':')[0], 10);
                                _pickerScenario = {
                                    scenario: _mealHour >= 22 ? 'PRE_SLEEP' : _mealHour >= 20 ? 'LATE_EVENING' : 'BALANCED',
                                    remainingKcal: optimum ? Math.max(0, optimum - currentKcal) : 500,
                                    currentTime: _mealHour,
                                    targetProtein: profile?.targetProtein || 100,
                                    sugarDependencyRisk: false,
                                    fiberRegularityScore: 0.5,
                                    micronutrientDeficits: [],
                                    novaQualityScore: 0.5,
                                    targetGL: _mealHour >= 20 ? 10 : 20,
                                };
                                console.info(_LOG, '⚙️ ProductPicker scenario', _pickerScenario);
                            } else {
                                console.info(_LOG, '⚙️ ProductPicker unavailable — using neutral pickerScore=50', {
                                    hasFn: !!_pickerFn,
                                    mealTime: meal?.time || '—',
                                });
                            }
                        } catch (e) {
                            _pickerFn = null;
                            console.warn(_LOG, '⚠️ ProductPicker scenario build failed:', e?.message);
                        }

                        let best = null;
                        let bestComposite = -Infinity;
                        const scoredCandidates = [];
                        for (const alt of candidates) {
                            try {
                                const altDer = computeDerivedProductFn(alt);
                                const altKcal = alt.kcal100 || altDer.kcal100 || 1;
                                const altProt = alt.prot100 || altDer.prot100 || 0;
                                const altCarbs = alt.carbs100 || altDer.carbs100 || 0;
                                const altFat = alt.fat100 || altDer.fat100 || 0;
                                const altFiber = alt.fiber100 || altDer.fiber100 || 0;
                                const altGI = alt.gi ?? 50;
                                const altHarm = alt.harm ?? 0;
                                // 5. Portion-aware reality check: compare realistic serving calories
                                const typicalAltGrams = getTypicalGrams(alt);
                                const actualAltKcal = Math.round(altKcal * typicalAltGrams / 100);
                                const portionKcalRatio = actualAltKcal / Math.max(1, actualCurrentKcal);
                                // If replacement realistically means >50% more calories → skip entirely
                                if (portionKcalRatio > 1.5) {
                                    console.info(_LOG, '🚫 portion skip (would eat more kcal in real serving):', {
                                        name: alt.name,
                                        typicalAltGrams,
                                        actualAltKcal,
                                        vs: actualCurrentKcal,
                                        ratio: Math.round(portionKcalRatio * 100) + '%',
                                    });
                                    continue;
                                }
                                let portionPenalty = 0;
                                let portionMode = 'real_saving';
                                if (portionKcalRatio > 1.0) {
                                    portionPenalty = -10; // per-100g better but real serving ≈ same/more kcal
                                    portionMode = 'composition';
                                }
                                // 1. Macro similarity (0–100)
                                const macroSimilarity = Math.max(0,
                                    100
                                    - Math.abs(origProtEn - (altProt * 3 / altKcal)) * 150
                                    - Math.abs(origCarbEn - (altCarbs * 4 / altKcal)) * 100
                                    - Math.abs(origFatEn - (altFat * 9 / altKcal)) * 100,
                                );
                                // 2. Improvement: harm reduction + soft kcal saving + fiber
                                const savingPct = Math.round((1 - altKcal / currentKcal) * 100);
                                const harmImprov = Math.min(50, Math.max(-20, (origHarm - altHarm) * 15));
                                const fiberBonus = altFiber > origFiber + 1 ? 10 : 0;
                                const improvementScore = harmImprov + Math.min(35, savingPct * 0.45) + fiberBonus;
                                // 3. Familiarity bonus
                                const familiarBonus = alt._familiar ? 10 : 0;
                                // 3.1 Grains subtype bias: keep breakfast grains close to breakfast grains
                                const altSemCatForScore = getSemanticCat(alt.name, alt.category);
                                const altFormFactor = getFoodFormFactor(alt.name, altSemCatForScore);
                                const altGrainSubtype = origSemCat === 'grains' ? getGrainSubtype(alt.name) : null;
                                let grainSubtypeBonus = 0;
                                if (origGrainSubtype && altGrainSubtype) {
                                    if (origGrainSubtype === altGrainSubtype) {
                                        grainSubtypeBonus = 8;
                                    } else if (
                                        (origGrainSubtype === 'breakfast_grain' && altGrainSubtype === 'flatbread_grain') ||
                                        (origGrainSubtype === 'flatbread_grain' && altGrainSubtype === 'breakfast_grain')
                                    ) {
                                        grainSubtypeBonus = -12;
                                    } else {
                                        grainSubtypeBonus = -4;
                                    }
                                }
                                const eveningPrepPenalty = getLateEveningPreparationPenalty(
                                    alt.name,
                                    _pickerScenario?.scenario,
                                    altSemCatForScore,
                                );
                                let formFactorBonus = 0;
                                if (origFormFactor === 'spreadable' && altFormFactor !== 'spreadable') {
                                    formFactorBonus = altFormFactor === 'solid_meal' ? -24 : -12;
                                } else if (origFormFactor === altFormFactor && origFormFactor !== 'neutral') {
                                    formFactorBonus = 6;
                                }
                                // 4. Product Picker contextual score (optional)
                                // calculateProductScore returns { totalScore, breakdown } — extract number!
                                let pickerScore = 50;
                                if (_pickerFn && _pickerScenario) {
                                    try {
                                        const _pickerResult = _pickerFn({
                                            name: alt.name,
                                            macros: { protein: altProt, carbs: altCarbs, fat: altFat, kcal: altKcal },
                                            harm: altHarm, gi: altGI,
                                            category: getSemanticCat(alt.name, alt.category),
                                            familiarityScore: alt._familiar ? 7 : 3,
                                            fiber: altFiber, nova_group: alt.novaGroup || 2,
                                        }, _pickerScenario);
                                        // Return is always an object { totalScore, breakdown }
                                        pickerScore = typeof _pickerResult?.totalScore === 'number'
                                            ? _pickerResult.totalScore
                                            : (typeof _pickerResult === 'number' ? _pickerResult : 50);
                                    } catch (e) {
                                        console.warn(_LOG, '⚠️ pickerFn threw for', alt?.name, e?.message);
                                        pickerScore = 50;
                                    }
                                }
                                // Composite: productPicker 35% + macroSimilarity 30% + improvement 25% + familiarity 10% + portionPenalty + grains subtype bias + late-evening preparation penalty
                                const composite = pickerScore * 0.35 + macroSimilarity * 0.30 + improvementScore * 0.25 + familiarBonus * 0.10 + portionPenalty + grainSubtypeBonus + eveningPrepPenalty + formFactorBonus;
                                scoredCandidates.push({
                                    name: alt.name,
                                    kcal: altKcal,
                                    harm: altHarm,
                                    saving: savingPct,
                                    familiar: alt._familiar,
                                    portionMode,
                                    typicalAltGrams,
                                    actualAltKcal,
                                    scores: {
                                        picker: Math.round(pickerScore * 10) / 10,
                                        macroSim: Math.round(macroSimilarity * 10) / 10,
                                        improvement: Math.round(improvementScore * 10) / 10,
                                        familiarBonus,
                                        portionPenalty,
                                        grainSubtypeBonus,
                                        eveningPrepPenalty,
                                        formFactorBonus,
                                        composite: Math.round(composite * 10) / 10,
                                    },
                                    breakdown: {
                                        harmImprov: Math.round(harmImprov * 10) / 10,
                                        savingBonus: Math.round(Math.min(35, savingPct * 0.45) * 10) / 10,
                                        fiberBonus,
                                        grainSubtype: origSemCat === 'grains'
                                            ? `${origGrainSubtype || '—'}→${altGrainSubtype || '—'}`
                                            : '—',
                                        prepPenaltyReason: eveningPrepPenalty < 0 ? 'late-evening fried/doughy' : 'none',
                                        formFactor: `${origFormFactor}→${altFormFactor}`,
                                    },
                                });
                                if (composite > bestComposite) {
                                    bestComposite = composite;
                                    best = { name: alt.name, saving: savingPct, score: Math.round(composite), portionMode, actualCurrentKcal, actualAltKcal, harmImproved: altHarm < origHarm - 0.5 };
                                }
                            } catch (e) {
                                console.warn(_LOG, '⚠️ scoring error for candidate', alt?.name, e?.message);
                            }
                        }

                        // Log all scored candidates sorted by composite desc
                        const sortedLog = [...scoredCandidates].sort((a, b) => b.scores.composite - a.scores.composite);
                        console.info(_LOG, '📊 scoring table (desc)', sortedLog.map((c) => ({
                            name: c.name,
                            kcal: c.kcal,
                            saving: c.saving + '%',
                            harm: c.harm,
                            familiar: c.familiar,
                            portionMode: c.portionMode,
                            portion: `${c.typicalAltGrams}г → ${c.actualAltKcal}ккал (orig ${actualCurrentKcal}ккал)`,
                            composite: c.scores.composite,
                            breakdown: `picker=${c.scores.picker} | macroSim=${c.scores.macroSim} | improv=${c.scores.improvement}(harm=${c.breakdown.harmImprov},save=${c.breakdown.savingBonus},fiber=${c.breakdown.fiberBonus}) | fam=${c.scores.familiarBonus} | grainSubtype=${c.scores.grainSubtypeBonus}(${c.breakdown.grainSubtype}) | portionPenalty=${c.scores.portionPenalty} | eveningPrep=${c.scores.eveningPrepPenalty}(${c.breakdown.prepPenaltyReason}) | form=${c.scores.formFactorBonus}(${c.breakdown.formFactor})`,
                        })));

                        if (!best || bestComposite < 28) {
                            // #4 Harm-only fallback: original product is harmful — recommend cleaner option
                            // even when no kcal saving is achievable (e.g. Краковская колбаса harm=8.5)
                            if (origHarm >= 3) {
                                const _harmPool = candidatePool.filter((alt) => {
                                    if (alt.id === prod.id || _mealItemIds.has(alt.id)) return false;
                                    const _altDer = computeDerivedProductFn(alt);
                                    const _altKcal2 = alt.kcal100 || _altDer.kcal100 || 0;
                                    const _altHarm2 = alt.harm ?? 0;
                                    if (_altKcal2 < 30) return false;
                                    if (_altHarm2 >= origHarm - 2) return false; // must be meaningfully cleaner
                                    const _typGrams2 = getTypicalGrams(alt);
                                    if (Math.round(_altKcal2 * _typGrams2 / 100) > actualCurrentKcal * 2) return false; // portion reality
                                    const _altSemCat2 = getSemanticCat(alt.name, alt.category);
                                    if (origSemCat !== 'other' && _altSemCat2 !== origSemCat) return false;
                                    return true;
                                });
                                if (_harmPool.length > 0) {
                                    const _hBest = _harmPool.reduce((a, b) => (a.harm ?? 0) < (b.harm ?? 0) ? a : b);
                                    const _hDer = computeDerivedProductFn(_hBest);
                                    const _hKcal = _hBest.kcal100 || _hDer.kcal100 || 1;
                                    const _hHarm = _hBest.harm ?? 0;
                                    const _hGrams = getTypicalGrams(_hBest);
                                    const _hActKcal = Math.round(_hKcal * _hGrams / 100);
                                    const _hSaving = Math.round((1 - _hKcal / currentKcal) * 100);
                                    console.info(_LOG, '✅ harm-only fallback selected', {
                                        original: prod.name, origHarm,
                                        replacement: _hBest.name, altHarm: _hHarm,
                                        portion: `${_hGrams}г → ${_hActKcal}ккал`,
                                        harmOnlyPool: _harmPool.length,
                                    });
                                    return { name: _hBest.name, saving: _hSaving, score: 0, portionMode: 'harm_only', actualCurrentKcal, actualAltKcal: _hActKcal, harmImproved: true, origHarm: Math.round(origHarm * 10) / 10, altHarm: _hHarm };
                                }
                            }
                            console.info(_LOG, '❌ no recommendation — below threshold, no harm-only fallback', {
                                bestName: best?.name || '—',
                                bestComposite: Math.round(bestComposite * 10) / 10,
                                origHarm,
                            });
                            return null;
                        }
                        console.info(_LOG, '✅ recommendation selected', {
                            original: prod.name,
                            originalKcal: currentKcal,
                            replacement: best.name,
                            saving: best.saving + '%',
                            composite: best.score,
                            portionMode: best.portionMode,
                            portion: `${G}г → ${best.actualCurrentKcal}ккал | замена ~${best.actualAltKcal}ккал`,
                            semCat: origSemCat,
                            grainSubtype: origGrainSubtype || '—',
                            macroCat: origMacroCat || '—',
                            candidatesTotal: candidates.length,
                        });
                        return best;
                    };
                    const alternative = findAlternative(p, products);

                    const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                            React.createElement('span', { className: 'mpc-name' }, p.name),
                            harmBadge && React.createElement('span', {
                                className: 'mpc-badge',
                                style: { color: harmBadge.color },
                            }, harmBadge.emoji),
                            React.createElement('button', {
                                className: 'mpc-grams-btn ' + gramsClass,
                                onClick: (e) => { e.stopPropagation(); openEditGramsModal(mealIndex, it.id, G, p); },
                            }, G + 'г'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                        alternative && React.createElement('div', { className: 'mpc-alternative' },
                            React.createElement('span', null, '💡 Замени на '),
                            React.createElement('strong', null, alternative.name),
                            React.createElement('span', null, (() => {
                                const _a = alternative;
                                if (_a.portionMode === 'harm_only') return ` — вред ${_a.origHarm} → ${_a.altHarm}`;
                                if (_a.portionMode === 'real_saving') {
                                    const _t = ` — ~${_a.actualAltKcal} ккал вместо ~${_a.actualCurrentKcal} ккал`;
                                    return _a.harmImproved ? _t + ', вред ниже' : _t;
                                }
                                return _a.harmImproved ? ' — полезнее по составу, вред ниже' : ' — полезнее по составу';
                            })()),
                        ),
                    );

                    if (isMobile && HEYS.SwipeableRow) {
                        return React.createElement(HEYS.SwipeableRow, {
                            key: it.id,
                            onDelete: () => removeItem(mealIndex, it.id),
                        }, cardContent);
                    }

                    return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
                        React.createElement('div', { className: 'mpc-row1' },
                            React.createElement('span', { className: 'mpc-name' }, p.name),
                            React.createElement('input', {
                                type: 'number',
                                className: 'mpc-grams',
                                value: G,
                                onChange: (e) => setGrams(mealIndex, it.id, e.target.value),
                                onFocus: (e) => e.target.select(),
                                onKeyDown: (e) => { if (e.key === 'Enter') e.target.blur(); },
                                'data-grams-input': true,
                                'data-meal-index': mealIndex,
                                'data-item-id': it.id,
                                inputMode: 'decimal',
                            }),
                            React.createElement('button', {
                                className: 'mpc-delete',
                                onClick: () => removeItem(mealIndex, it.id),
                            }, '×'),
                        ),
                        React.createElement('div', { className: 'mpc-grid mpc-header' },
                            React.createElement('span', null, 'ккал'),
                            React.createElement('span', null, 'У'),
                            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                            React.createElement('span', null, 'Б'),
                            React.createElement('span', null, 'Ж'),
                            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                            React.createElement('span', null, 'Кл'),
                            React.createElement('span', null, 'ГИ'),
                            React.createElement('span', null, 'Вр'),
                        ),
                        (() => {
                            const itemTotals = {
                                kcal: scale(per.kcal100, G),
                                carbs: scale(per.carbs100, G),
                                simple: scale(per.simple100, G),
                                complex: scale(per.complex100, G),
                                prot: scale(per.prot100, G),
                                fat: scale(per.fat100, G),
                                bad: scale(per.bad100, G),
                                good: scale(per.good100, G),
                                trans: scale(per.trans100 || 0, G),
                                fiber: scale(per.fiber100, G),
                                gi: giVal || 0,
                                harm: harmVal || 0,
                            };
                            return React.createElement('div', { className: 'mpc-grid mpc-values' },
                                React.createElement('span', { title: getNutrientTooltip('kcal', itemTotals.kcal, itemTotals), style: { color: getNutrientColor('kcal', itemTotals.kcal, itemTotals), fontWeight: getNutrientColor('kcal', itemTotals.kcal, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.kcal)),
                                React.createElement('span', { title: getNutrientTooltip('carbs', itemTotals.carbs, itemTotals), style: { color: getNutrientColor('carbs', itemTotals.carbs, itemTotals), fontWeight: getNutrientColor('carbs', itemTotals.carbs, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.carbs)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('simple', itemTotals.simple, itemTotals), style: { color: getNutrientColor('simple', itemTotals.simple, itemTotals), fontWeight: getNutrientColor('simple', itemTotals.simple, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.simple)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('complex', itemTotals.complex, itemTotals), style: { color: getNutrientColor('complex', itemTotals.complex, itemTotals), cursor: 'help' } }, Math.round(itemTotals.complex)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('prot', itemTotals.prot, itemTotals), style: { color: getNutrientColor('prot', itemTotals.prot, itemTotals), fontWeight: getNutrientColor('prot', itemTotals.prot, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.prot)),
                                React.createElement('span', { title: getNutrientTooltip('fat', itemTotals.fat, itemTotals), style: { color: getNutrientColor('fat', itemTotals.fat, itemTotals), fontWeight: getNutrientColor('fat', itemTotals.fat, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fat)),
                                React.createElement('span', { className: 'mpc-dim' },
                                    React.createElement('span', { title: getNutrientTooltip('bad', itemTotals.bad, itemTotals), style: { color: getNutrientColor('bad', itemTotals.bad, itemTotals), fontWeight: getNutrientColor('bad', itemTotals.bad, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.bad)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('good', itemTotals.good, itemTotals), style: { color: getNutrientColor('good', itemTotals.good, itemTotals), fontWeight: getNutrientColor('good', itemTotals.good, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.good)),
                                    '/',
                                    React.createElement('span', { title: getNutrientTooltip('trans', itemTotals.trans, itemTotals), style: { color: getNutrientColor('trans', itemTotals.trans, itemTotals), fontWeight: getNutrientColor('trans', itemTotals.trans, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.trans)),
                                ),
                                React.createElement('span', { title: getNutrientTooltip('fiber', itemTotals.fiber, itemTotals), style: { color: getNutrientColor('fiber', itemTotals.fiber, itemTotals), fontWeight: getNutrientColor('fiber', itemTotals.fiber, itemTotals) ? 600 : 400, cursor: 'help' } }, Math.round(itemTotals.fiber)),
                                React.createElement('span', { title: getNutrientTooltip('gi', itemTotals.gi, itemTotals), style: { color: getNutrientColor('gi', itemTotals.gi, itemTotals), fontWeight: getNutrientColor('gi', itemTotals.gi, itemTotals) ? 600 : 400, cursor: 'help' } }, giVal != null ? Math.round(giVal) : '-'),
                                React.createElement('span', { title: getNutrientTooltip('harm', itemTotals.harm, itemTotals), style: { color: getNutrientColor('harm', itemTotals.harm, itemTotals), fontWeight: getNutrientColor('harm', itemTotals.harm, itemTotals) ? 600 : 400, cursor: 'help' } }, harmVal != null ? fmtVal('harm', harmVal) : '-'),
                            );
                        })(),
                    );
                }),

                (meal.photos && meal.photos.length > 0) && React.createElement('div', { className: 'meal-photos' },
                    meal.photos.map((photo, photoIndex) => {
                        const photoSrc = photo.url || photo.data;
                        if (!photoSrc) return null;

                        const timeStr = photo.timestamp
                            ? new Date(photo.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                            : null;

                        const handleDelete = async (e) => {
                            e.stopPropagation();
                            if (!confirm('Удалить это фото?')) return;

                            if (photo.path && photo.uploaded && window.HEYS?.cloud?.deletePhoto) {
                                try {
                                    await window.HEYS.cloud.deletePhoto(photo.path);
                                } catch (err) {
                                    trackError(err, { source: 'day/_meals.js', action: 'delete_photo', mealIndex });
                                }
                            }

                            setDay((prevDay = {}) => {
                                const meals = (prevDay.meals || []).map((m, i) => {
                                    if (i !== mealIndex || !m.photos) return m;
                                    return { ...m, photos: m.photos.filter((p) => p.id !== photo.id) };
                                });
                                return { ...prevDay, meals, updatedAt: Date.now() };
                            });
                        };

                        let thumbClass = 'meal-photo-thumb';
                        if (photo.pending) thumbClass += ' pending';
                        if (photo.uploading) thumbClass += ' uploading';

                        return React.createElement(LazyPhotoThumb, {
                            key: photo.id || photoIndex,
                            photo,
                            photoSrc,
                            thumbClass,
                            timeStr,
                            mealIndex,
                            photoIndex,
                            mealPhotos: meal.photos,
                            handleDelete,
                            setDay,
                        });
                    }),
                ),

                showWaveButton && React.createElement('div', {
                    className: 'meal-wave-block' + (waveExpanded ? ' expanded' : ''),
                    style: {
                        marginTop: '10px',
                        background: 'transparent',
                        borderRadius: '12px',
                        overflow: 'hidden',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-wave-toggle',
                        onClick: toggleWave,
                        style: {
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600,
                            color: hasAnyOverlap ? '#b91c1c' : '#1f2937',
                        },
                    },
                        React.createElement('span', null,
                            `📉 Волна ${(currentWave.duration / 60).toFixed(1)}ч • ` + (
                                hasAnyOverlap
                                    ? `⚠️ перехлёст ${formatMinutes(overlapMinutes)}`
                                    : nextWave
                                        ? `✅ липолиз ${formatMinutes(lipolysisGapNext)}`
                                        : '🟢 последний приём'
                            ),
                        ),
                        React.createElement('button', {
                            onClick: (e) => {
                                e.stopPropagation();
                                setShowWaveCalcPopup(true);
                            },
                            style: {
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '11px',
                                color: '#3b82f6',
                                fontWeight: 500,
                                cursor: 'pointer',
                                marginLeft: '8px',
                            },
                        }, 'расчёт'),
                        React.createElement('span', { className: 'toggle-arrow' }, waveExpanded ? '▴' : '▾'),
                    ),
                    waveExpanded && InsulinWave.MealWaveExpandSection && React.createElement(InsulinWave.MealWaveExpandSection, {
                        waveData: currentWave,
                        prevWave,
                        nextWave,
                    }),

                    (() => {
                        const IW = HEYS.InsulinWave;
                        if (!IW || !IW.calculateHypoglycemiaRisk) return null;

                        const hypoRisk = IW.calculateHypoglycemiaRisk(meal, pIndex, getProductFromItem);
                        if (!hypoRisk.hasRisk) return null;

                        const mealMinutes = IW.utils?.timeToMinutes?.(meal.time) || 0;
                        const now = new Date();
                        const nowMinutes = now.getHours() * 60 + now.getMinutes();
                        let minutesSinceMeal = nowMinutes - mealMinutes;
                        if (minutesSinceMeal < 0) minutesSinceMeal += 24 * 60;

                        const inRiskWindow = minutesSinceMeal >= hypoRisk.riskWindow.start && minutesSinceMeal <= hypoRisk.riskWindow.end;

                        return React.createElement('div', {
                            className: 'hypoglycemia-warning',
                            style: {
                                margin: '8px 12px 10px 12px',
                                padding: '8px 10px',
                                background: inRiskWindow ? 'rgba(249,115,22,0.12)' : 'rgba(234,179,8,0.1)',
                                borderRadius: '8px',
                                fontSize: '12px',
                                color: inRiskWindow ? '#ea580c' : '#ca8a04',
                            },
                        },
                            React.createElement('div', { style: { fontWeight: '600', marginBottom: '2px' } },
                                inRiskWindow
                                    ? '⚡ Сейчас возможен спад энергии'
                                    : '⚡ Высокий GI — риск "сахарных качелей"',
                            ),
                            React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } },
                                inRiskWindow
                                    ? 'Это нормально! Съешь орехи или белок если устал'
                                    : `GI ~${Math.round(hypoRisk.details.avgGI)}, белок ${Math.round(hypoRisk.details.totalProtein)}г — через 2-3ч может "накрыть"`,
                            ),
                        );
                    })(),
                ),

                React.createElement('div', {
                    className: 'meal-meta-row',
                    style: {
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '8px 0',
                    },
                },
                    mealQuality && React.createElement('button', {
                        className: 'meal-quality-badge',
                        onClick: (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMealQualityPopup({
                                meal,
                                quality: mealQuality,
                                mealTypeInfo,
                                x: rect.left + rect.width / 2,
                                y: rect.bottom + 8,
                            });
                        },
                        title: 'Качество приёма — нажми для деталей',
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '2px 6px',
                            borderRadius: '8px',
                            border: 'none',
                            background: mealQuality.color + '20',
                            color: mealQuality.color,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            flexShrink: 0,
                            minWidth: '28px',
                        },
                    },
                        React.createElement('span', { style: { fontSize: '12px' } },
                            mealQuality.score >= 80 ? '⭐' : mealQuality.score >= 50 ? '📊' : '⚠️',
                        ),
                        React.createElement('span', { style: { fontSize: '11px', fontWeight: 600 } }, mealQuality.score),
                    ),
                    isMobile
                        ? React.createElement('div', {
                            className: 'mobile-mood-btn',
                            onClick: () => openMoodEditor(mealIndex),
                            title: 'Изменить оценки',
                            style: {
                                display: 'flex',
                                gap: '6px',
                                cursor: 'pointer',
                            },
                        },
                            hasRatings ? React.createElement(React.Fragment, null,
                                moodEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fef3c7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, moodEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#b45309' } }, moodVal),
                                ),
                                wellbeingEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#dcfce7',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, wellbeingEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#15803d' } }, wellbeingVal),
                                ),
                                stressEmoji && React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        padding: '2px 6px',
                                        borderRadius: '8px',
                                        background: '#fce7f3',
                                        minWidth: '28px',
                                    },
                                },
                                    React.createElement('span', { style: { fontSize: '12px' } }, stressEmoji),
                                    React.createElement('span', { style: { fontSize: '11px', fontWeight: 600, color: '#be185d' } }, stressVal),
                                ),
                            ) : React.createElement('span', {
                                style: {
                                    fontSize: '11px',
                                    color: '#94a3b8',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    background: '#f1f5f9',
                                },
                            }, '+ оценки'))
                        : React.createElement(React.Fragment, null,
                            React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: (e) => onChangeTime(mealIndex, e.target.value) }),
                            React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: (e) => onChangeMood(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: (e) => onChangeWellbeing(mealIndex, +e.target.value || '') })),
                            React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: (e) => onChangeStress(mealIndex, +e.target.value || '') })),
                        ),
                    (meal.items || []).length > 0 && React.createElement('button', {
                        className: 'meal-totals-badge',
                        onClick: (e) => {
                            e.stopPropagation();
                            setTotalsExpanded(!totalsExpanded);
                        },
                        title: 'Показать итоговые КБЖУ приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'КБЖУ',
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, totalsExpanded ? '▴' : '▾'),
                    ),
                    optimizerRecsCount > 0 && React.createElement('button', {
                        className: 'meal-optimizer-badge',
                        onClick: () => setOptimizerPopupOpen(!optimizerPopupOpen),
                        title: 'Советы по улучшению приёма',
                        style: {
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            border: 'none',
                            background: '#fef3c7',
                            color: '#b45309',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            marginRight: '4px',
                            transition: 'transform 0.15s, background 0.15s',
                            flexShrink: 0,
                        },
                    },
                        'Советы',
                        React.createElement('span', {
                            style: {
                                background: '#f59e0b',
                                color: '#fff',
                                borderRadius: '8px',
                                padding: '0 5px',
                                fontSize: '10px',
                                fontWeight: 700,
                                marginLeft: '3px',
                                lineHeight: '16px',
                            },
                        }, optimizerRecsCount),
                        React.createElement('span', { style: { fontSize: '10px', opacity: 0.7, marginLeft: '2px' } }, optimizerPopupOpen ? '▴' : '▾'),
                    ),
                    React.createElement('button', {
                        className: 'meal-delete-btn',
                        onClick: () => onRemoveMeal(mealIndex),
                        title: 'Удалить приём',
                        style: {
                            padding: '4px 6px',
                            fontSize: '14px',
                            lineHeight: 1,
                            flexShrink: 0,
                        },
                    }, '🗑'),
                ),

                totalsExpanded && (meal.items || []).length > 0 && React.createElement('div', {
                    className: 'mpc-totals-wrap',
                    style: {
                        marginTop: '10px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(96, 165, 250, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                },
                    React.createElement('div', { className: 'mpc-grid mpc-header' },
                        React.createElement('span', null, 'ккал'),
                        React.createElement('span', null, 'У'),
                        React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                        React.createElement('span', null, 'Б'),
                        React.createElement('span', null, 'Ж'),
                        React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                        React.createElement('span', null, 'Кл'),
                        React.createElement('span', null, 'ГИ'),
                        React.createElement('span', null, 'Вр'),
                    ),
                    React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
                        React.createElement('span', { title: getNutrientTooltip('kcal', totals.kcal, totals), style: { color: getNutrientColor('kcal', totals.kcal, totals), fontWeight: getNutrientColor('kcal', totals.kcal, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.kcal)),
                        React.createElement('span', { title: getNutrientTooltip('carbs', totals.carbs, totals), style: { color: getNutrientColor('carbs', totals.carbs, totals), fontWeight: getNutrientColor('carbs', totals.carbs, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.carbs)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('simple', totals.simple, totals), style: { color: getNutrientColor('simple', totals.simple, totals), fontWeight: getNutrientColor('simple', totals.simple, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.simple || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('complex', totals.complex, totals), style: { color: getNutrientColor('complex', totals.complex, totals), cursor: 'help' } }, Math.round(totals.complex || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('prot', totals.prot, totals), style: { color: getNutrientColor('prot', totals.prot, totals), fontWeight: getNutrientColor('prot', totals.prot, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.prot)),
                        React.createElement('span', { title: getNutrientTooltip('fat', totals.fat, totals), style: { color: getNutrientColor('fat', totals.fat, totals), fontWeight: getNutrientColor('fat', totals.fat, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fat)),
                        React.createElement('span', { className: 'mpc-dim' },
                            React.createElement('span', { title: getNutrientTooltip('bad', totals.bad, totals), style: { color: getNutrientColor('bad', totals.bad, totals), fontWeight: getNutrientColor('bad', totals.bad, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.bad || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('good', totals.good, totals), style: { color: getNutrientColor('good', totals.good, totals), fontWeight: getNutrientColor('good', totals.good, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.good || 0)),
                            '/',
                            React.createElement('span', { title: getNutrientTooltip('trans', totals.trans, totals), style: { color: getNutrientColor('trans', totals.trans, totals), fontWeight: getNutrientColor('trans', totals.trans, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.trans || 0)),
                        ),
                        React.createElement('span', { title: getNutrientTooltip('fiber', totals.fiber, totals), style: { color: getNutrientColor('fiber', totals.fiber, totals), fontWeight: getNutrientColor('fiber', totals.fiber, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.fiber || 0)),
                        React.createElement('span', { title: getNutrientTooltip('gi', totals.gi, totals), style: { color: getNutrientColor('gi', totals.gi, totals), fontWeight: getNutrientColor('gi', totals.gi, totals) ? 600 : 400, cursor: 'help' } }, Math.round(totals.gi || 0)),
                        React.createElement('span', { title: getNutrientTooltip('harm', totals.harm, totals), style: { color: getNutrientColor('harm', totals.harm, totals), fontWeight: getNutrientColor('harm', totals.harm, totals) ? 600 : 400, cursor: 'help' } }, fmtVal('harm', totals.harm || 0)),
                    ),
                ),

                optimizerPopupOpen && optimizerRecsCount > 0 && HEYS.MealOptimizer && MealOptimizerSection && React.createElement('div', {
                    className: 'meal-optimizer-expanded',
                    style: {
                        marginTop: '12px',
                        padding: '12px',
                        background: 'linear-gradient(135deg, rgba(245, 158, 0, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(245, 158, 0, 0.2)',
                        animation: 'slideDown 0.2s ease-out',
                    },
                }, React.createElement(MealOptimizerSection, {
                    meal,
                    totals,
                    dayData: dayData || {},
                    profile: profile || {},
                    products: products || [],
                    pIndex,
                    mealIndex,
                    addProductToMeal,
                })),

                showWaveCalcPopup && currentWave && React.createElement('div', {
                    className: 'wave-details-overlay',
                    onClick: (e) => { if (e.target === e.currentTarget) setShowWaveCalcPopup(false); },
                    style: {
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                    },
                },
                    React.createElement('div', {
                        className: 'wave-details-popup',
                        style: {
                            background: '#fff',
                            borderRadius: '16px',
                            padding: '20px',
                            maxWidth: '360px',
                            width: '100%',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        },
                    },
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                            },
                        },
                            React.createElement('h3', {
                                style: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' },
                            }, 'Расчёт волны'),
                            React.createElement('button', {
                                onClick: () => setShowWaveCalcPopup(false),
                                style: {
                                    background: 'none', border: 'none', fontSize: '20px',
                                    cursor: 'pointer', color: '#9ca3af', padding: '4px',
                                },
                            }, '×'),
                        ),

                        React.createElement('div', {
                            style: {
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '16px',
                                textAlign: 'center',
                                color: '#fff',
                            },
                        },
                            React.createElement('div', { style: { fontSize: '12px', opacity: 0.9, marginBottom: '4px' } }, 'Длина волны'),
                            React.createElement('div', { style: { fontSize: '28px', fontWeight: 700 } }, (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),
                            React.createElement('div', { style: { fontSize: '11px', opacity: 0.8, marginTop: '4px' } }, currentWave.timeDisplay + ' → ' + currentWave.endTimeDisplay),
                        ),

                        React.createElement('div', {
                            style: {
                                background: '#f8fafc',
                                borderRadius: '10px',
                                padding: '12px',
                                marginBottom: '16px',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                color: '#64748b',
                                textAlign: 'center',
                            },
                        }, 'База × Множитель = ' + (currentWave.baseWaveHours || 3).toFixed(1) + 'ч × '
                        + (currentWave.finalMultiplier || 1).toFixed(2) + ' = ' + (currentWave.waveHours || currentWave.duration / 60).toFixed(1) + 'ч'),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '🍽️ Факторы еды'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'ГИ'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.gi || 0)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'GL (нагрузка)'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.gl < 10 ? '#22c55e' : currentWave.gl > 20 ? '#ef4444' : '#1f2937' } }, (currentWave.gl || 0).toFixed(1)),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Белок'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.protein || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Клетчатка'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.fiber >= 5 ? '#22c55e' : '#1f2937' } }, Math.round(currentWave.fiber || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Жиры'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.fat || 0) + 'г'),
                            ),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Углеводы'),
                                React.createElement('span', { style: { fontWeight: 500 } }, Math.round(currentWave.carbs || 0) + 'г'),
                            ),
                        ),

                        React.createElement('div', { style: { marginBottom: '12px' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' } }, '⏰ Дневные факторы'),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' } },
                                React.createElement('span', { style: { color: '#64748b' } }, 'Время суток'),
                                React.createElement('span', { style: { fontWeight: 500, color: currentWave.circadianMultiplier > 1.05 ? '#f97316' : '#1f2937' } }, '×' + (currentWave.circadianMultiplier || 1).toFixed(2)),
                            ),
                            currentWave.activityBonus && currentWave.activityBonus !== 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0' } },
                                React.createElement('span', { style: { color: '#22c55e' } }, '🏃 Активность'),
                                React.createElement('span', { style: { fontWeight: 500, color: '#22c55e' } }, (currentWave.activityBonus * 100).toFixed(0) + '%'),
                            ),
                        ),

                        React.createElement('button', {
                            onClick: () => setShowWaveCalcPopup(false),
                            style: {
                                width: '100%',
                                background: '#3b82f6',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '10px',
                                padding: '12px',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginTop: '8px',
                            },
                        }, 'Закрыть'),
                    ),
                ),
            ),
        );
    }, (prevProps, nextProps) => {
        if (prevProps.meal !== nextProps.meal) return false;
        if (prevProps.meal?.mealType !== nextProps.meal?.mealType) return false;
        if (prevProps.meal?.name !== nextProps.meal?.name) return false;
        if (prevProps.meal?.time !== nextProps.meal?.time) return false;
        if (prevProps.meal?.items?.length !== nextProps.meal?.items?.length) return false;
        if (prevProps.meal?.photos?.length !== nextProps.meal?.photos?.length) return false;
        if (prevProps.mealIndex !== nextProps.mealIndex) return false;
        if (prevProps.displayIndex !== nextProps.displayIndex) return false;
        if (prevProps.isExpanded !== nextProps.isExpanded) return false;
        if (prevProps.allMeals !== nextProps.allMeals) return false;
        return true;
    });

    HEYS.dayComponents = HEYS.dayComponents || {};
    HEYS.dayComponents.MealCard = MealCard;

    // =========================
    // Meals list
    // =========================
    function renderMealsList(params) {
        const {
            sortedMealsForDisplay,
            day,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params;

        if (!sortedMealsForDisplay || !Array.isArray(sortedMealsForDisplay)) {
            return [];
        }

        if (!MealCard) {
            trackError(new Error('[HEYS Day Meals] MealCard not loaded'), {
                source: 'day/_meals.js',
                type: 'missing_dependency',
            });
            return [];
        }

        return sortedMealsForDisplay.map((sortedMeal, displayIndex) => {
            const mi = (day.meals || []).findIndex((m) => m.id === sortedMeal.id);
            if (mi === -1) {
                trackError(new Error('[HEYS Day Meals] meal not found in day.meals'), {
                    source: 'day/_meals.js',
                    type: 'missing_meal',
                    mealId: sortedMeal.id,
                });
                return null;
            }

            const meal = day.meals[mi];
            const isExpanded = isMealExpanded(mi, (day.meals || []).length, day.meals, displayIndex);
            const mealNumber = sortedMealsForDisplay.length - displayIndex;
            const isFirst = displayIndex === 0;
            const isCurrentMeal = isFirst && !isMealStale(meal);

            return React.createElement('div', {
                key: meal.id + '_' + (meal.mealType || 'auto'),
                className: 'meal-with-number',
                style: {
                    marginTop: isFirst ? '0' : '24px',
                },
            },
                React.createElement('div', {
                    className: 'meal-number-header',
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '6px',
                        gap: '4px',
                    },
                },
                    React.createElement('div', {
                        className: 'meal-number-badge' + (isCurrentMeal ? ' meal-number-badge--current' : ''),
                        style: {
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: isCurrentMeal
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '16px',
                            fontWeight: '700',
                            boxShadow: isCurrentMeal
                                ? '0 2px 8px rgba(34,197,94,0.35)'
                                : '0 2px 8px rgba(59,130,246,0.35)',
                        },
                    }, mealNumber),
                    isCurrentMeal && React.createElement('span', {
                        className: 'meal-current-label',
                        style: {
                            fontSize: '14px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: '#22c55e',
                            marginTop: '4px',
                        },
                    }, 'ТЕКУЩИЙ ПРИЁМ'),
                ),
                React.createElement(MealCard, {
                    meal,
                    mealIndex: mi,
                    displayIndex,
                    products,
                    pIndex,
                    date,
                    setDay,
                    isMobile,
                    isExpanded,
                    onToggleExpand: toggleMealExpand,
                    onChangeMealType: changeMealType,
                    onChangeTime: updateMealTime,
                    onChangeMood: changeMealMood,
                    onChangeWellbeing: changeMealWellbeing,
                    onChangeStress: changeMealStress,
                    onRemoveMeal: removeMeal,
                    openEditGramsModal,
                    openTimeEditor,
                    openMoodEditor,
                    setGrams,
                    removeItem,
                    isMealStale,
                    allMeals: day.meals,
                    isNewItem,
                    optimum,
                    setMealQualityPopup,
                    addProductToMeal,
                    dayData: day,
                    profile: prof,
                    insulinWaveData,
                }),
            );
        });
    }

    function renderEmptyMealsState(params) {
        const { addMeal } = params;

        return React.createElement('div', {
            className: 'empty-meals-state',
            style: {
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
            },
        },
            React.createElement('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🍽️'),
            React.createElement('div', { style: { fontSize: '18px', fontWeight: '600', marginBottom: '8px' } }, 'Нет приёмов пищи'),
            React.createElement('div', { style: { fontSize: '14px', marginBottom: '24px' } }, 'Добавь свой первый приём пищи'),
            addMeal && React.createElement('button', {
                className: 'button-primary',
                onClick: addMeal,
                style: {
                    padding: '12px 24px',
                    fontSize: '16px',
                },
            }, '➕ Добавить приём'),
        );
    }

    HEYS.dayMealsList = {
        renderMealsList,
        renderEmptyMealsState,
    };

    // =========================
    // Meals display (sorting + list)
    // =========================
    function useMealsDisplay(params) {
        const {
            day,
            safeMeals,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        } = params || {};

        if (!React) return { sortedMealsForDisplay: [], mealsUI: [] };

        const sortedMealsForDisplay = React.useMemo(() => {
            const meals = day?.meals || [];
            if (meals.length <= 1) return meals;

            return [...meals].sort((a, b) => {
                const timeA = U?.timeToMinutes ? U.timeToMinutes(a.time) : null;
                const timeB = U?.timeToMinutes ? U.timeToMinutes(b.time) : null;

                if (timeA === null && timeB === null) return 0;
                if (timeA === null) return 1;
                if (timeB === null) return -1;

                return timeB - timeA;
            });
        }, [safeMeals]);

        const mealsUI = HEYS.dayMealsList?.renderMealsList?.({
            sortedMealsForDisplay,
            day,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData,
        }) || [];

        return { sortedMealsForDisplay, mealsUI };
    }

    HEYS.dayMealsDisplay = {
        useMealsDisplay,
    };

    // =========================
    // Meals chart UI
    // =========================
    const MealsChartUI = {};
    MealsChartUI.renderMealsChart = function renderMealsChart({
        React,
        mealsChartData,
        statsVm,
        mealChartHintShown,
        setMealChartHintShown,
        setShowConfetti,
        setMealQualityPopup,
        newMealAnimatingIndex,
        showFirstPerfectAchievement,
        U,
    }) {
        if (!mealsChartData || !mealsChartData.meals || mealsChartData.meals.length === 0) return null;

        const utils = U || HEYS.utils || {};

        return React.createElement('div', {
            className: 'meals-chart-container',
            style: {
                margin: '12px 0',
                padding: '12px 16px',
                background: 'var(--surface, #fff)',
                borderRadius: '12px',
                border: '1px solid var(--border, #e5e7eb)',
            },
        },
            React.createElement('div', {
                style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '4px',
                },
            },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #6b7280)' } }, '📊 Распределение'),
                    mealsChartData.avgQualityScore > 0 && React.createElement('span', {
                        className: 'meal-avg-score-badge',
                        style: {
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: mealsChartData.avgQualityScore >= 80 ? '#dcfce7' : mealsChartData.avgQualityScore >= 50 ? '#fef3c7' : '#fee2e2',
                            color: mealsChartData.avgQualityScore >= 80 ? '#166534' : mealsChartData.avgQualityScore >= 50 ? '#92400e' : '#991b1b',
                            fontWeight: '600',
                        },
                    }, 'средняя оценка ' + mealsChartData.avgQualityScore),
                    mealsChartData.yesterdayAvgScore > 0 && (() => {
                        const diff = mealsChartData.avgQualityScore - mealsChartData.yesterdayAvgScore;
                        if (Math.abs(diff) < 3) return null;
                        return React.createElement('span', {
                            style: {
                                fontSize: '10px',
                                color: diff > 0 ? '#16a34a' : '#dc2626',
                                fontWeight: '500',
                            },
                        }, diff > 0 ? '↑+' + diff : '↓' + diff);
                    })(),
                ),
            ),
            !mealChartHintShown && React.createElement('div', { className: 'meal-chart-hint' },
                React.createElement('span', null, '👆'),
                'Нажми на полоску для деталей',
            ),
            mealsChartData.meals.length > 1 && React.createElement('div', {
                className: 'meals-day-sparkline',
                style: {
                    position: 'relative',
                    height: '60px',
                    marginBottom: '12px',
                    padding: '8px 0 16px 0',
                },
            },
                (() => {
                    const meals = mealsChartData.meals;
                    const maxKcal = Math.max(...meals.map((m) => m.kcal), 200);
                    const svgW = 280;
                    const svgH = 40;
                    const padding = 10;

                    const parseTime = (t) => {
                        if (!t) return 0;
                        const [h, m] = t.split(':').map(Number);
                        return (h || 0) * 60 + (m || 0);
                    };

                    const times = meals.map((m) => parseTime(m.time)).filter((t) => t > 0);
                    const dataMinTime = times.length > 0 ? Math.min(...times) : 12 * 60;
                    const dataMaxTime = times.length > 0 ? Math.max(...times) : 20 * 60;
                    const minTime = dataMinTime - 30;
                    const maxTime = dataMaxTime + 30;
                    const timeRange = Math.max(maxTime - minTime, 60);

                    const bestIdx = mealsChartData.bestMealIndex;

                    const points = meals.map((m, idx) => {
                        const t = parseTime(m.time);
                        const x = padding + ((t - minTime) / timeRange) * (svgW - 2 * padding);
                        const y = svgH - padding - ((m.kcal / maxKcal) * (svgH - 2 * padding));
                        const r = 3 + Math.min(4, (m.kcal / 200));
                        const isBest = idx === bestIdx && m.quality && m.quality.score >= 70;
                        return { x, y, meal: m, idx, r, isBest };
                    }).sort((a, b) => a.x - b.x);

                    const linePath = points.length > 1
                        ? 'M ' + points.map((p) => `${p.x},${p.y}`).join(' L ')
                        : '';

                    const areaPath = points.length > 1
                        ? `M ${points[0].x},${svgH - padding} `
                        + points.map((p) => `L ${p.x},${p.y}`).join(' ')
                        + ` L ${points[points.length - 1].x},${svgH - padding} Z`
                        : '';

                    const yesterdayMeals = statsVm?.computed?.mealsChartMeta?.yesterdayMeals || [];
                    const yesterdayPath = (() => {
                        if (yesterdayMeals.length < 2) return '';
                        const yMaxKcal = Math.max(maxKcal, ...yesterdayMeals.map((p) => p.kcal));
                        const pts = yesterdayMeals.map((p) => {
                            const x = padding + ((p.t - minTime) / timeRange) * (svgW - 2 * padding);
                            const y = svgH - padding - ((p.kcal / yMaxKcal) * (svgH - 2 * padding));
                            return { x: Math.max(padding, Math.min(svgW - padding, x)), y };
                        }).sort((a, b) => a.x - b.x);
                        return 'M ' + pts.map((p) => `${p.x},${p.y}`).join(' L ');
                    })();

                    return React.createElement('svg', {
                        viewBox: `0 0 ${svgW} ${svgH + 12}`,
                        style: { width: '100%', height: '100%' },
                        preserveAspectRatio: 'xMidYMid meet',
                    },
                        React.createElement('defs', null,
                            React.createElement('linearGradient', { id: 'mealSparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#10b981', stopOpacity: '0.3' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#10b981', stopOpacity: '0.05' }),
                            ),
                            React.createElement('linearGradient', { id: 'goodZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.02' }),
                            ),
                            React.createElement('linearGradient', { id: 'snackZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#eab308', stopOpacity: '0.08' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#eab308', stopOpacity: '0.01' }),
                            ),
                            React.createElement('linearGradient', { id: 'badZoneGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
                                React.createElement('stop', { offset: '0%', stopColor: '#ef4444', stopOpacity: '0.12' }),
                                React.createElement('stop', { offset: '100%', stopColor: '#ef4444', stopOpacity: '0.02' }),
                            ),
                        ),
                        (() => {
                            const firstMealTime = times.length > 0 ? Math.min(...times) : 8 * 60;
                            const endOfDayMinutes = 27 * 60;
                            const slotDuration = (endOfDayMinutes - firstMealTime) / 6;

                            const zones = [
                                { start: firstMealTime - 30, end: firstMealTime + slotDuration * 0.3, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 0.8, end: firstMealTime + slotDuration * 1.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 2.8, end: firstMealTime + slotDuration * 3.5, gradient: 'url(#goodZoneGrad)' },
                                { start: firstMealTime + slotDuration * 4.5, end: endOfDayMinutes, gradient: 'url(#badZoneGrad)' },
                            ];

                            return zones.map((zone, i) => {
                                const x1 = padding + ((zone.start - minTime) / timeRange) * (svgW - 2 * padding);
                                const x2 = padding + ((zone.end - minTime) / timeRange) * (svgW - 2 * padding);
                                if (x2 < padding || x1 > svgW - padding) return null;
                                const clampedX1 = Math.max(padding, x1);
                                const clampedX2 = Math.min(svgW - padding, x2);
                                if (clampedX2 <= clampedX1) return null;
                                return React.createElement('rect', {
                                    key: 'zone-' + i,
                                    x: clampedX1,
                                    y: 0,
                                    width: clampedX2 - clampedX1,
                                    height: svgH,
                                    fill: zone.gradient,
                                    rx: 3,
                                });
                            });
                        })(),
                        yesterdayPath && React.createElement('path', {
                            d: yesterdayPath,
                            fill: 'none',
                            stroke: '#9ca3af',
                            strokeWidth: '1.5',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-yesterday',
                        }),
                        areaPath && React.createElement('path', {
                            d: areaPath,
                            fill: 'url(#mealSparkGrad)',
                            className: 'meal-sparkline-area',
                        }),
                        linePath && React.createElement('path', {
                            d: linePath,
                            fill: 'none',
                            stroke: '#10b981',
                            strokeWidth: '2',
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'meal-sparkline-line',
                            style: { strokeDasharray: 500, strokeDashoffset: 500 },
                        }),
                        points.map((p, i) =>
                            React.createElement('g', {
                                key: i,
                                className: 'meal-sparkline-dot',
                                style: { '--dot-delay': (1 + i * 0.4) + 's' },
                            },
                                p.isBest && React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r + 4,
                                    fill: 'none',
                                    stroke: '#22c55e',
                                    strokeWidth: '2',
                                    opacity: 0.6,
                                    className: 'sparkline-pulse',
                                }),
                                React.createElement('circle', {
                                    cx: p.x,
                                    cy: p.y,
                                    r: p.r,
                                    fill: p.meal.quality ? p.meal.quality.color : '#10b981',
                                    stroke: p.isBest ? '#22c55e' : '#fff',
                                    strokeWidth: p.isBest ? 2 : 1.5,
                                    style: { cursor: 'pointer' },
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        const quality = p.meal.quality;
                                        if (!quality) return;
                                        const svg = e.target.closest('svg');
                                        const svgRect = svg.getBoundingClientRect();
                                        const viewBox = svg.viewBox.baseVal;
                                        const scaleX = svgRect.width / viewBox.width;
                                        const scaleY = svgRect.height / viewBox.height;
                                        const screenX = svgRect.left + p.x * scaleX;
                                        const screenY = svgRect.top + p.y * scaleY;
                                        if (!mealChartHintShown) {
                                            setMealChartHintShown(true);
                                            try {
                                                if (HEYS.store?.set) HEYS.store.set('heys_meal_hint_shown', '1');
                                                else if (utils.lsSet) utils.lsSet('heys_meal_hint_shown', '1');
                                                else localStorage.setItem('heys_meal_hint_shown', '1');
                                            } catch { }
                                        }
                                        if (quality.score >= 95) {
                                            setShowConfetti(true);
                                            setTimeout(() => setShowConfetti(false), 2000);
                                        }
                                        setMealQualityPopup({
                                            meal: p.meal,
                                            quality,
                                            mealTypeInfo: { label: p.meal.name, icon: p.meal.icon },
                                            x: screenX,
                                            y: screenY + 15,
                                        });
                                    },
                                }),
                            ),
                        ),
                        points.map((p, i) =>
                            React.createElement('text', {
                                key: 'time-' + i,
                                x: p.x,
                                y: svgH + 10,
                                fontSize: '8',
                                fill: '#9ca3af',
                                textAnchor: 'middle',
                            }, p.meal.time || ''),
                        ),
                    );
                })(),
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' } },
                React.createElement('div', {
                    className: 'meals-target-line',
                    style: {
                        position: 'absolute',
                        left: 'calc(100px + 100%)',
                        top: 0,
                        bottom: 0,
                        width: '0',
                        borderLeft: '2px dashed rgba(16, 185, 129, 0.4)',
                        pointerEvents: 'none',
                        zIndex: 1,
                    },
                }),
                mealsChartData.meals.map((meal, i) => {
                    const originalIndex = i;
                    const widthPct = mealsChartData.targetKcal > 0
                        ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
                        : 0;
                    const barWidthPct = widthPct > 0 && widthPct < 12 ? 12 : widthPct;
                    const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
                    const quality = meal.quality;
                    const isBest = mealsChartData.bestMealIndex === originalIndex && quality && quality.score >= 70;
                    const barFill = quality
                        ? `linear-gradient(90deg, ${quality.color} 0%, ${quality.color}cc 100%)`
                        : (isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)');
                    const problemBadges = quality?.badges?.filter((b) => !b.ok).slice(0, 3) || [];
                    const openQualityModal = (e) => {
                        if (!quality) return;
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (!mealChartHintShown) {
                            setMealChartHintShown(true);
                            try {
                                if (HEYS.store?.set) HEYS.store.set('heys_meal_hint_shown', '1');
                                else if (utils.lsSet) utils.lsSet('heys_meal_hint_shown', '1');
                                else localStorage.setItem('heys_meal_hint_shown', '1');
                            } catch { }
                        }
                        if (quality.score >= 95) {
                            setShowConfetti(true);
                            setTimeout(() => setShowConfetti(false), 2000);
                        }
                        setMealQualityPopup({
                            meal,
                            quality,
                            mealTypeInfo: { label: meal.name, icon: meal.icon },
                            x: rect.left + rect.width / 2,
                            y: rect.bottom,
                        });
                    };
                    const isLowScore = quality && quality.score < 50;
                    const isNewMeal = newMealAnimatingIndex === originalIndex;
                    return React.createElement('div', {
                        key: i,
                        className: 'meal-bar-row' + (isNewMeal ? ' meal-bar-new' : ''),
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 6px',
                            marginLeft: '-6px',
                            marginRight: '-6px',
                            borderRadius: '6px',
                            background: isLowScore ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                            transition: 'background 0.2s ease',
                        },
                    },
                        meal.time && React.createElement('span', {
                            style: {
                                width: '50px',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #374151)',
                                textAlign: 'left',
                                flexShrink: 0,
                            },
                        }, utils.formatMealTime ? utils.formatMealTime(meal.time) : meal.time),
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: '90px',
                                fontSize: '15px',
                                fontWeight: '600',
                                color: 'var(--text-primary, #1e293b)',
                                flexShrink: 0,
                            },
                        },
                            React.createElement('span', { style: { fontSize: '16px' } }, meal.icon),
                            React.createElement('span', null, meal.name),
                        ),
                        React.createElement('div', {
                            className: 'meal-bar-container' + (isBest ? ' meal-bar-best' : '') + (quality && quality.score >= 80 ? ' meal-bar-excellent' : ''),
                            role: quality ? 'button' : undefined,
                            tabIndex: quality ? 0 : undefined,
                            onClick: openQualityModal,
                            onKeyDown: quality ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQualityModal(); } } : undefined,
                            style: {
                                flex: 1,
                                minWidth: 0,
                                height: '22px',
                                background: 'var(--meal-bar-track, rgba(148,163,184,0.24))',
                                borderRadius: '4px',
                                overflow: 'visible',
                                position: 'relative',
                                cursor: quality ? 'pointer' : 'default',
                                boxShadow: isBest ? '0 0 0 2px #fbbf24, 0 2px 8px rgba(251,191,36,0.3)' : undefined,
                            },
                        },
                            React.createElement('div', {
                                style: {
                                    width: barWidthPct + '%',
                                    height: '100%',
                                    background: barFill,
                                    borderRadius: '4px',
                                    transition: 'width 0.3s ease',
                                },
                            }),
                            meal.kcal > 0 && React.createElement('span', {
                                style: {
                                    position: 'absolute',
                                    left: `calc(${barWidthPct}% + 6px)`,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    color: 'var(--text-primary, #1f2937)',
                                    whiteSpace: 'nowrap',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                },
                            },
                                meal.kcal + ' ккал',
                                React.createElement('span', {
                                    style: {
                                        fontSize: '9px',
                                        color: 'var(--text-tertiary, #9ca3af)',
                                        fontWeight: '500',
                                    },
                                }, '(' + Math.round(widthPct) + '%)'),
                            ),
                            problemBadges.length > 0 && React.createElement('div', {
                                style: {
                                    position: 'absolute',
                                    right: '4px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    gap: '2px',
                                },
                            },
                                problemBadges.map((b, idx) =>
                                    React.createElement('span', {
                                        key: idx,
                                        style: {
                                            fontSize: '8px',
                                            padding: '1px 3px',
                                            borderRadius: '3px',
                                            background: 'rgba(239,68,68,0.9)',
                                            color: '#fff',
                                            fontWeight: '600',
                                        },
                                    }, '!' + b.type),
                                ),
                            ),
                        ),
                        quality && React.createElement('span', { className: 'meal-quality-score', style: { color: quality.color, flexShrink: 0 } }, '⭐' + quality.score),
                    );
                }),
                mealsChartData.qualityStreak >= 3 && React.createElement('div', { className: 'meal-quality-streak-banner' },
                    React.createElement('span', { className: 'streak-fire' }, '🔥'),
                    React.createElement('span', { style: { fontWeight: '600', color: '#92400e' } }, mealsChartData.qualityStreak + ' отличных приёмов подряд!'),
                    React.createElement('span', { style: { fontSize: '16px' } }, '🏆'),
                ),
                showFirstPerfectAchievement && React.createElement('div', { className: 'first-perfect-meal-badge', style: { marginTop: '8px' } },
                    React.createElement('span', { className: 'trophy' }, '🏆'),
                    'Первый идеальный приём!',
                    React.createElement('span', null, '✨'),
                ),
            ),
        );
    };

    HEYS.dayMealsChartUI = MealsChartUI;

    // =========================
    // Meal expand state
    // =========================
    function useMealExpandState(params) {
        const { date } = params || {};
        if (!React) return {};

        const expandedMealsKey = 'heys_expandedMeals_' + date;

        const [manualExpandedStale, setManualExpandedStale] = React.useState({});
        const [expandedMeals, setExpandedMeals] = React.useState(() => {
            try {
                const cached = sessionStorage.getItem(expandedMealsKey);
                return cached ? JSON.parse(cached) : {};
            } catch (e) {
                return {};
            }
        });

        React.useEffect(() => {
            try {
                sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
            } catch (e) { }
        }, [expandedMeals, expandedMealsKey]);

        const isMealStale = React.useCallback((meal) => {
            if (!meal || !meal.time) return false;
            const [hours, minutes] = meal.time.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) return false;
            const now = new Date();
            const mealDate = new Date();
            mealDate.setHours(hours, minutes, 0, 0);
            const diffMinutes = (now - mealDate) / (1000 * 60);
            return diffMinutes > 30;
        }, []);

        const toggleMealExpand = React.useCallback((mealIndex, meals) => {
            const meal = meals && meals[mealIndex];
            const isStale = meal && isMealStale(meal);

            if (isStale) {
                setManualExpandedStale((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
            } else {
                setExpandedMeals((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
            }
        }, [isMealStale]);

        const expandOnlyMeal = React.useCallback((mealIndex) => {
            const newState = {};
            newState[mealIndex] = true;
            setExpandedMeals(newState);
        }, []);

        const isMealExpanded = React.useCallback((mealIndex, totalMeals, meals, displayIndex = null) => {
            const meal = meals && meals[mealIndex];
            const isStale = meal && isMealStale(meal);

            if (isStale) {
                return manualExpandedStale[mealIndex] === true;
            }

            if (expandedMeals.hasOwnProperty(mealIndex)) {
                return expandedMeals[mealIndex];
            }

            if (displayIndex !== null) {
                return displayIndex === 0;
            }
            return mealIndex === totalMeals - 1;
        }, [expandedMeals, manualExpandedStale, isMealStale]);

        return {
            isMealStale,
            toggleMealExpand,
            expandOnlyMeal,
            isMealExpanded,
        };
    }

    HEYS.dayMealExpandState = {
        useMealExpandState,
    };

    // =========================
    // Meal handlers
    // =========================
    if (!HEYS.dayUtils) {
        trackError(new Error('[HEYS Day Meals] HEYS.dayUtils is required'), {
            source: 'day/_meals.js',
            type: 'missing_dependency',
        });
    }
    const { haptic, lsSet, lsGet, uid, timeToMinutes, MEAL_TYPES: MEAL_TYPES_HANDLER } = HEYS.dayUtils || {};

    function sortMealsByTime(meals) {
        if (!meals || meals.length <= 1) return meals;

        return [...meals].sort((a, b) => {
            const timeA = timeToMinutes ? timeToMinutes(a.time) : null;
            const timeB = timeToMinutes ? timeToMinutes(b.time) : null;

            if (timeA === null && timeB === null) return 0;
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            return timeB - timeA;
        });
    }

    function createMealHandlers(deps) {
        const {
            setDay,
            expandOnlyMeal,
            date,
            products,
            day,
            prof,
            pIndex,
            getProductFromItem,
            isMobile,
            openTimePickerForNewMeal,
            scrollToDiaryHeading,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            newItemIds,
            setNewItemIds,
        } = deps;

        const addMeal = React.useCallback(async () => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление приёма пищи недоступно');
                return;
            }

            if (isMobile && HEYS.MealStep) {
                HEYS.MealStep.showAddMeal({
                    dateKey: date,
                    meals: day.meals,
                    pIndex,
                    getProductFromItem,
                    trainings: day.trainings || [],
                    deficitPct: Number(day.deficitPct ?? prof?.deficitPctTarget ?? 0),
                    prof,
                    dayData: day,
                    onComplete: (newMeal) => {
                        const newMealId = newMeal.id;
                        const newUpdatedAt = Date.now();
                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                        setDay((prevDay) => {
                            const newMeals = sortMealsByTime([...(prevDay.meals || []), newMeal]);
                            const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };

                            const key = 'heys_dayv2_' + date;
                            try {
                                lsSet(key, newDayData);
                            } catch (e) {
                                trackError(e, { source: 'day/_meals.js', action: 'save_meal' });
                            }

                            return newDayData;
                        });

                        if (window.HEYS && window.HEYS.analytics) {
                            window.HEYS.analytics.trackDataOperation('meal-created');
                        }
                        HEYS.Toast?.success('Приём создан');
                        window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));

                        // 🆕 Стабильный флоу: lazy-вычисление индекса через HEYS.Day, retry через rAF
                        const savedMealName = (newMeal.name || '').toLowerCase();

                        const findMealIndex = () => {
                            const currentDay = HEYS.Day?.getDay?.();
                            if (!currentDay?.meals) return -1;
                            return currentDay.meals.findIndex((m) => m.id === newMealId);
                        };

                        const showFlowModal = (attempt) => {
                            const maxAttempts = 5;
                            const mealIndex = findMealIndex();

                            if (mealIndex < 0) {
                                if (attempt < maxAttempts) {
                                    // Retry: React ещё не применил state update
                                    requestAnimationFrame(() => showFlowModal(attempt + 1));
                                    return;
                                }
                                console.warn('[HEYS.Day] ⚠️ Flow modal skipped: meal not found after', maxAttempts, 'attempts', { newMealId });
                                return;
                            }

                            expandOnlyMeal(mealIndex);
                            const mealName = savedMealName || `приём ${mealIndex + 1}`;

                            // Функция открытия модалки добавления продукта
                            const openAddProductModal = (targetMealIndex, multiProductMode, dayOverride) => {
                                if (!window.HEYS?.AddProductStep?.show) return;

                                window.HEYS.AddProductStep.show({
                                    mealIndex: targetMealIndex,
                                    multiProductMode: multiProductMode,
                                    products: products,
                                    day: dayOverride || HEYS.Day?.getDay?.() || day,
                                    dateKey: date,
                                    onAdd: ({ product, grams, mealIndex: addMealIndex }) => {
                                        let finalProduct = product;
                                        if (product?._fromShared || product?._source === 'shared' || product?.is_shared) {
                                            const cloned = HEYS.products?.addFromShared?.(product);
                                            if (cloned) {
                                                finalProduct = cloned;
                                            }
                                        }

                                        const productId = finalProduct.id ?? finalProduct.product_id ?? finalProduct.name;
                                        // 🆕 v2.8.2: Трекаем использование для сортировки по популярности
                                        HEYS?.SmartSearchWithTypos?.trackProductUsage?.(String(productId));
                                        console.info('[HEYS.search] ✅ Product usage tracked:', { productId: String(productId), name: finalProduct.name });
                                        const computeTEFKcal100 = (p) => {
                                            const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
                                            const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
                                            return Math.round((3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat) * 10) / 10;
                                        };
                                        const newItem = {
                                            id: uid('it_'),
                                            product_id: finalProduct.id ?? finalProduct.product_id,
                                            name: finalProduct.name,
                                            grams: grams || 100,
                                            ...(finalProduct.kcal100 !== undefined && {
                                                kcal100: computeTEFKcal100(finalProduct),
                                                protein100: finalProduct.protein100,
                                                carbs100: finalProduct.carbs100,
                                                fat100: finalProduct.fat100,
                                                simple100: finalProduct.simple100,
                                                complex100: finalProduct.complex100,
                                                badFat100: finalProduct.badFat100,
                                                goodFat100: finalProduct.goodFat100,
                                                trans100: finalProduct.trans100,
                                                fiber100: finalProduct.fiber100,
                                                gi: finalProduct.gi,
                                                harm: HEYS.models?.normalizeHarm?.(finalProduct),  // Canonical harm field
                                            }),
                                        };

                                        const newUpdatedAt = Date.now();
                                        lastLoadedUpdatedAtRef.current = newUpdatedAt;
                                        blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

                                        setDay((prevDay = {}) => {
                                            const updatedMeals = (prevDay.meals || []).map((m, i) =>
                                                i === addMealIndex
                                                    ? { ...m, items: [...(m.items || []), newItem] }
                                                    : m,
                                            );
                                            const newDayData = { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };

                                            const key = 'heys_dayv2_' + date;
                                            try {
                                                lsSet(key, newDayData);
                                            } catch (e) {
                                                trackError(e, { source: 'day/_meals.js', action: 'save_product' });
                                            }

                                            return newDayData;
                                        });

                                        try { navigator.vibrate?.(10); } catch (e) { }
                                        window.dispatchEvent(new CustomEvent('heysProductAdded', { detail: { product: finalProduct, grams } }));
                                        try {
                                            lsSet(`heys_last_grams_${productId}`, grams);
                                            const history = lsGet('heys_grams_history', {});
                                            if (!history[productId]) history[productId] = [];
                                            history[productId].push(grams);
                                            if (history[productId].length > 20) history[productId].shift();
                                            lsSet('heys_grams_history', history);
                                        } catch (e) { }
                                        if (multiProductMode && HEYS.dayAddProductSummary?.show) {
                                            requestAnimationFrame(() => {
                                                setTimeout(() => {
                                                    HEYS.dayAddProductSummary.show({
                                                        day: HEYS.Day?.getDay?.() || day || {},
                                                        mealIndex: addMealIndex,
                                                        pIndex,
                                                        getProductFromItem,
                                                        per100,
                                                        scale,
                                                        onAddMore: (updatedDay) => openAddProductModal(addMealIndex, true, updatedDay),
                                                    });
                                                }, 100);
                                            });
                                        }
                                        if (scrollToDiaryHeading) scrollToDiaryHeading();
                                    },
                                    onNewProduct: () => {
                                        if (window.HEYS?.products?.showAddModal) {
                                            window.HEYS.products.showAddModal();
                                        }
                                    },
                                });
                            };

                            // Показываем модалку выбора флоу
                            if (!window.HEYS?.ConfirmModal?.show) {
                                // Fallback: сразу открываем быстрый режим
                                openAddProductModal(mealIndex, false);
                                return;
                            }

                            window.HEYS.ConfirmModal.show({
                                icon: '🍽️',
                                title: `Добавить продукты в ${mealName}`,
                                text: React.createElement('div', {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        margin: '8px 0'
                                    }
                                },
                                    // Кнопка "Быстро добавить 1 продукт"
                                    React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--quick',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '12px',
                                            background: '#fff',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: () => {
                                            window.HEYS.ConfirmModal.hide();
                                            // Lazy-вычисляем актуальный индекс на момент клика
                                            const actualIdx = findMealIndex();
                                            if (actualIdx >= 0) {
                                                setTimeout(() => openAddProductModal(actualIdx, false), 100);
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            style: { fontSize: '28px' }
                                        }, '➕'),
                                        React.createElement('div', {
                                            style: { flex: 1 }
                                        },
                                            React.createElement('div', {
                                                style: { fontWeight: '600', color: '#1e293b', fontSize: '15px' }
                                            }, 'Быстро добавить 1 продукт'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
                                            }, 'Выбрать продукт и сразу закрыть')
                                        )
                                    ),
                                    // Кнопка "Добавить несколько продуктов"
                                    React.createElement('button', {
                                        className: 'flow-selection-btn flow-selection-btn--multi',
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            border: '2px solid #3b82f6',
                                            borderRadius: '12px',
                                            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        },
                                        onClick: () => {
                                            window.HEYS.ConfirmModal.hide();
                                            // Lazy-вычисляем актуальный индекс на момент клика
                                            const actualIdx = findMealIndex();
                                            if (actualIdx >= 0) {
                                                setTimeout(() => openAddProductModal(actualIdx, true), 100);
                                            }
                                        }
                                    },
                                        React.createElement('span', {
                                            style: { fontSize: '28px' }
                                        }, '📝'),
                                        React.createElement('div', {
                                            style: { flex: 1 }
                                        },
                                            React.createElement('div', {
                                                style: { fontWeight: '600', color: '#1e40af', fontSize: '15px' }
                                            }, 'Добавить несколько продуктов'),
                                            React.createElement('div', {
                                                style: { fontSize: '12px', color: '#3b82f6', marginTop: '2px' }
                                            }, 'Формировать приём пошагово')
                                        )
                                    )
                                ),
                                // Скрываем стандартную кнопку confirm — используем кастомные внутри text
                                confirmText: '',
                                cancelText: 'Отмена',
                                cancelStyle: 'primary',
                                cancelVariant: 'outline'
                            });
                        };

                        // Запускаем через rAF — ждём пока React применит state update
                        requestAnimationFrame(() => showFlowModal(1));
                    },
                });
            } else if (isMobile) {
                if (openTimePickerForNewMeal) openTimePickerForNewMeal();
            } else {
                const newMealId = uid('m_');
                const newMeal = { id: newMealId, name: 'Приём', time: '', mood: '', wellbeing: '', stress: '', items: [] };
                const newUpdatedAt = Date.now();
                let newMealIndex = 0;
                if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
                if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
                setDay((prevDay) => {
                    const baseMeals = prevDay.meals || [];
                    const newMeals = [...baseMeals, newMeal];
                    newMealIndex = newMeals.length - 1;
                    const newDayData = { ...prevDay, meals: newMeals, updatedAt: newUpdatedAt };
                    const key = 'heys_dayv2_' + date;
                    try {
                        lsSet(key, newDayData);
                    } catch (e) {
                        trackError(e, { source: 'day/_meals.js', action: 'save_meal_desktop' });
                    }
                    return newDayData;
                });
                expandOnlyMeal(newMealIndex);
                if (window.HEYS && window.HEYS.analytics) {
                    window.HEYS.analytics.trackDataOperation('meal-created');
                }
                HEYS.Toast?.success('Приём создан');
                window.dispatchEvent(new CustomEvent('heysMealAdded', { detail: { meal: newMeal } }));
            }
        }, [date, expandOnlyMeal, isMobile, openTimePickerForNewMeal, products, setDay, day, prof, pIndex, getProductFromItem, scrollToDiaryHeading, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const updateMealTime = React.useCallback((mealIndex, newTime) => {
            setDay((prevDay) => {
                const updatedMeals = (prevDay.meals || []).map((m, i) =>
                    i === mealIndex ? { ...m, time: newTime } : m,
                );
                const sortedMeals = sortMealsByTime(updatedMeals);
                return { ...prevDay, meals: sortedMeals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeMeal = React.useCallback(async (i) => {
            const confirmed = await HEYS.ConfirmModal?.confirmDelete({
                icon: '🗑️',
                title: 'Удалить приём пищи?',
                text: 'Все продукты в этом приёме будут удалены. Это действие нельзя отменить.',
            });

            if (!confirmed) return;

            haptic('medium');
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).filter((_, idx) => idx !== i);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [haptic, setDay]);

        const addProductToMeal = React.useCallback((mi, p) => {
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление продуктов недоступно');
                return;
            }

            haptic('light');

            console.info('[HEYS.day] ➕ addProductToMeal', {
                mealIndex: mi,
                productId: p?.id ?? p?.product_id ?? null,
                productName: p?.name || null,
                source: p?._source || (p?._fromShared ? 'shared' : 'personal')
            });

            let finalProduct = p;
            if (p?._fromShared || p?._source === 'shared' || p?.is_shared) {
                const cloned = HEYS.products?.addFromShared?.(p);
                if (cloned) {
                    finalProduct = cloned;
                }
            }

            // Use centralized harm normalization
            const harmVal = HEYS.models?.normalizeHarm?.(finalProduct);

            const item = {
                id: uid('it_'),
                product_id: finalProduct.id ?? finalProduct.product_id,
                name: finalProduct.name,
                grams: finalProduct.grams || 100,
                kcal100: finalProduct.kcal100,
                protein100: finalProduct.protein100,
                fat100: finalProduct.fat100,
                simple100: finalProduct.simple100,
                complex100: finalProduct.complex100,
                badFat100: finalProduct.badFat100,
                goodFat100: finalProduct.goodFat100,
                trans100: finalProduct.trans100,
                fiber100: finalProduct.fiber100,
                gi: finalProduct.gi ?? finalProduct.gi100,
                harm: harmVal,  // Normalized harm (0-10)
            };
            const newUpdatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
            setDay((prevDay) => {
                const mealsList = prevDay.meals || [];
                if (!mealsList[mi]) {
                    console.warn('[HEYS.day] ❌ Meal index not found for addProductToMeal', {
                        mealIndex: mi,
                        mealsCount: mealsList.length,
                        productName: finalProduct?.name || null
                    });
                }
                const meals = mealsList.map((m, i) => i === mi ? { ...m, items: [...(m.items || []), item] } : m);
                const newDayData = { ...prevDay, meals, updatedAt: newUpdatedAt };
                const key = 'heys_dayv2_' + date;
                try {
                    lsSet(key, newDayData);
                } catch (e) {
                    trackError(e, { source: 'day/_meals.js', action: 'save_product_quick' });
                }
                return newDayData;
            });

            if (setNewItemIds) {
                setNewItemIds((prev) => new Set([...prev, item.id]));
                setTimeout(() => {
                    setNewItemIds((prev) => {
                        const next = new Set(prev);
                        next.delete(item.id);
                        return next;
                    });
                }, 500);
            }

            window.dispatchEvent(new CustomEvent('heysProductAdded'));
        }, [haptic, setDay, setNewItemIds, date]);

        const setGrams = React.useCallback((mi, itId, g) => {
            const grams = +g || 0;
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).map((it) => it.id === itId ? { ...it, grams } : it) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const removeItem = React.useCallback((mi, itId) => {
            haptic('medium');
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mi ? { ...m, items: (m.items || []).filter((it) => it.id !== itId) } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
            setTimeout(() => {
                if (window.HEYS?.orphanProducts?.recalculate) {
                    window.HEYS.orphanProducts.recalculate();
                }
            }, 100);
        }, [haptic, setDay]);

        const updateMealField = React.useCallback((mealIndex, field, value) => {
            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => i === mealIndex ? { ...m, [field]: value } : m);
                return { ...prevDay, meals, updatedAt: Date.now() };
            });
        }, [setDay]);

        const changeMealMood = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'mood', value), [updateMealField]);
        const changeMealWellbeing = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'wellbeing', value), [updateMealField]);
        const changeMealStress = React.useCallback((mealIndex, value) => updateMealField(mealIndex, 'stress', value), [updateMealField]);

        const changeMealType = React.useCallback((mealIndex, newType) => {
            const newUpdatedAt = Date.now();
            if (lastLoadedUpdatedAtRef) lastLoadedUpdatedAtRef.current = newUpdatedAt;
            if (blockCloudUpdatesUntilRef) blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;

            setDay((prevDay) => {
                const meals = (prevDay.meals || []).map((m, i) => {
                    if (i !== mealIndex) return m;
                    const newName = newType && MEAL_TYPES_HANDLER && MEAL_TYPES_HANDLER[newType]
                        ? MEAL_TYPES_HANDLER[newType].name
                        : m.name;
                    return { ...m, mealType: newType, name: newName };
                });
                return { ...prevDay, meals, updatedAt: newUpdatedAt };
            });
            haptic('light');
        }, [setDay, lastLoadedUpdatedAtRef, blockCloudUpdatesUntilRef]);

        const isNewItem = React.useCallback((itemId) => newItemIds && newItemIds.has(itemId), [newItemIds]);

        return {
            addMeal,
            updateMealTime,
            removeMeal,
            addProductToMeal,
            setGrams,
            removeItem,
            updateMealField,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            changeMealType,
            isNewItem,
            sortMealsByTime,
        };
    }

    HEYS.dayMealHandlers = {
        createMealHandlers,
        sortMealsByTime,
    };

})(window);


/* ===== heys_day_tab_impl_v1.js ===== */
// heys_day_tab_impl_v1.js — DayTab component implementation extracted from heys_day_v12.js
// Refactored: imports from heys_day_utils.js, heys_day_hooks.js, heys_day_pickers.js

; (function (global) {

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;
    const HEYSRef = HEYS;

    // 🆕 Heartbeat для watchdog — DayTab impl загружен (критический для dep check)
    if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

    // === Import utilities from dayUtils module ===
    const U = HEYS.dayUtils || {};

    // Explicit check for required dayUtils functions (warn once at load time)
    if (!HEYS.dayUtils) {
        console.error('[heys_day_v12] CRITICAL: HEYS.dayUtils not loaded before heys_day_v12.js');
    }

    // Haptic feedback (optional - graceful degradation if not available)
    const haptic = U.haptic || (() => { });

    // === Import popup components from dayPopups module ===
    const { PopupWithBackdrop, createSwipeHandlers, PopupCloseButton } = HEYS.dayPopups || {};

    // === Import photo gallery from dayGallery module ===
    const { PHOTO_LIMIT_PER_MEAL, LazyPhotoThumb } = HEYS.dayGallery || {};

    // === Import meal scoring from mealScoring module ===
    const {
        MEAL_KCAL_LIMITS,
        IDEAL_MACROS_UNIFIED,
        MEAL_KCAL_ABSOLUTE,
        IDEAL_MACROS,
        CIRCADIAN_MEAL_BONUS,
        LIQUID_FOOD_PATTERNS,
        HEALTHY_LIQUID_PATTERNS,
        LIQUID_FOOD_PENALTY,
        GL_QUALITY_THRESHOLDS,
        isLiquidFood,
        calculateMealGL,
        getCircadianBonus,
        getGLQualityBonus,
        calcKcalScore,
        calcMacroScore,
        calcCarbQuality,
        calcFatQuality,
        calcGiHarmScore,
        getMealQualityScore,
        getNutrientColor,
        getNutrientTooltip,
        getDailyNutrientColor,
        getDailyNutrientTooltip
    } = HEYS.mealScoring || {};

    // === Import AdviceCard from dayComponents module ===
    const AdviceCard = HEYS.dayComponents?.AdviceCard;

    // === Import MealAddProduct and ProductRow from dayComponents module ===
    const MealAddProduct = HEYS.dayComponents?.MealAddProduct;
    const ProductRow = HEYS.dayComponents?.ProductRow;

    // === Import MealCard from dayComponents module ===
    const MealCard = HEYS.dayComponents?.MealCard;

    // === Day helpers (storage/sound/guards/init/effects) ===
    if (!HEYS.dayStorage?.lsGet || !HEYS.dayStorage?.lsSet) {
        throw new Error('[heys_day_v12] HEYS.dayStorage not loaded before heys_day_v12.js');
    }
    if (!HEYS.daySound?.playSuccessSound) {
        throw new Error('[heys_day_v12] HEYS.daySound not loaded before heys_day_v12.js');
    }
    if (!HEYS.dayGuards?.renderGuardScreen) {
        throw new Error('[heys_day_v12] HEYS.dayGuards not loaded before heys_day_v12.js');
    }
    if (!HEYS.dayInit?.getInitialDay) {
        throw new Error('[heys_day_v12] HEYS.dayInit not loaded before heys_day_v12.js');
    }
    if (!HEYS.daySleepEffects?.useSleepHoursEffect) {
        throw new Error('[heys_day_v12] HEYS.daySleepEffects not loaded before heys_day_v12.js');
    }
    if (!HEYS.dayGlobalExports?.useDayGlobalExportsEffect) {
        throw new Error('[heys_day_v12] HEYS.dayGlobalExports not loaded before heys_day_v12.js');
    }
    const { lsGet, lsSet } = HEYS.dayStorage;
    const { playSuccessSound } = HEYS.daySound;
    const dayGuards = HEYS.dayGuards;
    const dayInit = HEYS.dayInit;
    const daySleepEffects = HEYS.daySleepEffects;
    const dayGlobalExports = HEYS.dayGlobalExports;

    // Utility functions from dayUtils (required)
    const pad2 = U.pad2;
    const todayISO = U.todayISO;
    const fmtDate = U.fmtDate;
    const parseISO = U.parseISO;
    const uid = U.uid;
    const formatDateDisplay = U.formatDateDisplay;
    // Math utilities from dayUtils (required)
    const clamp = U.clamp;
    const r0 = U.r0;
    const r1 = U.r1;
    const scale = U.scale;
    // Data model utilities from dayUtils (required)
    const ensureDay = U.ensureDay;
    const buildProductIndex = U.buildProductIndex;
    const getProductFromItem = U.getProductFromItem;
    const per100 = U.per100;
    const loadMealsForDate = U.loadMealsForDate;
    const productsSignature = U.productsSignature;
    const computePopularProducts = U.computePopularProducts;
    // Profile and calculation utilities from dayUtils (required)
    const getProfile = U.getProfile;
    const calcBMR = U.calcBMR;
    const kcalPerMin = U.kcalPerMin;
    const stepsKcal = U.stepsKcal;
    // Time parsing utilities from dayUtils (required)
    const parseTime = U.parseTime;
    const sleepHours = U.sleepHours;
    // Meal type classification
    const getMealType = U.getMealType;

    // === Import hooks from dayHooks module ===
    const H = HEYS.dayHooks || {};
    const useDayAutosave = H.useDayAutosave;
    const useMobileDetection = H.useMobileDetection;
    const useSmartPrefetch = H.useSmartPrefetch;

    // Calendar загружается динамически в DayTab (строка ~1337), 
    // НЕ кэшируем здесь чтобы HMR работал

    // === Import models module ===
    const M = HEYS.models || {};

    // === MealOptimizerSection (extracted) ===
    if (!HEYS.dayMealOptimizerSection?.MealOptimizerSection) {
        throw new Error('[heys_day_v12] HEYS.dayMealOptimizerSection not loaded before heys_day_v12.js');
    }
    const MealOptimizerSection = HEYS.dayMealOptimizerSection.MealOptimizerSection;

    function logMealExpandMissing(phase) {
        try {
            if (!HEYSRef.analytics?.trackError) return;
            const hasMealsScript = !!(global.document && document.querySelector && document.querySelector('script[src*="day/_meals.js"], script[src*="day%2F_meals.js"]'));
            HEYSRef.analytics.trackError(new Error('[heys_day_v12] dayMealExpandState missing'), {
                source: 'heys_day_tab_impl_v1.js',
                type: 'missing_dependency',
                phase: phase || 'unknown',
                hasMealsScript,
                modules: {
                    dayMealsList: !!HEYSRef.dayMealsList,
                    dayMealsDisplay: !!HEYSRef.dayMealsDisplay,
                    dayMealHandlers: !!HEYSRef.dayMealHandlers,
                    dayMealOptimizerSection: !!HEYSRef.dayMealOptimizerSection,
                    dayGuards: !!HEYSRef.dayGuards,
                    dayStorage: !!HEYSRef.dayStorage,
                    dayBundle: !!HEYSRef.dayMealsBundle,
                },
                version: HEYSRef.version || HEYSRef.buildVersion || null,
            });
        } catch (e) { }
    }

    // === Meal expand state fallback (если day/_meals.js не загрузился) ===
    if (!HEYSRef.dayMealExpandState?.useMealExpandState) {
        logMealExpandMissing('module_init');

        function useMealExpandState(params) {
            const { date } = params || {};
            if (!React) return {};

            const expandedMealsKey = 'heys_expandedMeals_' + date;

            const [manualExpandedStale, setManualExpandedStale] = React.useState({});
            const [expandedMeals, setExpandedMeals] = React.useState(() => {
                try {
                    const cached = sessionStorage.getItem(expandedMealsKey);
                    return cached ? JSON.parse(cached) : {};
                } catch (e) {
                    return {};
                }
            });

            React.useEffect(() => {
                try {
                    sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
                } catch (e) { }
            }, [expandedMeals, expandedMealsKey]);

            const isMealStale = React.useCallback((meal) => {
                if (!meal || !meal.time) return false;
                const [hours, minutes] = meal.time.split(':').map(Number);
                if (isNaN(hours) || isNaN(minutes)) return false;
                const now = new Date();
                const mealDate = new Date();
                mealDate.setHours(hours, minutes, 0, 0);
                const diffMinutes = (now - mealDate) / (1000 * 60);
                return diffMinutes > 30;
            }, []);

            const toggleMealExpand = React.useCallback((mealIndex, meals) => {
                const meal = meals && meals[mealIndex];
                const isStale = meal && isMealStale(meal);

                if (isStale) {
                    setManualExpandedStale((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                } else {
                    setExpandedMeals((prev) => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
                }
            }, [isMealStale]);

            const expandOnlyMeal = React.useCallback((mealIndex) => {
                const newState = {};
                newState[mealIndex] = true;
                setExpandedMeals(newState);
            }, []);

            const isMealExpanded = React.useCallback((mealIndex, totalMeals, meals, displayIndex = null) => {
                const meal = meals && meals[mealIndex];
                const isStale = meal && isMealStale(meal);

                if (isStale) {
                    return manualExpandedStale[mealIndex] === true;
                }

                if (Object.prototype.hasOwnProperty.call(expandedMeals, mealIndex)) {
                    return expandedMeals[mealIndex];
                }

                if (displayIndex !== null) {
                    return displayIndex === 0;
                }
                return mealIndex === totalMeals - 1;
            }, [expandedMeals, manualExpandedStale, isMealStale]);

            return {
                isMealStale,
                toggleMealExpand,
                expandOnlyMeal,
                isMealExpanded
            };
        }

        HEYSRef.dayMealExpandState = {
            useMealExpandState
        };
    }

    HEYS.DayTab = function DayTab(props) {

        // === CRITICAL: Глобальный флаг logout — проверяем ДО любых хуков! ===
        // React требует чтобы хуки вызывались всегда в одном порядке,
        // но мы можем сделать return ДО первого хука
        const logoutScreen = dayGuards.getLogoutScreen({ React, HEYSRef: window.HEYS });
        if (logoutScreen) return logoutScreen;

        const { useState, useMemo, useEffect, useRef } = React;

        const [mealsDepsReady, setMealsDepsReady] = useState(() => {
            return !!(HEYSRef.dayMealExpandState?.useMealExpandState
                && HEYSRef.dayMealHandlers?.createMealHandlers
                && HEYSRef.dayMealHandlers?.sortMealsByTime);
        });

        useEffect(() => {
            if (mealsDepsReady) return;
            if (!HEYSRef.waitForDeps) return;

            HEYSRef.waitForDeps([
                {
                    name: 'dayMealExpandState',
                    check: () => !!HEYSRef.dayMealExpandState?.useMealExpandState,
                },
                {
                    name: 'dayMealHandlers',
                    check: () => !!(HEYSRef.dayMealHandlers?.createMealHandlers && HEYSRef.dayMealHandlers?.sortMealsByTime),
                },
            ], () => {
                setMealsDepsReady(true);
            }, {
                timeoutMs: 3000,
                intervalMs: 20,
                onTimeout: () => {
                    logMealExpandMissing('waitForDeps_timeout');
                },
            });
        }, [mealsDepsReady]);

        // === EARLY RETURN: защита при logout/auth clearing ===
        // Во время logout очищаются данные → компонент может получить undefined
        // Вместо краша просто показываем loading
        const propsGuardScreen = dayGuards.getPropsGuardScreen({ React, props });
        if (propsGuardScreen) return propsGuardScreen;

        // Дата приходит из шапки App (DatePicker в header)
        const { selectedDate, setSelectedDate } = props;

        // Products context (extracted)
        if (!HEYS.dayProductsContext?.useProductsContext) {
            throw new Error('[heys_day_v12] HEYS.dayProductsContext not loaded before heys_day_v12.js');
        }
        const productsContext = HEYS.dayProductsContext.useProductsContext({
            React,
            propsProducts: props.products,
            productsSignature,
            buildProductIndex,
            HEYS: window.HEYS
        }) || {};
        const { products, prodSig, pIndex } = productsContext;

        // Boot effects (twemoji parse + analytics)
        if (!HEYS.dayEffects?.useDayBootEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEffects.useDayBootEffects();

        // PERF v8.1: Lightweight re-render when deferred modules load
        // Avoids full setDay() reload — just triggers render so deferredSlot swaps skeleton → content
        if (HEYS.dayEffects.useDeferredModuleEffect) {
            HEYS.dayEffects.useDeferredModuleEffect();
        }

        // prodSig/pIndex/debug now handled by dayProductsContext
        const prof = getProfile();
        // date приходит из props (selectedDate из App header)
        const date = selectedDate || todayISO();
        const setDate = setSelectedDate;
        // Meal expand/collapse state (extracted)
        if (!HEYSRef.dayMealExpandState?.useMealExpandState) {
            logMealExpandMissing('runtime_guard');

            HEYSRef.dayMealExpandState = {
                useMealExpandState: () => ({
                    isMealStale: () => false,
                    toggleMealExpand: () => { },
                    expandOnlyMeal: () => { },
                    isMealExpanded: (mealIndex, totalMeals, _meals, displayIndex = null) => {
                        if (displayIndex !== null) return displayIndex === 0;
                        return mealIndex === totalMeals - 1;
                    }
                })
            };
        }
        const mealExpandState = HEYSRef.dayMealExpandState.useMealExpandState({ React, date }) || {};
        const {
            isMealStale,
            toggleMealExpand,
            expandOnlyMeal,
            isMealExpanded
        } = mealExpandState;

        // Централизованная детекция мобильного устройства (с поддержкой ротации)
        const isMobile = useMobileDetection(768);

        // === МОБИЛЬНЫЕ ПОД-ВКЛАДКИ ===
        // 'stats' — статистика дня (шапка, статистика, активность, сон)
        // 'diary' — дневник питания (суточные итоги, приёмы пищи)
        // Теперь subTab приходит из props (из нижнего меню App)
        const mobileSubTab = props.subTab || 'stats';

        // === СВАЙП ДЛЯ ПОД-ВКЛАДОК УБРАН ===
        // Теперь свайп между stats/diary обрабатывается глобально в App
        // (нижнее меню с 5 вкладками)
        const onSubTabTouchStart = React.useCallback(() => { }, []);
        const onSubTabTouchEnd = React.useCallback(() => { }, []);

        // isMealExpanded теперь из dayMealExpandState

        // Флаг: данные загружены (из localStorage или Supabase)
        const [isHydrated, setIsHydrated] = useState(false);

        // State для развёрнутости NDTE badge (Next-Day Training Effect)
        const [ndteExpanded, setNdteExpanded] = useState(false);

        // Ref для отслеживания предыдущей даты (нужен для flush перед сменой)
        const prevDateRef = React.useRef(date);

        // Ref для отслеживания последнего updatedAt — предотвращает гонку между doLocal и handleDayUpdated
        const lastLoadedUpdatedAtRef = React.useRef(0);

        // Ref для блокировки обновлений от cloud sync во время редактирования
        const blockCloudUpdatesUntilRef = React.useRef(0);

        // Ref для блокировки событий heys:day-updated во время начальной синхронизации
        // Это предотвращает множественные setDay() вызовы и мерцание UI
        const isSyncingRef = React.useRef(false);

        // Миграция тренировок: quality/feelAfter → mood/wellbeing/stress
        // === Phase 11 Integration: Use extracted normalization functions ===
        const normalizeTrainings = HEYS.dayCalculations?.normalizeTrainings || ((trainings = []) => trainings);
        const cleanEmptyTrainings = HEYS.dayCalculations?.cleanEmptyTrainings || ((trainings) => trainings || []);

        const [dayRaw, setDayRaw] = useState(() => dayInit.getInitialDay({
            date,
            prof,
            lsGet,
            ensureDay,
            normalizeTrainings,
            cleanEmptyTrainings
        }));

        const setDay = setDayRaw;
        const day = dayRaw;
        const dayRef = useRef(day);

        useEffect(() => {
            dayRef.current = day;
        }, [day]);

        // === EARLY RETURN #2: защита если day стал undefined при logout ===
        // Это может произойти при race condition когда localStorage очищается во время рендера
        const missingDayScreen = dayGuards.getMissingDayScreen({ React, day });
        if (missingDayScreen) return missingDayScreen;

        // ЗАЩИТА ОТ КРАША: safeMeals всегда массив, даже когда day=undefined при logout
        const safeMeals = day?.meals || [];

        // cleanEmptyTrainings определена выше (для совместимости с прежним кодом вызовы остаются)

        // ЗАЩИТА: не сохранять до завершения гидратации (чтобы не затереть данные из Supabase)
        const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet, disabled: !isHydrated });

        // Smart Prefetch: предзагрузка ±7 дней при наличии интернета
        useSmartPrefetch && useSmartPrefetch({ currentDate: date, daysRange: 7, enabled: isHydrated });

        dayGlobalExports.useDayGlobalExportsEffect({
            React,
            flush,
            blockCloudUpdatesUntilRef,
            lastLoadedUpdatedAtRef,
            dayRef
        });

        // Логирование для диагностики рассинхрона продуктов и приёмов пищи
        useEffect(() => {
            // ...existing code...
        }, [products, day]);

        // ...existing code...

        // ...existing code...

        // ...existing code...

        // ...удалены дублирующиеся объявления useState...
        useEffect(() => { lsSet('heys_dayv2_date', date); }, [date]);

        // Effects (sync + heys:day-updated listener) — вынесено в модуль
        if (!HEYS.dayEffects?.useDaySyncEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEffects.useDaySyncEffects({
            date,
            setIsHydrated,
            setDay,
            getProfile,
            ensureDay,
            loadMealsForDate,
            lsGet,
            lsSet,
            normalizeTrainings,
            cleanEmptyTrainings,
            prevDateRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            isSyncingRef
        });

        // 🔬 TDEE v1.1.0: Консолидированный расчёт через единый модуль HEYS.TDEE
        // Заменяет ~60 строк inline кода — bmr, actTotal, TEF, NDTE, optimum
        if (!HEYS.dayEnergyContext?.buildEnergyContext) {
            throw new Error('[heys_day_v12] HEYS.dayEnergyContext not loaded before heys_day_v12.js');
        }
        const energyCtx = HEYS.dayEnergyContext.buildEnergyContext({
            day,
            prof,
            lsGet,
            pIndex,
            M,
            r0,
            HEYS: window.HEYS
        }) || {};
        const {
            tdeeResult,
            bmr,
            actTotal,
            trainingsK,
            train1k,
            train2k,
            train3k,
            stepsK,
            householdK,
            totalHouseholdMin,
            ndteBoostKcal,
            ndteData,
            tefKcal,
            tefData,
            baseExpenditure,
            tdee,
            optimum,
            weight,
            mets,
            kcalMin,
            dayTargetDef,
            cycleKcalMultiplier,
            TR,
            householdActivities,
            z,
            trainK,
            profileTargetDef,
            eatenKcal,
            factDefPct
        } = energyCtx;

        // Функция для вычисления средних оценок из утреннего чек-ина, приёмов пищи И тренировок
        // === Phase 11 Integration: Use extracted calculateDayAverages ===
        const calculateDayAverages = HEYS.dayCalculations?.calculateDayAverages || ((meals, trainings, dayData) => ({ moodAvg: '', wellbeingAvg: '', stressAvg: '', dayScore: '' }));

        // Автоматическое обновление средних оценок и dayScore (extracted)
        if (!HEYS.dayRatingAverages?.useRatingAveragesEffect) {
            throw new Error('[heys_day_v12] HEYS.dayRatingAverages not loaded before heys_day_v12.js');
        }
        HEYS.dayRatingAverages.useRatingAveragesEffect({
            React,
            day,
            setDay,
            calculateDayAverages
        });

        // === Sparkline данные: динамика настроения в течение дня (extracted) ===
        if (!HEYS.dayMoodSparkline?.useMoodSparklineData) {
            throw new Error('[heys_day_v12] HEYS.dayMoodSparkline not loaded before heys_day_v12.js');
        }
        const moodSparklineData = HEYS.dayMoodSparkline.useMoodSparklineData({ React, day }) || [];

        // === Meal Handlers (Phase 10) ===
        if (!mealsDepsReady) {
            return React.createElement('div', {
                className: 'card tone-slate',
                style: { margin: '12px', padding: '12px' },
            }, 'Загрузка дневника…');
        }
        if (!HEYS.dayMealHandlers?.createMealHandlers || !HEYS.dayMealHandlers?.sortMealsByTime) {
            throw new Error('[heys_day_v12] HEYS.dayMealHandlers not loaded before heys_day_v12.js');
        }
        const { sortMealsByTime } = HEYS.dayMealHandlers;

        // === Picker modals state/handlers (extracted) ===
        if (!HEYS.dayPickerModals?.usePickerModalsState) {
            throw new Error('[heys_day_v12] HEYS.dayPickerModals not loaded before heys_day_v12.js');
        }
        const updateMealTimeRef = useRef(null);
        const pickerState = HEYS.dayPickerModals.usePickerModalsState({
            day,
            date,
            isMobile,
            setDay,
            expandOnlyMeal,
            sortMealsByTime,
            haptic,
            updateMealTimeRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            calculateDayAverages,
            U,
            pad2,
            uid,
            lsGet
        }) || {};

        const {
            showTimePicker,
            pendingMealTime,
            setPendingMealTime,
            editingMealIndex,
            editMode,
            showTrainingPicker,
            setShowTrainingPicker,
            trainingPickerStep,
            setTrainingPickerStep,
            editingTrainingIndex,
            setEditingTrainingIndex,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            visibleTrainings,
            setVisibleTrainings,
            chartPeriod,
            setChartPeriod,
            chartTransitioning,
            handlePeriodChange,
            showZonePicker,
            setShowZonePicker,
            zonePickerTarget,
            setZonePickerTarget,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            zoneMinutesValues,
            zoneFormulaPopup,
            setZoneFormulaPopup,
            householdFormulaPopup,
            setHouseholdFormulaPopup,
            showSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            setShowDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            dayScoreValues,
            showWeightPicker,
            showDeficitPicker,
            pickerStep,
            animDirection,
            pendingMealMood,
            setPendingMealMood,
            pendingMealType,
            setPendingMealType,
            emojiAnimating,
            setEmojiAnimating,
            getScoreGradient,
            getScoreTextColor,
            getScoreEmoji,
            getYesterdayData,
            getCompareArrow,
            WheelColumn,
            trainingTypes,
            hoursValues,
            minutesValues,
            ratingValues,
            isNightHourSelected,
            currentDateLabel,
            openSleepQualityPicker,
            confirmSleepQualityPicker,
            cancelSleepQualityPicker,
            openDayScorePicker,
            confirmDayScorePicker,
            cancelDayScorePicker,
            openTimePickerForNewMeal,
            openTimeEditor,
            openMoodEditor,
            goToMoodStep,
            goBackToTimeStep,
            confirmTimeEdit,
            confirmMoodEdit,
            confirmMealCreation,
            cancelTimePicker
        } = pickerState;

        // === BottomSheet с поддержкой свайпа (extracted) ===
        if (!HEYS.dayBottomSheet?.useBottomSheetHandlers) {
            throw new Error('[heys_day_v12] HEYS.dayBottomSheet not loaded before heys_day_v12.js');
        }
        const bottomSheetState = HEYS.dayBottomSheet.useBottomSheetHandlers({ React, haptic }) || {};
        const {
            bottomSheetRef,
            handleSheetTouchStart,
            handleSheetTouchMove,
            handleSheetTouchEnd
        } = bottomSheetState;

        // === Popups (extracted) ===
        const popupsState = HEYS.dayPopupsState?.usePopupsState?.({ React }) || {};
        const {
            sparklinePopup,
            setSparklinePopup,
            macroBadgePopup,
            setMacroBadgePopup,
            metricPopup,
            setMetricPopup,
            tdeePopup,
            setTdeePopup,
            mealQualityPopup,
            setMealQualityPopup,
            weekNormPopup,
            setWeekNormPopup,
            weekDeficitPopup,
            setWeekDeficitPopup,
            balanceDayPopup,
            setBalanceDayPopup,
            tefInfoPopup,
            setTefInfoPopup,
            goalPopup,
            setGoalPopup,
            debtSciencePopup,
            setDebtSciencePopup,
            closeAllPopups,
            openExclusivePopup,
            getSmartPopupPosition
        } = popupsState;

        // === Состояние раскрытия карточки баланса калорий ===
        const [balanceCardExpanded, setBalanceCardExpanded] = useState(false);

        // === Measurements (extracted) ===
        const measurementsState = HEYS.dayMeasurements?.useMeasurementsState?.({
            React,
            day,
            date,
            setDay,
            HEYS: window.HEYS
        }) || {};

        const {
            measurementsHistory,
            measurementsByField,
            measurementsMonthlyProgress,
            measurementsLastDateFormatted,
            measurementsNeedUpdate,
            openMeasurementsEditor,
            renderMeasurementSpark
        } = measurementsState;

        // === Sparkline state (extracted) ===
        if (!HEYS.daySparklineState?.useSparklineState) {
            throw new Error('[heys_day_v12] HEYS.daySparklineState not loaded before heys_day_v12.js');
        }
        const sparklineState = HEYS.daySparklineState.useSparklineState({ React }) || {};
        const {
            sliderPoint,
            setSliderPoint,
            sliderPrevPointRef,
            sparklineZoom,
            setSparklineZoom,
            sparklinePan,
            setSparklinePan,
            sparklineZoomRef,
            sparklineRefreshKey,
            setSparklineRefreshKey,
            brushRange,
            setBrushRange,
            brushing,
            setBrushing,
            brushStartRef
        } = sparklineState;


        // === Pull-to-refresh (Enhanced) ===
        const {
            pullProgress,
            isRefreshing,
            refreshStatus,
            pullThreshold
        } = HEYS.dayPullRefresh?.usePullToRefresh?.({
            React,
            date,
            lsGet,
            lsSet,
            HEYS: window.HEYS
        }) || { pullProgress: 0, isRefreshing: false, refreshStatus: 'idle', pullThreshold: 80 };

        // === Runtime UI state (time/offline/theme/hints) — extracted ===
        if (!HEYS.dayRuntimeUiState?.useRuntimeUiState) {
            throw new Error('[heys_day_v12] HEYS.dayRuntimeUiState not loaded before heys_day_v12.js');
        }
        const runtimeUiState = HEYS.dayRuntimeUiState.useRuntimeUiState({ React, HEYS: window.HEYS }) || {};
        const {
            currentMinute,
            insulinExpanded,
            setInsulinExpanded,
            isOnline,
            pendingChanges,
            syncMessage,
            pendingQueue,
            theme,
            setTheme,
            resolvedTheme,
            cycleTheme,
            mealChartHintShown,
            setMealChartHintShown,
            showFirstPerfectAchievement,
            setShowFirstPerfectAchievement,
            newMealAnimatingIndex,
            setNewMealAnimatingIndex
        } = runtimeUiState;

        // === Animations (extracted) ===
        if (!HEYS.dayAnimations?.useDayAnimations) {
            throw new Error('[heys_day_v12] HEYS.dayAnimations not loaded before heys_day_v12.js');
        }
        const animationsState = HEYS.dayAnimations.useDayAnimations({
            eatenKcal,
            optimum,
            mobileSubTab,
            date,
            haptic,
            playSuccessSound
        }) || {};
        const {
            showConfetti,
            setShowConfetti,
            shakeEaten,
            shakeOver,
            pulseSuccess,
            animatedProgress,
            animatedKcal,
            animatedRatioPct,
            animatedMarkerPos,
            isAnimating
        } = animationsState;

        // mealChartHintShown/showFirstPerfectAchievement/newMealAnimatingIndex are in dayRuntimeUiState

        // Emoji animation state handled by HEYS.dayPickerModals

        // Animation state handled by HEYS.dayAnimations

        // === Edit Grams Modal (extracted state) ===
        if (!HEYS.dayEditGramsState?.useEditGramsState) {
            throw new Error('[heys_day_v12] HEYS.dayEditGramsState not loaded before heys_day_v12.js');
        }
        const editGramsState = HEYS.dayEditGramsState.useEditGramsState({
            React,
            haptic
        }) || {};
        const {
            editGramsTarget,
            setEditGramsTarget,
            editGramsValue,
            setEditGramsValue,
            editGramsInputRef,
            editPortions,
            editLastPortionGrams,
            handleEditGramsDrag
        } = editGramsState;

        // NOTE: Zone/Household handlers moved to HEYS.dayTrainingHandlers.createTrainingHandlers() — see Phase 10 below
        // NOTE: Training Picker functions (openTrainingPicker, confirmTrainingPicker, cancelTrainingPicker)
        //       are now imported from createTrainingHandlers() — see destructuring at line ~1815

        // === Water state (extracted) ===
        if (!HEYS.dayWaterState?.useWaterState) {
            throw new Error('[heys_day_v12] HEYS.dayWaterState not loaded before heys_day_v12.js');
        }
        const waterState = HEYS.dayWaterState.useWaterState({
            React,
            day,
            prof,
            train1k,
            train2k,
            train3k,
            haptic
        }) || {};
        const {
            waterGoalBreakdown,
            waterGoal,
            waterMotivation,
            waterLastDrink,
            showWaterTooltip,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave
        } = waterState;

        // === Water functions (addWater, removeWater) provided by dayHandlers ===

        // === Handlers bundle (meal + day + training + water anim/presets) ===
        if (!HEYS.dayHandlersBundle?.useDayHandlersBundle) {
            throw new Error('[heys_day_v12] HEYS.dayHandlersBundle not loaded before heys_day_v12.js');
        }
        const handlersBundle = HEYS.dayHandlersBundle.useDayHandlersBundle({
            React,
            HEYS: window.HEYS,
            setDay,
            expandOnlyMeal,
            date,
            products,
            day,
            prof,
            pIndex,
            getProductFromItem,
            isMobile,
            openTimePickerForNewMeal,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            updateMealTimeRef,
            showConfetti,
            setShowConfetti,
            waterGoal,
            setEditGramsTarget,
            setEditGramsValue,
            TR,
            zoneMinutesValues,
            visibleTrainings,
            setVisibleTrainings,
            lsGet,
            haptic,
            getSmartPopupPosition,
            setZonePickerTarget,
            zonePickerTarget,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            setShowZonePicker,
            setZoneFormulaPopup,
            setHouseholdFormulaPopup,
            setShowTrainingPicker,
            setTrainingPickerStep,
            setEditingTrainingIndex,
            setPendingTrainingTime,
            setPendingTrainingType,
            setPendingTrainingZones,
            setPendingTrainingQuality,
            setPendingTrainingFeelAfter,
            setPendingTrainingComment,
            trainingPickerStep,
            pendingTrainingTime,
            pendingTrainingZones,
            pendingTrainingType,
            pendingTrainingQuality,
            pendingTrainingFeelAfter,
            pendingTrainingComment,
            editingTrainingIndex
        }) || {};

        const {
            waterPresets,
            waterAddedAnim,
            showWaterDrop,
            setWaterAddedAnim,
            setShowWaterDrop,
            mealHandlers,
            dayHandlers,
            trainingHandlers
        } = handlersBundle;

        const {
            addMeal,
            updateMealTime,
            removeMeal,
            addProductToMeal,
            setGrams,
            removeItem,
            updateMealField,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            changeMealType,
            isNewItem
        } = mealHandlers || {};

        const {
            openWeightPicker,
            openStepsGoalPicker,
            openDeficitPicker,
            addWater,
            removeWater,
            openHouseholdPicker,
            openEditGramsModal,
            confirmEditGramsModal,
            cancelEditGramsModal,
            updateTraining
        } = dayHandlers || {};

        const {
            openZonePicker,
            confirmZonePicker,
            cancelZonePicker,
            showZoneFormula,
            closeZoneFormula,
            showHouseholdFormula,
            closeHouseholdFormula,
            openTrainingPicker,
            confirmTrainingPicker,
            cancelTrainingPicker,
            zoneNames
        } = trainingHandlers || {};

        const executeInsightsDataAction = React.useCallback((actionId) => {
            switch (actionId) {
                case 'open_training':
                    if (typeof openTrainingPicker === 'function') {
                        openTrainingPicker('add');
                        return true;
                    }
                    return false;
                case 'open_household':
                    if (typeof openHouseholdPicker === 'function') {
                        openHouseholdPicker('add');
                        return true;
                    }
                    return false;
                case 'open_sleep_quality':
                    if (typeof openSleepQualityPicker === 'function') {
                        openSleepQualityPicker();
                        return true;
                    }
                    return false;
                case 'open_measurements':
                    if (typeof openMeasurementsEditor === 'function') {
                        openMeasurementsEditor();
                        return true;
                    }
                    return false;
                case 'open_steps':
                    if (typeof openStepsGoalPicker === 'function') {
                        openStepsGoalPicker();
                        return true;
                    }
                    return false;
                case 'open_weight':
                    if (typeof openWeightPicker === 'function') {
                        openWeightPicker();
                        return true;
                    }
                    return false;
                default:
                    return false;
            }
        }, [
            openTrainingPicker,
            openHouseholdPicker,
            openSleepQualityPicker,
            openMeasurementsEditor,
            openStepsGoalPicker,
            openWeightPicker
        ]);

        // Экспорт обработчика для quick-actions из Insights
        useEffect(() => {
            HEYS.ui = HEYS.ui || {};
            HEYS.ui.openDataEntryFromInsights = executeInsightsDataAction;

            return () => {
                if (HEYS.ui?.openDataEntryFromInsights === executeInsightsDataAction) {
                    delete HEYS.ui.openDataEntryFromInsights;
                }
            };
        }, [executeInsightsDataAction]);

        // Авто-выполнение pending action после перехода из Insights
        useEffect(() => {
            const pendingAction = HEYS.ui?.pendingDataEntryAction;
            if (!pendingAction) return;

            const timer = setTimeout(() => {
                const opened = executeInsightsDataAction(pendingAction);
                if (opened && HEYS.ui) {
                    delete HEYS.ui.pendingDataEntryAction;
                }
            }, 80);

            return () => clearTimeout(timer);
        }, [executeInsightsDataAction]);

        const sleepH = sleepHours(day.sleepStart, day.sleepEnd);

        // Автоматически обновляем sleepHours в объекте дня при изменении времени сна
        daySleepEffects.useSleepHoursEffect({ React, day, setDay, sleepHours });

        // === Calendar metrics (extracted) ===
        if (!HEYS.dayCalendarMetrics?.computeActiveDays || !HEYS.dayCalendarMetrics?.computeCurrentStreak) {
            throw new Error('[heys_day_v12] HEYS.dayCalendarMetrics not loaded before heys_day_v12.js');
        }
        // Вычисляем данные о днях для текущего месяца (с цветовой индикацией близости к цели)
        const activeDays = useMemo(() => {
            return HEYS.dayCalendarMetrics.computeActiveDays({ date, prof, products });
        }, [date, prof.weight, prof.height, prof.age, prof.sex, prof.deficitPctTarget, products]);

        // Вычисляем текущий streak (дней подряд в норме 75-115%)
        const currentStreak = React.useMemo(() => {
            return HEYS.dayCalendarMetrics.computeCurrentStreak({ optimum, pIndex, fmtDate, lsGet });
        }, [optimum, pIndex, fmtDate, lsGet]);

        // Public exports (streak/addMeal/addWater/addProduct/getMealType) — вынесено в effects
        if (!HEYS.dayEffects?.useDayExportsEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEffects.useDayExportsEffects({
            currentStreak,
            addMeal,
            addWater,
            addProductToMeal,
            day,
            pIndex,
            getMealType,
            getMealQualityScore,
            safeMeals
        });

        // --- blocks
        // Получаем Calendar динамически, чтобы HMR работал
        const CalendarComponent = (HEYS.dayPickers && HEYS.dayPickers.Calendar) || HEYS.Calendar;
        if (!HEYS.dayCalendarBlock?.renderCalendarBlock) {
            throw new Error('[heys_day_v12] HEYS.dayCalendarBlock not loaded before heys_day_v12.js');
        }
        const calendarBlock = HEYS.dayCalendarBlock.renderCalendarBlock({
            React,
            CalendarComponent,
            date,
            activeDays,
            products,
            flush,
            setDate,
            lsGet,
            lsSet,
            getProfile,
            normalizeTrainings,
            cleanEmptyTrainings,
            loadMealsForDate,
            ensureDay,
            setDay
        });



        const mainBlock = HEYS.dayMainBlock?.renderMainBlock?.({
            React,
            day,
            tdee,
            ndteData,
            ndteBoostKcal,
            ndteExpanded,
            setNdteExpanded,
            bmr,
            stepsK,
            train1k,
            train2k,
            householdK,
            actTotal,
            tefKcal,
            setTefInfoPopup,
            optimum,
            dayTargetDef,
            factDefPct,
            eatenKcal,
            getProfile,
            setDay,
            r0,
            cycleKcalMultiplier
        }) || null;

        // Компактные тренировки в SaaS стиле (вынесено в модуль)
        const trainingsBlock = HEYS.dayTrainings?.renderTrainingsBlock?.({
            haptic,
            setDay,
            setVisibleTrainings,
            visibleTrainings,
            householdActivities,
            openTrainingPicker,
            showZoneFormula,
            openHouseholdPicker,
            showHouseholdFormula,
            trainingTypes,
            TR,
            kcalMin,
            kcalPerMin,
            weight,
            r0
        }) || null;

        // Компактный блок сна и оценки дня в SaaS стиле (две плашки в розовом контейнере)
        const sideBlock = HEYS.daySideBlock?.renderSideBlock?.({
            React,
            day,
            date,
            sleepH,
            getYesterdayData,
            getCompareArrow,
            getScoreEmoji,
            getScoreGradient,
            getScoreTextColor,
            dayScoreValues,
            setPendingDayScore,
            setShowDayScorePicker,
            setDay,
            calculateDayAverages,
            openSleepQualityPicker,
            measurementsNeedUpdate,
            openMeasurementsEditor,
            measurementsByField,
            measurementsHistory,
            measurementsMonthlyProgress,
            measurementsLastDateFormatted,
            renderMeasurementSpark
        }) || null;

        // === Cycle state (extracted) ===
        if (!HEYS.dayCycleState?.useCycleState) {
            throw new Error('[heys_day_v12] HEYS.dayCycleState not loaded before heys_day_v12.js');
        }
        const cycleState = HEYS.dayCycleState.useCycleState({ React, day, date, setDay, lsGet, lsSet, prof }) || {};
        const {
            showCycleCard,
            cyclePhase,
            cycleEditMode,
            setCycleEditMode,
            cycleDayInput,
            setCycleDayInput,
            saveCycleDay,
            clearCycleDay
        } = cycleState;

        const cycleCard = HEYS.dayCycleCard?.renderCycleCard?.({
            React,
            showCycleCard,
            cyclePhase,
            cycleEditMode,
            setCycleEditMode,
            day,
            saveCycleDay,
            clearCycleDay
        }) || null;

        // compareBlock удалён по требованию

        // === INSULIN WAVE INDICATOR DATA (через модуль HEYS.InsulinWave) ===
        const insulinWaveData = HEYS.dayInsulinWaveData?.computeInsulinWaveData?.({
            React,
            day,
            pIndex,
            getProductFromItem,
            getProfile,
            lsGet,
            currentMinute,
            HEYS: window.HEYS
        }) || null;

        // Meals display (sorted + UI) — extracted
        if (!HEYS.dayMealsDisplay?.useMealsDisplay) {
            throw new Error('[heys_day_v12] HEYS.dayMealsDisplay not loaded before heys_day_v12.js');
        }
        const mealsDisplay = HEYS.dayMealsDisplay.useMealsDisplay({
            React,
            day,
            safeMeals,
            U,
            products,
            pIndex,
            date,
            setDay,
            isMobile,
            isMealExpanded,
            isMealStale,
            toggleMealExpand,
            changeMealType,
            updateMealTime,
            changeMealMood,
            changeMealWellbeing,
            changeMealStress,
            removeMeal,
            openEditGramsModal,
            openTimeEditor,
            openMoodEditor,
            setGrams,
            removeItem,
            isNewItem,
            optimum,
            setMealQualityPopup,
            addProductToMeal,
            prof,
            insulinWaveData
        }) || {};
        const { sortedMealsForDisplay, mealsUI } = mealsDisplay;

        // === Nutrition state (totals + norms + daily table) — extracted ===
        if (!HEYS.dayNutritionState?.buildNutritionState) {
            throw new Error('[heys_day_v12] HEYS.dayNutritionState not loaded before heys_day_v12.js');
        }
        const nutritionState = HEYS.dayNutritionState.buildNutritionState({
            React,
            day,
            pIndex,
            optimum,
            getDailyNutrientColor,
            getDailyNutrientTooltip,
            HEYS: window.HEYS
        }) || {};
        const {
            dayTot = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            normPerc = {},
            normAbs = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            dailyTableState: extractedDailyTableState = {}
        } = nutritionState;

        // === Advice Module Integration (extracted) ===
        if (!HEYS.dayAdviceIntegration?.useAdviceIntegration) {
            throw new Error('[heys_day_v12] HEYS.dayAdviceIntegration not loaded before heys_day_v12.js');
        }
        const adviceIntegration = HEYS.dayAdviceIntegration.useAdviceIntegration({
            React,
            day,
            date,
            prof,
            pIndex,
            dayTot,
            normAbs,
            optimum,
            waterGoal,
            haptic,
            U,
            lsGet,
            currentStreak,
            setShowConfetti,
            HEYS: window.HEYS,
            showTimePicker,
            showWeightPicker,
            showDeficitPicker,
            showZonePicker,
            showSleepQualityPicker,
            showDayScorePicker
        }) || {};
        const { adviceState = {} } = adviceIntegration;
        const { setToastVisible, setAdviceTrigger } = adviceState;

        // adviceState is provided by dayAdviceIntegration

        // === Export HEYS.Day mission helper methods ===
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.getMealsCount = () => (day.meals || []).length;
            HEYS.Day.getMeals = () => day.meals || [];
            HEYS.Day.getSteps = () => day.steps || 0;
            HEYS.Day.getTrainingsCount = () => (day.trainings || []).length;
            HEYS.Day.getWaterPercent = () => {
                const w = day.water || 0;
                const goal = waterGoal || 2000;
                return goal > 0 ? Math.round((w / goal) * 100) : 0;
            };
            HEYS.Day.getKcalPercent = () => {
                const norm = normAbs.kcal || 2000;
                return norm > 0 ? Math.round(((dayTot.kcal || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getFiberPercent = () => {
                const norm = normAbs.fiber || 25;
                return norm > 0 ? Math.round(((dayTot.fiber || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getProteinPercent = () => {
                const norm = normAbs.prot || 100;
                return norm > 0 ? Math.round(((dayTot.prot || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getComplexCarbsPercent = () => {
                const totalCarbs = dayTot.carbs || 0;
                const complexCarbs = dayTot.complex || 0;
                return totalCarbs > 0 ? Math.round((complexCarbs / totalCarbs) * 100) : 0;
            };
            HEYS.Day.getHarmPercent = () => {
                const norm = normAbs.harm || 10;
                return norm > 0 ? Math.round(((dayTot.harm || 0) / norm) * 100) : 0;
            };
            HEYS.Day.getMacroBalance = () => {
                const np = normAbs.prot || 1;
                const nc = normAbs.carbs || 1;
                const nf = normAbs.fat || 1;
                return {
                    protein: np > 0 ? (dayTot.prot || 0) / np : 0,
                    carbs: nc > 0 ? (dayTot.carbs || 0) / nc : 0,
                    fat: nf > 0 ? (dayTot.fat || 0) / nf : 0
                };
            };
            HEYS.Day.getLastMealGI = () => {
                const meals = day.meals || [];
                if (meals.length === 0) return 100;
                const lastMeal = meals[meals.length - 1];
                if (!lastMeal || !lastMeal.items || lastMeal.items.length === 0) return 100;
                let totalGI = 0, count = 0;
                for (const item of lastMeal.items) {
                    const p = pIndex ? pIndex[item.productId || item.id] : null;
                    if (p && typeof p.gi === 'number' && p.gi > 0) {
                        totalGI += p.gi;
                        count++;
                    }
                }
                return count > 0 ? Math.round(totalGI / count) : 100;
            };
            HEYS.Day.getUniqueProductsCount = () => {
                const meals = day?.meals || [];
                const productIds = new Set();
                meals.forEach(meal => {
                    (meal.items || []).forEach(item => {
                        const pid = item.product_id ?? item.productId ?? item.id;
                        if (pid != null) productIds.add(String(pid));
                    });
                });
                return productIds.size;
            };
            return () => {
                if (HEYS.Day) {
                    delete HEYS.Day.getMealsCount;
                    delete HEYS.Day.getMeals;
                    delete HEYS.Day.getSteps;
                    delete HEYS.Day.getTrainingsCount;
                    delete HEYS.Day.getWaterPercent;
                    delete HEYS.Day.getKcalPercent;
                    delete HEYS.Day.getFiberPercent;
                    delete HEYS.Day.getProteinPercent;
                    delete HEYS.Day.getComplexCarbsPercent;
                    delete HEYS.Day.getHarmPercent;
                    delete HEYS.Day.getMacroBalance;
                    delete HEYS.Day.getLastMealGI;
                    delete HEYS.Day.getUniqueProductsCount;
                }
            };
        }, [day, dayTot, normAbs, waterGoal, pIndex]);

        // 🔄 Orphan products state (extracted)
        if (!HEYS.dayOrphanState?.useOrphanState) {
            throw new Error('[heys_day_v12] HEYS.dayOrphanState not loaded before heys_day_v12.js');
        }
        const orphanState = HEYS.dayOrphanState.useOrphanState({ React, day, HEYS: window.HEYS }) || {};

        const dailyTableState = extractedDailyTableState;
        const {
            factKeys,
            fmtVal,
            devVal,
            devCell,
            factCell,
            normVal,
            per100Head,
            factHead,
            pct,
            daySummary
        } = dailyTableState;

        // Выравнивание высоты фиолетового блока с блоком тренировок справа
        // (авто-высота убрана; таблица сама уменьшена по строкам / высоте инпутов)

        // DatePicker теперь в шапке App (heys_app_v12.js)
        // Тренировки выводятся в sideBlock (side-compare)

        // === HERO METRICS CARDS (extracted) ===
        if (!HEYS.dayHeroMetrics?.computeHeroMetrics) {
            throw new Error('[heys_day_v12] HEYS.dayHeroMetrics not loaded before heys_day_v12.js');
        }
        const heroMetrics = HEYS.dayHeroMetrics.computeHeroMetrics({
            day,
            eatenKcal,
            optimum,
            factDefPct,
            dayTargetDef,
            r0,
            ratioZones: HEYS.ratioZones
        }) || {};
        const {
            effectiveOptimumForCards,
            remainingKcal,
            currentRatio,
            eatenCol,
            remainCol,
            defCol,
            ratioStatus,
            deficitProgress
        } = heroMetrics;

        const { weightTrend, monthForecast, weightSparklineData, cycleHistoryAnalysis } =
            HEYS.dayWeightTrends?.computeWeightTrends?.({
                React,
                date,
                day,
                chartPeriod,
                prof,
                fmtDate,
                r1,
                HEYS: window.HEYS
            }) || {};

        if (!HEYS.daySparklineState?.computeSparklineRenderData) {
            throw new Error('[heys_day_v12] HEYS.daySparklineState not loaded before heys_day_v12.js');
        }
        const sparklineDataState = HEYS.daySparklineState.computeSparklineRenderData({
            React,
            date,
            day,
            eatenKcal,
            chartPeriod,
            optimum,
            prof,
            products,
            dayTot,
            sparklineRefreshKey,
            fmtDate,
            HEYS: window.HEYS
        }) || {};
        const { sparklineData = [], sparklineRenderData = [] } = sparklineDataState;

        // === CALORIC DEBT RECOVERY — расчёт калорийного долга за последние 3 дня ===
        // === CALORIC BALANCE MODULE v3.0 ===
        // Анализ баланса калорий за текущую неделю (с понедельника)
        // Включает: долг, перебор, тренд, рекомендации кардио, учёт шагов и тренировок
        const caloricDebt = HEYS.dayCaloricBalance?.computeCaloricBalance?.({
            React,
            date,
            day,
            prof,
            optimum,
            eatenKcal,
            sparklineData,
            pIndex,
            fmtDate,
            lsGet,
            HEYS: window.HEYS
        }) || null;

        const {
            kcalTrend,
            balanceViz,
            weekHeatmapData,
            mealsChartData
        } = HEYS.dayInsightsData?.computeDayInsightsData?.({
            React,
            date,
            day,
            eatenKcal,
            optimum,
            caloricDebt,
            prof,
            pIndex,
            U,
            products,
            sparklineData,
            fmtDate,
            M,
            getMealType,
            getMealQualityScore,
            HEYS: window.HEYS
        }) || {};
        // === Caloric display state (extracted) ===
        if (!HEYS.dayCaloricDisplayState?.useCaloricDisplayState) {
            throw new Error('[heys_day_v12] HEYS.dayCaloricDisplayState not loaded before heys_day_v12.js');
        }
        const caloricDisplayState = HEYS.dayCaloricDisplayState.useCaloricDisplayState({
            React,
            day,
            setDay,
            optimum,
            eatenKcal,
            caloricDebt,
            r0
        }) || {};
        const {
            displayOptimum,
            displayRemainingKcal,
            displayCurrentRatio,
            displayRatioStatus
        } = caloricDisplayState;

        // === Engagement effects (extracted) ===
        if (!HEYS.dayEngagementEffects?.useEngagementEffects) {
            throw new Error('[heys_day_v12] HEYS.dayEngagementEffects not loaded before heys_day_v12.js');
        }
        HEYS.dayEngagementEffects.useEngagementEffects({
            React,
            day,
            weekHeatmapData,
            showConfetti,
            setShowConfetti,
            haptic,
            insulinWaveData,
            mealsChartData,
            setShowFirstPerfectAchievement,
            setNewMealAnimatingIndex
        });

        // === Weekly Wrap Popup (Monday 09:00 локально) ===
        useEffect(() => {
            if (!isHydrated) return;
            if (HEYS.weeklyReports?.maybeShowWeeklyWrap) {
                HEYS.weeklyReports.maybeShowWeeklyWrap({
                    lsGet,
                    profile: prof,
                    pIndex,
                    date
                });
            }
        }, [isHydrated, date]);

        // === Pull-to-refresh логика вынесена в HEYS.dayPullRefresh ===

        // Progress/shake/confetti effects moved to HEYS.dayAnimations

        if (!HEYS.daySparklineState?.buildSparklineRenderers) {
            throw new Error('[heys_day_v12] HEYS.daySparklineState not loaded before heys_day_v12.js');
        }
        const sparklineRenderers = HEYS.daySparklineState.buildSparklineRenderers({
            React,
            haptic,
            openExclusivePopup,
            sparklineState,
            prof
        }) || {};
        const {
            renderSparkline,
            renderWeightSparkline
        } = sparklineRenderers;

        // === ПРОГРЕСС-БАР К ЦЕЛИ (отдельный компонент для diary) ===
        const goalProgressBar = HEYS.dayGoalProgress?.renderGoalProgressBar?.({
            React,
            day,
            displayOptimum,
            optimum,
            eatenKcal,
            animatedKcal,
            animatedProgress,
            animatedRatioPct,
            animatedMarkerPos,
            isAnimating,
            caloricDebt,
            setDay,
            r0,
            HEYS: window.HEYS
        }) || null;

        // === ALERT: Orphan-продукты (данные из штампа вместо базы) ===
        // orphanVersion используется для триггера ререндера при изменении orphan
        const { orphanCount = 0 } = orphanState;

        // === Phase 13A Integration: Use extracted orphan alert renderer ===
        const orphanAlert = HEYS.dayOrphanAlert?.renderOrphanAlert?.({ orphanCount }) || false;

        // === Hero display (tour override + colors + deficit) — extracted ===
        if (!HEYS.dayHeroDisplay?.buildHeroDisplay) {
            throw new Error('[heys_day_v12] HEYS.dayHeroDisplay not loaded before heys_day_v12.js');
        }
        const heroDisplay = HEYS.dayHeroDisplay.buildHeroDisplay({
            day,
            prof,
            tdee,
            displayOptimum,
            displayRemainingKcal,
            eatenKcal,
            HEYS: window.HEYS
        }) || {};
        const {
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRemainCol,
            profileDeficit,
            currentDeficit
        } = heroDisplay;

        // === БЛОК СТАТИСТИКА (extracted) ===
        if (!HEYS.dayStatsBlock?.buildStatsBlock) {
            throw new Error('[heys_day_v12] HEYS.dayStatsBlock not loaded before heys_day_v12.js');
        }
        const statsBlockResult = HEYS.dayStatsBlock.buildStatsBlock({
            React,
            HEYSRef: window.HEYS,
            openExclusivePopup,
            haptic,
            setDay,
            handlePeriodChange,
            setChartPeriod,
            setBalanceCardExpanded,
            setSparklinePopup,
            setWeekNormPopup,
            setWeekDeficitPopup,
            setBalanceDayPopup,
            setTdeePopup,
            setTefInfoPopup,
            setGoalPopup,
            setDebtSciencePopup,
            setMetricPopup,
            setMacroBadgePopup,
            setDate,
            setToastVisible,
            setAdviceTrigger,
            setMealChartHintShown,
            setShowConfetti,
            setInsulinExpanded,
            openWeightPicker,
            openDeficitPicker,
            setMealQualityPopup,
            r0,
            r1,
            prof,
            day,
            dayTot,
            optimum,
            normAbs,
            weight,
            ndteData,
            tefData,
            chartPeriod,
            tdee,
            bmr,
            eatenKcal,
            stepsK,
            householdK,
            train1k,
            train2k,
            train3k,
            tefKcal,
            dayTargetDef,
            baseExpenditure,
            caloricDebt,
            sparklineData,
            sparklineRenderData,
            currentRatio,
            displayOptimum,
            displayRemainingKcal,
            balanceCardExpanded,
            showConfetti,
            shakeEaten,
            shakeOver,
            displayTdee,
            displayHeroOptimum,
            displayHeroEaten,
            displayHeroRemaining,
            displayRatioStatus,
            weightSparklineData,
            weightTrend,
            kcalTrend,
            monthForecast,
            cycleHistoryAnalysis,
            weekHeatmapData,
            mealsChartData,
            currentDeficit,
            profileDeficit,
            date,
            isMobile,
            mobileSubTab,
            insulinWaveData,
            balanceViz,
            mealChartHintShown,
            newMealAnimatingIndex,
            showFirstPerfectAchievement,
            sparklinePopup,
            weekNormPopup,
            weekDeficitPopup,
            balanceDayPopup,
            tdeePopup,
            tefInfoPopup,
            goalPopup,
            debtSciencePopup,
            metricPopup,
            macroBadgePopup,
            chartTransitioning,
            insulinExpanded,
            renderSparkline,
            renderWeightSparkline,
            U,
            M,
            pIndex,
            lsGet,
            PopupWithBackdrop,
            createSwipeHandlers,
            getSmartPopupPosition,
            ReactDOM
        }) || {};

        const { statsBlock, mealsChart, statsVm } = statsBlockResult;

        // === Water Card (extracted wrapper) ===
        if (!HEYS.dayWaterCard?.buildWaterCard) {
            throw new Error('[heys_day_v12] HEYS.dayWaterCard not loaded before heys_day_v12.js');
        }
        const waterCard = HEYS.dayWaterCard.buildWaterCard({
            React,
            day,
            prof,
            waterGoal,
            waterGoalBreakdown,
            waterPresets,
            waterMotivation,
            waterLastDrink,
            waterAddedAnim,
            showWaterDrop,
            showWaterTooltip,
            setDay,
            haptic,
            setWaterAddedAnim,
            setShowWaterDrop,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave,
            openExclusivePopup,
            addWater,
            removeWater
        });

        // === COMPACT ACTIVITY INPUT ===
        if (!HEYS.dayStepsUI?.useStepsState) {
            throw new Error('[heys_day_v12] HEYS.dayStepsUI not loaded before heys_day_v12.js');
        }
        const stepsState = HEYS.dayStepsUI.useStepsState({
            React,
            day,
            prof,
            getProfile,
            setDay
        }) || {};
        const {
            stepsGoal,
            stepsMax,
            stepsValue,
            stepsPercent,
            stepsColor,
            handleStepsDrag
        } = stepsState;

        // === Activity Card (extracted wrapper) ===
        if (!HEYS.dayActivityCard?.buildActivityCard) {
            throw new Error('[heys_day_v12] HEYS.dayActivityCard not loaded before heys_day_v12.js');
        }
        const compactActivity = HEYS.dayActivityCard.buildActivityCard({
            React,
            day,
            prof,
            stepsValue,
            stepsGoal,
            stepsPercent,
            stepsColor,
            stepsK,
            bmr,
            householdK,
            totalHouseholdMin,
            householdActivities,
            train1k,
            train2k,
            visibleTrainings,
            trainingsBlock,
            ndteData,
            ndteBoostKcal,
            tefData,
            tefKcal,
            dayTargetDef,
            displayOptimum,
            tdee,
            caloricDebt,
            r0,
            setDay,
            haptic,
            setMetricPopup,
            setTefInfoPopup,
            openStepsGoalPicker,
            handleStepsDrag,
            openHouseholdPicker,
            openTrainingPicker
        });

        if (!HEYS.dayTabRender?.renderDayTabLayout) {
            throw new Error('[heys_day_v12] HEYS.dayTabRender not loaded before heys_day_v12.js');
        }

        return HEYS.dayTabRender.renderDayTabLayout({
            React,
            HEYS: window.HEYS,
            pullProgress,
            isRefreshing,
            refreshStatus,
            pullThreshold,
            isMobile,
            mobileSubTab,
            orphanAlert,
            statsBlock,
            waterCard,
            compactActivity,
            sideBlock,
            cycleCard,
            date,
            day,
            caloricDebt,
            eatenKcal,
            optimum,
            displayOptimum,
            addMeal,
            addWater,
            adviceState,
            AdviceCard,
            haptic,
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
            getProductFromItem,
            getMealType,
            getMealQualityScore,
            editGramsTarget,
            editGramsValue,
            editPortions,
            editLastPortionGrams,
            editGramsInputRef,
            setEditGramsValue,
            confirmEditGramsModal,
            cancelEditGramsModal,
            handleEditGramsDrag,
            zoneFormulaPopup,
            closeZoneFormula,
            householdFormulaPopup,
            closeHouseholdFormula,
            showZonePicker,
            cancelZonePicker,
            confirmZonePicker,
            zonePickerTarget,
            zoneMinutesValues,
            pendingZoneMinutes,
            setPendingZoneMinutes,
            showTrainingPicker,
            cancelTrainingPicker,
            confirmTrainingPicker,
            trainingPickerStep,
            pendingTrainingZones,
            setPendingTrainingZones,
            pendingTrainingTime,
            setPendingTrainingTime,
            pendingTrainingType,
            setPendingTrainingType,
            trainingTypes,
            kcalMin,
            TR,
            mets,
            zoneNames,
            weight,
            kcalPerMin,
            r0,
            householdActivities,
            openTrainingPicker,
            openHouseholdPicker,
            pendingTrainingQuality,
            setPendingTrainingQuality,
            pendingTrainingFeelAfter,
            setPendingTrainingFeelAfter,
            pendingTrainingComment,
            setPendingTrainingComment,
            showSleepQualityPicker,
            cancelSleepQualityPicker,
            confirmSleepQualityPicker,
            pendingSleepQuality,
            setPendingSleepQuality,
            pendingSleepNote,
            setPendingSleepNote,
            sleepQualityValues,
            showDayScorePicker,
            cancelDayScorePicker,
            confirmDayScorePicker,
            pendingDayScore,
            setPendingDayScore,
            pendingDayComment,
            setPendingDayComment,
            calculateDayAverages,
            mealQualityPopup,
            setMealQualityPopup,
            getSmartPopupPosition,
            createSwipeHandlers,
            M,
            goalProgressBar,
            mealsChart,
            insulinWaveData,
            insulinExpanded,
            setInsulinExpanded,
            openExclusivePopup,
            mealsUI,
            daySummary,
            dayTot,
            normAbs
        });
    };

    HEYS.DayTabImpl = HEYS.DayTabImpl || {};
    HEYS.DayTabImpl.createDayTab = function createDayTab() {
        // Wrap in React.memo to skip re-renders when props haven't changed
        if (!HEYS.DayTab._memoized && window.React?.memo) {
            const MemoTab = React.memo(HEYS.DayTab);
            MemoTab.displayName = 'DayTab';
            HEYS.DayTab._memoized = MemoTab;
        }
        return HEYS.DayTab._memoized || HEYS.DayTab;
    };

})(window);


/* ===== heys_day_v12.js ===== */
// heys_day_v12.js — DayTab component proxy

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.DayTab) return;
  const DayTabImpl = HEYS.DayTabImpl;
  if (DayTabImpl && typeof DayTabImpl.createDayTab === 'function') {
    HEYS.DayTab = DayTabImpl.createDayTab({ React: global.React, HEYS });
    return;
  }
  window.__heysLog && window.__heysLog('[DAY] DayTabImpl missing, DayTab not registered');
})(window);
