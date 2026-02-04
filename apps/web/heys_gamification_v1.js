// heys_gamification_v1.js — Gamification Core: XP, Уровни, Достижения
// Единый источник правды для всей геймификации HEYS
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  const readStoredValue = (key, fallback) => {
    if (HEYS.store?.get) return HEYS.store.get(key, fallback);
    if (U.lsGet) return U.lsGet(key, fallback);
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      const first = raw[0];
      if (first === '{' || first === '[') return JSON.parse(raw);
      return raw;
    } catch (e) {
      return fallback;
    }
  };

  const setStoredValue = (key, value) => {
    if (HEYS.store?.set) {
      HEYS.store.set(key, value);
      return;
    }
    if (U.lsSet) {
      U.lsSet(key, value);
      return;
    }
    try {
      if (value && typeof value === 'object') {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch (e) { }
  };

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
    { min: 1, max: 4, title: 'Новичок', icon: '🌱', color: '#94a3b8' },
    { min: 5, max: 9, title: 'Ученик', icon: '📚', color: '#3b82f6' },
    { min: 10, max: 14, title: 'Практик', icon: '💪', color: '#22c55e' },
    { min: 15, max: 19, title: 'Эксперт', icon: '⭐', color: '#eab308' },
    { min: 20, max: 25, title: 'Мастер', icon: '👑', color: '#a855f7' }
  ];

  /**
   * XP за действия
   */
  const XP_ACTIONS = {
    checkin_complete: { xp: 10, maxPerDay: 1, label: 'Утренний чек-ин' },
    meal_added: { xp: 3, maxPerDay: 4, label: 'Приём пищи' },
    product_added: { xp: 3, maxPerDay: 10, label: 'Продукт добавлен' },
    steps_updated: { xp: 3, maxPerDay: 1, label: 'Шаги обновлены' },
    supplements_taken: { xp: 5, maxPerDay: 1, label: 'Витамины приняты' },
    household_added: { xp: 5, maxPerDay: 2, label: 'Бытовая активность' },
    water_added: { xp: 2, maxPerDay: 5, label: 'Вода добавлена' },
    training_added: { xp: 15, maxPerDay: 2, label: 'Тренировка' },
    sleep_logged: { xp: 5, maxPerDay: 1, label: 'Сон заполнен' },
    weight_logged: { xp: 5, maxPerDay: 1, label: 'Вес записан' },
    day_completed: { xp: 50, maxPerDay: 1, label: 'День выполнен' },
    perfect_day: { xp: 25, maxPerDay: 1, label: 'Идеальный день' },
    advice_read: { xp: 2, maxPerDay: 10, label: 'Совет прочитан' }
  };

  /**
   * Достижения (32 штуки в 7 категориях)
   */
  const ACHIEVEMENTS = {
    // 🔥 Streak (5)
    streak_1: { id: 'streak_1', name: 'Первый день', desc: 'Streak ≥ 1 день', story: 'Первый день — начало устойчивого ритма.', xp: 100, icon: '🔥', category: 'streak', rarity: 'common' },
    streak_2: { id: 'streak_2', name: 'Два дня подряд', desc: 'Streak ≥ 2 дня', story: 'Два дня подряд — уже не случайность.', xp: 200, icon: '🔥', category: 'streak', rarity: 'rare' },
    streak_3: { id: 'streak_3', name: 'Три дня подряд', desc: 'Streak ≥ 3 дня', story: 'Три дня подряд — импульс закрепился.', xp: 350, icon: '🏆', category: 'streak', rarity: 'epic' },
    streak_5: { id: 'streak_5', name: 'Пять дней подряд', desc: 'Streak ≥ 5 дней', story: 'Пять дней — стабильность уже видна.', xp: 700, icon: '👑', category: 'streak', rarity: 'legendary' },
    streak_7: { id: 'streak_7', name: 'Семь дней подряд', desc: 'Streak ≥ 7 дней', story: 'Семь дней — это суперредко и очень сильно.', xp: 1200, icon: '💎', category: 'streak', rarity: 'mythic' },

    // 🎯 Первые шаги (10)
    first_checkin: { id: 'first_checkin', name: 'Первый чек-ин', desc: 'Завершить утренний чек-ин', story: 'Первый чек-ин — утро под контролем.', xp: 40, icon: '☀️', category: 'onboarding', rarity: 'common' },
    first_meal: { id: 'first_meal', name: 'Первый приём', desc: 'Добавить первый приём пищи', story: 'Первый приём — старт новой привычки.', xp: 50, icon: '🍽️', category: 'onboarding', rarity: 'common' },
    first_product: { id: 'first_product', name: 'Первый продукт', desc: 'Добавить продукт в приём', story: 'Первый продукт — ты начал вести дневник.', xp: 40, icon: '🥗', category: 'onboarding', rarity: 'common' },
    first_steps: { id: 'first_steps', name: 'Первые шаги', desc: 'Указать шаги хотя бы раз', story: 'Первые шаги — движение тоже в фокусе.', xp: 20, icon: '👟', category: 'onboarding', rarity: 'common' },
    first_water: { id: 'first_water', name: 'Водный старт', desc: 'Первый раз добавить воду', story: 'Первый стакан — маленький шаг к большой энергии.', xp: 20, icon: '💧', category: 'onboarding', rarity: 'common' },
    first_advice: { id: 'first_advice', name: 'Первый совет', desc: 'Прочитать совет', story: 'Первый совет — бережный старт.', xp: 15, icon: '💡', category: 'onboarding', rarity: 'common' },
    first_supplements: { id: 'first_supplements', name: 'Первые витамины', desc: 'Отметить приём добавок', story: 'Витамины отмечены — регулярность началась.', xp: 20, icon: '💊', category: 'onboarding', rarity: 'common' },
    first_training: { id: 'first_training', name: 'Активный старт', desc: 'Первая тренировка', story: 'Первая тренировка — тело услышало твой сигнал.', xp: 30, icon: '🏃', category: 'onboarding', rarity: 'common' },
    first_household: { id: 'first_household', name: 'Первый быт', desc: 'Первая бытовая активность', story: 'Бытовая активность тоже считается — классный старт.', xp: 20, icon: '🏠', category: 'onboarding', rarity: 'common' },

    // 💎 Качество дня (4)
    perfect_day: { id: 'perfect_day', name: 'Идеальный день', desc: 'Калории 95-105% от нормы', story: 'Идеальный баланс — когда план и реальность совпали.', xp: 25, icon: '💎', category: 'quality', rarity: 'rare' },
    perfect_week: { id: 'perfect_week', name: 'Идеальная неделя', desc: '7 идеальных дней', story: 'Семь идеальных дней — редкое мастерство.', xp: 200, icon: '🌟', category: 'quality', rarity: 'epic' },
    balanced_macros: { id: 'balanced_macros', name: 'Баланс БЖУ', desc: 'Все макросы 90-110%', story: 'БЖУ в балансе — питание стало умным.', xp: 30, icon: '⚖️', category: 'quality', rarity: 'rare' },
    fiber_champion: { id: 'fiber_champion', name: 'Клетчатка-чемпион', desc: 'Клетчатка ≥100% 7 дней', story: 'Клетчатка в норме — микробиом скажет спасибо.', xp: 100, icon: '🥗', category: 'quality', rarity: 'rare' },

    // 💧 Вода и активность (4)
    water_day: { id: 'water_day', name: 'Водный день', desc: '100% нормы воды', story: 'Норма воды выполнена — метаболизм работает лучше.', xp: 15, icon: '💧', category: 'activity', rarity: 'common' },
    water_master: { id: 'water_master', name: 'Водный мастер', desc: '100% воды 7 дней подряд', story: 'Семь дней воды — гидратация стала привычкой.', xp: 100, icon: '🌊', category: 'activity', rarity: 'rare' },
    training_week: { id: 'training_week', name: 'Спортсмен', desc: '5 тренировок за неделю', story: 'Пять тренировок — ты держишь темп.', xp: 150, icon: '💪', category: 'activity', rarity: 'epic' },
    steps_champion: { id: 'steps_champion', name: 'Шаговой марафон', desc: '10000+ шагов 7 дней', story: '10k шагов 7 дней — движение стало стилем жизни.', xp: 150, icon: '👟', category: 'activity', rarity: 'epic' },

    // ⭐ Уровни (5)
    level_5: { id: 'level_5', name: 'Ученик', desc: 'Достичь 5 уровня', story: 'Ты перешёл в ученики — база заложена.', xp: 50, icon: '📚', category: 'levels', rarity: 'common' },
    level_10: { id: 'level_10', name: 'Практик', desc: 'Достичь 10 уровня', story: 'Практик: знания превращаются в действия.', xp: 100, icon: '💪', category: 'levels', rarity: 'rare' },
    level_15: { id: 'level_15', name: 'Эксперт', desc: 'Достичь 15 уровня', story: 'Эксперт: ты видишь систему целиком.', xp: 150, icon: '⭐', category: 'levels', rarity: 'epic' },
    level_20: { id: 'level_20', name: 'Мастер', desc: 'Достичь 20 уровня', story: 'Мастер: стабильность и контроль.', xp: 200, icon: '👑', category: 'levels', rarity: 'legendary' },
    level_25: { id: 'level_25', name: 'Гуру', desc: 'Достичь 25 уровня', story: 'Гуру: путь пройден, ты вдохновляешь.', xp: 300, icon: '🏆', category: 'levels', rarity: 'mythic' },

    // 🌅 Привычки (2)
    early_bird: { id: 'early_bird', name: 'Ранняя пташка', desc: 'Завтрак до 9:00 7 дней', story: 'Завтрак до 9:00 — ты задаёшь правильный тон дню.', xp: 100, icon: '🌅', category: 'habits', rarity: 'rare' },
    night_owl_safe: { id: 'night_owl_safe', name: 'Без ночных перекусов', desc: 'Нет еды после 22:00 7 дней', story: 'Без еды после 22:00 — сон и гормоны благодарны.', xp: 100, icon: '🌙', category: 'habits', rarity: 'rare' },

    // 💡 Советы (2)
    advice_reader: { id: 'advice_reader', name: 'Внимательный', desc: 'Прочитать 50 советов', story: '50 советов — ты слушаешь и применяешь.', xp: 50, icon: '💡', category: 'habits', rarity: 'common' },
    advice_master: { id: 'advice_master', name: 'Мудрец', desc: 'Прочитать 200 советов', story: '200 советов — мудрость в действии.', xp: 150, icon: '🧠', category: 'habits', rarity: 'rare' },

    // 🧠 Метаболизм (5) — НОВЫЕ для Metabolic Intelligence
    metabolic_stable: { id: 'metabolic_stable', name: 'Стабильный метаболизм', desc: 'Оценка ≥70 7 дней подряд', story: 'Стабильный метаболизм — твой режим работает.', xp: 100, icon: '🧠', category: 'metabolic', rarity: 'rare' },
    crash_avoided: { id: 'crash_avoided', name: 'Срыв предотвращён', desc: 'Предупреждение о риске → успешный день', story: 'Риск был высок, но ты удержал день.', xp: 50, icon: '🛡️', category: 'metabolic', rarity: 'rare' },
    low_risk_master: { id: 'low_risk_master', name: 'Мастер контроля', desc: 'Низкий риск срыва 14 дней', story: '14 дней низкого риска — зрелая устойчивость.', xp: 200, icon: '🎯', category: 'metabolic', rarity: 'epic' },
    phenotype_discovered: { id: 'phenotype_discovered', name: 'Фенотип раскрыт', desc: 'Определён метаболический фенотип', story: 'Фенотип определён — ты понимаешь себя.', xp: 100, icon: '🧬', category: 'metabolic', rarity: 'epic' },
    weekly_wrap_viewed: { id: 'weekly_wrap_viewed', name: 'Аналитик', desc: 'Посмотреть 4 еженедельных отчёта', story: 'Четыре отчёта — ты анализируешь и растёшь.', xp: 75, icon: '📊', category: 'metabolic', rarity: 'rare' }
  };

  const ACHIEVEMENT_CATEGORIES = [
    { id: 'streak', name: '🔥 Streak', achievements: ['streak_1', 'streak_2', 'streak_3', 'streak_5', 'streak_7'] },
    { id: 'onboarding', name: '🎯 Первые шаги', achievements: ['first_checkin', 'first_meal', 'first_product', 'first_steps', 'first_advice', 'first_supplements', 'first_water', 'first_training', 'first_household'] },
    { id: 'advice', name: '💡 Советы', achievements: ['advice_reader', 'advice_master'] },
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
  let _cloudLoaded = false; // 🛡️ Флаг что облако проверено
  let _pendingCloudSync = false; // 🔄 Отложенный sync до загрузки облака
  const DEBOUNCE_MS = 100;
  const STORAGE_KEY = 'heys_game';
  const DATA_VERSION = 2; // Версия структуры данных для миграций
  const MAX_DAILY_XP_DAYS = 30; // Хранить историю XP максимум 30 дней
  let _cloudWatchBound = false;

  // ========== ХЕЛПЕРЫ ==========

  function safeGetStreak() {
    if (typeof U.safeGetStreak === 'function') {
      return U.safeGetStreak();
    }
    try {
      return typeof HEYS.Day?.getStreak === 'function' ? HEYS.Day.getStreak() : 0;
    } catch {
      return 0;
    }
  }

  // 🎵 Mission completion sound (short double ping)
  function playMissionSound(isAllComplete = false) {
    loadSoundSettings();
    if (!SOUND_SETTINGS.enabled) return;

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const volume = SOUND_SETTINGS.volume;
      const notes = isAllComplete
        ? [
          { freq: 659.25, time: 0 },
          { freq: 783.99, time: 0.08 },
          { freq: 987.77, time: 0.16 }
        ]
        : [
          { freq: 587.33, time: 0 },
          { freq: 698.46, time: 0.1 }
        ];

      notes.forEach(({ freq, time }) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume * 0.7, audioContext.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.18);
        osc.start(audioContext.currentTime + time);
        osc.stop(audioContext.currentTime + time + 0.18);
      });
    } catch (e) {
      // Ignore audio errors
    }
  }

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadData() {
    if (_data) return _data;

    let stored = readStoredValue(STORAGE_KEY, null);

    // 🛡️ FIX v2.0: Fallback поиск по всем вариантам ключа если основной пустой
    if (!stored || !stored.totalXP || stored.totalXP === 0) {
      let bestXP = stored?.totalXP || 0;
      let bestData = stored;

      try {
        // 1. Прямой ключ heys_game (legacy без clientId)
        const legacyRaw = localStorage.getItem('heys_game');
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw);
          if (legacy?.totalXP > bestXP) {
            bestXP = legacy.totalXP;
            bestData = legacy;
            console.log('[🎮 Gamification] Found legacy heys_game with XP:', bestXP);
          }
        }

        // 2. Поиск по всем ключам *_game (разные clientId)
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.endsWith('_game') && !k.includes('_gamification') && !k.includes('sound')) {
            try {
              const raw = localStorage.getItem(k);
              if (raw) {
                // Проверяем сжатие
                const parsed = raw.startsWith('¤Z¤')
                  ? (HEYS.store?.decompress ? HEYS.store.decompress(raw) : JSON.parse(raw.substring(3)))
                  : JSON.parse(raw);
                if (parsed?.totalXP > bestXP) {
                  bestXP = parsed.totalXP;
                  bestData = parsed;
                  console.log(`[🎮 Gamification] Found better data in ${k}: XP=${bestXP}, level=${parsed.level}`);
                }
              }
            } catch (e) { }
          }
        }
      } catch (e) {
        console.warn('[🎮 Gamification] Fallback search error:', e);
      }

      if (bestData && bestData !== stored) {
        stored = bestData;
        console.log('[🎮 Gamification] Using best found data: XP=', bestXP, 'level=', calculateLevel(bestXP));
      }
    }

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

    migrateStreakAchievements(migrated);
    return migrated;
  }

  function mergeUniqueArray(a, b) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    return Array.from(new Set([...arrA, ...arrB]));
  }

  function mergeDateStrings(a, b) {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return a >= b ? a : b;
  }

  function mergeStats(localStats, cloudStats) {
    const base = {
      totalProducts: 0,
      totalWater: 0,
      totalTrainings: 0,
      totalAdvicesRead: 0,
      perfectDays: 0,
      bestStreak: 0
    };
    const local = { ...base, ...(localStats || {}) };
    const cloud = { ...base, ...(cloudStats || {}) };
    return {
      totalProducts: Math.max(local.totalProducts || 0, cloud.totalProducts || 0),
      totalWater: Math.max(local.totalWater || 0, cloud.totalWater || 0),
      totalTrainings: Math.max(local.totalTrainings || 0, cloud.totalTrainings || 0),
      totalAdvicesRead: Math.max(local.totalAdvicesRead || 0, cloud.totalAdvicesRead || 0),
      perfectDays: Math.max(local.perfectDays || 0, cloud.perfectDays || 0),
      bestStreak: Math.max(local.bestStreak || 0, cloud.bestStreak || 0)
    };
  }

  function mergeAchievementProgress(localProgress, cloudProgress) {
    const merged = { ...(localProgress || {}) };
    const cloud = cloudProgress || {};

    Object.keys(cloud).forEach((achId) => {
      const localEntry = merged[achId] || {};
      const cloudEntry = cloud[achId] || {};

      const mergedDates = mergeUniqueArray(localEntry.dates, cloudEntry.dates);
      const mergedEntry = {
        ...localEntry,
        ...cloudEntry,
        current: Math.max(localEntry.current || 0, cloudEntry.current || 0),
        target: Math.max(localEntry.target || 0, cloudEntry.target || 0),
        updatedAt: Math.max(localEntry.updatedAt || 0, cloudEntry.updatedAt || 0)
      };
      if (mergedDates.length > 0) {
        mergedEntry.dates = mergedDates;
      }
      merged[achId] = mergedEntry;
    });

    return merged;
  }

  function mergeDailyXP(localXP, cloudXP) {
    const merged = { ...(localXP || {}) };
    const cloud = cloudXP || {};

    Object.keys(cloud).forEach((dateStr) => {
      const localDay = merged[dateStr] || {};
      const cloudDay = cloud[dateStr] || {};
      const mergedDay = { ...localDay };

      Object.keys(cloudDay).forEach((reason) => {
        const localCount = localDay[reason] || 0;
        const cloudCount = cloudDay[reason] || 0;
        const summed = localCount + cloudCount;
        const maxPerDay = XP_ACTIONS[reason]?.maxPerDay || summed;
        mergedDay[reason] = Math.min(summed, maxPerDay);
      });

      merged[dateStr] = mergedDay;
    });

    return merged;
  }

  /**
   * 🛡️ Smart Merge Daily Actions
   * Конфликт слияния данных, когда на разных устройствах за день сделано разное кол-во действий.
   * Старая логика (Math.max) приводила к потере прогресса.
   * Новая логика:
   * 1. Если даты совпадают -> берем версию с большим `updatedAt` (последнее изменение).
   * 2. Если `updatedAt` нет -> приоритет у большего значения (safe fallback).
   */
  function mergeDailyActions(localActions, cloudActions) {
    if (!localActions) return cloudActions || { date: null, count: 0, updatedAt: 0 };
    if (!cloudActions) return localActions || { date: null, count: 0, updatedAt: 0 };

    const localDate = localActions.date;
    const cloudDate = cloudActions.date;

    // 1. Нет дат — возвращаем пустой
    if (!localDate && !cloudDate) return { date: null, count: 0, updatedAt: 0 };

    // 2. Одна из дат пустая
    if (!localDate) return { ...cloudActions };
    if (!cloudDate) return { ...localActions };

    // 3. Даты разные — берем более новую (предполагаем, что старый день закончился)
    if (localDate > cloudDate) return { ...localActions };
    if (cloudDate > localDate) return { ...cloudActions };

    // 4. Даты равны (конфликт за один день)
    // ГЛАВНОЕ: Берём MAX, потому что действия только накапливаются.
    // Если на телефоне 5, а в облаке 3 — значит истина 5.
    return {
      date: localDate,
      count: Math.max(localActions.count || 0, cloudActions.count || 0),
      updatedAt: Math.max(localActions.updatedAt || 0, cloudActions.updatedAt || 0)
    };
  }

  function mergeWeeklyChallenge(localChallenge, cloudChallenge) {
    const local = localChallenge || {};
    const cloud = cloudChallenge || {};
    const localWeek = local.weekStart || null;
    const cloudWeek = cloud.weekStart || null;

    if (!localWeek && !cloudWeek) return { ...local };
    if (!localWeek) return { ...cloud };
    if (!cloudWeek) return { ...local };

    if (cloudWeek !== localWeek) {
      return cloudWeek > localWeek ? { ...cloud } : { ...local };
    }

    return {
      ...local,
      ...cloud,
      earned: Math.max(local.earned || 0, cloud.earned || 0),
      mealsCount: Math.max(local.mealsCount || 0, cloud.mealsCount || 0),
      waterDays: Math.max(local.waterDays || 0, cloud.waterDays || 0),
      trainingsCount: Math.max(local.trainingsCount || 0, cloud.trainingsCount || 0),
      perfectDays: Math.max(local.perfectDays || 0, cloud.perfectDays || 0),
      earlyBirdDays: Math.max(local.earlyBirdDays || 0, cloud.earlyBirdDays || 0)
    };
  }

  function mergeDailyMissions(localMissions, cloudMissions) {
    const local = localMissions || null;
    const cloud = cloudMissions || null;
    if (!local && !cloud) return null;
    if (!local) return { ...cloud };
    if (!cloud) return { ...local };

    if (local.date !== cloud.date) {
      return local.date > cloud.date ? { ...local } : { ...cloud };
    }

    const localList = Array.isArray(local.missions) ? local.missions : [];
    const cloudList = Array.isArray(cloud.missions) ? cloud.missions : [];
    const mergedById = new Map();

    localList.forEach((m) => mergedById.set(m.id, { ...m }));
    cloudList.forEach((m) => {
      const existing = mergedById.get(m.id) || {};
      mergedById.set(m.id, {
        ...existing,
        ...m,
        progress: Math.max(existing.progress || 0, m.progress || 0),
        completed: Boolean(existing.completed || m.completed)
      });
    });

    const mergedMissions = Array.from(mergedById.values());
    const completedCount = mergedMissions.filter((m) => m.completed).length;

    return {
      date: local.date,
      missions: mergedMissions,
      completedCount,
      bonusClaimed: Boolean(local.bonusClaimed || cloud.bonusClaimed)
    };
  }

  function mergeGameData(localData, cloudData) {
    const local = validateAndMigrate(localData || {});
    const cloud = validateAndMigrate(cloudData || {});
    const merged = createDefaultData();

    merged.totalXP = Math.max(local.totalXP || 0, cloud.totalXP || 0);
    merged.level = calculateLevel(merged.totalXP);
    merged.unlockedAchievements = mergeUniqueArray(local.unlockedAchievements, cloud.unlockedAchievements);
    merged.achievementProgress = mergeAchievementProgress(local.achievementProgress, cloud.achievementProgress);
    merged.dailyXP = mergeDailyXP(local.dailyXP, cloud.dailyXP);
    merged.dailyBonusClaimed = mergeDateStrings(local.dailyBonusClaimed, cloud.dailyBonusClaimed);
    merged.dailyActions = mergeDailyActions(local.dailyActions, cloud.dailyActions);
    merged.weeklyChallenge = mergeWeeklyChallenge(local.weeklyChallenge, cloud.weeklyChallenge);
    merged.dailyMissions = mergeDailyMissions(local.dailyMissions, cloud.dailyMissions);
    merged.weeklyTrainings = local.weeklyTrainings || cloud.weeklyTrainings || null;
    merged.earlyBirdDays = mergeUniqueArray(local.earlyBirdDays, cloud.earlyBirdDays);
    merged.streakShieldUsed = mergeDateStrings(local.streakShieldUsed, cloud.streakShieldUsed);
    merged.stats = mergeStats(local.stats, cloud.stats);
    merged.createdAt = Math.min(local.createdAt || Date.now(), cloud.createdAt || Date.now());
    merged.updatedAt = Math.max(local.updatedAt || 0, cloud.updatedAt || 0) || Date.now();
    merged.version = DATA_VERSION;

    return merged;
  }

  // 🛡️ FIX v2.3: Флаг для предотвращения рекурсии в watch callback
  let _isProcessingWatch = false;

  function bindCloudWatch() {
    if (_cloudWatchBound || !HEYS.store?.watch) return;
    _cloudWatchBound = true;

    HEYS.store.watch(STORAGE_KEY, (nextVal) => {
      // 🛡️ FIX v2.3: Предотвращаем рекурсию — если мы сами записали, не обрабатываем
      if (_isProcessingWatch) return;
      if (!nextVal || typeof nextVal !== 'object') return;

      const current = _data || loadData();
      const nextXP = nextVal.totalXP || 0;
      const nextAchievements = Array.isArray(nextVal.unlockedAchievements)
        ? nextVal.unlockedAchievements.length
        : 0;
      const currentXP = current?.totalXP || 0;
      const currentAchievements = Array.isArray(current?.unlockedAchievements)
        ? current.unlockedAchievements.length
        : 0;
      const nextUpdated = nextVal.updatedAt || 0;
      const currentUpdated = current?.updatedAt || 0;

      if (
        nextUpdated && currentUpdated &&
        nextUpdated <= currentUpdated &&
        nextXP <= currentXP &&
        nextAchievements <= currentAchievements
      ) {
        return;
      }

      const merged = mergeGameData(current, nextVal);
      _data = merged;

      // 🛡️ FIX v2.3: Защита от рекурсии при записи
      _isProcessingWatch = true;
      try {
        setStoredValue(STORAGE_KEY, _data);
      } finally {
        _isProcessingWatch = false;
      }

      _cloudLoaded = true;
      if (_pendingCloudSync) {
        _pendingCloudSync = false;
        triggerImmediateSync('pending_sync');
      }

      window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: game.getStats() }));
    });
  }

  function migrateStreakAchievements(data) {
    if (!data || !Array.isArray(data.unlockedAchievements)) return;

    const legacyStreakIds = new Set(['streak_14', 'streak_30', 'streak_100']);
    const hasLegacy = data.unlockedAchievements.some((id) => legacyStreakIds.has(id));

    if (hasLegacy) {
      const newStreakIds = ['streak_1', 'streak_2', 'streak_3', 'streak_5', 'streak_7'];
      newStreakIds.forEach((id) => {
        if (!data.unlockedAchievements.includes(id)) {
          data.unlockedAchievements.push(id);
        }
      });
    }

    // Удаляем legacy-идентификаторы, чтобы не засорять список
    if (hasLegacy) {
      data.unlockedAchievements = data.unlockedAchievements.filter((id) => !legacyStreakIds.has(id));
    }
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

  // 🔄 Debounce для синхронизации с облаком
  let _cloudSyncTimer = null;
  const CLOUD_SYNC_DEBOUNCE_MS = 1000; // 🔥 Оптимизация: 1 сек вместо 3
  let _lastImmediateSync = 0;
  const IMMEDIATE_SYNC_COOLDOWN_MS = 2000; // 🔥 Оптимизация: 2 сек вместо 10

  function scheduleCloudSync(immediate = false) {
    if (!_cloudLoaded) {
      _pendingCloudSync = true;
      return;
    }

    if (_cloudSyncTimer) clearTimeout(_cloudSyncTimer);

    if (immediate) {
      triggerImmediateSync('auto_sync');
    } else {
      _cloudSyncTimer = setTimeout(() => {
        _cloudSyncTimer = null;
        triggerImmediateSync('auto_sync');
      }, CLOUD_SYNC_DEBOUNCE_MS);
    }
  }

  function triggerImmediateSync(reason) {
    if (!_cloudLoaded) {
      _pendingCloudSync = true;
      return;
    }
    const now = Date.now();

    // 🔥 ОПТИМИЗАЦИЯ: для критических событий (level_up, achievement) игнорируем кулдаун
    const isCritical = ['level_up', 'achievement_unlocked', 'daily_bonus', 'daily_missions_bonus'].includes(reason);
    const cooldown = isCritical ? 0 : IMMEDIATE_SYNC_COOLDOWN_MS;

    if (now - _lastImmediateSync < cooldown) {
      // Если часто — откладываем
      if (_cloudSyncTimer) clearTimeout(_cloudSyncTimer);
      _cloudSyncTimer = setTimeout(() => triggerImmediateSync(reason), CLOUD_SYNC_DEBOUNCE_MS);
      return;
    }

    _lastImmediateSync = now;
    if (_data) {
      _data.updatedAt = Date.now();
      // 🔧 FIX v2.3: Сохраняем ТОЛЬКО в localStorage (setStoredValue), НЕ через HEYS.store.set
      // HEYS.store.set вызывает saveClientKey → который фильтруется в doClientUpload
      // Это избыточно — syncToCloud() сам отправляет данные через RPC
      setStoredValue(STORAGE_KEY, _data);
    }

    // 🔄 Синхронизируем с облаком через прямой RPC (не через saveClientKey)
    if (HEYS.game?.syncToCloud) {
      HEYS.game.syncToCloud();
    }
  }

  function saveData() {
    if (!_data) return;
    _data.updatedAt = Date.now();
    setStoredValue(STORAGE_KEY, _data);

    // 🔄 Автосинхронизация с облаком (debounced)
    scheduleCloudSync();
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
    const streak = safeGetStreak();
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
    const oldLevel = data.level; // Store the old level before updating
    data.totalXP += bonusXP;
    data.level = calculateLevel(data.totalXP);
    handleRankTransition(oldLevel, data.level);
    saveData();
    triggerImmediateSync('daily_bonus');

    showNotification('daily_bonus', { xp: bonusXP, multiplier: getXPMultiplier() });
    window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: { xpGained: bonusXP, reason: 'daily_bonus' } }));
    return true;
  }

  // ========== PERSONAL BEST ==========
  function isNewStreakRecord() {
    const data = loadData();
    const currentStreak = safeGetStreak();
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

  // ========== DAILY MISSIONS ==========

  const DAILY_MISSION_POOL = [
    // Питание
    { id: 'log_3_meals', name: 'Три приёма пищи', icon: '🍽️', desc: 'Запиши 3 приёма пищи', xp: 25, type: 'meals', target: 3 },
    { id: 'log_breakfast', name: 'Завтрак чемпиона', icon: '🌅', desc: 'Запиши завтрак до 10:00', xp: 20, type: 'early_meal', target: 10 },
    { id: 'add_5_products', name: 'Разнообразие', icon: '🥗', desc: 'Добавь 5 разных продуктов', xp: 20, type: 'products', target: 5 },
    { id: 'fiber_50', name: 'Больше клетчатки', icon: '🥦', desc: 'Набери 50% нормы клетчатки', xp: 25, type: 'fiber', target: 50 },
    { id: 'protein_80', name: 'Белковый день', icon: '🥩', desc: 'Набери 80% нормы белка', xp: 30, type: 'protein', target: 80 },

    // Вода
    { id: 'water_50', name: 'Полпути', icon: '💧', desc: 'Выпей 50% нормы воды', xp: 15, type: 'water', target: 50 },
    { id: 'water_100', name: 'Норма воды', icon: '🌊', desc: 'Выполни норму воды на 100%', xp: 30, type: 'water', target: 100 },
    { id: 'water_3_times', name: 'Регулярность', icon: '⏱️', desc: 'Запиши воду 3 раза', xp: 20, type: 'water_entries', target: 3 },

    // Активность
    { id: 'log_training', name: 'Тренировка дня', icon: '💪', desc: 'Запиши тренировку', xp: 30, type: 'training', target: 1 },
    { id: 'steps_5k', name: '5000 шагов', icon: '👟', desc: 'Пройди 5000 шагов', xp: 25, type: 'steps', target: 5000 },
    { id: 'steps_8k', name: '8000 шагов', icon: '🚶', desc: 'Пройди 8000 шагов', xp: 35, type: 'steps', target: 8000 },

    // Здоровье
    { id: 'log_weight', name: 'Взвешивание', icon: '⚖️', desc: 'Запиши утренний вес', xp: 15, type: 'weight', target: 1 },
    { id: 'log_sleep', name: 'Режим сна', icon: '😴', desc: 'Запиши время сна', xp: 15, type: 'sleep', target: 1 },

    // Качество
    { id: 'balance_day', name: 'Баланс БЖУ', icon: '⚖️', desc: 'Все макросы в диапазоне 80-120%', xp: 40, type: 'balance', target: 1 },
    { id: 'low_gi_meal', name: 'Низкий ГИ', icon: '🎯', desc: 'Приём пищи с ГИ < 50', xp: 25, type: 'low_gi', target: 1 }
  ];

  function selectDailyMissions(level) {
    // Выбираем 3 случайные миссии из пула
    const shuffled = [...DAILY_MISSION_POOL].sort(() => Math.random() - 0.5);

    // Для разнообразия берём миссии разных типов
    const selectedTypes = new Set();
    const missions = [];

    for (const mission of shuffled) {
      const baseType = mission.type.split('_')[0]; // water_entries -> water
      if (!selectedTypes.has(baseType) && missions.length < 3) {
        missions.push({
          ...mission,
          completed: false,
          progress: 0
        });
        selectedTypes.add(baseType);
      }
    }

    // Если не набрали 3 разных типа, добавляем оставшиеся
    while (missions.length < 3 && shuffled.length > missions.length) {
      const remaining = shuffled.filter(m => !missions.find(selected => selected.id === m.id));
      if (remaining.length > 0) {
        missions.push({ ...remaining[0], completed: false, progress: 0 });
      } else break;
    }

    return missions;
  }

  function getDailyMissions() {
    const data = loadData();
    const today = getToday();

    // Инициализация или новый день
    if (!data.dailyMissions || data.dailyMissions.date !== today) {
      data.dailyMissions = {
        date: today,
        missions: selectDailyMissions(data.level),
        completedCount: 0
      };
      saveData();
    }

    return {
      date: data.dailyMissions.date,
      missions: data.dailyMissions.missions,
      completedCount: data.dailyMissions.completedCount,
      allCompleted: data.dailyMissions.completedCount >= 3,
      bonusAvailable: data.dailyMissions.completedCount >= 3 && !data.dailyMissions.bonusClaimed
    };
  }

  function updateDailyMission(type, value) {
    const data = loadData();
    const today = getToday();

    if (!data.dailyMissions || data.dailyMissions.date !== today) {
      getDailyMissions(); // Инициализирует
      return;
    }

    let missionCompleted = false;

    for (const mission of data.dailyMissions.missions) {
      if (mission.completed) continue;

      let matches = false;
      let newProgress = mission.progress || 0;

      switch (mission.type) {
        case 'meals':
          if (type === 'product_added') {
            // Считаем уникальные приёмы (проверяем через HEYS.Day)
            const mealsCount = HEYS.Day?.getMealsCount?.() || 0;
            newProgress = mealsCount;
            matches = true;
          }
          break;
        case 'early_meal':
          if (type === 'product_added' && new Date().getHours() < mission.target) {
            newProgress = 1;
            matches = true;
          }
          break;
        case 'products':
          if (type === 'product_added') {
            newProgress = (mission.progress || 0) + 1;
            matches = true;
          }
          break;
        case 'water':
          if (type === 'water_added' && value >= mission.target) {
            newProgress = value;
            matches = true;
          }
          break;
        case 'water_entries':
          if (type === 'water_added') {
            newProgress = (mission.progress || 0) + 1;
            matches = true;
          }
          break;
        case 'training':
          if (type === 'training_added') {
            newProgress = 1;
            matches = true;
          }
          break;
        case 'steps':
          if (type === 'steps_updated' && value >= mission.target) {
            newProgress = value;
            matches = true;
          }
          break;
        case 'weight':
          if (type === 'weight_logged') {
            newProgress = 1;
            matches = true;
          }
          break;
        case 'sleep':
          if (type === 'sleep_logged') {
            newProgress = 1;
            matches = true;
          }
          break;
        case 'fiber':
          if (type === 'product_added') {
            const fiberPct = HEYS.Day?.getFiberPercent?.() || 0;
            if (fiberPct >= mission.target) {
              newProgress = fiberPct;
              matches = true;
            }
          }
          break;
        case 'protein':
          if (type === 'product_added') {
            const proteinPct = HEYS.Day?.getProteinPercent?.() || 0;
            if (proteinPct >= mission.target) {
              newProgress = proteinPct;
              matches = true;
            }
          }
          break;
        case 'balance':
          if (type === 'product_added' && HEYS.Day?.getMacroBalance) {
            const balance = HEYS.Day.getMacroBalance();
            if (balance &&
              balance.protein >= 0.8 && balance.protein <= 1.2 &&
              balance.carbs >= 0.8 && balance.carbs <= 1.2 &&
              balance.fat >= 0.8 && balance.fat <= 1.2) {
              newProgress = 1;
              matches = true;
            }
          }
          break;
        case 'low_gi':
          if (type === 'product_added') {
            const lastMealGI = HEYS.Day?.getLastMealGI?.() || 100;
            if (lastMealGI < 50) {
              newProgress = 1;
              matches = true;
            }
          }
          break;
      }

      if (matches) {
        mission.progress = newProgress;

        // Проверяем выполнение
        if (newProgress >= mission.target && !mission.completed) {
          mission.completed = true;
          data.dailyMissions.completedCount++;
          missionCompleted = true;

          // Начисляем XP за миссию
          _addXPInternal(mission.xp, 'daily_mission');

          showNotification('mission_complete', {
            name: mission.name,
            xp: mission.xp
          });

          // Mission sound
          playMissionSound(false);
        }
      }
    }

    saveData();

    // Проверяем бонус за все 3 миссии
    if (data.dailyMissions.completedCount >= 3 && !data.dailyMissions.bonusClaimed) {
      // Бонус будет доступен для клейма через claimDailyMissionsBonus
    }

    // Dispatch event для UI
    window.dispatchEvent(new CustomEvent('heysDailyMissionsUpdate', {
      detail: getDailyMissions()
    }));

    return missionCompleted;
  }

  function claimDailyMissionsBonus() {
    const data = loadData();
    const today = getToday();

    if (!data.dailyMissions ||
      data.dailyMissions.date !== today ||
      data.dailyMissions.completedCount < 3 ||
      data.dailyMissions.bonusClaimed) {
      return false;
    }

    data.dailyMissions.bonusClaimed = true;
    saveData();
    triggerImmediateSync('daily_missions_bonus');

    // Бонус 50 XP за выполнение всех миссий
    _addXPInternal(50, 'daily_missions_bonus');
    celebrate();

    showNotification('all_missions_complete', { bonus: 50 });

    // All missions sound
    playMissionSound(true);

    return true;
  }

  // ========== WEEKLY CHALLENGE ==========
  function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
    return new Date(now.setDate(diff)).toISOString().slice(0, 10);
  }

  // Получить динамическую норму воды из профиля
  function getWaterGoalForDay() {
    try {
      // Пробуем HEYS.Day.getWaterGoal (если доступен)
      if (typeof HEYS !== 'undefined' && HEYS.Day?.getWaterGoal) {
        return HEYS.Day.getWaterGoal();
      }
      // Fallback: 30мл на кг веса
      const profileStr = readStoredValue('heys_profile', null);
      if (profileStr) {
        const prof = JSON.parse(profileStr);
        return Math.round((prof.weight || 70) * 30);
      }
    } catch (e) { /* ignore */ }
    return 2000; // Default
  }

  // ========== WEEKLY CHALLENGES ==========

  const WEEKLY_CHALLENGE_TYPES = [
    {
      type: 'xp',
      name: 'XP-марафон',
      icon: '⚡',
      description: 'Набери {target} XP за неделю',
      targets: [300, 500, 750, 1000],
      reward: 100,
      check: (data, target) => data.weeklyChallenge.earned >= target
    },
    {
      type: 'meals',
      name: 'Шеф-повар',
      icon: '🍽️',
      description: 'Добавь {target} приёмов пищи',
      targets: [14, 21, 28],
      reward: 75,
      check: (data, target) => (data.weeklyChallenge.mealsCount || 0) >= target
    },
    {
      type: 'water',
      name: 'Аквамен',
      icon: '💧',
      description: 'Выполни норму воды {target} дней',
      targets: [3, 5, 7],
      reward: 80,
      check: (data, target) => (data.weeklyChallenge.waterDays || 0) >= target
    },
    {
      type: 'training',
      name: 'Атлет',
      icon: '💪',
      description: 'Запиши {target} тренировок',
      targets: [2, 3, 5],
      reward: 90,
      check: (data, target) => (data.weeklyChallenge.trainingsCount || 0) >= target
    },
    {
      type: 'perfect_days',
      name: 'Перфекционист',
      icon: '⭐',
      description: 'Идеальный день {target} раз',
      targets: [2, 3, 5],
      reward: 120,
      check: (data, target) => (data.weeklyChallenge.perfectDays || 0) >= target
    },
    {
      type: 'streak',
      name: 'Без пропусков',
      icon: '🔥',
      description: 'Поддерживай streak {target} дней',
      targets: [3, 5, 7],
      reward: 100,
      check: (data, target) => {
        const streak = safeGetStreak();
        return streak >= target;
      }
    },
    {
      type: 'early_bird',
      name: 'Ранняя пташка',
      icon: '🌅',
      description: 'Завтрак до 9:00 — {target} дней',
      targets: [3, 5, 7],
      reward: 85,
      check: (data, target) => (data.weeklyChallenge.earlyBirdDays || 0) >= target
    }
  ];

  function selectWeeklyChallenge(level) {
    // Выбираем случайный тип челленджа
    const randomType = WEEKLY_CHALLENGE_TYPES[Math.floor(Math.random() * WEEKLY_CHALLENGE_TYPES.length)];

    // Сложность зависит от уровня: низкий уровень — лёгкие таргеты
    let targetIndex = 0;
    if (level >= 10) targetIndex = 1;
    if (level >= 20) targetIndex = 2;
    if (level >= 30) targetIndex = 3;

    // Не превышаем доступные таргеты
    targetIndex = Math.min(targetIndex, randomType.targets.length - 1);

    return {
      type: randomType.type,
      name: randomType.name,
      icon: randomType.icon,
      description: randomType.description.replace('{target}', randomType.targets[targetIndex]),
      target: randomType.targets[targetIndex],
      reward: randomType.reward,
      earned: 0,
      // Счётчики для разных типов
      mealsCount: 0,
      waterDays: 0,
      trainingsCount: 0,
      perfectDays: 0,
      earlyBirdDays: 0
    };
  }

  function getWeeklyChallenge() {
    const data = loadData();
    const currentWeek = getWeekStart();

    // Миграция: если weeklyChallenge нет или старого формата
    if (!data.weeklyChallenge || !data.weeklyChallenge.type) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        ...selectWeeklyChallenge(data.level)
      };
      saveData();
    }

    // Новая неделя — новый челлендж
    if (data.weeklyChallenge.weekStart !== currentWeek) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        ...selectWeeklyChallenge(data.level)
      };
      saveData();
    }

    // Проверяем выполнение
    const challengeType = WEEKLY_CHALLENGE_TYPES.find(t => t.type === data.weeklyChallenge.type);
    const isCompleted = challengeType?.check(data, data.weeklyChallenge.target) || false;

    // Для XP типа — earned это XP, для остальных — считаем прогресс
    let current = 0;
    let unit = '';
    switch (data.weeklyChallenge.type) {
      case 'xp':
        current = data.weeklyChallenge.earned || 0;
        unit = ' XP';
        break;
      case 'meals':
        current = data.weeklyChallenge.mealsCount || 0;
        unit = '';
        break;
      case 'water':
        current = data.weeklyChallenge.waterDays || 0;
        unit = ' дн';
        break;
      case 'training':
        current = data.weeklyChallenge.trainingsCount || 0;
        unit = '';
        break;
      case 'perfect_days':
        current = data.weeklyChallenge.perfectDays || 0;
        unit = ' дн';
        break;
      case 'streak':
        current = safeGetStreak();
        unit = ' дн';
        break;
      case 'early_bird':
        current = data.weeklyChallenge.earlyBirdDays || 0;
        unit = ' дн';
        break;
      default:
        current = data.weeklyChallenge.earned || 0;
        unit = '';
    }

    // Форматируем description с target
    const description = challengeType?.description?.replace('{target}', data.weeklyChallenge.target) || '';

    return {
      ...data.weeklyChallenge,
      current,
      percent: Math.min(100, Math.round((current / data.weeklyChallenge.target) * 100)),
      completed: isCompleted,
      // Добавляем UI данные
      title: challengeType?.name || 'Недельный челлендж',
      description: description,
      icon: challengeType?.icon || '🎯',
      unit: unit,
      reward: challengeType?.reward || 100
    };
  }

  function updateWeeklyProgress(reason, extraData = {}) {
    const data = loadData();
    const currentWeek = getWeekStart();

    // Миграция
    if (!data.weeklyChallenge || !data.weeklyChallenge.type) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        ...selectWeeklyChallenge(data.level)
      };
    }

    if (data.weeklyChallenge.weekStart !== currentWeek) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        ...selectWeeklyChallenge(data.level)
      };
    }

    const wasCompleted = getWeeklyChallenge().completed;

    // Обновляем счётчики в зависимости от действия
    switch (reason) {
      case 'product_added':
        data.weeklyChallenge.mealsCount = (data.weeklyChallenge.mealsCount || 0) + 1;
        // Early bird check
        if (new Date().getHours() < 9) {
          const today = getToday();
          if (!data.weeklyChallenge.earlyBirdToday || data.weeklyChallenge.earlyBirdToday !== today) {
            data.weeklyChallenge.earlyBirdDays = (data.weeklyChallenge.earlyBirdDays || 0) + 1;
            data.weeklyChallenge.earlyBirdToday = today;
          }
        }
        break;
      case 'water_added':
        // Проверяем выполнение нормы воды
        if (extraData.waterPercent >= 100) {
          const today = getToday();
          if (!data.weeklyChallenge.waterToday || data.weeklyChallenge.waterToday !== today) {
            data.weeklyChallenge.waterDays = (data.weeklyChallenge.waterDays || 0) + 1;
            data.weeklyChallenge.waterToday = today;
          }
        }
        break;
      case 'training_added':
        data.weeklyChallenge.trainingsCount = (data.weeklyChallenge.trainingsCount || 0) + 1;
        break;
      case 'perfect_day':
        data.weeklyChallenge.perfectDays = (data.weeklyChallenge.perfectDays || 0) + 1;
        break;
    }

    saveData();

    // Проверяем завершение
    const challenge = getWeeklyChallenge();
    if (!wasCompleted && challenge.completed) {
      showNotification('weekly_complete', {
        name: challenge.name,
        reward: challenge.reward
      });
      // Бонус за выполнение
      const oldLevel = data.level;
      data.totalXP += challenge.reward;
      data.level = calculateLevel(data.totalXP);
      handleRankTransition(oldLevel, data.level);
      saveData();
      celebrate();

      window.dispatchEvent(new CustomEvent('heysWeeklyChallengeComplete', {
        detail: {
          challenge: { ...challenge },
          reward: challenge.reward
        }
      }));
    }
  }

  function addWeeklyXP(xp) {
    const data = loadData();
    const currentWeek = getWeekStart();

    // Миграция
    if (!data.weeklyChallenge || !data.weeklyChallenge.type) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        ...selectWeeklyChallenge(data.level)
      };
    }

    if (data.weeklyChallenge.weekStart !== currentWeek) {
      data.weeklyChallenge = {
        weekStart: currentWeek,
        ...selectWeeklyChallenge(data.level)
      };
    }

    // Добавляем XP для XP-типа челленджа
    data.weeklyChallenge.earned = (data.weeklyChallenge.earned || 0) + xp;
    saveData();

    // Проверка выполнения для XP-типа
    if (data.weeklyChallenge.type === 'xp') {
      const challenge = getWeeklyChallenge();
      if (challenge.completed && !data.weeklyChallenge.rewarded) {
        data.weeklyChallenge.rewarded = true;
        showNotification('weekly_complete', {
          name: challenge.name,
          reward: challenge.reward
        });
        const oldLevel = data.level;
        data.totalXP += challenge.reward;
        data.level = calculateLevel(data.totalXP);
        handleRankTransition(oldLevel, data.level);
        saveData();
        celebrate();

        window.dispatchEvent(new CustomEvent('heysWeeklyChallengeComplete', {
          detail: {
            challenge: { ...challenge },
            reward: challenge.reward
          }
        }));
      }
    }
  }

  // ========== XP SOUND (Web Audio API) ==========
  let audioContext = null;

  // 🔊 Sound settings (can be disabled in profile)
  const SOUND_SETTINGS = {
    enabled: true, // Default: sounds enabled
    volume: 0.15,  // Default volume
  };

  // Load sound settings from localStorage
  // Синхронизируем с глобальной настройкой soundEnabled из профиля
  function loadSoundSettings() {
    try {
      // Проверяем глобальную настройку профиля (приоритет)
      const globalSettings = readStoredValue('heys_settings', null);
      if (globalSettings) {
        const parsed = typeof globalSettings === 'string' ? JSON.parse(globalSettings) : globalSettings;
        if (parsed.soundEnabled === false) {
          SOUND_SETTINGS.enabled = false;
          return SOUND_SETTINGS;
        }
      }
      // Fallback: локальные настройки геймификации
      const saved = readStoredValue('heys_sound_settings', null);
      if (saved) {
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        SOUND_SETTINGS.enabled = parsed.enabled !== false;
        SOUND_SETTINGS.volume = typeof parsed.volume === 'number' ? parsed.volume : 0.15;
      }
    } catch (e) { /* ignore */ }
    return SOUND_SETTINGS;
  }

  // Save sound settings
  function saveSoundSettings(settings) {
    Object.assign(SOUND_SETTINGS, settings);
    setStoredValue('heys_sound_settings', SOUND_SETTINGS);
  }

  function playXPSound(isLevelUp = false) {
    // Check if sounds are enabled
    loadSoundSettings();
    if (!SOUND_SETTINGS.enabled) return;

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      const volume = SOUND_SETTINGS.volume;

      if (isLevelUp) {
        // Level up — мелодия из 3 нот (восходящая)
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
      } else {
        // Обычный XP — короткий "пинг"
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(volume * 0.7, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
      }
    } catch (e) {
      // Ignore audio errors
    }
  }

  // 🎵 Achievement sound (special fanfare)
  function playAchievementSound() {
    loadSoundSettings();
    if (!SOUND_SETTINGS.enabled) return;

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const volume = SOUND_SETTINGS.volume;

      // Achievement fanfare — ascending chord
      const notes = [
        { freq: 523.25, time: 0 },      // C5
        { freq: 659.25, time: 0.08 },   // E5
        { freq: 783.99, time: 0.16 },   // G5
        { freq: 1046.5, time: 0.24 },   // C6
      ];

      notes.forEach(({ freq, time }) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = freq;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(volume * 0.8, audioContext.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.3);
        osc.start(audioContext.currentTime + time);
        osc.stop(audioContext.currentTime + time + 0.3);
      });
    } catch (e) {
      // Ignore audio errors
    }
  }

  // 🏆 Rank ceremony sound (longer, more epic)
  function playRankCeremonySound() {
    loadSoundSettings();
    if (!SOUND_SETTINGS.enabled) return;

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const volume = SOUND_SETTINGS.volume;
      const notes = [
        { freq: 392.0, time: 0.0 },   // G4
        { freq: 523.25, time: 0.1 },  // C5
        { freq: 659.25, time: 0.22 }, // E5
        { freq: 783.99, time: 0.36 }, // G5
        { freq: 1046.5, time: 0.5 }   // C6
      ];

      notes.forEach(({ freq, time }) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(volume * 0.9, audioContext.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.45);
        osc.start(audioContext.currentTime + time);
        osc.stop(audioContext.currentTime + time + 0.45);
      });
    } catch (e) {
      // Ignore audio errors
    }
  }

  // ========== LOTTIE LOADER ==========
  let _lottieLoadPromise = null;

  function loadLottie() {
    if (window.lottie) return Promise.resolve(true);
    if (_lottieLoadPromise) return _lottieLoadPromise;

    _lottieLoadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return _lottieLoadPromise;
  }

  // ========== RANK CEREMONY ==========
  let _activeRankCeremony = null;

  function showRankCeremony(payload) {
    if (!payload) return;

    const existing = document.querySelector('.rank-ceremony');
    if (existing) existing.remove();

    const ceremony = document.createElement('div');
    ceremony.className = 'rank-ceremony';
    ceremony.setAttribute('role', 'dialog');
    ceremony.setAttribute('aria-live', 'polite');

    const panel = document.createElement('div');
    panel.className = 'rank-ceremony__panel';

    const lottieWrap = document.createElement('div');
    lottieWrap.className = 'rank-ceremony__lottie';

    const title = document.createElement('div');
    title.className = 'rank-ceremony__title';
    title.textContent = 'Новый ранг!';

    const subtitle = document.createElement('div');
    subtitle.className = 'rank-ceremony__subtitle';
    subtitle.textContent = `${payload.toTitle.icon} ${payload.toTitle.title}`;

    const rankLine = document.createElement('div');
    rankLine.className = 'rank-ceremony__rankline';
    rankLine.innerHTML = `
      <span class="rank-ceremony__rank">${payload.fromTitle.icon} ${payload.fromTitle.title}</span>
      <span class="rank-ceremony__arrow">→</span>
      <span class="rank-ceremony__rank">${payload.toTitle.icon} ${payload.toTitle.title}</span>
    `;

    const hint = document.createElement('div');
    hint.className = 'rank-ceremony__hint';
    hint.textContent = 'Продолжай — следующие уровни уже ждут.';

    const button = document.createElement('button');
    button.className = 'rank-ceremony__btn';
    button.type = 'button';
    button.textContent = 'Круто!';

    panel.appendChild(lottieWrap);
    panel.appendChild(title);
    panel.appendChild(subtitle);
    panel.appendChild(rankLine);
    panel.appendChild(hint);
    panel.appendChild(button);
    ceremony.appendChild(panel);

    const removeCeremony = () => {
      ceremony.classList.add('rank-ceremony--hide');
      setTimeout(() => ceremony.remove(), 250);
      _activeRankCeremony = null;
    };

    button.addEventListener('click', removeCeremony);
    ceremony.addEventListener('click', (e) => {
      if (e.target === ceremony) removeCeremony();
    });

    document.body.appendChild(ceremony);

    _activeRankCeremony = { el: ceremony, remove: removeCeremony };

    loadLottie().then((loaded) => {
      if (!loaded || !window.lottie || !document.body.contains(ceremony)) return;

      window.lottie.loadAnimation({
        container: lottieWrap,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'assets/lottie/level-up-ceremony.json'
      });
    });

    setTimeout(removeCeremony, 6000);
  }

  function handleRankTransition(oldLevel, newLevel) {
    if (newLevel <= oldLevel) return;

    const fromTitle = getLevelTitle(oldLevel);
    const toTitle = getLevelTitle(newLevel);

    if (fromTitle.title === toTitle.title) return;

    playRankCeremonySound();
    showRankCeremony({ fromTitle, toTitle });
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

  function dispatchXpGainedEvent(xpAmount, sourceEl) {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (sourceEl && sourceEl.getBoundingClientRect) {
      const rect = sourceEl.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }

    window.dispatchEvent(new CustomEvent('heysXpGained', {
      detail: { xp: xpAmount, x, y }
    }));
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

  function celebrate(payload = null) {
    window.dispatchEvent(new CustomEvent('heysCelebrate', {
      detail: payload || undefined
    }));
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

      const dayData = readStoredValue(`heys_dayv2_${dateStr}`, null);

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

    // 🔍 DEBUG LOGGING
    const DEBUG = readStoredValue('heys_debug_gamification', null) === 'true';
    if (DEBUG) {
      console.log('[🎮 Gamification] checkAchievements called:', {
        reason,
        level: data.level,
        totalXP: data.totalXP,
        unlockedCount: data.unlockedAchievements?.length || 0,
        unlocked: data.unlockedAchievements
      });
    }

    // ========== STREAK ACHIEVEMENTS ==========
    const streak = safeGetStreak();

    if (DEBUG) {
      console.log('[🎮 Gamification] Streak check:', { streak });
    }

    newAchievements.push(...checkStreakAchievements(streak, { skipUnlock: true }));

    // ========== FIRST ACTIONS ==========
    if (reason === 'checkin_complete' && !data.unlockedAchievements.includes('first_checkin')) {
      newAchievements.push('first_checkin');
    }
    if (reason === 'meal_added' && !data.unlockedAchievements.includes('first_meal')) {
      newAchievements.push('first_meal');
    }
    if (reason === 'product_added' && !data.unlockedAchievements.includes('first_product')) {
      newAchievements.push('first_product');
    }
    if (reason === 'steps_updated' && !data.unlockedAchievements.includes('first_steps')) {
      newAchievements.push('first_steps');
    }
    if (reason === 'advice_read' && !data.unlockedAchievements.includes('first_advice')) {
      newAchievements.push('first_advice');
    }
    if (reason === 'supplements_taken' && !data.unlockedAchievements.includes('first_supplements')) {
      newAchievements.push('first_supplements');
    }
    if (reason === 'water_added' && !data.unlockedAchievements.includes('first_water')) {
      newAchievements.push('first_water');
    }
    if (reason === 'training_added' && !data.unlockedAchievements.includes('first_training')) {
      newAchievements.push('first_training');
    }
    if (reason === 'household_added' && !data.unlockedAchievements.includes('first_household')) {
      newAchievements.push('first_household');
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
        // Динамическая норма из профиля или fallback 2000мл
        const waterGoal = getWaterGoalForDay() || 2000;
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
    if (DEBUG && newAchievements.length > 0) {
      console.log('[🎮 Gamification] New achievements to unlock:', newAchievements);
    }
    for (const achId of newAchievements) {
      unlockAchievement(achId);
    }

    return newAchievements;
  }

  function checkStreakAchievements(streakValue, options = {}) {
    const data = loadData();
    const streak = typeof streakValue === 'number' ? streakValue : safeGetStreak();
    const { skipUnlock = false } = options;

    const streakMilestones = [
      { days: 1, id: 'streak_1' },
      { days: 2, id: 'streak_2' },
      { days: 3, id: 'streak_3' },
      { days: 5, id: 'streak_5' },
      { days: 7, id: 'streak_7' }
    ];

    const newly = [];
    for (const m of streakMilestones) {
      if (streak >= m.days && !data.unlockedAchievements.includes(m.id)) {
        newly.push(m.id);
      }
      if (!data.unlockedAchievements.includes(m.id)) {
        updateAchievementProgress(m.id, streak, m.days);
      }
    }

    if (!skipUnlock) {
      newly.forEach((id) => unlockAchievement(id));
    }

    return newly;
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
    const oldLevel = data.level;
    data.totalXP += ach.xp;
    data.level = calculateLevel(data.totalXP);
    handleRankTransition(oldLevel, data.level);
    saveData();
    triggerImmediateSync('achievement_unlocked');

    const hasCategoryUnlocked = data.unlockedAchievements
      .map((id) => ACHIEVEMENTS[id])
      .filter(Boolean)
      .some((item) => item.category === ach.category);

    // Показываем notification (React компонент .game-notification)
    // NOTE: showAchievementToast убран — был дубль с showNotification
    showNotification('achievement', {
      achievement: ach,
      totalXP: data.totalXP,
      level: data.level,
      firstInCategory: !hasCategoryUnlocked
    });

    // Звук при получении достижения!
    playXPSound(true); // Level-up мелодия для достижений

    // Confetti для rare+ достижений
    if (['rare', 'epic', 'legendary', 'mythic'].includes(ach.rarity)) {
      celebrate({ type: 'achievement', rarity: ach.rarity });
    }

    // Haptic по редкости
    if (HEYS.haptic) {
      const hapticByRarity = {
        common: 'light',
        rare: 'medium',
        epic: 'medium',
        legendary: 'success',
        mythic: 'success'
      };
      HEYS.haptic(hapticByRarity[ach.rarity] || 'light');
    }
  }

  // ========== CORE API ==========

  const game = {
    /**
     * Добавить XP
     * @param {number} amount - количество XP (или 0 для авто из XP_ACTIONS)
     * @param {string} reason - причина (из XP_ACTIONS)
     * @param {HTMLElement} sourceEl - элемент-источник для flying animation
     */
    addXP(amount, reason, sourceEl, extraData) {
      // Debounce
      if (_debounceTimer) clearTimeout(_debounceTimer);

      _debounceTimer = setTimeout(() => {
        _addXPInternal(amount, reason, sourceEl, extraData);
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
        unlockAchievement('metabolic_stable');
      }

      // low_risk_master: низкий риск 14 дней
      if (data.lowRiskDaysCount >= 14 && !this.isAchievementUnlocked('low_risk_master')) {
        unlockAchievement('low_risk_master');
      }

      // phenotype_discovered: фенотип определён с confidence ≥70%
      if (phenotype?.confidence >= 70 && !this.isAchievementUnlocked('phenotype_discovered')) {
        unlockAchievement('phenotype_discovered');
      }

      // weekly_wrap_viewed: 4 просмотра отчётов
      const wrapViewCount = readStoredValue('heys_weekly_wrap_view_count', 0) || 0;
      if (wrapViewCount >= 4 && !this.isAchievementUnlocked('weekly_wrap_viewed')) {
        unlockAchievement('weekly_wrap_viewed');
      }
    },

    /**
     * 🛡️ Проверка crash_avoided — риск был высокий, но день успешный
     */
    checkCrashAvoided(hadHighRisk, daySuccessful) {
      if (hadHighRisk && daySuccessful && !this.isAchievementUnlocked('crash_avoided')) {
        unlockAchievement('crash_avoided');
      }
    },

    /**
     * 📊 Инкремент просмотров Weekly Wrap
     */
    incrementWeeklyWrapViews() {
      const count = (readStoredValue('heys_weekly_wrap_view_count', 0) || 0) + 1;
      setStoredValue('heys_weekly_wrap_view_count', count);
      return count;
    },

    // Сброс данных (для тестирования)
    reset() {
      _data = createDefaultData();
      saveData();
      window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: this.getStats() }));
    },

    /**
     * 🔄 Ретроактивная проверка пропущенных достижений
     * Вызывать при загрузке приложения для исправления багов
     */
    async recalculateAchievements() {
      const data = loadData();
      const migrationKey = 'heys_achievements_v4_migrated';

      // Проверяем, была ли миграция
      if (readStoredValue(migrationKey, null) === 'true') {
        return [];
      }

      console.log('[🎮 Gamification] Recalculating missed achievements...');
      const missedAchievements = [];

      // Получаем историю
      const streak = safeGetStreak();
      const stats = data.stats || {};

      // === STREAK ACHIEVEMENTS ===
      const streakMilestones = [
        { days: 1, id: 'streak_1' },
        { days: 2, id: 'streak_2' },
        { days: 3, id: 'streak_3' },
        { days: 5, id: 'streak_5' },
        { days: 7, id: 'streak_7' }
      ];

      for (const m of streakMilestones) {
        if (streak >= m.days && !data.unlockedAchievements.includes(m.id)) {
          data.unlockedAchievements.push(m.id);
          data.totalXP += ACHIEVEMENTS[m.id].xp;
          missedAchievements.push(m.id);
        }
      }

      // === LEVEL ACHIEVEMENTS ===
      const levelMilestones = [5, 10, 15, 20, 25];
      for (const lvl of levelMilestones) {
        const achId = `level_${lvl}`;
        if (data.level >= lvl && !data.unlockedAchievements.includes(achId)) {
          data.unlockedAchievements.push(achId);
          data.totalXP += ACHIEVEMENTS[achId].xp;
          missedAchievements.push(achId);
        }
      }

      // === ONBOARDING (check stats) ===
      const todayKey = `heys_dayv2_${today}`; // 🔥 Фикс: явно используем переменную today из контекста 
      const todayDay = readStoredValue(todayKey, null);
      const mealsCount = HEYS.Day?.getMealsCount?.() || (todayDay?.meals?.length || 0);
      const stepsValue = (todayDay?.steps || 0) || (HEYS.Day?.getDay?.()?.steps || 0);
      const advicesRead = stats.totalAdvicesRead || 0;

      let hasCheckin = false;
      let hasSupplements = false;
      let hasHousehold = false;

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.includes('_dayv2_')) continue;
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          let parsed = null;
          try {
            parsed = raw.startsWith('¤Z¤') && HEYS.store?.decompress
              ? HEYS.store.decompress(raw.slice(3))
              : JSON.parse(raw);
          } catch (e) {
            continue;
          }
          if (parsed) {
            if (!hasCheckin && (parsed.weightMorning != null || parsed.sleepStart || parsed.sleepEnd || parsed.morningMood != null)) {
              hasCheckin = true;
            }
            if (!hasSupplements && Array.isArray(parsed.supplementsTaken) && parsed.supplementsTaken.length > 0) {
              hasSupplements = true;
            }
            if (!hasHousehold && (parsed.householdMin > 0 || (Array.isArray(parsed.householdActivities) && parsed.householdActivities.length > 0))) {
              hasHousehold = true;
            }
          }
          if (hasCheckin && hasSupplements && hasHousehold) break;
        }
      } catch (e) { }

      if (hasCheckin && !data.unlockedAchievements.includes('first_checkin')) {
        data.unlockedAchievements.push('first_checkin');
        data.totalXP += ACHIEVEMENTS.first_checkin.xp;
        missedAchievements.push('first_checkin');
      }

      if (stats.totalProducts > 0 && !data.unlockedAchievements.includes('first_product')) {
        data.unlockedAchievements.push('first_product');
        data.totalXP += ACHIEVEMENTS.first_product.xp;
        missedAchievements.push('first_product');
      }

      if (mealsCount > 0 && !data.unlockedAchievements.includes('first_meal')) {
        data.unlockedAchievements.push('first_meal');
        data.totalXP += ACHIEVEMENTS.first_meal.xp;
        missedAchievements.push('first_meal');
      }

      if (stepsValue > 0 && !data.unlockedAchievements.includes('first_steps')) {
        data.unlockedAchievements.push('first_steps');
        data.totalXP += ACHIEVEMENTS.first_steps.xp;
        missedAchievements.push('first_steps');
      }

      if (advicesRead > 0 && !data.unlockedAchievements.includes('first_advice')) {
        data.unlockedAchievements.push('first_advice');
        data.totalXP += ACHIEVEMENTS.first_advice.xp;
        missedAchievements.push('first_advice');
      }

      if (hasSupplements && !data.unlockedAchievements.includes('first_supplements')) {
        data.unlockedAchievements.push('first_supplements');
        data.totalXP += ACHIEVEMENTS.first_supplements.xp;
        missedAchievements.push('first_supplements');
      }

      if (hasHousehold && !data.unlockedAchievements.includes('first_household')) {
        data.unlockedAchievements.push('first_household');
        data.totalXP += ACHIEVEMENTS.first_household.xp;
        missedAchievements.push('first_household');
      }

      // Сохраняем если нашли пропущенные
      if (missedAchievements.length > 0) {
        data.level = calculateLevel(data.totalXP);
        saveData();
        triggerImmediateSync('achievement_unlocked'); // 🔥 Сразу в облако

        console.log('[🎮 Gamification] Found missed achievements:', missedAchievements);

        // Показываем уведомление
        this.showMissedAchievementsNotification(missedAchievements);
      }

      // Помечаем миграцию как выполненную
      setStoredValue(migrationKey, 'true');

      return missedAchievements;
    },

    /**
     * 🎉 Показать уведомление о найденных пропущенных достижениях
     */
    showMissedAchievementsNotification(achievementIds) {
      if (!achievementIds || achievementIds.length === 0) return;

      const achievements = achievementIds.map(id => ACHIEVEMENTS[id]).filter(Boolean);
      const totalXP = achievements.reduce((sum, a) => sum + a.xp, 0);

      // Используем существующую систему уведомлений
      showNotification('missed_achievements', {
        count: achievements.length,
        achievements,
        totalXP,
        title: '🎉 Мы нашли ваши достижения!',
        message: `Из-за технической ошибки вы не получили ${achievements.length} достижений. Исправлено! +${totalXP} XP`
      });

      // Confetti для празднования
      if (achievements.length >= 2) {
        celebrate();
      }
    },

    /**
     * ☁️ Синхронизация прогресса с облаком
     * 🛡️ ЗАЩИТА: Не перезаписывает облако если там больше XP
     */
    async syncToCloud() {
      try {
        // 🔄 Получаем токен сессии — проверяем оба варианта
        const sessionToken = HEYS.cloud?.getSessionToken?.() ||
          localStorage.getItem('heys_session_token');

        if (!HEYS.YandexAPI || !sessionToken) {
          return false;
        }

        const data = loadData();

        // 🛡️ Не синхронизируем пустые данные в облако
        if (!data.totalXP || data.totalXP === 0) {
          console.log('[🎮 Gamification] Skip cloud sync — no XP data');
          return false;
        }

        // 🛡️ ЗАЩИТА v2.1: Сначала проверяем облако — не перезаписываем если там новее/больше
        try {
          const cloudResult = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
            session_token: sessionToken,
            k: STORAGE_KEY
          });
          const cloudData_ = cloudResult?.v || {};
          const cloudXP = cloudData_.totalXP || 0;
          const cloudUpdatedAt = cloudData_.updatedAt || 0;

          // 🛡️ v2.2: Проверка "качества" данных — не перезаписывать богатые данные бедными
          const cloudAchievements = Array.isArray(cloudData_.unlockedAchievements) ? cloudData_.unlockedAchievements.length : 0;
          const localAchievements = Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements.length : 0;
          const cloudStatsCount = Object.keys(cloudData_.stats || {}).filter(k => cloudData_.stats[k] > 0).length;
          const localStatsCount = Object.keys(data.stats || {}).filter(k => data.stats[k] > 0).length;
          const cloudDailyXPCount = Object.keys(cloudData_.dailyXP || {}).length;
          const localDailyXPCount = Object.keys(data.dailyXP || {}).length;

          // Облако "богаче" если: больше XP ИЛИ (XP равен И больше деталей)
          const cloudIsRicher = cloudXP > data.totalXP || (
            cloudXP === data.totalXP && (
              cloudAchievements > localAchievements ||
              cloudStatsCount > localStatsCount ||
              cloudDailyXPCount > localDailyXPCount
            )
          );

          if (cloudXP > data.totalXP) {
            console.warn(`[🎮 Gamification] BLOCKED: cloud XP (${cloudXP}) > local (${data.totalXP}), not overwriting!`);
            // Вместо этого — загружаем из облака
            await HEYS.game.loadFromCloud();
            return false;
          }

          // 🛡️ v2.2: Блокируем если облако богаче деталями при равном XP
          if (cloudXP === data.totalXP && cloudIsRicher) {
            console.warn(`[🎮 Gamification] BLOCKED: cloud has richer data (achievements: ${cloudAchievements} vs ${localAchievements}, stats: ${cloudStatsCount} vs ${localStatsCount})`);
            await HEYS.game.loadFromCloud();
            return false;
          }

          if (cloudUpdatedAt && data.updatedAt && cloudUpdatedAt > data.updatedAt) {
            console.warn('[🎮 Gamification] BLOCKED: cloud data is newer, loading instead');
            await HEYS.game.loadFromCloud();
            return false;
          }
        } catch (checkErr) {
          // Если не удалось проверить — продолжаем синхронизацию (лучше чем ничего)
          console.warn('[🎮 Gamification] Cloud check failed, proceeding:', checkErr.message);
        }

        const cloudData = {
          version: DATA_VERSION,
          totalXP: data.totalXP,
          level: data.level,
          unlockedAchievements: data.unlockedAchievements,
          achievementProgress: data.achievementProgress,
          dailyXP: data.dailyXP,
          dailyBonusClaimed: data.dailyBonusClaimed,
          dailyActions: data.dailyActions,
          dailyMissions: data.dailyMissions,
          weeklyChallenge: data.weeklyChallenge,
          weeklyTrainings: data.weeklyTrainings,
          earlyBirdDays: data.earlyBirdDays,
          streakShieldUsed: data.streakShieldUsed,
          stats: data.stats,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt || Date.now(),
          lastUpdated: new Date().toISOString()
        };

        // Сохраняем в ОСНОВНОЙ ключ heys_game (совместимость с sync защитой)
        await HEYS.YandexAPI.rpc('upsert_client_kv_by_session', {
          session_token: sessionToken,
          k: STORAGE_KEY, // 'heys_game'
          v: cloudData    // Отправляем объект, не JSON.stringify
        });

        console.log('[🎮 Gamification] Synced to cloud: XP=' + data.totalXP + ', level=' + data.level);
        return true;
      } catch (e) {
        console.warn('[🎮 Gamification] Cloud sync failed:', e.message);
        return false;
      }
    },

    /**
     * ☁️ Загрузка прогресса из облака
     */
    async loadFromCloud() {
      try {
        // 🔄 Получаем токен сессии — проверяем оба варианта
        const sessionToken = HEYS.cloud?.getSessionToken?.() ||
          localStorage.getItem('heys_session_token');

        if (!HEYS.YandexAPI || !sessionToken) {
          console.log('[🎮 Gamification] loadFromCloud: no API or session token');
          _cloudLoaded = true; // Помечаем как загружено даже если нет токена
          if (_pendingCloudSync) {
            _pendingCloudSync = false;
            triggerImmediateSync('pending_sync');
          }
          return false;
        }

        console.log('[🎮 Gamification] loadFromCloud: fetching from cloud...');

        // Пробуем оба ключа: новый (heys_game) и старый (heys_gamification)
        let cloudData = null;

        // 1. Новый ключ
        const result1 = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
          session_token: sessionToken,
          k: STORAGE_KEY // 'heys_game'
        });

        if (result1?.v) {
          cloudData = typeof result1.v === 'string' ? JSON.parse(result1.v) : result1.v;
        }

        // 2. Старый ключ (fallback)
        if (!cloudData || !cloudData.totalXP) {
          const result2 = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
            session_token: sessionToken,
            k: 'heys_gamification'
          });
          if (result2?.v) {
            const legacyData = typeof result2.v === 'string' ? JSON.parse(result2.v) : result2.v;
            if (legacyData?.totalXP > (cloudData?.totalXP || 0)) {
              cloudData = legacyData;
              console.log('[🎮 Gamification] Found data in legacy key heys_gamification');
            }
          }
        }

        // 🛡️ Помечаем что облако проверено
        _cloudLoaded = true;
        if (_pendingCloudSync) {
          _pendingCloudSync = false;
          triggerImmediateSync('pending_sync');
        }

        if (cloudData && cloudData.totalXP) {
          const localData = loadData();
          const merged = mergeGameData(localData, cloudData);

          _data = merged;
          setStoredValue(STORAGE_KEY, _data);
          _cloudLoaded = true;

          window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: game.getStats() }));

          return true;
        }
        return false;
      } catch (e) {
        _cloudLoaded = true; // Помечаем даже при ошибке
        if (_pendingCloudSync) {
          _pendingCloudSync = false;
          triggerImmediateSync('pending_sync');
        }
        console.warn('[🎮 Gamification] Cloud load failed:', e.message);
        return false;
      }
    },

    // Константы для UI
    ACHIEVEMENTS,
    ACHIEVEMENT_CATEGORIES,
    RARITY_COLORS,
    LEVEL_TITLES,
    XP_ACTIONS,
    RANK_BADGES,

    // 🔊 Sound settings API
    getSoundSettings: loadSoundSettings,
    setSoundSettings: saveSoundSettings,

    // 📊 Achievement progress API
    getAchievementProgress(achId) {
      const data = loadData();
      return data.achievementProgress?.[achId] || null;
    },

    getAllAchievementProgress() {
      const data = loadData();
      return data.achievementProgress || {};
    },

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
    updateWeeklyProgress,
    WEEKLY_CHALLENGE_TYPES,

    // Daily Missions
    getDailyMissions,
    updateDailyMission,
    claimDailyMissionsBonus,
    DAILY_MISSION_POOL,

    // Achievement Progress (используем функцию напрямую)
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

      return achievements.sort((a, b) => b.progress.percent - a.progress.percent);
    },

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
    getLevelUpPreview,

    // Streak achievements
    checkStreakAchievements
  };

  // ========== INTERNAL ==========

  function _addXPInternal(amount, reason, sourceEl, extraData) {
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
    const useReactXPFX = HEYS.game?.useReactXPFX === true;

    dispatchXpGainedEvent(xpToAdd, sourceEl);

    if (!useReactXPFX) {
      showFloatingXP(sourceEl, xpToAdd, hasBonus);
    }

    const oldLevel = data.level;
    const oldProgress = game.getProgress();
    data.totalXP += xpToAdd;
    data.level = calculateLevel(data.totalXP);

    // Обновляем stats
    if (reason === 'product_added') data.stats.totalProducts++;
    if (reason === 'water_added') data.stats.totalWater++;
    if (reason === 'training_added') data.stats.totalTrainings++;
    if (reason === 'perfect_day') data.stats.perfectDays++;

    // Best streak
    const streak = safeGetStreak();
    if (streak > data.stats.bestStreak) {
      data.stats.bestStreak = streak;
    }

    // Weekly challenge tracking
    addWeeklyXP(xpToAdd);

    // Update weekly progress for specific actions
    if (['product_added', 'water_added', 'training_added', 'perfect_day'].includes(reason)) {
      updateWeeklyProgress(reason, { waterPercent: HEYS.Day?.getWaterPercent?.() || 0 });
    }

    // Update daily missions
    if (reason !== 'daily_mission' && reason !== 'daily_missions_bonus') {
      let missionValue = 0;
      if (reason === 'water_added') {
        missionValue = HEYS.Day?.getWaterPercent?.() || 0;
      }
      if (reason === 'steps_updated') {
        missionValue = extraData?.steps || 0;
      }
      updateDailyMission(reason, missionValue);
    }

    saveData();
    triggerImmediateSync('xp_gain');

    // Haptic
    if (HEYS.haptic) HEYS.haptic('light');

    // Flying animation
    if (!useReactXPFX) {
      flyToBar(sourceEl, xpToAdd);
    }

    // XP Sound
    playXPSound(false);

    const newProgress = game.getProgress();
    if (oldLevel === data.level) {
      const thresholds = [25, 50, 75];
      const crossed = thresholds.filter((t) => oldProgress.percent < t && newProgress.percent >= t);
      if (crossed.length > 0) {
        const milestone = crossed[crossed.length - 1];
        if (HEYS.haptic) HEYS.haptic('light');
        window.dispatchEvent(new CustomEvent('heysProgressMilestone', {
          detail: { milestone, percent: newProgress.percent }
        }));
      }
    }

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
      // 🔥 LEVEL UP — критическое событие, сохраняем сразу!
      triggerImmediateSync('level_up');

      handleRankTransition(oldLevel, data.level);
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

  function handlePassiveEvent(reason, payload) {
    if (reason === 'steps_updated') {
      const stepsValue = payload?.steps || 0;
      updateDailyMission('steps_updated', stepsValue);
    }
    checkAchievements(reason);
  }

  // Слушаем события от других модулей
  window.addEventListener('heysProductAdded', (e) => {
    game.addXP(0, 'product_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysMealAdded', (e) => {
    game.addXP(0, 'meal_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysStepsUpdated', (e) => {
    game.addXP(0, 'steps_updated', e.detail?.sourceEl, { steps: e.detail?.steps || 0 });
  });

  window.addEventListener('heys:checkin-complete', (e) => {
    game.addXP(0, 'checkin_complete', e.detail?.sourceEl);
  });

  window.addEventListener('heysSupplementsTaken', (e) => {
    game.addXP(0, 'supplements_taken', e.detail?.sourceEl);
  });

  window.addEventListener('heysWaterAdded', (e) => {
    game.addXP(0, 'water_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysTrainingAdded', (e) => {
    game.addXP(0, 'training_added', e.detail?.sourceEl);
  });

  window.addEventListener('heysHouseholdActivityAdded', (e) => {
    game.addXP(0, 'household_added', e.detail?.sourceEl);
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
    const oldXP = oldStats?.totalXP || 0;
    const oldLevel = oldStats?.level || 0;

    // Сбрасываем in-memory кеш — при следующем loadData() прочитаем свежие данные из localStorage
    _data = null;

    // 🔒 При ПЕРВОЙ синхронизации НЕ диспатчим heysGameUpdate
    // GamificationBar уже инициализирован с данными из localStorage
    // Это предотвращает мерцание UI при загрузке страницы
    if (!_initialSyncDone) {
      _initialSyncDone = true;
      _lastSyncTime = now;

      // 🔄 FIX v2.3: При первой синхронизации ОБЯЗАТЕЛЬНО загружаем из облака
      // Это гарантирует кросс-устройственную синхронизацию
      if (HEYS.game?.loadFromCloud) {
        HEYS.game.loadFromCloud().catch(() => { });
      }
      return;
    }

    // 🔒 Cooldown: не реагируем на sync если прошло < 2 секунд
    // Оптимизация: уменьшили cooldown c 5 сек для быстрого отклика
    if (now - _lastSyncTime < 2000) {
      return;
    }
    _lastSyncTime = now;

    // 🔄 FIX v2.3: При каждой синхронизации загружаем данные из облака
    // Это обеспечивает кросс-устройственную синхронизацию
    if (HEYS.game?.loadFromCloud) {
      HEYS.game.loadFromCloud().then(() => {
        // Получаем новые stats ПОСЛЕ загрузки из облака
        const newStats = game.getStats();

        // 🔒 Оптимизация: НЕ диспатчим heysGameUpdate если данные не изменились
        if (oldStats &&
          newStats.totalXP === oldXP &&
          newStats.level === oldLevel) {
          return;
        }

        // Уведомляем UI об обновлении (GamificationBar перечитает stats)
        window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: newStats }));
      }).catch(() => {
        // При ошибке всё равно обновляем UI с локальными данными
        const newStats = game.getStats();
        if (!oldStats || newStats.totalXP !== oldXP || newStats.level !== oldLevel) {
          window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: newStats }));
        }
      });
      return;
    }

    // Fallback если loadFromCloud недоступен
    const newStats = game.getStats();
    if (!oldStats || newStats.totalXP !== oldXP || newStats.level !== oldLevel) {
      window.dispatchEvent(new CustomEvent('heysGameUpdate', { detail: newStats }));
    }
  });

  // ========== ЭКСПОРТ ==========

  HEYS.game = game;

  // 🔄 Автозапуск: ретроактивная проверка пропущенных достижений
  // Запускается один раз при загрузке страницы (с задержкой для инициализации)
  setTimeout(() => {
    if (HEYS.game && typeof HEYS.game.recalculateAchievements === 'function') {
      bindCloudWatch();
      HEYS.game.recalculateAchievements().then(missed => {
        if (missed && missed.length > 0) {
          console.log('[🎮 Gamification] Recovered', missed.length, 'missed achievements');
        }
      }).catch(e => {
        // Ignore errors during recalculation
      });

      // 🔄 Загружаем данные из облака — проверяем ОБА способа авторизации
      const hasCloudSession = HEYS.cloud?.getSessionToken?.();
      const hasYandexAPI = HEYS.YandexAPI && (
        localStorage.getItem('heys_curator_session') ||
        localStorage.getItem('heys_session_token')
      );

      if (hasCloudSession || hasYandexAPI) {
        console.log('[🎮 Gamification] Starting cloud load...');
        HEYS.game.loadFromCloud().then(loaded => {
          if (loaded) {
            console.log('[🎮 Gamification] Cloud data loaded successfully');
          } else {
            console.log('[🎮 Gamification] No cloud data or already up to date');
            _cloudLoaded = true; // Помечаем как загружено даже если нет данных
            if (_pendingCloudSync) {
              _pendingCloudSync = false;
              triggerImmediateSync('pending_sync');
            }
          }
        }).catch(e => {
          console.warn('[🎮 Gamification] Cloud load error:', e.message);
          _cloudLoaded = true; // Помечаем как загружено даже при ошибке
          if (_pendingCloudSync) {
            _pendingCloudSync = false;
            triggerImmediateSync('pending_sync');
          }
        });
      } else {
        console.log('[🎮 Gamification] No session, skipping cloud load');
        _cloudLoaded = true; // Нет сессии — считаем загруженным
        if (_pendingCloudSync) {
          _pendingCloudSync = false;
          triggerImmediateSync('pending_sync');
        }
      }
    }
  }, 2000); // Уменьшил до 2 сек чтобы успеть до первого sync

  // 🔄 FIX v2.3: Кросс-устройственная синхронизация при возвращении на вкладку
  // Когда пользователь переключается между устройствами/вкладками — проверяем облако
  let _lastVisibilitySync = 0;
  const VISIBILITY_SYNC_COOLDOWN_MS = 30000; // 30 секунд между проверками

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Проверяем облако не чаще чем раз в 30 секунд
        if (now - _lastVisibilitySync < VISIBILITY_SYNC_COOLDOWN_MS) {
          return;
        }
        _lastVisibilitySync = now;

        // Проверяем наличие сессии
        const hasSession = HEYS.cloud?.getSessionToken?.() ||
          localStorage.getItem('heys_session_token');
        if (!hasSession || !HEYS.game?.loadFromCloud) {
          return;
        }

        console.log('[🎮 Gamification] Tab visible, checking cloud for updates...');
        HEYS.game.loadFromCloud().catch(() => { });
      }
    });
  }

  // Debug
  if (typeof window !== 'undefined') {
    window.debugGame = () => {
      console.log('Game State:', loadData());
      console.log('Stats:', game.getStats());
      console.log('Achievements:', game.getAchievements().filter(a => a.unlocked));
    };

    // 🔧 Debug: enable gamification logging
    window.enableGameDebug = () => {
      localStorage.setItem('heys_debug_gamification', 'true');
      console.log('[🎮 Gamification] Debug mode enabled. Reload page to see logs.');
    };

    window.disableGameDebug = () => {
      localStorage.removeItem('heys_debug_gamification');
      console.log('[🎮 Gamification] Debug mode disabled.');
    };

    // 🔧 FIX v2.3: Принудительная синхронизация с облаком
    window.syncGameToCloud = async () => {
      if (!HEYS.game?.syncToCloud) {
        console.error('[🎮 Gamification] syncToCloud not available');
        return false;
      }
      console.log('[🎮 Gamification] Manual sync to cloud...');
      const result = await HEYS.game.syncToCloud();
      console.log('[🎮 Gamification] Sync result:', result);
      return result;
    };

    // 🔧 FIX v2.3: Принудительная загрузка из облака
    window.loadGameFromCloud = async () => {
      if (!HEYS.game?.loadFromCloud) {
        console.error('[🎮 Gamification] loadFromCloud not available');
        return false;
      }
      console.log('[🎮 Gamification] Manual load from cloud...');
      const result = await HEYS.game.loadFromCloud();
      console.log('[🎮 Gamification] Load result:', result);
      return result;
    };
  }

})(typeof window !== 'undefined' ? window : global);
