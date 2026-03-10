// heys_morning_checkin_v1.js — Утренний чек-ин: вес, сон, шаги
// Показывается при открытии приложения, если сегодня не заполнен вес
// 
// === МИГРАЦИЯ НА МОДУЛЬНУЮ СИСТЕМУ ===
// Этот файл теперь использует HEYS.StepModal + HEYS.Steps
// Старый API (HEYS.MorningCheckin, HEYS.shouldShowMorningCheckin) сохранён для совместимости
//
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // === Утилиты ===
  function getTodayKey() {
    // Используем «эффективную» дату: до 03:00 считаем, что день ещё предыдущий
    // Приоритет: dayUtils.todayISO (учитывает ночной порог) → models.todayISO → локальный fallback
    const dayUtils = HEYS.dayUtils || {};
    if (typeof dayUtils.todayISO === 'function') return dayUtils.todayISO();
    if (HEYS.models && typeof HEYS.models.todayISO === 'function') return HEYS.models.todayISO();

    // Fallback без зависимостей
    const d = new Date();
    if (d.getHours() < 3) {
      d.setDate(d.getDate() - 1);
    }
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function readStoredValue(key, fallback = null) {
    let value;

    if (HEYS.store?.get) {
      value = HEYS.store.get(key, fallback);
    } else if (HEYS.utils?.lsGet) {
      value = HEYS.utils.lsGet(key, fallback);
    } else {
      try {
        value = localStorage.getItem(key);
      } catch {
        return fallback;
      }
    }

    if (value == null) return fallback;

    if (typeof value === 'string') {
      if (value.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try {
          value = HEYS.store.decompress(value.slice(3));
        } catch (_) { }
      }
      try {
        return JSON.parse(value);
      } catch (_) {
        return value;
      }
    }

    return value;
  }

  function getCurrentClientId() {
    const U = HEYS.utils || {};
    if (U.getCurrentClientId) return U.getCurrentClientId();
    return HEYS.currentClientId || '';
  }

  function getCheckinSessionKey(clientId, dateKey) {
    return `heys_morning_checkin_done_${clientId || 'unknown'}_${dateKey || 'unknown'}`;
  }

  function debugDayStorage(todayKey, currentClientId, altKey) {
    // DEBUG функция закомментирована для чистоты консоли
    return;
    /* Original debug code:
    try {
      const ls = global.localStorage;
      if (!ls) return;
      const directKey = `heys_dayv2_${todayKey}`;
      const nsKey = currentClientId ? `heys_${currentClientId}_dayv2_${todayKey}` : '';
      const rawDirect = ls.getItem(directKey);
      const rawNs = nsKey ? ls.getItem(nsKey) : null;
      let parsedDirect = null;
      let parsedNs = null;
      try { parsedDirect = rawDirect ? JSON.parse(rawDirect) : null; } catch (_) {}
      try { parsedNs = rawNs ? JSON.parse(rawNs) : null; } catch (_) {}
      const candidates = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.includes('_dayv2_')) {
          candidates.push(k);
        }
      }
      // 🔇 v4.8.2: Debug логи отключены — включить при необходимости
    } catch (e) {
      // не ломаем основной поток из-за debug
    }
    */
  }

  /**
   * Проверяем, нужно ли показывать утренний чек-ин
   * ВАЖНО: Эта функция вызывается ПОСЛЕ события heysSyncCompleted,
   * поэтому проверка isInitialSyncCompleted не нужна
   * 
   * КРИТИЧНО: Если профиль не заполнен — ВСЕГДА показываем чек-ин!
   * Это нужно чтобы новый пользователь обязательно прошёл регистрационные шаги.
   */
  function shouldShowMorningCheckin() {
    const U = HEYS.utils || {};

    // Если клиент не выбран — НЕ показываем чек-ин (чтобы не показывать до авторизации)
    const currentClientId = getCurrentClientId();
    if (!currentClientId) {
      // console.log('[MorningCheckin] No clientId, skip check');
      return false;
    }

    const todayKey = getTodayKey();
    const sessionKey = getCheckinSessionKey(currentClientId, todayKey);

    // 🆕 v1.9.1: Если чек-ин уже был показан/пропущен в этой сессии — НЕ показываем
    // Переводим legacy-флаг в per-client/per-day ключ, чтобы не блокировать других клиентов
    try {
      if (sessionStorage.getItem('heys_morning_checkin_done') === 'true') {
        sessionStorage.setItem(sessionKey, 'true');
        sessionStorage.removeItem('heys_morning_checkin_done');
      }
    } catch (_) { }
    if (sessionStorage.getItem(sessionKey) === 'true') {
      console.info('[MorningCheckin] 🚫 Skip — sessionStorage флаг активен:', sessionKey);
      return false;
    }

    // 🔒 КРИТИЧНО: Если профиль не заполнен — ВСЕГДА показываем!
    // Регистрационные шаги (profile-personal, profile-body, etc.) обязательны для новых пользователей
    const profile = readStoredValue('heys_profile', {});
    if (HEYS.ProfileSteps && HEYS.ProfileSteps.isProfileIncomplete) {
      if (HEYS.ProfileSteps.isProfileIncomplete(profile)) {
        console.log('[MorningCheckin] 🆕 Profile incomplete — forcing checkin with registration steps');
        return true;
      }
    }

    const dayData = readStoredValue(`heys_dayv2_${todayKey}`, {});
    const calendarKey = new Date().toISOString().slice(0, 10);
    const altDayData = calendarKey !== todayKey ? readStoredValue(`heys_dayv2_${calendarKey}`, {}) : {};

    const hasWeightPrimary = dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0;
    const hasWeightAlt = altDayData && altDayData.weightMorning != null && altDayData.weightMorning !== '' && altDayData.weightMorning !== 0;
    const hasWeight = hasWeightPrimary || hasWeightAlt;

    console.info('[MorningCheckin] 🔍 shouldShowMorningCheckin check:', {
      clientId: currentClientId?.slice(0, 8),
      todayKey,
      calendarKey,
      weightMorningPrimary: dayData?.weightMorning,
      weightMorningAlt: altDayData?.weightMorning,
      hasWeightPrimary,
      hasWeightAlt,
      hasWeight,
      sessionKey,
      sessionFlag: sessionStorage.getItem(sessionKey),
    });

    // Показываем, если ни в эффективном дне (до 3:00 = вчера), ни в календарном ключе нет веса
    return !hasWeight;
  }

  /**
   * Централизованная функция для получения списка шагов чек-ина
   * Используется и в MorningCheckin, и в showCheckin.morning()
   */
  function getCheckinSteps(profile) {
    const steps = [];
    let hasProfileSteps = false;

    // 1. Проверяем профиль для новых пользователей
    if (HEYS.ProfileSteps && HEYS.ProfileSteps.isProfileIncomplete) {
      if (HEYS.ProfileSteps.isProfileIncomplete(profile)) {
        steps.push('profile-personal', 'profile-body', 'profile-goals', 'profile-metabolism');
        // 🎉 Шаг приветствия после регистрации — визуальный разделитель
        steps.push('welcome');
        hasProfileSteps = true;
      }
    }

    // 2. Шаг веса — ВСЕГДА спрашиваем в чек-ине
    // Вес в регистрации (целый) → профиль (базовый вес для расчётов)
    // Вес в чек-ине (с десятыми) → день (точное утреннее взвешивание)
    steps.push('weight');

    // 2.1. 📊 Верификация данных за вчера
    // Показывается ТОЛЬКО если вчера <50% калорий и хотя бы 1 приём пищи
    // Спрашивает: реальное голодание или незаполненные данные?
    steps.push('yesterdayVerify');

    // 3. Остальные шаги чек-ина
    steps.push('sleepTime', 'sleepQuality');

    // 3. 🔄 Загрузочный день (Refeed) — СРАЗУ после sleepQuality
    // Показывается всегда — клиент сам решает, система подсветит рекомендацию если есть долг
    steps.push('refeedDay');

    // 4. Условные шаги (cycle, measurements)
    // Для cycle: показываем если cycleTrackingEnabled=true ИЛИ если это регистрация (шаг спросит сам)
    // При регистрации профиль ещё пуст, но шаг cycle сам определит пол из StepModal data
    if (hasProfileSteps) {
      // При регистрации всегда добавляем cycle — шаг сам решит показывать ли (по полу из данных регистрации)
      steps.push('cycle');
    } else if (HEYS.Steps && HEYS.Steps.shouldShowCycleStep && HEYS.Steps.shouldShowCycleStep()) {
      steps.push('cycle');
    }
    if (HEYS.Steps && HEYS.Steps.shouldShowMeasurements && HEYS.Steps.shouldShowMeasurements()) {
      steps.push('measurements');
    }

    // 5. 🧊 Холодовое воздействие (опциональный шаг)
    steps.push('cold_exposure');

    // 6. 💊 Витамины (опциональный шаг, запоминается на след. день)
    steps.push('supplements');

    // 7. 😊 Утреннее настроение (обязательный шаг)
    steps.push('morning_mood');

    // 8. Завершающий шаг — цель по шагам
    steps.push('stepsGoal');

    // 9. 🌟 Мотивирующий финальный шаг
    steps.push('morningRoutine');

    return steps;
  }

  /**
   * MorningCheckin — обёртка над новым StepModal
   * Использует шаги: [profile-steps], weight, sleepTime, sleepQuality, [measurements], stepsGoal
   * 
   * @param {function} onComplete - Вызывается при завершении всех шагов
   * @param {function} onClose - Вызывается при закрытии крестиком (отложить на потом)
   */
  function MorningCheckin({ onComplete, onClose }) {
    // Если StepModal доступен — используем его
    if (HEYS.StepModal && HEYS.StepModal.Component) {
      const profile = readStoredValue('heys_profile', {});
      const steps = getCheckinSteps(profile);

      // Определяем: это регистрационный чек-ин (есть profile-шаги)?
      const isRegistrationCheckin = steps.includes('profile-personal');

      // Обёртка для onComplete: обновляем данные дня
      const wrappedOnComplete = () => {
        // 🎉 Поздравительная модалка теперь показывается как шаг 'welcome' внутри flow

        // 🎫 Автостарт триала УБРАН (v5.0)
        // Триал стартует только через куратора:
        //   1. Клиент оставляет заявку на лендинге
        //   2. Куратор одобряет → даёт PIN
        //   3. При первом логине → activate_trial_timer_by_session
        // См. database/2026-02-08_trial_machine_fix.sql

        // 🔔 Устанавливаем флаг для советов по витаминам
        try {
          const currentClientId = getCurrentClientId();
          const sessionKey = getCheckinSessionKey(currentClientId, todayKey);
          sessionStorage.setItem(sessionKey, 'true');
          sessionStorage.removeItem('heys_morning_checkin_done');
          // Очищаем флаг показа совета — чтобы он показался после чек-ина
          sessionStorage.removeItem('heys_morning_supplements_advice_shown');
        } catch (e) { /* sessionStorage недоступен */ }

        // 🔄 Принудительно обновляем данные дня после завершения чек-ина
        const todayKey = (HEYS.utils && HEYS.utils.getTodayKey) ? HEYS.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: todayKey, source: 'morning-checkin-complete', forceReload: true }
        }));

        // 💊 Вызываем событие для обновления советов
        window.dispatchEvent(new CustomEvent('heys:checkin-complete', {
          detail: { date: todayKey, type: 'morning' }
        }));

        if (onComplete) onComplete();
      };

      return React.createElement(HEYS.StepModal.Component, {
        steps: steps,
        onComplete: wrappedOnComplete,
        onClose: onClose, // Крестик в хедере для закрытия без сохранения
        showProgress: true,
        showStreak: true,
        showGreeting: true,
        showTip: true,
        allowSwipe: true
      });
    }

    // Fallback: простое сообщение если StepModal не загружен
    return React.createElement('div', {
      style: {
        padding: '20px',
        textAlign: 'center',
        background: 'var(--card, #fff)',
        borderRadius: '12px',
        margin: '20px'
      }
    },
      React.createElement('p', null, 'Загрузка...'),
      React.createElement('p', { style: { fontSize: '12px', color: '#666' } },
        'Убедитесь что загружены heys_step_modal_v1.js и heys_steps_v1.js'
      )
    );
  }

  // === Экспорт (обратная совместимость) ===
  HEYS.MorningCheckin = MorningCheckin;
  HEYS.shouldShowMorningCheckin = shouldShowMorningCheckin;

  // PERF v7.1: notify boot-chain hook that deferred module is ready
  window.dispatchEvent(new CustomEvent('heys-morning-checkin-ready'));

  /**
   * Быстрый API для показа конкретных шагов
   */
  HEYS.showCheckin = {
    // Полный утренний чек-ин
    morning: (onComplete) => {
      if (HEYS.StepModal) {
        const profile = readStoredValue('heys_profile', {});
        const steps = getCheckinSteps(profile);

        // Определяем: это регистрационный чек-ин (есть profile-шаги)?
        const isRegistrationCheckin = steps.includes('profile-personal');

        // Обёртка для onComplete: обновляем данные дня
        const wrappedOnComplete = () => {
          // 🎉 Поздравительная модалка теперь показывается как шаг 'welcome' внутри flow

          // 🎫 Автостарт триала уже произошёл в стартовом useEffect (через HEYS.Subscription)
          // Этот блок оставлен для логирования
          if (isRegistrationCheckin) {
            console.log('[showCheckin.morning] ✅ Registration checkin completed');
          }

          // 🔔 Устанавливаем флаг для советов по витаминам
          try {
            const currentClientId = getCurrentClientId();
            const todayKey = (HEYS.utils && HEYS.utils.getTodayKey) ? HEYS.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
            const sessionKey = getCheckinSessionKey(currentClientId, todayKey);
            sessionStorage.setItem(sessionKey, 'true');
            sessionStorage.removeItem('heys_morning_checkin_done');
            // Очищаем флаг показа совета — чтобы он показался после чек-ина
            sessionStorage.removeItem('heys_morning_supplements_advice_shown');
          } catch (e) { /* sessionStorage недоступен */ }

          // 🔄 Принудительно обновляем данные дня после завершения чек-ина
          const todayKey = (HEYS.utils && HEYS.utils.getTodayKey) ? HEYS.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date: todayKey, source: 'morning-checkin-complete', forceReload: true }
          }));

          // 💊 Вызываем событие для обновления советов
          window.dispatchEvent(new CustomEvent('heys:checkin-complete', {
            detail: { date: todayKey, type: 'morning' }
          }));

          if (onComplete) onComplete();
        };

        HEYS.StepModal.show({
          steps,
          onComplete: wrappedOnComplete
        });
      }
    },

    // Только вес
    weight: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['weight'],
          title: 'Взвешивание',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только шаги (цель)
    steps: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['stepsGoal'],
          title: 'Цель шагов',
          showProgress: false,
          onComplete
        });
      }
    },

    // Только сон
    sleep: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['sleepTime', 'sleepQuality'],
          title: 'Сон',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только дневной сон
    daySleep: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['daySleep'],
          title: 'Дневной сон',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только утреннее настроение
    morningMood: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['morning_mood'],
          title: 'Самочувствие',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только замеры тела
    measurements: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['measurements'],
          title: 'Замеры тела',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только дефицит калорий
    deficit: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['deficit'],
          title: 'Цель калорий',
          showProgress: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    },

    // Только витамины
    supplements: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['supplements'],
          title: '💊 Витамины',
          showProgress: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    },

    // Добавить приём пищи (через MealStep)
    meal: (dateKey, onComplete) => {
      if (HEYS.MealStep) {
        HEYS.MealStep.showAddMeal({
          dateKey: dateKey || new Date().toISOString().slice(0, 10),
          onComplete
        });
      } else if (HEYS.StepModal) {
        // Fallback если MealStep не загружен
        HEYS.StepModal.show({
          steps: ['mealTime', 'mealMood'],
          title: 'Новый приём',
          showProgress: true,
          showStreak: false,
          showGreeting: false,
          showTip: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    }
  };

  // console.log('[HEYS] MorningCheckin v2 loaded (using StepModal)');

})(typeof window !== 'undefined' ? window : global);