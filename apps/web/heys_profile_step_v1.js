// heys_profile_step_v1.js — Wizard первого входа: 4 шага заполнения профиля
// Personal → Body → Goals → Metabolism
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.error('heys_profile_step_v1.js: HEYS.StepModal not found. Load heys_step_modal_v1.js first.');
    return;
  }

  const { WheelPicker, registerStep, utils } = HEYS.StepModal;
  const { lsGet, lsSet, getTodayKey } = utils;

  // ============================================================
  // УТИЛИТЫ
  // ============================================================

  // Дублируем пресеты из heys_user_v12.js (они внутри scope UserPage)
  const GOAL_PRESETS = [
    { value: -20, label: 'Агрессивное похудение', emoji: '🔥🔥', color: '#ef4444' },
    { value: -15, label: 'Активное похудение', emoji: '🔥', color: '#f97316' },
    { value: -10, label: 'Умеренное похудение', emoji: '🎯', color: '#eab308' },
    { value: 0, label: 'Поддержание веса', emoji: '⚖️', color: '#22c55e' },
    { value: 10, label: 'Умеренный набор', emoji: '💪', color: '#3b82f6' },
    { value: 15, label: 'Активный набор', emoji: '💪💪', color: '#8b5cf6' }
  ];

  const INSULIN_PRESETS = [
    { value: 2.5, label: 'Быстрый метаболизм', desc: 'спортсмены, низкоуглеводка' },
    { value: 3, label: 'Нормальный', desc: 'большинство людей' },
    { value: 4, label: 'Медленный', desc: 'склонность к полноте' },
    { value: 4.5, label: 'Инсулинорезистентность', desc: 'преддиабет, СПКЯ' }
  ];

  // Расчёт возраста из даты рождения (переиспользуем логику из heys_user_v12.js)
  function calcAgeFromBirthDate(birthDate) {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return Math.max(0, age);
  }

  // Расчёт нормы сна по возрасту и полу (переиспользуем из heys_user_v12.js)
  function calcSleepNorm(age, gender) {
    let baseMin, baseMax, explanation;
    
    if (age < 13) {
      baseMin = 9; baseMax = 12;
      explanation = 'дети 6-12 лет: 9-12ч';
    } else if (age < 18) {
      baseMin = 8; baseMax = 10;
      explanation = 'подростки 13-17: 8-10ч';
    } else if (age < 26) {
      baseMin = 7; baseMax = 9;
      explanation = 'молодые 18-25: 7-9ч';
    } else if (age < 65) {
      baseMin = 7; baseMax = 9;
      explanation = 'взрослые 26-64: 7-9ч';
    } else {
      baseMin = 7; baseMax = 8;
      explanation = 'пожилые 65+: 7-8ч';
    }
    
    const genderBonus = gender === 'Женский' ? 0.3 : 0;
    const recommended = Math.round(((baseMin + baseMax) / 2 + genderBonus) * 2) / 2;
    
    return {
      hours: recommended,
      range: `${baseMin}-${baseMax}`,
      explanation: explanation + (genderBonus > 0 ? ' +20мин жен.' : '')
    };
  }

  // Расчёт норм БЖУ по цели, полу и возрасту
  function calcNormsFromGoal(deficitPct, gender = 'Мужской', age = 30) {
    const isFemale = gender === 'Женский';
    
    let proteinPct, carbsPct, fatPct;
    
    if (deficitPct <= -15) {
      if (isFemale) {
        proteinPct = 30; carbsPct = 35; fatPct = 35;
      } else {
        proteinPct = 35; carbsPct = 40; fatPct = 25;
      }
    } else if (deficitPct <= -5) {
      if (isFemale) {
        proteinPct = 28; carbsPct = 40; fatPct = 32;
      } else {
        proteinPct = 30; carbsPct = 45; fatPct = 25;
      }
    } else if (deficitPct <= 5) {
      if (isFemale) {
        proteinPct = 25; carbsPct = 45; fatPct = 30;
      } else {
        proteinPct = 25; carbsPct = 50; fatPct = 25;
      }
    } else {
      if (isFemale) {
        proteinPct = 28; carbsPct = 47; fatPct = 25;
      } else {
        proteinPct = 30; carbsPct = 50; fatPct = 20;
      }
    }
    
    // Корректировка по возрасту
    if (age >= 60) {
      proteinPct += 5;
      carbsPct -= 5;
    } else if (age >= 40) {
      proteinPct += 3;
      carbsPct -= 3;
    }
    
    // Нормализация
    const total = proteinPct + carbsPct + fatPct;
    if (total !== 100) {
      const factor = 100 / total;
      proteinPct = Math.round(proteinPct * factor);
      carbsPct = Math.round(carbsPct * factor);
      fatPct = 100 - proteinPct - carbsPct;
    }
    
    return {
      carbsPct,
      proteinPct,
      simpleCarbPct: 30,
      badFatPct: 30,
      superbadFatPct: 5,
      fiberPct: 14,
      giPct: 55,
      harmPct: 10
    };
  }

  // Расчёт BMI
  function calcBMI(weight, height) {
    if (!weight || !height) return 0;
    const heightM = height / 100;
    return weight / (heightM * heightM);
  }

  // Категория BMI
  function getBMICategory(bmi) {
    if (bmi < 18.5) return { label: '⚠️ Недостаток веса', color: '#eab308' };
    if (bmi < 25) return { label: '✅ Норма', color: '#22c55e' };
    if (bmi < 30) return { label: '⚠️ Избыточный вес', color: '#f97316' };
    return { label: '🔴 Ожирение', color: '#ef4444' };
  }

  // Расчёт времени до цели
  function calcTimeToGoal(currentWeight, goalWeight, deficitPct) {
    const diff = Math.abs(goalWeight - currentWeight);
    if (diff < 0.5) return '✨ Уже на цели!';
    
    // Безопасная скорость: 0.5-1 кг/нед в зависимости от дефицита
    let weeklyRate;
    const absPct = Math.abs(deficitPct);
    if (absPct >= 15) weeklyRate = 0.8;
    else if (absPct >= 10) weeklyRate = 0.6;
    else weeklyRate = 0.4;
    
    const weeks = Math.ceil(diff / weeklyRate);
    const months = Math.floor(weeks / 4);
    
    if (months >= 12) return `~${Math.floor(months/12)} год${months >= 24 ? 'а' : ''}`;
    if (months > 0) return `~${months} мес`;
    return `~${weeks} нед`;
  }

  // Smart default для инсулиновой волны
  function getSmartInsulinDefault(age) {
    if (age < 30) return 2.5;
    if (age < 50) return 3;
    return 4;
  }

  // ============================================================
  // ШАГ 1: PERSONAL (имя, пол, дата рождения, цикл)
  // ============================================================

  function ProfilePersonalComponent({ data, onChange }) {
    const [showCycleHint, setShowCycleHint] = useState(false);
    const [showBirthDateHint, setShowBirthDateHint] = useState(false);

    const firstName = data.firstName || '';
    const gender = data.gender || 'Мужской';
    const birthDate = data.birthDate || '';
    const cycleTrackingEnabled = data.cycleTrackingEnabled || false;

    const age = birthDate ? calcAgeFromBirthDate(birthDate) : 0;
    const isFemale = gender === 'Женский';

    return React.createElement('div', { className: 'flex flex-col gap-6 p-4' },
      // Имя (optional)
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '👤 Как вас зовут? (необязательно)'),
        React.createElement('input', {
          type: 'text',
          value: firstName,
          onChange: (e) => onChange({ ...data, firstName: e.target.value }),
          placeholder: 'Ваше имя',
          className: 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
        })
      ),

      // Пол (обязательно)
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '👤 Пол *'),
        React.createElement('div', { className: 'grid grid-cols-3 gap-3' },
          ['Мужской', 'Женский', 'Другое'].map(g =>
            React.createElement('button', {
              key: g,
              type: 'button',
              onClick: () => {
                onChange({ ...data, gender: g });
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate(10);
                }
              },
              className: `px-4 py-3 rounded-xl border-2 font-medium transition-all ${
                gender === g
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 scale-105'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-300'
              }`,
              style: gender === g ? { animation: 'pulse 0.3s ease-out' } : {}
            }, g)
          )
        )
      ),

      // Дата рождения (обязательно)
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '🎂 Дата рождения *'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowBirthDateHint(!showBirthDateHint),
            className: 'text-xs text-gray-500 hover:text-emerald-600 transition-colors'
          }, '?')
        ),
        showBirthDateHint && React.createElement('div', {
          className: 'text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
          style: { animation: 'fadeIn 0.2s ease-out' }
        },
          'Возраст влияет на норму сна и потребность в белке.',
          React.createElement('br'),
          React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'Источник: National Sleep Foundation, 2015; Examine.com')
        ),
        React.createElement('input', {
          type: 'date',
          value: birthDate,
          onChange: (e) => onChange({ ...data, birthDate: e.target.value }),
          max: new Date().toISOString().split('T')[0],
          className: 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
        }),
        age > 0 && React.createElement('p', { className: 'text-sm text-gray-600' }, `(${age} лет)`)
      ),

      // Трекинг цикла (только для женщин)
      isFemale && React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '🌸 Отслеживать менструальный цикл?'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowCycleHint(!showCycleHint),
            className: 'text-xs text-gray-500 hover:text-emerald-600 transition-colors'
          }, '?')
        ),
        showCycleHint && React.createElement('div', {
          className: 'text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
          style: { animation: 'fadeIn 0.2s ease-out' }
        },
          'HEYS адаптирует нормы калорий и воды под фазы цикла.',
          React.createElement('br'),
          'Можно включить позже в профиле.'
        ),
        React.createElement('button', {
          type: 'button',
          onClick: () => {
            onChange({ ...data, cycleTrackingEnabled: !cycleTrackingEnabled });
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(10);
            }
          },
          className: `px-6 py-3 rounded-xl border-2 font-medium transition-all ${
            cycleTrackingEnabled
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
              : 'border-gray-300 bg-white text-gray-700'
          }`
        }, cycleTrackingEnabled ? '✓ Включено' : 'Выключено')
      )
    );
  }

  registerStep('profile-personal', {
    title: 'Персональные данные',
    hint: 'Расскажите о себе',
    icon: '👤',
    component: ProfilePersonalComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {});
      return {
        firstName: profile.firstName || '',
        gender: profile.gender || 'Мужской',
        birthDate: profile.birthDate || '',
        cycleTrackingEnabled: profile.cycleTrackingEnabled || false
      };
    },
    validate: (data) => {
      if (!data.gender) return 'Пожалуйста, укажите пол';
      if (!data.birthDate) return 'Пожалуйста, укажите дату рождения';
      return null;
    }
  });

  // ============================================================
  // ШАГ 2: BODY (вес, рост, целевой вес)
  // ============================================================

  function ProfileBodyComponent({ data, onChange }) {
    const [showGoalHint, setShowGoalHint] = useState(false);

    const weight = data.weight || 70;
    const height = data.height || 175;
    const weightGoal = data.weightGoal || weight;

    const bmi = calcBMI(weight, height);
    const bmiCat = getBMICategory(bmi);
    const weightDiff = weightGoal - weight;
    
    const weightValues = useMemo(() => Array.from({ length: 171 }, (_, i) => 30 + i), []);
    const heightValues = useMemo(() => Array.from({ length: 111 }, (_, i) => 120 + i), []);

    return React.createElement('div', { className: 'flex flex-col gap-6 p-4' },
      // Текущий вес
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '⚖️ Текущий вес (кг) *'),
        React.createElement(WheelPicker, {
          values: weightValues,
          value: weight,
          onChange: (v) => onChange({ ...data, weight: v }),
          label: 'кг'
        })
      ),

      // Рост
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '📏 Рост (см) *'),
        React.createElement(WheelPicker, {
          values: heightValues,
          value: height,
          onChange: (v) => onChange({ ...data, height: v }),
          label: 'см'
        })
      ),

      // BMI (показывается автоматически)
      bmi > 0 && React.createElement('div', {
        className: 'bg-gray-50 rounded-xl p-4 border border-gray-200'
      },
        React.createElement('div', { className: 'flex justify-between items-center' },
          React.createElement('span', { className: 'text-sm text-gray-600' }, '📊 ИМТ:'),
          React.createElement('span', {
            className: 'font-medium',
            style: { color: bmiCat.color }
          }, `${bmi.toFixed(1)} — ${bmiCat.label}`)
        )
      ),

      // Целевой вес
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '🎯 Целевой вес (кг) *'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowGoalHint(!showGoalHint),
            className: 'text-xs text-gray-500 hover:text-emerald-600 transition-colors'
          }, '?')
        ),
        showGoalHint && React.createElement('div', {
          className: 'text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
          style: { animation: 'fadeIn 0.2s ease-out' }
        },
          'Безопасная скорость: 0.5-1 кг/неделю.',
          React.createElement('br'),
          React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'Источник: CDC, NHS guidelines')
        ),
        React.createElement(WheelPicker, {
          values: weightValues,
          value: weightGoal,
          onChange: (v) => onChange({ ...data, weightGoal: v }),
          label: 'кг'
        })
      ),

      // Прогноз (показывается автоматически)
      Math.abs(weightDiff) >= 0.5 && React.createElement('div', {
        className: 'bg-emerald-50 rounded-xl p-4 border border-emerald-200'
      },
        React.createElement('div', { className: 'text-sm' },
          React.createElement('span', { className: 'text-gray-600' }, '⏱ Осталось: '),
          React.createElement('span', { className: 'font-medium text-emerald-700' },
            `${Math.abs(weightDiff).toFixed(1)} кг`
          )
        )
      )
    );
  }

  registerStep('profile-body', {
    title: 'Физические данные',
    hint: 'Текущие параметры и цели',
    icon: '📊',
    component: ProfileBodyComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {});
      return {
        weight: profile.weight || 70,
        height: profile.height || 175,
        weightGoal: profile.weightGoal || profile.weight || 70
      };
    },
    validate: (data) => {
      if (!data.weight || data.weight < 30) return 'Укажите корректный вес';
      if (!data.height || data.height < 120) return 'Укажите корректный рост';
      if (!data.weightGoal || data.weightGoal < 30) return 'Укажите целевой вес';
      return null;
    }
  });

  // ============================================================
  // ШАГ 3: GOALS (цель: дефицит/профицит)
  // ============================================================

  function ProfileGoalsComponent({ data, onChange }) {
    const [showHints, setShowHints] = useState({});
    
    const deficitPctTarget = data.deficitPctTarget ?? 0;
    const selectedPreset = GOAL_PRESETS.find(p => p.value === deficitPctTarget) || GOAL_PRESETS[3];

    // Для авто-норм нужны данные из предыдущих шагов
    const profile = lsGet('heys_profile', {});
    const gender = data.gender || profile.gender || 'Мужской';
    const birthDate = data.birthDate || profile.birthDate || '';
    const age = birthDate ? calcAgeFromBirthDate(birthDate) : profile.age || 30;

    const norms = calcNormsFromGoal(deficitPctTarget, gender, age);
    const isFemale = gender === 'Женский';

    const toggleHint = (key) => {
      setShowHints(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return React.createElement('div', { className: 'flex flex-col gap-6 p-4' },
      // Заголовок
      React.createElement('div', { className: 'text-center' },
        React.createElement('h3', { className: 'text-lg font-semibold text-gray-800 mb-2' }, 'Какая у вас цель?'),
        React.createElement('p', { className: 'text-sm text-gray-600' }, 'Это определит ваш целевой калораж')
      ),

      // Карточки целей
      React.createElement('div', { className: 'grid grid-cols-1 gap-3' },
        GOAL_PRESETS.map((preset, idx) =>
          React.createElement('div', {
            key: preset.value,
            style: { animation: `fadeIn 0.3s ease-out ${idx * 0.05}s both` }
          },
            React.createElement('button', {
              type: 'button',
              onClick: () => {
                onChange({ ...data, deficitPctTarget: preset.value });
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate(10);
                }
              },
              className: `w-full p-4 rounded-xl border-2 text-left transition-all ${
                deficitPctTarget === preset.value
                  ? 'border-emerald-500 bg-emerald-50 scale-105'
                  : 'border-gray-300 bg-white hover:border-emerald-300'
              }`,
              style: deficitPctTarget === preset.value ? {
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                animation: 'scaleIn 0.2s ease-out'
              } : {}
            },
              React.createElement('div', { className: 'flex items-center justify-between' },
                React.createElement('div', { className: 'flex items-center gap-3' },
                  React.createElement('span', { className: 'text-2xl' }, preset.emoji),
                  React.createElement('div', null,
                    React.createElement('div', { className: 'font-medium text-gray-800' }, preset.label),
                    React.createElement('div', { className: 'text-xs text-gray-500' }, 
                      `${preset.value > 0 ? '+' : ''}${preset.value}%`
                    )
                  )
                ),
                (preset.value === -20 || preset.value === 15) && React.createElement('button', {
                  type: 'button',
                  onClick: (e) => {
                    e.stopPropagation();
                    toggleHint(`goal_${preset.value}`);
                  },
                  className: 'text-gray-500 hover:text-emerald-600 text-sm'
                }, '?')
              )
            ),
            showHints[`goal_${preset.value}`] && React.createElement('div', {
              className: 'mt-2 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
              style: { animation: 'fadeIn 0.2s ease-out' }
            },
              preset.value === -20 
                ? 'Быстрый результат, сложнее удержать. Белок 1.6-2.4 г/кг. Источник: ISSN Position Stand, 2017'
                : 'Профицит для роста мышц. Белок 1.6-2.2 г/кг + тренировки. Источник: ISSN Position Stand, 2017'
            )
          )
        )
      ),

      // Авто-нормы БЖУ
      React.createElement('div', {
        className: 'bg-gradient-to-br from-emerald-50 to-blue-50 rounded-xl p-4 border border-emerald-200',
        style: { animation: 'fadeIn 0.4s ease-out 0.3s both' }
      },
        React.createElement('div', { className: 'text-center mb-3' },
          React.createElement('div', { className: 'text-sm font-medium text-gray-700 mb-1' }, '📊 Ваши нормы'),
          React.createElement('div', { className: 'text-lg font-bold text-emerald-700' },
            `Б ${norms.proteinPct}% / У ${norms.carbsPct}% / Ж ${100 - norms.proteinPct - norms.carbsPct}%`
          )
        ),
        isFemale && deficitPct <= -10 && React.createElement('div', {
          className: 'text-xs text-gray-600 text-center'
        }, 'ℹ️ Больше жиров для гормонального баланса')
      )
    );
  }

  registerStep('profile-goals', {
    title: 'Ваша цель',
    hint: 'Похудение, набор или поддержание',
    icon: '🎯',
    component: ProfileGoalsComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {});
      return {
        deficitPctTarget: profile.deficitPctTarget ?? 0
      };
    },
    validate: (data) => {
      if (data.deficitPctTarget === undefined || data.deficitPctTarget === null) {
        return 'Пожалуйста, выберите цель';
      }
      return null;
    }
  });

  // ============================================================
  // ШАГ 4: METABOLISM (норма сна, инсулиновая волна)
  // ============================================================

  function ProfileMetabolismComponent({ data, onChange }) {
    const [showSleepHint, setShowSleepHint] = useState(false);
    const [showInsulinHint, setShowInsulinHint] = useState(false);
    const [showInsulinPresetHints, setShowInsulinPresetHints] = useState({});

    const profile = lsGet('heys_profile', {});
    const gender = data.gender || profile.gender || 'Мужской';
    const birthDate = data.birthDate || profile.birthDate || '';
    const age = birthDate ? calcAgeFromBirthDate(birthDate) : profile.age || 30;

    const sleepNorm = calcSleepNorm(age, gender);
    const sleepHours = data.sleepHours ?? sleepNorm.hours;
    const insulinWaveHours = data.insulinWaveHours ?? getSmartInsulinDefault(age);

    const sleepValues = useMemo(() => {
      const arr = [];
      for (let i = 4; i <= 12; i += 0.5) {
        arr.push(i);
      }
      return arr;
    }, []);

    const toggleInsulinPresetHint = (value) => {
      setShowInsulinPresetHints(prev => ({ ...prev, [value]: !prev[value] }));
    };

    return React.createElement('div', { className: 'flex flex-col gap-6 p-4' },
      // Норма сна
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '💤 Норма сна (часов)'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowSleepHint(!showSleepHint),
            className: 'text-xs text-gray-500 hover:text-emerald-600 transition-colors'
          }, '?')
        ),
        showSleepHint && React.createElement('div', {
          className: 'text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
          style: { animation: 'fadeIn 0.2s ease-out' }
        },
          `Рассчитано по возрасту: ${sleepNorm.explanation}.`,
          React.createElement('br'),
          React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'Источник: National Sleep Foundation, 2015')
        ),
        React.createElement('div', { className: 'bg-emerald-50 rounded-xl p-3 border border-emerald-200 mb-2' },
          React.createElement('div', { className: 'text-sm text-gray-700' },
            `💡 Рекомендовано: ${sleepNorm.hours}ч (${sleepNorm.range})`
          )
        ),
        React.createElement(WheelPicker, {
          values: sleepValues,
          value: sleepHours,
          onChange: (v) => onChange({ ...data, sleepHours: v }),
          label: 'ч'
        })
      ),

      // Инсулиновая волна
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '⏱ Инсулиновая волна'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowInsulinHint(!showInsulinHint),
            className: 'text-xs text-gray-500 hover:text-emerald-600 transition-colors'
          }, '?')
        ),
        showInsulinHint && React.createElement('div', {
          className: 'text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
          style: { animation: 'fadeIn 0.2s ease-out' }
        },
          'Период после еды, когда организм накапливает энергию. Жиросжигание начинается после его окончания.',
          React.createElement('br'),
          React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'Источник: Ludwig et al., JAMA 2018')
        ),
        
        // Карточки пресетов
        React.createElement('div', { className: 'grid grid-cols-1 gap-3 mt-3' },
          INSULIN_PRESETS.map((preset, idx) => {
            const isSelected = Math.abs(insulinWaveHours - preset.value) < 0.1;
            const isDefault = Math.abs(getSmartInsulinDefault(age) - preset.value) < 0.1;
            
            return React.createElement('div', {
              key: preset.value,
              style: { animation: `fadeIn 0.3s ease-out ${idx * 0.05}s both` }
            },
              React.createElement('button', {
                type: 'button',
                onClick: () => {
                  onChange({ ...data, insulinWaveHours: preset.value });
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                },
                className: `w-full p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-300 bg-white hover:border-emerald-300'
                }`
              },
                React.createElement('div', { className: 'flex items-center justify-between' },
                  React.createElement('div', null,
                    React.createElement('div', { className: 'font-medium text-gray-800' },
                      preset.label,
                      isDefault && ' ✓'
                    ),
                    React.createElement('div', { className: 'text-xs text-gray-500 mt-1' }, preset.desc)
                  ),
                  preset.value === 4.5 && React.createElement('button', {
                    type: 'button',
                    onClick: (e) => {
                      e.stopPropagation();
                      toggleInsulinPresetHint(preset.value);
                    },
                    className: 'text-gray-500 hover:text-emerald-600 text-sm'
                  }, '?')
                )
              ),
              showInsulinPresetHints[preset.value] && React.createElement('div', {
                className: 'mt-2 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200',
                style: { animation: 'fadeIn 0.2s ease-out' }
              },
                'При инсулинорезистентности волна длиннее. Рекомендуется консультация врача.',
                React.createElement('br'),
                React.createElement('span', { className: 'text-[10px] text-gray-500' }, 'Источник: DeFronzo, 1979')
              )
            );
          })
        )
      )
    );
  }

  registerStep('profile-metabolism', {
    title: 'Метаболизм',
    hint: 'Сон и инсулиновая волна',
    icon: '⚡',
    component: ProfileMetabolismComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {});
      const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : profile.age || 30;
      const sleepNorm = calcSleepNorm(age, profile.gender || 'Мужской');
      
      return {
        sleepHours: profile.sleepHours || sleepNorm.hours,
        insulinWaveHours: profile.insulinWaveHours || getSmartInsulinDefault(age)
      };
    },
    validate: (data) => {
      if (!data.insulinWaveHours) return 'Пожалуйста, выберите тип метаболизма';
      return null;
    },
    save: (data, allStepsData) => {
      // Собираем все данные из 4 шагов
      const step1 = allStepsData['profile-personal'] || {};
      const step2 = allStepsData['profile-body'] || {};
      const step3 = allStepsData['profile-goals'] || {};
      const step4 = allStepsData['profile-metabolism'] || {};

      const profile = lsGet('heys_profile', {});
      
      // Обновляем профиль
      const updatedProfile = {
        ...profile,
        firstName: step1.firstName || profile.firstName || '',
        gender: step1.gender || profile.gender || 'Мужской',
        birthDate: step1.birthDate || profile.birthDate || '',
        age: step1.birthDate ? calcAgeFromBirthDate(step1.birthDate) : profile.age || 30,
        cycleTrackingEnabled: step1.cycleTrackingEnabled || false,
        weight: step2.weight || profile.weight || 70,
        height: step2.height || profile.height || 175,
        weightGoal: step2.weightGoal || profile.weightGoal || step2.weight || 70,
        deficitPctTarget: step3.deficitPctTarget ?? profile.deficitPctTarget ?? 0,
        sleepHours: step4.sleepHours || profile.sleepHours || 8,
        insulinWaveHours: step4.insulinWaveHours || profile.insulinWaveHours || 3,
        profileCompleted: true
      };

      lsSet('heys_profile', updatedProfile);

      // Авторасчёт норм БЖУ
      const norms = calcNormsFromGoal(
        updatedProfile.deficitPctTarget,
        updatedProfile.gender,
        updatedProfile.age
      );
      lsSet('heys_norms', norms);

      console.log('[ProfileSteps] Profile saved:', updatedProfile);
      console.log('[ProfileSteps] Norms calculated:', norms);
    }
  });

  // ============================================================
  // ЭКСПОРТ
  // ============================================================

  // Проверка: нужно ли показывать profile-шаги
  function isProfileIncomplete(profile) {
    if (profile.profileCompleted === true) return false;
    
    const noGender = !profile.gender || profile.gender === 'Мужской';
    const isDefaultWeight = profile.weight === 70;
    const isDefaultHeight = profile.height === 175;
    const noBirthDate = !profile.birthDate;
    const isDefaultAge = profile.age === 30;
    
    return noGender && isDefaultWeight && isDefaultHeight && (noBirthDate && isDefaultAge);
  }

  HEYS.ProfileSteps = {
    isProfileIncomplete,
    calcNormsFromGoal,
    calcAgeFromBirthDate,
    calcSleepNorm
  };

  console.log('[heys_profile_step_v1] Profile steps registered:', [
    'profile-personal',
    'profile-body',
    'profile-goals',
    'profile-metabolism'
  ]);

})(window);
