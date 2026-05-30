// heys_training_step_v1.js — Модалка добавления/редактирования тренировки (3 шага)
// Шаг 1: Тип, активность и время | Шаг 2: Оценки и заметка | Шаг 3: Зоны пульса
(function (global) {
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
    } catch { }
  };

  const haptic = (style = 'light') => {
    try { navigator.vibrate?.(style === 'error' ? [50, 30, 50] : style === 'success' ? 20 : 10); } catch { }
  };

  const pad2 = n => String(n).padStart(2, '0');

  // === Константы ===
  const TRAINING_TYPES = [
    { id: 'cardio', icon: '🏃', label: 'Кардио' },
    { id: 'strength', icon: '🏋️', label: 'Силовая' },
    { id: 'hobby', icon: '⚽', label: 'Хобби' },
    { id: 'fingers', icon: '🤚', label: 'Пальцы' }
  ];

  const TRAINING_TYPE_META = {
    cardio: { icon: '🏃', label: 'Кардио' },
    strength: { icon: '🏋️', label: 'Силовая' },
    hobby: { icon: '⚽', label: 'Активное хобби' },
    fingers: { icon: '🤚', label: 'Пальцы (скалолазание)' }
  };

  const TRAINING_ACTIVITY_STORAGE_KEY = 'heys_training_activity_options_v1';

  const TRAINING_ACTIVITY_PRESETS = [
    { type: 'cardio', icon: '🏃', label: 'Бег' },
    { type: 'cardio', icon: '🚴', label: 'Велосипед' },
    { type: 'cardio', icon: '🏊', label: 'Плавание' },
    { type: 'cardio', icon: '🥊', label: 'Интервалы' },
    { type: 'strength', icon: '🏋️', label: 'Зал' },
    { type: 'strength', icon: '💪', label: 'Функциональная' },
    { type: 'strength', icon: '🤸', label: 'Калистеника' },
    { type: 'strength', icon: '🪢', label: 'TRX / резинки' },
    { type: 'hobby', icon: '🧘', label: 'Йога' },
    { type: 'hobby', icon: '🤸', label: 'Пилатес' },
    { type: 'hobby', icon: '🎾', label: 'Теннис' },
    { type: 'hobby', icon: '💃', label: 'Танцы' },
    { type: 'fingers', icon: '🤚', label: 'Fingerboard' },
    { type: 'fingers', icon: '🧗', label: 'Hangboard' },
    { type: 'fingers', icon: '💪', label: 'Block pulling' }
  ];

  function normalizeActivityLabel(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
  }

  function getTrainingTypeMeta(type) {
    return TRAINING_TYPE_META[type] || TRAINING_TYPE_META.cardio;
  }

  function getDefaultActivityLabel(type) {
    return getTrainingTypeMeta(type).label;
  }

  function readTrainingActivityOptions() {
    const raw = lsGet(TRAINING_ACTIVITY_STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item) => {
        const label = normalizeActivityLabel(item?.label);
        const type = typeof item?.type === 'string' ? item.type : 'cardio';
        if (!label) return null;

        return {
          label,
          type,
          icon: typeof item?.icon === 'string' && item.icon ? item.icon : getTrainingTypeMeta(type).icon,
          usedAt: Number(item?.usedAt) || 0
        };
      })
      .filter(Boolean)
      .slice(0, 24);
  }

  function persistTrainingActivityOption(type, label) {
    const normalizedLabel = normalizeActivityLabel(label);
    if (!normalizedLabel) return readTrainingActivityOptions();

    const nextType = typeof type === 'string' && type ? type : 'cardio';
    const usedAt = Date.now();
    const existing = readTrainingActivityOptions().filter((item) => {
      return !(item.type === nextType && item.label.toLowerCase() === normalizedLabel.toLowerCase());
    });

    const next = [
      {
        label: normalizedLabel,
        type: nextType,
        icon: getTrainingTypeMeta(nextType).icon,
        usedAt
      },
      ...existing
    ].slice(0, 24);

    lsSet(TRAINING_ACTIVITY_STORAGE_KEY, next);
    return next;
  }

  function buildTrainingActivityOptions(type, savedOptions, currentLabel) {
    const nextType = typeof type === 'string' && type ? type : 'cardio';
    const normalizedCurrent = normalizeActivityLabel(currentLabel);
    const deduped = [];
    const seen = new Set();

    const pushOption = (option) => {
      if (!option || !option.label) return;
      const normalizedLabel = normalizeActivityLabel(option.label);
      if (!normalizedLabel) return;

      const key = normalizedLabel.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push({
        label: normalizedLabel,
        icon: option.icon || getTrainingTypeMeta(nextType).icon,
        type: nextType,
        source: option.source || 'preset'
      });
    };

    pushOption({
      label: getDefaultActivityLabel(nextType),
      icon: getTrainingTypeMeta(nextType).icon,
      source: 'default'
    });

    TRAINING_ACTIVITY_PRESETS
      .filter((item) => item.type === nextType)
      .forEach((item) => pushOption({ ...item, source: 'preset' }));

    (Array.isArray(savedOptions) ? savedOptions : [])
      .filter((item) => item.type === nextType)
      .sort((left, right) => (right.usedAt || 0) - (left.usedAt || 0))
      .forEach((item) => pushOption({ ...item, source: 'custom' }));

    if (normalizedCurrent) {
      pushOption({
        label: normalizedCurrent,
        icon: getTrainingTypeMeta(nextType).icon,
        source: 'current'
      });
    }

    return deduped;
  }

  function getRoundedCurrentTime() {
    const now = new Date();
    return pad2(now.getHours()) + ':' + pad2(Math.floor(now.getMinutes() / 5) * 5);
  }

  function normalizeTrainingRating(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 5;
  }

  function normalizeTrainingZones(value) {
    const source = Array.isArray(value) ? value : [0, 0, 0, 0];
    return [0, 1, 2, 3].map((index) => {
      const parsed = Number(source[index]);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    });
  }

  function buildTrainingFormData(training) {
    const source = training || {};
    const type = source.type || 'cardio';

    const out = {
      type,
      activityLabel: normalizeActivityLabel(source.activityLabel) || getDefaultActivityLabel(type),
      time: source.time || getRoundedCurrentTime(),
      zones: normalizeTrainingZones(source.zones || source.z),
      mood: normalizeTrainingRating(source.mood),
      wellbeing: normalizeTrainingRating(source.wellbeing),
      stress: normalizeTrainingRating(source.stress),
      comment: typeof source.comment === 'string' ? source.comment : ''
    };
    if (source.strengthEntryMode === 'hr_zones' || source.strengthEntryMode === 'workout_builder') {
      out.strengthEntryMode = source.strengthEntryMode;
    }
    if (source.workoutLog && typeof source.workoutLog === 'object') {
      out.workoutLog = source.workoutLog;
    }
    if (source.fingersLog && typeof source.fingersLog === 'object') {
      out.fingersLog = source.fingersLog;
    }
    return out;
  }

  function persistMergedTraining(ctx, allStepData, patch) {
    const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
    const trainingIndex = ctx?.trainingIndex ?? 0;
    const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });

    const trainings = day.trainings || [];
    while (trainings.length <= trainingIndex) {
      trainings.push({ z: [0, 0, 0, 0] });
    }

    const infoData = allStepData?.['training-info'] || {};
    const feedbackData = allStepData?.['training-feedback'] || {};
    // Feedback is initialized before user may change type on step 1; it can still carry stale type/activity/time.
    // Merge order: training-info and patch must win over feedback for those fields.
    const merged = buildTrainingFormData({
      ...feedbackData,
      ...infoData,
      ...patch
    });

    const finalTraining = {
      z: merged.zones,
      time: merged.time,
      type: merged.type,
      activityLabel: merged.activityLabel,
      mood: merged.mood,
      wellbeing: merged.wellbeing,
      stress: merged.stress,
      comment: merged.comment
    };

    if (merged.fingersLog && typeof merged.fingersLog === 'object') {
      finalTraining.fingersLog = merged.fingersLog;
    }

    if (merged.strengthEntryMode) {
      finalTraining.strengthEntryMode = merged.strengthEntryMode;
    }
    if (merged.strengthEntryMode === 'workout_builder') {
      if (merged.workoutLog && typeof merged.workoutLog === 'object') {
        finalTraining.workoutLog = merged.workoutLog;
      } else {
        const m = Math.max(1, Math.min(180, Math.round(Number(merged.zones?.[1]) || 0) || 1));
        finalTraining.workoutLog = {
          version: 1,
          zoneMinutes: [0, m, 0, 0],
          totalDurationMinutes: m,
          exercises: [{ id: 'ex_0', name: '', sets: 1, reps: 10, weightKg: '', note: '', ssGroup: 0, rpe: 0 }]
        };
      }
    } else if (merged.strengthEntryMode === 'hr_zones') {
      delete finalTraining.workoutLog;
    }

    trainings[trainingIndex] = finalTraining;

    day.trainings = trainings;
    day.updatedAt = Date.now();
    lsSet(`heys_dayv2_${dateKey}`, day);

    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: { date: dateKey, field: 'trainings', source: 'training-step', forceReload: true }
    }));

    const totalMinutes = (finalTraining.z || []).reduce((sum, v) => sum + (Number(v) || 0), 0);
    if (typeof window !== 'undefined' && totalMinutes > 0) {
      window.dispatchEvent(new CustomEvent('heysTrainingAdded', {
        detail: { minutes: totalMinutes, date: dateKey, trainingIndex }
      }));
    }
  }

  function readTrainingFormData(ctx) {
    const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
    const trainingIndex = ctx?.trainingIndex ?? 0;
    const day = lsGet(`heys_dayv2_${dateKey}`, {});
    const trainings = day.trainings || [];

    return buildTrainingFormData(trainings[trainingIndex] || {});
  }

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
  // ШАГ 1: Тип, активность и время
  // ========================================
  function TrainingInfoStep({ data, onChange, context }) {
    const type = data.type || 'cardio';
    const time = data.time || getRoundedCurrentTime();
    const activityLabel = normalizeActivityLabel(data.activityLabel) || getDefaultActivityLabel(type);
    const [savedActivities, setSavedActivities] = useState(() => readTrainingActivityOptions());
    const [showCustomActivityInput, setShowCustomActivityInput] = useState(false);
    const [customActivityDraft, setCustomActivityDraft] = useState('');
    const activityOptions = useMemo(
      () => buildTrainingActivityOptions(type, savedActivities, activityLabel),
      [type, savedActivities, activityLabel]
    );

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

    const updateData = (patch) => {
      onChange({ ...data, ...patch });
    };

    const updateField = (field, value) => {
      haptic('light');
      updateData({ [field]: value });
    };

    const handleTypeChange = (nextType) => {
      // 🤚 Fingers handoff to dedicated full-screen overlay (skip remaining steps).
      // Wave 1: handoff stub — opens fullscreen if module loaded; Wave 3 will mount UI.
      if (nextType === 'fingers' && window.HEYS?.Fingers?.openFullscreen) {
        haptic('light');
        try { HEYS.StepModal.hide(); } catch (_) { /* noop */ }
        try {
          HEYS.Fingers.openFullscreen({
            dateKey: context?.dateKey,
            trainingIndex: context?.trainingIndex,
            mode: 'new'
          });
        } catch (e) {
          console.warn('[TrainingStep] Fingers.openFullscreen failed:', e);
        }
        return;
      }

      const nextOptions = buildTrainingActivityOptions(nextType, savedActivities, '');
      const canKeepCurrentActivity = nextOptions.some(
        (option) => option.label.toLowerCase() === activityLabel.toLowerCase()
      );

      haptic('light');
      setShowCustomActivityInput(false);
      setCustomActivityDraft('');
      updateData({
        type: nextType,
        activityLabel: canKeepCurrentActivity ? activityLabel : getDefaultActivityLabel(nextType)
      });
    };

    const handleActivitySelect = (value) => {
      if (value === '__custom__') {
        haptic('light');
        setShowCustomActivityInput(true);
        setCustomActivityDraft('');
        return;
      }

      haptic('light');
      setShowCustomActivityInput(false);
      updateData({ activityLabel: value });
    };

    const handleSaveCustomActivity = () => {
      const normalizedLabel = normalizeActivityLabel(customActivityDraft);
      if (!normalizedLabel) {
        haptic('error');
        return;
      }

      const nextSavedActivities = persistTrainingActivityOption(type, normalizedLabel);
      setSavedActivities(nextSavedActivities);
      setShowCustomActivityInput(false);
      setCustomActivityDraft('');
      haptic('success');
      updateData({ activityLabel: normalizedLabel });
    };

    return React.createElement('div', { className: 'training-step' },

      // === Тип тренировки ===
      React.createElement('div', { className: 'ts-section ts-type-section' },
        React.createElement('div', { className: 'ts-type-grid' },
          TRAINING_TYPES.map(t =>
            React.createElement('button', {
              key: t.id,
              className: 'ts-type-btn' + (type === t.id ? ' active' : ''),
              onClick: () => handleTypeChange(t.id)
            },
              React.createElement('span', { className: 'ts-type-icon' }, t.icon),
              React.createElement('span', { className: 'ts-type-label' }, t.label)
            )
          )
        )
      ),

      React.createElement('div', { className: 'ts-section training-activity-section' },
        React.createElement('div', { className: 'training-activity-header' },
          React.createElement('div', { className: 'training-activity-label' }, '✨ Что именно делал?'),
          React.createElement('div', { className: 'training-activity-helper' },
            'Это название увидит куратор; базовый тип выше нужен для аналитики.'
          )
        ),
        React.createElement('div', { className: 'training-activity-select-wrap' },
          React.createElement('select', {
            className: 'training-activity-select',
            value: activityLabel,
            onChange: (e) => handleActivitySelect(e.target.value)
          },
            activityOptions.map((option) =>
              React.createElement('option', { key: option.type + ':' + option.label, value: option.label },
                option.icon + ' ' + option.label
              )
            ),
            React.createElement('option', { value: '__custom__' }, '＋ Своя активность…')
          )
        ),
        showCustomActivityInput && React.createElement('div', { className: 'training-activity-custom' },
          React.createElement('input', {
            type: 'text',
            className: 'training-activity-custom-input',
            placeholder: 'Например: Теннис, Йога, Бокс',
            value: customActivityDraft,
            onChange: (e) => setCustomActivityDraft(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveCustomActivity();
              }
            },
            maxLength: 40
          }),
          React.createElement('button', {
            type: 'button',
            className: 'training-activity-custom-btn',
            disabled: !normalizeActivityLabel(customActivityDraft),
            onClick: handleSaveCustomActivity
          }, 'Добавить')
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
      )
    );
  }

  // ========================================
  // ШАГ 2: Оценки и заметка
  // ========================================
  function TrainingFeedbackStep({ data, onChange, context }) {
    const mood = data.mood || 5;
    const wellbeing = data.wellbeing || 5;
    const stress = data.stress || 5;
    const comment = data.comment || '';

    const updateData = (patch) => {
      onChange({ ...data, ...patch });
    };

    const updateField = (field, value) => {
      haptic('light');
      updateData({ [field]: value });
    };

    return React.createElement('div', { className: 'training-step' },
      React.createElement('div', { className: 'ts-section ts-ratings-section' },
        React.createElement('div', { className: 'ts-ratings-title' }, '📊 Какие ощущения после тренировки?'),

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
  // Силовая: выбор пути (зоны vs конструктор)
  // ========================================
  function TrainingStrengthModeStep({ data, onChange }) {
    const mode = data.mode || null;
    const setMode = (m) => {
      haptic('light');
      onChange({ ...data, mode: m });
    };
    return React.createElement('div', { className: 'training-step' },
      React.createElement('div', { className: 'ts-section ts-strength-mode-section' },
        React.createElement('div', { className: 'ts-strength-mode-title' }, 'Силовая: как учесть нагрузку?'),
        React.createElement('div', { className: 'ts-strength-mode-grid' },
          React.createElement('button', {
            type: 'button',
            className: 'ts-strength-mode-btn' + (mode === 'hr_zones' ? ' active' : ''),
            onClick: () => setMode('hr_zones')
          },
          React.createElement('span', { className: 'ts-sm-icon' }, '❤️'),
          React.createElement('span', { className: 'ts-sm-label' }, 'Пульсовые зоны'),
          React.createElement('span', { className: 'ts-sm-hint' }, 'Минуты по зонам — как раньше')
          ),
          React.createElement('button', {
            type: 'button',
            className: 'ts-strength-mode-btn' + (mode === 'workout_builder' ? ' active' : ''),
            onClick: () => setMode('workout_builder')
          },
          React.createElement('span', { className: 'ts-sm-icon' }, '📋'),
          React.createElement('span', { className: 'ts-sm-label' }, 'Конструктор'),
          React.createElement('span', { className: 'ts-sm-hint' }, 'Упражнения, подходы и повторы')
          )
        ),
        mode === 'workout_builder' && React.createElement('p', { className: 'ts-strength-mode-footnote' },
          'После «Добавить» упражнения и длительность настраиваются в карточке тренировки в блоке активности.'
        )
      )
    );
  }

  // ========================================
  // ШАГ: Зоны пульса
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

  // Шаг 1: База (тип, активность, время)
  registerStep('training-info', {
    title: 'Тренировка',
    hint: 'Тип и время',
    icon: '🏋️',
    component: TrainingInfoStep,
    getInitialData: (ctx) => {
      return readTrainingFormData(ctx);
    },
    validate: () => true // Шаг 1 всегда валиден
  });

  // Шаг 2: Оценки и заметка
  registerStep('training-feedback', {
    title: 'Ощущения',
    hint: 'Оценки и заметка',
    icon: '📊',
    component: TrainingFeedbackStep,
    getInitialData: (ctx, allData) => {
      return {
        ...readTrainingFormData(ctx),
        ...(allData?.['training-info'] || {})
      };
    },
    validate: () => true
  });

  // Силовая: зоны или конструктор (только type === strength)
  registerStep('training-strength-mode', {
    title: 'Силовая',
    hint: 'Зоны или конструктор',
    icon: '🏋️',
    component: TrainingStrengthModeStep,
    shouldShow: (ctx, sd) => (sd['training-info'] || {}).type === 'strength',
    getInitialData: (ctx, allData) => {
      const info = allData?.['training-info'] || {};
      const day = readTrainingFormData(ctx);
      if (info.type !== 'strength') return { mode: null };
      if (day.strengthEntryMode === 'hr_zones') return { mode: 'hr_zones' };
      if (day.strengthEntryMode === 'workout_builder') return { mode: 'workout_builder' };
      return { mode: null };
    },
    validate: (data) => data && (data.mode === 'hr_zones' || data.mode === 'workout_builder'),
    getValidationMessage: () => 'Выберите способ учёта силовой тренировки',
    save: (data, ctx, allStepData) => {
      if (!data || data.mode !== 'workout_builder') return;
      const info = allStepData?.['training-info'] || {};
      if (info.type !== 'strength') return;
      const base = readTrainingFormData(ctx);
      let z4 = normalizeTrainingZones(base.zones || base.z || [0, 0, 0, 0]);
      const sumZ = z4.reduce((s, v) => s + (+v || 0), 0);
      const z1 = Array.isArray(base.zones) ? base.zones[1] : 0;
      const defaultMin = Math.max(1, Math.min(180, Math.round(Number(z1)) || 1));
      if (sumZ === 0) {
        z4 = [0, defaultMin, 0, 0];
      }
      let wl = base.workoutLog;
      const zmSum = z4.reduce((s, v) => s + (+v || 0), 0);
      if (wl && typeof wl === 'object' && Array.isArray(wl.exercises) && wl.exercises.length) {
        wl = {
          ...wl,
          version: 1,
          zoneMinutes: z4.slice(),
          totalDurationMinutes: zmSum
        };
      } else {
        wl = {
          version: 1,
          zoneMinutes: z4.slice(),
          totalDurationMinutes: zmSum,
          exercises: [{ id: 'ex_0', name: '', sets: 1, reps: 10, weightKg: '', note: '', ssGroup: 0, rpe: 0 }]
        };
      }
      persistMergedTraining(ctx, allStepData, {
        zones: z4,
        strengthEntryMode: 'workout_builder',
        workoutLog: wl
      });
    }
  });

  // Зоны пульса (после выбора «зоны» для силовой; для кардио/хобби — сразу после ощущений)
  registerStep('training-zones', {
    title: 'Зоны пульса',
    hint: 'Минуты в каждой зоне',
    icon: '❤️',
    component: TrainingZonesStep,
    shouldShow: (ctx, sd) => {
      const t = (sd['training-info'] || {}).type;
      if (t === 'fingers') return false; // 🤚 fingers handoff to dedicated overlay, never reach zones
      if (t !== 'strength') return true;
      return (sd['training-strength-mode'] || {}).mode === 'hr_zones';
    },
    getInitialData: (ctx, allData) => {
      return {
        ...readTrainingFormData(ctx),
        ...(allData?.['training-info'] || {}),
        ...(allData?.['training-feedback'] || {})
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
      const infoData = allStepData?.['training-info'] || {};
      const patch = { zones: (data || {}).zones };
      if (infoData.type === 'strength') {
        patch.strengthEntryMode = 'hr_zones';
      }
      persistMergedTraining(ctx, allStepData, patch);
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
      steps: [
        'training-info',
        'training-feedback',
        'training-strength-mode',
        'training-zones'
      ],
      title: trainingIndex > 0 ? `Тренировка ${trainingIndex + 1}` : 'Тренировка',
      showProgress: true,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      allowSwipe: false,
      finishLabel: 'Добавить', // Кнопка на последнем шаге
      context: { dateKey, trainingIndex },
      onComplete: (stepData) => {
        onComplete?.({
          ...(stepData['training-info'] || {}),
          ...(stepData['training-feedback'] || {}),
          ...(stepData['training-strength-mode'] || {}),
          ...(stepData['training-zones'] || {})
        });
      }
    });
  }

  // 🤚 Fingers persistence wrapper — thin layer over persistMergedTraining.
  // Called by Fingers.openFullscreen save flow (Wave 3). Keeps storage logic in one place.
  function saveFingers(ctx, fingersLog, meta) {
    const baseMeta = meta && typeof meta === 'object' ? meta : {};
    persistMergedTraining(ctx, {}, {
      type: 'fingers',
      activityLabel: baseMeta.activityLabel || 'Пальцы',
      time: baseMeta.time || getRoundedCurrentTime(),
      zones: [0, 0, 0, 0],
      mood: baseMeta.mood || 0,
      wellbeing: baseMeta.wellbeing || 0,
      stress: baseMeta.stress || 0,
      comment: typeof baseMeta.comment === 'string' ? baseMeta.comment : '',
      fingersLog
    });

    // Recovery contract: readiness.getYesterdayFb() (heys_fingers_readiness_v1.js)
    // expects day.fingers.{lastSessionAt, lastIntensity} for hard 48h cooldown override.
    // Intensity derived from program id via getProgramIntensity, fallback 'moderate'.
    try {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });
      const intensity = (window.HEYS?.Fingers?.getProgramIntensity?.(fingersLog?.programId)) || 'moderate';
      day.fingers = {
        ...(day.fingers || {}),
        lastSessionAt: Date.now(),
        lastIntensity: intensity,
        lastProgramId: fingersLog?.programId || null
      };
      lsSet(`heys_dayv2_${dateKey}`, day);
    } catch (e) {
      console.warn('[saveFingers] day.fingers update failed:', e);
    }
  }

  // === Экспорт ===
  HEYS.TrainingStep = {
    show: showTrainingModal,
    saveFingers,
    InfoComponent: TrainingInfoStep,
    FeedbackComponent: TrainingFeedbackStep,
    ZonesComponent: TrainingZonesStep,
    TRAINING_TYPES,
    HR_ZONES
  };

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
