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
    perfect_day: { xp: 25, maxPerDay: 1, label: 'Идеальный день' },
    advice_read: { xp: 2, maxPerDay: 20, label: 'Совет прочитан' }
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
    night_owl_safe: { id: 'night_owl_safe', name: 'Без ночных перекусов', desc: 'Нет еды после 22:00 7 дней', xp: 100, icon: '🌙', category: 'habits', rarity: 'rare' },

    // 💡 Советы (2)
    advice_reader: { id: 'advice_reader', name: 'Внимательный', desc: 'Прочитать 50 советов', xp: 50, icon: '💡', category: 'habits', rarity: 'common' },
    advice_master: { id: 'advice_master', name: 'Мудрец', desc: 'Прочитать 200 советов', xp: 150, icon: '🧠', category: 'habits', rarity: 'rare' },

    // 🧠 Метаболизм (5) — НОВЫЕ для Metabolic Intelligence
    metabolic_stable: { id: 'metabolic_stable', name: 'Стабильный метаболизм', desc: 'Оценка ≥70 7 дней подряд', xp: 100, icon: '🧠', category: 'metabolic', rarity: 'rare' },
    crash_avoided: { id: 'crash_avoided', name: 'Срыв предотвращён', desc: 'Предупреждение о риске → успешный день', xp: 50, icon: '🛡️', category: 'metabolic', rarity: 'rare' },
    low_risk_master: { id: 'low_risk_master', name: 'Мастер контроля', desc: 'Низкий риск срыва 14 дней', xp: 200, icon: '🎯', category: 'metabolic', rarity: 'epic' },
    phenotype_discovered: { id: 'phenotype_discovered', name: 'Фенотип раскрыт', desc: 'Определён метаболический фенотип', xp: 100, icon: '🧬', category: 'metabolic', rarity: 'epic' },
    weekly_wrap_viewed: { id: 'weekly_wrap_viewed', name: 'Аналитик', desc: 'Посмотреть 4 еженедельных отчёта', xp: 75, icon: '📊', category: 'metabolic', rarity: 'rare' }
  };

  const ACHIEVEMENT_CATEGORIES = [
    { id: 'streak', name: '🔥 Streak', achievements: ['streak_3', 'streak_7', 'streak_14', 'streak_30', 'streak_100'] },
    { id: 'onboarding', name: '🎯 Первые шаги', achievements: ['first_meal', 'first_water', 'first_training', 'first_weight', 'profile_complete'] },
    { id: 'quality', name: '💎 Качество дня', achievements: ['perfect_day', 'perfect_week', 'balanced_macros', 'fiber_champion'] },
    { id: 'activity', name: '💧 Вода и активность', achievements: ['water_day', 'water_master', 'training_week', 'steps_champion'] },
    { id: 'levels', name: '⭐ Уровни', achievements: ['level_5', 'level_10', 'level_15', 'level_20', 'level_25'] },
    { id: 'habits', name: '🌅 Привычки', achievements: ['early_bird', 'night_owl_safe'] },
    { id: 'metabolic', name: '🧠 Метаболизм', achievements: ['metabolic_stable', 'crash_avoided', 'low_risk_master', 'phenotype_discovered', 'weekly_wrap_viewed'] }
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
  const DATA_VERSION = 2; // Версия структуры данных для миграций
  const MAX_DAILY_XP_DAYS = 30; // Хранить историю XP максимум 30 дней

  // ========== ХЕЛПЕРЫ ==========

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadData() {
    if (_data) return _data;
    
    const stored = U.lsGet ? U.lsGet(STORAGE_KEY, null) : null;
    if (stored) {
      _data = validateAndMigrate(stored);
    } else {
      _data = createDefaultData();
    }
    return _data;
  }

  /**
   * Валидация и миграция данных
   * Гарантирует что все поля существуют и имеют правильный тип
   */
  function validateAndMigrate(data) {
    const defaults = createDefaultData();
    
    // Проверка базовой структуры
    if (!data || typeof data !== 'object') {
      console.warn('[HEYS.game] Invalid data structure, resetting');
      return defaults;
    }
    
    // Миграция: добавляем недостающие поля
    const migrated = {
      ...defaults,
      ...data,
      // Гарантируем правильные типы
      totalXP: typeof data.totalXP === 'number' ? data.totalXP : 0,
      level: typeof data.level === 'number' ? data.level : 1,
      unlockedAchievements: Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements : [],
      dailyXP: (data.dailyXP && typeof data.dailyXP === 'object') ? data.dailyXP : {},
      stats: { ...defaults.stats, ...(data.stats || {}) },
      dailyActions: data.dailyActions || defaults.dailyActions,
      weeklyChallenge: data.weeklyChallenge || defaults.weeklyChallenge,
      // v2: Добавляем прогресс достижений
      achievementProgress: data.achievementProgress || {},
      // Версия данных
      version: DATA_VERSION
    };
    
    // Пересчитываем уровень на случай повреждения
    migrated.level = calculateLevel(migrated.totalXP);
    
    // Cleanup старых dailyXP (>30 дней)
    migrated.dailyXP = cleanupOldDailyXP(migrated.dailyXP);
    
    // Логируем миграцию если версия изменилась
    if (data.version !== DATA_VERSION) {
      console.log(`[HEYS.game] Data migrated from v${data.version || 1} to v${DATA_VERSION}`);
    }
    
    return migrated;
  }

  /**
   * Удаляет записи dailyXP старше MAX_DAILY_XP_DAYS дней
   */
  function cleanupOldDailyXP(dailyXP) {
    if (!dailyXP || typeof dailyXP !== 'object') return {};
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_DAILY_XP_DAYS);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);
    
    const cleaned = {};
    let removedCount = 0;
    
    for (const [date, xp] of Object.entries(dailyXP)) {
      if (date >= cutoffStr) {
        cleaned[date] = xp;
      } else {
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`[HEYS.game] Cleaned up ${removedCount} old dailyXP entries`);
    }
    
    return cleaned;
  }

  function createDefaultData() {
    return {
      version: DATA_VERSION,
      totalXP: 0,
      level: 1,
      unlockedAchievements: [],
      dailyXP: {},          // { '2025-11-30': { product_added: 5, water_added: 2, ... } }
      dailyBonusClaimed: null, // '2025-11-30' — дата последнего daily bonus
      // Daily Action Multiplier (накопительный за день)
      dailyActions: {
        date: null,           // '2025-12-01'
        count: 0              // количество действий за день
      },
      // Weekly challenge
      weeklyChallenge: {
        weekStart: null,      // '2025-12-01' — начало недели
        target: 500,          // цель XP
        earned: 0,            // набрано XP
        type: 'xp'            // тип челленджа
      },
      // Прогресс к достижениям (для UI)
      achievementProgress: {
        // perfect_week: { current: 3, target: 7 }
        // water_master: { current: 5, target: 7, dates: ['2025-12-01', ...] }
      },
      stats: {
        totalProducts: 0,
        totalWater: 0,
        totalTrainings: 0,
        totalAdvicesRead: 0,
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

  // ========== RANK BADGES ==========
  const RANK_BADGES = [
    { min: 1, max: 4, rank: 'Bronze', icon: '🥉', color: '#cd7f32' },
    { min: 5, max: 9, rank: 'Silver', icon: '🥈', color: '#c0c0c0' },
    { min: 10, max: 14, rank: 'Gold', icon: '🥇', color: '#ffd700' },
    { min: 15, max: 19, rank: 'Platinum', icon: '💎', color: '#e5e4e2' },
    { min: 20, max: 25, rank: 'Diamond', icon: '👑', color: '#b9f2ff' }
  ];

  function getRankBadge(level) {
    for (const r of RANK_BADGES) {
      if (level >= r.min && level <= r.max) return r;
    }
    return RANK_BADGES[RANK_BADGES.length - 1];
  }

  // ========== XP MULTIPLIER ==========
  function getXPMultiplier() {
    const streak = HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
    if (streak >= 14) return 3;  // 3x при streak 14+
    if (streak >= 7) return 2.5; // 2.5x при streak 7+
    if (streak >= 3) return 2;   // 2x при streak 3+
    return 1;
  }

  // ========== DAILY BONUS ==========
  function canClaimDailyBonus() {
    const data = loadData();
    const today = getToday();
    return data.dailyBonusClaimed !== today;
  }

  function claimDailyBonus() {
    const data = loadData();
    const today = getToday();
    if (data.dailyBonusClaimed === today) return false;
    
    data.dailyBonusClaimed = today;
    const bonusXP = 10 * getXPMultiplier();
    data.totalXP += bonusXP;
    data.level = calculateLevel(data.totalXP);
    saveData();
    
    showNotification('daily_bonus', { xp: bonusXP, multiplier: getXPMultiplier() });
    window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: { xpGained: bonusXP, reason: 'daily_bonus' } }));
    return true;
  }

  // ========== PERSONAL BEST ==========
  function isNewStreakRecord() {
    const data = loadData();
    const currentStreak = HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
    return currentStreak > 0 && currentStreak > data.stats.bestStreak;
  }

  function getNextLevelTitle(level) {
    const nextLevel = level + 1;
    if (nextLevel > 25) return null;
    return getLevelTitle(nextLevel);
  }

  /**
   * Получить все звания с уровнями для отображения прогресса
   */
  function getAllTitles() {
    return LEVEL_TITLES.map(t => ({
      ...t,
      // Уровень, с которого начинается это звание
      startLevel: t.min
    }));
  }

  // ========== DAILY ACTION MULTIPLIER ==========
  // Накопительный множитель за день: чем больше действий — тем больше XP
  // Сбрасывается только на новый день
  
  const DAILY_MULTIPLIER_THRESHOLDS = [
    { actions: 0, multiplier: 1.0, label: '' },
    { actions: 3, multiplier: 1.2, label: '🔥' },      // 3+ действия = 1.2x
    { actions: 6, multiplier: 1.5, label: '🔥🔥' },    // 6+ = 1.5x
    { actions: 10, multiplier: 1.8, label: '🔥🔥🔥' }, // 10+ = 1.8x
    { actions: 15, multiplier: 2.0, label: '⚡' },      // 15+ = 2x
    { actions: 20, multiplier: 2.5, label: '⚡⚡' },    // 20+ = 2.5x
    { actions: 30, multiplier: 3.0, label: '💎' }      // 30+ = 3x (max)
  ];

  // Порог ночи: до 3:00 — это ещё "вчера"
  const NIGHT_HOUR_THRESHOLD = 3;

  function getTodayDate() {
    const d = new Date();
    const hour = d.getHours();
    // До 3:00 — это ещё "вчера" (день продолжается)
    if (hour < NIGHT_HOUR_THRESHOLD) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString().slice(0, 10);
  }

  function getDailyMultiplier() {
    const data = loadData();
    const today = getTodayDate();
    
    // Миграция или новый день
    if (!data.dailyActions || data.dailyActions.date !== today) {
      return { multiplier: 1, actions: 0, label: '', nextThreshold: 3 };
    }
    
    const actions = data.dailyActions.count;
    let current = DAILY_MULTIPLIER_THRESHOLDS[0];
    let next = DAILY_MULTIPLIER_THRESHOLDS[1];
    
    for (let i = DAILY_MULTIPLIER_THRESHOLDS.length - 1; i >= 0; i--) {
      if (actions >= DAILY_MULTIPLIER_THRESHOLDS[i].actions) {
        current = DAILY_MULTIPLIER_THRESHOLDS[i];
        next = DAILY_MULTIPLIER_THRESHOLDS[i + 1] || null;
        break;
      }
    }
    
    return {
      multiplier: current.multiplier,
      actions: actions,
      label: current.label,
      nextThreshold: next ? next.actions : null,
      nextMultiplier: next ? next.multiplier : null
    };
  }

  function incrementDailyActions() {
    const data = loadData();
    const today = getTodayDate();
    
    // Миграция или новый день — сбрасываем
    if (!data.dailyActions || data.dailyActions.date !== today) {
      data.dailyActions = { date: today, count: 0 };
    }
    
    data.dailyActions.count += 1;
    saveData();
    
    const multiplierInfo = getDailyMultiplier();
    
    // Dispatch event для UI
    window.dispatchEvent(new CustomEvent('heysDailyMultiplierUpdate', {
      detail: multiplierInfo
    }));
    
    return multiplierInfo;
  }

  // ========== WEEKLY CHALLENGE ==========
  function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
    return new Date(now.setDate(diff)).toISOString().slice(0, 10);
  }

  function getWeeklyChallenge() {
    const data = loadData();
    const currentWeek = getWeekStart();
    
    // Миграция: если weeklyChallenge нет (старые данные), создаём
    if (!data.weeklyChallenge) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        target: 500,
        earned: 0
      };
      saveData();
    }
    
    // Новая неделя — сбрасываем
    if (data.weeklyChallenge.weekStart !== currentWeek) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        target: 500,
        earned: 0
      };
      saveData();
    }
    
    return {
      ...data.weeklyChallenge,
      percent: Math.min(100, Math.round((data.weeklyChallenge.earned / data.weeklyChallenge.target) * 100)),
      completed: data.weeklyChallenge.earned >= data.weeklyChallenge.target
    };
  }

  function addWeeklyXP(xp) {
    const data = loadData();
    const currentWeek = getWeekStart();
    
    // Миграция: если weeklyChallenge нет
    if (!data.weeklyChallenge) {
      data.weeklyChallenge = { weekStart: currentWeek, target: 500, earned: 0 };
    }
    
    if (data.weeklyChallenge.weekStart !== currentWeek) {
      data.weeklyChallenge = { weekStart: currentWeek, target: 500, earned: 0 };
    }
    
    const wasCompleted = data.weeklyChallenge.earned >= data.weeklyChallenge.target;
    data.weeklyChallenge.earned += xp;
    saveData();
    
    // Проверяем завершение
    if (!wasCompleted && data.weeklyChallenge.earned >= data.weeklyChallenge.target) {
      showNotification('weekly_complete', { target: data.weeklyChallenge.target });
      // Бонус за выполнение
      data.totalXP += 100;
      data.level = calculateLevel(data.totalXP);
      saveData();
      celebrate();
    }
  }

  // ========== XP SOUND (Web Audio API) ==========
  let audioContext = null;
  
  function playXPSound(isLevelUp = false) {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (isLevelUp) {
        // Level up — мелодия из 3 нот (восходящая)
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
      } else {
        // Обычный XP — короткий "пинг"
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
      }
    } catch (e) {
      // Ignore audio errors
    }
  }

  // ========== XP HISTORY (7 days) ==========
  function getXPHistory() {
    const data = loadData();
    const history = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayXP = data.dailyXP[dateStr] || {};
      
      // Сумма XP за день
      let totalDayXP = 0;
      for (const reason of Object.keys(dayXP)) {
        const action = XP_ACTIONS[reason];
        if (action) {
          totalDayXP += dayXP[reason] * action.xp;
        }
      }
      
      history.push({
        date: dateStr,
        day: d.toLocaleDateString('ru', { weekday: 'short' }),
        xp: totalDayXP
      });
    }
    
    return history;
  }

  // ========== FLOATING XP ==========
  function showFloatingXP(sourceEl, xpAmount, isCombo = false) {
    let x, y;
    if (sourceEl && sourceEl.getBoundingClientRect) {
      const rect = sourceEl.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top;
    } else {
      x = window.innerWidth / 2;
      y = window.innerHeight / 2;
    }

    const float = document.createElement('div');
    float.className = `floating-xp-text ${isCombo ? 'combo' : ''}`;
    float.innerHTML = isCombo 
      ? `<span class="combo-text">COMBO!</span> +${xpAmount}` 
      : `+${xpAmount}`;
    float.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      transform: translateX(-50%);
      font-size: ${isCombo ? '18px' : '16px'};
      font-weight: 700;
      color: ${isCombo ? '#f59e0b' : '#fbbf24'};
      text-shadow: 0 2px 8px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 9999;
      animation: floatUp 1.2s ease-out forwards;
    `;
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 1200);
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

  // ========== STREAK SHIELD ==========
  function canUseStreakShield() {
    const data = loadData();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return data.streakShieldUsed !== currentMonth;
  }

  function useStreakShield() {
    const data = loadData();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if (data.streakShieldUsed === currentMonth) return false;
    
    data.streakShieldUsed = currentMonth;
    saveData();
    
    showNotification('streak_shield', { message: 'Streak спасён! 🛡️' });
    return true;
  }

  function getStreakShieldStatus() {
    const data = loadData();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      available: data.streakShieldUsed !== currentMonth,
      usedThisMonth: data.streakShieldUsed === currentMonth
    };
  }

  // ========== XP BREAKDOWN ==========
  function getXPBreakdown() {
    const data = loadData();
    const today = getToday();
    const todayXP = data.dailyXP[today] || {};
    
    const breakdown = [];
    for (const [reason, count] of Object.entries(todayXP)) {
      const action = XP_ACTIONS[reason];
      if (action && count > 0) {
        breakdown.push({
          reason,
          label: action.label,
          count,
          xp: count * action.xp
        });
      }
    }
    
    return {
      items: breakdown,
      total: breakdown.reduce((sum, b) => sum + b.xp, 0)
    };
  }

  // ========== LEVEL-UP PREVIEW ==========
  function getLevelUpPreview() {
    const data = loadData();
    const currentTitle = getLevelTitle(data.level);
    
    // Найти следующее звание
    const nextTitleInfo = LEVEL_TITLES.find(t => t.min > data.level);
    if (!nextTitleInfo) return null;
    
    const levelsToNextTitle = nextTitleInfo.min - data.level;
    const xpToNextTitle = LEVEL_THRESHOLDS[nextTitleInfo.min - 1] - data.totalXP;
    
    return {
      currentTitle: currentTitle.title,
      nextTitle: nextTitleInfo.title,
      nextIcon: nextTitleInfo.icon,
      levelsRemaining: levelsToNextTitle,
      xpRemaining: Math.max(0, xpToNextTitle)
    };
  }

  // ========== ДОСТИЖЕНИЯ ==========

  /**
   * Обновляет прогресс достижения и возвращает true если цель достигнута
   */
  function updateAchievementProgress(achId, current, target, extraData = {}) {
    const data = loadData();
    if (!data.achievementProgress) data.achievementProgress = {};
    
    data.achievementProgress[achId] = {
      current: Math.min(current, target),
      target,
      ...extraData,
      updatedAt: Date.now()
    };
    saveData();
    
    return current >= target;
  }

  /**
   * Получить прогресс конкретного достижения
   */
  function getAchievementProgress(achId) {
    const data = loadData();
    return data.achievementProgress?.[achId] || null;
  }

  /**
   * Подсчёт последовательных дней с условием
   * @param {Function} conditionFn - (dayData, dateStr) => boolean
   * @param {number} maxDays - максимум дней для проверки
   */
  function countConsecutiveDays(conditionFn, maxDays = 14) {
    let count = 0;
    const today = new Date();
    
    for (let i = 0; i < maxDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      
      const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateStr}`, null) : null;
      
      if (dayData && conditionFn(dayData, dateStr)) {
        count++;
      } else if (i > 0) {
        // Цепочка прервалась (пропускаем сегодня если данных нет)
        break;
      }
    }
    
    return count;
  }

  function checkAchievements(reason) {
    const data = loadData();
    const newAchievements = [];

    // ========== STREAK ACHIEVEMENTS ==========
    const streak = HEYS.Day && HEYS.Day.getStreak ? HEYS.Day.getStreak() : 0;
    
    const streakMilestones = [
      { days: 3, id: 'streak_3' },
      { days: 7, id: 'streak_7' },
      { days: 14, id: 'streak_14' },
      { days: 30, id: 'streak_30' },
      { days: 100, id: 'streak_100' }
    ];
    
    for (const m of streakMilestones) {
      if (streak >= m.days && !data.unlockedAchievements.includes(m.id)) {
        newAchievements.push(m.id);
      }
      // Обновляем прогресс для UI
      if (!data.unlockedAchievements.includes(m.id)) {
        updateAchievementProgress(m.id, streak, m.days);
      }
    }

    // ========== FIRST ACTIONS ==========
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

    // ========== LEVEL ACHIEVEMENTS ==========
    const levelMilestones = [5, 10, 15, 20, 25];
    for (const lvl of levelMilestones) {
      const achId = `level_${lvl}`;
      if (data.level >= lvl && !data.unlockedAchievements.includes(achId)) {
        newAchievements.push(achId);
      }
      if (!data.unlockedAchievements.includes(achId)) {
        updateAchievementProgress(achId, data.level, lvl);
      }
    }

    // ========== QUALITY ACHIEVEMENTS ==========
    
    // Perfect day (проверяется извне через checkDayCompleted)
    if (reason === 'perfect_day' && !data.unlockedAchievements.includes('perfect_day')) {
      newAchievements.push('perfect_day');
    }

    // Perfect week — 7 идеальных дней подряд
    if ((reason === 'perfect_day' || reason === 'day_completed') && !data.unlockedAchievements.includes('perfect_week')) {
      const perfectDays = countConsecutiveDays((dayData, dateStr) => {
        if (!dayData.meals || dayData.meals.length === 0) return false;
        // Проверяем ratio в dailyXP или вычисляем
        const dayXP = data.dailyXP[dateStr];
        return dayXP && dayXP.perfect_day > 0;
      }, 14);
      
      updateAchievementProgress('perfect_week', perfectDays, 7);
      if (perfectDays >= 7) {
        newAchievements.push('perfect_week');
      }
    }

    // Balanced macros — все макросы 90-110%
    if (reason === 'product_added' && !data.unlockedAchievements.includes('balanced_macros')) {
      if (HEYS.Day && HEYS.Day.getMacroBalance) {
        const balance = HEYS.Day.getMacroBalance();
        if (balance && balance.protein >= 0.9 && balance.protein <= 1.1 &&
            balance.carbs >= 0.9 && balance.carbs <= 1.1 &&
            balance.fat >= 0.9 && balance.fat <= 1.1) {
          newAchievements.push('balanced_macros');
        }
      }
    }

    // Fiber champion — клетчатка ≥100% 7 дней
    if ((reason === 'product_added' || reason === 'day_completed') && !data.unlockedAchievements.includes('fiber_champion')) {
      const fiberDays = countConsecutiveDays((dayData) => {
        if (!dayData.meals || dayData.meals.length === 0) return false;
        // Нужна проверка клетчатки — используем achievementProgress для трекинга
        return data.achievementProgress?.fiber_champion?.dates?.includes(dayData.date);
      }, 14);
      
      // Проверяем сегодняшнюю клетчатку
      if (HEYS.Day && HEYS.Day.getFiberPercent && HEYS.Day.getFiberPercent() >= 100) {
        const today = getToday();
        if (!data.achievementProgress) data.achievementProgress = {};
        if (!data.achievementProgress.fiber_champion) {
          data.achievementProgress.fiber_champion = { current: 0, target: 7, dates: [] };
        }
        if (!data.achievementProgress.fiber_champion.dates.includes(today)) {
          data.achievementProgress.fiber_champion.dates.push(today);
          // Оставляем только последние 14 дней
          data.achievementProgress.fiber_champion.dates = 
            data.achievementProgress.fiber_champion.dates.slice(-14);
        }
        
        // Проверяем последовательность
        const consecutiveFiber = countConsecutiveFiberDays(data.achievementProgress.fiber_champion.dates);
        data.achievementProgress.fiber_champion.current = consecutiveFiber;
        saveData();
        
        if (consecutiveFiber >= 7) {
          newAchievements.push('fiber_champion');
        }
      }
    }

    // ========== WATER & ACTIVITY ACHIEVEMENTS ==========

    // Water day — 100% воды
    if (reason === 'water_added' && !data.unlockedAchievements.includes('water_day')) {
      if (HEYS.Day && HEYS.Day.getWaterPercent && HEYS.Day.getWaterPercent() >= 100) {
        newAchievements.push('water_day');
      }
    }

    // Water master — 100% воды 7 дней подряд
    if (reason === 'water_added' && !data.unlockedAchievements.includes('water_master')) {
      const waterDays = countConsecutiveDays((dayData) => {
        if (!dayData.waterMl) return false;
        // Базовая норма ~2000мл, проверяем ≥90%
        const waterGoal = 2000; // TODO: использовать динамическую норму
        return dayData.waterMl >= waterGoal * 0.9;
      }, 14);
      
      updateAchievementProgress('water_master', waterDays, 7);
      if (waterDays >= 7) {
        newAchievements.push('water_master');
      }
    }

    // Training week — 5 тренировок за неделю
    if (reason === 'training_added' && !data.unlockedAchievements.includes('training_week')) {
      if (!data.weeklyTrainings) data.weeklyTrainings = { week: null, count: 0 };
      const currentWeek = getWeekStart();
      if (data.weeklyTrainings.week !== currentWeek) {
        data.weeklyTrainings = { week: currentWeek, count: 0 };
      }
      data.weeklyTrainings.count++;
      updateAchievementProgress('training_week', data.weeklyTrainings.count, 5);
      saveData();
      if (data.weeklyTrainings.count >= 5) {
        newAchievements.push('training_week');
      }
    }

    // Steps champion — 10000+ шагов 7 дней
    if (!data.unlockedAchievements.includes('steps_champion')) {
      const stepsDays = countConsecutiveDays((dayData) => {
        return dayData.steps && dayData.steps >= 10000;
      }, 14);
      
      updateAchievementProgress('steps_champion', stepsDays, 7);
      if (stepsDays >= 7) {
        newAchievements.push('steps_champion');
      }
    }

    // ========== HABITS ACHIEVEMENTS ==========

    // Early bird — завтрак до 9:00 7 дней
    if (reason === 'product_added' && !data.unlockedAchievements.includes('early_bird')) {
      const hour = new Date().getHours();
      if (hour < 9) {
        if (!data.earlyBirdDays) data.earlyBirdDays = [];
        const today = getToday();
        if (!data.earlyBirdDays.includes(today)) {
          data.earlyBirdDays.push(today);
          data.earlyBirdDays = data.earlyBirdDays.slice(-14);
          saveData();
        }
        
        const consecutiveEarly = countConsecutiveFromDates(data.earlyBirdDays);
        updateAchievementProgress('early_bird', consecutiveEarly, 7);
        
        if (consecutiveEarly >= 7) {
          newAchievements.push('early_bird');
        }
      }
    }

    // Night owl safe — нет еды после 22:00 7 дней
    if ((reason === 'day_completed' || reason === 'product_added') && !data.unlockedAchievements.includes('night_owl_safe')) {
      const safeDays = countConsecutiveDays((dayData) => {
        if (!dayData.meals || dayData.meals.length === 0) return false;
        // Проверяем что нет еды после 22:00
        for (const meal of dayData.meals) {
          if (meal.time) {
            const [h] = meal.time.split(':').map(Number);
            if (h >= 22 || h < 3) return false; // После 22 или до 3 ночи
          }
        }
        return true;
      }, 14);
      
      updateAchievementProgress('night_owl_safe', safeDays, 7);
      if (safeDays >= 7) {
        newAchievements.push('night_owl_safe');
      }
    }

    // Advice achievements — за прочтение советов
    if (reason === 'advice_read') {
      if (!data.stats) data.stats = {};
      if (!data.stats.totalAdvicesRead) data.stats.totalAdvicesRead = 0;
      data.stats.totalAdvicesRead++;
      saveData();

      updateAchievementProgress('advice_reader', data.stats.totalAdvicesRead, 50);
      updateAchievementProgress('advice_master', data.stats.totalAdvicesRead, 200);

      if (data.stats.totalAdvicesRead >= 50 && !data.unlockedAchievements.includes('advice_reader')) {
        newAchievements.push('advice_reader');
      }
      if (data.stats.totalAdvicesRead >= 200 && !data.unlockedAchievements.includes('advice_master')) {
        newAchievements.push('advice_master');
      }
    }

    // Unlock new achievements
    for (const achId of newAchievements) {
      unlockAchievement(achId);
    }

    return newAchievements;
  }

  /**
   * Подсчёт последовательных дней из массива дат
   */
  function countConsecutiveFromDates(dates) {
    if (!dates || dates.length === 0) return 0;
    
    const sortedDates = [...dates].sort().reverse();
    let count = 0;
    const today = new Date();
    
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      
      if (sortedDates.includes(dateStr)) {
        count++;
      } else if (i > 0) {
        break;
      }
    }
    
    return count;
  }

  /**
   * Подсчёт последовательных дней клетчатки
   */
  function countConsecutiveFiberDays(dates) {
    return countConsecutiveFromDates(dates);
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

    // Показываем notification (React компонент .game-notification)
    // NOTE: showAchievementToast убран — был дубль с showNotification
    showNotification('achievement', {
      achievement: ach,
      totalXP: data.totalXP,
      level: data.level
    });

    // Звук при получении достижения!
    playXPSound(true); // Level-up мелодия для достижений
    
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
     * Получить все достижения с статусом и прогрессом
     */
    getAchievements() {
      const data = loadData();
      return Object.values(ACHIEVEMENTS).map(ach => {
        const progress = data.achievementProgress?.[ach.id] || null;
        return {
          ...ach,
          unlocked: data.unlockedAchievements.includes(ach.id),
          progress: progress ? {
            current: progress.current || 0,
            target: progress.target || 1,
            percent: progress.target ? Math.round((progress.current / progress.target) * 100) : 0
          } : null
        };
      });
    },

    /**
     * Получить прогресс конкретного достижения
     */
    getAchievementProgress(achId) {
      return getAchievementProgress(achId);
    },

    /**
     * Получить достижения "в процессе" (не разблокированы, но есть прогресс)
     */
    getInProgressAchievements() {
      const data = loadData();
      const achievements = [];
      
      for (const [achId, progress] of Object.entries(data.achievementProgress || {})) {
        if (!data.unlockedAchievements.includes(achId) && progress.current > 0) {
          const achDef = ACHIEVEMENTS[achId];
          if (achDef) {
            achievements.push({
              ...achDef,
              progress: {
                current: progress.current,
                target: progress.target,
                percent: Math.round((progress.current / progress.target) * 100)
              }
            });
          }
        }
      }
      
      // Сортируем по проценту выполнения (ближайшие к разблокировке первые)
      return achievements.sort((a, b) => b.progress.percent - a.progress.percent);
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
    checkDayCompleted(ratio, dateStr) {
      if (ratio >= 0.75 && ratio <= 1.1) {
        this.addXP(0, 'day_completed');
      }
      if (ratio >= 0.95 && ratio <= 1.05) {
        this.addXP(0, 'perfect_day');
      }
      
      // 📊 Записываем результат для A/B теста (если включён)
      if (dateStr && HEYS.Metabolic?.recordABResult) {
        try {
          // Читаем напрямую из localStorage (A/B данные не синхронизируются в облако)
          const stored = localStorage.getItem(`heys_predicted_risk_${dateStr}`);
          const dayRisk = stored ? JSON.parse(stored) : null;
          if (dayRisk !== null && typeof dayRisk === 'number') {
            HEYS.Metabolic.recordABResult(dateStr, dayRisk, ratio);
          }
        } catch (e) {
          // Тихо игнорируем ошибки
        }
      }
    },
    
    /**
     * 🧠 Проверка метаболических достижений (новая функция)
     * Вызывается из Metabolic Intelligence модуля
     */
    checkMetabolicAchievements(data) {
      const { score, risk, phenotype, weeklyWrapViewed } = data || {};
      
      // metabolic_stable: оценка ≥70 7 дней подряд
      if (data.stableDaysCount >= 7 && !this.isAchievementUnlocked('metabolic_stable')) {
        _unlockAchievement('metabolic_stable');
      }
      
      // low_risk_master: низкий риск 14 дней
      if (data.lowRiskDaysCount >= 14 && !this.isAchievementUnlocked('low_risk_master')) {
        _unlockAchievement('low_risk_master');
      }
      
      // phenotype_discovered: фенотип определён с confidence ≥70%
      if (phenotype?.confidence >= 70 && !this.isAchievementUnlocked('phenotype_discovered')) {
        _unlockAchievement('phenotype_discovered');
      }
      
      // weekly_wrap_viewed: 4 просмотра отчётов
      const wrapViewCount = U.lsGet?.('heys_weekly_wrap_view_count', 0) || 0;
      if (wrapViewCount >= 4 && !this.isAchievementUnlocked('weekly_wrap_viewed')) {
        _unlockAchievement('weekly_wrap_viewed');
      }
    },
    
    /**
     * 🛡️ Проверка crash_avoided — риск был высокий, но день успешный
     */
    checkCrashAvoided(hadHighRisk, daySuccessful) {
      if (hadHighRisk && daySuccessful && !this.isAchievementUnlocked('crash_avoided')) {
        _unlockAchievement('crash_avoided');
      }
    },
    
    /**
     * 📊 Инкремент просмотров Weekly Wrap
     */
    incrementWeeklyWrapViews() {
      const count = (U.lsGet?.('heys_weekly_wrap_view_count', 0) || 0) + 1;
      U.lsSet?.('heys_weekly_wrap_view_count', count);
      return count;
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
    XP_ACTIONS,
    RANK_BADGES,

    // Новые функции
    getRankBadge,
    getXPMultiplier,
    canClaimDailyBonus,
    claimDailyBonus,
    isNewStreakRecord,
    getNextLevelTitle,
    getAllTitles,
    
    // Daily Action Multiplier
    getDailyMultiplier,
    incrementDailyActions,
    
    // Weekly challenge
    getWeeklyChallenge,
    
    // Floating XP
    showFloatingXP,
    
    // XP Sound
    playXPSound,
    
    // XP History (7 days)
    getXPHistory,
    
    // Streak Shield
    canUseStreakShield,
    useStreakShield,
    getStreakShieldStatus,
    
    // XP Breakdown
    getXPBreakdown,
    
    // Level-up Preview
    getLevelUpPreview
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

    // Определяем XP с учётом multiplier
    let xpToAdd = amount > 0 ? amount : (action ? action.xp : 0);
    if (xpToAdd <= 0) return;
    
    // Увеличиваем счётчик дневных действий
    const dailyInfo = incrementDailyActions();
    
    // Применяем multiplier от streak
    const streakMultiplier = getXPMultiplier();
    // Применяем daily multiplier (накопительный за день)
    const totalMultiplier = streakMultiplier * dailyInfo.multiplier;
    xpToAdd = Math.round(xpToAdd * totalMultiplier);
    
    // Floating XP animation (показываем если есть бонус)
    const hasBonus = dailyInfo.multiplier > 1;
    showFloatingXP(sourceEl, xpToAdd, hasBonus);

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

    // Weekly challenge tracking
    addWeeklyXP(xpToAdd);
    
    saveData();

    // Haptic
    if (HEYS.haptic) HEYS.haptic('light');

    // Flying animation
    flyToBar(sourceEl, xpToAdd);
    
    // XP Sound
    playXPSound(false);

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
      
      // Level-up sound!
      playXPSound(true);
      
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

  // 🔄 КРИТИЧНО: Слушаем sync из облака — сбрасываем кеш чтобы не затереть свежие данные
  let _initialSyncDone = false; // Флаг первой синхронизации
  let _lastSyncTime = 0; // Время последнего sync (для cooldown)
  const SYNC_COOLDOWN_MS = 5000; // 5 секунд cooldown между реакциями на sync
  
  window.addEventListener('heysSyncCompleted', (e) => {
    const now = Date.now();
    
    // Запоминаем текущие stats ДО сброса кеша
    const oldStats = _data ? game.getStats() : null;
    const oldXP = oldStats?.xp || 0;
    const oldLevel = oldStats?.level || 0;
    const oldStreak = oldStats?.streak || 0;
    
    // Сбрасываем in-memory кеш — при следующем loadData() прочитаем свежие данные из localStorage
    _data = null;
    
    // 🔒 При ПЕРВОЙ синхронизации НЕ диспатчим heysGameUpdate
    // GamificationBar уже инициализирован с данными из localStorage
    // Это предотвращает мерцание UI при загрузке страницы
    if (!_initialSyncDone) {
      _initialSyncDone = true;
      _lastSyncTime = now;
      console.log('[HEYS.game] ♻️ Cache invalidated after initial sync (skip UI update to prevent flicker)');
      return;
    }
    
    // 🔒 Cooldown: не реагируем на sync если прошло < 5 секунд
    // Это предотвращает цепную реакцию sync → save → sync
    if (now - _lastSyncTime < SYNC_COOLDOWN_MS) {
      console.log('[HEYS.game] ♻️ Cache invalidated (cooldown active, skip UI update)');
      return;
    }
    _lastSyncTime = now;
    
    // Получаем новые stats
    const newStats = game.getStats();
    
    // 🔒 Оптимизация: НЕ диспатчим heysGameUpdate если данные не изменились
    if (oldStats && 
        newStats.xp === oldXP && 
        newStats.level === oldLevel && 
        newStats.streak === oldStreak) {
      console.log('[HEYS.game] ♻️ Cache invalidated after cloud sync (no changes, skip UI update)');
      return;
    }
    
    // Уведомляем UI об обновлении (GamificationBar перечитает stats)
    window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: newStats }));
    console.log('[HEYS.game] ♻️ Cache invalidated after cloud sync (stats changed)');
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
