// heys_steps_v1.js — Библиотека шагов для StepModal
// WeightStep, SleepTimeStep, SleepQualityStep, StepsGoalStep
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.error('heys_steps_v1.js: HEYS.StepModal not found. Load heys_step_modal_v1.js first.');
    return;
  }

  const { WheelPicker, registerStep, utils } = HEYS.StepModal;
  // Используем общие утилиты из StepModal
  const { lsGet, lsSet, getTodayKey } = utils;

  // ============================================================
  // WEIGHT STEP
  // ============================================================
  
  function getLastKnownWeight() {
    const profile = lsGet('heys_profile', { weight: 70 });
    const today = new Date();
    
    // Сначала проверяем сегодняшний вес (для редактирования из карточки)
    const todayKey = today.toISOString().slice(0, 10);
    const todayData = lsGet(`heys_dayv2_${todayKey}`, {});
    if (todayData.weightMorning) {
      return { weight: todayData.weightMorning, daysAgo: 0, date: todayKey };
    }
    
    // Если сегодня нет — ищем в прошлых днях (для утреннего чек-ина)
    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {});
      if (dayData.weightMorning) {
        return { weight: dayData.weightMorning, daysAgo: i, date: key };
      }
    }
    if (profile.weight) {
      return { weight: profile.weight, daysAgo: null, date: null };
    }
    return { weight: 70, daysAgo: null, date: null };
  }

  function getYesterdayWeight() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = yesterday.toISOString().slice(0, 10);
    const dayData = lsGet(`heys_dayv2_${key}`, {});
    return dayData.weightMorning || null;
  }

  function getWeightForecast() {
    const weights = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {});
      if (dayData.weightMorning) {
        weights.push({ day: -i, weight: dayData.weightMorning });
      }
    }
    if (weights.length < 3) return null;
    const n = weights.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of weights) {
      sumX += p.day;
      sumY += p.weight;
      sumXY += p.day * p.weight;
      sumXX += p.day * p.day;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const forecastWeight = intercept + slope * 14;
    const weeklyChange = slope * 7;
    return {
      weight: Math.round(forecastWeight * 10) / 10,
      weeklyChange: Math.round(weeklyChange * 100) / 100,
      confidence: weights.length >= 7 ? 'high' : 'low'
    };
  }

  function WeightStepComponent({ data, onChange }) {
    const lastWeight = useMemo(() => getLastKnownWeight(), []);
    const yesterdayWeight = useMemo(() => getYesterdayWeight(), []);
    const weightForecast = useMemo(() => getWeightForecast(), []);

    const weightKg = data.weightKg ?? Math.floor(lastWeight.weight);
    const weightG = data.weightG ?? Math.round((lastWeight.weight % 1) * 10);
    const currentWeight = weightKg + weightG / 10;
    const weightDelta = yesterdayWeight ? currentWeight - yesterdayWeight : null;

    const kgValues = useMemo(() => Array.from({ length: 101 }, (_, i) => 40 + i), []);
    const gValues = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);

    const setWeightKg = (v) => onChange({ ...data, weightKg: v, weightG: data.weightG ?? weightG });
    const setWeightG = (v) => onChange({ ...data, weightKg: data.weightKg ?? weightKg, weightG: v });

    return React.createElement('div', { className: 'mc-weight-step' },
      React.createElement('div', { className: 'mc-weight-display' },
        React.createElement('span', { className: 'mc-weight-value' }, currentWeight.toFixed(1)),
        React.createElement('span', { className: 'mc-weight-unit' }, ' кг'),
        weightDelta !== null && React.createElement('div', {
          className: `mc-weight-delta ${weightDelta > 0 ? 'mc-delta-up' : weightDelta < 0 ? 'mc-delta-down' : 'mc-delta-same'}`
        },
          weightDelta > 0 ? `+${weightDelta.toFixed(1)}` : weightDelta.toFixed(1),
          ' кг за вчера'
        )
      ),
      React.createElement('div', { className: 'mc-weight-pickers' },
        React.createElement(WheelPicker, {
          values: kgValues,
          value: weightKg,
          onChange: setWeightKg,
          label: 'кг'
        }),
        React.createElement('span', { className: 'mc-weight-dot' }, '.'),
        React.createElement(WheelPicker, {
          values: gValues,
          value: weightG,
          onChange: setWeightG,
          label: 'г'
        })
      ),
      weightForecast && React.createElement('div', { className: 'mc-weight-forecast' },
        React.createElement('span', { className: 'mc-forecast-icon' }, '📈'),
        React.createElement('span', { className: 'mc-forecast-text' },
          `Прогноз через 2 нед: ${weightForecast.weight} кг`,
          weightForecast.weeklyChange !== 0 && ` (${weightForecast.weeklyChange > 0 ? '+' : ''}${weightForecast.weeklyChange} кг/нед)`
        )
      )
    );
  }

  registerStep('weight', {
    title: 'Вес',
    hint: 'Взвесьтесь натощак',
    icon: '⚖️',
    component: WeightStepComponent,
    getInitialData: () => {
      const last = getLastKnownWeight();
      return {
        weightKg: Math.floor(last.weight),
        weightG: Math.round((last.weight % 1) * 10)
      };
    },
    save: (data) => {
      const todayKey = getTodayKey();
      const dayData = lsGet(`heys_dayv2_${todayKey}`, {});
      const weight = (data.weightKg || 70) + (data.weightG || 0) / 10;
      dayData.date = todayKey;
      dayData.weightMorning = weight;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${todayKey}`, dayData);
    },
    xpAction: 'weight_logged'
  });

  // ============================================================
  // SLEEP TIME STEP
  // ============================================================

  function getLastSleepData() {
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {});
      if (dayData.sleepStart && dayData.sleepEnd) {
        return {
          sleepStart: dayData.sleepStart,
          sleepEnd: dayData.sleepEnd,
          sleepQuality: dayData.sleepQuality || 7
        };
      }
    }
    return { sleepStart: '23:00', sleepEnd: '07:00', sleepQuality: 7 };
  }

  function calcSleepHours(startH, startM, endH, endM) {
    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    if (endMins <= startMins) {
      endMins += 24 * 60;
    }
    return (endMins - startMins) / 60;
  }

  function SleepTimeStepComponent({ data, onChange }) {
    const lastSleep = useMemo(() => getLastSleepData(), []);

    const sleepStartH = data.sleepStartH ?? parseInt(lastSleep.sleepStart.split(':')[0], 10);
    const sleepStartM = data.sleepStartM ?? parseInt(lastSleep.sleepStart.split(':')[1], 10);
    const sleepEndH = data.sleepEndH ?? parseInt(lastSleep.sleepEnd.split(':')[0], 10);
    const sleepEndM = data.sleepEndM ?? parseInt(lastSleep.sleepEnd.split(':')[1], 10);

    const sleepHours = calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM);

    const hoursValues = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
    const minutesValues = useMemo(() => [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], []);

    const update = (field, value) => {
      onChange({ 
        ...data, 
        sleepStartH: data.sleepStartH ?? sleepStartH,
        sleepStartM: data.sleepStartM ?? sleepStartM,
        sleepEndH: data.sleepEndH ?? sleepEndH,
        sleepEndM: data.sleepEndM ?? sleepEndM,
        [field]: value 
      });
    };

    return React.createElement('div', { className: 'mc-sleep-step' },
      React.createElement('div', { className: 'mc-sleep-display' },
        React.createElement('span', { className: 'mc-sleep-value' }, sleepHours.toFixed(1)),
        React.createElement('span', { className: 'mc-sleep-unit' }, ' ч сна')
      ),
      React.createElement('div', { className: 'mc-sleep-times' },
        React.createElement('div', { className: 'mc-sleep-block' },
          React.createElement('div', { className: 'mc-sleep-label' }, '🌙 Лёг'),
          React.createElement('div', { className: 'mc-time-pickers' },
            React.createElement(WheelPicker, {
              values: hoursValues,
              value: sleepStartH,
              onChange: (v) => update('sleepStartH', v),
              label: 'ч'
            }),
            React.createElement('span', { className: 'mc-time-sep' }, ':'),
            React.createElement(WheelPicker, {
              values: minutesValues,
              value: sleepStartM,
              onChange: (v) => update('sleepStartM', v),
              label: 'мин'
            })
          )
        ),
        React.createElement('div', { className: 'mc-sleep-block' },
          React.createElement('div', { className: 'mc-sleep-label' }, '☀️ Встал'),
          React.createElement('div', { className: 'mc-time-pickers' },
            React.createElement(WheelPicker, {
              values: hoursValues,
              value: sleepEndH,
              onChange: (v) => update('sleepEndH', v),
              label: 'ч'
            }),
            React.createElement('span', { className: 'mc-time-sep' }, ':'),
            React.createElement(WheelPicker, {
              values: minutesValues,
              value: sleepEndM,
              onChange: (v) => update('sleepEndM', v),
              label: 'мин'
            })
          )
        )
      )
    );
  }

  registerStep('sleepTime', {
    title: 'Сон',
    hint: 'Во сколько легли и встали',
    icon: '🛏️',
    component: SleepTimeStepComponent,
    getInitialData: () => {
      const last = getLastSleepData();
      return {
        sleepStartH: parseInt(last.sleepStart.split(':')[0], 10),
        sleepStartM: parseInt(last.sleepStart.split(':')[1], 10),
        sleepEndH: parseInt(last.sleepEnd.split(':')[0], 10),
        sleepEndM: parseInt(last.sleepEnd.split(':')[1], 10)
      };
    },
    save: (data) => {
      const todayKey = getTodayKey();
      const dayData = lsGet(`heys_dayv2_${todayKey}`, {});
      const sleepStart = `${String(data.sleepStartH).padStart(2, '0')}:${String(data.sleepStartM).padStart(2, '0')}`;
      const sleepEnd = `${String(data.sleepEndH).padStart(2, '0')}:${String(data.sleepEndM).padStart(2, '0')}`;
      const sleepHours = calcSleepHours(data.sleepStartH, data.sleepStartM, data.sleepEndH, data.sleepEndM);
      
      dayData.date = todayKey;
      dayData.sleepStart = sleepStart;
      dayData.sleepEnd = sleepEnd;
      dayData.sleepHours = Math.round(sleepHours * 10) / 10;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${todayKey}`, dayData);
    },
    xpAction: 'sleep_logged'
  });

  // ============================================================
  // SLEEP QUALITY STEP
  // ============================================================

  const SLEEP_QUALITY_EMOJI = ['😴', '😟', '😕', '😐', '🙂', '😊', '😃', '🌟', '✨', '🌈'];
  const SLEEP_QUALITY_LABELS = [
    'Ужасно', 'Плохо', 'Так себе', 'Норм', 'Неплохо',
    'Хорошо', 'Отлично', 'Супер', 'Идеально', 'Божественно'
  ];

  const SLEEP_ADVICE = {
    bad: [
      { icon: '📵', text: 'Попробуй без экранов за час до сна' },
      { icon: '🌡️', text: 'Прохладная комната (18-20°C) улучшает сон' },
      { icon: '🧘', text: 'Лёгкая растяжка перед сном снимает напряжение' },
      { icon: '☕', text: 'Последний кофе — до 14:00' },
      { icon: '🚶', text: 'Прогулка вечером поможет расслабиться' }
    ],
    medium: [
      { icon: '⏰', text: 'Попробуй ложиться в одно время' },
      { icon: '🌙', text: 'Затемни комнату для глубокого сна' },
      { icon: '📖', text: 'Книга перед сном лучше телефона' },
      { icon: '💨', text: 'Проветри комнату перед сном' }
    ],
    good: [
      { icon: '✨', text: 'Отличный режим! Продолжай в том же духе' },
      { icon: '💪', text: 'Качественный сон = больше энергии днём' },
      { icon: '🧠', text: 'Хороший сон улучшает концентрацию' }
    ],
    excellent: [
      { icon: '🌟', text: 'Идеально! Ты мастер сна!' },
      { icon: '🏆', text: 'Твой секрет успеха — в режиме' },
      { icon: '🚀', text: 'С таким сном горы свернёшь!' }
    ]
  };

  function getSleepAdvice(quality) {
    if (quality <= 3) return SLEEP_ADVICE.bad;
    if (quality <= 6) return SLEEP_ADVICE.medium;
    if (quality <= 8) return SLEEP_ADVICE.good;
    return SLEEP_ADVICE.excellent;
  }

  function getSleepAdviceColor(quality) {
    if (quality <= 3) return { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' };
    if (quality <= 6) return { bg: '#fefce8', border: '#fef08a', text: '#854d0e' };
    if (quality <= 8) return { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' };
    return { bg: '#ecfdf5', border: '#6ee7b7', text: '#047857' };
  }

  function getQualityColor(quality) {
    if (quality <= 3) {
      const t = (quality - 1) / 2;
      return `hsl(${Math.round(t * 30)}, 80%, 50%)`;
    } else if (quality <= 6) {
      const t = (quality - 3) / 3;
      return `hsl(${Math.round(30 + t * 40)}, 80%, 50%)`;
    } else {
      const t = (quality - 6) / 4;
      return `hsl(${Math.round(70 + t * 90)}, 70%, 45%)`;
    }
  }

  function SleepQualityStepComponent({ data, onChange }) {
    const lastSleep = useMemo(() => getLastSleepData(), []);
    const sleepQuality = data.sleepQuality ?? lastSleep.sleepQuality ?? 7;
    const sleepNote = data.sleepNote ?? '';

    const qualityColor = getQualityColor(sleepQuality);
    const adviceList = getSleepAdvice(sleepQuality);
    const adviceColors = getSleepAdviceColor(sleepQuality);
    const adviceIndex = (sleepQuality * 7) % adviceList.length;
    const currentAdvice = adviceList[adviceIndex];

    const commentQuestion = sleepQuality <= 4 
      ? '😔 Что помешало выспаться?' 
      : sleepQuality >= 8 
        ? '✨ Что помогло хорошо выспаться?' 
        : '💭 Заметка о сне';
    const commentPlaceholder = sleepQuality <= 4 
      ? 'Шум, стресс, поздно лёг...' 
      : sleepQuality >= 8 
        ? 'Режим, тишина, прохлада...' 
        : 'Любые заметки...';

    return React.createElement('div', { 
      className: 'mc-quality-step',
      style: { '--quality-color': qualityColor }
    },
      React.createElement('div', { className: 'mc-quality-display' },
        React.createElement('span', { 
          className: 'mc-quality-emoji',
          style: { filter: `drop-shadow(0 0 8px ${qualityColor})` }
        }, SLEEP_QUALITY_EMOJI[sleepQuality - 1]),
        React.createElement('span', { className: 'mc-quality-label' }, SLEEP_QUALITY_LABELS[sleepQuality - 1])
      ),
      React.createElement('input', {
        type: 'range',
        className: 'mc-quality-slider',
        min: 1,
        max: 10,
        value: sleepQuality,
        onChange: (e) => onChange({ ...data, sleepQuality: Number(e.target.value) }),
        style: { 
          background: `linear-gradient(to right, ${qualityColor} ${(sleepQuality - 1) * 11.1}%, #e5e7eb ${(sleepQuality - 1) * 11.1}%)`
        }
      }),
      React.createElement('div', { className: 'mc-quality-buttons' },
        [1, 4, 7, 10].map(q =>
          React.createElement('button', {
            key: q,
            className: `mc-quality-btn ${sleepQuality === q ? 'mc-quality-btn--active' : ''}`,
            onClick: () => onChange({ ...data, sleepQuality: q }),
            style: sleepQuality === q ? { backgroundColor: qualityColor, borderColor: qualityColor } : {}
          }, SLEEP_QUALITY_EMOJI[q - 1])
        )
      ),
      React.createElement('div', { 
        className: 'mc-sleep-advice',
        style: { 
          backgroundColor: adviceColors.bg,
          borderColor: adviceColors.border
        }
      },
        React.createElement('span', { className: 'mc-sleep-advice-icon' }, currentAdvice.icon),
        React.createElement('span', { 
          className: 'mc-sleep-advice-text',
          style: { color: adviceColors.text }
        }, currentAdvice.text)
      ),
      React.createElement('div', { 
        className: 'mc-sleep-comment',
        style: { borderColor: adviceColors.border }
      },
        React.createElement('label', { 
          className: 'mc-sleep-comment-label',
          style: { color: adviceColors.text }
        }, commentQuestion),
        React.createElement('input', {
          type: 'text',
          className: 'mc-sleep-comment-input',
          placeholder: commentPlaceholder,
          value: sleepNote,
          onChange: (e) => onChange({ ...data, sleepNote: e.target.value })
        })
      )
    );
  }

  registerStep('sleepQuality', {
    title: 'Качество сна',
    hint: 'Как выспались?',
    icon: '✨',
    component: SleepQualityStepComponent,
    getInitialData: () => {
      const last = getLastSleepData();
      return {
        sleepQuality: last.sleepQuality || 7,
        sleepNote: ''
      };
    },
    save: (data) => {
      const todayKey = getTodayKey();
      const dayData = lsGet(`heys_dayv2_${todayKey}`, {});
      dayData.sleepQuality = data.sleepQuality;
      
      if (data.sleepNote && data.sleepNote.trim()) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const noteWithTime = `[${timeStr}] ${data.sleepNote.trim()}`;
        dayData.sleepNote = dayData.sleepNote 
          ? dayData.sleepNote + '\n' + noteWithTime
          : noteWithTime;
      }
      
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${todayKey}`, dayData);
    }
  });

  // ============================================================
  // STEPS GOAL STEP
  // ============================================================

  function getWeeklyStepsStats(weight = 70) {
    const today = new Date();
    const stepsData = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {});
      if (dayData.steps && dayData.steps > 0) {
        stepsData.push(dayData.steps);
      }
    }
    if (stepsData.length === 0) {
      return { avg: 0, daysWithData: 0, recommended: 7000, minHealthy: 7000 };
    }
    const avg = Math.round(stepsData.reduce((a, b) => a + b, 0) / stepsData.length);
    const minHealthy = 7000;
    const rawRecommended = Math.round(avg * 1.2 / 100) * 100;
    const recommended = Math.max(rawRecommended, minHealthy);
    return { avg, daysWithData: stepsData.length, recommended, minHealthy };
  }

  function StepsGoalStepComponent({ data, onChange, stepData }) {
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = stepData?.weight?.weightKg ? (stepData.weight.weightKg + (stepData.weight.weightG || 0) / 10) : profile.weight || 70;
    const stepsStats = useMemo(() => getWeeklyStepsStats(weight), [weight]);
    
    const defaultStepsGoal = useMemo(() => {
      if (stepsStats.daysWithData >= 3) {
        return stepsStats.recommended;
      }
      return profile.stepsGoal || 10000;
    }, [stepsStats, profile.stepsGoal]);

    const stepsGoal = data.stepsGoal ?? defaultStepsGoal;
    const hasStepsHistory = stepsStats.daysWithData >= 3;

    // Расчёт бонуса ккал
    const isFemale = profile.gender === 'Женский';
    const coef = isFemale ? 0.5 : 0.57;
    const bonusSteps = stepsGoal - stepsStats.avg;
    const bonusKm = bonusSteps * 0.7 / 1000;
    const bonusKcal = Math.round(coef * weight * bonusKm);

    const sliderMin = 3000;
    const sliderMax = 20000;
    const sliderPercent = Math.min(100, Math.max(0, ((stepsGoal - sliderMin) / (sliderMax - sliderMin)) * 100));
    const sliderColor = stepsGoal < 7000 ? '#eab308' : stepsGoal >= 10000 ? '#22c55e' : '#3b82f6';

    const stepsValues = useMemo(() => [5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000], []);

    return React.createElement('div', { className: 'mc-steps-step' },
      React.createElement('div', { className: 'mc-steps-display' },
        React.createElement('span', { className: 'mc-steps-value' }, stepsGoal.toLocaleString()),
        React.createElement('span', { className: 'mc-steps-unit' }, ' шагов')
      ),
      React.createElement('div', { className: 'mc-steps-slider-container' },
        React.createElement('input', {
          type: 'range',
          className: 'mc-steps-slider',
          min: sliderMin,
          max: sliderMax,
          step: 500,
          value: stepsGoal,
          onChange: (e) => onChange({ ...data, stepsGoal: Number(e.target.value) }),
          style: {
            background: `linear-gradient(to right, ${sliderColor} ${sliderPercent}%, #e5e7eb ${sliderPercent}%)`
          }
        }),
        React.createElement('div', { className: 'mc-steps-slider-labels' },
          React.createElement('span', null, '3к'),
          React.createElement('span', { className: 'mc-steps-slider-label-health' }, '7к ❤️'),
          React.createElement('span', null, '10к'),
          React.createElement('span', null, '15к'),
          React.createElement('span', null, '20к')
        )
      ),
      hasStepsHistory && React.createElement('div', { className: 'mc-steps-stats' },
        React.createElement('div', { className: 'mc-steps-avg' },
          React.createElement('span', { className: 'mc-steps-avg-label' }, '📊 Среднее за неделю: '),
          React.createElement('span', { className: 'mc-steps-avg-value' }, stepsStats.avg.toLocaleString())
        ),
        stepsGoal > stepsStats.avg && bonusKcal > 0 && React.createElement('div', { className: 'mc-steps-bonus' },
          React.createElement('span', { className: 'mc-steps-bonus-icon' }, '🔥'),
          React.createElement('span', { className: 'mc-steps-bonus-text' }, 
            `+${(stepsGoal - stepsStats.avg).toLocaleString()} шагов = +${bonusKcal} ккал`
          )
        )
      ),
      React.createElement('div', { className: 'mc-steps-recommendation' },
        stepsGoal < 7000 
          ? '❤️ Минимум 7000 шагов для здоровья сердца и сосудов'
          : hasStepsHistory && stepsGoal === stepsStats.recommended
            ? '✨ Рекомендуем: ваше среднее +20%'
            : stepsGoal >= 10000
              ? '🏆 Отличная цель! 10К+ шагов — активный образ жизни'
              : '👍 Хорошая цель для поддержания здоровья'
      ),
      React.createElement('div', { className: 'mc-steps-grid' },
        stepsValues.map(v =>
          React.createElement('button', {
            key: v,
            className: `mc-steps-btn ${stepsGoal === v ? 'mc-steps-btn--active' : ''} ${v === stepsStats.recommended && hasStepsHistory ? 'mc-steps-btn--recommended' : ''}`,
            onClick: () => onChange({ ...data, stepsGoal: v })
          }, v >= 10000 ? `${v / 1000}к` : v.toLocaleString())
        )
      )
    );
  }

  registerStep('stepsGoal', {
    title: 'Шаги',
    hint: 'Цель на сегодня',
    icon: '👟',
    component: StepsGoalStepComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {});
      const stats = getWeeklyStepsStats(profile.weight || 70);
      return {
        stepsGoal: stats.daysWithData >= 3 ? stats.recommended : (profile.stepsGoal || 10000)
      };
    },
    save: (data) => {
      const profile = lsGet('heys_profile', {});
      profile.stepsGoal = data.stepsGoal;
      lsSet('heys_profile', profile);
      // Диспатчим событие обновления профиля для реактивного обновления UI
      window.dispatchEvent(new CustomEvent('heys:profile-updated', { 
        detail: { stepsGoal: data.stepsGoal } 
      }));
    }
  });

  // =============================================
  // ШАГ 5: ДЕФИЦИТ КАЛОРИЙ
  // =============================================

  /**
   * Получить текущий дефицит из дня или профиля
   */
  function getCurrentDeficit(dateKey) {
    const day = lsGet(`heys_dayv2_${dateKey}`, {});
    if (day.deficitPct !== undefined) return day.deficitPct;
    const profile = lsGet('heys_profile', {});
    return profile.deficitPctTarget ?? 15; // default 15%
  }

  /**
   * DeficitStep — Шаг выбора дефицита калорий
   * Диапазон: -20% (дефицит/похудение) до +20% (профицит/набор)
   */
  function DeficitStepComponent({ data, onChange }) {
    const { useRef, useCallback } = React;
    
    const deficit = data.deficit ?? 15;
    const containerRef = useRef(null);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startValue = useRef(deficit);
    
    // Визуальные параметры
    const minDeficit = -20;
    const maxDeficit = 20;
    const range = maxDeficit - minDeficit; // 40
    
    // Получаем цвет и описание в зависимости от значения
    const getDeficitInfo = useCallback((val) => {
      if (val < -10) return { color: '#ef4444', label: 'Агрессивный дефицит', emoji: '🔥🔥' };
      if (val < 0) return { color: '#f97316', label: 'Умеренный дефицит', emoji: '🔥' };
      if (val === 0) return { color: '#22c55e', label: 'Поддержание веса', emoji: '⚖️' };
      if (val <= 10) return { color: '#3b82f6', label: 'Умеренный профицит', emoji: '💪' };
      return { color: '#8b5cf6', label: 'Агрессивный набор', emoji: '💪💪' };
    }, []);
    
    const info = getDeficitInfo(deficit);
    
    // Позиция ползунка (0 = -20%, 100 = +20%)
    const sliderPosition = ((deficit - minDeficit) / range) * 100;
    
    // Обработка touch событий для вертикального слайдера
    const handleTouchStart = useCallback((e) => {
      isDragging.current = true;
      startY.current = e.touches[0].clientY;
      startValue.current = deficit;
      e.preventDefault();
    }, [deficit]);
    
    const handleTouchMove = useCallback((e) => {
      if (!isDragging.current || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const deltaY = startY.current - e.touches[0].clientY;
      const sensitivity = range / rect.height;
      let newValue = startValue.current + Math.round(deltaY * sensitivity);
      
      newValue = Math.max(minDeficit, Math.min(maxDeficit, newValue));
      if (newValue !== deficit) {
        onChange({ ...data, deficit: newValue });
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(5);
      }
    }, [deficit, data, onChange]);
    
    const handleTouchEnd = useCallback(() => {
      isDragging.current = false;
    }, []);
    
    // Кнопки +/- для точной настройки
    const increment = () => {
      const newVal = Math.min(maxDeficit, deficit + 1);
      onChange({ ...data, deficit: newVal });
      if (navigator.vibrate) navigator.vibrate(10);
    };
    
    const decrement = () => {
      const newVal = Math.max(minDeficit, deficit - 1);
      onChange({ ...data, deficit: newVal });
      if (navigator.vibrate) navigator.vibrate(10);
    };
    
    // Быстрые пресеты
    const presets = [
      { value: -15, label: '-15%', emoji: '🔥' },
      { value: -10, label: '-10%', emoji: '🎯' },
      { value: 0, label: '0%', emoji: '⚖️' },
      { value: 10, label: '+10%', emoji: '💪' },
    ];
    
    return React.createElement('div', { className: 'step-deficit' },
      // Основной дисплей
      React.createElement('div', { className: 'deficit-display' },
        React.createElement('div', { className: 'deficit-value', style: { color: info.color } },
          (deficit > 0 ? '+' : '') + deficit + '%'
        ),
        React.createElement('div', { className: 'deficit-label' },
          info.emoji + ' ' + info.label
        )
      ),
      
      // Вертикальный слайдер с touch
      React.createElement('div', { 
        className: 'deficit-slider-container',
        ref: containerRef,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd
      },
        // Кнопка +
        React.createElement('button', {
          className: 'deficit-btn deficit-btn-plus',
          onClick: increment,
          disabled: deficit >= maxDeficit
        }, '+'),
        
        // Трек слайдера
        React.createElement('div', { className: 'deficit-slider-track' },
          // Заполненная часть
          React.createElement('div', { 
            className: 'deficit-slider-fill',
            style: { 
              height: sliderPosition + '%',
              background: `linear-gradient(to top, ${info.color}40, ${info.color})`
            }
          }),
          // Ползунок
          React.createElement('div', { 
            className: 'deficit-slider-thumb',
            style: { 
              bottom: sliderPosition + '%',
              backgroundColor: info.color,
              boxShadow: `0 0 10px ${info.color}80`
            }
          })
        ),
        
        // Кнопка -
        React.createElement('button', {
          className: 'deficit-btn deficit-btn-minus',
          onClick: decrement,
          disabled: deficit <= minDeficit
        }, '−')
      ),
      
      // Подсказка
      React.createElement('div', { className: 'deficit-hint' },
        'Отрицательный = дефицит (похудение)',
        React.createElement('br'),
        'Положительный = профицит (набор)'
      ),
      
      // Быстрые пресеты
      React.createElement('div', { className: 'deficit-presets' },
        presets.map(p => 
          React.createElement('button', {
            key: p.value,
            className: 'deficit-preset' + (deficit === p.value ? ' active' : ''),
            onClick: () => {
              onChange({ ...data, deficit: p.value });
              if (navigator.vibrate) navigator.vibrate(15);
            },
            style: deficit === p.value ? { 
              backgroundColor: info.color,
              borderColor: info.color
            } : {}
          }, p.emoji + ' ' + p.label)
        )
      )
    );
  }

  // Регистрация шага дефицита
  registerStep('deficit', {
    title: 'Дефицит',
    hint: 'Цель калорийности',
    icon: '📊',
    component: DeficitStepComponent,
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      return { deficit: getCurrentDeficit(dateKey), dateKey };
    },
    save: (data) => {
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });
      day.deficitPct = data.deficit;
      day.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, day);
      
      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', { 
        detail: { date: dateKey, field: 'deficitPct', value: data.deficit, source: 'deficit-step' }
      }));
    }
  });

  // =============================================
  // ШАГ 6: БЫТОВАЯ АКТИВНОСТЬ (Household)
  // =============================================

  /**
   * Примеры бытовой активности с MET коэффициентами
   */
  const HOUSEHOLD_EXAMPLES = [
    { icon: '🚶', name: 'Прогулка', met: 2.5 },
    { icon: '🧹', name: 'Уборка', met: 3.0 },
    { icon: '🛒', name: 'Шоппинг', met: 2.3 },
    { icon: '👶', name: 'Игры с детьми', met: 3.5 },
    { icon: '🐕', name: 'Выгул собаки', met: 3.0 },
    { icon: '🍳', name: 'Готовка', met: 2.0 },
    { icon: '🌱', name: 'Садоводство', met: 4.0 },
    { icon: '🔧', name: 'Ремонт дома', met: 3.5 }
  ];

  /**
   * Пресеты времени бытовой активности
   */
  const HOUSEHOLD_PRESETS = [
    { label: '15 мин', value: 15, icon: '⚡' },
    { label: '30 мин', value: 30, icon: '🚶' },
    { label: '1 час', value: 60, icon: '🏃' },
    { label: '2 часа', value: 120, icon: '💪' }
  ];

  /**
   * Рассчитать ккал от бытовой активности
   */
  function calcHouseholdKcal(minutes, weight = 70) {
    // Средний MET для бытовой активности ~2.5
    // Формула: ккал = MET * вес(кг) * время(ч)
    const met = 2.5;
    return Math.round(met * weight * (minutes / 60));
  }

  /**
   * Получить статистику бытовой активности за неделю
   */
  function getWeeklyHouseholdStats() {
    const today = new Date();
    const stats = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {});
      if (dayData.householdMin && dayData.householdMin > 0) {
        stats.push(dayData.householdMin);
      }
    }
    if (stats.length === 0) return { avg: 0, daysWithData: 0, trend: 'none' };
    const avg = Math.round(stats.reduce((a, b) => a + b, 0) / stats.length);
    const trend = stats.length >= 3 ? (stats[0] > stats[2] ? 'up' : stats[0] < stats[2] ? 'down' : 'stable') : 'none';
    return { avg, daysWithData: stats.length, trend };
  }

  /**
   * HouseholdStep — Шаг учёта бытовой активности
   */
  function HouseholdStepComponent({ data, onChange, context }) {
    const { useRef, useCallback, useMemo } = React;
    
    const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
    const minutes = data.minutes ?? 0;
    
    // Получаем вес для расчёта калорий
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = profile.weight || 70;
    const kcalBurned = calcHouseholdKcal(minutes, weight);
    
    // Статистика за неделю
    const weeklyStats = useMemo(() => getWeeklyHouseholdStats(), []);
    
    // Цвет в зависимости от количества минут
    const getColor = useCallback((min) => {
      if (min === 0) return '#94a3b8';
      if (min < 30) return '#eab308';
      if (min < 60) return '#22c55e';
      return '#10b981';
    }, []);
    
    const color = getColor(minutes);
    
    // Slider
    const sliderMin = 0;
    const sliderMax = 180;
    const sliderPercent = Math.min(100, (minutes / sliderMax) * 100);
    
    // Haptic
    const triggerHaptic = (intensity = 10) => {
      if (navigator.vibrate) navigator.vibrate(intensity);
    };
    
    // Quick preset buttons
    const handlePreset = (value) => {
      triggerHaptic(15);
      onChange({ ...data, minutes: value });
    };
    
    // Статус текст
    const getStatusText = (min) => {
      if (min === 0) return 'Не указано';
      if (min < 30) return 'Небольшая активность';
      if (min < 60) return 'Хорошая активность';
      if (min < 120) return 'Отличная активность!';
      return 'Супер активный день! 🔥';
    };
    
    return React.createElement('div', { className: 'step-household' },
      // Основной дисплей
      React.createElement('div', { className: 'household-display' },
        React.createElement('div', { className: 'household-value', style: { color } },
          minutes,
          React.createElement('span', { className: 'household-unit' }, ' мин')
        ),
        React.createElement('div', { className: 'household-kcal' },
          kcalBurned > 0 && React.createElement('span', null, '🔥 ~' + kcalBurned + ' ккал')
        ),
        React.createElement('div', { className: 'household-status' }, getStatusText(minutes))
      ),
      
      // Слайдер
      React.createElement('div', { className: 'household-slider-container' },
        React.createElement('input', {
          type: 'range',
          className: 'household-slider',
          min: sliderMin,
          max: sliderMax,
          step: 5,
          value: minutes,
          onChange: (e) => {
            triggerHaptic(5);
            onChange({ ...data, minutes: Number(e.target.value) });
          },
          style: {
            background: `linear-gradient(to right, ${color} ${sliderPercent}%, #e5e7eb ${sliderPercent}%)`
          }
        }),
        React.createElement('div', { className: 'household-slider-labels' },
          React.createElement('span', null, '0'),
          React.createElement('span', null, '30'),
          React.createElement('span', null, '1ч'),
          React.createElement('span', null, '2ч'),
          React.createElement('span', null, '3ч')
        )
      ),
      
      // Быстрые пресеты
      React.createElement('div', { className: 'household-presets' },
        HOUSEHOLD_PRESETS.map(p => 
          React.createElement('button', {
            key: p.value,
            className: 'household-preset' + (minutes === p.value ? ' active' : ''),
            onClick: () => handlePreset(p.value),
            style: minutes === p.value ? { 
              backgroundColor: color,
              borderColor: color,
              color: '#fff'
            } : {}
          }, p.icon + ' ' + p.label)
        )
      ),
      
      // Примеры активности
      React.createElement('div', { className: 'household-examples' },
        React.createElement('div', { className: 'household-examples-title' }, 'Примеры:'),
        React.createElement('div', { className: 'household-examples-grid' },
          HOUSEHOLD_EXAMPLES.slice(0, 4).map((ex, i) => 
            React.createElement('span', { 
              key: i, 
              className: 'household-example',
              title: `MET: ${ex.met}`
            }, ex.icon + ' ' + ex.name)
          )
        )
      ),
      
      // Статистика за неделю
      weeklyStats.daysWithData > 0 && React.createElement('div', { className: 'household-weekly-stats' },
        React.createElement('span', { className: 'household-stats-icon' }, '📊'),
        React.createElement('span', { className: 'household-stats-text' },
          'В среднем за неделю: ' + weeklyStats.avg + ' мин',
          weeklyStats.trend === 'up' && ' ↑',
          weeklyStats.trend === 'down' && ' ↓'
        )
      ),
      
      // Подсказка
      React.createElement('div', { className: 'household-hint' },
        'Время на ногах помимо тренировок: уборка, прогулки, шоппинг...'
      )
    );
  }

  // Регистрация шага бытовой активности
  registerStep('household', {
    title: 'Бытовая активность',
    hint: 'Время на ногах помимо тренировок',
    icon: '🏠',
    component: HouseholdStepComponent,
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, {});
      return { minutes: day.householdMin || 0, dateKey };
    },
    save: (data) => {
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });
      day.householdMin = data.minutes;
      day.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, day);
      
      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', { 
        detail: { date: dateKey, field: 'householdMin', value: data.minutes, source: 'household-step' }
      }));
    },
    xpAction: 'household_logged'
  });

  // =============================================

  // === Экспорт шагов ===
  HEYS.Steps = {
    Weight: WeightStepComponent,
    SleepTime: SleepTimeStepComponent,
    SleepQuality: SleepQualityStepComponent,
    StepsGoal: StepsGoalStepComponent,
    Deficit: DeficitStepComponent,
    Household: HouseholdStepComponent,
    // Утилиты
    getLastKnownWeight,
    getYesterdayWeight,
    getWeightForecast,
    getLastSleepData,
    getWeeklyStepsStats,
    calcSleepHours,
    getCurrentDeficit,
    calcHouseholdKcal,
    getWeeklyHouseholdStats
  };

  console.log('[HEYS] Steps registered: weight, sleepTime, sleepQuality, stepsGoal, deficit, household');

})(typeof window !== 'undefined' ? window : global);
