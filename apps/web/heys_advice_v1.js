/**
 * HEYS Advice Module v1
 * Модульная система умных советов
 * 
 * @file heys_advice_v1.js
 * @version 1.0.0
 * @description Генерация персонализированных советов на основе аналитики дня
 */

(function() {
  'use strict';
  
  // ═══════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════
  
  const MAX_ADVICES_PER_SESSION = 10;
  const ADVICE_COOLDOWN_MS = 30000; // 30 секунд между советами
  const SESSION_KEY = 'heys_advice_session';
  
  // ═══════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Получает тон сообщений в зависимости от времени суток
   * @param {number} hour - Текущий час (0-23)
   * @returns {'silent'|'gentle'|'active'|'calm'}
   */
  function getToneForHour(hour) {
    if (hour >= 23 || hour < 6) return 'silent';  // Ночь — не беспокоить
    if (hour >= 6 && hour < 10) return 'gentle';   // Утро — мягко
    if (hour >= 10 && hour < 18) return 'active';  // День — активно
    return 'calm'; // Вечер — спокойно
  }
  
  /**
   * Определяет эмоциональное состояние пользователя
   * @param {Object} params
   * @returns {'normal'|'stressed'|'crashed'|'success'|'returning'}
   */
  function getEmotionalState(params) {
    const { day, currentStreak, mealCount, kcalPct, lastVisitDaysAgo, totalDaysTracked } = params;
    
    // Вернулся после перерыва
    if (lastVisitDaysAgo > 3) return 'returning';
    
    // Срыв — сильно переел
    if (kcalPct > 1.5) return 'crashed';
    
    // Стресс — низкое настроение
    const avgMood = calculateAverageMood(day);
    if (avgMood > 0 && avgMood < 3) return 'stressed';
    
    // Успех — streak или хороший день
    if (currentStreak >= 3 || (kcalPct >= 0.9 && kcalPct <= 1.1)) return 'success';
    
    return 'normal';
  }
  
  /**
   * Вычисляет среднее настроение за день
   * @param {Object} day
   * @returns {number} 0 если нет данных, иначе 1-5
   */
  function calculateAverageMood(day) {
    const meals = day?.meals || [];
    const moods = meals.map(m => m.mood).filter(m => m > 0);
    if (moods.length === 0) return 0;
    return moods.reduce((a, b) => a + b, 0) / moods.length;
  }
  
  /**
   * Определяет особый день (понедельник, пятница и т.д.)
   * @param {Date} date
   * @returns {string|null}
   */
  function getSpecialDay(date) {
    const day = date.getDay();
    const month = date.getMonth();
    const dateNum = date.getDate();
    const hour = date.getHours();
    
    // Новый год
    if (month === 0 && dateNum === 1) return 'new_year';
    
    // Понедельник утро
    if (day === 1 && hour < 12) return 'monday_morning';
    
    // Пятница вечер
    if (day === 5 && hour >= 17) return 'friday_evening';
    
    // Воскресенье вечер
    if (day === 0 && hour >= 18) return 'sunday_evening';
    
    // Конец месяца
    if (dateNum >= 28) return 'month_end';
    
    return null;
  }
  
  /**
   * Фильтрует советы по эмоциональному состоянию
   * @param {Array} advices
   * @param {string} emotionalState
   * @returns {Array}
   */
  function filterByEmotionalState(advices, emotionalState) {
    // При стрессе или срыве — убираем warnings
    if (emotionalState === 'stressed' || emotionalState === 'crashed') {
      return advices.filter(a => a.type !== 'warning');
    }
    return advices;
  }
  
  /**
   * Проверяет, занят ли пользователь (открыта модалка и т.д.)
   * @param {Object} uiState
   * @returns {boolean}
   */
  function isUserBusy(uiState) {
    if (!uiState) return false;
    return !!(
      uiState.modalOpen ||
      uiState.searchOpen ||
      uiState.showTimePicker ||
      uiState.showGramsPicker ||
      uiState.showWeightPicker ||
      uiState.showDeficitPicker ||
      uiState.showZonePicker ||
      uiState.showSleepQualityPicker ||
      uiState.showDayScorePicker ||
      uiState.showHouseholdPicker ||
      uiState.showTrainingPicker
    );
  }
  
  // ═══════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Получает сессионные данные
   * @returns {Object}
   */
  function getSessionData() {
    try {
      const data = sessionStorage.getItem(SESSION_KEY);
      return data ? JSON.parse(data) : { shown: [], count: 0, lastShown: 0 };
    } catch (e) {
      return { shown: [], count: 0, lastShown: 0 };
    }
  }
  
  /**
   * Сохраняет сессионные данные
   * @param {Object} data
   */
  function saveSessionData(data) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) {
      // Ignore storage errors
    }
  }
  
  /**
   * Отмечает совет как показанный
   * @param {string} adviceId
   */
  function markAdviceShown(adviceId) {
    const data = getSessionData();
    if (!data.shown.includes(adviceId)) {
      data.shown.push(adviceId);
    }
    data.count++;
    data.lastShown = Date.now();
    saveSessionData(data);
  }
  
  /**
   * Проверяет, можно ли показать совет
   * @param {string} adviceId
   * @returns {boolean}
   */
  function canShowAdvice(adviceId) {
    const data = getSessionData();
    
    // Лимит советов за сессию
    if (data.count >= MAX_ADVICES_PER_SESSION) return false;
    
    // Cooldown между советами
    if (Date.now() - data.lastShown < ADVICE_COOLDOWN_MS) return false;
    
    // Уже показывали этот совет
    if (data.shown.includes(adviceId)) return false;
    
    return true;
  }
  
  /**
   * Сбрасывает счётчик сессии (при смене дня)
   */
  function resetSessionAdvices() {
    saveSessionData({ shown: [], count: 0, lastShown: 0 });
  }
  
  // ═══════════════════════════════════════════════════════════
  // ADVICE GENERATION
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Генерирует все возможные советы на основе контекста
   * @param {Object} ctx - Контекст дня
   * @returns {Array} Массив советов
   */
  function generateAdvices(ctx) {
    const advices = [];
    const {
      dayTot, normAbs, optimum, day, pIndex, currentStreak,
      hour, mealCount, hasTraining, kcalPct,
      tone, specialDay, emotionalState
    } = ctx;
    
    // Ночью — никаких советов
    if (tone === 'silent') return [];
    
    // Guard: пустой день
    if ((dayTot?.kcal || 0) < 10 && mealCount === 0) return [];
    
    // Вычисляем процентные показатели
    const proteinPct = (dayTot?.prot || 0) / (normAbs?.prot || 1);
    const fatPct = (dayTot?.fat || 0) / (normAbs?.fat || 1);
    const carbsPct = (dayTot?.carbs || 0) / (normAbs?.carbs || 1);
    const fiberPct = (dayTot?.fiber || 0) / (normAbs?.fiber || 1);
    const simplePct = (dayTot?.simple || 0) / (normAbs?.simple || 1);
    const transPct = (dayTot?.trans || 0) / (normAbs?.trans || 1);
    const harmPct = (dayTot?.harm || 0) / (normAbs?.harm || 1);
    
    // ─────────────────────────────────────────────────────────
    // 🎯 SPECIAL DAY TIPS — Мотивация по дням
    // ─────────────────────────────────────────────────────────
    
    if (specialDay === 'monday_morning') {
      advices.push({
        id: 'monday_motivation',
        icon: '💪',
        text: 'Новая неделя — новые возможности!',
        type: 'tip',
        priority: 5,
        category: 'motivation',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    if (specialDay === 'friday_evening') {
      advices.push({
        id: 'friday_reminder',
        icon: '🎯',
        text: 'Выходные близко — помни о своих целях!',
        type: 'tip',
        priority: 10,
        category: 'motivation',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    if (specialDay === 'sunday_evening') {
      advices.push({
        id: 'sunday_planning',
        icon: '📋',
        text: 'Спланируй питание на неделю',
        type: 'tip',
        priority: 10,
        category: 'motivation',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 😊 EMOTIONAL STATE TIPS — По состоянию
    // ─────────────────────────────────────────────────────────
    
    if (emotionalState === 'crashed') {
      advices.push({
        id: 'crash_support',
        icon: '💙',
        text: 'Бывает! Завтра новый день. Ты справишься!',
        type: 'achievement',
        priority: 1,
        category: 'emotional',
        triggers: ['tab_open', 'product_added'],
        ttl: 6000
      });
    }
    
    if (emotionalState === 'stressed') {
      advices.push({
        id: 'stress_support',
        icon: '🤗',
        text: 'Ты молодец, что записываешь. Это уже успех!',
        type: 'achievement',
        priority: 2,
        category: 'emotional',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 🏆 ACHIEVEMENTS (priority: 1-10) — показываются при tab_open
    // ─────────────────────────────────────────────────────────
    
    if (currentStreak >= 7 && !sessionStorage.getItem('heys_streak7')) {
      advices.push({
        id: 'streak_7',
        icon: '🏆',
        text: `Невероятно! ${currentStreak} дней в норме!`,
        type: 'achievement',
        priority: 1,
        category: 'achievement',
        score: 1.0,
        triggers: ['tab_open'],
        ttl: 7000,
        showConfetti: true,
        onShow: () => { try { sessionStorage.setItem('heys_streak7', '1'); } catch(e) {} }
      });
    }
    
    if (currentStreak >= 3 && currentStreak < 7 && !sessionStorage.getItem('heys_streak3')) {
      advices.push({
        id: 'streak_3',
        icon: '🔥',
        text: `${currentStreak} дня подряд в норме! Так держать!`,
        type: 'achievement',
        priority: 2,
        category: 'achievement',
        score: 0.9,
        triggers: ['tab_open'],
        ttl: 5000,
        onShow: () => { try { sessionStorage.setItem('heys_streak3', '1'); } catch(e) {} }
      });
    }
    
    // Идеальный день — показываем при tab_open вечером
    if (hour >= 18 && kcalPct >= 0.95 && kcalPct <= 1.05 && 
        proteinPct >= 0.9 && fatPct >= 0.9 && carbsPct >= 0.9) {
      advices.push({
        id: 'perfect_day',
        icon: '⭐',
        text: 'Идеальный баланс! Отличная работа 🎉',
        type: 'achievement',
        priority: 5,
        category: 'achievement',
        score: 1.0,
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Первый приём — после добавления продукта
    if (mealCount === 1 && !localStorage.getItem('heys_first_meal_tip')) {
      advices.push({
        id: 'first_day',
        icon: '👋',
        text: 'Отличное начало! Записывай всё — это ключ к успеху',
        type: 'achievement',
        priority: 3,
        category: 'achievement',
        score: 1.0,
        triggers: ['product_added'],
        ttl: 5000,
        onShow: () => { try { localStorage.setItem('heys_first_meal_tip', '1'); } catch(e) {} }
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // ⚠️ WARNINGS (priority: 11-30) — показываются после добавления продукта
    // ─────────────────────────────────────────────────────────
    
    if (kcalPct >= 1.25) {
      advices.push({
        id: 'kcal_excess_critical',
        icon: '🔴',
        text: `${Math.round(kcalPct * 100)}% от нормы — завтра компенсируем`,
        type: 'warning',
        priority: 11,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 6000
      });
    } else if (kcalPct >= 1.1) {
      advices.push({
        id: 'kcal_excess_mild',
        icon: '⚠️',
        text: 'Немного больше нормы — ничего страшного',
        type: 'warning',
        priority: 15,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000
      });
    }
    
    // Транс-жиры
    if (transPct > 1.0) {
      advices.push({
        id: 'trans_fat_warning',
        icon: '⚠️',
        text: 'Транс-жиры превышены — избегай фастфуда',
        type: 'warning',
        priority: 12,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000
      });
    }
    
    // Простые углеводы
    if (simplePct > 1.3) {
      advices.push({
        id: 'simple_carbs_warning',
        icon: '🍬',
        text: 'Много сахара сегодня — ограничь сладкое',
        type: 'warning',
        priority: 14,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000
      });
    }
    
    // Высокий индекс вреда
    if (harmPct > 1.0) {
      advices.push({
        id: 'harm_warning',
        icon: '💔',
        text: 'Много вредного — завтра начнём сначала',
        type: 'warning',
        priority: 13,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 💡 TIPS (priority: 31-50) — советы по балансу
    // ─────────────────────────────────────────────────────────
    
    // Белок
    if (proteinPct < 0.5 && hour >= 12) {
      advices.push({
        id: 'protein_low',
        icon: '🥩',
        text: 'Добавь белка — мясо, рыба, творог',
        type: 'tip',
        priority: 31,
        category: 'nutrition',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    // Клетчатка
    if (fiberPct < 0.3 && mealCount >= 2) {
      advices.push({
        id: 'fiber_low',
        icon: '🥬',
        text: 'Мало клетчатки — добавь овощей или злаков',
        type: 'fiber',
        priority: 32,
        category: 'nutrition',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    // Хорошая клетчатка
    if (fiberPct >= 1.0) {
      advices.push({
        id: 'fiber_good',
        icon: '🥗',
        text: 'Отлично с клетчаткой! Кишечник скажет спасибо',
        type: 'achievement',
        priority: 35,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 4000
      });
    }
    
    // Полезные жиры
    const goodFatPct = (dayTot?.good || 0) / (normAbs?.good || 1);
    if (goodFatPct < 0.4 && hour >= 14) {
      advices.push({
        id: 'good_fat_low',
        icon: '🥑',
        text: 'Добавь полезных жиров — авокадо, орехи, оливковое масло',
        type: 'tip',
        priority: 33,
        category: 'nutrition',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    // Тренировка
    if (hasTraining && proteinPct < 0.8) {
      advices.push({
        id: 'post_training_protein',
        icon: '💪',
        text: 'После тренировки важен белок — добавь 20-30г',
        type: 'tip',
        priority: 34,
        category: 'training',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    // Вечерние советы
    if (hour >= 20 && kcalPct < 0.7) {
      advices.push({
        id: 'evening_undereating',
        icon: '🌙',
        text: 'Ещё можно поесть — не голодай перед сном',
        type: 'tip',
        priority: 36,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    if (hour >= 21 && kcalPct >= 0.9 && kcalPct <= 1.1) {
      advices.push({
        id: 'evening_perfect',
        icon: '😴',
        text: 'Отличный день! Осталось хорошо выспаться',
        type: 'achievement',
        priority: 37,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Баланс макросов
    if (mealCount >= 2 && proteinPct >= 0.9 && fatPct >= 0.9 && carbsPct >= 0.9 &&
        proteinPct <= 1.2 && fatPct <= 1.2 && carbsPct <= 1.2) {
      advices.push({
        id: 'balanced_macros',
        icon: '⚖️',
        text: 'Отличный баланс БЖУ!',
        type: 'achievement',
        priority: 38,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 4000
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 🌞 LIFESTYLE TIPS (priority: 51-70)
    // ─────────────────────────────────────────────────────────
    
    // Сон
    const sleepHours = calculateSleepHours(day);
    if (sleepHours > 0 && sleepHours < 6) {
      advices.push({
        id: 'sleep_low',
        icon: '😴',
        text: 'Мало сна — аппетит может быть повышен',
        type: 'tip',
        priority: 51,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Утренний совет
    if (hour >= 7 && hour < 10 && mealCount === 0) {
      advices.push({
        id: 'morning_breakfast',
        icon: '☀️',
        text: 'Доброе утро! Не забудь позавтракать',
        type: 'tip',
        priority: 52,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Шаги
    const steps = day?.steps || 0;
    if (steps >= 10000) {
      advices.push({
        id: 'steps_goal',
        icon: '🚶',
        text: `${steps.toLocaleString()} шагов! Отличная активность`,
        type: 'achievement',
        priority: 53,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    return advices;
  }
  
  /**
   * Вычисляет часы сна
   * @param {Object} day
   * @returns {number}
   */
  function calculateSleepHours(day) {
    if (!day?.sleepStart || !day?.sleepEnd) return 0;
    
    const [startH, startM] = day.sleepStart.split(':').map(Number);
    const [endH, endM] = day.sleepEnd.split(':').map(Number);
    
    let hours = endH - startH;
    let mins = endM - startM;
    
    // Если легли вчера (например 23:00 → 07:00)
    if (hours < 0) hours += 24;
    
    return hours + mins / 60;
  }
  
  // ═══════════════════════════════════════════════════════════
  // REACT HOOK
  // ═══════════════════════════════════════════════════════════
  
  /**
   * React hook для получения советов
   * @param {Object} params
   * @param {Object} params.dayTot - Суммы за день
   * @param {Object} params.normAbs - Нормы в граммах
   * @param {number} params.optimum - Целевой калораж
   * @param {Object} params.day - Данные дня
   * @param {Map} params.pIndex - Индекс продуктов
   * @param {number} params.currentStreak - Текущий streak (передаётся из DayTab, НЕ вычисляется заново!)
   * @param {string} params.trigger - Что вызвало показ ('tab_open'|'product_added')
   * @param {Object} params.uiState - Состояние UI для проверки занятости
   * @returns {Object} Объект с советами и методами
   */
  function useAdviceEngine(params) {
    // ⚠️ ВАЖНО: currentStreak передаётся как параметр, НЕ вычисляется!
    const { dayTot, normAbs, optimum, day, pIndex, currentStreak, trigger, uiState } = params;
    const React = window.React;
    
    // Вычисляем контекст
    const ctx = React.useMemo(() => {
      const now = new Date();
      const hour = now.getHours();
      const meals = day?.meals || [];
      const mealCount = meals.filter(m => m.items?.length > 0).length;
      const trainings = day?.trainings || [];
      const hasTraining = trainings.some(t => t.z && t.z.some(m => m > 0));
      
      // 🧠 Расширенный контекст
      const kcalPct = (dayTot?.kcal || 0) / (optimum || 2000);
      const tone = getToneForHour(hour);
      const specialDay = getSpecialDay(now);
      const emotionalState = getEmotionalState({
        day,
        currentStreak: currentStreak || 0,
        mealCount,
        kcalPct,
        lastVisitDaysAgo: 0, // TODO: вычислить из localStorage
        totalDaysTracked: 30 // Приблизительно
      });
      
      return {
        dayTot: dayTot || {},
        normAbs: normAbs || {},
        optimum: optimum || 2000,
        day: day || {},
        pIndex: pIndex || new Map(),
        currentStreak: currentStreak || 0,
        hour,
        mealCount,
        hasTraining,
        kcalPct,
        tone,
        specialDay,
        emotionalState
      };
    }, [dayTot, normAbs, optimum, day, pIndex, currentStreak]);
    
    // Генерируем все советы
    const allAdvices = React.useMemo(() => {
      return generateAdvices(ctx);
    }, [ctx]);
    
    // Фильтруем по эмоциональному состоянию
    const filteredAdvices = React.useMemo(() => {
      return filterByEmotionalState(allAdvices, ctx.emotionalState);
    }, [allAdvices, ctx.emotionalState]);
    
    // Фильтруем по триггеру и проверяем можно ли показать
    const relevantAdvices = React.useMemo(() => {
      if (!trigger) return [];
      if (isUserBusy(uiState)) return [];
      
      return filteredAdvices
        .filter(a => a.triggers.includes(trigger))
        .filter(a => canShowAdvice(a.id))
        .sort((a, b) => a.priority - b.priority);
    }, [filteredAdvices, trigger, uiState]);
    
    // Основной совет
    const primary = relevantAdvices[0] || null;
    const adviceCount = relevantAdvices.length;
    
    return {
      primary,
      relevant: relevantAdvices,
      adviceCount,
      allAdvices,
      ctx,
      // Методы
      markShown: markAdviceShown,
      canShow: canShowAdvice,
      resetSession: resetSessionAdvices
    };
  }
  
  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════
  
  window.HEYS = window.HEYS || {};
  window.HEYS.advice = {
    useAdviceEngine,
    generateAdvices,
    markShown: markAdviceShown,
    canShow: canShowAdvice,
    resetSessionAdvices,
    // Helper functions для тестирования
    getToneForHour,
    getEmotionalState,
    getSpecialDay,
    filterByEmotionalState,
    isUserBusy
  };
  
})();
