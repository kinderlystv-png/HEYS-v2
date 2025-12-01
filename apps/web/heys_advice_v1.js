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
   * @returns {'gentle'|'active'|'calm'}
   */
  function getToneForHour(hour) {
    // Убран silent режим — советы работают 24/7
    if (hour >= 6 && hour < 10) return 'gentle';   // Утро — мягко
    if (hour >= 10 && hour < 18) return 'active';  // День — активно
    return 'calm'; // Вечер/ночь — спокойно
  }
  
  /**
   * Определяет эмоциональное состояние пользователя
   * Использует централизованный HEYS.ratioZones для порогов
   * @param {Object} params
   * @returns {'normal'|'stressed'|'crashed'|'success'|'returning'}
   */
  function getEmotionalState(params) {
    const { day, currentStreak, mealCount, kcalPct, totalDaysTracked } = params;
    
    // Используем централизованный ratioZones
    const rz = HEYS.ratioZones;
    if (rz) {
      return rz.getEmotionalCategory(kcalPct, currentStreak);
    }
    
    // Fallback если ratioZones не загружен
    // Вычисляем lastVisitDaysAgo из localStorage
    let lastVisitDaysAgo = 0;
    try {
      const lastVisit = localStorage.getItem('heys_last_visit');
      if (lastVisit) {
        const last = new Date(lastVisit);
        const now = new Date();
        lastVisitDaysAgo = Math.floor((now - last) / (1000 * 60 * 60 * 24));
      }
    } catch(e) {}
    
    // Вернулся после перерыва
    if (lastVisitDaysAgo > 3) return 'returning';
    
    // Срыв — сильно переел или недоел
    if (kcalPct > 1.3 || kcalPct < 0.5) return 'crashed';
    
    // Стресс — низкое настроение
    const avgMood = calculateAverageMood(day);
    if (avgMood > 0 && avgMood < 3) return 'stressed';
    
    // Успех — streak или хороший день (0.75-1.1)
    if (currentStreak >= 3 || (kcalPct >= 0.75 && kcalPct <= 1.1)) return 'success';
    
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
   * Вычисляет средний стресс за день
   * @param {Object} day
   * @returns {number} 0 если нет данных, иначе 1-5
   */
  function calculateAverageStress(day) {
    const meals = day?.meals || [];
    const stresses = meals.map(m => m.stress).filter(s => s > 0);
    if (stresses.length === 0) return 0;
    return stresses.reduce((a, b) => a + b, 0) / stresses.length;
  }
  
  /**
   * Вычисляет среднее самочувствие за день
   * @param {Object} day
   * @returns {number} 0 если нет данных, иначе 1-5
   */
  function calculateAverageWellbeing(day) {
    const meals = day?.meals || [];
    const values = meals.map(m => m.wellbeing).filter(w => w > 0);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
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
      tone, specialDay, emotionalState, prof, waterGoal
    } = ctx;
    
    // Флаг для пустого дня — некоторые советы должны работать
    const isDayEmpty = (dayTot?.kcal || 0) < 10 && mealCount === 0;
    
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
    
    // Задача 42: После праздников — лёгкий день
    const today = new Date();
    const dayOfMonth = today.getDate();
    const monthOfYear = today.getMonth(); // 0-indexed
    // Дни ПОСЛЕ праздников: 1-2 января, 24 февраля, 9 марта, 10 мая, 13 июня
    const postHolidayDates = [
      [1, 0], [2, 0],    // После НГ
      [24, 1],           // После 23 февраля
      [9, 2],            // После 8 марта
      [10, 4],           // После 9 мая
      [13, 5]            // После 12 июня
    ];
    
    const isPostHoliday = postHolidayDates.some(([d, m]) => d === dayOfMonth && m === monthOfYear);
    
    if (isPostHoliday && !sessionStorage.getItem('heys_post_holiday')) {
      advices.push({
        id: 'post_holiday_detox',
        icon: '🌿',
        text: 'После вчерашнего праздника — лёгкий день: овощи, вода, белок',
        type: 'tip',
        priority: 15,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 6000,
        onShow: () => { try { sessionStorage.setItem('heys_post_holiday', '1'); } catch(e) {} }
      });
    }
    
    // Задача 43: Напоминание о лучшем дне недели
    const lastBestDayCheck = localStorage.getItem('heys_best_day_last_check');
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    if (!lastBestDayCheck || +lastBestDayCheck < weekAgo) {
      const recentDays = getRecentDays(7);
      
      if (recentDays.length >= 3) {
        // Найти день с лучшим ratio (closest to 1.0)
        let bestDay = null;
        let bestDiff = Infinity;
        
        for (const d of recentDays) {
          // Вычисляем сумму ккал дня (грубо)
          const dayMeals = d.meals || [];
          let dayKcal = 0;
          for (const meal of dayMeals) {
            for (const item of (meal.items || [])) {
              const product = pIndex?.byId?.get(item.product_id);
              if (product) dayKcal += (product.kcal100 || 0) * (item.grams || 100) / 100;
            }
          }
          
          // Используем текущий optimum (он стабилен)
          const ratio = dayKcal / (optimum || 2000);
          const diff = Math.abs(ratio - 1.0);
          
          if (diff < bestDiff && ratio > 0.5) {
            bestDiff = diff;
            bestDay = { ...d, ratio };
          }
        }
        
        if (bestDay && bestDiff < 0.15) { // В пределах ±15% от нормы
          const dayDate = new Date(bestDay.date);
          const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
          const dayName = dayNames[dayDate.getDay()];
          const pct = Math.round(bestDay.ratio * 100);
          
          advices.push({
            id: 'best_day_recall',
            icon: '⭐',
            text: `Твой лучший день был ${dayName} — ${pct}% нормы. Повтори!`,
            type: 'motivation',
            priority: 44,
            category: 'motivation',
            triggers: ['tab_open'],
            ttl: 6000,
            onShow: () => { 
              try { localStorage.setItem('heys_best_day_last_check', Date.now().toString()); } catch(e) {} 
            }
          });
        }
      }
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
        details: 'Не стоит переживать! Один день переедания — это нормально. Завтра сделай лёгкий дефицит 10-15% и всё выровняется. Главное — не срывайся в "раз уж переел" режим.',
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
        details: 'Транс-жиры — самые вредные. Они повышают "плохой" холестерин и снижают "хороший". Избегай: маргарин, фаст-фуд, чипсы, выпечка с длительным сроком хранения.',
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
        details: 'Простые углеводы быстро повышают сахар в крови, вызывая всплеск инсулина и потом упадок энергии. Альтернативы: фрукты, тёмный шоколад 70%+, орехи.',
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
        details: 'Белок важен для мышц, иммунитета и сытости. Норма: 1.5-2г на кг веса. Лучшие источники: курица, индейка, рыба, яйца, творог, греческий йогурт, бобовые.',
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
        details: 'Клетчатка важна для пищеварения и сытости. Норма: 25-35г в день. Лидеры: авокадо, брокколи, овсянка, чечевица, груши, малина, семена чиа.',
        type: 'tip',
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
        details: 'Омега-3 и мононенасыщенные жиры важны для мозга, сердца и гормонов. Лучшие источники: жирная рыба (сёмга, скумбрия), авокадо, оливковое масло, орехи (грецкие, миндаль), семена льна и чиа.',
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
        details: 'Белок в течение 2 часов после тренировки ускоряет восстановление мышц. Идеально: протеиновый коктейль, творог с бананом, куриная грудка с рисом, или греческий йогурт с орехами.',
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
        details: 'Сильный голод перед сном ухудшает качество сна и может привести к ночным перекусам. Лучше лёгкий ужин: белок + овощи, или творог с ягодами.',
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
    
    // Задача 37: Расширение morning_breakfast — нет завтрака к 11
    // НЕ показывать если morning_breakfast уже был показан
    if (hour >= 10 && hour < 12 && mealCount === 0 && !sessionStorage.getItem('heys_morning_breakfast_shown')) {
      advices.push({
        id: 'empty_stomach_late',
        icon: '🍳',
        text: `Уже ${hour}:00, а завтрака нет — метаболизм ждёт топлива`,
        type: 'tip',
        priority: 53,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000,
        onShow: () => { try { sessionStorage.setItem('heys_morning_breakfast_shown', '1'); } catch(e) {} }
      });
    }
    
    // Задача 44: Напоминание об обеде
    if (hour === 13 && mealCount === 1) {
      advices.push({
        id: 'lunch_time',
        icon: '🍽️',
        text: 'Час дня — идеальное время для обеда!',
        type: 'tip',
        priority: 52,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 45: Время полдника
    if (hour === 16 && kcalPct < 0.6) {
      const remaining = Math.round((optimum || 2000) * (1 - kcalPct));
      advices.push({
        id: 'snack_window',
        icon: '🥪',
        text: `16:00 — время полдника. Осталось ~${remaining} ккал`,
        type: 'tip',
        priority: 51,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 46: Белковый чемпион
    if (proteinPct >= 1.2 && !sessionStorage.getItem('heys_protein_champion')) {
      advices.push({
        id: 'protein_champion',
        icon: '🏆',
        text: 'Белковый чемпион! Мышцы тебя благодарят',
        type: 'achievement',
        priority: 10,
        category: 'achievement',
        triggers: ['tab_open', 'product_added'],
        ttl: 5000,
        onShow: () => { try { sessionStorage.setItem('heys_protein_champion', '1'); } catch(e) {} }
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
    
    // ─────────────────────────────────────────────────────────
    // ❄️ SEASONAL TIPS (priority: 60-65)
    // ─────────────────────────────────────────────────────────
    
    const month = new Date().getMonth();
    // Зима: ноябрь (10), декабрь (11), январь (0), февраль (1), март (2)
    if ((month >= 10 || month <= 2) && !sessionStorage.getItem('heys_winter_tip')) {
      advices.push({
        id: 'winter_vitamin_d',
        icon: '❄️',
        text: 'Зимой важен витамин D — рыба, яйца, грибы',
        type: 'tip',
        priority: 60,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000,
        onShow: () => { try { sessionStorage.setItem('heys_winter_tip', '1'); } catch(e) {} }
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 🌈 VARIETY TIPS (priority: 45-50)
    // ─────────────────────────────────────────────────────────
    
    // Разнообразие рациона
    const allItems = (day?.meals || []).flatMap(m => m.items || []);
    const productNames = allItems.map(it => {
      const product = pIndex?.byId?.get(it.product_id);
      return (product?.name || it.name || '').toLowerCase().trim();
    }).filter(Boolean);
    const uniqueProducts = new Set(productNames).size;
    
    if (productNames.length >= 5 && uniqueProducts < 3) {
      advices.push({
        id: 'variety_low',
        icon: '🌈',
        text: 'Разнообразь рацион — добавь другие продукты',
        type: 'tip',
        priority: 45,
        category: 'nutrition',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    // ═════════════════════════════════════════════════════════
    // 🍽️ PHASE 1: MEAL-LEVEL СОВЕТЫ (priority: 71-80)
    // ═════════════════════════════════════════════════════════
    
    // Получаем данные о приёмах пищи
    const lastMealWithItems = getLastMealWithItems(day);
    const firstMealWithItems = getFirstMealWithItems(day);
    const lastMealTotals = lastMealWithItems ? getMealTotals(lastMealWithItems, pIndex) : null;
    
    // meal_too_large — большой приём пищи (>800 ккал)
    if (lastMealTotals && lastMealTotals.kcal > 800 && canShowMealAdvice()) {
      advices.push({
        id: 'meal_too_large',
        icon: '🍽️',
        text: `Большой приём (${Math.round(lastMealTotals.kcal)} ккал)! Следующий сделай полегче`,
        type: 'tip',
        priority: 71,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000,
        onShow: () => markMealAdviceShown()
      });
    }
    
    // meal_too_small — маленький приём (<150 ккал при >=2 приёмах)
    if (lastMealTotals && lastMealTotals.kcal < 150 && lastMealTotals.kcal > 0 && mealCount >= 2 && canShowMealAdvice()) {
      advices.push({
        id: 'meal_too_small',
        icon: '🥄',
        text: 'Маловато — добавь ещё что-нибудь',
        type: 'tip',
        priority: 72,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000,
        onShow: () => markMealAdviceShown()
      });
    }
    
    // protein_per_meal_low — мало белка в приёме (<20г при >200 ккал)
    if (lastMealTotals && lastMealTotals.prot < 20 && lastMealTotals.kcal > 200 && canShowMealAdvice()) {
      advices.push({
        id: 'protein_per_meal_low',
        icon: '🥚',
        text: 'Мало белка в приёме — добавь яйцо или творог',
        type: 'tip',
        priority: 73,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000,
        onShow: () => markMealAdviceShown()
      });
    }
    
    // evening_carbs_high — много углеводов вечером (>50г после 20:00)
    if (hour >= 20 && lastMealTotals && lastMealTotals.carbs > 50 && canShowMealAdvice()) {
      advices.push({
        id: 'evening_carbs_high',
        icon: '🌙',
        text: `${Math.round(lastMealTotals.carbs)}г углеводов на ночь — утром может быть голодно`,
        type: 'tip',
        priority: 74,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000,
        onShow: () => markMealAdviceShown()
      });
    }
    
    // fiber_per_meal_good — хорошая клетчатка в приёме (>8г)
    if (lastMealTotals && lastMealTotals.fiber > 8 && canShowMealAdvice()) {
      advices.push({
        id: 'fiber_per_meal_good',
        icon: '🥗',
        text: 'Отлично с клетчаткой! Надолго насытит',
        type: 'achievement',
        priority: 75,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 4000,
        onShow: () => markMealAdviceShown()
      });
    }
    
    // variety_meal_good — разнообразный приём (>=4 продукта)
    if (lastMealWithItems && lastMealWithItems.items?.length >= 4 && canShowMealAdvice()) {
      advices.push({
        id: 'variety_meal_good',
        icon: '🌈',
        text: 'Разнообразный приём — так держать!',
        type: 'achievement',
        priority: 76,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 4000,
        onShow: () => markMealAdviceShown()
      });
    }
    
    // late_first_meal — поздний первый приём (после 12:00)
    if (firstMealWithItems && hour >= 13) {
      const [fmHour] = (firstMealWithItems.time || '12:00').split(':').map(Number);
      if (fmHour >= 12) {
        advices.push({
          id: 'late_first_meal',
          icon: '⏰',
          text: 'Первый приём поздновато — завтра попробуй раньше',
          type: 'tip',
          priority: 77,
          category: 'timing',
          triggers: ['tab_open'],
          ttl: 5000
        });
      }
    }
    
    // ═════════════════════════════════════════════════════════
    // 📊 PHASE 2: DAY-QUALITY СОВЕТЫ (priority: 81-90)
    // ═════════════════════════════════════════════════════════
    
    // trans_free_day — день без транс-жиров
    if ((dayTot?.trans || 0) === 0 && mealCount >= 2) {
      advices.push({
        id: 'trans_free_day',
        icon: '🎉',
        text: 'День без транс-жиров!',
        type: 'achievement',
        priority: 81,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // sugar_low_day — почти без сахара (<25г простых при >=2 приёмах)
    if ((dayTot?.simple || 0) < 25 && (dayTot?.simple || 0) > 0 && mealCount >= 2) {
      advices.push({
        id: 'sugar_low_day',
        icon: '🍬',
        text: 'Почти без сахара — отлично! 🚫',
        type: 'achievement',
        priority: 82,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // super_hydration — гидратация на максимуме (>=2500мл)
    const waterMlP2 = day?.waterMl || 0;
    if (waterMlP2 >= 2500) {
      advices.push({
        id: 'super_hydration',
        icon: '💧',
        text: `${waterMlP2}мл воды — гидратация на максимуме! 💧💧💧`,
        type: 'achievement',
        priority: 83,
        category: 'hydration',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // variety_day_good — 10+ уникальных продуктов
    const uniqueProductCount = countUniqueProducts(day);
    if (uniqueProductCount >= 10) {
      advices.push({
        id: 'variety_day_good',
        icon: '🌈',
        text: `${uniqueProductCount} разных продуктов — отличное разнообразие!`,
        type: 'achievement',
        priority: 84,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // deficit_on_track — дефицит идёт по плану (85-95% при deficitPct > 0)
    const deficitPct = day?.deficitPct || 0;
    if (kcalPct >= 0.85 && kcalPct <= 0.95 && deficitPct > 0) {
      advices.push({
        id: 'deficit_on_track',
        icon: '📊',
        text: 'Дефицит идёт по плану!',
        type: 'achievement',
        priority: 85,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // weekend_relax — выходные расслабление (Сб/Вс при 110-130%)
    const dayOfWeek = new Date().getDay();
    if ((dayOfWeek === 0 || dayOfWeek === 6) && kcalPct >= 1.1 && kcalPct <= 1.3) {
      advices.push({
        id: 'weekend_relax',
        icon: '🛋️',
        text: 'Выходной расслабляешься — это нормально',
        type: 'tip',
        priority: 86,
        category: 'lifestyle',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // ═════════════════════════════════════════════════════════
    // ⏱️ PHASE 3: TIMING & PATTERNS (priority: 91-100)
    // ═════════════════════════════════════════════════════════
    
    // Получаем данные для анализа паттернов
    const mealsWithItemsP3 = (day?.meals || []).filter(m => m.items?.length > 0);
    const mealTimes = mealsWithItemsP3.map(m => {
      const [h, min] = (m.time || '12:00').split(':').map(Number);
      return h * 60 + min;
    }).sort((a, b) => a - b);
    
    // fasting_window_good — 14+ часов без еды (ужин→завтрак)
    if (firstMealWithItems && hour >= 10) {
      const yesterdayDays = getRecentDays(1);
      const yesterdayDay = yesterdayDays[0];
      const yesterdayLastMeal = getLastMealWithItems(yesterdayDay);
      
      if (yesterdayLastMeal) {
        const [lastH] = (yesterdayLastMeal.time || '20:00').split(':').map(Number);
        const [firstH] = (firstMealWithItems.time || '08:00').split(':').map(Number);
        const fastingWindow = (24 - lastH) + firstH;
        
        if (fastingWindow >= 14 && !sessionStorage.getItem('heys_fasting_good')) {
          advices.push({
            id: 'fasting_window_good',
            icon: '🕐',
            text: `${fastingWindow}+ часов без еды — отличное окно!`,
            type: 'achievement',
            priority: 91,
            category: 'timing',
            triggers: ['tab_open'],
            ttl: 5000,
            onShow: () => { try { sessionStorage.setItem('heys_fasting_good', '1'); } catch(e) {} }
          });
        }
      }
    }
    
    // long_fast_warning — большой перерыв между приёмами (>7ч днём)
    if (mealTimes.length >= 1 && hour >= 10 && hour <= 18) {
      const lastMealMinutes = mealTimes[mealTimes.length - 1];
      const nowMinutes = hour * 60 + new Date().getMinutes();
      const gapHours = (nowMinutes - lastMealMinutes) / 60;
      
      if (gapHours > 7) {
        advices.push({
          id: 'long_fast_warning',
          icon: '⏰',
          text: 'Давно не ел — не переешь потом!',
          type: 'tip',
          priority: 92,
          category: 'timing',
          triggers: ['tab_open'],
          ttl: 5000
        });
      }
    }
    
    // meal_spacing_perfect — идеальные интервалы (3-5ч между приёмами, >=3 приёма)
    if (mealTimes.length >= 3) {
      const gaps = [];
      for (let i = 1; i < mealTimes.length; i++) {
        gaps.push((mealTimes[i] - mealTimes[i-1]) / 60);
      }
      const allGapsGood = gaps.every(g => g >= 3 && g <= 5);
      
      if (allGapsGood && !sessionStorage.getItem('heys_spacing_perfect')) {
        advices.push({
          id: 'meal_spacing_perfect',
          icon: '⏱️',
          text: 'Идеальные интервалы между приёмами!',
          type: 'achievement',
          priority: 93,
          category: 'timing',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_spacing_perfect', '1'); } catch(e) {} }
        });
      }
    }
    
    // training_recovery_window — окно восстановления (30-60 мин после тренировки)
    const trainingsP3 = day?.trainings || [];
    const todayTrainingP3 = trainingsP3.find(t => t.z && t.z.some(m => m > 0));
    if (todayTrainingP3 && todayTrainingP3.time) {
      const [trainH, trainM] = todayTrainingP3.time.split(':').map(Number);
      const trainMinutes = trainH * 60 + trainM;
      const nowMinutes = hour * 60 + new Date().getMinutes();
      const minutesSince = nowMinutes - trainMinutes;
      
      if (minutesSince >= 30 && minutesSince <= 60 && proteinPct < 0.8) {
        advices.push({
          id: 'training_recovery_window',
          icon: '🏋️',
          text: 'Окно восстановления — белок сейчас усвоится лучше!',
          type: 'tip',
          priority: 94,
          category: 'training',
          triggers: ['tab_open'],
          ttl: 5000
        });
      }
    }
    
    // sleep_debt_accumulating — накопленный недосып (3 дня < 6 часов)
    const recentDaysForSleep = getRecentDays(3);
    const sleepHoursRecent = recentDaysForSleep.map(d => calculateSleepHours(d)).filter(h => h > 0);
    if (sleepHoursRecent.length >= 3) {
      const allUnder6 = sleepHoursRecent.every(h => h < 6);
      if (allUnder6 && !sessionStorage.getItem('heys_sleep_debt')) {
        advices.push({
          id: 'sleep_debt_accumulating',
          icon: '😴',
          text: 'Накопился недосып — сегодня ляг пораньше!',
          type: 'warning',
          priority: 95,
          category: 'lifestyle',
          triggers: ['tab_open'],
          ttl: 6000,
          onShow: () => { try { sessionStorage.setItem('heys_sleep_debt', '1'); } catch(e) {} }
        });
      }
    }
    
    // stress_eating_detected — стресс + переедание
    const avgStressForPattern = calculateAverageStress(day);
    if (avgStressForPattern >= 4 && kcalPct > 1.15) {
      advices.push({
        id: 'stress_eating_detected',
        icon: '🚶',
        text: 'Стресс → перекус? Попробуй прогулку вместо еды',
        type: 'tip',
        priority: 96,
        category: 'emotional',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // ═════════════════════════════════════════════════════════
    // 🏆 PHASE 4: TRENDS & MILESTONES (priority: 1-10)
    // ═════════════════════════════════════════════════════════
    
    // weight_trend_down/up — тренд веса за 7 дней
    const recentDaysForWeight = getRecentDays(7);
    const weightsForTrend = recentDaysForWeight.map(d => d.weightMorning).filter(w => w > 0);
    
    if (weightsForTrend.length >= 3) {
      // Упрощённый тренд: средний первых 3 vs средний последних 3
      const firstAvg = weightsForTrend.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const lastAvg = weightsForTrend.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const trendPerWeek = ((lastAvg - firstAvg) / weightsForTrend.length) * 7;
      
      if (trendPerWeek < -0.3 && !sessionStorage.getItem('heys_weight_trend_down')) {
        advices.push({
          id: 'weight_trend_down',
          icon: '📉',
          text: 'Вес уходит! Так держать',
          type: 'achievement',
          priority: 6,
          category: 'weight',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_weight_trend_down', '1'); } catch(e) {} }
        });
      }
      
      if (trendPerWeek > 0.5 && !sessionStorage.getItem('heys_weight_trend_up')) {
        advices.push({
          id: 'weight_trend_up',
          icon: '📈',
          text: 'Вес растёт быстро — проверь калории',
          type: 'warning',
          priority: 7,
          category: 'weight',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_weight_trend_up', '1'); } catch(e) {} }
        });
      }
    }
    
    // milestone_7_days — неделя с HEYS
    const totalDays = getTotalDaysTracked();
    if (totalDays === 7 && !isMilestoneShown('7_days')) {
      advices.push({
        id: 'milestone_7_days',
        icon: '📅',
        text: 'Неделя с HEYS! Привычка формируется',
        type: 'achievement',
        priority: 2,
        category: 'achievement',
        triggers: ['tab_open'],
        ttl: 8000,
        showConfetti: true,
        onShow: () => markMilestoneShown('7_days')
      });
    }
    
    // milestone_30_days — месяц с HEYS
    if (totalDays === 30 && !isMilestoneShown('30_days')) {
      const firstName = prof?.firstName || '';
      advices.push({
        id: 'milestone_30_days',
        icon: '🎉',
        text: firstName ? `Месяц с HEYS, ${firstName}! Ты молодец` : 'Месяц с HEYS! Ты молодец',
        type: 'achievement',
        priority: 1,
        category: 'achievement',
        triggers: ['tab_open'],
        ttl: 10000,
        showConfetti: true,
        onShow: () => markMilestoneShown('30_days')
      });
    }
    
    // milestone_100_days — 100 дней с HEYS
    if (totalDays === 100 && !isMilestoneShown('100_days')) {
      advices.push({
        id: 'milestone_100_days',
        icon: '🏆',
        text: '100 дней! Ты легенда',
        type: 'achievement',
        priority: 1,
        category: 'achievement',
        triggers: ['tab_open'],
        ttl: 12000,
        showConfetti: true,
        onShow: () => markMilestoneShown('100_days')
      });
    }
    
    // new_record_streak — новый рекорд streak
    if (currentStreak > 0) {
      const isNewRecord = updatePersonalBestStreak(currentStreak);
      if (isNewRecord && currentStreak >= 3 && !sessionStorage.getItem('heys_new_record')) {
        advices.push({
          id: 'new_record_streak',
          icon: '🔥',
          text: `Рекордный streak — ${currentStreak} дней! 🔥🔥🔥`,
          type: 'achievement',
          priority: 2,
          category: 'achievement',
          triggers: ['tab_open'],
          ttl: 8000,
          showConfetti: true,
          onShow: () => { try { sessionStorage.setItem('heys_new_record', '1'); } catch(e) {} }
        });
      }
    }
    
    // first_training_ever — первая тренировка в истории
    if (hasTraining && !isMilestoneShown('first_training')) {
      // Проверяем что это действительно первая тренировка
      const historyDays = getRecentDays(30);
      const hasHistoryTraining = historyDays.some(d => 
        d.trainings?.some(t => t.z && t.z.some(m => m > 0))
      );
      
      if (!hasHistoryTraining) {
        advices.push({
          id: 'first_training_ever',
          icon: '🏃',
          text: 'Первая тренировка в HEYS! Начало положено',
          type: 'achievement',
          priority: 3,
          category: 'achievement',
          triggers: ['tab_open'],
          ttl: 8000,
          showConfetti: true,
          onShow: () => markMilestoneShown('first_training')
        });
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // 🥜 TIMING TIPS (priority: 55-59)
    // ─────────────────────────────────────────────────────────
    
    // После сладкого нужен белок
    const lastMeal = (day?.meals || []).slice(-1)[0];
    if (lastMeal && lastMeal.items?.length > 0) {
      let lastMealSimple = 0, lastMealCarbs = 0, lastMealKcal = 0;
      for (const item of lastMeal.items) {
        const product = pIndex?.byId?.get(item.product_id);
        if (!product) continue;
        const grams = item.grams || 100;
        lastMealSimple += (product.simple100 || 0) * grams / 100;
        lastMealCarbs += ((product.simple100 || 0) + (product.complex100 || 0)) * grams / 100;
        lastMealKcal += (product.kcal100 || 0) * grams / 100;
      }
      const lastMealSimplePct = lastMealCarbs > 0 ? (lastMealSimple / lastMealCarbs) : 0;
      
      if (lastMealSimplePct > 0.6 && lastMealKcal > 100) {
        advices.push({
          id: 'after_sweet_protein',
          icon: '🥜',
          text: 'После сладкого добавь белок — орехи или творог',
          type: 'tip',
          priority: 55,
          category: 'nutrition',
          triggers: ['product_added'],
          ttl: 5000
        });
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // 🧠 CORRELATION INSIGHTS (priority: 20-30)
    // ─────────────────────────────────────────────────────────
    
    // Задача 10: Связь сна и переедания
    const sleepHoursCorr = calculateSleepHours(day);
    const sleepNorm = prof?.sleepHours || 8;
    const sleepDeficit = sleepNorm - sleepHoursCorr;
    
    // Недосып + переедание = объяснить связь
    if (sleepDeficit > 2 && kcalPct > 1.15) {
      advices.push({
        id: 'sleep_hunger_correlation',
        icon: '🧠',
        text: `Недосып ${sleepDeficit.toFixed(1)}ч повышает аппетит — это нормально`,
        type: 'insight',
        priority: 20,
        category: 'correlation',
        triggers: ['product_added', 'tab_open'],
        ttl: 6000
      });
    }
    
    // Недосып утром — предупредить о повышенном аппетите
    if (sleepDeficit > 1.5 && hour < 12 && kcalPct < 0.3) {
      advices.push({
        id: 'sleep_hunger_warning',
        icon: '⚡',
        text: 'После недосыпа аппетит выше — планируй сытный обед',
        type: 'tip',
        priority: 25,
        category: 'correlation',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 11: Стресс → простые углеводы
    const avgStress = calculateAverageStress(day);
    const simplePctCorr = (dayTot?.simple || 0) / ((normAbs?.simple || 50) || 1);
    
    // Высокий стресс + много сладкого = понять паттерн
    if (avgStress >= 4 && simplePctCorr > 1.2) {
      advices.push({
        id: 'stress_sweet_pattern',
        icon: '💡',
        text: 'Стресс → сладкое — попробуй орехи или тёмный шоколад',
        type: 'insight',
        priority: 22,
        category: 'correlation',
        triggers: ['product_added'],
        ttl: 6000
      });
    }
    
    // Низкий стресс + хороший баланс = похвалить
    if (avgStress > 0 && avgStress <= 2 && kcalPct >= 0.9 && kcalPct <= 1.1) {
      advices.push({
        id: 'low_stress_balance',
        icon: '☮️',
        text: 'Спокойный день = легче держать баланс. Замечаешь?',
        type: 'insight',
        priority: 40,
        category: 'correlation',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 36: Динамика веса
    const todayWeight = day?.weightMorning || 0;
    
    if (todayWeight > 0 && !sessionStorage.getItem('heys_weight_tip')) {
      // Загружаем вчерашние данные
      const yesterdayDays = getRecentDays(1);
      const yesterdayDay = yesterdayDays[0];
      const yesterdayWeight = yesterdayDay?.weightMorning || 0;
      
      // Резкий скачок веса (±1кг)
      if (yesterdayWeight > 0) {
        const diff = todayWeight - yesterdayWeight;
        
        if (Math.abs(diff) > 1.0) {
          const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
          advices.push({
            id: 'weight_spike_up',
            icon: '💧',
            text: `Вес ${diffStr}кг — скорее всего вода, не переживай`,
            type: 'insight',
            priority: 23,
            category: 'correlation',
            triggers: ['tab_open'],
            ttl: 5000,
            onShow: () => { try { sessionStorage.setItem('heys_weight_tip', '1'); } catch(e) {} }
          });
        }
      }
      
      // Стабильный вес за 7 дней
      const recentDays = getRecentDays(7);
      const weights = recentDays
        .map(d => d.weightMorning)
        .filter(w => w > 0);
      
      if (weights.length >= 5) {
        // Вычисляем стандартное отклонение
        const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
        const variance = weights.reduce((sum, w) => sum + Math.pow(w - avg, 2), 0) / weights.length;
        const stdDev = Math.sqrt(variance);
        
        if (stdDev < 0.5 && !sessionStorage.getItem('heys_weight_stable_tip')) {
          advices.push({
            id: 'weight_stable',
            icon: '📊',
            text: 'Вес стабилен уже неделю — отличная работа!',
            type: 'achievement',
            priority: 9,
            category: 'achievement',
            triggers: ['tab_open'],
            ttl: 5000,
            onShow: () => { try { sessionStorage.setItem('heys_weight_stable_tip', '1'); } catch(e) {} }
          });
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // 🏋️ TRAINING TIPS (priority: 30-35)
    // ─────────────────────────────────────────────────────────
    
    // Задача 14: Post-workout советы
    const trainings = day?.trainings || [];
    const todayTraining = trainings.find(t => t.z && t.z.some(m => m > 0));
    
    if (todayTraining) {
      const totalMinutes = todayTraining.z.reduce((a, b) => a + b, 0);
      const highIntensityMinutes = (todayTraining.z[2] || 0) + (todayTraining.z[3] || 0); // Зоны 3-4
      const isHardWorkout = highIntensityMinutes > 20;
      const proteinPct = (dayTot?.prot || 0) / ((normAbs?.prot || 100) || 1);
      
      // Тяжёлая тренировка — нужно больше белка
      if (isHardWorkout && proteinPct < 1.0) {
        advices.push({
          id: 'hard_workout_recovery',
          icon: '🔥',
          text: `${highIntensityMinutes} мин в высоких зонах — добавь белка для восстановления`,
          type: 'tip',
          priority: 30,
          category: 'training',
          triggers: ['product_added', 'tab_open'],
          ttl: 5000
        });
      }
      
      // Кардио в зоне жиросжигания — не переедать углеводами
      const fatBurnMinutes = todayTraining.z[1] || 0; // Зона 2
      const carbsPct = (dayTot?.carbs || 0) / ((normAbs?.carbs || 200) || 1);
      if (fatBurnMinutes > 30 && carbsPct > 1.2) {
        advices.push({
          id: 'cardio_carbs_balance',
          icon: '🏃',
          text: 'После кардио лучше белок и овощи, чем углеводы',
          type: 'tip',
          priority: 35,
          category: 'training',
          triggers: ['product_added'],
          ttl: 5000
        });
      }
      
      // Отличная тренировка!
      if (totalMinutes >= 45) {
        advices.push({
          id: 'great_workout',
          icon: '💪',
          text: `${totalMinutes} мин тренировки — супер!`,
          type: 'achievement',
          priority: 7,
          category: 'training',
          triggers: ['tab_open'],
          ttl: 4000
        });
      }
      
      // Задача 35: Советы по типу тренировки
      // training.type = 'cardio' | 'strength' | 'hobby'
      
      // После силовой — белок важнее
      if (todayTraining.type === 'strength' && proteinPct < 1.0) {
        advices.push({
          id: 'training_type_strength',
          icon: '🏋️',
          text: 'После силовой важен белок — 20-30г в течение 2 часов',
          type: 'tip',
          priority: 31,
          category: 'training',
          triggers: ['tab_open', 'product_added'],
          ttl: 5000
        });
      }
      
      // После хобби (йога и т.п.) — лёгкий приём
      if (todayTraining.type === 'hobby' && !sessionStorage.getItem('heys_hobby_tip')) {
        advices.push({
          id: 'training_type_hobby',
          icon: '🧘',
          text: 'После активного хобби идеален лёгкий приём — овощи, фрукты',
          type: 'tip',
          priority: 49,
          category: 'training',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_hobby_tip', '1'); } catch(e) {} }
        });
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // 💧 HYDRATION TIPS (priority: 42-46)
    // ─────────────────────────────────────────────────────────
    
    // Задача 13: Умные напоминания о воде
    const waterMl = day?.waterMl || 0;
    const waterNorm = waterGoal || 2000; // waterGoal передан из ctx
    const waterPct = waterMl / waterNorm;
    
    // Мало воды к вечеру
    if (hour >= 18 && waterPct < 0.5) {
      const needed = Math.round(waterNorm * 0.7 - waterMl);
      if (needed > 0) {
        advices.push({
          id: 'water_evening_low',
          icon: '💧',
          text: `Выпито ${waterMl}мл — добавь ещё ${needed}мл`,
          type: 'tip',
          priority: 42,
          category: 'hydration',
          triggers: ['tab_open'],
          ttl: 5000
        });
      }
    }
    
    // Давно не пил — напомнить
    const lastWater = day?.lastWaterTime ? new Date(day.lastWaterTime) : null;
    const hoursSinceWater = lastWater ? (Date.now() - lastWater.getTime()) / (1000 * 60 * 60) : 99;
    
    if (hoursSinceWater > 2 && hour >= 10 && hour <= 21 && waterPct < 1.0) {
      advices.push({
        id: 'water_reminder',
        icon: '🚰',
        text: 'Уже 2+ часа без воды — выпей стакан',
        type: 'tip',
        priority: 44,
        category: 'hydration',
        triggers: ['tab_open', 'product_added'],
        ttl: 4000
      });
    }
    
    // Норма выполнена!
    if (waterPct >= 1.0 && !sessionStorage.getItem('heys_water_done')) {
      advices.push({
        id: 'water_goal_reached',
        icon: '💦',
        text: `${waterMl}мл — дневная норма воды выполнена!`,
        type: 'achievement',
        priority: 6,
        category: 'hydration',
        triggers: ['tab_open'],
        ttl: 5000,
        onShow: () => { try { sessionStorage.setItem('heys_water_done', '1'); } catch(e) {} }
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 🎯 NUTRITION QUALITY TIPS (priority: 32-40)
    // ─────────────────────────────────────────────────────────
    
    // Задача 22: Гликемический индекс
    const avgGI = dayTot?.gi || 0;
    
    if (avgGI > 70 && mealCount >= 2) {
      advices.push({
        id: 'high_gi_warning',
        icon: '📈',
        text: `Средний ГИ ${Math.round(avgGI)} — добавь белок и клетчатку`,
        type: 'tip',
        priority: 33,
        category: 'nutrition',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    if (avgGI > 0 && avgGI <= 55 && mealCount >= 2) {
      advices.push({
        id: 'low_gi_great',
        icon: '💚',
        text: `ГИ ${Math.round(avgGI)} — стабильная энергия весь день`,
        type: 'achievement',
        priority: 36,
        category: 'nutrition',
        triggers: ['tab_open'],
        ttl: 4000
      });
    }
    
    // Задача 23: Соотношение простых/сложных углеводов
    const simpleCarbs = dayTot?.simple || 0;
    const complexCarbs = dayTot?.complex || 0;
    const totalCarbs = simpleCarbs + complexCarbs;
    
    if (totalCarbs > 50) {
      const simpleRatio = simpleCarbs / totalCarbs;
      
      if (simpleRatio > 0.5) {
        advices.push({
          id: 'simple_complex_ratio',
          icon: '⚖️',
          text: `${Math.round(simpleRatio * 100)}% простых углеводов — добавь каши, хлеб`,
          type: 'tip',
          priority: 34,
          category: 'nutrition',
          triggers: ['product_added'],
          ttl: 5000
        });
      }
      
      if (simpleRatio <= 0.3 && mealCount >= 2) {
        advices.push({
          id: 'carbs_balance_perfect',
          icon: '🌾',
          text: 'Отличный баланс углеводов!',
          type: 'achievement',
          priority: 37,
          category: 'nutrition',
          triggers: ['tab_open'],
          ttl: 4000
        });
      }
    }
    
    // Задача 24: Качество жиров
    const goodFat = dayTot?.good || 0;
    const badFat = dayTot?.bad || 0;
    const transFat = dayTot?.trans || 0;
    const totalFat = goodFat + badFat + transFat;
    
    if (totalFat > 20) {
      const goodRatio = goodFat / totalFat;
      
      if (goodRatio < 0.4) {
        advices.push({
          id: 'fat_quality_low',
          icon: '🐟',
          text: 'Добавь полезных жиров — рыба, орехи, авокадо',
          type: 'tip',
          priority: 32,
          category: 'nutrition',
          triggers: ['product_added', 'tab_open'],
          ttl: 5000
        });
      }
      
      if (goodRatio >= 0.6) {
        advices.push({
          id: 'fat_quality_great',
          icon: '💚',
          text: `${Math.round(goodRatio * 100)}% полезных жиров — супер!`,
          type: 'achievement',
          priority: 38,
          category: 'nutrition',
          triggers: ['tab_open'],
          ttl: 4000
        });
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // ⏰ CHRONO-NUTRITION TIPS (priority: 38-43)
    // ─────────────────────────────────────────────────────────
    
    // Задача 15: Инсулиновые волны
    const insulinWave = prof?.insulinWaveHours || 4;
    const mealsWithItems = (day?.meals || []).filter(m => m.items?.length > 0);
    
    if (mealsWithItems.length >= 2) {
      const times = mealsWithItems.map(m => {
        const [h, min] = (m.time || '12:00').split(':').map(Number);
        return h * 60 + min;
      }).sort((a, b) => a - b);
      
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        
        if (gap < insulinWave * 60 * 0.5) { // < 50% от нормы
          const gapHours = (gap / 60).toFixed(1).replace('.0', '');
          advices.push({
            id: 'insulin_too_fast',
            icon: '⏱️',
            text: `Между приёмами ${gapHours}ч — дай инсулину отдохнуть`,
            type: 'tip',
            priority: 38,
            category: 'timing',
            triggers: ['product_added'],
            ttl: 5000
          });
          break;
        }
      }
      
      const avgGap = (times[times.length - 1] - times[0]) / (times.length - 1);
      if (avgGap >= insulinWave * 60 * 0.9 && mealsWithItems.length >= 3) {
        advices.push({
          id: 'insulin_perfect',
          icon: '⏰',
          text: 'Отличные интервалы между приёмами!',
          type: 'achievement',
          priority: 39,
          category: 'timing',
          triggers: ['tab_open'],
          ttl: 4000
        });
      }
      
      // Задача 40: Обратный отсчёт до конца инсулиновой волны
      const lastMealTimeMinutes = times[times.length - 1];
      const nowMinutes = hour * 60 + new Date().getMinutes();
      const insulinEndMinutes = lastMealTimeMinutes + insulinWave * 60;
      const minutesUntilEnd = insulinEndMinutes - nowMinutes;
      
      if (minutesUntilEnd > 0 && minutesUntilEnd < 60 && !sessionStorage.getItem('heys_insulin_countdown')) {
        advices.push({
          id: 'insulin_countdown',
          icon: '⏱️',
          text: `Через ${minutesUntilEnd} мин инсулиновая волна закончится — можно перекусить`,
          type: 'info',
          priority: 40,
          category: 'timing',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_insulin_countdown', '1'); } catch(e) {} }
        });
      }
    }
    
    // Задача 41: Белок перед сном
    const sleepNormHours = prof?.sleepHours || 8;
    const expectedBedtime = 24 - sleepNormHours + 7; // Примерно когда ложится спать (если встаёт в 7)
    const hoursUntilBed = expectedBedtime - hour;
    
    if (hour >= 20 && hour <= 22 && proteinPct < 0.8 && hoursUntilBed > 0 && hoursUntilBed <= 4) {
      advices.push({
        id: 'bedtime_protein',
        icon: '🥛',
        text: `До сна ~${Math.round(hoursUntilBed)}ч — последний шанс добрать белок`,
        type: 'tip',
        priority: 35,
        category: 'timing',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 16: Поздний ужин
    const lastMealTime = (() => {
      const mealsList = (day?.meals || []).filter(m => m.items?.length > 0);
      if (mealsList.length === 0) return null;
      const timesList = mealsList.map(m => m.time || '12:00').sort();
      return timesList[timesList.length - 1];
    })();
    
    if (lastMealTime) {
      const [lastH] = lastMealTime.split(':').map(Number);
      
      if (lastH >= 22) {
        advices.push({
          id: 'late_dinner_warning',
          icon: '🌙',
          text: 'Поздний ужин — сон может быть хуже',
          type: 'tip',
          priority: 41,
          category: 'timing',
          triggers: ['product_added'],
          ttl: 5000
        });
      }
      
      // Задача 38: Тяжёлый ужин после 21:00
      // Вычисляем калории последнего приёма
      const lastMealByTime = (day?.meals || []).find(m => m.time === lastMealTime);
      if (lastH >= 21 && lastH < 22 && lastMealByTime && !sessionStorage.getItem('heys_late_heavy_shown')) {
        let lateMealKcal = 0;
        for (const item of (lastMealByTime.items || [])) {
          const product = pIndex?.byId?.get(item.product_id);
          if (product) lateMealKcal += (product.kcal100 || 0) * (item.grams || 100) / 100;
        }
        
        if (lateMealKcal > 500) {
          advices.push({
            id: 'late_heavy_meal',
            icon: '🌙',
            text: `Плотный ужин (${Math.round(lateMealKcal)} ккал) после 21:00 — сон может быть хуже`,
            type: 'tip',
            priority: 40,
            category: 'timing',
            triggers: ['product_added'],
            ttl: 5000,
            onShow: () => { try { sessionStorage.setItem('heys_late_heavy_shown', '1'); } catch(e) {} }
          });
        }
      }
      
      if (lastH >= 18 && lastH <= 20 && hour >= 21) {
        advices.push({
          id: 'good_dinner_time',
          icon: '✨',
          text: 'Ужин в правильное время — молодец!',
          type: 'achievement',
          priority: 43,
          category: 'timing',
          triggers: ['tab_open'],
          ttl: 4000
        });
      }
    }
    
    // Задача 39: Кофе вечером
    if (hasCoffeeAfterHour(day?.meals, 16, pIndex) && !sessionStorage.getItem('heys_caffeine_tip')) {
      advices.push({
        id: 'caffeine_evening',
        icon: '☕',
        text: 'Кофе после 16:00 может ухудшить сон',
        type: 'tip',
        priority: 42,
        category: 'nutrition',
        triggers: ['product_added'],
        ttl: 5000,
        onShow: () => { try { sessionStorage.setItem('heys_caffeine_tip', '1'); } catch(e) {} }
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 😴 SLEEP QUALITY TIPS (priority: 26-28)
    // ─────────────────────────────────────────────────────────
    
    // Задача 25: Качество сна + питание
    const sleepQuality = day?.sleepQuality || 0;
    const sleepHoursQ = calculateSleepHours(day);
    
    if (sleepQuality > 0 && sleepQuality <= 2 && hour < 12) {
      advices.push({
        id: 'bad_sleep_advice',
        icon: '😴',
        text: 'После плохого сна — меньше кофе, больше белка',
        type: 'tip',
        priority: 26,
        category: 'sleep',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    if (sleepQuality >= 4 && sleepHoursQ >= 7) {
      advices.push({
        id: 'great_sleep',
        icon: '😊',
        text: 'Хорошо выспался — день будет продуктивным!',
        type: 'achievement',
        priority: 46,
        category: 'sleep',
        triggers: ['tab_open'],
        ttl: 4000
      });
    }
    
    // ─────────────────────────────────────────────────────────
    // 🎭 EMOTIONAL INTELLIGENCE (priority: 24-30)
    // ─────────────────────────────────────────────────────────
    
    // Задача 19: Паттерны настроения и еды
    const mealsWithMood = (day?.meals || []).filter(m => m.mood > 0 && m.items?.length > 0);
    
    if (mealsWithMood.length >= 2) {
      const moodDropMeal = mealsWithMood.find((m, i) => {
        if (i === 0) return false;
        return m.mood < mealsWithMood[i - 1].mood - 1; // Падение на 2+
      });
      
      if (moodDropMeal) {
        const prevMealIdx = mealsWithMood.indexOf(moodDropMeal) - 1;
        const prevMeal = mealsWithMood[prevMealIdx];
        
        // Много сахара в предыдущем приёме?
        let prevSimple = 0;
        for (const item of prevMeal.items || []) {
          const product = pIndex?.byId?.get(item.product_id);
          if (product) prevSimple += (product.simple100 || 0) * (item.grams || 100) / 100;
        }
        
        if (prevSimple > 30) {
          advices.push({
            id: 'sugar_mood_crash',
            icon: '🎢',
            text: 'Заметил? После сладкого настроение может падать',
            type: 'insight',
            priority: 24,
            category: 'emotional',
            triggers: ['tab_open'],
            ttl: 6000
          });
        }
      }
    }
    
    // Задача 20: Wellbeing и питание
    const avgWellbeing = calculateAverageWellbeing(day);
    
    // Плохое самочувствие + мало еды — поесть!
    if (avgWellbeing > 0 && avgWellbeing < 3 && kcalPct < 0.4 && hour >= 12) {
      advices.push({
        id: 'wellbeing_low_food',
        icon: '🍽️',
        text: 'Возможно самочувствие улучшится после еды',
        type: 'tip',
        priority: 29,
        category: 'emotional',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Отличное самочувствие — закрепить
    if (avgWellbeing >= 4 && kcalPct >= 0.8 && kcalPct <= 1.1) {
      advices.push({
        id: 'wellbeing_nutrition_link',
        icon: '✨',
        text: 'Хорошее самочувствие + правильное питание — запомни этот день!',
        type: 'insight',
        priority: 45,
        category: 'emotional',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 34: dayScore — оценка дня
    const dayScore = day?.dayScore ? +day.dayScore : 0;
    
    // Плохой день — поддержка
    if (dayScore > 0 && dayScore < 5 && hour >= 20) {
      advices.push({
        id: 'day_score_low',
        icon: '💙',
        text: 'Не лучший день? Завтра будет лучше!',
        type: 'tip',
        priority: 27,
        category: 'emotional',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Отличный день — похвала
    if (dayScore >= 8 && hour >= 20) {
      advices.push({
        id: 'day_score_high',
        icon: '⭐',
        text: 'Отличная оценка дня! Запомни это ощущение',
        type: 'achievement',
        priority: 8,
        category: 'achievement',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Задача 47: Настроение улучшилось после еды
    const allMeals = day?.meals || [];
    const mealsWithMoodData = allMeals.filter(m => m.mood > 0 && m.items?.length > 0);
    
    if (mealsWithMoodData.length >= 2 && !sessionStorage.getItem('heys_mood_improving')) {
      const prevMealMood = mealsWithMoodData[mealsWithMoodData.length - 2]?.mood || 0;
      const currentMealMood = mealsWithMoodData[mealsWithMoodData.length - 1]?.mood || 0;
      
      if (prevMealMood > 0 && currentMealMood > prevMealMood) {
        advices.push({
          id: 'mood_improving',
          icon: '📈',
          text: 'Настроение улучшилось после еды — интересный паттерн!',
          type: 'insight',
          priority: 45,
          category: 'correlation',
          triggers: ['product_added'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_mood_improving', '1'); } catch(e) {} }
        });
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // 📊 BEHAVIORAL PATTERNS (priority: 7-39)
    // ─────────────────────────────────────────────────────────
    
    // Задача 48: Тренировки 3 дня подряд
    const recentForTraining = getRecentDays(2); // Вчера и позавчера
    const todayHasTraining = (day?.trainings || []).some(t => t.z?.some(m => m > 0));
    
    if (todayHasTraining && recentForTraining.length >= 2 && !sessionStorage.getItem('heys_workout_consistent')) {
      const allThreeHaveTraining = recentForTraining.every(d => 
        (d.trainings || []).some(t => t.z?.some(m => m > 0))
      );
      
      if (allThreeHaveTraining) {
        advices.push({
          id: 'workout_consistent',
          icon: '🔥',
          text: '3 дня тренировок подряд! Ты машина 💪',
          type: 'achievement',
          priority: 7,
          category: 'achievement',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_workout_consistent', '1'); } catch(e) {} }
        });
      }
    }
    
    // Задача 49: Паттерн поздних ужинов (3 дня подряд)
    const lastEvensCheck = localStorage.getItem('heys_evening_snacker_check');
    const weekAgoPattern = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    if (!lastEvensCheck || +lastEvensCheck < weekAgoPattern) {
      const recentForPattern = getRecentDays(3);
      
      if (recentForPattern.length >= 3) {
        const allLateEaters = recentForPattern.every(d => {
          const dayMeals = (d.meals || []).filter(m => m.items?.length > 0);
          if (dayMeals.length === 0) return false;
          const times = dayMeals.map(m => m.time || '12:00').sort();
          const lastTime = times[times.length - 1];
          const [h] = lastTime.split(':').map(Number);
          return h >= 22;
        });
        
        if (allLateEaters) {
          advices.push({
            id: 'evening_snacker',
            icon: '🌙',
            text: 'Заметил тренд — ты часто ужинаешь поздно. Может, перекус раньше?',
            type: 'insight',
            priority: 38,
            category: 'correlation',
            triggers: ['tab_open'],
            ttl: 6000,
            onShow: () => { 
              try { localStorage.setItem('heys_evening_snacker_check', Date.now().toString()); } catch(e) {} 
            }
          });
        }
      }
    }
    
    // Задача 50: Паттерн без завтрака (3 дня подряд)
    const lastSkipCheck = localStorage.getItem('heys_morning_skipper_check');
    
    if (!lastSkipCheck || +lastSkipCheck < weekAgoPattern) {
      const recentForSkip = getRecentDays(3);
      
      if (recentForSkip.length >= 3) {
        const allSkipBreakfast = recentForSkip.every(d => {
          const dayMeals = (d.meals || []).filter(m => m.items?.length > 0);
          if (dayMeals.length === 0) return true; // Нет приёмов = пропустил
          const times = dayMeals.map(m => m.time || '12:00').sort();
          const firstTime = times[0];
          const [h] = firstTime.split(':').map(Number);
          return h >= 11; // Первый приём после 11:00
        });
        
        if (allSkipBreakfast) {
          advices.push({
            id: 'morning_skipper',
            icon: '🤔',
            text: 'Уже 3 дня без раннего завтрака — экспериментируешь с интервальным голоданием?',
            type: 'insight',
            priority: 39,
            category: 'correlation',
            triggers: ['tab_open'],
            ttl: 6000,
            onShow: () => { 
              try { localStorage.setItem('heys_morning_skipper_check', Date.now().toString()); } catch(e) {} 
            }
          });
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // 🌟 PERSONALIZATION TIPS (priority: 54-56)
    // ─────────────────────────────────────────────────────────
    
    // Задача 26: Рекомендации по полу
    const isFemale = prof?.gender === 'Женский';
    
    if (isFemale && mealCount >= 2) {
      // Проверяем наличие продуктов богатых железом
      const ironRichKeywords = ['мясо', 'печень', 'говядина', 'гречка', 'шпинат', 'чечевица'];
      const allItemsP = (day?.meals || []).flatMap(m => m.items || []);
      const hasIronRichFood = allItemsP.some(item => {
        const product = pIndex?.byId?.get(item.product_id);
        const name = (product?.name || item.name || '').toLowerCase();
        return ironRichKeywords.some(kw => name.includes(kw));
      });
      
      if (!hasIronRichFood && !sessionStorage.getItem('heys_iron_tip_today')) {
        advices.push({
          id: 'iron_reminder',
          icon: '🩸',
          text: 'Не забывай о железе — мясо, печень, гречка',
          type: 'tip',
          priority: 55,
          category: 'personalized',
          triggers: ['tab_open'],
          ttl: 5000,
          onShow: () => { try { sessionStorage.setItem('heys_iron_tip_today', '1'); } catch(e) {} }
        });
      }
    }
    
    // Задача 27: Рекомендации по возрасту
    const age = prof?.age || 30;
    const proteinPctAge = (dayTot?.prot || 0) / ((normAbs?.prot || 100) || 1);
    
    if (age >= 40 && proteinPctAge < 0.9) {
      advices.push({
        id: 'age_protein',
        icon: '💪',
        text: 'После 40 важно больше белка — сохраняем мышцы',
        type: 'tip',
        priority: 54,
        category: 'personalized',
        triggers: ['product_added', 'tab_open'],
        ttl: 5000
      });
    }
    
    // young_sleep обрабатывается в начале функции (в silent mode)
    
    // ─────────────────────────────────────────────────────────
    // 🏠 ACTIVITY TIPS (priority: 48-50)
    // ─────────────────────────────────────────────────────────
    
    // Задача 21: Домашняя активность
    const household = day?.householdMin || 0;
    
    if (household >= 60) {
      const extraKcal = Math.round(household * 3); // ~3 ккал/мин
      advices.push({
        id: 'household_bonus',
        icon: '🏠',
        text: `${household} мин активности ≈ +${extraKcal} ккал сожжено`,
        type: 'info',
        priority: 50,
        category: 'activity',
        triggers: ['tab_open'],
        ttl: 5000
      });
    }
    
    // Нет активности весь день
    const stepsDay = day?.steps || 0;
    if (household === 0 && stepsDay < 3000 && !hasTraining && hour >= 18) {
      advices.push({
        id: 'sedentary_day',
        icon: '🚶',
        text: 'Малоподвижный день — прогуляйся 15 минут',
        type: 'tip',
        priority: 48,
        category: 'activity',
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
  
  /**
   * Загружает N дней истории из localStorage
   * @param {number} n - Количество дней назад
   * @returns {Array<{date: string, [key: string]: any}>} Массив дней с данными
   */
  function getRecentDays(n) {
    // Приоритет: HEYS.utils (с namespace) → HEYS.dayUtils → fallback
    const lsGet = (window.HEYS?.utils?.lsGet) || (window.HEYS?.dayUtils?.lsGet) || ((k, d) => {
      try { 
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d; 
      } catch { return d; }
    });
    
    const days = [];
    const today = new Date();
    
    for (let i = 1; i <= n; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayData = lsGet('heys_dayv2_' + iso, null);
      
      if (dayData && dayData.date) {
        days.push({ date: iso, ...dayData });
      }
    }
    
    return days;
  }
  
  /**
   * Проверяет, есть ли кофе-содержащие продукты после указанного часа
   * @param {Array} meals - Массив приёмов пищи (day.meals)
   * @param {number} afterHour - После какого часа искать (например 16)
   * @param {Object} pIndex - Индекс продуктов { byId: Map, byName: Map }
   * @returns {boolean} true если найден кофе после указанного часа
   */
  function hasCoffeeAfterHour(meals, afterHour, pIndex) {
    if (!meals || !Array.isArray(meals)) return false;
    
    const coffeeKeywords = ['кофе', 'coffee', 'капучино', 'латте', 'лате', 'раф', 'американо', 'эспрессо', 'флэт', 'мокко', 'макиато'];
    
    for (const meal of meals) {
      // Парсим время приёма
      if (!meal.time) continue;
      const [h] = meal.time.split(':').map(Number);
      if (h < afterHour) continue;
      
      // Проверяем продукты в приёме
      for (const item of (meal.items || [])) {
        // Получаем название продукта
        let name = item.name || '';
        if (!name && pIndex?.byId && item.product_id) {
          const product = pIndex.byId.get(item.product_id);
          if (product) name = product.name || '';
        }
        
        // Ищем кофе-ключевые слова
        const nameLower = name.toLowerCase();
        if (coffeeKeywords.some(kw => nameLower.includes(kw))) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // ═══════════════════════════════════════════════════════════
  // PHASE 0: MEAL & MILESTONE HELPERS
  // ═══════════════════════════════════════════════════════════
  
  /**
   * Вычисляет суммы нутриентов для одного приёма пищи
   * @param {Object} meal - Приём пищи (meal object)
   * @param {Object} pIndex - Индекс продуктов { byId: Map, byName: Map }
   * @returns {Object|null} { kcal, prot, carbs, simple, complex, fat, good, bad, trans, fiber } или null
   */
  function getMealTotals(meal, pIndex) {
    if (!meal || !meal.items || meal.items.length === 0) return null;
    
    // Пробуем использовать HEYS.models.mealTotals если доступен
    if (window.HEYS?.models?.mealTotals) {
      return window.HEYS.models.mealTotals(meal, pIndex);
    }
    
    // Fallback: вычисляем сами
    const tot = { kcal: 0, prot: 0, carbs: 0, simple: 0, complex: 0, fat: 0, good: 0, bad: 0, trans: 0, fiber: 0 };
    
    for (const item of meal.items) {
      const grams = item.grams || 0;
      if (grams <= 0) continue;
      
      // Получаем продукт из индекса
      let product = null;
      if (pIndex?.byId && item.product_id) {
        product = pIndex.byId.get(item.product_id) || pIndex.byId.get(String(item.product_id));
      }
      if (!product) continue;
      
      const ratio = grams / 100;
      tot.kcal += (product.kcal100 || 0) * ratio;
      tot.prot += (product.protein100 || 0) * ratio;
      tot.simple += (product.simple100 || 0) * ratio;
      tot.complex += (product.complex100 || 0) * ratio;
      tot.carbs += ((product.simple100 || 0) + (product.complex100 || 0)) * ratio;
      tot.good += (product.goodFat100 || 0) * ratio;
      tot.bad += (product.badFat100 || 0) * ratio;
      tot.trans += (product.trans100 || 0) * ratio;
      tot.fat += ((product.goodFat100 || 0) + (product.badFat100 || 0) + (product.trans100 || 0)) * ratio;
      tot.fiber += (product.fiber100 || 0) * ratio;
    }
    
    return tot;
  }
  
  /**
   * Получает последний приём пищи с реальными продуктами
   * @param {Object} day - Данные дня
   * @returns {Object|null} meal объект или null
   */
  function getLastMealWithItems(day) {
    const meals = (day?.meals || []).filter(m => m.items?.length > 0);
    return meals.length > 0 ? meals[meals.length - 1] : null;
  }
  
  /**
   * Получает первый приём пищи с реальными продуктами
   * @param {Object} day - Данные дня
   * @returns {Object|null} meal объект или null
   */
  function getFirstMealWithItems(day) {
    const meals = (day?.meals || []).filter(m => m.items?.length > 0);
    return meals.length > 0 ? meals[0] : null;
  }
  
  /**
   * Проверяет, был ли показан milestone (персистентно)
   * @param {string} id - ID milestone (например '30_days')
   * @returns {boolean}
   */
  function isMilestoneShown(id) {
    try {
      return localStorage.getItem('heys_milestone_' + id) === '1';
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Отмечает milestone как показанный
   * @param {string} id - ID milestone
   */
  function markMilestoneShown(id) {
    try {
      localStorage.setItem('heys_milestone_' + id, '1');
    } catch (e) {
      // Ignore storage errors
    }
  }
  
  /**
   * Подсчитывает количество уникальных продуктов за день
   * @param {Object} day - Данные дня
   * @returns {number}
   */
  function countUniqueProducts(day) {
    const ids = new Set();
    (day?.meals || []).forEach(meal => {
      (meal.items || []).forEach(item => {
        if (item.product_id) ids.add(String(item.product_id));
      });
    });
    return ids.size;
  }
  
  /**
   * Подсчитывает общее количество дней с данными в localStorage
   * Учитывает clientId для multi-client режима
   * @returns {number}
   */
  function getTotalDaysTracked() {
    try {
      const U = HEYS.utils || {};
      const clientId = U.getCurrentClientId ? U.getCurrentClientId() : '';
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('heys_dayv2_')) {
          // Если есть clientId, проверяем что ключ начинается с него
          // Формат: {clientId}_heys_dayv2_{date} или heys_dayv2_{date}
          if (!clientId || key.startsWith(clientId + '_') || !key.includes('_heys_dayv2_')) {
            count++;
          }
        }
      }
      return count;
    } catch (e) {
      return 0;
    }
  }
  
  /**
   * Получает лучший streak из localStorage
   * @returns {number}
   */
  function getPersonalBestStreak() {
    try {
      return parseInt(localStorage.getItem('heys_best_streak') || '0', 10);
    } catch (e) {
      return 0;
    }
  }
  
  /**
   * Обновляет лучший streak если текущий больше
   * @param {number} currentStreak - Текущий streak
   * @returns {boolean} true если это новый рекорд
   */
  function updatePersonalBestStreak(currentStreak) {
    const best = getPersonalBestStreak();
    if (currentStreak > best) {
      try {
        localStorage.setItem('heys_best_streak', String(currentStreak));
      } catch (e) {
        // Ignore storage errors
      }
      return true; // Новый рекорд!
    }
    return false;
  }
  
  /**
   * Throttle для meal-level советов (3 секунды между показами)
   */
  const MEAL_ADVICE_THROTTLE_MS = 3000;
  
  /**
   * Проверяет, можно ли показать meal-level совет
   * @returns {boolean}
   */
  function canShowMealAdvice() {
    try {
      const last = sessionStorage.getItem('heys_last_meal_advice');
      return !last || (Date.now() - parseInt(last, 10)) > MEAL_ADVICE_THROTTLE_MS;
    } catch (e) {
      return true;
    }
  }
  
  /**
   * Отмечает время показа meal-level совета
   */
  function markMealAdviceShown() {
    try {
      sessionStorage.setItem('heys_last_meal_advice', String(Date.now()));
    } catch (e) {
      // Ignore storage errors
    }
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
   * @param {Object} params.prof - Профиль пользователя (sex, age, weight, sleepHours, insulinWaveHours и др.)
   * @param {number} params.waterGoal - Динамическая норма воды (из waterGoalBreakdown)
   * @returns {Object} Объект с советами и методами
   */
  function useAdviceEngine(params) {
    // ⚠️ ВАЖНО: currentStreak передаётся как параметр, НЕ вычисляется!
    const { dayTot, normAbs, optimum, day, pIndex, currentStreak, trigger, uiState, prof, waterGoal } = params;
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
        // lastVisitDaysAgo теперь вычисляется внутри getEmotionalState
        totalDaysTracked: 30 // Приблизительно
      });
      
      return {
        dayTot: dayTot || {},
        normAbs: normAbs || {},
        optimum: optimum || 2000,
        day: day || {},
        pIndex: pIndex || { byId: new Map(), byName: new Map() },
        currentStreak: currentStreak || 0,
        hour,
        mealCount,
        hasTraining,
        kcalPct,
        tone,
        specialDay,
        emotionalState,
        prof: prof || {},           // Профиль пользователя
        waterGoal: waterGoal || 2000 // Норма воды
      };
    }, [dayTot, normAbs, optimum, day, pIndex, currentStreak, prof, waterGoal]);
    
    // Генерируем все советы
    const allAdvices = React.useMemo(() => {
      return generateAdvices(ctx);
    }, [ctx]);
    
    // Фильтруем по эмоциональному состоянию
    const filteredAdvices = React.useMemo(() => {
      return filterByEmotionalState(allAdvices, ctx.emotionalState);
    }, [allAdvices, ctx.emotionalState]);
    
    // Фильтруем по триггеру (для показа в развёрнутом виде — без canShowAdvice)
    // Спецтриггер 'manual' — показывает ВСЕ советы без фильтрации по триггеру
    const allForTrigger = React.useMemo(() => {
      if (!trigger) return [];
      if (isUserBusy(uiState)) return [];
      
      // Manual trigger — показываем все советы
      if (trigger === 'manual') {
        return filteredAdvices.sort((a, b) => a.priority - b.priority);
      }
      
      return filteredAdvices
        .filter(a => a.triggers.includes(trigger))
        .sort((a, b) => a.priority - b.priority);
    }, [filteredAdvices, trigger, uiState]);
    
    // Советы которые можно показать (с проверкой cooldown)
    const relevantAdvices = React.useMemo(() => {
      return allForTrigger.filter(a => canShowAdvice(a.id));
    }, [allForTrigger]);
    
    // Основной совет (первый доступный)
    const primary = relevantAdvices[0] || null;
    
    // Количество для badge — ВСЕ советы для триггера (без canShowAdvice)
    const adviceCount = allForTrigger.length;
    
    return {
      primary,
      relevant: allForTrigger, // Все советы для развёртывания
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
    isUserBusy,
    calculateAverageMood,
    calculateAverageStress,
    calculateAverageWellbeing,
    // Phase 0 helpers (Phase 2 советы)
    getMealTotals,
    getLastMealWithItems,
    getFirstMealWithItems,
    isMilestoneShown,
    markMilestoneShown,
    countUniqueProducts,
    getTotalDaysTracked,
    getPersonalBestStreak,
    updatePersonalBestStreak,
    canShowMealAdvice,
    markMealAdviceShown,
    getRecentDays
  };
  
})();
