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
  const GOAL_DIRECTIONS = [
    {
      id: 'lose',
      label: 'Снизить вес',
      tempos: [
        { id: 'slow', label: 'Плавно', value: -10, hint: 'Плавно — минус 10 % от расхода: мягкий темп.' },
        { id: 'mid', label: 'Умеренно', value: -15, hint: 'Умеренно — минус 15 % от расхода: заметный результат без строгих ограничений.' },
        { id: 'fast', label: 'Быстро', value: -20, hint: 'Быстро — минус 20 % от расхода. Быстрее, сложнее удержать.' },
      ],
    },
    {
      id: 'hold',
      label: 'Удержать текущий вес',
      tempos: [{ id: 'hold', label: 'Удержать', value: 0, hint: 'Норма без дефицита и профицита.' }],
    },
    {
      id: 'gain',
      label: 'Набрать вес и мышцы',
      tempos: [
        { id: 'slow', label: 'Плавно', value: 10, hint: 'Плавно — плюс 10 % от расхода.' },
        { id: 'mid', label: 'Умеренно', value: 15, hint: 'Умеренно — плюс 15 % от расхода.' },
      ],
    },
  ];

  const ACTIVITY_LEVELS = [
    { id: 'sedentary', label: 'Сидячая' },
    { id: 'light', label: 'Лёгкая' },
    { id: 'active', label: 'Высокая' },
  ];

  // Строка «активность»: ответ спрашивается один раз и должен кормить прогноз
  // «недель до цели». Множители те же, что у теоретического TDEE в настройках
  // (FAO/WHO/UNU 2001, heys_user_tab_impl_v1.js), нормированные на «лёгкую» —
  // иначе два экрана называли бы человеку разные сроки.
  const ACTIVITY_TDEE_MULTIPLIERS = { sedentary: 1.2, light: 1.375, active: 1.725 };

  function activityRateFactor(activityLevel) {
    const multiplier = ACTIVITY_TDEE_MULTIPLIERS[String(activityLevel || '')];
    if (!multiplier) return 1;
    return multiplier / ACTIVITY_TDEE_MULTIPLIERS.light;
  }

  function goalDirectionFromPct(pct) {
    const n = Number(pct);
    if (!(Number.isFinite(n))) return null;
    if (n < 0) return 'lose';
    if (n > 0) return 'gain';
    return 'hold';
  }


  const INSULIN_PRESETS = [
    { value: 2.5, label: '2,5 часа', desc: 'быстрый обмен' },
    { value: 3, label: '3 часа', desc: 'по умолчанию' },
    { value: 4, label: '4 часа', desc: 'спокойный' },
    { value: 4.5, label: '4,5 часа', desc: 'медленный' }
  ];

  function isValidGivenName(value) {
    const text = String(value || '').trim();
    if (!text || /\d/.test(text)) return false;
    const letters = text.replace(/[^\p{L}]/gu, '');
    return letters.length >= 2;
  }

  function givenNameError(value) {
    const text = String(value || '').trim();
    if (!text) return 'Осталось имя';
    if (!isValidGivenName(text)) return 'Имя — минимум две буквы, без цифр';
    return null;
  }

  function minAdultBirthYear(now = new Date()) {
    return now.getFullYear() - 18;
  }

  function bmiCategoryWord(bmi) {
    if (!(bmi > 0)) return '';
    if (bmi < 18.5) return 'недостаток';
    if (bmi < 25) return 'норма';
    if (bmi < 30) return 'избыток';
    return 'ожирение';
  }

  function minNormalWeightKg(heightCm) {
    const heightM = Number(heightCm) / 100;
    if (!(heightM > 0)) return 0;
    return Math.round(18.5 * heightM * heightM);
  }

  function formatWeeksForecast(weeks) {
    const rounded = Math.round(Number(weeks));
    if (!Number.isFinite(rounded) || rounded <= 0) return 'уже на цели';
    const mod10 = rounded % 10;
    const mod100 = rounded % 100;
    let word = 'недель';
    if (mod10 === 1 && mod100 !== 11) word = 'неделя';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'недели';
    return `около ${rounded} ${word}`;
  }

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

  function isRegistrationInProgress(profile) {
    const raw = localStorage.getItem('heys_registration_in_progress');
    const inProgress = raw === 'true' || raw === '"true"';
    if (!inProgress) return false;

    // Legacy marker browser-global, поэтому может пережить завершение профиля
    // или switch клиента. Снимать его безопасно только когда последний полный
    // cloud sync этого же клиента не старее сохранённого профиля: локальная
    // неподтверждённая запись (updatedAt > sync.ts) остаётся fail-closed.
    const clientId = getCurrentClientId();
    const lastSync = HEYS.cloud?._lastClientSync;
    const profileUpdatedAt = Number(profile?.updatedAt || 0);
    const syncedAt = Number(lastSync?.ts || 0);
    const isCloudConfirmedComplete = profile?.profileCompleted === true
      && !!clientId
      && lastSync?.clientId === clientId
      && syncedAt > 0
      && (profileUpdatedAt === 0 || syncedAt >= profileUpdatedAt);

    if (isCloudConfirmedComplete) {
      localStorage.removeItem('heys_registration_in_progress');
      console.info('[ProfileSteps] cleared stale registration marker after authoritative profile sync', {
        clientId: String(clientId).slice(0, 8),
      });
      return false;
    }

    return true;
  }

  function isRegistrationMarkerActive() {
    const raw = localStorage.getItem('heys_registration_in_progress');
    return raw === 'true' || raw === '"true"';
  }

  // Idempotent: isProfileIncomplete вызывается из render-путей (gate_flow).
  // Повторная запись маркера → HOT WRITE loop и React #301.
  function ensureRegistrationInProgressMarker(meta) {
    // HEYS_DEBUG_REPLAY_REGISTRATION — не помечаем клиента «недорегистрированным»
    if (HEYS._registrationReplay) return false;
    if (isRegistrationMarkerActive()) return false;
    lsSet('heys_registration_in_progress', true);
    if (meta) {
      console.warn('[ProfileSteps] registrationInProgress set', meta);
    }
    return true;
  }

  function hasActiveWriteAccess() {
    const subscription = HEYS.Subscription;
    if (!subscription?.canWriteStatus) return false;
    const status = subscription.getCachedStatus?.() || subscription.getLocalStatus?.() || 'none';
    return subscription.canWriteStatus(status) === true;
  }

  function isConfirmedProfile(remoteProfile, expectedProfile) {
    if (!remoteProfile || !expectedProfile) return false;
    return remoteProfile.profileCompleted === true
      && Number(remoteProfile.updatedAt || 0) === Number(expectedProfile.updatedAt || 0);
  }

  async function confirmProfileCloudSave(expectedProfile) {
    const clientId = getCurrentClientId();
    const api = HEYS.YandexAPI;
    if (!clientId || !api?.getKV) throw new Error('profile_sync_unavailable');

    // Запускаем общую очередь, но не используем её полное опустошение как
    // подтверждение: посторонний заблокированный ключ не относится к профилю.
    if (HEYS.cloud?.flushPendingQueue) {
      Promise.resolve(HEYS.cloud.flushPendingQueue(10000)).catch((error) => {
        console.warn('[HEYS.profileSteps] Background queue flush failed:', error?.message || error);
      });
    }

    let syncStatus = 'unknown';
    if (HEYS.cloud?.waitForSync) {
      syncStatus = await HEYS.cloud.waitForSync('heys_profile', 10000);
    }

    let readback = await api.getKV(clientId, 'heys_profile');
    if (readback?.error) throw new Error(String(readback.error?.message || readback.error));
    if (!isConfirmedProfile(readback?.data, expectedProfile)) {
      // Точечный идемпотентный retry даёт реальную серверную ошибку и не
      // создаёт второй профиль: client_kv_store обновляет тот же ключ.
      if (!api.saveKV) throw new Error(`profile_sync_unconfirmed:${syncStatus}`);
      const saved = await api.saveKV(clientId, 'heys_profile', expectedProfile);
      if (!saved?.success) throw new Error(String(saved?.error?.message || saved?.error || 'profile_save_failed'));
      readback = await api.getKV(clientId, 'heys_profile');
      if (readback?.error) throw new Error(String(readback.error?.message || readback.error));
      if (!isConfirmedProfile(readback?.data, expectedProfile)) {
        throw new Error('profile_sync_unconfirmed');
      }
    }

    localStorage.removeItem('heys_registration_in_progress');
    window.dispatchEvent(new CustomEvent('heys:profile-sync-confirmed', {
      detail: { clientId, updatedAt: expectedProfile.updatedAt }
    }));
    return true;
  }

  function readDayDataScoped(dateKey, fallback = {}) {
    const reader = HEYS.MorningCheckinUtils?.readDayV2ScopedFirst;
    if (typeof reader === 'function') return reader(dateKey, fallback);
    return lsGet(`heys_dayv2_${dateKey}`, fallback);
  }

  function writeDayDataScoped(dateKey, dayData) {
    if (dayData && dayData.date && dateKey && String(dayData.date) !== String(dateKey)) {
      console.warn('[HEYS.profileSteps] writeDayDataScoped ABORT: date mismatch', {
        dateKey,
        payloadDate: dayData.date
      });
      return false;
    }
    const safeDayData = dayData && dayData.date ? dayData : { ...(dayData || {}), date: dateKey };
    const writer = HEYS.MorningCheckinUtils?.writeDayV2Scoped;
    if (typeof writer === 'function') {
      return writer(dateKey, safeDayData);
    }
    let valueToSave = safeDayData;
    try {
      if (HEYS.dayMutationGuard?.mergeProtectedFields) {
        const current = readDayDataScoped(dateKey, null);
        const protectedResult = HEYS.dayMutationGuard.mergeProtectedFields(dateKey, safeDayData, current, ['weightMorning'], {
          action: 'profile-step-day-write',
        });
        if (protectedResult.blocked) return false;
        valueToSave = protectedResult.day || safeDayData;
      }
    } catch (_) { /* guard diagnostics only */ }
    lsSet(`heys_dayv2_${dateKey}`, valueToSave);
    return true;
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
  function calcTimeToGoal(currentWeight, goalWeight, deficitPct, activityLevel) {
    // Защита от undefined/NaN значений
    const cw = Number(currentWeight) || 70;
    const gw = Number(goalWeight) || cw;
    const dp = Number(deficitPct) || 0;

    const diff = Math.abs(gw - cw);
    if (diff < 0.5 || !isFinite(diff)) return 'уже на цели';

    // Безопасная скорость: 0.5-1 кг/нед в зависимости от дефицита
    let weeklyRate;
    const absPct = Math.abs(dp);
    if (absPct >= 15) weeklyRate = 0.8;
    else if (absPct >= 10) weeklyRate = 0.6;
    else weeklyRate = 0.4;
    // Активность двигает расход, а значит и скорость: сидячая тормозит прогноз,
    // высокая ускоряет. Без этого ответ шага 3 никуда не вёл.
    weeklyRate *= activityRateFactor(activityLevel);

    const weeks = Math.ceil(diff / weeklyRate);
    if (!isFinite(weeks) || weeks <= 0) return 'уже на цели';
    return formatWeeksForecast(weeks);
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
    const WheelPicker = HEYS.StepModal?.WheelPicker;

    const firstName = data.firstName || '';
    const lastName = data.lastName || '';
    const gender = data.gender || '';
    // cycleTrackingEnabled снят с релиза — поле в data не пишем.

    // Разбираем дату на компоненты
    const currentYear = new Date().getFullYear();
    const birthDay = data.birthDay || 1;
    const birthMonth = data.birthMonth || 1;
    const birthYear = data.birthYear || (currentYear - 25); // дефолт 25 лет

    // Собираем дату в ISO формат для совместимости
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

    const age = calcAgeFromBirthDate(birthDate);
    // Пол женский больше не открывает UI цикла в регистрации.

    // Значения для пикеров
    const daysInMonth = new Date(birthYear, birthMonth, 0).getDate();
    const dayValues = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
    const monthValues = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], []);
    const yearValues = useMemo(() => {
      const years = [];
      for (let y = minAdultBirthYear(); y >= 1940; y--) years.push(y);
      return years;
    }, [currentYear]);

    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const formatMonth = (m) => monthNames[m - 1];
    const pad2 = (v) => String(v).padStart(2, '0');

    const nameError = givenNameError(firstName);
    const under18 = age > 0 && age < 18;
    // ref-callback вместо useRef: компонент рендерится и в тестовых мок-React
    // без хуков, а узел нужен только внутри текущего рендера.
    let lastNameNode = null;

    // «вид шага»: поля экрана общие для слоя (.mc-step-content 18px) — свой p-4/p-3 давал 34px по бокам
    return React.createElement('div', { className: 'flex flex-col gap-4' },
      React.createElement('div', {
        style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 6, lineHeight: 1.3 }
      }, 'Персональные данные'),
      React.createElement('div', {
        className: 'text-xs',
        style: { color: 'rgba(0,0,0,.55)', lineHeight: 1.5, marginTop: 8 }
      }, 'Имя увидит только ваш куратор'),
      React.createElement('div', { className: 'flex flex-col gap-2', style: { marginTop: 16 } },
        React.createElement('label', { className: 'text-sm font-medium', style: { color: 'rgba(0,0,0,.7)' } },
          'Имя ',
          React.createElement('span', { style: { color: '#8a4a20' } }, '*')
        ),
        React.createElement('input', {
          type: 'text',
          value: firstName,
          onChange: (e) => onChange({ ...data, firstName: e.target.value }),
          placeholder: 'Имя',
          autoComplete: 'given-name',
          // «клавиатура»: клавиша ввода подписана тем же словом, что и кнопка,
          // и действительно ведёт дальше — к фамилии.
          enterKeyHint: 'next',
          onKeyDown: (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (lastNameNode) lastNameNode.focus();
          },
          className: 'w-full',
          style: {
            minHeight: 44,
            borderRadius: 18,
            border: 'none',
            padding: '12px 15px',
            background: '#f7efe2',
            font: '600 13px/1.5 Figtree, system-ui, sans-serif',
            color: '#201e1d',
            ...(nameError && firstName
              ? { boxShadow: 'inset 0 0 0 2px #a1471c' }
              : null),
          }
        }),
        nameError && firstName && React.createElement('div', {
          className: 'text-xs font-semibold',
          style: { color: '#a1471c' }
        }, nameError),
        nameError && firstName && React.createElement('div', {
          className: 'text-xs',
          style: { color: 'rgba(0,0,0,.42)' }
        }, 'Куратор обращается к вам по имени, поэтому оно должно читаться.')
      ),
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm', style: { color: 'rgba(0,0,0,.42)' } },
          'Фамилия ',
          React.createElement('span', { style: { fontWeight: 500 } }, '· необязательно')
        ),
        React.createElement('input', {
          type: 'text',
          value: lastName,
          onChange: (e) => onChange({ ...data, lastName: e.target.value }),
          placeholder: 'Фамилия',
          autoComplete: 'family-name',
          ref: (node) => { lastNameNode = node; },
          // «клавиатура»: последнее поле шага — ввод закрывает клавиатуру,
          // футер с «Дальше» возвращается на экран.
          enterKeyHint: 'next',
          onKeyDown: (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.currentTarget.blur();
          },
          className: 'w-full',
          style: {
            minHeight: 44,
            borderRadius: 18,
            border: 'none',
            padding: '12px 15px',
            background: '#f7efe2',
            font: '600 13px/1.5 Figtree, system-ui, sans-serif',
            color: '#201e1d',
          }
        })
      ),
      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('label', { className: 'text-sm font-medium', style: { color: 'rgba(0,0,0,.7)' } },
          'Пол ',
          React.createElement('span', { style: { color: '#8a4a20' } }, '*')
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } },
          ['Женский', 'Мужской'].map(g =>
            React.createElement('button', {
              key: g,
              type: 'button',
              onClick: () => onChange({ ...data, gender: g }),
              style: {
                padding: '0 16px',
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 999,
                border: 'none',
                font: '600 12px/1 Figtree, system-ui, sans-serif',
                background: gender === g ? '#c67139' : '#f7efe2',
                color: gender === g ? '#2b1608' : 'rgba(0,0,0,.55)',
                cursor: 'pointer',
              }
            }, g)
          )
        ),
        !gender && isValidGivenName(firstName)
          ? React.createElement('div', { className: 'text-xs font-semibold', style: { color: '#a1471c' } },
            'Выберите один вариант')
          : React.createElement('div', { className: 'text-xs', style: { color: 'rgba(0,0,0,.42)' } },
            'Формула основного обмена у мужчин и женщин разная.')
      ),

      // Дата рождения (WheelPickers v2)
      React.createElement('div', { className: 'flex flex-col gap-3' },
        React.createElement('div', { className: 'flex items-center justify-between' },
          React.createElement('label', { className: 'text-sm font-medium', style: { color: 'rgba(0,0,0,.7)' } },
            'Дата рождения ',
            React.createElement('span', { style: { color: '#8a4a20' } }, '*')
          )
        ),
        // «вид шага профиля»: герой 44/600 тоном --ac с единицей 12/600 ink38
        // по baseline — и он стоит НАД капсулой колёс. Кадр канваса рисует
        // возраст 24/700 под капсулой; контракт старше кадра (отступление
        // названо в протоколе экрана).
        React.createElement('div', {
          style: {
            display: 'flex', alignItems: 'baseline', justifyContent: 'center',
            gap: 6, marginTop: 8
          }
        },
          React.createElement('span', {
            style: {
              font: '600 44px/1 Figtree, system-ui, sans-serif',
              color: under18 ? '#a1471c' : '#8a4a20'
            }
          }, String(age)),
          React.createElement('span', {
            style: {
              font: '600 12px/1 Figtree, system-ui, sans-serif',
              color: 'rgba(0,0,0,.38)'
            }
          }, 'лет')
        ),
        // WheelPickers: День / Месяц / Год
        WheelPicker ? React.createElement('div', {
          className: 'flex justify-center gap-2',
          style: { background: '#f7efe2', borderRadius: 18, padding: '12px 10px 13px', marginTop: 8 }
        },
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
          max: `${minAdultBirthYear()}-12-31`,
          className: 'w-full px-4 py-3 border border-gray-300 rounded-xl'
        }),
        under18 && React.createElement('div', {
          className: 'rounded-2xl p-3 mt-3',
          style: { background: '#f6e6dd' }
        },
          React.createElement('div', { className: 'text-xs font-bold', style: { color: '#a1471c' } },
            'Приложением можно пользоваться с 18 лет'),
          React.createElement('div', { className: 'text-xs mt-1', style: { color: 'rgba(0,0,0,.55)', lineHeight: 1.55 } },
            'Программа рассчитана на взрослых, и документы подписывает совершеннолетний. Колесо дальше не идёт.')
        )
      ),

      // Активация трекинга особого периода — снята с релиза (prompt-cycle-removal).
      // Функция вернётся device-only; экран включения сейчас отсутствует.
    );
  }

  registerStep('profile-personal', {
    title: 'Персональные данные',
    hint: 'Имя увидит только ваш куратор',
    nextLabel: 'Дальше',
    icon: '',
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
        ensureRegistrationInProgressMarker({
          source: 'profile-personal.getInitialData',
          profileCompleted: profile?.profileCompleted,
          hasFirstName: !!profile?.firstName,
          hasBirthDate: !!profile?.birthDate,
        });
      } else if (!isRegistrationInProgress(profile)) {
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
        gender: profile.gender || '',
        birthDay,
        birthMonth,
        birthYear,
        // prompt-cycle-removal: трекинг цикла не включаем в регистрации
        cycleTrackingEnabled: false
      };
    },
    validate: (data) => {
      if (!isValidGivenName(data.firstName)) return 'Имя — минимум две буквы, без цифр';
      if (!data.gender) return 'Выберите один вариант';
      if (!data.birthYear || !data.birthMonth || !data.birthDay) return 'Укажите дату рождения';
      const birthDate = `${data.birthYear}-${String(data.birthMonth).padStart(2, '0')}-${String(data.birthDay).padStart(2, '0')}`;
      if (calcAgeFromBirthDate(birthDate) < 18) return 'Приложением можно пользоваться с 18 лет';
      return true;
    },
    getValidationMessage: (data) => {
      const nameText = String(data.firstName || '').trim();
      if (!nameText) return 'Осталось имя';
      if (!isValidGivenName(nameText)) return '';
      if (!data.gender) return 'Остался пол';
      if (!data.birthYear || !data.birthMonth || !data.birthDay) return 'Осталась дата рождения';
      const birthDate = `${data.birthYear}-${String(data.birthMonth).padStart(2, '0')}-${String(data.birthDay).padStart(2, '0')}`;
      if (calcAgeFromBirthDate(birthDate) < 18) return '';
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
      profile.cycleTrackingEnabled = false;
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
    const weight = data.weight || 70;
    const height = data.height || 175;
    const weightGoal = data.weightGoal || weight;

    const bmi = calcBMI(weight, height);
    const goalBmi = calcBMI(weightGoal, height);
    const bmiWord = bmiCategoryWord(bmi);
    const weightDiff = Math.round(Math.abs(weightGoal - weight));
    const goalTooLow = goalBmi > 0 && goalBmi < 18.5;
    const minKg = minNormalWeightKg(height);

    const weightValues = useMemo(() => Array.from({ length: 271 }, (_, i) => 30 + i), []);
    const heightValues = useMemo(() => Array.from({ length: 151 }, (_, i) => 100 + i), []);

    const wheelCard = (label, values, value, keyName) => React.createElement('div', {
      style: { flex: 1, background: '#f7efe2', borderRadius: 18, padding: '13px 0 14px', textAlign: 'center' }
    },
      React.createElement('div', { className: 'text-xs font-semibold', style: { color: 'rgba(0,0,0,.55)' } }, label),
      React.createElement(WheelPicker, {
        values,
        value,
        onChange: (v) => onChange({ ...data, [keyName]: v }),
        height: 100
      })
    );

    // «вид шага»: поля экрана общие для слоя (.mc-step-content 18px) — свой p-4/p-3 давал 34px по бокам
    return React.createElement('div', { className: 'flex flex-col gap-3' },
      React.createElement('div', {
        style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 6, lineHeight: 1.3 }
      }, 'Рост и вес'),
      React.createElement('div', {
        className: 'text-xs',
        style: { color: 'rgba(0,0,0,.55)', lineHeight: 1.5 }
      }, 'Вес будете уточнять каждое утро, здесь только точка отсчёта'),
      React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 8 } },
        wheelCard('Рост, см', heightValues, height, 'height'),
        wheelCard('Вес сейчас, кг', weightValues, weight, 'weight')
      ),
      wheelCard('Желаемый вес, кг', weightValues, weightGoal, 'weightGoal'),
      goalTooLow
        ? React.createElement('div', {
          className: 'rounded-2xl p-3',
          style: { background: '#f6e6dd' }
        },
          React.createElement('div', { className: 'text-xs font-bold', style: { color: '#a1471c' } },
            `ИМТ цели ${goalBmi.toFixed(1).replace('.', ',')} — ниже нормы`),
          React.createElement('div', { className: 'text-xs mt-1', style: { color: 'rgba(0,0,0,.55)', lineHeight: 1.55 } },
            `При росте ${height} см нижняя граница нормы — ${minKg} кг. Цель можно оставить, но прогноз по срокам для неё мы не строим — обсудите её с куратором.`)
        )
        : React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('div', { style: { flex: 1, background: '#efe3cf', borderRadius: 16, padding: '12px 14px' } },
            React.createElement('div', { className: 'text-xs', style: { color: 'rgba(0,0,0,.45)' } }, 'ИМТ сейчас'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 } },
              React.createElement('span', { style: { fontSize: 18, fontWeight: 700, color: '#201e1d' } },
                bmi > 0 ? bmi.toFixed(1).replace('.', ',') : '—'),
              React.createElement('span', { className: 'text-xs font-semibold', style: { color: bmi < 18.5 ? '#a1471c' : 'rgba(0,0,0,.45)' } }, bmiWord)
            )
          ),
          React.createElement('div', { style: { flex: 1, background: '#efe3cf', borderRadius: 16, padding: '12px 14px' } },
            React.createElement('div', { className: 'text-xs', style: { color: 'rgba(0,0,0,.45)' } }, 'До цели'),
            React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 } },
              React.createElement('span', { style: { fontSize: 18, fontWeight: 700, color: '#201e1d' } }, String(weightDiff)),
              React.createElement('span', { className: 'text-xs font-semibold', style: { color: 'rgba(0,0,0,.45)' } }, 'кг')
            )
          )
        )
    );
  }

  registerStep('profile-body', {
    title: 'Рост и вес',
    hint: 'Вес будете уточнять каждое утро, здесь только точка отсчёта',
    nextLabel: 'Дальше',
    icon: '',
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
    },
    // Черновик тела: нужен для resume и правила «переспросить через 3 дня».
    // profileCompleted не трогаем — финал только на metabolism.
    save: async (data) => {
      const profile = lsGet('heys_profile', {}) || {};
      profile.weight = Number(data.weight) || profile.weight;
      profile.height = Number(data.height) || profile.height;
      profile.weightGoal = Number(data.weightGoal) || profile.weightGoal || profile.weight;
      profile.profileBodyCapturedAt = Date.now();
      profile.updatedAt = Date.now();
      lsSet('heys_profile', profile);
      return { ok: true, affectedKeys: ['heys_profile'] };
    }
  });

  // ============================================================
  // ШАГ 3: GOALS (цель: дефицит/профицит)
  // ============================================================

  function ProfileGoalsComponent({ data, onChange }) {
    const deficitPctTarget = Number.isFinite(Number(data.deficitPctTarget))
      ? Number(data.deficitPctTarget)
      : null;
    const directionId = data.goalDirection || goalDirectionFromPct(deficitPctTarget);
    const direction = GOAL_DIRECTIONS.find((item) => item.id === directionId) || null;
    const activityLevel = data.activityLevel || '';
    const selectedTempo = direction?.tempos.find((tempo) => tempo.value === deficitPctTarget) || null;

    const pickDirection = (next) => {
      const defaultTempo = next.tempos.find((tempo) => tempo.id === 'mid') || next.tempos[0];
      onChange({
        ...data,
        goalDirection: next.id,
        deficitPctTarget: defaultTempo.value,
      });
    };

    // «вид шага»: поля экрана общие для слоя (.mc-step-content 18px) — свой p-4/p-3 давал 34px по бокам
    return React.createElement('div', { className: 'flex flex-col gap-6' },
      React.createElement('div', {
        style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 6, lineHeight: 1.3 }
      }, 'Цель и активность'),
      React.createElement('div', {
        className: 'text-xs',
        style: { color: 'rgba(0,0,0,.55)', lineHeight: 1.5, marginTop: 8 }
      }, 'Цель можно поменять в любой момент'),
      React.createElement('div', { className: 'text-xs font-semibold tracking-widest uppercase', style: { color: '#8a4a20', marginTop: 16 } }, 'Цель'),
      React.createElement('div', { className: 'flex flex-col gap-2' },
        GOAL_DIRECTIONS.map((item) => React.createElement('button', {
          key: item.id,
          type: 'button',
          onClick: () => pickDirection(item),
          className: 'w-full text-left px-4 py-3 rounded-xl border-2',
          style: directionId === item.id
            ? { borderColor: '#c67139', background: '#efe3cf' }
            : { borderColor: '#e5e7eb', background: '#fff' }
        }, item.label))
      ),
      direction && direction.id !== 'hold' && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'text-xs font-semibold tracking-widest uppercase', style: { color: '#8a4a20' } }, 'Темп'),
        React.createElement('div', { className: 'flex flex-wrap gap-2' },
          direction.tempos.map((tempo) => React.createElement('button', {
            key: tempo.id,
            type: 'button',
            onClick: () => onChange({ ...data, goalDirection: direction.id, deficitPctTarget: tempo.value }),
            className: 'px-4 rounded-full text-sm font-semibold',
            // «цель касания»: чип держит 44 pt даже при тексте в одну строку
            style: Object.assign({ minHeight: 44, display: 'inline-flex', alignItems: 'center' },
              deficitPctTarget === tempo.value
                ? { background: '#c67139', color: '#2b1608' }
                : { background: '#f7efe2', color: 'rgba(0,0,0,.55)' })
          }, tempo.label))
        ),
        selectedTempo && React.createElement('p', { className: 'text-xs text-gray-500' }, selectedTempo.hint)
      ),
      React.createElement('div', { className: 'text-xs font-semibold tracking-widest uppercase', style: { color: '#8a4a20' } }, 'Активность сейчас'),
      React.createElement('div', { className: 'flex flex-wrap gap-2' },
        ACTIVITY_LEVELS.map((item) => React.createElement('button', {
          key: item.id,
          type: 'button',
          onClick: () => onChange({ ...data, activityLevel: item.id }),
          className: 'px-4 rounded-full text-sm font-semibold',
          // «цель касания»: чип держит 44 pt даже при тексте в одну строку
          style: Object.assign({ minHeight: 44, display: 'inline-flex', alignItems: 'center' },
            activityLevel === item.id
              ? { background: '#c67139', color: '#2b1608' }
              : { background: '#f7efe2', color: 'rgba(0,0,0,.55)' })
        }, item.label))
      ),
      React.createElement('p', { className: 'text-xs text-gray-500' },
        'Спрашиваем один раз — пока нет факта шагов, отсюда берётся прогноз недель до цели. Сам расход дня считается по факту: шагам, тренировкам и бытовой активности.'
      )
    );
  }

  registerStep('profile-goals', {
    title: 'Цель и активность',
    hint: 'Цель можно поменять в любой момент',
    nextLabel: 'Дальше',
    icon: '',
    component: ProfileGoalsComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {}) || {};
      const deficitPctTarget = Number.isFinite(Number(profile.deficitPctTarget))
        ? Number(profile.deficitPctTarget)
        : undefined;
      return {
        deficitPctTarget,
        activityLevel: profile.activityLevel || '',
        goalDirection: profile.goalDirection || goalDirectionFromPct(deficitPctTarget),
      };
    },
    validate: (data) => {
      if (!Number.isFinite(Number(data.deficitPctTarget))) {
        return 'Выберите цель';
      }
      if (!ACTIVITY_LEVELS.some((item) => item.id === data.activityLevel)) {
        return 'Выберите активность';
      }
      return true;
    },
    getValidationMessage: (data) => {
      if (!Number.isFinite(Number(data.deficitPctTarget))) {
        return 'Выберите цель';
      }
      if (!ACTIVITY_LEVELS.some((item) => item.id === data.activityLevel)) {
        return 'Выберите активность';
      }
      return null;
    },
    // Цель не устаревает: сохраняем черновик, чтобы не переспрашивать при resume.
    save: async (data) => {
      const profile = lsGet('heys_profile', {}) || {};
      profile.deficitPctTarget = data.deficitPctTarget;
      if (data.activityLevel) profile.activityLevel = data.activityLevel;
      if (data.goalDirection) profile.goalDirection = data.goalDirection;
      profile.updatedAt = Date.now();
      lsSet('heys_profile', profile);
      return { ok: true, affectedKeys: ['heys_profile'] };
    }
  });

  // ============================================================
  // ШАГ 4: METABOLISM (норма сна, инсулиновая волна)
  // ============================================================

  function ProfileMetabolismComponent({ data, onChange }) {
    const [showSleepHint, setShowSleepHint] = useState(false);
    const [showInsulinHint, setShowInsulinHint] = useState(false);

    const profile = lsGet('heys_profile', {}) || {};
    const gender = data.gender || profile.gender || 'Мужской';
    const birthDate = data.birthDate || profile.birthDate || '';
    const age = birthDate ? calcAgeFromBirthDate(birthDate) : profile.age || 30;

    const sleepNorm = calcSleepNorm(age, gender);
    const sleepHours = Number(data.sleepHours ?? sleepNorm.hours);
    const insulinWaveHours = data.insulinWaveHours ?? getSmartInsulinDefault(age);
    const sleepLabel = `${String(sleepHours).replace('.', ',')} ч`;

    const nudgeSleep = (delta) => {
      const next = Math.min(12, Math.max(4, Math.round((sleepHours + delta) * 2) / 2));
      onChange({ ...data, sleepHours: next });
    };

    // «вид шага»: поля экрана общие для слоя (.mc-step-content 18px) — свой p-4/p-3 давал 34px по бокам
    return React.createElement('div', { className: 'flex flex-col gap-6' },
      React.createElement('div', {
        style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 6, lineHeight: 1.3 }
      }, 'Сон и инсулиновая волна'),
      React.createElement('div', {
        className: 'text-xs',
        style: { color: 'rgba(0,0,0,.55)', lineHeight: 1.5, marginTop: 8 }
      }, 'По этим двум числам считается окно приёмов'),
      React.createElement('div', { className: 'flex flex-col gap-2', style: { marginTop: 16 } },
        React.createElement('div', { className: 'flex items-center gap-2 relative' },
          React.createElement('div', {
            className: 'text-xs font-semibold tracking-widest uppercase',
            style: { color: '#8a4a20' }
          }, 'Сколько обычно спите'),
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
        React.createElement('div', { className: 'flex items-center justify-center gap-2' },
          React.createElement('button', {
            type: 'button',
            onClick: () => nudgeSleep(-0.5),
            className: 'px-4 rounded-full text-sm font-semibold',
            // «цель касания»: 44 pt у обоих шагов и у значения между ними
            style: { background: '#f7efe2', color: 'rgba(0,0,0,.55)', minWidth: 52, minHeight: 44 }
          }, '−'),
          React.createElement('div', {
            className: 'px-4 rounded-full text-sm font-semibold',
            style: {
              background: '#c67139', color: '#2b1608', minWidth: 84, minHeight: 44,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }
          }, sleepLabel),
          React.createElement('button', {
            type: 'button',
            onClick: () => nudgeSleep(0.5),
            className: 'px-4 rounded-full text-sm font-semibold',
            style: { background: '#f7efe2', color: 'rgba(0,0,0,.55)', minWidth: 52, minHeight: 44 }
          }, '+')
        )
      ),

      React.createElement('div', { className: 'flex flex-col gap-2' },
        React.createElement('div', { className: 'flex items-center gap-2 relative' },
          React.createElement('div', {
            className: 'text-xs font-semibold tracking-widest uppercase',
            style: { color: '#8a4a20' }
          }, 'Инсулиновая волна'),
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

        React.createElement('div', { className: 'flex flex-col gap-2 mt-1' },
          INSULIN_PRESETS.map((preset) => {
            const isSelected = Math.abs(insulinWaveHours - preset.value) < 0.1;
            return React.createElement('button', {
              key: preset.value,
              type: 'button',
              onClick: () => onChange({ ...data, insulinWaveHours: preset.value }),
              className: 'w-full px-4 py-3 rounded-xl text-left flex items-center justify-between',
              style: isSelected
                ? { background: '#efe3cf', boxShadow: 'inset 0 0 0 2px #c67139' }
                : { background: '#f7efe2' }
            },
              React.createElement('span', {
                className: 'text-sm font-semibold',
                style: { color: isSelected ? '#201e1d' : 'rgba(0,0,0,.55)' }
              }, preset.label),
              React.createElement('span', {
                className: 'text-xs',
                style: { color: 'rgba(0,0,0,.4)' }
              }, preset.desc)
            );
          })
        ),
        React.createElement('p', {
          className: 'text-xs mt-2',
          style: { color: 'rgba(0,0,0,.42)', lineHeight: 1.45 }
        }, 'Волна задаёт, сколько после приёма пищи держится подъём инсулина: от неё зависят подсказки о перекусах. Меняется в настройках.')
      )
    );
  }

  registerStep('profile-metabolism', {
    title: 'Сон и инсулиновая волна',
    hint: 'По этим двум числам считается окно приёмов',
    nextLabel: 'Готово',
    icon: '',
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
        cycleTrackingEnabled: false,
        // Базовый вес (стартовый, из регистрации) — НЕ меняется после
        baseWeight: profile.baseWeight || registrationWeight,
        // Текущий вес — изначально = базовый, потом обновляется из чек-ина
        weight: profile.weight || registrationWeight,
        height: step2.height || profile.height || 175,
        // Целевой вес (из регистрации)
        weightGoal: step2.weightGoal || profile.weightGoal || registrationWeight,
        deficitPctTarget: step3.deficitPctTarget ?? profile.deficitPctTarget ?? 0,
        activityLevel: step3.activityLevel || profile.activityLevel || undefined,
        sleepHours: step4.sleepHours || profile.sleepHours || 8,
        insulinWaveHours: step4.insulinWaveHours || profile.insulinWaveHours || 3,
        profileCompleted: true,
        updatedAt: Date.now()
      };

      ensureRegistrationInProgressMarker({ source: 'profile-metabolism.save' });
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
      if (hasActiveWriteAccess() && !dayData.weightMorning && updatedProfile.weight) {
        const mutationAt = Math.max(Date.now(), (Number(dayData.weightUpdatedAt) || 0) + 1);
        dayData.weightMorning = updatedProfile.weight;
        dayData.weightUpdatedAt = mutationAt;
        dayData.updatedAt = mutationAt;
        writeDayDataScoped(todayKey, dayData);
        console.log('[ProfileSteps] Weight synced to day data:', updatedProfile.weight, 'kg for', todayKey);
      }

      syncCurrentClientName(fullName, 'profile-wizard', { syncCloud: true });

      console.log('[ProfileSteps] Profile saved:', updatedProfile);
      console.log('[ProfileSteps] Norms calculated:', norms);

      return confirmProfileCloudSave(updatedProfile);
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
      cycleTrackingEnabled: false,
      // Базовый вес (стартовый, из регистрации) — НЕ меняется после
      baseWeight: profile.baseWeight || registrationWeight,
      // Текущий вес — изначально = базовый, потом обновляется из чек-ина
      weight: profile.weight || registrationWeight,
      height: step2.height || profile.height || 175,
      // Целевой вес (из регистрации)
      weightGoal: step2.weightGoal || profile.weightGoal || registrationWeight,
      deficitPctTarget: step3.deficitPctTarget ?? profile.deficitPctTarget ?? 0,
      activityLevel: step3.activityLevel || profile.activityLevel || undefined,
      sleepHours: step4.sleepHours || profile.sleepHours || 8,
      insulinWaveHours: step4.insulinWaveHours || profile.insulinWaveHours || 3,
      profileCompleted: true,
      updatedAt: Date.now()
    };

    ensureRegistrationInProgressMarker({ source: 'saveProfileFromStepData' });
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

    return confirmProfileCloudSave(updatedProfile);
  }

  /**
   * Записывает вес из регистрации в данные дня
   * Используется при нажатии "Начать чек-ин" на шаге welcome
   * чтобы чек-ин НЕ спрашивал вес повторно
   */
  function syncWeightToDay(allStepsData) {
    if (!hasActiveWriteAccess()) {
      console.info('[syncWeightToDay] Trial is not active, keeping weight in profile only');
      return false;
    }
    const step2 = allStepsData['profile-body'] || {};
    const weight = step2.weight;

    if (!weight) {
      console.log('[syncWeightToDay] No weight in stepData, skipping');
      return;
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const dayData = readDayDataScoped(todayKey, {});

    if (!dayData.weightMorning) {
      const mutationAt = Math.max(Date.now(), (Number(dayData.weightUpdatedAt) || 0) + 1);
      dayData.weightMorning = weight;
      dayData.weightUpdatedAt = mutationAt;
      dayData.updatedAt = mutationAt;
      writeDayDataScoped(todayKey, dayData);
      console.log('[syncWeightToDay] Weight synced to day:', weight, 'kg for', todayKey);
    } else {
      console.log('[syncWeightToDay] Day already has weight:', dayData.weightMorning);
    }
  }

  function readWelcomeProfile() {
    const cid = getCurrentClientId();
    const helper = HEYS.MorningCheckinUtils?.readProfileForceRawScoped;
    if (cid && typeof helper === 'function') {
      const scoped = helper(cid);
      if (scoped && typeof scoped === 'object') return scoped;
    }
    return lsGet('heys_profile', {}) || {};
  }

  function resolveProductTodayISO() {
    if (typeof HEYS.dateUtils?.todayISO === 'function') return HEYS.dateUtils.todayISO();
    if (typeof HEYS.utils?.todayISO === 'function') return HEYS.utils.todayISO();
    const d = new Date();
    if (d.getHours() < 3) d.setDate(d.getDate() - 1);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toDateKeyISO(value) {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatRuLongDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function formatRuDateWithWeekday(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' });
  }

  function resolveAssignedCuratorName(profile) {
    const fromProfile = String(
      profile?.curatorName
      || profile?.curator_name
      || profile?.curatorFirstName
      || ''
    ).trim();
    if (fromProfile) return fromProfile;
    const hasAssignment = !!(profile?.curatorId || profile?.curator_id || profile?.hasCurator);
    if (!hasAssignment) return null;
    const fromConfig = String(
      HEYS.config?.curatorDisplayName
      || HEYS.config?.curatorName
      || HEYS.curatorDisplayName
      || ''
    ).trim();
    return fromConfig || null;
  }

  /**
   * Три конца регистрации:
   * - open: доступ есть → сводка + «Начать утренний чек-ин»
   * - dated: trial_pending + дата старта ещё впереди по todayISO
   * - waiting: куратор ещё не открыл доступ
   */
  function resolveRegistrationEndingKind() {
    const subscription = HEYS.Subscription;
    // Без subscription-gate доступ открыт (локальная/legacy-среда и тесты).
    if (!subscription || typeof subscription.canWriteStatus !== 'function') {
      return { kind: 'open', status: 'none', details: null };
    }
    const details = subscription.getCachedDetails?.() || null;
    const status = details?.status
      || subscription.getCachedStatus?.()
      || subscription.getLocalStatus?.()
      || 'none';
    const canWrite = subscription.canWriteStatus(status) === true;
    if (canWrite) return { kind: 'open', status, details };

    const startRaw = details?.trial_started_at || null;
    const startKey = toDateKeyISO(startRaw);
    const todayKey = resolveProductTodayISO();
    if (startKey && todayKey && startKey > todayKey) {
      return { kind: 'dated', status, details, startRaw, startKey };
    }
    if (status === 'trial_pending' && startKey && todayKey && startKey <= todayKey) {
      // Дата по продуктовым суткам уже наступила, а статус ещё pending —
      // показываем ожидание с проверкой доступа, не сводку чек-ина.
      return { kind: 'waiting', status, details, startRaw, startKey };
    }
    return { kind: 'waiting', status, details, startRaw, startKey };
  }

  function WelcomeStepComponent({ stepData, context }) {
    // Живая регистрация держит цифры в stepData до save. Resume/повторный
    // показ читает уже сохранённый профиль — иначе в карточке остаются
    // дефолты 70 кг / 30 лет, как будто профиль не подтянулся.
    const steps = stepData || {};
    const step1 = steps['profile-personal'] || {};
    const step2 = steps['profile-body'] || {};
    const step3 = steps['profile-goals'] || {};
    const profile = readWelcomeProfile();
    const ending = resolveRegistrationEndingKind();
    const curatorName = resolveAssignedCuratorName(profile);
    const onStartDaily = context?.onStartDailyCheckin;
    const onRefreshAccess = context?.onRefreshAccess;

    const firstName = step1.firstName || profile.firstName || '';
    const weight = Number(step2.weight) || Number(profile.weight) || 70;
    const weightGoal = Number(step2.weightGoal) || Number(profile.weightGoal) || weight;
    const deficitPctTarget = Number.isFinite(Number(step3.deficitPctTarget))
      ? Number(step3.deficitPctTarget)
      : (Number.isFinite(Number(profile.deficitPctTarget)) ? Number(profile.deficitPctTarget) : 0);
    const gender = step1.gender || profile.gender || 'Мужской';

    let age = 30;
    if (step1.birthYear && step1.birthMonth && step1.birthDay) {
      age = calcAgeFromBirthDate(`${step1.birthYear}-${String(step1.birthMonth).padStart(2, '0')}-${String(step1.birthDay).padStart(2, '0')}`) || 30;
    } else if (profile.birthDate) {
      age = calcAgeFromBirthDate(profile.birthDate) || Number(profile.age) || 30;
    } else if (Number(profile.age) > 0) {
      age = Number(profile.age);
    }

    const calculatedNorms = calcNormsFromGoal(deficitPctTarget, gender, age);
    const activityLevel = step3.activityLevel || profile.activityLevel || '';
    const weeks = calcTimeToGoal(weight, weightGoal, deficitPctTarget, activityLevel);
    const protPct = calculatedNorms.proteinPct || 25;
    const carbsPct = calculatedNorms.carbsPct || 50;
    const fatPct = 100 - protPct - carbsPct;

    // «вид карточки итогов»: строки 12/600, шаг 11, значение справа
    // табличными цифрами.
    const row = (label, value, valueStyle) => React.createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 11,
        fontSize: 12,
        fontWeight: 600
      }
    },
      React.createElement('span', { style: { color: 'rgba(0,0,0,.55)', fontWeight: 600 } }, label),
      React.createElement('span', {
        style: Object.assign({ fontVariantNumeric: 'tabular-nums' }, valueStyle || { color: '#201e1d' })
      }, value)
    );

    // «вид финального экрана»: круг 60 px, тон подложки и обводки — свой у
    // каждого из трёх концов.
    const endingDisc = (bg, stroke, size, strokeWidth, paths) => React.createElement('div', {
      style: {
        width: 60,
        height: 60,
        borderRadius: 999,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    },
      React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke,
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true'
      }, ...paths)
    );

    const primaryBtn = (label, onClick) => React.createElement('button', {
      type: 'button',
      style: {
        width: '100%',
        maxWidth: 320,
        minHeight: 48,
        padding: '14px 24px',
        background: '#c67139',
        color: 'white',
        border: 'none',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer'
      },
      onClick
    }, label);

    const secondaryBtn = (label, onClick) => React.createElement('button', {
      type: 'button',
      style: {
        width: '100%',
        maxWidth: 320,
        minHeight: 44,
        marginTop: 6,
        padding: '10px 16px',
        background: 'transparent',
        color: 'rgba(0,0,0,.5)',
        border: 'none',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        order: 2
      },
      onClick
    }, label);

    // «вид карточки итогов»: фон --c2, радиус 20, поля 14/16, во всю колонку.
    const cardShell = (children) => React.createElement('div', {
      style: {
        width: '100%',
        background: '#efe3cf',
        borderRadius: 20,
        padding: '14px 16px',
        marginTop: 20,
        textAlign: 'left'
      }
    }, children);

    if (ending.kind === 'waiting') {
      return React.createElement('div', {
        className: 'welcome-step-content',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 34,
          textAlign: 'center'
        }
      },
        // ожидание куратора: круг --tint с тоном --ac (контракт; кадр канваса
        // рисует --c2/--acs — отступление названо в протоколе экрана)
        endingDisc('#f6e6dd', '#8a4a20', 27, 2.75, [
          React.createElement('path', { key: 'h', d: 'M12 7v5l3 2' }),
          React.createElement('circle', { key: 'c', cx: '12', cy: '12', r: '9' })
        ]),
        React.createElement('h2', {
          style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 18, marginBottom: 0 }
        }, 'Профиль сохранён'),
        React.createElement('p', {
          style: { fontSize: 12.5, fontWeight: 500, color: 'rgba(0,0,0,.55)', marginTop: 9, lineHeight: 1.55 }
        }, 'Куратор назначит дату начала недели и откроет дневник.'),
        cardShell([
          curatorName ? row('Куратор', curatorName) : null,
          row('Профиль', 'заполнен', { color: '#5c6a45' }),
          row('Дневник', 'откроется после старта', { color: 'rgba(0,0,0,.42)', fontWeight: 500 })
        ].filter(Boolean)),
        React.createElement('div', {
          style: { width: '100%', maxWidth: 320, marginTop: 24, display: 'flex', flexDirection: 'column' }
        },
          primaryBtn('Проверить доступ', () => {
            Promise.resolve(onRefreshAccess?.()).catch(() => null);
          }),
          curatorName
            ? secondaryBtn('Написать куратору', () => {
              window.open('https://t.me/heyslab_support_bot', '_blank', 'noopener,noreferrer');
            })
            : null
        )
      );
    }

    if (ending.kind === 'dated') {
      const startLabel = formatRuLongDate(ending.startRaw) || ending.startKey;
      const startDetailed = formatRuDateWithWeekday(ending.startRaw) || startLabel;
      return React.createElement('div', {
        className: 'welcome-step-content',
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 34,
          textAlign: 'center'
        }
      },
        // неделя позже: тот же тинт, что у ожидания
        endingDisc('#f6e6dd', '#8a4a20', 27, 2.75, [
          React.createElement('rect', { key: 'r', x: '3', y: '5', width: '18', height: '16', rx: '3' }),
          React.createElement('path', { key: 'p', d: 'M8 3v4M16 3v4M3 11h18' })
        ]),
        React.createElement('h2', {
          style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 18, marginBottom: 0, textWrap: 'pretty' }
        }, `Неделя начнётся ${startLabel}`),
        React.createElement('p', {
          style: { fontSize: 12.5, fontWeight: 500, color: 'rgba(0,0,0,.55)', marginTop: 9, lineHeight: 1.55 }
        }, 'Профиль готов. До этого дня дневник закрыт — считать нечего.'),
        cardShell([
          curatorName ? row('Куратор', curatorName) : null,
          row('Старт недели', startDetailed, { color: '#8a4a20' }),
          row('Первый чек-ин', `утром ${startLabel}`, { color: 'rgba(0,0,0,.42)', fontWeight: 500 })
        ].filter(Boolean)),
        React.createElement('p', {
          style: {
            fontSize: 11,
            color: 'rgba(0,0,0,.42)',
            marginTop: 12,
            lineHeight: 1.5,
            maxWidth: 320
          }
        }, 'До этого дня приложение можно не открывать — считать ещё нечего.'),
        React.createElement('div', {
          style: { width: '100%', maxWidth: 320, marginTop: 24, display: 'flex', flexDirection: 'column' }
        },
          primaryBtn('Проверить доступ', () => {
            Promise.resolve(onRefreshAccess?.()).catch(() => null);
          }),
          curatorName
            ? secondaryBtn('Написать куратору', () => {
              window.open('https://t.me/heyslab_support_bot', '_blank', 'noopener,noreferrer');
            })
            : null
        )
      );
    }

    // open: доступ есть
    return React.createElement('div', {
      className: 'welcome-step-content',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 34,
        textAlign: 'center'
      }
    },
      // доступ открыт: шалфей — круг --gr-bg, галочка 28 обводкой 3 тоном --gr
      endingDisc('#eaefe0', '#5c6a45', 28, 3, [
        React.createElement('path', { key: 'v', d: 'M5 13l4 4L19 7' })
      ]),
      React.createElement('h2', {
        style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 18, marginBottom: 0 }
      }, firstName ? `Профиль готов, ${firstName}` : 'Профиль готов'),
      React.createElement('p', {
        style: { fontSize: 12.5, fontWeight: 500, color: 'rgba(0,0,0,.55)', marginTop: 9, lineHeight: 1.55 }
      }, 'Дальше — утренний чек-ин: полминуты, и день начнёт считаться.'),
      cardShell([
        row('Целевой вес', `${weightGoal} кг`),
        row('Белки · углеводы · жиры', `${protPct} · ${carbsPct} · ${fatPct} %`),
        row('Прогноз', weeks, { color: '#8a4a20' })
      ]),
      React.createElement('p', {
        style: {
          fontSize: 11,
          color: 'rgba(0,0,0,.42)',
          marginTop: 12,
          marginBottom: 20,
          lineHeight: 1.5,
          maxWidth: 320
        }
      }, 'Норма калорий считается каждый день по факту: шагам, тренировкам и бытовой активности.'),
      primaryBtn('Начать утренний чек-ин', () => {
        console.log('[WelcomeStep] Starting daily checkin after registration');
        if (typeof onStartDaily === 'function') onStartDaily();
      })
    );
  }

  function formatResumeCapturedDate(ms) {
    const date = new Date(Number(ms) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function ProfileResumeComponent({ data }) {
    const firstName = data.firstName || '';
    const bodyStale = data.bodyStale === true;
    const capturedLabel = data.capturedLabel || '';
    const rows = [
      { done: true, current: false, label: 'Согласия подписаны' },
      { done: data.personalDone === true, current: false, label: 'Персональные данные' },
      { done: data.bodyDone === true, current: !data.bodyDone, label: bodyStale ? 'Рост и вес — заново' : 'Рост и вес' },
      { done: data.goalsDone === true, current: data.bodyDone && !data.goalsDone, label: 'Цель и активность' },
      { done: false, current: data.bodyDone && data.goalsDone, label: 'Сон и волна' },
    ];
    return React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 8px', textAlign: 'center' }
    },
      React.createElement('div', {
        style: { fontSize: 20, fontWeight: 700, color: '#201e1d', marginTop: 8, lineHeight: 1.3 }
      }, firstName ? `${firstName}, профиль наполовину` : 'Незавершённый профиль'),
      React.createElement('p', {
        style: { fontSize: 13, color: 'rgba(0,0,0,.55)', marginTop: 9, lineHeight: 1.55, maxWidth: 320 }
      }, bodyStale && capturedLabel
        ? `Профиль заполнен наполовину. Заполнено ${capturedLabel} — вес спросим заново, за неделю он мог измениться.`
        : 'Профиль заполнен наполовину. Продолжим с того места, где остановились.'),
      React.createElement('div', {
        style: {
          width: '100%', maxWidth: 320, background: '#f7efe2', borderRadius: 20,
          padding: '16px 18px', marginTop: 20, textAlign: 'left'
        }
      }, rows.map((row) => React.createElement('div', {
        key: row.label,
        style: {
          display: 'flex', alignItems: 'center', gap: 9, marginTop: row.label === rows[0].label ? 0 : 12,
          fontSize: 12, fontWeight: row.current ? 700 : 600,
          color: row.done ? 'rgba(0,0,0,.55)' : (row.current ? '#201e1d' : 'rgba(0,0,0,.3)')
        }
      }, row.label)))
    );
  }

  registerStep('profile-resume', {
    title: 'Незавершённый профиль',
    hint: '',
    icon: '',
    hiddenFromProgress: true,
    hideProgressDots: true,
    disableBack: true,
    nextLabel: (data) => data?.continueLabel || 'Продолжить',
    component: ProfileResumeComponent,
    getInitialData: () => {
      const profile = lsGet('heys_profile', {}) || {};
      const capturedAt = Number(profile.profileBodyCapturedAt || 0);
      const bodyFresh = Number(profile.weight) > 0
        && Number(profile.height) > 0
        && capturedAt > 0
        && (Date.now() - capturedAt) <= (3 * 24 * 60 * 60 * 1000);
      const goalsDone = Number.isFinite(Number(profile.deficitPctTarget))
        && ['sedentary', 'light', 'active'].includes(profile.activityLevel);
      const personalDone = String(profile.firstName || '').trim().length > 0 && !!profile.gender && !!profile.birthDate;
      let continueLabel = 'Продолжить с шага 4';
      if (!bodyFresh) continueLabel = 'Продолжить с шага 2';
      else if (!goalsDone) continueLabel = 'Продолжить с шага 3';
      return {
        firstName: profile.firstName || '',
        personalDone,
        bodyDone: bodyFresh,
        bodyStale: personalDone && !bodyFresh,
        goalsDone,
        capturedLabel: formatResumeCapturedDate(capturedAt),
        continueLabel
      };
    },
    validate: () => true,
    save: () => ({ completed: true, affectedKeys: [] })
  });

  // Регистрируем шаг welcome (с отложенной регистрацией на случай если StepModal загрузится позже)
  function registerWelcomeStep() {
    if (HEYS.StepModal && HEYS.StepModal.registerStep) {
      HEYS.StepModal.registerStep('welcome', {
        title: 'Готово',
        hint: '',
        icon: '',
        component: WelcomeStepComponent,
        canSkip: false,
        disableBack: true,
        hideHeaderNext: true,
        hideDailyFooter: true,
        hideProgressDots: true,
        // Строка «счёт шагов»: точек четыре — итог ими не считается.
        // hideProgressDots прячет точки НА этом экране, а из счёта шаг
        // выбрасывает только hiddenFromProgress (heys_step_modal_v1.js:605).
        // Без него на шагах 1–4 рисовалось пять точек.
        hiddenFromProgress: true,
        getInitialData: () => ({}),
        validate: () => true,
        save: () => { }
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
    const weeks = calcTimeToGoal(profile.weight, profile.weightGoal, profile.deficitPctTarget, profile.activityLevel);

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

    // Локальный profileCompleted становится окончательным только после
    // точечного cloud readback. До него reload обязан продолжить регистрацию.
    if (isRegistrationInProgress(profile)) return true;

    // Если есть подтверждённый флаг profileCompleted — используем его.
    if (profile.profileCompleted === true) {
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
          if (legacyProfile.profileCompleted === true) {
            localStorage.removeItem('heys_registration_in_progress');
            return false;
          }
          ensureRegistrationInProgressMarker({ source: 'legacy-profile-migration' });
          return true;
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

    // Частичный профиль (например, только имя и дата рождения после шага 1)
    // не должен открывать prestart-gate. Полным считается только подтверждённый
    // `profileCompleted` либо legacy-профиль, прошедший строгий auto-detect выше.
    ensureRegistrationInProgressMarker({ source: 'isProfileIncomplete' });
    return true;
  }

  HEYS.ProfileSteps = {
    isProfileIncomplete,
    calcNormsFromGoal,
    calcAgeFromBirthDate,
    calcSleepNorm,
    isValidGivenName,
    givenNameError,
    minAdultBirthYear,
    bmiCategoryWord,
    minNormalWeightKg,
    formatWeeksForecast,
    calcTimeToGoal,
    showCongratulationsModal
  };

})(window);
