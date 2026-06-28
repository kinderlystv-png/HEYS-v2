// heys_profile_step_v1.js — Wizard первого входа: 4 шага заполнения профиля
// Personal → Body → Goals → Metabolism
(function (global) {
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
    { value: 15, label: 'Активный набор', emoji: '💪💪', color: '#3b82f6' }
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

  const buildFullName = HEYS.utils && typeof HEYS.utils.buildFullName === 'function'
    ? HEYS.utils.buildFullName
    : (firstName, lastName) => [firstName, lastName]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');

  function splitPendingClientName(name) {
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!cleanName) return { firstName: '', lastName: '' };
    const parts = cleanName.split(' ');
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ')
    };
  }

  function getCurrentClientId() {
    let currentClientId = localStorage.getItem('heys_client_current');
    if (currentClientId && currentClientId.startsWith('"')) {
      try { currentClientId = JSON.parse(currentClientId); } catch (e) { }
    }
    return currentClientId || '';
  }

  function readDayDataScoped(dateKey, fallback = {}) {
    const reader = HEYS.MorningCheckinUtils?.readDayV2ScopedFirst;
    if (typeof reader === 'function') return reader(dateKey, fallback);
    return lsGet(`heys_dayv2_${dateKey}`, fallback);
  }

  function writeDayDataScoped(dateKey, dayData) {
    const writer = HEYS.MorningCheckinUtils?.writeDayV2Scoped;
    if (typeof writer === 'function') {
      writer(dateKey, dayData);
      return;
    }
    lsSet(`heys_dayv2_${dateKey}`, dayData);
  }

  function syncCurrentClientName(fullName, source, options = {}) {
    const cleanName = String(fullName || '').trim();
    const currentClientId = getCurrentClientId();
    if (!currentClientId || !cleanName) return Promise.resolve(true);
    try {
      const clientsRaw = localStorage.getItem('heys_clients');
      const clients = clientsRaw ? JSON.parse(clientsRaw) : [];
      const safeClients = Array.isArray(clients) ? clients : [];
      const updatedClients = safeClients.map(c =>
        c.id === currentClientId ? { ...c, name: cleanName } : c
      );
      lsSet('heys_clients', updatedClients);
      console.log('[ProfileSteps] Client name synced:', cleanName, 'for clientId:', currentClientId);

      if (HEYS.AppClientManagement && typeof HEYS.AppClientManagement.notifyClientsUpdated === 'function') {
        HEYS.AppClientManagement.notifyClientsUpdated(updatedClients, source);
      } else {
        window.dispatchEvent(new CustomEvent('heys:clients-updated', {
          detail: { clients: updatedClients, source }
        }));
      }

      if (options.syncCloud && HEYS.YandexAPI?.rpc) {
        const sessionToken = typeof HEYS !== 'undefined' && HEYS.auth && HEYS.auth.getSessionToken ? HEYS.auth.getSessionToken() : localStorage.getItem('heys_session_token');
        const rpcParams = { p_name: cleanName };
        if (sessionToken) {
          const tokenStr = typeof sessionToken === 'string' ? sessionToken : JSON.stringify(sessionToken);
          rpcParams.p_session_token = tokenStr.replace(/"/g, '');
        }
        return HEYS.YandexAPI.rpc('update_client_profile_by_session', rpcParams)
          .then(result => {
            if (result && result.error) {
              console.error('[ProfileSteps] failed to update profile in cloud:', result.error);
            } else {
              console.log('[ProfileSteps] client profile name synced to cloud successfully!');
            }
            return true;
          })
          .catch(e => {
            console.error('[ProfileSteps] RPC error:', e);
            return true;
          });
      }
      return Promise.resolve(true);
    } catch (e) {
      console.warn('[ProfileSteps] Failed to sync client name:', e);
      return Promise.resolve(true);
    }
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
    // 🔧 v2.0.2: Принудительное приведение к числу (иногда приходит строка)
    const deficitPctNum = Number(deficitPct) || 0;
    const ageNum = Number(age) || 30;
    const isFemale = gender === 'Женский';

    console.log('[calcNormsFromGoal] Input:', { deficitPct, deficitPctNum, gender, age: ageNum });

    let proteinPct, carbsPct, fatPct;

    if (deficitPctNum <= -15) {
      if (isFemale) {
        proteinPct = 30; carbsPct = 35; fatPct = 35;
      } else {
        proteinPct = 35; carbsPct = 40; fatPct = 25;
      }
    } else if (deficitPctNum <= -5) {
      if (isFemale) {
        proteinPct = 28; carbsPct = 40; fatPct = 32;
      } else {
        proteinPct = 30; carbsPct = 45; fatPct = 25;
      }
    } else if (deficitPctNum <= 5) {
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
    if (ageNum >= 60) {
      proteinPct += 5;
      carbsPct -= 5;
    } else if (ageNum >= 40) {
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
    // Защита от undefined/NaN значений
    const cw = Number(currentWeight) || 70;
    const gw = Number(goalWeight) || cw;
    const dp = Number(deficitPct) || 0;

    const diff = Math.abs(gw - cw);
    if (diff < 0.5 || !isFinite(diff)) return '✨ Уже на цели!';

    // Безопасная скорость: 0.5-1 кг/нед в зависимости от дефицита
    let weeklyRate;
    const absPct = Math.abs(dp);
    if (absPct >= 15) weeklyRate = 0.8;
    else if (absPct >= 10) weeklyRate = 0.6;
    else weeklyRate = 0.4;

    const weeks = Math.ceil(diff / weeklyRate);
    const months = Math.floor(weeks / 4);

    if (!isFinite(weeks) || weeks <= 0) return '✨ Уже на цели!';
    if (months >= 12) return `~${Math.floor(months / 12)} год${months >= 24 ? 'а' : ''}`;
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
  // HintTooltip — попап-подсказка (не сдвигает контент)
  // ============================================================

  function HintTooltip({ show, onClose, children, position = 'bottom' }) {
    if (!show) return null;

    const positionStyles = {
      bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
      top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
      left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
      right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' }
    };

    return React.createElement('div', {
      className: 'absolute z-50',
      style: { ...positionStyles[position], minWidth: '200px', maxWidth: '280px' }
    },
      React.createElement('div', {
        className: 'bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-xs text-gray-600',
        style: { animation: 'fadeIn 0.15s ease-out' },
        onClick: (e) => e.stopPropagation()
      },
        children,
        React.createElement('button', {
          type: 'button',
          onClick: onClose,
          className: 'absolute -top-2 -right-2 w-5 h-5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 text-xs flex items-center justify-center transition-colors'
        }, '×')
      ),
      // Backdrop для закрытия
      React.createElement('div', {
        className: 'fixed inset-0 z-[-1]',
        onClick: onClose
      })
    );
  }

  // ============================================================
  // ШАГ 1: PERSONAL (имя, фамилия, пол, дата рождения, цикл)
  // ============================================================

  function ProfilePersonalComponent({ data, onChange }) {
    const [showCycleHint, setShowCycleHint] = useState(false);
    const [showBirthDateHint, setShowBirthDateHint] = useState(false);

    // Получаем WheelPicker из StepModal
    const WheelPicker = HEYS.StepModal?.WheelPicker;

    const firstName = data.firstName || '';
    const lastName = data.lastName || '';
    const gender = data.gender || 'Мужской';
    const cycleTrackingEnabled = data.cycleTrackingEnabled || false;

    // Разбираем дату на компоненты
    const currentYear = new Date().getFullYear();
    const birthDay = data.birthDay || 1;
    const birthMonth = data.birthMonth || 1;
    const birthYear = data.birthYear || (currentYear - 25); // дефолт 25 лет

    // Собираем дату в ISO формат для совместимости
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

    const age = calcAgeFromBirthDate(birthDate);
    const isFemale = gender === 'Женский';

    // Значения для пикеров
    const daysInMonth = new Date(birthYear, birthMonth, 0).getDate();
    const dayValues = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
    const monthValues = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], []);
    const yearValues = useMemo(() => {
      const years = [];
      for (let y = currentYear - 10; y >= 1940; y--) years.push(y);
      return years;
    }, [currentYear]);

    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const formatMonth = (m) => monthNames[m - 1];
    const pad2 = (v) => String(v).padStart(2, '0');

    return React.createElement('div', { className: 'flex flex-col gap-6 p-4' },
      // Имя и фамилия
      React.createElement('div', { className: 'grid grid-cols-1 gap-3' },
        React.createElement('div', { className: 'flex flex-col gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '👤 Имя *'),
          React.createElement('input', {
            type: 'text',
            value: firstName,
            onChange: (e) => onChange({ ...data, firstName: e.target.value }),
            placeholder: 'Имя',
            autoComplete: 'given-name',
            className: `w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${!firstName.trim() ? 'border-red-300 bg-red-50' : 'border-gray-300'
              }`
          })
        ),
        React.createElement('div', { className: 'flex flex-col gap-2' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '👤 Фамилия'),
          React.createElement('input', {
            type: 'text',
            value: lastName,
            onChange: (e) => onChange({ ...data, lastName: e.target.value }),
            placeholder: 'Фамилия',
            autoComplete: 'family-name',
            className: 'w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
          })
        )
      ),

      // Пол (обязательно) - только Мужской/Женский
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '👤 Пол *'),
        React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
          ['Мужской', 'Женский'].map(g =>
            React.createElement('button', {
              key: g,
              type: 'button',
              onClick: () => {
                onChange({ ...data, gender: g });
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                  navigator.vibrate(10);
                }
              },
              className: `px-4 py-3 rounded-xl border-2 font-medium transition-all ${gender === g
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 scale-105'
                : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-300'
                }`,
              style: gender === g ? { animation: 'pulse 0.3s ease-out' } : {}
            }, g)
          )
        )
      ),

      // Дата рождения (WheelPickers v2)
      React.createElement('div', { className: 'flex flex-col gap-3' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('div', { className: 'flex items-center gap-2 relative' },
            React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '🎂 Дата рождения *'),
            React.createElement('button', {
              type: 'button',
              onClick: () => setShowBirthDateHint(!showBirthDateHint),
              className: 'w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium hover:bg-emerald-100 hover:text-emerald-600 transition-colors flex items-center justify-center'
            }, '?'),
            React.createElement(HintTooltip, {
              show: showBirthDateHint,
              onClose: () => setShowBirthDateHint(false)
            },
              'Возраст влияет на норму сна и потребность в белке.',
              React.createElement('br'),
              React.createElement('span', { className: 'text-[10px] text-gray-400 mt-1 block' }, 'Источник: National Sleep Foundation, 2015')
            )
          ),
          age > 0 && React.createElement('span', {
            className: 'text-lg font-bold text-emerald-600'
          }, `${age} лет`)
        ),
        // WheelPickers: День / Месяц / Год
        WheelPicker ? React.createElement('div', { className: 'flex justify-center gap-2 bg-gray-50 rounded-xl p-4' },
          // День
          React.createElement(WheelPicker, {
            values: dayValues,
            value: birthDay,
            onChange: (v) => onChange({ ...data, birthDay: v }),
            label: 'день',
            formatValue: pad2,
            wrap: true
          }),
          // Месяц
          React.createElement(WheelPicker, {
            values: monthValues,
            value: birthMonth,
            onChange: (v) => onChange({ ...data, birthMonth: v }),
            label: 'месяц',
            formatValue: formatMonth,
            wrap: true
          }),
          // Год
          React.createElement(WheelPicker, {
            values: yearValues,
            value: birthYear,
            onChange: (v) => onChange({ ...data, birthYear: v }),
            label: 'год',
            wrap: false
          })
        ) : React.createElement('input', {
          type: 'date',
          value: birthDate,
          onChange: (e) => {
            const [y, m, d] = e.target.value.split('-').map(Number);
            onChange({ ...data, birthYear: y, birthMonth: m, birthDay: d });
          },
          max: new Date().toISOString().split('T')[0],
          className: 'w-full px-4 py-3 border border-gray-300 rounded-xl'
        })
      ),

      // Активация трекинга особого периода (только для женщин)
      isFemale && React.createElement('div', {
        className: 'flex items-center justify-between p-3 bg-pink-50 rounded-xl border border-pink-200',
        style: { animation: 'fadeIn 0.3s ease-out' }
      },
        React.createElement('div', { className: 'flex flex-col gap-0.5' },
          React.createElement('div', { className: 'flex items-center gap-2 relative' },
            React.createElement('span', { className: 'text-xs font-medium text-gray-700' }, '🌸 Учитывать особый период?'),
            React.createElement('button', {
              type: 'button',
              onClick: () => setShowCycleHint(!showCycleHint),
              className: 'w-4 h-4 rounded-full bg-pink-200 text-pink-600 text-[10px] font-medium hover:bg-pink-300 transition-colors flex items-center justify-center'
            }, '?'),
            React.createElement(HintTooltip, {
              show: showCycleHint,
              onClose: () => setShowCycleHint(false)
            }, 'HEYS адаптирует калории и воду под фазы цикла. Можно изменить позже в настройках.')
          ),
          React.createElement('span', { className: 'text-[11px] text-gray-500' },
            cycleTrackingEnabled ? '✓ Нормы будут адаптироваться' : 'Включите, чтобы учесть в расчётах'
          )
        ),
        React.createElement('label', { className: 'toggle-switch', style: { transform: 'scale(0.85)' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: cycleTrackingEnabled,
            onChange: (e) => {
              onChange({ ...data, cycleTrackingEnabled: e.target.checked });
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(10);
              }
            }
          }),
          React.createElement('span', { className: 'toggle-slider' })
        )
      )
    );
  }

  registerStep('profile-personal', {
    title: 'Персональные данные',
    hint: 'Расскажите о себе',
    icon: '👤',
    component: ProfilePersonalComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {}) || {};
      const currentYear = new Date().getFullYear();

      // 🛡️ Устанавливаем флаг "регистрация в процессе" только для незавершённого профиля
      const hasProfileCompleted = profile.profileCompleted === true;
      const isDefaultGender = !profile.gender || profile.gender === 'Мужской';
      const isDefaultWeight = !profile.weight || profile.weight === 70;
      const isDefaultHeight = !profile.height || profile.height === 175;
      const noBirthDate = !profile.birthDate;
      const isDefaultAge = !profile.age || profile.age === 30;
      const isProbablyIncomplete = !hasProfileCompleted &&
        isDefaultGender && isDefaultWeight && isDefaultHeight && noBirthDate && isDefaultAge;

      if (isProbablyIncomplete) {
        lsSet('heys_registration_in_progress', 'true');
        console.warn('[ProfileSteps] registrationInProgress set (profile incomplete)', {
          profileCompleted: profile?.profileCompleted,
          hasFirstName: !!profile?.firstName,
          hasBirthDate: !!profile?.birthDate
        });
      } else {
        localStorage.removeItem('heys_registration_in_progress');
        console.warn('[ProfileSteps] registrationInProgress cleared (profile complete)', {
          profileCompleted: profile?.profileCompleted,
          hasFirstName: !!profile?.firstName,
          hasBirthDate: !!profile?.birthDate
        });
      }

      // Парсим существующую дату если есть
      let birthDay = 1, birthMonth = 1, birthYear = currentYear - 25;
      if (profile.birthDate) {
        const [y, m, d] = profile.birthDate.split('-').map(Number);
        if (y && m && d) {
          birthYear = y;
          birthMonth = m;
          birthDay = d;
        }
      }

      // 💡 Для новых клиентов — используем имя введённое куратором при создании
      // Читаем напрямую из localStorage (без scope), т.к. auth пишет туда без namespace
      let pendingName = '';
      try {
        const raw = localStorage.getItem('heys_pending_client_name');
        pendingName = raw ? JSON.parse(raw) : '';
      } catch (e) { }
      const pendingNameParts = splitPendingClientName(pendingName);
      const firstName = profile.firstName || pendingNameParts.firstName || '';
      const lastName = profile.lastName || pendingNameParts.lastName || '';

      return {
        firstName,
        lastName,
        gender: profile.gender || 'Мужской',
        birthDay,
        birthMonth,
        birthYear,
        // По умолчанию включён для женщин (можно выключить)
        cycleTrackingEnabled: profile.cycleTrackingEnabled !== undefined ? profile.cycleTrackingEnabled : true
      };
    },
    validate: (data) => {
      if (!data.firstName || !data.firstName.trim()) return 'Пожалуйста, укажите имя';
      if (!data.gender) return 'Пожалуйста, укажите пол';
      if (!data.birthYear || !data.birthMonth || !data.birthDay) return 'Пожалуйста, укажите дату рождения';
      return true;
    },
    getValidationMessage: (data) => {
      if (!data.firstName || !data.firstName.trim()) return 'Укажите ваше имя';
      if (!data.gender) return 'Выберите пол';
      if (!data.birthYear || !data.birthMonth || !data.birthDay) return 'Укажите дату рождения';
      return null;
    },
    save: (data) => {
      // Собираем дату в ISO формат перед сохранением
      const birthDate = `${data.birthYear}-${String(data.birthMonth).padStart(2, '0')}-${String(data.birthDay).padStart(2, '0')}`;
      const profile = lsGet('heys_profile', {}) || {};
      const firstName = String(data.firstName || '').trim();
      const lastName = String(data.lastName || '').trim();
      const fullName = buildFullName(firstName, lastName);
      profile.firstName = firstName;
      profile.lastName = lastName;
      profile.name = fullName;
      profile.displayName = fullName;
      profile.gender = data.gender;
      profile.birthDate = birthDate;
      profile.cycleTrackingEnabled = data.cycleTrackingEnabled;
      // Вычисляем возраст
      profile.age = calcAgeFromBirthDate(birthDate);
      profile.updatedAt = Date.now();
      lsSet('heys_profile', profile);

      // 💡 Очищаем pending name от куратора после сохранения профиля
      if (lsGet('heys_pending_client_name', '')) {
        localStorage.removeItem('heys_pending_client_name');
      }
      return syncCurrentClientName(fullName, 'profile-personal', { syncCloud: true });
    }
  });

  // ============================================================
  // ШАГ 2: BODY (вес, рост, целевой вес) — компактная раскладка
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

    return React.createElement('div', { className: 'flex flex-col gap-3 p-3' },
      // === Ряд 1: Вес и Рост в 2 карточки ===
      React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
        // Карточка веса
        React.createElement('div', {
          className: 'bg-white rounded-xl border border-gray-200 p-3 shadow-sm'
        },
          React.createElement('div', {
            className: 'bg-gray-100 rounded-lg px-3 py-1.5 mb-2 text-center'
          },
            React.createElement('span', { className: 'text-xs font-semibold text-gray-700' }, '⚖️ Вес')
          ),
          React.createElement(WheelPicker, {
            values: weightValues,
            value: weight,
            onChange: (v) => onChange({ ...data, weight: v }),
            label: 'кг',
            height: 100
          })
        ),
        // Карточка роста
        React.createElement('div', {
          className: 'bg-white rounded-xl border border-gray-200 p-3 shadow-sm'
        },
          React.createElement('div', {
            className: 'bg-gray-100 rounded-lg px-3 py-1.5 mb-2 text-center'
          },
            React.createElement('span', { className: 'text-xs font-semibold text-gray-700' }, '📏 Рост')
          ),
          React.createElement(WheelPicker, {
            values: heightValues,
            value: height,
            onChange: (v) => onChange({ ...data, height: v }),
            label: 'см',
            height: 100
          })
        )
      ),

      // === BMI — бейдж ===
      bmi > 0 && React.createElement('div', {
        className: 'flex items-center justify-center gap-2 py-2 px-4 rounded-xl border',
        style: {
          backgroundColor: bmiCat.color + '10',
          borderColor: bmiCat.color + '30'
        }
      },
        React.createElement('span', { className: 'text-xs text-gray-600' }, '📊 ИМТ:'),
        React.createElement('span', {
          className: 'text-sm font-bold',
          style: { color: bmiCat.color }
        }, `${bmi.toFixed(1)} — ${bmiCat.label}`)
      ),

      // === Карточка целевого веса ===
      React.createElement('div', {
        className: 'bg-white rounded-xl border border-gray-200 p-3 shadow-sm'
      },
        React.createElement('div', {
          className: 'bg-emerald-100 rounded-lg px-3 py-1.5 mb-2 flex items-center justify-center gap-2 relative'
        },
          React.createElement('span', { className: 'text-xs font-semibold text-emerald-700' }, '🎯 Целевой вес'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowGoalHint(!showGoalHint),
            className: 'w-4 h-4 rounded-full bg-emerald-200 text-emerald-600 text-[10px] font-bold hover:bg-emerald-300 transition-colors flex items-center justify-center'
          }, '?'),
          React.createElement(HintTooltip, {
            show: showGoalHint,
            onClose: () => setShowGoalHint(false)
          },
            'Безопасная скорость: 0.5-1 кг/неделю.',
            React.createElement('br'),
            React.createElement('span', { className: 'text-[10px] text-gray-400 mt-1 block' }, 'Источник: CDC, NHS guidelines')
          )
        ),
        React.createElement(WheelPicker, {
          values: weightValues,
          value: weightGoal,
          onChange: (v) => onChange({ ...data, weightGoal: v }),
          label: 'кг',
          height: 100
        }),
        // Прогноз внутри карточки
        Math.abs(weightDiff) >= 0.5 && React.createElement('div', {
          className: 'mt-2 pt-2 border-t border-gray-100 text-center'
        },
          React.createElement('span', { className: 'text-xs text-gray-500' }, '⏱ До цели: '),
          React.createElement('span', {
            className: 'text-sm font-bold',
            style: { color: weightDiff < 0 ? '#22c55e' : '#3b82f6' }
          },
            `${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(1)} кг`
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
      const profile = lsGet('heys_profile', {}) || {};
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
      return true;
    },
    getValidationMessage: (data) => {
      if (!data.weight || data.weight < 30) return 'Укажите вес (мин. 30 кг)';
      if (!data.height || data.height < 120) return 'Укажите рост (мин. 120 см)';
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
    const profile = lsGet('heys_profile', {}) || {};
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
              className: `w-full p-4 rounded-xl border-2 text-left transition-all ${deficitPctTarget === preset.value
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
                (preset.value === -20 || preset.value === 15) && React.createElement('div', { className: 'relative' },
                  React.createElement('button', {
                    type: 'button',
                    onClick: (e) => {
                      e.stopPropagation();
                      toggleHint(`goal_${preset.value}`);
                    },
                    className: 'w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium hover:bg-emerald-100 hover:text-emerald-600 transition-colors flex items-center justify-center'
                  }, '?'),
                  React.createElement(HintTooltip, {
                    show: showHints[`goal_${preset.value}`],
                    onClose: () => toggleHint(`goal_${preset.value}`),
                    position: 'left'
                  },
                    preset.value === -20
                      ? 'Быстрый результат, сложнее удержать. Белок 1.6-2.4 г/кг.'
                      : 'Профицит для роста мышц. Белок 1.6-2.2 г/кг + тренировки.',
                    React.createElement('span', { className: 'text-[10px] text-gray-400 block mt-1' }, 'Источник: ISSN Position Stand, 2017')
                  )
                )
              )
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
        isFemale && deficitPctTarget <= -10 && React.createElement('div', {
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
      const profile = lsGet('heys_profile', {}) || {};
      return {
        deficitPctTarget: profile.deficitPctTarget ?? 0
      };
    },
    validate: (data) => {
      if (data.deficitPctTarget === undefined || data.deficitPctTarget === null) {
        return 'Пожалуйста, выберите цель';
      }
      return true;
    },
    getValidationMessage: (data) => {
      if (data.deficitPctTarget === undefined || data.deficitPctTarget === null) {
        return 'Выберите вашу цель';
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

    const profile = lsGet('heys_profile', {}) || {};
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
        React.createElement('div', { className: 'flex items-center gap-2 relative' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '💤 Норма сна (часов)'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowSleepHint(!showSleepHint),
            className: 'w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium hover:bg-emerald-100 hover:text-emerald-600 transition-colors flex items-center justify-center'
          }, '?'),
          React.createElement(HintTooltip, {
            show: showSleepHint,
            onClose: () => setShowSleepHint(false)
          },
            `Рассчитано по возрасту: ${sleepNorm.explanation}.`,
            React.createElement('span', { className: 'text-[10px] text-gray-400 block mt-1' }, 'Источник: National Sleep Foundation, 2015')
          )
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
        React.createElement('div', { className: 'flex items-center gap-2 relative' },
          React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, '⏱ Инсулиновая волна'),
          React.createElement('button', {
            type: 'button',
            onClick: () => setShowInsulinHint(!showInsulinHint),
            className: 'w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium hover:bg-emerald-100 hover:text-emerald-600 transition-colors flex items-center justify-center'
          }, '?'),
          React.createElement(HintTooltip, {
            show: showInsulinHint,
            onClose: () => setShowInsulinHint(false)
          },
            'Период после еды, когда организм накапливает энергию. Жиросжигание начинается после его окончания.',
            React.createElement('span', { className: 'text-[10px] text-gray-400 block mt-1' }, 'Источник: Ludwig et al., JAMA 2018')
          )
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
                className: `w-full p-4 rounded-xl border-2 text-left transition-all ${isSelected
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
                  preset.value === 4.5 && React.createElement('div', { className: 'relative' },
                    React.createElement('button', {
                      type: 'button',
                      onClick: (e) => {
                        e.stopPropagation();
                        toggleInsulinPresetHint(preset.value);
                      },
                      className: 'w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium hover:bg-emerald-100 hover:text-emerald-600 transition-colors flex items-center justify-center'
                    }, '?'),
                    React.createElement(HintTooltip, {
                      show: showInsulinPresetHints[preset.value],
                      onClose: () => toggleInsulinPresetHint(preset.value),
                      position: 'left'
                    },
                      'При инсулинорезистентности волна длиннее. Рекомендуется консультация врача.',
                      React.createElement('span', { className: 'text-[10px] text-gray-400 block mt-1' }, 'Источник: DeFronzo, 1979')
                    )
                  )
                )
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
      const profile = lsGet('heys_profile', {}) || {};
      const age = profile.birthDate ? calcAgeFromBirthDate(profile.birthDate) : profile.age || 30;
      const sleepNorm = calcSleepNorm(age, profile.gender || 'Мужской');

      return {
        sleepHours: profile.sleepHours || sleepNorm.hours,
        insulinWaveHours: profile.insulinWaveHours || getSmartInsulinDefault(age)
      };
    },
    validate: (data) => {
      if (!data.insulinWaveHours) return 'Пожалуйста, выберите тип метаболизма';
      return true;
    },
    getValidationMessage: (data) => {
      if (!data.insulinWaveHours) return 'Выберите тип метаболизма';
      return null;
    },
    save: (data, context, allStepsData) => {
      // Собираем все данные из 4 шагов
      const step1 = allStepsData['profile-personal'] || {};
      const step2 = allStepsData['profile-body'] || {};
      const step3 = allStepsData['profile-goals'] || {};
      const step4 = allStepsData['profile-metabolism'] || {};

      console.log('[ProfileSteps] Saving with allStepsData:', JSON.stringify(allStepsData, null, 2));
      console.log('[ProfileSteps] step2 (body):', step2);

      const profile = lsGet('heys_profile', {}) || {};

      // Вес из регистрации (целый) — это базовый и изначально текущий
      const registrationWeight = step2.weight || profile.weight || 70;
      const firstName = String(step1.firstName || profile.firstName || '').trim();
      const lastName = String(step1.lastName || profile.lastName || '').trim();
      const fullName = buildFullName(firstName, lastName) || String(profile.name || '').trim();

      // Обновляем профиль
      const updatedProfile = {
        ...profile,
        firstName,
        lastName,
        name: fullName,
        displayName: fullName,
        gender: step1.gender || profile.gender || 'Мужской',
        birthDate: step1.birthDate || profile.birthDate || '',
        age: step1.birthDate ? calcAgeFromBirthDate(step1.birthDate) : profile.age || 30,
        cycleTrackingEnabled: step1.cycleTrackingEnabled || false,
        // Базовый вес (стартовый, из регистрации) — НЕ меняется после
        baseWeight: profile.baseWeight || registrationWeight,
        // Текущий вес — изначально = базовый, потом обновляется из чек-ина
        weight: profile.weight || registrationWeight,
        height: step2.height || profile.height || 175,
        // Целевой вес (из регистрации)
        weightGoal: step2.weightGoal || profile.weightGoal || registrationWeight,
        deficitPctTarget: step3.deficitPctTarget ?? profile.deficitPctTarget ?? 0,
        sleepHours: step4.sleepHours || profile.sleepHours || 8,
        insulinWaveHours: step4.insulinWaveHours || profile.insulinWaveHours || 3,
        profileCompleted: true,
        updatedAt: Date.now()
      };

      lsSet('heys_profile', updatedProfile);

      // ⚠️ v1.16 FIX: Инвалидируем кэш HEYS.store.memory
      // Без этого Settings tab читает stale cache и показывает пустой профиль
      if (HEYS.store && typeof HEYS.store.invalidate === 'function') {
        HEYS.store.invalidate('heys_profile');
        HEYS.store.invalidate('heys_norms');
        console.info('[HEYS.profileSteps] 🔄 Cache invalidated for heys_profile & heys_norms');
      }

      // Диспатчим событие для обновления UI профиля (настройки)
      window.dispatchEvent(new CustomEvent('heys:profile-updated', {
        detail: { profile: updatedProfile, source: 'wizard' }
      }));

      // Авторасчёт норм БЖУ
      const norms = calcNormsFromGoal(
        updatedProfile.deficitPctTarget,
        updatedProfile.gender,
        updatedProfile.age
      );
      lsSet('heys_norms', { ...norms, updatedAt: Date.now() });
      try {
        window.dispatchEvent(new CustomEvent('heys:norms-updated', {
          detail: { source: 'wizard-save' }
        }));
      } catch (_) {}

      // Записываем вес в данные дня (weightMorning), чтобы check-in не спрашивал повторно
      const todayKey = new Date().toISOString().slice(0, 10);
      const dayData = readDayDataScoped(todayKey, {});
      if (!dayData.weightMorning && updatedProfile.weight) {
        dayData.weightMorning = updatedProfile.weight;
        dayData.updatedAt = Date.now();
        writeDayDataScoped(todayKey, dayData);
        console.log('[ProfileSteps] Weight synced to day data:', updatedProfile.weight, 'kg for', todayKey);
      }

      syncCurrentClientName(fullName, 'profile-wizard', { syncCloud: true });

      console.log('[ProfileSteps] Profile saved:', updatedProfile);
      console.log('[ProfileSteps] Norms calculated:', norms);

      // 🔐 v1.17: Явный flush в облако — гарантирует что profileCompleted попадёт в cloud
      // Без этого при signOut → re-login профиль терялся (localStorage очищается, cloud пуст)
      try {
        if (HEYS.cloud && typeof HEYS.cloud.flushPendingQueue === 'function') {
          return HEYS.cloud.flushPendingQueue(10000).then((flushed) => {
            console.info('[HEYS.profileSteps] ☁️ Cloud flush after registration:', flushed ? 'OK' : 'timeout');
            if (!flushed) throw new Error('profile_sync_timeout');
            return true;
          }).catch((e) => {
            console.warn('[HEYS.profileSteps] ⚠️ Cloud flush failed:', e?.message || e);
            throw e;
          });
        }
        return Promise.reject(new Error('profile_sync_unavailable'));
      } catch (e) {
        console.warn('[HEYS.profileSteps] ⚠️ Cloud flush error:', e);
        return Promise.reject(e);
      }
    }
  });

  // ============================================================
  // ШАГ ПРИВЕТСТВИЯ (welcome) — визуальный разделитель между регистрацией и чек-ином
  // ============================================================

  /**
   * Сохраняет данные профиля из stepData
   * Используется при нажатии "Пропустить" на шаге welcome
   */
  function saveProfileFromStepData(allStepsData) {
    const step1 = allStepsData['profile-personal'] || {};
    const step2 = allStepsData['profile-body'] || {};
    const step3 = allStepsData['profile-goals'] || {};
    const step4 = allStepsData['profile-metabolism'] || {};

    // 📝 Event log (plan Wave 5.3, F-EL Batch D): profile-edit (без sensitive values)
    try {
      const filledSteps = ['profile-personal', 'profile-body', 'profile-goals', 'profile-metabolism']
        .filter((k) => allStepsData[k] && Object.keys(allStepsData[k]).length > 0);
      window.HEYS?.eventLog?.write(
        'profile-edit',
        `Profile saved (${filledSteps.length} steps filled)`,
        { count: filledSteps.length },
        'saveProfileFromStepData'
      );
    } catch (_) { /* noop */ }

    console.log('[saveProfileFromStepData] Saving with data:', { step1, step2, step3, step4 });

    const profile = lsGet('heys_profile', {}) || {};

    // Вес из регистрации (целый) — это базовый и изначально текущий
    const registrationWeight = step2.weight || profile.weight || 70;
    const firstName = String(step1.firstName || profile.firstName || '').trim();
    const lastName = String(step1.lastName || profile.lastName || '').trim();
    const fullName = buildFullName(firstName, lastName) || String(profile.name || '').trim();

    // Обновляем профиль
    const updatedProfile = {
      ...profile,
      firstName,
      lastName,
      name: fullName,
      displayName: fullName,
      gender: step1.gender || profile.gender || 'Мужской',
      birthDate: step1.birthDate || profile.birthDate || '',
      age: step1.birthDate ? calcAgeFromBirthDate(step1.birthDate) : profile.age || 30,
      cycleTrackingEnabled: step1.cycleTrackingEnabled || false,
      // Базовый вес (стартовый, из регистрации) — НЕ меняется после
      baseWeight: profile.baseWeight || registrationWeight,
      // Текущий вес — изначально = базовый, потом обновляется из чек-ина
      weight: profile.weight || registrationWeight,
      height: step2.height || profile.height || 175,
      // Целевой вес (из регистрации)
      weightGoal: step2.weightGoal || profile.weightGoal || registrationWeight,
      deficitPctTarget: step3.deficitPctTarget ?? profile.deficitPctTarget ?? 0,
      sleepHours: step4.sleepHours || profile.sleepHours || 8,
      insulinWaveHours: step4.insulinWaveHours || profile.insulinWaveHours || 3,
      profileCompleted: true,
      updatedAt: Date.now()
    };

    lsSet('heys_profile', updatedProfile);

    // Диспатчим событие для обновления UI профиля
    window.dispatchEvent(new CustomEvent('heys:profile-updated', {
      detail: { profile: updatedProfile, source: 'wizard-skip' }
    }));

    // Авторасчёт норм БЖУ
    const norms = calcNormsFromGoal(
      updatedProfile.deficitPctTarget,
      updatedProfile.gender,
      updatedProfile.age
    );
    lsSet('heys_norms', { ...norms, updatedAt: Date.now() });
    try {
      window.dispatchEvent(new CustomEvent('heys:norms-updated', {
        detail: { source: 'wizard-skip' }
      }));
    } catch (_) {}

    // ⚠️ v1.15 FIX: Инвалидируем кэш HEYS.store.memory
    // т.к. lsSet пишет в localStorage напрямую, но tryStartOnboardingTour читает из HEYS.store (который кэширует)
    if (HEYS.store && typeof HEYS.store.invalidate === 'function') {
      HEYS.store.invalidate('heys_profile');
      HEYS.store.invalidate('heys_norms');
      console.info('[HEYS.profileSteps] 🔄 Cache invalidated for heys_profile & heys_norms');
    }

    // НЕ записываем вес в данные дня при пропуске!
    // Чек-ин должен спросить вес при следующем запуске
    // (вес мог измениться с момента регистрации)

    syncCurrentClientName(fullName, 'wizard-skip');

    console.log('[saveProfileFromStepData] Profile saved:', updatedProfile);
    console.log('[saveProfileFromStepData] Norms calculated:', norms);

    // 🔐 v1.17: Явный flush в облако (дублирует логику из step-4 save)
    try {
      if (HEYS.cloud && typeof HEYS.cloud.flushPendingQueue === 'function') {
        return HEYS.cloud.flushPendingQueue(10000).then((flushed) => {
          console.info('[HEYS.profileSteps] ☁️ Cloud flush after saveProfileFromStepData:', flushed ? 'OK' : 'timeout');
          if (!flushed) throw new Error('profile_sync_timeout');
          return true;
        }).catch((e) => {
          console.warn('[HEYS.profileSteps] ⚠️ Cloud flush failed:', e?.message || e);
          throw e;
        });
      }
      return Promise.reject(new Error('profile_sync_unavailable'));
    } catch (e) {
      console.warn('[HEYS.profileSteps] ⚠️ Cloud flush error:', e);
      return Promise.reject(e);
    }
  }

  /**
   * Записывает вес из регистрации в данные дня
   * Используется при нажатии "Начать чек-ин" на шаге welcome
   * чтобы чек-ин НЕ спрашивал вес повторно
   */
  function syncWeightToDay(allStepsData) {
    const step2 = allStepsData['profile-body'] || {};
    const weight = step2.weight;

    if (!weight) {
      console.log('[syncWeightToDay] No weight in stepData, skipping');
      return;
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const dayData = readDayDataScoped(todayKey, {});

    if (!dayData.weightMorning) {
      dayData.weightMorning = weight;
      dayData.updatedAt = Date.now();
      writeDayDataScoped(todayKey, dayData);
      console.log('[syncWeightToDay] Weight synced to day:', weight, 'kg for', todayKey);
    } else {
      console.log('[syncWeightToDay] Day already has weight:', dayData.weightMorning);
    }
  }

  function WelcomeStepComponent({ stepData, context }) {
    // 🔧 v2.0.0: Читаем данные из stepData напрямую, т.к. localStorage ещё не сохранён
    const step1 = stepData['profile-personal'] || {};
    const step2 = stepData['profile-body'] || {};
    const step3 = stepData['profile-goals'] || {};
    const step4 = stepData['profile-metabolism'] || {};

    // Функции из контекста
    const onNext = context?.onNext;
    const onClose = context?.onClose;

    // Имя из stepData
    const firstName = step1.firstName || '';

    // Данные тела из stepData
    const weight = Number(step2.weight) || 70;
    const height = Number(step2.height) || 170;
    const weightGoal = Number(step2.weightGoal) || weight;
    const weightDiff = weightGoal - weight;
    const diffSign = weightDiff > 0 ? '+' : '';

    // Данные цели из stepData
    const deficitPctTarget = Number(step3.deficitPctTarget) || 0;
    const gender = step1.gender || 'Мужской';

    // Рассчитываем возраст из даты рождения
    // 🔧 v2.0.1: Собираем birthDate из отдельных полей (birthYear, birthMonth, birthDay)
    // т.к. в stepData они хранятся отдельно, а birthDate собирается только при save()
    let age = 30; // default
    if (step1.birthYear && step1.birthMonth && step1.birthDay) {
      const birthDate = `${step1.birthYear}-${String(step1.birthMonth).padStart(2, '0')}-${String(step1.birthDay).padStart(2, '0')}`;
      const today = new Date();
      const birth = new Date(birthDate);
      age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
    }

    // Рассчитываем нормы БЖУ напрямую (не из localStorage!)
    const calculatedNorms = calcNormsFromGoal(deficitPctTarget, gender, age);

    // Расчёт прогноза
    const weeks = calcTimeToGoal(weight, weightGoal, deficitPctTarget);

    // Проценты БЖУ из рассчитанных норм
    const protPct = calculatedNorms.proteinPct || 25;
    const carbsPct = calculatedNorms.carbsPct || 50;
    const fatPct = 100 - protPct - carbsPct;

    return React.createElement('div', {
      className: 'welcome-step-content',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px',
        textAlign: 'center'
      }
    },
      // Эмодзи
      React.createElement('div', {
        style: { fontSize: '72px', marginBottom: '16px' }
      }, '🎉'),

      // Заголовок
      React.createElement('h2', {
        style: {
          fontSize: '24px',
          fontWeight: 'bold',
          color: 'var(--text, #1f2937)',
          marginBottom: '8px'
        }
      }, firstName ? `Добро пожаловать, ${firstName}!` : 'Добро пожаловать!'),

      // Подзаголовок
      React.createElement('p', {
        style: {
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '24px'
        }
      }, 'Ваш персональный план готов'),

      // Карточка с параметрами
      React.createElement('div', {
        style: {
          background: '#ecfdf5',
          borderRadius: '16px',
          padding: '20px',
          width: '100%',
          maxWidth: '320px',
          marginBottom: '24px'
        }
      },
        // Цель
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }
        },
          React.createElement('span', { style: { color: 'var(--text, #374151)' } }, '🎯 Цель:'),
          React.createElement('span', {
            style: { fontWeight: '500', color: '#059669' }
          }, `${weightGoal} кг (${diffSign}${Math.abs(weightDiff).toFixed(1)} кг)`)
        ),

        // БЖУ
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }
        },
          React.createElement('span', { style: { color: 'var(--text, #374151)' } }, '📊 БЖУ:'),
          React.createElement('span', {
            style: { fontWeight: '500', color: '#059669' }
          }, `Б${protPct}% У${carbsPct}% Ж${fatPct}%`)
        ),

        // Прогноз
        React.createElement('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }
        },
          React.createElement('span', { style: { color: 'var(--text, #374151)' } }, '⏱ Прогноз:'),
          React.createElement('span', {
            style: { fontWeight: '500', color: '#059669' }
          }, weeks)
        )
      ),

      // Сноска
      React.createElement('p', {
        style: {
          fontSize: '14px',
          color: '#9ca3af',
          marginBottom: '24px'
        }
      }, 'Нормы рассчитаны по вашим данным. Можете изменить в Профиле.'),

      // Кнопка "Начать чек-ин"
      React.createElement('button', {
        style: {
          width: '100%',
          maxWidth: '320px',
          padding: '14px 24px',
          background: '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
          marginBottom: '12px'
        },
        onClick: () => {
          // Вес из регистрации остаётся в профиле (базовый)
          // Чек-ин спросит утренний вес с десятыми долями
          console.log('[WelcomeStep] Starting checkin (weight will be asked)');
          onNext && onNext();
        }
      }, '☀️ Начать утренний чек-ин'),

      null
    );
  }

  // Регистрируем шаг welcome (с отложенной регистрацией на случай если StepModal загрузится позже)
  function registerWelcomeStep() {
    if (HEYS.StepModal && HEYS.StepModal.registerStep) {
      HEYS.StepModal.registerStep('welcome', {
        title: 'Готово!',
        hint: 'Регистрация завершена',
        icon: '🎉',
        component: WelcomeStepComponent,
        canSkip: false,
        hideHeaderNext: true,  // Скрываем кнопку в хедере — используем кнопки в контенте
        getInitialData: () => ({}),
        validate: () => true,
        save: () => { } // Ничего не сохраняем, это информационный шаг
      });
      return true;
    }
    return false;
  }

  // Попробуем сразу, если не получится — через 100мс
  if (!registerWelcomeStep()) {
    setTimeout(registerWelcomeStep, 100);
  }

  // ============================================================
  // ЭКРАН ПОЗДРАВЛЕНИЯ (W4) — legacy, теперь используем шаг welcome
  // ============================================================

  function showCongratulationsModal() {
    const profile = lsGet('heys_profile', {}) || {};
    const norms = lsGet('heys_norms', {});

    const firstName = profile.firstName || '';
    const weight = Number(profile.weight) || 70;
    const weightGoal = Number(profile.weightGoal) || weight;
    const weightDiff = weightGoal - weight;
    const diffSign = weightDiff > 0 ? '+' : '';
    const weeks = calcTimeToGoal(profile.weight, profile.weightGoal, profile.deficitPctTarget);

    // Простая модалка с поздравлением
    const modalHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
           style="animation: fadeIn 0.3s ease-out">
        <div class="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl"
             style="animation: scaleIn 0.4s ease-out 0.1s both">
          <div class="text-center">
            <div class="text-6xl mb-4">🎉</div>
            <h2 class="text-2xl font-bold text-gray-800 mb-2">Добро пожаловать, ${firstName}!</h2>
            <p class="text-gray-600 mb-6">Ваш персональный план готов</p>
            
            <div class="bg-emerald-50 rounded-xl p-4 mb-6 text-left space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-gray-700">🎯 Цель:</span>
                <span class="font-medium text-emerald-700">${profile.weightGoal} кг (${diffSign}${Math.abs(weightDiff).toFixed(1)} кг)</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-700">📊 БЖУ:</span>
                <span class="font-medium text-emerald-700">Б${norms.proteinPct}% У${norms.carbsPct}% Ж${100 - norms.proteinPct - norms.carbsPct}%</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-700">⏱ Прогноз:</span>
                <span class="font-medium text-emerald-700">${weeks}</span>
              </div>
            </div>
            
            <p class="text-sm text-gray-500 mb-4">
              Нормы рассчитаны по вашим данным. Можете изменить в Профиле.
            </p>
            
            <button id="congrats-close-btn" 
                    class="w-full bg-emerald-500 text-white py-3 rounded-xl font-medium hover:bg-emerald-600 transition-colors">
              Начать! →
            </button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container);

    // Кнопка закрытия
    const closeBtn = container.querySelector('#congrats-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        container.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
          container.remove();
        }, 200);
      });
    }

    // Закрытие по клику на фон
    const backdrop = container.querySelector('.fixed');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closeBtn.click();
        }
      });
    }
  }

  // ============================================================
  // ЭКСПОРТ
  // ============================================================

  // Module-level guard: isProfileIncomplete вызывается из 5 call site'ов
  // (gate_flow, morning_checkin, onboarding и др.) — auto-set профиля
  // должен сработать только один раз за сессию, иначе uploads дублируются.
  let _profileCompletedAutoSetThisSession = false;

  // Проверка: нужно ли показывать profile-шаги
  function isProfileIncomplete(profile) {
    // Защита от null/undefined
    if (!profile) {
      return true;
    }

    // 🛡️ Defensive: если переданный объект пустой ({}) или без основных полей —
    // возможно caller передал stale snapshot. Перечитываем scoped key напрямую
    // через force-raw helper (минует Store.get cache).
    if (!profile.firstName && !profile.birthDate && !profile.weight) {
      const cid = (window.HEYS?.currentClientId || '').toString();
      const helper = window.HEYS?.MorningCheckinUtils?.readProfileForceRawScoped;
      if (cid && typeof helper === 'function') {
        const scoped = helper(cid);
        if (scoped && (scoped.firstName || scoped.birthDate || scoped.weight)) {
          profile = scoped;
        }
      }
    }

    // Если есть флаг profileCompleted — используем его (надёжный способ)
    if (profile.profileCompleted === true) {
      localStorage.removeItem('heys_registration_in_progress');
      return false;
    }

    // 🔧 Авто-детект: если все обязательные поля заполнены не дефолтными
    // значениями — считаем профиль готовым и проставляем `profileCompleted: true`
    // в LS, чтобы при следующих загрузках сразу попадали в branch выше.
    // Закрывает state-drift когда флаг был потерян, но данные актуальны.
    // Module-level dedup: isProfileIncomplete вызывается из ~5 call site'ов
    // во время boot — пишем в LS/облако только один раз за сессию.
    try {
      const fn = String(profile.firstName || '').trim();
      const hasName = fn.length > 0 && fn !== '?';
      const hasBirthDate = !!profile.birthDate;
      const hasGender = !!profile.gender;
      const hasNonDefaultWeight = profile.weight > 0 && profile.weight !== 70;
      const hasNonDefaultHeight = profile.height > 0 && profile.height !== 175;
      if (hasName && hasBirthDate && hasGender && (hasNonDefaultWeight || hasNonDefaultHeight)) {
        if (!_profileCompletedAutoSetThisSession) {
          _profileCompletedAutoSetThisSession = true;
          try {
            // 2026-05-29 anti-pollution: пишем СТРОГО scoped + stamp marker.
            // Раньше 'heys_profile' (unscoped) попадал в interceptor и uploads
            // под currentClientId — после switch contamination'ил нового клиента.
            // P0 guard pattern (see heys_steps_v1.js:264 saveDayData).
            profile.profileCompleted = true;
            const _autoCid = (window.HEYS?.currentClientId || '').toString();
            const _autoScoped = _autoCid ? `heys_${_autoCid}_profile` : null;
            const stamped = _autoCid ? { ...profile, _sourceClientId: _autoCid } : profile;
            if (_autoScoped) {
              if (window.HEYS?.store?.set) {
                window.HEYS.store.set(_autoScoped, stamped);
              } else {
                lsSet(_autoScoped, stamped);
              }
            } else {
              // Fallback: нет client_id (pre-auth flow) — единственный случай
              // когда unscoped write безопасен (никакого user context ещё нет).
              if (window.HEYS?.store?.set) {
                window.HEYS.store.set('heys_profile', profile);
              } else {
                lsSet('heys_profile', profile);
              }
            }
            console.warn('[ProfileSteps] auto-set profileCompleted=true for filled profile', {
              firstName: fn, weight: profile.weight, height: profile.height,
              scoped: !!_autoScoped,
            });
          } catch (_) { }
        }
        localStorage.removeItem('heys_registration_in_progress');
        return false;
      }
    } catch (_) { }

    // 🧭 Миграция legacy профиля (без clientId) → scoped ключ.
    //
    // 2026-05-29 (curator-pollution fix): ДВА бага исправлены.
    //
    // 1. Ownership check. Старая ветка мигрировала ЛЮБОЙ unscoped heys_profile
    //    в текущий scope. После курaторского switch (Александра → Poplanton)
    //    LS всё ещё содержал Александрин unscoped heys_profile → миграция
    //    переносила её содержимое в heys_<poplanton_id>_profile → cloud
    //    pollution. Теперь legacy migrates ТОЛЬКО если содержит маркер
    //    _sourceClientId совпадающий с currentClientId, или вообще не имеет
    //    маркера (legacy данные ДО введения scoping — единственный случай
    //    когда unscoped принадлежит «всем»).
    //
    // 2. Запись через store.set('heys_profile', ...) — UNSCOPED!
    //    Interceptor catches → saveClientKey('heys_profile', ...) → line 10171
    //    в heys_storage_supabase_v1.js → client_id = currentClientId → write
    //    в client_kv_store под current client_id. Это и был основной vector
    //    pollution в incident 2026-05-29 21:16:40-43. Теперь пишем СТРОГО
    //    через scopedKey (legacy heys_profile никогда не пишем).
    //
    // 3. После успешной migration — removeItem('heys_profile') чтобы legacy
    //    не остался в LS как ловушка для следующего switch.
    try {
      const currentClientId = (window.HEYS?.currentClientId || '').toString();
      const scopedKey = currentClientId ? `heys_${currentClientId}_profile` : null;
      const rawScoped = scopedKey ? localStorage.getItem(scopedKey) : null;
      const rawLegacy = localStorage.getItem('heys_profile');

      if (currentClientId && scopedKey && !rawScoped && rawLegacy) {
        const decompressFn = window.HEYS?.store?.decompress;
        const legacyProfile = decompressFn ? decompressFn(rawLegacy) : JSON.parse(rawLegacy);
        const hasLegacyData = legacyProfile && (
          legacyProfile.profileCompleted === true ||
          legacyProfile.firstName ||
          legacyProfile.birthDate ||
          legacyProfile.weight ||
          legacyProfile.height ||
          legacyProfile.age
        );

        // Ownership gate: legacy без маркера _sourceClientId — это true legacy
        // (написано ДО введения scoping). Если маркер есть и НЕ совпадает с
        // currentClientId — это carryover от другого клиента → skip + cleanup.
        const legacyOwner = legacyProfile && legacyProfile._sourceClientId;
        const ownershipOk = !legacyOwner || legacyOwner === currentClientId;

        if (hasLegacyData && ownershipOk) {
          // Stamp marker before writing to scoped — следующий read для другого
          // клиента увидит ownership и не подхватит чужие данные.
          const stamped = { ...legacyProfile, _sourceClientId: currentClientId };
          if (window.HEYS?.store?.set) {
            window.HEYS.store.set(scopedKey, stamped);
          } else {
            lsSet(scopedKey, stamped);
          }
          // Cleanup legacy — removeItem unscoped после успешной migration.
          try { localStorage.removeItem('heys_profile'); } catch (_) { /* noop */ }
          localStorage.removeItem('heys_registration_in_progress');
          return false;
        }

        if (hasLegacyData && !ownershipOk) {
          // Cross-client carryover detected — clean legacy + продолжить как
          // если бы профиля не было (Poplanton начнёт onboarding с нуля).
          console.warn('[HEYS.profile] cross-client legacy heys_profile detected — removing', {
            legacyOwner: String(legacyOwner).slice(0, 8),
            currentClientId: String(currentClientId).slice(0, 8),
          });
          try { localStorage.removeItem('heys_profile'); } catch (_) { /* noop */ }
        }
      }
    } catch (_) { }

    // 🛡️ Если регистрация была прервана (перезагрузка страницы) — продолжить регистрацию
    const registrationInProgress = localStorage.getItem('heys_registration_in_progress') === 'true';
    if (registrationInProgress) {
      try {
        const currentClientId = (window.HEYS?.currentClientId || '').toString();
        const scopedKey = currentClientId ? `heys_${currentClientId}_profile` : null;
        let rawScoped = scopedKey ? localStorage.getItem(scopedKey) : null;

        if (rawScoped === 'null' || rawScoped === 'undefined') {
          try {
            localStorage.removeItem(scopedKey);
          } catch (_) { }
          rawScoped = null;
        }

        // 🔧 FIX: Если scoped профиль существует и содержит данные — сбросить флаг регистрации
        if (rawScoped) {
          // Store.decompress сам обрабатывает префикс ¤Z¤ и обычный JSON. Голый
          // JSON.parse на сжатой строке падает в catch и оставляет scopedProfile
          // undefined → registration-флаг застревает навсегда.
          const decompressFn = window.HEYS?.store?.decompress;
          let scopedProfile;
          try {
            scopedProfile = decompressFn ? decompressFn(rawScoped) : JSON.parse(rawScoped);
          } catch (e) {
            // parse error — продолжаем с null
          }
          const hasRealData = scopedProfile && (
            scopedProfile.profileCompleted === true ||
            scopedProfile.firstName ||
            scopedProfile.birthDate ||
            (scopedProfile.weight && scopedProfile.weight !== 70) ||
            (scopedProfile.height && scopedProfile.height !== 175) ||
            (scopedProfile.age && scopedProfile.age !== 30)
          );
          if (hasRealData) {
            localStorage.removeItem('heys_registration_in_progress');
            return false;
          }
        }
      } catch (_) { }
      return true;
    }

    // Fallback: проверяем обязательные поля
    // Профиль считается неполным, если ВСЕ поля имеют дефолтные значения
    const isDefaultGender = !profile.gender || profile.gender === 'Мужской';
    const isDefaultWeight = !profile.weight || profile.weight === 70;
    const isDefaultHeight = !profile.height || profile.height === 175;
    const noBirthDate = !profile.birthDate;
    const isDefaultAge = !profile.age || profile.age === 30;

    // Профиль неполный, только если ВСЕ поля дефолтные И нет даты рождения
    const isIncomplete = isDefaultGender && isDefaultWeight && isDefaultHeight && noBirthDate && isDefaultAge;
    if (!isIncomplete) {
      localStorage.removeItem('heys_registration_in_progress');
    }
    return isIncomplete;
  }

  HEYS.ProfileSteps = {
    isProfileIncomplete,
    calcNormsFromGoal,
    calcAgeFromBirthDate,
    calcSleepNorm,
    showCongratulationsModal
  };

})(window);
