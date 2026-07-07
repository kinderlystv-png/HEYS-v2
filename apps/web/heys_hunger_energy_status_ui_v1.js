// heys_hunger_energy_status_ui_v1.js - Hunger & Energy Status FAB modal.
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  const h = React && React.createElement;
  const STORAGE_KEY = 'heys_hunger_energy_status_events_v1';
  const FEATURE_SETTINGS_KEY = 'heys_hunger_energy_status_feature_settings_v1';
  const AUTO_OPEN_PROFILE_FIELD = 'hungerEnergyStatusAutoOpen';
  const EVENT_SCHEMA_VERSION = 1;
  const MAX_EVENTS = 120;
  const TREND_WINDOW_MIN = 360;
  const HUNGER_TIMELINE_DAY_START_HOUR = 6;
  const HUNGER_TIMELINE_SNAP_MIN = 30;
  const HUNGER_TIMELINE_SNAP_MS = HUNGER_TIMELINE_SNAP_MIN * 60 * 1000;
  const HUNGER_TIMELINE_LONG_PRESS_MS = 520;
  const MEAL_EFFECT_FOLLOWUP_KEY = 'heys_hunger_meal_effect_followups_v1';
  const MEAL_EFFECT_DELAY_MIN = 60;
  const STRESS_CALORIE_FOLLOWUP_DELAY_MIN = 60;
  const LOW_HUNGER_MEAL_MAX_LEVEL = 2;
  const LOW_HUNGER_MEAL_WINDOW_MIN = 240;
  const LOW_HUNGER_MEAL_MIN_KCAL = 15;
  const DEFAULT_DRAFT = { hungerLevel: 5, hungerVisual: 5, hungerTrend: 'unknown' };
  const DEFAULT_FEATURE_SETTINGS = {
    microForecast: true,
    cravingGraph: true,
    mealEffectReview: true,
    smartReminders: true,
    patternInsights: true,
    lowHungerClarifications: true,
    lowHungerWeeklyDigest: true,
    lowHungerCompactConfirm: true,
    lowHungerExperiments: true,
    lowHungerCuratorFocus: true,
    lowHungerDailyPromptLimit: 1
  };

  let modalRoot = null;
  let modalRootInstance = null;
  let setModalState = null;
  let modalCleanup = null;
  let autoOpenTimer = null;
  let mealEffectTimer = null;
  let pageScrollLock = null;
  let modalOpenSeq = 0;
  const autoOpenShownClients = new Set();

  const STATUS_COPY = {
    fed: 'Еда ещё обрабатывается',
    postMealDecline: 'Переход между приёмами',
    stableBetweenMeals: 'Стабильный промежуток',
    deficitPressure: 'Еда сейчас может быть полезнее ожидания',
    recoveryNeed: 'Восстановлению полезна еда',
    nutritionFloorRisk: 'Питания слишком мало для задержки',
    reboundRisk: 'Риск отката/срыва выше',
    medicalCaution: 'Нужна осторожная food-first логика'
  };

  const ACTION_COPY = {
    observe: 'Понаблюдать и вернуться к сигналу позже',
    hydratePause: 'Выпить воды или несладкого чая и перепроверить',
    coffeePause: 'Кофе допустим как короткая пауза, если он привычный',
    delayWithCheck: 'Сделать короткую паузу с перепроверкой',
    planNextMeal: 'Запланировать ближайший спокойный приём пищи',
    riskBrakeMeal: 'Съесть небольшой белково-клетчаточный якорь',
    eatSnack: 'Съесть контролируемый перекус',
    eatMeal: 'Съесть нормальный приём пищи',
    proteinFiberFirst: 'Начать с белка и клетчатки',
    doNotDelay: 'Не откладывать еду сейчас',
    fastCarbSafety: 'Быстрые углеводы и перепроверка'
  };

  const HUNGER_STATUS_COPY = {
    1: 'не голоден',
    2: 'почти сыт',
    3: 'лёгкий голод',
    4: 'умеренный голод',
    5: 'заметный голод',
    6: 'явный голод',
    7: 'сильный голод',
    8: 'очень голоден',
    9: 'крайне голоден',
    10: 'невыносимо голоден'
  };

  const LOW_HUNGER_REASON_COPY = {
    habit_snack: 'Перекус или привычка',
    stress_calorie_cue: 'Стресс или нервозность',
    caffeine_additions: 'Кофе или напиток с добавками',
    alcohol_context: 'Алкоголь или социальный контекст',
    cooking_taste: 'Пробовал еду при готовке',
    one_off: 'Разовая ситуация'
  };

  const LOW_HUNGER_REASON_SHORT_COPY = {
    habit_snack: 'перекус или привычка',
    stress_calorie_cue: 'стресс или нервозность',
    caffeine_additions: 'кофе с добавками',
    alcohol_context: 'социальный контекст',
    cooking_taste: 'проба при готовке',
    one_off: 'разовая ситуация'
  };
  const LOW_HUNGER_PASSIVE_CONTEXT_EVENT_TYPE = 'low_hunger_meal_passive_context';
  const LOW_HUNGER_PROMPT_EVENT_TYPES = ['low_hunger_meal_reason', 'low_hunger_meal_deferred', 'low_hunger_meal_data_fix'];
  const LOW_HUNGER_RESOLVED_EVENT_TYPES = ['low_hunger_meal_reason', 'low_hunger_meal_deferred', 'low_hunger_meal_data_fix', LOW_HUNGER_PASSIVE_CONTEXT_EVENT_TYPE];
  const LOW_HUNGER_PASSIVE_MAX_KCAL = 35;
  const LOW_HUNGER_DAILY_PROMPT_LIMIT_OPTIONS = [0, 1, 2, 3, 5];

  const STABLE_HUNGER_LONG_MIN = 90;
  const STABLE_HUNGER_MAX_DELTA = 1;
  const STABLE_HUNGER_REASON_OPTIONS = [
    { id: 'busy_rush', label: 'На суете' },
    { id: 'recent_food', label: 'Еда держит' }
  ];

  const MEAL_EFFECT_COPY = {
    lower: 'снизился',
    same: 'без изменений',
    higher: 'вырос'
  };

  const STRESS_CALORIE_OUTCOME_COPY = {
    calmer: 'стало спокойнее',
    wanted_more: 'потянуло ещё',
    no_change: 'без изменений'
  };

  const FEATURE_SETTINGS_META = [
    {
      id: 'microForecast',
      title: 'Прогноз на 1–2 часа',
      detail: 'Показывает, куда может сдвинуться голод без новых действий.'
    },
    {
      id: 'cravingGraph',
      title: 'Голод и тяга отдельно',
      detail: 'Добавляет второй мягкий слой, если есть данные по тяге.'
    },
    {
      id: 'mealEffectReview',
      title: 'Проверка после еды',
      detail: 'Через час после еды с графика спрашивает, как изменился голод.'
    },
    {
      id: 'smartReminders',
      title: 'Умные напоминания',
      detail: 'Авто-показ включается только когда контекст похож на риск.'
    },
    {
      id: 'patternInsights',
      title: 'Паттерны простым языком',
      detail: 'Показывает короткое объяснение повторяющихся ситуаций.'
    },
    {
      id: 'lowHungerClarifications',
      title: 'Вопрос про еду без голода',
      detail: 'Если выключить, такие эпизоды сохраняются тихо как контекст.'
    },
    {
      id: 'lowHungerWeeklyDigest',
      title: 'Итог недели в ккал',
      detail: 'Показывает ккал и примерные шаги или кардио для таких сценариев.'
    },
    {
      id: 'lowHungerCompactConfirm',
      title: 'Короткое подтверждение',
      detail: 'Если причина понятна, сначала показывает Да или Другое.'
    },
    {
      id: 'lowHungerExperiments',
      title: 'Мягкие эксперименты',
      detail: 'Показывает 3-дневный эксперимент и спокойный follow-up.'
    },
    {
      id: 'lowHungerCuratorFocus',
      title: 'Фокус недели для куратора',
      detail: 'Собирает компактную Pro-карточку повторяющегося сценария.'
    }
  ];

  const DRIVER_COPY = {
    safety_symptoms: 'телесные safety-сигналы',
    glucose_context: 'глюкозный/медицинский контекст',
    medical_boundary: 'медицинская граница',
    loss_of_control_risk: 'риск потери контроля',
    low_energy_availability: 'риск низкой доступности энергии',
    recovery_need: 'нужда восстановления',
    hunger_rising: 'сигнал усилился',
    hunger_stable_or_falling: 'голод стабилен или снижается',
    low_control: 'контроль выбора низкий',
    moderate_control: 'контроль выбора средний',
    strong_craving: 'сильная тяга',
    high_stress: 'стресс высокий',
    mood_pressure: 'настроение проседает',
    poor_sleep: 'сон слабый',
    very_poor_sleep: 'сон очень слабый',
    long_gap: 'долгий промежуток без еды',
    no_intake_today: 'сегодня еда не найдена',
    skipped_meal: 'приём пищи был пропущен',
    known_rebound_pattern: 'похожий паттерн уже повторялся',
    failed_delay_history: 'паузы уже срывались',
    repeated_checkpoints: 'повторная перепроверка',
    recovery_or_protein_debt: 'восстановление или белок в долге',
    recent_meal_or_satiety_lag: 'еда была недавно',
    good_control_stable_focus: 'контроль и фокус стабильны',
    recent_balanced_meal: 'сбалансированная еда была недавно',
    planned_meal_soon: 'приём пищи скоро',
    rebound_risk: 'контекст похож на откат',
    high_risk_budget: 'риск ожидания высокий',
    medium_risk_budget: 'риск ожидания средний',
    stop_risk_budget: 'риск требует остановки задержки',
    hunger_medium_floor: 'голод заметный',
    hunger_high_floor: 'голод высокий',
    high_hunger_recent_meal_floor: 'голод высокий, но еда была недавно',
    fed_or_recent_meal: 'еда ещё может давать насыщение',
    deficit_pressure: 'дефицит давит сильнее',
    protein_debt: 'белка может не хватать',
    very_low_intake_day: 'сегодня еды очень мало',
    stress_or_mood_pressure: 'стресс или настроение давят',
    high_risk_time_pattern: 'это время часто рискованное'
  };

  const DEBUG_FACTOR_COPY = {
    hungerLevel: 'уровень голода',
    hungerRising: 'голод растёт',
    longGap: 'долгий промежуток без еды',
    noIntakeToday: 'сегодня еда не найдена',
    deficitPressure: 'дефицит/длинный промежуток'
  };

  const DELAY_ACTIONS = ['observe', 'hydratePause', 'coffeePause', 'delayWithCheck', 'planNextMeal'];
  const FOOD_ACTIONS = ['riskBrakeMeal', 'eatSnack', 'eatMeal', 'proteinFiberFirst', 'doNotDelay'];
  const BAD_OUTCOMES = ['hunger_grew', 'lost_control', 'lostControl', 'overeating', 'not_enough'];
  const GOOD_WAIT_OUTCOMES = ['hunger_passed'];
  const GOOD_FOOD_OUTCOMES = ['ate_calmly', 'hunger_lower'];

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

  function todayKey() {
    return nowIso().slice(0, 10);
  }

  function addDays(dateStr, days) {
    const d = new Date(String(dateStr || todayKey()) + 'T12:00:00');
    if (!Number.isFinite(d.getTime())) return todayKey();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function readEvents() {
    const U = HEYS.utils || {};
    try {
      const rows = U.lsGet ? U.lsGet(STORAGE_KEY, []) : JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function readJsonList(key) {
    const U = HEYS.utils || {};
    try {
      const rows = U.lsGet ? U.lsGet(key, []) : JSON.parse(global.localStorage.getItem(key) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function writeJsonList(key, rows) {
    const U = HEYS.utils || {};
    const next = safeArray(rows);
    try {
      if (U.lsSet) U.lsSet(key, next);
      else global.localStorage?.setItem?.(key, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function normalizeHungerFeatureSettings(settings) {
    const raw = { ...DEFAULT_FEATURE_SETTINGS, ...((settings && typeof settings === 'object') ? settings : {}) };
    const limit = Math.max(0, Math.min(5, Math.round(Number(raw.lowHungerDailyPromptLimit))));
    return {
      ...raw,
      lowHungerDailyPromptLimit: Number.isFinite(limit) ? limit : DEFAULT_FEATURE_SETTINGS.lowHungerDailyPromptLimit
    };
  }

  function readHungerFeatureSettings() {
    const U = HEYS.utils || {};
    try {
      const raw = U.lsGet ? U.lsGet(FEATURE_SETTINGS_KEY, null) : JSON.parse(global.localStorage.getItem(FEATURE_SETTINGS_KEY) || 'null');
      return normalizeHungerFeatureSettings(raw);
    } catch (_) {
      return normalizeHungerFeatureSettings();
    }
  }

  function writeHungerFeatureSettings(settings) {
    const U = HEYS.utils || {};
    const next = normalizeHungerFeatureSettings(settings);
    try {
      if (U.lsSet) U.lsSet(FEATURE_SETTINGS_KEY, next);
      else global.localStorage?.setItem?.(FEATURE_SETTINGS_KEY, JSON.stringify(next));
      try {
        global.dispatchEvent(new CustomEvent('heys:hunger-feature-settings-updated', { detail: next }));
      } catch (_) {}
    } catch (_) {}
    return next;
  }

  function updateHungerFeatureSetting(id, enabled) {
    return writeHungerFeatureSettings({
      ...readHungerFeatureSettings(),
      [id]: !!enabled
    });
  }

  function pushEventsUndo(label, previousRows, subtitle) {
    if (!HEYS.Undo || typeof HEYS.Undo.push !== 'function') return;
    const snapshot = safeArray(previousRows);
    HEYS.Undo.push({
      label,
      subtitle: subtitle || 'Можно вернуть запись',
      icon: '↩',
      duration: 6000,
      context: { previousRows: snapshot },
      onUndo: (ctx) => {
        writeEvents(ctx?.previousRows || []);
      }
    });
  }

  function lockPageScroll() {
    if (typeof document === 'undefined' || !document.body || pageScrollLock) return;
    const body = document.body;
    const docEl = document.documentElement;
    const scrollY = Number(global.scrollY ?? docEl.scrollTop ?? body.scrollTop ?? 0) || 0;
    pageScrollLock = {
      scrollY,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      docOverflow: docEl.style.overflow,
      docOverscroll: docEl.style.overscrollBehavior
    };
    docEl.style.overflow = 'hidden';
    docEl.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = '-' + scrollY + 'px';
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
  }

  function unlockPageScroll() {
    if (typeof document === 'undefined' || !pageScrollLock) return;
    const body = document.body;
    const docEl = document.documentElement;
    const snapshot = pageScrollLock;
    pageScrollLock = null;
    if (body) {
      body.style.position = snapshot.bodyPosition;
      body.style.top = snapshot.bodyTop;
      body.style.left = snapshot.bodyLeft;
      body.style.right = snapshot.bodyRight;
      body.style.width = snapshot.bodyWidth;
      body.style.overflow = snapshot.bodyOverflow;
      body.style.overscrollBehavior = snapshot.bodyOverscroll;
    }
    if (docEl) {
      docEl.style.overflow = snapshot.docOverflow;
      docEl.style.overscrollBehavior = snapshot.docOverscroll;
    }
    try {
      global.scrollTo?.(0, snapshot.scrollY);
    } catch (_) {}
  }

  function currentClientId() {
    return HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId || '';
  }

  function readProfile() {
    const U = HEYS.utils || {};
    try {
      return (U.lsGet && U.lsGet('heys_profile', {})) || {};
    } catch (_) {
      return {};
    }
  }

  function readAutoOpenEnabled() {
    const value = readProfile()[AUTO_OPEN_PROFILE_FIELD];
    return value === true || value === 'true' || value === '1' || value === 1;
  }

  function writeAutoOpenEnabled(enabled) {
    const U = HEYS.utils || {};
    const next = !!enabled;
    const profile = readProfile();
    const updatedProfile = {
      ...profile,
      [AUTO_OPEN_PROFILE_FIELD]: next
    };
    try {
      if (U.lsSet) U.lsSet('heys_profile', updatedProfile);
      try {
        global.dispatchEvent(new CustomEvent('heys:profile-updated', {
          detail: {
            field: AUTO_OPEN_PROFILE_FIELD,
            fields: [AUTO_OPEN_PROFILE_FIELD],
            source: 'hunger-energy-status-modal'
          }
        }));
      } catch (_) {}
    } catch (_) {}
    return next;
  }

  function hasAppShellMounted() {
    try {
      return !!global.document?.querySelector?.('.tabs, .tab-switch, .fab-group, [aria-label="Открыть оценку голода"]');
    } catch (_) {
      return false;
    }
  }

  function hasActiveMorningCheckin() {
    try {
      const status = HEYS.MorningCheckinDebug?.getStatus?.();
      return status && status.sessionDone !== true && ['open', 'in_progress', 'failed'].includes(status.state);
    } catch (_) {
      return false;
    }
  }

  function shouldShowSmartReminder() {
    const settings = readHungerFeatureSettings();
    if (!settings.smartReminders) return true;
    try {
      const day = resolveDayData({ date: todayKey() });
      const context = buildContextFromDay({ date: todayKey(), day });
      return !!(
        context.noIntakeToday ||
        context.veryLowIntakeDay ||
        context.failedDelayHistory ||
        context.repeatedHighHungerToday ||
        context.recentHighHungerCount6h > 0 ||
        (Number.isFinite(Number(context.hoursSinceMeal)) && Number(context.hoursSinceMeal) >= 5)
      );
    } catch (_) {
      return false;
    }
  }

  function scheduleAutoOpen(reason, attempt = 0) {
    if (autoOpenTimer) clearTimeout(autoOpenTimer);
    autoOpenTimer = setTimeout(() => {
      const clientId = currentClientId();
      if (!clientId || autoOpenShownClients.has(clientId)) return;
      if (!HEYS.utils?.lsGet && attempt < 24) {
        scheduleAutoOpen(reason, attempt + 1);
        return;
      }
      if (!readAutoOpenEnabled()) return;
      if (!shouldShowSmartReminder()) return;
      if (!hasAppShellMounted() && attempt < 24) {
        scheduleAutoOpen(reason, attempt + 1);
        return;
      }
      if (hasActiveMorningCheckin()) {
        if (attempt < 24) scheduleAutoOpen(reason, attempt + 1);
        return;
      }
      if (global.document?.body?.classList?.contains('hunger-energy-modal-open')) return;
      if (show({ source: 'entry-auto-open', date: todayKey(), autoOpened: true })) {
        autoOpenShownClients.add(clientId);
      }
    }, attempt ? 250 : 450);
  }

  function installAutoOpen() {
    if (HEYS.__hungerEnergyAutoOpenInstalled) return;
    HEYS.__hungerEnergyAutoOpenInstalled = true;

    const onClientReady = () => scheduleAutoOpen('client-ready');
    const onSyncCompleted = (event) => {
      if (event?.detail?.phaseA) return;
      scheduleAutoOpen('sync-completed');
    };
    const onProgress = (event) => {
      if (event?.detail?.phase === 'ready') scheduleAutoOpen('app-ready');
    };
    const onCheckinComplete = () => scheduleAutoOpen('checkin-complete');

    global.addEventListener?.('heys:client-changed', onClientReady);
    global.addEventListener?.('heysSyncCompleted', onSyncCompleted);
    global.addEventListener?.('heys:progress', onProgress);
    global.addEventListener?.('heys:checkin-complete', onCheckinComplete);
    setTimeout(() => scheduleAutoOpen('boot'), 0);
  }

  function readMealEffectFollowUps() {
    return readJsonList(MEAL_EFFECT_FOLLOWUP_KEY);
  }

  function writeMealEffectFollowUps(rows) {
    return writeJsonList(MEAL_EFFECT_FOLLOWUP_KEY, rows);
  }

  function updateMealEffectFollowUp(id, patch) {
    if (!id) return null;
    let updated = null;
    const next = readMealEffectFollowUps().map((row) => {
      if (row?.id !== id) return row;
      updated = { ...row, ...(patch || {}), updatedAt: nowIso() };
      return updated;
    });
    writeMealEffectFollowUps(next);
    return updated;
  }

  function planNextMealEffectTimer() {
    if (mealEffectTimer) clearTimeout(mealEffectTimer);
    const now = Date.now();
    const pending = readMealEffectFollowUps()
      .filter((row) => row?.status === 'pending' && Number.isFinite(Date.parse(row.dueAt || '')))
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    const next = pending[0];
    if (!next) return;
    const delay = Math.max(1000, Math.min(2147483647, Date.parse(next.dueAt) - now));
    mealEffectTimer = setTimeout(runDueMealEffectFollowUp, delay);
  }

  function runDueMealEffectFollowUp() {
    const now = Date.now();
    const due = readMealEffectFollowUps()
      .filter((row) => row?.status === 'pending' && Date.parse(row.dueAt || '') <= now)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
    if (!due) {
      planNextMealEffectTimer();
      return;
    }
    updateMealEffectFollowUp(due.id, { status: 'shown', shownAt: nowIso() });
    if (due.type === 'stress_calorie_cue') {
      show({
        source: 'hunger-stress-calorie-follow-up',
        date: localDateKeyFromTs(due.mealAt || now),
        stressCalorieFollowUp: due
      });
    } else {
      show({
        source: 'hunger-meal-effect-follow-up',
        date: localDateKeyFromTs(due.mealAt || now),
        mealEffectFollowUp: due
      });
    }
    planNextMealEffectTimer();
  }

  function scheduleMealEffectFollowUp(meal, dateKey, source) {
    if (source !== 'hunger-spark-long-press' || !meal) return null;
    if (!readHungerFeatureSettings().mealEffectReview) return null;
    const mealAt = mealTimeToDateTime(dateKey || todayKey(), mealTimeValue(meal));
    const mealTs = Date.parse(mealAt || '');
    if (!Number.isFinite(mealTs)) return null;
    const id = 'meal-effect:' + (meal.id || mealAt);
    const dueAt = formatLocalDateTime(mealTs + MEAL_EFFECT_DELAY_MIN * 60000);
    const rows = readMealEffectFollowUps().filter((row) => row?.id !== id).slice(-20);
    const row = {
      id,
      status: 'pending',
      source,
      mealId: meal.id || null,
      mealName: meal.name || null,
      mealAt,
      dueAt,
      createdAt: nowIso()
    };
    writeMealEffectFollowUps(rows.concat(row));
    planNextMealEffectTimer();
    return row;
  }

  function scheduleStressCalorieFollowUp(eventRow, review) {
    if (!eventRow?.id || !readHungerFeatureSettings().mealEffectReview) return null;
    const mealTs = Date.parse(review?.mealAt || '');
    const baseTs = Number.isFinite(mealTs) ? Math.max(Date.now(), mealTs) : Date.now();
    const dueAt = formatLocalDateTime(baseTs + STRESS_CALORIE_FOLLOWUP_DELAY_MIN * 60000);
    const id = 'stress-calorie:' + eventRow.id;
    const stressCalorieLink = buildStressCalorieLink(review);
    const rows = readMealEffectFollowUps().filter((row) => row?.id !== id).slice(-20);
    const row = {
      id,
      type: 'stress_calorie_cue',
      status: 'pending',
      source: 'hunger-low-meal-review',
      lowHungerEventId: eventRow.id,
      hungerEventId: eventRow.hungerEventId || null,
      mealAt: review?.mealAt || null,
      dueAt,
      stressCalorieLink,
      createdAt: nowIso()
    };
    writeMealEffectFollowUps(rows.concat(row));
    planNextMealEffectTimer();
    return row;
  }

  function installMealEffectFollowUps() {
    if (HEYS.__hungerMealEffectFollowUpsInstalled) return;
    HEYS.__hungerMealEffectFollowUpsInstalled = true;
    const onMealAdded = (event) => {
      const detail = event?.detail || {};
      scheduleMealEffectFollowUp(detail.meal, detail.dateKey || detail.date, detail.source);
    };
    const refresh = () => planNextMealEffectTimer();
    global.addEventListener?.('heysMealAdded', onMealAdded);
    global.addEventListener?.('heys:client-changed', refresh);
    setTimeout(refresh, 0);
  }

  function normalizeEventRow(row) {
    if (!row || typeof row !== 'object') return null;
    const recordedAt = row.recordedAt || row.createdAt || nowIso();
    const createdAt = row.createdAt || recordedAt;
    const updatedAt = row.updatedAt || row.outcomeAt || createdAt;
    return {
      ...row,
      id: row.id || (HEYS.utils?.uuid?.() || ('hes_' + Date.now().toString(36))),
      schemaVersion: EVENT_SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      cloudSyncKey: row.cloudSyncKey || STORAGE_KEY,
      syncStatus: row.syncStatus || 'queued',
      clientId: row.clientId || currentClientId(),
      createdAt,
      recordedAt,
      updatedAt
    };
  }

  function normalizeEventRows(rows) {
    const byId = new Map();
    safeArray(rows).forEach((row) => {
      const normalized = normalizeEventRow(row);
      if (!normalized) return;
      if (byId.has(normalized.id)) byId.delete(normalized.id);
      byId.set(normalized.id, normalized);
    });
    return Array.from(byId.values()).slice(-MAX_EVENTS);
  }

  function writeEvents(rows) {
    const U = HEYS.utils || {};
    const next = normalizeEventRows(rows);
    if (U.lsSet) U.lsSet(STORAGE_KEY, next);
    else if (HEYS.store?.set) HEYS.store.set(STORAGE_KEY, next);
    try {
      global.dispatchEvent(new CustomEvent('heys:hunger-energy-status-updated', { detail: next }));
    } catch (_) {}
    return next;
  }

  function addEvent(event) {
    const row = normalizeEventRow({
      createdAt: nowIso(),
      recordedAt: event?.recordedAt || nowIso(),
      eventType: event?.eventType || 'hunger_energy_status',
      ...event
    });
    writeEvents(readEvents().filter((item) => item?.id !== row.id).concat(row));
    return row;
  }

  function updateEvent(id, patchOrUpdater) {
    if (!id) return null;
    let updated = null;
    const next = readEvents().map((row) => {
      if (row?.id !== id) return row;
      const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(row) : patchOrUpdater;
      updated = normalizeEventRow({
        ...row,
        ...(patch || {}),
        id: row.id,
        updatedAt: patch?.updatedAt || nowIso(),
        syncStatus: 'queued'
      });
      return updated;
    });
    if (!updated) return null;
    writeEvents(next);
    return updated;
  }

  function minutesSince(dateTime) {
    if (!dateTime) return null;
    const t = Date.parse(dateTime);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 60000));
  }

  function mealDateTime(date, time) {
    if (!date || !time) return null;
    const parts = String(time).split(':');
    if (parts.length < 2) return null;
    return date + 'T' + String(parts[0]).padStart(2, '0') + ':' + String(parts[1]).padStart(2, '0') + ':00';
  }

  function mealTimeValue(meal) {
    if (!meal) return '';
    return meal.time || meal.timeStart || meal.startTime || meal.createdAt || meal.ts || meal.timestamp || '';
  }

  function mealTimeToDateTime(date, value) {
    if (!value) return null;
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
    const match = /^(\d{1,2}):(\d{2})/.exec(text);
    if (!match) return mealDateTime(date, text);
    const rawHour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(rawHour) || !Number.isFinite(minute)) return null;
    const dayOffset = Math.floor(rawHour / 24);
    const hour = rawHour % 24;
    return addDays(date, dayOffset) + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00';
  }

  function parseClockMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function sleepTimeToDateTime(date, value, dayOffset) {
    const minutes = parseClockMinutes(value);
    if (minutes == null) return null;
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    return addDays(date, dayOffset || 0) + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00';
  }

  function getOptionDay(opts) {
    return opts && opts.day && typeof opts.day === 'object' ? opts.day : null;
  }

  function getRuntimeDay(date) {
    const runtimeDay = HEYS.Day?.getDay?.();
    if (!runtimeDay || typeof runtimeDay !== 'object') return null;
    if (!date || !runtimeDay.date || runtimeDay.date === date) return runtimeDay;
    return null;
  }

  function getStoredDay(date) {
    if (!date) return null;
    return HEYS.dayUtils?.loadDay?.(date, true) || null;
  }

  function getRecentDayCandidates(date, primaryDay) {
    const rows = [];
    const seen = new Set();
    function push(dateKey, day) {
      if (!dateKey || !day || typeof day !== 'object') return;
      const key = dateKey + ':' + (day.updatedAt || day.date || rows.length);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ date: dateKey, day });
    }

    const today = date || primaryDay?.date || todayKey();
    push(primaryDay?.date || today, primaryDay);
    push(today, getRuntimeDay(today));
    push(today, getStoredDay(today));
    for (let offset = 1; offset <= 3; offset += 1) {
      const prevDate = addDays(today, -offset);
      push(prevDate, getStoredDay(prevDate));
    }
    return rows;
  }

  function findLastMealContext(date, primaryDay) {
    const candidates = getRecentDayCandidates(date, primaryDay);
    let best = null;
    candidates.forEach(({ date: dayDate, day }) => {
      safeArray(day.meals).forEach((meal) => {
        if (!safeArray(meal && meal.items).length) return;
        const at = mealTimeToDateTime(dayDate, mealTimeValue(meal));
        if (!best || (at && (!best.at || Date.parse(at) > Date.parse(best.at)))) {
          best = { meal, at, date: dayDate };
        }
      });
    });
    return best;
  }

  function timestampOf(value) {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? t : null;
  }

  function formatShortTime(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatLocalDateTime(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }

  function buildLogDateTime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return { raw: String(value), iso: null, local: null };
    return {
      raw: String(value),
      iso: d.toISOString(),
      local: formatLocalDateTime(d.getTime()),
      timezoneOffsetMin: -d.getTimezoneOffset()
    };
  }

  function localDateKeyFromTs(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayStartTs(date) {
    const t = Date.parse(String(date || todayKey()) + 'T00:00:00');
    return Number.isFinite(t) ? t : Date.parse(todayKey() + 'T00:00:00');
  }

  function hungerTimelineStartTs(date) {
    const t = Date.parse(String(date || todayKey()) + 'T' + String(HUNGER_TIMELINE_DAY_START_HOUR).padStart(2, '0') + ':00:00');
    return Number.isFinite(t) ? t : dayStartTs(date);
  }

  function collectMealTimeline(date, primaryDay) {
    const rows = [];
    const seen = new Set();
    getRecentDayCandidates(date, primaryDay).forEach(({ date: dayDate, day }) => {
      safeArray(day.meals).forEach((meal, index) => {
        if (!safeArray(meal && meal.items).length) return;
        const at = mealTimeToDateTime(dayDate, mealTimeValue(meal));
        const t = timestampOf(at);
        if (!Number.isFinite(t)) return;
        const key = dayDate + ':' + index + ':' + t;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          type: 'meal',
          t,
          at,
          meal,
          label: 'еда ' + formatShortTime(t)
        });
      });
    });
    return rows.sort((a, b) => a.t - b.t);
  }

  function collectHungerTimeline() {
    return readEvents().map((row) => {
      const t = timestampOf(row.recordedAt || row.createdAt);
      const hungerLevel = Number(row.hungerLevel ?? row.input?.hungerLevel);
      const cravingLevel = Number(row.cravingLevel ?? row.input?.cravingLevel);
      if (!Number.isFinite(t) || !Number.isFinite(hungerLevel)) return null;
      return {
        type: 'hunger',
        id: row.id,
        t,
        level: Math.max(1, Math.min(10, Math.round(hungerLevel))),
        cravingLevel: Number.isFinite(cravingLevel) ? Math.max(1, Math.min(10, Math.round(cravingLevel))) : null,
        recordedAt: row.recordedAt || row.createdAt,
        label: 'голод ' + Math.round(hungerLevel) + '/10 ' + formatShortTime(t)
      };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function resolveMealItemProduct(item) {
    if (!item || typeof item !== 'object') return null;
    const productId = item.product_id ?? item.productId ?? item.id;
    if (productId != null && HEYS.products?.getById) {
      const product = HEYS.products.getById(productId);
      if (product) return product;
    }
    const name = normalizeText(item.name);
    if (!name || !HEYS.products?.getAll) return null;
    return safeArray(HEYS.products.getAll()).find((product) => normalizeText(product?.name) === name) || null;
  }

  function mealItemNutrients(item) {
    const product = resolveMealItemProduct(item) || item || {};
    const grams = Math.max(0, Number(item?.grams ?? item?.weight ?? item?.amount) || 0);
    const kcalDirect = Number(item?.kcal ?? item?.calories);
    const kcal100 = Number(product.kcal100 ?? product.kcal ?? product.calories100);
    const protein100 = Number(product.protein100 ?? product.prot100);
    const simple100 = Number(product.simple100);
    const complex100 = Number(product.complex100);
    const carbs100 = Number(product.carbs100 ?? ((Number.isFinite(simple100) ? simple100 : 0) + (Number.isFinite(complex100) ? complex100 : 0)));
    const bad100 = Number(product.badFat100 ?? product.badfat100);
    const good100 = Number(product.goodFat100 ?? product.goodfat100);
    const trans100 = Number(product.trans100);
    const fat100 = Number(product.fat100 ?? ((Number.isFinite(bad100) ? bad100 : 0) + (Number.isFinite(good100) ? good100 : 0) + (Number.isFinite(trans100) ? trans100 : 0)));
    const fiber100 = Number(product.fiber100);
    const harm = HEYS.models?.normalizeHarm?.(product) ?? Number(product.harm ?? product.harmScore ?? product.harm100);
    const mult = grams > 0 ? grams / 100 : 0;
    const protein = Number.isFinite(protein100) ? protein100 * mult : 0;
    const carbs = Number.isFinite(carbs100) ? carbs100 * mult : 0;
    const fat = Number.isFinite(fat100) ? fat100 * mult : 0;
    const simple = Number.isFinite(simple100) ? simple100 * mult : 0;
    const complex = Number.isFinite(complex100) ? complex100 * mult : Math.max(0, carbs - simple);
    const fiber = Number.isFinite(fiber100) ? fiber100 * mult : 0;
    const bad = Number.isFinite(bad100) ? bad100 * mult : 0;
    const good = Number.isFinite(good100) ? good100 * mult : 0;
    const trans = Number.isFinite(trans100) ? trans100 * mult : 0;
    const macroKcal = protein * 3 + carbs * 4 + fat * 9;
    return {
      kcal: Number.isFinite(kcalDirect) && kcalDirect > 0
        ? kcalDirect
        : Number.isFinite(kcal100) && grams > 0
          ? kcal100 * mult
          : macroKcal,
      protein,
      carbs,
      fat,
      simple,
      complex,
      fiber,
      bad,
      good,
      trans,
      harm: Number.isFinite(Number(harm)) ? Number(harm) : null,
      grams
    };
  }

  function isZeroIntakeName(text) {
    const name = normalizeText(text);
    if (!name) return false;
    const zeroDrink = /(вода|water|кола|cola|pepsi|zero|зеро|лайт|light|diet|без сахара|0\s*ккал|0\s*kcal|чай|americano|американо|эспрессо|espresso|черн)/i.test(name);
    const additiveText = name.replace(/без\s+сахара/g, '').replace(/sugar\s*free/g, '');
    const additive = /(молок|сливк|сироп|сахар|мед|мёд|латте|капуч|раф|пиво|beer|вино|wine|сидр|cider|алког|рыб|орех|печень|шокол|сыр|бутер|snack|перекус)/i.test(additiveText);
    return zeroDrink && !additive;
  }

  function mealSignature(meal) {
    return safeArray(meal?.items)
      .map((item) => normalizeText(item?.name || item?.product_name || item?.productId || item?.product_id))
      .filter(Boolean)
      .join('|')
      .slice(0, 220);
  }

  function lowHungerPatternKey(category, signature, joined) {
    if (category === 'caffeine_additions' || category === 'near_zero_drink') return 'caffeine_additions:coffee_additions';
    if (category === 'alcohol') return 'alcohol:context';
    if (category === 'cooking_taste') return 'cooking_taste:preparation';
    return category + ':' + String(signature || joined || '').slice(0, 80);
  }

  function suggestedLowHungerReason(category) {
    if (category === 'caffeine_additions') return 'caffeine_additions';
    if (category === 'near_zero_drink') return 'caffeine_additions';
    if (category === 'alcohol') return 'alcohol_context';
    if (category === 'cooking_taste') return 'cooking_taste';
    if (category === 'snack' || category === 'food') return 'habit_snack';
    return 'one_off';
  }

  function analyzeMealForLowHungerReview(meal) {
    const items = safeArray(meal?.items);
    const names = items.map((item) => item?.name || item?.product_name || '').filter(Boolean);
    const nutrients = items.reduce((sum, item) => {
      const next = mealItemNutrients(item);
      sum.kcal += next.kcal || 0;
      sum.protein += next.protein || 0;
      sum.carbs += next.carbs || 0;
      sum.fat += next.fat || 0;
      sum.grams += next.grams || 0;
      return sum;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 });
    const joined = normalizeText(names.join(' '));
    const hasAlcohol = /(пиво|beer|вино|wine|сидр|cider|алког|коктейл|шампан)/i.test(joined);
    const hasCaffeineWithAdditions = /(латте|капуч|раф|кофе.*(молок|сливк|сироп|сахар)|coffee.*(milk|cream|syrup|sugar))/i.test(joined);
    const hasSmallDrinkCue = /(кофе|coffee|чай|tea|americano|американо|эспрессо|espresso)/i.test(joined);
    const hasSnackCue = /(перекус|snack|печень|конфет|шокол|орех|чипс|сыр|бутер|рыб|сухар|булоч|пирож)/i.test(joined);
    const hasCookingTasteCue = /(готовк|готовил|готовила|готовлю|приготов|проб|дегуст|ложк|кусоч|доел|доела|за ребён|за ребен|taste|tasting|cooking|sample)/i.test(joined);
    const allZeroNamed = items.length > 0 && items.every((item) => isZeroIntakeName(item?.name || item?.product_name));
    const kcal = Math.round(nutrients.kcal);
    const macroGrams = nutrients.protein + nutrients.carbs + nutrients.fat;
    const nearZeroDrink = !allZeroNamed && hasSmallDrinkCue && kcal > 0 && kcal < 50;
    const isMeaningful = !allZeroNamed && (
      kcal >= LOW_HUNGER_MEAL_MIN_KCAL ||
      macroGrams >= 2 ||
      hasAlcohol ||
      hasCaffeineWithAdditions ||
      nearZeroDrink ||
      hasCookingTasteCue ||
      hasSnackCue
    );
    const category = hasAlcohol ? 'alcohol' : nearZeroDrink ? 'near_zero_drink' : hasCaffeineWithAdditions ? 'caffeine_additions' : hasCookingTasteCue ? 'cooking_taste' : hasSnackCue ? 'snack' : isMeaningful ? 'food' : 'non_caloric';
    const suggestedReason = suggestedLowHungerReason(category);
    const signature = mealSignature(meal);
    return {
      isMeaningful,
      category,
      suggestedReason,
      kcal,
      macroGrams: Math.round(macroGrams * 10) / 10,
      names: names.slice(0, 4),
      signature,
      patternKey: lowHungerPatternKey(category, signature, joined)
    };
  }

  function mealNutrientTotals(meal) {
    return safeArray(meal?.items).reduce((sum, item) => {
      const next = mealItemNutrients(item);
      sum.kcal += next.kcal || 0;
      sum.protein += next.protein || 0;
      sum.carbs += next.carbs || 0;
      sum.fat += next.fat || 0;
      sum.simple += next.simple || 0;
      sum.complex += next.complex || 0;
      sum.fiber += next.fiber || 0;
      sum.bad += next.bad || 0;
      sum.good += next.good || 0;
      sum.trans += next.trans || 0;
      sum.grams += next.grams || 0;
      if (Number.isFinite(Number(next.harm)) && next.grams > 0) {
        sum.harmWeighted += Number(next.harm) * next.grams;
        sum.harmGrams += next.grams;
      }
      return sum;
    }, {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      simple: 0,
      complex: 0,
      fiber: 0,
      bad: 0,
      good: 0,
      trans: 0,
      grams: 0,
      harmWeighted: 0,
      harmGrams: 0
    });
  }

  function findHungerAroundMeal(mealT, hungerPoints) {
    const points = safeArray(hungerPoints)
      .filter((point) => Number.isFinite(Number(point?.t)) && Number.isFinite(Number(point?.level)))
      .sort((a, b) => a.t - b.t);
    const before = points
      .filter((point) => point.t <= mealT && mealT - point.t <= LOW_HUNGER_MEAL_WINDOW_MIN * 60 * 1000)
      .sort((a, b) => b.t - a.t)[0] || null;
    const after = points
      .filter((point) => point.t > mealT && point.t - mealT <= LOW_HUNGER_MEAL_WINDOW_MIN * 60 * 1000)
      .sort((a, b) => a.t - b.t)[0] || null;
    return { before, after };
  }

  function findLowHungerMealReasonByMeal(mealAt, meal) {
    const signature = mealSignature(meal);
    return readEvents().slice().reverse().find((row) => (
      row?.eventType === 'low_hunger_meal_reason' &&
      row.mealAt === mealAt &&
      (!signature || !row.mealSignature || row.mealSignature === signature)
    )) || null;
  }

  function mealQualityToneFromScore(score) {
    if (score >= 74) return 'good';
    if (score >= 58) return 'moderate';
    if (score >= 42) return 'mixed';
    return 'attention';
  }

  function buildMealMarkerQuality(mealMarker, hungerPoints) {
    const meal = mealMarker?.meal;
    if (!meal) return { tone: 'mixed', score: 50, label: 'еда' };
    const mealAt = mealMarker.at || formatLocalDateTime(mealMarker.t);
    const totals = mealNutrientTotals(meal);
    const analysis = analyzeMealForLowHungerReview(meal);
    const around = findHungerAroundMeal(mealMarker.t, hungerPoints);
    const beforeLevel = Number(around.before?.level);
    const afterLevel = Number(around.after?.level);
    const lowBefore = Number.isFinite(beforeLevel) && beforeLevel <= LOW_HUNGER_MEAL_MAX_LEVEL;
    const lowAfter = Number.isFinite(afterLevel) && afterLevel <= LOW_HUNGER_MEAL_MAX_LEVEL;
    const highBefore = Number.isFinite(beforeLevel) && beforeLevel >= 6;
    const reasonRow = findLowHungerMealReasonByMeal(mealAt, meal);
    const reason = reasonRow?.reason || null;
    const stressOrHabitReason = ['stress_calorie_cue', 'habit_snack', 'caffeine_additions', 'alcohol_context'].includes(reason);
    const impulsiveCategory = ['alcohol', 'caffeine_additions', 'near_zero_drink', 'snack'].includes(analysis.category);
    const names = normalizeText(safeArray(analysis.names).join(' '));
    const sweetCue = /(конфет|шокол|торт|пирож|печень|слад|candy|cake|sweet)/i.test(names);
    const avgHarm = totals.harmGrams > 0 ? totals.harmWeighted / totals.harmGrams : 0;
    const simpleRatio = totals.carbs > 0 ? totals.simple / totals.carbs : 0;
    const goodFatRatio = totals.fat > 0 ? totals.good / totals.fat : 0;
    let score = 55;
    if (highBefore) score += 18;
    else if (Number.isFinite(beforeLevel) && beforeLevel >= 4) score += 8;
    else if (lowBefore) score -= 25;
    if (Number.isFinite(afterLevel) && afterLevel >= 4) score += 4;
    if (lowBefore && lowAfter) score -= 22;
    if (stressOrHabitReason) score -= 26;
    if (impulsiveCategory || sweetCue) score -= sweetCue || analysis.category === 'alcohol' ? 16 : 10;
    if (totals.protein >= 20) score += 12;
    else if (totals.protein >= 10) score += 6;
    if (totals.fiber >= 5) score += 8;
    else if (totals.fiber >= 2) score += 4;
    if (simpleRatio > 0.55) score -= 12;
    else if (simpleRatio > 0.35) score -= 6;
    if (goodFatRatio >= 0.45 && totals.fat >= 5) score += 4;
    if (avgHarm > 6) score -= 16;
    else if (avgHarm > 4) score -= 8;
    if (totals.kcal < LOW_HUNGER_MEAL_MIN_KCAL) score = Math.min(score, 45);
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    const tone = stressOrHabitReason || (lowBefore && (lowAfter || impulsiveCategory || sweetCue))
      ? 'attention'
      : mealQualityToneFromScore(finalScore);
    const label = tone === 'good'
      ? 'хорошая еда'
      : tone === 'moderate'
        ? 'нормальная еда'
        : tone === 'mixed'
          ? 'средняя еда'
          : 'еда для разбора';
    return {
      tone,
      score: finalScore,
      label,
      beforeLevel: Number.isFinite(beforeLevel) ? beforeLevel : null,
      afterLevel: Number.isFinite(afterLevel) ? afterLevel : null,
      lowBefore,
      lowAfter,
      reason,
      category: analysis.category,
      kcal: Math.round(totals.kcal),
      protein: Math.round(totals.protein),
      fiber: Math.round(totals.fiber * 10) / 10,
      avgHarm: Math.round(avgHarm * 10) / 10
    };
  }

  function buildLowHungerPatternStats(analysis) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const reasonCounts = {};
    let sameReason = 0;
    let samePattern = 0;
    let oneOffSamePattern = 0;
    readEvents().forEach((row) => {
      if (row?.eventType !== 'low_hunger_meal_reason') return;
      const t = Date.parse(row.recordedAt || row.createdAt || '');
      if (Number.isFinite(t) && t < cutoff) return;
      const reason = row.reason || 'unknown';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      if (reason === analysis?.suggestedReason) sameReason += 1;
      if (row.patternKey && analysis?.patternKey && row.patternKey === analysis.patternKey) samePattern += 1;
      else if (row.mealSignature && analysis?.signature && row.mealSignature === analysis.signature) samePattern += 1;
      if (reason === 'one_off' && (
        (row.patternKey && analysis?.patternKey && row.patternKey === analysis.patternKey) ||
        (row.mealSignature && analysis?.signature && row.mealSignature === analysis.signature)
      )) oneOffSamePattern += 1;
    });
    const frequentReason = Object.keys(reasonCounts).sort((a, b) => reasonCounts[b] - reasonCounts[a])[0] || null;
    const repeatCount = Math.max(sameReason, samePattern);
    return {
      windowDays: 30,
      repeatCount,
      sameReason,
      samePattern,
      oneOffSamePattern,
      frequentReason,
      isRepeated: repeatCount >= 2,
      needsPatternWork: repeatCount >= 3,
      suppressQuestion: oneOffSamePattern >= 2,
      suppressReason: oneOffSamePattern >= 2 ? 'repeated_one_off' : null
    };
  }

  function lowHungerTimeBucketLabel(bucket) {
    const copy = {
      morning: 'утром',
      midday: 'днём',
      afternoon: 'после обеда',
      evening: 'вечером',
      late: 'поздно вечером',
      unknown: 'без устойчивого времени'
    };
    return copy[bucket] || copy.unknown;
  }

  function lowHungerPromptCountForDate(date) {
    const key = String(date || todayKey()).slice(0, 10);
    return readEvents().filter((row) => {
      if (!LOW_HUNGER_PROMPT_EVENT_TYPES.includes(row?.eventType)) return false;
      const rowDate = String(row.date || row.mealAt || row.recordedAt || row.createdAt || '').slice(0, 10);
      return rowDate === key;
    }).length;
  }

  function getLowHungerDailyPromptLimit(settings) {
    const source = settings && typeof settings === 'object' ? settings : readHungerFeatureSettings();
    const value = Math.round(Number(source.lowHungerDailyPromptLimit));
    return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : DEFAULT_FEATURE_SETTINGS.lowHungerDailyPromptLimit;
  }

  function lowHungerCalorieEquivalents(kcal) {
    const calories = Math.max(0, Math.round(Number(kcal) || 0));
    if (!calories) return { kcal: 0, steps: 0, cardioMin: 0, label: '0 ккал' };
    const steps = Math.round(calories / 0.04 / 100) * 100;
    const cardioMin = Math.max(1, Math.round(calories / 7));
    return {
      kcal: calories,
      steps,
      cardioMin,
      label: calories + ' ккал · примерно ' + steps + ' шагов или ' + cardioMin + ' мин умеренного кардио'
    };
  }

  function shouldUsePassiveLowHungerContext(analysis, patternStats) {
    return analysis?.category === 'near_zero_drink' &&
      Number(analysis.kcal) > 0 &&
      Number(analysis.kcal) <= LOW_HUNGER_PASSIVE_MAX_KCAL &&
      Number(analysis.macroGrams || 0) < 4 &&
      !patternStats?.isRepeated;
  }

  function getLowHungerSuggestionConfidence(review) {
    const category = review?.analysis?.category || 'unknown';
    const repeated = !!review?.patternStats?.isRepeated;
    const directCue = ['caffeine_additions', 'near_zero_drink', 'alcohol', 'snack', 'cooking_taste'].includes(category);
    const level = repeated ? 'high' : directCue ? 'medium' : 'low';
    if (level === 'high') {
      return {
        level,
        label: 'Уверены достаточно',
        detail: 'Похожие эпизоды уже были; можно выбрать другой вариант, если контекст изменился.'
      };
    }
    if (level === 'medium') {
      return {
        level,
        label: 'Похоже по составу',
        detail: 'Это предварительная подсказка, а не оценка поведения.'
      };
    }
    return {
      level,
      label: 'Не уверены',
      detail: 'Выберите вариант, который ближе к ситуации.'
    };
  }

  function getLowHungerRitualProfile(reason, review) {
    const category = review?.analysis?.category || '';
    if (reason === 'stress_calorie_cue') {
      return {
        type: 'stress_cue',
        label: 'стрессовый добор',
        detail: 'Похоже, еда или напиток появились не из голода, а как реакция на напряжение.'
      };
    }
    if (reason === 'caffeine_additions' || category === 'near_zero_drink' || category === 'caffeine_additions') {
      return {
        type: 'ritual',
        label: category === 'near_zero_drink' ? 'почти zero-напиток' : 'ритуал с напитком',
        detail: category === 'near_zero_drink'
          ? 'Это не полноценная еда, но добавки лучше учитывать отдельно от zero-напитков.'
          : 'Похоже не на голод, а на привычный напиток с добавками.'
      };
    }
    if (reason === 'alcohol_context' || category === 'alcohol') {
      return {
        type: 'ritual',
        label: 'социальный ритуал',
        detail: 'Здесь важнее контекст и повторяемость, чем сама оценка голода.'
      };
    }
    if (reason === 'habit_snack' || category === 'snack') {
      return {
        type: 'ritual',
        label: 'ритуальный перекус',
        detail: 'Похоже на привычный сценарий; его можно учитывать без давления.'
      };
    }
    if (reason === 'cooking_taste' || category === 'cooking_taste') {
      return {
        type: 'tasting',
        label: 'проба при готовке',
        detail: 'При готовке можно незаметно набрать несколько проб; лучше учитывать это отдельно от обычной еды.'
      };
    }
    return {
      type: 'food',
      label: 'приём пищи',
      detail: 'Если это была обычная еда, можно уточнить голод перед ней.'
    };
  }

  function getLowHungerSavedSummary(reason, review) {
    if (reason === 'one_off') return 'Запомнили: разовый контекст при низком голоде.';
    if (reason === 'cooking_taste') return 'Запомнили: проба еды при готовке.';
    if (reason === 'stress_calorie_cue') return 'Запомнили: стрессовый добор при низком голоде.';
    const profile = getLowHungerRitualProfile(reason, review);
    if (profile?.type === 'ritual') return 'Запомнили: ' + profile.label + ' при низком голоде.';
    return 'Запомнили: еда при низком голоде.';
  }

  function getStressCalorieChoice(review) {
    const category = review?.analysis?.category || 'unknown';
    const names = safeArray(review?.analysis?.names);
    const joined = normalizeText(names.join(' '));
    if (category === 'alcohol' || /(пиво|beer|вино|wine|сидр|cider|алког)/i.test(joined)) {
      return { type: 'alcohol', label: 'алкоголь', names };
    }
    if (category === 'caffeine_additions' || category === 'near_zero_drink' || /(кофе|латте|капуч|раф|сироп|coffee)/i.test(joined)) {
      return { type: 'caffeine_additions', label: 'кофе или напиток с добавками', names };
    }
    if (/(конфет|шокол|торт|пирож|печень|слад|candy|cake|sweet)/i.test(joined)) {
      return { type: 'sweet', label: 'сладкое', names };
    }
    if (category === 'snack') return { type: 'snack', label: 'перекус', names };
    return { type: category === 'food' ? 'food' : 'other_calorie', label: 'калорийный выбор', names };
  }

  function buildStressCalorieLink(review) {
    const choice = getStressCalorieChoice(review);
    return {
      trigger: 'stress_or_nervousness',
      choiceType: choice.type,
      choiceLabel: choice.label,
      mealNames: choice.names.slice(0, 3),
      hungerLevelBeforeMeal: review?.hungerLevel ?? null,
      mealAt: review?.mealAt || null,
      timeBucket: timeBucketFromDateTime(review?.mealAt)
    };
  }

  function buildLowHungerWeeklySummary(extraReview, extraReason, settings) {
    const featureSettings = normalizeHungerFeatureSettings(settings || readHungerFeatureSettings());
    const digestEnabled = featureSettings.lowHungerWeeklyDigest !== false;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = readEvents().filter((row) => {
      if (row?.eventType !== 'low_hunger_meal_reason' && row?.eventType !== LOW_HUNGER_PASSIVE_CONTEXT_EVENT_TYPE) return false;
      const t = Date.parse(row.recordedAt || row.createdAt || '');
      return !Number.isFinite(t) || t >= cutoff;
    });
    if (extraReview?.analysis) {
      rows.push({
        eventType: 'low_hunger_meal_reason',
        reason: extraReason || extraReview.analysis.suggestedReason || 'unknown',
        mealAt: extraReview.mealAt,
        recordedAt: nowIso(),
        mealAnalysis: extraReview.analysis,
        habitPattern: { timeBucket: timeBucketFromDateTime(extraReview.mealAt) }
      });
    }
    if (rows.length < 2) return null;
    const byReason = {};
    const byBucket = {};
    rows.forEach((row) => {
      const reason = row.reason || 'unknown';
      const bucket = row.habitPattern?.timeBucket || timeBucketFromDateTime(row.mealAt || row.recordedAt);
      byReason[reason] = (byReason[reason] || 0) + 1;
      byBucket[bucket] = (byBucket[bucket] || 0) + 1;
    });
    const topReason = Object.keys(byReason).sort((a, b) => byReason[b] - byReason[a])[0] || 'unknown';
    const topBucket = Object.keys(byBucket).sort((a, b) => byBucket[b] - byBucket[a])[0] || 'unknown';
    const extraKcal = digestEnabled
      ? rows.reduce((sum, row) => sum + Math.max(0, Math.round(Number(row.mealAnalysis?.kcal) || 0)), 0)
      : null;
    const equivalents = digestEnabled ? lowHungerCalorieEquivalents(extraKcal) : null;
    return {
      total: rows.length,
      topReason,
      topReasonLabel: LOW_HUNGER_REASON_SHORT_COPY[topReason] || 'контекстная еда',
      topBucket,
      topBucketLabel: lowHungerTimeBucketLabel(topBucket),
      extraKcal,
      equivalents,
      label: rows.length + ' раза за неделю: ' + (LOW_HUNGER_REASON_SHORT_COPY[topReason] || 'контекстная еда') + ', чаще ' + lowHungerTimeBucketLabel(topBucket),
      digestLabel: digestEnabled ? 'За неделю такие сценарии дали около ' + equivalents.label + '.' : null
    };
  }

  function buildLowHungerCuratorWeekFocus(extraReview, extraReason, settings) {
    const featureSettings = normalizeHungerFeatureSettings(settings || readHungerFeatureSettings());
    if (featureSettings.lowHungerCuratorFocus === false) return null;
    const weekly = buildLowHungerWeeklySummary(extraReview, extraReason, featureSettings);
    if (!weekly || weekly.total < 3) return null;
    const digestSuffix = weekly.digestLabel ? ' ' + weekly.digestLabel : '';
    return {
      title: weekly.topReason === 'stress_calorie_cue' ? 'Стрессовый добор недели' : 'Фокус недели',
      summary: 'Чаще еда при низком голоде: ' + weekly.topReasonLabel + ', ' + weekly.topBucketLabel + '.' + digestSuffix,
      reason: weekly.topReason,
      timeBucket: weekly.topBucket,
      count: weekly.total,
      extraKcal: weekly.extraKcal,
      equivalents: weekly.equivalents,
      suggestedReview: 'Посмотреть, что повторяется в этом окне недели'
    };
  }

  function getLowHungerUpcomingCue(reason, review) {
    if (!review?.patternStats?.isRepeated) return null;
    const bucket = timeBucketFromDateTime(review?.mealAt);
    const when = lowHungerTimeBucketLabel(bucket);
    if (reason === 'caffeine_additions') {
      return {
        title: 'Перед похожим временем',
        detail: 'Если ' + when + ' будет кофе, можно оставить его без сиропа или перенести добавки к еде.',
        timeBucket: bucket,
        mode: 'diary_inline'
      };
    }
    if (reason === 'alcohol_context') {
      return {
        title: 'Перед похожим временем',
        detail: 'Если ' + when + ' будет напиток, заранее выбрать спокойную порцию еды рядом.',
        timeBucket: bucket,
        mode: 'diary_inline'
      };
    }
    if (reason === 'habit_snack') {
      return {
        title: 'Перед похожим временем',
        detail: 'Если ' + when + ' снова появится перекус, начать с воды или короткой паузы.',
        timeBucket: bucket,
        mode: 'diary_inline'
      };
    }
    if (reason === 'stress_calorie_cue') {
      return {
        title: 'Перед похожим напряжением',
        detail: 'Если ' + when + ' снова тянет на сладкое, кофе с добавками или алкоголь без голода, сначала отметить напряжение и сделать короткую паузу.',
        timeBucket: bucket,
        mode: 'diary_inline'
      };
    }
    if (reason === 'cooking_taste') {
      return {
        title: 'Перед похожим временем',
        detail: 'Если ' + when + ' будет готовка, можно заранее оставить одну пробу вкуса.',
        timeBucket: bucket,
        mode: 'diary_inline'
      };
    }
    return null;
  }

  function buildLowHungerExperimentFollowUp(settings) {
    const featureSettings = normalizeHungerFeatureSettings(settings || readHungerFeatureSettings());
    if (featureSettings.lowHungerExperiments === false) return null;
    const dueAfterMs = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const due = readEvents()
      .filter((row) => {
        if (row?.eventType !== 'low_hunger_meal_reason' || !row.gentlePlan?.experiment || row.experimentOutcome) return false;
        const t = Date.parse(row.recordedAt || row.createdAt || '');
        return Number.isFinite(t) && now - t >= dueAfterMs;
      })
      .sort((a, b) => Date.parse(b.recordedAt || b.createdAt || '') - Date.parse(a.recordedAt || a.createdAt || ''))[0];
    if (!due) return null;
    return {
      eventId: due.id,
      title: 'Как прошёл прошлый эксперимент?',
      detail: due.gentlePlan.experiment.detail,
      reason: due.reason || null
    };
  }

  function findLowHungerMealReason(mealAt, hungerEventId, signature) {
    return readEvents().find((row) =>
      LOW_HUNGER_RESOLVED_EVENT_TYPES.includes(row?.eventType) &&
      row?.mealAt === mealAt &&
      row?.hungerEventId === hungerEventId &&
      (!signature || row?.mealSignature === signature)
    ) || null;
  }

  function buildLowHungerMealReview(date, primaryDay, options) {
    const opts = options || {};
    const featureSettings = normalizeHungerFeatureSettings(opts.settings || readHungerFeatureSettings());
    const mealContext = findLastMealContext(date, primaryDay);
    const meal = mealContext?.meal;
    const mealAt = mealContext?.at;
    const mealT = timestampOf(mealAt);
    if (!meal || !Number.isFinite(mealT)) return null;
    const analysis = analyzeMealForLowHungerReview(meal);
    if (!analysis.isMeaningful) return null;
    const patternStats = buildLowHungerPatternStats(analysis);
    if (patternStats.suppressQuestion) return null;
    const weeklySummary = buildLowHungerWeeklySummary(null, null, featureSettings);
    const experimentFollowUp = buildLowHungerExperimentFollowUp(featureSettings);
    const beforeMeal = collectHungerTimeline()
      .filter((event) => event.t <= mealT && mealT - event.t <= LOW_HUNGER_MEAL_WINDOW_MIN * 60 * 1000)
      .sort((a, b) => b.t - a.t)[0];
    if (!beforeMeal || Number(beforeMeal.level) > LOW_HUNGER_MEAL_MAX_LEVEL) return null;
    if (findLowHungerMealReason(mealAt, beforeMeal.id, analysis.signature)) return null;
    const clarificationsDisabled = featureSettings.lowHungerClarifications === false;
    const dailyPromptLimit = getLowHungerDailyPromptLimit(featureSettings);
    const dailyPromptLimitReached = lowHungerPromptCountForDate(date) >= dailyPromptLimit;
    const passiveContext = clarificationsDisabled || shouldUsePassiveLowHungerContext(analysis, patternStats) || dailyPromptLimitReached ? {
      reason: analysis.suggestedReason || 'caffeine_additions',
      thresholdKcal: shouldUsePassiveLowHungerContext(analysis, patternStats) ? LOW_HUNGER_PASSIVE_MAX_KCAL : null,
      dailyPromptLimit,
      dailyPromptLimitReached,
      clarificationsDisabled,
      detail: dailyPromptLimitReached
        ? dailyPromptLimit === 0
          ? 'Уточнения выключены в настройках, поэтому эпизод сохранён как контекст.'
          : 'Сегодня лимит уточнений уже выбран, поэтому эпизод сохранён без отдельного вопроса.'
        : clarificationsDisabled
          ? 'Уточнения выключены в настройках, поэтому эпизод сохранён как контекст.'
        : 'Мелкий напиток учтён как контекст без отдельного вопроса.'
    } : null;
    if (passiveContext && !opts.includePassive) return null;
    const backfillT = Math.max(beforeMeal.t + HUNGER_TIMELINE_SNAP_MS, mealT - HUNGER_TIMELINE_SNAP_MS);
    return {
      meal,
      mealAt,
      mealTime: formatShortTime(mealT),
      mealSignature: analysis.signature,
      analysis,
      patternStats,
      passiveContext,
      weeklySummary,
      experimentFollowUp,
      hungerEvent: beforeMeal,
      hungerLevel: beforeMeal.level,
      hungerAt: beforeMeal.recordedAt,
      hungerTime: formatShortTime(beforeMeal.t),
      suggestedBackfillAt: snapSparkTimestamp(backfillT, mealT)
    };
  }

  function recordPassiveLowHungerContext(review) {
    if (!review?.passiveContext) return null;
    if (findLowHungerMealReason(review.mealAt, review.hungerEvent?.id, review.mealSignature)) return null;
    const recordedAt = nowIso();
    const reason = review.passiveContext.reason || review.analysis?.suggestedReason || 'caffeine_additions';
    return addEvent({
      eventType: LOW_HUNGER_PASSIVE_CONTEXT_EVENT_TYPE,
      recordedAt,
      date: String(review.mealAt || recordedAt).slice(0, 10),
      source: 'hunger-low-meal-passive-context',
      hungerEventId: review.hungerEvent?.id || null,
      hungerLevelBeforeMeal: review.hungerLevel,
      hungerAt: review.hungerAt || null,
      mealAt: review.mealAt,
      mealSignature: review.mealSignature || null,
      mealAnalysis: review.analysis || null,
      patternKey: review.analysis?.patternKey || null,
      patternStats: review.patternStats || null,
      reasonCategory: review.analysis?.category || null,
      reason,
      suggestedReason: review.analysis?.suggestedReason || null,
      passiveContext: review.passiveContext,
      ritualProfile: getLowHungerRitualProfile(reason, review),
      analyticsTags: ['low_hunger_before_food', 'passive_context', 'meal_' + (review.analysis?.category || 'unknown')],
      cloudSyncKey: STORAGE_KEY,
      outcome: 'passive_context'
    });
  }

  function buildTimelineTicks(scaleStart, scaleEnd, xOf) {
    const spanHours = Math.max(1, (scaleEnd - scaleStart) / (60 * 60 * 1000));
    const intervalHours = spanHours > 12 ? 3 : 2;
    const tick = new Date(scaleStart);
    if (!Number.isFinite(tick.getTime())) return [];
    tick.setMinutes(0, 0, 0);
    const remainder = tick.getHours() % intervalHours;
    if (remainder !== 0 || tick.getTime() < scaleStart) {
      tick.setHours(tick.getHours() + ((intervalHours - remainder) || intervalHours));
    }
    const rows = [];
    while (tick.getTime() <= scaleEnd) {
      const t = tick.getTime();
      if (t >= scaleStart) rows.push({ t, x: Math.max(18, Math.min(302, xOf(t))), label: formatShortTime(t) });
      tick.setHours(tick.getHours() + intervalHours);
      if (rows.length > 12) break;
    }
    return rows;
  }

  function resolveSleepInterval(date, primaryDay) {
    const candidate = getRecentDayCandidates(date, primaryDay)
      .filter((entry) => entry.date === date)
      .map((entry) => entry.day)
      .find((day) => parseClockMinutes(day?.sleepStart) != null && parseClockMinutes(day?.sleepEnd) != null);
    if (!candidate) return null;
    const startMin = parseClockMinutes(candidate.sleepStart);
    const endMin = parseClockMinutes(candidate.sleepEnd);
    const crossesMidnight = startMin > endMin;
    const startAt = sleepTimeToDateTime(date, candidate.sleepStart, crossesMidnight ? -1 : 0);
    const endAt = sleepTimeToDateTime(date, candidate.sleepEnd, 0);
    const start = timestampOf(startAt);
    const end = timestampOf(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start, end, source: 'sleep', sleepStart: candidate.sleepStart, sleepEnd: candidate.sleepEnd };
  }

  function buildNightBands(sleepInterval, scaleStart, scaleEnd, xOf) {
    if (!sleepInterval) return [];
    const start = Math.max(sleepInterval.start, scaleStart);
    const end = Math.min(sleepInterval.end, scaleEnd);
    if (end <= start) return [];
    const x1 = Math.max(18, Math.min(302, xOf(start)));
    const x2 = Math.max(18, Math.min(302, xOf(end)));
    if (x2 - x1 < 3) return [];
    return [{ x: x1, width: x2 - x1, source: sleepInterval.source }];
  }

  function sparkTimeFromX(x, scaleStart, scaleEnd) {
    const value = Number(x);
    if (!Number.isFinite(value)) return null;
    const clampedX = Math.max(18, Math.min(302, value));
    const range = Math.max(1, Number(scaleEnd) - Number(scaleStart));
    if (!Number.isFinite(range)) return null;
    return Number(scaleStart) + ((clampedX - 18) / 284) * range;
  }

  function snapSparkTimestamp(timestamp, maxTimestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value)) return null;
    const max = Number.isFinite(Number(maxTimestamp)) ? Number(maxTimestamp) : Date.now();
    let snapped = Math.round(value / HUNGER_TIMELINE_SNAP_MS) * HUNGER_TIMELINE_SNAP_MS;
    if (snapped > max) snapped = Math.floor(max / HUNGER_TIMELINE_SNAP_MS) * HUNGER_TIMELINE_SNAP_MS;
    return snapped;
  }

  function buildSparkLinePoints(hungerPoints, meals) {
    if (hungerPoints.length < 2) return hungerPoints;
    const mealMarkers = safeArray(meals).slice().sort((a, b) => a.t - b.t);
    const rows = [hungerPoints[0]];
    for (let index = 1; index < hungerPoints.length; index += 1) {
      const prev = hungerPoints[index - 1];
      const next = hungerPoints[index];
      const meal = mealMarkers.find((item) => item.t > prev.t && item.t < next.t);
      if (meal && Math.abs(meal.x - prev.x) > 1 && Math.abs(next.x - meal.x) > 1) {
        rows.push({
          type: 'meal-hold',
          t: meal.t,
          level: prev.level,
          x: meal.x,
          y: prev.y,
          color: prev.color
        });
      }
      rows.push(next);
    }
    return rows;
  }

  function markCompactSparkPoints(points) {
    const rows = safeArray(points);
    return rows.map((point, index) => {
      const hasNearbySimilar = rows.some((other, otherIndex) => (
        otherIndex !== index &&
        Math.abs(Number(other.x) - Number(point.x)) <= 20 &&
        Math.abs(Number(other.level) - Number(point.level)) <= 1
      ));
      return hasNearbySimilar ? { ...point, isCompactClusterPoint: true } : point;
    });
  }

  function buildMicroForecastPoint(visibleHunger, preview, lastMeal, now) {
    if (!preview || !Number.isFinite(Number(preview.level))) return null;
    const actual = safeArray(visibleHunger)
      .filter((point) => Number.isFinite(Number(point.t)) && Number.isFinite(Number(point.level)))
      .sort((a, b) => a.t - b.t);
    const latest = actual[actual.length - 1];
    const previous = actual[actual.length - 2];
    let hourlyDelta = 0.25;
    if (latest && previous) {
      const hours = Math.max(0.25, (latest.t - previous.t) / 3600000);
      if (hours <= 6) hourlyDelta = (latest.level - previous.level) / hours;
    }
    const mealGapHours = lastMeal?.t ? Math.max(0, (now - lastMeal.t) / 3600000) : null;
    if (Number.isFinite(mealGapHours)) {
      if (mealGapHours <= 2) hourlyDelta = Math.min(hourlyDelta, -0.25);
      else if (mealGapHours >= 5) hourlyDelta = Math.max(hourlyDelta, 0.35);
    }
    const clampedDelta = Math.max(-0.8, Math.min(1.2, hourlyDelta));
    const level = Math.max(1, Math.min(10, Math.round((Number(preview.level) + clampedDelta * 2) * 10) / 10));
    return {
      type: 'forecast',
      t: now + 2 * 60 * 60 * 1000,
      level,
      label: 'прогноз ' + level + '/10'
    };
  }

  function clampHungerVisual(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(10, n));
  }

  function buildSparkTimeline({ date, day, draft, editTarget, backfillTarget, assessmentTime, settings }) {
    const nowRaw = Number(assessmentTime);
    const now = Number.isFinite(nowRaw) ? Math.min(nowRaw, Date.now()) : Date.now();
    const featureSettings = { ...DEFAULT_FEATURE_SETTINGS, ...((settings && typeof settings === 'object') ? settings : readHungerFeatureSettings()) };
    const timelineDate = date || todayKey();
    const meals = collectMealTimeline(date, day);
    const hunger = collectHungerTimeline();
    const todayMeals = meals.filter((item) => localDateKeyFromTs(item.t) === timelineDate && item.t <= now);
    const lastTodayMeal = todayMeals.slice().sort((a, b) => b.t - a.t)[0];
    const lastMeal = lastTodayMeal || meals
      .filter((item) => item.t <= now)
      .sort((a, b) => b.t - a.t)[0];
    const shouldShowSleepContext = !lastTodayMeal;
    const visibleMeals = lastMeal ? [lastMeal] : [];
    const hungerStart = hungerTimelineStartTs(timelineDate);
    const visibleHunger = hunger.filter((item) => localDateKeyFromTs(item.t) === timelineDate && item.t >= hungerStart && item.t <= now);
    const previewLevel = clampHungerVisual(draft?.hungerVisual ?? draft?.hungerLevel, DEFAULT_DRAFT.hungerLevel);
    const preview = { type: 'preview', t: now, level: previewLevel, label: formatShortTime(now) + ' ' + previewLevel + '/10' };
    const backfillT = Number(backfillTarget?.t);
    const backfill = Number.isFinite(backfillT)
      ? {
        type: 'backfill-preview',
        t: Math.min(backfillT, now),
        level: previewLevel,
        label: 'за ' + formatShortTime(backfillT) + ' ' + previewLevel + '/10'
      }
      : null;
    const shouldShowCurrentPreview = !editTarget?.id && !backfill;
    const hungerPoints = visibleHunger.concat(backfill ? [backfill] : shouldShowCurrentPreview ? [preview] : []).sort((a, b) => a.t - b.t);
    const forecastSeed = featureSettings.microForecast && shouldShowCurrentPreview
      ? buildMicroForecastPoint(visibleHunger, preview, lastMeal, now)
      : null;
    const cravingSeed = featureSettings.cravingGraph && shouldShowCurrentPreview && Number.isFinite(Number(draft?.cravingLevel))
      ? { type: 'craving-preview', t: now, level: Math.max(1, Math.min(10, Math.round(Number(draft.cravingLevel)))) }
      : null;
    const visibleItems = visibleMeals.concat(hungerPoints, forecastSeed ? [forecastSeed] : []);
    const firstVisible = Math.min(...visibleItems.map((item) => item.t));
    const lastVisible = Math.max(...visibleItems.map((item) => item.t));
    const span = Math.max(1, lastVisible - firstVisible);
    const sidePad = visibleItems.length > 1 ? Math.max(12 * 60 * 1000, span * 0.08) : 45 * 60 * 1000;
    const scaleStart = firstVisible - sidePad;
    const scaleEnd = lastVisible + sidePad;
    const range = Math.max(1, scaleEnd - scaleStart);
    const xOf = (t) => 18 + ((t - scaleStart) / range) * 284;
    const yOf = (level) => 10 + ((10 - level) / 9) * 48;
    const sleepInterval = shouldShowSleepContext ? resolveSleepInterval(timelineDate, day) : null;
    const coloredHungerPoints = markCompactSparkPoints(hungerPoints.map((item) => {
      const isEditing = !!editTarget?.id && item.id === editTarget.id;
      const isBackfilling = item.type === 'backfill-preview';
      const level = isEditing
        ? clampHungerVisual(editTarget.hungerLevel, item.level)
        : item.level;
      const x = Math.max(18, Math.min(302, xOf(item.t)));
      return {
        ...item,
        level,
        type: isEditing ? 'edit-preview' : item.type,
        isEditing,
        isBackfilling,
        x,
        y: yOf(level),
        color: getHungerTone(level).main
      };
    }));
    const coloredMeals = visibleMeals.map((item) => ({
      ...item,
      x: Math.max(18, Math.min(302, xOf(item.t))),
      quality: buildMealMarkerQuality(item, hungerPoints)
    }));
    const cravingPoints = featureSettings.cravingGraph
      ? visibleHunger
        .filter((item) => Number.isFinite(Number(item.cravingLevel)))
        .map((item) => ({
          type: 'craving',
          t: item.t,
          level: item.cravingLevel,
          x: Math.max(18, Math.min(302, xOf(item.t))),
          y: yOf(item.cravingLevel)
        }))
        .concat(cravingSeed ? [{
          ...cravingSeed,
          x: Math.max(18, Math.min(302, xOf(cravingSeed.t))),
          y: yOf(cravingSeed.level)
        }] : [])
        .sort((a, b) => a.t - b.t)
      : [];
    const cravingPath = cravingPoints.length > 1 ? cravingPoints.map((point, index) => {
      return (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
    }).join(' ') : '';
    const linePoints = buildSparkLinePoints(coloredHungerPoints, coloredMeals);
    const forecast = forecastSeed ? {
      ...forecastSeed,
      x1: coloredHungerPoints.at(-1)?.x || Math.max(18, Math.min(302, xOf(now))),
      y1: coloredHungerPoints.at(-1)?.y || yOf(previewLevel),
      x2: Math.max(18, Math.min(302, xOf(forecastSeed.t))),
      y2: yOf(forecastSeed.level),
      color: getHungerTone(forecastSeed.level).main
    } : null;
    const backfillMarker = backfill ? {
      x: Math.max(18, Math.min(302, xOf(backfill.t))),
      label: formatShortTime(backfill.t)
    } : null;
    const path = linePoints.length > 1 ? linePoints.map((point, index) => {
      return (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
    }).join(' ') : '';
    return {
      meals: coloredMeals,
      hungerPoints: coloredHungerPoints,
      cravingPoints,
      cravingPath,
      forecast,
      lineStops: linePoints.map((item) => ({
        offset: Math.max(0, Math.min(100, ((item.x - 18) / 284) * 100)),
        color: item.color
      })),
      ticks: buildTimelineTicks(scaleStart, scaleEnd, xOf),
      nightBands: buildNightBands(sleepInterval, scaleStart, scaleEnd, xOf),
      sleepInterval,
      scaleStart,
      scaleEnd,
      backfillMarker,
      path,
      hasHistory: visibleMeals.length > 0 || visibleHunger.length > 0
    };
  }

  function resolveDayData(opts) {
    const optionDay = getOptionDay(opts);
    const requestedDate = opts.date || optionDay?.date || todayKey();
    const candidates = [
      optionDay,
      getRuntimeDay(requestedDate),
      getStoredDay(requestedDate),
      HEYS.DayData?.getCurrentDay?.()
    ].filter(Boolean);
    const withMeals = candidates.find((candidate) =>
      safeArray(candidate.meals).some((meal) => safeArray(meal && meal.items).length > 0)
    );
    return withMeals || candidates[0] || { date: requestedDate };
  }

  function numeric(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isQaEvent(row) {
    return row?.source === 'qa' || row?.eventType === 'qa' || row?.qa === true;
  }

  function buildHistorySignals() {
    const rows = readEvents();
    const userRows = rows.filter((row) => !isQaEvent(row));
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const today = todayKey();
    const hungerRows = userRows
      .map((row) => {
        const t = Date.parse(row.recordedAt || row.createdAt || '');
        const hungerLevel = Number(row.hungerLevel ?? row.input?.hungerLevel);
        return { row, t, hungerLevel };
      })
      .filter((entry) => Number.isFinite(entry.t));
    const risky = userRows.filter((row) => {
      const t = Date.parse(row.createdAt || '');
      if (!Number.isFinite(t) || t < cutoff) return false;
      const outcome = getOutcome(row);
      return BAD_OUTCOMES.includes(outcome) ||
        row.decision?.riskLevel === 'high' ||
        row.decision?.statusLabel === 'reboundRisk';
    });
    const days = new Set(risky.map((row) => String(row.createdAt || '').slice(0, 10)).filter(Boolean));
    const latest = hungerRows.slice().sort((a, b) => b.t - a.t)[0];
    const todayRows = hungerRows.filter((entry) => String(entry.row.recordedAt || entry.row.createdAt || '').slice(0, 10) === today);
    const recent6h = hungerRows.filter((entry) => now - entry.t <= 6 * 60 * 60 * 1000);
    const recent2h = hungerRows.filter((entry) => now - entry.t <= 2 * 60 * 60 * 1000);
    const highToday = todayRows.filter((entry) => entry.hungerLevel >= 7);
    const personalHungerModel = buildPersonalHungerModel(userRows);
    return {
      knownReboundPattern: risky.length >= 6 && days.size >= 7,
      personalPatternEvents: risky.length,
      personalPatternDays: days.size,
      personalHungerModel,
      previousHungerLevel: Number.isFinite(latest?.hungerLevel) ? latest.hungerLevel : null,
      previousHungerEventAt: latest?.row?.recordedAt || latest?.row?.createdAt || null,
      minutesSinceLastHungerEvent: latest ? Math.max(0, Math.round((now - latest.t) / 60000)) : null,
      recentHungerEventCount6h: recent6h.length,
      recentHighHungerCount6h: recent6h.filter((entry) => entry.hungerLevel >= 7).length,
      repeatedHighHungerToday: highToday.length >= 2,
      checkpointAttemptCount: recent2h.length
    };
  }

  function buildContextFromDay(options) {
    const opts = options || {};
    const day = resolveDayData(opts);
    const date = opts.date || day.date || todayKey();
    const lastMealContext = findLastMealContext(date, day);
    const lastMeal = lastMealContext?.meal || null;
    const lastMealAt = lastMealContext?.at || null;
    const minSinceMeal = minutesSince(lastMealAt);
    const sleepHours = numeric(day.sleepHours || day.sleepTotalHours);
    const stressValue = numeric(day.stressAvg || day.stressMorning || day.stress);
    const moodValue = numeric(day.moodAvg || day.moodMorning || day.mood);
    const trainings = safeArray(day.trainings);
    const trainingMinutes = trainings.reduce((sum, tr) => sum + safeArray(tr && tr.z).reduce((s, m) => s + numeric(m), 0), 0);
    const eatenKcal = numeric(opts.eatenKcal || day.savedEatenKcal || day.kcal);
    const optimum = numeric(opts.optimum);
    const hour = new Date().getHours();
    const history = buildHistorySignals();
    const todayMeals = safeArray(day.meals).filter((meal) => safeArray(meal && meal.items).length > 0);
    const noIntakeToday = hour >= 14 && eatenKcal <= 0 && todayMeals.length === 0;
    const hoursSinceMeal = minSinceMeal == null ? null : minSinceMeal / 60;
    const personalModel = history.personalHungerModel || {};
    const longGapNow = Number.isFinite(hoursSinceMeal) && hoursSinceMeal >= 8;
    const failedDelayHistory = !!personalModel.delayRiskHigh || (!!personalModel.longGapDelayRiskHigh && longGapNow);
    const successfulWaitHistory = !!personalModel.waitWorks && !failedDelayHistory;
    const lowHungerMealReview = buildLowHungerMealReview(date, day);

    return {
      now: nowIso(),
      lastMealAt,
      hasMealData: !!lastMeal,
      mealTimeMissing: !!lastMeal && !lastMealAt,
      recentMeal: minSinceMeal != null && minSinceMeal <= 180,
      justAte: minSinceMeal != null && minSinceMeal <= 15,
      satietyLagLikely: minSinceMeal != null && minSinceMeal <= 20,
      hoursSinceMeal,
      todayMealCount: todayMeals.length,
      noIntakeToday,
      remainingKcal: optimum ? Math.max(0, optimum - eatenKcal) : undefined,
      veryLowIntakeDay: hour >= 17 && eatenKcal > 0 && eatenKcal < 900,
      sleepHours: sleepHours || undefined,
      sleepQuality: sleepHours && sleepHours < 5 ? 'veryPoor' : sleepHours && sleepHours < 6 ? 'poor' : undefined,
      stressLevel: stressValue >= 7 ? 'high' : undefined,
      moodDropping: moodValue > 0 && moodValue <= 3,
      trainingRecovery: trainingMinutes >= 60 ? 'hard' : undefined,
      hardTrainingRecovery: trainingMinutes >= 90,
      proteinDebt: !!opts.proteinDebt,
      insulinWaveState: opts.insulinWaveState,
      caffeineHabitual: !!opts.caffeineHabitual,
      caffeineRiskLow: !!opts.caffeineRiskLow,
      alcoholRecent: !!day.alcohol || !!opts.alcoholRecent,
      lowHungerMealReview,
      ...history,
      failedDelayHistory,
      successfulWaitHistory,
      personalLearningApplied: {
        failedDelayHistory,
        successfulWaitHistory,
        longGapNow,
        source: personalModel.learnedEnough ? personalModel.profileHint : 'learning'
      }
    };
  }

  function resolveHungerTrend(hungerLevel, context) {
    const previous = Number(context?.previousHungerLevel);
    const current = Number(hungerLevel);
    const minutesSincePrevious = Number(context?.minutesSinceLastHungerEvent);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return 'unknown';
    if (!Number.isFinite(minutesSincePrevious) || minutesSincePrevious > TREND_WINDOW_MIN) return 'unknown';
    if (current > previous) return 'rising';
    if (current < previous) return 'falling';
    return 'stable';
  }

  function buildStableHungerPrompt(input, context) {
    const previous = Number(context?.previousHungerLevel);
    const current = Number(input?.hungerLevel);
    const minutesSincePrevious = Number(context?.minutesSinceLastHungerEvent);
    if (!Number.isFinite(current)) return null;
    const nowTs = Date.parse(input?.now || context?.now || nowIso());
    const stableAnchor = Number.isFinite(nowTs) ? readEvents()
      .map((row) => ({
        row,
        t: Date.parse(row.recordedAt || row.createdAt || ''),
        hungerLevel: Number(row.hungerLevel ?? row.input?.hungerLevel)
      }))
      .filter((entry) => (
        !isQaEvent(entry.row) &&
        Number.isFinite(entry.t) &&
        entry.t <= nowTs &&
        nowTs - entry.t <= TREND_WINDOW_MIN * 60000 &&
        Number.isFinite(entry.hungerLevel) &&
        Math.abs(current - entry.hungerLevel) <= STABLE_HUNGER_MAX_DELTA
      ))
      .sort((a, b) => a.t - b.t)[0] : null;
    const anchorLevel = Number.isFinite(stableAnchor?.hungerLevel) ? stableAnchor.hungerLevel : previous;
    const anchorMinutes = Number.isFinite(stableAnchor?.t)
      ? Math.round((nowTs - stableAnchor.t) / 60000)
      : minutesSincePrevious;
    if (!Number.isFinite(anchorLevel) || !Number.isFinite(anchorMinutes)) return null;
    if (anchorMinutes < STABLE_HUNGER_LONG_MIN || anchorMinutes > TREND_WINDOW_MIN) return null;
    if (Math.abs(current - anchorLevel) > STABLE_HUNGER_MAX_DELTA) return null;
    return {
      type: 'stable_hunger_long',
      question: 'Почему голод не растёт?',
      previousLevel: anchorLevel,
      currentLevel: current,
      delta: current - anchorLevel,
      minutesSincePrevious: Math.round(anchorMinutes),
      anchorEventId: stableAnchor?.row?.id || null,
      thresholdMin: STABLE_HUNGER_LONG_MIN
    };
  }

  function compactDecision(decision) {
    return {
      statusLabel: decision.statusLabel,
      riskLevel: decision.riskBudget?.level,
      foodSupportLevel: decision.foodPriority?.level,
      suggestedAction: decision.suggestedAction,
      delayAllowed: decision.delayAllowed,
      hardOverride: decision.hardOverride || null,
      copyRisk: decision.copyRisk,
      recheckAfterMin: decision.recheckAfterMin || null,
      foodBandKcal: Array.isArray(decision.foodBandKcal) ? decision.foodBandKcal.slice() : null
    };
  }

  function getDisplayStatus(decision) {
    if (decision.suggestedAction === 'planNextMeal') return 'Сейчас можно не есть, но день требует плана';
    if (decision.suggestedAction === 'hydratePause') return 'Короткая пауза уместна';
    if (decision.suggestedAction === 'coffeePause') return 'Кофе только как короткая пауза';
    if (decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') return 'Можно перепроверить позже';
    return STATUS_COPY[decision.statusLabel] || decision.statusLabel;
  }

  function translateDriver(driver) {
    return DRIVER_COPY[driver] || String(driver || '').replace(/_/g, ' ');
  }

  function unique(values) {
    const seen = new Set();
    return safeArray(values).filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function getOutcome(row) {
    return row?.outcomePlan?.userReported || row?.outcome || null;
  }

  function getDecisionAction(row) {
    return row?.decisionSnapshot?.suggestedAction || row?.decision?.suggestedAction || row?.log?.decision?.suggestedAction || null;
  }

  function isLongGapRow(row) {
    const hours = Number(row?.context?.hoursSinceMeal);
    const band = row?.mealGapRiskCurve?.currentBand;
    return (Number.isFinite(hours) && hours >= 8) || ['extended', 'long', 'veryLong'].includes(band);
  }

  function buildPersonalHungerModel(rows) {
    const outcomeRows = safeArray(rows)
      .map((row) => ({
        row,
        t: Date.parse(row.outcomeAt || row.outcomePlan?.userReportedAt || row.recordedAt || row.createdAt || ''),
        outcome: getOutcome(row),
        action: getDecisionAction(row)
      }))
      .filter((entry) => Number.isFinite(entry.t) && entry.outcome && entry.outcome !== 'calculated');
    const hungerOutcomeRows = outcomeRows.filter((entry) => entry.action !== 'fastCarbSafety');
    const outcomeDays = new Set(hungerOutcomeRows.map((entry) => String(entry.row.recordedAt || entry.row.createdAt || '').slice(0, 10)).filter(Boolean));
    const delayRows = hungerOutcomeRows.filter((entry) => DELAY_ACTIONS.includes(entry.action));
    const foodRows = hungerOutcomeRows.filter((entry) => FOOD_ACTIONS.includes(entry.action));
    const badDelayRows = delayRows.filter((entry) => BAD_OUTCOMES.includes(entry.outcome));
    const goodDelayRows = delayRows.filter((entry) => GOOD_WAIT_OUTCOMES.includes(entry.outcome));
    const goodFoodRows = foodRows.filter((entry) => GOOD_FOOD_OUTCOMES.includes(entry.outcome));
    const badLongGapDelayRows = badDelayRows.filter((entry) => isLongGapRow(entry.row));
    const badNonLongGapDelayRows = badDelayRows.filter((entry) => !isLongGapRow(entry.row));
    const learnedEnough = hungerOutcomeRows.length >= 6 && outcomeDays.size >= 3;
    const delayRiskHigh = learnedEnough && badNonLongGapDelayRows.length >= 2 && badDelayRows.length >= goodDelayRows.length;
    const longGapDelayRiskHigh = learnedEnough && badLongGapDelayRows.length >= 2;
    const waitWorks = learnedEnough && goodDelayRows.length >= 3 && goodDelayRows.length > badDelayRows.length;
    const foodAnchorHelpful = learnedEnough && goodFoodRows.length >= 3;
    const profileHint = delayRiskHigh || longGapDelayRiskHigh
      ? 'delay_risky'
      : waitWorks
        ? 'wait_often_works'
        : foodAnchorHelpful
          ? 'food_anchor_helpful'
          : 'learning';
    return {
      sampleSize: hungerOutcomeRows.length,
      ignoredSafetyOutcomeCount: outcomeRows.length - hungerOutcomeRows.length,
      days: outcomeDays.size,
      learnedEnough,
      delayAttempts: delayRows.length,
      badDelayCount: badDelayRows.length,
      goodDelayCount: goodDelayRows.length,
      foodAttempts: foodRows.length,
      goodFoodCount: goodFoodRows.length,
      longGapBadDelayCount: badLongGapDelayRows.length,
      generalBadDelayCount: badNonLongGapDelayRows.length,
      delayRiskHigh,
      longGapDelayRiskHigh,
      waitWorks,
      foodAnchorHelpful,
      profileHint
    };
  }

  function getDisplayDrivers(decision, input, context) {
    const drivers = [];
    drivers.push('голод ' + input.hungerLevel + '/10');
    if (decision.missingInputs.includes('safetyFlags')) drivers.push('safety не уточнён');
    if (input.controlLevel == null && input.hungerLevel >= 6) drivers.push('контроль не уточнён');
    else if (input.controlLevel != null && input.controlLevel <= 4) drivers.push('контроль низкий');
    else if (input.controlLevel != null && input.controlLevel <= 6) drivers.push('контроль средний');
    if (context.veryLowIntakeDay || decision.statusLabel === 'deficitPressure') drivers.push('дефицит сегодня');
    if (context.noIntakeToday) drivers.push('еда сегодня не найдена');
    if (context.justAte || context.recentMeal || context.satietyLagLikely) drivers.push('еда была недавно');

    const raw = unique((decision.riskBudget?.driversUp || [])
      .concat(decision.foodPriority?.driversUp || [], decision.foodPriority?.driversDown || []))
      .filter((driver) => driver !== 'hunger_rising' && driver !== 'hunger_stable_or_falling');
    raw.forEach((driver) => drivers.push(translateDriver(driver)));
    return unique(drivers).slice(0, 4);
  }

  function getPreliminaryAction(decision) {
    switch (decision.suggestedAction) {
      case 'riskBrakeMeal':
      case 'proteinFiberFirst':
      case 'eatSnack':
        return 'Предварительно: небольшой белково-клетчаточный перекус.';
      case 'eatMeal':
      case 'doNotDelay':
        return 'Предварительно: еда сейчас выглядит полезнее ожидания.';
      case 'hydratePause':
      case 'coffeePause':
      case 'delayWithCheck':
      case 'observe':
      default:
        return 'Предварительно: короткая пауза с перепроверкой.';
    }
  }

  function getRequiredInputs(decision, draft) {
    const hunger = Number(draft?.hungerLevel) || 0;
    return safeArray(decision?.missingInputs).filter((key) => {
      if (key === 'safetyFlags') return hunger >= 6 && !Array.isArray(draft.safetyFlags);
      if (key === 'controlLevel') return hunger >= 6 && draft.controlLevel == null;
      if (key === 'lastMealAt') return hunger >= 5;
      return key === 'freshContextData';
    });
  }

  function MissingPrompt({ missingInputs, onPatch }) {
    const missing = safeArray(missingInputs);
    const isVisible = missing.length > 0;
    let title = 'Уточнить для безопасного решения';
    let options = [];
    if (!isVisible) {
      title = '';
      options = [];
    } else if (missing.includes('safetyFlags')) {
      title = 'Что могло усилить голод?';
      options = [
        ['Пропустил еду', { safetyFlags: [], hungerReasons: ['missed_meal'] }],
        ['Стресс', { safetyFlags: [], hungerReasons: ['stress'] }]
      ];
    } else if (missing.includes('controlLevel')) {
      title = 'Могу выбрать еду спокойно?';
      options = [
        ['Да, спокойно', { controlLevel: 8 }],
        ['Тянет сорваться', { controlLevel: 3, cravingLevel: 8 }]
      ];
    } else if (missing.includes('lastMealAt')) {
      title = 'Ел недавно или давно?';
      options = [
        ['Недавно', { contextPatch: { justAte: true, recentMeal: true, satietyLagLikely: true } }],
        ['Давно', { contextPatch: { longGap: true } }]
      ];
    }
    return h('div', {
      className: 'hes-prompt' + (isVisible ? ' is-visible' : ' is-empty'),
      'aria-hidden': isVisible ? undefined : 'true'
    },
      h('div', { className: 'hes-prompt__title' }, title),
      h('div', { className: 'hes-prompt__chips' },
        options.map(([label, patch]) => h('button', {
          key: label,
          type: 'button',
          className: 'hes-chip',
          onClick: () => onPatch(patch)
        }, label))
      )
    );
  }

  function getLowHungerMealAdvice(reason, review) {
    if (review?.analysis?.category === 'near_zero_drink') {
      return 'Это небольшая пищевая волна: не ошибка, но её стоит учитывать отдельно от zero-напитков.';
    }
    if (reason === 'caffeine_additions' || review?.analysis?.category === 'caffeine_additions') {
      return 'В следующий раз оставить кофе, но убрать сироп, сахар или молоко, если цель — не запускать пищевую волну.';
    }
    if (reason === 'alcohol_context' || review?.analysis?.category === 'alcohol') {
      return 'Отмечаем как контекстную ситуацию: дальше важна повторяемость и еда рядом с алкоголем.';
    }
    if (reason === 'habit_snack') {
      return 'В следующий раз сначала короткая пауза, вода или заранее выбранный спокойный перекус.';
    }
    if (reason === 'stress_calorie_cue') {
      return 'Отмечаем как связь напряжения с калорийной едой или напитком при низком голоде. Это отдельный паттерн, его увидит куратор.';
    }
    if (reason === 'cooking_taste') {
      return 'Отмечаем как пробу при готовке: это не обычный приём пищи, но такие пробы лучше учитывать за неделю.';
    }
    if (reason === 'one_off') {
      return 'Отмечаем как разовый контекст, без правки шкалы голода.';
    }
    return 'Сначала уточняем данные, потом оцениваем привычку.';
  }

  function getLowHungerNextStep(reason, review) {
    const repeated = review?.patternStats?.needsPatternWork;
    if (review?.analysis?.category === 'near_zero_drink') {
      return {
        title: 'Отделить от zero-напитков',
        detail: 'Если голода нет, оставить напиток без калорийных добавок или перенести добавки к приёму пищи.'
      };
    }
    if (reason === 'caffeine_additions') {
      return {
        title: repeated ? 'Поставить правило для кофе' : 'В следующий раз упростить кофе',
        detail: repeated
          ? 'На ближайшие дни выбрать базовый вариант: без сиропа, сахара и молока.'
          : 'Если голода нет, оставить кофе без добавок или перенести напиток к приёму пищи.'
      };
    }
    if (reason === 'alcohol_context') {
      return {
        title: repeated ? 'Заранее выбрать границу' : 'Отметить контекст',
        detail: repeated
          ? 'Перед похожей ситуацией выбрать порцию еды рядом с алкоголем заранее.'
          : 'Смотрим не на один эпизод, а на повторяемость и еду рядом с алкоголем.'
      };
    }
    if (reason === 'habit_snack') {
      return {
        title: repeated ? 'Разобрать повторяющийся перекус' : 'Сделать короткую паузу',
        detail: repeated
          ? 'Если повторится ещё раз, лучше заменить на плановый вариант или перенести в нормальный приём.'
          : 'В похожий момент сначала вода или 10 минут паузы, потом спокойный выбор.'
      };
    }
    if (reason === 'stress_calorie_cue') {
      return {
        title: repeated ? 'Разобрать стрессовый добор' : 'Отметить напряжение до еды',
        detail: repeated
          ? 'Если это повторится, куратору стоит смотреть не только еду, но и рабочий/ситуационный стресс перед ней.'
          : 'В похожий момент сначала назвать стресс или нервозность, затем сделать короткую паузу перед калорийным выбором.'
      };
    }
    if (reason === 'cooking_taste') {
      return {
        title: repeated ? 'Отделить пробу от еды' : 'Учитывать пробу отдельно',
        detail: repeated
          ? 'Во время готовки выбрать одну маленькую пробу и записывать её как контекст, если она повторяется.'
          : 'Если при готовке было несколько проб, лучше отметить это как отдельный контекст.'
      };
    }
    return {
      title: 'Оставить как разовый эпизод',
      detail: 'Данные сохранены; шкалу голода менять не нужно.'
    };
  }

  function timeBucketFromDateTime(value) {
    const t = Date.parse(value || '');
    if (!Number.isFinite(t)) return 'unknown';
    const hour = new Date(t).getHours();
    if (hour < 11) return 'morning';
    if (hour < 15) return 'midday';
    if (hour < 18) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'late';
  }

  function getLowHungerGentlePlan(reason, review, settings) {
    const featureSettings = normalizeHungerFeatureSettings(settings || readHungerFeatureSettings());
    const experimentsEnabled = featureSettings.lowHungerExperiments !== false;
    const repeated = !!review?.patternStats?.isRepeated;
    let replacement;
    if (reason === 'caffeine_additions') {
      replacement = {
        title: 'План замены',
        detail: review?.analysis?.category === 'near_zero_drink'
          ? 'Оставить напиток почти нулевым: без молока, сиропа и сахара, если еды по плану нет.'
          : 'В похожий момент выбрать кофе без сиропа и сахара; молоко оставить только если это запланированный приём.'
      };
    } else if (reason === 'alcohol_context') {
      replacement = {
        title: 'План замены',
        detail: 'Перед похожей ситуацией заранее выбрать одну спокойную порцию еды рядом с напитком.'
      };
    } else if (reason === 'habit_snack') {
      replacement = {
        title: 'План замены',
        detail: 'Держать один заранее выбранный перекус или перенести еду в ближайший нормальный приём.'
      };
    } else if (reason === 'stress_calorie_cue') {
      replacement = {
        title: 'План замены',
        detail: 'В похожий момент сначала назвать напряжение, сделать короткую паузу и выбрать заранее понятную альтернативу без импульсного добора.'
      };
    } else if (reason === 'cooking_taste') {
      replacement = {
        title: 'План',
        detail: 'Во время готовки оставить одну пробу вкуса и не доедать остатки автоматически.'
      };
    } else {
      replacement = {
        title: 'План',
        detail: 'Оставить как разовый контекст и не менять шкалу голода.'
      };
    }
    const experiment = reason === 'caffeine_additions'
      ? review?.analysis?.category === 'near_zero_drink'
        ? '3 дня отделять zero-напитки от кофе с добавками.'
        : '3 дня проверить базовый кофе без сиропа в это же окно.'
      : reason === 'alcohol_context'
        ? '3 дня заранее выбирать границу порции в похожих ситуациях.'
        : reason === 'habit_snack'
          ? '3 дня начинать с воды или 10 минут паузы перед таким перекусом.'
          : reason === 'stress_calorie_cue'
            ? '3 дня отмечать стресс или нервозность до сладкого, кофе с добавками или алкоголя при низком голоде.'
          : reason === 'cooking_taste'
            ? '3 дня отмечать пробы при готовке отдельно от обычной еды.'
            : '3 дня просто наблюдать, повторится ли похожий эпизод.';
    return {
      replacement,
      experiment: experimentsEnabled ? { title: 'Мягкий эксперимент', detail: experiment } : null,
      quietCue: repeated
        ? {
          title: 'Тихая подсказка',
          detail: 'Если похожий контекст снова появится в дневнике, HEYS покажет подсказку внутри этого же уточнения, без отдельного уведомления.'
        }
        : null
    };
  }

  function getLowHungerContextOptions(reason) {
    if (reason === 'alcohol_context') return [
      ['company', 'Компания'],
      ['taste', 'Вкус'],
      ['automatic', 'Автоматически'],
      ['stress', 'Стресс']
    ];
    if (reason === 'caffeine_additions') return [
      ['routine', 'Ритуал'],
      ['energy', 'Для бодрости'],
      ['taste', 'Вкус'],
      ['automatic', 'Автоматически']
    ];
    if (reason === 'habit_snack') return [
      ['stress', 'Стресс'],
      ['boredom', 'Скука'],
      ['company', 'Компания'],
      ['automatic', 'Автоматически']
    ];
    if (reason === 'stress_calorie_cue') return [
      ['work_stress', 'Работа'],
      ['nervousness', 'Нервозность'],
      ['fatigue', 'Усталость'],
      ['environment', 'Обстановка'],
      ['anxiety', 'Тревога'],
      ['automatic', 'Автоматически']
    ];
    if (reason === 'cooking_taste') return [
      ['cooking', 'Готовка'],
      ['taste_check', 'Проверка вкуса'],
      ['leftovers', 'Остатки'],
      ['automatic', 'Автоматически']
    ];
    return [
      ['schedule', 'Так вышло по режиму'],
      ['company', 'Компания'],
      ['taste', 'Вкус'],
      ['other', 'Другой контекст']
    ];
  }

  function buildLowHungerHabitPattern(reason, review) {
    const ritualProfile = getLowHungerRitualProfile(reason, review);
    const stressCalorieLink = reason === 'stress_calorie_cue' ? buildStressCalorieLink(review) : null;
    return {
      type: reason === 'stress_calorie_cue' ? 'low_hunger_stress_calorie_cue' : 'low_hunger_food',
      reason,
      category: review?.analysis?.category || null,
      mealIntent: ritualProfile?.type || 'unknown',
      ritualLabel: ritualProfile?.type === 'ritual' ? ritualProfile.label : null,
      stressCalorieLink,
      choiceType: stressCalorieLink?.choiceType || null,
      patternKey: review?.analysis?.patternKey || null,
      mealSignature: review?.mealSignature || null,
      timeBucket: timeBucketFromDateTime(review?.mealAt),
      repeatCount30d: review?.patternStats?.repeatCount || 0,
      weeklyPatternTag: 'low_hunger_food:' + reason + ':' + timeBucketFromDateTime(review?.mealAt),
      source: 'hunger-energy-status'
    };
  }

  function buildLowHungerCuratorCard(reason, review, settings) {
    const count = Math.max(review?.patternStats?.repeatCount || 0, review?.weeklySummary?.total || 0);
    const bucket = timeBucketFromDateTime(review?.mealAt);
    const ritualProfile = getLowHungerRitualProfile(reason, review);
    const curatorWeekFocus = buildLowHungerCuratorWeekFocus(review, reason, settings);
    const stressCalorieLink = reason === 'stress_calorie_cue' ? buildStressCalorieLink(review) : null;
    const summaryPrefix = stressCalorieLink
      ? 'Стресс/нервозность → ' + stressCalorieLink.choiceLabel
      : (LOW_HUNGER_REASON_COPY[reason] || 'Контекстная еда');
    return {
      title: reason === 'stress_calorie_cue' ? 'Стрессовый добор при низком голоде' : 'Еда при низком голоде',
      summary: summaryPrefix + ', ' + count + ' раз(а) за период, чаще ' + lowHungerTimeBucketLabel(bucket),
      reason,
      category: review?.analysis?.category || null,
      mealIntent: ritualProfile?.type || 'unknown',
      ritualLabel: ritualProfile?.type === 'ritual' ? ritualProfile.label : null,
      stressCalorieLink,
      choiceType: stressCalorieLink?.choiceType || null,
      count,
      timeBucket: bucket,
      mealNames: safeArray(review?.analysis?.names).slice(0, 3),
      weeklyDigest: curatorWeekFocus?.summary || null,
      weekFocus: curatorWeekFocus,
      suggestedReview: review?.patternStats?.needsPatternWork ? 'Посмотреть повторяющийся паттерн недели' : 'Держать как контекстную заметку'
    };
  }

  function getLowHungerAnalyticsTags(reason, review) {
    const category = review?.analysis?.category || 'unknown';
    const tags = ['low_hunger_before_food', 'reason_' + reason, 'meal_' + category];
    if (review?.patternStats?.isRepeated) tags.push('repeat_seen');
    if (review?.patternStats?.needsPatternWork) tags.push('pattern_work_needed');
    if (reason === review?.analysis?.suggestedReason) tags.push('auto_reason_confirmed');
    if (reason === 'stress_calorie_cue') tags.push('stress_calorie_cue');
    return tags;
  }

  function LowHungerMealPrompt({ review, settings, onReason, onEditHunger, onBackfill, onExperimentOutcome, onSkip }) {
    if (!review) return null;
    const featureSettings = normalizeHungerFeatureSettings(settings || readHungerFeatureSettings());
    const [showAllReasons, setShowAllReasons] = React.useState(false);
    const names = safeArray(review.analysis?.names).join(', ');
    const kcal = Number(review.analysis?.kcal);
    const mealDetail = (names || 'приём пищи') + (Number.isFinite(kcal) && kcal > 0 ? ' · около ' + Math.round(kcal) + ' ккал' : '');
    const suggestedReason = review.analysis?.suggestedReason || 'one_off';
    const suggestionConfidence = getLowHungerSuggestionConfidence(review);
    const ritualProfile = getLowHungerRitualProfile(suggestedReason, review);
    const useCompactConfirm = featureSettings.lowHungerCompactConfirm !== false && suggestionConfidence.level !== 'low' && !showAllReasons;
    const reasonOptions = [
      ['habit_snack', 'Перекус или привычка'],
      ['stress_calorie_cue', 'Стресс / нервозность'],
      ['caffeine_additions', review.analysis?.category === 'caffeine_additions' ? 'Кофе с добавками' : 'Напиток с калориями'],
      ['alcohol_context', review.analysis?.category === 'alcohol' ? 'Алкоголь и контекст' : 'Социальный контекст'],
      ['cooking_taste', 'Пробовал при готовке'],
      ['one_off', 'Разовая ситуация']
    ].sort(([a], [b]) => (a === suggestedReason ? -1 : b === suggestedReason ? 1 : 0));
    const repeatText = review.patternStats?.needsPatternWork
      ? 'Похоже, это уже повторяется: ' + review.patternStats.repeatCount + ' раза за 30 дней, чаще ' + lowHungerTimeBucketLabel(timeBucketFromDateTime(review.mealAt)) + '.'
      : review.patternStats?.isRepeated
        ? 'Похожий контекст уже встречался за последние 30 дней, чаще ' + lowHungerTimeBucketLabel(timeBucketFromDateTime(review.mealAt)) + '.'
        : null;
    return h('div', { className: 'hes-low-meal' },
      h('div', { className: 'hes-low-meal__title' }, 'Почему появилась еда?'),
      h('div', { className: 'hes-low-meal__text' },
        'Перед едой было ', review.hungerLevel, '/10 в ', review.hungerTime,
        ', затем записано в ', review.mealTime, ': ', mealDetail
      ),
      h('div', { className: 'hes-low-meal__why' },
        'Спросили, потому что перед едой был голод ', review.hungerLevel, '/10.'
      ),
      h('div', { className: 'hes-low-meal__suggestion' },
        h('strong', null, 'Похоже на: ', LOW_HUNGER_REASON_SHORT_COPY[suggestedReason] || 'контекстный эпизод'),
        h('span', null, suggestionConfidence.detail)
      ),
      ritualProfile && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, ritualProfile.label),
        h('span', null, ritualProfile.detail)
      ),
      review.weeklySummary && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, 'За неделю'),
        h('span', null, review.weeklySummary.label),
        review.weeklySummary.digestLabel && h('span', null, review.weeklySummary.digestLabel)
      ),
      repeatText && h('div', { className: 'hes-low-meal__repeat' }, repeatText),
      review.experimentFollowUp && h('div', { className: 'hes-low-meal__context' },
        h('span', null, review.experimentFollowUp.title),
        h('div', { className: 'hes-low-meal__text' }, review.experimentFollowUp.detail),
        h('div', { className: 'hes-low-meal__context-chips' },
          [
            ['helped', 'Помог'],
            ['not_tried', 'Не пробовал'],
            ['not_helped', 'Не помог']
          ].map(([value, label]) => h('button', {
            key: value,
            type: 'button',
            onClick: () => onExperimentOutcome?.(review.experimentFollowUp.eventId, value)
          }, label))
        )
      ),
      h('div', { className: 'hes-low-meal__actions' },
        h('button', { type: 'button', onClick: onEditHunger }, 'Прошлая оценка была ниже'),
        h('button', { type: 'button', onClick: onBackfill }, 'Забыл оценить перед едой')
      ),
      useCompactConfirm ? h('div', { className: 'hes-low-meal__confirm' },
        h('span', null, 'Это ближе к: ' + (LOW_HUNGER_REASON_SHORT_COPY[suggestedReason] || 'контекстный эпизод') + '?'),
        h('div', null,
          h('button', { type: 'button', className: 'is-suggested', onClick: () => onReason(suggestedReason) }, 'Да'),
          h('button', { type: 'button', onClick: () => setShowAllReasons(true) }, 'Другое')
        )
      ) : h('div', { className: 'hes-low-meal__chips' },
        reasonOptions.map(([reason, label]) => h('button', {
          key: reason,
          type: 'button',
          className: reason === suggestedReason ? 'is-suggested' : '',
          onClick: () => onReason(reason)
        }, label, reason === suggestedReason && h('span', null, 'подходит')))
      ),
      h('button', { className: 'hes-low-meal__quiet', type: 'button', onClick: onSkip }, 'Не спрашивать сейчас')
    );
  }

  function LowHungerMealResolution({ result, onBackfill, onEditHunger, onContextTag }) {
    if (!result) return null;
    return h('div', { className: 'hes-low-meal hes-low-meal--resolved' },
      h('div', { className: 'hes-low-meal__title' }, 'Контекст сохранён'),
      h('div', { className: 'hes-low-meal__text' }, result.advice),
      h('div', { className: 'hes-low-meal__saved' }, result.savedSummary || result.label),
      result.stressCalorieLink && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, 'Связка'),
        h('span', null, 'Стресс/нервозность → ' + result.stressCalorieLink.choiceLabel)
      ),
      result.nextStep && h('div', { className: 'hes-low-meal__next' },
        h('span', null, 'Следующий шаг'),
        h('strong', null, result.nextStep.title),
        h('em', null, result.nextStep.detail)
      ),
      result.gentlePlan?.replacement && h('div', { className: 'hes-low-meal__next' },
        h('span', null, result.gentlePlan.replacement.title),
        h('strong', null, result.gentlePlan.replacement.detail)
      ),
      result.gentlePlan?.experiment && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, result.gentlePlan.experiment.title),
        h('span', null, result.gentlePlan.experiment.detail)
      ),
      result.gentlePlan?.quietCue && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, result.gentlePlan.quietCue.title),
        h('span', null, result.gentlePlan.quietCue.detail)
      ),
      result.upcomingCue && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, result.upcomingCue.title),
        h('span', null, result.upcomingCue.detail)
      ),
      result.weeklyDigest?.digestLabel && h('div', { className: 'hes-low-meal__soft' },
        h('strong', null, 'Итог недели'),
        h('span', null, result.weeklyDigest.digestLabel)
      ),
      safeArray(result.contextOptions).length > 0 && h('div', { className: 'hes-low-meal__context' },
        h('span', null, 'Если хотите, отметьте контекст'),
        h('div', { className: 'hes-low-meal__context-chips' },
          result.contextOptions.map(([value, label]) => h('button', {
            key: value,
            type: 'button',
            className: result.contextTag === value ? 'is-active' : '',
            onClick: () => onContextTag?.(value)
          }, label))
        )
      ),
      h('div', { className: 'hes-low-meal__actions' },
        h('button', { type: 'button', onClick: onEditHunger }, 'Исправить прошлую оценку'),
        h('button', { type: 'button', onClick: onBackfill }, 'Добавить оценку перед едой')
      )
    );
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function mixChannel(from, to, ratio) {
    return Math.round(from + (to - from) * clamp01(ratio));
  }

  function mixRgb(from, to, ratio) {
    return [
      mixChannel(from[0], to[0], ratio),
      mixChannel(from[1], to[1], ratio),
      mixChannel(from[2], to[2], ratio)
    ];
  }

  function rgbCss(rgb) {
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  function rgbaCss(rgb, alpha) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function getHungerTone(value) {
    const v = Math.max(1, Math.min(10, Number(value) || DEFAULT_DRAFT.hungerLevel));
    const green = [79, 157, 105];
    const amber = [215, 169, 40];
    const red = [216, 90, 74];
    const base = v <= 5.5
      ? mixRgb(green, amber, (v - 1) / 4.5)
      : mixRgb(amber, red, (v - 5.5) / 4.5);
    const soft = mixRgb(base, [255, 255, 255], 0.18);
    const action = mixRgb(base, [67, 69, 135], 0.36);
    const actionDeep = mixRgb(action, [23, 32, 51], 0.18);
    return {
      main: rgbCss(base),
      soft: rgbCss(soft),
      shadow: rgbaCss(base, 0.24),
      action: rgbCss(action),
      actionDeep: rgbCss(actionDeep),
      actionShadow: rgbaCss(action, 0.26)
    };
  }

  function getInitialDraftForState(state) {
    const day = resolveDayData(state || {});
    const date = state?.date || day.date || todayKey();
    const context = buildContextFromDay({ ...(state || {}), date, day });
    const previousLevel = Number(context.previousHungerLevel);
    const previousAt = context.previousHungerEventAt;
    const previousMinutes = Number(context.minutesSinceLastHungerEvent);
    const previousDate = previousAt ? localDateKeyFromTs(previousAt) : '';
    const isFresh = Number.isFinite(previousLevel)
      && (previousDate === todayKey() || (Number.isFinite(previousMinutes) && previousMinutes <= TREND_WINDOW_MIN));
    if (!isFresh) return { ...DEFAULT_DRAFT };
    const level = Math.max(1, Math.min(10, Math.round(previousLevel)));
    return {
      ...DEFAULT_DRAFT,
      hungerLevel: level,
      hungerVisual: previousLevel
    };
  }

  function HungerSlider({ value, changeNote, onPreview, onCommit, onDragStart, onDragEnd }) {
    const visualValue = Number.isFinite(Number(value)) ? Number(value) : 5;
    const roundedValue = Math.max(1, Math.min(10, Math.round(visualValue)));
    const label = String(roundedValue);
    const fillPercent = ((Math.max(1, Math.min(10, visualValue)) - 1) / 9) * 100;
    const fillPx = (fillPercent / 100) * 205;
    const hungerTone = getHungerTone(visualValue);
    const handlePreview = (e) => {
      onDragStart?.();
      onPreview(Number(e.target.value));
    };
    const handleCommit = (e) => {
      onCommit(Number(e.target.value));
      onDragEnd?.();
    };
    return h('div', { className: 'hes-slider' },
      h('div', { className: 'hes-slider__value' }, label),
      h('div', { className: 'hes-slider__status' }, HUNGER_STATUS_COPY[roundedValue] || ''),
      changeNote && h('div', { className: 'hes-slider__change' }, changeNote),
      h('div', {
        className: 'hes-slider__control',
        style: {
          '--hes-fill-percent': fillPercent + '%',
          '--hes-fill-px': fillPx + 'px',
          '--hes-fill-color': hungerTone.main,
          '--hes-fill-color-soft': hungerTone.soft,
          '--hes-fill-shadow': hungerTone.shadow
        }
      },
        h('div', { className: 'hes-slider__track', 'aria-hidden': 'true' },
          h('span', { className: 'hes-slider__fill' }),
          h('span', { className: 'hes-slider__thumb' })
        ),
        h('input', {
          className: 'hes-slider__range',
          type: 'range',
          min: 1,
          max: 10,
          step: 0.01,
          value: visualValue,
          'aria-label': 'Степень голода',
          onPointerDown: () => onDragStart?.(),
          onInput: handlePreview,
          onPointerUp: handleCommit,
          onPointerCancel: handleCommit,
          onTouchEnd: handleCommit
        })
      )
    );
  }

  function TimelineSpark({ date, day, draft, hint, settings, editingEventId, backfillTarget, assessmentTime, onEditPoint, onBackfillTime, onAddMealTime }) {
    const data = buildSparkTimeline({
      date,
      day,
      draft,
      settings,
      editTarget: editingEventId ? { id: editingEventId, hungerLevel: draft?.hungerVisual ?? draft?.hungerLevel } : null,
      backfillTarget,
      assessmentTime
    });
    const [actionMenu, setActionMenu] = React.useState(null);
    const pressRef = React.useRef(null);
    const gradientId = 'hes-hunger-spark-gradient';
    const mealModerateGradientId = 'hes-meal-quality-moderate-gradient';
    const mealMixedGradientId = 'hes-meal-quality-mixed-gradient';
    const canEditPoint = (point) => point?.id && point.type !== 'preview';
    const isPreviewPoint = (point) => point?.type === 'preview' || point?.type === 'backfill-preview';
    const resolvePressTarget = (event) => {
      if (!Number.isFinite(data.scaleStart) || !Number.isFinite(data.scaleEnd)) return null;
      const rect = event.currentTarget.getBoundingClientRect?.();
      if (!rect?.width) return null;
      const svgX = ((event.clientX - rect.left) / rect.width) * 320;
      if (svgX < 18 || svgX > 302) return null;
      const rawTs = sparkTimeFromX(svgX, data.scaleStart, data.scaleEnd);
      const snapped = snapSparkTimestamp(rawTs, Date.now());
      if (!Number.isFinite(snapped)) return null;
      if (localDateKeyFromTs(snapped) !== (date || todayKey())) return null;
      return {
        t: snapped,
        x: Math.max(18, Math.min(302, svgX))
      };
    };
    const clearPress = () => {
      if (pressRef.current?.timer) clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    };
    const handlePointKey = (event, point) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onEditPoint?.(point);
    };
    const handleSparkPointerDown = (event) => {
      if (!onBackfillTime && !onAddMealTime) return;
      if (event.button != null && event.button !== 0) return;
      const target = resolvePressTarget(event);
      if (!target) return;
      setActionMenu(null);
      const press = { target, longPressed: false, timer: null };
      press.timer = setTimeout(() => {
        press.longPressed = true;
        setActionMenu(target);
      }, HUNGER_TIMELINE_LONG_PRESS_MS);
      pressRef.current = press;
    };
    const handleSparkPointerUp = () => {
      const press = pressRef.current;
      clearPress();
      if (!press || press.longPressed) return;
      setActionMenu(null);
      onBackfillTime?.(press.target.t);
    };
    return h('div', {
      className: 'hes-spark',
      role: onEditPoint || onBackfillTime || onAddMealTime ? 'group' : 'img',
      'aria-label': 'Связь прошлых оценок голода и приёмов пищи'
    },
      h('svg', {
        className: 'hes-spark__svg',
        viewBox: '0 0 320 86',
        focusable: 'false',
        'aria-hidden': onEditPoint || onBackfillTime || onAddMealTime ? undefined : 'true',
        onPointerDown: handleSparkPointerDown,
        onPointerUp: handleSparkPointerUp,
        onPointerCancel: clearPress,
        onPointerLeave: clearPress
      },
        onBackfillTime && h('rect', {
          className: 'hes-spark__backfill-hit',
          x: 18,
          y: 18,
          width: 284,
          height: 52,
          rx: 8
        }),
        (data.lineStops.length > 1 || data.meals.some((meal) => meal.quality?.tone === 'moderate' || meal.quality?.tone === 'mixed')) && h('defs', null,
          data.lineStops.length > 1 && h('linearGradient', { id: gradientId, x1: 18, y1: 0, x2: 302, y2: 0, gradientUnits: 'userSpaceOnUse' },
            data.lineStops.map((stop, index) => h('stop', {
              key: 'stop-' + index,
              offset: stop.offset.toFixed(1) + '%',
              stopColor: stop.color
            }))
          ),
          h('linearGradient', { id: mealModerateGradientId, x1: 0, y1: 20, x2: 0, y2: 66, gradientUnits: 'userSpaceOnUse' },
            h('stop', { offset: '0%', stopColor: '#d9f99d' }),
            h('stop', { offset: '100%', stopColor: '#86efac' })
          ),
          h('linearGradient', { id: mealMixedGradientId, x1: 0, y1: 20, x2: 0, y2: 66, gradientUnits: 'userSpaceOnUse' },
            h('stop', { offset: '0%', stopColor: '#fef08a' }),
            h('stop', { offset: '100%', stopColor: '#bef264' })
          )
        ),
        data.nightBands.map((band, index) => h('rect', {
          key: 'night-' + index,
          className: 'hes-spark__night',
          x: band.x,
          y: 18,
          width: band.width,
          height: 46,
          rx: 7
        })),
        h('line', { className: 'hes-spark__axis', x1: 18, y1: 64, x2: 302, y2: 64 }),
        data.ticks.map((tick, index) => h('g', { key: 'tick-' + index, className: 'hes-spark__tick' },
          h('line', { x1: tick.x, y1: 62, x2: tick.x, y2: 67 }),
          h('text', { x: tick.x, y: 78, textAnchor: 'middle' }, tick.label)
        )),
        data.meals.map((meal, index) => h('g', {
          key: 'meal-' + index,
          className: 'hes-spark__meal-marker hes-spark__meal-marker--' + (meal.quality?.tone || 'mixed')
        },
          h('rect', {
            className: 'hes-spark__meal-pill',
            x: meal.x - 5,
            y: 20,
            width: 10,
            height: 46,
            rx: 5,
            style: meal.quality?.tone === 'moderate'
              ? { fill: 'url(#' + mealModerateGradientId + ')' }
              : meal.quality?.tone === 'mixed'
                ? { fill: 'url(#' + mealMixedGradientId + ')' }
                : undefined
          }),
          h('line', {
            className: 'hes-spark__meal-line',
            x1: meal.x,
            y1: 22,
            x2: meal.x,
            y2: 64
          }),
          h('title', null, (meal.quality?.label || 'еда') + ' · ' + formatShortTime(meal.t))
        )),
        data.backfillMarker && h('g', { className: 'hes-spark__backfill-marker' },
          h('line', {
            x1: data.backfillMarker.x,
            y1: 20,
            x2: data.backfillMarker.x,
            y2: 66
          }),
          h('text', {
            x: data.backfillMarker.x,
            y: 17,
            textAnchor: 'middle'
          }, data.backfillMarker.label)
        ),
        data.path && h('path', { className: 'hes-spark__line', d: data.path, style: { stroke: 'url(#' + gradientId + ')' } }),
        data.forecast && h('line', {
          className: 'hes-spark__forecast-line',
          x1: data.forecast.x1,
          y1: data.forecast.y1,
          x2: data.forecast.x2,
          y2: data.forecast.y2,
          style: { stroke: data.forecast.color }
        }),
        data.forecast && h('circle', {
          className: 'hes-spark__forecast-point',
          cx: data.forecast.x2,
          cy: data.forecast.y2,
          r: 4,
          style: { stroke: data.forecast.color }
        }),
        data.cravingPath && h('path', { className: 'hes-spark__craving-line', d: data.cravingPath }),
        data.cravingPoints.map((point, index) => h('circle', {
          key: 'craving-' + index,
          className: 'hes-spark__craving-point',
          cx: point.x,
          cy: point.y,
          r: point.type === 'craving-preview' ? 4.5 : 3.6
        })),
        data.hungerPoints.map((point, index) => {
          const editable = canEditPoint(point);
          const className = [
            'hes-spark__point',
            isPreviewPoint(point) ? 'hes-spark__point--preview' : '',
            point.isCompactClusterPoint ? 'hes-spark__point--compact' : '',
            editable ? 'is-editable' : '',
            point.isEditing ? 'is-editing' : ''
          ].filter(Boolean).join(' ');
          const visibleCircle = h('circle', {
            className,
            cx: point.x,
            cy: point.y,
            r: point.isCompactClusterPoint ? 2.8 : isPreviewPoint(point) || point.isEditing ? 6 : 5,
            style: isPreviewPoint(point)
              ? { stroke: point.color }
              : { fill: point.color }
          });
          if (!editable) return React.cloneElement(visibleCircle, { key: point.type + '-' + index });
          return h('g', {
            key: point.id || (point.type + '-' + index),
            className: 'hes-spark__point-button',
            role: 'button',
            tabIndex: 0,
            'aria-label': 'Изменить оценку голода ' + point.level + '/10, ' + formatShortTime(point.t),
            onPointerDown: (event) => event.stopPropagation(),
            onPointerUp: (event) => event.stopPropagation(),
            onClick: (event) => {
              event.stopPropagation();
              onEditPoint?.(point);
            },
            onKeyDown: (event) => handlePointKey(event, point)
          },
            visibleCircle,
            h('circle', {
              className: 'hes-spark__point-hit',
              cx: point.x,
              cy: point.y,
              r: 14
            })
          );
        })
      ),
      actionMenu && h('div', {
        className: 'hes-spark-menu',
        style: { left: (actionMenu.x / 320 * 100) + '%' },
        role: 'menu',
        'aria-label': 'Действие на ' + formatShortTime(actionMenu.t)
      },
        h('div', { className: 'hes-spark-menu__time' }, formatShortTime(actionMenu.t)),
        h('button', {
          type: 'button',
          role: 'menuitem',
          onClick: () => {
            const t = actionMenu.t;
            setActionMenu(null);
            onBackfillTime?.(t);
          }
        }, 'Оценка'),
        h('button', {
          type: 'button',
          role: 'menuitem',
          onClick: () => {
            const t = actionMenu.t;
            setActionMenu(null);
            onAddMealTime?.(t);
          }
        }, 'Приём пищи')
      ),
      h('div', { className: 'hes-spark__legend' },
          h('span', { className: 'hes-spark__legend-items' },
            h('span', null, h('i', { className: 'hes-spark__legend-dot hes-spark__legend-dot--hunger' }), 'голод'),
          data.cravingPoints.length > 0 && h('span', null, h('i', { className: 'hes-spark__legend-dot hes-spark__legend-dot--craving' }), 'тяга'),
            h('span', null, h('i', { className: 'hes-spark__legend-line hes-spark__legend-line--meal' }), 'еда')
          ),
        hint && h('span', { className: 'hes-spark__hint' }, hint),
        !data.hasHistory && h('span', { className: 'hes-spark__muted' }, 'история появится после записей')
      ),
      h('div', { className: 'hes-spark__gesture-hint' }, 'тап — оценка · удержание — еда')
    );
  }

  function StableHungerReasonPrompt({ prompt, value, onToggle }) {
    if (!prompt) return null;
    const selected = new Set(safeArray(value));
    return h('div', { className: 'hes-prompt is-visible' },
      h('div', { className: 'hes-prompt__title' }, prompt.question || 'Почему голод не растёт?'),
      h('div', { className: 'hes-prompt__chips' },
        STABLE_HUNGER_REASON_OPTIONS.map((option) => h('button', {
          key: option.id,
          type: 'button',
          className: 'hes-chip' + (selected.has(option.id) ? ' is-selected' : ''),
          onClick: () => onToggle?.(option.id),
          'aria-pressed': selected.has(option.id)
        }, option.label))
      )
    );
  }

  function MealEffectPrompt({ followUp, value, onChange }) {
    if (!followUp) return null;
    const mealTime = formatShortTime(followUp.mealAt || '');
    return h('div', { className: 'hes-meal-effect' },
      h('div', null,
        h('strong', null, mealTime ? 'После еды в ' + mealTime : 'После еды'),
        h('span', null, 'Как изменился голод?')
      ),
      h('div', { className: 'hes-meal-effect__choices' },
        Object.keys(MEAL_EFFECT_COPY).map((key) => h('button', {
          key,
          type: 'button',
          className: 'hes-meal-effect__chip' + (value === key ? ' is-selected' : ''),
          onClick: () => onChange?.(key),
          'aria-pressed': value === key
        }, MEAL_EFFECT_COPY[key]))
      )
    );
  }

  function StressCalorieOutcomePrompt({ followUp, onOutcome }) {
    if (!followUp) return null;
    const link = followUp.stressCalorieLink || {};
    return h('div', { className: 'hes-low-meal hes-low-meal--resolved' },
      h('div', { className: 'hes-low-meal__title' }, 'Что стало после стрессового добора?'),
      h('div', { className: 'hes-low-meal__text' },
        'Ранее отметили: напряжение → ', link.choiceLabel || 'калорийный выбор',
        followUp.mealAt ? ' в ' + formatShortTime(followUp.mealAt) : ''
      ),
      h('div', { className: 'hes-low-meal__context' },
        h('span', null, 'Это помогло снять напряжение?'),
        h('div', { className: 'hes-low-meal__context-chips' },
          Object.keys(STRESS_CALORIE_OUTCOME_COPY).map((key) => h('button', {
            key,
            type: 'button',
            onClick: () => onOutcome?.(key)
          }, STRESS_CALORIE_OUTCOME_COPY[key]))
        )
      )
    );
  }

  function buildPatternInsight(context) {
    if (!context) return null;
    if (context.lowHungerMealReview?.patternStats?.isRepeated) {
      return {
        title: 'Повторяется еда при низком голоде',
        detail: 'Похоже, это не голод, а контекст еды: кофе, привычка или социальная ситуация.'
      };
    }
    if (context.personalHungerModel?.longGapDelayRiskHigh) {
      return {
        title: 'Длинные паузы часто рискованны',
        detail: 'Когда промежуток без еды большой, ожидание чаще ухудшало итог.'
      };
    }
    if (context.repeatedHighHungerToday) {
      return {
        title: 'Сегодня голод уже повторялся',
        detail: 'Лучше смотреть не только на текущую точку, а на весь дневной ритм.'
      };
    }
    if (context.noIntakeToday) {
      return {
        title: 'Еда сегодня не найдена',
        detail: 'Оценка голода сейчас может быть и сигналом дефицита, и привычной задержкой.'
      };
    }
    if (Number.isFinite(Number(context.hoursSinceMeal)) && Number(context.hoursSinceMeal) >= 5) {
      return {
        title: 'Пауза без еды уже длинная',
        detail: 'Если голод растёт, спокойный план еды обычно надёжнее терпеть до срыва.'
      };
    }
    return null;
  }

  function PatternInsightCard({ insight }) {
    if (!insight) return null;
    return h('div', { className: 'hes-pattern-insight' },
      h('span', null, 'Паттерн'),
      h('strong', null, insight.title),
      h('em', null, insight.detail)
    );
  }

  function HungerFeatureSettings({ settings, onToggle, onSetPromptLimit, onBack }) {
    const promptLimit = getLowHungerDailyPromptLimit(settings);
    return h('div', { className: 'hes-settings' },
      h('div', { className: 'hes-settings__top' },
        h('div', null,
          h('strong', null, 'Настройки голода'),
          h('span', null, 'Подсказки можно сделать тише или подробнее')
        ),
        h('button', { type: 'button', onClick: onBack }, 'Готово')
      ),
      h('div', { className: 'hes-limit-row' },
        h('div', { className: 'hes-limit-row__copy' },
          h('strong', null, 'Лимит уточнений за день'),
          h('em', null, promptLimit === 0
            ? 'Не спрашивать, только сохранять контекст.'
            : 'Максимум ' + promptLimit + ' в день, остальные эпизоды сохраняются тихо.')
        ),
        h('div', { className: 'hes-limit-row__options' },
          LOW_HUNGER_DAILY_PROMPT_LIMIT_OPTIONS.map((value) => h('button', {
            key: value,
            type: 'button',
            className: value === promptLimit ? 'is-active' : '',
            onClick: () => onSetPromptLimit?.(value),
            'aria-pressed': value === promptLimit
          }, String(value)))
        )
      ),
      FEATURE_SETTINGS_META.map((item) => {
        const enabled = settings?.[item.id] !== false;
        return h('label', {
          key: item.id,
          className: 'hes-feature-row' + (enabled ? ' is-on' : '')
        },
          h('input', {
            type: 'checkbox',
            id: 'hes-feature-' + item.id,
            name: 'hes-feature-' + item.id,
            checked: enabled,
            onChange: () => onToggle?.(item.id, !enabled)
          }),
          h('span', { className: 'hes-feature-row__rail', 'aria-hidden': 'true' },
            h('i', null)
          ),
          h('span', { className: 'hes-feature-row__copy' },
            h('strong', null, item.title),
            h('em', null, item.detail)
          ),
          h('span', { className: 'hes-feature-row__state' }, enabled ? 'вкл' : 'выкл')
        );
      })
    );
  }

  function formatFoodBand(band) {
    if (!band) return null;
    if (band[0] === 0 && band[1] === 0) return 'без еды сейчас';
    return band[0] + '-' + band[1] + ' ккал';
  }

  function formatShortDuration(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 60) return Math.max(1, Math.round(value)) + ' мин';
    const hours = value / 60;
    if (hours < 10) return (Math.round(hours * 10) / 10).toString().replace('.0', '') + ' ч';
    return Math.round(hours) + ' ч';
  }

  function getHungerChangeNote(draft, context) {
    const previous = Number(context?.previousHungerLevel);
    const current = Number(draft?.hungerLevel);
    const minutes = Number(context?.minutesSinceLastHungerEvent);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
    if (!Number.isFinite(minutes) || minutes > 24 * 60) return null;
    const previousRounded = Math.max(1, Math.min(10, Math.round(previous)));
    const currentRounded = Math.max(1, Math.min(10, Math.round(current)));
    const duration = formatShortDuration(minutes);
    if (!duration) return null;
    if (currentRounded === previousRounded) return 'Без изменений с прошлой оценки, ' + duration;
    const suffix = currentRounded - previousRounded >= 3 && minutes <= 180 ? ' · быстрый рост' : '';
    return 'Было ' + previousRounded + ' → стало ' + currentRounded + ' за ' + duration + suffix;
  }

  function getLastMealHint(context) {
    const hours = Number(context?.hoursSinceMeal);
    if (!Number.isFinite(hours)) {
      if (context?.mealTimeMissing) return 'Время последней еды не указано';
      if (context?.todayMealCount === 0) return 'Сегодня еда ещё не найдена';
      return null;
    }
    return 'с последней еды ' + formatShortDuration(hours * 60);
  }

  function getRecommendationTitle(decision) {
    if (decision.suggestedAction === 'fastCarbSafety') return 'Проверить низкую глюкозу';
    if (decision.hardOverride || decision.suggestedAction === 'doNotDelay') return 'Сейчас лучше поесть';
    if (decision.suggestedAction === 'eatMeal') return 'Съесть полноценный приём';
    if (decision.suggestedAction === 'planNextMeal') return 'Запланировать еду';
    if (decision.suggestedAction === 'hydratePause') return 'Вода и пауза';
    if (decision.suggestedAction === 'coffeePause') return 'Короткая пауза';
    if (decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') return 'Пока не есть';
    return 'Съесть небольшой перекус';
  }

  function getRecommendationDetail(decision) {
    const band = formatFoodBand(decision.foodBandKcal);
    if (decision.suggestedAction === 'fastCarbSafety') return 'Если есть диабет или низкая глюкоза: быстрые углеводы и проверка через 15 мин';
    if (decision.suggestedAction === 'planNextMeal') return 'Можно не есть сейчас, но выбери ближайший спокойный приём';
    if (decision.suggestedAction === 'hydratePause') return 'Вода или несладкий чай, затем перепроверить';
    if (decision.suggestedAction === 'coffeePause') return 'Кофе только если он привычный и низкорисковый';
    if (decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') {
      return 'Сейчас можно не есть; вернись к оценке, если состояние изменится';
    }
    if (decision.suggestedAction === 'eatMeal') return band ? 'Нормальный приём пищи, ' + band : 'Нормальный приём пищи';
    if (decision.suggestedAction === 'doNotDelay') return band ? 'Не откладывать, ' + band : 'Не откладывать';
    return band ? 'Белок + клетчатка, ' + band : 'Белок + клетчатка';
  }

  function getNextBestAction(result) {
    const decision = result?.decision || {};
    const band = formatFoodBand(decision.foodBandKcal);
    if (decision.suggestedAction === 'planNextMeal') {
      return {
        title: 'Выбрать ближайшую еду',
        detail: 'Поставить спокойный приём в ближайшее окно',
        type: 'plan'
      };
    }
    if (decision.suggestedAction === 'hydratePause' || decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') {
      return {
        title: 'Оценить позже',
        detail: 'Открой новую оценку, если голод или самочувствие изменятся',
        type: 'check'
      };
    }
    if (decision.suggestedAction === 'coffeePause') {
      return {
        title: 'Короткая пауза',
        detail: 'Кофе только если он привычный, затем повторная оценка',
        type: 'check'
      };
    }
    if (decision.suggestedAction === 'fastCarbSafety') {
      return {
        title: 'Safety-сценарий',
        detail: 'Быстрые углеводы, затем перепроверка через 15 мин',
        type: 'safety'
      };
    }
    return {
      title: decision.suggestedAction === 'eatMeal' ? 'Собрать спокойный приём' : 'Собрать перекус',
      detail: band ? 'Белок + клетчатка, ' + band : 'Белок + клетчатка',
      type: 'food'
    };
  }

  function getFollowUpQuestion(decision) {
    if (decision?.suggestedAction === 'fastCarbSafety') return 'Что изменилось через 15 минут?';
    if (decision?.delayAllowed) return 'Что случилось после паузы?';
    if (decision?.postFoodOutcomeAfterMin) return 'Что случилось после еды?';
    return null;
  }

  function buildPatternCards(result) {
    const log = result?.log || {};
    const context = result?.context || {};
    const model = context.personalHungerModel || log.personalModel || {};
    const velocity = log.hungerVelocity || {};
    const cards = [];
    if (velocity.fresh && Number(velocity.delta) >= 2) {
      cards.push({
        id: 'fast_rise',
        title: 'Быстро растёт',
        detail: '+' + velocity.delta + ' за ' + velocity.minutes + ' мин'
      });
    }
    if (Number(context.hoursSinceMeal) >= 18) {
      cards.push({
        id: 'long_gap',
        title: 'Длинный промежуток',
        detail: Math.round(context.hoursSinceMeal) + ' ч без еды'
      });
    }
    if (model.delayRiskHigh || model.longGapDelayRiskHigh) {
      cards.push({
        id: 'delay_risk',
        title: 'Паузы рискованны',
        detail: 'по прошлым исходам'
      });
    } else if (model.waitWorks) {
      cards.push({
        id: 'wait_works',
        title: 'Пауза часто работает',
        detail: 'по прошлым исходам'
      });
    }
    if (model.foodAnchorHelpful) {
      cards.push({
        id: 'food_anchor',
        title: 'Перекус помогает',
        detail: 'по прошлым исходам'
      });
    }
    if (!model.learnedEnough && Number(model.sampleSize) > 0) {
      cards.push({
        id: 'learning',
        title: 'Модель учится',
        detail: model.sampleSize + '/6 исходов'
      });
    }
    return unique(cards.map((card) => card.id)).map((id) => cards.find((card) => card.id === id)).slice(0, 2);
  }

  function buildOutcomeLearning(context) {
    const model = context?.personalHungerModel || {};
    return {
      sampleSize: model.sampleSize || 0,
      days: model.days || 0,
      learnedEnough: !!model.learnedEnough,
      profileHint: model.profileHint || 'learning',
      delayRiskHigh: !!model.delayRiskHigh,
      longGapDelayRiskHigh: !!model.longGapDelayRiskHigh,
      waitWorks: !!model.waitWorks,
      foodAnchorHelpful: !!model.foodAnchorHelpful,
      counts: {
        delayAttempts: model.delayAttempts || 0,
        badDelay: model.badDelayCount || 0,
        goodDelay: model.goodDelayCount || 0,
        foodAttempts: model.foodAttempts || 0,
        goodFood: model.goodFoodCount || 0
      }
    };
  }

  function getRecommendationReasons(result) {
    const reasons = [];
    const input = result?.input || {};
    const context = result?.context || {};
    const decision = result?.decision || {};
    if (input.hungerLevel) reasons.push('голод ' + input.hungerLevel + '/10');
    if (context.hoursSinceMeal >= 4) reasons.push(Math.round(context.hoursSinceMeal) + ' ч без еды');
    if (context.noIntakeToday) reasons.push('еда сегодня не найдена');
    if (input.hungerTrend === 'rising') reasons.push('голод растёт');
    if (context.repeatedHighHungerToday && Number(input.hungerLevel) >= 6) reasons.push('повторяется сегодня');
    if (decision.riskBudget?.level === 'high') reasons.push('риск ожидания высокий');
    safeArray(result?.drivers).forEach((driver) => reasons.push(driver));
    return unique(reasons).slice(0, 3);
  }

  function getContextBadges(result) {
    const context = result?.context || {};
    const input = result?.input || {};
    const badges = [];
    badges.push(context.hasMealData ? 'последняя еда найдена' : 'еда не найдена');
    if (context.noIntakeToday) badges.push('сегодня без еды');
    if (input.hungerTrend === 'unknown') badges.push('тренд не свежий');
    else badges.push(input.hungerTrend === 'rising' ? 'тренд растёт' : input.hungerTrend === 'falling' ? 'тренд снижается' : 'тренд стабилен');
    if (context.personalHungerModel?.learnedEnough) badges.push('личный паттерн учтён');
    else if (context.personalHungerModel?.sampleSize > 0) badges.push('личная модель учится');
    if (context.minutesSinceLastHungerEvent != null) badges.push('прошлая оценка ' + context.minutesSinceLastHungerEvent + ' мин назад');
    return unique(badges).slice(0, 4);
  }

  function buildHungerVelocity(input, context) {
    const previousLevel = Number(context.previousHungerLevel);
    const currentLevel = Number(input.hungerLevel);
    const minutes = Number(context.minutesSinceLastHungerEvent);
    const fresh = Number.isFinite(minutes) && minutes <= TREND_WINDOW_MIN;
    if (!Number.isFinite(previousLevel) || !Number.isFinite(currentLevel) || !Number.isFinite(minutes)) {
      return {
        previousLevel: null,
        currentLevel,
        delta: null,
        minutes: null,
        velocityPerHour: null,
        fresh: false
      };
    }
    const delta = currentLevel - previousLevel;
    return {
      previousLevel,
      currentLevel,
      delta,
      minutes,
      velocityPerHour: minutes > 0 ? Math.round((delta / minutes) * 60 * 10) / 10 : 0,
      fresh
    };
  }

  function buildMealGapRiskCurve(context) {
    const hours = Number(context.hoursSinceMeal);
    const thresholds = [4, 8, 12, 18, 24];
    return {
      hoursSinceMeal: Number.isFinite(hours) ? Math.round(hours * 10) / 10 : null,
      currentBand: !Number.isFinite(hours) ? 'unknown' :
        hours >= 24 ? 'veryLong' : hours >= 18 ? 'long' : hours >= 12 ? 'extended' : hours >= 8 ? 'noticeable' : hours >= 4 ? 'normalGap' : 'recent',
      markers: thresholds.map((threshold) => ({
        hour: threshold,
        passed: Number.isFinite(hours) ? hours >= threshold : false
      }))
    };
  }

  function cloneContext(context, patch) {
    return { ...(context || {}), ...(patch || {}) };
  }

  function buildDecisionTrace(input, context, decision) {
    const base = decision || HEYS.HungerEnergyStatus.assessHungerEvent(input, context);
    const rows = [];
    function add(label, patchInput, patchContext) {
      const alt = HEYS.HungerEnergyStatus.assessHungerEvent(
        { ...input, ...(patchInput || {}) },
        cloneContext(context, patchContext)
      );
      rows.push({
        factor: label,
        label: DEBUG_FACTOR_COPY[label] || label,
        riskDelta: base.riskBudget.score - alt.riskBudget.score,
        foodDelta: base.foodPriority.score - alt.foodPriority.score,
        actionIfRemoved: alt.suggestedAction,
        foodSupportIfRemoved: alt.foodPriority.level
      });
    }
    add('hungerLevel', { hungerLevel: 0 });
    if (input.hungerTrend === 'rising') add('hungerRising', { hungerTrend: 'unknown' });
    if (Number(context.hoursSinceMeal) >= 5 || context.longGap) {
      add('longGap', null, { hoursSinceMeal: 2, longGap: false });
    }
    if (context.noIntakeToday) add('noIntakeToday', null, { noIntakeToday: false });
    if (Number(context.remainingKcal) > 700) add('deficitPressure', null, { remainingKcal: 0 });
    return rows.filter((row) => row.riskDelta !== 0 || row.foodDelta !== 0 || row.actionIfRemoved !== base.suggestedAction);
  }

  function buildCounterfactuals(input, context) {
    const now = Date.parse(input?.now || context?.now || nowIso());
    const twoHoursAgo = Number.isFinite(now) ? new Date(now - 2 * 60 * 60 * 1000).toISOString() : null;
    const recentMealContext = {
      noIntakeToday: false,
      todayMealCount: Math.max(1, Number(context.todayMealCount) || 0),
      lastMealAt: twoHoursAgo || context.lastMealAt || null,
      hoursSinceMeal: 2,
      hasMealData: true,
      recentMeal: true,
      justAte: false,
      satietyLagLikely: false
    };
    const variants = [
      {
        id: 'meal_today_exists',
        label: 'если еда была 2ч назад',
        inputPatch: {},
        contextPatch: recentMealContext
      },
      {
        id: 'trend_not_rising',
        label: 'если голод не растёт',
        inputPatch: { hungerTrend: 'unknown' },
        contextPatch: {}
      },
      {
        id: 'short_gap',
        label: 'если промежуток короткий',
        inputPatch: {},
        contextPatch: { ...recentMealContext, longGap: false }
      }
    ];
    return variants.map((variant) => {
      const next = HEYS.HungerEnergyStatus.assessHungerEvent(
        { ...input, ...variant.inputPatch },
        cloneContext(context, variant.contextPatch)
      );
      return {
        id: variant.id,
        label: variant.label,
        suggestedAction: next.suggestedAction,
        riskLevel: next.riskBudget.level,
        foodSupportLevel: next.foodPriority.level,
        foodBandKcal: Array.isArray(next.foodBandKcal) ? next.foodBandKcal.slice() : null
      };
    });
  }

  function buildDecisionAudit(decision) {
    return {
      suggestedAction: decision.suggestedAction,
      delayAllowed: decision.delayAllowed,
      hardOverride: decision.hardOverride || null,
      riskLevel: decision.riskBudget?.level || null,
      foodSupportLevel: decision.foodPriority?.level || null,
      foodBandKcal: Array.isArray(decision.foodBandKcal) ? decision.foodBandKcal.slice() : null,
      recheckAfterMin: decision.recheckAfterMin || null,
      copyRisk: decision.copyRisk,
      requiresCuratorReview: !!decision.requiresCuratorReview,
      invariantErrors: safeArray(decision.invariantErrors),
      consistency: safeArray(decision.invariantErrors).length ? 'check_required' : 'ok'
    };
  }

  function buildDecisionLog({ source, input, context, decision, drivers }) {
    const hungerVelocity = buildHungerVelocity(input, context);
    const mealGapRiskCurve = buildMealGapRiskCurve(context);
    const decisionTrace = buildDecisionTrace(input, context, decision);
    const counterfactuals = buildCounterfactuals(input, context);
    const outcomeLearning = buildOutcomeLearning(context);
    const nextBestAction = getNextBestAction({ input, context, decision });
    const log = {
      feature: 'HungerEnergyStatus',
      version: 'ui_v1',
      source: source || 'hunger-fab',
      generatedAt: nowIso(),
      input,
      context: {
        now: context.now,
        lastMealAt: buildLogDateTime(context.lastMealAt),
        hoursSinceMeal: context.hoursSinceMeal ?? null,
        hasMealData: !!context.hasMealData,
        mealTimeMissing: !!context.mealTimeMissing,
        recentMeal: !!context.recentMeal,
        justAte: !!context.justAte,
        satietyLagLikely: !!context.satietyLagLikely,
        remainingKcal: context.remainingKcal,
        veryLowIntakeDay: !!context.veryLowIntakeDay,
        sleepHours: context.sleepHours,
        sleepQuality: context.sleepQuality,
        stressLevel: context.stressLevel,
        moodDropping: !!context.moodDropping,
        trainingRecovery: context.trainingRecovery,
        hardTrainingRecovery: !!context.hardTrainingRecovery,
        proteinDebt: !!context.proteinDebt,
        knownReboundPattern: !!context.knownReboundPattern,
        personalPatternEvents: context.personalPatternEvents || 0,
        personalPatternDays: context.personalPatternDays || 0,
        personalModel: context.personalHungerModel || null,
        personalLearningApplied: context.personalLearningApplied || null,
        failedDelayHistory: !!context.failedDelayHistory,
        successfulWaitHistory: !!context.successfulWaitHistory,
        previousHungerLevel: context.previousHungerLevel ?? null,
        previousHungerEventAt: context.previousHungerEventAt || null,
        minutesSinceLastHungerEvent: context.minutesSinceLastHungerEvent ?? null,
        todayMealCount: context.todayMealCount || 0,
        noIntakeToday: !!context.noIntakeToday,
        recentHungerEventCount6h: context.recentHungerEventCount6h || 0,
        recentHighHungerCount6h: context.recentHighHungerCount6h || 0,
        repeatedHighHungerToday: !!context.repeatedHighHungerToday,
        checkpointAttemptCount: context.checkpointAttemptCount || 0,
        lowHungerMealReview: context.lowHungerMealReview ? {
          mealAt: context.lowHungerMealReview.mealAt || null,
          hungerLevel: context.lowHungerMealReview.hungerLevel || null,
          hungerAt: context.lowHungerMealReview.hungerAt || null,
          mealAnalysis: context.lowHungerMealReview.analysis || null
        } : null
      },
      decision,
      display: {
        status: getDisplayStatus(decision),
        action: ACTION_COPY[decision.suggestedAction] || decision.suggestedAction,
        foodBand: decision.foodBandKcal || null,
        riskLevel: decision.riskBudget?.level || null,
        foodSupportLevel: decision.foodPriority?.level || null,
        drivers,
        nextBestAction
      },
      contextQuality: {
        mealData: context.hasMealData ? 'last_meal_found' : 'last_meal_missing',
        trendFreshness: input.hungerTrend === 'unknown' ? 'not_fresh_or_missing' : 'fresh',
        noIntakeToday: !!context.noIntakeToday
      },
      decisionAudit: buildDecisionAudit(decision),
      hungerVelocity,
      mealGapRiskCurve,
      decisionTrace,
      counterfactuals,
      outcomeLearning,
      nextBestAction,
      outcome: {
        requestedAfterMin: decision.recheckAfterMin || null,
        requestedWindowMin: decision.postFoodOutcomeAfterMin || null,
        userReported: null,
        userReportedAt: null
      }
    };
    log.patternCards = buildPatternCards({ input, context, decision, drivers, log });
    return log;
  }

  function formatSigned(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return (n > 0 ? '+' : '') + n;
  }

  function DebugSummary({ result }) {
    const log = result?.log || {};
    const velocity = log.hungerVelocity || {};
    const curve = log.mealGapRiskCurve || {};
    const learning = log.outcomeLearning || {};
    const audit = log.decisionAudit || {};
    const eventMeta = log.eventMeta || {};
    const trace = safeArray(log.decisionTrace).slice(0, 5);
    const counterfactuals = safeArray(log.counterfactuals).slice(0, 3);
    return h('div', { className: 'hes-debug-summary' },
      h('div', { className: 'hes-debug-grid' },
        h('div', null,
          h('span', null, 'Скорость'),
          h('strong', null, velocity.delta == null
            ? 'нет свежей пары'
            : formatSigned(velocity.delta) + ' за ' + velocity.minutes + ' мин')
        ),
        h('div', null,
          h('span', null, 'Промежуток'),
          h('strong', null, curve.hoursSinceMeal == null ? 'нет данных' : curve.hoursSinceMeal + ' ч')
        ),
        h('div', null,
          h('span', null, 'Личная модель'),
          h('strong', null, learning.learnedEnough ? learning.profileHint : (learning.sampleSize || 0) + '/6 исходов')
        ),
        h('div', null,
          h('span', null, 'Гейты'),
          h('strong', null, (audit.consistency || 'ok') + ' / ' + (audit.delayAllowed ? 'delay' : 'no-delay'))
        ),
        h('div', null,
          h('span', null, 'Событие'),
          h('strong', null, eventMeta.id ? (eventMeta.syncStatus || 'queued') + ' / ' + eventMeta.id : 'ещё нет')
        )
      ),
      trace.length > 0 && h('div', { className: 'hes-debug-list' },
        h('span', { className: 'hes-debug-list__title' }, 'Что двигало решение'),
        trace.map((row) => h('div', { key: row.factor, className: 'hes-debug-row' },
          h('span', null, row.label || row.factor),
          h('strong', null, 'risk ' + formatSigned(row.riskDelta) + ' / food ' + formatSigned(row.foodDelta))
        ))
      ),
      counterfactuals.length > 0 && h('div', { className: 'hes-debug-list' },
        h('span', { className: 'hes-debug-list__title' }, 'Что если'),
        counterfactuals.map((row) => h('div', { key: row.id, className: 'hes-debug-row' },
          h('span', null, row.label),
          h('strong', null, row.suggestedAction + ' / ' + row.foodSupportLevel)
        ))
      )
    );
  }

  function ModalShell() {
    const [state, setState] = React.useState(null);
    const [draft, setDraft] = React.useState(() => ({ ...DEFAULT_DRAFT, _openId: 0 }));
    const [contextPatch, setContextPatch] = React.useState({});
    const [result, setResult] = React.useState(null);
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const [copyDone, setCopyDone] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);
    const [autoOpenEnabled, setAutoOpenEnabledState] = React.useState(() => readAutoOpenEnabled());
    const [contextRefreshSeq, setContextRefreshSeq] = React.useState(0);
    const [editTarget, setEditTarget] = React.useState(null);
    const [backfillTarget, setBackfillTarget] = React.useState(null);
    const [assessmentTime, setAssessmentTime] = React.useState(() => Date.now());
    const [lowMealReasonResult, setLowMealReasonResult] = React.useState(null);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [featureSettings, setFeatureSettings] = React.useState(() => readHungerFeatureSettings());
    setModalState = setState;

    React.useEffect(() => {
      if (!state) return undefined;
      document.body.classList.add('hunger-energy-modal-open');
      lockPageScroll();
      setDraft({ ...(state._initialDraft || getInitialDraftForState(state)), _openId: state._openId || 0 });
      setContextPatch({});
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setIsDragging(false);
      setAutoOpenEnabledState(readAutoOpenEnabled());
      setContextRefreshSeq(0);
      setEditTarget(null);
      setBackfillTarget(null);
      setAssessmentTime(Date.now());
      setLowMealReasonResult(null);
      setSettingsOpen(false);
      setFeatureSettings(readHungerFeatureSettings());
      return () => {
        document.body.classList.remove('hunger-energy-modal-open');
        unlockPageScroll();
      };
    }, [state]);

    React.useEffect(() => {
      if (!state) return undefined;
      const refresh = () => setContextRefreshSeq((seq) => seq + 1);
      const timers = [60, 250, 900].map((delay) => setTimeout(refresh, delay));
      const onProgress = (event) => {
        if (!event?.detail?.phase || event.detail.phase === 'ready') refresh();
      };
      global.addEventListener?.('heysSyncCompleted', refresh);
      global.addEventListener?.('heys:client-changed', refresh);
      global.addEventListener?.('heys:hunger-energy-status-updated', refresh);
      global.addEventListener?.('heys:progress', onProgress);
      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        global.removeEventListener?.('heysSyncCompleted', refresh);
        global.removeEventListener?.('heys:client-changed', refresh);
        global.removeEventListener?.('heys:hunger-energy-status-updated', refresh);
        global.removeEventListener?.('heys:progress', onProgress);
      };
    }, [state?._openId]);

    React.useEffect(() => {
      const refreshAutoOpen = () => setAutoOpenEnabledState(readAutoOpenEnabled());
      const handleProfileUpdated = (event) => {
        const fields = safeArray(event?.detail?.fields);
        const field = event?.detail?.field;
        if (fields.length > 0 && !fields.includes(AUTO_OPEN_PROFILE_FIELD)) return;
        if (field && field !== AUTO_OPEN_PROFILE_FIELD) return;
        refreshAutoOpen();
      };
      global.addEventListener?.('heys:profile-updated', handleProfileUpdated);
      global.addEventListener?.('heys:client-changed', refreshAutoOpen);
      global.addEventListener?.('heys:hunger-feature-settings-updated', refreshAutoOpen);
      return () => {
        global.removeEventListener?.('heys:profile-updated', handleProfileUpdated);
        global.removeEventListener?.('heys:client-changed', refreshAutoOpen);
        global.removeEventListener?.('heys:hunger-feature-settings-updated', refreshAutoOpen);
      };
    }, []);

    React.useEffect(() => {
      const refreshSettings = () => setFeatureSettings(readHungerFeatureSettings());
      global.addEventListener?.('heys:hunger-feature-settings-updated', refreshSettings);
      global.addEventListener?.('heys:client-changed', refreshSettings);
      return () => {
        global.removeEventListener?.('heys:hunger-feature-settings-updated', refreshSettings);
        global.removeEventListener?.('heys:client-changed', refreshSettings);
      };
    }, []);

    if (!state) return null;

    const stateOpenId = state._openId || 0;
    const activeDraft = draft?._openId === stateOpenId
      ? draft
      : { ...(state._initialDraft || DEFAULT_DRAFT), _openId: stateOpenId };
    const timelineDay = resolveDayData({ ...state, _contextRefreshSeq: contextRefreshSeq });
    const timelineDate = state.date || timelineDay.date || todayKey();
    const baseContext = buildContextFromDay({ ...state, date: timelineDate, day: timelineDay });
    const context = { ...baseContext, ...contextPatch };
    const selectedAssessmentTime = Math.min(
      Number.isFinite(Number(assessmentTime)) ? Number(assessmentTime) : Date.now(),
      Date.now()
    );
    const selectedAssessmentAt = formatLocalDateTime(selectedAssessmentTime) || nowIso();
    const lowHungerMealReview = context.lowHungerMealReview || null;
    const liveHungerLevel = Math.max(1, Math.min(10, Math.round(Number(activeDraft.hungerVisual ?? activeDraft.hungerLevel) || DEFAULT_DRAFT.hungerLevel)));
    const draftForDecision = { ...activeDraft, hungerLevel: liveHungerLevel };
    const input = {
      now: selectedAssessmentAt,
      hungerLevel: liveHungerLevel,
      controlLevel: activeDraft.controlLevel,
      cravingLevel: activeDraft.cravingLevel,
      hungerTrend: resolveHungerTrend(liveHungerLevel, context),
      safetyFlags: activeDraft.safetyFlags,
      hungerReasons: safeArray(activeDraft.hungerReasons),
      mealEffectAnswer: activeDraft.mealEffectAnswer || null
    };
    const previewDecision = HEYS.HungerEnergyStatus.assessHungerEvent(input, context);
    const isEditingEvent = !!editTarget?.id;
    const isBackfillingEvent = Number.isFinite(Number(backfillTarget?.t));
    const isPastDraft = isEditingEvent || isBackfillingEvent;
    const isLowHungerClarification = !!lowHungerMealReview && !result && !isPastDraft && !lowMealReasonResult;
    const isLowHungerResolved = !!lowMealReasonResult && !result && !isPastDraft;
    const isLowHungerStep = isLowHungerClarification || isLowHungerResolved;
    const isStressCalorieFollowUp = !!state.stressCalorieFollowUp && !result && !isLowHungerStep;
    const stableHungerPrompt = isPastDraft ? null : buildStableHungerPrompt(input, context);
    const requiredInputs = isPastDraft ? [] : getRequiredInputs(previewDecision, draftForDecision);
    const hasRequiredInputs = requiredInputs.length > 0;
    const promptKey = stableHungerPrompt
      ? 'stable:' + stableHungerPrompt.type + ':' + (stableHungerPrompt.question || '')
      : 'missing:' + requiredInputs.join('|');
    const activeDecision = result?.decision || previewDecision;
    const modalMode = (isLowHungerStep || isStressCalorieFollowUp) ? 'clarification' : result ? (activeDecision.hardOverride ? 'safetyStop' : activeDecision.delayAllowed ? 'checkpoint' : 'foodRecommended') : 'input';
    const actionTone = getHungerTone(activeDraft.hungerVisual ?? activeDraft.hungerLevel);
    const hungerChangeNote = isEditingEvent
      ? 'Правка оценки ' + formatShortTime(editTarget.t)
      : isBackfillingEvent
        ? 'Оценка за ' + formatShortTime(backfillTarget.t)
      : getHungerChangeNote(activeDraft, context);
    const lastMealHint = getLastMealHint(context);
    const patternInsight = featureSettings.patternInsights ? buildPatternInsight(context) : null;
    const canShiftAssessmentTime = !settingsOpen && !result && !isEditingEvent && !isBackfillingEvent && !isLowHungerStep && !isStressCalorieFollowUp;

    function patchDraft(patch) {
      setDraft((prev) => ({
        ...((prev && prev._openId === stateOpenId) ? prev : activeDraft),
        ...patch,
        _openId: stateOpenId,
        contextPatch: undefined
      }));
      if (patch.contextPatch) setContextPatch((prev) => ({ ...prev, ...patch.contextPatch }));
    }

    function toggleAutoOpen() {
      const next = writeAutoOpenEnabled(!autoOpenEnabled);
      setAutoOpenEnabledState(next);
      const clientId = currentClientId();
      if (next && clientId) autoOpenShownClients.add(clientId);
    }

    function toggleFeatureSetting(id, enabled) {
      const next = updateHungerFeatureSetting(id, enabled);
      setFeatureSettings(next);
    }

    function shiftAssessmentTimeBack() {
      const lowerBound = dayStartTs(timelineDate);
      setAssessmentTime((prev) => {
        const base = Number.isFinite(Number(prev)) ? Math.min(Number(prev), Date.now()) : Date.now();
        return Math.max(lowerBound, base - HUNGER_TIMELINE_SNAP_MS);
      });
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
    }

    function setLowHungerPromptLimit(limit) {
      const next = writeHungerFeatureSettings({
        ...readHungerFeatureSettings(),
        lowHungerDailyPromptLimit: limit
      });
      setFeatureSettings(next);
      setContextRefreshSeq((seq) => seq + 1);
    }

    function makeFinalInput() {
      return {
        ...input,
        safetyFlags: Array.isArray(activeDraft.safetyFlags) ? activeDraft.safetyFlags : [],
        hungerReasons: safeArray(activeDraft.hungerReasons),
        stableHungerReasons: stableHungerPrompt ? safeArray(activeDraft.stableHungerReasons) : [],
        stableHungerPrompt,
        mealEffectAnswer: activeDraft.mealEffectAnswer || null
      };
    }

    function toggleStableHungerReason(reason) {
      if (!reason) return;
      const current = safeArray(activeDraft.stableHungerReasons);
      const next = current.includes(reason)
        ? current.filter((item) => item !== reason)
        : current.concat(reason);
      patchDraft({ stableHungerReasons: next });
    }

    function startEditPoint(point) {
      if (!point?.id) return;
      const level = Math.max(1, Math.min(10, Math.round(Number(point.level) || DEFAULT_DRAFT.hungerLevel)));
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setContextPatch({});
      setLowMealReasonResult(null);
      setEditTarget({
        id: point.id,
        t: point.t,
        recordedAt: point.recordedAt,
        originalLevel: level
      });
      setDraft({
        ...DEFAULT_DRAFT,
        hungerLevel: level,
        hungerVisual: level,
        _openId: stateOpenId
      });
      setBackfillTarget(null);
    }

    function cancelEditPoint() {
      setEditTarget(null);
      setBackfillTarget(null);
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextPatch({});
    }

    function saveEditedPoint() {
      if (!editTarget?.id) return;
      const level = Math.max(1, Math.min(10, Math.round(Number(activeDraft.hungerLevel) || DEFAULT_DRAFT.hungerLevel)));
      const editedAt = nowIso();
      const previousRows = readEvents();
      updateEvent(editTarget.id, (row) => {
        const previousLevel = Number(row.hungerLevel ?? row.input?.hungerLevel);
        return {
          hungerLevel: level,
          hungerStatus: HUNGER_STATUS_COPY[level] || null,
          input: {
            ...(row.input || {}),
            hungerLevel: level
          },
          editHistory: safeArray(row.editHistory).concat({
            at: editedAt,
            field: 'hungerLevel',
            from: Number.isFinite(previousLevel) ? Math.round(previousLevel) : null,
            to: level
          }).slice(-8),
          editedAt,
          updatedAt: editedAt
        };
      });
      pushEventsUndo('Оценка изменена', previousRows, 'Можно вернуть прошлое значение');
      setEditTarget(null);
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextRefreshSeq((seq) => seq + 1);
    }

    function startBackfillAt(timestamp) {
      if (!Number.isFinite(Number(timestamp))) return;
      const t = Number(timestamp);
      const level = Math.max(1, Math.min(10, Math.round(Number(activeDraft.hungerLevel) || DEFAULT_DRAFT.hungerLevel)));
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setContextPatch({});
      setLowMealReasonResult(null);
      setEditTarget(null);
      setBackfillTarget({ t });
      setDraft({
        ...DEFAULT_DRAFT,
        hungerLevel: level,
        hungerVisual: level,
        _openId: stateOpenId
      });
    }

    function saveBackfillPoint() {
      if (!Number.isFinite(Number(backfillTarget?.t))) return;
      const level = Math.max(1, Math.min(10, Math.round(Number(activeDraft.hungerLevel) || DEFAULT_DRAFT.hungerLevel)));
      const recordedAt = formatLocalDateTime(backfillTarget.t);
      const savedAt = nowIso();
      const previousRows = readEvents();
      addEvent({
        eventType: 'hunger_backfill',
        recordedAt,
        date: localDateKeyFromTs(backfillTarget.t),
        source: 'hunger-spark-backfill',
        hungerLevel: level,
        hungerStatus: HUNGER_STATUS_COPY[level] || null,
        input: {
          now: recordedAt,
          hungerLevel: level,
          hungerTrend: 'unknown',
          safetyFlags: [],
          hungerReasons: safeArray(activeDraft.hungerReasons)
        },
        context: {
          backfilled: true,
          backfilledAt: savedAt,
          backfilledFrom: state.source || 'hunger-fab'
        },
        backfilledAt: savedAt,
        cloudSyncKey: STORAGE_KEY,
        outcome: 'calculated'
      });
      pushEventsUndo('Оценка добавлена', previousRows, 'Можно удалить запись задним числом');
      setBackfillTarget(null);
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextRefreshSeq((seq) => seq + 1);
    }

    function recordLowHungerMealReason(reason) {
      if (!lowHungerMealReview) return;
      const reasonAt = nowIso();
      const advice = getLowHungerMealAdvice(reason, lowHungerMealReview);
      const nextStep = getLowHungerNextStep(reason, lowHungerMealReview);
      const gentlePlan = getLowHungerGentlePlan(reason, lowHungerMealReview, featureSettings);
      const habitPattern = buildLowHungerHabitPattern(reason, lowHungerMealReview);
      const curatorCard = buildLowHungerCuratorCard(reason, lowHungerMealReview, featureSettings);
      const contextOptions = getLowHungerContextOptions(reason);
      const analyticsTags = getLowHungerAnalyticsTags(reason, lowHungerMealReview);
      const suggestionConfidence = getLowHungerSuggestionConfidence(lowHungerMealReview);
      const ritualProfile = getLowHungerRitualProfile(reason, lowHungerMealReview);
      const savedSummary = getLowHungerSavedSummary(reason, lowHungerMealReview);
      const upcomingCue = getLowHungerUpcomingCue(reason, lowHungerMealReview);
      const weeklyDigest = featureSettings.lowHungerWeeklyDigest === false ? null : buildLowHungerWeeklySummary(lowHungerMealReview, reason, featureSettings);
      const curatorWeekFocus = buildLowHungerCuratorWeekFocus(lowHungerMealReview, reason, featureSettings);
      const curatorTag = reason === 'stress_calorie_cue'
        ? 'low_hunger_stress_calorie_cue'
        : lowHungerMealReview.patternStats?.needsPatternWork
          ? 'low_hunger_food_pattern'
          : 'low_hunger_food_context';
      const eventRow = addEvent({
        eventType: 'low_hunger_meal_reason',
        recordedAt: reasonAt,
        date: String(lowHungerMealReview.mealAt || reasonAt).slice(0, 10),
        source: 'hunger-low-meal-review',
        hungerEventId: lowHungerMealReview.hungerEvent?.id || null,
        hungerLevelBeforeMeal: lowHungerMealReview.hungerLevel,
        hungerAt: lowHungerMealReview.hungerAt || null,
        mealAt: lowHungerMealReview.mealAt,
        mealSignature: lowHungerMealReview.mealSignature || null,
        mealAnalysis: lowHungerMealReview.analysis || null,
        patternKey: lowHungerMealReview.analysis?.patternKey || null,
        patternStats: lowHungerMealReview.patternStats || null,
        reasonCategory: lowHungerMealReview.analysis?.category || null,
        reason,
        suggestedReason: lowHungerMealReview.analysis?.suggestedReason || null,
        advice,
        nextStep,
        gentlePlan,
        habitPattern,
        curatorCard,
        suggestionConfidence,
        ritualProfile,
        savedSummary,
        upcomingCue,
        weeklyDigest,
        curatorWeekFocus,
        quietAntiTrigger: gentlePlan.quietCue ? {
          mode: 'inline_only',
          timeBucket: habitPattern.timeBucket,
          patternKey: habitPattern.patternKey
        } : null,
        analyticsTags,
        curatorTag,
        requiresCuratorReview: !!lowHungerMealReview.patternStats?.needsPatternWork,
        cloudSyncKey: STORAGE_KEY,
        outcome: 'user_classified'
      });
      const stressFollowUp = reason === 'stress_calorie_cue'
        ? scheduleStressCalorieFollowUp(eventRow, lowHungerMealReview)
        : null;
      if (stressFollowUp?.id) {
        updateEvent(eventRow.id, {
          stressFollowUp: {
            id: stressFollowUp.id,
            dueAt: stressFollowUp.dueAt,
            status: stressFollowUp.status
          }
        });
      }
      setLowMealReasonResult({
        reason,
        label: LOW_HUNGER_REASON_COPY[reason] || 'Причина отмечена',
        savedSummary,
        advice,
        nextStep,
        gentlePlan,
        habitPattern,
        curatorCard,
        suggestionConfidence,
        ritualProfile,
        upcomingCue,
        weeklyDigest,
        curatorWeekFocus,
        contextOptions,
        stressCalorieLink: habitPattern.stressCalorieLink || null,
        stressFollowUp,
        eventId: eventRow.id,
        contextTag: null
      });
      setContextRefreshSeq((seq) => seq + 1);
    }

    function recordStressCalorieOutcome(outcome) {
      const followUp = state.stressCalorieFollowUp;
      if (!followUp?.id || !outcome) return;
      const outcomeAt = nowIso();
      const label = STRESS_CALORIE_OUTCOME_COPY[outcome] || outcome;
      if (followUp.lowHungerEventId) {
        updateEvent(followUp.lowHungerEventId, (row) => ({
          stressOutcome: {
            outcome,
            label,
            recordedAt: outcomeAt,
            followUpId: followUp.id
          },
          analyticsTags: unique(safeArray(row.analyticsTags).concat('stress_outcome_' + outcome)),
          updatedAt: outcomeAt
        }));
      }
      updateMealEffectFollowUp(followUp.id, {
        status: 'answered',
        answeredAt: outcomeAt,
        answer: outcome
      });
      planNextMealEffectTimer();
      hide();
    }

    function recordLowHungerReviewClose(action, reviewArg) {
      const review = reviewArg || lowHungerMealReview;
      if (!review) return null;
      const recordedAt = nowIso();
      const eventType = action === 'not_now' ? 'low_hunger_meal_deferred' : 'low_hunger_meal_data_fix';
      const reason = action === 'edit_previous_hunger'
        ? 'correct_previous_hunger'
        : action === 'backfill_before_meal'
          ? 'backfill_before_meal'
          : 'not_now';
      return addEvent({
        eventType,
        recordedAt,
        date: String(review.mealAt || recordedAt).slice(0, 10),
        source: 'hunger-low-meal-review',
        hungerEventId: review.hungerEvent?.id || null,
        hungerLevelBeforeMeal: review.hungerLevel,
        hungerAt: review.hungerAt || null,
        mealAt: review.mealAt,
        mealSignature: review.mealSignature || null,
        mealAnalysis: review.analysis || null,
        patternKey: review.analysis?.patternKey || null,
        patternStats: review.patternStats || null,
        reasonCategory: review.analysis?.category || null,
        reason,
        suggestedReason: review.analysis?.suggestedReason || null,
        suggestionConfidence: getLowHungerSuggestionConfidence(review),
        ritualProfile: getLowHungerRitualProfile(review.analysis?.suggestedReason || 'one_off', review),
        analyticsTags: ['low_hunger_before_food', action],
        cloudSyncKey: STORAGE_KEY,
        outcome: action === 'not_now' ? 'user_deferred' : 'user_correcting_hunger'
      });
    }

    function skipLowHungerMealReview() {
      recordLowHungerReviewClose('not_now');
      setLowMealReasonResult(null);
      setContextRefreshSeq((seq) => seq + 1);
      hide();
    }

    function recordLowHungerContextTag(tag) {
      if (!lowMealReasonResult?.eventId || !tag) return;
      const taggedAt = nowIso();
      updateEvent(lowMealReasonResult.eventId, (row) => ({
        lowHungerContextTag: tag,
        lowHungerContextTaggedAt: taggedAt,
        analyticsTags: unique(safeArray(row.analyticsTags).concat('context_' + tag)),
        habitPattern: {
          ...(row.habitPattern || {}),
          contextTag: tag
        },
        updatedAt: taggedAt
      }));
      setLowMealReasonResult((prev) => prev ? { ...prev, contextTag: tag } : prev);
    }

    function recordLowHungerExperimentOutcome(eventId, outcome) {
      if (!eventId || !outcome) return;
      const outcomeAt = nowIso();
      updateEvent(eventId, (row) => ({
        experimentOutcome: outcome,
        experimentOutcomeAt: outcomeAt,
        analyticsTags: unique(safeArray(row.analyticsTags).concat('experiment_' + outcome)),
        updatedAt: outcomeAt
      }));
      setContextRefreshSeq((seq) => seq + 1);
    }

    function editLowHungerSource() {
      const review = lowHungerMealReview;
      if (!review?.hungerEvent?.id) return;
      recordLowHungerReviewClose('edit_previous_hunger', review);
      startEditPoint(review.hungerEvent);
    }

    function backfillBeforeLowHungerMeal() {
      const review = lowHungerMealReview;
      if (!Number.isFinite(Number(review?.suggestedBackfillAt))) return;
      recordLowHungerReviewClose('backfill_before_meal', review);
      startBackfillAt(review.suggestedBackfillAt);
    }

    function launchMealFlowAt(timestamp) {
      if (!Number.isFinite(Number(timestamp))) return;
      const time = formatShortTime(timestamp);
      const dateKey = localDateKeyFromTs(timestamp);
      hide();
      try {
        if (typeof HEYS.App?.setTab === 'function') HEYS.App.setTab('diary');
      } catch (_) {}
      setTimeout(() => {
        const addMeal = HEYS.Day?.addMeal;
        if (typeof addMeal === 'function') {
          addMeal({ time, dateKey, source: 'hunger-spark-long-press' });
        } else {
          HEYS.Toast?.error?.('Дневник ещё не готов. Откройте вкладку дня и попробуйте снова.');
        }
      }, 600);
    }

    function fixHunger() {
      if (hasRequiredInputs) return;
      const finalInput = makeFinalInput();
      const decision = HEYS.HungerEnergyStatus.assessHungerEvent(finalInput, context);
      const drivers = getDisplayDrivers(decision, finalInput, context);
      const log = buildDecisionLog({
        source: state.source || 'hunger-fab',
        input: finalInput,
        context,
        decision,
        drivers
      });
      const previousRows = readEvents();
      const eventRow = addEvent({
        eventType: 'hunger_fixed',
        recordedAt: finalInput.now,
        date: localDateKeyFromTs(selectedAssessmentTime) || String(finalInput.now || nowIso()).slice(0, 10),
        source: state.source || 'hunger-fab',
        hungerLevel: finalInput.hungerLevel,
        hungerStatus: HUNGER_STATUS_COPY[finalInput.hungerLevel] || null,
        input: finalInput,
        context: {
          lastMealAt: context.lastMealAt || null,
          hoursSinceMeal: context.hoursSinceMeal || null,
          todayMealCount: context.todayMealCount || 0,
          noIntakeToday: !!context.noIntakeToday,
          previousHungerLevel: context.previousHungerLevel ?? null,
          previousHungerEventAt: context.previousHungerEventAt || null,
          minutesSinceLastHungerEvent: context.minutesSinceLastHungerEvent ?? null,
          stableHungerPrompt: finalInput.stableHungerPrompt || null,
          stableHungerReasons: safeArray(finalInput.stableHungerReasons),
          sleepQuality: context.sleepQuality || null,
          stressLevel: context.stressLevel || null,
          knownReboundPattern: !!context.knownReboundPattern,
          failedDelayHistory: !!context.failedDelayHistory,
          successfulWaitHistory: !!context.successfulWaitHistory,
          personalHungerModel: context.personalHungerModel || null,
          personalLearningApplied: context.personalLearningApplied || null,
          mealEffectFollowUp: state.mealEffectFollowUp ? {
            id: state.mealEffectFollowUp.id || null,
            mealAt: state.mealEffectFollowUp.mealAt || null,
            dueAt: state.mealEffectFollowUp.dueAt || null,
            answer: finalInput.mealEffectAnswer || null
          } : null,
          lowHungerMealReview: context.lowHungerMealReview ? {
            mealAt: context.lowHungerMealReview.mealAt || null,
            hungerLevel: context.lowHungerMealReview.hungerLevel || null,
            mealAnalysis: context.lowHungerMealReview.analysis || null
          } : null
        },
        decision: compactDecision(decision),
        decisionSnapshot: compactDecision(decision),
        hungerVelocity: log.hungerVelocity,
        mealGapRiskCurve: log.mealGapRiskCurve,
        decisionTrace: log.decisionTrace,
        counterfactuals: log.counterfactuals,
        outcomeLearning: log.outcomeLearning,
        nextBestAction: log.nextBestAction,
        patternCards: log.patternCards,
        outcomePlan: log.outcome,
        followUpAfterMin: decision.recheckAfterMin || null,
        followUpQuestion: getFollowUpQuestion(decision),
        cloudSyncKey: STORAGE_KEY,
        outcome: 'calculated'
      });
      pushEventsUndo('Оценка голода сохранена', previousRows);
      if (state.mealEffectFollowUp?.id) {
        updateMealEffectFollowUp(state.mealEffectFollowUp.id, {
          status: 'answered',
          answeredAt: nowIso(),
          answer: finalInput.mealEffectAnswer || null,
          hungerEventId: eventRow.id
        });
        planNextMealEffectTimer();
      }
      log.eventMeta = {
        id: eventRow.id,
        schemaVersion: eventRow.schemaVersion,
        storageKey: eventRow.storageKey,
        cloudSyncKey: eventRow.cloudSyncKey,
        syncStatus: eventRow.syncStatus,
        clientId: eventRow.clientId,
        recordedAt: eventRow.recordedAt,
        updatedAt: eventRow.updatedAt
      };
      setResult({ input: finalInput, context, decision, drivers, log, eventId: eventRow.id });
      setDetailsOpen(false);
      setCopyDone(false);
    }

    function resetInput() {
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextPatch({});
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setEditTarget(null);
      setBackfillTarget(null);
      setAssessmentTime(Date.now());
      setLowMealReasonResult(null);
    }

    async function copyLog() {
      const text = JSON.stringify(result?.log || {}, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setCopyDone(true);
      } catch (_) {
        setCopyDone(false);
      }
    }

    return h('div', { className: 'hes-backdrop', onClick: () => hide() },
      h('section', {
        className: 'hes-sheet hes-sheet--' + modalMode,
        role: 'dialog',
        'aria-label': 'Осознанность и баланс энергообмена',
        style: {
          '--hes-action-color': actionTone.action,
          '--hes-action-color-deep': actionTone.actionDeep,
          '--hes-action-shadow': actionTone.actionShadow
        },
        onClick: (e) => e.stopPropagation()
      },
        h('header', { className: 'hes-head' },
          h('div', null,
            h('div', { className: 'hes-kicker' }, 'Баланс энергообмена'),
            canShiftAssessmentTime && h('div', { className: 'hes-time-stack' },
              h('span', { className: 'hes-time-value' }, formatShortTime(selectedAssessmentTime)),
              h('button', {
                type: 'button',
                className: 'hes-time-badge',
                onClick: shiftAssessmentTimeBack,
                title: 'Сдвинуть время оценки на 30 минут назад',
                'aria-label': 'Время оценки ' + formatShortTime(selectedAssessmentTime) + '. Сдвинуть на 30 минут назад'
              }, '-30 мин')
            )
          ),
          h('div', { className: 'hes-head__actions' },
            h('label', { className: 'hes-auto-toggle' },
              h('span', { className: 'hes-auto-toggle__text' }, 'При входе'),
              h('input', {
                type: 'checkbox',
                checked: autoOpenEnabled,
                onChange: toggleAutoOpen,
                'aria-label': 'Показывать оценку голода при входе'
              }),
              h('span', { className: 'hes-auto-toggle__switch', 'aria-hidden': 'true' })
            ),
            h('button', {
              className: 'hes-settings-btn',
              type: 'button',
              onClick: () => setSettingsOpen((open) => !open),
              'aria-label': settingsOpen ? 'Закрыть настройки голода' : 'Открыть настройки голода',
              'aria-pressed': settingsOpen
            }, '⚙'),
            h('button', { className: 'hes-close', type: 'button', onClick: () => hide(), 'aria-label': 'Закрыть' }, 'x')
          )
        ),
        settingsOpen ? h(HungerFeatureSettings, {
          settings: featureSettings,
          onToggle: toggleFeatureSetting,
          onSetPromptLimit: setLowHungerPromptLimit,
          onBack: () => setSettingsOpen(false)
        }) : isLowHungerStep ? h('div', { className: 'hes-input hes-input--clarify' },
          isLowHungerClarification ? h(LowHungerMealPrompt, {
            review: lowHungerMealReview,
            settings: featureSettings,
            onReason: recordLowHungerMealReason,
            onEditHunger: editLowHungerSource,
            onBackfill: backfillBeforeLowHungerMeal,
            onExperimentOutcome: recordLowHungerExperimentOutcome,
            onSkip: skipLowHungerMealReview
          }) : h(LowHungerMealResolution, {
            result: lowMealReasonResult,
            onEditHunger: editLowHungerSource,
            onBackfill: backfillBeforeLowHungerMeal,
            onContextTag: recordLowHungerContextTag
          })
        ) : isStressCalorieFollowUp ? h('div', { className: 'hes-input hes-input--clarify' },
          h(StressCalorieOutcomePrompt, {
            followUp: state.stressCalorieFollowUp,
            onOutcome: recordStressCalorieOutcome
          })
        ) : !result ? h('div', { className: 'hes-input' },
          state.mealEffectFollowUp && featureSettings.mealEffectReview && h(MealEffectPrompt, {
            followUp: state.mealEffectFollowUp,
            value: activeDraft.mealEffectAnswer,
            onChange: (value) => patchDraft({ mealEffectAnswer: value })
          }),
          h(HungerSlider, {
            value: activeDraft.hungerVisual ?? activeDraft.hungerLevel,
            changeNote: hungerChangeNote,
            onPreview: (value) => setDraft((prev) => ({
              ...((prev && prev._openId === stateOpenId) ? prev : activeDraft),
              hungerVisual: value,
              _openId: stateOpenId
            })),
            onCommit: (value) => patchDraft({
              hungerVisual: value,
              hungerLevel: Math.max(1, Math.min(10, Math.round(value)))
            }),
            onDragStart: () => setIsDragging(true),
            onDragEnd: () => setIsDragging(false)
          }),
          stableHungerPrompt ? h(StableHungerReasonPrompt, {
            key: promptKey,
            prompt: stableHungerPrompt,
            value: activeDraft.stableHungerReasons,
            onToggle: toggleStableHungerReason
          }) : h(MissingPrompt, {
            key: promptKey,
            missingInputs: requiredInputs,
            onPatch: patchDraft
          }),
          isPastDraft && h('div', { className: 'hes-edit-note' },
            h('strong', null, isBackfillingEvent ? 'Оценка задним числом' : 'Редактируется прошлая точка'),
            h('span', null, isBackfillingEvent ? 'Шаг времени 30 минут' : 'Время записи останется прежним')
          ),
          h(TimelineSpark, {
            date: timelineDate,
            day: timelineDay,
            draft: activeDraft,
            settings: featureSettings,
            hint: lastMealHint,
            editingEventId: editTarget?.id,
            backfillTarget,
            assessmentTime: isPastDraft ? null : selectedAssessmentTime,
            onEditPoint: startEditPoint,
            onBackfillTime: startBackfillAt,
            onAddMealTime: launchMealFlowAt
          }),
          featureSettings.patternInsights && h(PatternInsightCard, { insight: patternInsight })
        ) : null,
        !settingsOpen && result ? h('div', { className: 'hes-result' },
          h('h3', { className: 'hes-result-title' }, 'Рекомендация'),
          h('div', { className: 'hes-verdict' },
            h('div', { className: 'hes-verdict__meta' },
              (hungerChangeNote || lastMealHint) && h('div', { className: 'hes-verdict__context' },
                hungerChangeNote && h('span', null, hungerChangeNote),
                lastMealHint && h('span', null, lastMealHint)
              ),
              h('span', { className: 'hes-confidence' }, result.decision.confidence === 'high' ? 'уверенно' : result.decision.confidence === 'medium' ? 'средняя уверенность' : 'нужно уточнить')
            ),
            h('strong', { className: 'hes-verdict__title' }, getRecommendationTitle(result.decision)),
            h('span', { className: 'hes-verdict__detail' }, getRecommendationDetail(result.decision))
          ),
          result.log?.nextBestAction && !['food', 'plan'].includes(result.log.nextBestAction.type) && h('div', { className: 'hes-next-action' },
            h('span', null, 'Следующий шаг'),
            h('strong', null, result.log.nextBestAction.title),
            h('em', null, result.log.nextBestAction.detail)
          ),
          h('button', {
            type: 'button',
            className: 'hes-details-toggle',
            onClick: () => setDetailsOpen((open) => !open),
            'aria-expanded': detailsOpen
          }, detailsOpen ? 'Скрыть подробности' : 'Подробнее'),
          detailsOpen && h('div', { className: 'hes-details-panel' },
            h('div', { className: 'hes-reasons' },
              h('div', { className: 'hes-reasons__title' }, 'Почему'),
              getRecommendationReasons(result).map((reason) => h('span', { key: reason }, reason))
            ),
            safeArray(result.log?.patternCards).length > 0 && h('div', { className: 'hes-patterns' },
              h('div', { className: 'hes-patterns__title' }, 'Паттерн'),
              safeArray(result.log.patternCards).map((card) => h('div', { key: card.id, className: 'hes-pattern-card' },
                h('strong', null, card.title),
                h('span', null, card.detail)
              ))
            ),
            h('div', { className: 'hes-context' },
              h('div', { className: 'hes-context__title' }, 'Данные'),
              getContextBadges(result).map((badge) => h('span', { key: badge }, badge))
            ),
            h('div', { className: 'hes-debug' },
              h('div', { className: 'hes-debug__top' },
                h('strong', null, 'Технический расчёт'),
                h('button', { type: 'button', onClick: copyLog }, copyDone ? 'Скопировано' : 'Скопировать лог')
              ),
              h(DebugSummary, { result }),
              h('pre', null, JSON.stringify(result.log, null, 2))
            )
          )
        ) : null,
        !settingsOpen && !isLowHungerClarification && h('footer', { className: 'hes-actions' },
          isLowHungerResolved ? h('button', {
            type: 'button',
            className: 'hes-primary',
            onClick: () => hide()
          }, 'Готово') : !result ? (isEditingEvent || isBackfillingEvent ? [
            h('button', {
              key: 'cancel-past',
              type: 'button',
              className: 'hes-secondary',
              onClick: cancelEditPoint
            }, 'Отмена'),
            h('button', {
              key: 'save-past',
              type: 'button',
              className: 'hes-primary',
              onClick: isBackfillingEvent ? saveBackfillPoint : saveEditedPoint
            }, isBackfillingEvent ? 'Сохранить за ' + formatShortTime(backfillTarget.t) : 'Сохранить правку')
          ] : h('button', {
            type: 'button',
            className: 'hes-primary',
            disabled: hasRequiredInputs,
            onClick: fixHunger
          }, hasRequiredInputs ? 'Ответь на уточнение' : 'Зафиксировать голод')) : [
            h('button', {
              key: 'again',
              type: 'button',
              className: 'hes-secondary',
              onClick: resetInput
            }, 'Новая оценка'),
            h('button', {
              key: 'done',
              type: 'button',
              className: 'hes-primary',
              onClick: () => hide()
            }, 'Готово')
          ]
        )
      )
    );
  }

  function ensureStyles() {
    if (document.getElementById('hunger-energy-status-style')) return;
    const style = document.createElement('style');
    style.id = 'hunger-energy-status-style';
    style.textContent = `
.fab-group .hunger-energy-fab{width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:linear-gradient(135deg,#74639a 0%,#5a4e80 100%);color:#fff;box-shadow:0 10px 22px rgba(90,78,128,.18),0 3px 8px rgba(116,99,154,.14),inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;transition:transform .2s cubic-bezier(.34,1.42,.64,1),box-shadow .2s ease;touch-action:manipulation}
.fab-group .hunger-energy-fab .hes-fab-icon{width:28px;height:28px;display:block;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 1px rgba(15,23,42,.18))}
.fab-group .hunger-energy-fab:hover{transform:scale(1.04)}
.fab-group .hunger-energy-fab:active{transform:scale(.94)}
.hes-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.26);display:flex;align-items:flex-end;justify-content:flex-end;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));overscroll-behavior:contain;touch-action:none}
.hes-sheet{width:min(440px,calc(100vw - 24px));max-height:min(720px,calc(100dvh - 28px));overflow:auto;background:rgba(255,255,255,.98);color:#172033;border:1px solid rgba(67,69,135,.14);border-radius:18px;box-shadow:0 24px 64px rgba(15,23,42,.24);animation:hesIn .18s ease-out;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}
.hes-sheet--clarification{overflow:auto}
.hes-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;padding:16px 16px 8px 18px;background:rgba(255,255,255,.98);backdrop-filter:blur(10px)}
	.hes-head>div:first-child{position:relative;min-width:0;flex:1 1 auto;overflow:visible;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-height:44px}
.hes-head__actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.hes-settings-btn{width:44px;height:44px;border:0;border-radius:14px;background:#f1f5f9;color:#434587;font-size:18px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.hes-settings-btn[aria-pressed="true"]{background:#434587;color:#fff;box-shadow:0 8px 18px rgba(67,69,135,.18)}
	.hes-kicker{max-width:100%;font-size:11px;font-weight:800;letter-spacing:.06em;line-height:1.15;text-transform:uppercase;color:#434587}
.hes-time-stack{position:absolute;left:0;top:65px;z-index:3;display:grid;gap:4px;justify-items:start;pointer-events:auto}
.hes-time-value{font-size:14px;font-weight:900;line-height:1;color:#64748b}
.hes-time-badge{min-height:20px;border:1px solid rgba(67,69,135,.12);border-radius:999px;background:rgba(248,251,255,.92);color:#7a86a1;box-shadow:0 8px 18px rgba(15,23,42,.08);backdrop-filter:blur(8px);display:inline-flex;align-items:center;padding:0 7px;font-size:10px;font-weight:850;line-height:1;cursor:pointer;white-space:nowrap}
.hes-time-badge:focus-visible{outline:2px solid rgba(67,69,135,.24);outline-offset:2px}
	.hes-close{width:44px;height:44px;border:0;border-radius:12px;background:#fff1f4;color:#be5267;font-size:20px;cursor:pointer}
.hes-auto-toggle{min-height:36px;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(67,69,135,.12);border-radius:999px;background:#f8fbff;color:#475569;padding:0 8px;cursor:pointer;user-select:none}
.hes-auto-toggle:focus-within{outline:2px solid rgba(67,69,135,.22);outline-offset:2px}
.hes-auto-toggle__text{font-size:11px;font-weight:850;line-height:1;white-space:nowrap}
.hes-auto-toggle input{position:absolute;opacity:0;pointer-events:none}
.hes-auto-toggle__switch{position:relative;width:34px;height:20px;border-radius:999px;background:#dbe3ef;box-shadow:inset 0 0 0 1px rgba(67,69,135,.1);transition:background-color .18s ease}
.hes-auto-toggle__switch::before{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.18);transition:transform .18s ease}
.hes-auto-toggle input:checked+.hes-auto-toggle__switch{background:#434587}
.hes-auto-toggle input:checked+.hes-auto-toggle__switch::before{transform:translateX(14px)}
.hes-slider{min-height:260px;border-radius:14px;background:#f8fbff;border:1px solid rgba(29,112,183,.12);padding:10px;display:grid;grid-template-columns:48px 1fr;grid-template-rows:auto 1fr;gap:8px;align-items:center}
.hes-slider__value{grid-column:1/-1;text-align:center;font-size:32px;font-weight:900;color:#434587;line-height:1}
.hes-slider__range{height:176px;width:44px;writing-mode:vertical-lr;direction:rtl;accent-color:#434587;justify-self:center}
.hes-slider__anchors{display:flex;flex-direction:column;gap:4px}
.hes-slider__anchors button{min-width:44px;min-height:30px;border:1px solid rgba(67,69,135,.18);border-radius:9px;background:#fff;color:#475569;font-weight:800}
.hes-slider__anchors button.is-active{background:#434587;color:#fff}
.hes-confidence{font-size:11px;font-weight:750;color:#64748b;white-space:nowrap}
.hes-drivers{display:flex;flex-wrap:wrap;gap:6px}
.hes-drivers span,.hes-chip{border:1px solid rgba(67,69,135,.14);border-radius:999px;background:#fff;color:#334155;font-size:12px;font-weight:750;padding:7px 10px}
.hes-prompt{border-radius:14px;background:#fff7ed;border:1px solid rgba(234,88,12,.16);padding:12px}
.hes-prompt__title{font-size:13px;font-weight:850;color:#7c2d12;margin-bottom:8px}
.hes-prompt__chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-chip{min-height:44px;cursor:pointer}
.hes-footnote{font-size:12px;line-height:1.35;color:#64748b}
.hes-actions{position:sticky;bottom:0;z-index:2;display:flex;gap:8px;justify-content:flex-end;padding:8px 16px 16px;background:rgba(255,255,255,.98);backdrop-filter:blur(10px)}
.hes-primary,.hes-secondary{min-height:56px;border-radius:13px;padding:0 16px;font-weight:850;cursor:pointer}
.hes-actions .hes-primary,.hes-actions .hes-secondary{min-height:60px;font-size:15px}
.hes-primary{border:0;background:linear-gradient(135deg,var(--hes-action-color,#434587),var(--hes-action-color-deep,#37396f));color:#fff;box-shadow:0 10px 24px var(--hes-action-shadow,rgba(67,69,135,.22))}
.hes-primary:disabled{opacity:.55;cursor:not-allowed}
.hes-secondary{border:1px solid rgba(67,69,135,.18);background:#fff;color:#434587}
body.hunger-energy-modal-open .fab-group{opacity:0;pointer-events:none;transform:translateY(10px) scale(.96)}
[data-theme="dark"] .hes-sheet{background:#111827;color:#f8fafc;border-color:rgba(226,236,242,.16)}
[data-theme="dark"] .hes-head{background:rgba(17,24,39,.98)}
[data-theme="dark"] .hes-actions{background:rgba(17,24,39,.98)}
	[data-theme="dark"] .hes-result-title{color:#f8fafc}
[data-theme="dark"] .hes-time-value{color:#cbd5e1}
[data-theme="dark"] .hes-time-badge{background:rgba(23,32,51,.92);border-color:rgba(226,236,242,.14);color:#94a3b8}
[data-theme="dark"] .hes-close{background:#3a1f2a;color:#f4a3b4}
[data-theme="dark"] .hes-slider,[data-theme="dark"] .hes-chip{background:#1f2937;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-auto-toggle{background:#1f2937;color:#cbd5e1;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-auto-toggle__switch{background:#334155;box-shadow:inset 0 0 0 1px rgba(226,236,242,.12)}
[data-theme="dark"] .hes-auto-toggle input:checked+.hes-auto-toggle__switch{background:#6366f1}
@keyframes hesIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@media (max-width:520px){.hes-backdrop{padding:8px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}.hes-sheet{width:100%;max-height:calc(100dvh - 20px);border-radius:18px 18px 0 0}.hes-sheet--clarification{max-height:calc(100dvh - 20px);overflow:auto}.hes-head{min-height:58px;padding:14px 12px 8px 14px}.hes-slider{grid-template-columns:42px 1fr;min-height:246px}.hes-slider__range{height:162px}.hes-actions{padding:0 12px 12px}.hes-primary,.hes-secondary{flex:1}}
.hes-input{padding:10px 18px 12px;display:flex;flex-direction:column;gap:12px;align-items:stretch}
.hes-input--clarify{padding:10px 18px 18px}
.hes-input .hes-slider{min-height:0;border:0;background:transparent;padding:6px 2px 2px;display:grid;grid-template-columns:1fr 68px 1fr;grid-template-rows:auto auto auto auto;column-gap:0;row-gap:7px;align-items:center;justify-content:center}
.hes-slider__value{grid-column:1/-1;grid-row:1;font-size:58px;font-weight:900;color:#434587;line-height:.92;text-align:center}
.hes-slider__status{grid-column:1/-1;grid-row:2;text-align:center;font-size:15px;font-weight:850;line-height:1.2;color:#475569}
.hes-slider__change{grid-column:1/-1;grid-row:3;justify-self:center;max-width:270px;min-height:38px;box-sizing:border-box;border:1px solid rgba(67,69,135,.1);border-radius:999px;background:rgba(248,251,255,.82);color:#64748b;font-size:11px;font-weight:850;line-height:1.25;text-align:center;padding:5px 9px;display:flex;align-items:center;justify-content:center}
.hes-slider__control{grid-column:2;grid-row:4;position:relative;width:68px;height:205px;justify-self:center;margin-top:18px}
.hes-slider__track{position:absolute;inset:0}
.hes-slider__track::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:4px;transform:translateX(-50%);border-radius:999px;background:rgba(67,69,135,.10)}
.hes-slider__fill{position:absolute;left:0;bottom:0;width:100%;height:var(--hes-fill-px,102px);border-radius:999px;background:linear-gradient(180deg,var(--hes-fill-color-soft,#6b75a4) 0%,var(--hes-fill-color,#434587) 100%)}
.hes-slider__thumb{position:absolute;left:50%;bottom:calc(var(--hes-fill-px,102px) - 23px);width:46px;height:46px;transform:translateX(-50%);border-radius:50%;background:linear-gradient(135deg,var(--hes-fill-color-soft,#6b75a4),var(--hes-fill-color,#434587));border:5px solid #fff;box-shadow:0 8px 22px var(--hes-fill-shadow,rgba(67,69,135,.28))}
.hes-slider__range{position:absolute;left:50%;top:-23px;height:251px;width:68px;transform:translateX(-50%);writing-mode:vertical-lr;direction:rtl;opacity:0;cursor:pointer;touch-action:none}
.hes-prompt{height:112px;min-height:112px;box-sizing:border-box;border-radius:16px;background:#fff7ed;border:1px solid rgba(234,88,12,.16);padding:11px;opacity:1;transition:opacity .22s ease,background-color .22s ease,border-color .22s ease;animation:hesPromptFade .24s ease both}
.hes-prompt.is-empty{opacity:0;background:transparent;border-color:transparent;pointer-events:none}
.hes-prompt.is-visible{opacity:1}
.hes-prompt__title{font-size:14px;font-weight:850;line-height:1.25;color:#7c2d12;margin-bottom:8px}
.hes-chip{min-height:52px;border-radius:14px;font-size:13px}
@keyframes hesPromptFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.hes-low-meal{border:1px solid rgba(67,69,135,.12);border-radius:16px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:9px}
.hes-low-meal__title{font-size:14px;font-weight:900;line-height:1.2;color:#434587}
.hes-low-meal__text{font-size:12px;font-weight:750;line-height:1.35;color:#475569}
.hes-low-meal__why{border-radius:10px;background:#fbfcff;color:#64748b;font-size:11px;font-weight:800;line-height:1.25;padding:7px 9px}
.hes-low-meal__suggestion,.hes-low-meal__repeat{border-radius:12px;background:#f8fbff;color:#475569;font-size:12px;font-weight:850;line-height:1.25;padding:9px 10px}
.hes-low-meal__suggestion{color:#434587;background:#eef6ff}
.hes-low-meal__suggestion strong{display:block;font-size:12px;line-height:1.2;color:inherit}
.hes-low-meal__suggestion span{display:block;margin-top:4px;font-size:11px;line-height:1.25;color:#64748b;font-weight:750}
.hes-low-meal__repeat{background:#fff7ed;color:#7c2d12;border:1px solid rgba(234,88,12,.13)}
.hes-low-meal__actions,.hes-low-meal__chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-low-meal__confirm{border:1px solid rgba(67,69,135,.1);border-radius:14px;background:#fbfcff;padding:10px;display:grid;gap:8px}
.hes-low-meal__confirm>span{font-size:12px;font-weight:850;line-height:1.25;color:#334155}
.hes-low-meal__confirm>div{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-low-meal button{min-height:42px;border:1px solid rgba(67,69,135,.14);border-radius:12px;background:#f8fbff;color:#334155;font-size:12px;font-weight:850;line-height:1.15;padding:8px;cursor:pointer}
.hes-low-meal__actions button{background:#eef6ff;color:#434587}
.hes-low-meal__chips button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.hes-low-meal__chips button.is-suggested,.hes-low-meal__confirm button.is-suggested{background:#434587;color:#fff;border-color:#434587}
.hes-low-meal__chips button span{font-size:10px;font-weight:850;line-height:1;color:inherit;opacity:.82}
.hes-low-meal .hes-low-meal__quiet{min-height:36px;background:transparent;border-color:transparent;color:#64748b;font-size:11px;font-weight:850;padding:4px 8px}
.hes-low-meal .hes-low-meal__quiet:hover{background:#f8fbff;border-color:rgba(67,69,135,.08);color:#434587}
.hes-low-meal__saved{border-radius:12px;background:#eef6ff;color:#434587;font-size:12px;font-weight:850;line-height:1.25;padding:10px}
.hes-low-meal__next{border:1px solid rgba(67,69,135,.12);border-radius:14px;background:#f8fbff;padding:11px 12px;display:grid;gap:4px}
.hes-low-meal__next span{font-size:11px;font-weight:850;color:#64748b}
.hes-low-meal__next strong{font-size:14px;line-height:1.2;color:#172033}
.hes-low-meal__next em{font-style:normal;font-size:12px;line-height:1.3;color:#475569;font-weight:750}
.hes-low-meal__soft{border-radius:14px;background:#fbfcff;border:1px solid rgba(67,69,135,.08);padding:10px 11px;display:grid;gap:4px}
.hes-low-meal__soft strong{font-size:12px;line-height:1.2;color:#434587}
.hes-low-meal__soft span{font-size:12px;line-height:1.3;color:#475569;font-weight:750}
.hes-low-meal__context{border-top:1px solid rgba(67,69,135,.08);padding-top:9px;display:grid;gap:8px}
.hes-low-meal__context>span{font-size:11px;font-weight:850;color:#64748b}
.hes-low-meal__context-chips{display:flex;flex-wrap:wrap;gap:6px}
.hes-low-meal__context-chips button{min-height:34px;border-radius:999px;padding:0 10px;font-size:11px}
.hes-low-meal__context-chips button.is-active{background:#434587;color:#fff;border-color:#434587}
.hes-spark{height:108px;box-sizing:border-box;position:relative;border:1px solid rgba(67,69,135,.12);border-radius:16px;background:#f8fbff;padding:7px 10px 8px}
.hes-spark__svg{display:block;width:100%;height:100%;overflow:visible}
.hes-spark__night{fill:#172033;opacity:.09}
.hes-spark__axis{stroke:#e3ebf6;stroke-width:2;stroke-linecap:round}
.hes-spark__tick line{stroke:#c8d5e6;stroke-width:1;stroke-linecap:round}
.hes-spark__tick text{fill:#94a3b8;font-size:8px;font-weight:800}
.hes-spark__line{fill:none;stroke:#434587;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;opacity:.9}
.hes-spark__forecast-line{fill:none;stroke-width:3;stroke-linecap:round;stroke-dasharray:5 6;opacity:.52}
.hes-spark__forecast-point{fill:#fff;stroke-width:2.2;opacity:.86}
.hes-spark__craving-line{fill:none;stroke:#52a0d8;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:2 5;opacity:.72}
.hes-spark__craving-point{fill:#52a0d8;stroke:#fff;stroke-width:1.8;opacity:.92}
.hes-spark__backfill-hit{fill:transparent;stroke:transparent;pointer-events:all;cursor:crosshair}
.hes-spark__backfill-marker line{stroke:#434587;stroke-width:1.6;stroke-dasharray:4 4;opacity:.54}
.hes-spark__backfill-marker text{fill:#434587;font-size:8px;font-weight:900}
.hes-spark__point{fill:#434587;stroke:#fff;stroke-width:2.4}
.hes-spark__point--preview{fill:#ffffff;stroke:#434587;stroke-width:3}
.hes-spark__point--compact{stroke-width:1.6}
.hes-spark__point--preview.hes-spark__point--compact{stroke-width:1.8}
.hes-spark__point-button{cursor:pointer;outline:none}
.hes-spark__point-button:focus-visible .hes-spark__point{stroke:#172033;stroke-width:3.4}
.hes-spark__point.is-editing{stroke:#434587;stroke-width:3.4}
.hes-spark__point-hit{fill:transparent;stroke:transparent;pointer-events:all}
.hes-spark__meal-marker{pointer-events:none}
.hes-spark__meal-pill{fill:#fde68a;opacity:.7;filter:drop-shadow(0 3px 8px rgba(15,23,42,.08))}
.hes-spark__meal-marker--good .hes-spark__meal-pill{fill:#bbf7d0}
.hes-spark__meal-marker--attention .hes-spark__meal-pill{fill:#fed7aa}
.hes-spark__meal-line{stroke:#f08a74;stroke-width:2;stroke-linecap:round;stroke-dasharray:3 5;opacity:.72}
.hes-spark__meal-marker--good .hes-spark__meal-line{stroke:#38a169}
.hes-spark__meal-marker--moderate .hes-spark__meal-line{stroke:#65a30d}
.hes-spark__meal-marker--mixed .hes-spark__meal-line{stroke:#ca8a04}
.hes-spark__meal-marker--attention .hes-spark__meal-line{stroke:#ea580c}
.hes-spark__legend{position:absolute;left:10px;right:10px;top:7px;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:16px;font-size:10px;font-weight:800;color:#64748b;pointer-events:none}
.hes-spark__legend-items,.hes-spark__hint{display:inline-flex;align-items:center;gap:8px;border-radius:999px;background:rgba(248,251,255,.78);padding:2px 6px;backdrop-filter:blur(6px)}
.hes-spark__legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.hes-spark__legend-dot{width:6px;height:6px;border-radius:999px;display:inline-block}
.hes-spark__legend-dot--hunger{background:#434587}
.hes-spark__legend-dot--craving{background:#52a0d8}
.hes-spark__legend-line{width:10px;height:12px;display:inline-block;position:relative}
.hes-spark__legend-line::before{content:"";position:absolute;left:4px;top:0;bottom:0;border-left:2px dashed #f08a74;border-radius:999px;opacity:.82}
.hes-spark__muted{margin-left:auto;color:#94a3b8;font-weight:750}
.hes-spark__hint{margin-left:auto;max-width:150px;overflow:hidden;text-overflow:ellipsis;color:#64748b;font-size:10px;font-weight:850;line-height:1.2}
.hes-spark__gesture-hint{position:absolute;right:11px;bottom:4px;color:#94a3b8;font-size:8px;font-weight:850;letter-spacing:0;line-height:1;pointer-events:none}
.hes-spark-menu{position:absolute;z-index:3;top:27px;transform:translateX(-50%);min-width:132px;border:1px solid rgba(67,69,135,.14);border-radius:13px;background:rgba(255,255,255,.96);box-shadow:0 12px 28px rgba(15,23,42,.16);padding:6px;display:grid;grid-template-columns:1fr 1fr;gap:5px;backdrop-filter:blur(10px)}
.hes-spark-menu__time{grid-column:1/-1;text-align:center;color:#64748b;font-size:10px;font-weight:850;line-height:1.1}
.hes-spark-menu button{min-height:34px;border:1px solid rgba(67,69,135,.12);border-radius:10px;background:#f8fbff;color:#434587;font-size:11px;font-weight:850;cursor:pointer}
.hes-edit-note{border:1px solid rgba(67,69,135,.1);border-radius:14px;background:#f8fbff;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#64748b;font-size:11px;font-weight:800;line-height:1.25}
.hes-edit-note strong{color:#434587;font-size:12px}
.hes-edit-note span{text-align:right}
.hes-reason-presets,.hes-meal-effect{border:1px solid rgba(67,69,135,.1);border-radius:14px;background:#f8fbff;padding:9px 11px;display:flex;flex-direction:column;gap:8px;color:#475569}
.hes-reason-presets__title,.hes-meal-effect strong{font-size:12px;font-weight:900;color:#172033;line-height:1.2}
.hes-reason-presets__note{font-size:11px;font-weight:800;line-height:1.25;color:#64748b}
.hes-reason-presets__chips,.hes-meal-effect__choices{display:flex;flex-wrap:wrap;gap:6px}
.hes-reason-chip,.hes-meal-effect__chip{min-height:30px;border:1px solid rgba(67,69,135,.12);border-radius:999px;background:#fff;color:#64748b;padding:0 10px;font-size:11px;font-weight:850;cursor:pointer}
.hes-reason-chip.is-selected,.hes-meal-effect__chip.is-selected{background:#434587;color:#fff;border-color:#434587;box-shadow:0 6px 14px rgba(67,69,135,.16)}
.hes-meal-effect{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
.hes-meal-effect>div:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.hes-meal-effect span{font-size:11px;font-weight:800;color:#64748b;line-height:1.2}
.hes-pattern-insight{box-sizing:border-box;border:1px solid rgba(67,69,135,.1);border-radius:14px;background:#fbfcff;padding:10px 12px 14px;display:grid;gap:3px;color:#475569;max-height:112px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.hes-pattern-insight span{font-size:11px;font-weight:900;color:#64748b}
.hes-pattern-insight strong{font-size:13px;line-height:1.2;color:#172033}
.hes-pattern-insight em{font-style:normal;font-size:12px;font-weight:750;line-height:1.3;color:#64748b}
.hes-settings{padding:10px 18px 132px;display:flex;flex-direction:column;gap:10px}
.hes-settings__top{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(67,69,135,.1);border-radius:16px;background:#f8fbff;padding:12px}
.hes-settings__top>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.hes-settings__top strong{font-size:16px;line-height:1.15;color:#172033}
.hes-settings__top span{font-size:12px;font-weight:800;line-height:1.25;color:#64748b}
.hes-settings__top button{min-height:38px;border:0;border-radius:12px;background:#434587;color:#fff;font-size:12px;font-weight:900;padding:0 13px;cursor:pointer}
.hes-limit-row{border:1px solid rgba(67,69,135,.1);border-radius:16px;background:#fff;padding:12px;display:grid;gap:10px}
.hes-limit-row__copy{display:flex;flex-direction:column;gap:4px}
.hes-limit-row__copy strong{font-size:14px;line-height:1.16;color:#172033}
.hes-limit-row__copy em{font-style:normal;font-size:12px;line-height:1.25;color:#64748b;font-weight:750}
.hes-limit-row__options{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}
.hes-limit-row__options button{min-height:38px;border:1px solid rgba(67,69,135,.14);border-radius:12px;background:#f8fbff;color:#334155;font-size:13px;font-weight:900;cursor:pointer}
.hes-limit-row__options button.is-active{background:#434587;color:#fff;border-color:#434587}
.hes-feature-row{position:relative;min-height:82px;border:1px solid rgba(67,69,135,.1);border-radius:16px;background:#fff;padding:11px 12px;display:grid;grid-template-columns:64px 1fr auto;align-items:center;gap:11px;cursor:pointer;overflow:hidden}
.hes-feature-row input{position:absolute;opacity:0;pointer-events:none}
.hes-feature-row__rail{width:58px;height:12px;border-radius:999px;background:#e5edf7;position:relative;box-shadow:inset 0 0 0 1px rgba(67,69,135,.06)}
.hes-feature-row__rail i{position:absolute;left:0;top:0;bottom:0;width:34%;border-radius:999px;background:#94a3b8;transition:width .18s ease,background .18s ease}
.hes-feature-row.is-on .hes-feature-row__rail i{width:100%;background:linear-gradient(90deg,#52a0d8,#434587)}
.hes-feature-row__copy{min-width:0;display:flex;flex-direction:column;gap:4px}
.hes-feature-row__copy strong{font-size:14px;line-height:1.16;color:#172033}
.hes-feature-row__copy em{font-style:normal;font-size:12px;line-height:1.25;color:#64748b;font-weight:750}
.hes-feature-row__state{border-radius:999px;background:#f1f5f9;color:#64748b;font-size:10px;font-weight:900;padding:5px 7px;text-transform:uppercase}
.hes-feature-row.is-on .hes-feature-row__state{background:#eef6ff;color:#434587}
	.hes-result{padding:10px 18px 132px;display:flex;flex-direction:column;gap:10px}
	.hes-result-title{margin:1px 0 2px;font-size:17px;line-height:1.16;font-weight:750;color:#172033;letter-spacing:0}
	.hes-verdict{border-radius:16px;background:#eef6ff;border:1px solid rgba(29,112,183,.14);padding:16px;display:flex;flex-direction:column;gap:9px}
	.hes-verdict__meta{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-height:20px}
	.hes-verdict__context{min-width:0;display:flex;flex-direction:column;gap:3px;color:#64748b;font-size:12px;font-weight:850;line-height:1.25}
	.hes-verdict__context span{display:block}
	.hes-verdict .hes-confidence{border:1px solid rgba(67,69,135,.12);border-radius:999px;background:rgba(255,255,255,.72);padding:4px 8px}
	.hes-verdict__title{font-size:22px;line-height:1.12;color:#172033}
	.hes-verdict__detail{font-size:15px;line-height:1.35;color:#475569;font-weight:750}
	.hes-next-action{position:relative;border:1px solid rgba(67,69,135,.12);border-radius:16px;background:#fff;padding:13px 14px 13px 17px;display:grid;gap:4px;overflow:hidden}
	.hes-next-action::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:4px;border-radius:999px;background:#434587}
	.hes-next-action span{font-size:12px;font-weight:850;color:#64748b}
	.hes-next-action strong{font-size:16px;line-height:1.2;color:#172033}
	.hes-next-action em{font-style:normal;font-size:13px;line-height:1.3;color:#475569;font-weight:750}
.hes-reasons{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:12px;display:flex;flex-wrap:wrap;gap:8px}
.hes-reasons__title{width:100%;font-size:12px;font-weight:850;color:#64748b}
.hes-reasons span{border:1px solid rgba(67,69,135,.12);border-radius:999px;background:#f8fafc;color:#334155;font-size:12px;font-weight:800;padding:7px 10px}
.hes-patterns{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-patterns__title{grid-column:1/-1;font-size:12px;font-weight:850;color:#64748b}
.hes-pattern-card{border-radius:12px;background:#f8fbff;border:1px solid rgba(29,112,183,.1);padding:9px;display:grid;gap:3px;min-width:0}
.hes-pattern-card strong{font-size:13px;line-height:1.15;color:#172033}
.hes-pattern-card span{font-size:11px;line-height:1.25;color:#64748b;font-weight:750}
.hes-context{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:10px 12px;display:flex;flex-wrap:wrap;gap:7px}
.hes-context__title{width:100%;font-size:12px;font-weight:850;color:#64748b}
.hes-context span{border-radius:999px;background:#eef6ff;color:#475569;font-size:11px;font-weight:800;padding:6px 9px}
	.hes-details-toggle{min-height:44px;border:1px solid rgba(67,69,135,.14);border-radius:12px;background:#fff;color:#434587;font-weight:850;cursor:pointer}
	.hes-details-toggle[aria-expanded="true"]{background:#f8fbff;border-color:rgba(67,69,135,.2)}
	.hes-details-panel{border:1px solid rgba(67,69,135,.1);border-radius:16px;background:#fbfcff;padding:10px;display:flex;flex-direction:column;gap:10px}
	.hes-details-panel>.hes-reasons,.hes-details-panel>.hes-context,.hes-details-panel>.hes-patterns{border:0;background:transparent;border-radius:0;padding:2px;box-shadow:none}
	.hes-details-panel>.hes-patterns{grid-template-columns:1fr}
	.hes-debug{border:1px solid rgba(15,23,42,.1);border-radius:14px;background:#f8fafc;overflow:hidden;margin-bottom:18px}
.hes-debug__top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(15,23,42,.08)}
.hes-debug__top strong{font-size:13px;line-height:1.2}
.hes-debug__top button{min-height:32px;border:0;border-radius:10px;background:#434587;color:#fff;font-weight:800;font-size:12px;padding:0 10px;white-space:nowrap}
.hes-debug-summary{padding:12px;border-bottom:1px solid rgba(15,23,42,.08);display:flex;flex-direction:column;gap:10px}
.hes-debug-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-debug-grid>div{border:1px solid rgba(67,69,135,.1);border-radius:12px;background:#fff;padding:9px}
.hes-debug-grid span,.hes-debug-list__title{display:block;font-size:11px;font-weight:850;color:#64748b;margin-bottom:4px}
.hes-debug-grid strong{display:block;font-size:13px;color:#172033}
.hes-debug-list{display:flex;flex-direction:column;gap:6px}
.hes-debug-row{display:flex;justify-content:space-between;gap:10px;align-items:center;border-radius:10px;background:#fff;padding:8px 9px;font-size:11px;color:#475569}
.hes-debug-row strong{font-size:11px;color:#172033;white-space:nowrap}
.hes-debug pre{margin:0;padding:12px 12px 72px;max-height:220px;overflow:auto;font-size:11px;line-height:1.45;white-space:pre-wrap;color:#172033}
[data-theme="dark"] .hes-debug{background:#0f172a;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-debug pre{color:#e5e7eb}
[data-theme="dark"] .hes-debug-grid>div,[data-theme="dark"] .hes-debug-row{background:#111827;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-debug-grid strong,[data-theme="dark"] .hes-debug-row strong{color:#f8fafc}
[data-theme="dark"] .hes-details-toggle{background:#1f2937;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-settings-btn{background:#172033;color:#c7d2fe}
[data-theme="dark"] .hes-settings-btn[aria-pressed="true"]{background:#c7d2fe;color:#172033}
[data-theme="dark"] .hes-verdict{background:#172033;border-color:rgba(82,160,216,.2)}
[data-theme="dark"] .hes-verdict__title{color:#f8fafc}
[data-theme="dark"] .hes-next-action,[data-theme="dark"] .hes-patterns{background:#1f2937;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-next-action strong,[data-theme="dark"] .hes-pattern-card strong{color:#f8fafc}
[data-theme="dark"] .hes-pattern-card{background:#111827;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-reasons{background:#1f2937;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-reasons span{background:#111827;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
	[data-theme="dark"] .hes-context{background:#1f2937;border-color:rgba(226,236,242,.14)}
	[data-theme="dark"] .hes-context span{background:#111827;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-spark{background:#172033;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-spark__axis{stroke:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-spark__night{fill:#020617;opacity:.26}
[data-theme="dark"] .hes-spark__tick line{stroke:rgba(226,236,242,.18)}
[data-theme="dark"] .hes-spark__tick text{fill:#94a3b8}
[data-theme="dark"] .hes-spark__backfill-marker line{stroke:#c7d2fe}
[data-theme="dark"] .hes-spark__backfill-marker text{fill:#c7d2fe}
[data-theme="dark"] .hes-spark__forecast-point{fill:#172033}
[data-theme="dark"] .hes-spark__point-button:focus-visible .hes-spark__point{stroke:#f8fafc}
[data-theme="dark"] .hes-slider__track::before{background:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-slider__change,[data-theme="dark"] .hes-context-summary{background:#172033;color:#cbd5e1;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-low-meal{background:#1f2937;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-low-meal__title{color:#c7d2fe}
[data-theme="dark"] .hes-low-meal__text{color:#cbd5e1}
[data-theme="dark"] .hes-low-meal__why{background:#111827;color:#94a3b8}
[data-theme="dark"] .hes-low-meal__suggestion,[data-theme="dark"] .hes-low-meal__next{background:#172033;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-low-meal__suggestion span{color:#cbd5e1}
[data-theme="dark"] .hes-low-meal__repeat{background:#2b1d16;color:#fed7aa;border-color:rgba(251,146,60,.2)}
[data-theme="dark"] .hes-low-meal__confirm{background:#111827;border-color:rgba(226,236,242,.1)}
[data-theme="dark"] .hes-low-meal__confirm>span{color:#cbd5e1}
[data-theme="dark"] .hes-low-meal button{background:#111827;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-low-meal__actions button{background:#172033;color:#c7d2fe}
[data-theme="dark"] .hes-low-meal__chips button.is-suggested,[data-theme="dark"] .hes-low-meal__confirm button.is-suggested{background:#6366f1;color:#fff;border-color:#6366f1}
[data-theme="dark"] .hes-low-meal .hes-low-meal__quiet{background:transparent;color:#94a3b8;border-color:transparent}
[data-theme="dark"] .hes-low-meal .hes-low-meal__quiet:hover{background:#172033;color:#c7d2fe;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-low-meal__saved{background:#172033;color:#c7d2fe}
[data-theme="dark"] .hes-low-meal__next strong{color:#f8fafc}
[data-theme="dark"] .hes-low-meal__next em{color:#cbd5e1}
[data-theme="dark"] .hes-low-meal__soft{background:#111827;border-color:rgba(226,236,242,.1)}
[data-theme="dark"] .hes-low-meal__soft span{color:#cbd5e1}
[data-theme="dark"] .hes-low-meal__context{border-color:rgba(226,236,242,.1)}
[data-theme="dark"] .hes-low-meal__context-chips button.is-active{background:#6366f1;color:#fff;border-color:#6366f1}
[data-theme="dark"] .hes-spark__hint{background:rgba(17,24,39,.82);color:#cbd5e1}
[data-theme="dark"] .hes-spark-menu{background:rgba(17,24,39,.96);border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-spark-menu button{background:#172033;color:#c7d2fe;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-edit-note{background:#172033;border-color:rgba(226,236,242,.12);color:#cbd5e1}
[data-theme="dark"] .hes-edit-note strong{color:#c7d2fe}
[data-theme="dark"] .hes-reason-presets,[data-theme="dark"] .hes-meal-effect{background:#172033;border-color:rgba(226,236,242,.12);color:#cbd5e1}
[data-theme="dark"] .hes-reason-presets__title,[data-theme="dark"] .hes-meal-effect strong{color:#f8fafc}
[data-theme="dark"] .hes-reason-presets__note{color:#94a3b8}
[data-theme="dark"] .hes-reason-chip,[data-theme="dark"] .hes-meal-effect__chip{background:#111827;color:#cbd5e1;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-reason-chip.is-selected,[data-theme="dark"] .hes-meal-effect__chip.is-selected{background:#c7d2fe;color:#172033;border-color:#c7d2fe}
[data-theme="dark"] .hes-pattern-insight,[data-theme="dark"] .hes-settings__top,[data-theme="dark"] .hes-feature-row,[data-theme="dark"] .hes-limit-row{background:#172033;border-color:rgba(226,236,242,.12);color:#cbd5e1}
[data-theme="dark"] .hes-pattern-insight strong,[data-theme="dark"] .hes-settings__top strong,[data-theme="dark"] .hes-feature-row__copy strong,[data-theme="dark"] .hes-limit-row__copy strong{color:#f8fafc}
[data-theme="dark"] .hes-pattern-insight em,[data-theme="dark"] .hes-settings__top span,[data-theme="dark"] .hes-feature-row__copy em,[data-theme="dark"] .hes-limit-row__copy em{color:#cbd5e1}
[data-theme="dark"] .hes-limit-row__options button{background:#111827;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-limit-row__options button.is-active{background:#6366f1;color:#fff;border-color:#6366f1}
[data-theme="dark"] .hes-feature-row__rail{background:#111827;box-shadow:inset 0 0 0 1px rgba(226,236,242,.12)}
[data-theme="dark"] .hes-feature-row__state{background:#111827;color:#94a3b8}
[data-theme="dark"] .hes-feature-row.is-on .hes-feature-row__state{background:#1f2937;color:#c7d2fe}
@keyframes hesFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:520px){.hes-input{padding:8px 14px 8px}.hes-result{padding:8px 14px 132px}.hes-input .hes-slider{grid-template-columns:1fr 68px 1fr}.hes-pattern-insight{max-height:92px}.hes-actions{padding:0 14px 14px}}
`;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    if (!React || !ReactDOM || !h) return false;
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'hunger-energy-status-modal-root';
      document.body.appendChild(modalRoot);
    }
    if (!modalRootInstance) {
      modalRootInstance = ReactDOM.createRoot(modalRoot);
      modalRootInstance.render(h(ModalShell));
    }
    ensureStyles();
    return true;
  }

  function show(options) {
    const clientId = HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId || '';
    if (!clientId) return false;
    const modalOptions = { ...(options || {}) };
    const dayForPassiveContext = resolveDayData(modalOptions);
    const passiveDate = modalOptions.date || dayForPassiveContext.date || todayKey();
    const passiveReview = buildLowHungerMealReview(passiveDate, dayForPassiveContext, { includePassive: true, settings: readHungerFeatureSettings() });
    if (passiveReview?.passiveContext) recordPassiveLowHungerContext(passiveReview);
    const seededOptions = {
      ...modalOptions,
      _openId: ++modalOpenSeq,
      _initialDraft: getInitialDraftForState(modalOptions)
    };
    if (!ensureRoot()) return false;
    if (HEYS.ModalManager) modalCleanup = HEYS.ModalManager.register('hunger-energy-status-modal', () => hide(true));
    const apply = () => {
      if (setModalState) setModalState(seededOptions);
      else setTimeout(apply, 16);
    };
    apply();
    return true;
  }

  function hide(skipManagerNotify) {
    if (modalCleanup && !skipManagerNotify) {
      modalCleanup();
      modalCleanup = null;
    }
    if (setModalState) setModalState(null);
  }

  function renderFabIcon() {
    return h('svg', {
      className: 'hes-fab-icon',
      viewBox: '0 0 24 24',
      focusable: 'false',
      'aria-hidden': 'true'
    },
      h('circle', { cx: 12, cy: 12, r: 8.2 }),
      h('path', { d: 'M8.4 12h7.2' })
    );
  }

  function FabButton({ className = 'hunger-energy-fab', context = {}, ariaLabel = 'Открыть оценку голода' }) {
    return h('button', {
      className,
      type: 'button',
      onClick: () => show({ ...context, source: context.source || 'hunger-fab' }),
      'aria-label': ariaLabel
    }, renderFabIcon());
  }

  HEYS.HungerEnergyStatusStorage = {
    readEvents,
    writeEvents,
    addEvent,
    updateEvent,
    buildHistorySignals
  };

  HEYS.HungerEnergyStatusAdapter = {
    buildContextFromDay,
    buildSparkTimeline,
    analyzeMealForLowHungerReview,
    buildMealMarkerQuality,
    buildStableHungerPrompt,
    buildLowHungerMealReview,
    getLowHungerAnalyticsTags,
    getLowHungerSuggestionConfidence,
    getLowHungerRitualProfile,
    getLowHungerSavedSummary,
    getLowHungerUpcomingCue,
    getStressCalorieChoice,
    buildStressCalorieLink,
    buildLowHungerCuratorCard,
    buildLowHungerCuratorWeekFocus,
    buildLowHungerExperimentFollowUp,
    getLowHungerGentlePlan,
    getLowHungerNextStep,
    buildLowHungerHabitPattern,
    readHungerFeatureSettings,
    writeHungerFeatureSettings,
    snapSparkTimestamp,
    sparkTimeFromX,
    compactDecision
  };

  HEYS.HungerEnergyStatusModal = {
    show,
    hide,
    close: hide,
    FabButton,
    isAutoOpenEnabled: readAutoOpenEnabled,
    setAutoOpenEnabled: writeAutoOpenEnabled,
    getFeatureSettings: readHungerFeatureSettings,
    setFeatureSettings: writeHungerFeatureSettings,
    scheduleAutoOpen
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { ensureRoot(); ensureStyles(); installAutoOpen(); installMealEffectFollowUps(); });
    } else {
      setTimeout(() => { ensureRoot(); ensureStyles(); installAutoOpen(); installMealEffectFollowUps(); }, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
