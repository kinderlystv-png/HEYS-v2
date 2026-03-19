// heys_gamification_v1.js — Gamification Core: XP, Уровни, Достижения
// Единый источник правды для всей геймификации HEYS
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  // 🆕 Heartbeat для watchdog — gamification загружен
  if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();

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
  let _auditRebuildDone = false; // 🧾 Одноразовый пересчёт из аудит-лога за сессию
  // v62: set to true when ensureAuditConsistency fast-forwards XP DOWNWARD (cloud has stale higher value).
  // Allows syncToCloud to do one-time force write to correct stale cloud XP.
  let _auditDowngradedXP = false;
  let _syncInProgress = false; // 🔒 Mutex для syncToCloud — предотвращает параллельные записи
  let _isRebuilding = false; // 🔒 Блокировка ачивок во време rebuild (предотвращает дубли стриков)
  let _unlockingAchievements = new Set(); // 🔒 Mutex для unlockAchievement — Set ID достижений в процессе разблокировки
  let _lastAddXPKey = ''; // 🛡️ Dedup guard для _addXPInternal
  let _lastAddXPTime = 0; // 🛡️ Timestamp последнего addXP
  let _suppressUIUpdates = false; // 🔒 v3.1: Подавляем промежуточные UI-обновления во время rebuild chain
  let _isLoadingPhase = false; // 🔒 v4.0: Подавляет ВСЕ UI-уведомления во время загрузки/переключения клиента
  let _loadFromCloudPromise = null; // 🔒 v4.0: Dedup для параллельных вызовов loadFromCloud()
  let _dailyBonusAuditCache = { date: null, checkedAt: 0, claimed: false };
  const DEDUP_WINDOW_MS = 200; // 🛡️ Окно дедупликации (мс)
  const DEBOUNCE_MS = 100;
  const STORAGE_KEY = 'heys_game';
  const DATA_VERSION = 2; // Версия структуры данных для миграций
  const MAX_DAILY_XP_DAYS = 30; // Хранить историю XP максимум 30 дней
  const DAILY_BONUS_AUDIT_CACHE_MS = 60000;
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

  // 🛡️ Safe wrapper for HEYS.Day metric getters
  function safeGetDayMetric(getter, fallback = 0) {
    try {
      return getter?.() ?? fallback;
    } catch (e) {
      console.warn('[HEYS.missions] Metric getter failed:', e);
      return fallback;
    }
  }

  // 📊 Calculate behavior metrics from last 14 days (for adaptive missions)
  let _behaviorMetricsCache = null;
  let _behaviorMetricsCacheTime = 0;
  function calculateBehaviorMetrics() {
    const now = Date.now();
    // Cache for 1 hour
    if (_behaviorMetricsCache && (now - _behaviorMetricsCacheTime) < 3600000) {
      return _behaviorMetricsCache;
    }

    const metrics = {
      avgMealsPerDay: 0,
      avgWaterPercent: 0,
      avgUniqueProducts: 0,
      avgFiberPercent: 0,
      sampleDays: 0
    };

    try {
      const fmtDate = U.fmtDate || ((d) => d.toISOString().split('T')[0]);
      const lsGet = U.lsGet || ((k) => {
        try {
          return JSON.parse(localStorage.getItem(k));
        } catch { return null; }
      });

      const today = new Date();
      let totalMeals = 0, totalWater = 0, totalProducts = 0, totalFiber = 0, validDays = 0;

      for (let i = 1; i <= 14; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = fmtDate(d);
        const dayData = lsGet(`heys_dayv2_${dateStr}`);

        if (dayData?.meals?.length > 0) {
          validDays++;
          totalMeals += dayData.meals.length;

          // Water percentage
          if (dayData.water?.current && dayData.water?.target) {
            totalWater += Math.min(100, (dayData.water.current / dayData.water.target) * 100);
          }

          // Unique products
          const uniqueProductIds = new Set();
          dayData.meals.forEach(m => {
            (m.items || []).forEach(it => uniqueProductIds.add(it.productId));
          });
          totalProducts += uniqueProductIds.size;

          // Fiber percentage (if dayTot exists)
          if (dayData.dayTot?.fiber && dayData.normAbs?.fiber) {
            totalFiber += Math.min(100, (dayData.dayTot.fiber / dayData.normAbs.fiber) * 100);
          }
        }
      }

      if (validDays > 0) {
        metrics.avgMealsPerDay = Math.round(totalMeals / validDays);
        metrics.avgWaterPercent = Math.round(totalWater / validDays);
        metrics.avgUniqueProducts = Math.round(totalProducts / validDays);
        metrics.avgFiberPercent = Math.round(totalFiber / validDays);
        metrics.sampleDays = validDays;
      }

      _behaviorMetricsCache = metrics;
      _behaviorMetricsCacheTime = now;
      return metrics;
    } catch (e) {
      console.warn('[HEYS.missions] calculateBehaviorMetrics failed:', e);
      return metrics;
    }
  }

  // 🎵 Mission completion sound
  function playMissionSound(isAllComplete = false) {
    if (HEYS.audio) {
      HEYS.audio.play(isAllComplete ? 'allMissionsComplete' : 'missionComplete');
    }
  }

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  // ========== GAMESYNH TRACE LOGGING ==========
  const GAME_SYNC_LOG_PREFIX = '[GAMESYNH]';
  let _gameSyncTraceSeq = 0;

  function _gameSyncNow() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  }

  function startGameSyncTrace(stage, meta = {}) {
    const traceId = `gs-${Date.now().toString(36)}-${(++_gameSyncTraceSeq).toString(36)}`;
    const trace = { traceId, stage, startedAt: _gameSyncNow() };
    console.info(GAME_SYNC_LOG_PREFIX, '▶ start', stage, {
      traceId,
      at: new Date().toISOString(),
      ...meta
    });
    return trace;
  }

  function gameSyncTraceStep(trace, step, meta = {}) {
    const elapsedMs = Math.round(_gameSyncNow() - (trace?.startedAt || _gameSyncNow()));
    console.info(GAME_SYNC_LOG_PREFIX, '• step', step, {
      traceId: trace?.traceId || 'n/a',
      stage: trace?.stage || 'n/a',
      elapsedMs,
      ...meta
    });
  }

  function endGameSyncTrace(trace, status = 'ok', meta = {}) {
    const elapsedMs = Math.round(_gameSyncNow() - (trace?.startedAt || _gameSyncNow()));
    console.info(GAME_SYNC_LOG_PREFIX, '■ end', trace?.stage || 'unknown', {
      traceId: trace?.traceId || 'n/a',
      status,
      elapsedMs,
      ...meta
    });
  }

  function loadData() {
    if (_data) return _data;

    let stored = readStoredValue(STORAGE_KEY, null);

    // 🛡️ FIX v2.0: Fallback поиск по всем вариантам ключа если основной пустой
    // FIX v2.4: typeof check — totalXP=0 is valid (fresh data), don't treat as missing
    if (!stored || typeof stored.totalXP !== 'number') {
      let bestXP = stored?.totalXP || 0;
      let bestData = stored;

      try {
        const currentClientId = HEYS.utils?.getCurrentClientId?.() ||
          localStorage.getItem('heys_client_current') ||
          localStorage.getItem('heys_pin_auth_client');
        const normalizedClientId = currentClientId ? String(currentClientId).replace(/"/g, '') : null;
        const clientPrefix = normalizedClientId ? `heys_${normalizedClientId}_` : null;

        // 1. Прямой ключ heys_game (legacy без clientId)
        // ⚠️ Используем только если clientId неизвестен (иначе можем захватить чужой XP)
        if (!normalizedClientId) {
          const legacyRaw = localStorage.getItem('heys_game');
          if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (legacy?.totalXP > bestXP) {
              bestXP = legacy.totalXP;
              bestData = legacy;
              console.log('[🎮 Gamification] Found legacy heys_game with XP:', bestXP);
            }
          }
        }

        // 2. Поиск по ключам *_game (только для текущего клиента)
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (normalizedClientId) {
            if (!k.startsWith(clientPrefix)) continue;
            if (!k.endsWith('_game') && !k.endsWith('_gamification')) continue;
          } else {
            if (!k.endsWith('_game')) continue;
            if (k.includes('_gamification')) continue;
          }
          if (k.includes('sound')) continue;
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

    // 🔄 v3.1: Merge _dailyXPTotals (actual XP sums per day from audit)
    const localTotals = local._dailyXPTotals || {};
    const cloudTotals = cloud._dailyXPTotals || {};
    const mergedTotals = { ...cloudTotals };
    for (const day of Object.keys(localTotals)) {
      mergedTotals[day] = Math.max(mergedTotals[day] || 0, localTotals[day] || 0);
    }
    merged._dailyXPTotals = mergedTotals;
    merged.createdAt = Math.min(local.createdAt || Date.now(), cloud.createdAt || Date.now());
    merged.updatedAt = Math.max(local.updatedAt || 0, cloud.updatedAt || 0) || Date.now();
    merged.version = DATA_VERSION;

    return merged;
  }

  function getAuditContext() {
    const sessionToken = HEYS.cloud?.getSessionToken?.() || localStorage.getItem('heys_session_token');
    const curatorToken = localStorage.getItem('heys_curator_session');
    const clientIdRaw = HEYS.utils?.getCurrentClientId?.() ||
      localStorage.getItem('heys_client_current') ||
      localStorage.getItem('heys_pin_auth_client');

    return {
      sessionToken: sessionToken ? String(sessionToken).replace(/"/g, '') : null,
      curatorToken: curatorToken ? String(curatorToken) : null,
      clientId: clientIdRaw ? String(clientIdRaw).replace(/"/g, '') : null
    };
  }

  // 🔐 Audit RPC feature-flag (auto-disabled on 403, auto-reset after 30s)
  let _auditRpcBlocked = false;
  let _auditRpcBlockedAt = 0;
  const AUDIT_RPC_BLOCK_RESET_MS = 30000; // 30 секунд — auto-reset blocked flag

  function isAuditRpcBlocked() {
    if (_auditRpcBlocked && _auditRpcBlockedAt > 0) {
      // 🔄 Auto-reset after 30 seconds
      if (Date.now() - _auditRpcBlockedAt >= AUDIT_RPC_BLOCK_RESET_MS) {
        _auditRpcBlocked = false;
        _auditRpcBlockedAt = 0;
        console.info('[HEYS.game.audit] 🔓 Audit RPC block auto-reset after 30s');
        return false;
      }
    }
    return _auditRpcBlocked === true;
  }

  function setAuditRpcBlocked() {
    _auditRpcBlocked = true;
    _auditRpcBlockedAt = Date.now();
  }

  async function logGamificationEvent(payload) {
    const AUDIT_LOG_PREFIX = '[HEYS.game.audit]';
    const logAuditInfo = (...args) => console.info(AUDIT_LOG_PREFIX, ...args);
    const logAuditWarn = (...args) => console.warn(AUDIT_LOG_PREFIX, ...args);
    const logAuditError = (...args) => console.error(AUDIT_LOG_PREFIX, ...args);
    const startedAt = Date.now();
    const isCuratorSession = HEYS.auth?.isCuratorSession?.() === true;

    if (!HEYS.YandexAPI?.rpc) return false;
    if (isAuditRpcBlocked()) return false;

    const { sessionToken, curatorToken, clientId } = getAuditContext();
    const body = {
      p_action: payload.action,
      p_reason: payload.reason || null,
      p_xp_before: payload.xpBefore ?? null,
      p_xp_after: payload.xpAfter ?? null,
      p_xp_delta: payload.xpDelta ?? null,
      p_level_before: payload.levelBefore ?? null,
      p_level_after: payload.levelAfter ?? null,
      p_achievements_before: payload.achievementsBefore ?? null,
      p_achievements_after: payload.achievementsAfter ?? null,
      p_metadata: payload.metadata || {}
    };

    logAuditInfo('log:request', {
      action: payload?.action,
      reason: payload?.reason || null,
      hasSession: Boolean(sessionToken),
      hasCurator: Boolean(curatorToken),
      hasClientId: Boolean(clientId)
    });

    const canUseCurator = isCuratorSession && curatorToken && clientId;
    if (canUseCurator) {
      logAuditInfo('log:mode', { mode: 'curator' });
      const result = await HEYS.YandexAPI.rpc('log_gamification_event_by_curator', {
        p_client_id: clientId,
        ...body
      });
      if (result?.error?.code === 403) {
        setAuditRpcBlocked();
        logAuditWarn('log:curator:blocked', { code: 403 });
      }
      if (result?.error) {
        logAuditError('log:curator:error', {
          code: result.error?.code,
          message: result.error?.message || result.error,
          tookMs: Date.now() - startedAt
        });
      } else {
        logAuditInfo('log:curator:success', { tookMs: Date.now() - startedAt });
      }
      return result;
    }

    if (sessionToken) {
      logAuditInfo('log:mode', { mode: 'session' });
      const result = await HEYS.YandexAPI.rpc('log_gamification_event_by_session', {
        p_session_token: sessionToken,
        ...body
      });
      if (!result?.error) {
        logAuditInfo('log:session:success', { tookMs: Date.now() - startedAt });
        return result;
      }

      if (curatorToken && clientId && (result.error?.code === 401 || result.error?.code === 403)) {
        logAuditWarn('log:session:fallback', { code: result.error?.code, reason: 'session_denied' });
        const curatorResult = await HEYS.YandexAPI.rpc('log_gamification_event_by_curator', {
          p_client_id: clientId,
          ...body
        });
        if (curatorResult?.error?.code === 403) {
          setAuditRpcBlocked();
          logAuditWarn('log:curator:blocked', { code: 403 });
        }
        if (curatorResult?.error) {
          logAuditError('log:curator:error', {
            code: curatorResult.error?.code,
            message: curatorResult.error?.message || curatorResult.error,
            tookMs: Date.now() - startedAt
          });
        } else {
          logAuditInfo('log:curator:success', { tookMs: Date.now() - startedAt });
        }
        return curatorResult;
      }

      if (result.error?.code === 403) {
        setAuditRpcBlocked();
        logAuditWarn('log:session:blocked', { code: 403 });
      }

      logAuditError('log:session:error', {
        code: result.error?.code,
        message: result.error?.message || result.error,
        tookMs: Date.now() - startedAt
      });
      return result;
    }

    if (curatorToken && clientId) {
      logAuditInfo('log:mode', { mode: 'curator-fallback' });
      const result = await HEYS.YandexAPI.rpc('log_gamification_event_by_curator', {
        p_client_id: clientId,
        ...body
      });
      if (result?.error?.code === 403) {
        setAuditRpcBlocked();
        logAuditWarn('log:curator:blocked', { code: 403 });
      }
      if (result?.error) {
        logAuditError('log:curator:error', {
          code: result.error?.code,
          message: result.error?.message || result.error,
          tookMs: Date.now() - startedAt
        });
      } else {
        logAuditInfo('log:curator:success', { tookMs: Date.now() - startedAt });
      }
      return result;
    }

    logAuditWarn('log:auth:missing', { hasSession: false, hasCurator: false });
    return false;
  }

  // 🔄 Batch audit queue — накапливает события и отправляет пачкой
  const _auditQueue = [];
  let _auditFlushTimer = null;
  let _auditFlushInProgress = false;
  const AUDIT_FLUSH_DEBOUNCE_MS = 500;
  const AUDIT_MAX_RETRIES = 3;

  function queueGamificationEvent(payload) {
    try {
      console.info('[HEYS.game.audit]', 'log:queue', {
        action: payload?.action,
        reason: payload?.reason || null,
        queueSize: _auditQueue.length + 1
      });
    } catch (e) { }

    _auditQueue.push({ payload, retries: 0 });
    _scheduleAuditFlush();
  }

  function _scheduleAuditFlush() {
    if (_auditFlushTimer) clearTimeout(_auditFlushTimer);
    _auditFlushTimer = setTimeout(() => _flushAuditQueue(), AUDIT_FLUSH_DEBOUNCE_MS);
  }

  async function _flushAuditQueue() {
    if (_auditFlushInProgress || _auditQueue.length === 0) return;
    _auditFlushInProgress = true;

    try {
      // Забираем все из очереди
      const batch = _auditQueue.splice(0, _auditQueue.length);

      for (const item of batch) {
        try {
          await logGamificationEvent(item.payload);
        } catch (err) {
          item.retries++;
          if (item.retries < AUDIT_MAX_RETRIES) {
            // Retry with exponential backoff — возвращаем в очередь
            _auditQueue.push(item);
            console.warn('[HEYS.game.audit] Retry', item.retries, '/', AUDIT_MAX_RETRIES, 'for', item.payload?.action);
          } else {
            console.error('[HEYS.game.audit] ❌ Dropped after', AUDIT_MAX_RETRIES, 'retries:', item.payload?.action);
          }
        }
      }

      // Если остались retry-элементы — перепланировать с backoff
      if (_auditQueue.length > 0) {
        const maxRetries = Math.max(..._auditQueue.map(i => i.retries));
        const backoffMs = Math.min(1000 * Math.pow(2, maxRetries - 1), 8000);
        setTimeout(() => _flushAuditQueue(), backoffMs);
      }
    } finally {
      _auditFlushInProgress = false;
    }
  }

  /** Дождаться отправки всех pending audit events (для rebuild) */
  async function flushAuditQueue() {
    if (_auditFlushTimer) {
      clearTimeout(_auditFlushTimer);
      _auditFlushTimer = null;
    }
    if (_auditQueue.length > 0 || _auditFlushInProgress) {
      await _flushAuditQueue();
    }
  }

  async function fetchGamificationHistory(options = {}) {
    const AUDIT_LOG_PREFIX = '[HEYS.game.audit]';
    const logAuditInfo = (...args) => console.info(AUDIT_LOG_PREFIX, ...args);
    const logAuditWarn = (...args) => console.warn(AUDIT_LOG_PREFIX, ...args);
    const logAuditError = (...args) => console.error(AUDIT_LOG_PREFIX, ...args);
    const startedAt = Date.now();
    const isCuratorSession = HEYS.auth?.isCuratorSession?.() === true;

    const unwrapPayload = (data) => {
      if (!data) return {};
      if (data.items || data.total || data.success === false || data.success === true) return data;
      const keys = Object.keys(data || {});
      if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') {
        return data[keys[0]];
      }
      return data;
    };

    if (!HEYS.YandexAPI?.rpc) {
      logAuditError('rpc:unavailable', { reason: 'YandexAPI.rpc_missing' });
      return { items: [], error: { message: 'API недоступен' } };
    }

    if (isAuditRpcBlocked()) {
      logAuditWarn('rpc:blocked', { reason: 'audit_rpc_blocked' });
      return { items: [], error: { message: 'История недоступна' } };
    }

    const { limit = 50, offset = 0 } = options;
    const { sessionToken, curatorToken, clientId } = getAuditContext();
    logAuditInfo('rpc:request', {
      limit,
      offset,
      hasSession: Boolean(sessionToken),
      hasCurator: Boolean(curatorToken),
      hasClientId: Boolean(clientId)
    });

    const canUseCurator = isCuratorSession && curatorToken && clientId;
    if (canUseCurator) {
      logAuditInfo('rpc:mode', { mode: 'curator' });
      const result = await HEYS.YandexAPI.rpc('get_gamification_events_by_curator', {
        p_client_id: clientId,
        p_limit: limit,
        p_offset: offset
      });
      if (result?.error) {
        if (result.error?.code === 403) {
          setAuditRpcBlocked();
          logAuditWarn('rpc:curator:blocked', { code: 403 });
        }
        logAuditError('rpc:curator:error', {
          code: result.error?.code,
          message: result.error?.message || result.error,
          tookMs: Date.now() - startedAt
        });
        return { items: [], error: result.error };
      }
      const payload = unwrapPayload(result?.data || {});
      logAuditInfo('rpc:curator:payload', { keys: Object.keys(result?.data || {}) });
      logAuditInfo('rpc:curator:success', {
        count: payload.items ? payload.items.length : 0,
        total: typeof payload.total === 'number' ? payload.total : null,
        tookMs: Date.now() - startedAt
      });
      return { items: payload.items || [], total: payload.total || 0 };
    }

    if (sessionToken) {
      logAuditInfo('rpc:mode', { mode: 'session' });
      logAuditInfo('rpc:session:start', { limit, offset });
      const result = await HEYS.YandexAPI.rpc('get_gamification_events_by_session', {
        p_session_token: sessionToken,
        p_limit: limit,
        p_offset: offset
      });
      if (!result?.error) {
        const payload = unwrapPayload(result?.data || {});
        logAuditInfo('rpc:session:payload', { keys: Object.keys(result?.data || {}) });
        logAuditInfo('rpc:session:success', {
          count: payload.items ? payload.items.length : 0,
          total: typeof payload.total === 'number' ? payload.total : null,
          tookMs: Date.now() - startedAt
        });
        return { items: payload.items || [], total: payload.total || 0 };
      }

      if (curatorToken && clientId && (result.error?.code === 401 || result.error?.code === 403)) {
        logAuditWarn('rpc:session:fallback', { code: result.error?.code, reason: 'session_denied' });
        const curatorResult = await HEYS.YandexAPI.rpc('get_gamification_events_by_curator', {
          p_client_id: clientId,
          p_limit: limit,
          p_offset: offset
        });
        if (curatorResult?.error) {
          if (curatorResult.error?.code === 403) {
            setAuditRpcBlocked();
            logAuditWarn('rpc:curator:blocked', { code: 403 });
          }
          logAuditError('rpc:curator:error', {
            code: curatorResult.error?.code,
            message: curatorResult.error?.message || curatorResult.error,
            tookMs: Date.now() - startedAt
          });
          return { items: [], error: curatorResult.error };
        }
        const payload = unwrapPayload(curatorResult?.data || {});
        logAuditInfo('rpc:curator:payload', { keys: Object.keys(curatorResult?.data || {}) });
        logAuditInfo('rpc:curator:success', {
          count: payload.items ? payload.items.length : 0,
          total: typeof payload.total === 'number' ? payload.total : null,
          tookMs: Date.now() - startedAt
        });
        return { items: payload.items || [], total: payload.total || 0 };
      }

      if (result.error?.code === 403) {
        setAuditRpcBlocked();
        logAuditWarn('rpc:session:blocked', { code: 403 });
      }

      logAuditError('rpc:session:error', {
        code: result.error?.code,
        message: result.error?.message || result.error,
        tookMs: Date.now() - startedAt
      });
      return { items: [], error: result.error };
    }

    if (curatorToken && clientId) {
      logAuditInfo('rpc:mode', { mode: 'curator-fallback' });
      logAuditInfo('rpc:curator:start', { limit, offset });
      const result = await HEYS.YandexAPI.rpc('get_gamification_events_by_curator', {
        p_client_id: clientId,
        p_limit: limit,
        p_offset: offset
      });
      if (result?.error) {
        if (result.error?.code === 403) {
          setAuditRpcBlocked();
          logAuditWarn('rpc:curator:blocked', { code: 403 });
        }
        logAuditError('rpc:curator:error', {
          code: result.error?.code,
          message: result.error?.message || result.error,
          tookMs: Date.now() - startedAt
        });
        return { items: [], error: result.error };
      }
      const payload = unwrapPayload(result?.data || {});
      logAuditInfo('rpc:curator:payload', { keys: Object.keys(result?.data || {}) });
      logAuditInfo('rpc:curator:success', {
        count: payload.items ? payload.items.length : 0,
        total: typeof payload.total === 'number' ? payload.total : null,
        tookMs: Date.now() - startedAt
      });
      return { items: payload.items || [], total: payload.total || 0 };
    }

    logAuditWarn('rpc:auth:missing', { hasSession: false, hasCurator: false });
    return { items: [], error: { message: 'Нужна авторизация (PIN или куратор)' } };
  }

  /**
   * 🔧 FIX v2.4: Восстановление XP из аудит-лога (source of truth)
   *
   * Если XP в кэше (localStorage/cloud) расходится с суммой xp_delta из аудита,
   * пересчитывает XP целиком из аудит-записей.
   *
   * Вызывается:
   * 1. Из loadFromCloud() если cloud XP < audit XP
   * 2. Вручную через HEYS.game.rebuildXPFromAudit()
   *
   * @param {Object} options
   * @param {boolean} options.force — пересчитать даже если разницы нет
   * @param {boolean} options.dryRun — только проверить, не применять
   * @returns {Object} { rebuilt: boolean, auditXP, cachedXP, delta, events }
   */
  async function rebuildXPFromAudit(options = {}) {
    const { force = false, dryRun = false, trustAudit = false } = options;
    const LOG = '[🎮 GAME REBUILD]';
    const syncTrace = startGameSyncTrace('rebuildXPFromAudit', {
      force: Boolean(force),
      dryRun: Boolean(dryRun),
      trustAudit: Boolean(trustAudit)
    });

    // 🔒 Блокируем выдачу ачивок пока идёт rebuild
    _isRebuilding = true;
    try {
      // 0. Дождёмся отправки pending audit events
      await flushAuditQueue();
      gameSyncTraceStep(syncTrace, 'flush_audit_queue:done');

      // 1. Получаем ВСЕ записи из аудит-лога (пагинация по 500)
      const allEvents = [];
      let offset = 0;
      const PAGE_SIZE = 500;
      const MAX_PAGES = 20; // Безопасный лимит — 10000 записей

      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await fetchGamificationHistory({ limit: PAGE_SIZE, offset });
        const items = result?.items || [];
        if (items.length === 0) break;
        allEvents.push(...items);
        offset += items.length;
        // Если получили меньше чем запрошено — это последняя страница
        if (items.length < PAGE_SIZE) break;
      }
      gameSyncTraceStep(syncTrace, 'fetch_audit_pages:done', {
        pages: Math.ceil(allEvents.length / PAGE_SIZE),
        totalEvents: allEvents.length
      });

      if (allEvents.length === 0) {
        console.info(LOG, 'No audit events found — nothing to rebuild');
        endGameSyncTrace(syncTrace, 'ok', { reason: 'no_events' });
        return { rebuilt: false, auditXP: 0, cachedXP: 0, delta: 0, events: 0, reason: 'no_events' };
      }

      // 2. Считаем суммарный XP из аудита (только xp_gain события)
      let auditXP = 0;
      let xpGainCount = 0;
      // 2b. Собираем unlocked achievements из аудита
      const auditAchievements = new Set();
      // 2c. Собираем stats из audit reasons
      const auditStats = {
        totalProducts: 0,
        totalWater: 0,
        totalTrainings: 0,
        totalAdvicesRead: 0,
        perfectDays: 0,
        bestStreak: 0
      };
      // 2d. Собираем first_* actions для восстановления onboarding ачивок
      const seenReasons = new Set();
      // 2e. Восстанавливаем dailyXP из аудит-событий для графика "XP за неделю"
      const auditDailyXP = {};
      // 2f. v3.1: Также храним реальные суммы XP по дням для точного графика
      const auditDailyXPTotals = {};

      for (const event of allEvents) {
        const eventDelta = event.xp_delta || event.xpDelta || 0;
        const action = event.action || event.p_action || '';
        const reason = event.reason || event.p_reason || '';

        // XP суммирование (xp_gain + daily_bonus, не level_up — это дубль)
        if ((action === 'xp_gain' || action === 'daily_bonus') && typeof eventDelta === 'number' && eventDelta > 0) {
          auditXP += eventDelta;
          xpGainCount++;
          seenReasons.add(reason);

          // Пересчёт stats из reasons
          if (reason === 'product_added') auditStats.totalProducts++;
          if (reason === 'water_added') auditStats.totalWater++;
          if (reason === 'training_added') auditStats.totalTrainings++;
          if (reason === 'advice_read') auditStats.totalAdvicesRead++;
          if (reason === 'perfect_day') auditStats.perfectDays++;

          // 2e. dailyXP: восстанавливаем счётчики по дате+reason
          const eventDate = event.created_at || event.createdAt;
          if (eventDate && reason) {
            const dateStr = new Date(eventDate).toISOString().slice(0, 10);
            if (!auditDailyXP[dateStr]) auditDailyXP[dateStr] = {};
            auditDailyXP[dateStr][reason] = (auditDailyXP[dateStr][reason] || 0) + 1;
            // 2f. v3.1: Суммируем реальный XP по дням (включая daily_bonus, daily_mission и т.д.)
            auditDailyXPTotals[dateStr] = (auditDailyXPTotals[dateStr] || 0) + eventDelta;
          }
        }

        // Достижения — восстанавливаем из audit
        // Защита от дублей: считаем XP только за первое появление каждого achievement
        if (action === 'achievement_unlocked' && reason) {
          if (!auditAchievements.has(reason)) {
            auditAchievements.add(reason);
            if (typeof eventDelta === 'number' && eventDelta > 0) {
              auditXP += eventDelta;
              // 2f. v3.1: Achievement XP тоже считаем в дневной итог
              const achEventDate = event.created_at || event.createdAt;
              if (achEventDate) {
                const achDateStr = new Date(achEventDate).toISOString().slice(0, 10);
                auditDailyXPTotals[achDateStr] = (auditDailyXPTotals[achDateStr] || 0) + eventDelta;
              }
            }
          }
        }
      }

      // 3. Получаем текущий кэшированный XP
      const currentData = loadData();
      const cachedXP = currentData.totalXP || 0;
      const delta = auditXP - cachedXP;
      gameSyncTraceStep(syncTrace, 'audit_math:done', {
        auditXP,
        cachedXP,
        delta
      });
      const currentAchievements = new Set(currentData.unlockedAchievements || []);
      const missingAchievements = [...auditAchievements].filter(a => !currentAchievements.has(a));

      // 3b. Определяем first_* ачивки из seenReasons
      const reasonToFirstAchievement = {
        checkin_complete: 'first_checkin',
        meal_added: 'first_meal',
        product_added: 'first_product',
        steps_updated: 'first_steps',
        advice_read: 'first_advice',
        supplements_taken: 'first_supplements',
        water_added: 'first_water',
        training_added: 'first_training',
        household_added: 'first_household'
      };
      for (const [reason, achId] of Object.entries(reasonToFirstAchievement)) {
        if (seenReasons.has(reason) && !currentAchievements.has(achId) && !auditAchievements.has(achId)) {
          missingAchievements.push(achId);
        }
      }

      // 3c. Level-based ачивки
      const rebuiltLevel = calculateLevel(Math.max(auditXP, cachedXP));
      const levelMilestones = [5, 10, 15, 20, 25];
      for (const lvl of levelMilestones) {
        const achId = `level_${lvl}`;
        if (rebuiltLevel >= lvl && !currentAchievements.has(achId) && !auditAchievements.has(achId)) {
          missingAchievements.push(achId);
        }
      }

      console.info(LOG, `Audit: ${xpGainCount} xp_gain events, total XP=${auditXP}. Cached XP=${cachedXP}. Delta=${delta}`);
      console.info(LOG, `Achievements in audit: ${auditAchievements.size}, missing: ${missingAchievements.length}`, missingAchievements);
      console.info(LOG, `Stats from audit:`, auditStats);

      // 4. Проверяем нужен ли rebuild
      const THRESHOLD_PERCENT = 0.2;
      const xpNeedsRebuild = force || (
        auditXP > cachedXP &&
        (cachedXP === 0 || delta / Math.max(cachedXP, 1) >= THRESHOLD_PERCENT)
      );
      const achievementsNeedRebuild = missingAchievements.length > 0;
      const statsNeedRebuild = (
        auditStats.totalProducts > (currentData.stats?.totalProducts || 0) ||
        auditStats.totalWater > (currentData.stats?.totalWater || 0) ||
        auditStats.totalTrainings > (currentData.stats?.totalTrainings || 0) ||
        auditStats.totalAdvicesRead > (currentData.stats?.totalAdvicesRead || 0) ||
        auditStats.perfectDays > (currentData.stats?.perfectDays || 0)
      );

      const needsRebuild = xpNeedsRebuild || achievementsNeedRebuild || statsNeedRebuild;

      if (!needsRebuild) {
        console.info(LOG, `Everything consistent — no rebuild needed`);
        endGameSyncTrace(syncTrace, 'ok', { reason: 'consistent', auditXP, cachedXP, delta });
        return { rebuilt: false, auditXP, cachedXP, delta, events: xpGainCount, missingAchievements: [], reason: 'consistent' };
      }

      if (dryRun) {
        console.warn(LOG, `DRY RUN: XP ${cachedXP} → ${auditXP}, +${missingAchievements.length} achievements, stats update`);
        endGameSyncTrace(syncTrace, 'ok', { reason: 'dry_run', auditXP, cachedXP, delta, missingAchievements: missingAchievements.length });
        return {
          rebuilt: false, auditXP, cachedXP, delta, events: xpGainCount,
          missingAchievements, auditStats, reason: 'dry_run'
        };
      }

      // 5. Применяем rebuild
      const oldLevel = currentData.level;
      // 🔒 trustAudit=true: cleanup mode — используем audit как source of truth (игнорируем cached XP)
      let rebuiltXP = trustAudit ? auditXP : Math.max(auditXP, cachedXP);

      // 5a. Восстанавливаем stats (берём max из audit и текущих)
      if (!currentData.stats) currentData.stats = {};
      currentData.stats.totalProducts = Math.max(currentData.stats.totalProducts || 0, auditStats.totalProducts);
      currentData.stats.totalWater = Math.max(currentData.stats.totalWater || 0, auditStats.totalWater);
      currentData.stats.totalTrainings = Math.max(currentData.stats.totalTrainings || 0, auditStats.totalTrainings);
      currentData.stats.totalAdvicesRead = Math.max(currentData.stats.totalAdvicesRead || 0, auditStats.totalAdvicesRead);
      currentData.stats.perfectDays = Math.max(currentData.stats.perfectDays || 0, auditStats.perfectDays);

      // 5a-1. Восстанавливаем dailyXP из аудит-событий (для графика "XP за неделю")
      if (!currentData.dailyXP) currentData.dailyXP = {};
      for (const [dateStr, reasons] of Object.entries(auditDailyXP)) {
        if (!currentData.dailyXP[dateStr]) currentData.dailyXP[dateStr] = {};
        for (const [reason, count] of Object.entries(reasons)) {
          // Берём max — не теряем локальные данные
          currentData.dailyXP[dateStr][reason] = Math.max(currentData.dailyXP[dateStr][reason] || 0, count);
        }
      }

      // 5a-1b. v3.1: Сохраняем реальные суммы XP по дням (для точного графика)
      if (!currentData._dailyXPTotals) currentData._dailyXPTotals = {};
      for (const [dateStr, total] of Object.entries(auditDailyXPTotals)) {
        currentData._dailyXPTotals[dateStr] = Math.max(currentData._dailyXPTotals[dateStr] || 0, total);
      }

      // 5a-2. FIX v2.6: Восстанавливаем bestStreak из streak-ачивок
      // streak_7 → min 7, streak_5 → min 5, streak_3 → min 3, streak_2 → min 2, streak_1 → min 1
      const allAchievements = new Set([...currentData.unlockedAchievements, ...auditAchievements, ...missingAchievements]);
      const streakAchLevels = [7, 5, 3, 2, 1];
      let inferredBestStreak = 0;
      for (const lvl of streakAchLevels) {
        if (allAchievements.has(`streak_${lvl}`)) {
          inferredBestStreak = lvl;
          break;
        }
      }
      // Также проверяем текущий streak
      const currentStreak = safeGetStreak();
      inferredBestStreak = Math.max(inferredBestStreak, currentStreak);
      currentData.stats.bestStreak = Math.max(currentData.stats.bestStreak || 0, inferredBestStreak);

      // 5b. Восстанавливаем достижения (добавляем XP за каждую ачивку)
      const restoredAchievements = [];
      for (const achId of missingAchievements) {
        if (!currentData.unlockedAchievements.includes(achId)) {
          currentData.unlockedAchievements.push(achId);
          const ach = ACHIEVEMENTS[achId];
          if (ach) {
            // XP за ачивку добавляем только если это ачивка НЕ из audit
            // (audit achievement_unlocked XP уже включён в auditXP)
            if (!auditAchievements.has(achId)) {
              rebuiltXP += ach.xp;
            }
            restoredAchievements.push({ id: achId, name: ach.name, xp: ach.xp });
          }
        }
      }

      // 5c. Обновляем XP и level
      if (rebuiltXP !== cachedXP) {
        console.warn(LOG, `⚠️ REBUILDING XP: ${cachedXP} → ${rebuiltXP}`);
      }
      currentData.totalXP = rebuiltXP;
      currentData.level = calculateLevel(rebuiltXP);
      currentData.updatedAt = Date.now();

      _data = currentData;
      setStoredValue(STORAGE_KEY, _data);

      // 6. Логируем rebuild в аудит ТОЛЬКО если XP или ачивки реально изменились
      // (stats-only обновления не генерируют audit event — это локальная операция)
      const actualDelta = rebuiltXP - cachedXP;
      const hasXPOrAchievementChanges = actualDelta !== 0 || restoredAchievements.length > 0;

      if (hasXPOrAchievementChanges) {
        queueGamificationEvent({
          action: 'xp_rebuild',
          reason: 'audit_reconciliation',
          xpBefore: cachedXP,
          xpAfter: rebuiltXP,
          xpDelta: actualDelta,
          levelBefore: oldLevel,
          levelAfter: currentData.level,
          metadata: {
            auditEvents: xpGainCount,
            totalAuditRecords: allEvents.length,
            restoredAchievements: restoredAchievements.map(a => a.id),
            statsUpdated: statsNeedRebuild,
            trigger: force ? 'manual' : 'auto'
          }
        });
      } else {
        console.info(LOG, 'Rebuild verified consistency — no audit event needed (delta=0, no new achievements)' +
          (statsNeedRebuild ? ', stats updated locally' : ''));
      }
      gameSyncTraceStep(syncTrace, 'rebuild_apply:done', {
        rebuiltXP,
        restoredAchievements: restoredAchievements.length,
        hasXPOrAchievementChanges
      });

      // 7. Синхронизируем в облако
      triggerImmediateSync('xp_rebuild');

      // 8. Обновляем UI (если не подавлены промежуточные обновления)
      if (!_suppressUIUpdates) {
        window.dispatchEvent(new CustomEvent('heysGameUpdate', {
          detail: {
            xpGained: rebuiltXP - cachedXP,
            reason: 'xp_rebuild',
            totalXP: rebuiltXP,
            level: currentData.level,
            progress: game.getProgress(),
            restoredAchievements,
            isInitialLoad: _isLoadingPhase // 🔒 v4.0: React не покажет модалки если мы в loading phase
          }
        }));
      }

      // 🔒 v4.0: Rebuild — это восстановление, не геймплей. Уведомление только вне loading phase
      if (!_isLoadingPhase && (rebuiltXP > cachedXP || restoredAchievements.length > 0)) {
        showNotification('xp_rebuilt', {
          oldXP: cachedXP,
          newXP: rebuiltXP,
          delta: rebuiltXP - cachedXP,
          achievements: restoredAchievements.length
        });
      }

      console.info(LOG, `✅ Rebuild complete: XP=${rebuiltXP}, level=${currentData.level}, +${restoredAchievements.length} achievements`);
      if (restoredAchievements.length > 0) {
        console.info(LOG, `Restored achievements:`, restoredAchievements.map(a => `${a.name} (+${a.xp} XP)`));
      }

      endGameSyncTrace(syncTrace, 'ok', {
        reason: hasXPOrAchievementChanges ? 'rebuilt' : (statsNeedRebuild ? 'stats_only' : 'verified_consistent'),
        rebuiltXP,
        level: currentData.level,
        restoredAchievements: restoredAchievements.length
      });
      return {
        rebuilt: hasXPOrAchievementChanges, auditXP, cachedXP, delta: rebuiltXP - cachedXP,
        events: xpGainCount, restoredAchievements,
        reason: hasXPOrAchievementChanges ? 'rebuilt' : (statsNeedRebuild ? 'stats_only' : 'verified_consistent')
      };

    } catch (err) {
      console.error(LOG, '❌ Rebuild failed:', err.message);
      endGameSyncTrace(syncTrace, 'error', { message: err.message });
      return { rebuilt: false, auditXP: 0, cachedXP: 0, delta: 0, events: 0, reason: 'error', error: err.message };
    } finally {
      _isRebuilding = false; // 🔓 Разблокируем выдачу ачивок
    }
  }

  /**
   * 🔄 Lightweight consistency check — 1 RPC вместо full rebuild.
   * Загружает ОДНО последнее событие из аудита, сравнивает xp_after + total event count
   * с кэшированными данными. Full rebuild только при реальном расхождении.
   */
  let _ensureAuditLastRun = 0; // ⏱️ v5.1: Throttle — не чаще 1 раза в 30 сек независимо от _auditRebuildDone

  // 🚀 PERF: Local-only XP cache key (not synced to cloud, survives cloud overwrites)
  function _getXPCacheKey() {
    const cid = HEYS.currentClientId ||
      HEYS.utils?.getCurrentClientId?.() ||
      localStorage.getItem('heys_client_current') ||
      localStorage.getItem('heys_pin_auth_client');
    const id = cid ? String(cid).replace(/"/g, '') : 'default';
    return 'heys_xp_cache_' + id;
  }

  function _saveXPCache(totalXP, eventCount, opts) {
    try {
      const prev = _loadXPCache() || {};
      const data = { xp: totalXP, count: eventCount, ts: Date.now() };
      // 🚀 PERF v2.5: dailyRebuilt flag persists in local-only cache (NOT synced to cloud)
      // Prevents full audit rebuild (1014 events, 3 RPC pages) on every app entry
      if (opts && opts.dailyRebuilt) data.dailyRebuilt = true;
      else if (prev.dailyRebuilt) data.dailyRebuilt = true; // preserve existing flag
      localStorage.setItem(_getXPCacheKey(), JSON.stringify(data));
    } catch (_) { /* quota exceeded — ignore */ }
  }

  function _loadXPCache() {
    try {
      const raw = localStorage.getItem(_getXPCacheKey());
      if (raw) return JSON.parse(raw);
    } catch (_) { }
    return null;
  }

  async function ensureAuditConsistency(trigger = 'auto') {
    const syncTrace = startGameSyncTrace('ensureAuditConsistency', { trigger });
    if (_auditRebuildDone) {
      endGameSyncTrace(syncTrace, 'skipped', { reason: 'already_done' });
      return;
    }
    const _now = Date.now();
    if (_now - _ensureAuditLastRun < 30000) {
      console.info('[🎮 Gamification] ensureAuditConsistency throttled (', Math.round((_now - _ensureAuditLastRun) / 1000), 's ago), trigger:', trigger);
      endGameSyncTrace(syncTrace, 'skipped', { reason: 'throttled' });
      return;
    }
    _ensureAuditLastRun = _now;
    _auditRebuildDone = true;

    try {
      // Дождёмся отправки pending events
      await flushAuditQueue();
      gameSyncTraceStep(syncTrace, 'flush_audit_queue:done');

      const data = loadData();
      const result = await fetchGamificationHistory({ limit: 1, offset: 0 });
      gameSyncTraceStep(syncTrace, 'fetch_last_event:done', {
        hasResult: Boolean(result),
        items: result?.items?.length || 0,
        total: result?.total || 0
      });

      if (!result || !result.items || result.items.length === 0) {
        console.info('[🎮 GAME SYNC]', trigger, '— no audit events, skip');
        endGameSyncTrace(syncTrace, 'ok', { reason: 'no_audit_events' });
        return;
      }

      const lastEvent = result.items[0];
      const auditTotal = result.total || 0;
      const lastXPAfter = lastEvent?.xp_after ?? null;
      let cachedXP = data.totalXP || 0;
      let cachedEventCount = data._lastKnownEventCount || 0;

      // XP cache используем только как вспомогательный счётчик событий/dailyRebuilt.
      // Для totalXP источником истины должен быть audit, иначе завышенный локальный кэш
      // может снова раздуть UI даже после reconciliation.
      const xpCache = _loadXPCache();
      if (xpCache) {
        if (xpCache.count > cachedEventCount) cachedEventCount = xpCache.count;
      }

      // Проверяем консистентность:
      // 1. XP в последнем событии совпадает с кэшем?
      // 2. Количество событий не изменилось?
      const xpConsistent = lastXPAfter === null || lastXPAfter === cachedXP;
      const countConsistent = cachedEventCount > 0 && cachedEventCount === auditTotal;
      gameSyncTraceStep(syncTrace, 'consistency_evaluated', {
        lastXPAfter,
        cachedXP,
        cachedEventCount,
        auditTotal,
        xpConsistent,
        countConsistent
      });

      if (xpConsistent && countConsistent) {
        // 🚀 PERF v2.5: Проверяем dailyRebuilt через XP cache (local-only, НЕ перезаписывается cloud sync)
        // Раньше _dailyXPRebuiltV1 в game data стирался при cloud sync → rebuild 1014 events на КАЖДЫЙ вход
        const _xpCacheDR = _loadXPCache();
        if (!(_xpCacheDR && _xpCacheDR.dailyRebuilt) && cachedXP > 0) {
          console.info('[🎮 GAME SYNC]', trigger, '— XP consistent ✅ but dailyXP not yet rebuilt, restoring from audit...');
          await rebuildXPFromAudit({ force: true, trustAudit: true });
          _saveXPCache(cachedXP, auditTotal, { dailyRebuilt: true });
          endGameSyncTrace(syncTrace, 'ok', { reason: 'consistent_daily_rebuild' });
          return;
        }
        console.info('[🎮 GAME SYNC]', trigger, '— consistent ✅ (XP=' + cachedXP + ', events=' + auditTotal + ')');
        // 🚀 PERF: Update local XP cache on consistent check
        _saveXPCache(cachedXP, auditTotal);
        endGameSyncTrace(syncTrace, 'ok', { reason: 'consistent', cachedXP, auditTotal });
        return;
      }

      // Если XP совпадает но count отличается — это нормально (xp_rebuild события увеличивают count).
      // Просто обновляем cached count, rebuild не нужен.
      if (xpConsistent && !countConsistent) {
        console.info('[🎮 GAME SYNC]', trigger, '— XP consistent ✅ (XP=' + cachedXP +
          '), updating event count: ' + cachedEventCount + ' → ' + auditTotal);
        const d = loadData();
        d._lastKnownEventCount = auditTotal;
        setStoredValue(STORAGE_KEY, d);
        // 🚀 PERF: Update local XP cache
        _saveXPCache(cachedXP, auditTotal);
        // 🚀 PERF v2.5: dailyXP rebuild через XP cache (local-only)
        const _xpCacheDR2 = _loadXPCache();
        if (!(_xpCacheDR2 && _xpCacheDR2.dailyRebuilt) && cachedXP > 0) {
          console.info('[🎮 GAME SYNC]', trigger, '— dailyXP not yet rebuilt, restoring from audit...');
          await rebuildXPFromAudit({ force: true, trustAudit: true });
          _saveXPCache(cachedXP, auditTotal, { dailyRebuilt: true });
        }
        endGameSyncTrace(syncTrace, 'ok', { reason: 'xp_consistent_count_update', cachedXP, auditTotal });
        return;
      }

      // XP расхождение обнаружено — нужен полный rebuild
      console.warn('[🎮 GAME SYNC]', trigger, '— XP DRIFT detected! Cached XP=' + cachedXP +
        ', audit xp_after=' + lastXPAfter + ', events: cached=' + cachedEventCount + ', actual=' + auditTotal);

      // ⚡ FAST-FORWARD: Если в audit есть actuality XP (вверх или вниз),
      // сразу обновляем UI/кэш, чтобы не ждать полный rebuild.
      // RC-5 fix: было lastXPAfter > cachedXP — теперь !== чтобы покрывать уменьшение XP при смене клиента.
      // Full rebuild ниже всё равно выполнится и восстановит dailyXP/stats/ачивки.
      if (typeof lastXPAfter === 'number' && lastXPAfter !== cachedXP) {
        const fastData = loadData();
        const fastLevelBefore = fastData.level || calculateLevel(cachedXP);
        fastData.totalXP = lastXPAfter;
        fastData.level = calculateLevel(lastXPAfter);
        fastData.updatedAt = Date.now();
        fastData._lastKnownEventCount = Math.max(fastData._lastKnownEventCount || 0, auditTotal);
        _data = fastData;
        setStoredValue(STORAGE_KEY, fastData);
        _saveXPCache(lastXPAfter, fastData._lastKnownEventCount);

        window.dispatchEvent(new CustomEvent('heysGameUpdate', {
          detail: {
            xpGained: lastXPAfter - cachedXP,
            reason: 'xp_fast_sync',
            totalXP: lastXPAfter,
            level: fastData.level,
            progress: game.getProgress(),
            isInitialLoad: _isLoadingPhase
          }
        }));

        console.info('[🎮 GAME SYNC]', trigger, '— fast-forward applied: XP=' + cachedXP + ' → ' + lastXPAfter +
          ', level=' + fastLevelBefore + ' → ' + fastData.level);
        gameSyncTraceStep(syncTrace, 'fast_forward_applied', {
          fromXP: cachedXP,
          toXP: lastXPAfter,
          fromLevel: fastLevelBefore,
          toLevel: fastData.level
        });
        // v62: Flag downgraded XP drift so syncToCloud can force-correct stale cloud value
        if (lastXPAfter < cachedXP) {
          _auditDowngradedXP = true;
          console.info('[🎮 GAME SYNC] ⚠️ XP was downgraded by audit (' + cachedXP + ' → ' + lastXPAfter + ') — will force-sync to cloud on next syncToCloud');
        }
      }

      const rebuildResult = await rebuildXPFromAudit({ force: true, trustAudit: true });
      gameSyncTraceStep(syncTrace, 'full_rebuild:done', {
        rebuilt: Boolean(rebuildResult?.rebuilt),
        reason: rebuildResult?.reason || null
      });

      // Сохраняем event count после rebuild
      // +1 только если rebuild реально записал audit event (XP или ачивки изменились)
      const updatedData = loadData();
      updatedData._lastKnownEventCount = rebuildResult?.rebuilt ? auditTotal + 1 : auditTotal;
      setStoredValue(STORAGE_KEY, updatedData);
      // 🚀 PERF: Persist to local-only XP cache to survive cloud overwrites
      _saveXPCache(updatedData.totalXP || 0, updatedData._lastKnownEventCount);
      console.info('[🎮 GAME SYNC]', trigger, '— rebuild done, eventCount saved:', updatedData._lastKnownEventCount,
        '(rebuilt:', rebuildResult?.rebuilt, ', reason:', rebuildResult?.reason, ')');
      endGameSyncTrace(syncTrace, 'ok', {
        reason: 'xp_drift_reconciled',
        updatedEventCount: updatedData._lastKnownEventCount,
        rebuilt: Boolean(rebuildResult?.rebuilt)
      });
    } catch (err) {
      console.warn('[🎮 GAME SYNC] Consistency check failed:', err.message, { trigger });
      endGameSyncTrace(syncTrace, 'error', { message: err.message });
    }
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
        // v61: Sync XP cache after watch merge to prevent drift
        _saveXPCache(_data.totalXP || 0, _data._lastKnownEventCount || 0);
      } finally {
        _isProcessingWatch = false;
      }

      _cloudLoaded = true;
      if (_pendingCloudSync) {
        _pendingCloudSync = false;
        triggerImmediateSync('pending_sync');
      }

      window.dispatchEvent(new CustomEvent('heysGameUpdate', {
        detail: { ...game.getStats(), isInitialLoad: _isLoadingPhase }
      }));
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
      // Mission history (anti-repeat) — store last 7 days
      missionHistory: [],     // [{ date: '2025-12-01', ids: ['meals_3', 'water_100', ...] }]
      // Mission statistics (completion rates, favorites)
      missionStats: {
        totalAttempts: 0,     // Всего выдано миссий
        totalCompleted: 0,    // Всего выполнено
        byType: {},           // { meals: { attempts: 0, completed: 0 }, ... }
        completionRate: 0,    // % выполнения
        favoriteCategories: [], // Топ-3 категории
        lastUpdated: null     // Дата пересчёта
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
      _lastKnownEventCount: 0, // 🔄 Для lightweight consistency check
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

  async function refreshDailyBonusFromAudit(options = {}) {
    const { force = false } = options;
    const today = getToday();
    const data = loadData();

    try {
      if (!force && data.dailyBonusClaimed === today) {
        _dailyBonusAuditCache = { date: today, checkedAt: Date.now(), claimed: true };
        return true;
      }

      const now = Date.now();
      if (!force && _dailyBonusAuditCache.date === today && (now - _dailyBonusAuditCache.checkedAt) < DAILY_BONUS_AUDIT_CACHE_MS) {
        return _dailyBonusAuditCache.claimed;
      }

      const hasSession = Boolean(
        HEYS.auth?.getSessionToken?.() ||
        localStorage.getItem('heys_session_token') ||
        localStorage.getItem('heys_curator_session')
      );

      if (!HEYS.YandexAPI?.rpc || !hasSession || isAuditRpcBlocked()) {
        _dailyBonusAuditCache = { date: today, checkedAt: now, claimed: data.dailyBonusClaimed === today };
        return data.dailyBonusClaimed === today;
      }

      const PAGE_SIZE = 500;
      const MAX_PAGES = 5;
      let offset = 0;
      let found = false;
      let oldestDate = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await fetchGamificationHistory({ limit: PAGE_SIZE, offset });
        const items = result?.items || [];
        if (items.length === 0) break;

        for (const event of items) {
          const action = event.action || event.p_action || '';
          if (action !== 'daily_bonus') continue;
          const eventDate = event.created_at || event.createdAt;
          if (!eventDate) continue;
          const dateStr = new Date(eventDate).toISOString().slice(0, 10);
          if (dateStr === today) {
            found = true;
            break;
          }
        }

        if (found) break;

        const lastEvent = items[items.length - 1];
        const lastEventDate = lastEvent?.created_at || lastEvent?.createdAt || null;
        oldestDate = lastEventDate ? new Date(lastEventDate).toISOString().slice(0, 10) : null;

        if (!oldestDate || oldestDate < today) break;
        offset += items.length;
      }

      _dailyBonusAuditCache = { date: today, checkedAt: now, claimed: found };

      if (found && data.dailyBonusClaimed !== today) {
        data.dailyBonusClaimed = today;
        saveData();
      }

      return found;
    } catch (e) {
      _dailyBonusAuditCache = { date: today, checkedAt: Date.now(), claimed: data.dailyBonusClaimed === today };
      return data.dailyBonusClaimed === today;
    }
  }

  async function claimDailyBonus() {
    await refreshDailyBonusFromAudit();
    const data = loadData();
    const today = getToday();
    if (data.dailyBonusClaimed === today) return false;

    data.dailyBonusClaimed = today;
    const bonusXP = 10 * getXPMultiplier();
    const oldLevel = data.level; // Store the old level before updating
    const beforeXP = data.totalXP;
    const beforeAchievements = data.unlockedAchievements.length;
    data.totalXP += bonusXP;
    data.level = calculateLevel(data.totalXP);
    const afterXP = data.totalXP;
    const afterAchievements = data.unlockedAchievements.length;
    handleRankTransition(oldLevel, data.level);
    saveData();
    triggerImmediateSync('daily_bonus');

    queueGamificationEvent({
      action: 'daily_bonus',
      reason: 'daily_bonus',
      xpBefore: beforeXP,
      xpAfter: afterXP,
      xpDelta: bonusXP,
      levelBefore: oldLevel,
      levelAfter: data.level,
      achievementsBefore: beforeAchievements,
      achievementsAfter: afterAchievements,
      metadata: { multiplier: getXPMultiplier() }
    });

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
  // Pool & selection engine → heys_daily_missions_v1.js (HEYS.missions)

  function getDailyMissions() {
    const gameData = loadData();
    const today = getToday();
    const dayKey = `heys_dayv2_${today}`;

    // Load dayData directly to store missions
    let dayData = readStoredValue(dayKey, {});
    if (!dayData || typeof dayData !== 'object') dayData = {};

    // Инициализация или новый день (если в dayData пусто)
    if (!dayData.dailyMissions || dayData.dailyMissions.date !== today) {
      const selectFn = HEYS.missions?.selectDailyMissions;

      // Build excludeIds from last 7 days history
      const excludeIds = [];
      if (gameData.missionHistory) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        gameData.missionHistory
          .filter(h => new Date(h.date) >= cutoff)
          .forEach(h => excludeIds.push(...(h.ids || [])));
      }

      dayData.dailyMissions = {
        date: today,
        missions: selectFn ? selectFn(gameData.level, excludeIds) : [],
        completedCount: 0,
        bonusClaimed: false
      };

      // 📊 Update mission stats (attempts)
      gameData.missionStats = gameData.missionStats || {
        totalAttempts: 0,
        totalCompleted: 0,
        byType: {},
        completionRate: 0,
        favoriteCategories: [],
        lastUpdated: null
      };
      gameData.missionStats.totalAttempts += dayData.dailyMissions.missions.length;
      dayData.dailyMissions.missions.forEach(m => {
        if (!gameData.missionStats.byType[m.type]) {
          gameData.missionStats.byType[m.type] = { attempts: 0, completed: 0 };
        }
        gameData.missionStats.byType[m.type].attempts++;
      });

      // Store today's mission IDs in history
      gameData.missionHistory = gameData.missionHistory || [];
      gameData.missionHistory.push({
        date: today,
        ids: dayData.dailyMissions.missions.map(m => m.id)
      });
      // Keep only last 7 days
      gameData.missionHistory = gameData.missionHistory.slice(-7);

      // Save both
      setStoredValue(dayKey, dayData);

      // Update local gameData mirror for compatibility (if any legacy code reads it)
      gameData.dailyMissions = dayData.dailyMissions;
      saveData();
    }

    const dm = dayData.dailyMissions || {};
    return {
      date: dm.date,
      missions: dm.missions || [],
      completedCount: dm.completedCount || 0,
      allCompleted: (dm.completedCount || 0) >= 3,
      bonusClaimed: !!dm.bonusClaimed,
      bonusAvailable: (dm.completedCount || 0) >= 3 && !dm.bonusClaimed
    };
  }

  function updateDailyMission(type, value) {
    const gameData = loadData();
    const today = getToday();
    const dayKey = `heys_dayv2_${today}`;

    let dayData = readStoredValue(dayKey, {});
    // Fallback
    if (!dayData || typeof dayData !== 'object') dayData = {};

    if (!dayData.dailyMissions || dayData.dailyMissions.date !== today) {
      getDailyMissions(); // Will create in dayData
      dayData = readStoredValue(dayKey, {});
      if (!dayData.dailyMissions) return;
    }

    let missionCompleted = false;
    const missions = dayData.dailyMissions.missions || [];

    for (const mission of missions) {
      if (mission.completed) continue;

      let matches = false;
      let newProgress = mission.progress || 0;

      switch (mission.type) {
        case 'meals':
          if (type === 'product_added') {
            const mealsCount = HEYS.Day?.getMealsCount?.() || 0;
            newProgress = mealsCount;
            matches = true;
          }
          break;
        case 'early_meal':
          if (type === 'product_added') {
            const meals = HEYS.Day?.getMeals?.() || [];
            const firstMeal = meals[0];
            if (firstMeal?.time) {
              const hour = parseInt(firstMeal.time.split(':')[0]) || 0;
              if (hour < mission.target) {
                newProgress = 1;
                matches = true;
              }
            }
          }
          break;
        case 'products':
          if (type === 'product_added') {
            newProgress = HEYS.Day?.getUniqueProductsCount?.() || 0;
            matches = true;
          }
          break;
        case 'kcal':
          if (type === 'product_added') {
            const kcalPct = HEYS.Day?.getKcalPercent?.() || 0;
            newProgress = kcalPct;
            matches = true;
          }
          break;
        case 'water':
          if (type === 'water_added') {
            newProgress = value;
            matches = true;
          }
          break;
        case 'water_entries':
          if (type === 'water_added') {
            // Инкрементируем счетчик (dailyXP имеет лимит maxPerDay=5, реальных добавлений может быть больше)
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
          if (type === 'steps_updated') {
            newProgress = value;
            matches = true;
          }
          break;
        case 'steps_goal':
          if (type === 'steps_updated') {
            newProgress = value;
            matches = true;
          }
          break;
        case 'active_day':
          if (type === 'training_added' || type === 'steps_updated') {
            const hasTraining = type === 'training_added' || (HEYS.Day?.getTrainingsCount?.() || 0) > 0;
            const hasSteps = type === 'steps_updated' ? value >= 3000 : (HEYS.Day?.getSteps?.() || 0) >= 3000;
            if (hasTraining && hasSteps) {
              newProgress = 1;
              matches = true;
            }
          }
          break;
        case 'fiber':
          if (type === 'product_added') {
            const fiberPct = HEYS.Day?.getFiberPercent?.() || 0;
            newProgress = fiberPct;
            matches = true;
          }
          break;
        case 'protein':
          if (type === 'product_added') {
            const proteinPct = HEYS.Day?.getProteinPercent?.() || 0;
            newProgress = proteinPct;
            matches = true;
          }
          break;
        case 'complex_carbs':
          if (type === 'product_added') {
            const complexPct = HEYS.Day?.getComplexCarbsPercent?.() || 0;
            newProgress = complexPct;
            matches = true;
          }
          break;
        case 'low_harm':
          if (type === 'product_added') {
            const harmPct = HEYS.Day?.getHarmPercent?.() || 100;
            // Low harm = harm% < target (30). Progress is inverted: progress = target if harmPct <= target
            if (harmPct <= mission.target) {
              newProgress = mission.target;
              matches = true;
            } else {
              newProgress = Math.max(0, mission.target - (harmPct - mission.target));
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
        case 'streak_keep':
          if (type === 'product_added') {
            newProgress = 1;
            matches = true;
          }
          break;
        case 'dinner_time':
          if (type === 'product_added') {
            const meals = HEYS.Day?.getMeals?.() || [];
            if (meals.length > 0) {
              const lastHour = meals.reduce((max, m) => {
                const t = (m.time || '').split(':');
                const h = parseInt(t[0]) || 0;
                return h > max ? h : max;
              }, 0);
              if (lastHour > 0 && lastHour < (mission.threshold || 20)) {
                newProgress = 1;
                matches = true;
              }
            }
          }
          break;
        case 'no_late_snack':
          if (type === 'product_added') {
            const allMeals = HEYS.Day?.getMeals?.() || [];
            const hasLate = allMeals.some(m => {
              const h = parseInt((m.time || '').split(':')[0]) || 0;
              return h >= (mission.threshold || 21);
            });
            newProgress = hasLate ? 0 : 1;
            matches = true;
          }
          break;
        case 'eating_window':
          if (type === 'product_added') {
            const ew_meals = HEYS.Day?.getMeals?.() || [];
            if (ew_meals.length >= 2) {
              const times = ew_meals.map(m => {
                const [h, min] = (m.time || '0:0').split(':').map(Number);
                return h * 60 + (min || 0);
              });
              const windowHrs = (Math.max(...times) - Math.min(...times)) / 60;
              if (windowHrs <= (mission.threshold || 12)) {
                newProgress = 1;
                matches = true;
              }
            }
          }
          break;
        case 'log_mood':
          if (type === 'product_added') {
            const moodMeals = HEYS.Day?.getMeals?.() || [];
            const hasMood = moodMeals.some(m => m.mood && m.mood > 0);
            if (hasMood) {
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
          dayData.dailyMissions.completedCount++;
          missionCompleted = true;

          // 📊 Update mission stats (completed)
          gameData.missionStats = gameData.missionStats || {
            totalAttempts: 0,
            totalCompleted: 0,
            byType: {},
            completionRate: 0,
            favoriteCategories: [],
            lastUpdated: null
          };
          gameData.missionStats.totalCompleted++;
          if (!gameData.missionStats.byType[mission.type]) {
            gameData.missionStats.byType[mission.type] = { attempts: 0, completed: 0 };
          }
          gameData.missionStats.byType[mission.type].completed++;
          // Recalculate completion rate
          if (gameData.missionStats.totalAttempts > 0) {
            gameData.missionStats.completionRate = Math.round(
              (gameData.missionStats.totalCompleted / gameData.missionStats.totalAttempts) * 100
            );
          }
          gameData.missionStats.lastUpdated = new Date().toISOString();

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

    // Save dayData
    setStoredValue(dayKey, dayData);

    // Mirror to gameData for safety
    gameData.dailyMissions = dayData.dailyMissions;
    saveData();

    // Проверяем бонус за все 3 миссии — автоклейм
    if (dayData.dailyMissions.completedCount >= 3 && !dayData.dailyMissions.bonusClaimed) {
      dayData.dailyMissions.bonusClaimed = true;
      setStoredValue(dayKey, dayData); // Save bonus state to day

      gameData.dailyMissions = dayData.dailyMissions; // Mirror
      saveData();

      triggerImmediateSync('daily_missions_bonus');
      _addXPInternal(50, 'daily_missions_bonus');
      celebrate();
      showNotification('all_missions_complete', { bonus: 50 });
      playMissionSound(true);
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

  // ========== RECALCULATE MISSIONS PROGRESS ==========
  /**
   * Recalculate daily missions progress from current day state
   * Called on day load, product added, water added events
   * Does NOT complete missions or award XP - only updates progress
   */
  function recalculateDailyMissionsProgress() {
    const data = loadData();
    const today = getToday();

    if (!data.dailyMissions || data.dailyMissions.date !== today) {
      return { updated: false, missions: [] };
    }

    let updated = false;

    for (const mission of data.dailyMissions.missions) {
      if (mission.completed) continue;

      let newProgress = 0;

      switch (mission.type) {
        case 'meals':
          newProgress = HEYS.Day?.getMealsCount?.() || 0;
          break;
        case 'products':
          newProgress = HEYS.Day?.getUniqueProductsCount?.() || 0;
          break;
        case 'water':
          newProgress = HEYS.Day?.getWaterPercent?.() || 0;
          break;
        case 'water_entries':
          // Не пересчитываем - используем инкрементальный счетчик из updateDailyMission
          // (вода не хранится как массив записей, только суммарный waterMl)
          newProgress = mission.progress || 0;
          break;
        case 'kcal':
          newProgress = HEYS.Day?.getKcalPercent?.() || 0;
          break;
        case 'fiber':
          newProgress = HEYS.Day?.getFiberPercent?.() || 0;
          break;
        case 'protein':
          newProgress = HEYS.Day?.getProteinPercent?.() || 0;
          break;
        case 'complex_carbs':
          newProgress = HEYS.Day?.getComplexCarbsPercent?.() || 0;
          break;
        case 'harm':
          newProgress = HEYS.Day?.getHarmPercent?.() || 0;
          break;
        case 'steps':
          newProgress = HEYS.Day?.getSteps?.() || 0;
          break;
        case 'steps_goal':
          newProgress = HEYS.Day?.getSteps?.() || 0;
          break;
        case 'training':
          newProgress = (HEYS.Day?.getTrainingsCount?.() || 0) > 0 ? 1 : 0;
          break;
        case 'active_day':
          const hasTraining = (HEYS.Day?.getTrainingsCount?.() || 0) > 0;
          const hasSteps = (HEYS.Day?.getSteps?.() || 0) >= 3000;
          newProgress = (hasTraining && hasSteps) ? 1 : 0;
          break;
        case 'early_meal':
          const meals = HEYS.Day?.getMeals?.() || [];
          const firstMeal = meals[0];
          if (firstMeal?.time) {
            const hour = parseInt(firstMeal.time.split(':')[0]) || 0;
            newProgress = (hour < mission.target) ? 1 : 0;
          }
          break;
        case 'dinner_time':
          const allMeals = HEYS.Day?.getMeals?.() || [];
          if (allMeals.length > 0) {
            const lastHour = allMeals.reduce((max, m) => {
              const t = (m.time || '').split(':');
              const h = parseInt(t[0]) || 0;
              return h > max ? h : max;
            }, 0);
            newProgress = (lastHour > 0 && lastHour < (mission.threshold || 20)) ? 1 : 0;
          }
          break;
        case 'no_late_snack':
          const mls = HEYS.Day?.getMeals?.() || [];
          const hasLate = mls.some(m => {
            const h = parseInt((m.time || '').split(':')[0]) || 0;
            return h >= (mission.threshold || 21);
          });
          newProgress = hasLate ? 0 : 1;
          break;
        case 'eating_window':
          const ewMeals = HEYS.Day?.getMeals?.() || [];
          if (ewMeals.length >= 2) {
            const times = ewMeals.map(m => {
              const [h, min] = (m.time || '0:0').split(':').map(Number);
              return h * 60 + (min || 0);
            });
            const windowHrs = (Math.max(...times) - Math.min(...times)) / 60;
            newProgress = (windowHrs <= (mission.threshold || 12)) ? 1 : 0;
          }
          break;
        case 'log_mood':
          const moodMeals = HEYS.Day?.getMeals?.() || [];
          const hasMood = moodMeals.some(m => m.mood && m.mood > 0);
          newProgress = hasMood ? 1 : 0;
          break;
      }

      if (mission.progress !== newProgress) {
        mission.progress = newProgress;
        updated = true;
      }
    }

    if (updated) {
      saveData();
      window.dispatchEvent(new CustomEvent('heysDailyMissionsUpdate', {
        detail: getDailyMissions()
      }));
    }

    return { updated, missions: data.dailyMissions.missions };
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
    if (HEYS.audio) {
      HEYS.audio.play(isLevelUp ? 'levelUp' : 'xpGained');
    }
  }

  // 🎵 Achievement sound (special fanfare)
  function playAchievementSound() {
    if (HEYS.audio) {
      HEYS.audio.play('achievementUnlocked');
    }
  }

  // 🏆 Rank ceremony sound (longer, more epic)
  function playRankCeremonySound() {
    if (HEYS.audio) {
      HEYS.audio.play('rankCeremony');
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

    // 🔒 v4.0: Полная блокировка UI во время загрузки/rebuild
    if (_isLoadingPhase || _isRebuilding || _suppressUIUpdates) return;

    const fromTitle = getLevelTitle(oldLevel);
    const toTitle = getLevelTitle(newLevel);

    if (fromTitle.title === toTitle.title) return;

    // 🛡️ Не показываем повторно один и тот же ранг при входе/синке
    const lastShown = readStoredValue('heys_rank_ceremony_last', null);
    if (lastShown && lastShown.title === toTitle.title && (lastShown.level || 0) >= newLevel) {
      return;
    }
    setStoredValue('heys_rank_ceremony_last', {
      title: toTitle.title,
      level: newLevel,
      ts: Date.now()
    });

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

      // v3.1: Приоритет — реальные суммы XP из аудита (_dailyXPTotals)
      // Fallback — подсчёт через XP_ACTIONS (для реал-тайм данных сегодня)
      let totalDayXP = 0;

      if (data._dailyXPTotals && data._dailyXPTotals[dateStr]) {
        totalDayXP = data._dailyXPTotals[dateStr];
      } else {
        // Fallback: старый метод через XP_ACTIONS (работает для текущего дня)
        const dayXP = data.dailyXP[dateStr] || {};
        for (const reason of Object.keys(dayXP)) {
          const action = XP_ACTIONS[reason];
          if (action) {
            totalDayXP += dayXP[reason] * action.xp;
          }
        }
      }

      // v3.1: Для сегодня — берём max из обоих источников
      // (реал-тайм действия могут быть новее чем последний rebuild)
      if (dateStr === today.toISOString().slice(0, 10) && data.dailyXP[dateStr]) {
        let realtimeXP = 0;
        const dayXP = data.dailyXP[dateStr];
        for (const reason of Object.keys(dayXP)) {
          const action = XP_ACTIONS[reason];
          if (action) {
            realtimeXP += dayXP[reason] * action.xp;
          }
        }
        totalDayXP = Math.max(totalDayXP, realtimeXP);
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
    // 🔒 v4.0: Не показываем уведомления во время загрузки данных
    if (_isLoadingPhase) return;
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
    if (_isLoadingPhase) return;
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
    // 🛡️ FIX: Не проверяем ачивки пока идёт rebuild/загрузка — предотвращает дубли
    if (_isRebuilding || _isLoadingPhase) return [];

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
    // 🛡️ FIX: Не выдаём ачивки пока идёт rebuild/загрузка
    if (_isRebuilding || _isLoadingPhase) return [];

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
    // 🛡️ FIX: Не выдаём ачивки пока идёт rebuild или загрузка — данные могут быть неполными
    // 🔒 v4.0: Во время loading phase rebuild сам восстанавливает ачивки из аудита
    if (_isRebuilding || _isLoadingPhase) return;

    // 🔒 FIX v2.7: Mutex — предотвращаем параллельную разблокировку одного достижения
    if (_unlockingAchievements.has(achievementId)) {
      console.warn(`[🎮 Gamification] Blocked duplicate unlock attempt: ${achievementId}`);
      return;
    }
    _unlockingAchievements.add(achievementId);

    try {
      const data = loadData();
      const ach = ACHIEVEMENTS[achievementId];
      if (!ach || data.unlockedAchievements.includes(achievementId)) {
        _unlockingAchievements.delete(achievementId);
        return;
      }

      const beforeXP = data.totalXP;
      const beforeLevel = data.level;
      const beforeAchievements = data.unlockedAchievements.length;

      data.unlockedAchievements.push(achievementId);

      // Начисляем XP за достижение
      const oldLevel = data.level;
      data.totalXP += ach.xp;
      data.level = calculateLevel(data.totalXP);
      const afterXP = data.totalXP;
      const afterAchievements = data.unlockedAchievements.length;
      handleRankTransition(oldLevel, data.level);

      // 🔒 FIX: Синхронизируем кеш ПЕРЕД saveData() чтобы избежать race condition с rebuild
      _data = data;
      saveData();
      triggerImmediateSync('achievement_unlocked');

      queueGamificationEvent({
        action: 'achievement_unlocked',
        reason: achievementId,
        xpBefore: beforeXP,
        xpAfter: afterXP,
        xpDelta: ach.xp,
        levelBefore: beforeLevel,
        levelAfter: data.level,
        achievementsBefore: beforeAchievements,
        achievementsAfter: afterAchievements,
        metadata: {
          achievementId: ach.id,
          achievementName: ach.name,
          rarity: ach.rarity,
          category: ach.category
        }
      });

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
    } finally {
      // 🔓 FIX v2.7: Всегда очищаем mutex, даже при ошибке
      _unlockingAchievements.delete(achievementId);
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

    /** Фаза загрузки — все UI-нотификации подавлены */
    get isLoadingPhase() {
      return _isLoadingPhase;
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
      const migrationKey = 'heys_achievements_v5_migrated'; // 🔥 V5: фикс first_meal/first_product

      // Проверяем, была ли миграция
      if (readStoredValue(migrationKey, null) === 'true') {
        console.log('[🎮 Gamification] Migration v5 already done, skipping');
        return [];
      }

      console.log('[🎮 Gamification] Recalculating missed achievements...');
      console.log('[🎮 Gamification] Current state:', {
        totalXP: data.totalXP,
        level: data.level,
        unlockedCount: data.unlockedAchievements.length,
        unlocked: data.unlockedAchievements
      });

      const missedAchievements = [];
      const today = getToday(); // 🔥 FIX: определяем today

      // Получаем историю
      const streak = safeGetStreak();
      const stats = data.stats || {};

      console.log('[🎮 Gamification] Checking streak:', streak);

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
      const todayKey = `heys_dayv2_${today}`;
      const todayDay = readStoredValue(todayKey, null);
      const mealsCount = HEYS.Day?.getMealsCount?.() || (todayDay?.meals?.length || 0);
      const stepsValue = (todayDay?.steps || 0) || (HEYS.Day?.getDay?.()?.steps || 0);
      const advicesRead = stats.totalAdvicesRead || 0;

      // 🔥 V5 FIX: Проверяем реальное количество продуктов в localStorage
      let hasProducts = false;
      let hasMealsWithProducts = false;
      let daysWithMealsCount = 0;
      try {
        // Проверка 1: есть ли продукты в базе (heys_products)
        const productsKey = HEYS.cloud?.scopeKey ? HEYS.cloud.scopeKey('heys_products') : 'heys_products';
        const productsData = readStoredValue(productsKey, null);
        if (Array.isArray(productsData) && productsData.length > 0) {
          hasProducts = true;
        }
        console.log('[🎮 Gamification] Products check:', { productsKey, count: productsData?.length || 0, hasProducts });

        // Проверка 2: есть ли хотя бы один приём с продуктами в днях
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
          if (parsed?.meals) {
            for (const meal of parsed.meals) {
              if (meal.items && meal.items.length > 0) {
                hasMealsWithProducts = true;
                daysWithMealsCount++;
                break;
              }
            }
          }
          if (hasMealsWithProducts && daysWithMealsCount >= 3) break; // Достаточно для проверки
        }
        console.log('[🎮 Gamification] Meals check:', { daysWithMealsCount, hasMealsWithProducts, mealsCount });
      } catch (e) {
        console.warn('[🎮 Gamification] Error checking products:', e);
      }
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

      console.log('[🎮 Gamification] Onboarding checks:', {
        hasProducts,
        hasMealsWithProducts,
        mealsCount,
        hasFirstProduct: data.unlockedAchievements.includes('first_product'),
        hasFirstMeal: data.unlockedAchievements.includes('first_meal')
      });

      // 🔥 V5 FIX: используем hasMealsWithProducts вместо stats.totalProducts
      if (hasMealsWithProducts && !data.unlockedAchievements.includes('first_product')) {
        console.log('[🎮 Gamification] ✅ Adding first_product achievement');
        data.unlockedAchievements.push('first_product');
        data.totalXP += ACHIEVEMENTS.first_product.xp;
        missedAchievements.push('first_product');
      }

      // 🔥 V5 FIX: проверяем наличие хотя бы одного приёма из сканирования
      if ((mealsCount > 0 || hasMealsWithProducts) && !data.unlockedAchievements.includes('first_meal')) {
        console.log('[🎮 Gamification] ✅ Adding first_meal achievement');
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
     * 🔧 FIX v2.5: Проверяем, является ли текущая сессия кураторской
     * Для кураторов нет PIN session — cloud sync делается через storage sync layer
     */
    _isCuratorMode() {
      return HEYS.auth?.isCuratorSession?.() === true ||
        !!localStorage.getItem('heys_curator_session');
    },

    /**
     * 🔧 FIX v2.5: Получение session token с правильной десериализацией
     * HEYS.cloud.getSessionToken НЕ существует — используем HEYS.auth.getSessionToken
     * Для кураторов возвращает null — они используют storage sync layer
     */
    _getSessionTokenForCloud() {
      // Priority 1: Auth module (properly JSON-parsed)
      if (HEYS.auth?.getSessionToken) {
        const token = HEYS.auth.getSessionToken();
        if (token) return token;
      }
      // Priority 2: Parse from localStorage (lsGet does JSON.parse)
      try {
        const raw = localStorage.getItem('heys_session_token');
        if (raw) {
          try { return JSON.parse(raw); } catch { return raw; }
        }
      } catch (e) { /* ignore */ }
      return null;
    },

    /**
     * 🔧 FIX v2.5: Unwrap PG scalar function response
     * SELECT * FROM func() wraps JSONB result in {func_name: {actual_data}}
     */
    _unwrapKvResult(rpcResult) {
      if (!rpcResult || rpcResult.error) return null;
      const data = rpcResult.data;
      if (!data || typeof data !== 'object') return null;
      // If data already has 'success' or 'value' key — it's already unwrapped
      if ('success' in data || 'value' in data || 'found' in data) return data;
      // Unwrap single-key column wrapper (e.g. {get_client_kv_by_session: {...}})
      const keys = Object.keys(data);
      if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') {
        return data[keys[0]];
      }
      return data;
    },

    /**
     * ☁️ Синхронизация прогресса с облаком
     * 🛡️ ЗАЩИТА: Не перезаписывает облако если там больше XP
     * 🔧 FIX v2.5: Правильные p_ параметры + unwrap ответа + error checking
     */
    async syncToCloud() {
      const syncTrace = startGameSyncTrace('syncToCloud');
      try {
        // � Mutex: предотвращаем параллельные записи в облако
        if (_syncInProgress) {
          console.info('[🎮 Gamification] syncToCloud: already in progress, skipping');
          endGameSyncTrace(syncTrace, 'skipped', { reason: 'already_in_progress' });
          return false;
        }
        _syncInProgress = true;

        try {
          // �🔧 FIX v2.6: Для кураторов cloud sync через storage sync layer
          if (this._isCuratorMode()) {
            // Куратор: данные синхронизируются через storage sync layer (heys_storage_supabase_v1.js)
            // который уже сохраняет heys_game в облако под scoped ключом
            gameSyncTraceStep(syncTrace, 'curator_mode:skip_direct_rpc');
            endGameSyncTrace(syncTrace, 'ok', { mode: 'curator' });
            return true;
          }

          const sessionToken = this._getSessionTokenForCloud();

          if (!HEYS.YandexAPI || !sessionToken) {
            endGameSyncTrace(syncTrace, 'skipped', { reason: 'no_api_or_session' });
            return false;
          }

          const data = loadData();

          // 🛡️ Не синхронизируем пустые данные в облако
          // FIX v2.4: typeof check — XP=0 is valid, only skip if data is truly broken
          if (typeof data.totalXP !== 'number') {
            console.log('[🎮 Gamification] Skip cloud sync — no XP data');
            endGameSyncTrace(syncTrace, 'skipped', { reason: 'invalid_local_data' });
            return false;
          }

          // 🛡️ ЗАЩИТА v2.1: Сначала проверяем облако — не перезаписываем если там новее/больше
          try {
            // 🔧 FIX v2.5: p_ prefixed params + proper response unwrap
            const cloudResult = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
              p_session_token: sessionToken,
              p_key: STORAGE_KEY
            });

            if (cloudResult?.error) {
              console.warn('[🎮 Gamification] Cloud check RPC error:', cloudResult.error?.message || cloudResult.error);
              // Продолжаем синхронизацию — лучше записать чем ничего
            }

            const kvData = this._unwrapKvResult(cloudResult);
            const cloudData_ = kvData?.value || {};
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
              // v62: If audit has already reconciled XP downward (drift correction from cloud to audit-correct),
              // allow one-time force write to overwrite stale cloud value instead of loading stale data back.
              if (_auditRebuildDone && _auditDowngradedXP) {
                console.info(`[🎮 Gamification] AUDIT RECONCILE: cloud XP (${cloudXP}) > local (${data.totalXP}), but audit downgraded — force-writing corrected XP to cloud`);
                _auditDowngradedXP = false; // One-time override consumed
                // Fall through to write local (audit-correct) data to cloud
              } else {
                console.warn(`[🎮 Gamification] BLOCKED: cloud XP (${cloudXP}) > local (${data.totalXP}), not overwriting!`);
                // Вместо этого — загружаем из облака
                await HEYS.game.loadFromCloud();
                endGameSyncTrace(syncTrace, 'ok', { reason: 'blocked_cloud_higher_xp', cloudXP, localXP: data.totalXP });
                return false;
              }
            }

            // 🛡️ v2.2: Блокируем если облако богаче деталями при равном XP
            if (cloudXP === data.totalXP && cloudIsRicher) {
              console.warn(`[🎮 Gamification] BLOCKED: cloud has richer data (achievements: ${cloudAchievements} vs ${localAchievements}, stats: ${cloudStatsCount} vs ${localStatsCount})`);
              await HEYS.game.loadFromCloud();
              endGameSyncTrace(syncTrace, 'ok', { reason: 'blocked_cloud_richer' });
              return false;
            }

            if (cloudUpdatedAt && data.updatedAt && cloudUpdatedAt > data.updatedAt) {
              console.warn('[🎮 Gamification] BLOCKED: cloud data is newer, loading instead');
              await HEYS.game.loadFromCloud();
              endGameSyncTrace(syncTrace, 'ok', { reason: 'blocked_cloud_newer' });
              return false;
            }
          } catch (checkErr) {
            // Если не удалось проверить — продолжаем синхронизацию (лучше чем ничего)
            console.warn('[🎮 Gamification] Cloud check failed, proceeding:', checkErr.message);
            gameSyncTraceStep(syncTrace, 'cloud_precheck:failed_proceed', { message: checkErr.message });
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

          // 🔧 FIX v2.5: p_ prefixed params + error checking
          const upsertResult = await HEYS.YandexAPI.rpc('upsert_client_kv_by_session', {
            p_session_token: sessionToken,
            p_key: STORAGE_KEY,   // 'heys_game'
            p_value: cloudData    // Отправляем объект, не JSON.stringify
          });

          if (upsertResult?.error) {
            console.error('[🎮 Gamification] Cloud upsert FAILED:', upsertResult.error?.message || upsertResult.error);
            endGameSyncTrace(syncTrace, 'error', { reason: 'upsert_failed', message: upsertResult.error?.message || upsertResult.error });
            return false;
          }

          console.info('[🎮 Gamification] ✅ Synced to cloud: XP=' + data.totalXP + ', level=' + data.level);
          endGameSyncTrace(syncTrace, 'ok', { reason: 'upsert_success', xp: data.totalXP, level: data.level });
          return true;
        } finally {
          _syncInProgress = false;
        }
      } catch (e) {
        _syncInProgress = false;
        console.warn('[🎮 Gamification] Cloud sync failed:', e.message);
        endGameSyncTrace(syncTrace, 'error', { message: e.message });
        return false;
      }
    },

    /**
     * ☁️ Загрузка прогресса из облака
     * 🔧 FIX v2.5: Правильные p_ параметры + unwrap ответа + error checking
     */
    async loadFromCloud() {
      // 🔒 v4.0: Promise dedup — предотвращаем параллельные вызовы
      if (_loadFromCloudPromise) {
        console.info('[🎮 Gamification] loadFromCloud: reusing existing promise');
        return _loadFromCloudPromise;
      }
      _loadFromCloudPromise = this._loadFromCloudImpl();
      try {
        return await _loadFromCloudPromise;
      } finally {
        _loadFromCloudPromise = null;
      }
    },

    async _loadFromCloudImpl() {
      const syncTrace = startGameSyncTrace('loadFromCloud');
      try {
        // 🔧 FIX v2.6: Для кураторов cloud sync через storage sync layer
        if (this._isCuratorMode()) {
          // Куратор: данные загружаются через storage sync layer (heys_storage_supabase_v1.js)
          // который пишет game data в localStorage как heys_game
          // Данные уже в localStorage — просто помечаем как загруженные
          console.info('[🎮 Gamification] loadFromCloud: curator mode — using storage sync layer');
          gameSyncTraceStep(syncTrace, 'mode:curator');
          _cloudLoaded = true;
          if (_pendingCloudSync) {
            _pendingCloudSync = false;
            triggerImmediateSync('pending_sync');
          }
          // Перечитываем данные из localStorage (storage sync мог обновить)
          _data = null; // сбросим кеш

          // 🚀 PERF v7.0: Dispatch bar update IMMEDIATELY from localStorage,
          // defer heavy audit (3-6 RPC calls, ~2-4s) to avoid competing with DayTab sync
          _data = loadData();
          const immediateStats = game.getStats();
          // 🔒 v4.0: isInitialLoad — React не покажет модалки
          // RC-2 fix: reason: 'cloud_load_complete' — снимает level guard event-driven
          window.dispatchEvent(new CustomEvent('heysGameUpdate', {
            detail: { ...immediateStats, isInitialLoad: true, reason: 'cloud_load_complete' }
          }));

          // 🚀 PERF v7.0: Defer audit — runs AFTER DayTab sync finishes (5s)
          // ensureAuditConsistency does 3-6 sequential RPC calls (~2-4s)
          // competing with bootstrapClientSync for API bandwidth
          console.info('[🎮 Gamification] 🚀 PERF v7.0: Audit deferred 5s (not blocking DayTab sync)');
          setTimeout(async () => {
            const auditTrace = startGameSyncTrace('deferredAudit');
            _suppressUIUpdates = true;
            try {
              await ensureAuditConsistency('curator-load');
            } catch (e) {
              console.error('[🎮 Gamification] ❌ Deferred audit failed:', e);
              endGameSyncTrace(auditTrace, 'error', { error: String(e) });
              return;
            } finally {
              _suppressUIUpdates = false;
            }
            if (!_data) _data = loadData();
            const auditStats = game.getStats();
            if (auditStats.totalXP !== immediateStats.totalXP || auditStats.level !== immediateStats.level) {
              console.info('[🎮 Gamification] 🔄 Audit reconciliation: XP', immediateStats.totalXP, '→', auditStats.totalXP);
              window.dispatchEvent(new CustomEvent('heysGameUpdate', {
                detail: { ...auditStats, isInitialLoad: true, reason: 'audit_reconciliation' }
              }));
            }
            endGameSyncTrace(auditTrace, 'ok', { reason: 'deferred_audit_complete' });
          }, 5000);

          endGameSyncTrace(syncTrace, 'ok', { mode: 'curator', reason: 'storage_layer_flow' });
          return true;
        }

        const sessionToken = this._getSessionTokenForCloud();

        if (!HEYS.YandexAPI || !sessionToken) {
          console.log('[🎮 Gamification] loadFromCloud: no API or session token');
          _cloudLoaded = true; // Помечаем как загружено даже если нет токена
          if (_pendingCloudSync) {
            _pendingCloudSync = false;
            triggerImmediateSync('pending_sync');
          }
          endGameSyncTrace(syncTrace, 'skipped', { reason: 'no_api_or_session' });
          return false;
        }

        console.log('[🎮 Gamification] loadFromCloud: fetching from cloud...');

        // Пробуем оба ключа: новый (heys_game) и старый (heys_gamification)
        let cloudData = null;

        // 1. Новый ключ
        // 🔧 FIX v2.5: p_ prefixed params + unwrap response
        const result1 = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
          p_session_token: sessionToken,
          p_key: STORAGE_KEY // 'heys_game'
        });
        gameSyncTraceStep(syncTrace, 'rpc:get_heys_game:done', { hasError: Boolean(result1?.error) });

        if (result1?.error) {
          console.warn('[🎮 Gamification] loadFromCloud RPC error:', result1.error?.message || result1.error);
        }

        const kv1 = this._unwrapKvResult(result1);
        if (kv1?.value) {
          cloudData = typeof kv1.value === 'string' ? JSON.parse(kv1.value) : kv1.value;
          console.log('[🎮 Gamification] loadFromCloud: found data in heys_game, XP=' + (cloudData?.totalXP ?? 'N/A'));
        }

        // 2. Старый ключ (fallback)
        // FIX v2.4: typeof check — totalXP=0 is valid cloud data, not missing
        if (!cloudData || typeof cloudData.totalXP !== 'number') {
          const result2 = await HEYS.YandexAPI.rpc('get_client_kv_by_session', {
            p_session_token: sessionToken,
            p_key: 'heys_gamification'
          });
          gameSyncTraceStep(syncTrace, 'rpc:get_heys_gamification:done', { hasError: Boolean(result2?.error) });
          const kv2 = this._unwrapKvResult(result2);
          if (kv2?.value) {
            const legacyData = typeof kv2.value === 'string' ? JSON.parse(kv2.value) : kv2.value;
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

        // FIX v2.4: typeof check — allow merging even when cloud totalXP=0
        if (cloudData && typeof cloudData.totalXP === 'number') {
          const localData = loadData();
          const merged = mergeGameData(localData, cloudData);

          _data = merged;
          setStoredValue(STORAGE_KEY, _data);
          // v61: Persist merged XP to cache immediately to prevent drift in ensureAuditConsistency
          _saveXPCache(merged.totalXP || 0, merged._lastKnownEventCount || 0);
          _cloudLoaded = true;

          window.dispatchEvent(new CustomEvent('heysGameUpdate', {
            detail: { ...game.getStats(), isInitialLoad: _isLoadingPhase }
          }));

          // � v3.0: Единственная точка проверки — lightweight consistency check
          // Заменяет двойной rebuild (setTimeout + ensureAuditConsistency)
          ensureAuditConsistency('cloud-merge');

          endGameSyncTrace(syncTrace, 'ok', {
            reason: 'cloud_merge',
            cloudXP: cloudData.totalXP,
            mergedXP: _data?.totalXP || 0
          });
          return true;
        }

        // FIX v2.4: Даже если cloud пуст — пробуем восстановить из аудита
        console.info('[🎮 Gamification] No cloud data, attempting audit rebuild...');
        ensureAuditConsistency('cloud-empty');

        endGameSyncTrace(syncTrace, 'ok', { reason: 'cloud_empty_audit_consistency' });
        return false;
      } catch (e) {
        _cloudLoaded = true; // Помечаем даже при ошибке
        if (_pendingCloudSync) {
          _pendingCloudSync = false;
          triggerImmediateSync('pending_sync');
        }
        console.warn('[🎮 Gamification] Cloud load failed:', e.message);
        endGameSyncTrace(syncTrace, 'error', { message: e.message });
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

    // 🔊 Sound settings API — delegates to HEYS.audio
    getSoundSettings: () => {
      if (!HEYS.audio) return loadSoundSettings();
      const settings = HEYS.audio.getSettings();
      return {
        enabled: settings.masterEnabled !== false,
        masterEnabled: settings.masterEnabled !== false,
        volume: settings.volume,
        hapticEnabled: settings.hapticEnabled !== false,
        quietHoursEnabled: settings.quietHoursEnabled !== false,
      };
    },
    setSoundSettings: (settings) => {
      if (HEYS.audio) {
        HEYS.audio.saveSettings({
          masterEnabled: settings?.masterEnabled ?? settings?.enabled,
          volume: settings?.volume,
          hapticEnabled: settings?.hapticEnabled,
          quietHoursEnabled: settings?.quietHoursEnabled,
        });
      } else {
        saveSoundSettings(settings);
      }
    },

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
    refreshDailyBonusFromAudit,
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

    // Daily Missions (pool → HEYS.missions module)
    getDailyMissions,
    updateDailyMission,
    claimDailyMissionsBonus,
    recalculateDailyMissionsProgress,

    // 📊 Get mission statistics (completion rates, favorites)
    getMissionStats() {
      const data = loadData();
      const stats = data.missionStats || {
        totalAttempts: 0,
        totalCompleted: 0,
        byType: {},
        completionRate: 0,
        favoriteCategories: [],
        lastUpdated: null
      };

      // Recalculate favorite categories based on completion rates
      const categoryStats = {};
      const CATEGORY_META = HEYS.missions?.CATEGORY_META || {};

      Object.entries(stats.byType).forEach(([type, typeStats]) => {
        const mission = (HEYS.missions?.DAILY_MISSION_POOL || []).find(m => m.type === type);
        if (mission && mission.category) {
          if (!categoryStats[mission.category]) {
            categoryStats[mission.category] = { attempts: 0, completed: 0 };
          }
          categoryStats[mission.category].attempts += typeStats.attempts;
          categoryStats[mission.category].completed += typeStats.completed;
        }
      });

      const favorites = Object.entries(categoryStats)
        .map(([cat, catStats]) => ({
          category: cat,
          label: CATEGORY_META[cat]?.label || cat,
          emoji: CATEGORY_META[cat]?.emoji || '📋',
          attempts: catStats.attempts,
          completed: catStats.completed,
          completionRate: catStats.attempts > 0
            ? Math.round((catStats.completed / catStats.attempts) * 100)
            : 0
        }))
        .sort((a, b) => b.completionRate - a.completionRate)
        .slice(0, 3);

      return {
        ...stats,
        favoriteCategories: favorites
      };
    },

    // 📊 Calculate behavior metrics (for adaptive missions)
    calculateBehaviorMetrics,

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

    // Audit History (cloud)
    getAuditHistory: fetchGamificationHistory,

    // 🔧 FIX v2.4: Rebuild XP from audit log (source of truth)
    rebuildXPFromAudit,

    // Streak Shield
    canUseStreakShield,
    useStreakShield,
    getStreakShieldStatus,

    // XP Breakdown
    getXPBreakdown,

    // Level-up Preview
    getLevelUpPreview,

    // Streak achievements
    checkStreakAchievements,

    // 🔍 Debug: верификация XP
    async verifyXP() {
      try {
        console.group('🔍 [HEYS.game] XP Verification');
        const data = loadData();
        const cachedXP = data.totalXP || 0;
        console.log('📊 UI (localStorage):', cachedXP, 'XP');
        console.log('📊 Level:', data.level, '/', calculateLevel(cachedXP));
        console.log('📊 Achievements:', data.unlockedAchievements?.length || 0);

        // Fetch audit
        await flushAuditQueue();
        const allEvents = [];
        let offset = 0;
        const PAGE_SIZE = 500;
        for (let page = 0; page < 20; page++) {
          const result = await fetchGamificationHistory({ limit: PAGE_SIZE, offset });
          const items = result?.items || [];
          if (items.length === 0) break;
          allEvents.push(...items);
          offset += items.length;
          if (items.length < PAGE_SIZE) break;
        }

        // Calculate from audit
        let auditXP = 0;
        const seenAch = new Set();
        const breakdown = { xp_gain: 0, daily_bonus: 0, achievements: 0, rebuilds: 0 };
        allEvents.forEach(e => {
          const delta = e.xp_delta || 0;
          if (e.action === 'xp_gain' && delta > 0) {
            auditXP += delta;
            breakdown.xp_gain += delta;
          } else if (e.action === 'daily_bonus' && delta > 0) {
            auditXP += delta;
            breakdown.daily_bonus += delta;
          } else if (e.action === 'achievement_unlocked' && e.reason && delta > 0) {
            if (!seenAch.has(e.reason)) {
              seenAch.add(e.reason);
              auditXP += delta;
              breakdown.achievements += delta;
            }
          } else if (e.action === 'xp_rebuild' && delta > 0) {
            breakdown.rebuilds += delta;
          }
        });

        console.log('📊 Audit XP:', auditXP);
        console.log('   - xp_gain:', breakdown.xp_gain);
        console.log('   - daily_bonus:', breakdown.daily_bonus);
        console.log('   - achievements:', breakdown.achievements, `(${seenAch.size} unique)`);
        console.log('   - rebuilds:', breakdown.rebuilds, '(не входят в total)');
        console.log('📊 Drift:', cachedXP - auditXP, cachedXP > auditXP ? '(UI > audit)' : '(audit > UI)');
        console.log('📊 Total events:', allEvents.length);

        // Дубликаты ачивок
        const achDupes = {};
        allEvents.forEach(e => {
          if (e.action === 'achievement_unlocked' && e.reason) {
            achDupes[e.reason] = (achDupes[e.reason] || 0) + 1;
          }
        });
        const dupes = Object.entries(achDupes).filter(([_, count]) => count > 1);
        if (dupes.length > 0) {
          console.warn('⚠️ Duplicate achievements:');
          dupes.forEach(([ach, count]) => console.warn(`   - ${ach}: ${count}x`));
          console.log('💡 Cleanup: await HEYS.game.cleanupDuplicateAchievements()');
        }

        console.groupEnd();
        return { cachedXP, auditXP, drift: cachedXP - auditXP, breakdown, dupes, events: allEvents.length };
      } catch (err) {
        console.error('❌ verifyXP failed:', err);
        console.groupEnd();
        return { error: err.message };
      }
    },

    // 🧹 Cleanup: удалить дубли ачивок из localStorage + audit log
    async cleanupDuplicateAchievements() {
      console.group('🧹 [HEYS.game] Cleanup Duplicate Achievements');
      try {
        const data = loadData();
        let changed = false;

        // ✅ STEP 1: Дедупликация unlockedAchievements в localStorage
        const beforeCount = data.unlockedAchievements.length;
        const beforeUnique = new Set(data.unlockedAchievements).size;

        if (beforeCount > beforeUnique) {
          console.warn(`Found ${beforeCount - beforeUnique} duplicates in localStorage unlockedAchievements`);
          data.unlockedAchievements = [...new Set(data.unlockedAchievements)];
          changed = true;
          console.log(`✅ Deduplicated: ${beforeCount} → ${data.unlockedAchievements.length}`);
        }

        // ✅ STEP 2: Scan audit log for duplicates
        await flushAuditQueue();
        const allEvents = [];
        let offset = 0;
        for (let page = 0; page < 20; page++) {
          const result = await fetchGamificationHistory({ limit: 100, offset });
          const items = result?.items || [];
          if (items.length === 0) break;
          allEvents.push(...items);
          offset += items.length;
          if (items.length < 100) break;
        }

        const achEvents = {};
        allEvents.forEach(e => {
          if (e.action === 'achievement_unlocked' && e.reason) {
            if (!achEvents[e.reason]) achEvents[e.reason] = [];
            achEvents[e.reason].push(e);
          }
        });

        const auditDupes = [];
        for (const [achId, events] of Object.entries(achEvents)) {
          if (events.length > 1) {
            // Сортируем по времени, первое — оригинал, остальные — дубли
            events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            auditDupes.push(...events.slice(1));
          }
        }

        if (auditDupes.length > 0) {
          console.warn(`Found ${auditDupes.length} duplicate achievement events in audit log:`);
          const grouped = {};
          auditDupes.forEach(e => {
            grouped[e.reason] = (grouped[e.reason] || 0) + 1;
          });
          Object.entries(grouped).forEach(([ach, count]) => {
            console.warn(`  - ${ach}: ${count} duplicates`);
          });
          console.log('⚠️ Audit log cleanup requires RPC delete_gamification_events() - not implemented yet');
          console.table(auditDupes.slice(0, 10).map(e => ({
            id: e.id,
            reason: e.reason,
            created_at: e.created_at
          })));
        }

        // ✅ STEP 3: Check XP drift (UI vs audit)
        let auditXP = 0;
        const seenAch = new Set();
        allEvents.forEach(e => {
          const delta = e.xp_delta || 0;
          if (e.action === 'xp_gain' && delta > 0) {
            auditXP += delta;
          } else if (e.action === 'daily_bonus' && delta > 0) {
            auditXP += delta;
          } else if (e.action === 'achievement_unlocked' && e.reason && delta > 0) {
            if (!seenAch.has(e.reason)) {
              seenAch.add(e.reason);
              auditXP += delta;
            }
          }
        });

        const drift = data.totalXP - auditXP;
        const needsRebuild = changed || Math.abs(drift) > 0;

        console.log(`📊 XP Check: UI=${data.totalXP}, Audit=${auditXP}, Drift=${drift}`);

        // ✅ STEP 4: Rebuild XP from audit if needed
        if (needsRebuild) {
          if (drift !== 0) {
            console.warn(`⚠️ XP drift detected: ${drift > 0 ? '+' : ''}${drift} XP (${drift > 0 ? 'UI > audit' : 'audit > UI'})`);
          }
          console.log('🔄 Rebuilding XP from audit (source of truth)...');

          // Сохраняем очищенный массив достижений (если был changed)
          if (changed) {
            saveData();
            triggerImmediateSync('achievements_cleanup');
          }

          // Пересчитываем XP из audit (trustAudit=true — audit как source of truth)
          await rebuildXPFromAudit({ force: true, trustAudit: true });

          console.log('✅ Cleanup complete, XP rebuilt from audit');
        } else {
          console.log('✅ No duplicates or drift found — system consistent');
        }

        console.groupEnd();
        return {
          localStorageDupes: beforeCount - beforeUnique,
          auditDupes: auditDupes.length,
          drift,
          xpRebuilt: needsRebuild
        };
      } catch (err) {
        console.error('❌ Cleanup failed:', err);
        console.groupEnd();
        return { error: err.message };
      }
    },

    /**
     * 🔧 Вспомогательная функция: загрузка всех событий из audit log
     * @returns {Promise<Array>} Все события из аудита
     */
    async _getAllAuditEvents() {
      await flushAuditQueue();
      const allEvents = [];
      let offset = 0;
      const PAGE_SIZE = 500;

      for (let page = 0; page < 20; page++) {
        const result = await fetchGamificationHistory({ limit: PAGE_SIZE, offset });
        const items = result?.items || [];
        if (items.length === 0) break;
        allEvents.push(...items);
        offset += items.length;
        if (items.length < PAGE_SIZE) break;
      }

      return allEvents;
    },

    /**
     * 🔧 Вспомогательная функция: получение curator_id из сохранённой сессии
     * @returns {string|null} ID куратора или null
     */
    _getCuratorId() {
      try {
        const tokenJson = localStorage.getItem('heys_supabase_auth_token');
        if (!tokenJson) return null;

        const tokenData = JSON.parse(tokenJson);
        return tokenData?.user?.id || null;
      } catch (e) {
        console.error('[HEYS.game] Failed to parse curator session:', e);
        return null;
      }
    },

    /**
     * 🆕 Удаляет дубликаты из audit log через RPC (требует curator auth)
     * Использует delete_gamification_events_by_curator для удаления событий из БД
     * 
     * @returns {Promise<{deleted: number, eventIds: string[]}>}
     */
    async deleteDuplicateAuditEvents() {
      console.log('🗑️ [HEYS.game] Delete Duplicate Audit Events');

      try {
        // STEP 1: Собираем дубликаты из audit
        const allEvents = await this._getAllAuditEvents();
        const achievementEvents = allEvents.filter(e => e.action === 'achievement_unlocked');

        // Группируем по reason (achievement_id)
        const grouped = {};
        achievementEvents.forEach(event => {
          const key = event.reason;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(event);
        });

        // Находим дубликаты (оставляем первое событие, остальные помечаем на удаление)
        const duplicateIds = [];
        Object.entries(grouped).forEach(([achievementId, events]) => {
          if (events.length > 1) {
            // Сортируем по created_at (ASC = старые первыми)
            events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            // Первое оставляем, остальные удаляем
            const toDelete = events.slice(1).map(e => e.id);
            duplicateIds.push(...toDelete);
          }
        });

        if (duplicateIds.length === 0) {
          console.log('✅ No audit duplicates found');
          return { deleted: 0, eventIds: [] };
        }

        console.log(`📊 Found ${duplicateIds.length} duplicate events to delete`);
        console.table(duplicateIds.map(id => {
          const event = achievementEvents.find(e => e.id === id);
          return {
            id,
            reason: event?.reason || 'unknown',
            created_at: event?.created_at || 'unknown'
          };
        }));

        // STEP 2: Проверяем curator auth
        const { curatorToken } = getAuditContext();
        const curatorId = this._getCuratorId();

        if (!curatorToken || !curatorId) {
          console.error('❌ Curator auth required (JWT token + curatorId)');
          return { error: 'curator_auth_required' };
        }

        console.log(`🔐 Using curator_id: ${curatorId.slice(0, 8)}...`);

        // STEP 3: Вызываем RPC для удаления
        const result = await HEYS.YandexAPI.rpc('delete_gamification_events_by_curator', {
          p_curator_id: curatorId,
          p_event_ids: duplicateIds
        });

        if (result?.error) {
          console.error('❌ RPC delete failed:', result.error);
          return { error: result.error?.message || 'RPC failed' };
        }

        const payload = result?.data || {};
        const deletedCount = payload.deleted_count || 0;

        console.log(`✅ Deleted ${deletedCount} events from audit log`);

        return {
          deleted: deletedCount,
          eventIds: payload.event_ids || duplicateIds
        };

      } catch (err) {
        console.error('❌ Delete audit events failed:', err);
        return { error: err.message };
      }
    }
  };

  // ========== INTERNAL ==========

  function _addXPInternal(amount, reason, sourceEl, extraData) {
    // � v4.0: Не начисляем XP во время загрузки — rebuild начисляет напрямую
    if (_isLoadingPhase) return;
    // �🛡️ Dedup guard: предотвращаем двойное начисление из разных источников (DOM event + прямой вызов)
    const now = Date.now();
    const dedupKey = reason + '_' + (extraData?.dedupId || '');
    if (dedupKey === _lastAddXPKey && (now - _lastAddXPTime) < DEDUP_WINDOW_MS) {
      console.info('[🎮 GAME] Dedup: skipping duplicate', reason, 'within', DEDUP_WINDOW_MS, 'ms');
      return;
    }
    _lastAddXPKey = dedupKey;
    _lastAddXPTime = now;

    const data = loadData();
    const action = XP_ACTIONS[reason];
    const today = getToday();

    // Инициализируем daily tracking
    if (!data.dailyXP[today]) {
      data.dailyXP[today] = {};
    }

    // 🎯 Update daily missions BEFORE checking XP limit
    // (миссии должны обновляться независимо от лимита XP)
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

    // Проверяем лимит за день (для начисления XP)
    if (action) {
      const dailyCount = data.dailyXP[today][reason] || 0;
      if (dailyCount >= action.maxPerDay) {
        // Лимит достигнут XP, не начисляем (но миссия уже обновлена выше!)
        saveData(); // Сохраняем прогресс миссии
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
    const beforeXP = data.totalXP;
    const beforeAchievements = data.unlockedAchievements.length;
    const oldProgress = game.getProgress();
    data.totalXP += xpToAdd;
    data.level = calculateLevel(data.totalXP);
    const afterXP = data.totalXP;
    const afterAchievements = data.unlockedAchievements.length;

    // 🔄 v3.1: Обновляем _dailyXPTotals для realtime графика
    if (!data._dailyXPTotals) data._dailyXPTotals = {};
    data._dailyXPTotals[today] = (data._dailyXPTotals[today] || 0) + xpToAdd;

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

    saveData();
    triggerImmediateSync('xp_gain');

    queueGamificationEvent({
      action: 'xp_gain',
      reason,
      xpBefore: beforeXP,
      xpAfter: afterXP,
      xpDelta: xpToAdd,
      levelBefore: oldLevel,
      levelAfter: data.level,
      achievementsBefore: beforeAchievements,
      achievementsAfter: afterAchievements,
      metadata: {
        streakMultiplier,
        dailyMultiplier: dailyInfo.multiplier,
        dailyActions: dailyInfo.actions
      }
    });

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

      queueGamificationEvent({
        action: 'level_up',
        reason,
        xpBefore: beforeXP,
        xpAfter: afterXP,
        xpDelta: xpToAdd,
        levelBefore: oldLevel,
        levelAfter: data.level,
        achievementsBefore: beforeAchievements,
        achievementsAfter: afterAchievements,
        metadata: {
          title: title.title,
          icon: title.icon
        }
      });

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
    const syncTrace = startGameSyncTrace('event:heysSyncCompleted');
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
      // RC-6 fix: был fire-and-forget .catch(()=>{}). Теперь при ошибке диспатчим guard-release
      // чтобы не показывать 'Синхронизация XP…' вечно при сетевой ошибке.
      if (HEYS.game?.loadFromCloud) {
        HEYS.game.loadFromCloud().catch(() => {
          // Ошибка загрузки — снимаем guard с тем что есть в localStorage
          const fallbackStats = game.getStats();
          window.dispatchEvent(new CustomEvent('heysGameUpdate', {
            detail: { ...fallbackStats, isInitialLoad: true, reason: 'cloud_load_complete' }
          }));
        });
      }
      endGameSyncTrace(syncTrace, 'ok', { reason: 'initial_sync_deferred_load' });
      return;
    }

    // 🔒 Cooldown: не реагируем на sync если прошло < 2 секунд
    // Оптимизация: уменьшили cooldown c 5 сек для быстрого отклика
    if (now - _lastSyncTime < 2000) {
      endGameSyncTrace(syncTrace, 'skipped', { reason: 'cooldown' });
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
          endGameSyncTrace(syncTrace, 'ok', { reason: 'no_ui_changes_after_load' });
          return;
        }

        // Уведомляем UI об обновлении (GamificationBar перечитает stats)
        window.dispatchEvent(new CustomEvent('heysGameUpdate', {
          detail: { ...newStats, isInitialLoad: _isLoadingPhase }
        }));
        endGameSyncTrace(syncTrace, 'ok', {
          reason: 'ui_updated_after_load',
          oldXP,
          newXP: newStats.totalXP,
          oldLevel,
          newLevel: newStats.level
        });
      }).catch(() => {
        // При ошибке всё равно обновляем UI с локальными данными
        const newStats = game.getStats();
        if (!oldStats || newStats.totalXP !== oldXP || newStats.level !== oldLevel) {
          window.dispatchEvent(new CustomEvent('heysGameUpdate', {
            detail: { ...newStats, isInitialLoad: _isLoadingPhase }
          }));
        }
        endGameSyncTrace(syncTrace, 'error', { reason: 'load_failed_fallback_ui' });
      });
      return;
    }

    // Fallback если loadFromCloud недоступен
    const newStats = game.getStats();
    if (!oldStats || newStats.totalXP !== oldXP || newStats.level !== oldLevel) {
      window.dispatchEvent(new CustomEvent('heysGameUpdate', {
        detail: { ...newStats, isInitialLoad: _isLoadingPhase }
      }));
    }
    endGameSyncTrace(syncTrace, 'ok', { reason: 'fallback_without_loadFromCloud' });
  });

  // ========== CLIENT SWITCH (Bug fix v3.1 → v4.0) ==========
  // Куратор переключает клиента — полностью сбрасываем кеш и перезагружаем данные
  window.addEventListener('heys:client-changed', (e) => {
    const newClientId = e?.detail?.clientId || 'unknown';
    console.info('[🎮 Gamification] 🔄 Client changed →', newClientId);

    // 🔒 v4.0: Блокируем ВСЕ UI-уведомления на время загрузки нового клиента
    _isLoadingPhase = true;

    // 1. Полный сброс in-memory кеша
    _data = null;
    _cloudLoaded = false;
    _auditRebuildDone = false;
    _initialSyncDone = false;
    _pendingCloudSync = false;
    _suppressUIUpdates = false;
    // RC fix v6.1: _ensureAuditLastRun НЕ сбрасывался при смене клиента!
    // Throttle (30s) блокировал audit для нового клиента → cloud_load_complete с 0 XP из localStorage.
    _ensureAuditLastRun = 0;
    // RC fix v6.1: сбрасываем dedup-промис — иначе при быстрой смене клиентов
    // новый heysSyncCompleted получает старый promise с данными предыдущего клиента.
    _loadFromCloudPromise = null;

    // 2. Загружаем данные нового клиента из localStorage (будут свежие через storage layer)
    const freshData = loadData();

    // 3. Немедленно диспатчим UI-обновление с данными (isInitialLoad → React не покажет модалки)
    const newStats = game.getStats();
    window.dispatchEvent(new CustomEvent('heysGameUpdate', {
      detail: { ...newStats, reason: 'client_changed', isInitialLoad: true }
    }));

    // 4. Запускаем облачную загрузку (полный цикл rebuild)
    // 🚀 PERF v6.0: Убрали loadFromCloud отсюда, так как heysSyncCompleted сработает сразу после смены клиента
    // и вызовет loadFromCloud. Это предотвращает двойную загрузку.
    //
    // RC fix v6.3: На page-refresh heysSyncCompleted НЕ приходит повторно после client-changed —
    // первый heysSyncCompleted уже обработан ДО того как auth переключил клиента.
    // Диспатчим synthetic heysSyncCompleted с задержкой чтобы:
    //   1. Дать React время смонтироваться и зарегистрировать listeners (≈50-100ms)
    //   2. Не создавать двойной pipeline при обычной смене куратором:
    //      там реальный heysSyncCompleted придёт за <200ms и установит _initialSyncDone=true
    //      → наш таймер проверит _initialSyncDone и НЕ диспатчит дубликат.
    setTimeout(() => {
      if (!_initialSyncDone) {
        console.info('[🎮 Gamification] RC v6.3: heysSyncCompleted не пришёл после client-changed — диспатчим synthetic (page-refresh case)');
        window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
          detail: { synthetic: true, reason: 'client_changed_no_sync' }
        }));
      }
    }, 200);
  });

  // ========== ЭКСПОРТ ==========

  HEYS.game = game;

  // RC fix v6.5: Гарантируем запуск pipeline даже если heysSyncCompleted сработал ДО того,
  // как gamification_v1.js зарегистрировал свой listener (большой файл, 6000+ строк).
  // Симптом: UI mount:initial-stats {gameReady: false}, затем heysSyncCompleted логируется баром
  // (его listener работает), но loadFromCloud() не вызывается — и guard висит 15 секунд.
  // Механизм: если через 300ms после HEYS.game = game _initialSyncDone всё ещё false,
  // значит heysSyncCompleted либо уже пришёл до нас (и мы его пропустили) либо ещё не придёт —
  // в обоих случаях запускаем loadFromCloud() вручную.
  setTimeout(() => {
    if (!_initialSyncDone && HEYS.game) {
      console.info('[🎮 Gamification] RC v6.5: missed heysSyncCompleted (fired before listener registered) — triggering loadFromCloud');
      _initialSyncDone = true;
      HEYS.game.loadFromCloud().catch(() => {
        const fallbackStats = game.getStats();
        window.dispatchEvent(new CustomEvent('heysGameUpdate', {
          detail: { ...fallbackStats, isInitialLoad: true, reason: 'cloud_load_complete' }
        }));
      });
    }
  }, 300);

  // 🔄 Автозапуск: ретроактивная проверка пропущенных достижений
  // Запускается один раз при загрузке страницы (с задержкой для инициализации)
  setTimeout(() => {
    if (HEYS.game && typeof HEYS.game.recalculateAchievements === 'function') {
      // 🔒 v4.0: Блокируем ВСЕ UI-уведомления на время начальной загрузки
      _isLoadingPhase = true;
      bindCloudWatch();
      HEYS.game.recalculateAchievements().then(missed => {
        if (missed && missed.length > 0) {
          console.log('[🎮 Gamification] Recovered', missed.length, 'missed achievements');
        }
      }).catch(e => {
        // Ignore errors during recalculation
      }).finally(() => {
        // 🚀 PERF v6.0: Убрали loadFromCloud отсюда, так как heysSyncCompleted сработает и вызовет loadFromCloud.
        // Это предотвращает двойную загрузку при старте.
        _isLoadingPhase = false;
        console.info('[🎮 Gamification] 🔓 Initial loading phase ended');
      });
    }
  }, 2000); // Уменьшил до 2 сек чтобы успеть до первого sync

  // 🔄 FIX v2.3: Кросс-устройственная синхронизация при возвращении на вкладку
  // Когда пользователь переключается между устройствами/вкладками — проверяем облако
  let _lastVisibilitySync = 0;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // 🔄 v3.0: Проверяем облако не чаще чем раз в 60 секунд
        if (now - _lastVisibilitySync < 60000) {
          return;
        }
        _lastVisibilitySync = now;

        // Проверяем наличие сессии
        const hasSession = HEYS.cloud?.getSessionToken?.() ||
          localStorage.getItem('heys_session_token');
        if (!hasSession) {
          return;
        }

        // 🔄 v3.0: Lightweight consistency check вместо полной loadFromCloud()
        console.log('[🎮 Gamification] Tab visible, running consistency check...');
        _auditRebuildDone = false;
        ensureAuditConsistency('tab-visible').catch(() => { });
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

    // 🔧 FIX v2.4: Пересчёт XP из аудит-лога
    window.rebuildGameXP = async (force = false) => {
      if (!HEYS.game?.rebuildXPFromAudit) {
        console.error('[🎮 Gamification] rebuildXPFromAudit not available');
        return false;
      }
      console.log('[🎮 Gamification] Rebuilding XP from audit...', force ? '(FORCED)' : '');
      const result = await HEYS.game.rebuildXPFromAudit({ force, trustAudit: true });
      console.log('[🎮 Gamification] Rebuild result:', result);
      return result;
    };

    // 🔧 FIX v2.4: Dry-run проверка (без применения)
    window.checkGameXP = async () => {
      if (!HEYS.game?.rebuildXPFromAudit) {
        console.error('[🎮 Gamification] rebuildXPFromAudit not available');
        return false;
      }
      console.log('[🎮 Gamification] Checking XP consistency (dry run)...');
      const result = await HEYS.game.rebuildXPFromAudit({ dryRun: true });
      console.log('[🎮 Gamification] Check result:', result);
      return result;
    };

    // 🔧 V5: Команда для сброса миграции и пересчёта достижений
    window.recalcGameAchievements = async () => {
      console.log('[🎮 Gamification] Resetting migration flag and recalculating...');

      // Удаляем флаг миграции
      localStorage.removeItem('heys_achievements_v5_migrated');
      localStorage.removeItem('heys_achievements_v4_migrated');

      // Запускаем пересчёт
      if (HEYS.game?.recalculateAchievements) {
        const missed = await HEYS.game.recalculateAchievements();
        console.log('[🎮 Gamification] Recalculation complete:', {
          found: missed.length,
          achievements: missed
        });
        return missed;
      } else {
        console.error('[🎮 Gamification] recalculateAchievements not available');
        return [];
      }
    };

    // 🔧 FIX v2.6: Диагностика streak (почему streak = 0?)
    window.debugStreak = () => {
      const U = HEYS.utils || {};
      const fmtDate = U.fmtDate || ((d) => d.toISOString().split('T')[0]);
      const lsGet = HEYS.dayStorage?.lsGet || U.lsGet || (() => null);
      const rz = HEYS.ratioZones;

      console.group('🔥 [STREAK DEBUG]');
      console.log('HEYS.Day.getStreak:', typeof HEYS.Day?.getStreak === 'function' ? HEYS.Day.getStreak() : 'NOT AVAILABLE');
      console.log('safeGetStreak():', typeof HEYS.utils?.safeGetStreak === 'function' ? HEYS.utils.safeGetStreak() : 'N/A');

      // Пробуем получить текущий optimum
      const prof = lsGet('heys_profile', {});
      let currentOptimum = 0;
      // Из TDEE если доступен
      if (HEYS.TDEE?.calculate) {
        const today = new Date();
        const dateStr = fmtDate(today);
        const todayData = lsGet('heys_dayv2_' + dateStr, {});
        const tdeeResult = HEYS.TDEE.calculate(todayData, prof, { lsGet });
        currentOptimum = tdeeResult?.optimum || 0;
        console.log('TDEE optimum (сегодня):', currentOptimum, '| baseExpenditure:', tdeeResult?.baseExpenditure, '| tdee:', tdeeResult?.tdee);
      }

      const today = new Date();
      today.setHours(12);
      console.log('Проверяем последние 10 дней (от вчера назад):');
      const results = [];
      for (let i = 1; i <= 10; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = fmtDate(d);
        const key = 'heys_dayv2_' + dateStr;
        const dayData = lsGet(key, null);
        const hasMeals = !!(dayData && dayData.meals && dayData.meals.length > 0);
        const mealCount = dayData?.meals?.length || 0;
        let totalKcal = 0;
        if (hasMeals) {
          (dayData.meals || []).forEach(m => {
            (m.items || []).forEach(item => {
              const g = +item.grams || 0;
              if (g <= 0) return;
              const src = item;
              if (src.kcal100 != null) totalKcal += ((+src.kcal100 || 0) * g / 100);
            });
          });
        }
        const savedOpt = dayData?.savedDisplayOptimum || dayData?.savedEatenKcal ? undefined : undefined;
        // Используем savedDisplayOptimum дня или текущий optimum
        const dayOptimum = dayData?.savedDisplayOptimum || currentOptimum || 1;
        const ratio = totalKcal / dayOptimum;
        const isRefeed = !!dayData?.isRefeedDay;
        const isStreakDay = rz?.isStreakDayWithRefeed
          ? rz.isStreakDayWithRefeed(ratio, dayData)
          : (ratio >= 0.75 && ratio <= 1.10);

        results.push({
          date: dateStr,
          kcal: Math.round(totalKcal),
          optimum: Math.round(dayOptimum),
          ratio: Math.round(ratio * 100) + '%',
          isStreak: isStreakDay ? '✅' : '❌',
          refeed: isRefeed ? '🔄' : '',
          meals: mealCount
        });
      }
      console.table(results);

      // Попробуем вызвать computeCurrentStreak напрямую
      if (HEYS.dayCalendarMetrics?.computeCurrentStreak) {
        const pIndex = HEYS._productIndex || null;
        const directStreak = HEYS.dayCalendarMetrics.computeCurrentStreak({
          optimum: currentOptimum, pIndex, fmtDate, lsGet
        });
        console.log('computeCurrentStreak (direct call, optimum=' + currentOptimum + '):', directStreak);
        // Тест с includeToday
        const withToday = HEYS.dayCalendarMetrics.computeCurrentStreak({
          optimum: currentOptimum, pIndex, fmtDate, lsGet, includeToday: true
        });
        console.log('computeCurrentStreak (includeToday=true):', withToday);
      }

      const gameData = HEYS.game?.getStats?.();
      console.log('stats.bestStreak:', gameData?.stats?.bestStreak || 0);
      console.groupEnd();
      return results;
    };
  }

  // ========== EVENT LISTENERS FOR MISSION RESYNC ==========
  // Recalculate mission progress when day data changes
  if (typeof window !== 'undefined') {
    window.addEventListener('heysProductAdded', () => {
      if (HEYS.game?.recalculateDailyMissionsProgress) {
        HEYS.game.recalculateDailyMissionsProgress();
      }
    });

    window.addEventListener('heysWaterAdded', () => {
      if (HEYS.game?.recalculateDailyMissionsProgress) {
        HEYS.game.recalculateDailyMissionsProgress();
      }
    });

    // 🔄 Откат прогресса при удалении item или meal
    window.addEventListener('heysItemRemoved', () => {
      if (HEYS.game?.recalculateDailyMissionsProgress) {
        HEYS.game.recalculateDailyMissionsProgress();
      }
    });

    window.addEventListener('heysMealDeleted', () => {
      if (HEYS.game?.recalculateDailyMissionsProgress) {
        HEYS.game.recalculateDailyMissionsProgress();
      }
    });

    window.addEventListener('heys:day-updated', () => {
      if (HEYS.game?.recalculateDailyMissionsProgress) {
        HEYS.game.recalculateDailyMissionsProgress();
      }
    });
  }

})(typeof window !== 'undefined' ? window : global);
