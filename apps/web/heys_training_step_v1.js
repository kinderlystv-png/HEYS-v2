// heys_training_step_v1.js — Модалка добавления/редактирования тренировки (2 шага)
// Шаг 1: Тип, время, оценки, заметка | Шаг 2: Зоны пульса
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.error('[TrainingStep] HEYS.StepModal not found. Load heys_step_modal_v1.js first.');
    return;
  }

  const { registerStep } = HEYS.StepModal;

  // === Утилиты ===
  const lsGet = (key, def) => {
    try {
      const utils = HEYS.utils;
      if (utils?.lsGet) return utils.lsGet(key, def);
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  };

  const lsSet = (key, val) => {
    try {
      const utils = HEYS.utils;
      if (utils?.lsSet) return utils.lsSet(key, val);
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  };

  const haptic = (style = 'light') => {
    try { navigator.vibrate?.(style === 'error' ? [50, 30, 50] : style === 'success' ? 20 : 10); } catch {}
  };

  const pad2 = n => String(n).padStart(2, '0');

  // === Константы ===
  const TRAINING_TYPES = [
    { id: 'cardio', icon: '🏃', label: 'Кардио' },
    { id: 'strength', icon: '🏋️', label: 'Силовая' },
    { id: 'hobby', icon: '⚽', label: 'Хобби' }
  ];

  const HR_ZONES = [
    { id: 0, name: 'Разминка', color: '#3b82f6', range: '50-60%' },
    { id: 1, name: 'Жиросжигание', color: '#22c55e', range: '60-70%' },
    { id: 2, name: 'Аэробная', color: '#eab308', range: '70-80%' },
    { id: 3, name: 'Анаэробная', color: '#ef4444', range: '80-90%' }
  ];

  // === Хелперы для оценок ===
  function getMoodEmoji(v) {
    if (v <= 2) return '😫';
    if (v <= 4) return '😕';
    if (v <= 6) return '😐';
    if (v <= 8) return '😊';
    return '🤩';
  }

  function getStressEmoji(v) {
    if (v <= 2) return '😌';
    if (v <= 4) return '🙂';
    if (v <= 6) return '😐';
    if (v <= 8) return '😟';
    return '😰';
  }

  function getWellbeingEmoji(v) {
    if (v <= 2) return '🤒';
    if (v <= 4) return '😓';
    if (v <= 6) return '😐';
    if (v <= 8) return '💪';
    return '🏆';
  }

  function getMoodColor(v) {
    if (v <= 2) return '#ef4444';
    if (v <= 4) return '#f97316';
    if (v <= 6) return '#eab308';
    if (v <= 8) return '#22c55e';
    return '#10b981';
  }

  function getStressColor(v) {
    if (v <= 2) return '#10b981';
    if (v <= 4) return '#22c55e';
    if (v <= 6) return '#eab308';
    if (v <= 8) return '#f97316';
    return '#ef4444';
  }

  // WheelPicker и TimePicker из StepModal
  const WheelPicker = HEYS.StepModal.WheelPicker;
  const TimePicker = HEYS.StepModal.TimePicker;

  // ========================================
  // ШАГ 1: Время начала, тип, оценки, заметка
  // ========================================
  function TrainingInfoStep({ data, onChange, context }) {
    const type = data.type || 'cardio';
    const time = data.time || '';
    const mood = data.mood || 5;
    const wellbeing = data.wellbeing || 5;
    const stress = data.stress || 5;
    const comment = data.comment || '';

    // Парсим время или берём текущее
    const [hours, minutes] = useMemo(() => {
      if (time) {
        const [h, m] = time.split(':').map(Number);
        return [h || 10, m || 0];
      }
      const now = new Date();
      return [now.getHours(), Math.floor(now.getMinutes() / 5) * 5];
    }, [time]);

    // Обработчики времени (haptic уже в TimePicker)
    const setHours = (h) => {
      onChange({ ...data, time: pad2(h) + ':' + pad2(minutes) });
    };

    const setMinutes = (m) => {
      onChange({ ...data, time: pad2(hours) + ':' + pad2(m) });
    };

    // Единый callback для linkedScroll (решает проблему React batching)
    const setTime = (h, m) => {
      onChange({ ...data, time: pad2(h) + ':' + pad2(m) });
    };

    const updateField = (field, value) => {
      haptic('light');
      onChange({ ...data, [field]: value });
    };

    return React.createElement('div', { className: 'training-step' },
      
      // === Тип тренировки ===
      React.createElement('div', { className: 'ts-section ts-type-section' },
        React.createElement('div', { className: 'ts-type-grid' },
          TRAINING_TYPES.map(t =>
            React.createElement('button', {
              key: t.id,
              className: 'ts-type-btn' + (type === t.id ? ' active' : ''),
              onClick: () => updateField('type', t.id)
            },
              React.createElement('span', { className: 'ts-type-icon' }, t.icon),
              React.createElement('span', { className: 'ts-type-label' }, t.label)
            )
          )
        )
      ),

      // === Время начала (переиспользуемый TimePicker с linkedScroll) ===
      React.createElement('div', { className: 'ts-section ts-time-wheel-section' },
        React.createElement('div', { className: 'ts-time-wheel-label' }, '⏰ Время начала'),
        React.createElement(TimePicker, {
          hours,
          minutes,
          onHoursChange: setHours,
          onMinutesChange: setMinutes,
          onTimeChange: setTime, // Единый callback для linkedScroll
          hoursLabel: '',
          minutesLabel: '',
          display: null, // Не показываем дублирующий дисплей
          linkedScroll: true,
          className: 'ts-time-wheels'
        })
      ),

      // === Оценки после тренировки ===
      React.createElement('div', { className: 'ts-section ts-ratings-section' },
        React.createElement('div', { className: 'ts-ratings-title' }, '📊 Какие ощущения после тренировки?'),
        
        // Настроение
        React.createElement('div', { className: 'ts-rating-row' },
          React.createElement('div', { className: 'ts-rating-header' },
            React.createElement('span', { className: 'ts-rating-emoji' }, getMoodEmoji(mood)),
            React.createElement('span', { className: 'ts-rating-label' }, 'Настроение'),
            React.createElement('span', { 
              className: 'ts-rating-value',
              style: { color: getMoodColor(mood) }
            }, mood + '/10')
          ),
          React.createElement('input', {
            type: 'range',
            className: 'ts-slider ts-slider-positive',
            min: 1,
            max: 10,
            value: mood,
            onChange: e => updateField('mood', Number(e.target.value)),
            onTouchStart: e => e.stopPropagation(),
            onTouchMove: e => e.stopPropagation(),
            onTouchEnd: e => e.stopPropagation()
          })
        ),

        // Самочувствие
        React.createElement('div', { className: 'ts-rating-row' },
          React.createElement('div', { className: 'ts-rating-header' },
            React.createElement('span', { className: 'ts-rating-emoji' }, getWellbeingEmoji(wellbeing)),
            React.createElement('span', { className: 'ts-rating-label' }, 'Самочувствие'),
            React.createElement('span', { 
              className: 'ts-rating-value',
              style: { color: getMoodColor(wellbeing) }
            }, wellbeing + '/10')
          ),
          React.createElement('input', {
            type: 'range',
            className: 'ts-slider ts-slider-positive',
            min: 1,
            max: 10,
            value: wellbeing,
            onChange: e => updateField('wellbeing', Number(e.target.value)),
            onTouchStart: e => e.stopPropagation(),
            onTouchMove: e => e.stopPropagation(),
            onTouchEnd: e => e.stopPropagation()
          })
        ),

        // Стресс
        React.createElement('div', { className: 'ts-rating-row' },
          React.createElement('div', { className: 'ts-rating-header' },
            React.createElement('span', { className: 'ts-rating-emoji' }, getStressEmoji(stress)),
            React.createElement('span', { className: 'ts-rating-label' }, 'Стресс'),
            React.createElement('span', { 
              className: 'ts-rating-value',
              style: { color: getStressColor(stress) }
            }, stress + '/10')
          ),
          React.createElement('input', {
            type: 'range',
            className: 'ts-slider ts-slider-negative',
            min: 1,
            max: 10,
            value: stress,
            onChange: e => updateField('stress', Number(e.target.value)),
            onTouchStart: e => e.stopPropagation(),
            onTouchMove: e => e.stopPropagation(),
            onTouchEnd: e => e.stopPropagation()
          })
        )
      ),

      // === Комментарий ===
      React.createElement('div', { className: 'ts-section ts-comment-section' },
        React.createElement('input', {
          type: 'text',
          className: 'ts-comment-input',
          placeholder: '💬 Заметка (опционально)',
          value: comment,
          onChange: e => updateField('comment', e.target.value),
          maxLength: 100
        })
      )
    );
  }

  // ========================================
  // ШАГ 2: Зоны пульса
  // ========================================
  function TrainingZonesStep({ data, onChange, context }) {
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = profile.weight || 70;
    
    const hrZones = useMemo(() => lsGet('heys_hr_zones', []), []);
    const mets = useMemo(() => {
      const defaults = [2.5, 6, 8, 10];
      return defaults.map((def, i) => hrZones[i]?.MET || def);
    }, [hrZones]);

    const zones = data.zones || [0, 0, 0, 0];

    // Значения для колеса минут: 0, 1, 2, ... 120
    const ZONE_MINUTES = useMemo(() => Array.from({ length: 121 }, (_, i) => i), []);

    const updateZone = (zoneIndex, value) => {
      const newZones = [...zones];
      newZones[zoneIndex] = Math.max(0, Math.min(120, value));
      haptic('light');
      onChange({ ...data, zones: newZones });
    };

    const totalMinutes = zones.reduce((s, z) => s + z, 0);
    const kcalBurned = useMemo(() => {
      return Math.round(zones.reduce((sum, min, i) => {
        return sum + min * mets[i] * weight / 60;
      }, 0));
    }, [zones, mets, weight]);

    return React.createElement('div', { className: 'training-step' },
      
      // === Зоны пульса ===
      React.createElement('div', { className: 'ts-section ts-zones-section' },
        React.createElement('div', { className: 'ts-zones-header' },
          React.createElement('span', null, '❤️ Зоны пульса'),
          React.createElement('span', { className: 'ts-zones-total' }, 
            totalMinutes + ' мин · ~' + kcalBurned + ' ккал'
          )
        ),
        React.createElement('div', { className: 'ts-zones-wheels-grid' },
          HR_ZONES.map((zone, i) =>
            React.createElement('div', { 
              key: zone.id, 
              className: 'ts-zone-wheel-item',
              style: { '--zone-color': zone.color }
            },
              React.createElement('div', { 
                className: 'ts-zone-wheel-header',
                style: { borderBottomColor: zone.color }
              },
                React.createElement('span', { className: 'ts-zone-wheel-name' }, zone.name),
                React.createElement('span', { className: 'ts-zone-wheel-range' }, zone.range)
              ),
              React.createElement('div', { className: 'ts-zone-wheel-picker' },
                React.createElement(WheelPicker, {
                  values: ZONE_MINUTES,
                  value: zones[i],
                  onChange: (v) => updateZone(i, v),
                  label: '',
                  suffix: '',
                  currentSuffix: 'мин'
                })
              )
            )
          )
        ),
        // Быстрые пресеты длительности
        React.createElement('div', { className: 'ts-quick-durations' },
          [15, 30, 45, 60].map(d =>
            React.createElement('button', {
              key: d,
              className: 'ts-quick-btn' + (totalMinutes === d ? ' active' : ''),
              onClick: () => {
                // Распределяем время по зонам 1-2 (жиросжигание, аэробная)
                const half = Math.floor(d / 2);
                onChange({ ...data, zones: [0, half, d - half, 0] });
              }
            }, d + ' мин')
          )
        )
      )
    );
  }

  // ========================================
  // Регистрация шагов
  // ========================================
  
  // Шаг 1: Инфо (тип, время, оценки, заметка)
  registerStep('training-info', {
    title: 'Тренировка',
    hint: 'Тип и ощущения',
    icon: '🏋️',
    component: TrainingInfoStep,
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const trainingIndex = ctx?.trainingIndex ?? 0;
      const day = lsGet(`heys_dayv2_${dateKey}`, {});
      const trainings = day.trainings || [];
      const T = trainings[trainingIndex] || {};
      
      return {
        type: T.type || 'cardio',
        time: T.time || '',
        zones: T.z || [0, 0, 0, 0],
        mood: T.mood || 5,
        wellbeing: T.wellbeing || 5,
        stress: T.stress || 5,
        comment: T.comment || ''
      };
    },
    validate: () => true // Шаг 1 всегда валиден
  });

  // Шаг 2: Зоны пульса
  registerStep('training-zones', {
    title: 'Зоны пульса',
    hint: 'Минуты в каждой зоне',
    icon: '❤️',
    component: TrainingZonesStep,
    getInitialData: (ctx, allData) => {
      // Берём данные из шага 1 или из storage
      if (allData?.['training-info']) {
        return allData['training-info'];
      }
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const trainingIndex = ctx?.trainingIndex ?? 0;
      const day = lsGet(`heys_dayv2_${dateKey}`, {});
      const trainings = day.trainings || [];
      const T = trainings[trainingIndex] || {};
      
      return {
        type: T.type || 'cardio',
        time: T.time || '',
        zones: T.z || [0, 0, 0, 0],
        mood: T.mood || 5,
        wellbeing: T.wellbeing || 5,
        stress: T.stress || 5,
        comment: T.comment || ''
      };
    },
    validate: (data) => {
      const total = (data.zones || []).reduce((s, z) => s + z, 0);
      return total > 0; // Хотя бы 1 минута
    },
    getValidationMessage: (data) => {
      const total = (data.zones || []).reduce((s, z) => s + z, 0);
      if (total === 0) return 'Укажите хотя бы 1 минуту в любой зоне';
      return null;
    },
    save: (data, ctx, allStepData) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const trainingIndex = ctx?.trainingIndex ?? 0;
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });
      
      const trainings = day.trainings || [];
      while (trainings.length <= trainingIndex) {
        trainings.push({ z: [0, 0, 0, 0] });
      }
      
      // Объединяем данные из шага 1 (info) и шага 2 (zones)
      const infoData = allStepData?.['training-info'] || {};
      const zonesData = data || {};
      
      const finalTraining = {
        z: zonesData.zones || [0, 0, 0, 0],
        time: infoData.time || zonesData.time || '',
        type: infoData.type || zonesData.type || 'cardio',
        mood: infoData.mood ?? zonesData.mood ?? 5,
        wellbeing: infoData.wellbeing ?? zonesData.wellbeing ?? 5,
        stress: infoData.stress ?? zonesData.stress ?? 5,
        comment: infoData.comment || zonesData.comment || ''
      };
      
      trainings[trainingIndex] = finalTraining;
      
      day.trainings = trainings;
      day.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, day);
      
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'trainings', source: 'training-step', forceReload: true }
      }));
    }
  });

  // === API: Показать модалку тренировки ===
  function showTrainingModal(options = {}) {
    const { dateKey, trainingIndex = 0, onComplete } = options;
    
    if (!HEYS.StepModal?.show) {
      console.error('[TrainingStep] StepModal not loaded');
      return;
    }

    HEYS.StepModal.show({
      steps: ['training-info', 'training-zones'],
      title: trainingIndex > 0 ? `Тренировка ${trainingIndex + 1}` : 'Тренировка',
      showProgress: true,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      allowSwipe: false,
      finishLabel: 'Добавить', // Кнопка на последнем шаге
      context: { dateKey, trainingIndex },
      onComplete: (stepData) => {
        const data = stepData['training-zones'] || stepData['training-info'] || {};
        onComplete?.(data);
      }
    });
  }

  // === Экспорт ===
  HEYS.TrainingStep = {
    show: showTrainingModal,
    InfoComponent: TrainingInfoStep,
    ZonesComponent: TrainingZonesStep,
    TRAINING_TYPES,
    HR_ZONES
  };

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
