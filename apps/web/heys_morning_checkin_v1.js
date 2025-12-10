// heys_morning_checkin_v1.js — Утренний чек-ин: вес, сон, шаги
// Показывается при открытии приложения, если сегодня не заполнен вес
// 
// === МИГРАЦИЯ НА МОДУЛЬНУЮ СИСТЕМУ ===
// Этот файл теперь использует HEYS.StepModal + HEYS.Steps
// Старый API (HEYS.MorningCheckin, HEYS.shouldShowMorningCheckin) сохранён для совместимости
//
(function(global) {
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
      // Основной (эффективный) ключ
      console.log('[MorningCheckin][debug]', {
        todayKey,
        directKeyExists: !!rawDirect,
        nsKeyExists: !!rawNs,
        directWeight: parsedDirect?.weightMorning,
        nsWeight: parsedNs?.weightMorning,
        directUpdatedAt: parsedDirect?.updatedAt,
        nsUpdatedAt: parsedNs?.updatedAt,
        sampleKeys: candidates.slice(0, 10)
      });

      // Альтернативный календарный ключ (UTC) — для отладки рассинхрона
      if (altKey && altKey !== todayKey) {
        const altDirect = ls.getItem(`heys_dayv2_${altKey}`);
        const altNsKey = currentClientId ? `heys_${currentClientId}_dayv2_${altKey}` : '';
        const altNs = altNsKey ? ls.getItem(altNsKey) : null;
        let altDirectParsed = null, altNsParsed = null;
        try { altDirectParsed = altDirect ? JSON.parse(altDirect) : null; } catch(_){}
        try { altNsParsed = altNs ? JSON.parse(altNs) : null; } catch(_){}
        console.log('[MorningCheckin][debug-alt]', {
          altKey,
          altDirectExists: !!altDirect,
          altNsExists: !!altNs,
          altDirectWeight: altDirectParsed?.weightMorning,
          altNsWeight: altNsParsed?.weightMorning,
          altDirectUpdatedAt: altDirectParsed?.updatedAt,
          altNsUpdatedAt: altNsParsed?.updatedAt
        });
      }
    } catch (e) {
      // не ломаем основной поток из-за debug
    }
    */
  }
  
  /**
   * Проверяем, нужно ли показывать утренний чек-ин
   * ВАЖНО: Эта функция вызывается ПОСЛЕ события heysSyncCompleted,
   * поэтому проверка isInitialSyncCompleted не нужна
   */
  function shouldShowMorningCheckin() {
    const U = HEYS.utils || {};
    
    // Если клиент не выбран — НЕ показываем чек-ин (чтобы не показывать до авторизации)
    const currentClientId = U.getCurrentClientId ? U.getCurrentClientId() : '';
    if (!currentClientId) {
      // console.log('[MorningCheckin] No clientId, skip check');
      return false;
    }
    
    const todayKey = getTodayKey();
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${todayKey}`, {}) : {};
    const calendarKey = new Date().toISOString().slice(0, 10);
    const altDayData = calendarKey !== todayKey && U.lsGet ? U.lsGet(`heys_dayv2_${calendarKey}`, {}) : {};

    const hasWeightPrimary = dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0;
    const hasWeightAlt = altDayData && altDayData.weightMorning != null && altDayData.weightMorning !== '' && altDayData.weightMorning !== 0;
    const hasWeight = hasWeightPrimary || hasWeightAlt;

    // console.log('[MorningCheckin] Checking for clientId:', currentClientId.substring(0,8), '| ...');
    debugDayStorage(todayKey, currentClientId, calendarKey);

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
        hasProfileSteps = true;
      }
    }
    
    // 2. Стандартные шаги чек-ина
    // Пропускаем weight если есть profile-шаги (вес уже указан в wizard)
    if (!hasProfileSteps) {
      steps.push('weight');
    }
    steps.push('sleepTime', 'sleepQuality');
    
    // 3. Условные шаги
    if (HEYS.Steps && HEYS.Steps.shouldShowCycleStep && HEYS.Steps.shouldShowCycleStep()) {
      steps.push('cycle');
    }
    if (HEYS.Steps && HEYS.Steps.shouldShowMeasurements && HEYS.Steps.shouldShowMeasurements()) {
      steps.push('measurements');
    }
    
    // 4. 🧊 Холодовое воздействие (опциональный шаг)
    steps.push('cold_exposure');
    
    // 5. Завершающий шаг — цель по шагам
    steps.push('stepsGoal');
    
    // 6. 🌟 Мотивирующий финальный шаг
    steps.push('morningRoutine');
    
    return steps;
  }

  /**
   * MorningCheckin — обёртка над новым StepModal
   * Использует шаги: [profile-steps], weight, sleepTime, sleepQuality, [measurements], stepsGoal
   */
  function MorningCheckin({ onComplete }) {
    // Если StepModal доступен — используем его
    if (HEYS.StepModal && HEYS.StepModal.Component) {
      const U = HEYS.utils || {};
      const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
      const hadProfileSteps = HEYS.ProfileSteps && HEYS.ProfileSteps.isProfileIncomplete && HEYS.ProfileSteps.isProfileIncomplete(profile);
      const steps = getCheckinSteps(profile);
      
      // Обёртка для onComplete: показать поздравления если были profile-шаги
      const wrappedOnComplete = () => {
        if (hadProfileSteps && HEYS.ProfileSteps && HEYS.ProfileSteps.showCongratulationsModal) {
          HEYS.ProfileSteps.showCongratulationsModal();
        }
        if (onComplete) onComplete();
      };
      
      return React.createElement(HEYS.StepModal.Component, {
        steps: steps,
        onComplete: wrappedOnComplete,
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
        background: '#fff',
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

  /**
   * Быстрый API для показа конкретных шагов
   */
  HEYS.showCheckin = {
    // Полный утренний чек-ин
    morning: (onComplete) => {
      if (HEYS.StepModal) {
        const U = HEYS.utils || {};
        const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
        const hadProfileSteps = HEYS.ProfileSteps && HEYS.ProfileSteps.isProfileIncomplete && HEYS.ProfileSteps.isProfileIncomplete(profile);
        const steps = getCheckinSteps(profile);
        
        // Обёртка для onComplete: показать поздравления если были profile-шаги
        const wrappedOnComplete = () => {
          if (hadProfileSteps && HEYS.ProfileSteps && HEYS.ProfileSteps.showCongratulationsModal) {
            HEYS.ProfileSteps.showCongratulationsModal();
          }
          if (onComplete) onComplete();
        };
        
        HEYS.StepModal.show({
          steps,
          onComplete: wrappedOnComplete
        });
      }
    },
    
    // Только вес
    weight: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['weight'],
          title: 'Взвешивание',
          showProgress: false,
          onComplete
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
    sleep: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['sleepTime', 'sleepQuality'],
          title: 'Сон',
          onComplete
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