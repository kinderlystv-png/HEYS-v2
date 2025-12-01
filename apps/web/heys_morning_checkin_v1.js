// heys_morning_checkin_v1.js — Утренний чек-ин: вес, сон, шаги
// Показывается при открытии приложения, если сегодня не заполнен вес
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useEffect, useCallback, useRef } = React;
  
  const TOTAL_STEPS = 4;
  
  // === Данные для UI ===
  const SLEEP_QUALITY_EMOJI = ['😴', '😟', '😕', '😐', '🙂', '😊', '😃', '🌟', '✨', '🌈'];
  const SLEEP_QUALITY_LABELS = [
    'Ужасно', 'Плохо', 'Так себе', 'Норм', 'Неплохо',
    'Хорошо', 'Отлично', 'Супер', 'Идеально', 'Божественно'
  ];
  
  // === Утилиты ===
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }
  
  function getCurrentHour() {
    return new Date().getHours();
  }
  
  /**
   * Приветствие в зависимости от времени суток
   */
  function getTimeBasedGreeting() {
    const hour = getCurrentHour();
    if (hour >= 5 && hour < 12) return 'Доброе утро! ☀️';
    if (hour >= 12 && hour < 17) return 'Добрый день! 🌤️';
    if (hour >= 17 && hour < 22) return 'Добрый вечер! 🌙';
    return 'Доброй ночи! 🌌';
  }
  
  /**
   * Проверяем, нужно ли показывать утренний чек-ин
   */
  function shouldShowMorningCheckin() {
    const U = HEYS.utils || {};
    const todayKey = getTodayKey();
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${todayKey}`, {}) : {};
    
    // Показываем, если сегодня нет веса
    return !dayData.weightMorning;
  }
  
  /**
   * Получить последний известный вес (за последние 60 дней или из профиля)
   */
  function getLastKnownWeight() {
    const U = HEYS.utils || {};
    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
    
    // Ищем вес за последние 60 дней
    const today = new Date();
    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
      if (dayData.weightMorning) {
        return { weight: dayData.weightMorning, daysAgo: i, date: key };
      }
    }
    
    // Fallback на профиль
    if (profile.weight) {
      return { weight: profile.weight, daysAgo: null, date: null };
    }
    
    return { weight: 70, daysAgo: null, date: null };
  }
  
  /**
   * Получить вчерашний вес для дельты
   */
  function getYesterdayWeight() {
    const U = HEYS.utils || {};
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = yesterday.toISOString().slice(0, 10);
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
    return dayData.weightMorning || null;
  }
  
  /**
   * Рассчитать прогноз веса на 2 недели
   */
  function getWeightForecast() {
    const U = HEYS.utils || {};
    const weights = [];
    const today = new Date();
    
    // Собираем веса за последние 14 дней
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
      if (dayData.weightMorning) {
        weights.push({ day: -i, weight: dayData.weightMorning });
      }
    }
    
    // Нужно минимум 3 точки для тренда
    if (weights.length < 3) return null;
    
    // Линейная регрессия
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
    
    // Прогноз на 14 дней вперёд
    const forecastWeight = intercept + slope * 14;
    const weeklyChange = slope * 7;
    
    return {
      weight: Math.round(forecastWeight * 10) / 10,
      weeklyChange: Math.round(weeklyChange * 100) / 100,
      confidence: weights.length >= 7 ? 'high' : 'low'
    };
  }
  
  /**
   * Получить текущий streak
   */
  function getCurrentStreak() {
    try {
      if (HEYS.Day && typeof HEYS.Day.getStreak === 'function') {
        return HEYS.Day.getStreak();
      }
      
      // Fallback: считаем сами
      const U = HEYS.utils || {};
      let streak = 0;
      const today = new Date();
      
      for (let i = 1; i <= 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
        
        if (dayData.meals && dayData.meals.length > 0) {
          streak++;
        } else {
          break;
        }
      }
      
      return streak;
    } catch (e) {
      return 0;
    }
  }
  
  /**
   * Получить случайный совет дня
   */
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
    
    // Берём совет по дню недели для консистентности
    const dayOfWeek = new Date().getDay();
    return tips[dayOfWeek % tips.length];
  }
  
  /**
   * Получить последние данные о сне
   */
  function getLastSleepData() {
    const U = HEYS.utils || {};
    const today = new Date();
    
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
      
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
  
  /**
   * Рассчитать часы сна
   */
  function calcSleepHours(startH, startM, endH, endM) {
    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    
    if (endMins <= startMins) {
      endMins += 24 * 60;
    }
    
    return (endMins - startMins) / 60;
  }
  
  /**
   * Получить цвет градиента по качеству сна
   */
  function getQualityColor(quality) {
    // От красного (1) через жёлтый (5) к зелёному (10)
    if (quality <= 3) {
      // Красный → оранжевый
      const t = (quality - 1) / 2;
      return `hsl(${Math.round(t * 30)}, 80%, 50%)`;
    } else if (quality <= 6) {
      // Оранжевый → жёлтый → зелёный-жёлтый
      const t = (quality - 3) / 3;
      return `hsl(${Math.round(30 + t * 40)}, 80%, 50%)`;
    } else {
      // Зелёный-жёлтый → изумрудный
      const t = (quality - 6) / 4;
      return `hsl(${Math.round(70 + t * 90)}, 70%, 45%)`;
    }
  }
  
  // === WheelPicker ===
  function WheelPicker({ values, value, onChange, label, suffix = '' }) {
    const containerRef = useRef(null);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const startValue = useRef(value);
    
    const currentIndex = values.indexOf(value);
    
    const handleTouchStart = useCallback((e) => {
      isDragging.current = true;
      startY.current = e.touches[0].clientY;
      startValue.current = value;
    }, [value]);
    
    const handleTouchMove = useCallback((e) => {
      if (!isDragging.current) return;
      
      const deltaY = startY.current - e.touches[0].clientY;
      const steps = Math.round(deltaY / 30);
      
      const startIndex = values.indexOf(startValue.current);
      const newIndex = Math.max(0, Math.min(values.length - 1, startIndex + steps));
      
      if (values[newIndex] !== value) {
        onChange(values[newIndex]);
      }
    }, [values, value, onChange]);
    
    const handleTouchEnd = useCallback(() => {
      isDragging.current = false;
    }, []);
    
    // Показываем 5 значений: prev2, prev, current, next, next2
    const prev2Index = Math.max(0, currentIndex - 2);
    const prevIndex = Math.max(0, currentIndex - 1);
    const nextIndex = Math.min(values.length - 1, currentIndex + 1);
    const next2Index = Math.min(values.length - 1, currentIndex + 2);
    
    return React.createElement('div', {
      className: 'mc-wheel-picker',
      ref: containerRef,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    },
      React.createElement('div', { className: 'mc-wheel-label' }, label),
      React.createElement('div', { className: 'mc-wheel-values' },
        // prev2 (самый верхний, полупрозрачный)
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--far',
          onClick: () => currentIndex > 1 && onChange(values[prev2Index])
        }, currentIndex > 1 ? values[prev2Index] + suffix : ''),
        
        // prev
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--prev',
          onClick: () => currentIndex > 0 && onChange(values[prevIndex])
        }, currentIndex > 0 ? values[prevIndex] + suffix : ''),
        
        // current (центральный, выделенный)
        React.createElement('div', { className: 'mc-wheel-value mc-wheel-value--current' },
          value + suffix
        ),
        
        // next
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--next',
          onClick: () => currentIndex < values.length - 1 && onChange(values[nextIndex])
        }, currentIndex < values.length - 1 ? values[nextIndex] + suffix : ''),
        
        // next2 (самый нижний, полупрозрачный)
        React.createElement('div', {
          className: 'mc-wheel-value mc-wheel-value--far',
          onClick: () => currentIndex < values.length - 2 && onChange(values[next2Index])
        }, currentIndex < values.length - 2 ? values[next2Index] + suffix : '')
      )
    );
  }
  
  // === MorningCheckin ===
  function MorningCheckin({ onComplete }) {
    const [step, setStep] = useState(1);
    const [animating, setAnimating] = useState(false);
    const [slideDirection, setSlideDirection] = useState(null);
    const containerRef = useRef(null);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);
    
    // Данные
    const lastWeight = useMemo(() => getLastKnownWeight(), []);
    const yesterdayWeight = useMemo(() => getYesterdayWeight(), []);
    const weightForecast = useMemo(() => getWeightForecast(), []);
    const lastSleep = useMemo(() => getLastSleepData(), []);
    const currentStreak = useMemo(() => getCurrentStreak(), []);
    const greeting = useMemo(() => getTimeBasedGreeting(), []);
    const dailyTip = useMemo(() => getDailyTip(), []);
    
    // State для ввода
    const [weightKg, setWeightKg] = useState(Math.floor(lastWeight.weight));
    const [weightG, setWeightG] = useState(Math.round((lastWeight.weight % 1) * 10));
    
    const [sleepStartH, setSleepStartH] = useState(() => {
      const [h] = lastSleep.sleepStart.split(':').map(Number);
      return h;
    });
    const [sleepStartM, setSleepStartM] = useState(() => {
      const [, m] = lastSleep.sleepStart.split(':').map(Number);
      return m;
    });
    const [sleepEndH, setSleepEndH] = useState(() => {
      const [h] = lastSleep.sleepEnd.split(':').map(Number);
      return h;
    });
    const [sleepEndM, setSleepEndM] = useState(() => {
      const [, m] = lastSleep.sleepEnd.split(':').map(Number);
      return m;
    });
    
    const [sleepQuality, setSleepQuality] = useState(lastSleep.sleepQuality || 7);
    const [stepsGoal, setStepsGoal] = useState(() => {
      const U = HEYS.utils || {};
      const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
      return profile.stepsGoal || 10000;
    });
    
    // Вычисления
    const currentWeight = weightKg + weightG / 10;
    const weightDelta = yesterdayWeight ? currentWeight - yesterdayWeight : null;
    const sleepHours = calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM);
    const qualityColor = getQualityColor(sleepQuality);
    
    // Массивы значений
    const kgValues = useMemo(() => Array.from({ length: 101 }, (_, i) => 40 + i), []);
    const gValues = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);
    const hoursValues = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
    const minutesValues = useMemo(() => [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], []);
    const stepsValues = useMemo(() => [5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000], []);
    
    // Swipe handlers
    const handleTouchStart = useCallback((e) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }, []);
    
    const handleTouchEnd = useCallback((e) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      
      // Только горизонтальный свайп (deltaX > deltaY)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX < 0 && step < TOTAL_STEPS) {
          // Свайп влево → следующий шаг
          goToStep(step + 1, 'left');
        } else if (deltaX > 0 && step > 1) {
          // Свайп вправо → предыдущий шаг
          goToStep(step - 1, 'right');
        }
      }
    }, [step]);
    
    const goToStep = useCallback((newStep, direction) => {
      if (animating) return;
      setSlideDirection(direction);
      setAnimating(true);
      
      setTimeout(() => {
        setStep(newStep);
        setSlideDirection(null);
        setAnimating(false);
      }, 200);
    }, [animating]);
    
    // Сохранение
    const saveData = useCallback(() => {
      const U = HEYS.utils || {};
      const todayKey = getTodayKey();
      const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${todayKey}`, {}) : {};
      
      // Обновляем данные дня
      dayData.date = todayKey;
      dayData.weightMorning = currentWeight;
      dayData.sleepStart = `${sleepStartH.toString().padStart(2, '0')}:${sleepStartM.toString().padStart(2, '0')}`;
      dayData.sleepEnd = `${sleepEndH.toString().padStart(2, '0')}:${sleepEndM.toString().padStart(2, '0')}`;
      dayData.sleepHours = Math.round(sleepHours * 10) / 10;
      dayData.sleepQuality = sleepQuality;
      dayData.updatedAt = Date.now();
      
      if (U.lsSet) {
        U.lsSet(`heys_dayv2_${todayKey}`, dayData);
      }
      
      // Сохраняем цель шагов в профиль
      const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
      profile.stepsGoal = stepsGoal;
      if (U.lsSet) {
        U.lsSet('heys_profile', profile);
      }
      
      // === XP за чек-ин ===
      if (HEYS.gamification) {
        try {
          HEYS.gamification.addXP('weight_logged');
          HEYS.gamification.addXP('sleep_logged');
        } catch (e) {
          console.warn('Gamification XP error:', e);
        }
      }
      
      // Уведомляем DayTab о новых данных
      window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: todayKey } }));
      
      onComplete && onComplete();
    }, [currentWeight, sleepStartH, sleepStartM, sleepEndH, sleepEndM, sleepHours, sleepQuality, stepsGoal, onComplete]);
    
    const handleNext = () => {
      if (step < TOTAL_STEPS) {
        goToStep(step + 1, 'left');
      } else {
        saveData();
      }
    };
    
    const handlePrev = () => {
      if (step > 1) {
        goToStep(step - 1, 'right');
      }
    };
    
    // Заголовки шагов
    const stepTitles = {
      1: '⚖️ Вес',
      2: '🛏️ Сон',
      3: '✨ Качество сна',
      4: '👟 Шаги'
    };
    
    const stepHints = {
      1: 'Взвесьтесь натощак',
      2: 'Во сколько легли и встали',
      3: 'Как выспались?',
      4: 'Цель на сегодня'
    };
    
    // Рендер контента шага
    const renderStepContent = () => {
      const slideClass = slideDirection === 'left' ? 'mc-slide-left' : 
                         slideDirection === 'right' ? 'mc-slide-right' : '';
      
      if (step === 1) {
        // Шаг 1: Вес
        return React.createElement('div', { className: `mc-step-content ${slideClass}` },
          React.createElement('div', { className: 'mc-weight-display' },
            React.createElement('span', { className: 'mc-weight-value' }, currentWeight.toFixed(1)),
            React.createElement('span', { className: 'mc-weight-unit' }, ' кг'),
            
            // Дельта веса
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
          
          // Прогноз веса
          weightForecast && React.createElement('div', { className: 'mc-weight-forecast' },
            React.createElement('span', { className: 'mc-forecast-icon' }, '📈'),
            React.createElement('span', { className: 'mc-forecast-text' },
              `Прогноз через 2 нед: ${weightForecast.weight} кг`,
              weightForecast.weeklyChange !== 0 && ` (${weightForecast.weeklyChange > 0 ? '+' : ''}${weightForecast.weeklyChange} кг/нед)`
            )
          )
        );
      }
      
      if (step === 2) {
        // Шаг 2: Время сна
        return React.createElement('div', { className: `mc-step-content ${slideClass}` },
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
                  onChange: setSleepStartH,
                  label: 'ч',
                  suffix: ''
                }),
                React.createElement('span', { className: 'mc-time-sep' }, ':'),
                React.createElement(WheelPicker, {
                  values: minutesValues,
                  value: sleepStartM,
                  onChange: setSleepStartM,
                  label: 'мин',
                  suffix: ''
                })
              )
            ),
            
            React.createElement('div', { className: 'mc-sleep-block' },
              React.createElement('div', { className: 'mc-sleep-label' }, '☀️ Встал'),
              React.createElement('div', { className: 'mc-time-pickers' },
                React.createElement(WheelPicker, {
                  values: hoursValues,
                  value: sleepEndH,
                  onChange: setSleepEndH,
                  label: 'ч',
                  suffix: ''
                }),
                React.createElement('span', { className: 'mc-time-sep' }, ':'),
                React.createElement(WheelPicker, {
                  values: minutesValues,
                  value: sleepEndM,
                  onChange: setSleepEndM,
                  label: 'мин',
                  suffix: ''
                })
              )
            )
          )
        );
      }
      
      if (step === 3) {
        // Шаг 3: Качество сна
        return React.createElement('div', { 
          className: `mc-step-content ${slideClass}`,
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
            onChange: (e) => setSleepQuality(Number(e.target.value)),
            style: { 
              background: `linear-gradient(to right, ${qualityColor} ${(sleepQuality - 1) * 11.1}%, #e5e7eb ${(sleepQuality - 1) * 11.1}%)`
            }
          }),
          
          React.createElement('div', { className: 'mc-quality-buttons' },
            [1, 4, 7, 10].map(q =>
              React.createElement('button', {
                key: q,
                className: `mc-quality-btn ${sleepQuality === q ? 'mc-quality-btn--active' : ''}`,
                onClick: () => setSleepQuality(q),
                style: sleepQuality === q ? { backgroundColor: qualityColor, borderColor: qualityColor } : {}
              }, SLEEP_QUALITY_EMOJI[q - 1])
            )
          )
        );
      }
      
      if (step === 4) {
        // Шаг 4: Цель шагов
        return React.createElement('div', { className: `mc-step-content ${slideClass}` },
          React.createElement('div', { className: 'mc-steps-display' },
            React.createElement('span', { className: 'mc-steps-value' }, stepsGoal.toLocaleString()),
            React.createElement('span', { className: 'mc-steps-unit' }, ' шагов')
          ),
          
          React.createElement('div', { className: 'mc-steps-grid' },
            stepsValues.map(v =>
              React.createElement('button', {
                key: v,
                className: `mc-steps-btn ${stepsGoal === v ? 'mc-steps-btn--active' : ''}`,
                onClick: () => setStepsGoal(v)
              }, v >= 10000 ? `${v / 1000}к` : v.toLocaleString())
            )
          )
        );
      }
      
      return null;
    };
    
    return React.createElement('div', { 
      className: 'mc-backdrop',
      ref: containerRef
    },
      React.createElement('div', { className: 'mc-modal' },
        // Header с приветствием и streak
        React.createElement('div', { className: 'mc-header' },
          React.createElement('div', { className: 'mc-greeting' }, greeting),
          
          currentStreak > 0 && React.createElement('div', { className: 'mc-streak-badge' },
            React.createElement('span', { className: 'mc-streak-fire' }, '🔥'),
            React.createElement('span', { className: 'mc-streak-count' }, currentStreak),
            React.createElement('span', { className: 'mc-streak-text' }, ' дн')
          )
        ),
        
        // Progress dots
        React.createElement('div', { className: 'mc-progress' },
          Array.from({ length: TOTAL_STEPS }, (_, i) =>
            React.createElement('div', {
              key: i,
              className: `mc-dot ${i + 1 <= step ? 'mc-dot--active' : ''}`,
              onClick: () => goToStep(i + 1, i + 1 > step ? 'left' : 'right')
            })
          )
        ),
        
        // Step title
        React.createElement('div', { className: 'mc-step-header' },
          React.createElement('h2', { className: 'mc-step-title' }, stepTitles[step]),
          React.createElement('p', { className: 'mc-step-hint' }, stepHints[step])
        ),
        
        // Step content
        renderStepContent(),
        
        // Buttons
        React.createElement('div', { className: 'mc-buttons' },
          step > 1 && React.createElement('button', {
            className: 'mc-btn mc-btn--secondary',
            onClick: handlePrev
          }, '← Назад'),
          
          React.createElement('button', {
            className: 'mc-btn mc-btn--primary',
            onClick: handleNext
          }, step === TOTAL_STEPS ? '✓ Готово' : 'Далее →')
        ),
        
        // Daily tip footer
        React.createElement('div', { className: 'mc-tip' }, dailyTip)
      )
    );
  }
  
  // Экспорт
  HEYS.MorningCheckin = MorningCheckin;
  HEYS.shouldShowMorningCheckin = shouldShowMorningCheckin;
  
})(typeof window !== 'undefined' ? window : global);
