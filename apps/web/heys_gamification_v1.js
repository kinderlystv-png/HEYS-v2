// heys_gamification_v1.js — Gamification Core: XP, Уровни, Достижения
// Единый источник правды для всей геймификации HEYS
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  // ========== КОНФИГУРАЦИЯ ==========
  
  /**
   * Пороги уровней (XP необходимый для достижения уровня)
   * Уровень 1 = 0 XP, Уровень 2 = 100 XP, и т.д.
   */
  const LEVEL_THRESHOLDS = [
    0,      // Уровень 1
    100,    // Уровень 2
    300,    // Уровень 3
    600,    // Уровень 4
    1000,   // Уровень 5
    1500,   // Уровень 6
    2200,   // Уровень 7
    3000,   // Уровень 8
    4000,   // Уровень 9
    5200,   // Уровень 10
    6500,   // Уровень 11
    8000,   // Уровень 12
    10000,  // Уровень 13
    12500,  // Уровень 14
    15500,  // Уровень 15
    19000,  // Уровень 16
    23000,  // Уровень 17
    27500,  // Уровень 18
    32500,  // Уровень 19
    38000,  // Уровень 20
    44000,  // Уровень 21
    51000,  // Уровень 22
    59000,  // Уровень 23
    68000,  // Уровень 24
    78000   // Уровень 25
  ];

  /**
   * Титулы уровней с иконками и цветами
   */
  const LEVEL_TITLES = [
    { min: 1,  max: 4,  title: 'Новичок',  icon: '🌱', color: '#94a3b8' },
    { min: 5,  max: 9,  title: 'Ученик',   icon: '📚', color: '#3b82f6' },
    { min: 10, max: 14, title: 'Практик',  icon: '💪', color: '#22c55e' },
    { min: 15, max: 19, title: 'Эксперт',  icon: '⭐', color: '#eab308' },
    { min: 20, max: 25, title: 'Мастер',   icon: '👑', color: '#a855f7' }
  ];

  /**
   * XP за действия
   */
  const XP_ACTIONS = {
    product_added: { xp: 5, maxPerDay: 50, label: 'Продукт добавлен' },
    water_added: { xp: 2, maxPerDay: 10, label: 'Вода добавлена' },
    training_added: { xp: 15, maxPerDay: 3, label: 'Тренировка' },
    sleep_logged: { xp: 5, maxPerDay: 1, label: 'Сон заполнен' },
    weight_logged: { xp: 5, maxPerDay: 1, label: 'Вес записан' },
    day_completed: { xp: 50, maxPerDay: 1, label: 'День выполнен' },
    perfect_day: { xp: 25, maxPerDay: 1, label: 'Идеальный день' }
  };

  /**
   * Достижения (25 штук в 5 категориях)
   */
  const ACHIEVEMENTS = {
    // 🔥 Streak (5)
    streak_3: { id: 'streak_3', name: 'Три дня подряд', desc: 'Streak ≥ 3 дня', xp: 30, icon: '🔥', category: 'streak', rarity: 'common' },
    streak_7: { id: 'streak_7', name: 'Неделя успеха', desc: 'Streak ≥ 7 дней', xp: 100, icon: '🏆', category: 'streak', rarity: 'rare' },
    streak_14: { id: 'streak_14', name: 'Две недели', desc: 'Streak ≥ 14 дней', xp: 200, icon: '⭐', category: 'streak', rarity: 'epic' },
    streak_30: { id: 'streak_30', name: 'Месяц силы', desc: 'Streak ≥ 30 дней', xp: 500, icon: '👑', category: 'streak', rarity: 'legendary' },
    streak_100: { id: 'streak_100', name: 'Железная воля', desc: 'Streak ≥ 100 дней', xp: 1000, icon: '💎', category: 'streak', rarity: 'mythic' },

    // 🎯 Первые шаги (5)
    first_meal: { id: 'first_meal', name: 'Первый шаг', desc: 'Добавить первый продукт', xp: 50, icon: '🎯', category: 'onboarding', rarity: 'common' },
    first_water: { id: 'first_water', name: 'Водный старт', desc: 'Первый раз добавить воду', xp: 20, icon: '💧', category: 'onboarding', rarity: 'common' },
    first_training: { id: 'first_training', name: 'Активный старт', desc: 'Первая тренировка', xp: 30, icon: '🏃', category: 'onboarding', rarity: 'common' },
    first_weight: { id: 'first_weight', name: 'Точка отсчёта', desc: 'Первый раз ввести вес', xp: 20, icon: '⚖️', category: 'onboarding', rarity: 'common' },
    profile_complete: { id: 'profile_complete', name: 'Профиль готов', desc: 'Заполнить профиль на 100%', xp: 50, icon: '📋', category: 'onboarding', rarity: 'common' },

    // 💎 Качество дня (4)
    perfect_day: { id: 'perfect_day', name: 'Идеальный день', desc: 'Калории 95-105% от нормы', xp: 25, icon: '💎', category: 'quality', rarity: 'rare' },
    perfect_week: { id: 'perfect_week', name: 'Идеальная неделя', desc: '7 идеальных дней', xp: 200, icon: '🌟', category: 'quality', rarity: 'epic' },
    balanced_macros: { id: 'balanced_macros', name: 'Баланс БЖУ', desc: 'Все макросы 90-110%', xp: 30, icon: '⚖️', category: 'quality', rarity: 'rare' },
    fiber_champion: { id: 'fiber_champion', name: 'Клетчатка-чемпион', desc: 'Клетчатка ≥100% 7 дней', xp: 100, icon: '🥗', category: 'quality', rarity: 'rare' },

    // 💧 Вода и активность (4)
    water_day: { id: 'water_day', name: 'Водный день', desc: '100% нормы воды', xp: 15, icon: '💧', category: 'activity', rarity: 'common' },
    water_master: { id: 'water_master', name: 'Водный мастер', desc: '100% воды 7 дней подряд', xp: 100, icon: '🌊', category: 'activity', rarity: 'rare' },
    training_week: { id: 'training_week', name: 'Спортсмен', desc: '5 тренировок за неделю', xp: 150, icon: '💪', category: 'activity', rarity: 'epic' },
    steps_champion: { id: 'steps_champion', name: 'Шаговой марафон', desc: '10000+ шагов 7 дней', xp: 150, icon: '👟', category: 'activity', rarity: 'epic' },

    // ⭐ Уровни (5)
    level_5: { id: 'level_5', name: 'Ученик', desc: 'Достичь 5 уровня', xp: 50, icon: '📚', category: 'levels', rarity: 'common' },
    level_10: { id: 'level_10', name: 'Практик', desc: 'Достичь 10 уровня', xp: 100, icon: '💪', category: 'levels', rarity: 'rare' },
    level_15: { id: 'level_15', name: 'Эксперт', desc: 'Достичь 15 уровня', xp: 150, icon: '⭐', category: 'levels', rarity: 'epic' },
    level_20: { id: 'level_20', name: 'Мастер', desc: 'Достичь 20 уровня', xp: 200, icon: '👑', category: 'levels', rarity: 'legendary' },
    level_25: { id: 'level_25', name: 'Гуру', desc: 'Достичь 25 уровня', xp: 300, icon: '🏆', category: 'levels', rarity: 'mythic' },

    // 🌅 Привычки (2)
    early_bird: { id: 'early_bird', name: 'Ранняя пташка', desc: 'Завтрак до 9:00 7 дней', xp: 100, icon: '🌅', category: 'habits', rarity: 'rare' },
    night_owl_safe: { id: 'night_owl_safe', name: 'Без ночных перекусов', desc: 'Нет еды после 22:00 7 дней', xp: 100, icon: '🌙', category: 'habits', rarity: 'rare' }
  };

  const ACHIEVEMENT_CATEGORIES = [
    { id: 'streak', name: '🔥 Streak', achievements: ['streak_3', 'streak_7', 'streak_14', 'streak_30', 'streak_100'] },
    { id: 'onboarding', name: '🎯 Первые шаги', achievements: ['first_meal', 'first_water', 'first_training', 'first_weight', 'profile_complete'] },
    { id: 'quality', name: '💎 Качество дня', achievements: ['perfect_day', 'perfect_week', 'balanced_macros', 'fiber_champion'] },
    { id: 'activity', name: '💧 Вода и активность', achievements: ['water_day', 'water_master', 'training_week', 'steps_champion'] },
    { id: 'levels', name: '⭐ Уровни', achievements: ['level_5', 'level_10', 'level_15', 'level_20', 'level_25'] },
    { id: 'habits', name: '🌅 Привычки', achievements: ['early_bird', 'night_owl_safe'] }
  ];

  const RARITY_COLORS = {
    common: '#94a3b8',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#eab308',
    mythic: '#ef4444'
  };

  // ========== ВНУТРЕННЕЕ СОСТОЯНИЕ ==========

  let _data = null;
  let _debounceTimer = null;
  let _notificationQueue = [];
  let _isShowingNotification = false;
  const DEBOUNCE_MS = 100;
  const STORAGE_KEY = 'heys_game';

  // ========== ХЕЛПЕРЫ ==========

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadData() {
    if (_data) return _data;
    
    const stored = U.lsGet ? U.lsGet(STORAGE_KEY, null) : null;
    if (stored) {
      _data = stored;
    } else {
      _data = createDefaultData();
    }
    return _data;
  }

  function createDefaultData() {
    return {
      totalXP: 0,
      level: 1,
      unlockedAchievements: [],
      dailyXP: {},          // { '2025-11-30': { product_added: 5, water_added: 2, ... } }
      stats: {
        totalProducts: 0,
        totalWater: 0,
        totalTrainings: 0,
        perfectDays: 0,
        bestStreak: 0
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function saveData() {
    if (!_data) return;
    _data.updatedAt = Date.now();
    if (U.lsSet) {
      U.lsSet(STORAGE_KEY, _data);
    } else {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch (e) {}
    }
  }

  function calculateLevel(totalXP) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalXP >= LEVEL_THRESHOLDS[i]) {
        return i + 1; // уровни 1-indexed
      }
    }
    return 1;
  }

  function getLevelTitle(level) {
    for (const t of LEVEL_TITLES) {
      if (level >= t.min && level <= t.max) return t;
    }
    return LEVEL_TITLES[LEVEL_TITLES.length - 1];
  }

  function getXPForNextLevel(level) {
    if (level >= LEVEL_THRESHOLDS.length) return null; // max level
    return LEVEL_THRESHOLDS[level]; // индекс = уровень (0 = level 1)
  }

  function getXPForCurrentLevel(level) {
    if (level <= 1) return 0;
    return LEVEL_THRESHOLDS[level - 1];
  }

  // ========== FLYING ANIMATION ==========

  function flyToBar(sourceEl, xpAmount) {
    // Находим target — gamification bar в header
    const target = document.querySelector('.hdr-gamification .game-xp') || 
                   document.querySelector('.hdr-gamification');
    if (!target) return;

    // Определяем source position
    let sourceRect;
    if (sourceEl && sourceEl.getBoundingClientRect) {
      sourceRect = sourceEl.getBoundingClientRect();
    } else {
      // Fallback: центр экрана
      sourceRect = { 
        left: window.innerWidth / 2, 
        top: window.innerHeight / 2, 
        width: 0, 
        height: 0 
      };
    }

    const targetRect = target.getBoundingClientRect();

    // Создаём летящий элемент
    const fly = document.createElement('div');
    fly.className = 'flying-xp';
    fly.textContent = `+${xpAmount}`;
    fly.style.cssText = `
      position: fixed;
      left: ${sourceRect.left + sourceRect.width / 2}px;
      top: ${sourceRect.top + sourceRect.height / 2}px;
      font-size: 16px;
      font-weight: 700;
      color: #fbbf24;
      text-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
      pointer-events: none;
      z-index: 1150;
      transform: translate(-50%, -50%);
    `;
    document.body.appendChild(fly);

    // Анимация полёта
    requestAnimationFrame(() => {
      fly.style.transition = 'all 0.8s cubic-bezier(0.25, 0.1, 0.25, 1)';
      fly.style.left = `${targetRect.left + targetRect.width / 2}px`;
      fly.style.top = `${targetRect.top + targetRect.height / 2}px`;
      fly.style.opacity = '0';
      fly.style.transform = 'translate(-50%, -50%) scale(0.5)';
    });

    // Удаляем после анимации
    setTimeout(() => fly.remove(), 850);
  }

  // ========== УВЕДОМЛЕНИЯ ==========

  function showNotification(type, data) {
    _notificationQueue.push({ type, data });
    processNotificationQueue();
  }

  function processNotificationQueue() {
    if (_isShowingNotification || _notificationQueue.length === 0) return;
    
    _isShowingNotification = true;
    const { type, data } = _notificationQueue.shift();

    // Dispatch event для React компонента
    window.dispatchEvent(new CustomEvent('heysGameNotification', {
      detail: { type, data }
    }));

    // Auto-hide через 3-4 секунды
    const duration = type === 'level_up' ? 4000 : 3000;
    setTimeout(() => {
      _isShowingNotification = false;
      processNotificationQueue();
    }, duration);
  }

  // ========== CONFETTI ==========

  function celebrate() {
    window.dispatchEvent(new CustomEvent('heysCelebrate'));
  }

  // ========== ДОСТИЖЕНИЯ ==========

  function checkAchievements(reason) {
    const data = loadData();
    const newAchievements = [];

    // Streak achievements
    const streak = HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
    if (streak >= 3 && !data.unlockedAchievements.includes('streak_3')) {
      newAchievements.push('streak_3');
    }
    if (streak >= 7 && !data.unlockedAchievements.includes('streak_7')) {
      newAchievements.push('streak_7');
    }
    if (streak >= 14 && !data.unlockedAchievements.includes('streak_14')) {
      newAchievements.push('streak_14');
    }
    if (streak >= 30 && !data.unlockedAchievements.includes('streak_30')) {
      newAchievements.push('streak_30');
    }
    if (streak >= 100 && !data.unlockedAchievements.includes('streak_100')) {
      newAchievements.push('streak_100');
    }

    // First actions
    if (reason === 'product_added' && !data.unlockedAchievements.includes('first_meal')) {
      newAchievements.push('first_meal');
    }
    if (reason === 'water_added' && !data.unlockedAchievements.includes('first_water')) {
      newAchievements.push('first_water');
    }
    if (reason === 'training_added' && !data.unlockedAchievements.includes('first_training')) {
      newAchievements.push('first_training');
    }
    if (reason === 'weight_logged' && !data.unlockedAchievements.includes('first_weight')) {
      newAchievements.push('first_weight');
    }

    // Level achievements
    if (data.level >= 5 && !data.unlockedAchievements.includes('level_5')) {
      newAchievements.push('level_5');
    }
    if (data.level >= 10 && !data.unlockedAchievements.includes('level_10')) {
      newAchievements.push('level_10');
    }
    if (data.level >= 15 && !data.unlockedAchievements.includes('level_15')) {
      newAchievements.push('level_15');
    }
    if (data.level >= 20 && !data.unlockedAchievements.includes('level_20')) {
      newAchievements.push('level_20');
    }
    if (data.level >= 25 && !data.unlockedAchievements.includes('level_25')) {
      newAchievements.push('level_25');
    }

    // Unlock new achievements
    for (const achId of newAchievements) {
      unlockAchievement(achId);
    }

    return newAchievements;
  }

  function unlockAchievement(achievementId) {
    const data = loadData();
    const ach = ACHIEVEMENTS[achievementId];
    if (!ach || data.unlockedAchievements.includes(achievementId)) return;

    data.unlockedAchievements.push(achievementId);
    
    // Начисляем XP за достижение
    data.totalXP += ach.xp;
    data.level = calculateLevel(data.totalXP);
    saveData();

    // Показываем уведомление
    showNotification('achievement', {
      achievement: ach,
      totalXP: data.totalXP,
      level: data.level
    });

    // Confetti для rare+ достижений
    if (['rare', 'epic', 'legendary', 'mythic'].includes(ach.rarity)) {
      celebrate();
    }

    // Haptic
    if (HEYS.haptic) HEYS.haptic('success');
  }

  // ========== CORE API ==========

  const game = {
    /**
     * Добавить XP
     * @param {number} amount - количество XP (или 0 для авто из XP_ACTIONS)
     * @param {string} reason - причина (из XP_ACTIONS)
     * @param {HTMLElement} sourceEl - элемент-источник для flying animation
     */
    addXP(amount, reason, sourceEl) {
      // Debounce
      if (_debounceTimer) clearTimeout(_debounceTimer);
      
      _debounceTimer = setTimeout(() => {
        _addXPInternal(amount, reason, sourceEl);
      }, DEBOUNCE_MS);
    },

    getLevel() {
      return loadData().level;
    },

    getTotalXP() {
      return loadData().totalXP;
    },

    /**
     * Получить прогресс текущего уровня
     * @returns {{ current: number, required: number, percent: number }}
     */
    getProgress() {
      const data = loadData();
      const currentLevelXP = getXPForCurrentLevel(data.level);
      const nextLevelXP = getXPForNextLevel(data.level);
      
      if (nextLevelXP === null) {
        return { current: data.totalXP, required: data.totalXP, percent: 100 };
      }

      const progressXP = data.totalXP - currentLevelXP;
      const requiredXP = nextLevelXP - currentLevelXP;
      const percent = Math.min(100, Math.round((progressXP / requiredXP) * 100));

      return { current: progressXP, required: requiredXP, percent };
    },

    getLevelTitle() {
      return getLevelTitle(loadData().level);
    },

    getStats() {
      const data = loadData();
      return {
        totalXP: data.totalXP,
        level: data.level,
        title: getLevelTitle(data.level),
        progress: this.getProgress(),
        unlockedCount: data.unlockedAchievements.length,
        totalAchievements: Object.keys(ACHIEVEMENTS).length,
        stats: data.stats
      };
    },

    /**
     * Получить все достижения с статусом
     */
    getAchievements() {
      const data = loadData();
      return Object.values(ACHIEVEMENTS).map(ach => ({
        ...ach,
        unlocked: data.unlockedAchievements.includes(ach.id)
      }));
    },

    getAchievementCategories() {
      return ACHIEVEMENT_CATEGORIES;
    },

    isAchievementUnlocked(id) {
      return loadData().unlockedAchievements.includes(id);
    },

    // Flying animation
    flyToBar,

    // Confetti
    celebrate,

    // Notification
    showNotification,

    // День выполнен (вызывается при ratio 0.75-1.1)
    checkDayCompleted(ratio) {
      if (ratio >= 0.75 && ratio <= 1.1) {
        this.addXP(0, 'day_completed');
      }
      if (ratio >= 0.95 && ratio <= 1.05) {
        this.addXP(0, 'perfect_day');
      }
    },

    // Сброс данных (для тестирования)
    reset() {
      _data = createDefaultData();
      saveData();
      window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: this.getStats() }));
    },

    // Константы для UI
    ACHIEVEMENTS,
    ACHIEVEMENT_CATEGORIES,
    RARITY_COLORS,
    LEVEL_TITLES,
    XP_ACTIONS
  };

  // ========== INTERNAL ==========

  function _addXPInternal(amount, reason, sourceEl) {
    const data = loadData();
    const action = XP_ACTIONS[reason];
    const today = getToday();

    // Инициализируем daily tracking
    if (!data.dailyXP[today]) {
      data.dailyXP[today] = {};
    }

    // Проверяем лимит за день
    if (action) {
      const dailyCount = data.dailyXP[today][reason] || 0;
      if (dailyCount >= action.maxPerDay) {
        // Лимит достигнут, не начисляем
        return;
      }
      data.dailyXP[today][reason] = dailyCount + 1;
    }

    // Определяем XP
    const xpToAdd = amount > 0 ? amount : (action ? action.xp : 0);
    if (xpToAdd <= 0) return;

    const oldLevel = data.level;
    data.totalXP += xpToAdd;
    data.level = calculateLevel(data.totalXP);

    // Обновляем stats
    if (reason === 'product_added') data.stats.totalProducts++;
    if (reason === 'water_added') data.stats.totalWater++;
    if (reason === 'training_added') data.stats.totalTrainings++;
    if (reason === 'perfect_day') data.stats.perfectDays++;

    // Best streak
    const streak = HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
    if (streak > data.stats.bestStreak) {
      data.stats.bestStreak = streak;
    }

    saveData();

    // Haptic
    if (HEYS.haptic) HEYS.haptic('light');

    // Flying animation
    flyToBar(sourceEl, xpToAdd);

    // Dispatch update event
    window.dispatchEvent(new CustomEvent('heysGameUpdate', {
      detail: {
        xpGained: xpToAdd,
        reason,
        totalXP: data.totalXP,
        level: data.level,
        progress: game.getProgress()
      }
    }));

    // Level up notification
    if (data.level > oldLevel) {
      const title = getLevelTitle(data.level);
      showNotification('level_up', {
        newLevel: data.level,
        title: title.title,
        icon: title.icon,
        color: title.color
      });

      // Confetti на уровнях кратных 5
      if (data.level % 5 === 0) {
        celebrate();
      }
    }

    // Проверяем достижения
    checkAchievements(reason);
  }

  // ========== EVENT LISTENERS ==========

  // Слушаем события от других модулей
  window.addEventListener('heysProductAdded', (e) => {
    game.addXP(0, 'product_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysWaterAdded', (e) => {
    game.addXP(0, 'water_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysTrainingAdded', (e) => {
    game.addXP(0, 'training_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysSleepLogged', (e) => {
    game.addXP(0, 'sleep_logged', e.detail?.sourceEl);
  });

  window.addEventListener('heysWeightLogged', (e) => {
    game.addXP(0, 'weight_logged', e.detail?.sourceEl);
  });

  // ========== ЭКСПОРТ ==========

  HEYS.game = game;

  // Debug
  if (typeof window !== 'undefined') {
    window.debugGame = () => {
      console.log('Game State:', loadData());
      console.log('Stats:', game.getStats());
      console.log('Achievements:', game.getAchievements().filter(a => a.unlocked));
    };
  }

})(typeof window !== 'undefined' ? window : global);
