// heys_steps_v1.js — Библиотека шагов для StepModal
// WeightStep, SleepTimeStep, SleepQualityStep, StepsGoalStep
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.error('heys_steps_v1.js: HEYS.StepModal not found. Load heys_step_modal_v1.js first.');
    return;
  }

  const { WheelPicker, registerStep, utils } = HEYS.StepModal;
  // Используем общие утилиты из StepModal
  const { lsGet: baseLsGet, lsSet: baseLsSet, getTodayKey } = utils;

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const lsGet = (key, def) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, def);
        }
      }
      if (baseLsGet) return baseLsGet(key, def);
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, def);
      return def;
    } catch {
      return def;
    }
  };

  const lsSet = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      if (baseLsSet) {
        baseLsSet(key, value);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch { }
  };

  function resolveDateKey(rawDateKey) {
    const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

    if (isIsoDate(rawDateKey)) return rawDateKey;

    if (rawDateKey instanceof Date && !Number.isNaN(rawDateKey.getTime())) {
      return rawDateKey.toISOString().slice(0, 10);
    }

    if (typeof rawDateKey === 'number') {
      const d = new Date(rawDateKey);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    if (rawDateKey && typeof rawDateKey === 'object') {
      if (isIsoDate(rawDateKey.dateKey)) return rawDateKey.dateKey;
      if (isIsoDate(rawDateKey.date)) return rawDateKey.date;
      if (rawDateKey.value instanceof Date && !Number.isNaN(rawDateKey.value.getTime())) {
        return rawDateKey.value.toISOString().slice(0, 10);
      }
    }

    const today = getTodayKey?.();
    if (isIsoDate(today)) return today;
    return new Date().toISOString().slice(0, 10);
  }

  // ============================================================
  // WEIGHT STEP
  // ============================================================

  function getLastKnownWeight() {
    const profile = lsGet('heys_profile', { weight: 70 });
    const today = new Date();

    // Сначала проверяем сегодняшний вес (для редактирования из карточки)
    const todayKey = today.toISOString().slice(0, 10);
    const todayData = lsGet(`heys_dayv2_${todayKey}`, {}) || {};
    if (todayData.weightMorning) {
      return { weight: todayData.weightMorning, daysAgo: 0, date: todayKey };
    }

    // Если сегодня нет — ищем в прошлых днях (для утреннего чек-ина)
    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
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
    const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
    return dayData.weightMorning || null;
  }

  function getWeightForecast() {
    const weights = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
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

    const prevWeightGRef = useRef(weightG);

    useEffect(() => {
      prevWeightGRef.current = weightG;
    }, [weightG]);

    const setWeightKg = (v) => onChange({ ...data, weightKg: v, weightG: data.weightG ?? weightG });
    const setWeightG = (v) => {
      const prevG = prevWeightGRef.current;
      const currentKg = data.weightKg ?? weightKg;
      let nextKg = currentKg;

      if (prevG === 9 && v === 0) {
        const currentIndex = kgValues.indexOf(currentKg);
        const nextIndex = currentIndex >= 0
          ? (currentIndex + 1) % kgValues.length
          : 0;
        nextKg = kgValues[nextIndex];
      } else if (prevG === 0 && v === 9) {
        const currentIndex = kgValues.indexOf(currentKg);
        const nextIndex = currentIndex >= 0
          ? (currentIndex - 1 + kgValues.length) % kgValues.length
          : kgValues.length - 1;
        nextKg = kgValues[nextIndex];
      }

      prevWeightGRef.current = v;
      onChange({ ...data, weightKg: nextKg, weightG: v });
    };

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
    getInitialData: (context) => {
      // Если есть dateKey в context — берём вес из того дня (для редактирования)
      if (context && context.dateKey) {
        const dayData = lsGet(`heys_dayv2_${context.dateKey}`, {}) || {};
        if (dayData.weightMorning) {
          return {
            weightKg: Math.floor(dayData.weightMorning),
            weightG: Math.round((dayData.weightMorning % 1) * 10)
          };
        }
      }
      // Иначе — последний известный вес
      const last = getLastKnownWeight();
      return {
        weightKg: Math.floor(last.weight),
        weightG: Math.round((last.weight % 1) * 10)
      };
    },
    save: (data, context) => {
      // Используем dateKey из context, или сегодняшний день как fallback
      const dateKey = (context && context.dateKey) || getTodayKey();
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const weight = (data.weightKg || 70) + (data.weightG || 0) / 10;
      dayData.date = dateKey;
      dayData.weightMorning = weight;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);

      // Также обновляем текущий вес в профиле (для расчёта TDEE, BMR и т.д.)
      const profile = lsGet('heys_profile', {});
      if (profile.weight !== weight) {
        profile.weight = weight;
        lsSet('heys_profile', profile);
        console.log('[WeightStep] Profile weight updated:', weight, 'kg');

        // Диспатчим событие для обновления UI профиля
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('heys:profile-updated', {
            detail: { profile, source: 'weight-step' }
          }));
        }
      }

      // Диспатчим событие для обновления UI дня
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'weightMorning', value: weight, forceReload: true }
        }));
      }
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
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
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

  function normalizeDaySleepMinutes(value) {
    if (HEYS.dayUtils?.normalizeDaySleepMinutes) {
      return HEYS.dayUtils.normalizeDaySleepMinutes(value);
    }
    const num = Math.round(Number(value) || 0);
    return num > 0 ? num : 0;
  }

  function getNightSleepHoursFromData(data) {
    return calcSleepHours(data.sleepStartH, data.sleepStartM, data.sleepEndH, data.sleepEndM);
  }

  function getTotalSleepHoursFromData(data) {
    const napHours = normalizeDaySleepMinutes(data.daySleepMinutes) / 60;
    return Math.round((getNightSleepHoursFromData(data) + napHours) * 10) / 10;
  }

  function SleepTimeStepComponent({ data, onChange }) {
    const lastSleep = useMemo(() => getLastSleepData(), []);

    const sleepStartH = data.sleepStartH ?? parseInt(lastSleep.sleepStart.split(':')[0], 10);
    const sleepStartM = data.sleepStartM ?? parseInt(lastSleep.sleepStart.split(':')[1], 10);
    const sleepEndH = data.sleepEndH ?? parseInt(lastSleep.sleepEnd.split(':')[0], 10);
    const sleepEndM = data.sleepEndM ?? parseInt(lastSleep.sleepEnd.split(':')[1], 10);

    const sleepHours = calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM);

    // Используем переиспользуемый TimePicker из StepModal
    const TimePicker = HEYS.StepModal.TimePicker;

    // Helper для форматирования времени
    const pad2 = (n) => String(n).padStart(2, '0');

    // Обновляет данные с форматированными полями для onComplete
    const updateData = (newData) => {
      const startH = newData.sleepStartH ?? sleepStartH;
      const startM = newData.sleepStartM ?? sleepStartM;
      const endH = newData.sleepEndH ?? sleepEndH;
      const endM = newData.sleepEndM ?? sleepEndM;
      const daySleepMinutes = normalizeDaySleepMinutes(newData.daySleepMinutes ?? data.daySleepMinutes);

      onChange({
        ...newData,
        daySleepMinutes,
        // Форматированные поля для onComplete callback
        sleepStart: `${pad2(startH)}:${pad2(startM)}`,
        sleepEnd: `${pad2(endH)}:${pad2(endM)}`,
        sleepHours: Math.round((calcSleepHours(startH, startM, endH, endM) + daySleepMinutes / 60) * 10) / 10
      });
    };

    // Callbacks для времени засыпания
    const setSleepStartH = (h) => {
      updateData({
        ...data,
        sleepStartH: h,
        sleepStartM: data.sleepStartM ?? sleepStartM,
        sleepEndH: data.sleepEndH ?? sleepEndH,
        sleepEndM: data.sleepEndM ?? sleepEndM
      });
    };

    const setSleepStartM = (m) => {
      updateData({
        ...data,
        sleepStartH: data.sleepStartH ?? sleepStartH,
        sleepStartM: m,
        sleepEndH: data.sleepEndH ?? sleepEndH,
        sleepEndM: data.sleepEndM ?? sleepEndM
      });
    };

    // Единый callback для linkedScroll — засыпание
    const setSleepStartTime = (h, m) => {
      updateData({
        ...data,
        sleepStartH: h,
        sleepStartM: m,
        sleepEndH: data.sleepEndH ?? sleepEndH,
        sleepEndM: data.sleepEndM ?? sleepEndM
      });
    };

    // Callbacks для времени пробуждения
    const setSleepEndH = (h) => {
      updateData({
        ...data,
        sleepStartH: data.sleepStartH ?? sleepStartH,
        sleepStartM: data.sleepStartM ?? sleepStartM,
        sleepEndH: h,
        sleepEndM: data.sleepEndM ?? sleepEndM
      });
    };

    const setSleepEndM = (m) => {
      updateData({
        ...data,
        sleepStartH: data.sleepStartH ?? sleepStartH,
        sleepStartM: data.sleepStartM ?? sleepStartM,
        sleepEndH: data.sleepEndH ?? sleepEndH,
        sleepEndM: m
      });
    };

    // Единый callback для linkedScroll — пробуждение
    const setSleepEndTime = (h, m) => {
      updateData({
        ...data,
        sleepStartH: data.sleepStartH ?? sleepStartH,
        sleepStartM: data.sleepStartM ?? sleepStartM,
        sleepEndH: h,
        sleepEndM: m
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
          React.createElement(TimePicker, {
            hours: sleepStartH,
            minutes: sleepStartM,
            onHoursChange: setSleepStartH,
            onMinutesChange: setSleepStartM,
            onTimeChange: setSleepStartTime,
            hoursLabel: '',
            minutesLabel: '',
            display: null,
            linkedScroll: true,
            className: 'mc-time-pickers'
          })
        ),
        React.createElement('div', { className: 'mc-sleep-block' },
          React.createElement('div', { className: 'mc-sleep-label' }, '☀️ Встал'),
          React.createElement(TimePicker, {
            hours: sleepEndH,
            minutes: sleepEndM,
            onHoursChange: setSleepEndH,
            onMinutesChange: setSleepEndM,
            onTimeChange: setSleepEndTime,
            hoursLabel: '',
            minutesLabel: '',
            display: null,
            linkedScroll: true,
            className: 'mc-time-pickers'
          })
        )
      )
    );
  }

  registerStep('sleepTime', {
    title: 'Сон',
    hint: 'Во сколько легли и встали',
    icon: '🛏️',
    component: SleepTimeStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      // Если есть dateKey в context — берём данные из того дня
      if (dateKey) {
        const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
        if (dayData.sleepStart && dayData.sleepEnd) {
          const sleepStartH = parseInt(dayData.sleepStart.split(':')[0], 10);
          const sleepStartM = parseInt(dayData.sleepStart.split(':')[1], 10);
          const sleepEndH = parseInt(dayData.sleepEnd.split(':')[0], 10);
          const sleepEndM = parseInt(dayData.sleepEnd.split(':')[1], 10);
          return {
            sleepStartH,
            sleepStartM,
            sleepEndH,
            sleepEndM,
            daySleepMinutes: normalizeDaySleepMinutes(dayData.daySleepMinutes),
            sleepStart: dayData.sleepStart,
            sleepEnd: dayData.sleepEnd,
            sleepHours: dayData.sleepHours || Math.round((calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM) + normalizeDaySleepMinutes(dayData.daySleepMinutes) / 60) * 10) / 10
          };
        }
      }
      // Иначе — последние данные о сне
      const last = getLastSleepData();
      const sleepStartH = parseInt(last.sleepStart.split(':')[0], 10);
      const sleepStartM = parseInt(last.sleepStart.split(':')[1], 10);
      const sleepEndH = parseInt(last.sleepEnd.split(':')[0], 10);
      const sleepEndM = parseInt(last.sleepEnd.split(':')[1], 10);
      return {
        sleepStartH,
        sleepStartM,
        sleepEndH,
        sleepEndM,
        daySleepMinutes: 0,
        // Форматированные поля для onComplete
        sleepStart: last.sleepStart,
        sleepEnd: last.sleepEnd,
        sleepHours: Math.round(calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM) * 10) / 10
      };
    },
    save: (data, context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const sleepStart = `${String(data.sleepStartH).padStart(2, '0')}:${String(data.sleepStartM).padStart(2, '0')}`;
      const sleepEnd = `${String(data.sleepEndH).padStart(2, '0')}:${String(data.sleepEndM).padStart(2, '0')}`;
      const daySleepMinutes = normalizeDaySleepMinutes(dayData.daySleepMinutes ?? data.daySleepMinutes);
      const sleepHours = calcSleepHours(data.sleepStartH, data.sleepStartM, data.sleepEndH, data.sleepEndM);

      dayData.date = dateKey;
      dayData.sleepStart = sleepStart;
      dayData.sleepEnd = sleepEnd;
      dayData.daySleepMinutes = daySleepMinutes;
      dayData.sleepHours = Math.round((sleepHours + daySleepMinutes / 60) * 10) / 10;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);
      console.info('[HEYS.sleepTime] ✅ Saved:', { dateKey, sleepStart, sleepEnd, daySleepMinutes, sleepHours: dayData.sleepHours });
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'sleep', source: 'sleep-step', forceReload: true }
      }));
    },
    xpAction: 'sleep_logged'
  });

  // ============================================================
  // DAY SLEEP STEP
  // ============================================================

  const DAY_SLEEP_OPTIONS = [0, 15, 20, 30, 45, 60, 90, 120, 150, 180];

  function formatDaySleepLabel(minutes) {
    if (!minutes) return 'Без досыпа';
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours} ч ${mins} мин` : `${hours} ч`;
  }

  function DaySleepStepComponent({ data, onChange }) {
    const selectedMinutes = normalizeDaySleepMinutes(data.daySleepMinutes);
    const nightSleepHours = Number.isFinite(data.nightSleepHours)
      ? Number(data.nightSleepHours)
      : null;
    const totalSleepHours = nightSleepHours == null
      ? selectedMinutes / 60
      : Math.round((nightSleepHours + selectedMinutes / 60) * 10) / 10;

    return React.createElement('div', { className: 'mc-day-sleep-step' },
      React.createElement('div', { className: 'mc-day-sleep-summary' },
        React.createElement('div', { className: 'mc-day-sleep-summary__value' }, formatDaySleepLabel(selectedMinutes)),
        React.createElement('div', { className: 'mc-day-sleep-summary__hint' },
          nightSleepHours == null
            ? 'Укажи, сколько удалось доспать днём'
            : `Итого сна за день: ${totalSleepHours.toFixed(1)} ч`
        )
      ),
      React.createElement('div', { className: 'mc-day-sleep-options' },
        DAY_SLEEP_OPTIONS.map((minutes) => React.createElement('button', {
          key: minutes,
          type: 'button',
          className: `mc-day-sleep-option ${selectedMinutes === minutes ? 'mc-day-sleep-option--active' : ''}`,
          onClick: () => onChange({
            ...data,
            daySleepMinutes: minutes,
            nightSleepHours,
            sleepHours: nightSleepHours == null ? undefined : Math.round((nightSleepHours + minutes / 60) * 10) / 10
          })
        }, formatDaySleepLabel(minutes))
        )
      )
    );
  }

  registerStep('daySleep', {
    title: 'Дневной сон',
    hint: 'Добавь досып за день, если он был',
    icon: '😴',
    component: DaySleepStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const nightSleepHours = HEYS.dayUtils?.getNightSleepHours
        ? HEYS.dayUtils.getNightSleepHours(dayData)
        : ((dayData.sleepStart && dayData.sleepEnd)
          ? Math.round(calcSleepHours(
            parseInt(dayData.sleepStart.split(':')[0], 10),
            parseInt(dayData.sleepStart.split(':')[1], 10),
            parseInt(dayData.sleepEnd.split(':')[0], 10),
            parseInt(dayData.sleepEnd.split(':')[1], 10)
          ) * 10) / 10
          : null);

      return {
        daySleepMinutes: normalizeDaySleepMinutes(dayData.daySleepMinutes),
        nightSleepHours,
        sleepHours: nightSleepHours == null
          ? undefined
          : Math.round((nightSleepHours + normalizeDaySleepMinutes(dayData.daySleepMinutes) / 60) * 10) / 10
      };
    },
    save: (data, context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const daySleepMinutes = normalizeDaySleepMinutes(data.daySleepMinutes);
      const nightSleepHours = HEYS.dayUtils?.getNightSleepHours
        ? HEYS.dayUtils.getNightSleepHours(dayData)
        : ((dayData.sleepStart && dayData.sleepEnd)
          ? Math.round(calcSleepHours(
            parseInt(dayData.sleepStart.split(':')[0], 10),
            parseInt(dayData.sleepStart.split(':')[1], 10),
            parseInt(dayData.sleepEnd.split(':')[0], 10),
            parseInt(dayData.sleepEnd.split(':')[1], 10)
          ) * 10) / 10
          : 0);

      dayData.date = dateKey;
      dayData.daySleepMinutes = daySleepMinutes;
      dayData.sleepHours = Math.round((nightSleepHours + daySleepMinutes / 60) * 10) / 10;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);
      console.info('[HEYS.daySleep] ✅ Saved:', { dateKey, daySleepMinutes, sleepHours: dayData.sleepHours });
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'daySleepMinutes', source: 'day-sleep-step', forceReload: true }
      }));
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
    title: 'Как выспались?',
    hint: '',
    icon: '✨',
    component: SleepQualityStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      // Если есть dateKey в context — берём данные из того дня
      if (dateKey) {
        const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
        if (dayData.sleepQuality !== undefined) {
          return {
            sleepQuality: dayData.sleepQuality,
            sleepNote: ''  // Не предзаполняем заметку — каждый раз новая
          };
        }
      }
      // Иначе — последние данные
      const last = getLastSleepData();
      return {
        sleepQuality: last.sleepQuality || 7,
        sleepNote: ''
      };
    },
    save: (data, context, allStepData) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      dayData.sleepQuality = data.sleepQuality;

      // Убеждаемся, что не затираем данные времени сна из sleepTime-шага
      // (HEYS.store может вернуть закэшированную версию без sleepStart)
      if (allStepData?.sleepTime) {
        const st = allStepData.sleepTime;
        if (st.sleepStart) dayData.sleepStart = st.sleepStart;
        if (st.sleepEnd) dayData.sleepEnd = st.sleepEnd;
        if (st.sleepHours !== undefined) dayData.sleepHours = st.sleepHours;
        if (st.daySleepMinutes !== undefined) dayData.daySleepMinutes = normalizeDaySleepMinutes(st.daySleepMinutes);
      }

      if (data.sleepNote && data.sleepNote.trim()) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const noteWithTime = `[${timeStr}] ${data.sleepNote.trim()}`;
        dayData.sleepNote = dayData.sleepNote
          ? dayData.sleepNote + '\n' + noteWithTime
          : noteWithTime;
      }

      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);
      console.info('[HEYS.sleepQuality] ✅ Saved:', { dateKey, sleepQuality: dayData.sleepQuality, sleepStart: dayData.sleepStart, sleepEnd: dayData.sleepEnd });
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'sleep', source: 'sleep-quality-step', forceReload: true }
      }));
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
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
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

    // Определяем тип дня по цели
    const getDayTypeLabel = () => {
      if (stepsGoal <= 5000) return { emoji: '🛋️', label: 'Малоподвижный день', desc: 'офис, дом, отдых' };
      if (stepsGoal <= 7000) return { emoji: '💼', label: 'Обычный день', desc: 'работа, дела по дому' };
      if (stepsGoal <= 10000) return { emoji: '🚶', label: 'Активный день', desc: 'прогулки, встречи' };
      if (stepsGoal <= 15000) return { emoji: '🏃', label: 'Очень активный день', desc: 'много перемещений' };
      return { emoji: '🏔️', label: 'Максимальная активность', desc: 'поход, экскурсия' };
    };
    const dayType = getDayTypeLabel();

    return React.createElement('div', { className: 'mc-steps-step' },
      // Пояснение зачем нужна цель
      React.createElement('div', { className: 'mc-steps-purpose' },
        React.createElement('div', { className: 'mc-steps-purpose-main' },
          '🎯 Какая активность ждёт тебя сегодня?'
        ),
        React.createElement('div', { className: 'mc-steps-purpose-sub' },
          'Куратор увидит твой план и подстроит рекомендации по питанию'
        )
      ),
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
      // Тип дня — что означает выбранная цель
      React.createElement('div', { className: 'mc-steps-day-type' },
        React.createElement('span', { className: 'mc-steps-day-type-emoji' }, dayType.emoji),
        React.createElement('div', { className: 'mc-steps-day-type-info' },
          React.createElement('span', { className: 'mc-steps-day-type-label' }, dayType.label),
          React.createElement('span', { className: 'mc-steps-day-type-desc' }, dayType.desc)
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
      ),
      // Подсказка внизу
      React.createElement('div', { className: 'mc-steps-footer-hint' },
        '😴 Сон 7-8 часов = меньше тяги к сладкому'
      )
    );
  }

  registerStep('stepsGoal', {
    title: 'Шаги',
    hint: 'Какой день тебя ждёт?',
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
    const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
    if (day.deficitPct !== undefined && day.deficitPct !== null && day.deficitPct !== '') {
      return day.deficitPct;
    }
    const profile = lsGet('heys_profile', {});
    return profile.deficitPctTarget ?? 15;
  }

  /**
   * DeficitStep — Шаг выбора дефицита калорий
   * Диапазон: -20% (дефицит/похудение) до +20% (профицит/набор)
   */
  function DeficitStepComponent({ data, onChange }) {
    const { useMemo, useCallback } = React;

    const deficit = data.deficit ?? 0;

    // Значения для колеса: от -20 до +20
    const deficitValues = useMemo(() => Array.from({ length: 41 }, (_, i) => i - 20), []);

    // Получаем цвет и описание в зависимости от значения
    const getDeficitInfo = useCallback((val) => {
      if (val < -10) return { color: '#ef4444', label: 'Агрессивный дефицит', emoji: '🔥🔥' };
      if (val < 0) return { color: '#f97316', label: 'Умеренный дефицит', emoji: '🔥' };
      if (val === 0) return { color: '#22c55e', label: 'Поддержание веса', emoji: '⚖️' };
      if (val <= 10) return { color: '#3b82f6', label: 'Умеренный профицит', emoji: '💪' };
      return { color: '#3b82f6', label: 'Агрессивный набор', emoji: '💪💪' };
    }, []);

    const info = getDeficitInfo(deficit);

    const setDeficit = (v) => {
      onChange({ ...data, deficit: v });
      if (navigator.vibrate) navigator.vibrate(5);
    };

    // Форматирование значения для отображения в колесе
    const formatValue = (v) => (v > 0 ? '+' : '') + v + '%';

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

      // WheelPicker вместо слайдера
      React.createElement('div', { className: 'deficit-wheel-container' },
        React.createElement(WheelPicker, {
          values: deficitValues,
          value: deficit,
          onChange: setDeficit,
          label: '%',
          formatValue: formatValue
        })
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
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
      day.deficitPct = data.deficit;
      day.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, day);

      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'deficitPct', value: data.deficit, source: 'deficit-step', forceReload: true }
      }));
    }
  });

  // =============================================
  // ШАГ 6: БЫТОВАЯ АКТИВНОСТЬ (Household)
  // =============================================

  /**
   * Примеры бытовой активности с MET коэффициентами
   * (активность на ногах БЕЗ движения — шаги считаем отдельно браслетом)
   */
  const HOUSEHOLD_EXAMPLES = [
    { icon: '🧹', name: 'Уборка', met: 3.0, minutes: 30 },
    { icon: '👶', name: 'Игры с детьми', met: 3.5, minutes: 40 },
    { icon: '🏢', name: 'Работа стоя', met: 2.0, minutes: 25 },
    { icon: '🍳', name: 'Готовка', met: 2.5, minutes: 30 },
    { icon: '🔧', name: 'Дом. дела', met: 3.5, minutes: 35 }
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

  // Получить историю бытовой активности за N дней (минуты)
  function getHouseholdHistory(days = 7) {
    const result = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
      const min = Number(dayData.householdMin) || 0;
      result.push({ date: key, minutes: min });
    }
    return result;
  }

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
    const history = getHouseholdHistory(7);
    const nonZero = history.filter(h => h.minutes > 0).map(h => h.minutes);
    if (nonZero.length === 0) return { avg: 0, daysWithData: 0, trend: 'none', history };
    const avg = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
    const trend = nonZero.length >= 3 ? (nonZero[0] > nonZero[2] ? 'up' : nonZero[0] < nonZero[2] ? 'down' : 'stable') : 'none';
    return { avg, daysWithData: nonZero.length, trend, history };
  }

  // Месячные метрики и streak подряд (дни >=30 мин)
  function getHouseholdMonthlyStats() {
    const history30 = getHouseholdHistory(30);
    const total30 = history30.reduce((a, b) => a + b.minutes, 0);
    let streak = 0;
    for (let i = 0; i < history30.length; i++) {
      if (history30[i].minutes >= 30) streak += 1; else break;
    }
    return { total30, streak, history30 };
  }

  /**
   * HouseholdStep — Шаг 1: Минуты + время (ввод данных)
   */
  function HouseholdMinutesComponent({ data, onChange, context }) {
    const { useCallback, useMemo } = React;

    const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
    const minutes = data.minutes ?? 0;
    const householdTime = data.householdTime ?? '';

    // Получаем вес для расчёта калорий
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = profile.weight || 70;
    const kcalBurned = calcHouseholdKcal(minutes, weight);

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

    // Парсим время для TimePicker (числа)
    const [currentHour, currentMinute] = useMemo(() => {
      if (householdTime) {
        const [h, m] = householdTime.split(':').map(Number);
        return [h || 0, Math.floor((m || 0) / 5) * 5];
      }

      const now = new Date();
      const roundedMinutes = Math.floor(now.getMinutes() / 5) * 5;
      return [now.getHours(), roundedMinutes];
    }, [householdTime]);

    // Используем переиспользуемый TimePicker из StepModal
    const TimePicker = HEYS.StepModal.TimePicker;
    const pad2 = HEYS.StepModal.pad2;

    // Haptic уже в TimePicker
    const setHour = (h) => {
      const newTime = `${pad2(h)}:${pad2(currentMinute)}`;
      onChange({ ...data, householdTime: newTime });
    };

    const setMinute = (m) => {
      const newTime = `${pad2(currentHour)}:${pad2(m)}`;
      onChange({ ...data, householdTime: newTime });
    };

    // Единый callback для linkedScroll
    const setTime = (h, m) => {
      const newTime = `${pad2(h)}:${pad2(m)}`;
      onChange({ ...data, householdTime: newTime });
    };

    return React.createElement('div', { className: 'step-household step-household-minutes' },
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
          React.createElement('span', null, '1.5ч'),
          React.createElement('span', null, '2ч'),
          React.createElement('span', null, '2.5ч'),
          React.createElement('span', null, '3ч')
        )
      ),

      // Быстрые пресеты
      React.createElement('div', { className: 'household-presets' },
        HOUSEHOLD_PRESETS.map(p =>
          React.createElement('button', {
            key: p.value,
            type: 'button',
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

      // Секция времени (компактная)
      React.createElement('div', { className: 'household-time-section' },
        React.createElement('div', { className: 'household-time-header' },
          React.createElement('span', { className: 'household-time-label' }, '⏰ Когда была активность?'),
          householdTime && React.createElement('span', { className: 'household-time-value-small' }, householdTime)
        ),
        React.createElement(TimePicker, {
          hours: currentHour,
          minutes: currentMinute,
          onHoursChange: setHour,
          onMinutesChange: setMinute,
          onTimeChange: setTime,
          hoursLabel: '',
          minutesLabel: '',
          display: null,
          linkedScroll: true,
          className: 'household-time-pickers compact'
        }),
        householdTime && React.createElement('button', {
          type: 'button',
          className: 'household-time-clear',
          onClick: () => {
            triggerHaptic(5);
            onChange({ ...data, householdTime: '' });
          }
        }, '✕ Сбросить')
      )
    );
  }

  /**
   * HouseholdStatsStep — Шаг 2: Статистика + график + бейджи (обратная связь)
   * Получает данные от первого шага через stepData.household_minutes
   */
  function HouseholdStatsComponent({ data, onChange, context, stepData }) {
    const { useMemo } = React;

    // Берём данные от первого шага (household_minutes) — они актуальные
    const minutesData = stepData?.household_minutes || data || {};
    const minutes = minutesData.minutes ?? 0;
    const householdTime = minutesData.householdTime ?? '';
    const todayKey = new Date().toISOString().slice(0, 10);

    // Получаем вес для расчёта калорий
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = profile.weight || 70;
    const kcalBurned = calcHouseholdKcal(minutes, weight);

    // Статистика за неделю и месяц
    const weeklyStats = useMemo(() => getWeeklyHouseholdStats(), []);
    const monthlyStats = useMemo(() => getHouseholdMonthlyStats(), []);
    const history7 = weeklyStats.history || getHouseholdHistory(7);

    // Для спарклайна
    const targetMin = 30;
    const maxSpark = Math.max(...history7.map(h => h.minutes), 90);
    const sparkBars = history7.slice().reverse();

    // Бэйджи достижений
    const showStreakBadge = monthlyStats.streak >= 3;
    const showMonthlyBadge = monthlyStats.total30 >= 500;

    // Цвет
    const getColor = (min) => {
      if (min === 0) return '#94a3b8';
      if (min < 30) return '#eab308';
      if (min < 60) return '#22c55e';
      return '#10b981';
    };
    const color = getColor(minutes);

    return React.createElement('div', { className: 'step-household step-household-stats' },
      // Сводка: что введено
      React.createElement('div', { className: 'household-summary' },
        React.createElement('div', { className: 'household-summary-main' },
          React.createElement('span', { className: 'household-summary-value', style: { color } }, minutes + ' мин'),
          householdTime && React.createElement('span', { className: 'household-summary-time' }, ' в ' + householdTime),
          kcalBurned > 0 && React.createElement('span', { className: 'household-summary-kcal' }, ' • 🔥 ' + kcalBurned + ' ккал')
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

      // Спарклайн 7 дней
      React.createElement('div', { className: 'household-spark' },
        React.createElement('div', { className: 'household-spark-values' },
          sparkBars.map((h) => {
            const isToday = h.date === todayKey;
            return React.createElement('span', { key: h.date, className: isToday ? 'today' : '' },
              h.minutes > 0 ? `${h.minutes}` : '—'
            );
          })
        ),
        React.createElement('div', { className: 'household-spark-bars' },
          sparkBars.map((h) => {
            const isToday = h.date === todayKey;
            return React.createElement('div', {
              key: h.date,
              className: 'household-spark-bar' + (isToday ? ' today' : ''),
              title: `${h.date}: ${h.minutes} мин`,
              style: { height: `${Math.max(10, (h.minutes / maxSpark) * 100)}%`, background: h.minutes >= targetMin ? '#10b981' : '#e5e7eb' }
            });
          })
        ),
        React.createElement('div', { className: 'household-spark-labels' },
          sparkBars.map((h) => {
            const isToday = h.date === todayKey;
            return React.createElement('span', { key: h.date, className: isToday ? 'today' : '' }, h.date.slice(8));
          })
        )
      ),

      // Бэйджи достижений
      (showStreakBadge || showMonthlyBadge) && React.createElement('div', { className: 'household-badges' },
        showStreakBadge && React.createElement('span', { className: 'household-badge success' }, '🏅 ' + monthlyStats.streak + ' дней подряд ≥30 мин'),
        showMonthlyBadge && React.createElement('span', { className: 'household-badge info' }, '📆 ' + monthlyStats.total30 + ' мин за месяц')
      ),

      // Примеры активности (для справки)
      React.createElement('div', { className: 'household-examples' },
        React.createElement('div', { className: 'household-examples-title' }, '💡 Примеры бытовой активности:'),
        React.createElement('div', { className: 'household-examples-grid' },
          HOUSEHOLD_EXAMPLES.slice(0, 6).map((ex, i) =>
            React.createElement('span', {
              key: i,
              className: 'household-example readonly',
              title: `MET: ${ex.met}`
            }, ex.icon + ' ' + ex.name)
          )
        )
      )
    );
  }

  // Регистрация шага 1: Минуты бытовой активности
  registerStep('household_minutes', {
    title: 'Бытовая активность',
    hint: 'Сколько минут?',
    icon: '🏠',
    component: HouseholdMinutesComponent,
    getInitialData: (ctx) => {
      console.log('[Household getInitialData] ctx:', ctx);
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const editIndex = ctx?.editIndex ?? null;
      console.log('[Household getInitialData] dateKey:', dateKey, 'editIndex:', editIndex);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      console.log('[Household getInitialData] day:', day);
      console.log('[Household getInitialData] day.householdActivities:', day.householdActivities);
      console.log('[Household getInitialData] day.householdMin:', day.householdMin);
      const weekly = getWeeklyHouseholdStats();

      // Backward compatible: householdActivities массив или legacy householdMin
      const activities = day.householdActivities ||
        (day.householdMin > 0 ? [{ minutes: day.householdMin, time: day.householdTime || '' }] : []);
      console.log('[Household getInitialData] activities:', activities);

      // Если редактируем существующую — берём её данные
      if (editIndex !== null && editIndex >= 0 && activities[editIndex]) {
        const activity = activities[editIndex];
        console.log('[Household getInitialData] EDIT MODE - activity:', activity);
        return {
          minutes: activity.minutes || 0,
          householdTime: activity.time || '',
          dateKey,
          editIndex
        };
      }

      console.log('[Household getInitialData] ADD MODE - using defaults');
      // Добавление новой — дефолтные значения
      return { minutes: weekly.avg || 30, householdTime: '', dateKey, editIndex: null };
    },
    save: (data) => {
      console.log('[Household save] data:', data);
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const editIndex = data.editIndex;
      console.log('[Household save] editIndex:', editIndex, 'typeof:', typeof editIndex);
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
      console.log('[Household save] day.householdActivities:', day.householdActivities);

      // Инициализируем массив если его нет
      if (!day.householdActivities) {
        // Миграция старых данных
        if (day.householdMin > 0) {
          day.householdActivities = [{ minutes: day.householdMin, time: day.householdTime || '' }];
        } else {
          day.householdActivities = [];
        }
      }

      const newActivity = { minutes: data.minutes, time: data.householdTime || '' };

      if (typeof editIndex === 'number' && editIndex >= 0 && editIndex < day.householdActivities.length) {
        // Редактирование существующей
        day.householdActivities[editIndex] = newActivity;
      } else {
        // Добавление новой
        day.householdActivities.push(newActivity);
      }

      // Обновляем legacy поля для совместимости
      day.householdMin = day.householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
      day.householdTime = day.householdActivities[0]?.time || '';
      day.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, day);

      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'householdActivities',
          value: day.householdActivities,
          householdMin: day.householdMin,
          householdTime: day.householdTime,
          source: 'household-step',
          forceReload: true
        }
      }));

      if (typeof window !== 'undefined' && data.minutes > 0) {
        window.dispatchEvent(new CustomEvent('heysHouseholdActivityAdded', {
          detail: { minutes: data.minutes, date: dateKey }
        }));
      }
    },
    xpAction: 'household_logged'
  });

  // Регистрация шага 2: Статистика бытовой активности (read-only)
  registerStep('household_stats', {
    title: 'Статистика',
    hint: 'Ваш прогресс',
    icon: '📊',
    component: HouseholdStatsComponent,
    canSkip: true,
    skipLabel: 'Готово',
    getInitialData: (ctx, prevData) => {
      // Получаем данные от предыдущего шага (household_minutes)
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      // Приоритет: данные от предыдущего шага > данные из storage
      const minutes = prevData?.minutes ?? day.householdMin ?? 0;
      const householdTime = prevData?.householdTime ?? day.householdTime ?? '';
      return { minutes, householdTime, dateKey };
    }
    // НЕТ save — это read-only шаг для показа статистики
  });

  // Регистрация комбинированного шага (для обратной совместимости)
  registerStep('household', {
    title: 'Бытовая активность',
    hint: 'Время на ногах помимо тренировок',
    icon: '🏠',
    component: HouseholdMinutesComponent,  // Показываем только минуты в старом режиме
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const weekly = getWeeklyHouseholdStats();
      const minutes = day.householdMin || weekly.avg || 0;
      const householdTime = day.householdTime || '';
      return { minutes, householdTime, dateKey };
    },
    save: (data) => {
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
      day.householdMin = data.minutes;
      day.householdTime = data.householdTime || '';
      day.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, day);

      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'householdMin', value: data.minutes, householdTime: data.householdTime, source: 'household-step' }
      }));

      if (typeof window !== 'undefined' && data.minutes > 0) {
        window.dispatchEvent(new CustomEvent('heysHouseholdActivityAdded', {
          detail: { minutes: data.minutes, date: dateKey }
        }));
      }
    },
    xpAction: 'household_logged'
  });

  // ============================================================
  // CYCLE STEP — Особый период (менструальный цикл)
  // ============================================================

  /**
   * Проверка: нужно ли показывать шаг cycle?
   * Показываем если:
   * 1. В профиле cycleTrackingEnabled = true
   */
  function shouldShowCycleStep() {
    try {
      const profile = lsGet('heys_profile', {});
      return profile.cycleTrackingEnabled === true;
    } catch {
      return false;
    }
  }

  /**
   * Компонент шага "Особый период" (v2 — с автоматическим проставлением)
   * Показывается только для женщин (проверка из stepData или профиля)
   */
  function CycleStepComponent({ data, onChange, stepData, context }) {
    const { useState, useCallback, useEffect } = React;

    // Проверяем пол: из stepData (регистрация) или из профиля
    const genderFromSteps = stepData?.['profile-personal']?.gender;
    const profile = lsGet('heys_profile', {});
    const gender = genderFromSteps || profile.gender;
    const isFemale = gender === 'Женский';

    // Также проверяем cycleTrackingEnabled из шагов или профиля
    const trackingFromSteps = stepData?.['profile-personal']?.cycleTrackingEnabled;
    const cycleTrackingEnabled = trackingFromSteps !== undefined ? trackingFromSteps : profile.cycleTrackingEnabled;

    // Если не женщина или трекинг выключен — автоматически пропускаем шаг
    const shouldSkip = !isFemale || cycleTrackingEnabled === false;

    // cycleDay: null = нет периода, 1-7 = день периода
    const [cycleDay, setCycleDay] = useState(data?.cycleDay || null);
    const [isEnabled, setIsEnabled] = useState(cycleDay !== null);
    const [showDayPicker, setShowDayPicker] = useState(false);

    // Получаем текущую дату
    const dateKey = data?._dateKey || new Date().toISOString().slice(0, 10);

    // Автопропуск если не нужен этот шаг
    useEffect(() => {
      if (shouldSkip && context?.onNext) {
        // Небольшая задержка чтобы не было мигания
        const timer = setTimeout(() => {
          onChange({ cycleDay: null, _skipped: true });
          context.onNext();
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [shouldSkip, context, onChange]);

    // Если должны пропустить — показываем заглушку
    if (shouldSkip) {
      return React.createElement('div', { className: 'mc-cycle-step mc-cycle-skip' },
        React.createElement('div', { className: 'mc-cycle-header' },
          React.createElement('span', { className: 'mc-cycle-icon' }, '🌸'),
          React.createElement('span', { className: 'mc-cycle-title' }, 'Пропускаем...')
        )
      );
    }

    // Обработчик toggle "Да/Нет"
    const handleToggle = useCallback(() => {
      const newEnabled = !isEnabled;
      setIsEnabled(newEnabled);
      if (newEnabled) {
        // Включаем — показываем выбор дня
        setShowDayPicker(true);
      } else {
        // Выключаем — сбрасываем и очищаем все связанные дни
        setCycleDay(null);
        onChange({ cycleDay: null });
        setShowDayPicker(false);

        // Очищаем связанные дни
        if (HEYS.Cycle?.clearCycleDays) {
          HEYS.Cycle.clearCycleDays(dateKey, lsGet, lsSet);
        }
      }
    }, [isEnabled, onChange, dateKey]);

    // Выбор дня с автоматическим проставлением всех 7 дней
    const selectDay = useCallback((day) => {
      setCycleDay(day);
      onChange({ cycleDay: day });
      setShowDayPicker(false);

      // Автоматически проставляем все 7 дней
      if (HEYS.Cycle?.setCycleDaysAuto) {
        const result = HEYS.Cycle.setCycleDaysAuto(dateKey, day, lsGet, lsSet);
        console.log('[Cycle Step] Auto-filled', result.updated, 'days');
      }
    }, [onChange, dateKey]);

    // Быстрые опции
    const quickOptions = [
      { day: 1, label: 'Первый день', hint: 'Только начался' },
      { day: 2, label: 'Второй день', hint: '' },
      { day: 3, label: 'Третий день', hint: '' },
      { day: 4, label: 'Середина', hint: '4-5 день' },
      { day: 6, label: 'Почти конец', hint: '6-7 день' }
    ];

    return React.createElement('div', { className: 'mc-cycle-step' },
      // Вопрос — чтобы было понятно о чём спрашиваем
      React.createElement('div', { className: 'mc-cycle-question' },
        'Сегодня особые дни?'
      ),

      // Заголовок с toggle
      React.createElement('div', { className: 'mc-cycle-header' },
        React.createElement('div', { className: 'mc-cycle-header-left' },
          React.createElement('span', { className: 'mc-cycle-icon' }, '🌸'),
          React.createElement('span', { className: 'mc-cycle-title' }, 'Особые дни')
        ),
        // Toggle кнопка
        React.createElement('button', {
          type: 'button',
          className: 'mc-cycle-toggle ' + (isEnabled ? 'active' : ''),
          onClick: handleToggle,
          'aria-pressed': isEnabled
        }, isEnabled ? 'Да' : 'Нет')
      ),

      // Если включено и есть день — показываем текущий статус
      isEnabled && cycleDay && !showDayPicker && React.createElement('div', { className: 'mc-cycle-status' },
        React.createElement('div', { className: 'mc-cycle-status-main' },
          React.createElement('span', { className: 'mc-cycle-status-day' }, 'День ' + cycleDay),
          React.createElement('span', { className: 'mc-cycle-status-info' },
            cycleDay <= 3 ? 'Начало периода' :
              cycleDay <= 5 ? 'Середина периода' :
                'Конец периода'
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'mc-cycle-change-btn',
          onClick: () => setShowDayPicker(true)
        }, 'Изменить')
      ),

      // Выпадашка выбора дня
      isEnabled && showDayPicker && React.createElement('div', { className: 'mc-cycle-picker' },
        React.createElement('div', { className: 'mc-cycle-picker-title' },
          'Какой сегодня день?'
        ),

        // Быстрые опции
        React.createElement('div', { className: 'mc-cycle-options' },
          quickOptions.map(opt =>
            React.createElement('button', {
              key: opt.day,
              type: 'button',
              className: 'mc-cycle-option ' + (cycleDay === opt.day ? 'active' : ''),
              onClick: () => selectDay(opt.day)
            },
              React.createElement('span', { className: 'mc-cycle-option-day' }, opt.day),
              React.createElement('span', { className: 'mc-cycle-option-label' }, opt.label),
              opt.hint && React.createElement('span', { className: 'mc-cycle-option-hint' }, opt.hint)
            )
          )
        ),

        // Точный выбор дня (1-7)
        React.createElement('div', { className: 'mc-cycle-exact' },
          React.createElement('span', { className: 'mc-cycle-exact-label' }, 'Точный день:'),
          React.createElement('div', { className: 'mc-cycle-exact-days' },
            [1, 2, 3, 4, 5, 6, 7].map(d =>
              React.createElement('button', {
                key: d,
                type: 'button',
                className: 'mc-cycle-exact-btn ' + (cycleDay === d ? 'active' : ''),
                onClick: () => selectDay(d)
              }, d)
            )
          )
        ),

        // Подсказка об автозаполнении
        React.createElement('div', { className: 'mc-cycle-auto-hint' },
          React.createElement('span', { className: 'mc-cycle-hint-icon' }, '✨'),
          React.createElement('span', { className: 'mc-cycle-hint-text' },
            'Дни 1-7 проставятся автоматически'
          )
        )
      ),

      // Если выключено — подсказка
      !isEnabled && React.createElement('div', { className: 'mc-cycle-disabled-hint' },
        'Отмечайте для адаптированных рекомендаций'
      )
    );
  }

  // Регистрация шага особого периода
  registerStep('cycle', {
    title: 'Особый период',
    hint: 'Адаптация норм',
    icon: '🌸',
    component: CycleStepComponent,
    canSkip: true,
    // shouldShow — проверяем, включён ли tracking в профиле
    shouldShow: shouldShowCycleStep,
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      return {
        cycleDay: day.cycleDay || null,
        _dateKey: dateKey
      };
    },
    save: (data) => {
      const dateKey = data._dateKey || new Date().toISOString().slice(0, 10);
      const cycleDay = data.cycleDay;

      // Используем автоматическое проставление 7 дней
      if (cycleDay != null && cycleDay >= 1 && cycleDay <= 7) {
        // setCycleDaysAuto проставит дни 1-7 автоматически
        if (HEYS.Cycle && HEYS.Cycle.setCycleDaysAuto) {
          HEYS.Cycle.setCycleDaysAuto(dateKey, cycleDay, lsGet, lsSet);
        } else {
          // Fallback: просто сохраняем один день
          const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
          day.cycleDay = cycleDay;
          day.updatedAt = Date.now();
          lsSet(`heys_dayv2_${dateKey}`, day);
        }
      } else if (cycleDay === null) {
        // Очищаем все связанные дни цикла
        if (HEYS.Cycle && HEYS.Cycle.clearCycleDays) {
          HEYS.Cycle.clearCycleDays(dateKey, lsGet, lsSet);
        } else {
          // Fallback: очищаем только текущий день
          const day = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) || { date: dateKey };
          day.cycleDay = null;
          day.updatedAt = Date.now();
          lsSet(`heys_dayv2_${dateKey}`, day);
        }
      }

      // Триггер облачной синхронизации
      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'cycle' }
      }));

      // Уведомляем DayTab о изменении
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'cycleDay',
          value: data.cycleDay,
          source: 'cycle-step',
          updatedAt: Date.now()
        }
      }));
    },
    xpAction: 'cycle_logged'
  });

  // ============================================================
  // MEASUREMENTS STEP — Замеры тела (обхваты: талия, бёдра, бедро, бицепс)
  // ============================================================

  const MEASUREMENT_FIELDS = [
    { key: 'waist', label: 'Обхват талии', icon: '📏', hint: 'На уровне пупка', min: 40, max: 150, hasSide: false },
    { key: 'hips', label: 'Обхват бёдер', icon: '🍑', hint: 'По ягодицам', min: 60, max: 150, hasSide: false },
    { key: 'thigh', label: 'Обхват бедра', icon: '🦵', hint: 'Одна сторона', min: 30, max: 100, hasSide: true },
    { key: 'biceps', label: 'Обхват бицепса', icon: '💪', hint: 'В напряжении', min: 20, max: 60, hasSide: true }
  ];

  // Сохранённая сторона (левая/правая) — запоминаем выбор
  const MEASUREMENT_SIDE_KEY = 'heys_measurement_side';
  function getMeasurementSide() {
    try { return lsGet(MEASUREMENT_SIDE_KEY, 'right'); } catch { return 'right'; }
  }
  function setMeasurementSide(side) {
    try { lsSet(MEASUREMENT_SIDE_KEY, side); } catch { }
  }

  /**
   * Поиск последних замеров за 60 дней
   */
  function getLastMeasurements() {
    const today = new Date();
    for (let i = 0; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, null);
      if (!dayData || typeof dayData !== 'object') continue;
      const m = dayData.measurements;
      if (m && m.measuredAt && (m.waist || m.hips || m.thigh || m.biceps)) {
        return {
          ...m,
          daysAgo: i,
          foundDate: key
        };
      }
    }
    return {
      waist: null,
      hips: null,
      thigh: null,
      biceps: null,
      measuredAt: null,
      daysAgo: null,
      foundDate: null
    };
  }

  function getLastMeasurementByField(field) {
    const today = new Date();
    for (let i = 0; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
      const m = dayData.measurements;
      if (m && m.measuredAt && m[field]) {
        return { value: m[field], date: key, daysAgo: i };
      }
    }
    return { value: null, date: null, daysAgo: null };
  }

  function getMeasurementsHistory(days = 30) {
    const today = new Date();
    const list = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, null);
      // Защита от null/undefined
      if (!dayData || typeof dayData !== 'object') continue;
      const m = dayData.measurements;
      if (m && m.measuredAt) {
        list.push({ date: key, ...m });
      }
    }
    return list;
  }

  /**
   * Проверка: нужно ли показывать шаг замеров (прошло ≥7 дней)
   */
  function shouldShowMeasurements() {
    const last = getLastMeasurements();
    if (!last.measuredAt) return true; // Нет данных → показываем
    // Если прошлый замер был неполным — продолжаем показывать
    if (last.waist && (!last.hips || !last.thigh || !last.biceps)) return true;

    const lastDate = new Date(last.measuredAt);
    const today = new Date();
    const diffMs = today - lastDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays >= 7;
  }

  function MeasurementsStepComponent({ data, onChange }) {
    const lastMeasurements = useMemo(() => getLastMeasurements(), []);

    // Сторона измерения (левая/правая)
    const [side, setSideState] = useState(() => getMeasurementSide());
    const setSide = (newSide) => {
      setSideState(newSide);
      setMeasurementSide(newSide);
    };

    // Локальный текстовый state для инпутов — инициализируем из data
    const [inputValues, setInputValues] = useState(() => {
      const init = {};
      MEASUREMENT_FIELDS.forEach(f => {
        if (data[f.key] !== null && data[f.key] !== undefined) {
          init[f.key] = String(data[f.key]);
        }
      });
      return init;
    });

    const lastByField = useMemo(() => {
      const res = {};
      MEASUREMENT_FIELDS.forEach((f) => {
        res[f.key] = getLastMeasurementByField(f.key);
      });
      return res;
    }, []);

    // Получаем значение: из локального state
    const getInputValue = (key) => {
      return inputValues[key] ?? '';
    };

    const handleInputChange = (key, textValue) => {
      // Сохраняем текст как есть (для нормального ввода)
      setInputValues(prev => ({ ...prev, [key]: textValue }));

      // Парсим число и обновляем данные
      const cleaned = textValue.replace(',', '.');
      if (cleaned === '' || cleaned === '.') {
        onChange({ ...data, [key]: null });
      } else {
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          onChange({ ...data, [key]: num });
        }
      }
    };

    const handleFocus = (key, e) => {
      // При фокусе выделяем всё
      e.target.select();
    };

    const lastMeasuredInfo = lastMeasurements.measuredAt
      ? `Последний замер: ${lastMeasurements.daysAgo === 0 ? 'сегодня' : lastMeasurements.daysAgo === 1 ? 'вчера' : lastMeasurements.daysAgo + ' дн. назад'}`
      : 'Первый замер';

    return React.createElement('div', { className: 'mc-measurements-step' },
      React.createElement('div', { className: 'mc-measurements-info' },
        React.createElement('span', { className: 'mc-measurements-info-icon' }, '📅'),
        React.createElement('span', { className: 'mc-measurements-info-text' }, lastMeasuredInfo)
      ),

      React.createElement('div', { className: 'mc-measurements-fields' },
        MEASUREMENT_FIELDS.map(field => {
          const numValue = data[field.key];
          const last = lastByField[field.key];
          const placeholder = last.value ? String(last.value) : '—';
          const delta = last.value && numValue ? numValue - last.value : null;
          const deltaPct = (last.value && numValue) ? (numValue - last.value) / last.value : null;
          const showWarning = deltaPct !== null && Math.abs(deltaPct) > 0.15;
          const progressLabel = last.value && numValue ? `${delta > 0 ? '+' : ''}${(Math.round(delta * 10) / 10)} см` : null;

          return React.createElement('div', {
            key: field.key,
            className: 'mc-measurement-field'
          },
            React.createElement('div', { className: 'mc-measurement-header' },
              React.createElement('span', { className: 'mc-measurement-icon' }, field.icon),
              React.createElement('span', { className: 'mc-measurement-label' }, field.label),
              last.value && React.createElement('span', { className: 'mc-measurement-prev' }, `было: ${last.value}`)
            ),
            React.createElement('div', { className: 'mc-measurement-input-row' },
              React.createElement('input', {
                type: 'text',
                inputMode: 'decimal',
                pattern: '[0-9]*\\.?[0-9]*',
                className: 'mc-measurement-input',
                value: getInputValue(field.key),
                placeholder,
                onFocus: (e) => handleFocus(field.key, e),
                onChange: (e) => handleInputChange(field.key, e.target.value)
              }),
              React.createElement('span', { className: 'mc-measurement-unit' }, 'см'),
              progressLabel && React.createElement('span', {
                className: 'mc-measurement-delta' + (delta > 0 ? ' up' : delta < 0 ? ' down' : '')
              }, progressLabel)
            ),
            !last.value && React.createElement('div', { className: 'mc-measurement-no-data' }, 'Первый замер'),
            showWarning && React.createElement('div', { className: 'mc-measurement-warning', role: 'alert' }, '⚠️ Проверьте ввод'),
            // Хинт + индикатор стороны для бедра/бицепса
            React.createElement('div', { className: 'mc-measurement-hint' },
              field.hasSide
                ? `${field.hint} (${side === 'left' ? 'левая' : 'правая'})`
                : field.hint
            )
          );
        })
      ),

      // Переключатель стороны (только если есть поля с hasSide)
      MEASUREMENT_FIELDS.some(f => f.hasSide) && React.createElement('div', { className: 'mc-measurements-side-toggle' },
        React.createElement('span', { className: 'mc-measurements-side-label' }, 'Сторона замера:'),
        React.createElement('div', { className: 'mc-measurements-side-buttons' },
          React.createElement('button', {
            type: 'button',
            className: 'mc-measurements-side-btn' + (side === 'left' ? ' active' : ''),
            onClick: () => setSide('left')
          }, '← Левая'),
          React.createElement('button', {
            type: 'button',
            className: 'mc-measurements-side-btn' + (side === 'right' ? ' active' : ''),
            onClick: () => setSide('right')
          }, 'Правая →')
        )
      ),

      React.createElement('div', { className: 'mc-measurements-tip' },
        React.createElement('span', { className: 'mc-measurements-tip-icon' }, '💡'),
        React.createElement('span', { className: 'mc-measurements-tip-text' },
          'Мерьте утром, одна сторона, без одежды'
        )
      )
    );
  }

  // Регистрация шага замеров
  registerStep('measurements', {
    title: 'Замеры тела',
    hint: 'Еженедельный контроль',
    icon: '📏',
    component: MeasurementsStepComponent,
    canSkip: true,  // Можно пропустить
    getInitialData: (context = {}) => {
      // Используем дату из context или сегодня
      const dateKey = context.dateKey || getTodayKey();

      // Используем lsGet — он:
      // 1. Работает со scoped-ключами (clientId)
      // 2. Декомпрессирует данные (¤Z¤ prefix)
      // 3. Синхронизирован с облаком через HEYS.store
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});

      const m = dayData?.measurements || {};
      return {
        waist: m.waist ?? null,
        hips: m.hips ?? null,
        thigh: m.thigh ?? null,
        biceps: m.biceps ?? null,
        _dateKey: dateKey // Передаём дату для save
      };
    },
    save: (data) => {
      // Используем дату из data._dateKey (переданную из getInitialData) или сегодня
      const dateKey = data._dateKey || getTodayKey();
      const dayData = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });
      const hasData = ['waist', 'hips', 'thigh', 'biceps'].some(k => data[k] !== null && data[k] !== undefined && !Number.isNaN(data[k]));

      if (hasData) {
        const newUpdatedAt = Date.now();
        dayData.measurements = {
          waist: data.waist ?? null,
          hips: data.hips ?? null,
          thigh: data.thigh ?? null,
          biceps: data.biceps ?? null,
          measuredAt: dateKey
        };
        dayData.updatedAt = newUpdatedAt;
        lsSet(`heys_dayv2_${dateKey}`, dayData);

        // Триггер облачной синхронизации
        window.dispatchEvent(new CustomEvent('heys:data-saved', {
          detail: { key: `day:${dateKey}`, type: 'measurements' }
        }));

        // Уведомляем DayTab о изменении (с forceReload)
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: {
            date: dateKey,
            field: 'measurements',
            value: dayData.measurements,
            source: 'measurements-step',
            updatedAt: newUpdatedAt,
            forceReload: true
          }
        }));
      }
    },
    xpAction: 'measurements_logged'
  });

  // ============================================================
  // COLD EXPOSURE STEP — 🧊 Холодовое воздействие
  // v3.2.1: Улучшает инсулиновую чувствительность на ~5-12%
  // v3.3.0: Добавлены 3 слайдера оценок (mood, wellbeing, stress)
  // ============================================================

  const COLD_TYPES = [
    { id: 'none', icon: '🚿', label: 'Нет', desc: 'Обычный душ' },
    { id: 'coldShower', icon: '🧊', label: 'Холодный душ', desc: '2-3 мин, -5% волна' },
    { id: 'coldBath', icon: '🛁', label: 'Холодная ванна', desc: '10+ мин, -10% волна' },
    { id: 'coldSwim', icon: '🏊', label: 'Моржевание', desc: '5+ мин, -12% волна' }
  ];

  // Emoji для оценок холода
  const COLD_MOOD_EMOJI = ['😢', '😢', '😕', '😕', '😐', '😐', '🙂', '🙂', '😊', '😊', '😄'];
  const COLD_WELLBEING_EMOJI = ['🥶', '🥶', '😓', '😓', '😐', '😐', '🙂', '🙂', '💪', '💪', '🔥'];
  const COLD_STRESS_EMOJI = ['😌', '😌', '🙂', '🙂', '😐', '😐', '😟', '😟', '😰', '😰', '😱'];

  // Пресеты для быстрого выбора
  const COLD_PRESETS_POSITIVE = [
    { emoji: '👎', value: 2, label: 'Плохо' },
    { emoji: '👌', value: 5, label: 'Норм' },
    { emoji: '👍', value: 8, label: 'Хорошо' }
  ];
  const COLD_PRESETS_NEGATIVE = [
    { emoji: '😌', value: 2, label: 'Спокоен' },
    { emoji: '😐', value: 5, label: 'Средне' },
    { emoji: '😰', value: 8, label: 'Стресс' }
  ];

  // Цвета для позитивных шкал
  const getColdPositiveColor = (v) => {
    if (v <= 3) return '#ef4444';
    if (v <= 5) return '#3b82f6';
    if (v <= 7) return '#22c55e';
    return '#10b981';
  };

  // Цвета для негативных шкал (stress)
  const getColdNegativeColor = (v) => {
    if (v <= 3) return '#10b981';
    if (v <= 5) return '#3b82f6';
    if (v <= 7) return '#eab308';
    return '#ef4444';
  };

  // Текст для значений
  const getColdMoodText = (v) => v <= 2 ? 'Плохо' : v <= 4 ? 'Так себе' : v <= 6 ? 'Норм' : v <= 8 ? 'Хорошо' : 'Отлично';
  const getColdWellbeingText = (v) => v <= 2 ? 'Замёрз' : v <= 4 ? 'Холодно' : v <= 6 ? 'Терпимо' : v <= 8 ? 'Бодрит' : 'Огонь!';
  const getColdStressText = (v) => v <= 2 ? 'Спокоен' : v <= 4 ? 'Немного' : v <= 6 ? 'Средне' : v <= 8 ? 'Много' : 'Очень';

  // Компонент слайдера оценки для холода
  function ColdRatingSlider({ field, value, emoji, title, presets, getColor, getText, isNegative, onChange }) {
    const color = getColor(value);
    return React.createElement('div', {
      className: 'cold-rating-card',
      style: {
        padding: '12px',
        borderRadius: '10px',
        background: isNegative
          ? (value <= 3 ? 'rgba(16, 185, 129, 0.08)' : value >= 7 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.06)')
          : (value <= 3 ? 'rgba(239, 68, 68, 0.08)' : value >= 7 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.06)'),
        marginBottom: '8px'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }
      },
        // Emoji + заголовок
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { style: { fontSize: '20px' } }, emoji),
          React.createElement('span', { style: { fontWeight: '600', fontSize: '13px' } }, title)
        ),
        // Значение + текст
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', {
            style: {
              fontWeight: '700',
              fontSize: '16px',
              color: color
            }
          }, value),
          React.createElement('span', {
            style: { fontSize: '12px', color: '#64748b' }
          }, getText(value))
        )
      ),
      // Пресеты
      React.createElement('div', {
        style: {
          display: 'flex',
          gap: '6px',
          marginBottom: '8px'
        }
      },
        presets.map(p => React.createElement('button', {
          key: p.value,
          onClick: () => onChange(p.value),
          style: {
            flex: 1,
            padding: '6px',
            borderRadius: '6px',
            border: value === p.value ? `2px solid ${color}` : '1px solid #e2e8f0',
            background: value === p.value ? `${color}15` : '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.15s'
          }
        }, p.emoji))
      ),
      // Слайдер
      React.createElement('input', {
        type: 'range',
        min: 1,
        max: 10,
        value: value,
        onChange: (e) => onChange(Number(e.target.value)),
        style: {
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          appearance: 'none',
          background: `linear-gradient(to right, ${color} ${(value - 1) * 11.1}%, #e5e7eb ${(value - 1) * 11.1}%)`,
          cursor: 'pointer'
        }
      })
    );
  }

  function ColdExposureStepComponent({ data, onChange }) {
    const selectedType = data.coldType || 'none';
    const time = data.coldTime || new Date().toTimeString().slice(0, 5);

    return React.createElement('div', { className: 'mc-cold-step' },
      // Кнопки выбора типа
      React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginBottom: '16px'
        }
      },
        COLD_TYPES.map(t => React.createElement('button', {
          key: t.id,
          onClick: () => onChange({ ...data, coldType: t.id, coldTime: t.id !== 'none' ? time : null }),
          style: {
            padding: '12px',
            borderRadius: '12px',
            border: selectedType === t.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            background: selectedType === t.id ? 'rgba(59, 130, 246, 0.1)' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }
        },
          React.createElement('div', { style: { fontSize: '24px', marginBottom: '4px' } }, t.icon),
          React.createElement('div', { style: { fontWeight: '600', fontSize: '13px' } }, t.label),
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, t.desc)
        ))
      ),
      // Время (если выбрано что-то кроме "нет")
      selectedType !== 'none' && React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          background: 'rgba(59, 130, 246, 0.05)',
          borderRadius: '8px',
          marginBottom: '16px'
        }
      },
        React.createElement('span', { style: { fontSize: '14px', color: '#64748b' } }, '⏰ Время:'),
        React.createElement('input', {
          type: 'time',
          value: time,
          onChange: (e) => onChange({ ...data, coldTime: e.target.value }),
          style: {
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '16px',
            fontWeight: '600'
          }
        })
      ),
      // Подсказка о пользе
      selectedType !== 'none' && React.createElement('div', {
        style: {
          padding: '10px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.15))',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#3b82f6'
        }
      },
        '💡 Холод активирует бурый жир и улучшает чувствительность к инсулину на 4-5 часов'
      )
    );
  }

  registerStep('cold_exposure', {
    title: 'Холодовое воздействие',
    hint: 'Был ли холодный душ?',
    icon: '🧊',
    canSkip: true,
    component: ColdExposureStepComponent,
    getInitialData: () => {
      const dateKey = getTodayKey();
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const cold = dayData.coldExposure ?? {};  // null-safe: ?? вместо ||
      return {
        coldType: cold.type || 'none',
        coldTime: cold.time || new Date().toTimeString().slice(0, 5),
        _dateKey: dateKey
      };
    },
    save: (data) => {
      const dateKey = data._dateKey || getTodayKey();
      const dayData = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });

      if (data.coldType && data.coldType !== 'none') {
        dayData.coldExposure = {
          type: data.coldType,
          time: data.coldTime
        };
      } else {
        // Если выбрано "нет" — удаляем холод
        if (dayData.coldExposure) {
          delete dayData.coldExposure;
        }
      }

      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);

      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'coldExposure' }
      }));
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'coldExposure', source: 'cold-exposure-step' }
      }));
    },
    xpAction: 'cold_exposure_logged'
  });

  // ============================================================
  // MORNING MOOD STEP — 📊 Утреннее настроение (обязательный)
  // Дефолт = среднее за вчера
  // WOW-эффекты: staggered animation, пресеты, pulse, градиенты
  // ============================================================

  // Хелперы для оценок (как в тренировке)
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

  // Haptic feedback
  const hapticLight = () => {
    try { navigator.vibrate?.(5); } catch { }
  };

  // Пресеты быстрого выбора (5 вариантов)
  const MOOD_PRESETS = [
    { value: 2, emoji: '😫' },
    { value: 4, emoji: '😞' },
    { value: 6, emoji: '😐' },
    { value: 8, emoji: '😊' },
    { value: 10, emoji: '🔥' }
  ];

  const STRESS_PRESETS = [
    { value: 2, emoji: '😌' },
    { value: 4, emoji: '🙂' },
    { value: 6, emoji: '😐' },
    { value: 8, emoji: '😟' },
    { value: 10, emoji: '😰' }
  ];

  // Получение среднего за вчера
  function getYesterdayMoodAvg() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = yesterday.toISOString().slice(0, 10);
    // 🔧 FIX: Добавляем || {} на случай если lsGet вернёт null
    const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};

    // Собираем все оценки настроения за день (из приёмов пищи + утреннее)
    const moodValues = [];
    const wellbeingValues = [];
    const stressValues = [];

    // Утреннее настроение
    if (dayData.moodMorning) moodValues.push(dayData.moodMorning);
    if (dayData.wellbeingMorning) wellbeingValues.push(dayData.wellbeingMorning);
    if (dayData.stressMorning) stressValues.push(dayData.stressMorning);

    // Из приёмов пищи
    if (dayData.meals && dayData.meals.length > 0) {
      dayData.meals.forEach(meal => {
        if (meal.mood) moodValues.push(meal.mood);
        if (meal.wellbeing) wellbeingValues.push(meal.wellbeing);
        if (meal.stress) stressValues.push(meal.stress);
      });
    }

    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 5;

    return {
      mood: avg(moodValues),
      wellbeing: avg(wellbeingValues),
      stress: avg(stressValues)
    };
  }

  // CSS для анимаций (добавляется один раз)
  if (typeof document !== 'undefined' && !document.getElementById('morning-mood-styles')) {
    const style = document.createElement('style');
    style.id = 'morning-mood-styles';
    style.textContent = `
      @keyframes moodPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
      @keyframes emojiPop {
        0% { transform: scale(0.9); }
        50% { transform: scale(1.15); }
        100% { transform: scale(1); }
      }
      .mood-value-pulse {
        animation: moodPulse 0.25s ease-out;
      }
      .mood-emoji-pop {
        animation: emojiPop 0.2s ease-out;
      }
      .mood-preset-btn {
        transition: background 0.1s, border-color 0.1s;
      }
      .mood-preset-btn:active {
        transform: scale(0.95);
      }
    `;
    document.head.appendChild(style);
  }

  function MorningMoodStepComponent({ data, onChange }) {
    const mood = data.mood ?? 5;
    const wellbeing = data.wellbeing ?? 5;
    const stress = data.stress ?? 5;

    // Состояние для анимации pulse
    const [pulsingField, setPulsingField] = useState(null);
    const [poppingEmoji, setPoppingEmoji] = useState(null);

    const updateField = (field, value) => {
      hapticLight();
      onChange({ ...data, [field]: value });

      // Запускаем pulse-анимацию
      setPulsingField(field);
      setPoppingEmoji(field);
      setTimeout(() => setPulsingField(null), 300);
      setTimeout(() => setPoppingEmoji(null), 250);
    };

    // Компонент одного рейтинга с пресетами и градиентом
    const RatingCard = ({ field, value, emoji, emojiFn, title, color, colorFn, presets, isNegative, index }) => {
      return React.createElement('div', {
        className: 'mood-rating-card',
        style: {
          padding: '10px 12px',
          borderRadius: '12px',
          background: 'var(--card, #fff)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0'
        }
      },
        // Заголовок с эмодзи и значением
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px'
          }
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', {
              className: poppingEmoji === field ? 'mood-emoji-pop' : '',
              style: { fontSize: '22px', transition: 'all 0.2s' }
            }, emojiFn(value)),
            React.createElement('span', { style: { fontWeight: '600', fontSize: '14px', color: 'var(--text, #1e293b)' } }, title)
          ),
          React.createElement('span', {
            className: pulsingField === field ? 'mood-value-pulse' : '',
            style: {
              fontWeight: '700',
              fontSize: '18px',
              color: colorFn(value),
              minWidth: '45px',
              textAlign: 'right'
            }
          }, value + '/10')
        ),

        // Пресеты быстрого выбора (5 вариантов)
        React.createElement('div', {
          style: {
            display: 'flex',
            gap: '4px',
            marginBottom: '6px'
          }
        },
          presets.map(p => {
            const isSelected = value === p.value;
            const btnColor = colorFn(p.value);
            return React.createElement('button', {
              key: p.value,
              className: 'mood-preset-btn',
              onClick: () => updateField(field, p.value),
              style: {
                flex: 1,
                padding: '6px 2px',
                borderRadius: '8px',
                border: isSelected ? `2px solid ${btnColor}` : '1px solid #e5e7eb',
                background: isSelected ? `${btnColor}20` : '#fff',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '36px'
              }
            },
              React.createElement('span', { style: { fontSize: '20px' } }, p.emoji)
            );
          })
        ),

        // Слайдер — простой вариант, работает по tap
        React.createElement('input', {
          type: 'range',
          className: 'mc-quality-slider',
          min: 1,
          max: 10,
          value: value,
          onChange: e => {
            updateField(field, Number(e.target.value));
          },
          style: {
            background: isNegative
              ? `linear-gradient(to right, #10b981 0%, #22c55e 30%, #eab308 50%, #f97316 70%, #ef4444 100%)`
              : `linear-gradient(to right, #ef4444 0%, #f97316 30%, #eab308 50%, #22c55e 70%, #10b981 100%)`
          }
        })
      );
    };

    return React.createElement('div', {
      className: 'ts-step morning-mood-step',
      style: { opacity: 1 }
    },

      // === Заголовок ===
      React.createElement('div', {
        style: {
          textAlign: 'center',
          marginBottom: '12px',
          padding: '10px',
          background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
          borderRadius: '12px'
        }
      },
        React.createElement('div', { style: { fontSize: '26px', marginBottom: '2px' } }, '🌅'),
        React.createElement('div', { style: { fontWeight: '700', fontSize: '15px', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.2)' } },
          'Как себя чувствуешь?'
        )
      ),

      // === Оценки с анимацией ===
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },

        // Настроение
        React.createElement(RatingCard, {
          field: 'mood',
          value: mood,
          emojiFn: getMoodEmoji,
          title: 'Настроение',
          colorFn: getMoodColor,
          presets: MOOD_PRESETS,
          isNegative: false,
          index: 0
        }),

        // Бодрость
        React.createElement(RatingCard, {
          field: 'wellbeing',
          value: wellbeing,
          emojiFn: getWellbeingEmoji,
          title: 'Бодрость',
          colorFn: getMoodColor,
          presets: MOOD_PRESETS,
          isNegative: false,
          index: 1
        }),

        // Стресс
        React.createElement(RatingCard, {
          field: 'stress',
          value: stress,
          emojiFn: getStressEmoji,
          title: 'Стресс',
          colorFn: getStressColor,
          presets: STRESS_PRESETS,
          isNegative: true,
          index: 2
        })
      ),

      // === Подсказка ===
      React.createElement('div', {
        style: {
          marginTop: '16px',
          padding: '10px 14px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(147, 197, 253, 0.08))',
          borderRadius: '10px',
          fontSize: '12px',
          color: '#64748b',
          textAlign: 'center'
        }
      }, '💡 Эти данные помогут отследить влияние еды на настроение')
    );
  }

  registerStep('morning_mood', {
    title: 'Утреннее настроение',
    hint: 'Как себя чувствуешь?',
    icon: '😊',
    canSkip: false, // Обязательный шаг!
    component: MorningMoodStepComponent,
    getInitialData: () => {
      const dateKey = getTodayKey();
      // 🔧 FIX: Добавляем || {} на случай если lsGet вернёт null (новый клиент)
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};

      // Если уже есть данные за сегодня — берём их
      if (dayData.moodMorning !== undefined) {
        return {
          mood: dayData.moodMorning,
          wellbeing: dayData.wellbeingMorning ?? 5,
          stress: dayData.stressMorning ?? 5,
          _dateKey: dateKey
        };
      }

      // Иначе берём среднее за вчера
      const yesterdayAvg = getYesterdayMoodAvg();
      return {
        mood: yesterdayAvg.mood,
        wellbeing: yesterdayAvg.wellbeing,
        stress: yesterdayAvg.stress,
        _dateKey: dateKey
      };
    },
    save: (data) => {
      const dateKey = data._dateKey || getTodayKey();
      const dayData = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });

      dayData.moodMorning = data.mood ?? 5;
      dayData.wellbeingMorning = data.wellbeing ?? 5;
      dayData.stressMorning = data.stress ?? 5;

      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);

      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'morningMood' }
      }));
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'morningMood', source: 'morning-mood-step', forceReload: true }
      }));
    },
    xpAction: 'morning_mood_logged'
  });

  // ============================================================
  // MORNING ROUTINE STEP — Завершающий мотивирующий шаг
  // Персонализированное приветствие по настроению
  // ============================================================

  function MorningRoutineStepComponent({ data, onChange, context }) {
    const [checkedItems, setCheckedItems] = useState(data.checkedItems || []);
    const [showConfetti, setShowConfetti] = useState(false);

    // Получаем утреннее настроение из данных дня
    const dateKey = getTodayKey();
    // 🔧 FIX: Добавляем || {} на случай если lsGet вернёт null
    const dayData = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
    const morningMood = dayData.moodMorning ?? 5;
    const morningWellbeing = dayData.wellbeingMorning ?? 5;
    const morningStress = dayData.stressMorning ?? 5;

    // Персонализированное приветствие на основе настроения
    const getPersonalizedGreeting = () => {
      const avgMood = (morningMood + morningWellbeing + (10 - morningStress)) / 3;
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? 'утро' : hour < 17 ? 'день' : 'вечер';

      if (avgMood >= 7) {
        const phrases = [
          { emoji: '🚀', text: 'Отличный старт!' },
          { emoji: '🔥', text: 'Ты в огне!' },
          { emoji: '⚡', text: 'Заряжен на 100%!' },
          { emoji: '🌟', text: `Сияющее ${timeOfDay}!` },
          { emoji: '💫', text: 'Великолепно!' }
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
      } else if (avgMood >= 5) {
        const phrases = [
          { emoji: '☀️', text: `Хорошее ${timeOfDay}!` },
          { emoji: '✨', text: 'Всё будет супер!' },
          { emoji: '💪', text: 'День будет продуктивным!' },
          { emoji: '🎯', text: 'Вперёд к целям!' }
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
      } else {
        const phrases = [
          { emoji: '💪', text: 'Держись! День может стать лучше' },
          { emoji: '🌈', text: 'После тучи всегда солнце!' },
          { emoji: '☕', text: 'Начни с чашки чего-то тёплого' },
          { emoji: '🤗', text: 'Ты справишься!' },
          { emoji: '🌱', text: 'Каждый день — новый шанс' }
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
      }
    };

    const personalGreeting = useMemo(getPersonalizedGreeting, [morningMood, morningWellbeing, morningStress]);

    // Рандомные мотивирующие фразы для кнопки (адаптированы под настроение)
    const getButtonPhrase = () => {
      const avgMood = (morningMood + morningWellbeing + (10 - morningStress)) / 3;
      if (avgMood >= 7) {
        const phrases = ['🚀 ВПЕРЁД!', '🔥 ПОЕХАЛИ!', '⚡ НАЧИНАЕМ!', '💪 СТАРТУЕМ!'];
        return phrases[Math.floor(Math.random() * phrases.length)];
      } else if (avgMood >= 5) {
        const phrases = ['☀️ НАЧАТЬ ДЕНЬ!', '✨ ОТЛИЧНОГО ДНЯ!', '🎯 ВПЕРЁД К ЦЕЛИ!'];
        return phrases[Math.floor(Math.random() * phrases.length)];
      } else {
        const phrases = ['💪 СПРАВИМСЯ!', '🌈 ВПЕРЁД!', '☕ НАЧНЁМ ПОТИХОНЬКУ'];
        return phrases[Math.floor(Math.random() * phrases.length)];
      }
    };

    const randomPhrase = useMemo(getButtonPhrase, [morningMood, morningWellbeing, morningStress]);

    const routineItems = [
      {
        id: 'water',
        emoji: '💧',
        title: 'Выпей тёплой воды',
        desc: 'Стакан тёплой воды натощак запускает метаболизм',
        color: '#3b82f6'
      },
      {
        id: 'tracker',
        emoji: '⌚',
        title: 'Надень трекер',
        desc: 'Часы или браслет — следи за шагами и пульсом',
        color: '#3b82f6'
      },
      {
        id: 'shower',
        emoji: '🚿',
        title: 'Контрастный душ',
        desc: 'Бодрит и укрепляет иммунитет',
        color: '#06b6d4'
      }
    ];

    const toggleItem = (id) => {
      setCheckedItems(prev => {
        const newItems = prev.includes(id)
          ? prev.filter(i => i !== id)
          : [...prev, id];
        onChange({ ...data, checkedItems: newItems });

        // Конфетти при выполнении всех 3
        if (newItems.length === 3 && !showConfetti) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2000);
        }

        return newItems;
      });
    };

    // Функция завершения (вызывает onNext из контекста)
    const handleFinish = () => {
      if (context && context.onNext) {
        context.onNext();
      }
    };

    const allChecked = checkedItems.length === 3;

    return React.createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '8px 0'
      }
    },
      // Заголовок с персонализированным приветствием
      React.createElement('div', {
        style: {
          textAlign: 'center',
          marginBottom: '8px'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: '48px',
            marginBottom: '8px',
            animation: 'bounce 1s ease infinite'
          }
        }, personalGreeting.emoji),
        React.createElement('div', {
          style: {
            fontSize: '20px',
            fontWeight: '700',
            color: 'var(--text, #1e293b)',
            marginBottom: '4px'
          }
        }, personalGreeting.text),
        React.createElement('div', {
          style: {
            fontSize: '14px',
            color: '#64748b'
          }
        }, '3 шага правильной рутины:')
      ),

      // 🆕 NDTE Insight — показываем если вчера была тренировка
      (() => {
        const todayKey = getTodayKey();
        const prevTrainings = HEYS.InsulinWave && HEYS.InsulinWave.getPreviousDayTrainings
          ? HEYS.InsulinWave.getPreviousDayTrainings(todayKey, lsGet)
          : null;

        if (!prevTrainings || prevTrainings.totalKcal < 200) return null;

        const prof = lsGet('heys_profile', { weight: 70, height: 170 });
        const bmi = HEYS.InsulinWave.calculateBMI(prof.weight, prof.height);
        const ndteData = HEYS.InsulinWave.calculateNDTE({
          trainingKcal: prevTrainings.totalKcal,
          hoursSince: prevTrainings.hoursSince,
          bmi: bmi,
          trainingType: prevTrainings.dominantType,
          trainingsCount: prevTrainings.trainings.length
        });

        if (!ndteData.active) return null;

        const boostPct = Math.round(ndteData.tdeeBoost * 100);
        const wavePct = Math.round(ndteData.waveReduction * 100);

        return React.createElement('div', {
          style: {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '16px',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
          }
        },
          // Header with animated icon
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '10px'
            }
          },
            React.createElement('span', {
              style: {
                fontSize: '24px',
                animation: 'ndteFireFlicker 1.5s ease-in-out infinite'
              }
            }, '🔥'),
            React.createElement('span', {
              style: {
                fontSize: '16px',
                fontWeight: '700'
              }
            }, 'Эффект вчерашней тренировки!')
          ),
          // Stats row
          React.createElement('div', {
            style: {
              display: 'flex',
              gap: '20px',
              fontSize: '13px',
              opacity: '0.95'
            }
          },
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: '600', fontSize: '18px' } }, `+${boostPct}%`),
              React.createElement('div', { style: { opacity: '0.8', fontSize: '11px' } }, 'к метаболизму')
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: '600', fontSize: '18px' } }, `-${wavePct}%`),
              React.createElement('div', { style: { opacity: '0.8', fontSize: '11px' } }, 'к инс. волне')
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: '600', fontSize: '18px' } }, `${prevTrainings.totalKcal}`),
              React.createElement('div', { style: { opacity: '0.8', fontSize: '11px' } }, 'ккал вчера')
            )
          ),
          // Motivation text
          React.createElement('div', {
            style: {
              marginTop: '10px',
              fontSize: '12px',
              opacity: '0.85',
              fontStyle: 'italic'
            }
          }, ndteData.tdeeBoost >= 0.07
            ? '💪 Отличная тренировка! Твой метаболизм работает на полную мощность.'
            : '⚡ Хорошая активность! Метаболизм слегка ускорен.'
          )
        );
      })(),

      // Список рутин
      React.createElement('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }
      },
        routineItems.map((item, index) =>
          React.createElement('div', {
            key: item.id,
            onClick: () => toggleItem(item.id),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              background: checkedItems.includes(item.id)
                ? `linear-gradient(135deg, ${item.color}15, ${item.color}08)`
                : '#f8fafc',
              borderRadius: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              border: checkedItems.includes(item.id)
                ? `2px solid ${item.color}40`
                : '2px solid transparent',
              transform: checkedItems.includes(item.id) ? 'scale(1.02)' : 'scale(1)'
            }
          },
            // Номер / галочка
            React.createElement('div', {
              style: {
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: checkedItems.includes(item.id)
                  ? `linear-gradient(135deg, ${item.color}, ${item.color}cc)`
                  : '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: checkedItems.includes(item.id) ? '18px' : '14px',
                fontWeight: '700',
                color: checkedItems.includes(item.id) ? '#fff' : '#64748b',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }
            }, checkedItems.includes(item.id) ? '✓' : (index + 1)),

            // Эмодзи
            React.createElement('div', {
              style: {
                fontSize: '28px',
                flexShrink: 0
              }
            }, item.emoji),

            // Текст
            React.createElement('div', {
              style: {
                flex: 1,
                minWidth: 0
              }
            },
              React.createElement('div', {
                style: {
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'var(--text, #1e293b)',
                  marginBottom: '2px'
                }
              }, item.title),
              React.createElement('div', {
                style: {
                  fontSize: '12px',
                  color: '#64748b',
                  lineHeight: '1.3'
                }
              }, item.desc)
            )
          )
        )
      ),

      // Мотивационная кнопка-плашка внизу (вместо кнопки в хедере)
      React.createElement('button', {
        onClick: handleFinish,
        style: {
          width: '100%',
          textAlign: 'center',
          padding: '18px 24px',
          background: allChecked
            ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
            : 'linear-gradient(135deg, #10b981, #059669)',
          borderRadius: '16px',
          marginTop: '16px',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          transform: 'scale(1)',
          boxShadow: allChecked
            ? '0 4px 14px rgba(251, 191, 36, 0.4)'
            : '0 4px 14px rgba(16, 185, 129, 0.4)'
        },
        onMouseDown: (e) => e.currentTarget.style.transform = 'scale(0.98)',
        onMouseUp: (e) => e.currentTarget.style.transform = 'scale(1)',
        onMouseLeave: (e) => e.currentTarget.style.transform = 'scale(1)'
      },
        allChecked && React.createElement('div', {
          style: { fontSize: '28px', marginBottom: '6px' }
        }, '🏆'),
        React.createElement('div', {
          style: {
            fontSize: allChecked ? '14px' : '13px',
            fontWeight: '600',
            color: allChecked ? '#92400e' : '#fff',
            marginBottom: allChecked ? '8px' : '0'
          }
        }, allChecked ? 'Ты уже на пути к успеху!' : 'Можно пропустить'),
        React.createElement('div', {
          style: {
            fontSize: '18px',
            fontWeight: '800',
            color: allChecked ? '#b45309' : '#fff',
            letterSpacing: '0.5px'
          }
        }, randomPhrase)
      ),

      // Подсказка если не все отмечены
      !allChecked && React.createElement('div', {
        style: {
          textAlign: 'center',
          fontSize: '12px',
          color: '#94a3b8',
          marginTop: '8px'
        }
      }, '↑ Отметь выполненные пункты или продолжай'),

      // CSS анимация
      React.createElement('style', null, `
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `)
    );
  }

  // ============================================================
  // SUPPLEMENTS STEP — 💊 Витамины на сегодня
  // Все категории видны для discovery, выбранные — с оранжевой рамкой
  // ============================================================

  function SupplementsStepComponent({ data, onChange }) {
    const Supps = HEYS.Supplements;
    if (!Supps) {
      return React.createElement('div', {
        style: { padding: '20px', textAlign: 'center', color: '#64748b' }
      }, '⏳ Загрузка витаминов...');
    }

    const byCategory = useMemo(() => Supps.getByCategory(), []);
    const selected = data.selected || [];

    const toggle = (id) => {
      const newSelected = selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id];
      onChange({ ...data, selected: newSelected });
    };

    return React.createElement('div', {
      className: 'mc-supplements-step',
      style: {
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '60vh'
      }
    },
      // Скроллящийся список категорий
      React.createElement('div', {
        style: {
          flex: 1,
          overflowY: 'auto',
          paddingRight: '4px'
        }
      },
        // Категории
        Object.entries(byCategory).map(([catId, supps]) => {
          const cat = Supps.CATEGORIES[catId];
          return React.createElement('div', {
            key: catId,
            style: { marginBottom: '16px' }
          },
            // Заголовок категории
            React.createElement('div', {
              style: {
                fontSize: '13px',
                fontWeight: '600',
                color: '#64748b',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }
            },
              React.createElement('span', null, cat.icon),
              React.createElement('span', null, cat.name)
            ),
            // Чипы витаминов
            React.createElement('div', {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px'
              }
            },
              supps.map(supp => {
                const isSelected = selected.includes(supp.id);
                return React.createElement('button', {
                  key: supp.id,
                  onClick: () => toggle(supp.id),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    border: isSelected ? '2px solid #f97316' : '2px solid #e2e8f0',
                    background: isSelected ? 'rgba(249, 115, 22, 0.1)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isSelected ? '600' : '500',
                    color: isSelected ? '#ea580c' : '#374151',
                    transition: 'all 0.2s'
                  }
                },
                  React.createElement('span', null, supp.icon),
                  React.createElement('span', null, supp.name)
                );
              })
            )
          );
        })
      ),
      // Счётчик внизу — ВНЕ скролла!
      React.createElement('div', {
        style: {
          marginTop: '12px',
          padding: '12px',
          background: selected.length > 0 ? '#fff7ed' : '#f8fafc',
          borderRadius: '12px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: '600',
          color: selected.length > 0 ? '#ea580c' : '#64748b',
          flexShrink: 0
        }
      },
        selected.length > 0
          ? `💊 Выбрано: ${selected.length}`
          : '💊 Выберите витамины на сегодня'
      )
    );
  }

  registerStep('supplements', {
    title: 'Витамины',
    hint: 'Что планируете принять?',
    icon: '💊',
    canSkip: true,
    component: SupplementsStepComponent,
    getInitialData: () => {
      // Берём из профиля (запомненный выбор с прошлого дня)
      const planned = HEYS.Supplements?.getPlanned() || [];
      return { selected: planned };
    },
    save: (data, context) => {
      // Используем dateKey из контекста (для редактирования прошлых дней) или сегодня
      const dateKey = context?.dateKey || getTodayKey();

      console.log('[Supplements SAVE] 🔵 START | dateKey:', dateKey, '| selected:', data.selected, '| context:', context);

      // 1. Сохраняем в профиль (для следующего дня)
      if (HEYS.Supplements && HEYS.Supplements.savePlanned) {
        HEYS.Supplements.savePlanned(data.selected);
        console.log('[Supplements SAVE] ✅ Saved to profile');
      }

      // 2. Сохраняем в день как planned
      const dayData = lsGet(`heys_dayv2_${dateKey}`, { date: dateKey });
      const oldPlanned = dayData.supplementsPlanned;
      dayData.supplementsPlanned = data.selected;
      dayData.updatedAt = Date.now();
      lsSet(`heys_dayv2_${dateKey}`, dayData);
      console.log('[Supplements SAVE] ✅ Saved to day | old:', oldPlanned, '| new:', data.selected, '| updatedAt:', dayData.updatedAt);

      // Диспатчим событие для обновления UI дня (с forceReload!)
      if (typeof window !== 'undefined') {
        console.log('[Supplements SAVE] 📤 Dispatching heys:day-updated with forceReload:true');
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'supplementsPlanned', forceReload: true }
        }));
      }
    },
    xpAction: 'supplements_planned'
  });

  registerStep('morningRoutine', {
    title: 'Утренняя рутина',
    hint: 'Начни день правильно!',
    icon: '🌟',
    canSkip: true,
    hideHeaderNext: true,  // Скрываем кнопку в хедере — используем плашку внизу
    component: MorningRoutineStepComponent,
    getInitialData: () => ({
      checkedItems: []
    }),
    save: (data) => {
      // Опционально: можно сохранять что пользователь отметил
      // Пока просто логируем для аналитики
      if (data.checkedItems && data.checkedItems.length > 0) {
        console.log('[MorningRoutine] Completed items:', data.checkedItems);
      }
    },
    xpAction: 'morning_routine_completed'
  });

  // =============================================

  // === Экспорт шагов ===
  HEYS.Steps = {
    Weight: WeightStepComponent,
    SleepTime: SleepTimeStepComponent,
    SleepQuality: SleepQualityStepComponent,
    StepsGoal: StepsGoalStepComponent,
    Deficit: DeficitStepComponent,
    HouseholdMinutes: HouseholdMinutesComponent,
    HouseholdStats: HouseholdStatsComponent,
    Cycle: CycleStepComponent,
    Measurements: MeasurementsStepComponent,
    ColdExposure: ColdExposureStepComponent,
    Supplements: SupplementsStepComponent,  // 💊 Витамины
    MorningRoutine: MorningRoutineStepComponent,  // 🌟 Мотивирующий финал
    getLastMeasurementByField,
    getMeasurementsHistory,
    // Утилиты
    getLastKnownWeight,
    getYesterdayWeight,
    getWeightForecast,
    getLastSleepData,
    getWeeklyStepsStats,
    calcSleepHours,
    getCurrentDeficit,
    calcHouseholdKcal,
    getWeeklyHouseholdStats,
    getLastMeasurements,
    shouldShowMeasurements,
    shouldShowCycleStep
  };

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
