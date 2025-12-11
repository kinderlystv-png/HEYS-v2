// heys_storage_supabase_v1.js — Supabase bridge, auth, cloud sync, localStorage mirroring

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 КОНСТАНТЫ
  // ═══════════════════════════════════════════════════════════════════
  
  /** Префиксы ключей для зеркалирования в cloud */
  const KEY_PREFIXES = {
    HEYS: 'heys_',
    DAY: 'day'
  };
  
  /** Ключи, требующие client-specific storage */
  const CLIENT_SPECIFIC_KEYS = [
    // Основные данные клиента
    'heys_products',
    'heys_profile',
    'heys_hr_zones',
    'heys_norms',
    'heys_ratio_zones',       // Настройки цветовых зон ratio
    'heys_grams_history',     // История введённых граммов (для автокомплита)
    
    // Советы (advice)
    'heys_advice_read_today',
    'heys_advice_hidden_today',
    'heys_first_meal_tip',
    'heys_best_day_last_check',
    'heys_evening_snacker_check',
    'heys_morning_skipper_check',
    'heys_last_visit',
    
    // Gamification
    'heys_game',              // XP, уровни, достижения
    'heys_best_streak'        // Лучший streak
  ];
  
  /** Префиксы ключей, требующих client-specific storage */
  const CLIENT_SPECIFIC_PREFIXES = [
    'heys_milestone_'         // Достигнутые вехи (heys_milestone_7_days, etc.)
  ];
  
  /** Префиксы для client-specific данных */
  const CLIENT_KEY_PATTERNS = {
    DAY_V2: 'dayv2_',
    HEYS_CLIENT: 'heys_',
    DAY_CLIENT: 'day_'
  };
  
  /** Возможные статусы подключения */
  const CONNECTION_STATUS = {
    OFFLINE: 'offline',
    SIGNIN: 'signin',
    SYNC: 'sync',
    ONLINE: 'online'
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🌐 ГЛОБАЛЬНОЕ СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════════════
  
  let client = null;
  cloud.client = null;
  let status = CONNECTION_STATUS.OFFLINE;
  let user = null;
  let muteMirror = false;
  
  // Оригинальный setItem (до перехвата) — для safeSetItem
  let originalSetItem = null;
  
  // 🚨 Флаг блокировки сохранения до завершения первого sync
  let initialSyncCompleted = false;
  let failsafeTimerId = null;
  cloud.isInitialSyncCompleted = function() { return initialSyncCompleted; };
  
  // 🔄 FAILSAFE: Если sync не завершился за 45 секунд — разрешаем сохранения
  // Увеличено с 15 до 45 сек — пользователю нужно время на ввод логина/пароля
  // Таймер отменяется при успешном signIn → bootstrapClientSync
  function startFailsafeTimer() {
    if (failsafeTimerId) clearTimeout(failsafeTimerId);
    failsafeTimerId = setTimeout(() => {
      if (!initialSyncCompleted) {
        logCritical('⚠️ [FAILSAFE] Initial sync timeout (45s) — enabling saves');
        initialSyncCompleted = true;
      }
    }, 45000);
  }
  
  function cancelFailsafeTimer() {
    if (failsafeTimerId) {
      clearTimeout(failsafeTimerId);
      failsafeTimerId = null;
    }
  }
  
  // Запускаем failsafe при загрузке (будет отменён при signIn)
  startFailsafeTimer();

  // ═══════════════════════════════════════════════════════════════════
  // 📦 ПЕРСИСТЕНТНАЯ ОЧЕРЕДЬ СИНХРОНИЗАЦИИ
  // ═══════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════
  // 🔀 MERGE ЛОГИКА ДЛЯ КОНФЛИКТОВ
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Умный merge данных дня при конфликте local vs remote
   * Стратегия: объединить meals по ID, взять максимальные значения для числовых полей
   * @param {Object} local - локальные данные дня
   * @param {Object} remote - данные из облака
   * @returns {Object|null} merged данные или null если merge не нужен
   */
  function mergeDayData(local, remote) {
    // Приводим тренировки к новой схеме (quality/feelAfter → mood/wellbeing/stress)
    const normalizeTrainings = (trainings = []) => trainings.map((t = {}) => {
      if (t.quality !== undefined || t.feelAfter !== undefined) {
        const { quality, feelAfter, ...rest } = t;
        return {
          ...rest,
          mood: rest.mood ?? quality ?? 5,
          wellbeing: rest.wellbeing ?? feelAfter ?? 5,
          stress: rest.stress ?? 5
        };
      }
      return t;
    });

    local = {
      ...local,
      trainings: normalizeTrainings(local?.trainings)
    };
    remote = {
      ...remote,
      trainings: normalizeTrainings(remote?.trainings)
    };

    if (!local || !remote) return null;
    
    // Если данные идентичны — merge не нужен
    const localJson = JSON.stringify({ ...local, updatedAt: 0, _sourceId: '' });
    const remoteJson = JSON.stringify({ ...remote, updatedAt: 0, _sourceId: '' });
    if (localJson === remoteJson) return null;
    
    const merged = {
      ...remote, // База — remote
      date: local.date || remote.date,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
      _mergedAt: Date.now(),
    };
    
    // 📊 Числовые поля: для шагов/воды берём максимум, для householdMin — свежее
    // Логика шаги/вода: если на одном устройстве ввели 5000 шагов, а на другом 8000 — значит 8000 актуальнее
    // Логика householdMin: это редактируемое значение, берём свежее
    merged.steps = Math.max(local.steps || 0, remote.steps || 0);
    merged.waterMl = Math.max(local.waterMl || 0, remote.waterMl || 0);
    
    // householdMin — берём свежее значение (редактируемое поле)
    // householdActivities — массив активностей
    if ((local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.householdMin = local.householdMin ?? remote.householdMin ?? 0;
      merged.householdTime = local.householdTime ?? remote.householdTime ?? '';
      merged.householdActivities = local.householdActivities || remote.householdActivities || undefined;
    } else {
      merged.householdMin = remote.householdMin ?? local.householdMin ?? 0;
      merged.householdTime = remote.householdTime ?? local.householdTime ?? '';
      merged.householdActivities = remote.householdActivities || local.householdActivities || undefined;
    }
    
    // 📊 Вес: берём ЛЮБОЕ ненулевое значение (приоритет — свежему)
    // ВАЖНО: вес может быть 0 у нового пустого дня, поэтому приоритет ненулевому
    if (local.weightMorning && remote.weightMorning) {
      // Оба есть — берём свежее
      merged.weightMorning = (local.updatedAt || 0) >= (remote.updatedAt || 0) 
        ? local.weightMorning 
        : remote.weightMorning;
    } else {
      // Берём любое ненулевое
      merged.weightMorning = local.weightMorning || remote.weightMorning || 0;
    }
    
    // 😴 Сон: берём непустые значения (приоритет свежему только если оба заполнены)
    merged.sleepStart = local.sleepStart || remote.sleepStart || '';
    merged.sleepEnd = local.sleepEnd || remote.sleepEnd || '';
    merged.sleepQuality = local.sleepQuality || remote.sleepQuality || '';
    merged.sleepNote = local.sleepNote || remote.sleepNote || '';
    
    // ⭐ Оценка дня: приоритет вручную установленной
    if (local.dayScoreManual) {
      merged.dayScore = local.dayScore;
      merged.dayScoreManual = true;
    } else if (remote.dayScoreManual) {
      merged.dayScore = remote.dayScore;
      merged.dayScoreManual = true;
    } else {
      merged.dayScore = local.dayScore || remote.dayScore || '';
    }
    merged.dayComment = local.dayComment || remote.dayComment || '';
    
    // 🌸 Cycle: намеренный сброс (null) имеет приоритет если local свежее
    // cycleDay: 1-7 = день цикла, null = сброшено, undefined = не было данных
    if (local.cycleDay === null && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      // Намеренный сброс — local свежее и явно установил null
      merged.cycleDay = null;
    } else if (remote.cycleDay === null && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      // Remote свежее и сбросил
      merged.cycleDay = null;
    } else {
      // Берём непустое значение
      merged.cycleDay = local.cycleDay || remote.cycleDay || null;
    }
    
    // 🍽️ Meals: merge по ID с учётом УДАЛЕНИЙ
    // Если local свежее и meal отсутствует в local — значит удалён!
    const localMeals = local.meals || [];
    const remoteMeals = remote.meals || [];
    const mealsMap = new Map();
    const localMealIds = new Set(localMeals.filter(m => m?.id).map(m => m.id));
    const localIsNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);
    
    // Добавляем remote meals, но ТОЛЬКО если:
    // 1. Local НЕ свежее (remote приоритетнее), ИЛИ
    // 2. Meal присутствует в local (не был удалён)
    remoteMeals.forEach(meal => {
      if (!meal || !meal.id) return;
      
      if (localIsNewer && !localMealIds.has(meal.id)) {
        // Local свежее и этого meal нет в local = УДАЛЁН пользователем
        log(`🗑️ [MERGE] Meal ${meal.id} deleted locally, skipping from remote`);
        return;
      }
      
      mealsMap.set(meal.id, meal);
    });
    
    // Потом local meals — если ID совпадает, берём ЛОКАЛЬНУЮ версию (она более свежая)
    // ВАЖНО: При удалении item из приёма — locаl имеет меньше items, но это правильно!
    // При ДОБАВЛЕНИИ item — нужен merge items по ID чтобы не терять данные с других устройств
    localMeals.forEach(meal => {
      if (!meal || !meal.id) return;
      const existing = mealsMap.get(meal.id);
      if (!existing) {
        mealsMap.set(meal.id, meal);
      } else {
        // Конфликт по ID — MERGE items внутри meal!
        // Объединяем items из local и remote по item.id
        const mergedItems = mergeItemsById(existing.items || [], meal.items || [], localIsNewer);
        
        // Берём остальные поля из более свежей версии
        const mergedMeal = localIsNewer 
          ? { ...existing, ...meal, items: mergedItems }
          : { ...meal, ...existing, items: mergedItems };
        
        mealsMap.set(meal.id, mergedMeal);
      }
    });
    
    merged.meals = Array.from(mealsMap.values())
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    
    // 🏋️ Trainings: merge по индексу, берём свежую версию
    const localTrainings = local.trainings || [];
    const remoteTrainings = remote.trainings || [];
    merged.trainings = [];
    
    // Local свежее — берём local тренировки как базу
    const localIsNewerForTrainings = (local.updatedAt || 0) >= (remote.updatedAt || 0);
    
    const maxTrainings = Math.max(localTrainings.length, remoteTrainings.length, 3);
    for (let i = 0; i < maxTrainings; i++) {
      const lt = localTrainings[i] || { z: [0,0,0,0] };
      const rt = remoteTrainings[i] || { z: [0,0,0,0] };
      
      // Берём тренировку из более свежего источника
      const ltSum = (lt.z || []).reduce((a, b) => a + (b || 0), 0);
      const rtSum = (rt.z || []).reduce((a, b) => a + (b || 0), 0);
      
      // Выбираем базовую версию по updatedAt
      // ВАЖНО: если local свежее и пустая — это НАМЕРЕННОЕ удаление!
      let winner;
      if (localIsNewerForTrainings) {
        // Local свежее — всегда берём local (даже если пустая = удалена)
        winner = lt;
      } else if (ltSum === 0 && rtSum > 0) {
        // Local не свежее и пустая — берём remote
        winner = rt;
      } else if (rtSum === 0 && ltSum > 0) {
        // Remote пустая, local непустая — берём local
        winner = lt;
      } else {
        // Обе непустые, remote свежее — берём remote
        winner = rt;
      }
      const loser = winner === lt ? rt : lt;
      
      // ВСЕГДА объединяем оценки (mood/wellbeing/stress) из обеих версий
      // Берём значение которое ЗАДАНО (не undefined), предпочитаем winner
      const getMergedRating = (field) => {
        const wVal = winner[field];
        const lVal = loser[field];
        // Предпочитаем значение от winner если оно задано (включая 0!)
        if (wVal !== undefined) return wVal;
        if (lVal !== undefined) return lVal;
        return undefined; // Не задано ни там ни там
      };
      
      winner = {
        ...winner,
        // Объединяем оценки — берём заданные из любой версии
        mood: getMergedRating('mood'),
        wellbeing: getMergedRating('wellbeing'),
        stress: getMergedRating('stress'),
        // Удаляем старые поля если они пустые
        quality: undefined,
        feelAfter: undefined
      };
      
      merged.trainings.push(winner);
    }
    
    log('🔀 [MERGE] Result:', {
      meals: merged.meals.length,
      steps: merged.steps,
      water: merged.waterMl,
      trainings: merged.trainings.filter(t => t.z?.some(z => z > 0)).length
    });
    
    return merged;
  }

  /**
   * Умный merge продуктов при конфликте local vs remote
   * 
   * АРХИТЕКТУРА: Name — единственный уникальный ключ продукта!
   * - UI запрещает создавать продукты с одинаковым именем
   * - ID (UUID) генерируется, но НЕ используется для идентификации
   * - При merge дубли по имени схлопываются (выбирается "лучшая" версия)
   * 
   * @param {Array} localProducts - локальные продукты
   * @param {Array} remoteProducts - продукты из облака
   * @returns {Array} объединённый массив продуктов
   */
  function mergeProductsData(localProducts, remoteProducts) {
    const local = Array.isArray(localProducts) ? localProducts : [];
    const remote = Array.isArray(remoteProducts) ? remoteProducts : [];
    
    // Функция нормализации имени для сравнения (единый ключ)
    const normalizeName = (name) => String(name || '').trim().toLowerCase();
    
    // Функция проверки валидности продукта
    const isValidProduct = (p) => {
      if (!p) return false;
      const name = normalizeName(p.name);
      return name.length > 0;
    };
    
    // Функция подсчёта "полноты" продукта (сколько полей заполнено)
    const getProductScore = (p) => {
      let score = 0;
      if (p.id) score += 1;
      if (p.name) score += 2; // Имя важнее
      if (p.kcal100 > 0) score += 1;
      if (p.protein100 > 0) score += 1;
      if (p.carbs100 > 0 || p.simple100 > 0 || p.complex100 > 0) score += 1;
      if (p.fat100 > 0 || p.badFat100 > 0 || p.goodFat100 > 0) score += 1;
      if (p.fiber100 > 0) score += 1;
      if (p.gi > 0) score += 1;
      if (p.portions && p.portions.length > 0) score += 2; // Порции важны
      if (p.createdAt) score += 1;
      return score;
    };
    
    // Функция сравнения двух продуктов: какой "лучше"
    const isBetterProduct = (p1, p2) => {
      const score1 = getProductScore(p1);
      const score2 = getProductScore(p2);
      
      // 1. Сначала сравниваем по полноте данных
      if (score1 !== score2) return score1 > score2;
      
      // 2. При равном score — предпочитаем более новый (по createdAt)
      const time1 = p1.createdAt || 0;
      const time2 = p2.createdAt || 0;
      return time1 > time2;
    };
    
    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 1: Дедупликация ВНУТРИ каждого массива (детектим legacy дубли)
    // ═══════════════════════════════════════════════════════════════
    
    const dedupeArray = (arr, source) => {
      const seen = new Map(); // normalizedName → bestProduct
      const duplicates = [];
      
      arr.forEach(p => {
        if (!isValidProduct(p)) return;
        const key = normalizeName(p.name);
        const existing = seen.get(key);
        
        if (!existing) {
          seen.set(key, p);
        } else {
          // Дубль внутри массива! Выбираем лучший
          duplicates.push({ name: p.name, source });
          if (isBetterProduct(p, existing)) {
            seen.set(key, p);
          }
        }
      });
      
      if (duplicates.length > 0) {
        logCritical(`⚠️ [MERGE] Found ${duplicates.length} duplicate(s) in ${source}: ${duplicates.map(d => `"${d.name}"`).join(', ')}`);
      }
      
      return Array.from(seen.values());
    };
    
    const localDeduped = dedupeArray(local, 'local');
    const remoteDeduped = dedupeArray(remote, 'remote');
    
    // Если одна из сторон пуста — возвращаем другую
    if (localDeduped.length === 0) return remoteDeduped;
    if (remoteDeduped.length === 0) return localDeduped;
    
    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 2: Merge local + remote (name = единственный ключ)
    // ═══════════════════════════════════════════════════════════════
    
    const resultMap = new Map(); // normalizedName → product
    
    // Сначала добавляем все remote (база)
    remoteDeduped.forEach(p => {
      const key = normalizeName(p.name);
      resultMap.set(key, p);
    });
    
    // Затем мержим локальные
    let addedFromLocal = 0;
    let updatedFromLocal = 0;
    
    localDeduped.forEach(p => {
      const key = normalizeName(p.name);
      const existing = resultMap.get(key);
      
      if (!existing) {
        // Новый продукт (есть только локально)
        resultMap.set(key, p);
        addedFromLocal++;
      } else if (isBetterProduct(p, existing)) {
        // Локальная версия лучше — заменяем
        resultMap.set(key, p);
        updatedFromLocal++;
      }
      // Иначе оставляем remote (уже в map)
    });
    
    const merged = Array.from(resultMap.values());
    
    // ═══════════════════════════════════════════════════════════════
    // ЭТАП 3: Статистика и логирование
    // ═══════════════════════════════════════════════════════════════
    
    const localDupes = local.length - localDeduped.length;
    const remoteDupes = remote.length - remoteDeduped.length;
    const totalDupes = localDupes + remoteDupes;
    
    const stats = {
      local: local.length,
      localDeduped: localDeduped.length,
      remote: remote.length,
      remoteDeduped: remoteDeduped.length,
      merged: merged.length,
      addedFromLocal,
      updatedFromLocal,
      duplicatesRemoved: totalDupes
    };
    
    // Краткий лог
    const delta = merged.length - remoteDeduped.length;
    logCritical(`🔀 [MERGE PRODUCTS] local: ${stats.local}${localDupes ? ` (−${localDupes} dupes)` : ''}, remote: ${stats.remote}${remoteDupes ? ` (−${remoteDupes} dupes)` : ''} → merged: ${merged.length} (${delta >= 0 ? '+' : ''}${delta})`);
    
    if (addedFromLocal > 0 || updatedFromLocal > 0) {
      log(`📦 [MERGE] Added ${addedFromLocal} new, updated ${updatedFromLocal} existing`);
    }
    
    return merged;
  }
  
  const PENDING_QUEUE_KEY = 'heys_pending_sync_queue';
  const PENDING_CLIENT_QUEUE_KEY = 'heys_pending_client_sync_queue';
  
  // ═══════════════════════════════════════════════════════════════════
  // 🧹 QUOTA MANAGEMENT — ЗАЩИТА ОТ ПЕРЕПОЛНЕНИЯ STORAGE
  // ═══════════════════════════════════════════════════════════════════
  
  const MAX_STORAGE_MB = 4.5; // Лимит ~5MB, оставляем запас
  const OLD_DATA_DAYS = 90; // Удаляем данные старше 90 дней
  
  /** Получить размер localStorage в MB */
  function getStorageSize() {
    try {
      let total = 0;
      for (let key in global.localStorage) {
        if (global.localStorage.hasOwnProperty(key)) {
          total += (global.localStorage.getItem(key) || '').length * 2; // UTF-16
        }
      }
      return total / 1024 / 1024;
    } catch (e) {
      return 0;
    }
  }
  
  /** Получить дату из ключа dayv2_YYYY-MM-DD */
  function getDateFromDayKey(key) {
    const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  }
  
  /** Очистить старые данные для освобождения места */
  function cleanupOldData(daysToKeep = OLD_DATA_DAYS) {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
      let cleaned = 0;
      
      // Собираем ключи для удаления
      const keysToRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.includes('dayv2_')) {
          const date = getDateFromDayKey(key);
          if (date && date < cutoff) {
            keysToRemove.push(key);
          }
        }
      }
      
      // Удаляем старые данные
      keysToRemove.forEach(key => {
        global.localStorage.removeItem(key);
        cleaned++;
      });
      
      if (cleaned > 0) {
        logCritical(`🧹 Очищено ${cleaned} старых записей (>${daysToKeep} дней)`);
      }
      
      return cleaned;
    } catch (e) {
      return 0;
    }
  }
  
  /** Агрессивная очистка при критическом переполнении */
  function aggressiveCleanup() {
    logCritical('🚨 Агрессивная очистка storage...');
    
    // 1. Удаляем данные старше 14 дней (более агрессивно)
    cleanupOldData(14);
    
    // 2. Удаляем debug/temp/cache ключи
    const tempKeys = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && (key.includes('_debug') || key.includes('_temp') || key.includes('_cache') || key.includes('_log'))) {
        tempKeys.push(key);
      }
    }
    tempKeys.forEach(k => global.localStorage.removeItem(k));
    
    // 3. Очищаем pending queues
    global.localStorage.removeItem(PENDING_QUEUE_KEY);
    global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
    global.localStorage.removeItem(SYNC_LOG_KEY);
    
    // 4. Показываем размер после очистки
    const sizeMB = getStorageSize();
    logCritical(`📊 Размер после очистки: ${sizeMB.toFixed(2)} MB`);
    
    // 5. Если всё ещё > 4MB — удаляем ещё старее (7 дней)
    if (sizeMB > 4) {
      cleanupOldData(7);
      logCritical(`📊 После удаления >7 дней: ${getStorageSize().toFixed(2)} MB`);
    }
  }
  
  /** Безопасная запись в localStorage с обработкой QuotaExceeded */
  function safeSetItem(key, value) {
    // Используем оригинальный setItem если доступен (избегаем рекурсии через перехват)
    const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
    
    try {
      setFn(key, value);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        // Пробуем очистить старые данные
        logCritical('⚠️ localStorage переполнен, очищаем старые данные...');
        cleanupOldData();
        
        // Пробуем ещё раз
        try {
          setFn(key, value);
          return true;
        } catch (e2) {
          // Всё ещё не помещается — удаляем pending queues и sync log
          global.localStorage.removeItem(PENDING_QUEUE_KEY);
          global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
          global.localStorage.removeItem(SYNC_LOG_KEY);
          
          try {
            setFn(key, value);
            return true;
          } catch (e3) {
            // Агрессивная очистка — удаляем старые дни за 30 дней вместо 90
            aggressiveCleanup();
            try {
              setFn(key, value);
              return true;
            } catch (e4) {
              logCritical('❌ Не удалось сохранить данные: storage критически переполнен');
              return false;
            }
          }
        }
      }
      return false;
    }
  }
  
  /** Загрузить очередь из localStorage */
  function loadPendingQueue(key) {
    try {
      const data = global.localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }
  
  /** Сохранить очередь в localStorage */
  function savePendingQueue(key, queue) {
    try {
      if (queue.length > 0) {
        safeSetItem(key, JSON.stringify(queue));
      } else {
        global.localStorage.removeItem(key);
      }
    } catch (e) {}
  }
  
  /** Получить количество ожидающих изменений */
  cloud.getPendingCount = function() {
    return clientUpsertQueue.length + upsertQueue.length;
  };
  
  /** Получить детализацию pending (для UI) */
  cloud.getPendingDetails = function() {
    const details = { days: 0, products: 0, profile: 0, other: 0 };
    
    const allItems = [...clientUpsertQueue, ...upsertQueue];
    allItems.forEach(item => {
      const k = item.k || '';
      if (k.includes('dayv2_')) details.days++;
      else if (k.includes('products')) details.products++;
      else if (k.includes('profile')) details.profile++;
      else details.other++;
    });
    
    return details;
  };
  
  /** Получить информацию о storage */
  cloud.getStorageInfo = function() {
    const sizeMB = getStorageSize();
    const usedPercent = Math.round((sizeMB / MAX_STORAGE_MB) * 100);
    return {
      sizeMB: sizeMB.toFixed(2),
      maxMB: MAX_STORAGE_MB,
      usedPercent,
      isNearLimit: usedPercent > 80
    };
  };
  
  /** Принудительная очистка старых данных */
  cloud.cleanupStorage = cleanupOldData;
  
  // ═══════════════════════════════════════════════════════════════════
  // 📜 SYNC HISTORY LOG — ЖУРНАЛ СИНХРОНИЗАЦИЙ
  // ═══════════════════════════════════════════════════════════════════
  
  const SYNC_LOG_KEY = 'heys_sync_log';
  const MAX_SYNC_LOG_ENTRIES = 50;
  const SYNC_PROGRESS_EVENT = 'heys:sync-progress';
  const SYNC_COMPLETED_EVENT = 'heysSyncCompleted';
  let syncProgressTotal = 0;
  let syncProgressDone = 0;
  const AUTH_ERROR_CODES = new Set(['401', '42501', 'PGRST301']);
  
  /** Проверка, является ли ошибка ошибкой авторизации (401, RLS) */
  function isAuthError(error) {
    if (!error) return false;
    // HTTP статус 401
    if (error.status === 401 || error.statusCode === 401) return true;
    // PostgreSQL RLS error
    if (error.code && AUTH_ERROR_CODES.has(String(error.code))) return true;
    // Supabase error message
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('jwt') || msg.includes('invalid claim')) return true;
    return false;
  }
  
  /** Добавить запись в журнал синхронизации */
  function addSyncLogEntry(type, details) {
    try {
      const log = JSON.parse(global.localStorage.getItem(SYNC_LOG_KEY) || '[]');
      log.unshift({
        ts: Date.now(),
        type, // 'sync_ok' | 'sync_error' | 'offline' | 'online' | 'quota_error'
        details
      });
      // Ограничиваем размер лога
      if (log.length > MAX_SYNC_LOG_ENTRIES) {
        log.length = MAX_SYNC_LOG_ENTRIES;
      }
      global.localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log));
    } catch (e) {}
  }
  
  /** Получить журнал синхронизации */
  cloud.getSyncLog = function() {
    try {
      return JSON.parse(global.localStorage.getItem(SYNC_LOG_KEY) || '[]');
    } catch (e) {
      return [];
    }
  };
  
  /** Очистить журнал синхронизации */
  cloud.clearSyncLog = function() {
    global.localStorage.removeItem(SYNC_LOG_KEY);
  };
  
  /** Событие для UI об изменении pending count */
  function notifyPendingChange() {
    const count = cloud.getPendingCount();
    const details = cloud.getPendingDetails();
    try {
      global.dispatchEvent(new CustomEvent('heys:pending-change', { 
        detail: { count, details } 
      }));
    } catch (e) {}
    updateSyncProgressTotal();
  }
  
  /** Событие: прогресс синхронизации */
  function notifySyncProgress(total, done) {
    try {
      global.dispatchEvent(new CustomEvent(SYNC_PROGRESS_EVENT, { detail: { total, done } }));
    } catch (e) {}
  }
  
  /** Событие: завершение синхронизации обеих очередей (upload) */
  function notifySyncCompletedIfDrained() {
    if (clientUpsertQueue.length === 0 && upsertQueue.length === 0) {
      syncProgressTotal = 0;
      syncProgressDone = 0;
      // Событие "очередь пуста" — для UI индикатора синхронизации
      // НЕ используем heysSyncCompleted — это для initial sync клиента!
      try {
        global.dispatchEvent(new CustomEvent('heys:queue-drained', { detail: {} }));
      } catch (e) {}
    }
  }
  
  /** Событие: синхронизация восстановлена */
  function notifySyncRestored(syncedCount) {
    try {
      addSyncLogEntry('sync_ok', { count: syncedCount });
      global.dispatchEvent(new CustomEvent('heys:sync-restored', { 
        detail: { count: syncedCount } 
      }));
    } catch (e) {}
  }
  
  /** Событие: ошибка синхронизации */
  function notifySyncError(error, retryIn) {
    try {
      addSyncLogEntry('sync_error', { error: error?.message || String(error) });
      global.dispatchEvent(new CustomEvent('heys:sync-error', { 
        detail: { error: error?.message || String(error), retryIn } 
      }));
    } catch (e) {}
  }

  /** Обработка ошибок авторизации/RLS */
  function handleAuthFailure(err) {
    try {
      status = CONNECTION_STATUS.OFFLINE;
      user = null;
      // 🔄 Очистка невалидного токена — предотвращает повторные 401 ошибки
      try {
        localStorage.removeItem('heys_supabase_auth_token');
      } catch (e) {}
      addSyncLogEntry('sync_error', { error: 'auth_required' });
      global.dispatchEvent(new CustomEvent('heys:sync-error', { detail: { error: 'auth_required' } }));
      logCritical('❌ Требуется повторный вход (auth/RLS error)');
    } catch (e) {}
  }

  /** Обновить total прогресса (max между уже сделанным и новым pending) */
  function updateSyncProgressTotal() {
    const pending = cloud.getPendingCount();
    const candidate = syncProgressDone + pending;
    if (candidate > syncProgressTotal) {
      syncProgressTotal = candidate;
      notifySyncProgress(syncProgressTotal, syncProgressDone);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔄 EXPONENTIAL BACKOFF ДЛЯ RETRY
  // ═══════════════════════════════════════════════════════════════════
  
  let retryAttempt = 0;
  const MAX_RETRY_ATTEMPTS = 5;
  const BASE_RETRY_DELAY = 1000; // 1 сек
  
  /** Вычислить задержку с exponential backoff */
  function getRetryDelay() {
    // 1s, 2s, 4s, 8s, 16s (max)
    return Math.min(BASE_RETRY_DELAY * Math.pow(2, retryAttempt), 16000);
  }
  
  /** Сбросить счётчик retry при успешной синхронизации */
  function resetRetry() {
    retryAttempt = 0;
  }
  
  /** Увеличить счётчик retry */
  function incrementRetry() {
    if (retryAttempt < MAX_RETRY_ATTEMPTS) {
      retryAttempt++;
    }
  }

  // Умное логирование: только критические операции
  // Включается через localStorage: localStorage.setItem('heys_debug_sync', 'true')
  const isDebugSync = () => global.localStorage.getItem('heys_debug_sync') === 'true';
  
  function log(){
    // Тихий режим по умолчанию
    if (isDebugSync()) {
      try{ console.log.apply(console, ['[HEYS.cloud]'].concat([].slice.call(arguments))); }catch(e){}
    }
  }
  function err(){ try{ console.error.apply(console, ['[HEYS.cloud:ERR]'].concat([].slice.call(arguments))); }catch(e){} }
  
  // Критический лог — всегда выводится (для важных событий синхронизации)
  function logCritical(){ try{ console.info.apply(console, ['[HEYS]'].concat([].slice.call(arguments))); }catch(e){} }

  /**
   * Проверка, является ли ошибка сетевой (QUIC, fetch failed, network error)
   * @param {Object|Error} error - Объект ошибки
   * @returns {boolean} true если это сетевая ошибка
   */
  function isNetworkError(error) {
    if (!error) return false;
    const msg = (error.message || error.details || '').toLowerCase();
    return msg.includes('failed to fetch') ||
           msg.includes('network') ||
           msg.includes('quic') ||
           msg.includes('connection') ||
           msg.includes('timeout') ||
           msg.includes('aborted');
  }

  /**
   * Выполнение запроса с retry и exponential backoff для сетевых ошибок
   * @param {Function} requestFn - Функция, возвращающая Promise (должна быть функцией, не Promise!)
   * @param {Object} options - Опции
   * @param {number} options.maxRetries - Максимум ретраев (по умолчанию 3)
   * @param {number} options.baseDelayMs - Базовая задержка (по умолчанию 1000)
   * @param {number} options.timeoutMs - Таймаут каждого запроса (по умолчанию 15000)
   * @param {string} options.label - Метка для логирования
   * @returns {Promise} { data, error } или результат запроса
   */
  async function fetchWithRetry(requestFn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 1000;
    const timeoutMs = options.timeoutMs || 15000;
    const label = options.label || 'request';
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Таймаут для каждой попытки
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeoutMs)
        );
        
        // requestFn — функция, которая создаёт новый Promise при каждом вызове
        const result = await Promise.race([requestFn(), timeoutPromise]);
        
        // Supabase возвращает { data, error } — проверяем error
        if (result && result.error && isNetworkError(result.error)) {
          throw new Error(result.error.message || 'Network error');
        }
        
        // Успешный запрос — регистрируем
        registerSuccess();
        return result;
      } catch (e) {
        lastError = e;
        
        // Если это не сетевая ошибка — не ретраим
        if (!isNetworkError({ message: e.message })) {
          return { data: null, error: { message: e.message } };
        }
        
        // Регистрируем ошибку
        registerError();
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s с jitter ±20%
          const baseDelay = baseDelayMs * Math.pow(2, attempt);
          const jitter = baseDelay * (0.8 + Math.random() * 0.4); // ±20%
          const delay = Math.round(jitter);
          console.warn(`[HEYS.cloud] ⚡ ${label}: сетевая ошибка, retry ${attempt + 1}/${maxRetries} через ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    // Все ретраи исчерпаны — попробуем fallback
    if (options._afterFallback) {
      // Уже пробовали fallback — сдаёмся
      console.warn(`[HEYS.cloud] ❌ ${label}: fallback тоже не помог, переход в offline режим`);
      return { data: null, error: { message: lastError?.message || 'Network error after retries', isNetworkFailure: true } };
    }
    
    // Проверяем можно ли переключаться
    if (!canSwitch()) {
      console.warn(`[HEYS.cloud] ❌ ${label}: все ${maxRetries} попытки не удались, переключение заблокировано (debounce)`);
      return { data: null, error: { message: lastError?.message || 'Network error after retries', isNetworkFailure: true } };
    }
    
    // Попробуем переключиться на другой режим
    if (!_usingDirectConnection && cloud._directUrl && cloud._proxyUrl !== cloud._directUrl) {
      // Сейчас на proxy — переключаемся на direct
      console.warn(`[HEYS.cloud] 🔄 ${label}: переключаемся на прямое подключение к Supabase...`);
      try {
        _lastSwitchTime = Date.now();
        _consecutiveErrors = 0;
        await switchToDirectConnection();
        return await fetchWithRetry(requestFn, { ...options, _afterFallback: true });
      } catch (fallbackErr) {
        console.warn(`[HEYS.cloud] ❌ Direct fallback не сработал:`, fallbackErr?.message);
      }
    } else if (_usingDirectConnection && cloud._proxyUrl) {
      // Сейчас на direct — переключаемся на proxy
      console.warn(`[HEYS.cloud] 🔄 ${label}: переключаемся обратно на proxy...`);
      try {
        await switchToProxyConnection();
        return await fetchWithRetry(requestFn, { ...options, _afterFallback: true });
      } catch (fallbackErr) {
        console.warn(`[HEYS.cloud] ❌ Proxy fallback не сработал:`, fallbackErr?.message);
      }
    }
    
    console.warn(`[HEYS.cloud] ❌ ${label}: все ${maxRetries} попытки не удались, переход в offline режим`);
    return { data: null, error: { message: lastError?.message || 'Network error after retries', isNetworkFailure: true } };
  }
  
  /**
   * Переключение на прямое подключение к Supabase (fallback при недоступности proxy)
   * ⚠️ Не пересоздаём client чтобы избежать "Multiple GoTrueClient" warning
   * Просто сохраняем режим — при следующей перезагрузке применится
   */
  async function switchToDirectConnection() {
    if (_usingDirectConnection) return; // Уже переключились
    if (!cloud._directUrl || !cloud._anonKey) {
      throw new Error('Direct URL not configured');
    }
    
    _usingDirectConnection = true;
    _lastSwitchTime = Date.now();
    _consecutiveErrors = 0;
    _successCount = 0;
    
    // Сохраняем режим для следующей загрузки
    try {
      localStorage.setItem('heys_connection_mode', 'direct');
      logCritical('🔄 [ROUTING] Режим "direct" сохранён — применится после перезагрузки');
    } catch (e) {
      console.warn('[ROUTING] Не удалось сохранить режим:', e.message);
    }
    
    // НЕ пересоздаём client — текущая сессия продолжит работать на proxy
    // При следующей загрузке приложение стартует с direct
    addSyncLogEntry('mode_change', { newMode: 'direct', appliedAt: 'next_reload' });
  }
  
  /**
   * Переключение обратно на proxy подключение (fallback при недоступности direct)
   * ⚠️ Не пересоздаём client чтобы избежать "Multiple GoTrueClient" warning
   * Просто сохраняем режим — при следующей перезагрузке применится
   */
  async function switchToProxyConnection() {
    if (!_usingDirectConnection) return; // Уже на прокси
    if (!cloud._proxyUrl || !cloud._anonKey) {
      throw new Error('Proxy URL not configured');
    }
    
    _usingDirectConnection = false;
    _lastSwitchTime = Date.now();
    _consecutiveErrors = 0;
    _successCount = 0;
    
    // Сохраняем режим для следующей загрузки
    try {
      localStorage.setItem('heys_connection_mode', 'proxy');
      logCritical('🔄 [ROUTING] Режим "proxy" сохранён — применится после перезагрузки');
    } catch (e) {
      console.warn('[ROUTING] Не удалось сохранить режим:', e.message);
    }
    
    // НЕ пересоздаём client — текущая сессия продолжит работать на direct
    // При следующей загрузке приложение стартует с proxy
    addSyncLogEntry('mode_change', { newMode: 'proxy', appliedAt: 'next_reload' });
  }
  
  /**
   * Проверка, можно ли переключаться на другой режим
   */
  function canSwitch() {
    // Debounce: не переключаться слишком часто
    if (Date.now() - _lastSwitchTime < SWITCH_DEBOUNCE_MS) {
      log(`[ROUTING] Переключение заблокировано — прошло ${Date.now() - _lastSwitchTime}ms < ${SWITCH_DEBOUNCE_MS}ms`);
      return false;
    }
    // Требуем несколько последовательных ошибок
    if (_consecutiveErrors < MIN_ERRORS_FOR_SWITCH) {
      log(`[ROUTING] Переключение заблокировано — только ${_consecutiveErrors} ошибок < ${MIN_ERRORS_FOR_SWITCH}`);
      return false;
    }
    return true;
  }
  
  /**
   * Регистрация успешного запроса
   */
  function registerSuccess() {
    _consecutiveErrors = 0;
    _successCount++;
    
    // После 3+ успешных запросов сохраняем режим
    if (_successCount === MIN_SUCCESS_FOR_SAVE) {
      const mode = _usingDirectConnection ? 'direct' : 'proxy';
      try {
        localStorage.setItem('heys_connection_mode', mode);
        log(`[ROUTING] ✅ Режим '${mode}' сохранён после ${_successCount} успешных запросов`);
      } catch (e) {
        console.warn('[ROUTING] Не удалось сохранить режим в localStorage:', e.message);
      }
    }
  }
  
  /**
   * Регистрация ошибки запроса
   */
  function registerError() {
    // Не накапливать ошибки в offline режиме — это не проблема с routing
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    _consecutiveErrors++;
    _successCount = 0;
  }

  // Экспортируем для отладки и использования из других модулей
  cloud.switchToDirectConnection = switchToDirectConnection;
  cloud.switchToProxyConnection = switchToProxyConnection;
  cloud.registerSuccess = registerSuccess;
  cloud.registerError = registerError;
  cloud.fetchWithRetry = fetchWithRetry; // Для внешних модулей (heys_app_v12.js)
  cloud.getRoutingStatus = function() {
    return {
      mode: _usingDirectConnection ? 'direct' : 'proxy',
      consecutiveErrors: _consecutiveErrors,
      successCount: _successCount,
      lastSwitchTime: _lastSwitchTime,
      canSwitch: canSwitch()
    };
  };

  /**
   * Обёртка для запросов с таймаутом (legacy, для простых запросов)
   * @param {Promise} promise - Promise для выполнения
   * @param {number} ms - Таймаут в миллисекундах (по умолчанию 10000)
   * @param {string} label - Метка для логирования ошибки
   * @returns {Promise} Результат или {error} при таймауте
   */
  async function withTimeout(promise, ms = 10000, label = 'request') {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout: ${label} took too long`)), ms)
    );
    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (e) {
      // Для bootstrapSync таймаут — это нормально при медленной сети, не критическая ошибка
      if (label.includes('bootstrap')) {
        console.warn(`[HEYS.cloud] ⏳ ${label}: медленная сеть, синхронизация продолжается...`);
      } else {
        err(`${label} timeout`, e.message);
      }
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Безопасный парсинг JSON
   * @param {string} v - Строка для парсинга
   * @returns {*} Распарсенное значение или исходная строка при ошибке
   */
  function tryParse(v){ 
    try{
      return JSON.parse(v);
    }catch(e){ 
      return v; 
    } 
  }

  /**
   * Проверка, является ли ключ нашим (для зеркалирования/очистки)
   * @param {string} k - Ключ для проверки
   * @returns {boolean} true если это наш ключ
   */
  function isOurKey(k){
    if (typeof k !== 'string') return false;
    if (k.indexOf(KEY_PREFIXES.HEYS) === 0) return true;
    // также разрешаем ключи дней
    const lower = k.toLowerCase();
    if (lower.indexOf(KEY_PREFIXES.DAY) >= 0) return true;
    return false;
  }

  /**
   * Очистка namespace в localStorage (наши ключи)
   * @param {string} clientId - ID клиента для очистки специфичных ключей, или null для полной очистки
   */
  function clearNamespace(clientId){
    try{
      const ls = global.localStorage;
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (!k) continue;
        const lower = k.toLowerCase();
        
        if (clientId) {
          // Очистка только client-specific ключей
          const heysClientPrefix = (KEY_PREFIXES.HEYS + clientId + '_').toLowerCase();
          const dayClientPrefix = (CLIENT_KEY_PATTERNS.DAY_CLIENT + clientId + '_').toLowerCase();
          
          if (lower.indexOf(heysClientPrefix) === 0) { 
            ls.removeItem(k); 
            continue; 
          }
          if (lower.indexOf(dayClientPrefix) === 0) { 
            ls.removeItem(k); 
            continue; 
          }
          
          // Также очищаем общие ключи, которые должны быть client-specific
          if (CLIENT_SPECIFIC_KEYS.includes(k)) {
            ls.removeItem(k);
            continue;
          }
        } else {
          // Полная очистка всех наших ключей
          if (isOurKey(k)) ls.removeItem(k);
        }
      }
    }catch(e){ 
      err('clearNamespace', e); 
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 ПЕРЕХВАТ LOCALSTORAGE
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Проверка, требует ли ключ client-specific хранилища
   * @param {string} k - Ключ для проверки (может быть scoped: heys_{clientId}_game)
   * @returns {boolean} true если нужен client_kv_store
   */
  function needsClientStorage(k) {
    if (!k) return false;
    // Проверяем дни пользователя
    if (k.includes(CLIENT_KEY_PATTERNS.DAY_V2)) return true;
    
    // Извлекаем базовый ключ из scoped (heys_{clientId}_game → heys_game)
    // Pattern: heys_{uuid}_suffix → heys_suffix
    const baseKey = k.replace(/^heys_[a-f0-9-]{36}_/, 'heys_');
    
    // Проверяем общие client-specific ключи
    if (CLIENT_SPECIFIC_KEYS.includes(k) || CLIENT_SPECIFIC_KEYS.includes(baseKey)) return true;
    
    // Проверяем префиксы (динамические ключи типа heys_milestone_7_days)
    for (const prefix of CLIENT_SPECIFIC_PREFIXES) {
      if (k.startsWith(prefix) || baseKey.startsWith(prefix)) return true;
    }
    return false;
  }
  
  /**
   * Перехват localStorage.setItem для автоматического зеркалирования в cloud
   * Зеркалирует наши ключи (heys_*, day*) в Supabase
   * Обрабатывает QuotaExceededError автоматической очисткой
   */
  // Дедупликация: последние сохранённые ключи и их updatedAt
  const _lastSavedKeys = new Map(); // key → { updatedAt, timestamp }
  const DEDUP_WINDOW_MS = 1000; // Окно дедупликации: 1 секунда
  
  function interceptSetItem(){
    try{
      if (originalSetItem) return; // Защита от повторного перехвата
      
      // Сохраняем оригинальный метод в глобальную переменную
      originalSetItem = global.localStorage.setItem.bind(global.localStorage);
      global.localStorage.setItem = function(k, v){
        // Используем безопасную запись с обработкой QuotaExceeded
        if (!safeSetItem(k, v)) {
          // Если не удалось сохранить даже после очистки — логируем
          console.warn('[HEYS] Не удалось сохранить:', k);
          return;
        }
        
        if (!muteMirror && isOurKey(k)){
          // 🔒 Дедупликация: пропускаем повторные сохранения с тем же updatedAt
          const parsed = tryParse(v);
          const updatedAt = parsed?.updatedAt || 0;
          const now = Date.now();
          const lastSaved = _lastSavedKeys.get(k);
          
          if (lastSaved && updatedAt > 0 && lastSaved.updatedAt === updatedAt && (now - lastSaved.timestamp) < DEDUP_WINDOW_MS) {
            // Пропускаем дубликат
            // DEBUG (отключено): log(`🔄 [DEDUP] Skipped duplicate save: ${k} | updatedAt: ${updatedAt}`);
            return;
          }
          
          // Запоминаем это сохранение
          if (updatedAt > 0) {
            _lastSavedKeys.set(k, { updatedAt, timestamp: now });
            // Очищаем старые записи (>10 сек)
            for (const [key, val] of _lastSavedKeys) {
              if (now - val.timestamp > 10000) _lastSavedKeys.delete(key);
            }
          }
          
          if (needsClientStorage(k)) {
            cloud.saveClientKey(k, parsed);
          } else {
            cloud.saveKey(k, parsed);
          }
        }
      };
    }catch(e){ 
      err('intercept setItem failed', e); 
    }
  }
  
  // Флаг для fallback на прямое подключение
  let _usingDirectConnection = false;
  cloud.isUsingDirectConnection = function() { return _usingDirectConnection; };
  
  // Защита от ping-pong переключений
  let _lastSwitchTime = 0;
  let _consecutiveErrors = 0;
  let _successCount = 0;
  const SWITCH_DEBOUNCE_MS = 30000; // Не переключаться чаще чем раз в 30 сек
  const MIN_ERRORS_FOR_SWITCH = 2; // Требуем 2+ ошибок подряд для переключения
  const MIN_SUCCESS_FOR_SAVE = 3; // 3+ успешных запросов для сохранения режима

  cloud.init = function({ url, anonKey, localhostProxyUrl }){
    // Idempotent init: avoid double creation & duplicate intercept logs
    if (cloud._inited) { return; }
    if (!global.supabase || !global.supabase.createClient){
      err('supabase-js не загружен — CDN заблокирован?');
      // Сохраняем флаг для показа сообщения пользователю
      cloud._loadError = 'Библиотека Supabase не загружена. Возможно, CDN заблокирован провайдером.';
      return;
    }
    
    // Сохраняем оба URL для fallback
    cloud._proxyUrl = localhostProxyUrl || url; // На localhost: production proxy как fallback
    cloud._directUrl = 'https://ukqolcziqcuplqfgrmsh.supabase.co';
    cloud._anonKey = anonKey;
    
    // Определяем среду
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1'));
    
    // 🔄 Smart выбор режима при старте
    let initialUrl = url;
    let needsHealthCheck = false;
    
    // На localhost: всегда используем переданный URL (direct), игнорируем сохранённый режим
    // На production: восстанавливаем сохранённый режим
    if (isLocalhost) {
      log('[ROUTING] Localhost — используем direct, игнорируем сохранённый режим');
      _usingDirectConnection = (url === cloud._directUrl);
      needsHealthCheck = true; // Проверим доступность direct, если нет — переключим на proxy
    } else {
      try {
        const savedMode = localStorage.getItem('heys_connection_mode');
        if (savedMode === 'direct' && cloud._directUrl) {
          log('[ROUTING] Восстанавливаем сохранённый режим: direct');
          initialUrl = cloud._directUrl;
          _usingDirectConnection = true;
          needsHealthCheck = true; // Проверим доступность direct после инициализации
        } else if (savedMode === 'proxy') {
          log('[ROUTING] Используем сохранённый режим: proxy');
        } else {
          log('[ROUTING] Нет сохранённого режима, используем proxy (default для РФ)');
        }
      } catch (e) {
        console.warn('[ROUTING] Ошибка чтения режима из localStorage:', e.message);
      }
    }
    
    // Health-ping функция — вызывается после создания client
    // ⚠️ На production: только сохраняет режим для следующей загрузки (не пересоздаёт client)
    // ⚠️ На localhost: пересоздаёт client сразу (dev режим, удобство важнее)
    const runHealthCheck = async () => {
      if (!needsHealthCheck || !client) return;
      try {
        log('[ROUTING] 🏥 Health-check подключения...');
        
        // Таймаут через Promise.race (Supabase не поддерживает abortSignal напрямую)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health-check timeout')), 3000)
        );
        
        const fetchPromise = client.from('kv_store').select('k').limit(1);
        const { error } = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (error) {
          log('[ROUTING] ⚠️ Текущий режим недоступен:', error.message);
          await handleHealthCheckFailure();
        } else {
          log('[ROUTING] ✅ Подключение работает');
          registerSuccess();
        }
      } catch (e) {
        log('[ROUTING] ⚠️ Health-check timeout/error:', e.message);
        await handleHealthCheckFailure();
      }
    };
    
    // Обработка провала health-check
    const handleHealthCheckFailure = async () => {
      const fallbackMode = _usingDirectConnection ? 'proxy' : 'direct';
      
      // Сохраняем режим для следующей загрузки — НЕ пересоздаём клиент!
      // Пересоздание клиента вызывает "Multiple GoTrueClient instances" предупреждение
      // и может привести к race conditions с токенами
      try { 
        localStorage.setItem('heys_connection_mode', fallbackMode); 
        log('[ROUTING] 💾 Сохранён режим', fallbackMode, 'для следующей загрузки');
      } catch (_) {}
      
      // На localhost показываем сообщение о необходимости перезагрузки
      if (isLocalhost && !cloud._healthCheckFallbackDone) {
        cloud._healthCheckFallbackDone = true;
        log('[ROUTING] ⚠️ Localhost: требуется перезагрузка для переключения на', fallbackMode);
      }
    };
    
    try{
      // 🔄 Миграция сессии из старого ключа в новый (один раз)
      const OLD_AUTH_KEY = 'sb-ukqolcziqcuplqfgrmsh-auth-token';
      const NEW_AUTH_KEY = 'heys_supabase_auth_token';
      try {
        const oldSession = localStorage.getItem(OLD_AUTH_KEY);
        const newSession = localStorage.getItem(NEW_AUTH_KEY);
        if (oldSession && !newSession) {
          log('[AUTH] Migrating session from old key to new key');
          localStorage.setItem(NEW_AUTH_KEY, oldSession);
        }
      } catch (e) {}
      
      // Единый storageKey для auth — сессия сохраняется при переключении proxy↔direct
      client = global.supabase.createClient(initialUrl, anonKey, {
        auth: {
          persistSession: true,
          storageKey: NEW_AUTH_KEY,
          storage: global.localStorage
        }
      });
      cloud.client = client;
      status = 'offline';
      interceptSetItem();
      cloud._inited = true;
      log('cloud bridge loaded', _usingDirectConnection ? '(direct)' : '(proxy)');
      
      // 🏥 Health-check если стартуем в direct режиме (проверяем VPN доступен ли)
      // Запускаем асинхронно но НЕ блокируем — fetchWithRetry сам переключится при ошибках
      if (needsHealthCheck) {
        // Фоновая проверка — если direct недоступен, переключимся
        runHealthCheck().catch(() => {});
      }

      // 🔄 Автовосстановление сессии при старте
      if (client.auth && client.auth.getSession) {
        client.auth.getSession().then(({ data }) => {
          const session = data?.session;
          const restoredUser = session?.user;
          const expiresAt = session?.expires_at ? session.expires_at * 1000 : null;
          if (expiresAt && expiresAt < Date.now()) {
            logCritical('⚠️ Сессия истекла, требуется повторный вход');
            status = CONNECTION_STATUS.OFFLINE;
            return;
          }
          if (restoredUser) {
            user = restoredUser;
            status = CONNECTION_STATUS.SYNC;
            logCritical('🔄 Сессия восстановлена:', user.email || user.id);
            const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
            const finishOnline = () => {
              status = CONNECTION_STATUS.ONLINE;
              cloud.retrySync && cloud.retrySync();
            };
            if (clientId) {
              cloud.bootstrapClientSync(clientId)
                .then(finishOnline)
                .catch((e) => {
                  logCritical('⚠️ Ошибка bootstrap после восстановления сессии:', e?.message || e);
                  finishOnline();
                });
            } else {
              finishOnline();
            }
          }
        }).catch(() => {});

        // Подписка на изменения auth
        client.auth.onAuthStateChange((event, session) => {
          log('[AUTH] onAuthStateChange:', event);
          if (event === 'SIGNED_OUT') {
            user = null;
            status = CONNECTION_STATUS.OFFLINE;
            clearNamespace();
          } else if (event === 'TOKEN_REFRESHED' && session?.user) {
            // Токен успешно обновлён
            user = session.user;
            status = CONNECTION_STATUS.ONLINE;
            log('🔄 Token refreshed successfully');
          } else if (event === 'SIGNED_IN' && session?.user) {
            user = session.user;
            status = CONNECTION_STATUS.ONLINE;
          }
        });
        
        // 🔄 Очистка невалидного токена при ошибке "Already Used"
        // Supabase v2 использует refresh token rotation — каждый токен одноразовый
        // Если токен уже использован (другая вкладка, race condition), очищаем его
        const checkAndClearInvalidToken = () => {
          try {
            const stored = localStorage.getItem('heys_supabase_auth_token');
            if (stored) {
              const parsed = JSON.parse(stored);
              // Если нет access_token или refresh_token — токен невалидный
              if (!parsed?.access_token && !parsed?.refresh_token) {
                log('[AUTH] Clearing empty auth token');
                localStorage.removeItem('heys_supabase_auth_token');
              }
            }
          } catch (e) {}
        };
        // Проверяем сразу после инициализации
        setTimeout(checkAndClearInvalidToken, 100);
      }
    }catch(e){ err('init failed', e); }
  };

  cloud.signIn = async function(email, password){
    if (!client) { 
      err('client not initialized'); 
      const reason = cloud._loadError || 'Сервис авторизации недоступен. Попробуйте позже.';
      return { error: { message: reason } }; 
    }
    // Проверяем сеть перед попыткой входа
    if (!navigator.onLine) {
      status = 'offline';
      return { error: { message: 'Нет подключения к интернету' } };
    }
    try{
      status = 'signin';
      
      // 🔄 Очищаем старый токен перед входом — предотвращает race condition с refresh
      try {
        localStorage.removeItem('heys_supabase_auth_token');
      } catch (e) {}
      
      // 🔄 Сначала делаем signOut чтобы очистить кэш SDK
      try {
        await client.auth.signOut();
      } catch (e) {}
      
      // Небольшая задержка чтобы SDK успел очистить состояние
      await new Promise(r => setTimeout(r, 100));
      
      // Увеличен таймаут до 15 секунд для мобильных сетей
      const { data, error } = await withTimeout(
        client.auth.signInWithPassword({ email, password }),
        15000,
        'signIn'
      );
      
      if (error) { 
        status = 'offline'; 
        logCritical('❌ Ошибка входа:', error.message || error);
        return { error }; 
      }
      user = data?.user;
      if (!user) { status = 'offline'; err('no user after signin'); return { error: 'no user' }; }
      
      // 🔄 Принудительно обновляем сессию в SDK после успешного входа
      // Это гарантирует что все последующие запросы используют новый токен
      try {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData?.session) {
          log('[AUTH] Session refreshed after signIn:', sessionData.session.user?.email);
        }
      } catch (e) {
        log('[AUTH] Session refresh failed:', e.message);
      }
      
      status = 'sync';
      await cloud.bootstrapSync();
      status = 'online';
      logCritical('✅ Вход выполнен:', user.email);
      return { user };
    }catch(e){
      status = 'offline';
      logCritical('❌ Ошибка входа (exception):', e.message || e);
      return { error: e };
    }
  };

  cloud.signOut = function(){
    if (client) client.auth.signOut();
    user = null;
    status = 'offline';
    clearNamespace();
    // 🔄 Очистка auth токена — предотвращает 400 Bad Request при следующем запуске
    try {
      localStorage.removeItem('heys_supabase_auth_token');
    } catch (e) {}
    // 🔄 Сброс флагов sync — при следующем входе нужна новая синхронизация
    initialSyncCompleted = false;
    startFailsafeTimer(); // Перезапустить failsafe для нового входа
    // 🔄 Сброс сохранённого режима — при следующем входе определится заново
    try {
      localStorage.removeItem('heys_connection_mode');
    } catch (e) {}
    logCritical('🚪 Выход из системы');
  };

  cloud.getUser = function(){ return user; };
  cloud.getStatus = function(){ return status; };

  /**
   * Полная очистка auth-данных для решения проблем с токенами
   * Вызывать из консоли: HEYS.cloud.resetAuth()
   */
  cloud.resetAuth = function() {
    try {
      // Очищаем все auth-related ключи
      const keysToRemove = [
        'heys_supabase_auth_token',
        'sb-ukqolcziqcuplqfgrmsh-auth-token',
        'heys_connection_mode',
        'heys_remember_me',
        'heys_saved_email',
        'heys_remember_email'
      ];
      keysToRemove.forEach(key => {
        try { localStorage.removeItem(key); } catch (e) {}
      });
      
      // Выходим из Supabase
      if (client && client.auth) {
        client.auth.signOut().catch(() => {});
      }
      
      user = null;
      status = CONNECTION_STATUS.OFFLINE;
      
      logCritical('🔄 Auth данные очищены. Перезагрузите страницу.');
      return { success: true, message: 'Auth reset. Please reload the page.' };
    } catch (e) {
      console.error('[resetAuth] Error:', e);
      return { error: e.message };
    }
  };

  /**
   * Очищает невалидные продукты из localStorage (без name)
   * Вызывать для восстановления после бага с undefined продуктами
   */
  cloud.cleanupProducts = function() {
    try {
      const clientId = HEYS.utils?.getCurrentClientId?.() || '';
      const key = clientId ? `heys_${clientId}_products` : 'heys_products';
      const raw = localStorage.getItem(key);
      if (!raw) return { cleaned: 0, total: 0 };
      
      // Защита от повреждённых данных (не-JSON)
      let products;
      try {
        products = JSON.parse(raw);
      } catch (parseError) {
        // Данные временно некорректны (возможно race condition при записи)
        // НЕ удаляем — пусть следующий sync перезапишет
        console.warn(`⚠️ [CLEANUP] Temporary parse error for ${key}, skipping (will retry)`);
        return { cleaned: 0, total: 0, parseError: true };
      }
      
      if (!Array.isArray(products)) return { cleaned: 0, total: 0 };
      
      const before = products.length;
      const cleaned = products.filter(p => 
        p && typeof p.name === 'string' && p.name.trim().length > 0
      );
      const after = cleaned.length;
      
      if (after < before) {
        localStorage.setItem(key, JSON.stringify(cleaned));
        logCritical(`🧹 [CLEANUP] Removed ${before - after} invalid products (${before} → ${after})`);
      }
      
      return { cleaned: before - after, total: after };
    } catch (e) {
      console.error('[CLEANUP] Error:', e);
      return { error: e.message };
    }
  };

  /**
   * Удаляет orphan продукты из приёмов пищи
   * @param {string[]} orphanNames - список названий продуктов для удаления
   * @returns {Object} статистика { daysAffected, itemsRemoved }
   */
  cloud.cleanupOrphanMealItems = function(orphanNames) {
    if (!Array.isArray(orphanNames) || orphanNames.length === 0) {
      console.warn('[CLEANUP ORPHANS] No orphan names provided');
      return { daysAffected: 0, itemsRemoved: 0 };
    }
    
    const clientId = HEYS.utils?.getCurrentClientId?.() || '';
    const prefix = clientId ? `heys_${clientId}_dayv2_` : 'heys_dayv2_';
    const orphanSet = new Set(orphanNames.map(n => n.toLowerCase().trim()));
    
    let daysAffected = 0;
    let itemsRemoved = 0;
    
    // Проходим по всем ключам localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.includes('dayv2_')) continue;
      
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        
        const dayData = JSON.parse(raw);
        if (!dayData || !Array.isArray(dayData.meals)) continue;
        
        let dayModified = false;
        
        // Фильтруем items в каждом meal
        dayData.meals = dayData.meals.map(meal => {
          if (!meal || !Array.isArray(meal.items)) return meal;
          
          const beforeCount = meal.items.length;
          meal.items = meal.items.filter(item => {
            const itemName = (item.name || '').toLowerCase().trim();
            const isOrphan = orphanSet.has(itemName);
            if (isOrphan) itemsRemoved++;
            return !isOrphan;
          });
          
          if (meal.items.length !== beforeCount) {
            dayModified = true;
          }
          
          return meal;
        });
        
        // Удаляем пустые meals
        dayData.meals = dayData.meals.filter(meal => 
          meal && Array.isArray(meal.items) && meal.items.length > 0
        );
        
        if (dayModified) {
          daysAffected++;
          dayData.updatedAt = Date.now();
          localStorage.setItem(key, JSON.stringify(dayData));
          
          // Синхронизируем изменения в облако
          const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
          if (dateMatch && clientId) {
            const dayKey = `heys_dayv2_${dateMatch[1]}`;
            cloud.saveClientKey(clientId, dayKey, dayData);
          }
        }
      } catch (e) {
        console.warn('[CLEANUP ORPHANS] Error processing', key, e);
      }
    }
    
    if (itemsRemoved > 0) {
      logCritical(`🧹 [CLEANUP ORPHANS] Removed ${itemsRemoved} orphan items from ${daysAffected} days: ${orphanNames.join(', ')}`);
    } else {
      log(`🧹 [CLEANUP ORPHANS] No orphan items found for: ${orphanNames.join(', ')}`);
    }
    
    return { daysAffected, itemsRemoved };
  };

  /**
   * Очищает невалидные продукты в ОБЛАКЕ
   * Проверяет ОБЕ таблицы: kv_store И client_kv_store
   * Удаляет записи с мусорными продуктами и пустые legacy записи
   */
  cloud.cleanupCloudProducts = async function() {
    try {
      if (!client || !user) return { error: 'Not authenticated' };
      
      // Сохраняем user.id локально — user может стать null во время async операций
      const userId = user.id;
      if (!userId) return { error: 'No userId' };
      
      const clientId = HEYS.utils?.getCurrentClientId?.() || '';
      if (!clientId) return { error: 'No clientId' };
      
      let totalCleaned = 0;
      let totalAfter = 0;
      let totalDeleted = 0;
      let totalRecords = 0;
      
      // ===== 1. ОЧИСТКА kv_store (глобальные данные) =====
      const { data: kvData, error: kvError } = await client
        .from('kv_store')
        .select('k,v')
        .eq('user_id', userId)
        .like('k', '%products%');
      
      if (kvError) {
        logCritical('☁️ [CLOUD CLEANUP] kv_store error:', kvError.message);
      } else if (kvData && kvData.length > 0) {
        totalRecords += kvData.length;
        for (const row of kvData) {
          // Проверяем что user ещё авторизован (мог logout во время цикла)
          if (!user) {
            log('☁️ [CLOUD CLEANUP] Aborted — user logged out');
            return { error: 'User logged out during cleanup' };
          }
          const result = await cleanupProductRecord('kv_store', row, { user_id: userId }, clientId);
          totalCleaned += result.cleaned;
          totalAfter += result.kept;
          if (result.deleted) totalDeleted++;
        }
      }
      
      // ===== 2. ОЧИСТКА client_kv_store (данные клиента) =====
      const { data: clientData, error: clientError } = await client
        .from('client_kv_store')
        .select('k,v')
        .eq('client_id', clientId)
        .like('k', '%products%');
      
      if (clientError) {
        logCritical('☁️ [CLOUD CLEANUP] client_kv_store error:', clientError.message);
      } else if (clientData && clientData.length > 0) {
        totalRecords += clientData.length;
        for (const row of clientData) {
          // Проверяем что user ещё авторизован (мог logout во время цикла)
          if (!user) {
            log('☁️ [CLOUD CLEANUP] Aborted — user logged out');
            return { error: 'User logged out during cleanup' };
          }
          const result = await cleanupProductRecord('client_kv_store', row, { client_id: clientId }, clientId);
          totalCleaned += result.cleaned;
          totalAfter += result.kept;
          if (result.deleted) totalDeleted++;
        }
      }
      
      // Логируем только если были изменения или много записей
      if (totalDeleted > 0 || totalCleaned > 0) {
        logCritical(`☁️ [CLOUD CLEANUP] Done: ${totalRecords} records, deleted ${totalDeleted} empty, cleaned ${totalCleaned} invalid, kept ${totalAfter} valid`);
      } else if (totalRecords > 0) {
        log(`☁️ [CLOUD CLEANUP] OK: ${totalRecords} records, ${totalAfter} products`);
      }
      
      return { cleaned: totalCleaned, deleted: totalDeleted, total: totalAfter };
    } catch (e) {
      console.error('[CLOUD CLEANUP] Error:', e);
      return { error: e.message };
    }
  };
  
  /**
   * Хелпер: очистка одной записи продуктов
   * - Удаляет записи с 0 продуктами (мусор)
   * - Удаляет невалидные продукты из записей
   * - Тихий режим для OK записей
   */
  async function cleanupProductRecord(table, row, filters, clientId) {
    // Защита от race condition при logout
    if (!client || !user) {
      return { cleaned: 0, kept: 0, error: 'Not authenticated' };
    }
    
    const products = row.v;
    
    // Пустой массив или не массив — удаляем запись
    if (!Array.isArray(products) || products.length === 0) {
      let query = client.from(table).delete();
      for (const [key, val] of Object.entries(filters)) {
        query = query.eq(key, val);
      }
      query = query.eq('k', row.k);
      
      const { error: deleteError } = await query;
      
      if (!deleteError) {
        logCritical(`☁️ [CLOUD CLEANUP] DELETED empty ${table}.${row.k}`);
      }
      return { cleaned: 0, kept: 0, deleted: true };
    }
    
    const before = products.length;
    const cleaned = products.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
    const after = cleaned.length;
    
    // Все продукты валидные — тихий OK (не логируем каждую запись)
    if (after === before) {
      return { cleaned: 0, kept: after };
    }
    
    // 🚨 Если ВСЕ продукты невалидные — удаляем запись полностью!
    if (after === 0) {
      let query = client.from(table).delete();
      for (const [key, val] of Object.entries(filters)) {
        query = query.eq(key, val);
      }
      query = query.eq('k', row.k);
      
      const { error: deleteError } = await query;
      
      if (deleteError) {
        logCritical(`☁️ [CLOUD CLEANUP] Failed to delete ${table}.${row.k}:`, deleteError.message);
        return { cleaned: 0, kept: 0 };
      } else {
        logCritical(`☁️ [CLOUD CLEANUP] DELETED garbage ${table}.${row.k} (had ${before} invalid)`);
        return { cleaned: before, kept: 0, deleted: true };
      }
    }
    
    // Сохраняем очищенные обратно
    const upsertData = {
      ...filters,
      k: row.k,
      v: cleaned,
      updated_at: new Date().toISOString()
    };
    // client_kv_store требует client_id
    if (table === 'client_kv_store' && !upsertData.client_id) {
      upsertData.client_id = clientId;
    }
    
    const onConflict = table === 'kv_store' ? 'user_id,k' : 'client_id,k';
    const { error: upsertError } = await client.from(table).upsert(upsertData, { onConflict });
    
    if (upsertError) {
      logCritical(`☁️ [CLOUD CLEANUP] Failed to save ${table}.${row.k}:`, upsertError.message);
      return { cleaned: 0, kept: after };
    } else {
      logCritical(`☁️ [CLOUD CLEANUP] ${table}.${row.k}: Cleaned ${before - after} invalid (${before} → ${after})`);
      return { cleaned: before - after, kept: after };
    }
  }

  cloud.bootstrapSync = async function(){
    try{
      muteMirror = true;
      if (!client || !user) { muteMirror = false; return; }
      
      // 🧹 Очистка невалидных продуктов перед синхронизацией
      cloud.cleanupProducts();
      
      // Retry с exponential backoff для сетевых ошибок (QUIC, network)
      const { data, error } = await fetchWithRetry(
        () => client.from('kv_store').select('k,v,updated_at'),
        { maxRetries: 3, timeoutMs: 20000, label: 'bootstrapSync' }
      );
      
      // Graceful degradation: если сеть не работает — продолжаем с localStorage
      if (error) { 
        if (error.isNetworkFailure) {
          console.warn('[HEYS.cloud] 📴 bootstrapSync: работаем offline с локальными данными');
        } else {
          err('bootstrap select', error); 
        }
        muteMirror = false; 
        return; 
      }
      const ls = global.localStorage;
      // clear only global keys for full bootstrap (no clientId)
      clearNamespace();
      (data||[]).forEach(row => {
        try {
          const key = row.k;
          ls.setItem(key, JSON.stringify(row.v));
        } catch(e){}
      });
      muteMirror = false;
      // Убрано избыточное логирование bootstrap synced keys
    }catch(e){ err('bootstrap exception', e); muteMirror=false; }
  };

  // Флаг для дедупликации параллельных вызовов bootstrapClientSync
  let _syncInProgress = null; // null | Promise
  // options.force = true — bypass throttling (для pull-to-refresh)
  cloud.bootstrapClientSync = async function(client_id, options){
    if (!client || !user || !client_id) return;
    
    // Дедупликация: если sync уже в процессе для этого клиента — ждём его завершения
    if (_syncInProgress) {
      log('sync already in progress, waiting...');
      return _syncInProgress;
    }
    
    // 🔄 Отменяем длинный failsafe — sync начался, запускаем короткий (20 сек на сам sync)
    cancelFailsafeTimer();
    if (!initialSyncCompleted) {
      failsafeTimerId = setTimeout(() => {
        if (!initialSyncCompleted) {
          logCritical('⚠️ [FAILSAFE] Sync timeout (20s) — enabling saves');
          initialSyncCompleted = true;
        }
      }, 20000);
    }
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: синхронизировать только текущего клиента
    let currentClientId = global.localStorage.getItem('heys_client_current');
    // Распарсить JSON если это строка в кавычках
    if (currentClientId) {
      try {
        currentClientId = JSON.parse(currentClientId);
      } catch(e) {
        // Уже простая строка, не JSON
      }
    }
    if (currentClientId && client_id !== currentClientId) {
      log('client bootstrap skipped (not current client)', client_id, 'current:', currentClientId);
      return;
    }
    
    const now = Date.now();
    
    // Throttling 5 секунд — баланс между нагрузкой и актуальностью данных
    // Раньше было 30 сек, но это слишком долго для multi-device sync
    const SYNC_THROTTLE_MS = 5000;
    const forceSync = options && options.force;
    if (!forceSync && cloud._lastClientSync && cloud._lastClientSync.clientId === client_id && (now - cloud._lastClientSync.ts) < SYNC_THROTTLE_MS){
      // Тихий пропуск throttled запросов
      log('sync throttled, last sync:', Math.round((now - cloud._lastClientSync.ts)/1000), 'sec ago');
      return;
    }
    
    // Устанавливаем флаг что sync в процессе
    _syncInProgress = (async () => {
    try{
      // 🔄 Уведомляем UI что sync начинается (для показа скелетона)
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heysSyncStarting', { detail: { clientId: client_id } }));
      }
      
      // 🧹 Очистка невалидных продуктов перед синхронизацией (локальные)
      cloud.cleanupProducts();
      
      // 🧹 Очистка невалидных продуктов в ОБЛАКЕ (с дедупликацией, не чаще раз в 5 минут)
      const now = Date.now();
      if (!cloud._lastCloudCleanup || (now - cloud._lastCloudCleanup) > 300000) {
        cloud._lastCloudCleanup = now;
        cloud.cleanupCloudProducts().catch(e => console.warn('[CLOUD CLEANUP] Error:', e));
      }
      
      // Проверяем что клиент существует (без автосоздания)
      const _exists = await cloud.ensureClient(client_id);
      if (!_exists){
        log('client bootstrap skipped (no such client)', client_id);
        return;
      }
      
      // Проверяем, действительно ли нужна синхронизация
      // Сначала пробуем загрузить только метаданные для проверки
      // Retry для сетевых ошибок
      const { data: metaData, error: metaError } = await fetchWithRetry(
        () => client
          .from('client_kv_store')
          .select('k,updated_at')
          .eq('client_id', client_id)
          .order('updated_at', { ascending: false })
          .limit(5),
        { maxRetries: 2, timeoutMs: 10000, label: 'clientSync meta check' }
      );
        
      if (metaError) { 
        // Graceful degradation для сетевых ошибок
        if (metaError.isNetworkFailure) {
          console.warn('[HEYS.cloud] 📴 clientSync: сеть недоступна, работаем с локальными данными');
          cloud._lastClientSync = { clientId: client_id, ts: now };
          // Помечаем sync как завершённый чтобы разблокировать сохранение
          if (!initialSyncCompleted) {
            initialSyncCompleted = true;
            logCritical('✅ [OFFLINE] Sync пропущен (сеть), локальные данные активны');
          }
          return;
        }
        err('client bootstrap meta check', metaError);
        throw new Error('Sync meta check failed: ' + (metaError.message || metaError));
      }
      
      // Проверяем, изменились ли данные с последней синхронизации
      const lastSyncTime = cloud._lastClientSync?.ts || 0;
      const hasUpdates = (metaData || []).some(row => 
        new Date(row.updated_at).getTime() > lastSyncTime
      );
      
      if (!hasUpdates && cloud._lastClientSync?.clientId === client_id) {
        log('client bootstrap skipped (no updates)', client_id);
        cloud._lastClientSync.ts = now; // Обновляем timestamp для throttling
        return;
      }
      
      // Теперь загружаем полные данные только если есть обновления
      log('🔄 [CLIENT_SYNC] Loading data for client:', client_id);
      // Retry для сетевых ошибок
      const { data, error } = await fetchWithRetry(
        () => client.from('client_kv_store').select('k,v,updated_at').eq('client_id', client_id),
        { maxRetries: 2, timeoutMs: 20000, label: 'clientSync full data' }
      );
      if (error) { 
        // Graceful degradation
        if (error.isNetworkFailure) {
          console.warn('[HEYS.cloud] 📴 clientSync data: сеть недоступна');
          cloud._lastClientSync = { clientId: client_id, ts: now };
          if (!initialSyncCompleted) {
            initialSyncCompleted = true;
            logCritical('✅ [OFFLINE] Sync пропущен (сеть), локальные данные активны');
          }
          return;
        }
        err('client bootstrap select', error);
        throw new Error('Sync data fetch failed: ' + (error.message || error));
      }
      
      // Компактная статистика вместо 81 строки логов
      const stats = { DAY: 0, PRODUCTS: 0, PROFILE: 0, NORMS: 0, OTHER: 0 };
      (data||[]).forEach(row => {
        if (row.k === 'heys_products') stats.PRODUCTS++;
        else if (row.k.includes('dayv2_')) stats.DAY++;
        else if (row.k.includes('_profile')) stats.PROFILE++;
        else if (row.k.includes('_norms')) stats.NORMS++;
        else stats.OTHER++;
      });
      const summary = Object.entries(stats).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ');
      log(`✅ [CLIENT_SYNC] Loaded ${data?.length || 0} keys (${summary})`);
      
      const ls = global.localStorage;
      muteMirror = true;
      // ❌ КРИТИЧНО: НЕ ОЧИЩАЕМ ВСЁ ПРОСТРАНСТВО КЛИЕНТА
      // clearNamespace стирал все локальные данные, включая продукты!
      // Теперь просто перезаписываем только те ключи, что пришли с сервера
      
      (data||[]).forEach(row => {
        try {
          // row.k is stored in DB as the original key
          // For client-scoped keys like 'heys_products', we need to store them with client_id prefix
          let key = row.k;
          
          // Если ключ 'heys_products' (без client_id), добавляем client_id
          if (key === 'heys_products' || (key.startsWith('heys_') && !key.includes(client_id))) {
            // Преобразуем в scoped key для localStorage
            if (key.startsWith('heys_')) {
              key = 'heys_' + client_id + '_' + key.substring('heys_'.length);
            } else {
              key = 'heys_' + client_id + '_' + key;
            }
            log(`  📝 [MIGRATION] Mapped '${row.k}' → '${key}'`);
          }
          
          // Конфликт: сравнить версии и объединить если нужно
          let local = null;
          try { local = JSON.parse(ls.getItem(key)); } catch(e){}
          
          // Для данных дня используем MERGE вместо "last write wins"
          if (key.includes('dayv2_')) {
            const remoteUpdatedAt = row.v?.updatedAt || 0;
            const localUpdatedAt = local?.updatedAt || 0;
            
            // Если есть локальные изменения И облачные изменения — нужен merge
            if (local && localUpdatedAt > 0 && remoteUpdatedAt > 0) {
              // MERGE: объединяем данные вместо перезаписи
              const merged = mergeDayData(local, row.v);
              if (merged) {
                logCritical(`🔀 [MERGE] Day conflict resolved | key: ${key} | local: ${new Date(localUpdatedAt).toLocaleTimeString()} | remote: ${new Date(remoteUpdatedAt).toLocaleTimeString()}`);
                ls.setItem(key, JSON.stringify(merged));
                
                // Уведомляем UI об обновлении данных дня (для pull-to-refresh)
                const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                if (dateMatch) {
                  window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: dateMatch[1], source: 'merge' } }));
                  logCritical(`📅 [EVENT] heys:day-updated dispatched for ${dateMatch[1]} (merge)`);
                }
                
                // Отправляем merged версию обратно в облако через очередь (гарантия доставки)
                // Используем row.k (оригинальный ключ из БД) для правильной записи
                const mergedUpsertObj = {
                  user_id: user.id,
                  client_id: client_id,
                  k: row.k,
                  v: merged,
                  updated_at: (new Date()).toISOString(),
                };
                clientUpsertQueue.push(mergedUpsertObj);
                scheduleClientPush();
                return; // Уже сохранили merged
              }
            }
            
            // Нет конфликта — просто берём более свежую версию
            if (localUpdatedAt > remoteUpdatedAt) {
              log('conflict: keep local (by updatedAt)', key, localUpdatedAt, '>', remoteUpdatedAt);
              return;
            }
          } else {
            // Остальные ключи: сравниваем по revision И updatedAt
            const remoteRev = row.v && row.v.revision ? row.v.revision : 0;
            const localRev = local && local.revision ? local.revision : 0;
            const remoteUpdatedAt = row.v?.updatedAt || 0;
            const localUpdatedAt = local?.updatedAt || 0;
            
            // Если локальная версия новее по revision ИЛИ updatedAt — не затираем
            if (localRev > remoteRev || localUpdatedAt > remoteUpdatedAt) {
              log('conflict: keep local (by revision/updatedAt)', key, 
                `localRev=${localRev} remoteRev=${remoteRev}`,
                `localUpdatedAt=${localUpdatedAt} remoteUpdatedAt=${remoteUpdatedAt}`);
              return;
            }
            
            // 🛡️ ЗАЩИТА ПРОФИЛЯ: Не затираем заполненный профиль дефолтными значениями
            if (key.includes('_profile')) {
              const remoteIsDefault = row.v && 
                (row.v.weight === 70 && row.v.height === 175 && row.v.age === 30) && 
                (!row.v.updatedAt || row.v.updatedAt === 0);
              const localHasData = local && 
                (local.weight !== 70 || local.height !== 175 || local.age !== 30 || 
                 local.firstName || local.lastName || (local.updatedAt && local.updatedAt > 0));
              
              if (remoteIsDefault && localHasData) {
                logCritical(`⚠️ [PROFILE] BLOCKED: Refusing to overwrite filled profile with default values`);
                logCritical(`  Local: weight=${local.weight}, height=${local.height}, age=${local.age}, updatedAt=${local.updatedAt}`);
                logCritical(`  Remote: weight=${row.v?.weight}, height=${row.v?.height}, age=${row.v?.age}, updatedAt=${row.v?.updatedAt}`);
                return; // Пропускаем сохранение
              }
            }
            
            // 🛡️ ЗАЩИТА GAMIFICATION: XP должен только расти, не сбрасываться
            if (key.includes('_game')) {
              const remoteTotalXP = row.v?.totalXP || 0;
              const localTotalXP = local?.totalXP || 0;
              
              // Если локальный XP больше — сохраняем локальные данные
              if (localTotalXP > remoteTotalXP) {
                logCritical(`🎮 [GAME] BLOCKED: Keeping local XP (${localTotalXP}) > remote (${remoteTotalXP})`);
                return;
              }
              
              // Если remote XP больше — берём remote, но сохраняем локальные achievements
              if (remoteTotalXP > localTotalXP && local?.unlockedAchievements?.length > 0) {
                const mergedAchievements = [...new Set([
                  ...(row.v?.unlockedAchievements || []),
                  ...(local.unlockedAchievements || [])
                ])];
                row.v = {
                  ...row.v,
                  unlockedAchievements: mergedAchievements,
                  // Сохраняем максимальные stats
                  stats: {
                    ...row.v?.stats,
                    bestStreak: Math.max(row.v?.stats?.bestStreak || 0, local.stats?.bestStreak || 0),
                    perfectDays: Math.max(row.v?.stats?.perfectDays || 0, local.stats?.perfectDays || 0),
                    totalProducts: Math.max(row.v?.stats?.totalProducts || 0, local.stats?.totalProducts || 0),
                    totalWater: Math.max(row.v?.stats?.totalWater || 0, local.stats?.totalWater || 0),
                    totalTrainings: Math.max(row.v?.stats?.totalTrainings || 0, local.stats?.totalTrainings || 0)
                  }
                };
                logCritical(`🎮 [GAME] MERGED: XP ${localTotalXP} → ${remoteTotalXP}, achievements: ${mergedAchievements.length}`);
              }
            }
          }
          
          // ЗАЩИТА И MERGE: Умное объединение продуктов (не затираем локальные)
          if (key.includes('_products')) {
            // Читаем актуальное локальное значение по scoped ключу
            let currentLocal = null;
            try { 
              const rawLocal = ls.getItem(key);
              if (rawLocal) {
                const parsed = JSON.parse(rawLocal);
                // Фильтруем невалидные продукты (без name)
                currentLocal = Array.isArray(parsed) 
                  ? parsed.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0)
                  : null;
              }
            } catch(e) {}
            
            // 🛡️ КРИТИЧНО: Фильтруем невалидные продукты из облака ПЕРЕД любой обработкой
            let remoteProducts = row.v;
            if (Array.isArray(row.v)) {
              const before = row.v.length;
              remoteProducts = row.v.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
              if (remoteProducts.length !== before) {
                logCritical(`🧹 [CLOUD PRODUCTS] Pre-filtered ${before - remoteProducts.length} invalid (${before} → ${remoteProducts.length})`);
              }
            }
            
            // КРИТИЧЕСКАЯ ЗАЩИТА: НЕ ЗАТИРАЕМ непустые продукты пустым массивом
            if (Array.isArray(remoteProducts) && remoteProducts.length === 0) {
              if (Array.isArray(currentLocal) && currentLocal.length > 0) {
                log(`⚠️ [PRODUCTS] BLOCKED: Refusing to overwrite ${currentLocal.length} local products with empty cloud array`);
                // 🔄 Отправляем локальные продукты в облако чтобы заменить мусор
                logCritical(`🔄 [CLOUD RECOVERY] Pushing ${currentLocal.length} local products to replace cloud garbage`);
                const recoveryUpsertObj = {
                  user_id: user.id,
                  client_id: client_id,
                  k: row.k,
                  v: currentLocal,
                  updated_at: new Date().toISOString(),
                };
                clientUpsertQueue.push(recoveryUpsertObj);
                scheduleClientPush();
                return; // Пропускаем сохранение
              } else {
                // Оба пусты - пытаемся восстановить из backup
                const backupKey = key.replace('_products', '_products_backup');
                const backupRaw = ls.getItem(backupKey);
                if (backupRaw) {
                  try {
                    const backupData = JSON.parse(backupRaw);
                    if (Array.isArray(backupData) && backupData.length > 0) {
                      log(`✅ [RECOVERY] Restored ${backupData.length} products from backup`);
                      ls.setItem(key, JSON.stringify(backupData));
                      muteMirror = false;
                      setTimeout(() => cloud.saveClientKey(client_id, 'heys_products', backupData), 500);
                      muteMirror = true;
                      return;
                    }
                  } catch(e) {}
                }
              }
            }
            
            // 🔀 MERGE: Объединяем локальные и облачные продукты (уже отфильтрованные!)
            // Это решает проблему: новый продукт добавлен локально, но облако ещё не обновилось
            if (Array.isArray(currentLocal) && currentLocal.length > 0 && Array.isArray(remoteProducts) && remoteProducts.length > 0) {
              const merged = mergeProductsData(currentLocal, remoteProducts);
              
              // 🔧 ИСПРАВЛЕНИЕ: Подсчитываем уникальные локальные продукты для корректного сравнения
              // (т.к. mergeProductsData делает дедупликацию внутри, сравнение с raw currentLocal некорректно)
              const localUniqueCount = new Set(currentLocal.filter(p => p && p.name).map(p => String(p.name).trim().toLowerCase())).size;
              
              // 🛡️ ЗАЩИТА: Проверяем потерю УНИКАЛЬНЫХ продуктов (не дублей)
              // Если уникальных локальных больше чем merged — значит sync "опоздал" и пытается удалить новые продукты
              if (localUniqueCount > merged.length) {
                logCritical(`⚠️ [PRODUCTS SYNC] BLOCKED: localUnique (${localUniqueCount}) > merged (${merged.length}). Keeping local.`);
                // Отправляем локальные в облако чтобы синхронизировать (после дедупликации)
                // Используем merged как источник — он содержит все уникальные продукты
                const localDeduped = [];
                const seenNames = new Set();
                for (const p of currentLocal) {
                  if (!p || !p.name) continue;
                  const key = String(p.name).trim().toLowerCase();
                  if (!seenNames.has(key)) {
                    seenNames.add(key);
                    localDeduped.push(p);
                  }
                }
                const localUpsertObj = {
                  user_id: user.id,
                  client_id: client_id,
                  k: row.k,
                  v: localDeduped, // Отправляем дедуплицированные!
                  updated_at: (new Date()).toISOString(),
                };
                clientUpsertQueue.push(localUpsertObj);
                scheduleClientPush();
                // Сохраняем дедуплицированные локально
                ls.setItem(key, JSON.stringify(localDeduped));
                return;
              }
              
              // Если дедупликация убрала дубли — это OK, сохраняем merged
              if (currentLocal.length > merged.length && localUniqueCount === merged.length) {
                log(`🧹 [PRODUCTS] Deduplication cleaned ${currentLocal.length - merged.length} duplicates`);
              }
              
              // Если merge добавил новые продукты — сохраняем и синхронизируем обратно в облако
              if (merged.length > remoteProducts.length) {
                logCritical(`📦 [PRODUCTS MERGE] ${currentLocal.length} local + ${remoteProducts.length} remote → ${merged.length} merged`);
                ls.setItem(key, JSON.stringify(merged));
                
                // Уведомляем приложение об обновлении
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('heysProductsUpdated', { detail: { products: merged } }));
                  }, 100);
                }
                
                // Отправляем merged версию обратно в облако
                const mergedUpsertObj = {
                  user_id: user.id,
                  client_id: client_id,
                  k: row.k, // Оригинальный ключ из БД
                  v: merged,
                  updated_at: (new Date()).toISOString(),
                };
                clientUpsertQueue.push(mergedUpsertObj);
                scheduleClientPush();
                return; // Уже обработали products
              }
              
              // Если merged.length === remoteProducts.length (нет изменений) — сохраняем merged
              // Это безопасно т.к. merged уже включает все локальные продукты
              if (merged.length === remoteProducts.length && merged.length === currentLocal.length) {
                ls.setItem(key, JSON.stringify(merged));
                return; // Данные одинаковые, нет смысла обновлять облако
              }
              
              // Fallback: сохраняем merged и синхронизируем
              ls.setItem(key, JSON.stringify(merged));
              return;
            }
          }
          
          // 🔄 Миграция: конвертируем устаревшие поля тренировок (quality/feelAfter → mood/wellbeing/stress)
          if (key.includes('dayv2_') && row.v?.trainings?.length) {
            let migrated = false;
            row.v.trainings = row.v.trainings.map(t => {
              // Если есть старые поля — мигрируем их значения в новые
              if (t.quality !== undefined || t.feelAfter !== undefined) {
                migrated = true;
                const { quality, feelAfter, ...rest } = t;
                return {
                  ...rest,
                  // Конвертируем: quality → mood, feelAfter → wellbeing
                  // Если новые поля уже есть — приоритет им
                  mood: rest.mood ?? quality ?? 5,
                  wellbeing: rest.wellbeing ?? feelAfter ?? 5,
                  stress: rest.stress ?? 5  // дефолт для stress (нейтральное значение)
                };
              }
              return t;
            });
            if (migrated) {
              log(`  🔄 Migrated training fields for ${key}`);
            }
          }
          
          // 🔄 Миграция: добавляем inline данные к старым MealItems (если нет kcal100)
          // Это гарантирует что калории считаются даже если продукт удалён из базы
          if (key.includes('dayv2_') && row.v?.meals?.length) {
            // Получаем продукты для поиска
            let productsForMigration = null;
            try {
              // Пытаемся получить из HEYS.store (актуальные данные)
              if (global.HEYS?.store?.get) {
                productsForMigration = global.HEYS.store.get('heys_products', []);
              }
              // Fallback: читаем из localStorage по scoped key
              if (!productsForMigration || productsForMigration.length === 0) {
                const scopedProductsKey = key.replace(/dayv2_.*/, 'products');
                const rawProducts = ls.getItem(scopedProductsKey);
                if (rawProducts) productsForMigration = JSON.parse(rawProducts);
              }
            } catch(e) { productsForMigration = []; }
            
            if (Array.isArray(productsForMigration) && productsForMigration.length > 0) {
              // Создаём индексы продуктов по ID и по названию
              const productsById = new Map();
              const productsByName = new Map();
              productsForMigration.forEach(p => {
                if (p && p.id) productsById.set(String(p.id), p);
                if (p && p.name) {
                  const name = String(p.name).trim();
                  if (name) productsByName.set(name, p);
                }
              });
              
              let itemsMigrated = 0;
              row.v.meals = row.v.meals.map(meal => {
                if (!meal || !Array.isArray(meal.items)) return meal;
                
                const migratedItems = meal.items.map(item => {
                  // Если уже есть inline kcal100 — пропускаем
                  if (item.kcal100 !== undefined) return item;
                  
                  // Ищем продукт сначала по названию, потом по product_id
                  const itemName = String(item.name || '').trim();
                  let product = itemName ? productsByName.get(itemName) : null;
                  if (!product) {
                    const productId = String(item.product_id || item.id || '');
                    product = productId ? productsById.get(productId) : null;
                  }
                  
                  if (product && product.kcal100 !== undefined) {
                    itemsMigrated++;
                    return {
                      ...item,
                      kcal100: product.kcal100,
                      protein100: product.protein100,
                      fat100: product.fat100,
                      simple100: product.simple100,
                      complex100: product.complex100,
                      badFat100: product.badFat100,
                      goodFat100: product.goodFat100,
                      trans100: product.trans100,
                      fiber100: product.fiber100,
                      gi: product.gi ?? product.gi100,
                      harm: product.harm ?? product.harm100
                    };
                  }
                  return item;
                });
                
                return { ...meal, items: migratedItems };
              });
              
              if (itemsMigrated > 0) {
                logCritical(`  🔄 [MIGRATION] Added inline data to ${itemsMigrated} items in ${key}`);
                
                // 🔄 Сохраняем мигрированные данные обратно в облако
                const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
                if (dateMatch) {
                  const dayKey = `heys_dayv2_${dateMatch[1]}`;
                  row.v.updatedAt = Date.now();
                  const migrationUpsertObj = {
                    client_id: client_id,
                    k: dayKey,
                    v: row.v,
                    updated_at: new Date().toISOString()
                  };
                  clientUpsertQueue.push(migrationUpsertObj);
                  scheduleClientPush();
                }
              }
            }
          }
          
          // Для products используем отфильтрованные данные (уже обработаны выше)
          // Если дошли сюда — значит merge не произошёл (local пуст)
          // Используем remoteProducts которые уже отфильтрованы
          let valueToSave = row.v;
          if (key.includes('_products')) {
            // remoteProducts уже отфильтрован выше — используем его
            // Если он пустой и мы дошли сюда — значит recovery уже запущен выше
            // Но на всякий случай проверим ещё раз
            if (typeof remoteProducts !== 'undefined') {
              valueToSave = remoteProducts;
              if (valueToSave.length === 0) {
                // Не сохраняем пустой массив — recovery уже запущен
                log(`⚠️ [PRODUCTS] Skipping save of 0 products (recovery should handle this)`);
                return;
              }
            }
          }
          
          ls.setItem(key, JSON.stringify(valueToSave));
          log(`  ✅ Saved to localStorage: ${key}`);
          
          // Уведомляем приложение об обновлении продуктов
          if (key.includes('_products') && valueToSave) {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('heysProductsUpdated', { detail: { products: valueToSave } }));
              }, 100);
            }
          }
          
          // Уведомляем UI об обновлении данных дня (когда облачные данные новее)
          if (key.includes('dayv2_') && row.v) {
            const dateMatch = key.match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
            if (dateMatch) {
              window.dispatchEvent(new CustomEvent('heys:day-updated', { detail: { date: dateMatch[1], source: 'cloud' } }));
              logCritical(`📅 [EVENT] heys:day-updated dispatched for ${dateMatch[1]} (cloud sync)`);
            }
            
            // 🔍 Диагностика: логируем загрузку данных дня с шагами
            const steps = row.v.steps || 0;
            if (steps > 0) {
              logCritical(`📅 [DAY SYNC] Loaded day ${key} with steps: ${steps}`);
            }
          }
        } catch(e){}
      });
      
      muteMirror = false;
      cloud._lastClientSync = { clientId: client_id, ts: now };
      
      // 🧹 Очистка дублирующихся ключей после синхронизации
      cleanupDuplicateKeys();
      
      // 🚨 Критический лог: первая синхронизация завершена
      if (!initialSyncCompleted) {
        logCritical('✅ Синхронизация завершена | клиент:', client_id.substring(0,8) + '...', '| ключей:', data?.length || 0);
      }
      
      // 🚨 Разрешаем сохранение после первого sync
      initialSyncCompleted = true;
      cancelFailsafeTimer(); // Отменяем failsafe — sync успешен
      
      // 🧹 Однократная очистка облака от невалидных продуктов (после первой синхронизации)
      if (!cloud._cloudCleanupDone) {
        cloud._cloudCleanupDone = true;
        setTimeout(() => {
          cloud.cleanupCloudProducts().then(result => {
            if (result.cleaned > 0) {
              logCritical(`☁️ [AUTO CLOUD CLEANUP] Cleaned ${result.cleaned} invalid products from cloud`);
            }
          }).catch(e => {
            console.error('[AUTO CLOUD CLEANUP] Error:', e);
          });
        }, 2000); // Задержка 2 сек чтобы не блокировать UI
      }

      // Уведомляем приложение о завершении синхронизации (для обновления stepsGoal и т.д.)
      // Задержка 300мс чтобы localStorage успел обновиться и React перечитал данные
      // ВСЕГДА отправляем событие — дедупликация на стороне получателя (проверка clientId)
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        logCritical('📢 Dispatching heysSyncCompleted | clientId:', client_id);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('heysSyncCompleted', { detail: { clientId: client_id } }));
        }, 300);
      }
    }catch(e){ 
      // Критический лог ошибки синхронизации (всегда видим)
      logCritical('❌ Ошибка синхронизации:', e.message || e);
      err('❌ [CLIENT_SYNC] Exception:', e); 
      muteMirror=false;
      // Пробрасываем ошибку чтобы внешний .catch() мог её обработать
      throw e;
    } finally {
      // Сбрасываем флаг sync in progress
      _syncInProgress = null;
    }
    })(); // end of IIFE
    
    return _syncInProgress;
  };

  cloud.getCurrentClientId = function() {
    try {
      const raw = global.localStorage.getItem('heys_client_current');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      // уже строка без JSON
      return global.localStorage.getItem('heys_client_current');
    }
  };

  cloud.isAuthenticated = function() {
    return status === CONNECTION_STATUS.ONLINE && !!user;
  };

  cloud.fetchDays = async function(dates) {
    if (!client || !user) return [];
    if (!Array.isArray(dates) || dates.length === 0) return [];
    const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    if (!clientId) return [];

    const dayKeys = dates.map((d) => `dayv2_${d}`);
    try {
      const { data, error } = await withTimeout(
        client.from('client_kv_store').select('k,v,updated_at').eq('client_id', clientId).in('k', dayKeys),
        15000,
        'fetchDays',
      );
      if (error) {
        err('fetchDays select', error);
        return [];
      }

      const ls = global.localStorage;
      muteMirror = true;
      (data || []).forEach((row) => {
        try {
          const originalKey = row.k || '';
          const isDayKey = originalKey.includes('dayv2_');
          let targetKey = originalKey;
          if (!targetKey.startsWith('heys_')) {
            targetKey = `heys_${clientId}_${targetKey}`;
          }

          let localVal = null;
          try {
            localVal = JSON.parse(ls.getItem(targetKey));
          } catch (e2) {}

          // Не затираем непустые дни пустыми ответами
          if (isDayKey) {
            const remoteHasMeals = Array.isArray(row.v?.meals) && row.v.meals.length > 0;
            const localHasMeals = Array.isArray(localVal?.meals) && localVal.meals.length > 0;
            if (!remoteHasMeals && localHasMeals) {
              return;
            }
            const remoteUpdated = new Date(row.updated_at || 0).getTime();
            const localUpdated = localVal?.updatedAt || 0;
            if (localUpdated > remoteUpdated) {
              return;
            }
          }

          ls.setItem(targetKey, JSON.stringify(row.v));
        } catch (e3) {
          // игнорируем отдельные ошибки записи
        }
      });
      muteMirror = false;
      return data || [];
    } catch (e) {
      muteMirror = false;
      err('fetchDays exception', e);
      return [];
    }
  };

  cloud.shouldSyncClient = function(client_id, maxAgeMs){
    if (!client_id) return false;
    const rec = cloud._lastClientSync;
    if (!rec || rec.clientId !== client_id) return true;
    return (Date.now() - rec.ts) > (maxAgeMs||4000);
  };

  // Дебаунсинг для клиентских данных
  let clientUpsertQueue = loadPendingQueue(PENDING_CLIENT_QUEUE_KEY);
  let clientUpsertTimer = null;
  
  function scheduleClientPush(){
    if (clientUpsertTimer) return;
    
    // Сохраняем очередь в localStorage для персистентности
    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
    notifyPendingChange();
    
    const delay = navigator.onLine ? 500 : getRetryDelay();
    
    clientUpsertTimer = setTimeout(async () => {
      const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
      clientUpsertTimer = null;
      if (!client || !user || !batch.length) {
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        return;
      }
      // Не пытаемся отправить если нет сети — данные уже в localStorage
      if (!navigator.onLine) {
        // Вернуть в очередь для повторной отправки когда сеть появится
        clientUpsertQueue.push(...batch);
        incrementRetry();
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        // Запланировать повторную попытку с exponential backoff
        scheduleClientPush();
        return;
      }
      
      // Удаляем дубликаты по комбинации client_id+k, оставляя последние значения
      const uniqueBatch = [];
      const seenKeys = new Set();
      for (let i = batch.length - 1; i >= 0; i--) {
        const item = batch[i];
        const key = `${item.client_id}:${item.k}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueBatch.unshift(item);
        }
      }
      
      try{
        const promises = uniqueBatch.map(item => {
          // Добавляем user_id если его нет (таблица требует NOT NULL)
          const itemWithUser = item.user_id ? item : { ...item, user_id: user.id };
          // DEBUG: логируем первый item для диагностики
          // if (uniqueBatch.indexOf(item) === 0) {
          //   console.log('[DEBUG] client_kv_store upsert payload:', JSON.stringify(itemWithUser, null, 2).substring(0, 500));
          // }
          // Primary key = (user_id, client_id, k), используем его для onConflict
          return cloud.upsert('client_kv_store', itemWithUser, 'user_id,client_id,k')
            .catch(err => {
              console.error('[DEBUG] Upsert error:', err?.message || err, 'for key:', itemWithUser?.k);
            });
        });
        await Promise.allSettled(promises);
        
        // Успех — сбрасываем retry счётчик
        resetRetry();
        
        // Критический лог: данные отправлены в облако
        if (uniqueBatch.length > 0) {
          const types = {};
          uniqueBatch.forEach(item => {
            const t = item.k.includes('dayv2_') ? 'day' : 
                     item.k.includes('products') ? 'products' : 
                     item.k.includes('profile') ? 'profile' : 'other';
            types[t] = (types[t] || 0) + 1;
          });
          const summary = Object.entries(types).map(([k,v]) => `${k}:${v}`).join(' ');
          logCritical('☁️ Сохранено в облако:', summary);
          
          // Уведомляем о завершении UPLOAD (НЕ heysSyncCompleted — то для initial download!)
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('heys:data-uploaded', { detail: { saved: uniqueBatch.length } }));
          }
        }
        
        // Обновляем персистентную очередь
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
      }catch(e){
        // При ошибке — вернуть в очередь и увеличить retry
        clientUpsertQueue.push(...uniqueBatch);
        incrementRetry();
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        logCritical('❌ Ошибка сохранения в облако:', e.message || e);
        
        // Авторизационные ошибки — требуем вход
        if (isAuthError(e)) {
          handleAuthFailure(e);
          return;
        }
        
        // Уведомляем об ошибке с временем до retry (exponential backoff)
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          const retryIn = Math.min(5, Math.ceil(getRetryDelay() / 1000)); // секунд до retry
          notifySyncError(e, retryIn);
        }
        
        // Запланировать повторную попытку
        scheduleClientPush();
      }
      
      // Прогресс и завершение
      syncProgressDone += uniqueBatch.length;
      if (syncProgressTotal < syncProgressDone) {
        syncProgressTotal = syncProgressDone;
      }
      notifySyncProgress(syncProgressTotal, syncProgressDone);
      notifySyncCompletedIfDrained();
    }, delay);
  }

  // Функция для проверки статуса синхронизации
  cloud.getSyncStatus = function(key) {
    if (clientUpsertQueue.some(item => item.k === key)) {
      return 'pending'; // В очереди на отправку
    }
    return 'synced'; // Синхронизировано
  };

  // Функция для ожидания завершения синхронизации
  cloud.waitForSync = function(key, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkSync = () => {
        if (cloud.getSyncStatus(key) === 'synced' || (Date.now() - startTime) > timeout) {
          resolve(cloud.getSyncStatus(key));
        } else {
          setTimeout(checkSync, 100);
        }
      };
      checkSync();
    });
  };
  // Поддерживает старую сигнатуру saveClientKey(k, v) — в этом случае client_id берётся из HEYS.currentClientId.
      cloud.saveClientKey = function(...args) {
        let client_id, k, value;

        // 🔄 ИЗМЕНЕНО: Вместо полной блокировки — добавляем в очередь
        // Данные будут отправлены когда sync завершится или по таймауту
        const waitingForSync = !initialSyncCompleted;

        if (args.length === 3) {
            client_id = args[0];
            k = args[1];
            value = args[2];
        } else if (args.length === 2) {
            k = args[0];
            value = args[1];
            
            // Если ключ содержит client_id в формате heys_clientId_dayv2_... - извлекаем его
            if (k && k.startsWith('heys_') && k.includes('_dayv2_')) {
                const parts = k.split('_');
                if (parts.length >= 3) {
                    const extractedId = parts[1]; // берем client_id из ключа
                    // Проверяем что это UUID, а не просто "dayv2"
                    if (extractedId && extractedId !== 'dayv2' && extractedId.length > 8) {
                        client_id = extractedId;
                    }
                }
            }
            
            // Для обычных ключей (heys_profile, heys_products и т.д.) используем текущего клиента
            if (!client_id && window.HEYS && window.HEYS.currentClientId) {
                client_id = window.HEYS.currentClientId;
            }
            
            // Если все еще нет client_id, но есть user - создаем дефолтный client_id для этого пользователя
            if (!client_id && user && user.id) {
                // Создаем предсказуемый но валидный UUID на основе user.id
                // Берем первые 8 символов user.id и добавляем фиксированный суффикс для получения валидного UUID
                const userIdShort = user.id.replace(/-/g, '').substring(0, 8);
                client_id = `00000000-0000-4000-8000-${userIdShort}0000`.substring(0, 36);
            }
        } else {
            return;
        }

        if (!client_id) {
            return;
        }

        // НЕ сохраняем в Supabase, если используется дефолтный client_id (пользователь еще не выбрал клиента)
        if (client_id && client_id.startsWith('00000000-')) {
            if (window.DEV) {
                log(`⚠️ [SAVE BLOCKED] Skipping save for key '${k}' - default client_id (user hasn't selected client yet)`);
            }
            return; // Тихий пропуск сохранения до выбора реального клиента
        }

        if (!user || !user.id) {
            return;
        }

        // Для дней проверяем что это объект, для остальных ключей пропускаем любые типы
        if (k && k.includes('dayv2_') && !k.includes('backup') && !k.includes('date')) {
            if (typeof value !== 'object' || value === null) {
                return;
            }
            // 🚨 ЗАЩИТА ОТ HMR: НЕ сохраняем день без updatedAt (признак что это HMR-сброс, а не реальное изменение)
            // Если есть updatedAt — это реальное изменение пользователем, разрешаем сохранение (даже пустого дня)
            if (!value.updatedAt && !value.schemaVersion) {
                log(`🚫 [SAVE BLOCKED] Refused to save day without updatedAt (HMR protection) - key: ${k}`);
                return;
            }
            
            // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем ПУСТОЙ день в облако до завершения sync
            // Это предотвращает перезапись реальных данных пустым днём при открытии нового устройства
            if (waitingForSync) {
                const hasRealData = value.weightMorning || 
                                    value.steps > 0 || 
                                    value.waterMl > 0 ||
                                    (value.meals && value.meals.length > 0 && value.meals.some(m => m.items?.length > 0)) ||
                                    value.sleepStart || 
                                    value.sleepEnd ||
                                    value.dayScore;
                if (!hasRealData) {
                    logCritical(`🚫 [SAVE BLOCKED] Empty day before sync - key: ${k}`);
                    return;
                }
            } else {
                // Диагностика: почему waitingForSync = false?
                const hasRealData = value.weightMorning || value.steps > 0 || value.waterMl > 0;
                if (!hasRealData) {
                    log(`⚠️ [SAVE ALLOWED] Empty day saved (sync completed) - key: ${k}`);
                }
            }
        }

        const upsertObj = {
            user_id: user.id,
            client_id: client_id,
            k: k,
            v: value,
            updated_at: (new Date()).toISOString(),
        };

        // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем пустые массивы продуктов в Supabase
        if (k === 'heys_products' && Array.isArray(value) && value.length === 0) {
            log(`🚫 [SAVE BLOCKED] Refused to save empty products array to Supabase (key: ${k})`);
            return; // Блокируем затирание реальных данных пустым массивом
        }
        
        // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: Фильтруем невалидные продукты перед сохранением
        if (k === 'heys_products' && Array.isArray(value)) {
            const validProducts = value.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
            if (validProducts.length !== value.length) {
                logCritical(`🧹 [SAVE FILTER] Filtered ${value.length - validProducts.length} invalid products before save (${value.length} → ${validProducts.length})`);
                value = validProducts;
                upsertObj.v = validProducts;
            }
            // Если после фильтрации массив пуст — не сохраняем
            if (validProducts.length === 0) {
                log(`🚫 [SAVE BLOCKED] All products invalid, refusing to save empty array`);
                return;
            }
        }

        // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем "пустой" профиль (без ключевых полей)
        // Это защита от HMR-перезагрузок, когда компонент ремонтируется с дефолтными значениями
        if (k.includes('profile') && !k.includes('backup')) {
            const isValidProfile = value && typeof value === 'object' && 
                                   (value.age || value.weight || value.height || value.firstName);
            if (!isValidProfile) {
                log(`🚫 [SAVE BLOCKED] Refused to save empty/invalid profile to Supabase (key: ${k})`);
                return;
            }
        }

        // Логирование сохранения
        const dataType = k === 'heys_products' ? '📦 PRODUCTS' :
                        k.includes('dayv2_') ? '📅 DAY' :
                        k.includes('_profile') ? '👤 PROFILE' : '📝 OTHER';
        const itemsCount = Array.isArray(value) ? value.length : 'N/A';
        
        // 🔍 Диагностика: логируем сохранение данных дня с шагами
        if (k.includes('dayv2_') && value && value.steps > 0) {
            logCritical(`📅 [DAY SAVE] Saving day ${k} with steps: ${value.steps} | updatedAt: ${value.updatedAt}`);
            // DEBUG: Stack trace для отладки источника save
            console.trace('[DAY SAVE] Call stack:');
        }
        
        // Логируем если добавляем в очередь до завершения sync
        if (waitingForSync) {
            log(`⏳ [QUEUED] Waiting for sync, queuing: ${k}`);
        }
        
        log(`💾 [SAVE] ${dataType} | key: ${k} | items: ${itemsCount} | client: ${client_id.substring(0, 8)}...`);

        // Добавляем в очередь вместо немедленной отправки
        clientUpsertQueue.push(upsertObj);
        scheduleClientPush();
    };

    // Функция только проверяет существование клиента (больше НЕ создаём автоматически)
    cloud.ensureClient = async function(clientId) {
        if (!client || !user || !clientId) return false;
        try {
            const { data, error } = await client
              .from('clients')
              .select('id')
              .eq('id', clientId)
              .eq('curator_id', user.id)
              .limit(1);
            if (error) return false;
            return (data && data.length > 0);
        } catch(e){
          return false;
        }
    };

    // Функция для отправки данных в client_kv_store
    cloud.upsert = async function(tableName, obj, conflictKey) {
        if (!client || !user) {
            throw new Error('Client or user not available');
        }
        
        try {
            // Если это client_kv_store, проверяем что клиент существует; иначе пропускаем
            if (tableName === 'client_kv_store' && obj.client_id) {
                const _exists = await cloud.ensureClient(obj.client_id);
                if (!_exists){
                  // Убрано избыточное логирование skip upsert (client not found)
                  return { skipped: true, reason: 'client_not_found' };
                }
            }
            
            const { error } = await client
                .from(tableName)
                .upsert(obj, { onConflict: conflictKey || 'user_id,client_id,k' });
            
            if (error) {
                throw error;
            } else {
                return { success: true };
            }
        } catch (e) {
            throw e;
        }
    };

  // очередь upsert'ов
  let upsertQueue = loadPendingQueue(PENDING_QUEUE_KEY);
  let upsertTimer = null;
  function schedulePush(){
    if (upsertTimer) return;
    
    // Сохраняем очередь в localStorage для персистентности
    savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
    notifyPendingChange();
    
    const delay = navigator.onLine ? 300 : getRetryDelay();
    
    upsertTimer = setTimeout(async () => {
      const batch = upsertQueue.splice(0, upsertQueue.length);
      upsertTimer = null;
      if (!client || !user || !batch.length) {
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
        return;
      }
      // Не пытаемся отправить если нет сети — данные уже в localStorage
      if (!navigator.onLine) {
        // Вернуть в очередь для повторной отправки когда сеть появится
        upsertQueue.push(...batch);
        incrementRetry();
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
        // Запланировать повторную попытку с exponential backoff
        schedulePush();
        return;
      }
      
      // Удаляем дубликаты по комбинации user_id+k, оставляя последние значения
      const uniqueBatch = [];
      const seenKeys = new Set();
      for (let i = batch.length - 1; i >= 0; i--) {
        const item = batch[i];
        const key = `${item.user_id}:${item.k}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueBatch.unshift(item);
        }
      }
      
      try{
        const { error } = await client.from('kv_store').upsert(uniqueBatch, { onConflict: 'user_id,k' });
        if (error) { 
          // При ошибке — вернуть в очередь
          upsertQueue.push(...uniqueBatch);
          incrementRetry();
          savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
          notifyPendingChange();
          if (isAuthError(error)) {
            handleAuthFailure(error);
            return;
          }
          notifySyncError(error, Math.min(5, Math.ceil(getRetryDelay() / 1000)));
          err('bulk upsert', error); 
          schedulePush();
          return; 
        }
        // Успех — сбрасываем retry счётчик
        resetRetry();
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
      }catch(e){ 
        // При исключении — вернуть в очередь
        upsertQueue.push(...uniqueBatch);
        incrementRetry();
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
        if (isAuthError(e)) {
          handleAuthFailure(e);
          return;
        }
        notifySyncError(e, Math.min(5, Math.ceil(getRetryDelay() / 1000)));
        err('bulk upsert exception', e);
        schedulePush();
      }
      
      // Прогресс и завершение
      syncProgressDone += uniqueBatch.length;
      if (syncProgressTotal < syncProgressDone) {
        syncProgressTotal = syncProgressDone;
      }
      notifySyncProgress(syncProgressTotal, syncProgressDone);
      notifySyncCompletedIfDrained();
    }, delay);
  }

  cloud.saveKey = function(k, v){
    if (!user || !k) return;
    const upsertObj = {
      user_id: user.id,
      k: k,
      v: v,
      updated_at: (new Date()).toISOString(),
    };
    upsertQueue.push(upsertObj);
    schedulePush();
  };

  cloud.deleteKey = function(k){
    // можно делать через .delete(), или ставить пометку
  };

  cloud.clearAll = function(){
    clearNamespace();
  };

  // утилиты для компонентов
  cloud.lsGet = typeof global.HEYS !== 'undefined' && global.HEYS.lsGet
    ? global.HEYS.lsGet
    : function(k, def){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } };

  cloud.lsSet = typeof global.HEYS !== 'undefined' && global.HEYS.lsSet
    ? global.HEYS.lsSet
    : function(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };

  // Экспорт для совместимости с тестами
  HEYS.SupabaseConnection = {
    connect: cloud.signIn,
    disconnect: cloud.signOut,
    isConnected: function() { return status === 'online'; },
    getStatus: function() { return status; },
    getUser: function() { return user; },
    sync: cloud.pushAll,
    client: function() { return client; }
  };

  // Когда сеть возвращается — сбрасываем retry и пробуем отправить накопленные данные
  global.addEventListener('online', function() {
    addSyncLogEntry('online', { pending: cloud.getPendingCount() });
    resetRetry(); // Сбрасываем exponential backoff
    
    const pendingBefore = cloud.getPendingCount();
    
    if (clientUpsertQueue.length > 0) {
      scheduleClientPush();
    }
    if (upsertQueue.length > 0) {
      schedulePush();
    }
    notifyPendingChange();
    
    // Уведомляем UI что сеть вернулась и синхронизация начнётся
    if (pendingBefore > 0) {
      global.dispatchEvent(new CustomEvent('heys:network-restored', { 
        detail: { pendingCount: pendingBefore } 
      }));
    }
  });
  
  // Когда сеть пропадает — логируем
  global.addEventListener('offline', function() {
    addSyncLogEntry('offline', { pending: cloud.getPendingCount() });
  });

  /** Принудительный retry синхронизации */
  cloud.retrySync = function() {
    if (!navigator.onLine) return false;
    
    resetRetry(); // Сбрасываем exponential backoff
    
    // Запускаем синхронизацию обеих очередей
    if (clientUpsertQueue.length > 0) {
      if (clientUpsertTimer) clearTimeout(clientUpsertTimer);
      clientUpsertTimer = null;
      scheduleClientPush();
    }
    if (upsertQueue.length > 0) {
      if (upsertTimer) clearTimeout(upsertTimer);
      upsertTimer = null;
      schedulePush();
    }
    
    return true;
  };
  
  // Алиасы для внешних вызовов
  cloud.sync = cloud.retrySync;
  cloud.pushAll = cloud.retrySync;

  /** Очистить дублирующиеся ключи (двойной clientId, старые форматы) */
  function cleanupDuplicateKeys() {
    const keysToRemove = [];
    const currentClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (!key) continue;
      
      // 1. Удаляем ключи с двойным clientId (bug): clientId_clientId_...
      if (key.match(/[a-f0-9-]{36}_[a-f0-9-]{36}_/)) {
        keysToRemove.push(key);
        continue;
      }
      
      // 2. Удаляем старый формат _heys_products (должен быть _products)
      if (key.includes('_heys_products')) {
        keysToRemove.push(key);
        continue;
      }
      
      // 3. Удаляем products_backup если есть products
      if (key.includes('_products_backup') && currentClientId && key.includes(currentClientId)) {
        const normalKey = key.replace('_products_backup', '_products');
        if (global.localStorage.getItem(normalKey)) {
          keysToRemove.push(key);
        }
      }
    }
    
    if (keysToRemove.length > 0) {
      keysToRemove.forEach(k => global.localStorage.removeItem(k));
      log(`🧹 Очищено ${keysToRemove.length} дублирующихся ключей`);
    }
    
    return keysToRemove.length;
  }
  
  /** Диагностика localStorage — показывает топ-10 ключей по размеру */
  cloud.diagnoseStorage = function() {
    const items = [];
    let total = 0;
    
    for (let key in global.localStorage) {
      if (global.localStorage.hasOwnProperty(key)) {
        const value = global.localStorage.getItem(key) || '';
        const sizeKB = (value.length * 2) / 1024;
        total += sizeKB;
        items.push({ key, sizeKB: sizeKB.toFixed(2), chars: value.length });
      }
    }
    
    items.sort((a, b) => parseFloat(b.sizeKB) - parseFloat(a.sizeKB));
    
    console.log('📊 localStorage диагностика:');
    console.log(`Общий размер: ${(total / 1024).toFixed(2)} MB`);
    console.log('Топ-10 по размеру:');
    console.table(items.slice(0, 10));
    
    return { totalMB: (total / 1024).toFixed(2), items: items.slice(0, 20) };
  };
  
  /** Очистить все данные текущего клиента (кроме профиля и auth) */
  cloud.clearClientData = function(keepDays = 30) {
    const clientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    const prefix = clientId ? clientId + '_' : '';
    let cleaned = 0;
    
    const keysToRemove = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && key.startsWith('heys_') && key.includes(prefix) && key.includes('dayv2_')) {
        const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
        if (match) {
          const date = new Date(match[1]);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - keepDays);
          if (date < cutoff) {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    keysToRemove.forEach(k => {
      global.localStorage.removeItem(k);
      cleaned++;
    });
    
    console.log(`🧹 Очищено ${cleaned} записей старше ${keepDays} дней`);
    cloud.diagnoseStorage();
    return cleaned;
  };
  
  /** Очистить дублирующиеся ключи вручную */
  cloud.cleanupDuplicates = function() {
    return cleanupDuplicateKeys();
  };
  
  /** Удалить продукты других клиентов (освобождает много места) */
  cloud.cleanupOtherClientsProducts = function() {
    const currentClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    if (!currentClientId) {
      console.log('❌ Нет текущего клиента');
      return 0;
    }
    
    const keysToRemove = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && key.includes('_products') && !key.includes(currentClientId)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(k => global.localStorage.removeItem(k));
    console.log(`🧹 Удалено ${keysToRemove.length} ключей продуктов других клиентов`);
    cloud.diagnoseStorage();
    return keysToRemove.length;
  };
  
  /**
   * Безопасное переключение клиента:
   * 1. Синхронизирует данные старого клиента в облако
   * 2. Ждёт завершения
   * 3. Очищает данные старого клиента из localStorage
   * 4. Загружает данные нового клиента
   */
  cloud.switchClient = async function(newClientId) {
    if (!newClientId) {
      console.log('❌ Не указан ID нового клиента');
      return false;
    }
    
    const oldClientId = cloud.getCurrentClientId ? cloud.getCurrentClientId() : null;
    
    // Если тот же клиент — ничего не делаем
    if (oldClientId === newClientId) {
      log('Клиент уже выбран:', newClientId);
      return true;
    }
    
    log('🔄 Переключение клиента:', oldClientId?.substring(0,8), '→', newClientId.substring(0,8));
    
    // 1. Сначала синхронизируем текущие данные в облако (если есть pending)
    if (oldClientId && cloud.getPendingCount() > 0) {
      log('⏳ Ожидаем синхронизацию старого клиента...');
      
      // Принудительно отправляем pending данные
      try {
        // Ждём завершения текущих операций (макс 5 секунд)
        await new Promise((resolve) => {
          let attempts = 0;
          const check = () => {
            if (cloud.getPendingCount() === 0 || attempts >= 10) {
              resolve();
            } else {
              attempts++;
              setTimeout(check, 500);
            }
          };
          // Триггерим retry если есть pending
          if (cloud.retrySync) cloud.retrySync();
          check();
        });
        log('✅ Синхронизация старого клиента завершена');
      } catch (e) {
        logCritical('⚠️ Не удалось дождаться синхронизации, но продолжаем переключение');
      }
    }
    
    // 2. Очищаем данные старого клиента из localStorage (кроме auth)
    if (oldClientId) {
      const keysToRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.includes(oldClientId) && !key.includes('_auth')) {
          // Не удаляем глобальные ключи
          if (!key.includes('heys_client_current') && !key.includes('heys_user')) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach(k => global.localStorage.removeItem(k));
      log(`🧹 Очищено ${keysToRemove.length} ключей старого клиента`);
    }
    
    // 3. Также удаляем дубликаты и данные других клиентов
    cleanupDuplicateKeys();
    
    // 4. Удаляем продукты ВСЕХ других клиентов (не только старого)
    const otherProductKeys = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && key.includes('_products') && !key.includes(newClientId)) {
        otherProductKeys.push(key);
      }
    }
    otherProductKeys.forEach(k => global.localStorage.removeItem(k));
    if (otherProductKeys.length > 0) {
      log(`🧹 Удалено ${otherProductKeys.length} ключей продуктов других клиентов`);
    }
    
    // 5. Сохраняем новый clientId
    global.localStorage.setItem('heys_client_current', JSON.stringify(newClientId));
    
    // 6. Синхронизируем данные нового клиента из облака
    log('📥 Загружаем данные нового клиента...');
    try {
      await cloud.bootstrapClientSync(newClientId);
      log('✅ Переключение завершено успешно');
      
      // Показываем итоговый размер storage
      const sizeMB = getStorageSize();
      log(`📊 Размер localStorage: ${sizeMB.toFixed(2)} MB`);
      
      // Событие heysSyncCompleted уже отправлено внутри bootstrapClientSync
      
      return true;
    } catch (e) {
      logCritical('❌ Ошибка загрузки данных нового клиента:', e);
      return false;
    }
  };

  // Убрано избыточное логирование utils lsSet wrapped

  // ═══════════════════════════════════════════════════════════════════
  // 📷 PHOTO STORAGE — загрузка фото в Supabase Storage
  // ═══════════════════════════════════════════════════════════════════
  
  const PHOTO_BUCKET = 'meal-photos';
  const PENDING_PHOTOS_KEY = 'heys_pending_photos';
  
  /**
   * Загрузить фото в Supabase Storage
   * @param {string} base64Data - base64 изображение (data:image/jpeg;base64,...)
   * @param {string} clientId - ID клиента
   * @param {string} date - дата в формате YYYY-MM-DD
   * @param {string} mealId - ID приёма пищи
   * @returns {Promise<{url: string, path: string} | null>}
   */
  cloud.uploadPhoto = async function(base64Data, clientId, date, mealId) {
    if (!client) {
      log('📷 uploadPhoto: нет клиента, сохраняем в pending');
      return savePendingPhoto(base64Data, clientId, date, mealId);
    }
    
    if (!navigator.onLine) {
      log('📷 uploadPhoto: offline, сохраняем в pending');
      return savePendingPhoto(base64Data, clientId, date, mealId);
    }
    
    try {
      // Конвертируем base64 в blob
      const response = await fetch(base64Data);
      const blob = await response.blob();
      
      // Генерируем уникальный путь: clientId/YYYY-MM/date_mealId_timestamp.jpg
      const yearMonth = date.slice(0, 7); // YYYY-MM
      const timestamp = Date.now();
      const filename = `${date}_${mealId}_${timestamp}.jpg`;
      const path = `${clientId}/${yearMonth}/${filename}`;
      
      // Загружаем в Supabase Storage
      const { data, error } = await client.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });
      
      if (error) {
        logCritical('📷 uploadPhoto error:', error.message);
        // Сохраняем в pending для повторной попытки
        return savePendingPhoto(base64Data, clientId, date, mealId);
      }
      
      // Получаем публичный URL
      const { data: urlData } = client.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(path);
      
      log('📷 Photo uploaded:', path);
      
      return {
        url: urlData?.publicUrl || null,
        path: path,
        uploaded: true
      };
    } catch (e) {
      logCritical('📷 uploadPhoto exception:', e?.message || e);
      return savePendingPhoto(base64Data, clientId, date, mealId);
    }
  };
  
  /**
   * Сохранить фото в pending (для offline режима)
   */
  function savePendingPhoto(base64Data, clientId, date, mealId) {
    try {
      const pending = JSON.parse(global.localStorage.getItem(PENDING_PHOTOS_KEY) || '[]');
      const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      
      pending.push({
        id: photoId,
        data: base64Data,
        clientId,
        date,
        mealId,
        createdAt: Date.now()
      });
      
      global.localStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify(pending));
      log('📷 Photo saved to pending:', photoId);
      
      return {
        id: photoId,
        data: base64Data,  // Для отображения пока offline
        pending: true,
        uploaded: false
      };
    } catch (e) {
      logCritical('📷 savePendingPhoto error:', e?.message || e);
      // Fallback: возвращаем base64 напрямую
      return {
        data: base64Data,
        pending: true,
        uploaded: false
      };
    }
  }
  
  /**
   * Загрузить все pending фото при появлении сети
   */
  cloud.uploadPendingPhotos = async function() {
    if (!client || !navigator.onLine) return;
    
    try {
      const pending = JSON.parse(global.localStorage.getItem(PENDING_PHOTOS_KEY) || '[]');
      if (pending.length === 0) return;
      
      log('📷 Uploading', pending.length, 'pending photos...');
      
      const stillPending = [];
      
      for (const photo of pending) {
        try {
          const result = await cloud.uploadPhoto(
            photo.data, 
            photo.clientId, 
            photo.date, 
            photo.mealId
          );
          
          if (result?.uploaded) {
            // Успешно загружено — обновить URL в данных дня
            await updatePhotoUrlInDay(photo.clientId, photo.date, photo.id, result.url);
            log('📷 Pending photo uploaded:', photo.id);
          } else {
            stillPending.push(photo);
          }
        } catch (e) {
          stillPending.push(photo);
        }
      }
      
      global.localStorage.setItem(PENDING_PHOTOS_KEY, JSON.stringify(stillPending));
      
      if (stillPending.length < pending.length) {
        log('📷 Uploaded', pending.length - stillPending.length, 'photos,', stillPending.length, 'still pending');
      }
    } catch (e) {
      logCritical('📷 uploadPendingPhotos error:', e?.message || e);
    }
  };
  
  /**
   * Обновить URL фото в данных дня после загрузки
   */
  async function updatePhotoUrlInDay(clientId, date, photoId, newUrl) {
    const utils = global.HEYS?.utils;
    if (!utils?.lsGet || !utils?.lsSet) return;
    
    const dayKey = 'heys_dayv2_' + date;
    const day = utils.lsGet(dayKey, null);
    if (!day?.meals) return;
    
    let updated = false;
    day.meals = day.meals.map(meal => {
      if (!meal.photos) return meal;
      meal.photos = meal.photos.map(photo => {
        if (photo.id === photoId || photo.pending) {
          updated = true;
          return {
            ...photo,
            url: newUrl,
            data: undefined, // Удаляем base64 после загрузки
            pending: false,
            uploaded: true
          };
        }
        return photo;
      });
      return meal;
    });
    
    if (updated) {
      utils.lsSet(dayKey, day);
      log('📷 Updated photo URL in day:', date, photoId);
    }
  }
  
  /**
   * Удалить фото из Supabase Storage
   * @param {string} path - путь к файлу (clientId/YYYY-MM/filename.jpg)
   * @returns {Promise<boolean>}
   */
  cloud.deletePhoto = async function(path) {
    if (!client) {
      log('📷 deletePhoto: нет клиента');
      return false;
    }
    
    if (!path) {
      log('📷 deletePhoto: нет пути');
      return false;
    }
    
    try {
      const { error } = await client.storage
        .from(PHOTO_BUCKET)
        .remove([path]);
      
      if (error) {
        logCritical('📷 deletePhoto error:', error.message);
        return false;
      }
      
      log('📷 Photo deleted from storage:', path);
      return true;
    } catch (e) {
      logCritical('📷 deletePhoto exception:', e?.message || e);
      return false;
    }
  };

  // Слушаем online событие для загрузки pending фото
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', () => {
      log('🌐 Online detected, uploading pending photos...');
      setTimeout(() => cloud.uploadPendingPhotos(), 2000);
    });
  }

})(window);
